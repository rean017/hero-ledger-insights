
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const LocationCommissionReport = () => {
  // Changed default to march since that's where the data is
  const [timeFrame, setTimeFrame] = useState("march");

  const getDateRangeForTimeFrame = (frame: string) => {
    switch (frame) {
      case "march":
        return { from: new Date("2025-03-01"), to: new Date("2025-03-31") };
      case "april":
        return { from: new Date("2025-04-01"), to: new Date("2025-04-30") };
      case "may":
        return { from: new Date("2025-05-01"), to: new Date("2025-05-31") };
      case "june":
        return { from: new Date("2025-06-01"), to: new Date("2025-06-30") };
      default:
        return { from: new Date("2025-03-01"), to: new Date("2025-03-31") };
    }
  };

  const timeFrames = [
    { value: "march", label: "March" },
    { value: "april", label: "April" },
    { value: "may", label: "May" },
    { value: "june", label: "June" }
  ];

  const dateRange = getDateRangeForTimeFrame(timeFrame);

  // Fetch transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', timeFrame],
    queryFn: async () => {
      console.log('🔄 LocationCommissionReport: Fetching transactions for', timeFrame);
      const fromFormatted = dateRange.from.toISOString().split('T')[0];
      const toFormatted = dateRange.to.toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('transaction_date', fromFormatted)
        .lte('transaction_date', toFormatted);

      if (error) throw error;
      
      console.log('📊 LocationCommissionReport: Transactions fetched for', timeFrame, ':', data?.length || 0);
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

  console.log('📅 LocationCommissionReport: Date filtering for timeframe:', timeFrame);
  console.log('📅 LocationCommissionReport: Date range:', dateRange);
  console.log('📅 LocationCommissionReport: Transactions:', transactions.length);

  const commissions = calculateLocationCommissions(transactions, assignments, locations);
  const agentSummaries = groupCommissionsByAgent(commissions);

  const totalCommissions = commissions.reduce((sum, c) => {
    // Sum both agent payouts and merchant hero payouts
    return sum + c.agentPayout + c.merchantHeroPayout;
  }, 0);

  const totalVolume = commissions.reduce((sum, c) => sum + c.locationVolume, 0);
  const totalNetPayout = commissions.reduce((sum, c) => sum + c.netAgentPayout, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Commission Reports</h2>
          <p className="text-muted-foreground">Detailed commission breakdown by location and agent</p>
        </div>
        <ToggleGroup 
          type="single" 
          value={timeFrame} 
          onValueChange={setTimeFrame} 
          className="grid grid-cols-2 lg:grid-cols-4 bg-muted rounded-lg p-1 w-full sm:w-auto"
        >
          {timeFrames.map((frame) => (
            <ToggleGroupItem 
              key={frame.value}
              value={frame.value} 
              className="px-3 py-2 text-xs lg:text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {frame.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Total Volume
              </span>
              <span className="font-semibold">${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Net Agent Payout
              </span>
              <span className="font-semibold">${totalNetPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Commissions
              </span>
              <span className="font-semibold">${totalCommissions.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
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
                    ${summary.totalCommission.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </Badge>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Net Payout</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Agent Commission</TableHead>
                      <TableHead>Merchant Hero</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.locations.map((location) => (
                      <TableRow key={`${location.locationId}-${location.agentName}`}>
                        <TableCell className="font-medium">{location.locationName}</TableCell>
                        <TableCell>${location.locationVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell>${location.netAgentPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          {location.agentName === 'Merchant Hero' ? (
                            <Badge variant="secondary">Remainder</Badge>
                          ) : (
                            <Badge variant="outline">{location.bpsRate} BPS</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${location.agentPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${location.merchantHeroPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            
            {agentSummaries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No commission data available for {timeFrame}. Make sure agents are assigned to locations and transaction data is uploaded.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Detailed Revenue Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Total Volume</TableHead>
                <TableHead>Net Agent Payout</TableHead>
                <TableHead>BPS Rate</TableHead>
                <TableHead>Agent Payout</TableHead>
                <TableHead>Merchant Hero Payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{commission.locationName}</TableCell>
                  <TableCell>{commission.agentName}</TableCell>
                  <TableCell>${commission.locationVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell>${commission.netAgentPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    {commission.agentName === 'Merchant Hero' ? (
                      <Badge variant="secondary">Remainder</Badge>
                    ) : (
                      <Badge variant="outline">{commission.bpsRate} BPS</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">
                    ${commission.agentPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="font-semibold">
                    ${commission.merchantHeroPayout.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {commissions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No commission data to display for {timeFrame}. Upload transaction data and assign agents to locations.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationCommissionReport;
