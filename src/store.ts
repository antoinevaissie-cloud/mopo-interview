import { useEffect, useMemo, useState } from 'react'
import { Computed, Inputs, Snapshot, TARGETS } from './types'
import { getEffective } from './effects'
import { swapsPerDayPerBattery } from './demand'
import { fleetKPIs, kpiBadges, perHubMonthlyAndProject } from './finance'

const LS_KEY = 'mopo-universal-v1'

export function defaultInputs(): Inputs {
  const price = 4.0
  return {
    pricing: {
      price_per_swap: price,
      swaps_per_battery_per_day: 0.9,
      hub_active_days_per_month: 26,
      elasticity_per_10pct: -1.0,
    },
    battery: {
      battery_capex: 800,
      expected_life_cycles: 1200,
      failure_replacement_rate_monthly_pct: 1.0,
      servicing_cost_per_cycle: 0.4,
    },
    hub: {
      hub_capex: 15000,
      hub_opex_per_month: 400,
      agent_commission_pct_of_gross: 18,
    },
    scale: {
      batteries_per_hub: 30,
      hubs_in_model: 5,
      utilization_target_pct: 85,
      swap_time_minutes: 30,
    },
    finance: {
      discount_rate_pct: 18,
      analysis_horizon_months: 36,
    },
    sensitivity: {
      price_multiplier: 1,
      life_multiplier: 1,
    },
    stress: {
      demand_shock_10: false,
      life_drop_20: false,
      fx_minus_15_capex: false,
      hub_opex_plus_20: false,
      theft_damage_plus_2pct: false,
      price_minus_10_vs_fuel: false,
    },
    baselines: {
      baseline_price: price,
    },
  }
}

export function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {}
  }, [key, state])
  return [state, setState] as const
}

export function computeAll(inputs: Inputs): Computed {
  const e = getEffective(inputs)
  const d = swapsPerDayPerBattery(e)
  const { perHub, series, cashSeries, npvTotal } = perHubMonthlyAndProject(e, d.perDay, d.utilizationRatio)

  const totalBatteriesAtHub = e.batteriesPerHub
  const pb = {
    swaps_per_day: d.perDay,
    swaps_per_month: d.perDay * e.daysPerMonth,
    revenue: d.perDay * e.daysPerMonth * e.price,
    commission: d.perDay * e.daysPerMonth * e.price * (e.commissionPct / 100),
    servicing: d.perDay * e.daysPerMonth * e.servicingPerCycle,
    allocated_opex: 0, // Option A: do not allocate hub opex at battery level
    contribution_margin: 0, // filled next (cash-only)
    depreciation_economic: (e.capexBatt / Math.max(1, e.life)) * d.perDay * e.daysPerMonth,
    attrition_cost: (e.replacePct / 100) * e.capexBatt / 12,
    breakeven_cycles: ((): number => {
      const perCycleMargin = e.price - (e.commissionPct / 100) * e.price - e.servicingPerCycle
      return perCycleMargin > 0 ? e.capexBatt / perCycleMargin : Infinity
    })(),
    payback_months_battery: null as number | null,
  }
  pb.contribution_margin = pb.revenue - pb.commission - pb.servicing - pb.attrition_cost
  pb.payback_months_battery = pb.contribution_margin > 0 ? Math.ceil(e.capexBatt / pb.contribution_margin) : null

  const fleet = fleetKPIs(e, perHub, series, cashSeries)
  const badges = kpiBadges(perHub, fleet)
  const passFail = {
    breakeven_lt_18m: (perHub.payback_months ?? Infinity) < 18,
    hub_ebitda_gt_target: perHub.ebitda > TARGETS.target_hub_ebitda_usd,
    npv_positive: fleet.npv_horizon > 0,
  }
  return {
    perBattery: pb,
    perHub,
    fleet,
    badges,
    passFail,
  }
}

export function useAppState() {
  const [inputs, setInputs] = useLocalStorageState<Inputs>(LS_KEY, defaultInputs())
  const computed = useMemo(() => computeAll(inputs), [inputs])

  function update<K extends keyof Inputs>(section: K, next: Inputs[K]) {
    setInputs({ ...inputs, [section]: next })
  }

  function reset() {
    const d = defaultInputs()
    setInputs(d)
  }

  function snapshot(): Snapshot {
    return { inputs, computed }
  }

  return { inputs, setInputs, update, computed, reset }
}

// Worked example (in comments):
// Worked example: price −10% with elasticity −1.0
// Elasticity multiplier = (0.9)^(-1.0) ≈ 1.111 → swaps/day +11.1%.
// Revenue/month = price_per_swap_new * swaps/day_new * days.
// Commission = agent% * revenue. Servicing = per-cycle * swaps. Attrition = (failure% * capex / 12).
// Contribution/month = Revenue − Commission − Servicing − Allocated OPEX − Attrition.
// Battery Payback ≈ battery_capex / Contribution/month (if > 0). Hub Payback from cumulative EBITDA vs (hub_capex + battery pool).
