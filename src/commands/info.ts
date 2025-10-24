import { Context, Logger, h } from "koishi"
import type { Config } from "../config"
import { getRegionLabel } from "../config"
import { MapleClient } from "../api/client"
import type { ExperiencePoint, RankingRecord } from "../api/types"
import { ResolveFailureReason, UserHistoryStore, resolveCharacterName } from "../data/user-history"
import { formatAccessFlag, formatDate, formatNumber } from "../utils/format"
import { renderCharacterReport } from "../templates/info"

interface InfoCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
}

interface PuppeteerLike {
  render: (html: string, options?: Record<string, any>) => Promise<Buffer>
}

export function registerInfoCommand(deps: InfoCommandDeps) {
  const { ctx, config, client, history } = deps
  const regionLabel = getRegionLabel(config.region)
  const puppeteer = getPuppeteer(ctx)
  const infoLogger = new Logger('msbot-nexon:info')

  ctx
    .command("maple info <name:text>", "��ѯð�յ���ɫ������Ϣ")
    .alias("ð����Ϣ")
    .example("/maple info ���зGM")
    .action(async ({ session }, name) => {
      const resolved = await resolveCharacterName(session, config.region, history, name)
      if (!resolved.ok) {
        const reason = (resolved as { ok: false; reason: ResolveFailureReason }).reason
        if (reason === "missing-name") {
          return "��ֱ���ṩ��ɫ�������磺/maple info ���зGM"
        }
        if (reason === "timeout") {
          return "�ȴ����볬ʱ�����Ժ����ԡ�"
        }
        return "��ɫ������Ϊ�գ����������롣"
      }

      try {
        const [info, ranking] = await Promise.all([
          client.fetchCharacterInfo(resolved.name),
          client.fetchRanking(resolved.name),
        ])

        const summary = info.summary
        const experienceStats = buildExperienceStats(info.experience)
        const rankingNeighbors = buildRankingNeighbors(ranking.records, summary.name, 6)
        const rankingDate = ranking.records[0]?.date

        const html = renderCharacterReport({
          summary,
          union: info.union,
          experience: info.experience,
          experienceStats,
          ranking: {
            available: ranking.available,
            neighbors: rankingNeighbors,
            message: ranking.message,
            date: rankingDate,
            characterName: summary.name,
          },
          regionLabel,
        })

        if (puppeteer) {
          try {
            const buffer = await puppeteer.render(html, {
              type: "png",
              viewport: {
                width: 1300,
                height: 760,
                deviceScaleFactor: 2,
              },
            })
            return h.image(`data:image/png;base64,${buffer.toString("base64")}`)
          } catch (error) {
            infoLogger.warn(error as Error, '����ͼ��ʧ�ܣ�����Ϊ�ı����')
          }
        }

        const unionLine = info.union
          ? `���ˣ�Lv.${info.union.level ?? "--"} �� ��λ��${info.union.grade ?? "--"} �� �ᾧ�㣺${formatNumber(
              info.union.artifactPoint ?? 0,
            )}`
          : "���ˣ����޼�¼���ٷ�δ�������ݣ�"

        const fallbackLines = [
          `��ɫ��${summary.name}��${regionLabel}��`,
          `�ȼ���${summary.level} �� ְҵ��${summary.job}${summary.jobDetail ? ` ${summary.jobDetail}` : ""}`,
          unionLine,
          `���᣺${summary.guild ?? "�޹���"} �� ${formatAccessFlag(summary.accessFlag)}`,
          `���飺${formatNumber(summary.exp)} �� ���ȣ�${summary.expRate ?? "--"}`,
          `���ǣ�${formatDate(summary.createDate)} �� �������${
            summary.liberationQuestClear === "1" ? "�����" : "δ���"
          }`,
        ]

        if (info.experience.length) {
          const recent = info.experience.slice(-Math.min(info.experience.length, 5))
          const rows = recent.map(
            (item) => `�� ${item.date} �� Lv.${item.level} �� �������� +${formatNumber(item.gain)}`,
          )
          fallbackLines.push(`�������ƣ���� ${recent.length} �죩��`, ...rows)
        }

        if (!ranking.available && ranking.message) {
          fallbackLines.push(`������ʾ��${ranking.message}`)
        }

        return fallbackLines.join("\n")
      } catch (error) {
        if (error instanceof Error) return error.message
        return "��ѯ��ɫ��Ϣʧ��"
      }
    })
}

function getPuppeteer(ctx: Context): PuppeteerLike | undefined {
  return (ctx as any).puppeteer ?? undefined
}

function buildExperienceStats(series: ExperiencePoint[]) {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const last7 = sumRecent(sorted, 7)
  const last14 = sumRecent(sorted, 14)
  return {
    total7: last7.total,
    avg7: last7.count ? last7.total / last7.count : 0,
    total14: last14.total,
    avg14: last14.count ? last14.total / last14.count : 0,
  }
}

function sumRecent(series: ExperiencePoint[], span: number) {
  if (!series.length) return { total: 0, count: 0 }
  const slice = series.slice(-Math.min(series.length, span))
  const total = slice.reduce((acc, item) => acc + (item.gain ?? 0), 0)
  return { total, count: slice.length }
}

function buildRankingNeighbors(records: RankingRecord[], targetName: string, windowSize: number) {
  if (!records.length) return []
  const latestDate = records[0].date
  const sameDate = records.filter((record) => record.date === latestDate)
  const sorted = [...sameDate].sort((a, b) => a.ranking - b.ranking)
  const normalized = normalizeName(targetName)
  const index = sorted.findIndex((record) => normalizeName(record.characterName) === normalized)
  if (index === -1) {
    return sorted.slice(0, Math.min(sorted.length, windowSize))
  }
  const half = Math.floor(windowSize / 2)
  const start = Math.max(0, index - half)
  const end = Math.min(sorted.length, start + windowSize)
  return sorted.slice(start, end)
}

function normalizeName(input: string) {
  return input.trim().toLowerCase()
}



