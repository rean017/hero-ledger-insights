
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

      // First, check for P&L data in pl_data table
      const { data: plData, error: plError } = await supabase
        .from('pl_data')
        .select('*')
        .gte('month', fromFormatted)
        .lte('month', toFormatted)
        .order('month');

      if (plError) {
        console.error('📊 MAVERICK DEBUG: Error fetching P&L data:', plError);
      } else {
        console.log('📊 MAVERICK DEBUG: P&L data found:', plData?.length || 0, 'records');
      }

      // If we have P&L data, use it
      if (plData && plData.length > 0) {
        console.log('📊 MAVERICK DEBUG: Using P&L data from pl_data table');
        return plData;
      }

      // Fallback: Check transactions table for Maverick data and aggregate it
      console.log('📊 MAVERICK DEBUG: No P&L data found, checking transactions table...');
      
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .eq('processor', 'Maverick')
        .gte('transaction_date', fromFormatted)
        .lte('transaction_date', toFormatted);

      if (transError) {
        console.error('📊 MAVERICK DEBUG: Error fetching transactions:', transError);
        return [];
      }

      console.log('📊 MAVERICK DEBUG: Maverick transactions found:', transactions?.length || 0, 'records');

      if (!transactions || transactions.length === 0) {
        console.log('📊 MAVERICK DEBUG: No Maverick transactions found for date range');
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
        id: 'maverick-aggregated',
        month: fromFormatted,
        processor: 'Maverick',
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
