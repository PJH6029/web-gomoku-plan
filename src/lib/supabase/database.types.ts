export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          black_nickname: string;
          black_user_id: string;
          board_rows: Json;
          created_at: string;
          deadline_at: string | null;
          finished_at: string | null;
          game_number: number;
          id: string;
          move_count: number;
          next_player: "black" | "white";
          result_reason: "five" | "timeout" | "resign" | "draw" | null;
          room_id: string;
          started_at: string | null;
          status: "waiting" | "active" | "finished";
          updated_at: string;
          white_nickname: string;
          white_user_id: string;
          winner: "black" | "white" | null;
          winning_line: Json;
        };
        Insert: {
          black_nickname: string;
          black_user_id: string;
          board_rows?: Json;
          created_at?: string;
          deadline_at?: string | null;
          finished_at?: string | null;
          game_number: number;
          id?: string;
          move_count?: number;
          next_player?: "black" | "white";
          result_reason?: "five" | "timeout" | "resign" | "draw" | null;
          room_id: string;
          started_at?: string | null;
          status?: "waiting" | "active" | "finished";
          updated_at?: string;
          white_nickname: string;
          white_user_id: string;
          winner?: "black" | "white" | null;
          winning_line?: Json;
        };
        Update: {
          black_nickname?: string;
          black_user_id?: string;
          board_rows?: Json;
          created_at?: string;
          deadline_at?: string | null;
          finished_at?: string | null;
          game_number?: number;
          id?: string;
          move_count?: number;
          next_player?: "black" | "white";
          result_reason?: "five" | "timeout" | "resign" | "draw" | null;
          room_id?: string;
          started_at?: string | null;
          status?: "waiting" | "active" | "finished";
          updated_at?: string;
          white_nickname?: string;
          white_user_id?: string;
          winner?: "black" | "white" | null;
          winning_line?: Json;
        };
        Relationships: [];
      };
      moves: {
        Row: {
          color: "black" | "white";
          created_at: string;
          game_id: string;
          id: string;
          move_index: number;
          player_id: string;
          player_nickname: string;
          x: number;
          y: number;
        };
        Insert: {
          color: "black" | "white";
          created_at?: string;
          game_id: string;
          id?: string;
          move_index: number;
          player_id: string;
          player_nickname: string;
          x: number;
          y: number;
        };
        Update: {
          color?: "black" | "white";
          created_at?: string;
          game_id?: string;
          id?: string;
          move_index?: number;
          player_id?: string;
          player_nickname?: string;
          x?: number;
          y?: number;
        };
        Relationships: [];
      };
      rematch_votes: {
        Row: {
          created_at: string;
          game_id: string;
          id: string;
          room_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          game_id: string;
          id?: string;
          room_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          game_id?: string;
          id?: string;
          room_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      room_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: number;
          payload: Json;
          room_code: string;
          room_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: number;
          payload: Json;
          room_code: string;
          room_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: number;
          payload?: Json;
          room_code?: string;
          room_id?: string;
        };
        Relationships: [];
      };
      room_seats: {
        Row: {
          id: string;
          is_ready: boolean;
          joined_at: string;
          nickname: string;
          room_id: string;
          seat_role: "host" | "guest";
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          is_ready?: boolean;
          joined_at?: string;
          nickname: string;
          room_id: string;
          seat_role: "host" | "guest";
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          is_ready?: boolean;
          joined_at?: string;
          nickname?: string;
          room_id?: string;
          seat_role?: "host" | "guest";
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string;
          host_user_id: string;
          id: string;
          last_event_at: string;
          status: "waiting" | "active" | "finished" | "abandoned";
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string;
          host_user_id: string;
          id?: string;
          last_event_at?: string;
          status?: "waiting" | "active" | "finished" | "abandoned";
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string;
          host_user_id?: string;
          id?: string;
          last_event_at?: string;
          status?: "waiting" | "active" | "finished" | "abandoned";
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
