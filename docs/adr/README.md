# Decyzje architektoniczne (ADR)

Każda decyzja ma kontekst, decyzję, odrzucone opcje, dowód i warunek powrotu. Przy decyzjach optymalizacyjnych (progi, limity) reguła wyboru powstaje przed pomiarem, a wynik dopisujemy po nim. Dzięki temu widać, że parametr wynika z pomiaru, a nie z dopasowania do wyniku.

| nr                                          | decyzja                                                                                          | dowód                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [0001](0001-tekst-w-przegladarce.md)        | tekst z PDF wyciąga przeglądarka (pdf.js), do backendu idzie tylko tekst                         | test E2E: tekst z pliku dociera do API                                          |
| [0002](0002-worker-jako-posrednik.md)       | Cloudflare Worker jako jedyne miejsce z kluczem API                                              | 403 dla obcej domeny, 413 dla 2,1 MB, brak klucza w historii gita               |
| [0003](0003-model-i-warunki.md)             | Gemini 3.8 Flash na planie płatnym                                                               | warunki EOG; 120/120 na produkcji                                               |
| [0004](0004-walidacja-ponowienie-czas.md)   | walidacja w dwóch miejscach, jedno ponowienie, budżet 27 s na zapytanie i 28 s na długi dokument | testy jednostkowe Workera i klienta                                             |
| [0005](0005-metoda-ewaluacji.md)            | zbiór treningowy z briefu, dokument firmy zamknięty, pomiar przez interfejs, precyzja            | 120/120 według etykiet, 97/97 faktów w PDF-ie                                   |
| [0006](0006-strategia-testow.md)            | Vitest i Playwright w trzech przeglądarkach z zamockowanym API                                   | 4 celowe usterki wykryte                                                        |
| [0007](0007-limity-zapytan.md)              | dokładne limity w Durable Object, dzienne na IP i dla demo                                       | 429 od 11. zapytania w minucie na produkcji                                     |
| [0008](0008-dlugie-dokumenty.md)            | jedno wywołanie do 400 tys. znaków, dzielenie tylko powyżej                                      | 98–398 tys. znaków: 7,5–9 s, 9/9 faktów                                         |
| [0009](0009-ocr-skanow.md)                  | OCR skanów przez obrazy stron, do 8 stron                                                        | 1–8 stron: 6–9 s; T08 18/18; 20 trudnych skanów faktur: 160/160                 |
| [0010](0010-rownolegle-grupy-pol.md)        | równoległe grupy pól dla wszystkich dokumentów gęstych: odrzucone przez regułę                   | −28,6% mediany przy progu −30%, ta sama jakość                                  |
| [0011](0011-tryb-rownolegly-dla-gestych.md) | tryb równoległy tylko przy co najmniej 15 kwotach i 15 datach: przyjęty                          | mediana z 21,7 do 10,7 s, 16/16 bez błędu, te same fakty                        |
| [0012](0012-planer-dokumentu.md)            | planer: tekst i skany w jednym wyniku, najwyżej 4 części                                         | cały dokument w 30 s do 1,6 mln znaków, 32 stron skanu albo 4 części mieszanych |
