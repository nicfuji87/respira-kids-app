import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    console.log('[DEBUG] Test function started');

    // Environment variables check
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[DEBUG] Environment vars:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey,
    });

    // Try to create Supabase client
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    console.log('[DEBUG] Supabase client created');

    // Test simple query
    const { data, error } = await supabase
      .from('api_keys')
      .select('service_name, is_active')
      .limit(1);

    console.log('[DEBUG] Query result:', { data, error: error?.message });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test function working',
        environment: {
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseServiceKey,
        },
        queryResult: { data, error: error?.message },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[ERROR] Test function failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
