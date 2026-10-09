# Dokumenty gęste i tryb równoległy (ADR-0010, ADR-0011)

`make_dense.py` tworzy dwa zestawy syntetycznych dokumentów pełnych kwot i dat, z pełną listą prawdziwych wartości w `truth.json`. Zestaw D (ADR-0010): cennik usług (36 kwot), harmonogram płatności (24 kwoty, 25 dat) i zestawienie faktur (28 kwot, 43 daty). Zestaw E opisuje sekcja niżej. Gatunki są celowo inne niż umowa ramowa z dokumentu testowego firmy.

`run_ab.py` porównuje jedno wywołanie (A) z trzema równoległymi grupami pól (B) na lokalnym Workerze, z tym samym tekstem dla obu ramion, i stosuje regułę z ADR-0010:

```bash
npx wrangler dev --config worker/wrangler.toml --var ALLOWED_ORIGIN:http://localhost:5173 --var IP_DAILY_LIMIT:500 --var DAILY_LIMIT:500 --var ALLOW_EXPERIMENTS:1
python eval/dense/run_ab.py
```

Wynik z 2026-10-09 (`eval/results/2026-10-09-rownolegle/`): B skraca medianę czasu na dokumentach gęstych o 28,6% przy tej samej jakości, ale reguła wymagała 30%, więc zostało jedno wywołanie. Drugi pomiar, opisany niżej, przyjął tryb równoległy tylko dla dokumentów z wieloma kwotami i datami.

## Zestaw E i bramka trybu równoległego (ADR-0011)

Zestaw E (E01–E05) powstał przed drugim pomiarem, w gatunkach innych niż D: wyciąg z rachunku, harmonogram spłaty pożyczki, aneks z harmonogramem dostaw, rozliczenie kamieni milowych i katalog części. Katalog ma tylko 2 daty i sprawdza, że bramka zostawia go przy jednym wywołaniu.

`run_hybrid.py` najpierw sprawdza decyzje bramki bez modelu, tą samą funkcją co Worker (`worker/src/density.ts`, uruchomioną w Node), a potem porównuje jedno wywołanie, wymuszone lokalnie, z bramką. `--gate-only` kończy po sprawdzeniu bramki, a `--rescore` ocenia ponownie zapisane odpowiedzi, bez modelu.

```bash
npx wrangler dev --config worker/wrangler.toml --var ALLOWED_ORIGIN:http://localhost:5173 --var IP_DAILY_LIMIT:500 --var DAILY_LIMIT:500 --var ALLOW_EXPERIMENTS:1
python eval/dense/run_hybrid.py
```

Wynik z 2026-10-09 (`eval/results/2026-10-09-tryb-dla-gestych/`): mediana spadła z 21,7 do 10,7 s, 16 z 16 przebiegów bez błędu, te same fakty, więc bramka jest na produkcji.
