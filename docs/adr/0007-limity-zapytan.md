# ADR-0007: Dokładne limity zapytań w Durable Object

Status: przyjęta (2026-10-08), zastępuje wiązanie rate limiting Cloudflare

## Kontekst

CORS nie chroni przed skryptami (ADR-0002), model jest płatny z przedpłatą, a demo ma działać przez cały okres oceny.

## Co nie zadziałało

Pierwsza wersja używała wiązania rate limiting Cloudflare (10 zapytań na minutę na IP). Na produkcji 45 żądań w 2 minuty z jednego IP i jednej lokalizacji (WAW) nie dało ani jednej odpowiedzi 429, choć lokalnie ten sam kod blokował od 11. żądania. Dokumentacja opisuje to wiązanie jako „permissive, eventually consistent, and intentionally designed to not be used as an accurate accounting system”.

## Decyzja

- Durable Object (backend SQLite, dostępny na planie darmowym), jeden obiekt na klucz. Obiekt obsługuje swoje żądania po kolei, więc licznik jest dokładny.
- `ip:<adres>`: 10 zapytań na minutę, sprawdzane przed odczytem treści żądania.
- `day:<data UTC>`: `DAILY_LIMIT` (50) analiz dziennie dla całego demo, liczone tylko dla żądań, które trafiłyby do modelu.
- Okno przesuwne jest czystą funkcją (`worker/src/window.ts`) z testami jednostkowymi.

## Dowód

Produkcja po wdrożeniu (2026-10-08): żądania 1–10 dostają 400 (puste), 11–14 dostają 429. Lokalnie przy `DAILY_LIMIT=1` druga poprawna analiza dostaje 429 bez wywołania modelu.

## Koszt i ograniczenia

Każde wywołanie API to jedno dodatkowe żądanie do Durable Object (plan darmowy: 100 tys. dziennie). Limit na IP nie zatrzyma rotacji adresów, dlatego ostatnią zaporą są limit dzienny i przedpłata.

## Po ślepej recenzji (2026-10-09)

Sam limit dzienny 50 dla całego demo był tanim sposobem na wyłączenie demo: jeden skrypt z jednego adresu wyczerpałby go w kilka minut, a „50 analiz” oznaczało w praktyce 50 zapytań do modelu (długi dokument to do 5). Teraz limity są dwa: 40 zapytań dziennie z jednego adresu i 200 dla całego demo. Limity liczą zapytania do Workera, a nie wywołania modelu: od ADR-0011 zapytanie o dokument gęsty to 3 wywołania, a z ponowieniami najwyżej 6. Adresy IPv6 są liczone dla całej sieci /64. W najgorszym razie (200 gęstych zapytań po 400 tys. znaków) to kilkadziesiąt milionów tokenów dziennie, więc ostatnią zaporą jest przedpłata u dostawcy z limitem wydatków. Produkcja po wdrożeniu: 11. zapytanie w ciągu minuty dostaje 429 (`retryable: true`), obca domena 403, treść 2,1 MB w UTF-8 413.
