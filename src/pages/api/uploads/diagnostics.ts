import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const hasUrl = Boolean(SUPABASE_URL);
    const hasKey = Boolean(SERVICE_KEY);

    let rpcExists = false;
    let dbOk = false;
    let dbErr: any = null;

    if (hasUrl && hasKey) {
      try {
        // Simple connection test
        const supa = createClient(SUPABASE_URL!, SERVICE_KEY!);
        const { error } = await supa.from('uploads').select('id', { count: 'estimated', head: true });
        dbOk = !error;
        if (error) dbErr = error.message;
      } catch (e: any) {
        dbErr = e.message;
      }

      // Test RPC existence with a minimal call
      if (dbOk) {
        try {
          const supa = createClient(SUPABASE_URL!, SERVICE_KEY!);
          const { error } = await supa.rpc('mh_upload_master', {
            p_month: '2025-01-01',
            p_filename: 'diagnostics-test',
            p_locations: ['__DIAGNOSTIC_TEST__'],
            p_volumes: [0],
            p_mh_nets: [0],
          });
          
          // If no error or specific error about data, RPC exists
          rpcExists = !error || (error && !error.message.includes('does not exist'));
          
          // Clean up the diagnostic test entry if it was inserted
          if (!error) {
            await supa.from('uploads').delete().eq('original_filename', 'diagnostics-test');
          }
        } catch (e: any) {
          rpcExists = !e.message.includes('does not exist');
        }
      }
    }

    res.status(200).json({ 
      hasUrl, 
      hasKey, 
      dbOk, 
      dbErr: dbErr || null, 
      rpcExists,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(200).json({ 
      diagnosticsError: e.message,
      timestamp: new Date().toISOString()
    });
  }
}