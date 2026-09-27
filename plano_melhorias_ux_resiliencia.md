# Plano de Melhorias — UX de Erros e Resiliência

**Projeto:** wallet-sbx-financiamentos
**Data:** 27/09/2026 (atualizado no mesmo dia, após mais 3 itens concluídos)
**Contexto:** registro do padrão aplicado hoje (erro tratado com feedback visual + retry, sempre respeitando claro/escuro) e lista de próximos candidatos pra aplicar o mesmo tratamento, pra retomar quando quiser.

## O padrão que aplicamos hoje

Toda vez que um botão dispara uma chamada assíncrona (`callOrchestrator`, etc.) e ela falha, o usuário precisa de feedback visual — nunca um botão "travado" sem explicação, nem uma tela branca. O padrão consolidado hoje:

- Estado de erro local (`hasError`/`errorKey`/`errorIndex`, dependendo do arquivo), setado no `catch` genérico (nunca no branch de sessão expirada, que já redireciona).
- Uma barra neutra (sem vermelho — convenção do app) que se preenche em 5 segundos via `requestAnimationFrame` duplo + `transition-property: width`, com um link "Tentar novamente" que já rechama a ação, e auto-retorno ao fim dos 5s se ninguém clicar.
- Sempre com `dark:` explícito — nunca depender de tokens semânticos genéricos nesses componentes client-facing (exceto no backoffice, onde os tokens semânticos já são confiáveis e são o padrão do próprio painel).

## O que já foi implementado

1. **`CardOfferV.tsx` + `produtos.offer.lazy.tsx`** — botão "Simular parcelamento/financiamento" nos cards de oferta. Estado `errorIndex` no pai, barra de preenchimento no card.
2. **`produtos.index.lazy.tsx`** — mesmo padrão nos botões de produto da home (`renderButton`/`handleProductClick`), com `errorKey` compartilhado (só um botão em erro por vez).
3. **`src/router.tsx` — `DefaultErrorComponent`** — a rede de segurança final do app (cobre qualquer rota sem `errorComponent` próprio, via `defaultErrorComponent` do `createRouter`). Usa a mesma ilustração (`error.webp`/`error-dark.webp`) e tom neutro do resto do app, com fundo casando exatamente com cada imagem (branco/preto) via `useTheme()`.
4. **Ramo backoffice no mesmo `DefaultErrorComponent`** — como TanStack Router não propaga `errorComponent` de rota-pai pra rota-filha, em vez de criar ~12 arquivos novos, o componente único passou a checar o `pathname` (via `useRouterState`): rotas `/backoffice/*` caem num visual sem ilustração de cliente, usando os tokens semânticos do próprio painel, com "Voltar para o painel" apontando pra `/backoffice` em vez de `/`.
5. **Centralização de rotas do frontend — `src/config/routes.ts`** — espelha o `supabase/functions/_shared/app-routes.ts` (backend). Exporta `ROOT_ROUTE`, `HOME_ROUTE`, `SIGNIN_ROUTE` e o helper `buildSigninRedirect()`. Substituídos os literais soltos em 13 arquivos (`PanelHeader.tsx`, `accounts.signin.lazy.tsx`, `routes/index.tsx`, `produtos.offer.lazy.tsx`, `sandbox.lazy.tsx`, `FinancialHubLayout.tsx`, `gateway.ts`, `financialGatewayGate.tsx`, `produtos.lazy.tsx`, `services/event.ts`, `services/offer.ts`, `OrchestratorWrapper.tsx`, `lib/error-page.ts`).
6. **Comentário obsoleto corrigido em `gateway.ts`** — `TIMEOUT_SIMULATION = 90000` estava comentado como "40s" num dos usos; corrigido pra "90s".

## Próximos candidatos (prioridade reavaliada)

Os itens 1 e 2 abaixo são o mesmo problema visto de dois ângulos — vale atacar juntos: resolver a duplicação das telas cheias primeiro deixa o segundo item quase pronto.

1. **Unificar as telas de erro ilustradas duplicadas.** Hoje existem pelo menos duas implementações independentes de "tela cheia com `error.webp` + countdown de 5s" — o `ErrorCountdown` do `FinancialHubLayout.tsx` e o `fetchError` local de `produtos.offer.lazy.tsx`. As duas ainda usam `bg-white` fixo, sem `dark:` — inconsistente com o padrão que consolidamos hoje. Vale extrair um componente compartilhado único, com dark mode real (mesmo esquema `error.webp`/`error-dark.webp` + fundo casando, já usado no `DefaultErrorComponent` e no `accounts.signin.lazy.tsx`), e substituir as duas.
2. **Levar o mesmo padrão (barra + retry + auto-retorno) pros formulários reais de simulação** (Step1/Step4 de auto-equity, card, veiculos, partner, seguros/auto). Hoje eles já tratam erro (evento global `app-error` + `ErrorCountdown`), mas herdam o mesmo problema do item 1 — tela cheia sem dark mode. Depende do item 1 estar resolvido primeiro (ou pelo menos decidido) pra não duplicar trabalho.
3. **Rate limiting nas Edge Functions**, principalmente `sbx-auth` — gap de segurança já identificado, nenhuma das 16 functions tem hoje. Item mais isolado (só backend), pode ser feito em paralelo aos de UX.
4. **`.env` versionado no git.** Hoje contém só valores públicos (URL/anon key do Supabase), mas o ideal é sair do controle de versão e virar variável de ambiente do provedor de hosting. Baixo risco técnico, mas exige uma decisão de infraestrutura (qual provedor, como configurar lá) antes de eu tocar em código.

## Como retomar

Quando quiser seguir com algum item, é só apontar o número da lista — eu investigo o código relevante, trago uma proposta concreta (igual fizemos hoje) e só implemento depois de aprovação.
