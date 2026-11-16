# The city model

The model is in `js/model.js` (city, people, traffic, weather, air,
infrastructure) and `js/econ.js` (economy, government, birth centre). This page
is a short summary; the **How it works** and **Research** tabs inside the app
give the full description with every formula.

## Time and space

- 1 tick = 1 simulated minute. 1,440 ticks = 1 day. A run starts on Monday at 06:00.
- The city is a 10 × 6 grid of 100 m blocks (1 km × 0.6 km), with an airport,
  a motorway and a brick-kiln belt outside it.
- 500 people by default, in households, in three age groups: child, adult, elder.
- All randomness comes from one seeded generator, so the same seed and
  settings always give the same run.

Layout and constants are exported to [`data/city.json`](../data/city.json);
every setting and its default is in
[`data/default-params.json`](../data/default-params.json).

## What happens in one tick

`World.step()` runs these in a fixed order:

1. **New day** (at midnight): weather, random incidents, sensor failures,
   funerals, flights and everyone's plan for the day.
2. **Environment:** rain, fog, daylight, temperature, flooding, traffic lights.
3. **People** follow their plans: walk, cycle, wait at a stop, ride a bus,
   drive or stay inside.
4. **Traffic:** accidents, ambulances, the air ambulance, the motorway,
   aircraft, buses and service vehicles.
5. **Every 10 minutes:** count who is where, then power, water, waste and
   sensors — in that order, because pumps need power and waste needs trucks.
6. **Services:** requests are matched to crews; fires burn and are fought.
7. **Air pollution,** including smoke from kilns, fires and burning rubbish.
8. **Every 5 minutes:** infection contacts in shared places and in buses.
9. **Health:** states change, hospital admissions, deaths, funerals queued.
10. **Every hour:** the history series are recorded for the charts and CSV.

When two agents compete for one thing (a bed, a crew, a junction), the first in
the list or the nearest wins. The rule is fixed so runs stay repeatable.

## Health states

Susceptible -> Exposed -> Infectious -> Recovered, plus Vaccinated, and three
kinds of death: from the disease, on the roads and from natural causes.
Immunity can wane.

## The infection rule

For each minute of contact between an infectious and a susceptible person in
the same place:

```
P(infect) = β/60 × place risk
            × 0.5 if the sick person wears a mask
            × 0.7 if the healthy person wears a mask
            × (1 + stress effect × stress)
            × 1.2 if the healthy person smokes
```

β is the transmission chance per hour of close contact (default 5%). Masks
count only outside homes. At home you can only catch it from your own family.
People in cars, abroad or in isolation infect nobody.

Place risk runs from 0.22 at home to 1.4 in the wedding hall (school 1.0,
office 0.8–0.9, gym 1.2, bazaar 1.3, masjid 1.1, hospital 0.6).

## Serious illness and death

```
P(serious) = age factor (child 1%, adult 7%, elder 30%)
             × 1.8 if a smoker × 0.6 if a gym-goer
             × (1 + harm from bad air × air breathed)
             × 0.3 if vaccinated

P(death)   = death risk (35%) × age factor (0.5 / 0.8 / 1.4)
             × (1 + 1.5 × share of 1.5 days spent waiting without a bed)
             × 0.5 if vaccinated
```

Only seriously ill people can die of the disease. When every hospital bed is
taken, new patients wait at home and their risk rises.

## Roads

```
risk = driving danger × (speed limit / 50)² × (1 + 1.4 rain + 2.6 fog) × 1.6 at night
```

Cars can collide at junctions, crash alone or hit someone crossing. A traffic
officer at a junction cuts collisions there to 40%.

## Air

Every 10 minutes: smoke moves with the wind, mixes with neighbouring cells,
gains from kilns, chimneys and exhaust, and is cleaned at 2–5% (much less in
fog and smog, more in rain). The air-quality index is computed from PM2.5.

## Coupled infrastructure

The smart-city layer is linked to the epidemic layer, so one failure spreads:

```
power cut -> signals flash, lights off -> more crashes -> more ambulances
power cut -> pumps stop -> water shortage -> hygiene stress -> more infection at home
strike    -> bins overflow -> burning (smoke) + blocked drains (flood) -> infection
sensor failure -> the smog school-closure rule is wrong or blind
```

Energy, water and waste each keep a conservation check, shown live in the
**Smart city** tab.

## Economy and government (v17)

`econ.js` adds a treasury with income, departmental budgets, prices and
household savings, public trust, and a birth centre. Every measure the agent
team proposes is priced against this treasury before you see it.

## Limits

This is a teaching model of a generic airborne disease in a stylised Pakistani
city. Accident rates, pollution levels and health effects were chosen to make
patterns visible. Nothing is calibrated against real data, so results show
mechanisms, not forecasts.
