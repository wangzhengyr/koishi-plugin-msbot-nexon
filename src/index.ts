import { Context, Logger } from "koishi"
import type { Config as PluginConfig } from "./config"
import { Config as ConfigSchema, normalizeConfig } from "./config"
import { MapleClient } from "./api/client"
import { UserHistoryStore } from "./data/user-history"
import { registerInfoCommand } from "./commands/info"
import { registerRankCommand } from "./commands/rank"
import { registerEquipCommand } from "./commands/equip"

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

  registerInfoCommand({ ctx, config, client, history })
  registerRankCommand({ ctx, config, client, history })
  registerEquipCommand({ ctx, config, client, history })

  logger.info(
    "已启用冒险岛查询插件，地区：%s，缓存：%s",
    config.region,
    config.cache.enabled ? `开启（${config.cache.ttl}s）` : "关闭",
  )
}
