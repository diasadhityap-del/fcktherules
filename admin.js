import {
    auth,
    loginAdmin,
    logoutAdmin,
    getOrders,
    updateOrderStatus,
    getProduk,
    saveProduk,
    updateProduk,
    deleteProduk,
    getGaleri,
    saveGaleri,
    deleteGaleri,
    updateGaleri,
    uploadGambar,
listenBanners, saveBanner, updateBanner, deleteBanner
} from './firebase.js';

import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

    let allOrders = [];
    let allProduk = [];
    let allGaleri = [];
    let currentFilter = 'semua';
    let currentProdukFilter = 'semua';
    let editingProdukId = null;

    // ===== AUTH =====
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('adminPage').style.display = 'block';
            await Promise.all([loadOrders(), loadProduk(), loadGaleri(), loadBanners()]);
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

    window.doLogout = async () => {
        await logoutAdmin();
    };

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

    allOrders.sort((a, b) => {

        return new Date(b.createdAt).getTime()
             - new Date(a.createdAt).getTime();

    });

    isiFilterProduk();

    renderOrders();
}

    window.filterOrder = (filter, el) => {
        currentFilter = filter;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
        renderOrders();
    };

function isiFilterProduk() {

    const select =
        document.getElementById('filterProduk');

    if (!select) return;

    const produkUnik = [
  ...new Set(
    allOrders.flatMap(o => {

      if (Array.isArray(o.produk)) {
        return o.produk.map(p => p.nama);
      }

      return [o.produk];

    })
  )
];

    select.innerHTML = `
        <option value="semua">
            Semua Produk
        </option>
    `;

    produkUnik.forEach(nama => {

        select.innerHTML += `
            <option value="${nama}">
                ${nama}
            </option>
        `;
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
                if (Array.isArray(o.produk)) {
                    return o.produk.some(p => p.nama === currentProdukFilter);
                }
                return o.produk === currentProdukFilter;
            });
        }

        if (filtered.length === 0) {
            list.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><p>Belum ada order</p></div>`;
            return;
        }

        list.innerHTML = filtered.map(o => {
            const date = new Date(o.createdAt).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
            
            // Atur warna lencana (badge) di sudut kanan atas
            let sc = 's-pending';
            if (o.status === 'lunas') sc = 's-approved';
            if (o.status === 'dp') sc = 's-approved';
            if (o.status === 'rejected') sc = 's-rejected';
            
            let st = 'PENDING';
            if (o.status === 'lunas') st = 'LUNAS';
            if (o.status === 'dp') st = 'DP';
            if (o.status === 'rejected') st = 'DITOLAK';

            return `<div class="order-card">
                <div class="order-top">
                    <div>
                        <div class="order-name">${o.nama}</div>
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
                    ${Array.isArray(o.produk) ? o.produk.map(p => `
                        <div class="info-item">Produk <span>${p.nama}</span></div>
                        <div class="info-item">Warna / Size <span>${p.warna} / ${p.size}</span></div>
                    `).join('') : `
                        <div class="info-item">Produk <span>${o.produk}</span></div>
                        <div class="info-item">Warna / Size <span>${o.warna} / ${o.size}</span></div>
                    `}
                    <div class="info-item">Harga <span>Rp${Number(String(o.harga).replace(/\D/g,'')).toLocaleString('id-ID')}</span></div>
                    <div class="info-item">WhatsApp <span>${o.wa}</span></div>
                    <div class="info-item">Alamat <span>${o.alamat}</span></div>
                </div>
                
                <!-- BAGIAN TOMBOL BAWAH (BUKTI & UBAH STATUS) -->
                <div class="order-actions" style="display:flex; gap:10px; align-items:center; margin-top:15px; border-top:1px solid #1a1a1a; padding-top:15px;">
                    <a href="${o.buktiURL}" target="_blank" class="btn-sm btn-bukti" style="flex:1; text-align:center;">
                        <i class="fas fa-image"></i> BUKTI
                    </a>
                    
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

    // Fungsi Baru untuk Mengganti Status
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


    // ===== PRODUK =====
    async function loadProduk() {
        allProduk = await getProduk();
        renderProduk();
    }

    function renderProduk() {

    const list = document.getElementById('produkList');

    const sortedProduk = [...allProduk].sort(
    (a, b) => (b.order || 0) - (a.order || 0)
);

    if (sortedProduk.length === 0) {
        list.innerHTML = `
            <div class="empty">
                <i class="fas fa-tshirt"></i>
                <p>Belum ada produk</p>
            </div>
        `;
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
                    <div class="produk-price">
    Rp${Number(String(p.harga).replace(/\D/g,'')).toLocaleString('id-ID')}
</div>
                    <div class="produk-actions">

    <div class="btn-icon"
        onclick="moveProdukUp('${p.id}')">

        ↑

    </div>

    <div class="btn-icon"
        onclick="moveProdukDown('${p.id}')">

        ↓

    </div>

    <div class="btn-icon"
        onclick="editProduk('${p.id}')">

        <i class="fas fa-pen"></i>

    </div>

    <div class="btn-icon del"
        onclick="hapusProduk('${p.id}')">

        <i class="fas fa-trash"></i>

    </div>

</div>
                        
                   
                </div>
            </div>
        `).join('')}</div>`;
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
        document.getElementById('prevThumb').style.display = 'none';
        [0,1,2,3,4].forEach(i => {
            const img = document.getElementById('prevDet'+i);
            img.src = '';
            img.style.display = 'none';
        });
        document.getElementById('modalProduk').classList.add('show');
    };

    window.closeModalProduk = () => {
        document.getElementById('modalProduk').classList.remove('show');
    };

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
            // Upload thumbnail
            let thumbnailURL = editingProdukId ? (allProduk.find(x => x.id === editingProdukId)?.thumbnail || '') : '';
            const thumbFile = document.getElementById('inputThumb').files[0];
            if (thumbFile) thumbnailURL = await uploadGambar(thumbFile, 'produk');

            // Upload detail images
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

    order: editingProdukId
        ? (
            allProduk.find(x => x.id === editingProdukId)?.order
            ?? 0
          )
        : Date.now(),

    nama: document.getElementById('pNama').value,
    harga: document.getElementById('pHarga').value,
    badge: document.getElementById('pBadge').value,
    status: document.getElementById('pStatus').value,
    warna: document.getElementById('pWarna').value,
    stok: document.getElementById('pStok').value,
    specs: document.getElementById('pSpecs').value,
    showcase: document.getElementById('pShowcase').value,
    dpAllowed: document.getElementById('pDP').value,
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

            <div class="galeri-del"
                 onclick="hapusGaleri('${g.id}')">

                <i class="fas fa-times"></i>

            </div>

            <div class="galeri-move">

                <button onclick="moveGaleriUp('${g.id}')">
                    ↑
                </button>

                <button onclick="moveGaleriDown('${g.id}')">
                    ↓
                </button>

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

        text.innerText =
            `MENGUPLOAD FOTO ${i + 1} / ${files.length}`;

        const file = files[i];

        const url = await uploadGambar(file, 'galeri');

        if (url) {
            await saveGaleri(url);
            success++;
        }
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

    // ===== IMG PREVIEW =====
    window.prevImgSlot = (input, previewId) => {
        const file = input.files[0];
        if (!file) return;
        const img = document.getElementById(previewId);
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; img.style.display = 'block'; };
        reader.readAsDataURL(file);
    };

window.moveGaleriUp = async (id) => {

    const index = allGaleri.findIndex(g => g.id === id);

    if (index <= 0) return;

    const current = allGaleri[index];
    const prev = allGaleri[index - 1];

    const temp = current.order;

    await updateGaleri(current.id, {
        order: prev.order
    });

    await updateGaleri(prev.id, {
        order: temp
    });

    await loadGaleri();
};

window.moveGaleriDown = async (id) => {

    const index = allGaleri.findIndex(g => g.id === id);

    if (index >= allGaleri.length - 1) return;

    const current = allGaleri[index];
    const next = allGaleri[index + 1];

    const temp = current.order;

    await updateGaleri(current.id, {
        order: next.order
    });

    await updateGaleri(next.id, {
        order: temp
    });

    await loadGaleri();
};

function formatHarga(value) {

    let angka = String(value)
        .toLowerCase()
        .replace(/\s/g, '');

    // support 135k
    if (angka.includes('k')) {
        angka = angka.replace('k', '000');
    }

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

import { deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { db } from "./firebase.js";

async function hapusOrder(id) {

    const konfirmasi =
        confirm("Hapus order ini?");

    if (!konfirmasi) return;

    try {

        await deleteDoc(
            doc(db, "orders", id)
        );

        allOrders = allOrders.filter(
            o => o.id !== id
        );

        isiFilterProduk();

        renderOrders();

        showToast("ORDER DIHAPUS");

    } catch (err) {

        console.error(err);

        alert("Gagal hapus order");
    }
}

window.hapusOrder = hapusOrder;

async function hapusProdukOrder() {

    const yakin = confirm(
        "Hapus semua order sesuai filter?"
    );

    if (!yakin) return;

    try {

        const data = allOrders.filter(
            o =>
                (
                    currentProdukFilter === 'semua'
                    || o.produk === currentProdukFilter
                )
                &&
                (
                    currentProdukFilter === 'semua'
|| (
    Array.isArray(o.produk)
    ? o.produk.some(
        p => p.nama === currentProdukFilter
      )
    : o.produk === currentProdukFilter
)
                )
        );

        if (data.length === 0) {

            return alert(
                "Tidak ada order untuk dihapus"
            );
        }

        for (const order of data) {

            await deleteDoc(
                doc(db, "orders", order.id)
            );
        }

        showToast(
            `${data.length} ORDER DIHAPUS`
        );

        await loadOrders();

    } catch(err) {

        console.error(err);

        alert("Gagal hapus");
    }
}

window.moveProdukUp = async (id) => {

    const sortedProduk = [...allProduk].sort(
        (a, b) => (b.order || 0) - (a.order || 0)
    );

    const index =
        sortedProduk.findIndex(p => p.id === id);

    if (index <= 0) return;

    const current = sortedProduk[index];
    const prev = sortedProduk[index - 1];

    const temp = current.order;

    await updateProduk(current.id, {
        order: prev.order
    });

    await updateProduk(prev.id, {
        order: temp
    });

    await loadProduk();
};

window.moveProdukDown = async (id) => {

    const sortedProduk = [...allProduk].sort(
        (a, b) => (b.order || 0) - (a.order || 0)
    );

    const index =
        sortedProduk.findIndex(p => p.id === id);

    if (index >= sortedProduk.length - 1) return;

    const current = sortedProduk[index];
    const next = sortedProduk[index + 1];

    const temp = current.order;

    await updateProduk(current.id, {
        order: next.order
    });

    await updateProduk(next.id, {
        order: temp
    });

    await loadProduk();
};

let allBanners = [];
let editingBannerId = null;

// Tambahkan loadBanners() ke dalam onAuthStateChanged bersama loadProduk dll
// await Promise.all([loadOrders(), loadProduk(), loadGaleri(), loadBanners()]);

async function loadBanners() {
    import('./firebase.js').then(module => {
        module.listenBanners((data) => {
            allBanners = data;
            renderBanners();
        });
    });
}

function renderBanners() {
    const list = document.getElementById('bannerList');
    if (allBanners.length === 0) {
        list.innerHTML = `<div class="empty"><i class="fas fa-flag"></i><p>Belum ada banner</p></div>`;
        return;
    }
    
    // Kita pinjam style produk-grid agar rapi
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
        const { saveBanner, updateBanner } = await import('./firebase.js');
        let imageURL = editingBannerId ? (allBanners.find(x => x.id === editingBannerId)?.image || '') : '';
        const file = document.getElementById('inputBanner').files[0];
        
        if (file) {
            imageURL = await uploadGambar(file, 'galeri'); // Pakai cloudinary preset galeri
        }
        
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
    const { deleteBanner } = await import('./firebase.js');
    await deleteBanner(id);
    showToast('BANNER DIHAPUS');
};

window.moveBannerUp = async (id, index) => {
    if (index <= 0) return;
    const { updateBanner } = await import('./firebase.js');
    const temp = allBanners[index].order;
    await updateBanner(allBanners[index].id, { order: allBanners[index-1].order });
    await updateBanner(allBanners[index-1].id, { order: temp });
};

window.moveBannerDown = async (id, index) => {
    if (index >= allBanners.length - 1) return;
    const { updateBanner } = await import('./firebase.js');
    const temp = allBanners[index].order;
    await updateBanner(allBanners[index].id, { order: allBanners[index+1].order });
    await updateBanner(allBanners[index+1].id, { order: temp });
};


window.hapusProdukOrder =
    hapusProdukOrder;