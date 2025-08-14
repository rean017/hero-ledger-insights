import { createClient } from '@supabase/supabase-js';

const normalizeMonth = (input: string) => {
  const base = String(input || '').trim().replace(/\//g, '-'); // allow 2025/6
  const m = /^(\d{4})-(\d{1,2})$/.exec(base);
  if (!m) throw new Error('Invalid month — use YYYY-MM');
  const y = +m[1], mm = +m[2];
  if (mm < 1 || mm > 12) throw new Error('Invalid month — use 01–12');
  return `${y}-${String(mm).padStart(2, '0')}-01`; // store first-of-month
};

const toNumber = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\$/g,'').replace(/,/g,'').replace(/\s/g,'').trim();
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

    const locs: string[] = [], vols: number[] = [], nets: number[] = [];
    for (const r of rows) {
      const name = String(r.location ?? r.DBA ?? r.Location ?? '').trim();
      if (!name) continue;
      locs.push(name);
      vols.push(toNumber(r.volume ?? r.Volume ?? r.TPV));
      nets.push(toNumber(r.agent_net ?? r['Agent Net Payout'] ?? r['Agent Net Revenue'] ?? r.Residuals));
    }
    if (locs.length === 0) return res.status(400).json({ error: 'No valid rows after mapping' });

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    return res.status(400).json({ error: e.message || 'Upload failed' });
  }
}