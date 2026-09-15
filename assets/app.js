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

// Substituído pelo pedestre-icon.svg do Guery (Documents/Icones) — mesma ideia de
// recolorir pra currentColor. Usado em tudo que é UI (botão de ferramenta, lista de
// grupos focais, painel de tempo real); o pino/marcação no mapa continua com o ícone
// antigo (ICON_PEDESTRE_PIN / ICON_FAIXA_PEDESTRE em editor.js), esses não mudam.
const ICON_PEDESTRE_SVG = `<svg viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10.0406 5.13039L10.0538 5.12998C10.3486 5.12302 10.614 5.21252 10.8283 5.41653C10.9737 5.55328 11.073 5.73059 11.1132 5.92464C11.1496 6.09981 11.1407 6.30547 11.1408 6.48652L11.1407 7.1131C11.1406 7.96264 11.1314 8.82874 11.142 9.67703C11.275 9.84526 11.5316 10.1087 11.6838 10.2747L12.7226 11.4083C12.847 11.544 13.1158 11.8256 13.2203 11.9607C13.3146 12.0825 13.4955 12.5983 13.5583 12.7628L14.4062 14.9768C14.4657 15.1316 14.554 15.3441 14.6022 15.499C14.6293 15.5861 14.6421 15.6769 14.6401 15.7679C14.6353 15.994 14.5382 16.2086 14.3706 16.3631C13.9935 16.7141 13.4 16.6644 13.0912 16.2504C12.9681 16.0851 12.8585 15.7337 12.78 15.5275L12.0727 13.6815L11.899 13.2248C11.7577 12.8467 11.7619 12.8778 11.4823 12.5852C10.9735 12.0274 10.4376 11.4923 9.92453 10.932C9.75448 10.7462 9.1717 10.1909 9.10887 9.96641C9.06603 9.81329 9.08541 9.2621 9.08549 9.06855L9.08389 7.29763C8.81614 7.4617 8.36406 7.64182 8.11705 7.8102C8.07881 7.93687 8.02851 8.27513 8.00264 8.42168L7.79004 9.62517C7.74702 9.86848 7.72111 10.1854 7.57217 10.3845C7.44869 10.5492 7.26342 10.6582 7.05778 10.6872C6.86218 10.7138 6.65018 10.6516 6.49507 10.5325C6.33766 10.4127 6.23534 10.2359 6.21092 10.0413C6.20365 9.98381 6.20326 9.92568 6.20976 9.86812C6.22988 9.69388 6.27285 9.4859 6.30408 9.31002L6.47736 8.33586L6.6126 7.56957C6.63988 7.41523 6.6639 7.25213 6.70403 7.10108C6.74992 6.92832 6.87892 6.76082 7.03618 6.67243C7.19513 6.58308 7.35515 6.49626 7.5147 6.40855L8.50159 5.86665L9.25232 5.45216C9.52013 5.30434 9.72754 5.15522 10.0406 5.13039Z"/><path d="M8.6823 10.3336C8.69373 10.3434 8.68999 10.3388 8.69746 10.3496C8.85944 10.5831 9.0559 10.7824 9.25072 10.9884L9.87472 11.6516C9.66903 12.0095 9.41684 12.3988 9.1984 12.7525L7.24136 15.9202C7.15712 16.0567 7.06932 16.1967 6.98716 16.3339C6.85435 16.5557 6.71999 16.6776 6.47601 16.7711C6.2492 16.8555 5.95784 16.8083 5.75543 16.6835C5.5601 16.5647 5.42198 16.3728 5.37265 16.1518C5.27622 15.7203 5.54373 15.4165 5.75739 15.0694L7.86663 11.6488C8.13423 11.2147 8.40566 10.7609 8.6823 10.3336Z"/><path d="M10.4172 2.00341C11.1077 1.95315 11.7087 2.4643 11.7597 3.14506C11.8106 3.82582 11.2922 4.41838 10.6017 4.46856C9.9112 4.51874 9.31025 4.00761 9.25932 3.32691C9.20839 2.6462 9.72678 2.05366 10.4172 2.00341Z"/><path d="M11.6841 6.28729C11.705 6.29842 11.8079 6.40888 11.8348 6.43591L12.2644 6.86802L13.4813 8.10007L13.8341 8.45608C14.1007 8.72525 14.2782 8.93289 14.1698 9.34403C14.1343 9.47812 14.0628 9.57137 13.9676 9.67061C13.5942 9.99383 13.1662 9.93752 12.8364 9.58784C12.4676 9.19686 12.0407 8.83021 11.6763 8.43627C11.6673 8.31568 11.6732 8.12504 11.6732 7.99894L11.6737 6.61546C11.6738 6.53742 11.6695 6.35773 11.6841 6.28729Z"/><path d="M2 17.6244C2 17.417 2.17056 17.2488 2.38095 17.2488H3.90476C4.11516 17.2488 4.28571 17.417 4.28571 17.6244C4.28571 17.8318 4.11516 18 3.90476 18H2.38095C2.17056 18 2 17.8318 2 17.6244Z"/><path d="M5.42857 17.6244C5.42857 17.417 5.59913 17.2488 5.80952 17.2488H7.33333C7.54373 17.2488 7.71429 17.417 7.71429 17.6244C7.71429 17.8318 7.54373 18 7.33333 18H5.80952C5.59913 18 5.42857 17.8318 5.42857 17.6244Z"/><path d="M8.85714 17.6244C8.85714 17.417 9.0277 17.2488 9.2381 17.2488H10.7619C10.9723 17.2488 11.1429 17.417 11.1429 17.6244C11.1429 17.8318 10.9723 18 10.7619 18H9.2381C9.0277 18 8.85714 17.8318 8.85714 17.6244Z"/><path d="M12.2857 17.6244C12.2857 17.417 12.4563 17.2488 12.6667 17.2488H14.1905C14.4009 17.2488 14.5714 17.417 14.5714 17.6244C14.5714 17.8318 14.4009 18 14.1905 18H12.6667C12.4563 18 12.2857 17.8318 12.2857 17.6244Z"/><path d="M15.7143 17.6244C15.7143 17.417 15.8848 17.2488 16.0952 17.2488H17.619C17.8294 17.2488 18 17.417 18 17.6244C18 17.8318 17.8294 18 17.619 18H16.0952C15.8848 18 15.7143 17.8318 15.7143 17.6244Z"/></svg>`;

// Pinos de mapa completos do Guery (Documents/Icones) — usados só no editor de croqui
// (assets/editor.js, groupIcon / controlador no mapa), já com cor própria embutida no
// desenho (não herdam currentColor como os ícones de linha acima). ICON_SEMAFORO_PIN marca
// o "vermelho/amarelo/verde" com classes (semaforo-luz--*) pra apagar as luzes que não
// estão ativas durante "Testar tempo real" (ver style.css).
const ICON_CONTROLADOR_PIN = `<svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 0.5C21.4853 0.5 23.5 2.51472 23.5 5V18C23.5 20.4853 21.4853 22.5 19 22.5H15.0801L13.4004 26.5273C13.1394 27.1529 12.5827 27.5 12 27.5C11.4173 27.5 10.8606 27.1529 10.5996 26.5273L8.91992 22.5H5C2.51472 22.5 0.5 20.4853 0.5 18V5C0.5 2.51472 2.51472 0.5 5 0.5H19Z" fill="#16151A" stroke="#404041"/><rect x="3.5" y="3.5" width="17" height="16" rx="1.5" fill="#6E6E6E" stroke="white"/><circle cx="17" cy="12" r="1" fill="white"/><rect x="13" y="4" width="1" height="15" fill="white"/></svg>`;

const ICON_PEDESTRE_PIN = `<svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path class="pedestre-pin-bg" d="M19 0.5C21.4853 0.5 23.5 2.51472 23.5 5V18C23.5 20.4853 21.4853 22.5 19 22.5H15.0801L13.4004 26.5273C13.1394 27.1529 12.5827 27.5 12 27.5C11.4173 27.5 10.8606 27.1529 10.5996 26.5273L8.91992 22.5H5C2.51472 22.5 0.5 20.4853 0.5 18V5C0.5 2.51472 2.51472 0.5 5 0.5H19Z" fill="#16151A" stroke="#404041"/><path class="pedestre-pin-bg" d="M5 1.5H19C20.933 1.5 22.5 3.067 22.5 5V18C22.5 19.933 20.933 21.5 19 21.5H14.4141L14.2852 21.8076L12.4775 26.1426C12.3688 26.4033 12.171 26.5 12 26.5C11.829 26.5 11.6312 26.4033 11.5225 26.1426L9.71484 21.8076L9.58594 21.5H5C3.067 21.5 1.5 19.933 1.5 18V5C1.5 3.067 3.067 1.5 5 1.5Z" fill="#16151A" stroke="white"/><path class="pedestre-pin-figure" d="M11.5429 7.16976L11.5557 7.16934C11.8414 7.1623 12.0985 7.25293 12.3062 7.4595C12.4471 7.59797 12.5433 7.77751 12.5823 7.974C12.6175 8.15137 12.6089 8.35962 12.609 8.54295L12.6089 9.17741C12.6088 10.0376 12.5999 10.9146 12.6101 11.7736C12.7391 11.9439 12.9877 12.2107 13.1351 12.3788L14.1418 13.5267C14.2623 13.664 14.5228 13.9492 14.6241 14.086C14.7155 14.2093 14.8907 14.7316 14.9516 14.8982L15.7732 17.14C15.8308 17.2968 15.9164 17.5119 15.9632 17.6688C15.9894 17.7569 16.0017 17.8489 15.9998 17.941C15.9952 18.17 15.9011 18.3873 15.7387 18.5437C15.3733 18.8991 14.7981 18.8488 14.499 18.4296C14.3796 18.2623 14.2735 17.9064 14.1974 17.6976L13.512 15.8284L13.3437 15.3659C13.2068 14.9832 13.2108 15.0146 12.94 14.7184C12.4469 14.1535 11.9276 13.6117 11.4304 13.0443C11.2657 12.8562 10.7009 12.2939 10.6401 12.0666C10.5985 11.9116 10.6173 11.3534 10.6174 11.1575L10.6159 9.36426C10.3564 9.5304 9.91833 9.71278 9.67897 9.88328C9.64192 10.0115 9.59318 10.3541 9.56811 10.5025L9.3621 11.7211C9.32041 11.9674 9.29531 12.2883 9.15099 12.49C9.03134 12.6567 8.8518 12.7671 8.65254 12.7965C8.463 12.8234 8.25757 12.7604 8.10728 12.6398C7.95474 12.5185 7.85559 12.3394 7.83193 12.1424C7.82488 12.0842 7.8245 12.0254 7.8308 11.9671C7.8503 11.7907 7.89193 11.5801 7.9222 11.402L8.09011 10.4156L8.22116 9.63962C8.2476 9.48334 8.27087 9.31819 8.30975 9.16524C8.35422 8.99031 8.47923 8.8207 8.63161 8.73119C8.78563 8.64073 8.94069 8.55281 9.0953 8.464L10.0516 7.91528L10.7791 7.49558C11.0386 7.3459 11.2396 7.1949 11.5429 7.16976Z" fill="#FAFAFA"/><path class="pedestre-pin-figure" d="M10.2267 12.4384C10.2378 12.4483 10.2342 12.4437 10.2414 12.4546C10.3984 12.691 10.5887 12.8929 10.7775 13.1015L11.3822 13.773C11.1829 14.1354 10.9385 14.5296 10.7268 14.8877L8.83043 18.0953C8.7488 18.2335 8.66372 18.3752 8.58411 18.5141C8.45542 18.7388 8.32522 18.8622 8.0888 18.9569C7.86902 19.0423 7.58669 18.9946 7.39055 18.8682C7.20128 18.7478 7.06744 18.5536 7.01964 18.3298C6.9262 17.8929 7.18542 17.5852 7.39245 17.2337L9.43632 13.7702C9.69562 13.3306 9.95865 12.8711 10.2267 12.4384Z" fill="#FAFAFA"/><path class="pedestre-pin-figure" d="M11.9078 4.00345C12.5769 3.95257 13.1593 4.47014 13.2087 5.15946C13.2581 5.84878 12.7557 6.4488 12.0866 6.49961C11.4175 6.55042 10.8352 6.03286 10.7858 5.34359C10.7365 4.65433 11.2388 4.05434 11.9078 4.00345Z" fill="#FAFAFA"/><path class="pedestre-pin-figure" d="M13.1354 8.34121C13.1557 8.35248 13.2554 8.46433 13.2815 8.4917L13.6978 8.92925L14.877 10.1768L15.2188 10.5373C15.4772 10.8098 15.6492 11.0201 15.5441 11.4364C15.5098 11.5722 15.4405 11.6666 15.3482 11.7671C14.9864 12.0944 14.5717 12.0373 14.2521 11.6833C13.8947 11.2874 13.481 10.9161 13.1279 10.5172C13.1192 10.3951 13.1249 10.2021 13.1249 10.0744L13.1254 8.67351C13.1255 8.59449 13.1213 8.41254 13.1354 8.34121Z" fill="#FAFAFA"/></svg>`;

const ICON_SEMAFORO_PIN = `<svg viewBox="0 0 20 35" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 0.5C17.4853 0.5 19.5 2.51472 19.5 5V25C19.5 27.4853 17.4853 29.5 15 29.5H13.0801L11.4004 33.5273C11.1394 34.1529 10.5827 34.5 10 34.5C9.4173 34.5 8.86056 34.1529 8.59961 33.5273L6.91992 29.5H5C2.51472 29.5 0.5 27.4853 0.5 25V5C0.5 2.51472 2.51472 0.5 5 0.5H15Z" fill="black" stroke="#404041"/><path d="M5 1.5H15C16.933 1.5 18.5 3.067 18.5 5V25C18.5 26.933 16.933 28.5 15 28.5H12.4141L12.2852 28.8076L10.4775 33.1426C10.3688 33.4033 10.171 33.5 10 33.5C9.82901 33.5 9.63121 33.4033 9.52246 33.1426L7.71484 28.8076L7.58594 28.5H5C3.067 28.5 1.5 26.933 1.5 25V5C1.5 3.067 3.067 1.5 5 1.5Z" fill="black" stroke="white"/><circle class="semaforo-luz semaforo-luz--verde" cx="10" cy="23" r="3" fill="#00DF21"/><circle class="semaforo-luz semaforo-luz--amarelo" cx="10" cy="15" r="3" fill="#FFC402"/><circle class="semaforo-luz semaforo-luz--vermelho" cx="10" cy="7" r="3" fill="#D71920"/></svg>`;

// Setas de direção permitida — mesmas 7 opções de DIRECOES_VEICULAR (assets/data.js).
// Redesenho completo do Guery (Documents/Icones) — substitui o conjunto anterior (misto de
// dois redesenhos + o glifo T provisório de "Todas"), agora todas no mesmo estilo sólido,
// viewBox 24x24.
const ICONS_DIRECAO = {
  "Só frente": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.3902 9.16667H15.6016L11.8009 3.5L8 9.16667H10.2114L10.2114 20.5H13.3902L13.3902 9.16667Z"/></svg>`,
  "Frente + direita": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.04811 4L12.1067 10.1862L9.58309 9.43608C9.57099 10.5452 9.57221 11.6544 9.58794 12.7636C11.2808 11.6626 12.3663 11.3375 14.3895 11.302L13.7209 8.83063L17.7838 11.3966C18.4523 11.8207 19.3702 12.3674 20 12.8157C17.9707 14.1003 15.7708 15.5594 13.7209 16.7768C13.9291 16.0096 14.2134 15.0679 14.3841 14.3071C12.9743 14.349 11.8508 14.6454 10.8343 15.6841C9.3314 17.2193 9.56675 19.0158 9.57401 21H6.5253L6.52391 13.0557L6.52421 12.3703C6.5221 12.0845 6.52972 11.7905 6.53335 11.5041C6.50975 11.0132 6.52802 10.4092 6.53026 9.90972C6.51986 9.74448 6.54267 9.60197 6.45633 9.49122C6.02657 9.54737 4.50817 10.0309 4 10.1795L8.04811 4Z"/></svg>`,
  "Frente + esquerda": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.9519 4L11.8933 10.1862L14.4169 9.43608C14.429 10.5452 14.4278 11.6544 14.4121 12.7636C12.7192 11.6626 11.6337 11.3375 9.6105 11.302L10.2791 8.83063L6.21625 11.3966C5.54768 11.8207 4.62984 12.3674 4 12.8157C6.02929 14.1003 8.2292 15.5594 10.2791 16.7768C10.0709 16.0096 9.78657 15.0679 9.61595 14.3071C11.0257 14.349 12.1492 14.6454 13.1657 15.6841C14.6686 17.2193 14.4332 19.0158 14.426 21H17.4747L17.4761 13.0557L17.4758 12.3703C17.4779 12.0845 17.4703 11.7905 17.4667 11.5041C17.4902 11.0132 17.472 10.4092 17.4697 9.90972C17.4801 9.74448 17.4573 9.60197 17.5437 9.49122C17.9734 9.54737 19.4918 10.0309 20 10.1795L15.9519 4Z"/></svg>`,
  "Todas": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.4074 8.79749L15.3333 9.2208L12.0001 4L8.66667 9.2208L10.5925 8.79749V18.3219H13.4074V8.79749Z"/><path d="M2 13.1271C3.8075 11.9493 5.87189 10.7218 7.71617 9.58904C7.48563 10.1865 7.21723 11.1528 7.01798 11.788C7.94067 11.9155 8.20907 11.9341 9.112 12.2464C9.61533 12.46 10.0226 12.626 10.4634 12.9511C11.049 13.3019 11.5524 13.838 12.0008 14.3298C13.4225 12.7403 14.7376 12.0366 16.9129 11.8036C16.7026 11.0678 16.4963 10.3308 16.2943 9.59287L22 13.1324C20.1574 14.1596 18.1814 15.5544 16.2998 16.6367L16.9002 14.483C15.9523 14.649 15.2903 14.8998 14.5746 15.5576C13.0926 16.9195 13.5152 18.3219 13.4545 20.1849V21H10.6061V20.1849C10.6066 19.4595 10.6221 18.1808 10.4848 17.5068C10.3745 16.9599 10.1785 16.4814 9.83873 16.0295C9.12572 15.0807 8.19096 14.6542 7.01852 14.473L7.70464 16.6552L2 13.1271Z"/></svg>`,
  "Só esquerda": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.2381 4C10.7059 4.33085 10.1738 4.69296 9.65 5.04014C9.38423 5.20908 8.81728 5.54818 8.5917 5.72811C7.46919 6.43697 6.09591 7.41496 4.99981 8.05246L11.2363 12.1209L10.5727 9.59409C11.5434 9.58863 12.5196 9.5859 13.4867 9.58201C14.4826 9.57249 15.3795 9.57103 16.1408 10.3324C16.8716 11.0639 16.9172 11.7792 16.9262 12.7471C16.9532 15.4952 16.892 18.2537 16.9244 21H20V20V16.5C20 16.5 20 17.5 20 15C19.9999 12.5 20 10 18.3054 8.16624C16.2872 6.06983 13.3349 6.51125 10.5781 6.51198L11.2381 4Z"/></svg>`,
  "Só direita": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.7619 4C14.2941 4.33085 14.8262 4.69296 15.35 5.04014C15.6158 5.20908 16.1827 5.54818 16.4083 5.72811C17.5308 6.43697 18.9041 7.41496 20.0002 8.05246L13.7637 12.1209L14.4273 9.59409C13.4566 9.58863 12.4804 9.5859 11.5133 9.58201C10.5174 9.57249 9.62049 9.57103 8.85916 10.3324C8.12842 11.0639 8.08283 11.7792 8.07383 12.7471C8.04683 15.4952 8.10803 18.2537 8.07563 21H5.00003V20V16.5C5.00003 16.5 4.99996 17.5 5.00003 15C5.00011 12.5 5 10 6.69455 8.16624C8.71277 6.06983 11.6651 6.51125 14.4219 6.51198L13.7619 4Z"/></svg>`,
  "Direita + esquerda": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 8.06736C2.98825 6.71338 5.25908 5.30221 7.28779 4C7.0342 4.68683 6.73895 5.79774 6.51978 6.52794C7.53473 6.67451 7.82998 6.69591 8.8232 7.05489C9.37687 7.30047 9.82487 7.4913 10.3097 7.86507C10.9539 8.26832 11.5076 8.88458 12.0009 9.44997C13.5647 7.6227 15.0114 6.81367 17.4041 6.54583C17.1729 5.69993 16.9459 4.85276 16.7237 4.0044L23 8.07343C20.9731 9.25429 18.7995 10.8579 16.7297 12.102L17.3903 9.62612C16.3475 9.81701 15.6194 10.1053 14.832 10.8615C13.2018 12.4272 13.511 14.6443 13.5152 16.7632V21L10.4721 20.9982V16.1618C10.4727 15.3278 10.5247 13.9217 10.3737 13.1469C10.2524 12.5181 9.99635 11.9235 9.62261 11.404C8.83829 10.3132 7.81005 9.82289 6.52037 9.61466L7.2751 12.1233L1 8.06736Z"/></svg>`,
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
