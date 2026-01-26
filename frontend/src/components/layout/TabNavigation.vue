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
</script>

<template>
  <nav class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex space-x-1 overflow-x-auto py-3 scrollbar-hide">
        <!-- All Recipes tab -->
        <button
          @click="selectAll"
          :class="[
            'flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200',
            !store.activeTag
              ? 'bg-orange-100 text-orange-700'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          ]"
        >
          All Recipes
        </button>

        <!-- Tag tabs -->
        <button
          v-for="tag in topTags"
          :key="tag.id"
          @click="selectTag(tag.name)"
          :class="[
            'flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200',
            store.activeTag === tag.name
              ? 'bg-orange-100 text-orange-700'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          ]"
        >
          {{ tag.name }}
          <span class="ml-1 text-xs text-gray-400">({{ tag.recipeCount }})</span>
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
