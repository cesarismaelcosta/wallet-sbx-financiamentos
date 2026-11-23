/**
 * @fileoverview E-mails do pedido de acesso ao backoffice (pedido, liberação, recusa)
 * @path supabase/functions/_shared/backoffice-access-email.ts
 *
 * Monta o HTML (todo texto vindo do usuário passa por escape) e grava na `notification_outbox`
 * com context_type `BACKOFFICE_ACCESS` (migração 20261123100000). O envio é do
 * `notification-gateway`, como os demais e-mails. Usado só por `manage-backoffice-users`.
 *  - pedido   → admins ativos do backoffice (role admin)
 *  - liberado → a pessoa, com papel, parceiros e produtos liberados
 *  - recusado → a pessoa, com o motivo
 * Link do botão: FRONTEND_URL (sem ela, o e-mail sai sem botão).
 */

import { debugLog } from "./logger.ts";

type OutboxClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export type AccessEmailKind = "pedido" | "liberado" | "recusado";

export type AccessEmailData = {
  kind: AccessEmailKind;
  to: string[];
  name: string | null;
  email: string;
  partners: string[];
  products: string[];
  reason?: string | null;
  role?: string | null;
};

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", manager: "Gestor", viewer: "Visualizador" };

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const list = (items: string[]) => (items.length ? items.map(esc).join(", ") : "—");

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 12px 6px 0;color:#737373;font-size:13px;vertical-align:top;white-space:nowrap">${label}</td>` +
    `<td style="padding:6px 0;color:#171717;font-size:13px">${value}</td></tr>`;
}

function build(data: AccessEmailData): { subject: string; title: string; intro: string; rows: string; path: string; button: string } {
  const who = esc(data.name || data.email);
  if (data.kind === "pedido") {
    return {
      subject: `Pedido de acesso ao backoffice: ${data.name || data.email}`,
      title: "Novo pedido de acesso",
      intro: `<b>${who}</b> pediu acesso ao backoffice.`,
      rows: row("E-mail", esc(data.email)) + row("Produtos", list(data.products)) + row("Motivo", esc(data.reason)),
      path: "/backoffice/users",
      button: "Abrir usuários",
    };
  }
  if (data.kind === "liberado") {
    return {
      subject: "Seu acesso ao backoffice foi liberado",
      title: "Acesso liberado",
      intro: `Olá, ${who}. Seu acesso ao backoffice foi liberado.`,
      rows: row("Perfil", esc(ROLE_LABEL[data.role || ""] || data.role)) +
        row("Parceiros", data.role === "viewer" ? list(data.partners) : "Todos") +
        row("Produtos", data.role === "viewer" ? list(data.products) : "Todos"),
      path: "/backoffice/login",
      button: "Entrar no backoffice",
    };
  }
  return {
    subject: "Seu pedido de acesso ao backoffice foi recusado",
    title: "Pedido recusado",
    intro: `Olá, ${who}. Seu pedido de acesso ao backoffice foi recusado. Você pode enviar um novo pedido.`,
    rows: row("Motivo", esc(data.reason)),
    path: "/backoffice/login",
    button: "Fazer novo pedido",
  };
}

function render(data: AccessEmailData) {
  const b = build(data);
  const base = (Deno.env.get("FRONTEND_URL") || "").replace(/\/+$/, "");
  const button = base
    ? `<p style="margin:28px 0 0"><a href="${esc(base + b.path)}" style="background:#171717;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block">${b.button}</a></p>`
    : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Inter',Arial,sans-serif;">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;padding:20px 10px;"><tr><td align="center">
<table width="100%" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e5e5e5;">
<tr><td style="padding:0;border-bottom:1px solid #e5e5e5;"><img src="cid:logo-wallet" alt="Wallet sbX" width="640" height="76" style="display:block;border:0;width:100%;max-width:640px;height:auto;" /></td></tr>
<tr><td style="padding:32px;">
<h2 style="margin:0 0 12px;color:#171717;font-size:20px;">${b.title}</h2>
<p style="font-size:15px;line-height:1.6;color:#525252;margin:0 0 20px;">${b.intro}</p>
<table border="0" cellspacing="0" cellpadding="0">${b.rows}</table>
${button}
</td></tr>
<tr><td style="background-color:#fafafa;padding:20px 32px;border-top:1px solid #e5e5e5;text-align:center;"><p style="margin:0;font-size:11px;color:#737373;">Mensagem automática do backoffice Wallet sbX.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: b.subject, html };
}

/** Grava o e-mail na fila. Não lança: falha no e-mail não desfaz o pedido/decisão. */
export async function queueAccessEmail(client: unknown, data: AccessEmailData): Promise<void> {
  const to = [...new Set(data.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) {
    debugLog("[backoffice-access-email] Sem destinatários; e-mail não enviado:", data.kind);
    return;
  }
  const { subject, html } = render(data);
  try {
    const { error } = await (client as OutboxClient).from("notification_outbox").insert({
      context_type: "BACKOFFICE_ACCESS",
      channel: "email",
      template_slug: `backoffice-access-${data.kind}`,
      recipient_type: "INTERNAL",
      recipient: to.join(";"),
      subject,
      rendered_content: html,
      attachments: [{ content_id: "logo-wallet", storage_path: "logos/wallet-sbx-header-email.png" }],
      raw_payload: {
        kind: data.kind, email: data.email, name: data.name, role: data.role ?? null,
        partners: data.partners, products: data.products, reason: data.reason ?? null,
      },
      status: "pending",
    });
    if (error) debugLog("[backoffice-access-email] Falha ao gravar na fila:", error.message);
  } catch (caught: unknown) {
    debugLog("[backoffice-access-email] Falha ao gravar na fila:", (caught as Error)?.message);
  }
}
