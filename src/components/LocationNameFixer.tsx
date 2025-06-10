
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RefreshCw, CheckCircle, AlertCircle, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LocationUpdate {
  id: string;
  currentName: string;
  accountId: string;
  suggestedName: string;
}

const LocationNameFixer = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [locationUpdates, setLocationUpdates] = useState<LocationUpdate[]>([]);

  // Get locations with numeric names
  const { data: numericLocations, isLoading: locationsLoading } = useQuery({
    queryKey: ['numeric-locations'],
    queryFn: async () => {
      console.log('Fetching locations with numeric names...');
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching locations:', error);
        throw error;
      }

      // Filter locations that have purely numeric names
      const numericLocs = data.filter(location => {
        const isNumeric = /^\d+$/.test(location.name.trim());
        if (isNumeric) {
          console.log('Found numeric location:', location.name, 'Account ID:', location.account_id);
        }
        return isNumeric;
      });

      console.log('Found', numericLocs.length, 'locations with numeric names');
      return numericLocs;
    }
  });

  // Analyze and find proper DBA names
  const analyzeNamesMutation = useMutation({
    mutationFn: async () => {
      if (!numericLocations || numericLocations.length === 0) {
        throw new Error('No numeric locations found to analyze');
      }

      console.log('=== Starting Location Name Analysis ===');
      const updates: LocationUpdate[] = [];

      // Get all transaction data to find DBA names
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('account_id, raw_data')
        .not('raw_data', 'is', null);

      if (transError) {
        console.error('Error fetching transactions:', transError);
        throw transError;
      }

      console.log('Analyzing', transactions.length, 'transactions for DBA names...');

      for (const location of numericLocations) {
        console.log(`\n--- Analyzing location: ${location.name} (Account: ${location.account_id}) ---`);
        
        // Find transactions that match this location's account ID
        const matchingTransactions = transactions.filter(t => 
          t.account_id === location.account_id || 
          (t.raw_data && JSON.stringify(t.raw_data).includes(location.account_id || ''))
        );

        console.log('Found', matchingTransactions.length, 'matching transactions');

        let suggestedName = null;

        // Search through transaction raw_data for DBA names
        for (const transaction of matchingTransactions) {
          if (transaction.raw_data && typeof transaction.raw_data === 'object') {
            const rawData = transaction.raw_data;
            
            // Look for DBA-related fields in the raw data
            const dbaFields = ['DBA Name', 'dba name', 'DBA', 'dba', 'dba_name', 'business_name', 'merchant_name'];
            
            for (const field of dbaFields) {
              if (rawData[field] && typeof rawData[field] === 'string') {
                const value = String(rawData[field]).trim();
                
                // Validate that this is a proper business name (not numeric)
                if (value.length > 2 && 
                    !/^\d+$/.test(value) && 
                    /[a-zA-Z]/.test(value) &&
                    !value.toLowerCase().includes('account') &&
                    !value.toLowerCase().includes('merchant id')) {
                  
                  suggestedName = value;
                  console.log('✅ Found valid DBA name:', suggestedName, 'in field:', field);
                  break;
                }
              }
            }
            
            if (suggestedName) break;
          }
        }

        if (suggestedName) {
          updates.push({
            id: location.id,
            currentName: location.name,
            accountId: location.account_id || '',
            suggestedName: suggestedName
          });
          console.log(`✅ Will update "${location.name}" to "${suggestedName}"`);
        } else {
          console.log(`❌ No valid DBA name found for location: ${location.name}`);
        }
      }

      console.log('=== Analysis Complete ===');
      console.log('Total updates suggested:', updates.length);
      
      setLocationUpdates(updates);
      return updates;
    },
    onSuccess: (updates) => {
      toast({
        title: "Analysis Complete",
        description: `Found ${updates.length} location names to update.`,
      });
    },
    onError: (error) => {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: `Error analyzing location names: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Apply the name updates
  const applyUpdatesMutation = useMutation({
    mutationFn: async () => {
      if (locationUpdates.length === 0) {
        throw new Error('No updates to apply');
      }

      console.log('=== Applying Location Name Updates ===');
      let successCount = 0;
      const errors: string[] = [];

      for (const update of locationUpdates) {
        try {
          console.log(`Updating "${update.currentName}" to "${update.suggestedName}"`);
          
          const { error } = await supabase
            .from('locations')
            .update({ name: update.suggestedName })
            .eq('id', update.id);

          if (error) {
            console.error('Update error for location', update.id, ':', error);
            errors.push(`Failed to update ${update.currentName}: ${error.message}`);
          } else {
            successCount++;
            console.log(`✅ Successfully updated "${update.currentName}" to "${update.suggestedName}"`);
          }
        } catch (error) {
          console.error('Unexpected error updating location', update.id, ':', error);
          errors.push(`Unexpected error updating ${update.currentName}: ${String(error)}`);
        }
      }

      console.log('=== Update Complete ===');
      console.log('Successful updates:', successCount);
      console.log('Errors:', errors.length);

      if (errors.length > 0) {
        console.error('Update errors:', errors);
      }

      return { successCount, errors };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['numeric-locations'] });
      
      toast({
        title: "Location Names Updated",
        description: `Successfully updated ${result.successCount} location names. ${result.errors.length > 0 ? `${result.errors.length} errors occurred.` : ''}`,
        variant: result.errors.length > 0 ? "destructive" : "default"
      });
      
      setLocationUpdates([]);
    },
    onError: (error) => {
      console.error('Apply updates error:', error);
      toast({
        title: "Update Failed",
        description: `Error applying updates: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  if (locationsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading locations...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Location Name Fixer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Found {numericLocations?.length || 0} locations with numeric names that need proper DBA business names.
          </p>
          
          {numericLocations && numericLocations.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium">Locations with numeric names:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {numericLocations.slice(0, 8).map((location) => (
                  <div key={location.id} className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>• {location.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {location.account_id || 'No Account ID'}
                    </Badge>
                  </div>
                ))}
                {numericLocations.length > 8 && (
                  <div className="text-xs text-muted-foreground">
                    ...and {numericLocations.length - 8} more
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={() => analyzeNamesMutation.mutate()}
              disabled={!numericLocations || numericLocations.length === 0 || analyzeNamesMutation.isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${analyzeNamesMutation.isPending ? 'animate-spin' : ''}`} />
              {analyzeNamesMutation.isPending ? 'Analyzing...' : 'Analyze & Find DBA Names'}
            </Button>

            {locationUpdates.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="default"
                    disabled={applyUpdatesMutation.isPending}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Apply {locationUpdates.length} Updates
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apply Location Name Updates</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to update {locationUpdates.length} location names with their proper DBA business names? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => applyUpdatesMutation.mutate()}
                      disabled={applyUpdatesMutation.isPending}
                    >
                      {applyUpdatesMutation.isPending ? 'Updating...' : 'Apply Updates'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {locationUpdates.length > 0 && (
          <div className="border rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-green-700">
              ✅ Found {locationUpdates.length} DBA names to apply:
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {locationUpdates.map((update, index) => (
                <div key={update.id} className="text-xs flex items-center justify-between">
                  <span className="text-red-600">"{update.currentName}"</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-green-600 font-medium">"{update.suggestedName}"</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="font-medium mb-2 text-blue-800">🔍 How it works:</p>
          <ul className="space-y-1 text-blue-700">
            <li>• Finds locations with numeric names (like "100336")</li>
            <li>• Searches transaction data for matching DBA business names</li>
            <li>• Validates that DBA names are proper business names</li>
            <li>• Updates location names with correct business names</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationNameFixer;
