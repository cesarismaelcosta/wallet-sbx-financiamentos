/**
 * @fileoverview Backoffice access — login da Superbid cadastrado em usuário interno ativo
 * @path supabase/functions/_shared/backoffice-access.ts
 *
 * Diz se o login da Superbid da sessão pertence a um usuário ATIVO do backoffice
 * (`backoffice_users.sbx_login`, sem diferenciar maiúsculas). Usado pelos emissores do
 * token de sessão (`sbx-auth`, `sbx-auth-exchange`, `financial-gateway-gate`) para gravar
 * a marca `backofficeAccess` no token, que só faz aparecer o link "Backoffice" no menu do
 * avatar do hub. NÃO dá acesso a nada: o backoffice continua exigindo o login próprio dele.
 * Devolve só sim/não; nenhum dado do usuário interno sai daqui. Falha na consulta = não
 * (o login do cliente segue normalmente).
 * O papel das Edge Functions (db_edge_worker) não lê `backoffice_users`: a consulta passa pela
 * função `public.has_backoffice_access(login)` (security definer, só db_edge_worker executa;
 * migration 20261120240000).
 */

import { sql } from "./db.ts";
import { debugLog } from "./logger.ts";

/** true se existe usuário de backoffice ativo com esse login da Superbid. */
export async function hasBackofficeAccess(login: string | null | undefined): Promise<boolean> {
  const value = String(login ?? "").trim();
  if (value.length < 2 || value.length > 100) return false;
  try {
    const [row] = await sql`select public.has_backoffice_access(${value}) as ok`;
    return row?.ok === true;
  } catch (err: unknown) {
    debugLog("⚠️ [backoffice-access] Consulta falhou; sem marca:", (err as Error)?.message);
    return false;
  }
}
