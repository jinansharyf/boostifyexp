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
      app_settings: {
        Row: {
          accent_color: string
          body_font: string
          contact_email: string | null
          contact_phone: string | null
          favicon_url: string | null
          heading_font: string
          id: number
          logo_url: string | null
          og_image_url: string | null
          order_no_prefix: string
          primary_color: string
          public_url: string | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          site_name: string
          sms_api_key: string | null
          sms_api_url: string | null
          sms_enabled: boolean
          sms_enabled_delivered: boolean
          sms_enabled_on_the_way: boolean
          sms_enabled_picked: boolean
          sms_sender_id: string | null
          sms_tpl_delivered: string | null
          sms_tpl_on_the_way: string | null
          sms_tpl_picked: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_tiktok: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string
          body_font?: string
          contact_email?: string | null
          contact_phone?: string | null
          favicon_url?: string | null
          heading_font?: string
          id?: number
          logo_url?: string | null
          og_image_url?: string | null
          order_no_prefix?: string
          primary_color?: string
          public_url?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          site_name?: string
          sms_api_key?: string | null
          sms_api_url?: string | null
          sms_enabled?: boolean
          sms_enabled_delivered?: boolean
          sms_enabled_on_the_way?: boolean
          sms_enabled_picked?: boolean
          sms_sender_id?: string | null
          sms_tpl_delivered?: string | null
          sms_tpl_on_the_way?: string | null
          sms_tpl_picked?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string
          body_font?: string
          contact_email?: string | null
          contact_phone?: string | null
          favicon_url?: string | null
          heading_font?: string
          id?: number
          logo_url?: string | null
          og_image_url?: string | null
          order_no_prefix?: string
          primary_color?: string
          public_url?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          site_name?: string
          sms_api_key?: string | null
          sms_api_url?: string | null
          sms_enabled?: boolean
          sms_enabled_delivered?: boolean
          sms_enabled_on_the_way?: boolean
          sms_enabled_picked?: boolean
          sms_sender_id?: string | null
          sms_tpl_delivered?: string | null
          sms_tpl_on_the_way?: string | null
          sms_tpl_picked?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          subject: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          subject?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          subject?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          available?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          available?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_form_fields: {
        Row: {
          active: boolean
          created_at: string
          field_key: string
          field_type: string
          id: string
          label: string
          options: Json
          required: boolean
          section: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_key: string
          field_type: string
          id?: string
          label: string
          options?: Json
          required?: boolean
          section: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          label?: string
          options?: Json
          required?: boolean
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_number_counters: {
        Row: {
          last_seq: number
          period_key: string
          updated_at: string
        }
        Insert: {
          last_seq?: number
          period_key: string
          updated_at?: string
        }
        Update: {
          last_seq?: number
          period_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_status_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_fee: number
          id: string
          items: Json
          notes: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          tracking_no: string
          updated_at: string
          vendor_id: string | null
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          id?: string
          items?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          tracking_no?: string
          updated_at?: string
          vendor_id?: string | null
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          id?: string
          items?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          tracking_no?: string
          updated_at?: string
          vendor_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          must_change_password: boolean
          phone: string | null
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          must_change_password?: boolean
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          must_change_password?: boolean
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      telegram_settings: {
        Row: {
          admin_chat_id: string | null
          bot_token: string | null
          broadcast_chat_ids: string | null
          enabled: boolean
          id: number
          updated_at: string
        }
        Insert: {
          admin_chat_id?: string | null
          bot_token?: string | null
          broadcast_chat_ids?: string | null
          enabled?: boolean
          id: number
          updated_at?: string
        }
        Update: {
          admin_chat_id?: string | null
          bot_token?: string | null
          broadcast_chat_ids?: string | null
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["app_permission"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["app_permission"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          cover_url: string | null
          created_at: string
          cuisine: string | null
          description: string | null
          id: string
          is_open: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          opening_hours: Json | null
          owner_id: string | null
          phone: string | null
          rating: number | null
          slug: string | null
          status: Database["public"]["Enums"]["vendor_status"]
          store_name: string
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          address?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          is_open?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          rating?: number | null
          slug?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          store_name: string
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          is_open?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          rating?: number | null
          slug?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          store_name?: string
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          active: boolean
          created_at: string
          eta_minutes: number
          flat_fee: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          eta_minutes?: number
          flat_fee?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          eta_minutes?: number
          flat_fee?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_tracking_no: { Args: { _at?: string }; Returns: string }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["app_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_permission:
        | "manage_orders"
        | "manage_menu"
        | "manage_users"
        | "manage_settings"
        | "manage_vendors"
        | "manage_zones"
        | "view_reports"
        | "manage_chat"
      app_role: "customer" | "vendor" | "admin" | "super_admin"
      order_status:
        | "pending"
        | "accepted"
        | "preparing"
        | "picked_up"
        | "on_the_way"
        | "delivered"
        | "cancelled"
        | "rejected"
      vendor_status: "pending" | "approved" | "rejected" | "suspended"
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
      app_permission: [
        "manage_orders",
        "manage_menu",
        "manage_users",
        "manage_settings",
        "manage_vendors",
        "manage_zones",
        "view_reports",
        "manage_chat",
      ],
      app_role: ["customer", "vendor", "admin", "super_admin"],
      order_status: [
        "pending",
        "accepted",
        "preparing",
        "picked_up",
        "on_the_way",
        "delivered",
        "cancelled",
        "rejected",
      ],
      vendor_status: ["pending", "approved", "rejected", "suspended"],
    },
  },
} as const
