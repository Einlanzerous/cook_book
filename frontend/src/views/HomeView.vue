<script setup>
import { computed } from 'vue'
import { useRecipeStore } from '../stores/recipeStore'
import RecipeCard from '../components/recipe/RecipeCard.vue'

const store = useRecipeStore()

const hasResults = computed(() => store.recipes.length > 0)
</script>

<template>
  <div>
    <!-- Page header -->
    <div class="mb-8">
      <h1 v-if="store.searchQuery" class="text-2xl font-bold text-gray-900">
        Search results for "{{ store.searchQuery }}"
      </h1>
      <h1 v-else-if="store.activeTag" class="text-2xl font-bold text-gray-900">
        {{ store.activeTag }} Recipes
      </h1>
      <h1 v-else class="text-2xl font-bold text-gray-900">
        All Recipes
      </h1>

      <p class="mt-1 text-gray-500">
        {{ store.recipes.length }} recipe{{ store.recipes.length !== 1 ? 's' : '' }}
      </p>
    </div>

    <!-- Loading state -->
    <div v-if="store.loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error state -->
    <div v-else-if="store.error" class="text-center py-12">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
        <svg class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-gray-600">{{ store.error }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasResults" class="text-center py-12">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
        <svg class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-gray-900 mb-1">No recipes found</h3>
      <p v-if="store.searchQuery" class="text-gray-500">
        Try adjusting your search or <button @click="store.clearSearch" class="text-orange-600 hover:text-orange-700">clear the search</button>.
      </p>
      <p v-else class="text-gray-500">
        Get started by creating your first recipe.
      </p>
      <router-link
        v-if="!store.searchQuery"
        to="/create"
        class="btn btn-primary mt-4"
      >
        Create Recipe
      </router-link>
    </div>

    <!-- Recipe grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <RecipeCard
        v-for="recipe in store.recipes"
        :key="recipe.id"
        :recipe="recipe"
      />
    </div>
  </div>
</template>
