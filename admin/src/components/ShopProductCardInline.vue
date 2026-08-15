<script setup lang="ts">
import { fetchShopProductDetail, type ShopProductDetail } from '@/api/shop'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  productID: string
  interactive?: boolean
}>()

const loading = ref(false)
const errorText = ref('')
const detail = ref<ShopProductDetail | null>(null)
let inited = false

function priceFenToYuan(fen: number | undefined | null): string {
  if (fen === undefined || fen === null) return '-'
  const n = Number(fen)
  if (!Number.isFinite(n)) return '-'
  return `¥${(n / 100).toFixed(2)}`
}

const headImg = computed(() => {
  if (detail.value?.head_img && detail.value.head_img.length) return detail.value.head_img[0]
  return ''
})

const statusBadge = computed<{ text: string; cls: string }>(() => {
  const s = Number(detail.value?.status ?? 0)
  if (s === 5) return { text: '已上架', cls: 'text-green-400 bg-green-500/10 border-green-500/20' }
  if ([1, 2, 3, 4].includes(s)) return { text: '待上架', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
  if (s) return { text: '已下架', cls: 'text-zinc-500 bg-zinc-700/30 border-zinc-700/40' }
  return { text: '', cls: '' }
})

const SKU_COUNT_THRESHOLD = 0
async function load() {
  const pid = String(props.productID || '').trim()
  if (!pid) {
    errorText.value = '商品 ID 为空'
    return
  }
  if (detail.value) return
  loading.value = true
  errorText.value = ''
  try {
    const r = await fetchShopProductDetail(pid)
    detail.value = r.product || null
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

let observer: IntersectionObserver | null = null
let rootEl: HTMLDivElement | null = null

function onIntersect(entries: IntersectionObserverEntry[]) {
  for (const e of entries) {
    if (e.isIntersecting) {
      load()
      observer?.disconnect()
      break
    }
  }
}

function setRoot(el: HTMLDivElement | null) {
  rootEl = el
}

onMounted(() => {
  if (inited) return
  inited = true
  if (typeof IntersectionObserver !== 'undefined' && rootEl) {
    try {
      observer = new IntersectionObserver(onIntersect, { root: null, rootMargin: '200px', threshold: 0 })
      observer.observe(rootEl)
      return
    } catch {
      /* noop */
    }
  }
  load()
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div
    :ref="setRoot"
    class="group my-3 select-none overflow-hidden rounded-xl border border-zinc-800 bg-[#0b0b0e] shadow-[0_8px_28px_-14px_rgba(225,6,0,0.25)] transition-all duration-200"
    :class="interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#E10600]/60 hover:shadow-[0_12px_34px_-12px_rgba(225,6,0,0.38)]' : ''"
  >
    <div class="flex gap-4 p-3 sm:p-4">
      <div class="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-[#111116] sm:h-28 sm:w-28">
        <template v-if="!loading && !errorText && headImg">
          <img
            :src="headImg"
            class="h-full w-full object-cover"
            loading="lazy"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
        </template>
        <div v-else-if="loading" class="flex h-full w-full items-center justify-center">
          <div class="h-2 w-16 animate-pulse rounded bg-zinc-800"></div>
        </div>
        <div v-else-if="errorText" class="flex h-full w-full items-center justify-center px-2 text-center text-[10px] leading-tight text-zinc-500">
          {{ errorText }}
        </div>
        <div v-else class="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          Shop
        </div>
        <div class="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400/90 backdrop-blur-sm"
             :class="['bg-black/40 border-zinc-800/60', loading && 'animate-pulse']"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-[#E10600] shadow-[0_0_8px_0_rgba(225,6,0,0.55)]"></span>
          F1 Store
        </div>
      </div>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div
              v-if="loading"
              class="space-y-1.5"
            >
              <div class="h-3 w-4/5 animate-pulse rounded bg-zinc-800"></div>
              <div class="h-2.5 w-3/5 animate-pulse rounded bg-zinc-800"></div>
            </div>
            <template v-else>
              <div class="truncate text-sm font-semibold leading-snug text-zinc-100">
                {{ detail?.title || `商品 ${productID}` }}
              </div>
              <div v-if="detail?.sub_title" class="mt-0.5 line-clamp-1 text-[11px] leading-snug text-zinc-500">
                {{ detail.sub_title }}
              </div>
            </template>
          </div>
          <template v-if="!loading && statusBadge.text">
            <span
              class="inline-flex flex-shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
              :class="statusBadge.cls"
            >{{ statusBadge.text }}</span>
          </template>
        </div>

        <div class="mt-2 flex items-end gap-2">
          <template v-if="loading">
            <div class="h-4 w-16 animate-pulse rounded bg-zinc-800"></div>
          </template>
          <template v-else>
            <span class="text-[20px] font-black leading-none text-[#FF5948]" :style="{ fontFamily: 'system-ui' }">
              {{ priceFenToYuan(detail?.min_price) }}
            </span>
            <span v-if="detail?.market_price" class="mb-[2px] text-xs text-zinc-500 line-through">
              {{ priceFenToYuan(detail.market_price) }}
            </span>
          </template>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
          <template v-if="loading">
            <div class="h-3 w-14 animate-pulse rounded bg-zinc-800"></div>
            <div class="h-3 w-10 animate-pulse rounded bg-zinc-800"></div>
          </template>
          <template v-else>
            <span
              class="inline-flex items-center rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-zinc-400"
            >
              <span class="mr-1 font-mono text-[9px] opacity-70">ID</span>
              <span class="font-mono">{{ productID }}</span>
            </span>
            <span
              class="inline-flex items-center rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-zinc-400"
              :class="(detail?.total_stock ?? SKU_COUNT_THRESHOLD) > 0 ? '' : 'border-red-900/40 bg-red-900/20 text-red-400'"
            >
              库存 {{ detail?.total_stock ?? 0 }}
            </span>
            <span
              v-if="detail?.skus?.length"
              class="inline-flex items-center rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-zinc-400"
            >
              {{ detail.skus.length }} SKU
            </span>
          </template>
        </div>
      </div>
    </div>

    <div
      v-if="interactive"
      class="flex items-center justify-between border-t border-zinc-800/70 bg-gradient-to-r from-[#0a0a0d] via-[#10080a] to-[#0a0a0d] px-3 py-2 sm:px-4"
    >
      <span class="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Tap to view</span>
      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF5948] group-hover:translate-x-0.5 transition-transform duration-200">
        前往商品
        <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h9.19L9.22 5.53a.75.75 0 111.06-1.06l5 5a.75.75 0 010 1.06l-5 5a.75.75 0 11-1.06-1.06l3.72-3.72H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
        </svg>
      </span>
    </div>
  </div>
</template>
