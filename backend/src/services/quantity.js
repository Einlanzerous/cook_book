/**
 * Ingredient amount handling for the write path (COOK-6).
 *
 * `amount` stays the raw/display text; `quantity` is a float8 derived from it
 * so scaling and sorting have a number to work with. This is deliberately NOT
 * the shared fraction module: the web app, the HelloFresh parser and this file
 * each still carry their own fraction handling, and consolidating them is
 * COOK-9. Keep this small.
 */

const UNICODE_FRACTIONS = {
  '¼': '1/4', '½': '1/2', '¾': '3/4',
  '⅓': '1/3', '⅔': '2/3',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
const FRACTION_RE = new RegExp(`(\\d)?([${FRACTION_CHARS}])`, 'g');

/**
 * Unicode fractions to ASCII. A whole number glued to a fraction gets a
 * separating space so that '1½' becomes '1 1/2', not '11/2'.
 */
export function normalizeAmount(amount) {
  if (amount === null || amount === undefined) return amount;
  return String(amount).replace(FRACTION_RE, (_m, whole, frac) =>
    (whole ? `${whole} ` : '') + UNICODE_FRACTIONS[frac]
  );
}

/**
 * Number for an amount string, or null when it is not a plain quantity.
 * Handles 2, 1.5, .5, 1/3, 1 1/2 and Unicode fractions (1½, ⅓). Ranges
 * ('2-3'), words ('a pinch') and anything with trailing text ('1 thumb')
 * give null: the text in `amount` is then all there is.
 */
export function deriveQuantity(amount) {
  if (amount === null || amount === undefined) return null;
  if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null;
  const s = normalizeAmount(amount).trim();
  if (!s) return null;

  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?|\.\d+)$/))) return Number(m[1]);
  if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return fraction(0, m[1], m[2]);
  if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return fraction(m[1], m[2], m[3]);
  return null;
}

function fraction(whole, num, den) {
  if (Number(den) === 0) return null;
  return Number(whole) + Number(num) / Number(den);
}

/**
 * Row for Ingredient create. Precedence: when `amount` is present the quantity
 * is derived from it; only when `amount` is absent and the client sent a finite
 * numeric `quantity` is that stored as sent.
 */
export function prepareIngredient(ing) {
  const hasAmount = ing.amount !== null && ing.amount !== undefined && String(ing.amount).trim() !== '';
  const amount = hasAmount ? normalizeAmount(String(ing.amount).trim()) : (ing.amount ?? null);
  let quantity;
  if (hasAmount) {
    quantity = deriveQuantity(amount);
  } else if (typeof ing.quantity === 'number' && Number.isFinite(ing.quantity)) {
    quantity = ing.quantity;
  } else {
    quantity = null;
  }
  return { name: ing.name, amount, unit: ing.unit ?? null, quantity };
}
