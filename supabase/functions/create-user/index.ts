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

  // Log all incoming headers for debugging
  const allHeaders: Record<string, string> = {}
  req.headers.forEach((v, k) => { allHeaders[k] = v })
  console.log('Headers:', JSON.stringify(allHeaders))

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
  console.log('Auth header found:', !!authHeader)
  if (!authHeader) return fail('Unauthorized: missing token')

  // Decode JWT to get caller's user_id
  let callerUserId: string
  try {
    const token = authHeader.replace('Bearer ', '').trim()
    const parts = token.split('.')
    const payload = JSON.parse(atob(parts[1]))
    callerUserId = payload.sub
    console.log('Caller user_id:', callerUserId)
    if (!callerUserId) throw new Error('no sub')
  } catch (e) {
    console.error('JWT decode error:', e)
    return fail('Unauthorized: invalid token')
  }

  // Verify caller is admin using service key
  const roleRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${callerUserId}&select=role&limit=1`,
    { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
  )
  const roleRows = await roleRes.json()
  console.log('Role rows:', JSON.stringify(roleRows))
  if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
    return fail(`Forbidden: caller role is "${roleRows[0]?.role ?? 'none'}"`)
  }

  // Read raw body and parse manually for debugging
  let rawBody = ''
  try {
    rawBody = await req.text()
    console.log('Raw body:', rawBody)
  } catch (e) {
    console.error('Body read error:', e)
    return fail('Could not read request body')
  }

  let email: string, password: string, fullName: string, role: string
  try {
    const parsed = JSON.parse(rawBody)
    console.log('Parsed body:', JSON.stringify(parsed))
    email    = parsed.email
    password = parsed.password
    fullName = parsed.fullName
    role     = parsed.role ?? 'nurse'
  } catch (e) {
    console.error('JSON parse error:', e)
    return fail('Invalid JSON body')
  }

  if (!email || !password || !fullName) {
    console.log('Missing fields - email:', email, 'password:', !!password, 'fullName:', fullName)
    return fail(`Missing fields: email=${email}, fullName=${fullName}, password=${!!password}`)
  }

  // Create auth user via admin API
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
  })

  const created = await createRes.json()
  console.log('Auth API status:', createRes.status, 'body:', JSON.stringify(created))

  if (!createRes.ok) {
    return fail(created.msg ?? created.message ?? `Auth API error ${createRes.status}`)
  }

  if (created.id) {
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

    const rRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: created.id, role }),
    })
    if (!rRes.ok) console.error('user_roles upsert failed:', await rRes.text())
  }

  return ok({ userId: created.id })
})
