/**
 * @fileoverview Logo do banco (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/flowcredi/BankLogo.tsx
 *
 * Usado nos blocos de ofertas (Step2Offers) e na gaveta de detalhes.
 */

import { useState } from "react";
import type { SyntheticEvent } from "react";

/**
 * Logo do banco com respiro: mede quanto o desenho ocupa da imagem (pixels
 * diferentes da cor do canto, via canvas no onLoad).
 *  - Desenho colado na borda (ex.: Santander): reduz até ocupar ~68% do quadro
 *    e pinta a margem com a cor do canto.
 *  - Desenho que já tem margem (ex.: Itaú) ou canto branco/transparente
 *    (ex.: Inter, cantos arredondados): mostra a imagem inteira, sem reduzir.
 */
const LOGO_TARGET_FILL = 0.68;

export function BankLogo({ src, alt, size = "sm" }: { src?: string | null; alt: string; size?: "sm" | "lg" }) {
  const [bg, setBg] = useState<string | undefined>(undefined);
  const [scale, setScale] = useState(100); // % do quadro ocupado pela imagem

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    try {
      const img = e.currentTarget;
      const N = 64;
      const cv = document.createElement("canvas");
      cv.width = N;
      cv.height = N;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data;
      const [r0, g0, b0, a0] = [d[4 * (N + 1)], d[4 * (N + 1) + 1], d[4 * (N + 1) + 2], d[4 * (N + 1) + 3]];
      if (a0 < 10 || (r0 > 235 && g0 > 235 && b0 > 235)) return; // canto branco/transparente: imagem inteira

      let minX = N, minY = N, maxX = -1, maxY = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = 4 * (y * N + x);
          if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 60) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return;
      const fill = Math.max(maxX - minX + 1, maxY - minY + 1) / N;
      if (fill <= LOGO_TARGET_FILL + 0.05) return; // já tem respiro: imagem inteira
      setScale(Math.round((LOGO_TARGET_FILL / fill) * 100));
      setBg(`rgb(${r0}, ${g0}, ${b0})`);
    } catch {
      /* CORS/canvas indisponível: imagem inteira */
    }
  };

  return (
    <div
      className={`flex ${size === "lg" ? "h-11 w-11 rounded-[12px]" : "h-8 w-8 rounded-[9px]"} items-center justify-center bg-neutral-50 dark:bg-neutral-800 overflow-hidden border border-neutral-200 dark:border-neutral-800 shrink-0`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {src ? (
        <img
          src={src}
          crossOrigin="anonymous"
          onLoad={onLoad}
          style={bg ? { width: `${scale}%`, height: `${scale}%` } : undefined}
          className={bg ? "object-contain" : "h-full w-full object-cover"}
          alt={alt}
        />
      ) : (
        <span className="text-[10px] font-bold uppercase text-neutral-600 dark:text-neutral-300">{alt.slice(0, 3)}</span>
      )}
    </div>
  );
}
