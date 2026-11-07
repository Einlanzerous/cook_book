<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '../../stores/recipeStore'
import { splitIngredientList, looksLikeList } from '../../lib/ingredientLine'
import { emptyForm, formFromRecipe, validateForm, buildPayload } from '../../lib/recipeForm'
import TagInput from './TagInput.vue'
import CookPicker from './CookPicker.vue'

// "Write it out" (and Edit). With `recipe` it edits that recipe; the PUT sends
// only what this form owns, and the form loads everything it shows (headings,
// notes, cook, category...) so an edit cannot erase them. See lib/recipeForm.js.
const props = defineProps({
  recipe: { type: Object, default: null }
})

const router = useRouter()
const store = useRecipeStore()

const form = reactive(props.recipe ? formFromRecipe(props.recipe) : emptyForm())
const errors = reactive({})
const loading = ref(false)
const submitError = ref('')

onMounted(() => {
  store.fetchTags()
})

// Total follows prep + cook until the user types a total of their own.
watch(
  () => [form.prepTime, form.cookTime],
  ([prep, cook]) => {
    if (form.totalTouched) return
    const sum = (Number(prep) || 0) + (Number(cook) || 0)
    form.totalMinutes = prep === '' && cook === '' ? '' : String(sum)
  }
)

function addIngredient() {
  form.ingredients.push({ amount: '', unit: '', name: '' })
}
function removeIngredient(index) {
  if (form.ingredients.length > 1) form.ingredients.splice(index, 1)
}
function addStep() {
  form.directions.push({ heading: '', instruction: '' })
}
function removeStep(index) {
  if (form.directions.length > 1) form.directions.splice(index, 1)
}

// Paste a whole list into an ingredient name: one ingredient per line is split
// into amount / unit / name rows. A single line pastes as normal text.
function onIngredientPaste(e, index) {
  const text = e.clipboardData?.getData('text') ?? ''
  if (!looksLikeList(text)) return
  e.preventDefault()
  const rows = splitIngredientList(text)
  const current = form.ingredients[index]
  const replaceCurrent = !current.amount && !current.unit && !current.name.trim()
  form.ingredients.splice(replaceCurrent ? index : index + 1, replaceCurrent ? 1 : 0, ...rows)
}

async function handleSubmit() {
  for (const k of Object.keys(errors)) delete errors[k]
  submitError.value = ''
  Object.assign(errors, validateForm(form, props.recipe).errors)
  if (Object.keys(errors).length) {
    submitError.value = 'A few things need another look.'
    return
  }

  loading.value = true
  try {
    const payload = buildPayload(form, props.recipe)
    if (props.recipe) {
      await store.updateRecipe(props.recipe.id, payload)
      router.push(`/recipe/${props.recipe.id}`)
    } else {
      const created = await store.createRecipe(payload)
      router.push(`/recipe/${created.id}`)
    }
  } catch (e) {
    submitError.value = e.response?.data?.error || 'Failed to save recipe'
  } finally {
    loading.value = false
  }
}

function cancel() {
  router.push(props.recipe ? `/recipe/${props.recipe.id}` : '/')
}
</script>

<template>
  <form class="flex flex-col gap-11" novalidate @submit.prevent="handleSubmit">
    <div v-if="submitError" class="rounded border border-danger/30 bg-danger-tint px-4 py-3 text-danger" role="alert">
      {{ submitError }}
    </div>

    <div class="flex flex-col gap-6">
      <div>
        <input
          id="title"
          v-model="form.title"
          type="text"
          aria-label="Recipe title"
          placeholder="Recipe title"
          class="input !py-2 font-serif !text-[26px] leading-tight sm:!text-[34px]"
          :aria-invalid="!!errors.title"
        />
        <p v-if="errors.title" class="mt-1 text-sm text-danger">{{ errors.title }}</p>
      </div>

      <textarea
        id="description"
        v-model="form.description"
        rows="2"
        aria-label="Description"
        class="input leading-relaxed"
        placeholder="A line or two about it — where it's from, why it's good."
      />

      <div class="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <label class="flex flex-col">
          <span class="label">Serves</span>
          <input v-model="form.servings" type="number" min="1" class="input" placeholder="4" />
          <span v-if="errors.servings" class="mt-1 text-sm text-danger">{{ errors.servings }}</span>
        </label>
        <label class="flex flex-col">
          <span class="label">Prep (min)</span>
          <input v-model="form.prepTime" type="number" min="0" class="input" placeholder="15" />
          <span v-if="errors.prepTime" class="mt-1 text-sm text-danger">{{ errors.prepTime }}</span>
        </label>
        <label class="flex flex-col">
          <span class="label">Cook (min)</span>
          <input v-model="form.cookTime" type="number" min="0" class="input" placeholder="30" />
          <span v-if="errors.cookTime" class="mt-1 text-sm text-danger">{{ errors.cookTime }}</span>
        </label>
        <label class="flex flex-col">
          <span class="label">Total (min)</span>
          <input
            v-model="form.totalMinutes"
            type="number"
            min="0"
            class="input"
            placeholder="45"
            @input="form.totalTouched = true"
          />
          <span v-if="errors.totalMinutes" class="mt-1 text-sm text-danger">{{ errors.totalMinutes }}</span>
        </label>
      </div>

      <div class="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:items-end">
        <label class="flex flex-col">
          <span class="label">Category</span>
          <input v-model="form.category" type="text" class="input" placeholder="Main course" />
        </label>
        <label class="flex flex-col">
          <span class="label">Cuisine</span>
          <input v-model="form.cuisine" type="text" class="input" placeholder="Korean" />
        </label>
        <label class="flex cursor-pointer items-center gap-3 py-2 text-base text-ink">
          <input v-model="form.vegetarian" type="checkbox" class="h-4 w-4 rounded-sm border-rule-strong text-fir focus:ring-fir" />
          Vegetarian
        </label>
      </div>

      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <label class="flex flex-col">
          <span class="label">Source</span>
          <input
            id="source"
            v-model="form.source"
            type="text"
            class="input"
            placeholder="Grandma's card, a cookbook, a site"
            :aria-invalid="!!errors.source"
          />
          <span v-if="errors.source" class="mt-1 text-sm text-danger">{{ errors.source }}</span>
        </label>
        <label class="flex flex-col">
          <span class="label">Source link (optional)</span>
          <input v-model="form.sourceUrl" type="url" class="input" placeholder="https://" :aria-invalid="!!errors.sourceUrl" />
          <span v-if="errors.sourceUrl" class="mt-1 text-sm text-danger">{{ errors.sourceUrl }}</span>
        </label>
      </div>

      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <span class="label">Tags</span>
          <TagInput v-model="form.tags" />
        </div>
        <CookPicker id="filed-as" v-model="form.contributorId" :error="errors.contributorId" />
      </div>

      <!-- Photo upload is COOK-25. Until then: an image link, and an honest note. -->
      <div class="flex flex-col gap-3 rounded border border-dashed border-rule-strong p-5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="label !mb-0">Photo</span>
          <span class="eyebrow">Upload coming soon</span>
        </div>
        <input v-model="form.imageUrl" type="url" class="input" placeholder="Paste an image link for now" aria-label="Image link" />
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <div class="flex items-baseline justify-between">
        <h2 class="font-serif text-[26px] font-medium">Ingredients</h2>
        <button type="button" class="text-sm text-fir hover:text-fir-dark" @click="addIngredient">+ Add line</button>
      </div>
      <div
        v-for="(ingredient, index) in form.ingredients"
        :key="index"
        class="grid grid-cols-[64px_84px_1fr_auto] items-center gap-3 sm:gap-4"
        data-test="ingredient-row"
      >
        <input v-model="ingredient.amount" type="text" class="input font-mono !text-sm" placeholder="¾" aria-label="Amount" />
        <input v-model="ingredient.unit" type="text" class="input !text-[15px]" placeholder="cup" aria-label="Unit" />
        <input
          v-model="ingredient.name"
          type="text"
          class="input !text-[15px]"
          placeholder="Jasmine rice"
          aria-label="Ingredient"
          @paste="onIngredientPaste($event, index)"
        />
        <button
          type="button"
          class="p-1 text-faint hover:text-danger disabled:opacity-40"
          :disabled="form.ingredients.length === 1"
          :aria-label="`Remove ingredient ${index + 1}`"
          @click="removeIngredient(index)"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p v-if="errors.ingredients" class="text-sm text-danger">{{ errors.ingredients }}</p>
      <p class="text-[13px] text-faint">Tip: paste a whole list — one ingredient per line — and we'll split amounts and units.</p>
    </div>

    <div class="flex flex-col gap-4">
      <div class="flex items-baseline justify-between">
        <h2 class="font-serif text-[26px] font-medium">Method</h2>
        <button type="button" class="text-sm text-fir hover:text-fir-dark" @click="addStep">+ Add step</button>
      </div>
      <div
        v-for="(step, index) in form.directions"
        :key="index"
        class="grid grid-cols-[40px_1fr_auto] items-start gap-4"
        data-test="step-row"
      >
        <span class="font-serif text-[28px] leading-[1.2] text-fir">{{ index + 1 }}</span>
        <div class="flex flex-col gap-1">
          <input v-model="step.heading" type="text" class="input !text-[15px] font-semibold" placeholder="Heading (optional)" aria-label="Step heading" />
          <textarea v-model="step.instruction" rows="3" class="input leading-relaxed" placeholder="Describe the step." aria-label="Step" />
        </div>
        <button
          type="button"
          class="p-1 text-faint hover:text-danger disabled:opacity-40"
          :disabled="form.directions.length === 1"
          :aria-label="`Remove step ${index + 1}`"
          @click="removeStep(index)"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p v-if="errors.directions" class="text-sm text-danger">{{ errors.directions }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <label for="notes" class="label">Tip or notes</label>
      <textarea
        id="notes"
        v-model="form.notes"
        rows="2"
        class="input leading-relaxed"
        placeholder="Swaps, make-ahead tips, what you'd change next time."
      />
    </div>

    <div class="flex items-center justify-end gap-5 border-t border-rule pt-6">
      <button type="button" class="text-[15px] text-muted hover:text-ink" :disabled="loading" @click="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary !px-[22px] !py-[13px] !text-[15px]" :disabled="loading">
        {{ loading ? 'Saving…' : recipe ? 'Save changes' : 'Save to the collection' }}
      </button>
    </div>
  </form>
</template>
