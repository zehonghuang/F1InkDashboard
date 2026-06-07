<script setup lang="ts">
type Row = {
  pos: number
  driver: string
  team: string
  number: number
  carAccent: string
  laps: number
  time: string
  gap: string
  interval: string
  tyre: string
  teamColor: string
}

const rows: Row[] = [
  {
    pos: 1,
    driver: 'A. Antonelli',
    team: 'Mercedes',
    number: 12,
    carAccent: '#00D2BE',
    laps: 28,
    time: "1'12.051",
    gap: '',
    interval: '',
    tyre: 'S',
    teamColor: '#00D2BE',
  },
  {
    pos: 2,
    driver: 'M. Verstappen',
    team: 'Red Bull Racing',
    number: 3,
    carAccent: '#3671C6',
    laps: 26,
    time: "1'12.094",
    gap: '+0.043',
    interval: '0.043',
    tyre: 'S',
    teamColor: '#3671C6',
  },
  {
    pos: 3,
    driver: 'L. Hamilton',
    team: 'Ferrari',
    number: 44,
    carAccent: '#E8002D',
    laps: 28,
    time: "1'12.279",
    gap: '+0.228',
    interval: '0.185',
    tyre: 'S',
    teamColor: '#E8002D',
  },
  {
    pos: 4,
    driver: 'C. Leclerc',
    team: 'Ferrari',
    number: 16,
    carAccent: '#E8002D',
    laps: 29,
    time: "1'12.351",
    gap: '+0.300',
    interval: '0.072',
    tyre: 'S',
    teamColor: '#E8002D',
  },
  {
    pos: 5,
    driver: 'I. Hadjar',
    team: 'Red Bull Racing',
    number: 6,
    carAccent: '#3671C6',
    laps: 25,
    time: "1'12.434",
    gap: '+0.383',
    interval: '0.083',
    tyre: 'S',
    teamColor: '#3671C6',
  },
  {
    pos: 6,
    driver: 'G. Russell',
    team: 'Mercedes',
    number: 63,
    carAccent: '#00D2BE',
    laps: 28,
    time: "1'12.445",
    gap: '+0.394',
    interval: '0.011',
    tyre: 'S',
    teamColor: '#00D2BE',
  },
  {
    pos: 7,
    driver: 'O. Piastri',
    team: 'McLaren',
    number: 81,
    carAccent: '#FF8000',
    laps: 29,
    time: "1'12.624",
    gap: '+0.573',
    interval: '0.179',
    tyre: 'S',
    teamColor: '#FF8000',
  },
  {
    pos: 8,
    driver: 'L. Norris',
    team: 'McLaren',
    number: 1,
    carAccent: '#FF8000',
    laps: 28,
    time: "1'12.765",
    gap: '+0.714',
    interval: '0.141',
    tyre: 'S',
    teamColor: '#FF8000',
  },
  {
    pos: 9,
    driver: 'P. Gasly',
    team: 'Alpine',
    number: 10,
    carAccent: '#2293D1',
    laps: 32,
    time: "1'13.226",
    gap: '+1.175',
    interval: '0.461',
    tyre: 'S',
    teamColor: '#2293D1',
  },
  {
    pos: 10,
    driver: 'L. Lawson',
    team: 'Racing Bulls',
    number: 30,
    carAccent: '#5E8FAA',
    laps: 29,
    time: "1'13.412",
    gap: '+1.361',
    interval: '0.186',
    tyre: 'S',
    teamColor: '#5E8FAA',
  },
]
</script>

<template>
  <div class="grid grid-cols-12 gap-4">
    <Card class="col-span-12">
      <template #title>Motorsport Table Demo</template>
      <div class="text-sm text-zinc-700">
        复刻 Motorsport「Qualifying results」卡片表格布局（深色、行间距、行底色与紧凑排版）。
      </div>

      <div class="mt-4 rounded-md overflow-hidden ms-demo">
        <div class="px-4 pt-4 pb-2">
          <div class="text-xs tracking-widest uppercase ms-demo__title">
            F1 Monaco GP: Qualifying results
          </div>
        </div>

        <div class="px-4 pb-4">
          <div class="ms-demo__scroll">
            <table class="ms-demo__table">
              <colgroup>
                <col style="width: 56px" />
                <col style="width: 170px" />
                <col style="width: 64px" />
                <col style="width: 120px" />
                <col style="width: 64px" />
                <col style="width: 92px" />
                <col style="width: 84px" />
                <col style="width: 64px" />
              </colgroup>
              <thead class="ms-demo__head">
                <tr>
                  <th class="text-left">CLA</th>
                  <th class="text-left">Driver</th>
                  <th>#</th>
                  <th></th>
                  <th>Laps</th>
                  <th>Time</th>
                  <th>Interval</th>
                  <th>Tyres</th>
                </tr>
              </thead>
              <tbody class="ms-demo__body">
                <tr v-for="r in rows" :key="r.pos">
                  <td class="ms-demo__pos">
                    <div class="ms-demo__pos-box">{{ r.pos }}</div>
                  </td>
                  <td class="text-left ms-demo__driver-cell">
                    <div class="flex items-center gap-3">
                      <span class="ms-demo__team-badge" :style="{ backgroundColor: r.teamColor }" />
                      <div class="min-w-0">
                        <div class="ms-demo__driver truncate">{{ r.driver }}</div>
                        <div class="ms-demo__team truncate">{{ r.team }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="ms-demo__num-cell">
                    <div class="ms-demo__num">{{ r.number }}</div>
                  </td>
                  <td class="ms-demo__car-cell">
                    <div class="ms-demo__car" :style="{ '--car-accent': r.carAccent }" />
                  </td>
                  <td class="tabular-nums">{{ r.laps }}</td>
                  <td class="tabular-nums">
                    <div v-if="r.gap" class="ms-demo__gap">{{ r.gap }}</div>
                    <div class="ms-demo__time">{{ r.time }}</div>
                  </td>
                  <td class="tabular-nums ms-demo__muted">{{ r.interval }}</td>
                  <td>
                    <div class="ms-demo__tyre">{{ r.tyre }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-3">
            <Button long>VIEW FULL RESULTS</Button>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.ms-demo {
  background: #0f141b;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}

.ms-demo__title {
  color: rgba(226, 232, 240, 0.7);
}

.ms-demo__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 2px;
  table-layout: fixed;
  min-width: 714px;
}

.ms-demo__scroll {
  overflow-x: auto;
  padding-bottom: 6px;
}

.ms-demo__scroll::-webkit-scrollbar {
  height: 10px;
}

.ms-demo__scroll::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.4);
}

.ms-demo__scroll::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 9999px;
}

.ms-demo__scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.35);
}

.ms-demo__head th {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
  padding: 8px 8px;
  text-align: center;
}

.ms-demo__head th.text-left {
  text-align: left;
}

.ms-demo__body td {
  background: rgba(255, 255, 255, 0.06);
  padding: 10px 8px;
  font-size: 13px;
  line-height: 1.1;
  color: rgba(226, 232, 240, 0.95);
  text-align: center;
}

.ms-demo__body td.text-left {
  text-align: left;
}

.ms-demo__pos {
  width: 56px;
}

.ms-demo__pos-box {
  width: 26px;
  height: 22px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  margin: 0 auto;
  color: rgba(226, 232, 240, 0.9);
}

.ms-demo__team-badge {
  width: 4px;
  height: 16px;
  transform: skewX(-12deg);
  border-radius: 1px;
  flex: none;
}

.ms-demo__driver-cell {
  border-right: 1px solid rgba(148, 163, 184, 0.12);
}

.ms-demo__driver {
  font-weight: 700;
}

.ms-demo__team {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
  margin-top: 2px;
}

.ms-demo__num-cell {
  width: 76px;
}

.ms-demo__num {
  width: 34px;
  height: 28px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: rgba(226, 232, 240, 0.9);
}

.ms-demo__car-cell {
  width: 170px;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
}

.ms-demo__car {
  --car-accent: #64748b;
  height: 24px;
  width: 140px;
  border-radius: 12px;
  margin: 0 auto;
  background:
    linear-gradient(90deg, rgba(15, 23, 42, 0.2), rgba(15, 23, 42, 0.75)),
    radial-gradient(closest-side at 20% 50%, rgba(255, 255, 255, 0.15), transparent 70%),
    linear-gradient(90deg, var(--car-accent), rgba(255, 255, 255, 0));
  opacity: 0.95;
}

.ms-demo__gap {
  font-weight: 700;
  margin-bottom: 2px;
}

.ms-demo__time {
  font-weight: 700;
}

.ms-demo__muted {
  color: rgba(148, 163, 184, 0.95);
}

.ms-demo__tyre {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
