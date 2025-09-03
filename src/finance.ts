import { Effective } from './effects'
import { Inputs } from './types'
import { PerBatteryMonthly, PerHubMonthly, FleetKPIs, KPIBadge, Computed } from './types'

export function npv(cash: number[], rateMonthly: number): number {
  return cash.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rateMonthly, i), 0)
}

export function irr(cash: number[], guess = 0.02): number | null {
  // Newton-Raphson with fallback bisection
  const maxIter = 100
  let r = guess
  const f = (rate: number) => cash.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0)
  const df = (rate: number) => cash.reduce((acc, cf, i) => acc - (i * cf) / Math.pow(1 + rate, i + 1), 0)
  for (let i = 0; i < maxIter; i++) {
    const fv = f(r)
    const d = df(r)
    if (Math.abs(d) < 1e-9) break
    const next = r - fv / d
    if (!isFinite(next)) break
    if (Math.abs(next - r) < 1e-6) return next
    r = next
  }
  // Bisection on [-0.99, 10]
  let lo = -0.99, hi = 10
  let flo = f(lo), fhi = f(hi)
  if (flo * fhi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (Math.abs(fm) < 1e-6) return mid
    if (flo * fm < 0) {
      hi = mid; fhi = fm
    } else {
      lo = mid; flo = fm
    }
  }
  return null
}

export function paybackMonths(cash: number[]): number | null {
  let cum = 0
  for (let i = 0; i < cash.length; i++) {
    cum += cash[i] ?? 0
    if (cum >= 0) return i
  }
  return null
}

export function perBatteryMonthly(e: Effective, swapsPerDay: number, totalBatteriesAtHub: number): PerBatteryMonthly {
  const days = e.daysPerMonth
  const swapsMonth = swapsPerDay * days
  const revenue = swapsMonth * e.price
  const commission = revenue * (e.commissionPct / 100)
  const servicing = swapsMonth * e.servicingPerCycle
  const allocatedOpex = e.hubOpex / Math.max(1, totalBatteriesAtHub)
  const depreciationEconomic = (e.capexBatt / Math.max(1, e.life)) * swapsMonth
  const attritionCost = (e.replacePct / 100) * e.capexBatt / 12
  const contribution = revenue - commission - servicing - allocatedOpex - attritionCost
  const perCycleMargin = e.price - (e.commissionPct / 100) * e.price - e.servicingPerCycle
  const breakevenCycles = perCycleMargin > 0 ? e.capexBatt / perCycleMargin : Infinity
  const payback = contribution > 0 ? Math.ceil(e.capexBatt / contribution) : null
  return {
    swaps_per_day: swapsPerDay,
    swaps_per_month: swapsMonth,
    revenue,
    commission,
    servicing,
    allocated_opex: allocatedOpex,
    contribution_margin: contribution,
    depreciation_economic: depreciationEconomic,
    attrition_cost: attritionCost,
    breakeven_cycles: breakevenCycles,
    payback_months_battery: payback,
  }
}

export type Series = {
  months: number
  ebitdaPerHub: number[]
}

export function buildSeries(e: Effective, swapsPerDay: number): Series {
  const m = e.horizonMonths
  const days = e.daysPerMonth
  const revenuePerHub = swapsPerDay * days * e.price * e.batteriesPerHub
  const commissionPerHub = revenuePerHub * (e.commissionPct / 100)
  const servicingPerHub = swapsPerDay * days * e.servicingPerCycle * e.batteriesPerHub
  const attritionPerHub = (e.replacePct / 100) * e.capexBatt / 12 * e.batteriesPerHub
  const ebitda = revenuePerHub - commissionPerHub - servicingPerHub - e.hubOpex - attritionPerHub
  const arr = Array.from({ length: m }, () => ebitda)
  return { months: m, ebitdaPerHub: arr }
}

export function perHubMonthlyAndProject(e: Effective, swapsPerDay: number, utilizationRatio: number) {
  const totalBatteries = e.batteriesPerHub
  const pb = perBatteryMonthly(e, swapsPerDay, totalBatteries)
  const revenue = pb.revenue * totalBatteries
  const commission = pb.commission * totalBatteries
  const servicing = pb.servicing * totalBatteries
  const opex = e.hubOpex
  const attritionPerHub = pb.attrition_cost * totalBatteries
  const ebitda = revenue - commission - servicing - opex - attritionPerHub

  // Project flows for payback and IRR/NPV (no salvage per spec)
  const series = buildSeries(e, swapsPerDay)
  const initOutflow = -(e.capexHub + e.capexBatt * e.batteriesPerHub)
  const cash: number[] = [initOutflow]
  for (let t = 0; t < series.months; t++) cash.push(series.ebitdaPerHub[t] ?? 0)
  const rMonthly = e.discountRatePct / 100 / 12
  const irrMonthly = irr(cash)
  const npvTotal = npv(cash, rMonthly)
  const payback = paybackMonths(cash)

  const perHub: PerHubMonthly = {
    revenue,
    commission,
    servicing,
    opex,
    ebitda,
    payback_months: payback,
    irr_monthly: irrMonthly,
    utilization_ratio: utilizationRatio,
  }

  return { perHub, cashSeries: cash, series, npvTotal }
}

export function fleetKPIs(e: Effective, perHub: PerHubMonthly, series: Series, cashSeries: number[]): FleetKPIs {
  const hubs = e.hubsInModel
  const monthlyEbitdaFleet = perHub.ebitda * hubs
  const rMonthly = e.discountRatePct / 100 / 12
  const cashFleet = cashSeries.map((v, i) => v * (i === 0 ? hubs : hubs)) // scale all equally
  const npvHorizon = npv(cashFleet, rMonthly)
  const cum: number[] = []
  let running = cashFleet[0] ?? 0
  cum.push(running)
  for (let i = 1; i < cashFleet.length; i++) {
    running += cashFleet[i] ?? 0
    cum.push(running)
  }

  return { hubs, ebitda_monthly: monthlyEbitdaFleet, npv_horizon: npvHorizon, cumulative_cash: cum }
}

export function kpiBadges(perHub: PerHubMonthly, fleet: FleetKPIs): KPIBadge {
  return {
    hub_ebitda: perHub.ebitda,
    breakeven_months: perHub.payback_months,
    fleet_npv: fleet.npv_horizon,
  }
}

// Interview helpers
export function formatMoney(n: number): string {
  if (!isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n)
  if (v >= 1_000_000) return `${sign}${(v/1_000_000).toFixed(1)}m`
  if (v >= 1_000) return `${sign}${(v/1_000).toFixed(1)}k`
  return `${sign}${v.toFixed(0)}`
}

export function computeKpis(computed: Computed) {
  return {
    hubEbitda: computed.perHub.ebitda,
    paybackMonths: computed.perHub.payback_months,
    fleetNpv: computed.fleet.npv_horizon,
  }
}

export function buildNarrative(inputs: Inputs, computed: Computed): string {
  const price = inputs.pricing.price_per_swap
  const swaps = computed.perBattery.swaps_per_day
  const contrib = computed.perBattery.contribution_margin
  const bats = inputs.scale.batteries_per_hub
  const opex = inputs.hub.hub_opex_per_month
  const ebitda = computed.perHub.ebitda
  const pb = computed.perHub.payback_months
  const horizon = inputs.finance.analysis_horizon_months
  const npv = computed.fleet.npv_horizon
  return `At $${price.toFixed(2)}/swap and ${swaps.toFixed(1)} swaps/day, each battery contributes $${formatMoney(contrib)}/month (cash). With ${bats} batteries and $${formatMoney(opex)} opex, the hub delivers $${formatMoney(ebitda)} EBITDA and breaks even in ${pb ?? '—'} months; fleet NPV over ${horizon} months is $${formatMoney(npv)}.`
}
