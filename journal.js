// journal.js — Berita & Diskusi Journal, ditampilkan di web utama.
// Data: koleksi "articles" dan "posts" (+ replies/reactions) di Firestore yang SAMA dengan toko.
// Akun: Firebase Auth toko (koleksi "customers"), jadi tidak perlu akun terpisah.
import { db, auth, onAuthStateChanged } from './firebase.js';
import {
    collection, query, where, orderBy, limit, getDocs, getDoc, doc,
    setDoc, addDoc, deleteDoc, getCountFromServer, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

export const JOURNAL_URL = 'https://jurnal-fucktherules.my.id';
const CATS = [['football', 'Football'], ['indonesia', 'Indonesia'], ['world', 'World'], ['culture', 'Culture'], ['opinion', 'Opinion']];
const TYPES = [['fire', '🔥'], ['heart', '❤️'], ['like', '👍']];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);
const fmtDate = (ts) => { const d = toDate(ts); return d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const fmtDateTime = (ts) => { const d = toDate(ts); return d ? d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
const catLabel = (k) => (CATS.find((c) => c[0] === k) || [k, k || 'News'])[1];
const articleUrl = (id) => `${JOURNAL_URL}/article.html?id=${encodeURIComponent(id)}`;
const emailName = (u) => u?.displayName || (u?.email || 'member').split('@')[0];

function errBox(e) {
    let msg = 'Berita belum bisa dimuat. Muat ulang halaman dan coba lagi.';
    if (e?.code === 'failed-precondition') msg = 'Index database belum dibuat. Buka console browser (F12), klik link "create index" dari Firebase, lalu Create.';
    else if (e?.code === 'permission-denied') msg = 'Rules Firestore belum mengizinkan Journal. Tempel isi firestore.rules dari repo jurnal ke Firebase toko (lihat README).';
    return `<div class="j-notice bad" role="alert">${esc(msg)}</div>`;
}

/* ---------- sampul: tiap berita tanpa foto dapat potongan lapangan berbeda ---------- */
function pitch(seed) {
    const h = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const zoom = [1, 1.6, 2.2, 3][h % 4];
    const W = 105, H = 68, w = W / zoom, hh = H / zoom;
    const x = (((h >> 3) % 1000) / 1000) * (W - w), y = (((h >> 13) % 1000) / 1000) * (H - hh);
    return `<svg viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor">
  <rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/>
  <rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/>
  <rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/>
  <path d="M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31"/><path d="M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31"/></g></svg>`;
}
const coverHTML = (a) => `<div class="j-cover">${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<div class="j-pitch">${pitch(a.id || a.title)}</div>`}</div>`;
const tagHTML = (a) => `<span class="j-tag">${esc(catLabel(a.category))}</span>${a.generatedBy === 'AI' ? '<span class="j-tag ai">AI summary</span>' : ''}`;
const rowHTML = (a) => `<article class="j-row"><div>
  <div class="j-meta">${tagHTML(a)}<time>${fmtDate(a.publishedAt || a.createdAt)}</time></div>
  <h3><a href="${articleUrl(a.id)}">${esc(a.title)}</a></h3><p>${esc(a.summary)}</p></div>
  <a class="j-thumb" href="${articleUrl(a.id)}" tabindex="-1" aria-hidden="true">${coverHTML(a)}</a></article>`;

/* ---------- state ---------- */
let articles = [], articlesState = 'loading', articlesErr = null;   // loading | ok | error
let latestPost = null;
let cat = 'all';
let user = null, isAdmin = false;
let discLoaded = false, discToken = 0;
const posts = new Map();

/* ---------- berita ---------- */
async function loadArticles() {
    try {
        const snap = await getDocs(query(collection(db, 'articles'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(60)));
        articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        articlesState = 'ok';
    } catch (e) { console.warn('Journal: berita gagal dimuat', e); articlesState = 'error'; articlesErr = e; }
    renderBerita(); renderSide();
}

async function loadLatestPost() {
    try {
        const s = await getDocs(query(collection(db, 'posts'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(1)));
        latestPost = s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
    } catch (e) { console.warn('Journal: diskusi terbaru gagal dimuat', e); }
    renderSide();
}

function renderBerita() {
    const feed = $('#beritaFeed'), chips = $('#beritaChips');
    if (!feed) return;
    if (articlesState === 'error') { feed.innerHTML = errBox(articlesErr); return; }
    if (articlesState === 'loading') return;

    if (chips) {
        chips.innerHTML = [['all', 'Semua'], ...CATS].map(([k, l]) => `<button type="button" class="j-chip${cat === k ? ' on' : ''}" data-cat="${k}">${l}</button>`).join('');
    }
    const items = cat === 'all' ? articles : articles.filter((a) => a.category === cat);
    if (!items.length) {
        feed.innerHTML = `<div class="j-empty"><strong>Belum ada berita</strong>Berita baru muncul setelah editor menyetujuinya. Cek lagi sebentar lagi.</div>`;
        return;
    }
    const [lead, ...rest] = items;
    feed.innerHTML = `
    <a class="j-lead" href="${articleUrl(lead.id)}">${coverHTML(lead)}
      <div class="j-lead-body"><div class="j-meta">${tagHTML(lead)}<time>${fmtDate(lead.publishedAt)}</time></div>
      <h2>${esc(lead.title)}</h2><p>${esc(lead.summary)}</p></div></a>
    ${rest.map(rowHTML).join('')}`;
}

/* ---------- sidebar (semua elemen [data-side]) ---------- */
function renderSide() {
    document.querySelectorAll('[data-side]').forEach((el) => {
        const kind = el.dataset.side;
        let html = '';

        if (kind === 'shop' && articlesState === 'ok' && articles.length) {
            html += `<div class="j-box"><h3>Berita terbaru</h3><div class="j-list">${articles.slice(0, 4).map((a) =>
                `<a href="${articleUrl(a.id)}">${esc(a.title)}<small>${esc(catLabel(a.category))} · ${fmtDate(a.publishedAt)}</small></a>`).join('')}</div>
                <button type="button" class="j-btn sm" onclick="showPage('berita')">Semua berita</button></div>`;
        }
        if (latestPost) {
            const lb = (latestPost.label || '').trim();
            const txt = (lb ? lb + (/[.!?…]$/.test(lb) ? ' ' : '. ') : '') + (latestPost.content || '');
            html += `<div class="j-box"><h3>Dari tribun</h3><p>${esc(txt.length > 200 ? txt.slice(0, 200) + '…' : txt)}</p>
                <button type="button" class="j-btn sm" onclick="showPage('diskusi')">Ikut diskusi</button></div>`;
        }
        html += kind === 'news'
            ? `<div class="j-box dark"><h3>The store</h3><p>Limited run, pre-order, dan arsip ada di toko FvcktheRules.</p><button type="button" class="j-btn light sm" onclick="showPage('katalog')">Lihat katalog</button></div>`
            : `<div class="j-box dark"><h3>The journal</h3><p>Berita football, Indonesia, dan budaya jalanan, plus diskusi bareng komunitas.</p><a class="j-btn light sm" href="${JOURNAL_URL}/">Buka Journal ↗</a></div>`;
        el.innerHTML = html;
    });
}

/* ---------- diskusi ---------- */
const count = (q) => getCountFromServer(q).then((s) => s.data().count);

async function hydrate(p) {
    const col = collection(db, 'posts', p.id, 'reactions');
    const [replies, ...rc] = await Promise.all([
        count(collection(db, 'posts', p.id, 'replies')),
        ...TYPES.map(([t]) => count(query(col, where('type', '==', t)))),
    ]);
    p.replyCount = replies;
    p.counts = Object.fromEntries(TYPES.map(([t], i) => [t, rc[i]]));
    p.mine = null;
    if (user) { try { const s = await getDoc(doc(col, user.uid)); p.mine = s.exists() ? s.data().type : null; } catch { /* abaikan */ } }
}

async function loadDiscussion() {
    const list = $('#diskusiList');
    if (!list) return;
    discLoaded = true;
    const my = ++discToken;
    try {
        const snap = await getDocs(query(collection(db, 'posts'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(20)));
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        if (!items.length) { list.innerHTML = `<div class="j-empty"><strong>Belum ada post</strong>Post pertama dari tim akan muncul di sini.</div>`; return; }
        await Promise.all(items.map(hydrate));
        if (my !== discToken) return;   // ada pemuatan yang lebih baru
        posts.clear(); items.forEach((p) => posts.set(p.id, p));
        list.innerHTML = items.map(postHTML).join('');
    } catch (e) { console.warn('Journal: diskusi gagal dimuat', e); list.innerHTML = errBox(e); }
}

const reactBtns = (p) => TYPES.map(([t, e]) =>
    `<button type="button" class="j-react${p.mine === t ? ' on' : ''}" data-react="${t}" aria-pressed="${p.mine === t}" aria-label="${t}">${e} <span>${p.counts[t]}</span></button>`).join('');

function postHTML(p) {
    return `<article class="j-post" data-id="${esc(p.id)}">
    <header><span class="j-avatar" aria-hidden="true">F</span><div><strong>FvcktheRules</strong><span class="j-tag">Admin</span>${p.pinned ? '<span class="j-tag ai">Pinned</span>' : ''}<time>${fmtDateTime(p.createdAt)}</time></div></header>
    ${p.label ? `<h2 class="j-post-label">${esc(p.label)}</h2>` : ''}
    <p class="j-post-text">${esc(p.content)}</p>
    ${p.image ? `<img class="j-post-img" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="j-actions"><span class="j-reacts">${reactBtns(p)}</span><button type="button" class="j-btn ghost sm" data-toggle>Balasan (<span class="rc">${p.replyCount}</span>)</button></div>
    <div class="j-replies" hidden></div></article>`;
}

async function loadThread(el, p) {
    const th = $('.j-replies', el);
    th.innerHTML = `<div class="j-loading" style="padding:16px 0">Memuat balasan…</div>`;
    try {
        const s = await getDocs(query(collection(db, 'posts', p.id, 'replies'), orderBy('createdAt', 'asc'), limit(100)));
        const rows = s.docs.map((d) => {
            const r = d.data(); const mine = user && r.uid === user.uid;
            return `<div class="j-reply" data-rid="${d.id}"><strong>${esc(r.name)}</strong>${r.isAdmin ? '<span class="j-tag">Admin</span>' : ''}<time>${fmtDateTime(r.createdAt)}</time>${mine || isAdmin ? '<button type="button" class="j-link" data-del>Hapus</button>' : ''}<p>${esc(r.content)}</p></div>`;
        }).join('');
        p.replyCount = s.size; $('.rc', el).textContent = s.size;
        th.innerHTML = (rows || `<p class="j-muted">Belum ada balasan. Jadi yang pertama.</p>`) + (user
            ? `<div class="j-composer"><textarea maxlength="600" placeholder="Tulis balasan…" aria-label="Balasan kamu"></textarea><button type="button" class="j-btn sm" data-send>Kirim balasan</button><span class="j-err" role="alert"></span></div>`
            : `<p class="j-signin">Masuk untuk ikut diskusi. <button type="button" class="j-btn sm" data-login>Sign in</button></p>`);
    } catch (e) { th.innerHTML = errBox(e); }
}

async function currentName() {
    try { const s = await getDoc(doc(db, 'customers', user.uid)); const n = (s.data()?.nama || '').trim(); if (n) return n; } catch { /* pakai fallback */ }
    return emailName(user);
}

function bindDiscussion() {
    const list = $('#diskusiList');
    if (!list) return;
    list.addEventListener('click', async (e) => {
        const el = e.target.closest('.j-post'); if (!el) return;
        const p = posts.get(el.dataset.id); if (!p) return;

        if (e.target.closest('[data-login]')) return window.openAuthModal?.();

        if (e.target.closest('[data-toggle]')) {
            const th = $('.j-replies', el);
            if (th.hidden) { th.hidden = false; await loadThread(el, p); } else th.hidden = true;
            return;
        }

        const rb = e.target.closest('[data-react]');
        if (rb) {
            if (!user) return window.openAuthModal?.();
            const t = rb.dataset.react, ref = doc(db, 'posts', p.id, 'reactions', user.uid);
            const prev = p.mine;
            try {
                if (prev === t) { await deleteDoc(ref); p.counts[t]--; p.mine = null; }
                else {
                    await setDoc(ref, { type: t, uid: user.uid, createdAt: serverTimestamp() });
                    if (prev) p.counts[prev]--; p.counts[t]++; p.mine = t;
                }
                $('.j-reacts', el).innerHTML = reactBtns(p);
            } catch (err) { console.warn(err); }
            return;
        }

        if (e.target.closest('[data-send]')) {
            const btn = e.target.closest('[data-send]');
            const ta = $('textarea', el), errEl = $('.j-err', el), text = ta.value.trim();
            if (!text) { errEl.textContent = 'Tulis sesuatu dulu.'; return; }
            btn.disabled = true; errEl.textContent = '';
            try {
                await addDoc(collection(db, 'posts', p.id, 'replies'), {
                    uid: user.uid, name: (await currentName()).slice(0, 60), content: text.slice(0, 600), isAdmin, createdAt: serverTimestamp(),
                });
                await loadThread(el, p);
            } catch (err) { console.warn(err); errEl.textContent = 'Balasan gagal dikirim. Coba lagi.'; btn.disabled = false; }
            return;
        }

        const del = e.target.closest('[data-del]');
        if (del && confirm('Hapus balasan ini?')) {
            try { await deleteDoc(doc(db, 'posts', p.id, 'replies', del.closest('.j-reply').dataset.rid)); await loadThread(el, p); } catch (err) { console.warn(err); }
        }
    });
}

/* ---------- filter kategori berita ---------- */
function bindChips() {
    const chips = $('#beritaChips');
    chips?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]'); if (!b) return;
        cat = b.dataset.cat; renderBerita();
    });
}

/* ---------- dipanggil script.js setiap halaman berganti ---------- */
function pageShown(id) {
    if (id === 'diskusi' && !discLoaded) loadDiscussion();
}

export function initJournal() {
    bindChips(); bindDiscussion();
    window.journalPageShown = pageShown;

    onAuthStateChanged(auth, async (u) => {
        user = u; isAdmin = false;
        if (u) { try { isAdmin = (await getDoc(doc(db, 'admins', u.uid))).exists(); } catch { /* bukan admin */ } }
        if (discLoaded) loadDiscussion();   // muat ulang supaya reaksi "milikku" akurat
    });

    loadArticles(); loadLatestPost();
    pageShown(document.querySelector('.page.active')?.id);
}
