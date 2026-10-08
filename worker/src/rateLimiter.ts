import { DurableObject } from 'cloudflare:workers'
import { takeSlot } from './window'

// One object per key: a client IP for the per-minute limit, or a calendar day for the daily cap.
// A Durable Object handles its requests one at a time and stores the count, so the limit is exact.
// Cloudflare's rate-limiting binding is "permissive, eventually consistent" and did not stop
// 45 requests in two minutes in production (docs/adr/0007-rate-limits.md).
export class RateLimiter extends DurableObject {
  async take(limit: number, windowMs: number): Promise<boolean> {
    const stored = (await this.ctx.storage.get<number[]>('hits')) ?? []
    const { allowed, hits } = takeSlot(stored, Date.now(), limit, windowMs)
    await this.ctx.storage.put('hits', hits)
    return allowed
  }
}
