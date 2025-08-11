import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MonthlyDataRow {
  id: string;
  location_name: string;
  total_volume: number;
  mh_net_payout: number;
  is_zero_volume: boolean;
}

export const useMonthlyDataNew = (month: string | null) => {
  return useQuery({
    queryKey: ['monthly-data-new', month],
    queryFn: async () => {
      if (!month) return [];

      // Query the new stable schema
      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select(`
          id,
          total_volume,
          mh_net_payout,
          is_zero_volume,
          locations_new!location_id (
            name
          )
        `)
        .eq('month', month)
        .order('total_volume', { ascending: false });

      if (error) {
        console.error('Error fetching monthly data:', error);
        throw error;
      }

      // Transform the data to match the expected interface
      const transformedData: MonthlyDataRow[] = data.map(item => ({
        id: item.id,
        location_name: (item.locations_new as any)?.name || 'Unknown',
        total_volume: item.total_volume,
        mh_net_payout: item.mh_net_payout,
        is_zero_volume: item.is_zero_volume
      }));

      return transformedData;
    },
    enabled: !!month,
  });
};

export const useAvailableMonthsNew = () => {
  return useQuery({
    queryKey: ['available-months-new'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select('month')
        .order('month', { ascending: false });

      if (error) {
        console.error('Error fetching available months:', error);
        throw error;
      }

      // Get unique months
      const uniqueMonths = Array.from(
        new Set(data.map(item => item.month))
      ).sort((a, b) => b.localeCompare(a));

      return uniqueMonths;
    },
  });
};