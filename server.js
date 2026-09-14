const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MEXC_BASE = 'https://contract.mexc.com/api/v1/contract/kline';

app.disable('x-powered-by');

// Health check simples para Render.
app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'SetupEgiP V17', time: new Date().toISOString() });
});

// Proxy do histórico da MEXC. Mantém a API key fora do navegador (não é necessária aqui)
// e evita problemas de CORS no HTML.
app.get('/api/kline', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'UKOIL_USDT').toUpperCase().trim();
    const interval = String(req.query.interval || 'Hour4').trim();
    const start = String(req.query.start || '').trim();
    const end = String(req.query.end || '').trim();

    if (!/^[A-Z0-9_]{3,40}$/.test(symbol)) {
      return res.status(400).json({ success: false, message: 'Símbolo inválido.' });
    }

    const allowedIntervals = new Set(['Min1','Min5','Min15','Min30','Min60','Hour4','Hour8','Day1','Week1','Month1']);
    if (!allowedIntervals.has(interval)) {
      return res.status(400).json({ success: false, message: 'Timeframe inválido.' });
    }

    const params = new URLSearchParams({ interval });
    if (/^\d+$/.test(start)) params.set('start', start);
    if (/^\d+$/.test(end)) params.set('end', end);

    const url = `${MEXC_BASE}/${encodeURIComponent(symbol)}?${params.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'user-agent': 'SetupEgiP-V17/1.0'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await upstream.text();
    res.status(upstream.status);
    res.set('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.set('cache-control', 'no-store');
    return res.send(text);
  } catch (err) {
    const message = err && err.name === 'AbortError'
      ? 'Tempo limite ao consultar a MEXC.'
      : (err?.message || 'Erro interno no proxy da MEXC.');
    return res.status(502).json({ success: false, message });
  }
});

// Serve o aplicativo.
app.use(express.static(__dirname, {
  extensions: ['html'],
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

// Qualquer rota desconhecida volta para o index (bom para abrir pelo atalho/PWA).
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SetupEgiP V17 online na porta ${PORT}`);
});
