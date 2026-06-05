import { createApp } from 'vue'
import ViewUIPlus from 'view-ui-plus'
import 'view-ui-plus/dist/styles/viewuiplus.css'
import './style.css'
import App from './App.vue'
import router from './router'

// 创建Vue应用实例
const app = createApp(App)

// 使用路由
app.use(router)
app.use(ViewUIPlus)

// 挂载应用
app.mount('#app')
