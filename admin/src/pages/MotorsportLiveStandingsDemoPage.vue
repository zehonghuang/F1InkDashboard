<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  fetchAdminMotorsportLiveStandings,
  type AdminMotorsportStandingRow,
} from '@/api/admin'
import {
  motorsportLiveStandingsSampleFetchedAtUTC,
  motorsportLiveStandingsSampleLiveTimingUrl,
  motorsportLiveStandingsSampleRows,
  motorsportLiveStandingsSampleSessionTitle,
  motorsportLiveStandingsSampleSourceUrl,
  motorsportLiveStandingsSampleStatus,
} from '@/mocks/motorsportLiveStandingsSample'

const defaultSourceUrl = motorsportLiveStandingsSampleSourceUrl

const sourceUrl = ref(defaultSourceUrl)
const loading = ref(false)
const error = ref('')
const fetchedAt = ref(motorsportLiveStandingsSampleFetchedAtUTC)
const status = ref(motorsportLiveStandingsSampleStatus)
const sessionTitle = ref(motorsportLiveStandingsSampleSessionTitle)
const liveTimingUrl = ref(motorsportLiveStandingsSampleLiveTimingUrl)
const rows = ref<AdminMotorsportStandingRow[]>(motorsportLiveStandingsSampleRows)
const dataMode = ref<'sample' | 'live'>('sample')

const topThree = computed(() => rows.value.slice(0, 3))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchAdminMotorsportLiveStandings({ sourceUrl: sourceUrl.value })
    rows.value = res.rows || []
    fetchedAt.value = res.fetched_at_utc || ''
    status.value = res.status || ''
    sessionTitle.value = res.session_title || ''
    liveTimingUrl.value = res.live_timing_url || ''
    dataMode.value = 'live'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function loadSample() {
  error.value = ''
  sourceUrl.value = motorsportLiveStandingsSampleSourceUrl
  rows.value = motorsportLiveStandingsSampleRows
  fetchedAt.value = motorsportLiveStandingsSampleFetchedAtUTC
  status.value = motorsportLiveStandingsSampleStatus
  sessionTitle.value = motorsportLiveStandingsSampleSessionTitle
  liveTimingUrl.value = motorsportLiveStandingsSampleLiveTimingUrl
  dataMode.value = 'sample'
}

function usePreset(url: string) {
  sourceUrl.value = url
  void load()
}

function formatStamp(value: string) {
  if (!value) return '--'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function teamColor(row: AdminMotorsportStandingRow) {
  return row.team_color || '#64748b'
}

function tyreDetails(row: AdminMotorsportStandingRow) {
  const parts: string[] = []
  if (row.tyre) parts.push(row.tyre)
  if (row.laps) parts.push(`${row.laps}L`)
  if (row.pit_count) parts.push(`${row.pit_count}Pit`)
  return parts.length ? parts : ['--']
}
</script>

<template>
  <div class="grid grid-cols-12 gap-4">
    <Card class="col-span-12">
      <template #title>Motorsport Live Standings Demo</template>
      <div class="text-sm text-zinc-700">
        先用已经抓下来的 Barcelona FP3 样本数据看 table 效果，需要时再切到线上抓取。
      </div>

      <div class="mt-4 grid grid-cols-12 gap-3 items-end">
        <div class="col-span-12 xl:col-span-8">
          <div class="mb-1 text-xs uppercase tracking-wide text-zinc-500">Source URL</div>
          <Input
            v-model="sourceUrl"
            placeholder="https://www.motorsport.com/f1/live-text/..."
            @on-enter="load"
          />
        </div>
        <div class="col-span-6 md:col-span-3 xl:col-span-2">
          <Button long type="primary" :loading="loading" @click="load">抓线上榜单</Button>
        </div>
        <div class="col-span-6 md:col-span-3 xl:col-span-2">
          <Button long @click="loadSample">恢复样本</Button>
        </div>
        <div class="col-span-12 xl:col-span-12">
          <a
            v-if="liveTimingUrl"
            class="text-xs text-sky-600 hover:text-sky-700"
            :href="liveTimingUrl"
            target="_blank"
            rel="noreferrer"
          >
            打开源榜单
          </a>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <Tag :color="dataMode === 'sample' ? 'warning' : 'success'">
          {{ dataMode === 'sample' ? '当前显示：抓取样本' : '当前显示：线上抓取' }}
        </Tag>
        <Button size="small" @click="usePreset(defaultSourceUrl)">Barcelona FP3</Button>
        <Button
          size="small"
          @click="usePreset('https://www.motorsport.com/f1/live-text/f1-barcelona-gp-live-commentary-and-updates-qualifying/1127045/')"
        >
          Barcelona Qualifying
        </Button>
      </div>

      <Alert v-if="error" show-icon type="error" class="mt-4">
        {{ error }}
      </Alert>
    </Card>

    <Card class="col-span-12 lg:col-span-4">
      <template #title>抓取状态</template>
      <div class="space-y-3 text-sm">
        <div class="flex items-center justify-between gap-3">
          <span class="text-zinc-500">Session</span>
          <span class="font-medium text-zinc-900">{{ sessionTitle || '--' }}</span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-zinc-500">Status</span>
          <Tag :color="status.toLowerCase() === 'live' ? 'success' : 'default'">{{ status || '--' }}</Tag>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-zinc-500">Rows</span>
          <span class="font-medium text-zinc-900">{{ rows.length }}</span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-zinc-500">Fetched</span>
          <span class="font-medium text-zinc-900">{{ formatStamp(fetchedAt) }}</span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-zinc-500">Mode</span>
          <span class="font-medium text-zinc-900">{{ dataMode === 'sample' ? 'sample' : 'live' }}</span>
        </div>
      </div>
    </Card>

    <Card class="col-span-12 lg:col-span-8">
      <template #title>Top 3</template>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div v-for="row in topThree" :key="row.position" class="live-card">
          <div class="live-card__head">
            <div class="live-card__pos">P{{ row.position }}</div>
            <div class="live-card__tyre">{{ row.tyre || '--' }}</div>
          </div>
          <div class="mt-3 flex items-center gap-3">
            <span class="live-card__accent" :style="{ backgroundColor: teamColor(row) }" />
            <div class="min-w-0">
              <div class="truncate text-base font-semibold text-white">{{ row.driver }}</div>
              <div class="truncate text-xs uppercase tracking-wide text-slate-400">{{ row.team }}</div>
            </div>
          </div>
          <div class="mt-4 flex items-end justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-wide text-slate-500">Best Lap</div>
              <div class="text-xl font-semibold text-white">{{ row.time || '--' }}</div>
            </div>
            <div class="text-right">
              <div class="text-xs uppercase tracking-wide text-slate-500">Gap</div>
              <div class="text-sm font-medium text-slate-200">{{ row.gap || 'Leader' }}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>

    <Card class="col-span-12">
      <template #title>Live Standings Table</template>
      <div class="live-demo">
        <div class="live-demo__scroll">
          <table class="live-demo__table">
            <thead class="live-demo__head">
              <tr>
                <th>Pos</th>
                <th class="text-left">Driver</th>
                <th>Gap</th>
                <th>Time</th>
                <th>Tyre</th>
              </tr>
            </thead>
            <tbody class="live-demo__body">
              <tr v-for="row in rows" :key="`${row.position}-${row.driver}`">
                <td class="live-demo__pos">
                  <span class="live-demo__pos-box">{{ row.position }}</span>
                </td>
                <td class="text-left">
                  <div class="live-demo__driver-cell">
                    <span class="live-demo__driver-accent" :style="{ backgroundColor: teamColor(row) }" />
                    <div class="min-w-0">
                      <div class="live-demo__driver-name truncate">{{ row.driver }}</div>
                      <div class="live-demo__driver-team truncate">{{ row.team }}</div>
                    </div>
                  </div>
                </td>
                <td>{{ row.gap || '--' }}</td>
                <td class="font-semibold">{{ row.time || '--' }}</td>
                <td class="live-demo__tyre-cell">
                  <div class="live-demo__tyre-stack">
                    <span
                      v-for="part in tyreDetails(row)"
                      :key="`${row.position}-${part}`"
                      :class="part === row.tyre ? 'live-demo__tyre-badge' : 'live-demo__tyre-meta'"
                    >
                      {{ part }}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.live-card {
  border-radius: 16px;
  background: linear-gradient(180deg, #131a22 0%, #0f141b 100%);
  padding: 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.22);
}

.live-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.live-card__pos {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.live-card__tyre {
  display: inline-flex;
  min-width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 700;
}

.live-card__accent {
  width: 4px;
  height: 28px;
  transform: skewX(-12deg);
  border-radius: 2px;
  flex: none;
}

.live-demo {
  border-radius: 14px;
  overflow: hidden;
  background: #0f141b;
}

.live-demo__scroll {
  overflow-x: auto;
}

.live-demo__table {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0 2px;
  table-layout: fixed;
}

.live-demo__head th {
  padding: 14px 10px 10px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.live-demo__head th.text-left,
.live-demo__body td.text-left {
  text-align: left;
}

.live-demo__body td {
  padding: 12px 10px;
  text-align: center;
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
}

.live-demo__pos {
  width: 72px;
}

.live-demo__pos-box {
  display: inline-flex;
  width: 28px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.82);
  font-weight: 700;
}

.live-demo__driver-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.live-demo__driver-accent {
  width: 5px;
  height: 26px;
  transform: skewX(-12deg);
  border-radius: 2px;
  flex: none;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.22);
}

.live-demo__driver-name {
  color: #f8fafc;
  font-size: 17px;
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.live-demo__driver-team {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.1;
  font-weight: 500;
}

.live-demo__tyre-cell {
  width: 104px;
}

.live-demo__tyre-stack {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.live-demo__tyre-badge {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 700;
}

.live-demo__tyre-meta {
  color: #94a3b8;
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  white-space: nowrap;
}
</style>
