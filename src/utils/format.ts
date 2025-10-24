import dayjs from 'dayjs'

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '--'
  const numeric = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(numeric)) return '--'
  return new Intl.NumberFormat('zh-CN').format(numeric)
}

export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  const numeric = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(numeric)) return '--'
  return `${numeric}%`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '--'
  const source = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(source.getTime())) return '--'
  return dayjs(source).format('YYYY-MM-DD')
}

export function formatAccessFlag(flag: string | null | undefined): string {
  if (flag === 'true') return '近7日有登入'
  if (flag === 'false') return '近7日未登入'
  return '登入状态未知'
}

export function joinList(items: string[], separator = '，'): string {
  return items.filter(Boolean).join(separator)
}
