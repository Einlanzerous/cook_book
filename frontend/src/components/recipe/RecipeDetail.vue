<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '../../stores/recipeStore'
import { formatMinutes, formatDate } from '../../lib/format'
import IngredientList from './IngredientList.vue'
import DirectionsList from './DirectionsList.vue'

const props = defineProps({
  recipe: {
    type: Object,
    required: true
  }
})

const router = useRouter()
const store = useRecipeStore()

async function deleteRecipe() {
  if (confirm('Are you sure you want to delete this recipe?')) {
    await store.deleteRecipe(props.recipe.id)
    router.push('/')
  }
}

// Stored amounts are written for the recipe's own yield; the toggle rescales them.
const baseServings = computed(() => props.recipe.servings || 2)
const chosenServings = ref(null)
const servings = computed(() => chosenServings.value ?? baseServings.value)

// The API returns a derived `sourceLabel`; older payloads only carry `source`
// (stored as written, 'manual' = no label).
const sourceLabel = computed(() => {
  if (props.recipe.sourceLabel !== undefined) return props.recipe.sourceLabel
  const s = (props.recipe.source || '').trim()
  if (!s || s.toLowerCase() === 'manual') return null
  return s.toLowerCase() === 'hellofresh' ? 'HelloFresh' : s
})

const eyebrow = computed(() => [props.recipe.category, props.recipe.cuisine].filter(Boolean).join(' · '))

const added = computed(() => formatDate(props.recipe.createdAt))

const total = computed(() => {
  const r = props.recipe
  if (r.totalMinutes != null) return r.totalMinutes
  return r.prepTime != null || r.cookTime != null ? (r.prepTime || 0) + (r.cookTime || 0) : null
})

// Prep and cook are always shown when stored; when the split was estimated
// (timeSplitEstimated) they carry an "est." marker rather than being hidden.
const stats = computed(() => {
  const est = !!props.recipe.timeSplitEstimated
  return [
    { key: 'Total', value: formatMinutes(total.value) },
    { key: 'Prep', value: formatMinutes(props.recipe.prepTime), est },
    { key: 'Cook', value: formatMinutes(props.recipe.cookTime), est },
    { key: 'Serves', value: String(servings.value) }
  ]
})
</script>

<template>
  <article class="pb-16">
    <div class="mb-10 flex items-center justify-between gap-4 text-sm">
      <router-link to="/" class="text-muted hover:text-ink">← All recipes</router-link>
      <div class="flex gap-5 text-muted">
        <router-link :to="`/edit/${recipe.id}`" class="hover:text-ink">Edit</router-link>
        <button type="button" class="hover:text-danger" @click="deleteRecipe">Delete</button>
      </div>
    </div>

    <header class="mb-10 flex max-w-[860px] flex-col gap-5">
      <div v-if="eyebrow || recipe.vegetarian" class="eyebrow">
        {{ eyebrow }}
        <template v-if="recipe.vegetarian">
          <span v-if="eyebrow"> · </span><span class="text-fir" data-test="vegetarian">Vegetarian</span>
        </template>
      </div>
      <h1 class="font-serif text-[clamp(38px,5vw,60px)] font-normal leading-[1.05] tracking-[-0.02em] text-balance">
        {{ recipe.title }}
      </h1>
      <p v-if="recipe.description" class="text-lg leading-[1.6] text-ink-soft text-pretty">{{ recipe.description }}</p>

      <div class="flex flex-wrap gap-x-1.5 text-sm text-muted" data-test="provenance">
        <span v-if="sourceLabel || recipe.sourceUrl">
          From
          <a
            v-if="recipe.sourceUrl"
            :href="recipe.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-fir underline underline-offset-[3px] hover:text-fir-dark"
          >{{ sourceLabel || 'the original recipe' }}</a>
          <template v-else>{{ sourceLabel }}</template>
        </span>
        <span v-if="(sourceLabel || recipe.sourceUrl) && (recipe.contributor || added)">·</span>
        <span v-if="recipe.contributor">
          Added by
          <router-link to="/contributors" class="border-b border-fir text-fir">{{ recipe.contributor.name }}</router-link>
        </span>
        <span v-if="recipe.contributor && added">·</span>
        <span v-if="added">{{ added }}</span>
      </div>
    </header>

    <div class="mb-7 aspect-[21/9] overflow-hidden rounded-sm bg-rule-soft">
      <img v-if="recipe.imageUrl" :src="recipe.imageUrl" :alt="recipe.title" class="h-full w-full object-cover" />
      <div v-else class="photo-placeholder flex h-full w-full items-center justify-center">
        <span class="bg-page px-2 py-1 font-mono text-xs text-faint">no photo yet</span>
      </div>
    </div>

    <dl class="mb-14 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] border-y border-rule" data-test="stats">
      <div v-for="s in stats" :key="s.key" class="flex flex-col gap-1 py-[18px]">
        <dt class="label mb-0">{{ s.key }}</dt>
        <dd class="font-serif text-[26px]">
          <template v-if="s.value">{{ s.value }}</template>
          <span v-else class="text-faint">—</span>
          <span v-if="s.est && s.value" class="font-mono text-[11px] uppercase tracking-eyebrow text-faint" title="Prep and cook are estimated from the total">{{ ' est.' }}</span>
        </dd>
      </div>
    </dl>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-16">
      <IngredientList
        :ingredients="recipe.ingredients || []"
        :baseServings="baseServings"
        :servings="servings"
        @update:servings="chosenServings = $event"
      />
      <DirectionsList :directions="recipe.directions || []" :tip="recipe.notes" />
    </div>

    <div v-if="recipe.tags?.length" class="mt-14 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-5">
      <span v-for="tag in recipe.tags" :key="tag.id" class="eyebrow">{{ tag.name }}</span>
    </div>
  </article>
</template>
