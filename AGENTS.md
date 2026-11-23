# AGENTS.md — Wallet sbX Financiamentos & Seguros

Regras para qualquer IA (ou pessoa) que altere este repositório. Leia inteiro antes de mexer no código.
Na dúvida entre "fazer" e "perguntar", **pergunte**.

---

## 1. Processo de trabalho (obrigatório)

1. **Planeje antes de alterar.** Descreva o que vai mudar (arquivos, telas, banco) e espere aprovação.
2. **Não invente.** Nenhum campo, texto, regra, rótulo ("opcional", "recomendado"…) ou comportamento
   que não tenha sido pedido ou que não exista na documentação do parceiro.
3. **Texto do usuário é aplicado exatamente** como foi escrito (acentos, pontuação, ordem).
4. **Siga o padrão que já existe** no código vizinho. Não crie um padrão novo sem aprovação.
5. **Verifique antes de entregar:** `npx tsc --noEmit` (erros no design system protegido são antigos e
   não são seus); confira no banco e nos logs depois de cada teste de envio.
6. **Deploy é feito pelo dono do projeto.** Não publique Edge Functions nem rode migrations por conta própria.
7. **Pacotes para o Lovable (homol):** zip com nome versionado
   (`lovable_sync_AAAA-MM-DD_<tema>[_vN].zip`), com `00_LEIA.md` e prompts numerados.
   **Nunca sobrescreva** um zip já gerado; crie uma nova versão.
8. Respostas curtas e objetivas. Não gaste tokens com relatórios que não foram pedidos.

## 2. Arquivos protegidos (não alterar)

- `src/design-system/sbx-design-system-9f1c03/**`
- `src/integrations/supabase/types.ts` (gerado)
- `.env` e qualquer arquivo com credenciais

## 3. Stack e estrutura

- Frontend: React + TypeScript + Vite + TanStack Router (`src/routes/*.lazy.tsx`), componentes de UI do
  design system e `src/components/ui`.
- Backend: Supabase (Postgres + Edge Functions em Deno, `supabase/functions/<função>/`).
- Código compartilhado das funções: `supabase/functions/_shared/` (db, logger, types, crypto, infrastructure…).
- Jornadas de produto: `src/features/financial-hub/components/products/<tipo>/<produto>/`
  (`steps/StepN*.tsx` + `<produto>.types.ts`), montadas pelo `shared/WizardEngine.tsx` a partir de um manifesto.

Edge Functions principais:

| Função | Papel |
|---|---|
| `orchestrator` | Monta a jornada: visita, entidade, oferta e configuração (`orchestrator_configs`). |
| `orchestrator-configs` | Lê configurações (rules, page_configs, consents) para as telas. |
| `financial-gateway` | Simulação e envio aos parceiros (`simulation-handler.ts` → `<parceiro>-service.ts`) e gravação (`persist-data.ts`). |
| `financial-gateway-webhook` | Recebe avisos dos parceiros (`/financial-gateway-webhook/<parceiro>`). |

## 4. Configuração: tudo em `orchestrator_configs`

- **Regras e limites ficam em `rules`** (valores mínimos/máximos, prazos, percentuais, tipos bloqueados,
  UFs aceitas, ano mínimo…). Telas e servidor leem do `rules`; **nada fixo no código** além de padrões
  de segurança (defaults) documentados no próprio arquivo.
- Ambiente do parceiro: `integration_details.partner_environment` (`"staging"` ou `"production"`;
  ausente = produção).
- Cascata de configuração: **EVENT > SELLER > PRODUCT > SUBCATEGORY > CATEGORY**.
  Caso específico (ex.: banco fixo para um vendedor) = **nova linha** no nível certo, não chave nova.
- Textos de página em `page_configs`, FAQs em `page_faqs`, aceites em `consent_configs`.
- **Toda chave nova em `rules`/`page_configs` precisa estar editável no Backoffice**
  (`src/routes/backoffice.routes.lazy.tsx`).

## 5. Nomes

- **Proibido nome de parceiro em chaves de regra, de configuração ou em código genérico**
  (ex.: `flowcredi_bank` ❌ → `fixed_bank` ✅). Nome de parceiro só em arquivos do próprio parceiro
  (`flowcredi-service.ts`, `fandi-service.ts`) e em dados (ids de aceite, nome da instituição).
- Roteamento por `partner_id` e `product_id` (ex.: parceiro 3 → produto 1 Imóveis, 6 Home Equity,
  7 Car Equity). Nunca por flag com nome de parceiro.
- Serviços de parceiro: `supabase/functions/financial-gateway/<parceiro>-service.ts` e
  `<parceiro>-<produto>-service.ts`; webhook: `financial-gateway-webhook/<parceiro>-service.ts`.
- Utilitários genéricos têm nome genérico (`shared/partner-terms.ts`, não `flowTerms.tsx`).

## 6. Dados e status

- Uma simulação por envio/simulação; histórico em `simulation_updates`; condições em
  `simulation_consults`; garantias em `simulation_collateral_home` / `simulation_collateral_vehicle`;
  aceites em `simulation_consents`; oferta em `simulation_offers`.
- `requested_value` = valor do bem; `financed_amount` = valor do crédito.
- Id do parceiro (processo/proposta) em `external_operation_id`.
- Retorno completo do parceiro em `simulations.raw_payload.gateway_response` (sem dados pessoais).
- **Status sempre de `status_types`** (não invente status nem textos de status):
  0 Pendente envio · 1 Aprovada · 2 Recusada · 3 Em análise · 4 Pendente documentos · 5 Contrato assinado ·
  6 Paga · 7 Cancelada · 8 Falha · 9 Com ofertas · 10 Sem ofertas · 11 Enviado · 12 Pré-aprovado ·
  13 Negado · 14 Em formalização.
- Erros:
  - **erro de regra** (validação, mensagem amigável): `businessError(...)`, nada é gravado;
  - **falha do parceiro** (fora do ar, recusa técnica): grava **Falha (8)** com a mensagem e o detalhe;
  - a tela mostra o erro padrão (`app-error`) com a mensagem do servidor.
- Sem migration (tabela/coluna nova) sem aprovação explícita.

### Migrations

- Toda tabela nova ou recriada declara: RLS ligado, políticas, permissões
  (`revoke all … from anon, authenticated` e depois só o necessário — o Supabase dá permissões
  amplas a tabelas novas por padrão), triggers, chaves estrangeiras e índices.
- Recriar tabela (ex.: posicionar coluna): copiar os dados antes de criar os triggers (não gera
  auditoria falsa), recriar tudo com os mesmos nomes, rodar em uma transação (`begin`/`commit`).
- Restrições de valores (ex.: `CHECK` de ações de auditoria) acompanham os valores novos.
- Depois de rodar, conferir: contagem e dados, colunas, políticas, triggers, índices e permissões.
- Funções `security definer` sempre com `search_path` fixo.
- O SQL vai para `Claude outputs/` com nome datado (`AAAAMMDDHHMMSS_<tema>.sql`); o dono do projeto
  roda em cada ambiente.

## 7. Segurança

- **Nenhuma secret em arquivo** (código, `.md`, zip, SQL). Secrets só no Supabase (`Deno.env.get`).
- Nunca registre em log: tokens, secrets, CPF, nome, e-mail, telefone, endereço. Use as funções de
  mascaramento existentes (`maskLead`, `stripPersonal`, `[MASKED]`).
- Webhooks: validar assinatura HMAC (tempo constante, janela de 5 min) **e** confirmar o dado na
  origem com chamada autenticada; aceitar só ids que existem no nosso banco.
- Valores do cliente (preço, regra, limite) são sempre revalidados no servidor com o `rules` do banco,
  nunca com o que veio do navegador.
- Nunca navegue para `/produtos` sem `visit_id`.

### Modelo de segurança do banco

Três tipos de acesso, sempre com RLS ligado em **todas** as tabelas de `public`:

| Quem | Como acessa | O que pode |
|---|---|---|
| Cliente do hub (Superbid) | Nunca usa Supabase Auth. O navegador só chama Edge Functions (chave `anon`) com o token de sessão sbX. | `anon`: só leitura das tabelas de domínio (`category_types`, `financial_institutions`, `partners`, `product_types`, `result_partner_types`, `result_types`, `stage_types`, `status_types`). Nada de dados de clientes. |
| Edge Functions | Validam sessão/assinatura (`withSecurity`, rate limit em `edge_rate_limits`) e acessam o banco no servidor: conexão direta (`_shared/db.ts`) com o papel **`db_edge_worker`** (privilégio mínimo) ou cliente com service role onde já é assim (ex.: `manage-backoffice-users`). | `db_edge_worker`: só as tabelas das jornadas (visitas, simulações, consentimentos, notificações, domínio). **Não** lê tabelas do backoffice: quando precisar de algo de lá, uma função `security definer` que devolve só o necessário, com `execute` só para `db_edge_worker` (ex.: `has_backoffice_access`). É o **único** caminho de escrita dos dados do hub. |
| Usuário do backoffice | Supabase Auth (`authenticated`) + cadastro ativo em `backoffice_users`. | Acesso direto só de leitura a `backoffice_users` e às tabelas de domínio. Todo o resto por RPCs `get_backoffice_*` / `save_*` / `create_*` / `toggle_*` (`security definer`, `search_path` fixo) que checam o usuário (`is_current_user_backoffice`, `is_current_user_backoffice_admin`, `check_user_role`) e o escopo (`allowed_partners` / `allowed_products`). Gestão de usuários pela Edge Function `manage-backoffice-users` (só admin). Quem entra com Google, tem e-mail de domínio ativo em `allowed_email_domains` e não está em `backoffice_users` pode **pedir acesso** (só produtos + motivo) pela mesma função; o admin libera (parceiros marcados pelos produtos) ou recusa com motivo. |

Regras:
- Políticas: `Leitura_Staff` (leitura para admin/manager/viewer via `check_user_role`) e
  `Acesso_Admin_Total` (só admin: domínios, auditoria de usuários, histórico de login).
  Tabela **só servidor** (ex.: `edge_rate_limits`, `edge_rate_limit_blocks`,
  `backoffice_access_requests`): RLS ligado **e** a política restritiva que nega o navegador, para
  não deixar tabela sem política (o Supabase avisa "RLS Enabled No Policy"):
  `create policy "Sem_Acesso_Direto" on public.<tabela> as restrictive for all to anon, authenticated using (false) with check (false);`
- Tabela nova de dados: **sem** permissão para `anon`/`authenticated`; leitura do backoffice por
  RPC com checagem de usuário e escopo, nunca por `select` direto.
- **Padrão de acesso ao banco pelas Edge Functions** (`_shared/db.ts`, papel `db_edge_worker`):
  1. Antes de consultar uma tabela, confirmar que o `db_edge_worker` tem permissão nela
     (`has_table_privilege('db_edge_worker', 'public.<tabela>', 'select')`). Não ampliar as
     permissões desse papel para "fazer funcionar".
  2. Dado fora das tabelas das jornadas (ex.: `backoffice_users`): criar função `security definer`
     com `search_path` fixo que devolve **só o necessário** (ex.: `true/false`), com
     `revoke execute … from public, anon, authenticated` e `grant execute … to db_edge_worker`.
     Exemplo: `has_backoffice_access(login)`.
  3. A Edge Function chama a função (`select public.<função>(${valor}) as ok`), nunca a tabela.
  4. Falha na consulta não derruba o fluxo do cliente quando o dado é só de exibição (devolve o
     padrão seguro, ex.: `false`) e fica registrada no log, sem dados pessoais.
- Perfis do backoffice: `admin`, `manager`, `viewer`. Telas e RPCs administrativas exigem `admin`.
  Admins: só `cesar.costa@superbid.net` e `joao.freitas@superbid.net` (os demais são `manager`).
- **Pedido de acesso** (`backoffice_access_requests`, migração 20261123100000): tabela só servidor
  (política `Sem_Acesso_Direto`, migração 20261123110000); só a Edge Function `manage-backoffice-users` (service role) lê e grava. Só login **Google**, domínio
  ativo e um pedido pendente por vez. E-mails do pedido/liberação/recusa pela `notification_outbox`.
- **Erros de Edge Function**: nunca devolver ao navegador a mensagem do banco (`error.message`);
  devolver um código (`email_in_use`, `database_error`…) e registrar o detalhe só no log.
- Dados pessoais: mascarar com `mask_document` / `mask_email` / `mask_phone` nas RPCs de listagem;
  visualização de dado completo registrada (`log_pii_view`).
- Auditoria: mudanças em `backoffice_users` registradas por trigger em `backoffice_user_details`.
- Nenhum dado de cliente é lido pelo navegador direto das tabelas.
- **Sandbox**: só em `/backoffice/sandbox` (e `/backoffice/sandbox/help`), para **admin** do backoffice
  (login do backoffice + perfil admin, checados em `backoffice.lazy.tsx`). Não existe `/sandbox` fora
  do backoffice. O link "Backoffice" no avatar do hub aparece só com a marca `backofficeAccess` do
  token de sessão (login da Superbid em `backoffice_users.sbx_login` de usuário ativo) e não autoriza
  nada.
- **IP do cliente**: sempre de `cf-connecting-ip` (definido pela Cloudflare) ou do IP assinado entre
  funções (`_shared/client-ip.ts`); nunca de `x-client-ip` sem assinatura nem do 1º item do
  `x-forwarded-for` como fonte principal (o cliente pode enviá-los). Vale para Edge Functions e
  funções do banco (regra SBXW-17).
- **Funções do banco documentadas no código** (obrigatório): toda função, trigger ou tabela do banco
  usada pelo código tem o SQL no comentário de cabeçalho do arquivo que a usa (ex.:
  `backoffice.users.lazy.tsx`, `backoffice.consults.lazy.tsx`, `AuthContext.tsx`,
  `_shared/backoffice-access.ts`). Formato:

  ```ts
  /**
   * -------------------------------------------------------------------------
   * [BANCO] <nome da função> — migração <AAAAMMDDHHMMSS>
   * -------------------------------------------------------------------------
   * CREATE OR REPLACE FUNCTION public.<nome>(<parâmetros>) RETURNS <tipo>
   *   SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
   * AS $$ <corpo completo> $$;
   * REVOKE EXECUTE ON FUNCTION ... FROM public, anon, ...;
   * GRANT EXECUTE ON FUNCTION ... TO <papel>;
   */
  ```

  - Função nova: o bloco entra no arquivo que a chama, na mesma entrega da migration.
  - Função alterada: o bloco é atualizado (SQL e número da migration) em **todos** os arquivos que a
    descrevem.
  - Tabela/coluna nova ou alterada: descrever colunas, índices, RLS/políticas e permissões no mesmo
    formato, com a migration.

- **Extensões** ficam no esquema `extensions`, nunca em `public` (migração 20261123130000:
  `pg_trgm`, `pg_net`). Funções usam `search_path` fixo (`public, pg_temp`).
- **pg_cron + pg_net**: `processar-notificacoes-pendentes` (a cada minuto → `notification-dispatcher`)
  e `resolver-geo-login-history` (a cada 5 min → `log-access`) chamam as funções por
  `net.http_post`. Mexer na `pg_net` para os e-mails e a geolocalização até voltar.

### Alertas e e-mails

- Alerta de sistema: `_shared/alert.ts` (`dispatchSystemAlert` / `sendSystemAlert`), que escapa o
  HTML e grava na `notification_outbox`. Erro que acontece **antes de existir sessão sbX** (ex.:
  `financial-gateway-gate`) dispara o alerta no servidor; a tela não envia, porque
  `notification-system-message` exige sessão sbX e recusaria (401).
- Todo erro do gate gera alerta (inclusive `SESSION_EXPIRED`), sem token e sem dados pessoais além
  do necessário (código, IP, oferta, produto, UTMs).
- Tipo novo de e-mail: incluir o `context_type` no CHECK de `notification_outbox` **e** de
  `notifications` (hoje: `SIMULATION`, `VISIT`, `SYSTEM_ERROR`, `BACKOFFICE_ACCESS`); todo texto
  vindo do usuário passa por escape de HTML.

## 8. Telas (padrão visual e de texto)

- Campo obrigatório: `*` no rótulo; explicação **em uma linha no rodapé do box**
  (`* Texto · Texto`), nunca frases soltas embaixo dos campos.
- Grade de 2 colunas no desktop, 1 no celular; linhas alinhadas, sem buracos quando um campo some.
- Listas (bancos, tipos…) em **ordem alfabética**, com "Outros" no fim abrindo campo de texto.
  Exceção: anos, do mais recente para o mais antigo.
- Valores em `BRL(...)`, datas DD/MM/AAAA.
- Troca de passo: rola ao topo do wizard e foca o primeiro campo (`WizardEngine`).
- Use os componentes existentes (`Select`, `Input`, `Label`, `SliderCustomizado`, classes
  `inputClass`/`labelClass`) e o design system; nada de estilo novo sem aprovação.
- Ver o comportamento nos dois temas (claro e escuro) e no celular.

## 9. Documentação no código

Todo arquivo começa com um cabeçalho:

```ts
/**
 * @fileoverview <Nome> — <o que é>
 * @path <caminho/do/arquivo.ts>
 *
 * <Responsabilidade em poucas linhas: o que faz, de onde vêm os dados, regras importantes.>
 */
```

- Toda função nova ou exportada tem um comentário `/** … */` curto dizendo o que faz
  (e o porquê, quando não é óbvio).
- Comentários de linha só para regras não óbvias (ordem de chamadas, códigos HTTP, decisões).
- Ao mudar a responsabilidade de um arquivo, atualize o cabeçalho.
- Comentários e textos em português.

## 10. Integrações de parceiros

- Antes de mudar uma integração, leia a documentação do parceiro (PDF/OpenAPI) e o que já foi
  validado no site dele. Não acesse sites de parceiros sem pedido.
- Envio idempotente do lado do parceiro não é garantido: cada envio gera um novo registro.
- FlowCredi: API de Processos (`POST /processos`), aceites na API de Termos **antes** do processo
  (só segue com 201), simulador sem `idSeguradora`, webhook `bank.status_changed` confirmado na
  Process Bank API.
