/**
 * @fileoverview Contexto Global da Simulação (Fonte de Verdade Neutra)
 * * * MOTIVO DA EXISTÊNCIA:
 * Atuar como a memória central (Store) da jornada do usuário. Ele guarda os 
 * dados brutos da API (simData) e as chaves de controle de UI (como a 
 * 'isOrchestratorHydrating') para que qualquer componente em qualquer profundidade 
 * da aplicação possa aceder a essas informações sem a necessidade de passar 
 * "props" manualmente de pai para filho (evitando Prop Drilling).
 * * * POR QUE ESTÁ NA PASTA 'contexts/' E NÃO JUNTO COM O LAYOUT?
 * 1. Fim da Dependência Circular: Evita que componentes "Filhos" (Injetores/Páginas) 
 * precisem importar arquivos de componentes "Pais" (Layout). Todos passam a 
 * importar desta fonte neutra, mantendo a árvore de dependências unidirecional e limpa.
 * 2. Princípio da Responsabilidade Única (SRP): O Layout cuida apenas de desenhar a tela (UI).
 * A pasta de contextos cuida apenas da lógica e retenção de estado em memória.
 * 3. Otimização do React (HMR): Isolar o Contexto num arquivo próprio garante que o 
 * "Fast Refresh" do React funcione perfeitamente durante o desenvolvimento, sem forçar 
 * reloads completos da página a cada save.
 * * * DEPENDÊNCIAS DO ARQUIVO:
 * - 'react': Usa `createContext` para inicializar a memória e `useContext` para expô-la.
 */

import { createContext, useContext } from "react";

// 1. Criação do Contexto React (Neutro, sem dependências de UI ou regras de negócio visuais)
export const FinancialHubContext = createContext<any>(null);

// 2. Hook Customizado (Atalho)
// Exportado para que as páginas e componentes consumam os dados de forma limpa,
// bastando chamar: const { setIsOrchestratorHydrating } = useProductConsult();
export function useProductConsult() {
  return useContext(FinancialHubContext);
}