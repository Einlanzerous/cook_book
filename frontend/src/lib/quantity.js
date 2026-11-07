/**
 * Ingredient quantity parsing, scaling and display (COOK-9).
 *
 * The one frontend copy of the fraction logic. COOK-13 (server-side scaling)
 * should port or reuse these rules so the web app and the MCP tool agree.
 *
 * Contract
 *  - A line's number is `ingredient.quantity` when it is a finite number,
 *    otherwise `parseAmount(ingredient.amount)`. Anything else (ranges such as
 *    "2-3", words such as "1 thumb" or "a pinch", blank) has NO number and is
 *    never scaled: its `amount` text is shown as written.
 *  - Scaled values are snapped for display (see formatQuantity).
 */

const GLYPHS = {
  '¼': '1/4', '½': '1/2', '¾': '3/4',
  '⅓': '1/3', '⅔': '2/3', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
}
const GLYPH_CHARS = Object.keys(GLYPHS).join('')
const GLYPH_RE = new RegExp(`(\\d)?\\s*([${GLYPH_CHARS}])`, 'g')

/** Fractions a displayed quantity may snap to, as [value, glyph]. */
const SNAP = [
  [1 / 8, '⅛'], [1 / 6, '⅙'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [5 / 6, '⅚'], [7 / 8, '⅞']
]

/**
 * Rounding tolerance: a value snaps to a whole number or one of the fractions
 * above when it lies within 0.02 of it (so 0.333 -> ⅓, 1.49 -> 1½, 0.66 -> ⅔,
 * but 0.3 stays 0.3). The nearest candidate wins. Anything further away is
 * shown as a decimal rounded to 2 places with trailing zeros dropped.
 */
export const SNAP_TOLERANCE = 0.02

/** Number for an amount string, or null when it is not a plain quantity. */
export function parseAmount(amount) {
  if (amount === null || amount === undefined) return null
  if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null
  // '1½' -> '1 1/2', '½' -> '1/2'
  const s = String(amount)
    .replace(GLYPH_RE, (_m, whole, g) => (whole ? `${whole} ` : '') + GLYPHS[g])
    .trim()
  if (!s) return null
  let m
  if ((m = s.match(/^(\d+(?:\.\d+)?|\.\d+)$/))) return Number(m[1])
  if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null
  if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
    return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null
  }
  return null
}

/** Display text for a number: "1½", "¾", "2", "0.3". */
export function formatQuantity(value) {
  if (!Number.isFinite(value) || value < 0) return ''
  const whole = Math.floor(value)
  const frac = value - whole

  let best = null // { dist, text }
  const consider = (dist, text) => {
    if (dist <= SNAP_TOLERANCE && (!best || dist < best.dist)) best = { dist, text }
  }
  consider(frac, String(whole))
  consider(1 - frac, String(whole + 1))
  for (const [v, glyph] of SNAP) consider(Math.abs(frac - v), (whole ? String(whole) : '') + glyph)
  if (best && best.text !== '0') return best.text

  // Too small to snap (or nothing close): decimal.
  return String(Math.round(value * 100) / 100)
}

/** Unit words that pluralise regularly (singular up to and including 1, as in the canvas: ¾ cup, 1½ cups); others are left exactly as stored. */
const COUNTABLE = { clove: 'cloves', cup: 'cups', slice: 'slices', can: 'cans', stalk: 'stalks', sprig: 'sprigs', bunch: 'bunches', head: 'heads' }
const SINGULAR_OF = Object.fromEntries(Object.entries(COUNTABLE).map(([s, p]) => [p, s]))

function inflectUnit(unit, quantity) {
  if (!unit) return unit
  const key = unit.toLowerCase()
  const singular = SINGULAR_OF[key] ?? (COUNTABLE[key] ? key : null)
  if (!singular) return unit
  return quantity <= 1 ? singular : COUNTABLE[singular]
}

/**
 * Scaled display parts for one ingredient.
 * @returns {{ amount: string, unit: string|null, scaled: boolean }}
 *   `scaled` is false for lines with no usable number (shown as written).
 */
export function scaleIngredient(ingredient, multiplier = 1) {
  const raw = ingredient.amount == null ? '' : String(ingredient.amount).trim()
  const q = Number.isFinite(ingredient.quantity) ? ingredient.quantity : parseAmount(raw)
  if (q === null || !(multiplier > 0)) {
    return { amount: raw, unit: ingredient.unit ?? null, scaled: false }
  }
  const amount = formatQuantity(q * multiplier)
  // Plural/singular follows the displayed number, not the raw product.
  return { amount, unit: inflectUnit(ingredient.unit ?? null, parseAmount(amount)), scaled: true }
}

/** Serving options for the toggle: 2 and 4, plus the recipe's own yield. */
export function servingOptions(baseServings) {
  const set = new Set([2, 4])
  if (Number.isInteger(baseServings) && baseServings > 0) set.add(baseServings)
  return [...set].sort((a, b) => a - b)
}
