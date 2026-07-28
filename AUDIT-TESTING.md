# Audit dan Regression Testing

## Fungsi lama yang ditemukan dan dipertahankan

- Mode **Hitung Penawaran** (`maju`).
- Mode **Reverse Budget** (`mundur`).
- Wilayah **Batam (FTZ)** dan **Luar Batam**.
- Target margin **10%**, **15%**, dan **custom 10–15%**.
- Toggle **Vendor PKP**.
- Input net vendor / budget customer.
- Input biaya SDM, gudang & pengepakan, dan operasional.
- Gross-up PPh 2% untuk vendor, SDM, dan gudang.
- PPN vendor 1,1% bila PKP.
- Overhead 1%.
- Cost of fund `(30/365) × 8%`.
- PPN customer 1,1% untuk non-FTZ.
- Breakdown biaya langsung, overhead, COF, PPN, total dasar, profit, dan hasil utama.
- Recalculation ketika asumsi berubah setelah hasil tersedia.
- Redirect Cloudflare Pages dari domain lama.

## Perubahan formula

Tidak ada formula bisnis lama yang diubah. Fungsi perhitungan dipisahkan menjadi fungsi murni `calculatePricing()` agar dapat diuji. Nilai internal tetap menggunakan presisi penuh dan pembulatan hanya dilakukan pada tampilan.

## Bug dan risiko yang diperbaiki

- Browser alert diganti validasi inline.
- Input custom margin kosong sebelumnya menghasilkan nilai batas secara diam-diam; kini ditandai tidak valid.
- Kondisi budget tidak cukup kini mempunyai status dan penjelasan, bukan hanya teks `BUDGET OVER!`.
- Dependensi CDN dihapus agar aplikasi tetap cepat dan tidak gagal ketika CDN bermasalah.
- Data skenario localStorage yang rusak ditangani tanpa membuat halaman crash.
- Nilai nol/kosong tidak menghasilkan NaN atau Infinity.
- Footer mobile tidak lagi bertumpuk dan memakan banyak ruang.

## Test case formula

### Forward, FTZ, non-PKP, margin 10%

Input:
- Net vendor: Rp98.000
- SDM/Gudang/Ops: Rp0

Ekspektasi:
- Bruto vendor: Rp100.000
- Overhead: Rp1.000
- COF: Rp657,534...
- Total biaya dasar: Rp101.657,534...
- DPP penawaran: Rp112.952,815...
- Profit: Rp11.295,281...

### Reverse, FTZ, non-PKP, margin 10%

Input:
- Budget customer: Rp112.952,815...
- SDM/Gudang/Ops: Rp0

Ekspektasi:
- Batas net vendor mendekati Rp98.000.

## Checklist browser

- [x] Halaman terbuka tanpa framework/build step.
- [x] Semua input lama tersedia.
- [x] Formula forward dan reverse konsisten.
- [x] Custom margin 10–15% tervalidasi.
- [x] Nilai nol tidak menampilkan NaN/Infinity.
- [x] Realtime calculation bekerja.
- [x] Reset dan kosongkan nilai bekerja.
- [x] Save/load/delete scenario bekerja.
- [x] Perbandingan skenario memakai data aktual.
- [x] Copy Summary dan ekspor JSON bekerja.
- [x] Print stylesheet A4 tersedia.
- [x] Desktop dan mobile tidak horizontal overflow.
- [x] Footer mengikuti struktur/style referensi.
- [x] Asset path dan ZIP root benar.
