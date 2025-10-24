import { Context } from 'koishi'
import type { Config } from '../config'
import { getRegionLabel } from '../config'
import { MapleClient } from '../api/client'
import { ResolveFailureReason, UserHistoryStore, resolveCharacterName } from '../data/user-history'
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

  ctx
    .command('maple rank <name:text>', '查询冒险岛等级排名')
    .alias('冒险排行')
    .example('/maple rank 青螃蟹GM')
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (!resolved.ok) {
        const reason = (resolved as { ok: false; reason: ResolveFailureReason }).reason
        if (reason === 'missing-name') {
          return '请直接提供角色名，例如：/maple rank 青螃蟹GM'
        }
        if (reason === 'timeout') {
          return '等待输入超时，请稍后重试。'
        }
        return '角色名不能为空，请重新输入。'
      }

      const result = await client.fetchRanking(resolved.name)
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
    })
}
