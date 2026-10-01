import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Phone, Users, LogOut, Play, Pause, ChevronRight, ChevronLeft, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import { useGameSync } from "@/hooks/useGameSync";
import TelephoneQuestionStage from "@/components/game/TelephoneQuestionStage";
import { useGameAudio } from "@/hooks/useGameAudio";
import QRInvite from "@/components/game/QRInvite";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getPhaseDuration, type GamePhase } from "@/lib/gamePhases";

const PHONE_NUMBER = "0772613163";



function lastFour(userId: string) {
  const digits = (userId.match(/\d/g) || []).join("");
  return digits.slice(-4) || "????";
}

function phoneFromUserId(userId: string) {
  const digits = (userId.match(/\d/g) || []).join("");
  const last12 = digits.slice(-12).replace(/^0+/, "");
  return last12 || digits.slice(-4) || "????";
}

function formatPhone(phone: string) {
  // Israeli format: 05X-XXX-XXXX
  if (phone.length === 10 && phone.startsWith("0")) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  if (phone.length === 9 && phone.startsWith("5")) {
    return `0${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`;
  }
  return phone;
}

const TelephoneHost = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("room");

  const {
    room,
    questions,
    players,
    currentQuestion,
    currentQuestionIndex,
    loading,
    fetchRoom,
    rewindQuestion,
    setGameStatus,
    fetchLeaderboard,
  } = useGameSync(roomId);

  const isPaused = room?.status === "paused";

  // ---- Projector controls: volume / mute / fullscreen / idle cursor ----
  const [volume, setVolume] = useState<number>(() => {
    const v = Number(localStorage.getItem("tel-host-volume"));
    return Number.isFinite(v) && localStorage.getItem("tel-host-volume") !== null ? v : 1;
  });
  const [muted, setMuted] = useState<boolean>(() => localStorage.getItem("tel-host-muted") === "1");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);

  useEffect(() => { localStorage.setItem("tel-host-volume", String(volume)); }, [volume]);
  useEffect(() => { localStorage.setItem("tel-host-muted", muted ? "1" : "0"); }, [muted]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    let t: number | undefined;
    const wake = () => {
      setCursorHidden(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setCursorHidden(true), 3000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* browser refused */ }
  };

  const [now, setNow] = useState(() => Date.now());
  const [voteCounts, setVoteCounts] = useState<number[]>([]);
  const [voteQuestionId, setVoteQuestionId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [lastResultSoundKey, setLastResultSoundKey] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [leaderboardRows, setLeaderboardRows] = useState<Array<{ user_id: string; display_name: string; score: number; rank: number }>>([]);

  // Fetch room code once
  useEffect(() => {
    if (!roomId) return;
    supabase.from("game_rooms").select("room_code").eq("id", roomId).maybeSingle()
      .then(({ data }) => { if (data) setRoomCode(data.room_code); });
  }, [roomId]);

  const phase = (room?.current_phase || (currentQuestionIndex >= 0 ? "reading" : "idle")) as GamePhase;
  const configuredPhaseTime = getPhaseDuration(currentQuestion, phase, room?.settings);
  const totalTime = room?.phase_duration_seconds || configuredPhaseTime;
  const hasVideo = !!(currentQuestion?.mediaType === "video" && currentQuestion?.mediaUrl);

  const { playAnswerSound, fadeOutSfx } = useGameAudio({
    settings: {
      bgMusicUrl: room?.settings?.bg_music_url,
      correctSoundUrl: room?.settings?.correct_sound_url,
      wrongSoundUrl: room?.settings?.wrong_sound_url,
      endMusicUrl: room?.settings?.end_music_url,
    },
    phase,
    isPaused,
    hasVideo,
    isFinished: room?.status === "finished",
    masterVolume: volume,
    muted,
  });

  const timeLeft = useMemo(() => {
    if (!room || phase === "idle") return 0;
    if (room.phase_ends_at) {
      return Math.max(0, Math.ceil((new Date(room.phase_ends_at).getTime() - (now + serverOffsetMs)) / 1000));
    }
    if (!room.phase_started_at) return totalTime;
    return Math.max(0, Math.ceil((
      new Date(room.phase_started_at).getTime() + totalTime * 1000 - (now + serverOffsetMs)
    ) / 1000));
  }, [room, phase, totalTime, now, serverOffsetMs]);


  // Client-side timer only renders server-provided phase_ends_at; it never advances the game.
  useEffect(() => {
    let alive = true;
    const syncClock = async () => {
      const { data } = await supabase.rpc("server_now" as any);
      const serverNow = Array.isArray(data) ? data[0] : data;
      if (alive && serverNow) setServerOffsetMs(new Date(serverNow as string).getTime() - Date.now());
    };
    void syncClock();

    const id = window.setInterval(() => setNow(Date.now()), 250);
    const clock = window.setInterval(() => void syncClock(), 60000);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearInterval(clock);
    };
  }, []);

  // Fetch vote counts during result phase
  const fetchVotes = useCallback(async () => {
    if (!currentQuestion || !roomId) return;
    const { data, error } = await supabase.rpc("get_answer_counts" as any, {
      _room_id: roomId,
      _question_id: currentQuestion.id,
    });
    if (error) return;
    const counts = Array(currentQuestion.options.length).fill(0) as number[];
    for (const row of Array.isArray(data) ? data : []) {
      const i = Number((row as any).selected_index);
      if (Number.isInteger(i) && i >= 0 && i < counts.length) {
        counts[i] = Number((row as any).count ?? 0);
      }
    }
    setVoteQuestionId(currentQuestion.id);
    setVoteCounts(counts);
  }, [currentQuestion, roomId]);

  useEffect(() => {
    if (phase === "result" || phase === "survey-result") {
      setVoteQuestionId(null);
      setVoteCounts(currentQuestion?.options.map(() => 0) ?? []);
      void fetchVotes();
    } else {
      setVoteQuestionId(null);
      setVoteCounts([]);
    }
  }, [phase, fetchVotes]);

  // Answer counts update through a private broadcast carrying no answer/PII payload.
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [answerStatsQuestionId, setAnswerStatsQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentQuestion || !roomId) return;
    const questionId = currentQuestion.id;
    let cancelled = false;

    const refresh = async () => {
      const { data, error } = await supabase.rpc("get_question_answer_stats", {
        _room_id: roomId,
        _question_id: questionId,
      });
      if (cancelled || error || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      setAnswerStatsQuestionId(questionId);
      setAnsweredCount(Number(row?.answered ?? 0));
      setCorrectCount(Number(row?.correct ?? 0));
      setWrongCount(Number(row?.wrong ?? 0));
    };

    setAnswerStatsQuestionId(null);
    setAnsweredCount(0);
    setCorrectCount(0);
    setWrongCount(0);
    void refresh();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const setup = async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase.channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "answer_count" }, () => void refresh())
        .subscribe();
    };
    void setup();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentQuestion?.id, roomId]);  const activeAnsweredCount = answerStatsQuestionId === currentQuestion?.id ? answeredCount : 0;
  const activeCorrectCount = answerStatsQuestionId === currentQuestion?.id ? correctCount : 0;
  const activeWrongCount = answerStatsQuestionId === currentQuestion?.id ? wrongCount : 0;

  useEffect(() => {
    if (!currentQuestion) return;

    if (phase === "reading" || phase === "answering") {
      fadeOutSfx(400);
      setLastResultSoundKey(null);
      return;
    }

    if (phase !== "result") return;

    const resultKey = `${currentQuestion.id}:${room?.phase_started_at ?? ""}`;
    if (lastResultSoundKey === resultKey) return;

    const isCorrect = currentQuestion.type === "survey" ? null : activeCorrectCount > 0;
    playAnswerSound(isCorrect);
    setLastResultSoundKey(resultKey);
  }, [phase, currentQuestion, room?.phase_started_at, activeCorrectCount, playAnswerSound, fadeOutSfx, lastResultSoundKey]);

  // Game phases and pause/resume are server-authoritative.
  const startGame = async () => {
    if (!roomId || questions.length === 0) return;
    const { error } = await supabase.rpc("host_start_game" as any, { _room_id: roomId });
    if (error) return;
    await fetchRoom();
  };

  const togglePause = async () => {
    if (!room) return;
    await setGameStatus(isPaused ? "playing" : "paused");
  };

  const goPrev = async () => {
    const target = currentQuestionIndex - 1;
    if (target < 0 || !roomId) return;
    await rewindQuestion(target);
    await fetchRoom();
  };

  const goNext = async () => {
    if (!roomId || currentQuestionIndex >= questions.length - 1) return;
    await supabase.rpc("host_set_next_question", {
      _room_id: roomId,
      _expected_index: currentQuestionIndex,
      _to_index: currentQuestionIndex + 1,
    });
    await fetchRoom();
  };

  if (loading || !room) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const connectedPlayers = players.filter((p) => p.is_connected);
  const isLobby = phase === "idle" || currentQuestionIndex < 0;
  const isFinished = room.status === "finished" || phase === "stats";
  const isLeaderboardPhase = phase === "leaderboard";

  useEffect(() => {
    if (!roomId || (!isLeaderboardPhase && !isFinished)) return;
    let alive = true;
    void fetchLeaderboard(10).then((rows) => {
      if (alive) setLeaderboardRows(rows.map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        score: r.score,
        rank: r.rank,
      })));
    });
    return () => { alive = false; };
  }, [roomId, isLeaderboardPhase, isFinished, fetchLeaderboard]);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const activeVoteCounts = voteQuestionId === currentQuestion?.id
    ? voteCounts
    : currentQuestion?.options.map(() => 0) ?? [];
  const totalVotes = activeVoteCounts.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(1, ...activeVoteCounts);

  const displayNameFor = (p: any) => p.nickname || p.display_name || "שחקן";

  return (
    <div className={`h-screen bg-gradient-to-br from-[#05060f] via-[#0a0d24] to-[#100926] text-white overflow-hidden relative ${cursorHidden ? "cursor-none [&_*]:cursor-none" : ""}`} dir="rtl">
      {/* Projector controls — bottom-left, fade out with the cursor */}
      <div
        className={`absolute bottom-3 left-3 z-50 flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/15 rounded-2xl px-3 py-2 transition-opacity duration-500 ${cursorHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        dir="ltr"
      >
        <button
          onClick={() => setMuted((m) => !m)}
          className="p-1.5 rounded-lg hover:bg-white/15 text-white"
          title={muted ? "בטל השתקה" : "השתק"}
          aria-label={muted ? "בטל השתקה" : "השתק"}
        >
          {muted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-300" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <input
          type="range" min={0} max={1} step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => { setVolume(Number(e.target.value)); if (muted) setMuted(false); }}
          className="w-28 accent-cyan-400"
          aria-label="עוצמת שמע"
        />
        <span className="font-mono text-xs text-white/70 w-9 text-center">{muted ? 0 : Math.round(volume * 100)}%</span>
        <div className="w-px h-6 bg-white/20" />
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg hover:bg-white/15 text-white"
          title={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
          aria-label={isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      {/* Top exit */}
      <button
        onClick={() => navigate(`/admin?room=${roomId}`)}
        className="absolute top-4 left-4 z-50 text-white/40 hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <LogOut className="w-4 h-4" /> יציאה
      </button>

      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {isFinished ? (
          /* ========= WINNERS / FINAL ========= */
          <motion.div
            key="final"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative h-screen overflow-hidden flex flex-col items-center justify-center px-6 py-6"
          >
            <motion.h1
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-4xl md:text-6xl font-display font-black mb-2 shrink-0 bg-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent"
            >
              🏆 המשחק הסתיים!
            </motion.h1>
            <p className="text-xl text-white/60 mb-4 font-display shrink-0">המנצחים</p>

            {/* Podium top 3 */}
            <div className="flex items-end justify-center gap-4 md:gap-8 mb-4 w-full max-w-4xl shrink-0">
              {[2, 1, 3].map((rankIdx, place) => {
                const p = leaderboardRows.find((row) => row.rank === rankIdx);
                if (!p) return <div key={rankIdx} className="w-1/3" />;
                const heights = ["h-[14vh]", "h-[20vh]", "h-[10vh]"];
                const colors = [
                  "from-slate-300 to-slate-500",
                  "from-amber-300 to-yellow-500",
                  "from-orange-400 to-amber-700",
                ];
                const medals = ["🥈", "🥇", "🥉"];

                return (
                  <motion.div
                    key={p.user_id}
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 + place * 0.15, type: "spring" }}
                    className="flex-1 flex flex-col items-center"
                  >
                    <div className="text-5xl md:text-6xl mb-2">{medals[place]}</div>
                    <div className="text-lg md:text-2xl font-display font-bold text-white mb-1 text-center">
                      {p.display_name}
                    </div>
                    <div className="font-mono text-3xl md:text-4xl font-black text-cyan-300 mb-2">
                      {p.score}
                    </div>
                    <div className={`w-full ${heights[place]} rounded-t-2xl bg-gradient-to-t ${colors[place]} shadow-2xl flex items-start justify-center pt-3`}>
                      <span className="text-white/90 font-display font-black text-3xl">
                        {rankIdx}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Rest of the leaderboard */}
            {leaderboardRows.length > 3 && (
              <div className="w-full max-w-2xl space-y-2 min-h-0 overflow-y-auto">
                {leaderboardRows.filter((p) => p.rank > 3).map((p) => (
                  <div
                    key={p.user_id}
                    className="flex items-center justify-between bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-white/60 w-6 text-center">{p.rank}</span>
                      <span className="font-display text-lg text-white">{p.display_name}</span>
                    </div>
                    <span className="font-mono text-xl font-bold text-cyan-300">{p.score}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => navigate(`/admin?room=${roomId}`)}
              className="mt-4 shrink-0 bg-gradient-to-r from-fuchsia-500 to-cyan-500 hover:scale-105 active:scale-95 transition-transform text-white text-lg font-display font-bold px-8 py-3 rounded-2xl shadow-2xl shadow-fuchsia-500/40"
            >
              חזרה לניהול
            </button>
          </motion.div>
        ) : isLeaderboardPhase ? (
          /* ========= MID-GAME LEADERBOARD ========= */
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative h-screen overflow-hidden flex flex-col items-center justify-center px-8 py-6"
          >
            <motion.h2
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-4xl md:text-6xl font-display font-black mb-4 md:mb-6 shrink-0 bg-gradient-to-r from-amber-300 to-fuchsia-400 bg-clip-text text-transparent"
            >
              🏅 טבלת דירוג
            </motion.h2>
            <div className="w-full max-w-3xl space-y-2 min-h-0 overflow-y-auto">
              {leaderboardRows.map((p, i) => (
                <motion.div
                  key={p.user_id}
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex items-center justify-between rounded-2xl px-5 py-2.5 border ${
                    i === 0
                      ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-400/50 shadow-lg shadow-amber-500/20"
                      : i === 1
                      ? "bg-gradient-to-r from-slate-300/15 to-slate-400/10 border-slate-300/40"
                      : i === 2
                      ? "bg-gradient-to-r from-orange-500/15 to-amber-700/10 border-orange-400/40"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-2xl font-black text-white/70 w-8 text-center">
                      {p.rank}
                    </span>
                    <span className="font-display text-xl md:text-2xl font-bold text-white">
                      {p.display_name}
                    </span>
                  </div>
                  <span className="font-mono text-2xl md:text-3xl font-black text-cyan-300">
                    {p.score}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : isLobby ? (
          /* ========= LOBBY ========= */
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative h-screen overflow-hidden flex flex-col items-center justify-center px-8 py-6"
          >
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center mb-4 shrink-0"
            >
              <h1 className="text-4xl md:text-6xl font-display font-black mb-4 tracking-tight bg-gradient-to-r from-fuchsia-400 via-violet-300 to-cyan-400 bg-clip-text text-transparent">
                הצטרפו למשחק!
              </h1>
              <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl px-10 py-8 shadow-2xl">
                  <div className="flex items-center justify-center gap-3 mb-3 text-white/60 text-lg">
                    <Phone className="w-6 h-6" /> חייגו
                  </div>
                  <div className="font-mono text-5xl md:text-6xl font-bold tracking-wider text-white">
                    {PHONE_NUMBER}
                  </div>
                </div>
                <div className="text-5xl text-white/40 hidden md:block">←</div>
                <div className="bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 backdrop-blur-xl border border-fuchsia-400/40 rounded-3xl px-10 py-8 shadow-2xl shadow-fuchsia-500/30">
                  <div className="text-white/60 text-lg mb-3 text-center">קוד חדר</div>
                  <motion.div
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="font-mono text-6xl md:text-8xl font-black tracking-[0.4em] text-white drop-shadow-[0_0_30px_rgba(217,70,239,0.6)]"
                  >
                    {roomCode}
                  </motion.div>
                </div>
              </div>
            </motion.div>

            <div className="flex items-center justify-center gap-6 mt-2 mb-3 shrink-0 flex-wrap">
              <div className="bg-white/5 backdrop-blur-xl border border-cyan-400/20 rounded-3xl px-7 py-4 flex items-center gap-5">
                <div>
                  <div className="text-lg font-display font-bold text-cyan-200 mb-1">או השתתפו דרך Google</div>
                  <div className="text-sm text-white/60">סרקו את הקוד, התחברו עם Google והזינו את קוד החדר.</div>
                </div>
                <QRInvite roomCode={roomCode} />
              </div>
            </div>

            {/* Players grid */}
            <div className="w-full max-w-6xl mt-2 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-3 text-2xl font-display">
                  <Users className="w-7 h-7 text-cyan-400" />
                  <span>משתתפים מחוברים</span>
                </div>
                <div className="text-3xl font-mono font-bold text-cyan-400">
                  {connectedPlayers.length}
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 min-h-0 overflow-y-auto">
                <AnimatePresence>
                  {connectedPlayers.map((p) => (
                    <motion.div
                      key={p.user_id}
                      layout
                      initial={{ opacity: 0, scale: 0.5, y: 30 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                      className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-center shadow-lg"
                    >
                      <div className="text-3xl mb-2">{p.is_phone ? "📞" : "💻"}</div>
                      <div className="font-mono text-base md:text-lg font-bold text-white tracking-wider">
                        {displayNameFor(p)}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {connectedPlayers.length === 0 && (
                <div className="text-center text-white/40 text-xl py-12">
                  ממתין לשחקנים להתחבר...
                </div>
              )}
            </div>

            {/* Start button */}
            <motion.button
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              onClick={startGame}
              disabled={questions.length === 0}
              className="mt-4 shrink-0 bg-gradient-to-r from-fuchsia-500 to-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform text-white text-2xl font-display font-bold px-12 py-5 rounded-2xl shadow-2xl shadow-fuchsia-500/40 flex items-center gap-3"
            >
              <Play className="w-7 h-7" />
              התחל משחק
            </motion.button>
          </motion.div>
        ) : (
          /* ========= QUESTION / RESULT ========= */
          <motion.div
            key={`q-${currentQuestionIndex}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative h-screen max-h-screen overflow-hidden flex flex-col px-4 md:px-8 py-3 md:py-4"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between mb-2 md:mb-3 gap-3 flex-wrap">

              <div className="text-xl font-display text-white/60">
                שאלה <span className="text-white font-bold">{currentQuestionIndex + 1}</span> / {questions.length}
              </div>

              {/* Host controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={goPrev}
                  disabled={currentQuestionIndex <= 0}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="שאלה קודמת (איפוס ניקוד)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  onClick={togglePause}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors ${
                    isPaused
                      ? "bg-fuchsia-500/30 border-fuchsia-400/60 text-fuchsia-200"
                      : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                  }`}
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span className="font-display text-sm">{isPaused ? "המשך" : "השהה"}</span>
                </button>
                <button
                  onClick={goNext}
                  disabled={currentQuestionIndex >= questions.length - 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="שאלה הבאה"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              <motion.div
                animate={{ scale: activeAnsweredCount > 0 ? [1, 1.1, 1] : 1 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-cyan-400/40 rounded-2xl px-4 py-2 shadow-lg shadow-cyan-500/20"
              >
                <Users className="w-6 h-6 text-cyan-300" />
                <span className="font-mono text-2xl md:text-3xl font-black text-cyan-300 drop-shadow-[0_0_15px_rgba(103,232,249,0.6)]">
                  {activeAnsweredCount}
                </span>
                <span className="text-xl md:text-2xl text-white/70 font-display">/ {connectedPlayers.length}</span>
                <span className="mr-1 text-base md:text-lg text-white/80 font-display">ענו</span>
              </motion.div>
            </div>

            {currentQuestion && (
              <TelephoneQuestionStage
                question={currentQuestion as any}
                phase={phase}
                timeLeft={timeLeft}
                totalTime={totalTime}
                voteCounts={activeVoteCounts}
                correctCount={activeCorrectCount}
                wrongCount={activeWrongCount}
              />
            )}


            {/* Pause overlay */}
            {isPaused && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center space-y-4"
                >
                  <Pause className="w-20 h-20 text-fuchsia-300 mx-auto drop-shadow-[0_0_30px_rgba(232,121,249,0.6)]" />
                  <p className="text-4xl md:text-5xl font-display font-black bg-gradient-to-r from-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                    המשחק מושהה
                  </p>
                  <button
                    onClick={togglePause}
                    className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 hover:scale-105 active:scale-95 transition-transform text-white text-xl font-display font-bold px-8 py-3 rounded-2xl shadow-2xl shadow-fuchsia-500/40 inline-flex items-center gap-2"
                  >
                    <Play className="w-5 h-5" /> המשך משחק
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TelephoneHost;
