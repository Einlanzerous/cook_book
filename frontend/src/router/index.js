import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const routes = [
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
    component: () => import('../views/CreateRecipeView.vue')
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
    component: () => import('../views/EditRecipeView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
