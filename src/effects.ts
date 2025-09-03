import { Inputs, TARGETS } from './types'

export type Effective = ReturnType<typeof getEffective>

export function getEffective(inputs: Inputs) {
  const s = inputs.sensitivity
  const stress = inputs.stress

  // Base copies and sensitivity
  let price = inputs.pricing.price_per_swap * s.price_multiplier
  let commissionPct = s.commission_pct_override ?? inputs.hub.agent_commission_pct_of_gross
  let replacePct = s.replacement_pct_override ?? inputs.battery.failure_replacement_rate_monthly_pct
  let life = inputs.battery.expected_life_cycles * s.life_multiplier
  let capexBatt = inputs.battery.battery_capex
  let capexHub = inputs.hub.hub_capex
  let hubOpex = inputs.hub.hub_opex_per_month

  // Stress tests
  let demandMultiplier = 1
  if (stress.demand_shock_10) demandMultiplier *= 0.9
  if (stress.life_drop_20) life *= 0.8
  if (stress.fx_minus_15_capex) { capexBatt *= 1.15; capexHub *= 1.15 }
  if (stress.hub_opex_plus_20) hubOpex *= 1.2
  if (stress.theft_damage_plus_2pct) replacePct += 2
  if (stress.price_minus_10_vs_fuel) price *= 0.9

  const utilizationTargetPct = s.utilization_target_pct_override ?? inputs.scale.utilization_target_pct

  return {
    // Effective params
    price,
    commissionPct,
    replacePct,
    life,
    capexBatt,
    capexHub,
    hubOpex,
    utilizationTargetPct,
    servicingPerCycle: inputs.battery.servicing_cost_per_cycle,
    // Demand drivers & structure
    demandMultiplier,
    daysPerMonth: inputs.pricing.hub_active_days_per_month,
    baseSwapsPerDay: inputs.pricing.swaps_per_battery_per_day,
    elasticityPer10: inputs.pricing.elasticity_per_10pct,
    swapTimeMins: inputs.scale.swap_time_minutes,
    batteriesPerHub: inputs.scale.batteries_per_hub,
    hubsInModel: inputs.scale.hubs_in_model,
    discountRatePct: inputs.finance.discount_rate_pct,
    horizonMonths: inputs.finance.analysis_horizon_months,
    amortMonthsHub: TARGETS.amortisation_months_hub,
    baselinePrice: inputs.baselines.baseline_price,
  }
}

export function describeActiveEffects(inputs: Inputs): string[] {
  const out: string[] = []
  if (inputs.sensitivity.price_multiplier !== 1) out.push(`Price x${inputs.sensitivity.price_multiplier.toFixed(2)}`)
  if (inputs.sensitivity.life_multiplier !== 1) out.push(`Life x${inputs.sensitivity.life_multiplier.toFixed(2)}`)
  if (inputs.sensitivity.utilization_target_pct_override !== undefined) out.push(`Utilization ${inputs.sensitivity.utilization_target_pct_override}%`)
  if (inputs.sensitivity.commission_pct_override !== undefined) out.push(`Commission ${inputs.sensitivity.commission_pct_override}%`)
  if (inputs.sensitivity.replacement_pct_override !== undefined) out.push(`Replacement ${inputs.sensitivity.replacement_pct_override}%`)
  if (inputs.stress.demand_shock_10) out.push('Demand −10%')
  if (inputs.stress.life_drop_20) out.push('Life −20%')
  if (inputs.stress.fx_minus_15_capex) out.push('FX −15% (capex↑)')
  if (inputs.stress.hub_opex_plus_20) out.push('Hub opex +20%')
  if (inputs.stress.theft_damage_plus_2pct) out.push('Theft/damage +2%/mo')
  if (inputs.stress.price_minus_10_vs_fuel) out.push('Price −10% vs fuel')
  return out
}
