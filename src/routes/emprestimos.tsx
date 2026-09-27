/**
 * @fileoverview Rota Pai: /emprestimos — Metadados de SEO (head)
 * @path src/routes/emprestimos.tsx
 *
 * Arquivo irmão sem `.lazy` de `emprestimos.lazy.tsx`.
 * Existe só pra carregar `head()` (title/description/canonical) antes do
 * componente montar — `createLazyFileRoute` não aceita `head`/`loader`,
 * só o arquivo non-lazy aceita (mesmo padrão de accounts.signin.tsx).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/emprestimos")({
  head: () => ({
    meta: [
      { title: "Empréstimo com Garantia de Veículo | Wallet sbX" },
      { name: "description", content: "Empréstimo com garantia de veículo (auto equity), condições exclusivas e simulação 100% online na Wallet sbX." },
      { property: "og:title", content: "Empréstimo com Garantia de Veículo | Wallet sbX" },
      { property: "og:description", content: "Empréstimo com garantia de veículo (auto equity), condições exclusivas e simulação 100% online na Wallet sbX." },
    ],
    links: [
      { rel: "canonical", href: "https://wallet.sbx.com.br/emprestimos" },
    ],
  }),
});
