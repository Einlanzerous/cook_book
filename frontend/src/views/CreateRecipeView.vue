<script setup>
import RecipeForm from '../components/recipe/RecipeForm.vue'
</script>

<template>
  <div>
    <div class="mb-6">
      <router-link to="/" class="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2">
        <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to recipes
      </router-link>
      <h1 class="text-2xl font-bold text-gray-900">Create New Recipe</h1>
    </div>

    <RecipeForm />
  </div>
</template>
