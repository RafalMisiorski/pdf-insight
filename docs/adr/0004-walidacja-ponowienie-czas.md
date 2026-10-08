# ADR-0004: Walidacja w dwóch miejscach, jedno ponowienie, budżet 27 s

Status: przyjęta (2026-10-08)

## Kontekst

Brief: wynik zgodny ze schematem i walidowany przed wyświetleniem, jedno ponowienie przy niepoprawnym JSON, wynik w mniej niż 30 sekund.

## Decyzja

- Jeden schemat Zod (`src/lib/schema.ts`) dla Workera i frontendu.
- Worker: dekodowanie ograniczone schematem, potem Zod i reguła 3–5 zdań. Przy błędzie jedno ponowienie z listą problemów.
- Frontend waliduje odpowiedź jeszcze raz przed wyświetleniem.
- Cała analiza ma jeden budżet 27 s, a ponowienie rusza tylko przy co najmniej 8 s zapasu. Przeglądarka przerywa po 35 s.
- „Spróbuj ponownie” tylko przy błędach, które ponowienie może naprawić (429, 5xx, sieć), nie przy 413.
- Zdania: skróty przed nazwą („ul.”, „dr”) nie kończą zdania, formy spółek („sp.k.”, „sp. j.”) mogą je kończyć.

## Rozważone i odrzucone

- 25 s na każde wywołanie (pierwsza wersja): z ponowieniem odpowiedź mogła trwać około 50 s.
- Poleganie wyłącznie na dekodowaniu ze schematem: nie sprawdza ono liczby zdań.

## Dowód

Testy jednostkowe `worker/src/model.test.ts` (ponowienie, brak ponowienia przy małym zapasie, timeout równy budżetowi, 429), `src/api/analyze.test.ts` i `src/lib/sentences.test.ts`. Test E2E: odpowiedź niezgodna ze schematem nie jest wyświetlana.
