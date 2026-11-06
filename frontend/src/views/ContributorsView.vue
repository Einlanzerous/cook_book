<script setup>
// Contributors index: the nav page the canvas does not show. Minimal list of cooks.
import { ref, onMounted } from 'vue'
import { contributorApi } from '../services/api'
import ContributorPortrait from '../components/contributor/ContributorPortrait.vue'
import { formatSince, plural } from '../utils/contributor'

const contributors = ref([])
const loading = ref(true)
const error = ref(null)

onMounted(async () => {
  try {
    contributors.value = (await contributorApi.getAll()).data
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to load contributors'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="flex flex-col gap-10 pt-6 pb-12">
    <header class="flex max-w-[640px] flex-col gap-4">
      <p class="eyebrow">Contributors<template v-if="!loading && !error"> · {{ plural(contributors.length, 'cook') }}</template></p>
      <h1 class="font-serif text-[clamp(38px,5vw,52px)] font-normal leading-[1.05] tracking-[-0.02em]">The cooks behind the book.</h1>
      <p class="text-[17px] leading-relaxed text-ink-soft">Everyone who has added to the collection, and what they bring to it.</p>
    </header>

    <p v-if="loading" class="text-muted" role="status">Loading…</p>
    <p v-else-if="error" class="text-danger" role="alert">{{ error }}</p>
    <p v-else-if="!contributors.length" class="text-muted">No contributors yet.</p>

    <ul v-else class="border-t border-ink">
      <li v-for="c in contributors" :key="c.id" class="border-b border-rule">
        <router-link
          :to="`/contributors/${c.id}`"
          class="group grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 py-5 no-underline sm:grid-cols-[auto_1fr_auto] sm:gap-x-6"
        >
          <ContributorPortrait :name="c.name" :portrait-url="c.portraitUrl" :size="56" />
          <div class="flex min-w-0 flex-col gap-1">
            <span class="font-serif text-[26px] font-normal leading-tight tracking-[-0.01em] text-ink group-hover:text-fir">{{ c.name }}</span>
            <span v-if="c.bio" class="text-[15px] text-ink-soft">{{ c.bio }}</span>
          </div>
          <dl class="col-span-2 flex gap-6 sm:col-span-1 sm:text-right">
            <div>
              <dt class="eyebrow !text-[11px]">Recipes</dt>
              <dd class="font-serif text-2xl">{{ c.recipeCount }}</dd>
            </div>
            <div>
              <dt class="eyebrow !text-[11px]">Sources</dt>
              <dd class="font-serif text-2xl">{{ c.sourceCount }}</dd>
            </div>
            <div>
              <dt class="eyebrow !text-[11px]">Since</dt>
              <dd class="font-serif text-2xl">{{ formatSince(c.joinedAt) }}</dd>
            </div>
          </dl>
        </router-link>
      </li>
    </ul>
  </section>
</template>
