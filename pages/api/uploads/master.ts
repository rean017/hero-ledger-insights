import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

const normalizeMonth = (s:string) => {
  const t = String(s||'').trim().replace(/\//g,'-');
  const m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (!m) throw new Error('Invalid month — use YYYY-MM');
  const y=+m[1], mm=+m[2]; if (mm<1||mm>12) throw new Error('Invalid month — use 01–12');
  return `${y}-${String(mm).padStart(2,'0')}-01`;
};
const toNumber = (v:any) => {
  if (typeof v==='number') return v;
  const s = String(v??'').replace(/\$/g,'').replace(/,/g,'').replace(/\s/g,'').trim();
  return Number(s.replace(/^\((.*)\)$/,'-$1')) || 0;
};

export default async function handler(req: any, res: any) {
  const json = (code:number,obj:any)=>{res.status(code).setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};
  try {
    if (req.method!=='POST') return json(405,{error:'Method not allowed'});
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500,{error:'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'});

    const body = typeof req.body==='string' ? JSON.parse(req.body) : req.body;
    const { month, rows, filename } = body||{};
    if (!month || !Array.isArray(rows) || rows.length===0) return json(400,{error:'Month and non-empty rows are required'});

    const monthStart = normalizeMonth(month);

    const locs:string[]=[], vols:number[]=[], nets:number[]=[];
    for (const r of rows) {
      const name = String(r.location ?? r.DBA ?? r.Location ?? '').trim();
      if (!name) continue;
      locs.push(name);
      vols.push(toNumber(r.volume ?? r.Volume ?? r.TPV));
      nets.push(toNumber(r.agent_net ?? r['Agent Net Payout'] ?? r['Agent Net Revenue'] ?? r.Residuals));
    }
    if (!locs.length) return json(400,{error:'No valid rows after mapping (check column mapping)'});
    if (!(locs.length===vols.length && vols.length===nets.length)) return json(400,{error:'Mapped arrays differ',details:{locations:locs.length,volumes:vols.length,agentNets:nets.length}});

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa.rpc('mh_upload_master', {
      p_month: monthStart, p_filename: filename||'upload',
      p_locations: locs, p_volumes: vols, p_mh_nets: nets
    });
    if (error) return json(400,{error:error.message, code:(error as any).code});
    return json(200,data);
  } catch (e:any) { return json(400,{error:e?.message||'Upload failed'}); }
}