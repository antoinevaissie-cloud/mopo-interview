import { Inputs, PresetKey } from './types'

export type Preset = PresetKey

export function nigeriaPreset(base: Inputs): Partial<Inputs> {
  return {
    pricing: {
      ...base.pricing,
      price_per_swap: 4.5,
      swaps_per_battery_per_day: 1.0,
    },
    hub: {
      ...base.hub,
      hub_opex_per_month: 380,
      agent_commission_pct_of_gross: 18,
    },
    scale: {
      ...base.scale,
      utilization_target_pct: 88,
    },
  }
}

export function drcPreset(base: Inputs): Partial<Inputs> {
  return {
    pricing: {
      ...base.pricing,
      price_per_swap: 5.2,
      swaps_per_battery_per_day: 1.1,
    },
    hub: {
      ...base.hub,
      hub_opex_per_month: 450,
      agent_commission_pct_of_gross: 20,
    },
    scale: {
      ...base.scale,
      utilization_target_pct: 85,
    },
  }
}

export function genericPreset(base: Inputs): Partial<Inputs> {
  return {
    pricing: {
      ...base.pricing,
      price_per_swap: 4.0,
      swaps_per_battery_per_day: 0.9,
    },
    hub: {
      ...base.hub,
      hub_opex_per_month: 400,
      agent_commission_pct_of_gross: 18,
    },
    scale: {
      ...base.scale,
      utilization_target_pct: 85,
    },
  }
}

export const PRESET_NARRATIVE: Record<Preset, string> = {
  nigeria: 'Higher demand from outages; moderate opex; mid commission.',
  drc: 'Higher opex/logistics; strong generator-replacement demand.',
  generic: 'Neutral baseline for quick comparisons.',
}
