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
