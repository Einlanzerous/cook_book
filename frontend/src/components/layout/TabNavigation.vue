<script setup>
// Tag filter row for the library ("Recently added"), as in the canvas: underline
// links with a mono count. Presentational: HomeView owns the filter state.
defineProps({
  filters: { type: Array, required: true }, // [{ key, label, count }]
  modelValue: { type: String, required: true }
})
defineEmits(['update:modelValue'])

const base = 'flex shrink-0 items-baseline gap-1.5 border-b pb-[3px] text-sm transition-colors'
const on = 'border-fir text-ink'
const off = 'border-transparent text-muted hover:text-ink'
</script>

<template>
  <nav aria-label="Filter recipes" class="flex flex-wrap gap-x-[22px] gap-y-2">
    <button
      v-for="f in filters"
      :key="f.key"
      type="button"
      :aria-pressed="modelValue === f.key"
      :class="[base, modelValue === f.key ? on : off]"
      @click="$emit('update:modelValue', f.key)"
    >
      {{ f.label }}
      <span class="font-mono text-[11px] text-faint" data-test="count">{{ f.count }}</span>
    </button>
  </nav>
</template>
