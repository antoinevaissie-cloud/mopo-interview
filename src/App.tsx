import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppState, defaultInputs, computeAll } from './store'
import { describeActiveEffects, getEffective } from './effects'
import { drawLine, drawTornado, drawWaterfall } from './charts'
import { drcPreset, nigeriaPreset, genericPreset, PRESET_NARRATIVE } from './presets'
import { Inputs, Snapshot, PresetKey } from './types'
import { buildNarrative, computeKpis, formatMoney } from './finance'
import { theoretical_cap_swaps_per_day } from './demand'

type NumProps = {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  title?: string
}

function Num({ label, value, onChange, min, max, step, suffix, title }: NumProps) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm text-slate-700 flex items-center gap-1">{label}
        {title && <span className="text-slate-400 cursor-help" title={title}>?</span>}
      </span>
      <span className="flex items-center gap-1">
        <input
          className="w-28 px-2 py-1 border rounded text-right"
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step ?? 0.1}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
      </span>
    </label>
  )
}

function Slider({ label, value, onChange, min, max, step, suffix, title }: NumProps) {
  return (
    <label className="flex flex-col gap-1 py-1">
      <span className="text-sm text-slate-700 flex items-center gap-1">{label}
        {title && <span className="text-slate-400 cursor-help" title={title}>?</span>}
      </span>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step ?? 1} value={value}
               onChange={(e) => onChange(parseFloat(e.target.value))} className="flex-1" />
        <input
          className="w-20 px-2 py-1 border rounded text-right"
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
      </div>
    </label>
  )
}

function Checkbox({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (b: boolean) => void; title?: string }) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-700 flex items-center gap-1">{label}
        {title && <span className="text-slate-400 cursor-help" title={title}>?</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded border p-3 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function useCanvas(draw: (el: HTMLCanvasElement) => void, deps: React.DependencyList) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    draw(ref.current)
  }, deps)
  return ref
}

export function App() {
  const { inputs, setInputs, update, computed, reset } = useAppState()
  const [toast, setToast] = useState<string | null>(null)
  const [notes, setNotes] = useState<string>('')
  const [oneMinute, setOneMinute] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('mopo-one-minute') || 'false') } catch { return false }
  })
  const [hasSeenCover, setHasSeenCover] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('mopo-has-seen-cover') || 'false') } catch { return false }
  })
  const [presetNarrative, setPresetNarrative] = useState<string>('')
  useEffect(() => { localStorage.setItem('mopo-one-minute', JSON.stringify(oneMinute)) }, [oneMinute])

  // KPIs and charts data
  const k = computed
  const e = useMemo(() => getEffective(inputs), [inputs])
  const activeEffects = useMemo(() => describeActiveEffects(inputs), [inputs])

  // Charts (minimal set)
  const lineRef = useCanvas((c) => drawLine(c, computed.fleet.cumulative_cash), [computed.fleet.cumulative_cash])
  const tornadoRef = useCanvas((c) => {
    const base = computeAll(inputs).perHub.ebitda
    const clone = (x: Inputs) => JSON.parse(JSON.stringify(x)) as Inputs
    const sample = (mut: (x: Inputs) => void) => { const cp = clone(inputs); mut(cp); return computeAll(cp).perHub.ebitda }
    const dPrice = sample(x => { x.sensitivity.price_multiplier = 1.2 }) - sample(x => { x.sensitivity.price_multiplier = 0.8 })
    const dUtil = sample(x => { x.sensitivity.utilization_target_pct_override = 95 }) - sample(x => { x.sensitivity.utilization_target_pct_override = 40 })
    const dLife = sample(x => { x.sensitivity.life_multiplier = 1.3 }) - sample(x => { x.sensitivity.life_multiplier = 0.7 })
    const dComm = sample(x => { x.sensitivity.commission_pct_override = 25 }) - sample(x => { x.sensitivity.commission_pct_override = 5 })
    const dRepl = sample(x => { x.sensitivity.replacement_pct_override = 3 }) - sample(x => { x.sensitivity.replacement_pct_override = 0 })
    drawTornado(c, ['Price', 'Utilization', 'Life', 'Commission', 'Attrition'], [dPrice, dUtil, dLife, dComm, dRepl])
  }, [inputs])
  const waterfallRef = useCanvas((c) => {
    const price = inputs.pricing.price_per_swap
    const comm = -price * ( (inputs.sensitivity.commission_pct_override ?? inputs.hub.agent_commission_pct_of_gross) / 100 )
    const svc = - (inputs.battery.servicing_cost_per_cycle)
    const attr = - ( (inputs.sensitivity.replacement_pct_override ?? inputs.battery.failure_replacement_rate_monthly_pct) / 100 * inputs.battery.battery_capex / 12 ) / Math.max(1, computed.perBattery.swaps_per_month) // per-swap attrition
    const contrib = price + comm + svc + attr
    drawWaterfall(c, ['Price','Commission','Servicing','Losses','Contribution/swap'], [price, comm, svc, attr, contrib - (price + comm + svc + attr)])
  }, [inputs, computed.perBattery.swaps_per_month])

  function showToast(s: string) {
    setToast(s)
    setTimeout(() => setToast(null), 2000)
  }

  function loadPreset(kind: PresetKey) {
    const prev = inputs
    const patch = kind === 'nigeria' ? nigeriaPreset(inputs) : kind === 'drc' ? drcPreset(inputs) : genericPreset(inputs)
    const next = { ...prev, ...patch }
    // Update baselines to new prices
    next.baselines = {
      baseline_price: next.pricing.price_per_swap,
    }
    setInputs(next)
    setPresetNarrative(PRESET_NARRATIVE[kind])
    // Changed fields list
    const changed: string[] = []
    if (prev.pricing.price_per_swap !== next.pricing.price_per_swap) changed.push(`price ${fmtDelta(prev.pricing.price_per_swap, next.pricing.price_per_swap)}`)
    if (prev.pricing.swaps_per_battery_per_day !== next.pricing.swaps_per_battery_per_day) changed.push(`swaps/day ${fmtDelta(prev.pricing.swaps_per_battery_per_day, next.pricing.swaps_per_battery_per_day)}`)
    if (prev.hub.hub_opex_per_month !== next.hub.hub_opex_per_month) changed.push(`hub opex ${fmtDelta(prev.hub.hub_opex_per_month, next.hub.hub_opex_per_month)}`)
    if (prev.hub.agent_commission_pct_of_gross !== next.hub.agent_commission_pct_of_gross) changed.push(`commission ${fmtDelta(prev.hub.agent_commission_pct_of_gross, next.hub.agent_commission_pct_of_gross)}%`)
    if (prev.scale.utilization_target_pct !== next.scale.utilization_target_pct) changed.push(`utilization target ${fmtDelta(prev.scale.utilization_target_pct, next.scale.utilization_target_pct)}%`)
    showToast(`${kind.toUpperCase()} preset: ${changed.join(', ')}`)
  }
  function fmtDelta(a: number, b: number) { const d = b - a; const s = d>=0?'+':''; return `${s}${d.toFixed(2)}` }

  function copySnapshot() {
    const snap: Snapshot = { inputs, computed }
    navigator.clipboard.writeText(JSON.stringify(snap, null, 2))
    showToast('Snapshot copied to clipboard')
  }

  function exportCSV() {
    const rows: string[] = []
    const c = computed
    rows.push('Scope,Metric,Value,Unit')
    rows.push(['Per-battery/month','Revenue', f(c.perBattery.revenue),'USD'].join(','))
    rows.push(['Per-battery/month','Commission', f(c.perBattery.commission),'USD'].join(','))
    rows.push(['Per-battery/month','Servicing', f(c.perBattery.servicing),'USD'].join(','))
    rows.push(['Per-battery/month','Losses (damage/theft)', f(c.perBattery.attrition_cost),'USD'].join(','))
    rows.push(['Per-battery/month','Cash contribution', f(c.perBattery.contribution_margin),'USD'].join(','))
    rows.push(['Per-battery/month','Breakeven cycles (capex recovery)', f(c.perBattery.breakeven_cycles),'cycles'].join(','))
    rows.push(['Per-battery/month','Payback months (battery, cash)', c.perBattery.payback_months_battery ?? '', 'months'].join(','))
    rows.push(['Per-hub/month','Revenue', f(c.perHub.revenue), 'USD'].join(','))
    rows.push(['Per-hub/month','EBITDA', f(c.perHub.ebitda), 'USD'].join(','))
    rows.push(['Fleet','Monthly EBITDA', f(c.fleet.ebitda_monthly), 'USD'].join(','))
    rows.push(['Fleet','NPV (horizon)', f(c.fleet.npv_horizon), 'USD'].join(','))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mopo_metrics.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showToast('CSV exported')
  }

  function f(n: number) { return Number.isFinite(n) ? n.toFixed(2) : '' }

  // Results cards tooltips
  const tipRevenue = 'Revenue = price_per_swap * swaps_per_day * days_per_month'
  const tipServicing = 'Servicing cost = servicing_cost_per_cycle * swaps'
  const tipDepreciation = 'Battery wear-and-tear (non-cash) = (battery_capex / expected_life_cycles) * swaps_this_month'
  const tipCommission = 'Commission = agent_commission_% * gross_revenue'
  const tipEBITDA = 'EBITDA = sum(battery cash contributions) − hub_opex'
  const tipElasticity = '−0.9 means 10% price hike ⇒ ~9% fewer swaps; −10% price ⇒ ~9% more.'

  return (
    <div className="max-w-[1200px] mx-auto p-4 space-y-3">
      {/* Cover Screen */}
      {!hasSeenCover && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6 text-center">
          <h1 className="text-2xl font-semibold mb-2">MOPO Universal Economics – MOPOMax (2 kWh)</h1>
          <p className="text-slate-600 mb-6">Exploring unit economics for battery swapping at scale</p>
          <button className="px-4 py-2 border rounded" onClick={() => { localStorage.setItem('mopo-has-seen-cover','true'); setHasSeenCover(true) }}>Start</button>
        </div>
      )}
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">MOPO Universal Economics – MOPOMax (2 kWh)</h1>
        <div className="flex gap-2">
          <button className="px-3 py-1 border rounded" onClick={() => { setInputs(defaultInputs()); showToast('Reset to defaults') }}>Reset</button>
          <button className="px-3 py-1 border rounded" onClick={() => loadPreset('nigeria')}>Nigeria</button>
          <button className="px-3 py-1 border rounded" onClick={() => loadPreset('drc')}>DRC</button>
          <button className="px-3 py-1 border rounded" onClick={() => loadPreset('generic')}>Generic</button>
          <button className={`px-3 py-1 border rounded ${oneMinute ? 'bg-slate-100' : ''}`} onClick={() => setOneMinute(!oneMinute)}>One‑Minute Mode</button>
        </div>
      </header>

      {toast && <div className="fixed top-3 right-3 bg-black text-white text-sm px-3 py-2 rounded shadow">{toast}</div>}
      {presetNarrative && <div className="text-sm text-slate-600">{presetNarrative}</div>}

      {/* Pinned KPI Strip */}
      <div className="sticky top-0 bg-slate-50 py-2 z-10">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border rounded p-3 text-center">
            <div className="text-xs text-slate-500">Hub EBITDA (post‑opex)</div>
            <div className="text-xl font-semibold" title={tipEBITDA}>${f(computed.badges.hub_ebitda)}</div>
          </div>
          <div className="bg-white border rounded p-3 text-center">
            <div className="text-xs text-slate-500">Payback (months)</div>
            <div className="text-xl font-semibold">{computed.badges.breakeven_months ?? '—'}</div>
          </div>
          <div className="bg-white border rounded p-3 text-center">
            <div className="text-xs text-slate-500">Fleet NPV</div>
            <div className="text-xl font-semibold">${f(computed.badges.fleet_npv)}</div>
          </div>
        </div>
      </div>

      {/* One-sentence Narrative */}
      <div className="bg-white border rounded p-3 text-sm">{buildNarrative(inputs, computed)}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left column – Assumptions */}
        {!oneMinute && (<div className="space-y-3">
          <Section title="Pricing & Demand">
            <Num label="price_per_swap" suffix="$" value={inputs.pricing.price_per_swap}
                 onChange={(v) => update('pricing', { ...inputs.pricing, price_per_swap: v })}
                 title="Price per battery swap (currency)" />
            <Num label="swaps_per_battery_per_day" value={inputs.pricing.swaps_per_battery_per_day}
                 onChange={(v) => update('pricing', { ...inputs.pricing, swaps_per_battery_per_day: v })}
                 title="Baseline swaps/day per battery at baseline price" />
            <Num label="hub_active_days_per_month" value={inputs.pricing.hub_active_days_per_month}
                 onChange={(v) => update('pricing', { ...inputs.pricing, hub_active_days_per_month: v })}
                 title="Operating days per month" />
            <Slider label="Customer sensitivity to price" value={inputs.pricing.elasticity_per_10pct}
                    onChange={(v) => update('pricing', { ...inputs.pricing, elasticity_per_10pct: v })}
                    min={-1.5} max={-0.1} step={0.1} title={tipElasticity} />
          </Section>

          <Section title="Battery Costs & Performance">
            <Num label="battery_capex" value={inputs.battery.battery_capex} onChange={(v) => update('battery', { ...inputs.battery, battery_capex: v })} suffix="$" />
            <Num label="expected_life_cycles" value={inputs.battery.expected_life_cycles} onChange={(v) => update('battery', { ...inputs.battery, expected_life_cycles: v })} />
            <Num label="failure_replacement_rate_monthly_pct" value={inputs.battery.failure_replacement_rate_monthly_pct} onChange={(v) => update('battery', { ...inputs.battery, failure_replacement_rate_monthly_pct: v })} suffix="%" />
            <Num label="servicing_cost_per_cycle" value={inputs.battery.servicing_cost_per_cycle} onChange={(v) => update('battery', { ...inputs.battery, servicing_cost_per_cycle: v })} suffix="$" />
          </Section>

          <Section title="Hub Costs">
            <Num label="hub_capex" value={inputs.hub.hub_capex} onChange={(v) => update('hub', { ...inputs.hub, hub_capex: v })} suffix="$" />
            <Num label="hub_opex_per_month" value={inputs.hub.hub_opex_per_month} onChange={(v) => update('hub', { ...inputs.hub, hub_opex_per_month: v })} suffix="$" />
            <Num label="agent_commission_pct_of_gross" value={inputs.hub.agent_commission_pct_of_gross} onChange={(v) => update('hub', { ...inputs.hub, agent_commission_pct_of_gross: v })} suffix="%" />
          </Section>

          <Section title="Scale & Ops">
            <Num label="batteries_per_hub" value={inputs.scale.batteries_per_hub} onChange={(v) => update('scale', { ...inputs.scale, batteries_per_hub: v })} />
            <Num label="hubs_in_model" value={inputs.scale.hubs_in_model} onChange={(v) => update('scale', { ...inputs.scale, hubs_in_model: v })} />
            <Slider label="utilization_target_pct" value={inputs.scale.utilization_target_pct} onChange={(v) => update('scale', { ...inputs.scale, utilization_target_pct: v })} min={30} max={100} step={1} suffix="%" />
            <Num label="swap_time_minutes" value={inputs.scale.swap_time_minutes} onChange={(v) => update('scale', { ...inputs.scale, swap_time_minutes: v })} title="Affects theoretical max daily swaps per battery" />
          </Section>

          <Section title="Finance">
            <Num label="discount_rate_%" value={inputs.finance.discount_rate_pct} onChange={(v) => update('finance', { ...inputs.finance, discount_rate_pct: v })} suffix="%" />
            <Num label="analysis_horizon_months" value={inputs.finance.analysis_horizon_months} onChange={(v) => update('finance', { ...inputs.finance, analysis_horizon_months: v })} />
          </Section>
        </div>)}

        {/* Right column – Results */}
        <div className="space-y-3">
          {/* Unit Economics Card */}
          <Section title="Per-Battery (monthly)">
            <div className="border rounded p-3">
              <div className="text-sm flex justify-between"><span title={tipRevenue}>Revenue</span><span>${f(computed.perBattery.revenue)}</span></div>
              <div className="text-sm flex justify-between"><span title={tipCommission}>Commission</span><span>${f(computed.perBattery.commission)}</span></div>
              <div className="text-sm flex justify-between"><span title={tipServicing}>Servicing</span><span>${f(computed.perBattery.servicing)}</span></div>
              <div className="text-sm flex justify-between"><span>Losses (damage/theft)</span><span>${f(computed.perBattery.attrition_cost)}</span></div>
              <div className="text-sm flex justify-between font-semibold"><span>Cash contribution</span><span>${f(computed.perBattery.contribution_margin)}</span></div>
              <div className="text-sm flex justify-between"><span>Battery wear-and-tear (non-cash)</span><span>${f(computed.perBattery.depreciation_economic)}</span></div>
              <div className="text-xs text-slate-500 mt-1">Breakeven cycles (recover capex; excl. wear-and-tear): {Number.isFinite(computed.perBattery.breakeven_cycles) ? computed.perBattery.breakeven_cycles.toFixed(0) : '—'}</div>
              <div className="text-xs text-slate-500">Battery payback (months; cash): {computed.perBattery.payback_months_battery ?? '—'}</div>
              <div className="text-xs text-slate-500 mt-1">
                Utilization: actual {computed.perBattery.swaps_per_day.toFixed(1)}/day · theoretical cap {theoretical_cap_swaps_per_day(inputs.scale.utilization_target_pct, inputs.scale.swap_time_minutes).toFixed(1)}/day · {(computed.perHub.utilization_ratio * 100).toFixed(0)}% of cap
              </div>
            </div>
          </Section>

          <Section title="Per-hub per-month">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span>EBITDA</span><span>${f(computed.perHub.ebitda)}</span></div>
              <div className="flex justify-between"><span>Payback months</span><span>{computed.perHub.payback_months ?? '—'}</span></div>
              <div className="flex justify-between"><span>IRR (monthly)</span><span>{computed.perHub.irr_monthly !== null ? (computed.perHub.irr_monthly * 100).toFixed(2) + '%' : '—'}</span></div>
              <div className="flex justify-between"><span>Utilization vs cap</span><span>{(computed.perHub.utilization_ratio * 100).toFixed(0)}%</span></div>
            </div>
          </Section>

          <Section title="Fleet (N hubs)">
            <div className="flex justify-between text-sm">
              <span>Monthly EBITDA (fleet)</span>
              <span>${f(computed.fleet.ebitda_monthly)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>NPV (horizon)</span>
              <span>${f(computed.fleet.npv_horizon)}</span>
            </div>
            <div className="mt-2">
              <canvas ref={lineRef} className="w-full h-40" />
            </div>
          </Section>

          {!oneMinute && <Section title="Sensitivity Panel">
            <Slider label="Price ±20%" value={inputs.sensitivity.price_multiplier} onChange={v => update('sensitivity', { ...inputs.sensitivity, price_multiplier: v })} min={0.8} max={1.2} step={0.01} />
            <Slider label="Utilization 40–95%" value={inputs.sensitivity.utilization_target_pct_override ?? e.utilizationTargetPct} onChange={v => update('sensitivity', { ...inputs.sensitivity, utilization_target_pct_override: v })} min={40} max={95} step={1} suffix="%" />
            <Slider label="Battery life −30% … +30%" value={inputs.sensitivity.life_multiplier} onChange={v => update('sensitivity', { ...inputs.sensitivity, life_multiplier: v })} min={0.7} max={1.3} step={0.01} />
            <Slider label="Commission 5–25%" value={inputs.sensitivity.commission_pct_override ?? inputs.hub.agent_commission_pct_of_gross} onChange={v => update('sensitivity', { ...inputs.sensitivity, commission_pct_override: v })} min={5} max={25} step={1} suffix="%" />
            <Slider label="Replacement 0–3%/mo" value={inputs.sensitivity.replacement_pct_override ?? inputs.battery.failure_replacement_rate_monthly_pct} onChange={v => update('sensitivity', { ...inputs.sensitivity, replacement_pct_override: v })} min={0} max={3} step={0.1} suffix="%" />
            <div className="mt-2 text-xs text-slate-600 flex flex-wrap gap-2">
              {activeEffects.map((e, i) => <span key={i} className="px-2 py-1 bg-slate-100 rounded">{e}</span>)}
            </div>
          </Section>}

          {/* Guided Scenarios */}
          <Section title="Guided Scenarios">
            <div className="flex flex-wrap gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => { update('stress', { ...inputs.stress, demand_shock_10: true }); document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth' }) }}>What if demand drops 10%?</button>
              <button className="px-3 py-1 border rounded" onClick={() => { update('stress', { ...inputs.stress, life_drop_20: true }); document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth' }) }}>What if battery life is 20% shorter?</button>
              <button className="px-3 py-1 border rounded" onClick={() => { update('stress', { ...inputs.stress, price_minus_10_vs_fuel: true }); document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth' }) }}>What if fuel prices fall 10%?</button>
              <button className="px-3 py-1 border rounded" onClick={() => { update('stress', { ...inputs.stress, hub_opex_plus_20: true }); document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth' }) }}>Ops cost shock (+20% hub opex)</button>
            </div>
            <div className="text-xs text-slate-600 mt-1">Applied: toggles in Stress Tests; KPIs and charts update.</div>
          </Section>

          <Section title="Stress Tests">
            <div className="grid grid-cols-2 gap-2">
              <Checkbox label="Demand −10%" checked={inputs.stress.demand_shock_10} onChange={(b) => update('stress', { ...inputs.stress, demand_shock_10: b })} />
              <Checkbox label="Battery life −20%" checked={inputs.stress.life_drop_20} onChange={(b) => update('stress', { ...inputs.stress, life_drop_20: b })} />
              <Checkbox label="FX −15% (capex)" checked={inputs.stress.fx_minus_15_capex} onChange={(b) => update('stress', { ...inputs.stress, fx_minus_15_capex: b })} />
              <Checkbox label="Hub OPEX +20%" checked={inputs.stress.hub_opex_plus_20} onChange={(b) => update('stress', { ...inputs.stress, hub_opex_plus_20: b })} />
              <Checkbox label="Theft/damage +2%/mo" checked={inputs.stress.theft_damage_plus_2pct} onChange={(b) => update('stress', { ...inputs.stress, theft_damage_plus_2pct: b })} />
              <Checkbox label="Price −10% vs fuel" checked={inputs.stress.price_minus_10_vs_fuel} onChange={(b) => update('stress', { ...inputs.stress, price_minus_10_vs_fuel: b })} />
            </div>
            <div className="flex gap-2 mt-2">
              <Chip ok={computed.passFail.breakeven_lt_18m} label="breakeven < 18 months" />
              <Chip ok={computed.passFail.hub_ebitda_gt_target} label="hub EBITDA > $target" />
              <Chip ok={computed.passFail.npv_positive} label="NPV > 0" />
            </div>
          </Section>

          {/* Minimal Chart Set */}
          <div id="charts" className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Section title="Tornado – Sensitivity">
              <canvas ref={tornadoRef} className="w-full h-40" />
            </Section>
            <Section title="Per‑swap Waterfall">
              <canvas ref={waterfallRef} className="w-full h-40" />
            </Section>
            <Section title="Cashflow – Cumulative EBITDA">
              <canvas ref={lineRef} className="w-full h-40" />
            </Section>
          </div>

          {!oneMinute && <Section title="Bottom – Notes & Export">
            <textarea className="w-full h-24 border rounded p-2 text-sm" placeholder="Key Questions & Assumptions to Validate" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex gap-2 mt-2">
              <button className="px-3 py-1 border rounded" onClick={copySnapshot}>Copy snapshot to clipboard (JSON)</button>
              <button className="px-3 py-1 border rounded" onClick={exportCSV}>Export CSV (hub & battery metrics)</button>
            </div>
          </Section>}
        </div>
      </div>
    </div>
  )
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`px-2 py-1 rounded text-xs ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{label}</span>
  )
}
