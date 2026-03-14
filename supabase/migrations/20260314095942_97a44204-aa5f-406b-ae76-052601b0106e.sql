
-- Drop the overly permissive policy
DROP POLICY "Anyone can insert vitals" ON public.vitals;

-- Replace with a policy for authenticated users + service role
CREATE POLICY "Authenticated or service can insert vitals" ON public.vitals
  FOR INSERT TO authenticated WITH CHECK (true);
