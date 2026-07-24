'use strict';
const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');

const SERVICE_NAME = process.env.SERVICE_NAME || 'currency-service';
const PORT = Number(process.env.PORT || 3000);

// All logs are structured JSON on stdout (12-factor), ready for
// Fluent Bit / Loki / ELK collection from the container runtime.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: SERVICE_NAME, version: process.env.SERVICE_VERSION || '1.0.0' },
  formatters: { level: (label) => ({ level: label }) }
});

const app = express();
app.use(express.json());
app.use(pinoHttp({
  logger,
  customProps: (req) => ({ requestId: req.headers['x-request-id'] || undefined })
}));

// --- Kubernetes probes -------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/ready', (req, res) => res.json({
  ready: true,
  service: SERVICE_NAME,
  rates: { source: liveState.source, fetchedAt: liveState.fetchedAt, lastError: liveState.lastError }
}));

// --- Currency conversion -----------------------------------------------
// Rates are units per 1 EUR (the shop's base currency). Metadata (name,
// symbol, decimals) is static; the numeric `rate` is refreshed live from
// an external FX provider on a timer and cached in memory. The numbers
// below are only the last-resort fallback used if the provider has never
// been reachable (e.g. first boot with no network).
const BASE = 'EUR';
const CURRENCIES = {
  EUR: { name: 'Euro',                  symbol: '€',    rate: 1,       decimals: 2 },
  USD: { name: 'US Dollar',             symbol: '$',    rate: 1.09,    decimals: 2 },
  GBP: { name: 'British Pound',         symbol: '£',    rate: 0.85,    decimals: 2 },
  INR: { name: 'Indian Rupee',          symbol: '₹',    rate: 94.7,    decimals: 2 },
  AED: { name: 'UAE Dirham',            symbol: 'د.إ',  rate: 4.0,     decimals: 2 },
  CNY: { name: 'Chinese Yuan',          symbol: '¥',    rate: 7.85,    decimals: 2 },
  JPY: { name: 'Japanese Yen',          symbol: '¥',    rate: 168.4,   decimals: 0 },
  AUD: { name: 'Australian Dollar',     symbol: 'A$',   rate: 1.64,    decimals: 2 },
  CAD: { name: 'Canadian Dollar',       symbol: 'C$',   rate: 1.49,    decimals: 2 },
  CHF: { name: 'Swiss Franc',           symbol: 'CHF',  rate: 0.95,    decimals: 2 },
  SGD: { name: 'Singapore Dollar',      symbol: 'S$',   rate: 1.46,    decimals: 2 },
  HKD: { name: 'Hong Kong Dollar',      symbol: 'HK$',  rate: 8.5,     decimals: 2 },
  NZD: { name: 'New Zealand Dollar',    symbol: 'NZ$',  rate: 1.78,    decimals: 2 },
  KRW: { name: 'South Korean Won',      symbol: '₩',    rate: 1487,    decimals: 0 },
  TWD: { name: 'New Taiwan Dollar',     symbol: 'NT$',  rate: 35.1,    decimals: 2 },
  THB: { name: 'Thai Baht',             symbol: '฿',    rate: 39.5,    decimals: 2 },
  MYR: { name: 'Malaysian Ringgit',     symbol: 'RM',   rate: 5.1,     decimals: 2 },
  IDR: { name: 'Indonesian Rupiah',     symbol: 'Rp',   rate: 17650,   decimals: 0 },
  PHP: { name: 'Philippine Peso',       symbol: '₱',    rate: 63.4,    decimals: 2 },
  VND: { name: 'Vietnamese Dong',       symbol: '₫',    rate: 27600,   decimals: 0 },
  BDT: { name: 'Bangladeshi Taka',      symbol: '৳',    rate: 128.5,   decimals: 2 },
  PKR: { name: 'Pakistani Rupee',       symbol: '₨',    rate: 303,     decimals: 2 },
  LKR: { name: 'Sri Lankan Rupee',      symbol: 'Rs',   rate: 328,     decimals: 2 },
  SAR: { name: 'Saudi Riyal',           symbol: '﷼',    rate: 4.09,    decimals: 2 },
  QAR: { name: 'Qatari Riyal',          symbol: 'ر.ق',  rate: 3.97,    decimals: 2 },
  KWD: { name: 'Kuwaiti Dinar',         symbol: 'د.ك',  rate: 0.335,   decimals: 3 },
  BHD: { name: 'Bahraini Dinar',        symbol: '.د.ب', rate: 0.41,    decimals: 3 },
  OMR: { name: 'Omani Rial',            symbol: 'ر.ع.', rate: 0.42,    decimals: 3 },
  ILS: { name: 'Israeli New Shekel',    symbol: '₪',    rate: 4.05,    decimals: 2 },
  TRY: { name: 'Turkish Lira',          symbol: '₺',    rate: 35.2,    decimals: 2 },
  EGP: { name: 'Egyptian Pound',        symbol: 'E£',   rate: 52.6,    decimals: 2 },
  NGN: { name: 'Nigerian Naira',        symbol: '₦',    rate: 1710,    decimals: 2 },
  ZAR: { name: 'South African Rand',    symbol: 'R',    rate: 19.9,    decimals: 2 },
  KES: { name: 'Kenyan Shilling',       symbol: 'KSh',  rate: 141,     decimals: 2 },
  MAD: { name: 'Moroccan Dirham',       symbol: 'DH',   rate: 10.9,    decimals: 2 },
  BRL: { name: 'Brazilian Real',        symbol: 'R$',   rate: 5.95,    decimals: 2 },
  MXN: { name: 'Mexican Peso',          symbol: 'Mex$', rate: 19.8,    decimals: 2 },
  ARS: { name: 'Argentine Peso',        symbol: 'AR$',  rate: 1290,    decimals: 2 },
  CLP: { name: 'Chilean Peso',          symbol: 'CL$',  rate: 1015,    decimals: 0 },
  SEK: { name: 'Swedish Krona',         symbol: 'kr',   rate: 11.3,    decimals: 2 },
  NOK: { name: 'Norwegian Krone',       symbol: 'kr',   rate: 11.6,    decimals: 2 },
  DKK: { name: 'Danish Krone',          symbol: 'kr',   rate: 7.46,    decimals: 2 },
  PLN: { name: 'Polish Zloty',          symbol: 'zł',   rate: 4.28,    decimals: 2 },
  CZK: { name: 'Czech Koruna',          symbol: 'Kč',   rate: 25.1,    decimals: 2 },
  HUF: { name: 'Hungarian Forint',      symbol: 'Ft',   rate: 395,     decimals: 0 },
  RON: { name: 'Romanian Leu',          symbol: 'lei',  rate: 4.97,    decimals: 2 },
  RUB: { name: 'Russian Ruble',         symbol: '₽',    rate: 96.5,    decimals: 2 }
};

// Seed the live-rate cache with the fallback numbers above so the service
// is always able to answer, even before the first successful fetch.
const FALLBACK_RATES = Object.fromEntries(Object.entries(CURRENCIES).map(([c, v]) => [c, v.rate]));

// --- Live FX provider ----------------------------------------------------
// CURRENCY_API_PROVIDER selects the adapter:
//   'open-er-api'      (default) — https://www.exchangerate-api.com/docs/open, no key required
//   'exchangerate-api' — https://www.exchangerate-api.com (v6), requires CURRENCY_API_KEY
//   'frankfurter'       — https://frankfurter.dev (ECB rates), no key, fewer currencies
const PROVIDER = process.env.CURRENCY_API_PROVIDER || 'open-er-api';
const API_KEY = process.env.CURRENCY_API_KEY || '';
const REFRESH_MS = Number(process.env.CURRENCY_REFRESH_MS || 60 * 60 * 1000); // default hourly
const FETCH_TIMEOUT_MS = Number(process.env.CURRENCY_FETCH_TIMEOUT_MS || 8000);

function providerUrl() {
  switch (PROVIDER) {
    case 'exchangerate-api':
      return `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE}`;
    case 'frankfurter':
      return `https://api.frankfurter.dev/v1/latest?base=${BASE}`;
    case 'open-er-api':
    default:
      return `https://open.er-api.com/v6/latest/${BASE}`;
  }
}

function extractRates(provider, json) {
  if (provider === 'exchangerate-api') {
    if (json.result !== 'success') throw new Error(json['error-type'] || 'provider error');
    return json.conversion_rates;
  }
  if (provider === 'frankfurter') {
    return { ...json.rates, EUR: 1 }; // frankfurter omits the base currency itself
  }
  // open-er-api
  if (json.result !== 'success') throw new Error(json['error-type'] || 'provider error');
  return json.rates;
}

const liveState = {
  rates: { ...FALLBACK_RATES },
  source: 'fallback',
  fetchedAt: null,       // when we last *successfully* fetched
  providerAsOf: null,    // timestamp the provider says the rates are from
  lastError: null
};

async function fetchLiveRates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(providerUrl(), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const fetched = extractRates(PROVIDER, json);

    // Only accept currencies we actually know about; currencies the
    // provider doesn't cover keep their last known rate.
    const merged = { ...liveState.rates };
    let updatedCount = 0;
    for (const code of Object.keys(CURRENCIES)) {
      if (typeof fetched[code] === 'number' && Number.isFinite(fetched[code])) {
        merged[code] = fetched[code];
        updatedCount++;
      }
    }

    liveState.rates = merged;
    liveState.source = PROVIDER;
    liveState.fetchedAt = new Date().toISOString();
    liveState.providerAsOf = json.time_last_update_utc || json.date || null;
    liveState.lastError = null;
    logger.info({ event: 'currency_rates_refreshed', provider: PROVIDER, updatedCount }, 'live FX rates refreshed');
  } catch (err) {
    liveState.lastError = err.message;
    logger.warn({ event: 'currency_rates_refresh_failed', provider: PROVIDER, message: err.message },
      'failed to refresh live FX rates, continuing with last known rates');
  } finally {
    clearTimeout(timeout);
  }
}

const normalize = (code) => String(code || '').trim().toUpperCase();
const known = (code) => Object.prototype.hasOwnProperty.call(CURRENCIES, code);
const rateOf = (code) => liveState.rates[code];

function convert(amount, from, to) {
  // amount/from-rate = EUR value; EUR value * to-rate = target value
  const inEur = amount / rateOf(from);
  const raw = inEur * rateOf(to);
  const d = CURRENCIES[to].decimals;
  return Number(raw.toFixed(d));
}

// GET /currencies — full list with symbols and live EUR rates
app.get(['/currency', '/currency/currencies'], (req, res) => {
  res.json({
    base: BASE,
    source: liveState.source,
    fetchedAt: liveState.fetchedAt,
    providerAsOf: liveState.providerAsOf,
    stale: liveState.source === 'fallback',
    currencies: Object.entries(CURRENCIES).map(([code, c]) => ({
      code, name: c.name, symbol: c.symbol, decimals: c.decimals, ratePerEur: rateOf(code)
    }))
  });
});

// GET /rates?base=USD — rate table rebased onto any currency
app.get('/currency/rates', (req, res) => {
  const base = normalize(req.query.base || BASE);
  if (!known(base)) return res.status(400).json({ error: `Unknown base currency "${base}"`, supported: Object.keys(CURRENCIES) });
  const rates = {};
  for (const code of Object.keys(CURRENCIES)) rates[code] = convert(1, base, code);
  res.json({
    base,
    source: liveState.source,
    fetchedAt: liveState.fetchedAt,
    providerAsOf: liveState.providerAsOf,
    stale: liveState.source === 'fallback',
    rates
  });
});

// POST /currency/refresh — force an immediate re-fetch from the live provider
app.post('/currency/refresh', async (req, res) => {
  await fetchLiveRates();
  res.json({
    source: liveState.source,
    fetchedAt: liveState.fetchedAt,
    providerAsOf: liveState.providerAsOf,
    lastError: liveState.lastError
  });
});

// GET /convert?amount=10&from=EUR&to=INR  (also accepts POST with a JSON body)
function handleConvert(req, res) {
  const src = req.method === 'POST' ? (req.body || {}) : req.query;
  const amount = Number(src.amount);
  const from = normalize(src.from || BASE);
  const to = normalize(src.to);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'A non-negative numeric "amount" is required' });
  if (!known(from)) return res.status(400).json({ error: `Unknown "from" currency "${from}"`, supported: Object.keys(CURRENCIES) });
  if (!to) return res.status(400).json({ error: 'A "to" currency is required' });
  if (!known(to)) return res.status(400).json({ error: `Unknown "to" currency "${to}"`, supported: Object.keys(CURRENCIES) });
  const result = convert(amount, from, to);
  req.log.info({ event: 'currency_converted', from, to, amount, result }, 'conversion performed');
  res.json({
    from, to, amount, result,
    rate: convert(1, from, to),
    symbol: CURRENCIES[to].symbol,
    formatted: `${CURRENCIES[to].symbol}${result.toLocaleString('en-US', { minimumFractionDigits: CURRENCIES[to].decimals, maximumFractionDigits: CURRENCIES[to].decimals })}`,
    source: liveState.source,
    stale: liveState.source === 'fallback',
    providerAsOf: liveState.providerAsOf,
    asOf: new Date().toISOString()
  });
}
app.get('/currency/convert', handleConvert);
app.post('/currency/convert', handleConvert);

// --- 404 + error handling ----------------------------------------------
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  req.log.error({ event: 'unhandled_error', message: err.message }, 'request failed');
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => logger.info({ event: 'service_started', port: PORT, provider: PROVIDER, refreshMs: REFRESH_MS }, `${SERVICE_NAME} listening`));

// Fetch live rates immediately on boot, then keep them fresh on a timer.
fetchLiveRates();
const refreshTimer = setInterval(fetchLiveRates, REFRESH_MS);
refreshTimer.unref();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ event: 'shutdown', signal }, 'shutting down gracefully');
    clearInterval(refreshTimer);
    server.close(() => process.exit(0));
  });
}
