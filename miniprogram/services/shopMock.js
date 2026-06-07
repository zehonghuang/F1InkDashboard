const PRODUCTS = [
  {
    id: "cap-redbull",
    title: "Red Bull Racing Cap",
    subtitle: "One size · Black",
    priceCny: 199,
    desc: "UI demo only. No backend."
  },
  {
    id: "tee-ferrari",
    title: "Scuderia Ferrari T‑Shirt",
    subtitle: "Unisex · Cotton",
    priceCny: 299,
    desc: "UI demo only. No backend."
  },
  {
    id: "mug-tonic",
    title: "TONIC Garage Mug",
    subtitle: "350ml · Ceramic",
    priceCny: 89,
    desc: "UI demo only. No backend."
  }
]

function listProducts() {
  return PRODUCTS.slice()
}

function getProduct(id) {
  const k = String(id || "").trim()
  if (!k) return null
  return PRODUCTS.find((p) => p && p.id === k) || null
}

module.exports = {
  listProducts,
  getProduct
}

