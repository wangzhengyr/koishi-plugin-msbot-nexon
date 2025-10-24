import { CharacterSummary, ExperiencePoint, RankingRecord, UnionOverviewSummary } from "../api/types"
import { formatNumber } from "../utils/format"

interface ExperienceStats {
  total7: number
  avg7: number
  total14: number
  avg14: number
}

interface RankingSummary {
  available: boolean
  neighbors: RankingRecord[]
  message?: string
  date?: string
  characterName: string
}

interface CharacterReportProps {
  summary: CharacterSummary
  union?: UnionOverviewSummary | null
  experience: ExperiencePoint[]
  experienceStats: ExperienceStats
  ranking: RankingSummary
  regionLabel: string
}

export function renderCharacterReport(props: CharacterReportProps): string {
  const { summary, union, experience, experienceStats, ranking, regionLabel } = props
  const chartBars = buildChartBars(experience)
  const expDetails = buildExperienceDetails(experience)
  const rankingList = buildRankingList(ranking)
  const avatar = summary.image
    ? `<img src="${escapeHtml(summary.image)}" alt="avatar" />`
    : '<div class="avatar-placeholder">无头像</div>'

  const unionBlock = union
    ? `<div class="union-grid">
        ${renderStat("联盟等级", union.level ?? "--")}
        ${renderStat("联盟段位", union.grade ?? "--")}
        ${renderStat("结晶等级", union.artifactLevel ?? "--")}
        ${renderStat("结晶点数", formatNumber(union.artifactPoint ?? 0))}
      </div>`
    : '<div class="union-empty">暂无联盟数据</div>'

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: "Inter", "Microsoft Yahei", sans-serif;
    background: #0d141f;
    color: #f2f4f8;
  }
  .report {
    display: grid;
    grid-template-columns: 320px 1fr 280px;
    gap: 20px;
  }
  .card {
    background: #131b2a;
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 18px 30px rgba(5, 9, 16, 0.55);
    border: 1px solid rgba(69, 109, 206, 0.24);
  }
  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .avatar-box {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .avatar-box img {
    width: 120px;
    height: 120px;
    border-radius: 26px;
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 255, 255, 0.12);
  }
  .avatar-placeholder {
    width: 120px;
    height: 120px;
    border-radius: 26px;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    opacity: 0.6;
  }
  .summary-meta {
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .summary-title {
    font-size: 22px;
    font-weight: 600;
  }
  .summary-sub {
    font-size: 14px;
    opacity: 0.75;
  }
  .union-card {
    margin-top: auto;
  }
  .union-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    font-size: 13px;
  }
  .stat-item {
    background: rgba(40, 60, 110, 0.18);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .stat-label {
    font-size: 12px;
    opacity: 0.7;
  }
  .stat-value {
    font-size: 16px;
    font-weight: 600;
    margin-top: 4px;
  }
  .union-empty {
    background: rgba(40, 60, 110, 0.12);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    font-size: 13px;
    opacity: 0.7;
  }
  .chart-card h2,
  .ranking-card h2,
  .details-title {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 600;
    color: #8fb3ff;
  }
  .chart-area {
    background: rgba(9, 13, 24, 0.6);
    border-radius: 16px;
    padding: 20px;
    position: relative;
    height: 260px;
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
  .bar {
    flex: 1;
    min-width: 24px;
    background: linear-gradient(180deg, #3d7bff, #1f4ed1);
    border-radius: 8px 8px 4px 4px;
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    transition: transform 0.2s ease;
  }
  .bar:hover {
    transform: translateY(-4px);
  }
  .bar-value {
    position: absolute;
    top: -28px;
    font-size: 12px;
    color: #9fbaff;
    white-space: nowrap;
  }
  .bar-label {
    position: absolute;
    bottom: -22px;
    font-size: 12px;
    opacity: 0.65;
  }
  .exp-summary {
    margin-top: 28px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    font-size: 13px;
  }
  .exp-summary .stat-value {
    font-size: 15px;
  }
  .ranking-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ranking-meta {
    font-size: 12px;
    opacity: 0.7;
  }
  .rank-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 420px;
    overflow: hidden;
  }
  .rank-row {
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(35, 46, 72, 0.6);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .rank-row.highlight {
    background: rgba(77, 123, 255, 0.28);
    border: 1px solid rgba(121, 165, 255, 0.6);
  }
  .rank-name {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rank-name strong {
    font-size: 14px;
  }
  .details {
    margin-top: 24px;
  }
  .details-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }
  .details-item {
    background: rgba(20, 30, 50, 0.6);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
  }
  .details-item strong {
    display: block;
    font-size: 13px;
    margin-bottom: 6px;
  }
</style>
</head>
<body>
  <div class="report">
    <section class="card summary-card">
      <div class="avatar-box">
        ${avatar}
        <div>
          <div class="summary-title">${escapeHtml(summary.name)}</div>
          <div class="summary-sub">${escapeHtml(regionLabel)} ｜ Lv.${summary.level}${summary.expRate ? ` (${escapeHtml(summary.expRate)})` : ""}</div>
          <div class="summary-sub">${escapeHtml(summary.job)}${summary.jobDetail ? ` / ${escapeHtml(summary.jobDetail)}` : ""}</div>
        </div>
      </div>
      <div class="summary-meta">
        <div>世界：${escapeHtml(summary.world)}</div>
        <div>公会：${escapeHtml(summary.guild ?? "无公会")}</div>
        <div>近 7 日登录：${escapeHtml(summary.accessFlag ? (summary.accessFlag === 'true' ? '是' : '否') : '未知')}</div>
        <div>创角日期：${escapeHtml(summary.createDate ? summary.createDate.slice(0, 10) : '--')}</div>
      </div>
      <div class="card union-card">
        <h3 style="margin:0 0 12px;font-size:16px;color:#8fb3ff;">联盟概况</h3>
        ${unionBlock}
      </div>
    </section>
    <section class="card chart-card">
      <h2>每日经验获取</h2>
      <div class="chart-area">
        ${chartBars}
      </div>
      <div class="exp-summary">
        ${renderStat('7日总经验', formatExpValue(experienceStats.total7))}
        ${renderStat('7日日均经验', formatExpValue(experienceStats.avg7))}
        ${renderStat('14日总经验', formatExpValue(experienceStats.total14))}
        ${renderStat('14日日均经验', formatExpValue(experienceStats.avg14))}
      </div>
    </section>
    <section class="card ranking-card">
      <h2>附近总排名</h2>
      <div class="ranking-meta">${ranking.date ? escapeHtml(ranking.date) + ' 数据' : '最新数据'}</div>
      <div class="rank-list">
        ${rankingList}
      </div>
      ${ranking.available ? '' : `<div class="ranking-meta">${escapeHtml(ranking.message ?? '该地区未开放排名查询')}</div>`}
    </section>
  </div>
  <section class="card details">
    <div class="details-title">详细每日获取经验量</div>
    <div class="details-grid">
      ${expDetails}
    </div>
  </section>
</body>
</html>`
}

function renderStat(label: string, value: string | number) {
  return `<div class="stat-item"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(String(value))}</div></div>`
}

function buildChartBars(series: ExperiencePoint[]) {
  if (!series.length) {
    return '<div style="width:100%;text-align:center;opacity:0.6;">暂无经验数据</div>'
  }
  const maxGain = Math.max(...series.map((item) => item.gain ?? 0), 1)
  return series
    .map((item) => {
      const height = Math.max(6, Math.round(((item.gain ?? 0) / maxGain) * 100))
      return `<div class="bar" style="height:${height}%">
        <div class="bar-value">${escapeHtml(formatExpValue(item.gain ?? 0))}</div>
        <div class="bar-label">${escapeHtml(item.date.slice(5))}</div>
      </div>`
    })
    .join('')
}

function buildExperienceDetails(series: ExperiencePoint[]) {
  if (!series.length) {
    return '<div class="details-item">暂无历史记录</div>'
  }
  return series
    .slice()
    .reverse()
    .map((item) => `<div class="details-item"><strong>${escapeHtml(item.date)}</strong>增量：${escapeHtml(formatExpValue(item.gain ?? 0))}</div>`)
    .join('')
}

function buildRankingList(ranking: RankingSummary) {
  if (!ranking.available || !ranking.neighbors.length) {
    return '<div class="ranking-meta">暂无附近排名数据</div>'
  }
  const target = normalizeName(ranking.characterName)
  return ranking.neighbors
    .map((record) => {
      const highlight = normalizeName(record.characterName) === target ? 'rank-row highlight' : 'rank-row'
      return `<div class="${highlight}">
        <div class="rank-name">
          <strong>${escapeHtml(`#${record.ranking} ${record.characterName}`)}</strong>
          <span>Lv.${record.characterLevel}${record.expRate ? `（${escapeHtml(record.expRate)}）` : ''}</span>
        </div>
        <div>${escapeHtml(record.className)}</div>
      </div>`
    })
    .join('')
}

function formatExpValue(value: number) {
  if (!value) return '0'
  const units = [
    { threshold: 1e12, suffix: 'T' },
    { threshold: 1e9, suffix: 'B' },
    { threshold: 1e6, suffix: 'M' },
    { threshold: 1e3, suffix: 'K' },
  ]
  for (const unit of units) {
    if (value >= unit.threshold) {
      return `${(value / unit.threshold).toFixed(2)}${unit.suffix}`
    }
  }
  return value.toFixed(0)
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeName(text: string) {
  return text.trim().toLowerCase()
}
