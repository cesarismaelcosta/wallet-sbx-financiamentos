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
      backoffice_user_details: {
        Row: {
          action: string
          actor_email: string
          backoffice_user_id: string | null
          created_at: string
          id: string
          new_values: Json
          old_values: Json | null
          target_email: string
        }
        Insert: {
          action: string
          actor_email: string
          backoffice_user_id?: string | null
          created_at?: string
          id?: string
          new_values: Json
          old_values?: Json | null
          target_email: string
        }
        Update: {
          action?: string
          actor_email?: string
          backoffice_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json
          old_values?: Json | null
          target_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "backoffice_user_details_backoffice_user_id_fkey"
            columns: ["backoffice_user_id"]
            isOneToOne: false
            referencedRelation: "backoffice_users"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_users: {
        Row: {
          allowed_partners: Json | null
          allowed_products: Json | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string | null
          role: Database["public"]["Enums"]["backofficerole"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allowed_partners?: Json | null
          allowed_products?: Json | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          role?: Database["public"]["Enums"]["backofficerole"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allowed_partners?: Json | null
          allowed_products?: Json | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string | null
          role?: Database["public"]["Enums"]["backofficerole"]
          updated_at?: string | null
          updated_by?: string | null
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
      edge_rate_limit_blocks: {
        Row: {
          blocked_count: number
          bucket_key: string
          last_blocked_at: string
          max_requests: number
          window_seconds: number
          window_start: string
        }
        Insert: {
          blocked_count?: number
          bucket_key: string
          last_blocked_at?: string
          max_requests: number
          window_seconds: number
          window_start: string
        }
        Update: {
          blocked_count?: number
          bucket_key?: string
          last_blocked_at?: string
          max_requests?: number
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          bucket_key: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      login_history_details: {
        Row: {
          actor_email: string
          created_at: string
          id: string
          ip_address: string | null
          login_history_id: string
          record_id: string
          record_type: string
          subject_document_hash: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email: string
          created_at?: string
          id?: string
          ip_address?: string | null
          login_history_id: string
          record_id: string
          record_type: string
          subject_document_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          login_history_id?: string
          record_id?: string
          record_type?: string
          subject_document_hash?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_history_details_login_history_id_fkey"
            columns: ["login_history_id"]
            isOneToOne: false
            referencedRelation: "login_history"
            referencedColumns: ["id"]
          },
        ]
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
          home_key: string | null
          home_order: number | null
          home_status: string
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
          home_key?: string | null
          home_order?: number | null
          home_status?: string
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
          home_key?: string | null
          home_order?: number | null
          home_status?: string
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
      simulation_collateral_home: {
        Row: {
          city: string | null
          collateral_details: Json | null
          created_at: string | null
          debt_amount: number | null
          estimated_value: number | null
          id: string
          is_debt_free: boolean | null
          real_estate_type: string | null
          simulation_id: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          collateral_details?: Json | null
          created_at?: string | null
          debt_amount?: number | null
          estimated_value?: number | null
          id?: string
          is_debt_free?: boolean | null
          real_estate_type?: string | null
          simulation_id: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          collateral_details?: Json | null
          created_at?: string | null
          debt_amount?: number | null
          estimated_value?: number | null
          id?: string
          is_debt_free?: boolean | null
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
          debt_amount: number | null
          declared_value: number | null
          doors: number | null
          fipe_code: string | null
          fipe_value: number | null
          id: string
          is_debt_free: boolean | null
          kinship_degree: string | null
          license_plate: string | null
          licensing_state: string | null
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
          debt_amount?: number | null
          declared_value?: number | null
          doors?: number | null
          fipe_code?: string | null
          fipe_value?: number | null
          id?: string
          is_debt_free?: boolean | null
          kinship_degree?: string | null
          license_plate?: string | null
          licensing_state?: string | null
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
          debt_amount?: number | null
          declared_value?: number | null
          doors?: number | null
          fipe_code?: string | null
          fipe_value?: number | null
          id?: string
          is_debt_free?: boolean | null
          kinship_degree?: string | null
          license_plate?: string | null
          licensing_state?: string | null
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
            foreignKeyName: "simulation_consents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_consents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
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
          amortization_type: string | null
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
          is_selected: boolean | null
          last_installment_value: number | null
          raw_payload: Json | null
          requested_value: number | null
          simulation_details: Json | null
          simulation_id: string
          status_id: number | null
          updated_at: string | null
        }
        Insert: {
          amortization_type?: string | null
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
          is_selected?: boolean | null
          last_installment_value?: number | null
          raw_payload?: Json | null
          requested_value?: number | null
          simulation_details?: Json | null
          simulation_id: string
          status_id?: number | null
          updated_at?: string | null
        }
        Update: {
          amortization_type?: string | null
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
          is_selected?: boolean | null
          last_installment_value?: number | null
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
          subcategory: string | null
          subcategory_id: number | null
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
          subcategory?: string | null
          subcategory_id?: number | null
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
          subcategory?: string | null
          subcategory_id?: number | null
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
          amortization_type: string | null
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
          last_installment_value: number | null
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
          amortization_type?: string | null
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
          last_installment_value?: number | null
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
          amortization_type?: string | null
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
          last_installment_value?: number | null
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
          {
            foreignKeyName: "simulations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id: number
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      status_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
          position: number | null
          stage_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id: number
          name: string
          position?: number | null
          stage_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          position?: number | null
          stage_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_types_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stage_types"
            referencedColumns: ["id"]
          },
        ]
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
          visit_update_id: string | null
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
          visit_update_id?: string | null
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
          visit_update_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_consents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_consents_visit_update_id_fkey"
            columns: ["visit_update_id"]
            isOneToOne: false
            referencedRelation: "visit_updates"
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
          subcategory: string | null
          subcategory_id: number | null
          trade_name: string | null
          updated_at: string | null
          visit_id: string
          visit_update_id: string | null
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
          subcategory?: string | null
          subcategory_id?: number | null
          trade_name?: string | null
          updated_at?: string | null
          visit_id: string
          visit_update_id?: string | null
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
          subcategory?: string | null
          subcategory_id?: number | null
          trade_name?: string | null
          updated_at?: string | null
          visit_id?: string
          visit_update_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_offers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_types"
            referencedColumns: ["id"]
          },
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
          visit_update_id: string
        }
        Insert: {
          created_at?: string
          orchestrator_config_id: number
          updated_at?: string
          visit_id: string
          visit_update_id: string
        }
        Update: {
          created_at?: string
          orchestrator_config_id?: number
          updated_at?: string
          visit_id?: string
          visit_update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_orch_configs_config_id_fkey"
            columns: ["orchestrator_config_id"]
            isOneToOne: false
            referencedRelation: "orchestrator_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_orch_configs_visit_update_id_fkey"
            columns: ["visit_update_id"]
            isOneToOne: false
            referencedRelation: "visit_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_updates: {
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
          visit_id: string
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
          visit_id: string
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
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_updates_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_updates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
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
          raw_payload?: Json | null
          state?: string | null
          target_url?: string | null
          updated_at?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_login_stats: {
        Args: {
          p_event?: string
          p_from?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          bloqueios: number
          emails_unicos: number
          falhas: number
          sucessos: number
          total: number
        }[]
      }
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      check_user_role: { Args: { required_roles: string[] }; Returns: boolean }
      create_backoffice_alert: {
        Args: { p_email: string; p_name: string }
        Returns: undefined
      }
      create_backoffice_domain: {
        Args: { p_domain: string }
        Returns: undefined
      }
      current_backoffice_actor: {
        Args: never
        Returns: {
          allowed_partners: Json
          allowed_products: Json
          role: string
        }[]
      }
      delete_backoffice_alert: { Args: { p_id: string }; Returns: undefined }
      document_fingerprint: { Args: { p: string }; Returns: string }
      document_sha256: { Args: { p: string }; Returns: string }
      get_backoffice_access_summary: {
        Args: { p_detail_id: string }
        Returns: Json
      }
      get_backoffice_alerts: { Args: never; Returns: Json }
      get_backoffice_audit: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      get_backoffice_consult_details: {
        Args: { p_visit_update_id: string }
        Returns: Json
      }
      get_backoffice_consults: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_partner_ids?: number[]
          p_product_ids?: number[]
          p_search?: string
        }
        Returns: Json
      }
      get_backoffice_domains: { Args: never; Returns: Json }
      get_backoffice_orchestrator_data: { Args: never; Returns: Json }
      get_backoffice_session: { Args: never; Returns: Json }
      get_backoffice_simulation_details: {
        Args: { p_simulation_id: string }
        Returns: Json
      }
      get_backoffice_simulations: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_partner_ids?: number[]
          p_product_ids?: number[]
          p_search?: string
        }
        Returns: Json
      }
      get_backoffice_user_history: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_backoffice_users_data: { Args: never; Returns: Json }
      get_dashboard_contact_count: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      get_dashboard_simulations_raw: {
        Args: {
          p_end: string
          p_partner_ids?: number[]
          p_product_ids?: number[]
          p_start: string
        }
        Returns: Json
      }
      get_dashboard_visits_raw: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      is_current_user_backoffice: { Args: never; Returns: boolean }
      is_current_user_backoffice_admin: { Args: never; Returns: boolean }
      log_access_event: {
        Args: {
          p_event: string
          p_failure_reason?: string
          p_origin_function?: string
          p_origin_page?: string
          p_success?: boolean
        }
        Returns: undefined
      }
      log_pii_view: {
        Args: { p_record_id: string; p_record_type: string }
        Returns: undefined
      }
      mask_document: { Args: { p: string }; Returns: string }
      mask_email: { Args: { p: string }; Returns: string }
      mask_phone: { Args: { p: string }; Returns: string }
      register_access_log: {
        Args: {
          _email: string
          _event: string
          _failure_reason: string
          _origin_details: Json
          _success: boolean
        }
        Returns: undefined
      }
      save_backoffice_orchestrator_config: {
        Args: { p_payload: Json }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulation_stats: {
        Args: {
          p_from?: string
          p_partner_ids?: number[]
          p_product_ids?: number[]
          p_search?: string
          p_status?: string[]
          p_to?: string
        }
        Returns: {
          com_condicoes: number
          leads_enviados: number
          pre_aprovadas: number
          total: number
          volume: number
        }[]
      }
      toggle_backoffice_alert: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      toggle_backoffice_domain: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      visit_stats: {
        Args: {
          p_from?: string
          p_partner_ids?: number[]
          p_product_ids?: number[]
          p_search?: string
          p_status?: string[]
          p_to?: string
        }
        Returns: {
          consultas: number
          simulacoes: number
          sites_parceiros: number
          total: number
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
