// src/features/financial-hub/core/hooks/useSafeCall.ts
import { useState } from 'react';

export function useSafeCall() {
  const [loading, setLoading] = useState(false);

  const execute = async (apiCall: () => Promise<any>) => {
    setLoading(true);
    try {
      return await apiCall();
    } catch (error: any) {
      // É AQUI que o redirecionamento acontece. 
      // Se for SESSION_EXPIRED, ele para aqui e redireciona.
      if (error?.code === 'SESSION_EXPIRED' || error?.code === 'UNAUTHORIZED') {
        if (error.fallback_url) {
          window.location.href = error.fallback_url;
          return new Promise(() => {}); 
        }
      }
      // Se não for sessão, deixa o componente tratar o erro de negócio
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading };
}