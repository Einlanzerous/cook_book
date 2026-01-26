<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useRecipeStore } from '../stores/recipeStore'
import RecipeForm from '../components/recipe/RecipeForm.vue'

const route = useRoute()
const store = useRecipeStore()

const recipe = ref(null)

onMounted(async () => {
  recipe.value = await store.fetchRecipe(route.params.id)
})
</script>

<template>
  <div>
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
      <h3 class="text-lg font-medium text-gray-900 mb-1">Recipe not found</h3>
      <p class="text-gray-500 mb-4">{{ store.error }}</p>
      <router-link to="/" class="btn btn-primary">
        Back to recipes
      </router-link>
    </div>

    <!-- Edit form -->
    <div v-else-if="recipe">
      <div class="mb-6">
        <router-link :to="`/recipe/${recipe.id}`" class="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2">
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to recipe
        </router-link>
        <h1 class="text-2xl font-bold text-gray-900">Edit Recipe</h1>
      </div>

      <RecipeForm :recipe="recipe" />
    </div>
  </div>
</template>
