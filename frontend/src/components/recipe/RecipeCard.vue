<script setup>
import { computed } from 'vue'

const props = defineProps({
  recipe: {
    type: Object,
    required: true
  }
})

const totalTime = computed(() => {
  const prep = props.recipe.prepTime || 0
  const cook = props.recipe.cookTime || 0
  return prep + cook
})

const displayTags = computed(() => {
  return props.recipe.tags?.slice(0, 3) || []
})
</script>

<template>
  <router-link
    :to="`/recipe/${recipe.id}`"
    class="group block bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100"
  >
    <!-- Image -->
    <div class="aspect-[4/3] bg-gray-100 relative overflow-hidden">
      <img
        v-if="recipe.imageUrl"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <svg class="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      <!-- Source badge -->
      <div v-if="recipe.source === 'hellofresh'" class="absolute top-2 right-2">
        <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
          HelloFresh
        </span>
      </div>
    </div>

    <!-- Content -->
    <div class="p-4">
      <h3 class="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1">
        {{ recipe.title }}
      </h3>

      <p v-if="recipe.description" class="mt-1 text-sm text-gray-500 line-clamp-2">
        {{ recipe.description }}
      </p>

      <!-- Meta info -->
      <div class="mt-3 flex items-center space-x-4 text-sm text-gray-500">
        <div v-if="totalTime" class="flex items-center">
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {{ totalTime }} min
        </div>
        <div v-if="recipe.servings" class="flex items-center">
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          {{ recipe.servings }}
        </div>
      </div>

      <!-- Tags -->
      <div v-if="displayTags.length" class="mt-3 flex flex-wrap gap-1">
        <span
          v-for="tag in displayTags"
          :key="tag.id"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
        >
          {{ tag.name }}
        </span>
        <span
          v-if="recipe.tags.length > 3"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400"
        >
          +{{ recipe.tags.length - 3 }}
        </span>
      </div>
    </div>
  </router-link>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
