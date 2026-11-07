<script setup>
import { ref, computed } from 'vue'
import { scaleIngredient, servingOptions } from '../../lib/quantity'

const props = defineProps({
  ingredients: {
    type: Array,
    default: () => []
  },
  // The yield the stored amounts are written for.
  baseServings: {
    type: Number,
    default: 2
  },
  // The selected serving size (v-model:servings). Defaults to the base yield.
  servings: {
    type: Number,
    default: null
  }
})
const emit = defineEmits(['update:servings'])

const base = computed(() => props.baseServings || 2)
const options = computed(() => servingOptions(base.value))
// Uncontrolled use (no v-model) keeps its own selection.
const local = ref(null)
const selected = computed(() => props.servings ?? local.value ?? base.value)

function select(n) {
  local.value = n
  emit('update:servings', n)
}

const rows = computed(() =>
  props.ingredients.map((ing, i) => {
    const s = scaleIngredient(ing, selected.value / base.value)
    return { id: ing.id ?? i, name: ing.name, qty: [s.amount, s.unit].filter(Boolean).join(' ') }
  })
)

// Tap-to-check, kept per row id.
const checked = ref({})
function toggle(id) {
  checked.value = { ...checked.value, [id]: !checked.value[id] }
}
</script>

<template>
  <section class="flex max-w-[400px] flex-col gap-5">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="font-serif text-[26px] font-medium">Ingredients</h2>

      <div class="flex overflow-hidden rounded border border-rule-strong text-[13px]" role="group" aria-label="Servings">
        <button
          v-for="n in options"
          :key="n"
          type="button"
          :aria-pressed="selected === n"
          :class="[
            'px-3 py-1.5 transition-colors',
            selected === n ? 'bg-fir text-page' : 'text-muted hover:text-ink'
          ]"
          @click="select(n)"
        >
          Serves {{ n }}
        </button>
      </div>
    </div>

    <ul v-if="rows.length" class="flex flex-col">
      <li v-for="row in rows" :key="row.id">
        <button
          type="button"
          :aria-pressed="!!checked[row.id]"
          class="grid w-full grid-cols-[18px_minmax(72px,auto)_1fr] items-baseline gap-3 border-b border-rule-soft py-[11px] text-left text-[15px]"
          @click="toggle(row.id)"
        >
          <span
            :class="['h-[14px] w-[14px] self-center rounded-[2px] border border-fir', checked[row.id] ? 'bg-fir' : 'bg-transparent']"
          ></span>
          <span class="font-semibold tabular-nums text-fir" data-test="qty">{{ row.qty }}</span>
          <span :class="checked[row.id] ? 'text-faint line-through' : 'text-ink'">{{ row.name }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="italic text-muted">No ingredients listed.</p>

    <div class="flex items-center justify-between gap-3 rounded border border-dashed border-rule-strong px-4 py-3.5 text-sm text-muted">
      <span>Add to shopping list</span>
      <span class="eyebrow text-[11px]">Soon</span>
    </div>
  </section>
</template>
