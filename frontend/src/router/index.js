import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useMe } from '../stores/me'
import { recipeApi } from '../services/api'

// `meta.needs` marks the routes a person must be allowed to use:
//   'writer'  /create    needs a signed-in contributor
//   'editor'  /edit/:id  needs a signed-in contributor who may edit THAT recipe
// Only these routes wait for the initial /api/me; every other route renders at
// once. The server remains the enforcement; this just avoids drawing a form
// that could only fail on submit.
export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/recipe/:id',
    name: 'recipe',
    component: () => import('../views/RecipeView.vue')
  },
  {
    path: '/create',
    name: 'create',
    component: () => import('../views/CreateRecipeView.vue'),
    meta: { needs: 'writer' }
  },
  {
    path: '/contributors',
    name: 'contributors',
    component: () => import('../views/ContributorsView.vue')
  },
  {
    path: '/contributors/:id',
    name: 'contributor',
    component: () => import('../views/ContributorView.vue')
  },
  {
    path: '/connect',
    name: 'connect',
    component: () => import('../views/PlaceholderView.vue'),
    props: { eyebrow: 'Connect · MCP', title: 'Let your agent cook from the book.' }
  },
  {
    path: '/edit/:id',
    name: 'edit',
    component: () => import('../views/EditRecipeView.vue'),
    meta: { needs: 'editor' }
  }
]

/** Router guard: redirect to the recipe list unless the caller may use the route. */
export async function requireAccess(to) {
  const needs = to.meta?.needs
  if (!needs) return true

  const me = useMe()
  await me.ensureLoaded()
  if (!me.canWrite) return { path: '/', replace: true }

  if (needs === 'editor') {
    try {
      const { data: recipe } = await recipeApi.getById(to.params.id)
      if (!me.canEdit(recipe)) return { path: '/', replace: true }
    } catch {
      // Not found or a network error: let the edit view show its own state.
    }
  }
  return true
}

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(requireAccess)

export default router
