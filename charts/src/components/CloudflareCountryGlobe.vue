<template>
  <div
    class="cf-country-globe"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <div ref="canvasHostRef" class="cf-country-globe__canvas-host"></div>
    <div class="cf-country-globe__tone cf-country-globe__tone--core"></div>
    <div class="cf-country-globe__tone cf-country-globe__tone--shell"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { geoCentroid, geoEquirectangular, geoPath } from "d3-geo";
import atlas110m from "world-atlas/countries-110m.json";
import { feature } from "topojson-client";

const props = defineProps({
  size: { type: Number, default: 283 },
  activeCode: { type: String, default: "" },
  selectedCode: { type: String, default: "" },
  items: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["hover-country", "select-country"]);
const canvasHostRef = ref(null);

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let landMesh = null;
let frameId = 0;
let texture = null;
let countriesGeo = null;
let globeGroup = null;
let hitMap = null;
let currentFeatures = [];
let currentCountryIndex = null;
let currentItems = [];
let currentHoveredCode = "";
let pointerDownPoint = null;
let movedSincePointerDown = false;
let cleanupCanvasListeners = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const ISO_NUMERIC_BY_ALPHA2 = {
  AT: "040",
  BR: "076",
  CA: "124",
  CH: "756",
  CN: "156",
  DE: "276",
  FI: "246",
  FR: "250",
  GB: "826",
  HK: "344",
  HR: "191",
  IE: "372",
  JP: "392",
  NL: "528",
  SE: "752",
  SG: "702",
  UA: "804",
  US: "840"
};
const ISO_ALPHA2_BY_NUMERIC = Object.fromEntries(
  Object.entries(ISO_NUMERIC_BY_ALPHA2).map(([alpha2, numeric]) => [numeric, alpha2])
);

const BASE_LAND_FILLS = ["#171013", "#211217", "#2c151b", "#381920"];
const HIGHLIGHT_FILLS = ["#651816", "#86120f", "#a90d09", "#c80904", "#e10600", "#ff3b30", "#ffc1b6"];

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      code: String(item.code || "").toUpperCase(),
      name: String(item.name || ""),
      value: Number(item.value || 0)
    }))
    .filter((item) => item.code && Number.isFinite(item.value));
}

function withAlpha(hex, alpha) {
  const [r, g, b] = parseColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseColor(color) {
  if (typeof color !== "string") return [0, 0, 0];
  if (color.startsWith("rgb")) {
    const values = color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
    return [values[0] || 0, values[1] || 0, values[2] || 0];
  }
  const raw = color.replace("#", "");
  const normalized = raw.length === 3
    ? raw.split("").map((part) => part + part).join("")
    : raw;
  return [
    parseInt(normalized.slice(0, 2), 16) || 0,
    parseInt(normalized.slice(2, 4), 16) || 0,
    parseInt(normalized.slice(4, 6), 16) || 0
  ];
}

function interpolatePalette(t) {
  return interpolateStops(HIGHLIGHT_FILLS, t);
}

function interpolateStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(stops.length - 1, index + 1);
  const localT = scaled - index;
  const [fromR, fromG, fromB] = parseColor(stops[index]);
  const [toR, toG, toB] = parseColor(stops[nextIndex]);
  const r = Math.round(fromR + (toR - fromR) * localT);
  const g = Math.round(fromG + (toG - fromG) * localT);
  const b = Math.round(fromB + (toB - fromB) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

function colorWithAlpha(color, alpha) {
  const [r, g, b] = parseColor(color);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function baseLandColor(featureObject) {
  const [lon, lat] = geoCentroid(featureObject);
  const latMix = (lat + 60) / 150;
  const lonMix = (lon + 180) / 360;
  const t = Math.max(0, Math.min(1, latMix * 0.68 + lonMix * 0.32));
  return interpolateStops(BASE_LAND_FILLS, t);
}

function fillFeatureGradient(ctx, path, featureObject, colors, angle = "diagonal") {
  const bounds = path.bounds(featureObject);
  const [[x0, y0], [x1, y1]] = bounds;
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;

  let gradient;
  if (angle === "vertical") {
    gradient = ctx.createLinearGradient(x0, y0, x0, y1);
  } else {
    gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  }

  const lastIndex = Math.max(1, colors.length - 1);
  colors.forEach((color, index) => {
    gradient.addColorStop(index / lastIndex, color);
  });

  ctx.save();
  ctx.beginPath();
  path(featureObject);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  ctx.restore();
}

function featureId(featureObject) {
  return String(featureObject?.id || "");
}

function loadCountriesGeo() {
  if (countriesGeo) return countriesGeo;
  countriesGeo = {
    type: "FeatureCollection",
    features: feature(atlas110m, atlas110m.objects.countries).features.filter((country) => featureId(country) !== "010")
  };
  return countriesGeo;
}

function buildCountryIndex(features) {
  const index = new Map();
  features.forEach((feature) => {
    index.set(featureId(feature), feature);
  });
  return index;
}

function normalizeCode(code) {
  return String(code || "").toUpperCase();
}

function activeFeatureCode() {
  return normalizeCode(props.activeCode || props.selectedCode);
}

function resolveLocation(code, countryIndex, valueMap) {
  const feature = countryIndex.get(ISO_NUMERIC_BY_ALPHA2[String(code).toUpperCase()]);
  if (!feature) return null;
  const [lon, lat] = geoCentroid(feature);
  return {
    lat,
    lon,
    name: String(code).toUpperCase(),
    value: valueMap.get(String(code).toUpperCase()) || 0
  };
}

function getLongitude(code, countryIndex) {
  const location = resolveLocation(code, countryIndex, new Map());
  return location ? location.lon : null;
}

function computeInitialLongitude(items, countryIndex, valueMap) {
  const resolved = items
    .map((item) => resolveLocation(item.code, countryIndex, valueMap))
    .filter(Boolean);

  if (!resolved.length) return 110;

  let sumX = 0;
  let sumY = 0;
  resolved.forEach((item) => {
    const radians = THREE.MathUtils.degToRad(item.lon);
    const weight = Math.max(1, item.value);
    sumX += Math.cos(radians) * weight;
    sumY += Math.sin(radians) * weight;
  });

  return THREE.MathUtils.radToDeg(Math.atan2(sumY, sumX));
}

function highlightFeature(ctx, path, featureObject, mode = "hover") {
  if (!featureObject) return;
  const isSelected = mode === "selected";
  const fillAlpha = isSelected ? 0.56 : 0.38;
  const strokeAlpha = isSelected ? 0.96 : 0.88;
  const strokeWidth = isSelected ? 1.42 : 1.18;
  fillFeatureGradient(
    ctx,
    path,
    featureObject,
    [
      colorWithAlpha("#ff8a75", fillAlpha * 0.52),
      colorWithAlpha("#e10600", fillAlpha),
      colorWithAlpha("#520705", fillAlpha * 0.9)
    ],
    "diagonal"
  );
  ctx.save();
  ctx.beginPath();
  path(featureObject);
  ctx.strokeStyle = withAlpha("#e10600", strokeAlpha);
  ctx.lineWidth = strokeWidth;
  ctx.stroke();
  ctx.restore();
}

function generateTexture(items, features, countryIndex, activeCodeValue = "", selectedCodeValue = "") {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const projection = geoEquirectangular().fitSize([width, height], {
    type: "FeatureCollection",
    features
  });
  const path = geoPath(projection, ctx);
  const normalizedItems = normalizeItems(items);
  const activeCode = normalizeCode(activeCodeValue);
  const selectedCode = normalizeCode(selectedCodeValue);
  const values = normalizedItems.map((item) => item.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const span = Math.max(1, maxValue - minValue);
  ctx.clearRect(0, 0, width, height);

  features.forEach((feature) => {
    const base = baseLandColor(feature);
    const lighter = interpolateStops(["#302125", base], 0.2);
    const deeper = interpolateStops([base, "#0a090b"], 0.84);
    fillFeatureGradient(
      ctx,
      path,
      feature,
      [
        colorWithAlpha(lighter, 0.12),
        colorWithAlpha(base, 0.22),
        colorWithAlpha(deeper, 0.34)
      ],
      "vertical"
    );
  });

  normalizedItems
    .slice()
    .sort((left, right) => left.value - right.value)
    .forEach((item) => {
      const feature = countryIndex.get(ISO_NUMERIC_BY_ALPHA2[item.code]);
      if (!feature) return;
      const t = Math.pow((item.value - minValue) / span, 0.8);
      const light = interpolateStops(["#741714", interpolatePalette(t)], 0.18);
      const main = interpolatePalette(t);
      const deep = interpolateStops([main, "#220606"], 0.8);
      const lightAlpha = 0.18 + t * 0.08;
      const mainAlpha = 0.34 + t * 0.14;
      const deepAlpha = 0.5 + t * 0.16;
      fillFeatureGradient(
        ctx,
        path,
        feature,
        [
          colorWithAlpha(light, lightAlpha),
          colorWithAlpha(main, mainAlpha),
          colorWithAlpha(deep, deepAlpha)
        ],
        "diagonal"
      );
    });

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha("#6e3337", 0.28);
  ctx.lineWidth = 0.88;
  features.forEach((feature) => {
    ctx.beginPath();
    path(feature);
    ctx.stroke();
  });
  ctx.restore();

  normalizedItems.forEach((item) => {
    const feature = countryIndex.get(ISO_NUMERIC_BY_ALPHA2[item.code]);
    if (!feature) return;
    ctx.beginPath();
    path(feature);
    ctx.strokeStyle = withAlpha("#e10600", 0.82);
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  if (activeCode) {
    highlightFeature(ctx, path, countryIndex.get(ISO_NUMERIC_BY_ALPHA2[activeCode]), "hover");
  }
  if (selectedCode && selectedCode !== activeCode) {
    highlightFeature(ctx, path, countryIndex.get(ISO_NUMERIC_BY_ALPHA2[selectedCode]), "selected");
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function buildHitMap(features) {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const projection = geoEquirectangular().fitSize([width, height], {
    type: "FeatureCollection",
    features
  });
  const path = geoPath(projection, ctx);
  const codeByColorKey = new Map();

  features.forEach((featureObject, index) => {
    const colorIndex = index + 1;
    const r = (colorIndex >> 16) & 255;
    const g = (colorIndex >> 8) & 255;
    const b = colorIndex & 255;
    const numericId = featureId(featureObject);
    const alpha2 = ISO_ALPHA2_BY_NUMERIC[numericId];
    if (!alpha2) return;
    ctx.beginPath();
    path(featureObject);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();
    codeByColorKey.set(colorIndex, alpha2);
  });

  return { canvas, ctx, codeByColorKey };
}

function updateTexture() {
  if (!landMesh || !currentCountryIndex || !currentFeatures.length) return;
  const nextTexture = generateTexture(
    currentItems,
    currentFeatures,
    currentCountryIndex,
    props.activeCode,
    props.selectedCode
  );
  const material = landMesh.material;
  const previousTexture = material.map;
  material.map = nextTexture;
  material.needsUpdate = true;
  texture = nextTexture;
  previousTexture?.dispose();
}

function setCanvasCursor(rendererInstance) {
  const canvas = rendererInstance?.domElement;
  if (!canvas) return;
  canvas.className = "cf-country-globe-canvas";
}

function sampleCountryCodeAtEvent(event) {
  const canvas = renderer?.domElement;
  if (!canvas || !camera || !landMesh || !hitMap?.ctx || !hitMap?.canvas) return "";
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return "";

  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(landMesh, false);
  const hit = intersections[0];
  const uv = hit?.uv;
  if (!uv) return "";

  const x = Math.max(0, Math.min(hitMap.canvas.width - 1, Math.floor(uv.x * hitMap.canvas.width)));
  const y = Math.max(0, Math.min(hitMap.canvas.height - 1, Math.floor((1 - uv.y) * hitMap.canvas.height)));
  const [r, g, b] = hitMap.ctx.getImageData(x, y, 1, 1).data;
  return hitMap.codeByColorKey.get((r << 16) | (g << 8) | b) || "";
}

function emitHoverCountry(nextCode) {
  const normalizedCode = normalizeCode(nextCode);
  if (normalizedCode === currentHoveredCode) return;
  currentHoveredCode = normalizedCode;
  emit("hover-country", normalizedCode);
}

function bindCanvasInteractions() {
  const canvas = renderer?.domElement;
  if (!canvas) return;

  const handlePointerDown = (event) => {
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    movedSincePointerDown = false;
    canvas.classList.add("is-dragging");
  };

  const handlePointerMove = (event) => {
    if (pointerDownPoint) {
      const deltaX = event.clientX - pointerDownPoint.x;
      const deltaY = event.clientY - pointerDownPoint.y;
      if ((deltaX * deltaX) + (deltaY * deltaY) > 16) {
        movedSincePointerDown = true;
      }
    }
    emitHoverCountry(sampleCountryCodeAtEvent(event));
  };

  const handlePointerLeave = () => {
    emitHoverCountry("");
    canvas.classList.remove("is-dragging");
    pointerDownPoint = null;
    movedSincePointerDown = false;
  };

  const handlePointerUp = () => {
    canvas.classList.remove("is-dragging");
    pointerDownPoint = null;
  };

  const handleClick = (event) => {
    if (movedSincePointerDown) return;
    emit("select-country", sampleCountryCodeAtEvent(event));
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  canvas.addEventListener("click", handleClick);
  window.addEventListener("pointerup", handlePointerUp);

  cleanupCanvasListeners = () => {
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerleave", handlePointerLeave);
    canvas.removeEventListener("click", handleClick);
    window.removeEventListener("pointerup", handlePointerUp);
  };
}

async function setupGlobe() {
  const host = canvasHostRef.value;
  if (!host) return;

  const geoJson = loadCountriesGeo();
  const features = geoJson.features || [];
  const countryIndex = buildCountryIndex(features);
  const normalizedItems = normalizeItems(props.items);
  currentFeatures = features;
  currentCountryIndex = countryIndex;
  currentItems = normalizedItems;
  const valueMap = new Map(normalizedItems.map((item) => [item.code, item.value]));
  const initialLongitude = computeInitialLongitude(normalizedItems, countryIndex, valueMap);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.03, 5.95);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(props.size, props.size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.replaceChildren(renderer.domElement);
  setCanvasCursor(renderer);
  bindCanvasInteractions();

  globeGroup = new THREE.Group();
  globeGroup.rotation.x = THREE.MathUtils.degToRad(-12.5);
  globeGroup.rotation.y = THREE.MathUtils.degToRad(-(initialLongitude - 16));
  scene.add(globeGroup);

  texture = generateTexture(normalizedItems, features, countryIndex, props.activeCode, props.selectedCode);
  hitMap = buildHitMap(features);

  const landMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    map: texture,
    transparent: true,
    depthWrite: false
  });
  landMesh = new THREE.Mesh(new THREE.SphereGeometry(1.623, 96, 96), landMaterial);
  globeGroup.add(landMesh);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.48;
  controls.minPolarAngle = THREE.MathUtils.degToRad(58);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(122);

  const render = () => {
    frameId = window.requestAnimationFrame(render);
    controls.update();
    renderer.render(scene, camera);
  };
  render();
}

function disposeGlobe() {
  if (frameId) {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
  }

  cleanupCanvasListeners?.();
  cleanupCanvasListeners = null;
  controls?.dispose();
  controls = null;

  if (landMesh) {
    landMesh.geometry.dispose();
    landMesh.material.dispose();
    landMesh = null;
  }

  if (globeGroup) {
    scene?.remove(globeGroup);
    globeGroup = null;
  }

  texture?.dispose();
  texture = null;
  hitMap = null;
  currentFeatures = [];
  currentCountryIndex = null;
  currentItems = [];
  currentHoveredCode = "";
  pointerDownPoint = null;
  movedSincePointerDown = false;

  renderer?.dispose();
  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  renderer = null;
  scene = null;
  camera = null;
}

onMounted(() => {
  setupGlobe();
});

watch(
  () => props.items,
  async () => {
    disposeGlobe();
    await setupGlobe();
  },
  { deep: true }
);

watch(
  () => [props.activeCode, props.selectedCode],
  () => {
    updateTexture();
  }
);

onBeforeUnmount(() => {
  disposeGlobe();
});
</script>

<style scoped>
.cf-country-globe {
  position: relative;
  overflow: hidden;
  border-radius: 50%;
  background: transparent;
}

.cf-country-globe__canvas-host {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: 50%;
  overflow: hidden;
}

.cf-country-globe__tone {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
}

.cf-country-globe__tone--core {
  z-index: 1;
  inset: 12px;
  background:
    radial-gradient(circle at 50% 68%,
      rgba(10, 9, 11, 0.98) 0 30%,
      rgba(19, 15, 18, 0.96) 46%,
      rgba(39, 19, 24, 0.9) 63%,
      rgba(78, 24, 28, 0.5) 80%,
      rgba(255, 102, 81, 0.1) 92%,
      rgba(255, 255, 255, 0) 100%),
    radial-gradient(ellipse at 50% 14%,
      rgba(255, 175, 158, 0.08) 0,
      rgba(138, 34, 39, 0.08) 24%,
      rgba(255, 255, 255, 0) 54%),
    radial-gradient(ellipse at 50% 118%,
      rgba(101, 22, 26, 0.18) 0,
      rgba(39, 11, 14, 0.12) 24%,
      rgba(255, 255, 255, 0) 48%),
    linear-gradient(180deg,
      rgba(255, 214, 201, 0.05) 0%,
      rgba(255, 255, 255, 0) 22%,
      rgba(255, 255, 255, 0) 68%,
      rgba(94, 20, 24, 0.1) 100%);
  box-shadow:
    inset 0 -28px 40px rgba(8, 6, 8, 0.42),
    inset 0 14px 20px rgba(255, 176, 160, 0.04);
}

.cf-country-globe__tone--shell {
  z-index: 3;
  inset: 0;
  background:
    radial-gradient(circle at 50% 45%,
      rgba(255, 255, 255, 0) 0 88.35%,
      rgba(255, 223, 214, 0.72) 88.85%,
      rgba(240, 184, 171, 0.56) 89.38%,
      rgba(255, 255, 255, 0) 89.92%),
    radial-gradient(circle at 50% 45%,
      rgba(255, 255, 255, 0) 0 90.2%,
      rgba(196, 53, 50, 0.32) 90.58%,
      rgba(92, 23, 27, 0.42) 91.04%,
      rgba(255, 255, 255, 0) 91.54%),
    radial-gradient(circle at 50% 45%,
      rgba(255, 255, 255, 0) 0 91.8%,
      rgba(255, 255, 255, 0) 100%);
}

.cf-country-globe :deep(.cf-country-globe-canvas) {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.cf-country-globe :deep(.cf-country-globe-canvas.is-dragging) {
  cursor: grabbing;
}
</style>
