export function throttle<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
  let last = 0
  let timer: any
  const wrapped = function (this: any, ...args: any[]) {
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
  return wrapped as unknown as T
}

