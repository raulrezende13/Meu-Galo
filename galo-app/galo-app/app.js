/* Meus Jogos do Galo — PWA sem dependências */
'use strict';

// ---------- Configuração ----------
// Apelidos de artilheiros: junta nomes diferentes da mesma pessoa
const APELIDOS = {
  'gustavo scarpa': 'Scarpa',
};

const K = { cfg: 'galo.cfg', cache: 'galo.cache', locais: 'galo.locais', pend: 'galo.pendentes' };
const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const estado = {
  tab: 'resumo',
  categoria: 'Todos',
  filtros: { texto: '', ano: '', comp: '', estadio: '', res: '', adv: '' },
  jogos: [],
  sincronizando: false,
};

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const fmtNum = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('pt-BR');
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function fmtData(iso, comDia) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!comDia) return `${d}/${m}/${y}`;
  const dt = new Date(+y, +m - 1, +d);
  return `${DIAS[dt.getDay()]}, ${d}/${m}/${y}`;
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('mostra');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('mostra'), 2600);
}
const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;

// ---------- Regras do jogo ----------
function ehGalo(nome) {
  const n = norm(nome);
  return n.startsWith('atletico') && !n.includes('goian') && !n.includes('paranaense');
}
// Enriquecido: lado do Galo, gols pró/contra, resultado
function enriquecer(j) {
  const galoMandante = ehGalo(j.mandante) || !ehGalo(j.visitante);
  const gp = +(galoMandante ? j.golsMandante : j.golsVisitante) || 0;
  const gc = +(galoMandante ? j.golsVisitante : j.golsMandante) || 0;
  return {
    ...j,
    adversario: String(galoMandante ? j.visitante : j.mandante).trim(),
    gp, gc,
    res: gp > gc ? 'V' : gp < gc ? 'D' : 'E',
    ano: (j.data || '').slice(0, 4),
    competicao: String(j.competicao || '').trim(),
    estadio: String(j.estadio || '').trim(),
  };
}
function parseAutores(txt) {
  const out = [];
  if (!txt || /^\s*-?\s*$/.test(txt)) return out;
  txt.split(/,|\se\s/).forEach(p => {
    p = p.trim(); if (!p || p === '-') return;
    const m = p.match(/^(.*?)\s*\((\d+)\s*x?\)\s*$/i);
    let nome = m ? m[1].trim() : p, n = m ? +m[2] : 1;
    nome = APELIDOS[norm(nome)] || nome;
    out.push({ nome, n });
  });
  return out;
}
function ehTitulo(j) { return /campe[aã]o/i.test(j.obs || '') && !/vice/i.test(j.obs || ''); }

// ---------- Dados ----------
const cfg = () => ler(K.cfg, { apiUrl: '', secret: '' });

function carregarLocal() {
  const c = cfg();
  const base = c.apiUrl ? ler(K.cache, null) || window.SEED_JOGOS : [...window.SEED_JOGOS, ...ler(K.locais, [])];
  const pend = ler(K.pend, []).map(j => ({ ...j, pendente: true }));
  estado.jogos = [...base, ...pend].map(enriquecer).sort((a, b) => b.data.localeCompare(a.data));
}

async function api(acao, extra) {
  const c = cfg();
  if (acao === 'listar') {
    const r = await fetch(c.apiUrl + (c.apiUrl.includes('?') ? '&' : '?') + 'acao=listar&t=' + Date.now());
    const d = await r.json(); if (!d.ok) throw new Error(d.erro || 'Erro');
    return d;
  }
  // text/plain evita o "preflight" de CORS que o Apps Script não suporta
  const r = await fetch(c.apiUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ acao, secret: c.secret, ...extra }),
  });
  const d = await r.json(); if (!d.ok) throw new Error(d.erro || 'Erro');
  return d;
}

function statusSync(txt) { $('#syncStatus').textContent = txt; }

async function sincronizar(silencioso) {
  const c = cfg();
  if (!c.apiUrl) { statusSync('Modo local'); return; }
  if (estado.sincronizando) return;
  estado.sincronizando = true; statusSync('Sincronizando…');
  try {
    await enviarPendentes();
    const d = await api('listar');
    gravar(K.cache, d.jogos);
    carregarLocal(); render();
    statusSync('✓ ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    if (!silencioso) toast('Planilha sincronizada');
  } catch (e) {
    statusSync('Sem conexão');
    if (!silencioso) toast('Não deu para sincronizar: ' + e.message);
  } finally { estado.sincronizando = false; }
}

async function enviarPendentes() {
  const pend = ler(K.pend, []);
  while (pend.length) {
    const { pendente, ...jogo } = pend[0];
    await api('adicionar', { jogo });
    pend.shift(); gravar(K.pend, pend);
  }
}

async function salvarJogo(jogo) {
  const c = cfg();
  if (!c.apiUrl) {
    const l = ler(K.locais, []); l.push(jogo); gravar(K.locais, l);
    carregarLocal(); return 'Jogo salvo neste iPhone';
  }
  const pend = ler(K.pend, []); pend.push(jogo); gravar(K.pend, pend);
  carregarLocal();
  try { await enviarPendentes(); await sincronizar(true); return 'Jogo salvo na planilha! 🐓'; }
  catch { return 'Sem conexão: o jogo fica guardado e vai para a planilha depois'; }
}

// ---------- Cálculos ----------
function porCategoria() {
  return estado.categoria === 'Todos' ? estado.jogos : estado.jogos.filter(j => (j.categoria || 'Profissional') === estado.categoria);
}
function resumo(lista) {
  const r = { j: lista.length, V: 0, E: 0, D: 0, gp: 0, gc: 0, pub: 0, nPub: 0 };
  lista.forEach(j => { r[j.res]++; r.gp += j.gp; r.gc += j.gc; if (j.publico) { r.pub += +j.publico; r.nPub++; } });
  r.aprov = r.j ? (r.V * 3 + r.E) / (r.j * 3) * 100 : 0;
  r.mediaPub = r.nPub ? r.pub / r.nPub : null;
  return r;
}
function agrupar(lista, chave) {
  const m = new Map();
  lista.forEach(j => {
    const k = typeof chave === 'function' ? chave(j) : j[chave];
    if (!k) return;
    const nk = norm(k);
    if (!m.has(nk)) m.set(nk, { nome: k, jogos: [] });
    m.get(nk).jogos.push(j);
  });
  return [...m.values()].map(g => ({ ...g, ...resumo(g.jogos) }));
}
function artilheiros(lista) {
  const m = new Map();
  lista.forEach(j => parseAutores(j.autores).forEach(a => {
    const k = norm(a.nome);
    if (!m.has(k)) m.set(k, { nome: a.nome, gols: 0, jogos: 0 });
    const x = m.get(k); x.gols += a.n; x.jogos++;
  }));
  return [...m.values()].sort((a, b) => b.gols - a.gols || a.nome.localeCompare(b.nome));
}
function sequencias(lista) {
  const ord = [...lista].sort((a, b) => a.data.localeCompare(b.data));
  let inv = 0, maxInv = 0, vit = 0, maxVit = 0;
  ord.forEach(j => {
    inv = j.res === 'D' ? 0 : inv + 1; maxInv = Math.max(maxInv, inv);
    vit = j.res === 'V' ? vit + 1 : 0; maxVit = Math.max(maxVit, vit);
  });
  return { maxInv, maxVit, invAtual: inv };
}

// ---------- Componentes ----------
function cardJogo(j) {
  const titulo = ehTitulo(j) ? '<span class="tag ouro">🏆</span>' : '';
  const pend = j.pendente ? '<span class="tag pend">A enviar</span>' : '';
  const base = j.categoria === 'Base' ? '<span class="tag">Base</span>' : '';
  return `<div class="jogo" data-id="${esc(j.id)}">
    <div class="res ${j.res}">${j.res}</div>
    <div class="meio">
      <div class="times">${esc(j.adversario)}${titulo}${base}${pend}</div>
      <div class="info">${fmtData(j.data)} · ${esc(j.competicao)} · ${esc(j.estadio)}</div>
    </div>
    <div class="placar">${j.gp} × ${j.gc}</div>
  </div>`;
}
function segCategoria() {
  const temBase = estado.jogos.some(j => j.categoria === 'Base');
  if (!temBase) return '';
  return `<div class="seg" id="segCat">${['Todos', 'Profissional', 'Base'].map(c =>
    `<button data-cat="${c}" class="${estado.categoria === c ? 'ativo' : ''}">${c}</button>`).join('')}</div>`;
}
function barraVED(r) {
  if (!r.j) return '';
  return `<div class="barra"><i style="width:${r.V / r.j * 100}%;background:var(--v)"></i><i style="width:${r.E / r.j * 100}%;background:var(--e)"></i><i style="width:${r.D / r.j * 100}%;background:var(--d)"></i></div>`;
}

// ---------- Telas ----------
function telaResumo() {
  const lista = porCategoria();
  if (!lista.length) return segCategoria() + '<div class="vazio">Nenhum jogo ainda.</div>';
  const r = resumo(lista);
  const seq = sequencias(lista);
  const titulos = lista.filter(ehTitulo);
  const maiorVit = [...lista].sort((a, b) => (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp)[0];
  const maiorPub = [...lista].filter(j => j.publico).sort((a, b) => b.publico - a.publico)[0];
  const art = artilheiros(lista)[0];
  const hoje = hojeISO().slice(5);
  const nesteDia = lista.filter(j => j.data.slice(5) === hoje);
  const anos = new Set(lista.map(j => j.ano)).size;
  const estadios = new Set(lista.map(j => norm(j.estadio))).size;

  return `${segCategoria()}
  <div class="card hero">
    <div class="num">${r.j}</div>
    <div class="rot">Jogos do Galo ao vivo · ${plural(anos, 'temporada')}</div>
    <div class="ved">
      <div><b class="cv">${r.V}</b><span>Vitórias</span></div>
      <div><b class="ce">${r.E}</b><span>Empates</span></div>
      <div><b class="cd">${r.D}</b><span>Derrotas</span></div>
    </div>
    ${barraVED(r)}
  </div>
  <div class="grade">
    <div class="mini"><b>${r.aprov.toFixed(1).replace('.', ',')}%</b><span>Aproveitamento</span></div>
    <div class="mini"><b>${r.gp} · ${r.gc}</b><span>Gols pró · contra (saldo ${r.gp - r.gc >= 0 ? '+' : ''}${r.gp - r.gc})</span></div>
    <div class="mini"><b>${fmtNum(r.mediaPub)}</b><span>Média de público</span></div>
    <div class="mini"><b>${titulos.length}</b><span>${titulos.length === 1 ? 'Título' : 'Títulos'} na arquibancada 🏆</span></div>
    <div class="mini"><b>${seq.maxInv}</b><span>Maior sequência invicta</span></div>
    <div class="mini"><b>${estadios}</b><span>${estadios === 1 ? 'Estádio' : 'Estádios'}</span></div>
  </div>
  ${nesteDia.length ? `<h2>📅 Neste dia</h2><div class="neste-dia">${nesteDia.map(cardJogo).join('')}</div>` : ''}
  <h2>Último jogo</h2>
  ${cardJogo(lista[0])}
  <h2>Recordes</h2>
  <div class="grade">
    ${art ? `<div class="mini"><b>${esc(art.nome)}</b><span>Artilheiro · ${plural(art.gols, 'gol')}</span></div>` : ''}
    ${maiorVit ? `<div class="mini clic" data-id="${esc(maiorVit.id)}"><b>${maiorVit.gp} × ${maiorVit.gc}</b><span>Maior vitória</span><small>${esc(maiorVit.adversario)} · ${maiorVit.ano}</small></div>` : ''}
    ${maiorPub ? `<div class="mini clic" data-id="${esc(maiorPub.id)}"><b>${fmtNum(maiorPub.publico)}</b><span>Maior público</span><small>${esc(maiorPub.adversario)} · ${maiorPub.ano}</small></div>` : ''}
    <div class="mini"><b>${seq.maxVit}</b><span>Vitórias seguidas (recorde)</span></div>
  </div>
  ${titulos.length ? `<h2>🏆 Títulos que eu vi</h2>${titulos.map(cardJogo).join('')}` : ''}`;
}

function opcoes(lista, campo) {
  const m = new Map();
  lista.forEach(j => { const v = j[campo]; if (v && !m.has(norm(v))) m.set(norm(v), v); });
  return [...m.values()].sort((a, b) => campo === 'ano' ? b.localeCompare(a) : a.localeCompare(b));
}
function filtrar(lista) {
  const f = estado.filtros, t = norm(f.texto);
  return lista.filter(j =>
    (!f.ano || j.ano === f.ano) &&
    (!f.comp || norm(j.competicao) === norm(f.comp)) &&
    (!f.estadio || norm(j.estadio) === norm(f.estadio)) &&
    (!f.adv || norm(j.adversario) === norm(f.adv)) &&
    (!f.res || j.res === f.res) &&
    (!t || norm([j.adversario, j.competicao, j.estadio, j.autores, j.obs, fmtData(j.data)].join(' ')).includes(t)));
}
function telaJogos() {
  const base = porCategoria();
  const f = estado.filtros;
  const sel = (id, campo, rotulo, valores, atual) => `<select id="${id}" class="${atual ? 'on' : ''}">
      <option value="">${rotulo}</option>${valores.map(v => `<option value="${esc(v)}" ${norm(v) === norm(atual) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  const filtros = `
    <input class="busca" id="busca" type="search" placeholder="Buscar adversário, jogador, fase…" value="${esc(f.texto)}">
    <div class="filtros">
      ${sel('fAno', 'ano', 'Ano', opcoes(base, 'ano'), f.ano)}
      ${sel('fComp', 'competicao', 'Competição', opcoes(base, 'competicao'), f.comp)}
      ${sel('fEst', 'estadio', 'Estádio', opcoes(base, 'estadio'), f.estadio)}
      ${sel('fAdv', 'adversario', 'Adversário', opcoes(base, 'adversario'), f.adv)}
      <select id="fRes" class="${f.res ? 'on' : ''}"><option value="">Resultado</option>
        ${[['V', 'Vitórias'], ['E', 'Empates'], ['D', 'Derrotas']].map(([v, n]) => `<option value="${v}" ${f.res === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>`;
  return segCategoria() + filtros + `<div id="listaJogos">${listaJogosHTML()}</div>`;
}
function listaJogosHTML() {
  const lista = filtrar(porCategoria());
  const r = resumo(lista);
  let html = `<div class="resumo-filtro">${plural(r.j, 'jogo')} · <span class="cv">${r.V}V</span> <span class="ce">${r.E}E</span> <span class="cd">${r.D}D</span> · ${r.gp} gols pró, ${r.gc} contra</div>`;
  if (!lista.length) return html + '<div class="vazio">Nenhum jogo encontrado.</div>';
  let anoAtual = null;
  lista.forEach(j => {
    if (j.ano !== anoAtual) {
      anoAtual = j.ano;
      const ra = resumo(lista.filter(x => x.ano === anoAtual));
      html += `<div class="ano-cab">${anoAtual}<span>${plural(ra.j, 'jogo')} · ${ra.V}V ${ra.E}E ${ra.D}D</span></div>`;
    }
    html += cardJogo(j);
  });
  return html;
}

function tabelaGrupos(grupos, rotulo, filtroCampo, limite) {
  const linhas = grupos.slice(0, limite || 999).map(g => `<tr class="clic" data-filtro="${filtroCampo}" data-valor="${esc(g.nome)}">
    <td>${esc(g.nome)}</td><td class="n">${g.j}</td><td class="n cv">${g.V}</td><td class="n ce">${g.E}</td><td class="n cd">${g.D}</td><td class="n">${g.aprov.toFixed(0)}%</td></tr>`).join('');
  return `<div class="card"><table class="tabela"><tr><th>${rotulo}</th><th class="n">J</th><th class="n">V</th><th class="n">E</th><th class="n">D</th><th class="n">%</th></tr>${linhas}</table></div>`;
}
function telaStats() {
  const lista = porCategoria();
  if (!lista.length) return segCategoria() + '<div class="vazio">Nenhum jogo ainda.</div>';
  const art = artilheiros(lista);
  const ordJ = (a, b) => b.j - a.j || b.aprov - a.aprov || a.nome.localeCompare(b.nome);
  const adv = agrupar(lista, 'adversario').sort(ordJ);
  const est = agrupar(lista, 'estadio').sort(ordJ);
  const comp = agrupar(lista, 'competicao').sort(ordJ);
  const anos = agrupar(lista, 'ano').sort((a, b) => b.nome.localeCompare(a.nome));
  const top = art.slice(0, 15);
  return `${segCategoria()}
  <h2>⚽ Artilheiros que eu vi</h2>
  <div class="card"><table class="tabela"><tr><th></th><th>Jogador</th><th class="n">Gols</th></tr>
    ${top.map((a, i) => `<tr class="clic" data-busca="${esc(a.nome)}"><td class="pos">${i + 1}</td><td>${esc(a.nome)}</td><td class="n"><b>${a.gols}</b></td></tr>`).join('')}
  </table>${art.length > 15 ? `<div class="dica">+ ${art.length - 15} jogadores com menos gols</div>` : ''}</div>
  <h2>Por temporada</h2>${tabelaGrupos(anos, 'Ano', 'ano')}
  <h2>Por competição</h2>${tabelaGrupos(comp, 'Competição', 'comp')}
  <h2>Por estádio</h2>${tabelaGrupos(est, 'Estádio', 'estadio')}
  <h2>Por adversário</h2>${tabelaGrupos(adv, 'Adversário', 'adv')}
  <div class="dica" style="text-align:center;margin-top:12px">Toque numa linha para ver os jogos</div>`;
}

function telaAdicionar() {
  const todos = estado.jogos;
  const dl = (id, campo) => `<datalist id="${id}">${opcoes(todos, campo).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const c = cfg();
  return `<form class="form" id="formJogo" autocomplete="off">
    <label>Data</label><input type="date" name="data" required value="${hojeISO()}">
    <label>Categoria</label>
    <select name="categoria"><option>Profissional</option><option>Base</option></select>
    <label>Onde o Galo jogou</label>
    <select name="lado"><option value="casa">Atlético mandante</option><option value="fora">Atlético visitante</option></select>
    <label>Adversário</label><input name="adversario" list="dlAdv" required placeholder="Ex.: Cruzeiro">
    <label>Placar</label>
    <div class="placar-form">
      <div class="nome" id="nomeA">Atlético</div>
      <input name="g1" type="number" inputmode="numeric" min="0" required value="0">
      <div class="x">×</div>
      <input name="g2" type="number" inputmode="numeric" min="0" required value="0">
      <div class="nome" id="nomeB">Adversário</div>
    </div>
    <label>Estádio</label><input name="estadio" list="dlEst" required placeholder="Ex.: Arena MRV">
    <label>Competição</label><input name="competicao" list="dlComp" required placeholder="Ex.: Brasileiro">
    <label>Gols do Galo (autores)</label><input name="autores" placeholder="Ex.: Hulk (2x) e Bernard">
    <div class="dica">Use "Nome (2x)" para mais de um gol; separe com vírgula ou "e".</div>
    <label>Público</label><input name="publico" type="number" inputmode="numeric" min="0" placeholder="Ex.: 42500">
    <label>Observação</label><input name="obs" placeholder="Ex.: 12ª rodada / 2º jogo final - Campeão">
    ${dl('dlAdv', 'adversario')}${dl('dlEst', 'estadio')}${dl('dlComp', 'competicao')}
    <button class="btn" type="submit">Salvar jogo</button>
    <div class="dica" style="text-align:center;margin-top:10px">${c.apiUrl ? 'Vai direto para a sua planilha do Google.' : 'O app ainda não está ligado à planilha: o jogo fica salvo só neste aparelho (veja Ajustes).'}</div>
  </form>`;
}

function telaAjustes() {
  const c = cfg();
  const pend = ler(K.pend, []).length;
  const locais = ler(K.locais, []).length;
  return `<div class="form">
    <h2>Planilha do Google</h2>
    <div class="card" style="font-size:14px;color:var(--sub)">Cole aqui o endereço do Apps Script (veja o LEIAME). Assim o app lê e grava direto na sua planilha.</div>
    <label>URL do Apps Script</label><input id="cfgUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.apiUrl)}">
    <label>Senha (a mesma do script)</label><input id="cfgSecret" type="password" value="${esc(c.secret)}">
    <button class="btn" id="btnSalvarCfg">Salvar e sincronizar</button>
    ${pend ? `<button class="btn sec" id="btnPend">Enviar ${plural(pend, 'jogo pendente', 'jogos pendentes')}</button>` : ''}
    <h2>Dados</h2>
    <button class="btn sec" id="btnCsv">Exportar todos os jogos (CSV)</button>
    ${locais ? `<button class="btn sec perigo" id="btnLimparLocais">Apagar ${plural(locais, 'jogo salvo', 'jogos salvos')} só neste aparelho</button>` : ''}
    <div class="dica" style="text-align:center;margin-top:24px">${plural(estado.jogos.length, 'jogo')} carregados · ${c.apiUrl ? 'ligado à planilha' : 'modo offline (dados da planilha importada)'}</div>
  </div>`;
}

// ---------- Detalhe ----------
function abrirDetalhe(id) {
  const j = estado.jogos.find(x => String(x.id) === String(id)); if (!j) return;
  const autores = parseAutores(j.autores);
  const item = (k, v) => v ? `<div class="det-item"><span>${k}</span><span>${v}</span></div>` : '';
  const podeApagar = j.pendente || String(j.id).startsWith('l');
  $('#sheetCorpo').innerHTML = `
    <div class="det-placar">
      <div class="linha"><div class="t">${esc(j.mandante)}</div><div class="p">${j.golsMandante} × ${j.golsVisitante}</div><div class="t">${esc(j.visitante)}</div></div>
      <div class="sub"><span class="res ${j.res}" style="display:inline-block;padding:2px 8px;border-radius:6px;color:#000;font-weight:700">${{ V: 'Vitória', E: 'Empate', D: 'Derrota' }[j.res]}</span>${ehTitulo(j) ? ' <span class="tag ouro">🏆 Título</span>' : ''}</div>
    </div>
    ${item('Data', fmtData(j.data, true))}
    ${item('Competição', esc(j.competicao))}
    ${item('Fase / obs.', esc(j.obs))}
    ${item('Estádio', esc(j.estadio))}
    ${item('Público', j.publico ? fmtNum(j.publico) : '')}
    ${item('Gols do Galo', autores.length ? autores.map(a => esc(a.nome) + (a.n > 1 ? ` (${a.n})` : '')).join(', ') : (j.gp ? esc(j.autores) : '—'))}
    ${item('Categoria', j.categoria !== 'Profissional' ? esc(j.categoria) : '')}
    ${j.pendente ? '<div class="dica">⏳ Ainda não foi enviado para a planilha.</div>' : ''}
    ${podeApagar ? `<button class="btn sec perigo" id="btnApagar" data-id="${esc(j.id)}">Apagar este jogo</button>` : ''}
    <button class="btn sec" data-fechar>Fechar</button>`;
  $('#sheet').classList.remove('oculto');
}
const fecharSheet = () => $('#sheet').classList.add('oculto');

// ---------- Render e eventos ----------
const TELAS = { resumo: telaResumo, jogos: telaJogos, adicionar: telaAdicionar, stats: telaStats, ajustes: telaAjustes };
const TITULOS = { resumo: 'Meu Galo', jogos: 'Jogos', adicionar: 'Novo jogo', stats: 'Números', ajustes: 'Ajustes' };
function render() {
  $('#conteudo').innerHTML = TELAS[estado.tab]();
  $('#titulo').textContent = TITULOS[estado.tab];
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('ativo', b.dataset.tab === estado.tab));
}
function irPara(tab) { estado.tab = tab; render(); window.scrollTo(0, 0); }

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) irPara(b.dataset.tab);
});

$('#conteudo').addEventListener('click', e => {
  const cat = e.target.closest('[data-cat]');
  if (cat) { estado.categoria = cat.dataset.cat; render(); return; }
  const linha = e.target.closest('[data-filtro]');
  if (linha) {
    estado.filtros = { texto: '', ano: '', comp: '', estadio: '', res: '', adv: '' };
    estado.filtros[linha.dataset.filtro] = linha.dataset.valor;
    irPara('jogos'); return;
  }
  const busca = e.target.closest('[data-busca]');
  if (busca) {
    estado.filtros = { texto: busca.dataset.busca, ano: '', comp: '', estadio: '', res: '', adv: '' };
    irPara('jogos'); return;
  }
  const jogo = e.target.closest('[data-id]');
  if (jogo) { abrirDetalhe(jogo.dataset.id); return; }
  if (e.target.id === 'btnSalvarCfg') {
    gravar(K.cfg, { apiUrl: $('#cfgUrl').value.trim(), secret: $('#cfgSecret').value });
    carregarLocal(); render(); sincronizar(false);
  }
  if (e.target.id === 'btnPend') sincronizar(false).then(render);
  if (e.target.id === 'btnCsv') exportarCSV();
  if (e.target.id === 'btnLimparLocais' && confirm('Apagar os jogos salvos só neste aparelho?')) {
    gravar(K.locais, []); carregarLocal(); render(); toast('Apagados');
  }
});

$('#conteudo').addEventListener('input', e => {
  if (e.target.id === 'busca') {
    estado.filtros.texto = e.target.value;
    $('#listaJogos').innerHTML = listaJogosHTML();
  }
});
$('#conteudo').addEventListener('change', e => {
  const mapa = { fAno: 'ano', fComp: 'comp', fEst: 'estadio', fAdv: 'adv', fRes: 'res' };
  if (mapa[e.target.id]) { estado.filtros[mapa[e.target.id]] = e.target.value; render(); }
  if (e.target.name === 'lado' || e.target.name === 'adversario') atualizarNomesPlacar();
});
$('#conteudo').addEventListener('keyup', e => { if (e.target.name === 'adversario') atualizarNomesPlacar(); });

function atualizarNomesPlacar() {
  const f = $('#formJogo'); if (!f) return;
  const adv = f.adversario.value || 'Adversário';
  const casa = f.lado.value === 'casa';
  $('#nomeA').textContent = casa ? 'Atlético' : adv;
  $('#nomeB').textContent = casa ? adv : 'Atlético';
}

$('#conteudo').addEventListener('submit', async e => {
  if (e.target.id !== 'formJogo') return;
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button[type=submit]');
  const casa = f.lado.value === 'casa';
  const adv = f.adversario.value.trim();
  const jogo = {
    id: 'l' + Date.now(),
    categoria: f.categoria.value,
    data: f.data.value,
    mandante: casa ? 'Atlético' : adv,
    golsMandante: +f.g1.value || 0,
    golsVisitante: +f.g2.value || 0,
    visitante: casa ? adv : 'Atlético',
    estadio: f.estadio.value.trim(),
    competicao: f.competicao.value.trim(),
    autores: f.autores.value.trim(),
    publico: f.publico.value ? +f.publico.value : null,
    obs: f.obs.value.trim(),
  };
  btn.disabled = true; btn.textContent = 'Salvando…';
  const msg = await salvarJogo(jogo);
  toast(msg);
  irPara('jogos');
});

$('#sheet').addEventListener('click', e => {
  if (e.target.closest('[data-fechar]')) { fecharSheet(); return; }
  if (e.target.id === 'btnApagar' && confirm('Apagar este jogo?')) {
    const id = e.target.dataset.id;
    gravar(K.locais, ler(K.locais, []).filter(j => j.id !== id));
    gravar(K.pend, ler(K.pend, []).filter(j => j.id !== id));
    carregarLocal(); fecharSheet(); render(); toast('Jogo apagado');
  }
});

function exportarCSV() {
  const cols = ['data', 'categoria', 'mandante', 'golsMandante', 'golsVisitante', 'visitante', 'estadio', 'competicao', 'autores', 'publico', 'obs'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [cols.join(';'), ...[...estado.jogos].reverse().map(j => cols.map(c => q(j[c])).join(';'))];
  const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const nome = `jogos-galo-${hojeISO()}.csv`;
  const arq = new File([blob], nome, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    navigator.share({ files: [arq], title: 'Meus jogos do Galo' }).catch(() => { });
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  }
}

// ---------- Início ----------
if (TELAS[location.hash.slice(1)]) estado.tab = location.hash.slice(1);
carregarLocal();
render();
sincronizar(true);
window.addEventListener('online', () => sincronizar(true));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
