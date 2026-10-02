/**
 * Runs `fn` at most once per `waitMs`, however many times the returned function is called: the
 * first call opens a window, calls inside it are folded into the single run at its end.
 *
 * Not a debounce: a debounce restarts its timer on every call, so a flood of calls would keep it
 * waiting for ever. Here the run always comes, at most every `waitMs`. That matters for the
 * calendar's reload: the Realtime channel is public, and without a ceiling anyone who knows its
 * name could make every open panel reload a hundred times a second.
 */
export function coalesce(fn: () => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const call = () => {
    if (timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      fn()
    }, waitMs)
  }
  call.cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return call
}
