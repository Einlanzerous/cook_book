<script setup>
defineProps({
  directions: {
    type: Array,
    default: () => []
  }
})
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
      <svg class="h-5 w-5 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
      Directions
    </h2>

    <ol class="space-y-4">
      <li
        v-for="direction in directions"
        :key="direction.id"
        class="flex"
      >
        <span class="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-orange-100 text-orange-700 font-semibold rounded-full mr-4 mt-0.5">
          {{ direction.stepNumber }}
        </span>
        <p class="text-gray-700 leading-relaxed pt-1">
          {{ direction.instruction }}
        </p>
      </li>
    </ol>

    <p v-if="!directions.length" class="text-gray-500 italic">
      No directions listed.
    </p>
  </div>
</template>
