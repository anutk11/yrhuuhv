import { motion } from "framer-motion";

interface GameTimerProps {
  timeLeft: number;
  totalTime: number;
  phase: string;
}

const GameTimer = ({ timeLeft, totalTime, phase }: GameTimerProps) => {
  const progress = totalTime > 0 ? Math.max(0, Math.min(100, (timeLeft / totalTime) * 100)) : 0;
  const isUrgent = timeLeft <= 3 && phase === "answering";
  const isAnswering = phase === "answering";

  // Circular timer dimensions
  const size = 64;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="relative">
      {/* Progress bar - smooth CSS transition instead of framer-motion */}
      <div className="w-full h-1.5 bg-secondary">
        <div
          className={`h-full ${isUrgent ? "bg-destructive" : "bg-primary"}`}
          style={{
            width: `${progress}%`,
            transition: "width 1s linear",
            boxShadow: isUrgent ? "0 0 12px hsl(var(--destructive))" : "0 0 8px hsl(var(--primary) / 0.4)",
          }}
        />
      </div>

      {/* Circular countdown - only during answering */}
      {isAnswering && (
        <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
            <svg width={size} height={size} className="drop-shadow-lg">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="hsl(var(--background))"
                stroke="hsl(var(--secondary))"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={isUrgent ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{
                  transition: "stroke-dashoffset 1s linear",
                  filter: isUrgent ? "drop-shadow(0 0 6px hsl(var(--destructive)))" : "drop-shadow(0 0 4px hsl(var(--primary) / 0.5))",
                }}
              />
            </svg>
            <motion.span
              key={timeLeft}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              role="status"
              aria-live="polite"
              aria-label={"נותרו " + timeLeft + " שניות"}
              className={`absolute inset-0 flex items-center justify-center font-display text-xl font-bold ${
                isUrgent ? "text-destructive" : "text-primary"
              }`}
            >
              {timeLeft}
            </motion.span>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default GameTimer;
