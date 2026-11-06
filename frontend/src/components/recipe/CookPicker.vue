<script setup>
/**
 * "Filed as" cook picker. A STOPGAP: until COOK-23 derives the current cook
 * from the Access JWT, the person adding a recipe says who they are. When
 * COOK-23 lands, replace this one component (or drop it and send no
 * contributorId); nothing else in the add/edit flow knows how the cook is chosen.
 */
import { ref, onMounted } from 'vue'
import { contributorApi } from '../../services/api'

const DEFAULT_COOK = 'magos'
const NEW = '__new__'

const props = defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: 'cook-picker' },
  error: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const cooks = ref([])
const loadError = ref('')
const adding = ref(false)
const newName = ref('')
const addError = ref('')
const saving = ref(false)

async function load() {
  try {
    const { data } = await contributorApi.getAll()
    cooks.value = data
    loadError.value = ''
    if (!props.modelValue) {
      const fallback = data.find((c) => c.name.toLowerCase() === DEFAULT_COOK)
      if (fallback) emit('update:modelValue', fallback.id)
    }
  } catch {
    loadError.value = 'Could not load the list of cooks.'
  }
}

onMounted(load)

function onChange(e) {
  if (e.target.value === NEW) {
    adding.value = true
    addError.value = ''
    // Keep showing the current cook until the new one exists.
    e.target.value = props.modelValue
    return
  }
  emit('update:modelValue', e.target.value)
}

function cancelAdd() {
  adding.value = false
  newName.value = ''
  addError.value = ''
}

async function addCook() {
  const name = newName.value.trim()
  if (!name) {
    addError.value = 'Enter a name.'
    return
  }
  saving.value = true
  addError.value = ''
  try {
    const { data } = await contributorApi.create({ name })
    cooks.value = [...cooks.value, data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    emit('update:modelValue', data.id)
    cancelAdd()
  } catch (e) {
    if (e.response?.status === 409) {
      // Someone with that name is already in the book: offer them.
      await load()
      const existing = cooks.value.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (existing) emit('update:modelValue', existing.id)
      addError.value = existing
        ? `${existing.name} is already in the book, so they are selected.`
        : 'A cook with that name already exists.'
      if (existing) {
        adding.value = false
        newName.value = ''
      }
    } else {
      addError.value = e.response?.data?.error || 'Could not add that cook.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <label :for="id" class="label">Filed as</label>
    <select :id="id" class="input" :value="modelValue" @change="onChange" :aria-invalid="!!error">
      <option v-if="!cooks.length" value="" disabled>Loading cooks…</option>
      <option v-for="c in cooks" :key="c.id" :value="c.id">{{ c.name }}</option>
      <option :value="NEW">+ Add a new cook…</option>
    </select>
    <p v-if="loadError" class="text-sm text-danger">{{ loadError }}</p>
    <p v-else-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>

    <div v-if="adding" class="mt-1 flex flex-wrap items-end gap-3" data-test="new-cook">
      <div class="min-w-[180px] flex-1">
        <label :for="`${id}-name`" class="label">New cook's name</label>
        <input
          :id="`${id}-name`"
          v-model="newName"
          type="text"
          class="input"
          placeholder="Mara Okafor"
          @keydown.enter.prevent="addCook"
        />
      </div>
      <button type="button" class="btn btn-primary" :disabled="saving" @click="addCook">
        {{ saving ? 'Adding…' : 'Add cook' }}
      </button>
      <button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelAdd">Cancel</button>
    </div>
    <p v-if="addError" class="text-sm" :class="adding ? 'text-danger' : 'text-muted'" role="alert">{{ addError }}</p>
  </div>
</template>
