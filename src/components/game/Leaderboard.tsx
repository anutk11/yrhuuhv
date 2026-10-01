import { motion } from "framer-motion";
import { Trophy, Zap } from "lucide-react";

interface Player {
  userId?: string;
  name: string;
  score: number;
  rank?: number;
  fastest: boolean;
  isMe?: boolean;
}

interface LeaderboardProps {
  players: Player[];
}

const Leaderboard = ({ players }: LeaderboardProps) => {
  const rows = [...players];

  return (
    <motion.div
      className="w-full max-w-lg"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <h2 className="text-3xl font-display font-bold text-center mb-6 text-glow text-primary">
        טבלת דירוג
      </h2>

      <div className="space-y-3">
        {rows.map((player, i) => {
          const rank = player.rank ?? i + 1;
          return (
            <motion.div
              key={player.userId ?? `${player.name}-${rank}`}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-4 p-4 rounded-xl border ${
                player.isMe
                  ? "gradient-card border-cyan-400/70 ring-1 ring-cyan-400/30"
                  : rank === 1
                  ? "gradient-card border-primary box-glow"
                  : "bg-secondary border-border"
              }`}
            >
              <span className={`font-display text-xl font-bold w-8 text-center ${
                rank === 1 ? "text-primary" : rank === 2 ? "text-answer-orange" : "text-muted-foreground"
              }`}>
                {rank}
              </span>
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {player.name}{player.isMe ? " (אתה)" : ""}
                </p>
              </div>
              {player.fastest && <Zap className="w-4 h-4 text-answer-orange" />}
              {rank === 1 && <Trophy className="w-5 h-5 text-primary" />}
              <span className="font-display text-lg text-foreground">{player.score}</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default Leaderboard;
