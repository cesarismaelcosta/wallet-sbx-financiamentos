export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      allowed_email_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backoffice_users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          role: Database["public"]["Enums"]["backofficerole"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
          role: Database["public"]["Enums"]["backofficerole"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: Database["public"]["Enums"]["backofficerole"]
          updated_at?: string
        }
        Relationships: []
      }
      category_types: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
          product_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: number
          is_active?: boolean | null
          name: string
          product_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          product_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_institutions: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          logo_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: number
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      login_history: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          email: string | null
          event: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          operating_system: string | null
          origin_details: Json | null
          origin_function: string | null
          origin_page: string | null
          state: string | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          event?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          origin_function?: string | null
          origin_page?: string | null
          state?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          event?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          origin_function?: string | null
          origin_page?: string | null
          state?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
      }
      notification_alert_recipients: {
        Row: {
          alert_category: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          alert_category?: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          alert_category?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          attachments: Json | null
          channel: string
          context_type: string
          created_at: string
          error_message: string | null
          id: string
          max_retries: number | null
          raw_payload: Json | null
          recipient: string
          recipient_type: string
          rendered_content: string | null
          retry_count: number | null
          simulation_id: string | null
          simulation_update_id: string | null
          status: string
          subject: string | null
          template_slug: string
          updated_at: string
          visit_id: string | null
          visit_update_id: string | null
        }
        Insert: {
          attachments?: Json | null
          channel: string
          context_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          max_retries?: number | null
          raw_payload?: Json | null
          recipient: string
          recipient_type: string
          rendered_content?: string | null
          retry_count?: number | null
          simulation_id?: string | null
          simulation_update_id?: string | null
          status?: string
          subject?: string | null
          template_slug: string
          updated_at?: string
          visit_id?: string | null
          visit_update_id?: string | null
        }
        Update: {
          attachments?: Json | null
          channel?: string
          context_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          max_retries?: number | null
          raw_payload?: Json | null
          recipient?: string
          recipient_type?: string
          rendered_content?: string | null
          retry_count?: number | null
          simulation_id?: string | null
          simulation_update_id?: string | null
          status?: string
          subject?: string | null
          template_slug?: string
          updated_at?: string
          visit_id?: string | null
          visit_update_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attachments: Json | null
          channel: string
          context_type: string
          created_at: string
          id: string
          raw_payload: Json | null
          recipient: string
          recipient_type: string
          rendered_content: string | null
          sent_at: string
          simulation_id: string | null
          simulation_update_id: string | null
          status: string
          subject: string | null
          template_slug: string
          visit_id: string | null
          visit_update_id: string | null
        }
        Insert: {
          attachments?: Json | null
          channel: string
          context_type: string
          created_at: string
          id: string
          raw_payload?: Json | null
          recipient: string
          recipient_type: string
          rendered_content?: string | null
          sent_at?: string
          simulation_id?: string | null
          simulation_update_id?: string | null
          status?: string
          subject?: string | null
          template_slug: string
          visit_id?: string | null
          visit_update_id?: string | null
        }
        Update: {
          attachments?: Json | null
          channel?: string
          context_type?: string
          created_at?: string
          id?: string
          raw_payload?: Json | null
          recipient?: string
          recipient_type?: string
          rendered_content?: string | null
          sent_at?: string
          simulation_id?: string | null
          simulation_update_id?: string | null
          status?: string
          subject?: string | null
          template_slug?: string
          visit_id?: string | null
          visit_update_id?: string | null
        }
        Relationships: []
      }
      orchestrator_configs: {
        Row: {
          config_type: string
          consent_configs: Json | null
          created_at: string | null
          entity_type: string | null
          id: number
          integration_details: Json | null
          integration_method: string | null
          is_active: boolean | null
          is_integrated: boolean | null
          lookup_id: number
          page_configs: Json | null
          page_faqs: Json | null
          page_url: string | null
          partner_id: number | null
          rules: Json | null
          updated_at: string | null
        }
        Insert: {
          config_type: string
          consent_configs?: Json | null
          created_at?: string | null
          entity_type?: string | null
          id?: never
          integration_details?: Json | null
          integration_method?: string | null
          is_active?: boolean | null
          is_integrated?: boolean | null
          lookup_id: number
          page_configs?: Json | null
          page_faqs?: Json | null
          page_url?: string | null
          partner_id?: number | null
          rules?: Json | null
          updated_at?: string | null
        }
        Update: {
          config_type?: string
          consent_configs?: Json | null
          created_at?: string | null
          entity_type?: string | null
          id?: never
          integration_details?: Json | null
          integration_method?: string | null
          is_active?: boolean | null
          is_integrated?: boolean | null
          lookup_id?: number
          page_configs?: Json | null
          page_faqs?: Json | null
          page_url?: string | null
          partner_id?: number | null
          rules?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestrator_configs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_config: {
        Row: {
          created_at: string
          email_subject: string
          id: string
          is_active: boolean
          sender_email: string
          sender_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_subject?: string
          id?: string
          is_active?: boolean
          sender_email: string
          sender_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_subject?: string
          id?: string
          is_active?: boolean
          sender_email?: string
          sender_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          business_model: string | null
          contact_type: string | null
          created_at: string | null
          document: string | null
          email: string | null
          id: number
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          business_model?: string | null
          contact_type?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          id?: never
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          business_model?: string | null
          contact_type?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          id?: never
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      product_types: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      result_partner_types: {
        Row: {
          created_at: string | null
          description: string
          id: string
          partner_id: number
          result_id: string | null
          status_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id: string
          partner_id: number
          result_id?: string | null
          status_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          partner_id?: number
          result_id?: string | null
          status_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "result_partner_types_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "result_types"
            referencedColumns: ["id"]
          },
        ]
      }
      result_types: {
        Row: {
          created_at: string | null
          description: string
          id: string
          status_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id: string
          status_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          status_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "result_types_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_types"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tokens: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          environment: string
          expires_at: string
          ip_address: string | null
          operating_system: string | null
          origin_details: Json | null
          sbx_access_token: string
          session_token: string
          state: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          environment: string
          expires_at: string
          ip_address?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          sbx_access_token: string
          session_token?: string
          state?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          environment?: string
          expires_at?: string
          ip_address?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          sbx_access_token?: string
          session_token?: string
          state?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      simulation_collateral_home: {
        Row: {
          address: string | null
          city: string | null
          collateral_details: Json | null
          complement: string | null
          country: string | null
          created_at: string | null
          debt_amount: number | null
          estimated_value: number | null
          has_deed: string | null
          id: string
          neighborhood: string | null
          number: string | null
          owners: string[] | null
          postal_code: string | null
          real_estate_type: string | null
          simulation_id: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          collateral_details?: Json | null
          complement?: string | null
          country?: string | null
          created_at?: string | null
          debt_amount?: number | null
          estimated_value?: number | null
          has_deed?: string | null
          id?: string
          neighborhood?: string | null
          number?: string | null
          owners?: string[] | null
          postal_code?: string | null
          real_estate_type?: string | null
          simulation_id: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          collateral_details?: Json | null
          complement?: string | null
          country?: string | null
          created_at?: string | null
          debt_amount?: number | null
          estimated_value?: number | null
          has_deed?: string | null
          id?: string
          neighborhood?: string | null
          number?: string | null
          owners?: string[] | null
          postal_code?: string | null
          real_estate_type?: string | null
          simulation_id?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_collateral_home_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_collateral_vehicle: {
        Row: {
          brand: string | null
          collateral_details: Json | null
          created_at: string | null
          fipe_code: string | null
          fipe_value: number | null
          id: string
          is_debt_free: boolean | null
          kinship_degree: string | null
          license_plate: string | null
          manufacture_year: number | null
          model: string | null
          model_year: number | null
          simulation_id: string
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          collateral_details?: Json | null
          created_at?: string | null
          fipe_code?: string | null
          fipe_value?: number | null
          id?: string
          is_debt_free?: boolean | null
          kinship_degree?: string | null
          license_plate?: string | null
          manufacture_year?: number | null
          model?: string | null
          model_year?: number | null
          simulation_id: string
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          collateral_details?: Json | null
          created_at?: string | null
          fipe_code?: string | null
          fipe_value?: number | null
          id?: string
          is_debt_free?: boolean | null
          kinship_degree?: string | null
          license_plate?: string | null
          manufacture_year?: number | null
          model?: string | null
          model_year?: number | null
          simulation_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_collateral_vehicle_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_consents: {
        Row: {
          accepted: boolean | null
          accepted_at: string | null
          birth_date: string | null
          city: string | null
          consent_id: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          document: string | null
          email: string | null
          entity_details: Json | null
          entity_id: string | null
          event_details: Json | null
          gender: string | null
          id: string
          ip_address: string | null
          manager_details: Json | null
          name: string | null
          offer_details: Json | null
          operating_system: string | null
          origin_details: Json | null
          page_snapshot: Json | null
          partner_id: number | null
          phone: string | null
          product_id: number | null
          raw_payload: Json | null
          seller_details: Json | null
          simulation_id: string
          state: string | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          accepted?: boolean | null
          accepted_at?: string | null
          birth_date?: string | null
          city?: string | null
          consent_id?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          document?: string | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          event_details?: Json | null
          gender?: string | null
          id?: string
          ip_address?: string | null
          manager_details?: Json | null
          name?: string | null
          offer_details?: Json | null
          operating_system?: string | null
          origin_details?: Json | null
          page_snapshot?: Json | null
          partner_id?: number | null
          phone?: string | null
          product_id?: number | null
          raw_payload?: Json | null
          seller_details?: Json | null
          simulation_id: string
          state?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted?: boolean | null
          accepted_at?: string | null
          birth_date?: string | null
          city?: string | null
          consent_id?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          document?: string | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          event_details?: Json | null
          gender?: string | null
          id?: string
          ip_address?: string | null
          manager_details?: Json | null
          name?: string | null
          offer_details?: Json | null
          operating_system?: string | null
          origin_details?: Json | null
          page_snapshot?: Json | null
          partner_id?: number | null
          phone?: string | null
          product_id?: number | null
          raw_payload?: Json | null
          seller_details?: Json | null
          simulation_id?: string
          state?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_consents_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_consults: {
        Row: {
          cet_rate: number | null
          created_at: string | null
          down_payment_amount: number | null
          down_payment_percentage: number | null
          external_operation_id: string | null
          financed_amount: number | null
          financial_institution_id: number | null
          id: string
          installment_value: number | null
          installments: number | null
          raw_payload: Json | null
          requested_value: number | null
          simulation_details: Json | null
          simulation_id: string
          status_id: number | null
          updated_at: string | null
        }
        Insert: {
          cet_rate?: number | null
          created_at?: string | null
          down_payment_amount?: number | null
          down_payment_percentage?: number | null
          external_operation_id?: string | null
          financed_amount?: number | null
          financial_institution_id?: number | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          raw_payload?: Json | null
          requested_value?: number | null
          simulation_details?: Json | null
          simulation_id: string
          status_id?: number | null
          updated_at?: string | null
        }
        Update: {
          cet_rate?: number | null
          created_at?: string | null
          down_payment_amount?: number | null
          down_payment_percentage?: number | null
          external_operation_id?: string | null
          financed_amount?: number | null
          financial_institution_id?: number | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          raw_payload?: Json | null
          requested_value?: number | null
          simulation_details?: Json | null
          simulation_id?: string
          status_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_consults_financial_institution_id_fkey"
            columns: ["financial_institution_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_consults_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_consults_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_types"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_offers: {
        Row: {
          category_id: number | null
          created_at: string | null
          economic_group: string | null
          event_description: string | null
          event_details: Json | null
          event_end_date: string | null
          event_id: string | null
          event_start_date: string | null
          id: string
          legal_name: string | null
          manager_details: Json | null
          manager_name: string | null
          offer_description: string | null
          offer_details: Json | null
          offer_id: string | null
          offer_value: number | null
          raw_payload: Json | null
          seller_details: Json | null
          seller_id: string | null
          simulation_id: string
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          category_id?: number | null
          created_at?: string | null
          economic_group?: string | null
          event_description?: string | null
          event_details?: Json | null
          event_end_date?: string | null
          event_id?: string | null
          event_start_date?: string | null
          id?: string
          legal_name?: string | null
          manager_details?: Json | null
          manager_name?: string | null
          offer_description?: string | null
          offer_details?: Json | null
          offer_id?: string | null
          offer_value?: number | null
          raw_payload?: Json | null
          seller_details?: Json | null
          seller_id?: string | null
          simulation_id: string
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: number | null
          created_at?: string | null
          economic_group?: string | null
          event_description?: string | null
          event_details?: Json | null
          event_end_date?: string | null
          event_id?: string | null
          event_start_date?: string | null
          id?: string
          legal_name?: string | null
          manager_details?: Json | null
          manager_name?: string | null
          offer_description?: string | null
          offer_details?: Json | null
          offer_id?: string | null
          offer_value?: number | null
          raw_payload?: Json | null
          seller_details?: Json | null
          seller_id?: string | null
          simulation_id?: string
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_offers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_offers_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_updates: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          operating_system: string | null
          operation: string
          origin_details: Json | null
          raw_payload: Json | null
          result_partner_id: string | null
          simulation_details: Json | null
          simulation_id: string
          stage_id: number | null
          state: string | null
          status_id: number | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          operating_system?: string | null
          operation: string
          origin_details?: Json | null
          raw_payload?: Json | null
          result_partner_id?: string | null
          simulation_details?: Json | null
          simulation_id: string
          stage_id?: number | null
          state?: string | null
          status_id?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          operating_system?: string | null
          operation?: string
          origin_details?: Json | null
          raw_payload?: Json | null
          result_partner_id?: string | null
          simulation_details?: Json | null
          simulation_id?: string
          stage_id?: number | null
          state?: string | null
          status_id?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_updates_result_partner_id_fkey"
            columns: ["result_partner_id"]
            isOneToOne: false
            referencedRelation: "result_partner_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_updates_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_updates_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stage_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_updates_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_types"
            referencedColumns: ["id"]
          },
        ]
      }
      simulations: {
        Row: {
          birth_date: string | null
          cet_rate: number | null
          created_at: string | null
          document: string | null
          down_payment_amount: number | null
          down_payment_percentage: number | null
          email: string | null
          entity_details: Json | null
          entity_id: string | null
          entity_type: string | null
          external_operation_id: string | null
          financed_amount: number | null
          financial_institution_id: number | null
          gender: string | null
          id: string
          installment_value: number | null
          installments: number | null
          integration_method: string | null
          is_integrated: boolean | null
          name: string | null
          partner_id: number | null
          phone: string | null
          product_id: number | null
          raw_payload: Json | null
          requested_value: number | null
          result_partner_id: string | null
          simulation_details: Json | null
          stage_id: number | null
          status_id: number | null
          updated_at: string | null
          visit_id: string
        }
        Insert: {
          birth_date?: string | null
          cet_rate?: number | null
          created_at?: string | null
          document?: string | null
          down_payment_amount?: number | null
          down_payment_percentage?: number | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          external_operation_id?: string | null
          financed_amount?: number | null
          financial_institution_id?: number | null
          gender?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          integration_method?: string | null
          is_integrated?: boolean | null
          name?: string | null
          partner_id?: number | null
          phone?: string | null
          product_id?: number | null
          raw_payload?: Json | null
          requested_value?: number | null
          result_partner_id?: string | null
          simulation_details?: Json | null
          stage_id?: number | null
          status_id?: number | null
          updated_at?: string | null
          visit_id: string
        }
        Update: {
          birth_date?: string | null
          cet_rate?: number | null
          created_at?: string | null
          document?: string | null
          down_payment_amount?: number | null
          down_payment_percentage?: number | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          external_operation_id?: string | null
          financed_amount?: number | null
          financial_institution_id?: number | null
          gender?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          integration_method?: string | null
          is_integrated?: boolean | null
          name?: string | null
          partner_id?: number | null
          phone?: string | null
          product_id?: number | null
          raw_payload?: Json | null
          requested_value?: number | null
          result_partner_id?: string | null
          simulation_details?: Json | null
          stage_id?: number | null
          status_id?: number | null
          updated_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulations_financial_institution_id_fkey"
            columns: ["financial_institution_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_result_partner_id_fkey"
            columns: ["result_partner_id"]
            isOneToOne: false
            referencedRelation: "result_partner_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stage_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulations_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_types"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_types: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      status_types: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      visit_consents: {
        Row: {
          accepted: boolean | null
          accepted_at: string | null
          birth_date: string | null
          city: string | null
          consent_id: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          document: string | null
          email: string | null
          entity_details: Json | null
          entity_id: string | null
          gender: string | null
          id: string
          ip_address: string | null
          name: string | null
          operating_system: string | null
          origin_details: Json | null
          page_snapshot: Json | null
          phone: string | null
          raw_payload: Json | null
          state: string | null
          target_url: string | null
          updated_at: string | null
          user_agent: string | null
          visit_id: string
        }
        Insert: {
          accepted?: boolean | null
          accepted_at?: string | null
          birth_date?: string | null
          city?: string | null
          consent_id?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          document?: string | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          gender?: string | null
          id?: string
          ip_address?: string | null
          name?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          page_snapshot?: Json | null
          phone?: string | null
          raw_payload?: Json | null
          state?: string | null
          target_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          visit_id: string
        }
        Update: {
          accepted?: boolean | null
          accepted_at?: string | null
          birth_date?: string | null
          city?: string | null
          consent_id?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          document?: string | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          gender?: string | null
          id?: string
          ip_address?: string | null
          name?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          page_snapshot?: Json | null
          phone?: string | null
          raw_payload?: Json | null
          state?: string | null
          target_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_consents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_entities: {
        Row: {
          birth_date: string | null
          created_at: string | null
          document: string | null
          email: string | null
          entity_details: Json | null
          entity_id: string | null
          entity_type: string | null
          gender: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string | null
          visit_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          gender?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string | null
          visit_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          document?: string | null
          email?: string | null
          entity_details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          gender?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_entities_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_offers: {
        Row: {
          category_id: number | null
          created_at: string | null
          economic_group: string | null
          event_description: string | null
          event_details: Json | null
          event_end_date: string | null
          event_id: string | null
          event_start_date: string | null
          id: string
          legal_name: string | null
          manager_details: Json | null
          manager_name: string | null
          offer_description: string | null
          offer_details: Json | null
          offer_id: string | null
          offer_value: number | null
          seller_details: Json | null
          seller_id: string | null
          trade_name: string | null
          updated_at: string | null
          visit_id: string
        }
        Insert: {
          category_id?: number | null
          created_at?: string | null
          economic_group?: string | null
          event_description?: string | null
          event_details?: Json | null
          event_end_date?: string | null
          event_id?: string | null
          event_start_date?: string | null
          id?: string
          legal_name?: string | null
          manager_details?: Json | null
          manager_name?: string | null
          offer_description?: string | null
          offer_details?: Json | null
          offer_id?: string | null
          offer_value?: number | null
          seller_details?: Json | null
          seller_id?: string | null
          trade_name?: string | null
          updated_at?: string | null
          visit_id: string
        }
        Update: {
          category_id?: number | null
          created_at?: string | null
          economic_group?: string | null
          event_description?: string | null
          event_details?: Json | null
          event_end_date?: string | null
          event_id?: string | null
          event_start_date?: string | null
          id?: string
          legal_name?: string | null
          manager_details?: Json | null
          manager_name?: string | null
          offer_description?: string | null
          offer_details?: Json | null
          offer_id?: string | null
          offer_value?: number | null
          seller_details?: Json | null
          seller_id?: string | null
          trade_name?: string | null
          updated_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_offers_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_orchestrator_configs: {
        Row: {
          created_at: string
          orchestrator_config_id: number
          updated_at: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          orchestrator_config_id: number
          updated_at?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          orchestrator_config_id?: number
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_orchestrator_configs_orchestrator_config_id_fkey"
            columns: ["orchestrator_config_id"]
            isOneToOne: false
            referencedRelation: "orchestrator_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_orchestrator_configs_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_updates: {
        Row: {
          action: string
          action_description: string | null
          created_at: string | null
          id: string
          origin_url: string | null
          raw_payload: Json | null
          target_url: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visit_id: string
        }
        Insert: {
          action: string
          action_description?: string | null
          created_at?: string | null
          id?: string
          origin_url?: string | null
          raw_payload?: Json | null
          target_url?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visit_id: string
        }
        Update: {
          action?: string
          action_description?: string | null
          created_at?: string | null
          id?: string
          origin_url?: string | null
          raw_payload?: Json | null
          target_url?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_updates_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          action: string
          action_description: string | null
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          operating_system: string | null
          origin_details: Json | null
          origin_url: string | null
          partner_id: number | null
          product_id: number | null
          raw_payload: Json | null
          state: string | null
          target_url: string | null
          updated_at: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          action: string
          action_description?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          origin_url?: string | null
          partner_id?: number | null
          product_id?: number | null
          raw_payload?: Json | null
          state?: string | null
          target_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          action?: string
          action_description?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          operating_system?: string | null
          origin_details?: Json | null
          origin_url?: string | null
          partner_id?: number | null
          product_id?: number | null
          raw_payload?: Json | null
          state?: string | null
          target_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_user_role: { Args: { required_roles: string[] }; Returns: boolean }
      is_current_user_backoffice: { Args: never; Returns: boolean }
      is_current_user_backoffice_admin: { Args: never; Returns: boolean }
      is_domain_allowed: { Args: { _email: string }; Returns: boolean }
      is_email_authorized: { Args: { _email: string }; Returns: boolean }
      is_email_locked: { Args: { _email: string }; Returns: boolean }
      register_access_log: {
        Args: {
          email_input: string
          event_input: string
          metadata_input: Json
          reason_input: string
          success_input: boolean
        }
        Returns: undefined
      }
    }
    Enums: {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      backofficerole: ["admin", "manager", "viewer"],
    },
  },
} as const
