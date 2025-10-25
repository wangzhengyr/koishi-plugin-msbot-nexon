import { Context, Logger, h } from "koishi"
import type { Config } from "../config"
import { getRegionLabel } from "../config"
import { MapleClient } from "../api/client"
import type { ExperiencePoint } from "../api/types"
import { MapleScouterClient } from "../api/maplescouter"
import { UserHistoryStore, isResolveFailure, resolveCharacterName } from "../data/user-history"
import { InMemoryCache } from "../api/cache"
import { formatAccessFlag, formatDate, formatNumber } from "../utils/format"
import { renderCharacterReport } from "../templates/info"
import { MapleScouterProfile } from "../entities"


export interface InfoImageCacheValue {
  image: Buffer
  summaryName: string
}

interface InfoCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  scouter: MapleScouterClient
  history: UserHistoryStore
  imageCache?: InMemoryCache<InfoImageCacheValue>
}

interface PuppeteerLike {
  page?: () => Promise<any>
  render?: (...args: any[]) => Promise<any>
}

export function registerInfoCommand(deps: InfoCommandDeps) {
  const { ctx, config, client, scouter, history, imageCache } = deps
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
        const [info, profile] = await Promise.all([
          client.fetchCharacterInfo(resolved.name),
          scouter.fetchProfile(resolved.name),
        ])

        if (resolved.shouldPersist && resolved.userId && resolved.platform) {
          await history.remember(resolved.userId, resolved.platform, config.region, resolved.name)
        }

        const summary = info.summary
        const html = renderCharacterReport({
          summary,
          union: info.union,
          experience: info.experience,
          profile,
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

        const fallbackLines = buildFallbackLines(summary, info.union, profile, regionLabel, info.experience)
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

function buildFallbackLines(
  summary: any,
  union: any,
  profile: MapleScouterProfile,
  regionLabel: string,
  experience: ExperiencePoint[],
) {
  const unionLine = union
    ? `联盟：Lv.${union.level ?? "--"} ｜ 结晶等级：${union.artifactLevel ?? profile.basic.artifactLevel ?? "--"}`
    : "联盟：暂无记录（官方未返回数据）"

  const lines = [
    `角色：${profile.basic.name || summary.name}（${regionLabel}）`,
    `等级：${profile.basic.level ?? summary.level} ｜ 职业：${profile.basic.job ?? summary.job}`,
    unionLine,
    `ARC：${formatNumber(profile.basic.arcaneForce)} ｜ AUTH：${formatNumber(profile.basic.authenticForce)}`,
    `战力：${formatTaiwanNumber(profile.combat.combatPower)} ｜ 一般（380）：${formatNumber(
      profile.combat.generalDamage380 ?? 0,
    )} ｜ HEXA（380）：${formatNumber(profile.combat.hexaDamage380 ?? 0)}`,
    `公会：${profile.basic.guild ?? summary.guild ?? "无公会"} ｜ ${formatAccessFlag(summary.accessFlag)}`,
    `经验：${formatNumber(summary.exp)} ｜ 进度：${summary.expRate ?? "--"}`,
    `创角：${formatDate(summary.createDate)} ｜ 解放任务：${
      summary.liberationQuestClear === "1" ? "已完成" : "未完成"
    }`,
  ]

  if (experience.length) {
    const recent = experience.slice(-Math.min(experience.length, 5))
    const rows = recent.map(
      (item) => `· ${item.date} ｜ Lv.${item.level} ｜ 经验增量 +${formatNumber(item.gain)}`,
    )
    lines.push(`经验趋势（最近 ${recent.length} 天）：`, ...rows)
  }
  return lines
}

function formatTaiwanNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "--"
  const numeric = typeof value === "string" ? Number(value) : value
  if (!numeric || Number.isNaN(numeric)) return "--"
  const units = [
    { threshold: 1e12, label: "兆" },
    { threshold: 1e8, label: "億" },
    { threshold: 1e4, label: "萬" },
  ]
  for (const unit of units) {
    if (numeric >= unit.threshold) {
      return `${(numeric / unit.threshold).toFixed(2).replace(/\.0+$/, "")}${unit.label}`
    }
  }
  return formatNumber(numeric)
}
