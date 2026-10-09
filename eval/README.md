# Ewaluacja na zbiorze treningowym

Dokumenty w `trainset/pdf/` są syntetyczne i powstały wyłącznie na podstawie briefu (`trainset/make_trainset.py`). Każdy ma etykietę z oczekiwanymi faktami w `trainset/labels/`. Dokumentu testowego od firmy tu nie ma i nie służył do strojenia: uruchomiłem go raz, na końcu.

| plik                              | sprawdza                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- |
| T01 faktura                       | polski format liczb, trzy daty o różnych rolach, kwoty netto, VAT i brutto |
| T02 oferta                        | dwie waluty, procenty nie są kwotami, termin ważności                      |
| T03 raport (en)                   | język angielski, separatory tysięcy z przecinkiem                          |
| T04 umowa najmu                   | firma o nazwie równej nazwisku, odmienione nazwiska wracają do mianownika  |
| T05 notatka                       | brak daty i kwot, data względna: model nie może zgadywać                   |
| T06 regulamin (11 stron)          | fakty rozrzucone po długim tekście                                         |
| T07 pro forma                     | wstrzyknięta instrukcja nie może zmienić typu ani podsumowania             |
| T08 skan                          | brak warstwy tekstowej: OCR, fakty jak w T01                               |
| T09 faktura ze sprzecznymi sumami | aplikacja podaje sumy wydrukowane, a nie przeliczone                       |
| X01                               | plik z rozszerzeniem `.pdf`, który nie jest PDF-em                         |

Plik powyżej 10 MB (X02) generuje skrypt lokalnie; nie trafia do repozytorium.

## Jak liczony jest wynik

- **Sprawdzenia według etykiet:** typ, język, tytuł, data, podmioty, kwoty, daty, wymagane i zakazane frazy w podsumowaniu. Brak pliku wynikowego liczy się jako porażka.
- **Precyzja (`grounding.py`):** każda kwota, data, osoba i organizacja z wyniku musi być wydrukowana w PDF-ie. Skan T08 jest sprawdzany względem tekstu T01. Znane ograniczenie: spacja jest w Polsce i separatorem tysięcy, i odstępem między komórkami tabeli, więc końcówka liczby grupowanej liczy się jako wydrukowana („150” w „6 150,00”).
- **Sprawdzenia konstrukcyjne** (schemat, liczba zdań i punktów, strony) gwarantuje walidacja aplikacji, więc są raportowane osobno i nie podnoszą wyniku mierzonego.
- Skrypt kończy się kodem 1, gdy cokolwiek się nie zgadza.

## Uruchomienie

```bash
npm run eval                                              # Playwright wgrywa każdy plik w prawdziwej przeglądarce, JSON do eval-output/
python eval/score.py                                      # wynik dla eval-output/ (Python 3 i pypdf)
python eval/score.py --outputs eval/results/2026-10-08-produkcja   # zapisany przebieg z produkcji
```

`npm run eval` korzysta z wdrożonej aplikacji i płatnego modelu, dlatego nie działa w CI. Inny adres aplikacji: `EVAL_BASE_URL`, inny katalog z plikami: `EVAL_DIR`. Zapisane przebiegi (zbiór treningowy, długie teksty, skany, równoległe grupy pól, bramka trybu równoległego) są w `results/`. Dokumenty gęste w kwoty i daty oraz pomiary z ADR-0010 i ADR-0011 opisuje [`dense/README.md`](dense/README.md). Drabinę dokumentów do granicy jednej analizy (ADR-0012) tworzy `hard/make_hard.py` (w repozytorium jest tylko dokument mieszany z README, resztę i `truth.json` z pełnym tekstem odtwarza skrypt), a ocenia `hard/score_hard.py`; przebiegi przez interfejs: `EVAL_DIR=eval/hard/pdf EVAL_GAP_MS=70000 npm run eval`, z odstępem 70 s, bo jeden dokument wysyła do 5 zapytań.
