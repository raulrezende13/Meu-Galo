/**
 * Meus Jogos do Galo — ponte entre o app e a planilha do Google.
 * Cole este código em: Planilha > Extensões > Apps Script.
 * Depois: Implantar > Nova implantação > Tipo "App da Web"
 *         Executar como: Eu | Quem pode acessar: Qualquer pessoa
 */

// TROQUE por uma senha sua. Use a mesma em Ajustes no app.
const SENHA = 'troque-esta-senha';

// Abas da planilha e a categoria de cada uma
const ABAS = { 'Profissional': 'Profissional', 'Base': 'Base' };

// ---------- Web app ----------
function doGet(e) {
  return json({ ok: true, jogos: lerTodos() });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SENHA) return json({ ok: false, erro: 'Senha inválida' });
    if (body.acao === 'adicionar') adicionar(body.jogo);
    return json({ ok: true, jogos: lerTodos() });
  } catch (err) {
    return json({ ok: false, erro: String(err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Leitura ----------
// Localiza as colunas pelo cabeçalho (ANO, JOGOS, ESTÁDIO, COMPETIÇÃO, DATA, GOLS, PÚBLICO, OBS)
function mapear(aba) {
  const valores = aba.getDataRange().getValues();
  for (let r = 0; r < Math.min(valores.length, 10); r++) {
    const cab = valores[r].map(v => String(v).trim().toUpperCase());
    const ano = cab.indexOf('ANO');
    if (ano < 0) continue;
    const col = nome => cab.indexOf(nome);
    const m = {
      linhaCab: r, valores,
      ano, jogos: col('JOGOS'), estadio: col('ESTÁDIO'), competicao: col('COMPETIÇÃO'),
      data: col('DATA'), gols: col('GOLS'), publico: col('PÚBLICO'), obs: col('OBS'),
    };
    // Última linha de jogo = última linha com ANO preenchido em sequência
    let ultima = r;
    for (let i = r + 1; i < valores.length; i++) {
      if (valores[i][ano] === '' || valores[i][ano] === null) break;
      ultima = i;
    }
    m.ultima = ultima;
    return m;
  }
  throw new Error('Cabeçalho "ANO" não encontrado na aba ' + aba.getName());
}

function dataISO(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // texto antigo no formato M/D/AAAA
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}
const pad = n => String(n).padStart(2, '0');
const num = v => { const s = String(v).replace(/\.0$/, '').replace(/[^\d]/g, ''); return s ? Number(s) : null; };

function lerTodos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const jogos = [];
  Object.keys(ABAS).forEach(nomeAba => {
    const aba = ss.getSheetByName(nomeAba);
    if (!aba) return;
    const m = mapear(aba);
    for (let i = m.linhaCab + 1; i <= m.ultima; i++) {
      const L = m.valores[i], c = m.jogos;
      const autores = String(L[m.gols] || '').trim();
      jogos.push({
        id: nomeAba + '-' + (i + 1),
        categoria: ABAS[nomeAba],
        data: dataISO(L[m.data], tz),
        mandante: String(L[c]).trim(),
        golsMandante: Number(L[c + 1]) || 0,
        golsVisitante: Number(L[c + 3]) || 0,
        visitante: String(L[c + 4]).trim(),
        estadio: String(L[m.estadio] || '').trim(),
        competicao: String(L[m.competicao] || '').trim(),
        autores: autores === '-' ? '' : autores,
        publico: num(L[m.publico]),
        obs: String(L[m.obs] || '').trim(),
      });
    }
  });
  return jogos;
}

// ---------- Gravação ----------
function adicionar(j) {
  if (!j || !j.data || !j.mandante || !j.visitante) throw new Error('Jogo incompleto');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nomeAba = Object.keys(ABAS).find(k => ABAS[k] === j.categoria) || 'Profissional';
    const aba = ss.getSheetByName(nomeAba);
    const m = mapear(aba);
    const linha = m.ultima + 2; // +1 índice->linha, +1 próxima
    const [y, mo, d] = j.data.split('-').map(Number);

    // Copia a formatação da linha anterior (só nas colunas de jogos)
    const c1 = Math.min(m.ano, m.jogos, m.estadio, m.competicao, m.data, m.gols, m.publico, m.obs) + 1;
    const c2 = Math.max(m.ano, m.jogos + 4, m.estadio, m.competicao, m.data, m.gols, m.publico, m.obs) + 1;
    if (m.ultima > m.linhaCab) {
      aba.getRange(linha - 1, c1, 1, c2 - c1 + 1)
        .copyTo(aba.getRange(linha, c1, 1, c2 - c1 + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    const set = (col, v) => aba.getRange(linha, col + 1).setValue(v);
    set(m.ano, y);
    set(m.jogos, j.mandante);
    set(m.jogos + 1, Number(j.golsMandante) || 0);
    set(m.jogos + 2, 'X');
    set(m.jogos + 3, Number(j.golsVisitante) || 0);
    set(m.jogos + 4, j.visitante);
    set(m.estadio, j.estadio || '');
    set(m.competicao, j.competicao || '');
    aba.getRange(linha, m.data + 1).setValue(new Date(y, mo - 1, d, 12)).setNumberFormat('dd/mm/yyyy');
    set(m.gols, j.autores ? j.autores : '-');
    if (j.publico) set(m.publico, Number(j.publico));
    set(m.obs, j.obs || '');
  } finally {
    lock.releaseLock();
  }
}

// ---------- Menu na planilha ----------
// Cria o menu "🐓 Galo" na barra da planilha (aparece ao recarregar a página)
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🐓 Galo')
    .addItem('Corrigir datas (rodar 1 vez)', 'corrigirDatasMenu')
    .addToUi();
}
function corrigirDatasMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    corrigirDatas();
    ui.alert('Datas corrigidas! ✅');
  } catch (e) {
    ui.alert(String(e.message || e));
  }
}

// ---------- Correção única das datas (rode UMA vez pelo editor) ----------
/**
 * A planilha tinha datas com dia/mês trocados (localidade em inglês).
 * Esta função regrava todas as datas no formato dd/mm/aaaa já corrigidas.
 * Rode uma única vez: selecione "corrigirDatas" no topo do editor e clique em Executar.
 */
function corrigirDatas() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('datasCorrigidas')) {
    throw new Error('As datas já foram corrigidas antes. Não rode de novo.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetLocale('pt_BR');
  const tz = ss.getSpreadsheetTimeZone();
  Object.keys(ABAS).forEach(nomeAba => {
    const aba = ss.getSheetByName(nomeAba);
    if (!aba) return;
    const m = mapear(aba);
    for (let i = m.linhaCab + 1; i <= m.ultima; i++) {
      const v = m.valores[i][m.data];
      const ano = Number(m.valores[i][m.ano]);
      let y, mo, d;
      if (v instanceof Date) {
        [y, mo, d] = Utilities.formatDate(v, tz, 'yyyy-M-d').split('-').map(Number);
        if (y <= 2023 && d <= 12) { const t = mo; mo = d; d = t; } // trocados na digitação
      } else {
        const s = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!s) continue;
        mo = Number(s[1]); d = Number(s[2]); y = Number(s[3]);
      }
      if (ano && y !== ano) y = ano; // ano digitado errado
      aba.getRange(i + 1, m.data + 1).setValue(new Date(y, mo - 1, d, 12)).setNumberFormat('dd/mm/yyyy');
      Logger.log(`${nomeAba} linha ${i + 1}: ${pad(d)}/${pad(mo)}/${y}`);
    }
  });
  props.setProperty('datasCorrigidas', new Date().toISOString());
}
