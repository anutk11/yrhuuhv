/**
 * Advanced scoring algorithm that weighs correctness and speed.
 * 
 * @param isCorrect - Whether the answer was correct
 * @param answerTimeSeconds - How long it took to answer
 * @param totalTimeSeconds - Total time allowed for the question
 * @param correctnessWeight - Weight for correctness (0-100), speed gets the rest
 * @param maxScore - Maximum possible score per question
 */
export function calculateScore(
  isCorrect: boolean,
  answerTimeSeconds: number,
  totalTimeSeconds: number,
  correctnessWeight: number = 60,
  maxScore: number = 1000
): { total: number; correctnessPoints: number; speedPoints: number } {
  if (!isCorrect) {
    return { total: 0, correctnessPoints: 0, speedPoints: 0 };
  }

  const correctnessFraction = correctnessWeight / 100;
  const speedFraction = 1 - correctnessFraction;

  // Correctness component - full marks if correct
  const correctnessPoints = Math.round(maxScore * correctnessFraction);

  // Speed component - linear decay based on time taken
  const speedRatio = Math.max(0, 1 - answerTimeSeconds / totalTimeSeconds);
  const speedPoints = Math.round(maxScore * speedFraction * speedRatio);

  return {
    total: correctnessPoints + speedPoints,
    correctnessPoints,
    speedPoints,
  };
}

export interface PlayerGameState {
  id: string;
  name: string;
  totalScore: number;
  correctAnswers: number;
  totalAnswerTime: number;
  questionsAnswered: number;
  fastestAnswer: number;
  currentStreak: number;
  bestStreak: number;
}

export function createPlayerState(id: string, name: string): PlayerGameState {
  return {
    id,
    name,
    totalScore: 0,
    correctAnswers: 0,
    totalAnswerTime: 0,
    questionsAnswered: 0,
    fastestAnswer: Infinity,
    currentStreak: 0,
    bestStreak: 0,
  };
}

export function updatePlayerScore(
  player: PlayerGameState,
  isCorrect: boolean,
  answerTime: number,
  score: number
): PlayerGameState {
  const newStreak = isCorrect ? player.currentStreak + 1 : 0;
  return {
    ...player,
    totalScore: player.totalScore + score,
    correctAnswers: player.correctAnswers + (isCorrect ? 1 : 0),
    totalAnswerTime: player.totalAnswerTime + answerTime,
    questionsAnswered: player.questionsAnswered + 1,
    fastestAnswer: answerTime < player.fastestAnswer ? answerTime : player.fastestAnswer,
    currentStreak: newStreak,
    bestStreak: Math.max(player.bestStreak, newStreak),
  };
}

export function getTopScorer(players: PlayerGameState[]): PlayerGameState | null {
  if (players.length === 0) return null;
  return players.reduce((best, p) => (p.totalScore > best.totalScore ? p : best));
}

export function getFastestPlayer(players: PlayerGameState[]): PlayerGameState | null {
  const answeredPlayers = players.filter((p) => p.questionsAnswered > 0);
  if (answeredPlayers.length === 0) return null;
  return answeredPlayers.reduce((fastest, p) =>
    p.totalAnswerTime / p.questionsAnswered < fastest.totalAnswerTime / fastest.questionsAnswered
      ? p
      : fastest
  );
}
