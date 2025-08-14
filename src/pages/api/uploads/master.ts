import { createClient } from '@supabase/supabase-js';

// Increase body size limit for large uploads
export const config = { 
  api: { 
    bodyParser: { 
      sizeLimit: '20mb' 
    } 
  } 
};

const normalizeMonth = (input: string) => {
  const base = String(input || '').trim().replace(/\//g, '-'); // 2025/6 -> 2025-6
  const m = /^(\d{4})-(\d{1,2})$/.exec(base);
  if (!m) throw new Error('Invalid month — use YYYY-MM');
  const y = +m[1], mm = +m[2];
  if (mm < 1 || mm > 12) throw new Error('Invalid month — use 01–12');
  return `${y}-${String(mm).padStart(2,'0')}-01`;
};

const toNumber = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\$/g,'').replace(/,/g,'').replace(/\s/g,'').trim();
  return Number(s.replace(/^\((.*)\)$/, '-$1')) || 0; // (123.45) -> -123.45
};

function json(res: any, status: number, obj: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(res, 500, {
        error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      });
    }

    let payload: any = {};
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return json(res, 400, { error: 'Request body must be JSON' });
    }

    const { month, rows, filename } = payload || {};
    if (!month || !Array.isArray(rows) || rows.length === 0) {
      return json(res, 400, { error: 'Month and non-empty rows are required' });
    }

    const monthStart = normalizeMonth(month);

    // Build arrays and validate lengths before RPC
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

    if (locs.length === 0) {
      return json(res, 400, { error: 'No valid rows after mapping (check column mapping)' });
    }
    if (!(locs.length === vols.length && vols.length === nets.length)) {
      return json(res, 400, {
        error: 'Mapped arrays are different lengths',
        details: { locations: locs.length, volumes: vols.length, agentNets: nets.length },
      });
    }

    const supa = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data, error } = await supa.rpc('mh_upload_master', {
      p_month: monthStart,
      p_filename: filename || 'upload',
      p_locations: locs,
      p_volumes: vols,
      p_mh_nets: nets,
    });

    if (error) {
      return json(res, 400, {
        error: error.message || 'RPC error',
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }

    return json(res, 200, data);
  } catch (e: any) {
    return json(res, 400, {
      error: e?.message || 'Upload processing failed',
      stack: process.env.NODE_ENV === 'production' ? undefined : e?.stack,
    });
  }
}