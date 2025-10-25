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
  const expRate = formatExpRate(summary.expRate ?? profile.basic.expRate)
  const rankingTags = buildRankingTags(profile.basic)

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
    max-width: 1920px;
    margin: 0 auto;
  }
  .report {
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr) 360px;
    gap: 24px;
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
  .summary-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    color: #3a447a;
    font-weight: 600;
  }
  .summary-job {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(68, 93, 255, 0.12);
    color: #445dff;
  }
  .summary-level {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .summary-level strong {
    font-weight: 700;
    color: #1f2b66;
  }
  .summary-level span {
    font-size: 12px;
    color: #5f6ba6;
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
  .tag-rank {
    background: rgba(255, 153, 102, 0.15);
    color: #ff7a3d;
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
  .combat-item small {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #6d76a3;
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
    grid-template-columns: repeat(4, minmax(250px, 1fr));
    gap: 18px;
  }
  @media (max-width: 1700px) {
    .equip-card-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 1100px) {
    .equip-card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .equip-card {
    border: 1px solid #ebefff;
    border-radius: 18px;
    padding: 20px;
    background: #fbfcff;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
  }
  .equip-head {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .equip-head img {
    width: 60px;
    height: 60px;
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
    font-size: 15px;
    font-weight: 600;
    color: #293361;
  }
  .equip-meta {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .equip-meta span {
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(68, 93, 255, 0.12);
    color: #445dff;
    font-size: 11px;
    font-weight: 600;
  }
  .equip-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 10px;
  }
  .equip-stat {
    background: rgba(42, 57, 113, 0.06);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    color: #4b5788;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .equip-stat-label {
    font-weight: 600;
    color: #313c70;
  }
  .equip-stat-value {
    color: #4c5aa7;
  }
  .equip-stat-empty {
    font-size: 12px;
    color: #8b95c6;
  }
  .equip-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .equip-note {
    font-size: 12px;
    color: #54608f;
    line-height: 1.5;
  }
  .equip-note-label {
    display: block;
    font-weight: 600;
    color: #313c70;
    margin-bottom: 2px;
  }
  .equip-note-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .equip-note-empty {
    color: #9aa3cf;
    font-style: italic;
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
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(89, 100, 255, 0.18), rgba(89, 100, 255, 0.05));
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(89, 100, 255, 0.2);
    box-shadow: 0 10px 16px rgba(51, 64, 146, 0.08);
  }
  .hexa-icon img {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    object-fit: cover;
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
  .hexa-sub-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .hexa-sub-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 10px;
    background: rgba(68, 93, 255, 0.12);
  }
  .hexa-sub-item img {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    object-fit: cover;
  }
  .hexa-sub-item span {
    font-size: 12px;
    color: #4a568a;
    white-space: nowrap;
  }
  .hexa-sub-placeholder {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: rgba(68, 93, 255, 0.28);
    color: #fff;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
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
    position: relative;
    height: 260px;
    padding: 32px 24px 24px;
    display: flex;
    align-items: flex-end;
    gap: 18px;
    border-radius: 20px;
    border: 1px solid #dde2ff;
    background: linear-gradient(180deg, rgba(94, 107, 255, 0.12), rgba(94, 107, 255, 0.02));
    overflow: hidden;
  }
  .chart-area::before {
    content: "";
    position: absolute;
    inset: 18px 18px 16px;
    border-radius: 14px;
    background: repeating-linear-gradient(
      to top,
      rgba(120, 132, 196, 0.16),
      rgba(120, 132, 196, 0.16) 1px,
      transparent 1px,
      transparent 38px
    );
    pointer-events: none;
  }
  .chart-area::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0));
    pointer-events: none;
  }
  .chart-area > * {
    position: relative;
    z-index: 1;
  }
  .exp-bar {
    flex: 1;
    min-width: 32px;
    max-width: 68px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .exp-bar small {
    font-size: 11px;
    color: #3f4b94;
    font-weight: 600;
    background: #fff;
    padding: 4px 8px;
    border-radius: 8px;
    box-shadow: 0 10px 20px rgba(61, 72, 143, 0.18);
  }
  .exp-bar-track {
    position: relative;
    flex: 1;
    width: 100%;
    border-radius: 12px;
    background: rgba(94, 107, 255, 0.12);
    overflow: hidden;
    display: flex;
    align-items: flex-end;
  }
  .exp-bar-fill {
    width: 100%;
    height: var(--bar-height, 20%);
    border-radius: 12px 12px 6px 6px;
    background: linear-gradient(180deg, #6c80ff 0%, #4d5ef1 100%);
    box-shadow: 0 12px 24px rgba(73, 90, 241, 0.28);
    transition: height 0.3s ease;
  }
  .exp-bar span {
    font-size: 11px;
    color: #6f78ab;
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
              <div class="summary-meta">
                <span class="summary-job">${escapeHtml(jobLabel)}</span>
                <span class="summary-level"><strong>Lv.${escapeHtml(String(summary.level))}</strong>${
                  expRate ? `<span>${escapeHtml(expRate)}</span>` : ""
                }</span>
              </div>
              <div class="summary-sub">${escapeHtml(regionLabel)} ｜ ${escapeHtml(worldLabel)}</div>
              <div class="summary-tags">
                <span class="tag">${escapeHtml(profile.basic.guild ?? summary.guild ?? "無公會")}</span>
                <span class="tag">人氣 ${escapeHtml(formatNumber(profile.basic.popularity ?? 0))}</span>
                ${rankingTags}
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
  const generalExtra = formatBossExtra(profile.combat.generalDamage300)
  const hexaExtra = formatBossExtra(profile.combat.hexaDamage300)
  const items = [
    { label: "綜合戰力", value: formatTaiwanNumber(profile.combat.combatPower) },
    {
      label: "一般（380）",
      value: formatNumber(profile.combat.generalDamage380),
      extra: generalExtra,
    },
    {
      label: "HEXA（380）",
      value: formatNumber(profile.combat.hexaDamage380),
      extra: hexaExtra,
    },
  ]
  return `<div class="combat-card">
    ${items
      .map(
        (item) =>
          `<div class="combat-item">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            ${item.extra ? `<small>${escapeHtml(item.extra)}</small>` : ""}
          </div>`,
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
    : '<div style="width:60px;height:60px;border-radius:14px;border:1px dashed #d5dcff;background:#f0f2ff;display:flex;align-items:center;justify-content:center;font-size:11px;color:#95a0cf;">無圖</div>'
  const metaTags = [
    typeof item.starforce === "number" ? `★ ${item.starforce}` : "",
    typeof item.scrolls === "number" ? `卷軸 ${item.scrolls}` : "",
  ].filter(Boolean)
  const meta = metaTags.length
    ? `<div class="equip-meta">${metaTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : ""
  const stats = (item.stats ?? [])
    .map(
      (stat) =>
        `<div class="equip-stat">
          <span class="equip-stat-label">${escapeHtml(stat.label)}</span>
          <span class="equip-stat-value">${escapeHtml(stat.value)}</span>
        </div>`,
    )
    .join("")
  const detailSections: string[] = []
  if (item.potentials?.length) {
    detailSections.push(renderEquipOptionBlock("潛能", item.potentials))
  }
  if (item.additionalPotentials?.length) {
    detailSections.push(renderEquipOptionBlock("附加", item.additionalPotentials))
  }
  if (item.flameSummary) {
    detailSections.push(
      `<div class="equip-note">
        <span class="equip-note-label">火花</span>
        <div class="equip-note-lines"><span>${escapeHtml(item.flameSummary)}</span></div>
      </div>`,
    )
  }
  const detail =
    detailSections.length > 0 ? detailSections.join("") : '<div class="equip-note equip-note-empty">未提供潛能資訊</div>'

  return `<div class="equip-card">
    <div class="equip-head">
      ${icon}
      <div>
        <div class="equip-slot">${escapeHtml(item.slotLabel)}</div>
        <div class="equip-name">${escapeHtml(item.name)}</div>
        ${meta}
      </div>
    </div>
    <div class="equip-stats">${stats || '<div class="equip-stat-empty">暫無屬性</div>'}</div>
    <div class="equip-detail">${detail}</div>
  </div>`
}

function renderEquipOptionBlock(label: string, options: string[]): string {
  if (!options.length) return ""
  return `<div class="equip-note">
    <span class="equip-note-label">${escapeHtml(label)}</span>
    <div class="equip-note-lines">
      ${options.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
    </div>
  </div>`
}

function renderHexaNodes(nodes: MapleScouterHexaNode[]) {
  if (!nodes.length) return '<div class="empty">暫無六轉資料</div>'
  return `<div class="hexa-list">
    ${nodes
      .map((node) => {
        const percent = Math.min(100, Math.round((node.level / 30) * 100))
        const icon = node.icon ?? HEXA_ICONS[node.key] ?? HEXA_ICONS.default
        const name = node.mainSkill ?? node.label
        const subtitle = node.subSkills?.length ? renderHexaSubSkills(node) : ""
        return `<div>
          <div class="hexa-line">
            <div class="hexa-icon"><img src="${escapeHtml(icon)}" alt="${escapeHtml(name)}" /></div>
            <div class="hexa-info">
              <strong>${escapeHtml(name)}</strong>
              <span>Lv.${escapeHtml(String(node.level))}</span>
              ${subtitle}
            </div>
          </div>
          <div class="hexa-bar"><span style="width:${percent}%"></span></div>
        </div>`
      })
      .join("")}
  </div>`
}

function renderHexaSubSkills(node: MapleScouterHexaNode) {
  if (!node.subSkills || !node.subSkills.length) return ""
  return `<div class="hexa-sub-list">
    ${node.subSkills
      .map((name, index) => {
        const icon = node.subSkillIcons?.[index]
        const iconNode = icon
          ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(name)}" />`
          : `<span class="hexa-sub-placeholder">${escapeHtml(name.slice(0, 2))}</span>`
        return `<div class="hexa-sub-item">
          ${iconNode}
          <span>${escapeHtml(name)}</span>
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
      return `<div class="exp-bar">
        <small>${escapeHtml(formatCompactNumber(item.gain))}</small>
        <div class="exp-bar-track">
          <div class="exp-bar-fill" style="--bar-height:${height}%;"></div>
        </div>
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

function formatBossExtra(value?: number | null): string | null {
  if (value === null || value === undefined) return null
  return `300：${formatNumber(value)}`
}

function formatExpRate(rate?: string | number | null): string | null {
  if (rate === null || rate === undefined) return null
  const numeric = typeof rate === "string" ? Number(rate) : rate
  if (!Number.isFinite(numeric)) return null
  return `${numeric.toFixed(2).replace(/\.0+$/, "")}%`
}

function buildRankingTags(basic: MapleScouterProfile["basic"]): string {
  const entries: string[] = []
  if (basic.characterRanking) {
    entries.push(`綜合 #${formatNumber(basic.characterRanking)}`)
  }
  if (basic.worldRanking) {
    entries.push(`伺服器 #${formatNumber(basic.worldRanking)}`)
  }
  if (basic.classRanking) {
    entries.push(`職業 #${formatNumber(basic.classRanking)}`)
  }
  return entries.map((text) => `<span class="tag tag-rank">${escapeHtml(text)}</span>`).join("")
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
