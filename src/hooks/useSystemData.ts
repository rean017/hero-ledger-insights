
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLocationCommissions } from "@/utils/commissionCalculations";
import { format } from "date-fns";

interface SystemDataOptions {
  timeFrame: string;
  customDateRange?: { from: Date; to: Date };
  enableRealtime?: boolean;
}

export const useSystemData = (options: SystemDataOptions) => {
  const { timeFrame, customDateRange, enableRealtime = false } = options;
  const queryClient = useQueryClient();

  // Helper to get date range
  const getDateRange = (frame: string) => {
    if (frame === 'custom' && customDateRange) {
      return {
        from: format(customDateRange.from, 'yyyy-MM-dd'),
        to: format(customDateRange.to, 'yyyy-MM-dd')
      };
    }
    
    const ranges = {
      march: { from: '2025-03-01', to: '2025-03-31' },
      april: { from: '2025-04-01', to: '2025-04-30' },
      may: { from: '2025-05-01', to: '2025-05-31' },
      june: { from: '2025-06-01', to: '2025-06-30' }
    };
    
    return ranges[frame as keyof typeof ranges] || ranges.march;
  };

  const dateRange = getDateRange(timeFrame);

  // Fetch all system data in one optimized query
  const { data, isLoading, error } = useQuery({
    queryKey: ['system-data', timeFrame, customDateRange],
    queryFn: async () => {
      console.log('🚀 SYSTEM DATA: Fetching unified data for', timeFrame, dateRange);
      
      // Fetch all data concurrently
      const [
        { data: locations, error: locationsError },
        { data: assignments, error: assignmentsError },
        { data: transactions, error: transactionsError },
        { data: agents, error: agentsError }
      ] = await Promise.all([
        supabase.from('locations').select('*').order('name'),
        supabase.from('location_agent_assignments').select('*').eq('is_active', true),
        supabase.from('transactions').select('*')
          .gte('transaction_date', dateRange.from)
          .lte('transaction_date', dateRange.to),
        supabase.from('agents').select('*').eq('is_active', true).order('name')
      ]);

      if (locationsError) throw locationsError;
      if (assignmentsError) throw assignmentsError;
      if (transactionsError) throw transactionsError;
      if (agentsError) throw agentsError;

      // Calculate commissions using optimized logic
      const commissions = calculateLocationCommissions(
        transactions || [],
        assignments || [],
        locations || []
      );

      // Calculate aggregated stats
      const stats = {
        totalRevenue: transactions?.reduce((sum, t) => sum + ((Number(t.volume) || 0) + (Number(t.debit_volume) || 0)), 0) || 0,
        totalAgentPayouts: transactions?.reduce((sum, t) => sum + (Number(t.agent_payout) || 0), 0) || 0,
        locationsCount: locations?.length || 0,
        transactionsCount: transactions?.length || 0
      };

      // Create enriched locations with commission data
      const enrichedLocations = locations?.map(location => {
        const locationAssignments = assignments?.filter(a => a.location_id === location.id) || [];
        const locationCommissions = commissions.filter(c => c.locationId === location.id);
        
        // Calculate actual volume from transactions for this location
        const locationTransactions = transactions?.filter(t => 
          t.location_id === location.id || t.account_id === location.account_id
        ) || [];
        
        const totalVolume = locationTransactions.reduce((sum, t) => {
          const bankCardVolume = Number(t.volume) || 0;
          const debitCardVolume = Number(t.debit_volume) || 0;
          return sum + bankCardVolume + debitCardVolume;
        }, 0);
        
        const totalCommission = locationCommissions.reduce((sum, c) => 
          sum + (c.agentName === 'Merchant Hero' ? c.merchantHeroPayout : c.agentPayout), 0
        );

        return {
          ...location,
          assignedAgents: locationAssignments.length,
          totalVolume,
          totalCommission,
          agentNames: locationAssignments.map(a => a.agent_name).join(', '),
          assignments: locationAssignments,
          commissions: locationCommissions
        };
      }) || [];

      console.log('✅ SYSTEM DATA: Successfully processed', {
        locations: locations?.length,
        transactions: transactions?.length,
        commissions: commissions.length,
        stats
      });

      return {
        locations: enrichedLocations,
        assignments: assignments || [],
        transactions: transactions || [],
        agents: agents || [],
        commissions,
        stats
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (replaced cacheTime)
    refetchOnWindowFocus: false
  });

  // Invalidate cache when data changes
  const invalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: ['system-data'] });
  };

  return {
    data,
    isLoading,
    error,
    invalidateCache,
    dateRange: dateRange ? { from: new Date(dateRange.from), to: new Date(dateRange.to) } : null
  };
};
