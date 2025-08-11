
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export const useMonthlyData = (timeFrame: string, customDateRange: { from: Date; to: Date } | undefined, dateRange: { from: Date; to: Date } | null) => {
  return useQuery({
    queryKey: ['monthly-pl-data', timeFrame, customDateRange],
    queryFn: async () => {
      console.log('📊 MAVERICK DEBUG: Starting P&L data fetch...');
      console.log('📊 MAVERICK DEBUG: TimeFrame:', timeFrame);
      console.log('📊 MAVERICK DEBUG: Date range:', dateRange);

      if (!dateRange) {
        console.log('📊 MAVERICK DEBUG: No date range available, skipping P&L data fetch');
        return [];
      }

      const fromFormatted = format(dateRange.from, 'yyyy-MM-dd');
      const toFormatted = format(dateRange.to, 'yyyy-MM-dd');

      console.log('📊 MAVERICK DEBUG: Formatted dates - From:', fromFormatted, 'To:', toFormatted);

      // Check monthly_data table directly
      const { data: monthlyData, error: monthlyError } = await supabase
        .from('monthly_data')
        .select('*')
        .gte('month', fromFormatted)
        .lte('month', toFormatted)
        .order('month');

      if (monthlyError) {
        console.error('📊 DEBUG: Error fetching monthly data:', monthlyError);
      } else {
        console.log('📊 DEBUG: Monthly data found:', monthlyData?.length || 0, 'records');
      }

      // If we have monthly data, use it directly
      if (monthlyData && monthlyData.length > 0) {
        console.log('📊 DEBUG: Using monthly data');
        return monthlyData.map(item => ({
          id: item.id,
          month: item.month,
          processor: 'Monthly',
          total_volume: item.volume,
          total_debit_volume: 0,
          total_agent_payouts: item.agent_payout,
          net_income: item.volume - item.agent_payout,
          created_at: item.created_at,
          updated_at: item.updated_at
        }));
      }

      // Fallback: Check transactions table and aggregate across all processors
      console.log('📊 P&L DEBUG: No P&L data found, aggregating transactions across all processors...');
      
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .gte('transaction_date', fromFormatted)
        .lte('transaction_date', toFormatted);

      if (transError) {
        console.error('📊 P&L DEBUG: Error fetching transactions:', transError);
        return [];
      }

      console.log('📊 P&L DEBUG: Transactions found for aggregation:', transactions?.length || 0, 'records');

      if (!transactions || transactions.length === 0) {
        console.log('📊 P&L DEBUG: No transactions found for date range');
        return [];
      }

      // Aggregate transaction data into P&L format
      const totalVolume = transactions.reduce((sum, t) => {
        const volume = Number(t.volume) || 0;
        return sum + volume;
      }, 0);

      const totalDebitVolume = transactions.reduce((sum, t) => {
        const debitVolume = Number(t.debit_volume) || 0;
        return sum + debitVolume;
      }, 0);

      const totalAgentPayouts = transactions.reduce((sum, t) => {
        const payout = Number(t.agent_payout) || 0;
        return sum + payout;
      }, 0);

      // Create aggregated P&L data structure
      const aggregatedData = [{
        id: 'aggregated-all-processors',
        month: fromFormatted,
        processor: 'All',
        total_volume: totalVolume,
        total_debit_volume: totalDebitVolume,
        total_agent_payouts: totalAgentPayouts,
        net_income: totalAgentPayouts, // For now, use payouts as net income
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }];

      console.log('📊 MAVERICK DEBUG: Aggregated P&L data created:', {
        totalVolume: totalVolume.toLocaleString(),
        totalDebitVolume: totalDebitVolume.toLocaleString(),
        totalAgentPayouts: totalAgentPayouts.toLocaleString(),
        transactionCount: transactions.length
      });

      return aggregatedData;
    },
    enabled: !!dateRange
  });
};
