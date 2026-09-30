import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipForward,
  Square,
  Users,
  Wifi,
  WifiOff,
  Eye,
} from "lucide-react";

interface Player {
  name: string;
  connected: boolean;
  answered: boolean;
  score: number;
}

interface AdminGameControlProps {
  currentQuestion: number;
  totalQuestions: number;
  players: Player[];
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
}

const AdminGameControl = ({
  currentQuestion,
  totalQuestions,
  players,
  isRunning,
  onStart,
  onPause,
  onResume,
  onSkip,
  onEnd,
}: AdminGameControlProps) => {
  const [isPaused, setIsPaused] = useState(false);
  const connectedCount = players.filter((p) => p.connected).length;
  const answeredCount = players.filter((p) => p.answered).length;

  return (
    <div className="gradient-card border border-border rounded-xl p-4 space-y-4">
      {/* Game status */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          שליטה במשחק
        </h3>
        <span className="font-display text-xs text-primary">
          {currentQuestion}/{totalQuestions}
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!isRunning ? (
          <Button variant="neon" size="sm" className="flex-1" onClick={onStart}>
            <Play className="w-4 h-4" />
            התחל
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => {
                setIsPaused(!isPaused);
                isPaused ? onResume() : onPause();
              }}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {isPaused ? "המשך" : "השהה"}
            </Button>
            <Button variant="secondary" size="sm" onClick={onSkip}>
              <SkipForward className="w-3 h-3" />
            </Button>
            <Button variant="destructive" size="sm" onClick={onEnd}>
              <Square className="w-3 h-3" />
            </Button>
          </>
        )}
      </div>

      {/* Player status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {connectedCount}/{players.length} מחוברים
          </span>
          <span>{answeredCount}/{players.length} ענו</span>
        </div>

        {/* Progress bar for answers */}
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${players.length > 0 ? (answeredCount / players.length) * 100 : 0}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Player list */}
        <div className="max-h-40 overflow-y-auto space-y-1">
          {players.map((player, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {player.connected ? (
                  <Wifi className="w-3 h-3 text-answer-green" />
                ) : (
                  <WifiOff className="w-3 h-3 text-destructive" />
                )}
                <span className="text-foreground">{player.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {player.answered && (
                  <span className="text-answer-green text-[10px]">✓ ענה</span>
                )}
                <span className="font-display text-primary">{player.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminGameControl;
