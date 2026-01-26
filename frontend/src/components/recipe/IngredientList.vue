<script setup>
import { ref, computed } from 'vue'

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

// Scale an amount string (handles fractions like "1/2", "1 1/2", decimals, and integers)
function scaleAmount(amount, multiplier) {
  if (!amount) return null

  // Handle mixed fractions like "1 1/2"
  const mixedMatch = amount.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1])
    const num = parseInt(mixedMatch[2])
    const denom = parseInt(mixedMatch[3])
    const value = (whole + num / denom) * multiplier
    return formatNumber(value)
  }

  // Handle simple fractions like "1/2"
  const fractionMatch = amount.match(/^(\d+)\/(\d+)$/)
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1])
    const denom = parseInt(fractionMatch[2])
    const value = (num / denom) * multiplier
    return formatNumber(value)
  }

  // Handle decimals and integers
  const numValue = parseFloat(amount)
  if (!isNaN(numValue)) {
    return formatNumber(numValue * multiplier)
  }

  return amount
}

// Format number nicely (convert to fractions where sensible)
function formatNumber(value) {
  // Common fractions to display nicely
  const fractions = [
    { value: 0.25, display: '1/4' },
    { value: 0.333, display: '1/3' },
    { value: 0.5, display: '1/2' },
    { value: 0.666, display: '2/3' },
    { value: 0.75, display: '3/4' },
  ]

  const whole = Math.floor(value)
  const decimal = value - whole

  // Check if decimal part matches a common fraction
  for (const frac of fractions) {
    if (Math.abs(decimal - frac.value) < 0.05) {
      if (whole === 0) return frac.display
      return `${whole} ${frac.display}`
    }
  }

  // Otherwise, format as decimal or integer
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(1).replace(/\.0$/, '')
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
