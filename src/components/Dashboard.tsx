import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Users, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";

const Dashboard = () => {
  const [timeFrame, setTimeFrame] = useState("current-month");

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
          end: `${currentYear}-${String(quarterStart + 4).padStart(2, '0')}-01`,
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

  const dateRange = getDateRange(timeFrame);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', timeFrame],
    queryFn: async () => {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
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

      // Calculate total sales volume from all transactions
      let totalRevenue = 0;
      transactions?.forEach(t => {
        const volume = Number(t.volume) || 0;
        const debitVolume = Number(t.debit_volume) || 0;
        totalRevenue += volume + debitVolume;
      });

      // Use the unified commission calculation logic
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      
      // Calculate total agent payouts (what we pay to all agents including Merchant Hero net)
      const totalAgentPayouts = commissions.reduce((sum, commission) => sum + commission.commission, 0);
      
      // Merchant Hero's net income is already calculated correctly in the commission logic
      const merchantHeroCommission = commissions.find(c => c.agentName === 'Merchant Hero');
      const merchantHeroNet = merchantHeroCommission ? merchantHeroCommission.commission : 0;

      // Get locations count
      const { count: locationsCount } = await supabase
        .from('locations')
        .select('*', { count: 'exact', head: true });

      console.log('Dashboard calculations:', {
        totalRevenue,
        totalAgentPayouts,
        merchantHeroNet,
        commissionsBreakdown: commissions
      });

      return {
        totalRevenue,
        totalAgentPayouts,
        netIncome: merchantHeroNet, // This is Merchant Hero's actual net income
        locationsCount: locationsCount || 0
      };
    }
  });

  const { data: topAgents, isLoading: agentsLoading } = useQuery({
    queryKey: ['top-agents', timeFrame],
    queryFn: async () => {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
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
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const dashboardStats = [
    {
      title: "Total Sales Volume",
      value: `$${stats?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`,
      change: dateRange.label,
      trend: "up",
      icon: DollarSign,
    },
    {
      title: "Agent Payouts",
      value: `$${(stats?.totalAgentPayouts - (stats?.netIncome || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`,
      change: dateRange.label,
      trend: "up",
      icon: Users,
    },
    {
      title: "Net Income",
      value: `$${stats?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`,
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
              <SelectItem value="current-month">Current Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="current-quarter">Current Quarter</SelectItem>
              <SelectItem value="current-year">Current Year</SelectItem>
              <SelectItem value="last-12-months">Last 12 Months</SelectItem>
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
                <span className="font-semibold">${stats?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Agent Commissions</span>
                <span className="font-semibold text-red-600">-${((stats?.totalAgentPayouts || 0) - (stats?.netIncome || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Merchant Hero Net Income</span>
                  <span className="font-bold text-emerald-600">${stats?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
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
                      <p className="text-sm text-muted-foreground">Revenue: ${agent.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">${agent.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
