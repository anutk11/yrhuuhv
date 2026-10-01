import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, X, Lock } from "lucide-react";

interface QuestionCardProps {
  question: string;
  options: string[];
  phase: "reading" | "answering" | "result";
  selectedAnswer: number | null;
  correctIndex: number;
  onAnswer: (index: number) => void;
  answerVariants: readonly ["answer-red", "answer-blue", "answer-green", "answer-orange"];
  isSurvey: boolean;
  mediaUrl?: string;
  mediaType?: string;
  keepImage?: boolean;
  onVideoEnd?: () => void;
}

const QuestionCard = ({
  question,
  options,
  phase,
  selectedAnswer,
  correctIndex,
  onAnswer,
  answerVariants,
  isSurvey,
  mediaUrl,
  mediaType,
  keepImage,
  onVideoEnd,
}: QuestionCardProps) => {
  const [videoEnded, setVideoEnded] = useState(false);

  // Reset videoEnded when question changes
  useEffect(() => {
    setVideoEnded(false);
  }, [question]);

  const handleVideoEnd = useCallback(() => {
    setVideoEnded(true);
    onVideoEnd?.();
  }, [onVideoEnd]);

  const isVideoReading = mediaType === "video" && !videoEnded && phase === "reading";
  const isImageReading = mediaType === "image" && phase === "reading";
  const showQuestion = !isVideoReading && !isImageReading;

  return (
    <motion.div
      className="w-full max-w-2xl"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Fullscreen Video during reading */}
      {mediaUrl && isVideoReading && (
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
          <video
            src={mediaUrl}
            autoPlay
            onEnded={handleVideoEnd}
            className="max-h-full max-w-full object-contain"
            playsInline
          />
        </div>
      )}

      {/* Fullscreen Image during reading */}
      {mediaUrl && isImageReading && (
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
          <img src={mediaUrl} alt="" className="max-h-full max-w-full object-contain rounded-xl" />
        </div>
      )}

      {/* Question + answers (shown after media phase) */}
      {showQuestion && (
        <>
          <div className="gradient-card border border-border rounded-2xl p-6 md:p-8 mb-6 text-center">
            {/* Keep image visible alongside question if keepImage is true */}
            {mediaUrl && mediaType === "image" && keepImage && phase !== "reading" && (
              <img src={mediaUrl} alt="" className="max-h-48 mx-auto rounded-xl mb-4 object-contain" />
            )}
            {/* Show video controls after it ended */}
            {mediaUrl && mediaType === "video" && videoEnded && (
              <video src={mediaUrl} controls className="max-h-48 mx-auto rounded-xl mb-4" playsInline />
            )}
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground leading-relaxed">
              {question}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((option, i) => {
              const isSelected = selectedAnswer === i;
              const isCorrect = correctIndex === i;
              const showResult = phase === "result" && !isSurvey;
              const disabled = phase !== "answering" || selectedAnswer !== null;

              const isResultCorrect = showResult && isCorrect;
              const isResultWrong = showResult && isSelected && !isCorrect;

              let extraClass = "";
              if (isResultCorrect) extraClass = "!bg-answer-green !border-answer-green !text-white shadow-[0_0_20px_hsl(var(--answer-green)/0.4)]";
              if (isResultWrong) extraClass = "!bg-destructive/70 !border-destructive !text-white opacity-80";

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={
                    isResultCorrect
                      ? { opacity: 1, y: 0, scale: [1, 1.08, 1] }
                      : isResultWrong
                        ? { opacity: 1, y: 0, scale: 1, x: [0, -6, 6, -4, 4, -2, 2, 0] }
                        : { opacity: 1, y: 0, scale: 1 }
                  }
                  transition={
                    isResultCorrect
                      ? { duration: 0.5, type: "spring", stiffness: 300, damping: 15 }
                      : isResultWrong
                        ? { duration: 0.5, ease: "easeInOut" }
                        : { delay: i * 0.1, type: "spring", stiffness: 260, damping: 20 }
                  }
                  whileHover={!disabled ? { scale: 1.03, y: -2 } : undefined}
                  whileTap={!disabled ? { scale: 0.97 } : undefined}
                >
                  <Button
                    variant={answerVariants[i]}
                    className={`w-full h-16 md:h-20 text-lg md:text-xl rounded-xl relative backdrop-blur-sm transition-colors duration-300 ${extraClass}`}
                    disabled={disabled}
                    onClick={() => onAnswer(i)}
                  >
                    <span className="flex items-center justify-center gap-3">
                      <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/40 text-sm font-bold">
                        {["א", "ב", "ג", "ד"][i]}
                      </span>
                      <span>{option}</span>
                    </span>
                    {isResultCorrect && (
                      <Check aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6" />
                    )}
                    {isResultWrong && (
                      <X aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6" />
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default QuestionCard;
