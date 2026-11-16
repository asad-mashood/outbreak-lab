# Data files

Outbreak Lab has no database. A run lives in memory and is fully determined by
its settings and seed. These files are readable copies of what is in the code,
plus the output of one benchmark run.

| File | What it is | Made by |
| --- | --- | --- |
| `default-params.json` | Every model setting and its default value (166 settings) | `node tools/export-data.js` |
| `city.json` | City layout, places, place risk, age groups, seasons, prayers, bus routes, kiln sites | same |
| `scenarios.json` | The four benchmark stress scenarios | same |
| `controllers.json` | The ten controllers the benchmark can compare | same |
| `agent-team.json` | Problem areas, goals, officers and forecast horizons | same |
| `agent-actions.json` | All 83 measures the agent team can propose | same |
| `results.json` | Raw results of 140 headless runs: 4 scenarios × 7 controllers × 5 seeds (201–205) × 3 days | `node bench/bench.js data/results.json 5 3` |
| `sample-city-profile.csv` | The sample city profile from the AI Agent tab (numbers invented for the demo) | copied from `js/agent-ui.js` |
| `sample-observed-series.csv` | The sample observed series from the AI Agent tab (invented) | copied from `js/agent-ui.js` |

The simulator does not read the JSON files; the code is the source of truth.
Re-run the commands after changing the code.

## Reading `results.json`

Each row is one run. The main columns:

- `J` — harm: the weighted average of the nine pressures over the run (0 to 1)
- `B` — burden: how heavy the restrictions on people were (0 to 1)
- `C` — total cost = `J + 0.4 × B`. Lower is better.
- `peakInf` — peak share of the city infected, in percent
- `peakAqi`, `deaths`, `acc` (accidents), `outage` (minutes)
- `acts`, `approved`, `denied` — what the agent team did

Runs are small (500 people, 3 days, 5 seeds), so differences between
controllers are noisy. See `docs/paper-draft.md` for the statistics.
