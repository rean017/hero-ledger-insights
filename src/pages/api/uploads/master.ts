import { createClient } from '@supabase/supabase-js';

// Increase body size limit for large uploads (600-2,000 rows)
export const config = { 
  api: { 
    bodyParser: { 
      sizeLimit: '15mb' 
    } 
  } 
};

const normalizeMonth = (input: string) => {
  const base = String(input || '').trim().replace(/\//g, '-'); // 2025/6 -> 2025-6
  const m = /^(\d{4})-(\d{1,2})$/.exec(base);
  if (!m) throw new Error('Invalid month — use YYYY-MM');
  const y = +m[1], mm = +m[2];
  if (mm < 1 || mm > 12) throw new Error('Invalid month — use 01–12');
  return `${y}-${String(mm).padStart(2,'0')}-01`; // first-of-month
};

const toNumber = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/\$/g,'').replace(/,/g,'').replace(/\s/g,'').trim();
  return Number(s.replace(/^\((.*)\)$/, '-$1')) || 0; // (123.45) -> -123.45
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' }); 
      return;
    }

    // Check for required environment variables
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      res.status(500).json({ 
        error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' 
      });
      return;
    }

    const { month, rows, filename } = req.body || {};
    if (!month || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Month and rows required' }); 
      return;
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
    if (locs.length === 0) { 
      res.status(400).json({ error: 'No valid rows after mapping' }); 
      return; 
    }

    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supa.rpc('mh_upload_master', {
      p_month: monthStart,
      p_filename: filename || 'upload',
      p_locations: locs,
      p_volumes: vols,
      p_mh_nets: nets
    });

    if (error) { 
      res.status(400).json({ error: error.message, code: error.code }); 
      return; 
    }
    res.status(200).json(data);
  } catch (e: any) {
    // ALWAYS JSON, never plain text/HTML
    res.status(400).json({ error: e?.message || 'Upload failed' });
  }
}