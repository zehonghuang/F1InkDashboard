<template>
  <div class="page">
    <HeaderBar :showNav="true" />
    <div class="container globe-page">
      <section class="card hero-card">
        <div class="hero-topline">
          <div class="hero-kicker">F1 GLOBAL TELEMETRY</div>
          <div class="hero-state">LIVE FEED</div>
        </div>
        <div class="session-title hero-title">
          <div class="session-title-main">Race Control Globe</div>
          <div class="session-title-sub">用黑红碳纤维质感强化赛历热点区域，并支持鼠标拖拽查看全球赛道网络。</div>
        </div>

        <div class="hero-grid">
          <div class="globe-panel">
            <div class="globe-panel-sheen"></div>
            <div class="globe-panel-frame frame-top"></div>
            <div class="globe-panel-frame frame-bottom"></div>
            <div class="globe-caption">Trackside Network</div>
            <DotGlobe
              :size="390"
              :dotCount="1700"
              :landExtraRatio="0.38"
              :rotateSpeed="0.0036"
              atmosphereColor="#a61218"
              globeColor="#050607"
              globeEmissive="#140204"
              globeSpecular="#ffb4aa"
              ringColor="#ff3b30"
              highlightColor="#fff1ee"
            />
            <div class="globe-callout callout-left">
              <span class="callout-label">Sector Sync</span>
              <span class="callout-value">99.2%</span>
            </div>
            <div class="globe-callout callout-right">
              <span class="callout-label">Latency</span>
              <span class="callout-value">14 ms</span>
            </div>
            <div class="globe-callout callout-bottom">
              <span class="callout-label">Live Mesh</span>
              <span class="callout-value">24 circuits</span>
            </div>
          </div>

          <div class="side-panel">
            <div class="metric-grid">
              <div v-for="item in stats" :key="item.label" class="metric-card">
                <div class="metric-label">{{ item.label }}</div>
                <div class="metric-value">{{ item.value }}</div>
                <div class="metric-sub">{{ item.sub }}</div>
              </div>
            </div>

            <div class="rank-panel">
              <div class="panel-header">
                <div class="panel-title">Hot Regions</div>
                <div class="panel-tag">Race Week</div>
              </div>
              <ul class="country-list">
                <li v-for="c in countries" :key="c.name" class="country-row">
                  <div class="country-rank">P{{ c.rank }}</div>
                  <div class="country-main">
                    <div class="country-name">{{ c.name }}</div>
                    <div class="country-meta">{{ c.code }} · {{ c.note }}</div>
                  </div>
                  <div class="country-bar-track">
                    <div class="country-bar-fill" :style="{ width: c.pct + '%' }" />
                  </div>
                  <div class="country-value">{{ c.value }}</div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section class="lower-grid">
        <div class="card support-card">
          <div class="support-topline">
            <div class="panel-title">Relay View</div>
            <div class="panel-tag">Backup Feed</div>
          </div>
          <div class="support-body">
            <DotGlobe
              :size="220"
              :dotCount="980"
              :landExtraRatio="0.32"
              :rotateSpeed="0.0052"
              atmosphereColor="#861016"
              globeColor="#050608"
              globeEmissive="#110204"
              globeSpecular="#ff9b8d"
              ringColor="#ff5a44"
              highlightColor="#ffe7e2"
            />
            <div class="support-text">
              <div class="support-title">Regional Backup Mesh</div>
              <div class="support-copy">用次级信道模拟赛道到控制台的备用链路，颜色保持红橙白的赛事氛围。</div>
              <div class="signal-list">
                <div class="signal-row"><span>Marshal Uplink</span><strong>Stable</strong></div>
                <div class="signal-row"><span>Timing Bus</span><strong>14.8 ms</strong></div>
                <div class="signal-row"><span>Broadcast Sync</span><strong>Green</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card support-card">
          <div class="support-topline">
            <div class="panel-title">Pulse Matrix</div>
            <div class="panel-tag">HUD</div>
          </div>
          <div class="pulse-grid">
            <div v-for="item in pulses" :key="item.label" class="pulse-card">
              <div class="pulse-label">{{ item.label }}</div>
              <div class="pulse-value">{{ item.value }}</div>
              <div class="pulse-trend" :class="item.tone">{{ item.trend }}</div>
            </div>
          </div>
          <div class="legend-row">
            <span class="legend-chip chip-red">Primary circuit</span>
            <span class="legend-chip chip-amber">Relay path</span>
            <span class="legend-chip chip-white">Broadcast mirror</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import HeaderBar from "../widgets/HeaderBar.vue";
import DotGlobe from "../components/DotGlobe.vue";

const rawCountries = [
  { name: "United Kingdom", code: "SIL", note: "Broadcast control", value: 128 },
  { name: "Italy", code: "MON", note: "Trackside uplink", value: 102 },
  { name: "United States", code: "MIA", note: "Fan telemetry", value: 87 },
  { name: "Netherlands", code: "ZAN", note: "Timing mirror", value: 71 },
  { name: "Japan", code: "SUZ", note: "Overnight sync", value: 58 },
  { name: "Singapore", code: "SGP", note: "Night race feed", value: 44 },
  { name: "Australia", code: "MEL", note: "Morning relay", value: 39 },
  { name: "Canada", code: "MON", note: "Marshal channel", value: 33 }
];

const stats = [
  { label: "Linked Circuits", value: "24", sub: "calendar ready" },
  { label: "Global Pulses", value: "1.28M", sub: "last 60 min" },
  { label: "Sync Delta", value: "14 ms", sub: "edge to control" },
  { label: "Red Flag Risk", value: "Low", sub: "network stable" }
];

const pulses = [
  { label: "Sector 1", value: "98.7%", trend: "+0.6% sync", tone: "tone-up" },
  { label: "Sector 2", value: "96.4%", trend: "relay load", tone: "tone-warn" },
  { label: "Sector 3", value: "99.1%", trend: "clean feed", tone: "tone-up" },
  { label: "Pit Wall", value: "12 ms", trend: "round trip", tone: "tone-neutral" }
];

const max = Math.max(...rawCountries.map(c => c.value));
const countries = rawCountries.map((country, index) => ({
  ...country,
  rank: index + 1,
  pct: Math.round((country.value / max) * 100)
}));
</script>

<style scoped>
.globe-page {
  padding-top: 8px;
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
.support-topline,
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.hero-topline {
  margin-bottom: 16px;
}

.hero-kicker,
.panel-tag,
.hero-state,
.globe-caption {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 11px;
}

.hero-kicker,
.panel-title,
.globe-caption {
  color: rgba(255, 255, 255, 0.72);
}

.hero-state,
.panel-tag {
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

.hero-grid {
  display: grid;
  grid-template-columns: minmax(360px, 430px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.globe-panel {
  position: relative;
  min-height: 470px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.05), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
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

.callout-label,
.country-meta,
.metric-sub,
.support-copy,
.pulse-trend {
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
}

.callout-value,
.metric-value,
.country-value,
.pulse-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.side-panel {
  display: grid;
  gap: 16px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.metric-card,
.rank-panel,
.support-card,
.pulse-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
}

.metric-card {
  padding: 14px 16px;
}

.metric-label,
.pulse-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.48);
  margin-bottom: 10px;
}

.metric-value {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 8px;
}

.rank-panel,
.support-card {
  padding: 16px;
}

.country-list {
  list-style: none;
  margin: 0;
  padding: 12px 0 0;
}

.country-row {
  display: grid;
  grid-template-columns: 42px minmax(120px, 1.2fr) minmax(120px, 1fr) 56px;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.country-row:last-child {
  border-bottom: none;
}

.country-rank {
  font-size: 13px;
  font-weight: 700;
  color: #ff8f86;
}

.country-main {
  min-width: 0;
}

.country-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
}

.country-bar-track {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.country-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #7a0c10, #ff3b30 55%, #ffd2ca);
  border-radius: 999px;
  transition: width 400ms ease;
  box-shadow: 0 0 16px rgba(255, 91, 87, 0.45);
}

.country-value {
  text-align: right;
  font-size: 14px;
  color: #ffffff;
}

.lower-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 18px;
}

.support-card {
  padding: 16px;
}

.support-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 18px;
  align-items: center;
  margin-top: 14px;
}

.support-text {
  display: grid;
  gap: 10px;
}

.support-title {
  font-size: 24px;
  font-weight: 700;
}

.signal-list {
  display: grid;
  gap: 10px;
  margin-top: 6px;
}

.signal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.signal-row strong {
  color: #ffffff;
}

.pulse-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.pulse-card {
  padding: 14px 16px;
}

.pulse-value {
  font-size: 30px;
  margin-bottom: 8px;
}

.tone-up {
  color: #7df0aa;
}

.tone-warn {
  color: #ffb15a;
}

.tone-neutral {
  color: rgba(255, 255, 255, 0.64);
}

.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.chip-red::before,
.chip-amber::before,
.chip-white::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.chip-red::before {
  background: #ff4d4f;
}

.chip-amber::before {
  background: #ffb15a;
}

.chip-white::before {
  background: #fff2ef;
}

@media (max-width: 900px) {
  .hero-grid,
  .support-body,
  .lower-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid,
  .pulse-grid {
    grid-template-columns: 1fr 1fr;
  }

  .globe-panel {
    min-height: 430px;
  }
}

@media (max-width: 560px) {
  .hero-card {
    padding: 18px 16px 16px;
  }

  .hero-title :deep(.session-title-main) {
    font-size: 30px;
  }

  .metric-grid,
  .pulse-grid {
    grid-template-columns: 1fr;
  }

  .country-row {
    grid-template-columns: 34px 1fr;
    gap: 10px;
    align-items: start;
  }

  .country-bar-track,
  .country-value {
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
