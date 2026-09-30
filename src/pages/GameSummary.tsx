import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, Star, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate, useSearchParams } from "react-router-dom";
import StatsHighlight from "@/components/game/StatsHighlight";
import type { PlayerGameState } from "@/lib/scoring";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isPhoneUserId, fetchRosterMap, phoneFromUserId, rosterNameForUser } from "@/lib/phoneRoster";

const podiumColors = ["text-primary", "text-answer-orange", "text-answer-blue"];
const podiumIcons = [Trophy, Medal, Medal];
const podiumHeights = ["h-32", "h-24", "h-20"];
const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd

interface SummaryPlayer {
  user_id: string;
  display_name: string;
  nickname: string;
  score: number;
  correct_answers: number;
  total_answers: number;
  total_time_ms: number;
  fastest_ms: number;
  best_streak: number;
}

const GameSummary = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("room");
  const { user, isAdmin } = useAuth();
  const [players, setPlayers] = useState<SummaryPlayer[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [saved, setSaved] = useState(false);
  const endMusicRef = useRef<HTMLAudioElement | null>(null);

  // Play end-game music
  useEffect(() => {
    if (!roomId) return;
    const loadAndPlay = async () => {
      const { data: roomData } = await supabase
        .from("game_rooms")
        .select("settings")
        .eq("id", roomId)
        .single();
      const s = roomData?.settings as any;
      const endUrl = s?.end_music_url;
      if (endUrl) {
        const audio = new Audio(endUrl);
        audio.volume = 0.7;
        endMusicRef.current = audio;
        audio.play().catch(() => {});
      }
    };
    loadAndPlay();
    return () => { endMusicRef.current?.pause(); };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) { setLoading(false); return; }

    const loadSummary = async () => {
      // Fetch questions count
      const { data: qs } = await supabase
        .from("public_questions" as any)
        .select("id")
        .eq("room_id", roomId);
      setTotalQuestions(qs?.length || 0);

      const { data: summaryRows, error: summaryError } = await supabase.rpc("get_game_summary", {
        _room_id: roomId,
      });

      if (summaryError || !summaryRows) {
        toast.error("שגיאה בטעינת סיכום המשחק");
        setLoading(false);
        return;
      }

      const rows = Array.isArray(summaryRows) ? summaryRows : [summaryRows];
      const phoneIds = rows
        .filter((p: any) => isPhoneUserId(p.user_id))
        .map((p: any) => phoneFromUserId(p.user_id) || "")
        .filter(Boolean);
      const roster = isAdmin ? await fetchRosterMap(phoneIds) : new Map<string, string>();

      const summaryPlayers: SummaryPlayer[] = rows.map((p: any) => {
        const rosterName = isPhoneUserId(p.user_id) ? rosterNameForUser(p.user_id, roster) : null;
        const phoneFallback = isPhoneUserId(p.user_id) ? (phoneFromUserId(p.user_id) || "טלפון") : "אורח";
        return {
          user_id: p.user_id,
          display_name: rosterName || p.display_name || phoneFallback,
          nickname: rosterName || p.nickname || "",
          score: Number(p.score ?? 0),
          correct_answers: Number(p.correct_answers ?? 0),
          total_answers: Number(p.total_answers ?? 0),
          total_time_ms: Number(p.total_time_ms ?? 0),
          fastest_ms: Number(p.fastest_ms ?? 0),
          best_streak: Number(p.best_streak ?? 0),
        };
      });

      setPlayers(summaryPlayers);
      setLoading(false);
    };

    loadSummary();
  }, [roomId]);

  const top3 = players.slice(0, 3);

  const displayPlayers: PlayerGameState[] = players.map((p) => ({
    id: p.user_id,
    name: p.nickname || p.display_name,
    totalScore: p.score,
    correctAnswers: p.correct_answers,
    totalAnswerTime: p.total_time_ms / 1000,
    questionsAnswered: p.total_answers,
    fastestAnswer: p.fastest_ms / 1000,
    currentStreak: 0,
    bestStreak: p.best_streak,
  }));

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-display font-bold gradient-neon-text mb-2">
            סיכום המשחק
          </h1>
          <p className="text-muted-foreground">{totalQuestions} שאלות • {players.length} משתתפים</p>
        </motion.div>

        {/* Podium */}
        {top3.length > 0 && (
          <motion.div
            className="flex items-end justify-center gap-4 mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {podiumOrder.map((rank) => {
              const player = top3[rank];
              if (!player) return null;
              const Icon = podiumIcons[rank];
              return (
                <motion.div
                  key={rank}
                  className="flex flex-col items-center"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + rank * 0.2 }}
                >
                  <Icon className={`w-6 h-6 mb-2 ${podiumColors[rank]}`} />
                  <p className="font-display text-sm font-bold text-foreground mb-1">
                    {player.nickname || player.display_name}
                  </p>
                  <p className={`font-display text-lg font-bold ${podiumColors[rank]}`}>{player.score}</p>
                  <div
                    className={`${podiumHeights[rank]} w-24 rounded-t-xl mt-2 flex items-center justify-center ${
                      rank === 0
                        ? "bg-primary/20 border-2 border-primary box-glow"
                        : rank === 1
                        ? "bg-answer-orange/20 border border-answer-orange/30"
                        : "bg-answer-blue/20 border border-answer-blue/30"
                    }`}
                  >
                    <span className={`font-display text-3xl font-bold ${podiumColors[rank]}`}>{rank + 1}</span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Stats highlights */}
        {displayPlayers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="mb-8"
          >
            <h2 className="font-display text-lg text-foreground mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-answer-orange" />
              הישגים בולטים
            </h2>
            <StatsHighlight players={displayPlayers} />
          </motion.div>
        )}

        {/* Full leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="mb-8"
        >
          <h2 className="font-display text-lg text-foreground mb-4">דירוג מלא</h2>
          <div className="space-y-2">
            {players.map((player, i) => (
              <div
                key={player.user_id}
                className={`flex items-center gap-4 p-3 rounded-xl border ${
                  i === 0 ? "gradient-card border-primary/30" : "bg-secondary border-border"
                }`}
              >
                <span className={`font-display text-lg font-bold w-8 text-center ${
                  i === 0 ? "text-primary" : i === 1 ? "text-answer-orange" : i === 2 ? "text-answer-blue" : "text-muted-foreground"
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-foreground text-sm font-medium">{player.nickname || player.display_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {player.correct_answers}/{player.total_answers} נכונות
                    {player.total_answers > 0 && ` • ממוצע ${(player.total_time_ms / player.total_answers / 1000).toFixed(1)} שנ׳`}
                  </p>
                </div>
                {player.best_streak >= 3 && (
                  <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                    🔥 {player.best_streak}
                  </span>
                )}
                <span className="font-display text-lg font-bold text-foreground">{player.score}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Save as template */}
        {isAdmin && !saved && (
          <motion.div
            className="gradient-card border border-border rounded-xl p-4 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
          >
            <h3 className="font-display text-sm text-foreground mb-3 flex items-center gap-2">
              <Save className="w-4 h-4 text-primary" />
              שמור משחק כתבנית
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="שם התבנית..."
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="bg-secondary border-border flex-1"
              />
              <Button variant="neon-outline" size="sm" disabled={!templateName.trim()} onClick={async () => {
                if (!user || !roomId) return;
                const { data: qs } = await supabase.from("questions").select("*").eq("room_id", roomId).order("sort_order");
                const { data: room } = await supabase.from("game_rooms").select("settings").eq("id", roomId).single();
                const { error } = await supabase.from("game_templates").insert({
                  created_by: user.id,
                  template_name: templateName.trim(),
                  settings: room?.settings || {},
                  questions: (qs || []).map((q: any) => ({
                    text: q.question_text, options: q.options, correctIndex: q.correct_index,
                    type: q.question_type, timeLimit: q.time_limit, mediaUrl: q.media_url,
                    mediaType: q.media_type, imageViewTime: q.image_view_time, keepImage: q.keep_image,
                  })),
                } as any);
                if (error) { toast.error("שגיאה בשמירה"); return; }
                toast.success("המשחק נשמר כתבנית!");
                setSaved(true);
              }}>
                <Save className="w-3.5 h-3.5" />
                שמור
              </Button>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          className="flex gap-3 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <Button variant="neon" onClick={() => navigate("/")}>
            חזור לדף הבית
          </Button>
          <Button variant="neon-outline" onClick={() => navigate("/admin")}>
            משחק חדש
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default GameSummary;
