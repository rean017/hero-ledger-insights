import { createClient } from '@supabase/supabase-js';

const normalizeMonth = (input: string) => {
  const s = input.replace(/\//g, '-');
  const dt = new Date(`${s}-01T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) throw new Error('Invalid month');
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-01`;
};

const toNumber = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim()
    .replace(/\$/g,'').replace(/,/g,'').replace(/\s/g,'');
  return Number(s.replace(/^\((.*)\)$/, '-$1')) || 0;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { month, rows, filename } = req.body || {};
    if (!month || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Month and rows required' });
    }

    const monthStart = normalizeMonth(month);

    const locs: string[] = [];
    const vols: number[] = [];
    const nets: number[] = [];
    
    for (const r of rows) {
      const name = String(r.location ?? r.DBA ?? r.Location ?? '').trim();
      if (!name) continue;
      locs.push(name);
      vols.push(toNumber(r.volume ?? r.Volume ?? r.TPV));
      nets.push(toNumber(r.agent_net ?? r['Agent Net Payout'] ?? r['Agent Net Revenue'] ?? r.Residuals));
    }
    
    if (locs.length === 0) return res.status(400).json({ error: 'No valid rows after mapping' });

    const supa = createClient(
      'https://twyskqhuxzqzclzoejmd.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3eXNrcWh1eHpxemNsem9lam1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTQ4NDI5OCwiZXhwIjoyMDY1MDYwMjk4fQ.VWvR0Bq6Kw5-mEJJ5xR0sHJjKl7g_EZEyxw_4V2vOJY'
    );
    
    const { data, error } = await supa.rpc('mh_upload_master', {
      p_month: monthStart,
      p_filename: filename || 'upload',
      p_locations: locs,
      p_volumes: vols,
      p_mh_nets: nets
    });

    if (error) return res.status(400).json({ error: error.message, code: error.code });
    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
}