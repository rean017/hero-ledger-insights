import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Merge, Search, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface DuplicateGroup {
  name: string;
  locations: Array<{
    id: string;
    name: string;
    account_id: string;
    transactionCount: number;
    totalVolume: number;
  }>;
  totalVolume: number;
}

const DataCleanupUtility = () => {
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    }
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*');

      if (error) throw error;
      return data;
    }
  });

  // Find duplicate location names
  const duplicateGroups: DuplicateGroup[] = [];
  const locationNameMap = new Map<string, typeof locations>();

  locations.forEach(location => {
    const normalizedName = location.name.toLowerCase().trim();
    if (!locationNameMap.has(normalizedName)) {
      locationNameMap.set(normalizedName, []);
    }
    locationNameMap.get(normalizedName)!.push(location);
  });

  locationNameMap.forEach((locationGroup, name) => {
    if (locationGroup.length > 1) {
      const locationsWithData = locationGroup.map(location => {
        const locationTransactions = transactions.filter(t => t.account_id === location.account_id);
        const totalVolume = locationTransactions.reduce((sum, t) => {
          const bankCard = Number(t.volume) || 0;
          const debitCard = Number(t.debit_volume) || 0;
          return sum + bankCard + debitCard;
        }, 0);

        return {
          ...location,
          transactionCount: locationTransactions.length,
          totalVolume
        };
      });

      const totalVolume = locationsWithData.reduce((sum, loc) => sum + loc.totalVolume, 0);

      duplicateGroups.push({
        name: locationGroup[0].name,
        locations: locationsWithData,
        totalVolume
      });
    }
  });

  // Sort by total volume (highest first)
  duplicateGroups.sort((a, b) => b.totalVolume - a.totalVolume);

  const mergeDuplicateLocations = async (group: DuplicateGroup) => {
    setProcessing(true);
    try {
      // Find the location with the most transactions to keep as primary
      const primaryLocation = group.locations.reduce((prev, current) => 
        current.transactionCount > prev.transactionCount ? current : prev
      );

      const locationsToMerge = group.locations.filter(loc => loc.id !== primaryLocation.id);

      console.log(`🔄 Merging ${locationsToMerge.length} duplicate locations into primary:`, primaryLocation);

      // Update all transactions to use the primary location's account_id
      for (const location of locationsToMerge) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ account_id: primaryLocation.account_id })
          .eq('account_id', location.account_id);

        if (updateError) throw updateError;

        // Update agent assignments to use primary location
        const { error: assignmentError } = await supabase
          .from('location_agent_assignments')
          .update({ location_id: primaryLocation.id })
          .eq('location_id', location.id);

        if (assignmentError) throw assignmentError;

        // Delete the duplicate location
        const { error: deleteError } = await supabase
          .from('locations')
          .delete()
          .eq('id', location.id);

        if (deleteError) throw deleteError;
      }

      toast({
        title: "Success",
        description: `Merged ${locationsToMerge.length} duplicate locations for "${group.name}"`
      });

      // Refresh data
      window.location.reload();

    } catch (error: any) {
      console.error('Error merging locations:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to merge locations",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Cleanup Utility</h2>
        <p className="text-muted-foreground">Identify and resolve duplicate location issues affecting volume aggregation</p>
      </div>

      {duplicateGroups.length === 0 ? (
        <Alert>
          <Search className="h-4 w-4" />
          <AlertDescription>
            No duplicate location names detected. All locations appear to be unique.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Found {duplicateGroups.length} location names with duplicates. These may be causing volume aggregation issues.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {duplicateGroups.map((group, index) => (
          <Card key={index} className="border-destructive/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Duplicate: {group.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">
                    {group.locations.length} duplicates
                  </Badge>
                  <Badge variant="outline">
                    Total Volume: ${group.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                {group.locations.map((location, locIndex) => (
                  <div key={location.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{location.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Account ID: {location.account_id || 'None'} | ID: {location.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        ${location.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {location.transactionCount} transactions
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Merging will combine all transactions and assignments into the location with the most data.
                </p>
                <Button
                  onClick={() => mergeDuplicateLocations(group)}
                  disabled={processing}
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                >
                  <Merge className="h-4 w-4" />
                  Merge Duplicates
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {duplicateGroups.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Merging will permanently combine duplicate locations. 
            The system will keep the location with the most transaction data and merge all other data into it. 
            This action cannot be undone.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default DataCleanupUtility;
