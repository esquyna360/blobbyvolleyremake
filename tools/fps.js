new Promise(res => {
  let n = 0, worst = 0, over = 0, last = performance.now(), t0 = last
  const step = t => {
    const d = t - last; last = t
    if (n++) { if (d > worst) worst = d; if (d > 22) over++ }
    if (t - t0 < 4000) requestAnimationFrame(step)
    else res(JSON.stringify({ fps: +(n / ((t - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1), framesOver22ms: over, frames: n }))
  }
  requestAnimationFrame(step)
})
