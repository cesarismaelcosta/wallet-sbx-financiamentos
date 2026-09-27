/**
 * @fileoverview Rota Pai: /produtos — Metadados de SEO (head)
 * @path src/routes/produtos.tsx
 *
 * Arquivo irmão sem `.lazy` de `produtos.lazy.tsx`.
 * Existe só pra carregar `head()` (title/description/canonical) antes do
 * componente montar — `createLazyFileRoute` não aceita `head`/`loader`,
 * só o arquivo non-lazy aceita (mesmo padrão de accounts.signin.tsx).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Cartão, Veículos, Imóveis e Empréstimos | Wallet sbX" },
      {
        name: "description",
        content:
          "Simule cartão de crédito, empréstimo com garantia de carro ou imóvel e seguros. Financie carros e caminhões anunciados na Superbid, 100% online, com sua Wallet sbX.",
      },
      { property: "og:title", content: "Cartão, Veículos, Imóveis e Empréstimos | Superbid | Wallet sbX" },
      {
        property: "og:description",
        content:
          "Simule cartão de crédito, empréstimo com garantia de carro ou imóvel e seguros. Financie carros e caminhões anunciados na Superbid, 100% online, com sua Wallet sbX.",
      },
    ],
    links: [{ rel: "canonical", href: "https://wallet.sbx.com.br/produtos" }],
  }),
});
