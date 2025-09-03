# MOPO Universal Economics – MOPOMax (2 kWh)

Zero-backend, one-page dashboard built with Vite + React + TypeScript + Tailwind. No servers, no DB, no external chart libs; all charts use `<canvas>`.

## 60-second run instructions

- Prereqs: Node.js 18+ installed
- Install deps: `npm install`
- Start dev server: `npm run dev`
- Open the URL shown (usually `http://localhost:5173`)

That’s it. All state persists in `localStorage`. No server or database required.

## Project layout

- `index.html` – single-page shell
- `src/App.tsx` – UI and interactions
- `src/store.ts` – state, localStorage, compute pipeline
- `src/effects.ts` – stress + sensitivity composition to effective params
- `src/demand.ts` – utilization cap, elasticity, swap-time caps
- `src/finance.ts` – EBITDA, IRR/NPV, payback, cycles
- `src/charts.ts` – lightweight `<canvas>` charts (spider/line/bar/sparkline)
- `src/presets.ts` – Nigeria/DRC/Generic presets
- `src/types.ts` – strict TypeScript types and targets

## Notes

- Acceptance checklist: presets, JSON snapshot, CSV export, instant recompute, stress-test chips, and charts are implemented.
- “Worked example” lives as comments at the end of `src/store.ts`.
- Hub amortisation guidance is parameterized via `TARGETS.amortisation_months_hub = 60`.

## No network calls

The app does not fetch or post anything. All calculations are local.

## Formulas (short list)
- Demand cap/battery = min( physical_demand(price, elasticity), utilization_cap_from_swap_time ).
- Utilization cap = (24*60 / swap_time_minutes) * utilization_target_pct.
- Elasticity multiplier = (price / baseline_price)^elasticity.
- Revenue/month (battery) = price_per_swap * swaps/day_adjusted * hub_active_days.
- Commission = agent_commission_pct_of_gross * revenue.
- Servicing = servicing_cost_per_cycle * swaps.
- Economic depreciation (battery) = (battery_capex / expected_life_cycles) * swaps_this_month.
- Attrition cost/month = failure_replacement_rate_monthly_pct * battery_capex / 12.
- Hub EBITDA = sum(battery contributions across batteries_per_hub) − hub_opex_per_month.
- Hub payback months = months until cumulative EBITDA ≥ (hub_capex + initial battery capex pool).
- IRR/NPV = monthly cashflows over analysis_horizon_months discounted by discount_rate_pct.

Worked example: price −10% with elasticity −1.0
- Elasticity multiplier = (0.9)^(-1.0) ≈ 1.111 → swaps/day +11.1%.
- Revenue/month = new_price * new_swaps/day * days.
- Contribution/month = Revenue − Commission − Servicing − Allocated OPEX − Attrition.
- Battery payback ≈ battery_capex / Contribution/month (if positive). Hub payback improves if higher EBITDA from more swaps offsets the lower unit price.

## Quick Interview Flow
1. Load a preset (Nigeria or DRC) — see the narrative one-liner under the title.
2. Read the 3 KPI badges and the live narrative sentence (10 seconds).
3. Click a Guided Scenario (e.g., demand −10%); watch KPIs, tornado, and cashflow update.
4. Toggle One‑Minute Mode for a bottom‑line view (KPIs, narrative, tornado, cashflow, per‑swap waterfall).

Definitions
- Cash contribution (battery): Revenue − Commission − Servicing − Losses (damage/theft).
- Hub EBITDA: Sum of battery cash contributions − hub opex/month.
- Wear‑and‑tear (non‑cash): Battery economic depreciation for reference.
- Price sensitivity example (−0.9): +10% price → ~−9% swaps; −10% price → ~+9% swaps.
