/**
 * @fileoverview Campo de cidade com sugestões do IBGE (Home Equity)
 * @path src/features/financial-hub/components/products/credit/home-equity/CityInput.tsx
 *
 * Com a UF escolhida, carrega as cidades do IBGE (src/services/ibge.ts) e sugere
 * enquanto o cliente digita (sem acento/maiúsculas). Se o IBGE falhar, vira texto livre.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetchCitiesByUf, normalizeCity } from "@/services/ibge";

export function CityInput({
  uf,
  value,
  onChange,
  className,
}: {
  uf: string;
  value: string;
  onChange: (city: string) => void;
  className?: string;
}) {
  const [cities, setCities] = useState<string[] | null>(null); // null = sem lista (texto livre)
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Carrega as cidades da UF; falha → texto livre
  useEffect(() => {
    let alive = true;
    setCities(null);
    if (!uf) return;
    setLoading(true);
    fetchCitiesByUf(uf)
      .then((list) => alive && setCities(list.length ? list : null))
      .catch(() => alive && setCities(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [uf]);

  // Fecha a lista ao clicar fora
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const suggestions = useMemo(() => {
    if (!cities) return [];
    const q = normalizeCity(value);
    if (!q) return cities.slice(0, 8);
    const starts = cities.filter((c) => normalizeCity(c).startsWith(q));
    const contains = cities.filter((c) => !normalizeCity(c).startsWith(q) && normalizeCity(c).includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [cities, value]);

  const pick = (city: string) => {
    onChange(city);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        id="he-city"
        autoComplete="off"
        disabled={!uf}
        placeholder={!uf ? "Escolha o estado primeiro" : cities ? "Digite para buscar" : "Nome completo da cidade"}
        maxLength={120}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => cities && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={className}
      />
      {loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-neutral-400" />}
      {open && cities && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 top-[calc(100%+2px)] max-h-60 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-md rounded-none">
          {suggestions.map((c, i) => (
            <li
              key={c}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === active
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-700 dark:text-neutral-300"
              }`}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
