// Utilitários compartilhados do protótipo (sem framework, sem build).

function showToast(message, duration = 2600) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, duration);
}

function notImplemented(label) {
  showToast(`"${label}" ainda não faz parte deste protótipo.`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderClock(el) {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR");
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  el.textContent = `${date}  ${time}`;
}

// Ícones passados pelo Guery (pasta Documents/SVG) — recolorados pra herdar currentColor
// em vez do preto/branco fixo do arquivo original, pra funcionar em qualquer fundo/contexto.

const ICON_CAR = `<svg viewBox="0 0 449 399" fill="currentColor"><path d="M397.116 25.1869C392.127 10.4738 378.158 0 361.694 0H87.3056C70.8422 0 57.1228 10.4738 51.8844 25.1869L0 174.562V374.062C0 387.778 11.225 399 24.9444 399H49.8889C63.6083 399 74.8333 387.778 74.8333 374.062V349.125H374.167V374.062C374.167 387.778 385.392 399 399.111 399H424.056C437.775 399 449 387.778 449 374.062V174.562L397.116 25.1869ZM96.0361 49.875H352.714L379.654 127.431H69.0961L96.0361 49.875ZM399.111 299.25H49.8889V174.562H399.111V299.25Z"/><path d="M112.25 274.312C132.915 274.312 149.667 257.565 149.667 236.906C149.667 216.247 132.915 199.5 112.25 199.5C91.5853 199.5 74.8333 216.247 74.8333 236.906C74.8333 257.565 91.5853 274.312 112.25 274.312Z"/><path d="M336.75 274.312C357.415 274.312 374.167 257.565 374.167 236.906C374.167 216.247 357.415 199.5 336.75 199.5C316.085 199.5 299.333 216.247 299.333 236.906C299.333 257.565 316.085 274.312 336.75 274.312Z"/></svg>`;

const ICON_PEDESTRE_SVG = `<svg viewBox="0 0 122 202" fill="currentColor"><path d="M70.3846 37.5814C80.7077 37.5814 89.1538 29.1256 89.1538 18.7907C89.1538 8.45581 80.7077 0 70.3846 0C60.0615 0 51.6154 8.45581 51.6154 18.7907C51.6154 29.1256 60.0615 37.5814 70.3846 37.5814ZM35.6615 69.5256L9.38461 202H29.0923L45.9846 126.837L65.6923 145.628V202H84.4615V131.535L64.7538 112.744L70.3846 84.5581C82.5846 98.6512 101.354 108.047 122 108.047V89.2558C104.169 89.2558 89.1538 79.8605 81.6461 66.707L72.2615 51.6744C67.0061 43.3126 56.4954 39.9302 47.3923 43.7823L0 63.8884V108.047H18.7692V76.1023L35.6615 69.5256Z"/></svg>`;

// Setas de direção permitida — mesmas 7 opções de DIRECOES_VEICULAR (assets/data.js).
// 5 delas vêm do redesenho do Guery (Documents/SVG/Nova pasta) — traço bem mais grosso,
// desenhado já pensando em ícone pequeno (mapa/lista). A que faltou nesse redesenho
// (direita+esquerda) segue com o traço "engrossado" manualmente da versão anterior.
// "Todas" (frente + direita + esquerda) usa um glifo T provisório no mesmo estilo de
// traço — trocar pelo SVG oficial do Guery quando ele mandar.
const ICONS_DIRECAO = {
  "Só frente": `<svg viewBox="0 0 292 932" fill="none" stroke="currentColor" stroke-width="25"><path d="M198.11 365.604C197.737 357.358 197.87 348.304 197.868 340L197.875 260.608C197.875 252.696 197.711 243.978 198.031 236.123L245.448 236.193C253.412 236.192 263.183 236.461 271.03 236.135L158.828 34.4508C157.836 32.6701 151.523 21.1634 150.626 20.249L34.5473 212.128C30.6191 218.611 23.449 229.737 20.2266 236.19C45.1401 236.159 71.8605 235.683 96.6108 236.29C96.1228 263.696 96.5039 291.983 96.505 319.476L96.6108 919.249H197.881V365.604"/></svg>`,
  "Frente + direita": `<svg viewBox="0 0 531 901" fill="none" stroke="currentColor" stroke-width="25"><path d="M263.836 216.938C262.798 216.932 261.764 216.929 260.736 216.929H260.737L213.32 216.858L201.301 216.841L200.812 228.85C200.562 234.996 200.593 241.728 200.625 247.9L200.646 253.844L200.639 333.234V333.239C200.641 341.262 200.505 350.788 200.895 359.405L202.148 387.122L222.078 367.818C252.41 338.439 296.162 316.518 337.959 309.021L348.51 307.128L348.248 296.411C347.871 281.007 348.255 267.08 348.188 251.428C348.964 251.908 349.715 252.375 350.437 252.828V252.827L391.953 278.957L506.12 351.015C492.706 358.794 479.115 367.032 466.663 374.286L466.648 374.294L466.635 374.303L348.14 443.751V404.995L348.146 397.657L348.16 385.143L335.645 385.145C308.899 385.149 279.677 396.508 255.828 413.594C232.019 430.651 211.708 454.762 204.914 482.052C199.783 502.659 200.48 524.646 200.577 543.23L200.651 583.861V888.5H88.7783V312.346L88.8838 229.16L88.8994 216.947L76.6904 216.647C59.2038 216.218 40.6525 216.324 22.6475 216.437L143.466 23.5967L263.836 216.938Z"/></svg>`,
  "Frente + esquerda": `<svg viewBox="0 0 531 901" fill="none" stroke="currentColor" stroke-width="25"><path d="M266.662 216.938C267.7 216.932 268.734 216.929 269.762 216.929H269.761L317.178 216.858L329.197 216.841L329.686 228.85C329.936 234.996 329.905 241.728 329.873 247.9L329.852 253.844L329.859 333.234V333.239C329.857 341.262 329.993 350.788 329.604 359.405L328.35 387.122L308.42 367.818C278.088 338.439 234.336 316.518 192.539 309.021L181.988 307.128L182.25 296.411C182.627 281.007 182.243 267.08 182.31 251.428C181.534 251.908 180.783 252.375 180.062 252.828V252.827L138.545 278.957L24.3779 351.015C37.7921 358.794 51.3826 367.032 63.835 374.286L63.8496 374.294L63.8633 374.303L182.358 443.751V404.995L182.352 397.657L182.338 385.143L194.854 385.145C221.6 385.149 250.821 396.508 274.67 413.594C298.479 430.651 318.79 454.762 325.584 482.052C330.715 502.659 330.018 524.646 329.921 543.23L329.847 583.861V888.5H441.72V312.346L441.614 229.16L441.599 216.947L453.808 216.647C471.294 216.218 489.846 216.324 507.851 216.437L387.032 23.5967L266.662 216.938Z"/></svg>`,
  "Todas": `<svg viewBox="0 0 600 620" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"><path d="M300 590V90"/><path d="M190 200L300 80L410 200"/><path d="M300 300H95"/><path d="M200 195L80 305L200 415"/><path d="M300 300H505"/><path d="M400 195L520 305L400 415"/></svg>`,
  "Só esquerda": `<svg viewBox="0 0 422 611" fill="none" stroke="currentColor" stroke-width="25"><path d="M182.964 23.9131V23.9141L141.691 49.8887L21.7393 133.574L185.208 249.307L185.136 204.52L185.115 192H294.761V598H409.111V80.3115H184.826L185.14 67.5049C185.517 52.1012 185.133 38.1742 185.199 22.5215C184.429 22.9986 183.681 23.4629 182.964 23.9131Z"/></svg>`,
  "Só direita": `<svg viewBox="0 0 422 611" fill="none" stroke="currentColor" stroke-width="25"><path d="M238.647 23.9131V23.9141L279.92 49.8887L399.872 133.574L236.403 249.307L236.476 204.52L236.496 192H126.851V598H12.5V80.3115H236.785L236.472 67.5049C236.095 52.1012 236.479 38.1742 236.412 22.5215C237.183 22.9986 237.93 23.4629 238.647 23.9131Z"/></svg>`,
  "Direita + esquerda": `<svg viewBox="0 0 745 633" fill="none" stroke="currentColor" stroke-width="26"><path d="M423.661 173.298V325.842L423.661 410.381C423.66 439.313 424.029 598.065 423.611 626.939C392.101 631.439 353.752 630.964 322.289 626.939V173.298H199.79L199.798 180.636L199.797 241.219L62.4821 160.741C43.8484 149.886 23.7183 137.471 4.93958 127.274L136.825 44.0325L178.355 17.8944C185.103 13.6588 193.055 8.97272 199.57 4.55957C199.846 10.0386 199.864 15.7242 199.796 21.2217C199.585 38.2232 200.101 55.3855 199.686 72.3707H546.439"/><path d="M545.064 72.3707C544.649 55.3855 545.164 38.2232 544.954 21.2217C544.886 15.7242 544.904 10.0386 545.18 4.55957C551.695 8.97272 559.647 13.6588 566.395 17.8944L607.924 44.0325L739.81 127.274C721.031 137.471 700.901 149.886 682.268 160.741L544.953 241.219L544.952 180.636L544.959 173.298H422.461"/></svg>`,
};

function iconDirecao(direcao) {
  return ICONS_DIRECAO[direcao] || "";
}

// ---------- simulação de cor "ao vivo" dos grupos focais ----------
// Compartilhado entre a tela de Tempo Real (apresentacao.js) e o teste rápido
// dentro do próprio editor (editor.js) — mesma lógica, sem duplicar.
//
// Os tempos de vermelho/verde/amarelo vêm do cicloSegundos e estagioTotal reais do
// controlador (em vez de uma duração fixa igual pra qualquer controlador, como era antes):
// cada fase recebe uma fatia proporcional do ciclo (cicloSegundos / estagioTotal), com um
// intervalo de amarelo fixo de segurança pro veicular. Ainda é uma simplificação didática
// (todo estágio com a mesma duração, sem entreverdes calculados por movimento) — não vem
// de um plano semafórico real — mas agora reflete o ciclo/estágios configurados no
// controlador, em vez de ser 100% arbitrário.
const LIVE_AMARELO_SEGUNDOS = 3;

function liveCiclosPara(tipo, cicloSegundos, estagioTotal) {
  const ciclo = cicloSegundos || 120;
  const estagios = estagioTotal || 4;
  const fatiaEstagio = ciclo / estagios;
  if (tipo === "pedestre") {
    // Travessia de pedestre costuma ser mais curta que a fatia inteira do estágio (não
    // ocupa o estágio todo) — 60% dela, com piso de 4s pra nunca ficar tempo demais curto.
    const verde = Math.max(4, Math.round(fatiaEstagio * 0.6));
    const vermelho = Math.max(4, ciclo - verde);
    return {
      vermelho: { proxima: "verde", duracao: vermelho },
      verde: { proxima: "vermelho", duracao: verde },
    };
  }
  const verde = Math.max(4, Math.round(fatiaEstagio - LIVE_AMARELO_SEGUNDOS));
  const vermelho = Math.max(4, ciclo - verde - LIVE_AMARELO_SEGUNDOS);
  return {
    vermelho: { proxima: "verde", duracao: vermelho },
    verde: { proxima: "amarelo", duracao: verde },
    amarelo: { proxima: "vermelho", duracao: LIVE_AMARELO_SEGUNDOS },
  };
}

function liveHashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function liveInitialState(id, tipo, cicloSegundos, estagioTotal) {
  const ciclos = liveCiclosPara(tipo, cicloSegundos, estagioTotal);
  const cores = Object.keys(ciclos);
  const seed = liveHashSeed(id);
  const corInicial = cores[seed % cores.length];
  return { cor: corInicial, restante: 2 + (seed % ciclos[corInicial].duracao) };
}

function liveTickState(st, tipo, cicloSegundos, estagioTotal) {
  st.restante -= 1;
  if (st.restante <= 0) {
    const ciclos = liveCiclosPara(tipo, cicloSegundos, estagioTotal);
    const proxima = ciclos[st.cor].proxima;
    st.cor = proxima;
    st.restante = ciclos[proxima].duracao;
  }
}

function liveDotsHtml(tipo, corAtiva) {
  const cores = tipo === "pedestre" ? ["vermelho", "verde"] : ["vermelho", "amarelo", "verde"];
  return cores.map((c) => `<span class="pin-live-dot${c === corAtiva ? ` is-active-${c}` : ""}"></span>`).join("");
}

// Ordem fixa das cores dentro de um ciclo completo, sempre a partir do vermelho — segue a
// cadeia "proxima" de liveCiclosPara até voltar pro início. Usada pra desenhar a trilha
// inteira de uma fase (painel "Testar tempo real" do editor), não só a cor atual.
function liveCicloOrdem(ciclos) {
  const ordem = ["vermelho"];
  let atual = "vermelho";
  while (true) {
    atual = ciclos[atual].proxima;
    if (atual === "vermelho") break;
    ordem.push(atual);
  }
  return ordem;
}

// Posição absoluta (em segundos, 0 até a duração total do ciclo) do estado atual de `st`
// dentro da trilha completa (`ordem`). Serve pra "congelar" o ponto de partida de cada fase
// na trilha estática do painel de teste — a trilha em si não é redesenhada a cada tick, só a
// agulha (posição "agora") anda por cima dela.
function livePosicaoNaTrilha(st, ciclos, ordem) {
  let pos = 0;
  for (const cor of ordem) {
    if (cor === st.cor) return pos + (ciclos[cor].duracao - st.restante);
    pos += ciclos[cor].duracao;
  }
  return 0;
}
