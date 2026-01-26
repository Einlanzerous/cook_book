<script setup>
import { ref, computed, watch } from 'vue'
import { useRecipeStore } from '../../stores/recipeStore'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const store = useRecipeStore()
const inputValue = ref('')
const showSuggestions = ref(false)

const suggestions = computed(() => {
  if (!inputValue.value.trim()) return []

  const search = inputValue.value.toLowerCase()
  return store.tags
    .filter(tag =>
      tag.name.toLowerCase().includes(search) &&
      !props.modelValue.includes(tag.name)
    )
    .slice(0, 5)
})

function addTag(tagName) {
  const name = tagName.trim()
  if (name && !props.modelValue.includes(name)) {
    emit('update:modelValue', [...props.modelValue, name])
  }
  inputValue.value = ''
  showSuggestions.value = false
}

function removeTag(index) {
  const newTags = [...props.modelValue]
  newTags.splice(index, 1)
  emit('update:modelValue', newTags)
}

function handleKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    if (inputValue.value.trim()) {
      addTag(inputValue.value)
    }
  } else if (e.key === 'Backspace' && !inputValue.value && props.modelValue.length) {
    removeTag(props.modelValue.length - 1)
  }
}

function handleBlur() {
  setTimeout(() => {
    showSuggestions.value = false
    if (inputValue.value.trim()) {
      addTag(inputValue.value)
    }
  }, 200)
}
</script>

<template>
  <div class="relative">
    <div class="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md bg-white focus-within:ring-1 focus-within:ring-orange-500 focus-within:border-orange-500">
      <!-- Existing tags -->
      <span
        v-for="(tag, index) in modelValue"
        :key="tag"
        class="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700"
      >
        {{ tag }}
        <button
          type="button"
          @click="removeTag(index)"
          class="ml-1 inline-flex items-center justify-center w-4 h-4 text-orange-400 hover:text-orange-600"
        >
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </span>

      <!-- Input -->
      <input
        v-model="inputValue"
        type="text"
        class="flex-1 min-w-[120px] border-0 p-1 text-sm focus:ring-0 focus:outline-none"
        placeholder="Add tags..."
        @keydown="handleKeydown"
        @focus="showSuggestions = true"
        @blur="handleBlur"
      />
    </div>

    <!-- Suggestions dropdown -->
    <div
      v-if="showSuggestions && suggestions.length"
      class="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200"
    >
      <ul class="py-1">
        <li
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          @mousedown.prevent="addTag(suggestion.name)"
          class="px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 cursor-pointer"
        >
          {{ suggestion.name }}
          <span class="text-gray-400 text-xs ml-1">({{ suggestion.recipeCount }} recipes)</span>
        </li>
      </ul>
    </div>
  </div>
</template>
