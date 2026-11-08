/**
 * Form drafts that survive the sign-in round trip (COOK-23). Following the
 * sign-in link is a full navigation, which destroys form state, so a form that
 * gets a 401 on save stores its draft in sessionStorage (keyed by route),
 * shows the session-expired message, and restores the draft when it mounts
 * again. The draft is cleared after a successful submit.
 */
const PREFIX = 'commonplace:draft:'

export function saveDraft(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    // Storage full or blocked: signing in still works, the draft is lost.
  }
}

export function loadDraft(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearDraft(key) {
  try {
    sessionStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

export const isUnauthorized = (e) => e?.response?.status === 401

/** Where the sign-in link goes: back to the page the person was on. */
export const signInUrl = (path) => `/auth/sso?next=${encodeURIComponent(path)}`

export const SESSION_EXPIRED = 'Your session expired. Sign in again; what you typed is kept.'
