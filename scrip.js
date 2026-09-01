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

let tipeBayar = 'lunas'; // default lunas

function pilihBayar(tipe) {
    tipeBayar = tipe;
    if (tipe === 'lunas') {
        document.getElementById('btnLunas').style.cssText = 'padding:16px; border:1.5px solid #fff; border-radius:12px; text-align:center; font-weight:700; font-size:13px; cursor:pointer; background:#fff; color:#000;';
        document.getElementById('btnDP').style.cssText = 'padding:16px; border:1.5px solid #1a1a1a; border-radius:12px; text-align:center; font-weight:700; font-size:13px; cursor:pointer; background:#050505; color:#fff;';
        document.getElementById('dpArea').style.display = 'none';
    } else {
        document.getElementById('btnDP').style.cssText = 'padding:16px; border:1.5px solid #fff; border-radius:12px; text-align:center; font-weight:700; font-size:13px; cursor:pointer; background:#fff; color:#000;';
        document.getElementById('btnLunas').style.cssText = 'padding:16px; border:1.5px solid #1a1a1a; border-radius:12px; text-align:center; font-weight:700; font-size:13px; cursor:pointer; background:#050505; color:#fff;';
        document.getElementById('dpArea').style.display = 'block';
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

    

    const orderPages = ['detail', 'form', 'summary'];
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
                <a href="https://wa.me/6283898588562" target="_blank" onclick="vibrate(30)"><i class="fab fa-whatsapp"></i></a>
                <a href="https://shopee.co.id/fvcktherules__" target="_blank" onclick="vibrate(30)"><i class="fas fa-shopping-bag"></i></a>
            </div>
            <div class="footer-contact-title">KONTAK KAMI :</div>
            <div class="footer-contact-info">
                Saluran WhatsApp : <a href="https://whatsapp.com/channel/0029Vb7jjbj8vd1GK8ZiTz0y" target="_blank"><i class="fab fa-whatsapp"></i> Klik Disini</a><br>
                WhatsApp : <a href="https://wa.me/6283898588562">083898588562</a><br>
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
    const orderPages = ['detail', 'form', 'summary'];

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

const dpBtn = document.getElementById('btnDP');

if (p.dpAllowed === 'no') {
    dpBtn.style.display = 'none';

    // paksa kembali lunas
    pilihBayar('lunas');

} else {
    dpBtn.style.display = 'block';
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
    document.getElementById('dpArea').style.display = 'none';
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
        window.open(`https://wa.me/6283898588562?text=${encodeURIComponent(text)}`);

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

const dpBtn = document.getElementById('btnDP');

if (p.dpAllowed === 'no') {
    dpBtn.style.display = 'none';
    pilihBayar('lunas');
} else {
    dpBtn.style.display = 'block';
}
}

function showPageSilent(id) {
    const orderPages = ['detail', 'form', 'summary'];
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
