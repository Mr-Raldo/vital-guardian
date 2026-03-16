import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail('Unauthorized: missing token')

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify caller
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (!caller) return fail('Unauthorized: ' + (authErr?.message ?? 'invalid token'))

  // Check caller is admin
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (roleRow?.role !== 'admin') {
    return fail(`Forbidden: your role is "${roleRow?.role ?? 'none'}"`)
  }

  let userId: string
  try {
    const body = await req.json()
    userId = body.userId
  } catch {
    return fail('Invalid request body')
  }

  if (!userId) return fail('userId is required')
  if (userId === caller.id) return fail('You cannot delete your own account')

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
  if (deleteErr) return fail(deleteErr.message)

  return ok({ success: true })
})
