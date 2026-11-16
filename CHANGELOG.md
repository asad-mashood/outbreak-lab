# Changelog

Reconstructed from the version notes in the app's **Research** tab. The code in
this repository is v17.

| Version | What was added |
| --- | --- |
| v17 | City economy, government and treasury, birth centre, out-of-the-box measures, exit rules |
| v16 | A team of agents, strict consent, the forecaster, red-team testing |
| v15 | The agent watches every minute; alternatives, deny list, your own ideas, Paper Lab |
| v14 | The agentic AI mayor; loading your own city from a CSV |
| v13 | Easier controls, reports, parking |
| v12 | Snow, snow ploughs and flight delays |
| v11 | Resources, chronic illness and real-world scale |
| v9 | Two research papers on brick kilns and how the model uses them |
| v8 | Kilns, seasons and smog; construction site, Sky Tower, Funland |
| v7 | Wi-Fi, emergency alerts and the city scorecard |
| v6 | Storms and lightning |
| v5 | Smart-city digital twin: energy, water, waste, sensors, services, daily life |

## Repository restore (November 2026)

The project was rebuilt from the single-file build `outbreak-lab.html`.

- **Recovered exactly:** all application code. It was split back into
  `css/styles.css` and the eight files in `js/`. `node tools/build.js`
  reproduces the original single file byte for byte.
- **File names:** `model.js`, `econ.js`, `mayor.js` and `app.js` are the
  original names (the code refers to them). `paper.js`, `agent-ui.js`,
  `gov-ui.js` and `paperlab-ui.js` are new names for the remaining sections.
- **Rewritten:** `bench/bench.js` and `bench/make_paper.js`, following the
  experiment that the Paper Lab tab runs in the browser.
- **Not recovered:** `bench/abtest.js`, `bench/redteam.js`,
  `bench/redteam_ui.py` and their result files. The code mentions them but
  they were not part of the single-file build.
- **New:** `tools/`, `data/`, `docs/`, `package.json`.
