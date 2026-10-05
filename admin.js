import {
    adminAuth, loginAdmin, logoutAdmin, getOrders, updateOrderStatus,
    getProduk, saveProduk, updateProduk, deleteProduk,
    getGaleri, saveGaleri, deleteGaleri, updateGaleri, uploadGambar,
    listenBanners, saveBanner, updateBanner, deleteBanner,
    listenBannerText, saveBannerText,
    listenVouchers, saveVoucher, deleteVoucher,
    listenCustomers, deleteCustomer,
    listenPelunasan, adminSimpanDP, adminTandaiLunas, buatKodePelunasan, buatOrderNo, bersihkanPrefix
} from './firebase.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { adminDb } from "./firebase.js";

let allOrders = [];
let allProduk = [];
let allGaleri = [];
let allBanners = [];
let allVouchers = [];
let allCustomers = [];
let allPelunasan = [];
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
        listenPelunasan(data => { allPelunasan = data; renderOrders(); renderPelunasanAdmin(); });
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

function renderOrders() {
    const list = document.getElementById('orderList');
    let filtered = currentFilter === 'semua' ? allOrders : allOrders.filter(o => o.status === currentFilter);

    if (currentProdukFilter !== 'semua') {
        filtered = filtered.filter(o => {
            if (Array.isArray(o.produk)) return o.produk.some(p => p.nama === currentProdukFilter);
            return o.produk === currentProdukFilter;
        });
    }

    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><p>Belum ada order</p></div>`;
        return;
    }

    const pelMap = pelByOrder();
    list.innerHTML = filtered.map(o => {
        const date = new Date(o.createdAt).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        let sc = 's-pending';
        let st = 'PENDING';
        if (o.status === 'lunas') { sc = 's-approved'; st = 'LUNAS'; }
        if (o.status === 'dp') { sc = 's-approved'; st = 'DP'; }
        if (o.status === 'rejected') { sc = 's-rejected'; st = 'DITOLAK'; }

        const hargaKaosDisp = o.hargaKaos ? `Rp${Number(o.hargaKaos).toLocaleString('id-ID')}` : `Rp${Number(String(o.harga).replace(/\D/g,'')).toLocaleString('id-ID')}`;
        const ongkirDisp = o.ongkir ? `Rp${Number(o.ongkir).toLocaleString('id-ID')}` : '-';
        const totalAkhirDisp = o.totalAkhir ? `Rp${Number(o.totalAkhir).toLocaleString('id-ID')}` : hargaKaosDisp;

        let voucherHTML = "";
        if (o.voucherKode) {
            voucherHTML = `
                <div class="info-item" style="color:var(--yellow)">Voucher Dipakai <span>${o.voucherKode}</span></div>
                <div class="info-item" style="color:var(--yellow)">Ket. Diskon <span>${o.voucherDeskripsi}</span></div>
            `;
        }

        const emailHTML = o.email ? `<div class="info-item">Email <span>${o.email}</span></div>` : '';

        let produkHTML = Array.isArray(o.produk)
            ? o.produk.map(p => `
                <div class="info-item">Produk <span>${p.nama}</span></div>
                <div class="info-item">Warna / Size <span>${p.warna} / ${p.size}</span></div>
            `).join('')
            : `
                <div class="info-item">Produk <span>${o.produk}</span></div>
                <div class="info-item">Warna / Size <span>${o.warna} / ${o.size}</span></div>
            `;

        return `
        <div class="order-card">
            <div class="order-top">
                <div>
                    <div class="order-name">${o.nama}</div>
                    <div class="order-time">ID: <b style="user-select:all">${esc(o.orderNo || o.id)}</b></div>
                    <div class="order-time">${date}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button onclick="hapusOrder('${o.id}')" style="width:38px; height:38px; border:1px solid rgba(255,59,59,0.15); border-radius:10px; background:rgba(255,59,59,0.08); color:#ff4d4d; cursor:pointer; backdrop-filter:blur(10px);">
                        <i class="fas fa-trash"></i>
                    </button>
                    <div class="status-badge ${sc}">${st}</div>
                </div>
            </div>
            <div class="order-info">
                ${produkHTML}
                ${emailHTML}
                <div class="info-item">Harga Kaos <span>${hargaKaosDisp}</span></div>
                <div class="info-item">Ongkir <span>${ongkirDisp}</span></div>
                ${voucherHTML}
                <div class="info-item">WhatsApp <span>${o.wa}</span></div>
                <div class="info-item">Alamat <span>${o.alamat}</span></div>
                ${o.kodePelunasan ? `<div class="info-item">Kode Pelunasan <span style="user-select:all">${esc(o.kodePelunasan)}</span></div>` : ''}
                ${o.dpNominal ? `<div class="info-item">DP Dibayar <span>${rp(o.dpNominal)}</span></div><div class="info-item">Sisa <span>${rp(o.sisaBayar)}</span></div>` : ''}
                <div class="info-item" style="grid-column: 1 / -1; font-size:14px; color:var(--green)">TOTAL AKHIR <span>${totalAkhirDisp}</span></div>
            </div>
            <div class="order-actions" style="display:flex; gap:10px; align-items:center; margin-top:15px; border-top:1px solid #1a1a1a; padding-top:15px;">
                <a href="${o.buktiURL}" target="_blank" class="btn-sm btn-bukti" style="flex:1; text-align:center;">
                    <i class="fas fa-image"></i> BUKTI 1
                </a>
                ${(pelMap[o.id] && pelMap[o.id].buktiPelunasanURL) ? `<a href="${esc(pelMap[o.id].buktiPelunasanURL)}" target="_blank" class="btn-sm btn-bukti" style="flex:1; text-align:center;">
                    <i class="fas fa-image"></i> BUKTI 2
                </a>` : ''}
                <select onchange="gantiStatusOrder('${o.id}', this.value)" style="flex:1; background:#111; color:#fff; border:1px solid #333; padding:10px; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer; outline:none;">
                    <option value="pending" ${o.status === 'pending' || !o.status ? 'selected' : ''}>⏳ PENDING</option>
                    <option value="dp" ${o.status === 'dp' ? 'selected' : ''}>💳 DP</option>
                    <option value="lunas" ${o.status === 'lunas' ? 'selected' : ''}>✅ LUNAS</option>
                    <option value="rejected" ${o.status === 'rejected' ? 'selected' : ''}>❌ DITOLAK</option>
                </select>
            </div>
        </div>`;
    }).join('');
}

window.gantiStatusOrder = async (id, statusBaru) => {
    const ok = await updateOrderStatus(id, statusBaru);
    if (ok) {
        allOrders = allOrders.map(o => o.id === id ? {...o, status: statusBaru} : o);
        renderOrders();
        showToast('STATUS DIPERBARUI ✓');
    } else {
        showToast('GAGAL UPDATE STATUS!', true);
    }
};

window.hapusOrder = async (id) => {
    if (!confirm("Hapus order ini?")) return;
    try {
        await deleteDoc(doc(adminDb, "orders", id));
        allOrders = allOrders.filter(o => o.id !== id);
        isiFilterProduk();
        renderOrders();
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
            kodePrefix: document.getElementById('pDP').value === 'yes' ? bersihkanPrefix(document.getElementById('pKode').value) : '',
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

// ===== PELUNASAN =====
window.toggleKodeProduk = () => {
    const bisaDP = document.getElementById('pDP').value === 'yes';
    document.getElementById('pKodeWrap').style.display = bisaDP ? 'block' : 'none';
    const v = bersihkanPrefix(document.getElementById('pKode').value) || 'FVCK';
    document.getElementById('pKodeContoh').innerText = v;
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

window.renderPelunasanAdmin = () => {
    const box = document.getElementById('pelList');
    if (!box) return;
    // jangan timpa input DP yang sedang diketik
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#pelList') && document.activeElement.tagName === 'INPUT') return;

    const q = (document.getElementById('pelSearch').value || '').trim().toLowerCase();
    const pm = pelByOrder();
    const list = allOrders.filter(o => {
        if (o.status === 'rejected') return false;
        if (q) return [o.orderNo, o.id, o.nama, o.kodePelunasan, o.wa, namaProdukText(o)].some(v => String(v || '').toLowerCase().includes(q));
        return o.status === 'dp' || (pm[o.id] && pm[o.id].status !== 'lunas');
    });

    if (!list.length) {
        box.innerHTML = `<div class="empty"><i class="fas fa-money-check-alt"></i><p>${q ? 'Order tidak ditemukan' : 'Tidak ada order DP yang menunggu pelunasan'}</p></div>`;
        return;
    }

    box.innerHTML = list.map(o => {
        const pel = pm[o.id];
        const total = totalOrder(o);
        const stLabel = !pel ? (o.status === 'lunas' ? 'LUNAS' : 'KODE BELUM AKTIF')
            : pel.status === 'lunas' ? 'LUNAS'
            : pel.status === 'menunggu_verifikasi' ? 'BUKTI PELUNASAN MASUK' : 'MENUNGGU PELUNASAN';
        const warna = (pel && pel.status === 'menunggu_verifikasi') ? 'var(--yellow)' : 'var(--green)';
        return `
        <div class="order-card">
            <div class="order-top">
                <div>
                    <div class="order-name">${esc(o.nama)}</div>
                    <div class="order-time">ID: <b style="user-select:all">${esc(o.orderNo || o.id)}</b></div>
                </div>
                <div class="status-badge s-pending" style="color:${warna}">${stLabel}</div>
            </div>
            <div class="order-info">
                <div class="info-item">Produk <span>${esc(namaProdukText(o))}</span></div>
                <div class="info-item">Status Order <span>${esc((o.status || 'pending').toUpperCase())}</span></div>
                <div class="info-item" style="grid-column:1/-1;font-size:14px;color:var(--green)">TOTAL <span>${rp(total)}</span></div>
            </div>
            <div style="display:flex;gap:10px;align-items:flex-end;margin-top:14px;flex-wrap:wrap;">
                <div style="flex:1;min-width:150px;">
                    <div style="font-size:10px;letter-spacing:.1em;color:#888;margin-bottom:6px;">NOMINAL DP DIBAYAR (Rp)</div>
                    <input type="text" inputmode="numeric" id="dp-${o.id}" value="${o.dpNominal ? Number(o.dpNominal).toLocaleString('id-ID') : ''}" placeholder="mis. 70.000"
                        oninput="hitungSisa('${o.id}')" style="width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;padding:12px;border-radius:8px;font-size:14px;">
                </div>
                <div style="flex:1;min-width:150px;">
                    <div style="font-size:10px;letter-spacing:.1em;color:#888;margin-bottom:6px;">SISA PELUNASAN</div>
                    <div id="sisa-${o.id}" data-total="${total}" style="padding:12px 0;font-weight:700;font-size:16px;color:var(--green)">${o.dpNominal ? rp(total - o.dpNominal) : '-'}</div>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
                <button onclick="simpanDP('${o.id}')" class="btn-sm btn-approve" style="flex:1;cursor:pointer;">
                    <i class="fas fa-save"></i> ${o.kodePelunasan && pel ? 'UPDATE DP' : 'SIMPAN DP & AKTIFKAN KODE'}
                </button>
            </div>
            ${o.kodePelunasan && pel ? `
            <div class="info-item" style="margin-top:14px;">Kode untuk customer <span style="user-select:all;font-size:15px;letter-spacing:.1em">${esc(o.kodePelunasan)}</span></div>
            <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;border-top:1px solid #1a1a1a;padding-top:14px;">
                <a href="${esc(o.buktiURL)}" target="_blank" class="btn-sm btn-bukti" style="flex:1;text-align:center;"><i class="fas fa-image"></i> BUKTI 1 (DP)</a>
                ${pel.buktiPelunasanURL ? `<a href="${esc(pel.buktiPelunasanURL)}" target="_blank" class="btn-sm btn-bukti" style="flex:1;text-align:center;"><i class="fas fa-image"></i> BUKTI 2 (LUNAS)</a>` : `<span class="btn-sm btn-bukti" style="flex:1;text-align:center;opacity:.5;">BUKTI 2 BELUM ADA</span>`}
                ${pel.status !== 'lunas' ? `<button onclick="tandaiLunas('${o.id}')" class="btn-sm btn-approve" style="flex:1;cursor:pointer;"><i class="fas fa-check"></i> TANDAI LUNAS</button>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
};

window.hitungSisa = (id) => {
    const inp = document.getElementById('dp-' + id);
    const out = document.getElementById('sisa-' + id);
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
    const nom = Number((document.getElementById('dp-' + id).value || '').replace(/\D/g, '')) || 0;
    const total = totalOrder(o);
    if (nom <= 0) return showToast('ISI NOMINAL DP DULU!', true);
    if (nom >= total) return showToast('DP TIDAK BOLEH >= TOTAL. Kalau sudah full, set status LUNAS.', true);
    try {
        const kode = o.kodePelunasan || buatKodePelunasan(prefixUntukOrder(o));
        const orderNo = o.orderNo || buatOrderNo(namaProdukText(o));
        const { sisa } = await adminSimpanDP(o, nom, kode, orderNo);
        allOrders = allOrders.map(x => x.id === id ? { ...x, status: 'dp', dpNominal: nom, sisaBayar: sisa, kodePelunasan: kode, orderNo } : x);
        renderOrders();
        document.activeElement && document.activeElement.blur();
        renderPelunasanAdmin();
        showToast('DP DISIMPAN. KODE: ' + kode);
    } catch (e) {
        console.error(e);
        showToast('GAGAL SIMPAN DP: ' + (e.code || e.message), true);
    }
};

window.tandaiLunas = async (id) => {
    const o = allOrders.find(x => x.id === id);
    if (!o || !confirm('Tandai order ini LUNAS?')) return;
    try {
        await adminTandaiLunas(id, o.kodePelunasan);
        allOrders = allOrders.map(x => x.id === id ? { ...x, status: 'lunas', sisaBayar: 0 } : x);
        renderOrders();
        renderPelunasanAdmin();
        showToast('ORDER LUNAS ✓');
    } catch (e) {
        console.error(e);
        showToast('GAGAL: ' + (e.code || e.message), true);
    }
};
