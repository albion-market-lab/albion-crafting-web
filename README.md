# Albion Crafting Web

> Web UI pribadi untuk **Multi-Item Crafting Planner** di Albion Market Lab. Status: **Task 11 MVP smoke flow verified**.

Tujuan: dari satu daftar target crafting, pengguna langsung tahu **bahan yang harus dibeli, berapa jumlahnya, di kota mana memasang buy order, dan estimasi modalnya**.

## Menjalankan aplikasi

Repository calculator harus tersedia sebagai sibling `../albion-crafting-calculator` dan sudah dibuild. Web memakai dependency `file:` tersebut; source algoritma tidak disalin ke React.

```bash
cd ../albion-crafting-calculator
corepack pnpm install --frozen-lockfile
corepack pnpm build

cd ../albion-crafting-web
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Buka URL yang ditampilkan Vite. Tanpa konfigurasi API, planner tetap menghitung raw material dalam mode offline.

Untuk membaca snapshot harga dari receiver pribadi:

```bash
VITE_PRICE_API_URL=https://albion-market-receiver.vercel.app corepack pnpm dev
```

Variabel ini hanya berisi URL read-only `GET /prices`; jangan pernah menaruh secret Apps Script, ingest, atau kredensial Sheets dalam environment `VITE_*`. Untuk smoke test, hitung target lalu pastikan status harga muncul; tombol **Refresh harga** hanya mengulang pembacaan snapshot pribadi.

Validasi:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:smoke
corepack pnpm build
```

Hasil expected versus actual, reproduksi lokal/production, pemeriksaan bundle, dan batasan deployment ada di [Task 11 smoke test](docs/smoke-test.md).

## Catalog v3

Artifact production berasal dari export nyata tiga tab katalog pada workbook privat `db-albion-market-lab` tanggal 29 Oktober 2026. Tab `Market Prices` tidak digunakan untuk membangun katalog.

- `public/catalog-v3.json`: 11.223 item, 6.847 crafting recipe, dan 115 refining recipe.
- `public/manifest-v3.json`: schema version, waktu impor, sumber, dan jumlah record.
- `public/coverage-v3.json`: coverage importer, termasuk missing label, unknown, unsupported, dan dangling reference.
- `public/catalog-support-v3.json`: 6.066 craftable yang berhasil dihitung end-to-end oleh calculator; 781 recipe yang belum aman dipilih dilaporkan beserta alasan dan contoh ID.

UI hanya menawarkan ID dalam support artifact. Katalog mentah dan recipe tetap utuh agar kegagalan tidak disembunyikan atau diubah diam-diam. Fixture kecil Task 06 dipertahankan hanya di `test/fixtures/` untuk unit test.

Untuk regenerasi, jalankan importer `albion-item-catalog` terhadap `items.csv`, `craft-recipes.csv`, dan `refining-recipes.csv`, lalu sinkronkan direktori outputnya:

```bash
CATALOG_JSON=/absolute/path/to/output/catalog.json corepack pnpm sync:catalog
```

`manifest.json` dan `coverage.json` wajib berada di sebelah `catalog.json`. Script memakai `calculateMaterials()` untuk memvalidasi setiap craftable dan menulis support report; tidak ada recipe yang dibuat atau ditebak oleh web.

## Pengalaman pengguna (MVP)
1. Cari dan pilih equipment dari [catalog](https://github.com/albion-market-lab/albion-item-catalog) (item, tier/enchantment bila tersedia).
2. Isi quantity lalu **Tambah Item**; satu plan dapat berisi banyak item dengan tier dan jumlah berbeda.
3. Edit atau hapus target tanpa mengulang plan dari awal.
4. Tekan **Hitung** untuk menjalankan [calculator](https://github.com/albion-market-lab/albion-crafting-calculator).
5. Lihat tiga hasil utama:
   - **Shopping List** — agregasi material, jumlah, usulan kota BO, harga penawaran, dan modal.
   - **Refining Plan** — urutan kebutuhan material/refining per tier.
   - **Crafting Output** — daftar equipment dan total unit yang direncanakan untuk Black Market.

Contoh target (nama bersifat ilustratif, pemilihan sebenarnya menggunakan item ID yang valid): cloth armor T6 × 100 + plate shoes T5 × 20.

## Harga dan status ketersediaan
Web hanya **membaca** snapshot harga dari Google Sheets melalui endpoint read-only [market receiver](https://github.com/albion-market-lab/albion-market-receiver) atau adapter baca yang aman. Tidak ada harga dari sumber komunitas.

Untuk tiap harga tampilkan:
- **Segar**: masih berada dalam rentang batas usia yang dipilih.
- **Lama**: memiliki harga, tetapi timestamp sudah melewati batas. **Tetap tampilkan** harga + usia observasi.
- **Kosong**: item/kota/sisi BUY/SELL belum pernah discan; tampilkan `—` / *Belum ada data*, bukan 0.

Batas stale saat ini 6 jam dan bukan klaim real-time. Jika input harga belum lengkap, estimasi modal ditandai **partial/unavailable** dan bagian yang hilang tetap terlihat.

## Pembagian tanggung jawab
- **Catalog** menyediakan item dan resep; web tidak menyimpan resep hardcoded.
- **Calculator** memproses seluruh perhitungan; komponen UI tidak menulis ulang algoritmanya.
- **Receiver / Sheet** menyediakan snapshot harga dan timestamp; web tidak memegang kredensial tulis.
- Seluruh tindakan dalam game (**buy order, refining, crafting, caravan, Black Market sell order**) tetap **manual**.

## Implementasi Task 06/10/11
- React + TypeScript + Vite, satu halaman responsive tanpa login atau database.
- Add/edit/delete multi-target; item duplicate dijumlahkan sebelum calculator dipanggil.
- `calculateMaterials()` dari package calculator menjadi satu-satunya calculation engine.
- Crafting Output, Refining Plan, dan Shopping List tampil tanpa mengarang harga.
- Catalog loading/error/empty, quantity invalid, nama missing, dan recipe error ditampilkan eksplisit.
- Search nama/ID serta filter tier/kategori hanya merender maksimal 100 hasil agar katalog besar tetap ringan.
- Task 10 membaca endpoint receiver pribadi, memvalidasi payload, membagi filter lebih dari 100 item menjadi beberapa request, lalu memakai `estimateBuyOrders()` calculator untuk freshness dan rekomendasi BO.
- Request version mencegah respons harga lama menimpa target terbaru atau target yang sudah diubah.
- Task 11 mengunci flow dua target golden dari UI sampai recursive refining, shopping list, dan rekomendasi BO partial melalui integration smoke test yang reproducible.

## Selesai jika
- Satu plan menampung item berbeda sekaligus dan bisa diedit.
- Hasil shopping list menggabungkan material lintas target dan dikelompokkan per kota.
- Refining plan dan craft output konsisten dengan calculator.
- Harga lama/kosong diberi status jelas serta estimasi parsial tidak menyesatkan.
- Website dapat berjalan tanpa VPS dan tanpa akses tulis ke Google Sheets.

## Sumber data awal yang sudah ada (28 Oktober 2026)

Google Sheets proyek memiliki tab `Items`, `Craft Recipes`, `Refining Recipes`, dan `Market Prices` (plus `README`). Artifact katalog hanya berasal dari tiga tab master pertama; harga dibaca terpisah melalui receiver Task 10.

Untuk UI:
- Ambil `item_id` + `display_name_en` dari catalog. `name_status=name_missing` berarti nama tampilan belum tersedia, jadi boleh fallback ke ID dengan label jelas.
- Filter item yang punya `has_crafting_recipe=true`, namun jangan menjanjikan semua item Albion sudah didukung.
- Ketika kalkulasi menggunakan resep dengan bahan khusus atau belum tersedia, tampilkan warning yang diberikan calculator.
- Harga **kosong** → `Belum ada data`; harga **lama** → tampilkan nominal + usia observasi. Jangan menampilkan estimasi modal lengkap bila sebagian harga kosong.
- Website wajib memakai endpoint **read-only** untuk mengakses snapshot harga, tanpa mengekspos akses tulis ke Google Sheets.

**Sumber harga tetap private-only:** tidak mengambil harga dari API komunitas dan tidak mengunggah hasil scan pribadi ke komunitas.

## Ekosistem repositori

| Repositori | Tanggung jawab |
| --- | --- |
| [albion-item-catalog](https://github.com/albion-market-lab/albion-item-catalog) | Master data item dan resep crafting/refining |
| [albion-market-receiver](https://github.com/albion-market-lab/albion-market-receiver) | Menerima scan market pribadi dan menyimpan harga ke Google Sheets |
| [albion-crafting-calculator](https://github.com/albion-market-lab/albion-crafting-calculator) | Menghitung kebutuhan bahan, estimasi modal, dan rekomendasi kota BO |
| [albion-crafting-web](https://github.com/albion-market-lab/albion-crafting-web) | Antarmuka untuk merencanakan banyak target crafting |

**Alur:** Albion Online → collector lokal → receiver → Google Sheets → web UI + calculator. Katalog resep berasal dari data game, **bukan** dari Google Sheets.

## Di luar scope MVP
Login multi-user, pembayaran, otomatisasi order di game, AI recommendation, dan optimasi profit BM otomatis.
