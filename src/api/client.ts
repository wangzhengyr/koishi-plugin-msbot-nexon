import { Logger } from "koishi"
import { request } from "undici"
import {
  MapleStoryApi as BaseApi,
  MapleStoryApiError,
  MapleStoryApiErrorCode,
} from "maplestory-openapi"
import { MapleStoryApi as TmsApi } from "maplestory-openapi/tms"
import {
  MapleStoryApi as KmsApi,
  OverallRankingResponseDto,
} from "maplestory-openapi/kms"
import { MapleStoryApi as MseaApi } from "maplestory-openapi/msea"
import { MapleRegion, ServiceOptions } from "../config"
import { CharacterInfoResult } from "../entities/character"
import { CharacterEquipment } from "../entities/equipment"
import { CharacterRanking } from "../entities/ranking"
import {
  CharacterSummary,
  EquipmentItemSummary,
  EquipmentStatBlock,
  ExperiencePoint,
  RankingRecord,
  UnionOverviewSummary,
} from "./types"
import { buildExperienceSeries } from "../utils/experience"

const OPEN_API_DEFAULT_BASE = "https://open.api.nexon.com"

const REGION_ENDPOINT_PREFIX: Record<MapleRegion, string> = {
  tms: "maplestorytw/v1",
  kms: "maplestory/v1",
  msea: "maplestorysea/v1",
}

const REGION_TIMEZONES: Record<MapleRegion, string> = {
  tms: "Asia/Taipei",
  kms: "Asia/Seoul",
  msea: "Asia/Singapore",
}

const MILLISECONDS_PER_DAY = 86_400_000

interface DateParts {
  year: number
  month: number
  day: number
}

type RankingCapableApi = BaseApi & {
  getOverallRanking: (filter?: any, dateOptions?: any) => Promise<OverallRankingResponseDto>
}

export interface HexaMatrixNode {
  key: string
  level: number
  mainSkill?: string
  icon?: string
  subSkills: string[]
  subSkillIcons: string[]
}

export interface MapleClientDeps {
  options: ServiceOptions
}

export class MapleClient {
  private readonly api: BaseApi
  private readonly region: MapleRegion
  private readonly experienceDays: number
  private readonly debug: boolean
  private readonly logger = new Logger("msbot-nexon:api")
  private readonly dateFormatter: Intl.DateTimeFormat
  private readonly apiKey: string
  private readonly openApiBase: string
  private readonly timeout: number

  constructor({ options }: MapleClientDeps) {
    this.region = options.region
    this.experienceDays = Math.max(1, options.experienceDays ?? 7)
    this.debug = options.debug
    this.apiKey = options.apiKey
    this.timeout = options.timeout
    this.openApiBase = options.baseUrl?.trim()
      ? options.baseUrl.trim().replace(/\/$/, "")
      : OPEN_API_DEFAULT_BASE
    this.api = createApiInstance(options.region, options.apiKey)
    this.api.timeout = options.timeout
    this.dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: REGION_TIMEZONES[this.region],
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    if (options.baseUrl) {
      const normalized = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`
      ;(this.api as any).client.defaults.baseURL = normalized
    }
  }

  async fetchCharacterInfo(name: string): Promise<CharacterInfoResult> {
    const ocid = await this.fetchOcid(name)
    const summary = await this.fetchCharacterBasic(ocid)
    const experience = await this.fetchExperienceHistory(ocid)

    let union: UnionOverviewSummary | null = null
    try {
      union = await this.fetchUnionOverview(ocid)
    } catch (error) {
      this.logger.warn(error as Error, "[getUnion] 获取联盟信息失败，继续返回基础数据 ocid=%s", ocid)
      union = null
    }

    return {
      ocid,
      summary,
      union,
      experience,
    }
  }

  async fetchEquipments(name: string): Promise<CharacterEquipment> {
    const ocid = await this.fetchOcid(name)
    let dto
    try {
      dto = await this.api.getCharacterItemEquipment(ocid)
    } catch (error) {
      this.logger.warn(error as Error, "[getCharacterItemEquipment] 获取装备信息失败 ocid=%s", ocid)
      throw new Error(this.translateError(error, "获取装备信息失败"))
    }

    const items = dto.itemEquipment?.map(mapEquipmentItem) ?? []

    return {
      ocid,
      items,
      title: dto.title
        ? {
            name: dto.title.titleName ?? "",
            icon: dto.title.titleIcon,
            description: dto.title.titleDescription ?? undefined,
          }
        : null,
    }
  }

  async fetchHexaMatrix(ocid: string): Promise<HexaMatrixNode[]> {
    const prefix = REGION_ENDPOINT_PREFIX[this.region]
    if (!this.apiKey || !prefix) return []
    const endpoint = `${this.openApiBase}/${prefix}/character/hexamatrix?ocid=${encodeURIComponent(ocid)}`
    try {
      const response = await request(endpoint, {
        method: "GET",
        headersTimeout: this.timeout,
        bodyTimeout: this.timeout,
        headers: {
          "Content-Type": "application/json",
          "x-nxopen-api-key": this.apiKey,
        },
      })
      if (response.statusCode >= 400) {
        throw new Error(`HexaMatrix 接口响应异常（HTTP ${response.statusCode}）`)
      }
      const payload = JSON.parse(await response.body.text())
      return mapHexaMatrixPayload(payload)
    } catch (error) {
      this.logger.warn(error as Error, "[getHexaMatrix] 获取六转核心详情失败 ocid=%s", ocid)
      return []
    }
  }

  async fetchRanking(name: string): Promise<CharacterRanking> {
    const ocid = await this.fetchOcid(name)
    const api = this.api

    if (!isRankingCapable(api)) {
      return {
        ocid,
        records: [],
        available: false,
        message: "当前地区暂不提供官方排名接口",
      }
    }

    try {
      const response = await api.getOverallRanking({ ocid })
      const records: RankingRecord[] = (response.ranking ?? []).map((entry: any) => ({
        date: formatDateString(entry.date),
        ranking: entry.ranking,
        characterName: entry.characterName,
        characterLevel: entry.characterLevel,
        expRate: entry.characterExpRate,
        worldName: entry.worldName,
        className: entry.className ?? entry.subClassName ?? "",
      }))

      if (!records.length) {
        return {
          ocid,
          records,
          available: false,
          message: "未找到角色在当前日期的排名记录",
        }
      }

      return {
        ocid,
        records,
        available: true,
      }
    } catch (error) {
      const message = this.translateError(error, "获取排名信息失败")
      this.logger.warn(error as Error, "[getOverallRanking] 调用失败 ocid=%s", ocid)
      return {
        ocid,
        records: [],
        available: false,
        message,
      }
    }
  }

  private async fetchOcid(name: string): Promise<string> {
    try {
      const dto = await this.api.getCharacter(name)
      return dto.ocid
    } catch (error) {
      this.logger.warn(error as Error, "[getCharacter] 查询OCID失败 name=%s", name)
      throw new Error(this.translateError(error, "查询角色唯一标识失败"))
    }
  }

  private async fetchCharacterBasic(ocid: string): Promise<CharacterSummary> {
    let dto
    try {
      dto = await this.api.getCharacterBasic(ocid)
    } catch (error) {
      this.logger.warn(error as Error, "[getCharacterBasic] 获取角色基本信息失败 ocid=%s", ocid)
      throw new Error(this.translateError(error, "获取角色基本信息失败"))
    }

    const extra = dto as Record<string, any>
    const accessFlag = typeof extra.accessFlag === "string" ? extra.accessFlag : null

    return {
      ...dto,
      name: dto.characterName,
      world: dto.worldName,
      gender: dto.characterGender,
      job: dto.characterClass,
      jobDetail: dto.characterClassLevel,
      level: dto.characterLevel,
      exp: dto.characterExp,
      expRate: dto.characterExpRate,
      guild: dto.characterGuildName,
      image: dto.characterImage,
      createDate: dto.characterDateCreate?.toISOString?.() ?? null,
      accessFlag: accessFlag === "true" || accessFlag === "false" ? accessFlag : null,
      liberationQuestClear:
        typeof extra.liberationQuestClear === "string" ? extra.liberationQuestClear : null,
    } as CharacterSummary
  }

  private async fetchUnionOverview(ocid: string): Promise<UnionOverviewSummary | null> {
    try {
      const dto = await this.api.getUnion(ocid)
      return {
        level: dto.unionLevel ?? null,
        grade: dto.unionGrade ?? null,
        artifactLevel: dto.unionArtifactLevel ?? null,
        artifactPoint: dto.unionArtifactPoint ?? null,
      }
    } catch (error) {
      if (error instanceof MapleStoryApiError) {
        const code = MapleStoryApiErrorCode[error.errorCode]
        if (code === "OPENAPI00009") {
          return null
        }
      }
      throw new Error(this.translateError(error, "获取联盟信息失败"))
    }
  }

  private async fetchExperienceHistory(ocid: string): Promise<ExperiencePoint[]> {
    const snapshots: Array<{ date: string; level: number; exp: number }> = []
    for (let offset = this.experienceDays; offset >= 0; offset--) {
      const options = this.getDateOptions(offset)
      try {
        const dto = await this.api.getCharacterBasic(ocid, options as { year: number; month: number; day: number })
        const exp = Number(dto.characterExp ?? 0)
        if (Number.isNaN(exp)) continue
        const level = Number(dto.characterLevel ?? 0)
        const dateLabel = dto.date ? formatDateString(dto.date) : formatDateFromParts(options)
        snapshots.push({
          date: dateLabel,
          level,
          exp,
        })
      } catch (error) {
        if (error instanceof MapleStoryApiError) {
          const code = MapleStoryApiErrorCode[error.errorCode]
          if (code === "OPENAPI00009" || code === "OPENAPI00008") {
            continue
          }
        }
        if (this.debug) {
          this.logger.warn(
            error as Error,
            "[getCharacterBasic] 获取经验记录失败 ocid=%s date=%s-%s-%s",
            ocid,
            options.year,
            options.month,
            options.day,
          )
        }
      }
    }
    const series = buildExperienceSeries(snapshots)
    return series
  }

  private getDateOptions(daysAgo: number): DateParts {
    const target = Date.now() - daysAgo * MILLISECONDS_PER_DAY
    const formatted = this.dateFormatter.format(target)
    const [year, month, day] = formatted.split("-").map((value) => Number(value))
    return {
      year,
      month,
      day,
    }
  }

  private translateError(error: unknown, fallback: string): string {
    if (error instanceof MapleStoryApiError) {
      const code = MapleStoryApiErrorCode[error.errorCode]
      return `${fallback}（${code}）`
    }
    if (error instanceof Error) {
      return error.message
    }
    return fallback
  }
}

function createApiInstance(region: MapleRegion, apiKey: string): BaseApi {
  switch (region) {
    case "tms":
      return new TmsApi(apiKey)
    case "kms":
      return new KmsApi(apiKey)
    case "msea":
      return new MseaApi(apiKey)
    default:
      throw new Error(`暂不支持的地区：${region}`)
  }
}

function isRankingCapable(api: BaseApi): api is RankingCapableApi {
  return typeof (api as any).getOverallRanking === "function"
}

function formatDateString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return value.slice(0, 10)
}

function formatDateFromParts({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function mapEquipmentItem(item: any): EquipmentItemSummary {
  const base = pickStatBlock(item.itemBaseOption)
  const additional = pickStatBlock(item.itemAddOption)
  const starforce = pickStatBlock(item.itemStarforceOption)

  const potential = [item.potentialOption1, item.potentialOption2, item.potentialOption3].filter(Boolean)
  const additionalPotential = [
    item.additionalPotentialOption1,
    item.additionalPotentialOption2,
    item.additionalPotentialOption3,
  ].filter(Boolean)

  return {
    itemName: item.itemName,
    icon: item.itemIcon ?? null,
    slot: item.itemEquipmentSlot,
    base,
    additional: hasStats(additional) ? additional : undefined,
    starforce: hasStats(starforce) ? starforce : undefined,
    potential: potential.length ? potential : undefined,
    additionalPotential: additionalPotential.length ? additionalPotential : undefined,
    isUniqueEquip: Boolean(item.potentialOptionGrade),
    scrollCount: item.scrollUpgrade,
  }
}

function pickStatBlock(source: any): EquipmentStatBlock {
  if (!source) return {}
  const result: EquipmentStatBlock = {}
  const keys = Object.keys(source) as Array<keyof typeof source>
  for (const key of keys) {
    if (!isStatKey(key)) continue
    const value = source[key]
    if (value && value !== "0" && value !== "0%") {
      result[key] = String(value)
    }
  }
  return result
}

function hasStats(block: EquipmentStatBlock): boolean {
  return Object.keys(block).length > 0
}

function isStatKey(key: PropertyKey): key is (typeof STAT_WHITELIST)[number] {
  return STAT_WHITELIST.includes(key as (typeof STAT_WHITELIST)[number])
}

const STAT_WHITELIST = [
  "str",
  "dex",
  "int",
  "luk",
  "maxHp",
  "maxMp",
  "attackPower",
  "magicPower",
  "armor",
  "speed",
  "jump",
  "bossDamage",
  "damage",
  "allStat",
  "criticalRate",
] as const

const HEXA_KEY_ORDER = [
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

interface HexaCounters {
  skill: number
  mastery: number
  rein: number
  general: number
}

function mapHexaMatrixPayload(payload: any): HexaMatrixNode[] {
  const entries = extractHexaCoreEntries(payload)
  if (!entries.length) return []
  const counters: HexaCounters = { skill: 0, mastery: 0, rein: 0, general: 0 }
  const mapped = entries
    .map((entry: any) => normalizeHexaEntry(entry, counters))
    .filter((entry): entry is HexaMatrixNode => Boolean(entry))
  mapped.sort((a, b) => HEXA_KEY_ORDER.indexOf(a.key) - HEXA_KEY_ORDER.indexOf(b.key))
  return mapped
}

function extractHexaCoreEntries(payload: any): any[] {
  if (!payload || typeof payload !== "object") return []
  const pools = [
    payload.characterHexaCoreEquipment,
    payload.character_hexa_core_equipment,
    payload.characterHexaMatrix?.characterHexaCoreEquipment,
    payload.character_hexamatrix?.character_hexa_core_equipment,
    payload.characterHexaMatrix,
    payload.character_hexamatrix,
    payload.hexaCoreEquipment,
    payload.hexa_core_equipment,
  ]
  for (const candidate of pools) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate
    }
  }
  return []
}

function normalizeHexaEntry(entry: any, counters: HexaCounters): HexaMatrixNode | null {
  if (!entry || typeof entry !== "object") return null
  const typeSeed =
    entry.coreType ??
    entry.core_type ??
    entry.slotType ??
    entry.slot_type ??
    entry.slotName ??
    entry.slot_name ??
    entry.slotId ??
    entry.slot_id ??
    ""
  const key = resolveHexaKey(String(typeSeed), counters)
  if (!key) return null
  const rawLevel =
    entry.hexaCoreLevel ??
    entry.hexa_core_level ??
    entry.coreLevel ??
    entry.core_level ??
    entry.level ??
    0
  const level = Number(rawLevel) && Number.isFinite(Number(rawLevel)) ? Number(rawLevel) : 0
  const main = readSkillDetails(entry, "mainSkill")
  const sub1 = readSkillDetails(entry, "subSkill1")
  const sub2 = readSkillDetails(entry, "subSkill2")
  const subEntries = [sub1, sub2].filter(Boolean) as Array<{ name?: string; icon?: string }>
  const subSkills = subEntries.map((item) => item.name).filter(Boolean) as string[]
  const subIcons = subEntries.map((item) => item.icon).filter(Boolean) as string[]
  const mainName =
    main?.name ??
    entry.coreName ??
    entry.core_name ??
    entry.hexaCoreName ??
    entry.hexa_core_name ??
    undefined
  const mainIcon =
    main?.icon ??
    entry.coreIcon ??
    entry.core_icon ??
    entry.hexaCoreIcon ??
    entry.hexa_core_icon ??
    undefined

  return {
    key,
    level,
    mainSkill: mainName,
    icon: mainIcon,
    subSkills,
    subSkillIcons: subIcons,
  }
}

function resolveHexaKey(typeSeed: string, counters: HexaCounters): string | null {
  const type = typeSeed.toLowerCase()
  if (type.includes("skill")) {
    counters.skill += 1
    return `skillCore${counters.skill}`
  }
  if (type.includes("mastery") || type.includes("master")) {
    counters.mastery += 1
    return `masteryCore${counters.mastery}`
  }
  if (type.includes("rein") || type.includes("enhance") || type.includes("reinforce")) {
    counters.rein += 1
    return `reinCore${counters.rein}`
  }
  if (type.includes("general") || type.includes("common") || type.includes("basic")) {
    counters.general += 1
    return `generalCore${counters.general}`
  }

  const total = counters.skill + counters.mastery + counters.rein + counters.general
  if (total < 2) {
    counters.skill += 1
    return `skillCore${counters.skill}`
  }
  if (total < 6) {
    counters.mastery += 1
    return `masteryCore${counters.mastery}`
  }
  if (total < 10) {
    counters.rein += 1
    return `reinCore${counters.rein}`
  }
  counters.general += 1
  return `generalCore${counters.general}`
}

function readSkillDetails(entry: any, base: string): { name?: string; icon?: string } | null {
  const candidates = buildCandidateKeys(base)
  for (const key of candidates) {
    const value = entry[key]
    if (value && typeof value === "object") {
      const name = value.skillName ?? value.skill_name ?? value.name
      const icon = value.skillIcon ?? value.skill_icon ?? value.icon
      if (name || icon) return { name: name ?? undefined, icon: icon ?? undefined }
    }
  }
  let selectedName: string | undefined
  let selectedIcon: string | undefined
  for (const key of candidates) {
    const nameKeys = [`${key}Name`, `${key}_name`, `${key}name`]
    const iconKeys = [`${key}Icon`, `${key}_icon`, `${key}icon`]
    for (const nameKey of nameKeys) {
      const candidate = entry[nameKey]
      if (typeof candidate === "string" && candidate) {
        selectedName = candidate
        break
      }
    }
    for (const iconKey of iconKeys) {
      const candidate = entry[iconKey]
      if (typeof candidate === "string" && candidate) {
        selectedIcon = candidate
        break
      }
    }
  }
  if (!selectedName && !selectedIcon) return null
  return {
    name: selectedName,
    icon: selectedIcon,
  }
}

function buildCandidateKeys(base: string): string[] {
  const set = new Set<string>()
  set.add(base)
  const snake = toSnakeCase(base)
  set.add(snake)
  set.add(snake.replace(/(\d)/g, "_$1"))
  return Array.from(set)
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([a-zA-Z])(\d)/g, "$1_$2")
    .toLowerCase()
}
