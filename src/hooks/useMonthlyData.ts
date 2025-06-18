
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

      // First, let's check what data exists in the pl_data table
      const { data: allPlData, error: allError } = await supabase
        .from('pl_data')
        .select('*')
        .order('month');

      if (allError) {
        console.error('📊 MAVERICK DEBUG: Error fetching all P&L data:', allError);
      } else {
        console.log('📊 MAVERICK DEBUG: All P&L data in table:', allPlData?.length || 0, 'records');
        console.log('📊 MAVERICK DEBUG: Sample records:', allPlData?.slice(0, 3));
      }

      // Now fetch the filtered data
      const { data, error } = await supabase
        .from('pl_data')
        .select('*')
        .gte('month', fromFormatted)
        .lte('month', toFormatted)
        .order('month');

      if (error) {
        console.error('📊 MAVERICK DEBUG: Error fetching filtered P&L data:', error);
        throw error;
      }

      console.log('📊 MAVERICK DEBUG: Filtered P&L data:', data?.length || 0, 'records');
      console.log('📊 MAVERICK DEBUG: Filtered data sample:', data?.slice(0, 3));

      return data || [];
    },
    enabled: !!dateRange
  });
};
