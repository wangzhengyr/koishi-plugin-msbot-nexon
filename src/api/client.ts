import { Logger } from "koishi"
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
  RankingRecord,
  UnionOverviewSummary,
} from "./types"

type RankingCapableApi = BaseApi & {
  getOverallRanking: (filter?: any, dateOptions?: any) => Promise<OverallRankingResponseDto>
}

export interface MapleClientDeps {
  options: ServiceOptions
}

export class MapleClient {
  private readonly api: BaseApi
  private readonly region: MapleRegion
  private readonly debug: boolean
  private readonly logger = new Logger("msbot-nexon:api")

  constructor({ options }: MapleClientDeps) {
    this.region = options.region
    this.debug = options.debug
    this.api = createApiInstance(options.region, options.apiKey)
    this.api.timeout = options.timeout

    if (options.baseUrl) {
      const normalized = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`
      ;(this.api as any).client.defaults.baseURL = normalized
    }
  }

  async fetchCharacterInfo(name: string): Promise<CharacterInfoResult> {
    const ocid = await this.fetchOcid(name)
    const summary = await this.fetchCharacterBasic(ocid)

    let union: UnionOverviewSummary | null = null
    try {
      union = await this.fetchUnionOverview(ocid)
    } catch (error) {
      if (this.debug) {
        this.logger.warn(error as Error, "获取联盟信息失败，继续返回基础数据")
      }
      union = null
    }

    return {
      ocid,
      summary,
      union,
      experience: [],
    }
  }

  async fetchEquipments(name: string): Promise<CharacterEquipment> {
    const ocid = await this.fetchOcid(name)
    let dto
    try {
      dto = await this.api.getCharacterItemEquipment(ocid)
    } catch (error) {
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
      if (this.debug) {
        this.logger.warn(error as Error, "排名接口调用失败，ocid=%s", ocid)
      }
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
      throw new Error(this.translateError(error, "查询角色唯一标识失败"))
    }
  }

  private async fetchCharacterBasic(ocid: string): Promise<CharacterSummary> {
    let dto
    try {
      dto = await this.api.getCharacterBasic(ocid)
    } catch (error) {
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
