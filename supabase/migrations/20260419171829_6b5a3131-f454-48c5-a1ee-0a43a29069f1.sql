-- RPC para checar se o usuário autenticado é admin do backoffice
CREATE OR REPLACE FUNCTION public.is_current_user_backoffice_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.backofficeusers bu
    WHERE lower(bu.email) = lower((auth.jwt() ->> 'email'))
      AND bu.isactive = true
      AND bu.role = 'admin'
  );
$$;

-- Permitir que o frontend autenticado consulte a lista de backoffice users (somente leitura)
-- Apenas backoffice users autenticados (qualquer role ativa) podem ver a lista.
DROP POLICY IF EXISTS "backoffice users can read backofficeusers" ON public.backofficeusers;
CREATE POLICY "backoffice users can read backofficeusers"
ON public.backofficeusers
FOR SELECT
TO authenticated
USING (public.is_current_user_backoffice());

-- Garante RLS habilitada (idempotente)
ALTER TABLE public.backofficeusers ENABLE ROW LEVEL SECURITY;
