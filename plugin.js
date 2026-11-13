/* Anota Treino Home (Penpot plugin).
   Desenha 3 versões da Home no estilo Escuro neutro, lado a lado na página "Home", usando cópias dos
   componentes da biblioteca conectada "Anota Treino - Biblioteca". Só roda no arquivo "HOME".
   Não cria fluxos nem interações. Ao rodar de novo, apaga só a página que ele mesmo criou e refaz.
   Botão Diagnóstico: só lê a biblioteca e o arquivo, não muda nada. */
const PLUGIN_BUILD = 'v1.1 · 2026-11-12';
const FILE_NAME = 'HOME';
const LIB_NAME = 'Anota Treino - Biblioteca';
const UI_URL = 'https://estudio-orsi.github.io/anota-treino-home-plugin/index.html';
const PD_NS = 'anotatreino';
const PD_KEY = 'home-versoes';
const W = 393, H = 852;
// ---------------------------------------------------------------- utils + log
const LOG = [], ERRORS = [], ERRLIST = [], WARNINGS = [];
const STATS = { pages: 0, screens: 0, copies: 0, texts: 0, flexBoards: 0, interactions: 0, flows: 0, arrows: 0,
  textOverrides: 0, textOverridesFixed: 0, textOverridesFailed: 0, variantFallbacks: 0, implicitFlowsRemoved: 0, layoutWarnings: 0, layoutWaits: 0, layoutWaitTimeouts: 0, drawings: 0, textsChecked: 0, textFinalRedone: 0, textRemeasured: 0, textFinalMismatch: 0 };
const USED = {};   // component key -> count
const FALLBACKS = [];   // {set, requested, used, available}
let CTX = { page: '', screen: '' };
let PROGRESS = { done: 0, total: 1 };
function say(msg, extra) {
  LOG.push({ t: Date.now(), msg: msg });
  try { console.log('[HOME] ' + msg); } catch (e) {}
  try { penpot.ui.sendMessage(Object.assign({ type: 'progress', msg: msg, done: PROGRESS.done, total: PROGRESS.total }, extra || {})); } catch (e) {}
}
function errMsg(e) { return e && e.message ? e.message : String(e); }
function err(where, e, extra) {
  const m = where + ': ' + errMsg(e);
  ERRORS.push(m);
  ERRLIST.push(Object.assign({ where: where, message: errMsg(e), page: CTX.page, screen: CTX.screen }, extra || {}));
  try { console.warn('[HOME] ' + m); } catch (x) {}
}
function warn(kind, extra) { WARNINGS.push(Object.assign({ kind: kind, page: CTX.page, screen: CTX.screen }, extra || {})); }
const hasTimer = typeof setTimeout === 'function';
const sleep = (ms) => (hasTimer ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());
async function waitFor(fn, ms, step) {
  const t0 = Date.now();
  for (;;) {
    let v = null; try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() - t0 > (ms || 4000)) return null;
    await sleep(step || 40);
  }
}
function tryDo(where, fn, extra) { try { return fn(); } catch (e) { err(where, e, extra); return undefined; } }
function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; } }
// Espera o Penpot terminar de medir textos e recalcular layouts (penpot.waitForLayoutUpdate, Penpot 2.19+).
let SETTLE_TIMEOUTS_IN_A_ROW = 0;
async function settle(shape, ms) {
  STATS.layoutWaits++;
  if (SETTLE_TIMEOUTS_IN_A_ROW >= 3) { await sleep(250); return false; }   // o Penpot não está liberando: segue só com pausas curtas
  const fnShape = shape && safe(() => typeof shape.waitForLayoutUpdate === 'function', false);
  const fnAll = safe(() => typeof penpot.waitForLayoutUpdate === 'function', false);
  try {
    if (fnShape) { await shape.waitForLayoutUpdate(ms || 8000); SETTLE_TIMEOUTS_IN_A_ROW = 0; return true; }
    if (fnAll) { await penpot.waitForLayoutUpdate(ms || 8000); SETTLE_TIMEOUTS_IN_A_ROW = 0; return true; }
  } catch (e) { STATS.layoutWaitTimeouts++; SETTLE_TIMEOUTS_IN_A_ROW++; warn('espera de layout', { message: errMsg(e) }); return false; }
  await sleep(400);
  return false;
}

// ---------------------------------------------------------------- library
let LIB = null;
const SETS = {};      // nome normalizado do conjunto -> [{comp, props, id, name, path}]
const COLORS = {};    // token name -> LibraryColor
const TYPOS = {};     // 'path/name' -> LibraryTypography
const LIBINFO = { listed: 0, expanded: 0, variantSets: 0, sets: 0 };
const FALLBACK_HEX = { background: '#0a0a0a', foreground: '#fafafa', card: '#171717', 'muted-foreground': '#a1a1a1', brand: '#7ab8d9', border: '#2a2a2a', destructive: '#e5484d', overlay: '#000000', success: '#6fbf9f', warning: '#d9b26f', secondary: '#262626', muted: '#262626', ring: '#737373', 'brand-foreground': '#0a0a0a' };
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
const normPath = (s) => String(s || '').split('/').map(x => x.trim()).filter(Boolean).join(' / ');

function findLibrary() {
  let libs = [];
  try { libs = penpot.library.connected || []; } catch (e) { libs = []; }
  const cur = safe(() => penpot.currentFile, null);
  const curId = cur ? safe(() => cur.id, null) : null;
  for (const l of libs) {
    try { if (norm(l.name) === norm(LIB_NAME) && l.id !== curId) return l; } catch (e) {}
  }
  return null;
}
// "Variant=default, Size=lg" -> {Variant:'default', Size:'lg'}
function parseNameProps(name) {
  const o = {}; let ok = false;
  String(name || '').split(',').forEach(p => { const i = p.indexOf('='); if (i > 0) { o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); ok = true; } });
  return ok ? o : null;
}
function propsOf(c) {
  const vp = safe(() => c.variantProps, null);
  const o = {};
  if (vp && typeof vp === 'object') for (const k of Object.keys(vp)) o[k] = vp[k];
  if (Object.keys(o).length) return o;
  return parseNameProps(safe(() => c.name, '')) || {};
}
// Na API do Penpot, library.components só traz UMA variante de cada conjunto (a principal);
// as outras vêm de component.variants.variantComponents().
function expandComponents(lib) {
  const out = []; const seen = {};
  const listed = safe(() => lib.components, []) || [];
  LIBINFO.listed = listed.length; LIBINFO.variantSets = 0;
  for (const c of listed) {
    const cid = safe(() => c.id, null);
    const isV = safe(() => !!c.isVariant(), false);
    if (!isV) { if (!seen[cid]) { seen[cid] = 1; out.push({ comp: c, primary: null }); } continue; }
    LIBINFO.variantSets++;
    let members = [];
    const vs = safe(() => c.variants, null);
    if (vs) { try { members = vs.variantComponents() || []; } catch (e) { err('variantComponents', e, { component: safe(() => c.name, '?') }); } }
    if (!members.length) members = [c];
    if (!members.some(m => safe(() => m.id, 1) === cid)) members = members.concat([c]);
    for (const m of members) { const mid = safe(() => m.id, null); if (seen[mid]) continue; seen[mid] = 1; out.push({ comp: m, primary: c }); }
  }
  LIBINFO.expanded = out.length;
  return out;
}
function setKeysFor(c, primary) {
  const keys = [];
  const name = safe(() => c.name, '') || '';
  const path = normPath(safe(() => c.path, ''));
  if (primary) {
    const pn = safe(() => primary.name, '') || '';
    const pp = normPath(safe(() => primary.path, ''));
    if (pn && pn.indexOf('=') < 0) keys.push(pn, (pp ? pp + ' / ' : '') + pn);
    if (name && name.indexOf('=') < 0) keys.push(name, (path ? path + ' / ' : '') + name);
    if (path) { keys.push(path); keys.push(path.split(' / ').pop()); }
    if (pp) { keys.push(pp); keys.push(pp.split(' / ').pop()); }
  } else {
    keys.push((path ? path + ' / ' : '') + name, name);
  }
  return Array.from(new Set(keys.filter(Boolean).map(norm)));
}
function indexLibrary(lib) {
  for (const k of Object.keys(SETS)) delete SETS[k];
  for (const k of Object.keys(COLORS)) delete COLORS[k];
  for (const k of Object.keys(TYPOS)) delete TYPOS[k];
  for (const { comp: c, primary } of expandComponents(lib)) {
    try {
      const entry = { comp: c, props: primary ? propsOf(c) : {}, id: safe(() => c.id, ''), name: safe(() => c.name, ''), path: safe(() => c.path, '') };
      for (const k of setKeysFor(c, primary)) {
        const list = (SETS[k] = SETS[k] || []);
        if (!list.some(x => x.id === entry.id)) list.push(entry);
      }
    } catch (e) { err('index component', e); }
  }
  LIBINFO.sets = Object.keys(SETS).length;
  for (const c of (safe(() => lib.colors, []) || [])) { try { COLORS[c.name] = c; } catch (e) {} }
  for (const t of (safe(() => lib.typographies, []) || [])) { try { TYPOS[(t.path ? normPath(t.path).replace(/ \/ /g, '/') + '/' : '') + t.name] = t; } catch (e) {} }
}
function availableValues(list) {
  const av = {};
  for (const x of list) for (const k of Object.keys(x.props)) { (av[k] = av[k] || []); if (av[k].indexOf(String(x.props[k])) < 0) av[k].push(String(x.props[k])); }
  return av;
}
// Acha a variante pedida. quiet=true: não registra erro (usado no diagnóstico).
function resolveComp(set, props) {
  const list = SETS[norm(set)];
  if (!list || !list.length) return { comp: null, why: 'conjunto não existe' };
  props = props || {};
  const want = Object.keys(props);
  let best = null, bestScore = -1;
  for (const x of list) {
    const have = {}; for (const k of Object.keys(x.props)) have[norm(k)] = norm(x.props[k]);
    let score = 0;
    for (const k of want) if (have[norm(k)] === norm(props[k])) score++;
    if (score > bestScore) { best = x; bestScore = score; }
  }
  return { comp: best.comp, exact: bestScore === want.length, entry: best, list: list };
}
function findComp(set, props) {
  const r = resolveComp(set, props);
  if (!r.comp) {
    const e = new Error('Componente "' + set + '" não existe na biblioteca');
    err('componente', e, { component: set, requested: props || {} });
    e.logged = true; throw e;
  }
  if (!r.exact) {
    STATS.variantFallbacks++;
    const fb = { component: set, requested: props, used: r.entry.props, usedName: r.entry.name, available: availableValues(r.list) };
    FALLBACKS.push(Object.assign({ page: CTX.page, screen: CTX.screen }, fb));
    err('variante', new Error(set + ' ' + JSON.stringify(props) + ' não encontrada; usei ' + JSON.stringify(r.entry.props)), fb);
  }
  return r.comp;
}
function fill(token) {
  const c = COLORS[token];
  if (c) { try { return Object.assign({}, c.asFill()); } catch (e) {} }
  return { fillColor: FALLBACK_HEX[token] || '#ff00ff', fillOpacity: token === 'overlay' ? 0.6 : 1 };
}
function stroke(token, w, align, extra) {
  const c = COLORS[token]; let s = null;
  if (c) { try { s = Object.assign({}, c.asStroke()); } catch (e) { s = null; } }
  if (!s) s = { strokeColor: FALLBACK_HEX[token] || '#ff00ff', strokeOpacity: 1 };
  s.strokeWidth = w == null ? 1 : w; s.strokeAlignment = align || 'inner'; s.strokeStyle = 'solid';
  return Object.assign(s, extra || {});
}

// ---------------------------------------------------------------- spec constructors
// F: board with flex layout. T: text. C: copy of a library component.
function F(o, kids) { return Object.assign({ t: 'F', kids: (kids || []).filter(Boolean) }, o || {}); }
function T(text, typo, color, o) { return Object.assign({ t: 'T', text: String(text), typo: typo || 'body/sm', color: color || 'foreground' }, o || {}); }
function C(set, props, o) { return Object.assign({ t: 'C', set: set, props: props || {} }, o || {}); }
const Space = (name) => F({ name: name || 'Espaço', w: 'fill', h: 'fill' });

// ---------------------------------------------------------------- text size estimate
// O Penpot mede o texto depois, de forma assíncrona. Damos um tamanho inicial próximo do real
// para o auto layout já nascer certo mesmo antes (ou sem) essa medição.
function typoMetrics(name) {
  const t = TYPOS[name];
  let fs = 14, lh = 1.4, fw = 400, ls = 0, up = false;
  if (t) {
    fs = parseFloat(safe(() => t.fontSize, '')) || fs;
    lh = parseFloat(safe(() => t.lineHeight, '')) || lh;
    fw = parseInt(safe(() => t.fontWeight, ''), 10) || fw;
    ls = parseFloat(safe(() => t.letterSpacing, '')) || 0;
    up = /upper/i.test(safe(() => t.textTransform, '') || '');
  }
  return { fs: fs, lh: lh < 4 ? lh * fs : lh, fw: fw, ls: ls, up: up };
}
function textWidth(str, m) {
  let w = 0;
  for (const ch of str) {
    let f;
    if (ch === ' ') f = 0.28;
    else if (/[il.,:;'|!·•]/.test(ch)) f = 0.3;
    else if (/[mwMW]/.test(ch)) f = 0.86;
    else if (/[A-ZÀ-Ý]/.test(ch) || (m.up && /[a-zà-ÿ]/.test(ch))) f = 0.68;
    else if (/[0-9]/.test(ch)) f = 0.6;
    else f = 0.56;
    w += f * m.fs + m.ls;
  }
  return w * (m.fw >= 700 ? 1.08 : m.fw >= 600 ? 1.06 : m.fw >= 500 ? 1.03 : 1);
}
function estimateText(str, typo, avail) {
  const m = typoMetrics(typo);
  let lines = 0, maxw = 0;
  for (const para of String(str).split('\n')) {
    if (!avail) { maxw = Math.max(maxw, textWidth(para, m)); lines++; continue; }
    let line = '', n = 1;
    for (const word of para.split(' ')) {
      const cand = line ? line + ' ' + word : word;
      if (line && textWidth(cand, m) > avail) { n++; line = word; } else line = cand;
      maxw = Math.max(maxw, Math.min(avail, textWidth(line, m)));
    }
    lines += n;
  }
  return { w: Math.ceil(maxw) + 2, h: Math.ceil(lines * m.lh) };
}

// ---------------------------------------------------------------- shape building
function setSizing(s, axis, val) {
  const key = axis === 'h' ? 'horizontalSizing' : 'verticalSizing';
  try { if (s.layoutChild) { s.layoutChild[key] = val; return true; } } catch (e) { err('sizing ' + s.name + ' ' + key + '=' + val, e); return false; }
  try { if (s.flex) { s.flex[key] = val; return true; } } catch (e) {}
  return false;
}
function pads(p) {
  if (p == null) return [0, 0, 0, 0];
  if (typeof p === 'number') return [p, p, p, p];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  return p;
}
function placeChild(s, n, parent) {
  if (!parent) return;
  parent.appendChild(s);
  if (n.abs) {
    tryDo('absolute ' + s.name, () => { s.layoutChild.absolute = true; });
    tryDo('zIndex ' + s.name, () => { s.layoutChild.zIndex = n.z != null ? n.z : 10; });
    tryDo('pos ' + s.name, () => { s.parentX = n.x || 0; s.parentY = n.y || 0; });
  }
  if (n.alignSelf) tryDo('alignSelf ' + s.name, () => { s.layoutChild.alignSelf = n.alignSelf; });
}
function finishSizing(s, n, isLayout) {
  if (n.w === 'fill') setSizing(s, 'h', 'fill');
  else if (n.w === 'hug' && isLayout) setSizing(s, 'h', 'auto');
  else if (typeof n.w === 'number' && s.layoutChild) tryDo('fixw', () => { s.layoutChild.horizontalSizing = 'fix'; });
  if (n.h === 'fill') setSizing(s, 'v', 'fill');
  else if (n.h === 'hug' && isLayout) setSizing(s, 'v', 'auto');
  else if (typeof n.h === 'number' && s.layoutChild) tryDo('fixh', () => { s.layoutChild.verticalSizing = 'fix'; });
}
function kidsOf(s) { let k = []; try { k = s.children || []; } catch (e) { k = []; } return k; }
function findIn(root, path) {
  let cur = root;
  for (const seg of path.split('/')) {
    let hit = null;
    const walk = (x) => { if (hit) return; for (const k of kidsOf(x)) { if (hit) return; if (k.name === seg) { hit = k; return; } walk(k); } };
    walk(cur);
    if (!hit) return null;
    cur = hit;
  }
  return cur;
}
function walkAll(x, fn) { fn(x); for (const k of kidsOf(x)) walkAll(k, fn); }
// Ícone da biblioteca em outro tamanho (como o ícone do selo de XP do AppHeader, 16 px). Os vetores escalam com o quadro; se não escalarem, corrige à mão.
function scaleIcon(inst, size) {
  const w0 = safe(() => inst.width, 24); if (Math.abs(w0 - size) < 0.1) return;
  const before = []; walkAll(inst, (x) => { if (x !== inst) before.push([x, safe(() => x.width, 0), safe(() => x.height, 0)]); });
  inst.resize(size, size);
  const k = size / w0; let ok = true;
  for (const b of before) { if (b[1] > 0.5 && Math.abs(safe(() => b[0].width, 0) - b[1] * k) > 0.2) { ok = false; break; } }
  if (!ok) for (const b of before) tryDo('ícone escala manual', () => { const px = b[0].parentX, py = b[0].parentY; b[0].resize(Math.max(b[1] * k, 0.01), Math.max(b[2] * k, 0.01)); b[0].parentX = px * k; b[0].parentY = py * k; });
}
// Pinta os vetores do ícone com uma cor da biblioteca (traços em "stroke …", preenchimentos em "fill …").
function colorIcon(inst, token) {
  walkAll(inst, (x) => {
    if (x === inst || safe(() => x.type, '') !== 'path') return;
    const role = String(safe(() => x.name, '') || '').split(' ')[0];
    if (role === 'fill') { tryDo('ícone fill', () => { x.fills = [fill(token)]; }); return; }
    if (role === 'bg') return;
    let w = 2, cap = null;
    try { const st = x.strokes && x.strokes[0]; if (st) { w = st.strokeWidth || 2; cap = st.strokeCapStart || null; } } catch (e) {}
    tryDo('ícone traço', () => { x.strokes = [stroke(token, w, 'center', cap ? { strokeCapStart: cap, strokeCapEnd: cap } : {})]; });
  });
}
const NAV = [];   // {shape, to}
const OVR = [];   // textos trocados nas cópias, para conferir depois
const ALLTXT = [];   // todos os textos da montagem (criados e trocados), para a conferência final
let SCREEN_SHAPES = {};
function build(n, parent, avail) {
  let s = null;
  switch (n.t) {
    case 'F': {
      s = penpot.createBoard();
      s.name = n.name || 'Grupo';
      const own = typeof n.w === 'number' ? n.w : (avail || W);
      const w0 = typeof n.w === 'number' ? n.w : own, h0 = typeof n.h === 'number' ? n.h : 10;
      s.resize(Math.max(w0, 0.01), Math.max(h0, 0.01));
      tryDo('clip ' + s.name, () => { s.clipContent = !!n.clip; });
      tryDo('fills ' + s.name, () => { s.fills = n.fill ? [fill(n.fill)] : []; });
      if (n.stroke) tryDo('strokes ' + s.name, () => { s.strokes = [stroke(n.stroke, n.sw, n.sa, n.sx)]; });
      if (n.r != null) tryDo('radius ' + s.name, () => { s.borderRadius = n.r; });
      placeChild(s, n, parent);
      const fl = s.addFlexLayout();
      STATS.flexBoards++;
      fl.dir = n.dir || 'column';
      if (n.wrap) fl.wrap = 'wrap';
      const g = n.gap || 0;
      fl.rowGap = n.rowGap != null ? n.rowGap : g;
      fl.columnGap = n.colGap != null ? n.colGap : g;
      const p = pads(n.p);
      tryDo('padding', () => { fl.topPadding = p[0]; fl.rightPadding = p[1]; fl.bottomPadding = p[2]; fl.leftPadding = p[3]; });
      fl.alignItems = n.ai || 'start';
      fl.justifyContent = n.jc || 'start';
      if (n.wrap) tryDo('alignContent', () => { fl.alignContent = 'start'; });
      const inner = Math.max(40, own - p[1] - p[3]);
      for (const k of n.kids) {
        try { build(k, s, inner); } catch (e) { if (!e.logged) err('build ' + (k.name || k.set || k.t) + ' em ' + s.name, e, k.t === 'C' ? { component: k.set, requested: k.props } : {}); }
      }
      if (n.w == null) n.w = 'hug';
      if (n.h == null) n.h = 'hug';
      finishSizing(s, n, true);
      if (n.go) NAV.push({ shape: s, to: n.go });
      break;
    }
    case 'T': {
      s = penpot.createText(n.text);
      if (!s) throw new Error('createText devolveu null para "' + n.text + '"');
      STATS.texts++;
      ALLTXT.push({ shape: s, value: n.text, kind: 'criado', name: n.name || n.text.slice(0, 40), screen: CTX.screen });
      s.name = n.name || n.text.slice(0, 40);
      const ty = TYPOS[n.typo];
      if (ty) tryDo('typo ' + n.typo, () => ty.applyToText(s));
      else err('tipografia', new Error(n.typo + ' não existe na biblioteca'));
      tryDo('text fill', () => { s.fills = [fill(n.color)]; });
      if (n.align) tryDo('align', () => { s.align = n.align; });
      const boxW = n.w === 'fill' ? (avail || W) : typeof n.w === 'number' ? n.w : null;
      const est = estimateText(n.text, n.typo, boxW);
      tryDo('tamanho inicial do texto', () => { s.resize(Math.max(1, boxW || est.w), Math.max(1, est.h)); });
      tryDo('grow', () => { s.growType = boxW ? 'auto-height' : 'auto-width'; });
      placeChild(s, n, parent);
      if (n.w === 'fill') setSizing(s, 'h', 'fill');
      break;
    }
    case 'C': {
      const comp = findComp(n.set, n.props);
      s = comp.instance();
      if (!s) throw new Error('instance() devolveu null para ' + n.set);
      STATS.copies++;
      if (n.size) tryDo('tamanho do ícone', () => scaleIcon(s, n.size));
      if (n.color) tryDo('cor do ícone', () => colorIcon(s, n.color));
      const key = n.set + (Object.keys(n.props).length ? ' (' + Object.keys(n.props).map(k => k + '=' + n.props[k]).join(', ') + ')' : '');
      USED[key] = (USED[key] || 0) + 1;
      if (n.name) tryDo('name', () => { s.name = n.name; });
      placeChild(s, n, parent);
      for (const p in (n.texts || {})) {
        const v = n.texts[p]; if (v == null || v === '') continue;
        const tx = findIn(s, p);
        if (!tx || tx.type !== 'text') { err('texto', new Error('"' + p + '" não achado em ' + n.set), { component: n.set, requested: n.props, layer: p }); continue; }
        STATS.textOverrides++;
        const before = { text: safe(() => tx.characters, ''), w: safe(() => tx.width, 0), grow: safe(() => tx.growType, ''), fs: parseFloat(safe(() => tx.fontSize, '')) || 12 };
        tryDo('characters ' + p, () => { tx.characters = String(v); }, { component: n.set, layer: p });
        const rec = { shape: tx, value: String(v), component: n.set, layer: p, screen: CTX.screen, before: before, kind: 'trocado', name: (n.name || n.set) + ' › ' + p };
        OVR.push(rec); ALLTXT.push(rec);
      }
      for (const p of (n.hide || [])) {
        const h = findIn(s, p);
        if (!h) { err('esconder', new Error('"' + p + '" não achado em ' + n.set), { component: n.set, requested: n.props, layer: p }); continue; }
        tryDo('hidden ' + p, () => { h.hidden = true; }, { component: n.set, layer: p });
      }
      if (n.w === 'fill') setSizing(s, 'h', 'fill');
      if (n.h === 'fill') setSizing(s, 'v', 'fill');
      if (n.go) {
        const src = n.goPath ? findIn(s, n.goPath) : s;
        if (src) NAV.push({ shape: src, to: n.go }); else err('interação', new Error('"' + n.goPath + '" não achado em ' + n.set), { component: n.set, layer: n.goPath });
      }
      for (const g of (n.gos || [])) {
        const src = findIn(s, g[0]);
        if (src) NAV.push({ shape: src, to: g[1] }); else err('interação', new Error('"' + g[0] + '" não achado em ' + n.set), { component: n.set, layer: g[0] });
      }
      break;
    }
    case 'X': {
      // desenho livre (formas com cores da biblioteca) dentro de um quadro sem layout, montado antes de entrar no auto layout
      s = penpot.createBoard();
      s.name = n.name || 'Desenho';
      s.resize(n.w, n.h);
      tryDo('clip ' + s.name, () => { s.clipContent = false; });
      tryDo('fills ' + s.name, () => { s.fills = []; });
      const ox = safe(() => s.x, 0), oy = safe(() => s.y, 0);
      tryDo('desenho ' + s.name, () => n.draw(s, ox, oy));
      STATS.drawings++;
      placeChild(s, n, parent);
      finishSizing(s, n, false);
      break;
    }
    default: throw new Error('nó desconhecido ' + n.t);
  }
  return s;
}
// Confere se os textos trocados nas cópias ficaram (a sincronização com a biblioteca pode desfazer).
async function verifyOverrides() {
  let fixed = 0, failed = 0;
  for (const o of OVR) {
    const now = safe(() => o.shape.characters, null);
    if (now === o.value) continue;
    try { o.shape.characters = o.value; fixed++; } catch (e) { failed++; err('texto não ficou', e, { component: o.component, layer: o.layer, screen: o.screen, expected: o.value, found: now }); continue; }
    warn('texto refeito', { component: o.component, layer: o.layer, screen: o.screen, expected: o.value, found: now });
  }
  if (fixed) { await settle(null, 12000); for (const o of OVR) { const now = safe(() => o.shape.characters, null); if (now !== o.value) { failed++; err('texto não ficou', new Error('depois de refazer'), { component: o.component, layer: o.layer, screen: o.screen, expected: o.value, found: now }); } } }
  STATS.textOverridesFixed += fixed; STATS.textOverridesFailed += failed;
  OVR.length = 0;
}
// Procura irmãos que se sobrepõem dentro de cada auto layout de uma tela (só leitura).
function rectOf(s) { return { x: safe(() => s.x, 0), y: safe(() => s.y, 0), w: safe(() => s.width, 0), h: safe(() => s.height, 0) }; }
function checkLayout(screen, screenId) {
  let found = 0;
  const walk = (s, path, depth) => {
    if (found > 40 || depth > 8) return;
    const kids = kidsOf(s).filter(k => !safe(() => k.hidden, false) && !safe(() => k.layoutChild && k.layoutChild.absolute, false));
    const isFlex = !!safe(() => s.flex, null);
    if (isFlex && kids.length > 1) {
      const rs = kids.map(rectOf);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = rs[i], b = rs[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) { found++; warn('sobreposição', { screen: screenId, parent: path, a: kids[i].name, b: kids[j].name, ra: a, rb: b }); }
      }
    }
    const pr = rectOf(s);
    if (depth > 0 && safe(() => s.clipContent, false)) for (const k of kids) {
      const r = rectOf(k);
      if (r.x < pr.x - 2 || r.y < pr.y - 2 || r.x + r.w > pr.x + pr.w + 2 || r.y + r.h > pr.y + pr.h + 2) { found++; warn('cortado', { screen: screenId, parent: path, child: k.name, r: r, pr: pr }); }
    }
    for (const k of kids) if (safe(() => k.type, '') === 'board') walk(k, path + ' › ' + k.name, depth + 1);
  };
  walk(screen, screenId, 0);
  STATS.layoutWarnings += found;
}


// ---------------------------------------------------------------- conteúdo da Home real (mesmos elementos nas 3 versões; dados genéricos)
// Inventário da home atual (captura 03-home + map.md):
//  saudação "Bom treino," + nome · selo de XP · avatar · Streak (número, dias seguidos, + vidas) ·
//  Protocolo (número, dias na divisão, sessões) · Esta semana (volume em kg, comparação com a semana anterior) ·
//  Próximo treino (nº de exercícios, nome, 4 exercícios com séries, +3 mais, Iniciar treino) ·
//  Trilha da semana (nº de ilhas, três ilhas) · menu inferior com 5 abas (Home ativa).
const D = {
  hello: 'Bom treino,', name: 'Alex', xp: '1.240 XP', initials: 'AL',
  streak: '9', streakCap: 'dias seguidos', lives: '+ vidas',
  proto: '3', protoCap: 'dias na divisão', sessions: '2 sessões',
  weekLabel: 'Esta semana', volume: '8.420 kg', vs: '+12% vs semana anterior',
  nextLabel: 'Próximo treino', count: '7 exercícios', workout: 'Superiores · Empurrar',
  ex: [['Supino reto', '3×'], ['Desenvolvimento com halteres', '3×'], ['Crucifixo na polia', '2×'], ['Tríceps na corda', '3×']],
  more: '+3 mais', start: 'Iniciar treino',
  trailLabel: 'Trilha da semana', islands: '2 ilhas', islandDone: [true, true, false],
};
const NAV_PT = { 'Tab Home/Label': 'Home', 'Tab Workout/Label': 'Treinar', 'Tab History/Label': 'Histórico', 'Tab Friends/Label': 'Amigos', 'Tab Profile/Label': 'Perfil' };
const BottomNav = () => C('BottomNav', { Active: 'home' }, { name: 'Menu', w: 'fill', texts: NAV_PT });
const ProfileHeader = () => C('AppHeader', { Variant: 'profile' }, { name: 'Cabeçalho', w: 'fill',
  texts: { 'Heading/Overline': D.hello, 'Heading/Title': D.name, 'Actions/XP badge/XP': D.xp, 'Actions/Avatar/Initials': D.initials } });
// Selo de XP igual ao do AppHeader (contorno border, pílula, chama 16 px na cor brand, texto body/xs-medium).
// Texto criado pelo plugin, não trocado numa cópia: no Penpot, o texto do Badge trocado na cópia ficou mostrando "Badge".
const XpBadge = () => F({ name: 'XP badge', dir: 'row', gap: 6, ai: 'center', p: [0, 10], h: 28, stroke: 'border', r: 9999 }, [
  Icon('flame', { name: 'Icon', size: 16, color: 'brand' }), T(D.xp, 'body/xs-medium', 'foreground', { name: 'XP' })]);
const Icon = (name, o) => C('Icon / ' + name, {}, Object.assign({ name: 'Ícone ' + name }, o || {}));
const Label = (t, color) => T(t, 'label/xs', color || 'muted-foreground', { name: 'Rótulo ' + t });
const LivesLink = () => T(D.lives, 'body/sm-medium', 'brand', { name: 'Mais vidas' });   // oferta de vidas (na home real é um texto que abre a oferta)
const StartBtn = (o) => C('Button', { Variant: 'default', Size: 'lg', Icon: 'none', State: 'default' }, Object.assign({ name: 'Iniciar treino', texts: { Label: D.start + ' →' }, w: 'fill' }, o || {}));
// Próximo treino com o componente WorkoutCard (lista com séries, +3 mais e botão com seta)
const NextCard = (o) => C('WorkoutCard', { Variant: 'default' }, Object.assign({ name: 'Próximo treino', w: 'fill', texts: {
  'Header/Overline': D.nextLabel + ' · ' + D.count, 'Header/Title': D.workout,
  'Exercises/Exercise 1/Name': D.ex[0][0], 'Exercises/Exercise 1/Sets': D.ex[0][1],
  'Exercises/Exercise 2/Name': D.ex[1][0], 'Exercises/Exercise 2/Sets': D.ex[1][1],
  'Exercises/Exercise 3/Name': D.ex[2][0], 'Exercises/Exercise 3/Sets': D.ex[2][1],
  'Exercises/Exercise 4/Name': D.ex[3][0], 'Exercises/Exercise 4/Sets': D.ex[3][1],
  'Exercises/More': D.more, 'Action/Label': D.start } }, o || {}));
// Ilha da trilha: círculo (feita = cheia; a fazer = tracejada) com o ícone de treino
const Island = (done, i, size) => F({ name: 'Ilha ' + (i + 1) + (done ? ' (feita)' : ''), w: size, h: size, r: size / 2,
  fill: done ? 'secondary' : null, stroke: done ? 'ring' : 'border', sw: done ? 1 : 2, sa: 'inner', sx: done ? {} : { strokeStyle: 'dashed' },
  ai: 'center', jc: 'center' }, [Icon('dumbbell')]);
const Islands = (size, gap, jc) => F({ name: 'Ilhas', dir: 'row', gap: gap, w: 'fill', jc: jc || 'space-between', ai: 'center' },
  D.islandDone.map((d, i) => Island(d, i, size)));
const Panel = (name, o, kids) => F(Object.assign({ name: name, w: 'fill', fill: 'card', r: 20, p: 20, gap: 16 }, o || {}), kids);
const SCREEN = (name, kids) => F({ name: name, w: W, h: H, fill: 'background', clip: true, dir: 'column', p: 0, gap: 0 }, kids);
const Body = (o, kids) => F(Object.assign({ name: 'Conteúdo', w: 'fill', h: 'fill', clip: true, gap: 12, p: [8, 16, 16, 16] }, o || {}), kids);

// ---------------------------------------------------------------- Versão 1 · Cartões suaves (Oura)
// Mesma ordem da home real, mas cada informação num cartão calmo: rótulo pequeno em cima, número grande embaixo.
function v1() {
  const Soft = (name, label, value, cap, extra, vcolor) => Panel(name, { h: 136, gap: 0, jc: 'space-between', p: 18, r: 20 }, [
    T(label, 'body/sm-medium', 'muted-foreground', { name: 'Rótulo' }),
    F({ name: 'Número', gap: 2, w: 'fill' }, [T(value, 'display/4xl', vcolor || 'foreground', { name: 'Valor' }), T(cap, 'body/sm', 'muted-foreground', { name: 'Legenda', w: 'fill' }), extra || null])]);
  return SCREEN('Home — Versão 1 · Cartões suaves', [
    ProfileHeader(),
    Body({}, [
      F({ name: 'Resumo', dir: 'row', gap: 12, w: 'fill' }, [
        Soft('Streak', 'Streak', D.streak, D.streakCap, LivesLink(), 'brand'),
        Soft('Protocolo', 'Protocolo', D.proto, D.protoCap, T(D.sessions, 'body/xs', 'muted-foreground', { name: 'Sessões' }))]),
      Panel('Esta semana', { dir: 'row', ai: 'end', jc: 'space-between', p: 18 }, [
        F({ name: 'Volume', gap: 2 }, [T(D.weekLabel, 'body/sm-medium', 'muted-foreground', { name: 'Rótulo' }), T(D.volume, 'heading/2xl', 'foreground', { name: 'Valor' })]),
        T(D.vs, 'body/xs', 'muted-foreground', { name: 'Comparação' })]),
      NextCard(),
      Panel('Trilha da semana', { p: [16, 18, 16, 18], gap: 12 }, [
        F({ name: 'Topo', dir: 'row', w: 'fill', ai: 'center', jc: 'space-between' }, [T(D.trailLabel, 'body/sm-medium', 'muted-foreground', { name: 'Rótulo' }), T(D.islands, 'body/sm-medium', 'foreground', { name: 'Ilhas feitas' })]),
        Islands(52, 0, 'space-around')])]),
    BottomNav()]);
}

// ---------------------------------------------------------------- Versão 2 · Treino em destaque (Future / Peloton)
// O próximo treino vira o centro da tela; streak, protocolo e semana ficam numa faixa compacta logo acima.
function v2() {
  const Mini = (name, label, value, cap, extra, w) => F({ name: name, w: w || 'fill', gap: 2 }, [
    T(label, 'label/2xs', 'muted-foreground', { name: 'Rótulo' }), T(value, 'heading/xl', 'foreground', { name: 'Valor' }),
    T(cap, 'body/xs', 'muted-foreground', w === 'hug' ? { name: 'Legenda' } : { name: 'Legenda', w: 'fill' }), extra || null]);
  const VSep = () => C('Separator', { Orientation: 'vertical' }, { name: 'Divisor', h: 'fill' });
  const exRow = (e, i) => F({ name: 'Exercício ' + (i + 1), dir: 'row', w: 'fill', ai: 'center', jc: 'space-between', gap: 12 }, [
    T(e[0], 'body/base', 'foreground', { name: 'Nome', w: 'fill' }), T(e[1], 'body/sm', 'muted-foreground', { name: 'Séries' })]);
  return SCREEN('Home — Versão 2 · Treino em destaque', [
    F({ name: 'Cabeçalho', dir: 'row', w: 'fill', p: [24, 16, 12, 16], ai: 'start', jc: 'space-between' }, [
      T(D.hello + '\n' + D.name, 'display/4xl', 'foreground', { name: 'Saudação' }),
      F({ name: 'Ações', dir: 'row', gap: 10, ai: 'center' }, [
        XpBadge(),
        C('Avatar', { Size: 'md', Type: 'initials' }, { name: 'Avatar', texts: { Initials: D.initials } })])]),
    Body({ gap: 12, p: [4, 16, 16, 16] }, [
      Panel('Resumo', { dir: 'row', gap: 14, p: [14, 16, 14, 16], r: 16 }, [
        Mini('Streak', 'Streak', D.streak, D.streakCap, LivesLink(), 'hug'), VSep(),
        Mini('Protocolo', 'Protocolo', D.proto, D.protoCap, T(D.sessions, 'body/xs', 'muted-foreground', { name: 'Sessões' }), 'hug'), VSep(),
        Mini('Esta semana', D.weekLabel, D.volume, D.vs)]),
      F({ name: 'Próximo treino', w: 'fill', fill: 'secondary', r: 24, p: [22, 20, 20, 20], gap: 14 }, [
        F({ name: 'Título', gap: 6, w: 'fill' }, [Label(D.nextLabel + ' · ' + D.count), T(D.workout, 'heading/3xl', 'foreground', { name: 'Nome do treino', w: 'fill' })]),
        F({ name: 'Exercícios', gap: 8, w: 'fill' }, D.ex.map(exRow).concat([T(D.more, 'body/sm', 'muted-foreground', { name: 'Mais' })])),
        StartBtn()]),
      F({ name: 'Trilha da semana', w: 'fill', gap: 10, p: [4, 4, 0, 4] }, [
        F({ name: 'Topo', dir: 'row', w: 'fill', ai: 'center', jc: 'space-between' }, [T(D.trailLabel, 'heading/lg', 'foreground', { name: 'Título' }), T(D.islands, 'body/sm', 'muted-foreground', { name: 'Ilhas feitas' })]),
        Islands(60, 16, 'start')])]),
    BottomNav()]);
}

// ---------------------------------------------------------------- Versão 3 · Lista e trilha (Fitbod / Oura)
// A trilha abre a tela com ilhas grandes; o próximo treino vem logo abaixo; os números viram uma lista de detalhes.
function v3() {
  const exRow = (e, i) => F({ name: 'Exercício ' + (i + 1), dir: 'row', w: 'fill', ai: 'center', gap: 10 }, [
    T(String(e[1]), 'body/sm-medium', 'muted-foreground', { name: 'Séries', w: 28 }), T(e[0], 'body/sm', 'foreground', { name: 'Nome', w: 'fill' })]);
  const Row = (name, icon, label, value, cap, extra) => F({ name: name, dir: 'row', w: 'fill', ai: 'center', gap: 12, p: [10, 0, 10, 0] }, [
    F({ name: 'Ícone', w: 36, h: 36, r: 18, fill: 'muted', ai: 'center', jc: 'center' }, [Icon(icon)]),
    F({ name: 'Texto', w: 'fill', gap: 2 }, [T(label, 'body/sm-medium', 'foreground', { name: 'Rótulo' }), T(cap, 'body/xs', 'muted-foreground', { name: 'Legenda', w: 'fill' })]),
    F({ name: 'Valor', ai: 'end', gap: 0 }, [T(value, 'heading/xl', 'foreground', { name: 'Número', align: 'right' }), extra || null])]);
  const Sep = () => C('Separator', { Orientation: 'horizontal' }, { name: 'Divisor', w: 'fill' });
  return SCREEN('Home — Versão 3 · Lista e trilha', [
    ProfileHeader(),
    Body({ gap: 12, p: [4, 16, 16, 16] }, [
      Panel('Trilha da semana', { gap: 12, p: [16, 20, 18, 20] }, [
        F({ name: 'Topo', gap: 2, w: 'fill' }, [Label(D.trailLabel), T(D.islands, 'heading/2xl', 'foreground', { name: 'Ilhas feitas' })]),
        Islands(68, 0, 'space-between')]),
      Panel('Próximo treino', { gap: 12, p: [16, 20, 18, 20] }, [
        F({ name: 'Título', gap: 4, w: 'fill' }, [Label(D.nextLabel + ' · ' + D.count), T(D.workout, 'heading/xl', 'foreground', { name: 'Nome do treino', w: 'fill' })]),
        F({ name: 'Exercícios', gap: 6, w: 'fill' }, D.ex.map(exRow).concat([T(D.more, 'body/xs', 'muted-foreground', { name: 'Mais' })])),
        StartBtn()]),
      Panel('Números', { gap: 0, p: [4, 20, 4, 20] }, [
        Row('Streak', 'flame', 'Streak', D.streak, D.streakCap, LivesLink()), Sep(),
        Row('Protocolo', 'clipboard', 'Protocolo', D.proto, D.protoCap + ' · ' + D.sessions), Sep(),
        Row('Esta semana', 'trending-up', D.weekLabel, D.volume, D.vs)])]),
    BottomNav()]);
}

const VERSIONS = [
  { key: 'v1', title: 'Versão 1 · Cartões suaves', ref: 'Inspiração: Oura.', def: v1,
    note: 'Mesma ordem da home atual. Cada informação ganha um cartão calmo, com rótulo pequeno em cima e número grande embaixo. Cor só nos detalhes.' },
  { key: 'v2', title: 'Versão 2 · Treino em destaque', ref: 'Inspiração: Future e Peloton.', def: v2,
    note: 'O próximo treino é o centro da tela, com nome grande e o botão de iniciar logo à mão. Streak, protocolo e semana ficam numa faixa compacta acima.' },
  { key: 'v3', title: 'Versão 3 · Lista e trilha', ref: 'Inspiração: Fitbod e Oura.', def: v3,
    note: 'A trilha da semana abre a tela com ilhas grandes. O próximo treino vem logo abaixo, e streak, protocolo e volume viram uma lista de detalhes.' },
];
function flowsOf(page) { return safe(() => page.flows, []) || []; }
function plain(v, depth) {
  depth = depth || 0;
  if (v == null || typeof v !== 'object') return v;
  if (depth > 2) return '[objeto]';
  if (Array.isArray(v)) return v.slice(0, 50).map(x => plain(x, depth + 1));
  const o = {};
  for (const k of Object.keys(v)) { const x = safe(() => v[k], undefined); if (typeof x !== 'function') o[k] = plain(x, depth + 1); }
  return o;
}
function layerTree(s, depth, budget) {
  if (!s || budget.n <= 0) return null;
  budget.n--;
  const node = { name: safe(() => s.name, '?'), type: safe(() => s.type, '?') };
  if (node.type === 'text') node.characters = safe(() => s.characters, null);
  if (safe(() => s.hidden, false)) node.hidden = true;
  const w = safe(() => s.width, null), h = safe(() => s.height, null); if (w != null) { node.w = Math.round(w); node.h = Math.round(h); }
  if (depth < 5) { const ks = kidsOf(s); if (ks.length) node.children = ks.map(k => layerTree(k, depth + 1, budget)).filter(Boolean); }
  return node;
}
function describeComp(c, withLayers) {
  const d = { id: safe(() => c.id, null), name: safe(() => c.name, null), path: safe(() => c.path, null) };
  d.isVariant = safe(() => !!c.isVariant(), 'erro ao ler');
  d.variantProps = plain(safe(() => c.variantProps, null));
  d.variantError = safe(() => c.variantError, null);
  d.ownKeys = safe(() => Object.keys(c), []);
  if (withLayers) {
    const mi = safe(() => c.mainInstance(), null);
    d.mainInstance = mi ? layerTree(mi, 0, { n: 80 }) : 'não disponível';
  }
  return d;
}
function requiredCombos() {
  const out = {};
  const walk = (n) => {
    if (!n) return;
    if (n.t === 'C') {
      const k = n.set + ' ' + JSON.stringify(n.props);
      const e = out[k] = out[k] || { component: n.set, props: n.props, layers: {} };
      for (const p of Object.keys(n.texts || {})) e.layers[p] = 'texto';
      for (const p of (n.hide || [])) e.layers[p] = e.layers[p] || 'esconder';
      if (n.goPath) e.layers[n.goPath] = e.layers[n.goPath] || 'interação';
      for (const g of (n.gos || [])) e.layers[g[0]] = e.layers[g[0]] || 'interação';
    }
    for (const k of (n.kids || [])) walk(k);
  };
  for (const v of VERSIONS) { try { walk(v.def()); } catch (e) { err('spec ' + v.key, e); } }
  return Object.values(out);
}
function diagnose() {
  const t0 = Date.now();
  ERRORS.length = 0; ERRLIST.length = 0; WARNINGS.length = 0;
  const out = { tipo: 'diagnostico', plugin: PLUGIN_BUILD, quando: new Date().toISOString(), naoAlteraNada: true };
  out.api = { version: safe(() => penpot.version, null), flags: plain(safe(() => penpot.flags, null)), temWaitForLayoutUpdate: safe(() => typeof penpot.waitForLayoutUpdate === 'function', false),
    temViewport: !!safe(() => penpot.viewport, null), apiKeys: safe(() => Object.keys(penpot), []) };
  const f = safe(() => penpot.currentFile, null);
  out.arquivo = f ? { name: safe(() => f.name, null), id: safe(() => f.id, null), pages: (safe(() => f.pages, []) || []).map(p => ({ name: safe(() => p.name, ''), id: safe(() => p.id, ''), doPlugin: safe(() => p.getSharedPluginData(PD_NS, PD_KEY) === '1', false), flows: flowsOf(p).map(x => ({ name: safe(() => x.name, ''), start: safe(() => x.startingBoard && x.startingBoard.name, null) })) })) } : null;
  out.bibliotecasConectadas = (safe(() => penpot.library.connected, []) || []).map(l => ({ name: safe(() => l.name, ''), id: safe(() => l.id, ''), componentes: safe(() => l.components.length, null) }));
  const lib = findLibrary();
  if (!lib) { out.biblioteca = null; out.problema = 'Biblioteca "' + LIB_NAME + '" não conectada.'; return finishDiag(out, t0); }
  const listed = safe(() => lib.components, []) || [];
  out.biblioteca = { name: safe(() => lib.name, ''), id: safe(() => lib.id, ''), componentesListados: listed.length };
  out.componentes = [];
  out.conjuntosDeVariantes = [];
  for (const c of listed) {
    const d = describeComp(c, true);
    if (d.isVariant === true) {
      const vs = safe(() => c.variants, null);
      const set = { setName: d.name, setPath: d.path, primaryId: d.id, variantsId: vs ? safe(() => vs.id, null) : null, variantsKeys: vs ? safe(() => Object.keys(vs), []) : [] };
      set.properties = vs ? plain(safe(() => vs.properties, null)) : null;
      set.currentValues = {};
      for (const p of (Array.isArray(set.properties) ? set.properties : [])) set.currentValues[p] = plain(safe(() => vs.currentValues(p), null));
      let members = [];
      if (vs) { try { members = vs.variantComponents() || []; } catch (e) { set.variantComponentsError = errMsg(e); } }
      set.variantComponents = members.map(m => describeComp(m, false));
      set.primary = d;
      out.conjuntosDeVariantes.push(set);
    } else out.componentes.push(d);
  }
  out.tipografias = (safe(() => lib.typographies, []) || []).map(t => ({ id: safe(() => t.id, ''), name: safe(() => t.name, ''), path: safe(() => t.path, ''), fontFamily: safe(() => t.fontFamily, ''), fontSize: safe(() => t.fontSize, ''), fontWeight: safe(() => t.fontWeight, ''), lineHeight: safe(() => t.lineHeight, ''), letterSpacing: safe(() => t.letterSpacing, ''), textTransform: safe(() => t.textTransform, '') }));
  out.cores = (safe(() => lib.colors, []) || []).map(c => ({ id: safe(() => c.id, ''), name: safe(() => c.name, ''), path: safe(() => c.path, ''), color: safe(() => c.color, ''), opacity: safe(() => c.opacity, '') }));
  // o que o plugin vai pedir, e se acha
  indexLibrary(lib);
  out.indice = Object.assign({}, LIBINFO);
  out.pedidos = requiredCombos().map(rq => {
    const r = resolveComp(rq.component, rq.props);
    const row = { component: rq.component, props: rq.props, achou: r.comp ? (r.exact ? 'exato' : 'outra variante') : 'não existe' };
    if (r.comp && !r.exact) { row.usaria = r.entry.props; row.disponiveis = availableValues(r.list); }
    if (r.comp) {
      const mi = safe(() => r.comp.mainInstance(), null);
      row.camadasFaltando = [];
      if (mi) for (const p of Object.keys(rq.layers)) { const hit = findIn(mi, p); if (!hit || (rq.layers[p] === 'texto' && safe(() => hit.type, '') !== 'text')) row.camadasFaltando.push(p + ' (' + rq.layers[p] + ')'); }
      else row.camadasFaltando = ['instância principal não disponível para leitura'];
    }
    return row;
  });
  const typosNeeded = ['display/4xl', 'heading/3xl', 'heading/2xl', 'heading/xl', 'heading/lg', 'body/base', 'body/sm', 'body/sm-medium', 'body/xs', 'label/xs', 'label/2xs'];
  out.tipografiasFaltando = typosNeeded.filter(t => !TYPOS[t]);
  const colorsNeeded = Object.keys(FALLBACK_HEX);
  out.coresFaltando = colorsNeeded.filter(c => !COLORS[c]);
  return finishDiag(out, t0);
}
function finishDiag(out, t0) {
  const ped = out.pedidos || [];
  out.resumo = {
    componentesListados: out.biblioteca ? out.biblioteca.componentesListados : 0,
    componentesComVariantes: out.indice ? out.indice.expanded : 0,
    conjuntosDeVariantes: out.conjuntosDeVariantes ? out.conjuntosDeVariantes.length : 0,
    tipografias: out.tipografias ? out.tipografias.length : 0,
    cores: out.cores ? out.cores.length : 0,
    pedidos: ped.length,
    pedidosExatos: ped.filter(p => p.achou === 'exato').length,
    pedidosOutraVariante: ped.filter(p => p.achou === 'outra variante').length,
    pedidosSemComponente: ped.filter(p => p.achou === 'não existe').length,
    pedidosComCamadaFaltando: ped.filter(p => p.camadasFaltando && p.camadasFaltando.length).length,
    tipografiasFaltando: (out.tipografiasFaltando || []).length,
    coresFaltando: (out.coresFaltando || []).length,
    erros: ERRLIST.length,
    ms: Date.now() - t0 };
  out.erros = ERRLIST.slice();
  return out;
}


// ---------------------------------------------------------------- página Home
const COL_W = W + 160;
const TOP_Y = 270;          // título da página e da versão ficam acima; folga para o nome da tela que o Penpot desenha
function topText(text, typo, color, x, y, w) {
  const s = build(T(text, typo, color, w ? { w: w } : {}), null, w || null);
  s.x = x; s.y = y;
  return s;
}
function topBoard(spec, x, y) { const s = build(spec, null, typeof spec.w === 'number' ? spec.w : W); s.x = x; s.y = y; return s; }
function focus(shapes) { try { penpot.viewport.zoomIntoView(shapes); } catch (e) {} }
async function newPage(name) {
  const page = penpot.createPage();
  page.name = name;
  await sleep(30);
  await penpot.openPage(page);
  await waitFor(() => penpot.currentPage && penpot.currentPage.id === page.id, 5000);
  tryDo('marcar página', () => page.setSharedPluginData(PD_NS, PD_KEY, '1'));
  tryDo('fundo da página', () => { page.background = '#262626'; });
  STATS.pages++;
  return page;
}
function fileCheck() {
  const f = safe(() => penpot.currentFile, null);
  if (!f) return { ok: false, why: 'Nenhum arquivo aberto.' };
  if (norm(f.name) !== norm(FILE_NAME)) return { ok: false, why: 'Este plugin só roda no arquivo "' + FILE_NAME + '". O arquivo aberto é "' + f.name + '". Nada foi alterado.' };
  const lib = findLibrary();
  if (!lib) return { ok: false, why: 'A biblioteca "' + LIB_NAME + '" não está conectada a este arquivo. Conecte em Bibliotecas (Alt+L) e abra o plugin de novo. Nada foi alterado.' };
  let n = 0; try { n = (lib.components || []).length; } catch (e) {}
  return { ok: true, name: f.name, lib: lib, comps: n };
}
function cleanup() {
  const pages = (safe(() => penpot.currentFile.pages, []) || []).slice();
  const mine = pages.filter(p => { try { return p.getSharedPluginData(PD_NS, PD_KEY) === '1'; } catch (e) { return false; } });
  const others = pages.filter(p => mine.indexOf(p) < 0);
  const emptyDefault = others.filter(p => { try { return /^(Page|Página) 1$/.test(p.name) && (p.root.children || []).length === 0; } catch (e) { return false; } });
  return { mine: mine, emptyDefault: emptyDefault };
}

async function buildHomePage(page) {
  CTX = { page: 'Home', screen: '' }; OVR.length = 0; NAV.length = 0;
  SCREEN_SHAPES = {};
  topText('Home — 3 versões', 'display/4xl', 'foreground', 0, 0);
  topText('Estilo Escuro neutro do moodboard. As três têm os mesmos elementos da home atual; muda só o layout, a hierarquia e o visual. Sem fluxos.', 'body/base', 'muted-foreground', 0, 56, 3 * COL_W - 160);
  const made = [];
  for (let i = 0; i < VERSIONS.length; i++) {
    const v = VERSIONS[i]; const x = i * COL_W;
    CTX.screen = v.key;
    say('Tela ' + v.title);
    try {
      topText(v.title, 'heading/2xl', 'foreground', x, 120);
      topText(v.note, 'body/sm', 'muted-foreground', x, 156, W);
      const s = topBoard(v.def(), x, TOP_Y);
      SCREEN_SHAPES[v.key] = s; made.push(s); STATS.screens++;
      topText(v.ref, 'body/sm', 'muted-foreground', x, TOP_Y + H + 24, W);
      await settle(s, 8000);
    } catch (e) { err('tela ' + v.key, e); }
    PROGRESS.done++;
  }
  CTX.screen = '';
  await verifyOverrides();
  await settle(null, 12000);
  for (const id of Object.keys(SCREEN_SHAPES)) { CTX.screen = id; tryDo('conferir layout ' + id, () => checkLayout(SCREEN_SHAPES[id], id)); }
  CTX.screen = '';
  // garantia: este plugin não cria fluxos; se o Penpot tiver criado algum nesta página, sai
  for (const f of (safe(() => page.flows, []) || [])) { try { f.remove(); STATS.implicitFlowsRemoved++; } catch (e) { err('remover fluxo', e); } }
  await finalTextCheck();
  if (made.length) focus(made);
}
// Conferência final, depois de tudo assentar: cada texto tem que mostrar exatamente o valor pedido.
// 1) conteúdo diferente -> refaz e, se continuar diferente, vira erro "texto final diferente";
// 2) texto trocado numa cópia que ficou com a medida do texto antigo (o Penpot não redesenhou) -> força nova medida e avisa.
function looksStale(o) {
  const b = o.before; if (!b || b.grow !== 'auto-width' || b.text === o.value) return false;
  const w = safe(() => o.shape.width, 0);
  const m = { fs: b.fs, lh: 1.3, fw: 500, ls: 0, up: false };
  const dOld = textWidth(b.text, m), dNew = textWidth(o.value, m);
  return Math.abs(dNew - dOld) > 4 && Math.abs(w - b.w) < 0.5;
}
async function finalTextCheck() {
  await settle(null, 12000); await sleep(1200);
  let refeitos = 0, medidas = 0;
  const redo = [];
  for (const o of ALLTXT) {
    const now = safe(() => o.shape.characters, null);
    if (now !== o.value) { redo.push(o); tryDo('refazer texto ' + o.name, () => { o.shape.characters = o.value; }); refeitos++; warn('texto refeito no fim', { name: o.name, screen: o.screen, expected: o.value, found: now }); continue; }
    if (looksStale(o)) {
      redo.push(o); medidas++;
      warn('texto com medida antiga', { name: o.name, screen: o.screen, value: o.value, width: safe(() => o.shape.width, 0), widthBefore: o.before.w, textBefore: o.before.text });
      tryDo('nova medida ' + o.name, () => { o.shape.characters = o.value + ' '; });
    }
  }
  if (medidas) { await settle(null, 8000); for (const o of redo) if (looksStaleBusy(o)) tryDo('nova medida 2 ' + o.name, () => { o.shape.characters = o.value; }); }
  if (redo.length) { await settle(null, 12000); await sleep(800); }
  let diff = 0, stale = 0;
  for (const o of ALLTXT) {
    const now = safe(() => o.shape.characters, null);
    if (now !== o.value) { diff++; err('texto final diferente', new Error('"' + now + '" em vez de "' + o.value + '"'), { name: o.name, screen: o.screen, expected: o.value, found: now }); }
    else if (looksStale(o)) { stale++; err('texto final sem redesenhar', new Error('"' + o.value + '" ficou com a largura do texto antigo "' + o.before.text + '"'), { name: o.name, screen: o.screen, width: safe(() => o.shape.width, 0) }); }
  }
  STATS.textsChecked = ALLTXT.length; STATS.textFinalRedone = refeitos; STATS.textRemeasured = medidas; STATS.textFinalMismatch = diff + stale;
  say('Conferência dos textos: ' + ALLTXT.length + ' conferidos · ' + (diff + stale) + ' diferentes do pedido.');
}
function looksStaleBusy(o) { return safe(() => o.shape.characters, '') === o.value + ' '; }

// ---------------------------------------------------------------- run
let running = false;
function buildLog(t0, extra) {
  return Object.assign({ tipo: 'montagem', plugin: PLUGIN_BUILD, quando: new Date(t0).toISOString(), segundos: Math.round((Date.now() - t0) / 1000),
    api: { version: safe(() => penpot.version, null), temWaitForLayoutUpdate: safe(() => typeof penpot.waitForLayoutUpdate === 'function', false) },
    indice: Object.assign({}, LIBINFO), stats: Object.assign({}, STATS), usados: Object.assign({}, USED),
    erros: ERRLIST.slice(), variantesNaoAchadas: FALLBACKS.slice(), avisos: WARNINGS.slice(), passos: LOG.slice() }, extra || {});
}
async function run() {
  if (running) return; running = true;
  const t0 = Date.now();
  for (const k in STATS) STATS[k] = 0;
  for (const k in USED) delete USED[k];
  ERRORS.length = 0; ERRLIST.length = 0; ALLTXT.length = 0; WARNINGS.length = 0; FALLBACKS.length = 0; LOG.length = 0; CTX = { page: '', screen: '' }; SETTLE_TIMEOUTS_IN_A_ROW = 0;
  try {
    try { penpot.flags.naturalChildOrdering = true; } catch (e) { err('flags', e); }
    const chk = fileCheck();
    if (!chk.ok) { say(chk.why, { finished: true, failed: true, log: buildLog(t0, { recusado: chk.why }) }); return; }
    LIB = chk.lib; indexLibrary(LIB);
    PROGRESS = { done: 0, total: VERSIONS.length };
    say('Biblioteca conectada: ' + LIB.name + ' (' + LIBINFO.listed + ' componentes listados, ' + LIBINFO.expanded + ' contando todas as variantes).');
    const old = cleanup();
    if (old.mine.length) say('Vou substituir a página Home feita antes por este plugin. Outras páginas ficam como estão.');
    const page = await newPage('Home');   // abre a página nova antes de apagar a antiga
    for (const p of old.mine.concat(old.emptyDefault)) { tryDo('apagar página ' + p.name, () => p.remove()); await sleep(10); }
    say('Página Home…');
    try { await buildHomePage(page); } catch (e) { err('página Home', e); }
    const secs = Math.round((Date.now() - t0) / 1000);
    const summary = 'Concluído em ' + secs + ' s. Páginas: ' + STATS.pages + ' · telas: ' + STATS.screens + ' · cópias: ' + STATS.copies +
      ' · erros: ' + ERRORS.length + ' · variantes não achadas: ' + STATS.variantFallbacks +
      ' · textos refeitos: ' + (STATS.textOverridesFixed + STATS.textFinalRedone) + ' · textos conferidos no fim: ' + STATS.textsChecked + ' (diferentes do pedido: ' + STATS.textFinalMismatch + ')' + ' · avisos de layout: ' + STATS.layoutWarnings;
    say(summary, { finished: true, errors: ERRORS.slice(0, 300), stats: STATS, used: USED, log: buildLog(t0) });
  } catch (e) {
    err('run', e);
    say('Falhou: ' + errMsg(e), { finished: true, failed: true, errors: ERRORS.slice(0, 300), log: buildLog(t0) });
  } finally { running = false; }
}
penpot.ui.open('Anota Treino Home', UI_URL, { width: 360, height: 560 });
penpot.ui.onMessage((msg) => {
  if (!msg) return;
  if (msg.type === 'check') {
    const c = fileCheck();
    penpot.ui.sendMessage({ type: 'check', ok: c.ok, why: c.why, name: c.name, comps: c.comps, plugin: PLUGIN_BUILD });
  }
  if (msg.type === 'generate') run();
  if (msg.type === 'diagnose') {
    if (running) return;
    let out;
    try { out = diagnose(); } catch (e) { out = { tipo: 'diagnostico', falhou: errMsg(e), erros: ERRLIST.slice() }; }
    penpot.ui.sendMessage({ type: 'diagnose', log: out });
  }
});
