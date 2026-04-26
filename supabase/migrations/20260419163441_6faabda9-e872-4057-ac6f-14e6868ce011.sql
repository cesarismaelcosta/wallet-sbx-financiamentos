
-- Pré-cria o usuário do backoffice em auth.users para que signInWithOtp
-- com shouldCreateUser:false funcione e envie OTP de 6 dígitos por e-mail.
-- Idempotente: só insere se ainda não existir.
do $$
declare
  v_email text := 'cesarismaelcosta@gmail.com';
begin
  if not exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      '',
      now(),
      now(),
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      '{}'::jsonb,
      false
    );
  end if;
end $$;
