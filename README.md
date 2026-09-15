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

## Sincronização de posições via Supabase

O ponto acima (`localStorage`) é por navegador: se você manda o link do deploy pra alguém
mexer no croqui, o que essa pessoa posicionar fica só no navegador dela — sem isso, você não
veria depois. `assets/supabase-sync.js` resolve isso com um banco Postgres de verdade
(Supabase), chave liga/desliga em `SUPABASE_SYNC_ENABLED` (hoje `true`).

**Schema** (`supabase/schema.sql`): `croquis`, `controladores` (cadastro independente, pode
participar de zero, um ou vários croquis), `croqui_controladores` (ligação N:N, com posição
local por croqui e a flag `virtual`), `grupos_focais` e `anotacoes` (um-pra-muitos por
croqui). Todo `atualizado` é gravado por um **gatilho no servidor**, nunca pelo cliente — é o
que evita a classe de bug que tínhamos com o Sheets (registro sem timestamp confiável
revertendo uma edição local pro estado antigo, mesmo sem F5). A escrita passa por uma função
Postgres só (`upsert_croqui_completo`), que faz upsert + apaga o que foi removido numa
transação atômica, um único round-trip.

O que sincroniza: só posição (área do cruzamento, grupos focais, anotações, controladores
vinculados). Imagem importada da área e anexos de anotação **não** entram — são base64,
continuam só no `localStorage`/backup local de quem os anexou.

**Credenciais:** guardadas fora do repo (memória local do Guery) — a chave publicável
(`sb_publishable_...`) já está hardcoded em `assets/supabase-sync.js` (é segura por design,
o controle de acesso é via RLS no Postgres, não por a chave ser secreta). A chave secreta
(`sb_secret_...`) e a senha do Postgres **nunca** vão pro código — só usadas pontualmente
pra rodar `supabase/schema.sql` ou alterar o schema.

**Pra desligar / desfazer:** `SUPABASE_SYNC_ENABLED = false` em `assets/supabase-sync.js` já
é suficiente. A sincronização antiga via Google Sheets (`assets/sheets-sync.js`,
`apps-script/sync.gs`) continua no repo desligada, só de referência.

**Limitações conhecidas** (aceitáveis pra esse estágio, não pra produção): RLS aberto pra
leitura/escrita geral via a chave publicável, sem restrição por usuário (não tem login
ainda); sem trava de concorrência linha-a-linha entre dois saves simultâneos do mesmo
croqui (o `atualizado` do servidor evita reverter uma edição mais nova, mas não impede dois
saves quase ao mesmo tempo de se sobrescreverem — última escrita ganha).
