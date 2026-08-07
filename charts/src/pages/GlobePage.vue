<template>
  <div class="page">
    <HeaderBar :showNav="true" />
    <div class="container">
      <div class="card globe-card">
        <div class="card-title-row">
          <div class="card-title">Requests by Country</div>
          <div class="card-more">⋯</div>
        </div>
        <div class="globe-layout">
          <div class="globe-side">
            <DotGlobe :size="340" :dotCount="2200" :rotateSpeed="0.0032" />
          </div>
          <div class="list-side">
            <ul class="country-list">
              <li v-for="(c, i) in countries" :key="c.name" class="country-row">
                <div class="country-name">{{ c.name }}</div>
                <div class="country-bar-track">
                  <div class="country-bar-fill" :style="{ width: c.pct + '%' }" />
                </div>
                <div class="country-value">{{ c.value }}</div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="small-grid">
        <div class="card">
          <div class="card-subtitle">较小尺寸（260px）</div>
          <DotGlobe :size="260" :dotCount="1700" :rotateSpeed="0.005" />
        </div>
        <div class="card">
          <div class="card-subtitle">大尺寸（440px）</div>
          <DotGlobe :size="440" :dotCount="3000" :rotateSpeed="0.0022" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import HeaderBar from "../widgets/HeaderBar.vue";
import DotGlobe from "../components/DotGlobe.vue";

const countries = [
  { name: "China", value: 122 },
  { name: "United States", value: 59 },
  { name: "Netherlands", value: 37 },
  { name: "Germany", value: 33 },
  { name: "Luxembourg", value: 25 },
  { name: "Canada", value: 14 },
  { name: "France", value: 9 },
  { name: "Sweden", value: 4 },
  { name: "Finland", value: 3 },
  { name: "Australia", value: 3 },
  { name: "Japan", value: 2 },
  { name: "Singapore", value: 2 },
  { name: "Brazil", value: 1 },
  { name: "India", value: 1 }
];
const max = Math.max(...countries.map(c => c.value));
countries.forEach(c => (c.pct = Math.round((c.value / max) * 100)));
</script>

<style scoped>
.card {
  background: #ffffff;
  color: #111827;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 16px 18px 14px;
  margin-bottom: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #4b5563;
  letter-spacing: 0.2px;
}
.card-more {
  color: #6b7280;
  font-size: 18px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
  user-select: none;
}
.card-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
  padding: 0 6px;
}

.globe-card {
  padding: 16px 14px 14px 10px;
}
.globe-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 10px;
  align-items: stretch;
}
.globe-side {
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  padding-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.list-side {
  padding-left: 6px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 8px;
}
.list-side::-webkit-scrollbar {
  width: 8px;
}
.list-side::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 4px;
}
.list-side::-webkit-scrollbar-track {
  background: transparent;
}

.country-list {
  list-style: none;
  margin: 0;
  padding: 6px 4px 0;
}
.country-row {
  display: grid;
  grid-template-columns: 150px 1fr 52px;
  align-items: center;
  gap: 14px;
  padding: 10px 2px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}
.country-row:last-child {
  border-bottom: none;
}
.country-name {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
}
.country-bar-track {
  position: relative;
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}
.country-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #1d4ed8, #3b82f6);
  border-radius: 999px;
  transition: width 400ms ease;
}
.country-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 14px;
  color: #111827;
}

.small-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.small-grid .card {
  margin-bottom: 0;
}

@media (max-width: 900px) {
  .globe-layout {
    grid-template-columns: 1fr;
  }
  .globe-side {
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    padding-right: 0;
    padding-bottom: 10px;
  }
  .list-side {
    padding-left: 4px;
    padding-top: 8px;
  }
  .small-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .country-row {
    grid-template-columns: 110px 1fr 44px;
    gap: 10px;
  }
  .country-name {
    font-size: 13px;
  }
}
</style>
