<script setup>
import { useRouter } from 'vue-router'
import { appName } from '../../config'
import { useMe } from '../../stores/me'

const router = useRouter()
const me = useMe()

async function signOut() {
  await me.signOut()
  await router.push('/')
}
</script>

<template>
  <footer class="border-t border-rule">
    <div class="mx-auto flex max-w-page flex-wrap items-baseline justify-between gap-x-4 gap-y-3 px-5 py-7 text-[13px] text-muted sm:px-8">
      <span class="font-serif text-lg text-ink">{{ appName }}</span>
      <div v-if="me.me" class="flex items-baseline gap-3" data-test="identity">
        <span>Filed as <span class="font-medium text-ink">{{ me.me.name }}</span></span>
        <button type="button" class="text-muted underline-offset-2 hover:text-ink hover:underline" data-test="sign-out" @click="signOut">
          Sign out
        </button>
      </div>
      <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <router-link to="/connect" class="!text-muted no-underline hover:!text-ink">Connect an agent via MCP &rarr;</router-link>
      </div>
    </div>
  </footer>
</template>
