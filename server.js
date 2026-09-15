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
