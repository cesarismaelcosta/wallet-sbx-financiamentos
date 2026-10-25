/**
 * Botão "Consultar oferta" dos e-mails de simulação (imóveis, veículos e cartão).
 * @path supabase/functions/financial-gateway/email-offer-button.ts
 *
 * Leva o cliente à página da oferta no site da Superbid. Branco com borda preta;
 * com o mouse por cima fica preto (Gmail web e Apple Mail — nos demais clientes o
 * botão fica sempre branco). A seta "→" é texto: acompanha a cor do botão.
 *
 * Uso: inclua `OFFER_BUTTON_CSS` dentro de um <style> no <head> do e-mail e
 * `renderOfferButton(payload.offer)` onde o botão deve aparecer.
 */

/** Campos da oferta usados no link (payload.offer). */
type OfferLink = { offer_id?: string | number | null; offer_description?: string | null } | null | undefined;

/** Mesmo formato de URL usado pelo front (getSuperbidUrl). */
export function superbidOfferUrl(offer: OfferLink): string | null {
  if (!offer?.offer_id) return null;
  const slug = String(offer.offer_description || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.superbid.net/oferta/${slug}-${offer.offer_id}`;
}

export const OFFER_BUTTON_CSS =
  "td.sbx-offer-btn:hover{background:#171717 !important;} td.sbx-offer-btn:hover a{color:#ffffff !important;}";

/** Célula do botão (para usar dentro de uma <tr>, sozinha ou ao lado de outro botão). */
export function renderOfferButtonCell(offer: OfferLink, fontStack = "'Inter', Arial, sans-serif"): string {
  const url = superbidOfferUrl(offer);
  if (!url) return "";
  return `
    <td align="center" class="sbx-offer-btn" bgcolor="#ffffff" style="background:#ffffff; border:1px solid #171717; border-radius:0;">
      <a href="${url}" target="_blank" style="font-size:13px; font-family:${fontStack}; font-weight:600; color:#171717; text-decoration:none; padding:12px 24px; display:inline-block; border-radius:0;">
        Consultar oferta&nbsp;&rarr;
      </a>
    </td>`;
}

/** Botão centralizado, em bloco próprio. */
export function renderOfferButton(offer: OfferLink, marginTop = 24, fontStack?: string): string {
  const cell = renderOfferButtonCell(offer, fontStack);
  if (!cell) return "";
  return `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:${marginTop}px;">
      <tr><td align="center">
        <table border="0" cellspacing="0" cellpadding="0"><tr>${cell}</tr></table>
      </td></tr>
    </table>`;
}
