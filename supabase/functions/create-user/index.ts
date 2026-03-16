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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let accessToken: string, email: string, password: string, fullName: string, role: string
  try {
    const body = await req.json()
    accessToken = body.accessToken
    email       = body.email
    password    = body.password
    fullName    = body.fullName
    role        = body.role ?? 'nurse'
    console.log('Body keys:', Object.keys(body))
  } catch (e) {
    return fail('Invalid request body: ' + String(e))
  }

  if (!accessToken) return fail('Unauthorized: missing accessToken in body')

  // Verify the caller using their access token
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(accessToken)
  console.log('Caller:', caller?.id, '| Auth error:', authErr?.message)
  if (!caller) return fail('Unauthorized: ' + (authErr?.message ?? 'invalid token'))

  // Check caller is admin
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle()
  console.log('Role row:', JSON.stringify(roleRow))
  if (roleRow?.role !== 'admin') {
    return fail(`Forbidden: your role is "${roleRow?.role ?? 'none'}"`)
  }

  if (!email || !password || !fullName) {
    return fail(`Missing fields — email:${email} fullName:${fullName} hasPassword:${!!password}`)
  }

  // Create the new auth user
  const { data: { user: newUser }, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  console.log('Created user:', newUser?.id, '| Error:', createErr?.message)
  if (createErr) return fail(createErr.message)
  if (!newUser) return fail('User creation returned no data')

  // Upsert profile
  const { error: profErr } = await admin
    .from('profiles')
    .upsert({ user_id: newUser.id, full_name: fullName }, { onConflict: 'user_id' })
  if (profErr) console.error('Profile upsert error:', profErr.message)

  // Upsert role
  const { error: roleInsertErr } = await admin
    .from('user_roles')
    .upsert({ user_id: newUser.id, role }, { onConflict: 'user_id' })
  if (roleInsertErr) console.error('user_roles upsert error:', roleInsertErr.message)

  return ok({ userId: newUser.id })
})
