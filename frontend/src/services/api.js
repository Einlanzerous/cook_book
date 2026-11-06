import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

export const recipeApi = {
  getAll(tag = null, sort = 'createdAt') {
    // "Recently added" order by default (COOK-6 sort=createdAt)
    const params = { sort }
    if (tag) params.tag = tag
    return api.get('/recipes', { params })
  },

  getById(id) {
    return api.get(`/recipes/${id}`)
  },

  create(recipe) {
    return api.post('/recipes', recipe)
  },

  update(id, recipe) {
    return api.put(`/recipes/${id}`, recipe)
  },

  delete(id) {
    return api.delete(`/recipes/${id}`)
  },

  // Random pick (COOK-12). Resolves to { recipe: <recipe|null>, matches }.
  // `exclude` is a list of ids not to return (never the same recipe twice in a row).
  random({ vegetarian = false, maxMinutes = null, exclude = [] } = {}) {
    const params = {}
    if (vegetarian) params.vegetarian = 1
    if (maxMinutes) params.maxMinutes = maxMinutes
    if (exclude.length) params.exclude = exclude.join(',')
    return api.get('/recipes/random', { params })
  },

  search(query) {
    return api.get('/search', { params: { q: query } })
  }
}

export const tagApi = {
  getAll() {
    return api.get('/tags')
  },

  getRecipes(tagName) {
    return api.get(`/tags/${encodeURIComponent(tagName)}/recipes`)
  }
}

export const contributorApi = {
  getAll() {
    return api.get('/contributors')
  },

  getById(id) {
    return api.get(`/contributors/${encodeURIComponent(id)}`)
  },

  create(contributor) {
    return api.post('/contributors', contributor)
  }
}

export const importApi = {
  importHelloFresh(url) {
    return api.post('/import/hellofresh', { url })
  },

  // Parse a HelloFresh page without saving it (COOK-10). Resolves to the recipe
  // in create shape; send it to recipeApi.create to confirm.
  previewHelloFresh(url) {
    return api.post('/import/hellofresh/preview', { url })
  }
}

export default api
