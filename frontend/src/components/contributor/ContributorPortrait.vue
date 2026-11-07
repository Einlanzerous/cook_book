<script setup>
import { computed } from 'vue'
import { initials } from '../../utils/contributor'

const props = defineProps({
  name: { type: String, required: true },
  portraitUrl: { type: String, default: null },
  size: { type: Number, default: 96 },
})

const style = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
// The canvas labels the large placeholder "portrait"; small ones get initials.
const label = computed(() => (props.size >= 80 ? 'portrait' : initials(props.name)))
</script>

<template>
  <img
    v-if="portraitUrl"
    :src="portraitUrl"
    :alt="`Portrait of ${name}`"
    :style="style"
    class="shrink-0 rounded-full object-cover"
  />
  <div
    v-else
    :style="style"
    class="photo-placeholder flex shrink-0 items-center justify-center rounded-full font-mono text-[10px] text-faint"
    role="img"
    :aria-label="`${name} (no portrait)`"
    data-testid="portrait-placeholder"
  >
    {{ label }}
  </div>
</template>
