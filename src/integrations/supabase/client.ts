import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qadgbfhjtgufioxtyamq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZGdiZmhqdGd1ZmlveHR5YW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDA2MTEsImV4cCI6MjA5MjExNjYxMX0.AYzoIWHsIKKMxgxxYLpYt8fqJJ7TpqHT6m9MwAp42Ck";

// Criamos uma configuração base
const options = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
};

// O Supabase já gerencia o armazenamento internamente de forma inteligente.
// Não force o "storage: localStorage" aqui, pois isso quebra o SSR/Vite.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, options);