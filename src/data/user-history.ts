import { Context, Logger, Session } from "koishi"
import { MapleRegion } from "../config"

export interface UserHistoryRecord {
  userId: string
  platform: string
  region: MapleRegion
  character: string
  updatedAt: number
}

interface MapleBindingRow extends UserHistoryRecord {
  id: number
}

declare module "koishi" {
  interface Tables {
    mapleBinding: MapleBindingRow
  }
}

export class UserHistoryStore {
  private readonly logger = new Logger("msbot-nexon:binding")

  constructor(private readonly ctx: Context, private readonly allowBinding: boolean) {
    const model = ctx.model
    if (this.allowBinding && model) {
      model.extend(
        "mapleBinding",
        {
          id: "unsigned",
          userId: "string",
          platform: "string",
          region: "string",
          character: "string",
          updatedAt: "unsigned",
        },
        {
          primary: "id",
          autoInc: true,
        },
      )
    }
  }

  canPersist(): boolean {
    return this.allowBinding && Boolean(this.ctx.database)
  }

  async remember(userId: string, platform: string, region: MapleRegion, character: string) {
    if (!this.canPersist()) return

    const database = this.ctx.database!
    const updatedAt = Math.floor(Date.now() / 1000)

    try {
      const existing = await database.get("mapleBinding", {
        userId,
        platform,
        region,
      })
      if (existing.length) {
        await database.set(
          "mapleBinding",
          { id: existing[0].id },
          { character, updatedAt },
        )
      } else {
        await database.create("mapleBinding", {
          userId,
          platform,
          region,
          character,
          updatedAt,
        })
      }
    } catch (error) {
      this.logger.warn(error as Error, "写入角色绑定失败")
    }
  }

  async lookup(userId: string, platform: string, region: MapleRegion): Promise<UserHistoryRecord | undefined> {
    if (!this.canPersist()) return undefined

    const database = this.ctx.database!
    try {
      const rows = await database.get("mapleBinding", {
        userId,
        platform,
        region,
      })
      const row = rows[0]
      if (!row) return undefined
      const record: UserHistoryRecord = {
        userId: row.userId,
        platform: row.platform,
        region: row.region as MapleRegion,
        character: row.character,
        updatedAt: Number(row.updatedAt) * 1000,
      }
      return record
    } catch (error) {
      this.logger.warn(error as Error, "读取角色绑定失败")
      return undefined
    }
  }
}

export type ResolveFailureReason = "missing-name" | "timeout" | "empty-name"

export interface ResolveSuccessResult {
  ok: true
  name: string
  shouldPersist: boolean
  userId?: string
  platform?: string
}

export type ResolveResult = ResolveSuccessResult | { ok: false; reason: ResolveFailureReason }

export function isResolveFailure(result: ResolveResult): result is { ok: false; reason: ResolveFailureReason } {
  return !result.ok
}

export async function resolveCharacterName(
  session: Session | undefined,
  region: MapleRegion,
  store: UserHistoryStore,
  explicitName?: string,
): Promise<ResolveResult> {
  const normalized = explicitName?.trim()
  const userId = session?.userId
  const platform = session?.platform

  if (normalized) {
    return {
      ok: true,
      name: normalized,
      shouldPersist: Boolean(userId && platform && store.canPersist()),
      userId,
      platform,
    }
  }

  if (!session || !userId || !platform) {
    return { ok: false, reason: "missing-name" }
  }

  const binding = await store.lookup(userId, platform, region)
  if (binding) {
    return {
      ok: true,
      name: binding.character,
      shouldPersist: false,
      userId,
      platform,
    }
  }

  await session.send("请提供要查询的角色名，例如：tms/联盟查询 青螃蟹GM")
  const answer = await session.prompt(60_000)
  if (!answer) {
    return { ok: false, reason: "timeout" }
  }

  const candidate = answer.trim()
  if (!candidate) {
    return { ok: false, reason: "empty-name" }
  }

  return {
    ok: true,
    name: candidate,
    shouldPersist: store.canPersist(),
    userId,
    platform,
  }
}
