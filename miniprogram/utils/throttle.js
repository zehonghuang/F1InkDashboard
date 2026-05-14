function throttle(fn, waitMs) {
  let last = 0
  let timer
  const wrapped = function (...args) {
    const now = Date.now()
    const remaining = waitMs - (now - last)
    if (remaining <= 0) {
      last = now
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      fn.apply(this, args)
      return
    }
    if (timer) return
    timer = setTimeout(() => {
      last = Date.now()
      timer = undefined
      fn.apply(this, args)
    }, remaining)
  }
  return wrapped
}

module.exports = { throttle }

