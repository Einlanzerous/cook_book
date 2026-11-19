<script setup>
// Connect screen (COOK-15, canvas 04). Public and read-only (COOK-41): no session,
// no write controls. The buttons here only copy text or run a read-only check.
import { ref, computed } from 'vue'
import { healthApi } from '../services/api'
import { BUNDLES, bundleUrl, clientConfigs } from '../utils/connect'

const bundle = BUNDLES[0]
const serverUrl = bundleUrl(bundle)
const clients = clientConfigs(serverUrl)
const client = ref(clients[0].id)
const active = computed(() => clients.find((c) => c.id === client.value))

const copied = ref('')
let timer
async function copy(which, text) {
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    /* clipboard unavailable: the text is selectable on screen */
  }
  copied.value = which
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = ''), 1400)
}

// idle | testing | ok | failed. This checks cook_book itself at /api/health;
// the MCP listener is internal and the browser cannot reach it.
const state = ref('idle')
const health = ref(null)
async function runTest() {
  state.value = 'testing'
  try {
    const { data } = await healthApi.get()
    health.value = data
    state.value = data?.status === 'ok' ? 'ok' : 'failed'
  } catch {
    health.value = null
    state.value = 'failed'
  }
}

const dot = { idle: 'bg-faint', testing: 'bg-muted', ok: 'bg-ok', failed: 'bg-danger' }
const label = { idle: 'Not tested yet', testing: 'Connecting…', ok: 'Connected', failed: 'Could not connect' }

const facts = computed(() => {
  const h = health.value || {}
  const rows = [
    { k: 'Status', v: h.status },
    { k: 'Version', v: h.version },
    { k: 'Build', v: h.sha ? String(h.sha).slice(0, 7) : null },
  ]
  // Shown only when the server reports it; the field is not part of the contract yet.
  if (Number.isInteger(h.tools)) rows.push({ k: 'Tools', v: `${h.tools} available` })
  return rows.map((r) => ({ ...r, v: r.v || '—' }))
})
</script>

<template>
  <section class="grid items-start gap-16 pt-6 pb-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
    <div class="flex max-w-[440px] flex-col gap-5">
      <p class="eyebrow">Connect · MCP</p>
      <h1 class="font-serif text-[clamp(38px,5vw,52px)] font-normal leading-[1.05] tracking-[-0.02em]">Let your agent cook from the book.</h1>
      <p class="text-[17px] leading-relaxed text-ink-soft">
        Add Commonplace as an MCP server and your assistant can search recipes and read them,
        with the source attached.
      </p>
      <div class="mt-3 flex flex-col gap-1.5">
        <span class="eyebrow">Server URL</span>
        <div class="flex items-center justify-between gap-3 border-b border-rule-strong py-2.5">
          <span class="break-all font-mono text-sm" data-testid="server-url">{{ serverUrl }}</span>
          <button type="button" class="whitespace-nowrap text-[13px] text-fir" @click="copy('url', serverUrl)">
            {{ copied === 'url' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <span class="text-[13px] text-faint">
          {{ bundle.label }} bundle: {{ bundle.note }} Sign in with your Cloudflare Access account when asked.
        </span>
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-8">
      <div>
        <div role="tablist" class="flex flex-wrap gap-7 border-b border-rule text-sm font-medium">
          <button
            v-for="c in clients"
            :key="c.id"
            type="button"
            role="tab"
            :aria-selected="client === c.id"
            :class="['-mb-px border-b-2 pb-3', client === c.id ? 'border-fir text-ink' : 'border-transparent text-muted']"
            @click="client = c.id"
          >{{ c.label }}</button>
        </div>
        <div class="flex items-center justify-between gap-3 pt-3.5 pb-2.5 text-[13px] text-muted">
          <span class="font-mono">{{ active.where }}</span>
          <button type="button" class="font-medium text-fir" @click="copy('cfg', active.text)">
            {{ copied === 'cfg' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <pre class="overflow-x-auto rounded bg-codebg px-6 py-[22px] font-mono text-[13px] leading-[1.7] text-page" data-testid="config">{{ active.text }}</pre>
      </div>

      <div class="flex flex-col gap-4 rounded border border-rule bg-surface px-6 py-[22px]">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-2.5" role="status">
            <span :class="['h-[9px] w-[9px] rounded-full', dot[state]]"></span>
            <span class="text-[15px] font-semibold">{{ label[state] }}</span>
          </div>
          <button
            type="button"
            class="rounded border border-fir px-4 py-2 text-sm font-medium text-fir hover:bg-fir-tint"
            :disabled="state === 'testing'"
            @click="runTest"
          >Test connection</button>
        </div>
        <dl v-if="state === 'ok'" class="grid gap-3.5 border-t border-rule-soft pt-4 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
          <div v-for="r in facts" :key="r.k" class="flex flex-col gap-1">
            <dt class="eyebrow">{{ r.k }}</dt>
            <dd class="font-mono text-sm">{{ r.v }}</dd>
          </div>
        </dl>
        <span v-else-if="state === 'idle'" class="text-sm text-muted">Checks the build at /api/health.</span>
        <span v-else-if="state === 'failed'" class="text-sm text-danger">The health check did not answer ok.</span>
      </div>
    </div>
  </section>
</template>
