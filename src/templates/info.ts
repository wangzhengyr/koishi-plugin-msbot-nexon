import { CharacterSummary, ExperiencePoint, UnionOverviewSummary } from "../api/types"
import {
  MapleScouterProfile,
  MapleScouterEquipment,
  MapleScouterHexaNode,
  MapleScouterPotentialLine,
  MapleScouterSymbol,
} from "../entities"
import { formatNumber } from "../utils/format"
import { HEXA_ICONS } from "./icon-assets"

interface CharacterReportProps {
  summary: CharacterSummary
  union?: UnionOverviewSummary | null
  experience: ExperiencePoint[]
  profile: MapleScouterProfile
  regionLabel: string
}

export function renderCharacterReport(props: CharacterReportProps): string {
  const { summary, union, experience, profile, regionLabel } = props
  const avatar = profile.avatar ?? summary.image
  const avatarNode = avatar
    ? `<img src="${escapeHtml(avatar)}" alt="avatar" />`
    : '<div class="avatar-placeholder">暫無頭像</div>'
  const jobLabel = buildJobLabel(summary)
  const worldLabel = summary.world ?? profile.basic.world ?? "--"
  const experienceChart = renderExperienceChart(experience)
  const equipmentGrid = renderEquipmentGrid(profile.equipments)
  const hexaList = renderHexaNodes(profile.hexa.nodes)
  const potentialList = renderPotentialList(profile.potentials)
  const symbolGroups = renderSymbolGroups(profile.symbols)

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    font-family: "Inter", "Microsoft Yahei", sans-serif;
    background: #eef2ff;
    color: #1b2559;
  }
  #app {
    max-width: 1480px;
    margin: 0 auto;
  }
  .report {
    display: grid;
    grid-template-columns: 360px 1fr 320px;
    gap: 20px;
    align-items: start;
  }
  .left-column {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .card {
    background: #fff;
    border-radius: 22px;
    padding: 22px;
    border: 1px solid #dde2ff;
    box-shadow: 0 18px 35px rgba(27, 37, 89, 0.08);
  }
  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .avatar-box {
    display: flex;
    gap: 18px;
    align-items: center;
  }
  .avatar-box img {
    width: 130px;
    height: 130px;
    border-radius: 28px;
    border: 3px solid rgba(70, 105, 255, 0.2);
    background: #f7f8ff;
    object-fit: cover;
  }
  .avatar-placeholder {
    width: 130px;
    height: 130px;
    border-radius: 28px;
    border: 2px dashed #ccd3ff;
    color: #9aa5d8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .summary-title {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .summary-sub {
    font-size: 14px;
    color: #5a6399;
    margin-bottom: 4px;
  }
  .summary-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .tag {
    background: #eff2ff;
    color: #445dff;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .stat-block {
    padding: 12px 14px;
    border-radius: 16px;
    background: #f6f8ff;
  }
  .stat-block span {
    display: block;
    font-size: 12px;
    color: #65709b;
    margin-bottom: 4px;
  }
  .stat-block strong {
    font-size: 16px;
    color: #1b2559;
  }
  .combat-card {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .combat-item {
    background: linear-gradient(135deg, #f7f9ff, #ecf2ff);
    border-radius: 16px;
    padding: 14px;
  }
  .combat-item span {
    display: block;
    font-size: 12px;
    color: #6f78aa;
    margin-bottom: 6px;
  }
  .combat-item strong {
    font-size: 18px;
    color: #324cff;
  }
  .info-card h3,
  .hexa-card h3,
  .equip-card-board h3 {
    margin: 0 0 14px;
    font-size: 16px;
    color: #3342a3;
  }
  .equip-card-board {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .equip-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 14px;
  }
  .equip-card {
    border: 1px solid #ebefff;
    border-radius: 18px;
    padding: 16px;
    background: #fbfcff;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 200px;
  }
  .equip-head {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .equip-head img {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    border: 1px solid #dde3ff;
    background: #fff;
    object-fit: cover;
  }
  .equip-slot {
    font-size: 12px;
    color: #7d86b6;
    text-transform: uppercase;
  }
  .equip-name {
    font-size: 14px;
    font-weight: 600;
    color: #293361;
  }
  .equip-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .equip-stat-chip {
    background: rgba(42, 57, 113, 0.08);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
    color: #4b5788;
  }
  .equip-note {
    font-size: 12px;
    color: #54608f;
    line-height: 1.5;
  }
  .hexa-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hexa-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hexa-line {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #eef1ff;
  }
  .hexa-line:last-child {
    border-bottom: none;
  }
  .hexa-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: #f4f6ff;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e0e5ff;
  }
  .hexa-icon img {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
  .hexa-info {
    flex: 1;
  }
  .hexa-info strong {
    display: block;
    font-size: 14px;
    color: #394273;
  }
  .hexa-info span {
    font-size: 12px;
    color: #7079ab;
  }
  .hexa-bar {
    width: 90%;
    height: 6px;
    border-radius: 999px;
    background: #e6eaff;
    overflow: hidden;
    margin-left: 56px;
  }
  .hexa-bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #5a7bff, #9ea7ff);
  }
  .potential-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .potential-line {
    display: flex;
    gap: 6px;
    font-size: 13px;
    color: #424c7c;
  }
  .potential-line .grade {
    font-weight: 600;
    color: #ff6b6b;
  }
  .symbol-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .symbol-item {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: #3c4676;
  }
  .symbol-item img {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: 1px solid #e0e5ff;
    background: #fff;
  }
  .empty {
    font-size: 13px;
    color: #9aa3cf;
  }
  .exp-card {
    margin-top: 20px;
  }
  .chart-area {
    height: 260px;
    padding: 12px 0 0;
    display: flex;
    align-items: flex-end;
    gap: 14px;
  }
  .exp-bar {
    flex: 1;
    min-width: 24px;
    background: linear-gradient(180deg, #6d8dff, #4f6df1);
    border-radius: 10px 10px 4px 4px;
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .exp-bar small {
    position: absolute;
    top: -26px;
    font-size: 11px;
    color: #4b5fb5;
  }
  .exp-bar span {
    position: absolute;
    bottom: -20px;
    font-size: 11px;
    color: #7d86b6;
  }
</style>
</head>
<body>
  <div id="app">
    <div class="report">
      <div class="left-column">
        <section class="card summary-card">
          <div class="avatar-box">
            ${avatarNode}
            <div>
              <div class="summary-title">${escapeHtml(summary.name)}</div>
              <div class="summary-sub">Lv.${summary.level} ｜ ${escapeHtml(jobLabel)}</div>
              <div class="summary-sub">${escapeHtml(regionLabel)} ｜ ${escapeHtml(worldLabel)}</div>
              <div class="summary-tags">
                <span class="tag">${escapeHtml(profile.basic.guild ?? summary.guild ?? "無公會")}</span>
                <span class="tag">人氣 ${escapeHtml(formatNumber(profile.basic.popularity ?? 0))}</span>
              </div>
            </div>
          </div>
          <div class="stat-grid">
            ${renderStatBlock("ARC 力量", formatNumber(profile.basic.arcaneForce))}
            ${renderStatBlock("AUTH 力量", formatNumber(profile.basic.authenticForce))}
            ${renderStatBlock("聯盟等級", renderUnionLevel(union, profile))}
            ${renderStatBlock("結晶等級", renderArtifactLevel(union, profile))}
          </div>
          <div class="stat-grid">
            ${renderStatBlock("武陵塔", profile.basic.dojangFloor ? `第 ${profile.basic.dojangFloor} 層` : "--")}
            ${renderStatBlock("創角日期", summary.createDate ? summary.createDate.slice(0, 10) : "--")}
          </div>
          ${renderCombatStats(profile)}
        </section>
        <section class="card info-card">
          <h3>潛能 / 能力</h3>
          ${potentialList}
        </section>
        <section class="card info-card">
          <h3>符文進度</h3>
          ${symbolGroups}
        </section>
      </div>
      <section class="card equip-card-board">
        <h3>裝備概覽</h3>
        ${equipmentGrid}
      </section>
      <section class="card hexa-card">
        <h3>六轉核心</h3>
        ${hexaList}
      </section>
    </div>
    <section class="card exp-card">
      <h3 style="margin:0 0 16px;font-size:18px;color:#3143a7;">近期經驗趨勢</h3>
      ${experienceChart}
    </section>
  </div>
</body>
</html>`
}

function renderStatBlock(label: string, value: string) {
  return `<div class="stat-block"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
}

function renderUnionLevel(union: UnionOverviewSummary | null | undefined, profile: MapleScouterProfile) {
  const level = profile.basic.unionLevel ?? union?.level
  if (!level) return "--"
  return `Lv.${level}`
}

function renderArtifactLevel(union: UnionOverviewSummary | null | undefined, profile: MapleScouterProfile) {
  const level = union?.artifactLevel ?? profile.basic.artifactLevel
  if (!level) return "--"
  return `Lv.${level}`
}

function renderCombatStats(profile: MapleScouterProfile) {
  const items = [
    { label: "綜合戰力", value: formatTaiwanNumber(profile.combat.combatPower) },
    { label: "一般（380）", value: formatNumber(profile.combat.generalDamage380 ?? 0) },
    { label: "HEXA（380）", value: formatNumber(profile.combat.hexaDamage380 ?? 0) },
    { label: "六轉加成", value: formatNumber(profile.combat.hexaBonus ?? 0) },
  ]
  return `<div class="combat-card">
    ${items
      .map(
        (item) =>
          `<div class="combat-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(
            item.value,
          )}</strong></div>`,
      )
      .join("")}
  </div>`
}

function renderEquipmentGrid(items: MapleScouterEquipment[]) {
  if (!items.length) {
    return '<div class="empty">暫無裝備資料</div>'
  }
  return `<div class="equip-card-grid">
    ${items.map(renderEquipmentCard).join("")}
  </div>`
}

function renderEquipmentCard(item: MapleScouterEquipment) {
  const icon = item.icon
    ? `<img src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.name)}" />`
    : '<div style="width:56px;height:56px;border-radius:14px;border:1px dashed #d5dcff;background:#f0f2ff;display:flex;align-items:center;justify-content:center;font-size:11px;color:#95a0cf;">無圖</div>'
  const stats = (item.stats ?? [])
    .map((stat) => `<div class="equip-stat-chip">${escapeHtml(`${stat.label} ${stat.value}`)}</div>`)
    .join("")
  const potentials = [
    item.potentials ? `潛能：${escapeHtml(item.potentials.join(" / "))}` : "",
    item.additionalPotentials ? `附加：${escapeHtml(item.additionalPotentials.join(" / "))}` : "",
    item.flameSummary ? `火花：${escapeHtml(item.flameSummary)}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<div class="equip-note">${line}</div>`)
    .join("")

  return `<div class="equip-card">
    <div class="equip-head">
      ${icon}
      <div>
        <div class="equip-slot">${escapeHtml(item.slotLabel)}</div>
        <div class="equip-name">${escapeHtml(item.name)}</div>
      </div>
    </div>
    <div class="equip-stats">${stats || '<span class="equip-stat-chip">暫無屬性</span>'}</div>
    ${potentials || '<div class="equip-note">未提供潛能資訊</div>'}
  </div>`
}

function renderHexaNodes(nodes: MapleScouterHexaNode[]) {
  if (!nodes.length) return '<div class="empty">暫無六轉資料</div>'
  return `<div class="hexa-list">
    ${nodes
      .map((node) => {
        const percent = Math.min(100, Math.round((node.level / 30) * 100))
        const icon = HEXA_ICONS[node.key] ?? HEXA_ICONS.default
        return `<div>
          <div class="hexa-line">
            <div class="hexa-icon"><img src="${icon}" alt="${escapeHtml(node.label)}" /></div>
            <div class="hexa-info">
              <strong>${escapeHtml(node.label)}</strong>
              <span>Lv.${escapeHtml(String(node.level))}</span>
            </div>
          </div>
          <div class="hexa-bar"><span style="width:${percent}%"></span></div>
        </div>`
      })
      .join("")}
  </div>`
}

function renderPotentialList(lines: MapleScouterPotentialLine[]) {
  if (!lines.length) return '<div class="empty">暫無潛能資料</div>'
  return `<div class="potential-list">
    ${lines
      .map(
        (line) =>
          `<div class="potential-line">
            <span class="grade">${escapeHtml(transformGrade(line.grade))}</span>
            <span>${escapeHtml(line.option)}</span>
          </div>`,
      )
      .join("")}
  </div>`
}

function renderSymbolGroups(symbols: MapleScouterSymbol[]) {
  if (!symbols.length) return '<div class="empty">暫無符文資料</div>'
  const groups = [
    { title: "祕法符文", items: symbols.filter((item) => item.type?.includes("祕法")) },
    { title: "真實符文", items: symbols.filter((item) => item.type?.includes("真實") && !item.type?.includes("豪華")) },
    { title: "豪華真實", items: symbols.filter((item) => item.type?.includes("豪華")) },
  ]
  const content = groups
    .map((group) => {
      if (!group.items.length) return ""
      const list = group.items
        .map(
          (item) =>
            `<div class="symbol-item">
              ${
                item.icon
                  ? `<img src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.title)}" />`
                  : '<div style="width:32px;height:32px;border-radius:10px;border:1px dashed #d9dfff;background:#f0f2ff;"></div>'
              }
              <div>
                <div>${escapeHtml(item.title)}</div>
                <small>Lv.${escapeHtml(String(item.level))}</small>
              </div>
            </div>`,
        )
        .join("")
      return `<div style="margin-bottom:12px;">
        <strong style="font-size:13px;color:#4b5788;">${escapeHtml(group.title)}</strong>
        <div class="symbol-grid">${list}</div>
      </div>`
    })
    .filter(Boolean)
    .join("")
  return content || '<div class="empty">暫無符文資料</div>'
}

function renderExperienceChart(series: ExperiencePoint[]) {
  if (!series.length) {
    return '<div class="empty">暫無經驗紀錄</div>'
  }
  const bars = buildChartBars(series)
  return `<div class="chart-area">${bars}</div>`
}

function buildChartBars(series: ExperiencePoint[]) {
  const maxGain = Math.max(...series.map((item) => item.gain ?? 0), 1)
  return series
    .map((item) => {
      const height = Math.max(6, Math.round(((item.gain ?? 0) / maxGain) * 100))
      return `<div class="exp-bar" style="height:${height}%">
        <small>${escapeHtml(formatCompactNumber(item.gain))}</small>
        <span>${escapeHtml(item.date.slice(5))}</span>
      </div>`
    })
    .join("")
}

function buildJobLabel(summary: CharacterSummary) {
  if (summary.job && summary.jobDetail) {
    return `${summary.job} / ${summary.jobDetail}`
  }
  return summary.job ?? "未知職業"
}

function formatCompactNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0"
  const numeric = typeof value === "string" ? Number(value) : value
  if (!numeric || Number.isNaN(numeric)) return "0"
  if (numeric >= 1e12) return `${(numeric / 1e12).toFixed(2)}T`
  if (numeric >= 1e9) return `${(numeric / 1e9).toFixed(2)}B`
  if (numeric >= 1e6) return `${(numeric / 1e6).toFixed(2)}M`
  if (numeric >= 1e3) return `${(numeric / 1e3).toFixed(2)}K`
  return numeric.toFixed(0)
}

function formatTaiwanNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "--"
  const numeric = typeof value === "string" ? Number(value) : value
  if (!numeric || Number.isNaN(numeric)) return "--"
  const units = [
    { threshold: 1e12, label: "兆" },
    { threshold: 1e8, label: "億" },
    { threshold: 1e4, label: "萬" },
  ]
  for (const unit of units) {
    if (numeric >= unit.threshold) {
      return `${(numeric / unit.threshold).toFixed(2).replace(/\.0+$/, "")}${unit.label}`
    }
  }
  return formatNumber(numeric)
}

function transformGrade(grade?: string) {
  if (!grade) return ""
  if (/레전드리/i.test(grade)) return "傳說"
  if (/유니크/i.test(grade)) return "獨特"
  if (/에픽/i.test(grade)) return "史詩"
  return grade
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
