<script setup>
import { computed } from 'vue'
import { useRecipeStore } from '../../stores/recipeStore'

const store = useRecipeStore()

const topTags = computed(() => {
  return store.tags.slice(0, 8)
})

function selectTag(tagName) {
  if (store.activeTag === tagName) {
    store.fetchRecipes(null)
  } else {
    store.fetchRecipes(tagName)
  }
}

function selectAll() {
  store.fetchRecipes(null)
}

// Underline-style filter links, as in the canvas's tag row.
const base = 'flex shrink-0 items-baseline gap-1.5 border-b pb-[3px] text-sm transition-colors'
const on = 'border-fir text-ink'
const off = 'border-transparent text-muted hover:text-ink'
</script>

<template>
  <nav aria-label="Filter by tag" class="border-b border-rule">
    <div class="mx-auto max-w-page px-5 sm:px-8">
      <div class="scrollbar-hide flex gap-[22px] overflow-x-auto py-3.5">
        <button type="button" :aria-pressed="!store.activeTag" :class="[base, !store.activeTag ? on : off]" @click="selectAll">
          All Recipes
        </button>

        <button
          v-for="tag in topTags"
          :key="tag.id"
          type="button"
          :aria-pressed="store.activeTag === tag.name"
          :class="[base, store.activeTag === tag.name ? on : off]"
          @click="selectTag(tag.name)"
        >
          {{ tag.name }}
          <span class="font-mono text-[11px] text-faint">{{ tag.recipeCount }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
