import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MonthlyLocationData {
  id: string;
  location_name: string;
  total_volume: number;
  mh_net_payout: number;
  is_zero_volume: boolean;
}

export const useMonthlyLocationData = (month: string | null) => {
  return useQuery({
    queryKey: ['monthly-location-data', month],
    queryFn: async () => {
      if (!month) return [];

      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select(`
          id,
          total_volume,
          mh_net_payout,
          is_zero_volume,
          locations!location_id (
            name
          )
        `)
        .eq('month', month)
        .order('total_volume', { ascending: false });

      if (error) {
        console.error('Error fetching monthly location data:', error);
        throw error;
      }

      return data.map(item => ({
        id: item.id,
        location_name: (item.locations as any)?.name || 'Unknown',
        total_volume: item.total_volume,
        mh_net_payout: item.mh_net_payout,
        is_zero_volume: item.is_zero_volume
      })) as MonthlyLocationData[];
    },
    enabled: !!month,
  });
};

export const useAvailableMonths = () => {
  return useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select('month')
        .order('month', { ascending: false });

      if (error) {
        console.error('Error fetching available months:', error);
        throw error;
      }

      const uniqueMonths = Array.from(
        new Set(data.map(item => item.month))
      ).sort((a, b) => b.localeCompare(a));

      return uniqueMonths;
    },
  });
};

export const useUploadHistory = () => {
  return useQuery({
    queryKey: ['upload-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('uploads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching upload history:', error);
        throw error;
      }

      return data;
    },
  });
};