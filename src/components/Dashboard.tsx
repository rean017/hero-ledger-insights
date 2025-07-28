
import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Users, Building2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";

const Dashboard = () => {
  // Changed default to march since that's where the data is
  const [timeFrame, setTimeFrame] = useState("march");
  const queryClient = useQueryClient();

  // Set up real-time subscriptions for dashboard data
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          // Invalidate dashboard queries when transactions change
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['top-agents'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'location_agent_assignments'
        },
        () => {
          // Invalidate when assignments change
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['top-agents'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'locations'
        },
        () => {
          // Invalidate when locations change
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['top-agents'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getDateRange = (period: string) => {
    const currentDate = new Date();
    
    switch (period) {
      case "march":
        return {
          start: "2025-03-01",
          end: "2025-04-01",
          label: "March 2025"
        };
      case "april":
        return {
          start: "2025-04-01",
          end: "2025-05-01",
          label: "April 2025"
        };
      case "may":
        return {
          start: "2025-05-01",
          end: "2025-06-01",
          label: "May 2025"
        };
      case "june":
        return {
          start: "2025-06-01",
          end: "2025-07-01",
          label: "June 2025"
        };
      case "current-month":
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Current month"
        };
      case "last-month":
        const lastMonth = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
        const lastMonthYear = currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
        return {
          start: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
          end: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`,
          label: "Last month"
        };
      default:
        return {
          start: "2025-03-01",
          end: "2025-04-01",
          label: "March 2025"
        };
    }
  };

  const dateRange = getDateRange(timeFrame);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', timeFrame],
    queryFn: async () => {
      console.log('=== DASHBOARD DATE FILTERING ===');
      console.log('Selected timeframe:', timeFrame);
      console.log('Date range for filtering:', dateRange);
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout, processor, transaction_date')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end);

      if (error) throw error;

      console.log('=== DASHBOARD TRANSACTIONS LOADED ===');
      console.log('Raw transactions found:', transactions?.length || 0);
      console.log('Date range used:', dateRange);
      
      // Sample some transaction dates for debugging
      if (transactions && transactions.length > 0) {
        console.log('Sample transaction dates from Dashboard:', transactions.slice(0, 3).map(t => ({
          account_id: t.account_id,
          transaction_date: t.transaction_date,
          processor: t.processor
        })));
      }

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

      // Calculate total sales volume - FIXED: Properly sum H and I columns for TRNXN
      let totalRevenue = 0;
      let totalAgentPayoutsFromTransactions = 0;
      
      console.log('=== DASHBOARD CALCULATION DEBUG ===');
      console.log('Filtered transactions for timeframe:', transactions?.length || 0);
      
      // Group by processor to see breakdown
      const processorBreakdown: Record<string, { count: number; totalVolume: number; totalBankCard: number; totalDebit: number }> = {};
      
      transactions?.forEach(t => {
        // FIXED: For TRNXN, properly sum both Bank Card Volume (column H) and Debit Card Volume (column I)
        const bankCardVolume = Number(t.volume) || 0;
        const debitCardVolume = Number(t.debit_volume) || 0;
        const totalTransactionVolume = bankCardVolume + debitCardVolume;
        
        totalRevenue += totalTransactionVolume;
        
        const agentPayout = Number(t.agent_payout) || 0;
        totalAgentPayoutsFromTransactions += agentPayout;
        
        // Track processor breakdown
        const processor = t.processor || 'Unknown';
        if (!processorBreakdown[processor]) {
          processorBreakdown[processor] = { count: 0, totalVolume: 0, totalBankCard: 0, totalDebit: 0 };
        }
        processorBreakdown[processor].count++;
        processorBreakdown[processor].totalVolume += totalTransactionVolume;
        processorBreakdown[processor].totalBankCard += bankCardVolume;
        processorBreakdown[processor].totalDebit += debitCardVolume;
      });

      console.log('=== DASHBOARD PROCESSOR BREAKDOWN ===');
      Object.entries(processorBreakdown).forEach(([processor, data]) => {
        console.log(`${processor}:`, {
          transactions: data.count,
          totalVolume: data.totalVolume,
          bankCardVolume: data.totalBankCard,
          debitCardVolume: data.totalDebit,
          percentage: totalRevenue > 0 ? ((data.totalVolume / totalRevenue) * 100).toFixed(2) + '%' : '0%'
        });
      });

      console.log('Dashboard totals for timeframe:', {
        totalRevenue,
        totalAgentPayoutsFromTransactions,
        transactionCount: transactions?.length || 0,
        timeFrame: timeFrame
      });

      // Calculate commissions using our unified logic
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      console.log('Dashboard calculated commissions:', commissions.length);
      
      // Get only external agent commissions (not Merchant Hero)
      const externalAgentCommissions = commissions.filter(c => c.agentName !== 'Merchant Hero');
      const totalExternalCommissions = externalAgentCommissions.reduce((sum, commission) => sum + (commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout), 0);
      
      // Get Merchant Hero commissions (this should be the net after paying other agents)
      const merchantHeroCommissions = commissions.filter(c => c.agentName === 'Merchant Hero');
      const merchantHeroNetFromCommissionCalc = merchantHeroCommissions.reduce((sum, commission) => sum + (commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout), 0);
      
      console.log('Dashboard commission breakdown:', {
        totalExternalCommissions,
        merchantHeroNetFromCommissionCalc,
        externalAgentCount: externalAgentCommissions.length,
        merchantHeroCommissionCount: merchantHeroCommissions.length
      });

      // Use the commission calculation result for Merchant Hero's net income
      // This should already be calculated as agent_payout - external_commissions per location
      const merchantHeroNetIncome = merchantHeroNetFromCommissionCalc;

      // Get locations count
      const { count: locationsCount } = await supabase
        .from('locations')
        .select('*', { count: 'exact', head: true });

      console.log('Final dashboard calculations for timeframe:', {
        timeFrame,
        totalRevenue,
        totalAgentPayoutsFromTransactions,
        totalExternalCommissions,
        merchantHeroNetIncome
      });

      return {
        totalRevenue,
        totalAgentPayouts: totalExternalCommissions, // External agent commissions
        netIncome: merchantHeroNetIncome, // Merchant Hero's net income from commission calc
        locationsCount: locationsCount || 0
      };
    }
  });

  const { data: topAgents, isLoading: agentsLoading } = useQuery({
    queryKey: ['top-agents', timeFrame],
    queryFn: async () => {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout, transaction_date')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end);

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

      // Use the unified commission calculation logic
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      const agentSummaries = groupCommissionsByAgent(commissions);

      // Calculate revenue per agent based on their locations
      const agentStats = agentSummaries.map(summary => {
        const revenue = summary.locations.reduce((sum, loc) => sum + loc.locationVolume, 0);
        return {
          name: summary.agentName,
          revenue,
          commission: summary.totalCommission
        };
      });

      return agentStats
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 4);
    }
  });

  if (isLoading || agentsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Dashboard Overview</h2>
            <p className="text-muted-foreground">Welcome to your Merchant Hero admin dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Time Frame:</label>
            <Select value={timeFrame} onValueChange={setTimeFrame}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select time frame" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="march">March 2025</SelectItem>
                <SelectItem value="april">April 2025</SelectItem>
                <SelectItem value="may">May 2025</SelectItem>
                <SelectItem value="june">June 2025</SelectItem>
                <SelectItem value="current-month">Current Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const dashboardStats = [
    {
      title: "Total Sales Volume",
      value: `$${stats?.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}`,
      change: dateRange.label,
      trend: "up",
      icon: DollarSign,
    },
    {
      title: "Agent Payouts",
      value: `$${stats?.totalAgentPayouts.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}`,
      change: dateRange.label,
      trend: "up",
      icon: Users,
    },
    {
      title: "Net Income",
      value: `$${stats?.netIncome.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}`,
      change: dateRange.label,
      trend: "up",
      icon: TrendingUp,
    },
    {
      title: "Active Locations",
      value: stats?.locationsCount.toString() || "0",
      change: "Total locations",
      trend: "up",
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Dashboard Overview</h2>
          <p className="text-muted-foreground">Welcome to your Merchant Hero admin dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Time Frame:</label>
          <Select value={timeFrame} onValueChange={setTimeFrame}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select time frame" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="march">March 2025</SelectItem>
              <SelectItem value="april">April 2025</SelectItem>
              <SelectItem value="may">May 2025</SelectItem>
              <SelectItem value="june">June 2025</SelectItem>
              <SelectItem value="current-month">Current Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{dateRange.label} P&L Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Sales Volume</span>
                <span className="font-semibold">${stats?.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Agent Commissions</span>
                <span className="font-semibold text-red-600">-${stats?.totalAgentPayouts.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Merchant Hero Net Income</span>
                  <span className="font-bold text-emerald-600">${stats?.netIncome.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing Agents ({dateRange.label})</CardTitle>
          </CardHeader>
          <CardContent>
            {topAgents && topAgents.length > 0 ? (
              <div className="space-y-3">
                {topAgents.map((agent) => (
                  <div key={agent.name} className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-sm text-muted-foreground">Revenue: ${agent.revenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">${agent.commission.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className="text-sm text-muted-foreground">
                        {agent.name === 'Merchant Hero' ? 'Net Income' : 'Commission'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">No agent data available for this period. Upload transaction data to see performance.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
