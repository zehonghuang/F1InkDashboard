<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  fetchAdminF1LiveTiming,
  type AdminF1LiveTimingRow,
  type AdminF1LiveTimingSnapshot,
} from '@/api/admin'
import { getApiBase, getToken } from '@/api/http'

const loading = ref(false)
const error = ref('')
const wsState = ref<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
const lastMessageType = ref('')
const snapshot = ref<AdminF1LiveTimingSnapshot | null>(null)

let socket: WebSocket | null = null
let reconnectTimer: number | null = null
let heartbeatTimer: number | null = null
let disposed = false

const rows = computed(() => snapshot.value?.rows || [])
const raceControlMessages = computed(() => snapshot.value?.race_control_messages || [])
const sessionTitle = computed(() => {
  const session = snapshot.value?.session
  if (!session) return '--'
  const meeting = session.meeting_name || session.location || ''
  const name = session.session_name || session.session_type || ''
  return [meeting, name].filter(Boolean).join(' · ') || '--'
})
const wsURL = computed(() => resolveWsURL())
const leaderRow = computed(() => rows.value[0] || null)
const fastestLapRow = computed(() => {
  return rows.value.find((row) => row.current_lap_fastest) || rows.value.find((row) => row.personal_best_lap) || null
})

function applySnapshot(next: AdminF1LiveTimingSnapshot) {
  snapshot.value = {
    ...next,
    rows: next.rows || [],
    race_control_messages: next.race_control_messages || [],
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchAdminF1LiveTiming()
    applySnapshot(res.status)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function resolveWsURL() {
  const base = getApiBase()
  const root = base ? new URL(base, window.location.origin) : new URL(window.location.origin)
  const url = new URL('/ws/f1/live-timing', root.origin)
  url.protocol = root.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = getToken()
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function clearHeartbeatTimer() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function scheduleReconnect() {
  if (disposed || reconnectTimer !== null) return
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connectWS()
  }, 1500)
}

function connectWS() {
  clearReconnectTimer()
  clearHeartbeatTimer()
  if (socket) {
    socket.close()
    socket = null
  }

  wsState.value = 'connecting'
  error.value = ''

  const ws = new WebSocket(resolveWsURL())
  socket = ws

  ws.onopen = () => {
    wsState.value = 'open'
    heartbeatTimer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send('ping')
      }
    }, 15000)
  }

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as {
        type?: string
        status?: AdminF1LiveTimingSnapshot
      }
      lastMessageType.value = payload.type || ''
      if (payload.status) {
        applySnapshot(payload.status)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'WS 消息解析失败'
    }
  }

  ws.onerror = () => {
    wsState.value = 'error'
  }

  ws.onclose = () => {
    wsState.value = 'closed'
    clearHeartbeatTimer()
    socket = null
    scheduleReconnect()
  }
}

function disconnectWS() {
  clearReconnectTimer()
  clearHeartbeatTimer()
  if (socket) {
    socket.close()
    socket = null
  }
  wsState.value = 'closed'
}

function teamColor(row: AdminF1LiveTimingRow) {
  return row.team_color || '#64748b'
}

function driverCode(row: AdminF1LiveTimingRow) {
  if (row.tla) return row.tla.toUpperCase()
  if (row.driver) return row.driver.slice(0, 3).toUpperCase()
  return row.racing_number || '--'
}

function tyreText(row: AdminF1LiveTimingRow) {
  if (!row.tyre) return '--'
  const suffix = row.tyre_age_laps ? ` ${row.tyre_age_laps}L` : ''
  const freshness = row.is_new_tyre ? ' new' : ''
  return `${row.tyre}${suffix}${freshness}`
}

function tyreChipClass(row: AdminF1LiveTimingRow) {
  const tyre = (row.tyre || '').toUpperCase()
  if (tyre.includes('SOFT')) return 'timing-row__tyre-chip timing-row__tyre-chip--soft'
  if (tyre.includes('MED')) return 'timing-row__tyre-chip timing-row__tyre-chip--medium'
  if (tyre.includes('HARD')) return 'timing-row__tyre-chip timing-row__tyre-chip--hard'
  if (tyre.includes('INTER')) return 'timing-row__tyre-chip timing-row__tyre-chip--inter'
  if (tyre.includes('WET')) return 'timing-row__tyre-chip timing-row__tyre-chip--wet'
  return 'timing-row__tyre-chip'
}

function sectorText(row: AdminF1LiveTimingRow, index: number) {
  return row.sectors?.[index] || '--'
}

function sectorClass(row: AdminF1LiveTimingRow, index: number) {
  const color = row.sector_colors?.[index] || ''
  if (color === 'purple') return 'sector-chip sector-chip--purple'
  if (color === 'yellow') return 'sector-chip sector-chip--yellow'
  if (color === 'green') return 'sector-chip sector-chip--green'
  return 'sector-chip'
}

function segmentClass(color?: string) {
  if (color === 'purple') return 'segment-dot segment-dot--purple'
  if (color === 'yellow') return 'segment-dot segment-dot--yellow'
  if (color === 'blue') return 'segment-dot segment-dot--blue'
  return 'segment-dot'
}

function towerStatus(row: AdminF1LiveTimingRow) {
  if (row.retired) return { text: 'RET', className: 'timing-row__status timing-row__status--retired' }
  if (row.stopped) return { text: 'STOP', className: 'timing-row__status timing-row__status--stopped' }
  if (row.in_pit) return { text: 'IN PIT', className: 'timing-row__status timing-row__status--pit' }
  if (row.pit_out) return { text: 'PIT OUT', className: 'timing-row__status timing-row__status--pitout' }
  if (row.taken_chequered) return { text: 'FLAG', className: 'timing-row__status timing-row__status--flag' }
  return { text: 'RUN', className: 'timing-row__status timing-row__status--run' }
}

function rowClasses(row: AdminF1LiveTimingRow) {
  return {
    'timing-board__row': true,
    'timing-board__row--leader': row.position === 1,
    'timing-board__row--pit': row.in_pit || row.pit_out,
    'timing-board__row--retired': row.retired || row.stopped,
  }
}

function intervalText(row: AdminF1LiveTimingRow) {
  if (row.position === 1) return 'Leader'
  return row.interval || row.gap || '--'
}

function boardValueClass(row: AdminF1LiveTimingRow, kind: 'last' | 'best' = 'last') {
  if (kind === 'last') {
    if (row.current_lap_fastest) return 'timing-board__value timing-board__value--purple'
    if (row.personal_best_lap) return 'timing-board__value timing-board__value--green'
  }
  return 'timing-board__value'
}

function trackStatusLabel() {
  return snapshot.value?.track_status?.message || 'Unknown'
}

function trackStatusClass() {
  const value = (snapshot.value?.track_status?.message || '').toLowerCase()
  if (value.includes('clear') || value.includes('green')) return 'timing-status-card__value timing-status-card__value--green'
  if (value.includes('yellow') || value.includes('sc') || value.includes('vsc')) {
    return 'timing-status-card__value timing-status-card__value--yellow'
  }
  if (value.includes('red')) return 'timing-status-card__value timing-status-card__value--red'
  return 'timing-status-card__value'
}

function compactWeather(label: string, value?: string, suffix = '') {
  const normalized = value && String(value).trim() !== '' ? `${value}${suffix}` : '--'
  return { label, value: normalized }
}

function weatherCards() {
  return [
    compactWeather('Track', snapshot.value?.weather?.track_temp, ' C'),
    compactWeather('Air', snapshot.value?.weather?.air_temp, ' C'),
    compactWeather('Humidity', snapshot.value?.weather?.humidity, '%'),
    compactWeather('Wind', [snapshot.value?.weather?.wind_speed, snapshot.value?.weather?.wind_direction].filter(Boolean).join(' ')),
  ]
}

function raceControlTone(flag?: string) {
  const value = (flag || '').toLowerCase()
  if (value.includes('yellow')) return 'timing-feed__badge timing-feed__badge--yellow'
  if (value.includes('red')) return 'timing-feed__badge timing-feed__badge--red'
  if (value.includes('green')) return 'timing-feed__badge timing-feed__badge--green'
  return 'timing-feed__badge'
}

function formatStamp(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function compactTrackTime(value?: string) {
  if (!value) return '--'
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && numeric > 1_000_000_000) {
    const date = new Date(numeric)
    if (!Number.isNaN(date.getTime())) {
      const ms = String(date.getMilliseconds()).padStart(3, '0')
      return `${date.toLocaleTimeString()}.${ms}`
    }
  }
  return value
}

onMounted(async () => {
  disposed = false
  await load()
  connectWS()
})

onUnmounted(() => {
  disposed = true
  disconnectWS()
})
</script>

<template>
  <div class="timing-screen">
    <div class="timing-screen__chrome">
      <div class="timing-topbar">
        <div class="timing-topbar__event">
          <div class="timing-topbar__flag" />
          <div>
            <div class="timing-topbar__label">Live Timing</div>
            <div class="timing-topbar__title">{{ snapshot?.session?.meeting_name || snapshot?.session?.location || 'F1 Live Timing' }}</div>
          </div>
        </div>
        <div class="timing-topbar__session">
          {{ snapshot?.session?.session_name || snapshot?.session?.session_type || 'Session' }}
        </div>
        <div class="timing-topbar__time">{{ compactTrackTime(snapshot?.clock?.track_time) }}</div>
        <div :class="trackStatusClass()">{{ trackStatusLabel() }}</div>
        <div class="timing-topbar__meta">
          <span>LDR {{ leaderRow?.driver || '--' }}</span>
          <span>LAP {{ leaderRow?.laps || '--' }}</span>
          <span>PRESS {{ snapshot?.weather?.pressure || '--' }} mb</span>
          <span>RAIN {{ snapshot?.weather?.rainfall || '--' }}</span>
        </div>
      </div>

      <div class="timing-subbar">
        <div class="timing-tabs">
          <span class="timing-tab timing-tab--active">Overview</span>
          <span class="timing-tab">Race</span>
          <span class="timing-tab">Demo Layout</span>
        </div>
        <div class="timing-actions">
          <Button size="small" type="primary" :loading="loading" @click="load">刷新</Button>
          <Button size="small" ghost @click="connectWS">重连 WS</Button>
        </div>
      </div>

      <Alert v-if="error || snapshot?.last_error" show-icon type="error" class="timing-alert">
        {{ error || snapshot?.last_error }}
      </Alert>

      <div class="timing-main">
        <div class="timing-board">
          <div class="timing-board__header">
            <div>Pos</div>
            <div>Drv</div>
            <div>Last</div>
            <div>Best</div>
            <div>Int</div>
            <div>Tyre</div>
            <div>Sectors</div>
          </div>

          <div
            v-for="row in rows"
            :key="`${row.position}-${row.racing_number}`"
            :class="rowClasses(row)"
          >
            <div class="timing-board__pos" :style="{ backgroundColor: teamColor(row) }">{{ row.position }}</div>

            <div class="timing-board__driver">
              <div class="timing-board__driver-line">
                <span class="timing-board__tla" :style="{ color: teamColor(row) }">{{ driverCode(row) }}</span>
                <span class="timing-board__name">{{ row.driver }}</span>
                <span :class="towerStatus(row).className">{{ towerStatus(row).text }}</span>
              </div>
              <div class="timing-board__meta">
                <span>{{ row.racing_number || '--' }}</span>
                <span>{{ row.team || '--' }}</span>
                <span>L{{ row.laps || '--' }}</span>
              </div>
            </div>

            <div :class="boardValueClass(row, 'last')">{{ row.last_lap || '--' }}</div>
            <div :class="boardValueClass(row, 'best')">{{ row.best_lap || '--' }}</div>
            <div class="timing-board__value">{{ intervalText(row) }}</div>
            <div class="timing-board__tyre">
              <span :class="tyreChipClass(row)">{{ tyreText(row) }}</span>
            </div>

            <div class="timing-board__sectors">
              <div v-for="sectorIndex in 3" :key="sectorIndex" class="timing-board__sector">
                <div :class="sectorClass(row, sectorIndex - 1)">{{ sectorText(row, sectorIndex - 1) }}</div>
                <div class="segment-row segment-row--board">
                  <span
                    v-for="(color, segmentIndex) in row.sector_segment_colors?.[sectorIndex - 1] || []"
                    :key="`${row.position}-${sectorIndex}-${segmentIndex}`"
                    :class="segmentClass(color)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="timing-side">
          <div class="timing-status-card">
            <div class="timing-status-card__title">Track Status</div>
            <div :class="trackStatusClass()">{{ trackStatusLabel() }}</div>
            <div class="timing-status-card__meta">
              <span>Status {{ snapshot?.session?.status || '--' }}</span>
              <span>Updated {{ formatStamp(snapshot?.last_updated_at_utc) }}</span>
            </div>
          </div>

          <div class="timing-highlight-card">
            <div class="timing-highlight-card__title">Fastest Lap</div>
            <div class="timing-highlight-card__driver">
              <span :style="{ color: fastestLapRow ? teamColor(fastestLapRow) : '#cbd5e1' }">
                {{ fastestLapRow ? driverCode(fastestLapRow) : '--' }}
              </span>
              <strong>{{ fastestLapRow?.driver || '--' }}</strong>
            </div>
            <div class="timing-highlight-card__time">{{ fastestLapRow?.last_lap || fastestLapRow?.best_lap || '--' }}</div>
            <div class="timing-highlight-card__meta">
              <span>Best {{ fastestLapRow?.best_lap || '--' }}</span>
              <span>Tyre {{ fastestLapRow ? tyreText(fastestLapRow) : '--' }}</span>
            </div>
          </div>

          <div class="timing-weather-grid">
            <div v-for="item in weatherCards()" :key="item.label" class="timing-weather-grid__item">
              <div class="timing-weather-grid__label">{{ item.label }}</div>
              <div class="timing-weather-grid__value">{{ item.value }}</div>
            </div>
          </div>

          <div class="timing-feed">
            <div class="timing-feed__title">Race Control</div>
            <div class="timing-feed__list">
              <div
                v-for="(item, index) in raceControlMessages.slice(0, 6)"
                :key="`${item.utc || ''}-${index}`"
                class="timing-feed__item"
              >
                <div class="timing-feed__top">
                  <span :class="raceControlTone(item.flag)">{{ item.flag || item.category || 'Info' }}</span>
                  <span>{{ formatStamp(item.utc) }}</span>
                </div>
                <div class="timing-feed__message">{{ item.message || item.title || '--' }}</div>
              </div>
            </div>
          </div>

          <div class="timing-service-bar">
            <span :class="snapshot?.connected ? 'timing-badge timing-badge--ok' : 'timing-badge'">
              Backend {{ snapshot?.connected ? 'Connected' : 'Disconnected' }}
            </span>
            <span :class="wsState === 'open' ? 'timing-badge timing-badge--ok' : wsState === 'connecting' ? 'timing-badge timing-badge--warn' : 'timing-badge'">
              WS {{ wsState }}
            </span>
            <span class="timing-badge">Seq {{ snapshot?.seq || 0 }}</span>
            <span class="timing-badge">Latency {{ snapshot?.query_latency_ms ?? '--' }} ms</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timing-screen {
  min-height: calc(100vh - 96px);
  border-radius: 20px;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 26%),
    linear-gradient(180deg, #05070b 0%, #0c1017 100%);
  color: #f8fafc;
}

.timing-screen__chrome {
  display: flex;
  min-height: calc(100vh - 96px);
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.timing-topbar {
  display: grid;
  grid-template-columns: auto auto auto auto 1fr;
  align-items: center;
  gap: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 11, 18, 0.92);
  padding: 12px 16px;
}

.timing-topbar__event {
  display: flex;
  align-items: center;
  gap: 12px;
}

.timing-topbar__flag {
  width: 36px;
  height: 24px;
  border-radius: 6px;
  background: linear-gradient(180deg, #ef4444 0 50%, #f8fafc 50% 100%);
  box-shadow: 0 6px 14px rgba(239, 68, 68, 0.2);
}

.timing-topbar__label {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}

.timing-topbar__title {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 800;
}

.timing-topbar__session {
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.timing-topbar__time {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.timing-topbar__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 14px;
  color: #cbd5e1;
  font-size: 13px;
}

.timing-status-card__value,
.timing-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 700;
}

.timing-status-card__value--green,
.timing-pill--green {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
  box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.18);
}

.timing-status-card__value--yellow {
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.18);
}

.timing-status-card__value--red {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.18);
}

.timing-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 4px;
}

.timing-tabs {
  display: flex;
  align-items: center;
  gap: 20px;
}

.timing-tab {
  position: relative;
  color: #64748b;
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.timing-tab--active {
  color: #e2e8f0;
}

.timing-tab--active::after {
  position: absolute;
  right: 0;
  bottom: -8px;
  left: 0;
  height: 2px;
  border-radius: 9999px;
  background: #38bdf8;
  content: '';
}

.timing-actions {
  display: flex;
  gap: 8px;
}

.timing-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.12);
  padding: 4px 8px;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
}

.timing-badge--ok {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
}

.timing-badge--warn {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
}

.timing-alert {
  margin: 0;
}

.timing-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  min-height: 0;
}

.timing-board {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  overflow: hidden;
}

.timing-board__header {
  display: grid;
  grid-template-columns: 52px minmax(220px, 1.25fr) 92px 92px 82px 120px minmax(250px, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.03);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timing-board__row {
  display: grid;
  grid-template-columns: 52px minmax(220px, 1.25fr) 92px 92px 82px 120px minmax(250px, 1fr);
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.01);
}

.timing-board__row:nth-child(even) {
  background: rgba(255, 255, 255, 0.025);
}

.timing-board__row--leader {
  box-shadow: inset 3px 0 0 #22c55e;
}

.timing-board__row--pit {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.12), rgba(255, 255, 255, 0.02));
}

.timing-board__row--retired {
  opacity: 0.64;
}

.timing-board__pos {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #020617;
  font-size: 14px;
  font-weight: 900;
}

.timing-board__driver {
  min-width: 0;
}

.timing-board__driver-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timing-board__tla {
  min-width: 34px;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.timing-board__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 800;
}

.timing-row__status {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.timing-row__status--run {
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
}

.timing-row__status--pit,
.timing-row__status--pitout {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}

.timing-row__status--retired,
.timing-row__status--stopped {
  background: rgba(148, 163, 184, 0.14);
  color: #e2e8f0;
}

.timing-row__status--flag {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}

.timing-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.timing-board__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f8fafc;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.timing-board__value--purple {
  color: #d8b4fe;
}

.timing-board__value--green {
  color: #86efac;
}

.timing-board__tyre {
  display: flex;
  justify-content: flex-start;
}

.timing-row__tyre-chip {
  display: inline-flex;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  padding: 5px 10px;
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 800;
}

.timing-row__tyre-chip--soft {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}

.timing-row__tyre-chip--medium {
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
}

.timing-row__tyre-chip--hard {
  background: rgba(226, 232, 240, 0.16);
  color: #f8fafc;
}

.timing-row__tyre-chip--inter {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}

.timing-row__tyre-chip--wet {
  background: rgba(56, 189, 248, 0.18);
  color: #7dd3fc;
}

.timing-board__sectors {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.timing-board__sector {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timing-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timing-status-card,
.timing-highlight-card,
.timing-feed,
.timing-service-bar {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.04);
  padding: 14px;
}

.timing-status-card__title,
.timing-highlight-card__title,
.timing-feed__title {
  margin-bottom: 10px;
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timing-status-card__meta,
.timing-highlight-card__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  color: #94a3b8;
  font-size: 12px;
}

.timing-highlight-card__driver {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #f8fafc;
}

.timing-highlight-card__driver span {
  font-size: 20px;
  font-weight: 900;
}

.timing-highlight-card__driver strong {
  font-size: 16px;
}

.timing-highlight-card__time {
  margin-top: 10px;
  color: #d8b4fe;
  font-size: 28px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.timing-weather-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.timing-weather-grid__item {
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.04);
  padding: 12px;
}

.timing-weather-grid__label {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timing-weather-grid__value {
  margin-top: 8px;
  color: #f8fafc;
  font-size: 18px;
  font-weight: 800;
}

.timing-feed__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow-y: auto;
}

.timing-feed__item {
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.45);
  padding: 10px;
}

.timing-feed__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.timing-feed__badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.12);
  padding: 2px 8px;
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 800;
}

.timing-feed__badge--yellow {
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
}

.timing-feed__badge--red {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}

.timing-feed__badge--green {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}

.timing-feed__message {
  margin-top: 6px;
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.4;
}

.timing-service-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sector-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  border-radius: 8px;
  padding: 5px 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.sector-chip--purple {
  background: rgba(168, 85, 247, 0.2);
  color: #e9d5ff;
  box-shadow: inset 0 0 0 1px rgba(192, 132, 252, 0.35);
}

.sector-chip--yellow {
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.28);
}

.sector-chip--green {
  background: rgba(16, 185, 129, 0.2);
  color: #bbf7d0;
  box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.28);
}

.segment-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 6px;
}

.segment-dot {
  flex: 1 1 0;
  height: 5px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.2);
}

.segment-dot--purple {
  background: #a855f7;
}

.segment-dot--yellow {
  background: #facc15;
}

.segment-dot--blue {
  background: #38bdf8;
}

@media (max-width: 1520px) {
  .timing-main {
    grid-template-columns: 1fr;
  }

  .timing-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .timing-board__header,
  .timing-board__row {
    grid-template-columns: 52px minmax(220px, 1.2fr) 92px 92px 82px 120px;
  }

  .timing-board__header div:last-child,
  .timing-board__row > div:last-child {
    display: none;
  }
}

@media (max-width: 900px) {
  .timing-topbar {
    grid-template-columns: 1fr;
  }

  .timing-topbar__meta {
    justify-content: flex-start;
  }

  .timing-subbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .timing-side {
    grid-template-columns: 1fr;
  }

  .timing-board__header,
  .timing-board__row {
    grid-template-columns: 44px minmax(180px, 1fr) 88px 88px;
  }

  .timing-board__header div:nth-child(n + 5),
  .timing-board__row > div:nth-child(n + 5) {
    display: none;
  }
}

@media (max-width: 640px) {
  .timing-screen__chrome {
    padding: 12px;
  }

  .timing-weather-grid {
    grid-template-columns: 1fr;
  }
}
</style>
