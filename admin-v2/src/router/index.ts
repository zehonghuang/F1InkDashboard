import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AdminShell from '@/layouts/AdminShell.vue'
import HomePage from '@/pages/HomePage.vue'
import NewsListPage from '@/pages/NewsListPage.vue'
import NewsEditorPage from '@/pages/NewsEditorPage.vue'
import NewsDetailPage from '@/pages/NewsDetailPage.vue'
import DevicesListPage from '@/pages/DevicesListPage.vue'
import DeviceDetailPage from '@/pages/DeviceDetailPage.vue'
import UsersListPage from '@/pages/UsersListPage.vue'
import UserDetailPage from '@/pages/UserDetailPage.vue'
import SettingsPage from '@/pages/SettingsPage.vue'
import F1LiveTimingDemoPage from '@/pages/F1LiveTimingDemoPage.vue'
import MotorsportQualifyingDemoPage from '@/pages/MotorsportQualifyingDemoPage.vue'
import MotorsportLiveStandingsDemoPage from '@/pages/MotorsportLiveStandingsDemoPage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AdminShell,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: HomePage,
        meta: { title: '概览', viewKey: 'dashboard' },
      },
      {
        path: 'news',
        name: 'news-list',
        component: NewsListPage,
        meta: { title: '新闻', viewKey: 'news' },
      },
      {
        path: 'news/:id/edit',
        name: 'news-edit',
        component: NewsEditorPage,
        meta: { title: '编辑文章', viewKey: 'news' },
      },
      {
        path: 'news/:id',
        name: 'news-detail',
        component: NewsDetailPage,
        meta: { title: '新闻预览', viewKey: 'news' },
      },
      {
        path: 'devices',
        name: 'devices-list',
        component: DevicesListPage,
        meta: { title: '设备', viewKey: 'devices' },
      },
      {
        path: 'devices/:device_id',
        name: 'devices-detail',
        component: DeviceDetailPage,
        meta: { title: '设备详情', viewKey: 'devices' },
      },
      {
        path: 'users',
        name: 'users-list',
        component: UsersListPage,
        meta: { title: '用户', viewKey: 'users' },
      },
      {
        path: 'users/:user_id',
        name: 'users-detail',
        component: UserDetailPage,
        meta: { title: '用户详情', viewKey: 'users' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: SettingsPage,
        meta: { title: '设置', viewKey: 'settings' },
      },
      {
        path: 'motorsport-demo',
        name: 'motorsport-demo',
        component: MotorsportQualifyingDemoPage,
        meta: { title: '样式 Demo', viewKey: 'live', liveTab: 'standings' },
      },
      {
        path: 'motorsport-live-demo',
        name: 'motorsport-live-demo',
        component: MotorsportLiveStandingsDemoPage,
        meta: { title: 'Live Standings Demo', viewKey: 'live', liveTab: 'standings' },
      },
      {
        path: 'f1-live-timing-demo',
        name: 'f1-live-timing-demo',
        component: F1LiveTimingDemoPage,
        meta: { title: 'F1 Live Timing Demo', viewKey: 'live', liveTab: 'f1' },
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
