<script setup>
import { computed } from 'vue'
import { byline, metaLine } from '../../services/library'

const props = defineProps({
  recipe: {
    type: Object,
    required: true
  }
})

const meta = computed(() => metaLine(props.recipe))
const by = computed(() => byline(props.recipe))
</script>

<template>
  <router-link :to="`/recipe/${recipe.id}`" class="group flex flex-col gap-3 no-underline">
    <div class="photo-placeholder relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm">
      <img
        v-if="recipe.imageUrl"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        class="h-full w-full object-cover"
        loading="lazy"
      />
      <span v-else class="max-w-[85%] truncate bg-page px-[7px] py-[3px] font-mono text-[11px] text-faint">
        {{ recipe.title.toLowerCase() }}
      </span>
    </div>

    <div v-if="meta" class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted" data-test="meta">{{ meta }}</div>

    <h3 class="font-serif text-[22px] font-medium leading-[1.2] tracking-[-0.01em] text-ink [text-wrap:pretty] group-hover:text-fir-dark">
      {{ recipe.title }}
    </h3>

    <div v-if="by" class="text-[13px] text-muted" data-test="byline">{{ by }}</div>
  </router-link>
</template>
