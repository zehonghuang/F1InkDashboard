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

const TYRE_FILE_BY_KEY = {
  h: "white.png",
  hard: "white.png",
  white: "white.png",
  m: "yellow.png",
  medium: "yellow.png",
  yellow: "yellow.png",
  s: "red.png",
  soft: "red.png",
  red: "red.png",
  i: "green.png",
  intermediate: "green.png",
  green: "green.png",
  w: "blue.png",
  wet: "blue.png",
  fullwet: "blue.png",
  "full-wet": "blue.png",
  blue: "blue.png",
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

function resolveTyreImageUrl(row, baseUrl, tyreImageBasePath) {
  const r = row || {}
  const explicit = r.tyreImageUrl || r.tyre_image_url || ""
  if (explicit) return String(explicit)
  const base = String(baseUrl || "").trim()
  if (!base) return ""
  const raw = String(r.tyre || r.tyres || "").trim()
  if (!raw) return ""
  const key = normKey(raw).replace(/-/g, "")
  const file = TYRE_FILE_BY_KEY[key]
  if (!file) return ""
  const p0 = String(tyreImageBasePath || "").trim() || "/static/assets/tyres/pirelli"
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
    tyreImageBasePath: { type: String, value: "/static/assets/tyres/pirelli" },
    carFileMap: { type: Object, value: null },
  },
  data: {
    displayRows: [],
  },
  observers: {
    'rows,maxRows,baseUrl,carImageBasePath,tyreImageBasePath,carFileMap': function (
      rows,
      maxRows,
      baseUrl,
      carImageBasePath,
      tyreImageBasePath,
      carFileMap
    ) {
      const list = Array.isArray(rows) ? rows : []
      const n = typeof maxRows === 'number' && maxRows > 0 ? maxRows : list.length
      const slice = list
        .slice(0, n)
        .map((it) => ({
          ...(it || {}),
          carImageUrl: resolveCarImageUrl(it, baseUrl, carImageBasePath, carFileMap),
          tyreImageUrl: resolveTyreImageUrl(it, baseUrl, tyreImageBasePath),
        }))
      this.setData({ displayRows: slice })
    },
  },
  methods: {},
})
