<script setup>
// Canvas screen 05 Contributor.
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { contributorApi } from '../services/api'
import RecipeCard from '../components/recipe/RecipeCard.vue'
import ContributorPortrait from '../components/contributor/ContributorPortrait.vue'
import { formatSince } from '../utils/contributor'

const route = useRoute()
const profile = ref(null)
const loading = ref(true)
const notFound = ref(false)
const error = ref(null)

async function load(id) {
  loading.value = true
  notFound.value = false
  error.value = null
  profile.value = null
  try {
    profile.value = (await contributorApi.getById(id)).data
  } catch (e) {
    if (e.response?.status === 404) notFound.value = true
    else error.value = e.response?.data?.error || 'Failed to load this contributor'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, (id) => id && load(id), { immediate: true })

const stats = computed(() => profile.value ? [
  { k: 'Recipes', v: profile.value.stats.recipes },
  { k: 'Sources', v: profile.value.stats.sources },
  { k: 'Since', v: formatSince(profile.value.stats.since) },
] : [])
</script>

<template>
  <section class="flex flex-col gap-14 pt-6 pb-12">
    <p v-if="loading" class="text-muted" role="status">Loading…</p>

    <div v-else-if="notFound" class="flex flex-col gap-3">
      <h1 class="font-serif text-4xl font-normal">Contributor not found</h1>
      <router-link to="/contributors" class="text-fir">← All contributors</router-link>
    </div>

    <p v-else-if="error" class="text-danger" role="alert">{{ error }}</p>

    <template v-else-if="profile">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-end gap-12 border-b border-ink pb-10">
        <div class="flex items-center gap-6">
          <ContributorPortrait :name="profile.name" :portrait-url="profile.portraitUrl" :size="96" />
          <div class="flex min-w-0 flex-col gap-2">
            <h1 class="font-serif text-[clamp(34px,5vw,48px)] font-normal leading-none tracking-[-0.02em]">{{ profile.name }}</h1>
            <p v-if="profile.bio" class="text-[15px] text-ink-soft">{{ profile.bio }}</p>
          </div>
        </div>
        <dl class="grid grid-cols-3 gap-4">
          <div v-for="s in stats" :key="s.k" class="flex flex-col gap-1">
            <dt class="eyebrow !text-[11px]">{{ s.k }}</dt>
            <dd class="font-serif text-[30px]">{{ s.v }}</dd>
          </div>
        </dl>
      </div>

      <div class="grid items-start gap-14 lg:grid-cols-[240px_1fr]">
        <aside class="flex max-w-[280px] flex-col gap-3">
          <h2 class="eyebrow !text-[11px] mb-1 font-medium">Sources they cite</h2>
          <p v-if="!profile.sources.length" class="text-[15px] text-muted">None cited yet.</p>
          <ul v-else>
            <li v-for="s in profile.sources" :key="s.name" class="flex justify-between gap-3 border-b border-rule-soft py-2 text-[15px]">
              <span>{{ s.name }}</span>
              <span class="font-mono text-[13px] text-muted">{{ s.count }}</span>
            </li>
          </ul>
        </aside>

        <div class="min-w-0">
          <p v-if="!profile.recipes.length" class="text-muted">
            {{ profile.name }} hasn’t filed any recipes yet.
          </p>
          <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <RecipeCard v-for="r in profile.recipes" :key="r.id" :recipe="r" />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
