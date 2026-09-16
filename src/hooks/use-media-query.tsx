import { useState, useEffect } from "react";

/**
 * @fileoverview Hook genérico de media query (baseado em `window.matchMedia`).
 *
 * Diferente de `useIsMobile` (fixo em 768px, usado em várias telas do backoffice/financial-hub),
 * este hook aceita qualquer query — criado para permitir renderização condicional (não só
 * visual/CSS) de blocos que hoje duplicam `<img>` de mobile/desktop no DOM (ver
 * `sbxpay.index.lazy.tsx`), evitando baixar as duas versões da mesma imagem sempre.
 *
 * A leitura inicial é síncrona (via `useState(() => ...)`) porque esta é uma SPA sem SSR —
 * `window` já existe na primeira renderização, então não há "flash" do layout errado
 * esperando o `useEffect` rodar.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // reavalia caso a `query` em si tenha mudado entre renders
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}