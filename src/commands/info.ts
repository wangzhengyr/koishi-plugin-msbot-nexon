import { Context } from 'koishi'
import type { Config } from '../config'
import { getRegionLabel } from '../config'
import { MapleClient } from '../api/client'
import { ResolveFailureReason, UserHistoryStore, resolveCharacterName } from '../data/user-history'
import { formatAccessFlag, formatDate, formatNumber } from '../utils/format'

interface InfoCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
}

export function registerInfoCommand(deps: InfoCommandDeps) {
  const { ctx, config, client, history } = deps
  const regionLabel = getRegionLabel(config.region)

  ctx
    .command('maple info <name:text>', '查询冒险岛角色基本信息')
    .alias('冒险信息')
    .example('/maple info 青螃蟹GM')
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (!resolved.ok) {
        const reason = (resolved as { ok: false; reason: ResolveFailureReason }).reason
        if (reason === 'missing-name') {
          return '请直接提供角色名，例如：/maple info 青螃蟹GM'
        }
        if (reason === 'timeout') {
          return '等待输入超时，请稍后重试。'
        }
        return '角色名不能为空，请重新输入。'
      }

      try {
        const info = await client.fetchCharacterInfo(resolved.name)
        const summary = info.summary

        const nameLine = `角色：${summary.name}（${regionLabel}）`
        const jobDetail = summary.jobDetail ? ` ${summary.jobDetail}` : ''
        const jobLine = `等级：${summary.level} ｜ 职业：${summary.job}${jobDetail}`
        const guildLine = `公会：${summary.guild ?? '无公会'} ｜ ${formatAccessFlag(summary.accessFlag)}`
        const expLine = `经验：${formatNumber(summary.exp)} ｜ 进度：${summary.expRate ?? '--'}`
        const createLine = `创角：${formatDate(summary.createDate)} ｜ 解放任务：${
          summary.liberationQuestClear === '1' ? '已完成' : '未完成'
        }`

        const unionLine = info.union
          ? `联盟：Lv.${info.union.level ?? '--'} ｜ 段位：${info.union.grade ?? '--'} ｜ 结晶点：${formatNumber(
              info.union.artifactPoint ?? 0,
            )}`
          : '联盟：暂无记录（官方未返回数据）'

        let experienceBlock = ''
        if (info.experience && info.experience.length) {
          const recent = info.experience.slice(-Math.min(info.experience.length, 5))
          const rows = recent.map(
            (item) => `· ${item.date} ｜ Lv.${item.level} ｜ 经验增量 +${formatNumber(item.gain)}`,
          )
          experienceBlock = `经验趋势（最近 ${recent.length} 天）：\n${rows.join('\n')}`
        }

        return [nameLine, jobLine, unionLine, guildLine, expLine, createLine, experienceBlock]
          .filter(Boolean)
          .join('\n')
      } catch (error) {
        if (error instanceof Error) return error.message
        return '查询角色信息失败'
      }
    })
}
