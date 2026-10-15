/** Formats an SSRS DateTime default/value for `<input type="date">` (date only). */
export function toDateInputValue(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }

  const pad = (value: number) => String(value).padStart(2, '0')

  // en-GB short dates from SetExecutionParameters (dd/MM/yyyy[ ...]).
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed)
  if (slash && !/[AP]M/i.test(trimmed)) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    const year = Number(slash[3])
    if (first > 12) {
      return `${year}-${pad(second)}-${pad(first)}`
    }
    if (second > 12) {
      return `${year}-${pad(first)}-${pad(second)}`
    }
    // Ambiguous numeric date: prefer dd/MM/yyyy (app DefaultCulture en-GB).
    return `${year}-${pad(second)}-${pad(first)}`
  }

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) {
    return ''
  }

  const date = new Date(parsed)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
