/** Formats an SSRS DateTime default/value for `<input type="datetime-local">`. */
export function toDatetimeLocalValue(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(trimmed)) {
    return trimmed.length >= 19 ? trimmed.slice(0, 19) : trimmed.slice(0, 16)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00`
  }

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    return ''
  }

  const date = new Date(parsed)
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('')
}
