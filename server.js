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
function toMexcShape(rows) {
  return {
    time: rows.map(x => x.t),
    open: rows.map(x => x.o),
    high: rows.map(x => x.h),
    low: rows.map(x => x.l),
    close: rows.map(x => x.c),
    vol: rows.map(x => x.v || 0)
  };
}

async function yahooHistory(tf) {
  const cfg = yahooConfig(tf);

  const url = YAHOO + '/' + encodeURIComponent(YAHOO_SYMBOL) + '?range=' + cfg.range + '&interval=' + cfg.interval + '&includePrePost=false&events=history';

  const out = await fetchText(
    url,
    {
      'accept': 'application/json',
      'user-agent':
        'Mozilla/5.0 (compatible; SetupEgiP/42)'
    }
  );

 if (!out.ok) {
  throw new Error('Yahoo HTTP ' + out.status);
}

  let j;

  try {
    j = JSON.parse(out.text);
  } catch (e) {
    throw new Error('Resposta histórica inválida');
  }

  const result = j?.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};

  const rows = [];

  for (let i = 0; i < ts.length; i++) {
    const o = Number(q.open?.[i]);
    const h = Number(q.high?.[i]);
    const l = Number(q.low?.[i]);
    const c = Number(q.close?.[i]);
    const v = Number(q.volume?.[i] || 0);

    if (
      !Number.isFinite(o) ||
      !Number.isFinite(h) ||
      !Number.isFinite(l) ||
      !Number.isFinite(c)
    ) {
      continue;
    }

    rows.push({
      t: Number(ts[i]),
      o,
      h,
      l,
      c,
      v: Number.isFinite(v) ? v : 0
    });
  }

  const finalRows =
    tf === 'Hour4'
      ? aggregate4h(rows)
      : rows;

 if (finalRows.length < 210) {
  throw new Error(
    'A contingência forneceu apenas ' +
    finalRows.length +
    ' candles'
  );
}

  return finalRows.slice(-700);
}

/* ==============================================
   HISTÓRICO — V42
   ISOLAMENTO TOTAL POR ATIVO
   ============================================== */

app.get('/api/kline', async (req, res) => {

  const symbol = String(
    req.query.symbol || 'UKOIL_USDT'
  )
    .trim()
    .toUpperCase();

  const interval = String(
    req.query.interval || 'Hour4'
  ).trim();

  const start = String(
    req.query.start || ''
  ).trim();

  const end = String(
    req.query.end || ''
  ).trim();

  if (!allowedIntervals.has(interval)) {
    return res.status(400).json({
      success: false,
      message: 'intervalo inválido'
    });
  }

  if (!/^[A-Z0-9_]+$/.test(symbol)) {
    return res.status(400).json({
      success: false,
      message: 'símbolo inválido'
    });
  }
  /* ==============================================
     1 — TENTA O ATIVO SOLICITADO NA MEXC
     ============================================== */

  try {

    const qs = new URLSearchParams({
      interval
    });

    if (start) {
      qs.set('start', start);
    }

    if (end) {
      qs.set('end', end);
    }

    const url = MEXC + '/api/v1/contract/kline/' + encodeURIComponent(symbol) + '?' + qs.toString();
    const out = await fetchText(
      url,
      {
        'accept': 'application/json',
        'user-agent': 'SetupEgiP/42'
      }
    );

    if (out.ok) {

      let j = null;

      try {
        j = JSON.parse(out.text);
      } catch (_) {}

      const n =
        j?.data?.time?.length || 0;

      if (
        j &&
        j.success !== false &&
        n >= 210
      ) {

        res.set(
          'cache-control',
          'no-store'
        );

        return res.json({
          ...j,

          requestedSymbol: symbol,
          referenceSymbol: symbol,
          fallback: false,

         source: 'MEXC histórico - ' + symbol
        });
      }
    }

  } catch (_) {}

  /* ==============================================
     2 — PROTEÇÃO V42

     BTC, ETH, SOL ETC. NÃO PODEM
     RECEBER HISTÓRICO DO BRENT.
     ============================================== */

  if (symbol !== 'UKOIL_USDT') {

    res.set(
      'cache-control',
      'no-store'
    );

    return res.status(502).json({

      success: false,

      requestedSymbol: symbol,

      message:
        `Histórico MEXC indisponível para ${symbol}. ` +
        Fallback Brent recusado por segurança.

    });
  }

  /* ==============================================
     3 — SOMENTE O OIL PODE USAR BZ=F
     ============================================== */

  try {

    const rows =
      await yahooHistory(interval);

    res.set(
      'cache-control',
      'no-store'
    );

    return res.json({

      success: true,
      code: 0,

      source:
        'Fallback histórico Brent BZ=F • exclusivo OIL',

      fallback: true,

      requestedSymbol: symbol,

      referenceSymbol:
        YAHOO_SYMBOL,

      data:
        toMexcShape(rows)

    });

  } catch (err) {

    return res.status(502).json({

      success: false,

      requestedSymbol: symbol,

      message:
        'MEXC bloqueou o histórico do OIL e ' +
        'a contingência Brent também falhou',

      detail:
        String(err.message || err)

    });
  }

});
/* ==============================================
   ARQUIVOS DO APP
   ============================================== */

app.use(
  express.static(
    path.join(__dirname, 'public'),
    {
      etag: true,
      maxAge: '5m'
    }
  )
);

app.get('*', (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );

});

app.listen(
  PORT,
  () => {
    console.log(
      SetupEgiP V42 ativo na porta ${PORT}
    );
  }
);
