// Editor de Croqui — serve pra criar E editar (mesma tela, mesmos passos).
// Sem framework: estado em variáveis simples + re-render manual das listas/markers.

const params = new URLSearchParams(location.search);
let croquiId = params.get("id");
let detail = getCroquiDetail(croquiId);

// Croqui novo (sem id) chega da listagem com lat/lng/zoom do ponto que o usuário
// estava vendo lá — sobrescreve o centro genérico de Curitiba que getCroquiDetail(null)
// devolve por padrão. Croqui existente ignora isso e abre sempre no lugar dele.
let initialZoom = 19;
if (!croquiId) {
  const qLat = parseFloat(params.get("lat"));
  const qLng = parseFloat(params.get("lng"));
  const qZoom = parseFloat(params.get("zoom"));
  if (!Number.isNaN(qLat) && !Number.isNaN(qLng)) {
    detail.lat = qLat;
    detail.lng = qLng;
  }
  if (!Number.isNaN(qZoom)) initialZoom = qZoom;
}

let activeTool = "cursor";
let areaLayer = null;
let areaImagemLayer = null; // imagem importada, sobreposta exatamente nos limites de detail.area
let groupLayers = [];
let textLayers = [];
let editingEntity = null;   // { kind:'grupo'|'texto', id, ... } — o que está sendo posicionado/editado agora
let previewMarker = null;   // marcador arrastável ativo enquanto editingEntity existe
let arrowMoveHandle = null;  // a própria flecha, arrastável livremente (posição livre, sem cálculo de ângulo/distância)
let rotateHandle = null;    // bolinha grudada bem em cima da flecha (sem haste) — só ângulo (rotação)
let arrowResizeHandles = []; // 4 quadradinhos nos cantos da caixa da flecha — arrasta qualquer um pra escalar (uniforme), isolado do pin
let arrowSelected = false;  // a flecha só ganha os controles acima depois de clicada
let pinMoveHandle = null;   // alça de mover o pin do grupo — mesmo ícone/padrão da alça da flecha, aparece só depois de clicar no pin
let pinSelected = false;    // idem arrowSelected, pro pin; pin e flecha são mutuamente exclusivos (armar um desarma o outro)
let textRotateHandle = null; // mesma ideia do rotateHandle da flecha, só que pro balão da anotação
let textResizeHandles = [];  // idem arrowResizeHandles, pro balão da anotação
let pendingRepetidorFor = null; // grupo focal aguardando o clique no mapa pra posicionar o repetidor dele
let selectedControladorId = null; // qual controlador está "ativo" — filtra a lista de grupos e o que aparece em destaque no mapa
let filtroVeicular = true; // painel de Filtros — mostrar grupos veiculares no mapa/lista
let filtroPedestre = true; // painel de Filtros — mostrar grupos de pedestre no mapa/lista
let mostrarDirecoes = true; // painel de Filtros — mostrar a seta de direção nos marcadores veiculares do mapa
// botão próprio na toolbar (toggleAreaLinhaBtn) — mostrar a linha vermelha da área do
// cruzamento já salva. Pedido da operação: depois que a área está definida, a linha
// atrapalha a leitura do croqui com vários grupos focais/flechas em cima; desliga só o
// traço/preenchimento (ver destacarAreaComoAlvo), não desfaz nem esconde a área em si.
// Croqui reaberto já com área salva (detail.area) começa com a linha desativada — só quem
// está desenhando a área pela primeira vez (ainda sem detail.area) precisa vê-la de cara.
let mostrarArea = !detail.area;
let testeTempoRealAtivo = false; // "Testar tempo real" — preview rápido das cores direto na lista, sem sair do editor
let testeLiveState = {};
let testeLiveInterval = null;
let testeElapsedSegundos = 0; // segundos corridos desde que "Testar tempo real" foi ligado — move a agulha do painel de fases (renderTestePainel)
let editingArea = false; // arrastando os vértices de uma área já desenhada (em vez de desenhar uma nova)
let areaEditHandles = [];
let controladorEscolhaSelecionadoId = null; // id de um candidato da lista, ou "novo" — só confirma ao clicar Salvar

let areaVertices = [];
let tempVertexMarkers = [];
let tempLine = null;

let reguaPontos = []; // latlngs marcados com a ferramenta "Régua" (ver addReguaPonto)
let reguaMarkers = [];
let reguaLine = null;

let pendingAreaVertices = null; // área capturada pela visão atual, ainda não confirmada — dá pra ajustar antes de salvar
let pendingAreaLayer = null;
let pendingAreaHandles = []; // modo "pontos": 4 marcadores numerados, cada um solto
let pendingAreaResizeHandles = []; // modo "rect": 4 cantos, redimensiona mantendo retângulo
let pendingAreaMoveHandle = null; // alça central — arrasta o quadrado inteiro de uma vez, sem mexer ponto a ponto
// Como no dia a dia a captura já nasce de um "print" do mapa (naturalmente retangular),
// abre em modo "rect" (mover/redimensionar só, igual à imagem importada) — mais simples
// que já cair ajustando 4 pontos soltos. "pontos" é opt-in, pra quando o cruzamento real
// não é um retângulo alinhado à tela e precisa de um ajuste mais fino.
let pendingAreaMode = "rect";

// ---------- ícones ----------

const ARROW_DX_DEFAULT = 0;   // px — posição padrão (só pra grupo novo, nunca arrastado) da flecha em relação ao pin
const ARROW_DY_DEFAULT = -65; // > LEADER_LINE_THRESHOLD, pra já nascer separada do pino com a linha fina conectando os dois
const LEADER_LINE_THRESHOLD = 45; // px de tela — a partir daqui desenha a linha fina ligando pin e flecha

// Faixa de pedestre (zebra) — a marcação no chão do grupo focal pedestre, mesmo papel que
// a flecha tem pro veicular (pedido da operação: pedestre também precisa de algo no chão
// indicando por onde passa a faixa, já que hoje só o pino existe, sem nenhuma referência
// de direção/posição da travessia). SVG do redesenho do Guery (Documents/Icones/Vector.svg).
const ICON_FAIXA_PEDESTRE = `<svg viewBox="0 0 29 18" fill="currentColor"><path d="M4.19385 0.5C4.38271 0.501098 4.57761 0.50672 4.76807 0.523438C5.02937 0.546379 5.26839 0.664167 5.44873 0.821289C5.62896 0.978328 5.7863 1.20639 5.8335 1.48437C5.87399 1.72284 5.86183 2.03306 5.86182 2.18164V2.18262L5.86084 15.1719C5.86088 15.5366 5.86417 15.9183 5.85693 16.2939C5.85223 16.5381 5.76743 16.8016 5.60596 17.0068C5.47649 17.1712 5.32916 17.2915 5.15088 17.3711C4.98712 17.4441 4.82081 17.4708 4.69287 17.4893L4.6626 17.4941H4.63135C4.21536 17.502 3.79763 17.5006 3.38623 17.498H2.14795C1.93682 17.4949 1.42037 17.5505 0.997559 17.2363C0.663914 16.9885 0.551759 16.646 0.516113 16.3594C0.485242 16.1107 0.507242 15.7971 0.507324 15.6523L0.508301 14.3848L0.507324 2.68359C0.507238 2.36668 0.505021 2.02765 0.513184 1.69727C0.517 1.54305 0.559632 1.39198 0.60791 1.27246C0.656958 1.15112 0.72834 1.0198 0.820801 0.911133L0.935059 0.796875C1.21054 0.560658 1.54783 0.52495 1.7251 0.506836L1.74951 0.504883H1.7749L3.65478 0.501953L4.19385 0.5ZM11.2007 0.501953C11.5333 0.502017 11.9328 0.489977 12.314 0.523438C12.5751 0.546471 12.8144 0.664236 12.9946 0.821289C13.1748 0.978322 13.3322 1.2065 13.3794 1.48437C13.4199 1.72283 13.4068 2.03308 13.4067 2.18164V15.1709L13.4019 16.2939C13.3971 16.5382 13.3125 16.8015 13.1509 17.0068C13.0214 17.1713 12.8742 17.2915 12.6958 17.3711C12.5321 17.4441 12.3666 17.4708 12.2388 17.4893L12.2075 17.4941H12.1763C11.7603 17.502 11.3425 17.5006 10.9312 17.498H9.69287C9.48149 17.495 8.96596 17.5502 8.54346 17.2363C8.20959 16.9885 8.09767 16.6461 8.06201 16.3594C8.03113 16.1106 8.05216 15.7971 8.05225 15.6523L8.0542 14.3848L8.05322 2.68359C8.05314 2.36668 8.04994 2.02765 8.05811 1.69727C8.06192 1.54298 8.1055 1.392 8.15381 1.27246C8.20287 1.15109 8.2742 1.01982 8.3667 0.911133L8.47998 0.796875C8.75546 0.560464 9.09266 0.524959 9.27002 0.506836L9.29541 0.504883H9.31982L11.1997 0.501953H11.2007ZM18.7466 0.501953C19.079 0.502005 19.4779 0.490002 19.8589 0.523438C20.1202 0.546377 20.3592 0.664189 20.5395 0.821289C20.7198 0.978328 20.8771 1.20639 20.9243 1.48437C20.9648 1.72284 20.9526 2.03305 20.9526 2.18164V2.18262L20.9517 15.1719C20.9517 15.5366 20.955 15.9183 20.9478 16.2939C20.943 16.5381 20.8583 16.8016 20.6968 17.0068C20.5673 17.1712 20.42 17.2915 20.2417 17.3711C20.0781 17.444 19.9125 17.4708 19.7847 17.4893L19.7534 17.4941H19.7222C19.3062 17.502 18.8885 17.5006 18.477 17.498H17.2388C17.0276 17.4949 16.5112 17.5505 16.0884 17.2363C15.7548 16.9885 15.6436 16.646 15.6079 16.3594C15.577 16.1106 15.5981 15.7971 15.5981 15.6523L15.5991 14.3848L15.5981 2.68359C15.5981 2.36668 15.5958 2.02765 15.604 1.69727C15.6078 1.54306 15.6505 1.39197 15.6987 1.27246C15.7478 1.15114 15.8192 1.0198 15.9116 0.911133L16.0259 0.796875C16.3014 0.560619 16.6386 0.524951 16.8159 0.506836L16.8403 0.504883H16.8657L18.7456 0.501953H18.7466ZM26.2915 0.501953C26.6241 0.502017 27.0236 0.489976 27.4048 0.523438C27.666 0.546452 27.9052 0.664218 28.0854 0.821289C28.2656 0.978324 28.423 1.20647 28.4702 1.48437C28.5107 1.72283 28.4976 2.03307 28.4976 2.18164V15.1709C28.4976 15.5358 28.4999 15.9181 28.4927 16.2939C28.488 16.5382 28.4033 16.8015 28.2417 17.0068C28.1122 17.1713 27.965 17.2915 27.7866 17.3711C27.623 17.444 27.4575 17.4708 27.3296 17.4893L27.2983 17.4941H27.2681C26.8519 17.502 26.4335 17.5006 26.022 17.498H24.7847C24.5735 17.4949 24.0571 17.5504 23.6343 17.2363C23.3005 16.9885 23.1885 16.6461 23.1528 16.3594C23.122 16.1106 23.143 15.7971 23.1431 15.6523L23.145 14.3848L23.144 2.68359C23.144 2.36668 23.1408 2.02765 23.1489 1.69727C23.1527 1.54299 23.1963 1.392 23.2446 1.27246C23.2937 1.15109 23.365 1.01982 23.4575 0.911133L23.5708 0.796875C23.8462 0.560464 24.1834 0.524963 24.3608 0.506836L24.3862 0.504883H24.4116L26.2905 0.501953H26.2915Z"/></svg>`;

// A flecha representa algo pintado no chão (a pista) — precisa ficar "grudada" no mesmo
// ponto do cruzamento em qualquer zoom. A posição (arrowLat/arrowLng) já é um ponto
// geográfico de verdade, então não precisa de conversão nenhuma. Só o TAMANHO
// (arrowScale) é guardado como se estivesse sempre neste zoom de referência — na hora de
// desenhar, escalamos pra cima/baixo conforme o zoom atual (mais zoom out = flecha
// visualmente menor, igual aconteceria com uma marcação real no chão).
const ARROW_REFERENCE_ZOOM = 19;
function arrowZoomFactor() {
  return Math.pow(2, map.getZoom() - ARROW_REFERENCE_ZOOM);
}

// Latlng absoluto de onde a flecha de um grupo (salvo ou em edição) está ancorada no
// chão. arrowLat/arrowLng é o ponto real; só cai no padrão (offset fixo a partir do pin)
// pra grupos que nunca tiveram a flecha tocada — a partir da primeira vez que o usuário
// arrasta, vira ponto geográfico de verdade e não desgruda mais do chão em nenhum zoom.
function groupArrowLatLng(g) {
  if (g.arrowLat != null && g.arrowLng != null) return L.latLng(g.arrowLat, g.arrowLng);
  return pixelOffsetLatLng(L.latLng(g.lat, g.lng), ARROW_DX_DEFAULT, ARROW_DY_DEFAULT);
}

// Pin e flecha são elementos IRMÃOS, ambos ancorados no mesmo ponto (0,0 do wrapper,
// que o Leaflet posiciona exatamente no lat/lng do grupo focal) — cada um com seu
// próprio transform (escala/posição/rotação), sem um afetar o outro. A posição da
// flecha é um ponto geográfico próprio (arrowLat/arrowLng); o CSS left/top é só a
// projeção dele em pixels de tela relativa ao pin, recalculada a cada render.
// Rótulo exibido no pino: se o grupo já tem id (salvo), usa ele; se ainda não foi salvo,
// mostra em tempo real o "G" que a fase escolhida no momento vai gerar (sem gravar nada).
// Centralizado aqui (não só no clique da fase) porque groupIcon() é reconstruído toda vez
// que qualquer campo do formulário muda — tipo, direção, rotação, arrastar — e o rótulo
// precisa continuar refletindo a fase mesmo depois dessas outras edições.
function previewGrupoId(g) {
  if (g.id) return g.id;
  if (g.fase == null) return "";
  return nextGrupoId(g.fase);
}

function groupIcon(g, selected, dimmed) {
  const repetidorClass = g.repetidorDe ? " is-repetidor" : "";
  const dimmedClass = dimmed ? " is-dimmed" : "";
  // Pino de pedestre nasce um pouco menor que o veicular por padrão (sem precisar
  // redimensionar manualmente) — só quando não há pinScale próprio já salvo.
  const pinScale = g.pinScale || (g.tipo === "pedestre" ? 0.85 : 1);
  const arrowScale = (g.arrowScale || 1) * arrowZoomFactor();
  // Veicular e pedestre têm, os dois, uma marcação no chão (flecha / faixa de zebra) —
  // mesma mecânica de posição/rotação/escala pros dois, só troca o ícone.
  const pinPt = map.latLngToContainerPoint([g.lat, g.lng]);
  const arrowPt = map.latLngToContainerPoint(groupArrowLatLng(g));
  const ax = arrowPt.x - pinPt.x;
  const ay = arrowPt.y - pinPt.y;
  // "Testar tempo real": estado simulado do grupo. Antes só a marcação no chão mudava de cor
  // pro veicular (pedestre também colorindo o próprio pino, que não tinha marcação nenhuma).
  // Agora que o pino é o semáforo/pedestre do Guery (Documents/Icones), o pino reage nos
  // dois tipos: no semáforo veicular apaga as luzes que não são a atual (ver semaforo-luz*
  // em style.css); no pino de pedestre, um brilho na cor do estado. Só liga pro controlador
  // selecionado — testeLiveState guarda o estado de TODOS os controladores do croqui, mas o
  // painel de fases (renderTestePainel) só mostra o selecionado; sem esse filtro aqui, um
  // grupo de outro controlador (só esmaecido, não escondido) piscava com uma cor que não
  // tinha nada a ver com o que o painel mostrava.
  const liveState = testeTempoRealAtivo && g.controladorId === selectedControladorId ? testeLiveState[faseKey(g)] : null;
  const liveClass = liveState ? ` is-live-${liveState.cor}` : "";
  const rotationDeg = g.rotationDeg || 0;
  const groundIconSvg = g.tipo === "veicular" ? iconDirecao(g.direcao) : ICON_FAIXA_PEDESTRE;
  let arrowHtml = "";
  let leaderHtml = "";
  if (mostrarDirecoes) {
    arrowHtml = `<span class="map-group-pin-arrow${liveClass}" style="left:${ax}px; top:${ay}px; transform:translate(-50%,-50%) rotate(${rotationDeg}deg) scale(${arrowScale})">${groundIconSvg}</span>`;
    const dist = Math.hypot(ax, ay);
    if (dist > LEADER_LINE_THRESHOLD) {
      const lineDeg = (Math.atan2(ax, -ay) * 180) / Math.PI; // ângulo geométrico até a marcação — independente da rotação dela
      leaderHtml = `<span class="map-group-leader-line" style="width:${Math.round(dist)}px; transform:rotate(${lineDeg - 90}deg);"></span>`;
    }
  }
  const pinTipoClass = g.tipo === "veicular" ? "map-group-svgpin--veicular" : "map-group-svgpin--pedestre";
  const pinSvg = g.tipo === "veicular" ? ICON_SEMAFORO_PIN : ICON_PEDESTRE_PIN;
  // Pino agora é o desenho completo (balão com ponta) em vez do círculo com o id dentro —
  // a ponta é o ponto exato do lat/lng (por isso o anchor vira -100% no eixo Y, não mais
  // -50%); o id vira um badge grudado embaixo do pino, já que o SVG não tem espaço pra texto.
  // Classe própria (map-group-svgpin, não mais map-group-pin) pra não colidir com o pino
  // antigo (círculo + letra) que a tela de Apresentação em tempo real (apresentacao.js)
  // ainda usa — telas diferentes, sem motivo pra redesenhar as duas juntas agora.
  return L.divIcon({
    html: `<div class="map-group-marker">
             ${leaderHtml}
             <div class="map-group-svgpin ${pinTipoClass}${selected ? " is-selected" : ""}${repetidorClass}${dimmedClass}${liveClass}" style="transform:translate(-50%,-100%) scale(${pinScale})">
               ${pinSvg}
               <span class="map-group-pin-badge">${previewGrupoId(g)}</span>
             </div>
             ${arrowHtml}
           </div>`,
    className: "", iconAnchor: [0, 0],
  });
}

function textIcon(t, selected) {
  const full = t.titulo || t.texto || "";
  const label = full.length > 34 ? full.slice(0, 34) + "…" : full;
  const temAnexos = (t.anexos || []).length > 0;
  // Mesmo tratamento da flecha (arrowZoomFactor): escala com o zoom, como se fosse uma
  // marcação "presa" ao chão do cruzamento, em vez de ficar sempre do mesmo tamanho na
  // tela. Escala a partir do ponto de ancoragem (iconAnchor), não do centro do balão, pra
  // o ícone não "andar" do lat/lng real enquanto cresce/encolhe. pinScale é o ajuste manual
  // do usuário (alças de canto); rotationDeg vem da alça de girar — mesmo padrão da flecha.
  const scale = (t.pinScale || 1) * arrowZoomFactor();
  const rotationDeg = t.rotationDeg || 0;
  return L.divIcon({
    html: `<div class="map-text-pin${selected ? " is-selected" : ""}" style="transform:rotate(${rotationDeg}deg) scale(${scale});transform-origin:13px 13px;" title="${escapeHtml(t.texto || full)}">
             <span class="map-text-pin-icon">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>
             </span>
             <span class="map-text-pin-label">${escapeHtml(label)}</span>
             ${temAnexos ? `<span class="map-text-pin-clip" title="${t.anexos.length} anexo(s)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.1a2 2 0 1 1-2.83-2.83l8.49-8.48"/></svg></span>` : ""}
           </div>`,
    className: "", iconSize: [210, 26], iconAnchor: [13, 13],
  });
}

function vertexIcon(n) {
  return L.divIcon({ html: `<div class="map-vertex-dot">${n}</div>`, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

// ---------- mapa ----------

// Tolerância de clique do Leaflet ao arrastar: por padrão são 3 px entre apertar e soltar
// pra um gesto ainda contar como "clique". No trackpad quase todo clique treme mais que
// isso e vira um arraste minúsculo — aí o `click` que seleciona a flecha / arma o arraste
// do pino nunca dispara ("às vezes seleciona, às vezes não"). Subindo pra 10 px, o clique
// com tremidinha volta a contar como clique.
L.Draggable.prototype.options.clickTolerance = 10;

// Zoom 19 pra abrir já perto do cruzamento mesmo quando ainda não tem área desenhada
// (croqui novo) — mesmo nível usado por fitAreaBounds() quando a área já existe. Se veio
// da listagem com um zoom próprio (initialZoom, ver acima), usa esse em vez do fixo.
const map = L.map("map", { zoomControl: false }).setView([detail.lat, detail.lng], initialZoom);

// maxNativeZoom = resolução real dos tiles (19); maxZoom = até onde deixa o usuário
// zoomar (22) — passado disso o Leaflet amplia o último tile disponível (fica mais
// pixelado, mas dá precisão extra pra clicar/posicionar no desenho do croqui).
const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri",
  maxZoom: 22,
  maxNativeZoom: 19,
});
const mapaLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri",
  maxZoom: 22,
  maxNativeZoom: 16,
});

let currentLayer = "satelite";
satelliteLayer.addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

function toggleMapLayer() {
  const label = document.getElementById("layerToggleLabel");
  if (currentLayer === "satelite") {
    map.removeLayer(satelliteLayer);
    mapaLayer.addTo(map);
    currentLayer = "mapa";
    label.textContent = "Satélite"; // rótulo mostra a camada que o clique vai ativar, não a atual
  } else {
    map.removeLayer(mapaLayer);
    satelliteLayer.addTo(map);
    currentLayer = "satelite";
    label.textContent = "Mapa";
  }
}

// ---------- pins dos outros croquis (contexto ao dar zoom out) ----------
// Antes o mapa do editor só existia pro croqui atual — dar zoom out mostrava mapa vazio,
// sem noção de quais outros cruzamentos estão por perto. Reaproveita o mesmo pino da
// listagem (index.html), só que acinzentado — sinaliza "não é o croqui que você
// tá editando agora" — clicar troca de croqui direto, sem passar pela listagem.
const outrosCroquisPinSvg = () => `
  <div class="listagem-marker listagem-marker--outro">
    <svg viewBox="0 0 49.536 61.92" xmlns="http://www.w3.org/2000/svg">
      <path d="M24.768 61.92C16.4604 54.8508 10.2555 48.2847 6.1533 42.2217C2.0511 36.1587 0 30.5472 0 25.3872C0 17.6472 2.4897 11.481 7.4691 6.8886C12.4485 2.2962 18.2148 0 24.768 0C31.3212 0 37.0875 2.2962 42.0669 6.8886C47.0463 11.481 49.536 17.6472 49.536 25.3872C49.536 30.5472 47.4849 36.1587 43.3827 42.2217C39.2805 48.2847 33.0756 54.8508 24.768 61.92Z" fill="#9ca3af"/>
    </svg>
  </div>`;

const outrosCroquisCluster = L.markerClusterGroup({
  maxClusterRadius: 60,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  iconCreateFunction: (cluster) => {
    const count = cluster.getChildCount();
    const size = count < 10 ? 30 : count < 50 ? 38 : 46;
    return L.divIcon({
      html: `<div class="listagem-cluster listagem-cluster--outro" style="width:${size}px;height:${size}px;">${count}</div>`,
      className: "",
      iconSize: [size, size],
    });
  },
});
listCroquis()
  .filter((c) => c.id !== detail.id)
  .forEach((c) => {
    const icon = L.divIcon({ html: outrosCroquisPinSvg(), className: "", iconSize: [26, 32.5], iconAnchor: [13, 32] });
    const marker = L.marker([c.lat, c.lng], { icon });
    marker.bindTooltip(
      `<strong>${escapeHtml(c.nome)}</strong><span class="listagem-tooltip-id">${escapeHtml(c.id)}</span>`,
      { direction: "top", offset: [0, -26], className: "listagem-tooltip" }
    );
    marker.on("click", () => { location.href = `editor-croqui.html?id=${c.id}`; });
    outrosCroquisCluster.addLayer(marker);
  });
map.addLayer(outrosCroquisCluster);
outrosCroquisCluster.on("layeradd", (e) => e.layer.getElement?.()?.style.setProperty("cursor", "pointer"));

// ---------- testar tempo real (preview rápido, sem sair do editor) ----------

// Grupos da mesma fase abrem/fecham juntos de verdade (é a definição de fase) — por isso o
// estado simulado é por fase do controlador, não por grupo: dois grupos com a mesma fase
// sempre piscam a mesma cor ao mesmo tempo, em vez de cada um sortear a sua.
function faseKey(g) {
  return (g.controladorId || "") + "|" + g.fase;
}

// Duração do ciclo só pra simulação de "Testar tempo real" — sempre 15s, independente do
// cicloSegundos real do controlador (110-130s nos dados de exemplo). Com o ciclo real, as
// cores demoravam demais pra trocar, dificultando testar/depurar o painel. Não mexe no
// cicloSegundos de verdade do controlador (segue mostrado normalmente em outras telas).
const TESTE_LIVE_CICLO_SEGUNDOS = 15;

function toggleTesteTempoReal() {
  testeTempoRealAtivo = !testeTempoRealAtivo;
  if (testeTempoRealAtivo) {
    testeLiveState = {};
    testeElapsedSegundos = 0;
    detail.grupos.forEach((g) => {
      const key = faseKey(g);
      if (testeLiveState[key]) return; // já inicializado por outro grupo da mesma fase
      // Se a fase mistura veicular+pedestre, o ciclo veicular (3 cores) manda no relógio —
      // o pedestre só realça vermelho/verde e ignora o instante de amarelo, sem erro nenhum.
      const tipoCiclo = detail.grupos.some((x) => faseKey(x) === key && x.tipo === "veicular") ? "veicular" : "pedestre";
      // Duração de vermelho/verde vem do ciclo de teste (30s) e dos estágios reais do
      // controlador desse grupo (ver liveCiclosPara em app.js e TESTE_LIVE_CICLO_SEGUNDOS acima).
      const ctrl = (detail.controladores || []).find((c) => c.id === g.controladorId);
      const ciclos = liveCiclosPara(tipoCiclo, TESTE_LIVE_CICLO_SEGUNDOS, ctrl?.estagioTotal);
      const ordem = liveCicloOrdem(ciclos);
      const st = {
        ...liveInitialState(key, tipoCiclo, TESTE_LIVE_CICLO_SEGUNDOS, ctrl?.estagioTotal),
        tipoCiclo,
        cicloSegundos: TESTE_LIVE_CICLO_SEGUNDOS,
        estagioTotal: ctrl?.estagioTotal,
        ciclos,
        ordem,
      };
      // offsetInicial: onde esta fase começa na trilha do painel de teste (ver
      // renderTestePainel) — congelado aqui pra trilha ficar parada e só a agulha andar.
      st.offsetInicial = livePosicaoNaTrilha(st, ciclos, ordem);
      testeLiveState[key] = st;
    });
    testeLiveInterval = setInterval(() => {
      testeElapsedSegundos += 1;
      Object.values(testeLiveState).forEach((st) => liveTickState(st, st.tipoCiclo, st.cicloSegundos, st.estagioTotal));
      renderLists();
      if (!editingEntity) renderMarkers();
      renderTestePainel();
    }, 1000);
  } else if (testeLiveInterval) {
    clearInterval(testeLiveInterval);
    testeLiveInterval = null;
  }
  const btn = document.getElementById("testarLiveBtn");
  btn.classList.toggle("is-active", testeTempoRealAtivo);
  renderLists();
  if (!editingEntity) renderMarkers();
  renderTestePainel();
}

// ---------- painel "programação da fase" (Gantt do ciclo inteiro + agulha do instante atual) ----------
// Mostra, enquanto "Testar tempo real" está ligado, uma linha por fase do controlador
// selecionado com a trilha inteira do ciclo (vermelho/amarelo/verde, na proporção real) e uma
// agulha vermelha compartilhada que varre a trilha em tempo real — mesma ideia da aba "Plano"
// do sistema real, só que ao vivo e para todas as fases ao mesmo tempo.
const TESTE_PAINEL_TRACK_W = 460; // px — largura fixa da trilha (não escala com o ciclo, senão um ciclo longo estoura o painel)

function renderTestePainel() {
  const panel = document.getElementById("testePainel");
  if (!panel) return;
  const ctrl = (detail.controladores || []).find((c) => c.id === selectedControladorId);
  const fasesDoControlador = ctrl
    ? [...new Set(
        detail.grupos
          .filter((g) => g.ativo !== false && g.controladorId === ctrl.id && g.fase != null)
          .map((g) => g.fase)
      )].sort((a, b) => a - b)
    : [];

  if (!testeTempoRealAtivo || !ctrl || !fasesDoControlador.length) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";

  document.getElementById("testePainelControlador").textContent = ctrl.id;
  // Mostra o ciclo de TESTE (30s), não o cicloSegundos real do controlador — é esse valor
  // que de fato rege a trilha/agulha abaixo (ver TESTE_LIVE_CICLO_SEGUNDOS).
  document.getElementById("testePainelCiclo").textContent = `Ciclo ${TESTE_LIVE_CICLO_SEGUNDOS}s (teste)`;

  const cicloSegundos = TESTE_LIVE_CICLO_SEGUNDOS;
  const pxPerSec = TESTE_PAINEL_TRACK_W / cicloSegundos;

  const rowsHtml = fasesDoControlador.map((fase) => {
    const st = testeLiveState[ctrl.id + "|" + fase];
    if (!st) return "";
    const total = st.ordem.reduce((sum, cor) => sum + st.ciclos[cor].duracao, 0);
    let segsHtml = "";
    let pos = 0;
    st.ordem.forEach((cor) => {
      const dur = st.ciclos[cor].duracao;
      // Desenha cada trecho da trilha duas vezes (ciclo atual + o seguinte) pra cobrir o
      // "embrulho" ao redor do início, já que a trilha começa em offsetInicial, não em
      // vermelho — o que cair fora da largura visível é só recortado (overflow hidden).
      [0, total].forEach((repeticao) => {
        const left = pos - st.offsetInicial + repeticao;
        if (left + dur > 0 && left < cicloSegundos) {
          segsHtml += `<span class="teste-fase-seg teste-fase-seg--${cor}" style="left:${(left * pxPerSec).toFixed(1)}px; width:${(dur * pxPerSec).toFixed(1)}px;"></span>`;
        }
      });
      pos += dur;
    });
    return `
      <div class="teste-fase-row">
        <div class="teste-fase-label">
          <span class="pin-live-dot is-active-${st.cor}"></span>
          <span>Fase ${fase}</span>
        </div>
        <div class="teste-fase-track" style="width:${TESTE_PAINEL_TRACK_W}px;">${segsHtml}</div>
      </div>`;
  }).join("");

  document.getElementById("testePainelBody").innerHTML = rowsHtml;
  const needleLeft = (testeElapsedSegundos % cicloSegundos) * pxPerSec;
  document.getElementById("testePainelNeedle").style.left = `${needleLeft.toFixed(1)}px`;
}

// ---------- filtros (Veicular / Pedestre) ----------

function toggleFiltrosPanel() {
  const panel = document.getElementById("filtrosPanel");
  const btn = document.getElementById("filtrosBtn");
  const willOpen = panel.style.display === "none";
  if (willOpen) closeMapSearch();
  panel.style.display = willOpen ? "block" : "none";
  btn.classList.toggle("is-active", willOpen);
}

function syncTodosCheckbox() {
  document.getElementById("fTodos").checked = filtroVeicular && filtroPedestre;
}

document.getElementById("fTodos").addEventListener("change", (e) => {
  filtroVeicular = e.target.checked;
  filtroPedestre = e.target.checked;
  document.getElementById("fVeicular").checked = filtroVeicular;
  document.getElementById("fPedestre").checked = filtroPedestre;
  renderMarkers();
  renderLists();
});
document.getElementById("fVeicular").addEventListener("change", (e) => {
  filtroVeicular = e.target.checked;
  syncTodosCheckbox();
  renderMarkers();
  renderLists();
});
document.getElementById("fPedestre").addEventListener("change", (e) => {
  filtroPedestre = e.target.checked;
  syncTodosCheckbox();
  renderMarkers();
  renderLists();
});
document.getElementById("fDirecoes").addEventListener("change", (e) => {
  mostrarDirecoes = e.target.checked;
  renderMarkers();
});
// Botão próprio na toolbar (não escondido dentro do painel de Filtros) — pedido da
// operação: a linha vermelha da área atrapalha depois que o croqui já está desenhado.
// Só troca o innerHTML do <svg> (não o elemento inteiro), pra não perder o id/listener.
const ICON_AREA_LINHA_ON = `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`;
const ICON_AREA_LINHA_OFF = `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.15 13.15 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>`;
function syncAreaLinhaBtn() {
  const btn = document.getElementById("toggleAreaLinhaBtn");
  btn.classList.toggle("is-active", mostrarArea);
  btn.title = mostrarArea ? "Ocultar linha da área" : "Mostrar linha da área";
  document.getElementById("toggleAreaLinhaIcon").innerHTML = mostrarArea ? ICON_AREA_LINHA_ON : ICON_AREA_LINHA_OFF;
}
syncAreaLinhaBtn(); // reflete o valor inicial de mostrarArea (depende de detail.area) no botão, que no HTML nasce fixo em "ligado"
document.getElementById("toggleAreaLinhaBtn").addEventListener("click", () => {
  mostrarArea = !mostrarArea;
  syncAreaLinhaBtn();
  destacarAreaComoAlvo(activeTool === "veicular" || activeTool === "pedestre");
});
document.addEventListener("click", (e) => {
  const panel = document.getElementById("filtrosPanel");
  if (panel.style.display === "none") return;
  if (panel.contains(e.target) || e.target.closest("#filtrosBtn")) return;
  panel.style.display = "none";
  document.getElementById("filtrosBtn").classList.remove("is-active");
});

// ---------- busca de endereço: abre/fecha pelo ícone de lupa na toolbar ----------

function closeMapSearch() {
  document.getElementById("mapSearch").style.display = "none";
  document.getElementById("mapSearchToggleBtn").classList.remove("is-active");
}

function toggleMapSearch() {
  const box = document.getElementById("mapSearch");
  const willOpen = box.style.display === "none";
  if (willOpen) {
    document.getElementById("filtrosPanel").style.display = "none";
    document.getElementById("filtrosBtn").classList.remove("is-active");
    box.style.display = "block";
    document.getElementById("mapSearchToggleBtn").classList.add("is-active");
    document.getElementById("enderecoInput").focus();
  } else {
    closeMapSearch();
  }
}

document.addEventListener("click", (e) => {
  const box = document.getElementById("mapSearch");
  if (box.style.display === "none") return;
  if (box.contains(e.target) || e.target.closest("#mapSearchToggleBtn")) return;
  closeMapSearch();
});

map.on("click", (e) => {
  if (aguardandoControladorTeste) {
    aguardandoControladorTeste = false;
    document.getElementById("map").style.cursor = "";
    const novo = {
      id: "CT-T" + Math.floor(1000 + Math.random() * 9000),
      lat: e.latlng.lat, lng: e.latlng.lng,
      via: "Controlador de teste", fases: 16, cicloSegundos: 120, estagioAtual: 1, estagioTotal: 4,
    };
    writeControladoresSoltos([...readControladoresSoltos(), novo]);
    renderControladoresSoltosLayer();
    showToast(`Controlador de teste ${novo.id} criado — já aparece no mapa.`);
    return;
  }
  // Fluxo guiado (ver iniciarCapturaAreaSeguindoMapa): enquanto o quadrado ainda está
  // seguindo o mapa (nenhum ajuste manual feito ainda), um clique simples já reposiciona
  // ele ali — mais rápido que arrastar o mapa inteiro pra centralizar no cruzamento. Ao
  // contrário de arrastar o mapa ou as alças do quadrado, clicar NÃO desliga o "seguindo"
  // — dá pra clicar de novo quantas vezes quiser até ajustar de fato (arrastar mover ou
  // redimensionar), que aí sim conta como ajuste manual (ver dragstart das alças).
  if (pendingAreaSeguindoMapa && pendingAreaVertices) {
    pendingAreaVertices = calcularQuadradoNoPonto(e.latlng);
    pendingAreaLayer.setLatLngs(pendingAreaVertices);
    renderPendingAreaShapeHandles();
    repositionPendingAreaMoveHandle();
    return;
  }
  if (editingEntity) return; // já tem um formulário aberto — resolve ele antes (Salvar/Cancelar)
  if (activeTool === "imagem") return; // só as alças reagem — clicar no mapa não faz nada nesse modo
  if (activeTool === "regua") return addReguaPonto(e.latlng);
  if (activeTool === "area") {
    if (editingArea) return; // editando área existente — só os pontos arrastáveis reagem, não o clique no mapa
    return addAreaVertex(e.latlng);
  }
  if ((activeTool === "veicular" || activeTool === "pedestre") && !pendingRepetidorFor && !selectedControladorId) {
    showToast("Delimite a área do cruzamento antes de adicionar grupos focais — o controlador é associado automaticamente.");
    setTool("cursor");
    return;
  }
  if (activeTool === "veicular") return startNewEntity("grupo", "veicular", e.latlng);
  if (activeTool === "pedestre") return startNewEntity("grupo", "pedestre", e.latlng);
  if (activeTool === "texto") return startNewEntity("texto", null, e.latlng);
});

// As alças âmbar ficam a uma distância em PIXELS da flecha — mas cada uma vira um
// L.marker num lat/lng fixo, calculado a partir do zoom do momento em que foi criada.
// Sem isso, dar zoom durante a edição faz a alça "desgrudar" visualmente da seta
// (que continua correta, porque é posicionada por offset em CSS, não por lat/lng).
//
// O zoom do Leaflet por padrão ancora no centro do mapa (ou no cursor, na roda do
// mouse) — não no marcador que está sendo editado. Isso faz o pin/flecha "fugirem" da
// tela ao dar zoom in/out durante a edição. Pra manter o marcador editado sempre no
// mesmo lugar da tela (mesmo tamanho e posição visual antes/depois do zoom), guardamos
// a posição dele em pixels antes do zoom e corrigimos com um pan compensatório depois.
let zoomAnchorLatLng = null;
let zoomAnchorScreenPt = null;

map.on("zoomstart", () => {
  if (!editingEntity || !previewMarker) return;
  zoomAnchorLatLng = previewMarker.getLatLng();
  zoomAnchorScreenPt = map.latLngToContainerPoint(zoomAnchorLatLng);
});

map.on("zoomend", () => {
  // Flechas e anotações são "chão" — precisam redesenhar no novo tamanho/posição
  // relativos ao zoom atual, em tudo que está salvo no mapa (não só no que está em edição).
  refreshGroupMarkerIcons();
  refreshTextMarkerIcons();

  if (!editingEntity) return;
  if (zoomAnchorLatLng && zoomAnchorScreenPt) {
    const drift = map.latLngToContainerPoint(zoomAnchorLatLng).subtract(zoomAnchorScreenPt);
    if (Math.abs(drift.x) > 0.5 || Math.abs(drift.y) > 0.5) {
      map.panBy(drift, { animate: false });
    }
    zoomAnchorLatLng = null;
    zoomAnchorScreenPt = null;
  }
  if (previewMarker) {
    previewMarker.setIcon(editingEntity.kind === "texto" ? textIcon(editingEntity, true) : groupIcon(editingEntity, true));
  }
  repositionArrowMoveHandle();
  repositionRotateHandle();
  repositionArrowResizeHandle();
  repositionTextRotateHandle();
  repositionTextResizeHandle();
});

// ---------- ferramentas ----------

function setTool(tool) {
  // Trocar de ferramenta no meio do ajuste do preview de área (useVisibleAreaAsArea) descarta
  // esse preview — só confirma via botão "Salvar área" no drawStatus (confirmPendingArea).
  if (pendingAreaVertices) {
    clearPendingArea();
    document.getElementById("drawStatus").style.display = "none";
  }
  if (activeTool === "area" && areaVertices.length && tool !== "area") cancelAreaDraw();
  if (editingArea && tool !== "area") finishEditArea();
  if (pendingRepetidorFor && tool !== "veicular" && tool !== "pedestre") pendingRepetidorFor = null;
  if (activeTool === "imagem" && tool !== "imagem") removeAreaImagemHandles();
  if (activeTool === "regua" && tool !== "regua") clearRegua();
  activeTool = tool;
  // Só os botões COM data-tool entram nessa troca de destaque — toggleAreaLinhaBtn (e outros
  // botões da toolbar sem data-tool, tipo areaMenuBtn) controlam o próprio is-active à parte.
  document.querySelectorAll(".editor-tool[data-tool]").forEach((b) => b.classList.toggle("is-active", b.dataset.tool === tool));
  document.getElementById("map").style.cursor = tool === "cursor" || tool === "imagem" ? "" : "crosshair";
  if (tool === "imagem") addAreaImagemHandles();
  // Fluxo guiado: ao ativar veicular/pedestre (sempre pra COLOCAR um novo, editar um já
  // existente não passa por aqui — ver openEditEntity), destaca a área desenhada como o
  // "alvo" do próximo clique, já que é sempre lá dentro que o grupo tem que cair.
  destacarAreaComoAlvo(tool === "veicular" || tool === "pedestre");
  renderHint();
}

function destacarAreaComoAlvo(ativo) {
  if (!areaLayer) return;
  if (!mostrarArea) { areaLayer.setStyle({ opacity: 0, fillOpacity: 0 }); return; }
  areaLayer.setStyle(ativo
    ? { opacity: 1, weight: 4, dashArray: "6 4", fillOpacity: 0.16 }
    : { opacity: 1, weight: 2, dashArray: null, fillOpacity: 0.06 });
}
document.querySelectorAll(".editor-tool[data-tool]").forEach((btn) => btn.addEventListener("click", () => {
  if (btn.dataset.tool === "imagem") {
    if (!detail.area) { showToast("Delimite a área do cruzamento primeiro."); return; }
    if (!detail.areaImagem) { document.getElementById("areaImagemInput").click(); return; }
    setTool(activeTool === "imagem" ? "cursor" : "imagem");
    return;
  }
  setTool(btn.dataset.tool);
}));

// ---------- menu do botão "Área" (junta desenhar/capturar/editar num só) ----------

const ICON_AREA_DESENHAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l8-3 8 4-2 11-10 3-4-3z"/></svg>`;
const ICON_AREA_CAPTURAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4"/></svg>`;
const ICON_AREA_EDITAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>`;

function toggleAreaMenu() {
  const menu = document.getElementById("areaMenu");
  const willOpen = menu.style.display === "none";
  if (willOpen) renderAreaMenu();
  menu.style.display = willOpen ? "flex" : "none";
  document.getElementById("areaMenuBtn").classList.toggle("is-active", willOpen);
}

function closeAreaMenu() {
  document.getElementById("areaMenu").style.display = "none";
  document.getElementById("areaMenuBtn").classList.remove("is-active");
}

function renderAreaMenu() {
  const menu = document.getElementById("areaMenu");
  menu.innerHTML = detail.area ? `
    <button type="button" class="area-menu-item" onclick="chooseEditarArea()">${ICON_AREA_EDITAR} Editar pontos da área</button>
    <button type="button" class="area-menu-item" onclick="chooseCapturarArea()">${ICON_AREA_CAPTURAR} Recapturar do mapa</button>
  ` : `
    <button type="button" class="area-menu-item" onclick="chooseDesenharArea()">${ICON_AREA_DESENHAR} Desenhar ponto a ponto</button>
    <button type="button" class="area-menu-item" onclick="chooseCapturarArea()">${ICON_AREA_CAPTURAR} Capturar área visível do mapa</button>
  `;
}

function chooseDesenharArea() {
  closeAreaMenu();
  setTool("area");
  document.getElementById("areaMenuBtn").classList.add("is-active");
}

function chooseEditarArea() {
  closeAreaMenu();
  activeTool = "area";
  document.querySelectorAll(".editor-tool").forEach((b) => b.classList.toggle("is-active", b.id === "areaMenuBtn"));
  document.getElementById("map").style.cursor = "";
  startEditArea();
  renderHint();
}

function chooseCapturarArea() {
  closeAreaMenu();
  useVisibleAreaAsArea();
}

document.addEventListener("click", (e) => {
  const menu = document.getElementById("areaMenu");
  if (menu.style.display === "none") return;
  if (menu.contains(e.target) || e.target.closest("#areaMenuBtn")) return;
  closeAreaMenu();
});

// ---------- desenhar área ----------

function addAreaVertex(latlng) {
  areaVertices.push(latlng);
  tempVertexMarkers.push(L.marker(latlng, { icon: vertexIcon(areaVertices.length), interactive: false }).addTo(map));
  if (tempLine) map.removeLayer(tempLine);
  if (areaVertices.length > 1) {
    tempLine = L.polygon(areaVertices, { color: "#7c3aed", weight: 2, dashArray: "4 6", fill: false }).addTo(map);
  }
  updateDrawStatus();
}

function updateDrawStatus() {
  const el = document.getElementById("drawStatus");
  if (!areaVertices.length) { el.style.display = "none"; return; }
  el.style.display = "flex";
  el.innerHTML = `
    <span>${areaVertices.length} ponto${areaVertices.length > 1 ? "s" : ""} marcado${areaVertices.length > 1 ? "s" : ""}</span>
    ${areaVertices.length >= 3 ? '<button class="btn-primary" onclick="finishArea()">Concluir área</button>' : ""}
    <button class="btn-secondary" onclick="cancelAreaDraw()" style="padding:6px 12px;font-size:12.5px;">Cancelar</button>
  `;
}

function cancelAreaDraw() {
  tempVertexMarkers.forEach((m) => map.removeLayer(m));
  tempVertexMarkers = [];
  if (tempLine) { map.removeLayer(tempLine); tempLine = null; }
  areaVertices = [];
  updateDrawStatus();
  setTool("cursor");
}

function finishArea() {
  if (areaVertices.length < 3) return;
  tempVertexMarkers.forEach((m) => map.removeLayer(m));
  tempVertexMarkers = [];
  if (tempLine) { map.removeLayer(tempLine); tempLine = null; }
  const vertices = areaVertices.map((ll) => [ll.lat, ll.lng]);
  areaVertices = [];
  updateDrawStatus();
  commitArea(vertices);
}

// ---------- régua (medir distância real, em metros) ----------
// Sem plugin externo — LatLng.distanceTo() do próprio Leaflet já calcula a distância
// geodésica certa (Haversine), então não precisa de nada além disso. Primeiro clique
// marca o ponto A; cada clique seguinte liga do ponto anterior e soma no total — dá pra
// encadear vários trechos, tipo o medidor de distância do Google Maps, não só A-B.
function formatDistanciaMetros(m) {
  if (m >= 1000) return `${Math.round(m)} m (${(m / 1000).toFixed(2)} km)`;
  if (m >= 10) return `${Math.round(m)} m`;
  return `${m.toFixed(1)} m`;
}

function addReguaPonto(latlng) {
  reguaPontos.push(latlng);
  reguaMarkers.push(L.marker(latlng, { icon: reguaPontoIcon(), interactive: false }).addTo(map));
  if (reguaLine) map.removeLayer(reguaLine);
  if (reguaPontos.length > 1) {
    reguaLine = L.polyline(reguaPontos, { color: "#2563a8", weight: 3, dashArray: "2 8", lineCap: "round" }).addTo(map);
  }
  updateReguaStatus();
}

function reguaPontoIcon() {
  return L.divIcon({ html: `<div class="map-regua-dot"></div>`, className: "", iconSize: [10, 10], iconAnchor: [5, 5] });
}

function updateReguaStatus() {
  const el = document.getElementById("drawStatus");
  if (!reguaPontos.length) { el.style.display = "none"; return; }
  el.style.display = "flex";
  if (reguaPontos.length === 1) {
    el.innerHTML = `
      <span>Clique no mapa pra marcar o próximo ponto</span>
      <button class="btn-secondary" onclick="clearRegua()" style="padding:6px 12px;font-size:12.5px;">Limpar</button>
    `;
    return;
  }
  let total = 0;
  for (let i = 1; i < reguaPontos.length; i++) total += reguaPontos[i - 1].distanceTo(reguaPontos[i]);
  const ultimoTrecho = reguaPontos[reguaPontos.length - 2].distanceTo(reguaPontos[reguaPontos.length - 1]);
  const trechoTexto = reguaPontos.length > 2 ? ` · último trecho: ${formatDistanciaMetros(ultimoTrecho)}` : "";
  el.innerHTML = `
    <span><strong>${formatDistanciaMetros(total)}</strong>${trechoTexto}</span>
    <button class="btn-secondary" onclick="clearRegua()" style="padding:6px 12px;font-size:12.5px;">Limpar</button>
  `;
}

function clearRegua() {
  reguaMarkers.forEach((m) => map.removeLayer(m));
  reguaMarkers = [];
  if (reguaLine) { map.removeLayer(reguaLine); reguaLine = null; }
  reguaPontos = [];
  updateReguaStatus();
}

// Usada tanto pelo desenho ponto a ponto quanto pela captura da visão atual do mapa —
// grava a área, associa/atualiza o controlador e reposiciona a câmera.
function commitArea(vertices) {
  detail.area = vertices;
  // Mantém o pin da listagem (detail.lat/lng) alinhado com a área desenhada — sem isso ele
  // fica preso na coordenada genérica/antiga de quando o croqui foi criado, mesmo depois da
  // área real ser desenhada em outro lugar do mapa.
  const areaCenter = L.latLngBounds(vertices).getCenter();
  detail.lat = areaCenter.lat;
  detail.lng = areaCenter.lng;
  renderAreaImagem(); // primeiro, pra ficar embaixo do contorno da área no z-index
  if (areaLayer) map.removeLayer(areaLayer);
  areaLayer = L.polygon(vertices, { color: "#e0342b", weight: 2, fillColor: "#e0342b", fillOpacity: 0.06, interactive: false }).addTo(map);
  destacarAreaComoAlvo(activeTool === "veicular" || activeTool === "pedestre"); // reaplica o toggle "Mostrar linha da área" (fArea) numa camada recém-criada

  if (!detail.controladores) detail.controladores = [];
  if (detail.controladores.length === 0) {
    // Antes criava um controlador em branco na hora, sem perguntar nada. Agora primeiro
    // confere se algum controlador já cadastrado (solto, sem croqui ainda) cai dentro da
    // área desenhada — se cair, vincula ele sozinho; se não, pergunta ao usuário em vez de
    // criar um novo automaticamente (ver conversa sobre controlador independente/virtual).
    const achado = encontrarControladorSoltoNaArea(vertices);
    if (achado) {
      vincularControladorNoCroqui(achado, false);
      showToast(`Controlador ${achado.id} encontrado dentro da área — vinculado automaticamente.`);
      finalizarCommitArea("veicular");
    } else {
      abrirEscolhaControlador();
    }
    return;
  }
  showToast("Área atualizada.");
  finalizarCommitArea();
}

// proximaFerramenta: fluxo guiado — assim que o controlador é definido pela primeira vez
// (achado automaticamente ou escolhido no modal, ver os dois pontos que chamam isso com
// "veicular"), já deixa a ferramenta de grupo focal ativa, com a área destacada como alvo
// (destacarAreaComoAlvo, dentro de setTool) — não precisa procurar o botão certo na
// toolbar. Reeditar uma área que já tinha controlador (showToast "Área atualizada." acima)
// não passa por aqui com esse argumento, então continua voltando pro cursor normalmente.
function finalizarCommitArea(proximaFerramenta) {
  renderControlador();
  let abriuNovoGrupo = false;
  if (proximaFerramenta === "veicular" && detail.area) {
    // Fluxo guiado: em vez de só deixar a ferramenta selecionada esperando um clique no
    // mapa, já abre o formulário do primeiro grupo focal direto — ajustar a posição depois
    // é só clicar no pino e arrastar.
    // Ordem importa: dá o zoom na área ANTES de calcular a posição (senão o offset em
    // pixels sai no zoom afastado do croqui recém-aberto). E nasce deslocado ~70px acima do
    // centro, não no centro — o pino do controlador fica no centro da área, e antes o
    // primeiro grupo caía exatamente em cima dele.
    fitAreaBounds();
    const centroArea = L.latLngBounds(detail.area).getCenter();
    startNewEntity("grupo", "veicular", pixelOffsetLatLng(centroArea, 0, -70));
    abriuNovoGrupo = true;
  } else {
    setTool(proximaFerramenta || "cursor");
    fitAreaBounds();
  }
  autoSave();
  // Não rouba o foco do formulário que acabou de abrir.
  if (!abriuNovoGrupo) {
    const nomeInput = document.getElementById("nomeInput");
    if (!nomeInput.value) nomeInput.focus();
  }
}

// ---------- controlador independente (cadastrado com lat/long próprio, fora do croqui) ----------
// Protótipo do conceito discutido: controlador deixa de "morar dentro" do croqui — pode
// estar sem croqui nenhum (solto, esperando ser vinculado) ou já vinculado a outro croqui
// como "virtual" (o armário físico está lá, mas esse cruzamento também usa ele).

function pontoDentroDoPoligono(lat, lng, vertices) {
  let dentro = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [latI, lngI] = vertices[i];
    const [latJ, lngJ] = vertices[j];
    const intersecta = (lngI > lng) !== (lngJ > lng) &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

function encontrarControladorSoltoNaArea(vertices) {
  return readControladoresSoltos().find((c) => pontoDentroDoPoligono(c.lat, c.lng, vertices)) || null;
}

// virtual=true quando o controlador já pertence a OUTRO croqui (o físico dele está lá) —
// esse croqui passa só a referenciar/usar, não "dono" dele.
// manterSolto: não tira o controlador do pool/mapa depois de vincular — só usado pelo pin
// clicável no mapa (nível de teste), pra ele continuar sempre visível e poder ser clicado
// de novo depois (noutro croqui, ou de novo neste pra "trocar" — ver clique do pin abaixo).
function vincularControladorNoCroqui(ctrl, virtual, manterSolto) {
  const novo = {
    id: ctrl.id, via: ctrl.via, fases: ctrl.fases,
    cicloSegundos: ctrl.cicloSegundos, estagioAtual: ctrl.estagioAtual || 1, estagioTotal: ctrl.estagioTotal,
  };
  if (virtual) {
    novo.virtual = true;
    // Guardado pra "ver no mapa onde está o físico" (mostrarLocalizacaoFisicaControlador)
    // e pro nome do cruzamento de origem aparecer no chip — vem junto no ctrl passado pelo
    // handler de Salvar do modal de escolha (ver controladorEscolhaSalvar).
    novo.croquiOrigemId = ctrl.croquiOrigemId;
    novo.croquiOrigemNome = ctrl.croquiOrigemNome;
    // Posição física real do controlador (do croqui de origem, ou do cadastro do solto) —
    // usada pra "ver localização física" mesmo quando não há croqui de origem.
    novo.posicaoReal = (ctrl.lat != null && ctrl.lng != null) ? [ctrl.lat, ctrl.lng] : null;
  }
  // O controlador (real, físico) não tem posição própria dentro DESSE croqui — a área
  // desenhada é só um recorte/diagrama do cruzamento, então ele ganha uma posição local
  // (centro da área) que o usuário ajusta arrastando o pino (renderControladorPosicaoLocalLayer),
  // sem relação com o lat/lng real do cadastro dele (que pode até estar fora do recorte, no
  // caso de um virtual vindo de outro cruzamento).
  novo.posicaoLocal = [detail.lat, detail.lng];
  detail.controladores.push(novo);
  selectedControladorId = novo.id;
  if (!virtual && !manterSolto) removerControladorSolto(ctrl.id);
  renderControladoresSoltosLayer();
}

// Candidatos pra vincular manualmente: os soltos (sem croqui ainda) + os que já pertencem
// a outros croquis (vincular um desses vira automaticamente "virtual"). Usa só o primeiro
// controlador de cada croqui (via listCroquis(), já carregado) em vez de abrir o detalhe
// completo dos ~1000 croquis a cada tecla digitada na busca — pesado demais pra fazer em
// toda letra digitada. Só busca o detalhe completo (getCroquiDetail) na hora de vincular,
// pra pegar os dados reais (fases/ciclo) do controlador escolhido.
// Exceção: os croquis de teste (CROQUIS_TESTE_COM_TODOS_CONTROLADORES) expõem TODOS os
// controladores próprios (não só o primeiro) — são só 2 croquis, então abrir o detalhe
// completo dos dois não pesa, e é o único jeito de CT-TESTE-02/04 aparecerem na lista.
// lat/lng de cada candidato = o pin do croqui dono dele (não a posição exata do
// controlador, que a gente não tem pra quem ainda não foi vinculado em lugar nenhum) —
// serve como aproximação boa o suficiente pra ordenar por distância (ver renderControladorEscolhaItems).
const CROQUIS_TESTE_COM_TODOS_CONTROLADORES = new Set(["CRQ-TESTE-A", "CRQ-TESTE-B"]);
function controladoresCandidatos() {
  const soltos = readControladoresSoltos().map((c) => ({ ...c, origem: "solto" }));
  const deOutros = listCroquis()
    .filter((c) => c.id !== croquiId && ((c.controladores && c.controladores.length) || c.controladorId))
    .flatMap((c) => {
      // Os controladores de cada croqui já vêm na lista (c.controladores), sem precisar
      // abrir o detalhe completo. Vincular qualquer um deles aqui vira "virtual" — o
      // físico dele continua no croqui de origem. Fallback pro campo antigo c.controladorId.
      const doCroqui = (c.controladores && c.controladores.length)
        ? c.controladores
        : [{ id: c.controladorId, via: c.nome }];
      return doCroqui
        .filter((ct) => !ct.virtual) // só os físicos/próprios desse croqui, não os emprestados
        .map((ct) => ({ id: ct.id, via: ct.via || c.nome, origem: "croqui", croquiNome: c.nome, croquiId: c.id, lat: c.lat, lng: c.lng }));
    });
  return [...soltos, ...deOutros];
}

// Raio de busca do modal de escolha — começa em 2km do centro da área sendo desenhada
// (detail.lat/lng) e vai aumentando 5km a cada vez que rola até o fim da lista (ver o
// listener de scroll mais abaixo), até cobrir todo mundo. Zera a cada abertura.
const CONTROLADOR_ESCOLHA_RAIO_INICIAL_KM = 1;
let controladorEscolhaRaioKm = CONTROLADOR_ESCOLHA_RAIO_INICIAL_KM;
const CONTROLADOR_ESCOLHA_RAIO_INCREMENTO_KM = 1;

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanciaKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function abrirEscolhaControlador() {
  const painel = document.getElementById("controladorEscolha");
  document.getElementById("controladorEscolhaSearch").value = "";
  controladorEscolhaSelecionadoId = null;
  controladorEscolhaRaioKm = CONTROLADOR_ESCOLHA_RAIO_INICIAL_KM;
  renderControladorEscolhaItems("");
  painel.style.display = "flex";
  document.getElementById("controladorEscolhaSearch").focus();
}

function fecharEscolhaControlador() {
  document.getElementById("controladorEscolha").style.display = "none";
  limparDestaqueControladorEscolha();
}

// Clicar num item da lista, além de selecionar, dá um zoom out e destaca (pino + tooltip,
// mesmo visual do "ver localização física" do chip) onde aquele controlador está de
// verdade — só um preview, ainda não vincula nada (isso só acontece no Salvar). Some
// sozinho quando troca de item (substituído) ou fecha o modal (limparDestaqueControladorEscolha).
let controladorEscolhaDestaqueMarker = null;
function destacarControladorEscolhaNoMapa(c) {
  limparDestaqueControladorEscolha();
  if (c.lat == null || c.lng == null) return;
  const icon = L.divIcon({
    html: `<div class="map-controlador-fisico-pin">${ICON_CONTROLADOR_PIN}</div>`,
    className: "", iconSize: [26, 30], iconAnchor: [13, 30],
  });
  controladorEscolhaDestaqueMarker = L.marker([c.lat, c.lng], { icon, interactive: false, zIndexOffset: 1500 }).addTo(map);
  controladorEscolhaDestaqueMarker.bindTooltip(`<strong>${escapeHtml(c.id)}</strong><span class="listagem-tooltip-id">${escapeHtml(c.via || c.croquiNome || "")}</span>`, {
    direction: "top", offset: [0, -18], className: "listagem-tooltip", permanent: true,
  }).openTooltip();
  const bounds = L.latLngBounds([[detail.lat, detail.lng], [detail.lat, detail.lng]]);
  bounds.extend([c.lat, c.lng]);
  // O modal (z-index 900) fica por cima do mapa — sem reservar o espaço dele aqui, o
  // enquadramento podia cair bem atrás do card e o pino de destaque ficava invisível.
  // Empurra o enquadramento pra área livre à direita do modal; se a tela for estreita
  // demais pra sobrar espaço decente ali, empurra pra baixo do modal em vez disso.
  const cardRect = document.querySelector(".controlador-escolha-card").getBoundingClientRect();
  const espacoDireita = window.innerWidth - cardRect.right;
  const margemTopo = Math.max(cardRect.top, 110); // 110 ~ header fixo (não conta pro cardRect, que é só o card)
  const fitOptions = espacoDireita >= 260
    ? { paddingTopLeft: [cardRect.right + 24, margemTopo], paddingBottomRight: [40, 40], maxZoom: 18 }
    : { paddingTopLeft: [40, cardRect.bottom + 24], paddingBottomRight: [40, 40], maxZoom: 18 };
  map.fitBounds(bounds, fitOptions);
}

function limparDestaqueControladorEscolha() {
  if (controladorEscolhaDestaqueMarker) { map.removeLayer(controladorEscolhaDestaqueMarker); controladorEscolhaDestaqueMarker = null; }
}

// Lista ordenada do mais perto pro mais longe da área sendo desenhada agora (detail.lat/lng)
// — com tantos croquis cadastrados, é mais fácil achar o controlador certo assim do que
// vasculhando ~1000 itens em qualquer ordem. Sem busca, só mostra quem está dentro do raio
// atual (controladorEscolhaRaioKm, começa em 5km) — rolar até o fim da lista aumenta o raio
// (ver listener de scroll). Com busca, ignora o raio e procura em tudo.
function renderControladorEscolhaItems(query) {
  const q = (query || "").trim().toLowerCase();
  const buscando = !!q;
  let candidatos = controladoresCandidatos()
    .filter((c) => !q || c.id.toLowerCase().includes(q) || (c.via || "").toLowerCase().includes(q))
    .map((c) => ({ ...c, distanciaKm: c.lat != null && c.lng != null ? distanciaKm(detail.lat, detail.lng, c.lat, c.lng) : Infinity }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
  if (!buscando) candidatos = candidatos.filter((c) => c.distanciaKm <= controladorEscolhaRaioKm);

  const items = document.getElementById("controladorEscolhaItems");
  const scrollAntes = items.scrollTop;
  items.innerHTML = candidatos.length
    ? candidatos.map((c) => `
      <button type="button" class="controlador-escolha-item${controladorEscolhaSelecionadoId === c.id ? " is-selected" : ""}" data-id="${escapeHtml(c.id)}">
        <span class="controlador-escolha-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="2" width="8" height="18" rx="4"/><circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/></svg>
        </span>
        <span class="controlador-escolha-item-main">
          <span class="controlador-escolha-item-id">${escapeHtml(c.id)}</span>
          <span class="controlador-escolha-item-via">${escapeHtml(c.via || "")}</span>
          <span class="controlador-escolha-item-origem${c.origem === "croqui" ? " is-sub" : ""}">${c.origem === "croqui" ? escapeHtml(c.croquiNome && c.croquiNome !== c.id ? c.croquiNome : (c.croquiId || "croqui sem nome")) : "Sem croqui cadastrado"}</span>
        </span>
        ${Number.isFinite(c.distanciaKm) ? `<span class="controlador-escolha-item-distancia">${formatDistanciaKm(c.distanciaKm)}</span>` : ""}
      </button>`).join("")
    : `<p class="croqui-switcher-empty">${buscando ? "Nenhum controlador encontrado." : `Nenhum controlador num raio de ${controladorEscolhaRaioKm}km — role pra baixo ou busque por nome.`}</p>`;
  items.scrollTop = scrollAntes;

  items.querySelectorAll(".controlador-escolha-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      controladorEscolhaSelecionadoId = btn.dataset.id;
      items.querySelectorAll(".controlador-escolha-item").forEach((b) => {
        b.classList.toggle("is-selected", b.dataset.id === controladorEscolhaSelecionadoId);
      });
      const candidato = candidatos.find((x) => x.id === controladorEscolhaSelecionadoId);
      if (candidato) destacarControladorEscolhaNoMapa(candidato);
    });
  });
}

document.getElementById("controladorEscolhaSearch").addEventListener("input", (e) => renderControladorEscolhaItems(e.target.value));
// Chegar perto do fim da lista aumenta o raio de busca — só faz sentido sem busca ativa
// (com busca já mostra tudo, não tem raio pra aumentar).
document.getElementById("controladorEscolhaItems").addEventListener("scroll", (e) => {
  const el = e.target;
  const searchValue = document.getElementById("controladorEscolhaSearch").value;
  if (searchValue.trim()) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    controladorEscolhaRaioKm += CONTROLADOR_ESCOLHA_RAIO_INCREMENTO_KM;
    renderControladorEscolhaItems(searchValue);
  }
});
document.getElementById("controladorEscolhaCancelar").addEventListener("click", () => {
  fecharEscolhaControlador();
  detail.area = null;
  if (areaLayer) { map.removeLayer(areaLayer); areaLayer = null; }
  renderAreaImagem();
});
document.getElementById("controladorEscolhaSalvar").addEventListener("click", () => {
  if (!controladorEscolhaSelecionadoId) { showToast("Escolha um controlador da lista."); return; }
  const c = controladoresCandidatos().find((x) => x.id === controladorEscolhaSelecionadoId);
  if (!c) return;
  // Quem chega aqui foi escolhido no modal — ou seja, não tinha controlador DENTRO da área
  // (esse teria sido vinculado sozinho, ver commitArea). Então todo controlador escolhido
  // aqui está fisicamente fora da área e entra como sub-controlador (virtual), tenha ele
  // croqui de origem ou seja um solto ainda sem croqui.
  const virtual = true;
  // Se veio de outro croqui, busca o detalhe pra pegar fases/ciclo reais; se é solto, o
  // próprio candidato já tem esses dados.
  const dadosReais = c.croquiId
    ? (getCroquiDetail(c.croquiId).controladores || []).find((ct) => ct.id === c.id)
    : c;
  vincularControladorNoCroqui({ ...(dadosReais || c), croquiOrigemId: c.croquiId, croquiOrigemNome: c.croquiNome, lat: c.lat, lng: c.lng }, virtual);
  fecharEscolhaControlador();
  showToast(c.croquiNome
    ? `Controlador ${c.id} vinculado como sub-controlador (físico em ${c.croquiNome}).`
    : `Controlador ${c.id} vinculado como sub-controlador.`);
  finalizarCommitArea("veicular");
});

// Pins dos controladores soltos (sem croqui ainda) no mapa — "outro ícone" pedido, pra dar
// pra ver/escolher visualmente em vez de só buscar por texto.
// - Arrastável: reposiciona o controlador solto (só pra ajustar rápido durante teste).
// - Clicar: vincula esse controlador a este croqui (mesmo se já tiver outro — vira mais um
//   na lista, igual o CT-1201 tem 2) e já deixa ele "ativo", pra qualquer grupo focal que
//   você desenhar a partir de agora vincular nele.
let controladoresSoltosLayer = null;
function renderControladoresSoltosLayer() {
  if (controladoresSoltosLayer) { map.removeLayer(controladoresSoltosLayer); controladoresSoltosLayer = null; }
  const soltos = readControladoresSoltos();
  if (!soltos.length) return;
  controladoresSoltosLayer = L.layerGroup(
    soltos.map((c) => {
      const icon = L.divIcon({
        html: `<div class="map-controlador-solto-pin">${ICON_CONTROLADOR_PIN}</div>`,
        className: "", iconSize: [24, 28], iconAnchor: [12, 28],
      });
      const marker = L.marker([c.lat, c.lng], { icon, draggable: true });
      // Como agora o pin fica sempre visível mesmo depois de vinculado (nível de teste),
      // o tooltip precisa refletir isso — senão continua dizendo "sem croqui ainda" mesmo
      // quando já tem grupo focal vinculado nele.
      const vinculadoAqui = (detail.controladores || []).some((x) => x.id === c.id);
      const qtdGruposAqui = vinculadoAqui ? detail.grupos.filter((g) => g.controladorId === c.id).length : 0;
      const statusTooltip = vinculadoAqui
        ? `vinculado a este croqui · ${qtdGruposAqui} grupo${qtdGruposAqui === 1 ? "" : "s"} ${qtdGruposAqui === 1 ? "focal" : "focais"}`
        : "sem croqui ainda";
      marker.bindTooltip(`<strong>${escapeHtml(c.id)}</strong><span class="listagem-tooltip-id">${escapeHtml(c.via || "")} · ${statusTooltip}</span>`, {
        direction: "top", offset: [0, -16], className: "listagem-tooltip",
      });
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        writeControladoresSoltos(readControladoresSoltos().map((x) => (x.id === c.id ? { ...x, lat: ll.lat, lng: ll.lng } : x)));
        c.lat = ll.lat; c.lng = ll.lng; // pro clique logo em seguida já usar a posição nova
      });
      marker.on("click", () => {
        if (!detail.controladores) detail.controladores = [];
        const jaVinculado = detail.controladores.some((x) => x.id === c.id);
        if (!jaVinculado) vincularControladorNoCroqui(c, false, true); // mantém o pin sempre visível (nível de teste)
        selectedControladorId = c.id;
        // Nível de teste: clicar no pin também reatribui os grupos focais JÁ CADASTRADOS
        // desse croqui pra esse controlador — pra poder testar "trocar de controlador"
        // rápido, sem apagar e recriar os grupos.
        const qtdGrupos = detail.grupos.length;
        detail.grupos.forEach((g) => { g.controladorId = c.id; });
        showToast(qtdGrupos
          ? `Controlador ${c.id} selecionado — ${qtdGrupos} grupo${qtdGrupos > 1 ? "s" : ""} ${qtdGrupos > 1 ? "focais" : "focal"} reatribuído${qtdGrupos > 1 ? "s" : ""} a ele.`
          : `Controlador ${c.id} selecionado — novos grupos focais vinculam nele.`);
        renderControlador();
        renderMarkers();
        renderLists();
        renderControladoresSoltosLayer(); // reconstrói o pin agora que os grupos já foram reatribuídos, pro tooltip refletir a contagem certa
        autoSave();
      });
      return marker;
    })
  ).addTo(map);
  controladoresSoltosLayer.eachLayer((m) => m.getElement?.()?.style.setProperty("cursor", "pointer"));
}
renderControladoresSoltosLayer();

// ---------- utilitário de teste: cadastrar controlador solto clicando no mapa ----------
// Só existe pra simular durante os testes do protótipo — no sistema real os controladores
// já vêm cadastrados de outro lugar. Menu do avatar (canto superior direito), não faz
// parte de nenhum fluxo "normal" do editor.
let aguardandoControladorTeste = false;

function iniciarAdicionarControladorTeste() {
  document.getElementById("userMenuDropdown").classList.remove("is-open");
  if (editingEntity) { showToast("Termine a edição atual (Salvar/Cancelar) antes de adicionar um controlador de teste."); return; }
  aguardandoControladorTeste = true;
  setTool("cursor");
  document.getElementById("map").style.cursor = "crosshair";
  showToast("Clique no mapa pra posicionar o controlador de teste.");
}

document.getElementById("avatarBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("userMenuDropdown").classList.toggle("is-open");
});
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("userMenuDropdown");
  if (!dropdown.contains(e.target) && !e.target.closest("#avatarBtn")) dropdown.classList.remove("is-open");
});
document.getElementById("addControladorTesteBtn").addEventListener("click", iniciarAdicionarControladorTeste);

// Alternativa a desenhar ponto a ponto: enquadra o cruzamento no mapa (pan/zoom) e usa
// o retângulo visível na tela como ponto de partida — não salva direto, mostra um preview
// com os 4 cantos arrastáveis (mesma alça roxa da edição de área já salva) pra poder
// ajustar o formato antes de confirmar.
// Tamanho real (em metros) do quadrado sempre calculado como se o mapa estivesse nesse
// zoom — não no zoom real que o mapa está no momento (ver ZOOM_MINIMO_AREA_GUIADA, que
// pode liberar o quadrado num zoom mais aberto que esse). Sem isso, capturar no zoom
// mínimo permitido daria um quadrado maior em metros do que capturar num zoom mais
// próximo, já que o tamanho em PIXELS é sempre o mesmo (82% da área útil).
const AREA_GUIADA_ZOOM_REFERENCIA = 21;

// Calcula o quadrado (mesmo tamanho em pixels sempre, ver "half" abaixo, sempre projetado
// no zoom de referência acima — não no zoom atual do mapa) centralizado num ponto
// geográfico dado — usado tanto pra centralizar na área útil da tela
// (calcularQuadradoVisivel) quanto pra centralizar onde o usuário clicou
// (calcularQuadradoNoPonto, ver fluxo guiado no map.on("click") lá em cima).
function calcularQuadradoNoPonto(centro) {
  const size = map.getSize();
  // O mapa ocupa o container inteiro, mas a sidebar (.croqui-sidebar, 16+360+16px) cobre a
  // esquerda e o header (101px) cobre o topo — sem descontar isso, o enquadramento
  // considerava a tela toda e o retângulo saía puxado pra dentro dessa área coberta. Os
  // valores abaixo espelham o CSS (.editor-page .croqui-sidebar / .editor-toolbar).
  const SIDEBAR_RIGHT_EDGE = 392;
  const HEADER_HEIGHT = 101;
  const usableLeft = Math.min(SIDEBAR_RIGHT_EDGE, size.x * 0.3);
  const usableTop = Math.min(HEADER_HEIGHT, size.y * 0.3);
  const usableWidth = size.x - usableLeft;
  const usableHeight = size.y - usableTop;
  // Quadrada em vez de esticar pra acompanhar a proporção larga da tela: tamanho do
  // menor lado da área útil, com uma margem de respiro ao redor.
  const half = (Math.min(usableWidth, usableHeight) * 0.82) / 2;
  // project/unproject num zoom fixo (não latLngToContainerPoint/containerPointToLatLng,
  // que usam o zoom ATUAL do mapa) — é isso que trava o tamanho real do quadrado no zoom
  // de referência, não importa em qual zoom o usuário estava quando ele apareceu.
  const centroPt = map.project(centro, AREA_GUIADA_ZOOM_REFERENCIA);
  const nw = map.unproject([centroPt.x - half, centroPt.y - half], AREA_GUIADA_ZOOM_REFERENCIA);
  const se = map.unproject([centroPt.x + half, centroPt.y + half], AREA_GUIADA_ZOOM_REFERENCIA);
  return [
    [nw.lat, nw.lng],
    [nw.lat, se.lng],
    [se.lat, se.lng],
    [se.lat, nw.lng],
  ];
}

function calcularQuadradoVisivel() {
  const size = map.getSize();
  const SIDEBAR_RIGHT_EDGE = 392;
  const HEADER_HEIGHT = 101;
  const usableLeft = Math.min(SIDEBAR_RIGHT_EDGE, size.x * 0.3);
  const usableTop = Math.min(HEADER_HEIGHT, size.y * 0.3);
  const usableWidth = size.x - usableLeft;
  const usableHeight = size.y - usableTop;
  const usableCenterX = usableLeft + usableWidth / 2;
  const usableCenterY = usableTop + usableHeight / 2;
  return calcularQuadradoNoPonto(map.containerPointToLatLng([usableCenterX, usableCenterY]));
}

function useVisibleAreaAsArea() {
  if (editingArea) finishEditArea();
  startPendingArea(calcularQuadradoVisivel());
}

// Fluxo guiado do croqui novo (ver iniciarCapturaAreaSeguindoMapa): enquanto essa flag
// estiver ligada, o quadrado da área recalcula sozinho a cada vez que o mapa para de se
// mover — assim o usuário só precisa navegar até o cruzamento que já vê o quadrado ali,
// sem precisar reabrir "Capturar área visível" toda vez que arrasta o mapa. Qualquer
// interação direta do usuário com o quadrado (clicar pra centralizar, arrastar pra
// mover/redimensionar, ajustar pontos) desliga a flag — a partir daí ele fica fixo, do
// jeito que já era antes.
let pendingAreaSeguindoMapa = false;

// Zoom mínimo pra já mostrar o quadrado sozinho — abaixo disso ele sairia enorme em metros
// de verdade (risco de criar uma área do tamanho de um bairro sem querer). Enquanto o
// usuário não chega nesse zoom, só mostra a dica pra aproximar (ver renderHint); assim que
// cruza o mínimo, o quadrado aparece e passa a seguir o mapa normalmente.
const ZOOM_MINIMO_AREA_GUIADA = 20;
let pendingAreaAguardandoZoom = false;

function iniciarCapturaAreaSeguindoMapa() {
  if (map.getZoom() < ZOOM_MINIMO_AREA_GUIADA) {
    pendingAreaAguardandoZoom = true;
    return;
  }
  useVisibleAreaAsArea();
  pendingAreaSeguindoMapa = true;
}

map.on("moveend", () => {
  if (pendingAreaAguardandoZoom) {
    if (map.getZoom() < ZOOM_MINIMO_AREA_GUIADA) return;
    pendingAreaAguardandoZoom = false;
    useVisibleAreaAsArea();
    pendingAreaSeguindoMapa = true;
    renderHint();
    return;
  }
  if (!pendingAreaSeguindoMapa || !pendingAreaVertices) return;
  pendingAreaVertices = calcularQuadradoVisivel();
  pendingAreaLayer.setLatLngs(pendingAreaVertices);
  renderPendingAreaShapeHandles();
  repositionPendingAreaMoveHandle();
});

// Ordem fixa dos vértices em pendingAreaVertices: [NW, NE, SE, SW] — é como
// useVisibleAreaAsArea monta o retângulo, e é o que deixa o modo "rect" (abaixo)
// recalcular os 4 cantos a partir de bounds sem precisar adivinhar posição.
const PENDING_AREA_CORNER_IDX = { nw: 0, ne: 1, se: 2, sw: 3 };
const PENDING_AREA_CORNER_OPOSTO = { nw: "se", ne: "sw", se: "nw", sw: "ne" };

function startPendingArea(vertices) {
  clearPendingArea();
  pendingAreaVertices = vertices.map((pt) => [pt[0], pt[1]]);
  pendingAreaMode = "rect";
  pendingAreaLayer = L.polygon(pendingAreaVertices, { color: "#e0342b", weight: 2, fillColor: "#e0342b", fillOpacity: 0.06, dashArray: "6 4", interactive: false }).addTo(map);
  renderPendingAreaShapeHandles();
  addPendingAreaMoveHandle();
  updatePendingAreaStatus();
}

// Modo "rect": 4 cantos que redimensionam mantendo o retângulo (mesma lógica de
// cornerLatLng/setBounds da imagem importada, ver addAreaImagemHandles). Modo "pontos":
// os 4 vértices soltos, arrastáveis livremente (formato pode deixar de ser retângulo) —
// como era antes deste ajuste, agora só acessível via "Ajustar pontos individualmente".
function renderPendingAreaShapeHandles() {
  removePendingAreaShapeHandles();
  if (pendingAreaMode === "rect") {
    Object.keys(PENDING_AREA_CORNER_IDX).forEach((key) => {
      let fixedOpposite = null;
      const handle = L.marker(pendingAreaVertices[PENDING_AREA_CORNER_IDX[key]], {
        icon: L.divIcon({ html: "", className: "map-arrow-resize-handle", iconSize: [10, 10], iconAnchor: [5, 5] }),
        draggable: true,
        zIndexOffset: 1300,
      }).addTo(map);
      handle.on("dragstart", () => {
        pendingAreaSeguindoMapa = false; // ajuste manual — para de seguir o mapa, fica fixo daqui pra frente
        fixedOpposite = L.latLng(pendingAreaVertices[PENDING_AREA_CORNER_IDX[PENDING_AREA_CORNER_OPOSTO[key]]]);
      });
      handle.on("drag", () => {
        const bounds = L.latLngBounds(handle.getLatLng(), fixedOpposite);
        pendingAreaVertices = [
          [bounds.getNorth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getWest()],
        ];
        pendingAreaLayer.setLatLngs(pendingAreaVertices);
        pendingAreaResizeHandles.forEach(({ key: k, handle: h }) => {
          if (k !== key) h.setLatLng(pendingAreaVertices[PENDING_AREA_CORNER_IDX[k]]);
        });
        repositionPendingAreaMoveHandle();
      });
      pendingAreaResizeHandles.push({ key, handle });
    });
  } else {
    pendingAreaHandles = pendingAreaVertices.map((pt, idx) => {
      const marker = L.marker(pt, { icon: vertexIcon(idx + 1), draggable: true }).addTo(map);
      marker.on("drag", (e) => {
        pendingAreaSeguindoMapa = false;
        const ll = e.target.getLatLng();
        pendingAreaVertices[idx] = [ll.lat, ll.lng];
        pendingAreaLayer.setLatLngs(pendingAreaVertices);
        repositionPendingAreaMoveHandle();
      });
      return marker;
    });
  }
}

function removePendingAreaShapeHandles() {
  pendingAreaHandles.forEach((m) => map.removeLayer(m));
  pendingAreaHandles = [];
  pendingAreaResizeHandles.forEach(({ handle }) => map.removeLayer(handle));
  pendingAreaResizeHandles = [];
}

function usarPendingAreaModoPontos() {
  pendingAreaSeguindoMapa = false;
  pendingAreaMode = "pontos";
  renderPendingAreaShapeHandles();
  updatePendingAreaStatus();
}

// Mesmo padrão da alça central da imagem importada (addAreaImagemHandles): arrasta o
// quadrado inteiro num delta lat/lng só, sem precisar mover os 4 cantos/pontos um por um.
// Funciona nos dois modos.
function addPendingAreaMoveHandle() {
  let dragStartVertices = null;
  let dragStartCenter = null;
  const moveIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>`;
  pendingAreaMoveHandle = L.marker(pendingAreaLayer.getBounds().getCenter(), {
    // Ícone visível de propósito (diferente da alça invisível da flecha/imagem) — aqui
    // não tem nenhum elemento visual embaixo pra "segurar", então precisa deixar claro
    // que dá pra arrastar o quadrado inteiro por ali.
    icon: L.divIcon({ html: moveIconSvg, className: "map-area-move-handle", iconSize: [30, 30], iconAnchor: [15, 15] }),
    draggable: true,
    zIndexOffset: 1200,
  }).addTo(map);
  pendingAreaMoveHandle.on("dragstart", () => {
    pendingAreaSeguindoMapa = false;
    dragStartVertices = pendingAreaVertices.map((pt) => [pt[0], pt[1]]);
    dragStartCenter = pendingAreaMoveHandle.getLatLng();
  });
  pendingAreaMoveHandle.on("drag", () => {
    const now = pendingAreaMoveHandle.getLatLng();
    const dLat = now.lat - dragStartCenter.lat;
    const dLng = now.lng - dragStartCenter.lng;
    pendingAreaVertices = dragStartVertices.map(([lat, lng]) => [lat + dLat, lng + dLng]);
    pendingAreaLayer.setLatLngs(pendingAreaVertices);
    pendingAreaHandles.forEach((m, idx) => m.setLatLng(pendingAreaVertices[idx]));
    pendingAreaResizeHandles.forEach(({ key, handle }) => handle.setLatLng(pendingAreaVertices[PENDING_AREA_CORNER_IDX[key]]));
  });
}

function repositionPendingAreaMoveHandle() {
  if (pendingAreaMoveHandle && pendingAreaLayer) pendingAreaMoveHandle.setLatLng(pendingAreaLayer.getBounds().getCenter());
}

function clearPendingArea() {
  if (pendingAreaLayer) { map.removeLayer(pendingAreaLayer); pendingAreaLayer = null; }
  removePendingAreaShapeHandles();
  if (pendingAreaMoveHandle) { map.removeLayer(pendingAreaMoveHandle); pendingAreaMoveHandle = null; }
  pendingAreaVertices = null;
  pendingAreaSeguindoMapa = false;
}

function updatePendingAreaStatus() {
  const el = document.getElementById("drawStatus");
  el.style.display = "flex";
  if (pendingAreaMode === "rect") {
    el.innerHTML = `
      <span>Enquadre o cruzamento dentro da área</span>
      <button class="btn-secondary" onclick="usarPendingAreaModoPontos()" style="padding:6px 12px;font-size:12.5px;">Ajustar pontos individualmente</button>
      <button class="btn-primary" onclick="confirmPendingArea()" style="padding:6px 12px;font-size:12.5px;">Salvar área</button>
      <button class="btn-secondary" onclick="cancelPendingArea()" style="padding:6px 12px;font-size:12.5px;">Cancelar</button>
    `;
  } else {
    el.innerHTML = `
      <span>Arraste os pontos pra ajustar o formato</span>
      <button class="btn-primary" onclick="confirmPendingArea()" style="padding:6px 12px;font-size:12.5px;">Salvar área</button>
      <button class="btn-secondary" onclick="cancelPendingArea()" style="padding:6px 12px;font-size:12.5px;">Cancelar</button>
    `;
  }
}

function confirmPendingArea() {
  if (!pendingAreaVertices) return;
  const vertices = pendingAreaVertices;
  clearPendingArea();
  document.getElementById("drawStatus").style.display = "none";
  commitArea(vertices); // já chama setTool("cursor") internamente
}

function cancelPendingArea() {
  clearPendingArea();
  document.getElementById("drawStatus").style.display = "none";
  setTool("cursor");
}

function renderArea() {
  renderAreaImagem(); // primeiro, pra ficar embaixo do contorno da área no z-index
  if (areaLayer) { map.removeLayer(areaLayer); areaLayer = null; }
  if (detail.area) {
    areaLayer = L.polygon(detail.area, { color: "#e0342b", weight: 2, fillColor: "#e0342b", fillOpacity: 0.06, interactive: false }).addTo(map);
    destacarAreaComoAlvo(activeTool === "veicular" || activeTool === "pedestre"); // reaplica o toggle "Mostrar linha da área" (fArea)
  }
  document.getElementById("areaMenuBtn").title = detail.area ? "Editar área do cruzamento" : "Área do cruzamento";
}

// ---------- importar imagem sobre a área (upload do computador) ----------
// Sem backend: a imagem vira data URL e é reduzida antes de salvar, pra não estourar o
// limite do localStorage. Ganha um retângulo PRÓPRIO (detail.areaImagemBounds) — só
// herda os limites da área desenhada no momento do import, depois disso é independente:
// arrasta e redimensiona sem afetar (nem ser afetada por) o contorno da área.

const AREA_IMAGEM_MAX_DIM = 1600; // px — lado maior após redimensionar, antes de salvar

let areaImagemMoveHandle = null;
let areaImagemResizeHandles = []; // [{ key: 'nw'|'ne'|'se'|'sw', handle }]

// A imagem em si nunca é interativa (nem clicável) — fica "travada", só decorativa. As
// alças de mover/redimensionar só existem enquanto a ferramenta "imagem" está ativa
// (activeTool === "imagem", ver setTool), pra não disputar clique com flechas/pins por
// baixo dela quando o usuário não está mexendo na foto de propósito.
function renderAreaImagem() {
  if (areaImagemLayer) { map.removeLayer(areaImagemLayer); areaImagemLayer = null; }
  removeAreaImagemHandles();
  // salvos antes de a imagem ganhar retângulo próprio — usa a área como ponto de partida
  if (detail.areaImagem && !detail.areaImagemBounds && detail.area) {
    const b = L.latLngBounds(detail.area);
    detail.areaImagemBounds = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
  }
  if (detail.areaImagem && detail.areaImagemBounds) {
    areaImagemLayer = L.imageOverlay(detail.areaImagem, detail.areaImagemBounds).addTo(map);
  }
  const removerBtn = document.getElementById("removerImagemBtn");
  if (removerBtn) removerBtn.style.display = detail.areaImagem ? "" : "none";
}

function importarImagemArea(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > AREA_IMAGEM_MAX_DIM || height > AREA_IMAGEM_MAX_DIM) {
        const scale = AREA_IMAGEM_MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      detail.areaImagem = canvas.toDataURL("image/jpeg", 0.85);
      const b = L.latLngBounds(detail.area);
      detail.areaImagemBounds = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
      renderAreaImagem();
      autoSave();
      showToast("Imagem importada.");
      setTool("imagem"); // já entra ativada pra poder ajustar na hora
    };
    img.onerror = () => showToast("Não foi possível abrir essa imagem.");
    img.src = reader.result;
  };
  reader.onerror = () => showToast("Não foi possível ler o arquivo.");
  reader.readAsDataURL(file);
}

function removerImagemArea() {
  detail.areaImagem = null;
  detail.areaImagemBounds = null;
  renderAreaImagem();
  autoSave();
  showToast("Imagem removida.");
  if (activeTool === "imagem") setTool("cursor");
}

document.getElementById("areaImagemInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) importarImagemArea(file);
});
document.getElementById("removerImagemBtn").addEventListener("click", () => {
  if (confirm("Remover a imagem importada desta área?")) removerImagemArea();
});

// ---------- mover/redimensionar a imagem importada ----------
// Mesmo padrão da flecha: uma alça central pra mover (arraste livre) e uma em cada canto
// pra redimensionar — arrastar um canto mantém o canto oposto fixo (retângulo comum,
// sem travar proporção, já que a foto raramente bate exato com o formato da área). As
// alças só existem enquanto activeTool === "imagem" (ver setTool).

function cornerLatLng(bounds, key) {
  if (key === "nw") return bounds.getNorthWest();
  if (key === "ne") return bounds.getNorthEast();
  if (key === "se") return bounds.getSouthEast();
  return bounds.getSouthWest();
}
const AREA_IMAGEM_CORNER_OPOSTO = { nw: "se", ne: "sw", se: "nw", sw: "ne" };

function salvarBoundsImagem() {
  const b = areaImagemLayer.getBounds();
  detail.areaImagemBounds = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
  autoSave();
}

function addAreaImagemHandles() {
  removeAreaImagemHandles();
  if (!areaImagemLayer) return;

  let dragStartBounds = null;
  let dragStartCenter = null;
  areaImagemMoveHandle = L.marker(areaImagemLayer.getBounds().getCenter(), {
    icon: L.divIcon({ html: "", className: "map-arrow-move-handle", iconSize: [32, 32], iconAnchor: [16, 16] }),
    draggable: true,
    zIndexOffset: 1100,
  }).addTo(map);
  areaImagemMoveHandle.on("dragstart", () => {
    dragStartBounds = areaImagemLayer.getBounds();
    dragStartCenter = areaImagemMoveHandle.getLatLng();
  });
  areaImagemMoveHandle.on("drag", () => {
    const now = areaImagemMoveHandle.getLatLng();
    const dLat = now.lat - dragStartCenter.lat;
    const dLng = now.lng - dragStartCenter.lng;
    const sw = dragStartBounds.getSouthWest();
    const ne = dragStartBounds.getNorthEast();
    areaImagemLayer.setBounds(L.latLngBounds([sw.lat + dLat, sw.lng + dLng], [ne.lat + dLat, ne.lng + dLng]));
    repositionAreaImagemHandles();
  });
  areaImagemMoveHandle.on("dragend", salvarBoundsImagem);

  ["nw", "ne", "se", "sw"].forEach((key) => {
    let fixedOpposite = null;
    const handle = L.marker(cornerLatLng(areaImagemLayer.getBounds(), key), {
      icon: L.divIcon({ html: "", className: "map-arrow-resize-handle", iconSize: [10, 10], iconAnchor: [5, 5] }),
      draggable: true,
      zIndexOffset: 1300,
    }).addTo(map);
    handle.on("dragstart", () => {
      fixedOpposite = cornerLatLng(areaImagemLayer.getBounds(), AREA_IMAGEM_CORNER_OPOSTO[key]);
    });
    handle.on("drag", () => {
      areaImagemLayer.setBounds(L.latLngBounds(handle.getLatLng(), fixedOpposite));
      repositionAreaImagemHandles(key);
    });
    handle.on("dragend", salvarBoundsImagem);
    areaImagemResizeHandles.push({ key, handle });
  });
}

function repositionAreaImagemHandles(skipKey) {
  if (!areaImagemLayer) return;
  const bounds = areaImagemLayer.getBounds();
  if (areaImagemMoveHandle) areaImagemMoveHandle.setLatLng(bounds.getCenter());
  areaImagemResizeHandles.forEach(({ key, handle }) => {
    if (key === skipKey) return;
    handle.setLatLng(cornerLatLng(bounds, key));
  });
}

function removeAreaImagemHandles() {
  if (areaImagemMoveHandle) { map.removeLayer(areaImagemMoveHandle); areaImagemMoveHandle = null; }
  areaImagemResizeHandles.forEach(({ handle }) => map.removeLayer(handle));
  areaImagemResizeHandles = [];
}

// Zoom mínimo ao focar a área — abaixo disso o cruzamento fica pequeno demais na tela
// pra desenhar/enxergar os grupos focais. Deixa zoomar mais perto que isso se a área
// desenhada for pequena, só nunca mais longe.
const AREA_FOCUS_MIN_ZOOM = 19;

// Enquadra a área inteira na tela, com uma margem pra não colar nas bordas.
function fitAreaBounds() {
  if (!detail.area || !detail.area.length) return;
  const bounds = L.latLngBounds(detail.area);
  const fitZoom = map.getBoundsZoom(bounds, false, [16, 16]);
  // animate:false — o zoom precisa valer NA HORA: logo depois disso o fluxo guiado calcula
  // a posição do primeiro grupo em pixels (finalizarCommitArea), e com animação o
  // map._zoom só mudaria ao fim dela.
  map.setView(bounds.getCenter(), Math.max(fitZoom, AREA_FOCUS_MIN_ZOOM), { animate: false });
}


// ---------- busca de endereço (geocoding via Nominatim/OpenStreetMap, sem chave de API) ----------

const enderecoInput = document.getElementById("enderecoInput");
const enderecoResultsEl = document.getElementById("enderecoResults");
let enderecoDebounceTimer = null;
let enderecoAbortController = null;
let enderecoResultados = [];

function esconderResultadosEndereco() {
  enderecoResultsEl.style.display = "none";
  enderecoResultsEl.innerHTML = "";
  enderecoResultados = [];
}

async function buscarEndereco(query) {
  if (!query.trim()) { esconderResultadosEndereco(); return; }

  if (enderecoAbortController) enderecoAbortController.abort();
  enderecoAbortController = new AbortController();

  enderecoResultsEl.style.display = "block";
  enderecoResultsEl.innerHTML = `<div class="map-search-empty">Buscando...</div>`;

  // viewbox só influencia a ordem (não restringe de verdade) — prioriza resultados perto
  // de onde o mapa já está, sem esconder um endereço fora da área visível.
  const b = map.getBounds();
  const viewbox = [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(",");
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&viewbox=${viewbox}&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { signal: enderecoAbortController.signal, headers: { "Accept-Language": "pt-BR" } });
    const data = await res.json();
    enderecoResultados = data;
    if (!data.length) {
      enderecoResultsEl.innerHTML = `<div class="map-search-empty">Nenhum endereço encontrado.</div>`;
      return;
    }
    enderecoResultsEl.innerHTML = data.map((r, i) => `<button type="button" class="map-search-result" data-idx="${i}">${escapeHtml(r.display_name)}</button>`).join("");
    enderecoResultsEl.querySelectorAll(".map-search-result").forEach((btn) => {
      btn.addEventListener("click", () => selecionarResultadoEndereco(Number(btn.dataset.idx)));
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    enderecoResultsEl.innerHTML = `<div class="map-search-empty">Erro ao buscar endereço.</div>`;
  }
}

function selecionarResultadoEndereco(idx) {
  const r = enderecoResultados[idx];
  if (!r) return;
  map.setView([+r.lat, +r.lon], 18, { animate: false });
  enderecoInput.value = "";
  esconderResultadosEndereco();
}

enderecoInput.addEventListener("input", (e) => {
  clearTimeout(enderecoDebounceTimer);
  const query = e.target.value;
  enderecoDebounceTimer = setTimeout(() => buscarEndereco(query), 450);
});
enderecoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(enderecoDebounceTimer);
    if (enderecoResultados.length) selecionarResultadoEndereco(0);
    else buscarEndereco(enderecoInput.value);
  } else if (e.key === "Escape") {
    esconderResultadosEndereco();
  }
});
document.addEventListener("click", (e) => {
  if (!document.getElementById("mapSearch").contains(e.target)) esconderResultadosEndereco();
});

// ---------- editar área já desenhada (arrastar vértices) ----------

function startEditArea() {
  if (!detail.area) return;
  editingArea = true;
  fitAreaBounds();
  detail.area.forEach((pt, idx) => {
    const marker = L.marker(pt, { icon: vertexIcon(idx + 1), draggable: true }).addTo(map);
    marker.on("drag", (e) => {
      const ll = e.target.getLatLng();
      detail.area[idx] = [ll.lat, ll.lng];
      if (areaLayer) areaLayer.setLatLngs(detail.area);
    });
    areaEditHandles.push(marker);
  });
  updateAreaEditStatus();
}

function finishEditArea() {
  editingArea = false;
  areaEditHandles.forEach((m) => map.removeLayer(m));
  areaEditHandles = [];
  updateAreaEditStatus();
  autoSave();
}

function updateAreaEditStatus() {
  const el = document.getElementById("drawStatus");
  if (!editingArea) { el.style.display = "none"; return; }
  el.style.display = "flex";
  el.innerHTML = `
    <span>Editando área — arraste os pontos no mapa</span>
    <button class="btn-primary" onclick="setTool('cursor')" style="padding:6px 12px;font-size:12.5px;">Concluir</button>
  `;
}

// ---------- grupos focais / anotações: posicionar e editar ----------

function nextId(list, prefix) {
  let max = 0;
  list.forEach((item) => {
    const n = parseInt(String(item.id).replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return prefix + (max + 1);
}

// O id do grupo focal é sempre "G" + a fase escolhida — sem contador, sem sufixo de letra.
// Fase 2 é sempre "G2", ponto. (Duas fases podem legitimamente compartilhar o mesmo número
// de fase — par veicular + pedestre do mesmo movimento, ou repetidor — e nesse caso os dois
// grupos mostram o mesmo "G": não é um bug, é o número da fase, não uma chave sequencial.)
function nextGrupoId(fase) {
  return "G" + fase;
}

// Identidade interna do grupo focal — nunca muda, nunca aparece pro usuário. Existe porque
// o "G2" (rótulo, calculado a partir da fase) pode se repetir entre dois grupos de propósito
// (par veicular+pedestre na mesma fase, repetidor); é o uid que garante que clicar num
// marcador ou salvar uma edição afeta o registro certo, não "o primeiro G2 que achar".
function newUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function startNewEntity(kind, tipo, latlng) {
  if (editingEntity) cancelEntityForm();

  if (kind === "grupo") {
    if (pendingRepetidorFor) {
      const parent = pendingRepetidorFor;
      pendingRepetidorFor = null;
      // Herda o mesmo padrão de posição relativa da flecha do grupo principal, mas
      // ancorado no chão a partir do próprio pin do repetidor (não do pin do pai).
      const parentPt = map.latLngToContainerPoint([parent.lat, parent.lng]);
      const parentArrowPt = map.latLngToContainerPoint(groupArrowLatLng(parent));
      const repetidorArrowLL = pixelOffsetLatLng(latlng, parentArrowPt.x - parentPt.x, parentArrowPt.y - parentPt.y);
      editingEntity = {
        kind: "grupo", id: null, tipo: parent.tipo,
        lat: latlng.lat, lng: latlng.lng, rotationDeg: parent.rotationDeg || 0,
        direcao: parent.direcao, fase: parent.fase, repetidorDe: parent.id, controladorId: parent.controladorId,
        pinScale: parent.pinScale || 1, arrowScale: parent.arrowScale || 1,
        arrowLat: repetidorArrowLL.lat, arrowLng: repetidorArrowLL.lng,
      };
    } else {
      // Nasce sem fase nenhuma marcada — só vira "G1", "G2" etc. quando o usuário clicar
      // numa fase do formulário (ver previewGrupoId / groupIcon).
      // NÃO fixa arrowLat/arrowLng aqui: enquanto o usuário não arrastar a flecha,
      // groupArrowLatLng() calcula a posição dela a cada render como um offset em pixels a
      // partir do pino (ARROW_DY_DEFAULT), sempre no zoom atual. Fixar agora congelava esse
      // offset no zoom do momento da criação — quando o croqui abria afastado (novo croqui
      // vindo da listagem), a flecha nascia a quilômetros do grupo.
      editingEntity = { kind: "grupo", id: null, tipo, lat: latlng.lat, lng: latlng.lng, rotationDeg: 0, direcao: DIRECOES_VEICULAR[0], fase: null, temRepetidor: false, controladorId: selectedControladorId, pinScale: 1, arrowScale: 1 };
    }
    // Pin e flecha seguem o mesmo padrão: nascem parados, um clique arma cada um e faz
    // aparecer o ícone de mover no centro dele. Só um fica armado por vez. Mover o pin não
    // leva a flecha junto (ver addPinMoveHandle).
    previewMarker = L.marker(latlng, { icon: groupIcon(editingEntity, true), draggable: false }).addTo(map);
    arrowSelected = false;
    pinSelected = false;
    bindPinArrowClicks();
  } else {
    editingEntity = { kind: "texto", id: null, lat: latlng.lat, lng: latlng.lng, titulo: "", texto: "", rotationDeg: 0, pinScale: 1 };
    previewMarker = L.marker(latlng, { icon: textIcon(editingEntity, true), draggable: true }).addTo(map);
    previewMarker.on("drag", (e) => {
      const ll = e.target.getLatLng();
      editingEntity.lat = ll.lat; editingEntity.lng = ll.lng;
      repositionTextRotateHandle();
      repositionTextResizeHandle();
    });
    addTextRotateHandle();
    addTextResizeHandle();
  }
  setTool("cursor");
  renderForm();
}

function openEditEntity(kind, refId) {
  if (editingEntity) cancelEntityForm();
  setTool("cursor");
  selecionarAbaSidebar(kind === "grupo" ? "grupos" : "anotacoes");

  if (kind === "grupo") {
    // Busca por uid, não pelo rótulo "G2" — dois grupos podem legitimamente mostrar o
    // mesmo "G" (mesma fase), e o uid é quem garante abrir o marcador certo, não o primeiro
    // que bater o número.
    const g = detail.grupos.find((x) => x.uid === refId);
    if (!g) return;
    if (g.controladorId && g.controladorId !== selectedControladorId) {
      selectedControladorId = g.controladorId;
      renderControlador();
      renderLists();
      renderMarkers();
    }
    editingEntity = { ...g, kind: "grupo" };
    // Grupos salvos antes da flecha virar ponto geográfico (ou nunca arrastados) não têm
    // arrowLat/arrowLng ainda — calcula e fixa agora, pra ter algo concreto pros campos
    // de lat/long do formulário e pro resto da edição.
    if (editingEntity.tipo === "veicular" && (editingEntity.arrowLat == null || editingEntity.arrowLng == null)) {
      const ll = groupArrowLatLng(editingEntity);
      editingEntity.arrowLat = ll.lat;
      editingEntity.arrowLng = ll.lng;
    }
    const official = groupLayers.find((l) => l.__uid === refId);
    if (official) map.removeLayer(official);
    previewMarker = L.marker([g.lat, g.lng], { icon: groupIcon(editingEntity, true), draggable: false }).addTo(map);
    arrowSelected = false;
    pinSelected = false;
    bindPinArrowClicks();
    map.panTo([g.lat, g.lng]);
  } else {
    const t = detail.textos.find((x) => x.id === refId);
    if (!t) return;
    editingEntity = { ...t, kind: "texto" };
    const official = textLayers.find((l) => l.__id === refId);
    if (official) map.removeLayer(official);
    previewMarker = L.marker([t.lat, t.lng], { icon: textIcon(editingEntity, true), draggable: true }).addTo(map);
    previewMarker.on("drag", (e) => {
      const ll = e.target.getLatLng();
      editingEntity.lat = ll.lat; editingEntity.lng = ll.lng;
      repositionTextRotateHandle();
      repositionTextResizeHandle();
    });
    addTextRotateHandle();
    addTextResizeHandle();
    map.panTo([t.lat, t.lng]);
  }
  renderForm();
}

function finishEntityEditing() {
  removeArrowMoveHandleIfAny();
  removeRotateHandleIfAny();
  removeArrowResizeHandleIfAny();
  removePinMoveHandleIfAny();
  removeTextRotateHandleIfAny();
  removeTextResizeHandleIfAny();
  fecharAnexoPreview();
  arrowSelected = false;
  pinSelected = false;
  if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
  editingEntity = null;
  renderForm();
  renderHint();
}

function cancelEntityForm() {
  finishEntityEditing();
  renderMarkers();
}

function hasRepetidor(id) {
  return detail.grupos.some((g) => g.repetidorDe === id);
}

function startRepetidorPlacement(parent) {
  pendingRepetidorFor = parent;
  setTool(parent.tipo === "veicular" ? "veicular" : "pedestre");
  showToast(`Clique no mapa pra posicionar o repetidor de ${parent.id}.`);
}

function saveEntityForm() {
  if (editingEntity.kind === "grupo") {
    if (editingEntity.fase == null) {
      showToast("Escolha a fase do controlador antes de salvar.");
      return;
    }
    const oldId = editingEntity.id || null;
    const uid = editingEntity.uid || newUid();
    const id = nextGrupoId(editingEntity.fase);
    const obj = {
      id, uid, tipo: editingEntity.tipo, controladorId: editingEntity.controladorId, lat: editingEntity.lat, lng: editingEntity.lng,
      rotationDeg: editingEntity.rotationDeg, fase: editingEntity.fase,
      pinScale: editingEntity.pinScale || 1, arrowScale: editingEntity.arrowScale || 1,
    };
    if (editingEntity.arrowLat != null && editingEntity.arrowLng != null) {
      obj.arrowLat = editingEntity.arrowLat;
      obj.arrowLng = editingEntity.arrowLng;
    }
    if (editingEntity.tipo === "veicular") obj.direcao = editingEntity.direcao;
    if (editingEntity.repetidorDe) obj.repetidorDe = editingEntity.repetidorDe;
    else obj.temRepetidor = !!editingEntity.temRepetidor;

    // Mudou de fase numa edição existente → o id acompanha a fase nova; atualiza quem
    // apontava pro id antigo (repetidor referenciando o grupo principal que mudou de número).
    if (oldId && oldId !== id) {
      detail.grupos.forEach((g) => { if (g.repetidorDe === oldId) g.repetidorDe = id; });
    }

    const idx = editingEntity.uid ? detail.grupos.findIndex((g) => g.uid === editingEntity.uid) : -1;
    if (idx >= 0) detail.grupos[idx] = obj; else detail.grupos.push(obj);
    showToast(obj.repetidorDe ? `Repetidor ${id} adicionado.` : `Grupo focal ${id} salvo.`);

    const shouldPlaceRepetidor = obj.temRepetidor && !hasRepetidor(id);
    finishEntityEditing();
    renderMarkers();
    renderLists();
    renderControlador();
    autoSave();
    if (shouldPlaceRepetidor) startRepetidorPlacement(obj);
    return;
  }

  const id = editingEntity.id || nextId(detail.textos, "T");
  const obj = {
    id, lat: editingEntity.lat, lng: editingEntity.lng,
    titulo: (editingEntity.titulo || "").trim() || "Anotação",
    texto: (editingEntity.texto || "").trim(),
    rotationDeg: editingEntity.rotationDeg || 0,
    pinScale: editingEntity.pinScale || 1,
  };
  if (editingEntity.anexos && editingEntity.anexos.length) obj.anexos = editingEntity.anexos;
  const idx = detail.textos.findIndex((t) => t.id === id);
  if (idx >= 0) detail.textos[idx] = obj; else detail.textos.push(obj);
  showToast("Anotação salva.");
  finishEntityEditing();
  renderMarkers();
  renderLists();
  renderControlador();
  autoSave();
}

// Só pra anotação (texto) — grupo focal não exclui de vez, ver desativarGrupoFocal.
function deleteEntityForm() {
  detail.textos = detail.textos.filter((t) => t.id !== editingEntity.id);
  finishEntityEditing();
  renderMarkers();
  renderLists();
  renderControlador();
  autoSave();
  showToast("Excluído.");
}

// Mesmo padrão do "Desativar" do croqui (ver desativarCroquiBtn): reversível, o grupo só
// some do mapa/lista, o cadastro continua salvo (ativo:false) — em vez do "Excluir"
// definitivo que existia aqui antes.
function desativarGrupoFocal() {
  if (editingEntity.kind !== "grupo") return;
  const label = nextGrupoId(editingEntity.fase);
  const ok = confirm(`Desativar o grupo focal ${label}? Ele some do croqui, mas os dados continuam salvos — dá pra reativar depois.`);
  if (!ok) return;
  const idx = detail.grupos.findIndex((g) => g.uid === editingEntity.uid);
  if (idx >= 0) detail.grupos[idx].ativo = false;
  finishEntityEditing();
  renderMarkers();
  renderLists();
  renderControlador();
  autoSave();
  showToast("Grupo focal desativado.");
}

// ---------- posição/rotação/tamanho da flecha (grupo veicular) ----------
// Três controles separados, sem nenhum misturar ângulo com distância — cada arraste
// mexe numa coisa só, previsível (padrão "clássico" de seleção: mover o objeto, um
// círculo de rotação com haste curta, um quadradinho de canto pra redimensionar).

// Desloca por um dx/dy em pixels de tela (não por ângulo+distância) — usado pra tudo
// que é relativo à posição livre da flecha.
function pixelOffsetLatLng(latlng, dx, dy) {
  const pt = map.latLngToContainerPoint(latlng);
  return map.containerPointToLatLng(L.point(pt.x + dx, pt.y + dy));
}

const ARROW_RESIZE_GAP = 14;        // px — distância-base (diagonal) dos cantos da caixa, escala com arrowScale; ~ a metade da diagonal do ícone da flecha, pra grudar bem no canto dela
const ARROW_RESIZE_CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]; // sinais (x,y) dos 4 cantos, em pixels de tela

// Latlng de onde a flecha em edição está ancorada agora — ponto geográfico real, não
// depende do zoom (ver groupArrowLatLng, mesma lógica pros grupos já salvos).
function arrowLatLng() {
  return groupArrowLatLng(editingEntity);
}

// Os campos "Graus / Latitude / Longitude" do painel (Ajuste fino) só tinham sincronia num
// sentido — digitar no campo já movia a flecha no mapa, mas arrastar as alças no mapa não
// atualizava os campos. Ficava parecendo que girar/mover pela alça "não salvava" o ângulo,
// quando na real só o campo é que ficava com o valor antigo na tela.
function syncArrowFieldsFromEntity() {
  const fRotacao = document.getElementById("fRotacao");
  const fArrowLat = document.getElementById("fArrowLat");
  const fArrowLng = document.getElementById("fArrowLng");
  if (fRotacao) fRotacao.value = Math.round(editingEntity.rotationDeg || 0);
  if (fArrowLat) fArrowLat.value = (editingEntity.arrowLat ?? groupArrowLatLng(editingEntity).lat).toFixed(6);
  if (fArrowLng) fArrowLng.value = (editingEntity.arrowLng ?? groupArrowLatLng(editingEntity).lng).toFixed(6);
}

// 1) Mover a flecha — arraste livre, direto: a flecha vai exatamente aonde o mouse for.
function addArrowMoveHandle() {
  removeArrowMoveHandleIfAny();
  arrowMoveHandle = L.marker(arrowLatLng(), {
    icon: L.divIcon({
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>`,
      className: "map-arrow-move-handle", iconSize: [30, 30], iconAnchor: [15, 15],
    }),
    draggable: true,
    zIndexOffset: 1100, // sempre por cima do pin/flecha (senão o Leaflet ordena por posição geográfica e a alça pode ficar "atrás")
  }).addTo(map);
  arrowMoveHandle.on("drag", () => {
    const ll = arrowMoveHandle.getLatLng();
    editingEntity.arrowLat = ll.lat;
    editingEntity.arrowLng = ll.lng;
    previewMarker.setIcon(groupIcon(editingEntity, true));
    repositionRotateHandle();
    repositionArrowResizeHandle();
    syncArrowFieldsFromEntity();
  });
}

function removeArrowMoveHandleIfAny() {
  if (arrowMoveHandle) { map.removeLayer(arrowMoveHandle); arrowMoveHandle = null; }
}

function repositionArrowMoveHandle() {
  if (!arrowMoveHandle) return;
  arrowMoveHandle.setLatLng(arrowLatLng());
}

// 2) Rotacionar — botão com ícone de flecha girando, no topo, acima da alça de mover (30px)
// e dos cantos de redimensionar, sem encostar em nada. O ângulo é calculado pela direção do
// arraste a partir do centro da flecha; ao soltar, volta a travar na posição de descanso.
const ROTATE_HANDLE_OFFSET_Y = -50; // px de tela, acima da âncora da flecha
function rotateHandleLatLng() {
  return pixelOffsetLatLng(arrowLatLng(), 0, ROTATE_HANDLE_OFFSET_Y);
}
function addRotateHandle() {
  removeRotateHandleIfAny();
  rotateHandle = L.marker(rotateHandleLatLng(), {
    icon: L.divIcon({
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>`,
      className: "map-rotate-handle", iconSize: [24, 24], iconAnchor: [12, 12],
    }),
    draggable: true,
    zIndexOffset: 1200,
  }).addTo(map);
  rotateHandle.on("drag", () => {
    const centerPt = map.latLngToContainerPoint(arrowLatLng());
    const handlePt = map.latLngToContainerPoint(rotateHandle.getLatLng());
    let deg = (Math.atan2(handlePt.x - centerPt.x, -(handlePt.y - centerPt.y)) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    editingEntity.rotationDeg = Math.round(deg);
    previewMarker.setIcon(groupIcon(editingEntity, true));
    repositionArrowResizeHandle(); // os cantos acompanham a nova caixa rotacionada
    syncArrowFieldsFromEntity();
  });
  rotateHandle.on("dragend", () => repositionRotateHandle()); // trava de volta bem em cima da flecha
}

function removeRotateHandleIfAny() {
  if (rotateHandle) { map.removeLayer(rotateHandle); rotateHandle = null; }
}

function repositionHandleToCurrentAngle() { repositionRotateHandle(); }

function repositionRotateHandle() {
  if (!rotateHandle) return;
  rotateHandle.setLatLng(rotateHandleLatLng());
}

// 3) Redimensionar só a flecha — quadradinho em cada um dos 4 cantos da caixa da flecha
// (padrão de seleção de imagem). Qualquer um dos 4 escala igual (só tamanho, uniforme).
//
// A distância dos cantos até o centro é medida no elemento REAL já renderizado (incluindo
// a rotação atual), em vez de calculada só a partir de arrowScale/zoom — uma flecha
// rotacionada tem a caixa (bounding box) maior que o próprio desenho (até ~41% maior perto
// de 45°/135°: fator |cosθ|+|sinθ|), e uma fórmula fixa por escala não acompanhava isso:
// dependendo do ângulo de rotação, os cantos ficavam ora "dentro" da flecha, ora bem
// longe dela, mesmo numa escala considerada "normal". Medir o elemento de verdade resolve
// nos dois sentidos, em qualquer ângulo — e de quebra também vale pra qualquer formato de
// ícone (não só quadrado).
const ARROW_RESIZE_MIN_GAP_PX = 16; // piso absoluto — flecha não pode nem ter renderizado ainda
const ARROW_RESIZE_MARGIN_PX = 6;   // folga além do canto real (já rotacionado) da flecha
function medirGapResizeFlecha() {
  const el = previewMarker && previewMarker.getElement() && previewMarker.getElement().querySelector(".map-group-pin-arrow");
  if (!el) return ARROW_RESIZE_GAP * (editingEntity.arrowScale || 1) * arrowZoomFactor();
  const rect = el.getBoundingClientRect();
  return Math.max(ARROW_RESIZE_MIN_GAP_PX, Math.max(rect.width, rect.height) / 2 + ARROW_RESIZE_MARGIN_PX);
}
function arrowResizeHandleLatLng(sx, sy) {
  const gap = medirGapResizeFlecha();
  return pixelOffsetLatLng(arrowLatLng(), sx * gap, sy * gap);
}

function addArrowResizeHandle() {
  removeArrowResizeHandleIfAny();
  arrowResizeHandles = ARROW_RESIZE_CORNERS.map(([sx, sy]) => {
    const handle = L.marker(arrowResizeHandleLatLng(sx, sy), {
      icon: L.divIcon({ html: "", className: "map-arrow-resize-handle", iconSize: [10, 10], iconAnchor: [5, 5] }),
      draggable: true,
      zIndexOffset: 1300,
    }).addTo(map);
    handle.on("drag", () => {
      const arrowPt = map.latLngToContainerPoint(arrowLatLng());
      const handlePt = map.latLngToContainerPoint(handle.getLatLng());
      const dragDist = Math.hypot(handlePt.x - arrowPt.x, handlePt.y - arrowPt.y);
      // Fator de crescimento relativo ao gap ATUAL (medido de verdade, ver
      // medirGapResizeFlecha) em vez de uma fórmula fixa baseada em ARROW_RESIZE_GAP puro.
      // Antes o clamp de 0.3–6 caía sobre o valor já multiplicado pelo zoom
      // (scaleAtCurrentZoom = arrowScale × zoom), então em zoom bem próximo o teto de 6
      // virava, na prática, um teto de 6 ÷ zoomFactor pro arrowScale de verdade — dava a
      // impressão de a flecha "não crescer mais", limitada pelo zoom. Aplicando o clamp
      // só depois de já ter voltado pro valor puro (sem zoom), o limite fica sempre 0.3–6
      // de verdade, em qualquer zoom.
      const gapAtual = medirGapResizeFlecha();
      const fatorCrescimento = dragDist / gapAtual;
      const novaEscala = (editingEntity.arrowScale || 1) * fatorCrescimento;
      editingEntity.arrowScale = Math.round(Math.min(6, Math.max(0.3, novaEscala)) * 100) / 100;
      previewMarker.setIcon(groupIcon(editingEntity, true));
      repositionArrowResizeHandle(); // os outros 3 cantos acompanham o novo tamanho
    });
    return handle;
  });
}

function removeArrowResizeHandleIfAny() {
  arrowResizeHandles.forEach((h) => map.removeLayer(h));
  arrowResizeHandles = [];
}

function repositionArrowResizeHandle() {
  arrowResizeHandles.forEach((handle, i) => {
    const [sx, sy] = ARROW_RESIZE_CORNERS[i];
    handle.setLatLng(arrowResizeHandleLatLng(sx, sy));
  });
}

// ---------- girar/redimensionar o balão da anotação ----------
// Mesmo padrão de alças da flecha (círculo de rotação + 4 cantos de redimensionar), só
// que ancoradas no próprio ponto da anotação — não tem um "pin" separado de uma "flecha"
// aqui, é um elemento só, então não precisa do passo extra de selecionar antes.

function textEntityLatLng() {
  return L.latLng(editingEntity.lat, editingEntity.lng);
}

function addTextRotateHandle() {
  removeTextRotateHandleIfAny();
  textRotateHandle = L.marker(textEntityLatLng(), {
    icon: L.divIcon({ html: "", className: "map-rotate-handle", iconSize: [10, 10], iconAnchor: [5, 5] }),
    draggable: true,
    zIndexOffset: 1200,
  }).addTo(map);
  textRotateHandle.on("drag", () => {
    const centerPt = map.latLngToContainerPoint(textEntityLatLng());
    const handlePt = map.latLngToContainerPoint(textRotateHandle.getLatLng());
    let deg = (Math.atan2(handlePt.x - centerPt.x, -(handlePt.y - centerPt.y)) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    editingEntity.rotationDeg = Math.round(deg);
    previewMarker.setIcon(textIcon(editingEntity, true));
    repositionTextResizeHandle(); // os cantos acompanham a nova caixa rotacionada
  });
  textRotateHandle.on("dragend", () => repositionTextRotateHandle()); // trava de volta no ponto da anotação
}

function removeTextRotateHandleIfAny() {
  if (textRotateHandle) { map.removeLayer(textRotateHandle); textRotateHandle = null; }
}

function repositionTextRotateHandle() {
  if (!textRotateHandle) return;
  textRotateHandle.setLatLng(textEntityLatLng());
}

const TEXT_RESIZE_GAP = 13; // px — fallback caso o elemento ainda não tenha renderizado (ver medirGapResizeFlecha)

// Mesma ideia do medirGapResizeFlecha — ver comentário lá. O balão da anotação (.map-text-pin)
// nem é quadrado, então medir o elemento de verdade importa ainda mais aqui.
function medirGapResizeTexto() {
  const el = previewMarker && previewMarker.getElement() && previewMarker.getElement().querySelector(".map-text-pin");
  if (!el) return TEXT_RESIZE_GAP * (editingEntity.pinScale || 1) * arrowZoomFactor();
  const rect = el.getBoundingClientRect();
  return Math.max(ARROW_RESIZE_MIN_GAP_PX, Math.max(rect.width, rect.height) / 2 + ARROW_RESIZE_MARGIN_PX);
}

function textResizeHandleLatLng(sx, sy) {
  const gap = medirGapResizeTexto();
  return pixelOffsetLatLng(textEntityLatLng(), sx * gap, sy * gap);
}

function addTextResizeHandle() {
  removeTextResizeHandleIfAny();
  textResizeHandles = ARROW_RESIZE_CORNERS.map(([sx, sy]) => {
    const handle = L.marker(textResizeHandleLatLng(sx, sy), {
      icon: L.divIcon({ html: "", className: "map-arrow-resize-handle", iconSize: [10, 10], iconAnchor: [5, 5] }),
      draggable: true,
      zIndexOffset: 1300,
    }).addTo(map);
    handle.on("drag", () => {
      const centerPt = map.latLngToContainerPoint(textEntityLatLng());
      const handlePt = map.latLngToContainerPoint(handle.getLatLng());
      const dragDist = Math.hypot(handlePt.x - centerPt.x, handlePt.y - centerPt.y);
      // Mesmo fix do arrowResizeHandle — ver comentário lá (clamp sobre o valor puro, não
      // sobre o valor já multiplicado pelo zoom).
      const gapAtual = medirGapResizeTexto();
      const fatorCrescimento = dragDist / gapAtual;
      const novaEscala = (editingEntity.pinScale || 1) * fatorCrescimento;
      editingEntity.pinScale = Math.round(Math.min(6, Math.max(0.3, novaEscala)) * 100) / 100;
      previewMarker.setIcon(textIcon(editingEntity, true));
      repositionTextResizeHandle(); // os outros 3 cantos acompanham o novo tamanho
    });
    return handle;
  });
}

function removeTextResizeHandleIfAny() {
  textResizeHandles.forEach((h) => map.removeLayer(h));
  textResizeHandles = [];
}

function repositionTextResizeHandle() {
  textResizeHandles.forEach((handle, i) => {
    const [sx, sy] = ARROW_RESIZE_CORNERS[i];
    handle.setLatLng(textResizeHandleLatLng(sx, sy));
  });
}

// ---------- selecionar o pin ou a flecha antes de poder mexer neles ----------
// Mesmo padrão pros dois: nascem parados, um clique arma e faz aparecer o ícone de mover
// no centro do elemento clicado. Só um fica armado por vez. A flecha ainda ganha alças
// extras de girar e redimensionar.

// A área clicável da flecha (.map-group-pin-arrow) é um FILHO do elemento do pin, e todo
// previewMarker.setIcon() reconstrói esse filho via innerHTML — levando junto qualquer
// listener preso nele. Por isso a escuta vai no elemento EXTERNO do pin (que o Leaflet
// reaproveita no setIcon, não recria) via delegação. Assim continua valendo depois de
// arrastar/redimensionar a flecha, mexer nos campos, ou deselecionar e clicar de novo.
function bindPinArrowClicks() {
  if (!previewMarker || editingEntity.kind !== "grupo") return;
  if (editingEntity.tipo !== "veicular" && editingEntity.tipo !== "pedestre") return;
  const el = previewMarker.getElement();
  if (!el || el.__pinArrowBound) return;
  el.__pinArrowBound = true;
  L.DomEvent.on(el, "click", (e) => {
    L.DomEvent.stopPropagation(e);
    if (e.target.closest(".map-group-pin-arrow")) selectArrow();
    else selectPin();
  });
}

function selectArrow() {
  if (arrowSelected) return;
  deselectPin();
  arrowSelected = true;
  addArrowMoveHandle();
  addRotateHandle();
  addArrowResizeHandle();
}

function deselectArrow() {
  if (!arrowSelected) return;
  arrowSelected = false;
  removeArrowMoveHandleIfAny();
  removeRotateHandleIfAny();
  removeArrowResizeHandleIfAny();
}

function selectPin() {
  if (pinSelected) return;
  deselectArrow();
  pinSelected = true;
  addPinMoveHandle();
}

function deselectPin() {
  if (!pinSelected) return;
  pinSelected = false;
  removePinMoveHandleIfAny();
}

// Alça de mover o pin — mesmo círculo/ícone da alça de mover a flecha, centrado no pin.
// Mover o pin NÃO leva a flecha junto: no primeiro arraste fixamos a posição absoluta da
// flecha (se ainda era só um offset relativo ao pin), então ela fica onde está e a linha
// fina passa a ligar os dois.
function addPinMoveHandle() {
  removePinMoveHandleIfAny();
  pinMoveHandle = L.marker([editingEntity.lat, editingEntity.lng], {
    icon: L.divIcon({
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>`,
      className: "map-arrow-move-handle", iconSize: [30, 30], iconAnchor: [15, 15],
    }),
    draggable: true,
    zIndexOffset: 1000,
  }).addTo(map);
  pinMoveHandle.on("dragstart", () => {
    if (editingEntity.arrowLat == null || editingEntity.arrowLng == null) {
      const ll = groupArrowLatLng(editingEntity);
      editingEntity.arrowLat = ll.lat;
      editingEntity.arrowLng = ll.lng;
    }
  });
  pinMoveHandle.on("drag", () => {
    const ll = pinMoveHandle.getLatLng();
    editingEntity.lat = ll.lat;
    editingEntity.lng = ll.lng;
    previewMarker.setLatLng(ll);
    previewMarker.setIcon(groupIcon(editingEntity, true));
  });
}

function removePinMoveHandleIfAny() {
  if (pinMoveHandle) { map.removeLayer(pinMoveHandle); pinMoveHandle = null; }
}

function repositionPinMoveHandle() {
  if (pinMoveHandle) pinMoveHandle.setLatLng([editingEntity.lat, editingEntity.lng]);
}

// ---------- render: markers salvos, painel lateral ----------

function renderMarkers() {
  groupLayers.forEach((l) => map.removeLayer(l));
  groupLayers = [];
  textLayers.forEach((l) => map.removeLayer(l));
  textLayers = [];

  // Grupos salvos antes do uid existir (dado antigo) ganham um agora, uma vez só — sem
  // isso, todos os "sem uid" colidiriam de novo no find() abaixo, igual o bug do "G2".
  let uidMigrado = false;
  detail.grupos.forEach((g) => {
    if (!g.uid) { g.uid = newUid(); uidMigrado = true; }
  });
  if (uidMigrado) autoSave();

  detail.grupos.forEach((g) => {
    if (g.ativo === false) return; // desativado (ver desativarGrupoFocal) — some do mapa, mas continua nos dados
    if (g.tipo === "veicular" && !filtroVeicular) return;
    if (g.tipo === "pedestre" && !filtroPedestre) return;
    const dimmed = !!(selectedControladorId && g.controladorId && g.controladorId !== selectedControladorId);
    const m = L.marker([g.lat, g.lng], { icon: groupIcon(g, false, dimmed) }).addTo(map);
    m.__uid = g.uid;
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); openEditEntity("grupo", g.uid); });
    groupLayers.push(m);
  });
  detail.textos.forEach((t) => {
    const m = L.marker([t.lat, t.lng], { icon: textIcon(t, false) }).addTo(map);
    m.__id = t.id;
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); openEditEntity("texto", t.id); });
    textLayers.push(m);
  });
}

// Só reaplica o ícone (posição/tamanho da flecha) dos marcadores já existentes, sem
// recriar nada — usado no zoom, que muda só a escala relativa da flecha (arrowZoomFactor),
// não a lista de grupos em si. Marcadores fora do mapa no momento (ex.: o que está sendo
// editado agora, removido do mapa em openEditEntity mas ainda nesta lista) não têm efeito
// visual algum ao ganhar um novo ícone, então é seguro chamar sempre, mesmo em edição.
function refreshGroupMarkerIcons() {
  // Antes só o veicular tinha marcação no chão (flecha) que precisava recalcular no zoom —
  // agora o pedestre também (faixa de zebra), então os dois tipos entram aqui.
  groupLayers.forEach((m) => {
    const g = detail.grupos.find((x) => x.uid === m.__uid);
    if (!g) return;
    const dimmed = !!(selectedControladorId && g.controladorId && g.controladorId !== selectedControladorId);
    m.setIcon(groupIcon(g, false, dimmed));
  });
}

// Mesma ideia de refreshGroupMarkerIcons(), pras anotações — agora que o pino delas
// também escala com o zoom (ver textIcon).
function refreshTextMarkerIcons() {
  textLayers.forEach((m) => {
    const t = detail.textos.find((x) => x.id === m.__id);
    if (t) m.setIcon(textIcon(t, false));
  });
}

// Controlador "ativo" define o que aparece em destaque no mapa e na lista de grupos focais abaixo.
function getSelectedControlador() {
  return (detail.controladores || []).find((c) => c.id === selectedControladorId) || null;
}

function selectControlador(id) {
  if (selectedControladorId === id) return;
  selectedControladorId = id;
  renderControlador();
  renderMarkers();
  renderLists();
  renderTestePainel();
}

// Remover um controlador tira junto todos os grupos focais vinculados a ele (não tem
// como um grupo focal existir sem controlador) — por isso o aviso deixa isso explícito
// antes de confirmar, e não é só um "tem certeza?" genérico.
function removerControlador(id) {
  const c = (detail.controladores || []).find((x) => x.id === id);
  if (!c) return;
  const gruposVinculados = detail.grupos.filter((g) => g.controladorId === id).length;
  const aviso = gruposVinculados
    ? `Remover o controlador "${id}" também apaga os ${gruposVinculados} grupo${gruposVinculados > 1 ? "s" : ""} focal${gruposVinculados > 1 ? "is" : ""} vinculados a ele. Essa ação não pode ser desfeita. Continuar?`
    : `Remover o controlador "${id}" do croqui? Essa ação não pode ser desfeita.`;
  if (!confirm(aviso)) return;

  detail.controladores = detail.controladores.filter((x) => x.id !== id);
  detail.grupos = detail.grupos.filter((g) => g.controladorId !== id);
  if (selectedControladorId === id) {
    selectedControladorId = detail.controladores[0] ? detail.controladores[0].id : null;
  }

  renderControlador();
  renderMarkers();
  renderLists();
  renderTestePainel();
  autoSave();
  showToast(`Controlador ${id} removido.`);
}

function renderControlador() {
  const slot = document.getElementById("controladorSlot");
  const controladores = detail.controladores || [];
  if (!controladores.length) { slot.innerHTML = ""; renderControladorPosicaoLocalLayer(); return; }

  if (!controladores.some((c) => c.id === selectedControladorId)) {
    selectedControladorId = controladores[0].id;
  }

  slot.innerHTML = `
    <div class="controlador-row">
      ${controladores.map((c) => `
        <div role="button" tabindex="0" class="controlador-chip${c.id === selectedControladorId ? " is-active" : ""}" data-controlador="${c.id}">
          <span class="controlador-chip-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h.01M8 11h.01M8 15h.01M13 7h3M13 11h3M13 15h3"/></svg>
          </span>
          <span class="controlador-chip-main">
            <span class="controlador-chip-name">${escapeHtml(c.id)}${c.virtual ? `<span class="controlador-chip-virtual" title="Virtual — o controlador físico está em outro cruzamento, esse croqui só usa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/></svg></span>` : ""}</span>
            <span class="controlador-chip-via">${escapeHtml(c.via || "")}</span>
            ${c.virtual && c.croquiOrigemNome ? `<span class="controlador-chip-origem">também em ${escapeHtml(c.croquiOrigemNome)}</span>` : ""}
          </span>
          ${c.virtual && (c.croquiOrigemId || (c.posicaoReal && c.posicaoReal.length === 2)) ? `<button type="button" class="controlador-chip-localizar" title="Ver no mapa onde está o controlador físico" onclick="event.stopPropagation(); mostrarLocalizacaoFisicaControlador('${c.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          </button>` : ""}
          <button type="button" class="controlador-chip-delete" title="Remover controlador ${escapeHtml(c.id)} do croqui" onclick="event.stopPropagation(); removerControlador('${c.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>
          </button>
        </div>
      `).join("")}
    </div>`;

  slot.querySelectorAll(".controlador-chip").forEach((chip) => {
    chip.addEventListener("click", () => selectControlador(chip.dataset.controlador));
    chip.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectControlador(chip.dataset.controlador); }
    });
  });

  renderControladorPosicaoLocalLayer();
}

// Pino no mapa de todo controlador vinculado a este croqui (posicaoLocal, ver
// vincularControladorNoCroqui) — arrastável, pra ajustar onde ele aparece dentro do
// desenho, sem relação com o lat/lng real do cadastro. Badge "V" só quando é virtual
// (controlador físico está em outro cruzamento) — o próprio/dono deste croqui não leva
// badge nenhum.
let controladorPosicaoLocalLayer = null;
function renderControladorPosicaoLocalLayer() {
  if (controladorPosicaoLocalLayer) { map.removeLayer(controladorPosicaoLocalLayer); controladorPosicaoLocalLayer = null; }
  const comPosicao = (detail.controladores || []).filter((c) => c.posicaoLocal);
  if (!comPosicao.length) return;
  controladorPosicaoLocalLayer = L.layerGroup(
    comPosicao.map((c) => {
      const icon = L.divIcon({
        html: `<div class="map-controlador-solto-pin map-controlador-posicao-local">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h.01M8 11h.01M8 15h.01M13 7h3M13 11h3M13 15h3"/></svg>
                 ${c.virtual ? `<span class="map-controlador-posicao-local-badge" title="Virtual — controlador físico está em outro cruzamento"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/></svg></span>` : ""}
               </div>`,
        className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      });
      const marker = L.marker(c.posicaoLocal, { icon, draggable: true, zIndexOffset: 700 });
      marker.bindTooltip(`<strong>${escapeHtml(c.id)}</strong><span class="listagem-tooltip-id">arraste pra ajustar a posição no desenho</span>`, {
        direction: "top", offset: [0, -16], className: "listagem-tooltip",
      });
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        c.posicaoLocal = [ll.lat, ll.lng];
        autoSave();
      });
      marker.on("click", (e) => { L.DomEvent.stopPropagation(e); selectControlador(c.id); });
      return marker;
    })
  ).addTo(map);
}

// "Ver no mapa onde está o controlador físico" (botão no chip, só pra virtual) — o físico
// mora no cruzamento de origem (croquiOrigemId), então usamos o lat/lng DELE (o pin da
// listagem, mesma leitura de detail.lat/lng — ver commitArea) como aproximação da posição
// real. Cabeamento normalmente limita a distância entre cruzamentos que compartilham
// controlador, então um zoom out enquadrando os dois já deve bastar pra enxergar os dois.
let localizacaoFisicaMarker = null;
let localizacaoFisicaTimeout = null;
function mostrarLocalizacaoFisicaControlador(id) {
  const c = (detail.controladores || []).find((x) => x.id === id);
  if (!c) return;
  // Posição física real: do croqui de origem (veio de outro croqui) ou a posição
  // cadastrada do próprio controlador (era um solto sem croqui).
  let pos = null;
  let rotulo = "";
  if (c.croquiOrigemId) {
    const origem = listCroquis().find((cq) => cq.id === c.croquiOrigemId);
    if (origem) { pos = [origem.lat, origem.lng]; rotulo = origem.nome || "cruzamento sem nome"; }
  }
  if (!pos && c.posicaoReal && c.posicaoReal.length === 2) {
    pos = c.posicaoReal;
    rotulo = "posição cadastrada do controlador";
  }
  if (!pos) { showToast("Não foi possível localizar o controlador físico."); return; }

  if (localizacaoFisicaMarker) { map.removeLayer(localizacaoFisicaMarker); localizacaoFisicaMarker = null; }
  if (localizacaoFisicaTimeout) { clearTimeout(localizacaoFisicaTimeout); localizacaoFisicaTimeout = null; }

  const icon = L.divIcon({
    html: `<div class="map-controlador-fisico-pin">${ICON_CONTROLADOR_PIN}</div>`,
    className: "", iconSize: [26, 30], iconAnchor: [13, 30],
  });
  localizacaoFisicaMarker = L.marker(pos, { icon, interactive: false, zIndexOffset: 1400 }).addTo(map);
  localizacaoFisicaMarker.bindTooltip(`<strong>${escapeHtml(c.id)} — controlador físico</strong><span class="listagem-tooltip-id">${escapeHtml(rotulo)}</span>`, {
    direction: "top", offset: [0, -18], className: "listagem-tooltip", permanent: true,
  }).openTooltip();

  const areaBounds = detail.area && detail.area.length ? L.latLngBounds(detail.area) : L.latLngBounds([[detail.lat, detail.lng], [detail.lat, detail.lng]]);
  areaBounds.extend(pos);
  map.fitBounds(areaBounds, { padding: [80, 80], maxZoom: 19 });

  // Some sozinho depois de um tempo — é só um "flash" pra localizar, não um marcador
  // permanente do desenho.
  localizacaoFisicaTimeout = setTimeout(() => {
    if (localizacaoFisicaMarker) { map.removeLayer(localizacaoFisicaMarker); localizacaoFisicaMarker = null; }
    localizacaoFisicaTimeout = null;
  }, 12000);
}

function atualizarDestaqueBotaoArea() {
  const btn = document.getElementById("areaMenuBtn");
  if (btn) btn.classList.toggle("is-pulsing", !detail.area);
}

function renderHint() {
  atualizarDestaqueBotaoArea();
  const slot = document.getElementById("hintSlot");
  if (editingEntity) {
    // Caso especial: primeiro grupo focal do croqui abre o formulário direto (ver
    // finalizarCommitArea) sem passar pelo clique-no-mapa — a dica de "escolha a
    // direção/fase" precisa aparecer aqui, no mesmo lugar das outras mensagens guiadas,
    // em vez de embutida dentro do formulário na sidebar.
    const primeiroGrupoNovo = editingEntity.kind === "grupo" && !editingEntity.id && detail.grupos.length === 0;
    if (!primeiroGrupoNovo) { slot.innerHTML = ""; return; }
    slot.innerHTML = `
      <div class="hint-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 1.75 1 2.5.76.76 1.23 1.52 1.41 2.5"/></svg>
        <span>Escolha a direção e a fase deste grupo focal.</span>
      </div>`;
    return;
  }
  const texts = {
    // Croqui sem área ainda: fluxo guiado, esse é sempre o primeiro passo obrigatório —
    // reforça o botão "Área" pulsando (ver toggleAreaMenu/CSS) com o porquê.
    // Enquanto o preview da área (pendingAreaVertices) já está na tela, o próprio
    // drawStatus embaixo já orienta ("Arraste pra mover..." + Salvar/Cancelar) — mostrar
    // essa dica aqui também ficava duas mensagens ao mesmo tempo. pendingAreaAguardandoZoom
    // é o estágio anterior a esse (zoom baixo demais pra mostrar o quadrado sem risco de
    // sair enorme — ver ZOOM_MINIMO_AREA_GUIADA).
    cursor: pendingAreaAguardandoZoom
      ? "Aproxime o zoom pra ver o cruzamento de perto."
      : (detail.area || pendingAreaVertices ? "" : "Comece por aqui: delimite a área do cruzamento no botão \"Área\" — o croqui vai ficar todo dentro dela."),
    area: editingArea ? "Arraste os pontos roxos pra ajustar o formato da área." : "Clique no mapa pra marcar os pontos da área do cruzamento.",
    veicular: "Clique no mapa pra posicionar um grupo focal veicular.",
    pedestre: "Clique no mapa pra posicionar um grupo focal de pedestre.",
    texto: "Clique no mapa pra adicionar uma anotação de texto.",
    imagem: "Arraste o centro pra mover a imagem, os cantos pra redimensionar.",
    regua: "Clique no mapa pra marcar os pontos e medir a distância.",
  };
  const text = texts[activeTool] || "";
  if (!text) { slot.innerHTML = ""; return; }
  slot.innerHTML = `
    <div class="hint-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 1.75 1 2.5.76.76 1.23 1.52 1.41 2.5"/></svg>
      <span>${text}</span>
    </div>`;
}

// ---------- anexos da anotação (foto ou PDF, do computador) ----------
// Mesma ideia da imagem da área: sem backend, tudo vira data URL guardado no croqui.
// Fotos são reduzidas antes de salvar; PDF é salvo como veio (não dá pra "comprimir" sem
// uma lib de PDF), só avisa se o arquivo for grande — o localStorage tem limite.

const ANEXO_IMG_MAX_DIM = 1400;
const ANEXO_AVISO_MB = 5;

const ICON_ANEXO_PDF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6"/></svg>`;
const ICON_ANEXO_IMG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`;

function adicionarAnexo(file) {
  if (!editingEntity.anexos) editingEntity.anexos = [];

  if (file.type === "application/pdf") {
    if (file.size > ANEXO_AVISO_MB * 1024 * 1024) {
      showToast(`"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)}MB — pode não caber no armazenamento local.`);
    }
    const reader = new FileReader();
    reader.onload = () => {
      editingEntity.anexos.push({ nome: file.name, tipo: file.type, dataUrl: reader.result });
      renderForm();
    };
    reader.onerror = () => showToast("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
    return;
  }

  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > ANEXO_IMG_MAX_DIM || height > ANEXO_IMG_MAX_DIM) {
          const scale = ANEXO_IMG_MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        editingEntity.anexos.push({ nome: file.name, tipo: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.85) });
        renderForm();
      };
      img.onerror = () => showToast("Não foi possível abrir essa imagem.");
      img.src = reader.result;
    };
    reader.onerror = () => showToast("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
    return;
  }

  showToast(`"${file.name}" não é foto nem PDF — não foi anexado.`);
}

// Preview do anexo (foto/PDF) divide a tela de verdade — mapa de um lado, anexo do
// outro — em vez de flutuar por cima do mapa (era window.open numa aba nova antes disso).
// #map encolhe (classe .map-split) e o Leaflet precisa ser avisado do novo tamanho do
// contêiner (invalidateSize), senão os tiles não recalculam e o mapa fica com uma faixa
// cinza/cortada onde o painel de anexo entrou.
function abrirAnexo(idx) {
  const a = (editingEntity.anexos || [])[idx];
  if (!a) return;
  document.getElementById("anexoPreviewName").textContent = a.nome;
  document.getElementById("anexoPreviewBody").innerHTML = a.tipo === "application/pdf"
    ? `<iframe src="${a.dataUrl}" title="${escapeHtml(a.nome)}"></iframe>`
    : `<img src="${a.dataUrl}" alt="${escapeHtml(a.nome)}" />`;
  document.getElementById("anexoPreview").style.display = "flex";
  document.body.classList.add("anexo-preview-open");
  document.getElementById("map").classList.add("map-split");
  setTimeout(() => map.invalidateSize(), 0);
}

function fecharAnexoPreview() {
  document.getElementById("anexoPreview").style.display = "none";
  document.getElementById("anexoPreviewBody").innerHTML = "";
  document.body.classList.remove("anexo-preview-open");
  document.getElementById("map").classList.remove("map-split");
  setTimeout(() => map.invalidateSize(), 0);
}
document.getElementById("anexoPreviewClose").addEventListener("click", fecharAnexoPreview);

function baixarAnexo(idx) {
  const a = (editingEntity.anexos || [])[idx];
  if (!a) return;
  const link = document.createElement("a");
  link.href = a.dataUrl;
  link.download = a.nome || "anexo";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderForm() {
  const slot = document.getElementById("entityDrawer");
  if (!editingEntity) { slot.innerHTML = ""; renderHint(); return; }

  if (editingEntity.kind === "grupo" && editingEntity.repetidorDe) {
    slot.innerHTML = `
      <div class="editor-form">
        <div class="editor-form-header-icons">
          <button class="editor-form-close" id="fFechar" type="button" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="editor-form-title">Posicionar repetidor de ${editingEntity.repetidorDe}</div>
        <div class="hint-box hint-box--compact">
          <span>Herda tipo, direção e fase do principal — arraste no mapa pra posicionar.</span>
        </div>
        <div class="field">
          <label>Herdado de ${editingEntity.repetidorDe}</label>
          <div class="controlador-badge" style="padding:10px 12px;">
            <span class="controlador-badge-text" style="width:100%;">
              <strong>${editingEntity.tipo === "veicular" ? "Veicular" : "Pedestre"} · Fase ${editingEntity.fase}</strong>
              ${editingEntity.tipo === "veicular" ? `<span>${escapeHtml(editingEntity.direcao)}</span>` : ""}
            </span>
          </div>
        </div>
        <div class="editor-form-actions">
          <button class="btn-primary" id="fSalvar" type="button">Adicionar repetidor</button>
          <button class="btn-secondary" id="fCancelar" type="button">Cancelar</button>
        </div>
      </div>`;
    document.getElementById("fSalvar").addEventListener("click", saveEntityForm);
    document.getElementById("fCancelar").addEventListener("click", cancelEntityForm);
    document.getElementById("fFechar").addEventListener("click", cancelEntityForm);
    return;
  }

  if (editingEntity.kind === "grupo") {
    const tipoLabel = editingEntity.tipo === "veicular" ? "veicular" : "de pedestre";
    const isNew = !editingEntity.id;
    const ctrlDoGrupo = (detail.controladores || []).find((c) => c.id === editingEntity.controladorId);
    const faseCount = ctrlDoGrupo ? ctrlDoGrupo.fases : 4;
    // Fases que outro grupo deste mesmo controlador já usa — só informativo (dois grupos
    // podem legitimamente compartilhar fase, ex. veicular + pedestre do mesmo movimento).
    const fasesEmUso = new Set(
      detail.grupos
        .filter((g) => g.ativo !== false && g.controladorId === editingEntity.controladorId && g.id !== editingEntity.id)
        .map((g) => g.fase)
    );
    // Controlador virtual = o físico está em outro cruzamento (o "sub controlador" —
    // conceito deles pra um cruzamento que só usa uma fatia das fases de um controlador
    // compartilhado) — bem provável que esse cruzamento de origem já tenha fases em uso.
    // Só informativo também: mostrar aqui não impede escolher a mesma fase.
    const fasesEmUsoOutroCruzamento = ctrlDoGrupo && ctrlDoGrupo.virtual && ctrlDoGrupo.croquiOrigemId
      ? new Set(
          (getCroquiDetail(ctrlDoGrupo.croquiOrigemId).grupos || [])
            .filter((g) => g.controladorId === ctrlDoGrupo.id)
            .map((g) => g.fase)
        )
      : new Set();
    slot.innerHTML = `
      <div class="editor-form">
        <div class="editor-form-header-icons">
          <button class="editor-form-close" id="fFechar" type="button" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="editor-form-title">${isNew ? "Novo" : "Editar"} grupo focal ${tipoLabel}</div>
        ${ctrlDoGrupo ? `<p class="editor-form-controller">Controlador ${escapeHtml(ctrlDoGrupo.id)}${ctrlDoGrupo.via ? ` · ${escapeHtml(ctrlDoGrupo.via)}` : ""}</p>` : ""}
        <div class="editor-form-divider"></div>
        <div class="field">
          <label>Tipo de grupo</label>
          <div class="tipo-picker" id="fTipoGroup">
            <button type="button" class="tipo-btn${editingEntity.tipo === "veicular" ? " is-active" : ""}" data-tipo="veicular">
              <span class="tipo-btn-icon">${ICON_CAR}</span> Veicular
            </button>
            <button type="button" class="tipo-btn${editingEntity.tipo === "pedestre" ? " is-active" : ""}" data-tipo="pedestre">
              <span class="tipo-btn-icon">${ICON_PEDESTRE_SVG}</span> Pedestre
            </button>
          </div>
        </div>
        ${editingEntity.tipo === "veicular" ? `
        <div class="field">
          <label>Direção permitida</label>
          <div class="direcao-picker" id="fDirecaoGroup">
            ${DIRECOES_VEICULAR.map((d) => `
              <button type="button" class="direcao-btn${d === editingEntity.direcao ? " is-active" : ""}" data-direcao="${escapeHtml(d)}" title="${escapeHtml(d)}">
                ${iconDirecao(d)}
              </button>`).join("")}
          </div>
        </div>` : ""}
        <div class="field">
          <label>Ajuste fino da ${editingEntity.tipo === "veicular" ? "flecha" : "faixa de pedestre"}</label>
          <div class="arrow-coords-row">
            <div class="arrow-coord">
              <label for="fRotacao">Graus</label>
              <input type="number" id="fRotacao" min="0" max="359" step="1" value="${Math.round(editingEntity.rotationDeg || 0)}" />
            </div>
            <div class="arrow-coord">
              <label for="fArrowLat">Latitude</label>
              <input type="number" id="fArrowLat" step="0.000001" value="${(editingEntity.arrowLat ?? groupArrowLatLng(editingEntity).lat).toFixed(6)}" />
            </div>
            <div class="arrow-coord">
              <label for="fArrowLng">Longitude</label>
              <input type="number" id="fArrowLng" step="0.000001" value="${(editingEntity.arrowLng ?? groupArrowLatLng(editingEntity).lng).toFixed(6)}" />
            </div>
          </div>
        </div>
        <div class="field">
          <label>Fase do controlador ${ctrlDoGrupo ? escapeHtml(ctrlDoGrupo.id) : ""} <span style="font-weight:400;color:var(--ink-faint);">(${faseCount} disponíveis)</span></label>
          <div class="phase-picker" id="fFaseGroup">
            ${Array.from({ length: faseCount }, (_, i) => i + 1).map((n) => {
              const local = fasesEmUso.has(n);
              const outro = fasesEmUsoOutroCruzamento.has(n);
              const titleParts = [];
              if (local) titleParts.push("já usada por outro grupo focal aqui");
              if (outro) titleParts.push(`já usada em ${ctrlDoGrupo.croquiOrigemNome || "outro cruzamento"} (mesmo controlador físico)`);
              return `
              <button type="button" class="phase-btn${n === editingEntity.fase ? " is-active" : ""}${local ? " is-occupied" : ""}${outro ? " is-occupied-outro" : ""}" data-fase="${n}" title="${titleParts.length ? escapeHtml(titleParts.join(" · ")) : "Livre"}">
                ${n}${local ? '<span class="phase-btn-dot"></span>' : ""}${outro ? '<span class="phase-btn-dot phase-btn-dot-outro"></span>' : ""}
              </button>`;
            }).join("")}
          </div>
          ${fasesEmUso.size || fasesEmUsoOutroCruzamento.size ? `<p class="phase-picker-legend">
            ${fasesEmUso.size ? `<span class="phase-picker-legend-item"><span class="phase-btn-dot"></span> em uso aqui</span>` : ""}
            ${fasesEmUsoOutroCruzamento.size ? `<span class="phase-picker-legend-item"><span class="phase-btn-dot phase-btn-dot-outro"></span> em uso em ${escapeHtml(ctrlDoGrupo.croquiOrigemNome || "outro cruzamento")}</span>` : ""}
          </p>` : ""}
        </div>
        <div class="editor-form-spacer"></div>
        <div class="editor-form-actions">
          <button class="btn-secondary" id="fCancelar" type="button">Cancelar</button>
          ${!isNew ? `<button class="btn-secondary" id="fDesativar" type="button">Desativar</button>` : ""}
          <button class="btn-primary" id="fSalvar" type="button">${isNew ? "Adicionar" : "Salvar"}</button>
        </div>
      </div>`;

    document.querySelectorAll("#fTipoGroup .tipo-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingEntity.tipo = btn.dataset.tipo;
        deselectArrow();
        deselectPin();
        // Veicular e pedestre têm, os dois, marcação no chão agora — só a direção
        // (setinha) é exclusiva do veicular.
        if (editingEntity.tipo === "veicular" && !editingEntity.direcao) editingEntity.direcao = DIRECOES_VEICULAR[0];
        if (editingEntity.arrowLat == null || editingEntity.arrowLng == null) {
          const ll = groupArrowLatLng(editingEntity);
          editingEntity.arrowLat = ll.lat;
          editingEntity.arrowLng = ll.lng;
        }
        previewMarker.setIcon(groupIcon(editingEntity, true));
        bindPinArrowClicks();
        renderForm();
      });
    });
    if (editingEntity.tipo === "veicular") {
      document.querySelectorAll("#fDirecaoGroup .direcao-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          editingEntity.direcao = btn.dataset.direcao;
          document.querySelectorAll("#fDirecaoGroup .direcao-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
          previewMarker.setIcon(groupIcon(editingEntity, true));
          bindPinArrowClicks();
        });
      });
    }
    // Ajuste fino via campos numéricos — alternativa a arrastar as alças no mapa. Vale pra
    // veicular (flecha) e pedestre (faixa de zebra), os dois têm marcação no chão agora.
    function refreshArrowFromFields() {
      previewMarker.setIcon(groupIcon(editingEntity, true));
      if (arrowSelected) {
        repositionArrowMoveHandle();
        repositionRotateHandle();
        repositionArrowResizeHandle();
      }
    }
    document.getElementById("fRotacao").addEventListener("input", (e) => {
      const deg = Number(e.target.value);
      if (isNaN(deg)) return;
      editingEntity.rotationDeg = ((Math.round(deg) % 360) + 360) % 360;
      refreshArrowFromFields();
    });
    document.getElementById("fArrowLat").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      if (isNaN(v)) return;
      editingEntity.arrowLat = v;
      refreshArrowFromFields();
    });
    document.getElementById("fArrowLng").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      if (isNaN(v)) return;
      editingEntity.arrowLng = v;
      refreshArrowFromFields();
    });
    document.querySelectorAll("#fFaseGroup .phase-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingEntity.fase = Number(btn.dataset.fase);
        document.querySelectorAll("#fFaseGroup .phase-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        // O rótulo do pino (qual "G" essa fase vai gerar) é resolvido dentro do próprio
        // groupIcon() a partir de editingEntity.fase — não precisa de lógica extra aqui.
        if (previewMarker) previewMarker.setIcon(groupIcon(editingEntity, true));
      });
    });
    document.getElementById("fSalvar").addEventListener("click", saveEntityForm);
    document.getElementById("fCancelar").addEventListener("click", cancelEntityForm);
    document.getElementById("fFechar").addEventListener("click", cancelEntityForm);
    if (!isNew) document.getElementById("fDesativar").addEventListener("click", desativarGrupoFocal);
  } else {
    const isNew = !editingEntity.id;
    slot.innerHTML = `
      <div class="editor-form">
        <div class="editor-form-header-icons">
          <button class="editor-form-close" id="fFechar" type="button" title="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="editor-form-title">${isNew ? "Nova" : "Editar"} anotação</div>
        <div class="editor-form-divider"></div>
        <div class="field">
          <label for="fTitulo">Título</label>
          <input type="text" id="fTitulo" placeholder="Ex.: Confirmar faixa de pedestre" value="${escapeHtml(editingEntity.titulo || "")}" />
        </div>
        <div class="field">
          <label for="fTexto">Anotação</label>
          <textarea id="fTexto" placeholder="Escreva os detalhes...">${escapeHtml(editingEntity.texto || "")}</textarea>
        </div>
        <div class="field">
          <label>Anexos <span style="font-weight:400;color:var(--ink-faint);">${(editingEntity.anexos || []).length}</span></label>
          ${(editingEntity.anexos || []).length ? `
          <ul class="anexo-list" id="anexoList">
            ${editingEntity.anexos.map((a, i) => `
              <li class="anexo-item" data-idx="${i}" title="Clique pra visualizar ${escapeHtml(a.nome)}">
                <span class="anexo-item-icon">${a.tipo === "application/pdf" ? ICON_ANEXO_PDF : ICON_ANEXO_IMG}</span>
                <span class="anexo-item-name">${escapeHtml(a.nome)}</span>
                <span class="anexo-item-view-hint">${ICON_EYE}</span>
                <button type="button" class="anexo-item-download" data-idx="${i}" title="Baixar ${escapeHtml(a.nome)}">${ICON_DOWNLOAD}</button>
                <button type="button" class="anexo-item-remove" data-idx="${i}" title="Remover anexo">${ICON_TRASH}</button>
              </li>`).join("")}
          </ul>` : ""}
          <button type="button" class="btn-secondary" id="fAdicionarAnexo" style="width:100%;">Adicionar foto ou PDF</button>
          <input type="file" id="fAnexoInput" accept="image/*,application/pdf" multiple style="display:none;" />
        </div>
        <div class="editor-form-actions">
          <button class="btn-secondary" id="fCancelar" type="button">Cancelar</button>
          ${!isNew ? `<button class="btn-secondary" id="fExcluir" type="button">Excluir</button>` : ""}
          <button class="btn-primary" id="fSalvar" type="button">${isNew ? "Adicionar" : "Salvar"}</button>
        </div>
      </div>`;
    document.getElementById("fTitulo").addEventListener("input", (e) => { editingEntity.titulo = e.target.value; });
    document.getElementById("fTexto").addEventListener("input", (e) => { editingEntity.texto = e.target.value; });
    document.getElementById("fAdicionarAnexo").addEventListener("click", () => {
      document.getElementById("fAnexoInput").click();
    });
    document.getElementById("fAnexoInput").addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      files.forEach((file) => adicionarAnexo(file));
    });
    // A linha inteira do anexo é a área de clique pra visualizar (não só o nome) — só os
    // botões de baixar/remover, no canto, escapam disso (stopPropagation).
    document.querySelectorAll("#anexoList .anexo-item").forEach((li) => {
      li.addEventListener("click", () => abrirAnexo(Number(li.dataset.idx)));
    });
    document.querySelectorAll("#anexoList .anexo-item-download").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        baixarAnexo(Number(btn.dataset.idx));
      });
    });
    document.querySelectorAll("#anexoList .anexo-item-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingEntity.anexos.splice(Number(btn.dataset.idx), 1);
        renderForm();
      });
    });
    document.getElementById("fSalvar").addEventListener("click", saveEntityForm);
    document.getElementById("fCancelar").addEventListener("click", cancelEntityForm);
    document.getElementById("fFechar").addEventListener("click", cancelEntityForm);
    if (!isNew) document.getElementById("fExcluir").addEventListener("click", deleteEntityForm);
  }
  // Reaplica a dica do slot fixo pra baixo do mapa — normalmente fica vazia com o
  // formulário aberto, exceto no caso especial do primeiro grupo focal (ver renderHint).
  renderHint();
}

function renderLists() {
  const gruposDoControlador = detail.grupos
    .filter((g) => g.ativo !== false)
    .filter((g) => !selectedControladorId || g.controladorId === selectedControladorId)
    .filter((g) => (g.tipo === "veicular" ? filtroVeicular : filtroPedestre));

  const controladorAtivo = (detail.controladores || []).find((c) => c.id === selectedControladorId);
  const fasesUsadas = controladorAtivo
    ? new Set(detail.grupos.filter((g) => g.ativo !== false && g.controladorId === controladorAtivo.id).map((g) => g.fase))
    : null;

  // "2/4" = fases já com grupo focal / total de fases do controlador (mesma leitura do "fase X/Y" do card do controlador).
  document.getElementById("gruposCount").textContent = controladorAtivo
    ? `${fasesUsadas.size}/${controladorAtivo.fases}`
    : gruposDoControlador.length;
  document.getElementById("textosCount").textContent = detail.textos.length;

  const gList = document.getElementById("gruposList");
  const cardsHtml = gruposDoControlador.map((g) => `
    <li>
      <button class="entity-item" onclick="openEditEntity('grupo','${g.uid}')">
        <span class="entity-item-icon tipo-${g.tipo}">
          ${g.tipo === "veicular" ? ICON_CAR : ICON_PEDESTRE_SVG}
        </span>
        <span class="entity-item-main">
          <span class="entity-item-name">Grupo focal ${g.id.replace(/^\D+/, "")}</span>
          <span class="entity-item-sub">
            ${g.tipo === "veicular" ? escapeHtml(g.direcao) : "Pedestre"}${g.repetidorDe ? ` · repetidor de ${g.repetidorDe}` : g.temRepetidor ? " · tem repetidor" : ""}
          </span>
        </span>
      </button>
    </li>`).join("");

  // "Fases livres" — fases do controlador selecionado que ainda não têm nenhum grupo focal.
  let freeFasesHtml = "";
  if (controladorAtivo) {
    const fasesLivres = Math.max(0, controladorAtivo.fases - fasesUsadas.size);
    if (fasesLivres > 0) {
      freeFasesHtml = `<li>${entityListAddButton("Adicionar novo grupo focal", "setTool('veicular')")}</li>`;
    }
  }

  const emptyHtml = gruposDoControlador.length
    ? ""
    : `<li class="empty-note">${detail.grupos.length ? "Nenhum grupo focal neste controlador ainda." : "Nenhum grupo focal ainda."}</li>`;
  gList.innerHTML = emptyHtml + cardsHtml + freeFasesHtml;

  const tList = document.getElementById("textosList");
  tList.innerHTML = detail.textos.length ? detail.textos.map((t) => `
    <li>
      <button class="entity-item" onclick="openEditEntity('texto','${t.id}')">
        <span class="entity-item-icon tipo-texto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>
        </span>
        <span class="entity-item-main">
          <span class="entity-item-name">${escapeHtml(t.titulo || t.texto || "Anotação")}</span>
          ${t.texto || (t.anexos && t.anexos.length) ? `
          <span class="entity-item-sub-row">
            <span class="entity-item-sub entity-item-sub--preview">${t.texto ? escapeHtml(t.texto.length > 60 ? t.texto.slice(0, 60) + "…" : t.texto) : ""}</span>
            ${t.anexos && t.anexos.length ? `<span class="entity-item-sub entity-item-sub--anexo"><span class="entity-item-sub-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.1a2 2 0 1 1-2.83-2.83l8.49-8.48"/></svg></span>${t.anexos.length}</span>` : ""}
          </span>` : ""}
        </span>
      </button>
    </li>`).join("")
    : `<li class="empty-note">Nenhuma anotação ainda.</li>`;
  tList.innerHTML += `<li>${entityListAddButton("Adicionar nova anotação", "setTool('texto')")}</li>`;
}

// Atalho "+" no fim da lista de grupos/anotações — texto simples e um botão "+", sem a
// caixa tracejada de antes (pesada demais só pra um atalho).
function entityListAddButton(label, onclick) {
  return `
    <button type="button" class="entity-list-add" onclick="${onclick}">
      <span>${label}</span>
      <span class="entity-list-add-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span>
    </button>`;
}

// ---------- salvar croqui inteiro ----------

// Salva no cache (localStorage) em segundo plano, sem toast nem navegar — chamado depois de
// qualquer mudança real (área, grupo focal, anotação, nome), pra nunca depender só do botão
// "Salvar Croqui". Só começa a salvar depois que a área existe, senão o cache enche de
// rascunho vazio (croqui sem nome, sem área, só de alguém abrindo "Adicionar novo Croqui").
function autoSave() {
  if (!detail.area) return;
  const eraNovo = !detail.id;
  saveCroquiDetail(detail);
  // Croqui novo ganha um id só aqui dentro (ver saveCroquiDetail). Sem atualizar a URL, um
  // F5 ou um "voltar pra Novo croqui" sem passar pelo botão Salvar tratava a página como
  // zerada de novo — o rascunho ficava órfão, salvo sob um id que nunca aparecia em lugar
  // nenhum. Agora a aba passa a apontar pro id real assim que ele existe.
  if (eraNovo) {
    croquiId = detail.id;
    history.replaceState(null, "", `editor-croqui.html?id=${detail.id}`);
    document.title = "Antares · Editar Croqui";
    renderCroquiSwitcherName();
  }
}

function saveCroqui() {
  if (!detail.nome.trim()) {
    showToast("Dê um nome ao croqui antes de salvar.");
    const nomeInput = document.getElementById("nomeInput");
    nomeInput.classList.add("needs-attention");
    nomeInput.focus();
    return;
  }
  if (!detail.area) {
    showToast("Delimite a área do cruzamento antes de salvar.");
    return;
  }
  saveCroquiDetail(detail);
  showToast("Croqui salvo.");
  setTimeout(() => { window.location.href = "index.html"; }, 650);
}

// ---------- seletor de croqui (trocar sem voltar pra listagem) ----------

// Mostra o ID do controlador (ex.: "CT-1201"), não o nome do cruzamento — o nome já
// aparece logo abaixo no campo "Nome do Croqui", não precisa repetir.
function renderCroquiSwitcherName() {
  const ctId = (detail.controladores || [])[0]?.id;
  document.getElementById("croquiSwitcherName").textContent = ctId || (croquiId ? "Trocar croqui" : "Novo croqui");
}

function fecharCroquiSwitcher() {
  document.getElementById("croquiSwitcherList").style.display = "none";
  document.getElementById("croquiSwitcher").classList.remove("is-open");
}

// Já são quase mil croquis — sem busca, listar tudo de uma vez travaria a lista. Filtra por
// nome, id do croqui ou id do controlador, e limita quantos itens renderiza por vez mesmo
// filtrado (o usuário refina digitando mais, em vez do dropdown crescer sem fim).
const CROQUI_SWITCHER_LIMIT = 60;

function renderCroquiSwitcherItems(query) {
  const q = (query || "").trim().toLowerCase();
  const todos = listCroquis().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const filtrados = q
    ? todos.filter((c) =>
        (c.nome || "").toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.controladorId || "").toLowerCase().includes(q))
    : todos;
  const visiveis = filtrados.slice(0, CROQUI_SWITCHER_LIMIT);
  const items = document.getElementById("croquiSwitcherItems");
  items.innerHTML = visiveis.map((c) => `
    <button type="button" class="croqui-switcher-item${c.id === croquiId ? " is-current" : ""}" data-id="${c.id}">
      <span class="croqui-switcher-item-check">${c.id === croquiId ? "✓" : ""}</span>
      <span class="croqui-switcher-item-text">${c.controladorId ? `<span class="croqui-switcher-item-ct">${escapeHtml(c.controladorId)}</span> · ` : ""}${escapeHtml(c.nome || "Sem nome")}</span>
    </button>`).join("") || `<p class="croqui-switcher-empty">Nenhum croqui encontrado.</p>`;
  if (filtrados.length > visiveis.length) {
    items.innerHTML += `<p class="croqui-switcher-empty">Mostrando ${visiveis.length} de ${filtrados.length} — refine a busca pra ver outros.</p>`;
  }
  items.querySelectorAll(".croqui-switcher-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (id === croquiId) { fecharCroquiSwitcher(); return; }
      window.location.href = `editor-croqui.html?id=${id}`;
    });
  });
}

function abrirCroquiSwitcher() {
  const searchInput = document.getElementById("croquiSwitcherSearch");
  searchInput.value = "";
  renderCroquiSwitcherItems("");
  document.getElementById("croquiSwitcherList").style.display = "block";
  document.getElementById("croquiSwitcher").classList.add("is-open");
  searchInput.focus();
}

document.getElementById("croquiSwitcherBtn").addEventListener("click", () => {
  const isOpen = document.getElementById("croquiSwitcherList").style.display !== "none";
  if (isOpen) fecharCroquiSwitcher();
  else abrirCroquiSwitcher();
});
document.getElementById("croquiSwitcherSearch").addEventListener("input", (e) => {
  renderCroquiSwitcherItems(e.target.value);
});
document.getElementById("croquiSwitcherSearch").addEventListener("click", (e) => e.stopPropagation());
document.getElementById("croquiSwitcherVerTodos").addEventListener("click", () => {
  window.location.href = "index.html";
});
document.addEventListener("click", (e) => {
  if (!document.getElementById("croquiSwitcher").contains(e.target)) fecharCroquiSwitcher();
});

// ---------- abas da sidebar (Grupos focais / Anotações) ----------

function selecionarAbaSidebar(tab) {
  document.querySelectorAll(".sidebar-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  document.getElementById("tabGrupos").style.display = tab === "grupos" ? "" : "none";
  document.getElementById("tabAnotacoes").style.display = tab === "anotacoes" ? "" : "none";
}
document.querySelectorAll(".sidebar-tab").forEach((btn) => {
  btn.addEventListener("click", () => selecionarAbaSidebar(btn.dataset.tab));
});

// ---------- bootstrap ----------

document.title = `Antares · ${croquiId ? "Editar Croqui" : "Novo Croqui"}`;

// Nome do croqui: campo sempre editável (rótulo flutuante em cima da borda, estilo
// Material) — sem alternância entre "texto estático" e "modo edição" como antes.
const nomeInput = document.getElementById("nomeInput");
nomeInput.value = detail.nome || "";

function commitNome() {
  const value = nomeInput.value.trim();
  if (value) detail.nome = value;
  nomeInput.classList.remove("needs-attention");
  renderCroquiSwitcherName();
  autoSave();
}

nomeInput.addEventListener("input", () => nomeInput.classList.remove("needs-attention"));
nomeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); nomeInput.blur(); }
});
nomeInput.addEventListener("blur", commitNome);

renderCroquiSwitcherName();

// Balão posicionado via JS (position: fixed) em vez de CSS puro (absolute) porque o
// painel lateral tem overflow-y: auto — um balão absoluto seria cortado nas bordas do
// painel ao abrir acima do ícone.
const grupoInfoIcon = document.getElementById("grupoInfoIcon");
const grupoInfoTip = document.getElementById("grupoInfoTip");
if (grupoInfoIcon && grupoInfoTip) {
  const showGrupoInfoTip = () => {
    const r = grupoInfoIcon.getBoundingClientRect();
    grupoInfoTip.style.left = `${r.left + r.width / 2}px`;
    grupoInfoTip.style.top = `${r.top - 8}px`;
    grupoInfoTip.style.display = "block";
  };
  const hideGrupoInfoTip = () => { grupoInfoTip.style.display = "none"; };
  grupoInfoIcon.addEventListener("mouseenter", showGrupoInfoTip);
  grupoInfoIcon.addEventListener("mouseleave", hideGrupoInfoTip);
  grupoInfoIcon.addEventListener("focus", showGrupoInfoTip);
  grupoInfoIcon.addEventListener("blur", hideGrupoInfoTip);
}

document.getElementById("saveCroquiBtn").addEventListener("click", saveCroqui);

// "Desativar" e "Excluir" só existem pra um croqui já cadastrado (que eu "entrei") — criar
// um novo croqui ainda não tem o que desativar/apagar.
// Desativar é reversível (o croqui só some da listagem, o cadastro continua salvo);
// excluir é definitivo — por isso fica só na toolbar do mapa, não junto dos outros botões.
if (croquiId) {
  const desativarCroquiBtn = document.getElementById("desativarCroquiBtn");
  desativarCroquiBtn.style.display = "";
  desativarCroquiBtn.addEventListener("click", () => {
    const ok = confirm(`Desativar o croqui "${detail.nome || croquiId}"? Ele some da listagem, mas os dados continuam salvos — dá pra reativar depois.`);
    if (!ok) return;
    detail.ativo = false;
    saveCroquiDetail(detail);
    showToast("Croqui desativado.");
    setTimeout(() => { window.location.href = "index.html"; }, 650);
  });
}

selectedControladorId = detail.controladores && detail.controladores[0] ? detail.controladores[0].id : null;

// Espera a checagem no Supabase terminar (com um teto curto de segurança) ANTES do
// primeiro desenho, em vez de desenhar com o dado local (que pode ser o BASE_CROQUIS
// antigo, hoje só um retrato congelado — o banco é que manda) e trocar 1-2s depois. Era
// o "pisca: mostra o antigo, atualiza pro novo" que incomodava — com o Supabase (bem mais
// rápido que a planilha) dá pra simplesmente esperar em vez de mascarar o sintoma. Se o
// banco demorar mais que o teto (rede ruim, fora do ar), desiste de esperar e desenha com
// o que já tem local, sem travar a tela indefinidamente.
(async function bootstrapComSync() {
  if (croquiId && typeof sincronizarDaSupabaseSeNecessario === "function") {
    await Promise.race([
      sincronizarDaSupabaseSeNecessario(croquiId, (remoto) => aplicarPosicoesRemotasEm(detail, remoto)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  renderArea();
  renderMarkers();
  renderControlador();
  renderLists();
  if (detail.area) fitAreaBounds();
  // Fluxo guiado: croqui novo já abre com o quadrado de captura ativo, seguindo o mapa
  // enquanto o usuário navega até o cruzamento — ver iniciarCapturaAreaSeguindoMapa. Roda
  // antes do renderHint() de baixo, senão a dica "Comece por aqui" pisca na tela junto com
  // o drawStatus do preview (ver comentário em renderHint sobre não duplicar mensagem).
  if (!croquiId) iniciarCapturaAreaSeguindoMapa();
  renderHint();
})();
