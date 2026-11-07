<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ImportFromLink from '../components/import/ImportFromLink.vue'
import RecipeForm from '../components/recipe/RecipeForm.vue'

// Canvas screen 03 "Add recipe": two tabs, kept in ?tab= so a tab can be linked to.
const route = useRoute()
const router = useRouter()

const TABS = [
  { key: 'link', label: 'From a link' },
  { key: 'write', label: 'Write it out' }
]
const tab = computed(() => (route.query.tab === 'write' ? 'write' : 'link'))

function select(key) {
  router.replace({ query: { ...route.query, tab: key } })
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-[880px] flex-col gap-10 py-6">
    <div class="flex flex-col gap-3.5">
      <router-link to="/" class="text-sm !text-muted no-underline hover:!text-ink">&larr; All recipes</router-link>
      <h1 class="font-serif text-[40px] font-normal leading-tight tracking-tight sm:text-[52px]">Add a recipe</h1>
      <p class="text-[17px] leading-relaxed text-ink-soft">
        Paste a link and we'll pull it in, or write it out by hand. Either way, it's filed under a cook's name with its source.
      </p>
    </div>

    <div class="flex gap-8 border-b border-rule text-[15px] font-medium" role="tablist" aria-label="How to add">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="tab === t.key"
        class="-mb-px border-b-2 pb-3"
        :class="tab === t.key ? 'border-fir text-ink' : 'border-transparent text-muted hover:text-ink'"
        @click="select(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <ImportFromLink v-if="tab === 'link'" />
    <RecipeForm v-else />
  </section>
</template>
