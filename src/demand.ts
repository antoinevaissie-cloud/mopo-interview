import { Effective } from './effects'

export function priceElasticityMultiplier(price: number, baseline: number, elasticityPer10: number): number {
  // Constant elasticity around baseline: Q' = Q * (P/P0)^ε
  const ratio = Math.max(0.01, price / Math.max(0.01, baseline))
  return Math.pow(ratio, elasticityPer10)
}

export function utilizationCapPerDay(utilizationPct: number, swapTimeMinutes: number): number {
  const utilFrac = Math.max(0, Math.min(1, utilizationPct / 100))
  const theoreticalPerDay = (24 * 60) / Math.max(1, swapTimeMinutes)
  return utilFrac * theoreticalPerDay
}

export function swapsPerDayPerBattery(e: Effective) {
  const mult = priceElasticityMultiplier(e.price, e.baselinePrice, e.elasticityPer10)
  const physical = e.baseSwapsPerDay * mult * e.demandMultiplier
  const cap = utilizationCapPerDay(e.utilizationTargetPct, e.swapTimeMins)
  const perDay = Math.min(physical, cap)
  const utilizationRatio = cap > 0 ? perDay / cap : 0
  return { perDay, cap, utilizationRatio }
}

export function theoretical_cap_swaps_per_day(utilizationPct: number, swapTimeMinutes: number): number {
  return utilizationCapPerDay(utilizationPct, swapTimeMinutes)
}
