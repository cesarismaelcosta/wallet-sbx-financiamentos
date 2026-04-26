-- 1) Add mustchangepassword flag to backofficeusers
ALTER TABLE public.backofficeusers
ADD COLUMN IF NOT EXISTS mustchangepassword boolean NOT NULL DEFAULT false;

-- 2) Create passwordresettokens table
CREATE TABLE IF NOT EXISTS public.passwordresettokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expiresat timestamp with time zone NOT NULL,
  usedat timestamp with time zone,
  createdat timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passwordresettokens_email ON public.passwordresettokens (lower(email));
CREATE INDEX IF NOT EXISTS idx_passwordresettokens_token ON public.passwordresettokens (token);

ALTER TABLE public.passwordresettokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passwordresettokens admin read"
ON public.passwordresettokens
FOR SELECT
TO authenticated
USING (public.is_current_user_backoffice_admin());

CREATE POLICY "passwordresettokens admin insert"
ON public.passwordresettokens
FOR INSERT
TO authenticated
WITH CHECK (public.is_current_user_backoffice_admin());

CREATE POLICY "passwordresettokens admin update"
ON public.passwordresettokens
FOR UPDATE
TO authenticated
USING (public.is_current_user_backoffice_admin())
WITH CHECK (public.is_current_user_backoffice_admin());