<script setup>
import { computed, ref } from 'vue'
import { useRecipeStore } from '../stores/recipeStore'
import { useMe } from '../stores/me'
import { appName } from '../config'
import RecipeCard from '../components/recipe/RecipeCard.vue'
import FeaturedRecipe from '../components/recipe/FeaturedRecipe.vue'
import TabNavigation from '../components/layout/TabNavigation.vue'
import { ALL, buildFilters, cookCount, filterRecipes, pickFeatured, plural } from '../services/library'

const store = useRecipeStore()
const me = useMe()

const filter = ref(ALL)

const isSearching = computed(() => !!store.searchQuery)
const filters = computed(() => buildFilters(store.recipes, store.tags))
const featured = computed(() => pickFeatured(store.recipes))
const eyebrow = computed(
  () => `The house collection · ${plural(store.recipes.length, 'recipe')} · ${plural(cookCount(store.recipes), 'cook')}`
)

// If the active filter vanishes (e.g. last recipe with that tag deleted), fall back to All.
const activeFilter = computed({
  get: () => (filters.value.some((f) => f.key === filter.value) ? filter.value : ALL),
  set: (v) => { filter.value = v }
})
const shown = computed(() => filterRecipes(store.recipes, activeFilter.value))

function browse() {
  document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div>
    <!-- Search results (the header owns the search box) -->
    <div v-if="isSearching" class="mb-8">
      <h1 class="font-serif text-4xl font-normal tracking-tight text-ink">
        Search results for "{{ store.searchQuery }}"
      </h1>
      <p class="mt-1 text-muted">{{ plural(store.recipes.length, 'recipe') }}</p>
    </div>

    <!-- Hero + featured -->
    <section
      v-else-if="!store.loading && !store.error && store.recipes.length"
      class="grid items-end grid-cols-[minmax(0,1fr)] gap-14 pb-10 pt-6 sm:pt-12 md:grid-cols-2"
    >
      <div class="flex flex-col gap-7 pb-2">
        <div class="eyebrow" data-test="eyebrow">{{ eyebrow }}</div>
        <h1 class="font-serif text-[clamp(44px,6vw,76px)] font-normal leading-[1.02] tracking-[-0.025em] text-ink [text-wrap:balance]">
          Recipes worth keeping, and where they came from.
        </h1>
        <p class="max-w-[460px] text-lg leading-[1.55] text-ink-soft [text-wrap:pretty]">
          One shared cookbook. Anyone in the house can add to it — from a link, a recipe card, or an agent — and every dish keeps its source.
        </p>
        <div class="flex flex-wrap items-center gap-5">
          <button type="button" class="btn btn-primary px-5 py-3 text-[15px]" @click="browse">Browse the collection</button>
          <router-link
            v-if="me.canWrite"
            to="/create"
            class="border-b border-fir pb-0.5 text-[15px] font-medium text-fir no-underline hover:border-fir-dark hover:text-fir-dark"
          >
            Add a recipe
          </router-link>
        </div>
      </div>
      <FeaturedRecipe v-if="featured" :recipe="featured" />
    </section>

    <!-- Loading state -->
    <div v-if="store.loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-fir" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error state -->
    <div v-else-if="store.error" class="text-center py-12">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-danger-tint rounded-full mb-4">
        <svg class="h-8 w-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-muted">{{ store.error }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!store.recipes.length" class="text-center py-12">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-rule-soft rounded-full mb-4">
        <svg class="h-8 w-8 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-ink mb-1">No recipes found</h3>
      <p v-if="store.searchQuery" class="text-muted">
        Try adjusting your search or <button @click="store.clearSearch" class="text-fir hover:text-fir-dark">clear the search</button>.
      </p>
      <p v-else class="text-muted">
        {{ me.canWrite ? 'Get started by creating your first recipe.' : 'Nothing has been added to the book yet.' }}
      </p>
      <router-link v-if="!store.searchQuery && me.canWrite" to="/create" class="btn btn-primary mt-4">
        Create Recipe
      </router-link>
    </div>

    <!-- Recently added: filters + grid -->
    <section v-else id="collection" class="scroll-mt-24 pb-16">
      <div
        v-if="!isSearching"
        class="mb-9 flex flex-wrap items-baseline justify-between gap-6 border-t border-ink pt-5"
      >
        <h2 class="font-serif text-[32px] font-normal tracking-[-0.01em] text-ink">Recently added</h2>
        <TabNavigation v-model="activeFilter" :filters="filters" />
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-7 gap-y-12" data-test="grid">
        <RecipeCard v-for="recipe in (isSearching ? store.recipes : shown)" :key="recipe.id" :recipe="recipe" />
      </div>
    </section>
  </div>
</template>
