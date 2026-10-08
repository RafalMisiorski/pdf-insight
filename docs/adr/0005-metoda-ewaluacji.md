# ADR-0005: Zbiór treningowy z briefu, dokument firmy zamknięty, pomiar przez interfejs

Status: przyjęta (2026-10-08)

## Kontekst

Jakość wyników AI to 20% oceny. Dokument od firmy jest jedynym dokumentem spoza naszej ręki, więc nie może służyć do strojenia.

## Decyzja

- Syntetyczny zbiór treningowy zaprojektowany wyłącznie z briefu (`eval/`): T01–T09 i X01–X02, każdy z etykietą oczekiwanych faktów.
- Dokument firmy jest zamknięty (odcisk SHA-256, poza repozytorium) i uruchamiany raz, na końcu.
- Pomiar przez prawdziwy interfejs: Playwright wgrywa plik jak użytkownik (`npm run eval`), a `eval/score.py` porównuje pobrany JSON z etykietą.
- Etykietę poprawiamy tylko wtedy, gdy odpowiedź modelu jest poprawna co do intencji etykiety. Każdą taką zmianę zapisujemy w AI_LOG, a promptu nie dostrajamy pod etykietę.
- Skrypt porównuje całe słowa z polskimi końcówkami, a liczby bez spacji. Ma 13 przypadków kontrolnych, w tym 6, które musi odrzucić.

## Dowód (2026-10-08)

114/114 sprawdzeń na tekście z pypdf, 139/139 przez interfejs lokalnie i 138/138 przez interfejs na produkcji (bez pliku 11 MB, którego nie ma w repozytorium).

## Kiedy wrócić do decyzji

Jeśli końcowy test pokaże błąd ogólny (np. format liczb), poprawiamy przyczynę, a nie regułę pod ten jeden dokument, i opisujemy to jako odstępstwo.
