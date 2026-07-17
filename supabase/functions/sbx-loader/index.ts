/**
 * @fileoverview Edge Function: sbx-loader (Unified Gateway Initializer)
 * 
 * =========================================================================
 * [ARQUITETURA DE GATEWAY UNIFICADO & AUTH EXCHANGE]
 * =========================================================================
 * Atua como um Backend For Frontend (BFF). Suas responsabilidades são:
 * 1. Auth Exchange: Receber um token bruto da Superbid, validá-lo e trocá-lo 
 *    por um JWT interno (ou validar um JWT interno já existente).
 * 2. BFF Hydration: Buscar dados do usuário, evento e oferta nas APIs da 
 *    Superbid (upstream) e consolidar em um payload único e limpo para o Front-end.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { withSecurity } from "../_shared/server.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { BFFUserProfile, BFFOfferDetails } from "../_shared/types.ts";

const DEBUG_MODE = true;

/**
 * Função utilitária para rastreamento de execução no painel do Supabase.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-LOADER] ${message}`, data ? JSON.stringify(data) : "");
  }
};

const ENV_URLS = {
  production: { api: "https://api.s4bdigital.net", offer: "https://offer-query.superbid.net", event: "https://event-query.superbid.net" },
  staging: { api: "https://stgapi.s4bdigital.net", offer: "https://offer-query.stage.superbid.net", event: "https://event-query.stage.superbid.net" }
};

serve(withSecurity('sbx-loader', async (req: Request) => {

  try {
    const { auth_token, environment, offer_id } = await req.json();

    if (!auth_token || !environment) {
        throw new Error("BAD_REQUEST: Credenciais ou ambiente ausentes.");
    }
    const urls = ENV_URLS[environment as keyof typeof ENV_URLS];

    // =========================================================================
    // DUAL-MODE AUTH
    // =========================================================================
    // O sistema lida com dois cenários:
    // A) O usuário veio da sbX e recebemos o access_token da sbX.
    // B) O usuário já passou pelo app ou logou aqui e trouxe o nosso JWT (Sessão interna).
    let sbx_access_token = auth_token;                  // Assumimos inicialmente que é o token bruto
    const isJwt = auth_token.split('.').length === 3;   // Identificador simples de formato JWT
    let currentSessionToken = null;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (isJwt) {
      debugLog("PASSO 1: JWT detectado. Validando assinatura local...");
      try {
        // Valida criptograficamente se fomos nós que emitimos este JWT
        const jwtSecret = Deno.env.get("JWT_SECRET")!;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        const payload = await verify(auth_token, key);
        currentSessionToken = payload.jti as string; // Extrai o UUID da sessão

        // Busca o acess_token real da sbX armazenado no nosso banco de dados
        const now = new Date().toISOString(); 
        const { data: sessionData, error: sessionError } = await supabaseAdmin
          .from('session_tokens') 
          .select('sbx_access_token')
          .eq('session_token', currentSessionToken) 
          .gt('expires_at', now) // Garante que a sessão ainda está válida
          .single();

        if (sessionError || !sessionData) {
            throw new Error("UUID de sessão não encontrado ou expirado no banco.");
        }

        // Substitui o nosso JWT pelo token real da Superbid para fazer o fetch na API deles
        sbx_access_token = sessionData.sbx_access_token;
        debugLog("PASSO 2: JWT Traduzido. Token upstream recuperado do banco de dados.");

      } catch (err: any) {
        throw new Error(`SESSION_UPSTREAM_EXPIRED: Assinatura JWT inválida ou sessão inexistente. Detalhe: ${err.message}`);
      }
    } else {
      debugLog("PASSO 1: Token Bruto (Raw) detectado. Iniciando Handshake direto com a SBX...");
      // Se caiu aqui, sbx_access_token mantém o valor original enviado pelo Front-end
    }
    
    // =========================================================================
    // VALIDAÇÃO UPSTREAM COM LEITURA REAL DE ERRO
    // =========================================================================
    // Usamos o token (seja o que veio do banco, seja o enviado em auth_token) para validar na sbX
    const userRes = await fetch(`${urls.api}/account/v2/user/me`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${sbx_access_token}` }
    });
    
    // Se a sbX rejeitar, nós *lemos o corpo da resposta* para saber o motivo exato.
    // Isso evita o erro cego "500" e facilita o debug de tokens expirados no servidor deles.
    if (!userRes.ok) {
        const errorBody = await userRes.text();
        debugLog(`[FALHA SUPERBID] Status: ${userRes.status} | Body:`, errorBody);
        
        if (userRes.status === 401) {
            throw new Error("SESSION_UPSTREAM_EXPIRED: O token real da Superbid expirou na origem.");
        }
        
        // Repassa a string exata do erro da Superbid para os nossos logs/frontend
        throw new Error(`UPSTREAM_USER_ERROR (${userRes.status}): ${errorBody}`);
    }
    
    const userData = await userRes.json();
    const account = userData.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];
    const userId = String(account?.id);

    // =========================================================================
    // HIDRATAÇÃO DE PERFIL (BFF Mapping)
    // =========================================================================
    // Limpa a estrutura complexa da Superbid para o formato enxuto que o Front-end precisa
    const userProfile: BFFUserProfile = {
      entity_id: userId,
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((doc: any) => doc.typeName === "cpf")?.number || "",
      document_rg: account?.documents?.find((doc: any) => doc.typeName === 'rg')?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split('T')[0] || "",
      gender: account?.gender === "M" ? "M" : "F",
      login: account?.credentials?.login || "",
      mothers_name: account?.mothersName || "",
      address: mainAddress ? {
        street: mainAddress.addressLine1 || "",
        number: mainAddress.number || "",
        complement: mainAddress.addressLine2 || "",
        neighborhood: mainAddress.district || "",
        city: mainAddress.city || "",
        state: mainAddress.state || "",
        zip_code: mainAddress.zipCode || "",
        country: mainAddress.countryIsoKey || "BR"
      } : null,
      metadata: { processedAt: new Date().toISOString(), originIp: "proxy" }
    };

    // =========================================================================
    // BUSCA E MAPEAMENTO DE OFERTA
    // =========================================================================
    let offerPayload: BFFOfferDetails | null = null;
    
    if (offer_id) {
       const cleanOfferId = String(offer_id).replace(/[^0-9]/g, '');
       const offerUrl = `${urls.offer}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${cleanOfferId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

       const offerRes = await fetch(offerUrl, {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${sbx_access_token}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://www.superbid.net",
            "Referer": "https://www.superbid.net/"
          }
       });

       if (offerRes.status === 401) throw new Error("SESSION_UPSTREAM_EXPIRED: Token Superbid expirado durante busca de ofertas.");
       if (!offerRes.ok) throw new Error(`UPSTREAM_OFFER_ERROR (${offerRes.status}): ${await offerRes.text()}`);
       
       const offerData = await offerRes.json();
       const rawOffer = offerData.offers?.[0];
       
       if (!rawOffer) throw new Error("OFFER_NOT_FOUND: Oferta não localizada no catálogo.");

       const eventUrl = `${urls.event}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${rawOffer.auction?.id || ""}&pageSize=1`;
       const eventRes = await fetch(eventUrl, {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${sbx_access_token}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://www.superbid.net",
            "Referer": "https://www.superbid.net/"
          }
       });
       
       const eventData = eventRes.ok ? (await eventRes.json()).events?.[0] : {};
       
       // Tratamento específico para veículos (identifica atributos extras)
       const productTypeId = rawOffer.product?.productType?.id;
       const isVehicleCategory = [10, 11].includes(productTypeId);
       let vehicleData: any = undefined;

       if (isVehicleCategory) {
           const groups = rawOffer.product?.template?.groups || [];
           const getGroupProp = (groupId: string, propId: string) => 
               groups.find((g: any) => g.id === groupId)?.properties.find((p: any) => p.id === propId)?.value;
           
           vehicleData = {
               manufacture_year: Number(getGroupProp('identificacao', 'anofabricacao')) || 0,
               model_year: Number(getGroupProp('identificacao', 'anomodelo')) || 0,
               fipe_code: getGroupProp('financiamento', 'codigofipe') || "",
           };
       }

       // Montagem final do payload da oferta
       offerPayload = {
         offer: {
           offer_id: String(rawOffer.id),
           lot_number: rawOffer.lotNumber || 1,
           offer_description: rawOffer.product?.shortDesc || rawOffer.offerDescription?.offerDescription || "",
           offer_detailed_description: rawOffer.offerDescription?.offerDescription || "",
           offer_value: rawOffer.price || 0,
           category_id: rawOffer.product?.productType?.id || 0,
           category: rawOffer.product?.productType?.description || "",
           sub_category_id: rawOffer.product?.subCategory?.id || "",
           sub_category: rawOffer.product?.subCategory?.description || "",
           offer_status: rawOffer.offerStatus || "",
           sale_status: rawOffer.saleStatus || "",
           end_date: rawOffer.endDate || "",
           location: {
             neighborhood: rawOffer.product?.location?.neighborhood || "Não informado",
             city: rawOffer.product?.location?.city || "Não informado",
             state: rawOffer.product?.location?.state || "Não informado",
             country: rawOffer.product?.location?.country || "Brasil"
           },             
           ...(vehicleData && { vehicle_details: vehicleData }), // Faz merge apenas se for veículo 
           photos: rawOffer.product?.galleryJson?.map((p: any) => ({
             highlight: p.highlight || false,
             link: p.link,
             thumbnail: p.thumbnailUrl,
             file_name: p.originalFileName,
             type: p.type || "photo",
             content_type: p.contentType || "image/jpeg"
           })) || []
         },
         manager: { 
             manager_id: rawOffer.manager?.id || 0, 
             manager_name: rawOffer.manager?.name || "N/A" 
         },
         event: {
           event_id: String(rawOffer.auction?.id || ""),
           event_description: `${rawOffer.auction?.desc || ""}${rawOffer.auction?.desc && eventData.fullDescription ? " - " : ""}${eventData.fullDescription || ""}`.trim(),
           event_start_date: rawOffer.auction?.beginDate || "",
           event_end_date: rawOffer.auction?.endDate || "",
           modality_id: eventData.modalityId ?? null,
           status_id: eventData.statusId ?? null,
           event_short_description: rawOffer.auction?.desc || "",
           event_full_description: eventData.fullDescription || "",
           event_image_url: eventData.imageURL || ""
         },
         seller: {
           seller_id: String(rawOffer.seller?.id || ""),
           legal_name: rawOffer.seller?.name || "N/A",
           trade_name: rawOffer.seller?.company?.[0]?.fantasyName || "N/A",
           economic_group: rawOffer.seller?.company?.[0]?.fantasyName || "N/A"
         }
       };
    }

    // =========================================================================
    // PERSISTÊNCIA INTELIGENTE
    // =========================================================================
    const agora = new Date()
    const expiraEmSegundos = 14400; // 4 horas
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - (15 * 60 * 1000))

    let finalJwt = auth_token; // Se já chegou como JWT, mantemos o mesmo

    // Só gravamos no banco e emitimos um novo JWT se for um Handshake inicial (acess token da sbX)
    // Isso evita o banco de dados encher de sessões duplicadas a cada refresh da página.
    if (!isJwt) {
        debugLog("Token inicial verificado com sucesso. Persistindo nova sessão no banco...");
        const newSessionToken = crypto.randomUUID();
        const infra = await captureInfrastructure(req);
        
        const { insertError } = await supabaseAdmin
          .from('session_tokens')
          .insert({ 
            session_token: newSessionToken, 
            user_id: userId, 
            sbx_access_token: sbx_access_token, // Guardamos a chave de terceiros aqui
            environment, 
            expires_at: nossaExpiracao.toISOString(),
            ip_address: infra.ip_address,
            origin_details: infra.metadata
          });
          
        if (insertError) {
            throw new Error(`DB_INSERT_FAILURE: Falha catastrófica ao persistir sessão - ${insertError.message}`);
        }

        // Assina criptograficamente a nova sessão (O 'crachá' do nosso sistema)
        const jwtSecret = Deno.env.get("JWT_SECRET")!;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        
        finalJwt = await create(
            { alg: "HS256", typ: "JWT" }, 
            { sub: userId, jti: newSessionToken, exp: getNumericDate(nossaExpiracao.getTime() / 1000) }, 
            key
        );
    } else {
        debugLog("Sessão já existente. Banco de dados poupado. Reutilizando JWT recebido.");
    }

    return { 
      status: 200, 
      data: {
        success: true,
        session_token: finalJwt,
        user_id: userId,
        expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
        server_now_ms: agora.getTime(),
        rehydration_payload: {
          user_profile: userProfile,
          offer_details: offerPayload
        }
      },
      headers: { 
        'Set-Cookie': `session_token=${finalJwt}; Path=/; HttpOnly; SameSite=Lax` 
      }
    };

  } catch (err: any) {
    // =========================================================================
    // DISPATCHER DE ERROS SEGURO
    // =========================================================================
    console.error("[sbx-loader] Erro capturado:", err.message);
    
    let status = 400; 
    
    if (err.message.includes("SESSION_UPSTREAM_EXPIRED")) {
        status = 401; // Front-end deve forçar logout e redirecionar para tela de login
    } else if (err.message.includes("OFFER_NOT_FOUND")) {
        status = 404; // Front-end deve exibir "Oferta indisponível"
    } else if (err.message.includes("UPSTREAM_USER_ERROR") || err.message.includes("UPSTREAM_OFFER_ERROR")) {
        status = 422; // Falha na Superbid. Mudado de 502 para 422 para o frontend conseguir ler o JSON.
    }

    return { 
      status, 
      data: { success: false, message: err.message } 
    };
  }
}));