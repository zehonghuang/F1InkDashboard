<template>
  <div class="globe-wrap" ref="wrapRef" :style="{ width: size + 'px', height: size + 'px' }"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import Globe from "globe.gl";
import * as THREE from "three";

const props = defineProps({
  size: { type: Number, default: 360 },
  dotCount: { type: Number, default: 3200 },
  landExtraRatio: { type: Number, default: 0.55 },
  rotateSpeed: { type: Number, default: 0.0030 },
  tilt: { type: Number, default: 23.4 * Math.PI / 180 },
  initialYaw: { type: Number, default: Math.PI * 0.46 },
  atmosphereColor: { type: String, default: "#dbe6ff" },
  atmosphereAltitude: { type: Number, default: 0.12 },
  globeColor: { type: String, default: "#05070b" },
  globeEmissive: { type: String, default: "#020304" },
  globeSpecular: { type: String, default: "#d6dce8" },
  ringColor: { type: String, default: "#ff4d4f" },
  highlightColor: { type: String, default: "#eef3ff" }
});

const wrapRef = ref(null);
let globeInstance = null;

const phi = Math.PI * (3 - Math.sqrt(5));

function fiboSpherePoints(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const theta = phi * i;
    const x = Math.cos(theta) * rad;
    const z = Math.sin(theta) * rad;
    const lat = Math.asin(y) * 180 / Math.PI;
    const lng = Math.atan2(z, x) * 180 / Math.PI;
    pts.push({ lat, lng });
  }
  return pts;
}

const CONTINENTS = [
  [
    [-168, 66], [-160, 70], [-140, 70], [-125, 71], [-110, 70], [-95, 74], [-82, 83], [-60, 82],
    [-55, 70], [-60, 50], [-65, 45], [-67, 44], [-70, 42], [-75, 40], [-76, 37], [-74, 35],
    [-75, 32], [-80, 25], [-81, 25], [-82, 28], [-82, 29], [-85, 29], [-88, 30], [-94, 29],
    [-97, 26], [-98, 26], [-99, 28], [-105, 21], [-107, 22], [-112, 30], [-117, 32], [-118, 34],
    [-121, 35], [-123, 38], [-125, 40], [-125, 48], [-129, 54], [-135, 58], [-145, 60], [-155, 58],
    [-162, 55], [-166, 54], [-165, 60], [-168, 66]
  ],
  [
    [-98, 26], [-95, 29], [-90, 20], [-87, 16], [-84, 12], [-82, 9], [-78, 8], [-77, 9], [-77, 11],
    [-80, 11], [-82, 9], [-85, 10], [-89, 15], [-93, 18], [-94, 21], [-97, 22], [-98, 26]
  ],
  [
    [-82, 9], [-72, 13], [-60, 9], [-52, 5], [-35, -5], [-34, -15], [-40, -22], [-48, -28],
    [-57, -38], [-65, -50], [-72, -55], [-75, -52], [-71, -44], [-67, -30], [-70, -20],
    [-78, -10], [-82, -2], [-83, 2], [-82, 9]
  ],
  [
    [-10, 36], [-5, 44], [2, 51], [5, 58], [10, 62], [20, 70], [30, 71], [40, 68],
    [45, 60], [42, 52], [38, 45], [30, 40], [25, 35], [18, 34], [12, 35], [5, 36], [-2, 36], [-10, 36]
  ],
  [
    [-10, 36], [-2, 36], [5, 36], [12, 35], [18, 34], [25, 35], [30, 30], [33, 20],
    [35, 12], [32, 5], [25, 0], [18, 0], [10, 4], [5, 10], [0, 15], [-5, 20], [-10, 28], [-10, 36]
  ],
  [
    [32, 42], [40, 50], [50, 55], [60, 60], [70, 65], [80, 70], [90, 72], [110, 72],
    [130, 70], [145, 65], [155, 58], [160, 50], [150, 45], [140, 40], [130, 35], [122, 30],
    [115, 22], [108, 20], [100, 15], [95, 22], [90, 28], [80, 25], [72, 20], [65, 25], [60, 30],
    [50, 30], [44, 34], [38, 38], [32, 42]
  ],
  [
    [95, 28], [100, 15], [105, 10], [100, 5], [95, 8], [92, 15], [88, 20], [80, 22], [75, 18],
    [73, 10], [75, 4], [80, 0], [90, -5], [100, -7], [110, -7], [120, -3], [128, 2], [130, -2],
    [125, -8], [115, -10], [105, -7], [95, -12], [90, -22], [90, -35], [105, -38], [120, -34],
    [130, -32], [140, -28], [148, -22], [152, -25], [148, -35], [140, -40], [130, -42], [115, -45],
    [100, -45], [88, -40], [80, -32], [75, -20], [80, -12], [90, -2]
  ],
  [
    [130, 31], [135, 35], [140, 38], [145, 42], [150, 45], [155, 42], [160, 38], [155, 34],
    [145, 30], [138, 28], [132, 30], [130, 31]
  ],
  [
    [172, -34], [175, -38], [178, -40], [176, -44], [172, -48], [168, -46], [165, -42], [166, -38], [172, -34]
  ],
  [
    [-5, 50], [0, 53], [2, 58], [-2, 59], [-6, 55], [-5, 50]
  ]
];

const ISLANDS_BONUS = [
  [-156, 20], [-157, 21], [-155, 19], [-105, 22], [-98, 25],
  [121, 23], [121, 25], [122, 24], [120, 22], [118, 22],
  [-20, 64], [-18, 66], [-22, 65], [-15, 66], [-25, 68],
  [-74, 43], [-70, 18], [-70, 19], [-74, 19], [-75, 11],
  [55, -21], [58, -20], [50, -18], [63, -49], [170, -42],
  [-81, 24], [-81, 29], [-84, 30], [-79, 26], [-82, 27],
  [-6, 36], [0, 38], [-8, 31], [-4, 35], [-5, 30],
  [28, 61], [24, 60], [22, 65], [26, 67], [30, 68],
  [24, 36], [27, 36], [28, 37], [25, 35], [23, 36],
  [23, -34], [27, -33], [30, -28], [18, -34], [18, -35],
  [-70, -30], [-68, -22], [-70, -35], [-71, -40], [-72, -50],
  [40, -22], [42, -18], [46, -15], [48, -12], [52, -6],
  [-80, 34], [-76, 42], [-74, 40], [-70, 43], [-67, 44],
  [-89, 30], [-94, 29], [-97, 27], [-87, 31], [-85, 31],
  [33, 30], [36, 32], [40, 35], [44, 35], [48, 32],
  [115, -32], [121, -33], [125, -33], [120, -35], [116, -35]
];

const CONTINENT_GROUPS = [
  { name: "North America", key: "north-america", polygonIndexes: [0, 1], color: "rgba(96, 14, 18, 0.97)" },
  { name: "South America", key: "south-america", polygonIndexes: [2], color: "rgba(122, 18, 22, 0.97)" },
  { name: "Europe", key: "europe", polygonIndexes: [3, 9], color: "rgba(150, 22, 28, 0.97)" },
  { name: "Africa", key: "africa", polygonIndexes: [4], color: "rgba(178, 28, 34, 0.97)" },
  { name: "Asia", key: "asia", polygonIndexes: [5, 6, 7], color: "rgba(210, 34, 40, 0.97)" },
  { name: "Oceania", key: "oceania", polygonIndexes: [8], color: "rgba(236, 54, 52, 0.97)" }
];

const COUNTRY_BLOCKS = [
  { name: "United States", color: "rgba(255, 92, 78, 1)", latMin: 24, latMax: 49, lngMin: -125, lngMax: -66 },
  { name: "Canada", color: "rgba(255, 112, 92, 1)", latMin: 49, latMax: 71, lngMin: -141, lngMax: -60 },
  { name: "United Kingdom", color: "rgba(255, 127, 96, 1)", latMin: 49, latMax: 60, lngMin: -8, lngMax: 2.5 },
  { name: "Netherlands", color: "rgba(255, 142, 108, 1)", latMin: 50.5, latMax: 54, lngMin: 3, lngMax: 7.5 },
  { name: "Italy", color: "rgba(255, 98, 74, 1)", latMin: 37, latMax: 47, lngMin: 6, lngMax: 18.8 },
  { name: "Japan", color: "rgba(255, 122, 86, 1)", latMin: 30, latMax: 46.5, lngMin: 129, lngMax: 146 },
  { name: "Singapore", color: "rgba(255, 158, 118, 1)", latMin: 1, latMax: 2.2, lngMin: 103.4, lngMax: 104.2 },
  { name: "Australia", color: "rgba(255, 106, 82, 1)", latMin: -44, latMax: -11, lngMin: 113, lngMax: 154 }
];

const COUNTRY_POLYGONS = [
  {
    name: "United States",
    color: "rgba(255, 92, 78, 0.98)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-124, 32], [-124, 48], [-117, 49], [-110, 49], [-104, 49], [-96, 49], [-89, 47], [-82, 45],
        [-75, 44], [-67, 45], [-67, 30], [-80, 25], [-97, 26], [-106, 31], [-114, 32], [-124, 32]
      ]]
    }
  },
  {
    name: "Canada",
    color: "rgba(255, 112, 92, 0.98)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-141, 60], [-132, 68], [-120, 71], [-105, 72], [-92, 75], [-78, 81], [-60, 78], [-56, 62],
        [-67, 54], [-95, 49], [-117, 49], [-132, 54], [-141, 60]
      ]]
    }
  },
  {
    name: "United Kingdom",
    color: "rgba(255, 127, 96, 0.99)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-8, 50], [-6, 58], [-3, 59], [0.5, 57], [1.5, 52], [-2, 50], [-8, 50]
      ]]
    }
  },
  {
    name: "Netherlands",
    color: "rgba(255, 142, 108, 0.99)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [3.1, 51.2], [4.0, 53.7], [6.8, 53.5], [7.2, 51.1], [5.4, 50.8], [3.1, 51.2]
      ]]
    }
  },
  {
    name: "Italy",
    color: "rgba(255, 98, 74, 0.99)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [6.5, 46.5], [12.8, 47], [18.4, 45], [16.8, 39], [15.5, 37], [12.2, 38], [10.4, 41], [8.0, 44], [6.5, 46.5]
      ]]
    }
  },
  {
    name: "Japan",
    color: "rgba(255, 122, 86, 0.99)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [129, 31], [131, 34], [135, 35], [139, 38], [143, 43], [146, 44], [145, 38], [141, 34], [137, 33], [133, 31], [129, 31]
      ]]
    }
  },
  {
    name: "Singapore",
    color: "rgba(255, 158, 118, 1)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [103.58, 1.18], [104.02, 1.18], [104.02, 1.45], [103.58, 1.45], [103.58, 1.18]
      ]]
    }
  },
  {
    name: "Australia",
    color: "rgba(255, 106, 82, 0.98)",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [113, -22], [114, -35], [124, -39], [136, -39], [147, -35], [153, -28], [151, -18], [141, -11], [128, -12], [118, -16], [113, -22]
      ]]
    }
  }
];

let maskCache = null;

function buildLandMask() {
  if (maskCache) return maskCache;
  const W = 720;
  const H = 360;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  for (const poly of CONTINENTS) {
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const [lng, lat] = poly[i];
      const x = (lng + 180) * (W / 360);
      const y = (90 - lat) * (H / 180);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  for (const [lng, lat] of ISLANDS_BONUS) {
    const x = (lng + 180) * (W / 360);
    const y = (90 - lat) * (H / 180);
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  maskCache = { data: ctx.getImageData(0, 0, W, H).data, W, H };
  return maskCache;
}

function isLand(lat, lng) {
  const mask = buildLandMask();
  const x = Math.floor(((lng + 180) % 360) * (mask.W / 360));
  const y = Math.floor((90 - lat) * (mask.H / 180));
  const clamp = (v, mx) => Math.max(0, Math.min(mx - 1, v));
  let hits = 0;
  let total = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = clamp(x + dx, mask.W);
      const yy = clamp(y + dy, mask.H);
      total++;
      if (mask.data[(yy * mask.W + xx) * 4] > 128) hits++;
    }
  }
  return hits * 2 >= total;
}

function pointInPolygon(lng, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function classifyContinent(lat, lng) {
  for (const continent of CONTINENT_GROUPS) {
    for (const polygonIndex of continent.polygonIndexes) {
      if (pointInPolygon(lng, lat, CONTINENTS[polygonIndex])) return continent;
    }
  }
  if (lat < -10 && lng > 110) return CONTINENT_GROUPS.find((x) => x.key === "oceania");
  if (lat > 0 && lng > 20) return CONTINENT_GROUPS.find((x) => x.key === "asia");
  if (lat > 0 && lng < -30) return CONTINENT_GROUPS.find((x) => x.key === "north-america");
  if (lat < 15 && lng < -30) return CONTINENT_GROUPS.find((x) => x.key === "south-america");
  return CONTINENT_GROUPS.find((x) => x.key === "europe");
}

function classifyCountryBlock(lat, lng) {
  for (const country of COUNTRY_BLOCKS) {
    if (
      lat >= country.latMin && lat <= country.latMax
      && lng >= country.lngMin && lng <= country.lngMax
    ) {
      return country;
    }
  }
  return null;
}

function generateLandPoints(baseN, landExtraRatio) {
  const base = fiboSpherePoints(baseN);
  const landPts = [];
  for (const p of base) {
    if (isLand(p.lat, p.lng)) landPts.push(p);
  }
  const extraN = Math.round(baseN * landExtraRatio);
  let tries = 0;
  const maxTries = extraN * 18;
  const extra = [];
  while (extra.length < extraN && tries < maxTries) {
    tries++;
    const u = Math.random();
    const v = Math.random();
    const lat = Math.acos(2 * v - 1) * 180 / Math.PI - 90;
    const lng = 2 * Math.PI * u * 180 / Math.PI - 180;
    if (isLand(lat, lng)) extra.push({ lat, lng });
  }
  const all = landPts.concat(extra);
  const rand = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return all.map((p, i) => ({
    ...p,
    size: 0.45 + rand(i + 7) * 0.72,
    tint: rand(i + 13),
    continent: classifyContinent(p.lat, p.lng),
    countryBlock: classifyCountryBlock(p.lat, p.lng)
  }));
}

function createTelemetryRing(radius, color, opacity, rotation) {
  const segments = 320;
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const idx = i * 3;
    positions[idx] = Math.cos(t) * radius;
    positions[idx + 1] = Math.sin(t) * radius;
    positions[idx + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const ring = new THREE.LineLoop(geometry, material);
  ring.rotation.set(rotation.x, rotation.y, rotation.z);
  return ring;
}

function buildTelemetryAccents(globeRadius) {
  const group = new THREE.Group();

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(globeRadius * 1.1, globeRadius * 1.18, 160),
    new THREE.MeshBasicMaterial({
      color: props.ringColor,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  group.add(
    createTelemetryRing(globeRadius * 1.035, props.ringColor, 0.40, {
      x: Math.PI / 2,
      y: 0.12,
      z: 0
    })
  );
  group.add(
    createTelemetryRing(globeRadius * 1.085, props.highlightColor, 0.26, {
      x: 1.18,
      y: 0.65,
      z: 0.35
    })
  );
  group.add(
    createTelemetryRing(globeRadius * 1.135, props.ringColor, 0.18, {
      x: 0.48,
      y: 0.22,
      z: 0.88
    })
  );

  return group;
}

function darkenRgba(color, alpha = 0.42) {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return color;
  const parts = match[1].split(",").map((x) => x.trim());
  const r = Math.max(0, Math.round(Number(parts[0]) * 0.48));
  const g = Math.max(0, Math.round(Number(parts[1]) * 0.48));
  const b = Math.max(0, Math.round(Number(parts[2]) * 0.48));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildPolygonLayers() {
  const continentLayers = CONTINENT_GROUPS.map((continent) => {
    const polygons = continent.polygonIndexes.map((index) => [CONTINENTS[index]]);
    return {
      name: continent.name,
      geometry: polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons },
      capColor: continent.color,
      sideColor: darkenRgba(continent.color, 0.36),
      strokeColor: "rgba(255,255,255,0.10)",
      altitude: 0.004
    };
  });

  const countryLayers = COUNTRY_POLYGONS.map((country) => ({
    name: country.name,
    geometry: country.geometry,
    capColor: country.color,
    sideColor: darkenRgba(country.color, 0.72),
    strokeColor: "rgba(255, 236, 232, 0.42)",
    altitude: country.name === "Singapore" || country.name === "Netherlands" ? 0.012 : 0.009
  }));

  return continentLayers.concat(countryLayers);
}

function initGlobe() {
  if (!wrapRef.value) return;
  const el = wrapRef.value;
  const w = props.size;
  const h = props.size;
  const world = new Globe(el, { animateIn: false })
    .width(w)
    .height(h)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor(props.atmosphereColor)
    .atmosphereAltitude(props.atmosphereAltitude)
    .showGlobe(true)
    .showGraticules(false)
    .globeImageUrl(null)
    .bumpImageUrl(null)
    .enablePointerInteraction(false);

  const scene = world.scene();
  const renderer = world.renderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const globeMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(props.globeColor),
    emissive: new THREE.Color(props.globeEmissive),
    emissiveIntensity: 0.12,
    shininess: 18,
    specular: new THREE.Color(props.globeSpecular),
    transparent: true,
    opacity: 0.98,
    depthWrite: true
  });
  world.globeMaterial(globeMat);

  const ambient = new THREE.AmbientLight(0x8b8f99, 0.22);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xf3f1ed, 0.88);
  sun.position.set(4.5, 2.6, 5).normalize();
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xff4338, 0.52);
  rim.position.set(-5, 0, -4.5).normalize();
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x301012, 0.22);
  fill.position.set(-1, -4, 3.5).normalize();
  scene.add(fill);

  const globeRadius = world.getGlobeRadius();
  world
    .pointsData([])
    .polygonsData(buildPolygonLayers())
    .polygonGeoJsonGeometry("geometry")
    .polygonCapColor("capColor")
    .polygonSideColor("sideColor")
    .polygonStrokeColor("strokeColor")
    .polygonAltitude("altitude")
    .polygonCapCurvatureResolution(2)
    .polygonsTransitionDuration(0);

  scene.add(buildTelemetryAccents(globeRadius));

  const initLat = 14;
  world.pointOfView({
    lat: initLat,
    lng: 262,
    altitude: 2.35
  });

  try {
    const controls = world.controls();
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.enableDamping = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = props.rotateSpeed * 60 * 0.22;
  } catch (e) { /* noop */ }

  globeInstance = world;
}

onMounted(() => {
  nextTick(() => initGlobe());
});

onBeforeUnmount(() => {
  if (globeInstance) {
    try {
      const scene = globeInstance.scene();
      if (scene && scene.traverse) {
        scene.traverse((obj) => {
          if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) if (m && m.dispose) m.dispose();
          }
        });
      }
      const r = globeInstance.renderer();
      if (r && r.dispose) r.dispose();
    } catch (e) { /* noop */ }
    globeInstance = null;
  }
});
</script>

<style scoped>
.globe-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.globe-wrap :deep(canvas) {
  display: block;
  border-radius: 50%;
}
</style>
