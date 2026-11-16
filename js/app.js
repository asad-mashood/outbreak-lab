/* =====================================================================
   OUTBREAK LAB — GRAPHICS & USER INTERFACE (city edition)
   ---------------------------------------------------------------------
   Decor        trees, street lamps, driveways, parking spaces, stalls
   paintCity    draws roads and every kind of block in night or day colours
   Traffic      decorative buses and police patrols (people's own cars
                and the ambulances come from the model)
   Heatmap, Effects, Camera, SoundFX, Renderer, charts, App
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const MONO = '"IBM Plex Mono", "Cascadia Mono", Consolas, ui-monospace, Menlo, monospace';
  const DISPLAY = '"Chakra Petch", "Bahnschrift", "DIN Alternate", "Arial Narrow", sans-serif';
  // Respect the OS "reduce motion" setting by default, but let the person override it in-app:
  // many phones have this on by default, which was silently hiding rain streaks and lightning
  // bolts (the effects people most want to see) with no way to turn them back on.
  let reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  try { const saved = localStorage.getItem('ol_motion'); if (saved === 'on') reduceMotion = false; else if (saved === 'off') reduceMotion = true; } catch (e) {}
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const rgbaCache = new Map();
  function rgba(hex, a) {
    let rgb = rgbaCache.get(hex);
    if (!rgb) {
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16);
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      rgbaCache.set(hex, rgb);
    }
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

  /* ---------------- scenarios ---------------- */
  const ICON = {
    baseline: '<circle cx="12" cy="12" r="5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
    wfh: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><rect x="9" y="13" width="6" height="4" rx="0.5"/>',
    schools: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M4 4l16 16"/>',
    masks: '<path d="M4 9c3-1 5-1.5 8-1.5S17 8 20 9v4c0 3-4 5.5-8 5.5S4 16 4 13z"/><path d="M4 10H2M20 10h2M8 12h8M9 15h6"/>',
    isolate: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 7v10M7 12h10"/>',
    vaccine: '<path d="M17 3l4 4M19 5l-3 3M15 6l3 3-9 9H6v-3z"/><path d="M6 18l-3 3M10 10l2 2M12 8l2 2"/>',
    lockdown: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    combined: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    beds: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    waning: '<path d="M2 10c2.5-4 4.5-4 7 0s4.5 4 7 0 4.5-4 6-1"/><path d="M2 17c2.5-4 4.5-4 7 0s4.5 4 7 0 4.5-4 6-1"/>',
    smog: '<path d="M3 21V11l5 3v-3l5 3V7h3v14z"/><path d="M15 4.5c1-1.8 3-1.8 4 0M18 2.5c.8-1 2-1 2.8 0"/>',
    cleanair: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19l8-8"/>',
    foggy: '<path d="M7 5h10M4 9h16M2 13h18M5 17h14M8 21h8"/>',
    roadsafe: '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>',
    healthy: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
    nogather: '<circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><path d="M3 19c1-3 3-5 5-5s4 2 5 5M11 19c1-3 3-5 5-5s4 2 5 5"/><path d="M3 3l18 18"/>',
    travelban: '<path d="M10.5 3.5c0-1 .7-1.5 1.5-1.5s1.5.5 1.5 1.5V9l8 5v2l-8-2.5V19l2 1.5V22L12 21l-3.5 1v-1.5l2-1.5v-5.5L2.5 16v-2l8-5z"/><path d="M3 3l18 18"/>',
  };
  const SCENARIOS = [
    { id: 'baseline', name: 'Baseline', desc: 'Normal city life', params: {} },
    { id: 'wfh', name: 'Work from home', desc: 'Half stay home', params: { distancing: 50 } },
    { id: 'schools', name: 'Close schools', desc: 'Schools & university shut', params: { schoolsOpen: false } },
    { id: 'masks', name: 'Masks', desc: '80% wear masks outside', params: { masks: 80 } },
    { id: 'isolate', name: 'Test & isolate', desc: 'Sick people isolated', params: { quarantine: true } },
    { id: 'vaccine', name: 'Vaccination', desc: '60% vaccinated', params: { vaccinated: 60 } },
    { id: 'lockdown', name: 'Lockdown', desc: 'All shut, 75% home', params: { distancing: 75, schoolsOpen: false, marketOpen: false, parksOpen: false, gymOpen: false, gatheringsOpen: false, flightsPerDay: 0 } },
    { id: 'combined', name: 'Combined', desc: 'Some of everything', params: { distancing: 20, masks: 30, quarantine: true } },
    { id: 'beds', name: 'Bigger hospital', desc: '30 beds instead of 8', params: { hospitalBeds: 30 } },
    { id: 'waning', name: 'Waning immunity', desc: 'Immunity fades ~30 days', params: { immunityWanes: true, immunityDays: 30 } },
    { id: 'smog', name: 'Smog season', desc: 'Fog traps kiln smoke', params: { weather: 'smog', kilns: 8 } },
    { id: 'winterstop', name: 'Winter kiln stop', desc: 'Winter, kilns shut', params: { startSeason: 'winter', kilnWinterStop: true, kilns: 8 } },
    { id: 'winterburn', name: 'Winter, kilns burn', desc: 'Winter, no shutdown', params: { startSeason: 'winter', kilnWinterStop: false, kilns: 8 } },
    { id: 'fourseasons', name: 'Four seasons', desc: 'Seasons change by day', params: { seasonMode: 'cycle', seasonDays: 8, kilns: 6 } },
    { id: 'summerheat', name: 'Hot summer', desc: 'Heat and monsoon', params: { startSeason: 'summer', heatwave: true } },
    { id: 'smogbuild', name: 'Smog and building', desc: 'Dust + smog ban', params: { startSeason: 'autumn', weather: 'smog', kilns: 8, constructionWorkers: 120, constructionAqiBan: true } },
    { id: 'cleanair', name: 'Clean air', desc: 'Zig-zag kilns, less smoke', params: { cleanKilns: true, kilns: 2, factorySmoke: 50, trafficSmoke: 60 } },
    { id: 'foggy', name: 'Foggy motorway', desc: 'Thick fog, motorway open', params: { weather: 'fog', motorwayFogClose: false } },
    { id: 'roadsafe', name: 'Road safety', desc: 'Police, belts, 40 km/h', params: { trafficPolice: 12, seatbelts: 95, speedLimit: 40 } },
    { id: 'healthy', name: 'Healthy lifestyle', desc: 'Few smokers, more gym', params: { smokers: 5, gymGoers: 45 } },
    { id: 'nogather', name: 'No gatherings', desc: 'No prayers or weddings', params: { gatheringsOpen: false } },
    { id: 'travelban', name: 'Travel ban', desc: 'Airport closed', params: { flightsPerDay: 0 } },
    { id: 'heatwave', name: 'Heatwave', desc: 'Hot, power demand peaks', params: { heatwave: true, baseTemp: 34 } },
    { id: 'blackout', name: 'Daily blackout', desc: 'Grid fails every day', params: { gridOutageChance: 100, gridOutageHours: 5, hospitalGenerator: true, loadShedding: 'critical' } },
    { id: 'drought', name: 'Drought', desc: 'Water runs short', params: { drought: true, leakRate: 25, waterConservation: 0 } },
    { id: 'strike', name: 'Sanitation strike', desc: 'No rubbish collection', params: { wasteFleet: 0, wasteBurning: 60 } },
    { id: 'flood', name: 'Monsoon flood', desc: 'Rain + poor drainage', params: { weather: 'rain', drainage: 30 } },
    { id: 'firecity', name: 'Fire season', desc: 'Many fires, 1 engine', params: { fireRate: 20, fireTrucks: 1 } },
    { id: 'thunder', name: 'Thunderstorm', desc: 'Storm, lightning, blackouts', params: { weather: 'storm', lightningRate: 8, drainage: 60 } },
    { id: 'nobus', name: 'Bus ban', desc: 'No public transport', params: { busesPerHour: 0, cyclists: 30 } },
    { id: 'grief', name: 'No funerals or prayers', desc: 'Mourners stay home', params: { funeralGuests: 0, prayerAttendance: 0 } },
    { id: 'blindcity', name: 'Blind control room', desc: 'Bad sensors, smog rule', params: { sensorFailure: 50, sensorDrop: 40, sensorNoise: 25, decideBySensors: true, smogSchoolClose: true, weather: 'smog', kilns: 8 } },
  ];

  /* ---------------- parameter controls ---------------- */
  const days = (v) => `${v} day${v === 1 ? '' : 's'}`;
  const PARAM_UI = [
    { group: 'Population & disease', items: [
      { key: 'population', label: 'Population', min: 100, max: 1000, step: 50, fmt: (v) => `${v} people`, reset: true, desc: 'Number of people (agents) living in the city.' },
      { key: 'initialInfected', label: 'Patient zeros', min: 1, max: 20, step: 1, fmt: (v) => `${v}`, reset: true, desc: 'Adults who are already infectious at the start.' },
      { key: 'transmissionRate', label: 'Transmission chance', min: 0.5, max: 15, step: 0.5, fmt: (v) => `${v}% <small>/ hour</small>`, desc: 'Chance that infection passes during one hour of close contact (β).' },
      { key: 'infectionRadius', label: 'Contact distance', min: 2, max: 15, step: 1, fmt: (v) => `${v} m`, desc: 'How close two people in the same place must be to count as a contact.' },
      { key: 'incubationDays', label: 'Incubation period', min: 1, max: 10, step: 0.5, fmt: days, desc: 'Average time from infection until a person becomes contagious.' },
      { key: 'infectiousDays', label: 'Infectious period', min: 2, max: 20, step: 1, fmt: days, desc: 'Average time a person stays contagious. Serious cases last 3–6 days longer.' },
      { key: 'mortality', label: 'Death risk if seriously ill', min: 0, max: 80, step: 5, fmt: (v) => `${v}%`, desc: 'Chance a seriously ill person dies even with a hospital bed. Waiting at home without a bed raises it, up to 2.5 times after 1.5 days. Elders ×1.4, children ×0.5.' },
    ] },
    { group: 'Behaviour', items: [
      { key: 'distancing', label: 'Work & study from home', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Share of people who stay at home instead of going to work, school, parks or (mostly) the bazaar.' },
      { key: 'masks', label: 'Mask wearing', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Share of people wearing masks outside their home. A mask halves what you spread and cuts what you catch by 30%.' },
      { key: 'sickStayHome', label: 'Sick people stay home', min: 0, max: 100, step: 5, fmt: (v) => `${v}% <small>/ day</small>`, desc: 'Each day, the chance that a person with symptoms stays at home.' },
      { key: 'schoolsOpen', label: 'Schools & university open', type: 'toggle', desc: 'Pupils go to school and students to university.' },
      { key: 'marketOpen', label: 'Bazaar open', type: 'toggle', desc: 'People go shopping at the bazaar.' },
      { key: 'parksOpen', label: 'Parks open', type: 'toggle', desc: 'People visit parks.' },
    ] },
    { group: 'Health system', items: [
      { key: 'hospitalBeds', label: 'Hospital beds', min: 2, max: 60, step: 1, fmt: (v) => `${v} beds`, desc: 'Beds for seriously ill people. When all are full, new patients must stay at home.' },
      { key: 'quarantine', label: 'Test & isolate', type: 'toggle', desc: 'People with symptoms are found and sent to the isolation centre.' },
      { key: 'detectionRate', label: 'Cases found', min: 10, max: 100, step: 5, fmt: (v) => `${v}% <small>/ day</small>`, dependsOn: 'quarantine', desc: 'Daily chance a person with symptoms is found, from their second day of symptoms.' },
      { key: 'vaccinated', label: 'Vaccinated at start', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, reset: true, desc: 'Share of people vaccinated before the outbreak.' },
      { key: 'vaccineEfficacy', label: 'Vaccine efficacy', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Share of vaccinated people fully protected from infection. Vaccinated people who catch it are also less likely to become seriously ill.' },
    ] },
    { group: 'Seasons & kilns', fold: true, items: [
      { key: 'seasonMode', label: 'Seasons', type: 'select', options: [['fixed', 'One season all the time'], ['cycle', 'Four seasons follow each other']], desc: 'Each season changes the temperature, fog, rain, wind mixing (winter air is stagnant), daylight, electricity use and how many people go out.' },
      { key: 'startSeason', label: 'Season (or first season)', type: 'select', options: [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']], desc: 'Autumn is the reference season for the baseline numbers.' },
      { key: 'seasonDays', label: 'Days per season', min: 2, max: 30, step: 1, fmt: (v) => `${v} days`, desc: 'How long each season lasts when the seasons follow each other.' },
      { key: 'kilnWinterStop', label: 'Shut kilns in winter', type: 'toggle', desc: 'A winter shutdown policy: every brick kiln stops while it is winter. In the Smart city tab you can also stop or start each kiln by hand.' },
      { key: 'satPassHours', label: 'Satellite passes', min: 0, max: 24, step: 1, fmt: (v) => v === 0 ? 'off' : `every ${v} h`, desc: 'How often a satellite looks at the kilns. Turn on the Satellite layer on the map to see what it saw.' },
      { key: 'satMode', label: 'Satellite sensors', type: 'select', options: [['swir', 'SWIR heat only (near random)'], ['optical', 'Optical: piles, plume (Sentinel-2)'], ['thermal', 'Optical + ground heat (Landsat)'], ['full', 'Full: + radar (Sentinel-1), sees through fog']], desc: 'Paper 1: SWIR heat cannot see a kiln fire. Optical clues work in clear air; ground heat helps with night-firing kilns; radar works through fog. The detection odds are assumptions based on the paper, not measurements.' },
      { key: 'satAdapt', label: 'Kiln-type classifier', type: 'select', options: [['zero', 'Trained on India, used as is (56% FCBK called zigzag)'], ['balanced', 'Balanced adaptation (over-reports zigzag)'], ['calibrated', 'Adapted and prior-calibrated (17% error)']], desc: 'Paper 2: a classifier trained in India calls most Pakistani old kilns zigzag. Calibration brings the error down to the Indian level. Balanced adaptation is about 27% (derived from 37% reported vs 14% true).' },
      { key: 'satGate', label: 'Confidence gate', min: 30, max: 95, step: 5, fmt: (v) => `${v}%`, desc: 'Selective prediction: inspectors are sent only to kilns the satellite flags with at least this confidence.' },
      { key: 'zigzagShare', label: 'Kilns that are truly zigzag', min: 0, max: 100, step: 10, fmt: (v) => `${v}%`, desc: 'Paper 1: only about 14% of Pakistani kilns are real zigzag, while the registry says all are. Zigzag kilns emit about 60% less.' },
      { key: 'nightShare', label: 'Night-firing kilns', min: 0, max: 100, step: 10, fmt: (v) => `${v}%`, desc: 'Paper 1 ("night warriors"): these kilns bank their fire by day and burn hard after dark, so a morning satellite pass misses them.' },
      { key: 'inspectCapacity', label: 'Inspectors per dispatch', min: 1, max: 8, step: 1, fmt: (v) => `${v} kilns`, desc: 'How many flagged kilns the inspectors can visit at a time.' },
      { key: 'kilnSealDays', label: 'Seal kilns for', min: 1, max: 30, step: 1, fmt: (v) => `${v} days`, desc: 'A kiln found burning is sealed for this many days.' },
      { key: 'autoDispatch', label: 'Automatic dispatch after each pass', type: 'toggle', desc: 'Inspectors are sent automatically to confident calls after every satellite pass.' },
    ] },
    { group: 'Resources & realism', fold: true, items: [
      { key: 'waterPerCapita', label: 'Water use per person', min: 20, max: 250, step: 10, fmt: (v) => `${v}%`, desc: 'Scales every home and public water demand. Test a low-flow fixtures policy by lowering it, or a wasteful city by raising it.' },
      { key: 'electricityUsageMul', label: 'Electricity use', min: 20, max: 250, step: 10, fmt: (v) => `${v}%`, desc: 'Scales every home, office and public electricity demand — efficient appliances versus an energy-hungry city.' },
      { key: 'fuelPrice', label: 'Petrol price', min: 100, max: 500, step: 10, fmt: (v) => `${v} PKR/L`, desc: 'Price per litre. The Smart city tab tracks litres burned and the total fuel bill.' },
      { key: 'fuelEfficiency', label: 'Vehicle fuel efficiency', min: 4, max: 30, step: 1, fmt: (v) => `${v} km/L`, desc: 'Average city vehicle. Electric cars (see Wi-Fi & city alerts group) do not burn petrol.' },
      { key: 'fogDensity', label: 'Baseline fog density', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Ambient haze independent of rain/fog weather spells; higher cuts visibility and slows traffic. Combines with the season and the weather setting.' },
      { key: 'realCityScale', label: 'Real city this represents', min: 1, max: 50000, step: 1, fmt: (v) => v === 1 ? 'this city as is' : `\u00d7${v.toLocaleString()} (~${(500 * v).toLocaleString()} people)`, desc: 'Multiplies every resource total to estimate what a real city of this size would need. See the "Real-world scale" card on the Smart city tab.' },
      { key: 'neverEnds', label: 'Never stop (real-world mode)', type: 'toggle', desc: 'When the epidemic ends, the city keeps running — traffic, power, water, weather, kilns, everything — instead of pausing. Turn it off to stop automatically like earlier versions.' },
    ] },
    { group: 'Health: chronic & common illness', fold: true, items: [
      { key: 'diabeticShare', label: 'Diabetes (adults)', min: 0, max: 40, step: 1, fmt: (v) => `${v}%`, desc: 'Diabetic people are about 35% more likely to become seriously ill from the main disease.' },
      { key: 'hypertensionShare', label: 'High blood pressure (adults)', min: 0, max: 40, step: 1, fmt: (v) => `${v}%`, desc: 'Raises serious-illness risk by about 20%.' },
      { key: 'asthmaShare', label: 'Asthma', min: 0, max: 30, step: 1, fmt: (v) => `${v}%`, desc: 'Raises serious-illness risk by about 25%, on top of the air-quality effect.' },
      { key: 'commonIllnessRate', label: 'Flu, cough, fever, sore throat', min: 0, max: 300, step: 10, fmt: (v) => `${v}%`, desc: 'Ordinary illness unrelated to the main disease. Rises with bad air and in winter. People miss work and use medicine, but do not die from it.' },
      { key: 'medicineStock', label: 'Pharmacy stock', min: 500, max: 20000, step: 500, fmt: (v) => `${v.toLocaleString()} units`, desc: 'Medicine held by the city\'s pharmacies for common illness. Running out slightly raises risk for people with a chronic condition.' },
      { key: 'medicineRestock', label: 'Medicine delivered', min: 0, max: 2000, step: 50, fmt: (v) => `${v}/day`, desc: 'Daily resupply to the pharmacy network.' },
    ] },
    { group: 'Media, traffic cameras & AI', fold: true, items: [
      { key: 'mediaReach', label: 'TV news reach', min: 0, max: 100, step: 10, fmt: (v) => `${v}%`, desc: 'How many people follow the news. Headlines raise awareness, and aware people go to parks and the amusement park less.' },
      { key: 'challanCameras', label: 'Traffic cameras', min: 0, max: 12, step: 1, fmt: (v) => v === 0 ? 'none' : `${v} cameras`, desc: 'Smart cameras read plates and issue e-challans for speeding and red-light running. Fined drivers slow down a little.' },
      { key: 'aiAutopilot', label: 'AI autopilot', type: 'toggle', desc: 'The AI forecasts the air and acts: sends a smog alert when AQI over 250 is forecast, pauses construction when over 200 is forecast, and dispatches kiln inspectors after each satellite pass.' },
    ] },
    { group: 'New city features', fold: true, items: [
      { key: 'constructionOn', label: 'Construction site', type: 'toggle', desc: 'A crew builds a tower (up to 30 floors). Work is Monday to Saturday, 7 to 18. It makes dust, uses diesel and stops in heavy rain.' },
      { key: 'constructionWorkers', label: 'Construction crew', min: 10, max: 200, step: 10, fmt: (v) => `${v} workers`, desc: 'A bigger crew builds faster, makes more dust and uses more power.' },
      { key: 'constructionSpeed', label: 'Building speed', min: 0.5, max: 3, step: 0.5, fmt: (v) => `${v}x`, desc: 'About 1.5 floors per working day at 1x for a crew of 60.' },
      { key: 'dustControl', label: 'Dust control (water spray)', type: 'toggle', desc: 'Spraying water and covering the site cuts construction dust by 60%.' },
      { key: 'constructionAqiBan', label: 'Stop work in smog', type: 'toggle', desc: 'Construction stops while the air quality index is over 200.' },
      { key: 'skyFloors', label: 'Sky Tower floors', min: 10, max: 80, step: 5, fmt: (v) => `${v} floors`, desc: 'A taller tower casts a longer shadow, uses more electricity and has longer lift queues.' },
      { key: 'amusementOpen', label: 'Funland amusement park open', type: 'toggle', desc: 'People visit in the evening, most on weekends. It closes in rain or thunderstorms.' },
      { key: 'amusementRides', label: 'Rides', min: 0, max: 14, step: 1, fmt: (v) => `${v} rides`, desc: 'More rides use more electricity. Fewer rides leave the wheel, carousel, coaster and swings dark.' },
      { key: 'amusementVisitors', label: 'Visitor numbers', min: 0, max: 300, step: 10, fmt: (v) => `${v}%`, desc: 'How many people want to visit. Crowds raise the infection risk.' },
      { key: 'evShare', label: 'Electric cars', min: 0, max: 100, step: 10, fmt: (v) => `${v}%`, desc: 'Share of household cars that are electric: less exhaust, more evening charging on the grid.' },
    ] },
    { group: 'Weather & air', fold: true, items: [
      { key: 'weather', label: 'Weather', type: 'select', options: [['auto', 'Real weather (changes daily)'], ['clear', 'Always clear'], ['rain', 'Always raining'], ['storm', 'Thunderstorm all day'], ['fog', 'Thick fog all day'], ['smog', 'Smog (fog + trapped smoke)'], ['snow', 'Snowfall all day']], desc: 'Real weather brings rain on some days and fog on some mornings. Rain keeps people out of parks, makes more people drive, makes roads slippery and washes smoke out of the air. Fog causes accidents and traps smoke. Snow is an extreme-weather drill for demonstrating winter response (ploughs, flight delays) — this city\'s own winters are mild, not snowy; see Research tab.' },
      { key: 'snowPloughs', label: 'Snow ploughs', type: 'toggle', desc: 'Dispatch ploughs once snow settles on the roads, clearing them faster and keeping traffic moving.' },
      { key: 'rainChance', label: 'Rainy days', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, showIf: ['weather', 'auto'], desc: 'With real weather: the share of days with a rain spell of 2–8 hours.' },
      { key: 'fogChance', label: 'Foggy mornings', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, showIf: ['weather', 'auto'], desc: 'With real weather: the share of mornings with fog from the early hours until about 10:00.' },
      { key: 'lightningRate', label: 'Lightning in storms', min: 0, max: 30, step: 1, fmt: (v) => `${v} strikes / hour`, desc: 'How often lightning strikes the city during a thunderstorm. A strike can burn out a transformer (a power cut for a block) or, rarely, start a fire.' },
      { key: 'kilns', label: 'Brick kilns burning', min: 0, max: 8, step: 1, fmt: (v) => `${v} kiln${v === 1 ? '' : 's'}`, desc: 'Brick kilns outside the city burn day and night. Their smoke drifts over the city with the wind.' },
      { key: 'cleanKilns', label: 'Clean zig-zag kilns', type: 'toggle', desc: 'Zig-zag kiln technology burns fuel better: about 65% less smoke.' },
      { key: 'factorySmoke', label: 'Factory smoke', min: 0, max: 200, step: 10, fmt: (v) => `${v}%`, desc: 'Smoke from the two factory chimneys during working hours (100% = normal).' },
      { key: 'trafficSmoke', label: 'Traffic exhaust', min: 0, max: 200, step: 10, fmt: (v) => `${v}%`, desc: 'Exhaust from cars, buses and trucks in the city and on the motorway (100% = normal).' },
      { key: 'airHarm', label: 'Harm from bad air', min: 0, max: 150, step: 10, fmt: (v) => `+${v}%`, desc: 'Extra chance of serious illness for a person who has been breathing heavily polluted air (PM2.5 of 150 µg/m³ for days).' },
      { key: 'smogSchoolClose', label: 'Close schools in smog', type: 'toggle', desc: 'Close schools and the university on days after the air quality index was above 300.' },
    ] },
    { group: 'Roads & traffic', fold: true, items: [
      { key: 'trafficLights', label: 'Traffic lights on highways', type: 'toggle', desc: 'Traffic lights at the 13 junctions on the two highways. Cars queue at red lights; a few drivers run red lights, more when stressed.' },
      { key: 'trafficPolice', label: 'Traffic police', min: 0, max: 12, step: 1, fmt: (v) => `${v} officer${v === 1 ? '' : 's'}`, desc: 'Officers at the busiest junctions (07:00–21:00). Drivers there rarely run a red light and crashes are less likely.' },
      { key: 'speedLimit', label: 'City speed limit', min: 30, max: 80, step: 5, fmt: (v) => `${v} km/h`, desc: 'Faster driving means shorter trips but more accidents and more deaths in each accident.' },
      { key: 'seatbelts', label: 'Seat belt use', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Share of drivers wearing a seat belt. A belt roughly halves the chance of being injured or killed in a crash.' },
      { key: 'roadDanger', label: 'Driving danger', min: 0, max: 300, step: 10, fmt: (v) => `${v}%`, desc: 'Overall accident risk (100% = normal). Rain, fog, darkness and stress raise it further.' },
      { key: 'motorwayTraffic', label: 'Motorway traffic', min: 0, max: 120, step: 10, fmt: (v) => `${v} / hour`, desc: 'Cars, buses and trucks passing on the M-2 motorway.' },
      { key: 'motorwayFogClose', label: 'Close motorway in fog', type: 'toggle', desc: 'The motorway police close the motorway in thick fog. If it stays open, drivers who cannot see a crash ahead drive into it: pile-ups.' },
    ] },
    { group: 'Lifestyle & gatherings', fold: true, items: [
      { key: 'smokers', label: 'Smokers', min: 0, max: 60, step: 5, fmt: (v) => `${v}% of adults`, desc: 'Smokers are 1.8 times as likely to become seriously ill and 1.2 times as likely to catch the disease. They take smoke breaks outside their workplace.' },
      { key: 'gymGoers', label: 'Gym-goers', min: 0, max: 60, step: 5, fmt: (v) => `${v}% of adults`, desc: 'People who work out at the gym before or after work. Fit people are 40% less likely to become seriously ill, but the gym is a crowded indoor place.' },
      { key: 'gymOpen', label: 'Gym open', type: 'toggle', desc: 'People can work out at the gym.' },
      { key: 'stressEffect', label: 'Stress weakens immunity', min: 0, max: 100, step: 5, fmt: (v) => `+${v}%`, desc: 'Extra chance of catching the disease for a fully stressed person. Work, traffic jams, queues, illness in the family and a full hospital raise stress; home, parks, the gym and prayers lower it.' },
      { key: 'errands', label: 'NADRA & passport visits', min: 0, max: 15, step: 1, fmt: (v) => `${v}% / day`, desc: 'Each weekday, the share of adults who take a day off to queue at the NADRA office or the passport office.' },
      { key: 'gatheringsOpen', label: 'Friday prayers & weddings', type: 'toggle', desc: 'Large gatherings: Friday prayers at the Jamia Masjid around 13:00 and evening weddings at the Shadi Hall.' },
      { key: 'weddings', label: 'Weddings', min: 0, max: 3, step: 1, fmt: (v) => `${v} / week`, dependsOn: 'gatheringsOpen', desc: 'Weddings on Friday, Saturday and Sunday evenings. About 15% of families are invited to each one.' },
    ] },
    { group: 'Airport & travel', fold: true, items: [
      { key: 'flightsPerDay', label: 'Flights per day', min: 0, max: 16, step: 1, fmt: (v) => `${v} flight${v === 1 ? '' : 's'}`, desc: 'Arrivals at the airport each day (from the next day). Residents fly away on trips and come back days later.' },
      { key: 'importRisk', label: 'Travellers bringing it home', min: 0, max: 30, step: 1, fmt: (v) => `${v}%`, desc: 'Share of returning travellers who caught the disease abroad (imported cases).' },
    ] },
    { group: 'Daily life: prayers, funerals, shopping', fold: true, items: [
      { key: 'prayerAttendance', label: 'Five daily prayers', min: 0, max: 100, step: 5, fmt: (v) => `${v}% of devout`, desc: 'Share of devout people who walk to the Jamia Masjid for each of the five daily prayers (Fajr, Zuhr, Asr, Maghrib, Isha). Applies from the next day’s plans. Needs "Friday prayers & weddings" (gatherings) switched on.' },
      { key: 'funeralGuests', label: 'Funeral mourners', min: 0, max: 40, step: 2, fmt: (v) => `${v} people`, desc: 'When someone dies, the family and nearby neighbours attend the janazah prayer (13:35) and the burial (14:30) the next day. A hearse takes the body to the graveyard.' },
      { key: 'groceryDelivery', label: 'Grocery delivery', min: 0, max: 60, step: 5, fmt: (v) => `${v}% of shoppers`, desc: 'Share of shopping trips replaced by a delivery van from the mart. Fewer shoppers in the mart and mandi, but more vans on the road.' },
    ] },
    { group: 'Public transport & ambulances', fold: true, items: [
      { key: 'busesPerHour', label: 'Buses per hour', min: 0, max: 6, step: 1, fmt: (v) => `${v} / hour / route`, desc: 'Buses on Route 1 (Airport Road) and Route 2 (North–South). Buses obey traffic lights. 0 = no bus service (a bus ban).' },
      { key: 'busShare', label: 'Bus riders', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Share of people without a car (or on a long trip) who take the bus when a stop is near.' },
      { key: 'busCapacity', label: 'Bus capacity', min: 10, max: 60, step: 2, fmt: (v) => `${v} seats`, desc: 'Passengers a bus can carry. A crowded bus raises the infection risk (shared air, close contact). Riders give up waiting after about an hour.' },
      { key: 'cyclists', label: 'Cyclists', min: 0, max: 50, step: 2, fmt: (v) => `${v}% of walkers`, desc: 'Share of adult trips made by bicycle: 2.4 times as fast as walking, using the same footpaths.' },
      { key: 'ambulances', label: 'Ambulances', min: 1, max: 8, step: 1, fmt: (v) => `${v}`, desc: 'Ambulances at the hospital. Cars pull over for an ambulance with its siren on.' },
      { key: 'signalCycle', label: 'Signal cycle', min: 20, max: 90, step: 5, fmt: (v) => `${v} ticks`, dependsOn: 'trafficLights', desc: 'Length of one full traffic-light cycle in minutes of model time.' },
      { key: 'greenSplit', label: 'Green split north–south', min: 20, max: 80, step: 5, fmt: (v) => `${v}%`, dependsOn: 'trafficLights', desc: 'Share of the green time given to the north–south road.' },
    ] },
    { group: 'Energy & heat', fold: true, items: [
      { key: 'baseTemp', label: 'Base temperature', min: 5, max: 42, step: 1, fmt: (v) => `${v} °C`, desc: 'Daily mean temperature. Hot days raise cooling demand; hot people get ill more easily (especially elders).' },
      { key: 'heatwave', label: 'Heatwave', type: 'toggle', desc: 'Adds about 9 °C. Air-conditioning demand rises and peak demand can exceed the grid capacity.' },
      { key: 'solarKw', label: 'Solar farm', min: 0, max: 400, step: 20, fmt: (v) => `${v} kW`, desc: 'Peak output of the solar farm. Output follows the sun, cloud, dust and panel temperature.' },
      { key: 'batteryKwh', label: 'Battery', min: 0, max: 1500, step: 50, fmt: (v) => `${v} kWh`, desc: 'Battery that stores surplus solar and covers shortages. The model checks that its charge never leaves 0–100%.' },
      { key: 'gridCapacity', label: 'Grid import limit', min: 100, max: 800, step: 20, fmt: (v) => `${v} kW`, desc: 'Most power the city can import from the national grid at one time.' },
      { key: 'electricityPrice', label: 'Electricity price', min: 10, max: 120, step: 5, fmt: (v) => `${v} / kWh`, desc: 'Tariff. A higher price makes households use less (price elasticity) and costs show in the Smart city tab.' },
      { key: 'demandResponse', label: 'Demand response', min: 0, max: 50, step: 5, fmt: (v) => `−${v}% at peak`, desc: 'Asks households and offices to cut use during the evening peak.' },
      { key: 'loadShedding', label: 'Load-shedding policy', type: 'select', options: [['uniform', 'Cut everyone equally'], ['critical', 'Protect critical services'], ['rolling', 'Rolling cuts by feeder']], desc: 'What happens when supply is short. Priority order: hospital & signals > public > industry > homes > street lights.' },
      { key: 'gridOutageChance', label: 'Grid outage chance', min: 0, max: 100, step: 5, fmt: (v) => `${v}% / day`, desc: 'Chance per day of a grid outage. With no power the traffic lights flash, crashes rise 2.5 times, streets are dark and pumps stop.' },
      { key: 'gridOutageHours', label: 'Outage length', min: 1, max: 12, step: 1, fmt: (v) => `${v} h`, desc: 'How long a random grid outage lasts.' },
      { key: 'localFaults', label: 'Local transformer faults', min: 0, max: 4, step: 0.2, fmt: (v) => `${v} / day`, desc: 'Average number of one-block power cuts per day. A maintenance crew must repair each one.' },
      { key: 'streetlights', label: 'Street lighting', type: 'select', options: [['full', 'Full'], ['dimmed', 'Dimmed after 23:00'], ['adaptive', 'Adaptive (dim when empty)'], ['off', 'Off']], desc: 'Dark roads raise crash risk at night.' },
      { key: 'hospitalGenerator', label: 'Hospital diesel generator', type: 'toggle', desc: 'Keeps the hospital running in an outage. Without it, bed capacity falls by half.' },
    ] },
    { group: 'Water', fold: true, items: [
      { key: 'waterSupply', label: 'Treatment inflow', min: 1, max: 10, step: 0.2, fmt: (v) => `${v} m³ / tick`, desc: 'Water the plant sends into the tank. Needs pump power.' },
      { key: 'tankCapacity', label: 'Storage tank', min: 40, max: 400, step: 10, fmt: (v) => `${v} m³`, desc: 'Reservoir size. A bigger tank rides out outages and droughts.' },
      { key: 'pumpCapacity', label: 'Pump capacity', min: 2, max: 16, step: 1, fmt: (v) => `${v} m³ / tick`, desc: 'Most water the pumps can deliver. Pumps stop when power is cut.' },
      { key: 'leakRate', label: 'Pipe leakage', min: 0, max: 40, step: 1, fmt: (v) => `${v}%`, desc: 'Share of delivered water lost in leaking pipes.' },
      { key: 'pipeFailure', label: 'Main-burst chance', min: 0, max: 100, step: 2, fmt: (v) => `${v}% / day`, desc: 'Chance per day that a water main bursts. A crew must repair it.' },
      { key: 'drought', label: 'Drought', type: 'toggle', desc: 'Cuts the inflow to about 45%.' },
      { key: 'waterConservation', label: 'Water conservation', min: 0, max: 50, step: 5, fmt: (v) => `−${v}%`, desc: 'Households and offices use less water.' },
      { key: 'waterPrice', label: 'Water price', min: 5, max: 100, step: 5, fmt: (v) => `${v} / m³`, desc: 'Tariff. A higher price reduces use.' },
      { key: 'hygieneEffect', label: 'Hygiene effect', min: 0, max: 100, step: 5, fmt: (v) => `+${v}%`, desc: 'Extra infection chance at home when water is short (no washing).' },
      { key: 'drainage', label: 'Storm drainage', min: 20, max: 150, step: 5, fmt: (v) => `${v}%`, desc: 'How fast rain drains away. Rubbish blocks drains and causes flooding.' },
    ] },
    { group: 'Waste', fold: true, items: [
      { key: 'wasteRate', label: 'Waste produced', min: 40, max: 200, step: 10, fmt: (v) => `${v}%`, desc: 'Rubbish created in homes, shops, mandi, hospital and factories (100% = normal).' },
      { key: 'binCapacity', label: 'Bin size', min: 80, max: 500, step: 20, fmt: (v) => `${v} kg`, desc: 'Capacity of the rubbish bin of each block. A full bin overflows into the street.' },
      { key: 'wasteFleet', label: 'Waste trucks', min: 0, max: 6, step: 1, fmt: (v) => `${v}`, desc: 'Trucks that collect rubbish. 0 = a sanitation strike: bins overflow within days.' },
      { key: 'collectionPriority', label: 'Collection order', type: 'select', options: [['fullest', 'Fullest bin first'], ['route', 'Fixed route']], desc: 'Trucks go to the fullest bin or follow a fixed round.' },
      { key: 'recyclingRate', label: 'Recycling', min: 0, max: 60, step: 5, fmt: (v) => `${v}%`, desc: 'Share of collected waste that is recycled instead of buried.' },
      { key: 'wasteBurning', label: 'Waste burning', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'Share of overflowing rubbish that people burn. Burning adds smoke (PM2.5).' },
      { key: 'sanitationEffect', label: 'Sanitation effect', min: 0, max: 100, step: 5, fmt: (v) => `+${v}%`, desc: 'Extra infection chance at homes next to an overflowing bin.' },
    ] },
    { group: 'City services & digital twin', fold: true, items: [
      { key: 'maintenanceCrews', label: 'Maintenance crews', min: 0, max: 10, step: 1, fmt: (v) => `${v}`, desc: 'Crews that repair faults, bursts and clean overflow.' },
      { key: 'fireTrucks', label: 'Fire engines', min: 0, max: 5, step: 1, fmt: (v) => `${v}`, desc: 'Engines at the fire station.' },
      { key: 'fireRate', label: 'Fire chance', min: 0, max: 20, step: 1, fmt: (v) => `${v}% / day`, desc: 'Chance per day of a fire in a building. Fires injure people and make smoke.' },
      { key: 'sensorNoise', label: 'Sensor noise', min: 0, max: 30, step: 1, fmt: (v) => `±${v}%`, desc: 'Random error of the air, power and water sensors.' },
      { key: 'sensorLatency', label: 'Sensor delay', min: 0, max: 60, step: 5, fmt: (v) => `${v} ticks`, desc: 'How late a reading reaches the control room.' },
      { key: 'sensorInterval', label: 'Sensor interval', min: 10, max: 120, step: 10, fmt: (v) => `${v} ticks`, desc: 'How often a sensor measures.' },
      { key: 'sensorFailure', label: 'Sensor failures', min: 0, max: 50, step: 1, fmt: (v) => `${v}% / day`, desc: 'Chance per day that a sensor fails for some hours.' },
      { key: 'sensorDrop', label: 'Lost messages', min: 0, max: 60, step: 1, fmt: (v) => `${v}%`, desc: 'Share of readings lost on the way to the control room.' },
      { key: 'decideBySensors', label: 'Rules use sensor readings', type: 'toggle', desc: 'The smog school-closure rule uses what the control room sees (noisy, late, sometimes missing) instead of the true air quality. The model counts the wrong decisions.' },
    ] },
    { group: 'Wi-Fi & city alerts', fold: true, items: [
      { key: 'wifiAps', label: 'Wi-Fi access points', min: 0, max: 10, step: 1, fmt: (v) => `${v} of 10`, desc: 'Public Wi-Fi in the hospital, bazaar, mart, airport, mosque, university, government offices, school, park and office tower. Switching some off leaves dead zones.' },
      { key: 'wifiRange', label: 'Wi-Fi range', min: 30, max: 200, step: 10, fmt: (v) => `${v} m`, desc: 'How far from each access point a phone can connect.' },
      { key: 'wifiCapacity', label: 'Capacity per access point', min: 50, max: 1000, step: 50, fmt: (v) => `${v} Mbit/s`, desc: 'When the people connected want more than this, everybody on that access point gets a slower link.' },
      { key: 'wifiBattery', label: 'Battery backup', min: 0, max: 12, step: 1, fmt: (v) => `${v} h`, desc: 'How long an access point keeps working in a power cut before it goes dark.' },
      { key: 'wifiFailure', label: 'Access-point failures', min: 0, max: 30, step: 1, fmt: (v) => `${v}% / day`, desc: 'Chance per day that an access point breaks for a few hours. Sensors that lose Wi-Fi fall back to a weaker mobile link and lose more readings.' },
      { key: 'alertCompliance', label: 'Alert compliance', min: 0, max: 100, step: 5, fmt: (v) => `${v}%`, desc: 'When you press "Send emergency alert" (Smart city tab), this share of people who are out go home.' },
    ] },
    { group: 'Government & economy (v17)', fold: true, items: [
      { key: 'economy', label: 'Economy and government on', type: 'toggle', reset: true, desc: 'Money, prices, a budget, births and natural deaths. Off gives the older model without them.' },
      { key: 'moneyScale', label: 'People per simulated person', min: 50, max: 2000, step: 50, fmt: (v) => `×${v}`, reset: true, desc: 'All money figures treat each simulated person as this many real people. 400 × 500 people = a city of 200,000.' },
      { key: 'taxRate', label: 'Property tax', min: 50, max: 200, step: 5, fmt: (v) => `${v}% of normal`, desc: 'Municipal property tax rate. Higher tax brings money and costs the city some trust only through the emergency levy.' },
      { key: 'foodPrice', label: 'Food basket price', min: 150, max: 800, step: 10, fmt: (v) => `Rs ${v} / person / day`, desc: 'What the food basket costs. Prices then move with inflation, shocks and shortages.' },
      { key: 'medicinePrice', label: 'Medicine price', min: 50, max: 600, step: 10, fmt: (v) => `Rs ${v} / course`, desc: 'Price of a course of common medicines. It rises when shelves are low or many people are sick.' },
      { key: 'busFare', label: 'Bus fare', min: 0, max: 120, step: 5, fmt: (v) => (v === 0 ? 'free' : `Rs ${v}`), desc: 'Price of a bus ride. Free or cheap rides attract more riders and cost the city fare income.' },
      { key: 'spendingFreeze', label: 'Freeze non-urgent spending', type: 'toggle', desc: 'Cuts running costs by about 4%.' },
      { key: 'demoMul', label: 'Time-lapse for births and deaths', min: 1, max: 60, step: 1, fmt: (v) => `×${v}`, desc: 'Births and natural deaths happen this many times faster than real life, so a short run shows them (1 = real speed).' },
      { key: 'birthRooms', label: 'Birth centre: delivery rooms', min: 1, max: 10, step: 1, fmt: (v) => `${v}`, desc: 'Rooms where mothers deliver at the hospital.' },
      { key: 'midwives', label: 'Birth centre: midwives', min: 1, max: 20, step: 1, fmt: (v) => `${v}`, desc: 'Each midwife can look after two births at the same time.' },
      { key: 'incubators', label: 'Birth centre: incubators', min: 0, max: 10, step: 1, fmt: (v) => `${v}`, desc: 'For babies born early. Without one an early baby is far more likely to die.' },
      { key: 'antenatal', label: 'Antenatal care', min: 0, max: 100, step: 5, fmt: (v) => `${v}% of mothers`, desc: 'Share of mothers who attend antenatal care. It lowers complications and makes a hospital birth more likely.' },
    ] },
    { group: 'Out-of-the-box measures (v17)', fold: true, items: [
      { key: 'purifiers', label: 'Air purifiers in homes', min: 0, max: 100, step: 5, fmt: (v) => `${v}% of homes`, desc: 'City-subsidised purifiers, given first to homes with elders, asthma or children. They cut the smog people breathe indoors.' },
      { key: 'bldgFilters', label: 'Air filters in schools, hospital, offices', type: 'toggle', desc: 'Filters in public buildings: less smog indoors there.' },
      { key: 'sprayGuns', label: 'Anti-smog spray guns', min: 0, max: 10, step: 1, fmt: (v) => `${v}`, desc: 'Water-mist guns that help clear dust and smoke on dry days. They drink from the water tank.' },
      { key: 'cloudSeeding', label: 'Cloud seeding flights', type: 'toggle', desc: 'A flight on days with suitable clouds. It can lengthen coming rain or start a light spell, and does nothing under a clear sky. Each flight costs money.' },
      { key: 'oddEven', label: 'Odd-even car rule', type: 'toggle', desc: 'Half the household cars stay home each day (by number). Taxis are exempt.' },
      { key: 'cashTransfer', label: 'Cash relief', min: 0, max: 1500, step: 50, fmt: (v) => `Rs ${v} / household / day`, desc: 'Paid to the poorest households. It keeps people able to follow rules and eases distress.' },
      { key: 'transferShare', label: 'Cash relief reaches', min: 10, max: 100, step: 10, fmt: (v) => `poorest ${v}%`, desc: 'Which share of households gets the relief.' },
      { key: 'foodSubsidy', label: 'Food subsidy', min: 0, max: 50, step: 5, fmt: (v) => `−${v}% on food`, desc: 'Lowers the shop price of food; the city pays the difference.' },
      { key: 'wageSupport', label: 'Wage support', min: 0, max: 100, step: 10, fmt: (v) => `${v}% of lost wages`, desc: 'The city pays part of the wages lost by workers whose workplace is closed or who are sick.' },
      { key: 'vaxDrive', label: 'Vaccination drive', min: 0, max: 5, step: 0.5, fmt: (v) => (v === 0 ? 'off' : `${v}% of the city / day`), desc: 'Vaccinates this share of the city every day, highest-risk first. Needs doses and staff.' },
      { key: 'tankers', label: 'Hired water tankers', min: 0, max: 10, step: 1, fmt: (v) => `${v}`, desc: 'Extra water brought in by tanker.' },
    ] },
    { group: 'Advanced', advanced: true, items: [
      { key: 'immunityWanes', label: 'Immunity wears off', type: 'toggle', desc: 'Recovered people slowly lose their immunity.' },
      { key: 'immunityDays', label: 'Immunity lasts', min: 10, max: 365, step: 5, fmt: days, dependsOn: 'immunityWanes', desc: 'Average number of days immunity lasts.' },
      { key: 'seed', label: 'Random seed', type: 'seed', reset: true, desc: 'Starting number of the random generator. The seed also shapes households and the city. Same seed + same settings = identical run.' },
    ] },
  ];
  const ALL_PARAMS = PARAM_UI.flatMap((g) => g.items);
  window.__OL_PARAMS = ALL_PARAMS;
  const RESET_KEYS = ALL_PARAMS.filter((p) => p.reset).map((p) => p.key);

  const JOB_LABEL = {
    office: 'Office worker', factory: 'Factory worker', university: 'University staff', student: 'University student', market: 'Shopkeeper',
    school: 'Teacher', hospital: 'Doctor or nurse', police: 'Police officer', fuel: 'Petrol station worker', none: 'Not working', retired: 'Retired', pupil: 'Pupil',
    airport: 'Airport staff', govt: 'Government clerk', gym: 'Gym trainer', wedding: 'Wedding hall staff', mart: 'Mart cashier', mandi: 'Mandi trader', fire: 'Firefighter',
  };
  const WHERE_COLORS = { home: '#ffb83d', school: '#5aa9ff', work: '#b197fc', market: '#ff6fb5', park: '#2ee6a1', gym: '#46c6e6', govt: '#2f9d6a', gathering: '#e9c46a', airport: '#8fa9ff', street: '#c3ccd4', hospital: '#ff4d4f', transit: '#f4b942' };

  /* ---------------- palettes ---------------- */
  const PAL = {
    night: {
      night: true, glow: true, sidewalk: '#16202a', road: '#1a2430', median: '#16261d',
      laneMain: 'rgba(242,190,70,0.6)', laneDash: 'rgba(170,190,210,0.32)', zebra: 'rgba(210,222,235,0.26)', edgeLine: 'rgba(190,205,220,0.14)',
      lot: '#0f1a15', hedge: '#183527', drive: '#1c252e', walkway: '#212c35',
      grass: '#10261b', path: '#1d2b33', pond: '#0f3a52', pondEdge: '#1b5470', sand: '#2b2a22',
      concrete: '#141d26', concrete2: '#18222c', parking: '#161e27', parkLine: 'rgba(190,205,220,0.2)', plaza: '#18212b', fence: '#3a4f63',
      roofs: ['#2d3947', '#35404d', '#3b3443', '#2d3f40', '#41392f', '#343c46'], roofHi: 'rgba(255,255,255,0.06)', roofDark: 'rgba(0,0,0,0.26)', roofLine: 'rgba(0,0,0,0.5)', roofEdge: 'rgba(140,170,200,0.16)',
      roofApt: '#27323e', roofSchool: '#3f302b', roofUni: '#2f3542', roofOffice: ['#1b3248', '#244460'], roofFactory: '#2c3237', roofHosp: '#2f3b46', wardRoof: '#24323f', roofPolice: '#1e3252', canopy: '#2a3441', shop: '#2a2f38',
      tank: '#0b0f14', tankHi: '#55616f', solar: '#1a3558', solarLine: 'rgba(120,170,230,0.35)', ac: '#3a4552',
      track: '#4a2b26', field: '#123020', fieldLine: 'rgba(220,235,225,0.32)',
      awning: ['#7a2f39', '#7a5e22', '#1f566e', '#24583b', '#74401f'], awningStripe: 'rgba(255,255,255,0.08)', fountain: '#1a2833', water: '#14506e', fountainHi: '#4fb3e0',
      cross: '#ff4d4f', heli: '#1a2531', heliMark: 'rgba(220,235,250,0.65)', tent: '#2c3742', bed: '#3b4a58',
      tree: ['#0f3526', '#12412f', '#0c2e21'], treeHi: 'rgba(120,230,170,0.08)', shadow: null,
      window: '#ffd27a', label: 'rgba(205,222,238,0.96)', labelShadow: 'rgba(0,0,0,0.92)',
      agents: { S: '#9fb3c8', E: '#ffb83d', I: '#ff4d4f', R: '#2ee6a1', D: '#74818f', V: '#b197fc' },
      outline: 'rgba(0,0,0,0.6)', maskDot: '#eef4f9', select: '#ffffff', grave: '#3a4652', graveMark: '#9aa7b4',
      car: ['#c8d2dc', '#4f7fcf', '#c94f4f', '#d8ad4a', '#6f7e8d', '#46a382', '#8a6fd1', '#d07f3c'], carGlass: 'rgba(8,16,24,0.9)',
      lampHead: '#ffe2a8', closedTape: '#ff4d4f', heatAlpha: 0.85,
      farm: '#0d1912', fields: ['#10241a', '#17261a', '#1d2219', '#13221b', '#1a2418'], furrow: 'rgba(0,0,0,0.22)', dirt: '#1f1d19', canal: '#0e2e40', canalEdge: '#173f52',
      motorway: '#17212c', shoulder: '#121a22', barrier: '#4d5d6d', verge: '#0f2016', mwLine: 'rgba(225,232,240,0.5)', mwEdge: 'rgba(242,190,70,0.55)',
      airGrass: '#0d1d15', runway: '#141c25', rwMark: 'rgba(225,232,240,0.62)', taxi: '#18212b', taxiLine: 'rgba(242,190,70,0.6)', apron: '#1a232d', apronLine: 'rgba(242,190,70,0.4)',
      termRoof: '#26313d', termGlass: '#1d3a52', termEdge: 'rgba(140,170,200,0.25)', bridge: '#33404d', tower: '#2a3542', towerGlass: '#3a7ca8', hangar: '#232c36',
      kilnRing: '#3b2219', kilnTrench: '#1a1210', kilnBrick: '#4a2b21', bricks: ['#4d2c22', '#5a3326', '#43261e'], ash: '#262422', chimney: '#0b0b0c', hut: '#2a2a2c',
      gymFloor: '#1a2027', gymMat: '#16303a', treadmill: '#0c1117', machine: '#2e3946', mosqueFloor: '#1d2630', mosqueRug: '#2a1c2a', dome: '#2d4a43', minaret: '#33414f',
      marquee: '#3a2b40', marqueeStripe: 'rgba(255,255,255,0.05)', stage: '#4a2a3a', table: '#2c3743', govtRoof: '#1f3a33', govtHall: '#1b232c', chair: '#2a3542', queueLine: 'rgba(242,190,70,0.35)',
      planeBody: '#d8dee5', planeWing: '#aab4bf', planeEngine: '#6b7682', planeShadow: 'rgba(0,0,0,0.35)', heliBody: '#e8ecef', heliRed: '#e0393e', rotor: 'rgba(220,230,240,0.55)',
      smoke: [70, 72, 76], steam: [150, 158, 166], signalOff: '#28323c', signalBox: '#0b0f14', officerShirt: '#e9eef2', officerCap: '#1d3a6b', umbrella: ['#e0393e', '#f2f4f6'],
    },
    day: {
      night: false, glow: false, sidewalk: '#cfd2cb', road: '#646d77', median: '#8fae6f',
      laneMain: '#f2c94c', laneDash: 'rgba(255,255,255,0.85)', zebra: 'rgba(255,255,255,0.92)', edgeLine: 'rgba(255,255,255,0.55)',
      lot: '#cddbb6', hedge: '#8fb27b', drive: '#b8bcb5', walkway: '#dcd8cc',
      grass: '#b4d398', path: '#e6ddc6', pond: '#73b6d8', pondEdge: '#a9d4e8', sand: '#e8d9a8',
      concrete: '#dde0e3', concrete2: '#cbd0d5', parking: '#9aa1a8', parkLine: 'rgba(255,255,255,0.85)', plaza: '#eadfc8', fence: '#7d8a97',
      roofs: ['#b8613e', '#6c7988', '#c9a26a', '#4f8a8b', '#9a5a4a', '#8c95a0'], roofHi: 'rgba(255,255,255,0.16)', roofDark: 'rgba(0,0,0,0.14)', roofLine: 'rgba(0,0,0,0.28)', roofEdge: 'rgba(0,0,0,0.25)',
      roofApt: '#aab0b7', roofSchool: '#c0623f', roofUni: '#a1a9b3', roofOffice: ['#5c7c9b', '#7898b8'], roofFactory: '#9aa3ab', roofHosp: '#f1f4f6', wardRoof: '#dfe6ec', roofPolice: '#3e5f9a', canopy: '#eef0f2', shop: '#c8b9a3',
      tank: '#2a2f35', tankHi: '#8c96a0', solar: '#2f5f9a', solarLine: 'rgba(255,255,255,0.45)', ac: '#8b939b',
      track: '#c0624a', field: '#6fae5c', fieldLine: 'rgba(255,255,255,0.85)',
      awning: ['#e05d5d', '#f2c14e', '#3fa7d6', '#59c47a', '#f08a4b'], awningStripe: 'rgba(255,255,255,0.5)', fountain: '#cfd8de', water: '#6fb3d6', fountainHi: '#e8f6ff',
      cross: '#e03b3b', heli: '#4a5560', heliMark: '#ffffff', tent: '#f4f4f2', bed: '#ffffff',
      tree: ['#4f8f47', '#5d9d50', '#3f7d3b'], treeHi: 'rgba(255,255,255,0.16)', shadow: 'rgba(40,50,40,0.22)',
      window: null, label: 'rgba(15,25,35,0.95)', labelShadow: 'rgba(255,255,255,0.92)',
      agents: { S: '#5a6d81', E: '#de8a00', I: '#e3262b', R: '#0d9467', D: '#39424b', V: '#7c4fe0' },
      outline: 'rgba(10,20,30,0.6)', maskDot: '#ffffff', select: '#0b1218', grave: '#8a939c', graveMark: '#ffffff',
      car: ['#f4f6f8', '#3f6fc2', '#c23f3f', '#e2b23e', '#56636f', '#2f9470', '#7a5cc8', '#d9772f'], carGlass: 'rgba(30,50,70,0.75)',
      lampHead: '#ffffff', closedTape: '#e3262b', heatAlpha: 0.8,
      farm: '#a9c486', fields: ['#8fbf63', '#c9c36b', '#b59a69', '#7fb35a', '#a7c46e'], furrow: 'rgba(60,50,30,0.16)', dirt: '#c2a77f', canal: '#5ea7cc', canalEdge: '#9fcde3',
      motorway: '#5a636c', shoulder: '#7a8189', barrier: '#c9ced3', verge: '#9cc277', mwLine: 'rgba(255,255,255,0.9)', mwEdge: '#f2c94c',
      airGrass: '#a3c785', runway: '#3d444b', rwMark: 'rgba(255,255,255,0.95)', taxi: '#6b737b', taxiLine: '#f2c94c', apron: '#c3c8cd', apronLine: 'rgba(242,190,70,0.85)',
      termRoof: '#e1e5e9', termGlass: '#7fb2d6', termEdge: 'rgba(0,0,0,0.25)', bridge: '#9ea7b0', tower: '#cfd5da', towerGlass: '#4f8fbf', hangar: '#b9c0c7',
      kilnRing: '#a5583b', kilnTrench: '#3b2a24', kilnBrick: '#b8673f', bricks: ['#b9653f', '#c87650', '#a65a39'], ash: '#7f7a74', chimney: '#2c2c2e', hut: '#9b8f80',
      gymFloor: '#d6d9dc', gymMat: '#4f9fb3', treadmill: '#2a3036', machine: '#6c7784', mosqueFloor: '#efe9dc', mosqueRug: '#9c3d4f', dome: '#3f8f7a', minaret: '#f1ede4',
      marquee: '#f3e6f0', marqueeStripe: 'rgba(200,80,140,0.18)', stage: '#c2416f', table: '#ffffff', govtRoof: '#2f7d5c', govtHall: '#e8ebee', chair: '#5d6a78', queueLine: 'rgba(200,140,20,0.7)',
      planeBody: '#f4f6f8', planeWing: '#c9d0d7', planeEngine: '#8a949e', planeShadow: 'rgba(30,40,40,0.28)', heliBody: '#f4f6f8', heliRed: '#e0393e', rotor: 'rgba(40,50,60,0.5)',
      smoke: [92, 92, 96], steam: [235, 238, 240], signalOff: '#5c6670', signalBox: '#1c2228', officerShirt: '#ffffff', officerCap: '#1d3a6b', umbrella: ['#e0393e', '#ffffff'],
    },
  };
  const SKIN = ['#f1c9a5', '#d9a47c', '#b47b55', '#8a5a3c'];
  const HAIR = ['#2b1d14', '#3d2b1f', '#141414', '#5a3b24', '#6b6b6b'];

  /* =================== Decor: everything around the agents =================== */
  class Decor {
    constructor(world) {
      const rng = new Random((((world.params.seed + 101) * 7919) >>> 0) || 7);
      this.rng = rng;
      this.trees = []; this.lamps = []; this.drive = new Map(); this.homeSpot = new Map(); this.slots = new Map();
      this.stalls = []; this.bulbs = []; this.tents = []; this.parks = new Map(); this.flatSlot = new Map();
      const tree = (x, y, r) => this.trees.push({ x, y, r, tone: rng.int(0, 2) });
      const strip = (x0, y0, x1, y1, horiz) => {
        const out = [];
        if (horiz) { for (let x = x0 + 3; x + 3 <= x1; x += 5.2) out.push({ x: x + 2.6, y: (y0 + y1) / 2, ang: Math.PI / 2 }); }
        else { for (let y = y0 + 3; y + 3 <= y1; y += 5.2) out.push({ x: (x0 + x1) / 2, y: y + 2.6, ang: 0 }); }
        return out;
      };
      this.parkingRects = [];
      const parking = (place, rect, horiz) => {
        this.parkingRects.push({ rect, horiz, b: place.block });
        const s = strip(rect.x0, rect.y0, rect.x1, rect.y1, horiz);
        this.slots.set(place.id, (this.slots.get(place.id) || []).concat(s));
        return s;
      };
      for (const b of world.blocks) {
        const R = b.rect, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2, w = R.x1 - R.x0, h = R.y1 - R.y0;
        const pl0 = b.places[0];
        if (b.type === 'house') {
          for (const pl of b.places) {
            const H = pl.house, L = pl.lot, side = pl.access.side;
            let dr;
            if (side === 'N') dr = { x0: H.x1 + 1.5, x1: H.x1 + 6.5, y0: L.y0, y1: H.y1 - 2 };
            else if (side === 'S') dr = { x0: H.x1 + 1.5, x1: H.x1 + 6.5, y0: H.y0 + 2, y1: L.y1 };
            else if (side === 'W') dr = { x0: L.x0, x1: H.x1 - 2, y0: H.y1 + 1.5, y1: H.y1 + 6.5 };
            else dr = { x0: H.x0 + 2, x1: L.x1, y0: H.y1 + 1.5, y1: H.y1 + 6.5 };
            dr.x1 = Math.min(dr.x1, L.x1 - 0.8); dr.y1 = Math.min(dr.y1, L.y1 - 0.8);
            this.drive.set(pl.id, dr);
            const vert = side === 'N' || side === 'S';
            this.homeSpot.set(pl.id, vert
              ? { x: (dr.x0 + dr.x1) / 2, y: side === 'N' ? dr.y0 + 6 : dr.y1 - 6, ang: Math.PI / 2 }
              : { x: side === 'W' ? dr.x0 + 6 : dr.x1 - 6, y: (dr.y0 + dr.y1) / 2, ang: 0 });
            if (H.garden) {
              const n = rng.int(1, 2);
              for (let k = 0; k < n; k++) {
                let x, y;
                if (side === 'N') { x = rng.range(L.x0 + 5, L.x1 - 5); y = rng.range(H.y1 + 6, L.y1 - 4); }
                else if (side === 'S') { x = rng.range(L.x0 + 5, L.x1 - 5); y = rng.range(L.y0 + 4, H.y0 - 6); }
                else if (side === 'W') { x = rng.range(H.x1 + 6, L.x1 - 4); y = rng.range(L.y0 + 5, L.y1 - 5); }
                else { x = rng.range(L.x0 + 4, H.x0 - 6); y = rng.range(L.y0 + 5, L.y1 - 5); }
                if (isFinite(x) && isFinite(y)) tree(x, y, rng.range(2.6, 4.2));
              }
            }
          }
        } else if (b.type === 'apart') {
          const B = b.building, side = pl0.access.side;
          let pr, horiz;
          if (side === 'N') { pr = { x0: R.x0 + 4, x1: R.x1 - 4, y0: R.y1 - 16, y1: R.y1 - 4 }; horiz = true; }
          else if (side === 'S') { pr = { x0: R.x0 + 4, x1: R.x1 - 4, y0: R.y0 + 4, y1: R.y0 + 16 }; horiz = true; }
          else if (side === 'W') { pr = { x0: R.x1 - 16, x1: R.x1 - 4, y0: R.y0 + 4, y1: R.y1 - 4 }; horiz = false; }
          else { pr = { x0: R.x0 + 4, x1: R.x0 + 16, y0: R.y0 + 4, y1: R.y1 - 4 }; horiz = false; }
          const s = parking(pl0, pr, horiz);
          let k = 0;
          for (const pl of b.places) for (const hh of pl.households) if (hh.car) this.flatSlot.set(hh.id, s[k++ % s.length]);
          for (const [x, y] of [[R.x0 + 5, R.y0 + 5], [R.x1 - 5, R.y0 + 5], [R.x0 + 5, R.y1 - 5], [R.x1 - 5, R.y1 - 5]]) {
            if (x > pr.x0 - 3 && x < pr.x1 + 3 && y > pr.y0 - 3 && y < pr.y1 + 3) continue;
            if (x > B.x0 - 4 && x < B.x1 + 4 && y > B.y0 - 4 && y < B.y1 + 4) continue;
            tree(x, y, rng.range(3, 4.5));
          }
        } else if (b.type === 'park') {
          const pond = { x: cx + rng.range(-12, 12), y: cy + rng.range(-10, 10), rx: rng.range(13, 18), ry: rng.range(8, 11) };
          const play = { x0: R.x0 + 10, y0: R.y1 - 24, x1: R.x0 + 30, y1: R.y1 - 10 };
          this.parks.set(b, { pond, play });
          for (let k = 0; k < 26; k++) {
            const x = rng.range(R.x0 + 4, R.x1 - 4), y = rng.range(R.y0 + 4, R.y1 - 4);
            if (Math.hypot((x - pond.x) / (pond.rx + 5), (y - pond.y) / (pond.ry + 5)) < 1) continue;
            if (x > play.x0 - 3 && x < play.x1 + 3 && y > play.y0 - 3 && y < play.y1 + 3) continue;
            const ring = Math.min(Math.abs(x - (R.x0 + 11)), Math.abs(x - (R.x1 - 11)), Math.abs(y - (R.y0 + 11)), Math.abs(y - (R.y1 - 11)));
            if (ring < 3.5) continue;
            tree(x, y, rng.range(3, 5.5));
          }
        } else if (b.type === 'university') {
          for (let k = 0; k < 8; k++) tree(rng.range(R.x0 + 8, R.x1 - 8), rng.range(cy - 10, cy + 6), rng.range(2.8, 4.2));
          parking(pl0, { x0: R.x0 + 4, x1: R.x0 + 34, y0: R.y1 - 14, y1: R.y1 - 3 }, true);
        } else if (b.type === 'office') {
          const side = pl0.access.side;
          if (side === 'W' || side === 'E') parking(pl0, side === 'W' ? { x0: R.x1 - 14, x1: R.x1 - 3, y0: R.y0 + 4, y1: R.y1 - 4 } : { x0: R.x0 + 3, x1: R.x0 + 14, y0: R.y0 + 4, y1: R.y1 - 4 }, false);
          else parking(pl0, side === 'N' ? { x0: R.x0 + 4, x1: R.x1 - 4, y0: R.y1 - 14, y1: R.y1 - 3 } : { x0: R.x0 + 4, x1: R.x1 - 4, y0: R.y0 + 3, y1: R.y0 + 14 }, true);
        } else if (b.type === 'factory') {
          parking(pl0, { x0: R.x0 + 6, x1: R.x1 - 6, y0: R.y1 - 16, y1: R.y1 - 5 }, true);
        } else if (b.type === 'hospital') {
          parking(pl0, { x0: R.x0 + 4, x1: R.x0 + 46, y0: R.y1 - 15, y1: R.y1 - 4 }, true);
          tree(R.x0 + 52, R.y1 - 9, 3.5);
        } else if (b.type === 'school') {
          parking(pl0, pl0.access.side === 'S' ? { x0: R.x1 - 30, x1: R.x1 - 4, y0: R.y0 + 3, y1: R.y0 + 13 } : { x0: R.x1 - 30, x1: R.x1 - 4, y0: R.y1 - 13, y1: R.y1 - 3 }, true);
        } else if (b.type === 'market') {
          for (let gy = R.y0 + 6; gy + 6 <= R.y1 - 5; gy += 11) for (let gx = R.x0 + 6; gx + 8 <= R.x1 - 5; gx += 12) {
            if (Math.hypot(gx + 4 - cx, gy + 3 - cy) < 14) continue;
            this.stalls.push({ x: gx, y: gy, w: 8, h: 5.5, c: rng.int(0, 4) });
          }
          for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU; this.bulbs.push({ x: cx + Math.cos(a) * 13, y: cy + Math.sin(a) * 13 }); }
          for (let x = R.x0 + 3; x <= R.x1 - 3; x += 5) { this.bulbs.push({ x, y: R.y0 + 2.5 }); this.bulbs.push({ x, y: R.y1 - 2.5 }); }
        } else if (b.type === 'isolation') {
          for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 4; gx++) this.tents.push({ x: R.x0 + 12 + gx * 17.5, y: R.y0 + 12 + gy * 22, w: 13, h: 9 });
        } else if (b.type === 'wedding') {
          parking(pl0, { x0: R.x0 + 4, x1: R.x1 - 4, y0: R.y1 - 19, y1: R.y1 - 4 }, true);
          const m = pl0.area;
          for (let x = m.x0 + 2; x <= m.x1 - 2; x += 3.2) { this.bulbs.push({ x, y: m.y0 + 0.6 }); this.bulbs.push({ x, y: m.y1 - 0.6 }); }
          for (let y = m.y0 + 3; y <= m.y1 - 3; y += 3.2) { this.bulbs.push({ x: m.x0 + 0.6, y }); this.bulbs.push({ x: m.x1 - 0.6, y }); }
        } else if (b.type === 'mosque') {
          for (const [mx, my] of [[R.x1 - 8, R.y0 + 8], [R.x1 - 8, R.y1 - 8], [R.x0 + 8, R.y0 + 5], [R.x0 + 8, R.y1 - 5]]) this.bulbs.push({ x: mx, y: my });
        } else if (b.type === 'police') {
          this.police = [{ x: R.x1 - 20, y: R.y0 + 20, ang: Math.PI / 2 }, { x: R.x1 - 12, y: R.y0 + 20, ang: Math.PI / 2 }];
          parking(pl0, { x0: R.x0 + 6, x1: R.x1 - 26, y0: R.y1 - 15, y1: R.y1 - 4 }, true);
        }
      }
      // street lamps along every road, both sides, every 50 m
      for (const X of ROAD_X) {
        const off = roadHalf(X === MAIN_X) + 2.3;
        for (let y = 25; y < CITY_H; y += 50) for (const s of [-1, 1]) this.lamps.push({ x: X + s * off, y });
      }
      for (const Y of ROAD_Y) {
        const off = roadHalf(Y === MAIN_Y) + 2.3;
        for (let x = 50; x < CITY_W; x += 50) { if (x % 100 === 0) continue; for (const s of [-1, 1]) this.lamps.push({ x, y: Y + s * off }); }
      }
      // ---- outskirts: fields, kiln yards, trees along the motorway and the canal, more lamps
      this.fields = []; this.stacks = []; this.huts = []; this.puddles = []; this.gantries = [300, 1080];
      const blocked = (x0, y0, x1, y1) => {
        for (const k of KILN_SITES) if (x1 > k.x - 50 && x0 < k.x + 50 && y1 > k.y - 28 && y0 < k.y + 28) return true;
        if (x1 > 1252 && x0 < 1272 && y0 < MW_Y) return true;
        if (x1 > 490 && x0 < 512 && y0 < MW_Y && y1 > CITY_H) return true;
        if (y0 < 346 && x1 > 1132 && x0 < 1394 && y1 > 306) return true;
        return false;
      };
      const fieldZone = (X0, Y0, X1, Y1, cw, ch) => {
        for (let y = Y0; y + ch * 0.6 < Y1; y += ch) for (let x = X0; x + cw * 0.6 < X1; x += cw) {
          const x1 = Math.min(X1, x + cw - 2), y1 = Math.min(Y1, y + ch - 2);
          if (blocked(x, y, x1, y1)) continue;
          this.fields.push({ x0: x, y0: y, x1, y1, tone: rng.int(0, 4), dir: rng.chance(0.5) ? 0 : 1 });
        }
      };
      fieldZone(4, MW_Y + MW_HALF + 8, WORLD_W - 4, 742, 46, 25);
      fieldZone(1006, 350, WORLD_W - 4, MW_Y - MW_HALF - 8, 44, 34);
      fieldZone(4, CITY_H + 7, 488, MW_Y - MW_HALF - 7, 44, 22);
      fieldZone(514, CITY_H + 7, 1000, MW_Y - MW_HALF - 7, 44, 22);
      for (const k of KILN_SITES) {
        for (let i = 0; i < 9; i++) for (const dy of [-19, 18]) this.stacks.push({ x: k.x - 42 + i * 9.6, y: k.y + dy, c: rng.int(0, 2), h: rng.range(3, 4.5) });
        this.huts.push({ x: k.x + 31, y: k.y - 7, w: 9, h: 7 }, { x: k.x - 46, y: k.y - 6, w: 7, h: 6 });
      }
      for (let x = 8; x < WORLD_W; x += rng.range(14, 26)) { tree(x, 742 + rng.range(-1.5, 1.5), rng.range(2.6, 4.2)); tree(x + 7, 758 + rng.range(-1, 1), rng.range(2.4, 3.8)); }
      for (let x = 12; x < WORLD_W; x += rng.range(22, 34)) {
        if (Math.abs(x - 500) < 14 || Math.abs(x - 1262) < 14) continue;
        tree(x, MW_Y - MW_HALF - 6 + rng.range(-1, 1), rng.range(2.4, 3.6)); tree(x + 11, MW_Y + MW_HALF + 6 + rng.range(-1, 1), rng.range(2.4, 3.6));
      }
      for (let k = 0; k < 30; k++) { const f = this.fields[rng.int(0, this.fields.length - 1)]; if (f) tree(f.x0 + rng.range(1, 3), f.y0 + rng.range(1, f.y1 - f.y0 - 1), rng.range(2.6, 4.5)); }
      for (let x = 1030; x <= 1390; x += 50) for (const s of [-1, 1]) this.lamps.push({ x, y: MAIN_Y + s * 10.3 });
      for (let x = 30; x < WORLD_W; x += 60) this.lamps.push({ x, y: MW_Y });
      for (const L of LINKS) for (let y = L.y0 + 15; y < L.y1 - 5; y += 40) for (const s of [-1, 1]) this.lamps.push({ x: L.x + s * 8, y });
      for (let k = 0; k < 46; k++) {
        if (rng.chance(0.5)) { const X = rng.pick(ROAD_X); this.puddles.push({ x: X + rng.range(-3.5, 3.5), y: rng.range(20, CITY_H - 20), r: rng.range(1.6, 3.4) }); }
        else { const Y = rng.pick(ROAD_Y); this.puddles.push({ x: rng.range(20, CITY_W - 20), y: Y + rng.range(-3.5, 3.5), r: rng.range(1.6, 3.4) }); }
      }
      this.airPark = { x0: 1142, y0: 313, x1: 1388, y1: 338 };
      this.slots.set(world.airport.id, strip(this.airPark.x0, this.airPark.y0, this.airPark.x1, this.airPark.y1, true));
    }
  }

  /* =================== paintCity =================== */
  function paintCity(ctx, W, D, P, view) {
    const vis = view ? (x, y, r) => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1 : () => true;
    ctx.fillStyle = P.farm;
    ctx.fillRect(-2, -2, WORLD_W + 4, WORLD_H + 4);
    paintOutskirts(ctx, W, D, P, vis);
    ctx.fillStyle = P.sidewalk;
    ctx.fillRect(-2, -2, CITY_W + 2, CITY_H + 2);
    // roads
    ctx.fillStyle = P.road;
    for (const X of ROAD_X) { const h = roadHalf(X === MAIN_X); ctx.fillRect(X - h, -2, h * 2, CITY_H + 2); }
    for (const Y of ROAD_Y) { const h = roadHalf(Y === MAIN_Y); ctx.fillRect(-2, Y - h, CITY_W + 2, h * 2); }
    // the highway continues east as the Airport Road
    ctx.fillStyle = P.sidewalk; ctx.fillRect(CITY_W - 1, MAIN_Y - 11, AIRPORT_ROAD_END - CITY_W + 1, 22);
    ctx.fillStyle = P.road; ctx.fillRect(CITY_W - 2, MAIN_Y - 8, AIRPORT_ROAD_END - CITY_W + 2, 16);
    // markings
    ctx.lineWidth = 0.45; ctx.strokeStyle = P.laneDash; ctx.setLineDash([4, 5]);
    ctx.beginPath();
    for (const X of ROAD_X) if (X !== MAIN_X) { ctx.moveTo(X, 0); ctx.lineTo(X, CITY_H); }
    for (const Y of ROAD_Y) if (Y !== MAIN_Y) { ctx.moveTo(0, Y); ctx.lineTo(CITY_W, Y); }
    ctx.stroke();
    ctx.beginPath();
    for (const d of [-4, 4]) { ctx.moveTo(MAIN_X + d, 0); ctx.lineTo(MAIN_X + d, CITY_H); ctx.moveTo(0, MAIN_Y + d); ctx.lineTo(AIRPORT_ROAD_END, MAIN_Y + d); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.median;
    ctx.fillRect(MAIN_X - 0.9, 0, 1.8, CITY_H); ctx.fillRect(0, MAIN_Y - 0.9, AIRPORT_ROAD_END, 1.8);
    ctx.strokeStyle = P.laneMain; ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (const d of [-1.1, 1.1]) { ctx.moveTo(MAIN_X + d, 0); ctx.lineTo(MAIN_X + d, CITY_H); ctx.moveTo(0, MAIN_Y + d); ctx.lineTo(AIRPORT_ROAD_END, MAIN_Y + d); }
    ctx.stroke();
    // intersections and zebra crossings
    for (const X of ROAD_X) for (const Y of ROAD_Y) {
      if (!vis(X, Y, 24)) continue;
      const hx = roadHalf(X === MAIN_X), hy = roadHalf(Y === MAIN_Y);
      ctx.fillStyle = P.road; ctx.fillRect(X - hx, Y - hy, hx * 2, hy * 2);
      ctx.fillStyle = P.zebra;
      for (let k = -hx + 0.7; k < hx - 0.4; k += 1.5) { ctx.fillRect(X + k, Y - hy - 3.6, 0.75, 3); ctx.fillRect(X + k, Y + hy + 0.6, 0.75, 3); }
      for (let k = -hy + 0.7; k < hy - 0.4; k += 1.5) { ctx.fillRect(X - hx - 3.6, Y + k, 3, 0.75); ctx.fillRect(X + hx + 0.6, Y + k, 3, 0.75); }
    }
    // blocks
    for (const b of W.blocks) {
      const R = b.rect;
      if (!vis((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, 60)) continue;
      if (['gym','govt','mosque','wedding','mart','mandi','fire','graveyard'].includes(b.type)) paintNewBlock(ctx, b, W, D, P);
      else paintBlock(ctx, b, W, D, P);
    }
    // trees
    if (P.shadow) {
      ctx.fillStyle = P.shadow; ctx.beginPath();
      for (const t of D.trees) { if (!vis(t.x, t.y, t.r + 3)) continue; ctx.moveTo(t.x + 1.5 + t.r, t.y + 1.7); ctx.arc(t.x + 1.5, t.y + 1.7, t.r, 0, TAU); }
      ctx.fill();
    }
    for (let tone = 0; tone < 3; tone++) {
      ctx.fillStyle = P.tree[tone]; ctx.beginPath();
      for (const t of D.trees) { if (t.tone !== tone || !vis(t.x, t.y, t.r)) continue; ctx.moveTo(t.x + t.r, t.y); ctx.arc(t.x, t.y, t.r, 0, TAU); }
      ctx.fill();
    }
    ctx.fillStyle = P.treeHi; ctx.beginPath();
    for (const t of D.trees) { if (!vis(t.x, t.y, t.r)) continue; const hx = t.x - t.r * 0.3, hy = t.y - t.r * 0.3; ctx.moveTo(hx + t.r * 0.5, hy); ctx.arc(hx, hy, t.r * 0.5, 0, TAU); }
    ctx.fill();
    // lamps
    if (P.night) {
      ctx.globalCompositeOperation = 'lighter';
      for (const l of D.lamps) {
        if (!vis(l.x, l.y, 18)) continue;
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 18);
        g.addColorStop(0, 'rgba(255,190,110,0.2)'); g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, 18, 0, TAU); ctx.fill();
      }
      for (const b of D.bulbs) {
        if (!vis(b.x, b.y, 4)) continue;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 4);
        g.addColorStop(0, 'rgba(255,215,140,0.4)'); g.addColorStop(1, 'rgba(255,215,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffd98a'; ctx.beginPath();
      for (const b of D.bulbs) { if (!vis(b.x, b.y, 1)) continue; ctx.moveTo(b.x + 0.5, b.y); ctx.arc(b.x, b.y, 0.5, 0, TAU); }
      ctx.fill();
    }
    ctx.fillStyle = P.night ? P.lampHead : 'rgba(60,70,80,0.7)'; ctx.beginPath();
    for (const l of D.lamps) { if (!vis(l.x, l.y, 1)) continue; ctx.moveTo(l.x + 0.7, l.y); ctx.arc(l.x, l.y, 0.7, 0, TAU); }
    ctx.fill();
  }

  function fillR(ctx, r, color) { ctx.fillStyle = color; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }
  function shadowRect(ctx, P, x, y, w, h, d) { if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(x + d, y + d * 1.1, w, h); } }
  function parkingLot(ctx, P, pr) {
    const r = pr.rect;
    ctx.fillStyle = P.parking; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.strokeStyle = P.parkLine; ctx.lineWidth = 0.35; ctx.beginPath();
    if (pr.horiz) for (let x = r.x0 + 3; x <= r.x1 - 2.5; x += 5.2) { ctx.moveTo(x, r.y0 + 1); ctx.lineTo(x, r.y1 - 1); }
    else for (let y = r.y0 + 3; y <= r.y1 - 2.5; y += 5.2) { ctx.moveTo(r.x0 + 1, y); ctx.lineTo(r.x1 - 1, y); }
    ctx.stroke();
  }
  function door(ctx, P, pl, depth) {
    const a = pl.access, d = a.door, w = 2.2;
    ctx.fillStyle = P.walkway;
    if (a.side === 'N') ctx.fillRect(d.x - w / 2, d.y, w, depth);
    else if (a.side === 'S') ctx.fillRect(d.x - w / 2, d.y - depth, w, depth);
    else if (a.side === 'W') ctx.fillRect(d.x, d.y - w / 2, depth, w);
    else ctx.fillRect(d.x - depth, d.y - w / 2, depth, w);
  }
  function paintBlock(ctx, b, W, D, P) {
    const R = b.rect, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2, w = R.x1 - R.x0, h = R.y1 - R.y0, pl0 = b.places[0];
    const lots = () => { for (const pr of D.parkingRects) if (pr.b === b) parkingLot(ctx, P, pr); };
    switch (b.type) {
      case 'house': {
        fillR(ctx, R, P.lot);
        for (const pl of b.places) {
          const L = pl.lot, H = pl.house;
          ctx.strokeStyle = P.hedge; ctx.lineWidth = 0.9;
          ctx.strokeRect(L.x0 + 0.6, L.y0 + 0.6, L.x1 - L.x0 - 1.2, L.y1 - L.y0 - 1.2);
          fillR(ctx, D.drive.get(pl.id), P.drive);
          const a = pl.access;
          const depth = a.side === 'N' ? H.y0 - a.door.y : a.side === 'S' ? a.door.y - H.y1 : a.side === 'W' ? H.x0 - a.door.x : a.door.x - H.x1;
          door(ctx, P, pl, Math.max(0, depth));
          drawHouse(ctx, H, P);
        }
        break;
      }
      case 'apart': {
        fillR(ctx, R, P.lot);
        lots();
        const B = b.building, bw = B.x1 - B.x0, bh = B.y1 - B.y0;
        door(ctx, P, pl0, 8);
        shadowRect(ctx, P, B.x0, B.y0, bw, bh, 3);
        ctx.fillStyle = P.roofApt; ctx.fillRect(B.x0, B.y0, bw, bh);
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.8; ctx.strokeRect(B.x0 + 0.8, B.y0 + 0.8, bw - 1.6, bh - 1.6);
        ctx.lineWidth = 0.3; ctx.strokeStyle = P.roofEdge; ctx.beginPath();
        for (const pl of b.places) { const f = pl.flat; ctx.rect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0); }
        ctx.stroke();
        ctx.fillStyle = P.ac;
        for (const pl of b.places) { const f = pl.flat; ctx.fillRect(f.x0 + 2, f.y0 + 2, 2.2, 1.8); }
        ctx.fillStyle = P.tank;
        for (const [fx, fy] of [[0.3, 0.5], [0.7, 0.5]]) { ctx.beginPath(); ctx.arc(B.x0 + bw * fx, B.y0 + bh * fy, 2, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = P.tankHi; ctx.lineWidth = 0.4;
        for (const [fx, fy] of [[0.3, 0.5], [0.7, 0.5]]) { ctx.beginPath(); ctx.arc(B.x0 + bw * fx, B.y0 + bh * fy, 1.2, 0, TAU); ctx.stroke(); }
        break;
      }
      case 'school': {
        fillR(ctx, R, P.concrete);
        lots();
        const side = pl0.access.side;
        const bd = 24;
        const bld = side === 'N' ? { x0: R.x0 + 4, y0: R.y0 + 4, x1: R.x1 - 34, y1: R.y0 + 4 + bd } : { x0: R.x0 + 4, y0: R.y1 - 4 - bd, x1: R.x1 - 34, y1: R.y1 - 4 };
        const wing = side === 'N' ? { x0: R.x0 + 4, y0: bld.y1, x1: R.x0 + 22, y1: R.y1 - 30 } : { x0: R.x0 + 4, y0: R.y0 + 30, x1: R.x0 + 22, y1: bld.y0 };
        const field = side === 'N' ? { x0: R.x0 + 28, y0: bld.y1 + 6, x1: R.x1 - 5, y1: R.y1 - 5 } : { x0: R.x0 + 28, y0: R.y0 + 18, x1: R.x1 - 5, y1: bld.y0 - 6 };
        ctx.fillStyle = P.track; ctx.beginPath(); rrect(ctx, field.x0, field.y0, field.x1 - field.x0, field.y1 - field.y0, 12); ctx.fill();
        ctx.fillStyle = P.field; ctx.beginPath(); rrect(ctx, field.x0 + 4, field.y0 + 4, field.x1 - field.x0 - 8, field.y1 - field.y0 - 8, 8); ctx.fill();
        ctx.strokeStyle = P.fieldLine; ctx.lineWidth = 0.4; ctx.beginPath();
        const fx = (field.x0 + field.x1) / 2, fy = (field.y0 + field.y1) / 2;
        ctx.moveTo(fx, field.y0 + 4); ctx.lineTo(fx, field.y1 - 4); ctx.moveTo(fx + 5, fy); ctx.arc(fx, fy, 5, 0, TAU);
        ctx.stroke();
        for (const r of [bld, wing]) { shadowRect(ctx, P, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 2.5); }
        for (const r of [bld, wing]) { ctx.fillStyle = P.roofSchool; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.5;
        for (const r of [bld, wing]) ctx.strokeRect(r.x0 + 0.6, r.y0 + 0.6, r.x1 - r.x0 - 1.2, r.y1 - r.y0 - 1.2);
        ctx.fillStyle = P.roofHi; ctx.fillRect(bld.x0, bld.y0, bld.x1 - bld.x0, (bld.y1 - bld.y0) / 2);
        door(ctx, P, pl0, 4);
        break;
      }
      case 'university': {
        fillR(ctx, R, P.grass);
        lots();
        ctx.strokeStyle = P.path; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(R.x0, cy); ctx.lineTo(R.x1, cy); ctx.moveTo(cx, R.y0); ctx.lineTo(cx, R.y1); ctx.stroke();
        const blds = [{ x0: R.x0 + 5, y0: R.y0 + 5, x1: cx - 6, y1: R.y0 + 30 }, { x0: cx + 6, y0: R.y0 + 5, x1: R.x1 - 5, y1: R.y0 + 30 }, { x0: cx + 6, y0: cy + 8, x1: R.x1 - 5, y1: R.y1 - 5 }];
        for (const r of blds) shadowRect(ctx, P, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 2.5);
        for (const r of blds) {
          ctx.fillStyle = P.roofUni; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
          ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.5; ctx.strokeRect(r.x0 + 0.7, r.y0 + 0.7, r.x1 - r.x0 - 1.4, r.y1 - r.y0 - 1.4);
        }
        const dome = blds[2];
        ctx.fillStyle = P.roofHi; ctx.beginPath(); ctx.arc((dome.x0 + dome.x1) / 2, (dome.y0 + dome.y1) / 2, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.roofLine; ctx.stroke();
        door(ctx, P, pl0, 3);
        break;
      }
      case 'office': {
        fillR(ctx, R, P.concrete2);
        lots();
        const t = { x0: R.x0 + 15, y0: R.y0 + 15, x1: R.x1 - 15, y1: R.y1 - 15 };
        const tw = t.x1 - t.x0, th = t.y1 - t.y0;
        if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(t.x0 + 6, t.y0 + 7, tw, th); }
        const g = ctx.createLinearGradient(t.x0, t.y0, t.x1, t.y1);
        g.addColorStop(0, P.roofOffice[1]); g.addColorStop(1, P.roofOffice[0]);
        ctx.fillStyle = g; ctx.fillRect(t.x0, t.y0, tw, th);
        ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.3; ctx.beginPath();
        for (let x = t.x0 + 6; x < t.x1; x += 6) { ctx.moveTo(x, t.y0); ctx.lineTo(x, t.y1); }
        for (let y = t.y0 + 6; y < t.y1; y += 6) { ctx.moveTo(t.x0, y); ctx.lineTo(t.x1, y); }
        ctx.stroke();
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 1; ctx.strokeRect(t.x0 + 0.5, t.y0 + 0.5, tw - 1, th - 1);
        ctx.fillStyle = P.ac; ctx.fillRect(t.x0 + tw * 0.38, t.y0 + th * 0.38, tw * 0.24, th * 0.24);
        door(ctx, P, pl0, 15);
        break;
      }
      case 'amusement': {
        fillR(ctx, R, P.grass);
        ctx.fillStyle = P.plaza; ctx.beginPath(); rrect(ctx, R.x0 + 8, R.y0 + 8, w - 16, h - 16, 10); ctx.fill();
        ctx.strokeStyle = P.fence; ctx.lineWidth = 1; ctx.beginPath(); rrect(ctx, R.x0 + 6, R.y0 + 6, w - 12, h - 12, 10); ctx.stroke();
        ctx.strokeStyle = P.path; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx, R.y1 - 6); ctx.lineTo(cx, cy + 4); ctx.moveTo(R.x0 + 14, cy + 4); ctx.lineTo(R.x1 - 14, cy + 4); ctx.stroke();
        const tents = [['#c0392b', R.x0 + 14, R.y1 - 22], ['#d4a017', R.x1 - 24, R.y1 - 22], ['#2a7fb8', R.x0 + 14, R.y0 + 14]];
        for (const [c, x, y] of tents) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.lineTo(x + 5, y); ctx.lineTo(x + 10, y + 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 4, y + 2, 2, 7); }
        door(ctx, P, pl0, 12);
        break;
      }
      case 'construction': {
        fillR(ctx, R, '#3a3126');
        ctx.fillStyle = '#4a3f31'; ctx.fillRect(R.x0 + 8, R.y0 + 8, w - 16, h - 16);
        for (let i = 0; i < 40; i++) { ctx.fillStyle = (i % 2) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(R.x0 + 10 + (i * 37) % (w - 24), R.y0 + 10 + (i * 53) % (h - 24), 5 + (i % 4), 2 + (i % 3)); }
        ctx.strokeStyle = '#d9a21b'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.strokeRect(R.x0 + 6, R.y0 + 6, w - 12, h - 12); ctx.setLineDash([]);
        for (const [x, y, c] of [[R.x0 + 14, R.y1 - 20, '#8a6d3b'], [R.x0 + 28, R.y1 - 18, '#6f7a85'], [R.x1 - 26, R.y1 - 20, '#8a6d3b']]) { ctx.fillStyle = c; ctx.fillRect(x, y, 11, 7); }
        ctx.fillStyle = '#c9a227'; ctx.fillRect(R.x0 + 12, R.y0 + 12, 12, 7);
        door(ctx, P, pl0, 12);
        break;
      }
      case 'factory': {
        fillR(ctx, R, P.concrete2);
        lots();
        const s = { x0: R.x0 + 6, y0: R.y0 + 8, x1: R.x1 - 6, y1: R.y0 + 54 };
        shadowRect(ctx, P, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0, 3);
        ctx.fillStyle = P.roofFactory; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        ctx.fillStyle = P.roofDark;
        for (let x = s.x0; x < s.x1 - 2; x += 6) ctx.fillRect(x, s.y0, 3, s.y1 - s.y0);
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.8; ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        for (const [x, y] of [[s.x1 - 8, s.y1 + 6], [s.x1 - 18, s.y1 + 6]]) {
          ctx.fillStyle = P.tank; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
          ctx.strokeStyle = P.tankHi; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.stroke();
        }
        ctx.strokeStyle = P.fence; ctx.lineWidth = 0.6; ctx.setLineDash([1.5, 1]); ctx.strokeRect(R.x0 + 1, R.y0 + 1, w - 2, h - 2); ctx.setLineDash([]);
        door(ctx, P, pl0, 6);
        break;
      }
      case 'market': {
        fillR(ctx, R, P.plaza);
        ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.3; ctx.beginPath();
        for (let x = R.x0 + 6; x < R.x1; x += 6) { ctx.moveTo(x, R.y0); ctx.lineTo(x, R.y1); }
        ctx.stroke();
        for (const s of D.stalls) {
          if (s.x < R.x0 || s.x > R.x1 || s.y < R.y0 || s.y > R.y1) continue;
          if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(s.x + 1, s.y + 1.2, s.w, s.h); }
          ctx.fillStyle = P.awning[s.c]; ctx.fillRect(s.x, s.y, s.w, s.h);
          ctx.fillStyle = P.awningStripe;
          for (let k = 0; k < s.w - 0.5; k += 2) ctx.fillRect(s.x + k, s.y, 1, s.h);
        }
        ctx.fillStyle = P.fountain; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = P.water; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = P.fountainHi; ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, TAU); ctx.fill();
        break;
      }
      case 'park': {
        fillR(ctx, R, P.grass);
        const pk = D.parks.get(b);
        ctx.strokeStyle = P.path; ctx.lineWidth = 2.6;
        ctx.beginPath(); rrect(ctx, R.x0 + 11, R.y0 + 11, w - 22, h - 22, 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R.x0, R.y0); ctx.lineTo(R.x0 + 15, R.y0 + 15); ctx.moveTo(R.x1, R.y1); ctx.lineTo(R.x1 - 15, R.y1 - 15);
        ctx.moveTo(R.x1, R.y0); ctx.lineTo(R.x1 - 15, R.y0 + 15); ctx.moveTo(R.x0, R.y1); ctx.lineTo(R.x0 + 15, R.y1 - 15); ctx.stroke();
        ctx.fillStyle = P.pondEdge; ctx.beginPath(); ctx.ellipse(pk.pond.x, pk.pond.y, pk.pond.rx + 1.5, pk.pond.ry + 1.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = P.pond; ctx.beginPath(); ctx.ellipse(pk.pond.x, pk.pond.y, pk.pond.rx, pk.pond.ry, 0, 0, TAU); ctx.fill();
        const pl = pk.play;
        ctx.fillStyle = P.sand; ctx.beginPath(); rrect(ctx, pl.x0, pl.y0, pl.x1 - pl.x0, pl.y1 - pl.y0, 3); ctx.fill();
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.5; ctx.beginPath();
        ctx.moveTo(pl.x0 + 4, pl.y0 + 4); ctx.lineTo(pl.x0 + 10, pl.y0 + 4); ctx.moveTo(pl.x0 + 14, pl.y0 + 3); ctx.lineTo(pl.x0 + 14, pl.y1 - 3);
        ctx.moveTo(pl.x0 + 6.5, pl.y1 - 4); ctx.arc(pl.x0 + 5, pl.y1 - 4, 1.5, 0, TAU); ctx.stroke();
        break;
      }
      case 'hospital': {
        fillR(ctx, R, P.concrete);
        lots();
        const main = { x0: R.x0 + 4, y0: R.y0 + 6, x1: R.x1 - 4, y1: R.y0 + 48 };
        const ward = pl0.ward;
        shadowRect(ctx, P, main.x0, main.y0, main.x1 - main.x0, main.y1 - main.y0, 3);
        ctx.fillStyle = P.roofHosp; ctx.fillRect(main.x0, main.y0, main.x1 - main.x0, main.y1 - main.y0);
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.7; ctx.strokeRect(main.x0 + 0.5, main.y0 + 0.5, main.x1 - main.x0 - 1, main.y1 - main.y0 - 1);
        ctx.fillStyle = P.wardRoof; ctx.fillRect(ward.x0 - 2, ward.y0 - 2, ward.x1 - ward.x0 + 4, ward.y1 - ward.y0 + 4);
        ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.5; ctx.strokeRect(ward.x0 - 2, ward.y0 - 2, ward.x1 - ward.x0 + 4, ward.y1 - ward.y0 + 4);
        const ccx = main.x0 + 22, ccy = (main.y0 + main.y1) / 2;
        ctx.fillStyle = P.cross; ctx.fillRect(ccx - 12, ccy - 4, 24, 8); ctx.fillRect(ccx - 4, ccy - 12, 8, 24);
        const hx = main.x1 - 18, hy = ccy;
        ctx.fillStyle = P.heli; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.heliMark; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(hx, hy, 10, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.6; ctx.beginPath();
        ctx.moveTo(hx - 3.5, hy - 5); ctx.lineTo(hx - 3.5, hy + 5); ctx.moveTo(hx + 3.5, hy - 5); ctx.lineTo(hx + 3.5, hy + 5); ctx.moveTo(hx - 3.5, hy); ctx.lineTo(hx + 3.5, hy);
        ctx.stroke();
        ctx.strokeStyle = P.parkLine; ctx.lineWidth = 0.5; ctx.beginPath();
        for (const bay of pl0.bays) { ctx.moveTo(bay.x - 4.6, bay.y - 6); ctx.lineTo(bay.x - 4.6, bay.y + 6); }
        ctx.moveTo(pl0.bays[2].x + 4.6, pl0.bays[2].y - 6); ctx.lineTo(pl0.bays[2].x + 4.6, pl0.bays[2].y + 6);
        ctx.stroke();
        door(ctx, P, pl0, 12);
        break;
      }
      case 'isolation': {
        fillR(ctx, R, P.concrete2);
        for (const t of D.tents) {
          if (P.shadow) { ctx.fillStyle = P.shadow; ctx.beginPath(); rrect(ctx, t.x + 1, t.y + 1.2, t.w, t.h, 2.5); ctx.fill(); }
          ctx.fillStyle = P.tent; ctx.beginPath(); rrect(ctx, t.x, t.y, t.w, t.h, 2.5); ctx.fill();
          ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(t.x + t.w / 2, t.y); ctx.lineTo(t.x + t.w / 2, t.y + t.h); ctx.stroke();
          ctx.fillStyle = P.cross; ctx.fillRect(t.x + t.w / 2 - 2, t.y + t.h / 2 - 0.6, 4, 1.2); ctx.fillRect(t.x + t.w / 2 - 0.6, t.y + t.h / 2 - 2, 1.2, 4);
        }
        ctx.strokeStyle = P.fence; ctx.lineWidth = 0.9; ctx.strokeRect(R.x0 + 1, R.y0 + 1, w - 2, h - 2);
        ctx.fillStyle = P.fence;
        for (let x = R.x0 + 1; x <= R.x1; x += 8) { ctx.fillRect(x - 0.6, R.y0 + 0.4, 1.2, 1.2); ctx.fillRect(x - 0.6, R.y1 - 1.6, 1.2, 1.2); }
        door(ctx, P, pl0, 6);
        break;
      }
      case 'police': {
        fillR(ctx, R, P.concrete);
        lots();
        const s = { x0: R.x0 + 8, y0: R.y0 + 8, x1: R.x1 - 28, y1: R.y0 + 47 };
        shadowRect(ctx, P, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0, 2.5);
        ctx.fillStyle = P.roofPolice; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        ctx.fillStyle = P.roofHi; ctx.fillRect(s.x0, s.y0 + (s.y1 - s.y0) / 2 - 2, s.x1 - s.x0, 4);
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.6; ctx.strokeRect(s.x0 + 0.5, s.y0 + 0.5, s.x1 - s.x0 - 1, s.y1 - s.y0 - 1);
        door(ctx, P, pl0, 5);
        break;
      }
      case 'fuel': {
        fillR(ctx, R, P.concrete);
        const c = { x0: R.x0 + 10, y0: R.y0 + 12, x1: R.x1 - 10, y1: R.y0 + 42 };
        shadowRect(ctx, P, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0, 2);
        ctx.fillStyle = P.canopy; ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
        ctx.fillStyle = '#d23b3b'; ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, 2.5); ctx.fillRect(c.x0, c.y1 - 2.5, c.x1 - c.x0, 2.5);
        const sh = { x0: R.x0 + 14, y0: R.y1 - 30, x1: R.x0 + 44, y1: R.y1 - 10 };
        ctx.fillStyle = P.shop; ctx.fillRect(sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0);
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.5; ctx.strokeRect(sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0);
        door(ctx, P, pl0, 6);
        break;
      }
    }
  }
  function drawHouse(ctx, H, P) {
    const x = H.x0, y = H.y0, w = H.x1 - H.x0, h = H.y1 - H.y0;
    if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(x + 1.6, y + 1.8, w, h); }
    ctx.fillStyle = P.roofs[H.roof % P.roofs.length];
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 0.4;
    if (H.ridgeH) {
      ctx.fillStyle = P.roofHi; ctx.fillRect(x, y, w, h / 2);
      ctx.fillStyle = P.roofDark; ctx.fillRect(x, y + h / 2, w, h / 2);
      ctx.strokeStyle = P.roofLine; ctx.beginPath(); ctx.moveTo(x + 1, y + h / 2); ctx.lineTo(x + w - 1, y + h / 2); ctx.stroke();
    } else {
      ctx.fillStyle = P.roofHi; ctx.fillRect(x, y, w / 2, h);
      ctx.fillStyle = P.roofDark; ctx.fillRect(x + w / 2, y, w / 2, h);
      ctx.strokeStyle = P.roofLine; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 1); ctx.lineTo(x + w / 2, y + h - 1); ctx.stroke();
    }
    ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.35; ctx.strokeRect(x, y, w, h);
    if (H.solar) {
      const sx = x + w * 0.12, sy = y + h * 0.58, sw = w * 0.34, sh = h * 0.28;
      ctx.fillStyle = P.solar; ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = P.solarLine; ctx.lineWidth = 0.25; ctx.beginPath();
      for (let k = 1; k < 4; k++) { ctx.moveTo(sx + (sw * k) / 4, sy); ctx.lineTo(sx + (sw * k) / 4, sy + sh); }
      ctx.moveTo(sx, sy + sh / 2); ctx.lineTo(sx + sw, sy + sh / 2); ctx.stroke();
    }
    if (H.tank) {
      const tx = x + w * 0.8, ty = y + h * 0.26;
      ctx.fillStyle = P.tank; ctx.beginPath(); ctx.arc(tx, ty, 1.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.tankHi; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(tx, ty, 0.9, 0, TAU); ctx.stroke();
    }
  }
  function drawCar(ctx, x, y, ang, body, P, night, opts) {
    const len = opts && opts.len || 8.5, wid = opts && opts.wid || 4.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (night && opts && opts.moving) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(len / 2, 0, len / 2 + 18, 0);
      g.addColorStop(0, `rgba(255,240,200,${0.3 * (opts.light || 1)})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(len / 2, -wid * 0.35); ctx.lineTo(len / 2 + 18, -wid * 1.3); ctx.lineTo(len / 2 + 18, wid * 1.3); ctx.lineTo(len / 2, wid * 0.35); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(-len / 2 + 0.8, -wid / 2 + 1, len, wid); }
    ctx.fillStyle = body;
    ctx.beginPath(); rrect(ctx, -len / 2, -wid / 2, len, wid, 1.2); ctx.fill();
    ctx.fillStyle = P.carGlass;
    ctx.fillRect(len / 2 - 3.4, -wid / 2 + 0.6, 1.7, wid - 1.2);
    ctx.fillRect(-len / 2 + 1.1, -wid / 2 + 0.7, 1.2, wid - 1.4);
    if (opts && opts.kind === 'amb') {
      ctx.fillStyle = '#e3262b'; ctx.fillRect(-1.6, -0.45, 3.2, 0.9); ctx.fillRect(-0.45, -1.6, 0.9, 3.2);
      if (opts.siren) {
        const on = Math.floor(opts.now / 200) % 2 === 0;
        ctx.fillStyle = on ? '#ff3b3b' : '#3b8bff'; ctx.fillRect(1.5, -wid / 2 + 0.4, 1, wid - 0.8);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(2, 0, 0, 2, 0, 12);
        g.addColorStop(0, on ? 'rgba(255,60,60,0.5)' : 'rgba(60,140,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(2, 0, 12, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (opts && opts.kind === 'police') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-1.2, -wid / 2, 2.4, wid);
      if (opts.siren) { const on = Math.floor(opts.now / 260) % 2 === 0; ctx.fillStyle = on ? '#3b8bff' : '#ff3b3b'; ctx.fillRect(0.2, -wid / 2 + 0.4, 0.8, wid - 0.8); }
    } else if (opts && opts.dot) {
      if (opts.taxi) { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-0.2, -1.6, 1.4, 3.2); }
      ctx.fillStyle = opts.dot; ctx.beginPath(); ctx.arc(-1.6, 0, 1.15, 0, TAU); ctx.fill();
    }
    if (opts && opts.brake) { ctx.fillStyle = '#ff2a2a'; ctx.fillRect(-len / 2 - 0.2, -wid / 2 + 0.3, 0.8, 1); ctx.fillRect(-len / 2 - 0.2, wid / 2 - 1.3, 0.8, 1); }
    if (night && opts && opts.moving) { ctx.fillStyle = '#ff5a4a'; ctx.fillRect(-len / 2, -wid / 2 + 0.3, 0.6, 0.9); ctx.fillRect(-len / 2, wid / 2 - 1.2, 0.6, 0.9); }
    ctx.restore();
  }

  /* =================== paintOutskirts: farmland, canal, brick kilns, airport, motorway =================== */
  function paintOutskirts(ctx, W, D, P, vis) {
    // fields with furrows
    for (const f of D.fields) { if (!vis((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, 40)) continue; ctx.fillStyle = P.fields[f.tone]; ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0); }
    ctx.strokeStyle = P.furrow; ctx.lineWidth = 0.45; ctx.beginPath();
    for (const f of D.fields) {
      if (!vis((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, 40)) continue;
      if (f.dir) for (let x = f.x0 + 2; x < f.x1 - 0.5; x += 2.6) { ctx.moveTo(x, f.y0 + 1); ctx.lineTo(x, f.y1 - 1); }
      else for (let y = f.y0 + 2; y < f.y1 - 0.5; y += 2.6) { ctx.moveTo(f.x0 + 1, y); ctx.lineTo(f.x1 - 1, y); }
    }
    ctx.stroke();
    // canal
    if (vis(WORLD_W / 2, 750, WORLD_W)) { ctx.fillStyle = P.canalEdge; ctx.fillRect(-2, 745.5, WORLD_W + 4, 9); ctx.fillStyle = P.canal; ctx.fillRect(-2, 747, WORLD_W + 4, 6); }
    for (const k of KILN_SITES) if (vis(k.x, k.y, 60)) paintKiln(ctx, k, D, P);
    paintAirport(ctx, W, D, P, vis);
    // link roads down to the motorway
    for (const L of LINKS) {
      if (!vis(L.x, (L.y0 + L.y1) / 2, 220)) continue;
      ctx.fillStyle = P.sidewalk; ctx.fillRect(L.x - 8.5, L.y0, 17, L.y1 - L.y0);
      ctx.fillStyle = P.road; ctx.fillRect(L.x - 6, L.y0 - 1, 12, L.y1 - L.y0 + 3);
      ctx.strokeStyle = P.road; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath();
      for (const s of [-1, 1]) { ctx.moveTo(L.x, L.y1 - 22); ctx.quadraticCurveTo(L.x + s * 2, L.y1 - 3, L.x + s * 34, L.y1 + 3); }
      ctx.stroke(); ctx.lineCap = 'butt';
      ctx.strokeStyle = P.laneMain; ctx.lineWidth = 0.35; ctx.beginPath();
      for (const d of [-0.6, 0.6]) { ctx.moveTo(L.x + d, L.y0); ctx.lineTo(L.x + d, L.y1 - 6); }
      ctx.stroke();
    }
    // toll plaza on the city link road
    if (vis(500, 626, 40)) {
      const ty = 624;
      if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(487, ty - 3, 28, 9); }
      ctx.fillStyle = P.canopy; ctx.fillRect(485, ty - 5, 30, 9);
      ctx.fillStyle = '#2f8f6a'; ctx.fillRect(485, ty - 5, 30, 1.6);
      ctx.fillStyle = P.shop;
      for (const bx of [487.5, 499, 510.5]) ctx.fillRect(bx - 1.2, ty - 2.5, 2.4, 4.5);
      ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.3; ctx.strokeRect(485, ty - 5, 30, 9);
    }
    paintUtilities(ctx, P, vis);
    if (vis(WORLD_W / 2, MW_Y, WORLD_W)) paintMotorway(ctx, D, P, vis);
  }

  function paintUtilities(ctx, P, vis) {
    const Y = WASTE_YARD, Wp = WATER_PLANT, S = SUBSTATION, F = SOLAR_FARM;
    if (vis((Y.x0 + Y.x1) / 2, (Y.y0 + Y.y1) / 2, 120)) {
      ctx.fillStyle = '#6d6a5c'; ctx.fillRect(Y.x0, Y.y0, Y.x1 - Y.x0, Y.y1 - Y.y0);
      ctx.fillStyle = '#4e4a3d'; ctx.beginPath(); ctx.ellipse(Y.x1 - 40, Y.y0 + 18, 34, 12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a8470'; ctx.beginPath(); ctx.ellipse(Y.x1 - 42, Y.y0 + 15, 20, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e6f4a'; for (let i = 0; i < 6; i++) ctx.fillRect(Y.x0 + 6 + i * 6, Y.y0 + 5, 5, 4);
      ctx.fillStyle = '#c8c8c8'; ctx.fillRect(Y.x0 + 4, Y.y1 - 18, 100, 14); ctx.strokeStyle = '#999'; ctx.lineWidth = 0.4; ctx.strokeRect(Y.x0 + 4, Y.y1 - 18, 100, 14);
      ctx.strokeStyle = P.fence; ctx.lineWidth = 0.6; ctx.setLineDash([2, 1.5]); ctx.strokeRect(Y.x0, Y.y0, Y.x1 - Y.x0, Y.y1 - Y.y0); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.font = `700 5px ${DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('WASTE DEPOT', Y.x0 + 34, Y.y0 + 30);
    }
    if (vis((Wp.x0 + Wp.x1) / 2, (Wp.y0 + Wp.y1) / 2, 120)) {
      ctx.fillStyle = '#8c98a4'; ctx.fillRect(Wp.x0, Wp.y0, Wp.x1 - Wp.x0, Wp.y1 - Wp.y0);
      ctx.fillStyle = '#3f8fc4'; ctx.fillRect(Wp.x0 + 6, Wp.y0 + 6, 70, 32);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(Wp.x0 + 6, Wp.y0 + 6, 70, 4);
      for (const k of [0, 1, 2]) { const cx = Wp.x0 + 100 + k * 18, cy = Wp.y0 + 22; ctx.fillStyle = '#d9dee3'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6b7885'; ctx.lineWidth = 0.6; ctx.stroke(); }
      ctx.fillStyle = '#233'; ctx.font = `700 5px ${DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('WATER WORKS', Wp.x0 + 8, Wp.y0 + 24);
      ctx.strokeStyle = P.fence; ctx.lineWidth = 0.6; ctx.setLineDash([2, 1.5]); ctx.strokeRect(Wp.x0, Wp.y0, Wp.x1 - Wp.x0, Wp.y1 - Wp.y0); ctx.setLineDash([]);
    }
    if (vis((S.x0 + S.x1) / 2, (S.y0 + S.y1) / 2, 120)) {
      ctx.fillStyle = '#7a8087'; ctx.fillRect(S.x0, S.y0, S.x1 - S.x0, S.y1 - S.y0);
      ctx.fillStyle = '#b8bec6'; ctx.fillRect(S.x0 + 4, S.y0 + 4, 20, 14); ctx.fillRect(S.x0 + 30, S.y0 + 4, 20, 14);
      ctx.strokeStyle = '#444'; ctx.lineWidth = 0.7; ctx.beginPath();
      for (let x = S.x0 + 8; x < S.x1 - 4; x += 10) { ctx.moveTo(x, S.y0 + 26); ctx.lineTo(x, S.y1 - 5); ctx.moveTo(x - 3, S.y0 + 30); ctx.lineTo(x + 3, S.y0 + 30); }
      ctx.stroke();
      ctx.fillStyle = '#ffd54a'; ctx.font = `700 5px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GRID', (S.x0 + S.x1) / 2, S.y0 + 11);
      ctx.strokeStyle = P.fence; ctx.lineWidth = 0.6; ctx.setLineDash([2, 1.5]); ctx.strokeRect(S.x0, S.y0, S.x1 - S.x0, S.y1 - S.y0); ctx.setLineDash([]);
    }
    if (vis((F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, 160)) {
      ctx.fillStyle = '#5d7a4a'; ctx.fillRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0);
      for (let y = F.y0 + 4; y < F.y1 - 8; y += 10) for (let x = F.x0 + 4; x < F.x1 - 12; x += 13) {
        ctx.fillStyle = '#1d3f6e'; ctx.fillRect(x, y, 11, 7);
        ctx.strokeStyle = '#5b86bd'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(x + 3.7, y); ctx.lineTo(x + 3.7, y + 7); ctx.moveTo(x + 7.3, y); ctx.lineTo(x + 7.3, y + 7); ctx.moveTo(x, y + 3.5); ctx.lineTo(x + 11, y + 3.5); ctx.stroke();
      }
      ctx.strokeStyle = P.fence; ctx.lineWidth = 0.6; ctx.setLineDash([2, 1.5]); ctx.strokeRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); ctx.setLineDash([]);
    }
  }
  function paintKiln(ctx, k, D, P) {
    ctx.fillStyle = P.dirt; ctx.beginPath(); rrect(ctx, k.x - 50, k.y - 26, 100, 52, 7); ctx.fill();
    for (const s of D.stacks) {
      if (Math.abs(s.x - k.x) > 52 || Math.abs(s.y - k.y) > 28) continue;
      if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(s.x - 3.2, s.y - s.h / 2 + 0.8, 7.2, s.h); }
      ctx.fillStyle = P.bricks[s.c]; ctx.fillRect(s.x - 3.6, s.y - s.h / 2, 7.2, s.h);
    }
    ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.22; ctx.beginPath();
    for (const s of D.stacks) {
      if (Math.abs(s.x - k.x) > 52 || Math.abs(s.y - k.y) > 28) continue;
      for (let x = s.x - 3.6 + 1.2; x < s.x + 3.6; x += 1.2) { ctx.moveTo(x, s.y - s.h / 2); ctx.lineTo(x, s.y + s.h / 2); }
    }
    ctx.stroke();
    if (P.shadow) { ctx.fillStyle = P.shadow; ctx.beginPath(); rrect(ctx, k.x - 26, k.y - 10, 56, 24, 12); ctx.fill(); }
    ctx.fillStyle = P.kilnRing; ctx.beginPath(); rrect(ctx, k.x - 28, k.y - 12, 56, 24, 12); ctx.fill();
    ctx.fillStyle = P.kilnTrench; ctx.beginPath(); rrect(ctx, k.x - 24, k.y - 8, 48, 16, 8); ctx.fill();
    ctx.fillStyle = P.kilnBrick; ctx.beginPath(); rrect(ctx, k.x - 17, k.y - 3.4, 34, 6.8, 3.4); ctx.fill();
    ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.3; ctx.beginPath();
    for (let x = k.x - 22; x <= k.x + 22; x += 2.6) { ctx.moveTo(x, k.y - 11.6); ctx.lineTo(x, k.y - 8.4); ctx.moveTo(x, k.y + 8.4); ctx.lineTo(x, k.y + 11.6); }
    ctx.stroke();
    if (P.shadow) { ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(0.55); ctx.fillStyle = P.shadow; ctx.fillRect(0, -1.6, 22, 3.2); ctx.restore(); }
    ctx.fillStyle = P.chimney; ctx.beginPath(); ctx.arc(k.x, k.y, 3.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.kilnBrick; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(k.x, k.y, 3.4, 0, TAU); ctx.stroke();
    for (const h of D.huts) {
      if (Math.abs(h.x - k.x) > 60 || Math.abs(h.y - k.y) > 30) continue;
      if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(h.x + 0.8, h.y + 0.9, h.w, h.h); }
      ctx.fillStyle = P.hut; ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(h.x, h.y + h.h / 2); ctx.lineTo(h.x + h.w, h.y + h.h / 2); ctx.stroke();
    }
  }
  function paintAirport(ctx, W, D, P, vis) {
    const F = AIRPORT_FENCE, R = RUNWAY, T = TERMINAL;
    if (!vis((F.x0 + F.x1) / 2, (F.y0 + F.y1) / 2, 300)) return;
    ctx.fillStyle = P.airGrass; ctx.fillRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0);
    // runway
    ctx.fillStyle = P.runway; ctx.fillRect(R.x0, R.y - R.half, R.x1 - R.x0, R.half * 2);
    ctx.fillStyle = P.rwMark;
    for (const ex of [R.x0 + 2, R.x1 - 12]) for (let k = -7; k <= 7; k += 2) ctx.fillRect(ex, R.y + k - 0.45, 10, 0.9);
    for (let x = R.x0 + 34; x < R.x1 - 34; x += 12) ctx.fillRect(x, R.y - 0.3, 6.5, 0.6);
    for (const ex of [R.x0 + 34, R.x0 + 52, R.x1 - 41, R.x1 - 59]) { ctx.fillRect(ex, R.y - 6.2, 7, 1.3); ctx.fillRect(ex, R.y + 4.9, 7, 1.3); }
    ctx.fillRect(R.x0, R.y - R.half + 0.5, R.x1 - R.x0, 0.4); ctx.fillRect(R.x0, R.y + R.half - 0.9, R.x1 - R.x0, 0.4);
    ctx.font = `700 7px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(R.x0 + 22, R.y); ctx.rotate(Math.PI / 2); ctx.fillText('09', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(R.x1 - 22, R.y); ctx.rotate(-Math.PI / 2); ctx.fillText('27', 0, 0); ctx.restore();
    // taxiway, connectors and apron
    ctx.fillStyle = P.taxi;
    ctx.fillRect(R.x0 + 4, TAXI_Y - 4.5, R.x1 - R.x0 - 4, 9);
    for (const cx of [1040, 1290]) ctx.fillRect(cx - 4.5, R.y, 9, TAXI_Y - R.y);
    ctx.fillStyle = P.apron; ctx.fillRect(APRON.x0, TAXI_Y + 4.5, APRON.x1 - APRON.x0, APRON.y1 - TAXI_Y - 4.5);
    ctx.strokeStyle = P.apronLine; ctx.lineWidth = 0.3; ctx.beginPath();
    for (let x = APRON.x0 + 14; x < APRON.x1; x += 14) { ctx.moveTo(x, TAXI_Y + 5); ctx.lineTo(x, APRON.y1); }
    ctx.stroke();
    ctx.strokeStyle = P.taxiLine; ctx.lineWidth = 0.55; ctx.beginPath();
    ctx.moveTo(R.x0 + 6, TAXI_Y); ctx.lineTo(R.x1, TAXI_Y);
    for (const cx of [1040, 1290]) { ctx.moveTo(cx, R.y + R.half); ctx.lineTo(cx, TAXI_Y); }
    ctx.moveTo(1124, TAXI_Y); ctx.lineTo(1124, GATE_Y - 56); ctx.lineTo(APRON.x1 - 3, GATE_Y - 56);
    for (const g of GATES) { ctx.moveTo(g, GATE_Y - 56); ctx.lineTo(g, GATE_Y + 16); }
    ctx.stroke();
    ctx.strokeStyle = P.taxiLine; ctx.lineWidth = 0.35; ctx.setLineDash([2, 1.5]);
    for (const g of GATES) ctx.strokeRect(g - 19, GATE_Y - 20, 38, 42);
    ctx.setLineDash([]);
    // hangars and cargo sheds
    for (const h of [{ x0: 1022, y0: 114, x1: 1108, y1: 164 }, { x0: 1022, y0: 174, x1: 1108, y1: 236 }]) {
      shadowRect(ctx, P, h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0, 3);
      ctx.fillStyle = P.hangar; ctx.fillRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0);
      ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.35; ctx.beginPath();
      for (let x = h.x0 + 5; x < h.x1; x += 5) { ctx.moveTo(x, h.y0); ctx.lineTo(x, h.y1); }
      ctx.stroke(); ctx.lineWidth = 0.8; ctx.strokeRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0);
    }
    // terminal: long roof with skylights, glass front, jet bridges
    shadowRect(ctx, P, T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0, 3.5);
    ctx.fillStyle = P.termRoof; ctx.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
    ctx.fillStyle = P.roofHi;
    for (let x = T.x0 + 8; x < T.x1 - 8; x += 16) ctx.fillRect(x, T.y0 + 9, 9, 3);
    ctx.fillStyle = P.termGlass; ctx.fillRect(T.x0, T.y1 - 4, T.x1 - T.x0, 2.6); ctx.fillRect(T.x0, T.y0, T.x1 - T.x0, 1.8);
    ctx.strokeStyle = P.termEdge; ctx.lineWidth = 0.6; ctx.strokeRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
    ctx.fillStyle = P.bridge;
    for (const g of GATES) { ctx.fillRect(g - 1.7, GATE_Y + 15, 3.4, T.y0 - GATE_Y - 15); ctx.fillRect(g - 3.4, GATE_Y + 13, 6.8, 3.4); }
    // control tower
    const tx = 1096, ty = 262;
    if (P.shadow) { ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(tx + 10, ty + 7, 12, 3.6, 0.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = P.tower; ctx.beginPath(); ctx.arc(tx, ty, 7.5, 0, TAU); ctx.fill();
    ctx.fillStyle = P.towerGlass; ctx.beginPath(); ctx.arc(tx, ty, 5.4, 0, TAU); ctx.fill();
    ctx.fillStyle = P.tower; ctx.beginPath(); ctx.arc(tx, ty, 3, 0, TAU); ctx.fill();
    // fence, car park
    ctx.strokeStyle = P.fence; ctx.lineWidth = 0.7; ctx.setLineDash([2, 1.5]); ctx.strokeRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); ctx.setLineDash([]);
    const C = D.airPark;
    ctx.fillStyle = P.parking; ctx.fillRect(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0);
    ctx.strokeStyle = P.parkLine; ctx.lineWidth = 0.35; ctx.beginPath();
    for (let x = C.x0 + 3; x <= C.x1 - 2.5; x += 5.2) { ctx.moveTo(x, C.y0 + 1); ctx.lineTo(x, C.y1 - 1); }
    ctx.stroke();
    if (P.night) {
      ctx.globalCompositeOperation = 'lighter';
      const dot = (x, y, col, r) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
      for (let x = R.x0 + 4; x <= R.x1 - 2; x += 16) { dot(x, R.y - R.half, 'rgba(255,245,220,0.55)', 3); dot(x, R.y + R.half, 'rgba(255,245,220,0.55)', 3); }
      for (let k = -7; k <= 7; k += 3.5) { dot(R.x0, R.y + k, 'rgba(80,255,140,0.7)', 3); dot(R.x1, R.y + k, 'rgba(255,80,80,0.7)', 3); }
      for (let x = R.x0 + 10; x <= R.x1; x += 22) { dot(x, TAXI_Y - 4.5, 'rgba(90,150,255,0.55)', 2.4); dot(x, TAXI_Y + 4.5, 'rgba(90,150,255,0.55)', 2.4); }
      for (let x = R.x0 - 26; x < R.x0; x += 6) dot(x, R.y, 'rgba(255,240,200,0.6)', 3.2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  function paintMotorway(ctx, D, P, vis) {
    const y0 = MW_Y - MW_HALF, y1 = MW_Y + MW_HALF, X0 = -2, X1 = WORLD_W + 2;
    ctx.fillStyle = P.verge; ctx.fillRect(X0, y0 - 7, X1 - X0, 7); ctx.fillRect(X0, y1, X1 - X0, 7);
    ctx.fillStyle = P.shoulder; ctx.fillRect(X0, y0, X1 - X0, MW_HALF * 2);
    ctx.fillStyle = P.motorway; ctx.fillRect(X0, y0 + 1.6, X1 - X0, MW_HALF - 3.1); ctx.fillRect(X0, MW_Y + 1.5, X1 - X0, MW_HALF - 3.1);
    ctx.fillStyle = P.median; ctx.fillRect(X0, MW_Y - 1.5, X1 - X0, 3);
    ctx.fillStyle = P.barrier; ctx.fillRect(X0, MW_Y - 0.35, X1 - X0, 0.7);
    ctx.strokeStyle = P.mwEdge; ctx.lineWidth = 0.4; ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(X0, MW_Y + s * 1.9); ctx.lineTo(X1, MW_Y + s * 1.9); }
    ctx.stroke();
    ctx.strokeStyle = P.mwLine; ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(X0, MW_Y + s * 13.4); ctx.lineTo(X1, MW_Y + s * 13.4); }
    ctx.stroke();
    ctx.setLineDash([6, 8]); ctx.beginPath();
    for (const s of [-1, 1]) for (const d of [5.6, 9.6]) { ctx.moveTo(X0, MW_Y + s * d); ctx.lineTo(X1, MW_Y + s * d); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = P.fence; ctx.lineWidth = 0.45; ctx.setLineDash([1.2, 1.2]); ctx.beginPath();
    ctx.moveTo(X0, y0 - 6.5); ctx.lineTo(X1, y0 - 6.5); ctx.moveTo(X0, y1 + 6.5); ctx.lineTo(X1, y1 + 6.5); ctx.stroke(); ctx.setLineDash([]);
    for (const gx of D.gantries) {
      if (!vis(gx, MW_Y, 30)) continue;
      if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(gx + 1.5, y0 - 4, 1.4, MW_HALF * 2 + 8); }
      ctx.fillStyle = P.barrier; ctx.fillRect(gx - 0.7, y0 - 5, 1.4, MW_HALF * 2 + 10);
      for (const s of [-1, 1]) {
        const sy = MW_Y + s * 7.6;
        ctx.fillStyle = '#1f6f45'; ctx.fillRect(gx - 2.6, sy - 5.5, 5.2, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let k = -3.5; k <= 3.5; k += 2.3) ctx.fillRect(gx - 1.8, sy + k - 0.3, 3.6, 0.6);
      }
    }
  }
  function paintNewBlock(ctx, b, W, D, P) {
    const R = b.rect, w = R.x1 - R.x0, h = R.y1 - R.y0, pl0 = b.places[0];
    switch (b.type) {
      case 'gym': {
        fillR(ctx, R, P.concrete);
        const hall = pl0.area;
        shadowRect(ctx, P, hall.x0, hall.y0, hall.x1 - hall.x0, hall.y1 - hall.y0, 2.5);
        ctx.fillStyle = P.gymFloor; ctx.fillRect(hall.x0, hall.y0, hall.x1 - hall.x0, hall.y1 - hall.y0);
        ctx.fillStyle = P.gymMat; ctx.fillRect(hall.x0 + 2, hall.y1 - 10, hall.x1 - hall.x0 - 4, 8);
        for (const st of pl0.stations) {
          if (st.kind === 'run') { ctx.fillStyle = P.treadmill; ctx.fillRect(st.x - 1.6, st.y - 3.6, 3.2, 7.2); ctx.fillStyle = P.machine; ctx.fillRect(st.x - 1.9, st.y - 4.4, 3.8, 1.1); }
          else if (st.kind === 'bike') { ctx.fillStyle = P.machine; ctx.fillRect(st.x - 0.7, st.y - 2.8, 1.4, 5.6); ctx.fillRect(st.x - 1.8, st.y - 3, 3.6, 0.8); ctx.fillRect(st.x - 1.4, st.y + 2.2, 2.8, 0.8); }
          else if (st.kind === 'lift') {
            ctx.fillStyle = P.treadmill; ctx.fillRect(st.x - 1.1, st.y - 2.8, 2.2, 5.6);
            ctx.fillStyle = P.machine; ctx.fillRect(st.x - 3.6, st.y - 2.9, 7.2, 0.6);
            ctx.beginPath(); ctx.arc(st.x - 3.6, st.y - 2.6, 0.9, 0, TAU); ctx.arc(st.x + 3.6, st.y - 2.6, 0.9, 0, TAU); ctx.fill();
          }
        }
        ctx.strokeStyle = P.termGlass; ctx.lineWidth = 1.1; ctx.strokeRect(hall.x0 + 0.6, hall.y0 + 0.6, hall.x1 - hall.x0 - 1.2, hall.y1 - hall.y0 - 1.2);
        const yard = { x0: R.x0 + 5, x1: R.x1 - 5, y0: hall.y1 + 5, y1: R.y1 - 4 };
        ctx.fillStyle = P.track; ctx.beginPath(); rrect(ctx, yard.x0, yard.y0, yard.x1 - yard.x0, yard.y1 - yard.y0, 8); ctx.fill();
        ctx.fillStyle = P.field; ctx.beginPath(); rrect(ctx, yard.x0 + 3, yard.y0 + 3, yard.x1 - yard.x0 - 6, yard.y1 - yard.y0 - 6, 5); ctx.fill();
        door(ctx, P, pl0, 5);
        break;
      }
      case 'govt': {
        fillR(ctx, R, P.concrete);
        for (const pl of b.places) {
          const r = pl.rect, hall = pl.hall;
          const bld = { x0: r.x0 + 3, x1: r.x1 - 3, y0: r.y0 + 3, y1: r.y0 + 18 };
          shadowRect(ctx, P, bld.x0, bld.y0, bld.x1 - bld.x0, bld.y1 - bld.y0, 2.5);
          ctx.fillStyle = P.govtRoof; ctx.fillRect(bld.x0, bld.y0, bld.x1 - bld.x0, bld.y1 - bld.y0);
          ctx.fillStyle = P.roofHi; ctx.fillRect(bld.x0, bld.y0, bld.x1 - bld.x0, (bld.y1 - bld.y0) / 2);
          ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.5; ctx.strokeRect(bld.x0 + 0.4, bld.y0 + 0.4, bld.x1 - bld.x0 - 0.8, bld.y1 - bld.y0 - 0.8);
          ctx.fillStyle = '#01411c'; ctx.fillRect(bld.x0 + 3, bld.y0 + 4, 6, 4); ctx.fillStyle = '#ffffff'; ctx.fillRect(bld.x0 + 3, bld.y0 + 4, 1.6, 4);
          ctx.fillStyle = P.govtHall; ctx.fillRect(hall.x0, hall.y0, hall.x1 - hall.x0, hall.y1 - hall.y0);
          ctx.fillStyle = P.chair;
          for (const st of pl.stations) ctx.fillRect(st.x - 1.2, st.y + 0.6, 2.4, 1.1);
          ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.6; ctx.strokeRect(hall.x0, hall.y0, hall.x1 - hall.x0, hall.y1 - hall.y0);
          const d = pl.access.door;
          ctx.strokeStyle = P.queueLine; ctx.lineWidth = 0.4; ctx.setLineDash([1, 0.8]); ctx.beginPath();
          for (const dx of [-5, 5]) { ctx.moveTo(d.x + dx, d.y - 1); ctx.lineTo(d.x + dx, hall.y1 + 0.5); }
          ctx.stroke(); ctx.setLineDash([]);
          door(ctx, P, pl, 5);
        }
        break;
      }
      case 'mosque': {
        fillR(ctx, R, P.concrete);
        ctx.fillStyle = P.mosqueFloor; ctx.fillRect(R.x0 + 3, R.y0 + 3, w - 6, h - 6);
        ctx.strokeStyle = P.roofEdge; ctx.lineWidth = 0.22; ctx.beginPath();
        for (let x = R.x0 + 9; x < R.x1 - 3; x += 6) { ctx.moveTo(x, R.y0 + 3); ctx.lineTo(x, R.y1 - 3); }
        for (let y = R.y0 + 9; y < R.y1 - 3; y += 6) { ctx.moveTo(R.x0 + 3, y); ctx.lineTo(R.x1 - 3, y); }
        ctx.stroke();
        const hall = { x0: R.x0 + 4, y0: R.y0 + 7, x1: R.x0 + 36, y1: R.y1 - 7 };
        shadowRect(ctx, P, hall.x0, hall.y0, hall.x1 - hall.x0, hall.y1 - hall.y0, 2.5);
        ctx.fillStyle = P.mosqueRug; ctx.fillRect(hall.x0, hall.y0, hall.x1 - hall.x0, hall.y1 - hall.y0);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.3; ctx.beginPath();
        for (let x = hall.x0 + 4; x < hall.x1; x += 4.1) { ctx.moveTo(x, hall.y0 + 1); ctx.lineTo(x, hall.y1 - 1); }
        ctx.stroke();
        const dx = (hall.x0 + hall.x1) / 2, dy = (hall.y0 + hall.y1) / 2;
        if (P.shadow) { ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.arc(dx + 2.5, dy + 3, 11, 0, TAU); ctx.fill(); }
        const g = ctx.createRadialGradient(dx - 4, dy - 4, 1, dx, dy, 11);
        g.addColorStop(0, rgba(P.dome, 0.95)); g.addColorStop(1, P.dome);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dx, dy, 11, 0, TAU); ctx.fill();
        ctx.fillStyle = P.roofHi; ctx.beginPath(); ctx.arc(dx - 3, dy - 3, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(dx, dy, 1.1, 0, TAU); ctx.fill();
        for (const [mx, my] of [[R.x1 - 8, R.y0 + 8], [R.x1 - 8, R.y1 - 8], [R.x0 + 8, R.y0 + 5], [R.x0 + 8, R.y1 - 5]]) {
          if (P.shadow) { ctx.save(); ctx.translate(mx, my); ctx.rotate(0.55); ctx.fillStyle = P.shadow; ctx.fillRect(0, -1.3, 16, 2.6); ctx.restore(); }
          ctx.fillStyle = P.minaret; ctx.beginPath(); ctx.arc(mx, my, 3, 0, TAU); ctx.fill();
          ctx.strokeStyle = P.dome; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(mx, my, 2, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = P.water; ctx.fillRect((R.x0 + 36 + R.x1) / 2 - 6, (R.y0 + R.y1) / 2 - 3, 12, 6);
        ctx.strokeStyle = P.minaret; ctx.lineWidth = 1.2; ctx.strokeRect(R.x0 + 2, R.y0 + 2, w - 4, h - 4);
        door(ctx, P, pl0, 3);
        break;
      }
      case 'mart': {
        fillR(ctx, R, P.lot); lotsFor(ctx, b, D, P);
        const m = { x0: R.x0 + 8, x1: R.x1 - 8, y0: R.y0 + 10, y1: R.y1 - 20 };
        shadowRect(ctx, P, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0, 3);
        ctx.fillStyle = '#d8d3c8'; ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
        ctx.fillStyle = '#b3342f'; ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, 7);
        ctx.fillStyle = '#c8c2b4';
        for (let y = m.y0 + 18; y <= m.y1 - 12; y += 9) ctx.fillRect(m.x0 + 5, y - 2, m.x1 - m.x0 - 10, 3.2);
        ctx.fillStyle = ['#e9c46a', '#2a9d8f', '#e76f51', '#4d908e'][0];
        for (let y = m.y0 + 18; y <= m.y1 - 12; y += 9) for (let x = m.x0 + 7; x < m.x1 - 8; x += 5.2) { ctx.fillStyle = ['#e9c46a', '#2a9d8f', '#e76f51', '#8ecae6'][(x * 3 + y) % 4 | 0]; ctx.fillRect(x, y - 1.6, 3.4, 2); }
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.7; ctx.strokeRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
        ctx.fillStyle = '#fff'; ctx.font = `700 5px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AL-FATAH MART', (m.x0 + m.x1) / 2, m.y0 + 3.6);
        ctx.fillStyle = P.termGlass; ctx.fillRect((m.x0 + m.x1) / 2 - 9, m.y1 - 2, 18, 2);
        door(ctx, P, pl0, 5);
        break;
      }
      case 'mandi': {
        fillR(ctx, R, P.dirt || P.lot);
        for (const ly of [R.y0 + 24, R.y0 + 47, R.y0 + 70]) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(R.x0 + 4, ly + 3, w - 8, 9);
          for (let x = R.x0 + 7, i = 0; x < R.x1 - 8; x += 8.8, i++) {
            ctx.fillStyle = P.awning ? P.awning[i % P.awning.length] : '#d65a4a'; ctx.fillRect(x, ly - 3.6, 7.6, 3.6);
            ctx.fillStyle = ['#d62828', '#52b788', '#f4a261', '#9b5de5', '#2d6a4f'][(i + ly) % 5]; ctx.fillRect(x + 0.6, ly + 0.2, 6.4, 2.4);
            ctx.fillStyle = ['#e63946', '#95d5b2', '#ffb703', '#bde0fe', '#a7c957'][(i * 2 + ly) % 5]; for (let k = 0; k < 4; k++) ctx.fillRect(x + 1 + k * 1.5, ly + 3.2, 1, 1);
          }
        }
        ctx.strokeStyle = P.roofLine; ctx.lineWidth = 0.6; ctx.strokeRect(R.x0 + 1.5, R.y0 + 1.5, w - 3, h - 3);
        ctx.fillStyle = '#2f6f3a'; ctx.fillRect(R.x0 + w / 2 - 22, R.y0 + 6, 44, 8);
        ctx.fillStyle = '#fff'; ctx.font = `700 5px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SABZI MANDI', R.x0 + w / 2, R.y0 + 10.3);
        door(ctx, P, pl0, 5);
        break;
      }
      case 'fire': {
        fillR(ctx, R, P.concrete);
        const a = pl0.area;
        shadowRect(ctx, P, a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0, 3);
        ctx.fillStyle = '#b1252b'; ctx.fillRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0);
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(a.x0, a.y0, a.x1 - a.x0, 6);
        ctx.fillStyle = '#e9e9e9'; ctx.fillRect(a.x0, (a.y0 + a.y1) / 2 - 1, a.x1 - a.x0, 2);
        ctx.fillStyle = P.apron || '#7d8794'; ctx.fillRect(R.x0 + 6, a.y1 + 2, w - 12, R.y1 - a.y1 - 6);
        for (const bay of pl0.bays) { ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.5; ctx.strokeRect(bay.x - 4.5, bay.y - 7, 9, 14); ctx.fillStyle = '#6b1519'; ctx.fillRect(bay.x - 4.5, a.y1 - 3, 9, 3); }
        ctx.fillStyle = '#fff'; ctx.font = `700 5px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FIRE STATION', (a.x0 + a.x1) / 2, a.y0 + 12);
        ctx.fillStyle = '#7a1519'; ctx.fillRect(a.x1 - 9, a.y0 + 2, 7, 14);
        door(ctx, P, pl0, 5);
        break;
      }
      case 'graveyard': {
        fillR(ctx, R, '#5f7f4e');
        ctx.fillStyle = '#6f8f5c'; ctx.fillRect(R.x0 + 4, R.y0 + 4, w - 8, h - 8);
        ctx.strokeStyle = '#d7d2c4'; ctx.lineWidth = 1.2; ctx.strokeRect(R.x0 + 2.5, R.y0 + 2.5, w - 5, h - 5);
        ctx.fillStyle = '#c9c2ad'; ctx.fillRect(R.x0 + w / 2 - 2, R.y0 + 4, 4, 44);
        ctx.fillStyle = 'rgba(40,60,30,0.35)';
        for (const g of pl0.graveSlots) ctx.fillRect(g.x - 1.3, g.y - 2.2, 2.6, 4.4);
        for (const [tx, ty] of [[R.x0 + 14, R.y0 + 12], [R.x1 - 14, R.y0 + 14], [R.x0 + 12, R.y1 - 12]]) { ctx.fillStyle = P.tree ? P.tree[1] : '#2f6b3a'; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, TAU); ctx.fill(); }
        door(ctx, P, pl0, 4);
        break;
      }
      case 'wedding': {
        fillR(ctx, R, P.lot);
        lotsFor(ctx, b, D, P);
        const m = pl0.area;
        if (P.shadow) { ctx.fillStyle = P.shadow; ctx.beginPath(); rrect(ctx, m.x0 + 2.5, m.y0 + 3, m.x1 - m.x0, m.y1 - m.y0, 4); ctx.fill(); }
        ctx.fillStyle = P.marquee; ctx.beginPath(); rrect(ctx, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0, 4); ctx.fill();
        ctx.fillStyle = P.marqueeStripe;
        for (let x = m.x0 + 2; x < m.x1 - 2; x += 6) ctx.fillRect(x, m.y0, 3, m.y1 - m.y0);
        ctx.fillStyle = P.stage; ctx.fillRect(m.x0 + 3, m.y0 + 10, 9, m.y1 - m.y0 - 20);
        ctx.fillStyle = '#e9c46a'; ctx.fillRect(m.x0 + 5, (m.y0 + m.y1) / 2 - 3, 4, 6);
        ctx.fillStyle = P.table;
        for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 3; gy++) { ctx.beginPath(); ctx.arc(m.x0 + 24 + gx * 14, m.y0 + 11 + gy * 17, 2.4, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = P.awning[1]; ctx.lineWidth = 0.8; ctx.beginPath(); rrect(ctx, m.x0 + 0.4, m.y0 + 0.4, m.x1 - m.x0 - 0.8, m.y1 - m.y0 - 0.8, 4); ctx.stroke();
        door(ctx, P, pl0, 6);
        break;
      }
    }
  }
  function lotsFor(ctx, b, D, P) { for (const pr of D.parkingRects) if (pr.b === b) parkingLot(ctx, P, pr); }

  /* =================== Traffic: decorative buses and police patrols =================== */
  class Traffic {
    constructor(seed) {
      this.rng = new Random(((seed + 7) * 2654435761) >>> 0 || 3);
      this.nodes = []; const key = new Map();
      const node = (x, y) => { const k = x + ',' + y; if (!key.has(k)) { key.set(k, this.nodes.length); this.nodes.push({ x, y, adj: [] }); } return key.get(k); };
      const link = (x1, y1, x2, y2) => { const a = node(x1, y1), b = node(x2, y2); this.nodes[a].adj.push(b); this.nodes[b].adj.push(a); };
      for (const X of ROAD_X) for (let i = 0; i < ROAD_Y.length - 1; i++) link(X, ROAD_Y[i], X, ROAD_Y[i + 1]);
      for (const Y of ROAD_Y) for (let i = 0; i < ROAD_X.length - 1; i++) link(ROAD_X[i], Y, ROAD_X[i + 1], Y);
      const start = (x, y, nx, ny) => ({ a: node(x, y), b: node(nx, ny), d: 0 });
      this.cars = [
        Object.assign(start(MAIN_X, 100, MAIN_X, 200), { kind: 'bus', main: true }),
        Object.assign(start(200, MAIN_Y, 300, MAIN_Y), { kind: 'bus', main: true }),
        Object.assign(start(800, 200, 800, 300), { kind: 'police' }),
        Object.assign(start(300, 400, 400, 400), { kind: 'police' }),
        Object.assign(start(MAIN_X, 500, MAIN_X, 600), { kind: 'plow', main: true }),
        Object.assign(start(500, MAIN_Y, 600, MAIN_Y), { kind: 'plow', main: true }),
      ];
    }
    len(c) { const A = this.nodes[c.a], B = this.nodes[c.b]; return Math.hypot(B.x - A.x, B.y - A.y); }
    update(dist, snow) {
      const N = this.nodes;
      for (const c of this.cars) {
        if (c.kind === 'plow' && !snow) continue;   // parked at the depot until needed
        c.d += dist * (c.kind === 'bus' ? 0.7 : c.kind === 'plow' ? 0.85 : 1);
        let L = this.len(c), guard = 0;
        while (c.d >= L && guard++ < 6) {
          c.d -= L;
          const A = N[c.a], B = N[c.b];
          let opts = B.adj.filter((n) => n !== c.a);
          if (c.main) opts = opts.filter((n) => N[n].x === MAIN_X || N[n].y === MAIN_Y);
          if (!opts.length) opts = [c.a];
          const dx = Math.sign(B.x - A.x), dy = Math.sign(B.y - A.y);
          let next = null;
          if (this.rng.next() < 0.6) next = opts.find((n) => Math.sign(N[n].x - B.x) === dx && Math.sign(N[n].y - B.y) === dy);
          if (next == null) next = opts[this.rng.int(0, opts.length - 1)];
          c.a = c.b; c.b = next; L = this.len(c);
        }
      }
    }
    draw(ctx, P, now, light, snow) {
      const N = this.nodes;
      for (const c of this.cars) {
        if (c.kind === 'plow' && !snow) continue;   // only out on the roads while snow is settling
        const A = N[c.a], B = N[c.b], L = this.len(c), ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
        const main = A.x === B.x ? A.x === MAIN_X : A.y === MAIN_Y, lane = roadHalf(main) * 0.5;
        const x = A.x + ux * c.d + uy * lane, y = A.y + uy * c.d - ux * lane;
        if (c.kind === 'bus') drawCar(ctx, x, y, Math.atan2(uy, ux), P.night ? '#b88a2a' : '#2f8f6a', P, light > 0.3, { len: 15, wid: 4.8, moving: true, light });
        else if (c.kind === 'plow') {
          drawCar(ctx, x, y, Math.atan2(uy, ux), '#ff8a1e', P, light > 0.3, { len: 16, wid: 5.2, moving: true, light, now });
          // a swept-clear fan in front of the blade
          const ang = Math.atan2(uy, ux);
          ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = P.night ? 'rgba(210,225,245,0.5)' : 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.arc(x, y, 13, ang - 0.55, ang + 0.55); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        else drawCar(ctx, x, y, Math.atan2(uy, ux), P.night ? '#d9dee3' : '#f4f6f8', P, light > 0.3, { kind: 'police', moving: true, siren: false, now, light });
      }
    }
  }

  /* =================== Heatmap (Hotspots layer) =================== */
  class Heatmap {
    constructor() {
      this.cols = 100; this.rows = 60;
      this.g = new Float32Array(this.cols * this.rows);
      this.cv = document.createElement('canvas'); this.cv.width = this.cols; this.cv.height = this.rows;
      this.c2 = this.cv.getContext('2d');
      this.max = 0; this.dirty = true;
    }
    reset() { this.g.fill(0); this.max = 0; this.dirty = true; }
    add(x, y) {
      const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = cx + dx, Y = cy + dy;
        if (X < 0 || Y < 0 || X >= this.cols || Y >= this.rows) continue;
        const i = Y * this.cols + X;
        this.g[i] += Math.exp(-(dx * dx + dy * dy) / 2.2);
        if (this.g[i] > this.max) this.max = this.g[i];
      }
      this.dirty = true;
    }
    draw(ctx, P) {
      if (!this.max) return;
      if (this.dirty) {
        const img = this.c2.createImageData(this.cols, this.rows), d = img.data;
        for (let i = 0; i < this.g.length; i++) {
          const v = this.g[i] / this.max;
          if (v < 0.015) continue;
          const t = Math.pow(v, 0.65);
          let r, g, b;
          if (t < 0.5) { const u = t / 0.5; r = 255; g = 196 - 96 * u; b = 70 - 10 * u; }
          else { const u = (t - 0.5) / 0.5; r = 255 - 20 * u; g = 100 - 60 * u; b = 60 + 50 * u; }
          d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255 * Math.min(0.62, 0.1 + t * 0.55);
        }
        this.c2.putImageData(img, 0, 0);
        this.dirty = false;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = P.heatAlpha;
      if (P.night) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.cv, 0, 0, WORLD_W, WORLD_H);
      ctx.restore();
    }
  }


  /* =================== Effects =================== */
  class Effects {
    constructor() { this.list = []; }
    clear() { this.list.length = 0; }
    add(type, x, y, extra) {
      if (reduceMotion) return;
      if (this.list.length > 260) this.list.splice(0, this.list.length - 260);
      this.list.push(Object.assign({ type, x, y, t0: performance.now(), seed: Math.random() * TAU }, extra));
    }
    draw(ctx, now, k, P) {
      const px = 1 / k, A = P.agents;
      let j = 0;
      if (P.night) ctx.globalCompositeOperation = 'lighter';
      for (const e of this.list) {
        const life = e.type === 'death' ? 1600 : e.type === 'infect' ? 950 : e.type === 'crash' ? 1500 : 1200;
        const p = Math.max(0, (now - e.t0) / life);
        if (p >= 1) continue;
        this.list[j++] = e;
        const q = 1 - p;
        if (e.type === 'infect') {
          if (e.fx != null) {
            ctx.strokeStyle = rgba(A.I, 0.95 * q * q);
            ctx.lineWidth = Math.max(0.8, 2.4 * px);
            ctx.beginPath(); ctx.moveTo(e.fx, e.fy); ctx.lineTo(e.x, e.y); ctx.stroke();
          }
          ctx.strokeStyle = rgba(A.I, 0.9 * q);
          ctx.lineWidth = Math.max(0.6, 2 * px);
          ctx.beginPath(); ctx.arc(e.x, e.y, 4 + p * 20, 0, TAU); ctx.stroke();
          ctx.fillStyle = rgba(A.I, q);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const an = e.seed + i * 1.047, d = 4 + p * 17, rr = Math.max(0.7, 1.7 * px);
            const x = e.x + Math.cos(an) * d, y = e.y + Math.sin(an) * d;
            ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU);
          }
          ctx.fill();
        } else if (e.type === 'crash') {
          ctx.strokeStyle = rgba('#ffb020', 0.95 * q); ctx.lineWidth = Math.max(0.8, 2.6 * px);
          ctx.beginPath(); ctx.arc(e.x, e.y, 5 + p * 24, 0, TAU); ctx.stroke();
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const an = e.seed + i * 0.785, d0 = 3 + p * 6, d1 = 7 + p * 18; ctx.moveTo(e.x + Math.cos(an) * d0, e.y + Math.sin(an) * d0); ctx.lineTo(e.x + Math.cos(an) * d1, e.y + Math.sin(an) * d1); }
          ctx.stroke();
        } else if (e.type === 'death') {
          ctx.strokeStyle = rgba(P.night ? '#c3ccd4' : '#39424b', 0.75 * q);
          ctx.lineWidth = Math.max(0.6, 1.6 * px);
          ctx.beginPath(); ctx.arc(e.x, e.y, 4 + p * 12, 0, TAU); ctx.stroke();
          const cy = e.y - 7 - p * 12, s = 3;
          ctx.lineWidth = Math.max(0.8, 2 * px);
          ctx.beginPath(); ctx.moveTo(e.x, cy - s); ctx.lineTo(e.x, cy + s * 1.4); ctx.moveTo(e.x - s * 0.8, cy); ctx.lineTo(e.x + s * 0.8, cy); ctx.stroke();
        } else {
          const c = e.type === 'vax' ? A.V : e.type === 'isolate' ? '#46c6e6' : A.I;
          ctx.strokeStyle = rgba(c, 0.9 * q);
          ctx.lineWidth = Math.max(0.6, 2 * px);
          ctx.beginPath(); ctx.arc(e.x, e.y, 4 + p * 16, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(e.x, e.y, 4 + p * 8, 0, TAU); ctx.stroke();
        }
      }
      this.list.length = j;
      ctx.globalCompositeOperation = 'source-over';
    }
  }


  /* =================== Camera =================== */
  class Camera {
    constructor() { this.z = 1; this.cx = WORLD_W / 2; this.cy = WORLD_H / 2; this.W = 1000; this.H = 600; this.anim = null; }
    setSize(W, H) { this.W = W; this.H = H; this.clamp(); }
    get k() { return (this.W / WORLD_W) * this.z; }
    view() {
      const k = this.k, hw = this.W / (2 * k), hh = this.H / (2 * k);
      return { x0: this.cx - hw, y0: this.cy - hh, x1: this.cx + hw, y1: this.cy + hh };
    }
    clamp() {
      const hw = WORLD_W / (2 * this.z), hh = WORLD_H / (2 * this.z);
      this.cx = clamp(this.cx, hw, WORLD_W - hw);
      this.cy = clamp(this.cy, hh, WORLD_H - hh);
    }
    toWorld(sx, sy) { const k = this.k; return { x: this.cx + (sx - this.W / 2) / k, y: this.cy + (sy - this.H / 2) / k }; }
    toScreen(x, y) { const k = this.k; return { x: (x - this.cx) * k + this.W / 2, y: (y - this.cy) * k + this.H / 2 }; }
    zoomAt(sx, sy, z) {
      const b = this.toWorld(sx, sy);
      this.z = clamp(z, 1, 8);
      const a = this.toWorld(sx, sy);
      this.cx += b.x - a.x; this.cy += b.y - a.y;
      this.clamp();
    }
    animateTo(z, sx, sy) { this.anim = { z: clamp(z, 1, 8), sx: sx == null ? this.W / 2 : sx, sy: sy == null ? this.H / 2 : sy }; }
    update() {
      if (!this.anim) return;
      const nz = this.z + (this.anim.z - this.z) * (reduceMotion ? 1 : 0.22);
      if (Math.abs(nz - this.anim.z) < 0.005) { this.zoomAt(this.anim.sx, this.anim.sy, this.anim.z); this.anim = null; }
      else this.zoomAt(this.anim.sx, this.anim.sy, nz);
    }
  }


  /* =================== SoundFX (Web Audio, no files) =================== */
  class SoundFX {
    constructor() { this.on = true; this.ctx = null; this.last = {}; }
    unlock() {
      if (!this.on) return;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.22;
          this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (err) { this.ctx = null; }
    }
    tone(freq, dur, type, vol, slideTo, delay) {
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.03);
    }
    noise(dur, vol, freq, delay) {
      const c = this.ctx, t = c.currentTime + (delay || 0), len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    }
    setRain(level) {
      if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
      const c = this.ctx;
      if (!this.rainG) {
        const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        let b0 = 0; for (let i = 0; i < len; i++) { b0 = 0.97 * b0 + 0.03 * (Math.random() * 2 - 1); d[i] = (Math.random() * 2 - 1) * 0.6 + b0 * 6; }
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; src.loop = true; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.4; g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master); src.start();
        this.rainG = g;
      }
      this.rainG.gain.setTargetAtTime(level > 0.05 ? Math.min(0.5, level * 0.42) : 0, c.currentTime, 0.6);
    }
    play(name) {
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
      const now = performance.now();
      const gap = { infect: 120, death: 280, isolate: 200, click: 40, siren: 1500, crash: 400, thunder: 1500 }[name] || 0;
      if (gap && now - (this.last[name] || 0) < gap) return;
      this.last[name] = now;
      try {
        switch (name) {
          case 'infect': this.tone(600 + Math.random() * 200, 0.09, 'triangle', 0.16, 360); break;
          case 'death': this.tone(196, 0.5, 'sine', 0.32, 98); break;
          case 'alarm': for (let i = 0; i < 4; i++) this.tone(i % 2 ? 560 : 760, 0.22, 'square', 0.06, null, i * 0.24); break;
          case 'isolate': this.tone(880, 0.08, 'sine', 0.12); this.tone(1175, 0.1, 'sine', 0.12, null, 0.09); break;
          case 'start': this.tone(440, 0.09, 'triangle', 0.22, 660); break;
          case 'pause': this.tone(660, 0.09, 'triangle', 0.22, 440); break;
          case 'level': this.tone(523, 0.14, 'sine', 0.18); this.tone(784, 0.18, 'sine', 0.18, null, 0.11); break;
          case 'end': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.2, null, i * 0.13)); break;
          case 'vax': this.tone(988, 0.14, 'sine', 0.16, 1318); break;
          case 'click': this.tone(1400, 0.035, 'square', 0.04); break;
          case 'siren': for (let i = 0; i < 4; i++) this.tone(i % 2 ? 700 : 960, 0.16, 'sawtooth', 0.035, null, i * 0.17); break;
          case 'crash': this.noise(0.45, 0.9, 2600); this.tone(150, 0.25, 'square', 0.06, 70); break;
          case 'thunder': this.noise(2.2, 1.4, 220); this.noise(1.2, 0.6, 520, 0.12); break;
        }
      } catch (err) { /* audio failed: ignore */ }
    }
  }


  /* =================== colours from CSS (for charts) =================== */
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['bg', 'panel', 'panel-2', 'ink', 'muted', 'faint', 'line', 'line-strong', 'accent', 's', 'v', 'e', 'i', 'r', 'd', 'x', 'h', 'danger', 'ok', 'warn',
      'run1', 'run2', 'run3', 'run4', 'run5', 'run6', 'run7', 'run8']) C[k] = cs.getPropertyValue('--' + k).trim() || '#888888';
  }
  const SERIES = {
    I: { label: 'Infectious', color: 'i' }, E: { label: 'Exposed', color: 'e' }, R: { label: 'Recovered', color: 'r' },
    D: { label: 'Died of the disease', color: 'd' }, X: { label: 'Accident & fire deaths', color: 'x' }, V: { label: 'Vaccinated & healthy', color: 'v' }, S: { label: 'Susceptible', color: 's' },
  };
  const ORDER = ['I', 'E', 'R', 'D', 'X', 'V', 'S'];
  function niceMax(v, min) {
    const steps = [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5000];
    const t = Math.max(min || 0, v * 1.04);
    for (const s of steps) if (s >= t) return s;
    return Math.ceil(t / 1000) * 1000;
  }
  function niceStep(max, target) {
    const raw = max / (target || 5);
    for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (s >= raw) return s;
    return 1000;
  }
  function fitCanvas(cv, state) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== state.W || h !== state.H || dpr !== state.dpr) {
      state.W = w; state.H = h; state.dpr = dpr;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    return true;
  }


  /* =================== aircraft, helicopter, motorway vehicles, signals, police =================== */
  const LIVERY = { PK: '#0b6b3a', EK: '#c8102e', QR: '#5c0632', TK: '#c8102e', SV: '#1f5c3f', PA: '#2a6ad1', FZ: '#f08a24', WY: '#a37d4b', GF: '#8a6a2e', ER: '#2f8fd0' };
  function planeShape(ctx) {
    ctx.beginPath();
    ctx.moveTo(4, -2); ctx.lineTo(-5, -17.5); ctx.lineTo(-9.5, -17.5); ctx.lineTo(-4.5, -2.2);
    ctx.lineTo(-4.5, 2.2); ctx.lineTo(-9.5, 17.5); ctx.lineTo(-5, 17.5); ctx.lineTo(4, 2); ctx.closePath();
    ctx.moveTo(-13, -1); ctx.lineTo(-16.5, -6.8); ctx.lineTo(-18.8, -6.8); ctx.lineTo(-17, -1); ctx.lineTo(-17, 1); ctx.lineTo(-18.8, 6.8); ctx.lineTo(-16.5, 6.8); ctx.lineTo(-13, 1); ctx.closePath();
    ctx.moveTo(18.5, 0); ctx.ellipse(0, 0, 18.5, 2.3, 0, 0, TAU);
  }
  function drawPlane(ctx, pose, f, P, light, now, shadowOnly) {
    const s = 1 + pose.alt * 0.45;
    if (shadowOnly) {
      ctx.save(); ctx.translate(pose.x + pose.alt * 34, pose.y + pose.alt * 40); ctx.rotate(pose.heading); ctx.scale(1 + pose.alt * 0.1, 1 + pose.alt * 0.1);
      ctx.fillStyle = P.planeShadow; ctx.globalAlpha = 1 - pose.alt * 0.55; planeShape(ctx); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
      return;
    }
    ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.heading); ctx.scale(s, s);
    if (light > 0.3 && (pose.phase === 'landing' || pose.phase === 'takeoff' || pose.phase === 'rollout' || pose.phase === 'climb')) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(18, 0, 70, 0); g.addColorStop(0, `rgba(255,245,220,${0.4 * light})`); g.addColorStop(1, 'rgba(255,245,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(18, -1.5); ctx.lineTo(70, -12); ctx.lineTo(70, 12); ctx.lineTo(18, 1.5); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = P.planeWing;
    ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(-5, -17.5); ctx.lineTo(-9.5, -17.5); ctx.lineTo(-4.5, -2.2); ctx.lineTo(-4.5, 2.2); ctx.lineTo(-9.5, 17.5); ctx.lineTo(-5, 17.5); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-13, -1); ctx.lineTo(-16.5, -6.8); ctx.lineTo(-18.8, -6.8); ctx.lineTo(-17, -1); ctx.lineTo(-17, 1); ctx.lineTo(-18.8, 6.8); ctx.lineTo(-16.5, 6.8); ctx.lineTo(-13, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.planeEngine; ctx.beginPath(); ctx.ellipse(1.5, -8.5, 2.6, 1.1, 0, 0, TAU); ctx.ellipse(1.5, 8.5, 2.6, 1.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.planeBody; ctx.beginPath(); ctx.ellipse(0, 0, 18.5, 2.3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.25; ctx.stroke();
    const col = LIVERY[f.code.slice(0, 2)] || '#2a6ad1';
    ctx.fillStyle = col; ctx.fillRect(-16, -0.55, 26, 1.1); ctx.beginPath(); ctx.ellipse(-16.2, 0, 2.8, 1.25, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.carGlass; ctx.beginPath(); ctx.ellipse(16.6, 0, 1.3, 1.5, 0, -1.2, 1.2); ctx.fill();
    if (light > 0.2) {
      const blink = Math.floor(now / 600) % 2 === 0, strobe = (now % 1100) < 90;
      ctx.globalCompositeOperation = 'lighter';
      const dot = (x, y, c, r) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
      dot(-7.5, -17.5, 'rgba(255,60,60,0.95)', 3); dot(-7.5, 17.5, 'rgba(60,255,120,0.95)', 3);
      if (blink) dot(0, 0, 'rgba(255,60,60,0.8)', 3.5);
      if (strobe) { dot(-7.5, -17.5, 'rgba(255,255,255,1)', 5); dot(-7.5, 17.5, 'rgba(255,255,255,1)', 5); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  function drawHeli(ctx, h, P, light, now) {
    const s = 1 + h.alt * 0.3, spinning = h.state !== 'idle' || h.alt > 0;
    ctx.save(); ctx.translate(h.x + h.alt * 22, h.y + h.alt * 26); ctx.rotate(h.heading);
    ctx.fillStyle = P.planeShadow; ctx.globalAlpha = 1 - h.alt * 0.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, TAU); ctx.fill(); ctx.fillRect(-13, -0.6, 8, 1.2);
    if (spinning) { ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.heading); ctx.scale(s, s);
    if (h.alt < 0.15) { ctx.strokeStyle = P.signalBox; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, -3); ctx.moveTo(-4, 3); ctx.lineTo(4, 3); ctx.stroke(); }
    ctx.fillStyle = P.heliBody; ctx.fillRect(-13, -0.65, 8.5, 1.3);
    ctx.fillStyle = P.heliRed; ctx.fillRect(-13.6, -2, 1.2, 4);
    ctx.fillStyle = P.heliBody; ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.heliRed; ctx.fillRect(-3, -2.5, 2.2, 5);
    ctx.fillStyle = P.carGlass; ctx.beginPath(); ctx.ellipse(3.6, 0, 2, 2, 0, -1.4, 1.4); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1.1, -0.35, 2.2, 0.7); ctx.fillStyle = P.heliRed; ctx.fillRect(-0.35, -1.1, 0.7, 2.2);
    const ang = spinning ? now / 28 : 0.6;
    ctx.strokeStyle = P.rotor; ctx.lineWidth = 0.8;
    if (spinning) { ctx.fillStyle = rgba(P.night ? '#dce6f0' : '#283440', 0.12); ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); }
    ctx.beginPath();
    for (let k = 0; k < 2; k++) { const a = ang + k * Math.PI / 2; ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(-Math.cos(a) * 11, -Math.sin(a) * 11); }
    ctx.stroke();
    if (light > 0.2 && spinning) {
      ctx.globalCompositeOperation = 'lighter';
      const on = Math.floor(now / 450) % 2 === 0;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 5); g.addColorStop(0, on ? 'rgba(255,60,60,0.9)' : 'rgba(255,60,60,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(-5, -5, 10, 10);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    if (light > 0.3 && spinning && h.alt > 0.05 && h.alt < 0.95) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(h.x + h.alt * 22, h.y + h.alt * 26, 0, h.x + h.alt * 22, h.y + h.alt * 26, 16);
      g.addColorStop(0, 'rgba(255,250,230,0.35)'); g.addColorStop(1, 'rgba(255,250,230,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x + h.alt * 22, h.y + h.alt * 26, 16, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  const TRUCK_COL = ['#c9502e', '#2f6fb3', '#3f8f5a', '#d9a03b', '#7d5bb5', '#a33b3b', '#4d7f8a', '#b8742e'];
  function drawVehicle(ctx, v, P, light, now) {
    const ang = v.dir > 0 ? 0 : Math.PI, tilt = v.crashed ? ((v.id % 5) - 2) * 0.18 : 0;
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(ang + tilt);
    const L = v.len, Wd = v.wid;
    if (light > 0.3 && !v.crashed) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(L / 2, 0, L / 2 + 24, 0); g.addColorStop(0, `rgba(255,240,200,${0.32 * light})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(L / 2, -Wd * 0.35); ctx.lineTo(L / 2 + 24, -Wd * 1.4); ctx.lineTo(L / 2 + 24, Wd * 1.4); ctx.lineTo(L / 2, Wd * 0.35); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(-L / 2 + 0.8, -Wd / 2 + 1, L, Wd); }
    if (v.kind === 'truck') {
      ctx.fillStyle = TRUCK_COL[v.color]; ctx.fillRect(-L / 2, -Wd / 2, L - 4.2, Wd);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = -L / 2 + 2; x < L / 2 - 5; x += 2.2) ctx.fillRect(x, -Wd / 2, 0.5, Wd);
      ctx.fillStyle = P.night ? '#c8d0d8' : '#e8ecef'; ctx.beginPath(); rrect(ctx, L / 2 - 3.8, -Wd / 2 + 0.2, 3.8, Wd - 0.4, 0.8); ctx.fill();
      ctx.fillStyle = P.carGlass; ctx.fillRect(L / 2 - 1.4, -Wd / 2 + 0.6, 0.9, Wd - 1.2);
    } else if (v.kind === 'bus') {
      ctx.fillStyle = v.color % 2 ? '#2f8f6a' : '#e6e9ec'; ctx.beginPath(); rrect(ctx, -L / 2, -Wd / 2, L, Wd, 1.2); ctx.fill();
      ctx.fillStyle = v.color % 2 ? '#e6e9ec' : '#c2416f'; ctx.fillRect(-L / 2 + 1, -0.5, L - 2, 1);
      ctx.fillStyle = P.carGlass; ctx.fillRect(L / 2 - 1.6, -Wd / 2 + 0.6, 1.1, Wd - 1.2);
    } else {
      ctx.fillStyle = P.car[v.color]; ctx.beginPath(); rrect(ctx, -L / 2, -Wd / 2, L, Wd, 1.2); ctx.fill();
      ctx.fillStyle = P.carGlass; ctx.fillRect(L / 2 - 3.4, -Wd / 2 + 0.6, 1.7, Wd - 1.2); ctx.fillRect(-L / 2 + 1.1, -Wd / 2 + 0.7, 1.2, Wd - 1.4);
    }
    if (v.crashed) {
      const on = Math.floor(now / 380) % 2 === 0;
      if (on) { ctx.globalCompositeOperation = 'lighter'; for (const [x, y] of [[L / 2, -Wd / 2], [L / 2, Wd / 2], [-L / 2, -Wd / 2], [-L / 2, Wd / 2]]) { const g = ctx.createRadialGradient(x, y, 0, x, y, 4); g.addColorStop(0, 'rgba(255,170,40,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - 4, y - 4, 8, 8); } ctx.globalCompositeOperation = 'source-over'; }
    } else if (v.brake || light > 0.3) {
      ctx.fillStyle = v.brake ? '#ff2a2a' : '#c23a30'; ctx.fillRect(-L / 2 - 0.2, -Wd / 2 + 0.3, 0.7, 1); ctx.fillRect(-L / 2 - 0.2, Wd / 2 - 1.3, 0.7, 1);
      if (v.brake && light > 0.3) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(-L / 2, 0, 0, -L / 2, 0, 6); g.addColorStop(0, 'rgba(255,40,40,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(-L / 2 - 6, -6, 12, 12); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.restore();
  }
  function drawTriangle(ctx, x, y, s) {
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.9, y + s * 0.6); ctx.lineTo(x - s * 0.9, y + s * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - s * 0.45); ctx.lineTo(x + s * 0.4, y + s * 0.3); ctx.lineTo(x - s * 0.4, y + s * 0.3); ctx.closePath(); ctx.fill();
  }
  /* one traffic light head: three lamps, the lit one glows */
  function drawSignal(ctx, x, y, state, P, light, big) {
    const cols = { R: '#ff3b30', A: '#ffb020', G: '#2ee66b' };
    if (!big) {
      ctx.fillStyle = state ? cols[state] : P.signalOff; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = P.signalBox; ctx.beginPath(); rrect(ctx, x - 1.2, y - 3.3, 2.4, 6.6, 0.7); ctx.fill();
      const order = ['R', 'A', 'G'];
      for (let i = 0; i < 3; i++) { ctx.fillStyle = state === order[i] ? cols[order[i]] : 'rgba(120,130,140,0.25)'; ctx.beginPath(); ctx.arc(x, y - 2.05 + i * 2.05, 0.75, 0, TAU); ctx.fill(); }
    }
    if (state && light > 0.25) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6); g.addColorStop(0, rgba(cols[state], 0.55 * light)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  /* a traffic police officer under a striped umbrella, waving cars through */
  function drawOfficer(ctx, x, y, P, now, big, axisGreen) {
    if (big) {
      for (let k = 0; k < 8; k++) { ctx.fillStyle = P.umbrella[k % 2]; ctx.beginPath(); ctx.moveTo(x + 3.2, y - 3.2); ctx.arc(x + 3.2, y - 3.2, 4.2, (k / 8) * TAU, ((k + 1) / 8) * TAU); ctx.closePath(); ctx.fill(); }
    }
    const wave = Math.sin(now / 260) * 0.9;
    ctx.strokeStyle = P.officerShirt; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath();
    if (axisGreen === 'h') { ctx.moveTo(x - 1.4, y); ctx.lineTo(x - 3.6, y + wave); ctx.moveTo(x + 1.4, y); ctx.lineTo(x + 3.6, y - wave); }
    else { ctx.moveTo(x, y - 1.4); ctx.lineTo(x + wave, y - 3.6); ctx.moveTo(x, y + 1.4); ctx.lineTo(x - wave, y + 3.6); }
    ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = P.officerShirt; ctx.beginPath(); ctx.ellipse(x, y, 1.5, 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.officerCap; ctx.beginPath(); ctx.arc(x, y, 1.05, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.9, y - 0.2, 1.8, 0.4);
  }
  /* an injured person lying on the road */
  function drawInjured(ctx, a, P, now, px) {
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.heading + Math.PI / 2);
    ctx.fillStyle = SKIN[a.id % 4]; ctx.beginPath(); ctx.arc(0, -2.4, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = P.agents[a.state] || '#9fb3c8'; ctx.beginPath(); ctx.ellipse(0, 0.6, 1.4, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e3262b'; ctx.beginPath(); ctx.arc(0.6, 1, 0.8, 0, TAU); ctx.fill();
    ctx.restore();
    const on = Math.floor(now / 300) % 2 === 0;
    ctx.strokeStyle = on ? '#ff4d4f' : '#ffffff'; ctx.lineWidth = Math.max(0.6, 1.5 * px);
    ctx.beginPath(); ctx.arc(a.x, a.y, 5.5, 0, TAU); ctx.stroke();
  }
  function drawUmbrella(ctx, x, y, r, i, P) {
    const c = ['#e0393e', '#2a6ad1', '#f2c230', '#2f8f6a', '#7d5bb5', '#1d2a36'][i % 6];
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.12; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const an = (k / 4) * Math.PI; ctx.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r); ctx.lineTo(x - Math.cos(an) * r, y - Math.sin(an) * r); }
    ctx.stroke();
  }

  /* =================== Smoke: kiln and factory plumes, cigarette puffs =================== */
  function smokeSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  class Smoke {
    constructor() { this.list = []; this.last = 0; this.acc = {}; this.sprite = smokeSprite(); this.tinted = {}; }
    tint(rgb) {
      const key = rgb.join(',');
      if (!this.tinted[key]) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'); g.drawImage(this.sprite, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = `rgb(${key})`; g.fillRect(0, 0, 64, 64);
        this.tinted[key] = c;
      }
      return this.tinted[key];
    }
    clear() { this.list.length = 0; }
    emit(x, y, kind, n) { for (let i = 0; i < n; i++) this.list.push({ x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 2, t: 0, kind, life: kind === 'kiln' ? 5200 + Math.random() * 2600 : kind === 'factory' ? 4000 : 1400, r0: kind === 'cig' ? 0.4 : 2.5, jx: (Math.random() - 0.5) * 2, jy: (Math.random() - 0.5) * 2 }); }
    update(dt, world, emitters, playing) {
      const w = world, sp = Math.hypot(w.windX, w.windY) || 1, ux = w.windX / sp, uy = w.windY / sp;
      const drift = (6 + 5 * sp) / 1000;
      if (!reduceMotion) for (const e of emitters) {
        this.acc[e.key] = (this.acc[e.key] || 0) + dt * e.rate;
        while (this.acc[e.key] >= 1) { this.acc[e.key] -= 1; this.emit(e.x, e.y, e.kind, 1); }
      }
      let j = 0;
      for (const p of this.list) {
        p.t += dt;
        if (p.t >= p.life) continue;
        const v = p.kind === 'cig' ? drift * 0.35 : drift;
        p.x += (ux * v + p.jx * 0.0015) * dt; p.y += (uy * v + p.jy * 0.0015 - (p.kind === 'cig' ? 0.002 : 0.001)) * dt;
        this.list[j++] = p;
      }
      this.list.length = j;
      if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
    }
    draw(ctx, P, dark, clean, v) {
      const kilnCol = this.tint(clean ? P.steam : P.smoke), steam = this.tint(P.steam), cig = this.tint([220, 225, 230]);
      for (const p of this.list) {
        const u = p.t / p.life;
        const r = p.kind === 'cig' ? p.r0 + u * 2.2 : p.r0 + u * (p.kind === 'kiln' ? 26 : 16);
        if (p.x + r < v.x0 || p.x - r > v.x1 || p.y + r < v.y0 || p.y - r > v.y1) continue;
        const a = (p.kind === 'cig' ? 0.5 : p.kind === 'kiln' ? 0.42 : 0.3) * (1 - u) * Math.min(1, u * 6) * (dark > 0.5 && p.kind !== 'cig' ? 0.75 : 1);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(p.kind === 'kiln' ? kilnCol : p.kind === 'factory' ? steam : cig, p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* =================== Sky: rain, storms, lightning, fog, smog, cloud shadows and sunlight =================== */
  /* a forked lightning bolt: a jagged main stroke from (x0,y0) down to (x1,y1) with side branches */
  function makeBolt(x0, y0, x1, y1, rnd) {
    const main = [[x0, y0]], branches = [];
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(6, Math.round(len / 11));
    let jit = len * 0.045;
    for (let i = 1; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u + (i === n ? 0 : (rnd() - 0.5) * jit * 2), y = y0 + (y1 - y0) * u + (rnd() - 0.5) * jit * 0.4;
      main.push([x, y]);
      if (i > 2 && i < n - 1 && rnd() < 0.3) {
        const br = [[x, y]], dir = rnd() < 0.5 ? -1 : 1, m = 3 + Math.floor(rnd() * 6);
        let bx = x, by = y;
        for (let k = 0; k < m; k++) { bx += dir * (6 + rnd() * 14); by += 5 + rnd() * 13; br.push([bx, by]); }
        branches.push(br);
      }
    }
    return { main, branches };
  }
  class Sky {
    constructor() {
      this.nextBolt = 0; this.bolts = []; this.sheets = []; this.seen = 0; this.app = null;
      const r = new Random(4242);
      this.banks = []; for (let i = 0; i < 16; i++) this.banks.push({ x: r.range(0, WORLD_W), y: r.range(0, WORLD_H), rx: r.range(120, 260), ry: r.range(60, 130), a: r.range(0.5, 1) });
      this.clouds = []; for (let i = 0; i < 7; i++) this.clouds.push({ x: r.range(0, WORLD_W), y: r.range(0, WORLD_H), rx: r.range(90, 180), ry: r.range(50, 100) });
      this.off = { x: 0, y: 0 };
      this.layers = [{ k: 0, sp: 480, len: 6, w: 0.6, a: 0.2, p: [] }, { k: 1, sp: 760, len: 11, w: 0.9, a: 0.32, p: [] }, { k: 2, sp: 1100, len: 19, w: 1.4, a: 0.5, p: [] }];
      this.ripples = []; this.lastScreen = 0; this.wetAt = -1e9; this.rbAt = -1e9; this.rbDone = true;
      this.flakes = [];
    }
    /* how bright the sky is right now because of lightning (0..1) */
    envelope(t) { return t < 0 ? 0 : t < 70 ? 1 : t < 115 ? 0.3 : t < 200 ? 0.9 : Math.max(0, 1 - (t - 200) / 280); }
    flashNow(now) { let f = 0; for (const b of this.bolts) f = Math.max(f, this.envelope(now - b.t) * b.power); for (const s of this.sheets) f = Math.max(f, this.envelope(now - s.t) * 0.45); return f; }
    /* world-space layers: wet streets, puddles, splashes, cloud shadows, fog banks, smog haze, lightning on the ground */
    drawWorld(ctx, world, P, now, dt, v, dark, D) {
      const rain = world.rain, fog = world.fog, aqi = world.aqi, app = this.app;
      const k = ctx.getTransform().a / (window.devicePixelRatio || 1) || 1;
      const sp = Math.hypot(world.windX, world.windY) || 1;
      this.off.x += (world.windX / sp) * dt * 0.006 * (1 + rain * 2); this.off.y += (world.windY / sp) * dt * 0.006 * (1 + rain * 2);
      const wrap = (x, L) => ((x % L) + L) % L;
      if (rain > 0.05) {
        // wet asphalt: darker, with a faint sheen
        ctx.fillStyle = `rgba(14,26,44,${0.14 * rain})`; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
        ctx.fillStyle = `rgba(8,16,30,${0.2 * Math.min(1, rain * 1.3)})`;
        for (const X of ROAD_X) { const h = roadHalf(X === MAIN_X); if (X + h > v.x0 && X - h < v.x1) ctx.fillRect(X - h, 0, h * 2, CITY_H); }
        for (const Y of ROAD_Y) { const h = roadHalf(Y === MAIN_Y); if (Y + h > v.y0 && Y - h < v.y1) ctx.fillRect(0, Y - h, CITY_W, h * 2); }
        // puddles: filled with the sky, bigger when the drains are full
        const pr = 1 + world.flood * 1.6;
        ctx.fillStyle = P.night ? `rgba(70,95,140,${0.16 + 0.3 * rain})` : `rgba(130,160,195,${0.2 + 0.3 * rain})`;
        ctx.beginPath();
        for (const pd of D.puddles) { if (pd.x < v.x0 - 6 || pd.x > v.x1 + 6 || pd.y < v.y0 - 6 || pd.y > v.y1 + 6) continue; ctx.moveTo(pd.x + pd.r * pr, pd.y); ctx.ellipse(pd.x, pd.y, pd.r * pr, pd.r * 0.62 * pr, 0, 0, TAU); }
        ctx.fill();
        // street lamps reflected in wet roads
        if (P.night && world.en && world.en.lightsOn) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (const l of D.lamps) {
            if (l.x < v.x0 - 6 || l.x > v.x1 + 6 || l.y < v.y0 - 12 || l.y > v.y1 + 12) continue;
            const g = ctx.createLinearGradient(0, l.y, 0, l.y + 10); g.addColorStop(0, `rgba(255,225,160,${0.22 * Math.min(1, rain * 1.4)})`); g.addColorStop(1, 'rgba(255,225,160,0)');
            ctx.fillStyle = g; ctx.fillRect(l.x - 0.9, l.y, 1.8, 10);
          }
          ctx.restore();
        }
        // raindrop splashes: rings that grow and fade
        if (!reduceMotion) {
          const area = Math.max(0.05, Math.min(1, ((v.x1 - v.x0) * (v.y1 - v.y0)) / 600000));
          let spawn = rain * rain * 9 * area * dt / 16.7;
          while (spawn > 0 && this.ripples.length < 220) { if (Math.random() < Math.min(1, spawn)) this.ripples.push({ x: v.x0 + Math.random() * (v.x1 - v.x0), y: v.y0 + Math.random() * (v.y1 - v.y0), t: now, life: 380 + Math.random() * 420 }); spawn -= 1; }
          const sc = Math.max(1, 1.1 / k);
          ctx.lineWidth = Math.max(0.25, 0.5 / k); ctx.strokeStyle = P.night ? '#b6cdee' : '#eaf2fb';
          let w = 0;
          for (const r of this.ripples) {
            const u = (now - r.t) / r.life;
            if (u >= 1 || r.x < v.x0 - 5 || r.x > v.x1 + 5 || r.y < v.y0 - 5 || r.y > v.y1 + 5) { if (u < 1) this.ripples[w++] = r; continue; }
            this.ripples[w++] = r;
            ctx.globalAlpha = (1 - u) * 0.6 * Math.min(1, rain + 0.2);
            ctx.beginPath(); ctx.ellipse(r.x, r.y, (0.5 + 1.9 * u) * sc, (0.5 + 1.9 * u) * 0.6 * sc, 0, 0, TAU); ctx.stroke();
          }
          this.ripples.length = w; ctx.globalAlpha = 1;
        }
      }
      const snow = world.snow || 0;
      if (snow > 0.02) {
        // snow settling on the ground: whitens roofs and roads, more where it has had time to pile up
        ctx.fillStyle = `rgba(232,240,250,${0.1 * snow})`; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
        ctx.fillStyle = `rgba(244,249,255,${0.3 * snow})`;
        for (const X of ROAD_X) { const h = roadHalf(X === MAIN_X); if (X + h > v.x0 && X - h < v.x1) ctx.fillRect(X - h, 0, h * 2, CITY_H); }
        for (const Y of ROAD_Y) { const h = roadHalf(Y === MAIN_Y); if (Y + h > v.y0 && Y - h < v.y1) ctx.fillRect(0, Y - h, CITY_W, h * 2); }
      }
      if (dark < 0.5 && fog < 0.3) {
        const a = 0.13 + rain * 0.18;
        for (const c of this.clouds) {
          const x = wrap(c.x + this.off.x * 30, WORLD_W + 400) - 200, y = wrap(c.y + this.off.y * 30, WORLD_H + 300) - 150;
          if (x + c.rx < v.x0 || x - c.rx > v.x1 || y + c.ry < v.y0 || y - c.ry > v.y1) continue;
          const g = ctx.createRadialGradient(x, y, 0, x, y, c.rx);
          g.addColorStop(0, `rgba(20,30,40,${a})`); g.addColorStop(0.55, `rgba(20,30,40,${a * 0.6})`); g.addColorStop(1, 'rgba(20,30,40,0)');
          ctx.save(); ctx.translate(x, y); ctx.scale(1, c.ry / c.rx); ctx.translate(-x, -y);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, c.rx, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
      const haze = Math.max(0, Math.min(0.34, (aqi - 110) / 650));
      if (haze > 0) { ctx.fillStyle = `rgba(${P.night ? '110,90,60' : '150,120,70'},${haze})`; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); }
      if (fog > 0.03) {
        const base = P.night ? '78,88,100' : '232,235,238';
        ctx.fillStyle = `rgba(${base},${(P.night ? 0.5 : 0.58) * fog})`; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
        for (const b of this.banks) {
          const x = wrap(b.x + this.off.x * 40, WORLD_W + 500) - 250, y = wrap(b.y + this.off.y * 40, WORLD_H + 300) - 150;
          if (x + b.rx < v.x0 || x - b.rx > v.x1 || y + b.ry < v.y0 || y - b.ry > v.y1) continue;
          const g = ctx.createRadialGradient(x, y, 0, x, y, b.rx);
          g.addColorStop(0, `rgba(${base},${0.62 * fog * b.a})`); g.addColorStop(1, `rgba(${base},0)`);
          ctx.save(); ctx.translate(x, y); ctx.scale(1, b.ry / b.rx); ctx.translate(-x, -y);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.rx, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
      // lightning that really struck the city (the model decided where; it can burn out a transformer or start a fire)
      if (world.strikeSeq < this.seen) this.seen = world.strikeSeq;
      if (world.strikeSeq > this.seen) {
        for (const s of world.strikes) {
          if (s.id <= this.seen) continue;
          if (world.tick - s.tick < 40 && !reduceMotion && now - (this.lastWB || 0) > 450 && v && s.x > v.x0 - 60 && s.x < v.x1 + 60 && s.y > v.y0 - 60 && s.y < v.y1 + 140) {
            this.lastWB = now;
            const b = makeBolt(s.x + (Math.random() - 0.5) * 70, s.y - 170 - Math.random() * 80, s.x, s.y, Math.random);
            this.bolts.push({ t: now, world: true, x: s.x, y: s.y, bolt: b, power: 1, effect: s.effect });
            if (app && app.sfx) setTimeout(() => app.sfx.play('thunder'), 120 + Math.random() * 420);
          }
        }
        this.seen = world.strikeSeq;
      }
      for (const b of this.bolts) {
        if (!b.world) continue;
        const t = now - b.t;
        if (t > 700) continue;
        const e = this.envelope(t);
        if (e <= 0.02) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 110); g.addColorStop(0, `rgba(190,215,255,${0.5 * e})`); g.addColorStop(1, 'rgba(190,215,255,0)');
        ctx.fillStyle = g; ctx.fillRect(b.x - 110, b.y - 110, 220, 220);
        const pass = (w, col, a) => {
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(w * 0.5, w / k * 0.9); ctx.globalAlpha = a * e;
          ctx.beginPath(); b.bolt.main.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          for (const br of b.bolt.branches) br.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.stroke();
        };
        pass(7, '#6f9bff', 0.35); pass(3.2, '#bcd4ff', 0.6); pass(1.3, '#ffffff', 1);
        ctx.globalAlpha = e; ctx.strokeStyle = '#e6efff'; ctx.lineWidth = Math.max(0.4, 0.7 / k);
        for (let i = 0; i < 7; i++) { const a = Math.random() * TAU, r1 = 2 + Math.random() * 6, r2 = r1 + 3 + Math.random() * 8; ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1 * 0.6); ctx.lineTo(b.x + Math.cos(a) * r2, b.y + Math.sin(a) * r2 * 0.6); ctx.stroke(); }
        ctx.restore();
      }
    }
    /* screen-space layers: falling rain, vignette, sheet and bolt lightning, rainbow, golden hour */
    drawScreen(ctx, W, H, world, now, app) {
      this.app = app;
      const rain = world.rain, dt = Math.min(60, this.lastScreen ? now - this.lastScreen : 16); this.lastScreen = now;
      const night = app.darkness() > 0.5, play = app.playing && !reduceMotion;
      if (rain > 0.05 && !reduceMotion) {
        // three layers of drops at different depths: far ones short and faint, near ones long and bright
        const slope = Math.max(-0.5, Math.min(0.5, (world.windX || 0) / 45)), nTot = Math.round((70 + 520 * rain) * Math.max(0.35, Math.min(1.6, (W * H) / 600000)));
        const shares = [0.42, 0.38, 0.2];
        const col = night ? '190,214,245' : '78,104,138';
        for (let li = 0; li < 3; li++) {
          const L = this.layers[li], want = Math.round(nTot * shares[li]);
          while (L.p.length < want) L.p.push({ x: Math.random() * (W + 80) - 40, y: Math.random() * (H + 60) - 30 });
          if (L.p.length > want) L.p.length = want;
          const step = play ? L.sp * dt / 1000 : 0, len = L.len * (0.6 + rain * 0.7);
          ctx.strokeStyle = `rgba(${col},${Math.min(0.85, L.a * 1.35 * (0.55 + 0.6 * rain))})`; ctx.lineWidth = L.w; ctx.beginPath();
          for (const d of L.p) {
            d.y += step; d.x += step * slope;
            if (d.y > H + 20) { d.y = -len - Math.random() * 20; d.x = Math.random() * (W + 80) - 40; }
            if (d.x > W + 40) d.x -= W + 80; else if (d.x < -40) d.x += W + 80;
            ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + slope * len, d.y + len);
          }
          ctx.stroke();
        }
        // heavy rain: a grey-blue vignette closes in and mist hangs near the ground
        if (rain > 0.4) {
          const a = Math.min(0.32, (rain - 0.4) * 0.5), vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
          vg.addColorStop(0, 'rgba(16,26,42,0)'); vg.addColorStop(1, `rgba(16,26,42,${a})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        }
        this.wetAt = now;
        this.rbDone = false;
      }
      // rain sound follows the rain
      if (app.sfx && app.sfx.setRain) app.sfx.setRain(app.playing ? rain : 0);
      // ---- falling snow: slow drifting flakes, denser and whiter than rain
      const snow = world.snow || 0;
      if (snow > 0.02 && !reduceMotion) {
        const want = Math.round((40 + 260 * snow) * Math.max(0.35, Math.min(1.6, (W * H) / 600000)));
        while (this.flakes.length < want) this.flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.4, sp: 18 + Math.random() * 30, sw: Math.random() * TAU, swa: 8 + Math.random() * 18 });
        if (this.flakes.length > want) this.flakes.length = want;
        const col = night ? '255,255,255' : '250,252,255';
        ctx.fillStyle = `rgba(${col},0.82)`;
        for (const f of this.flakes) {
          if (play) { f.y += f.sp * dt / 1000; f.sw += dt / 900; f.x += Math.sin(f.sw) * f.swa * dt / 1000 + (world.windX || 0) * 0.04; }
          if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
          if (f.x > W + 6) f.x -= W + 12; else if (f.x < -6) f.x += W + 12;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        }
      }
      // ---- lightning: distant sheet flashes and forked bolts
      if (world.storm && play && now > this.nextBolt) {
        this.nextBolt = now + 2200 + Math.random() * 6000;
        const far = Math.random() < 0.45;
        if (far) {
          this.sheets.push({ t: now, x: Math.random() * W, y: Math.random() * H * 0.4 });
          setTimeout(() => app.sfx.play('thunder'), 500 + Math.random() * 900);
        } else {
          const x0 = Math.random() * W, y1 = H * (0.45 + Math.random() * 0.4);
          this.bolts.push({ t: now, world: false, bolt: makeBolt(x0 + (Math.random() - 0.5) * 80, -8, x0, y1, Math.random), x: x0, y: y1, power: 0.7 + Math.random() * 0.3 });
          setTimeout(() => app.sfx.play('thunder'), 250 + Math.random() * 700);
        }
      }
      this.bolts = this.bolts.filter((b) => now - b.t < 800); this.sheets = this.sheets.filter((s) => now - s.t < 800);
      const fl = this.flashNow(now);
      if (fl > 0.02) {
        ctx.fillStyle = `rgba(214,226,255,${(night ? 0.36 : 0.22) * fl})`; ctx.fillRect(0, 0, W, H);
        for (const s of this.sheets) {
          const e = this.envelope(now - s.t) * 0.45; if (e < 0.02) continue;
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, W * 0.5); g.addColorStop(0, `rgba(235,240,255,${0.7 * e})`); g.addColorStop(1, 'rgba(235,240,255,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        for (const b of this.bolts) {
          if (b.world) continue;
          const e = this.envelope(now - b.t) * b.power; if (e < 0.02) continue;
          ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
          const stroke = (w, c, a) => {
            ctx.strokeStyle = c; ctx.lineWidth = w; ctx.globalAlpha = a * e; ctx.beginPath();
            b.bolt.main.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            for (const br of b.bolt.branches) br.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.stroke();
          };
          stroke(9, '#5f8cff', 0.28); stroke(4, '#b5ceff', 0.55); stroke(1.8, '#ffffff', 1);
          ctx.restore();
        }
      }
      // ---- rainbow after the rain, on a bright day
      if (!this.rbDone && rain < 0.08 && now - this.wetAt < 9000 && app.darkness() < 0.3 && world.fog < 0.2) { this.rbDone = true; this.rbAt = now; }
      const rbT = now - this.rbAt;
      if (rbT >= 0 && rbT < 32000 && app.darkness() < 0.5) {
        const e = Math.min(1, rbT / 4000) * Math.min(1, (32000 - rbT) / 8000), cx = W * 0.5, cy = H * 1.12, R = Math.min(W * 0.62, H * 1.25), bw = Math.max(3, R * 0.022);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineWidth = bw;
        ['#ff4d4d', '#ff9f4a', '#ffe14d', '#5fd16a', '#4db8ff', '#5b6cff', '#a55bff'].forEach((c, i) => { ctx.strokeStyle = rgba(c, 0.32 * e); ctx.beginPath(); ctx.arc(cx, cy, R - i * bw * 0.95, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); });
        ctx.restore();
      }
      if (app.light === 'auto') {
        const m = world.minute;
        const g = Math.max(0, 1 - Math.abs(m - 380) / 75) + Math.max(0, 1 - Math.abs(m - 1110) / 80);
        if (g > 0.01) {
          ctx.save(); ctx.globalCompositeOperation = 'soft-light';
          ctx.fillStyle = `rgba(255,135,40,${0.55 * g})`; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'screen';
          const sx = m < 720 ? W * 1.05 : -W * 0.05;
          const gr = ctx.createRadialGradient(sx, H * 0.15, 0, sx, H * 0.15, W * 0.7);
          gr.addColorStop(0, `rgba(255,190,110,${0.28 * g})`); gr.addColorStop(1, 'rgba(255,190,110,0)');
          ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }
    }
  }

  /* =================== AirLayer: the air pollution map =================== */
  class AirLayer {
    constructor() { this.cv = document.createElement('canvas'); this.cv.width = PCOLS; this.cv.height = PROWS; this.c2 = this.cv.getContext('2d'); this.last = -1; }
    draw(ctx, world, P) {
      if (world.tick !== this.last) {
        this.last = world.tick;
        const img = this.c2.createImageData(PCOLS, PROWS), d = img.data, A = world.pol;
        const stops = [[0, [46, 230, 161]], [50, [46, 230, 161]], [100, [242, 201, 76]], [150, [255, 138, 76]], [200, [255, 77, 79]], [300, [177, 76, 222]], [400, [122, 30, 70]]];
        for (let i = 0; i < A.length; i++) {
          const q = aqiFromPm(A[i]);
          let c = stops[stops.length - 1][1];
          for (let k = 1; k < stops.length; k++) if (q <= stops[k][0]) { const [a0, c0] = stops[k - 1], [a1, c1] = stops[k], u = (q - a0) / (a1 - a0); c = [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u]; break; }
          d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = Math.min(190, 40 + q * 0.45);
        }
        this.c2.putImageData(img, 0, 0);
      }
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = P.night ? 0.55 : 0.45;
      ctx.drawImage(this.cv, 0, 0, WORLD_W, WORLD_H);
      ctx.restore();
    }
  }

  /* =================== Renderer: the live map =================== */
  const CACHE_SCALE = 2;
  function glowSprite(hex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(hex, 0.85)); gr.addColorStop(0.3, rgba(hex, 0.38)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const RIG_COL = { fire: '#c1272d', waste: '#3d7a4f', crew: '#e9a820', hearse: '#2b2b30', van: '#f0f0f0' };
  function drawRig(ctx, r, P, dark, now) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.heading);
    const L = r.kind === 'fire' ? 11 : r.kind === 'waste' ? 10 : r.kind === 'hearse' ? 8.5 : 7, Wd = r.kind === 'fire' || r.kind === 'waste' ? 4.2 : 3.4;
    if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(-L / 2 + 0.8, -Wd / 2 + 1, L, Wd); }
    ctx.fillStyle = RIG_COL[r.kind] || '#999'; ctx.beginPath(); rrect(ctx, -L / 2, -Wd / 2, L, Wd, 1); ctx.fill();
    ctx.fillStyle = P.carGlass; ctx.fillRect(L / 2 - 2.2, -Wd / 2 + 0.6, 1.3, Wd - 1.2);
    if (r.kind === 'fire') { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-L / 2 + 1, -0.4, L - 4.5, 0.8); }
    if (r.kind === 'waste') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-L / 2 + 1, -Wd / 2 + 0.6, L - 4.5, Wd - 1.2); }
    if (r.kind === 'hearse') { ctx.fillStyle = '#d8d8d8'; ctx.fillRect(-L / 2 + 1, -Wd / 2 + 0.7, L - 4.2, Wd - 1.4); }
    if (r.kind === 'van') { ctx.fillStyle = '#e9a820'; ctx.fillRect(-L / 2 + 1, -Wd / 2, 0.8, Wd); }
    if ((r.siren || r.kind === 'fire' && r.state !== 'idle') && !reduceMotion) {
      const on = Math.floor(now / 160) % 2 === 0;
      ctx.fillStyle = on ? '#ff3030' : '#3a7bff'; ctx.beginPath(); ctx.arc(0, 0, 1.1, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 9); g.addColorStop(0, on ? 'rgba(255,50,50,0.5)' : 'rgba(60,120,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(-9, -9, 18, 18); ctx.globalCompositeOperation = 'source-over';
    } else if (dark > 0.3 && r.state !== 'idle') { ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.fillRect(L / 2 - 0.4, -Wd / 2 + 0.3, 0.6, 0.8); ctx.fillRect(L / 2 - 0.4, Wd / 2 - 1.1, 0.6, 0.8); }
    ctx.restore();
  }
  function drawBusVeh(ctx, b, P, dark) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.heading);
    const L = 13, Wd = 4.4;
    if (P.shadow) { ctx.fillStyle = P.shadow; ctx.fillRect(-L / 2 + 0.8, -Wd / 2 + 1, L, Wd); }
    ctx.fillStyle = b.route.color; ctx.beginPath(); rrect(ctx, -L / 2, -Wd / 2, L, Wd, 1.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-L / 2 + 1.2, -Wd / 2 + 0.7, L - 4.5, 0.9); ctx.fillRect(-L / 2 + 1.2, Wd / 2 - 1.6, L - 4.5, 0.9);
    ctx.fillStyle = P.carGlass; ctx.fillRect(L / 2 - 1.8, -Wd / 2 + 0.6, 1.2, Wd - 1.2);
    ctx.fillStyle = '#222'; ctx.font = `700 2.6px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.route.id + 1), -0.5, 0);
    if (dark > 0.3) { ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.fillRect(L / 2 - 0.5, -Wd / 2 + 0.4, 0.7, 0.9); ctx.fillRect(L / 2 - 0.5, Wd / 2 - 1.3, 0.7, 0.9); }
    ctx.restore();
  }
  class Renderer {
    constructor(app) {
      this.app = app;
      this.cv = $('#world'); this.ctx = this.cv.getContext('2d');
      this.mm = $('#minimap'); this.mctx = this.mm.getContext('2d');
      this.caches = {}; this.minis = {};
      this.W = 0; this.H = 0; this.dpr = 1; this.frame = 0;
      this.glow = { night: { I: glowSprite(PAL.night.agents.I), E: glowSprite(PAL.night.agents.E) }, day: { I: glowSprite(PAL.day.agents.I), E: glowSprite(PAL.day.agents.E) } };
      this.occ = new Uint16Array(4096);
      this.smoke = new Smoke(); this.sky = new Sky(); this.air = new AirLayer(); this.lastNow = 0;
    }
    invalidate() { this.caches = {}; this.minis = {}; }
    cache(mode) {
      if (!this.caches[mode]) {
        const c = document.createElement('canvas');
        c.width = WORLD_W * CACHE_SCALE; c.height = WORLD_H * CACHE_SCALE;
        const g = c.getContext('2d');
        g.setTransform(CACHE_SCALE, 0, 0, CACHE_SCALE, 0, 0);
        paintCity(g, this.app.world, this.app.decor, PAL[mode], null);
        this.caches[mode] = c;
        const m = document.createElement('canvas'); m.width = 340; m.height = Math.round(340 * WORLD_H / WORLD_W);
        const mg = m.getContext('2d'); mg.imageSmoothingQuality = 'high'; mg.drawImage(c, 0, 0, m.width, m.height);
        this.minis[mode] = m;
      }
      return this.caches[mode];
    }
    resize() {
      const w = this.cv.clientWidth;
      if (!w) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), h = w * WORLD_H / WORLD_W;
      if (w !== this.W || dpr !== this.dpr) {
        this.W = w; this.H = h; this.dpr = dpr;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
        this.app.cam.setSize(w, h);
      }
      return true;
    }
    /* ---- v8: the amusement park, the construction site, the Sky Tower, Wi-Fi are drawn live ---- */
    drawVenues(ctx, world, v, dark, now, px) {
      const p = world.params, m = world.minuteNow;
      // ---- Funland: ferris wheel, carousel, roller-coaster, swings
      const A = world.amusement;
      if (A && vis(v, A.cx, A.cy, 70)) {
        const R = A.block.rect, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2;
        const open = p.amusementOpen && m >= 900 && m < 1410 && world.rain < 0.3 && !world.storm;
        const nR = p.amusementRides, on = (i) => open && i < Math.ceil(nR / 2.4);
        const ang = now / 5200, bulbs = dark || m >= 1050;
        // ferris wheel
        const wx = cx - 14, wy = cy - 12, wr = 21;
        ctx.strokeStyle = on(0) ? '#cdd6df' : '#6b7683'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(wx, wy, wr * 0.55, 0, TAU); ctx.stroke();
        const a0 = on(0) ? ang : 0.3;
        for (let i = 0; i < 12; i++) {
          const a = a0 + i * TAU / 12, ex = wx + Math.cos(a) * wr, ey = wy + Math.sin(a) * wr;
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.fillStyle = bulbs && on(0) ? `hsl(${(i * 30 + now / 30) % 360},90%,62%)` : ['#c0392b', '#d4a017', '#2a7fb8', '#3b9d5a'][i % 4];
          ctx.beginPath(); ctx.arc(ex, ey, 1.7, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#9aa5b1'; ctx.beginPath(); ctx.arc(wx, wy, 1.8, 0, TAU); ctx.fill();
        // carousel
        const kx = cx + 24, ky = cy + 22, ka = on(1) ? now / 1800 : 0;
        ctx.fillStyle = bulbs && on(1) ? 'rgba(255,230,160,0.35)' : 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(kx, ky, 11, 0, TAU); ctx.fill();
        for (let i = 0; i < 6; i++) { const a = ka + i * TAU / 6; ctx.fillStyle = ['#e74c3c', '#f1c40f', '#3498db'][i % 3]; ctx.beginPath(); ctx.arc(kx + Math.cos(a) * 7, ky + Math.sin(a) * 7, 1.5, 0, TAU); ctx.fill(); }
        ctx.fillStyle = on(1) ? '#e84393' : '#7a5870'; ctx.beginPath(); ctx.arc(kx, ky, 3.2, 0, TAU); ctx.fill();
        // roller-coaster loop with moving cars
        const lx = cx + 20, ly = cy - 22, lw = 26, lh = 14;
        ctx.strokeStyle = '#b8403a'; ctx.lineWidth = 1.2; ctx.beginPath(); rrect(ctx, lx - lw / 2, ly - lh / 2, lw, lh, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.4; ctx.beginPath(); rrect(ctx, lx - lw / 2 + 1.5, ly - lh / 2 + 1.5, lw - 3, lh - 3, 5.5); ctx.stroke();
        if (on(2)) for (let i = 0; i < 4; i++) {
          const u = ((now / 3400) + i * 0.035) % 1, per = 2 * (lw - 14) + 2 * (lh - 14) + 2 * Math.PI * 7;
          let d = u * per, x, y; const sx = lw - 14, sy = lh - 14, cr = 7;
          if (d < sx) { x = lx - sx / 2 + d; y = ly - lh / 2; } else if ((d -= sx) < Math.PI * cr / 2 * 1) { const a = -Math.PI / 2 + d / cr; x = lx + sx / 2 + Math.cos(a) * cr; y = ly - sy / 2 + Math.sin(a) * cr; }
          else if ((d -= Math.PI * cr / 2) < sy) { x = lx + lw / 2; y = ly - sy / 2 + d; } else if ((d -= sy) < Math.PI * cr / 2) { const a = d / cr; x = lx + sx / 2 + Math.cos(a) * cr; y = ly + sy / 2 + Math.sin(a) * cr; }
          else if ((d -= Math.PI * cr / 2) < sx) { x = lx + sx / 2 - d; y = ly + lh / 2; } else if ((d -= sx) < Math.PI * cr / 2) { const a = Math.PI / 2 + d / cr; x = lx - sx / 2 + Math.cos(a) * cr; y = ly + sy / 2 + Math.sin(a) * cr; }
          else if ((d -= Math.PI * cr / 2) < sy) { x = lx - lw / 2; y = ly + sy / 2 - d; } else { d -= sy; const a = Math.PI + d / cr; x = lx - sx / 2 + Math.cos(a) * cr; y = ly - sy / 2 + Math.sin(a) * cr; }
          ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
        }
        // swing ride
        const sx2 = cx - 26, sy2 = cy + 24;
        ctx.fillStyle = on(3) ? '#8e6bd1' : '#5d5470'; ctx.beginPath(); ctx.arc(sx2, sy2, 3, 0, TAU); ctx.fill();
        for (let i = 0; i < 6; i++) { const a = (on(3) ? now / 900 : 0) + i * TAU / 6; ctx.fillStyle = '#e6e9ee'; ctx.beginPath(); ctx.arc(sx2 + Math.cos(a) * (on(3) ? 8 : 5), sy2 + Math.sin(a) * (on(3) ? 8 : 5), 1.1, 0, TAU); ctx.fill(); }
        if (bulbs && open) { const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, 70); g.addColorStop(0, 'rgba(255,190,90,0.22)'); g.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 70, cy - 70, 140, 140); }
        if (!open && p.amusementOpen && (world.rain >= 0.3 || world.storm)) { ctx.fillStyle = '#ffb020'; ctx.font = `bold ${5}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('CLOSED: WEATHER', cx, cy + 4); }
      }
      // ---- construction site: crane, rising tower, dust
      const C = world.construction;
      if (C && vis(v, C.cx, C.cy, 70)) {
        const R = C.block.rect, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2, st = world.cons;
        if (p.constructionOn) {
          const fl = st.floors, bx = cx - 20, by = cy - 12, bw = 36, bh = 30;
          if (fl > 0.2) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 2 + fl * 0.45, by + 3 + fl * 0.45, bw, bh);
            ctx.fillStyle = st.done ? '#7fa1c4' : '#8c8f94'; ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.5; ctx.beginPath();
            for (let i = 1; i < 6; i++) { ctx.moveTo(bx + i * bw / 6, by); ctx.lineTo(bx + i * bw / 6, by + bh); } ctx.stroke();
            if (!st.done) { ctx.strokeStyle = '#e0b030'; ctx.lineWidth = 0.7; ctx.strokeRect(bx - 1.5, by - 1.5, bw + 3, bh + 3); }
            ctx.fillStyle = '#fff'; ctx.font = '4.5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${Math.floor(fl)} floors`, bx + bw / 2, by + bh / 2 + 1.5);
          } else { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([2, 2]); ctx.strokeRect(bx, by, bw, bh); ctx.setLineDash([]); }
          // crane
          const px0 = cx + 24, py0 = cy - 22, ca = st.working ? -0.9 + 0.7 * Math.sin(now / 2600) : -0.9;
          ctx.strokeStyle = '#f2b01e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0 + Math.cos(ca) * 40, py0 + Math.sin(ca) * 40); ctx.stroke();
          ctx.strokeStyle = '#f2b01e'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0 - Math.cos(ca) * 12, py0 - Math.sin(ca) * 12); ctx.stroke();
          ctx.fillStyle = '#c8861a'; ctx.beginPath(); ctx.arc(px0, py0, 2.4, 0, TAU); ctx.fill();
          ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(px0 + Math.cos(ca) * 30, py0 + Math.sin(ca) * 30, 1.1, 0, TAU); ctx.fill();
          if (dark) { ctx.fillStyle = (now % 1200 < 600) ? '#ff3b30' : '#661a16'; ctx.beginPath(); ctx.arc(px0 + Math.cos(ca) * 40, py0 + Math.sin(ca) * 40, 1.3, 0, TAU); ctx.fill(); }
          // workers and dust
          if (st.working) {
            const nW = Math.min(14, Math.round(p.constructionWorkers / 6));
            for (let i = 0; i < nW; i++) { const a = now / (1500 + i * 130) + i; ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (14 + (i % 4) * 5), cy + 10 + Math.sin(a * 1.3) * (10 + (i % 3) * 3), 0.9, 0, TAU); ctx.fill(); }
            const dust = p.dustControl ? 0.5 : 1.3;
            for (let i = 0; i < 9; i++) { const u = ((now / 3000) + i / 9) % 1; ctx.fillStyle = `rgba(190,165,120,${(1 - u) * 0.3 * dust})`; ctx.beginPath(); ctx.arc(cx - 12 + (i * 11) % 30 + u * 12, cy - 4 - u * 22, 5 + u * 14 * dust, 0, TAU); ctx.fill(); }
            if (p.dustControl) { ctx.strokeStyle = 'rgba(120,190,230,0.55)'; ctx.lineWidth = 0.5; for (let i = 0; i < 5; i++) { const a = now / 700 + i; ctx.beginPath(); ctx.moveTo(cx - 24 + i * 12, cy + 26); ctx.lineTo(cx - 24 + i * 12 + Math.cos(a) * 3, cy + 16); ctx.stroke(); } }
          }
        } else { ctx.fillStyle = '#d9a21b'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SITE CLOSED', cx, cy + 2); }
      }
      // ---- Sky Tower: a tall glass tower with a long shadow and a red beacon
      const K = world.sky;
      if (K && vis(v, K.cx, K.cy, 70)) {
        const R = K.block.rect, t = { x0: R.x0 + 15, y0: R.y0 + 15, x1: R.x1 - 15, y1: R.y1 - 15 }, fl = p.skyFloors, sh = fl * 0.42;
        ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.moveTo(t.x0, t.y1); ctx.lineTo(t.x0 + sh, t.y1 + sh); ctx.lineTo(t.x1 + sh, t.y1 + sh); ctx.lineTo(t.x1 + sh, t.y0 + sh); ctx.lineTo(t.x1, t.y0); ctx.lineTo(t.x1, t.y1); ctx.closePath(); ctx.fill();
        const g = ctx.createLinearGradient(t.x0, t.y0, t.x1, t.y1); g.addColorStop(0, dark ? '#1c3550' : '#8fc4e8'); g.addColorStop(1, dark ? '#0f2236' : '#4f86b3');
        ctx.fillStyle = g; ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
        ctx.strokeStyle = dark ? 'rgba(255,220,140,0.55)' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.4; ctx.beginPath();
        for (let x = t.x0 + 4; x < t.x1; x += 4) { ctx.moveTo(x, t.y0); ctx.lineTo(x, t.y1); } for (let y = t.y0 + 4; y < t.y1; y += 4) { ctx.moveTo(t.x0, y); ctx.lineTo(t.x1, y); } ctx.stroke();
        const mx = (t.x0 + t.x1) / 2, my = (t.y0 + t.y1) / 2;
        ctx.strokeStyle = '#d9dde3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
        ctx.fillStyle = '#e8ecf0'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('H', mx, my + 2);
        ctx.fillStyle = (now % 1500 < 750) ? '#ff3b30' : '#6a1c18'; ctx.beginPath(); ctx.arc(t.x1 - 3, t.y0 + 3, 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '4.5px sans-serif'; ctx.fillText(`SKY TOWER · ${fl}F`, mx, t.y1 - 3);
      }
    }
    drawSeasonTint(ctx, world, dark) {
      const k = world.season.key, c = { spring: 'rgba(120,220,120,0.035)', summer: 'rgba(255,170,60,0.07)', autumn: 'rgba(224,138,60,0.045)', winter: 'rgba(130,180,255,0.09)' }[k];
      ctx.fillStyle = c; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    drawSatellite(ctx, world, v, now, px) {
      const S = world.sat, p = world.params;
      ctx.fillStyle = 'rgba(10,70,60,0.2)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.strokeStyle = 'rgba(120,255,200,0.14)'; ctx.lineWidth = Math.max(0.3, px * 0.6); ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); } for (let y = 0; y <= WORLD_H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); } ctx.stroke();
      const sx = (now / 12) % (WORLD_W + 200) - 100; const g = ctx.createLinearGradient(sx - 60, 0, sx, 0); g.addColorStop(0, 'rgba(120,255,200,0)'); g.addColorStop(1, 'rgba(120,255,200,0.22)'); ctx.fillStyle = g; ctx.fillRect(sx - 60, 0, 60, WORLD_H);
      KILN_SITES.forEach((k, i) => {
        if (!vis(v, k.x, k.y, 40)) return;
        const st = S.kilns[i] || {}, on = world.kilnOn(i), seen = st.seen, hot = st.hot;
        const col = !S.passes ? '#7c8896' : !seen ? '#7c8896' : hot ? '#ff4d4f' : '#46c6e6';
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.7, px * 1.2); if (!seen) ctx.setLineDash([3, 3]);
        ctx.strokeRect(k.x - 32, k.y - 20, 64, 40); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.font = `bold ${Math.max(5, 7)}px sans-serif`; ctx.textAlign = 'left';
        ctx.fillText(`K${i + 1} ${!S.passes ? '' : !seen ? 'NOT SEEN' : hot ? 'HOT' : 'COLD'} ${S.passes && seen && i < p.kilns ? (st.predZig ? 'ZIGZAG?' : 'FCBK?') : ''}${i >= p.kilns ? ' (none)' : on ? '' : ' (stopped)'}`, k.x - 32, k.y - 23);
      });
    }
    drawServices(ctx, world, P, v, dark, now, night, px, big) {
      const p = world.params, en = world.en;
      // graves in use
      for (const g of world.graveyard.graveSlots) if (g.used && vis(v, g.x, g.y, 4)) { ctx.fillStyle = '#7a6a52'; ctx.fillRect(g.x - 1.3, g.y - 2.2, 2.6, 4.4); ctx.fillStyle = '#eee'; ctx.fillRect(g.x - 0.8, g.y - 2.6, 1.6, 0.8); }
      // bus stops and shelters
      for (const R of BUS_ROUTES) for (const st of R.stopList) for (const dir of [1, -1]) {
        const fc = st.faces[dir];
        if (!vis(v, fc.door.x, fc.door.y, 10)) continue;
        ctx.fillStyle = R.color; ctx.fillRect(fc.door.x - 3, fc.door.y + (fc.sign > 0 ? 1.4 : -2.6), 6, 1.2);
        ctx.fillStyle = 'rgba(160,200,220,0.4)'; ctx.fillRect(fc.door.x - 3, fc.door.y + (fc.sign > 0 ? 0.4 : -3.4), 6, 1);
      }
      // dustbins by fill level
      for (const b of world.bins) {
        if (!vis(v, b.x, b.y, 4)) continue;
        const f = Math.min(1.5, b.kg / p.binCapacity);
        ctx.fillStyle = b.overflowed ? '#d33a2c' : f > 0.7 ? '#e0a526' : '#3d8b5a';
        ctx.fillRect(b.x - 1.2, b.y - 1.2, 2.4, 2.4);
        if (b.overflowed) { ctx.fillStyle = '#6b4f2a'; for (let i = 0; i < 5; i++) ctx.fillRect(b.x - 3 + i * 1.4, b.y + 1.6 + (i % 2), 1, 1); }
      }
      // water-works tank level, solar glow, substation state
      { const Wp = WATER_PLANT; if (vis(v, Wp.x0, Wp.y0, 80)) { const lvl = Math.max(0, Math.min(1, world.wa.tank / p.tankCapacity)); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(Wp.x0 + 6, Wp.y1 - 6, 70, 2.6); ctx.fillStyle = lvl < 0.25 ? '#e5484d' : '#4cc9f0'; ctx.fillRect(Wp.x0 + 6, Wp.y1 - 6, 70 * lvl, 2.6); } }
      { const S = SUBSTATION; if (vis(v, S.x0, S.y0, 80)) { const out = !en.signalsOn || world.tick < en.outageUntil; ctx.fillStyle = out ? '#e5484d' : '#2ee66b'; ctx.beginPath(); ctx.arc(S.x1 - 5, S.y0 + 5, 1.5, 0, TAU); ctx.fill(); } }
      { const F = SOLAR_FARM; if (vis(v, F.x0, F.y0, 160) && en.solar > 5) { ctx.fillStyle = `rgba(255,240,160,${Math.min(0.28, en.solar / p.solarKw * 0.28)})`; ctx.fillRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); } }
      // blackout: places without power go dark
      for (const pl of world.places) {
        if (pl.pw === undefined || pl.pw >= 0.5 || !pl.block) continue;
        const R = pl.block.rect; if (!vis(v, (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, 60)) continue;
        ctx.fillStyle = `rgba(4,6,18,${night ? 0.55 : 0.18})`; ctx.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
        if (night || big) { ctx.fillStyle = '#ffd54a'; ctx.font = `700 7px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚡', (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2); }
      }
      // flood water on the roads
      if (world.flood > 0.04) {
        ctx.fillStyle = `rgba(70,140,200,${Math.min(0.5, world.flood * 0.5)})`;
        for (const X of ROAD_X) ctx.fillRect(X - 5, 0, 10, CITY_H);
        for (const Y of ROAD_Y) ctx.fillRect(0, Y - 5, CITY_W, 10);
      }
      // water-main bursts: a jet and a spreading puddle
      for (const b of world.wa.bursts) {
        if (!vis(v, b.x, b.y, 12)) continue;
        ctx.fillStyle = 'rgba(80,160,230,0.45)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 5 + 2 * Math.sin(now / 400), 3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(200,230,255,0.9)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(b.x + 1.5, b.y - 5 - Math.sin(now / 150), b.x + 3, b.y - 1); ctx.stroke();
      }
      // fires
      for (const fr of world.fires) {
        if (!vis(v, fr.x, fr.y, 24)) continue;
        const rr = 4 + fr.sev * 1.6;
        for (let i = 0; i < 5; i++) {
          const ph = now / 130 + i * 1.7, ox = Math.cos(i * 2.4) * rr * 0.5, oy = Math.sin(i * 1.9) * rr * 0.4;
          const g = ctx.createRadialGradient(fr.x + ox, fr.y + oy, 0, fr.x + ox, fr.y + oy, rr * (0.8 + 0.2 * Math.sin(ph)));
          g.addColorStop(0, 'rgba(255,235,120,0.95)'); g.addColorStop(0.5, 'rgba(255,110,30,0.7)'); g.addColorStop(1, 'rgba(180,30,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fr.x + ox, fr.y + oy, rr, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(40,40,40,0.35)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(fr.x + i * 2, fr.y - rr - ((now / 60 + i * 9) % 24), 2.5 + i * 0.6, 0, TAU); ctx.fill(); }
      }
      // buses and service vehicles
      for (const b of world.buses) if (vis(v, b.x, b.y, 16)) drawBusVeh(ctx, b, P, dark);
      for (const r of world.rigs) if (vis(v, r.x, r.y, 16) && !(r.idle && r.base && Math.hypot(r.x - r.base.x, r.y - r.base.y) < 1 && r.kind !== 'fire' && false)) drawRig(ctx, r, P, dark, now);
      // Wi-Fi access points (masts with signal arcs); the coverage layer shows the reach of each
      if (world.wifi) {
        const n = Math.min(p.wifiAps, world.wifi.aps.length);
        world.wifi.aps.forEach((ap, i) => {
          if (!vis(v, ap.x, ap.y, p.wifiRange + 10)) return;
          const used = i < n, on = ap.on, col = !used ? '#7c8896' : !on ? '#ff4d4f' : ap.load > 1 ? '#ffb020' : '#46c6e6';
          if (this.showWifi && used) {
            const g = ctx.createRadialGradient(ap.x, ap.y, 0, ap.x, ap.y, p.wifiRange);
            g.addColorStop(0, rgba(col, on ? 0.26 : 0.1)); g.addColorStop(1, rgba(col, on ? 0.04 : 0.02));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ap.x, ap.y, p.wifiRange, 0, TAU); ctx.fill();
            ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = Math.max(0.4, px); ctx.setLineDash([4 * px, 3 * px]); ctx.beginPath(); ctx.arc(ap.x, ap.y, p.wifiRange, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          }
          if (!used) return;
          ctx.fillStyle = '#2a3540'; ctx.fillRect(ap.x - 0.5, ap.y - 4, 1, 6);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ap.x, ap.y - 4.5, 1.4, 0, TAU); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 0.55;
          for (const r of [2.6, 4.2]) { ctx.beginPath(); ctx.arc(ap.x, ap.y - 4.5, r, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke(); }
          if (!on) { ctx.beginPath(); ctx.moveTo(ap.x - 2, ap.y - 7); ctx.lineTo(ap.x + 2, ap.y - 3); ctx.moveTo(ap.x + 2, ap.y - 7); ctx.lineTo(ap.x - 2, ap.y - 3); ctx.stroke(); }
        });
      }
      this.drawVenues(ctx, world, v, dark, now, px);
      if (this.showSat) this.drawSatellite(ctx, world, v, now, px); else this.drawSeasonTint(ctx, world, dark);
      // call to prayer: a glow over the mosque at prayer time
      { const m = world.mosque; if (m && world.azan && vis(v, m.cx, m.cy, 60)) { const R = m.block.rect; ctx.strokeStyle = `rgba(233,196,106,${0.5 + 0.3 * Math.sin(now / 300)})`; ctx.lineWidth = 1.6; ctx.strokeRect(R.x0 - 2, R.y0 - 2, R.x1 - R.x0 + 4, R.y1 - R.y0 + 4); } }
    }
    draw(now) {
      if (!this.resize()) return;
      this.frame++;
      const dt = Math.min(100, this.lastNow ? now - this.lastNow : 16); this.lastNow = now;
      const app = this.app, world = app.world, p = world.params, cam = app.cam, ctx = this.ctx, dpr = this.dpr, D = app.decor;
      const dark = app.darkness(), mode = dark >= 0.5 ? 'night' : 'day', P = PAL[mode], AC = P.agents;
      const k = cam.k, kk = k * dpr, v = cam.view(), px = 1 / k, big = k > 2.1;
      const agents = world.agents, night = dark >= 0.5, tickF = world.tick + (app.playing ? Math.min(0.99, app.acc || 0) : 0);
      // ---- background
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = P.farm; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      if (kk <= CACHE_SCALE * 1.3) {
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        const sx = v.x0 * CACHE_SCALE, sy = v.y0 * CACHE_SCALE, sw = (v.x1 - v.x0) * CACHE_SCALE, sh = (v.y1 - v.y0) * CACHE_SCALE;
        if (dark < 1) ctx.drawImage(this.cache('day'), sx, sy, sw, sh, 0, 0, this.cv.width, this.cv.height);
        if (dark > 0) { ctx.globalAlpha = dark; ctx.drawImage(this.cache('night'), sx, sy, sw, sh, 0, 0, this.cv.width, this.cv.height); ctx.globalAlpha = 1; }
        ctx.setTransform(kk, 0, 0, kk, -v.x0 * kk, -v.y0 * kk);
      } else {
        ctx.setTransform(kk, 0, 0, kk, -v.x0 * kk, -v.y0 * kk);
        paintCity(ctx, world, D, P, v);
      }
      // ---- closed places
      const closed = [];
      for (const b of world.blocks) {
        const t = b.type, shut = (t === 'school' || t === 'university') ? (!p.schoolsOpen || world.today.smog) : t === 'market' ? !p.marketOpen : t === 'park' ? !p.parksOpen
          : t === 'gym' ? !p.gymOpen : (t === 'mosque' || t === 'wedding') ? !p.gatheringsOpen : false;
        if (shut) closed.push(b);
      }
      for (const b of closed) {
        const R = b.rect;
        if (!vis(v, (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, 60)) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
        ctx.lineWidth = 2.2; ctx.setLineDash([4, 4]);
        for (const [col, off] of [[P.closedTape, 0], ['#ffffff', 4]]) {
          ctx.strokeStyle = col; ctx.lineDashOffset = off;
          ctx.strokeRect(R.x0 + 1.5, R.y0 + 1.5, R.x1 - R.x0 - 3, R.y1 - R.y0 - 3);
          ctx.beginPath(); ctx.moveTo(R.x0 + 8, R.y0 + 8); ctx.lineTo(R.x1 - 8, R.y1 - 8); ctx.moveTo(R.x1 - 8, R.y0 + 8); ctx.lineTo(R.x0 + 8, R.y1 - 8); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      if (p.quarantine) {
        const R = world.isolation.block.rect, pulse = reduceMotion ? 0.6 : 0.45 + 0.35 * Math.sin(now / 400);
        ctx.strokeStyle = rgba('#46c6e6', pulse); ctx.lineWidth = Math.max(1, 2 * px);
        ctx.strokeRect(R.x0 - 2, R.y0 - 2, R.x1 - R.x0 + 4, R.y1 - R.y0 + 4);
      }
      // ---- hospital beds and motorway casualties in them
      const hosp = world.hospital, nBeds = Math.min(p.hospitalBeds, hosp.bedSlots.length);
      ctx.fillStyle = P.bed;
      for (let i = 0; i < nBeds; i++) { const s = hosp.bedSlots[i]; ctx.fillRect(s.x - 2.6, s.y - 1.3, 5.2, 2.6); }
      for (const vv of world.visitors) { ctx.fillStyle = SKIN[vv.id % 4]; ctx.beginPath(); ctx.arc(vv.x - 1.6, vv.y, 1.1, 0, TAU); ctx.fill(); ctx.fillStyle = '#c3ccd4'; ctx.fillRect(vv.x - 0.6, vv.y - 1.1, 3, 2.2); }
      // ---- kilns burning: fire glow at night, heat shimmer by day
      const nK = KILN_SITES.length;
      for (let i = 0; i < nK; i++) {
        const kl = KILN_SITES[i];
        if (!world.kilnOn(i) || !vis(v, kl.x, kl.y, 40)) continue;
        const fl = reduceMotion ? 0.8 : 0.75 + 0.25 * Math.sin(now / 130 + i * 1.7) * Math.sin(now / 57 + i);
        ctx.save(); ctx.globalCompositeOperation = night ? 'lighter' : 'source-over';
        ctx.strokeStyle = `rgba(255,${night ? 120 : 90},40,${(night ? 0.55 : 0.35) * fl})`; ctx.lineWidth = 2.4;
        ctx.beginPath(); rrect(ctx, kl.x - 22, kl.y - 6, 44, 12, 6); ctx.stroke();
        if (night) { const g = ctx.createRadialGradient(kl.x, kl.y, 0, kl.x, kl.y, 30); g.addColorStop(0, `rgba(255,120,40,${0.35 * fl})`); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kl.x, kl.y, 30, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      // ---- occupancy, lit windows, parked cars
      const occ = this.occ; occ.fill(0, 0, world.places.length);
      for (const a of agents) if (a.state !== 'D' && a.mode === 'inside' && a.place) occ[a.place.id]++;
      if (dark > 0.05) {
        ctx.fillStyle = P.window || '#ffd27a';
        ctx.globalAlpha = Math.min(1, dark * 1.2);
        for (const h of world.homes) {
          if (!occ[h.id] || !vis(v, h.cx, h.cy, 60)) continue;
          if (h.house) { const H = h.house; ctx.fillRect(H.x0 + 2, H.y0 + 1.5, 1.4, 1.1); ctx.fillRect(H.x1 - 3.4, H.y1 - 2.6, 1.4, 1.1); }
          else { const f = h.flat; ctx.fillRect(f.x1 - 3, f.y1 - 2.4, 1.4, 1); }
        }
        ctx.globalAlpha = 1;
      }
      for (const hh of world.households) {
        if (!hh.car || hh.carInUse) continue;
        const spot = hh.home.house ? D.homeSpot.get(hh.home.id) : D.flatSlot.get(hh.id);
        if (spot && vis(v, spot.x, spot.y, 8)) drawCar(ctx, spot.x, spot.y, spot.ang, P.car[hh.id % P.car.length], P, false, null);
      }
      for (const pl of world.places) {
        if (!pl.parked) continue;
        const slots = D.slots.get(pl.id);
        if (!slots) continue;
        const n = Math.min(pl.parked, slots.length);
        for (let i = 0; i < n; i++) { const s = slots[i]; if (vis(v, s.x, s.y, 8)) drawCar(ctx, s.x, s.y, s.ang, P.car[(pl.id * 7 + i * 3) % P.car.length], P, false, null); }
      }
      { const s = D.slots.get(world.airport.id); if (s && vis(v, 1260, 325, 140)) for (let i = 0; i < s.length; i += 2) if ((i * 7) % 5 < 3) drawCar(ctx, s[i].x, s[i].y, s[i].ang, P.car[(i * 5) % P.car.length], P, false, null); }
      if (D.police) for (const s of D.police) drawCar(ctx, s.x, s.y, s.ang, night ? '#d9dee3' : '#f4f6f8', P, false, { kind: 'police' });
      // ---- aircraft on the ground
      const poses = [];
      for (const f of world.flights) { const pose = flightPose(f, tickF); if (pose) poses.push([f, pose]); }
      for (const [f, pose] of poses) if (pose.alt <= 0.02 && vis(v, pose.x, pose.y, 30)) { if (P.shadow) drawPlane(ctx, { x: pose.x + 1.5, y: pose.y + 1.8, heading: pose.heading, alt: 0 }, f, P, dark, now, true); drawPlane(ctx, pose, f, P, dark, now, false); }
      { // rotating beacon on the control tower
        const on = Math.floor(now / 700) % 2 === 0;
        if (dark > 0.25 && vis(v, 1096, 262, 20)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(1096, 262, 0, 1096, 262, 12); g.addColorStop(0, on ? 'rgba(80,255,140,0.8)' : 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(1096, 262, 12, 0, TAU); ctx.fill(); ctx.restore(); }
      }
      // ---- traffic lights and traffic police
      for (const j of world.junctions) {
        if (!j.signal && !j.police) continue;
        if (!vis(v, j.X, j.Y, 24)) continue;
        const hx = roadHalf(j.X === MAIN_X) + 1.8, hy = roadHalf(j.Y === MAIN_Y) + 1.8;
        if (j.signal) {
          const flash = Math.floor(now / 500) % 2 === 0 ? 'A' : null; let sh = p.trafficLights ? world.lightFor(j, 'h') : null, sv = p.trafficLights ? world.lightFor(j, 'v') : null; if (sh === 'F') { sh = flash; sv = flash; }
          drawSignal(ctx, j.X - hx, j.Y - hy, sh, P, dark, big); drawSignal(ctx, j.X + hx, j.Y + hy, sh, P, dark, big);
          drawSignal(ctx, j.X + hx, j.Y - hy, sv, P, dark, big); drawSignal(ctx, j.X - hx, j.Y + hy, sv, P, dark, big);
        }
        if (world.policeOnDuty(j)) drawOfficer(ctx, j.X + hx + 2.5, j.Y - hy - 2.5, P, reduceMotion ? 0 : now, big, p.trafficLights && j.signal ? (world.lightFor(j, 'h') === 'G' ? 'h' : 'v') : (Math.floor(now / 3000) % 2 ? 'h' : 'v'));
      }
      // ---- layers
      // ---- v5: city services, transit, utilities (drawn from the model state)
      this.showWifi = app.layers.wifi; this.showSat = app.layers.sat;
      this.drawServices(ctx, world, P, v, dark, now, night, px, big);
      if (app.layers.heat) app.heat.draw(ctx, P);
      if (app.layers.air || app.layers.sat) this.air.draw(ctx, world, P);
      if (app.layers.radius) {
        ctx.fillStyle = rgba(AC.I, night ? 0.07 : 0.1); ctx.strokeStyle = rgba(AC.I, 0.45); ctx.lineWidth = Math.max(0.3, px);
        ctx.beginPath();
        for (const a of agents) { if (!a.infectious || a.mode === 'drive') continue; ctx.moveTo(a.x + p.infectionRadius, a.y); ctx.arc(a.x, a.y, p.infectionRadius, 0, TAU); }
        ctx.fill(); ctx.stroke();
      }
      if (app.layers.routes) {
        ctx.lineWidth = Math.max(0.4, 1.1 * px);
        ctx.strokeStyle = rgba('#46c6e6', 0.35);
        ctx.beginPath();
        for (const a of agents) {
          if ((a.mode !== 'walk' && a.mode !== 'drive') || !a.path) continue;
          ctx.moveTo(a.x, a.y);
          for (let i = a.pi; i < a.path.length; i++) ctx.lineTo(a.path[i].x, a.path[i].y);
        }
        ctx.stroke();
        for (const amb of world.ambulances) {
          if (amb.state === 'idle' || !amb.path) continue;
          ctx.strokeStyle = rgba('#ff4d4f', 0.7); ctx.lineWidth = Math.max(0.6, 2 * px);
          ctx.beginPath(); ctx.moveTo(amb.x, amb.y);
          for (let i = amb.pi; i < amb.path.length; i++) ctx.lineTo(amb.path[i].x, amb.path[i].y);
          ctx.stroke();
        }
        const h = world.heli;
        if (h.target && h.state !== 'idle') { ctx.strokeStyle = rgba('#ff4d4f', 0.6); ctx.setLineDash([4 * px, 3 * px]); ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.state === 'toPad' || h.state === 'liftoff' || h.state === 'landPad' ? h.pad.x : h.target.x, h.state === 'toPad' || h.state === 'liftoff' || h.state === 'landPad' ? h.pad.y : h.target.y); ctx.stroke(); ctx.setLineDash([]); }
      }
      app.traffic.draw(ctx, P, now, dark, world.plough);
      // ---- motorway: through traffic, crashes, closures
      for (const veh of world.vehicles) if (vis(v, veh.x, veh.y, 12)) drawVehicle(ctx, veh, P, dark, now);
      for (const inc of world.incidents) {
        if (!vis(v, inc.x, MW_Y, 60)) continue;
        for (const d of [26, 40]) drawTriangle(ctx, inc.x - inc.dir * d, MW_Y + (inc.dir > 0 ? -1 : 1) * 7.6, 1.6);
        drawCar(ctx, inc.x - inc.dir * 16, MW_Y + (inc.dir > 0 ? -12.6 : 12.6), inc.dir > 0 ? 0 : Math.PI, night ? '#d9dee3' : '#f4f6f8', P, dark > 0.3, { kind: 'police', moving: false, siren: !reduceMotion, now });
      }
      if (world.mwClosed) {
        for (const bx of [8, WORLD_W - 8]) {
          if (!vis(v, bx, MW_Y, 20)) continue;
          for (let y = MW_Y - 13; y <= MW_Y + 12; y += 2.6) { ctx.fillStyle = ((y - MW_Y) / 2.6) % 2 < 1 ? '#e3262b' : '#ffffff'; ctx.fillRect(bx - 0.8, y, 1.6, 2.6); }
        }
        for (const L of LINKS) if (vis(v, L.x, L.y1 - 10, 20)) for (let x = L.x - 6; x < L.x + 6; x += 2) { ctx.fillStyle = ((x - L.x) / 2) % 2 < 1 ? '#e3262b' : '#ffffff'; ctx.fillRect(x, L.y1 - 12, 2, 1.4); }
      }
      // ---- crashed cars in the city
      for (const wr of world.wrecks) {
        if (!vis(v, wr.x, wr.y, 14)) continue;
        drawCar(ctx, wr.x, wr.y, wr.heading + 0.55, wr.taxi ? '#f2c230' : P.car[wr.color % P.car.length], P, false, null);
        const on = Math.floor(now / 380) % 2 === 0;
        if (on) { ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(wr.x + 3, wr.y - 2, 0.8, 0, TAU); ctx.arc(wr.x - 3, wr.y + 2, 0.8, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(220,235,250,0.8)';
        for (let i = 0; i < 6; i++) ctx.fillRect(wr.x + Math.cos(i * 2.1 + wr.color) * 5, wr.y + Math.sin(i * 1.7 + wr.color) * 4, 0.6, 0.6);
        drawTriangle(ctx, wr.x - Math.cos(wr.heading) * 13, wr.y - Math.sin(wr.heading) * 13, 1.5);
      }
      if (app.layers.links) {
        if (night) ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = Math.max(0.5, 1.3 * px);
        for (const e of world.recentInfections) {
          const a = agents[e.from], b = agents[e.to];
          if (!a || !b || a.mode === 'ambulance' || b.mode === 'ambulance' || a.away || b.away) continue;
          const al = Math.max(0, 1 - (world.tick - e.tick) / 360);
          ctx.strokeStyle = rgba(AC.I, 0.65 * al);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // ---- selected person: route, home, workplace, contacts
      const sel = app.selected;
      if (sel) {
        ctx.lineWidth = Math.max(0.8, 1.6 * px);
        ctx.strokeStyle = rgba('#46c6e6', 0.95);
        const homeR = sel.home.house || sel.home.flat;
        ctx.setLineDash([3 * px, 2 * px]);
        ctx.strokeRect(homeR.x0 - 1.5, homeR.y0 - 1.5, homeR.x1 - homeR.x0 + 3, homeR.y1 - homeR.y0 + 3);
        const job = sel.work || sel.school;
        if (job) { const R = job.rect || job.block.rect; ctx.strokeStyle = rgba('#ffb83d', 0.9); ctx.strokeRect(R.x0 - 1, R.y0 - 1, R.x1 - R.x0 + 2, R.y1 - R.y0 + 2); }
        ctx.setLineDash([]);
        if ((sel.mode === 'walk' || sel.mode === 'drive') && sel.path) {
          ctx.strokeStyle = '#46c6e6'; ctx.lineWidth = Math.max(1, 2.2 * px);
          ctx.setLineDash([5 * px, 3 * px]);
          ctx.beginPath(); ctx.moveTo(sel.x, sel.y);
          for (let i = sel.pi; i < sel.path.length; i++) ctx.lineTo(sel.path[i].x, sel.path[i].y);
          ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.lineWidth = Math.max(0.8, 1.6 * px); ctx.strokeStyle = rgba('#46c6e6', 0.8);
        for (const id of sel.infectedIds) { const b = agents[id]; if (!b || b.mode === 'ambulance' || b.away) continue; ctx.beginPath(); ctx.moveTo(sel.x, sel.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        if (sel.infectedBy != null && agents[sel.infectedBy] && !agents[sel.infectedBy].away) {
          const src = agents[sel.infectedBy];
          ctx.setLineDash([2 * px, 3 * px]); ctx.strokeStyle = AC.E;
          ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(sel.x, sel.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      // ---- people
      const shown = (a) => a.mode !== 'drive' && a.mode !== 'bus' && !a.buried && a.mode !== 'ambulance' && a.mode !== 'heli' && !a.away && !(a.state === 'D' && (a.diedWhere === 'hospital' || a.diedWhere === 'abroad' || (a.diedWhere === 'road' && world.tick - a.diedAtTick > 360)));
      const R0 = 3.6, sprite = R0 * k >= 6.5;
      const rad = (a) => (a.place && a.place.type === 'home' && a.mode === 'inside' ? 3 : R0);
      if (P.glow || dark > 0.3) {
        const G = this.glow[mode];
        ctx.globalCompositeOperation = 'screen';
        for (const a of agents) {
          if (!shown(a)) continue;
          if (a.state === 'I') { const s = rad(a) * (a.isolated || a.mode === 'bed' ? 2.3 : 3.3); ctx.globalAlpha = (a.isolated || a.mode === 'bed' ? 0.3 : 0.5) * dark; ctx.drawImage(G.I, a.x - s, a.y - s, s * 2, s * 2); }
          else if (a.state === 'E') { const s = rad(a) * 2.2; ctx.globalAlpha = 0.32 * dark; ctx.drawImage(G.E, a.x - s, a.y - s, s * 2, s * 2); }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      const rainy = world.rain > 0.25;
      if (!sprite) {
        ctx.strokeStyle = AC.D; ctx.lineWidth = Math.max(1, 1.6 * px);
        ctx.beginPath();
        for (const a of agents) if (a.state === 'D' && shown(a)) { const q = 2.4; ctx.moveTo(a.x - q, a.y - q); ctx.lineTo(a.x + q, a.y + q); ctx.moveTo(a.x + q, a.y - q); ctx.lineTo(a.x - q, a.y + q); }
        ctx.stroke();
        for (const st of ['S', 'R', 'E', 'I']) {
          ctx.fillStyle = AC[st]; ctx.beginPath();
          for (const a of agents) {
            if (a.state !== st || !shown(a) || !vis(v, a.x, a.y, 5)) continue;
            const r = rad(a); ctx.moveTo(a.x + r, a.y); ctx.arc(a.x, a.y, r, 0, TAU);
          }
          ctx.fill();
          if (P.outline && !night) { ctx.strokeStyle = P.outline; ctx.lineWidth = Math.max(0.4, 0.8 * px); ctx.stroke(); }
        }
        ctx.fillStyle = P.maskDot; ctx.beginPath();
        for (const a of agents) {
          if (!a.mask || a.state === 'D' || !shown(a) || (a.place && a.place.type === 'home' && a.mode === 'inside')) continue;
          const r = rad(a) * 0.42; ctx.moveTo(a.x + r, a.y); ctx.arc(a.x, a.y, r, 0, TAU);
        }
        ctx.fill();
        if (rainy) {
          for (const a of agents) if (a.mode === 'walk' && shown(a) && vis(v, a.x, a.y, 6)) drawUmbrella(ctx, a.x, a.y, R0 * 1.15, a.id, P);
        }
        for (const a of agents) if (a.mode === 'injured' && vis(v, a.x, a.y, 8)) { const on = Math.floor(now / 300) % 2 === 0; ctx.strokeStyle = on ? '#ff4d4f' : '#ffffff'; ctx.lineWidth = Math.max(1, 2 * px); ctx.beginPath(); ctx.arc(a.x, a.y, R0 + 2.5 * px + 1.5, 0, TAU); ctx.stroke(); }
      } else {
        for (const a of agents) {
          if (!shown(a) || !vis(v, a.x, a.y, 10)) continue;
          if (a.state === 'D') { drawGrave(ctx, a.x, a.y, R0, P); continue; }
          if (a.mode === 'bed') { drawPatient(ctx, a, R0, P, AC[a.state]); continue; }
          if (a.mode === 'injured') { drawInjured(ctx, a, P, now, px); continue; }
          let opts = null;
          const pt = a.mode === 'inside' && a.place ? a.place.type : null;
          if (pt === 'gym' && a.idle > 0) {
            const kind = a.stationKind;
            const ph = now / (kind === 'run' ? 75 : kind === 'bike' ? 140 : 300) + a.id;
            opts = kind === 'run' ? { heading: -Math.PI / 2, swing: Math.sin(ph) * R0 * 0.55 } : kind === 'bike' ? { heading: -Math.PI / 2, swing: Math.sin(ph) * R0 * 0.3 }
              : kind === 'lift' ? { heading: -Math.PI / 2, bob: Math.abs(Math.sin(ph)) * 0.18 } : { heading: 0, bob: Math.abs(Math.sin(ph)) * 0.14 };
            if (reduceMotion) opts.swing = 0, opts.bob = 0;
          } else if (pt === 'mosque' && a.idle > 0) opts = { heading: Math.PI };
          drawPerson(ctx, a, a.x, a.y, rad(a), P, AC[a.state], px, opts);
          if (rainy && a.mode === 'walk') drawUmbrella(ctx, a.x + 0.4, a.y - 0.4, rad(a) * 1.2, a.id, P);
          if (a.smoking) {
            const hx = a.x + Math.cos(a.heading) * rad(a) * 0.9 + Math.cos(a.heading + 1.4) * rad(a) * 0.5, hy = a.y + Math.sin(a.heading) * rad(a) * 0.9 + Math.sin(a.heading + 1.4) * rad(a) * 0.5;
            ctx.strokeStyle = '#eef0f2'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(a.x + Math.cos(a.heading) * rad(a) * 0.5, a.y + Math.sin(a.heading) * rad(a) * 0.5); ctx.lineTo(hx, hy); ctx.stroke();
            ctx.fillStyle = (Math.floor(now / 500 + a.id) % 3) ? '#ff7a2a' : '#ffc06a'; ctx.beginPath(); ctx.arc(hx, hy, 0.3, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.strokeStyle = AC.V; ctx.lineWidth = Math.max(0.8, (sprite ? 1.8 : 1.3) * px);
      ctx.beginPath();
      for (const a of agents) {
        if (!a.vaccinated || a.state === 'D' || !shown(a) || a.mode === 'injured') continue;
        const rr = rad(a) + (sprite ? rad(a) * 0.35 : 1.6 * px + 0.5); ctx.moveTo(a.x + rr, a.y); ctx.arc(a.x, a.y, rr, 0, TAU);
      }
      ctx.stroke();
      // ---- cars driven by agents (taxis in yellow), then ambulances
      for (const a of agents) {
        if (a.mode !== 'drive' || !vis(v, a.x, a.y, 12)) continue;
        drawCar(ctx, a.x, a.y, a.heading, a.taxi ? '#f2c230' : P.car[a.household.id % P.car.length], P, dark > 0.3, { moving: true, light: dark, dot: AC[a.state], taxi: a.taxi, brake: a.queueKey >= 0 || a.crashWait > 0 });
      }
      for (const amb of world.ambulances) {
        const moving = amb.state !== 'idle';
        drawCar(ctx, amb.x, amb.y, amb.heading, '#f2f4f6', P, moving && dark > 0.3, { kind: 'amb', moving, siren: moving && !reduceMotion, now, light: dark, len: 9.5, wid: 4.6 });
      }
      // ---- pulses
      if (!reduceMotion) {
        const buckets = [[], [], [], [], []], blink = Math.floor(now / 250) % 2;
        ctx.lineWidth = Math.max(0.9, 2 * px);
        for (const a of agents) {
          if (a.state !== 'I' || !shown(a) || a.mode === 'bed' || a.mode === 'injured') continue;
          if (a.isolated && a.mode === 'walk') {
            ctx.strokeStyle = (blink + a.id) % 2 ? '#46c6e6' : '#ff4d4f';
            ctx.beginPath(); ctx.arc(a.x, a.y, rad(a) + 3.5 * px + 1, 0, TAU); ctx.stroke();
            continue;
          }
          if (a.needsAmbulance) {
            ctx.strokeStyle = blink ? '#ffffff' : '#ff4d4f';
            ctx.beginPath(); ctx.arc(a.x, a.y, rad(a) + 4 * px + 1.5, 0, TAU); ctx.stroke();
            continue;
          }
          if (a.isolated) continue;
          const t = ((now / 1300) + a.id * 0.137) % 1;
          buckets[Math.min(4, Math.floor(t * 5))].push(a.x, a.y, rad(a) + t * rad(a) * 1.3);
        }
        ctx.lineWidth = Math.max(0.6, 1.2 * px);
        for (let b = 0; b < 5; b++) {
          const arr = buckets[b];
          if (!arr.length) continue;
          ctx.strokeStyle = rgba(AC.I, 0.5 * (1 - (b + 0.5) / 5));
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 3) { ctx.moveTo(arr[i] + arr[i + 2], arr[i + 1]); ctx.arc(arr[i], arr[i + 1], arr[i + 2], 0, TAU); }
          ctx.stroke();
        }
      }
      app.effects.draw(ctx, now, k, P);
      // ---- smoke from kilns, factory chimneys and smokers
      const em = this.emitters || (this.emitters = []);
      em.length = 0;
      for (let i = 0; i < nK; i++) if (world.kilnOn(i)) em.push({ key: 'k' + i, x: KILN_SITES[i].x, y: KILN_SITES[i].y, kind: 'kiln', rate: p.cleanKilns ? 0.0035 : 0.0075 });
      const m = world.minute, wd = world.dayIndex % 7;
      if (m >= 420 && m < 1140 && wd < 6 && p.factorySmoke > 0) for (const f of world.factories) em.push({ key: 'f' + f.id, x: f.chimney.x, y: f.chimney.y, kind: 'factory', rate: 0.0035 * p.factorySmoke / 100 });
      if (sprite) { let n = 0; for (const a of agents) if (a.smoking && n < 40 && vis(v, a.x, a.y, 6)) { em.push({ key: 'c' + a.id, x: a.x, y: a.y - 1, kind: 'cig', rate: 0.0016 }); n++; } }
      this.smoke.update(dt, world, em, app.playing);
      this.smoke.draw(ctx, P, dark, p.cleanKilns, v);
      // ---- helicopter, then aircraft in the air
      drawHeli(ctx, world.heli, P, dark, reduceMotion ? 0 : now);
      for (const [f, pose] of poses) if (pose.alt > 0.02) drawPlane(ctx, pose, f, P, dark, now, true);
      // ---- weather in the world: wet streets, clouds, smog haze, fog banks
      this.sky.app = app;
      if (app.layers.weather) this.sky.drawWorld(ctx, world, P, now, dt, v, dark, D);
      for (const [f, pose] of poses) if (pose.alt > 0.02) drawPlane(ctx, pose, f, P, dark, now, false);
      // ---- selection and hover rings
      if (sel && shown(sel)) {
        const r = rad(sel) + (sprite ? rad(sel) * 0.3 : 0);
        ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = rgba(P.select, 0.5); ctx.lineWidth = px;
        ctx.beginPath(); ctx.arc(sel.x, sel.y, p.infectionRadius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = P.select; ctx.lineWidth = 2.2 * px;
        ctx.beginPath(); ctx.arc(sel.x, sel.y, r + 5 * px, 0, TAU); ctx.stroke();
        const b = r + 9 * px, t = 4 * px;
        ctx.beginPath();
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(sel.x + dx * b, sel.y + dy * (b - t)); ctx.lineTo(sel.x + dx * b, sel.y + dy * b); ctx.lineTo(sel.x + dx * (b - t), sel.y + dy * b); }
        ctx.stroke();
      } else if (sel && (sel.mode === 'drive' || sel.mode === 'ambulance' || sel.mode === 'heli')) {
        ctx.strokeStyle = P.select; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(sel.x, sel.y, 8 + 4 * px, 0, TAU); ctx.stroke();
      }
      const hov = app.hoverId != null ? agents[app.hoverId] : null;
      if (hov && hov !== sel && shown(hov)) {
        ctx.strokeStyle = rgba(P.select, 0.75); ctx.lineWidth = 1.5 * px;
        ctx.beginPath(); ctx.arc(hov.x, hov.y, rad(hov) + 3.5 * px + (sprite ? rad(hov) * 0.3 : 0), 0, TAU); ctx.stroke();
      }
      // ---- screen space: rain, lightning, golden hour, labels, scale bar
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (app.layers.weather) this.sky.drawScreen(ctx, this.W, this.H, world, now, app);
      if (app.layers.labels) {
        const small = this.W < 520, full = cam.z >= 1.7;
        ctx.font = `700 ${small ? 8.5 : cam.z > 2 ? 12 : 9.5}px ${DISPLAY}`;
        const SHORT = { amusement: 'FUNLAND', construction: 'BUILDING SITE', university: 'UNIVERSITY', office: 'OFFICES', hospital: 'HOSPITAL', isolation: 'ISOLATION', school: 'SCHOOL', police: 'POLICE', market: 'BAZAAR', factory: 'FACTORY', park: 'PARK', fuel: 'PETROL',
          gym: 'GYM', nadra: 'NADRA', passport: 'PASSPORT', mosque: 'MASJID', wedding: 'SHADI HALL', airport: 'AIRPORT', mart: 'AL-FATAH MART', mandi: 'SABZI MANDI', fire: 'FIRE STATION', graveyard: 'GRAVEYARD' };
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = (text, wx, wy, color) => {
          const s = cam.toScreen(wx, wy);
          if (s.x < -80 || s.x > this.W + 80 || s.y < -10 || s.y > this.H + 10) return;
          ctx.lineWidth = 3; ctx.strokeStyle = P.labelShadow; ctx.strokeText(text, s.x, s.y);
          ctx.fillStyle = color || P.label; ctx.fillText(text, s.x, s.y);
        };
        for (const pl of world.places) {
          if (pl.type === 'home') continue;
          if (small && !{ school: 1, hospital: 1, market: 1, mosque: 1, airport: 1, university: 1 }[pl.type]) continue;
          if (pl.type === 'passport' && !full) continue;
          const R = pl.rect || pl.block.rect;
          let text = full ? pl.name.toUpperCase() : SHORT[pl.type];
          if (pl.type === 'hospital') text = `${full ? 'CITY HOSPITAL · ' : 'HOSPITAL '}${world.bedsUsed()}/${p.hospitalBeds}`;
          if (pl.type === 'isolation' && full) text = `ISOLATION · ${occ[pl.id]}`;
          if ((pl.type === 'gym' || pl.type === 'mosque' || pl.type === 'wedding' || pl.type === 'nadra' || pl.type === 'passport') && full && occ[pl.id]) text += ` · ${occ[pl.id]}`;
          const shut = closed.includes(pl.block);
          if (shut) text += ' · CLOSED';
          const lx = full || pl.type !== 'nadra' ? (R.x0 + R.x1) / 2 : pl.block.rect.x0 / 2 + pl.block.rect.x1 / 2;
          const ly = full && (pl.type === 'passport' || pl.type === 'gym') ? R.y0 + 8 : R.y1 - 7;
          label(text, lx, ly, shut ? P.closedTape : pl.type === 'hospital' && world.overloaded ? P.closedTape : null);
        }
        if (!small || cam.z > 1.4) {
          label(world.mwClosed ? 'M-2 MOTORWAY · CLOSED (FOG)' : 'M-2 MOTORWAY', 700, MW_Y - 24, world.mwClosed ? P.closedTape : null);
          label('BRICK KILNS', 1205, 478); label('BRICK KILNS', 545, 700);
          label('RUNWAY 09 / 27', 1210, RUNWAY.y - 17);
          if (full) { label('AIRPORT ROAD', 1060, MAIN_Y - 16); label('TOLL PLAZA', 530, 624); label('CANAL', 200, 750); }
        }
      }
      const target = 90 / k;
      let mm = 5;
      for (const s of [5, 10, 20, 25, 50, 100, 200]) if (s <= target) mm = s;
      const len = mm * k, bx = 14, by = this.H - 14;
      ctx.strokeStyle = P.labelShadow; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + len, by); ctx.stroke();
      ctx.strokeStyle = P.label; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + len, by); ctx.lineTo(bx + len, by - 4); ctx.stroke();
      ctx.font = `500 10.5px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = P.labelShadow; ctx.strokeText(`${mm} m`, bx + 2, by - 5);
      ctx.fillStyle = P.label; ctx.fillText(`${mm} m`, bx + 2, by - 5);
      // ---- minimap
      const show = cam.z > 1.02 && this.W >= 560;
      if (this.mm.hidden === show) this.mm.hidden = !show;
      if (show && this.frame % 3 === 0) {
        const mw = this.mm.clientWidth || 170, mh = this.mm.clientHeight || 92;
        if (this.mm.width !== Math.round(mw * dpr)) { this.mm.width = Math.round(mw * dpr); this.mm.height = Math.round(mh * dpr); }
        const mc = this.mctx, s = mw / WORLD_W;
        this.cache(mode);
        mc.setTransform(dpr, 0, 0, dpr, 0, 0);
        mc.drawImage(this.minis[mode], 0, 0, mw, mh);
        mc.fillStyle = AC.I;
        for (const a of agents) if (a.state === 'I' && shown(a)) mc.fillRect(a.x * s - 1, a.y * s - 1, 2, 2);
        mc.fillStyle = '#ffffff';
        for (const amb of world.ambulances) if (amb.state !== 'idle') mc.fillRect(amb.x * s - 1.5, amb.y * s - 1.5, 3, 3);
        mc.strokeStyle = '#46c6e6'; mc.lineWidth = 1.3;
        mc.strokeRect(v.x0 * s, v.y0 * s, (v.x1 - v.x0) * s, (v.y1 - v.y0) * s);
        if (sel) { mc.fillStyle = '#ffffff'; mc.beginPath(); mc.arc(sel.x * s, sel.y * s, 2.4, 0, TAU); mc.fill(); }
      }
    }
  }
  function vis(v, x, y, r) { return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1; }
  function drawPatient(ctx, a, r, P, col) {
    ctx.fillStyle = SKIN[a.id % 4];
    ctx.beginPath(); ctx.arc(a.x - 1.6, a.y, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(a.x - 0.6, a.y - 1.1, 3, 2.2);
  }

  /* =================== HospitalChart: patients vs beds =================== */
  class HospitalChart {
    constructor(app) { this.app = app; this.cv = $('#hospChart'); this.ctx = this.cv.getContext('2d'); this.s = {}; }
    draw() {
      if (!fitCanvas(this.cv, this.s)) return;
      const ctx = this.ctx, W = this.s.W, H = this.s.H, w = this.app.world, h = w.history, n = h.t.length, beds = w.params.hospitalBeds;
      ctx.setTransform(this.s.dpr, 0, 0, this.s.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      let mx = beds * 1.3;
      for (let i = 0; i < n; i++) if (h.H[i] > mx) mx = h.H[i];
      const xMax = niceMax(n ? h.t[n - 1] : 0, 30), pad = 4;
      const X = (t) => pad + (t / xMax) * (W - pad * 2), Y = (v) => H - 3 - (v / mx) * (H - 14);
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - 2.5); ctx.lineTo(W, H - 2.5); ctx.stroke();
      if (n > 1) {
        ctx.beginPath(); ctx.moveTo(X(h.t[0]), Y(0));
        for (let i = 0; i < n; i++) ctx.lineTo(X(h.t[i]), Y(h.H[i]));
        ctx.lineTo(X(h.t[n - 1]), Y(0)); ctx.closePath();
        ctx.fillStyle = rgba(C.i, 0.35); ctx.fill();
        ctx.beginPath(); for (let i = 0; i < n; i++) { const x = X(h.t[i]), y = Y(h.H[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.strokeStyle = C.i; ctx.lineWidth = 1.6; ctx.stroke();
      }
      const by = Math.round(Y(beds)) + 0.5;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = C.warn; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = `600 10.5px ${MONO}`; ctx.fillStyle = C.warn; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${beds} beds`, W - 2, by - 2);
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText('patients in hospital', 2, 11);
    }
  }

  /* =================== App =================== */
  class App {
    constructor() {
      readColors();
      this.params = Object.assign({}, DEFAULT_PARAMS);
      this.world = new World(Object.assign({}, this.params));
      this.playing = false; this.speed = 15;
      this.tool = 'inspect'; this.selectedId = null; this.hoverId = null;
      this.layers = { sat: false, wifi: false, links: true, radius: false, heat: false, routes: false, labels: true, air: false, weather: true, motion: !reduceMotion };
      this.acc = 0;
      this.light = 'night'; this.tracking = false; this.standbyDismissed = false;
      this.scenarioId = 'baseline'; this.modified = false;
      this.runs = []; this.runCounter = 0; this.currentRun = null;
      this.loggedCount = 0; this.lastUi = 0; this.lastInspector = 0; this.lastCompare = 0; this.lastSlow = 0; this.lastHistLen = -1;
      this.tab = 'sim'; this.level = 0;
      this.cam = new Camera();
      this.sfx = new SoundFX();
      this.effects = new Effects();
      this.heat = new Heatmap();
      this.renderer = new Renderer(this);
      this.curve = new CurveChart(this);
      this.compare = new CompareChart(this);
      this.spread = new SpreadChart();
      this.hospChart = new HospitalChart(this);
      this.world.on('finished', () => this.onFinished());
      this.world.on('outbreakOver', () => this.onOutbreakOver());
      this.buildTiles(); this.buildGauge(); this.buildScenarios(); this.buildParams(); this.buildParamTable();
      this.bind();
      this.afterReset();
      this.setSpeed(15);
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }
    get selected() { return this.selectedId != null ? this.world.agents[this.selectedId] || null : null; }
    darkness() {
      if (this.light === 'night') return 1;
      if (this.light === 'day') return 0;
      const m = this.world.minute, a = this.world.dawn || 350, b = this.world.dusk || 1150;
      if (m < a - 50) return 1;
      if (m < a + 70) return 1 - (m - (a - 50)) / 120;
      if (m < b - 70) return 0;
      if (m < b + 50) return (m - (b - 70)) / 120;
      return 1;
    }

    /* ---------- panels ---------- */
    buildTiles() {
      const tiles = [['S', 'Susceptible', 's'], ['V', 'Vaccinated', 'v'], ['E', 'Exposed', 'e'], ['I', 'Infectious', 'i'], ['R', 'Recovered', 'r'], ['D', 'Died: disease', 'd'], ['X', 'Died: roads', 'x'], ['H', 'In hospital', 'h']];
      $('#tiles').innerHTML = tiles.map(([k, label, c]) => `
        <div class="tile" style="--c:var(--${c})">
          <span class="num" id="n${k}" style="color:var(--${c})">0</span>
          <span class="lab">${label}<b id="p${k}">0%</b></span>
          <canvas id="sp${k}" aria-hidden="true"></canvas>
        </div>`).join('');
      this.sparkState = {};
    }
    buildGauge() {
      let html = '';
      for (let v = 0; v <= 4; v++) {
        const an = Math.PI - (v / 4) * Math.PI, c = Math.cos(an), s = Math.sin(an);
        html += `<line class="g-tick" x1="${100 + c * 64}" y1="${100 - s * 64}" x2="${100 + c * 70}" y2="${100 - s * 70}"/>`;
        html += `<text class="g-num" x="${100 + c * 55}" y="${100 - s * 55 + 3.5}" text-anchor="middle">${v === 4 ? '4+' : v}</text>`;
      }
      $('#gTicks').innerHTML = html;
    }
    buildScenarios() {
      $('#scenarioGrid').innerHTML = SCENARIOS.map((s) => `
        <button type="button" class="scenario" data-scenario="${s.id}" aria-pressed="${s.id === this.scenarioId}">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[s.id]}</svg>
          <b>${esc(s.name)}</b><small>${esc(s.desc)}</small>
        </button>`).join('');
      $('#scenarioGrid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-scenario]');
        if (b) { this.sfx.play('click'); this.applyScenario(b.dataset.scenario); }
      });
    }
    buildParams() {
      const box = $('#params');
      let html = '';
      for (const g of PARAM_UI) {
        const inner = g.items.map((it) => this.paramHtml(it)).join('');
        html += g.advanced || g.fold
          ? `<div class="param-group"><details class="adv" ${g.fold ? 'open' : ''}><summary><h3 class="eyebrow" style="margin:0">${g.group}</h3></summary>${inner}</details></div>`
          : `<div class="param-group"><h3 class="eyebrow">${g.group}</h3>${inner}</div>`;
      }
      html += `<div class="param-foot"><button type="button" class="btn small" id="defaultsBtn">Restore defaults</button></div>`;
      box.innerHTML = html;
      box.addEventListener('input', (e) => this.onParamInput(e));
      box.addEventListener('change', (e) => this.onParamInput(e));
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.stepbtn'); if (!b) return;
        const key = b.dataset.key, it = ALL_PARAMS.find((q) => q.key === key), inp = $('#p-' + key);
        if (!it || !inp) return;
        const step = it.step || 1, dir = parseFloat(b.dataset.dir);
        const v = Math.max(it.min, Math.min(it.max, Math.round((parseFloat(inp.value) + dir * step) / step) * step));
        inp.value = v; this.setParam(key, v); this.sfx.play('click');
      });
      $('#newSeedBtn').addEventListener('click', () => {
        const s = 1 + Math.floor(Math.random() * 9999);
        this.setParam('seed', s); $('#p-seed').value = s;
        this.toast(`New random seed ${s}. Press Reset to use it.`);
      });
      $('#defaultsBtn').addEventListener('click', () => this.applyScenario('baseline', true));
    }
    paramHtml(it) {
      const v = this.params[it.key];
      const tag = it.reset ? `<span class="reset-tag" id="rt-${it.key}" title="Takes effect when you press Reset">on reset</span>` : '';
      if (it.type === 'toggle') return `<label class="switch-row" id="wrap-${it.key}" title="${esc(it.desc)}"><span>${it.label}</span><input type="checkbox" role="switch" id="p-${it.key}" data-key="${it.key}" ${v ? 'checked' : ''}></label>`;
      if (it.type === 'select') return `<div class="param" id="wrap-${it.key}" title="${esc(it.desc)}"><div class="param-top"><label for="p-${it.key}">${it.label}</label></div>
          <select class="sel" id="p-${it.key}" data-key="${it.key}">${it.options.map(([val, lab]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${lab}</option>`).join('')}</select></div>`;
      if (it.type === 'seed') return `<div class="param" title="${esc(it.desc)}"><div class="param-top"><label for="p-seed">${it.label}</label>${tag}</div>
          <div class="seed-row" style="margin-top:6px"><input type="number" id="p-seed" data-key="seed" min="1" max="99999" value="${v}"><button type="button" class="btn small" id="newSeedBtn">New seed</button></div></div>`;
      const fill = ((v - it.min) / (it.max - it.min)) * 100;
      return `<div class="param" id="wrap-${it.key}" title="${esc(it.desc)}">
        <div class="param-top"><label for="p-${it.key}">${it.label}</label>${tag}<span class="val" id="v-${it.key}">${it.fmt(v)}</span></div>
        <div class="param-row">
          <button type="button" class="stepbtn" data-key="${it.key}" data-dir="-1" aria-label="Decrease ${esc(it.label)}">&minus;</button>
          <input type="range" id="p-${it.key}" data-key="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}" style="--fill:${fill}%">
          <button type="button" class="stepbtn" data-key="${it.key}" data-dir="1" aria-label="Increase ${esc(it.label)}">&plus;</button>
        </div>
      </div>`;
    }
    buildParamTable() {
      const tb = $('#paramTable');
      if (!tb) return;
      tb.innerHTML = ALL_PARAMS.map((it) => {
        const d = DEFAULT_PARAMS[it.key];
        const def = it.key === 'seed' ? String(d) : it.type === 'toggle' ? (d ? 'on' : 'off') : it.type === 'select' ? it.options.find((o) => o[0] === d)[1] : it.fmt(d).replace(/<[^>]+>/g, '');
        const range = it.type === 'toggle' ? 'on / off' : it.type === 'seed' ? 'any number' : it.type === 'select' ? it.options.map((o) => o[1].replace(/ \(.*\)/, '')).join(', ') : `${it.min} – ${it.max}`;
        return `<tr><td>${it.label}${it.reset ? ' <span class="reset-tag">on reset</span>' : ''}</td><td class="m">${def}</td><td class="m">${range}</td><td>${esc(it.desc)}</td></tr>`;
      }).join('');
    }
    onParamInput(e) {
      const el = e.target, key = el.dataset && el.dataset.key;
      if (!key) return;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.tagName === 'SELECT') v = el.value;
      else if (key === 'seed') v = Math.max(1, Math.min(99999, parseInt(el.value, 10) || 1));
      else v = parseFloat(el.value);
      this.setParam(key, v);
    }
    setParam(key, v) {
      this.params[key] = v;
      const it = ALL_PARAMS.find((q) => q.key === key);
      if (it && it.fmt) { const lab = $('#v-' + key); if (lab) lab.innerHTML = it.fmt(v); }
      const inp = $('#p-' + key);
      if (inp && it && it.min != null) inp.style.setProperty('--fill', ((v - it.min) / (it.max - it.min)) * 100 + '%');
      if (!RESET_KEYS.includes(key)) {
        this.world.setParams({ [key]: v });
        if (key === 'weather') this.world.updateEnvironment();
        const msg = { schoolsOpen: v ? 'Schools and university reopened' : 'Schools and university closed', marketOpen: v ? 'Bazaar reopened' : 'Bazaar closed', parksOpen: v ? 'Parks reopened' : 'Parks closed', quarantine: v ? 'Test & isolate started' : 'Test & isolate stopped',
          gymOpen: v ? 'Gym reopened' : 'Gym closed', gatheringsOpen: v ? 'Friday prayers and weddings allowed again' : 'Friday prayers and weddings stopped', trafficLights: v ? 'Traffic lights switched on' : 'Traffic lights switched off',
          motorwayFogClose: v ? 'Motorway will close in thick fog' : 'Motorway stays open in fog', cleanKilns: v ? 'Kilns switched to clean zig-zag technology' : 'Kilns back to old technology',
          weather: `Weather set to: ${String(v)}` }[key];
        const now = { trafficLights: 1, motorwayFogClose: 1, cleanKilns: 1, weather: 1 }[key];
        if (msg && this.world.tick > 0) this.world.log('user', msg + (now ? '' : ' (from tomorrow’s plans)'));
      }
      this.modified = true;
      this.syncParamState();
      this.renderScenarioState();
      this.hospChart.draw();
    }
    syncParamState() {
      let pending = false;
      for (const k of RESET_KEYS) {
        const dirty = this.params[k] !== this.world.params[k];
        const tag = $('#rt-' + k);
        if (tag) { tag.classList.toggle('dirty', dirty); tag.textContent = dirty ? 'press Reset' : 'on reset'; }
        if (dirty) pending = true;
      }
      $('#resetDot').hidden = !pending;
      for (const it of ALL_PARAMS) {
        const w = $('#wrap-' + it.key);
        if (!w) continue;
        if (it.dependsOn) w.classList.toggle('disabled', !this.params[it.dependsOn]);
        if (it.showIf) w.classList.toggle('disabled', this.params[it.showIf[0]] !== it.showIf[1]);
      }
    }
    syncParamInputs() {
      for (const it of ALL_PARAMS) {
        const el = $('#p-' + it.key);
        if (!el) continue;
        const v = this.params[it.key];
        if (it.type === 'toggle') el.checked = !!v; else el.value = v;
        if (it.min != null) el.style.setProperty('--fill', ((v - it.min) / (it.max - it.min)) * 100 + '%');
        const lab = $('#v-' + it.key);
        if (lab && it.fmt) lab.innerHTML = it.fmt(v);
      }
      this.syncParamState();
    }
    renderScenarioState() {
      for (const b of document.querySelectorAll('[data-scenario]')) b.setAttribute('aria-pressed', String(b.dataset.scenario === this.scenarioId && !this.modified));
      const sc = SCENARIOS.find((s) => s.id === this.scenarioId);
      $('#scenarioStatus').textContent = this.modified ? `> custom settings (from ${sc ? sc.name : 'Baseline'})` : `> running: ${sc ? sc.name : 'Baseline'}`;
      $('#standbyTitle').textContent = this.modified ? 'Custom settings' : sc ? sc.name : 'Baseline';
    }
    applyScenario(id, restoreSeed) {
      const sc = SCENARIOS.find((s) => s.id === id);
      if (!sc) return;
      const seed = restoreSeed ? DEFAULT_PARAMS.seed : this.params.seed;
      this.params = Object.assign({}, DEFAULT_PARAMS, sc.params, { seed });
      this.scenarioId = id; this.modified = false;
      this.syncParamInputs();
      this.reset();
      this.renderScenarioState();
      this.toast(`${sc.name} loaded. ${this.playing ? 'Running…' : 'Press Start.'}`);
    }

    /* ---------- events ---------- */
    bind() {
      $('#playBtn').addEventListener('click', () => this.togglePlay());
      $('#standbyStart').addEventListener('click', () => { if (!this.playing) this.togglePlay(); });
      $('#stepBtn').addEventListener('click', () => { this.sfx.play('click'); this.stepTicks(60); });
      $('#dayBtn').addEventListener('click', () => { this.sfx.play('click'); this.stepTicks(TICKS_PER_DAY); });
      $('#resetBtn').addEventListener('click', () => { this.sfx.play('click'); this.reset(); this.toast('Simulation reset to Monday 06:00.'); });
      $('#speedSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) this.setSpeed(parseFloat(b.dataset.speed)); });
      $('#toolSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) this.setTool(b.dataset.tool); });
      $('#curveSeg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        this.curve.mode = b.dataset.mode;
        for (const x of $('#curveSeg').children) x.setAttribute('aria-pressed', String(x === b));
        this.curve.draw();
      });
      for (const b of document.querySelectorAll('[data-layer]')) {
        if (b.dataset.layer === 'motion') b.setAttribute('aria-pressed', String(this.layers.motion));
        b.addEventListener('click', () => {
          const key = b.dataset.layer;
          this.layers[key] = !this.layers[key];
          b.setAttribute('aria-pressed', String(this.layers[key]));
          if (key === 'motion') {
            reduceMotion = !this.layers.motion;
            try { localStorage.setItem('ol_motion', this.layers.motion ? 'on' : 'off'); } catch (e) {}
            this.toast(this.layers.motion ? 'Rain, lightning and other motion effects are on' : 'Motion effects off (rain streaks, lightning bolts and splashes are hidden)');
          }
          this.sfx.play('click');
        });
      }
      $('#zoomIn').addEventListener('click', () => { this.dismissStandby(); this.cam.animateTo(this.cam.z * 1.6); });
      $('#zoomOut').addEventListener('click', () => { this.dismissStandby(); this.cam.animateTo(this.cam.z / 1.6); });
      $('#zoomFit').addEventListener('click', () => { this.setTracking(false); this.cam.animateTo(1); });
      $('#trackBtn').addEventListener('click', () => this.setTracking(!this.tracking));
      this.bindMap();
      this.bindMinimap();
      $('#inspector').addEventListener('click', (e) => {
        const b = e.target.closest('[data-select],[data-act]');
        if (!b) return;
        if (b.dataset.select != null) { this.select(parseInt(b.dataset.select, 10)); return; }
        const a = this.selected;
        if (!a) return;
        if (b.dataset.act === 'infect') this.userInfect(a);
        if (b.dataset.act === 'vaccinate') this.userVaccinate(a);
        if (b.dataset.act === 'track') this.setTracking(!this.tracking);
        if (b.dataset.act === 'clear') { this.setTracking(false); this.select(null); }
        this.updateUi(true);
      });
      $('#saveRunBtn').addEventListener('click', () => { this.saveRun(); this.toast('Run saved to Experiments.'); });
      $('#clearRunsBtn').addEventListener('click', () => { this.runs = []; this.currentRun = null; this.renderRuns(); this.compare.draw(); this.toast('Experiments cleared.'); });
      $('#copyCsvBtn').addEventListener('click', () => this.copyCsv());
      $('#fullCsvBtn').addEventListener('click', () => this.downloadFullCsv());
      document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
      document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { this.showTab(b.dataset.goto); window.scrollTo(0, 0); }));
      $('#nightBtn').addEventListener('click', () => this.cycleLight());
      $('#sfxBtn').addEventListener('click', () => this.setSound(!this.sfx.on));
      $('#fsBtn').addEventListener('click', () => this.toggleFullscreen());
      const unlock = () => this.sfx.unlock();
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('keydown', unlock, true);
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
        if (this.tab !== 'sim') return;
        const key = e.key;
        if (key === ' ') { if (t && t.tagName === 'BUTTON') return; e.preventDefault(); this.togglePlay(); }
        else if (key === 'ArrowRight') { e.preventDefault(); this.stepTicks(60); }
        else if (key === 'd' || key === 'D') this.stepTicks(TICKS_PER_DAY);
        else if (key === 'r' || key === 'R') { this.reset(); this.toast('Simulation reset to Monday 06:00.'); }
        else if (key === '1') this.setTool('inspect');
        else if (key === '2') this.setTool('infect');
        else if (key === '3') this.setTool('vaccinate');
        else if (key === '+' || key === '=') { this.dismissStandby(); this.cam.animateTo(this.cam.z * 1.6); }
        else if (key === '-' || key === '_') this.cam.animateTo(this.cam.z / 1.6);
        else if (key === '0') { this.setTracking(false); this.cam.animateTo(1); }
        else if (key === 't' || key === 'T') this.setTracking(!this.tracking);
        else if (key === 'n' || key === 'N') this.cycleLight();
        else if (key === 'm' || key === 'M') this.setSound(!this.sfx.on);
        else if (key === 'f' || key === 'F') this.toggleFullscreen();
      });
      const ro = new ResizeObserver(() => { this.renderer.draw(performance.now()); this.curve.draw(); this.compare.draw(); this.spread.draw(); this.hospChart.draw(); this.drawSparks(); this.drawEnvCharts(); });
      ro.observe($('#mapWrap')); ro.observe($('#curveWrap')); ro.observe($('#compare')); ro.observe($('#spread')); ro.observe($('#tiles')); ro.observe($('#hospChart')); ro.observe($('#aqiChart')); ro.observe($('#roadChart'));
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.curve.draw(); this.compare.draw(); this.spread.draw(); this.hospChart.draw(); });
      document.addEventListener('fullscreenchange', () => $('#fsBtn').setAttribute('aria-pressed', String(!!document.fullscreenElement)));
    }
    bindMap() {
      const cv = $('#world'), tip = $('#tooltip');
      const ptrs = new Map();
      let pinch = null, drag = null;
      const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      cv.addEventListener('pointerdown', (e) => {
        this.dismissStandby();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        const p = local(e);
        ptrs.set(e.pointerId, p);
        if (ptrs.size === 1) drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z }; drag = null; }
      });
      cv.addEventListener('pointermove', (e) => {
        const p = local(e);
        if (ptrs.has(e.pointerId)) {
          ptrs.set(e.pointerId, p);
          if (ptrs.size === 2 && pinch) {
            const [a, b] = [...ptrs.values()];
            this.cam.anim = null;
            this.cam.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pinch.d)));
            return;
          }
          if (drag) {
            if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5) { drag.moved = true; cv.classList.add('dragging'); this.setTracking(false); }
            if (drag.moved) {
              const k = this.cam.k;
              this.cam.cx -= (p.x - drag.x) / k; this.cam.cy -= (p.y - drag.y) / k; this.cam.clamp();
              drag.x = p.x; drag.y = p.y; tip.hidden = true;
              return;
            }
          }
        }
        const w = this.cam.toWorld(p.x, p.y);
        const a = this.world.agentAt(w.x, w.y, Math.max(7, 9 / this.cam.k));
        this.hoverId = a ? a.id : null;
        if (a) {
          tip.textContent = `Person #${a.id} · ${a.state === 'D' ? 'Deceased' : a.isolated ? 'Isolated' : STATE_NAMES[a.state]} · ${a.activity}`;
          tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; tip.hidden = false;
        } else tip.hidden = true;
      });
      const end = (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const p = local(e);
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinch = null;
        if (drag && !drag.moved && e.type === 'pointerup') this.mapClick(p.x, p.y);
        if (ptrs.size === 0) { drag = null; cv.classList.remove('dragging'); }
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('pointerleave', () => { this.hoverId = null; tip.hidden = true; });
      cv.addEventListener('wheel', (e) => {
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
        const nz = clamp(this.cam.z * f, 1, 8);
        if (Math.abs(nz - this.cam.z) < 1e-4) return;
        e.preventDefault();
        this.dismissStandby();
        const p = local(e);
        this.cam.anim = null;
        this.cam.zoomAt(p.x, p.y, nz);
      }, { passive: false });
      cv.addEventListener('dblclick', (e) => { const p = local(e); this.cam.animateTo(this.cam.z * 2, p.x, p.y); });
    }
    bindMinimap() {
      const mm = $('#minimap');
      let down = false;
      const go = (e) => {
        const r = mm.getBoundingClientRect();
        this.setTracking(false);
        this.cam.cx = ((e.clientX - r.left) / r.width) * WORLD_W;
        this.cam.cy = ((e.clientY - r.top) / r.height) * WORLD_H;
        this.cam.clamp();
      };
      mm.addEventListener('pointerdown', (e) => { down = true; try { mm.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } go(e); });
      mm.addEventListener('pointermove', (e) => { if (down) go(e); });
      mm.addEventListener('pointerup', () => { down = false; });
    }
    mapClick(sx, sy) {
      const w = this.cam.toWorld(sx, sy);
      const a = this.world.agentAt(w.x, w.y, Math.max(9, 12 / this.cam.k));
      if (this.tool === 'inspect') { this.select(a ? a.id : null); if (!a) this.setTracking(false); return; }
      if (!a) return;
      if (this.tool === 'infect') this.userInfect(a);
      else if (this.tool === 'vaccinate') this.userVaccinate(a);
      this.select(a.id);
      this.updateUi(true);
    }
    userInfect(a) {
      if (this.world.userInfect(a)) { this.currentRun = null; this.effects.add('user', a.x, a.y); this.sfx.play('infect'); this.toast(`Person #${a.id} is now infectious.`); }
      else this.toast(`Person #${a.id} cannot be infected right now.`);
    }
    userVaccinate(a) {
      if (this.world.userVaccinate(a)) { this.effects.add('vax', a.x, a.y); this.sfx.play('vax'); this.toast(`Person #${a.id} vaccinated.`); }
      else this.toast(`Person #${a.id} is already vaccinated or deceased.`);
    }
    dismissStandby() { if (!this.standbyDismissed) { this.standbyDismissed = true; $('#standby').hidden = true; } }
    setTracking(on) {
      if (on && !this.selected) {
        const pool = this.world.agents.filter((a) => a.state === 'I' && !a.isolated && a.mode !== 'bed' && a.mode !== 'ambulance');
        const alt = this.world.agents.filter((a) => a.age.key === 'child' && a.state !== 'D');
        const pick = pool.length ? pool.reduce((m, a) => (a.secondary > m.secondary ? a : m), pool[0]) : alt[0];
        if (!pick) return;
        this.select(pick.id);
        this.toast(`Following Person #${pick.id}.`);
      }
      this.tracking = !!on;
      $('#trackBtn').setAttribute('aria-pressed', String(this.tracking));
      if (this.tracking) { this.dismissStandby(); if (this.cam.z < 2.6) this.cam.animateTo(3.2); }
      this.insKey = null;
      this.renderInspector();
    }
    cycleLight() {
      const order = ['night', 'day', 'auto'];
      this.setLight(order[(order.indexOf(this.light) + 1) % 3]);
    }
    setLight(mode) {
      this.light = mode;
      const ico = {
        night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
        day: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        auto: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      }[mode];
      $('#nightIco').innerHTML = ico;
      $('#nightLabel').textContent = { night: 'Night', day: 'Day', auto: 'Auto light' }[mode];
      $('#nightBtn').setAttribute('aria-pressed', String(mode !== 'day'));
      if (mode === 'auto') this.toast('Auto light follows the clock: day from 07:00, night from 20:00. Best at ×1–×5.');
      this.sfx.play('click');
    }
    setSound(on) {
      this.sfx.on = on;
      if (on) this.sfx.unlock();
      $('#sfxBtn').setAttribute('aria-pressed', String(on));
      $('#sfxLabel').textContent = on ? 'Sound on' : 'Sound off';
      $('#sfxIco').innerHTML = on
        ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'
        : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>';
      if (on) this.sfx.play('click');
    }
    toggleFullscreen() {
      const d = document;
      if (d.fullscreenElement) { d.exitFullscreen().catch(() => {}); return; }
      const el = d.documentElement;
      if (!el.requestFullscreen) { this.toast('Full screen is not available here. Press F11 instead.'); return; }
      el.requestFullscreen().catch(() => this.toast('Full screen is not available here. Press F11 instead.'));
    }
    showTab(id) {
      this.tab = id;
      for (const t of ['sim', 'twin', 'agent', 'gov', 'paper', 'research', 'how', 'guide']) { $('#tab-' + t).hidden = t !== id; $('#tabbtn-' + t).setAttribute('aria-selected', String(t === id)); }
      try { history.replaceState(null, '', '#' + id); } catch (err) { /* ignore */ }
      if (id === 'sim') requestAnimationFrame(() => { this.curve.draw(); this.compare.draw(); this.spread.draw(); this.hospChart.draw(); this.drawSparks(); this.drawEnvCharts(); });
    }
    setSpeed(s) {
      this.speed = s; this.acc = 0;
      for (const b of $('#speedSeg').children) b.setAttribute('aria-pressed', String(parseFloat(b.dataset.speed) === s));
      const sec = TICKS_PER_DAY / (s * 60);
      $('#speedVal').textContent = `1 day ≈ ${sec >= 10 ? Math.round(sec) : sec.toFixed(1)} s`;
    }
    setTool(t) {
      this.tool = t;
      for (const b of $('#toolSeg').children) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
      $('#world').dataset.tool = t;
      $('#insHint').textContent = { inspect: 'click a person', infect: 'click to infect', vaccinate: 'click to vaccinate', inject: 'click a place for the incident' }[t];
    }
    togglePlay() {
      if (this.world.finished && !this.playing) { this.toast('This outbreak is over. Press Reset or pick a scenario to run again.'); return; }
      this.sfx.unlock();
      this.playing = !this.playing;
      this.dismissStandby();
      this.sfx.play(this.playing ? 'start' : 'pause');
      this.updatePlayBtn();
    }
    updatePlayBtn() {
      const b = $('#playBtn');
      b.dataset.state = this.playing ? 'running' : 'idle';
      b.querySelector('span').textContent = this.playing ? 'Pause' : (this.world.tick > 0 && !this.world.finished ? 'Resume' : 'Start');
      b.querySelector('svg').innerHTML = this.playing ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11l9-5.5z"/>';
    }

    /* one model tick plus the visual events it caused */
    stepWorld() {
      const w = this.world;
      const fin = w.finishedInfections.length, iso = w.flags.isolatedTotal || 0;
      const amb = w.ambulances.map((m) => m.state);
      const acc = w.stats.accidents, mw = w.stats.mwCrashes, heli = w.heli.state;
      w.step();
      if (w.stats.accidents !== acc && w.lastCrash) { this.effects.add('crash', w.lastCrash.x, w.lastCrash.y); this.sfx.play('crash'); }
      if (w.stats.mwCrashes !== mw && w.incidents.length) { const inc = w.incidents[w.incidents.length - 1]; this.effects.add('crash', inc.x, MW_Y); this.sfx.play('crash'); }
      if (heli === 'idle' && w.heli.state === 'takeoff') this.sfx.play('siren');
      const t = w.tick, ri = w.recentInfections;
      let nInf = 0;
      for (let i = ri.length - 1; i >= 0 && ri[i].tick === t; i--) {
        const e = ri[i], b = w.agents[e.to], a = w.agents[e.from];
        this.heat.add(b.x, b.y);
        if (nInf++ < 8) this.effects.add('infect', b.x, b.y, { fx: a.x, fy: a.y });
      }
      if (nInf) this.sfx.play('infect');
      if (w.finishedInfections.length !== fin) for (const a of w.agents) if (a.diedAtTick === t && a.diedWhere !== 'hospital') { this.effects.add('death', a.x, a.y); this.sfx.play('death'); }
      if ((w.flags.isolatedTotal || 0) !== iso) for (const a of w.agents) if (a.isolatedAt === t) { this.effects.add('isolate', a.x, a.y); this.sfx.play('isolate'); }
      for (let i = 0; i < w.ambulances.length; i++) if (amb[i] === 'idle' && w.ambulances[i].state === 'toPatient') this.sfx.play('siren');
    }
    stepTicks(n) {
      for (let i = 0; i < n && !this.world.finished; i++) this.stepWorld();
      this.traffic.update(Math.min(60, n), this.world.plough);
      this.dismissStandby();
      this.updateUi(true);
    }
    reset() { this.world.reset(Object.assign({}, this.params)); this.afterReset(); }
    afterReset() {
      this.currentRun = null; this.selectedId = null; this.hoverId = null; this.loggedCount = 0; this.lastHistLen = -1; this.level = 0;
      this.decor = new Decor(this.world);
      this.traffic = new Traffic(this.world.params.seed);
      this.heat.reset(); this.effects.clear(); this.renderer.smoke.clear();
      this.renderer.invalidate();
      this.standbyDismissed = false;
      $('#standby').hidden = false;
      $('#logList').innerHTML = '';
      $('#csvBox').hidden = true;
      $('#popTotal').textContent = this.world.params.population;
      this.spread.count = -1;
      this.setTracking(false);
      this.syncParamState();
      this.renderScenarioState();
      this.setTool(this.tool);
      this.updateUi(true);
      this.compare.draw();
    }
    select(id) { this.selectedId = id; this.insKey = null; this.renderInspector(); }

    /* ---------- experiments ---------- */
    runName() { const sc = SCENARIOS.find((s) => s.id === this.scenarioId); return this.modified ? `Custom (${sc ? sc.name : 'Baseline'})` : sc ? sc.name : 'Baseline'; }
    liveCurve() {
      const h = this.world.history, N = this.world.params.population, out = [];
      for (let i = 0; i < h.t.length; i += 4) out.push([h.t[i], (h.I[i] / N) * 100]);
      const L = h.t.length - 1;
      if (L >= 0 && L % 4) out.push([h.t[L], (h.I[L] / N) * 100]);
      return out;
    }
    saveRun() {
      const w = this.world, N = w.params.population, c = w.counts();
      const aq = w.history.AQI, aqi = aq.length ? aq.reduce((a, b) => a + b, 0) / aq.length : w.aqi;
      const data = { name: this.runName(), peak: (w.peakI / N) * 100, peakDay: w.peakTick / TICKS_PER_DAY, attack: (w.everInfected / N) * 100, deaths: c.D, road: c.X, aqi, days: w.day, r0: w.r0(), curve: this.liveCurve(), finished: w.finished };
      if (this.currentRun && this.runs.includes(this.currentRun)) Object.assign(this.currentRun, data);
      else {
        data.id = ++this.runCounter;
        data.color = 'run' + (((data.id - 1) % 8) + 1);
        this.runs.push(data);
        if (this.runs.length > 8) this.runs.shift();
        this.currentRun = data;
      }
      this.renderRuns(); this.compare.draw();
    }
    renderRuns() {
      const body = $('#runsBody');
      $('#runsEmpty').hidden = this.runs.length > 0;
      if (!this.runs.length) { body.innerHTML = ''; return; }
      const minPeak = Math.min(...this.runs.map((r) => r.peak)), minDeaths = Math.min(...this.runs.map((r) => r.deaths)), minAttack = Math.min(...this.runs.map((r) => r.attack));
      const many = this.runs.length > 1;
      body.innerHTML = this.runs.map((r) => `
        <tr>
          <td><span class="swatch" style="background:var(--${r.color});box-shadow:0 0 8px var(--${r.color})"></span><b>#${r.id}</b> ${esc(r.name)}${r.finished ? '' : ' <span class="chip">running</span>'}</td>
          <td class="n ${many && r.peak === minPeak ? 'best' : ''}">${r.peak.toFixed(0)}%</td>
          <td class="n">${r.peakDay.toFixed(0)}</td>
          <td class="n ${many && r.attack === minAttack ? 'best' : ''}">${r.attack.toFixed(0)}%</td>
          <td class="n ${many && r.deaths === minDeaths ? 'best' : ''}">${r.deaths}</td>
          <td class="n">${r.road}</td>
          <td class="n">${Math.round(r.aqi)}</td>
          <td class="n">${r.days.toFixed(0)}</td>
          <td class="n">${r.r0 == null ? '–' : r.r0.toFixed(1)}</td>
        </tr>`).join('');
    }
    onOutbreakOver() {
      this.sfx.play('end');
      this.toast(`Outbreak over on day ${this.world.day.toFixed(0)}. The city keeps running (real-world mode) — turn off "Never stop" in settings to end runs automatically.`);
      this.saveRun();
    }
    onFinished() {
      this.playing = false;
      this.saveRun();
      this.updatePlayBtn();
      this.sfx.play('end');
      this.toast(`Outbreak over on day ${this.world.day.toFixed(0)}. Run #${this.currentRun.id} saved to Experiments.`);
    }
    copyCsv() {
      const h = this.world.history;
      const rows = ['day,susceptible,vaccinated_healthy,exposed,infectious,recovered,died_disease,died_roads,in_hospital,air_quality_index,city_stress_pct,city_accidents_total,motorway_vehicles_crashed_total'];
      for (let i = 0; i < h.t.length; i++) rows.push([h.t[i].toFixed(3), h.S[i], h.V[i], h.E[i], h.I[i], h.R[i], h.D[i], h.X[i], h.H[i], h.AQI[i], h.ST[i], h.ACC[i], h.MWA[i]].join(','));
      const csv = rows.join('\n'), box = $('#csvBox');
      const fallback = () => { box.value = csv; box.hidden = false; box.focus(); box.select(); this.toast('Copy the selected text (Ctrl+C) and paste it into Excel.'); };
      try { navigator.clipboard.writeText(csv).then(() => this.toast(`Copied ${rows.length - 1} hourly rows. Paste into Excel or Google Sheets.`), fallback); }
      catch (err) { fallback(); }
    }
    /* full report: every hourly series the model tracks (energy, water, waste, kilns, fuel, illness, wifi, buses, AQI...), downloaded as a .csv file */
    downloadFullCsv() {
      const h = this.world.history;
      const cols = [
        ['day', 't', (v) => v.toFixed(3)], ['susceptible', 'S'], ['vaccinated_healthy', 'V'], ['exposed', 'E'], ['infectious', 'I'], ['recovered', 'R'],
        ['died_disease', 'D'], ['died_roads', 'X'], ['in_hospital', 'H'], ['air_quality_index', 'AQI'], ['city_stress_pct', 'ST'], ['accidents_total', 'ACC'],
        ['motorway_crashed_total', 'MWA'], ['power_demand_kw', 'KW'], ['solar_kw', 'SOLAR'], ['battery_soc_pct', 'SOC'], ['water_tank_pct', 'TANK'],
        ['bin_fill_pct', 'BIN'], ['dashboard_score', 'DASH'], ['temp_c', 'TEMP'], ['service_sla_pct', 'SVC'], ['flood_level', 'FLD'], ['bus_delay_min', 'BUS'],
        ['wifi_coverage_pct', 'WIFI'], ['kilns_burning', 'KILN'], ['sky_tower_floors', 'SKY'], ['amusement_visitors', 'AMU'], ['fuel_litres_hour', 'FUEL'],
        ['common_illness_cases', 'SICK'], ['pharmacy_stock_pct', 'MED'],
      ].filter(([, key]) => h[key] && h[key].length);
      const rows = [cols.map(([name]) => name).join(',')];
      const n = h.t.length;
      for (let i = 0; i < n; i++) rows.push(cols.map(([, key, fmt]) => { const v = h[key][i]; return v == null ? '' : fmt ? fmt(v) : v; }).join(','));
      const csv = rows.join('\n');
      // try an actual file download first (works offline and on GitHub Pages); some hosted preview frames
      // block downloads, so clipboard is always attempted too and the textarea is a last-resort fallback.
      let downloaded = false;
      try {
        const blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `outbreak-lab-day${Math.floor(this.world.day)}-report.csv`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        downloaded = true;
      } catch (e) {}
      const box = $('#csvBox');
      const showBox = () => { box.value = csv; box.hidden = false; box.focus(); box.select(); };
      try {
        navigator.clipboard.writeText(csv).then(
          () => this.toast(downloaded ? `Downloaded ${n} rows × ${cols.length} columns (also copied to clipboard).` : `Copied ${n} rows × ${cols.length} columns. Paste into Excel or Google Sheets.`),
          () => { if (!downloaded) { showBox(); this.toast('Select the text below (Ctrl+C) and paste into Excel.'); } else this.toast(`Downloaded ${n} rows × ${cols.length} columns.`); }
        );
      } catch (e) { if (!downloaded) { showBox(); this.toast('Select the text below (Ctrl+C) and paste into Excel.'); } else this.toast(`Downloaded ${n} rows × ${cols.length} columns.`); }
      this.auditAdd(`Full CSV report: ${n} hourly rows, ${cols.length} columns`);
    }

    /* ---------- live read-outs ---------- */
    phase() {
      const w = this.world, h = w.history, n = h.I.length;
      if (w.finished) return ['over', 'Over'];
      if (w.tick === 0) return ['ready', 'Ready'];
      const now = h.I[n - 1] + h.E[n - 1], prev = n > 24 ? h.I[n - 25] + h.E[n - 25] : h.I[0] + h.E[0];
      if (now > prev * 1.05 + 0.5) return ['growing', 'Growing'];
      if (now < prev * 0.95 - 0.5) return ['declining', 'Declining'];
      return ['steady', 'Steady'];
    }
    threat(c, phase) {
      const w = this.world, N = w.params.population, active = c.E + c.I, prev = active / N;
      if (w.finished) return ['clear', 0, 'All clear', `Outbreak over after ${w.day.toFixed(0)} days · ${w.everInfected} infections · ${c.D} deaths · ${c.X} road deaths`];
      if (w.tick === 0) return ['1', 0, 'Standby', 'Choose a scenario and press Start'];
      if (w.overloaded) return ['4', 4, 'Threat level 4 · Crisis', `Hospital full: ${c.waiting} seriously ill waiting at home`];
      if (prev >= 0.1) return ['3', 3, 'Threat level 3 · Epidemic', `${Math.round(prev * 100)}% of people infected right now`];
      if (prev >= 0.02) return ['2', 2, `Threat level 2 · ${phase === 'declining' ? 'Declining' : 'Spreading'}`, `${active} people infected right now`];
      return ['1', 1, 'Threat level 1 · Monitoring', `${active} people infected right now`];
    }
    updateUi(force) {
      const w = this.world, p = w.params, N = p.population, c = w.counts();
      const clock = `${w.dayName} ${hhmm(w.minute)}`;
      $('#dayNum').textContent = Math.floor(w.day);
      $('#hourNum').textContent = clock;
      $('#hudDay').textContent = `DAY ${Math.floor(w.day)} · ${clock.toUpperCase()}`;
      $('#hudI').textContent = `${c.I} infectious`;
      $('#hudOut').textContent = `${c.out} out · ${c.cars} cars${c.away ? ` · ${c.away} away` : ''}`;
      const [ph, phLabel] = this.phase();
      const pe = $('#phase'); pe.dataset.phase = ph; pe.textContent = phLabel;
      const [lvl, lvlNum, lvlLabel, lvlText] = this.threat(c, ph);
      $('#threat').dataset.level = lvl;
      $('#threatLabel').textContent = lvlLabel;
      $('#threatText').textContent = lvlText;
      if (lvlNum > this.level && lvlNum >= 2 && lvlNum < 4) this.sfx.play('level');
      if (lvlNum === 4 && this.level < 4) this.sfx.play('alarm');
      this.level = lvlNum;
      const vals = { S: c.S - c.V, V: c.V, E: c.E, I: c.I, R: c.R, D: c.D, X: c.X, H: c.H };
      for (const k in vals) { $('#n' + k).textContent = vals[k]; $('#p' + k).textContent = ((vals[k] / N) * 100).toFixed(1) + '%'; }
      const rt = w.rt();
      $('#gNeedle').style.transform = `rotate(${(Math.min(rt == null ? 0 : rt, 4) / 4) * 180}deg)`;
      $('#gVal').textContent = rt == null ? '–' : rt.toFixed(2);
      $('#gVal').style.fill = rt == null ? '' : rt > 2 ? 'var(--i)' : rt > 1 ? 'var(--e)' : 'var(--r)';
      $('#kRtNote').textContent = rt == null ? 'needs 5 finished cases' : rt > 1 ? 'above 1: spreading' : 'below 1: shrinking';
      $('#kRtNote').style.color = rt == null ? '' : rt > 1 ? 'var(--i)' : 'var(--r)';
      const r0 = w.r0();
      $('#kR0').textContent = r0 == null ? '–' : r0.toFixed(2);
      $('#kHit').textContent = r0 == null ? 'ready when first 30 cases end' : r0 > 1 ? `herd immunity at ${Math.round((1 - 1 / r0) * 100)}%` : 'below 1: no epidemic';
      $('#kPeak').textContent = `${w.peakI} · ${((w.peakI / N) * 100).toFixed(0)}%`;
      $('#kPeakDay').textContent = w.peakI ? `on day ${(w.peakTick / TICKS_PER_DAY).toFixed(1)}` : 'day –';
      $('#kAttack').textContent = ((w.everInfected / N) * 100).toFixed(0) + '%';
      $('#kAttackN').textContent = `${w.everInfected} infections`;
      $('#kIso').textContent = c.isolated;
      $('#kIsoNote').textContent = p.quarantine ? `${w.flags.isolatedTotal || 0} isolated so far` : 'test & isolate off';
      // hospital
      const used = w.bedsUsed(), beds = p.hospitalBeds;
      $('#bedChip').textContent = `${used} / ${beds} beds`;
      $('#bedChip').style.color = w.overloaded ? 'var(--danger)' : '';
      const waitNoAmb = w.ambQueue.filter((a) => !a.ambulance).length;
      const bedsEl = $('#beds');
      const key = `${used}|${beds}|${waitNoAmb}`;
      if (bedsEl.dataset.key !== key) {
        bedsEl.dataset.key = key;
        let html = '';
        for (let i = 0; i < beds; i++) html += `<i class="${i < used ? 'used' : ''}"></i>`;
        for (let i = 0; i < Math.min(20, waitNoAmb); i++) html += '<i class="wait" title="Waiting"></i>';
        bedsEl.innerHTML = html;
      }
      $('#kWait').textContent = c.waiting;
      $('#kWait').style.color = waitNoAmb && w.overloaded ? 'var(--danger)' : '';
      $('#kAmb').textContent = `${w.ambulances.filter((m) => m.state !== 'idle').length} / ${w.ambulances.length}`;
      $('#kAdmit').textContent = w.admitted || 0;
      $('#overload').hidden = !w.overloaded;
      const sb = $('#standby');
      const showStandby = w.tick === 0 && !this.playing && !this.standbyDismissed;
      if (sb.hidden === showStandby) sb.hidden = !showStandby;
      const list = $('#logList');
      const colors = { start: 'i', spread: 'e', alert: 'i', care: 'r', death: 'd', peak: 'accent', end: 'ink', user: 'v', road: 'x', weather: 'h', air: 'warn', flight: 'run1', gather: 'run5', network: 'run3', season: 'accent', city: 'run3', ai: 'accent', traffic: 'x', power: 'warn', water: 'run1', waste: 'run5', fire: 'i', sensor: 'h', service: 'v' };
      while (this.loggedCount < w.events.length) {
        const ev = w.events[this.loggedCount++];
        const li = document.createElement('li');
        if (w.tick > 0) li.className = 'fresh';
        const m = (ev.tick + START_MINUTE) % TICKS_PER_DAY;
        li.innerHTML = `<span class="when">D${Math.floor(ev.tick / TICKS_PER_DAY)} ${hhmm(m)}</span><i class="dot" style="background:var(--${colors[ev.type] || 'muted'});color:var(--${colors[ev.type] || 'muted'})"></i><span class="txt">${esc(ev.text)}</span>`;
        list.prepend(li);
      }
      while (list.children.length > 200) list.lastChild.remove();
      $('#logCount').textContent = w.events.length;
      this.updateEnv(c);
      if (force || w.history.t.length !== this.lastHistLen) { this.lastHistLen = w.history.t.length; this.curve.draw(); this.drawSparks(); this.hospChart.draw(); this.drawEnvCharts(); }
      const now = performance.now();
      if (force || now - this.lastInspector > 250) { this.lastInspector = now; this.renderInspector(); }
      if (!this.currentRun && (force || now - this.lastCompare > 600)) { this.lastCompare = now; this.compare.draw(); }
      if (force || now - this.lastSlow > 700) { this.lastSlow = now; this.spread.update(w); this.renderAges(); this.renderWhere(); }
      this.updatePlayBtn();
    }
    /* ---------- weather, air, roads, people & travel ---------- */
    weatherInfo() {
      const w = this.world, p = w.params;
      const ICO = {
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
        rain: '<path d="M7 16a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a4 4 0 0 1 0 8z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>',
        storm: '<path d="M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 7a4 4 0 0 1 0 8"/><path d="M12 11l-2 5h4l-2 5"/>',
        fog: '<path d="M4 7h16M2 11h20M4 15h16M7 19h10"/>',
        smog: '<path d="M3 20V11l5 3v-3l5 3V7h3v13z"/><path d="M15 4c1-1.6 3-1.6 4 0"/>',
        snow: '<path d="M7 16a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a4 4 0 0 1 0 8z"/><path d="M8 19v2M12 19v3M16 19v2M9.5 20.5l-2 1M14.5 20.5l2 1"/>',
      };
      const dark = this.darkness() > 0.5 && this.light === 'auto' ? true : w.night;
      let key = dark ? 'moon' : 'sun', name = dark ? 'Clear night' : 'Sunny';
      if (w.fog > 0.15) { key = p.weather === 'smog' || w.aqi > 200 ? 'smog' : 'fog'; name = p.weather === 'smog' ? 'Smog' : w.fog > 0.45 ? 'Thick fog' : 'Mist'; }
      if (w.rain > 0.12) { key = w.storm ? 'storm' : 'rain'; name = w.storm ? 'Thunderstorm' : w.rain > 0.5 ? 'Heavy rain' : 'Rain'; }
      if (w.snow > 0.08) { key = 'snow'; name = w.snow > 0.4 ? 'Heavy snow' : 'Snow'; }
      const fx = -Math.cos(w.windAng), fy = -Math.sin(w.windAng);
      const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const b = (Math.atan2(fx, -fy) + TAU) % TAU, from = dirs[Math.round(b / (TAU / 8)) % 8];
      const vis = w.fog > 0.05 ? `${Math.round(25 + 375 * Math.pow(1 - w.fog, 2))} m` : '10 km+';
      const plowNote = w.plough ? ' · ploughs clearing the roads' : '';
      return { key, ico: ICO[key], name, note: `Wind ${Math.round(w.windSpd * 6)} km/h from the ${from} · visibility ${vis}${plowNote}` };
    }
    updateEnv(c) {
      const w = this.world, p = w.params, st = w.stats;
      const wx = this.weatherInfo();
      if (this.wxKey !== wx.key) { this.wxKey = wx.key; $('#wxIco').innerHTML = wx.ico; $('#hudWxIco').innerHTML = wx.ico; }
      $('#wxName').textContent = wx.name; $('#wxNote').textContent = wx.note; $('#hudWx').textContent = wx.name; $('#envChip').textContent = `${w.season.name} · ${wx.name}`;
      const aqi = Math.round(w.aqi), cat = aqiCategory(aqi);
      $('#aqiNum').textContent = aqi; $('#aqiNum').dataset.cat = cat.key; $('#aqiCat').textContent = cat.label;
      $('#aqiMark').style.left = Math.min(100, aqi / 4) + '%';
      $('#hudAqi').textContent = `AQI ${aqi}`; $('#hudAqi').dataset.cat = cat.key;
      $('#kPm').textContent = `${w.pm.toFixed(0)} µg/m³`;
      $('#kKilns').textContent = `${w.kilnsOn()} of ${KILN_SITES.length}${p.cleanKilns ? ' · clean' : ''}${w.season.key === 'winter' && p.kilnWinterStop ? ' · winter stop' : ''}`;
      const m = w.minute;
      $('#kSun').textContent = m < 300 || m >= 1200 ? 'Night · sunrise 05:00–07:00' : m < 420 ? 'Sunrise' : m < 1080 ? 'Day · sunset 18:00–20:00' : 'Sunset';
      const today = w.accDaily[w.accDaily.length - 1] || { city: 0, mw: 0 };
      $('#kAcc').textContent = st.accidents; $('#kAccNote').textContent = `${today.city} today · ${st.pedestrians} people on foot hit`;
      $('#kInj').textContent = `${st.injured} · ${c.X}`;
      let waiting = 0, outside = 0;
      const where = { work: 0, school: 0, home: 0, market: 0, gym: 0, pray: 0, wedding: 0, queue: 0, smoke: 0, away: 0, road: 0, hosp: 0 };
      for (const a of w.agents) {
        if (!a.alive) continue;
        if (a.mode === 'drive' && a.queueKey >= 0) waiting++;
        if (a.away) { where.away++; continue; }
        if (a.smoking) where.smoke++;
        if (a.mode === 'walk' || a.mode === 'drive') { where.road++; continue; }
        if (a.mode === 'bed' || a.mode === 'ambulance' || a.mode === 'heli') { where.hosp++; continue; }
        const t = a.place && a.mode === 'inside' ? a.place.type : null;
        if (!t) continue;
        if (t === 'home') where.home++;
        else if (t === 'school' || t === 'university') { if (a.age.key === 'child' || a.job === 'student') where.school++; else where.work++; }
        else if (t === 'market') { if (a.job === 'market') where.work++; else where.market++; }
        else if (t === 'gym') where.gym++;
        else if (t === 'mosque') where.pray++;
        else if (t === 'wedding') where.wedding++;
        else if (t === 'nadra' || t === 'passport') { if (a.job === 'govt') where.work++; else where.queue++; }
        else if (t !== 'park' && t !== 'isolation') where.work++;
        else outside++;
      }
      $('#kCars').textContent = `${c.cars} · ${waiting}`;
      $('#kRed').textContent = st.redRuns; $('#kPolice').textContent = `${p.trafficPolice} traffic police${p.trafficLights ? '' : ' · lights off'}`;
      $('#kMw').textContent = w.mwClosed ? 'closed (fog)' : 'open'; $('#kMw').style.color = w.mwClosed ? 'var(--danger)' : '';
      $('#kMwNote').textContent = `${w.vehicles.filter((v) => !v.crashed).length} vehicles · ${w.incidents.length ? w.incidents.length + ' crash site' + (w.incidents.length > 1 ? 's' : '') : 'no crashes now'}`;
      $('#kMwAcc').textContent = st.mwCrashes; $('#kMwCas').textContent = `${st.mwInjured} injured · ${st.mwKilled} killed`;
      const HS = { idle: 'on the helipad', takeoff: 'taking off', toSite: 'flying to a crash', landing: 'landing at a crash', onSite: 'loading casualties', liftoff: 'taking off', toPad: 'flying to hospital', landPad: 'landing at hospital' };
      $('#kHeli').textContent = w.canFly() || w.heli.state !== 'idle' ? HS[w.heli.state] : 'grounded (weather)';
      $('#kHeliNote').textContent = `${st.heliTrips} rescue flight${st.heliTrips === 1 ? '' : 's'} · ${st.transfers} sent to other cities`;
      $('#roadChip').textContent = `${st.accidents + st.mwCrashes} crashes`;
      const sp = Math.round((w.stressAvg || 0) * 100);
      $('#kStress').textContent = `${sp}%`;
      const sb = $('#stressBar'); sb.style.width = sp + '%'; sb.style.background = sp > 55 ? 'var(--i)' : sp > 38 ? 'var(--e)' : 'var(--r)';
      const NOW = [['work', 'At work'], ['school', 'At school & uni'], ['home', 'At home'], ['market', 'Shopping'], ['gym', 'At the gym'], ['pray', 'At prayers'], ['wedding', 'At a wedding'], ['queue', 'In NADRA queues'], ['smoke', 'Smoking'], ['road', 'On the road'], ['hosp', 'In hospital'], ['away', 'Travelling']];
      const html = NOW.map(([k, l]) => `<div class="now"><b>${where[k]}</b><span>${l}</span></div>`).join('');
      const ng = $('#nowGrid'); if (ng.dataset.h !== html) { ng.dataset.h = html; ng.innerHTML = html; }
      const d0 = w.dayStart(w.dayIndex), todays = w.flights.filter((f) => f.tA >= d0 && f.tA < d0 + TICKS_PER_DAY);
      $('#kFlights').textContent = todays.length; $('#kFlightsNote').textContent = `${todays.filter((f) => f.tA <= w.tick).length} landed today · ${st.landed} in total`;
      const delToday = todays.filter((f) => f.delayMin).length;
      const kDelay = $('#kDelays'); if (kDelay) { kDelay.textContent = delToday; $('#kDelaysNote').textContent = `${st.flightsDelayed} delayed in total · avg ${st.flightsDelayed ? Math.round(st.flightDelayMinTotal / st.flightsDelayed) : 0} min`; }
      $('#kAway').textContent = c.away; $('#kImport').textContent = st.imported;
      let sm = 0, gy = 0; for (const a of w.agents) { if (!a.alive) continue; if (a.smoker) sm++; if (a.gymGoer) gy++; }
      $('#kLife').textContent = `${sm} · ${gy}`;
      $('#lifeChip').textContent = `stress ${sp}%`;
    }
    drawEnvCharts() {
      const w = this.world, h = w.history;
      // air quality index over time, coloured by category
      const cv = $('#aqiChart'), s = this.aqiState || (this.aqiState = {});
      if (fitCanvas(cv, s)) {
        const ctx = cv.getContext('2d'), W = s.W, H = s.H, n = h.t.length;
        ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const mx = Math.max(200, ...h.AQI) * 1.08, xMax = Math.max(niceMax(n ? h.t[n - 1] : 0, 7), 7);
        const X = (t) => 2 + (t / xMax) * (W - 4), Y = (v) => H - 2 - (v / mx) * (H - 6);
        for (const [lvl, col] of [[100, '#f2c94c'], [150, '#ff8a4c'], [200, '#ff4d4f'], [300, '#b14cde']]) {
          if (lvl > mx) continue;
          ctx.strokeStyle = rgba(col, 0.35); ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Math.round(Y(lvl)) + 0.5); ctx.lineTo(W, Math.round(Y(lvl)) + 0.5); ctx.stroke(); ctx.setLineDash([]);
        }
        if (n > 1) {
          const stride = Math.max(1, Math.floor(n / W));
          const g = ctx.createLinearGradient(0, Y(0), 0, Y(Math.min(mx, 400)));
          g.addColorStop(0, '#2ee6a1'); g.addColorStop(Math.min(1, 100 / Math.min(mx, 400)), '#f2c94c'); g.addColorStop(Math.min(1, 160 / Math.min(mx, 400)), '#ff8a4c'); g.addColorStop(Math.min(1, 220 / Math.min(mx, 400)), '#ff4d4f'); g.addColorStop(1, '#b14cde');
          ctx.beginPath(); ctx.moveTo(X(h.t[0]), Y(0));
          for (let i = 0; i < n; i += stride) ctx.lineTo(X(h.t[i]), Y(h.AQI[i]));
          ctx.lineTo(X(h.t[n - 1]), Y(h.AQI[n - 1])); ctx.lineTo(X(h.t[n - 1]), Y(0)); ctx.closePath();
          ctx.globalAlpha = 0.28; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
          ctx.beginPath();
          for (let i = 0; i < n; i += stride) { const x = X(h.t[i]), y = Y(h.AQI[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.stroke();
        }
        ctx.font = `600 10.5px ${MONO}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('air quality index, hourly', 4, 2);
      }
      // road crashes per day
      const rc = $('#roadChart'), rs = this.roadState || (this.roadState = {});
      if (fitCanvas(rc, rs)) {
        const ctx = rc.getContext('2d'), W = rs.W, H = rs.H, days = w.accDaily.slice(-30);
        ctx.setTransform(rs.dpr, 0, 0, rs.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        const mx = Math.max(4, ...days.map((d) => d.city + d.mw));
        const bw = W / 30;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - 1.5); ctx.lineTo(W, H - 1.5); ctx.stroke();
        days.forEach((d, i) => {
          const x = i * bw + bw * 0.15, ww = bw * 0.7, hc = (d.city / mx) * (H - 16), hm = (d.mw / mx) * (H - 16);
          ctx.fillStyle = '#ff8a4c'; ctx.fillRect(x, H - 2 - hc, ww, hc);
          ctx.fillStyle = '#ff4d4f'; ctx.fillRect(x, H - 2 - hc - hm, ww, hm);
        });
        ctx.font = `600 10.5px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#ff8a4c'; ctx.fillText('city accidents', 4, 2); ctx.fillStyle = '#ff4d4f'; ctx.fillText('motorway vehicles', 110, 2);
      }
    }
    drawSparks() {
      const h = this.world.history, n = h.t.length, from = Math.max(0, n - 24 * 40);
      const map = { S: 's', V: 'v', E: 'e', I: 'i', R: 'r', D: 'd', X: 'x', H: 'h' };
      for (const k in map) {
        const cv = $('#sp' + k);
        if (!cv) continue;
        const st = this.sparkState[k] || (this.sparkState[k] = {});
        if (!fitCanvas(cv, st)) continue;
        const ctx = cv.getContext('2d'), W = st.W, H = st.H;
        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (n - from < 2) continue;
        const arr = h[k], col = C[map[k]];
        let mx = 1;
        for (let i = from; i < n; i++) if (arr[i] > mx) mx = arr[i];
        const span = Math.max(24 * 10, n - 1 - from);
        const X = (i) => ((i - from) / span) * W, Y = (v) => H - 2 - (v / mx) * (H - 5);
        ctx.beginPath();
        for (let i = from; i < n; i++) { const x = X(i), y = Y(arr[i]); if (i === from) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        const lx = X(n - 1);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.lineTo(lx, H); ctx.lineTo(X(from), H); ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgba(col, 0.35)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx, Y(arr[n - 1]), 2.2, 0, TAU); ctx.fill();
      }
    }
    renderWhere() {
      const wc = this.world.whereCounts, total = Object.values(wc).reduce((s, v) => s + v, 0);
      const keys = ['home', 'school', 'work', 'market', 'park', 'gym', 'govt', 'gathering', 'airport', 'street', 'hospital'];
      $('#whereRows').innerHTML = keys.map((k) => {
        const pct = total ? (wc[k] / total) * 100 : 0;
        return `<div class="where-row"><span class="lbl"><i class="dot" style="background:${WHERE_COLORS[k]}"></i>${GROUP_LABELS[k]}</span><span class="bar"><i style="width:${pct}%;background:${WHERE_COLORS[k]}"></i></span><span class="num">${wc[k]} · ${pct.toFixed(0)}%</span></div>`;
      }).join('');
      if (total >= 10) {
        const sorted = keys.slice().sort((a, b) => wc[b] - wc[a]);
        $('#whereStat').innerHTML = `<b>${total}</b> infections passed between people. Most happened in <b>${GROUP_LABELS[sorted[0]].toLowerCase()}</b> (${Math.round((wc[sorted[0]] / total) * 100)}%), then ${GROUP_LABELS[sorted[1]].toLowerCase()} (${Math.round((wc[sorted[1]] / total) * 100)}%).`;
      } else $('#whereStat').textContent = 'Appears after the first 10 infections between people.';
    }
    renderAges() {
      const w = this.world;
      const groups = AGE_GROUPS.map((g) => ({ g, n: 0, inf: 0, dead: 0 }));
      for (const a of w.agents) { const o = groups[AGE_GROUPS.indexOf(a.age)]; o.n++; if (a.timesInfected) o.inf++; if (a.state === 'D' && a.deathCause !== 'road') o.dead++; }
      const totalDead = groups.reduce((s, o) => s + o.dead, 0);
      $('#ageRows').innerHTML = groups.map((o) => {
        const ip = o.n ? (o.inf / o.n) * 100 : 0, dp = o.n ? (o.dead / o.n) * 100 : 0;
        const fat = o.inf ? ((o.dead / o.inf) * 100).toFixed(1) : '0.0';
        const share = totalDead ? Math.round((o.dead / totalDead) * 100) : 0;
        return `<div class="age-row">
          <div class="top"><b>${o.g.label}</b><span>${o.n} people</span></div>
          <div class="age-bar"><i class="inf" style="width:${ip}%"></i><i class="dead" style="width:${dp}%"></i></div>
          <div class="top" style="margin-top:4px"><span>${o.inf} infected · ${o.dead} died</span><span>fatality ${fat}% · ${share}% of deaths</span></div>
        </div>`;
      }).join('');
    }
    renderInspector() {
      const box = $('#inspector'), a = this.selected;
      if (!a) {
        if (this.insKey !== 'none') {
          this.insKey = 'none';
          box.innerHTML = `<div class="inspector-empty">
            <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="#2a3d51" stroke-dasharray="3 3"/><circle cx="20" cy="20" r="6" fill="#9fb3c8"/><circle cx="20" cy="20" r="10.5" fill="none" stroke="#46c6e6" stroke-width="2"/></svg>
            <span>Click any person or car on the map to see their home, family, job, today's plan and infection history. Press Track to follow them.</span></div>`;
        }
        return;
      }
      const w = this.world, p = w.params, NA = PAL.night.agents;
      const stateColor = { S: 's', E: 'e', I: 'i', R: 'r', D: 'd' }[a.state];
      const prot = a.protectedBy(p);
      const key = [a.id, a.state, a.vaccinated, prot, a.mask, a.distancing, a.isolated, a.symptomatic, a.severe, a.hospitalized, a.infectedBy, a.infectedIds.length, a.timesInfected, a.generation, this.tracking, a.plan.length, a.planIdx, w.dayIndex, a.smoker, a.gymGoer, a.accidents, a.injured, a.away].join('|');
      if (key !== this.insKey) {
        this.insKey = key;
        const by = a.infectedBy != null ? `<button type="button" class="linklike" data-select="${a.infectedBy}">Person #${a.infectedBy}</button>` : a.timesInfected > 0 ? 'Patient zero' : '–';
        const kids = a.infectedIds.length
          ? `<div class="id-chips">${a.infectedIds.slice(0, 18).map((id) => `<button type="button" data-select="${id}">#${id}</button>`).join('')}${a.infectedIds.length > 18 ? `<span class="chip">+${a.infectedIds.length - 18}</span>` : ''}</div>`
          : '0';
        const fam = a.household.members.filter((m) => m !== a);
        const famHtml = fam.length ? `<div class="id-chips">${fam.map((m) => `<button type="button" data-select="${m.id}" style="color:var(--${{ S: 's', E: 'e', I: 'i', R: 'r', D: 'd' }[m.state]})">#${m.id} ${m.age.key}</button>`).join('')}</div>` : 'Lives alone';
        const badges = [];
        if (a.secondary >= 5) badges.push('<span class="chip" style="color:var(--i)">Super-spreader</span>');
        if (a.severe && a.state === 'I') badges.push('<span class="chip" style="color:var(--i)">Seriously ill</span>');
        if (a.hospitalized) badges.push('<span class="chip" style="color:var(--accent)">In hospital</span>');
        if (a.isolated) badges.push('<span class="chip" style="color:var(--accent)">Isolated</span>');
        if (a.symptomatic && a.state === 'I') badges.push('<span class="chip">Symptoms</span>');
        if (a.injured) badges.push('<span class="chip" style="color:var(--warn)">Injured</span>');
        if (a.away) badges.push('<span class="chip" style="color:var(--accent)">Away</span>');
        if (a.deathCause === 'road') badges.push('<span class="chip" style="color:var(--x)">Road accident</span>');
        const showProg = a.state === 'E' || a.state === 'I';
        const col = NA[a.state];
        const job = JOB_LABEL[a.job] + (a.work ? ` at ${a.work.name}` : a.school ? ` at ${a.school.name}` : '');
        const where = a.infectedWhere ? GROUP_LABELS[PLACE_GROUP[a.infectedWhere]] : a.timesInfected ? 'Started infected' : '–';
        const plan = a.plan.length
          ? `<ul class="plan-list">${a.plan.map((it, i) => `<li class="${i < a.planIdx - 1 ? 'done' : i === a.planIdx - 1 ? 'now' : ''}"><b>${hhmm(it.t)}</b><span>${esc(it.label)}${it.place.type !== 'home' ? ' · ' + esc(it.place.name) : ''}</span></li>`).join('')}</ul>`
          : `<p class="stat-line" style="margin-top:4px">${a.state === 'D' ? 'No plans.' : a.busy ? 'No plans while ill.' : 'Stays at home today.'}</p>`;
        box.innerHTML = `
          <div class="ins-head">
            <svg class="ins-avatar" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="${rgba(col, 0.14)}" stroke="${col}" stroke-width="1.5"/><path d="M8.5 34c1.6-7.5 6-11 11.5-11s9.9 3.5 11.5 11" fill="${col}"/><circle cx="20" cy="15" r="6.5" fill="${SKIN[a.id % 4]}"/>${a.mask ? '<rect x="15" y="16.5" width="10" height="4.5" rx="1.5" fill="#eef4f9"/>' : ''}</svg>
            <span class="ins-name">Person #${a.id}</span>
            <span class="chip" style="color:var(--${stateColor})"><i class="dot" style="background:var(--${stateColor})"></i>${STATE_NAMES[a.state]}</span>${badges.join('')}</div>
          <dl class="ins-grid">
            <dt>Health</dt><dd><span id="insHealth"></span>${showProg ? `<div class="progress"><i id="insProg" style="background:var(--${stateColor})"></i></div>` : ''}</dd>
            <dt>Doing now</dt><dd id="insDoing"></dd>
            <dt>Age group</dt><dd>${a.age.label}</dd>
            <dt>Job</dt><dd>${esc(job)}</dd>
            <dt>Home</dt><dd>${esc(a.home.name)}</dd>
            <dt>Family</dt><dd>${famHtml}</dd>
            <dt>Getting around</dt><dd>${a.household.car && a.age.key === 'adult' ? 'Family car or walks' : 'Walks'}</dd>
            <dt>Mask · vaccine</dt><dd>${a.mask ? 'Mask' : 'No mask'} · ${a.vaccinated ? (prot ? 'protected' : 'vaccinated, not protected') : 'not vaccinated'}</dd>
            <dt>Works from home</dt><dd>${a.distancing ? 'Yes' : 'No'}</dd>
            <dt>Lifestyle</dt><dd>${[a.smoker ? 'Smoker' : 'Non-smoker', a.gymGoer ? 'goes to the gym' : null].filter(Boolean).join(' · ')}</dd>
            <dt>Stress</dt><dd><span id="insStress"></span><div class="progress"><i id="insStressBar"></i></div></dd>
            <dt>Air breathed</dt><dd id="insAir"></dd>
            <dt>Serious illness risk</dt><dd id="insRisk"></dd>
            <dt>Road accidents</dt><dd class="mono">${a.accidents}${a.injured ? ' · injured now' : ''}</dd>
            <dt>Infected by</dt><dd>${by}</dd>
            <dt>Infected at</dt><dd>${esc(where)}</dd>
            <dt>People infected</dt><dd>${kids}</dd>
            <dt>Times infected</dt><dd class="mono">${a.timesInfected}</dd>
          </dl>
          <div class="eyebrow ins-sub">Today's plan · ${w.dayName}</div>
          ${plan}
          <div class="ins-actions">
            <button type="button" class="btn small" data-act="track" aria-pressed="${this.tracking}">${this.tracking ? 'Stop following' : 'Follow on map'}</button>
            ${a.state !== 'D' && (a.state === 'S' || a.state === 'R') ? '<button type="button" class="btn small" data-act="infect">Infect</button>' : ''}
            ${a.state !== 'D' && !a.vaccinated ? '<button type="button" class="btn small" data-act="vaccinate">Vaccinate</button>' : ''}
            <button type="button" class="btn small" data-act="clear">Close</button>
          </div>
          ${a.state !== 'D' ? `<div class="eyebrow ins-sub">Manual override${a.override ? ' · ' + a.override : ''}</div><div class="ins-actions"><button type="button" class="btn small" data-ov="home">Send home</button><button type="button" class="btn small" data-ov="isolate">Isolate</button>${a.override === 'disabled' ? '<button type="button" class="btn small" data-ov="enable">Switch on</button>' : '<button type="button" class="btn small" data-ov="disable">Switch off</button>'}</div>` : ''}`;
      }
      let stateLine = STATE_NAMES[a.state];
      if (a.state === 'E' || a.state === 'I') {
        stateLine += ` · day ${(a.stateTicks / TICKS_PER_DAY).toFixed(1)} of ${(a.stateDuration / TICKS_PER_DAY).toFixed(1)}`;
        const bar = $('#insProg');
        if (bar) bar.style.width = Math.min(100, (a.stateTicks / a.stateDuration) * 100) + '%';
      } else if (a.state === 'R') stateLine += p.immunityWanes ? ` · immune ~${Math.max(0, (a.stateDuration - a.stateTicks) / TICKS_PER_DAY).toFixed(0)} more days` : ' · immune';
      else if (a.state === 'S' && prot) stateLine = 'Protected by vaccine';
      else if (a.state === 'D') stateLine = (a.deathCause === 'road' ? 'Died in a road accident' : 'Died of the disease') + ` · day ${(a.diedAtTick / TICKS_PER_DAY).toFixed(1)}, ${{ hospital: 'in hospital', home: 'at home', road: 'on the road', abroad: 'away from the city' }[a.diedWhere] || 'in the city'}`;
      if (a.alive) {
        const sp = Math.round(a.stress * 100);
        const se = $('#insStress'); if (se) { se.textContent = `${sp}%`; const bar = $('#insStressBar'); bar.style.width = sp + '%'; bar.style.background = sp > 55 ? 'var(--i)' : sp > 38 ? 'var(--e)' : 'var(--r)'; }
        const pm = Math.round(a.exposure * 150), q = aqiCategory(aqiFromPm(pm));
        const ae = $('#insAir'); if (ae) ae.textContent = `PM2.5 ≈ ${pm} µg/m³ (${q.label.toLowerCase()})`;
        const re = $('#insRisk'); if (re) re.textContent = a.age.key === 'child' && !a.smoker ? `${(w.severeChance(a) * 100).toFixed(1)}% if infected` : `${(w.severeChance(a) * 100).toFixed(1)}% if infected${a.smoker ? ' (smoking ×1.8)' : ''}${a.gymGoer ? ' (fitness ×0.6)' : ''}`;
      }
      $('#insHealth').textContent = stateLine;
      $('#insDoing').textContent = a.state === 'D' ? '–' : a.activity;
    }
    toast(msg) {
      const t = $('#toast');
      t.textContent = msg; t.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
    }

    /* ---------- animation loop ---------- */
    loop(now) {
      if (this.playing && !this.world.finished) {
        const budget = performance.now() + 11;
        let n = 0;
        this.acc += this.speed;
        while (this.acc >= 1 && !this.world.finished) {
          this.stepWorld(); n++; this.acc -= 1;
          if ((n & 3) === 0 && performance.now() > budget) { this.acc = Math.min(this.acc, 0.99); break; }
        }
        this.traffic.update(Math.min(30, n * 1.2 + (n ? 0 : 0.3)), this.world.plough);
      }
      if (this.tab === 'sim') {
        this.cam.update();
        const s = this.selected;
        if (this.tracking && s) {
          const f = reduceMotion ? 1 : 0.14;
          this.cam.cx += (s.x - this.cam.cx) * f; this.cam.cy += (s.y - this.cam.cy) * f;
          this.cam.clamp();
        }
        this.renderer.draw(now);
        if (now - this.lastUi > 100) { this.lastUi = now; this.updateUi(false); }
      }
      requestAnimationFrame(this.loop);
    }
    fastForward(daysN) {
      const target = this.world.tick + Math.round(daysN * TICKS_PER_DAY);
      while (this.world.tick < target && !this.world.finished) this.stepWorld();
      this.effects.clear();
      this.updateUi(true);
    }
    goTo(day, minute) {
      const target = Math.round(day * TICKS_PER_DAY + minute - START_MINUTE);
      while (this.world.tick < target && !this.world.finished) this.stepWorld();
      this.effects.clear();
      this.updateUi(true);
    }
  }

  /* =====================================================================
     SMART CITY TAB: control room, registry, roles, audit, validation
     ===================================================================== */
  const ROLE_RANK = { viewer: 0, operator: 1, admin: 2 };
  const NEXT_DAY = new Set(['prayerAttendance', 'funeralGuests', 'groceryDelivery', 'busShare', 'cyclists', 'marketOpen', 'schoolsOpen', 'parksOpen', 'gymOpen', 'gatheringsOpen', 'weddings', 'distancing', 'masks', 'smokers', 'gymGoers']);
  const applyTiming = (it) => (it.reset ? 'on reset' : NEXT_DAY.has(it.key) ? 'next day’s plans' : 'immediately');
  const needRole = (it) => (it.reset ? 'admin' : 'operator');
  const INJ_TXT = { wifi: 'a Wi-Fi outage', fire: 'a fire', crash: 'a road crash', burst: 'a water main burst', fault: 'a transformer fault', outage: 'a grid outage', sensor: 'a sensor failure', flood: 'flood water' };
  const fx = (v, d) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d == null ? 0 : d));

  function tChart(cv, state, h, series, opt) {
    if (!cv || !fitCanvas(cv, state)) return;
    const ctx = cv.getContext('2d'), W = state.W, H = state.H, n = h.t.length;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = rgba(C.line || '#233', 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
    if (n < 2) { ctx.font = `500 11px ${MONO}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('data appears after the first hour', 6, 6); return; }
    let mA = opt.min || 1; for (const s of series) if (s.axis !== 'pct') for (const v of h[s.key]) if (v != null && v > mA) mA = v;
    mA *= 1.08;
    const xMax = Math.max(h.t[n - 1], 1), stride = Math.max(1, Math.floor(n / W));
    let lx = 6;
    ctx.font = `600 10.5px ${MONO}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    for (const s of series) {
      const data = h[s.key], top = s.axis === 'pct' ? 100 : mA;
      ctx.beginPath(); let pen = false;
      for (let i = 0; i < n; i += stride) {
        const v = data[i]; if (v == null) { pen = false; continue; }
        const x = 2 + (h.t[i] / xMax) * (W - 4), y = H - 3 - (Math.min(v, top) / top) * (H - 12);
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.setLineDash(s.dash || []); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = s.color; ctx.fillText(s.name, lx, 2); lx += ctx.measureText(s.name).width + 12;
    }
  }

  Object.assign(App.prototype, {
    initTwin() {
      this.role = 'admin'; this.audit = []; this.twinLast = 0; this.tcState = {};
      const app = this;
      // ---- role-aware setParam / scenarios / reset
      const setParam0 = this.setParam.bind(this), applyScenario0 = this.applyScenario.bind(this);
      // every write is checked: known setting, valid type, inside the slider range (whoever asks: you, a CSV, an idea or the agent)
      const clean = (it, v) => {
        if (it.type === 'toggle') return typeof v === 'boolean' ? v : v === 'true' || v === 1 ? true : v === 'false' || v === 0 ? false : undefined;
        if (it.type === 'select') { const o = (it.options || []).find((q) => q[0] === v || String(q[0]) === String(v)); return o ? o[0] : undefined; }
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
        if (!Number.isFinite(n)) return undefined;
        if (it.type === 'seed') return Math.max(1, Math.min(99999, Math.round(n)));
        return it.min != null && it.max != null ? Math.min(it.max, Math.max(it.min, n)) : n;
      };
      this.setParam = (key, v) => {
        const it0 = typeof key === 'string' ? ALL_PARAMS.find((q) => q.key === key) : null;
        if (!it0) { this.auditAdd(`REJECTED: unknown setting "${String(key).slice(0, 40)}"`); return; }
        const cv = clean(it0, v);
        if (cv === undefined) { this.auditAdd(`REJECTED: ${it0.label} → invalid value "${String(v).slice(0, 30)}"`); this.syncParamInputs(); return; }
        v = cv;
        const it = it0, need = needRole(it);
        if (ROLE_RANK[this.role] < ROLE_RANK[need]) {
          this.toast(`Your role (${this.role}) cannot change "${it ? it.label : key}". ${need === 'admin' ? 'Restart settings need Admin.' : 'Ask an Operator.'}`);
          this.syncParamInputs(); this.auditAdd(`DENIED: ${it ? it.label : key} → ${v}`); return;
        }
        const old = this.params[key];
        setParam0(key, v);
        if (old !== v) this.auditAdd(`${it ? it.label : key}: ${this.fmtParam(it, old)} → ${this.fmtParam(it, v)} (${it ? applyTiming(it) : 'live'})`);
      };
      this.applyScenario = (id, restoreSeed) => {
        if (ROLE_RANK[this.role] < 1) { this.toast('Viewers cannot load scenarios.'); return; }
        applyScenario0(id, restoreSeed); this.auditAdd(`Scenario loaded: ${(SCENARIOS.find((s) => s.id === id) || {}).name || id}`);
      };
      // ---- controls
      $('#roleSel').addEventListener('change', (e) => { this.role = e.target.value; this.auditAdd(`Role changed to ${this.role}`); this.roleUi(); });
      $('#exportBtn').addEventListener('click', () => this.exportSettings());
      $('#importBtn').addEventListener('click', () => { if (ROLE_RANK[this.role] < 2) { this.toast('Importing settings needs the Admin role.'); this.auditAdd('DENIED: import settings'); return; } const b = $('#ioBox'); b.value = ''; b.placeholder = 'Paste exported settings JSON here'; b.readOnly = false; b.hidden = false; $('#ioBar').hidden = false; b.focus(); });
      $('#ioApply').addEventListener('click', () => this.importSettings($('#ioBox').value));
      $('#ioClose').addEventListener('click', () => { $('#ioBox').hidden = true; $('#ioBar').hidden = true; });
      $('#exportCsvBtn').addEventListener('click', () => this.exportTwinCsv());
      $('#dispatchBtn').addEventListener('click', () => {
        if (ROLE_RANK[this.role] < 1) { this.toast('Sending inspectors needs the Operator role.'); this.auditAdd('DENIED: dispatch inspectors'); return; }
        const m = this.world.dispatch(false); this.toast(m); this.auditAdd(`Dispatch: ${m}`); this.updateUi(true);
      });
      $('#aiRows').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-adv]'); if (!b) return;
        if (ROLE_RANK[this.role] < 1) { this.toast('Acting on advice needs the Operator role.'); this.auditAdd('DENIED: AI advice'); return; }
        const k = b.dataset.adv, w = this.world; let m = '';
        if (k === 'mode') { this.setParam('satMode', 'full'); const el = $('#p-satMode'); if (el) el.value = 'full'; m = 'Satellite set to the full multi-sensor mode'; }
        else if (k === 'dispatch') m = w.dispatch(false);
        else if (k === 'smog') { this.setParam('constructionAqiBan', true); const el = $('#p-constructionAqiBan'); if (el) el.checked = true; m = `Construction will stop in smog. ${w.sendAlert()}`; }
        this.toast(m); this.auditAdd(`AI advice applied: ${m}`); this.refreshControls && this.refreshControls(); this.updateUi(true);
      });
      $('#kilnRows').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-kiln]'); if (!b) return;
        if (ROLE_RANK[this.role] < 1) { this.toast('Controlling a kiln needs the Operator role.'); this.auditAdd('DENIED: kiln control'); return; }
        const i = +b.dataset.kiln, o = this.world.kilnOverride, cur = o[i];
        o[i] = cur == null ? false : cur === false ? true : null;
        this.auditAdd(`Kiln ${i + 1}: ${o[i] === false ? 'stopped by operator' : o[i] === true ? 'forced on' : 'back to automatic'}`); this.updateUi(true);
      });
      $('#alertBtn').addEventListener('click', () => {
        if (ROLE_RANK[this.role] < 1) { this.toast('Sending an alert needs the Operator role.'); this.auditAdd('DENIED: emergency alert'); return; }
        const msg = this.world.sendAlert(); this.toast(msg); this.auditAdd(`Emergency alert: ${msg}`); this.updateUi(true);
      });
      $('#injSev').addEventListener('input', (e) => { $('#injSevV').textContent = e.target.value; });
      $('#injMin').addEventListener('input', (e) => { const m = +e.target.value; $('#injMinV').textContent = m === 0 ? 'until fixed' : `${m / 60} h`; });
      $('#injGo').addEventListener('click', () => this.injectNow(null));
      $('#injMap').addEventListener('click', () => { this.setTool('inject'); this.showTab('sim'); this.toast(`Click the map to place ${INJ_TXT[$('#injType').value]}.`); });
      this.buildRegistry(); this.roleUi(); this.renderAudit(); this.initAi();
      // map click with the inject tool, manual override buttons in the inspector
      const mapClick0 = this.mapClick.bind(this);
      this.mapClick = (sx, sy) => { if (this.tool === 'inject') { const w = this.cam.toWorld(sx, sy); this.injectNow(w); return; } mapClick0(sx, sy); };
      $('#inspector').addEventListener('click', (e) => {
        const b = e.target.closest('[data-ov]'); if (!b || !this.selected) return;
        if (ROLE_RANK[this.role] < 1) { this.toast('Manual override needs the Operator role.'); this.auditAdd(`DENIED: override ${b.dataset.ov}`); return; }
        const msg = this.world.manual(this.selected, b.dataset.ov);
        this.auditAdd(`Override #${this.selected.id} ${b.dataset.ov}: ${msg}`); this.toast(msg); this.insKey = null; this.updateUi(true);
      });
      const upd0 = this.updateUi.bind(this);
      this.updateUi = (force) => { upd0(force); const t = performance.now(); if (this.tab === 'twin' && (force || t - this.twinLast > 450)) { this.twinLast = t; this.updateTwin(); } };
      const reset0 = this.afterReset.bind(this);
      this.afterReset = () => { reset0(); this.auditAdd('Simulation restarted'); };
    },
    fmtParam(it, v) {
      if (!it) return String(v);
      if (it.type === 'toggle') return v ? 'on' : 'off';
      if (it.type === 'select') { const o = it.options.find((q) => q[0] === v); return o ? o[1] : String(v); }
      if (it.fmt) return it.fmt(v).replace(/<[^>]+>/g, '');
      return String(v);
    },
    auditAdd(text) {
      const w = this.world;
      this.audit.unshift({ day: w ? Math.floor(w.day) : 0, clock: w ? hhmm(w.minute) : '', role: this.role, text });
      if (this.audit.length > 300) this.audit.length = 300;
      this.renderAudit();
    },
    renderAudit() {
      const ul = $('#auditList'); if (!ul) return;
      $('#auditCount').textContent = this.audit.length;
      ul.innerHTML = this.audit.slice(0, 60).map((a) => `<li><span class="when">D${a.day} ${a.clock}</span><span class="aud-role">${a.role}</span><span>${esc(a.text)}</span></li>`).join('') || '<li class="empty">No changes yet.</li>';
    },
    roleUi() {
      $('#roleNote').textContent = { viewer: 'Read only: you can look, but not change anything.', operator: 'Can change live settings, inject incidents and use manual overrides.', admin: 'Full control, including restart settings and import.' }[this.role];
      document.body.dataset.role = this.role;
    },
    buildRegistry() {
      const rows = [];
      for (const g of PARAM_UI) for (const it of g.items) rows.push(`<tr><td>${esc(it.label)}</td><td>${esc(g.group.replace(/:.*/, ''))}</td><td class="n" data-reg="${it.key}">–</td><td class="n">${esc(this.fmtParam(it, DEFAULT_PARAMS[it.key]))}</td><td>${applyTiming(it)}</td><td>${needRole(it)}</td></tr>`);
      $('#regBody').innerHTML = rows.join('');
      this.regCells = [...document.querySelectorAll('[data-reg]')];
    },
    exportSettings() {
      const data = { format: 'outbreak-lab-settings', version: 5, params: this.params, audit: this.audit.slice(0, 100) };
      const b = $('#ioBox'); b.value = JSON.stringify(data, null, 1); b.readOnly = true; b.hidden = false; $('#ioBar').hidden = true; b.focus(); b.select();
      try { navigator.clipboard.writeText(b.value).then(() => this.toast('Settings copied. Paste them into a text file.'), () => this.toast('Copy the selected text (Ctrl+C).')); } catch (err) { this.toast('Copy the selected text (Ctrl+C).'); }
      this.auditAdd('Settings exported');
    },
    importSettings(text) {
      let d; try { d = JSON.parse(text); } catch (err) { this.toast('That is not valid JSON.'); return; }
      if (!d || d.format !== 'outbreak-lab-settings' || !d.params) { this.toast('Not an Outbreak Lab settings file.'); return; }
      let n = 0, bad = 0, resetNeeded = false;
      for (const [k, v] of Object.entries(d.params)) {
        const it = ALL_PARAMS.find((q) => q.key === k);
        if (!it) { bad++; continue; }
        let val = v;
        if (it.type === 'toggle') val = !!v;
        else if (it.type === 'select') { if (!it.options.some((o) => o[0] === v)) { bad++; continue; } }
        else if (it.type === 'seed') val = Math.max(1, Math.min(99999, Math.round(+v) || 1));
        else { val = +v; if (!Number.isFinite(val)) { bad++; continue; } val = Math.max(it.min, Math.min(it.max, val)); }
        if (this.params[k] === val) continue;
        this.setParam(k, val); n++; if (it.reset) resetNeeded = true;
      }
      this.syncParamInputs();
      if (resetNeeded) this.reset();
      this.auditAdd(`Settings imported: ${n} changed, ${bad} ignored`);
      this.toast(`Imported ${n} settings${bad ? `, ${bad} ignored` : ''}${resetNeeded ? '. Simulation restarted.' : '.'}`);
      $('#ioBox').hidden = true; $('#ioBar').hidden = true;
    },
    injectNow(pt) {
      if (ROLE_RANK[this.role] < 1) { this.toast('Injecting incidents needs the Operator role.'); this.auditAdd('DENIED: inject incident'); return; }
      const type = $('#injType').value, sev = +$('#injSev').value, minutes = +$('#injMin').value;
      const msg = this.world.inject(type, { sev, minutes, x: pt ? pt.x : undefined, y: pt ? pt.y : undefined });
      $('#injMsg').textContent = msg; this.toast(msg); this.auditAdd(`Incident: ${msg} (severity ${sev}${minutes ? `, ${minutes / 60} h` : ''}${pt ? `, at ${Math.round(pt.x)},${Math.round(pt.y)}` : ', random place'})`);
      this.currentRun = null; this.updateUi(true);
    },
    exportTwinCsv() {
      const h = this.world.history, cols = ['t', 'KW', 'SOLAR', 'SOC', 'TANK', 'BIN', 'AQI', 'DASH', 'TEMP', 'SVC', 'FLD', 'BUS'];
      const rows = [['day', 'power_demand_kw', 'solar_kw', 'battery_pct', 'water_tank_pct', 'bin_fill_pct', 'air_index_true', 'air_index_dashboard', 'temperature_c', 'open_requests', 'flood_pct', 'buses_running'].join(',')];
      for (let i = 0; i < h.t.length; i++) rows.push(cols.map((c) => (c === 't' ? h.t[i].toFixed(3) : h[c][i] == null ? '' : h[c][i])).join(','));
      const b = $('#ioBox'); b.value = rows.join('\n'); b.readOnly = true; b.hidden = false; $('#ioBar').hidden = true; b.focus(); b.select();
      this.toast(`${rows.length - 1} hourly rows ready. Copy (Ctrl+C) and paste into Excel.`);
    },
    validationRows() {
      const w = this.world, c = w.counts(), N = w.params.population;
      const E = w.en, W = w.wa, S = w.wst;
            const people = c.S + c.E + c.I + c.R + c.D + c.X;
      const rows = [
        ['Energy balance', E.maxResidual, E.maxResidual < 1e-6, 'supply = demand served + battery change + curtailment, every step'],
        ['Battery limits', E.socOk ? 0 : 1, E.socOk, 'battery charge stays between 0 and 100% of its capacity'],
        ['Water balance', W.maxResidual, W.maxResidual < 1e-6, 'inflow − delivered − leaks − overflow = change in tank'],
        ['Waste balance', S.maxResidual, S.maxResidual < 1e-4, 'bins at start + produced = collected + burnt + still in bins'],
        ['People accounted for', Math.abs(people - N), people === N, 'every person is in exactly one health state'],
      ];
      return rows;
    },
    aiStamp() { const w = this.world; return `AI updated ${new Date().toLocaleTimeString()} \u00b7 city time Day ${Math.floor(w.day)} ${hhmm(w.minute)}${this.playing ? '' : ' \u00b7 paused'}`; },
    updateAi() {
      const w = this.world; if (!w) return;
      const R = w.aiReport(), W = R.worstItems, B = R.bestItem, stamp = this.aiStamp();
      const col = (v) => (v > 75 ? 'var(--ok)' : v > 50 ? 'var(--warn)' : 'var(--danger)');
      const w0 = W[0];
      if (this.tab === 'sim') {
        $('#aiSimChip').textContent = `${R.overall} / 100`; $('#aiSimClock').textContent = stamp;
        $('#aiSimBest').textContent = `${B.title}: ${B.best}`; $('#aiSimWorst').textContent = `${w0.title}: ${w0.worst}`;
        $('#aiSimRec').textContent = w0.rec; $('#aiSimUpd').textContent = w0.update;
      }
      if (this.tab === 'twin') {
        $('#aiOverall').textContent = `${R.overall} / 100`; $('#aiClock').textContent = stamp;
        $('#aiBest').textContent = `${B.title}: ${B.best}`;
        $('#aiWorst').textContent = `${w0.title} (${w0.score}/100): ${w0.worst}`;
        $('#aiRecs').innerHTML = W.map((x) => `<li><b>${esc(x.title)}:</b> ${esc(x.rec)}</li>`).join('');
        $('#aiUpds').innerHTML = W.map((x) => `<li><b>${esc(x.title)}:</b> ${esc(x.update)}</li>`).join('');
        $('#aiScores').innerHTML = R.items.map((x) => `<div class="sc-row"><span>${esc(x.title)}</span><div class="sc-bar"><i style="width:${x.score}%;background:${col(x.score)}"></i></div><b>${x.score}</b></div>`).join('');
        for (const x of R.items) {
          const el = this.aiBoxes && this.aiBoxes[x.key]; if (!el) continue;
          for (const e of el) e.innerHTML = `<span class="ai-tag">AI ${x.score}/100</span> <b>Best:</b> ${esc(x.best)} <b>Worst:</b> ${esc(x.worst)} <b>Update:</b> ${esc(x.update)} <b>Do now:</b> ${esc(x.rec)}`;
        }
      }
    },
    initAi() {
      const map = { 'Energy': 'energy', 'Water': 'water', 'Waste': 'waste', 'City services': 'services', 'Daily life & transport': 'traffic', 'Kilns seen from space': 'kiln', 'City TV news': 'media', 'Traffic cameras and e-challan': 'traffic', 'AI advisor and air forecast': 'kiln', 'Construction, Sky Tower, Funland': 'venues', 'Wi-Fi network': 'network', 'City scorecard': 'health', 'Sensors: truth vs control room': 'network', 'Fuel & resource use': 'resources', 'Common illness & chronic conditions': 'illness', 'Real-world scale': 'resources' };
      this.aiBoxes = {};
      for (const card of document.querySelectorAll('#tab-twin .twin-grid > .card')) {
        const title = (card.querySelector('.card-title') || {}).textContent; const key = map[title && title.trim()]; if (!key) continue;
        const d = document.createElement('div'); d.className = 'ai-box'; d.textContent = 'AI is reading the city...';
        (card.querySelector('.card-body') || card).appendChild(d);
        (this.aiBoxes[key] = this.aiBoxes[key] || []).push(d);
      }
      setInterval(() => { if (this.tab === 'twin') this.updateTwin(); this.updateAi(); }, 1000);
    },
    updateTwin() {
      const w = this.world, p = w.params, E = w.en, Wt = w.wa, S = w.wst, c = w.counts(), st = w.stats, h = w.history;
      const q = {};
      const outage = w.tick < E.outageUntil;
      q.gridChip = outage ? 'OUTAGE' : E.signalsOn ? 'grid online' : 'brown-out';
      q.kwDemand = `${fx(E.demand)} · ${fx(E.served)} kW`;
      q.solarBat = `${fx(E.solar)} kW · ${fx(100 * E.bat / Math.max(1, p.batteryKwh))}%`;
      q.gridDiesel = `${fx(E.grid)} kW · ${E.diesel > 0 ? 'on' : 'off'}`;
      q.sigLights = `${E.signalsOn ? 'on' : 'OFF (flashing)'} · ${E.lightsOn ? 'on' : 'OFF'}`;
      q.unserved = `${fx(E.tot.unserved, 1)} kWh · ${fx(E.tot.outageMin / 60, 1)} h`;
      q.bill = `${fx(E.tot.cost / 1000, 1)}k`;
      q.waterChip = Wt.stress > 0.3 ? 'SHORTAGE' : 'supplied';
      q.tank = `${fx(Wt.tank)} / ${p.tankCapacity} m³ (${fx(100 * Wt.tank / p.tankCapacity)}%)`;
      q.wDemand = `${fx(Wt.demand, 1)} · ${fx(Wt.delivered, 1)} m³/tick`;
      q.wStress = `${fx(100 * Wt.stress)}%`;
      q.pumpLeak = `${fx(Wt.pump, 1)} · ${fx(Wt.leak, 1)} m³/tick`;
      q.bursts = String(Wt.bursts.length);
      q.flood = `${fx(100 * w.flood)}%`;
      const over = w.bins.filter((b) => b.overflowed).length;
      q.wasteChip = over ? `${over} overflowing` : 'collected';
      q.wGen = `${fx(S.generated / 1000, 2)} · ${fx(S.collected / 1000, 2)} t`;
      q.wDisp = `${fx(S.recycled / 1000, 2)} · ${fx(S.landfill / 1000, 2)} · ${fx(S.burnt / 1000, 2)} t`;
      q.overNow = String(over); q.overTot = String(S.overflowEvents);
      q.trucks = `${w.rigs.filter((r) => r.kind === 'waste' && !r.idle).length} / ${w.rigs.filter((r) => r.kind === 'waste').length}`;
      q.svcChip = `${w.svc.open.length} open`;
      q.reqOpen = String(w.svc.open.length);
      const resp = w.svc.resp.length ? w.svc.resp.reduce((a, b) => a + b, 0) / w.svc.resp.length : null;
      q.reqDone = `${w.svc.done} · ${resp == null ? '–' : fx(resp) + ' min'}`;
      q.crews = `${w.rigs.filter((r) => r.kind === 'crew' && !r.idle).length}/${w.rigs.filter((r) => r.kind === 'crew').length} · ${w.rigs.filter((r) => r.kind === 'fire' && !r.idle).length}/${w.rigs.filter((r) => r.kind === 'fire').length}`;
      q.fires = `${w.fires.length} · ${st.fires || 0}`;
      q.fireHurt = `${st.fireInjured || 0} · ${st.fireDeaths || 0}`;
      q.strikes = `${st.strikes || 0} \u00b7 ${st.strikeFaults || 0} faults \u00b7 ${st.strikeFires || 0} fires`;
      const Sat = w.sat, Co = w.cons, Am = w.amuse, Sk = w.skyStat;
      q.seasonChip = w.season.name;
      q.ksSeason = `${w.season.name} · ${fx(w.tempC)} \u00b0C`;
      q.ksMode = { swir: 'SWIR heat only', optical: 'optical', thermal: 'optical + ground heat', full: 'full (+ radar)' }[p.satMode];
      q.ksTrue = `${w.kilnsOn()} of ${KILN_SITES.length}${p.kilnWinterStop && w.season.key === 'winter' ? ' (winter stop)' : ''}`;
      q.ksPass = Sat.passes ? `#${Sat.passes} at ${hhmm(Sat.tick % 1440)} \u00b7 ${Sat.blocked ? 'fog or rain: poor view' : 'clear view'}` : 'waiting for the first pass';
      q.ksSays = Sat.passes ? `${Sat.hot} burning` : '–';
      q.ksWrong = Sat.passes ? `${Sat.falseAlarm} false alarm, ${Sat.missed} missed` : '–';
      q.ksReg = `${Math.min(p.kilns, 8)} of ${Math.min(p.kilns, 8)} (all certified)`;
      q.ksZig = Sat.passes ? `${Sat.built - Sat.sham} \u00b7 ${Sat.predZig}` : `${w.kZig.slice(0, Math.min(p.kilns, 8)).filter(Boolean).length} \u00b7 –`;
      q.ksInv = Sat.passes ? `${Sat.invErr > 0 ? '+' : ''}${Sat.invErr}%` : '–';
      q.ksCover = Sat.passes ? `${fx(Sat.cover)}%` : '–';
      q.ksShare = `${fx(100 * w.emK / Math.max(1, w.emAll))}%`;
      const Dd = w.dispatchStat;
      q.ksDisp = `${Dd.sent} \u00b7 ${Dd.sealed} \u00b7 ${Dd.wasted}${Dd.sent ? ` (precision ${Math.round(100 * Dd.hits / Dd.sent)}%)` : ''}`;
      q.ksLast = Dd.last;
      q.ksRows = KILN_SITES.map((k, i) => { const st = Sat.kilns[i] || {}, on = w.kilnOn(i), ov = w.kilnOverride[i], sealed = w.kilnSealed[i] > w.tick; return `<tr><td>${k.name}${w.kNight[i] ? ' <small>(night)</small>' : ''}</td><td>${!Sat.passes ? '–' : !st.seen ? 'not seen' : st.hot ? '<b style="color:var(--danger)">burning</b>' : 'cold'}</td><td>${i >= p.kilns ? 'none built' : sealed ? 'sealed' : on ? 'burning' : 'stopped'}</td><td>${Sat.passes && i < p.kilns ? (st.predZig ? 'zigzag' : 'FCBK') : '–'} / ${w.kZig[i] ? 'zigzag' : 'FCBK'}</td><td class="n">${fx(w.pm25At(k.x, k.y))}</td><td><button type="button" class="btn small" data-kiln="${i}">${ov === false ? 'Stopped (click)' : ov === true ? 'Forced on (click)' : 'Auto (click)'}</button></td></tr>`; }).join('');
      // TV, challan, AI
      const nw = w.news;
      q.tvChip = `${Math.round(100 * w.awareness)}% aware`;
      q.tvHead = nw.length ? nw[0].text : 'Waiting for news...'; q.tvCh = nw.length ? nw[0].ch : '';
      q.tvAware = `${Math.round(100 * w.awareness)}%`; q.tvCount = `${w.newsSeq}`;
      q.tvRows = nw.slice(0, 7).map((n) => `<tr><td>${hhmm(n.tick % 1440)}</td><td>${esc(n.ch)}</td><td>${esc(n.text)}</td></tr>`).join('');
      const Ch = w.chal;
      q.chChip = `${Ch.n} challans`; q.chN = `${Ch.n}`; q.chK = `${Ch.speed} \u00b7 ${Ch.red}`; q.chF = `${Ch.fines.toLocaleString()} PKR`; q.chR = `${Ch.repeat}`; q.chA = `${st.redRuns} \u00b7 ${st.accidents}`;
      q.chRows = Ch.list.map((c) => `<tr><td>${c.plate}</td><td>${c.kind === 'speed' ? 'speeding' : 'red light'}</td><td class="n">${c.kind === 'speed' ? c.speed + ' km/h' : '–'}</td><td class="n">${c.fine}</td></tr>`).join('');
      const Fc = w.fc;
      q.aiChip = Fc.advice.length && Fc.advice[0][2] !== 'none' ? `${Fc.advice.length} suggestion${Fc.advice.length > 1 ? 's' : ''}` : 'all clear';
      q.aiFc = Fc.aqi.length ? Fc.aqi.join(' \u00b7 ') : 'needs one hour of data';
      q.aiErr = Fc.n ? `${fx(Fc.err / Fc.n)} AQI points (${Fc.n} checks)` : '–';
      q.aiActs = p.aiAutopilot ? `${Fc.aiActs} (autopilot on)` : 'autopilot off';
      q.aiRows = Fc.advice.map((a) => `<tr><td><b>${esc(a[0])}</b></td><td>${esc(a[1])}</td><td>${['smog', 'mode', 'dispatch'].includes(a[2]) ? `<button type="button" class="btn small" data-adv="${a[2]}">Do it</button>` : ''}</td></tr>`).join('');
      const R = w.aiReport(), KA = R.kiln, li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('');
      q.kgChip = `${w.kilnsOn()} kilns · AQI ${fx(w.aqi)}`; q.kgTime = this.aiStamp();
      q.kgGot = li(KA.got); q.kgGood = li(KA.good); q.kgBad = li(KA.bad); q.kgUpd = li(KA.upd); q.kgRec = li(KA.rec);
      q.nfChip = `${Math.floor(Co.floors)} floors built`;
      q.nfCons = p.constructionOn ? `${Math.floor(Co.floors)} of 30 floors \u00b7 ${p.constructionWorkers} workers` : 'site closed';
      q.nfConsSt = `${Co.why} \u00b7 dust ${Co.dust ? fx(Co.dust) : 0}`;
      q.nfSky = `${Sk.occ || 0} people \u00b7 peak ${Sk.peak}`;
      q.nfSky2 = `${Sk.wait || 0} min \u00b7 ${fx(w.sky ? w.sky.kw || 0 : 0)} kW`;
      q.nfAmu = `${Am.now || 0} people \u00b7 peak ${Am.peak}`;
      q.nfAmu2 = `${!p.amusementOpen ? 'closed by you' : (w.rain >= 0.3 || w.storm) ? 'closed: weather' : (w.minuteNow >= 900 && w.minuteNow < 1410) ? 'open' : 'closed: not open yet'} \u00b7 ${fx(w.amusement ? w.amusement.kw || 0 : 0)} kW`;
      q.nfAmu3 = `${w.stats.amuseVisits || 0}`;
      q.nfEv = `${Math.round((w.nCars || 0) * p.evShare / 100)} cars \u00b7 ${fx(w.extraKw || 0)} kW now`;
      const Fu = w.fuel, Co2 = w.common, Ph = w.pharmacy, RW = w.realWorldEstimate();
      q.fuelChip = `${fx(Fu.litresToday)} L today`;
      q.fuelToday = `${fx(Fu.litresToday)} L \u00b7 ${fx(Fu.costToday, 0)} PKR`;
      q.fuelTotal = `${fx(Fu.litres, 0)} L \u00b7 ${fx(Fu.cost, 0)} PKR so far`;
      q.waterUse = `${fx(Wt.demand, 2)} m\u00b3/h \u00b7 ${p.waterPerCapita}% of normal`;
      q.elecUse = `${fx(E.demand, 0)} kW \u00b7 ${p.electricityUsageMul}% of normal`;
      q.commonChip = `${Co2.flu + Co2.cough + Co2.fever + Co2.sore} sick now`;
      q.commonNow = `flu ${Co2.flu} \u00b7 cough ${Co2.cough} \u00b7 fever ${Co2.fever} \u00b7 sore throat ${Co2.sore}`;
      q.commonTotal = `${Co2.everSick} cases so far`;
      q.chronicShare = `diabetic ${fx(100 * w.agents.filter((a) => a.diabetic).length / p.population, 1)}% \u00b7 hypertensive ${fx(100 * w.agents.filter((a) => a.hypertensive).length / p.population, 1)}% \u00b7 asthma ${fx(100 * w.agents.filter((a) => a.asthmatic).length / p.population, 1)}%`;
      q.medStock = `${fx(100 * Ph.stock / Math.max(1, p.medicineStock), 0)}% (${Math.round(Ph.stock).toLocaleString()} units)`;
      q.medUsed = `${Ph.used} used \u00b7 ${Ph.shortages} shortages`;
      q.rwScale = p.realCityScale === 1 ? 'this simulated city' : `\u00d7${p.realCityScale.toLocaleString()} (about ${RW.population.toLocaleString()} people)`;
      q.rwWater = `${RW.waterMLD} million L/day`;
      q.rwElec = `${RW.electricityMW} MW`;
      q.rwFuel = `${RW.fuelLitresDay.toLocaleString()} L/day`;
      q.rwWaste = `${RW.wasteTonnesDay} tonnes/day`;
      q.rwMed = `${RW.medicineUnitsDay.toLocaleString()} units/day`;
      q.rwBeds = `${RW.hospitalBedsNeeded.toLocaleString()} beds \u00b7 ${RW.kilnsNeeded} kilns`;
      q.fogChip = `${fx(100 * w.fog, 0)}% \u00b7 visibility ${fx(Math.max(0.1, 10 * (1 - w.fog) * (1 - 0.5 * w.rain)), 1)} km`;
      const Wf = w.wifi;
      q.wifiChip = Wf.active < Math.min(p.wifiAps, Wf.aps.length) ? `${Wf.active} online (some down)` : `${Wf.active} online`;
      q.wfUsers = `${Wf.connected} of ${Wf.devices} phones (${fx(100 * Wf.connected / Math.max(1, Wf.devices))}%)`;
      q.wfLoad = `${fx(Wf.demand)} / ${fx(Wf.capacity)} Mbit/s`;
      q.wfQ = `${fx(100 * Wf.quality)}%`;
      q.wfCov = `${fx(Wf.coverage)}% of the city area`;
      q.wfAlerts = `${Wf.alerts} sent \u00b7 ${Wf.wentHome} went home`;
      q.wfRows = Wf.aps.map((ap, i) => `<tr><td>${esc(ap.name)}</td><td>${i >= p.wifiAps ? 'not installed' : ap.on ? (ap.load > 1 ? '<b style="color:var(--warn)">congested</b>' : 'online') : (w.tick < ap.offlineUntil ? '<b style="color:var(--danger)">DOWN</b>' : '<b style="color:var(--danger)">no power</b>')}</td><td class="n">${ap.users}</td><td class="n">${fx(100 * ap.load)}%</td><td class="n">${fx(100 * ap.bat)}%</td></tr>`).join('');
      // city scorecard: simple, documented rules (see the Research tab), each 0-100
      const nDay = Math.max(0.25, w.day), Nn = p.population, E0 = w.en.tot, W0 = w.wa.tot;
      const sc = [
        ['Power reliability', 100 * (1 - E0.unserved / Math.max(1, E0.demand + E0.unserved))],
        ['Water security', 100 * (1 - W0.unmet / Math.max(1, W0.demand))],
        ['Clean streets', 100 * (1 - w.bins.filter((b) => b.overflowed).length / Math.max(1, w.bins.length))],
        ['Connectivity', Wf.coverage * 0 + 100 * (Wf.devices ? Wf.connected / Wf.devices : 1) * Wf.quality * 0.5 + 50 * Wf.quality],
        ['Air quality', Math.max(0, 100 - w.aqi / 3.5)],
        ['Road & fire safety', Math.max(0, 100 - 3 * (st.accidents || 0) / nDay - 8 * (st.fires || 0) / nDay)],
        ['Public health', Math.max(0, 100 - 1000 * (c.E + c.I) / Nn * 0.5 - 4 * (c.D / Math.max(1, Nn)) * 100)],
      ];
      q.score = `${fx(sc.reduce((a, b) => a + b[1], 0) / sc.length)} / 100`;
      q.scoreRows = sc.map(([n, v]) => `<div class="sc-row"><span>${n}</span><div class="sc-bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%;background:${v > 75 ? 'var(--ok)' : v > 50 ? 'var(--warn)' : 'var(--danger)'}"></i></div><b>${fx(v)}</b></div>`).join('');
      q.bus2 = `${w.buses.length ? fx(100 * w.buses.reduce((a, b) => a + b.riders.length, 0) / (w.buses.length * p.busCapacity)) : 0}% full on average`;
      q.ambYield = `${w.ambulances.filter((m) => m.state !== 'idle').length}/${w.ambulances.length} · ${st.yielded || 0}`;
      q.reqList = w.svc.open.slice(0, 6).map((r) => `<div class="req"><b>${esc(REQUEST_TYPES[r.type] ? REQUEST_TYPES[r.type].label || r.type : r.type)}</b><span>${r.crew ? 'crew on the way' : 'waiting'} · ${fx(w.tick - r.t0)} min</span></div>`).join('') || '<p class="stat-line">No open requests.</p>';
      const nb = w.buses.length;
      q.lifeChip = `${nb} bus${nb === 1 ? '' : 'es'}`;
      q.busNow = `${nb} · ${c.bus} riders`;
      q.busRides = String(st.busRides || 0);
      q.bikes = String(c.bikes || 0);
      const pr = PRAYERS.find((x) => w.minute >= x.t && w.minute < x.t + 25);
      q.prayer = pr ? pr.k : 'next: ' + (PRAYERS.find((x) => x.t > w.minute) || PRAYERS[0]).k;
      q.funerals = `${w.funerals} · ${w.buried}`;
      q.deliv = String(st.delivered || 0);
      const crowd = (pl) => w.agents.filter((a) => a.place === pl && a.mode === 'inside').length;
      q.shops = `${crowd(w.mart)} · ${crowd(w.mandi)}`;
      // smart parking: how many household cars are out and about vs parked at a destination vs garaged at home
      { const totalCars = w.households.reduce((n, h) => n + (h.car ? 1 : 0), 0), outCars = w.households.reduce((n, h) => n + (h.carInUse ? 1 : 0), 0);
        let parkedPublic = 0; for (const pl of w.places) if (pl.type !== 'home' && pl.parked) parkedPublic += pl.parked;
        const driving = Math.max(0, outCars - parkedPublic);
        q.parking = `${parkedPublic} parked · ${driving} driving`;
        q.parkingHome = `${Math.max(0, totalCars - outCars)} of ${totalCars}`; }
      // sensors
      const sens = w.sensors;
      q.sensChip = `${sens.filter((s) => s.online).length}/${sens.length} online`;
      q.sensRows = sens.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${fx(s.actual, s.kind === 'air' ? 0 : 1)}</td><td class="n">${s.measured == null ? '–' : fx(s.measured && s.measured.v != null ? s.measured.v : s.measured, s.kind === 'air' ? 0 : 1)}</td><td class="n">${s.received ? fx(s.received.v, s.kind === 'air' ? 0 : 1) : '–'}</td><td>${s.online ? (w.tick - s.rxTick > 3 * Math.max(10, p.sensorInterval) ? 'stale' : 'ok') : '<b style="color:var(--danger)">OFFLINE</b>'}</td></tr>`).join('');
      q.aqiPair = `${fx(w.aqi)} · ${w.dash.aqi == null ? 'no data' : fx(w.dash.aqi)}`;
      q.smogWrong = `${st.smogWrong || 0} · ${st.smogBlind || 0}`;
      // validation
      const vr = this.validationRows(), ok = vr.every((r) => r[2]);
      q.valChip = ok ? 'ALL PASS' : 'FAIL';
      q.valRows = vr.map((r) => `<tr><td>${r[0]}</td><td class="n">${r[1].toExponential(1)}</td><td class="${r[2] ? 'best' : ''}" style="${r[2] ? '' : 'color:var(--danger);font-weight:600'}">${r[2] ? 'pass' : 'FAIL'}</td><td>${r[3]}</td></tr>`).join('');
      q.regCount = `${this.regCells.length} settings`;
      for (const el of document.querySelectorAll('#tab-twin [data-k]')) { const v = q[el.dataset.k]; if (v == null) continue; if (el.tagName === 'TBODY' || el.classList.contains('req-list') || el.classList.contains('score')) { if (el._v !== v) { el.innerHTML = v; el._v = v; } } else if (el.textContent !== v) el.textContent = v; }
      for (const cell of this.regCells) { const it = ALL_PARAMS.find((x) => x.key === cell.dataset.reg), t = this.fmtParam(it, this.params[it.key]); if (cell.textContent !== t) cell.textContent = t; }
      const cs = this.tcState;
      const cvs = (n) => document.querySelector(`[data-chart="${n}"]`);
      tChart(cvs('energy'), cs.e || (cs.e = {}), h, [{ key: 'KW', name: 'demand kW', color: '#ff8a4c' }, { key: 'SOLAR', name: 'solar kW', color: '#f2d94c' }, { key: 'SOC', name: 'battery %', color: '#4cc9f0', axis: 'pct', dash: [4, 3] }], { min: 100 });
      tChart(cvs('water'), cs.w || (cs.w = {}), h, [{ key: 'TANK', name: 'tank %', color: '#4cc9f0', axis: 'pct' }, { key: 'FLD', name: 'flood %', color: '#9b5de5', axis: 'pct' }], {});
      tChart(cvs('waste'), cs.s || (cs.s = {}), h, [{ key: 'BIN', name: 'bin fill % (avg)', color: '#6fcf97', axis: 'pct' }], {});
      tChart(cvs('bus'), cs.b || (cs.b = {}), h, [{ key: 'BUS', name: 'buses running', color: '#f4b942' }], { min: 4 });
      tChart(cvs('kiln'), cs.k || (cs.k = {}), h, [{ key: 'KILN', name: 'kilns burning', color: '#ff7a1a' }], {});
      tChart(cvs('fuel'), cs.fu || (cs.fu = {}), h, [{ key: 'FUEL', name: 'litres/hour', color: '#f2b01e' }], {});
      tChart(cvs('sick'), cs.si || (cs.si = {}), h, [{ key: 'SICK', name: 'people with flu/cough/fever', color: '#e67e9b' }, { key: 'MED', name: 'medicine stock %', color: '#4cc9f0', axis: 'pct', dash: [4, 3] }], {});
      tChart(cvs('wifi'), cs.f || (cs.f = {}), h, [{ key: 'WIFI', name: 'phones on Wi-Fi %', color: '#46c6e6', axis: 'pct' }], {});
      tChart(cvs('aqi'), cs.a || (cs.a = {}), h, [{ key: 'AQI', name: 'true', color: '#ff8a4c' }, { key: 'DASH', name: 'dashboard', color: '#b197fc', dash: [4, 3] }], { min: 150 });
    },
  });

  function start() {
    const app = new App();
    window.outbreakLab = app;
    app.initTwin();
    const hash = (location.hash || '').replace('#', '');
    if (['how', 'guide', 'twin', 'research', 'agent', 'paper', 'gov'].includes(hash)) app.showTab(hash);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  function drawPerson(ctx, a, x, y, r, P, col, px, opts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(opts && opts.heading != null ? opts.heading : a.heading);
    if (opts && opts.bob) ctx.scale(1 + opts.bob, 1 + opts.bob);
    if (P.shadow) { ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.3, r * 0.75, r * 1.05, 0, 0, TAU); ctx.fill(); }
    const skin = SKIN[a.id % 4];
    const moving = a.mode === 'walk';
    const sw = opts && opts.swing != null ? opts.swing : moving ? Math.sin((a.x + a.y) * 0.55) * r * 0.45 : 0;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(sw + r * 0.22, -r * 0.98); ctx.arc(sw, -r * 0.98, r * 0.22, 0, TAU);
    ctx.moveTo(-sw + r * 0.22, r * 0.98); ctx.arc(-sw, r * 0.98, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 1.0, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.3, px); ctx.strokeStyle = P.outline; ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(r * 0.06, 0, r * 0.46, 0, TAU); ctx.fill();
    ctx.fillStyle = HAIR[(a.id >> 2) % 5];
    ctx.beginPath(); ctx.arc(r * 0.06, 0, r * 0.46, Math.PI * 0.5, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    if (a.mask) { ctx.fillStyle = P.maskDot; ctx.fillRect(r * 0.2, -r * 0.3, r * 0.3, r * 0.6); }
    ctx.restore();
  }
  function drawGrave(ctx, x, y, r, P) {
    ctx.fillStyle = P.grave;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y + r * 0.8); ctx.lineTo(x - r * 0.55, y - r * 0.3);
    ctx.arc(x, y - r * 0.3, r * 0.55, Math.PI, 0); ctx.lineTo(x + r * 0.55, y + r * 0.8); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.graveMark; ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.35);
    ctx.moveTo(x - r * 0.28, y - r * 0.2); ctx.lineTo(x + r * 0.28, y - r * 0.2);
    ctx.stroke();
  }


  /* =================== CurveChart =================== */
  class CurveChart {
    constructor(app) {
      this.app = app; this.cv = $('#curve'); this.ctx = this.cv.getContext('2d'); this.tip = $('#curveTip');
      this.mode = 'stacked'; this.hoverX = null; this.s = {};
      this.cv.addEventListener('pointermove', (e) => { this.hoverX = e.clientX - this.cv.getBoundingClientRect().left; this.draw(); });
      this.cv.addEventListener('pointerleave', () => { this.hoverX = null; this.tip.hidden = true; this.draw(); });
    }
    draw() {
      if (!fitCanvas(this.cv, this.s)) return;
      const ctx = this.ctx, W = this.s.W, H = this.s.H;
      ctx.setTransform(this.s.dpr, 0, 0, this.s.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const world = this.app.world, h = world.history, N = world.params.population, n = h.t.length;
      const pad = { l: 40, r: 12, t: 10, b: 26 };
      const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      const lastT = n ? h.t[n - 1] : 0;
      const xMax = niceMax(lastT, 30);
      const X = (t) => pad.l + (t / xMax) * pw;
      const Y = (v) => pad.t + ph - (v / N) * ph;
      ctx.font = `11px ${MONO}`; ctx.lineWidth = 1; ctx.textBaseline = 'middle';
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const y = Math.round(pad.t + ph - f * ph) + 0.5;
        ctx.strokeStyle = f === 0 ? C['line-strong'] : C.line;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(`${f * 100}%`, pad.l - 6, y);
      }
      const step = niceStep(xMax, 6);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let d = 0; d <= xMax + 0.001; d += step) {
        const x = Math.round(X(d)) + 0.5;
        ctx.strokeStyle = C['line-strong']; ctx.beginPath(); ctx.moveTo(x, pad.t + ph); ctx.lineTo(x, pad.t + ph + 4); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.fillText(d === 0 ? 'day 0' : String(d), x, pad.t + ph + 7);
      }
      if (n >= 2) {
        const stride = Math.max(1, Math.floor(n / pw));
        const idx = [];
        for (let i = 0; i < n; i += stride) idx.push(i);
        if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
        if (this.mode === 'stacked') {
          let base = new Float64Array(idx.length);
          for (const key of ORDER) {
            const top = idx.map((i, j) => base[j] + h[key][i]);
            ctx.beginPath();
            idx.forEach((i, j) => { const x = X(h.t[i]), y = Y(top[j]); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            for (let j = idx.length - 1; j >= 0; j--) ctx.lineTo(X(h.t[idx[j]]), Y(base[j]));
            ctx.closePath();
            ctx.fillStyle = rgba(C[SERIES[key].color], key === 'S' ? 0.16 : key === 'V' ? 0.45 : 0.85);
            ctx.fill();
            base = top;
          }
        } else {
          for (const key of [...ORDER].reverse()) {
            ctx.beginPath();
            idx.forEach((i, j) => { const x = X(h.t[i]), y = Y(h[key][i]); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            ctx.strokeStyle = C[SERIES[key].color]; ctx.lineWidth = key === 'I' ? 2.6 : 1.8; ctx.lineJoin = 'round';
            if (key === 'I') { ctx.shadowColor = C.i; ctx.shadowBlur = 10; }
            ctx.stroke(); ctx.shadowBlur = 0;
          }
          const li = n - 1;
          ctx.fillStyle = C.i; ctx.beginPath(); ctx.arc(X(h.t[li]), Y(h.I[li]), 3.5, 0, TAU); ctx.fill();
        }
      }
      if (this.hoverX != null && n >= 2 && this.hoverX >= pad.l) {
        const t = ((this.hoverX - pad.l) / pw) * xMax;
        let lo = 0, hi = n - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (h.t[m] < t) lo = m + 1; else hi = m; }
        const i = lo;
        if (t <= lastT + 0.5) {
          const x = Math.round(X(h.t[i])) + 0.5;
          ctx.strokeStyle = rgba(C.ink, 0.6); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
          let html = `<div class="t">Day ${h.t[i].toFixed(1)}</div>`;
          for (const key of ORDER) html += `<div class="r"><span><i class="dot" style="background:var(--${SERIES[key].color})"></i>${SERIES[key].label}</span><b>${h[key][i]} · ${((h[key][i] / N) * 100).toFixed(0)}%</b></div>`;
          this.tip.innerHTML = html; this.tip.hidden = false;
          const tw = this.tip.offsetWidth;
          let left = x + 12;
          if (left + tw > W) left = x - tw - 12;
          this.tip.style.left = Math.max(0, left) + 'px';
        } else this.tip.hidden = true;
      }
    }
  }


  /* =================== CompareChart =================== */
  class CompareChart {
    constructor(app) { this.app = app; this.cv = $('#compare'); this.ctx = this.cv.getContext('2d'); this.s = {}; }
    draw() {
      if (!fitCanvas(this.cv, this.s)) return;
      const ctx = this.ctx, W = this.s.W, H = this.s.H, app = this.app;
      ctx.setTransform(this.s.dpr, 0, 0, this.s.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const series = app.runs.map((r) => ({ curve: r.curve, color: C[r.color], dashed: false, label: `#${r.id}` }));
      if (!app.currentRun) series.push({ curve: app.liveCurve(), color: C.ink, dashed: true, label: 'now' });
      let tMax = 0, yMax = 0;
      for (const s of series) for (const [t, v] of s.curve) { if (t > tMax) tMax = t; if (v > yMax) yMax = v; }
      const xMax = niceMax(tMax, 30);
      const ys = niceStep(Math.max(10, yMax * 1.15), 4);
      const yTop = Math.max(10, Math.ceil((yMax * 1.15) / ys) * ys);
      const pad = { l: 40, r: 12, t: 10, b: 26 };
      const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      const X = (t) => pad.l + (t / xMax) * pw;
      const Y = (v) => pad.t + ph - (v / yTop) * ph;
      ctx.font = `11px ${MONO}`; ctx.lineWidth = 1; ctx.textBaseline = 'middle';
      for (let val = 0; val <= yTop + 0.001; val += ys) {
        const y = Math.round(Y(val)) + 0.5;
        ctx.strokeStyle = val === 0 ? C['line-strong'] : C.line;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(`${val}%`, pad.l - 6, y);
      }
      const xs = niceStep(xMax, 5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let d = 0; d <= xMax + 0.001; d += xs) { ctx.fillStyle = C.muted; ctx.fillText(d === 0 ? 'day 0' : String(d), Math.round(X(d)) + 0.5, pad.t + ph + 7); }
      const placed = [];
      for (const s of series) {
        if (s.curve.length < 2) continue;
        ctx.beginPath();
        s.curve.forEach(([t, v], j) => { const x = X(t), y = Y(v); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.strokeStyle = s.color; ctx.lineWidth = s.dashed ? 1.6 : 2.2; ctx.lineJoin = 'round';
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.shadowColor = s.color; ctx.shadowBlur = s.dashed ? 0 : 6;
        ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
        let pk = s.curve[0];
        for (const pt of s.curve) if (pt[1] > pk[1]) pk = pt;
        if (pk[1] > 0.5) {
          ctx.font = `600 11px ${MONO}`;
          const lw = ctx.measureText(s.label).width + 4;
          const lx = X(pk[0]);
          let ly = Y(pk[1]) - 4;
          for (let q = 0; q < 6; q++) {
            if (!placed.some((o) => Math.abs(o.x - lx) < (o.w + lw) / 2 && Math.abs(o.y - ly) < 12)) break;
            ly -= 12;
          }
          placed.push({ x: lx, y: ly, w: lw });
          ctx.fillStyle = s.color; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(s.label, lx, Math.max(12, ly));
          ctx.font = `11px ${MONO}`;
        }
      }
    }
  }


  /* =================== SpreadChart: who spreads it? =================== */
  class SpreadChart {
    constructor() { this.cv = $('#spread'); this.ctx = this.cv.getContext('2d'); this.s = {}; this.bins = new Array(11).fill(0); this.count = -1; }
    update(world) {
      const f = world.finishedInfections;
      if (f.length === this.count) return;
      this.count = f.length;
      const bins = new Array(11).fill(0), vals = [];
      for (const e of f) { bins[Math.min(10, e.secondary)]++; vals.push(e.secondary); }
      this.bins = bins;
      const el = $('#spreadStat');
      if (vals.length >= 10) {
        const total = vals.reduce((s, v) => s + v, 0);
        vals.sort((a, b) => b - a);
        const k = Math.max(1, Math.ceil(vals.length * 0.2));
        const top = vals.slice(0, k).reduce((s, v) => s + v, 0);
        el.innerHTML = `<b>${vals.length}</b> finished cases. <b>${Math.round((bins[0] / vals.length) * 100)}%</b> infected nobody, and the top 20% of spreaders caused <b>${total ? Math.round((top / total) * 100) : 0}%</b> of all infections. Most by one person: <b>${vals[0]}</b>.`;
      } else el.textContent = 'Appears when the first 10 cases finish.';
      this.draw();
    }
    draw() {
      if (!fitCanvas(this.cv, this.s)) return;
      const ctx = this.ctx, W = this.s.W, H = this.s.H;
      ctx.setTransform(this.s.dpr, 0, 0, this.s.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const pad = { l: 34, r: 6, t: 14, b: 22 };
      const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      const max = Math.max(...this.bins);
      const yTop = Math.max(5, Math.ceil((max * 1.1) / niceStep(Math.max(5, max * 1.1), 4)) * niceStep(Math.max(5, max * 1.1), 4));
      const st = niceStep(yTop, 4);
      ctx.font = `10.5px ${MONO}`; ctx.lineWidth = 1;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      for (let v = 0; v <= yTop + 0.001; v += st) {
        const y = Math.round(pad.t + ph - (v / yTop) * ph) + 0.5;
        ctx.strokeStyle = v === 0 ? C['line-strong'] : C.line;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.fillText(String(v), pad.l - 6, y);
      }
      const bw = pw / 11;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const cols = [C.s, C.e, C.e, '#ff8a4c', '#ff8a4c', C.i, C.i, C.i, C.i, C.i, C.i];
      for (let i = 0; i < 11; i++) {
        const v = this.bins[i], h = (v / yTop) * ph;
        const x = pad.l + i * bw + bw * 0.14, w = bw * 0.72, y = pad.t + ph - h;
        if (v > 0) {
          ctx.fillStyle = rgba(cols[i], 0.85);
          ctx.shadowColor = cols[i]; ctx.shadowBlur = i >= 5 ? 10 : 0;
          ctx.fillRect(x, y, w, h);
          ctx.shadowBlur = 0;
          ctx.fillStyle = C.ink; ctx.textBaseline = 'bottom';
          ctx.fillText(String(v), x + w / 2, y - 2);
          ctx.textBaseline = 'top';
        }
        ctx.fillStyle = C.muted;
        ctx.fillText(i === 10 ? '10+' : String(i), x + w / 2, pad.t + ph + 5);
      }
    }
  }




})();

