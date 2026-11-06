// ===== VERSÃO PÚBLICA: Apoie (Pix), Compartilhar e pesquisa pós-partida =====
// Arquivo independente: não altera a jogabilidade. Os botões só aparecem no menu e na tela de resultado,
// nunca durante a partida. Configuração em js/publico-config.js.
import { PUBLICO as C } from './publico-config.js';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

// ---------- estilo (mesma identidade das telas do jogo) ----------
document.head.appendChild(el('style', {}, `
.pub-row { display:flex; flex-wrap:wrap; gap:10px; }
.pub-btn { font-family: var(--ui); font-size:14px; font-weight:600; letter-spacing:.06em; color: var(--ink); background: transparent;
  border:1px solid rgba(255, 200, 58, .45); border-radius:6px; padding:10px 16px; cursor:pointer; }
.pub-btn:hover { border-color: var(--gold); }
.pub-btn.gold { color:#1a1203; background: var(--gold); border-color: var(--gold); }
.pub-survey { border:1px solid rgba(143,243,255,.22); border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:10px; background: rgba(7,9,22,.45); }
.pub-survey p { margin:0; font-weight:600; letter-spacing:.04em; }
.pub-survey .opt { display:flex; gap:10px; }
.pub-survey .opt button { flex:1; font-family: var(--ui); font-size:15px; font-weight:700; color: var(--ink); background: transparent;
  border:1px solid rgba(143,243,255,.35); border-radius:6px; padding:10px; cursor:pointer; }
.pub-survey .opt button[aria-pressed="true"] { background: var(--light); color:#071018; border-color: var(--light); }
.pub-survey textarea { font: 14px var(--ui); color: var(--ink); background: rgba(255,255,255,.06); border:1px solid rgba(143,243,255,.25);
  border-radius:6px; padding:8px 10px; min-height:56px; resize:vertical; }
.pub-survey .ok { color: var(--light); }
.pub-modal { position:absolute; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; background: rgba(4,6,16,.78); padding:16px; }
.pub-box { width:min(420px,100%); max-height:100%; overflow-y:auto; background:#0c1030; border:1px solid rgba(143,243,255,.3); border-radius:10px;
  padding:20px; display:flex; flex-direction:column; gap:14px; color: var(--ink); font-family: var(--ui); }
.pub-box h3 { margin:0; font-family: var(--display); font-size:18px; letter-spacing:.06em; color: var(--gold); }
.pub-box p { margin:0; color: var(--mute); line-height:1.4; }
.pub-qr { align-self:center; background:#fff; padding:10px; border-radius:8px; line-height:0; }
.pub-copy { display:flex; gap:8px; }
.pub-copy input { flex:1; min-width:0; font: 12px ui-monospace, monospace; color: var(--ink); background: rgba(255,255,255,.06);
  border:1px solid rgba(143,243,255,.25); border-radius:6px; padding:8px; }
.pub-share { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
`));

// ---------- botões no menu e no resultado ----------
const TEM_PIX = !!(C.pixChave && C.pixChave.trim());
const TEM_PESQUISA = !!(C.formulario && C.formulario.url && C.formulario.campoJogaria);
function linhaBotoes() {
  const r = el('div', { className: 'pub-row' });
  if (TEM_PIX) { const a = el('button', { className: 'pub-btn gold', type: 'button', textContent: 'Apoie o projeto' }); a.onclick = abrirApoio; r.append(a); }
  const s = el('button', { className: 'pub-btn', type: 'button', textContent: 'Compartilhar' }); s.onclick = abrirCompartilhar;
  r.append(s); return r;
}
$('menu').querySelector('.actions').after(linhaBotoes());
const resCard = $('results').querySelector('.card');

// ---------- pesquisa pós-partida ----------
const pesquisa = el('div', { className: 'pub-survey' }, `
  <p>Você jogaria de novo?</p>
  <div class="opt"><button type="button" data-v="sim" aria-pressed="false">Sim</button><button type="button" data-v="nao" aria-pressed="false">Não</button></div>
  <textarea maxlength="500" placeholder="Comentário (opcional): o que achou?"></textarea>
  <div class="pub-row"><button class="pub-btn" type="button" data-enviar>Enviar</button></div>`);
if (TEM_PESQUISA) resCard.querySelector('.actions').before(pesquisa);   // só aparece com o formulário configurado
resCard.querySelector('.actions').after(linhaBotoes());
let resposta = null;
pesquisa.querySelectorAll('.opt button').forEach(b => b.onclick = () => {
  resposta = b.dataset.v; pesquisa.querySelectorAll('.opt button').forEach(x => x.setAttribute('aria-pressed', x === b));
});
pesquisa.querySelector('[data-enviar]').onclick = enviarPesquisa;
function resetPesquisa() {
  resposta = null;
  pesquisa.innerHTML = pesquisa.dataset.orig || (pesquisa.dataset.orig = pesquisa.innerHTML);
  pesquisa.querySelectorAll('.opt button').forEach(b => b.onclick = () => {
    resposta = b.dataset.v; pesquisa.querySelectorAll('.opt button').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  pesquisa.querySelector('[data-enviar]').onclick = enviarPesquisa;
}
pesquisa.dataset.orig = pesquisa.innerHTML;
function enviarPesquisa() {
  const txt = pesquisa.querySelector('textarea').value.trim();
  if (!resposta && !txt) { pesquisa.querySelector('p').textContent = 'Escolha Sim ou Não (o comentário é opcional).'; return; }
  const F = C.formulario;
  if (F && F.url && F.campoJogaria) {
    const d = new URLSearchParams();
    d.append(F.campoJogaria, resposta === 'sim' ? 'Sim' : resposta === 'nao' ? 'Não' : '');
    if (F.campoComentario) d.append(F.campoComentario, txt);
    if (F.campoResultado) d.append(F.campoResultado, resumoResultado());
    fetch(F.url, { method: 'POST', mode: 'no-cors', body: d }).catch(() => {});
  }
  const link = C.linkJogo ? ` Se quiser, deixe também um comentário na <a href="${C.linkJogo}" target="_blank" rel="noopener">página do jogo</a>.` : '';
  pesquisa.innerHTML = `<p class="ok">Obrigado pela resposta!</p>${F && F.url ? '' : `<p style="font-weight:400;color:var(--mute)">${link.trim()}</p>`}`;
}
function resumoResultado() {
  const me = $('resList').querySelector('li.me');
  return `${$('resTitle').textContent} · ${me ? me.textContent.replace(/\s+/g, ' ').trim() : ''}`;
}
// nova pesquisa a cada tela de resultado
new MutationObserver(() => { if (!$('results').hidden) resetPesquisa(); }).observe($('results'), { attributes: true, attributeFilter: ['hidden'] });

// ---------- janelas ----------
function modal(html) {
  const m = el('div', { className: 'pub-modal' }, `<div class="pub-box">${html}<button class="btn-ghost" type="button" data-fechar>Fechar</button></div>`);
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-fechar')) m.remove(); });
  $('app').appendChild(m);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // Espaço/Enter não reabrem a janela
  m.querySelector('[data-fechar]').focus({ preventScroll: true });
  return m;
}
function copiar(input, botao) {
  const ok = () => { botao.textContent = 'Copiado!'; setTimeout(() => botao.textContent = 'Copiar', 1500); };
  const plano = () => { input.select(); input.setSelectionRange(0, 99999); try { document.execCommand('copy'); ok(); } catch (e) {} };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(ok, plano); else plano();
}

// ---------- Pix (BR Code estático, padrão do Banco Central) ----------
const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
const limpa = (s, n) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, n);
function crc16(s) { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); }
export function brcode(chave, nome, cidade) {
  const p = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave.trim())) + campo('52', '0000') + campo('53', '986')
    + campo('58', 'BR') + campo('59', limpa(nome, 25)) + campo('60', limpa(cidade, 15)) + campo('62', campo('05', '***')) + '6304';
  return p + crc16(p);
}
let qrLib = null;
function carregarQR() {
  return qrLib || (qrLib = new Promise((ok, erro) => {
    if (window.QRCode) return ok();
    // qrcodejs 1.0.0 (MIT, davidshimjs), incluído no pacote: sem depender de CDN
    const s = el('script', { src: 'js/qrcode.min.js' });
    s.onload = ok; s.onerror = erro; document.head.appendChild(s);
  }));
}
function abrirApoio() {
  if (!C.pixChave) { modal(`<h3>Apoie o projeto</h3><p>O apoio por Pix está em configuração. Obrigado pelo interesse!</p>`); return; }
  const codigo = brcode(C.pixChave, C.pixNome || C.nomeJogo, C.pixCidade || 'BRASIL');
  const m = modal(`<h3>Apoie o projeto</h3>
    <p>O ${C.nomeJogo} é gratuito. Se gostou, qualquer valor ajuda a continuar o desenvolvimento. Totalmente opcional.</p>
    <div class="pub-qr" data-qr></div>
    <p>Pix copia e cola:</p>
    <div class="pub-copy"><input readonly value="${codigo}"><button class="pub-btn" type="button" data-copiar>Copiar</button></div>`);
  const inp = m.querySelector('input'), b = m.querySelector('[data-copiar]'); b.onclick = () => copiar(inp, b);
  carregarQR().then(() => new window.QRCode(m.querySelector('[data-qr]'), { text: codigo, width: 200, height: 200, correctLevel: window.QRCode.CorrectLevel.M }))
    .catch(() => { m.querySelector('[data-qr]').remove(); });
}

// ---------- Compartilhar ----------
function abrirCompartilhar() {
  const url = C.linkJogo || location.href, txt = C.textoCompartilhar || `Joguei ${C.nomeJogo}, um jogo de arena no navegador (PC e celular, sem cadastro). Bora disputar o núcleo?`, u = encodeURIComponent(url), t = encodeURIComponent(txt);
  const m = modal(`<h3>Compartilhar</h3><p>Chame seus amigos para disputar o núcleo.</p>
    <div class="pub-share">
      ${navigator.share ? '<button class="pub-btn gold" type="button" data-nativo style="grid-column:1/-1">Compartilhar pelo aparelho</button>' : ''}
      <a class="pub-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${t}%20${u}">WhatsApp</a>
      <a class="pub-btn" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}">LinkedIn</a>
      <a class="pub-btn" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${t}&url=${u}">X</a>
      <a class="pub-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a>
    </div>
    <div class="pub-copy"><input readonly value="${url}"><button class="pub-btn" type="button" data-copiar>Copiar</button></div>`);
  m.querySelectorAll('a.pub-btn').forEach(a => { a.style.textAlign = 'center'; a.style.textDecoration = 'none'; });
  const inp = m.querySelector('input'), b = m.querySelector('[data-copiar]'); b.onclick = () => copiar(inp, b);
  const n = m.querySelector('[data-nativo]');
  if (n) n.onclick = () => navigator.share({ title: C.nomeJogo, text: txt, url }).catch(() => {});
}

// ---------- teclado: digitar na pesquisa ou usar as janelas não aciona atalhos do jogo ----------
addEventListener('keydown', e => {
  const t = e.target, emUI = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
  if (emUI || document.querySelector('.pub-modal')) e.stopPropagation();
}, true);
