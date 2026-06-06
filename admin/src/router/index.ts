import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AdminShell from '@/layouts/AdminShell.vue'
import DeviceDetailPage from '@/pages/DeviceDetailPage.vue'
import DevicesListPage from '@/pages/DevicesListPage.vue'
import HomePage from '@/pages/HomePage.vue'
import NewsDetailPage from '@/pages/NewsDetailPage.vue'
import NewsListPage from '@/pages/NewsListPage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'
import SettingsPage from '@/pages/SettingsPage.vue'
import UserDetailPage from '@/pages/UserDetailPage.vue'
import UsersListPage from '@/pages/UsersListPage.vue'
import MotorsportQualifyingDemoPage from '@/pages/MotorsportQualifyingDemoPage.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AdminShell,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: HomePage,
        meta: { title: '概览' },
      },
      {
        path: 'news',
        name: 'news-list',
        component: NewsListPage,
        meta: { title: '新闻' },
      },
      {
        path: 'news/:id',
        name: 'news-detail',
        component: NewsDetailPage,
        meta: { title: '新闻预览' },
      },
      {
        path: 'devices',
        name: 'devices-list',
        component: DevicesListPage,
        meta: { title: '设备' },
      },
      {
        path: 'devices/:device_id',
        name: 'devices-detail',
        component: DeviceDetailPage,
        meta: { title: '设备详情' },
      },
      {
        path: 'users',
        name: 'users-list',
        component: UsersListPage,
        meta: { title: '用户' },
      },
      {
        path: 'users/:user_id',
        name: 'users-detail',
        component: UserDetailPage,
        meta: { title: '用户详情' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: SettingsPage,
        meta: { title: '设置' },
      },
      {
        path: 'motorsport-demo',
        name: 'motorsport-demo',
        component: MotorsportQualifyingDemoPage,
        meta: { title: '样式 Demo' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
