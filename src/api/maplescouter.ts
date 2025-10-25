import { Logger } from "koishi"
import { request } from "undici"
import { MapleRegion } from "../config"
import { InMemoryCache, createCompositeKey } from "./cache"
import {
  MapleScouterProfile,
  MapleScouterEquipment,
  MapleScouterHexaNode,
  MapleScouterSymbol,
  MapleScouterPotentialLine,
} from "../entities/scouter"

interface MapleScouterDeps {
  region: MapleRegion
  options: {
    apiKey: string
    baseUrl: string
    preset: string
    timeout: number
    debug?: boolean
  }
  cache?: InMemoryCache<MapleScouterProfile>
}

interface MapleScouterApiResponse {
  calculatedData?: {
    combatPower?: number
    calculatedDamage_300?: number
    calculatedDamage_380?: number
    calculatedHexaDamage_380?: number
    mr_hexaStat?: number
    boss300_stat?: number | string | null
    boss380_stat?: number | string | null
    boss300_hexaStat?: number | string | null
    boss380_hexaStat?: number | string | null
    maple_scouter_const?: {
      stat_score?: number
    }
  }
  userApiData?: {
    info?: Record<string, any>
    preset?: Record<string, any>
    special?: {
      now_ability?: Array<{ grade?: string; option?: string }>
    }
    settings?: {
      now_ability?: Array<{ grade?: string; option?: string }>
    }
    hexaSkill?: Record<string, number>
    hexaSkill_general?: Record<string, number>
    hexaSkill_used?: { sole_Erda?: number; sole_ErdaPrice?: number }
    symbol?: Record<string, { title?: string; type?: string; level?: number; icon?: string }>
  }
  userEquipData?: Record<string, MapleScouterApiEquip>
}

interface MapleScouterApiEquip {
  slot?: string
  name?: string
  iconUrl?: string
  starforce?: string
  scroll_upgrade?: string
  totalOption?: EquipmentOptionBlock
  addOption?: EquipmentOptionBlock
  etcOption?: EquipmentOptionBlock
  potential_option_1?: string[]
  additional_potential_option_1?: string[]
}

type EquipmentOptionBlock = Record<string, string | number | null | undefined>

const SLOT_LABELS: Record<string, string> = {
  무기: "武器",
  보조무기: "副武器",
  엠블렘: "徽章",
  모자: "帽子",
  상의: "上衣",
  하의: "下衣",
  신발: "鞋子",
  장갑: "手套",
  망토: "披风",
  어깨장식: "肩膀",
  얼굴장식: "脸饰",
  눈장식: "眼饰",
  귀고리: "耳环",
  벨트: "腰带",
  펜던트: "吊坠",
  펜던트2: "吊坠",
  반지1: "戒指 1",
  반지2: "戒指 2",
  반지3: "戒指 3",
  반지4: "戒指 4",
  "포켓 아이템": "口袋道具",
  "기계 심장": "机械心脏",
  뱃지: "徽章",
  훈장: "勋章",
}

const EQUIP_PRIORITY = [
  "무기",
  "보조무기",
  "엠블렘",
  "기계 심장",
  "훈장",
  "뱃지",
  "어깨장식",
  "반지1",
  "반지2",
  "반지3",
  "반지4",
]

const STAT_LABELS: Record<string, string> = {
  attack_power: "攻击力",
  magic_power: "魔力",
  boss_damage: "BOSS伤害",
  damage: "伤害",
  ignore_monster_armor: "无视防御",
  critical_rate: "暴击率",
  critical_damage: "暴击伤害",
  attack_power_rate: "攻击力%",
  magic_power_rate: "魔力%",
}

const PERCENT_STAT_KEYS = new Set([
  "boss_damage",
  "damage",
  "ignore_monster_armor",
  "critical_rate",
  "critical_damage",
  "attack_power_rate",
  "magic_power_rate",
])

const HEXA_LABELS: Record<string, string> = {
  skillCore1: "技能核心 I",
  skillCore2: "技能核心 II",
  masteryCore1: "精通核心 I",
  masteryCore2: "精通核心 II",
  masteryCore3: "精通核心 III",
  masteryCore4: "精通核心 IV",
  reinCore1: "强化核心 I",
  reinCore2: "强化核心 II",
  reinCore3: "强化核心 III",
  reinCore4: "强化核心 IV",
  generalCore1: "通用核心",
}

const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://maplescouter.com",
  Referer: "https://maplescouter.com/",
}

export class MapleScouterClient {
  private readonly logger = new Logger("msbot-nexon:scouter")
  private readonly userAgent = "msbot-nexon/1.0"

  constructor(private readonly deps: MapleScouterDeps) {}

  async fetchProfile(name: string): Promise<MapleScouterProfile> {
    const normalized = name.trim()
    const cacheKey = createCompositeKey([this.deps.region, normalized.toLowerCase()])
    if (this.deps.cache) {
      return this.deps.cache.wrap(cacheKey, () => this.requestProfile(normalized))
    }
    return this.requestProfile(normalized)
  }

  private async requestProfile(name: string): Promise<MapleScouterProfile> {
    const { options, region } = this.deps
    const endpoint = buildEndpoint(options.baseUrl, {
      name,
      preset: options.preset,
      region,
    })

    try {
      const response = await request(endpoint, {
        method: "GET",
        headersTimeout: options.timeout,
        bodyTimeout: options.timeout,
        headers: {
          ...DEFAULT_HEADERS,
          "api-key": options.apiKey,
          "User-Agent": this.userAgent,
        },
      })
      const text = await response.body.text()
      if (response.statusCode >= 400) {
        throw new Error(`MapleScouter 接口返回错误（HTTP ${response.statusCode}）`)
      }
      const payload = JSON.parse(text) as MapleScouterApiResponse
      return transformPayload(payload, options.preset)
    } catch (error) {
      this.logger.warn(error as Error, "获取 MapleScouter 数据失败 name=%s", name)
      throw error instanceof Error ? error : new Error("MapleScouter 接口调用失败")
    }
  }
}

function buildEndpoint(baseUrl: string, params: { name: string; preset: string; region: MapleRegion }) {
  const trimmed = baseUrl.replace(/\/$/, "")
  const search = new URLSearchParams({
    name: params.name,
    preset: params.preset,
    region: mapRegion(params.region),
  })
  return `${trimmed}/id?${search.toString()}`
}

function mapRegion(region: MapleRegion): string {
  switch (region) {
    case "kms":
      return "kms"
    case "msea":
      return "msea"
    case "tms":
    default:
      return "tms"
  }
}

function transformPayload(payload: MapleScouterApiResponse, preset: string): MapleScouterProfile {
  const info = payload.userApiData?.info ?? {}
  const hexaSkill = payload.userApiData?.hexaSkill ?? {}
  const hexaGeneral = payload.userApiData?.hexaSkill_general ?? {}
  const hexaUsed = payload.userApiData?.hexaSkill_used ?? {}
  const combat = payload.calculatedData ?? {}
  const statConst = payload.calculatedData?.maple_scouter_const ?? {}
  const bossGeneralStats = buildBossStats(combat, true)
  const bossHexaStats = buildBossStats(combat, false)

  const equipments = pickEquipHighlights(payload.userEquipData ?? {})
  const hexaNodes = buildHexaNodes(hexaSkill, hexaGeneral)
  const potentialSource =
    payload.userApiData?.settings?.now_ability ?? payload.userApiData?.special?.now_ability ?? []
  const potentials = buildPotentialLines(potentialSource)
  const symbols = buildSymbols(payload.userApiData?.symbol ?? {})

  return {
    avatar: info.character_image ?? undefined,
    preset,
    presetUsed: Boolean(info.preset_used),
    basic: {
      name: info.character_name ?? "--",
      level: info.character_level,
      expRate: info.character_exp_rate,
      job: info.character_class,
      world: info.world_name,
      guild: info.character_guild_name,
      creationDate: info.character_date_create,
      popularity: info.popularity,
      arcaneForce: info.arcaneForce,
      authenticForce: info.authenticForce,
      starforce: info.starforce,
      unionLevel: info.union_level,
      artifactLevel: info.artifact_level,
      power: info.power,
      dojangFloor: info.dojang_best_floor,
      dojangTime: info.dojang_best_time,
      characterRanking: toNumber(info.character_ranking),
      worldRanking: toNumber(info.world_ranking),
      classRanking: toNumber(info.class_ranking),
    },
    combat: {
      combatPower: toNumber(combat.combatPower) ?? combat.combatPower,
      generalDamage380: bossGeneralStats.scene380 ?? undefined,
      generalDamage300: bossGeneralStats.scene300 ?? undefined,
      hexaDamage380: bossHexaStats.scene380 ?? undefined,
      hexaDamage300: bossHexaStats.scene300 ?? undefined,
      statScore: toNumber(statConst.stat_score) ?? statConst.stat_score,
    },
    equipments,
    hexa: {
      nodes: hexaNodes,
      usedErda: hexaUsed.sole_Erda,
      usedMeso: hexaUsed.sole_ErdaPrice,
    },
    potentials,
    symbols,
  }
}

function pickEquipHighlights(source: Record<string, MapleScouterApiEquip>): MapleScouterEquipment[] {
  const entries = Object.values(source).filter((item) => item?.slot && item?.name)
  entries.sort((a, b) => {
    const aIndex = EQUIP_PRIORITY.indexOf(a.slot ?? "")
    const bIndex = EQUIP_PRIORITY.indexOf(b.slot ?? "")
    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
  return entries.map((item) => ({
    slot: item.slot ?? "",
    slotLabel: SLOT_LABELS[item.slot ?? ""] ?? (item.slot ?? ""),
    name: item.name ?? "未知装备",
    icon: item.iconUrl ?? undefined,
    starforce: toNumber(item.starforce),
    scrolls: toNumber(item.scroll_upgrade),
    flameSummary: buildFlameSummary(item.addOption),
    potentials: collectOptions(item, "potential_option"),
    additionalPotentials: collectOptions(item, "additional_potential_option"),
    stats: buildStatLines(item.totalOption),
  }))
}

function buildHexaNodes(skillBlock: Record<string, number>, generalBlock: Record<string, number>): MapleScouterHexaNode[] {
  const merged: MapleScouterHexaNode[] = []
  for (const [key, label] of Object.entries(HEXA_LABELS)) {
    const level = (skillBlock[key] ?? generalBlock[key] ?? 0) as number
    if (level === undefined) continue
    merged.push({
      key,
      label,
      level: Number(level) || 0,
    })
  }
  return merged
}

function buildPotentialLines(items: Array<{ grade?: string; option?: string }>): MapleScouterPotentialLine[] {
  return items
    .filter((line) => Boolean(line?.option))
    .map((line) => ({
      grade: line.grade ?? undefined,
      option: line.option ?? "",
    }))
}

function buildSymbols(symbols: Record<string, { title?: string; type?: string; level?: number; icon?: string }>): MapleScouterSymbol[] {
  return Object.values(symbols ?? {})
    .filter((item) => item?.title)
    .map((item) => ({
      title: item.title ?? "",
      type: item.type ?? "",
      level: item.level ?? 0,
      icon: item.icon ?? undefined,
    }))
    .sort((a, b) => (a.type ?? "").localeCompare(b.type ?? ""))
}

type BossScene = 300 | 380

interface PickOptions {
  scene: BossScene
  hexaEnabled: boolean
}

type MapleScouterBossPayload = Partial<{
  boss300_stat: number | string | null
  boss380_stat: number | string | null
  boss300_hexaStat: number | string | null
  boss380_hexaStat: number | string | null
}>

function buildBossStats(
  source: MapleScouterApiResponse["calculatedData"] | undefined,
  hexaEnabled: boolean,
): { scene380: number | null; scene300: number | null } {
  return {
    scene380: extractSceneStat(source, 380, hexaEnabled),
    scene300: extractSceneStat(source, 300, hexaEnabled),
  }
}

function extractSceneStat(
  source: MapleScouterApiResponse["calculatedData"] | undefined,
  scene: BossScene,
  hexaEnabled: boolean,
): number | null {
  if (!source) return null
  const direct = readBossRaw(source, scene, hexaEnabled)
  if (direct !== null) return direct
  return pickBossStat(source, { scene, hexaEnabled })
}

function readBossRaw(
  source: MapleScouterApiResponse["calculatedData"],
  scene: BossScene,
  hexaEnabled: boolean,
): number | null {
  const key = hexaEnabled
    ? scene === 380
      ? "boss380_hexaStat"
      : "boss300_hexaStat"
    : scene === 380
      ? "boss380_stat"
      : "boss300_stat"
  return toFiniteNumber((source as MapleScouterBossPayload)[key as keyof MapleScouterBossPayload])
}

function pickBossStat(data: MapleScouterBossPayload | undefined, opt: PickOptions): number | null {
  if (!data) return null
  const primaryKey = opt.hexaEnabled
    ? opt.scene === 380
      ? "boss380_hexaStat"
      : "boss300_hexaStat"
    : opt.scene === 380
      ? "boss380_stat"
      : "boss300_stat"
  const primary = toFiniteNumber((data as MapleScouterBossPayload)[primaryKey])
  if (primary !== null) return primary

  const fallbacks: Array<keyof MapleScouterBossPayload> = [
    opt.hexaEnabled
      ? opt.scene === 380
        ? "boss380_stat"
        : "boss300_stat"
      : opt.scene === 380
        ? "boss380_hexaStat"
        : "boss300_hexaStat",
    opt.hexaEnabled
      ? opt.scene === 380
        ? "boss300_hexaStat"
        : "boss380_hexaStat"
      : opt.scene === 380
        ? "boss300_stat"
        : "boss380_stat",
  ]
  for (const key of fallbacks) {
    const fallback = toFiniteNumber((data as MapleScouterBossPayload)[key])
    if (fallback !== null) return fallback
  }
  return null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim()
    if (!normalized) return null
    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

function buildStatLines(optionBlock?: EquipmentOptionBlock): Array<{ label: string; value: string }> {
  if (!optionBlock) return []
  const lines: Array<{ label: string; value: string }> = []
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const numeric = toFiniteNumber((optionBlock as Record<string, unknown>)[key])
    if (numeric === null || numeric === 0) continue
    if (key === "equipment_level_decrease") {
      const valueText = formatStatNumber(Math.abs(numeric))
      lines.push({
        label,
        value: `-${valueText}`,
      })
      continue
    }
    const sign = numeric >= 0 ? "+" : "-"
    const valueText = formatStatNumber(Math.abs(numeric))
    const withUnit = PERCENT_STAT_KEYS.has(key) ? `${valueText}%` : valueText
    lines.push({
      label,
      value: `${sign}${withUnit}`,
    })
  }
  return lines
}

function formatStatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1")
}

function buildFlameSummary(optionBlock?: EquipmentOptionBlock): string | undefined {
  if (!optionBlock) return undefined
  const entries = Object.entries(optionBlock)
    .map(([key, value]) => {
      const numeric = toFiniteNumber(value)
      if (numeric === null || numeric <= 0) return null
      const label =
        STAT_LABELS[key] ??
        (key === "max_hp" ? "HP" : key === "max_mp" ? "MP" : key.replace(/_/g, " ").toUpperCase())
      const amount = formatStatNumber(numeric)
      const suffix = PERCENT_STAT_KEYS.has(key) ? `${amount}%` : amount
      return `${label}+${suffix}`
    })
    .filter((entry): entry is string => Boolean(entry))
  return entries.length ? entries.slice(0, 2).join(" / ") : undefined
}

function cleanupOptions(options?: Array<string | null | undefined>): string[] | undefined {
  if (!options || !options.length) return undefined
  const sanitized = options
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter((line) => line.length > 0)
  return sanitized.length ? sanitized : undefined
}

function collectOptions(item: MapleScouterApiEquip, prefix: string): string[] | undefined {
  const merged: Array<string | null | undefined> = []
  for (const key of Object.keys(item)) {
    if (!key.startsWith(prefix)) continue
    const raw = (item as Record<string, unknown>)[key]
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        merged.push(typeof entry === "string" ? entry : null)
      }
    }
  }
  return cleanupOptions(merged)
}

function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  const numeric = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(numeric)) return undefined
  return numeric
}
