import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  is_phone?: boolean;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  score: number;
  rank: number;
  total_players: number;
  is_me: boolean;
}

export interface GameRoom {
  id: string;
  status: string;
  current_question_index: number;
  current_phase: string;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  phase_duration_seconds: number;
  paused_remaining_ms?: number | null;
  phase_elapsed_before_pause_ms?: number;
  host_id: string;
  settings: {
    correctness_weight: number;
    show_leaderboard_every: number;
    default_time_limit: number;
    result_display_seconds?: number;
    leaderboard_display_seconds?: number;
    allow_late_press?: boolean;
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
  allow_late_press: true,
};

function mapRoomData(data: any, previousRoom?: GameRoom | null): GameRoom {
  return {
    id: data.id,
    status: data.status ?? previousRoom?.status ?? "waiting",
    host_id: data.host_id ?? previousRoom?.host_id ?? "",
    current_question_index: data.current_question_index ?? -1,
    current_phase: data.current_phase ?? "idle",
    phase_started_at: data.phase_started_at ?? null,
    phase_ends_at: data.phase_ends_at ?? null,
    phase_duration_seconds: data.phase_duration_seconds ?? 0,
    paused_remaining_ms: data.paused_remaining_ms ?? null,
    phase_elapsed_before_pause_ms: data.phase_elapsed_before_pause_ms ?? 0,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const answerStartRef = useRef(0);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return false;
    const { data, error } = await supabase
      .from("game_rooms")
      .select("id,status,current_question_index,current_phase,phase_started_at,phase_ends_at,phase_duration_seconds,paused_remaining_ms,phase_elapsed_before_pause_ms,settings,host_id")
      .eq("id", roomId)
      .maybeSingle();

    if (error) {
      setLoadError("לא ניתן לטעון את המשחק");
      return false;
    }
    if (!data) {
      setLoadError("החדר לא נמצא או שאינך מחובר אליו");
      return false;
    }

    setRoom((prev) => mapRoomData(data, prev));
    setLoadError(null);
    return true;
  }, [roomId]);

  const fetchQuestions = useCallback(async () => {
    if (!roomId) return false;
    const { data, error } = await supabase
      .from("public_questions" as any)
      .select("*")
      .eq("room_id", roomId)
      .order("sort_order");

    if (error) return false;

    setQuestions(
      (data ?? []).map((q: any) => ({
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
      })),
    );
    return true;
  }, [roomId]);

  const fetchPlayers = useCallback(async () => {
    if (!roomId) return false;
    const { data, error } = await supabase.rpc("get_room_players" as any, { _room_id: roomId });
    if (error) return false;

    setPlayers(
      (Array.isArray(data) ? data : []).map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name || "אורח",
        nickname: p.nickname || "",
        score: Number(p.score ?? 0),
        is_connected: Boolean(p.is_connected),
        is_phone: Boolean(p.is_phone),
      })),
    );
    return true;
  }, [roomId]);

  const fetchLeaderboard = useCallback(async (limit = 10): Promise<LeaderboardRow[]> => {
    if (!roomId) return [];
    const { data, error } = await supabase.rpc("get_leaderboard" as any, {
      _room_id: roomId,
      _limit: limit,
    });
    if (error) return [];
    return (Array.isArray(data) ? data : []).map((r: any) => ({
      user_id: r.user_id,
      display_name: r.display_name || "שחקן",
      score: Number(r.score ?? 0),
      rank: Number(r.rank ?? 0),
      total_players: Number(r.total_players ?? 0),
      is_me: Boolean(r.is_me),
    }));
  }, [roomId]);

  const checkMyAnswer = useCallback(async (questionId: string) => {
    if (!user || !roomId) return;
    const { data } = await supabase
      .from("game_answers")
      .select("selected_index")
      .eq("room_id", roomId)
      .eq("question_id", questionId)
      .eq("user_id", user.id)
      .maybeSingle();
    setMyAnswer(data?.selected_index ?? null);
  }, [roomId, user]);

  const reloadAll = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    const results = await Promise.all([fetchRoom(), fetchQuestions(), fetchPlayers()]);
    if (!results[0]) {
      setLoadError("לא ניתן לטעון את המשחק");
    }
    setLoading(false);
  }, [roomId, fetchRoom, fetchQuestions, fetchPlayers]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    if (!room || room.current_question_index < 0 || questions.length === 0) return;
    const q = questions[room.current_question_index];
    if (!q) return;
    void checkMyAnswer(q.id);
    answerStartRef.current =
      room.current_phase === "answering" && room.phase_started_at
        ? new Date(room.phase_started_at).getTime()
        : Date.now();
  }, [room?.current_question_index, room?.current_phase, room?.phase_started_at, questions, checkMyAnswer]);

  useEffect(() => {
    if (!roomId) return;

    let disposed = false;

    const setup = async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;

      const channel = supabase
        .channel(`room:${roomId}`, { config: { private: true } })
        .on("broadcast", { event: "room_state" }, (payload) => {
          const d = payload?.payload ?? {};
          if (!d || disposed) return;
          setRoom((prev) => {
            const next = mapRoomData({
              ...(prev ?? {}),
              id: roomId,
              status: d.status,
              current_phase: d.phase,
              current_question_index: d.question_index,
              phase_started_at: d.phase_started_at ?? null,
              phase_ends_at: d.phase_ends_at ?? null,
              phase_duration_seconds: d.phase_duration_seconds ?? 0,
              paused_remaining_ms: d.paused_remaining_ms ?? null,
              phase_elapsed_before_pause_ms: d.phase_elapsed_before_pause_ms ?? 0,
              host_id: prev?.host_id,
              settings: prev?.settings,
            }, prev);
            return next;
          });

          const phase = String(d.phase ?? "");
          if (phase === "result" || phase === "survey-result" || phase === "leaderboard" || phase === "stats") {
            void fetchQuestions();
          } else if (d.question_index !== undefined) {
            void fetchQuestions();
          }
        })
        .on("broadcast", { event: "room_presence" }, () => {
          void fetchPlayers();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void reloadAll();
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    };

    let cleanup: (() => void) | undefined;
    void setup().then((fn) => {
      cleanup = fn;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [roomId, reloadAll, fetchPlayers, fetchQuestions]);

  useEffect(() => {
    if (!roomId || !user?.id) return;

    const resync = () => {
      void fetchRoom();
      void fetchQuestions();
      void fetchPlayers();
    };

    void supabase.rpc("set_my_presence" as any, {
      _room_id: roomId,
      _connected: true,
    });

    const heartbeat = window.setInterval(() => {
      void supabase.rpc("set_my_presence" as any, {
        _room_id: roomId,
        _connected: true,
      });
    }, 30000);

    window.addEventListener("focus", resync);
    window.addEventListener("online", resync);

    const onVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", resync);
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.rpc("set_my_presence" as any, {
        _room_id: roomId,
        _connected: false,
      });
    };
  }, [roomId, user?.id, fetchRoom, fetchQuestions, fetchPlayers]);

  const submitAnswer = useCallback(async (selectedIndex: number) => {
    if (!user || !room || !roomId || myAnswer !== null) return undefined;

    const question = questions[room.current_question_index];
    if (!question) return undefined;

    setMyAnswer(selectedIndex);

    const { data, error } = await supabase.functions.invoke("submit-answer", {
      body: {
        room_id: roomId,
        question_id: question.id,
        selected_index: selectedIndex,
      },
    });

    if (error || !data?.ok) {
      toast.error(error?.message || data?.error || "שגיאה בשמירת תשובה");
      setMyAnswer(null);
      return undefined;
    }

    return {
      score: Number(data.score ?? 0),
      isCorrect: question.type === "survey" ? null : Boolean(data.is_correct),
      answerTimeMs: Number(data.answer_time_ms ?? 0),
    };
  }, [user, room, roomId, questions, myAnswer]);

  const advanceQuestion = useCallback(async (index: number, expectedFromIndex?: number) => {
    if (!roomId || !room) return false;
    const fromIndex = expectedFromIndex ?? room.current_question_index;

    const { data, error } = await supabase.rpc("advance_room_question", {
      _room_id: roomId,
      _from_index: fromIndex,
      _to_index: index,
    });

    if (error) {
      toast.error("שגיאה בסנכרון השאלה");
      return false;
    }

    return Boolean(data);
  }, [roomId, room]);

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

    await fetchRoom();
    await fetchQuestions();
    await fetchPlayers();
    return true;
  }, [roomId, questions, fetchRoom, fetchQuestions, fetchPlayers]);

  const setGameStatus = useCallback(async (status: "paused" | "playing") => {
    if (!roomId) return false;
    const { data, error } = await supabase.rpc("host_set_game_status" as any, {
      _room_id: roomId,
      _status: status,
    });
    if (error) {
      toast.error(error.message || "שגיאה בעדכון מצב המשחק");
      return false;
    }
    return Boolean(data);
  }, [roomId]);

  return {
    room,
    questions,
    players,
    currentQuestion:
      room && room.current_question_index >= 0
        ? questions[room.current_question_index] ?? null
        : null,
    currentQuestionIndex: room?.current_question_index ?? -1,
    myAnswer,
    loading,
    loadError,
    reloadAll,
    submitAnswer,
    advanceQuestion,
    rewindQuestion,
    setGameStatus,
    fetchRoom,
    fetchPlayers,
    fetchQuestions,
    fetchLeaderboard,
  };
}
