
/**
 * @fileoverview Resolvedor Compartilhado de Configurações de Jornada
 * @path supabase/functions/_shared/orchestrator-configs.ts
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: SINGLE SOURCE OF BUSINESS RULES
 * =========================================================================
 * Antes da refatoração Zero-Trust, `rules` / `page_configs` / `consent_configs`
 * chegavam ao Financial Gateway DENTRO do payload do cliente. Com o `pickThin`
 * essas chaves passaram a ser (corretamente) descartadas — e o gateway ficaria
 * cego às regras de negócio.
 *
 * Este módulo extrai a lógica de prioridade que vivia duplicada dentro de
 * `orchestrator/index.ts` (`resolveDestination` e `resolveOrchestratorConfigs`)
 * e a expõe para QUALQUER edge function reconstruir a config server-side.
 *
 * [PRIORIDADE DE MATCH] (mais específico -> mais genérico):
 *   EVENT > SELLER > PRODUCT > SUBCATEGORY > CATEGORY
 * O perfil (PF/PJ) é derivado do `entity_type` confiável da hidratação.
 *
 * =========================================================================
 * 🚀 OTIMIZAÇÃO (v2.0.0): RESOLUÇÃO EM CONSULTA ÚNICA
 * =========================================================================
 * Versão anterior (1.0.0) percorria os 5 eixos de prioridade em um `for` que
 * fazia UM `.maybeSingle()` por eixo, sequencialmente — cada consulta esperava
 * a resposta da anterior antes de seguir para a próxima. Medido em produção
 * (logs reais de `orchestrator`/`financial-gateway`), esse custo chegava a
 * ~1.7s-2.3s no pior caso (quando o match só acontecia em CATEGORY).
 *
 * Nesta versão, os eixos com id válido são combinados em um único filtro OR
 * (`config_type.eq.X AND lookup_id.eq.Y`, um bloco por eixo) e o banco é
 * consultado UMA ÚNICA VEZ, trazendo todas as linhas candidatas de uma vez.
 * A ordem de prioridade EVENT > SELLER > PRODUCT > SUBCATEGORY > CATEGORY
 * continua sendo respeitada à risca — só que a escolha da linha vencedora
 * passa a ser feita em memória sobre o resultado já recebido, sem nova
 * ida ao banco. Nenhuma mudança de assinatura, contrato de retorno ou nos
 * chamadores desta função.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 2.0.0
 */

export async function resolveOrchestratorConfigs(args: {
  supabase: any;
  eventId?: string | number | null;
  sellerId?: string | number | null;
  productId?: string | number | null;
  subcategoryId?: string | number | null;
  categoryId?: string | number | null;
  entityType?: "F" | "J" | "PF" | "PJ" | string | null;
}): Promise<ResolvedConfig> {
  const { supabase, eventId, sellerId, productId, subcategoryId, categoryId, entityType } = args;

  const currentProfile = entityType === "J" || entityType === "PJ" ? "PJ" : "PF";

  // Lista de eixos na ordem de prioridade de negócio (mais específico -> mais genérico).
  // Isso NÃO muda: é a mesma ordem EVENT > SELLER > PRODUCT > SUBCATEGORY > CATEGORY de sempre.
  const priorities: Array<{ type: ResolvedConfig["matched_by"]; id: unknown }> = [
    { type: "EVENT", id: eventId },
    { type: "SELLER", id: sellerId },
    { type: "PRODUCT", id: productId },
    { type: "SUBCATEGORY", id: subcategoryId },
    { type: "CATEGORY", id: categoryId },
  ];

  // 🚀 Em vez de filtrar "na hora" dentro do loop de rede, filtramos ANTES, uma vez só, em memória.
  // Isso dá a lista dos eixos que realmente vale a pena perguntar ao banco (ex: só PRODUCT e CATEGORY,
  // se os outros vieram null/undefined/inválidos no payload).
  const validPriorities = priorities
    .map((p) => ({ type: p.type, id: Number(p.id) }))
    .filter((p): p is { type: NonNullable<typeof p.type>; id: number } => Number.isFinite(p.id) && p.id > 0);

  // Caso nenhum eixo tenha vindo válido, nem vale a pena consultar o banco — sai rápido.
  if (validPriorities.length === 0) {
    debugLog("[Configs] Nenhum eixo válido informado para resolução.");
    return { ...EMPTY_CONFIG };
  }

  // 🚀 Em vez de montar UMA condição (.eq/.eq) por eixo dentro do loop,
  // montamos AQUI uma string única cobrindo TODOS os eixos válidos, unidos por OR.
  // Exemplo real (product_id=8, category_id=11):
  //   "and(config_type.eq.PRODUCT,lookup_id.eq.8),and(config_type.eq.CATEGORY,lookup_id.eq.11)"
  // O Supabase interpreta essa string como: (PRODUCT=8) OR (CATEGORY=11).
  const orFilter = validPriorities
    .map((p) => `and(config_type.eq.${p.type},lookup_id.eq.${p.id})`)
    .join(",");

  // 🚀 MUMA ÚNICA ida ao banco, trazendo de uma vez
  // TODAS as linhas que baterem em qualquer um dos eixos válidos.
  // Antes: até 5 chamadas `.maybeSingle()` sequenciais, uma esperando a outra.
  // Agora: 1 chamada, que pode devolver 0, 1 ou várias linhas.
  const { data: rows, error } = await supabase
    .from("orchestrator_configs")
    .select(`${SELECT_COLS}, config_type, lookup_id`) // precisamos de config_type/lookup_id agora
    .eq("is_active", true)                             // continua sendo um AND de fora, aplicado a tudo
    .in("entity_type", [currentProfile, "PF+PJ"])       // idem: continua igual
    .or(orFilter);                                      // aqui entram as 5 possibilidades como OR

  // Erro de rede/consulta: mesmo tratamento de sempre (loga e devolve vazio,
  // já que essa função nunca lança exceção — quem chama decide o que fazer).
  if (error) {
    debugLog(`[Configs][AVISO] Falha na query combinada: ${error.message}`);
    return { ...EMPTY_CONFIG };
  }

  // Banco não achou NADA que bata com nenhum dos eixos perguntados.
  if (!rows || rows.length === 0) {
    debugLog("[Configs] Nenhuma configuração ativa encontrada para o contexto informado.");
    return { ...EMPTY_CONFIG };
  }

  // 🚀 MUDANÇA 4: a escolha de "qual eixo vale" que antes definia a ORDEM DAS CHAMADAS de rede,
  // agora define a ORDEM DE BUSCA dentro da lista `rows` que já está na memória (sem rede nenhuma aqui).
  // Percorre EVENT -> SELLER -> PRODUCT -> SUBCATEGORY -> CATEGORY e usa a primeira que encontrar,
  // exatamente a mesma regra de prioridade de antes.
  for (const priority of validPriorities) {
    const match = rows.find(
      (r: any) => r.config_type === priority.type && Number(r.lookup_id) === priority.id
    );
    if (match) {
      debugLog(`✅ [Configs] Match via ${priority.type}(${priority.id}) | Perfil: ${currentProfile}`);

      // Montagem do retorno é idêntica à versão anterior, só troca `data` por `match`
      // (o nome da variável que guarda a linha vencedora).
      return {
        orchestrator_config_id: match.id ?? null,
        page_url: match.page_url ?? null,
        partner_id: match.partner_id ?? null,
        is_integrated: match.is_integrated ?? false,
        integration_method: match.integration_method ?? null,
        integration_details: match.integration_details ?? {},
        rules: match.rules ?? {},
        consent_configs: match.consent_configs ?? {},
        page_configs: match.page_configs ?? {},
        page_faqs: match.page_faqs ?? {},
        matched_by: priority.type,
      };
    }
  }

  // Caso raro: o banco devolveu linhas (porque bateram no OR), mas nenhuma delas
  // corresponde exatamente a um eixo da lista de prioridade (não deveria acontecer
  // na prática, já que o OR foi montado a partir dos próprios eixos válidos — mas
  // mantemos esse guard por segurança, espelhando o comportamento "nunca lança" da função).
  debugLog("[Configs] Candidatos encontrados, mas nenhum bateu na ordem de prioridade esperada.");
  return { ...EMPTY_CONFIG };
}