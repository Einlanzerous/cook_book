<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '../../stores/recipeStore'
import TagInput from './TagInput.vue'

const props = defineProps({
  recipe: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['submit'])
const router = useRouter()
const store = useRecipeStore()

const form = reactive({
  title: '',
  description: '',
  imageUrl: '',
  servings: null,
  prepTime: null,
  cookTime: null,
  ingredients: [{ name: '', amount: '', unit: '' }],
  directions: [''],
  tags: []
})

const loading = ref(false)
const error = ref('')

onMounted(() => {
  store.fetchTags()

  if (props.recipe) {
    form.title = props.recipe.title || ''
    form.description = props.recipe.description || ''
    form.imageUrl = props.recipe.imageUrl || ''
    form.servings = props.recipe.servings
    form.prepTime = props.recipe.prepTime
    form.cookTime = props.recipe.cookTime
    form.ingredients = props.recipe.ingredients?.length
      ? props.recipe.ingredients.map(i => ({ name: i.name, amount: i.amount || '', unit: i.unit || '' }))
      : [{ name: '', amount: '', unit: '' }]
    form.directions = props.recipe.directions?.length
      ? props.recipe.directions.map(d => d.instruction)
      : ['']
    form.tags = props.recipe.tags?.map(t => t.name) || []
  }
})

function addIngredient() {
  form.ingredients.push({ name: '', amount: '', unit: '' })
}

function removeIngredient(index) {
  if (form.ingredients.length > 1) {
    form.ingredients.splice(index, 1)
  }
}

function addDirection() {
  form.directions.push('')
}

function removeDirection(index) {
  if (form.directions.length > 1) {
    form.directions.splice(index, 1)
  }
}

async function handleSubmit() {
  if (!form.title.trim()) {
    error.value = 'Title is required'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const recipeData = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      servings: form.servings || null,
      prepTime: form.prepTime || null,
      cookTime: form.cookTime || null,
      ingredients: form.ingredients.filter(i => i.name.trim()),
      directions: form.directions.filter(d => d.trim()),
      tags: form.tags
    }

    if (props.recipe) {
      await store.updateRecipe(props.recipe.id, recipeData)
      router.push(`/recipe/${props.recipe.id}`)
    } else {
      const newRecipe = await store.createRecipe(recipeData)
      router.push(`/recipe/${newRecipe.id}`)
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to save recipe'
  } finally {
    loading.value = false
  }
}

function cancel() {
  if (props.recipe) {
    router.push(`/recipe/${props.recipe.id}`)
  } else {
    router.push('/')
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-8">
    <!-- Error message -->
    <div v-if="error" class="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
      {{ error }}
    </div>

    <!-- Basic info -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>

      <div class="grid grid-cols-1 gap-6">
        <div>
          <label for="title" class="label">Title *</label>
          <input
            id="title"
            v-model="form.title"
            type="text"
            required
            class="input"
            placeholder="Recipe title"
          />
        </div>

        <div>
          <label for="description" class="label">Description</label>
          <textarea
            id="description"
            v-model="form.description"
            rows="3"
            class="input"
            placeholder="A brief description of this recipe"
          />
        </div>

        <div>
          <label for="imageUrl" class="label">Image URL</label>
          <input
            id="imageUrl"
            v-model="form.imageUrl"
            type="url"
            class="input"
            placeholder="https://example.com/image.jpg"
          />
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div>
            <label for="servings" class="label">Servings</label>
            <input
              id="servings"
              v-model.number="form.servings"
              type="number"
              min="1"
              class="input"
              placeholder="4"
            />
          </div>
          <div>
            <label for="prepTime" class="label">Prep Time (min)</label>
            <input
              id="prepTime"
              v-model.number="form.prepTime"
              type="number"
              min="0"
              class="input"
              placeholder="15"
            />
          </div>
          <div>
            <label for="cookTime" class="label">Cook Time (min)</label>
            <input
              id="cookTime"
              v-model.number="form.cookTime"
              type="number"
              min="0"
              class="input"
              placeholder="30"
            />
          </div>
        </div>

        <div>
          <label class="label">Tags</label>
          <TagInput v-model="form.tags" />
        </div>
      </div>
    </div>

    <!-- Ingredients -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Ingredients</h2>
        <button
          type="button"
          @click="addIngredient"
          class="text-sm text-orange-600 hover:text-orange-700 font-medium"
        >
          + Add ingredient
        </button>
      </div>

      <div class="space-y-3">
        <div
          v-for="(ingredient, index) in form.ingredients"
          :key="index"
          class="flex items-center gap-3"
        >
          <input
            v-model="ingredient.amount"
            type="text"
            class="input w-20"
            placeholder="Amt"
          />
          <input
            v-model="ingredient.unit"
            type="text"
            class="input w-24"
            placeholder="Unit"
          />
          <input
            v-model="ingredient.name"
            type="text"
            class="input flex-1"
            placeholder="Ingredient name"
          />
          <button
            type="button"
            @click="removeIngredient(index)"
            class="text-gray-400 hover:text-red-500 p-1"
            :disabled="form.ingredients.length === 1"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Directions -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Directions</h2>
        <button
          type="button"
          @click="addDirection"
          class="text-sm text-orange-600 hover:text-orange-700 font-medium"
        >
          + Add step
        </button>
      </div>

      <div class="space-y-3">
        <div
          v-for="(direction, index) in form.directions"
          :key="index"
          class="flex items-start gap-3"
        >
          <span class="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-orange-100 text-orange-700 font-semibold rounded-full mt-2">
            {{ index + 1 }}
          </span>
          <textarea
            v-model="form.directions[index]"
            rows="2"
            class="input flex-1"
            :placeholder="`Step ${index + 1}`"
          />
          <button
            type="button"
            @click="removeDirection(index)"
            class="text-gray-400 hover:text-red-500 p-1 mt-2"
            :disabled="form.directions.length === 1"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end space-x-3">
      <button
        type="button"
        @click="cancel"
        class="btn btn-secondary"
        :disabled="loading"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="loading"
      >
        <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ loading ? 'Saving...' : (recipe ? 'Update Recipe' : 'Create Recipe') }}
      </button>
    </div>
  </form>
</template>
