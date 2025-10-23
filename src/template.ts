import { ExpPoint } from './experience'
import {
  ArtifactSummary,
  CharacterProfile,
  RaiderSummary,
  UnionOverview,
} from './nexon'

const numberFormatter = new Intl.NumberFormat('zh-CN')

export function renderUnionTemplate(
  basic: CharacterProfile,
  union: UnionOverview,
  raider: RaiderSummary,
  artifact: ArtifactSummary,
  expSeries: ExpPoint[],
  targetDays: number,
) {
  const bars = buildChartBars(expSeries, targetDays)
  const guild = basic.guildName || '无'
  const classLabel = basic.classLevel
    ? `${basic.className} ${basic.classLevel}`
    : basic.className
  const expRate = basic.expRate ? `${basic.expRate}%` : '--'
  const liberation = basic.liberationQuestClear === '1' ? '创世解放：已完成' : '创世解放：未完成'
  const accessBadge = basic.accessFlag === 'true' ? '最近 7 天活跃' : '最近 7 天未登录'

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
      font-family: "Segoe UI", "PingFang SC", "Microsoft Yahei", sans-serif;
      background: #080d16;
      color: #f7f9ff;
    }
    .card {
      background: linear-gradient(145deg, rgba(36, 49, 86, 0.96), rgba(15, 23, 45, 0.94));
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 20px 35px rgba(8, 12, 28, 0.6);
      width: 100%;
      height: 100%;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-bottom: 24px;
    }
    .avatar {
      width: 128px;
      height: 128px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .header-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .header-info h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0.5px;
    }
    .badge-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 13px;
      letter-spacing: 0.2px;
    }
    .section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .section h2 {
      grid-column: 1 / -1;
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 600;
      color: #8fb3ff;
    }
    .info-block {
      padding: 16px;
      background: rgba(12, 19, 38, 0.7);
      border-radius: 14px;
      border: 1px solid rgba(143, 179, 255, 0.18);
    }
    .info-title {
      font-size: 12px;
      opacity: 0.72;
      margin-bottom: 6px;
      letter-spacing: 0.7px;
    }
    .info-value {
      font-size: 20px;
      font-weight: 600;
    }
    .info-note {
      font-size: 12px;
      opacity: 0.65;
    }
    .chart {
      margin-top: 8px;
      padding: 18px;
      background: rgba(12, 19, 38, 0.7);
      border-radius: 14px;
      border: 1px solid rgba(143, 179, 255, 0.18);
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .chart-title {
      font-size: 16px;
      color: #8fb3ff;
      font-weight: 600;
    }
    .chart-subtitle {
      font-size: 12px;
      opacity: 0.65;
    }
    .chart-wrapper {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      height: 220px;
    }
    .bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .bar-fill {
      width: 100%;
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(79, 141, 255, 0.95), rgba(79, 141, 255, 0.42));
      display: flex;
      align-items: flex-end;
      justify-content: center;
      overflow: hidden;
    }
    .bar-value {
      font-size: 12px;
      opacity: 0.82;
      text-align: center;
      line-height: 1.3;
    }
    .bar-label {
      font-size: 13px;
      opacity: 0.7;
      letter-spacing: 0.3px;
    }
    .stat-list {
      display: grid;
      gap: 8px;
      font-size: 13px;
      margin-top: 8px;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
    }
    .stat-item span:first-child {
      opacity: 0.74;
    }
    .artifact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .artifact-card {
      padding: 12px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(143, 179, 255, 0.18);
    }
    .artifact-card h3 {
      margin: 0 0 6px;
      font-size: 14px;
      color: #99c6ff;
    }
    .artifact-card p {
      margin: 0;
      font-size: 12px;
      opacity: 0.75;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="avatar">
        ${
          basic.image
            ? `<img src="${basic.image}" alt="${basic.name}" />`
            : '<span>无头像</span>'
        }
      </div>
      <div class="header-info">
        <h1>${escapeHtml(basic.name)}</h1>
        <div class="badge-row">
          <div class="badge">服务器：${escapeHtml(basic.world)}</div>
          <div class="badge">职业：${escapeHtml(classLabel)}</div>
          <div class="badge">等级：${basic.level}</div>
          <div class="badge">经验条：${escapeHtml(expRate)}</div>
          <div class="badge">公会：${escapeHtml(guild)}</div>
          <div class="badge">创建：${escapeHtml(basic.createdAt)}</div>
          <div class="badge">${escapeHtml(accessBadge)}</div>
          <div class="badge">${escapeHtml(liberation)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>联盟战力概览</h2>
      <div class="info-block">
        <div class="info-title">联盟等级</div>
        <div class="info-value">${union.level ?? '--'}</div>
      </div>
      <div class="info-block">
        <div class="info-title">联盟段位</div>
        <div class="info-value">${escapeHtml(union.grade ?? '--')}</div>
      </div>
      <div class="info-block">
        <div class="info-title">神器等级</div>
        <div class="info-value">${union.artifactLevel ?? 0}</div>
      </div>
      <div class="info-block">
        <div class="info-title">神器经验</div>
        <div class="info-value">${formatNumberCompact(union.artifactExp)}</div>
      </div>
      <div class="info-block">
        <div class="info-title">持有联盟点数</div>
        <div class="info-value">${formatNumberCompact(union.artifactPoint)}</div>
      </div>
      <div class="info-block">
        <div class="info-title">角色总经验</div>
        <div class="info-value">${formatNumberCompact(basic.exp)}</div>
        <div class="info-note">当前等级累计值</div>
      </div>
    </div>

    <div class="section">
      <h2>战地攻击队增益</h2>
      <div class="info-block">
        <div class="info-title">当前预设</div>
        <div class="info-value">Preset ${raider.preset}</div>
      </div>
      <div class="info-block" style="grid-column: 1 / -1;">
        ${renderStringList(raider.statEffects, '暂无战地站位增益数据。')}
      </div>
      <div class="info-block" style="grid-column: 1 / -1;">
        <div class="info-title">占领效果</div>
        ${renderStringList(raider.occupiedEffects, '暂无占领效果数据。')}
      </div>
    </div>

    <div class="section">
      <h2>联盟内在能力</h2>
      <div class="info-block" style="grid-column: 1 / -1;">
        ${renderInnerStatList(raider.innerStats)}
      </div>
    </div>

    <div class="section">
      <h2>神器效果与水晶</h2>
      <div class="info-block">
        <div class="info-title">剩余神器 AP</div>
        <div class="info-value">${formatNumberCompact(artifact.remainAp)}</div>
      </div>
      <div class="info-block" style="grid-column: 1 / -1;">
        <div class="info-title">神器效果</div>
        ${renderArtifactEffects(artifact.effects)}
        ${renderArtifactCrystals(artifact.crystals)}
      </div>
    </div>

    <div class="chart">
      <div class="chart-header">
        <div class="chart-title">最近 ${targetDays} 天经验增量</div>
        <div class="chart-subtitle">来源：MapleStory OpenAPI（台服）</div>
      </div>
      ${bars}
    </div>
  </div>
</body>
</html>`
}

function buildChartBars(series: ExpPoint[], targetDays: number) {
  if (!series.length) {
    return '<div style="padding: 32px; text-align: center; opacity: 0.7;">暂无经验数据，请稍后再试。</div>'
  }

  const recent = series.slice(-targetDays)
  const maxGain = Math.max(...recent.map((item) => item.gain ?? 0), 0)
  const scale = maxGain > 0 ? 180 / maxGain : 0

  const bars = recent
    .map((item) => {
      const height = Math.max(((item.gain ?? 0) * scale), 4).toFixed(2)
      return `<div class="bar">
        <div class="bar-fill" style="height: ${height}px;"></div>
        <div class="bar-value">${formatNumberCompact(item.gain ?? 0)}</div>
        <div class="bar-label">${escapeHtml(item.label)}</div>
      </div>`
    })
    .join('')

  return `<div class="chart-wrapper">${bars}</div>`
}

function renderStringList(list: string[], empty: string) {
  if (!list?.length) {
    return `<div>${empty}</div>`
  }
  return `<div class="stat-list">
    ${list
      .map((text) => `<div class="stat-item"><span>${escapeHtml(text)}</span><span>已激活</span></div>`)
      .join('')}
  </div>`
}

function renderInnerStatList(list: RaiderSummary['innerStats']) {
  if (!list?.length) {
    return '<div>暂无内在能力数据。</div>'
  }
  return `<div class="stat-list">
    ${list
      .map((item) => {
        return `<div class="stat-item">
          <span>区域 ${escapeHtml(item.id)}</span>
          <span>${escapeHtml(item.effect)}</span>
        </div>`
      })
      .join('')}
  </div>`
}

function renderArtifactEffects(effects: ArtifactSummary['effects']) {
  if (!effects?.length) {
    return '<div>尚未激活任何神器效果。</div>'
  }
  return `<div class="stat-list">
    ${effects
      .map((effect) => {
        return `<div class="stat-item">
          <span>${escapeHtml(effect.name)}</span>
          <span>Lv.${effect.level}</span>
        </div>`
      })
      .join('')}
  </div>`
}

function renderArtifactCrystals(crystals: ArtifactSummary['crystals']) {
  if (!crystals?.length) return ''

  return `<div class="artifact-grid">
    ${crystals
      .map((crystal) => {
        return `<div class="artifact-card">
          <h3>${escapeHtml(crystal.name)} · Lv.${crystal.level}</h3>
          <p>${escapeHtml(crystal.validity)}</p>
          ${
            crystal.options.length
              ? `<p>${escapeHtml(crystal.options.join(' / '))}</p>`
              : ''
          }
        </div>`
      })
      .join('')}
  </div>`
}

function escapeHtml(value?: string | number | null) {
  if (value === undefined || value === null) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatNumberCompact(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '--'
  const numeric = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numeric)) return '--'
  if (numeric >= 1_0000_0000) {
    return `${(numeric / 1_0000_0000).toFixed(2)} 亿`
  }
  if (numeric >= 1_0000) {
    return `${(numeric / 1_0000).toFixed(2)} 万`
  }
  return numberFormatter.format(numeric)
}
