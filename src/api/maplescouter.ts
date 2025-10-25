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
  str: "力量",
  dex: "敏捷",
  int: "智力",
  luk: "幸运",
  attack_power: "攻击力",
  magic_power: "魔力",
  boss_damage: "BOSS伤害",
  ignore_monster_armor: "无视防御",
  all_stat: "全属性",
}

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

  const equipments = pickEquipHighlights(payload.userEquipData ?? {})
  const hexaNodes = buildHexaNodes(hexaSkill, hexaGeneral)
  const potentials = buildPotentialLines(payload.userApiData?.special?.now_ability ?? [])
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
    },
    combat: {
      combatPower: combat.combatPower,
      generalDamage380: combat.calculatedDamage_380,
      hexaDamage380: combat.calculatedHexaDamage_380 ?? combat.calculatedDamage_380,
      hexaBonus: combat.mr_hexaStat,
      statScore: statConst.stat_score,
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
    potentials: cleanupOptions(item.potential_option_1),
    additionalPotentials: cleanupOptions(item.additional_potential_option_1),
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

function buildStatLines(optionBlock?: EquipmentOptionBlock): Array<{ label: string; value: string }> {
  if (!optionBlock) return []
  const lines: Array<{ label: string; value: string }> = []
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const value = optionBlock[key]
    if (!value || Number(value) === 0) continue
    const formatted = key.includes("damage") || key.includes("armor") || key.includes("all_stat") ? `${value}%` : `${value}`
    lines.push({
      label,
      value: key.includes("attack") || key.includes("magic") ? `+${formatted}` : `+${formatted}`,
    })
  }
  return lines.slice(0, 5)
}

function buildFlameSummary(optionBlock?: EquipmentOptionBlock): string | undefined {
  if (!optionBlock) return undefined
  const entries = Object.entries(optionBlock)
    .filter(([, value]) => Number(value) > 0)
    .filter(([key]) => key in STAT_LABELS || key === "max_hp" || key === "max_mp")
    .map(([key, value]) => {
      const label = STAT_LABELS[key] ?? (key === "max_hp" ? "HP" : key === "max_mp" ? "MP" : key)
      return `${label}+${value}`
    })
  return entries.length ? entries.slice(0, 2).join(" / ") : undefined
}

function cleanupOptions(options?: string[]): string[] | undefined {
  if (!options || !options.length) return undefined
  const sanitized = options.filter(Boolean)
  return sanitized.length ? sanitized : undefined
}

function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  const numeric = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(numeric)) return undefined
  return numeric
}
