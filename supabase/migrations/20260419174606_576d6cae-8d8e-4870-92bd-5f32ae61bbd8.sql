
-- Tabela de configuração geral de OTP/Magic Link
CREATE TABLE IF NOT EXISTS public.otpconfig (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  senderemail text NOT NULL,
  sendername text NOT NULL DEFAULT 'Wallet sbX',
  emailsubject text NOT NULL DEFAULT 'Seu link de acesso ao Backoffice',
  isactive boolean NOT NULL DEFAULT true,
  createdat timestamptz NOT NULL DEFAULT now(),
  updatedat timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.otpconfig ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otpconfig admin read"
  ON public.otpconfig FOR SELECT
  TO authenticated
  USING (public.is_current_user_backoffice_admin());

CREATE POLICY "otpconfig admin insert"
  ON public.otpconfig FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_backoffice_admin());

CREATE POLICY "otpconfig admin update"
  ON public.otpconfig FOR UPDATE
  TO authenticated
  USING (public.is_current_user_backoffice_admin())
  WITH CHECK (public.is_current_user_backoffice_admin());

CREATE POLICY "otpconfig admin delete"
  ON public.otpconfig FOR DELETE
  TO authenticated
  USING (public.is_current_user_backoffice_admin());

CREATE TRIGGER trg_otpconfig_updatedat
  BEFORE UPDATE ON public.otpconfig
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de domínios de e-mail permitidos para cadastro de usuários do backoffice
CREATE TABLE IF NOT EXISTS public.allowedemaildomains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  isactive boolean NOT NULL DEFAULT true,
  createdat timestamptz NOT NULL DEFAULT now(),
  updatedat timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allowedemaildomains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allowedemaildomains backoffice read"
  ON public.allowedemaildomains FOR SELECT
  TO authenticated
  USING (public.is_current_user_backoffice());

CREATE POLICY "allowedemaildomains admin insert"
  ON public.allowedemaildomains FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_backoffice_admin());

CREATE POLICY "allowedemaildomains admin update"
  ON public.allowedemaildomains FOR UPDATE
  TO authenticated
  USING (public.is_current_user_backoffice_admin())
  WITH CHECK (public.is_current_user_backoffice_admin());

CREATE POLICY "allowedemaildomains admin delete"
  ON public.allowedemaildomains FOR DELETE
  TO authenticated
  USING (public.is_current_user_backoffice_admin());

CREATE TRIGGER trg_allowedemaildomains_updatedat
  BEFORE UPDATE ON public.allowedemaildomains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função helper: verifica se um e-mail tem domínio permitido para cadastro
CREATE OR REPLACE FUNCTION public.is_domain_allowed(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.allowedemaildomains
    WHERE isactive = true
      AND lower(domain) = lower(split_part(_email, '@', 2))
  );
$$;

-- Seed: domínio inicial gmail.com
INSERT INTO public.allowedemaildomains (domain, isactive)
VALUES ('gmail.com', true)
ON CONFLICT (domain) DO NOTHING;

-- Seed: configuração inicial de OTP (usando o e-mail de teste como remetente)
INSERT INTO public.otpconfig (senderemail, sendername, emailsubject, isactive)
SELECT 'cesarismaelcosta@gmail.com', 'Wallet sbX', 'Seu link de acesso ao Backoffice', true
WHERE NOT EXISTS (SELECT 1 FROM public.otpconfig);

-- Seed: usuário admin de teste
INSERT INTO public.backofficeusers (email, name, role, isactive)
VALUES ('cesarismaelcosta@gmail.com', 'Cesar Costa', 'admin', true)
ON CONFLICT DO NOTHING;
