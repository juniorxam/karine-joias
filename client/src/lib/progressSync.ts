export function shouldPreferLocalProgress(localChangedAt: number, remoteUpdatedAt: number, hasLocalAnswers: boolean) {
  return hasLocalAnswers && localChangedAt > remoteUpdatedAt;
}
