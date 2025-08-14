import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

export async function POST(req: Request) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env as any;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({error:'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'}, {status:500});

    const { month, rows, filename } = await req.json();
    if (!month || !Array.isArray(rows) || rows.length===0) return NextResponse.json({error:'Month and non-empty rows are required'}, {status:400});

    const monthStart = normalizeMonth(month);
    const locs:string[]=[], vols:number[]=[], nets:number[]=[];
    for (const r of rows) {
      const name = String(r.location ?? r.DBA ?? r.Location ?? '').trim();
      if (!name) continue;
      locs.push(name);
      vols.push(toNumber(r.volume ?? r.Volume ?? r.TPV));
      nets.push(toNumber(r.agent_net ?? r['Agent Net Payout'] ?? r['Agent Net Revenue'] ?? r.Residuals));
    }
    if (!locs.length) return NextResponse.json({error:'No valid rows after mapping (check column mapping)'},{status:400});
    if (!(locs.length===vols.length && vols.length===nets.length)) return NextResponse.json({error:'Mapped arrays differ',details:{locations:locs.length,volumes:vols.length,agentNets:nets.length}},{status:400});

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa.rpc('mh_upload_master', {
      p_month: monthStart, p_filename: filename||'upload',
      p_locations: locs, p_volumes: vols, p_mh_nets: nets
    });
    if (error) return NextResponse.json({error:error.message, code:(error as any).code},{status:400});
    return NextResponse.json(data, {status:200});
  } catch (e:any) {
    return NextResponse.json({error:e?.message||'Upload failed'}, {status:400});
  }
}