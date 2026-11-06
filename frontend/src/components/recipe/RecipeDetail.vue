<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '../../stores/recipeStore'
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

const totalTime = computed(() => {
  const prep = props.recipe.prepTime || 0
  const cook = props.recipe.cookTime || 0
  return prep + cook
})

async function deleteRecipe() {
  if (confirm('Are you sure you want to delete this recipe?')) {
    await store.deleteRecipe(props.recipe.id)
    router.push('/')
  }
}

// source is stored as written ('hellofresh', 'HelloFresh', ...); compare case-insensitively
const isHelloFresh = computed(() => (props.recipe.source || '').trim().toLowerCase() === 'hellofresh')
</script>

<template>
  <article class="bg-surface rounded-xl shadow-sm border border-rule-soft overflow-hidden">
    <!-- Header with image -->
    <div class="relative">
      <div class="aspect-[21/9] bg-rule-soft">
        <img
          v-if="recipe.imageUrl"
          :src="recipe.imageUrl"
          :alt="recipe.title"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-full h-full flex items-center justify-center">
          <svg class="w-24 h-24 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <!-- Back button -->
      <router-link
        to="/"
        class="absolute top-4 left-4 inline-flex items-center px-3 py-2 bg-surface/90 backdrop-blur-sm rounded-lg text-sm font-medium text-ink-soft hover:bg-surface transition-colors shadow-sm"
      >
        <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </router-link>

      <!-- Actions -->
      <div class="absolute top-4 right-4 flex space-x-2">
        <router-link
          :to="`/edit/${recipe.id}`"
          class="inline-flex items-center px-3 py-2 bg-surface/90 backdrop-blur-sm rounded-lg text-sm font-medium text-ink-soft hover:bg-surface transition-colors shadow-sm"
        >
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </router-link>
        <button
          @click="deleteRecipe"
          class="inline-flex items-center px-3 py-2 bg-surface/90 backdrop-blur-sm rounded-lg text-sm font-medium text-danger hover:bg-surface transition-colors shadow-sm"
        >
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="p-6 lg:p-8">
      <!-- Title and meta -->
      <div class="mb-6">
        <div class="flex items-start justify-between">
          <h1 class="text-3xl font-bold text-ink">{{ recipe.title }}</h1>
          <span v-if="isHelloFresh" class="flex-shrink-0 ml-4 inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-fir-tint text-fir">
            HelloFresh
          </span>
        </div>

        <p v-if="recipe.description" class="mt-2 text-muted">
          {{ recipe.description }}
        </p>

        <!-- Source URL -->
        <a
          v-if="recipe.sourceUrl"
          :href="recipe.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 inline-flex items-center text-sm text-fir hover:text-fir-dark"
        >
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View original recipe
        </a>
      </div>

      <!-- Quick info -->
      <div class="flex flex-wrap gap-6 mb-8 pb-6 border-b border-rule">
        <div v-if="totalTime" class="flex items-center">
          <div class="p-2 bg-fir-tint rounded-lg mr-3">
            <svg class="h-5 w-5 text-fir" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-muted">Total Time</p>
            <p class="font-semibold text-ink">{{ totalTime }} min</p>
          </div>
        </div>

        <div v-if="recipe.prepTime" class="flex items-center">
          <div class="p-2 bg-fir-tint rounded-lg mr-3">
            <svg class="h-5 w-5 text-fir" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-muted">Prep Time</p>
            <p class="font-semibold text-ink">{{ recipe.prepTime }} min</p>
          </div>
        </div>

        <div v-if="recipe.cookTime" class="flex items-center">
          <div class="p-2 bg-danger-tint rounded-lg mr-3">
            <svg class="h-5 w-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-muted">Cook Time</p>
            <p class="font-semibold text-ink">{{ recipe.cookTime }} min</p>
          </div>
        </div>

        <div v-if="recipe.servings" class="flex items-center">
          <div class="p-2 bg-purple-100 rounded-lg mr-3">
            <svg class="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-muted">Servings</p>
            <p class="font-semibold text-ink">{{ recipe.servings }}</p>
          </div>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="recipe.tags?.length" class="mb-8">
        <h2 class="text-sm font-medium text-muted mb-2">Tags</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="tag in recipe.tags"
            :key="tag.id"
            class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-fir-tint text-fir"
          >
            {{ tag.name }}
          </span>
        </div>
      </div>

      <!-- Two column layout for ingredients and directions -->
      <div class="grid lg:grid-cols-3 gap-8">
        <!-- Ingredients -->
        <div class="lg:col-span-1">
          <IngredientList :ingredients="recipe.ingredients" :baseServings="recipe.servings || 2" />
        </div>

        <!-- Directions -->
        <div class="lg:col-span-2">
          <DirectionsList :directions="recipe.directions" />
        </div>
      </div>
    </div>
  </article>
</template>
