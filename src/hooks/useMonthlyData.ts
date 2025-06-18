
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export const useMonthlyData = (timeFrame: string, customDateRange: { from: Date; to: Date } | undefined, dateRange: { from: Date; to: Date } | null) => {
  return useQuery({
    queryKey: ['monthly-pl-data', timeFrame, customDateRange],
    queryFn: async () => {
      if (!dateRange) {
        console.log('📊 UnifiedLocations: No date range available, skipping P&L data fetch');
        return [];
      }

      console.log('📊 UnifiedLocations: Fetching P&L data for date range:', dateRange);

      const fromFormatted = format(dateRange.from, 'yyyy-MM-dd');
      const toFormatted = format(dateRange.to, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('pl_data')
        .select('*')
        .gte('month', fromFormatted)
        .lte('month', toFormatted)
        .order('month');

      if (error) {
        console.error('📊 UnifiedLocations: Error fetching P&L data:', error);
        throw error;
      }

      console.log('📊 UnifiedLocations: P&L data fetched:', data?.length || 0, 'records');
      return data || [];
    },
    enabled: !!dateRange
  });
};
