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
          repair_order_id: string | null
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
          repair_order_id?: string | null
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
          repair_order_id?: string | null
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
            foreignKeyName: "activities_repair_order_id_shop_id_fkey"
            columns: ["repair_order_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
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
          repair_order_id: string | null
          shop_id: string
          source: Database["public"]["Enums"]["record_source"]
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
          repair_order_id?: string | null
          shop_id?: string
          source?: Database["public"]["Enums"]["record_source"]
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
          repair_order_id?: string | null
          shop_id?: string
          source?: Database["public"]["Enums"]["record_source"]
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
            foreignKeyName: "appointments_repair_order_id_shop_id_fkey"
            columns: ["repair_order_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
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
      authorizations: {
        Row: {
          amount_cents: number
          authorized_at: string
          authorizer_name: string
          by_designee: boolean
          contact_email: string | null
          contact_phone: string | null
          content_sha256: string
          created_at: string
          created_by: string | null
          decision: Database["public"]["Enums"]["authorization_decision"]
          deleted_at: string | null
          estimate_id: string
          id: string
          method: Database["public"]["Enums"]["authorization_method"]
          phone_called: string | null
          return_parts_requested: boolean
          shop_id: string
          signature_document_id: string | null
          signer_ip: unknown
          signer_user_agent: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          authorized_at?: string
          authorizer_name: string
          by_designee?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          content_sha256: string
          created_at?: string
          created_by?: string | null
          decision: Database["public"]["Enums"]["authorization_decision"]
          deleted_at?: string | null
          estimate_id: string
          id?: string
          method: Database["public"]["Enums"]["authorization_method"]
          phone_called?: string | null
          return_parts_requested?: boolean
          shop_id?: string
          signature_document_id?: string | null
          signer_ip?: unknown
          signer_user_agent?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          authorized_at?: string
          authorizer_name?: string
          by_designee?: boolean
          contact_email?: string | null
          contact_phone?: string | null
          content_sha256?: string
          created_at?: string
          created_by?: string | null
          decision?: Database["public"]["Enums"]["authorization_decision"]
          deleted_at?: string | null
          estimate_id?: string
          id?: string
          method?: Database["public"]["Enums"]["authorization_method"]
          phone_called?: string | null
          return_parts_requested?: boolean
          shop_id?: string
          signature_document_id?: string | null
          signer_ip?: unknown
          signer_user_agent?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorizations_estimate_id_shop_id_fkey"
            columns: ["estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimate_totals"
            referencedColumns: ["estimate_id", "shop_id"]
          },
          {
            foreignKeyName: "authorizations_estimate_id_shop_id_fkey"
            columns: ["estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "authorizations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorizations_signature_document_id_shop_id_fkey"
            columns: ["signature_document_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "documents"
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
      documents: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          estimate_id: string | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          repair_order_id: string | null
          sha256: string | null
          shop_id: string
          size_bytes: number | null
          storage_path: string
          taken_at: string | null
          updated_at: string
          vehicle_id: string | null
          web_request_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          estimate_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          repair_order_id?: string | null
          sha256?: string | null
          shop_id?: string
          size_bytes?: number | null
          storage_path: string
          taken_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          web_request_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          estimate_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string
          repair_order_id?: string | null
          sha256?: string | null
          shop_id?: string
          size_bytes?: number | null
          storage_path?: string
          taken_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          web_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "documents_estimate_id_shop_id_fkey"
            columns: ["estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimate_totals"
            referencedColumns: ["estimate_id", "shop_id"]
          },
          {
            foreignKeyName: "documents_estimate_id_shop_id_fkey"
            columns: ["estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "documents_repair_order_id_shop_id_fkey"
            columns: ["repair_order_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "documents_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_vehicle_id_shop_id_fkey"
            columns: ["vehicle_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "documents_web_request_id_shop_id_fkey"
            columns: ["web_request_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "web_requests"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      estimate_lines: {
        Row: {
          amount_cents: number | null
          brand: string | null
          crash_part_origin:
            | Database["public"]["Enums"]["crash_part_origin"]
            | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          estimate_id: string
          id: string
          is_crash_part: boolean | null
          labor_type: Database["public"]["Enums"]["labor_type"] | null
          line_type: Database["public"]["Enums"]["estimate_line_type"]
          non_returnable: boolean | null
          paint_materials_method:
            | Database["public"]["Enums"]["paint_materials_method"]
            | null
          part_condition: Database["public"]["Enums"]["part_condition"] | null
          part_number: string | null
          position: number
          quantity: number
          shop_id: string
          sublet_vendor_address: string | null
          sublet_vendor_name: string | null
          taxable: boolean
          teardown_role: Database["public"]["Enums"]["teardown_role"] | null
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          brand?: string | null
          crash_part_origin?:
            | Database["public"]["Enums"]["crash_part_origin"]
            | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          estimate_id: string
          id?: string
          is_crash_part?: boolean | null
          labor_type?: Database["public"]["Enums"]["labor_type"] | null
          line_type: Database["public"]["Enums"]["estimate_line_type"]
          non_returnable?: boolean | null
          paint_materials_method?:
            | Database["public"]["Enums"]["paint_materials_method"]
            | null
          part_condition?: Database["public"]["Enums"]["part_condition"] | null
          part_number?: string | null
          position: number
          quantity?: number
          shop_id?: string
          sublet_vendor_address?: string | null
          sublet_vendor_name?: string | null
          taxable?: boolean
          teardown_role?: Database["public"]["Enums"]["teardown_role"] | null
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          brand?: string | null
          crash_part_origin?:
            | Database["public"]["Enums"]["crash_part_origin"]
            | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          estimate_id?: string
          id?: string
          is_crash_part?: boolean | null
          labor_type?: Database["public"]["Enums"]["labor_type"] | null
          line_type?: Database["public"]["Enums"]["estimate_line_type"]
          non_returnable?: boolean | null
          paint_materials_method?:
            | Database["public"]["Enums"]["paint_materials_method"]
            | null
          part_condition?: Database["public"]["Enums"]["part_condition"] | null
          part_number?: string | null
          position?: number
          quantity?: number
          shop_id?: string
          sublet_vendor_address?: string | null
          sublet_vendor_name?: string | null
          taxable?: boolean
          teardown_role?: Database["public"]["Enums"]["teardown_role"] | null
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_lines_estimate_id_shop_id_fkey"
            columns: ["estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimate_totals"
            referencedColumns: ["estimate_id", "shop_id"]
          },
          {
            foreignKeyName: "estimate_lines_estimate_id_shop_id_fkey"
            columns: ["estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "estimate_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          basis: Database["public"]["Enums"]["estimate_basis"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["estimate_kind"]
          locked_at: string | null
          notes: string | null
          parent_estimate_id: string | null
          payor_approved_amount_cents: number | null
          payor_claim_number: string | null
          payor_estimate_document_id: string | null
          payor_estimate_total_cents: number | null
          payor_name: string | null
          payor_notified_at: string | null
          pdf_document_id: string | null
          pdf_sha256: string | null
          pickup_deadline_days: number | null
          reassembly_max_days: number | null
          repair_order_id: string
          sent_at: string | null
          seq: number
          shop_id: string
          status: Database["public"]["Enums"]["estimate_status"]
          teardown_area: string | null
          teardown_may_prevent_restoration: boolean | null
          updated_at: string
        }
        Insert: {
          basis?: Database["public"]["Enums"]["estimate_basis"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["estimate_kind"]
          locked_at?: string | null
          notes?: string | null
          parent_estimate_id?: string | null
          payor_approved_amount_cents?: number | null
          payor_claim_number?: string | null
          payor_estimate_document_id?: string | null
          payor_estimate_total_cents?: number | null
          payor_name?: string | null
          payor_notified_at?: string | null
          pdf_document_id?: string | null
          pdf_sha256?: string | null
          pickup_deadline_days?: number | null
          reassembly_max_days?: number | null
          repair_order_id: string
          sent_at?: string | null
          seq: number
          shop_id?: string
          status?: Database["public"]["Enums"]["estimate_status"]
          teardown_area?: string | null
          teardown_may_prevent_restoration?: boolean | null
          updated_at?: string
        }
        Update: {
          basis?: Database["public"]["Enums"]["estimate_basis"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["estimate_kind"]
          locked_at?: string | null
          notes?: string | null
          parent_estimate_id?: string | null
          payor_approved_amount_cents?: number | null
          payor_claim_number?: string | null
          payor_estimate_document_id?: string | null
          payor_estimate_total_cents?: number | null
          payor_name?: string | null
          payor_notified_at?: string | null
          pdf_document_id?: string | null
          pdf_sha256?: string | null
          pickup_deadline_days?: number | null
          reassembly_max_days?: number | null
          repair_order_id?: string
          sent_at?: string | null
          seq?: number
          shop_id?: string
          status?: Database["public"]["Enums"]["estimate_status"]
          teardown_area?: string | null
          teardown_may_prevent_restoration?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimates_parent_estimate_id_shop_id_fkey"
            columns: ["parent_estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimate_totals"
            referencedColumns: ["estimate_id", "shop_id"]
          },
          {
            foreignKeyName: "estimates_parent_estimate_id_shop_id_fkey"
            columns: ["parent_estimate_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "estimates_payor_estimate_document_id_shop_id_fkey"
            columns: ["payor_estimate_document_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "estimates_pdf_document_id_shop_id_fkey"
            columns: ["pdf_document_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "estimates_repair_order_id_shop_id_fkey"
            columns: ["repair_order_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "estimates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_rates: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_from: string
          id: string
          kind: Database["public"]["Enums"]["rate_kind"]
          rate_cents: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string
          id?: string
          kind: Database["public"]["Enums"]["rate_kind"]
          rate_cents: number
          shop_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_from?: string
          id?: string
          kind?: Database["public"]["Enums"]["rate_kind"]
          rate_cents?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_rates_shop_id_fkey"
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
      repair_orders: {
        Row: {
          arrival_circumstance: Database["public"]["Enums"]["arrival_circumstance"]
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          delivered_at: string | null
          designee_email: string | null
          designee_name: string | null
          designee_phone: string | null
          designee_signature_document_id: string | null
          designee_signed_at: string | null
          id: string
          notes: string | null
          odometer_in: number
          odometer_out: number | null
          promised_at: string | null
          ready_for_pickup_notified_at: string | null
          received_at: string
          requested_repairs: string
          ro_number: number
          shop_id: string
          status: Database["public"]["Enums"]["ro_status"]
          teardown_outcome:
            | Database["public"]["Enums"]["teardown_outcome"]
            | null
          teardown_outcome_at: string | null
          total_loss_at: string | null
          type: Database["public"]["Enums"]["ro_type"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          arrival_circumstance?: Database["public"]["Enums"]["arrival_circumstance"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          delivered_at?: string | null
          designee_email?: string | null
          designee_name?: string | null
          designee_phone?: string | null
          designee_signature_document_id?: string | null
          designee_signed_at?: string | null
          id?: string
          notes?: string | null
          odometer_in: number
          odometer_out?: number | null
          promised_at?: string | null
          ready_for_pickup_notified_at?: string | null
          received_at?: string
          requested_repairs: string
          ro_number: number
          shop_id?: string
          status?: Database["public"]["Enums"]["ro_status"]
          teardown_outcome?:
            | Database["public"]["Enums"]["teardown_outcome"]
            | null
          teardown_outcome_at?: string | null
          total_loss_at?: string | null
          type?: Database["public"]["Enums"]["ro_type"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          arrival_circumstance?: Database["public"]["Enums"]["arrival_circumstance"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          delivered_at?: string | null
          designee_email?: string | null
          designee_name?: string | null
          designee_phone?: string | null
          designee_signature_document_id?: string | null
          designee_signed_at?: string | null
          id?: string
          notes?: string | null
          odometer_in?: number
          odometer_out?: number | null
          promised_at?: string | null
          ready_for_pickup_notified_at?: string | null
          received_at?: string
          requested_repairs?: string
          ro_number?: number
          shop_id?: string
          status?: Database["public"]["Enums"]["ro_status"]
          teardown_outcome?:
            | Database["public"]["Enums"]["teardown_outcome"]
            | null
          teardown_outcome_at?: string | null
          total_loss_at?: string | null
          type?: Database["public"]["Enums"]["ro_type"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_orders_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "repair_orders_designee_signature_document_id_shop_id_fkey"
            columns: ["designee_signature_document_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "repair_orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_vehicle_id_shop_id_fkey"
            columns: ["vehicle_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
      ro_phases: {
        Row: {
          budget_cents: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          position: number
          repair_order_id: string
          shop_id: string
          status: Database["public"]["Enums"]["phase_status"]
          updated_at: string
        }
        Insert: {
          budget_cents?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          position: number
          repair_order_id: string
          shop_id?: string
          status?: Database["public"]["Enums"]["phase_status"]
          updated_at?: string
        }
        Update: {
          budget_cents?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          position?: number
          repair_order_id?: string
          shop_id?: string
          status?: Database["public"]["Enums"]["phase_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ro_phases_repair_order_id_shop_id_fkey"
            columns: ["repair_order_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "ro_phases_shop_id_fkey"
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
          epa_id_number: string | null
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
          epa_id_number?: string | null
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
          epa_id_number?: string | null
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
      web_requests: {
        Row: {
          appointment_id: string | null
          claim_number: string | null
          consent_text: string
          consent_version: string
          consented_at: string
          created_at: string
          created_by: string | null
          customer_id: string
          damage_description: string
          deleted_at: string | null
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          id: string
          insurer_name: string | null
          ip: unknown
          is_insurance_claim: boolean | null
          landing_page: string | null
          locale: string
          marketing_opt_in: boolean
          meta_event_id: string
          preferred_date: string
          preferred_window: Database["public"]["Enums"]["time_window"]
          privacy_accepted: boolean
          referrer: string | null
          service: string | null
          shop_id: string
          status: Database["public"]["Enums"]["web_request_status"]
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          vehicle_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          claim_number?: string | null
          consent_text: string
          consent_version: string
          consented_at: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          damage_description: string
          deleted_at?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          insurer_name?: string | null
          ip?: unknown
          is_insurance_claim?: boolean | null
          landing_page?: string | null
          locale: string
          marketing_opt_in?: boolean
          meta_event_id: string
          preferred_date: string
          preferred_window: Database["public"]["Enums"]["time_window"]
          privacy_accepted: boolean
          referrer?: string | null
          service?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["web_request_status"]
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vehicle_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          claim_number?: string | null
          consent_text?: string
          consent_version?: string
          consented_at?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          damage_description?: string
          deleted_at?: string | null
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          id?: string
          insurer_name?: string | null
          ip?: unknown
          is_insurance_claim?: boolean | null
          landing_page?: string | null
          locale?: string
          marketing_opt_in?: boolean
          meta_event_id?: string
          preferred_date?: string
          preferred_window?: Database["public"]["Enums"]["time_window"]
          privacy_accepted?: boolean
          referrer?: string | null
          service?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["web_request_status"]
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_requests_appointment_id_shop_id_fkey"
            columns: ["appointment_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "web_requests_customer_id_shop_id_fkey"
            columns: ["customer_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "web_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_requests_vehicle_id_shop_id_fkey"
            columns: ["vehicle_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "shop_id"]
          },
        ]
      }
    }
    Views: {
      estimate_totals: {
        Row: {
          estimate_id: string | null
          hazardous_waste_cents: number | null
          labor_cents: number | null
          materials_cents: number | null
          parts_cents: number | null
          repair_order_id: string | null
          shop_id: string | null
          sublet_cents: number | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_repair_order_id_shop_id_fkey"
            columns: ["repair_order_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id", "shop_id"]
          },
          {
            foreignKeyName: "estimates_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
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
      appointment_status:
        | "requested"
        | "scheduled"
        | "completed"
        | "no_show"
        | "cancelled"
      appointment_type:
        | "estimate"
        | "drop_off"
        | "delivery"
        | "pickup"
        | "other"
      arrival_circumstance:
        | "customer_present"
        | "after_hours_drop_off"
        | "towed_in"
      authorization_decision: "approved" | "declined"
      authorization_method: "written" | "oral" | "electronic"
      crash_part_origin: "oem" | "non_oem_aftermarket"
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
      document_kind:
        | "photo"
        | "estimate_pdf"
        | "third_party_estimate"
        | "signature"
        | "authorization_proof"
        | "other"
      estimate_basis: "shop" | "third_party"
      estimate_kind: "teardown" | "repair" | "supplement"
      estimate_line_type:
        | "part"
        | "labor"
        | "paint_materials"
        | "materials"
        | "sublet"
        | "hazardous_waste"
      estimate_status: "draft" | "sent" | "authorized" | "declined" | "voided"
      labor_type: "body" | "paint" | "mechanical" | "frame" | "other"
      paint_materials_method: "hourly_rate" | "actual_cost"
      part_condition: "new" | "used" | "rebuilt" | "reconditioned"
      phase_status: "pending" | "in_progress" | "done"
      rate_kind:
        | "body"
        | "paint"
        | "mechanical"
        | "frame"
        | "other"
        | "paint_materials"
      record_source: "app" | "web"
      ro_status:
        | "open"
        | "in_progress"
        | "completed"
        | "delivered"
        | "cancelled"
        | "total_loss"
      ro_type: "standard" | "classic"
      teardown_outcome: "repair" | "reassemble" | "declined_reassembly"
      teardown_role: "teardown" | "reassembly" | "destroyed_item"
      time_window: "morning" | "afternoon"
      user_role: "owner"
      web_request_status: "new" | "contacted" | "converted" | "spam" | "closed"
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
      appointment_status: [
        "requested",
        "scheduled",
        "completed",
        "no_show",
        "cancelled",
      ],
      appointment_type: ["estimate", "drop_off", "delivery", "pickup", "other"],
      arrival_circumstance: [
        "customer_present",
        "after_hours_drop_off",
        "towed_in",
      ],
      authorization_decision: ["approved", "declined"],
      authorization_method: ["written", "oral", "electronic"],
      crash_part_origin: ["oem", "non_oem_aftermarket"],
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
      document_kind: [
        "photo",
        "estimate_pdf",
        "third_party_estimate",
        "signature",
        "authorization_proof",
        "other",
      ],
      estimate_basis: ["shop", "third_party"],
      estimate_kind: ["teardown", "repair", "supplement"],
      estimate_line_type: [
        "part",
        "labor",
        "paint_materials",
        "materials",
        "sublet",
        "hazardous_waste",
      ],
      estimate_status: ["draft", "sent", "authorized", "declined", "voided"],
      labor_type: ["body", "paint", "mechanical", "frame", "other"],
      paint_materials_method: ["hourly_rate", "actual_cost"],
      part_condition: ["new", "used", "rebuilt", "reconditioned"],
      phase_status: ["pending", "in_progress", "done"],
      rate_kind: [
        "body",
        "paint",
        "mechanical",
        "frame",
        "other",
        "paint_materials",
      ],
      record_source: ["app", "web"],
      ro_status: [
        "open",
        "in_progress",
        "completed",
        "delivered",
        "cancelled",
        "total_loss",
      ],
      ro_type: ["standard", "classic"],
      teardown_outcome: ["repair", "reassemble", "declined_reassembly"],
      teardown_role: ["teardown", "reassembly", "destroyed_item"],
      time_window: ["morning", "afternoon"],
      user_role: ["owner"],
      web_request_status: ["new", "contacted", "converted", "spam", "closed"],
    },
  },
} as const
