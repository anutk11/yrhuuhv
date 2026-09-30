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
import { getNextPhaseTransition, getPhaseDuration, getReadingTime, type GamePhase } from "@/lib/gamePhases";

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
    submitAnswer,
    rewindQuestion,
    setGameStatus,
    fetchRoom,
  } = useGameSync(roomId);

  const [lastScoreGain, setLastScoreGain] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [surveyVotes, setSurveyVotes] = useState<number[]>([]);
  const [localPaused, setLocalPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isPaused = room?.status === "paused" || localPaused;
  const phaseTransitionKeyRef = useRef<string | null>(null);
  const isSyncingPhaseRef = useRef(false);

  // Sync localPaused with room status from realtime
  useEffect(() => {
    if (room?.status === "playing") setLocalPaused(false);
    if (room?.status === "paused") setLocalPaused(true);
  }, [room?.status]);

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
    if (!room) return 0;
    if (phase === "idle") return 0;
    if (!room.phase_started_at) return totalTime;

    const endAt = new Date(room.phase_started_at).getTime() + totalTime * 1000;
    return Math.max(0, Math.ceil((endAt - now) / 1000));
  }, [room, phase, totalTime, now]);

  const fetchSurveyVotes = useCallback(async () => {
    if (!currentQuestion || !roomId) return;
    const { data, error } = await supabase.rpc("get_question_answer_stats", {
      _room_id: roomId,
      _question_id: currentQuestion.id,
    });
    if (error || !data) return;
    const row = Array.isArray(data) ? data[0] : data;
    const counts = Array.isArray(row?.vote_counts)
      ? row.vote_counts.map((n: unknown) => Number(n) || 0)
      : [];
    setSurveyVotes(currentQuestion.options.map((_, i) => counts[i] ?? 0));
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
    const tick = () => setNow(Date.now());
    tick();

    const timer = window.setInterval(tick, 250);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    phaseTransitionKeyRef.current = null;
  }, [room?.current_question_index, room?.current_phase, room?.phase_started_at, room?.status]);

  useEffect(() => {
    if (!room || !currentQuestion || currentQuestionIndex < 0 || isPaused || room.status !== "playing") return;
    if (phase === "reading" && currentQuestion.mediaType === "video" && currentQuestion.mediaUrl) return;
    if (timeLeft > 0) return;
    if (!isHost) return; // Only host drives phase transitions

    const transitionKey = `${room.current_question_index}:${room.current_phase}:${room.phase_started_at}`;
    if (phaseTransitionKeyRef.current === transitionKey) return;

    phaseTransitionKeyRef.current = transitionKey;
    void syncPhase();
  }, [room, currentQuestion, currentQuestionIndex, isPaused, phase, timeLeft, syncPhase, isHost]);

  useEffect(() => {
    if (room?.status === "finished" && currentQuestionIndex >= 0) {
      navigate("/summary" + (roomId ? `?room=${roomId}` : ""));
    }
  }, [room?.status, currentQuestionIndex, navigate, roomId]);

  // Handle video end - move from reading to answering
  const handleVideoEnd = useCallback(() => {
    if (phase === "reading") {
      void syncPhase();
    }
  }, [phase, syncPhase]);

  const handleAnswer = async (index: number) => {
    if ((phase !== "answering" && phase !== "reading") || myAnswer !== null || isObserverMode || isPaused) return;
    const score = await submitAnswer(index);
    if (score !== undefined) {
      setLastScoreGain(score);
      const isCorrect = currentQuestion?.type === "trivia" && index === currentQuestion.correctIndex;
      const correctResult = currentQuestion?.type === "survey" ? null : isCorrect;
      setLastCorrect(correctResult);
    }
  };

  const answerVariants = ["answer-red", "answer-blue", "answer-green", "answer-orange"] as const;

  const displayPlayers: PlayerGameState[] = players.map((p) => ({
    ...createPlayerState(p.user_id, p.nickname || p.display_name),
    totalScore: p.score,
  }));

  const myScore = players.find(p => p.user_id === user?.id)?.score || 0;

  if (loading || !room) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                setLocalPaused(false);
                await syncPhase("idle", -1);
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
                    await supabase.from("game_rooms").update({
                      current_phase: "reading",
                      phase_started_at: new Date().toISOString(),
                      phase_duration_seconds: getReadingTime(questions[targetIndex]),
                      status: "playing",
                    }).eq("id", roomId);
                    await fetchRoom();
                  }}
                  disabled={currentQuestionIndex <= 0}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                  title="שאלה הבאה"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Pause button */}
            <button
              onClick={async () => {
                const newPaused = !isPaused;
                setLocalPaused(newPaused);
                await setGameStatus(newPaused ? "paused" : "playing", newPaused
                  ? {
                      phase_started_at: null,
                      phase_duration_seconds: timeLeft,
                    }
                  : {
                      phase_started_at: new Date().toISOString(),
                      phase_duration_seconds: Math.max(timeLeft, 1),
                    });
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
            onClick={() => {
              if (confirm("בטוח שברצונך לצאת מהמשחק?")) {
                navigate(isHost ? `/admin?room=${roomId}` : "/");
              }
            }}
            className="text-muted-foreground hover:text-destructive transition-colors"
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
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 bg-card/90 backdrop-blur-md border border-border rounded-2xl p-4 shadow-lg min-w-[120px]">
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
                    setLocalPaused(false);
                    await setGameStatus("playing", {
                      phase_started_at: new Date().toISOString(),
                      phase_duration_seconds: Math.max(timeLeft, 1),
                    });
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
              players={players
                .sort((a, b) => b.score - a.score)
                .map((p) => ({
                  name: p.nickname || p.display_name,
                  score: p.score,
                  fastest: false,
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
    </div>
  );
};

export default GamePlay;
