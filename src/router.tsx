/**
 * @fileoverview Configuração do Roteador Principal (TanStack Router)
 * @path src/router.tsx
 * 
 * ============================================================================
 * [ARQUITETURA & ERROR BOUNDARY]
 * ============================================================================
 * Configura o motor de rotas e o componente global de tratamento de exceções.
 * Inclui blindagem defensiva contra erros nulos/indefinidos (undefined), evitando
 * o loop do CatchBoundary do React.
 *
 * [ERROR STATE v2.0]: `DefaultErrorComponent` reaproveita a mesma ilustração
 * (error.webp/error-dark.webp) e o tom neutro (sem vermelho) usado no resto do
 * app -- em vez do fallback genérico em inglês que existia antes -- e respeita
 * o tema ativo via `useTheme()`. É a rede de segurança final: cobre qualquer
 * rota que não define seu próprio `errorComponent` (ver CatchBoundary do
 * TanStack Router).
 *
 * [BACKOFFICE BRANCH]: TanStack Router NÃO propaga `errorComponent` de rota-pai
 * pra rota-filha -- cada rota sem `errorComponent` próprio cai direto neste
 * fallback global, não no de um ancestral. Por isso, em vez de criar um
 * `errorComponent` por rota do backoffice (~12 arquivos `.lazy.tsx`), este
 * componente único verifica o pathname (via `useRouterState`) e escolhe entre
 * o visual do cliente (ilustração + `/`) e o do backoffice (sem ilustração,
 * tokens semânticos do próprio painel + `/backoffice`).
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createRouter, useRouter, useRouterState, ErrorComponentProps, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { useTheme } from "@/design-system/sbx-design-system-9f1c03/components/ThemeProvider";

/**
 * Componente padrão global de captura de erros de rota
 */
function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isBackoffice = pathname.startsWith("/backoffice");
  // `useTheme` tem valor default seguro mesmo fora do `ThemeProvider` (createContext
  // com initialState) -- relevante pro caso raro de erro no próprio RootComponent,
  // antes do Provider montar. Nos demais casos (rota filha), o Provider já está ativo.
  const { resolvedTheme } = useTheme();
  const nightMode = resolvedTheme === "dark";

  // Blindagem defensiva rigorosa caso o erro seja undefined, string ou objeto customizado
  const errorMessage = 
    error instanceof Error 
      ? error.message 
      : typeof error === "object" && error !== null && "message" in error 
        ? String((error as any).message) 
        : typeof error === "string" 
          ? error 
          : error 
            ? JSON.stringify(error) 
            : "Ocorreu um erro inesperado.";

  const retryButton = (
    <button
      onClick={() => {
        router.invalidate();
        reset();
      }}
      className="flex items-center justify-center gap-2 px-5 py-2 font-normal rounded-none transition-colors text-sm w-full sm:w-auto border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-900 hover:text-white dark:hover:bg-white dark:hover:text-neutral-900 hover:border-neutral-900 dark:hover:border-white shadow-xs cursor-pointer"
    >
      Tentar novamente
    </button>
  );

  // ======================================================================
  // 🛑 RAMO BACKOFFICE: sem ilustração de cliente, tokens semânticos do
  // próprio painel (já corretamente ligados ao dark mode via index.css),
  // "voltar" aponta pro painel, não pro site do cliente.
  // ======================================================================
  if (isBackoffice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background font-sans p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground mb-2">Ops! Tivemos um problema</h1>
        <p className="text-muted-foreground font-normal text-sm mb-2 max-w-md px-4">
          Ocorreu um erro inesperado no painel administrativo. Você pode tentar novamente ou voltar para o painel.
        </p>

        {import.meta.env.DEV && (
          <pre className="mt-2 mb-4 max-h-40 max-w-md overflow-auto rounded-none border border-border bg-muted p-3 text-left font-mono text-xs text-destructive">
            {errorMessage}
          </pre>
        )}

        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          {retryButton}
          <Link
            to="/backoffice"
            className="flex items-center justify-center gap-2 px-5 py-2 font-normal rounded-none transition-colors text-sm w-full sm:w-auto text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Voltar para o painel
          </Link>
        </div>
      </div>
    );
  }

  // ======================================================================
  // 🟢 RAMO CLIENTE: ilustração error.webp/error-dark.webp, "voltar" pro site.
  // ======================================================================
  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center font-sans p-6 text-center ${
        nightMode ? "bg-black" : "bg-white"
      }`}
    >
      {/* Mesma ilustração usada no resto do app (ErrorCountdown, banner de login):
          error.webp tem fundo branco, error-dark.webp tem fundo preto -- por isso
          o container acima casa a cor exata em vez de usar um neutro intermediário. */}
      <img
        src={nightMode ? "/assets/error/error-dark-240.webp" : "/assets/error/error-240.webp"}
        alt="Erro"
        className="w-28 h-28 object-contain mb-6 saturate-[10%]"
      />

      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        Ops! Tivemos um problema
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400 font-normal text-sm mb-2 max-w-md px-4">
        Ocorreu um erro inesperado. Você pode tentar novamente ou voltar para o início.
      </p>

      {/* Mensagem técnica só em desenvolvimento -- em produção o usuário só vê o texto amigável acima */}
      {import.meta.env.DEV && (
        <pre className="mt-2 mb-4 max-h-40 max-w-md overflow-auto rounded-none border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3 text-left font-mono text-xs text-neutral-600 dark:text-neutral-400">
          {errorMessage}
        </pre>
      )}

      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        {retryButton}
        <Link
          to="/"
          className="flex items-center justify-center gap-2 px-5 py-2 font-normal rounded-none transition-colors text-sm w-full sm:w-auto text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 underline underline-offset-2"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};