import { MapleStoryApi as BaseApi, MapleStoryApiError, MapleStoryApiErrorCode } from "maplestory-openapi"
import { MapleStoryApi as TmsApi } from "maplestory-openapi/tms"
import { MapleStoryApi as KmsApi, OverallRankingResponseDto } from "maplestory-openapi/kms"
import { MapleStoryApi as MseaApi } from "maplestory-openapi/msea"
import { Logger } from "koishi"
import { MapleRegion, ServiceOptions } from "../config"
import { InMemoryCache, createCompositeKey } from "./cache"
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

const REGION_TIMEZONES: Record<MapleRegion, string> = {
  tms: "Asia/Taipei",
  kms: "Asia/Seoul",
  msea: "Asia/Singapore",
}

const REGION_BASE_URLS: Record<MapleRegion, string> = {
  tms: "https://open.api.nexon.com/maplestorytw/",
  kms: "https://open.api.nexon.com/maplestory/",
  msea: "https://open.api.nexon.com/maplestorysea/",
}

const STAT_KEYS = [
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

const MILLISECONDS_PER_DAY = 86_400_000

type RankingCapableApi = BaseApi & {
  getOverallRanking: (filter?: any, dateOptions?: any) => Promise<OverallRankingResponseDto>
}

export interface MapleClientDeps {
  options: ServiceOptions
}

interface DateParts {
  year: number
  month: number
  day: number
}

interface RequestMeta {
  scope: string
  params?: Record<string, any>
  endpoint?: string
}

export class MapleClient {
  private readonly api: BaseApi
  private readonly cache?: InMemoryCache<any>
  private readonly region: MapleRegion
  private readonly experienceDays: number
  private readonly debug: boolean
  private readonly logger = new Logger("msbot-nexon:api")
  private readonly baseUrl?: string

  constructor({ options }: MapleClientDeps) {
    this.region = options.region
    this.experienceDays = options.experienceDays
    this.debug = options.debug
    this.api = createApiInstance(options.region, options.apiKey)

    const configuredBase = options.baseUrl?.trim()
    const resolvedBase = configuredBase && configuredBase.length ? configuredBase : REGION_BASE_URLS[this.region]
    if (resolvedBase) {
      const normalized = resolvedBase.endsWith("/") ? resolvedBase : `${resolvedBase}/`
      ;(this.api as any).client.defaults.baseURL = normalized
      this.baseUrl = normalized
    } else {
      this.baseUrl = (this.api as any).client?.defaults?.baseURL
    }

    this.api.timeout = options.timeout
    if (options.cache.enabled) {
      this.cache = new InMemoryCache({
        ttl: options.cache.ttl * 1000,
        maxSize: options.cache.maxSize,
      })
    }
  }

  async fetchCharacterInfo(name: string): Promise<CharacterInfoResult> {
    this.logger.info('66')
    const ocid = await this.fetchOcid(name)
    const [basic, history] = await Promise.all([
      this.fetchCharacterBasic(ocid),
      this.fetchExperienceHistory(ocid, this.experienceDays + 1),
    ])

    let union: UnionOverviewSummary | null = null
    try {
      union = await this.fetchUnionOverview(ocid)
    } catch (error) {
      if (this.debug) {
        this.logger.debug(error as Error, "获取联盟信息失败，继续返回基础数据")
      }
      union = null
    }

    const experience = buildExperienceSeries(history)

    return {
      ocid,
      summary: basic,
      union,
      experience,
    }
  }

  async fetchEquipments(name: string): Promise<CharacterEquipment> {
    const ocid = await this.fetchOcid(name)
    const dto = await this.request(
      createCompositeKey(["equipment", this.region, ocid]),
      () => this.api.getCharacterItemEquipment(ocid),
      "获取装备信息失败",
      { scope: "getCharacterItemEquipment", params: { ocid }, endpoint: "/v1/character/item-equipment" },
    )

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
      const response = await this.request<OverallRankingResponseDto>(
        createCompositeKey(["ranking", this.region, ocid]),
        () => api.getOverallRanking({ ocid }),
        "获取等级排名失败",
        { scope: "getOverallRanking", params: { ocid }, endpoint: "/v1/ranking/overall" },
      )
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
      return {
        ocid,
        records: [],
        available: false,
        message: this.translateError(error, "获取排名信息失败"),
      }
    }
  }

  private async fetchOcid(name: string): Promise<string> {

    const dto = await this.api.getCharacter(name)
    if (this.debug) {
      this.logger.info("2333")

    }
    return dto.ocid


    // return this.request(
    //   createCompositeKey(["ocid", this.region, name]),
    //   async () => {
    //     const dto = await this.api.getCharacter(name)
    //     return dto.ocid
    //   },
    //   "查询角色唯一标识失败",
    //   { scope: "getCharacter", params: { name, region: this.region }, endpoint: "/v1/character" },
    // )
  }

  private async fetchCharacterBasic(ocid: string): Promise<CharacterSummary> {
    const dto = await this.request(
      createCompositeKey(["basic", this.region, ocid]),
      () => this.api.getCharacterBasic(ocid),
      "获取角色基本信息失败",
      { scope: "getCharacterBasic", params: { ocid }, endpoint: "/v1/character/basic" },
    )

    const extra = dto as Record<string, any>

    return {
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
      accessFlag: typeof extra.accessFlag === "string" ? extra.accessFlag : null,
      liberationQuestClear:
        typeof extra.liberationQuestClear === "string" ? extra.liberationQuestClear : null,
    }
  }

  private async fetchUnionOverview(ocid: string): Promise<UnionOverviewSummary | null> {
    try {
      const dto = await this.request(
        createCompositeKey(["union", this.region, ocid]),
        () => this.api.getUnion(ocid),
        "获取联盟信息失败",
        { scope: "getUnion", params: { ocid }, endpoint: "/v1/character/union" },
      )
      return {
        level: dto.unionLevel ?? null,
        grade: dto.unionGrade ?? null,
        artifactLevel: dto.unionArtifactLevel ?? null,
        artifactPoint: dto.unionArtifactPoint ?? null,
      }
    } catch (error) {
      const message = this.translateError(error, "获取联盟信息失败")
      if (message.includes("OPENAPI00009")) {
        return null
      }
      throw new Error(message)
    }
  }

  private async fetchExperienceHistory(ocid: string, days: number): Promise<ExperiencePoint[]> {
    const formatter = getDateFormatter(this.region)
    const tasks: Promise<ExperiencePoint | null>[] = []

    for (let offset = 0; offset < days; offset++) {
      const options = toDateOptions(formatter, -offset)
      const cacheKey = createCompositeKey([
        "history",
        this.region,
        ocid,
        options.year,
        options.month,
        options.day,
      ])

      tasks.push(
        this.request(
          cacheKey,
          async () => {
            try {
              const dto = await this.api.getCharacterBasic(ocid, options)
              return {
                date: formatDateString(dto.date ?? fromDateOptions(options)),
                level: dto.characterLevel,
                exp: dto.characterExp,
                gain: 0,
              }
            } catch (error) {
              if (error instanceof MapleStoryApiError) {
                const code = MapleStoryApiErrorCode[error.errorCode]
                if (code === "OPENAPI00009" || code === "OPENAPI00008") {
                  return null
                }
              }
              throw error
            }
          },
          "获取历史记录失败",
          { scope: "getCharacterBasic:history", params: { ocid, options }, endpoint: "/v1/character/basic" },
        ),
      )
    }

    const snapshots = (await Promise.all(tasks)).filter((item): item is ExperiencePoint => Boolean(item))
    return snapshots
  }

  private async request<T>(
    cacheKey: string,
    task: () => Promise<T>,
    fallback: string,
    meta?: RequestMeta,
  ): Promise<T> {
    const execute = async () => {
      try {
        if (this.debug && meta) {
          const url = combineUrl(this.baseUrl, meta.endpoint)
          this.logger.debug("[%s] request url=%s params=%o", meta.scope, url, meta.params ?? {})
        }
        const data = await task()
        if (this.debug && meta) {
          this.logger.debug("[%s] success payload=%s", meta.scope, summarizeForLog(data))
        }
        return data
      } catch (error) {
        if (this.debug && meta) {
          const url = combineUrl(this.baseUrl, meta.endpoint)
          this.logger.warn(
            "[%s] failed url=%s params=%o message=%s",
            meta.scope,
            url,
            meta.params ?? {},
            error instanceof Error ? error.message : String(error),
          )
        }
        throw new Error(this.translateError(error, fallback))
      }
    }

    if (!this.cache) return execute()
    return this.cache.wrap(cacheKey, execute) as Promise<T>
  }

  private translateError(error: unknown, fallback: string): string {
    if (error instanceof MapleStoryApiError) {
      const code = MapleStoryApiErrorCode[error.errorCode]
      return `${fallback}（${code}）`
    }
    if (error instanceof Error) return error.message
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

function getDateFormatter(region: MapleRegion): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REGION_TIMEZONES[region],
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function toDateOptions(formatter: Intl.DateTimeFormat, offsetDays: number): DateParts {
  const target = Date.now() + offsetDays * MILLISECONDS_PER_DAY
  const [year, month, day] = formatter
    .format(target)
    .split("-")
    .map((value) => Number(value))
  return { year, month, day }
}

function fromDateOptions({ year, month, day }: DateParts): Date {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return new Date(`${iso}T00:00:00Z`)
}

function formatDateString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return value.slice(0, 10)
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
  for (const key of STAT_KEYS) {
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

function summarizeForLog(payload: unknown): string {
  try {
    const json = JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
    if (!json) return ""
    return json.length > 400 ? `${json.slice(0, 400)}...` : json
  } catch {
    return String(payload)
  }
}

function combineUrl(base?: string, endpoint?: string): string {
  if (endpoint?.startsWith("http")) return endpoint
  const normalizedBase = base?.replace(/\/$/, "") ?? ""
  const normalizedEndpoint = endpoint ? endpoint.replace(/^\//, "") : ""
  if (!normalizedBase) return normalizedEndpoint || "(inline-task)"
  if (!normalizedEndpoint) return normalizedBase
  return `${normalizedBase}/${normalizedEndpoint}`
}
