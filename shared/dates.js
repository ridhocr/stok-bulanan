const dayMs = 86400000
const isoDate = /^\d{4}-\d{2}-\d{2}$/

export function validDate(value) {
  if (typeof value !== 'string' || !isoDate.test(value) || value.startsWith('0000')) return false
  const time = new Date(value)
  return Number.isFinite(+time) && time.toISOString().slice(0, 10) === value
}

export function daysBetween(start, end) {
  return (Date.parse(end) - Date.parse(start)) / dayMs + 1
}

export function addDays(date, days) {
  return new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10)
}

export function localDate(timezone = 'Asia/Jakarta', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return [fields.year, fields.month, fields.day].join('-')
}
