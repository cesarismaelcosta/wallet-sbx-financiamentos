# Pendências para homologação

Lista viva: tudo que foi feito em dev e ainda precisa ser replicado em homologação.
Ordem sugerida: banco → secrets → edge functions → front. Marque com [x] ao concluir.

---

## A. Itens anteriores (já validados em dev)

- [ ] Migration `supabase/migrations/20261001120000_drop_unused_write_policies.sql`
- [ ] Deploy das edge functions com as mudanças de rate limit / IP
- [ ] Migration `supabase/migrations/20261003120000_orchestrator_configs_home_fields.sql`
- [ ] Migration `supabase/migrations/20261003130000_home_seguro_residencial.sql`
- [ ] Deploy da edge `orchestrator-configs`
- [ ] Publicar o front: `src/routes/produtos.index.lazy.tsx`, `src/routes/backoffice.routes.lazy.tsx`, `types.ts`

---

## B. FlowCredi · Financiamento Imobiliário (outubro/2026)

### B1. Storage
- [ ] Subir `flowcredi_400_400.png` no bucket público `logos` (a migration já aponta para esse arquivo).
- [ ] Subir no bucket `logos` as logos de e-mail dos bancos (96x96, com respiro): `itau_email_96.png`, `bradesco_email_96.png`, `santander_email_96.png`, `caixa_email_96.png`, `inter_email_96.png`, `banco_do_brasil_email_96.png` — **antes** do deploy da `financial-gateway` (sem elas o envio do e-mail de imóveis falha).

### B2. Banco
- [ ] Migration `supabase/migrations/20261018120000_flowcredi_financiamento_imobiliario.sql`
  - Parceiro 3 vira "FlowCredi" (nome + logo).
  - CATEGORY 13 (imóveis): `rules` da jornada (`flowcredi_product = "mortgage"`, limites), aceites, painel, rodapé e FAQs.
  - **Não** altera `page_url` nem `home_status`.
  - Textos do painel (`offer_panel`) já com a versão aprovada em dev: "Compre seu imóvel financiado em até 35 anos na Superbid", "Parceria com: FlowCredi".
- [ ] Migration `supabase/migrations/20261018130000_financial_institution_inter.sql` (Inter em financial_institutions, logo nas ofertas)
- [ ] `grant select on public.financial_institutions to db_edge_worker;` (feito à mão em dev; sem isso os cards ficam sem logo do banco)
- [ ] Migration `supabase/migrations/20261020120000_simulations_amortization_columns.sql`
  - Recria `simulations` e `simulation_consults` com `amortization_type`, `installment_value` (1ª parcela) e `last_installment_value` no início dos valores; em `simulation_consults` também `is_selected` (depois de `financial_institution_id`).
  - Copia dados, FKs, índices, trigger, RLS, policies, grants e publications; backfill das linhas FlowCredi.
  - Um único bloco `DO`: qualquer erro desfaz tudo (o SQL Editor não segura BEGIN/COMMIT).
  - **Rodar ANTES do deploy da `financial-gateway`** (o gateway novo grava as colunas novas).
  - Em dev já aplicada (+ `Claude outputs/dev_simulation_consults_is_selected.sql`, só dev).
- [ ] Conferir em homol o `page_url` da CATEGORY 13 (em dev está `http://localhost:8080/financiamentos/imoveis`).
- [ ] Vendedor Santander: incluir o seller_id em `rules.flowcredi_bank_by_seller` (modelo comentado no fim da migration).
- [ ] Quando for ao ar: `home_status` da CATEGORY 13 → `visible` (pelo backoffice).

### B3. Secrets da edge `financial-gateway`
- [ ] `FLOWCREDI_API_KEY` — token do Portal Parceiro (aba Tokens).
- URLs ficam no código: simulador `https://api.flowcredi.com.br/simulador/v1` (flowcredi-simulator-service.ts) e leads `https://age3aiv1gd.execute-api.us-east-1.amazonaws.com/dev` (flowcredi-mortgage-service.ts — **trocar pela URL de produção quando a FlowCredi informar**).
- Envio do lead: constante `FLOWCREDI_SEND_LEAD` no `flowcredi-mortgage-service.ts`, hoje `false` (não envia). Mudar para `true` junto com a URL de produção.

### B4. Edge function
- [ ] Deploy da `financial-gateway` com:
  - `financial-gateway/flowcredi-service.ts` (novo: simulador, leads, bancos, consultas, parcelas e detalhe — comum aos produtos FlowCredi; substitui o `flowcredi-simulator-service.ts`, apagado)
  - `financial-gateway/flowcredi-mortgage-service.ts` (novo: só as regras de imóveis)
  - `financial-gateway/simulation-handler.ts` (case 3 → FlowCredi imóveis; tipo do step com `SUBMIT_LEAD`)
  - `financial-gateway/index.ts` (step: `EXECUTE_SIMULATION` | `SUBMIT_LEAD`; `CHECK_ELIGIBILITY` removido)
  - `financial-gateway/persist-data.ts` (`SUBMIT_LEAD` grava etapa 3 · Proposta em `stage_types`)
  - `_shared/types.ts` (tipo do step com `SUBMIT_LEAD`; `Consultation` com `amortization_type` e `last_installment_value`)
  - `financial-gateway/persist-data.ts` também grava `amortization_type`, `last_installment_value` (simulations e consults) e `is_selected` (consults)
  - `flowcredi-notifications.ts` (novo; e-mails de imóveis e home equity): e-mail da simulação de imóveis (cards por banco com logo via CID, botão "Consultar oferta"), enviado a cada simulação com condições
  - `email-offer-button.ts` (novo): botão "Consultar oferta" (link da oferta na Superbid) usado nos e-mails de imóveis, veículos (`fandi-notifications.ts`, ao lado do WhatsApp) cartão (`credit-card-notifications.ts`) e parceiros/veículos PJ (`partner-notifications.ts`, só no e-mail do cliente)
  - `flowcredi-mortgage-service.ts`: na simulação escolhe a melhor condição de cada banco (`is_selected`), busca as parcelas dessas em paralelo e grava em `simulation_details.installment_schedule`; condições do banco em `simulation_details.details`. Ação DETAIL (somente leitura, não grava) para as parcelas de outra condição do banco escolhida na gaveta.

- [ ] Deploy da `sbx-offer-query`: vitrine de imóveis sem a keyword `financiamentosuperbidpay` e com filtro `product.productType.description:imoveis` (tipo 13; o filtro por categoria retornava 0); filtros da vitrine de imóveis: `propertyCategory` (residenciais/comerciais/industriais/rurais) e `state` (UF), listas fechadas no servidor

- [ ] Deploy de `orchestrator` e `financial-gateway` com a correção do `_shared/gatekeeper.ts` (oferta vendida: `isAvailable` inexistente quebrava o erro)

### B5. Front
- [ ] Pasta nova `src/features/financial-hub/components/products/financial/imoveis/`
  (`imoveis.manifest.ts`, `imoveis.types.ts`, `HowItWorks.tsx`, `BankLogo.tsx`, `DetailSheet.tsx`, `DetailCharts.tsx`,
  `steps/Step1Simulation.tsx`, `steps/Step2Offers.tsx`, `steps/Step3PersonalData.tsx`, `steps/Step4Confirm.tsx`)
- [ ] `src/features/financial-hub/components/shared/SliderCustomizado.tsx` (slider desabilitado fica cinza — afeta todas as jornadas)
- [ ] Rota nova `src/routes/financiamentos.imoveis.lazy.tsx`
- [ ] `src/routeTree.gen.ts` (rota /financiamentos/imoveis registrada)
- [ ] `src/features/financial-hub/components/shared/manifest.types.ts` (campo `layout` no tipo)
- [ ] `src/features/financial-hub/components/shared/renderes/CardOfferV.tsx` (oferta vendida: selo "Vendido" azul #2246A7, foto cinza, preço riscado, sem botão)
- [ ] `src/routes/produtos.offer.lazy.tsx` + `src/services/offer.ts` (vitrine de imóveis: filtros Tipo de imóvel e Estado; dropdown do desktop com rolagem)
- [ ] `src/features/financial-hub/core/services/gateway.ts` (`callSimulation`: `EXECUTE_SIMULATION` | `SUBMIT_LEAD`)
- [ ] `src/features/financial-hub/components/products/credit/auto-equity/steps/Step1Eligibility.tsx`

### B6. Teste em homol (mock)
- [ ] Oferta de imóvel → Simular (um card por banco) → Ver detalhes abre na hora (gráficos + tabela, também no celular) → trocar para outra condição do banco (skeleton e depois a tabela) → Continuar
- [ ] Step 3: dados do cadastro + aceites → Enviar → tela de confirmação com protocolo
- [ ] Banco: `simulation_consults` com `is_selected = true` uma por banco e `installment_schedule` preenchido nessas linhas
- [ ] Vendedor Santander: só cards do Santander
- [ ] Usuário PJ: mensagem "disponível apenas para pessoa física"
- [ ] Backoffice: simulação gravada com uma consulta por banco; após o envio, status "Em análise"

### B7. Pendências com a FlowCredi (antes de desligar o mock)
- [ ] URL de produção da API de leads (`/mortgage/lead`)
- [ ] Usar a API de leads ou a de processos (devolve `processoId` e status)?
- [ ] O mesmo token vale para leads, simulador e processos? Existe token de staging?
- [ ] URLs exatas da Política de Privacidade e do Termo de Uso (hoje os aceites apontam para flowcredi.com.br)
- [ ] O lead não recebe prazo, banco escolhido nem aceites — está ok para eles?
- [ ] Simulador: ao pedir um item (banco + idProduto + idSeguradora), a resposta vem com outra seguradora (ex.: Itaú/Santander com `idSeguradora: "itau"/"santander"` voltam `seguradora.id: "bradesco"`). Os valores batem com a lista, mas a seguradora não.
- [ ] Simulador: só devolveu SAC. PRICE existe no `/simulador` ou só no `/simulador-simples`?
- [ ] Simulador: cada banco devolve várias condições (tabelas). Qual tabela de cada banco usar como padrão no card? Hoje usamos a de menor taxa. E devemos mostrar as demais ao cliente (hoje aparecem só em "Outras condições", no detalhe)?

---

## C. Auto Equity fora do ar até migrar para a FlowCredi

O step `CHECK_ELIGIBILITY` saiu do código (contrato do step: `EXECUTE_SIMULATION` | `SUBMIT_LEAD`).
- `simulation-handler.ts`: produto 7 responde "Produto temporariamente indisponível".
- `auto-equity/steps/Step1Eligibility.tsx`: passa a enviar `EXECUTE_SIMULATION` (vai receber o "indisponível").
- `creditas-auto-equity-service.ts`: mantido, sem uso; vira o serviço FlowCredi do Auto Equity.

- [ ] Esconder o botão do Auto Equity na home (backoffice: `home_status` do PRODUCT 7 → `hidden`) — dev e homol
- [ ] Publicar em homol junto: `Step1Eligibility.tsx` (front) e o deploy da `financial-gateway`
- [ ] Migração do Auto Equity / Home Equity para a FlowCredi (`POST /auto/lead`, `POST /cgi/lead`)

---

## D. No radar (não fazer ainda)

- [ ] Gateway: investigar os ~4,5 s antes de chamar o parceiro (suspeita: API da Superbid no `hydrateVisitContext`). Afeta todas as jornadas.

---

## E. FlowCredi · Home Equity (Crédito com garantia de imóvel · PRODUCT 6)

### E1. Banco
- [ ] Migration `supabase/migrations/20261021120000_flowcredi_home_equity.sql` (PRODUCT 6: integrado, `flowcredi_product = "home_equity"`, limites 60% / 240 meses, aceites, painel, rodapé e FAQs)
- [ ] Conferir em homol o `page_url` do PRODUCT 6 (`/emprestimos/home-equity`) e liberar `home_status` pelo backoffice quando for ao ar

### E2. Edge function `financial-gateway`
- [ ] `flowcredi-home-equity-service.ts` (novo: inputs do imóvel, limites, lead `/cgi/lead`)
- [ ] `simulation-handler.ts` (parceiro 3: `home_equity` usa o serviço novo)
- [ ] `flowcredi-notifications.ts` (e-mail de home equity, template `flowcredi-home-equity-simulation-result`)

### E3. Front
- [ ] Pasta nova `src/features/financial-hub/components/products/flowcredi/` (compartilhada com imóveis): `BankLogo.tsx`, `DetailCharts.tsx`, `DetailSheet.tsx`, `FlowOffersStep.tsx`, `FlowLeadStep.tsx`, `flowcredi.types.ts` — saíram da pasta de imóveis
- [ ] Pasta nova `src/features/financial-hub/components/products/credit/home-equity/` (manifest, HowItWorks, `homeEquity.types.ts`, steps `Step1Property`, `Step2Simulation`, `Step5Confirm`)
- [ ] Rota nova `src/routes/emprestimos.home-equity.lazy.tsx` + `routeTree.gen.ts`
- [ ] `src/services/ibge.ts` (cidades por UF, API pública do IBGE) e `credit/home-equity/CityInput.tsx` (sugestões; se o IBGE falhar, texto livre)
- [ ] Imóveis: `imoveis.manifest.ts`, `Step1Simulation.tsx`, `Step4Confirm.tsx` (imports da pasta `flowcredi/`)

### E4. Confirmar com a FlowCredi
- [ ] O simulador de CGI só devolve produtos da própria FlowCredi ("Flow": pré/pós-fixado × Price/SAC) — é isso mesmo ou deveria trazer bancos?
- [ ] 1ª parcela da lista (ex.: R$ 8.816,05) diferente da tabela de parcelas (R$ 9.219,63) — diferença no MIP
- [ ] Saldo devedor: o crédito fica limitado a 60% do imóvel **menos** o saldo devedor? (regra nossa)
- [ ] Valor mínimo, prazo mínimo e regra de idade do CGI

---

## F. FlowCredi · Car Equity (Crédito com garantia de veículo · PRODUCT 7)

### F1. Confirmar com a FlowCredi
- [x] Não há simulador para auto: confirmado pela FlowCredi. A jornada envia só o lead.
- [ ] Marca e modelo do veículo são digitados manualmente pelo cliente (sem tabela FIPE). Isso atende ou preferem que usemos a FIPE (marca/modelo/ano padronizados)?
- [ ] `divida_veiculo` é obrigatório e com mínimo 0,01: como enviar um veículo quitado?
- [ ] Limite do crédito: o swagger só diz que não pode passar do valor do veículo. Existe % máximo do valor (FIPE)? Usamos valor do veículo menos o saldo devedor (regra nossa).
- [ ] URL de produção do `/auto/lead` (o swagger só lista a de dev).

- [ ] O site da FlowCredi (flowcredi.com.br/creditocomgarantiaauto) não usa a Preamble API: manda para a **Website API** (`https://api.flowcredi.com.br/website/v1/lead/auto`) um lead enxuto (valor do automóvel, ano de fabricação, valor do empréstimo, CEP, placa, veículo em nome, quitado, renda + contato e aceites). Qual API o parceiro deve usar? A Website API aceita o token de parceiro?
- [ ] Na Preamble (`/auto/lead`), os campos que o site não coleta (endereço, profissão, tempo de trabalho, dívida do veículo, ano do modelo, marca, modelo, portas) são mesmo obrigatórios?
- [ ] Teste 2026-10-21: `POST /dev/auto/lead` com o token do Portal Parceiro (produção) → 401 "Não autenticado". O ambiente dev da Preamble exige outro token? Qual a URL de produção da Preamble?

### F2. Arquivos
- Migration `supabase/migrations/20261023120000_flowcredi_car_equity.sql` (PRODUCT 7: `flowcredi_product = "auto_equity"`, aceites, painel, rodapé, FAQs)
- Edge: `financial-gateway/flowcredi-auto-equity-service.ts` (novo), `financial-gateway/simulation-handler.ts`
- Front (`products/credit/auto-equity/`): `auto-equity.manifest.ts`, `autoEquity.types.ts` (novo), `HowItWorks.tsx`, `steps/Step1Vehicle.tsx`, `steps/Step2Credit.tsx`, `steps/Step3Income.tsx`, `steps/Step4PersonalData.tsx` (novos), `steps/Step5Confirm.tsx`
- Front compartilhado: `shared/flowcredi/flowcredi.types.ts`; `src/routes/sandbox_.help.lazy.tsx` (texto)
- Apagar: `auto-equity/schemas.ts`, `steps/Step1Eligibility.tsx`, `steps/Step2PersonalData.tsx`, `steps/Step3Vehicle.tsx`, `steps/Step4Simulation.tsx`

### F3. A avaliar
- Step "Seus dados" (FlowLeadStep, todas as jornadas FlowCredi): o botão de envio deveria ficar visível na mesma tela, sem rolar.

---

## Pontos de controle (homologação × repositório)

- **2026-10-21 · ponto de controle 1** — `lovable_sync_2026-10-21.zip` (Car Equity, garantias, ajustes FlowCredi). Banco de homol acertado pelo César.
- **2026-10-21 · ponto de controle 2 (a aplicar)** — `lovable_sync_2026-10-21_status.zip`: novo modelo de etapas e status, backoffice (cartões, etiquetas, aba lateral, PanelFlowcredi). Migrations `20261025120000_stage_status_types.sql` e `20261025130000_backoffice_status_functions.sql`. Deploy `financial-gateway`.
- Próxima sincronização: só o que mudar depois do ponto de controle 2.
- **2026-10-21 · ajustes (aplicado)** — `lovable_sync_2026-10-21_ajustes.zip`: etapa na coluna Situação (backoffice) e aceites gravados no envio do lead (`persist-data.ts`).
- **2026-10-21 · ajustes2 (aplicado em homologação)** — migration `20261025150000_flowcredi_lead_sem_retorno_parceiro.sql` e 6 arquivos: `FlowLeadStep.tsx` (layout intermediário), `PanelFlowcredi.tsx`, `flowcredi-service.ts`, `flowcredi-mortgage-service.ts`, `flowcredi-home-equity-service.ts`, `flowcredi-auto-equity-service.ts`. O zip com esse nome foi sobrescrito por engano e movido para `_to_delete/`; o conteúdo aplicado é o descrito aqui.
- **2026-10-21 · ajustes3 (a aplicar)** — `lovable_sync_2026-10-21_ajustes3.zip`: migration `20261025160000_flowcredi_status_ajustes.sql` e 8 arquivos (ver `00_LEIA.md` do zip). Deploy `financial-gateway`.
- ajustes4 (2026-10-21): cabeçalho dos e-mails em imagem (960x114, ~2 KB) nos 5 templates; imagem nova no bucket logos; deploy financial-gateway, notification-gateway, notification-system-message.
- ajustes5 (2026-10-24): imóveis Step1 abre com 80% financiado e prazo padrão quando o lote carrega.
- ajustes6 (2026-10-24): nomes de arquivo no padrão do app (home-equity.*, auto-equity.types); 5 rotas com a trava depois do useEffect (regra do React); avisos de dependência corrigidos em imóveis Step1 e FlowLeadStep. Substitui o ajustes5.
- ajustes7 (2026-10-24): = ajustes6 + correção do log de erro em produtos.offer (payload → raw_payload). Substitui o ajustes5 e o ajustes6.
- ajustes8 (2026-10-24): busca de rotas do backoffice (lookup_id numérico); FinancialHubLayout na regra dos hooks; avisos de dependência e limpeza. Aplicar depois do ajustes7.
- ajustes9 (2026-10-24): área 1 dos any — tipos centrais (ConsentConfig, PageConfigs, FaqItem, ProductRules, GatewayResult, HubData, OrchestratorPostResponse). Só tipos. Aplicar depois do ajustes8.
- ajustes10 (2026-10-24): área 2 dos any (núcleo, layout, passos, FlowCredi): 151 → 57 na pasta das jornadas. Novo veiculos.types.ts. Só tipos. Aplicar depois do ajustes9.
- ajustes11 (2026-10-24): card.types.ts (rules null — faltou no ajustes10); confirmação de Veículos/Partner sem campos antigos do retorno. Aplicar depois do ajustes10.
- ajustes12 (2026-10-24): área 3 dos any (painéis compartilhados, gráficos, card da oferta, slider, ícones). Só tipos. Aplicar depois do ajustes11.
- ajustes13 (2026-10-24): área 4 dos any (backoffice) + gráficos compatíveis com o recharts de homol + prompt para regenerar os tipos do Supabase. Aplicar depois do ajustes12.
- ajustes14 (2026-10-24): área 5 dos any; cliente do Supabase tipado (createClient<Database>) + tipos do banco; ui/chart.tsx no recharts 3; 3 arquivos sem uso do design system apagados. Local alinhado ao package.json de homol. Aplicar depois do ajustes13.
