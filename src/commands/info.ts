import { Context, Logger, h } from "koishi"
import type { Config } from "../config"
import { getRegionLabel } from "../config"
import { MapleClient } from "../api/client"
import type { ExperiencePoint, RankingRecord } from "../api/types"
import { ResolveFailureReason, UserHistoryStore, resolveCharacterName } from "../data/user-history"
import { formatAccessFlag, formatDate, formatNumber } from "../utils/format"
import { renderCharacterReport } from "../templates/info"
import { MapleStoryApi } from 'maplestory-openapi/tms'; // data from KMS


interface InfoCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
}

interface PuppeteerLike {
  render: (html: string, options?: Record<string, any>) => Promise<Buffer>
}

export function registerInfoCommand(deps: InfoCommandDeps) {
  const { ctx, config, client, history } = deps
  const regionLabel = getRegionLabel(config.region)
  const puppeteer = getPuppeteer(ctx)
  const infoLogger = new Logger("msbot-nexon:info")


  const apiKey = 'test_fb944efffac058eb3f7575e5109fa9cd74bb7338f84068afdd350335b1c60cc5efe8d04e6d233bd35cf2fabdeb93fb0d';
  const api = new MapleStoryApi(apiKey);
  ctx.command('test')
    .action(async () => {
      const character = await api.getCharacter('青螃蟹GM');
      const characterBasic = await api.getCharacterBasic(character.ocid);
      infoLogger.info(characterBasic);
    })



  ctx
    .command('tms/联盟查询 <name:string>', '查询冒险岛角色基本信息')
    .alias('tms/联盟信息')
    .example('tms/联盟查询 青螃蟹GM')
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (!resolved.ok) {
        const reason = (resolved as { ok: false; reason: ResolveFailureReason }).reason
        if (reason === "missing-name") {
          return "请直接提供角色名，例如：tms/联盟查询 青螃蟹GM"
        }
        if (reason === "timeout") {
          return "等待输入超时，请稍后重试。"
        }
        return "角色名不能为空，请重新输入。"
      }

      try {
        const info = await client.fetchCharacterInfo(resolved.name)
        const ranking = await client.fetchRanking(resolved.name)

        const summary = info.summary
        const experienceStats = buildExperienceStats(info.experience)
        const rankingNeighbors = buildRankingNeighbors(ranking.records, summary.name, 6)
        const rankingDate = ranking.records[0]?.date

        const html = renderCharacterReport({
          summary,
          union: info.union,
          experience: info.experience,
          experienceStats,
          ranking: {
            available: ranking.available,
            neighbors: rankingNeighbors,
            message: ranking.message,
            date: rankingDate,
            characterName: summary.name,
          },
          regionLabel,
        })

        if (puppeteer) {
          try {
            const buffer = await puppeteer.render(html, {
              type: "png",
              viewport: {
                width: 1300,
                height: 760,
                deviceScaleFactor: 2,
              },
            })
            return h.image(`data:image/png;base64,${buffer.toString("base64")}`)
          } catch (error) {
            infoLogger.warn(error as Error, "生成图像失败，回退为文本输出")
          }
        }

        const unionLine = info.union
          ? `联盟：Lv.${info.union.level ?? "--"} ｜ 段位：${info.union.grade ?? "--"} ｜ 结晶点：${formatNumber(
              info.union.artifactPoint ?? 0,
            )}`
          : "联盟：暂无记录（官方未返回数据）"

        const fallbackLines = [
          `角色：${summary.name}（${regionLabel}）`,
          `等级：${summary.level} ｜ 职业：${summary.job}${summary.jobDetail ? ` ${summary.jobDetail}` : ""}`,
          unionLine,
          `公会：${summary.guild ?? "无公会"} ｜ ${formatAccessFlag(summary.accessFlag)}`,
          `经验：${formatNumber(summary.exp)} ｜ 进度：${summary.expRate ?? "--"}`,
          `创角：${formatDate(summary.createDate)} ｜ 解放任务：${
            summary.liberationQuestClear === "1" ? "已完成" : "未完成"
          }`,
        ]

        if (info.experience.length) {
          const recent = info.experience.slice(-Math.min(info.experience.length, 5))
          const rows = recent.map(
            (item) => `· ${item.date} ｜ Lv.${item.level} ｜ 经验增量 +${formatNumber(item.gain)}`,
          )
          fallbackLines.push(`经验趋势（最近 ${recent.length} 天）：`, ...rows)
        }

        if (!ranking.available && ranking.message) {
          fallbackLines.push(`排名提示：${ranking.message}`)
        }

        return fallbackLines.join("\n")
      } catch (error) {
        infoLogger.error(error as Error, "查询角色信息接口调用失败")
        return "查询角色信息失败，请稍后重试。"
      }
    })
}

function getPuppeteer(ctx: Context): PuppeteerLike | undefined {
  return (ctx as any).puppeteer ?? undefined
}

function buildExperienceStats(series: ExperiencePoint[]) {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const last7 = sumRecent(sorted, 7)
  const last14 = sumRecent(sorted, 14)
  return {
    total7: last7.total,
    avg7: last7.count ? last7.total / last7.count : 0,
    total14: last14.total,
    avg14: last14.count ? last14.total / last14.count : 0,
  }
}

function sumRecent(series: ExperiencePoint[], span: number) {
  if (!series.length) return { total: 0, count: 0 }
  const slice = series.slice(-Math.min(series.length, span))
  const total = slice.reduce((acc, item) => acc + (item.gain ?? 0), 0)
  return { total, count: slice.length }
}

function buildRankingNeighbors(records: RankingRecord[], targetName: string, windowSize: number) {
  if (!records.length) return []
  const latestDate = records[0].date
  const sameDate = records.filter((record) => record.date === latestDate)
  const sorted = [...sameDate].sort((a, b) => a.ranking - b.ranking)
  const normalized = normalizeName(targetName)
  const index = sorted.findIndex((record) => normalizeName(record.characterName) === normalized)
  if (index === -1) {
    return sorted.slice(0, Math.min(sorted.length, windowSize))
  }
  const half = Math.floor(windowSize / 2)
  const start = Math.max(0, index - half)
  const end = Math.min(sorted.length, start + windowSize)
  return sorted.slice(start, end)
}

function normalizeName(input: string) {
  return input.trim().toLowerCase()
}
