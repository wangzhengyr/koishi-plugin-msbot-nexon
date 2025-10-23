import { randomUUID } from 'crypto'
import { Context, Logger, Schema, Session, h } from 'koishi'
import { buildExperienceSeries } from './experience'
import { createNexonClient } from './nexon'
import { renderUnionTemplate } from './template'

export const name = 'msbot-nexon'

export const inject = {
  required: ['database', 'server'] as const,
  optional: ['puppeteer', 'assets', 'canvas'] as const,
}

const DEFAULT_BASE_URL = 'https://open.api.nexon.com'
const DEFAULT_DAYS = 7
const logger = new Logger(name)

interface GmsInfoRecord {
  id: number
  userId: string
  name: string
}

interface ResolveResult {
  ok: boolean
  name?: string
  usedBinding?: boolean
  newlyBound?: boolean
  reason?: 'missing-session' | 'missing-user' | 'timeout' | 'empty-name'
}

interface PreviewEntry {
  html: string
  expiresAt: number
}

declare module 'koishi' {
  interface Tables {
    gmsInfo: GmsInfoRecord
  }
}

export interface Config {
  apiKey: string
  baseUrl: string
  experienceDays: number
  viewportWidth: number
  viewportHeight: number
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string()
    .required()
    .description('Nexon Open API 密钥。'),
  baseUrl: Schema.string()
    .default(DEFAULT_BASE_URL)
    .description('Nexon Open API 地址，一般保持默认即可。'),
  experienceDays: Schema.number()
    .default(DEFAULT_DAYS)
    .min(3)
    .max(14)
    .description('经验柱状图展示的天数（最新 N 天）。'),
  viewportWidth: Schema.number()
    .default(900)
    .description('截图宽度。'),
  viewportHeight: Schema.number()
    .default(540)
    .description('截图高度。'),
})

interface PuppeteerLike {
  render: (html: string, options?: Record<string, any>) => Promise<Buffer>
}

export function apply(ctx: Context, config: Config) {
  const puppeteer = getPuppeteer(ctx)
  const nexon = createNexonClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  })
  const server = (ctx as any).server

  const resolveCharacterName = async (
    session: Session | undefined,
    initial?: string,
  ): Promise<ResolveResult> => {
    const normalized = initial?.trim()
    if (normalized) {
      return { ok: true, name: normalized }
    }

    if (!session) {
      return { ok: false, reason: 'missing-session' }
    }

    const userId = session.userId
    if (!userId) {
      return { ok: false, reason: 'missing-user' }
    }

    const [binding] = await ctx.database.get('gmsInfo', { userId })
    if (binding) {
      return { ok: true, name: binding.name, usedBinding: true }
    }

    await session.send('当前未绑定角色，请在下一条消息输入要绑定的角色名。')
    const cname = await session.prompt(60_000)
    if (!cname) {
      await session.send(
        h('message', [
          h('at', { id: userId }),
          ' 输入超时。',
        ]),
      )
      return { ok: false, reason: 'timeout' }
    }

    const trimmed = cname.trim()
    if (!trimmed) {
      await session.send('角色名称不能为空，请重新尝试。')
      return { ok: false, reason: 'empty-name' }
    }

    try {
      await ctx.database.create('gmsInfo', { userId, name: trimmed })
    } catch (error) {
      logger.warn('写入角色绑定失败：%o', error)
      const [existing] = await ctx.database.get('gmsInfo', { userId })
      if (existing) {
        await ctx.database.set('gmsInfo', { id: existing.id }, { name: trimmed })
      } else {
        throw error
      }
    }

    return { ok: true, name: trimmed, newlyBound: true }
  }

  const PREVIEW_DURATION_MINUTES = 10
  const PREVIEW_TTL = PREVIEW_DURATION_MINUTES * 60_000
  const previewStore = new Map<string, PreviewEntry>()
  const router = server?.router
  const previewRouteAvailable = typeof router?.get === 'function'

  const cleanupExpiredPreviews = () => {
    const now = Date.now()
    for (const [token, entry] of previewStore) {
      if (entry.expiresAt <= now) {
        previewStore.delete(token)
      }
    }
  }

  if (previewRouteAvailable) {
    router.get('/msbot-nexon/preview/:token', (koaCtx: any) => {
      const token = koaCtx.params.token as string
      const entry = previewStore.get(token)
      if (!entry || entry.expiresAt <= Date.now()) {
        previewStore.delete(token)
        koaCtx.status = 404
        koaCtx.body = '预览已过期，请重新生成。'
        return
      }
      koaCtx.set('Cache-Control', 'no-store')
      koaCtx.type = 'text/html'
      koaCtx.body = entry.html
    })
  } else {
    logger.warn('未检测到可用的 HTTP Server 路由，HTML 预览将无法提供链接。')
  }

  ctx.effect(() => {
    if (!previewRouteAvailable) return
    const timer = setInterval(cleanupExpiredPreviews, 60_000)
    return () => clearInterval(timer)
  })

  const resolveSelfUrl = (session?: Session) => {
    const appLike: any = session?.app ?? (ctx as any).app ?? (ctx as any).root?.app
    const candidate: string | undefined =
      appLike?.options?.selfUrl ??
      server?.config?.selfUrl ??
      (process.env.KOISHI_SELF_URL as string | undefined)
    if (typeof candidate === 'string' && candidate) {
      return candidate.replace(/\/$/, '')
    }
    return undefined
  }

  const createPreviewLink = (
    html: string,
    session?: Session,
  ): { url: string; absolute: boolean } | null => {
    if (!previewRouteAvailable) {
      return null
    }
    cleanupExpiredPreviews()
    const token = randomUUID()
    previewStore.set(token, {
      html,
      expiresAt: Date.now() + PREVIEW_TTL,
    })
    if (previewStore.size > 100) {
      cleanupExpiredPreviews()
    }
    const path = `/msbot-nexon/preview/${token}`
    const base = resolveSelfUrl(session)
    if (!base) {
      return { url: path, absolute: false }
    }
    try {
      const absolute = new URL(path, base).toString()
      return { url: absolute, absolute: true }
    } catch {
      return { url: path, absolute: false }
    }
  }

  ctx
    .command('联盟查询 [character:string]', '查询 MapleStory 角色联盟信息')
    .alias('联盟查詢')
    .example('联盟查询 Leslee')
    .action(async ({ session }, character) => {
      if (!config.apiKey) {
        return '插件尚未配置 Nexon Open API 密钥。'
      }

      if (!puppeteer) {
        return '当前未启用 puppeteer 服务，无法生成图片。请安装 @koishijs/plugin-puppeteer 或兼容实现。'
      }

      const resolution = await resolveCharacterName(session, character)
      if (!resolution.ok) {
        if (resolution.reason === 'missing-session' || resolution.reason === 'missing-user') {
          return '请提供角色名称，例如：联盟查询 Leslee'
        }
        return
      }

      const targetName = resolution.name!
      let notified = false

      if (session) {
        if (resolution.newlyBound) {
          await session.send(`已绑定角色：${targetName}，正在查询...`)
          notified = true
        } else if (resolution.usedBinding) {
          await session.send(`已使用绑定角色 ${targetName}。`)
        }
      }

      if (!notified) {
        await session?.send(`正在查询 ${targetName} 的联盟信息，请稍候...`)
        notified = true
      }

      try {
        const ocid = await nexon.getOcid(targetName)
        const [basic, union, raider, artifact, history] = await Promise.all([
          nexon.getCharacterBasic(ocid),
          nexon.getUnionOverview(ocid),
          nexon.getUnionRaider(ocid),
          nexon.getUnionArtifact(ocid),
          nexon.getRecentBasicHistory(ocid, config.experienceDays + 1),
        ])

        const expSeries = buildExperienceSeries(history)
        const html = renderUnionTemplate(
          basic,
          union,
          raider,
          artifact,
          expSeries,
          config.experienceDays,
        )
        const preview = createPreviewLink(html, session)
        if (preview && session) {
          const hint = preview.absolute
            ? preview.url
            : `${preview.url}（请补全服务地址后访问）`
          await session.send(`网页预览（${PREVIEW_DURATION_MINUTES} 分钟内有效）：${hint}`)
        }
        const buffer = await puppeteer.render(html, {
          type: 'png',
          viewport: {
            width: config.viewportWidth,
            height: config.viewportHeight,
            deviceScaleFactor: 2,
          },
        })

        return h.image(`data:image/png;base64,${buffer.toString('base64')}`)
      } catch (error) {
        logger.error(error)
        const reason = error instanceof Error ? error.message : '未知错误'
        return `查询失败：${reason}`
      }
    })
}

function getPuppeteer(ctx: Context): PuppeteerLike | null {
  return (ctx as any).puppeteer ?? null
}
