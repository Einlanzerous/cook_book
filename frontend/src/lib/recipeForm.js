/**
 * Form state <-> API payload for the Add / Edit recipe form (COOK-10).
 *
 * The PUT is a partial update, so an edit sends exactly the fields the form
 * owns and nothing else: stored fields the form does not show (for example
 * `timeSplitEstimated` when times are untouched) are left alone, and fields it
 * does show (step headings, notes, category, cuisine, vegetarian, contributor)
 * are loaded into the form first so they round-trip instead of being erased.
 */

const emptyIngredient = () => ({ amount: '', unit: '', name: '' })
const emptyStep = () => ({ heading: '', instruction: '' })

export const isBlankSource = (s) => !s || !s.trim() || s.trim().toLowerCase() === 'manual'

export function emptyForm() {
  return {
    title: '',
    description: '',
    imageUrl: '',
    source: '',
    sourceUrl: '',
    contributorId: '',
    category: '',
    cuisine: '',
    vegetarian: false,
    servings: '',
    prepTime: '',
    cookTime: '',
    totalMinutes: '',
    totalTouched: false,
    ingredients: [emptyIngredient()],
    directions: [emptyStep()],
    notes: '',
    tags: []
  }
}

const str = (v) => (v === null || v === undefined ? '' : String(v))

/** Recipe (API read shape) to form state. 'manual' is not a source to show. */
export function formFromRecipe(recipe) {
  const f = emptyForm()
  const prepCook = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)
  return {
    ...f,
    title: str(recipe.title),
    description: str(recipe.description),
    imageUrl: str(recipe.imageUrl),
    source: isBlankSource(recipe.source) ? '' : recipe.source,
    sourceUrl: str(recipe.sourceUrl),
    contributorId: recipe.contributor?.id || recipe.contributorId || '',
    category: str(recipe.category),
    cuisine: str(recipe.cuisine),
    vegetarian: Boolean(recipe.vegetarian),
    servings: str(recipe.servings),
    prepTime: str(recipe.prepTime),
    cookTime: str(recipe.cookTime),
    totalMinutes: str(recipe.totalMinutes),
    // A total that differs from prep + cook was entered on its own: keep it.
    totalTouched: recipe.totalMinutes != null && recipe.totalMinutes !== prepCook,
    ingredients: recipe.ingredients?.length
      ? recipe.ingredients.map((i) => ({ amount: str(i.amount), unit: str(i.unit), name: str(i.name) }))
      : [emptyIngredient()],
    directions: recipe.directions?.length
      ? recipe.directions.map((d) => ({ heading: str(d.heading), instruction: str(d.instruction) }))
      : [emptyStep()],
    notes: str(recipe.notes),
    tags: recipe.tags?.map((t) => t.name) || []
  }
}

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Validate form state. Returns { errors: { field: message } }.
 * `original` is the recipe being edited (null when adding); a recipe that was
 * stored with no source label may stay that way.
 */
export function validateForm(form, original = null) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Give the recipe a title.'
  if (!original || !isBlankSource(original.source)) {
    if (!form.source.trim()) errors.source = 'Say where it came from: a person, a book, a site.'
  }
  if (!form.contributorId) errors.contributorId = 'Pick who is filing this.'
  for (const [key, label] of [['servings', 'Serves'], ['prepTime', 'Prep'], ['cookTime', 'Cook'], ['totalMinutes', 'Total']]) {
    const n = num(form[key])
    if (Number.isNaN(n) || (n !== null && n < 0)) errors[key] = `${label} must be a number, zero or more.`
    else if (key === 'servings' && n !== null && n < 1) errors[key] = 'Serves must be at least 1.'
  }
  if (form.sourceUrl.trim() && !/^https?:\/\/\S+$/i.test(form.sourceUrl.trim())) {
    errors.sourceUrl = 'A link starts with http:// or https://'
  }
  if (!form.ingredients.some((i) => i.name.trim())) errors.ingredients = 'Add at least one ingredient.'
  if (!form.directions.some((d) => d.instruction.trim())) errors.directions = 'Add at least one step.'
  return { errors }
}

/**
 * API payload from form state. For an edit, pass the recipe being edited so
 * the time-split flag and a blank legacy source are handled.
 */
export function buildPayload(form, original = null) {
  const prep = num(form.prepTime)
  const cook = num(form.cookTime)
  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    imageUrl: form.imageUrl.trim() || null,
    sourceUrl: form.sourceUrl.trim() || null,
    contributorId: form.contributorId,
    category: form.category.trim() || null,
    cuisine: form.cuisine.trim() || null,
    vegetarian: form.vegetarian,
    servings: num(form.servings),
    prepTime: prep,
    cookTime: cook,
    ingredients: form.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({ amount: i.amount.trim() || null, unit: i.unit.trim() || null, name: i.name.trim() })),
    directions: form.directions
      .filter((d) => d.instruction.trim())
      .map((d) => ({ heading: d.heading.trim() || null, instruction: d.instruction.trim() })),
    notes: form.notes.trim() || null,
    tags: form.tags
  }

  // A source is sent when there is one; a legacy recipe with no source keeps none.
  if (form.source.trim() || !original) payload.source = form.source.trim()

  // Total: typed by the user -> send it; otherwise the API derives prep + cook.
  if (form.totalTouched && form.totalMinutes !== '') payload.totalMinutes = num(form.totalMinutes)

  // Prep/cook that were an estimated split stop being an estimate once edited.
  if (original?.timeSplitEstimated && (prep !== original.prepTime || cook !== original.cookTime)) {
    payload.timeSplitEstimated = false
  }
  return payload
}

/** Payload for saving a previewed import: the preview as parsed, plus who filed it. */
export function payloadFromPreview(preview, contributorId) {
  return {
    title: preview.title,
    description: preview.description,
    imageUrl: preview.imageUrl,
    source: preview.source,
    sourceUrl: preview.sourceUrl,
    contributorId,
    category: preview.category,
    cuisine: preview.cuisine,
    vegetarian: preview.vegetarian,
    servings: preview.servings,
    prepTime: preview.prepTime,
    cookTime: preview.cookTime,
    totalMinutes: preview.totalMinutes,
    timeSplitEstimated: preview.timeSplitEstimated,
    ingredients: preview.ingredients,
    directions: preview.directions.map((d) => ({ heading: d.heading, instruction: d.instruction })),
    tags: preview.tags
  }
}
