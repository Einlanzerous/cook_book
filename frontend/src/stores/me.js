import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, meApi } from '../services/api'
import { canWrite as canWriteFn, canEdit as canEditFn, canDelete as canDeleteFn } from '../lib/ownership'

/**
 * Who is signed in (COOK-23), from GET /api/me. Everything here is
 * presentation on top of server enforcement: a stale or tampered answer only
 * changes which buttons are drawn.
 *
 * `ensureLoaded()` starts the request once and returns the same promise to
 * everyone. Only routes whose meta asks for it await it (see the router
 * guard), so public pages never wait on /api/me. A failed request is treated
 * as signed out, with no sign-in link (we do not know sign-in is available).
 */
export const useMe = defineStore('me', () => {
  const me = ref(null)
  const signInAvailable = ref(false)
  const loaded = ref(false)
  let pending = null

  const canWrite = computed(() => canWriteFn(me.value))
  const canEdit = (recipe) => canEditFn(me.value, recipe)
  const canDelete = (recipe) => canDeleteFn(me.value, recipe)

  function ensureLoaded() {
    if (!pending) {
      pending = meApi
        .get()
        .then(({ data }) => {
          me.value = data?.contributor ?? null
          signInAvailable.value = Boolean(data?.signInAvailable)
        })
        .catch(() => {
          me.value = null
          signInAvailable.value = false
        })
        .finally(() => {
          loaded.value = true
        })
    }
    return pending
  }

  async function signOut() {
    try {
      await authApi.logout() // POST, no body
    } catch {
      // Already signed out, or the network is down: the local state clears either way.
    }
    me.value = null
  }

  return { me, signInAvailable, loaded, canWrite, canEdit, canDelete, ensureLoaded, signOut }
})
