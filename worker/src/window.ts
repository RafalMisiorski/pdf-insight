// Sliding-window counting, kept pure so it can be unit-tested without the Workers runtime.
// `hits` are the times of the requests already accepted; old ones fall out of the window.
export function takeSlot(
  hits: number[],
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; hits: number[] } {
  const recent = hits.filter((time) => now - time < windowMs)
  if (recent.length >= limit) return { allowed: false, hits: recent }
  return { allowed: true, hits: [...recent, now] }
}
