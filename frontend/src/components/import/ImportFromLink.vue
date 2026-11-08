<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { importApi } from '../../services/api'
import { useRecipeStore } from '../../stores/recipeStore'
import { formatMinutes } from '../../lib/format'
import { payloadFromPreview } from '../../lib/recipeForm'
import { useMe } from '../../stores/me'
import { saveDraft, loadDraft, clearDraft, isUnauthorized, signInUrl, SESSION_EXPIRED } from '../../lib/draft'

// "From a link" (COOK-10): paste a URL, see exactly what would be imported,
// then confirm. Nothing is saved until "Save to the collection": the preview
// comes from POST /api/import/hellofresh/preview and the confirm sends that
// same payload to POST /api/recipes. Only HelloFresh today (other sites: COOK-14).
const router = useRouter()
const route = useRoute()
const store = useRecipeStore()
const me = useMe()

// The link survives the sign-in round trip too (the preview is fetched again).
const draftKey = `${route.path}#import`
const url = ref(loadDraft(draftKey)?.url ?? '')
const sessionExpired = ref(false)
const fetching = ref(false)
const saving = ref(false)
const error = ref('')
const preview = ref(null)

function isHelloFresh(value) {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && (u.hostname === 'hellofresh.com' || u.hostname.endsWith('.hellofresh.com'))
  } catch {
    return false
  }
}

async function fetchRecipe() {
  error.value = ''
  sessionExpired.value = false
  preview.value = null
  const value = url.value.trim()
  if (!value) {
    error.value = 'Paste a recipe link first.'
    return
  }
  if (!isHelloFresh(value)) {
    error.value = 'Only HelloFresh links work today. For anything else, use "Write it out".'
    return
  }
  fetching.value = true
  try {
    const { data } = await importApi.previewHelloFresh(value)
    preview.value = data
  } catch (e) {
    if (isUnauthorized(e)) expire()
    else error.value = e.response?.data?.error || 'Could not fetch that recipe.'
  } finally {
    fetching.value = false
  }
}

function expire() {
  saveDraft(draftKey, { url: url.value })
  sessionExpired.value = true
  error.value = SESSION_EXPIRED
}

async function save() {
  saving.value = true
  error.value = ''
  sessionExpired.value = false
  try {
    const created = await store.createRecipe(payloadFromPreview(preview.value))
    clearDraft(draftKey)
    router.push(`/recipe/${created.id}`)
  } catch (e) {
    if (isUnauthorized(e)) expire()
    else error.value = e.response?.data?.error || 'Failed to save recipe'
  } finally {
    saving.value = false
  }
}

function discard() {
  preview.value = null
  error.value = ''
}

const summary = computed(() => {
  const p = preview.value
  if (!p) return ''
  return [
    formatMinutes(p.totalMinutes),
    p.servings ? `serves ${p.servings}` : null,
    `${p.ingredients.length} ingredients`,
    `${p.directions.length} steps`
  ]
    .filter(Boolean)
    .join(' · ')
})

const ingredientText = (i) => [i.amount, i.unit].filter(Boolean).join(' ')
</script>

<template>
  <div class="flex flex-col gap-7">
    <div class="flex flex-col gap-2.5">
      <label for="import-url" class="label !mb-0">Recipe URL</label>
      <form class="flex flex-wrap gap-3" @submit.prevent="fetchRecipe">
        <input
          id="import-url"
          v-model="url"
          type="url"
          class="input !border !border-rule-strong !bg-surface !px-4 !py-3.5 !text-[15px]"
          style="flex: 1; min-width: 240px"
          placeholder="https://www.hellofresh.com/recipes/…"
          :disabled="fetching || saving"
        />
        <button type="submit" class="btn btn-primary !min-h-[48px] !px-[22px] !text-[15px]" :disabled="fetching || saving">
          {{ fetching ? 'Fetching…' : 'Fetch recipe' }}
        </button>
      </form>
      <span class="text-[13px] text-faint">
        Works with HelloFresh today. Other sites are on the way; until then, use "Write it out".
      </span>
    </div>

    <div v-if="error" class="rounded border border-danger/30 bg-danger-tint px-4 py-3 text-danger" role="alert">
      {{ error }}
      <a v-if="sessionExpired" :href="signInUrl(route.fullPath)" class="ml-1 font-medium underline" data-test="session-sign-in">Sign in</a>
    </div>

    <section v-if="preview" class="flex flex-col gap-8" aria-label="Import preview" data-test="preview">
      <div class="grid grid-cols-1 gap-6 rounded border border-rule bg-surface p-5 sm:grid-cols-[180px_1fr]">
        <img v-if="preview.imageUrl" :src="preview.imageUrl" :alt="preview.title" class="aspect-square w-full rounded-sm object-cover" />
        <div v-else class="photo-placeholder flex aspect-square items-center justify-center">
          <span class="font-mono text-[10px] text-faint">no photo found</span>
        </div>
        <div class="flex flex-col gap-2.5">
          <span class="eyebrow !text-fir">Found · {{ preview.source }}</span>
          <h2 class="font-serif text-2xl leading-tight">{{ preview.title }}</h2>
          <span class="text-sm text-muted">{{ summary }}</span>
          <p v-if="preview.description" class="text-[15px] leading-relaxed text-ink-soft">{{ preview.description }}</p>
          <dl class="mt-1 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div v-for="[k, v] in [
              ['Source', preview.source],
              ['Prep', formatMinutes(preview.prepTime)],
              ['Cook', formatMinutes(preview.cookTime)],
              ['Total', formatMinutes(preview.totalMinutes)],
              ['Category', preview.category],
              ['Cuisine', preview.cuisine]
            ].filter(([, v]) => v)" :key="k">
              <dt class="eyebrow !text-[11px]">{{ k }}</dt>
              <dd class="text-ink">{{ v }}</dd>
            </div>
            <div v-if="preview.vegetarian">
              <dt class="eyebrow !text-[11px]">Diet</dt>
              <dd class="text-fir">Vegetarian</dd>
            </div>
          </dl>
          <p v-if="preview.timeSplitEstimated" class="text-[13px] text-faint">
            The page gives one total time; prep and cook are an estimated split.
          </p>
          <ul v-if="preview.tags.length" class="mt-1 flex flex-wrap gap-2" aria-label="Tags">
            <li v-for="t in preview.tags" :key="t" class="rounded-full bg-fir-tint px-2.5 py-0.5 text-sm text-fir">{{ t }}</li>
          </ul>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <h3 class="mb-3 font-serif text-[22px] font-medium">Ingredients</h3>
          <ul class="flex flex-col">
            <li
              v-for="(i, idx) in preview.ingredients"
              :key="idx"
              class="grid grid-cols-[84px_1fr] gap-3 border-b border-rule-soft py-2.5 text-[15px]"
            >
              <span class="font-semibold tabular-nums text-fir">{{ ingredientText(i) }}</span>
              <span>{{ i.name }}</span>
            </li>
          </ul>
        </div>
        <div>
          <h3 class="mb-3 font-serif text-[22px] font-medium">Method</h3>
          <ol class="flex flex-col gap-1.5">
            <li
              v-for="(d, idx) in preview.directions"
              :key="idx"
              class="grid grid-cols-[32px_1fr] gap-3 rounded px-4 py-3.5"
              :class="idx % 2 ? 'bg-fir/[0.06]' : 'bg-amber-tint'"
            >
              <span class="font-serif text-2xl leading-none text-fir">{{ idx + 1 }}</span>
              <p class="text-[15px] leading-relaxed text-ink-soft">{{ d.instruction }}</p>
            </li>
          </ol>
        </div>
      </div>

      <div class="flex flex-wrap items-end justify-between gap-6 border-t border-rule pt-6">
        <div class="min-w-[220px]" data-test="filed-as">
          <span class="label">Filed as</span>
          <p class="py-2 text-base text-ink">{{ me.me?.name }}</p>
        </div>
        <div class="flex items-center gap-5">
          <button type="button" class="text-[15px] text-muted hover:text-ink" :disabled="saving" @click="discard">Discard</button>
          <button type="button" class="btn btn-primary !px-[22px] !py-[13px] !text-[15px]" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save to the collection' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
