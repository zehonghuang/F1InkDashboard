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
const selectedCatID = ref<number | ''>('')
const productIDs = ref<string[]>([])

const details = reactive<Record<string, ShopProductDetail | null>>({})
const detailLoading = reactive<Record<string, boolean>>({})
const detailError = reactive<Record<string, string>>({})
const expandedRows = reactive<Record<string, boolean>>({})

function flattenCats(src: ShopCategory[], into: ShopCategory[] = []): ShopCategory[] {
  for (const c of src) {
    into.push(c)
    if (c.children && c.children.length) flattenCats(c.children, into)
  }
  return into
}

const flatCats = computed(() => {
  const list = flattenCats(categories.value || [])
  list.sort((a, b) => (a.sort || 0) - (b.sort || 0))
  return list
})

const currentCatName = computed(() => {
  if (!selectedCatID.value) return '全部分类'
  const f = flatCats.value.find((c) => c.cat_id === selectedCatID.value)
  return f ? f.name : `分类 #${selectedCatID.value}`
})

async function loadCategories() {
  catLoading.value = true
  try {
    const res = await fetchShopCategories()
    categories.value = res.categories || []
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
    if (!selectedCatID.value) {
      const r = await fetchShopAllProductIDs(5)
      productIDs.value = r.product_ids || []
    } else {
      const r = await fetchShopCategoryProductIDs(Number(selectedCatID.value))
      productIDs.value = r.product_ids || []
    }
    // clear cache
    for (const k of Object.keys(details)) delete details[k]
    for (const k of Object.keys(detailLoading)) delete detailLoading[k]
    for (const k of Object.keys(detailError)) delete detailError[k]
    for (const k of Object.keys(expandedRows)) delete expandedRows[k]
    // eager load first N
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

const columns = computed(() => [
  {
    title: '商品 ID',
    key: 'id',
    minWidth: 200,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const detail = details[id]
      return hh(
        'div',
        { class: 'flex items-center gap-2' },
        [
          hh(
            'span',
            { class: 'font-mono text-xs text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded' },
            id,
          ),
          detail?.spu_id
            ? hh('span', { class: 'text-xs text-zinc-500' }, `spu=${detail.spu_id}`)
            : null,
        ],
      )
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
      if (loading2) {
        return hh('div', { class: 'text-xs text-zinc-500' }, '加载中...')
      }
      if (err) {
        return hh('div', { class: 'text-xs text-red-400' }, err)
      }
      if (!detail) {
        return hh('div', { class: 'text-xs text-zinc-500' }, '-')
      }
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
          hh(
            'div',
            { class: 'text-sm font-medium text-zinc-100 truncate' },
            detail.title || '(无标题)',
          ),
          detail.sub_title
            ? hh(
                'div',
                { class: 'text-xs text-zinc-400 mt-0.5 line-clamp-2' },
                detail.sub_title,
              )
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
          ? hh(
              'div',
              { class: 'text-xs text-zinc-500 line-through' },
              priceFenToYuan(d.market_price),
            )
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
  if (loading2) {
    return hh('div', { class: 'px-4 py-6 text-sm text-zinc-500' }, '商品详情加载中...')
  }
  if (err) {
    return hh(
      'div',
      { class: 'px-4 py-6 text-sm text-red-400' },
      `加载失败：${err}`,
    )
  }
  if (!d) {
    return hh('div', { class: 'px-4 py-6 text-sm text-zinc-500' }, '暂无详情')
  }
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
                class:
                  'w-20 h-20 rounded object-cover bg-zinc-800 border border-zinc-800',
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
              hh('img', {
                src,
                class: 'max-w-full rounded border border-zinc-800',
              }),
            ),
          ),
        ])
      : null,

    (d.skus?.length ?? 0) > 0
      ? hh('div', { class: 'space-y-2' }, [
          hh('div', { class: 'text-xs text-zinc-500' }, 'SKU 列表'),
          hh(
            'div',
            {
              class:
                'overflow-hidden rounded border border-zinc-800 divide-y divide-zinc-800',
            },
            d.skus!.map((s) =>
              hh('div', { class: 'grid grid-cols-12 gap-2 p-3 items-center text-sm' }, [
                s.thumb_img
                  ? hh('img', {
                      src: s.thumb_img,
                      class:
                        'col-span-1 w-10 h-10 rounded object-cover bg-zinc-800',
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
                  (s.sku_attrs || [])
                    .map((a) => `${a.name}:${a.value}`)
                    .join(' / ') || '-',
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

function onSelectCat() {
  if (selectedCatID.value === '') {
    router.replace({ name: 'shop-products', query: {} })
  } else {
    router.replace({ name: 'shop-products', query: { cat_id: String(selectedCatID.value) } })
  }
}

function syncFromQuery() {
  const fromQ = route.query?.cat_id
  if (fromQ !== undefined) {
    const n = Number(String(fromQ))
    if (Number.isFinite(n) && n > 0) {
      selectedCatID.value = n
      return
    }
  }
  selectedCatID.value = ''
}

onMounted(async () => {
  syncFromQuery()
  await loadCategories()
  await loadProductIDs()
})

watch(
  () => [route.query?.cat_id],
  () => {
    const prev = selectedCatID.value
    syncFromQuery()
    if (prev !== selectedCatID.value) {
      loadProductIDs()
    }
  },
)

watch([selectedCatID], () => {
  // only reload when user explicitly changes (click or query)
})
</script>

<template>
  <div class="space-y-4">
    <Card>
      <template #title>微信小店 · 商品列表</template>
      <Form inline>
        <FormItem label="当前分类">
          <Select
            v-model="selectedCatID"
            :loading="catLoading"
            placeholder="全部分类"
            clearable
            style="width: 300px"
            @on-change="onSelectCat"
            @on-clear="onSelectCat"
          >
            <Option
              v-for="c in flatCats"
              :key="c.cat_id"
              :value="c.cat_id"
              :label="c.name"
            />
          </Select>
        </FormItem>
        <FormItem>
          <Button type="primary" :loading="loading" @click="loadProductIDs">
            刷新 {{ currentCatName }}
          </Button>
        </FormItem>
        <FormItem>
          <Button type="default" @click="router.push({ name: 'shop-categories' })">
            分类管理
          </Button>
        </FormItem>
      </Form>
      <Alert v-if="errorText" type="error" show-icon class="mt-3">{{ errorText }}</Alert>
      <div class="mt-2 text-xs text-zinc-400">
        共 {{ productIDs.length }} 个商品 ID。点击「查看详情」展开 SKU 明细、主图、详情图。
      </div>
    </Card>

    <Card>
      <Table
        :loading="loading"
        :columns="columns"
        :data="tableRows"
        stripe
        size="large"
        :row-key="_key => _key"
      >
        <template #expandedRowRender="params">
          <component :is="{ render: () => rowExpandRender(h, params) }" />
        </template>
      </Table>
    </Card>
  </div>
</template>
