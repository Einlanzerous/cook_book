import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

export const recipeApi = {
  getAll(tag = null) {
    const params = tag ? { tag } : {}
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

export const importApi = {
  importHelloFresh(url) {
    return api.post('/import/hellofresh', { url })
  }
}

export default api
