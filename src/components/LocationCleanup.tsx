
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, MapPin } from "lucide-react";
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
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .gte('created_at', `${today}T00:00:00.000Z`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const deleteRecentLocationsMutation = useMutation({
    mutationFn: async () => {
      if (!recentLocations || recentLocations.length === 0) {
        throw new Error('No recent locations to delete');
      }

      const locationIds = recentLocations.map(loc => loc.id);
      
      // First delete any agent assignments for these locations
      const { error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .delete()
        .in('location_id', locationIds);

      if (assignmentError) throw assignmentError;

      // Then delete the locations
      const { error: locationError } = await supabase
        .from('locations')
        .delete()
        .in('id', locationIds);

      if (locationError) throw locationError;

      return recentLocations.length;
    },
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['recent-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      toast({
        title: "Locations Deleted",
        description: `Successfully deleted ${deletedCount} recent locations and their assignments.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: `Error deleting locations: ${String(error)}`,
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading recent locations...</p>
        </CardContent>
      </Card>
    );
  }

  return (
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
                    • {location.name} ({location.account_id})
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
                disabled={!recentLocations || recentLocations.length === 0}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete All Recent Locations
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Recent Locations</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete all {recentLocations?.length || 0} locations created today? 
                  This will also remove any agent assignments for these locations. This action cannot be undone.
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
  );
};

export default LocationCleanup;
