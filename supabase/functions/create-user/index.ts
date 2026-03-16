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

  // Decode JWT to get caller's user_id
  let callerUserId: string
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    callerUserId = payload.sub
    if (!callerUserId) throw new Error('no sub')
  } catch {
    return fail('Unauthorized: invalid token')
  }

  // Verify caller is admin using service key
  const roleRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${callerUserId}&select=role&limit=1`,
    { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
  )
  const roleRows = await roleRes.json()
  console.log('Caller role check:', JSON.stringify(roleRows))
  if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
    return fail('Forbidden: admin access required')
  }

  let body: { email?: string; password?: string; fullName?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request body')
  }

  const { email, password, fullName, role } = body
  if (!email || !password || !fullName) {
    return fail('email, password and fullName are required')
  }

  // Create auth user via admin API
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  })

  const created = await createRes.json()
  console.log('Create user response:', createRes.status, JSON.stringify(created))

  if (!createRes.ok) {
    return fail(created.msg ?? created.message ?? `Auth API error: ${createRes.status}`)
  }

  if (created.id) {
    // Upsert profile
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: created.id, full_name: fullName }),
    })
    if (!pRes.ok) console.error('Profile upsert failed:', await pRes.text())

    // Upsert user_roles with the requested role
    const rRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: created.id, role: role ?? 'nurse' }),
    })
    if (!rRes.ok) console.error('user_roles upsert failed:', await rRes.text())
  }

  return ok({ userId: created.id })
})
