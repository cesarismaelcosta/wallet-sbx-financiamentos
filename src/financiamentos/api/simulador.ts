import { fandiService } from "../services/fandi.service";
import { supabase } from "/src/integrations/supabase/client";

export async function processarSimulacao(dados: any) {
  // Grava o início no banco com todos os campos do seu formulário
  const { data: sim, error: dbError } = await supabase
    .from('simulation')
    .insert([{ 
      name_proponent: dados.cliente.nome,
      document_proponent: dados.cliente.cpf,
      phone_proponent: dados.cliente.celular,
      email_proponent: dados.cliente.email,
      category_name: dados.categoria,
      id_event: dados.lote.idEvento,
      event_description: dados.lote.descEvento,
      id_offer: dados.lote.idOferta,
      offer_description: dados.lote.descOferta,
      offer_value: dados.lote.valor
      // 'id_status' seria setado no update final
    }])
    .select()
    .single();

  if (dbError) {
    console.error("ERRO NO INSERT DO SUPABASE:", dbError);
    throw new Error(`Erro ao salvar no banco: ${dbError.message}`);
  }

  // 2. Envia para o parceiro
  try {
    const resultadoFandi = await fandiService.enviarSimulacao(dados);

    // 3. Atualiza o status para um ID válido (ex: 1)
    await supabase
      .from('simulation')
      .update({ id_status: 1 }) 
      .eq('id', sim.id);

    return resultadoFandi;
  } catch (error) {
    console.error("Erro na chamada da Fandi:", error);
    throw error;
  }
}