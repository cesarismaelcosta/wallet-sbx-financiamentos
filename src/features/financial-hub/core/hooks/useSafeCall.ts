import { useState } from 'react';

/**
 * Hook Wrapper: Centraliza o tratamento de erros (Redirecionamento, Loading, etc.)
 * Evita repetição de lógica em todos os componentes.
 */
export function useSafeCall() {
  const [loading, setLoading] = useState(false);

  const execute = async <T,>(apiCall: () => Promise<T>): Promise<T> => {
    setLoading(true);
    try {
      // Executa a função que foi passada como argumento
      return await apiCall();
    } catch (err: unknown) {
      const error = err as { code?: string; fallback_url?: string } | null;
      // LÓGICA CENTRALIZADA: 
      // Se for erro de sessão, redireciona e para a execução aqui.
      if (error?.code === 'SESSION_EXPIRED' || error?.code === 'UNAUTHORIZED') {
        if (error.fallback_url) {
          const safeUrl = new URL(error.fallback_url, window.location.origin);
          window.location.href = safeUrl.pathname + safeUrl.search;
          return new Promise<T>(() => {}); // Retorna uma promise pendente para congelar o fluxo
        }
      }
      
      // Se não for erro de sessão (ex: erro de negócio, CPF inválido),
      // relança o erro para que o componente (Step1, Nav, etc) saiba o que fazer.
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading };
}