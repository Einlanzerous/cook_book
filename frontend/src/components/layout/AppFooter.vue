<script setup>
import { appName } from '../../config'

</script>

<template>
  <footer class="border-t border-rule">
    <div class="mx-auto flex max-w-page flex-wrap items-baseline justify-between gap-4 px-5 py-7 text-[13px] text-muted sm:px-8">
      <span class="font-serif text-lg text-ink">{{ appName }}</span>
      <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <router-link to="/connect" class="!text-muted no-underline hover:!text-ink">Connect an agent via MCP &rarr;</router-link>
      </div>
    </div>
  </footer>
</template>
