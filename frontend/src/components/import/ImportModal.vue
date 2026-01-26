<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { importApi } from '../../services/api'
import { useRecipeStore } from '../../stores/recipeStore'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close'])

const router = useRouter()
const store = useRecipeStore()

const url = ref('')
const loading = ref(false)
const error = ref('')

async function importRecipe() {
  if (!url.value.trim()) {
    error.value = 'Please enter a URL'
    return
  }

  if (!url.value.includes('hellofresh.com')) {
    error.value = 'Only HelloFresh URLs are supported'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await importApi.importHelloFresh(url.value)
    await store.fetchRecipes()
    await store.fetchTags()
    emit('close')
    router.push(`/recipe/${response.data.id}`)
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to import recipe'
  } finally {
    loading.value = false
  }
}

function close() {
  url.value = ''
  error.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex min-h-full items-center justify-center p-4">
        <!-- Backdrop -->
        <div
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          @click="close"
        />

        <!-- Modal -->
        <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all">
          <div class="absolute top-4 right-4">
            <button
              @click="close"
              class="text-gray-400 hover:text-gray-500"
            >
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mb-6">
            <h3 class="text-lg font-semibold text-gray-900">Import Recipe</h3>
            <p class="mt-1 text-sm text-gray-500">
              Paste a HelloFresh recipe URL to import it automatically.
            </p>
          </div>

          <div class="space-y-4">
            <div>
              <label for="import-url" class="label">Recipe URL</label>
              <input
                id="import-url"
                v-model="url"
                type="url"
                placeholder="https://www.hellofresh.com/recipes/..."
                class="input"
                :disabled="loading"
                @keyup.enter="importRecipe"
              />
            </div>

            <div v-if="error" class="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {{ error }}
            </div>

            <div class="flex justify-end space-x-3">
              <button
                @click="close"
                class="btn btn-secondary"
                :disabled="loading"
              >
                Cancel
              </button>
              <button
                @click="importRecipe"
                class="btn btn-primary"
                :disabled="loading || !url.trim()"
              >
                <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ loading ? 'Importing...' : 'Import Recipe' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
