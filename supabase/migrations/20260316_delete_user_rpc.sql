-- RPC to delete a user from auth.users (cascades to profiles + user_roles)
-- SECURITY DEFINER runs as DB owner so it can touch auth schema
-- Only admins can execute this

CREATE OR REPLACE FUNCTION delete_auth_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin access required';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Allow authenticated users to call it (RLS inside the function gates actual access)
GRANT EXECUTE ON FUNCTION delete_auth_user(UUID) TO authenticated;
