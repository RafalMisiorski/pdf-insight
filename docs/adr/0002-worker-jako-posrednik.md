# ADR-0002: Cloudflare Worker jako jedyne miejsce z kluczem API

Status: przyjęta (2026-10-08)

## Kontekst

Klucz API we frontendzie albo w historii repozytorium oznacza dyskwalifikację. GitHub Pages nie ma backendu.

## Decyzja

- Worker `/analyze` jest jedynym miejscem z kluczem: sekret `wrangler secret put`, lokalnie `.dev.vars` (w `.gitignore`). Klucz idzie w nagłówku `x-goog-api-key`, nie w adresie URL.
- CORS tylko dla `https://rafalmisiorski.github.io`. Limity: 2 MB treści żądania, 400 tys. znaków tekstu. Wejście walidowane schematem Zod.
- Worker nie loguje treści dokumentów. `fileName` i `pages` ustawia kod, nie model.

## Rozważone i odrzucone

- Wywołanie modelu prosto z przeglądarki: klucz byłby widoczny dla każdego.
- Funkcje serverless na innej platformie albo własny serwer: kolejne konto lub utrzymanie, bez przewagi nad Workerem.

## Dowód (produkcja, 2026-10-08)

Obca domena dostaje 403, treść 2,1 MB dostaje 413. W historii gita nie ma ciągu wyglądającego na klucz. W paczce JS na Pages jest tylko adres Workera, bez klucza.

## Zastrzeżenie

CORS nie jest uwierzytelnieniem: skrypt może podrobić nagłówek `Origin`. Dlatego istnieją limity zapytań (ADR-0007).
