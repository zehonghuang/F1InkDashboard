<template>
  <div class="page requests-shell">
    <div class="container requests-page">
      <section class="shell-head">
        <div>
          <div class="shell-breadcrumb">Analytics / Dashboards</div>
          <h1 class="page-title">Requests by Country</h1>
          <p class="page-copy">English traffic grouped by visitor country.</p>
        </div>
        <div class="range-pill">Last 24 hours</div>
      </section>

      <section class="cf-card">
        <div class="card-head">
          <div class="card-title-wrap">
            <div class="card-title">Requests by Country</div>
          </div>
          <button class="card-menu" type="button" aria-label="Chart actions">
            <span></span>
          </button>
        </div>

        <div class="card-body">
          <div class="globe-col">
            <div class="globe-frame">
              <CloudflareCountryGlobe :size="283" :items="globeItems" />
            </div>
          </div>

          <div class="rank-col">
            <div class="rank-scroll">
              <div v-for="item in countries" :key="item.code" class="rank-row">
                <div class="rank-name">{{ item.name }}</div>
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
      </section>

      <div class="summary-row">Total Requests {{ formattedTotal }}</div>
    </div>
  </div>
</template>

<script setup>
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

const countries = rawCountries.map((item) => ({
  ...item,
  pct: Math.max(1, Math.round((item.value / maxValue) * 100))
}));

const globeItems = countries.map(({ code, name, value }) => ({ code, name, value }));

const formattedTotal = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
}).format(totalValue);
</script>

<style scoped>
.requests-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(245, 248, 255, 0.95), rgba(238, 243, 252, 0.88) 30%, rgba(232, 238, 248, 0.96) 100%);
}

.requests-page {
  max-width: 700px;
  padding-top: 32px;
  padding-bottom: 56px;
}

.shell-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.shell-breadcrumb {
  margin-bottom: 8px;
  color: rgba(83, 92, 112, 0.72);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.page-title {
  margin: 0;
  color: #202939;
  font-size: 30px;
  line-height: 1.12;
  letter-spacing: -0.02em;
}

.page-copy {
  margin: 8px 0 0;
  color: rgba(81, 91, 108, 0.82);
  font-size: 13px;
  line-height: 1.45;
}

.range-pill {
  flex: none;
  margin-top: 2px;
  padding: 7px 12px;
  border: 1px solid rgba(176, 186, 204, 0.72);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #3a4355;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.cf-card {
  width: min(100%, 567px);
  background: #ffffff;
  border: 0.67px solid rgba(37, 39, 45, 0.1);
  border-radius: 20px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 2px;
}

.card-title-wrap {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.card-title {
  color: #525c6b;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.card-menu {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  position: relative;
}

.card-menu:hover {
  border-color: #d9e0eb;
  background: #f8fafc;
}

.card-menu span,
.card-menu span::before,
.card-menu span::after {
  position: absolute;
  left: 50%;
  width: 4px;
  height: 4px;
  background: rgba(57, 66, 82, 0.88);
  border-radius: 999px;
  transform: translateX(-50%);
  content: "";
}

.card-menu span {
  top: 11px;
}

.card-menu span::before {
  top: 6px;
}

.card-menu span::after {
  top: 12px;
}

.card-body {
  display: grid;
  grid-template-columns: 283px minmax(0, 1fr);
  min-height: 329px;
}

.globe-col {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 329px;
  padding: 23px 0;
}

.globe-frame {
  position: relative;
  width: 283px;
  height: 283px;
  overflow: hidden;
}

.rank-col {
  min-width: 0;
  overflow: hidden;
}

.rank-scroll {
  height: 329px;
  overflow-y: auto;
  padding: 4px 0 0;
}

.rank-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) 64px;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  padding: 6px 16px;
}

.rank-name {
  overflow: hidden;
  color: #243041;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rank-bar-wrap {
  display: flex;
  align-items: center;
}

.rank-bar-track {
  width: 100%;
  height: 4px;
  background: #e8edf5;
  border-radius: 999px;
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  min-width: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, #86a4ff 0%, #4f63ff 100%);
}

.rank-value {
  color: #3b4658;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.summary-row {
  margin-top: 12px;
  color: #4b5565;
  font-size: 12px;
}

@media (max-width: 560px) {
  .shell-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .card-body {
    grid-template-columns: 1fr;
  }

  .globe-col {
    min-height: 300px;
    padding: 16px 0 0;
  }

  .rank-scroll {
    height: auto;
    max-height: 420px;
  }
}

@media (max-width: 640px) {
  .page-title {
    font-size: 26px;
  }

  .cf-card {
    width: 100%;
  }

  .globe-col {
    padding: 8px 0 0;
  }

  .rank-row {
    grid-template-columns: minmax(0, 96px) minmax(0, 1fr) 44px;
    gap: 10px;
    padding: 3px 12px;
  }
}
</style>
