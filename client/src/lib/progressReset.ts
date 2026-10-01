import { createQuestionOrder } from "./questionOrder";

export type FreshProgressState = {
  questionOrder: number[];
  answers: Record<number, never>;
  current: number;
  started: false;
  showFeedback: false;
  selected: null;
  view: "dashboard";
  startTime: number;
  elapsed: 0;
  localChangedAt: number;
};

export function createFreshProgressState(total: number, now: number, random: () => number = Math.random): FreshProgressState {
  return {
    questionOrder: createQuestionOrder(total, random),
    answers: {},
    current: 0,
    started: false,
    showFeedback: false,
    selected: null,
    view: "dashboard",
    startTime: now,
    elapsed: 0,
    localChangedAt: now,
  };
}
