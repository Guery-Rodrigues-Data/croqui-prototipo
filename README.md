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

## Sincronização de posições via Google Sheets (experimental)

O ponto acima (`localStorage`) é por navegador: se você manda o link do deploy pra alguém
mexer no croqui, o que essa pessoa posicionar fica só no navegador dela — você não vê depois.
`assets/sheets-sync.js` resolve isso, mas é uma chave liga/desliga, desligada por padrão
(`SHEETS_SYNC_ENABLED = false`), sem afetar nada até você ativar.

O que ele sincroniza: só posição (área do cruzamento, grupos focais, anotações,
controladores vinculados). Imagem importada da área e anexos de anotação **não** entram —
são base64 e estourariam o limite de caracteres de uma célula do Sheets, continuam só no
`localStorage`/backup local de quem os anexou.

**Pra ativar:**
1. Crie uma planilha Google nova (em branco).
2. Nela, `Extensões > Apps Script`, apague o conteúdo padrão e cole o conteúdo de
   `apps-script/sync.gs`.
3. `Implantar > Nova implantação` → tipo "App da Web" → Executar como **Eu**, Quem pode
   acessar **Qualquer pessoa**. Autorize quando pedir e copie a URL gerada (termina em
   `/exec`).
4. Em `assets/sheets-sync.js`, cole essa URL em `SHEETS_SYNC_URL` e troque
   `SHEETS_SYNC_ENABLED` para `true`.
5. Redeploy (ou teste local) — ao salvar um croqui, a planilha ganha uma aba "posicoes"
   automaticamente; ao abrir um croqui existente, o editor busca o que estiver lá e aplica
   por cima do local.

**Pra desligar / desfazer:** `SHEETS_SYNC_ENABLED = false` já é suficiente — nenhuma outra
parte do protótipo depende disso. Pra remover de vez: apague `assets/sheets-sync.js`,
`apps-script/sync.gs`, a tag `<script>` dele em `editor-croqui.html`, e as duas chamadas
guardadas por `typeof ... === "function"` em `assets/data.js` (`writeOverride`) e
`assets/editor.js` (bootstrap).

**Limitações conhecidas** (aceitáveis pra um teste, não pra produção): sem trava de
concorrência — se duas pessoas salvarem ao mesmo tempo, a última escrita ganha; e cada
chamada ao Apps Script Web App tem uma latência perceptível (visível só como um toast
"Posições atualizadas..." pouco depois de abrir o croqui — não trava a tela).
