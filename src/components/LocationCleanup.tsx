
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, MapPin, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LocationCleanup = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get locations created today
  const { data: recentLocations, isLoading } = useQuery({
    queryKey: ['recent-locations'],
    queryFn: async () => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      console.log('Fetching locations created between:', startOfDay.toISOString(), 'and', endOfDay.toISOString());
      
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching recent locations:', error);
        throw error;
      }
      
      console.log('Found recent locations:', data);
      return data;
    }
  });

  // Get all locations with digits in their names
  const { data: numericLocations, isLoading: isLoadingNumeric } = useQuery({
    queryKey: ['numeric-locations'],
    queryFn: async () => {
      console.log('Fetching locations with numeric names...');
      
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching locations:', error);
        throw error;
      }
      
      // Filter locations that have digits in their names
      const locationsWithDigits = data?.filter(location => 
        /\d/.test(location.name)
      ) || [];
      
      console.log('Found locations with digits:', locationsWithDigits);
      return locationsWithDigits;
    }
  });

  const deleteRecentLocationsMutation = useMutation({
    mutationFn: async () => {
      if (!recentLocations || recentLocations.length === 0) {
        throw new Error('No recent locations to delete');
      }

      const locationIds = recentLocations.map(loc => loc.id);
      console.log('Deleting locations with IDs:', locationIds);
      
      // First delete any agent assignments for these locations
      const { error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .delete()
        .in('location_id', locationIds);

      if (assignmentError) {
        console.error('Error deleting assignments:', assignmentError);
        throw assignmentError;
      }

      // Then delete any transactions for these locations
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .in('account_id', recentLocations.map(loc => loc.account_id).filter(Boolean));

      if (transactionError) {
        console.error('Error deleting transactions:', transactionError);
        // Don't throw here, just log as some locations might not have transactions
      }

      // Finally delete the locations
      const { error: locationError } = await supabase
        .from('locations')
        .delete()
        .in('id', locationIds);

      if (locationError) {
        console.error('Error deleting locations:', locationError);
        throw locationError;
      }

      console.log('Successfully deleted', recentLocations.length, 'locations');
      return recentLocations.length;
    },
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['recent-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['agents-data'] });
      toast({
        title: "Locations Deleted",
        description: `Successfully deleted ${deletedCount} recent locations and their assignments.`,
      });
    },
    onError: (error) => {
      console.error('Delete mutation error:', error);
      toast({
        title: "Delete Failed",
        description: `Error deleting locations: ${error.message || String(error)}`,
        variant: "destructive"
      });
    }
  });

  const deleteNumericLocationsMutation = useMutation({
    mutationFn: async () => {
      if (!numericLocations || numericLocations.length === 0) {
        throw new Error('No numeric locations to delete');
      }

      const locationIds = numericLocations.map(loc => loc.id);
      console.log('Deleting numeric locations with IDs:', locationIds);
      
      // Try to delete in smaller batches to avoid connection issues
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        batches.push(locationIds.slice(i, i + batchSize));
      }

      let totalDeleted = 0;

      for (const batch of batches) {
        console.log(`Processing batch of ${batch.length} locations...`);
        
        try {
          // Delete agent assignments for this batch
          const { error: assignmentError } = await supabase
            .from('location_agent_assignments')
            .delete()
            .in('location_id', batch);

          if (assignmentError) {
            console.error('Error deleting assignments for batch:', assignmentError);
            // Continue with location deletion even if assignments fail
          }

          // Delete transactions for this batch - get account_ids first
          const batchLocations = numericLocations.filter(loc => batch.includes(loc.id));
          const accountIds = batchLocations.map(loc => loc.account_id).filter(Boolean);
          
          if (accountIds.length > 0) {
            const { error: transactionError } = await supabase
              .from('transactions')
              .delete()
              .in('account_id', accountIds);

            if (transactionError) {
              console.error('Error deleting transactions for batch:', transactionError);
              // Continue even if transaction deletion fails
            }
          }

          // Delete the locations in this batch
          const { error: locationError } = await supabase
            .from('locations')
            .delete()
            .in('id', batch);

          if (locationError) {
            console.error('Error deleting locations for batch:', locationError);
            throw locationError;
          }

          totalDeleted += batch.length;
          console.log(`Successfully deleted batch. Total deleted so far: ${totalDeleted}`);

          // Small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Failed to delete batch:`, error);
          throw new Error(`Failed to delete batch after ${totalDeleted} successful deletions: ${error.message}`);
        }
      }

      console.log('Successfully deleted all', totalDeleted, 'numeric locations');
      return totalDeleted;
    },
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['recent-locations'] });
      queryClient.invalidateQueries({ queryKey: ['numeric-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['agents-data'] });
      toast({
        title: "Numeric Locations Deleted",
        description: `Successfully deleted ${deletedCount} locations with numeric names and their assignments.`,
      });
    },
    onError: (error) => {
      console.error('Delete numeric locations error:', error);
      toast({
        title: "Delete Failed",
        description: `Error deleting numeric locations: ${error.message || String(error)}`,
        variant: "destructive"
      });
    }
  });

  if (isLoading || isLoadingNumeric) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading locations...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Recent Location Cleanup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Locations created today: {recentLocations?.length || 0}
            </p>
            
            {recentLocations && recentLocations.length > 0 ? (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium">Recent locations to be deleted:</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {recentLocations.slice(0, 10).map((location) => (
                    <div key={location.id} className="text-xs text-muted-foreground">
                      • {location.name} ({location.account_id || 'No Account ID'})
                    </div>
                  ))}
                  {recentLocations.length > 10 && (
                    <div className="text-xs text-muted-foreground">
                      ...and {recentLocations.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">
                No locations created today.
              </p>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={!recentLocations || recentLocations.length === 0 || deleteRecentLocationsMutation.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteRecentLocationsMutation.isPending ? 'Deleting...' : 'Delete All Recent Locations'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Recent Locations</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete all {recentLocations?.length || 0} locations created today? 
                    This will also remove any agent assignments and related transaction data for these locations. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteRecentLocationsMutation.mutate()}
                    disabled={deleteRecentLocationsMutation.isPending}
                  >
                    {deleteRecentLocationsMutation.isPending ? 'Deleting...' : 'Delete All'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete All Numeric Locations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Locations with digits in their names: {numericLocations?.length || 0}
            </p>
            
            {numericLocations && numericLocations.length > 0 ? (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium text-red-700">Numeric locations to be deleted:</p>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-red-50 p-3 rounded border border-red-200">
                  {numericLocations.slice(0, 20).map((location) => (
                    <div key={location.id} className="text-xs text-red-700">
                      • {location.name} ({location.account_id || 'No Account ID'})
                    </div>
                  ))}
                  {numericLocations.length > 20 && (
                    <div className="text-xs text-red-700">
                      ...and {numericLocations.length - 20} more
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-600 mb-4">
                ✅ No locations with numeric names found.
              </p>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={!numericLocations || numericLocations.length === 0 || deleteNumericLocationsMutation.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteNumericLocationsMutation.isPending ? 'Deleting...' : `Delete All ${numericLocations?.length || 0} Numeric Locations`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete All Numeric Locations</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete all {numericLocations?.length || 0} locations that have digits in their names? 
                    This will permanently remove all locations like "100336", "12345", etc. and their associated agent assignments and transaction data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteNumericLocationsMutation.mutate()}
                    disabled={deleteNumericLocationsMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleteNumericLocationsMutation.isPending ? 'Deleting...' : 'Delete All Numeric Locations'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationCleanup;
