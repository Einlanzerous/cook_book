<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipeStore } from '../../stores/recipeStore'
import { appName } from '../../config'

defineEmits(['show-picker'])

const route = useRoute()
const router = useRouter()
const store = useRecipeStore()

const searchInput = ref('')
const searchEl = ref(null)

let debounceTimer = null

const navItems = [
  { label: 'Recipes', to: '/', match: (r) => ['home', 'recipe', 'create', 'edit'].includes(r.name) },
  { label: 'Contributors', to: '/contributors', match: (r) => r.name === 'contributors' },
  { label: 'Connect', to: '/connect', match: (r) => r.name === 'connect' },
]

async function runSearch() {
  clearTimeout(debounceTimer)
  const q = searchInput.value.trim()
  if (q && route.name !== 'home') await router.push('/')
  if (q) {
    store.searchRecipes(q)
  } else {
    store.clearSearch()
  }
}

function handleInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runSearch, 300)
}

function clearSearch() {
  searchInput.value = ''
  store.clearSearch()
  searchEl.value?.focus()
}

// "/" focuses the search field from anywhere that isn't a text field.
function onKeydown(e) {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target
  if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
  e.preventDefault()
  searchEl.value?.focus()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(debounceTimer)
})
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-rule bg-page">
    <div class="mx-auto flex max-w-page flex-wrap items-center gap-x-10 gap-y-3 px-5 py-4 sm:px-8 sm:py-[18px]">
      <!-- Logo: hat on book + app name -->
      <router-link to="/" class="flex items-center gap-2.5 leading-none !text-ink no-underline" :aria-label="`${appName} home`">
        <svg class="h-[30px] w-[30px] shrink-0 self-center text-fir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8.6 10.6a2.5 2.5 0 0 1-.5-4.9A3.6 3.6 0 0 1 12 2.8a3.6 3.6 0 0 1 3.9 2.9 2.5 2.5 0 0 1-.5 4.9" />
          <path d="M8.6 8.8v3.6h6.8V8.8" />
          <path d="M2.5 15c3.2-1 6.4-.8 9.5 1.2 3.1-2 6.3-2.2 9.5-1.2v5.5c-3.2-1-6.4-.8-9.5 1.2-3.1-2-6.3-2.2-9.5-1.2z" />
          <path d="M12 16.2v5.5" />
        </svg>
        <span class="pb-0.5 font-serif text-[26px] font-medium leading-none tracking-[-0.01em]">{{ appName }}</span>
      </router-link>

      <!-- Primary nav -->
      <nav aria-label="Primary" class="flex gap-7 text-sm font-medium">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :aria-current="item.match(route) ? 'page' : undefined"
          class="py-1 no-underline hover:text-ink"
          :class="item.match(route) ? '!text-fir' : '!text-muted'"
        >
          {{ item.label }}
        </router-link>
      </nav>

      <!-- Search + actions -->
      <div class="flex min-w-0 flex-[1_1_520px] flex-wrap items-center justify-start gap-3 lg:justify-end">
        <form role="search" class="flex min-w-[180px] max-w-[300px] flex-[1_1_180px] items-center gap-2 border-b border-rule-strong px-0.5 py-1.5 focus-within:border-fir" @submit.prevent="runSearch">
          <span class="font-mono text-xs text-muted" aria-hidden="true">/</span>
          <label for="global-search" class="sr-only">Search recipes, ingredients, cooks</label>
          <input
            id="global-search"
            ref="searchEl"
            v-model="searchInput"
            type="search"
            autocomplete="off"
            placeholder="Search recipes, ingredients, cooks"
            aria-keyshortcuts="/"
            class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink placeholder-faint focus:outline-none focus:ring-0"
            @input="handleInput"
            @keydown.esc="clearSearch"
          />
          <button v-if="searchInput" type="button" class="text-xs text-muted hover:text-ink" aria-label="Clear search" @click="clearSearch">
            Clear
          </button>
        </form>

        <button type="button" class="btn btn-secondary !py-[9px] !px-3.5" @click="$emit('show-picker')">
          What the F#@K should I make?
        </button>
        <router-link to="/create" class="btn btn-primary !text-page no-underline hover:!text-page">
          Add recipe
        </router-link>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* Hide the native clear "x" on type=search; we render our own. */
input[type='search']::-webkit-search-cancel-button {
  display: none;
}
</style>
