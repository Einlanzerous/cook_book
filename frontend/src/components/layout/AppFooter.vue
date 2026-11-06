<script setup>
import { appName } from '../../config'

defineEmits(['show-import'])
</script>

<template>
  <footer class="border-t border-rule">
    <div class="mx-auto flex max-w-page flex-wrap items-baseline justify-between gap-4 px-5 py-7 text-[13px] text-muted sm:px-8">
      <span class="font-serif text-lg text-ink">{{ appName }}</span>
      <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <!-- Not in the canvas: keeps the existing HelloFresh import reachable until COOK-10 rebuilds Add recipe. -->
        <button type="button" class="text-muted underline decoration-1 underline-offset-[3px] hover:text-ink" @click="$emit('show-import')">
          Import from HelloFresh
        </button>
        <router-link to="/connect" class="!text-muted no-underline hover:!text-ink">Connect an agent via MCP &rarr;</router-link>
      </div>
    </div>
  </footer>
</template>
