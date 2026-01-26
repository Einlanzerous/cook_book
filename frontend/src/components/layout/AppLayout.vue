<script setup>
import { ref, onMounted } from 'vue'
import { useRecipeStore } from '../../stores/recipeStore'
import AppHeader from './AppHeader.vue'
import TabNavigation from './TabNavigation.vue'
import ImportModal from '../import/ImportModal.vue'

const store = useRecipeStore()
const showImportModal = ref(false)

onMounted(() => {
  store.fetchRecipes()
  store.fetchTags()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppHeader @show-import="showImportModal = true" />
    <TabNavigation />

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>

    <ImportModal
      :show="showImportModal"
      @close="showImportModal = false"
    />
  </div>
</template>
