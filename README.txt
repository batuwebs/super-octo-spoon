BATU'NUN SARI PIPISI - PWA

Kurulum:
1. Bu klasordeki tum dosyalari ayni yapida hostingine yukle.
2. Site HTTPS uzerinden acilmalidir. Localhost da PWA kurulumu icin gecerlidir.
3. Telefonda siteyi acip Ayarlar > Uygulamayi ana ekrana ekle butonunu kullan.

Yerel test:
Python kuruluysa klasorde terminal ac:
python -m http.server 8080
Sonra: http://localhost:8080

Ozellikler:
- Ilk acilista maas ve eski tarih girisi
- Harcama / kazanc ekleme
- Islem duzenleme ve onayli silme
- Aciklama ve tutarda arama
- Harcama/kazanc filtreleri
- Her sayfada 25 islem ve sayfalama
- JSON disari aktarma
- JSON ice aktarmada mevcut verinin ustune yazmama
- Ayni ID veya ayni icerige sahip islemleri atlama
- OLED tema, bakiye gizleme, titresim
- Offline servis calisani ve PWA manifesti

Not: Veriler tarayicinin localStorage alaninda saklanir. Tarayici verileri silinirse yedek alinmamis veriler kaybolabilir.
