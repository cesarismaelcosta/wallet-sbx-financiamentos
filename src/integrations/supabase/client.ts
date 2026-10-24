import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// O Vite injeta variáveis que começam com VITE_
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Variáveis de ambiente do Supabase não encontradas. Verifique seu arquivo .env");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
/**
 * Argumentos de uma função do banco. Os filtros opcionais são enviados como null
 * (o Postgres trata null como "sem filtro"); o tipo gerado só aceita "sem valor",
 * por isso as chamadas convertem o objeto para este tipo.
 */
export type RpcArgs<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** Os mesmos argumentos aceitando null (usado com `satisfies` para conferir os nomes antes da conversão). */
export type NullableRpcArgs<F extends keyof Database["public"]["Functions"]> = {
  [K in keyof RpcArgs<F>]?: RpcArgs<F>[K] | null;
};
