export function shuffleQuestionIds(ids: number[], random: () => number = Math.random): number[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createQuestionOrder(total: number, random: () => number = Math.random): number[] {
  return shuffleQuestionIds(Array.from({ length: total }, (_, index) => index + 1), random);
}

export function resolveQuestionOrder(savedOrder: unknown, hasAnswers: boolean, total: number, random: () => number = Math.random): number[] {
  return hasAnswers && isValidQuestionOrder(savedOrder, total) ? savedOrder : createQuestionOrder(total, random);
}

export function isValidQuestionOrder(order: unknown, total: number): order is number[] {
  if (!Array.isArray(order) || order.length !== total) return false;
  const values = order.filter((value): value is number => Number.isInteger(value));
  return values.length === total && new Set(values).size === total && values.every(value => value >= 1 && value <= total);
}
