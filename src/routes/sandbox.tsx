import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/sandbox')({
  component: TesteSimulacao,
});

function TesteSimulacao() {
  const [form, setForm] = useState({
    // Entidade
    nome: "Cesar Ismael Pereira da Costa",
    cpf: "03817035764",
    celular: "(21) 988550999",
    email: "cesarismaelcosta@gmail.com",
    
    // Leiloeiro / Evento / Vendedor
    organizerName: "Sold",
    idEvento: "779585",
    descEvento: "Volks|Confia. Caminhões pronta-entrega",
    dataInicio: "2026-04-20T09:00:00Z",
    dataFim: "2026-04-30T18:00:00Z",
    idSeller: "5005",
    legalName: "Logística TransBrasil LTDA",
    tradeName: "Transportes SBX",
    economicGroup: "Grupo SBX",
    
    // Oferta
    idOferta: "4624272",
    descOferta: "CAMINHÃO VOLKSWAGEN EXPRESS DRF 4X2, 2022/2023",
    categoria: "Caminhoes",
    valorOferta: "259000.00",
    anoFab: "2022",
    anoMod: "2023",
    codFipe: "005530-1"
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const executarFluxo = () => {
    const valorNumerico = parseFloat(form.valorOferta.replace(/[^0-9.]/g, ''));
    
    // Estrutura do payload seguindo nosso contrato
    const payload = {
      entity: {
        id_entity: 999,
        document_proponent: form.cpf,
        name_proponent: form.nome,
        phone_proponent: form.celular,
        email_proponent: form.email
      },
      event: {
        id_event: Number(form.idEvento),
        event_description: form.descEvento,
        event_start_date: form.dataInicio,
        event_end_date: form.dataFim,
        id_seller: Number(form.idSeller),
        organizer_name: form.organizerName,
        legal_name: form.legalName,
        trade_name: form.tradeName,
        economic_group: form.economicGroup
      },
      offer: {
        id_offer: Number(form.idOferta),
        offer_description: form.descOferta,
        offer_value: valorNumerico,
        category_name: form.categoria,
        vehicle_details: {
          fipe_code: form.codFipe,
          fipe_value: 250000.00,
          year_manufacture: Number(form.anoFab),
          year_model: Number(form.anoMod)
        }
      }
    };
    
    // Codifica os dados para a URL e abre em uma nova aba
    const encodedData = encodeURIComponent(JSON.stringify(payload));
    window.open(`/financiamentos/veiculos?data=${encodedData}`, "_blank");
  };

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Sandbox: Simulação de Lote</h1>
      
      <div className="grid grid-cols-1 gap-6 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
        
        {/* Proponente */}
        <div className="grid grid-cols-2 gap-4">
          {['nome', 'cpf', 'celular', 'email'].map((campo) => (
            <div key={campo} className="flex flex-col">
              <label className="text-[10px] font-bold uppercase text-gray-400">{campo}</label>
              <input name={campo} value={form[campo as keyof typeof form]} onChange={handleChange} className="border rounded p-2 text-sm" />
            </div>
          ))}
        </div>

        {/* 1. Leiloeiro */}
        <div className="space-y-4 bg-purple-50 p-4 rounded-lg border border-purple-100">
          <h2 className="text-[10px] font-bold uppercase text-purple-600">Leiloeiro</h2>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase text-gray-500">Nome do Organizador</label>
            <input name="organizerName" value={form.organizerName} onChange={handleChange} className="border rounded p-2 text-sm" />
          </div>
        </div>

        {/* 2. Evento */}
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
          <h2 className="text-[10px] font-bold uppercase text-gray-600">Evento</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">ID Evento</label><input name="idEvento" value={form.idEvento} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="col-span-2 flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Descrição do Evento</label><input name="descEvento" value={form.descEvento} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
          </div>
        </div>

        {/* 3. Vendedor */}
        <div className="space-y-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
          <h2 className="text-[10px] font-bold uppercase text-blue-600">Vendedor</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">ID Vendedor</label><input name="idSeller" value={form.idSeller} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Razão Social</label><input name="legalName" value={form.legalName} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Nome Fantasia</label><input name="tradeName" value={form.tradeName} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Grupo Econômico</label><input name="economicGroup" value={form.economicGroup} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
          </div>
        </div>

        {/* Oferta */}
        <div className="space-y-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
          <h2 className="text-[10px] font-bold uppercase text-blue-600">Dados da Oferta</h2>
          <div className="grid grid-cols-4 gap-4">
             <div className="col-span-1 flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">ID Oferta</label><input name="idOferta" value={form.idOferta} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
             <div className="col-span-3 flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Desc. Oferta</label><input name="descOferta" value={form.descOferta} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Ano Fab</label><input name="anoFab" value={form.anoFab} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Ano Mod</label><input name="anoMod" value={form.anoMod} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Código Fipe</label><input name="codFipe" value={form.codFipe} onChange={handleChange} className="border rounded p-2 text-sm" /></div>
            <div className="flex flex-col"><label className="text-[10px] font-bold uppercase text-gray-500">Valor (R$)</label><input name="valorOferta" value={form.valorOferta} onChange={handleChange} className="border rounded p-2 text-sm font-bold" /></div>
          </div>
        </div>

        <select name="categoria" value={form.categoria} onChange={handleChange} className="border-2 border-blue-200 p-3 rounded-lg font-bold text-blue-700 bg-blue-50">
          <option value="Caminhoes">Caminhões</option>
          <option value="Carros">Carros</option>
        </select>
        
        <button onClick={executarFluxo} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition">
          Executar Simulação
        </button>
      </div>
    </div>
  );
}