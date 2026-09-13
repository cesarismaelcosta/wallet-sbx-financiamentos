-- ============================================================
-- BASELINE SCHEMA MIGRATION
-- Gerada por introspeccao do banco de dev (ldzutiojmcawhwdhojlo)
-- em 2026-09-13, apos limpeza de schema drift (11 migrations
-- antigas removidas, otp_config e funcoes orfas apagadas).
-- Reflete o estado real do banco no momento da geracao.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TYPE public.backofficerole AS ENUM ('admin', 'manager', 'viewer');

-- Table: public.stage_types
CREATE TABLE public.stage_types (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.status_types
CREATE TABLE public.status_types (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.product_types
CREATE TABLE public.product_types (
    "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.allowed_email_domains
CREATE TABLE public.allowed_email_domains (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "domain" text NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("id")
);

-- Table: public.category_types
CREATE TABLE public.category_types (
    "id" integer NOT NULL,
    "name" text NOT NULL,
    "product_id" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.financial_institutions
CREATE TABLE public.financial_institutions (
    "id" integer NOT NULL,
    "name" text NOT NULL,
    "logo_url" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.login_history
CREATE TABLE public.login_history (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    "email" text,
    "origin_page" text,
    "origin_function" text,
    "event" text,
    "success" boolean,
    "failure_reason" text,
    "ip_address" text,
    "country" text,
    "state" text,
    "city" text,
    "user_agent" text,
    "device_type" text,
    "operating_system" text,
    "origin_details" jsonb,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("id")
);

-- Table: public.result_types
CREATE TABLE public.result_types (
    "id" character varying NOT NULL,
    "description" text NOT NULL,
    "status_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.result_partner_types
CREATE TABLE public.result_partner_types (
    "id" character varying NOT NULL,
    "partner_id" integer NOT NULL,
    "status_id" integer NOT NULL,
    "description" text NOT NULL,
    "result_id" character varying,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.partners
CREATE TABLE public.partners (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "document" text,
    "business_model" text,
    "phone" text,
    "email" text,
    "contact_type" text,
    "logo_url" text,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("id")
);

-- Table: public.orchestrator_configs
CREATE TABLE public.orchestrator_configs (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "partner_id" bigint,
    "config_type" text NOT NULL,
    "lookup_id" bigint NOT NULL,
    "page_url" text,
    "is_active" boolean DEFAULT true,
    "is_integrated" boolean DEFAULT false,
    "integration_method" text,
    "entity_type" text DEFAULT 'PF+PJ'::text,
    "integration_details" jsonb DEFAULT '{}'::jsonb,
    "rules" jsonb DEFAULT '{"allow_custom_value": true, "installment_options": [12, 24, 36, 48, 60], "default_installments": 48, "max_down_payment_percentage": 80, "min_down_payment_percentage": 20}'::jsonb,
    "consent_configs" jsonb DEFAULT '[]'::jsonb,
    "page_configs" jsonb DEFAULT '{"box_bg": "bg-white/80", "box_radius": "rounded-3xl", "primary_color": "#8B5CF6"}'::jsonb,
    "page_faqs" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.notification_outbox
CREATE TABLE public.notification_outbox (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "context_type" text NOT NULL,
    "visit_id" uuid,
    "visit_update_id" uuid,
    "simulation_id" uuid,
    "simulation_update_id" uuid,
    "channel" text NOT NULL,
    "template_slug" text NOT NULL,
    "recipient_type" text NOT NULL,
    "recipient" text NOT NULL,
    "subject" text,
    "rendered_content" text,
    "attachments" jsonb,
    "raw_payload" jsonb,
    "status" text NOT NULL DEFAULT 'pending'::text,
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "error_message" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("id")
);

-- Table: public.notifications
CREATE TABLE public.notifications (
    "id" uuid NOT NULL,
    "context_type" text NOT NULL,
    "visit_id" uuid,
    "visit_update_id" uuid,
    "simulation_id" uuid,
    "simulation_update_id" uuid,
    "channel" text NOT NULL,
    "template_slug" text NOT NULL,
    "recipient_type" text NOT NULL,
    "recipient" text NOT NULL,
    "subject" text,
    "rendered_content" text,
    "attachments" jsonb,
    "raw_payload" jsonb,
    "status" text NOT NULL DEFAULT 'sent'::text,
    "created_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("id")
);

-- Table: public.simulations
CREATE TABLE public.simulations (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL,
    "is_integrated" boolean DEFAULT false,
    "integration_method" text,
    "partner_id" bigint,
    "product_id" integer,
    "entity_id" text,
    "entity_type" text,
    "document" text,
    "name" text,
    "phone" text,
    "email" text,
    "birth_date" date,
    "gender" text,
    "entity_details" jsonb,
    "financial_institution_id" integer,
    "requested_value" numeric,
    "down_payment_amount" numeric,
    "down_payment_percentage" numeric,
    "financed_amount" numeric,
    "installments" integer,
    "cet_rate" numeric,
    "installment_value" numeric,
    "simulation_details" jsonb,
    "stage_id" integer,
    "status_id" integer,
    "result_partner_id" character varying,
    "external_operation_id" text,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.simulation_updates
CREATE TABLE public.simulation_updates (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" uuid NOT NULL,
    "operation" text NOT NULL,
    "stage_id" integer,
    "status_id" integer,
    "result_partner_id" character varying,
    "simulation_details" jsonb,
    "ip_address" text,
    "country" text,
    "state" text,
    "city" text,
    "user_agent" text,
    "device_type" text,
    "operating_system" text,
    "origin_details" jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.simulation_consults
CREATE TABLE public.simulation_consults (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" uuid NOT NULL,
    "financial_institution_id" integer,
    "requested_value" numeric,
    "down_payment_amount" numeric,
    "down_payment_percentage" numeric,
    "financed_amount" numeric,
    "installments" integer,
    "cet_rate" numeric,
    "installment_value" numeric,
    "external_operation_id" text,
    "status_id" integer,
    "simulation_details" jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.simulation_consents
CREATE TABLE public.simulation_consents (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" uuid NOT NULL,
    "consent_id" text,
    "accepted" boolean DEFAULT true,
    "accepted_at" timestamp with time zone DEFAULT now(),
    "partner_id" bigint,
    "product_id" integer,
    "entity_id" text,
    "document" text,
    "name" text,
    "phone" text,
    "email" text,
    "birth_date" date,
    "gender" text,
    "entity_details" jsonb,
    "ip_address" text,
    "country" text,
    "state" text,
    "city" text,
    "user_agent" text,
    "device_type" text,
    "operating_system" text,
    "origin_details" jsonb,
    "manager_details" jsonb,
    "seller_details" jsonb,
    "event_details" jsonb,
    "offer_details" jsonb,
    "page_snapshot" jsonb DEFAULT '{}'::jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.simulation_collateral_vehicle
CREATE TABLE public.simulation_collateral_vehicle (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" uuid NOT NULL,
    "license_plate" text,
    "brand" text,
    "model" text,
    "model_year" integer,
    "manufacture_year" integer,
    "fipe_code" text,
    "fipe_value" numeric,
    "kinship_degree" text DEFAULT 'SELF'::text,
    "is_debt_free" boolean DEFAULT true,
    "collateral_details" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.simulation_collateral_home
CREATE TABLE public.simulation_collateral_home (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" uuid NOT NULL,
    "real_estate_type" text,
    "estimated_value" numeric,
    "debt_amount" numeric DEFAULT 0,
    "has_deed" text,
    "address" text,
    "number" text,
    "complement" text,
    "neighborhood" text,
    "city" text,
    "state" text,
    "postal_code" text,
    "country" text DEFAULT 'Brasil'::text,
    "owners" text[],
    "collateral_details" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.visit_entities
CREATE TABLE public.visit_entities (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL,
    "entity_id" text,
    "entity_type" text,
    "document" text,
    "name" text,
    "phone" text,
    "email" text,
    "birth_date" date,
    "gender" text,
    "entity_details" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.notification_alert_recipients
CREATE TABLE public.notification_alert_recipients (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "email" text NOT NULL,
    "alert_category" text NOT NULL DEFAULT 'ALL'::text,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("id")
);

-- Table: public.backoffice_users
CREATE TABLE public.backoffice_users (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text,
    "email" text NOT NULL,
    "role" backofficerole NOT NULL DEFAULT 'viewer'::backofficerole,
    "is_active" boolean DEFAULT true,
    "allowed_partners" jsonb DEFAULT '[]'::jsonb,
    "allowed_products" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.simulation_offers
CREATE TABLE public.simulation_offers (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" uuid NOT NULL,
    "manager_name" text,
    "manager_details" jsonb,
    "seller_id" text,
    "legal_name" text,
    "economic_group" text,
    "trade_name" text,
    "seller_details" jsonb,
    "event_id" text,
    "event_description" text,
    "event_start_date" timestamp with time zone,
    "event_end_date" timestamp with time zone,
    "event_details" jsonb,
    "offer_id" text,
    "offer_description" text,
    "offer_value" numeric,
    "category_id" integer,
    "subcategory_id" integer,
    "subcategory" text,
    "offer_details" jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.visit_offers
CREATE TABLE public.visit_offers (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL,
    "visit_update_id" uuid,
    "manager_name" text,
    "manager_details" jsonb,
    "seller_id" text,
    "legal_name" text,
    "economic_group" text,
    "trade_name" text,
    "seller_details" jsonb,
    "event_id" text,
    "event_description" text,
    "event_start_date" timestamp with time zone,
    "event_end_date" timestamp with time zone,
    "event_details" jsonb,
    "offer_id" text,
    "offer_description" text,
    "offer_value" numeric,
    "category_id" integer,
    "subcategory_id" integer,
    "subcategory" text,
    "offer_details" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.visits
CREATE TABLE public.visits (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "utm_source" text,
    "utm_medium" text,
    "utm_campaign" text,
    "origin_url" text,
    "target_url" text,
    "action" text NOT NULL,
    "action_description" text,
    "ip_address" text,
    "country" text,
    "state" text,
    "city" text,
    "user_agent" text,
    "device_type" text,
    "operating_system" text,
    "origin_details" jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.visit_updates
CREATE TABLE public.visit_updates (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL,
    "partner_id" integer,
    "product_id" integer,
    "utm_source" text,
    "utm_medium" text,
    "utm_campaign" text,
    "origin_url" text,
    "target_url" text,
    "action" text NOT NULL,
    "action_description" text,
    "ip_address" text,
    "country" text,
    "state" text,
    "city" text,
    "user_agent" text,
    "device_type" text,
    "operating_system" text,
    "origin_details" jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.visit_consents
CREATE TABLE public.visit_consents (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" uuid NOT NULL,
    "visit_update_id" uuid,
    "consent_id" text,
    "accepted" boolean DEFAULT true,
    "accepted_at" timestamp with time zone DEFAULT now(),
    "target_url" text,
    "entity_id" text,
    "document" text,
    "name" text,
    "phone" text,
    "email" text,
    "birth_date" date,
    "gender" text,
    "entity_details" jsonb,
    "ip_address" text,
    "country" text,
    "state" text,
    "city" text,
    "user_agent" text,
    "device_type" text,
    "operating_system" text,
    "origin_details" jsonb,
    "page_snapshot" jsonb,
    "raw_payload" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Table: public.visit_orchestrator_configs
CREATE TABLE public.visit_orchestrator_configs (
    "visit_id" uuid NOT NULL,
    "visit_update_id" uuid NOT NULL,
    "orchestrator_config_id" integer NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY ("visit_id", "visit_update_id", "orchestrator_config_id")
);
-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================

ALTER TABLE public.simulations ADD CONSTRAINT simulations_stage_id_fkey FOREIGN KEY ("stage_id") REFERENCES public.stage_types ("id");
ALTER TABLE public.simulation_updates ADD CONSTRAINT simulation_updates_stage_id_fkey FOREIGN KEY ("stage_id") REFERENCES public.stage_types ("id");
ALTER TABLE public.simulation_updates ADD CONSTRAINT simulation_updates_status_id_fkey FOREIGN KEY ("status_id") REFERENCES public.status_types ("id");
ALTER TABLE public.simulation_consults ADD CONSTRAINT simulation_consults_status_id_fkey FOREIGN KEY ("status_id") REFERENCES public.status_types ("id");
ALTER TABLE public.result_types ADD CONSTRAINT result_types_status_id_fkey FOREIGN KEY ("status_id") REFERENCES public.status_types ("id");
ALTER TABLE public.simulations ADD CONSTRAINT simulations_status_id_fkey FOREIGN KEY ("status_id") REFERENCES public.status_types ("id");
ALTER TABLE public.simulation_consents ADD CONSTRAINT simulation_consents_product_id_fkey FOREIGN KEY ("product_id") REFERENCES public.product_types ("id");
ALTER TABLE public.category_types ADD CONSTRAINT category_types_product_id_fkey FOREIGN KEY ("product_id") REFERENCES public.product_types ("id");
ALTER TABLE public.simulations ADD CONSTRAINT simulations_product_id_fkey FOREIGN KEY ("product_id") REFERENCES public.product_types ("id");
ALTER TABLE public.visit_updates ADD CONSTRAINT visit_updates_product_id_fkey FOREIGN KEY ("product_id") REFERENCES public.product_types ("id");
ALTER TABLE public.simulation_offers ADD CONSTRAINT simulation_offers_category_id_fkey FOREIGN KEY ("category_id") REFERENCES public.category_types ("id");
ALTER TABLE public.visit_offers ADD CONSTRAINT visit_offers_category_id_fkey FOREIGN KEY ("category_id") REFERENCES public.category_types ("id");
ALTER TABLE public.simulation_consults ADD CONSTRAINT simulation_consults_financial_institution_id_fkey FOREIGN KEY ("financial_institution_id") REFERENCES public.financial_institutions ("id");
ALTER TABLE public.simulations ADD CONSTRAINT simulations_financial_institution_id_fkey FOREIGN KEY ("financial_institution_id") REFERENCES public.financial_institutions ("id");
ALTER TABLE public.result_partner_types ADD CONSTRAINT result_partner_types_result_id_fkey FOREIGN KEY ("result_id") REFERENCES public.result_types ("id");
ALTER TABLE public.simulations ADD CONSTRAINT simulations_result_partner_id_fkey FOREIGN KEY ("result_partner_id") REFERENCES public.result_partner_types ("id");
ALTER TABLE public.simulation_updates ADD CONSTRAINT simulation_updates_result_partner_id_fkey FOREIGN KEY ("result_partner_id") REFERENCES public.result_partner_types ("id");
ALTER TABLE public.simulations ADD CONSTRAINT simulations_partner_id_fkey FOREIGN KEY ("partner_id") REFERENCES public.partners ("id");
ALTER TABLE public.simulation_consents ADD CONSTRAINT simulation_consents_partner_id_fkey FOREIGN KEY ("partner_id") REFERENCES public.partners ("id");
ALTER TABLE public.orchestrator_configs ADD CONSTRAINT orchestrator_configs_partner_id_fkey FOREIGN KEY ("partner_id") REFERENCES public.partners ("id");
ALTER TABLE public.visit_updates ADD CONSTRAINT visit_updates_partner_id_fkey FOREIGN KEY ("partner_id") REFERENCES public.partners ("id");
ALTER TABLE public.visit_orchestrator_configs ADD CONSTRAINT visit_orch_configs_config_id_fkey FOREIGN KEY ("orchestrator_config_id") REFERENCES public.orchestrator_configs ("id");
ALTER TABLE public.simulations ADD CONSTRAINT simulations_visit_id_fkey FOREIGN KEY ("visit_id") REFERENCES public.visits ("id");
ALTER TABLE public.simulation_collateral_home ADD CONSTRAINT simulation_collateral_home_simulation_id_fkey FOREIGN KEY ("simulation_id") REFERENCES public.simulations ("id");
ALTER TABLE public.simulation_offers ADD CONSTRAINT simulation_offers_simulation_id_fkey FOREIGN KEY ("simulation_id") REFERENCES public.simulations ("id");
ALTER TABLE public.simulation_updates ADD CONSTRAINT simulation_updates_simulation_id_fkey FOREIGN KEY ("simulation_id") REFERENCES public.simulations ("id");
ALTER TABLE public.simulation_consults ADD CONSTRAINT simulation_consults_simulation_id_fkey FOREIGN KEY ("simulation_id") REFERENCES public.simulations ("id");
ALTER TABLE public.simulation_consents ADD CONSTRAINT simulation_consents_simulation_id_fkey FOREIGN KEY ("simulation_id") REFERENCES public.simulations ("id");
ALTER TABLE public.simulation_collateral_vehicle ADD CONSTRAINT simulation_collateral_vehicle_simulation_id_fkey FOREIGN KEY ("simulation_id") REFERENCES public.simulations ("id");
ALTER TABLE public.visit_entities ADD CONSTRAINT visit_entities_visit_id_fkey FOREIGN KEY ("visit_id") REFERENCES public.visits ("id");
ALTER TABLE public.visit_offers ADD CONSTRAINT visit_offers_visit_id_fkey FOREIGN KEY ("visit_id") REFERENCES public.visits ("id");
ALTER TABLE public.visit_updates ADD CONSTRAINT visit_updates_visit_id_fkey FOREIGN KEY ("visit_id") REFERENCES public.visits ("id");
ALTER TABLE public.visit_consents ADD CONSTRAINT visit_consents_visit_id_fkey FOREIGN KEY ("visit_id") REFERENCES public.visits ("id");
ALTER TABLE public.visit_consents ADD CONSTRAINT visit_consents_visit_update_id_fkey FOREIGN KEY ("visit_update_id") REFERENCES public.visit_updates ("id");
ALTER TABLE public.visit_orchestrator_configs ADD CONSTRAINT visit_orch_configs_visit_update_id_fkey FOREIGN KEY ("visit_update_id") REFERENCES public.visit_updates ("id");
-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================

ALTER TABLE public.backoffice_users ADD CONSTRAINT backoffice_users_email_key UNIQUE (email);
ALTER TABLE public.notification_alert_recipients ADD CONSTRAINT notification_alert_recipients_email_key UNIQUE (email);
ALTER TABLE public.product_types ADD CONSTRAINT product_types_name_key UNIQUE (name);
ALTER TABLE public.stage_types ADD CONSTRAINT stage_types_name_key UNIQUE (name);
ALTER TABLE public.status_types ADD CONSTRAINT status_types_name_key UNIQUE (name);
ALTER TABLE public.visit_consents ADD CONSTRAINT visit_consents_update_consent_unique UNIQUE (visit_update_id, consent_id);

-- ============================================================
-- CHECK CONSTRAINTS
-- ============================================================

ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text, 'push'::text])));
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_context_type_check CHECK ((context_type = ANY (ARRAY['SIMULATION'::text, 'VISIT'::text, 'SYSTEM_ERROR'::text])));
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['ENTITY'::text, 'PARTNER'::text, 'INTERNAL'::text])));
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'dead_letter'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text, 'push'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_context_type_check CHECK ((context_type = ANY (ARRAY['SIMULATION'::text, 'VISIT'::text, 'SYSTEM_ERROR'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['ENTITY'::text, 'PARTNER'::text, 'INTERNAL'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_status_check CHECK ((status = 'sent'::text));
ALTER TABLE public.orchestrator_configs ADD CONSTRAINT orchestrator_configs_config_type_check CHECK ((config_type = ANY (ARRAY['EVENT'::text, 'SELLER'::text, 'PRODUCT'::text, 'SUBCATEGORY'::text, 'CATEGORY'::text])));
ALTER TABLE public.orchestrator_configs ADD CONSTRAINT orchestrator_configs_entity_type_check CHECK ((entity_type = ANY (ARRAY['PF'::text, 'PJ'::text, 'PF+PJ'::text])));
ALTER TABLE public.orchestrator_configs ADD CONSTRAINT orchestrator_configs_integration_method_check CHECK ((integration_method = ANY (ARRAY['API'::text, 'EMAIL'::text, 'FILE'::text, 'MANUAL'::text])));
ALTER TABLE public.partners ADD CONSTRAINT partners_business_model_check CHECK ((business_model = ANY (ARRAY['bank'::text, 'corban'::text, 'seller'::text])));
ALTER TABLE public.partners ADD CONSTRAINT partners_contact_type_check CHECK ((contact_type = ANY (ARRAY['whatsapp'::text, 'email'::text])));
ALTER TABLE public.result_partner_types ADD CONSTRAINT result_partner_types_id_check CHECK ((length((id)::text) = 8));
ALTER TABLE public.result_types ADD CONSTRAINT result_types_id_check CHECK ((char_length((id)::text) = 5));
ALTER TABLE public.simulation_updates ADD CONSTRAINT check_operation_type CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text])));
ALTER TABLE public.simulations ADD CONSTRAINT simulations_entity_type_check CHECK ((entity_type = ANY (ARRAY['F'::text, 'J'::text])));
ALTER TABLE public.simulations ADD CONSTRAINT simulations_integration_method_check CHECK ((integration_method = ANY (ARRAY['API'::text, 'EMAIL'::text, 'FILE'::text, 'MANUAL'::text])));
ALTER TABLE public.visit_entities ADD CONSTRAINT visit_entities_entity_type_check CHECK ((entity_type = ANY (ARRAY['F'::text, 'J'::text])));

-- ============================================================
-- INDEXES (excluindo os que ja vem junto de PK/UNIQUE)
-- ============================================================

CREATE INDEX idx_backoffice_users_auth_lookup ON public.backoffice_users USING btree (email, is_active);
CREATE INDEX idx_backoffice_users_created_desc ON public.backoffice_users USING btree (created_at DESC);
CREATE INDEX idx_backoffice_users_lower_email ON public.backoffice_users USING btree (lower(email));
CREATE INDEX idx_category_types_product_id ON public.category_types USING btree (product_id);
CREATE INDEX idx_login_history_city_null ON public.login_history USING btree (created_at DESC) WHERE (city IS NULL);
CREATE INDEX idx_login_history_created_at ON public.login_history USING btree (created_at DESC);
CREATE INDEX idx_login_history_email ON public.login_history USING btree (email);
CREATE INDEX idx_login_history_email_date ON public.login_history USING btree (email, created_at DESC);
CREATE INDEX idx_login_history_email_trgm ON public.login_history USING gin (email gin_trgm_ops);
CREATE INDEX idx_login_history_event_date ON public.login_history USING btree (event, created_at DESC);
CREATE INDEX idx_login_history_ip_trgm ON public.login_history USING gin (ip_address gin_trgm_ops);
CREATE INDEX idx_login_history_success_date ON public.login_history USING btree (success, created_at DESC);
CREATE INDEX idx_login_history_success_failure ON public.login_history USING btree (success, failure_reason);
CREATE INDEX idx_notification_alert_recipients_active ON public.notification_alert_recipients USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_notification_alert_recipients_category ON public.notification_alert_recipients USING btree (alert_category);
CREATE INDEX idx_notification_outbox_status ON public.notification_outbox USING btree (status);
CREATE INDEX idx_notification_outbox_status_created ON public.notification_outbox USING btree (status, created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_orchestrator_configs_lookup_composite ON public.orchestrator_configs USING btree (partner_id, config_type, lookup_id);
CREATE INDEX idx_result_partner_types_result_id ON public.result_partner_types USING btree (result_id);
CREATE INDEX idx_result_types_status_id ON public.result_types USING btree (status_id);
CREATE INDEX idx_simulation_collateral_home_sim_id ON public.simulation_collateral_home USING btree (simulation_id);
CREATE INDEX idx_simulation_collateral_vehicle_sim_id ON public.simulation_collateral_vehicle USING btree (simulation_id);
CREATE INDEX idx_simulation_consents_partner_id ON public.simulation_consents USING btree (partner_id);
CREATE INDEX idx_simulation_consents_product_id ON public.simulation_consents USING btree (product_id);
CREATE INDEX idx_simulation_consents_simulation_id ON public.simulation_consents USING btree (simulation_id);
CREATE INDEX idx_simulation_consults_fi_id ON public.simulation_consults USING btree (financial_institution_id);
CREATE INDEX idx_simulation_consults_simulation_id ON public.simulation_consults USING btree (simulation_id);
CREATE INDEX idx_simulation_consults_status_id ON public.simulation_consults USING btree (status_id);
CREATE UNIQUE INDEX idx_simulation_offers_unique_composite ON public.simulation_offers USING btree (simulation_id, offer_id);
CREATE INDEX idx_simulation_offers_category_id ON public.simulation_offers USING btree (category_id);
CREATE INDEX idx_simulation_offers_simulation_id ON public.simulation_offers USING btree (simulation_id);
CREATE INDEX idx_simulation_updates_created_at_desc ON public.simulation_updates USING btree (created_at DESC);
CREATE INDEX idx_simulation_updates_result_partner_id ON public.simulation_updates USING btree (result_partner_id);
CREATE INDEX idx_simulation_updates_simulation_id ON public.simulation_updates USING btree (simulation_id);
CREATE INDEX idx_simulation_updates_stage_id ON public.simulation_updates USING btree (stage_id);
CREATE INDEX idx_simulation_updates_status_id ON public.simulation_updates USING btree (status_id);
CREATE INDEX idx_simulations_created_at_desc ON public.simulations USING btree (created_at DESC);
CREATE INDEX idx_simulations_entity_product ON public.simulations USING btree (entity_id, product_id);
CREATE INDEX idx_simulations_feed_composite ON public.simulations USING btree (created_at DESC, partner_id, product_id);
CREATE INDEX idx_simulations_financial_institution_id ON public.simulations USING btree (financial_institution_id);
CREATE INDEX idx_simulations_partner_id ON public.simulations USING btree (partner_id);
CREATE INDEX idx_simulations_product_id ON public.simulations USING btree (product_id);
CREATE INDEX idx_simulations_result_partner_id ON public.simulations USING btree (result_partner_id);
CREATE INDEX idx_simulations_stage_id ON public.simulations USING btree (stage_id);
CREATE INDEX idx_simulations_status_id ON public.simulations USING btree (status_id);
CREATE INDEX idx_simulations_visit_id ON public.simulations USING btree (visit_id);
CREATE INDEX idx_visit_consents_visit_id ON public.visit_consents USING btree (visit_id);
CREATE INDEX idx_visit_consents_visit_update_id ON public.visit_consents USING btree (visit_update_id);
CREATE INDEX idx_visit_entities_visit_id ON public.visit_entities USING btree (visit_id);
CREATE INDEX idx_visit_offers_category_id ON public.visit_offers USING btree (category_id);
CREATE UNIQUE INDEX idx_visit_offers_unique_composite ON public.visit_offers USING btree (visit_id, visit_update_id, offer_id);
CREATE INDEX idx_visit_offers_visit_created ON public.visit_offers USING btree (visit_id, created_at DESC);
CREATE INDEX idx_visit_offers_visit_id ON public.visit_offers USING btree (visit_id);
CREATE INDEX idx_visit_offers_visit_offer ON public.visit_offers USING btree (visit_id, offer_id) WHERE (offer_id IS NOT NULL);
CREATE INDEX idx_visit_orch_configs_config_id ON public.visit_orchestrator_configs USING btree (orchestrator_config_id);
CREATE INDEX idx_visit_orch_configs_visit_id ON public.visit_orchestrator_configs USING btree (visit_id);
CREATE INDEX idx_visit_orch_configs_visit_update_id ON public.visit_orchestrator_configs USING btree (visit_update_id);
CREATE INDEX idx_visit_updates_action ON public.visit_updates USING btree (action);
CREATE INDEX idx_visit_updates_partner_id ON public.visit_updates USING btree (partner_id);
CREATE INDEX idx_visit_updates_product_id ON public.visit_updates USING btree (product_id);
CREATE INDEX idx_visit_updates_visit_id ON public.visit_updates USING btree (visit_id);
CREATE INDEX idx_visits_created_at ON public.visits USING btree (created_at DESC);
-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function: audit_login_stats
CREATE OR REPLACE FUNCTION public.audit_login_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT 'all'::text, p_event text DEFAULT 'all'::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(total bigint, sucessos bigint, falhas bigint, bloqueios bigint, emails_unicos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Validação de acesso (reaproveitando seu gate de segurança)
  if not public.is_current_user_backoffice() then
    raise exception 'not authorized';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where success = true)::bigint,
    count(*) filter (where success = false)::bigint,
    count(*) filter (where event = 'blocked' or failure_reason = 'account_locked')::bigint,
    count(distinct lower(email))::bigint
  from public.login_history
  where (p_from   is null or created_at >= p_from)
    and (p_to     is null or created_at <= p_to)
    and (p_status = 'all' or (p_status = 'success' and success = true)
                          or (p_status = 'fail' and success = false))
    and (p_event  = 'all' or event = p_event)
    and (p_search is null or email ilike '%' || p_search || '%'
                          or ip_address ilike '%' || p_search || '%');
end;
$function$;
-- Function: check_user_role
CREATE OR REPLACE FUNCTION public.check_user_role(required_roles text[])
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.backoffice_users
    WHERE lower(email) IN (
      lower(coalesce(auth.jwt() ->> 'email', '')),
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))
    )
    AND role = ANY(required_roles::backofficerole[])
    AND is_active = true
  );
$function$;
-- Function: create_backoffice_alert
CREATE OR REPLACE FUNCTION public.create_backoffice_alert(p_name text, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO notification_alert_recipients (name, email, alert_category, is_active) 
  VALUES (p_name, p_email, 'ALL', true);
END;
$function$;
-- Function: create_backoffice_domain
CREATE OR REPLACE FUNCTION public.create_backoffice_domain(p_domain text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
DECLARE
  v_actor RECORD;
BEGIN 
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO allowed_email_domains (domain, is_active) VALUES (p_domain, true); 
END; 
$function$;
-- Function: current_backoffice_actor
CREATE OR REPLACE FUNCTION public.current_backoffice_actor()
 RETURNS TABLE(role text, allowed_partners jsonb, allowed_products jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email TEXT := auth.jwt() ->> 'email';
BEGIN
    IF v_email IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT b.role::TEXT, b.allowed_partners, b.allowed_products
    FROM backoffice_users b
    WHERE LOWER(b.email) = LOWER(v_email)
      AND b.is_active = true;
END;
$function$;
-- Function: delete_backoffice_alert
CREATE OR REPLACE FUNCTION public.delete_backoffice_alert(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM notification_alert_recipients WHERE id = p_id;
END;
$function$;
-- Function: get_backoffice_alerts
CREATE OR REPLACE FUNCTION public.get_backoffice_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor RECORD;
BEGIN
    SELECT * INTO v_actor FROM public.current_backoffice_actor();
    IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
        RETURN '[]'::jsonb;
    END IF;

    RETURN COALESCE((SELECT jsonb_agg(row_to_json(a)) FROM (SELECT * FROM notification_alert_recipients ORDER BY created_at DESC) a), '[]'::jsonb);
END;
$function$;
-- Function: get_backoffice_audit
CREATE OR REPLACE FUNCTION public.get_backoffice_audit(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT 'all'::text, p_event text DEFAULT 'all'::text, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RETURN '[]'::jsonb;
  END IF;

  WITH paginated_audit AS (
    SELECT 
      lh.id, lh.email, lh.event, lh.success, lh.failure_reason, lh.ip_address, lh.country, lh.state, lh.city, 
      lh.user_agent, lh.device_type, lh.operating_system, lh.origin_details, lh.created_at, lh.origin_page, lh.origin_function
    FROM login_history lh
    WHERE 
      (p_date_from IS NULL OR lh.created_at >= p_date_from)
      AND (p_date_to IS NULL OR lh.created_at <= p_date_to)
      AND (p_status = 'all' OR (p_status = 'success' AND lh.success = true) OR (p_status = 'fail' AND lh.success = false))
      AND (p_event = 'all' OR lh.event = p_event)
      AND (p_search IS NULL OR p_search = '' OR lh.email ILIKE '%' || p_search || '%' OR lh.ip_address ILIKE '%' || p_search || '%')
    ORDER BY lh.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pa.id, 'email', pa.email, 'event', pa.event, 'success', pa.success, 'failure_reason', pa.failure_reason, 
      'ip_address', pa.ip_address, 'country', pa.country, 'state', pa.state, 'city', pa.city, 
      'user_agent', pa.user_agent, 'device_type', pa.device_type, 'operating_system', pa.operating_system, 
      'origin_details', pa.origin_details, 'created_at', pa.created_at, 'origin_page', pa.origin_page, 'origin_function', pa.origin_function
    )
  ) INTO v_result FROM paginated_audit pa;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
-- Function: get_backoffice_consult_details
CREATE OR REPLACE FUNCTION public.get_backoffice_consult_details(p_visit_update_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result JSONB;
BEGIN
   SELECT jsonb_build_object(
     -- 1. DADOS DO EVENTO (UPDATE)
     'id', vu.id, 
     'action', vu.action, 
     'created_at', vu.created_at, 
     'partner_id', vu.partner_id,
     'product_id', vu.product_id, 
     'raw_payload', vu.raw_payload, -- ESSE É O PAYLOAD MAGRO DO REDIRECIONAMENTO
     'partners', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('name', p.name, 'logo_url', p.logo_url) ELSE NULL END,
     'product_types', CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('name', pt.name) ELSE NULL END,
     
     -- 2. DADOS DA VISITA RAIZ (ARRAY COM DETALHES COMPLETOS)
     'visits', jsonb_build_array(jsonb_build_object(
         'id', v.id, 
         'utm_source', v.utm_source, 
         'utm_campaign', v.utm_campaign, 
         'country', v.country,
         'state', v.state, 
         'city', v.city, 
         'ip_address', v.ip_address, 
         'operating_system', v.operating_system,
         'device_type', v.device_type, 
         'origin_url', v.origin_url, 
         'target_url', v.target_url, 
         'raw_payload', v.raw_payload, -- ESSE É O PAYLOAD RICO DA RAIZ (COM FAQS E FOOTER)
         
         -- 3. DADOS PESSOAIS DO LEAD
         'visit_entities', (
            SELECT jsonb_agg(jsonb_build_object('id', ve.id, 'name', ve.name, 'document', ve.document, 'phone', ve.phone, 'email', ve.email, 'birth_date', ve.birth_date, 'gender', ve.gender, 'entity_type', ve.entity_type, 'entity_details', ve.entity_details)) 
            FROM visit_entities ve WHERE ve.visit_id = v.id
         ),
         
         -- 4. OFERTAS
         'visit_offers', (
            SELECT jsonb_agg(jsonb_build_object('id', vo.id, 'visit_id', vo.visit_id, 'visit_update_id', vo.visit_update_id, 'manager_name', vo.manager_name, 'seller_id', vo.seller_id, 'legal_name', vo.legal_name, 'trade_name', vo.trade_name, 'event_id', vo.event_id, 'event_description', vo.event_description, 'event_start_date', vo.event_start_date, 'event_end_date', vo.event_end_date, 'offer_id', vo.offer_id, 'offer_description', vo.offer_description, 'offer_value', vo.offer_value, 'category_id', vo.category_id, 'created_at', vo.created_at, 'subcategory', vo.subcategory, 'category_types', CASE WHEN ct.id IS NOT NULL THEN jsonb_build_object('name', ct.name) ELSE NULL END)) 
            FROM visit_offers vo LEFT JOIN category_types ct ON vo.category_id = ct.id WHERE vo.visit_id = v.id
         ),
         
         -- 5. CONSENTIMENTOS E TERMOS ACEITOS
         'visit_consents', (
            SELECT jsonb_agg(jsonb_build_object('id', vc.id, 'consent_id', vc.consent_id, 'accepted', vc.accepted, 'accepted_at', vc.accepted_at, 'created_at', vc.created_at, 'ip_address', vc.ip_address, 'country', vc.country, 'state', vc.state, 'city', vc.city, 'operating_system', vc.operating_system, 'device_type', vc.device_type, 'origin_details', vc.origin_details, 'page_snapshot', vc.page_snapshot, 'visit_update_id', vc.visit_update_id)) 
            FROM visit_consents vc WHERE vc.visit_id = v.id
         )
     ))
   ) INTO v_result 
   FROM visit_updates vu 
   JOIN visits v ON vu.visit_id = v.id 
   LEFT JOIN partners p ON vu.partner_id = p.id 
   LEFT JOIN product_types pt ON vu.product_id = pt.id 
   WHERE vu.id = p_visit_update_id;
   
   RETURN v_result;
END;
$function$;
-- Function: get_backoffice_consults
CREATE OR REPLACE FUNCTION public.get_backoffice_consults(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_partner_ids integer[] DEFAULT NULL::integer[], p_product_ids integer[] DEFAULT NULL::integer[], p_allowed_partners text[] DEFAULT NULL::text[], p_allowed_products text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
  v_actor RECORD;
  v_effective_partners TEXT[];
  v_effective_products TEXT[];
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL THEN
      RETURN '[]'::jsonb;
  END IF;

  IF v_actor.role IN ('admin', 'manager') THEN
      v_effective_partners := ARRAY['*'];
      v_effective_products := ARRAY['*'];
  ELSE
      SELECT ARRAY_AGG(value::TEXT) INTO v_effective_partners
      FROM jsonb_array_elements_text(v_actor.allowed_partners);
      
      SELECT ARRAY_AGG(value::TEXT) INTO v_effective_products
      FROM jsonb_array_elements_text(v_actor.allowed_products);
  END IF;

  WITH paginated_results AS (
    SELECT 
      v.id AS v_id,
      vu.id AS vu_id,
      vu.action,
      vu.created_at,
      vu.partner_id,
      vu.product_id,
      vu.raw_payload,
      v.utm_source,
      v.state,
      p.id AS p_id,
      p.name AS p_name,
      p.logo_url AS p_logo_url,
      pt.id AS pt_id,
      pt.name AS pt_name
    FROM visit_updates vu
    JOIN visits v ON vu.visit_id = v.id
    LEFT JOIN partners p ON vu.partner_id = p.id
    LEFT JOIN product_types pt ON vu.product_id = pt.id
    WHERE vu.action IN ('SIMULATE', 'CONSULT', 'REDIRECT')
      AND (p_date_from IS NULL OR vu.created_at >= p_date_from)
      AND (p_date_to IS NULL OR vu.created_at <= p_date_to)
      AND (p_partner_ids IS NULL OR vu.partner_id = ANY(p_partner_ids))
      AND (p_product_ids IS NULL OR vu.product_id = ANY(p_product_ids))
      AND (
        v_effective_partners IS NULL 
        OR '{"*"}'::TEXT[] <@ v_effective_partners 
        OR vu.partner_id::TEXT = ANY(v_effective_partners)
      )
      AND (
        v_effective_products IS NULL 
        OR '{"*"}'::TEXT[] <@ v_effective_products 
        OR vu.product_id::TEXT = ANY(v_effective_products)
      )
    ORDER BY vu.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pr.v_id,
      'row_id', pr.vu_id,
      'action', pr.action,
      'created_at', pr.created_at,
      'partner_id', pr.partner_id,
      'product_id', pr.product_id,
      'raw_payload', pr.raw_payload,
      'utm_source', pr.utm_source,
      'state', pr.state,
      
      'partners', CASE WHEN pr.p_id IS NOT NULL THEN jsonb_build_object('name', pr.p_name, 'logo_url', pr.p_logo_url) ELSE NULL END,
      'product_types', CASE WHEN pr.pt_id IS NOT NULL THEN jsonb_build_object('name', pr.pt_name) ELSE NULL END,
      
      'visit_entities', (
         SELECT jsonb_agg(jsonb_build_object('name', ve.name, 'document', ve.document, 'phone', ve.phone, 'email', ve.email)) 
         FROM visit_entities ve WHERE ve.visit_id = pr.v_id
      ),
      'visit_offers', (
         SELECT jsonb_agg(jsonb_build_object(
          'visit_update_id', vo.visit_update_id, 
          'offer_id', vo.offer_id,
          'offer_description', vo.offer_description, 
          'offer_value', vo.offer_value, 
          'event_id', vo.event_id,
          'event_description', vo.event_description,
          'event_start_date', vo.event_start_date,
          'event_end_date', vo.event_end_date,
          'created_at', vo.created_at,
          'category_types', jsonb_build_object('name', ct.name)
         )) 
         FROM visit_offers vo 
         LEFT JOIN category_types ct ON vo.category_id = ct.id
         WHERE vo.visit_id = pr.v_id
      )
    )
  ) INTO v_result
  FROM paginated_results pr;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
-- Function: get_backoffice_domains
CREATE OR REPLACE FUNCTION public.get_backoffice_domains()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ 
DECLARE
    v_actor RECORD;
BEGIN 
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (SELECT jsonb_agg(row_to_json(d)) 
     FROM (SELECT id, domain, is_active, created_at, updated_at FROM allowed_email_domains ORDER BY created_at DESC) d), 
    '[]'::jsonb
  ); 
END; 
$function$;
-- Function: get_backoffice_orchestrator_data
CREATE OR REPLACE FUNCTION public.get_backoffice_orchestrator_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ 
DECLARE 
  v_result JSONB; 
  v_actor RECORD;
BEGIN 
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'configs', (SELECT COALESCE(jsonb_agg(row_to_json(oc)), '[]'::jsonb) FROM (SELECT * FROM orchestrator_configs ORDER BY id ASC) oc),
    'products', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pt.id, 'name', pt.name)), '[]'::jsonb) FROM product_types pt),
    'categories', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ct.id, 'name', ct.name)), '[]'::jsonb) FROM category_types ct),
    'partners', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'logo_url', p.logo_url)), '[]'::jsonb) FROM partners p)
  ) INTO v_result; 
  
  RETURN v_result; 
END; 
$function$;
-- Function: get_backoffice_session
CREATE OR REPLACE FUNCTION public.get_backoffice_session()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_email TEXT := auth.jwt() ->> 'email';
  v_user_record RECORD;
BEGIN
  IF v_caller_email IS NULL THEN 
    RETURN jsonb_build_object('error', 'token_ausente_ou_invalido'); 
  END IF;
  
  SELECT * INTO v_user_record FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email);
  
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('error', 'user_does_not_exist');
  ELSIF v_user_record.is_active = FALSE THEN 
    RETURN jsonb_build_object('error', 'user_inactive');
  END IF;
  
  RETURN jsonb_build_object(
    'email', v_user_record.email, 
    'name', v_user_record.name, 
    'role', v_user_record.role, 
    'is_active', v_user_record.is_active, 
    'allowed_partners', v_user_record.allowed_partners, 
    'allowed_products', v_user_record.allowed_products
  );
END;
$function$;
-- Function: get_backoffice_simulation_details
CREATE OR REPLACE FUNCTION public.get_backoffice_simulation_details(p_simulation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE 
  v_result JSONB;
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL THEN
      RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object('id', s.id, 'created_at', s.created_at, 'updated_at', s.updated_at, 'name', s.name, 'document', s.document, 'phone', s.phone, 'email', s.email, 'financed_amount', s.financed_amount, 'installment_value', s.installment_value, 'installments', s.installments, 'down_payment_percentage', s.down_payment_percentage, 'raw_payload', s.raw_payload, 'entity_details', s.entity_details, 'birth_date', s.birth_date, 'gender', s.gender, 'entity_type', s.entity_type, 'requested_value', s.requested_value, 'cet_rate', s.cet_rate, 'simulation_details', s.simulation_details, 'partners', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('id', p.id, 'name', p.name, 'logo_url', p.logo_url) ELSE NULL END, 'product_types', CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('id', pt.id, 'name', pt.name) ELSE NULL END, 'stage_types', CASE WHEN st.id IS NOT NULL THEN jsonb_build_object('id', st.id, 'name', st.name) ELSE NULL END, 'status_types', CASE WHEN stt.id IS NOT NULL THEN jsonb_build_object('id', stt.id, 'name', stt.name) ELSE NULL END, 'financial_institutions', CASE WHEN fi.id IS NOT NULL THEN jsonb_build_object('id', fi.id, 'name', fi.name, 'logo_url', fi.logo_url) ELSE NULL END, 'result_partner_types', CASE WHEN rpt.id IS NOT NULL THEN jsonb_build_object('id', rpt.id, 'description', rpt.description) ELSE NULL END, 'visits', CASE WHEN v.id IS NOT NULL THEN jsonb_build_object('id', v.id, 'created_at', v.created_at, 'utm_source', v.utm_source, 'utm_campaign', v.utm_campaign, 'country', v.country, 'state', v.state, 'city', v.city, 'ip_address', v.ip_address, 'operating_system', v.operating_system, 'device_type', v.device_type, 'origin_url', v.origin_url, 'target_url', v.target_url) ELSE NULL END, 'simulation_offers', (SELECT jsonb_agg(jsonb_build_object('id', so.id, 'simulation_id', so.simulation_id, 'manager_name', so.manager_name, 'seller_id', so.seller_id, 'legal_name', so.legal_name, 'trade_name', so.trade_name, 'event_id', so.event_id, 'event_description', so.event_description, 'event_end_date', so.event_end_date, 'event_start_date', so.event_start_date, 'offer_id', so.offer_id, 'offer_description', so.offer_description, 'offer_value', so.offer_value, 'category_id', so.category_id, 'subcategory_id', so.subcategory_id, 'subcategory', so.subcategory, 'offer_details', so.offer_details, 'event_details', so.event_details, 'manager_details', so.manager_details, 'category_types', CASE WHEN ct.id IS NOT NULL THEN jsonb_build_object('id', ct.id, 'name', ct.name) ELSE NULL END)) FROM simulation_offers so LEFT JOIN category_types ct ON so.category_id = ct.id WHERE so.simulation_id = s.id), 'simulation_consents', (SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'consent_id', sc.consent_id, 'accepted', sc.accepted, 'accepted_at', sc.accepted_at, 'created_at', sc.created_at, 'ip_address', sc.ip_address, 'country', sc.country, 'state', sc.state, 'city', sc.city, 'operating_system', sc.operating_system, 'device_type', sc.device_type, 'origin_details', sc.origin_details, 'page_snapshot', sc.page_snapshot)) FROM simulation_consents sc WHERE sc.simulation_id = s.id), 'simulation_updates', (SELECT jsonb_agg(jsonb_build_object('id', su.id, 'operation', su.operation, 'created_at', su.created_at, 'ip_address', su.ip_address, 'country', su.country, 'state', su.state, 'city', su.city, 'user_agent', su.user_agent, 'device_type', su.device_type, 'operating_system', su.operating_system, 'origin_details', su.origin_details)) FROM simulation_updates su WHERE su.simulation_id = s.id), 'simulation_consults', (SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'installments', sc.installments, 'installment_value', sc.installment_value, 'cet_rate', sc.cet_rate, 'created_at', sc.created_at, 'financial_institution_id', sc.financial_institution_id)) FROM simulation_consults sc WHERE sc.simulation_id = s.id)) INTO v_result FROM simulations s LEFT JOIN partners p ON s.partner_id = p.id LEFT JOIN product_types pt ON s.product_id = pt.id LEFT JOIN stage_types st ON s.stage_id = st.id LEFT JOIN status_types stt ON s.status_id = stt.id LEFT JOIN financial_institutions fi ON s.financial_institution_id = fi.id LEFT JOIN result_partner_types rpt ON s.result_partner_id = rpt.id LEFT JOIN visits v ON s.visit_id = v.id WHERE s.id = p_simulation_id;
   RETURN v_result;
END;
$function$;
-- Function: get_backoffice_simulations
CREATE OR REPLACE FUNCTION public.get_backoffice_simulations(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_partner_ids integer[] DEFAULT NULL::integer[], p_product_ids integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ 
DECLARE 
  v_result JSONB; 
  v_caller_email TEXT := auth.jwt() ->> 'email'; 
  v_role TEXT; 
  v_allowed_partners JSONB; 
  v_allowed_products JSONB; 
BEGIN 
  SELECT role, allowed_partners, allowed_products 
  INTO v_role, v_allowed_partners, v_allowed_products 
  FROM backoffice_users 
  WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true; 
  
  IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF; 
  
  IF v_role IN ('admin', 'manager') THEN 
    v_allowed_partners := '["*"]'::jsonb; 
    v_allowed_products := '["*"]'::jsonb; 
  END IF; 
  
  WITH paginated_simulations AS ( 
    SELECT s.id, s.created_at, s.updated_at, s.name, s.document, s.phone, s.email, s.financed_amount, s.installment_value, s.installments, s.down_payment_percentage, s.partner_id, s.product_id, s.status_id, s.stage_id, s.financial_institution_id, p.id AS p_id, p.name AS p_name, p.logo_url AS p_logo_url, pt.id AS pt_id, pt.name AS pt_name, st.id AS st_id, st.name AS st_name, stt.id AS stt_id, stt.name AS stt_name, fi.id AS fi_id, fi.name AS fi_name, fi.logo_url AS fi_logo_url 
    FROM simulations s 
    LEFT JOIN partners p ON s.partner_id = p.id 
    LEFT JOIN product_types pt ON s.product_id = pt.id 
    LEFT JOIN stage_types st ON s.stage_id = st.id 
    LEFT JOIN status_types stt ON s.status_id = stt.id 
    LEFT JOIN financial_institutions fi ON s.financial_institution_id = fi.id 
    WHERE (p_search IS NULL OR p_search = '' OR s.name ILIKE '%' || p_search || '%' OR regexp_replace(s.document, '\D', '', 'g') LIKE '%' || regexp_replace(p_search, '\D', '', 'g') || '%') 
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids)) 
      AND (p_product_ids IS NULL OR s.product_id = ANY(p_product_ids)) 
      AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? s.partner_id::TEXT) 
      AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? s.product_id::TEXT) 
    ORDER BY s.created_at DESC 
    LIMIT p_limit OFFSET p_offset 
  ) 
  SELECT jsonb_agg(jsonb_build_object(
    'id', ps.id, 'created_at', ps.created_at, 'updated_at', ps.updated_at, 'name', ps.name, 'document', ps.document, 'phone', ps.phone, 'email', ps.email, 'financed_amount', ps.financed_amount, 'installment_value', ps.installment_value, 'installments', ps.installments, 'down_payment_percentage', ps.down_payment_percentage, 'partner_id', ps.partner_id, 'product_id', ps.product_id, 'status_id', ps.status_id, 'stage_id', ps.stage_id, 
    'partners', CASE WHEN ps.p_id IS NOT NULL THEN jsonb_build_object('id', ps.p_id, 'name', ps.p_name, 'logo_url', ps.p_logo_url) ELSE NULL END, 
    'product_types', CASE WHEN ps.pt_id IS NOT NULL THEN jsonb_build_object('id', ps.pt_id, 'name', ps.pt_name) ELSE NULL END, 
    'stage_types', CASE WHEN ps.st_id IS NOT NULL THEN jsonb_build_object('id', ps.st_id, 'name', ps.st_name) ELSE NULL END, 
    'status_types', CASE WHEN ps.stt_id IS NOT NULL THEN jsonb_build_object('id', ps.stt_id, 'name', ps.stt_name) ELSE NULL END, 
    'financial_institutions', CASE WHEN ps.fi_id IS NOT NULL THEN jsonb_build_object('id', ps.fi_id, 'name', ps.fi_name, 'logo_url', ps.fi_logo_url) ELSE NULL END, 
    'simulation_offers', (SELECT jsonb_agg(jsonb_build_object('offer_description', so.offer_description, 'offer_value', so.offer_value, 'event_id', so.event_id, 'event_description', so.event_description, 'event_end_date', so.event_end_date)) FROM simulation_offers so WHERE so.simulation_id = ps.id)
  )) INTO v_result FROM paginated_simulations ps; 
  
  RETURN COALESCE(v_result, '[]'::jsonb); 
END; 
$function$;
-- Function: get_backoffice_users_data
CREATE OR REPLACE FUNCTION public.get_backoffice_users_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE 
  v_result JSONB;
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'users', (
      SELECT COALESCE(jsonb_agg(row_to_json(bu)), '[]'::jsonb)
      FROM (SELECT * FROM backoffice_users ORDER BY created_at DESC) bu
    ),
    'domains', (
      SELECT COALESCE(jsonb_agg(d.domain), '[]'::jsonb)
      FROM allowed_email_domains d WHERE d.is_active = true
    ),
    'partners', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
      FROM partners p
    ),
    'products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pt.id, 'name', pt.name)), '[]'::jsonb)
      FROM product_types pt
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
-- Function: get_dashboard_contact_count
CREATE OR REPLACE FUNCTION public.get_dashboard_contact_count(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_count INT;
  v_caller_email TEXT := auth.jwt() ->> 'email';
  v_role TEXT;
  v_allowed_partners JSONB;
  v_allowed_products JSONB;
BEGIN
  SELECT role, allowed_partners, allowed_products INTO v_role, v_allowed_partners, v_allowed_products FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true;
  IF v_role IS NULL THEN RETURN 0; END IF;
  IF v_role IN ('admin', 'manager') THEN v_allowed_partners := '["*"]'::jsonb; v_allowed_products := '["*"]'::jsonb; END IF;

  SELECT COUNT(DISTINCT v.id) INTO v_count FROM visits v JOIN visit_updates vu ON v.id = vu.visit_id
  WHERE vu.action = 'CONTACT' AND v.created_at >= p_start AND v.created_at <= p_end
    AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? vu.partner_id::TEXT)
    AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? vu.product_id::TEXT);
  RETURN COALESCE(v_count, 0);
END;
$function$;
-- Function: get_dashboard_simulations_raw
CREATE OR REPLACE FUNCTION public.get_dashboard_simulations_raw(p_start timestamp with time zone, p_end timestamp with time zone, p_partner_ids integer[] DEFAULT NULL::integer[], p_product_ids integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_result JSONB;
  v_caller_email TEXT := auth.jwt() ->> 'email';
  v_role TEXT;
  v_allowed_partners JSONB;
  v_allowed_products JSONB;
BEGIN
  SELECT role, allowed_partners, allowed_products INTO v_role, v_allowed_partners, v_allowed_products FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true;
  IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF v_role IN ('admin', 'manager') THEN v_allowed_partners := '["*"]'::jsonb; v_allowed_products := '["*"]'::jsonb; END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'financed_amount', s.financed_amount, 'document', s.document, 'created_at', s.created_at,
      'partner_id', s.partner_id, 'product_id', s.product_id,
      'status_types', CASE WHEN stt.id IS NOT NULL THEN jsonb_build_object('name', stt.name) ELSE NULL END,
      'partners', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('name', p.name) ELSE NULL END,
      'product_types', CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('name', pt.name) ELSE NULL END
  )) INTO v_result FROM simulations s
  LEFT JOIN status_types stt ON s.status_id = stt.id LEFT JOIN partners p ON s.partner_id = p.id LEFT JOIN product_types pt ON s.product_id = pt.id
  WHERE s.created_at >= p_start AND s.created_at <= p_end
    AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids)) AND (p_product_ids IS NULL OR s.product_id = ANY(p_product_ids))
    AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? s.partner_id::TEXT)
    AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? s.product_id::TEXT)
  LIMIT 5000;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
-- Function: get_dashboard_visits_raw
CREATE OR REPLACE FUNCTION public.get_dashboard_visits_raw(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_result JSONB;
  v_caller_email TEXT := auth.jwt() ->> 'email';
  v_role TEXT;
  v_allowed_partners JSONB;
  v_allowed_products JSONB;
BEGIN
  SELECT role, allowed_partners, allowed_products INTO v_role, v_allowed_partners, v_allowed_products FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true;
  IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF v_role IN ('admin', 'manager') THEN v_allowed_partners := '["*"]'::jsonb; v_allowed_products := '["*"]'::jsonb; END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'id', v.id, 'action', v.action, 'utm_source', v.utm_source, 'created_at', v.created_at, 'ip_address', v.ip_address,
      'visit_entities', (SELECT jsonb_agg(jsonb_build_object('document', ve.document)) FROM visit_entities ve WHERE ve.visit_id = v.id),
      'visit_updates', (SELECT jsonb_agg(jsonb_build_object('id', vu.id, 'partner_id', vu.partner_id, 'product_id', vu.product_id, 'action', vu.action)) FROM visit_updates vu WHERE vu.visit_id = v.id)
  )) INTO v_result FROM visits v 
  WHERE v.created_at >= p_start AND v.created_at <= p_end
  AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR EXISTS (SELECT 1 FROM visit_updates vu2 WHERE vu2.visit_id = v.id AND v_allowed_partners ? vu2.partner_id::TEXT))
  AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR EXISTS (SELECT 1 FROM visit_updates vu3 WHERE vu3.visit_id = v.id AND v_allowed_products ? vu3.product_id::TEXT))
  LIMIT 10000;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
-- Function: handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;
-- Function: is_current_user_backoffice
CREATE OR REPLACE FUNCTION public.is_current_user_backoffice()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.backoffice_users
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND is_active = true
  );
$function$;
-- Function: is_current_user_backoffice_admin
CREATE OR REPLACE FUNCTION public.is_current_user_backoffice_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.backoffice_users bu
    WHERE lower(bu.email) = lower((auth.jwt() ->> 'email'))
      AND bu.is_active = true
      AND bu.role = 'admin'
  );
$function$;
-- Function: log_simulation_status_change
CREATE OR REPLACE FUNCTION public.log_simulation_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF (OLD.status_id IS DISTINCT FROM NEW.status_id OR OLD.stage_id IS DISTINCT FROM NEW.stage_id OR OLD.financial_institution_id IS DISTINCT FROM NEW.financial_institution_id) THEN
        INSERT INTO public.simulation_updates (simulation_id, operation, stage_id, status_id, financial_institution_id, metadata) 
        VALUES (NEW.id, 'UPDATE', NEW.stage_id, NEW.status_id, NEW.financial_institution_id, jsonb_build_object('triggered_by', 'system_db', 'previous_status', OLD.status_id));
    END IF;
    RETURN NEW;
END;
$function$;
-- Function: register_access_log
CREATE OR REPLACE FUNCTION public.register_access_log(email_input text, event_input text, success_input boolean, reason_input text, metadata_input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.login_history (email, event, success, failure_reason, metadata, created_at) VALUES (email_input, event_input, success_input, reason_input, metadata_input, NOW());
END;
$function$;
-- Function: save_backoffice_orchestrator_config
CREATE OR REPLACE FUNCTION public.save_backoffice_orchestrator_config(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_payload ? 'id' THEN
    UPDATE orchestrator_configs SET
      lookup_id = p_payload->>'lookup_id',
      config_type = p_payload->>'config_type',
      entity_type = p_payload->>'entity_type',
      page_url = p_payload->>'page_url',
      integration_method = p_payload->>'integration_method',
      partner_id = (p_payload->>'partner_id')::INT,
      is_active = (p_payload->>'is_active')::BOOLEAN,
      is_integrated = (p_payload->>'is_integrated')::BOOLEAN,
      integration_details = p_payload->'integration_details',
      rules = p_payload->'rules',
      page_configs = p_payload->'page_configs',
      consent_configs = p_payload->'consent_configs',
      page_faqs = p_payload->'page_faqs',
      updated_at = NOW()
    WHERE id = (p_payload->>'id')::INT;
  ELSE
    INSERT INTO orchestrator_configs (
      lookup_id, config_type, entity_type, page_url, integration_method, partner_id, is_active, is_integrated, 
      integration_details, rules, page_configs, consent_configs, page_faqs
    ) VALUES (
      p_payload->>'lookup_id', p_payload->>'config_type', p_payload->>'entity_type', p_payload->>'page_url',
      p_payload->>'integration_method', (p_payload->>'partner_id')::INT, COALESCE((p_payload->>'is_active')::BOOLEAN, true),
      COALESCE((p_payload->>'is_integrated')::BOOLEAN, true), p_payload->'integration_details', p_payload->'rules',
      p_payload->'page_configs', p_payload->'consent_configs', p_payload->'page_faqs'
    );
  END IF;
END;
$function$;
-- Function: simulation_stats
CREATE OR REPLACE FUNCTION public.simulation_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_partner_ids bigint[] DEFAULT NULL::bigint[], p_product_ids integer[] DEFAULT NULL::integer[], p_search text DEFAULT NULL::text, p_status text[] DEFAULT NULL::text[])
 RETURNS TABLE(total bigint, em_simulacao bigint, em_analise bigint, aprovadas bigint, volume_aprovado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user  public.backoffice_users;
  v_parts text[];
  v_prods text[];
begin
  select * into v_user
  from public.backoffice_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
    and is_active = true;

  if v_user.id is null then
    raise exception 'not authorized';
  end if;

  if v_user.role = 'viewer' then
    v_parts := array(select jsonb_array_elements_text(coalesce(v_user.allowed_partners, '[]'::jsonb)));
    v_prods := array(select jsonb_array_elements_text(coalesce(v_user.allowed_products, '[]'::jsonb)));
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where lower(st.name) like '%simul%')::bigint,
    count(*) filter (where lower(st.name) like '%anal%')::bigint,
    count(*) filter (where lower(st.name) like '%aprov%')::bigint,
    coalesce(sum(s.financed_amount) filter (where lower(st.name) like '%aprov%'), 0)::numeric
  from public.simulations s
  left join public.status_types st on st.id = s.status_id
  left join public.partners p on p.id = s.partner_id
  left join public.product_types pt on pt.id = s.product_id
  where (p_from is null or s.created_at >= p_from)
    and (p_to   is null or s.created_at <= p_to)
    and (v_parts is null or '*' = any(v_parts) or s.partner_id::text = any(v_parts))
    and (v_prods is null or '*' = any(v_prods) or s.product_id::text = any(v_prods))
    and (p_partner_ids is null or s.partner_id = any(p_partner_ids))
    and (p_product_ids is null or s.product_id = any(p_product_ids))
    and (p_status is null or st.name = any(p_status))
    and (p_search is null
         or s.name ilike '%'||p_search||'%'
         or regexp_replace(coalesce(s.document,''), '\D', '', 'g') like '%'||regexp_replace(p_search, '\D', '', 'g')||'%');
end;
$function$;
-- Function: toggle_backoffice_alert
CREATE OR REPLACE FUNCTION public.toggle_backoffice_alert(p_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE notification_alert_recipients SET is_active = p_active WHERE id = p_id;
END;
$function$;
-- Function: toggle_backoffice_domain
CREATE OR REPLACE FUNCTION public.toggle_backoffice_domain(p_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
DECLARE
  v_actor RECORD;
BEGIN 
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE allowed_email_domains SET is_active = p_active, updated_at = NOW() WHERE id = p_id; 
END; 
$function$;
-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$function$;
-- Function: visit_stats
CREATE OR REPLACE FUNCTION public.visit_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_partner_ids bigint[] DEFAULT NULL::bigint[], p_product_ids integer[] DEFAULT NULL::integer[], p_search text DEFAULT NULL::text, p_status text[] DEFAULT NULL::text[])
 RETURNS TABLE(total bigint, consultas bigint, sites_parceiros bigint, simulacoes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user  public.backoffice_users;
  v_parts text[];
  v_prods text[];
begin
  select * into v_user
  from public.backoffice_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
    and is_active = true;

  if v_user.id is null then
    raise exception 'not authorized';
  end if;

  if v_user.role = 'viewer' then
    v_parts := array(select jsonb_array_elements_text(coalesce(v_user.allowed_partners, '[]'::jsonb)));
    v_prods := array(select jsonb_array_elements_text(coalesce(v_user.allowed_products, '[]'::jsonb)));
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where upper(v.action) like '%CONSULT%')::bigint,
    count(*) filter (where upper(v.action) like '%REDIRECT%')::bigint,
    count(*) filter (where upper(v.action) like '%SIMUL%')::bigint
  from public.visits v
  where (p_from is null or v.created_at >= p_from)
    and (p_to   is null or v.created_at <= p_to)
    and (v_parts is null or '*' = any(v_parts) or v.partner_id::text = any(v_parts))
    and (v_prods is null or '*' = any(v_prods) or v.product_id::text = any(v_prods))
    and (p_partner_ids is null or v.partner_id = any(p_partner_ids))
    and (p_product_ids is null or v.product_id = any(p_product_ids))
    and (
      p_status is null 
      or ('Qualificadas' = any(p_status) and upper(coalesce(v.action,'VISIT')) not like '%VISIT%')
      or (('SIMULAÇÃO' = any(p_status)) and upper(v.action) like '%SIMUL%')
      or (('CONSULTA'  = any(p_status)) and upper(v.action) like '%CONSULT%')
      or (('PARCEIRO'  = any(p_status)) and upper(v.action) like '%REDIRECT%')
      or (('VISITA'    = any(p_status)) and upper(coalesce(v.action,'VISIT')) like '%VISIT%')
    )
    and (
      p_search is null
      or exists (
        select 1
        from public.visit_entities e
        where e.visit_id = v.id
          and (
            e.name ilike '%'||p_search||'%'
            or regexp_replace(coalesce(e.document,''), '\D', '', 'g')
               like '%'||regexp_replace(p_search, '\D', '', 'g')||'%'
          )
      )
    );
end;
$function$;
-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.allowed_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backoffice_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_alert_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orchestrator_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_partner_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_collateral_home ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_collateral_vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_consults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_orchestrator_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- Padrao consistente em quase todas as tabelas: leitura para
-- admin/manager/viewer, escrita para admin/manager, delete so admin,
-- via o helper check_user_role(). Excecoes anotadas.
-- ============================================================

CREATE POLICY "Acesso_Admin_Total" ON public.allowed_email_domains FOR ALL TO authenticated USING (check_user_role(ARRAY['admin'::text]));

CREATE POLICY "Delete_Admin" ON public.backoffice_users FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.backoffice_users FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.backoffice_users FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.backoffice_users FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]) OR (email = (SELECT auth.email())));

CREATE POLICY "Escrita_Admin_Del" ON public.category_types FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.category_types FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.category_types FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.category_types FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.financial_institutions FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.financial_institutions FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.financial_institutions FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.financial_institutions FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Acesso_Admin_Total" ON public.login_history FOR ALL TO authenticated USING (check_user_role(ARRAY['admin'::text]));

CREATE POLICY "Delete_Admin" ON public.notification_alert_recipients FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.notification_alert_recipients FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.notification_alert_recipients FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.notification_alert_recipients FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin_Outbox" ON public.notification_outbox FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins_Outbox" ON public.notification_outbox FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd_Outbox" ON public.notification_outbox FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff_Outbox" ON public.notification_outbox FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.notifications FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.notifications FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.notifications FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.notifications FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.orchestrator_configs FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.orchestrator_configs FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.orchestrator_configs FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.orchestrator_configs FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.partners FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.partners FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.partners FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.partners FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Escrita_Admin_Del" ON public.product_types FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.product_types FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.product_types FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.product_types FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Escrita_Admin_Del" ON public.result_partner_types FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.result_partner_types FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.result_partner_types FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.result_partner_types FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Escrita_Admin_Del" ON public.result_types FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.result_types FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.result_types FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.result_types FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulation_collateral_home FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulation_collateral_home FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulation_collateral_home FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulation_collateral_home FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulation_collateral_vehicle FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulation_collateral_vehicle FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulation_collateral_vehicle FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulation_collateral_vehicle FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulation_consents FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulation_consents FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulation_consents FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulation_consents FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulation_consults FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulation_consults FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulation_consults FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulation_consults FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulation_offers FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulation_offers FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulation_offers FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulation_offers FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulation_updates FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulation_updates FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulation_updates FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulation_updates FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.simulations FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.simulations FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.simulations FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.simulations FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Escrita_Admin_Del" ON public.stage_types FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.stage_types FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.stage_types FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.stage_types FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Escrita_Admin_Del" ON public.status_types FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Ins" ON public.status_types FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Upd" ON public.status_types FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text])) WITH CHECK (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Leitura_Staff" ON public.status_types FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.visit_consents FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.visit_consents FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.visit_consents FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.visit_consents FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.visit_entities FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.visit_entities FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.visit_entities FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.visit_entities FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.visit_offers FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.visit_offers FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.visit_offers FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.visit_offers FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.visit_orchestrator_configs FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.visit_orchestrator_configs FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.visit_orchestrator_configs FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.visit_orchestrator_configs FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.visit_updates FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.visit_updates FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.visit_updates FOR UPDATE TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.visit_updates FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

CREATE POLICY "Delete_Admin" ON public.visits FOR DELETE TO authenticated USING (check_user_role(ARRAY['admin'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Ins" ON public.visits FOR INSERT TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Escrita_Admin_Mgr_Upd" ON public.visits FOR UPDATE TO authenticated WITH CHECK (check_user_role(ARRAY['admin'::text, 'manager'::text]));
CREATE POLICY "Leitura_Staff" ON public.visits FOR SELECT TO authenticated USING (check_user_role(ARRAY['admin'::text, 'manager'::text, 'viewer'::text]));

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_updated_at_allowed_email_domains BEFORE UPDATE ON public.allowed_email_domains FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_backoffice_users BEFORE UPDATE ON public.backoffice_users FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_category_types BEFORE UPDATE ON public.category_types FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_financial_institutions BEFORE UPDATE ON public.financial_institutions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_notification_alert_recipients BEFORE UPDATE ON public.notification_alert_recipients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_outbox BEFORE UPDATE ON public.notification_outbox FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_orchestrator_configs BEFORE UPDATE ON public.orchestrator_configs FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_partners BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_product_types BEFORE UPDATE ON public.product_types FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_result_partner_types BEFORE UPDATE ON public.result_partner_types FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_result_types BEFORE UPDATE ON public.result_types FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_simulation_collateral_home BEFORE UPDATE ON public.simulation_collateral_home FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_simulation_collateral_vehicle BEFORE UPDATE ON public.simulation_collateral_vehicle FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_simulation_consents BEFORE UPDATE ON public.simulation_consents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_simulation_consults BEFORE UPDATE ON public.simulation_consults FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_simulation_offers BEFORE UPDATE ON public.simulation_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_simulation_updates BEFORE UPDATE ON public.simulation_updates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_simulations BEFORE UPDATE ON public.simulations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_updated_at_stage_types BEFORE UPDATE ON public.stage_types FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_status_types BEFORE UPDATE ON public.status_types FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_visit_consents BEFORE UPDATE ON public.visit_consents FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_visit_entities BEFORE UPDATE ON public.visit_entities FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_visit_offers BEFORE UPDATE ON public.visit_offers FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_visit_orchestrator_configs BEFORE UPDATE ON public.visit_orchestrator_configs FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_updated_at_visits BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- NOTA: log_simulation_status_change() existe como funcao mas nao esta
-- anexada a nenhum trigger hoje no banco real (orfa, nao removida por
-- nao ser um risco de seguranca -- apenas nao executa nunca). Mantida
-- aqui so como definicao de funcao (ver 04_functions.sql), sem CREATE
-- TRIGGER correspondente, para refletir o estado real do banco.

-- ============================================================
-- GRANTS DE SEGURANCA (ajustes aplicados manualmente ao vivo,
-- reaplicados aqui para a baseline nao voltar ao estado aberto)
-- ============================================================

-- register_access_log continua existindo (nao foi apagada aqui no dev
-- porque, ao contrario de homologacao, nao tinha uma segunda versao
-- morta -- mas note: o corpo dela insere na coluna "metadata", que
-- NAO existe em public.login_history (a tabela real usa
-- "origin_details"). Ou seja, e uma funcao organicamente quebrada e
-- sem uso, exatamente como a que apagamos em homologacao. Mantida por
-- paridade com o que existe hoje no banco; considerar DROP FUNCTION
-- futuramente para ficar 100% igual a homologacao.
REVOKE EXECUTE ON FUNCTION public.register_access_log(text, text, boolean, text, jsonb) FROM authenticated;
