/**
 * @fileoverview Rotas centralizadas do Frontend
 * @path src/config/routes.ts
 *
 * Espelha supabase/functions/_shared/app-routes.ts (mesmos valores, lado
 * frontend). O frontend tinha cópias soltas dos mesmos literais ("/produtos",
 * "/accounts/signin", "/") espalhadas em vários arquivos -- o mesmo problema
 * que motivou o `_shared/app-routes.ts` no backend (o rename sbxpay -> produtos
 * deixou uma cópia esquecida em pelo menos uma Edge Function).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

/** Raiz do site -- redireciona pra HOME_ROUTE (ver src/routes/index.tsx). */
export const ROOT_ROUTE = "/";

/** Rota padrão de destino após login/handoff quando não há jornada específica sendo restaurada. */
export const HOME_ROUTE = "/produtos";

/** Rota de login, usada como fallback quando a sessão está ausente, expirada ou inválida. */
export const SIGNIN_ROUTE = "/accounts/signin";

/**
 * Monta a URL de login com `redirect_uri` codificado -- padrão repetido em
 * vários lugares (gateway.ts, financialGatewayGate.tsx, produtos.offer.lazy.tsx).
 */
export function buildSigninRedirect(currentPath: string): string {
  return `${SIGNIN_ROUTE}?redirect_uri=${encodeURIComponent(currentPath)}`;
}
