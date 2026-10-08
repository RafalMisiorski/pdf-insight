# Pomiar długich dokumentów (ADR-0008)

`make_long.py` tworzy PDF-y z tekstem o długości około 100, 200 i 400 tys. znaków. Tekst wypełniający nie ma kwot, dat ani nazwisk, a trzy wstawione fakty (kwota, data, osoba) stoją na 5%, 50% i 95% długości (`facts.json`).

```bash
EVAL_DIR=eval/longdoc/pdf EVAL_OUT=eval-output/longdoc npm run eval
```

Wynik z 2026-10-08 (2 przebiegi na produkcji): 7,5–9,0 s od wgrania do wyniku i 9/9 wstawionych faktów przy każdej długości, także przy 398 tys. znaków (93 strony).
