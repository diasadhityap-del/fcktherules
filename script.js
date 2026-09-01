const PAGE_SLUGS = {
    home: '/',
    preorder: '/preorder',
    katalog: '/katalog',
    arsip: '/arsip',
    galeri: '/galeri',
    tentang: '/tentang'
};

const SLUG_TO_PAGE = {
    '': 'home',
    'preorder': 'preorder',
    'katalog': 'katalog',
    'arsip': 'arsip',
    'galeri': 'galeri',
    'tentang': 'tentang'
};

import { listenProduk, listenGaleri, listenBanners } from './firebase.js';


function updateMeta(title, description) {
    document.title = title;
    document.querySelector('meta[name="description"]').content = description;
    document.querySelector('meta[property="og:title"]').content = title;
    document.querySelector('meta[property="og:description"]').content = description;
}

const META = {
    home: { title: 'FvcktheRules | Make a Stand with Pride', desc: 'Soccer culture, street attitude.' },
    katalog: { title: 'Katalog | FvcktheRules', desc: 'Koleksi lengkap FvcktheRules Store.' },
    preorder: { title: 'Pre Order | FvcktheRules', desc: 'Pre order produk terbaru FvcktheRules.' },
    arsip: { title: 'Arsip | FvcktheRules', desc: 'Koleksi arsip FvcktheRules Store.' },
    galeri: { title: 'Galeri | FvcktheRules', desc: 'Galeri foto FvcktheRules Store.' },
    tentang: { title: 'Tentang Kami | FvcktheRules', desc: 'FvcktheRules, built for those who carry football into everyday life.' }
};

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();
}

function formatRupiah(value) {

    return 'Rp' + Number(
        String(value).replace(/\D/g,'')
    ).toLocaleString('id-ID');

}

let galleryImages = []; // Untuk menyimpan link dari kolom Q

import {
    listenProduk,
    listenGaleri
} from './firebase.js';
let products = [];
let cart = { prod: null, size: '', color: '' };
let lastPage = 'home'; // Default ke home
let cartItems = []; // Array keranjang belanja

let tipeBayar = 'lunas'; // default lunas

// ── CART FUNCTIONS ──────────────────────────────────────────
function addToCart() {
    if (!cart.color) return triggerAlert("PILIH WARNA DULU!");
    if (!cart.size) return triggerAlert("PILIH UKURAN DULU!");

    cartItems.push({
        id: Date.now(),
        prod: cart.prod,
        size: cart.size,
        color: cart.color
    });

    vibrate([30, 30, 30]);
    updateCartBadge();
    showCartToast();
}

function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    badge.innerText = cartItems.length;
    badge.style.display = cartItems.length > 0 ? 'flex' : 'none';
    const btn = document.getElementById('floatingCartBtn');
    if (btn) btn.style.display = cartItems.length > 0 ? 'flex' : 'none';
}

function showCartToast() {
    const toast = document.getElementById('cartToast');
    if (!toast) return;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function removeCartItem(id) {
    vibrate(20);

    cartItems = cartItems.filter(i => i.id !== id);

    updateCartBadge();
    renderCartPage();

    if (cartItems.length === 0) {

        const floatingBtn =
            document.getElementById('floatingCartBtn');

        if (floatingBtn) {
            floatingBtn.style.display = 'none';
        }

        if (
            document.getElementById('cartPage')
            .classList.contains('active')
        ) {
            showPage(lastPage || 'home');
        }
    }
}

function renderCartPage() {
    const container = document.getElementById('cartList');
    if (!container) return;

    if (cartItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px; color:#444;">
                <i class="fas fa-shopping-bag" style="font-size:48px; margin-bottom:20px; display:block;"></i>
                <p style="font-weight:700; font-size:14px; letter-spacing:1px;">KERANJANG KOSONG</p>
                <p style="font-size:12px; margin-top:8px; color:#333;">Tambahkan produk dulu yuk!</p>
            </div>`;
        document.getElementById('cartCheckoutBtn').style.display = 'none';
        return;
    }

    const total = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);

    container.innerHTML = cartItems.map(item => `
        <div style="background:#0a0a0a; border:1px solid #1a1a1a; border-radius:15px; padding:16px; margin-bottom:12px; display:flex; gap:14px; align-items:center;">
            <img src="${item.prod.thumbnail}" style="width:70px; height:70px; object-fit:cover; border-radius:10px; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <p style="font-weight:700; font-size:13px; margin:0 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.prod.name}</p>
                <p style="font-size:11px; color:#888; margin:0 0 6px;">${item.color} | ${item.size}</p>
                <p style="font-size:13px; color:#00c853; font-weight:700; margin:0;">${formatRupiah(item.prod.price)}</p>
            </div>
            <button onclick="removeCartItem(${item.id})" style="background:none; border:1px solid #2a2a2a; color:#666; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');

    document.getElementById('cartTotal').innerText = formatRupiah(total);
    document.getElementById('cartCheckoutBtn').style.display = 'block';
}

function goToCartCheckout() {
    vibrate(40);
    showPage('cartForm');
}

function validateCartForm() {
    vibrate(40);
    const n = document.getElementById('cartInName').value;
    const p = document.getElementById('cartInPhone').value;
    const a = document.getElementById('cartInAddress').value;
    if (!n || !p || !a) return triggerAlert("LENGKAPI DATA!");

    // Cek apakah ada SALAH SATU produk di keranjang yang TIDAK BISA DP
    const adaProdukTanpaDP = cartItems.some(item => item.prod.dpAllowed === 'no');

    // Elemen UI pilihan bayar di cartSummary
    const paymentArea = document.getElementById('cartPaymentTypeArea'); // area container pilihan bayar jika ada
    const btnDP = document.getElementById('btnDP');

    if (adaProdukTanpaDP) {
        // Jika ada produk yang gak bisa DP -> paksa LUNAS & sembunyikan tombol DP
        tipeBayar = 'lunas';
        pilihBayar('lunas');
        if (btnDP) btnDP.style.display = 'none';
        if (paymentArea) paymentArea.style.display = 'none';
    } else {
        // Jika SEMUA produk bisa DP -> tampilkan opsi DP
        if (btnDP) btnDP.style.display = 'block';
        if (paymentArea) paymentArea.style.display = 'block';
    }

    // Render cart summary
    const itemsHTML = cartItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #1a1a1a;">
            <div>
                <p style="font-size:13px; font-weight:700; margin:0 0 3px;">${item.prod.name}</p>
                <p style="font-size:11px; color:#888; margin:0;">${item.color} | ${item.size}</p>
            </div>
            <p style="font-size:13px; color:#00c853; font-weight:700; margin:0; flex-shrink:0; margin-left:10px;">${formatRupiah(item.prod.price)}</p>
        </div>
    `).join('');

    const total = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);

    document.getElementById('cartSumItems').innerHTML = itemsHTML;
    document.getElementById('cartSumTotal').innerText = formatRupiah(total);
    document.getElementById('cartSumCust').innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;
    showPage('cartSummary');
}


async function sendCartWA() {
    vibrate(40);
    const n = document.getElementById('cartInName').value;
    const p = document.getElementById('cartInPhone').value;
    const a = document.getElementById('cartInAddress').value;
    const buktiFile = document.getElementById('cartInputBukti').files[0];
    const dp = tipeBayar === 'dp' ? document.getElementById('cartInDP').value : '';

    if (!buktiFile) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");
    if (tipeBayar === 'dp' && !dp) return triggerAlert("ISI NOMINAL DP!");
    if (tipeBayar === 'dp' && parseInt(dp) < 60000) return triggerAlert("DP MINIMAL Rp60.000!");

    const btn = document.querySelector('#cartSummary button[onclick="sendCartWA()"]');
    btn.innerText = 'UPLOADING...';
    btn.disabled = true;

    try {
        const { saveOrder } = await import('./firebase.js');
        const buktiURL = uploadedCartBuktiURL;
        if (!buktiURL) throw new Error("Gagal upload bukti");

        const total = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);
        const infoBayar = tipeBayar === 'lunas' ? 'LUNAS' : `DP ${formatRupiah(dp)} dari ${formatRupiah(total)}`;

        const produkList = cartItems.map(i =>
    `- ${i.prod.name} (${i.color} | ${i.size}) — ${formatRupiah(i.prod.price)},`
).join('\n');

        const orderData = {
            nama: n,
            wa: p,
            alamat: a,
            produk: cartItems.map(i => ({
                nama: i.prod.name,
                warna: i.color,
                size: i.size,
                harga: i.prod.price
            })),
            produkText: cartItems.map(i => `${i.prod.name} (${i.color}|${i.size})`).join(', '),
            harga: total,
            tipeBayar,
            dp: tipeBayar === 'dp' ? dp : '',
            buktiURL
        };

        await saveOrder(orderData);

        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwT4_P20_b0UsbL4absLW6G7nNpK_PGfQv97VVjyJpcm622JzjAAAf6dzSKs-97jyfZvw/exec';
        fetch(SCRIPT_URL, { method:"POST", mode:"no-cors", cache:"no-cache", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(orderData) })
            .catch(err => console.error("Gagal kirim ke spreadsheet:", err));

        const text = `*FVCKTHERULES ORDER (KERANJANG)*\n\n*Produk:*\n${produkList}\n\n*Total:* ${formatRupiah(total)}\n*Pembayaran:* ${infoBayar}\n\n*Data Pengiriman*\n*Nama:* ${n}\n*WhatsApp:* ${p}\n*Alamat:* ${a}\n\n*Bukti Bayar:*\n${buktiURL}`;
        window.open(`https://wa.me/6285725706337?text=${encodeURIComponent(text)}`);

        // Reset keranjang
        cartItems = [];
        updateCartBadge();
        uploadedCartBuktiURL = null;

    } catch(err) {
        console.error(err);
        triggerAlert("GAGAL! COBA LAGI.");
    } finally {
        btn.innerText = 'CHECKOUT (WA)';
        btn.disabled = false;
    }
}


let uploadedCartBuktiURL = null;

async function previewCartBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('cartPreviewImg');
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
        previewImg.style.opacity = '0.4';
        previewImg.style.filter = 'blur(2px)';
        const existing = document.getElementById('cartSpinnerOverlay');
        if (existing) existing.remove();
        const spinner = document.createElement('div');
        spinner.id = 'cartSpinnerOverlay';
        spinner.className = 'spinner-overlay';
        spinner.innerHTML = '<i class="fas fa-spinner"></i>';
        previewImg.parentElement.style.position = 'relative';
        previewImg.parentElement.appendChild(spinner);
    };
    reader.readAsDataURL(file);
    document.getElementById('cartLabelBukti').innerText = ' Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedCartBuktiURL = await uploadGambar(file, 'bukti');

    const previewImg = document.getElementById('cartPreviewImg');
    const spinner = document.getElementById('cartSpinnerOverlay');
    if (spinner) spinner.remove();

    if (uploadedCartBuktiURL) {
        previewImg.style.opacity = '1';
        previewImg.style.filter = 'none';
        document.getElementById('cartLabelBukti').innerText = ' Upload berhasil!';
    } else {
        previewImg.style.display = 'none';
        previewImg.style.opacity = '1';
        previewImg.style.filter = 'none';
        document.getElementById('cartLabelBukti').innerText = ' Gagal upload, coba lagi';
        uploadedCartBuktiURL = null;
    }
}

function pilihBayar(tipe) {
    tipeBayar = tipe;
    const styleActive = 'padding:16px; border:1.5px solid #fff; border-radius:12px; text-align:center; font-weight:700; font-size:13px; cursor:pointer; background:#fff; color:#000;';
    const styleInactive = 'padding:16px; border:1.5px solid #1a1a1a; border-radius:12px; text-align:center; font-weight:700; font-size:13px; cursor:pointer; background:#050505; color:#fff;';

    // Cek context: summary biasa atau cartSummary
    const isCart = document.getElementById('cartSummary')?.classList.contains('active');
    const btnLunas = document.getElementById(isCart ? 'btnLunas' : 'sumBtnLunas');
    const btnDP    = document.getElementById(isCart ? 'btnDP'    : 'sumBtnDP');
    const dpArea   = document.getElementById(isCart ? 'dpArea'   : 'sumDpArea');

    if (tipe === 'lunas') {
        if (btnLunas) btnLunas.style.cssText = styleActive;
        if (btnDP)    btnDP.style.cssText    = styleInactive;
        if (dpArea)   dpArea.style.display   = 'none';
    } else {
        if (btnDP)    btnDP.style.cssText    = styleActive;
        if (btnLunas) btnLunas.style.cssText = styleInactive;
        if (dpArea)   dpArea.style.display   = 'block';
    }
}

let uploadedBuktiURL = null;

async function previewBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('previewImg');
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
        previewImg.style.opacity = '0.4';
        previewImg.style.filter = 'blur(2px)';

        // Tambah spinner di atas gambar
        const existing = document.getElementById('spinnerOverlay');
        if (existing) existing.remove();
        const spinner = document.createElement('div');
        spinner.id = 'spinnerOverlay';
        spinner.className = 'spinner-overlay';
        spinner.innerHTML = '<i class="fas fa-spinner"></i>';
        previewImg.parentElement.style.position = 'relative';
        previewImg.parentElement.appendChild(spinner);
    };
    reader.readAsDataURL(file);

    document.getElementById('labelBukti').innerText = '⏳ Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedBuktiURL = await uploadGambar(file, 'bukti');

    const previewImg = document.getElementById('previewImg');
    const spinner = document.getElementById('spinnerOverlay');
    if (spinner) spinner.remove();

    if (uploadedBuktiURL) {
        previewImg.style.opacity = '1';
        previewImg.style.filter = 'none';
        document.getElementById('labelBukti').innerText = '✓ Upload berhasil!';
    } else {
        previewImg.style.display = 'none';
        previewImg.style.opacity = '1';
        previewImg.style.filter = 'none';
        document.getElementById('labelBukti').innerText = '✗ Gagal upload, coba lagi';
        uploadedBuktiURL = null;
    }
}
window.onload = async () => {

    history.replaceState(
        { page: 'home' },
        '',
        window.location.pathname
    );

   listenBanners((firestoreBanners) => {
    renderBannerSlider(firestoreBanners);
});


    listenProduk((firestoreProducts) => {

    products = firestoreProducts.map(p => ({
        id: p.id,
        name: p.nama,
        price: p.harga,
        badge: p.badge?.toLowerCase() || '',
        status: p.status || '',
        colors: p.warna ? p.warna.split('/').map(c => c.trim()) : [],
        stock: p.stok ? p.stok.split('/').map(s => s.trim()) : [],
        thumbnail: p.thumbnail || '',
        details: p.details || [],
        specs: p.specs || '',
        showcase: p.showcase || 'no',
        dpAllowed: p.dpAllowed || 'yes',
        order: p.order || 0
    }));

    products.sort(
        (a, b) => (b.order || 0) - (a.order || 0)
    );

    renderAllSections();

    const path = window.location.pathname.replace(/^\//, '').toLowerCase();

    // Cek apakah path adalah order page
    const orderMatch =
    path.match(/^([^\/]+)$/)
    ||
    path.match(/^([^\/]+)\/$/)
    ||
    path.match(/^([^\/]+)\/detail$/)
    ||
    path.match(/^([^\/]+)\/form$/)
    ||
    path.match(/^([^\/]+)\/summary$/);
    if (orderMatch) {
        const productSlug = orderMatch[1]; // contoh: soccer-madness
        let pageId = 'detail'; // detail, form, atau summary

if (path.endsWith('/form')) {
    pageId = 'form';
}

if (path.endsWith('/summary')) {
    pageId = 'summary';
}      

        // Cari produk berdasarkan slug
        const found = products.find(p => slugify(p.name) === productSlug);

        if (found) {
            // Set cart dari data produk
            cart = { 
                prod: found, 
                size: '', 
                color: found.colors.length === 1 ? found.colors[0] : '' 
            };
            // Render ulang detail produk
            goDetailSilent(found);
            // Tampilkan halaman yang sesuai
            showPageSilent(pageId);
            if (!document.referrer.includes(window.location.hostname)) {

    history.replaceState(
        { page: 'home' },
        '',
        '/'
    );

    history.pushState(
        {
            page: 'detail',
            product: productSlug
        },
        '',
        `/${productSlug}`
    );
}
        } else {
            // Produk tidak ditemukan, redirect home
            history.replaceState({ page: 'home' }, '', '/');
            showPage('home');
        }
    } else {
        const targetPage = SLUG_TO_PAGE[path] || 'home';
        if (targetPage !== 'home') {
            showPage(targetPage);
        }
    }
});

    listenGaleri((firestoreGaleri) => {

        galleryImages =
            firestoreGaleri.map(g => g.url);

        renderGallery();
    });

    setTimeout(() =>
        document.getElementById('loader').classList.add('hide'),
        1000
    );

    

    const orderPages = ['detail', 'form', 'summary', 'cartPage', 'cartForm', 'cartSummary'];
    window.addEventListener('popstate', (e) => {
        const page = e.state?.page || 'home';
        const menuBtn = document.querySelector('.menu-btn');

        if (orderPages.includes(page) && !cart.prod) {
            history.replaceState({ page: 'home' }, '', '/');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('home').classList.add('active');
            menuBtn.style.display = 'flex';
            return;
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(page).classList.add('active');
        document.getElementById(page).scrollTop = 0;

        if (orderPages.includes(page)) {
            menuBtn.style.display = 'none';
        } else {
            menuBtn.style.display = 'flex';
            lastPage = page;
        }
    });
};


function renderAllSections() { 
    // Beranda: Hanya produk yang kolom Showcase-nya diisi 'yes'
    renderList(products.filter(p => p.showcase === 'yes'), 'list-home');

    // Halaman lain tetap berdasarkan Badge
    renderList(products.filter(p => p.badge === 'pre'), 'list-preorder');
    renderList(products.filter(p => p.badge === 'ready'), 'list-katalog');
    renderList(products.filter(p => p.badge === 'sold'), 'list-arsip');

    injectFooters();
}

function renderList(items, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    items.forEach(p => {
        const isSold = p.badge === 'sold';
        container.innerHTML += `
            <div class="card ${isSold ? 'sold-out-display' : ''}">
                <div class="badge ${p.badge}">${p.status}</div>
                <img src="${p.thumbnail}"> <div style="padding:25px">
                    <h3>${p.name}</h3>
                    <p style="opacity:0.5; font-weight:600;">${isSold ? 'OUT OF STOCK' : formatRupiah(p.price)}</p>
                    <button onclick="
    sessionStorage.setItem(
        'lastPage',
        document.querySelector('.page.active').id
    );
    vibrate(40);
    goDetail('${p.id}');
" ${isSold ? 'disabled' : ''}>

    ${isSold ? 'SOLD' : 'SELECT'}

</button>
                </div>
            </div>`;
    });
}

function renderGallery() {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    
    container.innerHTML = '';
    galleryImages.forEach(img => {
        // Kita tambahkan onclick="openImage('${img}')" agar saat diklik gambar membesar
        container.innerHTML += `<img src="${img}" loading="lazy" onclick="vibrate(20); openImage('${img}')">`;
    });
}

// Fungsi untuk membuka modal
function openImage(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImg');
    modalImg.src = src;
    modal.style.display = 'flex'; // Mengubah display menjadi flex agar muncul
    vibrate(20);
}

// Fungsi untuk menutup modal (dipanggil saat klik area gelap)
function closeImage() {
    document.getElementById('imageModal').style.display = 'none';
}

function injectFooters() {
    const footerHTML = `
        <footer>
            <div class="footer-logo">FVCKTHERULES</div>
            <div class="footer-slogan">MAKE STAND WITH PRIDE</div>
            <div class="footer-socials">
                <a href="https://www.instagram.com/fvcktherules____?igsh=d2Z5dTFiMHdxMHgy" target="_blank" onclick="vibrate(30)"><i class="fab fa-instagram"></i></a>
                <a href="https://wa.me/6285725706337" target="_blank" onclick="vibrate(30)"><i class="fab fa-whatsapp"></i></a>
                <a href="https://shopee.co.id/fvcktherules__" target="_blank" onclick="vibrate(30)"><i class="fas fa-shopping-bag"></i></a>
            </div>
            <div class="footer-contact-title">KONTAK KAMI :</div>
            <div class="footer-contact-info">
                Saluran WhatsApp : <a href="https://whatsapp.com/channel/0029Vb7jjbj8vd1GK8ZiTz0y" target="_blank"><i class="fab fa-whatsapp"></i> Klik Disini</a><br>
                WhatsApp : <a href="https://wa.me/6285725706337">085725706337</a><br>
                Email : <a href="mailto:fvcktherulesmakestand@gmail.com">fvcktherulesmakestand@gmail.com</a>
            </div>
            <p class="copyright">© 2026 FvcktheRules Store. All rights reserved.</p>
        </footer>`;

    // Daftar ID footer yang ada di HTML kamu
    ['home', 'pre', 'kat', 'ars', 'about', 'galeri'].forEach(id => {
        const el = document.getElementById(`footer-${id}`);
        if(el) el.innerHTML = footerHTML;
    });
}

function toggleSidebar() {
    vibrate(20);
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
}

function navTo(pageId) { toggleSidebar(); showPage(pageId); }

function showPage(id) {
    if (META[id]) updateMeta(META[id].title, META[id].desc);
    const menuBtn = document.querySelector('.menu-btn');
    const mainMenus = ['home', 'preorder', 'katalog', 'arsip', 'galeri', 'tentang'];
    const orderPages = ['detail', 'form', 'summary', 'cartPage', 'cartForm', 'cartSummary'];

    if (orderPages.includes(id) && !cart.prod) {
        history.pushState({ page: 'home' }, '', '/');
        id = 'home';
    }

    if (mainMenus.includes(id)) {
        lastPage = id;
        const slug = PAGE_SLUGS[id] || '/';
        history.pushState({ page: id }, '', slug);
    }

    // URL dinamis untuk order pages
    // URL dinamis untuk order pages
if (orderPages.includes(id) && cart.prod) {
    const productSlug = slugify(cart.prod.name);

    let url = `/${productSlug}`;

    if (id === 'form') {
        url = `/${productSlug}/form`;
    }

    if (id === 'summary') {
        url = `/${productSlug}/summary`;
    }

    history.pushState(
        { page: id, product: productSlug },
        '',
        url
    );
}
    if (orderPages.includes(id)) {
        menuBtn.style.display = 'none';
    } else {
        menuBtn.style.display = 'flex';
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById(id).scrollTop = 0;
}

function navBack() {
    vibrate(30);

    // kalau ada history sebelumnya
    if (window.history.length > 1) {
        history.back();
        return;
    }

    // fallback kalau buka direct link
    showPage(lastPage || 'home');
}

function goDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    if (document.getElementById('sidebar').classList.contains('open')) {
        toggleSidebar();
    }
    
    cart = { prod: p, size: '', color: p.colors.length === 1 ? p.colors[0] : '' };

    document.getElementById('detName').innerText = p.name;
    document.getElementById('detPrice').innerText =
    formatRupiah(p.price);

    const slider = document.getElementById('detImgs');

    // Cek apakah ada gambar detail (I-M)
    if (p.details && p.details.length > 0) {
        // Hanya tampilkan gambar detail 1-5
        slider.innerHTML = p.details.map(i => `<img src="${i}">`).join('');
    } else {
        // Kalau detail kosong, thumbnail baru muncul sebagai cadangan
        slider.innerHTML = `<img src="${p.thumbnail}">`;
    }

    slider.scrollLeft = 0; 

    // Render Warna
    let cHTML = `<div class="section-label">PILIH WARNA</div><div class="option-box">`;
    p.colors.forEach(c => {
        cHTML += `<div class="${cart.color === c ? 'active' : ''}" onclick="selOpt('color','${c}',this)">${c}</div>`;
    });
    document.getElementById('colorArea').innerHTML = cHTML + `</div>`;

    // Render Ukuran
    let sHTML = `<div class="section-label">PILIH UKURAN</div><div class="option-box">`;
    ["S", "M", "L", "XL", "XXL", "XXXL"].forEach(s => {
        const isAvail = p.stock.includes(s);
        sHTML += `<div class="${isAvail ? '' : 'disabled'}" onclick="${isAvail ? `selOpt('size','${s}',this)` : ''}">${s}</div>`;
    });
    document.getElementById('sizeArea').innerHTML = sHTML + `</div>`;

const dpBtn = document.getElementById('sumBtnDP');

if (p.dpAllowed === 'no') {
    if (dpBtn) dpBtn.style.display = 'none';
    pilihBayar('lunas');
} else {
    if (dpBtn) dpBtn.style.display = 'block';
}

    // Pindah halaman
    showPage('detail');
}

function selOpt(type, val, el) { vibrate(20); cart[type] = val; el.parentElement.querySelectorAll('div').forEach(d => d.classList.remove('active')); el.classList.add('active'); }
function triggerAlert(msg) {
    // Getar: 50ms, diam 50ms, getar 50ms (pola error)
    vibrate([50, 50, 50]); 
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show', 'shake');

    // Hapus efek goyang setelah 0.4 detik
    setTimeout(() => toast.classList.remove('shake'), 400);
    // Mengubah durasi toast
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function validateDetail() {
    if (!cart.color && !cart.size) return triggerAlert("PILIH WARNA & UKURAN!");
    if (!cart.color) return triggerAlert("PILIH WARNA!");
    if (!cart.size) return triggerAlert("PILIH UKURAN!");
    vibrate(40);
    showPage('form');
}

function validateForm() { vibrate(40);
    const n = document.getElementById('inName').value, p = document.getElementById('inPhone').value, a = document.getElementById('inAddress').value;
    if(!n || !p || !a) return triggerAlert("LENGKAPI DATA!");
    document.getElementById('sumProd').innerText = cart.prod.name;
    document.getElementById('sumVar').innerText = `${cart.color} | ${cart.size}`;
    document.getElementById('sumPrice').innerText =
    formatRupiah(cart.prod.price);
    document.getElementById('sumCust').innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;

if (cart.prod.dpAllowed === 'no') {

    document.getElementById('paymentTypeArea').style.display = 'none';
    document.getElementById('sumDpArea').style.display = 'none';
    tipeBayar = 'lunas';

} else {

    document.getElementById('paymentTypeArea').style.display = 'block';

}

    showPage('summary');
}

async function sendWA() { 
    vibrate(40);

    const n = document.getElementById('inName').value;
    const p = document.getElementById('inPhone').value;
    const a = document.getElementById('inAddress').value;
    const buktiFile = document.getElementById('inputBukti').files[0];
    const dp = tipeBayar === 'dp' ? document.getElementById('inDP').value : '';

    // Validasi bukti
    if (!buktiFile) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");
if (tipeBayar === 'dp' && !dp) return triggerAlert("ISI NOMINAL DP!");
if (tipeBayar === 'dp' && parseInt(dp) < 60000) return triggerAlert("DP MINIMAL Rp60.000!");

    // Tampilkan loading
    const btn = document.querySelector('#summary button[onclick="sendWA()"]');
    btn.innerText = 'UPLOADING...';
    btn.disabled = true;

    try {
        // 1. Upload bukti ke Cloudinary
        const { saveOrder } = await import('./firebase.js');
const buktiURL = uploadedBuktiURL;
if (!buktiURL) throw new Error("Gagal upload bukti");

        // 2. Data order
        const orderData = {
            nama: n,
            wa: p,
            alamat: a,
            produk: cart.prod.name,
            warna: cart.color,
            size: cart.size,
            harga: cart.prod.price,
            tipeBayar: tipeBayar,
            dp: dp,
            buktiURL: buktiURL
        };

        // 3. Simpan ke Firebase
        await saveOrder(orderData);

        // 4. Kirim ke Google Sheets
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwezvCW3_8uBhPEY9GrU_3Ue6MzAv1_GNhXauBZSI9Bj5QRAeeVitzLBtH5twBkSULVfA/exec';
        fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            cache: "no-cache",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({...orderData, buktiURL})
        }).catch(err => console.error("Gagal kirim ke spreadsheet:", err));

        // 5. Arahkan ke WhatsApp
        const infoBayar = tipeBayar === 'lunas' 
    ? 'LUNAS' 
    : `DP ${formatRupiah(dp)} dari ${formatRupiah(cart.prod.price)}`;

const text = `*FVCKTHERULES ORDER*\n\n*Produk:* ${cart.prod.name}\n*Warna:* ${cart.color}\n*Size:* ${cart.size}\n*Harga:* ${formatRupiah(cart.prod.price)}\n*Pembayaran:* ${infoBayar}\n\n*Data Pengiriman*\n*Nama:* ${n}\n*WhatsApp:* ${p}\n*Alamat:* ${a}\n\n*Bukti Bayar:*\n${buktiURL}`;
        window.open(`https://wa.me/6285725706337?text=${encodeURIComponent(text)}`);

    } catch (err) {
        console.error(err);
        triggerAlert("GAGAL! COBA LAGI.");
    } finally {
        btn.innerText = 'CHECKOUT (WA)';
        btn.disabled = false;
    }
}

function openSize() { document.getElementById('sizeModal').style.display='flex'; }
function closeSize() { document.getElementById('sizeModal').style.display='none'; }
function openSpecs() { 
    const text = cart.prod.specs ? cart.prod.specs.replace(/\\n/g, '<br>') : "Spesifikasi belum tersedia.";
    document.getElementById('specContent').innerHTML = text;
    document.getElementById('specsModal').style.display = 'flex'; 
}
function closeSpecs() { document.getElementById('specsModal').style.display = 'none'; }

// Fungsi untuk membuka modal QRIS
function openQRIS() { 
    vibrate(30); 
    document.getElementById('qrisModal').style.display = 'flex'; 
}

// Fungsi untuk menutup modal QRIS
function closeQRIS() { 
    document.getElementById('qrisModal').style.display = 'none'; 
}

function goDetailSilent(p) {
    document.getElementById('detName').innerText = p.name;
    document.getElementById('detPrice').innerText =
    formatRupiah(p.price);

    const slider = document.getElementById('detImgs');
    if (p.details && p.details.length > 0) {
        slider.innerHTML = p.details.map(i => `<img src="${i}">`).join('');
    } else {
        slider.innerHTML = `<img src="${p.thumbnail}">`;
    }
    slider.scrollLeft = 0;

    let cHTML = `<div class="section-label">PILIH WARNA</div><div class="option-box">`;
    p.colors.forEach(c => {
        cHTML += `<div class="${p.colors.length === 1 ? 'active' : ''}" onclick="selOpt('color','${c}',this)">${c}</div>`;
    });
    document.getElementById('colorArea').innerHTML = cHTML + `</div>`;

    let sHTML = `<div class="section-label">PILIH UKURAN</div><div class="option-box">`;
    ["S", "M", "L", "XL", "XXL", "XXXL"].forEach(s => {
        const isAvail = p.stock.includes(s);
        sHTML += `<div class="${isAvail ? '' : 'disabled'}" onclick="${isAvail ? `selOpt('size','${s}',this)` : ''}">${s}</div>`;
    });
    document.getElementById('sizeArea').innerHTML = sHTML + `</div>`;

const dpBtn = document.getElementById('sumBtnDP');

if (p.dpAllowed === 'no') {
    if (dpBtn) dpBtn.style.display = 'none';
    pilihBayar('lunas');
} else {
    if (dpBtn) dpBtn.style.display = 'block';
}
}

function showPageSilent(id) {
    const orderPages = ['detail', 'form', 'summary', 'cartPage', 'cartForm', 'cartSummary'];
    const menuBtn = document.querySelector('.menu-btn');
    if (orderPages.includes(id)) menuBtn.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

window.toggleSidebar = toggleSidebar;
window.navTo = navTo;
window.showPage = showPage;
window.goDetail = goDetail;
window.selOpt = selOpt;
window.validateDetail = validateDetail;
window.validateForm = validateForm;
window.sendWA = sendWA;
window.openSize = openSize;
window.closeSize = closeSize;
window.openSpecs = openSpecs;
window.closeSpecs = closeSpecs;
window.openQRIS = openQRIS;
window.closeQRIS = closeQRIS;
window.pilihBayar = pilihBayar;
window.previewBukti = previewBukti;
window.openImage = openImage;
window.closeImage = closeImage;
window.vibrate = vibrate;
window.navBack = navBack;
window.addToCart = addToCart;
window.removeCartItem = removeCartItem;
window.goToCartCheckout = goToCartCheckout;
window.validateCartForm = validateCartForm;
window.sendCartWA = sendCartWA;
window.previewCartBukti = previewCartBukti;
window.openCart = openCart;

function openCart() {
    vibrate(20);
    renderCartPage();
    showPage('cartPage');
}

function renderBannerSlider(banners) {
    const track = document.getElementById('bannerTrack');
    const dots = document.getElementById('bannerDots');
    if(!track || !dots) return;

    if (banners.length === 0) {
        document.querySelector('.banner-slider').style.display = 'none';
        return;
    }
    
    document.querySelector('.banner-slider').style.display = 'block';

    track.innerHTML = banners.map(b => `
        <div class="banner-slide">
            <img src="${b.image}">
            <div class="banner-content">
                ${b.title ? `<h3>${b.title}</h3>` : ''}
                ${b.subtitle ? `<p>${b.subtitle}</p>` : ''}
                ${b.link ? `<a href="#" onclick="navTo('${b.link}')">READ MORE</a>` : ''}
            </div>
        </div>
    `).join('');

    dots.innerHTML = banners.map((b, i) => `
        <span class="dot ${i===0?'active':''}" onclick="goToSlide(${i})"></span>
    `).join('');
}

