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

  // Verify caller is admin
  const roleRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${callerUserId}&select=role&limit=1`,
    { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } }
  )
  const roleRows = await roleRes.json()
  if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
    return fail('Forbidden: admin access required')
  }

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request body')
  }

  const { userId } = body
  if (!userId) return fail('userId is required')
  if (userId === callerUserId) return fail('You cannot delete your own account')

  // Delete auth user (cascades to profiles and user_roles via FK ON DELETE CASCADE)
  const deleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  })

  if (!deleteRes.ok) {
    const err = await deleteRes.text()
    return fail(err ?? 'Failed to delete user')
  }

  return ok({ success: true })
})
