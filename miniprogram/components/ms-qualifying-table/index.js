function joinUrl(base, path) {
  const p = String(path || "")
  if (!p) return ""
  if (/^https?:\/\//i.test(p)) return p
  const b = String(base || "").replace(/\/+$/, "")
  if (!b) return p
  if (p.startsWith("/")) return `${b}${p}`
  return `${b}/${p}`
}

function normKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
}

const CAR_FILE_BY_TEAM_KEY = {
  alpine: "alpine-a526.png",
  "aston-martin": "aston-martin-amr26.png",
  audi: "audi-r26-2.png",
  cadillac: "cadillac-2.png",
  ferrari: "ferrari-sf-26.png",
  haas: "haas-vf-26.png",
  "haas-f1-team": "haas-vf-26.png",
  "moneygram-haas-f1-team": "haas-vf-26.png",
  mclaren: "mclaren-mcl40.png",
  mercedes: "mercedes-mgp-w17.png",
  "racing-bulls": "racing-bulls-vcarb03.png",
  "red-bull-racing": "red-bull-racing-rb22.png",
  williams: "williams-fw48.png",
}

function resolveCarImageUrl(row, baseUrl, carImageBasePath, carFileMap) {
  const r = row || {}
  const explicit = r.carImageUrl || r.car_image_url || ""
  if (explicit) return String(explicit)
  const base = String(baseUrl || "").trim()
  if (!base) return ""
  const map = carFileMap && typeof carFileMap === "object" ? carFileMap : CAR_FILE_BY_TEAM_KEY
  const teamKey = normKey(r.teamKey || r.team_key || r.team || "")
  const file = map[teamKey]
  if (!file) return ""
  const p0 = String(carImageBasePath || "").trim() || "/static/cars/motorsport"
  const p1 = p0.replace(/\/+$/, "")
  const rel = (p1.startsWith("/") ? p1 : `/${p1}`) + `/${file}`
  return joinUrl(base, rel)
}

Component({
  properties: {
    title: { type: String, value: '' },
    rows: { type: Array, value: [] },
    maxRows: { type: Number, value: 0 },
    dense: { type: Boolean, value: true },
    bodyHeightRpx: { type: Number, value: 560 },
    baseUrl: { type: String, value: "" },
    carImageBasePath: { type: String, value: "/static/cars/motorsport" },
    carFileMap: { type: Object, value: null },
  },
  data: {
    displayRows: [],
  },
  observers: {
    'rows,maxRows,baseUrl,carImageBasePath,carFileMap': function (
      rows,
      maxRows,
      baseUrl,
      carImageBasePath,
      carFileMap
    ) {
      const list = Array.isArray(rows) ? rows : []
      const n = typeof maxRows === 'number' && maxRows > 0 ? maxRows : list.length
      const slice = list
        .slice(0, n)
        .map((it) => ({ ...(it || {}), carImageUrl: resolveCarImageUrl(it, baseUrl, carImageBasePath, carFileMap) }))
      this.setData({ displayRows: slice })
    },
  },
  methods: {},
})
