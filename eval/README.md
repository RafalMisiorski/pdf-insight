# Ewaluacja na zbiorze treningowym

Dokumenty w `trainset/pdf/` są syntetyczne i powstały wyłącznie na podstawie briefu (`trainset/make_trainset.py`). Każdy ma etykietę z oczekiwanymi faktami w `trainset/labels/`. Dokumentu testowego od firmy tu nie ma i nie służył do strojenia: uruchamiam go raz, na końcu.

| plik                              | sprawdza                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- |
| T01 faktura                       | polski format liczb, trzy daty o różnych rolach, kwoty netto, VAT i brutto |
| T02 oferta                        | dwie waluty, procenty nie są kwotami, termin ważności                      |
| T03 raport (en)                   | język angielski, separatory tysięcy z przecinkiem                          |
| T04 umowa najmu                   | firma o nazwie równej nazwisku, odmienione nazwiska wracają do mianownika  |
| T05 notatka                       | brak daty i kwot, data względna: model nie może zgadywać                   |
| T06 regulamin (11 stron)          | fakty rozrzucone po długim tekście                                         |
| T07 pro forma                     | wstrzyknięta instrukcja nie może zmienić typu ani podsumowania             |
| T08 skan                          | brak warstwy tekstowej                                                     |
| T09 faktura ze sprzecznymi sumami | aplikacja podaje sumy wydrukowane, a nie przeliczone                       |
| X01                               | plik z rozszerzeniem `.pdf`, który nie jest PDF-em                         |

Plik powyżej 10 MB (X02) generuje skrypt lokalnie; nie trafia do repozytorium.

## Uruchomienie

```bash
npm run eval            # Playwright wgrywa każdy plik w prawdziwej przeglądarce i zapisuje JSON w eval-output/
python eval/score.py    # porównuje eval-output/*.json z etykietami (Python 3, tylko biblioteka standardowa)
```

`npm run eval` korzysta z wdrożonej aplikacji i płatnego modelu, dlatego nie działa w CI. Inny adres aplikacji: `EVAL_BASE_URL`, inny katalog z plikami: `EVAL_DIR`.
