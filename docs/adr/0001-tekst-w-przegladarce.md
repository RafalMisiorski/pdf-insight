# ADR-0001: Tekst z PDF wyciąga przeglądarka, do backendu idzie tylko tekst

Status: przyjęta (2026-10-08)

## Kontekst

Frontend jest statyczny (GitHub Pages). Backend to Cloudflare Worker na planie darmowym: 10 ms czasu procesora na żądanie. Plik może mieć do 10 MB.

## Decyzja

- `pdfjs-dist` 6 w przeglądarce, tekst strona po stronie. Worker pdf.js importowany przez `?url`, żeby Vite dodał bazę `/pdf-insight/` i hash (pułapka GitHub Pages z briefu).
- Mniej niż 20 czytelnych znaków na stronę oznacza skan bez warstwy tekstowej: komunikat zamiast wywołania AI.
- pdf.js ładuje się dopiero przy pierwszym pliku: paczka startowa 318 kB (97 kB gzip) zamiast 748 kB.

## Rozważone i odrzucone

- Parsowanie PDF w Workerze: 10 ms CPU nie wystarczy na plik 10 MB, a biblioteka pdf.js jest za duża na skrypt Workera.
- Wysłanie całego pliku do modelu: cały dokument trafia do dostawcy, a kodowanie base64 w Workerze zjada limit CPU.

## Dowód

- Test E2E „PDF z tekstem” sprawdza, że do API trafia numer faktury z pliku, czyli pdf.js naprawdę odczytał warstwę tekstową spod `/pdf-insight/`. Osobne testy obejmują skan, PDF z hasłem i uszkodzony PDF.
- pdf.js 6 nie ma już ścieżki `eval` przy fontach (0 wystąpień `new Function(` w paczce i w workerze). Tej ścieżki dotyczyła podatność CVE-2024-4367 w starszych wersjach.

## Kiedy wrócić do decyzji

Gdy warstwa tekstowa okaże się zbyt uboga (np. tabele) albo przy obsłudze skanów (OCR).
