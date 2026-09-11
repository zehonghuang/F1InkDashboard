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

export type ShopSelectedProduct = {
  id: number
  app_id: string
  product_id: string
  spu_id: string
  title: string
  sub_title: string
  head_img: string
  min_price: number
  market_price: number
  total_stock: number
  status: number
  weight: number
  snapshot_json?: string
  selected_at?: string
  created_at: string
  updated_at: string
}

export type ShopSelectedListResponse = {
  ok: boolean
  error?: string
  total: number
  items: ShopSelectedProduct[]
}

export type ShopSelectedIDsResponse = {
  ok: boolean
  error?: string
  app_id: string
  product_ids: string[]
}

export async function fetchAdminShopSelected(appID = ''): Promise<ShopSelectedListResponse> {
  const q = appID ? `?app_id=${encodeURIComponent(appID)}` : ''
  const res = await fetchJSON<ShopSelectedListResponse>(`/api/v1/admin/shop/selected${q}`)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function addAdminShopSelected(
  productIDs: string[],
  appID = '',
): Promise<ShopSelectedListResponse> {
  const res = await fetchJSON<ShopSelectedListResponse>(`/api/v1/admin/shop/selected`, {
    method: 'POST',
    body: JSON.stringify({ app_id: appID, product_ids: productIDs }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function removeAdminShopSelected(
  productIDs: string[],
  appID = '',
): Promise<ShopSelectedListResponse> {
  const res = await fetchJSON<ShopSelectedListResponse>(`/api/v1/admin/shop/selected`, {
    method: 'DELETE',
    body: JSON.stringify({ app_id: appID, product_ids: productIDs }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}

export async function updateAdminShopSelectedWeight(
  id: number | string,
  weight: number,
): Promise<{ ok: boolean; item: ShopSelectedProduct }> {
  const res = await fetchJSON<{ ok: boolean; item: ShopSelectedProduct }>(
    `/api/v1/admin/shop/selected/${encodeURIComponent(String(id))}`,
    {
      method: 'PUT',
      body: JSON.stringify({ weight }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
  if (!res.ok) throw new Error((res as any).error || 'backend_error')
  return res
}

export async function fetchMpShopSelectedIDs(appID = ''): Promise<ShopSelectedIDsResponse> {
  const q = appID ? `&app_id=${encodeURIComponent(appID)}` : ''
  const res = await fetchJSON<ShopSelectedIDsResponse>(`/api/v1/shop/selected?token=admin${q}`)
  if (!res.ok) throw new Error(res.error || 'backend_error')
  return res
}
