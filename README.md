# CBA PosNew – Pricing Calculator

Aplikasi statis untuk menghitung dua jenis keputusan pricing:

1. **Hitung Penawaran** — mengubah biaya net menjadi rekomendasi penawaran minimum.
2. **Reverse Budget** — mengubah budget customer menjadi batas maksimal pembayaran vendor.

Seluruh proses dilakukan di browser. Tidak ada backend, analytics, atau pengiriman data input ke server.

## Deploy ke Cloudflare Pages

- Framework preset: **None**
- Build command: kosong
- Build output directory: `/`
- Root directory: `/`

Hubungkan repository ke Cloudflare Pages lalu deploy. Middleware mempertahankan redirect dari `calculatorcba.pages.dev` ke `cba.posnew.com`.

## Formula utama

- Gross-up vendor/SDM/gudang: `Net ÷ 0,98`
- PPN vendor PKP: `Bruto vendor × 1,1%`
- Overhead: `Biaya langsung × 1%`
- Cost of fund: `Biaya langsung × (30/365 × 8%)`
- DPP penawaran: `Biaya dasar ÷ (1 − margin)`
- PPN customer non-FTZ: `DPP × 1,1%`

Lihat `AUDIT-TESTING.md` untuk audit fungsi dan regression test.
