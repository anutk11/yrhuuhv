import { motion } from "framer-motion";

export const ANSWER_COLORS = [
  "from-red-300/80 to-rose-400/40",
  "from-blue-300/80 to-indigo-400/40",
  "from-emerald-300/80 to-green-400/40",
  "from-amber-300/80 to-orange-400/40",
];

export const ANSWER_GLOW = [
  "shadow-red-400/20",
  "shadow-blue-400/20",
  "shadow-emerald-400/20",
  "shadow-amber-400/20",
];

export interface StageQuestion {
  text: string;
  options: string[];
  type: string;
  correctIndex: number;
  mediaUrl?: string;
  mediaType?: string;
}

interface TelephoneQuestionStageProps {
  question: StageQuestion;
  phase: string;
  timeLeft: number;
  totalTime: number;
  voteCounts: number[];
  correctCount: number;
  wrongCount: number;
  /** disables entrance animations replays in static preview */
  animate?: boolean;
}

const TelephoneQuestionStage = ({
  question,
  phase,
  timeLeft,
  totalTime,
  voteCounts,
  correctCount,
  wrongCount,
  animate = true,
}: TelephoneQuestionStageProps) => {
  const totalVotes = voteCounts.reduce((a, b) => a + b, 0);
  const isResult = phase === "result" || phase === "survey-result";

  const renderTimer = () => {
    const size = 130;
    const stroke = 11;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const pct = totalTime > 0 ? Math.max(0, Math.min(1, timeLeft / totalTime)) : 0;
    const urgent = timeLeft <= 3;
    const color = urgent ? "rgb(248,113,113)" : "rgb(103,232,249)";

    return (
      <div className="shrink-0 flex items-center justify-center gap-4 md:gap-6 mb-2">
        <motion.div
          animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 1, repeat: urgent ? Infinity : 0 }}
          className="relative"
          style={{ width: size, height: size }}
        >
          <svg width={size} height={size} className="rotate-[-90deg]">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              style={{
                transition: "stroke-dashoffset 1s linear, stroke 0.3s linear",
                filter: `drop-shadow(0 0 14px ${color})`,
              }}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center font-mono font-black text-5xl md:text-6xl"
            style={{ color, textShadow: `0 0 28px ${color}` }}
          >
            {timeLeft}
          </span>
        </motion.div>
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-xl md:text-3xl font-display font-black text-fuchsia-300"
        >
          📱 ענו עכשיו!
        </motion.div>
      </div>
    );
  };

  return (
    <>
      {/* Timer above the question — prominent, never covering content */}
      {phase === "answering" && renderTimer()}

      {/* Question */}
      <div className="shrink-0 text-center mb-2 md:mb-3">
        <motion.h2
          initial={animate ? { scale: 0.9, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          className="text-2xl md:text-4xl lg:text-5xl font-display font-black leading-tight bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent"
        >
          {question.text}
        </motion.h2>
        {question.mediaUrl && question.mediaType === "image" && (
          <img src={question.mediaUrl} className="max-h-[18vh] mx-auto mt-2 rounded-2xl" alt="" />
        )}
        {question.mediaUrl && question.mediaType === "video" && (
          <video src={question.mediaUrl} controls className="max-h-[18vh] mx-auto mt-2 rounded-2xl" />
        )}
      </div>

      {/* Time's up banner */}
      {isResult && (
        <motion.div
          initial={animate ? { scale: 0.5, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="shrink-0 text-center text-3xl md:text-5xl font-display font-black mb-2 md:mb-3 bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent"
        >
          ⏱️ הזמן נגמר!
        </motion.div>
      )}

      {/* Answer options — 4 side by side, fill by percentage */}
      <div className="flex-1 min-h-0 grid grid-cols-4 gap-3 md:gap-4 max-w-[1400px] mx-auto w-full items-center">
        {question.options.map((opt, i) => {
          const isCorrect = isResult && question.type === "trivia" && i === question.correctIndex;
          const isWrong = isResult && question.type === "trivia" && i !== question.correctIndex;
          const count = voteCounts[i] ?? 0;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

          return (
            <motion.div
              key={i}
              initial={animate ? { opacity: 0, y: 30, scale: 0.9 } : false}
              animate={
                isCorrect ? { opacity: 1, y: 0, scale: [1, 1.04, 1] } : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{ delay: i * 0.08, type: "spring", stiffness: 220, damping: 18 }}
              className={`relative overflow-hidden rounded-3xl border-2 shadow-xl shadow-black/20 flex flex-col items-center justify-center aspect-square max-w-[300px] mx-auto w-full bg-gradient-to-br ${ANSWER_COLORS[i]} ${ANSWER_GLOW[i]} backdrop-blur-md ${
                isCorrect
                  ? "border-green-300 ring-4 ring-green-300/50"
                  : isWrong
                    ? "border-white/10 opacity-60"
                    : "border-white/30"
              }`}
            >
              {isResult && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${pct}%` }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 + i * 0.05 }}
                  className="absolute inset-x-0 bottom-0 bg-white/20 backdrop-blur-[1px] border-t-2 border-white/40"
                />
              )}

              <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-1.5 md:gap-2 p-2 md:p-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white/30 flex items-center justify-center font-mono font-black text-lg md:text-xl shrink-0 text-white">
                  {i + 1}
                </div>
                <div className="text-sm md:text-xl lg:text-2xl font-display font-bold text-white leading-tight break-words">
                  {opt}
                </div>
                {isResult && (
                  <div className="font-mono font-black text-white leading-none">
                    <span className="text-2xl md:text-4xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                      {Math.round(pct)}%
                    </span>
                    <span className="block text-xs md:text-sm text-white/80 mt-1">{count} ענו</span>
                  </div>
                )}
              </div>

              {isCorrect && (
                <div className="absolute top-2 right-2 bg-green-400 text-black text-xs font-black px-3 py-1 rounded-full z-10">
                  ✓ נכון
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Big correct/wrong stats below answers (trivia result only) */}
      {phase === "result" && question.type === "trivia" && (
        <motion.div
          initial={animate ? { opacity: 0, y: 20 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="shrink-0 mt-3 flex items-center justify-center gap-4 md:gap-10"
        >
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border-2 border-emerald-400/50 rounded-2xl px-6 py-2 md:py-3 shadow-xl shadow-emerald-500/20 flex items-center gap-3">
            <span className="text-3xl md:text-4xl">✅</span>
            <span className="font-mono text-3xl md:text-5xl font-black text-emerald-300 leading-none">
              {correctCount}
            </span>
            <span className="text-base md:text-xl text-emerald-200/90 font-display">צדקו</span>
          </div>
          <div className="bg-gradient-to-br from-rose-500/20 to-red-600/10 border-2 border-rose-400/50 rounded-2xl px-6 py-2 md:py-3 shadow-xl shadow-rose-500/20 flex items-center gap-3">
            <span className="text-3xl md:text-4xl">❌</span>
            <span className="font-mono text-3xl md:text-5xl font-black text-rose-300 leading-none">
              {wrongCount}
            </span>
            <span className="text-base md:text-xl text-rose-200/90 font-display">טעו</span>
          </div>
        </motion.div>
      )}

      {/* Survey summary (compact — percentages shown inside answers) */}
      {phase === "survey-result" && question.type === "survey" && (
        <motion.div
          initial={animate ? { opacity: 0, y: 15 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="shrink-0 mt-3 flex items-center justify-center gap-4"
        >
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-8 py-2 md:py-3 flex items-center gap-4">
            <span className="text-2xl md:text-3xl">📊</span>
            <span className="text-lg md:text-2xl font-display text-white/80">תוצאות הסקר</span>
            <span className="font-mono text-2xl md:text-4xl font-black text-cyan-300 leading-none">
              {totalVotes}
            </span>
            <span className="text-base md:text-xl text-white/60 font-display">תשובות</span>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default TelephoneQuestionStage;
