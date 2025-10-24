import { Context, Logger, h } from "koishi"
import type { Config } from "../config"
import { getRegionLabel } from "../config"
import { MapleClient } from "../api/client"
import type { ExperiencePoint, RankingRecord } from "../api/types"
import { UserHistoryStore, isResolveFailure, resolveCharacterName } from "../data/user-history"
import { InMemoryCache } from "../api/cache"
import { formatAccessFlag, formatDate, formatNumber } from "../utils/format"
import { renderCharacterReport } from "../templates/info"


export interface InfoImageCacheValue {
  image: Buffer
  summaryName: string
}

interface InfoCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
  imageCache?: InMemoryCache<InfoImageCacheValue>
}

interface PuppeteerLike {
  page?: () => Promise<any>
  render?: (...args: any[]) => Promise<any>
}

export function registerInfoCommand(deps: InfoCommandDeps) {
  const { ctx, config, client, history, imageCache } = deps
  const regionLabel = getRegionLabel(config.region)
  const puppeteer = getPuppeteer(ctx)
  const infoLogger = new Logger("msbot-nexon:info")
  ctx
    .command('tms/联盟查询 <name:string>', '查询冒险岛角色基本信息')
    .alias('tms/联盟信息')
    .example('tms/联盟查询 青螃蟹GM')
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (isResolveFailure(resolved)) {
        const reason = resolved.reason
        if (reason === "missing-name") {
          return "请直接提供角色名，例如：tms/联盟查询 青螃蟹GM"
        }
        if (reason === "timeout") {
          return "等待输入超时，请稍后重试。"
        }
        return "角色名不能为空，请重新输入。"
      }

      const cacheKey = buildCacheKey(config.region, resolved.name)
      if (imageCache) {
        const cached = imageCache.get(cacheKey)
        if (cached) {
          if (resolved.shouldPersist && resolved.userId && resolved.platform) {
            await history.remember(resolved.userId, resolved.platform, config.region, cached.summaryName)
          }
          return h.image(`data:image/png;base64,${cached.image.toString("base64")}`)
        }
      }

      try {
        const info = await client.fetchCharacterInfo(resolved.name)
        const ranking = await client.fetchRanking(resolved.name)

        if (resolved.shouldPersist && resolved.userId && resolved.platform) {
          await history.remember(resolved.userId, resolved.platform, config.region, resolved.name)
        }

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
            const buffer = await renderWithPuppeteer(puppeteer, html)
            if (buffer) {
              imageCache?.set(cacheKey, { image: buffer, summaryName: summary.name })
              return h.image(`data:image/png;base64,${buffer.toString("base64")}`)
            }
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

async function renderWithPuppeteer(puppeteer: PuppeteerLike, html: string): Promise<Buffer | null> {
  const viewport = { width: 1300, height: 760, deviceScaleFactor: 2 }

  if (typeof puppeteer.page === "function") {
    const rendered = await renderWithPage(puppeteer, html, viewport)
    if (rendered) return rendered
  }

  if (typeof puppeteer.render !== "function") return null

  try {
    const direct = await puppeteer.render(html, {
      type: "png",
      viewport,
    })
    const normalized = ensureBuffer(direct)
    if (normalized) return normalized
  } catch (error) {
    if (!(error instanceof TypeError) || !/callback is not a function/i.test(String((error as Error).message ?? error))) {
      throw error
    }
  }

  const buffer = await puppeteer.render(async (...args: any[]) => {
    const pageCandidate = args[0] ?? args[1]
    const page = extractPage(pageCandidate)
    if (!page) {
      throw new Error("Puppeteer 页面实例无效")
    }
    if (typeof page.setViewport === "function") {
      await page.setViewport(viewport)
    }
    if (typeof page.setContent === "function") {
      await page.setContent(html, { waitUntil: "networkidle0" })
    }
    const target = typeof page.$ === "function" ? await page.$("#app") : null
    const shot = await (target ?? page).screenshot({ type: "png" })
    return ensureBuffer(shot)
  })

  return ensureBuffer(buffer)
}

async function renderWithPage(puppeteer: PuppeteerLike, html: string, viewport: { width: number; height: number; deviceScaleFactor: number }) {
  const factory = puppeteer.page
  if (typeof factory !== "function") return null
  const page = await factory()
  try {
    if (typeof page.setViewport === "function") {
      await page.setViewport(viewport)
    }
    if (typeof page.setContent === "function") {
      await page.setContent(html, { waitUntil: "networkidle0" })
    }
    if (typeof page.waitForSelector === "function") {
      await page.waitForSelector("#app", { timeout: 5_000 }).catch(() => undefined)
    }
    const mount = typeof page.$ === "function" ? await page.$("#app") : null
    const target = mount ?? page
    const shot = await target.screenshot({ type: "png" })
    return ensureBuffer(shot)
  } finally {
    if (typeof page.close === "function") {
      await page.close().catch(() => undefined)
    }
  }
}

function extractPage(input: any): any {
  if (!input) return undefined
  if (typeof input === "object") {
    if ("page" in input) {
      return (input as { page: any }).page
    }
    if ("context" in input) {
      return (input as { context: any }).context
    }
  }
  return input
}

function ensureBuffer(value: any): Buffer | null {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === "string") {
    return Buffer.from(value, "base64")
  }
  return null
}

function buildCacheKey(region: string, name: string): string {
  return `${region}:${name.trim().toLowerCase()}`
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
