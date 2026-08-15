<script setup lang="ts">
import {
  fetchShopCategories,
  fetchShopCategoryProductIDs,
  fetchShopAllProductIDs,
  fetchShopProductDetail,
  type ShopCategory,
  type ShopProductDetail,
} from '@/api/shop'
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const errorText = ref('')
const catLoading = ref(false)

const categories = ref<ShopCategory[]>([])
type SelectedScope = { kind: 'all' } | { kind: 'l1'; cat_id: number } | { kind: 'l2'; cat_id: number }
const selected = ref<SelectedScope>({ kind: 'all' })
const expandedL1 = reactive<Record<number, boolean>>({})

const productIDs = ref<string[]>([])
const details = reactive<Record<string, ShopProductDetail | null>>({})
const detailLoading = reactive<Record<string, boolean>>({})
const detailError = reactive<Record<string, string>>({})
const expandedRows = reactive<Record<string, boolean>>({})

function isSelectedAll(): boolean {
  return selected.value.kind === 'all'
}
function selectedCatID(): number | null {
  return selected.value.kind === 'all' ? null : selected.value.cat_id
}

function setSelectedL1(cat: ShopCategory) {
  selected.value = { kind: 'l1', cat_id: cat.cat_id }
}
function setSelectedL2(cat: ShopCategory) {
  selected.value = { kind: 'l2', cat_id: cat.cat_id }
}
function setSelectedAll() {
  selected.value = { kind: 'all' }
}

function isL1Active(cat: ShopCategory): boolean {
  const s = selected.value
  if (s.kind === 'l1' && s.cat_id === cat.cat_id) return true
  if (s.kind === 'l2' && cat.children?.some((c) => c.cat_id === s.cat_id)) return true
  return false
}
function isL2Active(cat: ShopCategory): boolean {
  return selected.value.kind === 'l2' && selected.value.cat_id === cat.cat_id
}

function toggleL1(cat: ShopCategory) {
  expandedL1[cat.cat_id] = !expandedL1[cat.cat_id]
}

async function loadCategories() {
  catLoading.value = true
  errorText.value = ''
  try {
    const res = await fetchShopCategories()
    categories.value = res.categories || []
    for (const c of categories.value) {
      if ((c.children?.length ?? 0) > 0) {
        expandedL1[c.cat_id] = true
      }
    }
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载分类失败')
  } finally {
    catLoading.value = false
  }
}

async function loadProductIDs() {
  loading.value = true
  errorText.value = ''
  try {
    if (isSelectedAll()) {
      const r = await fetchShopAllProductIDs(5)
      productIDs.value = r.product_ids || []
    } else {
      const r = await fetchShopCategoryProductIDs(selectedCatID()!)
      productIDs.value = r.product_ids || []
    }
    for (const k of Object.keys(details)) delete details[k]
    for (const k of Object.keys(detailLoading)) delete detailLoading[k]
    for (const k of Object.keys(detailError)) delete detailError[k]
    for (const k of Object.keys(expandedRows)) delete expandedRows[k]
    const eager = productIDs.value.slice(0, 12)
    await Promise.all(eager.map((id) => loadDetail(id, false)))
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载商品列表失败')
  } finally {
    loading.value = false
  }
}

async function loadDetail(id: string, showLoading = true) {
  if (details[id] !== undefined || detailLoading[id]) return
  detailLoading[id] = showLoading
  detailError[id] = ''
  try {
    const r = await fetchShopProductDetail(id)
    details[id] = r.product || null
  } catch (e: any) {
    detailError[id] = String(e?.message || e || '加载失败')
  } finally {
    detailLoading[id] = false
  }
}

function toggleExpand(id: string) {
  expandedRows[id] = !expandedRows[id]
  if (expandedRows[id]) loadDetail(id, true)
}

function priceFenToYuan(fen: number | undefined | null): string {
  if (fen === undefined || fen === null) return '-'
  const n = Number(fen)
  if (!Number.isFinite(n)) return '-'
  return `¥${(n / 100).toFixed(2)}`
}

const scopeTitle = computed(() => {
  if (selected.value.kind === 'all') return '全部商品'
  const sid = selected.value.cat_id
  for (const c of categories.value) {
    if (c.cat_id === sid) return c.name
    if (c.children) {
      const f = c.children.find((x) => x.cat_id === sid)
      if (f) return `${c.name} · ${f.name}`
    }
  }
  return `分类 #${sid}`
})

const columns = computed(() => [
  {
    title: '商品 ID',
    key: 'id',
    minWidth: 200,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const detail = details[id]
      return hh('div', { class: 'flex items-center gap-2' }, [
        hh(
          'span',
          { class: 'font-mono text-xs text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded' },
          id,
        ),
        detail?.spu_id
          ? hh('span', { class: 'text-xs text-zinc-500' }, `spu=${detail.spu_id}`)
          : null,
      ])
    },
  },
  {
    title: '商品',
    key: 'title',
    minWidth: 320,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const detail = details[id]
      const err = detailError[id]
      const loading2 = detailLoading[id]
      if (loading2) return hh('div', { class: 'text-xs text-zinc-500' }, '加载中...')
      if (err) return hh('div', { class: 'text-xs text-red-400' }, err)
      if (!detail) return hh('div', { class: 'text-xs text-zinc-500' }, '-')
      const cover = (detail.head_img && detail.head_img[0]) || ''
      return hh('div', { class: 'flex gap-3 items-start' }, [
        cover
          ? hh('img', {
              src: cover,
              class:
                'w-16 h-16 rounded object-cover bg-zinc-800 flex-shrink-0 border border-zinc-800',
            })
          : null,
        hh('div', { class: 'min-w-0 flex-1' }, [
          hh('div', { class: 'text-sm font-medium text-zinc-100 truncate' }, detail.title || '(无标题)'),
          detail.sub_title
            ? hh('div', { class: 'text-xs text-zinc-400 mt-0.5 line-clamp-2' }, detail.sub_title)
            : null,
        ]),
      ])
    },
  },
  {
    title: '价格',
    key: 'price',
    width: 160,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const d = details[id]
      if (!d) return hh('span', { class: 'text-zinc-500 text-xs' }, '-')
      return hh('div', {}, [
        hh('div', { class: 'text-sm text-red-500 font-semibold' }, priceFenToYuan(d.min_price)),
        d.market_price
          ? hh('div', { class: 'text-xs text-zinc-500 line-through' }, priceFenToYuan(d.market_price))
          : null,
      ])
    },
  },
  {
    title: '库存',
    key: 'stock',
    width: 100,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const d = details[id]
      if (!d) return hh('span', { class: 'text-zinc-500 text-xs' }, '-')
      return hh(
        'span',
        { class: d.total_stock > 0 ? 'text-zinc-200' : 'text-red-400' },
        String(d.total_stock ?? '-'),
      )
    },
  },
  {
    title: 'SKU',
    key: 'sku',
    width: 100,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const d = details[id]
      if (!d) return hh('span', { class: 'text-zinc-500 text-xs' }, '-')
      return hh('span', { class: 'text-zinc-200' }, String(d.skus?.length || 0))
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const d = details[id]
      if (!d) return hh('span', { class: 'text-zinc-500 text-xs' }, '-')
      const s = Number(d.status)
      let label = String(s)
      let cls = 'text-zinc-400'
      if (s === 5) {
        label = '已上架'
        cls = 'text-green-400'
      } else if (s === 1 || s === 2 || s === 3 || s === 4) {
        label = '待上架'
        cls = 'text-amber-400'
      } else if (s === 6 || s === 7 || s === 12 || s === 13 || s === 14) {
        label = '已下架'
        cls = 'text-zinc-500'
      }
      return hh('span', { class: `text-xs ${cls}` }, label)
    },
  },
  {
    title: '操作',
    key: 'action',
    width: 140,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const expanded = !!expandedRows[id]
      return hh(
        'button',
        {
          class:
            'px-3 py-1 text-xs rounded transition-colors ' +
            (expanded
              ? 'bg-[#E10600] hover:bg-[#c60700] text-white'
              : 'bg-[#1a1a1a] hover:bg-[#2a2a2a] text-zinc-200'),
          onClick: () => toggleExpand(id),
        },
        expanded ? '收起详情' : '查看详情',
      )
    },
  },
])

const tableRows = computed(() =>
  productIDs.value.map((id) => ({
    _key: id,
    id,
  })),
)

function rowExpandRender(hh: typeof h, params: any) {
  const id = String((params.row && params.row.id) || '')
  const d = details[id]
  const err = detailError[id]
  const loading2 = detailLoading[id]
  if (loading2) return hh('div', { class: 'px-4 py-6 text-sm text-zinc-500' }, '商品详情加载中...')
  if (err) return hh('div', { class: 'px-4 py-6 text-sm text-red-400' }, `加载失败：${err}`)
  if (!d) return hh('div', { class: 'px-4 py-6 text-sm text-zinc-500' }, '暂无详情')
  return hh('div', { class: 'px-4 py-5 space-y-5 bg-[#0d0d0d]' }, [
    hh('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4' }, [
      hh('div', { class: 'space-y-1' }, [
        hh('div', { class: 'text-xs text-zinc-500' }, 'SPU ID'),
        hh('div', { class: 'text-sm font-mono text-zinc-200' }, d.spu_id || '-'),
      ]),
      hh('div', { class: 'space-y-1' }, [
        hh('div', { class: 'text-xs text-zinc-500' }, '外部商品 ID'),
        hh('div', { class: 'text-sm font-mono text-zinc-200' }, d.out_product_id || '-'),
      ]),
      hh('div', { class: 'space-y-1' }, [
        hh('div', { class: 'text-xs text-zinc-500' }, '分类 / 品牌'),
        hh('div', { class: 'text-sm text-zinc-200' }, `cate=${d.cate_id || '-'} / brand=${d.brand_id || '-'}`),
      ]),
    ]),
    hh('div', { class: 'space-y-2' }, [
      hh('div', { class: 'text-xs text-zinc-500' }, '主图'),
      d.head_img && d.head_img.length
        ? hh(
            'div',
            { class: 'flex flex-wrap gap-2' },
            d.head_img.map((src) =>
              hh('img', {
                src,
                class: 'w-20 h-20 rounded object-cover bg-zinc-800 border border-zinc-800',
              }),
            ),
          )
        : hh('div', { class: 'text-sm text-zinc-500' }, '无'),
    ]),
    (d.desc_info?.imgs?.length ?? 0) > 0
      ? hh('div', { class: 'space-y-2' }, [
          hh('div', { class: 'text-xs text-zinc-500' }, '详情图'),
          hh(
            'div',
            { class: 'space-y-2' },
            (d.desc_info?.imgs || []).map((src) =>
              hh('img', { src, class: 'max-w-full rounded border border-zinc-800' }),
            ),
          ),
        ])
      : null,
    (d.skus?.length ?? 0) > 0
      ? hh('div', { class: 'space-y-2' }, [
          hh('div', { class: 'text-xs text-zinc-500' }, 'SKU 列表'),
          hh(
            'div',
            { class: 'overflow-hidden rounded border border-zinc-800 divide-y divide-zinc-800' },
            d.skus!.map((s) =>
              hh('div', { class: 'grid grid-cols-12 gap-2 p-3 items-center text-sm' }, [
                s.thumb_img
                  ? hh('img', {
                      src: s.thumb_img,
                      class: 'col-span-1 w-10 h-10 rounded object-cover bg-zinc-800',
                    })
                  : hh('div', { class: 'col-span-1' }),
                hh(
                  'div',
                  { class: 'col-span-4 text-zinc-200 text-xs font-mono truncate' },
                  `${s.out_sku_id || s.sku_id}${s.sku_code ? ` · ${s.sku_code}` : ''}`,
                ),
                hh(
                  'div',
                  { class: 'col-span-4 text-zinc-300 text-xs' },
                  (s.sku_attrs || []).map((a) => `${a.name}:${a.value}`).join(' / ') || '-',
                ),
                hh('div', { class: 'col-span-1 text-red-500 text-xs text-right' }, priceFenToYuan(s.sale_price)),
                hh(
                  'div',
                  {
                    class:
                      'col-span-2 text-right text-xs ' +
                      (s.stock_num > 0 ? 'text-zinc-200' : 'text-red-400'),
                  },
                  `库存 ${s.stock_num ?? 0}`,
                ),
              ]),
            ),
          ),
        ])
      : null,
  ])
}

function pushRouterFromSelected() {
  const sid = selectedCatID()
  if (!sid) {
    router.replace({ name: 'shop-products', query: {} })
  } else {
    router.replace({ name: 'shop-products', query: { cat_id: String(sid) } })
  }
}

function syncFromQuery() {
  const fromQ = route.query?.cat_id
  if (fromQ === undefined) {
    selected.value = { kind: 'all' }
    return
  }
  const n = Number(String(fromQ))
  if (!Number.isFinite(n) || n <= 0) {
    selected.value = { kind: 'all' }
    return
  }
  for (const c of categories.value) {
    if (c.cat_id === n) {
      selected.value = { kind: 'l1', cat_id: n }
      expandedL1[n] = true
      return
    }
    if (c.children) {
      const f = c.children.find((x) => x.cat_id === n)
      if (f) {
        selected.value = { kind: 'l2', cat_id: n }
        expandedL1[c.cat_id] = true
        return
      }
    }
  }
  selected.value = { kind: 'l2', cat_id: n }
}

watch(selected, () => {
  pushRouterFromSelected()
  loadProductIDs()
})

onMounted(async () => {
  syncFromQuery()
  await loadCategories()
  syncFromQuery()
  await loadProductIDs()
})

watch(
  () => [route.query?.cat_id],
  () => {
    const prev = selectedCatID()
    syncFromQuery()
    if (prev !== selectedCatID()) {
      loadProductIDs()
    }
  },
)
</script>

<template>
  <div class="space-y-4">
    <Card>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-sm text-zinc-500">微信小店</div>
          <div class="text-lg font-semibold text-zinc-100 mt-0.5 flex items-center gap-3">
            <span>{{ scopeTitle }}</span>
            <span class="text-xs font-normal text-zinc-500">共 {{ productIDs.length }} 个商品</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button type="primary" :loading="loading" @click="loadProductIDs">刷新</Button>
          <Button type="default" @click="router.push({ name: 'shop-categories' })">分类管理</Button>
        </div>
      </div>
    </Card>

    <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>

    <div class="grid grid-cols-[320px_1fr] gap-4 items-start">
      <Card padding="0" class="overflow-hidden">
        <div class="flex flex-col max-h-[calc(100vh-260px)] overflow-auto">
          <div
            class="group px-4 py-3 flex items-center gap-2 cursor-pointer border-b border-zinc-800 transition-colors"
            :class="isSelectedAll() ? 'bg-[#1a0a0a] border-l-[3px] border-l-[#E10600]' : 'hover:bg-[#121212]'"
            @click="setSelectedAll"
          >
            <div
              class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 text-xs font-semibold"
              :class="isSelectedAll() ? 'bg-[#E10600] text-white' : 'bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700'"
            >ALL</div>
            <div class="min-w-0 flex-1">
              <div class="text-sm text-zinc-100">全部商品</div>
              <div class="text-[11px] text-zinc-500 mt-0.5">店铺内所有已上架商品</div>
            </div>
          </div>

          <div v-if="catLoading" class="px-4 py-6 text-sm text-zinc-500">加载分类中...</div>
          <template v-else>
            <template v-for="l1 in categories" :key="l1.cat_id">
              <div
                class="group flex items-start gap-0 border-b border-zinc-900"
                :class="isL1Active(l1) ? 'bg-[#131313]' : ''"
              >
                <div
                  class="px-4 py-3 flex-1 flex items-start gap-2 cursor-pointer transition-colors"
                  :class="
                    selected.kind === 'l1' && selected.cat_id === l1.cat_id
                      ? 'bg-[#1a0a0a] border-l-[3px] border-l-[#E10600] -ml-[3px]'
                      : 'hover:bg-[#121212] border-l-[3px] border-l-transparent -ml-[3px]'
                  "
                  @click="setSelectedL1(l1)"
                >
                  <div class="w-9 h-9 rounded flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-800">
                    <img
                      v-if="l1.icon_url"
                      :src="l1.icon_url"
                      class="w-full h-full object-cover"
                      @error="($event.target as HTMLImageElement).remove()"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-zinc-100 flex items-center gap-2">
                      <span class="truncate">{{ l1.name }}</span>
                      <span v-if="l1.children && l1.children.length" class="text-[10px] text-zinc-500 font-mono">
                        {{ l1.children.length }}
                      </span>
                    </div>
                    <div class="text-[11px] text-zinc-500 mt-0.5">ID {{ l1.cat_id }}</div>
                  </div>
                </div>
                <button
                  v-if="l1.children && l1.children.length"
                  type="button"
                  class="w-9 h-9 shrink-0 mr-1 my-1 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  :title="expandedL1[l1.cat_id] ? '收起子分类' : '展开子分类'"
                  @click.stop="toggleL1(l1)"
                >
                  <svg
                    class="w-3.5 h-3.5 transition-transform"
                    :style="{ transform: expandedL1[l1.cat_id] ? 'rotate(180deg)' : '' }"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <template v-if="l1.children && l1.children.length && expandedL1[l1.cat_id]">
                <div
                  v-for="l2 in l1.children"
                  :key="l2.cat_id"
                  class="group flex items-center gap-2 px-4 py-2.5 pl-15 border-b border-zinc-900 cursor-pointer transition-colors"
                  :style="{ paddingLeft: '60px' }"
                  :class="
                    isL2Active(l2)
                      ? 'bg-[#1a0a0a] border-l-[3px] border-l-[#E10600] -ml-[3px]'
                      : 'hover:bg-[#121212] border-l-[3px] border-l-transparent -ml-[3px]'
                  "
                  @click="setSelectedL2(l2)"
                >
                  <div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-800">
                    <img
                      v-if="l2.icon_url"
                      :src="l2.icon_url"
                      class="w-full h-full object-cover"
                      @error="($event.target as HTMLImageElement).remove()"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm text-zinc-200 truncate">{{ l2.name }}</div>
                    <div class="text-[11px] text-zinc-500 mt-0.5">ID {{ l2.cat_id }}</div>
                  </div>
                </div>
              </template>
            </template>
            <div v-if="categories.length === 0" class="px-4 py-6 text-sm text-zinc-500">
              暂无运营分类，请在微信小店后台「店铺主页 - 商品分类」中创建。
            </div>
          </template>
        </div>
      </Card>

      <Card padding="0" class="overflow-hidden">
        <div class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div class="text-sm text-zinc-200">商品列表 · {{ scopeTitle }}</div>
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
          <template #expandedRowRender="params">
            <component :is="{ render: () => rowExpandRender(h, params) }" />
          </template>
        </Table>
      </Card>
    </div>
  </div>
</template>
