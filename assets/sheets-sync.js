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

// Substituído pelo Supabase em 15/09/2026 (ver assets/supabase-sync.js) — arquivo mantido
// só de referência/rollback, não carregado em nenhum HTML.
const SHEETS_SYNC_ENABLED = false;
const SHEETS_SYNC_URL = "https://script.google.com/macros/s/AKfycbwkRHZc5wsqfnCm1L_wh5IyYYg7mvHbOBKNosBAHW_16qMfUTl3baym-frIyrXbI9co/exec";

// Guarda, por croqui, o "atualizado" (ISO) da versão mais recente que ESTE navegador já
// sabe que existe (seja por ter acabado de mandar um push, seja por ter puxado da
// planilha) — ver comentário em sincronizarDaSheetsSeNecessario sobre por que isso
// existe: sem essa trava, um F5 logo depois de salvar podia sobrescrever a edição que
// você acabou de fazer com uma versão mais antiga ainda na planilha (o POST é
// assíncrono e debounced; se o F5 vier antes dele terminar, a planilha ainda está
// desatualizada, e o pull ia trazer essa versão velha de volta por cima da sua).
const SHEETS_SYNC_TS_KEY = "croqui_prototipo_v1_sheets_ts";
function lerUltimoTsConhecido(croquiId) {
  try {
    const mapa = JSON.parse(localStorage.getItem(SHEETS_SYNC_TS_KEY)) || {};
    return mapa[croquiId] || null;
  } catch {
    return null;
  }
}
function gravarUltimoTsConhecido(croquiId, ts) {
  try {
    const mapa = JSON.parse(localStorage.getItem(SHEETS_SYNC_TS_KEY)) || {};
    mapa[croquiId] = ts;
    localStorage.setItem(SHEETS_SYNC_TS_KEY, JSON.stringify(mapa));
  } catch {
    // localStorage cheio/indisponível — sem essa trava específica, mas a sincronização
    // em si continua funcionando normalmente.
  }
}

// Só o que é posição — sem areaImagem (base64) nem anexos (base64) das anotações,
// que estourariam o limite de caracteres de uma célula do Sheets. "atualizado" (ISO,
// gerado na hora) viaja dentro do próprio payload — é o que permite comparar versões
// no pull, sem precisar de coluna extra nem mudar o Apps Script.
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
    atualizado: new Date().toISOString(),
  };
}

// Debounced igual o backup local (ver enviarBackupParaArquivo em data.js) — rajada de
// arrastões manda só um POST no final, com o estado mais atual.
let sheetsSyncTimer = null;
function agendarEnvioSheets(detail) {
  if (!SHEETS_SYNC_ENABLED || !SHEETS_SYNC_URL || !detail.id) return;
  clearTimeout(sheetsSyncTimer);
  const payload = montarPayloadPosicoes(detail);
  // Grava o timestamp AQUI, na hora, fora do debounce — não só depois do POST sair. Um F5
  // pode acontecer DENTRO da janela de 600ms, antes do fetch abaixo sequer disparar; se o
  // registro também estivesse só lá dentro do setTimeout, nem ele nem o POST chegavam a
  // rodar antes da página recarregar, e o pull seguinte não tinha como saber que existia
  // uma edição local mais nova que a planilha — trazia a planilha (ainda velha) de volta
  // por cima da edição que você acabou de fazer. Gravando síncrono aqui, isso não acontece
  // mais, mesmo com F5 imediato.
  gravarUltimoTsConhecido(detail.id, payload.atualizado);
  sheetsSyncTimer = setTimeout(() => {
    // Sem header Content-Type de propósito — evita o preflight CORS (OPTIONS) que o
    // Apps Script Web App não responde. O doPost lê e faz JSON.parse manualmente.
    fetch(SHEETS_SYNC_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fire-and-forget: falhou, segue só com localStorage/backup local, igual antes
      // de existir essa sincronização.
    });
  }, 600);
}

// Busca o remoto pra um id e devolve null se não for seguro aplicar por cima do local —
// usado tanto pelo pull de um croqui aberto no editor quanto pelo sincronizarTodosEmBackground
// da listagem, abaixo.
//
// Registro sem campo "atualizado" (salvo antes dessa trava existir) NUNCA é aplicado —
// primeira versão disto tratava "sem info" como "aplica assim mesmo" (mantendo o
// comportamento antigo), e isso causou perda de dado de verdade em 15/09/2026: croquis com
// um registro antigo e vazio na planilha (de teste, sem edição real) tinham o trabalho
// local revertido pro padrão assim que a página abria, mesmo sem nenhum F5 — só o pull
// normal do bootstrap já bastava. Sem prova de que o remoto é mais novo, a opção segura
// é NÃO aplicar — nunca tratar um registro antigo como se fosse a fonte da verdade.
async function buscarRemotoSeMaisNovo(id) {
  const res = await fetch(`${SHEETS_SYNC_URL}?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const remoto = await res.json();
  if (!remoto || !remoto.id || !remoto.atualizado) return null;
  const ultimoConhecido = lerUltimoTsConhecido(id);
  if (ultimoConhecido && remoto.atualizado <= ultimoConhecido) return null;
  gravarUltimoTsConhecido(id, remoto.atualizado);
  return remoto;
}

// Aplica os campos de posição vindos da planilha em cima de um objeto de croqui local
// (em memória, no editor, ou o override salvo no localStorage, na sincronização em
// segundo plano) — preserva anexos locais dos textos, que não viajam pela planilha.
function aplicarPosicoesRemotasEm(local, remoto) {
  local.area = remoto.area || local.area;
  local.grupos = remoto.grupos || local.grupos;
  local.textos = (remoto.textos || []).map((t) => {
    const antigo = (local.textos || []).find((x) => x.id === t.id);
    return antigo && antigo.anexos ? { ...t, anexos: antigo.anexos } : t;
  });
  if (remoto.controladores && local.controladores) {
    local.controladores = local.controladores.map((c) => {
      const r = remoto.controladores.find((x) => x.id === c.id);
      return r && r.posicaoLocal ? { ...c, posicaoLocal: r.posicaoLocal } : c;
    });
  }
  return local;
}

// Busca a versão salva na planilha pra este croqui e, se for mais nova, manda pro
// callback aplicar por cima do que já carregou local. Chamado uma vez no bootstrap do
// editor (ver editor-croqui.html / editor.js).
async function sincronizarDaSheetsSeNecessario(croquiId, aplicar) {
  if (!SHEETS_SYNC_ENABLED || !SHEETS_SYNC_URL || !croquiId) return;
  try {
    const remoto = await buscarRemotoSeMaisNovo(croquiId);
    if (remoto) aplicar(remoto);
  } catch {
    // Apps Script fora do ar / sem rede — segue só com o que já carregou local.
  }
}

// Roda uma vez ao entrar na listagem (index.html) — sincroniza, em segundo plano, os
// croquis que este navegador já sincronizou com a planilha antes (empurrou ou puxou —
// ver SHEETS_SYNC_TS_KEY). Sem isso, o pull só acontecia dentro do editor de um croqui
// específico, DEPOIS da tela já ter desenhado com o dado antigo — dava pra ver a tela
// "piscar" (mostra o antigo, atualiza pro novo em seguida). Fazendo essa varredura mais
// cedo, ao entrar no sistema, o dado já chega atualizado no localStorage antes do
// usuário sequer abrir aquele croqui específico.
//
// Só cobre os já sincronizados (não TODOS os croquis salvos localmente, que podem
// passar de mil, a maioria nunca tendo passado pela planilha) — de propósito: iterar
// centenas de ids sem nada pra buscar só pra confirmar "não tem nada lá" é uma
// varredura de fundo lenta e pesada à toa pro Apps Script. Um croqui nunca sincronizado
// por este navegador continua funcionando normalmente — só sincroniza (com aquele
// "pisca" ainda) na primeira vez que for aberto no editor.
//
// Sequencial (um id de cada vez, não em paralelo) de propósito — é tarefa de fundo, sem
// pressa, e evita sobrecarregar o Apps Script com muitas chamadas simultâneas.
async function sincronizarTodosEmBackground() {
  if (!SHEETS_SYNC_ENABLED || !SHEETS_SYNC_URL || typeof readOverrides !== "function") return;
  const overrides = readOverrides();
  let idsConhecidos;
  try {
    idsConhecidos = Object.keys(JSON.parse(localStorage.getItem(SHEETS_SYNC_TS_KEY)) || {});
  } catch {
    idsConhecidos = [];
  }
  const ids = idsConhecidos.filter((id) => overrides[id]);
  let mudouAlgo = false;
  for (const id of ids) {
    try {
      const remoto = await buscarRemotoSeMaisNovo(id);
      if (remoto) {
        aplicarPosicoesRemotasEm(overrides[id], remoto);
        mudouAlgo = true;
      }
    } catch {
      // esse id falhou (fora do ar, sem rede) — segue tentando os outros
    }
  }
  if (mudouAlgo) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch {}
  }
}
