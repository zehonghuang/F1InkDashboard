<script setup lang="ts">
import {
  fetchAdminShopSelected,
  removeAdminShopSelected,
  updateAdminShopSelectedWeight,
  type ShopSelectedProduct,
} from '@/api/shop'
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const errorText = ref('')
const removing = ref(false)
const updatingWeight = ref(false)

const items = ref<ShopSelectedProduct[]>([])
const total = ref(0)

const checkedIDs = reactive<Set<number>>(new Set())

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchAdminShopSelected()
    items.value = res.items || []
    total.value = res.total || 0
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function isChecked(id: number): boolean {
  return checkedIDs.has(id)
}
function toggleCheck(id: number) {
  if (checkedIDs.has(id)) {
    checkedIDs.delete(id)
  } else {
    checkedIDs.add(id)
  }
}
function toggleCheckAll() {
  const allChecked = items.value.every((it) => checkedIDs.has(it.id))
  if (allChecked) {
    for (const it of items.value) checkedIDs.delete(it.id)
  } else {
    for (const it of items.value) checkedIDs.add(it.id)
  }
}
const allChecked = computed(() => items.value.length > 0 && items.value.every((it) => checkedIDs.has(it.id)))
const someChecked = computed(() => items.value.some((it) => checkedIDs.has(it.id)))
const checkedCount = computed(() => checkedIDs.size)

async function handleRemoveSelected() {
  const ids = Array.from(checkedIDs)
  if (ids.length === 0) return
  removing.value = true
  errorText.value = ''
  try {
    const productIDs = items.value
      .filter((it) => checkedIDs.has(it.id))
      .map((it) => it.product_id)
    await removeAdminShopSelected(productIDs)
    for (const id of ids) checkedIDs.delete(id)
    await load()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '移除失败')
  } finally {
    removing.value = false
  }
}

async function handleRemoveOne(item: ShopSelectedProduct) {
  removing.value = true
  errorText.value = ''
  try {
    await removeAdminShopSelected([item.product_id])
    checkedIDs.delete(item.id)
    await load()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '移除失败')
  } finally {
    removing.value = false
  }
}

async function handleWeightChange(item: ShopSelectedProduct, raw: string) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  updatingWeight.value = true
  try {
    await updateAdminShopSelectedWeight(item.id, Math.trunc(n))
    await load()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '更新失败')
  } finally {
    updatingWeight.value = false
  }
}

async function moveWeight(item: ShopSelectedProduct, delta: number) {
  handleWeightChange(item, String(item.weight + delta))
}

function priceFenToYuan(fen: number | undefined | null): string {
  if (fen === undefined || fen === null) return '-'
  const n = Number(fen)
  if (!Number.isFinite(n)) return '-'
  return `¥${(n / 100).toFixed(2)}`
}

function statusLabel(s: number | undefined | null) {
  const n = Number(s)
  if (n === 5) return { label: '已上架', cls: 'text-green-400' }
  if ([1, 2, 3, 4].includes(n)) return { label: '待上架', cls: 'text-amber-400' }
  if ([6, 7, 12, 13, 14].includes(n)) return { label: '已下架', cls: 'text-zinc-500' }
  return { label: String(n), cls: 'text-zinc-400' }
}

const columns = computed(() => [
  {
    title: h(
      'div',
      { class: 'flex items-center gap-2' },
      [
        h(
          'input',
          {
            type: 'checkbox',
            checked: allChecked.value,
            indeterminate: someChecked.value && !allChecked.value,
            class: 'w-4 h-4 cursor-pointer accent-[#E10600]',
            onChange: () => toggleCheckAll(),
          },
          null,
        ),
        h('span', { class: 'text-xs text-zinc-400' }, `选 ${checkedCount.value}`),
      ],
    ),
    key: '_check',
    width: 70,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh('div', { class: 'flex items-center gap-2' }, [
        hh('input', {
          type: 'checkbox',
          checked: isChecked(it.id),
          class: 'w-4 h-4 cursor-pointer accent-[#E10600]',
          onChange: () => toggleCheck(it.id),
        }),
      ])
    },
  },
  {
    title: '权重',
    key: 'weight',
    width: 160,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh('div', { class: 'flex items-center gap-1' }, [
        hh(
          'button',
          {
            class:
              'w-6 h-6 rounded flex items-center justify-center text-zinc-300 bg-zinc-800 hover:bg-zinc-700 text-sm',
            onClick: () => moveWeight(it, -10),
            title: '-10',
          },
          '-',
        ),
        hh('input', {
          type: 'number',
          value: it.weight,
          class:
            'w-16 h-7 rounded px-2 text-sm text-center bg-zinc-900 text-zinc-100 border border-zinc-800 focus:outline-none focus:border-[#E10600]/50',
          onKeydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                const el = e.target as HTMLInputElement
                handleWeightChange(it, el.value)
              }
            },
          onBlur: (e: FocusEvent) => {
            const el = e.target as HTMLInputElement
            handleWeightChange(it, el.value)
          },
        }),
        hh(
          'button',
          {
            class:
              'w-6 h-6 rounded flex items-center justify-center text-zinc-300 bg-zinc-800 hover:bg-zinc-700 text-sm',
            onClick: () => moveWeight(it, 10),
            title: '+10',
          },
          '+',
        ),
      ])
    },
  },
  {
    title: '商品',
    key: 'product',
    minWidth: 340,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh('div', { class: 'flex gap-3 items-start' }, [
        it.head_img
          ? hh('img', {
              src: it.head_img,
              class:
                'w-16 h-16 rounded object-cover bg-zinc-800 flex-shrink-0 border border-zinc-800',
            })
          : hh('div', {
              class: 'w-16 h-16 rounded bg-zinc-800 flex-shrink-0 border border-zinc-800',
            }),
        hh('div', { class: 'min-w-0 flex-1' }, [
          hh('div', { class: 'text-sm font-medium text-zinc-100 truncate' }, it.title || '(无标题)'),
          it.sub_title
            ? hh('div', { class: 'text-xs text-zinc-400 mt-0.5 line-clamp-2' }, it.sub_title)
            : null,
          hh('div', { class: 'mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500' }, [
            hh('span', { class: 'font-mono' }, `pid=${it.product_id}`),
            it.spu_id ? hh('span', {}, `spu=${it.spu_id}`) : null,
          ]),
        ]),
      ])
    },
  },
  {
    title: '价格',
    key: 'price',
    width: 150,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh('div', {}, [
        hh('div', { class: 'text-sm text-red-500 font-semibold' }, priceFenToYuan(it.min_price)),
        it.market_price
          ? hh('div', { class: 'text-xs text-zinc-500 line-through' }, priceFenToYuan(it.market_price))
          : null,
      ])
    },
  },
  {
    title: '库存',
    key: 'stock',
    width: 90,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh(
        'span',
        { class: it.total_stock > 0 ? 'text-zinc-200' : 'text-red-400' },
        String(it.total_stock ?? '-'),
      )
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      const s = statusLabel(it.status)
      return hh('span', { class: `text-xs ${s.cls}` }, s.label)
    },
  },
  {
    title: 'AppID',
    key: 'app_id',
    width: 180,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh('span', { class: 'text-xs font-mono text-zinc-400' }, it.app_id || 'default')
    },
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
    render: (hh: typeof h, params: any) => {
      const it: ShopSelectedProduct = params.row
      return hh(
        'button',
        {
          class:
            'px-3 py-1 text-xs rounded transition-colors bg-[#2a0a0a] hover:bg-[#3a0a0a] text-red-400 border border-red-500/20',
          onClick: () => handleRemoveOne(it),
        },
        '移除',
      )
    },
  },
])

const tableRows = computed(() =>
  items.value.map((it) => ({ ...it, _key: it.id })),
)
</script>

<template>
  <div class="space-y-4">
    <Card>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-sm text-zinc-500">微信小店 · 子页面</div>
          <div class="text-lg font-semibold text-zinc-100 mt-0.5 flex items-center gap-3">
            <span>已指定商品</span>
            <span class="text-xs font-normal text-zinc-500">共 {{ total }} 个商品</span>
          </div>
          <div class="text-xs text-zinc-500 mt-1">
            这些商品将在小程序中按权重排序展示（权重越大越靠前）
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Button
            type="error"
            :loading="removing"
            :disabled="checkedCount === 0"
            @click="handleRemoveSelected"
          >
            移除选中 ({{ checkedCount }})
          </Button>
          <Button type="default" @click="router.push({ name: 'shop-products' })">
            返回商品列表
          </Button>
          <Button type="primary" :loading="loading || updatingWeight" @click="load">
            刷新
          </Button>
        </div>
      </div>
    </Card>

    <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>

    <Card padding="0" class="overflow-hidden">
      <div class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div class="text-sm text-zinc-200">已指定商品列表</div>
        <div v-if="updatingWeight" class="text-xs text-zinc-500">权重更新中...</div>
      </div>
      <Table
        :loading="loading"
        :columns="columns"
        :data="tableRows"
        stripe
        size="large"
        :row-key="_key => _key"
        bordered="false"
        :show-header="true"
      >
        <template #empty>
          <div class="py-20 text-center">
            <div class="text-sm text-zinc-400">暂无已指定商品</div>
            <div class="text-xs text-zinc-500 mt-2">
              前往
              <a
                class="text-[#E10600] underline underline-offset-2 cursor-pointer"
                @click="router.push({ name: 'shop-products' })"
              >商品列表</a
              >
              选择商品添加
            </div>
          </div>
        </template>
      </Table>
    </Card>
  </div>
</template>
