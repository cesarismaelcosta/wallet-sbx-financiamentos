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

## 7. Segurança

- **Nenhuma secret em arquivo** (código, `.md`, zip, SQL). Secrets só no Supabase (`Deno.env.get`).
- Nunca registre em log: tokens, secrets, CPF, nome, e-mail, telefone, endereço. Use as funções de
  mascaramento existentes (`maskLead`, `stripPersonal`, `[MASKED]`).
- Webhooks: validar assinatura HMAC (tempo constante, janela de 5 min) **e** confirmar o dado na
  origem com chamada autenticada; aceitar só ids que existem no nosso banco.
- Valores do cliente (preço, regra, limite) são sempre revalidados no servidor com o `rules` do banco,
  nunca com o que veio do navegador.
- Nunca navegue para `/produtos` sem `visit_id`.

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
