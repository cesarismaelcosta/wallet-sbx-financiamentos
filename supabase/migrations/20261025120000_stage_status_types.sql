-- =============================================================================
-- Etapas (stage_types) e status (status_types): novo modelo do funil
--
-- ETAPAS (position = ordem de exibição; ids existentes mantidos)
--   1 Simulação     (id 2)  consulta de condições de referência, sem análise de crédito
--   2 Lead          (id 6)  dados enviados ao parceiro para um especialista entrar em contato  [NOVA]
--   3 Pré-análise   (id 1)  análise preliminar automática do parceiro (era "Elegibilidade")
--   4 Proposta      (id 3)  análise de crédito formal pela instituição financeira
--   5 Formalização  (id 4)  assinatura da CCB, avaliação e registro do bem
--   6 Paga          (id 5)  valor liberado ao cliente ou ao vendedor
--
-- STATUS (stage_id = etapa do status; vazio = vale em qualquer etapa)
--   Simulação:    9 Com condições, 10 Sem condições                          [NOVOS]
--   Lead:        11 Enviado                                                  [NOVO]
--   Pré-análise: 12 Pré-aprovado, 13 Negado                                  [NOVOS]
--   Proposta:     3 Em análise, 4 Pendente documentos, 1 Aprovada, 2 Recusada
--   Formalização:14 Em formalização [NOVO], 5 Contrato assinado
--   Paga:         6 Paga
--   Qualquer:     0 Pendente envio, 7 Cancelada, 8 Falha
--
-- As duas tabelas são recriadas para as colunas novas ficarem logo depois de `name`
-- (description, stage_id, position), com tudo que tinham: PK, FKs que apontam para
-- elas, trigger de updated_at, RLS, policy Leitura_Staff e grants.
--
-- Dados já gravados (simulations, simulation_updates, simulation_consults e
-- result_partner_types) passam para as etapas e status novos:
--   Cartão (parceiro 1):    Simulação · Aprovada      → Simulação · Com condições
--   Fandi (parceiro 2):     Simulação · Aprovada/Recusada → Pré-análise · Pré-aprovado/Negado
--   FlowCredi (parceiro 3): Simulação · Aprovada/Recusada → Simulação · Com/Sem condições
--                           Proposta · Em análise     → Lead · Enviado
--
-- Tudo dentro de um único bloco DO (o SQL Editor do Supabase não segura BEGIN/COMMIT).
-- =============================================================================

do $migration$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'stage_types' and column_name = 'position') then
    raise exception 'Migration já aplicada: stage_types.position existe.';
  end if;

  lock table public.stage_types, public.status_types, public.simulations, public.simulation_updates,
             public.simulation_consults, public.result_types, public.result_partner_types
    in access exclusive mode;

  -- 1. Solta as FKs que apontam para as tabelas antigas -------------------------
  alter table public.simulations          drop constraint simulations_stage_id_fkey;
  alter table public.simulations          drop constraint simulations_status_id_fkey;
  alter table public.simulation_updates   drop constraint simulation_updates_stage_id_fkey;
  alter table public.simulation_updates   drop constraint simulation_updates_status_id_fkey;
  alter table public.simulation_consults  drop constraint simulation_consults_status_id_fkey;
  alter table public.result_types         drop constraint result_types_status_id_fkey;

  -- 2. stage_types ------------------------------------------------------------
  -- cópia temporária (só vive dentro deste bloco) e drop antes do create, para os nomes de PK/trigger não colidirem
  create temp table _stage_types_old on commit drop as select * from public.stage_types;
  drop table public.stage_types;

  create table public.stage_types (
    id          integer primary key,
    name        text not null,
    description text,
    position    integer,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
  );

  insert into public.stage_types (id, name, description, position, created_at, updated_at)
  select o.id, v.name, v.description, v.position, o.created_at, now()
  from _stage_types_old o
  join (values
    (2, 'Simulação',    'Consulta de condições de referência (taxa, prazo, parcelas), sem análise de crédito.', 1),
    (1, 'Pré-análise',  'Análise preliminar automática do parceiro, com pré-aprovação ou negativa na hora.', 3),
    (3, 'Proposta',     'Análise de crédito formal pela instituição financeira.', 4),
    (4, 'Formalização', 'Assinatura da CCB, avaliação e registro do imóvel, alienação do veículo.', 5),
    (5, 'Paga',         'Valor liberado ao cliente ou ao vendedor.', 6)
  ) as v(id, name, description, position) on v.id = o.id;

  insert into public.stage_types (id, name, description, position)
  values (6, 'Lead', 'Dados do cliente enviados ao parceiro para um especialista entrar em contato.', 2);


  -- 3. status_types -----------------------------------------------------------
  create temp table _status_types_old on commit drop as select * from public.status_types;
  drop table public.status_types;

  create table public.status_types (
    id          integer primary key,
    name        text not null,
    description text,
    stage_id    integer references public.stage_types (id),
    position    integer,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
  );

  insert into public.status_types (id, name, description, stage_id, position, created_at, updated_at)
  select o.id, v.name, v.description, v.stage_id, v.position, o.created_at, now()
  from _status_types_old o
  join (values
    (0, 'Pendente envio',      'O cliente começou e não concluiu o envio.', null::int, 1),
    (3, 'Em análise',          'A instituição está analisando o crédito.', 3, 1),
    (4, 'Pendente documentos', 'A análise depende de documentos do cliente.', 3, 2),
    (1, 'Aprovada',            'Crédito aprovado pela instituição.', 3, 3),
    (2, 'Recusada',            'Crédito recusado pela instituição.', 3, 4),
    (5, 'Contrato assinado',   'CCB assinada (e registrada, quando houver garantia).', 4, 2),
    (6, 'Paga',                'Valor liberado.', 5, 1),
    (7, 'Cancelada',           'O cliente desistiu ou o prazo expirou.', null::int, 2),
    (8, 'Falha',               'Erro técnico (parceiro fora do ar, timeout).', null::int, 3)
  ) as v(id, name, description, stage_id, position) on v.id = o.id;

  insert into public.status_types (id, name, description, stage_id, position) values
    (9,  'Com condições',   'O simulador devolveu condições de referência.', 2, 1),
    (10, 'Sem condições',   'O simulador não devolveu nenhuma condição.', 2, 2),
    (11, 'Enviado',         'O lead chegou ao parceiro.', 6, 1),
    (12, 'Pré-aprovado',    'O parceiro pré-aprovou na análise preliminar.', 1, 1),
    (13, 'Negado',          'O parceiro negou na análise preliminar.', 1, 2),
    (14, 'Em formalização', 'Assinatura, avaliação ou registro em andamento.', 4, 1);


  -- 4. Trigger, RLS, policy e grants (iguais aos das tabelas antigas) ----------
  create trigger trg_updated_at_stage_types before update on public.stage_types
    for each row execute function handle_updated_at();
  create trigger trg_updated_at_status_types before update on public.status_types
    for each row execute function handle_updated_at();

  alter table public.stage_types  enable row level security;
  alter table public.status_types enable row level security;
  create policy "Leitura_Staff" on public.stage_types for select to authenticated
    using (check_user_role(array['admin'::text, 'manager'::text, 'viewer'::text]));
  create policy "Leitura_Staff" on public.status_types for select to authenticated
    using (check_user_role(array['admin'::text, 'manager'::text, 'viewer'::text]));

  revoke all on public.stage_types, public.status_types from anon, authenticated, service_role;
  grant select on public.stage_types, public.status_types to anon, authenticated;
  grant select, references, trigger, truncate on public.stage_types, public.status_types to service_role;

  -- 5. Dados já gravados -------------------------------------------------------
  -- updated_at dos registros não muda: é reclassificação, não atividade do cliente
  alter table public.simulations          disable trigger trg_updated_at_simulations;
  alter table public.simulation_updates   disable trigger trg_updated_at_simulation_updates;
  alter table public.simulation_consults  disable trigger trg_updated_at_simulation_consults;
  alter table public.result_partner_types disable trigger trg_updated_at_result_partner_types;

  -- Cartão (1): Simulação · Aprovada → Simulação · Com condições
  update public.simulations s set status_id = 9 where s.partner_id = 1 and s.status_id = 1;
  update public.simulation_updates u set status_id = 9
    from public.simulations s where s.id = u.simulation_id and s.partner_id = 1 and u.status_id = 1;
  update public.simulation_consults c set status_id = 9
    from public.simulations s where s.id = c.simulation_id and s.partner_id = 1 and c.status_id = 1;

  -- Fandi (2): Simulação · Aprovada/Recusada/Falha → Pré-análise · Pré-aprovado/Negado/Falha
  update public.simulations s
    set stage_id = 1, status_id = case s.status_id when 1 then 12 when 2 then 13 else s.status_id end
    where s.partner_id = 2 and s.stage_id = 2;
  update public.simulation_updates u
    set stage_id = 1, status_id = case u.status_id when 1 then 12 when 2 then 13 else u.status_id end
    from public.simulations s where s.id = u.simulation_id and s.partner_id = 2 and u.stage_id = 2;
  update public.simulation_consults c
    set status_id = case c.status_id when 1 then 12 when 2 then 13 else c.status_id end
    from public.simulations s where s.id = c.simulation_id and s.partner_id = 2;

  -- FlowCredi (3): Simulação · Aprovada/Recusada → Com/Sem condições; Proposta · Em análise → Lead · Enviado
  update public.simulations s
    set stage_id = case when s.stage_id = 3 and s.status_id = 3 then 6 else s.stage_id end,
        status_id = case s.status_id when 1 then 9 when 2 then 10 when 3 then 11 else s.status_id end
    where s.partner_id = 3;
  update public.simulation_updates u
    set stage_id = case when u.stage_id = 3 and u.status_id = 3 then 6 else u.stage_id end,
        status_id = case u.status_id when 1 then 9 when 2 then 10 when 3 then 11 else u.status_id end
    from public.simulations s where s.id = u.simulation_id and s.partner_id = 3;
  update public.simulation_consults c
    set status_id = case c.status_id when 1 then 9 when 2 then 10 when 3 then 11 else c.status_id end
    from public.simulations s where s.id = c.simulation_id and s.partner_id = 3;

  -- result_partner_types (códigos de retorno de cada parceiro). O id antigo não muda.
  update public.result_partner_types set status_id = 9  where partner_id = 1 and status_id = 1;
  update public.result_partner_types set status_id = case status_id when 1 then 12 when 2 then 13 end
    where partner_id = 2 and status_id in (1, 2);
  update public.result_partner_types set status_id = case status_id when 1 then 9 when 2 then 10 when 3 then 11 end
    where partner_id = 3 and status_id in (1, 2, 3);

  alter table public.simulations          enable trigger trg_updated_at_simulations;
  alter table public.simulation_updates   enable trigger trg_updated_at_simulation_updates;
  alter table public.simulation_consults  enable trigger trg_updated_at_simulation_consults;
  alter table public.result_partner_types enable trigger trg_updated_at_result_partner_types;

  -- 6. Recria as FKs ----------------------------------------------------------
  alter table public.simulations         add constraint simulations_stage_id_fkey         foreign key (stage_id)  references public.stage_types (id);
  alter table public.simulations         add constraint simulations_status_id_fkey        foreign key (status_id) references public.status_types (id);
  alter table public.simulation_updates  add constraint simulation_updates_stage_id_fkey  foreign key (stage_id)  references public.stage_types (id);
  alter table public.simulation_updates  add constraint simulation_updates_status_id_fkey foreign key (status_id) references public.status_types (id);
  alter table public.simulation_consults add constraint simulation_consults_status_id_fkey foreign key (status_id) references public.status_types (id);
  alter table public.result_types        add constraint result_types_status_id_fkey       foreign key (status_id) references public.status_types (id);
end
$migration$;
