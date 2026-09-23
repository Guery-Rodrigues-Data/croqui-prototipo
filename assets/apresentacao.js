// Apresentação em tempo real — tela só de leitura (não edita nada), escopo de UM controlador.
// As cores/contagens dos grupos focais são simuladas localmente (setInterval), sem backend real.
//
// Espera a sincronização com o Supabase (mesmo padrão do editor.js: corrida contra um teto de
// 1.5s, pra não travar a tela indefinidamente se o banco estiver lento/fora do ar) antes de
// montar o estado derivado de `detail` (controlador, grupos, ciclo simulado) e desenhar. Se a
// resposta do banco chegar DEPOIS do teto (rede lenta/fria), a sincronização continua rodando
// em segundo plano e, quando chegar, refaz o estado e redesenha tudo de novo — mesma lógica do
// editor (bootstrapComSync/jaRenderizouUmaVez em editor.js). Sem isso, dado que só chegasse
// atrasado (ex.: uma anotação) nunca aparecia, mesmo com o Supabase respondendo certinho.

function escapeHtmlLive(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const params = new URLSearchParams(location.search);
const croquiId = params.get("id");
const ctParam = params.get("ct");
const detail = getCroquiDetail(croquiId);

// "Voltar ao Cockpit": só aparece quando veio de lá (tem ct= na URL). Fecha a aba em vez de
// navegar pra alguma URL do Cockpit — essa página não sabe se o Cockpit é local ou o deploy,
// e como o link de lá sempre abre em aba nova (target="_blank"), fechar volta o foco pra ela.
if (ctParam) {
  const voltarBtn = document.getElementById("voltarCockpitBtn");
  voltarBtn.hidden = false;
  voltarBtn.addEventListener("click", () => window.close());
}

// ---------- mapa (não depende dos dados do croqui além do centro) ----------

// maxZoom aqui é o teto do MAPA (até onde dá pra apertar o zoom), maxNativeZoom é até onde a
// Esri tem imagem de verdade — acima disso o Leaflet só amplia o último tile (fica com menos
// nitidez, mas continua aproximando). Sem o maxZoom mais alto, o Leaflet trava o mapa inteiro
// no maxNativeZoom da camada (foi o que aconteceu antes: pedia zoom 20 e ele voltava pro 19).
const map = L.map("map", { zoomControl: false, maxZoom: 22 }).setView([detail.lat, detail.lng], 18);
// Só satélite — sem botão de trocar pra mapa claro (tirado a pedido, sem uso aqui).
const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri",
  maxZoom: 22,
  maxNativeZoom: 19,
});
satelliteLayer.addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

const ARROW_REFERENCE_ZOOM = 19;
function arrowZoomFactor() {
  return Math.pow(2, map.getZoom() - ARROW_REFERENCE_ZOOM);
}

let groupMarkers = [];

// ---------- bootstrap: espera o Supabase (se houver) e só então monta o resto ----------

(async function bootstrap() {
  // backLink/headerCT/liveBadge saíram — cabeçalho agora é o app-topbar padrão (sem breadcrumb
  // próprio), igual ao editor. O card de Controlador na sidebar já identifica o CT em foco.

  // controlador/gruposDoControlador/liveState precisam ser recalculáveis (não const fixo no
  // bootstrap) porque a sincronização pode mudar `detail.grupos`/`detail.controladores` depois
  // do primeiro desenho (ver jaRenderizouUmaVez mais abaixo).
  let controlador, gruposDoControlador, liveState;

  // ---------- ciclo simulado por grupo focal ----------
  // Veicular passa por vermelho → verde → amarelo → vermelho; pedestre só alterna vermelho/verde
  // (simplificação didática do ciclo real — os tempos aqui não vêm de nenhum plano semafórico de verdade).
  // Lógica compartilhada em assets/app.js (liveInitialState / liveTickState / liveDotsHtml).
  function montarEstadoDerivado() {
    controlador = (detail.controladores || []).find((c) => c.id === ctParam) || (detail.controladores || [])[0] || null;
    gruposDoControlador = controlador ? detail.grupos.filter((g) => g.controladorId === controlador.id) : [];
    liveState = {};
    gruposDoControlador.forEach((g) => { liveState[g.id] = liveInitialState(g.id, g.tipo, controlador?.cicloSegundos, controlador?.estagioTotal); });
  }

  function tick() {
    gruposDoControlador.forEach((g) => liveTickState(liveState[g.id], g.tipo, controlador?.cicloSegundos, controlador?.estagioTotal));
    renderLiveGroups();
    renderLiveMarkers();
    updateTimestamp();
  }

  // ---------- controlador / ciclo (cabeçalho da sidebar) ----------

  // Primeira parte do topo da sidebar igual ao print que o Guery mandou (01.png): título
  // "Croqui", nome do croqui (readonly — aqui não edita) e o chip do controlador no mesmo
  // estilo do editor (.controlador-chip, assets/editor.js renderControlador). O resto (Ver em
  // tempo real, abas Grupos/Anotações) fica pra depois — "por parte", como pedido.
  function renderControladorInfo() {
    const nomeSlot = document.getElementById("croquiNomeSlot");
    const slot = document.getElementById("liveControladorSlot");
    const cycleSlot = document.getElementById("liveCycleSlot");
    nomeSlot.innerHTML = `
    <div class="name-field">
      <label>Nome do Croqui</label>
      <input type="text" readonly value="${escapeHtmlLive(detail.nome || "")}" />
    </div>`;
    if (!controlador) {
      slot.innerHTML = `<p class="empty-note">Este croqui não tem controlador associado.</p>`;
      cycleSlot.innerHTML = "";
      return;
    }
    slot.innerHTML = `
    <div class="controlador-row">
      <div class="controlador-chip is-active">
        <span class="controlador-chip-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h.01M8 11h.01M8 15h.01M13 7h3M13 11h3M13 15h3"/></svg>
        </span>
        <span class="controlador-chip-main">
          <span class="controlador-chip-name">${escapeHtmlLive(controlador.id)}</span>
          <span class="controlador-chip-via">${escapeHtmlLive(controlador.via || "")}</span>
        </span>
      </div>
    </div>`;
    cycleSlot.innerHTML = `
    <div class="live-cycle-row">
      <span><span class="label">Ciclo:</span> <strong>${controlador.cicloSegundos}s</strong></span>
      <span><span class="label">Estágio:</span> <strong class="is-stage">${controlador.estagioAtual}/${controlador.estagioTotal}</strong></span>
    </div>`;
  }

  // ---------- lista lateral ----------

  // Card mais baixo, mesmo pino do mapa no lugar das bolinhas (reaproveita
  // .map-group-svgpin/is-live-<cor> — mesma cor/luz acesa, só que sem badge e sem a posição
  // absoluta que ele usa em cima do Leaflet, ver .live-group-card .map-group-svgpin no CSS).
  function liveGroupCardHtml(g) {
    const st = liveState[g.id];
    const pinTipoClass = g.tipo === "veicular" ? "map-group-svgpin--veicular" : "map-group-svgpin--pedestre";
    const pinSvg = g.tipo === "veicular" ? ICON_SEMAFORO_PIN : ICON_PEDESTRE_PIN;
    const descricao = g.tipo === "veicular"
      ? `${escapeHtmlLive(g.direcao)}<span class="entity-item-sub-icon">${iconDirecao(g.direcao)}</span>`
      : "Pedestre";
    return `
      <div class="live-group-card">
        <span class="map-group-svgpin ${pinTipoClass} is-live-${st.cor}">${pinSvg}</span>
        <div class="live-group-main">
          <div class="live-group-head">
            <span class="live-group-id">${escapeHtmlLive(g.id)}</span>
            <span class="live-group-mv"><span class="label">Muda em</span> <span class="value">${st.restante}s</span></span>
          </div>
          <div class="live-group-address">${descricao}</div>
        </div>
      </div>`;
  }

  // Separado por tipo (Veicular primeiro, Pedestre depois) com título de seção — mais fácil de
  // escanear que a lista tudo misturado, principalmente com bastante grupo focal.
  function renderLiveGroups() {
    document.getElementById("liveGruposCount").textContent = gruposDoControlador.length;
    const list = document.getElementById("liveGruposList");
    if (!gruposDoControlador.length) {
      list.innerHTML = `<p class="empty-note">Nenhum grupo focal cadastrado neste controlador.</p>`;
      return;
    }
    const veiculares = gruposDoControlador.filter((g) => g.tipo === "veicular");
    const pedestres = gruposDoControlador.filter((g) => g.tipo === "pedestre");
    const secao = (titulo, grupos) =>
      grupos.length
        ? `<div class="entity-list-title entity-list-title--grupo">${titulo} <span>${grupos.length}</span></div>${grupos.map(liveGroupCardHtml).join("")}`
        : "";
    list.innerHTML = secao("Veicular", veiculares) + secao("Pedestre", pedestres);
  }

  // Anotações são do croqui inteiro, não por controlador (igual ao editor — não tem
  // controladorId, ver renderLists em assets/editor.js). Cartão igual ao .entity-item do
  // editor, só sem onclick — aqui não edita, é só mostrar.
  function renderTextos() {
    const textos = detail.textos || [];
    document.getElementById("textosCount").textContent = textos.length;
    const list = document.getElementById("textosList");
    list.innerHTML = textos.length
      ? textos.map((t) => `
      <li>
        <div class="entity-item">
          <span class="entity-item-icon tipo-texto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>
          </span>
          <span class="entity-item-main">
            <span class="entity-item-name">${escapeHtmlLive(t.titulo || t.texto || "Anotação")}</span>
            ${t.texto || (t.anexos && t.anexos.length) ? `
            <span class="entity-item-sub-row">
              <span class="entity-item-sub entity-item-sub--preview">${t.texto ? escapeHtmlLive(t.texto.length > 60 ? t.texto.slice(0, 60) + "…" : t.texto) : ""}</span>
              ${t.anexos && t.anexos.length ? `<span class="entity-item-sub entity-item-sub--anexo"><span class="entity-item-sub-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.1a2 2 0 1 1-2.83-2.83l8.49-8.48"/></svg></span>${t.anexos.length}</span>` : ""}
            </span>` : ""}
          </span>
        </div>
      </li>`).join("")
      : `<li class="empty-note">Nenhuma anotação ainda.</li>`;
  }

  // ---------- abas da sidebar (Grupos / Anotações) — mesmo comportamento do editor
  // (selecionarAbaSidebar em assets/editor.js), sem os botões de edição do rodapé.
  function selecionarAbaSidebar(tab) {
    document.querySelectorAll(".sidebar-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
    document.getElementById("tabGrupos").style.display = tab === "grupos" ? "" : "none";
    document.getElementById("tabAnotacoes").style.display = tab === "anotacoes" ? "" : "none";
  }
  document.querySelectorAll(".sidebar-tab").forEach((btn) => {
    btn.addEventListener("click", () => selecionarAbaSidebar(btn.dataset.tab));
  });

  // ---------- marcadores no mapa ----------
  // Mesmo pino/ícones do cadastro (assets/editor.js, função groupIcon) — balão SVG completo
  // (ICON_SEMAFORO_PIN / ICON_PEDESTRE_PIN, de assets/app.js) com badge do id embaixo, em vez
  // do círculo+letra antigo que só essa tela ainda usava. A cor do estado ao vivo entra pela
  // mesma classe is-live-<cor> do editor (acende a luz certa no semáforo / recolore o pino de
  // pedestre — ver style.css), não mais pelos pontinhos (pin-live-dots) que só existiam aqui.

  // Mesma ideia do editor (assets/editor.js): arrowLat/arrowLng é o ponto geográfico real
  // onde a flecha fica ancorada no chão (não desgruda em nenhum zoom); só o TAMANHO
  // (arrowScale) é guardado como se fosse sempre neste zoom de referência, escalado pro
  // zoom atual na hora de desenhar.
  function groupArrowLatLng(g) {
    if (g.arrowLat != null && g.arrowLng != null) return L.latLng(g.arrowLat, g.arrowLng);
    const pt = map.latLngToContainerPoint([g.lat, g.lng]);
    return map.containerPointToLatLng(L.point(pt.x, pt.y - 30));
  }

  function liveGroupIcon(g) {
    const st = liveState[g.id];
    const liveClass = ` is-live-${st.cor}`;
    const pinTipoClass = g.tipo === "veicular" ? "map-group-svgpin--veicular" : "map-group-svgpin--pedestre";
    const pinSvg = g.tipo === "veicular" ? ICON_SEMAFORO_PIN : ICON_PEDESTRE_PIN;
    const pinScale = g.pinScale || (g.tipo === "pedestre" ? 0.85 : 1);
    const arrowScale = (g.arrowScale || 1) * arrowZoomFactor();
    const pinPt = map.latLngToContainerPoint([g.lat, g.lng]);
    const arrowPt = map.latLngToContainerPoint(groupArrowLatLng(g));
    const ax = arrowPt.x - pinPt.x;
    const ay = arrowPt.y - pinPt.y;

    // Chão: seta de direção pro veicular, faixa de pedestre pro pedestre — os dois usam a
    // mesma âncora/rotação/escala (groupArrowLatLng), igual ao cadastro.
    const groundIconSvg = g.tipo === "veicular" ? iconDirecao(g.direcao) : ICON_FAIXA_PEDESTRE;
    let arrowHtml = `<span class="map-group-pin-arrow${liveClass}" style="left:${ax}px; top:${ay}px; transform:translate(-50%,-50%) rotate(${g.rotationDeg || 0}deg) scale(${arrowScale})">${groundIconSvg}</span>`;
    let leaderHtml = "";
    const dist = Math.hypot(ax, ay);
    if (dist > 45) {
      const lineDeg = (Math.atan2(ax, -ay) * 180) / Math.PI;
      leaderHtml = `<span class="map-group-leader-line" style="width:${Math.round(dist)}px; transform:rotate(${lineDeg - 90}deg);"></span>`;
    }

    return L.divIcon({
      html: `<div class="map-group-marker">
             ${leaderHtml}
             <div class="map-group-svgpin ${pinTipoClass}${liveClass}" style="transform:translate(-50%,-100%) scale(${pinScale})">
               ${pinSvg}
               <span class="map-group-pin-badge">${escapeHtmlLive(g.id)}</span>
             </div>
             ${arrowHtml}
           </div>`,
      className: "", iconAnchor: [0, 0],
    });
  }

  function renderLiveMarkers() {
    groupMarkers.forEach((m) => map.removeLayer(m));
    groupMarkers = [];
    gruposDoControlador.forEach((g) => {
      const m = L.marker([g.lat, g.lng], { icon: liveGroupIcon(g) }).addTo(map);
      groupMarkers.push(m);
    });
  }

  // Marcador de anotação no mapa (mesmo .map-text-pin do editor, textIcon em editor.js) — só a
  // renderização, sem clique (aqui não abre pra editar). Anotação é do croqui inteiro, então
  // aparece sempre, independente de qual controlador (ct=) está em foco.
  function textIcon(t) {
    const full = t.titulo || t.texto || "";
    const label = full.length > 34 ? full.slice(0, 34) + "…" : full;
    const temAnexos = (t.anexos || []).length > 0;
    const scale = (t.pinScale || 1) * arrowZoomFactor();
    const rotationDeg = t.rotationDeg || 0;
    return L.divIcon({
      html: `<div class="map-text-pin" style="transform:rotate(${rotationDeg}deg) scale(${scale});transform-origin:13px 13px;" title="${escapeHtmlLive(t.texto || full)}">
               <span class="map-text-pin-icon">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>
               </span>
               <span class="map-text-pin-label">${escapeHtmlLive(label)}</span>
               ${temAnexos ? `<span class="map-text-pin-clip" title="${t.anexos.length} anexo(s)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.1a2 2 0 1 1-2.83-2.83l8.49-8.48"/></svg></span>` : ""}
             </div>`,
      className: "", iconSize: [210, 26], iconAnchor: [13, 13],
    });
  }

  let textMarkers = [];
  function renderTextMarkers() {
    textMarkers.forEach((m) => map.removeLayer(m));
    textMarkers = [];
    (detail.textos || []).forEach((t) => {
      const m = L.marker([t.lat, t.lng], { icon: textIcon(t) }).addTo(map);
      textMarkers.push(m);
    });
  }

  function updateTimestamp() {
    const now = new Date();
    document.getElementById("legendUpdated").textContent =
      "Última atualização: " + now.toLocaleTimeString("pt-BR") + " - " + now.toLocaleDateString("pt-BR");
  }

  function renderTudo() {
    montarEstadoDerivado();
    renderControladorInfo();
    renderLiveGroups();
    renderTextos();
    renderLiveMarkers();
    renderTextMarkers();
    updateTimestamp();
  }

  // Corrida contra um teto de 1.5s (não trava a tela se o Supabase estiver lento/fora do ar).
  // Se a resposta chegar DEPOIS do teto, `aplicar` ainda roda (a sincronização continua em
  // segundo plano) e, como já tínhamos desenhado, redesenha tudo de novo com o dado fresco —
  // sem isso, dado que só chegasse atrasado (ex.: uma anotação) nunca aparecia na tela.
  let jaRenderizouUmaVez = false;
  if (croquiId && typeof sincronizarDaSupabaseSeNecessario === "function") {
    await Promise.race([
      sincronizarDaSupabaseSeNecessario(croquiId, (remoto) => {
        aplicarPosicoesRemotasEm(detail, remoto);
        if (jaRenderizouUmaVez) renderTudo();
      }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  // Zoom bem fechado só quando vem do Cockpit (tem &ct= na URL) — nesse caso o interesse é um
  // controlador específico, faz sentido já chegar de perto. Sem ct= (uso normal dentro do
  // próprio croqui-prototipo) mantém o zoom mais aberto do setView lá em cima, como sempre foi.
  // O retângulo vermelho da área não é desenhado — só usado por baixo dos panos pro cálculo.
  // Depois da sincronização de propósito, pra usar a área já atualizada (não a local/antiga).
  if (ctParam && detail.area) {
    const bounds = L.latLngBounds(detail.area);
    const fitZoom = map.getBoundsZoom(bounds, false, [4, 4]);
    map.setView(bounds.getCenter(), Math.max(fitZoom, 21), { animate: false });
  }

  jaRenderizouUmaVez = true;
  renderTudo();
  setInterval(tick, 1000);
})();
