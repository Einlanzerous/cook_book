<script setup>
// "What the F#@K should I make?" picker (COOK-12). Randomness lives on the
// server (GET /api/recipes/random, docs/random-recipe.md); this component only
// asks, shows the answer and passes the id it just showed as `exclude` so a
// reroll or a toggle never repeats the recipe on screen.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { recipeApi } from '../../services/api'
import { useMe } from '../../stores/me'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close'])

const router = useRouter()
const me = useMe()

const dlg = ref(null)
const vegetarian = ref(false)
const recipe = ref(null)
const matches = ref(0)
const status = ref('loading') // loading | ready | empty | error

let seq = 0
let opener = null

const meta = computed(() => {
  const r = recipe.value
  if (!r) return ''
  const parts = []
  if (r.totalMinutes) parts.push(`${r.totalMinutes} min`)
  if (r.servings) parts.push(`serves ${r.servings}`)
  return parts.join(' · ')
})
const byline = computed(() => {
  const r = recipe.value
  if (!r) return ''
  return [r.sourceLabel, r.contributor?.name].filter(Boolean).join(' · ')
})
const onlyOne = computed(() => status.value === 'ready' && matches.value === 1)

async function roll({ veg = vegetarian.value } = {}) {
  vegetarian.value = veg
  const mine = ++seq
  status.value = 'loading'
  try {
    const { data } = await recipeApi.random({ vegetarian: veg, exclude: recipe.value ? [recipe.value.id] : [] })
    if (mine !== seq) return
    matches.value = data.matches
    recipe.value = data.recipe
    status.value = data.recipe ? 'ready' : 'empty'
  } catch {
    if (mine !== seq) return
    status.value = 'error'
  }
  // The button that was focused may have been swapped out (empty/error states): keep focus inside.
  await nextTick()
  if (props.show && dlg.value && !dlg.value.contains(document.activeElement)) dlg.value.focus()
}

function close() {
  seq++ // drop any in-flight answer
  emit('close')
}

// Leaving for another page: focus should not jump back to the header button.
function leave() {
  seq++
  opener = null
  emit('close')
}

function cook() {
  const id = recipe.value?.id
  if (!id) return
  leave()
  router.push(`/recipe/${id}`)
}

// The native <dialog> gives us the top layer, the focus trap, inert background and
// Escape. `closedby` is not in every supported browser (Safari lacks it), so light dismiss is a click on the backdrop
// (the dialog has no padding, so a click whose target is the dialog itself hit the backdrop).
function open() {
  const el = dlg.value
  if (!el || el.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  recipe.value = null
  status.value = 'loading'
  el.showModal()
  el.focus()
  roll()
}

function shut() {
  const el = dlg.value
  if (!el?.open) return
  el.close()
  const back = opener
  opener = null
  // close() already restores focus to the opener; when leaving for another page it should not.
  if (back && back.isConnected) back.focus()
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

// Escape: take over from the native close so the parent's `show` stays the source of truth.
function onCancel(e) {
  e.preventDefault()
  close()
}

watch(
  () => props.show,
  (isOpen) => (isOpen ? open() : shut())
)

onMounted(() => {
  if (props.show) open()
})

onBeforeUnmount(() => {
  seq++
})
</script>

<template>
  <dialog
    ref="dlg"
    aria-labelledby="picker-eyebrow"
    tabindex="-1"
    class="w-full max-w-[min(520px,calc(100%-2rem))] rounded-lg bg-page p-0 text-ink shadow-[0_20px_60px_rgba(30,36,32,0.25)] backdrop:bg-ink/45 focus:outline-none"
    data-testid="picker-backdrop"
    @cancel="onCancel"
    @click.self="close"
  >
    <div class="flex flex-col gap-5 p-5 sm:p-7">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span id="picker-eyebrow" class="font-mono text-[11px] uppercase tracking-eyebrow text-muted">Tonight you're making</span>
        <div role="group" aria-label="Kind of recipe" class="flex overflow-hidden rounded border border-rule-strong text-[13px]">
          <button
            type="button"
            class="px-3 py-1"
            :class="!vegetarian ? 'bg-fir text-page' : 'text-muted hover:bg-fir-tint'"
            :aria-pressed="!vegetarian"
            @click="roll({ veg: false })"
          >Anything</button>
          <button
            type="button"
            class="px-3 py-1"
            :class="vegetarian ? 'bg-fir text-page' : 'text-muted hover:bg-fir-tint'"
            :aria-pressed="vegetarian"
            @click="roll({ veg: true })"
          >Vegetarian</button>
        </div>
      </div>

      <!-- Result / loading / empty / error -->
      <div aria-live="polite" class="flex flex-col gap-5">
        <template v-if="status === 'empty'">
          <div class="photo-placeholder flex aspect-video items-center justify-center rounded-sm">
            <span class="bg-page px-[7px] py-[3px] font-mono text-[11px] text-faint">nothing here</span>
          </div>
          <div class="flex flex-col gap-2" data-testid="picker-empty">
            <h2 class="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.015em]">
              {{ vegetarian ? 'No vegetarian recipes yet.' : 'The book is empty.' }}
            </h2>
            <p class="text-[13px] text-muted">
              {{ vegetarian ? 'Nothing in the book is marked vegetarian. Try Anything' + (me.canWrite ? ', or add one.' : '.') : 'There is nothing to pick from' + (me.canWrite ? '. Add a recipe and come back.' : ' yet.') }}
            </p>
          </div>
        </template>

        <template v-else-if="status === 'error'">
          <div class="photo-placeholder flex aspect-video items-center justify-center rounded-sm">
            <span class="bg-page px-[7px] py-[3px] font-mono text-[11px] text-faint">offline</span>
          </div>
          <div class="flex flex-col gap-2" data-testid="picker-error">
            <h2 class="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.015em]">Couldn't pick one.</h2>
            <p class="text-[13px] text-muted">The book didn't answer. Give it another go.</p>
          </div>
        </template>

        <template v-else>
          <div class="relative aspect-video overflow-hidden rounded-sm" :class="{ 'opacity-60': status === 'loading' && recipe }">
            <img v-if="recipe?.imageUrl" :src="recipe.imageUrl" :alt="recipe.title" class="h-full w-full object-cover" />
            <div v-else class="photo-placeholder flex h-full w-full items-center justify-center">
              <span class="bg-page px-[7px] py-[3px] font-mono text-[11px] text-faint">{{ recipe ? 'photo' : 'picking…' }}</span>
            </div>
          </div>
          <div v-if="recipe" class="flex flex-col gap-2" :class="{ 'opacity-60': status === 'loading' }">
            <div class="flex gap-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              <span v-if="meta">{{ meta }}</span>
              <span v-if="recipe.vegetarian" class="text-fir">Vegetarian</span>
            </div>
            <h2 class="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.015em]">{{ recipe.title }}</h2>
            <span v-if="byline" class="text-[13px] text-muted">{{ byline }}</span>
            <span v-if="onlyOne" class="text-[13px] text-faint">The only match, so rerolling gives you this one again.</span>
          </div>
          <div v-else class="flex flex-col gap-2" role="status">
            <h2 class="font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.015em] text-faint">Rolling the dice…</h2>
          </div>
        </template>
      </div>

      <div class="flex flex-wrap gap-3">
        <template v-if="status === 'empty'">
          <button v-if="vegetarian" type="button" class="btn btn-primary flex-1 !px-[18px] !py-[13px] !text-[15px]" @click="roll({ veg: false })">Show anything</button>
          <router-link v-else-if="me.canWrite" to="/create" class="btn btn-primary flex-1 !px-[18px] !py-[13px] !text-[15px] !text-page no-underline hover:!text-page" @click="leave">Add a recipe</router-link>
          <button type="button" class="btn btn-secondary flex-1 !px-[18px] !py-[13px] !text-[15px]" @click="close">Close</button>
        </template>
        <template v-else-if="status === 'error'">
          <button type="button" class="btn btn-primary flex-1 !px-[18px] !py-[13px] !text-[15px]" @click="roll()">Try again</button>
          <button type="button" class="btn btn-secondary flex-1 !px-[18px] !py-[13px] !text-[15px]" @click="close">Close</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-primary flex-1 !px-[18px] !py-[13px] !text-[15px]" :disabled="!recipe" @click="cook">Fine, let's cook</button>
          <button type="button" class="btn btn-secondary flex-1 !px-[18px] !py-[13px] !text-[15px]" :disabled="!recipe" @click="roll()">Nope, reroll</button>
        </template>
      </div>
    </div>
  </dialog>
</template>
