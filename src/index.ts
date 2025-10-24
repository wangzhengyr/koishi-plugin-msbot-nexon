import { Context, Logger } from "koishi"
import type { Config as PluginConfig } from "./config"
import { Config as ConfigSchema, normalizeConfig } from "./config"
import { MapleClient } from "./api/client"
import { UserHistoryStore } from "./data/user-history"
import { registerInfoCommand, InfoImageCacheValue } from "./commands/info"
import { registerRankCommand } from "./commands/rank"
import { registerEquipCommand } from "./commands/equip"
import { registerBindCommand } from "./commands/bind"
import { InMemoryCache } from "./api/cache"

export const name = "msbot-nexon"
export const Config = ConfigSchema

const logger = new Logger(name)

export function apply(ctx: Context, rawConfig: PluginConfig) {
  const config = normalizeConfig(rawConfig)
  if (!config.apiKey) {
    throw new Error("请在插件配置中填写 Nexon Open API 密钥")
  }

  const history = new UserHistoryStore(ctx, config.allowBinding)
  const client = new MapleClient({ options: config })

  const imageCache = config.cache.enabled
    ? new InMemoryCache<InfoImageCacheValue>({
        ttl: config.cache.ttl * 1000,
        maxSize: config.cache.maxSize,
      })
    : undefined

  if (imageCache) {
    scheduleDailyCacheReset(ctx, imageCache, config.cache.resetHour)
  }

  if (history.canPersist()) {
    registerBindCommand({ ctx, config, client, history })
  }

  registerInfoCommand({ ctx, config, client, history, imageCache })
  registerRankCommand({ ctx, config, client, history })
  registerEquipCommand({ ctx, config, client, history })

  logger.info(
    "已启用冒险岛查询插件，地区：%s，缓存：%s",
    config.region,
    imageCache ? `开启（TTL=${config.cache.ttl}s，${config.cache.resetHour}:00 清空）` : "关闭",
  )
}

function scheduleDailyCacheReset(ctx: Context, cache: InMemoryCache<unknown>, hour: number) {
  if (hour < 0 || hour > 23) return
  const DAY_MS = 86_400_000
  const cacheLogger = new Logger("msbot-nexon:cache")

  const computeDelay = () => {
    const now = new Date()
    const target = new Date(now)
    target.setHours(hour, 0, 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target.getTime() - now.getTime()
  }

  const flush = () => {
    cache.clear()
    cacheLogger.info("缓存已按计划清空")
  }

  let dailyTimer: NodeJS.Timeout | undefined
  let kickoffTimer: NodeJS.Timeout | undefined

  const scheduleNext = () => {
    kickoffTimer = setTimeout(() => {
      flush()
      dailyTimer = setInterval(flush, DAY_MS)
    }, computeDelay())
  }

  scheduleNext()

  ctx.on("dispose", () => {
    if (kickoffTimer) clearTimeout(kickoffTimer)
    if (dailyTimer) clearInterval(dailyTimer)
  })
}
