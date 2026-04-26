-- 1) Renomear valores existentes na tabela
UPDATE public.loginhistory
SET event = CASE event
  WHEN 'login_success' THEN 'login'
  WHEN 'login_blocked_domain' THEN 'blocked'
  ELSE event
END
WHERE event IN ('login_success', 'login_blocked_domain');

-- 2) Atualizar a policy de INSERT para refletir os novos nomes
DROP POLICY IF EXISTS "loginhistory self insert" ON public.loginhistory;

CREATE POLICY "loginhistory self insert"
ON public.loginhistory
FOR INSERT
TO authenticated
WITH CHECK (
  lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))
  AND event = ANY (ARRAY['login'::text, 'logout'::text, 'failed_attempt'::text, 'blocked'::text])
);