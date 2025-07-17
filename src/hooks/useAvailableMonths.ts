
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAvailableMonths } from "@/utils/timeFrameUtils";

export const useAvailableMonths = () => {
  return useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      console.log('🗓️ Fetching available months from database...');
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('transaction_date')
        .not('transaction_date', 'is', null)
        .order('transaction_date', { ascending: false });

      if (error) {
        console.error('❌ Error fetching transactions for months:', error);
        throw error;
      }

      console.log('📊 Raw transaction dates from DB:', transactions?.slice(0, 5));
      
      const months = getAvailableMonths(transactions || []);
      console.log('📅 Available months found:', months);
      
      return months;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false
  });
};
