# ADR-0005: Zbiór treningowy z briefu, dokument firmy zamknięty, pomiar przez interfejs

Status: przyjęta (2026-10-08)

## Kontekst

Jakość wyników AI to 20% oceny. Dokument od firmy jest jedynym dokumentem spoza naszej ręki, więc nie może służyć do strojenia.

## Decyzja

- Syntetyczny zbiór treningowy zaprojektowany wyłącznie z briefu (`eval/`): T01–T09 i X01–X02, każdy z etykietą oczekiwanych faktów.
- Dokument firmy jest zamknięty (odcisk SHA-256, poza repozytorium) i uruchamiany raz, na końcu.
- Pomiar przez prawdziwy interfejs: Playwright wgrywa plik jak użytkownik (`npm run eval`), a `eval/score.py` porównuje pobrany JSON z etykietą.
- Etykietę poprawiamy tylko wtedy, gdy odpowiedź modelu jest poprawna co do intencji etykiety. Każdą taką zmianę zapisujemy w AI_LOG, a promptu nie dostrajamy pod etykietę.
- Skrypt porównuje całe słowa z polskimi końcówkami, a liczby z granicami cyfr. Ma 13 przypadków kontrolnych, w tym 6, które musi odrzucić.
- Precyzja: każda kwota, data, osoba i organizacja z wyniku musi być wydrukowana w PDF-ie (`eval/grounding.py`). Etykieta mówi, co trzeba znaleźć, ale nie wyklucza zmyśleń; to sprawdzenie je wyklucza.
- Sprawdzenia gwarantowane przez walidację aplikacji (schemat, liczba zdań i punktów, strony) są raportowane osobno i nie podnoszą wyniku mierzonego. Brak pliku wynikowego liczy się jako porażka, a skrypt kończy się kodem 1 przy każdym błędzie.
- Zapisane przebiegi są w `eval/results/`.

## Dowód (2026-10-08)

Produkcja, 2026-10-08 (`eval/results/2026-10-08-produkcja`): 120/120 sprawdzeń według etykiet, 97/97 faktów obecnych w PDF-ie i osobno 36/36 sprawdzeń gwarantowanych walidacją. Wcześniejsze przebiegi liczyły te grupy razem (138–156 sprawdzeń); skrypt nie miał wtedy jeszcze sprawdzenia precyzji, które dodałem po ślepej recenzji.

## Kiedy wrócić do decyzji

Jeśli końcowy test pokaże błąd ogólny (np. format liczb), poprawiamy przyczynę, a nie regułę pod ten jeden dokument, i opisujemy to jako odstępstwo.
