import { createFileRoute } from "@tanstack/react-router";
import { customSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/client.admin";

const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 4;
const RETRY_INTERVAL_MINUTES = 5;

type GeoResult = {
  country: string | null;
  state: string | null;
  city: string | null;
  ok: boolean;
};

function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip.startsWith("::1")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

async function lookupGeo(ip: string): Promise<GeoResult> {
  const token = process.env.IPINFO_TOKEN;
  const url = token
    ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${token}`
    : `https://ipinfo.io/${encodeURIComponent(ip)}/json`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return { country: null, state: null, city: null, ok: false };
    }
    const json = (await res.json()) as {
      country?: string;
      region?: string;
      city?: string;
      bogon?: boolean;
    };
    if (json.bogon) {
      return { country: null, state: null, city: null, ok: true };
    }
    return {
      country: json.country ?? null,
      state: json.region ?? null,
      city: json.city ?? null,
      ok: true,
    };
  } catch {
    return { country: null, state: null, city: null, ok: false };
  }
}

type Row = {
  id: string;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
};

function nextDueIso(): string {
  return new Date(Date.now() + RETRY_INTERVAL_MINUTES * 60_000).toISOString();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/hooks/enrich-loginhistory-geo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const ctx = request.headers.get("lovable-context") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        const authorized =
          ctx === "cron" || (PUBLISHABLE_KEY && token === PUBLISHABLE_KEY);
        if (!authorized) {
          return jsonResponse({ error: "unauthorized" }, 401);
        }

        const nowIso = new Date().toISOString();

        const { data: rows, error: selectError } = await supabaseAdmin
          .from("login_history")
          .select("id, ip_address, metadata")
          .is("city", null)
          .order("created_at", { ascending: false })
          .limit(BATCH_SIZE);

        if (selectError) {
          return jsonResponse({ error: selectError.message }, 500);
        }

        const candidates = (rows ?? []) as Row[];
        const due = candidates.filter((row) => {
          const meta = row.metadata ?? {};
          const status = meta["geo_status"];
          if (status === "ok" || status === "skipped") return false;
          const attempts =
            typeof meta["geo_attempts"] === "number"
              ? (meta["geo_attempts"] as number)
              : 0;
          if (attempts >= MAX_ATTEMPTS) return false;
          const nextAt = meta["geo_next_attempt_at"];
          if (typeof nextAt === "string" && nextAt > nowIso) return false;
          return true;
        });

        let updated = 0;
        let failed = 0;
        let skipped = 0;

        for (const row of due) {
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const attempts =
            typeof meta["geo_attempts"] === "number"
              ? (meta["geo_attempts"] as number)
              : 0;

          if (isPrivateIp(row.ip_address)) {
            await supabaseAdmin
              .from("login_history")
              .update({
                metadata: {
                  ...meta,
                  geo_status: "skipped",
                  geo_reason: "private_or_missing_ip",
                },
              })
              .eq("id", row.id);
            skipped += 1;
            continue;
          }

          const result = await lookupGeo(row.ip_address as string);
          const newAttempts = attempts + 1;

          if (result.ok) {
            await supabaseAdmin
              .from("login_history")
              .update({
                country: result.country,
                state: result.state,
                city: result.city,
                metadata: {
                  ...meta,
                  geo_status: result.city ? "ok" : "skipped",
                  geo_attempts: newAttempts,
                  geo_resolved_at: new Date().toISOString(),
                },
              })
              .eq("id", row.id);
            updated += 1;
          } else {
            const finalAttempt = newAttempts >= MAX_ATTEMPTS;
            await supabaseAdmin
              .from("login_history")
              .update({
                metadata: {
                  ...meta,
                  geo_status: finalAttempt ? "failed" : "pending",
                  geo_attempts: newAttempts,
                  geo_last_error_at: new Date().toISOString(),
                  geo_next_attempt_at: finalAttempt ? null : nextDueIso(),
                },
              })
              .eq("id", row.id);
            failed += 1;
          }
        }

        return jsonResponse({
          success: true,
          considered: candidates.length,
          due: due.length,
          updated,
          failed,
          skipped,
        });
      },
    },
  },
});
