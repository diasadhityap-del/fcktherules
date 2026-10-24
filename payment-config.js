// URL API pembayaran (Cloudflare Worker "fvck-pay"). Isi SEKALI setelah deploy pertama berhasil,
// lihat URL-nya di log GitHub Actions / dashboard Cloudflare, contoh: https://fvck-pay.namakamu.workers.dev
// (Ini bukan rahasia. Key Midtrans TIDAK ada di file ini.)
export const PAYMENT_API = 'https://fvck-pay.gooletok.workers.dev';