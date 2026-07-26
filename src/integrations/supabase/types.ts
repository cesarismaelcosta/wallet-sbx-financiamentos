/**
 * ============================================================================
 * @file database.types.ts
 * @description Definições de Tipos TypeScript e Documentação de Arquitetura do Banco
 * 
 * Este arquivo reflete exatamente o schema real do PostgreSQL. Cada tabela, 
 * coluna, função e enum possui anotações detalhadas sobre seu propósito 
 * operacional e as diretrizes de segurança e RLS (Row Level Security) aplicadas.
 * ============================================================================
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      /**
       * Tabela: allowed_email_domains
       * Objetivo: Armazena os domínios de e-mail corporativos autorizados para acesso ao backoffice.
       * Segurança (RLS): Protegida por políticas restritivas; consultas e escritas restritas a administradores.
       */
      allowed_email_domains: {
        Row: {
          id: string
          domain: string
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          domain: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          domain?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }

      /**
       * Tabela: backoffice_users
       * Objetivo: Gerencia o cadastro, status e os níveis de permissão (RBAC) dos colaboradores do backoffice.
       * Segurança (RLS): Base fundamental para as funções de segurança (SECURITY DEFINER) e políticas de acesso global.
       */
      backoffice_users: {
        Row: {
          id: string
          name: string
          email: string
          role: Database["public"]["Enums"]["backofficerole"]
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          role?: Database["public"]["Enums"]["backofficerole"]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role?: Database["public"]["Enums"]["backofficerole"]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      /**
       * Tabela: category_types
       * Objetivo: Classificação de categorias vinculadas aos tipos de produtos da plataforma.
       * Segurança (RLS): Leitura liberada para colaboradores autenticados.
       */
      category_types: {
        Row: {
          id: number
          name: string
          product_id: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: number
          name: string
          product_id?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          name?: string
          product_id?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }

      /**
       * Tabela: financial_institutions
       * Objetivo: Cadastro de bancos e instituições financeiras parceiras que originam o crédito.
       * Segurança (RLS): Leitura operacional para staff autorizado.
       */
      financial_institutions: {
        Row: {
          id: number
          name: string
          logo_url: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: number
          name: string
          logo_url?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          name?: string
          logo_url?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }

      /**
       * Tabela: login_history
       * Objetivo: Trilha de auditoria e telemetria de eventos de autenticação, acessos e falhas.
       * Segurança (RLS): Escritura blindada via Edge Functions com service_role; consultas restritas a administradores.
       */
      login_history: {
        Row: {
          id: string
          email: string | null
          origin_page: string | null
          origin_function: string | null
          event: string | null
          success: boolean | null
          failure_reason: string | null
          ip_address: string | null
          country: string | null
          state: string | null
          city: string | null
          user_agent: string | null
          device_type: string | null
          operating_system: string | null
          origin_details: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          email?: string | null
          origin_page?: string | null
          origin_function?: string | null
          event?: string | null
          success?: boolean | null
          failure_reason?: string | null
          ip_address?: string | null
          country?: string | null
          state?: string | null
          city?: string | null
          user_agent?: string | null
          device_type?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          origin_page?: string | null
          origin_function?: string | null
          event?: string | null
          success?: boolean | null
          failure_reason?: string | null
          ip_address?: string | null
          country?: string | null
          state?: string | null
          city?: string | null
          user_agent?: string | null
          device_type?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }

      /**
       * Tabela: notification_outbox
       * Objetivo: Fila de processamento e envio assíncrono de notificações e e-mails do sistema.
       * Segurança (RLS): Gerenciada por processos internos e serviços de backend.
       */
      notification_outbox: {
        Row: {
          id: string
          context_type: string
          visit_id: string | null
          visit_update_id: string | null
          simulation_id: string | null
          simulation_update_id: string | null
          channel: string
          template_slug: string
          recipient_type: string
          recipient: string
          subject: string | null
          rendered_content: string | null
          attachments: Json | null
          raw_payload: Json | null
          status: string
          retry_count: number | null
          max_retries: number | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          context_type: string
          visit_id?: string | null
          visit_update_id?: string | null
          simulation_id?: string | null
          simulation_update_id?: string | null
          channel: string
          template_slug: string
          recipient_type: string
          recipient: string
          subject?: string | null
          rendered_content?: string | null
          attachments?: Json | null
          raw_payload?: Json | null
          status?: string
          retry_count?: number | null
          max_retries?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          context_type?: string
          visit_id?: string | null
          visit_update_id?: string | null
          simulation_id?: string | null
          simulation_update_id?: string | null
          channel?: string
          template_slug?: string
          recipient_type?: string
          recipient?: string
          subject?: string | null
          rendered_content?: string | null
          attachments?: Json | null
          raw_payload?: Json | null
          status?: string
          retry_count?: number | null
          max_retries?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      /**
       * Tabela: notifications
       * Objetivo: Histórico consolidado de notificações já disparadas aos usuários e clientes.
       * Segurança (RLS): Acesso restrito para consulta gerencial e auditoria.
       */
      notifications: {
        Row: {
          id: string
          context_type: string
          visit_id: string | null
          visit_update_id: string | null
          simulation_id: string | null
          simulation_update_id: string | null
          channel: string
          template_slug: string
          recipient_type: string
          recipient: string
          subject: string | null
          rendered_content: string | null
          attachments: Json | null
          raw_payload: Json | null
          status: string
          created_at: string
          sent_at: string
        }
        Insert: {
          id: string
          context_type: string
          visit_id?: string | null
          visit_update_id?: string | null
          simulation_id?: string | null
          simulation_update_id?: string | null
          channel: string
          template_slug: string
          recipient_type: string
          recipient: string
          subject?: string | null
          rendered_content?: string | null
          attachments?: Json | null
          raw_payload?: Json | null
          status?: string
          created_at: string
          sent_at?: string
        }
        Update: {
          id?: string
          context_type?: string
          visit_id?: string | null
          visit_update_id?: string | null
          simulation_id?: string | null
          simulation_update_id?: string | null
          channel?: string
          template_slug?: string
          recipient_type?: string
          recipient?: string
          subject?: string | null
          rendered_content?: string | null
          attachments?: Json | null
          raw_payload?: Json | null
          status?: string
          created_at?: string
          sent_at?: string
        }
        Relationships: []
      }

      /**
       * Tabela: orchestrator_configs
       * Objetivo: Configurações dinâmicas de regras de negócio, integrações e orquestração de parceiros.
       * Segurança (RLS): Leitura pública/autenticada para motores de simulação; escrita restrita a admins.
       */
      orchestrator_configs: {
        Row: {
          id: number
          partner_id: number | null
          config_type: string
          lookup_id: number
          page_url: string | null
          is_active: boolean | null
          is_integrated: boolean | null
          integration_method: string | null
          entity_type: string | null
          integration_details: Json | null
          rules: Json | null
          consent_configs: Json | null
          page_configs: Json | null
          page_faqs: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: number
          partner_id?: number | null
          config_type: string
          lookup_id: number
          page_url?: string | null
          is_active?: boolean | null
          is_integrated?: boolean | null
          integration_method?: string | null
          entity_type?: string | null
          integration_details?: Json | null
          rules?: Json | null
          consent_configs?: Json | null
          page_configs?: Json | null
          page_faqs?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          partner_id?: number | null
          config_type?: string
          lookup_id?: number
          page_url?: string | null
          is_active?: boolean | null
          is_integrated?: boolean | null
          integration_method?: string | null
          entity_type?: string | null
          integration_details?: Json | null
          rules?: Json | null
          consent_configs?: Json | null
          page_configs?: Json | null
          page_faqs?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }

      /**
       * Tabela: otp_config
       * Objetivo: Parâmetros de envio e customização para autenticação de dois fatores por OTP.
       * Segurança (RLS): Acesso administrativo total e restrito.
       */
      otp_config: {
        Row: {
          id: string
          sender_email: string
          sender_name: string
          email_subject: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sender_email: string
          sender_name?: string
          email_subject?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sender_email?: string
          sender_name?: string
          email_subject?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      /** Valida se o usuário autenticado via JWT possui cadastro ativo no backoffice. */
      is_current_user_backoffice: { Args: never; Returns: boolean }
      /** Valida se o usuário autenticado via JWT possui perfil de administrador ativo. */
      is_current_user_backoffice_admin: { Args: never; Returns: boolean }
      /** Verifica se o domínio de um e-mail está presente na whitelist de domínios ativos. */
      is_domain_allowed: { Args: { _email: string }; Returns: boolean }
      /** Confirma se um determinado e-mail possui permissão ativa de backoffice. */
      is_email_authorized: { Args: { _email: string }; Returns: boolean }
      /** Aplica controle de rate-limiting baseado em tentativas falhas recentes de OTP. */
      is_email_locked: { Args: { _email: string }; Returns: boolean }
    }
    Enums: {
      /** Níveis de acesso corporativo disponíveis no sistema (RBAC). */
      backofficerole: "admin" | "manager" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      backofficerole: ["admin", "manager", "viewer"],
    },
  },
} as const