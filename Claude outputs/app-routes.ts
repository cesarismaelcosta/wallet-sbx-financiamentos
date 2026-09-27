/**
 * @fileoverview Rotas do Frontend usadas como fallback/config no Backend (Edge Functions)
 * @path supabase/functions/_shared/app-routes.ts
 *
 * Centraliza os caminhos do frontend que as Edge Functions precisam conhecer
 * (destino padrão pós-login/handoff, rota de login para fallback de sessão
 * expirada, etc). Evita strings literais duplicadas em vários arquivos — foi
 * exatamente a falta disso que causou o bug do rename sbxpay -> produtos:
 * cada arquivo tinha sua própria cópia do literal "/sbxpay", e algumas
 * ficaram para trás até serem encontradas manualmente.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

/** Rota padrão de destino após login/handoff quando não há jornada específica sendo restaurada. */
export const HOME_ROUTE = "/produtos";

/** Rotas que contam como "home" para fins de hidratação leve (`mode: "light"`) no orchestrator. */
export const HOME_ROUTES: string[] = ["/", HOME_ROUTE];

/** Rota de login, usada como fallback quando a sessão está ausente, expirada ou inválida. */
export const SIGNIN_ROUTE = "/accounts/signin";
