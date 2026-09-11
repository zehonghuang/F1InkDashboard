<script setup lang="ts">
import {
  fetchShopCategories,
  fetchShopCategoryProductIDs,
  fetchShopAllProductIDs,
  fetchShopProductDetail,
  addAdminShopSelected,
  fetchAdminShopSelected,
  type ShopCategory,
  type ShopProductDetail,
  type ShopSelectedProduct,
} from '@/api/shop'
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from 'view-ui-plus'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const errorText = ref('')
const catLoading = ref(false)
const addingSelected = ref(false)
const categories = ref<ShopCategory[]>([])
const expandedL1 = reactive<Record<number, boolean>>({})
const categoryIconError = reactive<Set<number>>(new Set())
const catLoaded = ref(false)

type SelectedScope = { kind: 'all' } | { kind: 'l1'; cat_id: number } | { kind: 'l2'; cat_id: number }

function parseCatIdFromQuery(): number | null {
  const q = route.query?.cat_id
  if (q === undefined || q === null || q === '') return null
  const n = Number(String(q))
  return Number.isFinite(n) && n > 0 ? n : null
}

function scopeFromQuery(cats: ShopCategory[], qid: number | null): SelectedScope {
  if (qid === null) return { kind: 'all' }
  for (const c of cats) {
    if (c.cat_id === qid) return { kind: 'l1', cat_id: qid }
    if (c.children) {
      const f = c.children.find((x) => x.cat_id === qid)
      if (f) return { kind: 'l2', cat_id: qid }
    }
  }
  return { kind: 'l2', cat_id: qid }
}

const selected = computed<SelectedScope>(() => scopeFromQuery(categories.value, parseCatIdFromQuery()))

function applyScopeToRouter(scope: SelectedScope) {
  const qid = parseCatIdFromQuery()
  const sid = scope.kind === 'all' ? null : scope.cat_id
  if (sid === qid) return
  if (sid === null) {
    router.replace({ name: 'shop-products', query: {} })
  } else {
    router.replace({ name: 'shop-products', query: { cat_id: String(sid) } })
  }
}

function setSelectedAll() {
  applyScopeToRouter({ kind: 'all' })
}
function setSelectedL1(cat: ShopCategory) {
  expandedL1[cat.cat_id] = true
  applyScopeToRouter({ kind: 'l1', cat_id: cat.cat_id })
}
function setSelectedL2(cat: ShopCategory) {
  const parent = categories.value.find((c) => c.children?.some((x) => x.cat_id === cat.cat_id))
  if (parent) expandedL1[parent.cat_id] = true
  applyScopeToRouter({ kind: 'l2', cat_id: cat.cat_id })
}

function isSelectedAll(): boolean {
  return selected.value.kind === 'all'
}
function selectedCatID(): number | null {
  return selected.value.kind === 'all' ? null : selected.value.cat_id
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

function ensureExpandedFromQuery(qid: number | null, cats: ShopCategory[]) {
  if (qid === null) return
  for (const c of cats) {
    if (c.cat_id === qid) {
      expandedL1[c.cat_id] = true
      return
    }
    if (c.children) {
      const f = c.children.find((x) => x.cat_id === qid)
      if (f) {
        expandedL1[c.cat_id] = true
        return
      }
    }
  }
}

const productIDs = ref<string[]>([])
const details = reactive<Record<string, ShopProductDetail | null>>({})
const detailLoading = reactive<Record<string, boolean>>({})
const detailError = reactive<Record<string, string>>({})
const expandedRows = reactive<Record<string, boolean>>({})
const checkedIDs = reactive<Set<string>>(new Set())
const selectedProducts = ref<ShopSelectedProduct[]>([])

const selectedProductIDSet = computed(() => {
  const s = new Set<string>()
  for (const p of selectedProducts.value) s.add(p.product_id)
  return s
})

const scopeTitle = computed(() => {
  const s = selected.value
  if (s.kind === 'all') return '全部商品'
  const cid = s.cat_id
  for (const c of categories.value) {
    if (s.kind === 'l1' && c.cat_id === cid) return c.name
    if (c.children) {
      const f = c.children.find((x) => x.cat_id === cid)
      if (f) return `${c.name} / ${f.name}`
    }
  }
  return s.kind === 'l1' ? `L1#${cid}` : `L2#${cid}`
})

function isChecked(id: string): boolean {
  return checkedIDs.has(id)
}
function toggleSelect(id: string) {
  if (checkedIDs.has(id)) checkedIDs.delete(id)
  else checkedIDs.add(id)
}
function toggleSelectAll() {
  const all = productIDs.value.every((id) => checkedIDs.has(id))
  if (all) {
    for (const id of productIDs.value) checkedIDs.delete(id)
  } else {
    for (const id of productIDs.value) checkedIDs.add(id)
  }
}
const allChecked = computed(() => productIDs.value.length > 0 && productIDs.value.every((id) => checkedIDs.has(id)))
const someChecked = computed(() => productIDs.value.some((id) => checkedIDs.has(id)))
const checkedCount = computed(() => checkedIDs.size)

async function handleAddSelected() {
  const ids = Array.from(checkedIDs)
  if (ids.length === 0) return
  addingSelected.value = true
  errorText.value = ''
  try {
    const res = await addAdminShopSelected(ids)
    for (const id of ids) checkedIDs.delete(id)
    if (res.items) selectedProducts.value = res.items
    Message.success(`已入库 ${ids.length} 个商品`)
    await loadSelectedProducts()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '保存失败')
  } finally {
    addingSelected.value = false
  }
}

async function loadSelectedProducts() {
  try {
    const res = await fetchAdminShopSelected()
    selectedProducts.value = res.items || []
  } catch {
    // ignore
  }
}

async function loadCategories() {
  catLoading.value = true
  try {
    const res = await fetchShopCategories()
    categories.value = res.categories || []
    catLoaded.value = true
    ensureExpandedFromQuery(parseCatIdFromQuery(), categories.value)
  } catch (e: any) {
    errorText.value = String(e?.message || e || '分类加载失败')
  } finally {
    catLoading.value = false
  }
}

async function loadProductIDs() {
  loading.value = true
  errorText.value = ''
  try {
    const sid = selectedCatID()
    let ids: string[] = []
    if (sid === null) {
      const r = await fetchShopAllProductIDs(5)
      ids = r.product_ids || []
    } else {
      const r = await fetchShopCategoryProductIDs(sid)
      ids = r.product_ids || []
    }
    const existing = new Set(productIDs.value)
    const fresh = new Set(ids)
    for (const id of productIDs.value) if (!fresh.has(id)) delete details[id]
    productIDs.value = ids
    for (const id of ids) {
      if (!existing.has(id) && !details[id] && !detailLoading[id]) {
        detailLoading[id] = true
        fetchShopProductDetail(id)
          .then((r) => {
            details[id] = r.product
            delete detailLoading[id]
            delete detailError[id]
          })
          .catch((e) => {
            detailError[id] = String(e?.message || e || '详情加载失败')
            delete detailLoading[id]
          })
      }
    }
  } catch (e: any) {
    errorText.value = String(e?.message || e || '商品列表加载失败')
  } finally {
    loading.value = false
  }
}

function toggleExpand(id: string) {
  expandedRows[id] = !expandedRows[id]
}

function priceFenToYuan(fen: number | undefined | null): string {
  if (fen === undefined || fen === null) return '-'
  const n = Number(fen)
  if (!Number.isFinite(n)) return '-'
  return `¥${(n / 100).toFixed(2)}`
}

function statusText(s: number | undefined | null) {
  const n = Number(s)
  if (n === 5) return { label: '已上架', cls: 'text-green-400' }
  if ([1, 2, 3, 4].includes(n)) return { label: '待上架', cls: 'text-amber-400' }
  if ([6, 7, 12, 13, 14].includes(n)) return { label: '已下架', cls: 'text-zinc-500' }
  return { label: String(n), cls: 'text-zinc-400' }
}

const checkboxHeaderSlot = {
  render: () =>
    h(
      'div',
      { class: 'flex items-center gap-2' },
      [
        h('input', {
          type: 'checkbox',
          checked: allChecked.value,
          indeterminate: someChecked.value && !allChecked.value,
          class: 'w-4 h-4 cursor-pointer accent-[#E10600]',
          onClick: (e: Event) => {
            e.stopPropagation()
            toggleSelectAll()
          },
        }),
        h('span', { class: 'text-xs text-zinc-400' }, `选${checkedCount.value}`),
      ],
    ),
}

const columns = [
  {
    title: h(checkboxHeaderSlot.render()),
    key: '_check',
    width: 70,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const inSelected = selectedProductIDSet.value.has(id)
      return hh('div', { class: 'flex items-center gap-2' }, [
        hh('input', {
          type: 'checkbox',
          checked: isChecked(id),
          class: 'w-4 h-4 cursor-pointer accent-[#E10600]',
          onClick: (e: Event) => {
            e.stopPropagation()
            toggleSelect(id)
          },
        }),
        inSelected
          ? hh(
              'span',
              {
                class:
                  'inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-[#1a0a0a] text-[#E10600] border border-[#E10600]/30',
              },
              '已指定',
            )
          : null,
      ])
    },
  },
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
      if (loading2) return hh('div', { class: 'text-xs text-zinc-500' }, '加载中…')
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
    width: 90,
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
      const s = statusText(d.status)
      return hh('span', { class: `text-xs ${s.cls}` }, s.label)
    },
  },
  {
    title: '操作',
    key: 'action',
    width: 170,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const expanded = !!expandedRows[id]
      const inSelected = selectedProductIDSet.value.has(id)
      return hh('div', { class: 'flex items-center gap-2' }, [
        !inSelected
          ? hh(
              'button',
              {
                class:
                  'px-2.5 py-1 text-xs rounded transition-colors ' +
                  'bg-[#E10600] hover:bg-[#c60700] text-white',
                onClick: async () => {
                  addingSelected.value = true
                  try {
                    await addAdminShopSelected([id])
                    Message.success('已入库指定商品')
                    await loadSelectedProducts()
                  } catch (e: any) {
                    errorText.value = String(e?.message || e || '入库失败')
                  } finally {
                    addingSelected.value = false
                  }
                },
              },
              '指定入库',
            )
          : null,
        hh(
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
        ),
      ])
    },
  },
]

const tableRows = computed(() =>
  productIDs.value.map((id) => ({ _key: id, id })),
)

function rowExpandRender(hh: typeof h, params: any) {
  const id = String((params.row && params.row.id) || '')
  const d = details[id]
  const err = detailError[id]
  const loading2 = detailLoading[id]
  if (loading2) return hh('div', { class: 'px-4 py-6 text-sm text-zinc-500' }, '商品详情加载中…')
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
        hh(
          'div',
          { class: 'text-sm text-zinc-200' },
          `cate=${d.cate_id || '-'} / brand=${d.brand_id || '-'}`,
        ),
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
                hh(
                  'div',
                  { class: 'col-span-1 text-red-500 text-xs text-right' },
                  priceFenToYuan(s.sale_price),
                ),
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

onMounted(async () => {
  loadSelectedProducts()
  await loadCategories()
  await loadProductIDs()
})

let _lastLoadKey = ''
watch(
  () => {
    const sid = parseCatIdFromQuery()
    return (sid === null ? 'all' : String(sid)) + '::' + (catLoaded.value ? '1' : '0')
  },
  (key) => {
    const [k] = key.split('::')
    if (k === _lastLoadKey) return
    _lastLoadKey = k
    ensureExpandedFromQuery(parseCatIdFromQuery(), categories.value)
    loadProductIDs()
  },
  { immediate: false },
)
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
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-sm text-zinc-500">微信小店</div>
          <div class="text-lg font-semibold text-zinc-100 mt-0.5 flex items-center gap-3">
            <span>{{ scopeTitle }}</span>
            <span class="text-xs font-normal text-zinc-500">共 {{ productIDs.length }} 个商品</span>
            <span
              v-if="selectedProducts.length"
              class="text-xs font-normal px-2 py-0.5 rounded bg-[#1a0a0a] text-[#E10600] border border-[#E10600]/30"
            >
              已指定 {{ selectedProducts.length }} 个
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Button
            type="primary"
            :loading="addingSelected"
            :disabled="checkedCount === 0"
            @click="handleAddSelected"
          >
            入库选中 ({{ checkedCount }})
          </Button>
          <Button type="primary" :loading="loading" @click="loadProductIDs">刷新</Button>
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

          <div v-if="catLoading" class="px-4 py-6 text-sm text-zinc-500">加载分类中…</div>
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
                      v-if="l1.icon_url && !categoryIconError.has(l1.cat_id)"
                      :src="l1.icon_url"
                      class="w-full h-full object-cover"
                      @error="categoryIconError.add(l1.cat_id)"
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
                  :title="expandedL1[l1.cat_id] ? ' 收起子分类' : '展开子分类'"
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
                      v-if="l2.icon_url && !categoryIconError.has(l2.cat_id)"
                      :src="l2.icon_url"
                      class="w-full h-full object-cover"
                      @error="categoryIconError.add(l2.cat_id)"
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
              暂无运营分类，请在微信小店后台「店铺管理主页 - 商品分类」中创建。
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
