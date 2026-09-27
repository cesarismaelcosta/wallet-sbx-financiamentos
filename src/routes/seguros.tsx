/**
 * @fileoverview Rota Pai: /seguros — Metadados de SEO (head)
 * @path src/routes/seguros.tsx
 *
 * Arquivo irmão sem `.lazy` de `seguros.lazy.tsx`.
 * Existe só pra carregar `head()` (title/description/canonical) antes do
 * componente montar — `createLazyFileRoute` não aceita `head`/`loader`,
 * só o arquivo non-lazy aceita (mesmo padrão de accounts.signin.tsx).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/seguros")({
  head: () => ({
    meta: [
      { title: "Seguro Auto e Residencial | Wallet sbX" },
      { name: "description", content: "Contrate seguro auto e residencial com as melhores condições, 100% online. Cotação rápida e sem compromisso na Wallet sbX." },
      { property: "og:title", content: "Seguro Auto e Residencial | Wallet sbX" },
      { property: "og:description", content: "Contrate seguro auto e residencial com as melhores condições, 100% online. Cotação rápida e sem compromisso na Wallet sbX." },
    ],
    links: [
      { rel: "canonical", href: "https://wallet.sbx.com.br/seguros" },
    ],
  }),
});
