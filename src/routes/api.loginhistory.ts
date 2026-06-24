import { createFileRoute } from "@tanstack/react-router";
import { customSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/client.admin";

type LoginHistoryEvent = "login" | "logout" | "failed_attempt" | "blocked";

type Payload = {
  email?: string;
  event?: LoginHistoryEvent;
  success?: boolean;
  failureReason?: string | null;
  occurredAt?: string;
};

function parseDevice(ua: string | null): {
  devicetype: string | null;
  operatingsystem: string | null;
} {
  if (!ua) return { devicetype: null, operatingsystem: null };
  const lower = ua.toLowerCase();
  let devicetype: string | null = "desktop";
  if (/mobile|iphone|android.+mobile/.test(lower)) devicetype = "mobile";
  else if (/ipad|tablet/.test(lower)) devicetype = "tablet";

  let operatingsystem: string | null = null;
  if (/windows/.test(lower)) operatingsystem = "Windows";
  else if (/mac os x|macintosh/.test(lower)) operatingsystem = "macOS";
  else if (/android/.test(lower)) operatingsystem = "Android";
  else if (/iphone|ipad|ios/.test(lower)) operatingsystem = "iOS";
  else if (/linux/.test(lower)) operatingsystem = "Linux";

  return { devicetype, operatingsystem };
}

function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip.startsWith("::1")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

type QuickGeo = {
  country: string | null;
  state: string | null;
  city: string | null;
  status: "ok" | "skipped" | "pending";
};

async function tryQuickGeo(ip: string | null): Promise<QuickGeo> {
  if (isPrivateIp(ip)) {
    return { country: null, state: null, city: null, status: "skipped" };
  }
  const token = process.env.IPINFO_TOKEN;
  const url = token
    ? `https://ipinfo.io/${encodeURIComponent(ip!)}/json?token=${token}`
    : `https://ipinfo.io/${encodeURIComponent(ip!)}/json`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(1500),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return { country: null, state: null, city: null, status: "pending" };
    }
    const data = (await res.json()) as {
      country?: string;
      region?: string;
      city?: string;
      bogon?: boolean;
    };
    if (data.bogon) {
      return { country: null, state: null, city: null, status: "skipped" };
    }
    return {
      country: data.country ?? null,
      state: data.region ?? null,
      city: data.city ?? null,
      status: data.city ? "ok" : "pending",
    };
  } catch {
    return { country: null, state: null, city: null, status: "pending" };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeOccurredAt(value?: string) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export const Route = createFileRoute("/api/loginhistory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const accessToken = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

          if (!accessToken) {
            return json({ error: "missing access token" }, 401);
          }

          let authUserEmail: string | null = null;
          try {
            const { data: authData, error: authError } =
              await supabaseAdmin.auth.getUser(accessToken);
            if (authError || !authData.user?.email) {
              console.error("loginhistory auth error", authError);
              return json({ error: "invalid session" }, 401);
            }
            authUserEmail = authData.user.email.toLowerCase();
          } catch (err) {
            console.error("loginhistory auth exception", err);
            return json({ error: "auth check failed" }, 401);
          }

          let payload: Payload;
          try {
            payload = (await request.json()) as Payload;
          } catch (err) {
            console.error("loginhistory invalid json", err);
            return json({ error: "invalid json body" }, 400);
          }

          const email = payload.email?.toLowerCase().trim();
          const event = payload.event;

          if (!email || !event) {
            return json({ error: "missing email or event" }, 400);
          }

          const allowedEvents: LoginHistoryEvent[] = [
            "login",
            "logout",
            "failed_attempt",
            "blocked",
          ];
          if (!allowedEvents.includes(event)) {
            return json({ error: "invalid event" }, 400);
          }

          if (event !== "blocked" && email !== authUserEmail) {
            return json({ error: "email/token mismatch" }, 403);
          }

          const ua = request.headers.get("user-agent");
          const forwardedFor = request.headers.get("x-forwarded-for");
          const ip =
            forwardedFor?.split(",")[0]?.trim() ??
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-real-ip") ??
            null;

          const { devicetype: deviceType, operatingsystem: operatingSystem } =
            parseDevice(ua);

          let geo: QuickGeo = {
            country: null,
            state: null,
            city: null,
            status: "pending",
          };
          try {
            geo = await tryQuickGeo(ip);
          } catch (err) {
            console.error("loginhistory geo lookup failed", err);
          }

          const occurredAt = normalizeOccurredAt(payload.occurredAt);
          const source =
            event === "blocked" &&
            payload.failureReason === "route_access_denied"
              ? "route_guard"
              : "google_oauth";

          const { error } = await supabaseAdmin.from("login_history").insert({
            email,
            event,
            success: payload.success ?? true,
            failure_reason: payload.failureReason ?? null,
            ip_address: ip,
            user_agent: ua,
            device_type: deviceType,
            operating_system: operatingSystem,
            country: geo.country,
            state: geo.state,
            city: geo.city,
            metadata: {
              source,
              occurred_at: occurredAt,
              geo_status: geo.status,
              geo_attempts:
                geo.status === "ok" ? 1 : geo.status === "skipped" ? 0 : 1,
            },
          });

          if (error) {
            console.error("loginhistory insert error", error);
            return json({ error: error.message }, 500);
          }

          return json({ success: true });
        } catch (err) {
          console.error("loginhistory unhandled exception", err);
          const message = err instanceof Error ? err.message : String(err);
          return json({ error: "internal error", detail: message }, 500);
        }
      },
    },
  },
});
