/**
 * Ingredient quantity parsing, normalising, scaling and display (COOK-48).
 *
 * The ONE copy of the fraction logic, shared by the web app
 * (components import this file directly) and the
 * server write path (backend/src/services/quantity.js is a re-export only).
 * Pure ES module, no dependencies, so it runs in the browser and in Node.
 * shared/quantity-fixture.json is iterated by both test suites.
 *
 * Contract
 *  - A line's number is `ingredient.quantity` when it is a finite number,
 *    otherwise `parseAmount(ingredient.amount)`. Anything else (ranges such as
 *    "2-3", words such as "1 thumb" or "a pinch", blank) has NO number and is
 *    never scaled: its `amount` text is shown as written (`scaled: false`).
 *  - Scaled values are snapped for display (see formatQuantity).
 *
 * Two parse entry points exist because the two former copies disagreed on
 * two details, and each caller keeps the behaviour it had:
 *  - parseAmount (display/scaling, was the frontend copy) knows eleven glyphs
 *    and does NOT know the fifths; a glyph may be separated from its whole
 *    number by any whitespace.
 *  - deriveQuantity (write path, was the backend copy) also knows the fifths
 *    (⅕ ⅖ ⅗ ⅘), and normalizeAmount only joins a glyph that is directly
 *    glued to its whole number, so stored text keeps the author's spacing.
 *  The only observable differences: '⅕' is null for parseAmount and 0.2 for
 *  deriveQuantity, and normalizeAmount('2  ¾') keeps both spaces.
 */

const BASE_GLYPHS = {
  '¼': '1/4', '½': '1/2', '¾': '3/4',
  '⅓': '1/3', '⅔': '2/3', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
}
const FIFTHS = { '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5' }
const WRITE_GLYPHS = { ...BASE_GLYPHS, ...FIFTHS }

function glyphReplacer(glyphs, gap) {
  const re = new RegExp(`(\\d)?${gap}([${Object.keys(glyphs).join('')}])`, 'g')
  // A whole number glued to a fraction gets a separating space: '1½' -> '1 1/2', not '11/2'.
  return (s) => s.replace(re, (_m, whole, g) => (whole ? `${whole} ` : '') + glyphs[g])
}
const displayNormalize = glyphReplacer(BASE_GLYPHS, '\\s*')
const writeNormalize = glyphReplacer(WRITE_GLYPHS, '')

/** Unicode fractions to ASCII, as stored on the write path (fifths included). */
export function normalizeAmount(amount) {
  if (amount === null || amount === undefined) return amount
  return writeNormalize(String(amount))
}

function parsePlain(s) {
  if (!s) return null
  let m
  if ((m = s.match(/^(\d+(?:\.\d+)?|\.\d+)$/))) return Number(m[1])
  if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null
  if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
    return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null
  }
  return null
}

function parseWith(normalize, amount) {
  if (amount === null || amount === undefined) return null
  if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null
  return parsePlain(normalize(String(amount)).trim())
}

/**
 * Number for an amount string, or null when it is not a plain quantity
 * (display/scaling rules; see the header for how it differs from deriveQuantity).
 * Handles 2, 1.5, .5, 1/3, 1 1/2 and Unicode fractions; ranges, words and
 * anything with trailing text ('1 thumb') give null.
 */
export function parseAmount(amount) {
  return parseWith(displayNormalize, amount)
}

/** Number stored in Ingredient.quantity for an amount string (write-path rules). */
export function deriveQuantity(amount) {
  return parseWith(normalizeAmount, amount)
}

/**
 * Row for Ingredient create. Precedence: when `amount` is present the quantity
 * is derived from it; only when `amount` is absent and the client sent a finite
 * numeric `quantity` is that stored as sent.
 */
export function prepareIngredient(ing) {
  const hasAmount = ing.amount !== null && ing.amount !== undefined && String(ing.amount).trim() !== ''
  const amount = hasAmount ? normalizeAmount(String(ing.amount).trim()) : (ing.amount ?? null)
  let quantity
  if (hasAmount) {
    quantity = deriveQuantity(amount)
  } else if (typeof ing.quantity === 'number' && Number.isFinite(ing.quantity)) {
    quantity = ing.quantity
  } else {
    quantity = null
  }
  return { name: ing.name, amount, unit: ing.unit ?? null, quantity }
}

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
