import { fetchJSON } from '@/api/http'

export type ShopCategory = {
  cat_id: number
  name: string
  f_id: number
  level: number
  cat_type: number
  icon_url: string
  sort: number
  children?: ShopCategory[]
}

export type ShopCategoriesResponse = {
  ok: boolean
  error?: string
  categories: ShopCategory[]
}

export type ShopCategoryProductIDsResponse = {
  ok: boolean
  error?: string
  cat_id: number
  product_ids: string[]
}

export type ShopAllProductIDsResponse = {
  ok: boolean
  error?: string
  product_ids: string[]
}

export type ShopProductSkuAttr = {
  name: string
  value: string
}

export type ShopProductSku = {
  sku_id: string
  out_sku_id: string
  thumb_img: string
  sale_price: number
  market_price: number
  stock_num: number
  sku_code: string
  sku_attrs?: ShopProductSkuAttr[]
}

export type ShopProductDesc = {
  imgs?: string[]
}

export type ShopProductDetail = {
  spu_id: string
  out_product_id: string
  title: string
  sub_title: string
  head_img: string[]
  desc_info: ShopProductDesc
  cate_id: number
  brand_id: number
  min_price: number
  market_price: number
  total_stock: number
  status: number
  skus?: ShopProductSku[]
}

export type ShopProductDetailResponse = {
  ok: boolean
  error?: string
  product: ShopProductDetail | null
}

export async function fetchShopCategories(): Promise<ShopCategoriesResponse> {
  const res = await fetchJSON<ShopCategoriesResponse>('/api/v1/shop/categories')
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchShopCategoryProductIDs(catID: number | string): Promise<ShopCategoryProductIDsResponse> {
  const res = await fetchJSON<ShopCategoryProductIDsResponse>(
    `/api/v1/shop/categories/${encodeURIComponent(String(catID))}/products`,
  )
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchShopAllProductIDs(status = 5): Promise<ShopAllProductIDsResponse> {
  const url = `/api/v1/shop/products?status=${encodeURIComponent(String(status))}`
  const res = await fetchJSON<ShopAllProductIDsResponse>(url)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function fetchShopProductDetail(productID: string): Promise<ShopProductDetailResponse> {
  const res = await fetchJSON<ShopProductDetailResponse>(
    `/api/v1/shop/products/${encodeURIComponent(String(productID))}`,
  )
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}
