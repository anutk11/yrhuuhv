import { motion } from "framer-motion";
import { Trophy, Zap, Target, Flame } from "lucide-react";
import type { PlayerGameState } from "@/lib/scoring";

interface StatsHighlightProps {
  players: PlayerGameState[];
}

const StatsHighlight = ({ players }: StatsHighlightProps) => {
  if (players.length === 0) return null;

  const topScorer = [...players].sort((a, b) => b.totalScore - a.totalScore)[0];
  const fastestPlayer = players
    .filter((p) => p.questionsAnswered > 0)
    .sort((a, b) =>
      a.totalAnswerTime / a.questionsAnswered - b.totalAnswerTime / b.questionsAnswered
    )[0];
  const bestStreak = [...players].sort((a, b) => b.bestStreak - a.bestStreak)[0];
  const bestAccuracy = players
    .filter((p) => p.questionsAnswered > 0)
    .sort((a, b) =>
      b.correctAnswers / b.questionsAnswered - a.correctAnswers / a.questionsAnswered
    )[0];

  const highlights = [
    {
      icon: Trophy,
      label: "ניקוד גבוה ביותר",
      name: topScorer?.name || "-",
      value: `${topScorer?.totalScore || 0} נק׳`,
      color: "text-primary",
      bgColor: "bg-primary/10 border-primary/20",
    },
    {
      icon: Zap,
      label: "המהיר ביותר",
      name: fastestPlayer?.name || "-",
      value: fastestPlayer
        ? `${(fastestPlayer.totalAnswerTime / fastestPlayer.questionsAnswered).toFixed(1)} שנ׳`
        : "-",
      color: "text-answer-orange",
      bgColor: "bg-answer-orange/10 border-answer-orange/20",
    },
    {
      icon: Flame,
      label: "רצף הכי ארוך",
      name: bestStreak?.name || "-",
      value: `${bestStreak?.bestStreak || 0} ברצף`,
      color: "text-destructive",
      bgColor: "bg-destructive/10 border-destructive/20",
    },
    {
      icon: Target,
      label: "דיוק הכי גבוה",
      name: bestAccuracy?.name || "-",
      value: bestAccuracy
        ? `${Math.round((bestAccuracy.correctAnswers / bestAccuracy.questionsAnswered) * 100)}%`
        : "-",
      color: "text-answer-green",
      bgColor: "bg-answer-green/10 border-answer-green/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {highlights.map((h, i) => (
        <motion.div
          key={h.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`rounded-xl border p-4 ${h.bgColor}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <h.icon className={`w-4 h-4 ${h.color}`} />
            <span className="text-xs text-muted-foreground">{h.label}</span>
          </div>
          <p className="font-display text-sm font-bold text-foreground">{h.name}</p>
          <p className={`font-display text-lg font-bold ${h.color}`}>{h.value}</p>
        </motion.div>
      ))}
    </div>
  );
};

export default StatsHighlight;
