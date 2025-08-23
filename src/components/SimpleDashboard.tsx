import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, DollarSign, MapPin, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatMoneyExact } from '@/lib/numberFormat';

interface MonthlyStats {
  totalVolume: number;
  totalAgentPayout: number;
  netIncome: number;
  totalLocations: number;
  totalAgents: number;
}

export const SimpleDashboard = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Get available months from stable schema
  const { data: availableMonths = [] } = useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select('month')
        .order('month', { ascending: false });
      
      if (error) throw error;
      
      const uniqueMonths = [...new Set(data.map(d => d.month))];
      return uniqueMonths;
    }
  });

  // Set default month to the latest available
  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Get monthly statistics from new stable schema
  const { data: monthlyStats, isLoading } = useQuery({
    queryKey: ['monthly-stats-new', selectedMonth],
    queryFn: async (): Promise<MonthlyStats> => {
      if (!selectedMonth) return {
        totalVolume: 0,
        totalAgentPayout: 0,
        netIncome: 0,
        totalLocations: 0,
        totalAgents: 0
      };

      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select(`
          total_volume,
          mh_net_payout,
          locations (
            name
          )
        `)
        .eq('month', selectedMonth);
      
      if (error) throw error;

      const totalVolume = data.reduce((sum, row) => sum + Number(row.total_volume), 0);
      const totalAgentPayout = data.reduce((sum, row) => sum + Number(row.mh_net_payout), 0);
      const netIncome = totalVolume - totalAgentPayout;
      const totalLocations = data.length;
      const totalAgents = 1; // For now, since we're tracking MH net payout

      return {
        totalVolume,
        totalAgentPayout,
        netIncome,
        totalLocations,
        totalAgents
      };
    },
    enabled: !!selectedMonth
  });

  const formatCurrency = (amount: number) => formatMoneyExact(amount);

  const formatMonthDisplay = (monthStr: string) => {
    try {
      return format(parseISO(monthStr), 'MMMM yyyy');
    } catch {
      return monthStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Commission Dashboard</h1>
          <p className="text-muted-foreground">Track agent commissions and performance</p>
        </div>
        
        <div className="w-48">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="focus-brand">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map(month => (
                <SelectItem key={month} value={month}>
                  {formatMonthDisplay(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedMonth && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="card-base card-hover focus-brand transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-700">Total Sales Volume</CardTitle>
              <TrendingUp className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900">
                {isLoading ? '...' : formatCurrency(monthlyStats?.totalVolume || 0)}
              </div>
              <Badge className="mt-2 bg-brand-50 text-brand-700 hover:bg-brand-100">
                {formatMonthDisplay(selectedMonth)}
              </Badge>
            </CardContent>
          </Card>

          <Card className="card-base card-hover focus-brand transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-700">Total Agent Payout</CardTitle>
              <DollarSign className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900">
                {isLoading ? '...' : formatCurrency(monthlyStats?.totalAgentPayout || 0)}
              </div>
              <Badge className="mt-2 bg-brand-50 text-brand-700 hover:bg-brand-100">
                Agent Commissions
              </Badge>
            </CardContent>
          </Card>

          <Card className="card-base card-hover focus-brand transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-700">Net Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900">
                {isLoading ? '...' : formatCurrency(monthlyStats?.netIncome || 0)}
              </div>
              <Badge className="mt-2 bg-brand-50 text-brand-700 hover:bg-brand-100">
                After Commissions
              </Badge>
            </CardContent>
          </Card>

          <Card className="card-base card-hover focus-brand transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-700">Active Locations</CardTitle>
              <MapPin className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900">
                {isLoading ? '...' : monthlyStats?.totalLocations || 0}
              </div>
              <Badge className="mt-2 bg-brand-50 text-brand-700 hover:bg-brand-100">
                {isLoading ? '...' : `${monthlyStats?.totalAgents || 0} Agents`}
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {!selectedMonth && availableMonths.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
            <p className="text-muted-foreground text-center">
              Upload monthly commission data to get started with tracking agent performance and commissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};