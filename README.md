# Pesquisa Segurança Fortaleza 2026

## Estrutura
```
pesquisa-fortaleza/
├── public/index.html       ← Aplicação web
├── data/CrimesBrasil2026.csv ← Dados da SSPDS-CE (lido pelo servidor)
├── respostas/              ← Criada automaticamente ao receber respostas
│   ├── respostas.json      ← Respostas dos participantes em JSON
│   └── respostas.csv       ← Respostas dos participantes em CSV
├── server.js               ← Servidor Express
├── package.json
└── railway.toml
```

## Como rodar localmente
```bash
npm install
node server.js
# Acesse: http://localhost:3000
```

## Como acessar as respostas coletadas
Foi criado um caminho que ao adicionar '/admin' no final do URL do navegador, é aberto o espaço para acessar os dados coletados. 
