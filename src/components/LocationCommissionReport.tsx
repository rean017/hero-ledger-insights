
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LocationCommissionReport = () => {
  // Fetch transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*');

      if (error) throw error;
      
      console.log('=== COMMISSION REPORT TRANSACTION DATA ===');
      console.log('Total transactions loaded:', data.length);
      console.log('Sample transactions with volume data:', data.slice(0, 3).map(t => ({
        account_id: t.account_id,
        processor: t.processor,
        volume: t.volume,
        debit_volume: t.debit_volume,
        total_calculated: (Number(t.volume) || 0) + (Number(t.debit_volume) || 0)
      })));
      
      return data;
    }
  });

  // Fetch assignments
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

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*');

      if (error) throw error;
      return data;
    }
  });

  const commissions = calculateLocationCommissions(transactions, assignments, locations);
  const agentSummaries = groupCommissionsByAgent(commissions);

  const totalCommissions = commissions.reduce((sum, c) => sum + c.commission, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Total Commissions
              </span>
              <span className="font-semibold">${totalCommissions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Active Locations
              </span>
              <span className="font-semibold">{new Set(commissions.map(c => c.locationId)).size}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Active Agents
              </span>
              <span className="font-semibold">{agentSummaries.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Agent Commission Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {agentSummaries.map((summary) => (
              <div key={summary.agentName} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{summary.agentName}</h3>
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    ${summary.totalCommission.toLocaleString()}
                  </Badge>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.locations.map((location) => (
                      <TableRow key={`${location.locationId}-${location.agentName}`}>
                        <TableCell className="font-medium">{location.locationName}</TableCell>
                        <TableCell>${location.locationVolume.toLocaleString()}</TableCell>
                        <TableCell>
                          {location.agentName === 'Merchant Hero' ? (
                            <Badge variant="secondary">Remainder</Badge>
                          ) : (
                            <Badge variant="outline">{location.bpsRate} BPS</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${location.commission.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            
            {agentSummaries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No commission data available. Make sure agents are assigned to locations and transaction data is uploaded.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Detailed Commission Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Location Volume</TableHead>
                <TableHead>BPS Rate</TableHead>
                <TableHead>Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{commission.agentName}</TableCell>
                  <TableCell>{commission.locationName}</TableCell>
                  <TableCell>${commission.locationVolume.toLocaleString()}</TableCell>
                  <TableCell>
                    {commission.agentName === 'Merchant Hero' ? (
                      <Badge variant="secondary">Remainder</Badge>
                    ) : (
                      <Badge variant="outline">{commission.bpsRate} BPS</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">
                    ${commission.commission.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {commissions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No commission data to display. Upload transaction data and assign agents to locations.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationCommissionReport;
