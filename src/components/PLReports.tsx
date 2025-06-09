import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, TrendingUp, Building2, Users, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { convertToBPSDisplay, convertToDecimalRate } from "@/utils/bpsCalculations";

const PLReports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("current-month");

  const getDateRange = (period: string) => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    switch (period) {
      case "current-month":
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Current month"
        };
      case "last-month":
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return {
          start: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          label: "Last month"
        };
      case "current-quarter":
        const quarterStart = Math.floor(currentMonth / 3) * 3;
        return {
          start: `${currentYear}-${String(quarterStart + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(quarterStart + 4).padStart(2, '0')}-1`,
          label: "Current quarter"
        };
      case "current-year":
        return {
          start: `${currentYear}-01-01`,
          end: `${currentYear + 1}-01-01`,
          label: "Current year"
        };
      case "last-12-months":
        const twelveMonthsAgo = new Date(currentYear, currentMonth - 12, 1);
        return {
          start: `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Last 12 months"
        };
      default:
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Current month"
        };
    }
  };

  const dateRange = getDateRange(selectedPeriod);

  const { data: periodSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['period-summary', selectedPeriod],
    queryFn: async () => {
      console.log(`Fetching period summary for ${selectedPeriod} (${dateRange.start} to ${dateRange.end})`);
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end);

      if (error) throw error;

      console.log('Period summary - Total transactions:', transactions?.length);

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          locations(name, account_id)
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      let totalRevenue = 0;
      let totalExpenses = 0;

      // Calculate total revenue from all transactions
      transactions?.forEach(t => {
        totalRevenue += (t.volume || 0) + (t.debit_volume || 0);
      });

      // Calculate agent commissions
      assignments?.forEach(assignment => {
        if (assignment.locations?.account_id) {
          const locationTransactions = transactions?.filter(t => t.account_id === assignment.locations.account_id) || [];
          const locationVolume = locationTransactions.reduce((sum, t) => sum + (t.volume || 0) + (t.debit_volume || 0), 0);
          
          const decimalRate = convertToDecimalRate(assignment.commission_rate);
          const commission = locationVolume * decimalRate;
          totalExpenses += commission;
          
          console.log(`Commission for ${assignment.locations.name} (${assignment.agent_name}):`, {
            volume: locationVolume,
            rate: decimalRate,
            commission
          });
        }
      });

      const netIncome = totalRevenue - totalExpenses;

      const result = {
        totalRevenue,
        totalExpenses,
        netIncome,
        transactionCount: transactions?.length || 0
      };

      console.log('Period summary - Final calculations:', result);
      return result;
    },
    refetchOnWindowFocus: false
  });

  const { data: agentLocationData, isLoading: agentLoading, refetch: refetchAgentData } = useQuery({
    queryKey: ['agent-location-pl-data', selectedPeriod],
    queryFn: async () => {
      console.log(`Fetching agent location P&L data for ${selectedPeriod}`);
      
      const { data: assignments, error } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          locations(id, name, account_id)
        `)
        .eq('is_active', true);

      if (error) throw error;

      const { data: transactions, error: transactionError } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end);

      if (transactionError) throw transactionError;

      console.log('Total transactions in date range:', transactions?.length);

      const agentLocationResults = assignments?.map(assignment => {
        if (!assignment.locations?.account_id) {
          return null;
        }

        const locationAccountId = assignment.locations.account_id;
        
        // Find all transactions for this location and sum volume + debit_volume
        const locationTransactions = transactions?.filter(t => t.account_id === locationAccountId) || [];
        const totalVolume = locationTransactions.reduce((sum, t) => sum + (t.volume || 0), 0);
        const totalDebitVolume = locationTransactions.reduce((sum, t) => sum + (t.debit_volume || 0), 0);
        const combinedVolume = totalVolume + totalDebitVolume;

        console.log(`Volume calculation for ${assignment.locations.name} (${locationAccountId}):`, {
          transactions: locationTransactions.length,
          totalVolume,
          totalDebitVolume,
          combinedVolume
        });

        // Use utility functions for consistent conversion
        const bpsDisplay = convertToBPSDisplay(assignment.commission_rate);
        const decimalRate = convertToDecimalRate(assignment.commission_rate);
        const commission = combinedVolume * decimalRate;

        console.log('Commission calculation:', {
          location: assignment.locations.name,
          combinedVolume,
          storedRate: assignment.commission_rate,
          bpsDisplay: bpsDisplay,
          decimalRate: decimalRate,
          calculatedCommission: commission
        });

        return {
          agentName: assignment.agent_name,
          locationName: assignment.locations.name,
          accountId: locationAccountId,
          bpsRate: bpsDisplay,
          volume: combinedVolume,
          debitVolume: totalDebitVolume,
          calculatedPayout: commission,
          profitContribution: combinedVolume - commission
        };
      }).filter(Boolean) || [];

      return agentLocationResults;
    },
    refetchOnWindowFocus: false
  });

  if (summaryLoading || agentLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
            <p className="text-muted-foreground">Detailed profit and loss analysis by period</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Period:</label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-month">Current Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="current-quarter">Current Quarter</SelectItem>
                <SelectItem value="current-year">Current Year</SelectItem>
                <SelectItem value="last-12-months">Last 12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  const topPerformers = agentLocationData
    ?.sort((a, b) => b.volume - a.volume)
    .slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
          <p className="text-muted-foreground">Detailed profit and loss analysis by period</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Period:</label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current-month">Current Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="current-quarter">Current Quarter</SelectItem>
              <SelectItem value="current-year">Current Year</SelectItem>
              <SelectItem value="last-12-months">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ${periodSummary?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{dateRange.label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agent Payouts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ${periodSummary?.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{dateRange.label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ${periodSummary?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{dateRange.label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {periodSummary?.transactionCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{dateRange.label}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Performing Locations ({dateRange.label})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="space-y-4">
                {topPerformers.map((performer, index) => (
                  <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{performer.locationName}</p>
                      <p className="text-sm text-muted-foreground">{performer.agentName} • {performer.bpsRate} BPS</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">${performer.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      <p className="text-sm text-muted-foreground">Volume</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">No performance data available for this period</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              P&L Summary ({dateRange.label})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Gross Revenue</span>
                <span className="font-semibold text-emerald-600">
                  ${periodSummary?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Agent Commissions</span>
                <span className="font-semibold text-red-600">
                  -${periodSummary?.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                </span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Net Profit</span>
                  <span className="font-bold text-blue-600">
                    ${periodSummary?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                  </span>
                </div>
              </div>
              <div className="text-center pt-2">
                <span className="text-xs text-muted-foreground">
                  Profit Margin: {periodSummary?.totalRevenue ? ((periodSummary.netIncome / periodSummary.totalRevenue) * 100).toFixed(2) : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Agent & Location Performance ({dateRange.label})</CardTitle>
        </CardHeader>
        <CardContent>
          {agentLocationData && agentLocationData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-muted-foreground">Agent</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Location</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">BPS Rate</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Total Volume</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Agent Payout</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Profit Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {agentLocationData.map((data, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <Badge variant="secondary">{data.agentName}</Badge>
                      </td>
                      <td className="p-4 font-medium">{data.locationName}</td>
                      <td className="p-4 font-semibold">{data.bpsRate} BPS</td>
                      <td className="p-4 font-semibold text-emerald-600">
                        ${data.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 font-semibold text-red-600">
                        ${data.calculatedPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 font-semibold text-blue-600">
                        ${data.profitContribution.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No agent/location data available for this period. Upload transaction data and assign agents to locations.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PLReports;
