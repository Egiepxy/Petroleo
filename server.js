const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const MEXC = 'https://contract.mexc.com';

app.disable('x-powered-by');

app.get('/api/health', (req,res)=>{
  res.json({ok:true, service:'SetupEgiP V14', time:new Date().toISOString()});
});

app.get('/api/kline', async (req,res)=>{
  try{
    const symbol = String(req.query.symbol || 'UKOIL_USDT');
    const interval = String(req.query.interval || 'Hour4');
    const start = String(req.query.start || '');
    const end = String(req.query.end || '');

    const allowedIntervals = new Set(['Min15','Min60','Hour4','Day1']);
    if(!allowedIntervals.has(interval)){
      return res.status(400).json({success:false,message:'intervalo inválido'});
    }
    if(!/^[A-Z0-9_]+$/.test(symbol)){
      return res.status(400).json({success:false,message:'símbolo inválido'});
    }

    const qs = new URLSearchParams({interval});
    if(start) qs.set('start', start);
    if(end) qs.set('end', end);

    const url = `${MEXC}/api/v1/contract/kline/${encodeURIComponent(symbol)}?${qs.toString()}`;
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 12000);

    const r = await fetch(url, {
      headers: {'accept':'application/json','user-agent':'SetupEgiP/14'},
      signal: ctrl.signal
    });
    clearTimeout(timer);

    const text = await r.text();
    res.status(r.status);
    res.set('cache-control','no-store');
    res.type('application/json').send(text);
  }catch(err){
    res.status(502).json({success:false,message:'falha ao consultar histórico MEXC',detail:String(err.message||err)});
  }
});

app.use(express.static(path.join(__dirname,'public'), {
  etag: true,
  maxAge: '5m'
}));

app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(PORT, ()=>console.log(`SetupEgiP V14 ativo na porta ${PORT}`));
