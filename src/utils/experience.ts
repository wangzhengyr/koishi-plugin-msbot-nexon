import { ExperiencePoint } from '../api/types'

interface SnapshotInput {
  date: string
  level: number
  exp: number
}

export function buildExperienceSeries(history: SnapshotInput[]): ExperiencePoint[] {
  if (history.length <= 1) return []
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  const result: ExperiencePoint[] = []
  for (let index = 1; index < sorted.length; index++) {
    const prev = sorted[index - 1]
    const current = sorted[index]
    const gain = current.exp - prev.exp
    result.push({
      date: current.date,
      level: current.level,
      exp: current.exp,
      gain: gain > 0 ? gain : 0,
    })
  }
  return result
}
