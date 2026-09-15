// Sincronização de posições do Croqui via Google Sheets — backend do protótipo.
//
// COMO PUBLICAR:
// 1. Crie uma planilha Google nova (em branco).
// 2. Extensões > Apps Script. Apague o conteúdo padrão e cole este arquivo inteiro.
// 3. Implantar > Nova implantação > tipo "App da Web".
//    - Executar como: Eu (sua conta)
//    - Quem pode acessar: Qualquer pessoa
// 4. Autorize quando pedir. Copie a URL gerada (termina em /exec).
// 5. Cole essa URL em SHEETS_SYNC_URL, em assets/sheets-sync.js do protótipo, e troque
//    SHEETS_SYNC_ENABLED para true.
//
// Guarda 1 linha por croqui numa aba chamada "posicoes": id | dados_json | atualizado.
// dados_json é o payload inteiro que o protótipo manda (ver montarPayloadPosicoes em
// assets/sheets-sync.js) — sem imagem da área nem anexos de anotação, só posições.

const ABA = "posicoes";

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ABA);
  if (!sheet) {
    sheet = ss.insertSheet(ABA);
    sheet.appendRow(["id", "dados_json", "atualizado"]);
  }
  return sheet;
}

function acharLinha_(sheet, id) {
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) return i + 1; // linha real (1-based, +1 pelo cabeçalho)
  }
  return -1;
}

// GET ?id=CRQ-1234 → devolve o dados_json salvo pra esse croqui (ou null).
function doGet(e) {
  const sheet = getSheet_();
  const id = e.parameter.id;
  if (!id) {
    return ContentService.createTextOutput(JSON.stringify({ erro: "informe ?id=" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const linha = acharLinha_(sheet, id);
  if (linha === -1) {
    return ContentService.createTextOutput("null").setMimeType(ContentService.MimeType.JSON);
  }
  const dadosJson = sheet.getRange(linha, 2).getValue();
  return ContentService.createTextOutput(dadosJson || "null")
    .setMimeType(ContentService.MimeType.JSON);
}

// POST com o payload de posições (body em texto puro, JSON.stringify de um objeto com
// pelo menos {id: "CRQ-1234"}) → grava/atualiza a linha desse id.
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, erro: "JSON inválido" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (!payload || !payload.id) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, erro: "sem id" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const sheet = getSheet_();
  const linha = acharLinha_(sheet, payload.id);
  const dadosJson = JSON.stringify(payload);
  const atualizado = new Date().toISOString();
  if (linha === -1) {
    sheet.appendRow([payload.id, dadosJson, atualizado]);
  } else {
    sheet.getRange(linha, 2, 1, 2).setValues([[dadosJson, atualizado]]);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
