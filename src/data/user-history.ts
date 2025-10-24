import { Context, Session } from 'koishi'
import { MapleRegion } from '../config'

export interface UserHistoryRecord {
  userId: string
  region: MapleRegion
  character: string
  updatedAt: number
}

export class UserHistoryStore {
  private readonly store = new Map<string, UserHistoryRecord>()

  constructor(private readonly ctx: Context, private readonly enabled: boolean) {
    ctx.on('dispose', () => this.store.clear())
  }

  remember(userId: string, region: MapleRegion, character: string) {
    if (!this.enabled) return
    this.store.set(userId, {
      userId,
      region,
      character,
      updatedAt: Date.now(),
    })
  }

  lookup(userId: string, region: MapleRegion): UserHistoryRecord | undefined {
    if (!this.enabled) return undefined
    const record = this.store.get(userId)
    if (!record) return undefined
    if (record.region !== region) return undefined
    return record
  }
}

export async function resolveCharacterName(
  session: Session | undefined,
  region: MapleRegion,
  store: UserHistoryStore,
  explicitName?: string,
): Promise<{ ok: true; name: string } | { ok: false; reason: ResolveFailureReason }> {
  const normalized = explicitName?.trim()
  if (normalized) {
    if (session?.userId) {
      store.remember(session.userId, region, normalized)
    }
    return { ok: true, name: normalized }
  }

  if (!session || !session.userId) {
    return { ok: false, reason: 'missing-name' }
  }

  const cached = store.lookup(session.userId, region)
  if (cached) {
    return { ok: true, name: cached.character }
  }

  await session.send('请提供要查询的角色名，例如：tms/联盟查询 青螃蟹GM')
  const answer = await session.prompt(60_000)
  if (!answer) {
    return { ok: false, reason: 'timeout' }
  }

  const candidate = answer.trim()
  if (!candidate) {
    return { ok: false, reason: 'empty-name' }
  }

  store.remember(session.userId, region, candidate)
  return { ok: true, name: candidate }
}

export type ResolveFailureReason = 'missing-name' | 'timeout' | 'empty-name'
