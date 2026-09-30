import type { GameQuestion } from "@/hooks/useGameSync";

export type GamePhase = "idle" | "reading" | "answering" | "result" | "survey-result" | "leaderboard" | "stats";

export const SHOW_LEADERBOARD_EVERY = 2;

export interface PhaseTransition {
  duration: number;
  nextPhase: GamePhase;
  nextQuestionIndex?: number;
  nextStatus?: string;
}

export function getReadingTime(question?: GameQuestion | null) {
  if (!question) return 3;
  if (question.mediaType === "video" && question.mediaUrl) return 9999;
  if (question.mediaType === "image" && question.mediaUrl) return question.imageViewTime || 5;
  return 3;
}

export interface PhaseTimingSettings {
  result_display_seconds?: number;
  leaderboard_display_seconds?: number;
  show_leaderboard_every?: number;
}

export function getPhaseDuration(
  question: GameQuestion | null | undefined,
  phase: GamePhase,
  settings?: PhaseTimingSettings,
) {
  switch (phase) {
    case "idle":
      return 0;
    case "reading":
      return getReadingTime(question);
    case "answering":
      return question?.timeLimit || 15;
    case "result":
      return settings?.result_display_seconds ?? 5;
    case "survey-result":
      return settings?.result_display_seconds ?? 6;
    case "leaderboard":
      return settings?.leaderboard_display_seconds ?? 5;
    case "stats":
      return 5;
    default:
      return 3;
  }
}

interface GetNextPhaseTransitionParams {
  currentPhase: GamePhase;
  currentQuestionIndex: number;
  questions: GameQuestion[];
  settings?: PhaseTimingSettings;
}

export function getNextPhaseTransition({
  currentPhase,
  currentQuestionIndex,
  questions,
  settings,
}: GetNextPhaseTransitionParams): PhaseTransition | null {
  const currentQuestion = currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : null;
  const nextQuestion = questions[currentQuestionIndex + 1] ?? null;
  const isLastQuestion = currentQuestionIndex >= questions.length - 1;
  const questionNumber = currentQuestionIndex + 1;
  const leaderboardEvery = Math.max(1, settings?.show_leaderboard_every ?? SHOW_LEADERBOARD_EVERY);

  if (currentPhase === "idle") {
    if (!questions.length) return null;

    return {
      nextPhase: "reading",
      nextQuestionIndex: 0,
      nextStatus: "playing",
      duration: getReadingTime(questions[0]),
    };
  }

  if (!currentQuestion) return null;

  if (currentPhase === "reading") {
    return {
      nextPhase: "answering",
      duration: getPhaseDuration(currentQuestion, "answering", settings),
    };
  }

  if (currentPhase === "answering") {
    const nextPhase = currentQuestion.type === "survey" ? "survey-result" : "result";
    return {
      nextPhase,
      duration: getPhaseDuration(currentQuestion, nextPhase, settings),
    };
  }

  if (currentPhase === "result" || currentPhase === "survey-result") {
    if (isLastQuestion) {
      return {
        nextPhase: "stats",
        duration: getPhaseDuration(currentQuestion, "stats", settings),
      };
    }

    if (questionNumber % leaderboardEvery === 0) {
      return {
        nextPhase: "leaderboard",
        duration: getPhaseDuration(currentQuestion, "leaderboard", settings),
      };
    }

    return {
      nextPhase: "reading",
      nextQuestionIndex: currentQuestionIndex + 1,
      duration: getReadingTime(nextQuestion),
    };
  }

  if (currentPhase === "leaderboard") {
    if (isLastQuestion) {
      return {
        nextPhase: "stats",
        duration: getPhaseDuration(currentQuestion, "stats", settings),
      };
    }

    return {
      nextPhase: "reading",
      nextQuestionIndex: currentQuestionIndex + 1,
      duration: getReadingTime(nextQuestion),
    };
  }

  if (currentPhase === "stats") {
    return {
      nextPhase: "stats",
      nextStatus: "finished",
      duration: 0,
    };
  }

  return null;
}