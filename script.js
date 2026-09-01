import { listenProduk, listenGaleri, listenBanners } from './firebase.js';

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
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.content = description;
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = description;
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
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
}

function formatRupiah(value) {
    return 'Rp' + Number(String(value).replace(/\D/g,'')).toLocaleString('id-ID');
}

let galleryImages = [];
let products = [];
let cart = { prod: null, size: '', color: '' };
let lastPage = 'home';
let cartItems = [];

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
        const floatingBtn = document.getElementById('floatingCartBtn');
        if (floatingBtn) floatingBtn.style.display = 'none';
        
        const cPage = document.getElementById('cartPage');
        if (cPage && cPage.classList.contains('active')) {
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
        const chkBtn = document.getElementById('cartCheckoutBtn');
        if (chkBtn) chkBtn.style.display = 'none';
        return;
    }

    const total = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);

    container.innerHTML = cartItems.map(item => `
        <div style="background:#ffffff; border:1px solid #eaeaea; border-radius:15px; padding:16px; margin-bottom:12px; display:flex; gap:14px; align-items:center;">
            <img src="${item.prod.thumbnail}" style="width:70px; height:70px; object-fit:cover; border-radius:10px; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <p style="font-weight:700; font-size:13px; margin:0 0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#000;">${item.prod.name}</p>
                <p style="font-size:11px; color:#888; margin:0 0 6px;">${item.color} | ${item.size}</p>
                <p style="font-size:13px; color:#000000; font-weight:700; margin:0;">${formatRupiah(item.prod.price)}</p>
            </div>
            <button onclick="removeCartItem(${item.id})" style="background:#f9f9f9; border:1px solid #eaeaea; color:#000000; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');

    const tEl = document.getElementById('cartTotal');
    if(tEl) tEl.innerText = formatRupiah(total);
    
    const chkBtn = document.getElementById('cartCheckoutBtn');
    if(chkBtn) chkBtn.style.display = 'block';
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

    const adaProdukTanpaDP = cartItems.some(item => item.prod.dpAllowed === 'no');
    const cartDpNote = document.getElementById('cartDpNoteArea');

    if (adaProdukTanpaDP) {
        if (cartDpNote) cartDpNote.style.display = 'none';
    } else {
        if (cartDpNote) {
            cartDpNote.style.display = 'block';
            cartDpNote.innerHTML = '<p style="font-size:13px; color:#000; font-weight:700; margin:0; text-align:center; padding:15px; border:1px solid #eaeaea; border-radius:12px; background:#f9f9f9;"><i class="fas fa-info-circle" style="margin-right:5px;"></i> Pembayaran dapat dilakukan secara Full (Lunas) atau DP minimal Rp70.000.</p>';
        }
    }

    const itemsHTML = cartItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #eaeaea;">
            <div>
                <p style="font-size:13px; font-weight:700; margin:0 0 3px; color:#000;">${item.prod.name}</p>
                <p style="font-size:11px; color:#888; margin:0;">${item.color} | ${item.size}</p>
            </div>
            <p style="font-size:13px; color:#000000; font-weight:700; margin:0; flex-shrink:0; margin-left:10px;">${formatRupiah(item.prod.price)}</p>
        </div>
    `).join('');

    const total = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);

    const sumItems = document.getElementById('cartSumItems');
    if (sumItems) sumItems.innerHTML = itemsHTML;
    
    const sumTotal = document.getElementById('cartSumTotal');
    if (sumTotal) sumTotal.innerText = formatRupiah(total);
    
    const sumCust = document.getElementById('cartSumCust');
    if (sumCust) sumCust.innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;
    
    showPage('cartSummary');
}

async function sendCartWA() {
    vibrate(40);
    const n = document.getElementById('cartInName').value;
    const p = document.getElementById('cartInPhone').value;
    const a = document.getElementById('cartInAddress').value;
    const inputB = document.getElementById('cartInputBukti');
    const buktiFile = inputB ? inputB.files[0] : null;
    
    if (!buktiFile) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");

    const btn = document.querySelector('#cartSummary button[onclick="sendCartWA()"]');
    if(btn) { btn.innerText = 'UPLOADING...'; btn.disabled = true; }

    try {
        const { saveOrder } = await import('./firebase.js');
        const buktiURL = uploadedCartBuktiURL;
        if (!buktiURL) throw new Error("Gagal upload bukti");

        const total = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);
        const produkList = cartItems.map(i => `- ${i.prod.name} (${i.color} | ${i.size}) — ${formatRupiah(i.prod.price)},`).join('\n');

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
            tipeBayar: 'Cek Bukti Bayar',
            dp: '',
            buktiURL
        };

        await saveOrder(orderData);

        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwT4_P20_b0UsbL4absLW6G7nNpK_PGfQv97VVjyJpcm622JzjAAAf6dzSKs-97jyfZvw/exec';
        fetch(SCRIPT_URL, { method:"POST", mode:"no-cors", cache:"no-cache", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(orderData) }).catch(err => console.error("Gagal kirim ke spreadsheet:", err));

        const text = `*FVCKTHERULES ORDER (KERANJANG)*\n\n*Produk:*\n${produkList}\n\n*Total:* ${formatRupiah(total)}\n\n*Data Pengiriman*\n*Nama:* ${n}\n*WhatsApp:* ${p}\n*Alamat:* ${a}\n\n*Bukti Bayar:*\n${buktiURL}`;
        window.open(`https://wa.me/6285725706337?text=${encodeURIComponent(text)}`);

        cartItems = [];
        updateCartBadge();
        uploadedCartBuktiURL = null;
    } catch(err) {
        console.error(err);
        triggerAlert("GAGAL! COBA LAGI.");
    } finally {
        if(btn) { btn.innerText = 'CHECKOUT (WA)'; btn.disabled = false; }
    }
}

let uploadedCartBuktiURL = null;
async function previewCartBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('cartPreviewImg');
        if(!previewImg) return;
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
    
    const label = document.getElementById('cartLabelBukti');
    if (label) label.innerText = ' Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedCartBuktiURL = await uploadGambar(file, 'bukti');

    const previewImg = document.getElementById('cartPreviewImg');
    const spinner = document.getElementById('cartSpinnerOverlay');
    if (spinner) spinner.remove();

    if (uploadedCartBuktiURL) {
        if(previewImg) { previewImg.style.opacity = '1'; previewImg.style.filter = 'none'; }
        if (label) label.innerText = ' Upload berhasil!';
    } else {
        if(previewImg) previewImg.style.display = 'none';
        if (label) label.innerText = ' Gagal upload, coba lagi';
        uploadedCartBuktiURL = null;
    }
}

let uploadedBuktiURL = null;
async function previewBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('previewImg');
        if(!previewImg) return;
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
        previewImg.style.opacity = '0.4';
        previewImg.style.filter = 'blur(2px)';
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
    
    const label = document.getElementById('labelBukti');
    if(label) label.innerText = '⏳ Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedBuktiURL = await uploadGambar(file, 'bukti');

    const previewImg = document.getElementById('previewImg');
    const spinner = document.getElementById('spinnerOverlay');
    if (spinner) spinner.remove();

    if (uploadedBuktiURL) {
        if (previewImg) { previewImg.style.opacity = '1'; previewImg.style.filter = 'none'; }
        if (label) label.innerText = '✓ Upload berhasil!';
    } else {
        if (previewImg) previewImg.style.display = 'none';
        if (label) label.innerText = '✗ Gagal upload, coba lagi';
        uploadedBuktiURL = null;
    }
}

window.onload = async () => {
    try {
        history.replaceState({ page: 'home' }, '', window.location.pathname);
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

            products.sort((a, b) => (b.order || 0) - (a.order || 0));
            renderAllSections();

            const path = window.location.pathname.replace(/^\//, '').toLowerCase();
            const orderMatch = path.match(/^([^\/]+)$/) || path.match(/^([^\/]+)\/$/) || path.match(/^([^\/]+)\/detail$/) || path.match(/^([^\/]+)\/form$/) || path.match(/^([^\/]+)\/summary$/);
            
            if (orderMatch) {
                const productSlug = orderMatch[1];
                let pageId = 'detail';
                if (path.endsWith('/form')) pageId = 'form';
                if (path.endsWith('/summary')) pageId = 'summary';

                const found = products.find(p => slugify(p.name) === productSlug);

                if (found) {
                    cart = { prod: found, size: '', color: found.colors.length === 1 ? found.colors[0] : '' };
                    goDetailSilent(found);
                    showPageSilent(pageId);
                    if (!document.referrer.includes(window.location.hostname)) {
                        history.replaceState({ page: 'home' }, '', '/');
                        history.pushState({ page: 'detail', product: productSlug }, '', `/${productSlug}`);
                    }
                } else {
                    history.replaceState({ page: 'home' }, '', '/');
                    showPage('home');
                }
            } else {
                const targetPage = SLUG_TO_PAGE[path] || 'home';
                if (targetPage !== 'home') showPage(targetPage);
            }
        });

        listenGaleri((firestoreGaleri) => {
            galleryImages = firestoreGaleri.map(g => g.url);
            renderGallery();
        });
    } catch (error) {
        console.error("Initialization Error:", error);
    } finally {
        // FAIL-SAFE LOADING SCREEN REMOVER
        setTimeout(() => {
            const loader = document.getElementById('loader');
            if (loader) loader.classList.add('hide');
        }, 1000);
    }

    const orderPages = ['detail', 'form', 'summary', 'cartPage', 'cartForm', 'cartSummary'];
    window.addEventListener('popstate', (e) => {
        const page = e.state?.page || 'home';
        const menuBtn = document.querySelector('.menu-btn');

        if (orderPages.includes(page) && !cart.prod) {
            history.replaceState({ page: 'home' }, '', '/');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const pHome = document.getElementById('home');
            if(pHome) pHome.classList.add('active');
            if(menuBtn) menuBtn.style.display = 'flex';
            return;
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        if(document.getElementById(page)) {
            document.getElementById(page).classList.add('active');
            document.getElementById(page).scrollTop = 0;
        }

        if (orderPages.includes(page)) {
            if(menuBtn) menuBtn.style.display = 'none';
        } else {
            if(menuBtn) menuBtn.style.display = 'flex';
            lastPage = page;
        }
    });
};

function renderAllSections() { 
    renderList(products.filter(p => p.showcase === 'yes'), 'list-home');
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
                <img src="${p.thumbnail}"> 
                <div style="padding:25px">
                    <h3>${p.name}</h3>
                    <p style="opacity:0.5; font-weight:600;">${isSold ? 'OUT OF STOCK' : formatRupiah(p.price)}</p>
                    <button onclick="sessionStorage.setItem('lastPage', document.querySelector('.page.active') ? document.querySelector('.page.active').id : 'home'); vibrate(40); goDetail('${p.id}');" ${isSold ? 'disabled' : ''}>
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
        container.innerHTML += `<img src="${img}" loading="lazy" onclick="vibrate(20); openImage('${img}')">`;
    });
}

function openImage(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImg');
    if(modalImg) modalImg.src = src;
    if(modal) modal.style.display = 'flex';
    vibrate(20);
}

function closeImage() {
    const modal = document.getElementById('imageModal');
    if(modal) modal.style.display = 'none';
}

function injectFooters() {
    const footerHTML = `
        <footer>
            <!-- BAGIAN LOGO GAMBAR DIPERBESAR & DIMEPETKAN -->
            <div class="footer-logo" style="margin-bottom: -40px;">
                <img src="https://res.cloudinary.com/dfbxrouwf/image/upload/v1788256148/Tak_berjudul26_20260901160311_g4gy1e.png" alt="Logo" style="width: 270px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
            </div>
            
            <div class="footer-slogan" style="margin-top: 5px;">BORN TO DISOBEY</div>
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
            <p class="copyright">© 2026 LOVO. All rights reserved.</p>
        </footer>`;

    ['home', 'pre', 'kat', 'ars', 'about', 'galeri'].forEach(id => {
        const el = document.getElementById(`footer-${id}`);
        if(el) el.innerHTML = footerHTML;
    });
}


function toggleSidebar() {
    vibrate(20);
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar) sidebar.classList.toggle('open');
    if(overlay) overlay.classList.toggle('show');
}

function navTo(pageId) { 
    toggleSidebar(); 
    showPage(pageId); 
}

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

    if (orderPages.includes(id) && cart.prod) {
        const productSlug = slugify(cart.prod.name);
        let url = `/${productSlug}`;
        if (id === 'form') url = `/${productSlug}/form`;
        if (id === 'summary') url = `/${productSlug}/summary`;
        history.pushState({ page: id, product: productSlug }, '', url);
    }
    
    if (orderPages.includes(id)) {
        if(menuBtn) menuBtn.style.display = 'none';
    } else {
        if(menuBtn) menuBtn.style.display = 'flex';
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if(document.getElementById(id)) {
        document.getElementById(id).classList.add('active');
        document.getElementById(id).scrollTop = 0;
    }
}

function navBack() {
    vibrate(30);
    if (window.history.length > 1) {
        history.back();
        return;
    }
    showPage(lastPage || 'home');
}

function goDetail(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    if (document.getElementById('sidebar')?.classList.contains('open')) {
        toggleSidebar();
    }

    cart = { prod: p, size: '', color: p.colors.length === 1 ? p.colors[0] : '' };

    const elName = document.getElementById('detName');
    if(elName) elName.innerText = p.name;
    
    const elPrice = document.getElementById('detPrice');
    if(elPrice) elPrice.innerText = formatRupiah(p.price);

    const slider = document.getElementById('detImgs');
    if(slider) {
        if (p.details && p.details.length > 0) {
            slider.innerHTML = p.details.map(i => `<img src="${i}">`).join('');
        } else {
            slider.innerHTML = `<img src="${p.thumbnail}">`;
        }
        slider.scrollLeft = 0; 
    }

    let cHTML = `<div class="section-label">PILIH WARNA</div><div class="option-box">`;
    p.colors.forEach(c => {
        cHTML += `<div class="${cart.color === c ? 'active' : ''}" onclick="selOpt('color','${c}',this)">${c}</div>`;
    });
    const colArea = document.getElementById('colorArea');
    if(colArea) colArea.innerHTML = cHTML + `</div>`;

    let sHTML = `<div class="section-label">PILIH UKURAN</div><div class="option-box">`;
    ["S", "M", "L", "XL", "XXL", "XXXL"].forEach(s => {
        const isAvail = p.stock.includes(s);
        sHTML += `<div class="${isAvail ? '' : 'disabled'}" onclick="${isAvail ? `selOpt('size','${s}',this)` : ''}">${s}</div>`;
    });
    const szArea = document.getElementById('sizeArea');
    if(szArea) szArea.innerHTML = sHTML + `</div>`;

    showPage('detail');
}

function selOpt(type, val, el) { 
    vibrate(20); 
    cart[type] = val; 
    el.parentElement.querySelectorAll('div').forEach(d => d.classList.remove('active')); 
    el.classList.add('active'); 
}

function triggerAlert(msg) {
    vibrate([50, 50, 50]); 
    const toast = document.getElementById('toast');
    if(toast) {
        toast.innerText = msg;
        toast.classList.add('show', 'shake');
        setTimeout(() => toast.classList.remove('shake'), 400);
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
}

function validateDetail() {
    if (!cart.color && !cart.size) return triggerAlert("PILIH WARNA & UKURAN!");
    if (!cart.color) return triggerAlert("PILIH WARNA!");
    if (!cart.size) return triggerAlert("PILIH UKURAN!");
    vibrate(40);
    showPage('form');
}

function validateForm() { 
    vibrate(40);
    const n = document.getElementById('inName').value, p = document.getElementById('inPhone').value, a = document.getElementById('inAddress').value;
    if(!n || !p || !a) return triggerAlert("LENGKAPI DATA!");
    
    const sumP = document.getElementById('sumProd');
    if(sumP) sumP.innerText = cart.prod.name;
    
    const sumV = document.getElementById('sumVar');
    if(sumV) sumV.innerText = `${cart.color} | ${cart.size}`;
    
    const sumPr = document.getElementById('sumPrice');
    if(sumPr) sumPr.innerText = formatRupiah(cart.prod.price);
    
    const sumC = document.getElementById('sumCust');
    if(sumC) sumC.innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;

    const dpNote = document.getElementById('dpNoteArea');
    if (cart.prod.dpAllowed === 'no') {
        if (dpNote) dpNote.style.display = 'none';
    } else {
        if (dpNote) {
            dpNote.style.display = 'block';
            dpNote.innerHTML = '<p style="font-size:13px; color:#000; font-weight:700; margin:0; text-align:center; padding:15px; border:1px solid #eaeaea; border-radius:12px; background:#f9f9f9;"><i class="fas fa-info-circle" style="margin-right:5px;"></i> Pembayaran dapat dilakukan secara Full (Lunas) atau DP minimal Rp70.000.</p>';
        }
    }
    
    showPage('summary');
}

async function sendWA() { 
    vibrate(40);
    const n = document.getElementById('inName').value;
    const p = document.getElementById('inPhone').value;
    const a = document.getElementById('inAddress').value;
    const inputB = document.getElementById('inputBukti');
    const buktiFile = inputB ? inputB.files[0] : null;
    
    if (!buktiFile) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");

    const btn = document.querySelector('#summary button[onclick="sendWA()"]');
    if(btn) { btn.innerText = 'UPLOADING...'; btn.disabled = true; }

    try {
        const { saveOrder } = await import('./firebase.js');
        const buktiURL = uploadedBuktiURL;
        if (!buktiURL) throw new Error("Gagal upload bukti");

        const orderData = {
            nama: n,
            wa: p,
            alamat: a,
            produk: cart.prod.name,
            warna: cart.color,
            size: cart.size,
            harga: cart.prod.price,
            tipeBayar: 'Cek Bukti Bayar',
            dp: '',
            buktiURL: buktiURL
        };

        await saveOrder(orderData);

        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwezvCW3_8uBhPEY9GrU_3Ue6MzAv1_GNhXauBZSI9Bj5QRAeeVitzLBtH5twBkSULVfA/exec';
        fetch(SCRIPT_URL, {
            method: "POST", mode: "no-cors", cache: "no-cache", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({...orderData, buktiURL})
        }).catch(err => console.error("Gagal kirim ke spreadsheet:", err));

        const text = `*FVCKTHERULES ORDER*\n\n*Produk:* ${cart.prod.name}\n*Warna:* ${cart.color}\n*Size:* ${cart.size}\n*Harga:* ${formatRupiah(cart.prod.price)}\n\n*Data Pengiriman*\n*Nama:* ${n}\n*WhatsApp:* ${p}\n*Alamat:* ${a}\n\n*Bukti Bayar:*\n${buktiURL}`;
        window.open(`https://wa.me/6285725706337?text=${encodeURIComponent(text)}`);

    } catch (err) {
        console.error(err);
        triggerAlert("GAGAL! COBA LAGI.");
    } finally {
        if(btn) { btn.innerText = 'CHECKOUT (WA)'; btn.disabled = false; }
    }
}

function openSize() { const m=document.getElementById('sizeModal'); if(m) m.style.display='flex'; }
function closeSize() { const m=document.getElementById('sizeModal'); if(m) m.style.display='none'; }
function openSpecs() { 
    const text = cart.prod.specs ? cart.prod.specs.replace(/\\n/g, '<br>') : "Spesifikasi belum tersedia.";
    const el = document.getElementById('specContent');
    const m = document.getElementById('specsModal');
    if(el) el.innerHTML = text;
    if(m) m.style.display = 'flex'; 
}
function closeSpecs() { const m=document.getElementById('specsModal'); if(m) m.style.display = 'none'; }
function openQRIS() { vibrate(30); const m=document.getElementById('qrisModal'); if(m) m.style.display = 'flex'; }
function closeQRIS() { const m=document.getElementById('qrisModal'); if(m) m.style.display = 'none'; }

function goDetailSilent(p) {
    const elName = document.getElementById('detName');
    if(elName) elName.innerText = p.name;
    
    const elPrice = document.getElementById('detPrice');
    if(elPrice) elPrice.innerText = formatRupiah(p.price);

    const slider = document.getElementById('detImgs');
    if(slider) {
        if (p.details && p.details.length > 0) {
            slider.innerHTML = p.details.map(i => `<img src="${i}">`).join('');
        } else {
            slider.innerHTML = `<img src="${p.thumbnail}">`;
        }
        slider.scrollLeft = 0;
    }

    let cHTML = `<div class="section-label">PILIH WARNA</div><div class="option-box">`;
    p.colors.forEach(c => {
        cHTML += `<div class="${p.colors.length === 1 ? 'active' : ''}" onclick="selOpt('color','${c}',this)">${c}</div>`;
    });
    const colArea = document.getElementById('colorArea');
    if(colArea) colArea.innerHTML = cHTML + `</div>`;

    let sHTML = `<div class="section-label">PILIH UKURAN</div><div class="option-box">`;
    ["S", "M", "L", "XL", "XXL", "XXXL"].forEach(s => {
        const isAvail = p.stock.includes(s);
        sHTML += `<div class="${isAvail ? '' : 'disabled'}" onclick="${isAvail ? `selOpt('size','${s}',this)` : ''}">${s}</div>`;
    });
    const szArea = document.getElementById('sizeArea');
    if(szArea) szArea.innerHTML = sHTML + `</div>`;
}

function showPageSilent(id) {
    const orderPages = ['detail', 'form', 'summary', 'cartPage', 'cartForm', 'cartSummary'];
    const menuBtn = document.querySelector('.menu-btn');
    if (orderPages.includes(id) && menuBtn) menuBtn.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if(document.getElementById(id)) document.getElementById(id).classList.add('active');
}

function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

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
window.goToSlide = goToSlide;

function openCart() {
    vibrate(20);
    renderCartPage();
    showPage('cartPage');
}

function renderBannerSlider(banners) {
    const track = document.getElementById('bannerTrack');
    const dots = document.getElementById('bannerDots');
    const sliderContainer = document.querySelector('.banner-slider');
    if(!track || !dots || !sliderContainer) return;

    if (banners.length === 0) {
        sliderContainer.style.display = 'none';
        return;
    }
    sliderContainer.style.display = 'block';

    track.innerHTML = banners.map(b => `
        <div class="banner-slide">
            <img src="${b.image}">
            <div class="banner-content">
                ${b.title ? `<h3>${b.title}</h3>` : ''}
                ${b.subtitle ? `<p>${b.subtitle}</p>` : ''}
                ${b.link ? `<a onclick="navTo('${b.link}')" style="cursor:pointer;">READ MORE</a>` : ''}
            </div>
        </div>
    `).join('');

    dots.innerHTML = banners.map((b, i) => `
        <span class="dot ${i===0?'active':''}" onclick="goToSlide(${i})"></span>
    `).join('');
}

function goToSlide(index) {
    const track = document.getElementById('bannerTrack');
    if(track) track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('bannerTrack');
    if(track) {
        track.addEventListener('scroll', () => {
            const dots = document.querySelectorAll('#bannerDots .dot');
            if (dots.length > 0) {
                let index = Math.round(track.scrollLeft / track.clientWidth);
                dots.forEach(d => d.classList.remove('active'));
                if(dots[index]) dots[index].classList.add('active');
            }
        });
    }
});
