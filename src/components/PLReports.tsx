
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, TrendingUp, Building2, Users, DollarSign, FileText, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";
import { getDynamicTimeFrames, getDateRangeForTimeFrame, getDefaultTimeFrame } from "@/utils/timeFrameUtils";
import AgentPLReport from "./AgentPLReport";

const PLReports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [timeFrames, setTimeFrames] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize with smart timeframe detection
  useEffect(() => {
    const initializeTimeFrames = async () => {
      try {
        const frames = await getDynamicTimeFrames();
        const defaultFrame = await getDefaultTimeFrame();
        
        setTimeFrames(frames);
        setSelectedPeriod(defaultFrame);
        
        // Get date range for the default timeframe
        const range = await getDateRangeForTimeFrame(defaultFrame);
        setDateRange(range);
        setIsInitialized(true);
        
        console.log('🎯 P&L REPORTS: Smart timeframe detection initialized:', {
          defaultFrame,
          frames: frames.map(f => ({ value: f.value, label: f.label }))
        });
      } catch (error) {
        console.error('Error initializing P&L timeframes:', error);
        // Fallback to April 2025 if there's an error
        setSelectedPeriod("2025-04");
        setDateRange({
          from: new Date("2025-04-01T00:00:00.000Z"),
          to: new Date("2025-04-30T23:59:59.999Z")
        });
        setIsInitialized(true);
      }
    };

    initializeTimeFrames();
  }, []);

  // Update date range when period changes
  useEffect(() => {
    const updateDateRange = async () => {
      if (selectedPeriod) {
        try {
          const range = await getDateRangeForTimeFrame(selectedPeriod);
          setDateRange(range);
        } catch (error) {
          console.error('Error updating date range for P&L:', error);
        }
      }
    };

    updateDateRange();
  }, [selectedPeriod]);

  // Convert timeframe to legacy format for existing logic
  const getDateRangeForLegacyFormat = (period: string) => {
    if (!dateRange) {
      return {
        start: '2025-04-01',
        end: '2025-04-30',
        label: 'April 2025'
      };
    }

    const timeFrame = timeFrames.find(tf => tf.value === period);
    return {
      start: format(dateRange.from, 'yyyy-MM-dd'),
      end: format(dateRange.to, 'yyyy-MM-dd'),
      label: timeFrame?.label || 'Current Period'
    };
  };

  const legacyDateRange = getDateRangeForLegacyFormat(selectedPeriod);

  // 12-month trailing history query - always call this hook
  const { data: trailingHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['12-month-trailing-history-overview'],
    queryFn: async () => {
      const currentDate = new Date();
      const twelveMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 12, 1);
      
      console.log('Fetching 12-month trailing history from', format(twelveMonthsAgo, 'yyyy-MM-dd'));

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, transaction_date, agent_payout')
        .gte('transaction_date', format(twelveMonthsAgo, 'yyyy-MM-dd'));

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      // Group transactions by month and calculate monthly totals
      const monthlyData = transactions?.reduce((acc, transaction) => {
        const monthKey = format(new Date(transaction.transaction_date), 'yyyy-MM');
        if (!acc[monthKey]) {
          acc[monthKey] = [];
        }
        acc[monthKey].push(transaction);
        return acc;
      }, {} as Record<string, any[]>);

      const history = [];
      for (let i = 11; i >= 0; i--) {
        const month = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthKey = format(month, 'yyyy-MM');
        const monthTransactions = monthlyData?.[monthKey] || [];
        
        // Only calculate commissions if there are actual transactions
        if (monthTransactions.length > 0) {
          const commissions = calculateLocationCommissions(monthTransactions, assignments || [], locations || []);
          const totalVolume = commissions.reduce((sum, c) => sum + c.locationVolume, 0);
          const totalCommissions = commissions.reduce((sum, c) => sum + (c.agentName === 'Merchant Hero' ? c.merchantHeroPayout : c.agentPayout), 0);
          
          history.push({
            month: format(month, 'MMM yyyy'),
            totalVolume,
            totalCommissions,
            netIncome: totalVolume - totalCommissions
          });
        } else {
          // No transactions for this month, show zeros
          history.push({
            month: format(month, 'MMM yyyy'),
            totalVolume: 0,
            totalCommissions: 0,
            netIncome: 0
          });
        }
      }

      return history;
    },
    enabled: isInitialized, // Only run when initialized
    refetchOnWindowFocus: false
  });

  // Top 10 performers query - always call this hook
  const { data: topPerformers, isLoading: performersLoading } = useQuery({
    queryKey: ['top-10-performers-overview'],
    queryFn: async () => {
      const currentDate = new Date();
      const threeMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 3, 1);
      
      console.log('Fetching top 10 performers data from', format(threeMonthsAgo, 'yyyy-MM-dd'));

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
        .gte('transaction_date', format(threeMonthsAgo, 'yyyy-MM-dd'));

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      
      // Group by location to avoid duplicates
      const locationMap = new Map();
      
      commissions.forEach(commission => {
        const locationKey = commission.locationId;
        
        if (!locationMap.has(locationKey)) {
          locationMap.set(locationKey, {
            locationId: commission.locationId,
            locationName: commission.locationName,
            locationVolume: commission.locationVolume,
            agents: []
          });
        }
        
        const location = locationMap.get(locationKey);
        location.agents.push({
          agentName: commission.agentName,
          bpsRate: commission.bpsRate,
          commission: commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout
        });
      });
      
      // Convert to array and sort by volume, then take top 10
      return Array.from(locationMap.values())
        .sort((a, b) => b.locationVolume - a.locationVolume)
        .slice(0, 10)
        .map((item, index) => ({
          rank: index + 1,
          ...item
        }));
    },
    enabled: isInitialized, // Only run when initialized
    refetchOnWindowFocus: false
  });

  // Period summary query - always call this hook
  const { data: periodSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['period-summary', selectedPeriod],
    queryFn: async () => {
      console.log(`Fetching period summary for ${selectedPeriod} (${legacyDateRange.start} to ${legacyDateRange.end})`);
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
        .gte('transaction_date', legacyDateRange.start)
        .lte('transaction_date', legacyDateRange.end);

      if (error) throw error;

      console.log('Period summary - Total transactions:', transactions?.length);

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      let totalVolume = 0;

      // Calculate total volume from all transactions
      transactions?.forEach(t => {
        totalVolume += (t.volume || 0) + (t.debit_volume || 0);
      });

      // Use the same commission calculation logic as the commission reports
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      const totalExpenses = commissions.reduce((sum, commission) => sum + (commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout), 0);

      const netIncome = totalVolume - totalExpenses;

      const result = {
        totalVolume,
        totalExpenses,
        netIncome,
        transactionCount: transactions?.length || 0
      };

      console.log('Period summary - Final calculations:', result);
      return result;
    },
    enabled: isInitialized && selectedPeriod !== "", // Only run when initialized and period is set
    refetchOnWindowFocus: false
  });

  // Agent location data query - always call this hook
  const { data: agentLocationData, isLoading: agentLoading, refetch: refetchAgentData } = useQuery({
    queryKey: ['agent-location-pl-data', selectedPeriod],
    queryFn: async () => {
      console.log(`Fetching agent location P&L data for ${selectedPeriod}`);
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
        .gte('transaction_date', legacyDateRange.start)
        .lte('transaction_date', legacyDateRange.end);

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      console.log('Total transactions in date range:', transactions?.length);

      // Use the same commission calculation logic as the commission reports
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);

      const agentLocationResults = commissions.map(commission => ({
        agentName: commission.agentName,
        locationName: commission.locationName,
        accountId: commission.locationId,
        bpsRate: commission.bpsRate,
        volume: commission.locationVolume,
        debitVolume: 0, // We can calculate this separately if needed
        calculatedPayout: commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout,
        profitContribution: commission.locationVolume - (commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout)
      }));

      return agentLocationResults;
    },
    enabled: isInitialized && selectedPeriod !== "", // Only run when initialized and period is set
    refetchOnWindowFocus: false
  });

  // Show loading state while timeframes are being initialized
  if (!isInitialized) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
            <p className="text-muted-foreground">Detailed profit and loss analysis by period</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading smart timeframe detection...</p>
        </div>
      </div>
    );
  }

  if (summaryLoading || agentLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
            <p className="text-muted-foreground">Detailed profit and loss analysis by period</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  const topPerformersForPeriod = agentLocationData
    ?.sort((a, b) => b.volume - a.volume)
    .slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
        <p className="text-muted-foreground">Detailed profit and loss analysis by period</p>
      </div>

      <Tabs defaultValue="agent-reports" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="agent-reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Agent P&L Reports
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Overview Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agent-reports">
          <AgentPLReport />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          {/* Top 10 Performers with unique locations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Top 10 Performing Locations (Last 3 Months by Volume)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {performersLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading top performers...</p>
                </div>
              ) : topPerformers && topPerformers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2">
                        <th className="text-left p-4 font-semibold">Rank</th>
                        <th className="text-left p-4 font-semibold">Location</th>
                        <th className="text-left p-4 font-semibold">Agents & BPS Rate</th>
                        <th className="text-right p-4 font-semibold">Total Volume</th>
                        <th className="text-right p-4 font-semibold">Total Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPerformers.map((performer) => (
                        <tr key={performer.locationId} className="border-b hover:bg-muted/50">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {performer.rank <= 3 && (
                                <Trophy className={`h-4 w-4 ${
                                  performer.rank === 1 ? 'text-yellow-500' :
                                  performer.rank === 2 ? 'text-gray-400' :
                                  'text-amber-600'
                                }`} />
                              )}
                              <span className="font-bold">#{performer.rank}</span>
                            </div>
                          </td>
                          <td className="p-4 font-medium">{performer.locationName}</td>
                          <td className="p-4">
                            <div className="space-y-1">
                              {performer.agents.map((agent, agentIndex) => (
                                <div key={agentIndex} className="flex items-center gap-2">
                                  <Badge variant="secondary">{agent.agentName}</Badge>
                                  <Badge variant="outline">{agent.bpsRate} BPS</Badge>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 text-right font-semibold text-emerald-600">
                            ${performer.locationVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-4 text-right font-semibold text-blue-600">
                            ${performer.agents.reduce((sum, agent) => sum + agent.commission, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">No performance data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 12-Month Trailing History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                12-Month Trailing History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading historical data...</p>
                </div>
              ) : trailingHistory && trailingHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2">
                        <th className="text-left p-4 font-semibold">Month</th>
                        <th className="text-right p-4 font-semibold">Total Volume</th>
                        <th className="text-right p-4 font-semibold">Total Commissions</th>
                        <th className="text-right p-4 font-semibold">Net Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trailingHistory.map((month, index) => (
                        <tr key={index} className="border-b hover:bg-muted/50">
                          <td className="p-4 font-medium">{month.month}</td>
                          <td className="p-4 text-right font-semibold text-emerald-600">
                            ${month.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-4 text-right font-semibold text-red-600">
                            ${month.totalCommissions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-4 text-right font-semibold text-blue-600">
                            ${month.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">No historical data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Period:</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {timeFrames.map((frame) => (
                    <SelectItem key={frame.value} value={frame.value}>
                      {frame.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Volume</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  ${periodSummary?.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{legacyDateRange.label}</p>
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
                <p className="text-xs text-muted-foreground mt-1">{legacyDateRange.label}</p>
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
                <p className="text-xs text-muted-foreground mt-1">{legacyDateRange.label}</p>
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
                <p className="text-xs text-muted-foreground mt-1">{legacyDateRange.label}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Top Performing Locations ({legacyDateRange.label})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topPerformersForPeriod.length > 0 ? (
                  <div className="space-y-4">
                    {topPerformersForPeriod.map((performer, index) => (
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
                  P&L Summary ({legacyDateRange.label})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Gross Volume</span>
                    <span className="font-semibold text-emerald-600">
                      ${periodSummary?.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
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
                      Profit Margin: {periodSummary?.totalVolume ? ((periodSummary.netIncome / periodSummary.totalVolume) * 100).toFixed(2) : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detailed Agent & Location Performance ({legacyDateRange.label})</CardTitle>
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PLReports;
