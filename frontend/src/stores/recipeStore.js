import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { recipeApi, tagApi } from '../services/api'

export const useRecipeStore = defineStore('recipe', () => {
  const recipes = ref([])
  const tags = ref([])
  const currentRecipe = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const activeTag = ref(null)
  const searchQuery = ref('')

  const filteredRecipes = computed(() => {
    return recipes.value
  })

  async function fetchRecipes(tag = null) {
    loading.value = true
    error.value = null
    try {
      const response = await recipeApi.getAll(tag)
      recipes.value = response.data
      activeTag.value = tag
    } catch (e) {
      error.value = e.response?.data?.error || 'Failed to fetch recipes'
    } finally {
      loading.value = false
    }
  }

  async function fetchTags() {
    try {
      const response = await tagApi.getAll()
      tags.value = response.data
    } catch (e) {
      console.error('Failed to fetch tags:', e)
    }
  }

  async function fetchRecipe(id) {
    loading.value = true
    error.value = null
    try {
      const response = await recipeApi.getById(id)
      currentRecipe.value = response.data
      return response.data
    } catch (e) {
      error.value = e.response?.data?.error || 'Failed to fetch recipe'
      return null
    } finally {
      loading.value = false
    }
  }

  async function createRecipe(recipe) {
    loading.value = true
    error.value = null
    try {
      const response = await recipeApi.create(recipe)
      recipes.value.unshift(response.data)
      await fetchTags()
      return response.data
    } catch (e) {
      error.value = e.response?.data?.error || 'Failed to create recipe'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateRecipe(id, recipe) {
    loading.value = true
    error.value = null
    try {
      const response = await recipeApi.update(id, recipe)
      const index = recipes.value.findIndex(r => r.id === id)
      if (index !== -1) {
        recipes.value[index] = response.data
      }
      currentRecipe.value = response.data
      await fetchTags()
      return response.data
    } catch (e) {
      error.value = e.response?.data?.error || 'Failed to update recipe'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteRecipe(id) {
    loading.value = true
    error.value = null
    try {
      await recipeApi.delete(id)
      recipes.value = recipes.value.filter(r => r.id !== id)
      await fetchTags()
    } catch (e) {
      error.value = e.response?.data?.error || 'Failed to delete recipe'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function searchRecipes(query) {
    if (!query || query.trim() === '') {
      await fetchRecipes(activeTag.value)
      return
    }

    loading.value = true
    error.value = null
    searchQuery.value = query
    try {
      const response = await recipeApi.search(query)
      recipes.value = response.data
    } catch (e) {
      error.value = e.response?.data?.error || 'Search failed'
    } finally {
      loading.value = false
    }
  }

  function clearSearch() {
    searchQuery.value = ''
    fetchRecipes(activeTag.value)
  }

  return {
    recipes,
    tags,
    currentRecipe,
    loading,
    error,
    activeTag,
    searchQuery,
    filteredRecipes,
    fetchRecipes,
    fetchTags,
    fetchRecipe,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    searchRecipes,
    clearSearch
  }
})
