// Deno/Edge Function — server-side, uses SERVICE_ROLE, never 404s
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function normalizeMonth(input: string) {
  const base = String(input || "").trim().replace(/\//g, "-"); // 2025/6 -> 2025-6
  const m = /^(\d{4})-(\d{1,2})$/.exec(base);
  if (!m) throw new Error("Invalid month — use YYYY-MM");
  const y = +m[1], mm = +m[2];
  if (mm < 1 || mm > 12) throw new Error("Invalid month — use 01–12");
  return `${y}-${String(mm).padStart(2, "0")}-01`;
}

function toNumber(v: unknown) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/\$/g, "").replace(/,/g, "").replace(/\s/g, "").trim();
  return Number(s.replace(/^\((.*)\)$/, "-$1")) || 0;
}

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    console.log(`${req.method} request received for mh_upload_master_http`);
    
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { 
        status: 405, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    console.log("Environment check:", { 
      hasUrl: Boolean(SUPABASE_URL), 
      hasKey: Boolean(SERVICE_KEY) 
    });
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ 
        error: "Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" 
      }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }

    const body = await req.json().catch(() => ({}));
    const { month, rows, filename } = body || {};
    
    console.log("Request payload:", { 
      month, 
      rowCount: Array.isArray(rows) ? rows.length : 0, 
      filename 
    });
    
    if (!month || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ 
        error: "Month and non-empty rows are required" 
      }), { 
        status: 400, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }

    const monthStart = normalizeMonth(month);
    console.log("Normalized month:", monthStart);

    const locs: string[] = [];
    const vols: number[] = [];
    const nets: number[] = [];
    
    for (const r of rows) {
      const name = String(r.location ?? r.DBA ?? r.Location ?? "").trim();
      if (!name) continue;
      locs.push(name);
      vols.push(toNumber(r.volume ?? r.Volume ?? r.TPV));
      nets.push(toNumber(r.agent_net ?? r["Agent Net Payout"] ?? r["Agent Net Revenue"] ?? r.Residuals));
    }
    
    console.log("Processed arrays:", { 
      locations: locs.length, 
      volumes: vols.length, 
      nets: nets.length 
    });
    
    if (!locs.length) {
      return new Response(JSON.stringify({ 
        error: "No valid rows after mapping (check column mapping)" 
      }), { 
        status: 400, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }
    
    if (!(locs.length === vols.length && vols.length === nets.length)) {
      return new Response(JSON.stringify({ 
        error: "Mapped arrays differ", 
        details: { locations: locs.length, volumes: vols.length, agentNets: nets.length } 
      }), { 
        status: 400, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    
    console.log("Calling mh_upload_master RPC...");
    const { data, error } = await supabase.rpc("mh_upload_master", {
      p_month: monthStart,
      p_filename: filename || "upload",
      p_locations: locs,
      p_volumes: vols,
      p_mh_nets: nets,
    });

    if (error) {
      console.error("RPC error:", error);
      return new Response(JSON.stringify({ 
        error: error.message, 
        code: (error as any).code 
      }), { 
        status: 400, 
        headers: { "Content-Type": "application/json", ...cors } 
      });
    }
    
    console.log("Upload successful:", data);
    return new Response(JSON.stringify(data), { 
      status: 200, 
      headers: { "Content-Type": "application/json", ...cors } 
    });
    
  } catch (e) {
    console.error("Function error:", e);
    return new Response(JSON.stringify({ 
      error: e?.message || "Upload failed" 
    }), { 
      status: 400, 
      headers: { "Content-Type": "application/json", ...cors } 
    });
  }
});