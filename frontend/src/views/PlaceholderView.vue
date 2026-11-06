<script setup>
// Stand-in for screens built in later tickets (Contributors: COOK-11, Connect: E2).
defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
})
</script>

<template>
  <section class="mx-auto max-w-[880px] py-8">
    <p class="eyebrow">{{ eyebrow }}</p>
    <h1 class="mt-4 font-serif text-5xl font-normal tracking-tight">{{ title }}</h1>
    <p class="mt-4 text-lg leading-relaxed text-ink-soft">Coming soon.</p>
  </section>
</template>
