
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, TrendingUp, TrendingDown } from "lucide-react";
import FileUpload from "./FileUpload";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const PLReports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("current-month");

  const { data: monthlyData, isLoading } = useQuery({
    queryKey: ['monthly-pl-data'],
    queryFn: async () => {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('transaction_date, volume, debit_volume, agent_payout, processor')
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      // Group by month
      const monthlyStats = transactions?.reduce((acc, t) => {
        if (!t.transaction_date) return acc;
        
        const monthKey = t.transaction_date.substring(0, 7); // YYYY-MM
        if (!acc[monthKey]) {
          acc[monthKey] = {
            month: new Date(monthKey + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
            revenue: 0,
            expenses: 0,
            netIncome: 0,
            agentPayouts: 0
          };
        }
        
        acc[monthKey].revenue += t.volume || 0;
        acc[monthKey].agentPayouts += t.agent_payout || 0;
        
        return acc;
      }, {} as Record<string, any>) || {};

      // Calculate net income and growth
      const sortedMonths = Object.entries(monthlyStats)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([key, data], index, array) => {
          const netIncome = data.revenue - data.agentPayouts;
          let growth = 0;
          
          if (index < array.length - 1) {
            const prevNetIncome = array[index + 1][1].revenue - array[index + 1][1].agentPayouts;
            if (prevNetIncome > 0) {
              growth = ((netIncome - prevNetIncome) / prevNetIncome) * 100;
            }
          }
          
          return {
            ...data,
            netIncome,
            growth: Number(growth.toFixed(1))
          };
        });

      return sortedMonths.slice(0, 12); // Last 12 months
    }
  });

  const { data: currentMonthSummary } = useQuery({
    queryKey: ['current-month-summary'],
    queryFn: async () => {
      const currentDate = new Date();
      const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, agent_payout')
        .gte('transaction_date', `${currentMonth}-01`)
        .lt('transaction_date', `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 2).padStart(2, '0')}-01`);

      if (error) throw error;

      const totalRevenue = transactions?.reduce((sum, t) => sum + (t.volume || 0), 0) || 0;
      const totalExpenses = transactions?.reduce((sum, t) => sum + (t.agent_payout || 0), 0) || 0;
      const netIncome = totalRevenue - totalExpenses;
      
      return {
        totalRevenue,
        totalExpenses,
        netIncome,
        profitMargin: totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : '0.0'
      };
    }
  });

  const { data: agentPayouts } = useQuery({
    queryKey: ['agent-payouts'],
    queryFn: async () => {
      const currentDate = new Date();
      const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('agent_name, agent_payout, volume')
        .gte('transaction_date', `${currentMonth}-01`)
        .lt('transaction_date', `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 2).padStart(2, '0')}-01`)
        .not('agent_name', 'is', null);

      if (error) throw error;

      const agentStats = transactions?.reduce((acc, t) => {
        const name = t.agent_name!;
        if (!acc[name]) {
          acc[name] = { name, accounts: new Set(), payout: 0, revenue: 0 };
        }
        acc[name].payout += t.agent_payout || 0;
        acc[name].revenue += t.volume || 0;
        return acc;
      }, {} as Record<string, any>) || {};

      return Object.values(agentStats)
        .map((agent: any) => ({
          ...agent,
          accounts: agent.accounts.size,
          rate: agent.revenue > 0 ? ((agent.payout / agent.revenue) * 100).toFixed(2) + '%' : '0%'
        }))
        .sort((a: any, b: any) => b.payout - a.payout);
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
          <p className="text-muted-foreground">Upload transaction data and view comprehensive profit and loss analysis</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
          <p className="text-muted-foreground">Upload transaction data and view comprehensive profit and loss analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button className="gap-2">
            <FileText className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </div>

      {/* File Upload Section */}
      <FileUpload />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Select Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-month">Current Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="quarter">Current Quarter</SelectItem>
                <SelectItem value="year">Current Year</SelectItem>
                <SelectItem value="trailing-12">Trailing 12 Months</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full">Apply Filters</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Month Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Revenue</span>
                <span className="font-semibold">${currentMonthSummary?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Expenses</span>
                <span className="font-semibold text-red-600">${currentMonthSummary?.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Net Income</span>
                  <span className="font-bold text-emerald-600">${currentMonthSummary?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Profit Margin</span>
                <span className="font-semibold text-emerald-600">{currentMonthSummary?.profitMargin || '0.0'}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit Margin</span>
                <span className="font-semibold">{currentMonthSummary?.profitMargin || '0.0'}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data Source</span>
                <span className="font-semibold">Uploaded Files</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly History</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData && monthlyData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-muted-foreground">Month</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Agent Payouts</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Net Income</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((data, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-medium">{data.month}</td>
                      <td className="p-4 font-semibold">${data.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 font-semibold text-orange-600">
                        ${data.agentPayouts.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 font-semibold text-emerald-600">
                        ${data.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          {data.growth >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span className={`font-semibold ${data.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {data.growth > 0 ? '+' : ''}{data.growth}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No historical data available. Upload transaction data to see reports.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Payout Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {agentPayouts && agentPayouts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentPayouts.map((agent: any) => (
                <div key={agent.name} className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2">{agent.name}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Rate:</span>
                      <span>{agent.rate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payout:</span>
                      <span className="font-semibold text-emerald-600">${agent.payout.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No agent payout data available. Upload transaction data to see payouts.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PLReports;
