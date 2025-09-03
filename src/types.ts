export type PricingDemand = {
  price_per_swap: number
  swaps_per_battery_per_day: number
  hub_active_days_per_month: number
  elasticity_per_10pct: number // negative, e.g. -1.0
}

export type BatteryCosts = {
  battery_capex: number
  expected_life_cycles: number
  failure_replacement_rate_monthly_pct: number
  servicing_cost_per_cycle: number
}

export type HubCosts = {
  hub_capex: number
  hub_opex_per_month: number
  agent_commission_pct_of_gross: number
}

export type ScaleOps = {
  batteries_per_hub: number
  hubs_in_model: number
  utilization_target_pct: number
  swap_time_minutes: number
}

export type Finance = {
  discount_rate_pct: number // annual
  analysis_horizon_months: number
}

export type Sensitivity = {
  price_multiplier: number // 0.8..1.2 for sliders
  utilization_target_pct_override?: number // 40..95
  life_multiplier: number // 0.7..1.3
  commission_pct_override?: number // optional override
  replacement_pct_override?: number // optional override (monthly %)
}

export type StressTests = {
  demand_shock_10: boolean
  life_drop_20: boolean
  fx_minus_15_capex: boolean
  hub_opex_plus_20: boolean
  theft_damage_plus_2pct: boolean
  price_minus_10_vs_fuel: boolean
}

export type Baselines = {
  baseline_price: number
}

export type Inputs = {
  pricing: PricingDemand
  battery: BatteryCosts
  hub: HubCosts
  scale: ScaleOps
  finance: Finance
  sensitivity: Sensitivity
  stress: StressTests
  baselines: Baselines
}

export type PerBatteryMonthly = {
  swaps_per_day: number
  swaps_per_month: number
  revenue: number
  commission: number
  servicing: number
  allocated_opex: number
  contribution_margin: number
  depreciation_economic: number
  attrition_cost: number
  breakeven_cycles: number
  payback_months_battery: number | null
}

export type PerHubMonthly = {
  revenue: number
  commission: number
  servicing: number
  opex: number
  ebitda: number
  payback_months: number | null
  irr_monthly: number | null
  utilization_ratio: number // actual / target cap
}

export type FleetKPIs = {
  hubs: number
  ebitda_monthly: number
  npv_horizon: number
  cumulative_cash: number[]
}

export type KPIBadge = {
  hub_ebitda: number
  breakeven_months: number | null
  fleet_npv: number
}

export type Computed = {
  perBattery: PerBatteryMonthly
  perHub: PerHubMonthly
  fleet: FleetKPIs
  badges: KPIBadge
  passFail: {
    breakeven_lt_18m: boolean
    hub_ebitda_gt_target: boolean
    npv_positive: boolean
  }
}

export type Snapshot = {
  inputs: Inputs
  computed: Computed
}

export const TARGETS = {
  amortisation_months_hub: 60,
  target_hub_ebitda_usd: 500, // threshold for pass/fail chip
}

export type PresetKey = 'nigeria' | 'drc' | 'generic'
