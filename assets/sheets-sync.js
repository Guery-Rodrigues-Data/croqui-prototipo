// ---------------------------------------------------------------------------
// SINCRONIZAÇÃO DE POSIÇÕES VIA GOOGLE SHEETS — experimental, chave liga/desliga.
//
// Por padrão (SHEETS_SYNC_ENABLED = false) isso não faz nada: nem chama fetch, nem
// muda nenhum comportamento existente. O protótipo continua 100% como antes, só no
// localStorage + backup-dados.json local (ver README).
//
// Quando ligado: ao salvar um croqui, manda só as POSIÇÕES (área, grupos focais,
// anotações, controladores vinculados — sem imagem da área nem anexo de anotação,
// que não cabem numa célula de planilha) pra um Apps Script publicado como Web App
// (ver apps-script/sync.gs). Ao abrir um croqui existente, busca o que está na
// planilha e aplica por cima do que carregou local — assim, se você mandar o link
// pra alguém mexer, o que ela salvar aparece pra você na próxima vez que abrir.
//
// PRA ATIVAR:
//   1. Publique apps-script/sync.gs como Web App (instruções no topo do arquivo).
//   2. Cole a URL do Web App (termina em /exec) em SHEETS_SYNC_URL abaixo.
//   3. Troque SHEETS_SYNC_ENABLED para true.
//
// PRA DESLIGAR / DESFAZER: troque SHEETS_SYNC_ENABLED de volta pra false — já basta,
// nenhuma outra parte do protótipo depende disso (as duas chamadas em assets/data.js
// e assets/editor.js são guardadas por "typeof ... === 'function'"). Pra remover de
// vez: apague este arquivo, a tag <script> que o carrega em editor-croqui.html, e
// essas duas chamadas guardadas.
// ---------------------------------------------------------------------------

const SHEETS_SYNC_ENABLED = true;
const SHEETS_SYNC_URL = "https://script.google.com/macros/s/AKfycbwkRHZc5wsqfnCm1L_wh5IyYYg7mvHbOBKNosBAHW_16qMfUTl3baym-frIyrXbI9co/exec";

// Só o que é posição — sem areaImagem (base64) nem anexos (base64) das anotações,
// que estourariam o limite de caracteres de uma célula do Sheets.
function montarPayloadPosicoes(detail) {
  return {
    id: detail.id,
    nome: detail.nome,
    lat: detail.lat,
    lng: detail.lng,
    area: detail.area || null,
    grupos: (detail.grupos || []).map((g) => ({ ...g })),
    textos: (detail.textos || []).map((t) => {
      const { anexos, ...resto } = t;
      return resto;
    }),
    controladores: (detail.controladores || []).map((c) => ({
      id: c.id,
      via: c.via,
      posicaoLocal: c.posicaoLocal,
      virtual: c.virtual,
      croquiOrigemId: c.croquiOrigemId,
      croquiOrigemNome: c.croquiOrigemNome,
    })),
  };
}

// Debounced igual o backup local (ver enviarBackupParaArquivo em data.js) — rajada de
// arrastões manda só um POST no final, com o estado mais atual.
let sheetsSyncTimer = null;
function agendarEnvioSheets(detail) {
  if (!SHEETS_SYNC_ENABLED || !SHEETS_SYNC_URL || !detail.id) return;
  clearTimeout(sheetsSyncTimer);
  sheetsSyncTimer = setTimeout(() => {
    // Sem header Content-Type de propósito — evita o preflight CORS (OPTIONS) que o
    // Apps Script Web App não responde. O doPost lê e faz JSON.parse manualmente.
    fetch(SHEETS_SYNC_URL, {
      method: "POST",
      body: JSON.stringify(montarPayloadPosicoes(detail)),
    }).catch(() => {
      // Fire-and-forget: falhou, segue só com localStorage/backup local, igual antes
      // de existir essa sincronização.
    });
  }, 600);
}

// Busca a versão salva na planilha pra este croqui e, se existir, manda pro callback
// aplicar por cima do que já carregou local. Chamado uma vez no bootstrap do editor
// (ver editor-croqui.html / editor.js) — a planilha é tratada como fonte da verdade
// das posições compartilhadas quando a sincronização está ligada.
async function sincronizarDaSheetsSeNecessario(croquiId, aplicar) {
  if (!SHEETS_SYNC_ENABLED || !SHEETS_SYNC_URL || !croquiId) return;
  try {
    const res = await fetch(`${SHEETS_SYNC_URL}?id=${encodeURIComponent(croquiId)}`);
    if (!res.ok) return;
    const remoto = await res.json();
    if (remoto && remoto.id) aplicar(remoto);
  } catch {
    // Apps Script fora do ar / sem rede — segue só com o que já carregou local.
  }
}
