import { Logger } from 'koishi'
import { MapleStoryApi } from 'maplestory-openapi/tms'
import {
  MapleStoryApiError,
  MapleStoryApiErrorCode,
} from 'maplestory-openapi'

const logger = new Logger('msbot-nexon:nexon')

const taipeiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export interface CharacterProfile {
  name: string
  world: string
  gender?: string
  className: string
  classLevel?: string
  level: number
  exp: number
  expRate?: string
  guildName?: string | null
  image?: string
  createdAt: string
  accessFlag?: 'true' | 'false'
  liberationQuestClear?: string
}

export interface UnionOverview {
  level: number | null
  grade: string | null
  artifactLevel: number | null
  artifactExp: number | null
  artifactPoint: number | null
}

export interface RaiderSummary {
  preset: number
  statEffects: string[]
  occupiedEffects: string[]
  innerStats: Array<{ id: string; effect: string }>
}

export interface ArtifactSummary {
  remainAp: number | null
  effects: Array<{ name: string; level: number }>
  crystals: Array<{
    name: string
    level: number
    options: string[]
    validity: string
  }>
}

export interface CharacterBasicSnapshot {
  date: string
  level: number
  exp: number
}

export interface NexonOptions {
  apiKey: string
  baseUrl?: string
  timeout?: number
}

export interface NexonClient {
  getOcid(character: string): Promise<string>
  getCharacterBasic(ocid: string): Promise<CharacterProfile>
  getUnionOverview(ocid: string): Promise<UnionOverview>
  getUnionRaider(ocid: string): Promise<RaiderSummary>
  getUnionArtifact(ocid: string): Promise<ArtifactSummary>
  getRecentBasicHistory(ocid: string, days: number): Promise<CharacterBasicSnapshot[]>
}

export function createNexonClient(options: NexonOptions): NexonClient {
  const api = new MapleStoryApi(options.apiKey)

  if (options.baseUrl) {
    const trimmed = options.baseUrl.endsWith('/')
      ? options.baseUrl
      : `${options.baseUrl}/`
    ;(api as any).client.defaults.baseURL = trimmed
  }

  if (options.timeout) {
    api.timeout = options.timeout
  }

  async function getOcid(character: string) {
    const dto = await wrap(`获取 ${character} 的 OCID`, () => api.getCharacter(character))
    return dto.ocid
  }

  async function getCharacterBasic(ocid: string) {
    const dto = await wrap('获取角色基础信息', () => api.getCharacterBasic(ocid))
    return {
      name: dto.characterName,
      world: dto.worldName,
      gender: dto.characterGender,
      className: dto.characterClass,
      classLevel: dto.characterClassLevel,
      level: dto.characterLevel,
      exp: dto.characterExp,
      expRate: dto.characterExpRate,
      guildName: dto.characterGuildName,
      image: dto.characterImage,
      createdAt: formatDate(dto.characterDateCreate),
      accessFlag: dto.accessFlag,
      liberationQuestClear: dto.liberationQuestClear,
    }
  }

  async function getUnionOverview(ocid: string) {
    const dto = await wrap('获取联盟概览', () => api.getUnion(ocid))
    return {
      level: dto.unionLevel ?? null,
      grade: dto.unionGrade ?? null,
      artifactLevel: dto.unionArtifactLevel ?? null,
      artifactExp: dto.unionArtifactExp ?? null,
      artifactPoint: dto.unionArtifactPoint ?? null,
    }
  }

  async function getUnionRaider(ocid: string) {
    const dto = await wrap('获取战地配置', () => api.getUnionRaider(ocid))
    return {
      preset: dto.usePresetNo,
      statEffects: dto.unionRaiderStat ?? [],
      occupiedEffects: dto.unionOccupiedStat ?? [],
      innerStats: dto.unionInnerStat?.map((stat) => ({
        id: stat.statFieldId,
        effect: stat.statFieldEffect,
      })) ?? [],
    }
  }

  async function getUnionArtifact(ocid: string) {
    const dto = await wrap('获取联盟神器', () => api.getUnionArtifact(ocid))
    return {
      remainAp: dto.unionArtifactRemainAp ?? null,
      effects: dto.unionArtifactEffect?.map((effect) => ({
        name: effect.name,
        level: effect.level,
      })) ?? [],
      crystals: dto.unionArtifactCrystal?.map((crystal) => ({
        name: crystal.name,
        level: crystal.level,
        options: [
          crystal.crystalOptionName1,
          crystal.crystalOptionName2,
          crystal.crystalOptionName3,
        ].filter(Boolean),
        validity: crystal.validityFlag === '0' ? '有效' : '已失效',
      })) ?? [],
    }
  }

  async function getRecentBasicHistory(ocid: string, days: number) {
    const snapshots: CharacterBasicSnapshot[] = []
    for (let offset = days - 1; offset >= 0; offset--) {
      const dateOptions = toDateOptions(-offset)
      try {
        const dto = await wrap('获取角色历史基础信息', () =>
          api.getCharacterBasic(ocid, dateOptions),
        )
        snapshots.push({
          date: formatDate(dto.date ?? fromDateOptions(dateOptions)),
          level: dto.characterLevel,
          exp: dto.characterExp,
        })
      } catch (error) {
        if (error instanceof WrappedApiError && error.code === 'OPENAPI00009') {
          logger.warn('MapleStory API 数据尚未准备好（%s）', formatDate(fromDateOptions(dateOptions)))
          continue
        }
        throw error
      }
    }
    return snapshots
  }

  return {
    getOcid,
    getCharacterBasic,
    getUnionOverview,
    getUnionRaider,
    getUnionArtifact,
    getRecentBasicHistory,
  }
}

function toDateOptions(offsetDays: number) {
  const base = Date.now() + offsetDays * 86_400_000
  const formatted = taipeiFormatter.format(base)
  const [year, month, day] = formatted.split('-').map((segment) => Number(segment))
  return { year, month, day }
}

function formatDate(input: Date): string
function formatDate(input: string): string
function formatDate(input: Date | string): string {
  if (typeof input === 'string') {
    return input.slice(0, 10)
  }
  return taipeiFormatter.format(input)
}

function fromDateOptions(options: { year: number; month: number; day: number }) {
  const { year, month, day } = options
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return new Date(`${iso}T00:00:00+08:00`)
}

class WrappedApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

async function wrap<T>(scope: string, task: () => Promise<T>) {
  try {
    return await task()
  } catch (error) {
    if (error instanceof MapleStoryApiError) {
      const code = MapleStoryApiErrorCode[error.errorCode]
      const message = `[${code}] ${error.message}`
      logger.warn('%s：%s', scope, message)
      throw new WrappedApiError(code, `${scope}失败：${message}`)
    }
    logger.warn('%s：%o', scope, error)
    throw error
  }
}
