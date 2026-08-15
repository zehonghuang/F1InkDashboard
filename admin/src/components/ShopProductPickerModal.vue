<script setup lang="ts">
import {
  fetchShopCategories,
  fetchShopCategoryProductIDs,
  fetchShopAllProductIDs,
  fetchShopProductDetail,
  type ShopCategory,
  type ShopProductDetail,
} from '@/api/shop'
import { Message, Modal } from 'view-ui-plus'
import { computed, h, reactive, ref, watch } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'confirm', productID: string): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

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
const confirmedID = ref<string>('')

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

async function loadCategories() {
  catLoading.value = true
  errorText.value = ''
  try {
    const res = await fetchShopCategories()
    categories.value = res.categories || []
    for (const c of categories.value) {
      if ((c.children?.length ?? 0) > 0) expandedL1[c.cat_id] = true
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
    width: 180,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const active = confirmedID.value === id
      return hh(
        'div',
        { class: 'flex items-center gap-2' },
        [
          hh(
            'span',
            {
              class:
                'font-mono text-xs px-2 py-0.5 rounded ' +
                (active
                  ? 'bg-[#E10600] text-white shadow-[0_0_0_2px_rgba(225,6,0,0.28)]'
                  : 'text-zinc-200 bg-zinc-800'),
            },
            id,
          ),
        ],
      )
    },
  },
  {
    title: '商品',
    key: 'title',
    minWidth: 340,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const detail = details[id]
      const err = detailError[id]
      const loading2 = detailLoading[id]
      if (loading2) return hh('div', { class: 'text-xs text-zinc-500' }, '加载中...')
      if (err) return hh('div', { class: 'text-xs text-red-400' }, err)
      if (!detail) return hh('div', { class: 'text-xs text-zinc-500' }, '-')
      const cover = (detail.head_img && detail.head_img[0]) || ''
      return hh('div', { class: 'flex gap-3 items-start min-w-0' }, [
        cover
          ? hh('img', {
              src: cover,
              class: 'w-14 h-14 rounded object-cover bg-zinc-800 border border-zinc-800 flex-shrink-0',
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
    width: 150,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const d = details[id]
      if (!d) return hh('span', { class: 'text-zinc-500 text-xs' }, '-')
      return hh('div', {}, [
        hh('div', { class: 'text-sm text-[#E10600] font-semibold' }, priceFenToYuan(d.min_price)),
        d.market_price
          ? hh('div', { class: 'text-xs text-zinc-500 line-through' }, priceFenToYuan(d.market_price))
          : null,
      ])
    },
  },
  {
    title: '库存 / SKU',
    key: 'stock',
    width: 140,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const d = details[id]
      if (!d) return hh('span', { class: 'text-zinc-500 text-xs' }, '-')
      return hh(
        'div',
        { class: 'space-y-0.5' },
        [
          hh(
            'div',
            {
              class: 'text-xs ' + (d.total_stock > 0 ? 'text-zinc-200' : 'text-red-400'),
            },
            `库存 ${d.total_stock ?? 0}`,
          ),
          hh('div', { class: 'text-xs text-zinc-500' }, `SKU ${d.skus?.length || 0}`),
        ],
      )
    },
  },
  {
    title: '操作',
    key: 'action',
    width: 130,
    render: (hh: typeof h, params: any) => {
      const id = String(params.row.id || '')
      const active = confirmedID.value === id
      return hh(
        'button',
        {
          class:
            'px-3 py-1 text-xs rounded transition-colors ' +
            (active
              ? 'bg-[#E10600] text-white hover:bg-[#c60700]'
              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800'),
          onClick: () => {
            confirmedID.value = id
          },
        },
        active ? '已选择' : '选择',
      )
    },
  },
])

const tableRows = computed(() => productIDs.value.map((id) => ({ _key: id, id })))

function confirm() {
  if (!confirmedID.value) {
    Message.warning('请先选择一个商品')
    return
  }
  emit('confirm', confirmedID.value)
  visible.value = false
}

function cancel() {
  visible.value = false
}

watch(selected, () => loadProductIDs())
watch(visible, (v) => {
  if (!v) return
  confirmedID.value = ''
  if (!categories.value.length) {
    loadCategories().then(loadProductIDs)
  } else {
    loadProductIDs()
  }
})
</script>

<template>
  <Modal
    v-model="visible"
    title="选择要插入的商品"
    :width="960"
    :mask-closable="false"
    @on-ok="confirm"
    @on-cancel="cancel"
  >
    <Alert v-if="errorText" type="error" show-icon class="mb-3">{{ errorText }}</Alert>

    <div class="grid grid-cols-[280px_1fr] gap-3 items-start">
      <div class="border border-zinc-200 rounded-xl overflow-hidden max-h-[60vh] overflow-auto">
        <div
          class="group px-3 py-2.5 flex items-center gap-2 cursor-pointer border-b border-zinc-100 transition-colors"
          :class="isSelectedAll() ? 'bg-red-50 border-l-[3px] border-l-[#E10600]' : 'hover:bg-zinc-50'"
          @click="setSelectedAll"
        >
          <div
            class="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
            :class="isSelectedAll() ? 'bg-[#E10600] text-white' : 'bg-zinc-100 text-zinc-500'"
          >ALL</div>
          <div class="min-w-0 flex-1">
            <div class="text-sm text-zinc-900">全部商品</div>
          </div>
        </div>
        <div v-if="catLoading" class="px-3 py-4 text-xs text-zinc-500">加载分类中...</div>
        <template v-else>
          <template v-for="l1 in categories" :key="l1.cat_id">
            <div class="group border-b border-zinc-100" :class="isL1Active(l1) ? 'bg-zinc-50' : ''">
              <div class="flex items-start gap-0">
                <div
                  class="px-3 py-2.5 flex-1 flex items-start gap-2 cursor-pointer transition-colors"
                  :class="
                    selected.kind === 'l1' && selected.cat_id === l1.cat_id
                      ? 'bg-red-50 border-l-[3px] border-l-[#E10600]'
                      : 'hover:bg-zinc-50'
                  "
                  @click="setSelectedL1(l1)"
                >
                  <div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-100">
                    <img
                      v-if="l1.icon_url"
                      :src="l1.icon_url"
                      class="w-full h-full object-cover"
                      @error="($event.target as HTMLImageElement).remove()"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-zinc-900 truncate">{{ l1.name }}</div>
                    <div class="text-[11px] text-zinc-400 mt-0.5">ID {{ l1.cat_id }}</div>
                  </div>
                </div>
                <button
                  v-if="l1.children && l1.children.length"
                  type="button"
                  class="w-8 h-8 shrink-0 my-1 mr-1 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
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
            </div>
            <template v-if="l1.children && l1.children.length && expandedL1[l1.cat_id]">
              <div
                v-for="l2 in l1.children"
                :key="l2.cat_id"
                class="group flex items-center gap-2 px-3 py-2 pl-12 cursor-pointer transition-colors border-b border-zinc-100"
                :class="
                  isL2Active(l2)
                    ? 'bg-red-50 border-l-[3px] border-l-[#E10600]'
                    : 'hover:bg-zinc-50'
                "
                @click="setSelectedL2(l2)"
              >
                <div class="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-100">
                  <img
                    v-if="l2.icon_url"
                    :src="l2.icon_url"
                    class="w-full h-full object-cover"
                    @error="($event.target as HTMLImageElement).remove()"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-zinc-800 truncate">{{ l2.name }}</div>
                  <div class="text-[11px] text-zinc-400 mt-0.5">ID {{ l2.cat_id }}</div>
                </div>
              </div>
            </template>
          </template>
          <div v-if="categories.length === 0" class="px-3 py-4 text-xs text-zinc-500">暂无运营分类</div>
        </template>
      </div>

      <div class="border border-zinc-200 rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0">
          <div class="text-sm text-zinc-700 font-medium">
            商品列表 · <span class="text-zinc-900">{{ scopeTitle }}</span>
            <span class="ml-2 text-[11px] text-zinc-400 font-normal">共 {{ productIDs.length }} 条</span>
          </div>
          <button
            type="button"
            class="text-xs px-2.5 py-1 rounded border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition-colors"
            @click="loadProductIDs"
            :disabled="loading"
          >刷新</button>
        </div>
        <div class="max-h-[60vh] overflow-auto">
          <Table
            :loading="loading"
            :columns="columns"
            :data="tableRows"
            stripe
            size="small"
            :row-key="_key => _key"
            bordered="false"
            :show-header="true"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs text-zinc-500">
          <template v-if="confirmedID">
            已选择商品
            <span class="mx-1 font-mono text-[#E10600] font-semibold">{{ confirmedID }}</span>
            ，将插入到当前编辑光标位置
          </template>
          <template v-else>请在右侧选择一个商品</template>
        </div>
        <div class="flex gap-2">
          <Button type="default" @click="cancel">取消</Button>
          <Button type="primary" :disabled="!confirmedID" @click="confirm">确定插入</Button>
        </div>
      </div>
    </template>
  </Modal>
</template>
