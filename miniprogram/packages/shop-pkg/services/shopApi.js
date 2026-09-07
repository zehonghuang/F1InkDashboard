const { requestJson } = require("../../../services/request")

function fetchShopCategories() {
  return requestJson("/api/v1/shop/categories", { needAuth: false })
}

function fetchShopCategoryProductIDs(catID) {
  const id = String(catID || "").trim()
  if (!id) return Promise.reject(new Error("missing category id"))
  return requestJson(`/api/v1/shop/categories/${encodeURIComponent(id)}/products`, {
    needAuth: false,
  })
}

function fetchShopAllProductIDs(status) {
  const s = Number(status) > 0 ? Number(status) : 5
  return requestJson(`/api/v1/shop/products?status=${s}`, { needAuth: false })
}

function fetchShopProductDetail(productID) {
  const id = String(productID || "").trim()
  if (!id) return Promise.reject(new Error("missing product id"))
  return requestJson(`/api/v1/shop/products/${encodeURIComponent(id)}`, {
    needAuth: false,
  })
}

function priceFenToYuanText(fen) {
  const n = Number(fen)
  if (!Number.isFinite(n)) return "-"
  return `¥${(n / 100).toFixed(2)}`
}

module.exports = {
  fetchShopCategories,
  fetchShopCategoryProductIDs,
  fetchShopAllProductIDs,
  fetchShopProductDetail,
  priceFenToYuanText,
}
