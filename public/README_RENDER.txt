SetupEgiP V17 — arquivos para Render

Arquivos obrigatórios na raiz do repositório:
- index.html
- server.js
- package.json

No Render (Web Service):
Build Command: npm install
Start Command: npm start

Depois use Manual Deploy > Deploy latest commit.

Teste de saúde:
Abra /health no final da URL do seu serviço.
Exemplo: https://SEU-SERVICO.onrender.com/health
Deve aparecer um JSON com "ok": true.
