/**
 * @fileoverview Rota Pai: /financiamentos — Metadados de SEO (head)
 * @path src/routes/financiamentos.tsx
 *
 * Arquivo irmão sem `.lazy` de `financiamentos.lazy.tsx`.
 * Existe só pra carregar `head()` (title/description/canonical) antes do
 * componente montar — `createLazyFileRoute` não aceita `head`/`loader`,
 * só o arquivo non-lazy aceita (mesmo padrão de accounts.signin.tsx).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/financiamentos")({
  head: () => ({
    meta: [
      { title: "Financiamento de Veículos e Cartão | Wallet sbX" },
      { name: "description", content: "Simule financiamento de veículos e cartão de crédito 100% online, sem compromisso. Condições exclusivas para clientes Superbid." },
      { property: "og:title", content: "Financiamento de Veículos e Cartão | Wallet sbX" },
      { property: "og:description", content: "Simule financiamento de veículos e cartão de crédito 100% online, sem compromisso. Condições exclusivas para clientes Superbid." },
    ],
    links: [
      { rel: "canonical", href: "https://wallet.sbx.com.br/financiamentos" },
    ],
  }),
});
