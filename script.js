import { listenProduk, listenGaleri, listenBanners, listenBannerText } from './firebase.js';

let cartItems = [];
const URL_GAS_BITESHIP = "https://script.google.com/macros/s/AKfycbzresFL79C_eCXYaAEFOzBQn9DAyiiefPuqZv--U2gV1BqNA1sIvBL0dgvenTl-l8wUAQ/exec"; 
let ongkirSaatIni = 0;
let timeoutCari;

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

    const alamatDetail = document.getElementById('cartInAddress').value;
    const prov = document.getElementById('cartInProvinsi').value;
    const kota = document.getElementById('cartInKota').value;
    const kec = document.getElementById('cartInKecamatan').value;
    const kel = document.getElementById('cartInKelurahan').value;
    const kodePos = document.getElementById('cartInKodePos').value;

    const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

    if (!n || !p || !alamatDetail || !prov || !kel) return triggerAlert("LENGKAPI DATA!");

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

    const idAreaCart = document.getElementById('cartInAreaId');
    if(!idAreaCart || !idAreaCart.value || ongkirSaatIni === 0) return triggerAlert("TUNGGU ONGKIR MUNCUL DULU!");

    const sumTotal = document.getElementById('cartSumTotal');
    if (sumTotal) sumTotal.innerText = formatRupiah(total + ongkirSaatIni);

    const sumCust = document.getElementById('cartSumCust');
    if (sumCust) sumCust.innerHTML = `<strong>${n}</strong><br>${p}<br>${a}`;

    showPage('cartSummary');
}

let currentCheckoutType = '';

function confirmCheckout(type) {
    vibrate(30);
    if (type === 'single') {
        const inputB = document.getElementById('inputBukti');
        if (!inputB || !inputB.files[0]) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");
        if (!uploadedBuktiURL) return triggerAlert("TUNGGU UPLOAD SELESAI!");
    } else {
        const inputB = document.getElementById('cartInputBukti');
        if (!inputB || !inputB.files[0]) return triggerAlert("UPLOAD BUKTI BAYAR DULU!");
        if (!uploadedCartBuktiURL) return triggerAlert("TUNGGU UPLOAD SELESAI!");
    }

    currentCheckoutType = type;
    const m = document.getElementById('confirmModal');
    if(m) m.style.display = 'flex';
}

function closeConfirm() {
    vibrate(20);
    const m = document.getElementById('confirmModal');
    if(m) m.style.display = 'none';
}

async function executeCheckout() {
    vibrate(40);
    closeConfirm();

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzresFL79C_eCXYaAEFOzBQn9DAyiiefPuqZv--U2gV1BqNA1sIvBL0dgvenTl-l8wUAQ/exec';
    const loader = document.getElementById('loader');
    if(loader) loader.classList.remove('hide');

    try {
        const { saveOrder } = await import('./firebase.js');

        if (currentCheckoutType === 'single') {
            const n = document.getElementById('inName').value;
            const p = document.getElementById('inPhone').value;

            const alamatDetail = document.getElementById('inAddress').value;
            const prov = document.getElementById('inProvinsi').value;
            const kota = document.getElementById('inKota').value;
            const kec = document.getElementById('inKecamatan').value;
            const kel = document.getElementById('inKelurahan').value;
            const kodePos = document.getElementById('inKodePos').value;
            const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

            const buktiURL = uploadedBuktiURL;
            const hargaProduk = Number(String(cart.prod.price).replace(/\D/g,''));
            const totalHargaPlusOngkir = hargaProduk + ongkirSaatIni;

            const orderData = {
                nama: n, 
                wa: p, 
                alamat: a,
                produk: cart.prod.name, 
                warna: cart.color, 
                size: cart.size,
                harga: totalHargaPlusOngkir,
                ongkir: ongkirSaatIni,
                tipeBayar: 'Cek Bukti Bayar', 
                dp: '',
                buktiURL: buktiURL
            };

            await saveOrder(orderData);

            fetch(SCRIPT_URL, {
                method: "POST", mode: "no-cors", cache: "no-cache", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(orderData)
            }).catch(err => console.error("Gagal kirim ke spreadsheet:", err));

            hapusBukti('inputBukti', 'fileChip', 'previewImg', 'labelBukti');
            document.getElementById('inName').value = '';
            document.getElementById('inPhone').value = '';
            document.getElementById('inAddress').value = '';
            cart = { prod: null, size: '', color: '' };

        } else if (currentCheckoutType === 'cart') {
            const n = document.getElementById('cartInName').value;
            const p = document.getElementById('cartInPhone').value;

            const alamatDetail = document.getElementById('cartInAddress').value;
            const prov = document.getElementById('cartInProvinsi').value;
            const kota = document.getElementById('cartInKota').value;
            const kec = document.getElementById('cartInKecamatan').value;
            const kel = document.getElementById('cartInKelurahan').value;
            const kodePos = document.getElementById('cartInKodePos').value;
            const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

            const buktiURL = uploadedCartBuktiURL;
            const totalProduk = cartItems.reduce((sum, i) => sum + Number(String(i.prod.price).replace(/\D/g,'')), 0);
            const totalHargaPlusOngkir = totalProduk + ongkirSaatIni;

            const orderData = {
                nama: n, 
                wa: p, 
                alamat: a,
                produk: cartItems.map(i => ({ nama: i.prod.name, warna: i.color, size: i.size, harga: i.prod.price })),
                produkText: cartItems.map(i => `${i.prod.name} (${i.color}|${i.size})`).join(', '),
                harga: totalHargaPlusOngkir,
                ongkir: ongkirSaatIni,
                tipeBayar: 'Cek Bukti Bayar', 
                dp: '',
                buktiURL
            };

            await saveOrder(orderData);

            fetch(SCRIPT_URL, { 
                method:"POST", mode:"no-cors", cache:"no-cache", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(orderData) 
            }).catch(err => console.error(err));

            cartItems = [];
            updateCartBadge();
            hapusBukti('cartInputBukti', 'cartFileChip', 'cartPreviewImg', 'cartLabelBukti');
            document.getElementById('cartInName').value = '';
            document.getElementById('cartInPhone').value = '';
            document.getElementById('cartInAddress').value = '';
        }

        showPage('home');
        setTimeout(() => {
            triggerAlert("PESANAN BERHASIL DITERIMA!");
        }, 500);

    } catch (err) {
        console.error(err);
        triggerAlert("GAGAL MENYIMPAN! COBA LAGI.");
    } finally {
        if(loader) loader.classList.add('hide'); 
    }
}

let uploadedCartBuktiURL = null;
async function previewCartBukti(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('cartPreviewImg');
        const fileChip = document.getElementById('cartFileChip');
        const fileName = document.getElementById('cartFileName');

        if(previewImg) previewImg.src = e.target.result;
        if(fileName) fileName.innerText = file.name;
        if(fileChip) {
            fileChip.style.display = 'flex';
            fileChip.style.opacity = '0.5'; 
        }
    };
    reader.readAsDataURL(file);

    const label = document.getElementById('cartLabelBukti');
    if (label) label.innerText = ' Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedCartBuktiURL = await uploadGambar(file, 'bukti');

    const fileChip = document.getElementById('cartFileChip');
    if (uploadedCartBuktiURL) {
        if(fileChip) fileChip.style.opacity = '1';
        if (label) label.innerText = ' ✓ Upload berhasil!';
    } else {
        if(fileChip) fileChip.style.display = 'none';
        if (label) label.innerText = ' ✗ Gagal upload, coba lagi';
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
        const fileChip = document.getElementById('fileChip');
        const fileName = document.getElementById('fileName');

        if(previewImg) previewImg.src = e.target.result;
        if(fileName) fileName.innerText = file.name;
        if(fileChip) {
            fileChip.style.display = 'flex';
            fileChip.style.opacity = '0.5'; 
        }
    };
    reader.readAsDataURL(file);

    const label = document.getElementById('labelBukti');
    if(label) label.innerText = ' Mengupload...';

    const { uploadGambar } = await import('./firebase.js');
    uploadedBuktiURL = await uploadGambar(file, 'bukti');

    const fileChip = document.getElementById('fileChip');
    if (uploadedBuktiURL) {
        if (fileChip) fileChip.style.opacity = '1';
        if (label) label.innerText = '✓ Upload berhasil!';
    } else {
        if (fileChip) fileChip.style.display = 'none';
        if (label) label.innerText = '✗ Gagal upload, coba lagi';
        uploadedBuktiURL = null;
    }
}

function hapusBukti(inputId, chipId, imgId, labelId) {
    vibrate(20);
    document.getElementById(inputId).value = '';
    const chip = document.getElementById(chipId);
    if(chip) chip.style.display = 'none';
    const img = document.getElementById(imgId);
    if(img) img.src = '';
    const lbl = document.getElementById(labelId);
    if(lbl) lbl.innerText = 'Tap untuk upload foto bukti';

    if (inputId === 'inputBukti') {
        uploadedBuktiURL = null;
    } else {
        uploadedCartBuktiURL = null;
    }
}

window.onload = async () => {
    try {
        history.replaceState({ page: 'home' }, '', window.location.pathname);

        initProvinsiDropdown();

        listenBannerText((data) => {
            const barAtas = document.getElementById('barAtas');
            const barBawah = document.getElementById('barBawah');

            if (data.topText && data.topText.trim() !== "") {
                barAtas.innerText = data.topText;
                barAtas.style.display = 'block';
            } else {
                barAtas.style.display = 'none';
            }

            if (data.bottomText && data.bottomText.trim() !== "") {
                barBawah.innerText = data.bottomText;
                barBawah.style.display = 'block';
            } else {
                barBawah.style.display = 'none';
            }
        });

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
            <div class="footer-logo" style="margin-bottom: -40px;">
                <img src="https://res.cloudinary.com/dfbxrouwf/image/upload/v1788256148/Tak_berjudul26_20260901160311_g4gy1e.png" alt="Logo" style="width: 270px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
            </div>
            
            <div class="footer-slogan" style="margin-top: 5px;">BORN TO DISOBEY</div>
            <div class="footer-socials">
                <a href="https://www.instagram.com/fucktherules.exe?igsi=cDYyZDRnenR3MTY0" target="_blank" onclick="vibrate(30)"><i class="fab fa-instagram"></i></a>
                <a href="https://wa.me/6285725706337" target="_blank" onclick="vibrate(30)"><i class="fab fa-whatsapp"></i></a>
                <a href="https://shopee.co.id/fvcktherules__" target="_blank" onclick="vibrate(30)"><i class="fas fa-shopping-bag"></i></a>
            </div>
            <div class="footer-contact-title">KONTAK KAMI :</div>
            <div class="footer-contact-info">
                Saluran WhatsApp : <a href="https://whatsapp.com/channel/0029VbD2hZqEKyZQXCFpkD2p" target="_blank"><i class="fab fa-whatsapp"></i> Klik Disini</a><br>
                WhatsApp : <a href="https://wa.me/6285725706337">085725706337</a><br>
                Email : <a href="mailto:fucktherules34@gmail.com">fucktherules34@gmail.com</a>
            </div>
            <p class="copyright">© 2026 FVCKTHERULES. All rights reserved.</p>
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
    const n = document.getElementById('inName').value;
    const p = document.getElementById('inPhone').value;

    const alamatDetail = document.getElementById('inAddress').value;
    const prov = document.getElementById('inProvinsi').value;
    const kota = document.getElementById('inKota').value;
    const kec = document.getElementById('inKecamatan').value;
    const kel = document.getElementById('inKelurahan').value;
    const kodePos = document.getElementById('inKodePos').value;

    const a = `${alamatDetail}, ${kel}, Kec. ${kec}, ${kota}, ${prov} ${kodePos}`;

    if(!n || !p || !alamatDetail || !prov || !kel) return triggerAlert("LENGKAPI DATA!");

    const sumP = document.getElementById('sumProd');
    if(sumP) sumP.innerText = cart.prod.name;

    const sumV = document.getElementById('sumVar');
    if(sumV) sumV.innerText = `${cart.color} | ${cart.size}`;

    const idArea = document.getElementById('inAreaId');
    if(!idArea || !idArea.value || ongkirSaatIni === 0) return triggerAlert("TUNGGU ONGKIR MUNCUL DULU!");

    const hargaProduk = Number(String(cart.prod.price).replace(/\D/g,''));
    const sumPr = document.getElementById('sumPrice');
    if(sumPr) sumPr.innerText = formatRupiah(hargaProduk + ongkirSaatIni);

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

// ══════════════════════════════════════════════════════════════
// SISTEM DROPDOWN WILAYAH (ganti "ketik & cari")
// Data provinsi/kota/kecamatan dari API Statis Wilayah Indonesia (emsifa, v2).
// Sumber: cahyadsn/wilayah, merujuk Kepmendagri & BIG.
// Setelah kecamatan dipilih, otomatis dicocokkan ke Biteship (backend ongkir
// kamu yang sudah ada) supaya ongkir tetap terhitung seperti biasa.
// ══════════════════════════════════════════════════════════════
const WILAYAH_API = "https://www.emsifa.com/api-wilayah-indonesia/v2";

// Data v2 biasanya sudah Title Case ("Aceh", "Sumatera Utara"), tapi fungsi ini
// dijaga sebagai pengaman kalau ada data yang masih UPPERCASE, sekaligus
// mempertahankan singkatan umum (DKI, DIY, dst) tetap kapital semua.
const WILAYAH_ACRONYMS = ['DKI', 'DIY', 'NAD', 'NTB', 'NTT'];
function titleCaseWilayah(str) {
    if (!str) return str;
    return str
        .toLowerCase()
        .split(' ')
        .map(word => {
            const upper = word.toUpperCase();
            if (WILAYAH_ACRONYMS.includes(upper)) return upper;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

// Helper fetch dengan 1x retry singkat (buat koneksi yang cuma putus sesaat).
// Response API v2 dibungkus { data, meta }, jadi kita ambil .data-nya.
async function fetchWilayah(path) {
    try {
        const res = await fetch(`${WILAYAH_API}${path}`);
        if (!res.ok) throw new Error('Response tidak ok');
        const json = await res.json();
        return json.data || json;
    } catch (e) {
        await new Promise(r => setTimeout(r, 800));
        const res2 = await fetch(`${WILAYAH_API}${path}`);
        if (!res2.ok) throw new Error('Gagal setelah retry');
        const json2 = await res2.json();
        return json2.data || json2;
    }
}

async function initProvinsiDropdown() {
    const p1 = document.getElementById('inProvinsi');
    const p2 = document.getElementById('cartInProvinsi');
    try {
        const data = await fetchWilayah('/provinces.json');
        const opts = (data || []).map(p => `<option value="${titleCaseWilayah(p.name)}" data-code="${p.id}">${titleCaseWilayah(p.name)}</option>`).join('');
        const html = `<option value="">Pilih Provinsi...</option>${opts}`;
        if (p1) p1.innerHTML = html;
        if (p2) p2.innerHTML = html;
    } catch (e) {
        console.error('Gagal memuat provinsi:', e);
        const errHtml = '<option value="">Gagal memuat, cek koneksi</option>';
        if (p1) p1.innerHTML = errHtml;
        if (p2) p2.innerHTML = errHtml;
        triggerAlert("GAGAL MUAT PROVINSI, COBA LAGI!");
    }
}

function resetOngkirArea(isCart) {
    const areaId = document.getElementById(isCart ? 'cartInAreaId' : 'inAreaId');
    const kodePos = document.getElementById(isCart ? 'cartInKodePos' : 'inKodePos');
    const textId = document.getElementById(isCart ? 'cartTampilOngkir' : 'tampilOngkir');
    if (areaId) areaId.value = '';
    if (kodePos) kodePos.value = '';
    if (textId) textId.innerText = 'Tunggu Ongkir Muncul...';
    ongkirSaatIni = 0;
}

async function onProvinsiChange(isCart) {
    const provSel = document.getElementById(isCart ? 'cartInProvinsi' : 'inProvinsi');
    const kotaSel = document.getElementById(isCart ? 'cartInKota' : 'inKota');
    const kecSel = document.getElementById(isCart ? 'cartInKecamatan' : 'inKecamatan');

    kecSel.innerHTML = '<option value="">Pilih Kecamatan...</option>';
    kecSel.disabled = true;
    const kelSelReset = document.getElementById(isCart ? 'cartInKelurahan' : 'inKelurahan');
    if (kelSelReset) {
        kelSelReset.innerHTML = '<option value="">Pilih Kelurahan...</option>';
        kelSelReset.disabled = true;
    }
    resetOngkirArea(isCart);

    const code = provSel.options[provSel.selectedIndex]?.dataset.code;
    if (!code) {
        kotaSel.innerHTML = '<option value="">Pilih Kota/Kab...</option>';
        kotaSel.disabled = true;
        return;
    }

    kotaSel.innerHTML = '<option value="">Memuat...</option>';
    kotaSel.disabled = true;

    try {
        const data = await fetchWilayah(`/regencies/${code}.json`);
        kotaSel.innerHTML = '<option value="">Pilih Kota/Kab...</option>' +
            (data || []).map(k => `<option value="${titleCaseWilayah(k.name)}" data-code="${k.id}">${titleCaseWilayah(k.name)}</option>`).join('');
        kotaSel.disabled = false;
    } catch (e) {
        kotaSel.innerHTML = '<option value="">Gagal memuat, coba lagi</option>';
    }
}

async function onKotaChange(isCart) {
    const kotaSel = document.getElementById(isCart ? 'cartInKota' : 'inKota');
    const kecSel = document.getElementById(isCart ? 'cartInKecamatan' : 'inKecamatan');

    resetOngkirArea(isCart);

    const code = kotaSel.options[kotaSel.selectedIndex]?.dataset.code;
    if (!code) {
        kecSel.innerHTML = '<option value="">Pilih Kecamatan...</option>';
        kecSel.disabled = true;
        return;
    }

    kecSel.innerHTML = '<option value="">Memuat...</option>';
    kecSel.disabled = true;

    try {
        const data = await fetchWilayah(`/districts/${code}.json`);
        kecSel.innerHTML = '<option value="">Pilih Kecamatan...</option>' +
            (data || []).map(d => `<option value="${titleCaseWilayah(d.name)}" data-code="${d.id}">${titleCaseWilayah(d.name)}</option>`).join('');
        kecSel.disabled = false;
    } catch (e) {
        kecSel.innerHTML = '<option value="">Gagal memuat, coba lagi</option>';
    }

    const kelSel = document.getElementById(isCart ? 'cartInKelurahan' : 'inKelurahan');
    if (kelSel) {
        kelSel.innerHTML = '<option value="">Pilih Kelurahan...</option>';
        kelSel.disabled = true;
    }
}


// Setelah kecamatan dipilih: muat daftar kelurahan/desa dari data wilayah
// (bukan langsung ke Biteship — itu baru dipanggil setelah kelurahan dipilih).
async function onKecamatanChange(isCart) {
    const kecSel = document.getElementById(isCart ? 'cartInKecamatan' : 'inKecamatan');
    const kelSel = document.getElementById(isCart ? 'cartInKelurahan' : 'inKelurahan');
    const kodePos = document.getElementById(isCart ? 'cartInKodePos' : 'inKodePos');

    resetOngkirArea(isCart);
    if (kodePos) kodePos.value = '';

    const code = kecSel.options[kecSel.selectedIndex]?.dataset.code;
    if (!code) {
        kelSel.innerHTML = '<option value="">Pilih Kelurahan...</option>';
        kelSel.disabled = true;
        return;
    }

    kelSel.innerHTML = '<option value="">Memuat...</option>';
    kelSel.disabled = true;

    try {
        const data = await fetchWilayah(`/villages/${code}.json`);
        kelSel.innerHTML = '<option value="">Pilih Kelurahan...</option>' +
            (data || []).map(v => {
                const postal = v.postal_code || v.postalCode || v.kodepos || '';
                return `<option value="${titleCaseWilayah(v.name)}" data-postal="${postal}">${titleCaseWilayah(v.name)}</option>`;
            }).join('');
        kelSel.disabled = false;
    } catch (e) {
        kelSel.innerHTML = '<option value="">Gagal memuat, coba lagi</option>';
    }
}

// Panggil Biteship search dan balikin array areas (kosong kalau gagal/nggak ketemu)
async function cariAreaBiteship(keyword) {
    try {
        const res = await fetch(`${URL_GAS_BITESHIP}?endpoint=search&input=${encodeURIComponent(keyword)}`);
        const data = await res.json();
        return data.areas || [];
    } catch (e) {
        return [];
    }
}

// Setelah kelurahan dipilih: kode pos langsung diisi dari data wilayah (kalau ada),
// lalu dicocokkan ke Biteship untuk hitung ongkir. Pencarian dicoba 2 tahap:
// paling spesifik (kelurahan+kecamatan+kota) dulu, baru mundur ke kecamatan+kota
// kalau yang spesifik nggak ketemu — ini yang tadinya bikin sering "gagal".
async function onKelurahanChange(isCart) {
    const provSel = document.getElementById(isCart ? 'cartInProvinsi' : 'inProvinsi');
    const kotaSel = document.getElementById(isCart ? 'cartInKota' : 'inKota');
    const kecSel = document.getElementById(isCart ? 'cartInKecamatan' : 'inKecamatan');
    const kelSel = document.getElementById(isCart ? 'cartInKelurahan' : 'inKelurahan');
    const kodePos = document.getElementById(isCart ? 'cartInKodePos' : 'inKodePos');
    const areaId = document.getElementById(isCart ? 'cartInAreaId' : 'inAreaId');
    const textId = isCart ? 'cartTampilOngkir' : 'tampilOngkir';

    if (!kelSel.value) {
        resetOngkirArea(isCart);
        if (kodePos) kodePos.value = '';
        return;
    }

    // Isi kode pos langsung dari data wilayah kalau tersedia
    const postalFromData = kelSel.options[kelSel.selectedIndex]?.dataset.postal || '';
    if (kodePos) kodePos.value = postalFromData;

    document.getElementById(textId).innerText = "Menghitung ongkir...";
    areaId.value = '';
    ongkirSaatIni = 0;

    const keywordSpesifik = `${kelSel.value} ${kecSel.value} ${kotaSel.value}`;
    const keywordUmum = `${kecSel.value} ${kotaSel.value}`;

    let areas = await cariAreaBiteship(keywordSpesifik);
    if (!areas.length) areas = await cariAreaBiteship(keywordUmum);

    if (!areas.length) {
        document.getElementById(textId).innerText = "Gagal menghubungi server ongkir. Coba pilih ulang kelurahannya.";
        return;
    }

    // Cari kecocokan nama kecamatan + provinsi yang paling pas, kalau tidak ada pakai hasil pertama
    const match = areas.find(a =>
        (a.name || '').toLowerCase() === kecSel.value.toLowerCase() &&
        (a.administrative_division_level_1_name || '').toLowerCase() === provSel.value.toLowerCase()
    ) || areas.find(a =>
        (a.administrative_division_level_1_name || '').toLowerCase() === provSel.value.toLowerCase()
    ) || areas[0];

    if (!match) {
        document.getElementById(textId).innerText = "Pengiriman ke area ini belum tersedia. Coba pilih kelurahan lain.";
        return;
    }

    areaId.value = match.id;
    if (!postalFromData && match.postal_code) kodePos.value = match.postal_code;
    hitungOngkirBiteship(match.id, isCart);
}

async function hitungOngkirBiteship(destId, isCart) {
    let berat = isCart ? (cartItems.length * 250) : 250;
    let textId = isCart ? 'cartTampilOngkir' : 'tampilOngkir';

    document.getElementById(textId).innerText = "Menghitung ongkir...";

    try {
        let res = await fetch(`${URL_GAS_BITESHIP}?endpoint=rates&dest=${destId}&weight=${berat}`);
        let data = await res.json();

        if (data.pricing && data.pricing.length > 0) {
            ongkirSaatIni = data.pricing[0].price;
            document.getElementById(textId).innerText = `Ongkos Kirim (J&T): ${formatRupiah(ongkirSaatIni)}`;
        } else {
            document.getElementById(textId).innerText = "Pengiriman ke area ini tidak tersedia.";
            ongkirSaatIni = 0;
        }
    } catch (e) {
        document.getElementById(textId).innerText = "Gagal memuat ongkir.";
        ongkirSaatIni = 0;
    }
}

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

window.toggleSidebar = toggleSidebar;
window.navTo = navTo;
window.showPage = showPage;
window.goDetail = goDetail;
window.selOpt = selOpt;
window.validateDetail = validateDetail;
window.validateForm = validateForm;
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
window.previewCartBukti = previewCartBukti;
window.openCart = openCart;
window.goToSlide = goToSlide;
window.hapusBukti = hapusBukti;
window.confirmCheckout = confirmCheckout;
window.closeConfirm = closeConfirm;
window.executeCheckout = executeCheckout;
window.onProvinsiChange = onProvinsiChange;
window.onKotaChange = onKotaChange;
window.onKecamatanChange = onKecamatanChange;
window.onKelurahanChange = onKelurahanChange;