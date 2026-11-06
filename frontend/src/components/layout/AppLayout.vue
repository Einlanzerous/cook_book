<script setup>
import { ref, onMounted } from 'vue'
import { useRecipeStore } from '../../stores/recipeStore'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
import PickerModal from '../picker/PickerModal.vue'
import ImportModal from '../import/ImportModal.vue'

const store = useRecipeStore()
const showImportModal = ref(false)

const showPicker = ref(false)

onMounted(() => {
  store.fetchRecipes()
  store.fetchTags()
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-page text-ink">
    <a href="#main" class="sr-only z-20 bg-fir px-4 py-2 text-page focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
    <AppHeader @show-picker="showPicker = true" />

    <main id="main" class="mx-auto w-full max-w-page flex-1 px-5 py-8 sm:px-8">
      <slot />
    </main>

    <AppFooter @show-import="showImportModal = true" />

    <PickerModal :show="showPicker" @close="showPicker = false" />

    <ImportModal
      :show="showImportModal"
      @close="showImportModal = false"
    />
  </div>
</template>
