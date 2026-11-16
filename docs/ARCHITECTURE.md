# Architecture

Outbreak Lab is plain HTML, CSS and JavaScript. There is no framework, no
bundler and no server. The same model code runs in the browser and headless in
Node.

## Files

```
index.html              page markup: the eight tabs and all in-app documentation
css/styles.css          all styles
js/
  model.js              the city model (3,769 lines)
  econ.js               economy, government and birth centre (534)
  app.js                graphics and user interface (4,544)
  mayor.js              the agent team — the "agentic AI" (1,092)
  paper.js              statistics and research-paper builder (278)
  agent-ui.js           AI Agent tab and the CSV city loader (614)
  gov-ui.js             Government tab (53)
  paperlab-ui.js        Paper Lab tab (84)
bench/
  bench.js              headless benchmark -> data/results.json
  make_paper.js         results -> docs/paper-draft.md
tools/
  build.js              packs everything into one file: dist/outbreak-lab.html
  export-data.js        writes the JSON files in data/
data/                   JSON and CSV data (see data/README.md)
docs/                   this documentation, the paper draft and screenshots
papers/                 two research documents linked from the Research tab
dist/outbreak-lab.html  the single-file build
```

## Layers

```
            +--------------------------- browser only ---------------------------+
            |  app.js      agent-ui.js      gov-ui.js      paperlab-ui.js        |
            |  (canvas,    (AI Agent tab,   (Government    (Paper Lab tab)       |
            |   controls)   CSV loader)      tab)                                |
            +----------|-------------|-------------|---------------|------------+
                       v             v             v               v
            +------------------- browser and Node -----------------------------+
            |  mayor.js  (window.OLCore)        paper.js  (window.OLPaper)     |
            |  agent team, Runner, scenarios    statistics, paper builder      |
            +----------|-------------------------------------------------------+
                       v
            +------------------- browser and Node -----------------------------+
            |  model.js   World, Agent, vehicles, weather, air, energy, water  |
            |  econ.js    installs the economy onto World (OLInstallEcon)      |
            +------------------------------------------------------------------+
```

The model knows nothing about the screen. `app.js` reads the `World` and draws
it; the agent team reads the `World` through `observe()` and changes it only
by changing settings (an `apply` callback that ends in `world.setParams()`).

## Load order

`index.html` loads the scripts as ordinary `<script src>` tags, in this order:

```
model.js -> econ.js -> app.js -> mayor.js -> paper.js -> agent-ui.js -> gov-ui.js -> paperlab-ui.js
```

They are classic scripts, not ES modules, so the page also works when opened
straight from disk (`file://`). `model.js` declares its classes and constants
at the top level, which makes them visible to the scripts after it. The other
files are wrapped in functions and publish one object each:

| Global | Published by | Used by |
| --- | --- | --- |
| `World`, `Agent`, `DEFAULT_PARAMS`, ... | `model.js` | everything |
| `OLInstallEcon` | `econ.js` | adds the economy to `World` |
| `outbreakLab` | `app.js` | the running app: `.world`, `.params` |
| `OLCore` | `mayor.js` | `Mayor`, `Runner`, `ACTIONS`, `SCENARIOS`, `CONTROLLERS` |
| `OLPaper` | `paper.js` | `analyse`, `buildPaper`, `mdToHtml` |

In Node the same files use `module.exports` / `require`:

```js
const M = require('./js/model.js');   // also loads econ.js
const C = require('./js/mayor.js');   // loads model.js
const r = C.runSync({ ...M.DEFAULT_PARAMS }, 3, { controller: 'consent', seed: 201 });
```

## model.js

| Class | Role |
| --- | --- |
| `Random` | Seeded random numbers (mulberry32). The same seed gives the same run. |
| `SpatialGrid` | Sorts agents into cells for fast neighbour lookup. |
| `Agent` | One person: family, job, daily plan, walking or driving, health, lifestyle, stress, air exposure. |
| `Ambulance`, `Helicopter` | Take seriously ill and injured people to hospital. |
| `Vehicle` | Through traffic on the motorway. |
| `Bus` | Public transport on two routes with stops and passengers. |
| `Rig` | Service vehicles: fire engine, waste truck, crew van, hearse, delivery van. |
| `World` | The city: weather, air, traffic lights, accidents, flights, energy, water, waste, sensors, service requests, the scheduler and the statistics. |

`World.step()` advances one simulated minute. `World.fork()` copies the whole
city, which is what the forecaster uses. See [MODEL.md](MODEL.md).

## State and storage

There is **no database and no backend**. A run lives in memory and is fully
determined by its settings and seed, so it can be repeated exactly instead of
being stored. The browser's local storage holds three small things:

| Key | Content |
| --- | --- |
| `ol_agent_lessons2` | What the agent team has learned about each measure |
| `ol_exit_auto` | Whether "ease by itself" is ticked |
| `ol_motion` | The reduced-motion preference |

Data leaves the app only when you ask: the day report downloads as CSV, and
the agent log, the decision ledger and the Paper Lab results (JSON, CSV or
Markdown) can be copied to the clipboard.

## Single-file build

```bash
node tools/build.js
```

This writes `dist/outbreak-lab.html` with the stylesheet, all eight scripts and
both papers embedded. That one file works offline and can be sent as an
attachment.
