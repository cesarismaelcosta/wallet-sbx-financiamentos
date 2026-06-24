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
      allowedemaildomains: {
        Row: {
          createdat: string
          domain: string
          id: string
          isactive: boolean
          updatedat: string
        }
        Insert: {
          createdat?: string
          domain: string
          id?: string
          isactive?: boolean
          updatedat?: string
        }
        Update: {
          createdat?: string
          domain?: string
          id?: string
          isactive?: boolean
          updatedat?: string
        }
        Relationships: []
      }
      backofficeusers: {
        Row: {
          createdat: string
          email: string
          id: string
          isactive: boolean
          name: string
          role: Database["public"]["Enums"]["backofficerole"]
          updatedat: string
        }
        Insert: {
          createdat?: string
          email: string
          id?: string
          isactive?: boolean
          name: string
          role?: Database["public"]["Enums"]["backofficerole"]
          updatedat?: string
        }
        Update: {
          createdat?: string
          email?: string
          id?: string
          isactive?: boolean
          name?: string
          role?: Database["public"]["Enums"]["backofficerole"]
          updatedat?: string
        }
        Relationships: []
      }
      entity: {
        Row: {
          createdat: string
          email: string | null
          entitydocument: string
          entitytype: string | null
          fullname: string
          identity: string
          phonenumber: string | null
          updatedat: string
        }
        Insert: {
          createdat?: string
          email?: string | null
          entitydocument: string
          entitytype?: string | null
          fullname: string
          identity?: string
          phonenumber?: string | null
          updatedat?: string
        }
        Update: {
          createdat?: string
          email?: string | null
          entitydocument?: string
          entitytype?: string | null
          fullname?: string
          identity?: string
          phonenumber?: string | null
          updatedat?: string
        }
        Relationships: []
      }
      loginhistory: {
        Row: {
          city: string | null
          country: string | null
          createdat: string
          devicetype: string | null
          email: string
          event: string
          failure_reason: string | null
          id: string
          ipaddress: string | null
          metadata: Json | null
          operatingsystem: string | null
          state: string | null
          success: boolean
          useragent: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          createdat?: string
          devicetype?: string | null
          email: string
          event: string
          failure_reason?: string | null
          id?: string
          ipaddress?: string | null
          metadata?: Json | null
          operatingsystem?: string | null
          state?: string | null
          success: boolean
          useragent?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          createdat?: string
          devicetype?: string | null
          email?: string
          event?: string
          failure_reason?: string | null
          id?: string
          ipaddress?: string | null
          metadata?: Json | null
          operatingsystem?: string | null
          state?: string | null
          success?: boolean
          useragent?: string | null
        }
        Relationships: []
      }
      otpconfig: {
        Row: {
          createdat: string
          emailsubject: string
          id: string
          isactive: boolean
          senderemail: string
          sendername: string
          updatedat: string
        }
        Insert: {
          createdat?: string
          emailsubject?: string
          id?: string
          isactive?: boolean
          senderemail: string
          sendername?: string
          updatedat?: string
        }
        Update: {
          createdat?: string
          emailsubject?: string
          id?: string
          isactive?: boolean
          senderemail?: string
          sendername?: string
          updatedat?: string
        }
        Relationships: []
      }
      simulation: {
        Row: {
          cetrate: number | null
          createdat: string
          downpaymentamount: number | null
          downpaymentpercentage: number | null
          eventdescription: string | null
          financedamount: number | null
          identity: string | null
          idevent: string | null
          idoffer: string | null
          idroute: number | null
          idsimulation: string
          installmentscount: number | null
          installmentvalue: number | null
          offerdescription: string | null
          stage: string | null
          status: string | null
          updatedat: string
        }
        Insert: {
          cetrate?: number | null
          createdat?: string
          downpaymentamount?: number | null
          downpaymentpercentage?: number | null
          eventdescription?: string | null
          financedamount?: number | null
          identity?: string | null
          idevent?: string | null
          idoffer?: string | null
          idroute?: number | null
          idsimulation: string
          installmentscount?: number | null
          installmentvalue?: number | null
          offerdescription?: string | null
          stage?: string | null
          status?: string | null
          updatedat?: string
        }
        Update: {
          cetrate?: number | null
          createdat?: string
          downpaymentamount?: number | null
          downpaymentpercentage?: number | null
          eventdescription?: string | null
          financedamount?: number | null
          identity?: string | null
          idevent?: string | null
          idoffer?: string | null
          idroute?: number | null
          idsimulation?: string
          installmentscount?: number | null
          installmentvalue?: number | null
          offerdescription?: string | null
          stage?: string | null
          status?: string | null
          updatedat?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_identity_fkey"
            columns: ["identity"]
            isOneToOne: false
            referencedRelation: "entity"
            referencedColumns: ["identity"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_current_user_backoffice: { Args: never; Returns: boolean }
      is_current_user_backoffice_admin: { Args: never; Returns: boolean }
      is_domain_allowed: { Args: { _email: string }; Returns: boolean }
      is_email_authorized: { Args: { _email: string }; Returns: boolean }
      is_email_locked: { Args: { _email: string }; Returns: boolean }
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
  public: {
    Enums: {
      backofficerole: ["admin", "manager", "viewer"],
    },
  },
} as const
