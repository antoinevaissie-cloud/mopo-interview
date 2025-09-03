export type RGBA = { r: number; g: number; b: number; a?: number }

function dpiCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, rect.width, rect.height)
  return { ctx, w: rect.width, h: rect.height }
}

function color({ r, g, b, a = 1 }: RGBA) {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function drawLine(canvas: HTMLCanvasElement, data: number[], opts?: { stroke?: RGBA }) {
  const { ctx, w, h } = dpiCanvas(canvas)
  if (data.length === 0) return
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pad = 8
  const y = (v: number) => {
    if (max === min) return h / 2
    return h - pad - ((v - min) / (max - min)) * (h - pad * 2)
  }
  const x = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
  ctx.strokeStyle = color(opts?.stroke ?? { r: 16, g: 185, b: 129 })
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x(0), y(data[0] ?? 0))
  for (let i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i] ?? 0))
  ctx.stroke()
}

export function drawSparkline(canvas: HTMLCanvasElement, data: number[]) {
  drawLine(canvas, data, { stroke: { r: 59, g: 130, b: 246 } })
}

export function drawBar(canvas: HTMLCanvasElement, categories: string[], values: number[]) {
  const { ctx, w, h } = dpiCanvas(canvas)
  const pad = 16
  const barW = (w - pad * 2) / Math.max(1, values.length)
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const y = (v: number) => {
    if (max === min) return h / 2
    return h - pad - ((v - min) / (max - min)) * (h - pad * 2)
  }
  const x0 = pad
  const baseline = y(0)
  ctx.fillStyle = color({ r: 234, g: 88, b: 12 })
  values.forEach((v, i) => {
    const x = x0 + i * barW + 4
    const yv = y(v)
    const hh = Math.abs(baseline - yv)
    const top = v >= 0 ? yv : baseline
    ctx.fillRect(x, top, barW - 8, hh)
  })
}

export function drawSpider(canvas: HTMLCanvasElement, labels: string[], values01: number[]) {
  const { ctx, w, h } = dpiCanvas(canvas)
  const cx = w / 2
  const cy = h / 2
  const radius = Math.min(w, h) * 0.38
  const N = Math.min(labels.length, values01.length)
  // Grid
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2
      const r = (radius * ring) / 4
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.stroke()
  }
  // Axes
  ctx.strokeStyle = '#94a3b8'
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a))
    ctx.stroke()
  }
  // Polygon
  ctx.fillStyle = 'rgba(16, 185, 129, 0.25)'
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)'
  ctx.beginPath()
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2
    const r = radius * Math.max(0, Math.min(1, values01[i] ?? 0))
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.fill(); ctx.stroke()
}

// Tornado chart: labels with delta impacts (absolute values sorted descending)
export function drawTornado(canvas: HTMLCanvasElement, labels: string[], deltas: number[]) {
  const { ctx, w, h } = dpiCanvas(canvas)
  const pad = 16
  const rows = labels.map((l, i) => ({ l, d: deltas[i] ?? 0 }))
  rows.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.d)))
  const rowH = (h - pad * 2) / rows.length
  rows.forEach((r, i) => {
    const y = pad + i * rowH + rowH * 0.15
    const cx = w / 2
    const len = ((Math.abs(r.d) / maxAbs) * (w * 0.45))
    ctx.fillStyle = r.d >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'
    ctx.fillRect(r.d >= 0 ? cx : cx - len, y, len, rowH * 0.7)
    ctx.fillStyle = '#334155'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(r.l ?? '', cx - 6, y + rowH * 0.55)
  })
}

// Waterfall chart: price -> commission -> servicing -> attrition -> contribution
export function drawWaterfall(canvas: HTMLCanvasElement, labels: string[], steps: number[]) {
  const { ctx, w, h } = dpiCanvas(canvas)
  const pad = 16
  const barW = (w - pad * 2) / Math.max(1, steps.length)
  let cum = 0
  const max = Math.max(...[0, ...accumulate(steps)])
  const min = Math.min(...[0, ...accumulate(steps)])
  const y = (v: number) => {
    if (max === min) return h / 2
    return h - pad - ((v - min) / (max - min)) * (h - pad * 2)
  }
  function accumulate(arr: number[]) {
    const out: number[] = []
    let c = 0
    for (const v of arr) { c += v; out.push(c) }
    return out
  }
  const baseline = y(0)
  steps.forEach((v, i) => {
    const x = pad + i * barW + 6
    const y0 = y(cum)
    cum += v
    const y1 = y(cum)
    const top = Math.min(y0, y1)
    const hh = Math.abs(y1 - y0)
    ctx.fillStyle = v >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'
    ctx.fillRect(x, top, barW - 12, hh)
    ctx.fillStyle = '#475569'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(labels[i] ?? '', x + (barW - 12) / 2, baseline + 12)
  })
}
