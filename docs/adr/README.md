# Decyzje architektoniczne (ADR)

Każda decyzja ma kontekst, decyzję, odrzucone opcje, dowód i warunek powrotu. Przy decyzjach optymalizacyjnych (progi, limity) reguła wyboru powstaje przed pomiarem, a wynik dopisujemy po nim. Dzięki temu widać, że parametr wynika z pomiaru, a nie z dopasowania do wyniku.

| nr                                        | decyzja                                                                     | dowód                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [0001](0001-tekst-w-przegladarce.md)      | tekst z PDF wyciąga przeglądarka (pdf.js), do backendu idzie tylko tekst    | test E2E: tekst z pliku dociera do API                            |
| [0002](0002-worker-jako-posrednik.md)     | Cloudflare Worker jako jedyne miejsce z kluczem API                         | 403 dla obcej domeny, 413 dla 2,1 MB, brak klucza w historii gita |
| [0003](0003-model-i-warunki.md)           | Gemini 3.8 Flash na planie płatnym                                          | warunki EOG; 138/138 na produkcji                                 |
| [0004](0004-walidacja-ponowienie-czas.md) | walidacja w dwóch miejscach, jedno ponowienie, budżet 27 s                  | testy jednostkowe Workera i klienta                               |
| [0005](0005-metoda-ewaluacji.md)          | zbiór treningowy z briefu, dokument firmy zamknięty, pomiar przez interfejs | 114/114, 139/139, 138/138                                         |
| [0006](0006-strategia-testow.md)          | Vitest i Playwright w trzech przeglądarkach z zamockowanym API              | 4 celowe usterki wykryte                                          |
| [0007](0007-limity-zapytan.md)            | dokładne limity w Durable Object                                            | 429 od 11. żądania na produkcji                                   |
| [0008](0008-dlugie-dokumenty.md)          | jedno wywołanie do 400 tys. znaków, dzielenie tylko powyżej                 | 98–398 tys. znaków: 7,5–9 s, 9/9 faktów                           |
