/* =====================================================================
   admin-kirim.js — Tab "REKAP PESANAN" dan "PENGIRIMAN" di Admin Panel
   ---------------------------------------------------------------------
   - Modul mandiri: TIDAK mengakses Firebase langsung. Data order/produk dan
     semua penulisan (status kirim, resi) lewat `deps` yang disuplai admin.js,
     jadi memakai koneksi, hak admin, dan fungsi yang SUDAH ADA.
   - Bagian "LOGIKA" (di atas) berisi fungsi murni tanpa DOM supaya bisa diuji.
   ===================================================================== */

/* ============================ LOGIKA ============================ */

const SIZE_URUT = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
const STATUS_BATAL = new Set(['rejected', 'ditolak', 'batal', 'dibatalkan', 'cancelled', 'canceled']);
export const STATUS_KIRIM = { belum: 'Belum disiapkan', siap: 'Siap dikirim', dikirim: 'Sudah dikirim' };
// Pemisah antar order pada "Salin Banyak Order" KirimAja (baris kosong). Ubah di sini bila perlu.
export const KIRIMAJA_SEPARATOR = '\n\n';
export const CFG_DEFAULT = { kurir: 'jnt ez', note: '', asuransi: 'tidak', berat: '500', volume: '34x29x3', cod: '' };

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const normKey = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
export const angka = v => (typeof v === 'number' ? (isFinite(v) ? Math.round(v) : 0) : (Number(String(v ?? '').replace(/\D/g, '')) || 0));
export const satuBaris = s => String(s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
const titleCase = s => String(s).toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

export const isBatal = o => STATUS_BATAL.has(String(o.status || '').toLowerCase());
export const isPaid = o => o.status === 'dp' || o.status === 'lunas';
export const labelBayar = o => ({ lunas: 'LUNAS', dp: 'DP', pending: 'PENDING' }[o.status || 'pending'] || (isBatal(o) ? 'DITOLAK' : 'PENDING'));
const classBayar = o => isBatal(o) ? 's-rejected' : (isPaid(o) ? 's-approved' : 's-pending');

// Satu entri produk = 1 pcs, kecuali ada field qty/jumlah. Mendukung format lama (produk string) & baru (array).
export function itemsOrder(o) {
    const qtyOf = x => { const n = Math.floor(Number(x && (x.qty ?? x.jumlah))); return n > 0 ? n : 1; };
    if (Array.isArray(o.produk)) {
        return o.produk.map(p => ({
            nama: String(p?.nama ?? '').trim(), warna: String(p?.warna ?? '').trim(),
            size: String(p?.size ?? '').trim(), qty: qtyOf(p), harga: angka(p?.harga)
        }));
    }
    return [{
        nama: String(o.produk ?? o.produkText ?? '').trim(), warna: String(o.warna ?? '').trim(),
        size: String(o.size ?? '').trim(), qty: qtyOf(o), harga: angka(o.hargaKaos)
    }];
}
export const totalPcsOrder = o => itemsOrder(o).reduce((s, i) => s + i.qty, 0);

export const statusKirimOf = o => (STATUS_KIRIM[o.statusKirim] ? o.statusKirim : (o.resi ? 'dikirim' : 'belum'));

// "+62812…" / "62812…" / "812…" -> "0812…" (hanya angka)
export function hpKirim(v) {
    let s = String(v ?? '').replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.startsWith('+62')) s = '0' + s.slice(3);
    else if (s.startsWith('62')) s = '0' + s.slice(2);
    else if (!s.startsWith('0') && !s.startsWith('+')) s = '0' + s;
    return s.replace(/\D/g, '');
}

// Order tidak menyimpan kecamatan di field terpisah; checkout menyusun alamat "detail, kel, Kec. X, kota, prov kodepos".
export function ekstrakKecamatan(alamat) {
    const re = /(?:^|,)\s*Kec(?:amatan)?\.?\s+([^,]+)/gi;
    let m, last = '';
    while ((m = re.exec(String(alamat ?? '')))) last = m[1].trim();
    return last;
}

export function namaBarangText(o) {
    const g = new Map();
    itemsOrder(o).forEach(i => {
        if (!i.nama) return;
        const k = normKey(i.nama);
        g.set(k, { nama: i.nama, qty: (g.get(k)?.qty || 0) + i.qty });
    });
    return [...g.values()].map(v => v.nama + (v.qty > 1 ? ' x' + v.qty : '')).join(', ');
}
// Nilai barang = harga kaos pada order (bukan total bayar: tanpa ongkir/diskon).
export const nilaiBarang = o => angka(o.hargaKaos) || itemsOrder(o).reduce((s, i) => s + i.harga * i.qty, 0);

export function dataKirim(o) {
    return {
        nama: satuBaris(o.nama), hp: hpKirim(o.wa), alamat: satuBaris(o.alamat),
        kecamatan: ekstrakKecamatan(o.alamat), namaBarang: satuBaris(namaBarangText(o)),
        nilaiBarang: nilaiBarang(o) || ''
    };
}
export function cekKirimAja(o, cfg) {
    const d = dataKirim(o), m = [];
    if (!d.nama) m.push('Nama penerima kosong');
    if (!d.hp) m.push('Nomor HP kosong'); else if (d.hp.length < 9) m.push('Nomor HP tampak tidak valid (' + d.hp + ')');
    if (!d.alamat) m.push('Alamat kosong');
    if (!d.kecamatan) m.push('Kecamatan tidak ditemukan di alamat (tidak ada bagian "Kec. …")');
    if (!d.namaBarang) m.push('Nama barang kosong');
    if (!d.nilaiBarang) m.push('Nilai barang (harga kaos) kosong');
    if (!String(cfg.kurir || '').trim()) m.push('Kurir belum diisi di pengaturan');
    if (!String(cfg.berat || '').trim()) m.push('Berat belum diisi di pengaturan');
    if (!String(cfg.volume || '').trim()) m.push('Volume belum diisi di pengaturan');
    return m;
}
export function cekJnt(o) {
    const d = dataKirim(o), m = [];
    if (!d.nama) m.push('Nama penerima kosong');
    if (!d.hp) m.push('Nomor HP kosong'); else if (d.hp.length < 9) m.push('Nomor HP tampak tidak valid (' + d.hp + ')');
    if (!d.alamat) m.push('Alamat kosong');
    else {
        if (d.alamat.length < 10) m.push('Alamat sangat pendek / tidak lengkap');
        if (!d.kecamatan) m.push('Alamat tidak memuat bagian kecamatan ("Kec. …"), mungkin tidak lengkap');
    }
    return m;
}
// Format persis sesuai permintaan: label tanpa spasi setelah titik dua, tiap field di baris baru.
export function formatKirimAja(o, cfg) {
    const d = dataKirim(o), c = { ...CFG_DEFAULT, ...cfg };
    return [
        'Nama:' + d.nama,
        'No hp:' + d.hp,
        'Alamat:' + d.alamat,
        'Kecamatan:' + d.kecamatan,
        'Nama Barang:' + d.namaBarang,
        'Nilai Barang:' + d.nilaiBarang,
        'Nilai COD Kustom:' + satuBaris(c.cod),
        'Kurir:' + satuBaris(c.kurir),
        'Note:' + satuBaris(c.note),
        'Asuransi:' + satuBaris(c.asuransi),
        'Pembayaran:non cod',
        'Berat(gr):' + satuBaris(c.berat),
        'Volume(cm):' + satuBaris(c.volume)
    ].join('\n');
}
export function formatJnt(o) {
    const d = dataKirim(o);
    return `${d.nama}, ${d.hp}, ${d.alamat}`;
}

const rankSize = k => { const i = SIZE_URUT.indexOf(k.toUpperCase()); return i < 0 ? 999 : i; };

/* Rekap satu produk. Mengembalikan jumlah per warna x size dari KUANTITAS item (bukan jumlah dokumen order).
   Warna/size disiapkan dari data produk (selalu tampil, 0 bila kosong); yang muncul di order tapi tidak ada
   di data produk tetap dihitung (supaya total tidak kurang) dan ditandai extra=true. */
export function hitungRekap(orders, produkList, namaProduk, opt = {}) {
    const key = normKey(namaProduk);
    const def = (produkList || []).find(p => normKey(p.nama) === key) || null;
    const warnaMap = new Map(), sizeMap = new Map();
    const tambah = (map, raw, extra) => {
        const label = String(raw ?? '').trim().replace(/\s+/g, ' ');
        if (!label) return null;
        const k = normKey(label);
        if (!map.has(k)) map.set(k, { key: k, label: label.toUpperCase(), extra });
        return k;
    };
    if (def) {
        String(def.warna || '').split('/').forEach(w => tambah(warnaMap, w, false));
        String(def.stok || '').split('/').forEach(s => tambah(sizeMap, s, false));
    }
    const mx = {}, perColor = {}, perSize = {}, rows = [], orderSet = new Set();
    let totalPcs = 0, pendingTidakDihitung = 0, batalDiabaikan = 0;

    (orders || []).forEach(o => {
        const items = itemsOrder(o);
        const cocok = items.filter(i => normKey(i.nama) === key);
        if (!cocok.length) return;
        if (isBatal(o)) { batalDiabaikan++; return; }
        if (!isPaid(o) && !opt.termasukPending) { pendingTidakDihitung++; return; }
        orderSet.add(o.id);
        items.forEach((i, idx) => {
            if (normKey(i.nama) !== key) return;
            const wk = tambah(warnaMap, i.warna || '(tanpa warna)', true);
            const sk = tambah(sizeMap, i.size || '(tanpa size)', true);
            mx[wk] = mx[wk] || {};
            mx[wk][sk] = (mx[wk][sk] || 0) + i.qty;
            perColor[wk] = (perColor[wk] || 0) + i.qty;
            perSize[sk] = (perSize[sk] || 0) + i.qty;
            totalPcs += i.qty;
            rows.push({ docId: o.id, idx, nama: String(o.nama || '').trim(), warna: i.warna, size: i.size, qty: i.qty, wk, sk, o });
        });
    });

    const colors = [...warnaMap.values()];
    const sizes = [...sizeMap.values()].sort((a, b) => (rankSize(a.key) - rankSize(b.key)) || a.label.localeCompare(b.label));
    rows.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' })
        || String(a.o.createdAt || '').localeCompare(String(b.o.createdAt || ''))
        || String(a.docId).localeCompare(String(b.docId)) || (a.idx - b.idx));
    return {
        nama: namaProduk, def, colors, sizes, mx, perColor, perSize, rows, totalPcs,
        totalOrder: orderSet.size, pendingTidakDihitung, batalDiabaikan,
        adaExtra: colors.some(c => c.extra) || sizes.some(s => s.extra)
    };
}

export function teksRekap(r) {
    const out = ['REKAP PRODUK — ' + String(r.nama).toUpperCase(), ''];
    r.colors.forEach(c => {
        out.push(c.label);
        r.sizes.forEach(s => out.push(`${s.label} : ${(r.mx[c.key] && r.mx[c.key][s.key]) || 0} pcs`));
        out.push(`Total ${titleCase(c.label)}: ${r.perColor[c.key] || 0} pcs`, '');
    });
    out.push('TOTAL PER SIZE');
    r.sizes.forEach(s => out.push(`${s.label} : ${r.perSize[s.key] || 0} pcs`));
    out.push('', `TOTAL KESELURUHAN: ${r.totalPcs} PCS`);
    return out.join('\n');
}

/* ============================== UI ============================== */

export function initRekapKirim(deps) {
    const $ = id => document.getElementById(id);
    const SEMUA = '__semua__';
    const mkK = () => ({ q: '', produk: '', pay: 'semua', ship: 'semua', sel: new Set(), visible: [] });
    const S = {
        rekap: { produk: null, status: 'paid', q: '', warna: '', size: '', rekaps: [] },
        sub: 'kirimaja',
        kirim: { kirimaja: mkK(), jnt: mkK() },
        detail: { id: null, mode: null },
        cfg: loadCfg()
    };
    const idOf = o => deps.idOrder(o);
    const orders = () => deps.getOrders() || [];
    const produk = () => deps.getProduk() || [];
    const fmtTgl = iso => { const d = new Date(iso); return isNaN(d) ? '-' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

    function loadCfg() {
        try {
            const j = JSON.parse(localStorage.getItem('fvck_kirimaja_cfg_v1') || 'null');
            const c = { ...CFG_DEFAULT };
            if (j && typeof j === 'object') Object.keys(CFG_DEFAULT).forEach(k => { if (typeof j[k] === 'string') c[k] = j[k]; });
            return c;
        } catch (e) { return { ...CFG_DEFAULT }; }
    }
    function saveCfg() { try { localStorage.setItem('fvck_kirimaja_cfg_v1', JSON.stringify(S.cfg)); } catch (e) { /* storage diblokir: tetap jalan untuk sesi ini */ } }

    /* ---------- util tampilan ---------- */
    function stateMsg(kind) {   // 'loading' | 'error' | 'empty' | null
        const st = deps.getState();
        if (st.error) return `<div class="empty"><i class="fas fa-exclamation-triangle"></i><p>GAGAL MEMBACA ORDER DARI FIREBASE<br><span style="color:#888">${esc(st.error)}</span><br><span style="color:#888">Pastikan sudah login sebagai admin dan firestore.rules sudah dipublish.</span></p><button class="btn-sm btn-bukti" style="margin-top:14px;max-width:200px" data-act="reload">COBA LAGI</button></div>`;
        if (!st.ordersReady || !st.produkReady) return `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat data order...</div>`;
        if (!orders().length) return `<div class="empty"><i class="fas fa-box-open"></i><p>Belum ada order</p></div>`;
        return null;
    }
    function setOptions(sel, opts, value) {
        if (!sel) return;
        const sig = opts.map(o => o.value + '\u0001' + o.label).join('\u0002');
        if (sel.dataset.sig !== sig) {
            sel.innerHTML = opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
            sel.dataset.sig = sig;
        }
        sel.value = opts.some(o => o.value === value) ? value : (opts[0] ? opts[0].value : '');
    }
    function produkOpts() {
        const seen = new Map();
        [...produk()].sort((a, b) => (b.order || 0) - (a.order || 0)).forEach(p => {
            const k = normKey(p.nama);
            if (k && !seen.has(k)) seen.set(k, { nama: String(p.nama).trim(), badge: p.badge });
        });
        orders().forEach(o => itemsOrder(o).forEach(i => {
            const k = normKey(i.nama);
            if (k && !seen.has(k)) seen.set(k, { nama: i.nama, badge: '', lama: true });
        }));
        return [...seen.values()].map(v => ({
            value: v.nama,
            label: (v.badge === 'pre' ? '(Pre Order) ' : v.badge === 'sold' ? '(Sold Out) ' : '') + v.nama + (v.lama ? ' (produk lama)' : '')
        }));
    }
    function ringkasItems(o) {
        return itemsOrder(o).map(i => `${esc(i.nama)} — ${esc(i.warna || '-')} / ${esc(String(i.size || '-').toUpperCase())}${i.qty > 1 ? ' ×' + i.qty : ''}`).join('<br>');
    }

    /* ---------- clipboard ---------- */
    async function salin(text, okMsg) {
        try {
            if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); deps.toast(okMsg); return true; }
        } catch (e) { /* lanjut ke fallback */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) { deps.toast(okMsg); return true; }
        } catch (e) { /* gagal */ }
        deps.toast('GAGAL MENYALIN — browser menolak akses clipboard', true);
        return false;
    }
    const cekOrder = (o, sub) => sub === 'kirimaja' ? cekKirimAja(o, S.cfg) : cekJnt(o);
    const teksOrder = (o, sub) => sub === 'kirimaja' ? formatKirimAja(o, S.cfg) : formatJnt(o);
    const namaFormat = sub => sub === 'kirimaja' ? 'KIRIMAJA' : 'J&T';

    function salinSatu(id, sub) {
        const o = orders().find(x => x.id === id);
        if (!o) return deps.toast('ORDER TIDAK DITEMUKAN', true);
        const miss = cekOrder(o, sub);
        if (miss.length && !confirm(`Data order ${idOf(o)} belum lengkap:\n\n- ${miss.join('\n- ')}\n\nTetap salin?`)) return;
        salin(teksOrder(o, sub), `FORMAT ${namaFormat(sub)} TERSALIN ✓`);
    }
    function salinBanyak(sub) {
        const st = S.kirim[sub];
        const list = st.visible.filter(o => st.sel.has(o.id));
        if (!list.length) return deps.toast('PILIH MINIMAL 1 ORDER DULU', true);
        const bermasalah = list.map(o => ({ o, miss: cekOrder(o, sub) })).filter(x => x.miss.length);
        if (bermasalah.length) {
            const baris = bermasalah.slice(0, 8).map(x => `• ${idOf(x.o)}: ${x.miss.join('; ')}`).join('\n');
            const lebih = bermasalah.length > 8 ? `\n… dan ${bermasalah.length - 8} order lain` : '';
            if (!confirm(`${bermasalah.length} dari ${list.length} order datanya belum lengkap:\n\n${baris}${lebih}\n\nTetap salin semua?`)) return;
        }
        const teks = list.map(o => teksOrder(o, sub)).join(sub === 'kirimaja' ? KIRIMAJA_SEPARATOR : '\n');
        salin(teks, `${list.length} ORDER ${namaFormat(sub)} TERSALIN ✓`);
    }

    /* =================== REKAP PESANAN =================== */
    function buildRekap() {
        $('rekapRoot').innerHTML = `
        <div class="rk-bar">
            <div class="rk-field"><label>PRODUK / ARTIKEL</label><select id="rkProduk"></select></div>
            <div class="rk-field"><label>PESANAN YANG DIHITUNG</label>
                <select id="rkStatus"><option value="paid">DP + LUNAS</option><option value="aktif">DP + LUNAS + PENDING</option></select></div>
        </div>
        <div id="rkSummary"></div>
        <div id="rkListWrap" style="display:none">
            <div class="rk-sec-title">DAFTAR PESANAN <span id="rkCount"></span></div>
            <div class="rk-bar">
                <div class="rk-field rk-grow"><input id="rkQ" type="search" placeholder="Cari nama atau Order ID…" autocomplete="off"></div>
                <div class="rk-field"><select id="rkWarna"></select></div>
                <div class="rk-field"><select id="rkSize"></select></div>
            </div>
            <div class="rk-hint">Cari &amp; filter hanya memengaruhi daftar ini. Angka rekap di atas selalu penuh per produk. Ketuk baris untuk detail order.</div>
            <div id="rkList" class="rk-scroll"></div>
        </div>`;
        const r = S.rekap;
        $('rkProduk').addEventListener('change', e => { r.produk = e.target.value; r.warna = ''; r.size = ''; renderRekap(); });
        $('rkStatus').addEventListener('change', e => { r.status = e.target.value; renderRekap(); });
        $('rkQ').addEventListener('input', e => { r.q = e.target.value; renderRekapList(); });
        $('rkWarna').addEventListener('change', e => { r.warna = e.target.value; renderRekapList(); });
        $('rkSize').addEventListener('change', e => { r.size = e.target.value; renderRekapList(); });
    }

    function renderRekap() {
        const sum = $('rkSummary'), wrap = $('rkListWrap');
        if (!sum) return;
        const msg = stateMsg();
        if (msg) { sum.innerHTML = msg; wrap.style.display = 'none'; return; }

        const opts = produkOpts();
        const all = [{ value: SEMUA, label: 'SEMUA PRODUK' }, ...opts];
        if (S.rekap.produk === null) {
            const pre = [...produk()].sort((a, b) => (b.order || 0) - (a.order || 0)).find(p => p.badge === 'pre');
            S.rekap.produk = (pre && opts.find(o => normKey(o.value) === normKey(pre.nama))?.value) || (opts[0] ? opts[0].value : SEMUA);
        }
        if (!all.some(o => o.value === S.rekap.produk)) S.rekap.produk = opts[0] ? opts[0].value : SEMUA;
        setOptions($('rkProduk'), all, S.rekap.produk);
        $('rkStatus').value = S.rekap.status;

        const nama = S.rekap.produk === SEMUA ? opts.map(o => o.value) : [S.rekap.produk];
        const opt = { termasukPending: S.rekap.status === 'aktif' };
        S.rekap.rekaps = nama.map(n => hitungRekap(orders(), produk(), n, opt));
        const rs = S.rekap.rekaps;

        let html = '';
        if (S.rekap.produk === SEMUA) {
            const tot = rs.reduce((a, r) => ({ o: a.o + r.totalOrder, p: a.p + r.totalPcs }), { o: 0, p: 0 });
            html += `<div class="rk-card"><div class="rk-sub" style="margin-top:0">TOTAL JUMLAH PESANAN PER PRODUK</div>
                ${rs.map(r => `<div class="rk-line"><span>${esc(r.nama)}</span><b>${r.totalOrder} order · ${r.totalPcs} pcs</b></div>`).join('')}
                <div class="rk-line rk-total"><span>TOTAL</span><b>${tot.o} order · ${tot.p} pcs</b></div></div>`;
        }
        html += rs.map((r, i) => rekapCardHTML(r, i)).join('');
        sum.innerHTML = html;
        wrap.style.display = '';
        renderRekapList();
    }

    function rekapCardHTML(r, i) {
        const cell = (c, s) => (r.mx[c.key] && r.mx[c.key][s.key]) || 0;
        const notes = [];
        if (r.pendingTidakDihitung) notes.push(`${r.pendingTidakDihitung} order PENDING belum dihitung (ubah pilihan "Pesanan yang dihitung" untuk menyertakan).`);
        if (r.batalDiabaikan) notes.push(`${r.batalDiabaikan} order DITOLAK/batal diabaikan.`);
        if (r.adaExtra) notes.push('Tanda * = warna/size ada di order tetapi tidak ada di data produk; tetap dihitung agar total sesuai pesanan.');
        if (!r.def) notes.push('Produk ini tidak ada di katalog saat ini (data dari order saja).');
        const mark = x => x.extra ? '*' : '';
        return `
        <div class="rk-card">
            <div class="rk-card-head">
                <div class="rk-prod">Produk: ${esc(r.nama)}</div>
                <button class="add-btn" data-act="salin-rekap" data-i="${i}"><i class="fas fa-copy"></i> SALIN REKAP</button>
            </div>
            <div class="rk-stats">
                <div class="rk-stat"><b>${r.totalOrder}</b><span>TOTAL ORDER</span></div>
                <div class="rk-stat"><b>${r.totalPcs}</b><span>TOTAL KAOS (PCS)</span></div>
            </div>
            <div class="rk-sub">TOTAL PER WARNA</div>
            <div class="rk-chips">${r.colors.length ? r.colors.map(c => `<span class="rk-chip">${esc(c.label)}${mark(c)}: <b>${r.perColor[c.key] || 0}</b> pcs</span>`).join('') : '<span class="rk-muted">Belum ada data warna</span>'}</div>
            <div class="rk-sub">TOTAL PER SIZE</div>
            <div class="rk-chips">${r.sizes.length ? r.sizes.map(s => `<span class="rk-chip">${esc(s.label)}${mark(s)}: <b>${r.perSize[s.key] || 0}</b> pcs</span>`).join('') : '<span class="rk-muted">Belum ada data size</span>'}</div>
            <div class="rk-sub">REKAP WARNA &amp; SIZE</div>
            <div class="rk-colors">
                ${r.colors.map(c => `
                <div class="rk-color">
                    <div class="rk-color-name">${esc(c.label)}${mark(c)}</div>
                    ${r.sizes.map(s => `<div class="rk-line"><span>${esc(s.label)}${mark(s)} :</span><b>${cell(c, s)} pcs</b></div>`).join('')}
                    <div class="rk-line rk-total"><span>Total ${esc(titleCase(c.label))}:</span><b>${r.perColor[c.key] || 0} pcs</b></div>
                </div>`).join('')}
            </div>
            <div class="rk-line rk-total rk-grand"><span>TOTAL KESELURUHAN</span><b>${r.totalPcs} PCS</b></div>
            ${notes.map(n => `<div class="rk-note">${esc(n)}</div>`).join('')}
        </div>`;
    }

    function renderRekapList() {
        const list = $('rkList');
        if (!list || !S.rekap.rekaps.length && stateMsg()) return;
        const r = S.rekap;
        const semua = r.rekaps.flatMap(x => x.rows.map(row => ({ ...row, produk: x.nama })));
        // opsi filter warna & size dari data yang ada
        const wMap = new Map(), sMap = new Map();
        r.rekaps.forEach(x => { x.colors.forEach(c => wMap.set(c.key, c.label)); x.sizes.forEach(s => sMap.set(s.key, s.label)); });
        setOptions($('rkWarna'), [{ value: '', label: 'SEMUA WARNA' }, ...[...wMap].map(([k, l]) => ({ value: k, label: l }))], r.warna);
        setOptions($('rkSize'), [{ value: '', label: 'SEMUA SIZE' }, ...[...sMap].map(([k, l]) => ({ value: k, label: l }))], r.size);
        r.warna = $('rkWarna').value; r.size = $('rkSize').value;

        const q = normKey(r.q);
        const rows = semua.filter(x =>
            (!r.warna || x.wk === r.warna) && (!r.size || x.sk === r.size) &&
            (!q || normKey(x.nama).includes(q) || normKey(idOf(x.o)).includes(q) || normKey(x.o.orderNo).includes(q)));
        $('rkCount').textContent = `(${rows.length} item${rows.length !== semua.length ? ' dari ' + semua.length : ''})`;
        if (!rows.length) {
            list.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><p>${semua.length ? 'Tidak ada hasil untuk filter ini' : 'Belum ada pesanan untuk produk ini'}</p></div>`;
            return;
        }
        const multi = r.produk === SEMUA;
        list.innerHTML = rows.map(x => `
            <div class="rk-row" data-act="row-rekap" data-id="${esc(x.docId)}">
                <div class="rk-row-main"><b>${esc(x.nama || '(tanpa nama)')}</b> — ${esc(x.warna || '-')} — ${esc(String(x.size || '-').toUpperCase())}${x.qty > 1 ? `<span class="rk-qty">×${x.qty}</span>` : ''}</div>
                <div class="rk-row-sub">${esc(idOf(x.o))} · <span class="status-badge ${classBayar(x.o)}">${labelBayar(x.o)}</span>${multi ? ' · ' + esc(x.produk) : ''}</div>
            </div>`).join('');
    }

    /* =================== PENGIRIMAN =================== */
    function buildKirim() {
        const panel = sub => `
        <div class="rk-panel" id="kPanel-${sub}" style="display:${sub === S.sub ? 'block' : 'none'}">
            ${sub === 'kirimaja' ? `
            <details class="rk-cfg"><summary>PENGATURAN FORMAT KIRIMAJA</summary>
                <div class="rk-cfg-grid">
                    ${[['kurir', 'KURIR'], ['asuransi', 'ASURANSI'], ['berat', 'BERAT (GR)'], ['volume', 'VOLUME (CM)'], ['cod', 'NILAI COD KUSTOM (kosong = non-COD)'], ['note', 'NOTE / CATATAN']]
                        .map(([k, l]) => `<div class="rk-field"><label>${l}</label><input type="text" data-cfg="${k}" value="${esc(S.cfg[k])}" autocomplete="off"></div>`).join('')}
                </div>
                <div class="rk-hint">Pembayaran selalu <b>non cod</b>. Nilai Barang diisi otomatis dari harga kaos tiap order. Pengaturan tersimpan di browser ini.
                    <button class="btn-sm btn-bukti" style="max-width:170px;margin-top:8px;display:block" data-act="cfg-reset">KEMBALIKAN DEFAULT</button></div>
            </details>` : ''}
            <div class="rk-bar">
                <div class="rk-field rk-grow"><input id="kQ-${sub}" type="search" placeholder="Cari nama, Order ID, HP, atau resi…" autocomplete="off"></div>
            </div>
            <div class="rk-bar">
                <div class="rk-field"><select id="kProd-${sub}"></select></div>
                <div class="rk-field"><select id="kPay-${sub}"><option value="semua">SEMUA PEMBAYARAN</option><option value="lunas">LUNAS</option><option value="dp">DP</option></select></div>
                <div class="rk-field"><select id="kShip-${sub}"><option value="semua">SEMUA STATUS KIRIM</option>${Object.entries(STATUS_KIRIM).map(([k, v]) => `<option value="${k}">${v.toUpperCase()}</option>`).join('')}</select></div>
            </div>
            <div class="rk-actionbar">
                <label class="rk-chk"><input type="checkbox" id="kAll-${sub}"> PILIH SEMUA YANG TAMPIL</label>
                <span class="rk-muted" id="kSelInfo-${sub}"></span>
            </div>
            <div class="rk-actionbar">
                <button class="add-btn" data-act="copy-bulk" data-sub="${sub}" id="kBulk-${sub}"><i class="fas fa-copy"></i> SALIN BANYAK ORDER (0)</button>
                <select id="kBulkSt-${sub}" class="rk-sel-sm">${Object.entries(STATUS_KIRIM).map(([k, v]) => `<option value="${k}">${v.toUpperCase()}</option>`).join('')}</select>
                <button class="btn-sm btn-bukti rk-btn-fit" data-act="bulk-status" data-sub="${sub}">UBAH STATUS TERPILIH</button>
            </div>
            <div id="kList-${sub}" class="rk-scroll"></div>
        </div>`;
        $('kirimRoot').innerHTML = `
        <div class="filter-bar">
            <button class="filter-btn active" id="kTab-kirimaja" data-act="sub" data-sub="kirimaja">KIRIMAJA</button>
            <button class="filter-btn" id="kTab-jnt" data-act="sub" data-sub="jnt">J&amp;T EXPRESS</button>
        </div>
        <div class="rk-hint" style="margin-top:-8px;margin-bottom:14px">Fitur ini hanya menyiapkan teks untuk ditempel ke KirimAja / J&amp;T. Tidak mengirim pesanan atau membuat resi otomatis.</div>
        ${panel('kirimaja')}${panel('jnt')}`;

        ['kirimaja', 'jnt'].forEach(sub => {
            const st = S.kirim[sub];
            $('kQ-' + sub).addEventListener('input', e => { st.q = e.target.value; renderKirimList(sub); });
            $('kProd-' + sub).addEventListener('change', e => { st.produk = e.target.value; renderKirimList(sub); });
            $('kPay-' + sub).addEventListener('change', e => { st.pay = e.target.value; renderKirimList(sub); });
            $('kShip-' + sub).addEventListener('change', e => { st.ship = e.target.value; renderKirimList(sub); });
            $('kAll-' + sub).addEventListener('change', e => {
                st.visible.forEach(o => e.target.checked ? st.sel.add(o.id) : st.sel.delete(o.id));
                document.querySelectorAll(`#kList-${sub} input[data-act="sel"]`).forEach(cb => { cb.checked = e.target.checked; cb.closest('.rk-row').classList.toggle('picked', e.target.checked); });
                updateSelUI(sub);
            });
        });
        document.querySelectorAll('[data-cfg]').forEach(inp => inp.addEventListener('input', () => {
            S.cfg[inp.dataset.cfg] = inp.value; saveCfg(); refreshPreview();
        }));
    }

    function kirimData(sub) {
        const st = S.kirim[sub];
        const q = normKey(st.q), pk = normKey(st.produk);
        return orders().filter(o => !isBatal(o) && isPaid(o))
            .filter(o => st.pay === 'semua' || o.status === st.pay)
            .filter(o => st.ship === 'semua' || statusKirimOf(o) === st.ship)
            .filter(o => !pk || itemsOrder(o).some(i => normKey(i.nama) === pk))
            .filter(o => !q || [o.nama, idOf(o), o.orderNo, o.kodePelunasan, o.wa, hpKirim(o.wa), o.resi].some(v => normKey(v).includes(q)))
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
    }

    function renderKirim() {
        if (!$('kirimRoot') || !$('kPanel-kirimaja')) return;
        const msg = stateMsg();
        ['kirimaja', 'jnt'].forEach(sub => {
            const list = $('kList-' + sub);
            if (msg) {
                list.innerHTML = msg; S.kirim[sub].visible = []; updateSelUI(sub);
                return;
            }
            setOptions($('kProd-' + sub), [{ value: '', label: 'SEMUA PRODUK' }, ...produkOpts()], S.kirim[sub].produk);
            S.kirim[sub].produk = $('kProd-' + sub).value;
            renderKirimList(sub);
        });
    }

    function renderKirimList(sub) {
        const st = S.kirim[sub], list = $('kList-' + sub);
        if (!list) return;
        const msg = stateMsg();
        if (msg) { list.innerHTML = msg; st.visible = []; return updateSelUI(sub); }
        // buang pilihan untuk order yang sudah tidak ada / tidak layak kirim lagi
        const valid = new Set(orders().filter(o => !isBatal(o) && isPaid(o)).map(o => o.id));
        [...st.sel].forEach(id => { if (!valid.has(id)) st.sel.delete(id); });
        st.visible = kirimData(sub);
        if (!st.visible.length) {
            list.innerHTML = `<div class="empty"><i class="fas fa-truck"></i><p>${valid.size ? 'Tidak ada order untuk filter ini' : 'Belum ada order DP / LUNAS yang bisa dikirim'}</p></div>`;
            return updateSelUI(sub);
        }
        const fmtLabel = sub === 'kirimaja' ? 'KIRIMAJA' : 'J&T';
        list.innerHTML = st.visible.map(o => {
            const sk = statusKirimOf(o), picked = st.sel.has(o.id), d = dataKirim(o);
            const skCls = sk === 'belum' ? 's-pending' : 's-approved';   // merah hanya untuk DITOLAK; 'belum disiapkan' status normal
            return `
            <div class="rk-row rk-krow${picked ? ' picked' : ''}" data-act="row-kirim" data-id="${esc(o.id)}">
                <label class="rk-pick" data-stop><input type="checkbox" data-act="sel" data-sub="${sub}" data-id="${esc(o.id)}" ${picked ? 'checked' : ''}></label>
                <div class="rk-krow-body">
                    <div class="rk-krow-top"><span class="rk-oid">${esc(idOf(o))}</span>
                        <span class="status-badge ${skCls}">${esc(STATUS_KIRIM[sk].toUpperCase())}</span>
                        <span class="status-badge ${classBayar(o)}">${labelBayar(o)}</span></div>
                    <div class="rk-krow-name">${esc(d.nama || '(tanpa nama)')}</div>
                    <div class="rk-krow-line">${ringkasItems(o)}</div>
                    <div class="rk-krow-line">${esc(d.hp || '(HP kosong)')}</div>
                    <div class="rk-krow-line rk-addr">${esc(d.alamat || '(alamat kosong)')}</div>
                    ${o.resi ? `<div class="rk-krow-line">RESI: <b>${esc(o.resi)}</b></div>` : ''}
                    <div class="rk-krow-actions" data-stop>
                        <button class="btn-sm btn-bukti" data-act="detail" data-id="${esc(o.id)}">DETAIL</button>
                        <button class="btn-sm btn-approve" data-act="copy-one" data-sub="${sub}" data-id="${esc(o.id)}">SALIN FORMAT ${fmtLabel}</button>
                    </div>
                </div>
            </div>`;
        }).join('');
        updateSelUI(sub);
    }

    function updateSelUI(sub) {
        const st = S.kirim[sub];
        const n = st.visible.filter(o => st.sel.has(o.id)).length;
        const b = $('kBulk-' + sub), info = $('kSelInfo-' + sub), all = $('kAll-' + sub);
        if (b) b.innerHTML = `<i class="fas fa-copy"></i> SALIN BANYAK ORDER (${n})`;
        if (info) info.textContent = `${n} dipilih · ${st.visible.length} tampil`;
        if (all) all.checked = st.visible.length > 0 && n === st.visible.length;
    }

    function switchSub(sub) {
        S.sub = sub;
        ['kirimaja', 'jnt'].forEach(s => {
            $('kPanel-' + s).style.display = s === sub ? 'block' : 'none';
            $('kTab-' + s).classList.toggle('active', s === sub);
        });
        if (S.detail.id) renderDetail();
    }

    async function bulkStatus(sub) {
        const st = S.kirim[sub];
        const list = st.visible.filter(o => st.sel.has(o.id));
        if (!list.length) return deps.toast('PILIH MINIMAL 1 ORDER DULU', true);
        const status = $('kBulkSt-' + sub).value;
        if (!confirm(`Ubah status pengiriman ${list.length} order menjadi "${STATUS_KIRIM[status]}"?\n\nStatus pembayaran TIDAK berubah.`)) return;
        let ok = 0, gagal = 0, err = '';
        for (const o of list) {
            try { await deps.setStatusKirim(o, status); deps.patchOrder(o.id, { statusKirim: status }); ok++; }
            catch (e) { console.error(e); gagal++; if (!err) err = (e && (e.code || e.message)) || 'error'; }
        }
        deps.toast(gagal ? `${ok} OK, ${gagal} GAGAL (${err})` : `${ok} ORDER → ${STATUS_KIRIM[status].toUpperCase()} ✓`, gagal > 0);
        refresh(true);
    }

    /* =================== DETAIL ORDER =================== */
    function openDetail(id, mode) {
        S.detail = { id, mode };
        $('modalRkDetail').classList.add('show');
        renderDetail();
    }
    function closeDetail() {
        S.detail = { id: null, mode: null };
        $('modalRkDetail').classList.remove('show');
    }
    // Pembeli yang sama: email sama; bila salah satu tanpa email, nomor HP DAN nama harus sama
    // (HP saja tidak cukup: satu nomor bisa dipakai beberapa orang berbeda).
    const sameBuyer = (a, b) => {
        const ea = normKey(a.email), eb = normKey(b.email), ha = hpKirim(a.wa), hb = hpKirim(b.wa);
        if (ea && eb) return ea === eb;
        return !!ha && ha === hb && !!normKey(a.nama) && normKey(a.nama) === normKey(b.nama);
    };
    const kv = (l, v) => `<div class="info-item">${l}<span>${v}</span></div>`;

    function renderDetail() {
        const body = $('rkDetailBody');
        const o = orders().find(x => x.id === S.detail.id);
        if (!o) { closeDetail(); return; }
        const kirim = S.detail.mode === 'kirim';
        const d = dataKirim(o), sk = statusKirimOf(o), total = deps.totalOrder(o);
        const others = orders().filter(x => x.id !== o.id && sameBuyer(o, x))
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        const catatan = o.catatan || o.note || o.keterangan || '';
        const sub = S.sub;
        const prevResi = $('dResi');
        const keepResi = prevResi && prevResi.dataset.id === o.id ? prevResi.value : null;

        body.innerHTML = `
        <div class="modal-title">DETAIL ORDER</div>
        <div class="order-info">
            ${kv('Order ID', `<b style="user-select:all;letter-spacing:.06em">${esc(idOf(o))}</b>`)}
            ${kv('Tanggal Order', esc(fmtTgl(o.createdAt)))}
            ${kv('Nama Pembeli / Penerima', esc(o.nama || '-'))}
            ${kv('Nomor HP', esc(o.wa || '-') + (d.hp && d.hp !== o.wa ? ` <small style="color:#888">(format salin: ${esc(d.hp)})</small>` : ''))}
            ${kv('Email', esc(o.email || '-'))}
            ${kv('Kecamatan', esc(d.kecamatan || '-'))}
            <div class="info-item" style="grid-column:1/-1">Alamat Lengkap<span>${esc(o.alamat || '-')}</span></div>
            <div class="info-item" style="grid-column:1/-1">Produk · Warna · Size · Jumlah<span>${ringkasItems(o)}</span></div>
            ${kv('Jumlah Item', totalPcsOrder(o) + ' pcs')}
            ${kv('Nilai Barang (harga kaos)', d.nilaiBarang ? rp(d.nilaiBarang) : '-')}
            ${kv('Total Pembayaran', rp(total))}
            ${kv('Status Pembayaran', `<span class="status-badge ${classBayar(o)}">${labelBayar(o)}</span>` + (o.status === 'dp' && o.dpNominal ? ` <small style="color:#888">DP ${rp(o.dpNominal)} · sisa ${rp(o.sisaBayar)}</small>` : ''))}
            ${kv('Catatan Pesanan', catatan ? esc(catatan) : '<span style="color:#666">— (tidak ada field catatan di order)</span>')}
            ${kv('Status Pengiriman', esc(STATUS_KIRIM[sk]))}
            ${kv('Nomor Resi', o.resi ? `<b>${esc(o.resi)}</b>` : '-')}
        </div>
        ${kirim ? kirimControlsHTML(o, sk, sub) : ''}
        ${others.length ? `
        <div class="rk-sub">ORDER LAIN DARI PEMBELI YANG SAMA (${others.length})</div>
        ${others.map(x => `
            <div class="rk-row" data-act="open-other" data-id="${esc(x.id)}" data-mode="${S.detail.mode}">
                <div class="rk-row-main"><b>${esc(idOf(x))}</b> <span class="status-badge ${classBayar(x)}">${labelBayar(x)}</span></div>
                <div class="rk-row-sub">${ringkasItems(x)}</div>
            </div>`).join('')}` : ''}
        <div class="modal-actions" style="margin-top:20px"><button class="btn-cancel" data-act="close-detail">TUTUP</button></div>`;
        if (keepResi !== null && $('dResi')) $('dResi').value = keepResi;
    }

    function kirimControlsHTML(o, sk, sub) {
        const miss = cekOrder(o, sub);
        return `
        <div class="rk-sub">STATUS PENGIRIMAN</div>
        <select id="dStatusKirim" data-id="${esc(o.id)}" class="rk-sel-full">
            ${Object.entries(STATUS_KIRIM).map(([k, v]) => `<option value="${k}" ${k === sk ? 'selected' : ''}>${v.toUpperCase()}</option>`).join('')}
        </select>
        <div class="rk-hint">Mengubah status pengiriman tidak mengubah status pembayaran.</div>
        <div class="rk-sub">NOMOR RESI (MANUAL)</div>
        <div class="rk-bar" style="margin-bottom:6px">
            <div class="rk-field rk-grow"><input id="dResi" data-id="${esc(o.id)}" type="text" maxlength="60" value="${esc(o.resi || '')}" placeholder="mis. JP1234567890" autocomplete="off"></div>
            <button class="btn-sm btn-approve rk-btn-fit" data-act="save-resi" data-id="${esc(o.id)}">${o.resi ? 'UPDATE RESI' : 'SIMPAN RESI'}</button>
            ${o.resi ? `<button class="btn-sm rk-btn-fit" style="background:rgba(255,59,59,0.08);color:#ff4d4d;border:1px solid rgba(255,59,59,0.15)" data-act="del-resi" data-id="${esc(o.id)}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        <div class="rk-hint">Resi disimpan ke order dan ke data Pantau Pesanan / Cek Resi (fungsi yang sama dengan kolom resi di tab ORDER).</div>
        <div class="rk-sub">FORMAT ${namaFormat(sub)}</div>
        ${miss.length ? `<div class="rk-note" style="color:#ff8a8a">Data belum lengkap: ${esc(miss.join('; '))}</div>` : ''}
        <textarea id="dPreview" class="rk-preview" readonly rows="${sub === 'kirimaja' ? 13 : 4}">${esc(teksOrder(o, sub))}</textarea>
        <button class="add-btn" style="width:100%;justify-content:center;margin-top:10px" data-act="copy-preview" data-id="${esc(o.id)}" data-sub="${sub}"><i class="fas fa-copy"></i> SALIN TEKS</button>`;
    }
    function refreshPreview() {
        const ta = $('dPreview');
        if (!ta || !S.detail.id) return;
        const o = orders().find(x => x.id === S.detail.id);
        if (o) ta.value = teksOrder(o, S.sub);
    }

    async function simpanStatusKirim(id, status) {
        const o = orders().find(x => x.id === id);
        if (!o) return;
        try {
            await deps.setStatusKirim(o, status);
            deps.patchOrder(id, { statusKirim: status });
            deps.toast('STATUS PENGIRIMAN: ' + STATUS_KIRIM[status].toUpperCase() + ' ✓');
        } catch (e) { console.error(e); deps.toast('GAGAL: ' + deps.errMsg(e), true); }
        refresh(true);
    }
    async function simpanResi(id, hapus) {
        const o = orders().find(x => x.id === id);
        if (!o) return;
        const val = hapus ? '' : ($('dResi').value || '').trim();
        if (!hapus && !val) return deps.toast('ISI NOMOR RESI DULU!', true);
        if (hapus && !confirm(`Hapus resi ${o.resi} dari ${idOf(o)}?\n\nDi sisi pelanggan kembali tampil "Pesanan anda belum dikirim".`)) return;
        try {
            const r = await deps.simpanResi(o, val);                       // fungsi yang sudah ada (order + lacak + timeline)
            if ($('dResi')) $('dResi').value = r.resi;
            deps.patchOrder(id, { resi: r.resi, resiAt: r.resiAt || null });
            // resi terisi => "Sudah dikirim"; resi dihapus (dan tadinya "Sudah dikirim") => kembali "Siap dikirim"
            if (r.resi && o.statusKirim !== 'dikirim') { await deps.setStatusKirim(o, 'dikirim'); deps.patchOrder(id, { statusKirim: 'dikirim' }); }
            else if (!r.resi && statusKirimOf(o) === 'dikirim') { await deps.setStatusKirim(o, 'siap'); deps.patchOrder(id, { statusKirim: 'siap' }); }
            deps.toast(r.resi ? 'RESI DISIMPAN ✓' : 'RESI DIHAPUS');
        } catch (e) { console.error(e); deps.toast('GAGAL SIMPAN RESI: ' + deps.errMsg(e), true); }
        refresh(true);
    }

    /* =================== EVENT & REFRESH =================== */
    function onClick(e) {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const act = el.dataset.act, id = el.dataset.id, sub = el.dataset.sub;
        if (act === 'sel') return;                                   // ditangani event 'change'
        if ((act === 'row-rekap' || act === 'row-kirim') && e.target.closest('[data-stop]')) return;
        switch (act) {
            case 'row-rekap': return openDetail(id, 'rekap');
            case 'row-kirim': case 'detail': return openDetail(id, 'kirim');
            case 'open-other': return openDetail(id, el.dataset.mode);
            case 'close-detail': return closeDetail();
            case 'sub': return switchSub(sub);
            case 'reload': return deps.reload();
            case 'salin-rekap': { const r = S.rekap.rekaps[Number(el.dataset.i)]; return r && salin(teksRekap(r), 'REKAP TERSALIN ✓'); }
            case 'copy-one': return salinSatu(id, sub);
            case 'copy-bulk': return salinBanyak(sub);
            case 'bulk-status': return bulkStatus(sub);
            case 'copy-preview': return salinSatu(id, sub);
            case 'save-resi': return simpanResi(id, false);
            case 'del-resi': return simpanResi(id, true);
            case 'cfg-reset':
                S.cfg = { ...CFG_DEFAULT }; saveCfg();
                document.querySelectorAll('[data-cfg]').forEach(i => { i.value = S.cfg[i.dataset.cfg]; });
                refreshPreview(); return deps.toast('PENGATURAN DIKEMBALIKAN KE DEFAULT');
        }
    }
    function onChange(e) {
        const t = e.target;
        if (t.matches('input[data-act="sel"]')) {
            const st = S.kirim[t.dataset.sub];
            t.checked ? st.sel.add(t.dataset.id) : st.sel.delete(t.dataset.id);
            t.closest('.rk-row').classList.toggle('picked', t.checked);
            updateSelUI(t.dataset.sub);
        } else if (t.id === 'dStatusKirim') {
            simpanStatusKirim(t.dataset.id, t.value);
        }
    }

    function refresh(force) {
        const aktif = id => { const el = $(id); return el && el.classList.contains('active'); };
        if (aktif('tab-rekap')) {
            const ae = document.activeElement;
            if (force || !(ae && ae.id === 'rkQ')) renderRekap();
        }
        if (aktif('tab-kirim')) renderKirim();
        if (S.detail.id) {
            const ae = document.activeElement;
            const mengetik = ae && $('rkDetailBody').contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName);
            if (force || !mengetik) renderDetail();      // jangan menimpa resi yang sedang diketik oleh pembaruan latar belakang
        }
    }

    // init
    buildRekap();
    buildKirim();
    document.addEventListener('click', e => {
        if (e.target.id === 'modalRkDetail') return closeDetail();   // klik area gelap di luar kotak
        if (e.target.closest('#rekapRoot, #kirimRoot, #modalRkDetail')) onClick(e);
    });
    document.addEventListener('change', e => { if (e.target.closest('#kirimRoot, #modalRkDetail')) onChange(e); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.detail.id) closeDetail(); });
    return { refresh };
}
