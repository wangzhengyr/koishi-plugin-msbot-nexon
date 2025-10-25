import { Context, Logger, h } from "koishi"
import type { Config } from "../config"
import { getRegionLabel } from "../config"
import { MapleClient, HexaMatrixNode } from "../api/client"
import type { ExperiencePoint } from "../api/types"
import { MapleScouterClient } from "../api/maplescouter"
import { UserHistoryStore, isResolveFailure, resolveCharacterName } from "../data/user-history"
import { InMemoryCache } from "../api/cache"
import { formatAccessFlag, formatDate, formatNumber } from "../utils/format"
import { renderCharacterReport } from "../templates/info"
import { MapleScouterProfile, MapleScouterHexaNode } from "../entities"


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

        const hexaMatrix = await client.fetchHexaMatrix(info.ocid)
        if (hexaMatrix.length) {
          mergeHexaMatrix(profile, hexaMatrix)
        }

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

const HEXA_DISPLAY_ORDER = [
  "skillCore1",
  "skillCore2",
  "masteryCore1",
  "masteryCore2",
  "masteryCore3",
  "masteryCore4",
  "reinCore1",
  "reinCore2",
  "reinCore3",
  "reinCore4",
  "generalCore1",
]

function mergeHexaMatrix(profile: MapleScouterProfile, matrix: HexaMatrixNode[]) {
  if (!matrix.length) return
  const nodeMap = new Map<string, MapleScouterHexaNode>()
  for (const node of profile.hexa.nodes) {
    const base: MapleScouterHexaNode = {
      ...node,
      subSkills: node.subSkills ?? [],
      subSkillIcons: node.subSkillIcons ?? [],
    }
    nodeMap.set(node.key, base)
  }
  for (const entry of matrix) {
    const existing = nodeMap.get(entry.key)
    if (existing) {
      if (entry.level && entry.level > 0) {
        existing.level = entry.level
      }
      if (entry.mainSkill) {
        existing.label = entry.mainSkill
        existing.mainSkill = entry.mainSkill
      }
      if (entry.icon) {
        existing.icon = entry.icon
      }
      if (entry.subSkills.length) {
        existing.subSkills = entry.subSkills
      }
      if (entry.subSkillIcons.length) {
        existing.subSkillIcons = entry.subSkillIcons
      }
    } else {
      nodeMap.set(entry.key, {
        key: entry.key,
        label: entry.mainSkill ?? entry.key,
        level: entry.level,
        icon: entry.icon,
        mainSkill: entry.mainSkill,
        subSkills: entry.subSkills,
        subSkillIcons: entry.subSkillIcons,
      })
    }
  }
  const ordered: MapleScouterHexaNode[] = []
  for (const key of HEXA_DISPLAY_ORDER) {
    const node = nodeMap.get(key)
    if (node) ordered.push(node)
  }
  for (const node of nodeMap.values()) {
    if (!HEXA_DISPLAY_ORDER.includes(node.key) && !ordered.includes(node)) {
      ordered.push(node)
    }
  }
  profile.hexa.nodes = ordered
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
    `排名：综合 ${formatRankLabel(profile.basic.characterRanking)} ｜ 伺服器 ${formatRankLabel(
      profile.basic.worldRanking,
    )} ｜ 职业 ${formatRankLabel(profile.basic.classRanking)}`,
    `ARC：${formatNumber(profile.basic.arcaneForce)} ｜ AUTH：${formatNumber(profile.basic.authenticForce)}`,
    `战力：${formatTaiwanNumber(profile.combat.combatPower)} ｜ 一般（380）：${formatBossValue(
      profile.combat.generalDamage380,
      profile.combat.generalDamage300,
    )} ｜ HEXA（380）：${formatBossValue(profile.combat.hexaDamage380, profile.combat.hexaDamage300)}`,
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

function formatBossValue(primary?: number | null, secondary?: number | null): string {
  if (primary === null || primary === undefined) {
    return secondary === null || secondary === undefined ? "--" : formatNumber(secondary)
  }
  const main = formatNumber(primary)
  if (secondary === null || secondary === undefined || secondary === primary) return main
  return `${main}（300：${formatNumber(secondary)}）`
}

function formatRankLabel(value?: number | null): string {
  if (value === null || value === undefined || value <= 0) return "--"
  return `#${formatNumber(value)}`
}
