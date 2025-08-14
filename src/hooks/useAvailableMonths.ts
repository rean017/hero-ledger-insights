
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAvailableMonths = () => {
  return useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      console.log('🗓️ Fetching available months from RPC...');
      
      const { data, error } = await supabase.rpc('mh_get_available_months');

      if (error) {
        console.error('❌ Error fetching available months:', error);
        throw error;
      }

      console.log('📅 Available months from RPC:', data);
      
      // RPC returns array of {month: string}, extract just the month values
      const months = (data as { month: string }[]).map(row => row.month);
      
      return months;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false
  });
};

// Safe label from 'YYYY-MM' without Date()
export function fmtMonthLabel(ym: string) {
  const [y, mm] = ym.split('-');
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const i = Math.min(Math.max(parseInt(mm || '1', 10) - 1, 0), 11);
  return `${names[i]} ${y}`;
}
