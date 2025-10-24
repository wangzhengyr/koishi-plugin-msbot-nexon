import { Context, Logger } from 'koishi'
import type { Config } from '../config'
import { getRegionLabel } from '../config'
import { MapleClient } from '../api/client'
import { UserHistoryStore, isResolveFailure, resolveCharacterName } from '../data/user-history'
import { formatDate, formatNumber } from '../utils/format'

interface RankCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
}

export function registerRankCommand(deps: RankCommandDeps) {
  const { ctx, config, client, history } = deps
  const regionLabel = getRegionLabel(config.region)
  const rankLogger = new Logger('msbot-nexon:rank')

  ctx
    .command('tms/联盟排行 <name:string>', '查询冒险岛等级排名')
    .alias('tms/联盟战力')
    .example('tms/联盟排行 青螃蟹GM')
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (isResolveFailure(resolved)) {
        const reason = resolved.reason
        if (reason === 'missing-name') {
          return '请直接提供角色名，例如：tms/联盟排行 青螃蟹GM'
        }
        if (reason === 'timeout') {
          return '等待输入超时，请稍后重试。'
        }
        return '角色名不能为空，请重新输入。'
      }

      try {
        const result = await client.fetchRanking(resolved.name)
        if (result.records.length && resolved.shouldPersist && resolved.userId && resolved.platform) {
          await history.remember(resolved.userId, resolved.platform, config.region, resolved.name)
        }
        if (!result.available) {
          return result.message ?? '该地区暂未开放排名查询'
        }

        const sorted = [...result.records].sort((a, b) => b.date.localeCompare(a.date))
        const latest = sorted[0]
        const others = sorted.slice(1, 3)

        const lines = [
          `角色：${resolved.name}（${regionLabel}）`,
          `最新排名：第 ${formatNumber(latest.ranking)} 名 ｜ 统计日期：${formatDate(latest.date)}`,
          `等级：${latest.characterLevel} ｜ 职业：${latest.className} ｜ 世界：${latest.worldName}`,
        ]

        if (others.length) {
          lines.push(
            '历史记录：',
            ...others.map(
              (item) =>
                `· ${formatDate(item.date)} ｜ 第 ${formatNumber(item.ranking)} 名 ｜ Lv.${item.characterLevel}`,
            ),
          )
        }

        return lines.join('\n')
      } catch (error) {
        rankLogger.error(error as Error, '查询排名信息接口调用失败')
        return '查询排名信息失败，请稍后重试。'
      }
    })
}
