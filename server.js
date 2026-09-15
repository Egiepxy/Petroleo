const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const MEXC = 'https://contract.mexc.com';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_SYMBOL = 'BZ=F';

app.disable('x-powered-by');

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'SetupEgiP V42',
    history: 'MEXC por ativo; Brent BZ=F somente para OIL',
    time: new Date().toISOString()
  });
});

const allowedIntervals = new Set([
  'Min15',
  'Min60',
  'Hour4',
  'Day1'
]);

async function fetchText(url, headers = {}, timeout = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    const r = await fetch(url, {
      headers,
      signal: ctrl.signal
    });

    const text = await r.text();

    return {
      ok: r.ok,
      status: r.status,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

function yahooConfig(tf) {
  if (tf === 'Min15') {
    return { range: '60d', interval: '15m' };
  }

  if (tf === 'Min60') {
    return { range: '6mo', interval: '1h' };
  }

  if (tf === 'Hour4') {
    return { range: '6mo', interval: '1h' };
  }

  return { range: '2y', interval: '1d' };
}

function aggregate4h(rows) {
  const buckets = new Map();

  for (const r of rows) {
    const bucket = Math.floor(r.t / 14400) * 14400;

    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        t: bucket,
        o: r.o,
        h: r.h,
        l: r.l,
        c: r.c,
        v: r.v
      });
    } else {
      const b = buckets.get(bucket);

      b.h = Math.max(b.h, r.h);
      b.l = Math.min(b.l, r.l);
      b.c = r.c;
      b.v += (r.v || 0);
    }
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t);
}
