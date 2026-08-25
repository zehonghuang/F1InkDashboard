const { requestJson, getApiBase } = require("../../../services/request")

function toWsBaseUrl(httpBase) {
  const base = String(httpBase || "").replace(/\/+$/, "")
  if (!base) return ""
  if (/^wss?:\/\//i.test(base)) return base
  if (/^https:\/\//i.test(base)) return `wss://${base.slice("https://".length)}`
  if (/^http:\/\//i.test(base)) return `ws://${base.slice("http://".length)}`
  return ""
}

function buildF1LiveTimingWsUrl() {
  const base = toWsBaseUrl(getApiBase())
  if (!base) return ""
  return `${base}/ws/mp/f1/live-timing`
}

function fetchF1LiveTimingSnapshot() {
  return requestJson("/api/v1/mp/f1/live-timing", {
    method: "GET",
    needAuth: false,
  })
}

function createF1LiveTimingClient(options = {}) {
  const reconnectDelayMs = Math.max(1200, Number(options.reconnectDelayMs) || 2500)

  const client = {
    _socketTask: null,
    _closedByUser: false,
    _reconnectTimer: null,
    _url: "",

    connect() {
      this._closedByUser = false
      this._url = buildF1LiveTimingWsUrl()
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
          console.error("[mp-f1-live] parse ws message failed", e)
          return
        }
        if (!data || typeof data !== "object") return
        if (typeof options.onSnapshot === "function" && data.status) {
          options.onSnapshot(data.status)
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
  fetchF1LiveTimingSnapshot,
  buildF1LiveTimingWsUrl,
  createF1LiveTimingClient,
}
