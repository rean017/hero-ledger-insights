import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  try {
    const { month, rows, filename } = await req.json();

    // 1) Validate inputs
    if (!month || !rows?.length) {
      return new Response(JSON.stringify({ error: 'Month and rows required' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    // Use service role for bulk operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2) Normalize month → first of month
    const monthStr = month.replace(/\//g, '-');
    const ms = new Date(`${monthStr}-01T00:00:00Z`);
    if (isNaN(ms.getTime())) {
      return new Response(JSON.stringify({ error: 'Invalid month format. Use YYYY-MM or YYYY/MM' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }
    const monthStart = `${ms.getUTCFullYear()}-${String(ms.getUTCMonth() + 1).padStart(2, '0')}-01`;

    // 3) Normalize rows (strip $, commas, parens)
    const parseNumber = (v: string | number): number => {
      if (typeof v === 'number') return v;
      if (!v) return 0;
      const s = String(v).trim().replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, '');
      // handle (123.45) negatives
      return Number(s.replace(/^\((.*)\)$/, '-$1')) || 0;
    };

    const cleaned = rows.map((r: any) => ({
      location: String(r.location ?? r.DBA ?? r.Location ?? '').trim(),
      volume: parseNumber(r.volume ?? r.Volume ?? r.total_volume),
      mh_net: parseNumber(r.agent_net ?? r['Agent Net Payout'] ?? r['Agent Net Revenue'] ?? r.agentNet)
    })).filter((r: any) => r.location.length > 0);

    if (!cleaned.length) {
      return new Response(JSON.stringify({ error: 'No valid rows found after processing' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    console.log(`Processing ${cleaned.length} rows for month ${monthStart}`);

    // 4) Call the PostgreSQL function for bulk processing
    const { data, error } = await supabase.rpc('mh_upload_master', {
      p_month: monthStart,
      p_filename: filename || 'upload',
      p_locations: cleaned.map(r => r.location),
      p_volumes: cleaned.map(r => r.volume),
      p_mh_nets: cleaned.map(r => r.mh_net)
    });

    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ 
        error: error.message || 'Database operation failed',
        code: error.code 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    console.log('Upload successful:', data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });

  } catch (e: any) {
    console.error('Upload error:', e);
    return new Response(JSON.stringify({ 
      error: e.message || 'Upload failed' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});