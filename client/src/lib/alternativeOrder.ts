export type AlternativeOrders = Record<number, number[]>;

type QuestionLike = { id: number; options: string[]; correct: number; analysis?: string[] };

export function shuffleIndices(length: number, random: () => number = Math.random): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }
  return indices;
}

export function createAlternativeOrders(questions: QuestionLike[], random: () => number = Math.random): AlternativeOrders {
  return Object.fromEntries(questions.map(question => [question.id, shuffleIndices(question.options.length, random)]));
}

export function identityAlternativeOrders(questions: QuestionLike[]): AlternativeOrders {
  return Object.fromEntries(questions.map(question => [question.id, question.options.map((_, index) => index)]));
}

export function isValidAlternativeOrder(value: unknown, questions: QuestionLike[]): value is AlternativeOrders {
  if (!value || typeof value !== "object") return false;
  return questions.every(question => {
    const order = (value as Record<string, unknown>)[question.id];
    return Array.isArray(order)
      && order.length === question.options.length
      && new Set(order).size === question.options.length
      && order.every(index => Number.isInteger(index) && index >= 0 && index < question.options.length);
  });
}

export function resolveAlternativeOrders(saved: unknown, hasAnswers: boolean, questions: QuestionLike[], random: () => number = Math.random): AlternativeOrders {
  if (hasAnswers && isValidAlternativeOrder(saved, questions)) return saved;
  if (hasAnswers) return identityAlternativeOrders(questions);
  return createAlternativeOrders(questions, random);
}

export function applyAlternativeOrder<T extends QuestionLike>(question: T, order: number[]): T {
  const options = order.map(originalIndex => question.options[originalIndex]);
  const analysis = question.analysis ? order.map(originalIndex => question.analysis?.[originalIndex] ?? "") : question.analysis;
  const correct = order.indexOf(question.correct);
  return { ...question, options, analysis, correct };
}
