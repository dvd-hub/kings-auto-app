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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          appointment_id: string | null
          body: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          occurred_at: string
          shop_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          occurred_at?: string
          shop_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          occurred_at?: string
          shop_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_appointment_id_shop_id_fkey"
            columns: ["appointment_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "activities_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "activities_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_vehicle_id_shop_id_fkey"
            columns: ["vehicle_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          notes: string | null
          shop_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          title: string | null
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          shop_id?: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string | null
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          shop_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string | null
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "appointments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vehicle_id_shop_id_fkey"
            columns: ["vehicle_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          phone_alt: string | null
          preferred_language: string
          search_text: string | null
          shop_id: string
          source: Database["public"]["Enums"]["customer_source"]
          state: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          phone_alt?: string | null
          preferred_language?: string
          search_text?: string | null
          shop_id?: string
          source: Database["public"]["Enums"]["customer_source"]
          state?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          phone_alt?: string | null
          preferred_language?: string
          search_text?: string | null
          shop_id?: string
          source?: Database["public"]["Enums"]["customer_source"]
          state?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          locale: string
          role: Database["public"]["Enums"]["user_role"]
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_counters: {
        Row: {
          kind: string
          last_value: number
          shop_id: string
        }
        Insert: {
          kind: string
          last_value?: number
          shop_id: string
        }
        Update: {
          kind?: string
          last_value?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_counters_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bar_registration_number: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          legal_name: string | null
          legal_texts: Json
          logo_path: string | null
          name: string
          phone: string | null
          sales_tax_rate: number
          state: string
          storage_fee_per_day_cents: number | null
          timezone: string
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bar_registration_number?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          legal_texts?: Json
          logo_path?: string | null
          name: string
          phone?: string | null
          sales_tax_rate?: number
          state?: string
          storage_fee_per_day_cents?: number | null
          timezone?: string
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bar_registration_number?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          legal_texts?: Json
          logo_path?: string | null
          name?: string
          phone?: string | null
          sales_tax_rate?: number
          state?: string
          storage_fee_per_day_cents?: number | null
          timezone?: string
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          make: string | null
          model: string | null
          notes: string | null
          odometer_mi: number | null
          plate: string | null
          plate_state: string | null
          shop_id: string
          trim: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          odometer_mi?: number | null
          plate?: string | null
          plate_state?: string | null
          shop_id?: string
          trim?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          odometer_mi?: number | null
          plate?: string | null
          plate_state?: string | null
          shop_id?: string
          trim?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "vehicles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_shop_id: { Args: never; Returns: string }
      next_number: { Args: { p_kind: string }; Returns: number }
      search_customers: {
        Args: { q: string }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          phone_alt: string | null
          preferred_language: string
          search_text: string | null
          shop_id: string
          source: Database["public"]["Enums"]["customer_source"]
          state: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
          zip: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      activity_kind:
        | "note"
        | "call"
        | "email"
        | "text"
        | "status_change"
        | "system"
      appointment_status: "scheduled" | "completed" | "no_show" | "cancelled"
      appointment_type:
        | "estimate"
        | "drop_off"
        | "delivery"
        | "pickup"
        | "other"
      customer_source:
        | "walk_in"
        | "phone"
        | "website"
        | "google"
        | "facebook"
        | "instagram"
        | "referral"
        | "insurance"
        | "repeat"
        | "other"
      customer_type: "individual" | "business"
      user_role: "owner"
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
      activity_kind: [
        "note",
        "call",
        "email",
        "text",
        "status_change",
        "system",
      ],
      appointment_status: ["scheduled", "completed", "no_show", "cancelled"],
      appointment_type: ["estimate", "drop_off", "delivery", "pickup", "other"],
      customer_source: [
        "walk_in",
        "phone",
        "website",
        "google",
        "facebook",
        "instagram",
        "referral",
        "insurance",
        "repeat",
        "other",
      ],
      customer_type: ["individual", "business"],
      user_role: ["owner"],
    },
  },
} as const
