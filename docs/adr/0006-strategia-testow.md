# ADR-0006: Vitest dla logiki, Playwright w trzech przeglądarkach z zamockowanym API

Status: przyjęta (2026-10-08)

## Decyzja

- Vitest dla czystej logiki: schemat, liczenie zdań, klient modelu w Workerze, okno limitu zapytań, klient API.
- Playwright na buildzie produkcyjnym w Chromium, Firefoksie i WebKit (silnik Safari). API jest zamockowane przez `page.route`, więc testy są deterministyczne, bez kosztów i bez sekretów, i działają w CI przed wdrożeniem.
- `npm run test:live` (wdrożona strona) i `npm run eval` (zbiór treningowy) tylko na żądanie, bo wołają płatny model.

## Rozważone i odrzucone

- Prawdziwy model w CI: koszt, niestabilne wyniki i klucz w CI.
- Tylko Chromium: recenzent może otworzyć demo w Safari albo Firefoksie.

## Dowód

Testy sprawdziłem celowo wprowadzonymi usterkami: limit 10 MB, szerokość strony przy 360 px, kontrast tekstu i limit historii. Każda została wykryta.
