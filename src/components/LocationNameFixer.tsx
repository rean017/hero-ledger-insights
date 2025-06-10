
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Wrench, CheckCircle, AlertCircle } from "lucide-react";

const LocationNameFixer = () => {
  const [fixing, setFixing] = useState(false);
  const [fixResults, setFixResults] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    updated: number;
  }>({ status: 'idle', message: '', updated: 0 });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isValidBusinessName = (value: string): boolean => {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (/^\d+$/.test(trimmed)) return false; // Purely numeric
    if (trimmed.length < 3) return false;
    if (!/[a-zA-Z]/.test(trimmed)) return false; // Must contain letters
    return true;
  };

  const fixLocationNames = async () => {
    setFixing(true);
    setFixResults({ status: 'idle', message: 'Starting location name fix...', updated: 0 });

    try {
      console.log('=== Starting Location Name Fix ===');

      // Get all locations with numeric names
      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (locationError) throw locationError;

      console.log('Found locations:', locations?.length);

      // Get all transaction raw data to find DBA mappings
      const { data: transactions, error: transactionError } = await supabase
        .from('transactions')
        .select('raw_data, account_id')
        .not('raw_data', 'is', null);

      if (transactionError) throw transactionError;

      console.log('Found transactions with raw data:', transactions?.length);

      // Build mapping from account IDs to DBA names
      const accountToDBAMap = new Map<string, string>();

      transactions?.forEach(transaction => {
        const rawData = transaction.raw_data as any;
        const accountId = transaction.account_id;

        if (rawData && accountId) {
          // Look for DBA Name in various possible fields
          const possibleDBAFields = [
            'DBA Name', 'dba name', 'dba_name', 'DBA', 'dba',
            'Business Name', 'business_name', 'Merchant Name', 'merchant_name'
          ];

          for (const field of possibleDBAFields) {
            if (rawData[field] && isValidBusinessName(String(rawData[field]))) {
              const dbaName = String(rawData[field]).trim();
              console.log(`Mapping account ${accountId} to DBA: ${dbaName}`);
              accountToDBAMap.set(accountId, dbaName);
              break;
            }
          }

          // Also check all fields for valid business names
          if (!accountToDBAMap.has(accountId)) {
            for (const [key, value] of Object.entries(rawData)) {
              if (value && isValidBusinessName(String(value))) {
                const dbaName = String(value).trim();
                console.log(`Found alternate DBA for account ${accountId}: ${dbaName} (from field: ${key})`);
                accountToDBAMap.set(accountId, dbaName);
                break;
              }
            }
          }
        }
      });

      console.log('Built DBA mapping for', accountToDBAMap.size, 'accounts');

      let updatedCount = 0;
      const errors: string[] = [];

      // Update locations with proper DBA names
      for (const location of locations || []) {
        // Skip if location already has a valid business name
        if (isValidBusinessName(location.name)) {
          console.log(`Skipping location ${location.id} - already has valid name: ${location.name}`);
          continue;
        }

        // Try to find DBA name for this location
        let dbaName: string | null = null;

        // First try using account_id
        if (location.account_id && accountToDBAMap.has(location.account_id)) {
          dbaName = accountToDBAMap.get(location.account_id)!;
        }

        // If no account_id match, try using the location name as account_id
        if (!dbaName && accountToDBAMap.has(location.name)) {
          dbaName = accountToDBAMap.get(location.name)!;
        }

        if (dbaName) {
          console.log(`Updating location ${location.id} from "${location.name}" to "${dbaName}"`);
          
          const { error: updateError } = await supabase
            .from('locations')
            .update({ name: dbaName })
            .eq('id', location.id);

          if (updateError) {
            console.error('Error updating location:', updateError);
            errors.push(`Failed to update location ${location.id}: ${updateError.message}`);
          } else {
            updatedCount++;
          }
        } else {
          console.log(`No DBA name found for location ${location.id} (${location.name})`);
        }
      }

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });

      const successMessage = `Successfully updated ${updatedCount} location names with proper DBA business names.`;
      
      setFixResults({
        status: updatedCount > 0 ? 'success' : 'error',
        message: updatedCount > 0 ? successMessage : 'No locations were updated. Make sure your uploaded file contains DBA Name data.',
        updated: updatedCount
      });

      toast({
        title: "Location Names Fixed",
        description: successMessage,
      });

      console.log('=== Location Name Fix Complete ===');
      console.log('Updated count:', updatedCount);
      console.log('Errors:', errors);

    } catch (error) {
      console.error('Location name fix error:', error);
      setFixResults({
        status: 'error',
        message: `Error fixing location names: ${String(error)}`,
        updated: 0
      });

      toast({
        title: "Fix Failed",
        description: String(error),
        variant: "destructive"
      });
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Fix Location Names
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This will match numeric location names with proper DBA business names from your uploaded transaction data.
        </p>
        
        <Button 
          onClick={fixLocationNames}
          disabled={fixing}
          className="gap-2"
        >
          {fixing ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Wrench className="h-4 w-4" />
          )}
          {fixing ? 'Fixing Names...' : 'Fix Location Names'}
        </Button>

        {fixResults.status !== 'idle' && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            fixResults.status === 'success' ? 'bg-emerald-50 border-emerald-200' :
            'bg-red-50 border-red-200'
          }`}>
            {fixResults.status === 'success' ? (
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <div>
              <p className="text-sm font-medium">{fixResults.message}</p>
              {fixResults.updated > 0 && (
                <p className="text-xs text-muted-foreground">Updated {fixResults.updated} locations</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationNameFixer;
