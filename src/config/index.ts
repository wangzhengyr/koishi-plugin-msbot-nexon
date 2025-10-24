import { Schema } from 'koishi'

export type MapleRegion = 'tms' | 'kms' | 'msea'

export interface CacheOptions {
  enabled: boolean
  ttl: number
  maxSize: number
}

export interface ServiceOptions {
  apiKey: string
  region: MapleRegion
  baseUrl?: string
  timeout: number
  experienceDays: number
  cache: CacheOptions
  allowBinding: boolean
  debug: boolean
}

export type Config = ServiceOptions

const regionChoices = [
  Schema.const('tms').description('台服（TMS）'),
  Schema.const('kms').description('韩服（KMS）'),
  Schema.const('msea').description('东南亚服（MSEA）'),
]

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string()
    .required()
    .description('Nexon Open API 密钥（必填）'),
  region: Schema.union(regionChoices)
    .default('tms')
    .description('选择要查询的冒险岛地区'),
  baseUrl: Schema.string()
    .description('自定义 Nexon Open API 地址，正常情况下保持为空即可')
    .default('')
    .experimental(),
  timeout: Schema.number()
    .default(8000)
    .min(2000)
    .max(20000)
    .description('API 请求超时时间（毫秒）'),
  experienceDays: Schema.number()
    .default(7)
    .min(3)
    .max(14)
    .description('经验曲线统计天数'),
  cache: Schema.object({
    enabled: Schema.boolean()
      .default(true)
      .description('开启内存缓存以降低 API 调用频率'),
    ttl: Schema.number()
      .default(300)
      .min(60)
      .max(3600)
      .description('缓存有效时间（秒）'),
    maxSize: Schema.number()
      .default(512)
      .min(32)
      .max(2048)
      .description('缓存条目上限'),
  }).default({
    enabled: true,
    ttl: 300,
    maxSize: 512,
  }),
  allowBinding: Schema.boolean()
    .default(true)
    .description('允许用户绑定默认角色，便于免参数查询'),
  debug: Schema.boolean()
    .default(false)
    .description('输出详细调试日志（包含请求参数、响应片段）'),
})

export function normalizeConfig(config: Config): Config {
  const baseUrl = config.baseUrl?.trim()
  return {
    ...config,
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, '') : undefined,
    cache: {
      enabled: config.cache.enabled,
      ttl: config.cache.ttl,
      maxSize: config.cache.maxSize,
    },
  }
}

export const REGION_LABELS: Record<MapleRegion, string> = {
  tms: '台服',
  kms: '韩服',
  msea: '东南亚服',
}

export function getRegionLabel(region: MapleRegion): string {
  return REGION_LABELS[region] ?? region
}
