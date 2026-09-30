import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateScore } from "@/lib/scoring";
import { toast } from "sonner";

export interface GameQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  type: "trivia" | "survey";
  mediaUrl?: string;
  mediaType?: string;
  imageViewTime: number;
  keepImage: boolean;
}

export interface PlayerScore {
  user_id: string;
  display_name: string;
  nickname: string;
  score: number;
  is_connected: boolean;
}

interface GameRoom {
  id: string;
  status: string;
  current_question_index: number;
  current_phase: string;
  phase_started_at: string | null;
  phase_duration_seconds: number;
  host_id: string;
  settings: {
    correctness_weight: number;
    show_leaderboard_every: number;
    default_time_limit: number;
    result_display_seconds?: number;
    leaderboard_display_seconds?: number;
    bg_music_url?: string;
    correct_sound_url?: string;
    wrong_sound_url?: string;
    end_music_url?: string;
  };
}

const DEFAULT_ROOM_SETTINGS: GameRoom["settings"] = {
  correctness_weight: 60,
  show_leaderboard_every: 2,
  default_time_limit: 15,
  result_display_seconds: 5,
  leaderboard_display_seconds: 5,
};

function mapRoomData(data: any, previousRoom?: GameRoom | null): GameRoom {
  return {
    id: data.id,
    status: data.status,
    host_id: data.host_id ?? previousRoom?.host_id ?? "",
    current_question_index: data.current_question_index ?? -1,
    current_phase: data.current_phase ?? "idle",
    phase_started_at: data.phase_started_at ?? null,
    phase_duration_seconds: data.phase_duration_seconds ?? 0,
    settings: {
      ...DEFAULT_ROOM_SETTINGS,
      ...((data.settings as Partial<GameRoom["settings"]> | null | undefined) ?? {}),
    },
  };
}

export function useGameSync(roomId: string | null) {
  const { user } = useAuth();
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [players, setPlayers] = useState<PlayerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const answerStartRef = useRef(0);

  // Fetch room data
  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from("game_rooms")
      .select("id, status, current_question_index, current_phase, phase_started_at, phase_duration_seconds, settings, host_id")
      .eq("id", roomId)
      .single();
    if (data) {
      setRoom((prev) => mapRoomData(data, prev));
    }
  }, [roomId]);

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from("public_questions" as any)
      .select("*")
      .eq("room_id", roomId)
      .order("sort_order");
    if (data) {
      setQuestions(
        data.map((q: any) => ({
          id: q.id,
          text: q.question_text,
          options: (q.options as string[]) || [],
          correctIndex: q.correct_index ?? -1,
          timeLimit: q.time_limit,
          type: q.question_type as "trivia" | "survey",
          mediaUrl: q.media_url || "",
          mediaType: q.media_type || "none",
          imageViewTime: q.image_view_time ?? 5,
          keepImage: q.keep_image ?? false,
        }))
      );
    }
  }, [roomId]);

  // Fetch players with scores
  const fetchPlayers = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from("room_players")
      .select("user_id, is_connected, score")
      .eq("room_id", roomId);
    if (!data) return;

    const { data: profilesData } = await supabase
      .from("room_player_profiles")
      .select("user_id, display_name, nickname")
      .eq("room_id", roomId);
    const profileMap = new Map((profilesData || []).map((p: any) => [p.user_id, p]));

    setPlayers(
      data.map((p: any) => {
        const prof: any = profileMap.get(p.user_id);
        return {
          user_id: p.user_id,
          display_name: prof?.display_name || "אורח",
          nickname: prof?.nickname || "",
          score: p.score,
          is_connected: p.is_connected,
        };
      })
    );
  }, [roomId]);

  // Check if already answered current question
  const checkMyAnswer = useCallback(async (questionId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("game_answers")
      .select("selected_index")
      .eq("question_id", questionId)
      .eq("user_id", user.id)
      .maybeSingle();
    setMyAnswer(data?.selected_index ?? null);
  }, [user]);

  // Initial load
  useEffect(() => {
    if (!roomId) return;
    const load = async () => {
      await Promise.all([fetchRoom(), fetchQuestions(), fetchPlayers()]);
      setLoading(false);
    };
    load();
  }, [roomId, fetchRoom, fetchQuestions, fetchPlayers]);

  // Check answer when question changes
  useEffect(() => {
    if (!room || room.current_question_index < 0 || questions.length === 0) return;
    const q = questions[room.current_question_index];
    if (q) {
      checkMyAnswer(q.id);
      answerStartRef.current = room.current_phase === "answering" && room.phase_started_at
        ? new Date(room.phase_started_at).getTime()
        : Date.now();
    }
  }, [room?.current_question_index, room?.current_phase, room?.phase_started_at, questions, checkMyAnswer]);

  // Realtime subscriptions
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`game-sync-${roomId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "game_rooms",
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const d = payload.new as any;
        setRoom((prev) => {
          const nextRoom = mapRoomData(d, prev);
          const questionChanged = !prev || d.current_question_index !== prev.current_question_index;
          const phaseChanged = !prev || d.current_phase !== prev.current_phase;

          if (questionChanged) {
            setMyAnswer(null);
          }

          if (questionChanged || phaseChanged) {
            answerStartRef.current = nextRoom.current_phase === "answering" && nextRoom.phase_started_at
              ? new Date(nextRoom.phase_started_at).getTime()
              : Date.now();
            // Refetch questions so correct_index becomes visible once the reveal phase starts
            void fetchQuestions();
          }

          return nextRoom;
        });
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "room_players",
        filter: `room_id=eq.${roomId}`,
      }, () => {
        fetchPlayers();
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "game_answers",
        filter: `room_id=eq.${roomId}`,
      }, () => {
        // Refresh players to get updated scores
        fetchPlayers();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "questions",
        filter: `room_id=eq.${roomId}`,
      }, () => {
        fetchQuestions();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void fetchRoom();
          void fetchQuestions();
          void fetchPlayers();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchPlayers, fetchQuestions, fetchRoom]);

  useEffect(() => {
    if (!roomId) return;

    const resyncRoom = () => {
      void fetchRoom();
      void fetchPlayers();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resyncRoom();
      }
    };

    const interval = window.setInterval(resyncRoom, 3000);

    window.addEventListener("focus", resyncRoom);
    window.addEventListener("online", resyncRoom);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", resyncRoom);
      window.removeEventListener("online", resyncRoom);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomId, fetchRoom]);

  // Submit answer
  const submitAnswer = useCallback(async (selectedIndex: number) => {
    if (!user || !room || !roomId || myAnswer !== null) return;
    
    const qIndex = room.current_question_index;
    const question = questions[qIndex];
    if (!question) return;

    setMyAnswer(selectedIndex);

    // Server-authoritative scoring; browser never sends score or answer time.
    const { data, error: ansError } = await supabase.functions.invoke("submit-answer", {
      body: {
        room_id: roomId,
        question_id: question.id,
        selected_index: selectedIndex,
      },
    });

    if (ansError || !data?.ok) {
      toast.error(ansError?.message || "שגיאה בשמירת תשובה");
      setMyAnswer(null);
      return;
    }

    return Number(data.score ?? 0);
  }, [user, room, roomId, questions, myAnswer]);

  // Advance to next question (atomic so all clients stay in sync)
  const advanceQuestion = useCallback(async (index: number, expectedFromIndex?: number) => {
    if (!roomId || !room) return false;

    const fromIndex = expectedFromIndex ?? room.current_question_index;

    const { data, error } = await supabase.rpc("advance_room_question", {
      _room_id: roomId,
      _from_index: fromIndex,
      _to_index: index,
    });

    if (error) {
      // Fallback for host if RPC fails unexpectedly
      if (room.host_id === user?.id) {
        const { error: fallbackError } = await supabase
          .from("game_rooms")
          .update({ current_question_index: index })
          .eq("id", roomId);

        if (fallbackError) return false;

        setRoom((prev) => prev ? { ...prev, current_question_index: index } : prev);
        setMyAnswer(null);
        answerStartRef.current = Date.now();
        return true;
      }
      return false;
    }

    const moved = !!data;
    if (moved) {
      setRoom((prev) => prev ? { ...prev, current_question_index: index } : prev);
      setMyAnswer(null);
      answerStartRef.current = Date.now();
      return true;
    }

    // RPC can return false on duplicate/racing transitions; treat "already moved" as success.
    const { data: latestRoom } = await supabase
      .from("game_rooms")
      .select("current_question_index")
      .eq("id", roomId)
      .maybeSingle();

    if (latestRoom?.current_question_index === index) {
      setRoom((prev) => prev ? { ...prev, current_question_index: index } : prev);
      setMyAnswer(null);
      answerStartRef.current = Date.now();
      return true;
    }

    return false;
  }, [roomId, room, user?.id]);

  // Rewind is atomic in the database.
  const rewindQuestion = useCallback(async (targetIndex: number) => {
    if (!roomId || targetIndex < 0) return false;
    const targetQ = questions[targetIndex];
    if (!targetQ) return false;

    const { data, error } = await supabase.rpc("rewind_question", {
      _room_id: roomId,
      _question_id: targetQ.id,
    });

    if (error || !data) {
      toast.error("שגיאה בחזרה לשאלה קודמת");
      return false;
    }

    setRoom((prev) => prev ? {
      ...prev,
      current_question_index: targetIndex,
      current_phase: "reading",
      status: "playing",
    } : prev);
    setMyAnswer(null);
    void fetchPlayers();
    return true;
  }, [roomId, questions, fetchPlayers]);

  // Admin: set game status
  const setGameStatus = useCallback(async (status: string, extra: Record<string, unknown> = {}) => {
    if (!roomId) return;
    const { error } = await supabase.from("game_rooms").update({ status, ...extra }).eq("id", roomId);
    if (!error) {
      await fetchRoom();
    }
  }, [roomId, fetchRoom]);

  const currentQuestion = room && room.current_question_index >= 0 
    ? questions[room.current_question_index] 
    : null;

  return {
    room,
    questions,
    players,
    currentQuestion,
    currentQuestionIndex: room?.current_question_index ?? -1,
    myAnswer,
    loading,
    submitAnswer,
    advanceQuestion,
    rewindQuestion,
    setGameStatus,
    fetchRoom,
    fetchPlayers,
  };
}
