/**
 * "Paste a whole list" for the Write-it-out form (COOK-10): one ingredient per
 * line splits into amount / unit / name. The amount is kept as written (the
 * API normalises Unicode fractions and derives the numeric quantity).
 */

const GLYPHS = '¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞'
const NUM = `(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*[${GLYPHS}]|\\d+(?:\\.\\d+)?|\\.\\d+)`
const QUANTITY_RE = new RegExp(`^(${NUM}(?:\\s*(?:-|–|—|to)\\s*${NUM})?)(?![\\d./])`, 'i')

const UNITS = [
  'ounces', 'ounce', 'oz', 'pounds', 'pound', 'lbs', 'lb', 'cups', 'cup',
  'tablespoons', 'tablespoon', 'tbsp', 'teaspoons', 'teaspoon', 'tsp',
  'grams', 'gram', 'kg', 'g', 'ml', 'l', 'liters', 'liter', 'quarts', 'quart', 'pints', 'pint',
  'pieces', 'piece', 'cloves', 'clove', 'cans', 'can', 'packages', 'package', 'bunches', 'bunch',
  'slices', 'slice', 'sprigs', 'sprig', 'stalks', 'stalk', 'heads', 'head',
  'pinches', 'pinch', 'dashes', 'dash', 'thumbs', 'thumb'
]
const UNIT_RE = new RegExp(`^(${UNITS.join('|')})\\b\\.?\\s*(?:of\\s+)?`, 'i')

/** One line to { amount, unit, name }; null for a blank line. */
export function parseIngredientLine(line) {
  let rest = String(line ?? '')
    .replace(/^[\s\-*•●▪‣]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!rest) return null

  let amount = ''
  let unit = ''
  const q = rest.match(QUANTITY_RE)
  if (q) {
    amount = q[1].replace(/\s*\/\s*/g, '/').replace(/\s*(-|–|—)\s*/g, '-').trim()
    rest = rest.slice(q[0].length).trim()
    const u = rest.match(UNIT_RE)
    if (u && rest.slice(u[0].length).trim()) {
      unit = u[1].toLowerCase()
      rest = rest.slice(u[0].length).trim()
    }
  }
  return { amount, unit, name: rest }
}

/** Pasted text to ingredient rows (blank lines dropped). */
export function splitIngredientList(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter(Boolean)
}

/** True when pasted text is a list (more than one non-blank line). */
export const looksLikeList = (text) => splitIngredientList(text).length > 1
