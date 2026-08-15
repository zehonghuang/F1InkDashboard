import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AdminShell from '@/layouts/AdminShell.vue'
import DeviceDetailPage from '@/pages/DeviceDetailPage.vue'
import DevicesListPage from '@/pages/DevicesListPage.vue'
import HomePage from '@/pages/HomePage.vue'
import NewsDetailPage from '@/pages/NewsDetailPage.vue'
import NewsEditorPage from '@/pages/NewsEditorPage.vue'
import NewsListPage from '@/pages/NewsListPage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'
import SettingsPage from '@/pages/SettingsPage.vue'
import UserDetailPage from '@/pages/UserDetailPage.vue'
import UsersListPage from '@/pages/UsersListPage.vue'
import F1LiveTimingDemoPage from '@/pages/F1LiveTimingDemoPage.vue'
import MotorsportQualifyingDemoPage from '@/pages/MotorsportQualifyingDemoPage.vue'
import MotorsportLiveStandingsDemoPage from '@/pages/MotorsportLiveStandingsDemoPage.vue'
import ShopCategoriesPage from '@/pages/ShopCategoriesPage.vue'
import ShopProductsPage from '@/pages/ShopProductsPage.vue'

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
        path: 'news/:id/edit',
        name: 'news-edit',
        component: NewsEditorPage,
        meta: { title: '编辑文章' },
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
      {
        path: 'motorsport-live-demo',
        name: 'motorsport-live-demo',
        component: MotorsportLiveStandingsDemoPage,
        meta: { title: 'Live Standings Demo' },
      },
      {
        path: 'f1-live-timing-demo',
        name: 'f1-live-timing-demo',
        component: F1LiveTimingDemoPage,
        meta: { title: 'F1 Live Timing Demo' },
      },
      {
        path: 'shop/categories',
        name: 'shop-categories',
        component: ShopCategoriesPage,
        meta: { title: '微信小店 · 分类' },
      },
      {
        path: 'shop/products',
        name: 'shop-products',
        component: ShopProductsPage,
        meta: { title: '微信小店 · 商品' },
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
