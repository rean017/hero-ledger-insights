
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Database, AlertCircle, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface LocationDebugInfo {
  id: string;
  name: string;
  account_id: string;
  transactionCount: number;
  totalVolume: number;
  totalAgentPayout: number;
  assignments: number;
  issues: string[];
}

const LocationDataDebugger = () => {
  const [searchTerm, setSearchTerm] = useState("");

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

  const { data: assignments = [] } = useQuery({
    queryKey: ['location_agent_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      return data;
    }
  });

  // Process location debug information
  const locationDebugInfo: LocationDebugInfo[] = locations.map(location => {
    const locationTransactions = transactions.filter(t => t.account_id === location.account_id);
    const locationAssignments = assignments.filter(a => a.location_id === location.id);
    
    const totalVolume = locationTransactions.reduce((sum, t) => {
      const bankCard = Number(t.volume) || 0;
      const debitCard = Number(t.debit_volume) || 0;
      return sum + bankCard + debitCard;
    }, 0);

    const totalAgentPayout = locationTransactions.reduce((sum, t) => {
      return sum + (Number(t.agent_payout) || 0);
    }, 0);

    // Identify potential issues
    const issues: string[] = [];
    
    if (!location.account_id) {
      issues.push("Missing Account ID");
    }
    
    if (locationTransactions.length === 0) {
      issues.push("No Transaction Data");
    }
    
    if (locationAssignments.length === 0) {
      issues.push("No Agent Assignments");
    }

    // Check for similar names
    const similarNames = locations.filter(loc => 
      loc.id !== location.id && 
      loc.name.toLowerCase().includes(location.name.toLowerCase()) ||
      location.name.toLowerCase().includes(loc.name.toLowerCase())
    );
    
    if (similarNames.length > 0) {
      issues.push(`Similar Names Found (${similarNames.length})`);
    }

    return {
      id: location.id,
      name: location.name,
      account_id: location.account_id || 'N/A',
      transactionCount: locationTransactions.length,
      totalVolume,
      totalAgentPayout,
      assignments: locationAssignments.length,
      issues
    };
  });

  // Filter locations based on search
  const filteredLocations = locationDebugInfo.filter(loc =>
    loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.account_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort by volume (highest first)
  const sortedLocations = filteredLocations.sort((a, b) => b.totalVolume - a.totalVolume);

  // Find Greenlight locations specifically
  const greenlightLocations = sortedLocations.filter(loc => 
    loc.name.toLowerCase().includes('greenlight')
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Location Data Debugger</h2>
        <p className="text-muted-foreground">Detailed analysis of location data and transaction mapping</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search locations or account IDs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Greenlight Summary */}
      {greenlightLocations.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Database className="h-5 w-5" />
              Greenlight & Company Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {greenlightLocations.map((location) => (
                <div key={location.id} className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <div>
                    <p className="font-medium">{location.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Account ID: {location.account_id} | Location ID: {location.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">
                      ${location.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {location.transactionCount} transactions
                    </p>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t">
                <p className="text-sm font-medium">
                  Total Greenlight Volume: ${greenlightLocations.reduce((sum, loc) => sum + loc.totalVolume, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Locations Debug Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            All Locations Debug Data ({sortedLocations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {sortedLocations.map((location) => (
                <div key={location.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{location.name}</p>
                      {location.issues.length === 0 ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Account ID: {location.account_id} | Location ID: {location.id.substring(0, 8)}...
                    </p>
                    {location.issues.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {location.issues.map((issue, index) => (
                          <Badge key={index} variant="destructive" className="text-xs">
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      ${location.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {location.transactionCount} txns | {location.assignments} agents
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Net: ${location.totalAgentPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationDataDebugger;
