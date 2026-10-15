/** Formats an SSRS DateTime default/value for `<input type="date">` (date only). */
export function toDateInputValue(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    return ''
  }

  const date = new Date(parsed)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
