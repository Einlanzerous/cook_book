<script setup>
defineProps({ recipe: { type: Object, required: true } })
</script>

<template>
  <router-link :to="`/recipe/${recipe.id}`" class="flex flex-col gap-3.5 no-underline" data-test="featured">
    <div class="photo-placeholder flex aspect-[5/4] items-center justify-center overflow-hidden rounded-sm">
      <img v-if="recipe.imageUrl" :src="recipe.imageUrl" :alt="recipe.title" class="h-full w-full object-cover" />
      <span v-else class="max-w-[85%] truncate bg-page px-2 py-1 font-mono text-xs text-faint">
        featured photo · {{ recipe.title.toLowerCase() }}
      </span>
    </div>
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span class="font-serif text-[22px] italic text-ink">{{ recipe.title }}</span>
      <span class="text-[13px] text-muted" data-test="byline">
        {{ [recipe.sourceLabel, recipe.contributor && `added by ${recipe.contributor.name}`].filter(Boolean).join(' · ') }}
      </span>
    </div>
  </router-link>
</template>
