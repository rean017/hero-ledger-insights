
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLocationCommissions } from "@/utils/commissionCalculations";
import { calculateLocationVolume, calculateTotalVolume } from "@/utils/volumeCalculations";
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
      console.log('📅 IMPORTANT: TRNXN transactions are dated 2025-06-01. Current timeframe may not include TRNXN data!');
      
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

      // Calculate aggregated stats using standardized volume calculation
      const stats = {
        totalRevenue: calculateTotalVolume(transactions || []),
        totalAgentPayouts: transactions?.reduce((sum, t) => sum + (Number(t.agent_payout) || 0), 0) || 0,
        locationsCount: locations?.length || 0,
        transactionsCount: transactions?.length || 0
      };

      // Create enriched locations with commission data
      const enrichedLocations = locations?.map(location => {
        const locationAssignments = assignments?.filter(a => a.location_id === location.id) || [];
        const locationCommissions = commissions.filter(c => c.locationId === location.id);
        
        // Enhanced debugging for raw transactions before volume calculation
        const allMatchingTransactions = transactions?.filter(t => 
          t.location_id === location.id || t.account_id === location.account_id
        ) || [];
        
        console.log(`🔍 VOLUME DEBUG - ${location.name}:`, {
          locationId: location.id,
          accountId: location.account_id,
          matchingTransactions: allMatchingTransactions.length,
          sampleTransaction: allMatchingTransactions[0],
          dateRange: { from: dateRange.from, to: dateRange.to }
        });
        
        // CRITICAL: Check if we're calling calculateLocationVolume multiple times or with wrong data
        console.log(`🚀 ABOUT TO CALL calculateLocationVolume for ${location.name}:`, {
          locationName: location.name,
          locationId: location.id,
          accountId: location.account_id,
          totalTransactionsAvailable: transactions?.length || 0,
          isExpectedBrickAndBrew: location.name.toLowerCase().includes('brick') || location.account_id === '1058'
        });
        
        // Calculate actual volume using standardized utility
        const totalVolume = calculateLocationVolume(
          transactions || [], 
          location.id, 
          location.account_id
        );
        
        console.log(`✅ VOLUME CALCULATION COMPLETE for ${location.name}: $${totalVolume}`);
        
        // Enhanced debugging for TRNXN locations specifically
        if (allMatchingTransactions.some(t => t.processor === 'TRNXN') || location.name.toLowerCase().includes('brick')) {
          console.log(`🚨 TRNXN LOCATION DEBUG - ${location.name}:`, {
            locationId: location.id,
            accountId: location.account_id,
            calculatedVolume: totalVolume,
            expectedVolume: 177088.88, // What we expect for Brick & Brew
            rawTransactions: allMatchingTransactions.map(t => ({
              processor: t.processor,
              volume: t.volume,
              debit_volume: t.debit_volume,
              transaction_date: t.transaction_date,
              account_id: t.account_id,
              location_id: t.location_id,
              calculatedVolume: t.processor === 'TRNXN' ? Number(t.volume) : (Number(t.volume) || 0) + (Number(t.debit_volume) || 0)
            }))
          });
        }
        
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
