/* =====================================================================
   OUTBREAK LAB v5 — CORE AGENT-BASED MODEL (a real-world smart city digital twin)
   ---------------------------------------------------------------------
   Classes
     Random       seeded random numbers (every run can be repeated)
     SpatialGrid  fast neighbour lookup
     Agent        one person: family, job, daily plan, walking or driving,
                  health, lifestyle (smoking, gym), stress, air exposure
     Ambulance    drives seriously ill and injured people to hospital
     Helicopter   air ambulance for motorway crashes
     Vehicle      through traffic on the motorway (car, bus, truck)
     Bus          public transport on two routes, with stops and passengers
     Rig          service vehicles: fire engine, waste truck, crew van, hearse, delivery van
     World        the city, airport, motorway and brick kilns; weather,
                  air pollution, traffic lights, accidents, flights,
                  energy, water, waste, sensors, service requests,
                  the scheduler and the statistics
   Time: 1 tick = 1 minute. 1440 ticks = 1 day. The run starts Monday 06:00.
   ===================================================================== */

const TICKS_PER_DAY = 1440;
const TICKS_PER_HOUR = 60;
const START_MINUTE = 360; // Monday 06:00
const CITY_W = 1000;      // the city grid
const CITY_H = 600;
const WORLD_W = 1400;     // city + airport + kiln belt + motorway
const WORLD_H = 760;
const BLOCK = 100;
const COLS = 10;
const ROWS = 6;
const ROAD_X = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const ROAD_Y = [100, 200, 300, 400, 500];
const MAIN_X = 500;       // highway (north–south)
const MAIN_Y = 300;       // highway (east–west), continues east as the Airport Road
const SIDEWALK = 3;
const roadHalf = (main) => (main ? 8 : 5);
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------- outskirts ---------- */
const AIRPORT_ROAD_END = 1394;
const AIRPORT_FENCE = { x0: 1012, x1: 1396, y0: 6, y1: 290 };
const RUNWAY = { x0: 1032, x1: 1390, y: 60, half: 9 };
const TAXI_Y = 102;
const APRON = { x0: 1120, x1: 1392, y0: 118, y1: 240 };
const TERMINAL = { x0: 1136, x1: 1390, y0: 244, y1: 286 };
const GATES = [1170, 1225, 1280, 1335];
const GATE_Y = 206;
const MW_Y = 672;                       // motorway centre line (median)
const MW_HALF = 15;
const MW_LANE = [3.6, 7.6, 11.6];        // lane centres from the median: fast, middle, slow
const LINKS = [{ x: 500, y0: CITY_H, y1: MW_Y - MW_HALF }, { x: 1262, y0: MAIN_Y + 8, y1: MW_Y - MW_HALF }];
const SEASONS = [
  { key: 'spring', name: 'Spring', dT: 0, fog: 0.4, rain: 1.1, mix: 1.1, dawn: 335, dusk: 1165, sun: 1.0, out: 1.2, col: '#7bd17b' },
  { key: 'summer', name: 'Summer', dT: 9, fog: 0, rain: 1.6, mix: 1.3, dawn: 300, dusk: 1190, sun: 1.1, out: 0.7, col: '#ffb020' },
  { key: 'autumn', name: 'Autumn', dT: 0, fog: 1, rain: 0.5, mix: 1, dawn: 350, dusk: 1150, sun: 1.0, out: 1, col: '#e08a3c' },
  { key: 'winter', name: 'Winter', dT: -13, fog: 2.2, rain: 0.7, mix: 0.55, dawn: 410, dusk: 1060, sun: 0.7, out: 0.4, col: '#8ec9ff' },
];
const KILN_SITES = [
  { x: 1078, y: 420, name: 'Kiln 1' }, { x: 330, y: 726, name: 'Kiln 2' }, { x: 1335, y: 420, name: 'Kiln 3' }, { x: 760, y: 724, name: 'Kiln 4' },
  { x: 1160, y: 548, name: 'Kiln 5' }, { x: 110, y: 724, name: 'Kiln 6' }, { x: 1345, y: 560, name: 'Kiln 7' }, { x: 1010, y: 726, name: 'Kiln 8' },
];
const laneY = (dir, lane) => MW_Y + (dir > 0 ? -1 : 1) * MW_LANE[lane];

/* utility sites on the outskirts (v5): waste yard, water plant, substation, solar farm */
const WASTE_YARD = { x0: 512, x1: 690, y0: 612, y1: 652 };
const WATER_PLANT = { x0: 330, x1: 488, y0: 610, y1: 654 };
const SUBSTATION = { x0: 1030, x1: 1088, y0: 326, y1: 380 };
const SOLAR_FARM = { x0: 1100, x1: 1244, y0: 324, y1: 398 };
/* the five daily prayers: minute of the day (the model's sunset is 19:10) */
const PRAYERS = [{ k: 'Fajr', t: 310 }, { k: 'Zuhr', t: 765 }, { k: 'Asr', t: 975 }, { k: 'Maghrib', t: 1155 }, { k: 'Isha', t: 1230 }];
const FUNERAL = { mosque: 815, grave: 870 };   // janazah prayer at 13:35, burial at 14:30
/* bus routes along the two highways. A stop has one waiting place on each side of the road. */
const BUS_ROUTES = [
  { id: 0, name: 'Route 1 (Airport Road)', axis: 'h', coord: MAIN_Y, a: 14, b: 1262, stops: [150, 350, 550, 750, 950, 1262], color: '#f4b942' },
  { id: 1, name: 'Route 2 (North–South)', axis: 'v', coord: MAIN_X, a: 14, b: 586, stops: [50, 150, 250, 350, 450, 550], color: '#4cc9f0' },
];
(function buildStops() {
  for (const R of BUS_ROUTES) {
    R.stopList = R.stops.map((pos, idx) => {
      const faces = {};
      for (const dir of [1, -1]) {
        const h = roadHalf(true), sign = R.axis === 'h' ? (dir > 0 ? -1 : 1) : (dir > 0 ? 1 : -1);
        const lane = R.axis === 'h' ? { x: pos, y: R.coord - dir * h * 0.5 } : { x: R.coord + dir * h * 0.5, y: pos };
        const fp = R.axis === 'h' ? { x: pos, y: R.coord + sign * (h + 1.5) } : { x: R.coord + sign * (h + 1.5), y: pos };
        faces[dir] = { side: sign > 0 ? 'N' : 'S', axis: R.axis, coord: R.coord, sign, door: fp, walk: fp, road: R.axis === 'h' ? { x: pos, y: R.coord } : { x: R.coord, y: pos }, lane, queue: [] };
      }
      return { route: R, idx, pos, faces, name: `${R.name.split(' (')[0]}, stop ${idx + 1}` };
    });
  }
})();

/* bus fare effect on how many choose the bus: a free ride attracts more, a dearer one fewer */
const clamp01fare = (fare) => Math.max(0.6, Math.min(1.5, 1 + 0.5 * (60 - fare) / 60));
const WALK_SPEED = 6;    // metres per tick on the footpath (slowed down so you can watch)
const DRIVE_SPEED = 16;  // metres per tick by car at a 50 km/h speed limit
const AMB_SPEED = 22;
const HELI_SPEED = 34;
const CONTACT_EVERY = 5;
const MAX_BEDS = 60;
const SIG_CYCLE = 30;    // traffic light cycle in ticks: N–S green 12, amber 3, E–W green 12, amber 3
const PCELL = 20;        // air pollution grid: 20 m cells
const PCOLS = WORLD_W / PCELL;
const PROWS = WORLD_H / PCELL;
const BG_PM = 22;        // regional background PM2.5 (µg/m³)

/* The city plan: one block per cell, 10 columns x 6 rows of 100 m blocks */
const CITY_PLAN = [
  ['house', 'house', 'park', 'house', 'university', 'office', 'apart', 'house', 'hospital', 'isolation'],
  ['construction', 'school', 'apart', 'house', 'govt', 'office', 'house', 'park', 'police', 'fire'],
  ['apart', 'house', 'house', 'park', 'market', 'mosque', 'apart', 'mart', 'mandi', 'apart'],
  ['amusement', 'house', 'apart', 'house', 'gym', 'office', 'house', 'school', 'house', 'house'],
  ['house', 'factory', 'house', 'house', 'apart', 'wedding', 'house', 'apart', 'park', 'house'],
  ['house', 'factory', 'house', 'apart', 'park', 'house', 'fuel', 'house', 'graveyard', 'apart'],
];
const PLACE_NAMES = {
  university: 'University', office: 'Office Tower', hospital: 'City Hospital', isolation: 'Isolation Centre',
  school: 'School', police: 'Police Station', market: 'Bazaar', factory: 'Factory', park: 'Park', fuel: 'Petrol Station',
  gym: 'PowerHouse Gym', mosque: 'Jamia Masjid', wedding: 'Shadi Hall', nadra: 'NADRA Office', passport: 'Passport Office',
  airport: 'City International Airport', amusement: 'Funland Amusement Park', construction: 'Construction Site', mart: 'Al-Fatah Mart', mandi: 'Sabzi Mandi', fire: 'Fire Station', graveyard: 'Graveyard',
};
/* how risky one minute of close contact is in each kind of place (1 = normal) */
const PLACE_RISK = {
  home: 0.22, school: 1.0, university: 1.0, office: 0.9, factory: 0.8, market: 1.3, police: 0.9,
  fuel: 0.5, hospital: 0.6, isolation: 0, park: 0.6, street: 0.3, amusement: 1.25, construction: 0.5,
  gym: 1.2, nadra: 1.3, passport: 1.3, mosque: 1.1, wedding: 1.4, airport: 1.0,
  mart: 1.1, mandi: 1.5, fire: 0.7, graveyard: 1.15, bus: 1.6,
};
const PLACE_GROUP = {
  home: 'home', school: 'school', university: 'school', office: 'work', factory: 'work', police: 'work', fuel: 'work',
  market: 'market', park: 'park', amusement: 'park', construction: 'work', street: 'street', hospital: 'hospital', isolation: 'hospital',
  gym: 'gym', nadra: 'govt', passport: 'govt', mosque: 'gathering', wedding: 'gathering', airport: 'airport',
  mart: 'market', mandi: 'market', fire: 'work', graveyard: 'gathering', bus: 'transit',
};
const GROUP_LABELS = {
  home: 'Homes', school: 'Schools & university', work: 'Workplaces', market: 'Bazaar, mart & mandi', park: 'Parks', gym: 'Gym',
  govt: 'NADRA & passport', gathering: 'Mosque, weddings & funerals', airport: 'Airport', street: 'Streets', hospital: 'Hospital', transit: 'Buses',
};
const SMOKE_SPOT_TYPES = { office: 1, factory: 1, university: 1, police: 1, hospital: 1, airport: 1, nadra: 1, passport: 1, market: 1, mart: 1, mandi: 1, fire: 1 };

const AGE_GROUPS = [
  { key: 'child', label: 'Child (0–17)', symptomatic: 0.45, severe: 0.01, deathMult: 0.5 },
  { key: 'adult', label: 'Adult (18–64)', symptomatic: 0.70, severe: 0.07, deathMult: 0.8 },
  { key: 'elder', label: 'Elder (65+)', symptomatic: 0.85, severe: 0.30, deathMult: 1.4 },
];
const STATE_NAMES = { S: 'Susceptible', E: 'Exposed', I: 'Infectious', R: 'Recovered', D: 'Deceased' };
/* lifestyle effects on serious illness and on catching the disease */
const SMOKE_SEVERE = 1.8, SMOKE_SUSC = 1.2, GYM_SEVERE = 0.6;

const DEFAULT_PARAMS = {
  population: 500,
  initialInfected: 3,
  transmissionRate: 5,     // % chance per hour of close contact
  infectionRadius: 6,      // metres
  incubationDays: 3,
  infectiousDays: 7,
  mortality: 35,           // % of seriously ill hospital patients who die (×2.5 without a bed)
  distancing: 0,
  masks: 0,
  sickStayHome: 50,
  schoolsOpen: true,
  marketOpen: true,
  parksOpen: true,
  hospitalBeds: 8,
  quarantine: false,
  detectionRate: 50,
  vaccinated: 0,
  vaccineEfficacy: 85,
  immunityWanes: false,
  immunityDays: 90,
  // weather & air
  weather: 'auto',         // auto | clear | rain | storm | fog | smog | snow
  rainChance: 20,          // % of days with a rain spell (auto)
  fogChance: 25,           // % of mornings with fog (auto)
  kilns: 4,                // brick kilns burning around the city (0–8)
  cleanKilns: false,       // zig-zag kiln technology: about 65% less smoke
  factorySmoke: 100,       // % of normal factory smoke
  trafficSmoke: 100,       // % of normal exhaust
  airHarm: 50,             // % extra chance of serious illness at heavy exposure (PM2.5 150)
  smogSchoolClose: false,  // close schools on days after the air quality index passed 300
  // roads
  trafficLights: true,
  trafficPolice: 4,        // officers at the busiest junctions (07:00–21:00)
  speedLimit: 50,          // km/h in the city
  seatbelts: 50,           // % of drivers wearing a seat belt
  roadDanger: 100,         // % of the normal accident risk
  motorwayTraffic: 40,     // vehicles per hour on the motorway
  motorwayFogClose: true,  // close the motorway in thick fog
  // lifestyle
  smokers: 20,             // % of adults who smoke
  gymGoers: 15,            // % of adults who go to the gym
  gymOpen: true,
  stressEffect: 40,        // % extra chance of catching the disease at full stress
  errands: 3,              // % of adults who visit NADRA or the passport office each weekday
  gatheringsOpen: true,    // Friday prayers and weddings
  weddings: 1,             // weddings per week (Fri–Sun evenings)
  // airport
  flightsPerDay: 6,
  importRisk: 3,           // % of returning travellers who bring the infection home
  // daily life (v5)
  prayerAttendance: 30,    // % of people who pray at the mosque during the day (five daily prayers)
  funeralGuests: 12,       // neighbours and relatives who join a funeral (besides the family)
  groceryDelivery: 10,     // % of mart and mandi shopping trips replaced by a home delivery
  // transport (v5)
  busesPerHour: 2,         // buses per hour on each route and direction (0 = no buses)
  busShare: 55,            // % of long trips made by bus when stops are near both ends
  busCapacity: 30,
  cyclists: 12,            // % of adults who ride a bicycle on medium trips
  ambulances: 3,
  signalCycle: 30,         // traffic light cycle (minutes): green + 3 min amber each way
  greenSplit: 50,          // % of the green time given to the north–south roads
  // weather and energy (v5)
  baseTemp: 28,            // average daily temperature (°C)
  heatwave: false,         // +9 °C
  solarKw: 120,            // installed solar (rooftop and solar farm), kW
  batteryKwh: 400,         // grid battery, kWh
  gridCapacity: 420,       // most power the grid can supply, kW
  electricityPrice: 45,    // Rs per kWh (×1.5 in the 18:00–22:00 peak)
  demandResponse: 0,       // % of homes and shops that cut power use in the evening peak
  loadShedding: 'critical',// uniform | critical | rolling: who is switched off first when power is short
  gridOutageChance: 10,    // % of days with a grid outage
  gridOutageHours: 3,
  localFaults: 0.6,        // transformer faults per day (a block loses power until a crew repairs it)
  wifiAps: 8,              // number of public Wi-Fi access points switched on (of 10 sites)
  wifiRange: 120,           // metres each access point covers
  wifiCapacity: 300,       // Mbit/s each access point can carry
  wifiBattery: 4,          // hours an access point runs on its battery in a power cut
  wifiFailure: 4,          // % chance per day that an access point breaks for a few hours
  alertCompliance: 50,     // % of people who go home when the city sends an emergency alert
  // seasons, kilns and satellite
  seasonMode: 'fixed',     // fixed | cycle (the four seasons follow each other)
  startSeason: 'autumn',   // spring | summer | autumn | winter
  seasonDays: 10,          // days per season when the seasons cycle
  kilnWinterStop: true,    // brick kilns are shut in winter
  satPassHours: 12,        // hours between satellite passes (0 = no satellite)
  satMode: 'optical',      // swir | optical | thermal | full  (which satellite sensors are used)
  satAdapt: 'zero',        // zero | balanced | calibrated  (how the kiln-type classifier was adapted to Pakistan)
  satGate: 60,             // % confidence a call needs before inspectors are sent
  zigzagShare: 14,         // % of kilns that are truly zigzag (the rest are old fixed-chimney)
  nightShare: 25,          // % of kilns that bank their fire by day and fire hard at night
  inspectCapacity: 3, kilnSealDays: 7, autoDispatch: false,
  // resources & realism
  waterPerCapita: 100,     // % of normal per-person water use
  electricityUsageMul: 100, // % of normal appliance/electricity use
  fuelPrice: 290,          // PKR per litre of petrol
  fuelEfficiency: 12,      // km per litre (average city vehicle)
  fogDensity: 25,          // % baseline ambient fog, independent of weather spells
  neverEnds: true,         // keep the city running after the outbreak ends (real-world mode)
  realCityScale: 1,        // multiply every person, building and resource to estimate a real city's needs
  // health: chronic conditions & common illness
  diabeticShare: 11,       // % of adults with diabetes
  hypertensionShare: 18,   // % of adults with high blood pressure
  asthmaShare: 7,          // % of people with asthma
  commonIllnessRate: 100,  // % of normal: catching flu, cough, sore throat, fever
  medicineStock: 6000,     // units of medicine the pharmacy network holds
  medicineRestock: 400,    // units delivered per day
  // winter extremes
  snowPloughs: true,       // dispatch snow-plough trucks to clear roads once snow settles
  // media, traffic enforcement, AI
  mediaReach: 60,          // % of people who follow the TV news
  challanCameras: 4, speedingPct: 100, aiAutopilot: false,
  // new city features
  constructionOn: true, constructionWorkers: 60, constructionSpeed: 1, dustControl: false, constructionAqiBan: false,
  skyFloors: 40,           // floors of the Sky Tower
  amusementOpen: true, amusementRides: 8, amusementVisitors: 100,
  evShare: 0,              // % of household cars that are electric
  lightningRate: 6,        // lightning strikes on the city per hour of thunderstorm
  streetlights: 'full',    // full | dimmed (half after 23:00) | adaptive (dim when the streets are empty) | off
  hospitalGenerator: true, // diesel generator keeps the hospital running in a blackout
  // water (v5)
  waterSupply: 4.6,        // m³ per hour from the treatment plant
  tankCapacity: 140,       // m³ of storage in the reservoir and tanks
  pumpCapacity: 8,         // m³ per hour the pumps can lift
  leakRate: 15,            // % of pumped water lost from old pipes
  pipeFailure: 8,          // % of days a main pipe bursts
  waterConservation: 0,    // % less water used at homes (policy)
  waterPrice: 30,          // Rs per m³
  drought: false,          // supply falls to 45% and rain is rare
  hygieneEffect: 30,       // % more infection at home when water runs short
  drainage: 100,           // % of normal drain capacity (low = floods)
  // waste (v5)
  wasteRate: 100,          // % of normal waste produced
  binCapacity: 220,        // kg a street bin holds
  wasteFleet: 2,           // collection trucks
  collectionPriority: 'fullest', // fullest | route
  recyclingRate: 20,       // % of collected waste that is recycled
  wasteBurning: 30,        // % of overflowing waste that people burn (smoke)
  sanitationEffect: 20,    // % more infection at homes next to overflowing bins
  // public services (v5)
  maintenanceCrews: 4,
  fireTrucks: 2,
  fireRate: 2,             // % of days a building fire starts
  // digital twin: sensors (v5)
  sensorNoise: 8,          // % noise on each reading
  sensorLatency: 10,       // minutes before a reading reaches the control room
  sensorInterval: 10,      // minutes between readings
  sensorFailure: 4,        // % chance per day that a sensor breaks
  sensorDrop: 3,           // % of messages lost
  decideBySensors: true,   // the smog rule uses the control-room reading, not the true air
  // v17: economy, government, people and new measures
  economy: true,           // money, prices, a government with a budget, births and natural deaths
  moneyScale: 400,         // real people each simulated person stands for in all money figures (400 x 500 = a city of 200,000)
  demoMul: 10,             // time-lapse for births and natural deaths (1 = real speed; 10 lets you see them in a short run)
  taxRate: 100,            // % of the normal property tax
  foodPrice: 330,          // Rs per person per day for the food basket
  medicinePrice: 150,      // Rs per course of common medicines
  busFare: 60,             // Rs per bus ride
  birthRooms: 3, midwives: 4, incubators: 2, antenatal: 40, // birth centre: delivery rooms, midwives, incubators, % of mothers with antenatal care
  purifiers: 0,            // % of homes with an air purifier (vulnerable homes first)
  bldgFilters: false,      // air filters in schools, the hospital and offices
  sprayGuns: 0,            // anti-smog spray guns (water mist) working by day
  cloudSeeding: false,     // fly cloud-seeding sorties on days with suitable clouds
  oddEven: false,          // odd-even rule: half the household cars stay home each day
  cashTransfer: 0,         // Rs per day paid to each household in the poorest group
  transferShare: 30,       // % of households (the poorest) that get the cash
  foodSubsidy: 0,          // % off the price of food
  wageSupport: 0,          // % of lost wages paid to workers whose workplace is closed or who are sick
  vaxDrive: 0,             // % of the city vaccinated per day (highest-risk first)
  spendingFreeze: false,   // freeze non-urgent spending
  tankers: 0,              // water tankers hired (extra supply)
  seed: 8,
};

/* ---------- Random: mulberry32 ---------- */
class Random {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  normal(mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/* ---------- SpatialGrid: agents sorted into cells (rebuilt with typed arrays) ---------- */
class SpatialGrid {
  constructor(w, h, cell) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell) + 1;
    this.rows = Math.ceil(h / cell) + 1;
    const n = this.cols * this.rows;
    this.count = new Int32Array(n);
    this.start = new Int32Array(n + 1);
    this.cursor = new Int32Array(n);
    this.cellOf = new Int32Array(4096);
    this.items = [];
  }
  cellIndex(x, y) {
    const c = Math.min(this.cols - 1, Math.max(0, (x / this.cell) | 0));
    const r = Math.min(this.rows - 1, Math.max(0, (y / this.cell) | 0));
    return r * this.cols + c;
  }
  build(list, n) {
    const count = this.count, start = this.start, cursor = this.cursor, cellOf = this.cellOf;
    count.fill(0);
    for (let i = 0; i < n; i++) { const c = this.cellIndex(list[i].x, list[i].y); cellOf[i] = c; count[c]++; }
    start[0] = 0;
    for (let k = 0; k < count.length; k++) { start[k + 1] = start[k] + count[k]; cursor[k] = start[k]; }
    const items = this.items;
    items.length = n;
    for (let i = 0; i < n; i++) items[cursor[cellOf[i]]++] = list[i];
  }
  near(x, y, radius, out) {
    out.length = 0;
    const c0 = Math.max(0, ((x - radius) / this.cell) | 0), c1 = Math.min(this.cols - 1, ((x + radius) / this.cell) | 0);
    const r0 = Math.max(0, ((y - radius) / this.cell) | 0), r1 = Math.min(this.rows - 1, ((y + radius) / this.cell) | 0);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * this.cols + c;
      for (let j = this.start[k], e = this.start[k + 1]; j < e; j++) out.push(this.items[j]);
    }
    return out;
  }
}

/* ---------- city geometry ---------- */
function blockRect(c, r) {
  return {
    x0: c * BLOCK + (c > 0 ? roadHalf(c * BLOCK === MAIN_X) + SIDEWALK : 3),
    x1: (c + 1) * BLOCK - (c < COLS - 1 ? roadHalf((c + 1) * BLOCK === MAIN_X) + SIDEWALK : 3),
    y0: r * BLOCK + (r > 0 ? roadHalf(r * BLOCK === MAIN_Y) + SIDEWALK : 3),
    y1: (r + 1) * BLOCK - (r < ROWS - 1 ? roadHalf((r + 1) * BLOCK === MAIN_Y) + SIDEWALK : 3),
  };
}
function blockSides(c, r) {
  const s = [];
  if (r > 0) s.push('N');
  if (r < ROWS - 1) s.push('S');
  if (c > 0) s.push('W');
  if (c < COLS - 1) s.push('E');
  return s;
}
/* access point of a place: door on the block edge, footpath point, and the road it faces */
function makeAccess(c, r, side, along) {
  const rect = blockRect(c, r);
  if (side === 'N' || side === 'S') {
    const Y = side === 'N' ? r * BLOCK : (r + 1) * BLOCK, h = roadHalf(Y === MAIN_Y), s = side === 'N' ? 1 : -1;
    return { side, axis: 'h', coord: Y, sign: s, door: { x: along, y: side === 'N' ? rect.y0 : rect.y1 }, walk: { x: along, y: Y + s * (h + 1.5) }, road: { x: along, y: Y } };
  }
  const X = side === 'W' ? c * BLOCK : (c + 1) * BLOCK, h = roadHalf(X === MAIN_X), s = side === 'W' ? 1 : -1;
  return { side, axis: 'v', coord: X, sign: s, door: { x: side === 'W' ? rect.x0 : rect.x1, y: along }, walk: { x: X + s * (h + 1.5), y: along }, road: { x: X, y: along } };
}
/* a point on a road (a crash site) as an access point that ambulances can drive to */
function roadAccess(x, y) {
  const Y = Math.min(ROAD_Y.length - 1, Math.max(0, Math.round(y / 100) - 1)), X = Math.min(ROAD_X.length - 1, Math.max(0, Math.round(x / 100) - 1));
  const ry = ROAD_Y[Y], rx = ROAD_X[X];
  const dy = Math.abs(y - ry) + (x > CITY_W && ry !== MAIN_Y ? 1e6 : 0), dx = Math.abs(x - rx) + (y > CITY_H || x > CITY_W ? 1e6 : 0);
  if (dy <= dx) { const px = Math.max(2, Math.min(AIRPORT_ROAD_END - 4, x)); return { side: 'N', axis: 'h', coord: ry, sign: 1, door: { x: px, y: ry }, walk: { x: px, y: ry }, road: { x: px, y: ry } }; }
  const py = Math.max(2, Math.min(CITY_H - 2, y));
  return { side: 'W', axis: 'v', coord: rx, sign: 1, door: { x: rx, y: py }, walk: { x: rx, y: py }, road: { x: rx, y: py } };
}
/* a route along road centre lines between two access points: list of vertices, each with the segment it ends */
function centreRoute(A, B) {
  const a = A.road, b = B.road;
  const pts = [{ x: a.x, y: a.y }];
  const add = (x, y, axis, coord) => {
    const l = pts[pts.length - 1];
    if (Math.abs(l.x - x) < 0.01 && Math.abs(l.y - y) < 0.01) return;
    pts.push({ x, y, axis, coord });
  };
  if (A.axis === B.axis && A.coord === B.coord) add(b.x, b.y, A.axis, A.coord);
  else if (A.axis === 'h' && B.axis === 'v') { add(B.coord, A.coord, 'h', A.coord); add(b.x, b.y, 'v', B.coord); }
  else if (A.axis === 'v' && B.axis === 'h') { add(A.coord, B.coord, 'v', A.coord); add(b.x, b.y, 'h', B.coord); }
  else if (A.axis === 'h') {
    const mid = (a.x + b.x) / 2;
    let X = ROAD_X[0];
    for (const x of ROAD_X) if (Math.abs(x - mid) < Math.abs(X - mid)) X = x;
    add(X, A.coord, 'h', A.coord); add(X, B.coord, 'v', X); add(b.x, b.y, 'h', B.coord);
  } else {
    const mid = (a.y + b.y) / 2;
    let Y = ROAD_Y[0];
    for (const y of ROAD_Y) if (Math.abs(y - mid) < Math.abs(Y - mid)) Y = y;
    add(A.coord, Y, 'v', A.coord); add(B.coord, Y, 'h', Y); add(b.x, b.y, 'v', B.coord);
  }
  return pts;
}
/* shift a centre-line route sideways: onto one footpath (people) or into the left lane (vehicles) */
function offsetRoute(pts, kind, side) {
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1];
    const h = roadHalf(p.coord === (p.axis === 'h' ? MAIN_Y : MAIN_X));
    let ox = 0, oy = 0;
    if (kind === 'walk') {
      if (p.axis === 'h') oy = side * (h + 1.5); else ox = side * (h + 1.5);
    } else {
      const lane = h * 0.5;
      const dx = Math.sign(p.x - q.x), dy = Math.sign(p.y - q.y);
      ox = dy * lane; oy = -dx * lane; // drive on the left
    }
    segs.push({ ox, oy, axis: p.axis });
  }
  if (!segs.length) return [{ x: pts[0].x, y: pts[0].y }];
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = segs[Math.max(0, i - 1)], b = segs[Math.min(segs.length - 1, i)];
    let ox, oy;
    if (i === 0) { ox = b.ox; oy = b.oy; }
    else if (i === pts.length - 1) { ox = a.ox; oy = a.oy; }
    else { ox = a.axis === 'v' ? a.ox : b.ox; oy = a.axis === 'h' ? a.oy : b.oy; }
    out.push({ x: pts[i].x + ox, y: pts[i].y + oy });
  }
  return out;
}
/* US EPA air quality index from PM2.5 (µg/m³) */
function aqiFromPm(c) {
  const B = [[0, 9, 0, 50], [9, 35.4, 50, 100], [35.4, 55.4, 100, 150], [55.4, 125.4, 150, 200], [125.4, 225.4, 200, 300], [225.4, 325.4, 300, 500]];
  for (const [c0, c1, a0, a1] of B) if (c <= c1) return a0 + ((a1 - a0) * (c - c0)) / (c1 - c0);
  return 500;
}
function aqiCategory(a) {
  if (a <= 50) return { key: 'good', label: 'Good' };
  if (a <= 100) return { key: 'moderate', label: 'Moderate' };
  if (a <= 150) return { key: 'sensitive', label: 'Unhealthy for sensitive groups' };
  if (a <= 200) return { key: 'unhealthy', label: 'Unhealthy' };
  if (a <= 300) return { key: 'very', label: 'Very unhealthy' };
  return { key: 'hazardous', label: 'Hazardous' };
}
/* position of an aircraft at tick t (landing from the west over the city, taking off to the east) */
const FL = { APP: 16, ROLL: 6, TIN: 12, PUSH: 4, TOUT: 14, TO: 6, CLIMB: 18 };
function pathPose(pts, u) {
  let L = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(d); L += d; }
  let s = Math.max(0, Math.min(1, u)) * L;
  for (let i = 1; i < pts.length; i++) {
    const d = segs[i - 1], A = pts[i - 1], B = pts[i];
    if (s <= d || i === pts.length - 1) {
      const k = d ? Math.min(1, s / d) : 0;
      return { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, heading: Math.atan2(B.y - A.y, B.x - A.x) };
    }
    s -= d;
  }
  return { x: pts[0].x, y: pts[0].y, heading: 0 };
}
function flightPose(f, t) {
  const tA = f.tA, g = f.gateX, tGate = tA + FL.ROLL + FL.TIN, tPush = f.tD - FL.TOUT - FL.PUSH, tOut = f.tD - FL.TOUT;
  if (t < tA - FL.APP || t > f.tD + FL.TO + FL.CLIMB) return null;
  if (t < tA) { const u = (t - (tA - FL.APP)) / FL.APP; return { x: -300 + 1345 * u, y: RUNWAY.y + 26 * (1 - u), heading: -0.02, alt: 1 - u, phase: 'landing' }; }
  if (t < tA + FL.ROLL) { const u = (t - tA) / FL.ROLL, e = 1 - (1 - u) * (1 - u); return { x: 1045 + 245 * e, y: RUNWAY.y, heading: 0, alt: 0, phase: 'rollout' }; }
  if (t < tGate) return Object.assign(pathPose([{ x: 1290, y: RUNWAY.y }, { x: 1290, y: TAXI_Y }, { x: g, y: TAXI_Y }, { x: g, y: GATE_Y }], (t - tA - FL.ROLL) / FL.TIN), { alt: 0, phase: 'taxi' });
  if (t < tPush) return { x: g, y: GATE_Y, heading: Math.PI / 2, alt: 0, phase: 'gate' };
  if (t < tOut) return { x: g, y: GATE_Y - 56 * ((t - tPush) / FL.PUSH), heading: Math.PI / 2, alt: 0, phase: 'pushback' };
  if (t < f.tD) return Object.assign(pathPose([{ x: g, y: GATE_Y - 56 }, { x: 1124, y: GATE_Y - 56 }, { x: 1124, y: TAXI_Y }, { x: 1040, y: TAXI_Y }, { x: 1040, y: RUNWAY.y }], (t - tOut) / FL.TOUT), { alt: 0, phase: 'taxi' });
  if (t < f.tD + FL.TO) { const u = (t - f.tD) / FL.TO; return { x: 1040 + 230 * u * u, y: RUNWAY.y, heading: 0, alt: 0, phase: 'takeoff' }; }
  const u = (t - f.tD - FL.TO) / FL.CLIMB;
  return { x: 1270 + 560 * u, y: RUNWAY.y - 30 * u * u, heading: -0.05, alt: Math.min(1, u * 1.6), phase: 'climb' };
}
const AIRLINES = ['PK', 'EK', 'QR', 'TK', 'SV', 'PA', 'FZ', 'WY', 'GF', 'ER'];
const CITIES = ['Dubai', 'Jeddah', 'Doha', 'Istanbul', 'London', 'Karachi', 'Riyadh', 'Kuala Lumpur', 'Manchester', 'Abu Dhabi', 'Muscat', 'Toronto', 'Lahore', 'Bangkok'];
/* junctions where the highways cross other roads, in order of how busy they are (traffic police go here first) */
const POLICE_ORDER = [[500, 300], [500, 200], [500, 400], [400, 300], [600, 300], [300, 300], [700, 300], [500, 100], [500, 500], [200, 300], [800, 300], [900, 300]];

/* ---------- Agent ---------- */
class Agent {
  constructor(id, age, household, world) {
    const rng = world.rng;
    this.id = id;
    this.age = age;
    this.household = household;
    this.home = household.home;
    this.work = null;
    this.school = null;
    this.job = 'none';
    this.uDistance = rng.next();
    this.uMask = rng.next();
    this.uVaccine = rng.next();
    this.uVaccineEff = rng.next();
    this.uSmoke = rng.next();
    this.uGym = rng.next();
    this.uBelt = rng.next();
    this.uPray = rng.next(); this.uBike = rng.next(); this.uBus = rng.next();
    this.devout = false; this.cyclist = false; this.bike = false; this.busPlan = null; this.bus = null; this.override = null; this.buried = false;
    this.distancing = false; this.mask = false; this.vaccinated = false; this.smoker = false; this.gymGoer = false;
    // where the person is
    this.place = this.home;
    this.ctx = this.home.id;  // place id, -1 on the street, -2 inside a vehicle, -3 away from the city
    this.mode = 'inside';     // inside | walk | drive | ambulance | bed | injured | away | dead
    const p = world.randomPointIn(this.home.area);
    this.x = p.x; this.y = p.y; this.px = p.x; this.py = p.y;
    this.tx = p.x; this.ty = p.y;
    this.heading = rng.range(0, Math.PI * 2);
    this.path = null; this.pi = 0; this.dest = null;
    this.speedMul = rng.range(0.85, 1.15);
    this.plan = []; this.planIdx = 0; this.activity = 'At home'; this.idle = 0; this.stayUntil = 0; this.nextStay = 0;
    this.driving = false; this.taxi = false; this.smoking = false; this.smokeGo = false; this.parkedAt = null; this.yieldUntil = 0; this.waitUntil = 0;
    // traffic
    this.queueKey = -1; this.queueJ = null; this.queueAxis = null; this.runRedJ = -1; this.crashWait = 0; this.waited = 0;
    // body and mind
    this.stress = rng.range(0.15, 0.4); this.exposure = 0.12; this.susc = 1;
    this.injured = false; this.injuryEnds = 0; this.injuryDays = 0; this.injuredAt = -1; this.accidents = 0; this.pickup = null;
    this.away = false; this.trip = null; this.returnTick = 0; this.awayReason = null;
    // disease
    this.state = 'S'; this.stateTicks = 0; this.stateDuration = 0;
    this.symptomatic = false; this.severe = false; this.severeAt = -1;
    this.needsAmbulance = false; this.hospitalized = false; this.bed = -1;
    this.isolated = false; this.isolatedAt = null; this.ambulance = null;
    // memory
    this.infectedBy = null; this.infectedAtTick = null; this.infectedWhere = null; this.generation = null;
    this.secondary = 0; this.firstSecondary = null; this.infectedIds = []; this.timesInfected = 0;
    this.diedAtTick = null; this.diedWhere = null; this.deathCause = null; this.superSpreaderLogged = false;
  }

  applyBehaviour(p) {
    this.distancing = this.uDistance < p.distancing / 100;
    this.mask = this.uMask < p.masks / 100;
    const k = this.age.key;
    this.smoker = k !== 'child' && this.uSmoke < (p.smokers / 100) * (k === 'elder' ? 0.8 : 1);
    this.gymGoer = k === 'adult' ? this.uGym < p.gymGoers / 100 : k === 'elder' ? this.uGym < (p.gymGoers / 100) * 0.35 : false;
    this.devout = this.uPray < (p.prayerAttendance / 100) * (k === 'child' ? 0.3 : 1);
    this.cyclist = k === 'adult' && this.uBike < p.cyclists / 100;
  }
  get alive() { return this.state !== 'D'; }
  get infectious() { return this.state === 'I' && this.ctx >= -1 && !this.isolated; }
  protectedBy(p) { return this.vaccinated && this.uVaccineEff < p.vaccineEfficacy / 100; }
  get busy() { return this.override === 'disabled' || !!this.labour || this.hospitalized || this.isolated || this.needsAmbulance || this.mode === 'ambulance' || this.mode === 'heli' || this.injured || this.away; }

  /* ----- the daily plan (made at midnight) ----- */
  planDay(world, day) {
    const rng = world.rng, p = world.params, T = world.today;
    this.plan = []; this.planIdx = 0; this.stayUntil = 0;
    if (!this.alive || this.busy || this.infant) return;
    const items = this.plan, H = this.home;
    const add = (t, place, label, stay, extra) => { if (place) items.push(Object.assign({ t: Math.round(t), place, label, stay: Math.round(stay || 0) }, extra)); };
    const dep = T.departures.get(this.id);
    if (dep) {
      this.trip = { flight: dep, leaving: true, returnDay: day + rng.int(3, 9) };
      add(Math.max(world.minuteNow + 1, dep.mD - 150), world.airport, `Flying to ${dep.from}`, 0, { taxi: true });
      return;
    }
    if (this.mode === 'inside' && this.place && this.place !== H) add(world.minuteNow, H, 'At home');
    const wd = day % 7, weekend = wd >= 5, friday = wd === 4;
    if (this.state === 'I' && this.symptomatic && rng.chance(p.sickStayHome / 100)) { this.activity = 'Staying home sick'; return; }
    const parkMul = (T.rainDay ? 0.25 : 1) * (T.smog ? 0.35 : 1) * (T.heat ? 0.4 : 1) * (1 - 0.35 * world.awareness);
    const market = world.market, park = world.parkNear(H), gym = world.gym, mosque = world.mosque;
    // food shopping: the sabzi mandi in the morning, the mart or the bazaar later; some orders are delivered to the door
    const shop = (t, stay) => {
      const r = rng.next(), mandiOpen = t >= 330 && t < 780;
      let pl = market, label = 'Shopping at the bazaar';
      if (mandiOpen && r < 0.5) { pl = world.mandi; label = 'Buying vegetables at the sabzi mandi'; }
      else if (t >= 540 && r < 0.72) { pl = world.mart; label = 'Shopping at the mart'; }
      if (!world.isOpen(pl)) return false;
      if (pl !== market && rng.chance(p.groceryDelivery / 100)) { T.orders.push({ t: Math.round(t), home: H, id: this.id }); return true; }
      add(t, pl, label, stay); add(t + 1, H, 'At home');
      return true;
    };
    const key = this.age.key;
    const gymToday = this.gymGoer && world.isOpen(gym) && rng.chance(weekend ? 0.4 : 0.6);
    const gymMorning = this.uGym < (p.gymGoers / 100) * 0.4;
    const pray = friday && world.isOpen(mosque) && !this.distancing && rng.chance(key === 'elder' ? 0.55 : key === 'adult' ? 0.45 : 0.12);
    if (key === 'child') {
      if (!weekend && this.school && world.isOpen(this.school) && !this.distancing) {
        add(rng.range(410, 445), this.school, 'At school');
        const out = rng.range(830, 850);
        if (p.parksOpen && rng.chance(0.3 * parkMul)) { add(out, park, 'Playing in the park', rng.range(60, 120)); add(out + 1, H, 'At home'); }
        else add(out, H, 'At home');
      } else {
        let t = rng.range(600, 700);
        if (pray) { add(rng.range(765, 780), mosque, 'Friday prayer', 40); add(800, H, 'At home'); t = 880; }
        if (p.parksOpen && !this.distancing && rng.chance((weekend ? 0.45 : 0.25) * parkMul)) {
          const s = Math.max(t, rng.range(600, 960)); add(s, park, 'Playing in the park', rng.range(80, 160)); add(s + 1, H, 'At home');
        }
      }
    } else if (key === 'adult') {
      const works = this.work && !weekend && !this.distancing && world.isOpen(this.work);
      const errand = !weekend && !this.distancing && rng.chance(p.errands / 100);
      const job = this.job === 'student' ? 'At university' : 'At work';
      if (works && !errand) {
        if (gymToday && gymMorning) add(rng.range(340, 365), gym, 'Working out at the gym', rng.range(40, 55));
        add(rng.range(430, 490), this.work, job);
        if (pray) { add(rng.range(765, 780), mosque, 'Friday prayer', 40); add(rng.range(820, 830), this.work, job); }
        const off = rng.range(980, 1050);
        if (gymToday && !gymMorning) { add(off, gym, 'Working out at the gym', rng.range(50, 75)); add(off + 1, H, 'At home'); }
        else if (rng.chance(0.28) && shop(off, rng.range(30, 70))) { /* shopping on the way home */ }
        else add(off, H, 'At home');
      } else {
        let t = rng.range(540, 660);
        if (errand) {
          const office = rng.chance(0.6) ? world.nadra : world.passport;
          add(t, office, office === world.nadra ? 'Waiting at the NADRA office' : 'Waiting at the passport office', rng.range(70, 150)); add(t + 1, H, 'At home'); t += 210;
        } else if (rng.chance(this.distancing ? 0.15 : 0.45) && shop(t, rng.range(50, 100))) {
          t += 150;
        }
        if (pray) { const s = Math.max(t, rng.range(765, 780)); add(s, mosque, 'Friday prayer', 40); add(s + 1, H, 'At home'); t = s + 90; }
        if (gymToday) { const s = Math.max(t + 20, gymMorning ? rng.range(570, 640) : rng.range(1050, 1110)); add(s, gym, 'Working out at the gym', rng.range(50, 75)); add(s + 1, H, 'At home'); t = s + 110; }
        if (p.parksOpen && !this.distancing && rng.chance((weekend ? 0.35 : 0.15) * parkMul)) { const s = Math.max(t + 30, rng.range(960, 1080)); add(s, park, 'Walking in the park', rng.range(60, 120)); add(s + 1, H, 'At home'); }
      }
    } else {
      let t = rng.range(480, 600);
      if (p.parksOpen && !this.distancing && rng.chance(0.3 * parkMul)) { add(t, park, 'Walking in the park', rng.range(60, 140)); add(t + 1, H, 'At home'); t += 170; }
      if (pray) { const s = Math.max(t, rng.range(765, 780)); add(s, mosque, 'Friday prayer', 45); add(s + 1, H, 'At home'); t = s + 90; }
      if (rng.chance(this.distancing ? 0.1 : 0.28)) { const s = Math.max(t + 30, rng.range(620, 720)); if (shop(s, rng.range(40, 80))) t = s + 110; }
      if (gymToday) { const s = Math.max(t + 30, rng.range(960, 1050)); add(s, gym, 'Exercising at the gym', rng.range(40, 60)); add(s + 1, H, 'At home'); }
    }
    {
      const am = world.amusement;
      if (am && world.isOpen(am) && !this.distancing) {
        const ch = (weekend || friday ? 0.3 : 0.08) * (p.amusementVisitors / 100) * world.season.out * (1 - 0.35 * world.awareness) * (T.rainDay ? 0.2 : 1) * (T.smog ? 0.4 : 1) * (T.heat ? 0.5 : 1) * (key === 'elder' ? 0.25 : key === 'child' ? 1.2 : 1);
        const u = rng.next(), s0 = rng.range(980, 1200), st = rng.range(90, 170);
        if (u < ch) { add(s0, am, 'At the amusement park', st); add(s0 + 1, H, 'At home'); world.stats.amuseVisits = (world.stats.amuseVisits || 0) + 1; }
      }
    }
    if (T.weddingGuests && T.weddingGuests.has(this.household.id) && !this.distancing && world.isOpen(world.weddingHall)) {
      add(rng.range(1165, 1195), world.weddingHall, 'At a wedding', rng.range(140, 185)); add(1380, H, 'At home');
    }
    items.sort((a, b) => a.t - b.t);
    this.addPrayers(world, day);
    if (T.funeral && T.funeral.guests.has(this.id)) this.addFuneral(world);
  }

  /* a short trip: leave the current place at minute T, visit the stops, then go back to where the plan had the person */
  insertTrip(world, T, stops) {
    const items = this.plan;
    items.sort((a, b) => a.t - b.t);
    let cur = null;
    for (const it of items) if (it.t <= T) cur = it;
    const base = cur ? cur.place : this.home;
    if (!base || base === world.airport || base === world.hospital || base === world.isolation) return false;
    if (cur && cur.stay > 0 && T < cur.t + cur.stay + 15) return false;
    if (this.age.key === 'child' && base.type === 'school') return false;
    if (stops.some((q) => q.place === base)) return false;
    let t = T;
    for (const q of stops) { items.push({ t: Math.round(t), place: q.place, label: q.label, stay: q.stay }); t += q.stay + 6; }
    items.push({ t: Math.round(t), place: base, label: cur ? cur.label : 'At home', stay: 0 });
    items.sort((a, b) => a.t - b.t);
    return true;
  }
  /* the five daily prayers: only people who pray (the "devout" share) walk to the mosque, a few times a day */
  addPrayers(world, day) {
    const mosque = world.mosque;
    if (!this.devout || !this.alive || this.distancing || !world.isOpen(mosque)) return;
    const rng = world.rng, wd = day % 7;
    const prob = [0.25, wd === 4 ? 0 : 0.45, 0.35, 0.6, 0.45];   // Zuhr on Friday is the Friday prayer
    const mul = this.age.key === 'elder' ? 1.3 : this.age.key === 'child' ? 0.5 : 1;
    PRAYERS.forEach((P, i) => {
      const draw = rng.next(), jit = rng.range(-4, 6);              // always draw, so other plans stay comparable
      if (draw > prob[i] * mul) return;
      const T = P.t + jit;
      if (T + 5 < world.minuteNow) return;
      this.insertTrip(world, T - 6, [{ place: mosque, label: `Praying ${P.k} at the mosque`, stay: 18 }]);
    });
  }
  addFuneral(world) {
    const f = world.today.funeral;
    const stops = f.public ? [{ place: world.mosque, label: 'At the janazah prayer', stay: 35 }, { place: world.graveyard, label: 'At the funeral (burial)', stay: 40 }]
      : [{ place: world.graveyard, label: 'At the funeral (burial)', stay: 40 }];
    this.insertTrip(world, f.public ? FUNERAL.mosque : FUNERAL.grave, stops);
  }

  /* ----- one minute of behaviour ----- */
  act(world) {
    const mode = this.mode;
    if (mode !== 'inside') { if (mode === 'walk' || mode === 'drive') this.follow(world); return; }
    if (this.planIdx < this.plan.length && world.minuteNow >= this.plan[this.planIdx].t && world.tick >= this.stayUntil && !this.busy) {
      const a = this.plan[this.planIdx++];
      if (a.place !== this.place) { this.travelTo(a.place, world, a.label, a); return; }
      this.activity = a.label; this.stayUntil = world.tick + a.stay;
    }
    this.wander(world);
  }

  travelTo(place, world, label, item) {
    const from = this.place || this.home;
    if (!from || !place || from === place) return;
    const h = this.household;
    const dist = Math.abs(from.access.road.x - place.access.road.x) + Math.abs(from.access.road.y - place.access.road.y);
    const carHere = this.parkedAt === from;
    const taxi = !!(item && item.taxi);
    const minDrive = world.rain > 0.3 ? 120 : 260;
    const canDrive = taxi || (this.age.key === 'adult' && h.car && !(world.params.oddEven && (h.id + world.dayIndex) % 2 === 1) && (carHere || (from === this.home && !h.carInUse && dist > minDrive)));
    const busPlan = !canDrive ? world.planBus(this, from, place, dist) : null;
    const centre = centreRoute(from.access, busPlan ? busPlan.stopA.faces[busPlan.dir] : place.access);
    const inside = world.pointFor(place);
    this.nextKind = inside.kind || null;
    if (canDrive) {
      if (carHere) { from.parked--; this.parkedAt = null; }
      if (!taxi) h.carInUse = true;
      this.driving = !taxi; this.taxi = taxi;
      this.path = [{ x: from.access.door.x, y: from.access.door.y }, ...offsetRoute(centre, 'drive'), { x: place.access.door.x, y: place.access.door.y }];
      this.inside = inside;
      this.mode = 'drive'; this.ctx = -2; this.smoking = false;
    } else if (busPlan) {
      const A = busPlan.stopA.faces[busPlan.dir];
      this.path = [{ x: from.access.door.x, y: from.access.door.y }, { x: from.access.walk.x, y: from.access.walk.y }, ...offsetRoute(centre, 'walk', from.access.sign), { x: A.walk.x, y: A.walk.y }];
      this.mode = 'walk'; this.ctx = -1; this.inside = null; this.bike = false;
      this.busPlan = Object.assign(busPlan, { leg: 'toStop', place, inside });
      this.smoking = this.smoker && world.rng.chance(0.3);
    } else {
      const side = from.access.sign;
      this.path = [{ x: from.access.door.x, y: from.access.door.y }, { x: from.access.walk.x, y: from.access.walk.y }, ...offsetRoute(centre, 'walk', side),
        { x: place.access.walk.x, y: place.access.walk.y }, { x: place.access.door.x, y: place.access.door.y }, inside];
      this.mode = 'walk'; this.ctx = -1; this.inside = null;
      this.bike = this.cyclist && dist > 120 && dist < 1000 && world.rain < 0.45;
      this.smoking = !this.bike && this.smoker && world.rng.chance(0.3);
    }
    this.pi = 0; this.dest = place; this.place = null; this.queueKey = -1; this.queueJ = null; this.runRedJ = -1; this.waited = 0;
    this.px = this.x; this.py = this.y;
    this.activity = (this.mode === 'drive' ? (taxi ? 'Taking a taxi to ' : 'Driving to ') : busPlan ? 'Walking to the bus stop for ' : this.bike ? 'Cycling to ' : 'Walking to ') + world.placeLabel(place);
    this.nextLabel = label; this.nextStay = item && item.stay ? item.stay : 0;
  }

  follow(world) {
    this.px = this.x; this.py = this.y;
    let step;
    if (this.mode === 'drive') {
      if (this.crashWait > 0) { this.crashWait--; return; }
      step = world.driveSpeed * this.speedMul * (world.tick < this.yieldUntil ? 0.2 : 1);
      if (world.params.trafficLights) {
        step = world.signalStep(this, step);
        if (step <= 0.01) { this.waited++; return; }
      }
    } else step = WALK_SPEED * this.speedMul * (world.rain > 0.3 ? 1.12 : 1) * (this.bike ? 2.4 : 1) * (1 - 0.5 * world.flood);
    while (step > 0 && this.pi < this.path.length) {
      const t = this.path[this.pi], dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
      if (d > 0.01) this.heading = Math.atan2(dy, dx);
      if (d <= step) { this.x = t.x; this.y = t.y; step -= d; this.pi++; }
      else { this.x += (dx / d) * step; this.y += (dy / d) * step; step = 0; }
    }
    if (this.pi >= this.path.length) this.arrive(world);
  }

  /* leave the bus (or give up waiting): walk from the stop to the destination */
  leaveStop(world, face) {
    const bp = this.busPlan, place = bp.place;
    const centre = centreRoute(face, place.access);
    this.path = [{ x: face.walk.x, y: face.walk.y }, ...offsetRoute(centre, 'walk', face.sign), { x: place.access.walk.x, y: place.access.walk.y }, { x: place.access.door.x, y: place.access.door.y }, bp.inside];
    this.x = face.walk.x; this.y = face.walk.y; this.px = this.x; this.py = this.y; this.pi = 0;
    this.mode = 'walk'; this.ctx = -1; this.bus = null; bp.leg = 'fromStop';
    this.activity = 'Walking to ' + world.placeLabel(place);
  }
  arrive(world) {
    if (this.busPlan && this.busPlan.leg === 'toStop') { world.joinStop(this); return; }
    this.busPlan = null; this.bike = false;
    const place = this.dest;
    if (this.driving) {
      this.driving = false;
      if (place === this.home) this.household.carInUse = false;
      else { this.parkedAt = place; place.parked = (place.parked || 0) + 1; }
    }
    this.taxi = false; this.smoking = false; this.queueKey = -1; this.queueJ = null;
    if (this.inside) { this.x = this.inside.x; this.y = this.inside.y; this.inside = null; }
    if (this.parkedAt && place === this.home) { this.parkedAt.parked--; this.parkedAt = null; this.household.carInUse = false; }
    this.mode = 'inside'; this.place = place; this.ctx = place.id; this.path = null; this.dest = null;
    this.activity = this.nextLabel || 'At ' + world.placeLabel(place);
    this.stayUntil = world.tick + (this.nextStay || 0); this.nextStay = 0;
    if (this.isolated && place === world.isolation) this.activity = 'In the isolation centre';
    if (this.trip && this.trip.leaving && place === world.airport) this.activity = `Waiting for flight ${this.trip.flight.code} to ${this.trip.flight.from}`;
    this.stationKind = this.nextKind || null;
    if (place.stations) { this.tx = this.x; this.ty = this.y; this.idle = 15 + ((world.rng.next() * 45) | 0); }
    else { const p = world.pointFor(place); this.tx = p.x; this.ty = p.y; }
  }

  wander(world) {
    const pl = this.place;
    if (!pl) return;
    if (this.idle > 0) { this.idle--; return; }
    const sp = pl.stations ? 1.2 : pl.type === 'home' ? 0.25 : pl.type === 'park' ? 0.7 : 0.45;
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < sp) {
      const rng = world.rng;
      if (this.smokeGo) { this.smokeGo = false; this.smoking = true; this.idle = 6 + ((rng.next() * 7) | 0); return; }
      this.smoking = false;
      if (this.smoker && pl.smokeSpot && rng.chance(0.07)) { this.smokeGo = true; world.stats.smokeBreaks++; this.tx = pl.smokeSpot.x + rng.range(-2.5, 2.5); this.ty = pl.smokeSpot.y + rng.range(-1.5, 1.5); return; }
      const q = world.pointFor(pl); this.tx = q.x; this.ty = q.y; this.stationKind = q.kind || null;
      this.idle = (pl.stations ? 25 + rng.next() * 70 : rng.next() * 40) | 0;
      return;
    }
    this.heading = Math.atan2(dy, dx);
    this.x += (dx / d) * sp; this.y += (dy / d) * sp;
  }

  /* ----- disease progression (every minute) ----- */
  progress(world) {
    const p = world.params, rng = world.rng;
    this.stateTicks++;
    if (this.state === 'E') {
      if (this.stateTicks >= this.stateDuration) world.becomeInfectious(this);
    } else if (this.state === 'I') {
      if (this.severe && !this.ambCalled && this.stateTicks >= this.severeAt && !this.away) world.requestAmbulance(this);
      if (this.needsAmbulance && !this.hospitalized && !this.injured) this.untreated++;
      if (p.quarantine && this.symptomatic && !this.isolated && !this.hospitalized && !this.needsAmbulance && !this.injured && !this.away && this.mode !== 'ambulance' && this.mode !== 'heli' && this.stateTicks >= TICKS_PER_DAY) {
        if (rng.chance(world.detectPerTick)) world.isolate(this);
      }
      if (this.stateTicks >= this.stateDuration) world.resolve(this);
    } else if (this.state === 'R' && p.immunityWanes && this.stateTicks >= this.stateDuration) {
      world.loseImmunity(this);
    }
  }
}

/* ---------- Ambulance ---------- */
class Ambulance {
  constructor(id, world) {
    this.id = id;
    const bay = world.hospital.bays[id];
    this.bay = bay;
    this.x = bay.x; this.y = bay.y; this.heading = -Math.PI / 2;
    this.state = 'idle'; this.path = null; this.pi = 0; this.patient = null; this.wait = 0; this.pickup = null; this.incident = null; this.load = 0;
  }
  follow(speed) {
    let step = speed || AMB_SPEED;
    while (step > 0 && this.pi < this.path.length) {
      const t = this.path[this.pi], dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
      if (d > 0.01) this.heading = Math.atan2(dy, dx);
      if (d <= step) { this.x = t.x; this.y = t.y; step -= d; this.pi++; } else { this.x += (dx / d) * step; this.y += (dy / d) * step; step = 0; }
    }
    return this.pi >= this.path.length;
  }
}

/* ---------- Helicopter (air ambulance) ---------- */
class Helicopter {
  constructor(pad) {
    this.pad = pad; this.x = pad.x; this.y = pad.y; this.alt = 0; this.heading = -Math.PI / 2;
    this.state = 'idle'; this.target = null; this.load = 0; this.patient = null; this.wait = 0; this.trips = 0;
  }
  flyTo(x, y) {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d > 0.5) this.heading = Math.atan2(dy, dx);
    if (d <= HELI_SPEED) { this.x = x; this.y = y; return true; }
    this.x += (dx / d) * HELI_SPEED; this.y += (dy / d) * HELI_SPEED;
    return false;
  }
}

/* ---------- Vehicle: motorway through traffic ---------- */
class Vehicle {
  constructor(id, dir, lane, kind, rng) {
    this.id = id; this.dir = dir; this.lane = lane; this.kind = kind;
    this.len = kind === 'car' ? 8.5 : kind === 'bus' ? 15 : 17;
    this.wid = kind === 'car' ? 4.2 : 5;
    this.vd = kind === 'car' ? rng.range(35, 44) : kind === 'bus' ? rng.range(31, 35) : rng.range(25, 30);
    this.v = this.vd * 0.9;
    this.x = dir > 0 ? -30 : WORLD_W + 30;
    this.y = laneY(dir, lane); this.ty = this.y;
    this.crashed = false; this.crashT = 0; this.color = rng.int(0, 7); this.brake = false;
  }
}

/* ---------- v5: smart-city subsystem constants ---------- */
const POWER_CLASS = {
  hospital: 'critical', isolation: 'critical', police: 'critical', fire: 'critical', amusement: 'public',
  school: 'public', university: 'public', office: 'public', nadra: 'public', passport: 'public', airport: 'public', mosque: 'public', market: 'public', mart: 'public',
  mandi: 'public', gym: 'public', wedding: 'public', fuel: 'public', graveyard: 'public', factory: 'industry', home: 'home',
};
const PLACE_KW = { hospital: 24, isolation: 6, police: 5, fire: 3, school: 7, university: 12, office: 16, nadra: 6, passport: 6, airport: 38, mosque: 2.5, market: 13, mart: 17, mandi: 4, gym: 11, wedding: 18, fuel: 4, graveyard: 0.2, factory: 38, amusement: 45 };
const PLACE_REF = { hospital: 14, isolation: 6, school: 30, university: 20, office: 25, airport: 25, market: 18, mart: 20, mandi: 25, gym: 15, wedding: 40, factory: 20, mosque: 30, amusement: 120 };
const WASTE_KG = { home: 0.12, school: 0.15, university: 0.15, office: 0.1, factory: 0.25, market: 0.5, mart: 0.35, mandi: 0.9, hospital: 0.4, isolation: 0.4, gym: 0.1, mosque: 0.05, wedding: 1.2, airport: 0.3, nadra: 0.2, passport: 0.2, police: 0.1, fire: 0.1, fuel: 0.1, park: 0.06, graveyard: 0.02, amusement: 0.35 };
const WASTE_BASE = { market: 6, mart: 5, mandi: 12, hospital: 6, factory: 10, airport: 8 };   // kg per hour while open
const WATER_M3 = { home: 0.0072, school: 0.004, university: 0.004, office: 0.004, nadra: 0.003, passport: 0.003, mosque: 0.01, gym: 0.012, market: 0.002, mart: 0.002, mandi: 0.004, airport: 0.003, wedding: 0.006, police: 0.004, fire: 0.004, fuel: 0.003 };
const WASTE_ACCESS = { side: 'E', axis: 'v', coord: MAIN_X, sign: 1, door: { x: 512, y: 632 }, walk: { x: 512, y: 632 }, road: { x: MAIN_X, y: 632 } };
const TRUCK_CAP = 900;     // kg a waste truck carries
const LAMPS = 110;         // street lamps on the main roads
const DT = 10;             // minutes between subsystem updates
const FEEDERS = 6;         // electricity feeders (for rolling load shedding)
const REQUEST_TYPES = {
  burst: { label: 'Burst water main', dept: 'Water', fix: [90, 150], sev: 3 },
  fault: { label: 'Transformer fault', dept: 'Electricity', fix: [70, 120], sev: 3 },
  complaint: { label: 'Citizen complaint (pothole, lamp, noise)', dept: 'Roads', fix: [40, 80], sev: 1 },
  overflow: { label: 'Overflowing bin', dept: 'Sanitation', fix: [0, 0], sev: 2 },
  sensor: { label: 'Broken sensor', dept: 'Digital', fix: [60, 100], sev: 2 },
};

/* ---------- Bus: public transport on a fixed route, with stops and passengers ---------- */
class Bus {
  constructor(id, route, dir) {
    this.id = id; this.route = route; this.dir = dir; this.riders = []; this.dwell = 0; this.done = false; this.age = 0;
    this.stress = 0.2; this.queueKey = -1; this.queueJ = null; this.queueAxis = null; this.runRedJ = -1; this.waited = 0; this.heading = 0;
    const lane = (pos) => (route.axis === 'h' ? { x: pos, y: route.coord - dir * 4 } : { x: route.coord + dir * 4, y: pos });
    const stops = route.stopList.slice();
    if (dir < 0) stops.reverse();
    const start = dir > 0 ? route.a : route.b, end = dir > 0 ? route.b : route.a;
    this.path = [lane(start)]; this.startStop = null;
    for (const st of stops) {
      if (Math.abs(st.pos - start) < 1) { this.startStop = st; continue; }
      this.path.push(Object.assign(lane(st.pos), { stop: st }));
    }
    const last = this.path[this.path.length - 1];
    if (!last.stop || Math.abs((route.axis === 'h' ? last.x : last.y) - end) > 1) this.path.push(lane(end));
    this.x = this.path[0].x; this.y = this.path[0].y; this.px = this.x; this.py = this.y; this.pi = 1;
    this.heading = route.axis === 'h' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}

/* ---------- Rig: a service vehicle that follows a script of legs (fire engine, waste truck, crew van, hearse, delivery van) ---------- */
class Rig {
  constructor(id, kind, x, y) {
    this.id = id; this.kind = kind; this.x = x; this.y = y; this.heading = -Math.PI / 2;
    this.legs = []; this.leg = null; this.pi = 0; this.wait = 0; this.transient = false; this.state = 'idle'; this.siren = false; this.load = 0; this.job = null; this.dead = false;
  }
  go(path, wait, done, label) { this.legs.push({ path, wait: wait || 0, done, label }); return this; }
  get idle() { return !this.leg && !this.legs.length; }
  update(speed, world) {
    if (!this.leg) {
      if (!this.legs.length) { this.state = 'idle'; return; }
      this.leg = this.legs.shift(); this.pi = 0; this.wait = 0; this.state = this.leg.label || 'moving'; this.leg.arrived = false;
      const P = this.leg.path;
      if (P.length && Math.hypot(P[0].x - this.x, P[0].y - this.y) > 1.5) this.leg.path = [{ x: this.x, y: this.y }, ...P];
    }
    const L = this.leg;
    if (this.pi >= L.path.length) {
      if (!L.arrived) { L.arrived = true; this.wait = Math.max(1, L.wait); if (L.arrive) world.rigEvent(L.arrive, this); }
      if (this.wait > 0) this.wait--;
      if (this.wait <= 0) { this.leg = null; if (L.done) world.rigEvent(L.done, this); }
      return;
    }
    let step = speed;
    while (step > 0 && this.pi < L.path.length) {
      const t = L.path[this.pi], dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
      if (d > 0.01) this.heading = Math.atan2(dy, dx);
      if (d <= step) { this.x = t.x; this.y = t.y; step -= d; this.pi++; } else { this.x += (dx / d) * step; this.y += (dy / d) * step; step = 0; }
    }
  }
}

/* ---------- World ---------- */
class World {
  constructor(params) {
    this.params = Object.assign({}, DEFAULT_PARAMS, params || {});
    this.listeners = {};
    this.reset();
  }
  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }
  get day() { return this.tick / TICKS_PER_DAY; }
  get clock() { return this.tick + START_MINUTE; }
  get minute() { return this.clock % TICKS_PER_DAY; }
  get azan() { const m = this.minute; return PRAYERS.some((q) => m >= q.t && m < q.t + 25); }
  get dayIndex() { return Math.floor(this.clock / TICKS_PER_DAY); }
  get dayName() { return DAY_NAMES[this.dayIndex % 7]; }
  dayStart(d) { return d * TICKS_PER_DAY - START_MINUTE; }

  randomPointIn(a) { return { x: this.rng.range(a.x0, a.x1), y: this.rng.range(a.y0, a.y1) }; }
  pointFor(pl) {
    if (pl.stations) { const s = pl.stations[(this.rng.next() * pl.stations.length) | 0]; return { x: s.x, y: s.y, kind: s.kind }; }
    return this.randomPointIn(pl.area);
  }
  placeLabel(pl) { return pl.type === 'home' ? 'home' : pl.name; }
  isOpen(pl) {
    const p = this.params;
    if (!pl) return false;
    const t = pl.type;
    if ((t === 'school' || t === 'university') && (!p.schoolsOpen || this.today.smog)) return false;
    if ((t === 'market' || t === 'mart' || t === 'mandi') && !p.marketOpen) return false;
    if (pl.firedUntil && pl.firedUntil > this.tick) return false;
    if (t === 'park' && !p.parksOpen) return false;
    if (t === 'gym' && !p.gymOpen) return false;
    if (t === 'amusement' && !p.amusementOpen) return false;
    if ((t === 'mosque' || t === 'wedding') && !p.gatheringsOpen) return false;
    return true;
  }
  parkNear(home) {
    let best = this.parks[0], bd = Infinity;
    for (const pk of this.parks) {
      const d = Math.abs(pk.cx - home.cx) + Math.abs(pk.cy - home.cy);
      if (d < bd) { bd = d; best = pk; }
    }
    return best;
  }

  /* ----- building the city ----- */
  buildCity() {
    const rng = this.rng;
    this.places = []; this.homes = []; this.blocks = [];
    const newPlace = (o) => { o.id = this.places.length; this.places.push(o); return o; };
    const inset = (r, m) => ({ x0: r.x0 + m, y0: r.y0 + m, x1: r.x1 - m, y1: r.y1 - m });
    const preferSide = (c, r) => {
      const s = blockSides(c, r);
      if (c * BLOCK === MAIN_X && s.includes('W')) return 'W';
      if ((c + 1) * BLOCK === MAIN_X && s.includes('E')) return 'E';
      if (r * BLOCK === MAIN_Y && s.includes('N')) return 'N';
      if ((r + 1) * BLOCK === MAIN_Y && s.includes('S')) return 'S';
      return s.includes('S') ? 'S' : 'N';
    };
    const centreAlong = (rect, side) => (side === 'N' || side === 'S' ? (rect.x0 + rect.x1) / 2 : (rect.y0 + rect.y1) / 2);
    const counters = {};
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const type = CITY_PLAN[r][c], rect = blockRect(c, r);
      const block = { c, r, type, rect, places: [] };
      this.blocks.push(block);
      const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
      if (type === 'house') {
        const mx = cx, my = cy;
        const lots = [[rect.x0, rect.y0, mx, my], [mx, rect.y0, rect.x1, my], [rect.x0, my, mx, rect.y1], [mx, my, rect.x1, rect.y1]];
        lots.forEach((L, i) => {
          const lot = { x0: L[0], y0: L[1], x1: L[2], y1: L[3] };
          const lcx = (lot.x0 + lot.x1) / 2, lcy = (lot.y0 + lot.y1) / 2;
          const sides = blockSides(c, r);
          let side = i < 2 ? 'N' : 'S';
          if (!sides.includes(side)) side = i % 2 === 0 ? (sides.includes('W') ? 'W' : 'E') : (sides.includes('E') ? 'E' : 'W');
          const w = rng.range(15, 19), h = rng.range(12, 15);
          const hw = side === 'N' || side === 'S' ? w : h, hh = side === 'N' || side === 'S' ? h : w;
          let hx = lcx - hw / 2, hy = lcy - hh / 2;
          const yard = 5;
          if (side === 'N') hy = lot.y0 + yard; if (side === 'S') hy = lot.y1 - yard - hh;
          if (side === 'W') hx = lot.x0 + yard; if (side === 'E') hx = lot.x1 - yard - hw;
          const house = { x0: hx, y0: hy, x1: hx + hw, y1: hy + hh, roof: rng.int(0, 5), ridgeH: hw >= hh, tank: rng.chance(0.55), solar: rng.chance(0.25), garden: rng.chance(0.6), seed: rng.next() };
          const along = side === 'N' || side === 'S' ? (house.x0 + house.x1) / 2 : (house.y0 + house.y1) / 2;
          counters.home = (counters.home || 0) + 1;
          const pl = newPlace({ type: 'home', name: `House ${counters.home}`, block, lot, house, area: inset(house, 2), access: makeAccess(c, r, side, along), cx: lcx, cy: lcy, households: [] });
          block.places.push(pl); this.homes.push(pl);
        });
      } else if (type === 'apart') {
        const side = preferSide(c, r);
        const bw = 60, bh = 38;
        const horiz = side === 'N' || side === 'S';
        const w = horiz ? bw : bh, h = horiz ? bh : bw;
        let bx = cx - w / 2, by = cy - h / 2;
        if (side === 'N') by = rect.y0 + 8; if (side === 'S') by = rect.y1 - 8 - h;
        if (side === 'W') bx = rect.x0 + 8; if (side === 'E') bx = rect.x1 - 8 - w;
        const building = { x0: bx, y0: by, x1: bx + w, y1: by + h, seed: rng.next() };
        const access = makeAccess(c, r, side, horiz ? cx : cy);
        counters.apart = (counters.apart || 0) + 1;
        const n = 8, colsN = horiz ? 4 : 2, rowsN = n / colsN;
        for (let k = 0; k < n; k++) {
          const fx = k % colsN, fy = Math.floor(k / colsN);
          const fw = w / colsN, fh = h / rowsN;
          const flat = { x0: bx + fx * fw, y0: by + fy * fh, x1: bx + (fx + 1) * fw, y1: by + (fy + 1) * fh };
          const pl = newPlace({ type: 'home', name: `Flat ${k + 1}, Apartments ${counters.apart}`, block, building, flat, area: inset(flat, 2.5), access, cx, cy, households: [] });
          block.places.push(pl); this.homes.push(pl);
        }
        block.building = building;
      } else if (type === 'govt') {
        // two government offices side by side, both entered from the south road
        const mid = (rect.x0 + rect.x1) / 2;
        const mk = (x0, x1, t) => {
          const prect = { x0, x1, y0: rect.y0, y1: rect.y1 };
          const hall = { x0: x0 + 5, x1: x1 - 5, y0: rect.y0 + 22, y1: rect.y1 - 13 };
          const stations = [];
          for (let y = hall.y0 + 4; y <= hall.y1 - 3; y += 4.4) for (let x = hall.x0 + 3; x <= hall.x1 - 2.5; x += 3.8) stations.push({ x, y });
          const pl = newPlace({ type: t, name: PLACE_NAMES[t], block, rect: prect, hall, area: hall, stations, access: makeAccess(c, r, 'S', (x0 + x1) / 2), cx: (x0 + x1) / 2, cy, parked: 0 });
          block.places.push(pl);
          return pl;
        };
        this.nadra = mk(rect.x0, mid - 1.5, 'nadra');
        this.passport = mk(mid + 1.5, rect.x1, 'passport');
      } else {
        let side = type === 'hospital' || type === 'isolation' || type === 'mosque' ? 'S' : preferSide(c, r);
        const access = makeAccess(c, r, side, centreAlong(rect, side));
        counters[type] = (counters[type] || 0) + 1;
        let name = PLACE_NAMES[type];
        if (type === 'school') name = counters.school === 1 ? 'North School' : 'South School';
        if (type === 'office') name = ['Office Tower A', 'Office Tower B', 'Sky Tower'][counters.office - 1];
        if (type === 'factory') name = counters.factory === 1 ? 'Textile Factory' : 'Food Factory';
        if (type === 'park') name = ['Hill Park', 'Lake Park', 'Central Park', 'Garden Park', 'River Park'][counters.park - 1];
        let area = inset(rect, 6), stations = null;
        if (type === 'market') area = inset(rect, 16);
        if (type === 'office') area = inset(rect, 18);
        if (type === 'factory') area = { x0: rect.x0 + 8, y0: rect.y0 + 10, x1: rect.x1 - 8, y1: rect.y0 + 52 };
        if (type === 'hospital') area = { x0: rect.x0 + 8, y0: rect.y0 + 8, x1: rect.x1 - 8, y1: rect.y0 + 46 };
        if (type === 'police') area = { x0: rect.x0 + 10, y0: rect.y0 + 10, x1: rect.x1 - 30, y1: rect.y0 + 45 };
        if (type === 'fuel') area = { x0: rect.x0 + 12, y0: rect.y0 + 12, x1: rect.x1 - 12, y1: rect.y0 + 40 };
        if (type === 'isolation') area = inset(rect, 10);
        if (type === 'gym') {
          // gym hall: treadmills, bikes, weights and mats you can see from above
          const hall = { x0: rect.x0 + 5, x1: rect.x1 - 5, y0: rect.y0 + 5, y1: rect.y0 + 54 };
          area = hall; stations = [];
          for (let x = hall.x0 + 5; x <= hall.x1 - 5; x += 4.6) stations.push({ x, y: hall.y0 + 6, kind: 'run' });
          for (let x = hall.x0 + 6; x <= hall.x1 - 6; x += 5) stations.push({ x, y: hall.y0 + 16, kind: 'bike' });
          for (let x = hall.x0 + 7; x <= hall.x1 - 7; x += 7) { stations.push({ x, y: hall.y0 + 27, kind: 'lift' }); stations.push({ x, y: hall.y0 + 35, kind: 'lift' }); }
          for (let x = hall.x0 + 6; x <= hall.x1 - 6; x += 5.5) stations.push({ x, y: hall.y1 - 6, kind: 'mat' });
        }
        if (type === 'mosque') {
          // prayer hall on the west (facing Makkah) and a courtyard; people stand in rows
          area = { x0: rect.x0 + 6, x1: rect.x1 - 6, y0: rect.y0 + 9, y1: rect.y1 - 9 };
          stations = [];
          for (let x = rect.x0 + 9; x <= rect.x1 - 9; x += 4.1) for (let y = rect.y0 + 11; y <= rect.y1 - 11; y += 3.4) stations.push({ x, y });
        }
        if (type === 'mart') {
          // supermarket: aisles of shelves, people stand along them
          area = inset(rect, 12); stations = [];
          for (let y = rect.y0 + 24; y <= rect.y1 - 22; y += 9) for (let x = rect.x0 + 14; x <= rect.x1 - 14; x += 5.2) stations.push({ x, y, kind: 'aisle' });
        }
        if (type === 'mandi') {
          // open-air vegetable market: rows of stalls, crowded lanes between them
          area = inset(rect, 6); stations = [];
          for (const ly of [rect.y0 + 24, rect.y0 + 47, rect.y0 + 70]) for (let x = rect.x0 + 9; x <= rect.x1 - 9; x += 4.4) stations.push({ x, y: ly, kind: 'stall' });
        }
        if (type === 'fire') area = { x0: rect.x0 + 10, y0: rect.y0 + 10, x1: rect.x1 - 10, y1: rect.y0 + 44 };
        if (type === 'graveyard') {
          area = inset(rect, 8); stations = [];
          for (let y = rect.y0 + 12; y <= rect.y0 + 34; y += 3.4) for (let x = rect.x0 + 22; x <= rect.x1 - 22; x += 3.8) stations.push({ x, y, kind: 'mourn' });
        }
        if (type === 'wedding') {
          // marquee with round tables
          const m = { x0: rect.x0 + 6, x1: rect.x1 - 6, y0: rect.y0 + 6, y1: rect.y1 - 24 };
          area = m; stations = [];
          for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 3; gy++) {
            const tx = m.x0 + 24 + gx * 14, ty = m.y0 + 11 + gy * 17;
            for (let k = 0; k < 6; k++) { const an = (k / 6) * Math.PI * 2; stations.push({ x: tx + Math.cos(an) * 4.2, y: ty + Math.sin(an) * 4.2 }); }
          }
          for (let y = m.y0 + 8; y <= m.y1 - 6; y += 6) stations.push({ x: m.x0 + 8, y });
        }
        const pl = newPlace({ type, name, block, rect, area, stations, access, cx, cy, parked: 0 });
        block.places.push(pl);
        if (type === 'hospital') {
          this.hospital = pl;
          pl.bedSlots = [];
          const ward = { x0: rect.x0 + 6, y0: rect.y0 + 48, x1: rect.x1 - 6, y1: rect.y1 - 18 };
          pl.ward = ward;
          const cols = 10, rows = 6;
          for (let k = 0; k < MAX_BEDS; k++) {
            const bx = k % cols, by = Math.floor(k / cols);
            pl.bedSlots.push({ x: ward.x0 + 4 + bx * ((ward.x1 - ward.x0 - 8) / (cols - 1)), y: ward.y0 + 3 + by * ((ward.y1 - ward.y0 - 6) / (rows - 1)), patient: null });
          }
          pl.bays = [0, 1, 2, 3, 4, 5].map((k) => ({ x: rect.x1 - 66 + k * 10, y: rect.y1 - 9 }));
          pl.helipad = { x: rect.x1 - 22, y: rect.y0 + 27 };
        }
        if (type === 'factory') pl.chimney = { x: rect.x0 + 18, y: rect.y0 + 16 };
        if (type === 'isolation') this.isolation = pl;
        if (type === 'market') this.market = pl;
        if (type === 'gym') this.gym = pl;
        if (type === 'mosque') this.mosque = pl;
        if (type === 'wedding') this.weddingHall = pl;
        if (type === 'mart') this.mart = pl;
        if (type === 'mandi') this.mandi = pl;
        if (type === 'fire') {
          this.fire = pl;
          pl.bays = [0, 1, 2].map((k) => ({ x: rect.x0 + 24 + k * 20, y: rect.y1 - 14 }));
        }
        if (type === 'graveyard') {
          this.graveyard = pl;
          pl.graveSlots = [];
          for (let y = rect.y0 + 46; y <= rect.y1 - 10; y += 7) for (let x = rect.x0 + 12; x <= rect.x1 - 12; x += 6.6) pl.graveSlots.push({ x, y, used: false });
        }
      }
    }
    // the airport terminal, on the Airport Road (the east end of the highway)
    const T = TERMINAL, hall = { x0: T.x0 + 10, x1: T.x1 - 10, y0: T.y0 + 8, y1: T.y1 - 7 };
    const tStations = [];
    for (let x = hall.x0 + 4; x <= hall.x1 - 4; x += 4.5) for (let y = hall.y0 + 3; y <= hall.y1 - 2; y += 4.2) tStations.push({ x, y });
    const ax = 1262;
    this.airport = newPlace({
      type: 'airport', name: PLACE_NAMES.airport, block: { rect: T, places: [], outskirts: true }, rect: T, area: hall, stations: tStations,
      access: { side: 'S', axis: 'h', coord: MAIN_Y, sign: -1, door: { x: ax, y: T.y1 }, walk: { x: ax, y: MAIN_Y - (roadHalf(true) + 1.5) }, road: { x: ax, y: MAIN_Y } },
      cx: ax, cy: (T.y0 + T.y1) / 2, parked: 0, outskirts: true,
    });
    this.airport.block.places.push(this.airport);
    for (const pl of this.places) {
      if (!SMOKE_SPOT_TYPES[pl.type]) continue;
      const d = pl.access.door, A = pl.area;
      pl.smokeSpot = { x: Math.max(A.x0 + 2, Math.min(A.x1 - 2, d.x + (pl.access.side === 'W' ? 4 : pl.access.side === 'E' ? -4 : 6))), y: Math.max(A.y0 + 2, Math.min(A.y1 - 2, d.y + (pl.access.side === 'N' ? 4 : pl.access.side === 'S' ? -4 : 0))) };
    }
    this.parks = this.places.filter((p) => p.type === 'park');
    this.amusement = this.places.find((p) => p.type === 'amusement');
    this.construction = this.places.find((p) => p.type === 'construction');
    this.sky = this.places.filter((p) => p.type === 'office')[2]; if (this.sky) this.sky.tall = true;
    this.schools = this.places.filter((p) => p.type === 'school');
    this.factories = this.places.filter((p) => p.type === 'factory');
    this.workplaces = {
      office: this.places.filter((p) => p.type === 'office'), factory: this.factories,
      university: this.places.filter((p) => p.type === 'university'), market: [this.market], school: this.schools,
      hospital: [this.hospital], police: this.places.filter((p) => p.type === 'police'), fuel: this.places.filter((p) => p.type === 'fuel'),
      airport: [this.airport], govt: [this.nadra, this.passport], gym: [this.gym], wedding: [this.weddingHall],
      mart: [this.mart], mandi: [this.mandi], fire: [this.fire],
    };
    if (this.sky) this.workplaces.office.push(this.sky, this.sky);   // the tall tower employs more people
    // road junctions (traffic lights on the highways)
    this.junctions = [];
    for (let xi = 0; xi < ROAD_X.length; xi++) for (let yi = 0; yi < ROAD_Y.length; yi++) {
      const X = ROAD_X[xi], Y = ROAD_Y[yi];
      this.junctions.push({ id: this.junctions.length, xi, yi, X, Y, signal: X === MAIN_X || Y === MAIN_Y, offset: (xi * 7 + yi * 11) % SIG_CYCLE, police: false });
    }
    this.queueLen = new Int16Array(this.junctions.length * 4);
  }
  junctionAt(X, Y) {
    const xi = Math.round(X / 100) - 1, yi = Math.round(Y / 100) - 1;
    if (xi < 0 || xi >= ROAD_X.length || yi < 0 || yi >= ROAD_Y.length) return null;
    return this.junctions[xi * ROAD_Y.length + yi];
  }
  assignPolice() {
    for (const j of this.junctions) j.police = false;
    const n = Math.min(this.params.trafficPolice, POLICE_ORDER.length);
    for (let i = 0; i < n; i++) { const j = this.junctionAt(POLICE_ORDER[i][0], POLICE_ORDER[i][1]); if (j) j.police = true; }
  }
  policeOnDuty(j) { return j.police && this.minuteNow >= 420 && this.minuteNow < 1260; }
  /* traffic light colour for traffic moving along 'h' (east–west) or 'v' (north–south) */
  lightFor(j, axis) {
    if (!this.signalsOn) return 'F';                                   // power cut: the lights are off (flashing amber in the drawing)
    const C = this.params.signalCycle, g = C - 6, gv = Math.round((g * this.params.greenSplit) / 100), gh = g - gv;
    const t = (this.tick + j.offset) % C;
    if (axis === 'v') return t < gv ? 'G' : t < gv + 3 ? 'A' : 'R';
    return t >= gv + 3 && t < gv + 3 + gh ? 'G' : t >= gv + 3 + gh ? 'A' : 'R';
  }
  /* how far a car may move this minute: it stops at a red or amber light, behind the cars already waiting */
  signalStep(a, step) {
    if (!this.signalsOn) return step;
    if (a.queueKey >= 0) {
      if (this.lightFor(a.queueJ, a.queueAxis) === 'G') { a.queueKey = -1; a.queueJ = null; } else return 0;
    }
    const t = a.path[a.pi];
    if (!t) return step;
    const dx = t.x - a.x, dy = t.y - a.y, horiz = Math.abs(dx) >= Math.abs(dy);
    const s = horiz ? Math.sign(dx) : Math.sign(dy);
    if (!s) return step;
    const along = horiz ? a.x : a.y, cross = horiz ? a.y : a.x;
    const ci = Math.round(cross / 100) - 1, lines = horiz ? ROAD_Y : ROAD_X;
    if (ci < 0 || ci >= lines.length || Math.abs(cross - lines[ci]) > 9.5) return step;
    if (!horiz && a.y > CITY_H) return step;
    const perp = horiz ? ROAD_X : ROAD_Y;
    let J = null, best = Infinity;
    for (const L of perp) { const d = s * (L - along); if (d > 0 && d < best) { best = d; J = L; } }
    if (J == null) return step;
    const junc = horiz ? this.junctionAt(J, lines[ci]) : this.junctionAt(lines[ci], J);
    if (!junc || !junc.signal) return step;
    const axis = horiz ? 'h' : 'v';
    const hw = roadHalf(horiz ? J === MAIN_X : J === MAIN_Y);
    const stopLine = J - s * (hw + 3.2);
    const toLine = s * (stopLine - along);
    if (toLine < -0.5) return step;                                   // already past the stop line
    const toVertex = s * ((horiz ? t.x : t.y) - along);
    if (toVertex < toLine - 0.5) return step;                         // turns off before the junction
    if (this.lightFor(junc, axis) === 'G') return step;
    const key = junc.id * 4 + (horiz ? (s > 0 ? 0 : 1) : (s > 0 ? 2 : 3));
    const n = this.queueLen[key];
    const stopAt = toLine - n * 7;
    if (stopAt > step) return step;                                   // not there yet
    if (a.runRedJ === junc.id) return step;
    if (this.rng.chance(0.025 * (1 + 2 * a.stress) * (this.policeOnDuty(junc) ? 0.08 : 1) * (1 + this.fog))) {
      a.runRedJ = junc.id; this.stats.redRuns++;
      if (this.params.challanCameras > 0 && this.rng.chance(Math.min(0.9, this.params.challanCameras * 0.07))) this.issueChallan(a, 'red');
      return step;
    }
    a.queueKey = key; a.queueJ = junc; a.queueAxis = axis; this.queueLen[key] = n + 1;
    return Math.max(0, stopAt);
  }

  /* ----- households and people ----- */
  buildPeople() {
    const rng = this.rng, p = this.params;
    this.agents = []; this.households = [];
    const slots = this.homes.slice();
    for (let i = slots.length - 1; i > 0; i--) { const j = rng.int(0, i); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const flats = this.homes.filter((h) => h.flat);
    let remaining = p.population, k = 0;
    while (remaining > 0) {
      const roll = rng.next();
      let ages;
      if (roll < 0.12) ages = ['adult'];
      else if (roll < 0.22) ages = rng.chance(0.6) ? ['elder', 'elder'] : ['elder'];
      else if (roll < 0.36) ages = ['adult', 'adult'];
      else if (roll < 0.8) { ages = ['adult', 'adult']; const n = rng.int(1, 3); for (let i = 0; i < n; i++) ages.push('child'); }
      else { ages = ['adult', 'adult', 'elder']; const n = rng.int(0, 3); for (let i = 0; i < n; i++) ages.push('child'); }
      ages = ages.slice(0, remaining);
      remaining -= ages.length;
      const home = k < slots.length ? slots[k] : flats[rng.int(0, flats.length - 1)];
      k++;
      const hh = { id: this.households.length, home, members: [], car: ages.includes('adult') && rng.chance(0.45), carInUse: false, carWreckUntil: 0 };
      home.households.push(hh);
      this.households.push(hh);
      for (const key of ages) {
        const age = AGE_GROUPS.find((g) => g.key === key);
        const a = new Agent(this.agents.length, age, hh, this);
        hh.members.push(a);
        this.agents.push(a);
      }
    }
    const nearest = (list, from) => {
      let best = list[0], bd = Infinity;
      for (const pl of list) { const d = Math.abs(pl.cx - from.cx) + Math.abs(pl.cy - from.cy); if (d < bd) { bd = d; best = pl; } }
      return best;
    };
    const JOBS = [['office', 0.26], ['factory', 0.14], ['university', 0.12], ['market', 0.07], ['mart', 0.03], ['mandi', 0.03], ['school', 0.07], ['hospital', 0.07], ['police', 0.04],
      ['fire', 0.01], ['fuel', 0.02], ['airport', 0.04], ['govt', 0.03], ['gym', 0.01], ['wedding', 0.01], ['none', 0.05]];
    for (const a of this.agents) {
      if (a.age.key === 'child') { a.school = nearest(this.schools, a.home); a.job = 'pupil'; }
      else if (a.age.key === 'adult') {
        let r = rng.next(), job = 'none';
        for (const [j, w] of JOBS) { if (r < w) { job = j; break; } r -= w; }
        a.job = job === 'university' && rng.chance(0.7) ? 'student' : job;
        if (job !== 'none') a.work = job === 'school' ? nearest(this.schools, a.home) : rng.pick(this.workplaces[job]);
      } else a.job = 'retired';
    }
  }

  reset(params) {
    if (params) Object.assign(this.params, params);
    const p = this.params;
    this.rng = new Random(p.seed);
    this.tick = 0;
    this.minuteNow = this.minute;
    this.history = { KILN: [], SKY: [], AMU: [], FUEL: [], SICK: [], MED: [], t: [], S: [], E: [], I: [], R: [], D: [], V: [], H: [], X: [], AQI: [], ST: [], ACC: [], MWA: [], KW: [], SOLAR: [], SOC: [], TANK: [], BIN: [], DASH: [], TEMP: [], SVC: [], FLD: [], BUS: [], WIFI: [] };
    this.events = [];
    this.recentInfections = [];
    this.finishedInfections = [];
    this.infectionOrder = [];
    this.everInfected = 0;
    this.peakI = 0; this.peakTick = 0;
    this.overloaded = false; this.finished = false; this.flags = {};
    this.whereCounts = { home: 0, school: 0, work: 0, market: 0, park: 0, gym: 0, govt: 0, gathering: 0, airport: 0, street: 0, hospital: 0, transit: 0 };
    this.ambQueue = [];
    this.admitted = 0;
    this.stats = { accidents: 0, collisions: 0, pedestrians: 0, injured: 0, roadDeaths: 0, redRuns: 0, mwCrashes: 0, mwInjured: 0, mwKilled: 0, transfers: 0, heliTrips: 0, imported: 0, landed: 0, departed: 0, smokeBreaks: 0, flightsDelayed: 0, flightDelayMinTotal: 0 };
    this.accDaily = [];
    this.wrecks = []; this.incidents = []; this.vehicles = []; this.visitors = []; this.flights = [];
    this.vehSeq = 0; this.incSeq = 0; this.flightSeq = 0; this.visitorSeq = 0;
    this.spells = []; this.rain = 0; this.fog = 0; this.storm = false; this.night = false; this.mwClosed = false;
    this.snow = 0; this.snowDepth = 0; this.snowing = 0; this.plough = false; this.flightDelaysToday = 0;
    this.windAng = -2.36; this.windSpd = 1.4; this.windX = 0; this.windY = 0;
    this.today = { departures: new Map(), weddingGuests: null, rainDay: false, smog: false, orders: [], funeral: null };
    this.netRng = new Random((p.seed * 104729 + 13) >>> 0);
    this.satRng = new Random((p.seed * 15485863 + 5) >>> 0);
    this.kilnOverride = new Array(8).fill(null);
    this.season = SEASONS[1]; this.dawn = 350; this.dusk = 1150;
    this.sat = { passes: 0, tick: -1, seen: 0, hot: 0, operating: 0, falseAlarm: 0, missed: 0, cover: 0, blocked: false, kilns: KILN_SITES.map(() => ({ seen: false, hot: false })) };
    this.emK = 0; this.emAll = 1;
    this.kilnSealed = new Array(8).fill(0);
    this.setKilnTraits();
    this.dispatchStat = { sent: 0, hits: 0, wasted: 0, sealed: 0, last: 'no inspections yet' };
    this.news = []; this.awareness = 0; this.newsSeq = 0;
    this.chal = { n: 0, speed: 0, red: 0, fines: 0, list: [], repeat: 0, cameraHits: 0 };
    this.fc = { aqi: [], pend: [], err: 0, n: 0, advice: [], aiActs: 0 };
    this.fuel = { litres: 0, cost: 0, litresToday: 0, costToday: 0 };
    this.common = { flu: 0, cough: 0, fever: 0, sore: 0, total: 0, everSick: 0, workLost: 0 };
    this.pharmacy = { stock: p.medicineStock, used: 0, shortages: 0 };
    this.cons = { floors: 0, working: false, dust: 0, why: 'not started', days: 0, done: false };
    this.amuse = { visits: 0, peak: 0, today: 0, kwh: 0 };
    this.skyStat = { peak: 0, wait: 0, kwh: 0 };
    this.strikes = []; this.strikeSeq = 0; this.stormRng = new Random((p.seed * 7919 + 777) >>> 0);
    this.funeralQueue = []; this.buried = 0; this.funerals = 0; this.buses = []; this.rigs = []; this.busSeq = 0; this.rigSeq = 0; this.respTimes = []; this.flood = 0;
    this.stats.busRides = 0; this.stats.delivered = 0; this.stats.yielded = 0;
    this.aqiSum = 0; this.aqiN = 0; this.aqiYesterday = 0;
    this.gateBusy = GATES.map(() => -1);
    this.grid = new SpatialGrid(WORLD_W, WORLD_H, 20);
    this._near = []; this._cand = []; this._inf = []; this._cars = []; this._walk = []; this._jl = new Map(); this._bq = new Map();
    this.buildCity();
    this.assignPolice();
    this.buildPeople();
    for (const a of this.agents) { a.applyBehaviour(p); a.vaccinated = a.uVaccine < p.vaccinated / 100; }
    this.assignChronic();
    this.ambulances = [];
    for (let i = 0; i < p.ambulances; i++) this.ambulances.push(new Ambulance(i, this));
    this.heli = new Helicopter(this.hospital.helipad);
    this.initSystems();
    this.ecoInit();
    this.pol = new Float32Array(PCOLS * PROWS).fill(BG_PM);
    this.pol2 = new Float32Array(PCOLS * PROWS);
    this.pm = BG_PM; this.aqi = aqiFromPm(BG_PM);
    this.updateDetect();
    const pool = this.agents.filter((a) => !a.vaccinated && a.age.key !== 'child');
    const n = Math.min(p.initialInfected, pool.length);
    for (let i = 0; i < n; i++) {
      const a = pool.splice(this.rng.int(0, pool.length - 1), 1)[0];
      this.infect(a, null, true);
      this.log('start', `Patient zero: Person #${a.id} (${a.age.key}) at ${a.home.name}`);
    }
    this.newDay(true);
    this.updateEnvironment();
    // let the air settle so the run does not start with perfectly clean air
    for (let i = 0; i < 60; i++) this.updatePollution(true);
    let sSum = 0, sN = 0;
    for (const a of this.agents) { a.exposure = Math.min(1.2, this.pm / 150); if (a.age.key !== 'child') { sSum += a.stress; sN++; } }
    this.stressAvg = sN ? sSum / sN : 0;
    this.record();
    this.emit('reset');
  }

  setParams(changes) {
    const before = this.eco ? this.ecoBefore(changes) : null;
    Object.assign(this.params, changes);
    if ('zigzagShare' in changes || 'nightShare' in changes) this.setKilnTraits();
    if ('diabeticShare' in changes || 'hypertensionShare' in changes || 'asthmaShare' in changes) this.assignChronic();
    if ('startSeason' in changes || 'seasonMode' in changes || 'seasonDays' in changes) { this.season = this.seasonFor(this.dayIndex); this.dawn = this.season.dawn; this.dusk = this.season.dusk; }
    for (const a of this.agents) a.applyBehaviour(this.params);
    if (this.eco) { this.ecoComply(); this.ecoCharge(before, changes); }
    this.updateDetect();
    if ('trafficPolice' in changes) this.assignPolice();
    if ('fireTrucks' in changes || 'wasteFleet' in changes || 'maintenanceCrews' in changes || 'ambulances' in changes) this.syncFleet();
    if ('tankCapacity' in changes) this.wa.tank = Math.min(this.wa.tank, this.params.tankCapacity);
    if ('batteryKwh' in changes) this.en.bat = Math.min(this.en.bat, this.params.batteryKwh);
    if ('trafficLights' in changes && !changes.trafficLights) { this.queueLen.fill(0); for (const a of this.agents) { a.queueKey = -1; a.queueJ = null; } }
  }
  updateDetect() { this.detectPerTick = 1 - Math.pow(1 - this.params.detectionRate / 100, 1 / TICKS_PER_DAY); }
  log(type, text) {
    this.events.push({ tick: this.tick, type, text }); this.emit('event', this.events[this.events.length - 1]);
    if (this.news && ['air', 'weather', 'power', 'fire', 'season', 'city', 'alert', 'death', 'ai', 'traffic', 'flight'].includes(type)) this.addNews(type, (type === 'air' || type === 'fire' ? 'BREAKING: ' : '') + text, type === 'air' || type === 'fire' ? 0.5 : type === 'power' || type === 'death' ? 0.35 : 0.2);
    else if (this.news && type === 'spread' && /First infection/.test(text)) this.addNews('spread', 'HEALTH: first cases confirmed, doctors urge care', 0.4);
  }

  /* ----- a new day: weather, flights, trips, weddings, plans ----- */
  seasonFor(d) {
    const p = this.params, i0 = Math.max(0, SEASONS.findIndex((x) => x.key === p.startSeason));
    return SEASONS[p.seasonMode === 'cycle' ? (i0 + Math.floor(d / Math.max(1, p.seasonDays))) % 4 : i0];
  }
  assignChronic() {
    const rng = this.rng, p = this.params;
    for (const a of this.agents) {
      a.diabetic = a.age.key !== 'child' && rng.chance(p.diabeticShare / 100 * (a.age.key === 'elder' ? 1.6 : 1));
      a.hypertensive = a.age.key !== 'child' && rng.chance(p.hypertensionShare / 100 * (a.age.key === 'elder' ? 1.5 : 1));
      a.asthmatic = rng.chance(p.asthmaShare / 100);
      a.common = null;      // { type, until, severity }
    }
  }
  /* common illnesses: flu, cough, sore throat, fever. Self-limiting, not the epidemic disease.
     They keep people home from work/school for a few days and use up medicine stock. */
  updateCommonIllness() {
    const p = this.params, rng = this.rng, Ph = this.pharmacy, C = this.common;
    const dailyRate = 0.006 * (p.commonIllnessRate / 100) * (1 + 0.012 * Math.max(0, this.aqi - 100) / 100) * (this.season.key === 'winter' ? 1.6 : this.season.key === 'summer' ? 0.7 : 1);
    const tickRate = dailyRate / (TICKS_PER_DAY / TICKS_PER_HOUR);   // this.updateCommonIllness runs once per hour, not every tick
    let flu = 0, cough = 0, fever = 0, sore = 0;
    for (const a of this.agents) {
      if (a.state === 'D') continue;
      if (a.common) {
        if (this.tick >= a.common.until) a.common = null;
        else { const k = a.common.type; if (k === 'flu') flu++; else if (k === 'cough') cough++; else if (k === 'fever') fever++; else sore++; }
        continue;
      }
      if (rng.chance(tickRate)) {
        const types = ['flu', 'cough', 'fever', 'sore throat'], type = rng.pick(types);
        const dur = type === 'flu' ? rng.int(3, 7) : type === 'fever' ? rng.int(2, 5) : rng.int(2, 6);
        a.common = { type, until: this.tick + dur * TICKS_PER_DAY, needsMed: rng.chance(0.7) };
        C.everSick++; C.total++;
        if (a.common.needsMed) { if (Ph.stock > 0) { Ph.stock--; Ph.used++; } else Ph.shortages++; }
      }
    }
    C.flu = flu; C.cough = cough; C.fever = fever; C.sore = sore;
    Ph.stock = Math.min(p.medicineStock, Ph.stock + p.medicineRestock / (TICKS_PER_DAY / TICKS_PER_HOUR));
  }
  /* fuel: every drive-mode agent and moving vehicle burns petrol at a rate set by the efficiency slider */
  updateFuel() {
    // this.updateFuel runs once per hour: convert metres/tick speeds to km travelled in that hour
    const p = this.params, F = this.fuel;
    let km = 0;
    for (const a of this.agents) if (a.mode === 'drive') km += (this.driveSpeed * TICKS_PER_HOUR) / 1000;
    for (const v of this.vehicles) if (!v.crashed) km += (Math.abs(v.v) * TICKS_PER_HOUR) / 1000;
    const litres = km / Math.max(1, p.fuelEfficiency);
    const cost = litres * p.fuelPrice;
    F.litres += litres; F.cost += cost; F.litresToday += litres; F.costToday += cost; F.litresHour = litres;
  }
  /* real-world resource estimate: scale this small simulated city up to a real one */
  realWorldEstimate() {
    const p = this.params, k = Math.max(1, p.realCityScale), E = this.en, W = this.wa, pop = p.population * k;
    return {
      scale: k, population: Math.round(pop),
      waterMLD: +(W.demand * 24 / 1000 * k).toFixed(2),                 // million litres per day (m3/h -> L/day)
      electricityMW: +(E.demand / 1000 * k).toFixed(2),
      fuelLitresDay: +(this.fuel.litresToday * k).toFixed(0),
      wasteTonnesDay: +((this.wst.generated / Math.max(0.01, this.tick / TICKS_PER_DAY)) / 1000 * k).toFixed(1),
      medicineUnitsDay: +(this.pharmacy.used / Math.max(0.01, this.tick / TICKS_PER_DAY) * k).toFixed(0),
      kilnsNeeded: Math.round(Math.min(p.kilns, 8) * k),
      hospitalBedsNeeded: Math.round(p.hospitalBeds * k),
    };
  }
  setKilnTraits() {
    const p = this.params, nz = Math.round(8 * p.zigzagShare / 100), nn = Math.round(8 * p.nightShare / 100);
    this.kZig = new Array(8).fill(false); this.kNight = new Array(8).fill(false);
    [1, 3, 0, 2, 5, 7, 4, 6].slice(0, nz).forEach((i) => { this.kZig[i] = true; });
    [0, 2, 1, 3, 4, 5, 6, 7].slice(0, nn).forEach((i) => { this.kNight[i] = true; });
  }
  kilnEm(i) {
    const p = this.params, h = this.minuteNow;
    return 900 * (p.cleanKilns ? 0.35 : 1) * (this.kZig[i] ? 0.4 : 1) * (this.night ? 1.25 : 1) * (this.kNight[i] ? (h >= 480 && h < 1020 ? 0.3 : 1.5) : 1);
  }
  kilnOn(i) {
    const p = this.params;
    if (i >= p.kilns || i >= KILN_SITES.length) return false;
    if (this.kilnSealed[i] > this.tick) return false;
    if (this.kilnOverride[i] === false) return false;
    if (this.kilnOverride[i] === true) return true;
    return !(p.kilnWinterStop && this.season.key === 'winter');
  }
  kilnsOn() { let n = 0; for (let i = 0; i < KILN_SITES.length; i++) if (this.kilnOn(i)) n++; return n; }
  newDay(first) {
    const d = this.dayIndex, p = this.params, rng = this.rng, d0 = this.dayStart(d);
    const prevSeason = this.season;
    this.season = this.seasonFor(d); this.dawn = this.season.dawn; this.dusk = this.season.dusk;
    if (!first && prevSeason !== this.season) this.log('season', `${this.season.name} begins${this.season.key === 'winter' && p.kilnWinterStop ? ': the brick kilns shut for the winter' : ''}`);
    this.cons.days += 0;
    this.fuel.litresToday = 0; this.fuel.costToday = 0;
    // weather for today (always draw the same random numbers so runs stay comparable)
    const fogRoll = rng.next(), fogA = rng.int(120, 300), fogB = rng.int(570, 700), fogMax = rng.range(0.55, 1);
    const rainRoll = rng.next(), rainA = rng.int(0, 1300), rainLen = rng.int(120, 480), rainMax = rng.range(0.35, 1);
    this.spells = this.spells.filter((s) => s.b > this.tick);
    if (p.weather === 'auto') {
      if (fogRoll < Math.min(0.95, p.fogChance * this.season.fog / 100)) this.spells.push({ kind: 'fog', a: d0 + fogA, b: d0 + fogB, max: fogMax });
      if (rainRoll < Math.min(0.95, p.rainChance * this.season.rain / 100)) this.spells.push({ kind: 'rain', a: d0 + rainA, b: d0 + rainA + rainLen, max: rainMax });
    }
    this.today = { departures: new Map(), weddingGuests: null, rainDay: false, smog: false, wedding: false, orders: [], orderIdx: 0, funeral: null, burstAt: -1, outageAt: -1, fireAt: -1, heat: p.baseTemp + this.season.dT + (p.heatwave ? 9 : 0) + 7 > 36 };
    for (const s of this.spells) if (s.kind === 'rain' && s.a < d0 + 1200 && s.b > d0 + 420) this.today.rainDay = true;
    if (p.weather === 'rain') this.today.rainDay = true;
    // smog emergency
    const yAqi = this.aqiN ? this.aqiSum / this.aqiN : this.aqi;
    this.aqiYesterday = yAqi; this.aqiSum = 0; this.aqiN = 0;
    const dashY = this.dash.n ? this.dash.sum / this.dash.n : null;
    this.dash.yesterday = dashY; this.dash.sum = 0; this.dash.n = 0;
    if (!first && p.smogSchoolClose) {
      const seen = p.decideBySensors ? dashY : yAqi;     // the rule can use the control-room reading instead of the true air
      if (seen == null) { this.log('sensor', 'No sensor data reached the control room: the smog rule could not decide'); this.stats.smogBlind = (this.stats.smogBlind || 0) + 1; }
      else {
        const close = seen > 300, should = yAqi > 300;
        if (close) { this.today.smog = true; this.log('air', `Smog emergency: yesterday's air quality index was ${Math.round(seen)}${p.decideBySensors ? ' (control-room reading)' : ''}. Schools and university closed today`); }
        if (close !== should) this.stats.smogWrong = (this.stats.smogWrong || 0) + 1;
      }
    }
    // random incidents today (always drawn, so runs stay comparable)
    const rB = rng.next(), rO = rng.next(), rF = rng.next(), mB = rng.int(300, 1300), mO = rng.int(420, 1200), mF = rng.int(420, 1300);
    if (!first) {
      if (rB < p.pipeFailure / 100) this.today.burstAt = mB;
      if (rO < p.gridOutageChance / 100) this.today.outageAt = mO;
      if (rF < p.fireRate / 100) this.today.fireAt = mF;
    }
    this.failSensors();
    this.failWifi();
    // weddings on Friday, Saturday and Sunday evenings
    const wd = d % 7;
    const wedRoll = rng.next();
    if (wd >= 4 && p.gatheringsOpen && wedRoll < p.weddings / 3) {
      const guests = new Set();
      for (const h of this.households) if (rng.chance(0.15)) guests.add(h.id);
      this.today.weddingGuests = guests; this.today.wedding = true;
      this.log('gather', `Wedding tonight at the Shadi Hall: ${guests.size} families invited`);
    }
    if (wd === 4 && p.gatheringsOpen && !this.flags.firstFriday) { this.flags.firstFriday = true; this.log('gather', 'Friday: many people go to Friday prayers at the Jamia Masjid around 13:00'); }
    // flights (bad weather can delay the schedule: fog/storm/snow push both legs back)
    this.flights = this.flights.filter((f) => f.tD + FL.TO + FL.CLIMB > this.tick);
    const nF = p.flightsPerDay;
    const todays = [];
    this.flightDelaysToday = 0;
    for (let i = 0; i < nF; i++) {
      const mA = Math.round(390 + (i + 0.5) * (1000 / nF) + rng.range(-20, 20));
      const turn = rng.int(70, 110);
      const tA0 = d0 + mA;
      if (tA0 - FL.APP < this.tick) continue;
      const badWx = p.weather === 'storm' ? 0.55 : p.weather === 'snow' ? 0.5 : p.weather === 'fog' ? 0.4 : p.weather === 'smog' ? 0.2 :
        (this.spells.some((s) => s.a < tA0 + 60 && s.b > tA0 - 60) ? (this.season.key === 'winter' ? 0.35 : 0.25) : 0.03);
      const delayMin = rng.chance(badWx) ? rng.int(20, 95) : 0;
      const tA = tA0 + delayMin;
      const tD = tA + FL.ROLL + FL.TIN + turn + FL.PUSH + FL.TOUT;
      let g = 0;
      for (let k = 1; k < GATES.length; k++) if (this.gateBusy[k] < this.gateBusy[g]) g = k;
      this.gateBusy[g] = tD;
      const f = { id: ++this.flightSeq, code: `${AIRLINES[rng.int(0, AIRLINES.length - 1)]}-${rng.int(101, 899)}`, from: CITIES[rng.int(0, CITIES.length - 1)],
        tA, tD, mA: mA + delayMin, mD: mA + delayMin + (tD - tA), gate: g, gateX: GATES[g], arrivals: [], done: false, delayMin };
      if (delayMin) {
        this.flightDelaysToday++; this.stats.flightsDelayed++; this.stats.flightDelayMinTotal += delayMin;
        const why = p.weather === 'snow' ? 'snow on the runway' : p.weather === 'storm' ? 'the thunderstorm' : (p.weather === 'fog' || p.weather === 'smog' || this.fog > 0.4) ? 'low visibility' : 'bad weather';
        if (delayMin > 40) this.log('flight', `Flight ${f.code} from ${f.from} delayed ${delayMin} min: ${why}`);
      }
      this.flights.push(f); todays.push(f);
    }
    if (this.flightDelaysToday >= 3) this.log('flight', `${this.flightDelaysToday} flights delayed today at the airport because of the weather`);
    // travellers coming home today
    for (const a of this.agents) {
      if (!a.away || a.awayReason !== 'trip' || !a.trip || a.trip.returnDay > d || a.state === 'D') continue;
      const opts = todays.filter((f) => f.tA + FL.ROLL + FL.TIN > this.tick + 5);
      if (opts.length) { const f = opts[rng.int(0, opts.length - 1)]; f.arrivals.push(a); a.trip.returnFlight = f; }
      else a.returnTick = Math.max(this.tick + 30, d0 + 1080);   // no flights: home by road in the evening
    }
    // travellers leaving today
    for (const f of todays) {
      if (f.mD - 150 < this.minuteNow + 30 || f.mD > 1430 || !rng.chance(0.6)) continue;
      for (let tries = 0; tries < 6; tries++) {
        const a = this.agents[rng.int(0, this.agents.length - 1)];
        if (a.age.key === 'child' || !a.alive || a.busy || a.trip || a.distancing || this.today.departures.has(a.id)) continue;
        this.today.departures.set(a.id, f);
        break;
      }
    }
    // cars back from the repair shop
    for (const h of this.households) if (h.carWreckUntil && h.carWreckUntil <= this.tick) { h.carWreckUntil = 0; h.carInUse = false; }
    this.accDaily.push({ city: 0, mw: 0 });
    this.today.funeral = this.prepareFuneral(d);
    if (this.eco && !first) this.ecoDaily();
    for (const a of this.agents) a.planDay(this, d);
    this.today.orders.sort((a, b) => a.t - b.t);
  }

  /* ----- weather, light and the speed of traffic, every tick ----- */
  updateEnvironment() {
    const p = this.params, t = this.tick;
    this.updateClimate();
    this.lightning();
    let rain = 0, fog = 0;
    for (const s of this.spells) {
      if (t < s.a - 45 || t > s.b + 45) continue;
      const v = s.max * Math.max(0, Math.min(1, (t - s.a + 45) / 90, (s.b + 45 - t) / 90));
      if (s.kind === 'rain') rain = Math.max(rain, v); else fog = Math.max(fog, v);
    }
    fog = Math.max(fog, Math.pow(p.fogDensity / 100, 1.8) * 0.5 * (this.night ? 1.3 : 1) * (this.season ? this.season.fog : 1) * (p.weather === 'clear' ? 0 : 1));   // baseline haze: barely visible at default (25%), full fog if maxed out at night in winter
    if (p.weather === 'clear') { rain = 0; fog = Math.min(fog, 0.06); }
    if (p.weather === 'rain') { rain = 0.72 + 0.2 * Math.sin(t / 97); fog = 0; }
    if (p.weather === 'storm') { rain = 0.9 + 0.08 * Math.sin(t / 61); fog = 0; }
    if (p.weather === 'fog') { fog = 0.9; rain = 0; }
    if (p.weather === 'smog') { fog = Math.max(fog, 0.5 + 0.1 * Math.sin(t / 211)); rain = 0; }
    let snowing = 0;
    if (p.weather === 'snow') { snowing = 0.75 + 0.2 * Math.sin(t / 130); fog = Math.max(fog, 0.15); rain = 0; }
    this.rain = rain; this.fog = Math.min(1, fog); this.storm = rain > 0.82;
    this.snowing = snowing;
    // snow builds up on the roads while it falls and melts slowly once it stops (faster once ploughed)
    const prevDepth = this.snowDepth || 0;
    this.snowDepth = Math.max(0, Math.min(1, prevDepth + (snowing > 0 ? snowing * 0.0022 : -(this.plough ? 0.01 : 0.0012))));
    this.snow = this.snowDepth;
    if (this.snow > 0.18 && !this.plough && p.snowPloughs) this.plough = true;
    if (this.snow < 0.04) this.plough = false;
    const m = this.minuteNow;
    this.night = m < this.dawn || m >= this.dusk;
    this.roadEnv = (1 + 1.4 * rain + 2.6 * fog + 2.2 * this.snow) * (this.night ? 1.6 * this.lightPenalty : 1) * (1 + 0.8 * this.flood);
    this.speedFactor = p.speedLimit / 50;
    const snowSlow = this.plough ? this.snow * 0.18 : this.snow * 0.55;
    this.driveSpeed = DRIVE_SPEED * this.speedFactor * (1 - 0.2 * rain) * (1 - 0.35 * fog) * (1 - 0.4 * this.flood) * (1 - snowSlow);
    this.windX = Math.cos(this.windAng) * this.windSpd; this.windY = Math.sin(this.windAng) * this.windSpd;
    // weather news
    const f = this.flags;
    if (rain > 0.3 && !f.rainOn) { f.rainOn = true; if (t - (f.rainLog || -1e9) > 360) { f.rainLog = t; this.log('weather', this.storm || rain > 0.8 ? 'Heavy rain and thunderstorm: roads are slippery' : 'It started raining: fewer people in the parks, more people drive'); } }
    else if (rain < 0.15 && f.rainOn) f.rainOn = false;
    if (fog > 0.45 && !f.fogOn) { f.fogOn = true; if (t - (f.fogLog || -1e9) > 600) { f.fogLog = t; this.log('weather', `Thick ${p.weather === 'smog' ? 'smog' : 'fog'}: visibility under ${Math.round(25 + 375 * Math.pow(1 - fog, 2))} m, drivers slow down`); } }
    else if (fog < 0.25 && f.fogOn) f.fogOn = false;
    if (this.snow > 0.2 && !f.snowOn) { f.snowOn = true; if (t - (f.snowLog || -1e9) > 480) { f.snowLog = t; this.log('weather', p.snowPloughs ? 'Snow is settling on the roads: ploughs are out clearing the main routes' : 'Snow is settling on the roads: traffic slows down (turn on snow ploughs in Smart city to clear it faster)'); } }
    else if (this.snow < 0.08 && f.snowOn) f.snowOn = false;
    // traffic lights: empty the queues that have a green light
    if (p.trafficLights) {
      const Q = this.queueLen;
      for (const j of this.junctions) {
        if (!j.signal) continue;
        const b = j.id * 4;
        if (this.lightFor(j, 'h') === 'G') { Q[b] = 0; Q[b + 1] = 0; }
        if (this.lightFor(j, 'v') === 'G') { Q[b + 2] = 0; Q[b + 3] = 0; }
      }
    }
  }

  /* ----- air pollution: emissions, wind, mixing, rain wash-out (every 10 minutes) ----- */
  updatePollution(settle) {
    const p = this.params, A = this.pol, B = this.pol2, m = this.minuteNow;
    const add = (x, y, e) => {
      const c = (x / PCELL) | 0, r = (y / PCELL) | 0;
      if (c < 0 || r < 0 || c >= PCOLS || r >= PROWS) return;
      A[r * PCOLS + c] += e;
    };
    for (const e of this.extraEm) add(e.x, e.y, e.e);
    this.extraEm.length = 0;
    let emK = 0, emT = 0;
    for (let k = 0; k < KILN_SITES.length; k++) if (this.kilnOn(k)) { const kE = this.kilnEm(k); add(KILN_SITES[k].x, KILN_SITES[k].y, kE); emK += kE; }
    // construction dust: work days, daytime, unless the work is stopped
    const cw = this.constructionWorking();
    if (cw && this.construction) { const e = 230 * (p.constructionWorkers / 60) * (p.dustControl ? 0.4 : 1); add(this.construction.cx, this.construction.cy, e); emT += e; this.cons.dust = e; } else this.cons.dust = 0;
    const wd = this.dayIndex % 7;
    if (m >= 420 && m < 1140 && wd < 6) for (const f of this.factories) add(f.chimney.x, f.chimney.y, 260 * (p.factorySmoke / 100) * (wd === 5 ? 0.5 : 1) * (f.pw === undefined ? 1 : f.pw));
    if (!settle) {
      const tE = 3.2 * p.trafficSmoke / 100 * (1 - 0.9 * p.evShare / 100 * 0.45);
      for (const a of this.agents) if (a.mode === 'drive') add(a.x, a.y, tE);
      for (const v of this.vehicles) if (!v.crashed) add(v.x, v.y, tE * (v.kind === 'car' ? 1 : 3.5));
    } else {
      // average traffic while the air settles at the start
      add(500, 300, 80 * p.trafficSmoke / 100);
      for (let x = 100; x < WORLD_W; x += 200) add(x, MW_Y, 10 * p.trafficSmoke / 100 * p.motorwayTraffic / 40);
    }
    // wind carries the smoke (semi-Lagrangian), neighbours mix, the air slowly cleans
    const ux = (this.windX * 10) / PCELL, uy = (this.windY * 10) / PCELL;
    const fxs = -ux - Math.floor(-ux), fys = -uy - Math.floor(-uy), ox = Math.floor(-ux), oy = Math.floor(-uy);
    const w00 = (1 - fxs) * (1 - fys), w10 = fxs * (1 - fys), w01 = (1 - fxs) * fys, w11 = fxs * fys;
    for (let r = 0; r < PROWS; r++) {
      const r0 = r + oy, r1 = r0 + 1, in0 = r0 >= 0 && r0 < PROWS, in1 = r1 >= 0 && r1 < PROWS;
      const b0 = r0 * PCOLS, b1 = r1 * PCOLS;
      for (let c = 0; c < PCOLS; c++) {
        const c0 = c + ox, c1 = c0 + 1, ok0 = c0 >= 0 && c0 < PCOLS, ok1 = c1 >= 0 && c1 < PCOLS;
        B[r * PCOLS + c] = (in0 && ok0 ? A[b0 + c0] : BG_PM) * w00 + (in0 && ok1 ? A[b0 + c1] : BG_PM) * w10 + (in1 && ok0 ? A[b1 + c0] : BG_PM) * w01 + (in1 && ok1 ? A[b1 + c1] : BG_PM) * w11;
      }
    }
    const smog = p.weather === 'smog';
    const k = Math.min(0.5, (0.022 + 0.008 * this.windSpd) * (1 - 0.85 * this.fog) * (smog ? 0.3 : 1) * this.season.mix + 0.12 * this.rain + (p.sprayGuns > 0 && m >= 600 && m < 1080 && this.rain < 0.2 ? 0.0045 * p.sprayGuns * (this.wa.tank > 1 ? 1 : 0) : 0)), keep = 1 - k;
    const cityC = CITY_W / PCELL, cityR = CITY_H / PCELL;
    let sum = 0, n = 0;
    for (let r = 0; r < PROWS; r++) for (let c = 0; c < PCOLS; c++) {
      const i = r * PCOLS + c, b = B[i];
      const up = r > 0 ? B[i - PCOLS] : BG_PM, dn = r < PROWS - 1 ? B[i + PCOLS] : BG_PM, lf = c > 0 ? B[i - 1] : BG_PM, rt = c < PCOLS - 1 ? B[i + 1] : BG_PM;
      const v = BG_PM + (b + 0.16 * ((up + dn + lf + rt) * 0.25 - b) - BG_PM) * keep;
      A[i] = v;
      if (c < cityC && r < cityR) { sum += v; n++; }
    }
    this.pm = sum / n;
    this.aqi = aqiFromPm(this.pm);
    if (!settle) { const tot = emK + emT + (m >= 420 && m < 1140 ? 260 * this.factories.length * p.factorySmoke / 100 : 0) + 40; this.emK = this.emK * 0.95 + emK * 0.05; this.emAll = this.emAll * 0.95 + tot * 0.05; }
    if (!settle) {
      this.aqiSum += this.aqi; this.aqiN++;
      const f = this.flags;
      for (const [lvl, msg] of [[200, 'Air quality very unhealthy (AQI over 200): smoke from kilns, factories and traffic is trapped over the city'], [300, 'Hazardous smog (AQI over 300): people with weak lungs are at higher risk']]) {
        if (this.aqi > lvl && !f['aqi' + lvl] && this.tick - (f['aqiT' + lvl] || -1e9) > TICKS_PER_DAY) { f['aqi' + lvl] = true; f['aqiT' + lvl] = this.tick; this.log('air', msg); }
        else if (this.aqi < lvl - 40) f['aqi' + lvl] = false;
      }
    }
  }
  pm25At(x, y) {
    const c = Math.max(0, Math.min(PCOLS - 1, (x / PCELL) | 0)), r = Math.max(0, Math.min(PROWS - 1, (y / PCELL) | 0));
    return this.pol[r * PCOLS + c];
  }

  /* ----- state changes ----- */
  infect(a, by, startInfectious, where) {
    const p = this.params;
    a.timesInfected++;
    a.infectedBy = by ? by.id : null;
    a.infectedAtTick = this.tick;
    a.infectedWhere = where || null;
    a.generation = by ? (by.generation || 0) + 1 : 0;
    a.secondary = 0; a.infectedIds = []; a.severe = false; a.ambCalled = false; a.untreated = 0;
    this.everInfected++;
    this.infectionOrder.push(a.id);
    if (by) {
      by.secondary++;
      by.infectedIds.push(a.id);
      this.recentInfections.push({ from: by.id, to: a.id, tick: this.tick, x: a.x, y: a.y });
      const g = PLACE_GROUP[where] || 'street';
      this.whereCounts[g]++;
      if (!this.flags['first_' + g]) {
        this.flags['first_' + g] = true;
        const place = a.place ? (a.place.type === 'home' ? 'at home' : 'at ' + a.place.name) : 'on the street';
        this.log('spread', `First infection ${g === 'home' ? 'inside a home' : 'in ' + GROUP_LABELS[g].toLowerCase()}: Person #${by.id} infected #${a.id} ${place}`);
      }
      if (by.secondary >= 5 && !by.superSpreaderLogged) {
        by.superSpreaderLogged = true;
        this.flags.superCount = (this.flags.superCount || 0) + 1;
        if (this.flags.superCount <= 4) this.log('spread', `Person #${by.id} became a super-spreader (5+ people infected)`);
      }
      if (a.timesInfected === 2 && !this.flags.reinfection) { this.flags.reinfection = true; this.log('spread', `First reinfection: Person #${a.id} caught it a second time`); }
    }
    a.state = 'E';
    if (startInfectious) this.becomeInfectious(a);
    else {
      a.stateTicks = 0;
      a.stateDuration = Math.round(Math.max(1, this.rng.normal(p.incubationDays, p.incubationDays * 0.3)) * TICKS_PER_DAY);
    }
  }

  /* chance of serious illness: age, vaccine, smoking, exercise and the air the person has been breathing */
  severeChance(a) {
    const p = this.params;
    return Math.min(0.95, a.age.severe * (a.vaccinated ? 0.3 : 1) * (a.smoker ? SMOKE_SEVERE : 1) * (a.gymGoer ? GYM_SEVERE : 1) * (1 + (p.airHarm / 100) * a.exposure) * (a.age.key === 'elder' ? 1 + 0.015 * Math.max(0, this.tempC - 35) : 1) * (a.diabetic ? 1.35 : 1) * (a.hypertensive ? 1.2 : 1) * (a.asthmatic ? 1.25 : 1) * (a.common && a.common.needsMed && this.pharmacy.stock <= 0 ? 1.1 : 1));
  }
  becomeInfectious(a) {
    const p = this.params, rng = this.rng;
    a.state = 'I';
    a.stateTicks = 0;
    a.stateDuration = Math.round(Math.max(2, rng.normal(p.infectiousDays, p.infectiousDays * 0.25)) * TICKS_PER_DAY);
    a.symptomatic = rng.chance(a.age.symptomatic);
    a.severe = a.symptomatic && rng.chance(this.severeChance(a));
    if (a.severe) {
      a.severeAt = Math.round(Math.min(a.stateDuration * 0.6, rng.range(1.5, 3.5) * TICKS_PER_DAY));
      a.stateDuration += Math.round(rng.range(3, 6) * TICKS_PER_DAY);
    }
  }

  freeBeds() {
    let used = 0;
    for (const b of this.hospital.bedSlots) if (b.patient) used++;
    for (const amb of this.ambulances) { if (amb.patient) used++; used += amb.load; }
    used += this.heli.load + (this.heli.patient ? 1 : 0);
    return this.bedCap() - used;
  }
  /* a hospital without power (and without its generator) can run only half its beds */
  bedCap() { return Math.max(1, Math.floor(this.params.hospitalBeds * (this.en.hospPw < 0.5 ? 0.5 : 1))); }
  bedsUsed() { let n = 0; for (const b of this.hospital.bedSlots) if (b.patient) n++; return n; }
  freeSlot() {
    const n = Math.min(this.bedCap(), MAX_BEDS);
    if (this.bedsUsed() >= this.bedCap()) return -1;
    for (let i = 0; i < n; i++) if (!this.hospital.bedSlots[i].patient) return i;
    return this.hospital.bedSlots.findIndex((b) => !b.patient);
  }

  requestAmbulance(a) {
    a.ambCalled = true;
    if (a.hospitalized) return;               // already in a hospital bed (for example after an accident)
    a.needsAmbulance = true;
    a.plan = []; a.planIdx = 0;
    a.activity = a.injured ? 'Injured, waiting for an ambulance' : 'Seriously ill, waiting for an ambulance';
    a.waitSince = this.tick;
    this.ambQueue.push(a);
    if (!a.injured && !this.flags.firstSevere) { this.flags.firstSevere = true; this.log('alert', `Person #${a.id} is seriously ill. An ambulance is called`); }
  }
  pickupOf(a) {
    if (a.mode === 'injured') return a.pickup;
    if (a.mode === 'inside' && a.place) return a.place.access;
    return null;
  }
  updateAmbulances() {
    const hosp = this.hospital;
    this.ambQueue = this.ambQueue.filter((a) => a.needsAmbulance && a.alive && (a.state === 'I' || a.injured) && !a.ambulance);
    this.ambQueue.sort((a, b) => (b.injured ? 1 : 0) - (a.injured ? 1 : 0) || a.waitSince - b.waitSince);
    let free = this.freeBeds();
    for (const a of this.ambQueue) {
      if (!a.injured && free <= 0) continue;                 // sick people need a free bed; injured people are always collected
      const pick = this.pickupOf(a);
      if (!pick) continue;
      const amb = this.ambulances.find((m) => m.state === 'idle');
      if (!amb) break;
      amb.state = 'toPatient'; amb.patient = a; a.ambulance = amb; amb.pickup = pick;
      const route = offsetRoute(centreRoute(hosp.access, pick), 'drive');
      amb.path = [{ x: hosp.access.door.x, y: hosp.access.door.y }, ...route, { x: pick.door.x, y: pick.door.y }];
      amb.pi = 0;
      if (!a.injured) free--;
      a.activity = 'Ambulance on the way';
      if (!this.flags.firstAmb) { this.flags.firstAmb = true; this.log('care', `First ambulance sent to Person #${a.id}`); }
    }
    // motorway casualties when the helicopter cannot fly
    if (!this.canFly()) {
      const inc = this.incidents.find((i) => i.waiting > 0 && !i.amb && !i.heli);
      const amb = inc && this.ambulances.find((m) => m.state === 'idle');
      if (inc && amb) {
        amb.state = 'toIncident'; amb.incident = inc; inc.amb = amb;
        const toLink = offsetRoute(centreRoute(hosp.access, { axis: 'v', coord: 500, road: { x: 500, y: CITY_H } }), 'drive');
        const yS = MW_Y + (inc.dir > 0 ? -1 : 1) * 13.5;
        amb.path = [{ x: hosp.access.door.x, y: hosp.access.door.y }, ...toLink, { x: 496, y: yS - Math.sign(yS - MW_Y) * 0 }, { x: inc.x, y: yS }];
        amb.pi = 0;
      }
    }
    const waitingNoBed = this.ambQueue.some((a) => !a.ambulance && !a.injured) && this.freeBeds() <= 0;
    if (waitingNoBed && !this.overloaded) {
      this.overloaded = true;
      if (this.tick - (this.flags.fullLog || -1e9) > TICKS_PER_DAY) {
        this.flags.fullLog = this.tick;
        const n = this.ambQueue.filter((a) => !a.ambulance && !a.injured).length;
        this.log('alert', `Hospital full: all ${this.params.hospitalBeds} beds taken, ${n} seriously ill ${n === 1 ? 'person' : 'people'} waiting at home`);
      }
    } else if (!waitingNoBed && this.overloaded) {
      this.overloaded = false;
      if (this.tick - (this.flags.freeLog || -1e9) > TICKS_PER_DAY * 2) { this.flags.freeLog = this.tick; this.log('care', 'Hospital has free beds again'); }
    }
    for (const amb of this.ambulances) {
      if (amb.state === 'idle') continue;
      if (amb.state === 'toPatient' || amb.state === 'toHospital' || amb.state === 'toIncident') this.clearWay(amb);
      const a = amb.patient;
      const gone = (x) => !x || !x.alive || !(x.state === 'I' || x.injured);
      if (amb.state === 'toPatient') {
        if (gone(a)) { this.sendBack(amb); continue; }
        if (amb.follow()) { amb.state = 'loading'; amb.wait = 8; }
      } else if (amb.state === 'loading') {
        if (gone(a)) { this.sendBack(amb); continue; }
        if (--amb.wait <= 0) {
          a.mode = 'ambulance'; a.ctx = -2; a.place = null; a.activity = 'In the ambulance';
          a.needsAmbulance = false;
          const route = offsetRoute(centreRoute(amb.pickup, hosp.access), 'drive');
          amb.path = [{ x: amb.pickup.door.x, y: amb.pickup.door.y }, ...route, { x: hosp.access.door.x, y: hosp.access.door.y }];
          amb.pi = 0; amb.state = 'toHospital';
        }
      } else if (amb.state === 'toHospital') {
        if (a && a.mode === 'ambulance') { a.x = amb.x; a.y = amb.y; }
        if (amb.follow()) {
          if (amb.load) { this.admitVisitors(amb.load, 'ambulance'); amb.load = 0; }
          if (a && a.alive && a.mode === 'ambulance') this.admit(a);
          else if (a && !a.alive) { a.x = this.hospital.access.door.x; a.y = this.hospital.access.door.y; }
          this.sendBack(amb);
        }
      } else if (amb.state === 'toIncident') {
        if (amb.follow()) { amb.state = 'atIncident'; amb.wait = 15; }
      } else if (amb.state === 'atIncident') {
        if (--amb.wait <= 0) {
          const inc = amb.incident;
          amb.load = Math.min(2, inc.waiting); inc.waiting -= amb.load; inc.amb = null; amb.incident = null;
          amb.path = amb.path.slice().reverse(); amb.pi = 0; amb.state = 'toHospital';
        }
      } else if (amb.state === 'returning') {
        if (amb.follow()) { amb.state = 'idle'; amb.heading = -Math.PI / 2; }
      }
    }
  }
  sendBack(amb) {
    if (amb.patient && amb.patient.ambulance === amb) amb.patient.ambulance = null;
    amb.patient = null; amb.pickup = null;
    const door = this.hospital.access.door;
    const atDoor = Math.hypot(amb.x - door.x, amb.y - door.y) < 2;
    amb.path = atDoor ? [{ x: amb.bay.x, y: amb.bay.y - 8 }, { x: amb.bay.x, y: amb.bay.y }] : [{ x: door.x, y: door.y }, { x: amb.bay.x, y: amb.bay.y - 8 }, { x: amb.bay.x, y: amb.bay.y }];
    if (!atDoor) {
      const route = offsetRoute(centreRoute(roadAccess(amb.x, amb.y), this.hospital.access), 'drive');
      amb.path = [...route, ...amb.path];
    }
    amb.pi = 0; amb.state = 'returning';
  }
  admit(a) {
    const slot = a.state === 'I' || a.injured ? this.freeSlot() : -1;
    if (slot < 0) {
      if (a.injured) {   // no bed: Rescue 1122 takes the injured person to a hospital in another city
        this.stats.transfers++;
        a.mode = 'away'; a.away = true; a.awayReason = 'transfer'; a.ctx = -3; a.place = null; a.returnTick = Math.max(a.injuryEnds, this.tick + TICKS_PER_DAY);
        a.activity = 'In a hospital in another city (no bed here)';
        if (!this.flags.transferLog || this.tick - this.flags.transferLog > TICKS_PER_DAY) { this.flags.transferLog = this.tick; this.log('road', `No free bed: injured Person #${a.id} was sent to a hospital in another city`); }
        return;
      }
      a.mode = 'inside'; a.place = this.hospital; a.ctx = this.hospital.id; a.x = this.hospital.access.door.x; a.y = this.hospital.access.door.y;
      if (a.state !== 'I') a.travelTo(a.home, this, 'At home');
      return;
    }
    this.hospital.bedSlots[slot].patient = a;
    a.bed = slot; a.hospitalized = true; a.mode = 'bed'; a.place = this.hospital; a.ctx = this.hospital.id;
    a.x = this.hospital.bedSlots[slot].x; a.y = this.hospital.bedSlots[slot].y; a.heading = -Math.PI / 2;
    a.activity = a.injured ? `In hospital after an accident, bed ${slot + 1}` : `In hospital, bed ${slot + 1}`;
    if (a.injured) a.injuryEnds = Math.max(a.injuryEnds, this.tick + a.injuryDays * TICKS_PER_DAY);
    if (!a.injured && !this.flags.firstAdmit) { this.flags.firstAdmit = true; this.log('care', `First hospital admission: Person #${a.id}`); }
    this.admitted = (this.admitted || 0) + 1;
  }
  freeBed(a) {
    if (a.bed >= 0 && this.hospital.bedSlots[a.bed].patient === a) this.hospital.bedSlots[a.bed].patient = null;
    a.bed = -1; a.hospitalized = false;
  }
  /* motorway casualties (travellers, not people of the city) */
  admitVisitors(n, how) {
    let inBed = 0;
    for (let k = 0; k < n; k++) {
      const slot = this.freeSlot();
      if (slot < 0) { this.stats.transfers++; continue; }
      const s = this.hospital.bedSlots[slot];
      const v = { visitor: true, id: ++this.visitorSeq, bed: slot, x: s.x, y: s.y, until: this.tick + Math.round(this.rng.range(2, 7) * TICKS_PER_DAY) };
      s.patient = v; this.visitors.push(v); inBed++;
    }
    if (n) this.admitted += inBed;
    if (n - inBed > 0 && (!this.flags.mwTransfer || this.tick - this.flags.mwTransfer > TICKS_PER_DAY)) { this.flags.mwTransfer = this.tick; this.log('road', `${n - inBed} motorway casualties sent to another city: no free beds`); }
    return inBed;
  }
  isolate(a) {
    a.isolated = true; a.isolatedAt = this.tick;
    a.plan = []; a.planIdx = 0;
    this.flags.isolatedTotal = (this.flags.isolatedTotal || 0) + 1;
    if (!this.flags.firstIsolation) { this.flags.firstIsolation = true; this.log('care', `First case detected: Person #${a.id} goes to the isolation centre`); }
    if (a.mode === 'inside') a.travelTo(this.isolation, this, 'In the isolation centre');
    else if (a.mode === 'walk' || a.mode === 'drive' || a.mode === 'wait' || a.mode === 'bus') a.pendingIsolation = true;
  }
  resolve(a) {
    const p = this.params;
    this.finishedInfections.push({ tick: this.tick, secondary: a.secondary });
    if (a.timesInfected === 1) a.firstSecondary = a.secondary;
    let pDeath = 0;
    if (a.severe) {
      // waiting at home without care raises the risk: up to 2.5 times after 1.5 days without a bed
      const noCare = a.away ? 0 : a.hospitalized ? Math.min(1, (a.untreated || 0) / (1.5 * TICKS_PER_DAY)) : 1;
      pDeath = (p.mortality / 100) * a.age.deathMult * (1 + 1.5 * noCare) * (a.vaccinated ? 0.5 : 1);
      pDeath = Math.min(0.9, pDeath);
    }
    const wasBed = a.hospitalized || a.mode === 'ambulance' || a.mode === 'heli', wasIso = a.isolated, inAmb = a.mode === 'ambulance';
    if (a.parkedAt) { a.parkedAt.parked--; a.parkedAt = null; a.household.carInUse = false; }
    a.isolated = false;
    if (!a.injured) a.needsAmbulance = false;
    if (a.ambulance && a.mode !== 'ambulance' && !a.injured) { a.ambulance.patient = null; a.ambulance = null; }
    a.symptomatic = false;
    if (this.rng.chance(pDeath)) {
      if (a.hospitalized) this.freeBed(a);
      a.injured = false; a.needsAmbulance = false;
      a.state = 'D'; a.deathCause = 'disease'; a.diedAtTick = this.tick; a.diedWhere = a.away ? 'abroad' : wasBed ? 'hospital' : (a.place && a.place.type === 'home' ? 'home' : 'elsewhere');
      a.activity = a.away ? 'Died away from the city' : wasBed ? 'Died in hospital' : 'Died at home';
      a.plan = []; if (!inAmb && !a.away) a.mode = 'dead';
      this.scheduleFuneral(a);
      for (const m of a.household.members) if (m !== a && m.alive) m.stress = Math.min(1, m.stress + 0.3);
      if (!this.flags.firstDeath) { this.flags.firstDeath = true; this.log('death', `First death: Person #${a.id} (${a.age.key}) ${wasBed ? 'in hospital' : 'at home, without a hospital bed'}`); }
    } else {
      a.state = 'R'; a.stateTicks = 0; a.severe = false;
      a.stateDuration = Math.round(Math.max(10, this.rng.normal(p.immunityDays, p.immunityDays * 0.2)) * TICKS_PER_DAY);
      if (a.injured) return;                                     // still being treated for injuries
      if (a.hospitalized) this.freeBed(a);
      if ((wasBed || wasIso) && !inAmb && !a.away) { a.mode = 'inside'; a.travelTo(a.home, this, 'At home'); }
    }
  }
  loseImmunity(a) {
    a.state = 'S'; a.stateTicks = 0;
    if (!this.flags.waning) { this.flags.waning = true; this.log('spread', `Person #${a.id} lost immunity and can be infected again`); }
  }

  /* ----- road safety: collisions at junctions, people hit by cars, crashes ----- */
  roadSafety() {
    const p = this.params, rng = this.rng, cars = this._cars, walkers = this._walk;
    cars.length = 0; walkers.length = 0;
    for (const a of this.agents) {
      if (a.mode === 'drive' && a.crashWait <= 0) cars.push(a);
      else if (a.mode === 'walk') walkers.push(a);
    }
    this.carsMoving = cars.length;
    if (!cars.length) return;
    const env = this.roadEnv, danger = (p.roadDanger / 100) * this.speedFactor * this.speedFactor;
    if (danger <= 0) return;
    // 1. two cars from crossing roads inside the same junction
    const stamp = this._jStamp || (this._jStamp = new Int32Array(this.junctions.length).fill(-1));
    const jh = this._jH || (this._jH = new Int32Array(this.junctions.length)), jv = this._jV || (this._jV = new Int32Array(this.junctions.length));
    const tk = this.tick, hits = this._hits || (this._hits = []);
    hits.length = 0;
    for (let ci = 0; ci < cars.length; ci++) {
      const a = cars[ci];
      for (let s = 0; s <= 2; s++) {
        const x = a.px + ((a.x - a.px) * s) / 2, y = a.py + ((a.y - a.py) * s) / 2;
        const xi = Math.round(x / 100) - 1, yi = Math.round(y / 100) - 1;
        if (xi < 0 || xi > 8 || yi < 0 || yi > 4) continue;
        const X = ROAD_X[xi], Y = ROAD_Y[yi];
        if (Math.abs(x - X) > roadHalf(X === MAIN_X) + 1 || Math.abs(y - Y) > roadHalf(Y === MAIN_Y) + 1) continue;
        const j = xi * 5 + yi;
        if (stamp[j] !== tk) { stamp[j] = tk; jh[j] = -1; jv[j] = -1; }
        if (Math.abs(Math.cos(a.heading)) > 0.7) { if (jh[j] < 0) { jh[j] = ci; if (jv[j] >= 0) hits.push(j); } }
        else if (jv[j] < 0) { jv[j] = ci; if (jh[j] >= 0) hits.push(j); }
        break;
      }
    }
    for (const j of hits) {
      const J = this.junctions[j];
      const pc = Math.min(0.9, 0.008 * env * danger * (this.policeOnDuty(J) ? 0.4 : 1) * (this.signalsOn ? 1 : 2.5));
      if (rng.chance(pc)) this.crash([cars[jh[j]], cars[jv[j]]], 'collision', J.X, J.Y);
    }
    // 2. one car skids, hits a pole or another car from behind
    const bg = 1.1e-5 * env * danger;
    for (const a of cars) if (a.mode === 'drive' && rng.chance(bg * (1 + a.stress))) this.crash([a], 'single', a.x, a.y);
    // 3. people crossing the road
    for (const w of walkers) {
      let on = false;
      const xi = Math.round(w.x / 100) - 1, yi = Math.round(w.y / 100) - 1;
      if (xi >= 0 && xi <= 8 && w.y < CITY_H && Math.abs(w.x - ROAD_X[xi]) < roadHalf(ROAD_X[xi] === MAIN_X) - 0.4) on = true;
      if (yi >= 0 && yi <= 4 && w.x < AIRPORT_ROAD_END && Math.abs(w.y - ROAD_Y[yi]) < roadHalf(ROAD_Y[yi] === MAIN_Y) - 0.4) on = true;
      if (!on) continue;
      for (const c of cars) {
        if (c.mode !== 'drive' || Math.abs(c.x - w.x) > 7 || Math.abs(c.y - w.y) > 7) continue;
        if (rng.chance(Math.min(0.9, 0.0005 * env * danger))) { this.crash([w], 'pedestrian', w.x, w.y, c); break; }
      }
    }
  }
  crash(list, kind, x, y, car) {
    const p = this.params, rng = this.rng, sf = this.speedFactor;
    this.stats.accidents++;
    if (kind === 'collision') this.stats.collisions++;
    if (kind === 'pedestrian') this.stats.pedestrians++;
    const day = this.accDaily[this.accDaily.length - 1];
    if (day) day.city++;
    let inj = 0, dead = 0;
    const names = [];
    for (const a of list) {
      const ped = a.mode === 'walk';
      a.accidents++;
      if (!ped) a.crashWait = 25;
      const belt = !ped && a.uBelt < p.seatbelts / 100;
      const old = a.age.key === 'elder' ? 1.8 : a.age.key === 'child' ? 1.2 : 1;
      const pDeath = Math.min(0.6, (ped ? 0.09 : 0.03) * sf * sf * (belt ? 0.45 : 1) * old);
      const pInj = Math.min(0.9, (ped ? 0.7 : 0.35) * sf * (belt ? 0.55 : 1));
      const r = rng.next();
      if (!ped && (r < pDeath + pInj)) this.wrecks.push({ x: a.x, y: a.y, heading: a.heading, color: a.household.id, taxi: a.taxi, until: this.tick + 240 });
      if (r < pDeath) { this.killRoad(a); dead++; names.push(`#${a.id}`); }
      else if (r < pDeath + pInj) { this.injure(a, ped ? rng.range(4, 12) : rng.range(2, 8)); inj++; names.push(`#${a.id}`); }
      else if (!ped) { a.stress = Math.min(1, a.stress + 0.15); }
    }
    if (car) { car.crashWait = 12; car.stress = Math.min(1, car.stress + 0.2); }
    const weather = this.fog > 0.45 ? ' in fog' : this.rain > 0.3 ? ' in the rain' : this.night ? ' at night' : '';
    const what = kind === 'collision' ? `Two cars collided at a junction${weather}` : kind === 'pedestrian' ? `A car hit Person #${list[0].id} crossing the road${weather}` : `Car crash${weather}`;
    const out = dead ? `${dead} killed${inj ? `, ${inj} injured` : ''}` : inj ? `${inj} injured (${names.join(', ')})` : 'no one hurt';
    this.log('road', `${what}: ${out}`);
    this.lastCrash = { x, y, tick: this.tick, kind };
  }
  injure(a, days) {
    this.stats.injured++;
    a.injured = true; a.injuryDays = days; a.injuryEnds = this.tick + Math.round(days * TICKS_PER_DAY); a.injuredAt = this.tick;
    if (a.driving) { this.wreckCar(a); }
    a.driving = false; a.taxi = false; a.smoking = false;
    a.mode = 'injured'; a.ctx = -1; a.place = null; a.path = null; a.dest = null; a.queueKey = -1; a.queueJ = null;
    a.pickup = roadAccess(a.x, a.y);
    a.stress = Math.min(1, a.stress + 0.3);
    for (const m of a.household.members) if (m !== a && m.alive) m.stress = Math.min(1, m.stress + 0.15);
    a.ambCalled = false;
    this.requestAmbulance(a);
  }
  wreckCar(a) {
    const h = a.household;
    h.carInUse = true; h.carWreckUntil = this.tick + 3 * TICKS_PER_DAY;
    if (a.parkedAt) { a.parkedAt.parked--; a.parkedAt = null; }
  }
  killRoad(a) {
    this.stats.roadDeaths++;
    if (a.driving) this.wreckCar(a);
    if (a.state === 'E' || a.state === 'I') { this.finishedInfections.push({ tick: this.tick, secondary: a.secondary }); if (a.timesInfected === 1) a.firstSecondary = a.secondary; }
    if (a.hospitalized) this.freeBed(a);
    a.state = 'D'; a.deathCause = 'road'; a.diedAtTick = this.tick; a.diedWhere = 'road'; a.mode = 'dead';
    a.activity = 'Died in a road accident'; a.plan = []; a.needsAmbulance = false; a.injured = false; a.isolated = false;
    a.driving = false; a.taxi = false; a.path = null; a.queueKey = -1; a.queueJ = null; a.ctx = -1;
    for (const m of a.household.members) if (m !== a && m.alive) m.stress = Math.min(1, m.stress + 0.35);
    this.scheduleFuneral(a);
    if (!this.flags.firstRoadDeath) { this.flags.firstRoadDeath = true; }
  }
  /* injuries heal, people who waited too long may die, travellers come back */
  checkCare() {
    const t = this.tick;
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.injured && a.hospitalized && t >= a.injuryEnds) {
        a.injured = false;
        if (a.state === 'I' && a.severe) { a.activity = `In hospital, bed ${a.bed + 1}`; continue; }
        this.freeBed(a);
        a.mode = 'inside'; a.travelTo(a.home, this, 'At home');
        a.activity = 'Going home from hospital';
      } else if (a.injured && a.mode === 'injured' && !a.ambulance && t - a.injuredAt > 120 && t % 60 === 0 && this.rng.chance(0.03)) {
        this.killRoad(a);
        this.log('death', `Person #${a.id} died of injuries while waiting for an ambulance`);
      } else if (a.away && a.returnTick && t >= a.returnTick) {
        this.comeHome(a, a.awayReason === 'transfer' ? 'Back home from the other hospital' : 'Back home from a trip');
      }
    }
    if (this.visitors.length) {
      for (const v of this.visitors) if (t >= v.until && this.hospital.bedSlots[v.bed].patient === v) this.hospital.bedSlots[v.bed].patient = null;
      this.visitors = this.visitors.filter((v) => this.hospital.bedSlots[v.bed].patient === v);
    }
    this.wrecks = this.wrecks.filter((w) => w.until > t);
  }
  comeHome(a, label) {
    a.away = false; a.awayReason = null; a.returnTick = 0; a.trip = null; a.injured = false;
    a.mode = 'inside'; a.place = a.home; a.ctx = a.home.id;
    const q = this.randomPointIn(a.home.area); a.x = q.x; a.y = q.y; a.tx = q.x; a.ty = q.y;
    a.activity = label;
  }

  /* ----- helicopter: air ambulance for the motorway (and the city when every ambulance is busy) ----- */
  canFly() { return this.fog < 0.45 && this.rain < 0.75; }
  updateHeli() {
    const h = this.heli;
    switch (h.state) {
      case 'idle': {
        if (h.wait > 0) { h.wait--; break; }
        if (!this.canFly()) break;
        const inc = this.incidents.find((i) => i.waiting > 0 && !i.heli && !i.amb);
        if (inc) { h.target = { x: inc.x, y: inc.y + (inc.dir > 0 ? -14 : 14), inc }; h.state = 'takeoff'; inc.heli = true; this.stats.heliTrips++; break; }
        const a = this.ambQueue.find((q) => q.injured && !q.ambulance && q.mode === 'injured' && this.tick - q.waitSince > 6);
        if (a && !this.ambulances.some((m) => m.state === 'idle')) { h.target = { x: a.x, y: a.y, agent: a }; a.ambulance = h; h.state = 'takeoff'; this.stats.heliTrips++; }
        break;
      }
      case 'takeoff': h.alt = Math.min(1, h.alt + 0.2); if (h.alt >= 1) h.state = 'toSite'; break;
      case 'toSite': if (h.flyTo(h.target.x, h.target.y)) h.state = 'landing'; break;
      case 'landing': h.alt = Math.max(0, h.alt - 0.2); if (h.alt <= 0) { h.state = 'onSite'; h.wait = 16; } break;
      case 'onSite':
        if (--h.wait <= 0) {
          const T = h.target;
          if (T.inc) { h.load = Math.min(2, T.inc.waiting); T.inc.waiting -= h.load; T.inc.heli = false; }
          else if (T.agent && T.agent.alive && T.agent.injured) { const a = T.agent; h.patient = a; a.mode = 'heli'; a.ctx = -2; a.needsAmbulance = false; a.activity = 'In the air ambulance'; }
          else if (T.agent) T.agent.ambulance = null;
          h.state = 'liftoff';
        }
        break;
      case 'liftoff': h.alt = Math.min(1, h.alt + 0.2); if (h.alt >= 1) h.state = 'toPad'; break;
      case 'toPad':
        if (h.patient) { h.patient.x = h.x; h.patient.y = h.y; }
        if (h.flyTo(h.pad.x, h.pad.y)) h.state = 'landPad';
        break;
      case 'landPad':
        h.alt = Math.max(0, h.alt - 0.2);
        if (h.alt <= 0) {
          if (h.load) { this.admitVisitors(h.load, 'heli'); h.load = 0; }
          if (h.patient) { const a = h.patient; h.patient = null; a.ambulance = null; if (a.alive) this.admit(a); }
          h.state = 'idle'; h.wait = 10; h.target = null; h.heading = -Math.PI / 2;
        }
        break;
    }
  }

  /* ----- motorway through traffic: car following, fog, crashes and pile-ups ----- */
  spawnVehicle(dir) {
    const rng = this.rng;
    const r = rng.next(), kind = r < 0.62 ? 'car' : r < 0.78 ? 'bus' : 'truck';
    const lane = kind === 'truck' ? 2 : kind === 'bus' ? rng.int(1, 2) : rng.int(0, 2);
    const x0 = dir > 0 ? -30 : WORLD_W + 30;
    for (const o of this.vehicles) if (o.dir === dir && o.lane === lane && Math.abs(o.x - x0) < 45) return;
    this.vehicles.push(new Vehicle(++this.vehSeq, dir, lane, kind, rng));
  }
  updateMotorway() {
    const p = this.params, rng = this.rng, V = this.vehicles;
    const closed = p.motorwayFogClose && this.fog > 0.55;
    if (closed !== this.mwClosed) {
      this.mwClosed = closed;
      this.log('road', closed ? 'Motorway closed by the motorway police: thick fog' : 'Motorway open again');
    }
    if (!closed) {
      const rate = ((p.motorwayTraffic / 60) * (this.night ? 0.45 : 1)) / 2;
      if (rng.chance(rate)) this.spawnVehicle(1);
      if (rng.chance(rate)) this.spawnVehicle(-1);
    }
    const vis = 25 + 375 * Math.pow(1 - this.fog, 2);
    this.visibility = vis;
    const wx = (1 - 0.35 * this.fog) * (1 - 0.15 * this.rain);
    const danger = (p.roadDanger / 100) * (this.roadEnv);
    V.sort((a, b) => b.dir * b.x - a.dir * a.x);
    for (const v of V) {
      if (v.crashed) continue;
      let lead = null, gap = 1e9;
      for (const o of V) {
        if (o === v || o.dir !== v.dir || o.lane !== v.lane) continue;
        const g = v.dir * (o.x - v.x) - (o.len + v.len) / 2;
        if (g > -v.len && g < gap) { gap = g; lead = o; }
      }
      let vd = v.vd * wx * (closed ? 0.6 : 1);
      // hazard warnings: police and other drivers slow the traffic behind a crash
      for (const inc of this.incidents) if (inc.dir === v.dir && this.tick - inc.t0 > 12 && this.tick - inc.t0 < 300) { const d = v.dir * (inc.x - v.x); if (d > 0 && d < 700) { vd = Math.min(vd, 12); v.warned = true; } }
      let target = vd;
      const sees = lead && gap < vis;
      // a driver needs a moment to react to something that suddenly appears in the fog
      if (sees && v.alert) target = Math.min(vd, Math.sqrt(16 * Math.max(0, gap - 6)));
      v.alert = !!sees;
      if (sees && gap < 80 && (lead.crashed || lead.v < v.v - 1) && v.y === v.ty) {
        for (const L of [v.lane - 1, v.lane + 1]) {
          if (L < 0 || L > 2 || (v.kind === 'truck' && L === 0)) continue;
          if (V.some((o) => o !== v && o.dir === v.dir && o.lane === L && Math.abs(o.x - v.x) < 32)) continue;
          v.lane = L; v.ty = laneY(v.dir, L); target = vd; break;
        }
      }
      v.brake = target < v.v - 0.5;
      v.v = target < v.v ? Math.max(target, v.v - 11) : Math.min(target, v.v + 4);
      if (rng.chance(3.5e-6 * danger * (v.kind === 'truck' ? 1.5 : 1))) { this.mwCrash([v], v.v, false); continue; }
      const nx = v.x + v.dir * v.v;
      if (lead && lead.lane === v.lane) {
        const ng = v.dir * (lead.x - nx) - (lead.len + v.len) / 2;
        if (ng < 0) {
          const impact = v.v - (lead.crashed ? 0 : lead.v);
          v.x = lead.x - v.dir * ((lead.len + v.len) / 2 + 0.4);
          if (impact > 3) { this.mwCrash(lead.crashed ? [v] : [v, lead], impact, true); continue; }
          v.v = lead.crashed ? 0 : lead.v;
          continue;
        }
      }
      v.x = nx;
      if (v.y !== v.ty) v.y += Math.sign(v.ty - v.y) * Math.min(1.8, Math.abs(v.ty - v.y));
    }
    this.vehicles = V.filter((v) => (v.crashed ? this.tick - v.crashT < 240 : v.x > -60 && v.x < WORLD_W + 60));
    this.incidents = this.incidents.filter((i) => {
      if (i.waiting > 0 && this.tick - i.t0 > 360) { this.stats.transfers += i.waiting; i.waiting = 0; }
      return this.tick - i.t0 < 420 || i.waiting > 0;
    });
  }
  mwCrash(vs, impact, rearEnd) {
    const rng = this.rng, f = Math.max(0.25, Math.min(1.6, impact / 28));
    let inj = 0, killed = 0, n = 0;
    for (const v of vs) {
      if (v.crashed) continue;
      v.crashed = true; v.v = 0; v.crashT = this.tick; n++;
      const occ = v.kind === 'car' ? rng.int(1, 4) : v.kind === 'bus' ? rng.int(12, 30) : rng.int(1, 2);
      const pi = (v.kind === 'bus' ? 0.12 : 0.32) * f, pk = (v.kind === 'bus' ? 0.012 : 0.05) * f * f;
      for (let i = 0; i < occ; i++) { const r = rng.next(); if (r < pk) killed++; else if (r < pk + pi) inj++; }
    }
    if (!n) return;
    const x = Math.max(20, Math.min(WORLD_W - 20, vs[0].x)), dir = vs[0].dir;
    this.stats.mwCrashes += n; this.stats.mwInjured += inj; this.stats.mwKilled += killed;
    const day = this.accDaily[this.accDaily.length - 1];
    if (day) day.mw++;
    let inc = this.incidents.find((i) => i.dir === dir && Math.abs(i.x - x) < 150 && this.tick - i.t0 < 90);
    if (inc) {
      inc.vehicles += n; inc.injured += inj; inc.killed += killed; inc.waiting += inj;
      if (inc.vehicles >= 4 && !inc.pileLogged) { inc.pileLogged = true; this.log('road', `Pile-up on the motorway${this.fog > 0.45 ? ' in fog' : ''}: ${inc.vehicles} vehicles, ${inc.injured} injured, ${inc.killed} killed`); }
    } else {
      inc = { id: ++this.incSeq, x, y: MW_Y, dir, t0: this.tick, vehicles: n, injured: inj, killed, waiting: inj, heli: false, amb: null };
      this.incidents.push(inc);
      const why = this.fog > 0.45 ? ' in fog' : this.rain > 0.3 ? ' in the rain' : this.night ? ' at night' : '';
      this.log('road', `Motorway crash${why}: ${n} vehicle${n > 1 ? 's' : ''}${inj ? `, ${inj} injured` : ''}${killed ? `, ${killed} killed` : ''}${inj ? '. Rescue 1122 called' : ''}`);
    }
  }

  /* ----- airport: arrivals bring travellers home (some with the infection), departures take them away ----- */
  updateFlights() {
    const p = this.params, t = this.tick, rng = this.rng;
    for (const f of this.flights) {
      if (t === f.tA) { this.stats.landed++; if (!this.flags.firstFlight) { this.flags.firstFlight = true; this.log('flight', `Flight ${f.code} from ${f.from} landed at the airport`); } }
      if (t === f.tA + FL.ROLL + FL.TIN) {
        for (const a of f.arrivals) {
          if (!a.alive || !a.away) continue;
          a.away = false; a.awayReason = null; a.trip = null;
          a.mode = 'inside'; a.place = this.airport; a.ctx = this.airport.id;
          const q = this.pointFor(this.airport); a.x = q.x; a.y = q.y; a.tx = q.x; a.ty = q.y;
          a.plan = [{ t: (this.minuteNow + rng.int(10, 25)) % TICKS_PER_DAY, place: a.home, label: 'At home', stay: 0, taxi: true }];
          if (a.plan[0].t < this.minuteNow) a.plan[0].t = this.minuteNow;
          a.planIdx = 0; a.stayUntil = 0;
          a.activity = `Arrived on flight ${f.code} from ${f.from}`;
          if (a.state === 'S' && !a.protectedBy(p) && rng.chance(p.importRisk / 100)) {
            this.infect(a, null, false, 'abroad');
            a.stateTicks = Math.round(a.stateDuration * rng.range(0.2, 0.8));
            this.stats.imported++;
            this.log('flight', `Flight ${f.code} from ${f.from} landed. Person #${a.id} brought the infection home (imported case)`);
          }
        }
      }
      if (t === f.tD - FL.TOUT - FL.PUSH) {
        let n = 0;
        for (const a of this.agents) {
          if (!a.trip || !a.trip.leaving || a.trip.flight !== f) continue;
          if (a.place === this.airport && a.mode === 'inside' && a.alive && !a.busy) {
            a.away = true; a.awayReason = 'trip'; a.mode = 'away'; a.ctx = -3; a.place = null; a.plan = []; a.trip.leaving = false;
            a.activity = `Travelling: in ${f.from}`; n++;
            if (a.parkedAt) { a.parkedAt.parked--; a.parkedAt = null; a.household.carInUse = false; }
          } else if (a.trip.leaving && a.alive) {
            a.trip = null;
            if (!a.busy) { a.plan = [{ t: this.minuteNow, place: a.home, label: 'Missed the flight, going home', stay: 0, taxi: true }]; a.planIdx = 0; a.stayUntil = 0; }
          }
        }
        this.stats.departed += n;
      }
    }
  }

  /* ----- one tick (= 1 minute) ----- */
  step() {
    const p = this.params;
    this.tick++;
    this.minuteNow = this.minute;
    if (this.minuteNow === 0) this.newDay(false);
    this.updateEnvironment();
    const agents = this.agents, N = agents.length;

    // 1. people follow their plans: walk, drive, stay inside
    for (let i = 0; i < N; i++) {
      const a = agents[i];
      if (a.state === 'D' || a.override === 'disabled') continue;
      a.act(this);
      if (a.pendingIsolation && a.mode === 'inside') { a.pendingIsolation = false; a.travelTo(this.isolation, this, 'In the isolation centre'); }
    }
    // 2. traffic: accidents, ambulances, helicopter, motorway, aircraft
    this.roadSafety();
    this.updateAmbulances();
    this.updateHeli();
    this.updateMotorway();
    this.updateFlights();
    this.updateBuses();
    this.updateLife();
    this.updateRigs();

    // 3. contacts: infectious people may infect susceptible people in the same place
    // contacts are checked every 5 minutes with 5x the per-minute chance (same result, much faster)
    const cand = this._cand, inf = this._inf;
    let nc = 0, ni = 0;
    for (let i = 0; this.tick % CONTACT_EVERY === 0 && i < N; i++) {
      const a = agents[i], st = a.state;
      if (st === 'S') { if (a.ctx >= -1 && !(a.place && a.place.type === 'home')) cand[nc++] = a; }
      else if (st === 'I' && a.ctx >= -1 && !a.isolated) inf[ni++] = a;
    }
    if (ni > 0) this.grid.build(cand, nc);
    const r = p.infectionRadius, r2 = r * r, beta = (p.transmissionRate / 100 / TICKS_PER_HOUR) * CONTACT_EVERY;
    for (let k = 0; k < ni; k++) {
      const a = inf[k];
      const type = a.place ? a.place.type : 'street';
      let base = beta * PLACE_RISK[type];
      if (a.mode === 'bed') base *= 0.25;
      if (base <= 0) continue;
      if (type === 'home') {
        // dirty water and rubbish next door make infection at home easier
        const bin = a.place.block.bin, hm = 1 + (p.hygieneEffect / 100) * this.wa.stress + (bin ? (p.sanitationEffect / 100) * Math.min(1, bin.over / p.binCapacity) : 0);
        for (const b of a.household.members) {
          if (b === a || b.state !== 'S' || b.ctx !== a.ctx || b.protectedBy(p)) continue;
          if (this.rng.chance(base * hm * b.susc)) this.infect(b, a, false, 'home');
        }
        continue;
      }
      const src = a.mask ? 0.5 : 1;
      const near = this.grid.near(a.x, a.y, r, this._near);
      for (let i = 0; i < near.length; i++) {
        const b = near[i];
        if (b.state !== 'S' || b.ctx !== a.ctx) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > r2 || b.protectedBy(p)) continue;
        if (this.rng.chance(base * src * (b.mask ? 0.7 : 1) * b.susc)) this.infect(b, a, false, type);
      }
    }

    if (this.tick % CONTACT_EVERY === 0) this.busContacts();

    // 4. disease progression
    const wanes = p.immunityWanes;
    for (let i = 0; i < N; i++) { const a = agents[i], st = a.state; if (st === 'E' || st === 'I' || (st === 'R' && wanes)) a.progress(this); else if (st === 'R') a.stateTicks++; }

    // 5. air, care and statistics
    if (this.tick % 10 === 0) { this.updateSystems(); this.updatePollution(false); this.checkCare(); }
    this.updateServices();
    if (this.tick % TICKS_PER_HOUR === 0) { this.hourly(); if (this.eco) this.ecoHourly(); }
  }

  hourly() {
    const p = this.params, rng = this.rng;
    // wind turns slowly
    this.windAng += rng.normal(0, 0.22) + (-2.36 - this.windAng) * 0.08;
    this.windSpd = Math.max(0.3, Math.min(3.2, 1.4 + rng.normal(0, 0.45))) * (1 - 0.7 * this.fog) * (p.weather === 'smog' ? 0.5 : 1) + 1.6 * this.rain;
    // stress, air exposure and how easily each person catches the disease
    const m = this.minuteNow, evening = m >= 1080 || m < 420;
    let sSum = 0, sN = 0;
    for (const a of this.agents) {
      if (!a.alive || a.away) continue;
      // stress moves towards a level set by where the person is and what is happening
      let target = 0.3;
      if (a.mode === 'drive') target = 0.55 + Math.min(0.35, a.waited * 0.012);
      else if (a.mode === 'walk') target = a.bike ? 0.2 : 0.35;
      else if (a.mode === 'bus') target = 0.5;
      else if (a.mode === 'wait') target = 0.42;
      else if (a.mode === 'bed') target = 0.7;
      else if (a.mode === 'injured' || a.mode === 'ambulance' || a.mode === 'heli') target = 0.95;
      else if (a.place) {
        switch (a.place.type) {
          case 'home': target = evening ? 0.18 : 0.26; break;
          case 'park': target = 0.08; break;
          case 'gym': target = 0.04; break;
          case 'mosque': case 'wedding': target = 0.12; break;
          case 'graveyard': target = 0.85; break;
          case 'mart': case 'mandi': target = 0.4; break;
          case 'fire': target = 0.6; break;
          case 'nadra': case 'passport': target = 0.78; break;
          case 'isolation': target = 0.72; break;
          case 'market': target = 0.35; break;
          case 'factory': case 'police': case 'hospital': target = 0.66; break;
          case 'school': target = a.age.key === 'child' ? 0.32 : 0.55; break;
          default: target = 0.52;
        }
      }
      a.waited = 0;
      if (a.distancing) target += 0.12;
      if (this.overloaded) target += 0.1;
      if (this.aqi > 200) target += 0.08;
      if (this.tempC > 38 && a.mode !== 'inside') target += 0.08;
      if (a.place && a.place.type === 'home') target += (a.place.pw < 0.5 ? 0.1 + (this.tempC > 32 ? 0.05 : 0) : 0) + 0.12 * this.wa.stress;
      if (a.smoking) target -= 0.1;
      a.stress = Math.max(0, Math.min(1, a.stress + (target - a.stress) * 0.09));
      const c = this.pm25At(a.x, a.y) * (this.eco ? this.indoorFactor(a) : (a.mode === 'inside' || a.mode === 'bed' ? 0.65 : 1));
      a.exposure += (c / 150 - a.exposure) / 72;
      a.susc = (1 + (p.stressEffect / 100) * a.stress) * (a.smoker ? SMOKE_SUSC : 1);
      if (a.age.key !== 'child') { sSum += a.stress; sN++; }
    }
    this.stressAvg = sN ? sSum / sN : 0;
    const c = this.counts();
    if (c.I > this.peakI) { this.peakI = c.I; this.peakTick = this.tick; this.flags.peakLogged = false; }
    if (!this.flags.peakLogged && this.peakI >= Math.max(10, 0.05 * p.population) && c.I < this.peakI * 0.8) {
      this.flags.peakLogged = true;
      this.log('peak', `Peak passed: ${this.peakI} people infectious on day ${(this.peakTick / TICKS_PER_DAY).toFixed(1)}`);
    }
    for (const pct of [10, 25, 50]) {
      if (!this.flags['m' + pct] && c.I + c.E >= (pct / 100) * p.population) {
        this.flags['m' + pct] = true;
        this.log('alert', `${pct}% of the population is now infected (exposed or infectious)`);
      }
    }
    this.recentInfections = this.recentInfections.filter((e) => this.tick - e.tick < 360);
    this.record(c);
    if (!this.outbreakOver && c.E === 0 && c.I === 0) {
      this.outbreakOver = true;
      this.log('end', `Outbreak over after ${this.day.toFixed(1)} days: ${this.everInfected} infections, ${c.D} deaths from the disease, ${c.X} road deaths`);
      if (this.params.neverEnds) { this.emit('outbreakOver'); } else { this.finished = true; this.emit('finished'); }
    } else if (this.outbreakOver && (c.E > 0 || c.I > 0)) { this.outbreakOver = false; }
  }

  counts() {
    const c = { S: 0, E: 0, I: 0, R: 0, D: 0, X: 0, N: 0, V: 0, H: 0, isolated: 0, waiting: 0, home: 0, out: 0, cars: 0, away: 0, injured: 0, smoking: 0, gym: 0, bus: 0, bikes: 0 };
    for (const a of this.agents) {
      if (a.state === 'D') { if (a.deathCause === 'road' || a.deathCause === 'fire') c.X++; else if (a.deathCause === 'natural') c.N++; else c.D++; continue; }
      c[a.state]++;
      if (a.state === 'S' && a.vaccinated) c.V++;
      if (a.isolated) c.isolated++;
      if (a.needsAmbulance) c.waiting++;
      if (a.injured) c.injured++;
      if (a.away) { c.away++; continue; }
      if (a.place && a.place.type === 'home') c.home++; else c.out++;
      if (a.mode === 'drive') c.cars++;
      if (a.mode === 'bus') c.bus++;
      if (a.bike) c.bikes++;
      if (a.smoking) c.smoking++;
      if (a.place && a.place.type === 'gym') c.gym++;
    }
    c.H = this.bedsUsed();
    return c;
  }
  record(c) {
    c = c || this.counts();
    const h = this.history;
    h.t.push(this.day);
    h.S.push(c.S - c.V); h.V.push(c.V); h.E.push(c.E); h.I.push(c.I); h.R.push(c.R); h.D.push(c.D); h.H.push(c.H); h.X.push(c.X);
    h.AQI.push(Math.round(this.aqi)); h.ST.push(Math.round((this.stressAvg || 0) * 100)); h.ACC.push(this.stats.accidents); h.MWA.push(this.stats.mwCrashes);
    h.KW.push(Math.round(this.en.demand)); h.SOLAR.push(Math.round(this.en.solar)); h.SOC.push(Math.round((100 * this.en.bat) / Math.max(1, this.params.batteryKwh)));
this.updateCommonIllness(); this.updateFuel(); this.aiHour(); h.KILN.push(this.kilnsOn()); h.FUEL.push(Math.round((this.fuel.litresHour || 0) * 10) / 10); h.SICK.push(this.common.flu + this.common.cough + this.common.fever + this.common.sore); h.MED.push(Math.round(100 * this.pharmacy.stock / Math.max(1, this.params.medicineStock))); h.SKY.push((this.skyStat && this.skyStat.occ) || 0); h.AMU.push((this.amuse && this.amuse.now) || 0); h.WIFI.push(this.wifi.devices ? Math.round((100 * this.wifi.connected) / this.wifi.devices) : 100);
    h.TANK.push(Math.round((100 * this.wa.tank) / Math.max(1, this.params.tankCapacity))); h.BIN.push(Math.round((100 * this.bins.reduce((x, b) => x + Math.min(1.5, b.kg / this.params.binCapacity), 0)) / this.bins.length));
    h.DASH.push(this.dash.aqi == null ? null : Math.round(this.dash.aqi)); h.TEMP.push(Math.round(this.tempC * 10) / 10); h.SVC.push(this.svc.open.length); h.FLD.push(Math.round(this.flood * 100)); h.BUS.push(this.buses.length);
  }
  rt() {
    const since = this.tick - 7 * TICKS_PER_DAY;
    let n = 0, sum = 0;
    for (let i = this.finishedInfections.length - 1; i >= 0; i--) {
      const f = this.finishedInfections[i];
      if (f.tick < since) break;
      n++; sum += f.secondary;
    }
    return n >= 5 ? sum / n : null;
  }
  r0() {
    const first = this.infectionOrder.slice(0, 30);
    if (first.length < 5 || (first.length < 30 && !this.finished)) return null;
    let sum = 0;
    for (const id of first) {
      const a = this.agents[id];
      if ((a.state === 'E' || a.state === 'I') && a.timesInfected === 1) return null;
      sum += a.firstSecondary != null ? a.firstSecondary : a.secondary;
    }
    return sum / first.length;
  }
  agentAt(x, y, radius) {
    let best = null, bd = radius * radius;
    for (const a of this.agents) {
      if (a.mode === 'ambulance' || a.mode === 'heli' || a.away || a.buried || (a.state === 'D' && (a.diedWhere === 'hospital' || a.diedWhere === 'abroad' || (a.diedWhere === 'road' && this.tick - a.diedAtTick > 360)))) continue;
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  /* ======================= v5: public transport ======================= */
  /* choose a bus trip if both ends are near the same route; returns null when walking (or cycling) is better */
  planBus(a, from, place, dist) {
    const p = this.params;
    if (p.busesPerHour <= 0 || dist < 260 || a.uBus > Math.min(0.97, (p.busShare / 100) * (1 + this.rain) * clamp01fare(p.busFare))) return null;
    const f = from.access.walk, q = place.access.walk;
    let best = null;
    for (const R of BUS_ROUTES) for (const sA of R.stopList) {
      const rA = sA.faces[1].road, wA = Math.abs(f.x - rA.x) + Math.abs(f.y - rA.y);
      if (wA > dist * 0.5) continue;
      for (const sB of R.stopList) {
        if (sA === sB) continue;
        const rB = sB.faces[1].road, wB = Math.abs(q.x - rB.x) + Math.abs(q.y - rB.y), walk = wA + wB, ride = Math.abs(sB.pos - sA.pos);
        if (walk > dist * 0.55 || ride < 150) continue;
        if (!best || walk < best.walk) best = { route: R, stopA: sA, stopB: sB, dir: sB.pos > sA.pos ? 1 : -1, walk };
      }
    }
    return best;
  }
  joinStop(a) {
    const bp = a.busPlan, face = bp.stopA.faces[bp.dir];
    a.mode = 'wait'; a.ctx = -1; a.place = null; a.path = null; a.waitUntil = this.tick + 55;
    a.activity = `Waiting for the bus at ${bp.stopA.name}`;
    this.bq(face).push(a);
  }
  busStop(b, stop) {
    const face = stop.faces[b.dir], cap = this.params.busCapacity;
    let n = 0;
    const keep = [];
    for (const a of b.riders) {
      if (a.mode !== 'bus' || !a.alive) continue;
      if (a.busPlan && a.busPlan.stopB === stop) { a.leaveStop(this, face); n++; } else keep.push(a);
    }
    b.riders = keep;
    const q = this.bq(face);
    while (q.length && b.riders.length < cap) {
      const a = q.shift();
      if (a.mode !== 'wait' || !a.alive) continue;
      a.mode = 'bus'; a.ctx = -10 - b.id; a.bus = b; a.x = b.x; a.y = b.y;
      a.activity = `On the bus to ${this.placeLabel(a.busPlan.place)}`;
      b.riders.push(a); n++; this.stats.busRides++;
    }
    b.dwell = 3 + Math.ceil(n / 4);
  }
  /* bus-stop queues belong to one World (the stops themselves are shared constants) */
  bq(face) { let q = this._bq.get(face); if (!q) { q = []; this._bq.set(face, q); } return q; }
  updateBuses() {
    const p = this.params, t = this.tick, m = this.minuteNow;
    if (p.busesPerHour > 0 && m >= 330 && m < 1350) {
      const head = Math.max(2, Math.round(60 / p.busesPerHour));
      for (const R of BUS_ROUTES) for (const dir of [1, -1]) {
        const off = R.id * 7 + (dir > 0 ? 0 : (head >> 1));
        if ((t + off) % head !== 0) continue;
        const b = new Bus(++this.busSeq, R, dir);
        this.buses.push(b);
        if (b.startStop) this.busStop(b, b.startStop);
      }
    }
    // waiting too long: walk instead
    for (const R of BUS_ROUTES) for (const st of R.stopList) for (const dir of [1, -1]) {
      const q = this.bq(st.faces[dir]);
      if (!q.length) continue;
      for (let i = q.length - 1; i >= 0; i--) {
        const a = q[i];
        if (a.mode !== 'wait' || !a.alive) { q.splice(i, 1); continue; }
        if (this.tick >= a.waitUntil) { q.splice(i, 1); a.leaveStop(this, st.faces[dir]); }
      }
    }
    for (const b of this.buses) {
      b.age++;
      if (b.dwell > 0) b.dwell--;
      else {
        b.px = b.x; b.py = b.y;
        let step = this.driveSpeed * 0.75;
        if (p.trafficLights) step = this.signalStep(b, step);
        if (step <= 0.01) b.waited++;
        else {
          while (step > 0 && b.pi < b.path.length) {
            const q = b.path[b.pi], dx = q.x - b.x, dy = q.y - b.y, d = Math.hypot(dx, dy);
            if (d > 0.01) b.heading = Math.atan2(dy, dx);
            if (d <= step) { b.x = q.x; b.y = q.y; step -= d; b.pi++; if (q.stop) { this.busStop(b, q.stop); break; } }
            else { b.x += (dx / d) * step; b.y += (dy / d) * step; step = 0; }
          }
        }
      }
      b.riders = b.riders.filter((a) => a.mode === 'bus' && a.alive);
      for (const a of b.riders) { a.x = b.x; a.y = b.y; a.heading = b.heading; }
      if (b.pi >= b.path.length && b.dwell <= 0) {
        for (const a of b.riders) a.leaveStop(this, a.busPlan.stopB.faces[b.dir]);
        b.riders = []; b.done = true;
      }
    }
    if (this.buses.some((b) => b.done)) this.buses = this.buses.filter((b) => !b.done);
  }
  busContacts() {
    const p = this.params, beta = (p.transmissionRate / 100 / TICKS_PER_HOUR) * CONTACT_EVERY * PLACE_RISK.bus;
    for (const b of this.buses) {
      if (b.riders.length < 2) continue;
      const crowd = Math.min(1, 0.35 + b.riders.length / 18);
      for (const a of b.riders) {
        if (a.state !== 'I' || a.isolated) continue;
        for (const o of b.riders) {
          if (o === a || o.state !== 'S' || o.protectedBy(p)) continue;
          if (this.rng.chance(beta * crowd * (a.mask ? 0.5 : 1) * (o.mask ? 0.7 : 1) * o.susc)) this.infect(o, a, false, 'bus');
        }
      }
    }
  }
  /* other drivers pull over for an ambulance with its siren on */
  clearWay(amb) {
    for (const c of this._cars) {
      if (Math.abs(c.x - amb.x) > 48 || Math.abs(c.y - amb.y) > 48) continue;
      if (c.yieldUntil < this.tick) this.stats.yielded++;
      c.yieldUntil = this.tick + 4;
    }
  }

  /* ======================= v5: service vehicles, deliveries, funerals ======================= */
  drivePath(A, B) {
    return [{ x: A.door.x, y: A.door.y }, ...offsetRoute(centreRoute(A, B), 'drive'), { x: B.door.x, y: B.door.y }];
  }
  spawnRig(kind, from, transient) {
    const r = new Rig(++this.rigSeq, kind, from.x, from.y);
    r.transient = !!transient;
    this.rigs.push(r);
    return r;
  }
  updateLife() {
    const m = this.minuteNow, T = this.today;
    // groceries from the mart: a delivery van drives to the door and back
    while (T.orderIdx < T.orders.length && T.orders[T.orderIdx].t <= m) {
      if (this.rigs.filter((r) => r.kind === 'van').length >= 6) break;
      const o = T.orders[T.orderIdx++];
      const mart = this.mart, v = this.spawnRig('van', mart.access.door, true);
      v.go(this.drivePath(mart.access, o.home.access), 5, { op: 'delivered' })
       .go(this.drivePath(o.home.access, mart.access), 0, { op: 'dead' });
    }
    if (T.burstAt === m) { T.burstAt = -1; this.startBurst(); }
    if (T.outageAt === m) { T.outageAt = -1; this.en.outageUntil = this.tick + this.params.gridOutageHours * 60; this.log('power', `Grid outage: no power from the grid for ${this.params.gridOutageHours} hours`); }
    if (T.fireAt === m) {
      T.fireAt = -1;
      const rng = this.rng, r = rng.next(), pool = r < 0.55 ? this.homes : this.places.filter((q) => ['market', 'mart', 'mandi', 'factory', 'office', 'school', 'gym', 'fuel', 'govt'].includes(q.type) || q.type === 'nadra' || q.type === 'passport');
      this.startFire(pool[rng.int(0, pool.length - 1)], rng.int(1, 3));
    }
    if (this.en.outageUntil && this.tick === this.en.outageUntil) this.log('power', 'The grid is back');
    // funerals: the hearse brings the body to the mosque, then to the graveyard
    const F = T.funeral;
    if (F && !F.started && m >= FUNERAL.mosque - 25) {
      F.started = true;
      const gy = this.graveyard, mo = this.mosque, h = this.spawnRig('hearse', gy.access.door, true);
      if (F.public) h.go(this.drivePath(gy.access, mo.access), 38, null, 'carrying').go(this.drivePath(mo.access, gy.access), 18, { op: 'bury', F }, 'carrying');
      else h.go([{ x: gy.access.door.x, y: gy.access.door.y }], 12, { op: 'bury', F });
    }
  }
  updateRigs() {
    let anyDead = false;
    for (const r of this.rigs) {
      r.update(r.kind === 'fire' || r.kind === 'crew' ? AMB_SPEED * 0.9 : r.kind === 'waste' ? this.driveSpeed * 0.8 : this.driveSpeed * 0.9, this);
      if (r.dead) anyDead = true;
    }
    if (anyDead) this.rigs = this.rigs.filter((r) => !r.dead);
  }
  scheduleFuneral(a) { this.funeralQueue.push({ id: a.id, due: this.dayIndex + 1 }); }
  prepareFuneral(d) {
    const due = this.funeralQueue.filter((f) => f.due <= d);
    if (!due.length) return null;
    this.funeralQueue = this.funeralQueue.filter((f) => f.due > d);
    const p = this.params, rng = this.rng, guests = new Set(), dead = due.map((f) => this.agents[f.id]);
    const open = p.gatheringsOpen && this.isOpen(this.mosque);
    for (const a of dead) for (const m of a.household.members) {
      if (!m.alive || m.busy) continue;
      if (m.age.key !== 'child' || rng.chance(0.35)) guests.add(m.id);
    }
    if (open) {
      const want = Math.round(p.funeralGuests * (dead.length > 1 ? 1.5 : 1)), home = dead[0].home;
      const pool = this.agents.filter((a) => a.alive && a.age.key !== 'child' && !a.busy && !a.distancing && !guests.has(a.id) && !(a.state === 'I' && a.symptomatic && rng.chance(p.sickStayHome / 100)));
      pool.sort((x, y) => (Math.abs(x.home.cx - home.cx) + Math.abs(x.home.cy - home.cy)) - (Math.abs(y.home.cx - home.cx) + Math.abs(y.home.cy - home.cy)));
      const near = pool.slice(0, want * 3);
      for (let i = near.length - 1; i > 0; i--) { const j = rng.int(0, i); [near[i], near[j]] = [near[j], near[i]]; }
      for (const a of near.slice(0, want)) guests.add(a.id);
    }
    const F = { guests, dead: dead.map((a) => a.id), public: open, started: false };
    this.log('gather', `Funeral today for ${dead.map((a) => '#' + a.id).join(', ')}: ${guests.size} mourners${open ? ' at the mosque and the graveyard' : ' (family only: gatherings are closed)'}`);
    return F;
  }
  bury(F) {
    const gy = this.graveyard;
    for (const id of F.dead) {
      const a = this.agents[id];
      if (a.buried) continue;
      a.buried = true; this.buried++;
      const slot = gy.graveSlots.find((g) => !g.used);
      if (slot) { slot.used = true; slot.id = id; a.grave = slot; }
    }
    this.funerals++;
    this.log('gather', `Burial of ${F.dead.map((id) => '#' + id).join(', ')} at the graveyard`);
  }

  /* ======================= v5: smart-city subsystems ======================= */
  initSystems() {
    const p = this.params, rng = this.rng;
    this.en = {
      bat: p.batteryKwh * 0.6, solar: 0, demand: 0, served: 0, grid: 0, diesel: 0, ratio: { critical: 1, public: 1, industry: 1, home: 1, street: 1 },
      cls: { critical: 0, public: 0, industry: 0, home: 0, street: 0 }, outageUntil: 0, faults: [], signalsOn: true, lightsOn: true, pumpKw: 6, hospPw: 1, peak: false,
      tot: { solar: 0, solarUsed: 0, grid: 0, charge: 0, discharge: 0, curtail: 0, consumed: 0, unserved: 0, diesel: 0, cost: 0, outageMin: 0, demand: 0 },
      residual: 0, maxResidual: 0, socOk: true,
    };
    const tank0 = p.tankCapacity * 0.8;
    this.wa = {
      tank: tank0, tank0, demand: 0, delivered: 0, unmet: 0, leak: 0, pump: 0, inflow: 0, bursts: [], stress: 0,
      tot: { demand: 0, delivered: 0, unmet: 0, leak: 0, inflow: 0, overflow: 0, cost: 0 }, residual: 0, maxResidual: 0,
    };
    this.bins = [];
    for (const b of this.blocks) {
      if (!b.places.length) continue;
      const acc = b.places[0].access;
      const bin = { id: this.bins.length, block: b, kg: rng.range(0, 35), over: 0, x: acc.walk.x, y: acc.walk.y, access: acc, claimed: false, overflowed: false, req: null };
      b.bin = bin; this.bins.push(bin);
    }
    this.wst = { generated: 0, collected: 0, recycled: 0, landfill: 0, burnt: 0, overflowEvents: 0, initial: this.bins.reduce((s, b) => s + b.kg, 0), residual: 0, maxResidual: 0, busy: 0, ticks: 0, routePtr: 0 };
    this.svc = { open: [], seq: 0, done: 0, resp: [], byType: {} };
    this.fires = []; this.extraEm = []; this.fireSeq = 0;
    this.tempC = p.baseTemp; this.flood = 0; this.lightPenalty = 1; this.signalsOn = true;
    this._occ = new Int16Array(this.places.length + 1);
    // sensors: the control room only sees what these report (noisy, late, sometimes lost)
    const at = (pl) => ({ x: pl.access.walk.x, y: pl.access.walk.y });
    const sites = [
      ['Hospital', 'air', at(this.hospital)], ['North School', 'air', at(this.schools[0])], ['Bazaar', 'air', at(this.market)],
      ['Textile Factory', 'air', at(this.factories[0])], ['Airport', 'air', at(this.airport)], ['Kiln belt', 'air', { x: 1080, y: 370 }], ['Hill Park', 'air', at(this.parks[0])],
      ['Substation meter', 'power', { x: SUBSTATION.x0 + 20, y: SUBSTATION.y0 + 25 }], ['Water flow meter', 'water', { x: WATER_PLANT.x1 - 20, y: WATER_PLANT.y0 + 20 }],
    ];
    this.sensors = sites.map(([name, kind, pt], i) => ({
      id: i, name, kind, x: pt.x, y: pt.y, calib: kind === 'air' ? rng.range(-4, 4) : 0, offlineUntil: 0, battery: 1, buf: [], actual: 0, measured: null, received: null, rxTick: -1e9, dB: 40, dBr: null, online: true, dropped: 0, sent: 0,
    }));
    this.dash = { aqi: null, pm: null, fresh: 0, sum: 0, n: 0, yesterday: null, kw: null, water: null };
    this.initWifi();
    this.syncFleet();
  }
  addRig(kind, i) {
    let base, access;
    if (kind === 'fire') { const b = this.fire.bays[i % this.fire.bays.length]; base = { x: b.x, y: b.y }; access = this.fire.access; }
    else if (kind === 'waste') { base = { x: 526 + (i % 6) * 14, y: 641 }; access = WASTE_ACCESS; }
    else { base = { x: this.passport.access.door.x - 6 + (i % 8) * 4, y: this.passport.access.door.y - 6 }; access = this.passport.access; }
    const r = new Rig(++this.rigSeq, kind, base.x, base.y);
    r.base = { x: base.x, y: base.y, access }; r.at = access; r.slot = i;
    this.rigs.push(r);
    return r;
  }
  /* make the number of vehicles match the parameters (the user can change them while the model runs) */
  syncFleet() {
    const p = this.params;
    const want = { fire: p.fireTrucks, waste: p.wasteFleet, crew: p.maintenanceCrews };
    for (const kind of ['fire', 'waste', 'crew']) {
      const mine = this.rigs.filter((r) => r.kind === kind && !r.transient && !r.retire);
      for (let i = mine.length; i < want[kind]; i++) this.addRig(kind, this.rigs.filter((r) => r.kind === kind).length);
      for (let i = mine.length - 1; i >= want[kind]; i--) mine[i].retire = true;
    }
    while (this.ambulances.length < p.ambulances) this.ambulances.push(new Ambulance(this.ambulances.length, this));
    while (this.ambulances.length > p.ambulances) {
      const last = this.ambulances[this.ambulances.length - 1];
      if (last.state !== 'idle') break;
      this.ambulances.pop();
    }
  }

  /* weather: temperature, flooding */
  updateClimate() {
    const p = this.params, m = this.minuteNow, hr = m / 60;
    this.tempC = p.baseTemp + this.season.dT + (p.heatwave ? 9 : 0) + 7 * Math.sin(((hr - 9) / 24) * Math.PI * 2) - 4 * this.rain - 2 * this.fog - (p.weather === 'snow' ? 16 : 0);
    const inflow = 0.007 * Math.pow(this.rain, 1.5);
    const clog = Math.min(1, this.wst.uncollected ? this.wst.uncollected / Math.max(1, this.bins.length * p.binCapacity * 0.5) : 0);
    const outflow = (p.drainage / 100) * (1 - 0.6 * clog) * 0.0045 * (0.3 + this.flood);
    this.flood = Math.max(0, Math.min(1, this.flood + inflow - outflow));
    if (this.flood > 0.4 && !this.flags.floodOn) { this.flags.floodOn = true; this.log('weather', `Flooding: the drains cannot cope${clog > 0.3 ? ' (blocked by rubbish)' : ''}. Roads are slow and people stay home`); }
    else if (this.flood < 0.12 && this.flags.floodOn) { this.flags.floodOn = false; }
  }
  /* lightning: during a thunderstorm the city is struck at random. A strike can burn out a transformer or start a fire.
     It uses its own random stream, so a storm never changes the draws used elsewhere in the model. */
  lightning() {
    const p = this.params;
    if (!this.storm || p.lightningRate <= 0) return;
    const r = this.stormRng;
    if (!r.chance(p.lightningRate / 60)) return;
    const x = r.range(40, CITY_W - 40), y = r.range(40, CITY_H - 40);
    let best = null, bd = Infinity;
    for (const pl of this.places) { const d = (pl.cx - x) ** 2 + (pl.cy - y) ** 2; if (d < bd) { bd = d; best = pl; } }
    const s = { id: ++this.strikeSeq, tick: this.tick, x, y, effect: null };
    this.stats.strikes = (this.stats.strikes || 0) + 1;
    const roll = r.next();
    if (best && roll < 0.12 && best.block && !this.en.faults.some((q) => q.block === best.block)) {
      this.startFault(best.block, 60 + Math.round(r.next() * 60)); s.effect = 'fault'; this.stats.strikeFaults = (this.stats.strikeFaults || 0) + 1;
      this.log('weather', `Lightning hit the transformer near ${best.name}`);
    } else if (best && roll > 0.985 && !this.fires.some((q) => q.place === best)) {
      if (this.startFire(best, 1 + Math.round(r.next()))) { s.effect = 'fire'; this.stats.strikeFires = (this.stats.strikeFires || 0) + 1; this.log('weather', `Lightning set ${best.name} on fire`); }
    }
    this.strikes.push(s); if (this.strikes.length > 30) this.strikes.shift();
  }
  heatFactor() { return 1 + 0.03 * Math.max(0, this.tempC - 28); }

  /* every 10 minutes: who is where, then power, water, waste, sensors */
  updateSystems() {
    const p = this.params, m = this.minuteNow, occ = this._occ;
    occ.fill(0);
    let outside = 0;
    for (const a of this.agents) {
      if (a.mode === 'inside' || a.mode === 'bed') { if (a.place) occ[a.place.id]++; }
      else if (a.mode === 'walk' || a.mode === 'drive') outside++;
    }
    this.outside = outside;
    if (p.challanCameras > 0) {
      const lim = 1.07 / (p.speedingPct / 100 > 0 ? 1 : 1), cp = Math.min(0.45, p.challanCameras * 0.035);
      for (const a of this.agents) if (a.mode === 'drive' && a.speedMul > lim && this.rng.chance(cp * 0.5)) this.issueChallan(a, 'speed');
    }
    this.updatePower(occ);
    this.updateWifi();
    this.updateExtras(occ);
    this.updateWater(occ);
    this.updateWasteGen(occ);
    this.sampleSensors();
  }

  /* ---- electricity: demand, solar, battery, grid, load shedding ---- */
  updatePower(occ) {
    const p = this.params, E = this.en, m = this.minuteNow, dt = DT / 60, hr = m / 60, T = this.tempC;
    const work = m >= 420 && m < 1140 && this.dayIndex % 7 < 6;
    const hot = this.heatFactor(), evening = m >= 1080 && m < 1380, nightLow = m >= 1380 || m < 300;
    const price = p.electricityPrice * (evening ? 1.5 : 1);
    const elastic = Math.pow(Math.max(0.2, price / 45), -0.12);
    const dr = evening ? 1 - (p.demandResponse / 100) * 0.5 : 1;
    const D = { critical: 0, public: 0, industry: 0, home: 0, street: 0 };
    let hospD = 0;
    const faultBlocks = new Set(E.faults.map((f) => f.block));
    for (const pl of this.places) {
      const cls = POWER_CLASS[pl.type];
      if (!cls) continue;
      if (faultBlocks.has(pl.block)) { pl.kw = 0; pl.want = 0; continue; }
      const o = occ[pl.id] || 0;
      let kw;
      if (pl.type === 'home') kw = (0.22 + 0.1 * o) * (evening ? 1.8 : nightLow ? 0.5 : 1) * (1 + 0.06 * Math.max(0, T - 26) * (o ? 1 : 0.4) + 0.05 * Math.max(0, 18 - T) * (o ? 1 : 0.5)) * elastic * dr * (p.electricityUsageMul / 100);
      else {
        const ref = PLACE_REF[pl.type] || 10, stand = pl.type === 'wedding' || pl.type === 'graveyard' ? 0.05 : 0.25;
        const f = Math.max(pl.type === 'hospital' || pl.type === 'airport' || pl.type === 'police' ? 0.6 : stand, Math.min(1, 0.25 + 0.75 * o / ref));
        kw = PLACE_KW[pl.type] * (pl.tall ? p.skyFloors / 20 : pl.type === 'amusement' ? (p.amusementOpen ? p.amusementRides / 8 : 0.1) : 1) * f * (pl.type === 'factory' ? (work ? 1 : 0.2) : hot) * (cls === 'public' ? elastic * dr : 1) * (p.electricityUsageMul / 100);
      }
      pl.want = kw;
      D[cls] += kw;
      if (pl.type === 'hospital') hospD = kw;
    }
    D.public += this.extraKw || 0; D.industry += this.consKw || 0;
    // pumps and signals are critical; streetlights have the lowest priority
    D.critical += E.pumpKw + 13 * 0.35 + 3;
    const dark = this.night || m >= 1090 || m < 330;
    let lampKw = 0;
    if (dark && p.streetlights !== 'off') {
      const f = p.streetlights === 'dimmed' ? (nightLow ? 0.5 : 1) : p.streetlights === 'adaptive' ? 0.3 + 0.7 * Math.min(1, (this.outside || 0) / 50) : 1;
      lampKw = LAMPS * 0.12 * f;
    }
    D.street = lampKw;
    // supply
    const sr = this.dawn - 20, elev = m > sr && m < this.dusk ? this.season.sun * Math.sin((Math.PI * (m - sr)) / (this.dusk - sr)) : 0;
    const clouds = Math.max(0.15, 1 - 0.65 * this.rain - 0.55 * this.fog);
    const soil = 1 - Math.min(0.35, 0.0012 * Math.max(0, this.pm - 25));
    const solar = p.solarKw * elev * clouds * soil * (1 - 0.004 * Math.max(0, T - 25));
    const outage = this.tick < E.outageUntil;
    const gridCap = outage ? 0 : p.gridCapacity;
    const cap = p.batteryKwh, Pmax = 0.25 * cap, eff = 0.92;
    let Dtot = D.critical + D.public + D.industry + D.home + D.street;
    // hospital generator: if the grid cannot carry everything, the hospital runs on diesel
    const short = solar + gridCap + Math.min(Pmax, (E.bat * eff) / dt) < Dtot;
    let diesel = 0;
    if (p.hospitalGenerator && short) { diesel = hospD; D.critical -= hospD; Dtot -= hospD; }
    // dispatch: solar first, then grid and battery (battery first in the evening peak), battery charged from surplus solar and cheap night power
    const solarUse = Math.min(solar, Dtot), surplus = solar - solarUse;
    let charge = Math.min(surplus, Pmax, ((cap - E.bat) / (eff * dt)));
    const curtail = surplus - charge;
    let deficit = Dtot - solarUse, gridUse = 0, batOut = 0;
    const batAvail = Math.min(Pmax, (E.bat * eff) / dt);
    const peak = evening;
    if (peak) { batOut = Math.min(deficit, batAvail); gridUse = Math.min(deficit - batOut, gridCap); }
    else { gridUse = Math.min(deficit, gridCap); batOut = Math.min(deficit - gridUse, batAvail); }
    let gridCharge = 0;
    if (!peak && E.bat < 0.6 * cap && gridCap - gridUse > 0 && batOut === 0) gridCharge = Math.min(gridCap - gridUse, Pmax - charge, (cap * 0.6 - E.bat) / (eff * dt));
    gridCharge = Math.max(0, gridCharge);
    const served = solarUse + gridUse + batOut;
    E.bat += (charge + gridCharge) * eff * dt - (batOut * dt) / eff;
    const chargeKwh = (charge + gridCharge) * dt, dischargeKwh = batOut * dt;
    // who gets the power
    const r = { critical: 1, public: 1, industry: 1, home: 1, street: 1 };
    const order = ['critical', 'public', 'industry', 'home', 'street'];
    if (p.loadShedding === 'uniform') { const q = Dtot > 0 ? Math.min(1, served / Dtot) : 1; for (const k of order) r[k] = q; }
    else { let rem = served; for (const k of order) { const give = Math.min(D[k], rem); r[k] = D[k] > 0 ? give / D[k] : 1; rem -= give; } }
    const hour = Math.floor(this.tick / 60);
    const nCut = p.loadShedding === 'rolling' ? Math.round((1 - r.home) * FEEDERS) : 0;
    for (const pl of this.places) {
      const cls = POWER_CLASS[pl.type];
      if (!cls) { pl.pw = 1; continue; }
      if (faultBlocks.has(pl.block)) { pl.pw = 0; continue; }
      if (pl.type === 'hospital') { pl.pw = diesel > 0 ? 1 : r.critical; continue; }
      if (cls === 'home' && p.loadShedding === 'rolling' && nCut > 0) { const fd = (pl.block.c + pl.block.r * 3) % FEEDERS; pl.pw = ((fd + hour) % FEEDERS) < nCut ? 0 : 1; continue; }
      pl.pw = r[cls];
    }
    E.hospPw = diesel > 0 ? 1 : r.critical;
    E.ratio = r; E.cls = D; E.demand = Dtot + diesel; E.served = served + diesel; E.solar = solar; E.grid = gridUse + gridCharge; E.diesel = diesel;
    E.signalsOn = r.critical >= 0.5; E.lightsOn = r.street >= 0.5;
    this.signalsOn = E.signalsOn;
    // lights and traffic: dark roads are more dangerous
    const lp = p.streetlights === 'off' ? 1.35 : !E.lightsOn && dark ? 1.3 : p.streetlights === 'dimmed' && nightLow ? 1.1 : p.streetlights === 'adaptive' && dark ? 1.04 : 1;
    this.lightPenalty = lp;
    // totals and the energy balance check: in = solar + grid + battery discharge + diesel; out = consumed + curtailed + battery charge
    const T0 = E.tot;
    const inK = solar + gridUse + gridCharge + batOut + diesel, outK = served + diesel + curtail + charge + gridCharge;
    const allocated = order.reduce((s, k) => s + r[k] * D[k], 0);
    E.residual = (Math.abs(inK - outK) + Math.abs(allocated - served)) * dt;
    E.maxResidual = Math.max(E.maxResidual, E.residual);
    E.socOk = E.bat >= -1e-6 && E.bat <= cap + 1e-6;
    T0.solar += solar * dt; T0.solarUsed += solarUse * dt; T0.grid += (gridUse + gridCharge) * dt; T0.charge += chargeKwh; T0.discharge += dischargeKwh; T0.curtail += curtail * dt;
    T0.consumed += (served + diesel) * dt; T0.unserved += Math.max(0, Dtot + diesel - served - diesel) * dt; T0.diesel += diesel * dt; T0.demand += (Dtot + diesel) * dt;
    T0.cost += (gridUse + gridCharge) * dt * price + diesel * dt * 120;
    if (outage) T0.outageMin += DT;
    E.peak = peak; E.price = price;
    if (diesel > 0) this.extraEm.push({ x: this.hospital.cx, y: this.hospital.cy, e: 60 });
    if (Dtot > 0 && served < 0.97 * Dtot && !this.flags.shedOn) { this.flags.shedOn = true; if (this.tick - (this.flags.shedT || -1e9) > TICKS_PER_DAY / 2) { this.flags.shedT = this.tick; this.log('power', `Power shortage: ${Math.round(Dtot - served)} kW short, ${p.loadShedding === 'rolling' ? 'rolling blackouts' : p.loadShedding === 'critical' ? 'homes and streetlights are cut first' : 'everyone gets less power'}`); } }
    else if (served >= 0.99 * Dtot && this.flags.shedOn) { this.flags.shedOn = false; }
    // random local faults
    if (this.rng.chance(p.localFaults / (TICKS_PER_DAY / DT))) this.startFault();
    E.faults = E.faults.filter((f) => f.until > this.tick);
  }
  startFault(block, minutes) {
    const bl = block || this.blocks.filter((b) => b.places.length)[this.rng.int(0, this.blocks.filter((b) => b.places.length).length - 1)];
    if (this.en.faults.some((f) => f.block === bl)) return null;
    const pl = bl.places[0];
    const f = { block: bl, until: minutes ? this.tick + minutes : Infinity, t0: this.tick };
    this.en.faults.push(f);
    f.req = this.openRequest('fault', pl.access, { ref: f });
    this.stats.faults = (this.stats.faults || 0) + 1;
    this.log('power', `Transformer fault: the block around ${pl.type === 'home' ? 'House/Flats' : pl.name} has no power`);
    return f;
  }

  /* ---- water: reservoir, pumps, pipes, leaks, demand ---- */
  updateWater(occ) {
    const p = this.params, W = this.wa, m = this.minuteNow, dt = DT / 60, hr = m / 60;
    const prof = hr >= 5.5 && hr < 9.5 ? 2.1 : hr >= 17.5 && hr < 22 ? 1.7 : hr >= 23 || hr < 4.5 ? 0.3 : 1;
    const heat = 1 + 0.025 * Math.max(0, this.tempC - 30), work = m >= 420 && m < 1140 && this.dayIndex % 7 < 6;
    const cons = 1 - p.waterConservation / 100, pe = Math.pow(Math.max(0.2, p.waterPrice / 30), -0.15);
    let demand = 0;
    for (const pl of this.places) {
      const k = WATER_M3[pl.type];
      if (!k) continue;
      const o = occ[pl.id] || 0;
      demand += (pl.type === 'home' ? o * k * prof * heat * cons * pe : o * k * heat) * (p.waterPerCapita / 100);
    }
    demand += 0.6 + 0.01 * (occ[this.hospital.id] || 0);            // hospital
    if (work) demand += 0.5 * this.factories.length;                 // factories
    if ((hr >= 5 && hr < 8) || (hr >= 17 && hr < 19)) demand += this.rain > 0.2 ? 0 : 0.15 * this.parks.length;   // park irrigation
    // plant, pumps and pipes
    const crit = this.en.ratio.critical;
    const supply = (p.waterSupply * (p.drought ? 0.45 : 1) + 0.35 * (p.tankers || 0)) * crit;
    const rainIn = 0.6 * this.rain;
    const inflow = supply + rainIn;
    const burstFlow = W.bursts.reduce((s, b) => s + b.rate, 0);
    const leakFrac = p.leakRate / 100;
    const qReq = demand / (1 - leakFrac) + burstFlow;
    const avail = W.tank / dt + inflow;
    const qPump = Math.max(0, Math.min(qReq, p.pumpCapacity * crit, avail));
    const frac = qReq > 0 ? qPump / qReq : 1;
    const delivered = demand * frac, leak = qPump - delivered;
    const v0 = W.tank;
    let v1 = v0 + (inflow - qPump) * dt, overflow = 0;
    if (v1 > p.tankCapacity) { overflow = v1 - p.tankCapacity; v1 = p.tankCapacity; }
    if (v1 < 0) v1 = 0;
    W.tank = v1; W.demand = demand; W.delivered = delivered; W.unmet = demand - delivered; W.leak = leak; W.pump = qPump; W.inflow = inflow;
    W.stress += ((demand > 0 ? (demand - delivered) / demand : 0) - W.stress) * 0.15;
    const t = W.tot;
    t.demand += demand * dt; t.delivered += delivered * dt; t.unmet += (demand - delivered) * dt; t.leak += leak * dt; t.inflow += inflow * dt; t.overflow += overflow; t.cost += delivered * dt * p.waterPrice;
    // water balance check: change in storage = inflow - pumped - overflow
    W.residual = Math.abs(v1 - v0 - ((inflow - qPump) * dt - overflow));
    W.maxResidual = Math.max(W.maxResidual, W.residual);
    this.en.pumpKw = 3 + 12 * (qPump / Math.max(0.1, p.pumpCapacity));
    if (W.stress > 0.35 && !this.flags.thirst) { this.flags.thirst = true; this.log('water', `Water shortage: ${Math.round(W.stress * 100)}% of demand is not met. Taps run dry and hygiene suffers`); }
    else if (W.stress < 0.12 && this.flags.thirst) this.flags.thirst = false;
  }
  startBurst(x, y, rate, minutes) {
    const rng = this.rng;
    if (x == null) { const j = this.junctions[rng.int(0, this.junctions.length - 1)]; x = j.X + rng.range(-30, 30); y = j.Y; }
    const b = { id: ++this.incSeq, x, y, rate: rate || 0.9, t0: this.tick, until: minutes ? this.tick + minutes : Infinity };
    this.wa.bursts.push(b);
    b.req = this.openRequest('burst', roadAccess(x, y), { ref: b });
    this.stats.bursts = (this.stats.bursts || 0) + 1;
    this.log('water', `A water main burst on the road: ${(b.rate * 24).toFixed(0)} m³ a day is lost until a crew repairs it`);
    return b;
  }

  /* ---- waste: bins fill, trucks collect, some of the rubbish is burnt ---- */
  updateWasteGen(occ) {
    const p = this.params, W = this.wst, m = this.minuteNow, hr = DT / 60, mul = p.wasteRate / 100, cap = p.binCapacity;
    const open = m >= 540 && m < 1260, mandiOpen = m >= 330 && m < 780, work = m >= 420 && m < 1140;
    for (const pl of this.places) {
      const k = WASTE_KG[pl.type];
      if (!k || !pl.block.bin) continue;
      let kg = (occ[pl.id] || 0) * k * hr;
      const base = WASTE_BASE[pl.type];
      if (base && (pl.type === 'mandi' ? mandiOpen : pl.type === 'factory' || pl.type === 'hospital' ? work || pl.type === 'hospital' : open)) kg += base * hr;
      kg *= mul;
      pl.block.bin.kg += kg; W.generated += kg;
    }
    let unc = 0;
    for (const b of this.bins) {
      b.over = Math.max(0, b.kg - cap);
      if (b.over > 0) {
        unc += b.over;
        if (!b.overflowed) {
          b.overflowed = true; W.overflowEvents++;
          b.req = this.openRequest('overflow', b.access, { ref: b });
          if (!this.flags.overflowLog || this.tick - this.flags.overflowLog > TICKS_PER_DAY) { this.flags.overflowLog = this.tick; this.log('waste', `A bin at ${b.block.places[0].type === 'home' ? 'the houses' : b.block.places[0].name} is overflowing. Rubbish is on the street`); }
        }
        // people burn rubbish when nobody collects it
        const burn = Math.min(b.over, b.over * (p.wasteBurning / 100) * 0.06 + 0.5 * (p.wasteBurning / 100));
        if (burn > 0) { b.kg -= burn; W.burnt += burn; this.extraEm.push({ x: b.x, y: b.y, e: 30 + 70 * Math.min(1, b.over / cap) * (p.wasteBurning / 100) }); }
      } else if (b.overflowed && b.kg <= cap * 0.5) { b.overflowed = false; if (b.req) this.closeRequest(b.req); }
    }
    W.uncollected = unc;
    W.stored = this.bins.reduce((s, b) => s + b.kg, 0);
    W.residual = Math.abs(W.initial + W.generated - W.collected - W.burnt - W.stored);
    W.maxResidual = Math.max(W.maxResidual, W.residual);
  }
  /* rig callbacks are plain data so that a world can be copied for what-if forecasts */
  rigEvent(e, rr) {
    const p = this.params, W = this.wst;
    switch (e.op) {
      case 'delivered': this.stats.delivered++; break;
      case 'dead': rr.dead = true; break;
      case 'bury': this.bury(e.F); rr.dead = true; break;
      case 'unload': { const rec = rr.load * (p.recyclingRate / 100); W.recycled += rec; W.landfill += rr.load - rec; rr.load = 0; rr.at = WASTE_ACCESS; break; }
      case 'collect': { const target = e.bin, take = Math.min(target.kg, TRUCK_CAP - rr.load);
        target.kg -= take; rr.load += take; W.collected += take; target.claimed = false; rr.at = target.access;
        if (target.kg <= p.binCapacity * 0.5 && target.overflowed) { target.overflowed = false; if (target.req) this.closeRequest(target.req); } break; }
      case 'resolve': this.resolveRequest(e.req); rr.job = null; break;
      case 'reached': e.req.tArr = this.tick; break;
      case 'atWaste': rr.at = WASTE_ACCESS; break;
      case 'engine': e.fire.engines++; break;
      case 'fireBack': rr.siren = false; rr.job = null; break;
      default: break;
    }
  }
  assignWaste(r) {
    const p = this.params, m = this.minuteNow, W = this.wst;
    if (r.retire) return;
    const unload = () => {
      const from = r.at;
      r.go(this.drivePath(from, WASTE_ACCESS), 8, { op: 'unload' }, 'unloading');
    };
    if (m < 360 || m >= 1200) { if (r.load > 0 && r.at !== WASTE_ACCESS) unload(); return; }
    let target = null;
    const free = this.bins.filter((b) => !b.claimed);
    if (p.collectionPriority === 'route') {
      for (let i = 0; i < this.bins.length; i++) { const b = this.bins[(W.routePtr + i) % this.bins.length]; if (!b.claimed && b.kg > 8) { target = b; W.routePtr = (W.routePtr + i + 1) % this.bins.length; break; } }
    } else {
      let best = 0.3;
      for (const b of free) { const ratio = b.kg / p.binCapacity; if (ratio > best) { best = ratio; target = b; } }
    }
    if (!target || r.load > TRUCK_CAP * 0.85) { if (r.load > 60) unload(); return; }
    target.claimed = true;
    r.go(this.drivePath(r.at, target.access), 3, { op: 'collect', bin: target }, 'collecting');
  }

  /* ---- service requests: crews, response time ---- */
  openRequest(type, access, o) {
    const T = REQUEST_TYPES[type], rng = this.rng;
    const req = { id: ++this.svc.seq, type, t0: this.tick, access, sev: T.sev, fix: Math.round(rng.range(T.fix[0], T.fix[1])), crew: null, tArr: null, ref: o && o.ref };
    this.svc.open.push(req);
    return req;
  }
  closeRequest(req, arrived) {
    const i = this.svc.open.indexOf(req);
    if (i < 0) return;
    this.svc.open.splice(i, 1);
    this.svc.done++;
    const t = (req.tArr != null ? req.tArr : this.tick) - req.t0;
    this.svc.resp.push(t);
    if (this.svc.resp.length > 200) this.svc.resp.shift();
    this.svc.byType[req.type] = (this.svc.byType[req.type] || 0) + 1;
  }
  resolveRequest(req) {
    if (req.type === 'burst') { const i = this.wa.bursts.indexOf(req.ref); if (i >= 0) this.wa.bursts.splice(i, 1); this.log('water', 'Crew repaired the burst water main'); }
    else if (req.type === 'fault') { const i = this.en.faults.indexOf(req.ref); if (i >= 0) this.en.faults.splice(i, 1); this.log('power', 'Crew repaired the transformer: power is back'); }
    else if (req.type === 'sensor') { const s = req.ref; if (s) { s.offlineUntil = 0; s.calib *= 0.2; } }
    this.closeRequest(req);
  }
  /* each minute: crews pick the most urgent request; trucks and fire engines get their jobs */
  updateServices() {
    const S = this.svc, p = this.params, rng = this.rng;
    // new citizen complaints
    if (rng.chance(1.6 / TICKS_PER_DAY)) {
      const bl = this.blocks.filter((b) => b.places.length);
      this.openRequest('complaint', bl[rng.int(0, bl.length - 1)].places[0].access);
    }
    for (const r of this.rigs) {
      if (r.transient) continue;
      if (r.retire && r.idle && r.state === 'idle') { r.dead = true; continue; }
      if (r.kind === 'crew' && r.idle && !r.retire) {
        let best = null, score = -1;
        for (const q of S.open) {
          if (q.crew || q.type === 'overflow') continue;
          const sc = q.sev * 3 + (this.tick - q.t0) / 120;
          if (sc > score) { score = sc; best = q; }
        }
        if (best) {
          best.crew = r; r.job = best;
          r.go(this.drivePath(r.base.access, best.access), best.fix, { op: 'resolve', req: best }, 'working');
          r.legs[0].arrive = { op: 'reached', req: best };
          r.go(this.drivePath(best.access, r.base.access), 0, null, 'returning');
        }
      } else if (r.kind === 'waste' && r.idle) {
        this.assignWaste(r);
        if (r.idle && r.at !== WASTE_ACCESS && r.load === 0) r.go(this.drivePath(r.at, WASTE_ACCESS), 0, { op: 'atWaste' }, 'returning');
      }
      if (r.kind === 'waste') { this.wst.ticks++; if (!r.idle) this.wst.busy++; }
    }
    this.updateFires();
    this.deliverSensors();
  }

  /* ---- public Wi-Fi: access points in public buildings; they need power (battery for a while), carry limited traffic,
         and the sensors of the digital twin send their readings over them ---- */
  /* ----- seasons, kilns seen from space, construction, the tall tower, the amusement park, electric cars ----- */
  constructionWorking() {
    const p = this.params, m = this.minuteNow, C = this.cons;
    let why = 'working';
    if (!p.constructionOn) why = 'site closed';
    else if (C.done) why = 'finished';
    else if (this.dayIndex % 7 === 6) why = 'Sunday rest';
    else if (m < 420 || m >= 1080) why = 'outside work hours';
    else if (this.rain > 0.5 || this.storm) why = 'stopped: heavy rain';
    else if ((p.constructionAqiBan && this.aqi > 200) || this.aiHold) why = this.aiHold ? 'stopped: AI smog hold' : 'stopped: smog (AQI over 200)';
    C.why = why;
    return why === 'working';
  }
  updateExtras(occ) {
    const p = this.params, m = this.minuteNow, dt = DT / 60, C = this.cons;
    // construction: floors grow while the crew works
    const working = this.constructionWorking();
    if (working) { C.floors = Math.min(30, C.floors + p.constructionSpeed * 1.5 * dt / 11 * (p.constructionWorkers / 60)); if (C.floors >= 30) { C.done = true; this.log('city', 'The new tower on the construction site is finished'); } }
    if (C.working && !working && C.why.startsWith('stopped') && !this.flags['cs' + C.why]) { this.flags['cs' + C.why] = true; this.log('city', `Construction ${C.why}`); }
    if (working) { for (const k of Object.keys(this.flags)) if (k.startsWith('csstopped')) this.flags[k] = false; }
    C.working = working;
    this.consKw = p.constructionOn && !C.done ? (working ? 35 * (p.constructionWorkers / 60) + 10 : 4) : 0;
    // electric cars charge at home, mostly in the evening
    if (this.nCars == null) this.nCars = this.households.filter((h) => h.car).length;
    const evening = m >= 1080 && m < 1380, nightLow = m >= 1380 || m < 300;
    this.extraKw = this.nCars * (p.evShare / 100) * 3.3 * (evening ? 0.5 : nightLow ? 0.3 : 0.04);
    // Sky Tower and Funland
    if (this.sky) { const o = occ[this.sky.id] || 0, S = this.skyStat; S.peak = Math.max(S.peak, o); S.occ = o; S.wait = Math.round((0.4 + o / (p.skyFloors * 4)) * (m >= 480 && m < 570 || m >= 1020 && m < 1080 ? 1.5 : 1) * 10) / 10; S.kwh += (this.sky.kw || 0) * dt; }
    if (this.amusement) { const o = occ[this.amusement.id] || 0, A = this.amuse; A.peak = Math.max(A.peak, o); A.now = o; A.kwh += (this.amusement.kw || 0) * dt; }
    this.awareness *= 0.99;
    // satellite pass
    if (p.satPassHours > 0 && this.tick >= 60 && (this.sat.tick < 0 || this.tick - this.sat.tick >= p.satPassHours * 60)) this.satellitePass();
  }
  /* Sensor skill. These odds are ASSUMPTIONS taken from the expected outcomes in the research papers, not measured values:
     thermal-only SWIR is near random, optical works in clear air, thermal infrared adds night-firing kilns, radar works through fog. */
  satSkill(mode, fogged, nightKiln) {
    const t = { swir: [0.55, 0.5, 0.55], optical: [0.8, 0.5, 0.45], thermal: [0.85, 0.62, 0.8], full: [0.9, 0.85, 0.85] }[mode] || [0.8, 0.5, 0.45];
    return fogged ? t[1] * (nightKiln ? t[2] / t[0] : 1) : (nightKiln ? t[2] : t[0]);
  }
  satellitePass() {
    const p = this.params, r = this.satRng, S = this.sat;
    const cloud = Math.max(0, Math.min(1, 0.8 * this.fog + 0.6 * this.rain)), fogged = cloud > 0.35;
    const typeErr = { zero: 0.56, balanced: 0.27, calibrated: 0.17 }[p.satAdapt] || 0.56;
    S.passes++; S.tick = this.tick; S.blocked = fogged;
    let hot = 0, op = 0, fa = 0, miss = 0, seen = 0, predZig = 0, estE = 0, trueE = 0, sham = 0;
    for (let i = 0; i < KILN_SITES.length; i++) {
      const built = i < p.kilns, on = this.kilnOn(i), q = this.satSkill(p.satMode, fogged, this.kNight[i]);
      const r1 = r.next(), r2 = r.next(), r3 = r.next();
      const sees = r1 < 0.7 + 0.3 * (1 - cloud) || p.satMode === 'full';
      const flagged = sees && (on ? r2 < q : r2 < (1 - q) * 0.5);
      const zig = this.kZig[i], predictedZig = zig ? r3 > 0.15 : r3 < typeErr;
      S.kilns[i] = { seen: sees, hot: flagged, conf: q, predZig: predictedZig, zig, night: this.kNight[i] };
      if (sees) seen++;
      if (on) op++;
      if (flagged) hot++;
      if (flagged && !on) fa++;
      if (on && !flagged) miss++;
      if (built) { if (!zig) sham++; if (predictedZig) predZig++; }
      if (on) trueE += 900 * (zig ? 0.4 : 1);
      if (flagged) estE += 900 * (predictedZig ? 0.4 : 1);
    }
    let bad = 0, n = 0; const cc = CITY_W / PCELL, cr = CITY_H / PCELL;
    for (let rr = 0; rr < cr; rr++) for (let c = 0; c < cc; c++) { n++; if (this.pol[rr * PCOLS + c] > 55) bad++; }
    S.err = (S.err || 0) + fa + miss; S.tot = (S.tot || 0) + KILN_SITES.length;
    Object.assign(S, { seen, hot, operating: op, falseAlarm: fa, missed: miss, cover: Math.round(1000 * bad / n) / 10, cloud, predZig, sham, built: Math.min(p.kilns, 8), invErr: trueE > 0 ? Math.round(100 * (estE - trueE) / trueE) : (estE > 0 ? 100 : 0), estE, trueE });
    if (p.autoDispatch || p.aiAutopilot) this.dispatch(true);
  }
  /* enforcement: inspectors visit the kilns the satellite flagged with enough confidence (the "selective prediction gate") */
  dispatch(auto) {
    const p = this.params, S = this.sat, D = this.dispatchStat;
    if (!S.passes) return 'No satellite pass yet';
    const cand = [];
    S.kilns.forEach((k, i) => { if (k.hot && k.conf >= p.satGate / 100 && i < p.kilns) cand.push([k.conf, i]); });
    cand.sort((a, b) => b[0] - a[0]);
    const pick = cand.slice(0, p.inspectCapacity);
    let hits = 0, wasted = 0;
    for (const [, i] of pick) {
      D.sent++;
      if (this.kilnOn(i)) { hits++; D.hits++; D.sealed++; this.kilnSealed[i] = this.tick + p.kilnSealDays * 1440; this.log('city', `Inspectors found Kiln ${i + 1} burning and sealed it for ${p.kilnSealDays} days`); }
      else { wasted++; D.wasted++; }
    }
    D.last = pick.length ? `${auto ? 'Automatic: ' : ''}${pick.length} inspections, ${hits} kilns sealed, ${wasted} wasted trips` : `${auto ? 'Automatic: ' : ''}no call was confident enough (gate ${p.satGate}%)`;
    if (pick.length) this.addNews('city', `ENFORCEMENT: ${hits} brick kilns sealed after satellite alerts`, 0.3);
    return D.last;
  }
  /* ----- AI analyst: reads the whole live city and says the best point, the worst point, what to update and what to do ----- */
  aiReport() {
    const p = this.params, E = this.en, W = this.wa, st = this.stats, c = this.counts(), S = this.sat, D = this.dispatchStat, F = this.fc, Wf = this.wifi;
    const n = (x, d = 0) => (+x).toFixed(d), clamp = (x) => Math.max(0, Math.min(100, x));
    const pop = Math.max(1, p.population), over = this.bins.filter((b) => b.overflowed).length;
    const fcMax = F.aqi.length ? Math.max(...F.aqi) : Math.round(this.aqi);
    const built = Math.min(p.kilns, 8), on = this.kilnsOn();
    const share = 100 * this.emK / Math.max(1, this.emAll);
    const items = [];
    const add = (key, title, score, best, worst, update, rec) => items.push({ key, title, score: Math.round(clamp(score)), best, worst, update, rec });

    // ---- kilns and smog (the research topic) ----
    {
      const got = [], good = [], bad = [], upd = [], rec = [];
      got.push(`Air quality index ${n(this.aqi)} now, forecast to reach ${fcMax} within 6 hours (${this.season.name}).`);
      got.push(`${on} of ${built} kilns burning; kilns make about ${n(share)}% of the smoke. Unhealthy smoke covers ${S.passes ? n(S.cover) : '?'}% of the city.`);
      if (S.passes) got.push(`Satellite (${{ swir: 'SWIR heat', optical: 'optical', thermal: 'optical + ground heat', full: 'full with radar' }[p.satMode]}) sees ${S.hot} burning; ${S.falseAlarm} false alarms, ${S.missed} missed.`);
      if (p.kilnWinterStop && this.season.key === 'winter') good.push(`The winter shutdown is working: kilns are stopped and the air index is ${n(this.aqi)}.`);
      if (D.sealed) good.push(`Inspectors have sealed ${D.sealed} kilns (${D.sent ? n(100 * D.hits / D.sent) : 0}% of visits found a burning kiln).`);
      if (p.satMode === 'full') good.push('Radar is on, so the satellite keeps seeing kilns through fog.');
      if (p.cleanKilns || (p.zigzagShare >= 50)) good.push('Most smoke comes from clean zigzag technology.');
      if (this.aqi < 100) good.push(`Air is fairly clean (AQI ${n(this.aqi)}).`);
      if (S.passes && S.falseAlarm + S.missed <= 1) good.push('The last satellite pass was almost fully correct.');
      if (!good.length) good.push(`Forecasting works: 6-hour air forecast error is ${F.n ? n(F.err / F.n) : '?'} index points.`);
      if (this.aqi > 200) bad.push(`Hazardous air: AQI ${n(this.aqi)}. Children and elders are at risk.`);
      else if (fcMax > 200) bad.push(`Smog is coming: AQI forecast ${fcMax} in 6 hours.`);
      if (S.passes && S.blocked && p.satMode !== 'full') bad.push('Fog or rain is hiding the kilns from the satellite: it is nearly blind right now.');
      if (S.passes && S.sham > 0 && built > 0) bad.push(`The registry says all ${built} kilns are zigzag but ${S.sham} are old fixed-chimney kilns ("sham zigzag").`);
      if (p.nightShare > 0 && p.satMode !== 'full' && p.satMode !== 'thermal') bad.push('Kilns that fire at night escape a daytime optical pass.');
      if (S.passes && Math.abs(S.invErr) >= 30) bad.push(`Counting kilns by satellite gives a smoke total ${S.invErr > 0 ? 'too high' : 'too low'} by ${Math.abs(S.invErr)}% (technology called wrongly).`);
      if (D.sent >= 3 && D.hits / D.sent < 0.5) bad.push(`Only ${n(100 * D.hits / D.sent)}% of inspector trips found a burning kiln: ${D.wasted} trips wasted.`);
      if (!bad.length) bad.push('No serious problem in the kiln data right now.');
      if (p.satMode === 'swir' || p.satMode === 'optical') upd.push('Add ground-heat and radar sensors (paper 1): optical alone fails in fog and at night.');
      if (p.satAdapt !== 'calibrated') upd.push('Calibrate the kiln-type classifier to the real zigzag share (paper 2): it is now over-calling zigzag.');
      upd.push('Add crop-stubble fires as false alarms and real kiln sizes and fuels.');
      upd.push('Replace assumed sensor odds with a classifier trained on public satellite tiles.');
      if (this.aqi > 150 && !(p.kilnWinterStop && this.season.key === 'winter') && on > 0) rec.push(`Stop the ${on} burning kilns or seal the flagged ones: kilns are about ${n(share)}% of the smoke.`);
      if (S.passes && S.hot > 0 && !p.autoDispatch) rec.push(`Send inspectors now: ${S.hot} kilns look active (only calls above ${p.satGate}% confidence).`);
      if (S.passes && S.blocked && p.satMode !== 'full') rec.push('Switch the satellite to the full multi-sensor mode before fog gets worse.');
      if (this.season.key !== 'winter' && fcMax > 180 && !p.constructionAqiBan) rec.push('Stop construction while AQI is over 200.');
      if (this.season.key === 'winter' && !p.kilnWinterStop) rec.push('Turn on "Shut kilns in winter": it cut mean AQI by about half in the test runs.');
      if (!p.cleanKilns && p.zigzagShare < 50) rec.push('Convert kilns to real zigzag: those emit about 60% less.');
      if (!rec.length) rec.push('Keep the current policy and keep watching the forecast.');
      this.kilnAi = { got, good, bad, upd, rec };
      add('kiln', 'Kilns and smog', 100 - this.aqi / 3.5 - (S.passes ? Math.min(15, (S.falseAlarm + S.missed) * 4) : 0), good[0], bad[0], upd[0], rec[0]);
    }
    // ---- energy ----
    {
      const sr = E.demand > 0 ? 100 * E.served / E.demand : 100, soc = 100 * E.bat / Math.max(1, p.batteryKwh), solarShare = E.tot.consumed > 0 ? 100 * E.tot.solarUsed / E.tot.consumed : 0;
      const outage = this.tick < E.outageUntil;
      add('energy', 'Power', sr - (outage ? 25 : 0) - (E.tot.unserved > 50 ? 10 : 0),
        solarShare > 20 ? `Solar covers ${n(solarShare)}% of the energy used so far; battery at ${n(soc)}%.` : `Battery is at ${n(soc)}% and demand is served ${n(sr)}%.`,
        outage ? 'Grid outage: the city runs on solar and battery.' : E.tot.unserved > 0 ? `${n(E.tot.unserved, 1)} kWh of demand went unserved (${n(E.tot.outageMin / 60, 1)} h of outage).` : `Peak demand ${n(E.demand)} kW against a grid limit of ${p.gridCapacity} kW.`,
        soc < 30 || E.tot.unserved > 0 ? 'Add battery capacity or solar so evening peaks are covered.' : 'Add demand response and smarter charging for electric cars.',
        E.demand > p.gridCapacity * 0.9 ? 'Raise demand response now and keep the battery reserve for the evening peak.' : soc < 30 ? 'Charge the battery from cheap night power.' : 'Keep the battery above 30% before the evening peak.');
    }
    // ---- water ----
    {
      const tankPct = 100 * W.tank / Math.max(1, p.tankCapacity), unmetPct = W.tot.demand > 0 ? 100 * W.tot.unmet / W.tot.demand : 0;
      add('water', 'Water', 100 - unmetPct * 4 - (W.stress > 0.3 ? 20 : 0) - (this.flood > 0.4 ? 15 : 0),
        `Tank is ${n(tankPct)}% full and ${n(100 - unmetPct)}% of the demand was delivered.`,
        W.stress > 0.3 ? 'Water shortage: people are short of water.' : this.flood > 0.3 ? `Flooding on roads (${n(100 * this.flood)}%): drains cannot cope.` : W.bursts.length ? `${W.bursts.length} burst main(s) are leaking.` : 'Leaks lose water every day.',
        'Add a leak sensor and a bigger tank; unblock drains before the rains.',
        W.stress > 0.3 ? 'Ask for conservation and fix the burst mains first.' : this.flood > 0.3 ? 'Send crews to clear drains and keep people home.' : 'Keep the tank above half before a heatwave.');
    }
    // ---- waste ----
    {
      add('waste', 'Waste', 100 - 100 * over / Math.max(1, this.bins.length) * 2,
        `${n(100 * (this.wst.recycled + this.wst.collected) / Math.max(1, this.wst.generated))}% of the rubbish made so far has been collected or recycled.`,
        over ? `${over} bins are overflowing: rubbish clogs drains and attracts disease.` : `${this.wst.overflowEvents} overflow events so far.`,
        'Route trucks by bin fullness (sensors) instead of a fixed round.',
        over ? 'Send the next truck to the fullest bin first.' : 'Keep trucks on the current route and check fill sensors.');
    }
    // ---- health ----
    {
      const sick = c.E + c.I, dead = c.D;
      add('health', 'Public health', 100 - 1000 * sick / pop * 0.5 - 400 * dead / pop,
        c.R > 0 ? `${c.R} people have recovered; ${c.V} are protected by vaccine.` : `${n(100 * c.S / pop)}% of people are still susceptible and ${c.H} are in hospital.`,
        c.waiting ? `${c.waiting} seriously ill people are waiting for a bed or ambulance.` : sick > 0.05 * pop ? `${sick} people are exposed or infectious (${n(100 * sick / pop)}%).` : dead ? `${dead} people have died of the disease.` : 'Smog raises serious illness for people who breathe heavy smoke.',
        'Link air quality to hospital admissions and add a clinic in the smoky belt.',
        sick > 0.05 * pop ? 'Close schools or increase testing and isolation now.' : this.aqi > 200 ? 'Tell elders and children to stay indoors and wear masks.' : 'Keep testing and vaccination going.');
    }
    // ---- traffic and safety ----
    {
      const C = this.chal, days = Math.max(0.25, this.clock / TICKS_PER_DAY);
      add('traffic', 'Traffic and safety', 100 - 3 * (st.accidents || 0) / days - 0.4 * (st.redRuns || 0) / days - 6 * (st.fires || 0) / days,
        C.n ? `Cameras issued ${C.n} challans (${C.fines.toLocaleString()} PKR); fined drivers slow down.` : `${st.accidents || 0} accidents so far.`,
        st.redRuns > 5 ? `${st.redRuns} red-light runs and ${st.accidents} accidents.` : this.fog > 0.4 ? 'Fog makes roads dangerous.' : 'Speeding drivers are not yet deterred.',
        'Add speed limits in fog and a repeat-offender fine ladder.',
        p.challanCameras < 4 ? 'Add traffic cameras at the busiest junctions.' : this.fog > 0.4 ? 'Lower the speed limit while it is foggy.' : 'Keep cameras and police at red-light hot spots.');
    }
    // ---- network and sensors ----
    if (Wf) {
      const dashErr = this.dash.aqi != null ? Math.abs(this.dash.aqi - this.aqi) : null;
      add('network', 'Wi-Fi and sensors', Wf.coverage * 0.8 + 100 * Wf.quality * 0.2,
        `${Wf.active} access points online; ${n(100 * Wf.connected / Math.max(1, Wf.devices))}% of phones connected.`,
        Wf.coverage < 30 ? `Only ${n(Wf.coverage)}% of the city has Wi-Fi: sensors in dead zones use weak mobile links.` : dashErr != null && dashErr > 25 ? `The control-room air reading is off by ${n(dashErr)} points.` : 'Access points can fail in a power cut.',
        'Add backup batteries and more access points; flag sensors that disagree.',
        Wf.coverage < 30 ? 'Add access points in the dead zones before an emergency alert is needed.' : 'Keep the access-point batteries charged.');
    }
    // ---- fuel & resources ----
    {
      const Fu = this.fuel, RW = this.realWorldEstimate();
      add('resources', 'Fuel & resources',
        85 - (Fu.litresHour > 20 ? 10 : 0),
        `${n(Fu.litresToday)} L of fuel burned today (${n(Fu.costToday, 0)} PKR); water use ${p.waterPerCapita}% and electricity ${p.electricityUsageMul}% of normal.`,
        p.realCityScale > 1 ? `Scaled to ${RW.population.toLocaleString()} people, this city would need ${RW.waterMLD} million L of water and ${RW.electricityMW} MW of power a day.` : `Fuel spend is ${n(Fu.cost, 0)} PKR since the run started.`,
        'Add electric-bus and EV-charging incentives tied to the fuel price.',
        p.realCityScale > 1 ? 'Use the real-world totals to size pipes, substations and fuel depots before building.' : 'Raise "Real city this represents" to see what a full-size city would need.');
    }
    // ---- chronic & common illness ----
    {
      const Co2 = this.common, Ph2 = this.pharmacy, sickNow = Co2.flu + Co2.cough + Co2.fever + Co2.sore;
      add('illness', 'Chronic & common illness',
        90 - (Ph2.shortages > 5 ? 20 : 0) - (sickNow > 0.1 * pop ? 15 : 0),
        `${Ph2.used} medicine units used, ${Ph2.shortages} shortages.`,
        Ph2.shortages > 0 ? `Pharmacy ran short ${Ph2.shortages} time(s): people with a chronic condition are at extra risk.` : sickNow > 0.08 * pop ? `${sickNow} people have flu, cough or fever right now (${n(100 * sickNow / pop)}%).` : 'Common illness is at a manageable level.',
        'Track chronic patients separately and pre-position medicine before winter.',
        Ph2.stock < 0.2 * p.medicineStock ? 'Increase the medicine restock rate before the stock runs out.' : 'Keep the pharmacy stock above 20%.');
    }
    // ---- services ----
    {
      const open = this.svc.open.length;
      add('services', 'City services', 100 - 4 * open - 10 * this.fires.length,
        this.svc.done ? `${this.svc.done} service requests solved.` : 'No backlog of service requests.',
        this.fires.length ? `${this.fires.length} fire(s) burning.` : open > 5 ? `${open} open requests are waiting for crews.` : 'Crews are free for new problems.',
        'Predict faults from sensors and pre-position crews.', open > 5 ? 'Add maintenance crews.' : 'Keep crews near the busiest blocks.');
    }
    // ---- media ----
    {
      add('media', 'TV news and public awareness', 60 + 40 * this.awareness - (this.aqi > 200 && this.awareness < 0.3 ? 30 : 0),
        `${this.newsSeq} headlines so far; awareness ${n(100 * this.awareness)}%.`,
        this.aqi > 200 && this.awareness < 0.3 ? 'The air is hazardous but few people are aware of it.' : 'News reaches only the share of people who watch it.',
        'Add alerts by phone and radio to reach people who do not watch TV.',
        this.aqi > 200 ? 'Run smog bulletins on every channel and send a phone alert.' : 'Keep headlines short and factual.');
    }
    // ---- venues ----
    {
      const A = this.amuse, K = this.skyStat, C = this.cons;
      add('venues', 'Construction, Sky Tower, Funland', 85 - (C.dust > 150 && this.aqi > 150 ? 20 : 0) - (A.now > 60 && c.I > 0 ? 10 : 0),
        C.done ? 'The new tower is finished.' : `Tower is ${n(C.floors)} of 30 floors; Funland has had ${st.amuseVisits || 0} visitors.`,
        C.working && this.aqi > 150 ? 'Construction dust adds to the smog while the air is already bad.' : A.now > 60 && c.I > 0 ? `Funland has ${A.now} people inside while ${c.I} are infectious.` : `Sky Tower lift wait is ${K.wait || 0} min in rush hours.`,
        'Add dust sensors on site and crowd limits at Funland.',
        C.working && this.aqi > 200 ? 'Stop construction until AQI falls.' : A.now > 60 && c.I > 0 ? 'Limit Funland entries while people are infectious.' : 'Spray water on the site and keep rides closed in storms.');
    }
    const mean = items.reduce((a, b) => a + b.score, 0) / items.length;
    const sorted = [...items].sort((a, b) => a.score - b.score);
    const top = [...items].sort((a, b) => b.score - a.score)[0];
    this.ai = { overall: Math.round(mean), items, worstItems: sorted.slice(0, 3), bestItem: top, kiln: this.kilnAi, tick: this.tick };
    return this.ai;
  }
  /* ----- TV news: events become headlines; watching the news makes people more careful ----- */
  addNews(type, text, sev) {
    const ch = { air: 'Air Watch', weather: 'Weather TV', power: 'City News 24', fire: 'Rescue Live', spread: 'Health Channel', alert: 'Health Channel', road: 'Traffic Watch', season: 'Weather TV', city: 'City News 24', death: 'Health Channel', ai: 'Smart City Live', traffic: 'Traffic Watch', flight: 'Airport Live' }[type] || 'City News 24';
    this.news.unshift({ id: ++this.newsSeq, tick: this.tick, ch, text: text.length > 110 ? text.slice(0, 107) + '...' : text, sev });
    if (this.news.length > 40) this.news.pop();
    this.awareness = Math.min(1, this.awareness + sev * 0.25 * (this.params.mediaReach / 100));
  }
  /* ----- smart traffic cameras: speeding and red-light challans ----- */
  issueChallan(a, kind) {
    const p = this.params, C = this.chal;
    const speed = Math.round(p.speedLimit * (a.speedMul || 1) * (kind === 'speed' ? 1.04 : 1));
    const fine = kind === 'speed' ? 1500 + 100 * Math.max(0, speed - p.speedLimit) : 2500;
    C.n++; C.fines += fine; C[kind === 'speed' ? 'speed' : 'red']++;
    if (a.fined) C.repeat++;
    a.fined = (a.fined || 0) + 1; a.speedMul = Math.max(0.9, (a.speedMul || 1) - 0.035);   // fined drivers slow down a little
    C.list.unshift({ tick: this.tick, plate: 'LEA-' + (1000 + ((a.id * 37) % 9000)), kind, fine, speed });
    if (C.list.length > 8) C.list.pop();
    if (C.n === 1 || C.n % 40 === 0) { this.log('traffic', `Traffic cameras have issued ${C.n} challans (${C.fines.toLocaleString()} PKR)`); this.addNews('traffic', `TRAFFIC: ${C.n} e-challans issued so far`, 0.12); }
  }
  /* ----- AI: forecast the air, advise the operator, and (optionally) act ----- */
  aiHour() {
    const p = this.params, h = this.history.AQI, F = this.fc, n = h.length;
    // forecast the next 6 hours: now + the change seen at the same hours yesterday (or a trend if there is no yesterday)
    const out = [];
    for (let k = 1; k <= 6; k++) {
      let v = this.aqi;
      if (n > 24 + k) v = this.aqi + (h[n - 24 + k - 1] - h[n - 24 - 1]) * 0.8; else if (n > 3) v = this.aqi + (h[n - 1] - h[n - 4]) / 3 * k * 0.6;
      out.push(Math.max(20, Math.round(v)));
    }
    F.aqi = out; F.pend.push({ due: n + 6, v: out[5] });
    while (F.pend.length && F.pend[0].due <= n) { const e = F.pend.shift(); F.err += Math.abs(e.v - h[n - 1]); F.n++; }
    const mx = Math.max(...out), adv = [];
    if (mx > 200) adv.push(['Smog forecast', `AQI may reach ${mx} in 6 hours: send a public alert, stop construction and dispatch kiln inspectors.`, 'smog']);
    if (this.sat.passes && this.sat.blocked && p.satMode !== 'full') adv.push(['Fog is hiding the kilns', 'Switch the satellite to the full multi-sensor mode (radar sees through fog).', 'mode']);
    if (this.sat.passes && this.sat.hot > 0 && !p.autoDispatch) adv.push(['Kilns flagged', `${this.sat.hot} kilns look active: dispatch inspectors (only calls with at least ${p.satGate}% confidence).`, 'dispatch']);
    if (this.en.demand > p.gridCapacity * 0.9) adv.push(['Power peak', 'Demand is near the grid limit: raise demand response or battery reserve.', 'power']);
    if (this.wifi && this.wifi.coverage < 30) adv.push(['Weak Wi-Fi coverage', 'Alerts and sensors rely on mobile links in dead zones: add access points.', 'wifi']);
    if (!adv.length) adv.push(['All clear', 'No action recommended right now.', 'none']);
    F.advice = adv;
    if (p.aiAutopilot) {
      if (mx > 250 && this.flags.aiAlertDay !== this.dayIndex) { this.flags.aiAlertDay = this.dayIndex; F.aiActs++; this.log('ai', 'AI autopilot sent a smog alert to every phone'); this.addNews('ai', 'SMART CITY AI sends smog alert to all phones', 0.4); this.sendAlert(); }
      this.aiHold = mx > 200;
    } else this.aiHold = false;
  }
  initWifi() {
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    const sites = [this.hospital, this.market, this.mart, this.airport, this.mosque, first(this.places.filter((q) => q.type === 'university')), first(this.places.filter((q) => q.type === 'govt')), this.schools[0], this.parks[0], first(this.places.filter((q) => q.type === 'office'))].filter(Boolean);
    this.wifi = {
      aps: sites.map((pl, i) => ({ id: i, name: pl.name, place: pl, x: pl.cx, y: pl.cy, on: true, bat: 1, users: 0, demand: 0, load: 0, quality: 1, offlineUntil: 0, faults: 0 })),
      devices: 0, connected: 0, coverage: 100, quality: 1, demand: 0, capacity: 0, active: 0, alerts: 0, wentHome: 0, reached: 0, downMin: 0,
    };
    this.wifiGrid = [];
    for (let y = 12; y < CITY_H; y += 24) for (let x = 12; x < CITY_W; x += 25) this.wifiGrid.push(x, y);
  }
  hasDevice(a) { return ((a.id * 37) % 100) < (a.age.key === 'child' ? 55 : a.age.key === 'elder' ? 45 : 90); }
  netAt(x, y) {
    const R = this.params.wifiRange; let best = null, bd = R * R;
    for (const ap of this.wifi.aps) { if (!ap.on) continue; const d = (ap.x - x) ** 2 + (ap.y - y) ** 2; if (d <= bd) { bd = d; best = ap; } }
    return best ? best.quality : null;
  }
  failWifi() {
    const p = this.params, r = this.netRng;
    for (const ap of this.wifi.aps) {
      const roll = r.next(), len = 60 + Math.round(r.next() * 180), at = Math.round(r.next() * 1000);
      if (roll < p.wifiFailure / 100) { ap.faultAt = this.tick + at; ap.faultLen = len; } else ap.faultAt = -1;
    }
  }
  updateWifi() {
    const p = this.params, Wf = this.wifi, dt = DT / 60, m = this.minuteNow, n = Math.min(p.wifiAps, Wf.aps.length);
    let cap = 0;
    Wf.aps.forEach((ap, i) => {
      if (ap.faultAt > 0 && this.tick >= ap.faultAt) { ap.offlineUntil = this.tick + ap.faultLen; ap.faultAt = -1; ap.faults++; this.log('network', `Wi-Fi at ${ap.name} went down`); }
      const powered = (ap.place.pw === undefined ? 1 : ap.place.pw) >= 0.5;
      if (powered) ap.bat = Math.min(1, ap.bat + dt / 2); else ap.bat = p.wifiBattery > 0 ? Math.max(0, ap.bat - dt / p.wifiBattery) : 0;
      const was = ap.on;
      ap.on = i < n && this.tick >= ap.offlineUntil && (powered || ap.bat > 0);
      if (was && !ap.on && i < n && this.tick >= ap.offlineUntil && !powered) this.log('network', `Wi-Fi at ${ap.name} ran out of battery: no power`);
      ap.users = 0; ap.demand = 0;
      if (ap.on) cap += p.wifiCapacity;
    });
    const mbps = (m >= 1200 && m < 1380 ? 1.9 : m >= 420 && m < 1140 ? 1.2 : m < 360 ? 0.3 : 0.9);
    let devices = 0, connected = 0;
    for (const a of this.agents) {
      if (a.state === 'D' || a.away || a.mode === 'heli') continue;
      if (!this.hasDevice(a)) continue;
      devices++;
      const ap = this._apFor(a.x, a.y);
      if (ap) { ap.users++; connected++; }
    }
    let qSum = 0, active = 0, dem = 0;
    for (const ap of Wf.aps) {
      ap.demand = ap.users * mbps; ap.load = ap.on ? ap.demand / p.wifiCapacity : 0;
      ap.quality = ap.on ? (ap.load <= 1 ? 1 : 1 / ap.load) : 0;
      if (ap.on) { active++; qSum += ap.quality * ap.users; dem += ap.demand; }
    }
    Wf.devices = devices; Wf.connected = connected; Wf.demand = dem; Wf.capacity = cap; Wf.active = active;
    Wf.quality = connected ? qSum / connected : 1;
    let cov = 0, tot = 0;
    const g = this.wifiGrid;
    for (let i = 0; i < g.length; i += 2) { tot++; if (this._apFor(g[i], g[i + 1])) cov++; }
    Wf.coverage = tot ? (100 * cov) / tot : 0;
    if (active < n) Wf.downMin += DT;
  }
  _apFor(x, y) {
    const R = this.params.wifiRange; let best = null, bd = R * R;
    for (const ap of this.wifi.aps) { if (!ap.on) continue; const d = (ap.x - x) ** 2 + (ap.y - y) ** 2; if (d <= bd) { bd = d; best = ap; } }
    return best;
  }
  /* the city sends an emergency alert to every phone: some people go home */
  sendAlert() {
    const p = this.params, r = this.netRng;
    let reached = 0, home = 0;
    for (const a of this.agents) {
      if (!a.alive || a.away || !this.hasDevice(a)) continue;
      reached++;
      const out = (a.mode === 'inside' && a.place && a.place.type !== 'home') || a.mode === 'walk';
      if (!out || a.busy || !r.chance(p.alertCompliance / 100)) continue;
      a.plan = [{ t: this.minuteNow, place: a.home, label: 'Went home after the city alert', stay: 240 }]; a.planIdx = 0; a.stayUntil = 0; home++;
    }
    this.wifi.alerts++; this.wifi.wentHome += home; this.wifi.reached += reached;
    this.log('alert', `Emergency alert sent to ${reached} phones: ${home} people went home`);
    return `Alert reached ${reached} people, ${home} went home`;
  }
  /* ---- fires: engines, smoke, injuries ---- */
  startFire(place, sev) {
    const p = this.params, rng = this.rng;
    sev = Math.max(1, Math.min(5, Math.round(sev || rng.int(1, 3))));
    if (this.fires.some((f) => f.place === place)) return null;
    const f = { id: ++this.fireSeq, place, sev, t0: this.tick, left: 50 + 35 * sev, x: place.cx, y: place.cy, engines: 0, rigs: [], escal: 0 };
    this.fires.push(f);
    this.stats.fires = (this.stats.fires || 0) + 1;
    place.firedUntil = this.tick + f.left + 240 * sev;
    let hurt = 0;
    const fled = [];
    for (const a of this.agents) {
      if (!a.alive || a.place !== place || a.mode !== 'inside') continue;
      if (a.mode === 'bed') continue;
      if (rng.chance(Math.min(0.5, 0.05 * sev))) {
        this.stats.fireInjured = (this.stats.fireInjured || 0) + 1; hurt++;
        this.injure(a, rng.range(3, 9));
        if (rng.chance(0.03 * sev)) { this.killFire(a); }
      } else fled.push(a);
    }
    for (const a of fled) {
      a.plan = []; a.planIdx = 0; a.stayUntil = 0;
      a.travelTo(place.type === 'home' ? this.parkNear(a.home) : a.home, this, place.type === 'home' ? 'Fled the burning house' : 'Evacuated, going home');
      a.stress = Math.min(1, a.stress + 0.3);
    }
    this.log('fire', `Fire at ${place.type === 'home' ? place.name : place.name}${sev >= 3 ? ' (severe)' : ''}: ${fled.length + hurt} people got out${hurt ? `, ${hurt} injured` : ''}. Fire brigade called`);
    // dispatch fire engines
    const idle = this.rigs.filter((r) => r.kind === 'fire' && r.idle && !r.retire).slice(0, sev >= 3 ? 2 : 1);
    for (const r of idle) {
      r.job = f; f.rigs.push(r); r.siren = true;
      r.go(this.drivePath(this.fire.access, place.access), 9999, null, 'fighting');
      r.legs[0].arrive = { op: 'engine', fire: f };
      r.go(this.drivePath(place.access, this.fire.access), 0, { op: 'fireBack' }, 'returning');
    }
    return f;
  }
  killFire(a) {
    this.stats.fireDeaths = (this.stats.fireDeaths || 0) + 1;
    if (a.hospitalized) this.freeBed(a);
    if (a.state === 'E' || a.state === 'I') this.finishedInfections.push({ tick: this.tick, secondary: a.secondary });
    a.state = 'D'; a.deathCause = 'fire'; a.diedAtTick = this.tick; a.diedWhere = 'fire'; a.mode = 'dead'; a.activity = 'Died in a fire';
    a.plan = []; a.needsAmbulance = false; a.injured = false; a.isolated = false; a.ctx = -1;
    for (const m of a.household.members) if (m !== a && m.alive) m.stress = Math.min(1, m.stress + 0.35);
    this.scheduleFuneral(a);
  }
  updateFires() {
    if (!this.fires.length) return;
    for (const f of this.fires) {
      f.left -= f.engines ? 1 + 2 * f.engines : 0.5;
      if (!f.engines && this.tick - f.t0 > 40 && (this.tick - f.t0) % 40 === 0 && f.sev < 5) { f.sev++; f.left += 20; }
      if (this.tick % 10 === 0) this.extraEm.push({ x: f.x, y: f.y, e: 260 * f.sev });
      if (f.left <= 0) {
        f.out = true;
        for (const r of f.rigs) r.wait = 0;
        this.log('fire', `Fire at ${f.place.name} is out after ${this.tick - f.t0} minutes${f.engines ? '' : ' (no engine arrived)'}`);
      }
    }
    this.fires = this.fires.filter((f) => !f.out);
  }

  /* ---- sensors: actual state -> measurement -> received observation -> dashboard value ---- */
  sampleSensors() {
    const p = this.params;
    if (this.tick % Math.max(10, p.sensorInterval) !== 0) return;     // sensors report on the 10-minute updates
    for (const s of this.sensors) {
      const online = this.tick >= s.offlineUntil && s.battery > 0;
      s.online = online;
      let actual;
      if (s.kind === 'air') actual = this.pm25At(s.x, s.y);
      else if (s.kind === 'power') actual = this.en.demand;
      else actual = this.wa.demand;
      s.actual = actual;
      if (!online) continue;
      const noise = s.kind === 'air' ? this.rng.normal(0, (p.sensorNoise / 100) * actual) : this.rng.normal(0, (p.sensorNoise / 100) * actual * 0.5);
      const meas = Math.max(0, actual + noise + s.calib * (s.kind === 'air' ? 1 : 0));
      s.measured = meas; s.sent++;
      const net = this.netAt(s.x, s.y);          // Wi-Fi if covered, otherwise a weaker mobile link
      if (this.rng.chance(1 - (1 - p.sensorDrop / 100) * (net == null ? 0.95 : 0.85 + 0.15 * net))) { s.dropped++; if (net == null) s.viaMobile = (s.viaMobile || 0) + 1; continue; }
      s.buf.push({ ready: this.tick + p.sensorLatency, t: this.tick, v: meas });
    }
  }
  deliverSensors() {
    const p = this.params, powerOk = this.en.ratio.critical >= 0.5;
    for (const s of this.sensors) {
      while (s.buf.length && s.buf[0].ready <= this.tick) { const r = s.buf.shift(); s.received = r; s.rxTick = r.t; }
      // battery backup: sensors keep working for a few hours without power
      if (!powerOk) s.battery = Math.max(0, s.battery - 1 / 240); else s.battery = Math.min(1, s.battery + 1 / 120);
    }
    if (this.tick % 10 === 0) {
      for (const s of this.sensors) if (s.kind === 'air') {
        const near = this._cars.reduce((n, c) => n + (Math.abs(c.x - s.x) < 60 && Math.abs(c.y - s.y) < 60 ? 1 : 0), 0);
        s.dB = 38 + 7 * Math.log10(1 + near * 2) + (s.name === 'Airport' ? 14 : 0);
      }
      // the control room: average of the fresh air readings (an AQI the operators and the smog rule can see)
      const stale = 2 * Math.max(p.sensorInterval, 10) + p.sensorLatency + 12;
      let sum = 0, n = 0;
      for (const s of this.sensors) if (s.kind === 'air' && s.received && this.tick - s.rxTick <= stale) { sum += s.received.v; n++; }
      const D = this.dash;
      D.fresh = n; D.pm = n ? sum / n : null; D.aqi = n ? aqiFromPm(D.pm) : null;
      if (n) { D.sum += D.aqi; D.n++; }
      const km = this.sensors.find((s) => s.kind === 'power'), wm = this.sensors.find((s) => s.kind === 'water');
      D.kw = km && km.received && this.tick - km.rxTick <= stale ? km.received.v : null;
      D.water = wm && wm.received && this.tick - wm.rxTick <= stale ? wm.received.v : null;
    }
  }
  failSensors() {
    const p = this.params, rng = this.rng;
    for (const s of this.sensors) {
      s.calib += s.kind === 'air' ? rng.normal(0, 0.8) : 0;
      if (this.tick >= s.offlineUntil && rng.chance(p.sensorFailure / 100)) {
        s.offlineUntil = Infinity;
        s.req = this.openRequest('sensor', roadAccess(s.x, s.y), { ref: s });
        this.log('sensor', `Sensor "${s.name}" stopped working. Its readings are missing in the control room`);
      }
    }
  }

  /* ---- incidents the user (or chance) starts ---- */
  inject(type, o) {
    o = o || {};
    const sev = Math.max(1, Math.min(5, Math.round(o.sev || 3))), minutes = o.minutes || 0;
    const near = (x, y, types) => {
      let best = null, bd = Infinity;
      for (const pl of this.places) {
        if (types && !types.includes(pl.type)) continue;
        const d = (pl.cx - x) ** 2 + (pl.cy - y) ** 2;
        if (d < bd) { bd = d; best = pl; }
      }
      return best;
    };
    const x = o.x != null ? o.x : this.rng.range(80, CITY_W - 80), y = o.y != null ? o.y : this.rng.range(80, CITY_H - 80);
    if (type === 'fire') {
      const pl = near(x, y);
      const f = this.startFire(pl, sev);
      if (!f) return 'There is already a fire there';
      this.log('user', `You started a fire (severity ${sev}) at ${pl.name}`);
      return `Fire at ${pl.name}`;
    }
    if (type === 'crash') {
      const list = this.agents.filter((a) => (a.mode === 'drive' || a.mode === 'walk') && a.crashWait <= 0).sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2)).slice(0, Math.min(3, sev));
      if (!list.length) return 'Nobody is travelling right now: no crash possible';
      this.crash(list, list.length > 1 ? 'collision' : 'single', list[0].x, list[0].y);
      this.log('user', `You caused a road crash (${list.length} ${list.length === 1 ? 'person' : 'people'})`);
      return 'Road crash';
    }
    if (type === 'burst') { this.startBurst(x, y, 0.4 + 0.4 * sev, minutes); this.log('user', `You burst a water main (severity ${sev})`); return 'Water main burst'; }
    if (type === 'fault') { const bl = near(x, y).block; const f = this.startFault(bl, minutes); this.log('user', 'You caused a transformer fault'); return f ? 'Transformer fault' : 'That block already has a fault'; }
    if (type === 'outage') { this.en.outageUntil = this.tick + (minutes || 180); this.log('power', `Grid outage for ${Math.round((minutes || 180) / 60 * 10) / 10} hours (started by you)`); this.log('user', 'You switched off the grid'); return 'Grid outage'; }
    if (type === 'sensor') { const s = this.sensors.filter((q) => q.online)[0]; if (!s) return 'All sensors are already offline'; s.offlineUntil = minutes ? this.tick + minutes : Infinity; this.log('sensor', `Sensor "${s.name}" was switched off by you`); return 'Sensor off'; }
    if (type === 'wifi') { let best = null, bd = Infinity; for (const ap of this.wifi.aps) { if (!ap.on) continue; const d = (ap.x - x) ** 2 + (ap.y - y) ** 2; if (d < bd) { bd = d; best = ap; } } if (!best) return 'All access points are already down'; best.offlineUntil = this.tick + (minutes || 180); this.log('network', `Wi-Fi at ${best.name} was switched off by you`); return `Wi-Fi down at ${best.name}`; }
    if (type === 'flood') { this.flood = Math.min(1, this.flood + 0.2 * sev); this.log('weather', 'Flood water on the roads (started by you)'); return 'Flood'; }
    return 'Unknown incident';
  }

  /* manual override of one agent (the control room's "operator" tools). Everything is logged and can be undone with 'enable'. */
  manual(a, action) {
    if (!a || !a.alive) return 'That person is not alive';
    if (action === 'disable') { if (a.mode === 'drive' || a.mode === 'bus' || a.mode === 'ambulance' || a.mode === 'heli') return 'Wait until they have arrived (they are travelling)'; a.override = 'disabled'; this.log('user', `Manual override: Person #${a.id} switched off (frozen in place)`); return 'Person frozen'; }
    if (action === 'enable') { a.override = null; this.log('user', `Manual override: Person #${a.id} switched back on`); return 'Person active again'; }
    if (action === 'home') {
      if (a.override === 'disabled') a.override = null;
      if (a.busy || a.mode === 'drive' || a.mode === 'bus' || a.mode === 'ambulance' || a.mode === 'heli') return 'Cannot send them home right now (travelling, in care or away)';
      a.plan = [{ t: this.minuteNow, place: a.home, label: 'Sent home (manual override)', stay: 240 }]; a.planIdx = 0; a.stayUntil = 0;
      this.log('user', `Manual override: Person #${a.id} sent home`); return 'Sent home';
    }
    if (action === 'isolate') { if (a.isolated) return 'Already isolated'; this.isolate(a); this.log('user', `Manual override: Person #${a.id} isolated`); return 'Isolated'; }
    return 'Unknown action';
  }
  userInfect(a) {
    if (!a || !a.alive || a.state === 'E' || a.state === 'I' || a.away) return false;
    this.finished = false;
    this.infect(a, null, true);
    this.log('user', `You infected Person #${a.id}`);
    return true;
  }
  userVaccinate(a) {
    if (!a || !a.alive || a.vaccinated) return false;
    a.vaccinated = true;
    this.log('user', `You vaccinated Person #${a.id}`);
    return true;
  }
}

/* ---------- what-if copies ----------
   fork() returns an independent copy of the whole world (people, cars, air,
   grid, random-number state ...) so an agent can try "what happens in the
   next hours if we do X" without touching the real city. Shared, never
   changing layout objects (bus routes, sites, tables) are kept by reference. */
let STATIC_SET = null;
function staticSet() {
  if (STATIC_SET) return STATIC_SET;
  STATIC_SET = new Set();
  const roots = [BUS_ROUTES, WASTE_ACCESS, KILN_SITES, SEASONS, PRAYERS, FUNERAL, WASTE_YARD, WATER_PLANT, SUBSTATION, SOLAR_FARM, AIRPORT_FENCE, RUNWAY, APRON, TERMINAL, GATES, LINKS,
    CITY_PLAN, PLACE_NAMES, PLACE_RISK, PLACE_GROUP, GROUP_LABELS, SMOKE_SPOT_TYPES, AGE_GROUPS, STATE_NAMES, DEFAULT_PARAMS, FL, AIRLINES, CITIES, POLICE_ORDER, POWER_CLASS, PLACE_KW, PLACE_REF,
    WASTE_KG, WASTE_BASE, WATER_M3, REQUEST_TYPES, ROAD_X, ROAD_Y, MW_LANE, DAY_NAMES];
  const st = roots.slice();
  while (st.length) { const x = st.pop(); if (!x || typeof x !== 'object' || STATIC_SET.has(x)) continue; STATIC_SET.add(x); for (const k of Object.keys(x)) st.push(x[k]); }
  return STATIC_SET;
}
World.prototype.fork = function () {
  const S = staticSet(), seen = new Map();
  const go = (o) => {
    if (o === null || typeof o !== 'object') { if (typeof o === 'function') throw new Error('world state holds a function: cannot copy'); return o; }
    if (S.has(o)) return o;
    const hit = seen.get(o); if (hit) return hit;
    let c;
    if (Array.isArray(o)) { c = new Array(o.length); seen.set(o, c); for (let i = 0; i < o.length; i++) c[i] = go(o[i]); return c; }
    if (ArrayBuffer.isView(o)) { c = o.slice(); seen.set(o, c); return c; }
    if (o instanceof Map) { c = new Map(); seen.set(o, c); for (const [k, v] of o) c.set(go(k), go(v)); return c; }
    if (o instanceof Set) { c = new Set(); seen.set(o, c); for (const v of o) c.add(go(v)); return c; }
    c = Object.create(Object.getPrototypeOf(o)); seen.set(o, c);
    for (const k of Object.keys(o)) c[k] = go(o[k]);
    return c;
  };
  // listeners belong to the page showing the real city: the copy gets none, so it can never talk to the page
  const L = this.listeners; let w;
  this.listeners = null;
  try { w = go(this); } finally { this.listeners = L; }
  w.listeners = {}; if (L && typeof L === 'object') for (const k of Object.keys(L)) w.listeners[k] = [];
  w.isFork = true; return w;
};

if (typeof module !== 'undefined') {
  module.exports = {
    World, Agent, Ambulance, POWER_CLASS, PLACE_KW, WASTE_ACCESS, TRUCK_CAP, REQUEST_TYPES, LAMPS, FEEDERS, DT, Helicopter, Vehicle, Bus, Rig, Random, BUS_ROUTES, PRAYERS, FUNERAL, WASTE_YARD, WATER_PLANT, SUBSTATION, SOLAR_FARM, PLACE_NAMES, PLACE_RISK, SpatialGrid, DEFAULT_PARAMS, SEASONS, TICKS_PER_DAY, TICKS_PER_HOUR, START_MINUTE, WORLD_W, WORLD_H, CITY_W, CITY_H,
    BLOCK, COLS, ROWS, ROAD_X, ROAD_Y, MAIN_X, MAIN_Y, CITY_PLAN, AGE_GROUPS, STATE_NAMES, PLACE_GROUP, GROUP_LABELS, DAY_NAMES,
    roadHalf, blockRect, centreRoute, offsetRoute, makeAccess, roadAccess, aqiFromPm, aqiCategory, flightPose, FL,
    RUNWAY, TAXI_Y, APRON, TERMINAL, GATES, GATE_Y, MW_Y, MW_HALF, MW_LANE, LINKS, KILN_SITES, AIRPORT_ROAD_END, AIRPORT_FENCE, SIG_CYCLE, PCELL, PCOLS, PROWS,
  };
}
if (typeof module !== 'undefined' && module.exports) require('./econ.js')(module.exports);

