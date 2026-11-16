# How the agentic AI works

All of the agent logic lives in **`js/mayor.js`** (about 1,100 lines). The
screen that shows it — the *AI Agent* tab — is `js/agent-ui.js`.

**Honest label.** This is a rule-based agent team with a learning loop and a
simulation-based forecaster. There is **no language model and no network
call**. Every score is arithmetic you can read in the code, and every decision
is written to a ledger.

## The loop

```
sense -> diagnose -> plan -> (ask you) -> act -> reflect -> learn
```

`Mayor.step(world)` runs once per simulated minute.

| Step | Function | What it does |
| --- | --- | --- |
| Sense | `observe(w, memo)` | Reads the city and turns it into nine pressures between 0 and 1. |
| Smooth | `Track.push()` | Keeps a smoothed value and an hourly trend for each pressure. |
| Alarm | `detect()` | Edge triggers wake the planner at once. |
| Diagnose | `urgency()`, `explain()` | Sets an urgency tier per problem area and states the root cause in words. |
| Plan | `options()` | Scores every available measure and keeps the best few, different in kind. |
| Price | `fiscalOf()` | Costs each option against the city treasury. |
| Review | `review()` | The safety reviewer attaches cautions and notes. |
| Forecast | `pumpForecasts()` | Tries the top options on a copy of the city. |
| Ask | `propose()` | Puts the proposal in front of you. |
| Act | `approve()` -> `act()` | Changes the city only after you approve. |
| Reflect | `reflect()` | Later, compares what happened with what the trend alone predicted. |
| Learn | `lessons`, `prio()` | Trusts measures that helped more, and ones that hurt less. |

## 1. Sense: nine pressures

`observe()` produces one number from 0 (fine) to 1 (crisis) for each problem
area (`DOM` in the code):

`health`, `air`, `roads`, `power`, `water`, `net` (connectivity), `budget`,
`welfare` (household hardship) and `maternal` (mothers and newborns).

Examples, straight from the code:

- **health** = share exposed or infectious × 6 + hospital load above 60% × 0.8
  + share dead × 25
- **air** = (worst of current and forecast AQI × what people actually breathe
  − 100) ÷ 250
- **roads** = accidents per 24 h ÷ 8 × 0.6 + weather hazard (fog, rain, snow) × 0.5

A broken sensor reading (not a finite number) is ignored, replaced by the last
smoothed value and remembered, so the safety reviewer can warn that the picture
may be wrong.

The **harm score** `J` is the weighted average of the nine pressures. The
weights come from the goal you pick (`GOALS`): *balanced*, *lives*, *air* or
*infra*.

## 2. Alarms

`detect()` fires only when something *crosses* a line (an edge), not while it
stays there. Triggers include: AQI forecast passing 200 or 300; infections
passing 1%, 5% or 15%; hospital 80% full or full; a new death; a grid outage;
demand at 95% of grid capacity; water tank below 25%; storm, snow or thick fog;
three accidents in two hours; treasury below 10 days of spending; 15% of
households out of savings; and several invalid sensor readings in an hour.

An alarm wakes the planner immediately. Otherwise it plans every N minutes
(1, 5, 15, 30, 60 or 360 — your choice). It waits 30 minutes after start so
the sensors can warm up.

## 3. Diagnose: urgency tiers

For each area, urgency `U` is the larger of the smoothed pressure and its
projection a few hours ahead (12 h for health, 3 h for the rest).

| U | Tier |
| --- | --- |
| below 0.12 | none |
| 0.12 and up | low |
| 0.25 and up | normal |
| 0.45 and up | high |
| pressure 0.7 and up, or rising fast towards 0.9 | emergency |

Health is also an emergency when the hospital is full and infections are still
rising; air is an emergency at AQI 300.

## 4. Plan: scoring the options

The toolbox (`ACTIONS`) holds **83 measures**: 21 health, 20 air, 8 roads,
8 power, 7 water, 1 connectivity, 7 budget, 5 welfare and 6 maternal. The full
list is in [`data/agent-actions.json`](../data/agent-actions.json).

Each measure has:

- `sets` — the city settings it changes, for example `{ masks: 50 }`
- `eff(o, w)` — a prior belief (0 to 1) of how much of the problem it can remove
- `burden` — its cost to people's daily lives (0 to 1)
- `cool` — the minimum minutes before it can be suggested again
- `kind` — its family (masks, closure, capacity, supply ...)

The score of a measure in `options()` is:

```
benefit = urgency × eff × learned trust × exploration bonus × goal weight
cost    = burden × MU × (1 − 0.4 × urgency) + budget score
score   = benefit − cost
```

- `MU = 0.4` is the weight of the burden on people.
- **Learned trust** (`prio`) runs from 0.4 to 1.6, based on past results.
- **Exploration bonus** (`explore`) is `1 + 0.3 / (1 + times tried)`, so
  untried measures get a small push.
- Measures already in force overlap with new ones, so each new option of the
  same family is worth less.

Skipped outright: anything on your **never** list, anything still cooling
down, anything already in force, and anything on the **deny** list (unless its
area becomes an emergency, and then at most once every 6 hours).

The result is up to four or five options that differ *in kind* (not three mask
levels). When an area is under real pressure the **strategist** always adds at
least one out-of-the-box idea — air purifiers, building filters, cloud seeding,
water-mist guns, free buses, odd-even cars, cash relief and so on — with its
honest price. Some measures are combined into **packages**.

## 5. The team

`OFFICERS` in the code defines seven specialist officers:

| Officer | Areas |
| --- | --- |
| Health officer | health |
| Air-quality officer | air |
| Traffic officer | roads |
| Utilities officer | power, water, connectivity |
| Finance officer | budget |
| Welfare officer | household hardship |
| Birth-centre officer | mothers and newborns |

Five cross-cutting roles make twelve agents in total:

- **Strategist** — joins measures into packages and adds creative options.
- **Coordinator** — merges the officers' plans into one list (`deliberate()`).
- **Safety reviewer** — checks every option before you see it (`review()`).
- **Forecaster** — tries the top options on a copy of the city.
- **Auditor** — records every decision in the ledger (`led()`).

## 6. The safety reviewer

`review()` attaches a **caution** when, for example:

- total restrictions on people would pass 35/100
- the measure would override a setting *you* changed in the last day
- the budget is tight, over, or there are no funds
- it is a package, or a big decision for daily life
- sensor readings were invalid in the last hour
- you denied it before and it is back because of an emergency
- the forecaster saw it do worse in a copy of the city

It adds a **note** for standing rules, hard-to-undo steps, closures that hit
daily-wage workers, and similar measures you denied earlier.

Anything big, packaged, standing, hard to undo, not fully affordable or
cautioned needs a **second click to confirm**.

## 7. The forecaster

For the top options of a proposal, `pumpForecasts()` calls `world.fork()` to
copy the city as it is right now, applies one option to each copy, and runs all
copies forward with the **same random future** ("same luck"). Differences then
come from the option, not from chance. The look-ahead (`HORIZON`) is 3 to 24
simulated hours depending on the area. The result — change in harm, burden and
treasury — is shown on the proposal and passed to the safety reviewer.

It sees one possible future of the model, not the real future.

## 8. Strict consent

On the live page the agent is created with `strict = true`, and that switch is
locked with `Object.defineProperty` so it cannot be flipped later, even from
the browser console.

- **Nothing changes unless you press Approve.** Modes are *ask* or *advise*.
  The *auto* mode exists only for headless experiments.
- Every proposal carries a version number. Approving an out-of-date proposal
  is rejected, so you never approve something that changed after you read it.
- **Deny** puts an option on the deny list for 1 to 5 days (default 2). It
  returns sooner only if its area becomes an emergency, and then only as a
  new question.
- **Never** keeps it away completely until you allow it again.
- You can undo any measure yourself from the measures table.

## 9. Exit rules

Measures do not stay for ever:

- Each measure has a **relax threshold** and a **hold time**. When pressure
  stays below the threshold for the hold time and is not rising, the agent
  proposes to lift it — or eases it one step down a ladder (masks 90% -> 70%
  -> 50%) if you ticked "ease by itself" when you approved it.
- Hard-to-undo measures never lift by themselves.
- **Sunset review:** after a fixed number of days (7 for closures, up to 21 for
  masks and testing) the agent asks whether the measure should stay.

## 10. Reflect and learn

After an evaluation window (12 simulated hours by default) `reflect()`
compares the pressure now with the pressure the earlier trend alone would have
given:

- more than 0.04 below the baseline -> **helped**
- more than 0.08 above it -> **hurt** (the agent proposes to lift it)
- otherwise -> **no clear effect**

The result is added to `lessons[action]`, which changes that measure's trust
next time. Lessons are saved in the browser's local storage under
`ol_agent_lessons2`. Because anyone can edit local storage, `cleanLessons()`
keeps only sane numbers for known actions when loading.

## 11. Your own idea

In the *Your own idea* box you type a measure in plain words. `parseIdea()`
matches it against keyword rules (`IDEA_RULES`), including negations ("no
lockdown") and some Roman-Urdu words, and maps it to model settings.
`critique()` then gives a second opinion: relevance, side effects, gaps and
extras. It is pattern matching, not language understanding.

## 12. Testing the agent

`Runner`, `runSync()` and `runAsync()` run a whole city headless, with one of
ten **controllers** (`CONTROLLERS`):

| Key | Meaning |
| --- | --- |
| `none` | No intervention |
| `static` | A fixed precaution pack, always on |
| `autopilot` | The city's built-in smog-alert autopilot |
| `mayor1`, `mayor60`, `mayor360` | The agent acting alone, planning every 30 min, 1 h or 6 h |
| `consent` | The agent with a simulated reviewer who approves after 1 hour |
| `consentAsk` | As above, but lifts are approved one by one after 24 hours |
| `consentF` | Consent plus the forecaster |
| `hitl` | A reviewer who denies half of the proposals |

Each run returns harm `J`, burden `B` and total cost `C = J + 0.4 × B`, plus
peak infections, peak AQI, deaths, accidents and outage minutes.

```bash
node bench/bench.js data/results.json 5 3     # 4 scenarios x 7 controllers x 5 seeds, 3 days
node bench/make_paper.js                      # builds docs/paper-draft.md from the results
```

The same experiment runs in the browser from the **Paper Lab** tab.
