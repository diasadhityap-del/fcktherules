import {
    adminAuth, loginAdmin, logoutAdmin, getOrders, updateOrderStatus,
    getProduk, saveProduk, updateProduk, deleteProduk,
    getGaleri, saveGaleri, deleteGaleri, updateGaleri, uploadGambar,
    listenBanners, saveBanner, updateBanner, deleteBanner,
    listenBannerText, saveBannerText,
    listenVouchers, saveVoucher, deleteVoucher,
    listenCustomers, deleteCustomer,
    listenPelunasan, adminSimpanResi, adminKodeLacakAda, adminEditHarga, adminSimpanDP, adminLunaskan, adminSetStatus, buatKodePelunasan, buatOrderNo, bersihkanPrefix,
    listenPoTrack, adminTutupPo, adminHapusLacak,
    adminBackfillOrder, turunanPO, tsMillis,
    listenPoUpdates, adminTambahUpdatePo, adminHapusUpdatePo, adminBackfillPoUpdates
} from './firebase.js?v=20261013';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { adminDb } from "./firebase.js?v=20261013";

let allOrders = [];
let allProduk = [];
let allGaleri = [];
let allBanners = [];
let allVouchers = [];
let allCustomers = [];
let allPelunasan = [];
let allPoTrack = [];
const pelByOrder = () => Object.fromEntries(allPelunasan.map(p => [p.orderId, p]));
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

let currentFilter = 'semua';
let currentProdukFilter = 'semua';
let editingProdukId = null;
let editingBannerId = null;

// ===== AUTH =====
onAuthStateChanged(adminAuth, async (user) => {
    if (user) {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('adminPage').style.display = 'block';
        console.log('Login admin sebagai:', user.email);
        showToast('LOGIN SEBAGAI: ' + user.email);

        await Promise.all([
            loadOrders(),
            loadProduk(),
            loadGaleri(),
            loadBanners(),
            loadVouchers()
        ]);
        loadCustomersList();
        autoSinkron();
        listenPelunasan(data => { allPelunasan = data; renderOrders(); });
        listenPoTrack(data => { allPoTrack = data; renderPoAdmin(); });
    } else {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('adminPage').style.display = 'none';
    }
});

window.doLogin = async () => {
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPass').value;
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginErr');

    err.style.display = 'none';
    btn.disabled = true;
    btn.innerText = 'MASUK...';

    const ok = await loginAdmin(email, pass);
    if (!ok) {
        err.style.display = 'block';
        btn.disabled = false;
        btn.innerText = 'MASUK';
    }
};

window.doLogout = async () => { await logoutAdmin(); };

// ===== TOAST =====
window.showToast = (msg, isErr = false) => {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
};

// ===== TABS =====
window.switchTab = (tab) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.mob-nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    const navEl = document.getElementById('nav-' + tab);
    const mobEl = document.getElementById('mob-' + tab);
    if (navEl) navEl.classList.add('active');
    if (mobEl) mobEl.classList.add('active');
};

// ===== ORDER =====
async function loadOrders() {
    allOrders = await getOrders();
    allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    isiFilterProduk();
    renderOrders();
    renderPoAdmin();
    // Render ulang tab Member/Pembeli HANYA kalau data customer dari Firebase
    // sudah pernah berhasil dimuat sebelumnya (bukan array kosong bawaan).
    // Sebelumnya kondisi ini selalu true, jadi bisa nge-render "Belum ada member"
    // padahal sebenarnya listenCustomers() belum/gagal mengambil data.
    if (customersLoaded) renderCustomers();
}

window.filterOrder = (filter, el) => {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderOrders();
};

function isiFilterProduk() {
    const select = document.getElementById('filterProduk');
    if (!select) return;
    const produkUnik = [...new Set(allOrders.flatMap(o => {
        if (Array.isArray(o.produk)) return o.produk.map(p => p.nama);
        return [o.produk];
    }))];
    select.innerHTML = `<option value="semua">Semua Produk</option>`;
    produkUnik.forEach(nama => {
        select.innerHTML += `<option value="${nama}">${nama}</option>`;
    });
}

window.filterProdukOrder = (produk) => {
    currentProdukFilter = produk;
    renderOrders();
};

const uiHarga = {};         // orderId -> true: form edit harga terbuka
const uiDP = {};            // orderId -> true: admin memilih status DP, nominal belum disimpan
const poUpd = {}, poUpdUnsub = {};    // update per ARTIKEL: produkId -> daftar update
function ensurePoUpdSubs(pids) {
    (pids || []).forEach(pid => {
        if (poUpdUnsub[pid]) return;
        poUpdUnsub[pid] = listenPoUpdates(pid, list => { poUpd[pid] = list; renderPoUpdBox(pid); });
    });
}
const $ = id => document.getElementById(id);
const errMsg = e => (e && e.code === 'permission-denied')
    ? 'DITOLAK FIREBASE — publish firestore.rules terbaru di Firebase Console dulu'
    : ((e && (e.code || e.message)) || 'error');
const idOrder = o => o.kodePelunasan || o.orderNo || o.id;
const artikelOrder = o => namaProdukText(o) || '-';
const isPoOrder = o => turunanPO(o, allProduk).isPO;

window.renderOrders = (force) => {
    const list = $('orderList');
    if (!list) return;
    const ae = document.activeElement;
    if (!force && ae && list.contains(ae) && ae.tagName === 'INPUT') return;   // jangan timpa yang sedang diketik

    let filtered = currentFilter === 'semua' ? allOrders : allOrders.filter(o => (o.status || 'pending') === currentFilter);
    if (currentProdukFilter !== 'semua') {
        filtered = filtered.filter(o => Array.isArray(o.produk) ? o.produk.some(p => p.nama === currentProdukFilter) : o.produk === currentProdukFilter);
    }
    if (!filtered.length) {
        list.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><p>Belum ada order</p></div>`;
        return;
    }
    const pelMap = pelByOrder();
    list.innerHTML = filtered.map(o => orderCardHTML(o, pelMap[o.id])).join('');   // terbaru -> terlama
};

function orderCardHTML(o, pel) {
    const total = totalOrder(o);
    const status = o.status || 'pending';
    const uiStatus = uiDP[o.id] ? 'dp' : status;
    const dpNom = Number(o.dpNominal || 0);
    const po = isPoOrder(o);
    const date = new Date(o.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    let sc = 's-pending', st = 'PENDING';
    if (status === 'lunas') { sc = 's-approved'; st = 'LUNAS'; }
    if (status === 'dp') { sc = 's-approved'; st = 'DP'; }
    if (status === 'rejected') { sc = 's-rejected'; st = 'DITOLAK'; }

    const produkHTML = Array.isArray(o.produk)
        ? o.produk.map(p => `<div class="info-item">Produk <span>${esc(p.nama)}</span></div><div class="info-item">Warna / Size <span>${esc(p.warna)} / ${esc(p.size)}</span></div>`).join('')
        : `<div class="info-item">Produk <span>${esc(o.produk)}</span></div><div class="info-item">Warna / Size <span>${esc(o.warna)} / ${esc(o.size)}</span></div>`;
    const voucherHTML = o.voucherKode ? `<div class="info-item" style="color:var(--yellow)">Voucher Dipakai <span>${esc(o.voucherKode)}</span></div><div class="info-item" style="color:var(--yellow)">Ket. Diskon <span>${esc(o.voucherDeskripsi)}</span></div>` : '';

    const dpBlock = uiStatus === 'dp' ? `
        <div style="margin-top:14px;border-top:1px solid #1a1a1a;padding-top:14px;">
            <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
                <div style="flex:1;min-width:150px;">
                    <div style="font-size:10px;letter-spacing:.1em;color:#888;margin-bottom:6px;">NOMINAL DP (Rp)</div>
                    <input type="text" inputmode="numeric" id="dpInput-${o.id}" value="${dpNom ? dpNom.toLocaleString('id-ID') : ''}" placeholder="mis. 70.000" oninput="hitungSisaDP('${o.id}')"
                        style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:14px;">
                </div>
                <div style="flex:1;min-width:150px;">
                    <div style="font-size:10px;letter-spacing:.1em;color:#888;margin-bottom:6px;">SISA (OTOMATIS)</div>
                    <div id="dpSisa-${o.id}" data-total="${total}" style="padding:12px 0;font-weight:700;font-size:16px;color:var(--green)">${dpNom ? rp(total - dpNom) : '-'}</div>
                </div>
            </div>
            <button onclick="simpanDP('${o.id}')" class="btn-sm btn-approve" style="margin-top:12px;width:100%;cursor:pointer;"><i class="fas fa-save"></i> ${status === 'dp' ? 'UPDATE DP' : 'SIMPAN DP'}</button>
            ${status !== 'dp' ? '<div style="font-size:11px;color:#888;margin-top:8px">Status baru berubah menjadi DP setelah nominal disimpan.</div>' : ''}
        </div>` : '';

    const verifBlock = (pel && pel.status === 'menunggu_verifikasi' && status === 'dp') ? `
        <div style="margin-top:14px;border:1px solid var(--yellow);padding:14px;">
            <div style="font-size:12px;color:var(--yellow);font-weight:700;margin-bottom:6px;">BUKTI PELUNASAN MASUK</div>
            <div style="font-size:12px;color:#ccc;margin-bottom:10px;">Cek bukti: nominal harus <b>${rp(o.sisaBayar)}</b>. Setelah diverifikasi, status otomatis DP → LUNAS dan timeline "Pelunasan" terbuat.</div>
            <button onclick="lunaskanOrder('${o.id}')" class="btn-sm btn-approve" style="width:100%;cursor:pointer;"><i class="fas fa-check"></i> VERIFIKASI &amp; LUNASKAN</button>
        </div>` : '';

    const hargaBlock = uiHarga[o.id] ? `
        <div style="margin-top:14px;border-top:1px solid #1a1a1a;padding-top:14px;">
            <div style="font-size:10px;letter-spacing:.1em;color:#888;margin-bottom:10px;">EDIT HARGA ORDER</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <div style="flex:1;min-width:120px;"><div style="font-size:10px;color:#888;margin-bottom:6px;">HARGA KAOS (Rp)</div>
                    <input type="text" inputmode="numeric" id="hgKaos-${o.id}" value="${o.hargaKaos ? Number(o.hargaKaos).toLocaleString('id-ID') : ''}" oninput="hitungTotalHarga('${o.id}')" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:14px;"></div>
                <div style="flex:1;min-width:120px;"><div style="font-size:10px;color:#888;margin-bottom:6px;">ONGKIR (Rp)</div>
                    <input type="text" inputmode="numeric" id="hgOngkir-${o.id}" value="${o.ongkir ? Number(o.ongkir).toLocaleString('id-ID') : ''}" oninput="hitungTotalHarga('${o.id}')" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:14px;"></div>
                <div style="flex:1;min-width:120px;"><div style="font-size:10px;color:#888;margin-bottom:6px;">DISKON (Rp, opsional)</div>
                    <input type="text" inputmode="numeric" id="hgDiskon-${o.id}" value="${o.diskon ? Number(o.diskon).toLocaleString('id-ID') : ''}" oninput="hitungTotalHarga('${o.id}')" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:14px;"></div>
            </div>
            <div style="margin-top:10px;font-size:12px;color:#888;">TOTAL (OTOMATIS): <b id="hgTotal-${o.id}" style="color:var(--green);font-size:16px;">${total ? rp(total) : '-'}</b>${status === 'dp' ? ` · DP ${rp(dpNom)}` : ''}</div>
            <div style="display:flex;gap:10px;margin-top:12px;">
                <button onclick="simpanHarga('${o.id}')" class="btn-sm btn-approve" style="flex:1;cursor:pointer;"><i class="fas fa-save"></i> SIMPAN HARGA</button>
                <button onclick="tutupEditHarga('${o.id}')" class="btn-sm" style="cursor:pointer;background:#111;color:#ccc;border:1px solid #333;">BATAL</button>
            </div>
        </div>` : `
        <div style="margin-top:14px;"><button onclick="bukaEditHarga('${o.id}')" class="btn-sm btn-bukti" style="cursor:pointer;width:100%;padding:11px;"><i class="fas fa-pen"></i> EDIT HARGA / ONGKIR</button></div>`;

    const resiBlock = (status === 'dp' || status === 'lunas') ? `
        <div style="margin-top:14px;border-top:1px solid #1a1a1a;padding-top:14px;">
            <div style="font-size:10px;letter-spacing:.1em;color:#888;margin-bottom:6px;">NOMOR RESI ${o.resi ? '· SUDAH DIUNGGAH' : '· BELUM DIUNGGAH'}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <input type="text" id="resiInput-${o.id}" value="${esc(o.resi || '')}" placeholder="mis. JP1234567890" autocomplete="off" maxlength="60"
                    style="flex:1;min-width:150px;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:14px;">
                <button onclick="simpanResi('${o.id}')" class="btn-sm btn-approve" style="cursor:pointer;"><i class="fas fa-truck"></i> ${o.resi ? 'UPDATE RESI' : 'SIMPAN RESI'}</button>
                ${o.resi ? `<button onclick="hapusResi('${o.id}')" class="btn-sm" style="cursor:pointer;background:rgba(255,59,59,0.08);color:#ff4d4d;border:1px solid rgba(255,59,59,0.15);"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>` : '';

    return `
    <div class="order-card">
        <div class="order-top">
            <div>
                <div class="order-name">${esc(o.nama)}</div>
                <div class="order-time" style="color:var(--green)">ID ORDER: <b style="user-select:all;letter-spacing:.08em">${esc(idOrder(o))}</b>${po ? ' · PRE ORDER' : ' · READY STOCK'}</div>
                <div class="order-time">${esc(artikelOrder(o))}</div>
                <div class="order-time">${date}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <button onclick="hapusOrder('${o.id}')" title="Hapus order" style="width:38px;height:38px;border:1px solid rgba(255,59,59,0.15);border-radius:10px;background:rgba(255,59,59,0.08);color:#ff4d4d;cursor:pointer;"><i class="fas fa-trash"></i></button>
                <div class="status-badge ${sc}">${st}</div>
            </div>
        </div>
        <div class="order-info">
            ${produkHTML}
            ${o.email ? `<div class="info-item">Email <span>${esc(o.email)}</span></div>` : ''}
            <div class="info-item">Harga Kaos <span>${o.hargaKaos ? rp(o.hargaKaos) : '-'}</span></div>
            <div class="info-item">Ongkir <span>${o.ongkir ? rp(o.ongkir) : '-'}</span></div>
            ${voucherHTML}
            <div class="info-item">WhatsApp <span>${esc(o.wa)}</span></div>
            <div class="info-item">Alamat <span>${esc(o.alamat)}</span></div>
            <div class="info-item" style="color:var(--green)">TOTAL <span>${rp(total)}</span></div>
            ${status === 'dp' && dpNom ? `<div class="info-item">DP Dibayar <span>${rp(dpNom)}</span></div><div class="info-item">Sisa <span>${rp(o.sisaBayar)}</span></div>` : ''}
        </div>
        <div class="order-actions" style="display:flex;gap:10px;align-items:center;border-top:1px solid #1a1a1a;padding-top:15px;flex-wrap:wrap;">
            ${o.buktiURL ? `<a href="${esc(o.buktiURL)}" target="_blank" class="btn-sm btn-bukti" style="flex:1;text-align:center;"><i class="fas fa-image"></i> BUKTI 1</a>` : ''}
            ${(pel && pel.buktiPelunasanURL) ? `<a href="${esc(pel.buktiPelunasanURL)}" target="_blank" class="btn-sm btn-bukti" style="flex:1;text-align:center;"><i class="fas fa-image"></i> BUKTI 2</a>` : ''}
            <select onchange="gantiStatusOrder('${o.id}', this.value)" style="flex:1;min-width:140px;background:#111;color:#fff;border:1px solid #333;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;cursor:pointer;outline:none;">
                <option value="pending" ${uiStatus === 'pending' ? 'selected' : ''}>⏳ PENDING</option>
                <option value="dp" ${uiStatus === 'dp' ? 'selected' : ''}>💳 DP</option>
                <option value="lunas" ${uiStatus === 'lunas' ? 'selected' : ''}>✅ LUNAS</option>
                <option value="rejected" ${uiStatus === 'rejected' ? 'selected' : ''}>❌ DITOLAK</option>
            </select>
        </div>
        ${dpBlock}
        ${verifBlock}
        ${hargaBlock}
        ${resiBlock}
    </div>`;
}

window.filterOrder = (filter, el) => {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderOrders(true);
};

window.hitungSisaDP = (id) => {
    const inp = $('dpInput-' + id), out = $('dpSisa-' + id);
    if (!inp || !out) return;
    const nom = Number(inp.value.replace(/\D/g, '')) || 0;
    inp.value = nom ? nom.toLocaleString('id-ID') : '';
    const total = Number(out.dataset.total) || 0;
    out.innerText = nom ? rp(total - nom) : '-';
    out.style.color = (total - nom) < 0 ? 'var(--red)' : 'var(--green)';
};

window.simpanDP = async (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    const nom = Number(($('dpInput-' + id).value || '').replace(/\D/g, '')) || 0;
    const total = totalOrder(o);
    if (nom <= 0) return showToast('ISI NOMINAL DP DULU!', true);
    if (nom >= total) return showToast('DP TIDAK BOLEH >= TOTAL. Kalau sudah full, pilih LUNAS.', true);
    try {
        const kode = o.kodePelunasan || buatKodePelunasan(prefixUntukOrder(o));   // order lama tanpa ID: ID dibuat sekali di sini
        const orderNo = o.orderNo || buatOrderNo(namaProdukText(o));
        const { sisa } = await adminSimpanDP(o, nom, kode, orderNo);
        delete uiDP[id];
        allOrders = allOrders.map(x => x.id === id ? { ...x, status: 'dp', dpNominal: nom, sisaBayar: sisa, kodePelunasan: kode, orderNo } : x);
        renderOrders(true);
        showToast('DP DISIMPAN ✓ SISA ' + rp(sisa));
    } catch (e) {
        console.error(e);
        showToast('GAGAL SIMPAN DP: ' + errMsg(e), true);
    }
};

const angkaDari = id => Number((($(id) || {}).value || '').replace(/\D/g, '')) || 0;
window.bukaEditHarga = (id) => { uiHarga[id] = true; renderOrders(true); };
window.tutupEditHarga = (id) => { delete uiHarga[id]; renderOrders(true); };
window.hitungTotalHarga = (id) => {
    ['hgKaos-', 'hgOngkir-', 'hgDiskon-'].forEach(pf => {
        const el = $(pf + id); if (!el) return;
        const n = Number(el.value.replace(/\D/g, '')) || 0;
        el.value = n ? n.toLocaleString('id-ID') : '';
    });
    const t = angkaDari('hgKaos-' + id) + angkaDari('hgOngkir-' + id) - angkaDari('hgDiskon-' + id);
    const out = $('hgTotal-' + id);
    if (out) { out.innerText = t > 0 ? rp(t) : '-'; out.style.color = t > 0 ? 'var(--green)' : 'var(--red)'; }
};
window.simpanHarga = async (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    const kaos = angkaDari('hgKaos-' + id), ongkir = angkaDari('hgOngkir-' + id), diskon = angkaDari('hgDiskon-' + id);
    if (kaos <= 0) return showToast('ISI HARGA KAOS DULU!', true);
    try {
        const r = await adminEditHarga(o, kaos, ongkir, diskon);
        allOrders = allOrders.map(x => x.id === id ? { ...x, hargaKaos: kaos, ongkir, diskon, totalAkhir: r.total, ...(r.sisa != null ? { sisaBayar: r.sisa } : {}) } : x);
        delete uiHarga[id];
        showToast('HARGA DISIMPAN ✓ TOTAL ' + rp(r.total));
    } catch (e) {
        console.error(e);
        showToast('GAGAL: ' + errMsg(e), true);
    }
    renderOrders(true);
};

window.simpanResi = async (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    const val = ($('resiInput-' + id).value || '').trim();
    if (!val) return showToast('ISI NOMOR RESI DULU!', true);
    try {
        const r = await adminSimpanResi(o, val);
        allOrders = allOrders.map(x => x.id === id ? { ...x, resi: r.resi, resiAt: r.resiAt } : x);
        showToast('RESI DISIMPAN ✓');
    } catch (e) {
        console.error(e);
        showToast('GAGAL SIMPAN RESI: ' + errMsg(e), true);
    }
    renderOrders(true);
};

window.hapusResi = async (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    if (!confirm(`Hapus resi ${o.resi} dari ${idOrder(o)}?\n\nDi sisi pelanggan kembali tampil "Pesanan anda belum dikirim".`)) return;
    try {
        await adminSimpanResi(o, '');
        allOrders = allOrders.map(x => x.id === id ? { ...x, resi: '', resiAt: null } : x);
        showToast('RESI DIHAPUS');
    } catch (e) {
        console.error(e);
        showToast('GAGAL HAPUS RESI: ' + errMsg(e), true);
    }
    renderOrders(true);
};

window.gantiStatusOrder = async (id, statusBaru) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    const lama = o.status || 'pending';
    if (statusBaru === 'dp') {
        if (lama === 'dp') { delete uiDP[id]; return renderOrders(true); }
        uiDP[id] = true;           // tampilkan input nominal DP; status disimpan bersama nominal
        return renderOrders(true);
    }
    delete uiDP[id];
    if (statusBaru === lama) return renderOrders(true);
    if (statusBaru === 'lunas') return window.lunaskanOrder(id);
    try {
        await adminSetStatus(o, statusBaru);
        allOrders = allOrders.map(x => x.id === id ? { ...x, status: statusBaru } : x);
        showToast('STATUS DIPERBARUI ✓');
    } catch (e) {
        console.error(e);
        showToast('GAGAL UPDATE STATUS!', true);
    }
    renderOrders(true);
};

window.lunaskanOrder = async (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    const msg = o.status === 'dp'
        ? `Verifikasi pelunasan ${idOrder(o)}?\n\nSisa ${rp(o.sisaBayar)} dianggap sudah dibayar. Status jadi LUNAS dan timeline "Pelunasan" dibuat otomatis (sekali saja).`
        : `Tandai ${idOrder(o)} LUNAS?`;
    if (!confirm(msg)) { delete uiDP[id]; return renderOrders(true); }
    try {
        const r = await adminLunaskan(id);
        allOrders = allOrders.map(x => x.id === id ? { ...x, status: 'lunas', sisaBayar: 0 } : x);
        showToast(r.changed ? 'ORDER LUNAS ✓' : 'ORDER SUDAH LUNAS');
    } catch (e) {
        console.error(e);
        showToast('GAGAL: ' + errMsg(e), true);
    }
    renderOrders(true);
};

// Sekali per sesi admin: order lama yang belum punya ID / belum dikenali sebagai Pre Order disinkronkan otomatis
// (aman diulang, tidak membuat order baru, tidak menghapus apa pun).
let autoSinkronJalan = false;
async function autoSinkron() {
    if (autoSinkronJalan) return;
    autoSinkronJalan = true;
    let adaLacak = null;
    try { adaLacak = await adminKodeLacakAda(); } catch (e) { console.error('cek lacak', e); }
    const perlu = allOrders.filter(o => {
        const t = turunanPO(o, allProduk);
        return !o.kodePelunasan || o.isPO !== t.isPO || (o.poIds || []).length !== t.poIds.length
            || (adaLacak && o.kodePelunasan && !adaLacak.has(o.kodePelunasan));   // order tanpa data pelacakan => belum bisa dicek pelanggan
    });
    if (!perlu.length) return;
    let ok = 0;
    for (const o of perlu) {
        try { await adminBackfillOrder(o, syncCtx()); ok++; } catch (e) { console.error('autoSinkron', o.id, e); }
    }
    await loadOrders();
    showToast(`${ok} ORDER LAMA DISINKRONKAN ✓`);
}
const syncCtx = () => ({ produkList: allProduk, poTrackMap: Object.fromEntries(allPoTrack.map(t => [t.id, t])) });
window.sinkronSemuaOrder = async () => {
    if (!confirm(`Sinkronkan ${allOrders.length} order?\n\nOrder tanpa ID akan diberi ID; timeline "Pesanan dibuat"/"Pelunasan" dan langkah lama dilengkapi. Tidak membuat order baru, tidak menghapus apa pun, aman diulang.`)) return;
    let ok = 0, gagal = 0, galatPertama = '';
    for (const o of allOrders) {
        try { await adminBackfillOrder(o, syncCtx()); ok++; } catch (e) { console.error(o.id, e); gagal++; if (!galatPertama) galatPertama = errMsg(e); }
    }
    try { await adminBackfillPoUpdates(syncCtx().poTrackMap); } catch (e) { console.error(e); }
    await loadOrders();
    showToast(`SINKRON SELESAI: ${ok} OK${gagal ? ', ' + gagal + ' GAGAL (' + galatPertama + ')' : ''}`, gagal > 0);
};

window.hapusOrder = async (id) => {
    if (!confirm("Hapus order ini beserta timeline-nya? (tidak bisa dibatalkan)")) return;
    try {
        const oHapus = allOrders.find(x => x.id === id);
        await deleteDoc(doc(adminDb, "orders", id));
        if (oHapus && oHapus.kodePelunasan) await adminHapusLacak(oHapus.kodePelunasan);
        allOrders = allOrders.filter(o => o.id !== id);
        isiFilterProduk();
        renderOrders(true);
        renderCustomers();
        showToast("ORDER DIHAPUS");
    } catch (err) {
        console.error(err);
        alert("Gagal hapus order");
    }
};

window.hapusProdukOrder = async () => {
    const yakin = confirm("Hapus semua order sesuai filter?");
    if (!yakin) return;
    try {
        const data = allOrders.filter(o =>
            (currentProdukFilter === 'semua' || (Array.isArray(o.produk) ? o.produk.some(p => p.nama === currentProdukFilter) : o.produk === currentProdukFilter))
        );
        if (data.length === 0) return alert("Tidak ada order untuk dihapus");
        for (const order of data) {
            await deleteDoc(doc(adminDb, "orders", order.id));
            if (order.kodePelunasan) await adminHapusLacak(order.kodePelunasan);
        }
        showToast(`${data.length} ORDER DIHAPUS`);
        await loadOrders();
    } catch(err) {
        console.error(err);
        alert("Gagal hapus");
    }
};

// ===== PRODUK =====
async function loadProduk() {
    allProduk = await getProduk();
    renderProduk();
    renderPoAdmin();
}

function renderProduk() {
    const list = document.getElementById('produkList');
    const sortedProduk = [...allProduk].sort((a, b) => (b.order || 0) - (a.order || 0));

    if (sortedProduk.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-tshirt"></i><p>Belum ada produk</p></div>`;
        return;
    }

    list.innerHTML = `
        <div class="produk-grid">
            ${sortedProduk.map(p => `
            <div class="produk-card">
                <img src="${p.thumbnail || ''}" onerror="this.src=''">
                <div class="produk-info">
                    <div class="produk-badge badge-${p.badge}">${p.status || p.badge}</div>
                    <div class="produk-name">${p.nama}</div>
                    <div class="produk-price">Rp${Number(String(p.harga).replace(/\D/g,'')).toLocaleString('id-ID')}</div>
                    <div class="produk-actions">
                        <div class="btn-icon" onclick="moveProdukUp('${p.id}')">↑</div>
                        <div class="btn-icon" onclick="moveProdukDown('${p.id}')">↓</div>
                        <div class="btn-icon" onclick="editProduk('${p.id}')"><i class="fas fa-pen"></i></div>
                        <div class="btn-icon del" onclick="hapusProduk('${p.id}')"><i class="fas fa-trash"></i></div>
                    </div>
                </div>
            </div>`).join('')}
        </div>`;
}

window.openModalProduk = () => {
    editingProdukId = null;
    document.getElementById('modalProdukTitle').innerText = 'TAMBAH PRODUK';
    document.getElementById('pNama').value = '';
    document.getElementById('pHarga').value = '';
    document.getElementById('pBadge').value = 'pre';
    document.getElementById('pStatus').value = '';
    document.getElementById('pWarna').value = '';
    document.getElementById('pStok').value = '';
    document.getElementById('pSpecs').value = '';
    document.getElementById('pShowcase').value = 'yes';
    document.getElementById('pDP').value = 'yes';
    document.getElementById('pKode').value = '';
    toggleKodeProduk();
    document.getElementById('prevThumb').style.display = 'none';
    [0,1,2,3,4].forEach(i => {
        const img = document.getElementById('prevDet'+i);
        img.src = '';
        img.style.display = 'none';
    });
    document.getElementById('modalProduk').classList.add('show');
};

window.closeModalProduk = () => { document.getElementById('modalProduk').classList.remove('show'); };

window.editProduk = (id) => {
    const p = allProduk.find(x => x.id === id);
    if (!p) return;
    editingProdukId = id;
    document.getElementById('modalProdukTitle').innerText = 'EDIT PRODUK';
    document.getElementById('pNama').value = p.nama || '';
    document.getElementById('pHarga').value = p.harga || '';
    document.getElementById('pBadge').value = p.badge || 'pre';
    document.getElementById('pStatus').value = p.status || '';
    document.getElementById('pWarna').value = p.warna || '';
    document.getElementById('pStok').value = p.stok || '';
    document.getElementById('pSpecs').value = p.specs || '';
    document.getElementById('pShowcase').value = p.showcase || 'yes';
    document.getElementById('pDP').value = p.dpAllowed || 'yes';
    document.getElementById('pKode').value = p.kodePrefix || '';
    toggleKodeProduk();

    const thumb = document.getElementById('prevThumb');
    if (p.thumbnail) { thumb.src = p.thumbnail; thumb.style.display = 'block'; }

    const details = p.details || [];
    [0,1,2,3,4].forEach(i => {
        const img = document.getElementById('prevDet'+i);
        if (details[i]) { img.src = details[i]; img.style.display = 'block'; }
        else { img.src = ''; img.style.display = 'none'; }
    });

    document.getElementById('modalProduk').classList.add('show');
};

window.saveProdukData = async () => {
    if (document.getElementById('pBadge').value === 'pre' && !bersihkanPrefix(document.getElementById('pKode').value)) {
        return showToast('KODE AWAL ID ORDER WAJIB DIISI UNTUK PRE ORDER', true);
    }
    const btn = document.getElementById('btnSaveProduk');
    btn.disabled = true;
    btn.innerText = 'MENYIMPAN...';

    try {
        let thumbnailURL = editingProdukId ? (allProduk.find(x => x.id === editingProdukId)?.thumbnail || '') : '';
        const thumbFile = document.getElementById('inputThumb').files[0];
        if (thumbFile) thumbnailURL = await uploadGambar(thumbFile, 'produk');

        const details = [];
        const existing = editingProdukId ? (allProduk.find(x => x.id === editingProdukId)?.details || []) : [];
        for (let i = 0; i < 5; i++) {
            const file = document.getElementById('inputDet'+i).files[0];
            if (file) {
                const url = await uploadGambar(file, 'produk');
                if (url) details.push(url);
            } else if (existing[i]) {
                details.push(existing[i]);
            }
        }

        const data = {
            order: editingProdukId ? (allProduk.find(x => x.id === editingProdukId)?.order ?? 0) : Date.now(),
            nama: document.getElementById('pNama').value,
            harga: document.getElementById('pHarga').value,
            badge: document.getElementById('pBadge').value,
            status: document.getElementById('pStatus').value,
            warna: document.getElementById('pWarna').value,
            stok: document.getElementById('pStok').value,
            specs: document.getElementById('pSpecs').value,
            showcase: document.getElementById('pShowcase').value,
            dpAllowed: document.getElementById('pDP').value,
            kodePrefix: bersihkanPrefix(document.getElementById('pKode').value),
            thumbnail: thumbnailURL,
            details
        };

        if (editingProdukId) {
            await updateProduk(editingProdukId, data);
            showToast('PRODUK DIUPDATE ✓');
        } else {
            await saveProduk(data);
            showToast('PRODUK DITAMBAHKAN ✓');
        }

        closeModalProduk();
        await loadProduk();
    } catch (err) {
        console.error(err);
        showToast('GAGAL SIMPAN!', true);
    }
    btn.disabled = false;
    btn.innerText = 'SIMPAN';
};

window.hapusProduk = async (id) => {
    if (!confirm('Hapus produk ini?')) return;
    await deleteProduk(id);
    allProduk = allProduk.filter(p => p.id !== id);
    renderProduk();
    showToast('PRODUK DIHAPUS');
};

window.moveProdukUp = async (id) => {
    const sortedProduk = [...allProduk].sort((a, b) => (b.order || 0) - (a.order || 0));
    const index = sortedProduk.findIndex(p => p.id === id);
    if (index <= 0) return;
    const current = sortedProduk[index];
    const prev = sortedProduk[index - 1];
    const temp = current.order;
    await updateProduk(current.id, { order: prev.order });
    await updateProduk(prev.id, { order: temp });
    await loadProduk();
};

window.moveProdukDown = async (id) => {
    const sortedProduk = [...allProduk].sort((a, b) => (b.order || 0) - (a.order || 0));
    const index = sortedProduk.findIndex(p => p.id === id);
    if (index >= sortedProduk.length - 1) return;
    const current = sortedProduk[index];
    const next = sortedProduk[index + 1];
    const temp = current.order;
    await updateProduk(current.id, { order: next.order });
    await updateProduk(next.id, { order: temp });
    await loadProduk();
};

// ===== GALERI =====
async function loadGaleri() {
    allGaleri = await getGaleri();
    renderGaleri();
}

function renderGaleri() {
    const grid = document.getElementById('galeriGrid');
    grid.innerHTML = allGaleri.map(g => `
        <div class="galeri-item">
            <img src="${g.url}" loading="lazy">
            <div class="galeri-del" onclick="hapusGaleri('${g.id}')"><i class="fas fa-times"></i></div>
            <div class="galeri-move">
                <button onclick="moveGaleriUp('${g.id}')">↑</button>
                <button onclick="moveGaleriDown('${g.id}')">↓</button>
            </div>
        </div>
    `).join('');
}

window.uploadGaleriFoto = async (input) => {
    const files = [...input.files];
    if (!files.length) return;
    const overlay = document.getElementById('uploadOverlay');
    const text = document.getElementById('uploadText');
    overlay.style.display = 'flex';
    let success = 0;

    for (let i = 0; i < files.length; i++) {
        text.innerText = `MENGUPLOAD FOTO ${i + 1} / ${files.length}`;
        const file = files[i];
        const url = await uploadGambar(file, 'galeri');
        if (url) { await saveGaleri(url); success++; }
    }
    overlay.style.display = 'none';
    await loadGaleri();
    input.value = '';
    showToast(success + ' FOTO BERHASIL ✓');
};

window.hapusGaleri = async (id) => {
    await deleteGaleri(id);
    allGaleri = allGaleri.filter(g => g.id !== id);
    renderGaleri();
    showToast('FOTO DIHAPUS');
};

window.moveGaleriUp = async (id) => {
    const index = allGaleri.findIndex(g => g.id === id);
    if (index <= 0) return;
    const temp = allGaleri[index].order;
    await updateGaleri(allGaleri[index].id, { order: allGaleri[index-1].order });
    await updateGaleri(allGaleri[index-1].id, { order: temp });
    await loadGaleri();
};

window.moveGaleriDown = async (id) => {
    const index = allGaleri.findIndex(g => g.id === id);
    if (index >= allGaleri.length - 1) return;
    const temp = allGaleri[index].order;
    await updateGaleri(allGaleri[index].id, { order: allGaleri[index+1].order });
    await updateGaleri(allGaleri[index+1].id, { order: temp });
    await loadGaleri();
};

// ===== IMG PREVIEW =====
window.prevImgSlot = (input, previewId) => {
    const file = input.files[0];
    if (!file) return;
    const img = document.getElementById(previewId);
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; img.style.display = 'block'; };
    reader.readAsDataURL(file);
};

// ===== BANNERS =====
async function loadBanners() {
    listenBanners((data) => {
        allBanners = data;
        renderBanners();
    });
}

function renderBanners() {
    const list = document.getElementById('bannerList');
    if (allBanners.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-flag"></i><p>Belum ada banner</p></div>`;
        return;
    }
    list.innerHTML = `<div class="produk-grid">` + allBanners.map((b, i) => `
        <div class="produk-card">
            <img src="${b.image}" style="aspect-ratio: 16/9;">
            <div class="produk-info">
                <div class="produk-name">${b.title || 'Tanpa Judul'}</div>
                <div class="produk-actions" style="margin-top:10px;">
                    <div class="btn-icon" onclick="moveBannerUp('${b.id}', ${i})">↑</div>
                    <div class="btn-icon" onclick="moveBannerDown('${b.id}', ${i})">↓</div>
                    <div class="btn-icon" onclick="editBanner('${b.id}')"><i class="fas fa-pen"></i></div>
                    <div class="btn-icon del" onclick="hapusBanner('${b.id}')"><i class="fas fa-trash"></i></div>
                </div>
            </div>
        </div>
    `).join('') + `</div>`;
}

window.openModalBanner = () => {
    editingBannerId = null;
    document.getElementById('modalBannerTitle').innerText = 'TAMBAH BANNER';
    document.getElementById('bTitle').value = '';
    document.getElementById('bSub').value = '';
    document.getElementById('bLink').value = '';
    document.getElementById('prevBanner').src = '';
    document.getElementById('prevBanner').style.display = 'none';
    document.getElementById('modalBanner').classList.add('show');
};

window.closeModalBanner = () => { document.getElementById('modalBanner').classList.remove('show'); };

window.editBanner = (id) => {
    const b = allBanners.find(x => x.id === id);
    if (!b) return;
    editingBannerId = id;
    document.getElementById('modalBannerTitle').innerText = 'EDIT BANNER';
    document.getElementById('bTitle').value = b.title || '';
    document.getElementById('bSub').value = b.subtitle || '';
    document.getElementById('bLink').value = b.link || '';
    if(b.image) {
        document.getElementById('prevBanner').src = b.image;
        document.getElementById('prevBanner').style.display = 'block';
    }
    document.getElementById('modalBanner').classList.add('show');
};

window.saveBannerData = async () => {
    const btn = document.getElementById('btnSaveBanner');
    btn.disabled = true; btn.innerText = 'MENYIMPAN...';
    try {
        let imageURL = editingBannerId ? (allBanners.find(x => x.id === editingBannerId)?.image || '') : '';
        const file = document.getElementById('inputBanner').files[0];
        if (file) imageURL = await uploadGambar(file, 'galeri');
        if (!imageURL) throw new Error("Gambar wajib diisi!");

        const data = {
            title: document.getElementById('bTitle').value,
            subtitle: document.getElementById('bSub').value,
            link: document.getElementById('bLink').value,
            image: imageURL,
            order: editingBannerId ? allBanners.find(x => x.id === editingBannerId).order : Date.now()
        };

        if (editingBannerId) await updateBanner(editingBannerId, data);
        else await saveBanner(data);

        showToast('BANNER DISIMPAN ✓');
        closeModalBanner();
    } catch (err) { showToast('GAGAL SIMPAN!', true); }
    btn.disabled = false; btn.innerText = 'SIMPAN';
};

window.hapusBanner = async (id) => {
    if (!confirm('Hapus banner ini?')) return;
    await deleteBanner(id);
    showToast('BANNER DIHAPUS');
};

window.moveBannerUp = async (id, index) => {
    if (index <= 0) return;
    const temp = allBanners[index].order;
    await updateBanner(allBanners[index].id, { order: allBanners[index-1].order });
    await updateBanner(allBanners[index-1].id, { order: temp });
};

window.moveBannerDown = async (id, index) => {
    if (index >= allBanners.length - 1) return;
    const temp = allBanners[index].order;
    await updateBanner(allBanners[index].id, { order: allBanners[index+1].order });
    await updateBanner(allBanners[index+1].id, { order: temp });
};

// TEKS GARIS BANNER
listenBannerText((data) => {
    document.getElementById('bTextTop').value = data.topText || '';
    document.getElementById('bTextBottom').value = data.bottomText || '';
});

window.openModalBannerText = () => { document.getElementById('modalBannerText').classList.add('show'); };
window.closeModalBannerText = () => { document.getElementById('modalBannerText').classList.remove('show'); };

window.saveBannerTextData = async () => {
    const btn = document.getElementById('btnSaveBannerText');
    btn.disabled = true; btn.innerText = 'MENYIMPAN...';
    try {
        await saveBannerText({
            topText: document.getElementById('bTextTop').value,
            bottomText: document.getElementById('bTextBottom').value
        });
        showToast('TEKS BANNER DISIMPAN ✓');
        closeModalBannerText();
    } catch(err) { showToast('GAGAL SIMPAN!', true); }
    btn.disabled = false; btn.innerText = 'SIMPAN';
};

// ===== VOUCHER =====
async function loadVouchers() {
    listenVouchers(data => {
        allVouchers = data;
        renderVouchers();
    });
}

function renderVouchers() {
    const list = document.getElementById('voucherList');
    if (allVouchers.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-ticket-alt"></i><p>Belum ada voucher</p></div>`;
        return;
    }
    list.innerHTML = `<div class="produk-grid">` + allVouchers.map(v => {
        const isHabis = Number(v.kuota) <= 0;
        const badgeClass = isHabis ? 'badge-sold' : 'badge-pre';
        const badgeText = isHabis ? 'HABIS' : `KUOTA: ${v.kuota}`;
        let deskripsi = "Gratis Ongkir";
        if(v.tipe === 'nominal') deskripsi = `Diskon Rp${Number(v.nilai).toLocaleString('id-ID')}`;
        if(v.tipe === 'persen') deskripsi = `Diskon ${v.nilai}%`;

        return `
        <div class="produk-card" style="padding:15px; border-left:3px solid var(--green)">
            <div class="produk-badge ${badgeClass}" style="margin-bottom:10px;">${badgeText}</div>
            <div class="produk-name" style="font-size:18px; letter-spacing:1px; margin-bottom:5px;">${v.kode}</div>
            <div class="info-item" style="margin-bottom:15px; color:var(--green); font-size:11px; font-weight:700;">${deskripsi}</div>
            <div class="produk-actions">
                <div class="btn-icon del" onclick="hapusVoucher('${v.id}')"><i class="fas fa-trash"></i> HAPUS</div>
            </div>
        </div>`;
    }).join('') + `</div>`;
}

window.toggleNilaiVoucher = () => {
    const t = document.getElementById('vTipe').value;
    document.getElementById('wrapNilaiVoucher').style.display = (t === 'free_ongkir') ? 'none' : 'block';
};

window.openModalVoucher = () => {
    document.getElementById('vKode').value = '';
    document.getElementById('vTipe').value = 'free_ongkir';
    document.getElementById('vNilai').value = '';
    document.getElementById('vKuota').value = '';
    toggleNilaiVoucher();
    document.getElementById('modalVoucher').classList.add('show');
};

window.closeModalVoucher = () => document.getElementById('modalVoucher').classList.remove('show');

window.saveVoucherData = async () => {
    const kode = document.getElementById('vKode').value.trim().toUpperCase();
    const tipe = document.getElementById('vTipe').value;
    const nilai = document.getElementById('vNilai').value;
    const kuota = document.getElementById('vKuota').value;

    if(!kode || !kuota || (tipe !== 'free_ongkir' && !nilai)) return showToast('LENGKAPI DATA!', true);

    const btn = document.getElementById('btnSaveVoucher');
    btn.disabled = true; btn.innerText = "MENYIMPAN...";
    try {
        await saveVoucher({ kode, tipe, nilai: Number(nilai||0), kuota: Number(kuota) });
        showToast("VOUCHER DISIMPAN ✓");
        closeModalVoucher();
    } catch(e) { showToast("GAGAL SIMPAN", true); }
    btn.disabled = false; btn.innerText = "SIMPAN";
};

window.hapusVoucher = async (id) => {
    if(!confirm('Hapus voucher ini?')) return;
    try { await deleteVoucher(id); showToast("VOUCHER DIHAPUS"); }
    catch(e) { showToast("GAGAL HAPUS", true); }
};

let currentPelangganSubTab = 'member';
let memberDeleteMode = false;
let pembeliDeleteMode = false;

window.switchPelangganSubTab = (tab) => {
    currentPelangganSubTab = tab;
    document.getElementById('subtab-member-btn').classList.toggle('active', tab === 'member');
    document.getElementById('subtab-pembeli-btn').classList.toggle('active', tab === 'pembeli');
    document.getElementById('memberList').style.display = tab === 'member' ? 'block' : 'none';
    document.getElementById('pembeliList').style.display = tab === 'pembeli' ? 'block' : 'none';
    updatePelangganDeleteBtn();
};

// Tombol hapus di sebelah TAB PEMBELI: sekali pencet -> tampilkan icon x di tiap baris
// list yang sedang aktif. Pencet lagi -> icon x disembunyikan lagi (batal, tanpa menghapus apa pun).
window.togglePelangganDeleteMode = () => {
    if (currentPelangganSubTab === 'member') memberDeleteMode = !memberDeleteMode;
    else pembeliDeleteMode = !pembeliDeleteMode;
    updatePelangganDeleteBtn();
    renderCustomers();
};

function updatePelangganDeleteBtn() {
    const btn = document.getElementById('pelangganDeleteBtn');
    if (!btn) return;
    const active = currentPelangganSubTab === 'member' ? memberDeleteMode : pembeliDeleteMode;
    btn.classList.toggle('active-del', active);
}

// ===== CUSTOMER LIST =====
let customersLoaded = false;

async function loadCustomersList() {
    listenCustomers(
        (data) => {
            allCustomers = data;
            customersLoaded = true;
            renderCustomers();
        },
        (err) => {
            showToast('GAGAL AMBIL DATA MEMBER: ' + (err.code || err.message || 'unknown'), true);
            const errMsg = `<div class="empty"><i class="fas fa-triangle-exclamation"></i><p>Gagal memuat data<br>(${err.code || 'error'})</p></div>`;
            const memberList = document.getElementById('memberList');
            const pembeliList = document.getElementById('pembeliList');
            if (memberList) memberList.innerHTML = errMsg;
            if (pembeliList) pembeliList.innerHTML = errMsg;
        }
    );
}

function aggregateCustomers() {
    const map = {};

    allCustomers.forEach(c => {
        const key = (c.email || '').toLowerCase();
        if (!key) return;
        map[key] = map[key] || {
            email: c.email, uid: c.uid || c.id,
            registered: true, registeredAt: c.createdAt, lastLoginAt: c.lastLoginAt || null,
            purchaseCount: 0, totalSpent: 0, orders: []
        };
        map[key].registered = true;
        map[key].lastLoginAt = c.lastLoginAt || map[key].lastLoginAt;
    });

    allOrders.forEach(o => {
        const email = (o.email || '').toLowerCase();
        if (!email) return;
        map[email] = map[email] || {
            email: o.email, registered: false, lastLoginAt: null,
            purchaseCount: 0, totalSpent: 0, orders: []
        };
        map[email].purchaseCount++;
        map[email].totalSpent += Number(String(o.totalAkhir || 0).replace(/\D/g,''));
        map[email].orders.push(o);
    });

    return Object.values(map).sort((a, b) => b.purchaseCount - a.purchaseCount);
}

function safeIdFor(prefix, email) {
    return prefix + '-' + btoa(unescape(encodeURIComponent(email))).replace(/=/g,'').replace(/\//g,'_').replace(/\+/g,'-');
}

function formatTanggalWaktu(iso) {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return null; }
}

function renderCustomers() {
    renderMemberTab();
    renderPembeliTab();
}

// ── TAB MEMBER ──────────────────────────────────────────────
function renderMemberTab() {
    const list = document.getElementById('memberList');
    if (!list) return;

    const data = aggregateCustomers()
        .filter(c => c.registered)
        .sort((a, b) => (a.email || '').localeCompare(b.email || ''));

    if (data.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-users"></i><p>Belum ada member</p></div>`;
        return;
    }

    list.innerHTML = data.map(c => {
        const safeId = safeIdFor('mem', c.email);
        const lastLogin = formatTanggalWaktu(c.lastLoginAt) || 'Belum ada data login';

        const deleteArea = memberDeleteMode
            ? `<button onclick="event.stopPropagation(); confirmDeleteCustomer('member','${c.email}')" title="Hapus" style="width:34px; height:34px; border:none; background:var(--red); color:#fff; border-radius:10px; cursor:pointer; font-weight:900; font-size:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">&times;</button>`
            : '';

        return `
        <div class="order-card" style="padding:0;">
            <div class="cust-row" onclick="toggleCustDetail('${safeId}')" style="display:flex; justify-content:space-between; align-items:center; padding:16px 18px; cursor:pointer; gap:10px;">
                <span style="font-size:13px; font-weight:700; color:#fff; word-break:break-all;">${c.email}</span>
                ${deleteArea}
            </div>
            <div class="cust-detail" id="${safeId}" style="display:none; border-top:1px solid var(--border); padding:16px 18px; background:#0d0d0d; font-size:12px; line-height:1.9; color:#ddd;">
                <div><b style="color:#fff;">Email:</b> ${c.email}</div>
                <div><b style="color:#fff;">Total pembelian:</b> ${c.purchaseCount} kali</div>
                <div><b style="color:#fff;">Total transaksi:</b> Rp${c.totalSpent.toLocaleString('id-ID')}</div>
                <div><b style="color:#fff;">Terakhir login:</b> ${lastLogin}</div>
            </div>
        </div>`;
    }).join('');
}

// ── TAB PEMBELI ─────────────────────────────────────────────
function renderPembeliTab() {
    const list = document.getElementById('pembeliList');
    if (!list) return;

    const data = aggregateCustomers().filter(c => c.purchaseCount > 0);

    if (data.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-bag-shopping"></i><p>Belum ada pembeli</p></div>`;
        return;
    }

    list.innerHTML = data.map(c => {
        const safeId = safeIdFor('buy', c.email);

        const trailingArea = `<span style="font-size:13px; font-weight:700; color:var(--green); min-width:20px; text-align:right;">${c.purchaseCount}</span>`
            + (pembeliDeleteMode
                ? `<button onclick="event.stopPropagation(); confirmDeleteCustomer('pembeli','${c.email}')" title="Hapus" style="width:34px; height:34px; border:none; background:var(--red); color:#fff; border-radius:10px; cursor:pointer; font-weight:900; font-size:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">&times;</button>`
                : '');

        return `
        <div class="order-card" style="padding:0;">
            <div class="cust-row" onclick="toggleCustDetail('${safeId}')" style="display:flex; justify-content:space-between; align-items:center; padding:16px 18px; cursor:pointer; gap:10px;">
                <span style="font-size:13px; font-weight:700; color:#fff; word-break:break-all;">${c.email}</span>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">${trailingArea}</div>
            </div>
            <div class="cust-detail" id="${safeId}" style="display:none; border-top:1px solid var(--border); padding:16px 18px; background:#0d0d0d; font-size:12px; line-height:1.9; color:#ddd;">
                <div><b style="color:#fff;">Email:</b> ${c.email}</div>
                <div><b style="color:#fff;">Total pembelian:</b> ${c.purchaseCount} kali</div>
                <div><b style="color:#fff;">Total transaksi:</b> Rp${c.totalSpent.toLocaleString('id-ID')}</div>
                <div style="color:${c.registered ? 'var(--green)' : 'var(--muted)'}; margin-top:6px;">${c.registered ? '✓ Terdaftar sebagai member' : '✕ Tidak terdaftar sebagai member'}</div>
            </div>
        </div>`;
    }).join('');
}

window.toggleCustDetail = (safeId) => {
    const el = document.getElementById(safeId);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.confirmDeleteCustomer = async (tab, email) => {
    const key = email.toLowerCase();
    const target = allCustomers.find(c => (c.email || '').toLowerCase() === key);
    try {
        if (target) await deleteCustomer(target.id);
        allCustomers = allCustomers.filter(c => (c.email || '').toLowerCase() !== key);
        renderCustomers();
        showToast('DATA MEMBER DIHAPUS');
    } catch (e) {
        console.error(e);
        showToast('GAGAL HAPUS', true);
    }
};

// ===== HELPER: FORMAT HARGA =====
function formatHarga(value) {
    let angka = String(value).toLowerCase().replace(/\s/g, '');
    if (angka.includes('k')) angka = angka.replace('k', '000');
    angka = angka.replace(/\D/g, '');
    return Number(angka || 0).toLocaleString('id-ID');
}

window.addEventListener('DOMContentLoaded', () => {
    const hargaInput = document.getElementById('pHarga');
    if (!hargaInput) return;
    hargaInput.addEventListener('input', (e) => {
        const cursor = e.target.selectionStart;
        e.target.value = formatHarga(e.target.value);
        e.target.setSelectionRange(cursor, cursor);
    });
});

// ===== KODE AWAL ID ORDER (form artikel) =====
window.toggleKodeProduk = () => {
    const v = bersihkanPrefix(document.getElementById('pKode').value) || 'FVCK';
    document.getElementById('pKodeContoh').innerText = v;
    const pre = document.getElementById('pBadge').value === 'pre';
    document.querySelector('#pKodeWrap label').innerText = pre ? 'KODE AWAL ID ORDER (WAJIB)' : 'KODE AWAL ID ORDER';
};
window.addEventListener('DOMContentLoaded', () => {
    const k = document.getElementById('pKode');
    if (k) k.addEventListener('input', () => window.toggleKodeProduk());
});

function totalOrder(o) { return Number(o.totalAkhir || o.hargaKaos || 0); }
function namaProdukText(o) {
    return o.produkText || (Array.isArray(o.produk) ? o.produk.map(p => p.nama).join(', ') : (o.produk || ''));
}
function prefixUntukOrder(o) {
    if (o.kodePrefix) return o.kodePrefix;
    const namaList = Array.isArray(o.produk) ? o.produk.map(p => p.nama) : [o.produk];
    for (const n of namaList) {
        const p = allProduk.find(x => x.nama === n && x.kodePrefix);
        if (p) return p.kodePrefix;
    }
    return '';
}
function fmtAdminWaktu(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '-' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ================= ARTIKEL PRE ORDER (selesaikan artikel) ================= */
function ordersUntukPO(p) {
    return allOrders.filter(o => o.status !== 'rejected' &&
        ((o.poIds || []).includes(p.id) || (Array.isArray(o.produk) ? o.produk.some(x => x.nama === p.nama) : o.produk === p.nama)));
}
window.renderPoAdmin = (force) => {
    const box = document.getElementById('poList');
    if (!box) return;
    const ae = document.activeElement;
    if (!force && ae && box.contains(ae) && ae.tagName === 'INPUT') return;   // jangan timpa yang sedang diketik
    const prods = allProduk
        .filter(p => p.badge === 'pre' || p.poClosed)
        .sort((a, b) => Number(!!a.poClosed) - Number(!!b.poClosed));
    if (!prods.length) {
        box.innerHTML = `<div class="empty"><i class="fas fa-flag-checkered"></i><p>Belum ada artikel Pre Order</p></div>`;
        return;
    }
    box.innerHTML = prods.map(p => {
        const closed = !!p.poClosed;
        const ords = ordersUntukPO(p);
        const lunasN = ords.filter(o => o.status === 'lunas').length;
        return `
        <div class="order-card">
            <div class="order-top">
                <div>
                    <div class="order-name">${esc(p.nama)}</div>
                    <div class="order-time">Kode awal: <b>${esc(p.kodePrefix || '— belum diisi —')}</b> · ${ords.length} order · ${lunasN} lunas</div>
                </div>
                <div class="status-badge ${closed ? 's-rejected' : 's-approved'}">${closed ? 'PO SELESAI' : 'BERJALAN'}</div>
            </div>
            <div style="font-size:11px;letter-spacing:.1em;color:#888;margin:4px 0 8px;">UPDATE ARTIKEL (tampil di Pantau semua order artikel ini)</div>
            <div id="poU-${p.id}"></div>
            <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;">
                <input type="text" id="poIn-${p.id}" maxlength="500" placeholder="mis. Kaos dikirim" onkeydown="if(event.key==='Enter'){tambahUpdatePo('${p.id}')}"
                    style="flex:1;min-width:200px;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:13px;">
                <button type="button" onclick="tambahUpdatePo('${p.id}')" class="btn-sm btn-approve" style="flex:none;cursor:pointer;padding:12px 18px;">+ TAMBAH UPDATE</button>
            </div>
            <div style="font-size:11px;color:#666;margin-bottom:12px">Tanggal &amp; jam otomatis. Hanya muncul di order yang dibuat sebelum update ini.</div>
            ${closed
                ? `<button onclick="tutupPo('${p.id}', false)" class="btn-sm btn-bukti" style="width:100%;cursor:pointer;"><i class="fas fa-undo"></i> BATALKAN "PO SELESAI"</button>`
                : `<button onclick="tutupPo('${p.id}', true)" class="btn-sm btn-approve" style="width:100%;cursor:pointer;"><i class="fas fa-flag-checkered"></i> SELESAIKAN ARTIKEL PRE ORDER</button>`}
        </div>`;
    }).join('');
    ensurePoUpdSubs(prods.map(p => p.id));
    prods.forEach(p => renderPoUpdBox(p.id));
};
function renderPoUpdBox(pid) {
    const box = document.getElementById('poU-' + pid);
    if (!box) return;
    const list = poUpd[pid] || [];
    box.innerHTML = list.length ? list.map((e, i) => {
        const iso = tsMillis(e.createdAt) ? new Date(tsMillis(e.createdAt)).toISOString() : '';
        const auto = e.type === 'automatic';
        return `
        <div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-top:${i ? '1px solid #1a1a1a' : 'none'}">
            <span style="width:10px;height:10px;border-radius:50%;background:${auto ? 'var(--green)' : '#6cf'};flex:none;margin-top:5px"></span>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;word-break:break-word">${esc(e.text)}</div>
                <div style="font-size:11px;color:#888;margin-top:2px">${iso ? esc(fmtAdminWaktu(iso)) : 'menyimpan…'}</div>
            </div>
            ${auto ? '' : `<button onclick="hapusUpdatePo('${pid}','${esc(e.id)}')" title="Hapus update" style="width:34px;height:34px;flex:none;border:1px solid rgba(255,59,59,0.15);border-radius:10px;background:rgba(255,59,59,0.08);color:#ff4d4d;cursor:pointer;"><i class="fas fa-trash"></i></button>`}
        </div>`;
    }).join('') : '<div style="font-size:12px;color:#777">Belum ada update artikel.</div>';
}
window.tambahUpdatePo = async (pid) => {
    const inp = document.getElementById('poIn-' + pid);
    if (!inp) return;
    const t = inp.value.trim();
    if (!t) { showToast('KETIK KETERANGAN DULU!', true); inp.focus(); return; }
    try { await adminTambahUpdatePo(pid, t); inp.value = ''; showToast('UPDATE ARTIKEL DITAMBAHKAN ✓'); }
    catch (e) { console.error(e); showToast('GAGAL: ' + errMsg(e), true); }
};
window.hapusUpdatePo = async (pid, id) => {
    if (!confirm('Hapus update artikel ini? (hilang dari timeline semua order artikel ini)')) return;
    try { await adminHapusUpdatePo(pid, id); showToast('UPDATE DIHAPUS'); }
    catch (e) { console.error(e); showToast('GAGAL: ' + errMsg(e), true); }
};
window.tutupPo = async (pid, closed) => {
    const p = allProduk.find(x => x.id === pid);
    if (!p) return;
    const msg = closed
        ? `Tandai PO "${p.nama}" SELESAI?\n\nDi Pantau semua order artikel ini muncul keterangan "Pre Order selesai". Katalog TIDAK ditutup: masih bisa dibeli selama badge belum SOLD OUT.`
        : `Batalkan tanda "PO selesai" untuk "${p.nama}"?`;
    if (!confirm(msg)) return;
    try {
        await adminTutupPo(pid, p.nama, closed);
        allProduk = allProduk.map(x => x.id === pid ? { ...x, poClosed: closed } : x);
        renderPoAdmin(true);
        showToast(closed ? 'PO DITANDAI SELESAI ✓' : 'TANDA PO SELESAI DIBATALKAN');
    } catch (e) {
        console.error(e);
        showToast('GAGAL: ' + errMsg(e), true);
    }
};
