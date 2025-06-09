
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Users, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Get current month's data
      const currentDate = new Date();
      const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_payout, agent_name')
        .gte('transaction_date', `${currentMonth}-01`)
        .lt('transaction_date', `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 2).padStart(2, '0')}-01`);

      if (error) throw error;

      const totalRevenue = transactions?.reduce((sum, t) => sum + (t.volume || 0), 0) || 0;
      const totalAgentPayouts = transactions?.reduce((sum, t) => sum + (t.agent_payout || 0), 0) || 0;
      const netIncome = totalRevenue - totalAgentPayouts;
      const uniqueAgents = new Set(transactions?.map(t => t.agent_name).filter(Boolean)).size;

      // Get locations count
      const { count: locationsCount } = await supabase
        .from('locations')
        .select('*', { count: 'exact', head: true });

      return {
        totalRevenue,
        totalAgentPayouts,
        netIncome,
        locationsCount: locationsCount || 0
      };
    }
  });

  const { data: topAgents, isLoading: agentsLoading } = useQuery({
    queryKey: ['top-agents'],
    queryFn: async () => {
      const currentDate = new Date();
      const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('agent_name, volume, agent_payout')
        .gte('transaction_date', `${currentMonth}-01`)
        .lt('transaction_date', `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 2).padStart(2, '0')}-01`)
        .not('agent_name', 'is', null);

      if (error) throw error;

      const agentStats = transactions?.reduce((acc, t) => {
        const name = t.agent_name!;
        if (!acc[name]) {
          acc[name] = { revenue: 0, commission: 0 };
        }
        acc[name].revenue += t.volume || 0;
        acc[name].commission += t.agent_payout || 0;
        return acc;
      }, {} as Record<string, { revenue: number; commission: number }>) || {};

      return Object.entries(agentStats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 4);
    }
  });

  if (isLoading || agentsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Dashboard Overview</h2>
          <p className="text-muted-foreground">Welcome to your Merchant Hero admin dashboard</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const dashboardStats = [
    {
      title: "Monthly Revenue",
      value: `$${stats?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`,
      change: "Current month",
      trend: "up",
      icon: DollarSign,
    },
    {
      title: "Agent Payouts",
      value: `$${stats?.totalAgentPayouts.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`,
      change: "Current month",
      trend: "up",
      icon: Users,
    },
    {
      title: "Net Income",
      value: `$${stats?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`,
      change: "Current month",
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
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Dashboard Overview</h2>
        <p className="text-muted-foreground">Welcome to your Merchant Hero admin dashboard</p>
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
            <CardTitle>Current Month P&L Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <span className="font-semibold">${stats?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Agent Commissions</span>
                <span className="font-semibold text-red-600">-${stats?.totalAgentPayouts.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Net Income</span>
                  <span className="font-bold text-emerald-600">${stats?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing Agents</CardTitle>
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
                      <p className="text-sm text-muted-foreground">Commission</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">No agent data available. Upload transaction data to see performance.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
