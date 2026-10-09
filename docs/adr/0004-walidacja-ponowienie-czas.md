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

## Po teście na dokumencie firmy (2026-10-08)

Dokument testowy (12 stron, 47 kwot, 28 dat) zajął 25 s od wgrania do wyniku: w budżecie, ale z małym zapasem. Odpowiedź miała około 7,8 tys. znaków JSON, 4–8 razy więcej niż na treningu, a czas rośnie z długością odpowiedzi. Po teście nie zmieniałem modelu wejścia (test hasha), tylko komunikat o oczekiwanym czasie. Warunek powrotu do decyzji: jeśli dokumenty gęstsze w dane mają przekraczać budżet, wyciągamy grupy pól równolegle.

## Po ślepej recenzji (2026-10-09)

- Budżet 27 s dotyczy jednego zapytania. Długi dokument (fragmenty, potem scalanie) ma jeden budżet 28 s liczony od startu analizy: scalanie dostaje tylko czas, który został, a gdy zostaje mniej niż 5 s, aplikacja kończy z komunikatem zamiast czekać.
- Regułę 3–5 zdań sprawdza też przeglądarka, nie tylko Worker. Licznik zna skróty prawne („art. 659”, „§ 9 ust. 2”, „pkt.”), a dla pism bez wielkich liter (np. japoński, arabski) używa reguł Unicode (`Intl.Segmenter`).
- Każdy błąd Workera mówi, czy ponowienie może pomóc (`retryable`). Odmowa dostawcy (zły klucz, wyczerpany budżet) i blokada filtra bezpieczeństwa nie proponują ponowienia.
