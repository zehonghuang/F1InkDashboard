<template>
  <div class="page requests-shell">
    <HeaderBar :showNav="true" />
    <div class="container requests-page">
      <section class="card hero-card">
        <div class="hero-topline">
          <div class="hero-kicker">F1 NETWORK INTEL</div>
          <div class="hero-state">ENGLISH FEED</div>
        </div>

        <div class="session-title hero-title">
          <div class="session-title-main">Requests by Country</div>
          <div class="session-title-sub">English traffic grouped by visitor country, reframed as a pit wall telemetry board.</div>
        </div>

        <div class="metric-grid">
          <div v-for="item in summaryCards" :key="item.label" class="metric-card">
            <div class="metric-label">{{ item.label }}</div>
            <div class="metric-value">{{ item.value }}</div>
            <div class="metric-sub">{{ item.sub }}</div>
          </div>
        </div>

        <div class="analytics-card">
          <div class="card-head">
            <div class="card-title-wrap">
              <div class="card-title">Trackside Distribution</div>
              <div class="card-subtitle">Live country ranking for English traffic</div>
            </div>
            <div class="range-pill">Last 24 Hours</div>
          </div>

          <div class="card-body">
            <div class="globe-col">
              <div class="globe-panel">
                <div class="globe-panel-sheen"></div>
                <div class="globe-panel-frame frame-top"></div>
                <div class="globe-panel-frame frame-bottom"></div>
                <div class="globe-caption">Global Traffic Mesh</div>
                <div class="globe-frame">
                  <CloudflareCountryGlobe :size="283" :items="globeItems" />
                </div>
                <div class="globe-callout callout-left">
                  <span class="callout-label">Leader</span>
                  <span class="callout-value">{{ topCountry.name }}</span>
                </div>
                <div class="globe-callout callout-right">
                  <span class="callout-label">Share</span>
                  <span class="callout-value">{{ leaderShare }}%</span>
                </div>
                <div class="globe-callout callout-bottom">
                  <span class="callout-label">Countries</span>
                  <span class="callout-value">{{ countries.length }}</span>
                </div>
              </div>
            </div>

            <div class="rank-col">
              <div class="rank-panel">
                <div class="panel-header">
                  <div class="panel-title">Country Order</div>
                  <div class="panel-tag">Race Window</div>
                </div>

                <div class="rank-scroll">
                  <div v-for="item in countries" :key="item.code" class="rank-row">
                    <div class="rank-position">P{{ item.rank }}</div>
                    <div class="rank-main">
                      <div class="rank-name">{{ item.name }}</div>
                      <div class="rank-meta">{{ item.code }} · English traffic</div>
                    </div>
                    <div class="rank-bar-wrap">
                      <div class="rank-bar-track">
                        <div class="rank-bar-fill" :style="{ width: item.pct + '%' }"></div>
                      </div>
                    </div>
                    <div class="rank-value">{{ item.value }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import HeaderBar from "../widgets/HeaderBar.vue";
import CloudflareCountryGlobe from "../components/CloudflareCountryGlobe.vue";

const rawCountries = [
  { code: "SG", name: "Singapore", value: 588 },
  { code: "CN", name: "China", value: 196 },
  { code: "NL", name: "Netherlands", value: 90 },
  { code: "US", name: "United States", value: 85 },
  { code: "CH", name: "Switzerland", value: 27 },
  { code: "FR", name: "France", value: 23 },
  { code: "HK", name: "Hong Kong", value: 19 },
  { code: "DE", name: "Germany", value: 13 },
  { code: "IE", name: "Ireland", value: 9 },
  { code: "FI", name: "Finland", value: 6 },
  { code: "CA", name: "Canada", value: 6 },
  { code: "UA", name: "Ukraine", value: 4 },
  { code: "HR", name: "Croatia", value: 3 },
  { code: "JP", name: "Japan", value: 1 },
  { code: "GB", name: "United Kingdom", value: 1 },
  { code: "AT", name: "Austria", value: 1 },
  { code: "BR", name: "Brazil", value: 1 },
  { code: "SE", name: "Sweden", value: 1 }
];

const maxValue = Math.max(...rawCountries.map((item) => item.value));
const totalValue = rawCountries.reduce((sum, item) => sum + item.value, 0);

const countries = rawCountries.map((item, index) => ({
  ...item,
  rank: index + 1,
  pct: Math.max(1, Math.round((item.value / maxValue) * 100))
}));

const globeItems = countries.map(({ code, name, value }) => ({ code, name, value }));
const topCountry = countries[0];
const leaderShare = Math.round((topCountry.value / totalValue) * 100);

const formattedTotal = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
}).format(totalValue);

const summaryCards = [
  { label: "Total Requests", value: formattedTotal, sub: "English feed volume" },
  { label: "Top Country", value: topCountry.code, sub: `${topCountry.name} leads the grid` },
  { label: "Leader Share", value: `${leaderShare}%`, sub: "of all tracked requests" },
  { label: "Countries Tracked", value: String(countries.length), sub: "active telemetry regions" }
];
</script>

<style scoped>
.requests-shell {
  background:
    radial-gradient(circle at top center, rgba(255, 76, 76, 0.12), transparent 28%),
    linear-gradient(180deg, #090a0d 0%, #040507 48%, #020203 100%);
}

.requests-page {
  padding-top: 8px;
  padding-bottom: 28px;
}

.card {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(255, 76, 76, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(14, 15, 20, 0.98), rgba(4, 5, 9, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
}

.hero-card {
  padding: 22px 22px 20px;
}

.hero-topline,
.card-head,
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero-topline {
  margin-bottom: 16px;
}

.hero-kicker,
.hero-state,
.panel-tag,
.globe-caption {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 11px;
}

.hero-kicker,
.panel-title,
.globe-caption,
.card-title {
  color: rgba(255, 255, 255, 0.72);
}

.hero-state,
.panel-tag,
.range-pill {
  color: #ff7d73;
  padding: 6px 10px;
  border: 1px solid rgba(255, 91, 87, 0.28);
  border-radius: 999px;
  background: rgba(255, 91, 87, 0.08);
}

.hero-title {
  margin: 0 0 18px;
}

.hero-title :deep(.session-title-main) {
  font-size: 38px;
  letter-spacing: 0.02em;
}

.hero-title :deep(.session-title-sub) {
  max-width: 760px;
  color: rgba(255, 255, 255, 0.58);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metric-card,
.analytics-card,
.rank-panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
}

.metric-card {
  padding: 14px 16px;
}

.metric-label,
.callout-label,
.rank-meta {
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
}

.metric-label {
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.metric-value,
.callout-value,
.rank-value,
.rank-position {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.metric-value {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 8px;
}

.metric-sub {
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
}

.analytics-card {
  padding: 16px;
}

.card-head {
  margin-bottom: 14px;
}

.card-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-title {
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.card-subtitle {
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
}

.card-body {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
}

.globe-col,
.rank-col {
  min-width: 0;
}

.globe-panel {
  position: relative;
  min-height: 372px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.05), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 28px 18px 22px;
}

.globe-panel-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(130deg, rgba(255, 255, 255, 0.08), transparent 35%, transparent 70%, rgba(255, 91, 87, 0.04));
  pointer-events: none;
}

.globe-panel-frame {
  position: absolute;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 91, 87, 0.55), transparent);
}

.frame-top {
  top: 18px;
}

.frame-bottom {
  bottom: 18px;
}

.globe-caption {
  position: absolute;
  top: 22px;
  left: 24px;
}

.globe-frame {
  position: relative;
  width: 283px;
  height: 283px;
  overflow: hidden;
}

.globe-callout {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: rgba(8, 10, 16, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  backdrop-filter: blur(8px);
}

.callout-left {
  left: 18px;
  top: 96px;
}

.callout-right {
  right: 18px;
  top: 136px;
}

.callout-bottom {
  bottom: 24px;
  right: 24px;
}

.rank-panel {
  height: 100%;
  padding: 16px;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
}

.rank-scroll {
  max-height: 340px;
  overflow-y: auto;
  padding-top: 12px;
}

.rank-row {
  display: grid;
  grid-template-columns: 42px minmax(120px, 1.2fr) minmax(120px, 1fr) 56px;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rank-row:last-child {
  border-bottom: none;
}

.rank-position {
  font-size: 13px;
  color: #ff8f86;
}

.rank-main {
  min-width: 0;
}

.rank-name {
  overflow: hidden;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.rank-bar-wrap {
  display: flex;
  align-items: center;
}

.rank-bar-track {
  position: relative;
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.rank-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, #7a0c10, #ff3b30 55%, #ffd2ca);
  box-shadow: 0 0 16px rgba(255, 91, 87, 0.45);
}

.rank-value {
  color: #ffffff;
  font-size: 14px;
  text-align: right;
}

@media (max-width: 900px) {
  .metric-grid,
  .card-body {
    grid-template-columns: 1fr 1fr;
  }

  .card-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .hero-card {
    padding: 18px 16px 16px;
  }

  .hero-title :deep(.session-title-main) {
    font-size: 30px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .rank-row {
    grid-template-columns: 34px 1fr;
    gap: 10px;
    align-items: start;
  }

  .rank-bar-wrap,
  .rank-value {
    grid-column: 2;
  }

  .globe-callout {
    padding: 8px 10px;
  }

  .callout-left,
  .callout-right,
  .callout-bottom {
    position: static;
    margin-top: 10px;
  }
}
</style>
