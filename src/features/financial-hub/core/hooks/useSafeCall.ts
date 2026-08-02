import { useState } from 'react';

/**
 * Hook Wrapper: Centraliza o tratamento de erros (Redirecionamento, Loading, etc.)
 * Evita repetição de lógica em todos os componentes.
 */
export function useSafeCall() {
  const [loading, setLoading] = useState(false);

  const execute = async (apiCall: () => Promise<any>) => {
    setLoading(true);
    try {
      // Executa a função que foi passada como argumento
      return await apiCall();
    } catch (error: any) {
      // LÓGICA CENTRALIZADA: 
      // Se for erro de sessão, redireciona e para a execução aqui.
      if (error?.code === 'SESSION_EXPIRED' || error?.code === 'UNAUTHORIZED') {
        if (error.fallback_url) {
          window.location.href = error.fallback_url;
          return new Promise(() => {}); // Retorna uma promise pendente para congelar o fluxo
        }
      }
      
      // Se não for erro de sessão (ex: erro de negócio, CPF inválido),
      // relança o erro para que o componente (Step1, Nav, etc) saiba o que fazer.
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading };
}