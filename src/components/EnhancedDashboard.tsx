
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Users, Building2, Activity } from "lucide-react";
import { useSystemData } from "@/hooks/useSystemData";
import { groupCommissionsByAgent } from "@/utils/commissionCalculations";
import SystemHealthIndicator from "./SystemHealthIndicator";
import { Alert, AlertDescription } from "@/components/ui/alert";

const EnhancedDashboard = () => {
  const [timeFrame, setTimeFrame] = useState("march");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>();

  const { data, isLoading, error } = useSystemData({
    timeFrame,
    customDateRange,
    enableRealtime: true
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-spin" />
            <p className="text-muted-foreground">Loading dashboard data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load dashboard data: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const stats = data?.stats || {
    totalRevenue: 0,
    totalAgentPayouts: 0,
    locationsCount: 0,
    transactionsCount: 0
  };

  const netIncome = stats.totalRevenue - stats.totalAgentPayouts;
  const agentSummaries = data?.commissions ? groupCommissionsByAgent(data.commissions) : [];

  const dashboardStats = [
    {
      title: "Total Sales Volume",
      value: `$${stats.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      change: `${stats.transactionsCount.toLocaleString()} transactions`,
      icon: DollarSign,
    },
    {
      title: "Agent Payouts",
      value: `$${stats.totalAgentPayouts.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      change: `${agentSummaries.length} agents`,
      icon: Users,
    },
    {
      title: "Net Income",
      value: `$${netIncome.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      change: `${((netIncome / stats.totalRevenue) * 100).toFixed(1)}% margin`,
      icon: TrendingUp,
    },
    {
      title: "Active Locations",
      value: stats.locationsCount.toString(),
      change: `${data?.locations.filter(l => l.totalVolume > 0).length || 0} with activity`,
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Enhanced Dashboard</h2>
          <p className="text-muted-foreground">Real-time insights with optimized performance</p>
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
            </SelectContent>
          </Select>
        </div>
      </div>

      <SystemHealthIndicator
        data={data}
        isLoading={isLoading}
        error={error}
        timeFrame={timeFrame}
      />

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
                <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <span className="font-semibold">${stats.totalRevenue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Agent Commissions</span>
                <span className="font-semibold text-red-600">-${stats.totalAgentPayouts.toLocaleString()}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Net Income</span>
                  <span className="font-bold text-emerald-600">${netIncome.toLocaleString()}</span>
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
            {agentSummaries.length > 0 ? (
              <div className="space-y-3">
                {agentSummaries.slice(0, 5).map((agent) => (
                  <div key={agent.agentName} className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{agent.agentName}</p>
                      <p className="text-sm text-muted-foreground">
                        {agent.locations.length} locations
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">
                        ${agent.totalCommission.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {agent.agentName === 'Merchant Hero' ? 'Net Income' : 'Commission'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No agent data available for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EnhancedDashboard;
