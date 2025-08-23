import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AgentSummary = {
  agent_id: string;
  agent_name: string;
  location_count: number;
  total_volume: number;
  total_payout: number;
  avg_bps: number;
};

export function useAgentSummary(month: string) {
  const [data, setData] = useState<AgentSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    
    async function load() {
      if (!month) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase.rpc('mh_agent_summary', { 
          p_month: month 
        });
        
        if (cancelled) return;
        
        if (error) {
          setError(error.message);
          setData(null);
        } else {
          setData(data ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setData(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    
    load();
    return () => { cancelled = true; };
  }, [month]);

  return { data, loading, error };
}