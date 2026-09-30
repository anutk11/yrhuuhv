import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

interface AnswerFeedbackProps {
  isCorrect: boolean | null;
  scoreGain: number;
  isSurvey: boolean;
}

const AnswerFeedback = ({ isCorrect, scoreGain, isSurvey }: AnswerFeedbackProps) => {
  if (isCorrect === null) return null;

  if (isSurvey) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-2 py-4"
      >
        <span className="text-3xl">📊</span>
        <p className="font-display text-muted-foreground text-sm">תשובתך נרשמה!</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 12 }}
      className="flex flex-col items-center gap-3 py-4"
    >
      <motion.div
        initial={{ rotate: -20, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", damping: 8, delay: 0.1 }}
        className={`w-20 h-20 rounded-full flex items-center justify-center ${
          isCorrect
            ? "bg-answer-green/20 border-2 border-answer-green shadow-[0_0_30px_hsl(var(--answer-green)/0.3)]"
            : "bg-destructive/20 border-2 border-destructive shadow-[0_0_30px_hsl(var(--destructive)/0.3)]"
        }`}
      >
        {isCorrect ? (
          <Check className="w-10 h-10 text-answer-green" />
        ) : (
          <X className="w-10 h-10 text-destructive" />
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`font-display text-xl font-bold ${
          isCorrect ? "text-answer-green" : "text-destructive"
        }`}
      >
        {isCorrect ? "נכון! 🎉" : "לא נכון 😔"}
      </motion.p>

      {isCorrect && scoreGain > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="font-display text-lg text-primary"
        >
          +{scoreGain} נקודות
        </motion.p>
      )}
    </motion.div>
  );
};

export default AnswerFeedback;
