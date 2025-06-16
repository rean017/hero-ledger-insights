
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { getDynamicTimeFrames, getDateRangeForTimeFrame } from "@/utils/timeFrameUtils";

const LocationCommissionReport = () => {
  // Get dynamic time frames and set default to current month
  const timeFrames = getDynamicTimeFrames();
  const [timeFrame, setTimeFrame] = useState(timeFrames[2].value); // Current month (3rd option)

  const dateRange = getDateRangeForTimeFrame(timeFrame);

  // Fetch transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      console.log('🔄 LocationCommissionReport: Fetching ALL transactions...');
      const { data, error } = await supabase
        .from('transactions')
        .select('*');

      if (error) throw error;
      
      console.log('📊 LocationCommissionReport: Total transactions fetched:', data?.length || 0);
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

  // Calculate base commissions
  const commissions = calculateLocationCommissions(transactions, assignments, locations);
  
  // Apply date filtering - CONSISTENT with other components
  const filteredTransactions = dateRange 
    ? transactions.filter(t => {
        if (!t.transaction_date) return false;
        
        // Parse transaction date using same logic as other components
        const transactionDate = new Date(t.transaction_date + 'T00:00:00.000Z'); // Force UTC to avoid timezone issues
        
        // Ensure the transaction date is valid
        if (isNaN(transactionDate.getTime())) {
          console.log('⚠️ LocationCommissionReport: Invalid transaction date:', t.transaction_date);
          return false;
        }
        
        const isInRange = transactionDate >= dateRange.from && transactionDate <= dateRange.to;
        
        if (isInRange) {
          console.log('✅ LocationCommissionReport: Transaction date in range:', {
            transactionDate: transactionDate.toISOString(),
            fromDate: dateRange.from.toISOString(),
            toDate: dateRange.to.toISOString(),
            accountId: t.account_id,
            timeFrame: timeFrame
          });
        }
        
        return isInRange;
      })
    : transactions;

  console.log('📅 LocationCommissionReport: Date filtering for timeframe:', timeFrame);
  console.log('📅 LocationCommissionReport: Date range:', dateRange);
  console.log('📅 LocationCommissionReport: Original transactions:', transactions.length);
  console.log('📅 LocationCommissionReport: Filtered transactions:', filteredTransactions.length);

  const filteredCommissions = dateRange 
    ? calculateLocationCommissions(filteredTransactions, assignments, locations)
    : commissions;

  const agentSummaries = groupCommissionsByAgent(filteredCommissions);

  const totalCommissions = filteredCommissions.reduce((sum, c) => {
    // Sum both agent payouts and merchant hero payouts
    return sum + c.agentPayout + c.merchantHeroPayout;
  }, 0);

  const totalVolume = filteredCommissions.reduce((sum, c) => sum + c.locationVolume, 0);
  const totalNetPayout = filteredCommissions.reduce((sum, c) => sum + c.netAgentPayout, 0);

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
            Detailed Revenue Breakdown (Your Exact Formula)
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
              No commission data to display. Upload transaction data and assign agents to locations.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationCommissionReport;
