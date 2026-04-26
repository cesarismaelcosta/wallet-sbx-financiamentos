import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type EntityRow = Tables<"entity">;

/**
 * ⚠️ TEMPORARY / INSECURE BY DESIGN
 * Proponent identity comes from URL query params delivered by Superbid.
 * Anyone can forge these values — this MUST be replaced by a signed JWT
 * (or server-to-server handshake) before going to production.
 */
const ProponentParamsSchema = z.object({
  cpf: z
    .string()
    .trim()
    .min(11)
    .max(20)
    .regex(/^[\d.\-/]+$/, "CPF inválido"),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).optional().nullable(),
  telefone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[\d\s().+\-]*$/)
    .optional()
    .nullable(),
});

export type Proponent = {
  identity: string;
  document: string;
  fullname: string;
  email: string | null;
  phone: string | null;
};

const STORAGE_KEY = "sbx.proponent";

function normalizeDoc(doc: string) {
  return doc.replace(/\D/g, "");
}

export function readProponentFromStorage(): Proponent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Proponent;
  } catch {
    return null;
  }
}

function saveProponent(p: Proponent) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function clearProponent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Reads CPF/nome/email/telefone from URL, validates, upserts on `entity`,
 * and stores the resulting identity in sessionStorage.
 */
export async function autoLoginProponentFromUrl(): Promise<Proponent | null> {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const candidate = {
    cpf: params.get("cpf") ?? "",
    nome: params.get("nome") ?? "",
    email: params.get("email"),
    telefone: params.get("telefone"),
  };

  // No params → fall back to existing session
  if (!candidate.cpf || !candidate.nome) {
    return readProponentFromStorage();
  }

  const parsed = ProponentParamsSchema.safeParse(candidate);
  if (!parsed.success) {
    console.warn("[proponent] invalid URL params", parsed.error.flatten());
    return readProponentFromStorage();
  }

  const doc = normalizeDoc(parsed.data.cpf);

  // Try to find existing entity by document
  const { data: existing, error: selectError } = await supabase
    .from("entity")
    .select("*")
    .eq("entitydocument", doc)
    .maybeSingle();

  if (selectError) {
    console.warn("[proponent] select failed (RLS?):", selectError.message);
  }

  let row: EntityRow | null = (existing as EntityRow | null) ?? null;

  if (!row) {
    const { data: inserted, error: insertError } = await supabase
      .from("entity")
      .insert({
        entitydocument: doc,
        fullname: parsed.data.nome,
        email: parsed.data.email ?? null,
        phonenumber: parsed.data.telefone ?? null,
        entitytype: doc.length === 11 ? "PF" : "PJ",
      })
      .select()
      .single();

    if (insertError) {
      console.warn("[proponent] insert failed:", insertError.message);
      return null;
    }
    row = inserted as EntityRow;
  }

  const proponent: Proponent = {
    identity: row.identity,
    document: row.entitydocument,
    fullname: row.fullname,
    email: row.email,
    phone: row.phonenumber,
  };
  saveProponent(proponent);

  // Clean URL so the params don't leak in shares/refreshes
  const url = new URL(window.location.href);
  ["cpf", "nome", "email", "telefone"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState({}, "", url.toString());

  return proponent;
}
