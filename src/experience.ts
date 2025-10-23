import { CharacterBasicSnapshot } from './nexon'

export interface ExpPoint {
  date: string
  label: string
  exp: number
  gain: number
}

export function buildExperienceSeries(stats: CharacterBasicSnapshot[]): ExpPoint[] {
  if (stats.length <= 1) return []

  const sorted = [...stats].sort((a, b) => a.date.localeCompare(b.date))
  const series: ExpPoint[] = []

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    const prevExp = previous.exp
    const currExp = current.exp
    if (Number.isFinite(prevExp) && Number.isFinite(currExp)) {
      const gain = currExp - prevExp
      series.push({
        date: current.date,
        label: current.date.slice(5),
        exp: currExp,
        gain: gain > 0 ? gain : 0,
      })
    }
  }

  return series
}
