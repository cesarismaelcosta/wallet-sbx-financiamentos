/**
 * E-mails das simulações da FlowCredi (um módulo por parceiro, como fandi-notifications.ts).
 * @path supabase/functions/financial-gateway/flowcredi-notifications.ts
 *
 * Produtos: "mortgage" (Financiamento Imobiliário) e "home_equity" (Crédito com garantia de imóvel).
 * Enviados a cada simulação com condições. Mostram os mesmos cards do site (um por banco: logo,
 * tabela e taxa, 1ª e última parcela). Imóveis traz o botão "Consultar oferta" (oferta da Superbid);
 * home equity não tem oferta. Logos via CID (anexos do bucket `logos`).
 */

import { Consultation, SimulationPayload, EmailTemplateResult } from "../_shared/types.ts";
import { OFFER_BUTTON_CSS, renderOfferButton } from "./email-offer-button.ts";

const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PCT = (v: number) => `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * URL pública do Storage → caminho "bucket/arquivo" usado nos anexos (CID), trocando a
 * logo 400x400 pela versão de e-mail ({banco}_email_96.png: 96x96, com respiro).
 */
function storagePathOf(url?: string | null): string | null {
  const m = String(url ?? "").match(/\/storage\/v1\/object\/public\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/_400_400\.png$/i, "_email_96.png") : null;
}

/**
 * @param consults condições exibidas (uma por banco, `is_selected`)
 * @param payload payload hidratado (entity, offer, event, page_configs)
 * @param values valores da simulação (imóvel, financiado, prazo)
 */
export type FlowEmailProduct = "mortgage" | "home_equity";

export function generateUserEmailNotificationHtml(
  product: FlowEmailProduct,
  consults: Consultation[],
  payload: SimulationPayload,
  values: { valorImovel: number; valorFinanciado: number; prazo: number; imovelTexto?: string },
): EmailTemplateResult {
  const isMortgage = product === "mortgage";
  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#171717";
  const slate = "#525252";
  const muted = "#737373";
  const line = "#e5e5e5";
  const borderCard = "#d4d4d4";
  const surface = "#f5f5f5";
  const surfaceAlt = "#fafafa";
  const blue = "#2246A7";

  const nomeCliente = esc(payload.entity?.name?.trim() || "Cliente");
  const eventoTexto = esc(
    payload.event?.event_id
      ? `${payload.event.event_id} | ${payload.event.event_description || ""}`
      : payload.event?.event_description || "",
  );
  const loteTexto = esc(
    payload.offer?.offer_id ? `${payload.offer.offer_id} | ${payload.offer.offer_description || ""}` : payload.offer?.offer_description || "",
  );
  const entrada = Math.max(0, values.valorImovel - values.valorFinanciado);

  const attachments: EmailTemplateResult["attachments"] = [{ content_id: "logo-wallet", storage_path: "logos/wallet-sbx-header-email.png" }];

  // Cards: mesma ordem do site (menor 1ª parcela primeiro)
  // Pós-fixado (taxa + IPCA): produtos CGI da FlowCredi
  const isPos = (d: any) => /p[oó]s|ipca/i.test(`${d.produto ?? ""} ${d.idProduto ?? ""}`);
  // Imóveis: menor 1ª parcela primeiro. Home equity: Price em cima, SAC embaixo; pré à esquerda, pós à direita.
  const items = consults
    .map((c: any) => ({ c, d: c.details }))
    .filter((x) => x.d)
    .sort((a, b) =>
      isMortgage
        ? a.d.primeiraParcela - b.d.primeiraParcela
        : (a.d.tabela === "PRICE" ? 0 : 1) - (b.d.tabela === "PRICE" ? 0 : 1) || Number(isPos(a.d)) - Number(isPos(b.d)),
    );

  const card = ({ c, d }: { c: any; d: any }, i: number) => {
    const path = storagePathOf(d.logoUrl);
    let logo = "";
    if (path) {
      const cid = `logo-bank-${c.financial_institution_id ?? i}`;
      if (!attachments.some((a) => a.content_id === cid)) attachments.push({ content_id: cid, storage_path: path });
      logo = `<td valign="middle" style="padding-right:12px;"><img src="cid:${cid}" width="36" height="36" alt="${esc(d.banco)}" style="display:block; border:0; border-radius:10px;" /></td>`;
    }
    const nome = !isMortgage
      ? `<div style="font-size:13px; font-weight:600; color:${ink};">${isPos(d) ? "Pós-fixado" : "Pré-fixado"} · ${d.tabela === "SAC" ? "SAC" : "Price"}</div>`
      : path ? "" : `<div style="font-size:13px; font-weight:600; color:${ink};">${esc(d.banco)}</div>`;
    const sac = d.tabela === "SAC" || !isMortgage; // home equity: 1ª e última em todos (o seguro varia e o pós tem IPCA)
    return `
      <td class="col" width="50%" valign="top" style="padding:${i % 2 === 0 ? "0 5px 10px 0" : "0 0 10px 5px"};">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${surfaceAlt}; border:1px solid ${borderCard};">
          <tr><td style="padding:10px 16px 0;">
            <table border="0" cellspacing="0" cellpadding="0"><tr>
              ${logo}
              <td valign="middle">
                ${nome}
                <div style="font-size:12px; font-weight:500; color:#404040;">${
                  isMortgage ? `${esc(d.tabela)} · ${PCT(d.taxaJurosAnual)} a.a.*` : `${PCT(d.taxaJurosMensal)} a.m.${isPos(d) ? " + IPCA" : ""}*`
                }</div>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 16px 0;"><div style="height:1px; line-height:1px; font-size:0; background:${line};">&nbsp;</div></td></tr>
          <tr><td style="padding:10px 16px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>
              <td width="50%" valign="top">
                <div style="font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.8px; color:${muted};">${sac ? "1ª parcela" : "Parcela fixa"}</div>
                <div style="font-size:13px; font-weight:700; color:${blue}; margin-top:2px;">${BRL(d.primeiraParcela)}</div>
              </td>
              ${sac ? `
              <td width="50%" valign="top">
                <div style="font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.8px; color:${muted};">Última parcela</div>
                <div style="font-size:13px; font-weight:500; color:${slate}; margin-top:2px;">${BRL(d.ultimaParcela)}</div>
              </td>` : ""}
            </tr></table>
          </td></tr>
        </table>
      </td>`;
  };

  let gridRows = "";
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2).map((x, j) => card(x, i + j)).join("");
    gridRows += `<tr>${pair}${items.length - i === 1 ? `<td class="col" width="50%" style="padding:0 0 10px 5px;"></td>` : ""}</tr>`;
  }

  const tabelas = [...new Set(items.map((x) => x.d.tabela))].join(" e ");

  const partner = payload.page_configs?.offer_panel?.partner;
  const htmlParceria = partner?.name
    ? `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:24px;"><tr><td align="center">
        <div style="max-width:400px; margin:0 auto; padding:10px 12px; border:1px solid ${borderCard}; font-size:11px; color:${muted}; background:${surfaceAlt}; text-align:center;">
          ${esc(partner.label || "Parceria com:")} <span style="font-weight:600; color:${ink};">${esc(partner.name)}</span>
        </div>
      </td></tr></table>`
    : "";

  const renderFooter = (): string => {
    const config = payload.page_configs?.footer;
    if (!config?.template_text) return "";
    const links = config.links || [];
    return config.template_text
      .split(/\{([^}]+)\}/g)
      .map((part: string) => {
        const link = links.find((l: { text: string; url: string }) => l.text === part);
        return link ? `<a href="${link.url}" style="text-decoration:underline; color:${muted}; font-weight:500;">${part}</a>` : part;
      })
      .join("");
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  ${OFFER_BUTTON_CSS}
  @media only screen and (max-width:480px) { td.col { display:block !important; width:100% !important; padding:0 0 10px 0 !important; } }
</style>
</head>
<body style="margin:0; padding:0; background-color:${surface}; font-family:${fontStack};">
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${surface}; padding:20px 10px;">
  <tr><td align="center">
    <table width="100%" style="width:100%; max-width:640px; background-color:#ffffff; border:1px solid ${line}; border-radius:0;">
      <!-- Cabeçalho = uma imagem só (fundo branco + logo, PNG 960x114 ~2 KB, exibida em 640x76 com altura reservada).
           Leitores de e-mail não alteram imagens, então o cabeçalho continua branco no modo escuro do Gmail.
           O alt estilizado aparece no lugar do ícone enquanto a imagem carrega ou se for bloqueada. -->
      <tr><td align="left" bgcolor="#ffffff" style="padding: 0; background-color: #ffffff; border-bottom: 1px solid ${line};">
        <img src="cid:logo-wallet" alt="Wallet sbX" width="640" height="76" style="display: block; border: 0; width: 100%; max-width: 640px; height: auto; font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 700; line-height: 76px; color: #1d1d1b;" />
      </td></tr>
      <tr><td style="padding:36px 32px;">
        <h3 style="font-size:16px; font-weight:700; color:${ink}; text-transform:uppercase; letter-spacing:-0.3px; margin:0 0 8px 0;">${isMortgage ? "Simulação de financiamento imobiliário" : "Simulação de crédito com garantia de imóvel"}</h3>
        <p style="font-size:13px; line-height:1.6; margin:0 0 20px 0; color:${slate};">
          Olá <b style="color:${ink}; font-weight:600;">${nomeCliente}</b>,<br>
          ${isMortgage
            ? `Aqui estão as condições dos principais bancos para o imóvel que você simulou na Superbid.<br>
          <span style="color:${ink}; font-weight:600;">Confira o imóvel e prepare seu lance.</span>`
            : `Aqui estão as condições dos principais bancos para o crédito com garantia do seu imóvel.<br>
          <span style="color:${ink}; font-weight:600;">Vamos seguir com a análise de crédito?</span>`}
        </p>

        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${surfaceAlt}; border:1px solid ${line}; margin-bottom:20px;">
          <tr><td style="padding:16px 20px;">
            ${isMortgage && eventoTexto ? `<div style="font-size:13px; color:${slate}; margin-bottom:4px;"><b style="color:${ink}; font-weight:600;">Evento:</b> ${eventoTexto}</div>` : ""}
            ${isMortgage ? `<div style="font-size:13px; color:${slate}; margin-bottom:4px;"><b style="color:${ink}; font-weight:600;">Lote:</b> ${loteTexto}</div>` : ""}
            ${!isMortgage && values.imovelTexto ? `<div style="font-size:13px; color:${slate}; margin-bottom:4px;"><b style="color:${ink}; font-weight:600;">Imóvel:</b> ${esc(values.imovelTexto)}</div>` : ""}
            <div style="font-size:13px; color:${slate};"><b style="color:${ink}; font-weight:600;">Valor do imóvel:</b> <b style="color:${ink};">${BRL(values.valorImovel)}</b></div>
          </td></tr>
        </table>

        <p style="font-size:13px; color:${slate}; margin:0 0 10px 0;">
          ${isMortgage
            ? `<b style="color:${ink};">${BRL(entrada)}</b> de entrada + <b style="color:${ink};">${BRL(values.valorFinanciado)}</b> financiados em <b style="color:${ink};">${values.prazo} meses</b>`
            : `<b style="color:${ink};">${BRL(values.valorFinanciado)}</b> de crédito em <b style="color:${ink};">${values.prazo} meses</b>`}${tabelas ? `, tabela ${esc(tabelas)}` : ""}.
        </p>

        <table width="100%" border="0" cellspacing="0" cellpadding="0">${gridRows}</table>

        ${isMortgage ? renderOfferButton(payload.offer, 24, fontStack) : ""}
        ${htmlParceria}

        <p style="margin-top:24px; font-size:12px; color:${muted}; line-height:1.6; text-align:left;">
          * Taxas e valores de referência na data da simulação, sujeitos à análise de crédito e do imóvel pelo banco. Não são garantia de aprovação. A 1ª parcela é a maior do contrato e já inclui seguros (MIP e DFI) e tarifa; no SAC, as parcelas diminuem mês a mês. Mostramos a menor taxa de cada banco, que pode depender do seu relacionamento com ele. ${isMortgage ? "ITBI, registro e avaliação do imóvel não estão incluídos." : "No pós-fixado, as parcelas são corrigidas pelo IPCA, que não está incluído na simulação. Registro e avaliação do imóvel não estão incluídos."}
        </p>
      </td></tr>
      <tr><td style="background-color:${surfaceAlt}; padding:20px 32px; border-top:1px solid ${line}; text-align:center;">
        <p style="margin:0; font-size:11px; color:${muted}; line-height:1.6;">${renderFooter()}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`.trim();

  return { html, attachments };
}
