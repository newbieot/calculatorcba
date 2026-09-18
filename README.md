# CBA PosNew – Pricing Calculator

Aplikasi statis dengan dua alur kerja:

1. **Cek Perhitungan CBA** — menghitung penawaran atau reverse budget tanpa data dokumen.
2. **Buat Excel CBA** — menghitung penawaran, melengkapi data proyek, lalu mengunduh workbook dengan sheet `CBA2`, `Rekap CBA 1`, `RBL`, `RBL 2`, dan `SOW Shadow`.

Sheet Packing List tidak disertakan pada hasil ekspor. Vendor bawaan adalah **CV Emy Rizky Jaya** dengan NIB dan NPWP terisi otomatis; pengguna juga dapat memilih vendor lain dan mengisi legalitasnya sendiri.

Seluruh perhitungan dan pembuatan workbook dilakukan di browser. Tidak ada backend, analytics, atau pengiriman data input ke server.

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
