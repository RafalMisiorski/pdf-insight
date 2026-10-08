# ADR-0008: Długie dokumenty: jedno wywołanie czy dzielenie na fragmenty

Status: przyjęta (2026-10-08); reguła decyzji zapisana przed pomiarem

## Kontekst

Brief (SHOULD F-08): długie dokumenty dzielimy na fragmenty i łączymy wyniki. Model ma kontekst 1 mln tokenów, a nasz limit to 400 tys. znaków tekstu (około 100 tys. tokenów). Zmierzyliśmy dotąd tylko do 38 tys. znaków (T06: 7 s). Analiza ma budżet 27 s (ADR-0004), a do tego dochodzi odczyt PDF w przeglądarce. Dzielenie dodaje drugą rundę wywołań (scalanie) i ryzyko zgubienia faktów, więc ma sens tylko tam, gdzie jedno wywołanie przestaje mieścić się w czasie albo gubi fakty.

## Pomiar (zaplanowany przed uruchomieniem)

- Syntetyczne PDF-y z tekstem o długości około 100, 200 i 400 tys. znaków (`eval/longdoc/make_long.py`). Tekst wypełniający nie zawiera kwot, dat ani nazwisk.
- W każdym trzy wstawione fakty: kwota, data i osoba, na 5%, 50% i 95% długości, z innymi wartościami w każdym miejscu.
- Każdy dokument dwa razy przez prawdziwy interfejs na produkcji (`npm run eval`); mierzymy czas od wgrania do wyniku i trafienie wstawionych faktów.

## Reguła decyzji (zapisana przed pomiarem)

- L = największa zmierzona długość, przy której **oba** przebiegi trwają co najwyżej 20 s od wgrania do wyniku **i** trafiają wszystkie 9 wstawionych faktów (3 kwoty, 3 daty, 3 osoby).
- Do długości L: jedno wywołanie (obecna ścieżka).
- Powyżej L: dzielenie na fragmenty, równoległa ekstrakcja i jedno wywołanie scalające.
- Jeśli nie spełnia jej nawet 100 tys. znaków, dzielimy wszystko powyżej 38 tys. (T06 przechodzi w jednym wywołaniu).

## Wynik (2026-10-08, produkcja, `npm run eval`, 2 przebiegi)

| długość tekstu    | stron | czas od wgrania do wyniku | wstawione fakty |
| ----------------- | ----- | ------------------------- | --------------- |
| 98,5 tys. znaków  | 23    | 8,4 s i 7,5 s             | 9/9 i 9/9       |
| 198,6 tys. znaków | 47    | 9,0 s i 7,5 s             | 9/9 i 9/9       |
| 398,2 tys. znaków | 93    | 9,0 s i 7,5 s             | 9/9 i 9/9       |

Według reguły L = 398 tys. znaków, czyli cały obecny limit ścieżki tekstowej. Czas prawie nie rośnie z długością tekstu: wczytanie wejścia jest szybkie, a czas zależy głównie od długości odpowiedzi. Dane: `eval/longdoc/`.

## Decyzja

- Do 400 tys. znaków: jedno wywołanie. Podział dodałby rundę scalania i ryzyko zgubienia faktów bez zysku na czasie.
- Powyżej 400 tys. znaków (dziś komunikat 413): podział na fragmenty po co najwyżej 400 tys. znaków na granicach stron, równoległa analiza fragmentów i scalenie wyników.

## Ścieżka z podziałem: kryterium akceptacji (zapisane przed implementacją i pomiarem, 2026-10-08)

- Tekst dłuższy niż 400 tys. znaków dzielimy na granicach stron na fragmenty po co najwyżej 400 tys. znaków, maksymalnie 4 (około 1,6 mln znaków). Dłuższe dokumenty dostają komunikat.
- Fragmenty idą równolegle przez tę samą ścieżkę co zwykły tekst. Podmioty, kwoty, daty i słowa kluczowe scala kod (usuwa tylko duplikaty), a model pisze jedynie wspólne podsumowanie i najważniejsze punkty (endpoint `/merge`).
- Pomiar: syntetyczne PDF-y z około 800 tys. i 1,2 mln znaków tekstu z 9 wstawionymi faktami (5%, 50% i 95% długości), 2 przebiegi na produkcji przez interfejs.
- Ścieżka zostaje, jeśli w obu przebiegach czas od wgrania do wyniku wynosi co najwyżej 30 s i trafione są wszystkie 9 faktów. Jeśli nie, limit zostaje na 400 tys. znaków (powyżej komunikat 413), a wynik pomiaru zapisujemy tutaj.

## Implementacja (2026-10-08)

- Podział: `src/lib/chunks.ts` (granice stron; jedna strona dłuższa niż limit jest cięta na ostatniej spacji). Dokument mieszczący się w limicie idzie dokładnie tak jak wcześniej.
- Scalanie faktów kodem: `src/lib/merge.ts` (usuwa tylko dokładne duplikaty; dane dokumentu z pierwszego fragmentu). Podsumowanie i punkty: `mergeSummaries` w `worker/src/model.ts`, z osobnym promptem i tą samą walidacją z ponowieniem w budżecie 27 s.
- Testy: jednostkowe dla podziału i scalania, test żądania do modelu (ścieżka tekstowa wysyła niezmieniony prompt i schemat), test E2E dokumentu z około 700 tys. znaków (2 fragmenty, jedno scalenie). Lokalny przebieg z prawdziwym modelem: 797 tys. znaków (185 stron) w 14,1 s, 9/9 wstawionych faktów. To sprawdzenie działania, a nie pomiar według kryterium powyżej.

## Wynik pomiaru ścieżki z podziałem

(po wdrożeniu: 2 przebiegi na produkcji)
