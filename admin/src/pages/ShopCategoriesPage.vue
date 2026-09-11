<script setup lang="ts">
import { fetchShopCategories, type ShopCategory } from '@/api/shop'
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const errorText = ref('')
const items = ref<ShopCategory[]>([])

function flattenCats(src: ShopCategory[], into: ShopCategory[] = []): ShopCategory[] {
  for (const c of src) {
    into.push(c)
    if (c.children && c.children.length) flattenCats(c.children, into)
  }
  return into
}

const flat = computed(() => flattenCats(items.value || []))

const columns = computed(() => [
  {
    title: '分类名称',
    key: 'name',
    minWidth: 260,
    render: (hh: typeof h, params: any) => {
      const it = params.row as ShopCategory
      const indent = Math.max(0, (it.level || 1) - 1) * 14
      return hh(
        'div',
        { class: 'flex items-center gap-2', style: { paddingLeft: indent + 'px' } },
        [
          it.icon_url
            ? hh('img', {
                src: it.icon_url,
                class: 'w-6 h-6 rounded object-cover bg-zinc-800 flex-shrink-0',
              })
            : null,
          hh('span', { class: 'text-zinc-100' }, it.name || '(未命名)'),
          hh('span', { class: 'text-xs text-zinc-500' }, `L${it.level || 1}`),
        ],
      )
    },
  },
  { title: '分类 ID', key: 'cat_id', width: 120 },
  { title: '父级 ID', key: 'f_id', width: 120 },
  { title: '排序', key: 'sort', width: 100 },
  { title: '类型', key: 'cat_type', width: 100 },
  {
    title: '操作',
    key: 'action',
    width: 200,
    render: (hh: typeof h, params: any) => {
      const it = params.row as ShopCategory
      return hh('div', { class: 'flex gap-2' }, [
        hh(
          'button',
          {
            class:
              'px-3 py-1 text-xs rounded bg-[#1a1a1a] hover:bg-[#2a2a2a] text-zinc-200 transition-colors',
            onClick: () =>
              router.push({ name: 'shop-products', query: { cat_id: String(it.cat_id) } }),
          },
          '查看分类商品',
        ),
      ])
    },
  },
])

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchShopCategories()
    items.value = res.categories || []
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <Card padding="0" class="overflow-hidden">
      <div class="flex items-stretch divide-x divide-zinc-800 border-b border-zinc-800">
        <button
          class="flex-1 px-4 py-3 text-sm transition-colors"
          :class="
            route.name === 'shop-products'
              ? 'bg-[#1a0a0a] text-[#E10600] border-b-2 border-b-[#E10600] -mb-px font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#131313]'
          "
          @click="router.push({ name: 'shop-products' })"
        >
          商品列表
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm transition-colors"
          :class="
            route.name === 'shop-selected'
              ? 'bg-[#1a0a0a] text-[#E10600] border-b-2 border-b-[#E10600] -mb-px font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#131313]'
          "
          @click="router.push({ name: 'shop-selected' })"
        >
          已指定商品
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm transition-colors"
          :class="
            route.name === 'shop-categories'
              ? 'bg-[#1a0a0a] text-[#E10600] border-b-2 border-b-[#E10600] -mb-px font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#131313]'
          "
          @click="router.push({ name: 'shop-categories' })"
        >
          分类管理
        </button>
      </div>
    </Card>

    <Card>
      <template #title>微信小店 · 商品分类</template>
      <div class="flex gap-2 items-center">
        <Button type="primary" :loading="loading" @click="load">刷新</Button>
      </div>
      <Alert v-if="errorText" type="error" show-icon class="mt-3">{{ errorText }}</Alert>
      <div class="mt-2 text-xs text-zinc-400">
        若服务端设置了 <code>WECHAT_SHOP_API_TOKEN</code>，请在「设置」页填入微信小店 Token。
      </div>
    </Card>

    <Card>
      <Table :loading="loading" :columns="columns" :data="flat" size="large" stripe />
    </Card>
  </div>
</template>
