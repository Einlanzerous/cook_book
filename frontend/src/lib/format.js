/** Minutes as "30 min" / "1 h 15 min"; null when there is no value. */
export function formatMinutes(min) {
  if (min === null || min === undefined || !Number.isFinite(min)) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "12 Mar 2026" (UTC, so the day does not drift with the viewer's zone). */
export function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
