const { getApiBase } = require("./request")

function toWsBaseUrl(httpBase) {
  const base = String(httpBase || "").replace(/\/+$/, "")
  if (!base) return ""
  if (/^wss?:\/\//i.test(base)) return base
  if (/^https:\/\//i.test(base)) return `wss://${base.slice("https://".length)}`
  if (/^http:\/\//i.test(base)) return `ws://${base.slice("http://".length)}`
  return ""
}

function buildMotorsportLiveWsUrl() {
  const base = toWsBaseUrl(getApiBase())
  if (!base) return ""
  return `${base}/ws/motorsport/live`
}

function createMotorsportLiveClient(options = {}) {
  const reconnectDelayMs = Math.max(1000, Number(options.reconnectDelayMs) || 3000)

  const client = {
    _socketTask: null,
    _closedByUser: false,
    _reconnectTimer: null,
    _url: "",

    connect() {
      this._closedByUser = false
      this._url = buildMotorsportLiveWsUrl()
      if (!this._url) {
        if (typeof options.onError === "function") options.onError(new Error("missing_ws_base"))
        return
      }
      if (this._socketTask) return

      const socketTask = wx.connectSocket({
        url: this._url,
        timeout: 15000,
      })
      this._socketTask = socketTask

      socketTask.onOpen(() => {
        if (typeof options.onOpen === "function") options.onOpen({ url: this._url })
      })

      socketTask.onMessage((event) => {
        const raw = event && typeof event.data === "string" ? event.data : ""
        if (!raw) return
        let data = null
        try {
          data = JSON.parse(raw)
        } catch (e) {
          return
        }
        if (!data || typeof data !== "object") return
        if (typeof options.onStatus === "function" && data.status) {
          options.onStatus(data.status)
        }
        if (data.type === "hello" && data.status && data.status.latest_standings && typeof options.onStandings === "function") {
          options.onStandings(data.status.latest_standings)
          return
        }
        if (data.type === "standings" && data.payload && typeof options.onStandings === "function") {
          options.onStandings(data.payload)
        }
      })

      socketTask.onClose((event) => {
        this._socketTask = null
        if (typeof options.onClose === "function") options.onClose(event || {})
        if (!this._closedByUser) this.scheduleReconnect()
      })

      socketTask.onError((event) => {
        if (typeof options.onError === "function") options.onError(event || {})
      })
    },

    scheduleReconnect() {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null
        if (!this._closedByUser) this.connect()
      }, reconnectDelayMs)
    },

    disconnect() {
      this._closedByUser = true
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
      const socketTask = this._socketTask
      this._socketTask = null
      if (socketTask && typeof socketTask.close === "function") {
        socketTask.close({ code: 1000, reason: "page_unload" })
      }
    },
  }

  return client
}

module.exports = {
  buildMotorsportLiveWsUrl,
  createMotorsportLiveClient,
}
