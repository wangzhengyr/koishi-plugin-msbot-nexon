import { Context } from 'koishi'
import type { Config } from '../config'
import { getRegionLabel } from '../config'
import { MapleClient } from '../api/client'
import { ResolveFailureReason, UserHistoryStore, resolveCharacterName } from '../data/user-history'
import { EquipmentItemSummary, EquipmentStatBlock } from '../api/types'

interface EquipCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
}

const STAT_LABELS: Record<string, string> = {
  str: '力量',
  dex: '敏捷',
  int: '智力',
  luk: '运气',
  maxHp: '最大HP',
  maxMp: '最大MP',
  attackPower: '攻击力',
  magicPower: '魔法力',
  armor: '防御力',
  speed: '移速',
  jump: '跳跃',
  bossDamage: 'BOSS增伤',
  damage: '总伤害',
  allStat: '全属性',
  criticalRate: '爆击率',
}

export function registerEquipCommand(deps: EquipCommandDeps) {
  const { ctx, config, client, history } = deps
  const regionLabel = getRegionLabel(config.region)

  ctx
    .command('maple equip <name:text>', '查询冒险岛角色装备')
    .alias('冒险装备')
    .example('/maple equip 青螃蟹GM')
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (!resolved.ok) {
        const reason = (resolved as { ok: false; reason: ResolveFailureReason }).reason
        if (reason === 'missing-name') {
          return '请直接提供角色名，例如：/maple equip 青螃蟹GM'
        }
        if (reason === 'timeout') {
          return '等待输入超时，请稍后重试。'
        }
        return '角色名不能为空，请重新输入。'
      }

      try {
        const result = await client.fetchEquipments(resolved.name)
        if (!result.items.length) {
          return `角色：${resolved.name}（${regionLabel}）暂无可用的装备数据`
        }

        const lines: string[] = [`角色：${resolved.name}（${regionLabel}）装备概览`]

        if (result.title?.name) {
          lines.push(`称号：${result.title.name}`)
        }

        const display = result.items.slice(0, 12)
        for (const item of display) {
          lines.push(buildItemLine(item))
        }

        if (result.items.length > display.length) {
          lines.push(`……还有 ${result.items.length - display.length} 件装备未显示，可通过控制台查看完整列表。`)
        }

        return lines.join('\n')
      } catch (error) {
        if (error instanceof Error) return error.message
        return '查询装备信息失败'
      }
    })
}

function buildItemLine(item: EquipmentItemSummary): string {
  const base = `基础：${formatStatBlock(item.base)}`
  const extras: string[] = []
  if (item.additional) extras.push(`附加：${formatStatBlock(item.additional)}`)
  if (item.starforce) extras.push(`星力：${formatStatBlock(item.starforce)}`)
  if (item.potential) extras.push(`潜能：${item.potential.join(' / ')}`)
  if (item.additionalPotential) {
    extras.push(`附加潜能：${item.additionalPotential.join(' / ')}`)
  }
  return [`· [${item.slot}] ${item.itemName}`, base, ...extras.filter(Boolean)].join('\n  ')
}

function formatStatBlock(block?: EquipmentStatBlock): string {
  if (!block) return '--'
  const entries = Object.entries(block as Record<string, string | undefined>)
    .filter(([key, value]) => Boolean(value) && key in STAT_LABELS)
    .map(([key, value]) => `${STAT_LABELS[key]}+${value}`)
  return entries.length ? entries.join('，') : '--'
}
