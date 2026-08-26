# Croqui — protótipo (Antares / dataprom)

Protótipo navegável do **Cadastro de Croqui** semafórico: listagem de croquis num mapa,
editor de croqui (área do cruzamento, grupos focais, flechas de direção, anotações) e uma
tela de apresentação em tempo real. Site estático, sem build, sem backend — os dados vivem
no `localStorage` do navegador.

## Telas

| Arquivo | O que é |
|---|---|
| `index.html` | Home: listagem de croquis + controladores sem croqui no mapa |
| `editor-croqui.html` | Editor de um croqui |
| `apresentacao-croqui.html` | Croqui em tempo real |

## Rodar local

O `_serve.ps1` sobe um servidor estático em PowerShell na porta **8743** e ainda trata o
`POST /api/backup`, que grava um snapshot completo dos croquis em `backup-dados.json` a cada
alteração (segurança extra além do `localStorage`).

```powershell
powershell -ExecutionPolicy Bypass -File .\_serve.ps1
# abre http://localhost:8743/
```

## Deploy (Vercel)

Site estático puro, sem build. `/` serve o `index.html` (a listagem) automaticamente.

**Senha de acesso:** `middleware.js` (Vercel Edge Middleware) tranca tudo atrás de HTTP
Basic Auth com uma senha fixa. Usuário/senha padrão estão no topo do arquivo; dá pra
sobrescrever sem mexer no código definindo `SITE_USUARIO` / `SITE_SENHA` nas *Environment
Variables* do projeto na Vercel.

**Cadastros no deploy:** no primeiro acesso a uma origem nova (localStorage vazio), o
`assets/data.js` carrega `backup-dados.json` automaticamente pro `localStorage` — então o
site já abre com os croquis cadastrados. Depois disso o `localStorage` volta a mandar. Pra
atualizar o que aparece no deploy: rodar local, salvar os croquis (o `backup-dados.json` é
regravado), commitar e dar push.
