CREATE POLICY "loginhistory self insert"
ON public.loginhistory
FOR INSERT
TO authenticated
WITH CHECK (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  AND event = ANY (ARRAY['login_success', 'logout', 'login_blocked_domain'])
);