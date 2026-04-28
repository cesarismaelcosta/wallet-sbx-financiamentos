// financial-gateway/simulation_handler.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function processSimulation(payload: any) {
  // Ajuste para lidar com a diferença entre 'Caminhoes' (Sandbox) e 'Caminhões' (Banco)
  // Normalizamos ou buscamos de forma inteligente
  const categoryName = payload.offer.category_name;
  
  // Exemplo de busca "fuzzy" simples ou normalização manual
  const { data: catData, error: catError } = await supabase
    .from('category_types')
    .select('id')
    .ilike('name', categoryName === 'Caminhoes' ? 'Caminhões' : categoryName)
    .single();

  if (catError || !catData) {
    throw new Error(`Categoria '${categoryName}' não encontrada.`);
  }

  // 1. Gravar no log de simulações
  const { data: sim, error: simError } = await supabase
    .from('simulations')
    .insert({
      raw_payload: payload,
      category_id: catData.id,
      status: 'RECEIVED'
    })
    .select()
    .single();

  // 2. Resolver o parceiro
  const { data: config, error: configError } = await supabase
    .from('simulation_partner_configs')
    .select(`
      page_url,
      partners (name, phone, contact_type)
    `)
    .eq('config_type', 'CATEGORY')
    .eq('lookup_id', catData.id)
    .single();

  if (!config) throw new Error("Parceiro não configurado.");

  return {
    simulation_id: sim.id,
    target_url: config.page_url,
    partner: config.partners
  };
}