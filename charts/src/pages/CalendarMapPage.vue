<template>
  <div class="page calendar-map-shell">
    <HeaderBar :showNav="true" />
    <div class="container calendar-map-page">
      <section class="calendar-hero">
        <div class="calendar-topline">
          <div class="calendar-kicker">F1 CALENDAR ATLAS</div>
          <div class="calendar-state">SEASON HOSTS</div>
        </div>

        <div class="session-title calendar-title">
          <div class="session-title-main">F1 赛历国家图</div>
          <div class="session-title-sub">上方球体展示全年主办国家，下方信息框展示当前国家对应的赛道卡与赛道线图。</div>
        </div>

        <div class="calendar-metrics">
          <div v-for="item in summaryCards" :key="item.label" class="calendar-metric">
            <div class="calendar-metric-label">{{ item.label }}</div>
            <div class="calendar-metric-value">{{ item.value }}</div>
            <div class="calendar-metric-sub">{{ item.sub }}</div>
          </div>
        </div>

        <div class="calendar-main">
          <div class="broadcast-stage">
            <div class="calendar-panel-header">
              <div>
                <div class="panel-eyebrow">Broadcast Cluster</div>
                <div class="panel-heading">Season Host Board</div>
              </div>
              <div class="panel-chip">{{ primaryRegionLabel }}</div>
            </div>

            <div class="broadcast-stage-inner">
              <svg class="broadcast-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <g v-for="node in broadcastNodes" :key="node.country.code">
                  <line
                    class="broadcast-line"
                    :class="{ 'is-active': node.country.code === activeCountryCode, 'is-selected': node.country.code === selectedCountryCode }"
                    :x1="node.dot.x"
                    :y1="node.dot.y"
                    :x2="broadcastHub.x"
                    :y2="broadcastHub.y"
                  />
                  <line
                    class="broadcast-line"
                    :class="{ 'is-active': node.country.code === activeCountryCode, 'is-selected': node.country.code === selectedCountryCode }"
                    :x1="broadcastHub.x"
                    :y1="broadcastHub.y"
                    :x2="node.panel.x"
                    :y2="node.panel.y"
                  />
                </g>
              </svg>

              <div class="broadcast-globe-zone">
                <CountryGlobe
                  class="broadcast-globe"
                  :size="440"
                  :highlighted-countries="globeHighlights"
                  :active-code="activeCountryCode"
                  :selected-code="selectedCountryCode"
                  @hover-country="handleHoverCountry"
                  @select-country="handleSelectCountry"
                />
                <div class="broadcast-hub" :style="{ left: `${broadcastHub.x}%`, top: `${broadcastHub.y}%` }"></div>
                <button
                  v-for="node in broadcastNodes"
                  :key="`dot-${node.country.code}`"
                  type="button"
                  class="broadcast-dot"
                  :class="{ 'is-active': node.country.code === activeCountryCode, 'is-selected': node.country.code === selectedCountryCode }"
                  :style="{ left: `${node.dot.x}%`, top: `${node.dot.y}%` }"
                  @mouseenter="handleHoverCountry(node.country.code)"
                  @mouseleave="handleHoverCountry('')"
                  @click="handleSelectCountry(node.country.code)"
                >
                  <span></span>
                </button>
              </div>

              <div class="broadcast-panel">
                <div class="broadcast-panel-frame"></div>
                <div class="broadcast-panel-list">
                  <button
                    v-for="node in broadcastNodes"
                    :key="`row-${node.country.code}`"
                    type="button"
                    class="broadcast-country-row"
                    :class="{ 'is-active': node.country.code === activeCountryCode, 'is-selected': node.country.code === selectedCountryCode }"
                    @mouseenter="handleHoverCountry(node.country.code)"
                    @mouseleave="handleHoverCountry('')"
                    @click="handleSelectCountry(node.country.code)"
                  >
                    {{ node.country.name.toUpperCase() }}
                  </button>
                </div>
              </div>
            </div>

            <div class="calendar-callouts">
              <div class="calendar-callout">
                <div class="callout-label">Focus Country</div>
                <div class="callout-value">{{ focusedCountry.name }}</div>
              </div>
              <div class="calendar-callout">
                <div class="callout-label">Hosted Circuits</div>
                <div class="callout-value">{{ focusedCountry.circuits.length }}</div>
              </div>
              <div class="calendar-callout">
                <div class="callout-label">Primary Venue</div>
                <div class="callout-value">{{ focusedCountry.circuits[0].circuit }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="track-info-card">
        <div class="calendar-panel-header">
          <div>
            <div class="panel-eyebrow">Circuit Box</div>
            <div class="panel-heading">{{ focusedCountry.name }}</div>
          </div>
          <div class="panel-chip">{{ focusedCountry.circuits.length }} Track<span v-if="focusedCountry.circuits.length > 1">s</span></div>
        </div>

        <div class="track-country-summary">
          <div class="track-summary-copy">
            <div class="track-summary-label">Region</div>
            <div class="track-summary-value">{{ focusedCountry.region }}</div>
          </div>
          <div class="track-summary-copy">
            <div class="track-summary-label">Focus</div>
            <div class="track-summary-value">{{ focusedCountry.summary }}</div>
          </div>
          <div class="track-summary-copy">
            <div class="track-summary-label">Venue Count</div>
            <div class="track-summary-value">{{ focusedCountry.circuits.length }}</div>
          </div>
        </div>

        <div class="track-grid">
          <article v-for="circuit in focusedCountry.circuits" :key="circuit.id" class="track-card">
            <div class="track-card-head">
              <div>
                <div class="track-grand-prix">{{ circuit.grandPrix }}</div>
                <div class="track-circuit">{{ circuit.circuit }}</div>
              </div>
              <div class="track-type">{{ circuit.type }}</div>
            </div>

            <div class="track-map">
              <svg viewBox="0 0 160 100" aria-hidden="true">
                <defs>
                  <linearGradient :id="`${circuit.id}-gradient`" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#e10600" />
                    <stop offset="100%" stop-color="#ffb8aa" />
                  </linearGradient>
                </defs>
                <path
                  :d="circuit.path"
                  stroke="rgba(255,255,255,0.14)"
                  stroke-width="16"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
                <path
                  :d="circuit.path"
                  :stroke="`url(#${circuit.id}-gradient)`"
                  stroke-width="8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
            </div>

            <div class="track-meta-grid">
              <div class="track-meta-item">
                <span class="track-meta-label">City</span>
                <strong>{{ circuit.city }}</strong>
              </div>
              <div class="track-meta-item">
                <span class="track-meta-label">Profile</span>
                <strong>{{ circuit.profile }}</strong>
              </div>
              <div class="track-meta-item track-meta-item--wide">
                <span class="track-meta-label">Signature</span>
                <strong>{{ circuit.signature }}</strong>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import HeaderBar from "../widgets/HeaderBar.vue";
import CountryGlobe from "../components/CountryGlobe.vue";

const calendarCircuits = [
  {
    id: "au-albert-park",
    code: "AU",
    country: "Australia",
    region: "Oceania",
    grandPrix: "Australian Grand Prix",
    circuit: "Albert Park Circuit",
    city: "Melbourne",
    type: "Semi-street",
    profile: "Fast stop-start",
    signature: "Lakeside direction changes with quick braking zones.",
    path: "M20 74 C18 42,42 16,74 18 C102 20,132 34,136 54 C138 74,110 82,88 78 C66 74,54 90,34 86 C22 84,24 84,20 74"
  },
  {
    id: "cn-shanghai",
    code: "CN",
    country: "China",
    region: "Asia",
    grandPrix: "Chinese Grand Prix",
    circuit: "Shanghai International Circuit",
    city: "Shanghai",
    type: "Permanent",
    profile: "Long-radius balance",
    signature: "Huge opening spiral and one of the longest back straights.",
    path: "M22 60 C16 30,40 18,64 24 C90 28,118 30,136 42 C146 52,144 70,126 76 C100 82,92 62,76 58 C60 54,54 72,34 74 C18 76,16 72,22 60"
  },
  {
    id: "jp-suzuka",
    code: "JP",
    country: "Japan",
    region: "Asia",
    grandPrix: "Japanese Grand Prix",
    circuit: "Suzuka Circuit",
    city: "Suzuka",
    type: "Permanent",
    profile: "High-speed flow",
    signature: "Figure-eight style crossover with relentless medium-speed rhythm.",
    path: "M28 70 C18 48,30 22,58 24 C86 26,114 22,124 40 C132 58,114 72,86 70 C66 68,58 48,76 42 C94 38,120 54,114 78 C106 94,78 92,58 86 C42 80,34 86,28 70"
  },
  {
    id: "bh-sakhir",
    code: "BH",
    country: "Bahrain",
    region: "Middle East",
    grandPrix: "Bahrain Grand Prix",
    circuit: "Bahrain International Circuit",
    city: "Sakhir",
    type: "Permanent",
    profile: "Traction-heavy",
    signature: "Heavy braking, long exits and wide desert run-off.",
    path: "M24 74 C18 48,28 24,58 18 C86 18,126 28,132 48 C136 64,120 72,94 74 C70 76,68 88,48 88 C28 88,22 84,24 74"
  },
  {
    id: "sa-jeddah",
    code: "SA",
    country: "Saudi Arabia",
    region: "Middle East",
    grandPrix: "Saudi Arabian Grand Prix",
    circuit: "Jeddah Corniche Circuit",
    city: "Jeddah",
    type: "Street",
    profile: "Ultra-fast walls",
    signature: "Long full-throttle arcs between close barriers.",
    path: "M20 80 C30 58,18 42,30 26 C46 14,70 12,98 20 C124 28,142 44,136 60 C130 76,106 88,80 82 C58 76,46 90,34 90 C22 90,14 88,20 80"
  },
  {
    id: "us-miami",
    code: "US",
    country: "United States",
    region: "North America",
    grandPrix: "Miami Grand Prix",
    circuit: "Miami International Autodrome",
    city: "Miami",
    type: "Street-inspired",
    profile: "Medium-speed bursts",
    signature: "Tight infield complexes joined by quick open sections.",
    path: "M24 68 C16 42,34 20,60 20 C88 20,126 24,132 42 C138 60,126 76,102 74 C84 74,70 58,56 58 C40 58,36 78,24 68"
  },
  {
    id: "it-imola",
    code: "IT",
    country: "Italy",
    region: "Europe",
    grandPrix: "Emilia-Romagna Grand Prix",
    circuit: "Imola",
    city: "Imola",
    type: "Permanent",
    profile: "Old-school flow",
    signature: "Narrow ribbon with braking compressions and rapid switchbacks.",
    path: "M24 74 C18 52,24 24,54 20 C84 18,124 28,132 48 C138 66,126 82,98 82 C74 82,62 62,68 50 C74 40,58 32,42 36 C26 42,28 80,24 74"
  },
  {
    id: "mc-monte-carlo",
    code: "MC",
    country: "Monaco",
    region: "Europe",
    grandPrix: "Monaco Grand Prix",
    circuit: "Circuit de Monaco",
    city: "Monte Carlo",
    type: "Street",
    profile: "Low-speed precision",
    signature: "Hairpins, barriers and elevation inside the harbor grid.",
    path: "M28 76 C18 60,24 38,40 30 C56 20,86 20,104 34 C112 42,108 56,90 58 C72 60,72 76,86 82 C104 88,122 76,126 58 C130 40,118 24,92 22 C62 20,40 38,28 76"
  },
  {
    id: "es-barcelona",
    code: "ES",
    country: "Spain",
    region: "Europe",
    grandPrix: "Spanish Grand Prix",
    circuit: "Circuit de Barcelona-Catalunya",
    city: "Barcelona",
    type: "Permanent",
    profile: "Balanced aero test",
    signature: "Long final sector and a broad mix of speed ranges.",
    path: "M22 72 C18 44,34 20,64 18 C92 16,124 22,136 42 C146 62,130 76,100 78 C80 80,72 56,58 54 C40 52,34 82,22 72"
  },
  {
    id: "ca-gilles-villeneuve",
    code: "CA",
    country: "Canada",
    region: "North America",
    grandPrix: "Canadian Grand Prix",
    circuit: "Circuit Gilles Villeneuve",
    city: "Montreal",
    type: "Semi-permanent",
    profile: "Brake-rotate-accelerate",
    signature: "Island layout punctuated by chicanes and wall exits.",
    path: "M20 70 C20 34,48 18,82 18 C110 18,138 30,134 52 C130 74,96 82,70 72 C48 60,46 86,24 84 C16 84,16 76,20 70"
  },
  {
    id: "it-monza",
    code: "IT",
    country: "Italy",
    region: "Europe",
    grandPrix: "Italian Grand Prix",
    circuit: "Monza",
    city: "Monza",
    type: "Permanent",
    profile: "Low-downforce",
    signature: "Long straights, heavy chicanes and classic parkland corners.",
    path: "M22 74 C18 46,30 20,58 18 C88 16,130 20,138 40 C146 60,130 76,96 80 C64 82,54 62,58 46 C60 32,46 28,30 36 C18 44,18 82,22 74"
  },
  {
    id: "at-red-bull-ring",
    code: "AT",
    country: "Austria",
    region: "Europe",
    grandPrix: "Austrian Grand Prix",
    circuit: "Red Bull Ring",
    city: "Spielberg",
    type: "Permanent",
    profile: "Short power loop",
    signature: "Three hard climbs and a sweeping downhill finish.",
    path: "M26 78 C18 52,28 26,58 18 C92 18,124 32,126 58 C128 82,92 86,70 70 C56 58,54 90,30 88 C22 88,20 84,26 78"
  },
  {
    id: "gb-silverstone",
    code: "GB",
    country: "United Kingdom",
    region: "Europe",
    grandPrix: "British Grand Prix",
    circuit: "Silverstone",
    city: "Silverstone",
    type: "Permanent",
    profile: "High-speed commitment",
    signature: "Fast direction chains with long lateral load phases.",
    path: "M18 66 C14 40,32 22,58 20 C82 18,116 14,132 32 C148 50,144 70,118 72 C98 74,92 54,76 50 C56 46,54 78,34 82 C20 84,14 76,18 66"
  },
  {
    id: "hu-hungaroring",
    code: "HU",
    country: "Hungary",
    region: "Europe",
    grandPrix: "Hungarian Grand Prix",
    circuit: "Hungaroring",
    city: "Budapest",
    type: "Permanent",
    profile: "Twisty technical",
    signature: "Continuous medium-speed corners and little straight relief.",
    path: "M24 76 C16 54,30 24,58 20 C88 16,124 24,130 48 C136 72,112 82,90 78 C72 76,68 56,52 50 C38 46,34 82,24 76"
  },
  {
    id: "be-spa",
    code: "BE",
    country: "Belgium",
    region: "Europe",
    grandPrix: "Belgian Grand Prix",
    circuit: "Spa-Francorchamps",
    city: "Stavelot",
    type: "Permanent",
    profile: "Long altitude lap",
    signature: "Forest sweepers, compressions and dramatic uphill rhythm.",
    path: "M20 80 C16 52,34 22,62 18 C94 14,132 24,140 50 C146 76,112 88,86 78 C64 64,58 42,72 36 C90 30,118 50,110 82 C98 96,34 92,20 80"
  },
  {
    id: "nl-zandvoort",
    code: "NL",
    country: "Netherlands",
    region: "Europe",
    grandPrix: "Dutch Grand Prix",
    circuit: "Circuit Zandvoort",
    city: "Zandvoort",
    type: "Permanent",
    profile: "Banked momentum",
    signature: "Compact dunes circuit with loaded cambers and quick transitions.",
    path: "M24 74 C18 52,32 24,56 20 C88 18,120 28,126 50 C132 72,110 84,82 78 C60 68,62 48,74 42 C88 40,92 60,80 72 C64 82,30 86,24 74"
  },
  {
    id: "az-baku",
    code: "AZ",
    country: "Azerbaijan",
    region: "Europe / Asia",
    grandPrix: "Azerbaijan Grand Prix",
    circuit: "Baku City Circuit",
    city: "Baku",
    type: "Street",
    profile: "Long straight + castle section",
    signature: "Ultra-long waterfront run broken by an ultra-tight old town climb.",
    path: "M24 82 C20 50,34 24,60 20 C88 16,134 18,138 42 C142 66,120 82,96 80 C70 80,66 56,74 42 C82 30,70 20,50 24 C30 30,22 88,24 82"
  },
  {
    id: "sg-marina-bay",
    code: "SG",
    country: "Singapore",
    region: "Asia",
    grandPrix: "Singapore Grand Prix",
    circuit: "Marina Bay Street Circuit",
    city: "Singapore",
    type: "Street",
    profile: "Night street test",
    signature: "Dense corner count, walls and constant traction resets.",
    path: "M22 74 C18 50,32 22,60 18 C92 14,130 20,138 42 C146 62,126 78,98 76 C72 76,68 58,78 48 C90 40,82 28,60 24 C36 22,24 54,22 74"
  },
  {
    id: "us-cota",
    code: "US",
    country: "United States",
    region: "North America",
    grandPrix: "United States Grand Prix",
    circuit: "Circuit of The Americas",
    city: "Austin",
    type: "Permanent",
    profile: "Big braking + esses",
    signature: "Climbing first sector linked to heavy stop zones and wide exits.",
    path: "M18 74 C16 50,28 20,56 20 C88 20,126 18,138 38 C148 58,132 78,98 82 C70 86,66 58,76 52 C92 42,84 26,56 28 C28 30,16 90,18 74"
  },
  {
    id: "mx-hermanos-rodriguez",
    code: "MX",
    country: "Mexico",
    region: "North America",
    grandPrix: "Mexico City Grand Prix",
    circuit: "Autodromo Hermanos Rodriguez",
    city: "Mexico City",
    type: "Permanent",
    profile: "Altitude low-drag",
    signature: "Long straights into a stadium finish at high altitude.",
    path: "M22 76 C18 48,30 18,62 18 C96 18,130 26,136 46 C142 66,124 82,96 78 C72 74,66 58,58 50 C48 44,40 84,22 76"
  },
  {
    id: "us-las-vegas",
    code: "US",
    country: "United States",
    region: "North America",
    grandPrix: "Las Vegas Grand Prix",
    circuit: "Las Vegas Strip Circuit",
    city: "Las Vegas",
    type: "Street",
    profile: "Straight-line speed",
    signature: "Huge boulevard blasts linked by slow night-time complexes.",
    path: "M18 78 L54 78 L54 24 L116 24 L116 46 L142 46 L142 76 L88 76 L88 58 L38 58 L38 78 L18 78"
  },
  {
    id: "br-interlagos",
    code: "BR",
    country: "Brazil",
    region: "South America",
    grandPrix: "Sao Paulo Grand Prix",
    circuit: "Interlagos",
    city: "Sao Paulo",
    type: "Permanent",
    profile: "Short undulation",
    signature: "Compact lap with elevation swings and aggressive kerb sections.",
    path: "M24 76 C18 52,30 24,58 20 C86 18,122 28,130 50 C136 72,114 82,86 78 C70 74,64 58,56 48 C50 40,40 88,24 76"
  },
  {
    id: "qa-lusail",
    code: "QA",
    country: "Qatar",
    region: "Middle East",
    grandPrix: "Qatar Grand Prix",
    circuit: "Lusail International Circuit",
    city: "Lusail",
    type: "Permanent",
    profile: "Fast medium-speed",
    signature: "Long outer arcs with repeated flowing traction zones.",
    path: "M20 72 C18 48,34 20,66 18 C100 18,132 28,138 50 C144 72,120 82,92 80 C68 78,62 56,66 48 C78 34,52 30,30 40 C20 48,18 82,20 72"
  },
  {
    id: "ae-yas-marina",
    code: "AE",
    country: "United Arab Emirates",
    region: "Middle East",
    grandPrix: "Abu Dhabi Grand Prix",
    circuit: "Yas Marina Circuit",
    city: "Abu Dhabi",
    type: "Permanent",
    profile: "Marina complex",
    signature: "Long straights around a tight final-sector sequence by the harbor.",
    path: "M20 78 C16 48,34 22,64 18 C98 16,132 28,138 50 C144 72,124 84,92 82 C70 82,62 60,72 48 C88 38,80 26,56 24 C34 24,18 56,20 78"
  }
];

const defaultCountryCode = "AU";
const hoveredCountryCode = ref("");
const selectedCountryCode = ref(defaultCountryCode);
const REGION_LAYOUTS = {
  Asia: {
    hub: { x: 36, y: 61 },
    dots: [
      { x: 16, y: 34 },
      { x: 27, y: 24 },
      { x: 23, y: 50 },
      { x: 20, y: 78 }
    ]
  },
  Oceania: {
    hub: { x: 34, y: 65 },
    dots: [
      { x: 24, y: 83 },
      { x: 18, y: 56 },
      { x: 30, y: 32 },
      { x: 22, y: 20 }
    ]
  },
  Europe: {
    hub: { x: 34, y: 46 },
    dots: [
      { x: 18, y: 22 },
      { x: 26, y: 28 },
      { x: 30, y: 40 },
      { x: 20, y: 52 }
    ]
  },
  "North America": {
    hub: { x: 30, y: 50 },
    dots: [
      { x: 14, y: 30 },
      { x: 18, y: 42 },
      { x: 16, y: 58 },
      { x: 22, y: 72 }
    ]
  },
  "South America": {
    hub: { x: 28, y: 58 },
    dots: [
      { x: 18, y: 56 },
      { x: 18, y: 72 },
      { x: 24, y: 36 },
      { x: 14, y: 28 }
    ]
  },
  "Middle East": {
    hub: { x: 36, y: 53 },
    dots: [
      { x: 24, y: 34 },
      { x: 30, y: 46 },
      { x: 26, y: 64 },
      { x: 20, y: 76 }
    ]
  },
  Default: {
    hub: { x: 33, y: 54 },
    dots: [
      { x: 18, y: 28 },
      { x: 24, y: 42 },
      { x: 22, y: 58 },
      { x: 18, y: 74 }
    ]
  }
};

const countryGroups = computed(() => {
  const grouped = new Map();
  calendarCircuits.forEach((circuit) => {
    const existing = grouped.get(circuit.code);
    if (existing) {
      existing.circuits.push(circuit);
      existing.highlightValue += 1;
      return;
    }
    grouped.set(circuit.code, {
      code: circuit.code,
      name: circuit.country,
      region: circuit.region,
      summary: circuit.signature,
      circuits: [circuit],
      highlightValue: 1
    });
  });
  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
});

const countryByCode = computed(() => new Map(countryGroups.value.map((country) => [country.code, country])));
const activeCountryCode = computed(() => hoveredCountryCode.value || selectedCountryCode.value || defaultCountryCode);
const focusedCountry = computed(() => countryByCode.value.get(activeCountryCode.value) || countryGroups.value[0]);
const globeHighlights = computed(() =>
  countryGroups.value.map((country) => ({
    code: country.code,
    value: country.highlightValue
  }))
);
const primaryRegionLabel = computed(() => primaryRegion(focusedCountry.value.region));
const broadcastHub = computed(() => (REGION_LAYOUTS[primaryRegionLabel.value] || REGION_LAYOUTS.Default).hub);
const focusCountries = computed(() => {
  const focus = focusedCountry.value;
  const region = primaryRegion(focus.region);
  const sameRegion = countryGroups.value.filter((country) => country.code !== focus.code && primaryRegion(country.region) === region);
  const fallback = countryGroups.value.filter((country) => country.code !== focus.code && primaryRegion(country.region) !== region);
  return [focus, ...sameRegion, ...fallback].slice(0, 4);
});
const broadcastNodes = computed(() => {
  const layout = REGION_LAYOUTS[primaryRegionLabel.value] || REGION_LAYOUTS.Default;
  const panelY = [27, 42, 57, 72];
  return focusCountries.value.map((country, index) => ({
    country,
    dot: layout.dots[index] || REGION_LAYOUTS.Default.dots[index],
    panel: { x: 76, y: panelY[index] || 72 }
  }));
});

const summaryCards = computed(() => [
  {
    label: "Host Countries",
    value: String(countryGroups.value.length),
    sub: "season-wide map coverage"
  },
  {
    label: "Season Circuits",
    value: String(calendarCircuits.length),
    sub: "cards rendered below"
  },
  {
    label: "Focus Country",
    value: focusedCountry.value.name,
    sub: "current selected host"
  },
  {
    label: "Focused Tracks",
    value: String(focusedCountry.value.circuits.length),
    sub: "venues in the lower box"
  }
]);

function normalizeCode(code) {
  return String(code || "").toUpperCase();
}

function primaryRegion(region) {
  return String(region || "").split("/")[0].trim();
}

function handleHoverCountry(code) {
  hoveredCountryCode.value = normalizeCode(code);
}

function handleSelectCountry(code) {
  const nextCode = normalizeCode(code);
  if (!nextCode) return;
  selectedCountryCode.value = selectedCountryCode.value === nextCode ? defaultCountryCode : nextCode;
}
</script>

<style scoped>
.calendar-map-shell {
  background:
    radial-gradient(circle at top center, rgba(225, 6, 0, 0.14), transparent 26%),
    linear-gradient(180deg, #090a0d 0%, #040507 48%, #020203 100%);
}

.calendar-map-page {
  padding-top: 8px;
  padding-bottom: 30px;
}

.calendar-hero,
.track-info-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background:
    radial-gradient(circle at top right, rgba(255, 76, 76, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(14, 15, 20, 0.98), rgba(4, 5, 9, 0.98));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
}

.calendar-hero {
  padding: 22px;
}

.calendar-topline,
.calendar-panel-header,
.track-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.calendar-topline {
  margin-bottom: 16px;
}

.calendar-kicker,
.calendar-state,
.panel-eyebrow,
.panel-chip,
.track-type {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 11px;
}

.calendar-kicker,
.panel-eyebrow {
  color: rgba(255, 255, 255, 0.72);
}

.calendar-state,
.panel-chip,
.track-type {
  color: #ff7d73;
  padding: 6px 10px;
  border: 1px solid rgba(255, 91, 87, 0.28);
  border-radius: 999px;
  background: rgba(255, 91, 87, 0.08);
}

.calendar-title {
  margin: 0 0 18px;
}

.calendar-title :deep(.session-title-main) {
  font-size: 38px;
  letter-spacing: 0.02em;
}

.calendar-title :deep(.session-title-sub) {
  max-width: 760px;
  color: rgba(255, 255, 255, 0.58);
}

.calendar-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.calendar-metric,
.broadcast-stage,
.track-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 18px;
}

.calendar-metric {
  padding: 14px 16px;
}

.calendar-metric-label,
.callout-label,
.track-meta-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.58);
}

.calendar-metric-label {
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.calendar-metric-value,
.callout-value,
.track-summary-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.calendar-metric-value {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 8px;
}

.calendar-metric-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.58);
}

.calendar-main {
  display: block;
}

.broadcast-stage,
.track-info-card {
  padding: 16px;
}

.panel-heading,
.track-grand-prix {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
}

.broadcast-stage {
  padding: 16px;
}

.broadcast-stage-inner {
  position: relative;
  min-height: 540px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at 22% 16%, rgba(255, 255, 255, 0.14), transparent 24%),
    radial-gradient(circle at 18% 82%, rgba(255, 255, 255, 0.08), transparent 18%),
    linear-gradient(90deg, rgba(0, 14, 38, 0.94), rgba(2, 6, 20, 0.96) 62%, rgba(4, 4, 10, 0.98));
}

.broadcast-globe-zone {
  position: absolute;
  inset: 0 auto 0 0;
  width: 58%;
  display: grid;
  place-items: center;
}

.broadcast-globe {
  --country-globe-land-1: #285e1f;
  --country-globe-land-2: #3c7e25;
  --country-globe-land-3: #5a982f;
  --country-globe-land-4: #7aaf3f;
  --country-globe-highlight-1: #d88917;
  --country-globe-highlight-2: #e29b17;
  --country-globe-highlight-3: #edaa10;
  --country-globe-highlight-4: #f7b806;
  --country-globe-highlight-5: #e10600;
  --country-globe-highlight-6: #ff5d46;
  --country-globe-highlight-7: #ffd0c8;
  --country-globe-land-blend-light: #94c06c;
  --country-globe-land-blend-dark: #1f4b1f;
  --country-globe-stroke-base: #9dd6ff;
  --country-globe-stroke-highlight: #e10600;
  --country-globe-highlight-blend-light: #ffd06b;
  --country-globe-highlight-blend-dark: #8b5a04;
  --country-globe-active-fill-1: #ffb18e;
  --country-globe-active-fill-2: #e10600;
  --country-globe-active-fill-3: #6a0807;
  --country-globe-core-gradient:
    radial-gradient(circle at 50% 48%,
      rgba(14, 109, 191, 0.92) 0 34%,
      rgba(11, 92, 170, 0.96) 52%,
      rgba(7, 64, 128, 0.86) 72%,
      rgba(155, 212, 255, 0.32) 90%,
      rgba(255, 255, 255, 0) 100%),
    radial-gradient(circle at 42% 18%,
      rgba(182, 235, 255, 0.26) 0,
      rgba(182, 235, 255, 0.08) 28%,
      rgba(255, 255, 255, 0) 58%),
    linear-gradient(180deg,
      rgba(214, 245, 255, 0.08) 0%,
      rgba(255, 255, 255, 0) 22%,
      rgba(0, 18, 50, 0.1) 100%);
  --country-globe-core-shadow:
    inset 0 -36px 54px rgba(0, 26, 56, 0.34),
    inset 0 14px 20px rgba(255, 255, 255, 0.08);
  --country-globe-shell-gradient:
    radial-gradient(circle at 50% 45%,
      rgba(255, 255, 255, 0) 0 88.1%,
      rgba(207, 235, 255, 0.82) 88.72%,
      rgba(155, 214, 255, 0.54) 89.35%,
      rgba(255, 255, 255, 0) 89.92%),
    radial-gradient(circle at 50% 45%,
      rgba(255, 255, 255, 0) 0 90.15%,
      rgba(255, 255, 255, 0.16) 90.5%,
      rgba(142, 203, 255, 0.16) 91.02%,
      rgba(255, 255, 255, 0) 91.56%);
  filter: drop-shadow(0 22px 30px rgba(0, 0, 0, 0.28));
}

.broadcast-lines {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.broadcast-line {
  stroke: rgba(255, 255, 255, 0.82);
  stroke-width: 0.5;
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.24));
}

.broadcast-line.is-active,
.broadcast-line.is-selected {
  stroke: rgba(255, 205, 198, 0.98);
  stroke-width: 0.65;
}

.broadcast-hub,
.broadcast-dot {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, -50%);
}

.broadcast-hub {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.18), 0 0 12px rgba(255, 255, 255, 0.46);
}

.broadcast-dot {
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.broadcast-dot span {
  display: block;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.72);
}

.broadcast-dot::after {
  content: "";
  position: absolute;
  inset: 7px;
  border-radius: 50%;
  background: #ffffff;
}

.broadcast-dot.is-active span,
.broadcast-dot.is-selected span {
  box-shadow: inset 0 0 0 2px rgba(255, 210, 203, 0.86);
}

.broadcast-dot.is-active::after,
.broadcast-dot.is-selected::after {
  background: #e10600;
}

.broadcast-panel {
  position: absolute;
  top: 16%;
  right: 5%;
  width: 34%;
  min-height: 300px;
  z-index: 2;
  padding: 18px 22px;
  border: 1px solid rgba(225, 6, 0, 0.46);
  background: linear-gradient(180deg, rgba(1, 3, 16, 0.96), rgba(3, 5, 24, 0.98));
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.26);
}

.broadcast-panel-frame {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 200, 192, 0.18);
  pointer-events: none;
}

.broadcast-panel-list {
  display: grid;
  gap: 16px;
}

.broadcast-country-row {
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.96);
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 900;
  line-height: 1.02;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
  font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-shadow: 0 2px 0 rgba(255, 255, 255, 0.08);
}

.broadcast-country-row.is-active,
.broadcast-country-row.is-selected {
  color: #e10600;
  text-shadow: 0 0 12px rgba(225, 6, 0, 0.24);
}

.calendar-callouts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.calendar-callout {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(8, 10, 16, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.callout-value {
  margin-top: 6px;
  font-size: 18px;
  color: #ffffff;
}

.track-circuit {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
}

.track-info-card {
  margin-top: 18px;
}

.track-country-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.track-summary-copy {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.track-summary-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.48);
}

.track-summary-value {
  margin-top: 10px;
  font-size: 20px;
  color: #ffffff;
}

.track-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.track-card {
  padding: 16px;
}

.track-circuit {
  margin-top: 4px;
}

.track-map {
  margin-top: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    radial-gradient(circle at top left, rgba(225, 6, 0, 0.09), transparent 44%),
    rgba(7, 9, 14, 0.84);
  padding: 14px;
}

.track-map svg {
  display: block;
  width: 100%;
  height: 180px;
}

.track-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.track-meta-item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.track-meta-item strong {
  color: #ffffff;
}

.track-meta-item--wide {
  grid-column: 1 / -1;
}

@media (max-width: 980px) {
  .track-grid {
    grid-template-columns: 1fr;
  }

  .broadcast-stage-inner {
    min-height: 760px;
  }

  .broadcast-globe-zone {
    position: relative;
    inset: auto;
    width: 100%;
    min-height: 360px;
  }

  .broadcast-panel {
    position: relative;
    top: auto;
    right: auto;
    width: auto;
    margin: 0 16px 18px;
  }

  .broadcast-lines,
  .broadcast-dot,
  .broadcast-hub {
    display: none;
  }
}

@media (max-width: 760px) {
  .calendar-metrics,
  .calendar-callouts,
  .track-country-summary {
    grid-template-columns: 1fr;
  }

  .calendar-title :deep(.session-title-main) {
    font-size: 30px;
  }

  .broadcast-country-row {
    font-size: 24px;
  }
}
</style>
