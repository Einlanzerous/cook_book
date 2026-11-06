// Small display helpers for the contributor screens (COOK-11).

/** "Mara Okafor" -> "MO"; one word -> first two letters. */
export function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** ISO date -> "Feb ’26" (the canvas "Since" stat). Empty string when unparseable. */
export function formatSince(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  return `${month} ’${String(d.getUTCFullYear()).slice(-2)}`
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
