import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/integrations/supabase/client';

export type AgentRow = {
  location_id: string;
  location_name: string;
  month_key: string;   // "YYYY-MM"
  total_volume: number;
  bps: number;
  commission: number;
};

export function useAgentReport(agentId: string | null, monthAny: string | Date | null) {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(() => {
    if (!monthAny) return null;
    return dayjs(monthAny, ['YYYY-MM', 'YYYY-MM-DD', 'MMMM YYYY']).format('YYYY-MM');
  }, [monthAny]);

  useEffect(() => {
    async function load() {
      if (!agentId || !monthKey) {
        setRows([]);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase.rpc('mh_agent_monthly_report', {
          p_agent_id: agentId,
          p_month_key: monthKey,
        });
        
        if (error) throw error;
        setRows((data ?? []) as AgentRow[]);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load report');
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    
    load();
  }, [agentId, monthKey]);

  const totals = useMemo(() => {
    const volume = rows.reduce((acc, r) => acc + (Number(r.total_volume) || 0), 0);
    const commission = rows.reduce((acc, r) => acc + (Number(r.commission) || 0), 0);
    return { volume, commission };
  }, [rows]);

  return { rows, totals, loading, error, monthKey };
}