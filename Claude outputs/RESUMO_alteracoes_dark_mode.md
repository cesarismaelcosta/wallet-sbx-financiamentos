# Resumo das alterações — Dark Mode / Design System (dev → homolog)

Data: 2026-09-25
Ambiente onde foi feito: dev (via bridge local, repo `wallet-sbx-financiamentos`)
Repositório: `wallet-sbx-financiamentos`

Este documento lista **todos** os arquivos alterados nesta sessão, organizados por fase, para você replicar manualmente em homologação. O arquivo `dark_mode_migration.patch` (anexado) contém o diff unificado completo de todos os arquivos de código — pode ser aplicado com `git apply dark_mode_migration.patch` (rodando da raiz do repo) se o homolog estiver na mesma base que o dev estava antes dessas mudanças, ou usado como referência linha a linha caso o apply falhe por divergência.

---

## Fase 1 — Adoção do padrão dark mode do design system (5 arquivos)

Objetivo: trocar o `ThemeProvider` global do app pelo do design system (`sbx-design-system-9f1c03`), adicionar o botão de alternância de tema no backoffice, e migrar a "casca" do backoffice (sidebar, header mobile) + os dois gráficos do dashboard para tokens semânticos.

1. **`src/routes/__root.tsx`**
   Troca do import do `ThemeProvider` de `@/components/ThemeProvider` para `@/design-system/sbx-design-system-9f1c03/components/ThemeProvider`. 1 linha alterada.

2. **`src/design-system/sbx-design-system-9f1c03/components/ThemeProvider.tsx`**
   Correção crítica de SSR: o provider original chamava `localStorage.getItem(...)` de forma incondicional no `useState` inicial, o que quebra em produção porque este projeto usa server-side rendering real (TanStack Start) e `localStorage` não existe no servidor. Isso causou uma queda total do site (HTTP 500 em toda rota) até esse patch. Adicionado guard `typeof window !== "undefined" && typeof localStorage !== "undefined"` + try/catch tanto na leitura quanto na escrita do tema, e corrigido o estado inicial de `resolvedTheme` para respeitar o `defaultTheme` em vez de um `"dark"` fixo.

3. **`src/routes/backoffice.lazy.tsx`**
   Adicionado o botão `<ThemeToggle />` no rodapé da sidebar (entre nome/email do usuário e o botão de logout). Migradas ~33 classes hardcoded de light-mode para tokens semânticos na sidebar, header mobile e tela de loading (`bg-white`→`bg-background`/`bg-sidebar`, `border-neutral-200`→`border-sidebar-border`, `text-neutral-900/700`→`text-sidebar-foreground`, `text-neutral-400/600/500`→`text-muted-foreground`, `bg-neutral-100`→`bg-sidebar-accent`, `border-neutral-900`→`border-foreground`, `bg-neutral-50/50`→`bg-background`).

4. **`src/features/financial-hub/components/shared/renderes/ChartsSimulation.tsx`**
   Card, títulos, eixos, grid, tooltip e cores das barras/linhas migrados de hex/classes fixas para tokens (`hsl(var(--foreground))`, `hsl(var(--chart-1/2/3))`, `hsl(var(--border))`, `hsl(var(--muted-foreground))`, `hsl(var(--muted))`, `bg-card`, `border-border`).

5. **`src/features/financial-hub/components/shared/renderes/ChartsTraffic.tsx`**
   Mesma migração de cores aplicada ao `ChartsSimulation.tsx`.

---

## Fase 2 — Migração das 11 páginas de conteúdo do backoffice

Mesma tabela de substituição aplicada nos 11 arquivos abaixo (regra determinística, classe por classe):

| Classe antiga | Classe nova |
|---|---|
| `bg-white` | `bg-card` |
| `bg-neutral-50` | `bg-muted` |
| `bg-neutral-100` / `bg-neutral-200` | `bg-accent` |
| `bg-neutral-900` | `bg-foreground` |
| `bg-neutral-800` | `bg-foreground/90` |
| `text-neutral-900/950/800/700`, `text-slate-700` | `text-foreground` |
| `text-neutral-600/500/400/300` | `text-muted-foreground` |
| `border-neutral-200/100/300` | `border-border` |
| `border-neutral-400` | `border-muted-foreground` |
| `border-neutral-900` / `ring-neutral-900` (inclusive variantes `focus:`/`focus-visible:`/`hover:`) | `border-foreground` / `ring-foreground` |

Mais 2 padrões tratados à parte (combinações fixas de cor):
- Checkbox de seleção: `"bg-neutral-900 text-white border-neutral-900"` → `"bg-foreground text-background border-foreground"` (44 ocorrências em 6 arquivos).
- Botão "🔗 Criar Link" em `backoffice.routes.lazy.tsx` (2 ocorrências): `text-white bg-neutral-900 ... hover:bg-neutral-800` → `text-background bg-foreground ... hover:bg-foreground/90`.

**Preservado sem alteração** (propositalmente): os 3 blocos de pré-visualização de impressão/PDF (`printRef`), que devem continuar sempre claros/brancos independente do tema:
- `backoffice.simulations.lazy.tsx` (linhas 811–861)
- `backoffice.consults.lazy.tsx` (linhas 1176–1247)
- `backoffice.routes.lazy.tsx` (linhas 1019–1071)

Arquivos migrados (linhas efetivamente alteradas em cada um):

- `src/routes/backoffice.alerts.lazy.tsx` — 36 linhas
- `src/routes/backoffice.audit.lazy.tsx` — 126 linhas
- `src/routes/backoffice.configs.lazy.tsx` — 24 linhas
- `src/routes/backoffice.consults.lazy.tsx` — 186 linhas
- `src/routes/backoffice.domains.lazy.tsx` — 28 linhas
- `src/routes/backoffice.index.lazy.tsx` — 140 linhas (dashboard/KPIs)
- `src/routes/backoffice.login.lazy.tsx` — 18 linhas
- `src/routes/backoffice.reports.lazy.tsx` — 14 linhas
- `src/routes/backoffice.routes.lazy.tsx` — 352 linhas
- `src/routes/backoffice.simulations.lazy.tsx` — 180 linhas
- `src/routes/backoffice.users.lazy.tsx` — 170 linhas

---

## Fase 3 — Correção da logo "Wallet sbX" no dark mode

A logo é uma imagem PNG estática (não CSS), então não foi pega pelas Fases 1/2. O wordmark "WALLET" era quase preto sobre fundo transparente — ficava ilegível no sidebar escuro.

1. **`src/components/brand/WalletLogo.tsx`** (editado)
   - Novo import: `logoSrcDark` (`@/assets/wallet-sbx-logo-dark.png`) e `useTheme` do design system.
   - `<img src={logoSrc}>` → `<img src={resolvedTheme === "dark" ? logoSrcDark : logoSrc}>`.
   - Tagline "Financiamentos & Seguros": `text-neutral-500` → `text-muted-foreground`.

2. **`src/assets/wallet-sbx-logo-dark.png`** (novo arquivo, anexado nesta entrega)
   Versão da logo com **toda a imagem invertida** (wordmark "WALLET" + selo "SBX e-trade"), usada apenas quando `resolvedTheme === "dark"`. A logo original (`wallet-sbx-logo.png`) não foi tocada e continua sendo usada no modo claro.

Esse componente é compartilhado (aparece também no login do backoffice, sign-in público, sbxpay e sandbox), então a correção vale para qualquer tela que entrar em modo escuro, não só o backoffice.

---

## Como levar para homologação

1. Copie o arquivo `wallet-sbx-logo-dark.png` (anexado) para `src/assets/` no repo de homolog.
2. Aplique o patch anexado (`dark_mode_migration.patch`) a partir da raiz do repo de homolog:
   ```
   git apply dark_mode_migration.patch
   ```
   Se o homolog estiver exatamente no mesmo estado que o dev estava antes dessas mudanças, o apply deve ser limpo. Se falhar por divergência de algum arquivo, o patch ainda serve como referência exata do diff para aplicar manualmente naquele arquivo específico.
3. Não é necessário apagar nada — nenhum arquivo foi removido nesta sessão (o antigo `src/components/ThemeProvider.tsx` continua existindo e só deixará de ser importado; ele só deve ser apagado depois que você confirmar visualmente que está tudo certo em homolog também, para manter a opção de rollback).

## Lembrete

Todas essas mudanças estão em **dev**. Nada foi tocado em produção/Supabase nesta sessão.
