import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Eye, Pause, Play, LogOut, ChevronRight, ChevronLeft } from "lucide-react";
import GameTimer from "@/components/game/GameTimer";
import QuestionCard from "@/components/game/QuestionCard";
import Leaderboard from "@/components/game/Leaderboard";
import SurveyResults from "@/components/game/SurveyResults";
import StatsHighlight from "@/components/game/StatsHighlight";
import AnswerFeedback from "@/components/game/AnswerFeedback";
import AnswerStats from "@/components/game/AnswerStats";
import RoomClosedOverlay from "@/components/game/RoomClosedOverlay";
import { useGameSync } from "@/hooks/useGameSync";
import { useAuth } from "@/contexts/AuthContext";
import { useGameAudio } from "@/hooks/useGameAudio";
import { createPlayerState, type PlayerGameState } from "@/lib/scoring";
import { supabase } from "@/integrations/supabase/client";
import { getPhaseDuration, type GamePhase } from "@/lib/gamePhases";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const GamePlay = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("room");
  const isObserverMode = searchParams.get("observe") === "1";
  const { user } = useAuth();

  const {
    room,
    questions,
    players,
    currentQuestion,
    currentQuestionIndex,
    myAnswer,
    loading,
    loadError,
    reloadAll,
    submitAnswer,
    rewindQuestion,
    setGameStatus,
    fetchRoom,
    fetchLeaderboard,
  } = useGameSync(roomId);

  const [lastScoreGain, setLastScoreGain] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [surveyVotes, setSurveyVotes] = useState<number[]>([]);
  const [leaderboardRows, setLeaderboardRows] = useState<Array<{ user_id: string; display_name: string; score: number; rank: number; total_players: number; is_me: boolean }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const isPaused = room?.status === "paused";

  const isHost = user?.id === room?.host_id;
  const phase = (room?.current_phase || (currentQuestionIndex >= 0 ? "reading" : "idle")) as GamePhase;
  const totalTime = room?.phase_duration_seconds || getPhaseDuration(currentQuestion, phase, room?.settings);

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
  });
  const timeLeft = useMemo(() => {
    if (!room || phase === "idle") return 0;
    if (room.phase_ends_at) {
      return Math.max(0, Math.ceil((new Date(room.phase_ends_at).getTime() - (now + serverOffsetMs)) / 1000));
    }
    if (!room.phase_started_at) return totalTime;
    const endAt = new Date(room.phase_started_at).getTime() + totalTime * 1000;
    return Math.max(0, Math.ceil((endAt - (now + serverOffsetMs)) / 1000));
  }, [room, phase, totalTime, now, serverOffsetMs]);

  const fetchSurveyVotes = useCallback(async () => {
    if (!currentQuestion || !roomId) return;
    const { data, error } = await supabase.rpc("get_answer_counts" as any, {
      _room_id: roomId,
      _question_id: currentQuestion.id,
    });
    if (error) return;
    const counts = Array(currentQuestion.options.length).fill(0) as number[];
    for (const row of Array.isArray(data) ? data : []) {
      const index = Number((row as any).selected_index);
      if (Number.isInteger(index) && index >= 0 && index < counts.length) {
        counts[index] = Number((row as any).count ?? 0);
      }
    }
    setSurveyVotes(counts);
  }, [currentQuestion, roomId]);

  useEffect(() => {
    if (currentQuestionIndex >= 0 && currentQuestion) {
      setLastScoreGain(0);
      setLastCorrect(null);
    }
  }, [currentQuestionIndex, currentQuestion]);

  // Play answer sound when result phase starts
  useEffect(() => {
    if (phase === "result" && lastCorrect !== null) {
      playAnswerSound(lastCorrect);
    } else if (phase === "reading" || phase === "answering") {
      // Fade out answer SFX when transitioning to next question
      fadeOutSfx(400);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "survey-result") {
      void fetchSurveyVotes();
    }
  }, [phase, fetchSurveyVotes]);

  useEffect(() => {
    let alive = true;
    const syncServerClock = async () => {
      const { data } = await supabase.rpc("server_now" as any);
      const serverNow = Array.isArray(data) ? data[0] : data;
      if (alive && serverNow) setServerOffsetMs(new Date(serverNow as string).getTime() - Date.now());
    };
    void syncServerClock();

    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    const refreshClock = window.setInterval(() => void syncServerClock(), 60000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.clearInterval(refreshClock);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    if (room?.status === "finished" && currentQuestionIndex >= 0) {
      navigate("/summary" + (roomId ? `?room=${roomId}` : ""));
    }
  }, [room?.status, currentQuestionIndex, navigate, roomId]);

  // Handle video end - move from reading to answering
  const handleVideoEnd = useCallback(async () => {
    if (phase !== "reading" || !roomId) return;
    await supabase.rpc("video_ended" as any, { _room_id: roomId });
  }, [phase, roomId]);

  const handleAnswer = async (index: number) => {
    if ((phase !== "answering" && phase !== "reading") || myAnswer !== null || isObserverMode || isPaused) return;
    const result = await submitAnswer(index);
    if (result !== undefined) {
      setLastScoreGain(result.score);
      setLastCorrect(result.isCorrect);
    }
  };

  useEffect(() => {
    if (phase !== "leaderboard" || !roomId) return;
    let alive = true;
    void fetchLeaderboard(10).then((rows) => {
      if (alive) setLeaderboardRows(rows);
    });
    return () => { alive = false; };
  }, [phase, roomId, fetchLeaderboard]);

  const answerVariants = ["answer-red", "answer-blue", "answer-green", "answer-orange"] as const;

  const displayPlayers: PlayerGameState[] = players.map((p) => ({
    ...createPlayerState(p.user_id, p.nickname || p.display_name),
    totalScore: p.score,
  }));

  const myScore = players.find(p => p.user_id === user?.id)?.score || 0;

  if (loading || !room) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          {loadError ? (
            <>
              <p className="text-destructive font-display">{loadError}</p>
              <button
                onClick={() => void reloadAll()}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-xl font-display"
              >
                נסה שוב
              </button>
            </>
          ) : (
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" role="status" aria-label="טוען משחק" />
          )}
        </div>
      </div>
    );
  }

  // Room was closed by host
  if (room.status === "finished" && currentQuestionIndex < 0 && !isHost) {
    return <RoomClosedOverlay />;
  }

  if (phase === "idle" || currentQuestionIndex < 0 || !currentQuestion) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">ממתין להתחלת המשחק...</p>
          {isHost && (
            <button
              onClick={async () => {
                if (!roomId) return;
                const { error } = await supabase.rpc("host_start_game" as any, { _room_id: roomId });
                if (error) return;
                await fetchRoom();
              }}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-display"
            >
              התחל את המשחק!
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col" dir="rtl">
      {/* Host controls banner */}
      {isHost && (
        <div className="bg-accent/10 border-b border-accent/30 px-4 py-2 flex items-center justify-between text-sm font-display">
          <div className="flex items-center gap-2 text-accent">
            <Eye className="w-4 h-4" />
            {isObserverMode ? "מצב צפייה" : "מנחה + משתתף"}
          </div>
          <div className="flex items-center gap-2">
            {/* Manual nav controls */}
            {currentQuestionIndex >= 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    const targetIndex = currentQuestionIndex - 1;
                    if (targetIndex < 0 || !roomId) return;

                    await rewindQuestion(targetIndex);
                  }}
                  disabled={currentQuestionIndex <= 0}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="שאלה קודמת"
                  title="שאלה קודמת (איפוס)"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (!roomId || user?.id !== room?.host_id || currentQuestionIndex >= questions.length - 1) return;
                    await supabase.rpc("host_set_next_question", {
                      _room_id: roomId,
                      _expected_index: currentQuestionIndex,
                      _to_index: currentQuestionIndex + 1,
                    });
                    await fetchRoom();
                  }}
                  disabled={currentQuestionIndex >= questions.length - 1}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="שאלה הבאה"
                  title="שאלה הבאה"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Pause button */}
            <button
              onClick={async () => {
                await setGameStatus(isPaused ? "playing" : "paused");
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                isPaused ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {isPaused ? "המשך" : "השהה"}
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExitDialogOpen(true)}
            aria-label="יציאה מהמשחק"
            className="text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
            title="יציאה"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-display text-primary">{currentQuestionIndex + 1}</span>
            <span>/ {questions.length}</span>
          </div>
        </div>
        {currentQuestion.type === "survey" && phase !== "leaderboard" && phase !== "stats" && (
          <span className="text-xs bg-accent/20 text-accent px-3 py-1 rounded-full font-display">
            סקר
          </span>
        )}
        <div className="flex items-center gap-3">
          {!isObserverMode && (
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-answer-orange" />
              <span className="font-display text-foreground">{myScore}</span>
            </div>
          )}
        </div>
      </div>

      {/* Timer */}
      <GameTimer
        timeLeft={timeLeft}
        totalTime={totalTime}
        phase={phase}
      />

      {/* Content */}
      {/* Floating answer stats on left side */}
      {currentQuestion && (phase === "answering" || phase === "result" || phase === "survey-result") && (
        <div className="w-full max-w-md mb-3 sm:mb-0 sm:fixed sm:left-4 sm:top-1/2 sm:-translate-y-1/2 z-40 bg-card/90 backdrop-blur-md border border-border rounded-2xl p-3 sm:p-4 shadow-lg sm:min-w-[120px]">
          <AnswerStats
            questionId={currentQuestion.id}
            roomId={roomId}
            totalPlayers={players.filter(p => p.is_connected).length}
            phase={phase}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 relative">
        {/* Pause overlay */}
        {isPaused && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Pause className="w-12 h-12 text-primary mx-auto" />
              <p className="font-display text-xl text-foreground">המשחק מושהה</p>
              {isHost && (
                <button
                  onClick={async () => {
                    await setGameStatus("playing");
                  }}
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-display text-sm"
                >
                  המשך משחק
                </button>
              )}
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {phase === "leaderboard" ? (
            <Leaderboard
              key="leaderboard"
              players={leaderboardRows.map((p) => ({
                userId: p.user_id,
                name: p.display_name,
                score: p.score,
                rank: p.rank,
                fastest: false,
                isMe: p.is_me,
              }))}
            />
          ) : phase === "survey-result" ? (
            <SurveyResults
              key={`survey-${currentQuestion.id}`}
              question={currentQuestion.text}
              options={currentQuestion.options}
              votes={surveyVotes.length > 0 ? surveyVotes : currentQuestion.options.map(() => 0)}
              chartType={currentQuestionIndex % 2 === 0 ? "bar" : "pie"}
            />
          ) : phase === "stats" ? (
            <motion.div
              key="stats"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-lg"
            >
              <h2 className="text-2xl font-display font-bold text-center mb-6 text-glow text-primary">
                הישגים בולטים
              </h2>
              <StatsHighlight players={displayPlayers} />
            </motion.div>
          ) : (
            <div key={currentQuestion.id} className="w-full flex flex-col items-center">
              <QuestionCard
                question={currentQuestion.text}
                options={currentQuestion.options}
                phase={phase === "result" ? "result" : phase === "reading" ? "reading" : "answering"}
                selectedAnswer={myAnswer}
                correctIndex={currentQuestion.correctIndex}
                onAnswer={handleAnswer}
                answerVariants={answerVariants}
                isSurvey={currentQuestion.type === "survey"}
                mediaUrl={currentQuestion.mediaUrl}
                mediaType={currentQuestion.mediaType}
                keepImage={currentQuestion.keepImage}
                onVideoEnd={handleVideoEnd}
              />

              {/* Answer feedback overlay */}
              {phase !== "answering" && phase !== "reading" && myAnswer !== null && !isObserverMode && (
                <AnswerFeedback
                  isCorrect={lastCorrect}
                  scoreGain={lastScoreGain}
                  isSurvey={currentQuestion.type === "survey"}
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לצאת מהמשחק?</AlertDialogTitle>
            <AlertDialogDescription>המשחק ימשיך עבור שאר המשתתפים. אפשר לחזור אליו דרך החדר המתאים.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(isHost ? `/admin?room=${roomId}` : "/")}>יציאה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GamePlay;
