// ---------------------------------------------------------------------------
// SINCRONIZAÇÃO DE POSIÇÕES VIA SUPABASE — substitui a sincronização via Google Sheets
// (ver assets/sheets-sync.js, mantido no repo desligado, só de referência/rollback).
//
// Banco relacional de verdade (Postgres): tabelas croquis, controladores,
// croqui_controladores (ligação N:N, com posição local por croqui e flag virtual),
// grupos_focais, anotacoes. Todas com "atualizado" gravado por um gatilho NO SERVIDOR
// em toda alteração — o cliente nunca manda essa data, o que elimina de raiz a classe
// de bug que tínhamos com o Sheets (registro sem timestamp confiável revertendo edição
// local pro estado antigo).
//
// Escrita: uma função Postgres (upsert_croqui_completo, ver apps-script antigo trocado
// por supabase-schema.sql) faz upsert do croqui + diff (apaga o que sumiu, grava o que
// mudou) de grupos/anotações/controladores numa transação só, num único round-trip.
// Leitura: 3 selects (croqui, grupos, anotações) + 1 select com embed de controladores.
//
// Chave liga/desliga igual antes — SUPABASE_SYNC_ENABLED=false não faz nada, nem carrega
// o cliente.
// ---------------------------------------------------------------------------

const SUPABASE_SYNC_ENABLED = true;
const SUPABASE_URL = "https://ghresppjwfpdvyhuhvbo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gKyKsZrrJCA-kNeVIx036g_cLTa_-bK"; // chave publicável — segura por design (RLS controla o acesso), pode ficar no código

let supabaseClient = null;
function getSupabaseClient() {
  if (!SUPABASE_SYNC_ENABLED) return null;
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// Guarda, por croqui, o "atualizado" (ISO, vindo do servidor) da versão mais recente que
// este navegador já conhece — mesma lógica de proteção contra corrida do sheets-sync.js,
// só que agora o servidor SEMPRE tem um atualizado válido (coluna not null + gatilho),
// então não existe mais o caso "registro antigo sem timestamp" que causou o bug de
// 15/09/2026 (revertia pro padrão mesmo sem F5).
const SUPABASE_SYNC_TS_KEY = "croqui_prototipo_v1_supabase_ts";
function lerUltimoTsConhecido(croquiId) {
  try {
    const mapa = JSON.parse(localStorage.getItem(SUPABASE_SYNC_TS_KEY)) || {};
    return mapa[croquiId] || null;
  } catch {
    return null;
  }
}
function gravarUltimoTsConhecido(croquiId, ts) {
  try {
    const mapa = JSON.parse(localStorage.getItem(SUPABASE_SYNC_TS_KEY)) || {};
    mapa[croquiId] = ts;
    localStorage.setItem(SUPABASE_SYNC_TS_KEY, JSON.stringify(mapa));
  } catch {
    // localStorage cheio/indisponível — sem essa trava específica, mas a sincronização
    // em si continua funcionando normalmente.
  }
}

// Anotação (texto) tem id só único DENTRO do croqui ("T1", "T2"...) — a tabela
// compartilhada precisa de chave primária globalmente única, então prefixa com o id do
// croqui ao mandar pro banco, e tira o prefixo de volta ao ler.
function idAnotacaoNoBanco(croquiId, idLocal) {
  return `${croquiId}-${idLocal}`;
}
function idAnotacaoLocal(croquiId, idNoBanco) {
  return idNoBanco.startsWith(`${croquiId}-`) ? idNoBanco.slice(croquiId.length + 1) : idNoBanco;
}

// Só o que é posição — sem areaImagem (base64) nem anexos (base64) das anotações, que não
// existem como coluna nenhuma tabela (mesma exceção de sempre).
function montarPayloadPosicoes(detail) {
  return {
    p_id: detail.id,
    p_croqui: {
      nome: detail.nome,
      lat: detail.lat,
      lng: detail.lng,
      area: detail.area || null,
    },
    p_grupos: (detail.grupos || []).map((g) => ({
      uid: g.uid,
      id: g.id,
      controladorId: g.controladorId || null,
      tipo: g.tipo,
      lat: g.lat,
      lng: g.lng,
      direcao: g.direcao || null,
      rotationDeg: g.rotationDeg ?? null,
      fase: g.fase ?? null,
      arrowScale: g.arrowScale ?? null,
      pinScale: g.pinScale ?? null,
      arrowLat: g.arrowLat ?? null,
      arrowLng: g.arrowLng ?? null,
      temRepetidor: !!g.temRepetidor,
      repetidorDe: g.repetidorDe || null,
    })),
    p_anotacoes: (detail.textos || []).map((t) => ({
      id: idAnotacaoNoBanco(detail.id, t.id),
      lat: t.lat,
      lng: t.lng,
      titulo: t.titulo || null,
      texto: t.texto || null,
      rotationDeg: t.rotationDeg ?? null,
      pinScale: t.pinScale ?? null,
    })),
    p_controladores: (detail.controladores || []).map((c) => ({
      id: c.id,
      via: c.via || null,
      posicaoLocal: c.posicaoLocal || null,
      virtual: !!c.virtual,
      croquiOrigemId: c.croquiOrigemId || null,
    })),
  };
}

// Debounced igual o backup local e o sheets-sync antigo — rajada de arrastões manda uma
// chamada RPC só no final, com o estado mais atual.
let supabaseSyncTimer = null;
function agendarEnvioSupabase(detail) {
  const client = getSupabaseClient();
  if (!client || !detail.id) return;
  clearTimeout(supabaseSyncTimer);
  const payload = montarPayloadPosicoes(detail);
  supabaseSyncTimer = setTimeout(() => {
    client.rpc("upsert_croqui_completo", payload).then(({ data, error }) => {
      if (error) return; // fire-and-forget: falhou, segue só com localStorage/backup local
      if (data) gravarUltimoTsConhecido(detail.id, data); // "data" é o atualizado retornado pelo servidor
    });
  }, 600);
}

// Busca um croqui completo no Supabase e monta no MESMO formato que getCroquiDetail()
// devolve (assets/data.js) — assim o resto do editor.js não precisa saber de onde veio.
async function buscarCroquiDoSupabase(id) {
  const client = getSupabaseClient();
  if (!client) return null;

  const [croquiRes, gruposRes, anotacoesRes, ligacoesRes] = await Promise.all([
    client.from("croquis").select("*").eq("id", id).maybeSingle(),
    client.from("grupos_focais").select("*").eq("croqui_id", id),
    client.from("anotacoes").select("*").eq("croqui_id", id),
    client.from("croqui_controladores").select("*, controladores(*)").eq("croqui_id", id),
  ]);
  if (croquiRes.error || !croquiRes.data) return null;

  const cq = croquiRes.data;
  return {
    id: cq.id,
    nome: cq.nome,
    lat: cq.lat,
    lng: cq.lng,
    area: cq.area || null,
    atualizado: cq.atualizado,
    grupos: (gruposRes.data || []).map((g) => ({
      uid: g.uid,
      id: g.id,
      controladorId: g.controlador_id,
      tipo: g.tipo,
      lat: g.lat,
      lng: g.lng,
      direcao: g.direcao,
      rotationDeg: g.rotation_deg,
      fase: g.fase,
      arrowScale: g.arrow_scale,
      pinScale: g.pin_scale,
      arrowLat: g.arrow_lat,
      arrowLng: g.arrow_lng,
      temRepetidor: g.tem_repetidor,
      repetidorDe: g.repetidor_de,
    })),
    textos: (anotacoesRes.data || []).map((t) => ({
      id: idAnotacaoLocal(id, t.id),
      lat: t.lat,
      lng: t.lng,
      titulo: t.titulo,
      texto: t.texto,
      rotationDeg: t.rotation_deg,
      pinScale: t.pin_scale,
    })),
    controladores: (ligacoesRes.data || []).map((l) => ({
      id: l.controlador_id,
      via: l.controladores ? l.controladores.via : null,
      fases: l.controladores ? l.controladores.fases : null,
      cicloSegundos: l.controladores ? l.controladores.ciclo_segundos : null,
      estagioAtual: l.controladores ? l.controladores.estagio_atual : null,
      estagioTotal: l.controladores ? l.controladores.estagio_total : null,
      posicaoLocal: l.posicao_local,
      virtual: l.virtual,
      croquiOrigemId: l.croqui_origem_id,
    })),
  };
}

// Aplica os campos de posição vindos do Supabase em cima de um objeto de croqui local —
// preserva anexos locais dos textos, que não viajam pelo banco.
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

// Busca o remoto pra um id e devolve null se não for seguro aplicar por cima do local
// (planilha/banco não tem nada mais novo do que este navegador já conhece).
async function buscarRemotoSeMaisNovo(id) {
  const remoto = await buscarCroquiDoSupabase(id);
  if (!remoto) return null;
  const ultimoConhecido = lerUltimoTsConhecido(id);
  if (ultimoConhecido && remoto.atualizado <= ultimoConhecido) return null;
  gravarUltimoTsConhecido(id, remoto.atualizado);
  return remoto;
}

// Busca a versão salva no Supabase pra este croqui e, se for mais nova, manda pro
// callback aplicar por cima do que já carregou local. Chamado uma vez no bootstrap do
// editor (ver editor-croqui.html / editor.js).
async function sincronizarDaSupabaseSeNecessario(croquiId, aplicar) {
  if (!SUPABASE_SYNC_ENABLED || !croquiId) return;
  try {
    const remoto = await buscarRemotoSeMaisNovo(croquiId);
    if (remoto) aplicar(remoto);
  } catch {
    // Supabase fora do ar / sem rede — segue só com o que já carregou local.
  }
}

// Roda uma vez ao entrar na listagem (index.html) — sincroniza, em segundo plano, os
// croquis que este navegador já sincronizou antes (ver SUPABASE_SYNC_TS_KEY), evitando o
// "pisca" (mostra o antigo, atualiza pro novo em seguida) dentro do editor. Sequencial de
// propósito, sem pressa.
async function sincronizarTodosEmBackground() {
  if (!SUPABASE_SYNC_ENABLED || typeof readOverrides !== "function") return;
  const overrides = readOverrides();
  let idsConhecidos;
  try {
    idsConhecidos = Object.keys(JSON.parse(localStorage.getItem(SUPABASE_SYNC_TS_KEY)) || {});
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
      // esse id falhou — segue tentando os outros
    }
  }
  if (mudouAlgo) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch {}
  }
}
