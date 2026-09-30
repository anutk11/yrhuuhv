import { describe, expect, it } from "vitest";
import { getNextPhaseTransition } from "./gamePhases";

const questions = [{
  id: "q1",
  text: "Q",
  options: ["1", "2", "3", "4"],
  correctIndex: 0,
  timeLimit: 15,
  type: "trivia" as const,
  imageViewTime: 5,
  keepImage: false,
}];

describe("game phase transitions", () => {
  it("starts with reading", () => {
    expect(getNextPhaseTransition({
      currentPhase: "idle",
      currentQuestionIndex: -1,
      questions,
    })?.nextPhase).toBe("reading");
  });
  it("moves answering to result", () => {
    expect(getNextPhaseTransition({
      currentPhase: "answering",
      currentQuestionIndex: 0,
      questions,
    })?.nextPhase).toBe("result");
  });
  it("moves the last result to stats", () => {
    expect(getNextPhaseTransition({
      currentPhase: "result",
      currentQuestionIndex: 0,
      questions,
    })?.nextPhase).toBe("stats");
  });
});
