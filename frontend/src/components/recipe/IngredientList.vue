<script setup>
import { ref, computed } from 'vue'
import { fraction, multiply } from 'fractionability'

const props = defineProps({
  ingredients: {
    type: Array,
    default: () => []
  },
  baseServings: {
    type: Number,
    default: 2
  }
})

const selectedServings = ref(2)

const servingMultiplier = computed(() => {
  return selectedServings.value / (props.baseServings || 2)
})

// Convert Unicode fractions to ASCII for the library
function normalizeUnicodeFractions(str) {
  if (!str) return str
  return str
    .toString()
    .trim()
    .replace(/¼/g, '1/4')
    .replace(/½/g, '1/2')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8')
}

// Scale an amount using fractionability library
function scaleAmount(amount, multiplier) {
  if (!amount) return null

  const normalized = normalizeUnicodeFractions(amount)

  try {
    // Parse the fraction and multiply
    const frac = fraction(normalized)
    const scaled = multiply(frac, multiplier)

    // Convert to mixed number for display (e.g., "1 1/2" instead of "3/2")
    const result = scaled.toMixedNumber()

    // Replace space with " & " for clarity in mixed numbers
    if (result.includes(' ') && result.includes('/')) {
      return result.replace(' ', ' & ')
    }

    return result
  } catch (e) {
    // If parsing fails, return original
    return amount
  }
}

const scaledIngredients = computed(() => {
  return props.ingredients.map(ing => ({
    ...ing,
    scaledAmount: scaleAmount(ing.amount, servingMultiplier.value)
  }))
})

// Format the ingredient display with proper spacing
function formatIngredient(ing) {
  const parts = []
  if (ing.scaledAmount) {
    parts.push(ing.scaledAmount)
  }
  if (ing.unit) {
    parts.push(ing.unit)
  }
  // Join amount and unit with space, then add name
  const amountUnit = parts.join(' ')
  if (amountUnit) {
    return { amountUnit, name: ing.name }
  }
  return { amountUnit: '', name: ing.name }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900 flex items-center">
        <svg class="h-5 w-5 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Ingredients
      </h2>

      <!-- Serving size toggle -->
      <div class="flex items-center bg-gray-100 rounded-lg p-1">
        <button
          @click="selectedServings = 2"
          :class="[
            'px-3 py-1 text-sm font-medium rounded-md transition-colors',
            selectedServings === 2
              ? 'bg-white text-orange-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          ]"
        >
          2 servings
        </button>
        <button
          @click="selectedServings = 4"
          :class="[
            'px-3 py-1 text-sm font-medium rounded-md transition-colors',
            selectedServings === 4
              ? 'bg-white text-orange-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          ]"
        >
          4 servings
        </button>
      </div>
    </div>

    <ul class="space-y-2">
      <li
        v-for="ingredient in scaledIngredients"
        :key="ingredient.id"
        class="flex items-start p-2 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span class="w-2 h-2 mt-2 mr-3 bg-orange-400 rounded-full flex-shrink-0"></span>
        <span class="text-gray-700">
          <span v-if="formatIngredient(ingredient).amountUnit" class="font-medium">
            {{ formatIngredient(ingredient).amountUnit }}
          </span>
          {{ formatIngredient(ingredient).amountUnit ? ' ' : '' }}{{ formatIngredient(ingredient).name }}
        </span>
      </li>
    </ul>

    <p v-if="!ingredients.length" class="text-gray-500 italic">
      No ingredients listed.
    </p>
  </div>
</template>
