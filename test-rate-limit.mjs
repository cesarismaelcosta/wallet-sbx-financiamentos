// test-rate-limit.mjs
// Uso: node test-rate-limit.mjs [nome-da-function]
// Ex:  node test-rate-limit.mjs sbx-auth
//
// Dispara 12 requisições seguidas contra a Edge Function informada e imprime
// o status HTTP de cada uma. Com o limite padrão de 10/min (ver
// supabase/functions/_shared/registry.ts), espera-se ver o status normal
// (ex: 401, já que o corpo é vazio/inválido de propósito) nas ~10 primeiras
// tentativas, e 429 a partir da 11ª -- a checagem de rate limit roda ANTES
// de qualquer validação de autenticação (ver PASSO 4.5 em _shared/server.ts).
//
// Lê VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY do .env na raiz do projeto --
// não precisa colar nenhuma credencial manualmente nem aqui, nem no chat.
//
// Funciona igual em PowerShell, cmd ou bash (terminal integrado do VS Code
// inclusive) -- roda com `node test-rate-limit.mjs`, sem depender de curl.

import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(new URL("./.env", import.meta.url), "utf-8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const env = loadEnv();
const projectUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

if (!projectUrl || !anonKey) {
  console.error("Não achei VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no .env");
  process.exit(1);
}

const functionName = process.argv[2] || "sbx-auth";
const url = `${projectUrl}/functions/v1/${functionName}`;

console.log(`Testando: ${url}`);
console.log(`(limite configurado: ver rateLimit em _shared/registry.ts para "${functionName}")\n`);

for (let i = 1; i <= 12; i++) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const marker = res.status === 429 ? "  <-- bloqueado pelo rate limit" : "";
    console.log(`Tentativa ${String(i).padStart(2, " ")}: ${res.status}${marker}`);
  } catch (err) {
    console.log(`Tentativa ${String(i).padStart(2, " ")}: falha de rede -- ${err.message}`);
  }
}
