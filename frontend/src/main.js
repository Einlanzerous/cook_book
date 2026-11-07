import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { appName } from './config'
import './style.css'

document.title = appName

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
