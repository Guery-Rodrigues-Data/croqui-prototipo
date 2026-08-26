// Apresentação em tempo real — tela só de leitura (não edita nada), escopo de UM controlador.
// As cores/contagens dos grupos focais são simuladas localmente (setInterval), sem backend real.

function escapeHtmlLive(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const params = new URLSearchParams(location.search);
const croquiId = params.get("id");
const ctParam = params.get("ct");
const detail = getCroquiDetail(croquiId);

const controlador = (detail.controladores || []).find((c) => c.id === ctParam) || (detail.controladores || [])[0] || null;
const gruposDoControlador = controlador ? detail.grupos.filter((g) => g.controladorId === controlador.id) : [];

document.getElementById("backLink").href = croquiId ? `editor-croqui.html?id=${croquiId}` : "cadastro-croqui.html";
document.getElementById("headerCT").textContent = controlador ? controlador.id : "sem controlador";
document.getElementById("liveBadgeCt").textContent = controlador ? controlador.id : "—";

// ---------- ciclo simulado por grupo focal ----------
// Veicular passa por vermelho → verde → amarelo → vermelho; pedestre só alterna vermelho/verde
// (simplificação didática do ciclo real — os tempos aqui não vêm de nenhum plano semafórico de verdade).
// Lógica compartilhada em assets/app.js (liveInitialState / liveTickState / liveDotsHtml).

const liveState = {};
gruposDoControlador.forEach((g) => { liveState[g.id] = liveInitialState(g.id, g.tipo, controlador?.cicloSegundos, controlador?.estagioTotal); });

function tick() {
  gruposDoControlador.forEach((g) => liveTickState(liveState[g.id], g.tipo, controlador?.cicloSegundos, controlador?.estagioTotal));
  renderLiveGroups();
  renderLiveMarkers();
  updateTimestamp();
}

// ---------- controlador / ciclo (cabeçalho da sidebar) ----------

function renderControladorInfo() {
  const slot = document.getElementById("liveControladorSlot");
  const cycleSlot = document.getElementById("liveCycleSlot");
  if (!controlador) {
    slot.innerHTML = `<p class="empty-note">Este croqui não tem controlador associado.</p>`;
    cycleSlot.innerHTML = "";
    return;
  }
  slot.innerHTML = `
    <div class="controlador-badge">
      <span class="controlador-badge-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="2" width="8" height="18" rx="4"/><circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/></svg>
      </span>
      <span class="controlador-badge-text">
        <strong>Controlador ${escapeHtmlLive(controlador.id)}</strong>
        <span>${escapeHtmlLive(controlador.via || "")}</span>
      </span>
    </div>`;
  cycleSlot.innerHTML = `
    <div class="live-cycle-row">
      <span><span class="label">Ciclo:</span> <strong>${controlador.cicloSegundos}s</strong></span>
      <span><span class="label">Estágio:</span> <strong class="is-stage">${controlador.estagioAtual}/${controlador.estagioTotal}</strong></span>
    </div>`;
}

// ---------- lista lateral ----------

const svgPedestreLive = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none"/><path d="M9 21l1.5-6L9 12l1-4.5C10.4 6.4 11.1 6 12 6s1.6.4 2 1.5L15 12l-1.5 3L15 21"/></svg>';

function renderLiveGroups() {
  document.getElementById("liveGruposCount").textContent = gruposDoControlador.length;
  const list = document.getElementById("liveGruposList");
  if (!gruposDoControlador.length) {
    list.innerHTML = `<p class="empty-note">Nenhum grupo focal cadastrado neste controlador.</p>`;
    return;
  }
  list.innerHTML = gruposDoControlador.map((g) => {
    const st = liveState[g.id];
    const descricao = g.tipo === "veicular"
      ? `<span class="entity-item-sub-icon">${iconDirecao(g.direcao)}</span>${escapeHtmlLive(g.direcao)}`
      : "Pedestre";
    return `
      <div class="live-group-card">
        <div class="live-group-dots">${liveDotsHtml(g.tipo, st.cor)}</div>
        <div class="live-group-main">
          <div class="live-group-head">
            <span class="live-group-id">${escapeHtmlLive(g.id)}</span>
            <span class="live-group-icons">${g.tipo === "veicular" ? ICON_CAR : ICON_PEDESTRE_SVG}</span>
          </div>
          <div class="live-group-address">${descricao}</div>
          <div class="live-group-mv">
            <span class="label">Muda em</span>
            <span class="value">${st.restante}s</span>
          </div>
        </div>
      </div>`;
  }).join("");
}

// ---------- mapa ----------

const map = L.map("map", { zoomControl: false }).setView([detail.lat, detail.lng], 18);
const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri",
  maxZoom: 19,
});
const mapaLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri",
  maxZoom: 19,
  maxNativeZoom: 16,
});
let currentLayer = "satelite";
satelliteLayer.addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

function toggleMapLayer() {
  const btn = document.getElementById("layerToggleBtn");
  if (currentLayer === "satelite") {
    map.removeLayer(satelliteLayer);
    mapaLayer.addTo(map);
    currentLayer = "mapa";
    btn.title = "Ver satélite";
  } else {
    map.removeLayer(mapaLayer);
    satelliteLayer.addTo(map);
    currentLayer = "satelite";
    btn.title = "Ver mapa";
  }
}

if (detail.area) {
  L.polygon(detail.area, { color: "#e0342b", weight: 2, fillColor: "#e0342b", fillOpacity: 0.15 }).addTo(map);
}

let groupMarkers = [];

// Mesma ideia do editor (assets/editor.js): arrowLat/arrowLng é o ponto geográfico real
// onde a flecha fica ancorada no chão (não desgruda em nenhum zoom); só o TAMANHO
// (arrowScale) é guardado como se fosse sempre neste zoom de referência, escalado pro
// zoom atual na hora de desenhar.
const ARROW_REFERENCE_ZOOM = 19;
function arrowZoomFactor() {
  return Math.pow(2, map.getZoom() - ARROW_REFERENCE_ZOOM);
}
function groupArrowLatLng(g) {
  if (g.arrowLat != null && g.arrowLng != null) return L.latLng(g.arrowLat, g.arrowLng);
  const pt = map.latLngToContainerPoint([g.lat, g.lng]);
  return map.containerPointToLatLng(L.point(pt.x, pt.y - 30));
}

function liveGroupIcon(g) {
  const st = liveState[g.id];
  const tipoClass = g.tipo === "veicular" ? "map-group-pin--veicular" : "map-group-pin--pedestre";
  const pinScale = g.pinScale || (g.tipo === "pedestre" ? 0.85 : 1);
  const arrowScale = (g.arrowScale || 1) * arrowZoomFactor();
  let ax = 0, ay = 0;
  if (g.tipo === "veicular") {
    const pinPt = map.latLngToContainerPoint([g.lat, g.lng]);
    const arrowPt = map.latLngToContainerPoint(groupArrowLatLng(g));
    ax = arrowPt.x - pinPt.x;
    ay = arrowPt.y - pinPt.y;
  }

  let arrowHtml = "";
  let leaderHtml = "";
  if (g.tipo === "veicular") {
    arrowHtml = `<span class="map-group-pin-arrow" style="left:${ax}px; top:${ay}px; transform:translate(-50%,-50%) rotate(${g.rotationDeg}deg) scale(${arrowScale})">${iconDirecao(g.direcao)}</span>`;
    const dist = Math.hypot(ax, ay);
    if (dist > 45) {
      const lineDeg = (Math.atan2(ax, -ay) * 180) / Math.PI;
      leaderHtml = `<span class="map-group-leader-line" style="width:${Math.round(dist)}px; transform:rotate(${lineDeg - 90}deg);"></span>`;
    }
  }
  const pedestreHtml = g.tipo === "pedestre"
    ? `<span class="map-group-pin-arrow" style="left:20px; top:0; transform:translate(-50%,-50%); color:#146b3f;">${svgPedestreLive}</span>` : "";

  return L.divIcon({
    html: `<div class="map-group-marker">
             ${leaderHtml}
             <div class="map-group-pin ${tipoClass}" style="transform:translate(-50%,-50%) scale(${pinScale})"><span>${escapeHtmlLive(g.id)}</span></div>
             <div class="pin-live-dots" style="position:absolute; left:16px; top:-16px;">${liveDotsHtml(g.tipo, st.cor)}</div>
             ${arrowHtml}${pedestreHtml}
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

function updateTimestamp() {
  const now = new Date();
  document.getElementById("legendUpdated").textContent =
    "Última atualização: " + now.toLocaleTimeString("pt-BR") + " - " + now.toLocaleDateString("pt-BR");
}

// ---------- bootstrap ----------

renderControladorInfo();
renderLiveGroups();
renderLiveMarkers();
updateTimestamp();
setInterval(tick, 1000);
