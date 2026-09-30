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
      game_answers: {
        Row: {
          answer_time_ms: number
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          room_id: string
          score: number
          selected_index: number
          user_id: string
        }
        Insert: {
          answer_time_ms?: number
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id: string
          room_id: string
          score?: number
          selected_index: number
          user_id: string
        }
        Update: {
          answer_time_ms?: number
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          room_id?: string
          score?: number
          selected_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "public_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_history: {
        Row: {
          created_at: string
          finished_at: string
          host_id: string
          id: string
          players_count: number
          questions_count: number
          rankings: Json
          room_code: string | null
          room_id: string
          room_name: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string
          host_id: string
          id?: string
          players_count?: number
          questions_count?: number
          rankings?: Json
          room_code?: string | null
          room_id: string
          room_name?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string
          host_id?: string
          id?: string
          players_count?: number
          questions_count?: number
          rankings?: Json
          room_code?: string | null
          room_id?: string
          room_name?: string | null
        }
        Relationships: []
      }
      game_rooms: {
        Row: {
          created_at: string
          current_phase: string
          current_question_index: number
          host_id: string
          id: string
          phase_duration_seconds: number
          phase_started_at: string | null
          room_code: string
          room_name: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_phase?: string
          current_question_index?: number
          host_id: string
          id?: string
          phase_duration_seconds?: number
          phase_started_at?: string | null
          room_code: string
          room_name?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_phase?: string
          current_question_index?: number
          host_id?: string
          id?: string
          phase_duration_seconds?: number
          phase_started_at?: string | null
          room_code?: string
          room_name?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_answer_events: {
        Row: { created_at: string; id: string; question_id: string; room_id: string }
        Insert: { created_at?: string; id?: string; question_id: string; room_id: string }
        Update: { created_at?: string; id?: string; question_id?: string; room_id?: string }
        Relationships: []
      }
      question_folders: {
        Row: { created_at: string; created_by: string | null; path: string }
        Insert: { created_at?: string; created_by?: string | null; path: string }
        Update: { created_at?: string; created_by?: string | null; path?: string }
        Relationships: []
      }
      game_templates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          questions: Json
          settings: Json
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          questions?: Json
          settings?: Json
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          questions?: Json
          settings?: Json
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      phone_call_state: {
        Row: {
          created_at: string
          id: string
          issued_at: string
          pending_param: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issued_at?: string
          pending_param: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string
          pending_param?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      player_roster: {
        Row: {
          created_at: string
          phone_number: string
          player_name: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          phone_number: string
          player_name: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          phone_number?: string
          player_name?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          nickname: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          nickname?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          nickname?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          category: string
          correct_index: number
          created_at: string
          created_by: string
          folder: string
          id: string
          image_view_time: number
          keep_image: boolean
          media_type: string | null
          media_url: string | null
          options: Json
          question_text: string
          question_type: string
          time_limit: number
        }
        Insert: {
          category?: string
          correct_index?: number
          created_at?: string
          created_by: string
          folder?: string
          id?: string
          image_view_time?: number
          keep_image?: boolean
          media_type?: string | null
          media_url?: string | null
          options?: Json
          question_text: string
          question_type?: string
          time_limit?: number
        }
        Update: {
          category?: string
          correct_index?: number
          created_at?: string
          created_by?: string
          folder?: string
          id?: string
          image_view_time?: number
          keep_image?: boolean
          media_type?: string | null
          media_url?: string | null
          options?: Json
          question_text?: string
          question_type?: string
          time_limit?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_index: number
          created_at: string
          id: string
          image_view_time: number
          keep_image: boolean
          media_type: string | null
          media_url: string | null
          options: Json
          question_text: string
          question_type: string
          room_id: string
          sort_order: number
          time_limit: number
        }
        Insert: {
          correct_index?: number
          created_at?: string
          id?: string
          image_view_time?: number
          keep_image?: boolean
          media_type?: string | null
          media_url?: string | null
          options?: Json
          question_text: string
          question_type?: string
          room_id: string
          sort_order?: number
          time_limit?: number
        }
        Update: {
          correct_index?: number
          created_at?: string
          id?: string
          image_view_time?: number
          keep_image?: boolean
          media_type?: string | null
          media_url?: string | null
          options?: Json
          question_text?: string
          question_type?: string
          room_id?: string
          sort_order?: number
          time_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          room_id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          room_id: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_invitations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_players: {
        Row: {
          id: string
          is_connected: boolean
          joined_at: string
          last_seen: string
          room_id: string
          score: number
          user_id: string
        }
        Insert: {
          id?: string
          is_connected?: boolean
          joined_at?: string
          last_seen?: string
          room_id: string
          score?: number
          user_id: string
        }
        Update: {
          id?: string
          is_connected?: boolean
          joined_at?: string
          last_seen?: string
          room_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_questions: {
        Row: {
          correct_index: number | null
          created_at: string | null
          id: string | null
          image_view_time: number | null
          keep_image: boolean | null
          media_type: string | null
          media_url: string | null
          options: Json | null
          question_text: string | null
          question_type: string | null
          room_id: string | null
          sort_order: number | null
          time_limit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      advance_room_question: {
        Args: { _from_index: number; _room_id: string; _to_index: number }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      rewind_question: {
        Args: { _question_id: string; _room_id: string }
        Returns: boolean
      }
      find_room_by_code: {
        Args: { _room_code: string }
        Returns: { id: string; room_code: string; room_name: string; status: string }[]
      }
      get_game_summary: {
        Args: { _room_id: string }
        Returns: {
          user_id: string
          display_name: string
          nickname: string
          score: number
          correct_answers: number
          total_answers: number
          total_time_ms: number
          fastest_ms: number
          best_streak: number
        }[]
      }
      get_question_answer_stats: {
        Args: { _question_id: string; _room_id: string }
        Returns: {
          answered: number
          correct: number
          wrong: number
          vote_counts: Json
        }[]
      }
      host_set_next_question: {
        Args: { _expected_index: number; _room_id: string; _to_index: number }
        Returns: boolean
      }
      touch_room_presence: {
        Args: { _is_connected?: boolean; _room_id: string }
        Returns: boolean
      }
      sync_room_phase: {
        Args: {
          _expected_phase: string
          _expected_question_index: number
          _next_phase: string
          _next_question_index?: number
          _next_status?: string
          _phase_duration_seconds: number
          _room_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
