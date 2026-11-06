<script setup>
defineProps({
  directions: {
    type: Array,
    default: () => []
  },
  // Recipe `notes`, shown as an italic tip under the steps.
  tip: {
    type: String,
    default: null
  }
})
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="mb-3 font-serif text-[26px] font-medium">Method</h2>

    <ol v-if="directions.length" class="flex flex-col gap-1.5">
      <li
        v-for="(direction, i) in directions"
        :key="direction.id"
        :class="[
          'grid grid-cols-[28px_1fr] gap-3 rounded p-4 sm:grid-cols-[40px_1fr] sm:gap-4 sm:p-5',
          i % 2 ? 'bg-fir/[0.06]' : 'bg-amber-tint'
        ]"
      >
        <span class="font-serif text-[32px] leading-none text-fir" data-test="numeral">{{ direction.stepNumber }}</span>
        <div class="flex flex-col gap-1.5">
          <span v-if="direction.heading" class="text-[15px] font-semibold" data-test="heading">{{ direction.heading }}</span>
          <p class="text-base leading-[1.65] text-ink-soft" data-test="body">{{ direction.instruction }}</p>
        </div>
      </li>
    </ol>
    <p v-else class="italic text-muted">No directions listed.</p>

    <p v-if="tip" class="mt-3 pl-5 pt-2 font-serif text-[17px] italic text-ink-soft sm:pl-[76px]" data-test="tip">{{ tip }}</p>
  </section>
</template>
