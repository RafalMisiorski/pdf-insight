# PDF Insight

Wgrywasz PDF, a dostajesz podsumowanie w 3–5 zdaniach w języku dokumentu oraz dane w JSON (typ i data dokumentu, podmioty, kwoty, daty, słowa kluczowe) zgodne ze schematem z briefu. Wynik można obejrzeć na stronie i pobrać jako `.json`.

**Demo:** https://rafalmisiorski.github.io/pdf-insight/

![Wynik analizy faktury z zestawu treningowego](docs/screenshot.png)

## Jak to działa

```
przeglądarka (GitHub Pages)                          Cloudflare Worker                       Gemini 3.8 Flash
PDF -> walidacja pliku -> pdf.js -> tekst --POST /analyze--> CORS, limity, Zod, prompt  -->  JSON według schematu
wynik <- walidacja Zod <- JSON  <---------------------------- walidacja Zod i reguła 3-5 zdań, 1 ponowienie
```

1. Przeglądarka sprawdza plik: typ, rozmiar do 10 MB i sygnaturę `%PDF-`. Nic nie jest wysyłane, zanim plik przejdzie te sprawdzenia.
2. pdf.js wyciąga tekst strona po stronie. Skan bez warstwy tekstowej idzie ścieżką OCR: przeglądarka renderuje do 8 pierwszych stron do JPEG, a model czyta obrazy (`/analyze-scan`). Przy wyniku jest informacja, że to skan.
3. Worker przyjmuje żądania tylko ze strony demo, pilnuje limitów i rozmiaru, a tekst wkłada do promptu jako dane w ogranicznikach. Odpowiedź modelu jest wymuszona schematem, a potem sprawdzana Zodem i regułą 3–5 zdań. Przy błędzie jest jedno ponowienie, a cała analiza mieści się w budżecie 27 s.
4. Aplikacja waliduje odpowiedź jeszcze raz, zanim cokolwiek pokaże. Nazwę pliku i liczbę stron ustawia kod, a nie model.
5. Tekst dłuższy niż 400 tys. znaków jest dzielony na granicach stron na maksymalnie 4 fragmenty. Fragmenty idą równolegle, fakty scala kod, a model pisze wspólne podsumowanie (`/merge`).

W trakcie analizy aplikacja pokazuje kroki: odczyt tekstu (strona X z Y), analizę AI z licznikiem sekund i sprawdzenie wyniku. Ostatnie 5 wyników zostaje w historii w przeglądarce (tylko JSON).

## Decyzje

Każda decyzja z kontekstem, odrzuconymi opcjami i dowodem jest w [`docs/adr/`](docs/adr/README.md). Najważniejsze:

- Tekst wyciąga przeglądarka, więc plik nie leży na żadnym serwerze, a Worker zostaje mały ([ADR-0001](docs/adr/0001-tekst-w-przegladarce.md)).
- Klucz API jest wyłącznie w sekretach Workera ([ADR-0002](docs/adr/0002-worker-jako-posrednik.md)).
- Gemini 3.8 Flash na planie płatnym, bo warunki Gemini API nie pozwalają udostępniać aplikacji użytkownikom w EOG na planie darmowym ([ADR-0003](docs/adr/0003-model-i-warunki.md)).
- Walidacja w dwóch miejscach, jedno ponowienie i wspólny budżet czasu dla całej analizy ([ADR-0004](docs/adr/0004-walidacja-ponowienie-czas.md)).
- Jakość mierzę na własnym zbiorze treningowym, a dokument od firmy uruchamiam raz, na końcu ([ADR-0005](docs/adr/0005-metoda-ewaluacji.md)).
- Testy przeglądarkowe w trzech silnikach z zamockowanym API, uruchamiane w CI przed wdrożeniem ([ADR-0006](docs/adr/0006-strategia-testow.md)).
- Dokładne limity zapytań w Durable Object, bo wbudowany limiter Cloudflare nie blokował na produkcji ([ADR-0007](docs/adr/0007-limity-zapytan.md)).
- Próg dzielenia długich dokumentów z pomiaru, z regułą zapisaną przed pomiarem ([ADR-0008](docs/adr/0008-dlugie-dokumenty.md)).
- OCR skanów przez obrazy stron renderowane w przeglądarce, z limitem stron z pomiaru ([ADR-0009](docs/adr/0009-ocr-skanow.md)).

## Uruchomienie lokalne

Wymagania: Node.js 22, konto Cloudflare (Worker) i klucz Gemini API na planie płatnym.

```bash
npm ci
cp worker/.dev.vars.example worker/.dev.vars   # wpisz GEMINI_API_KEY; plik jest w .gitignore
cp .env.example .env.local                     # VITE_API_URL=http://localhost:8787
npm run worker:dev                             # Worker: http://localhost:8787
npm run dev                                    # aplikacja: http://localhost:5173/pdf-insight/
```

Wdrożenie: `npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml` (raz), `npm run worker:deploy`. Aplikację na GitHub Pages wdraża GitHub Actions po każdym pushu na `main`, gdy przejdą lint, testy i build. Adres Workera jest w zmiennej repozytorium `VITE_API_URL`.

## Testy i ewaluacja

```bash
npm test               # Vitest: schemat, liczenie zdań, klient modelu, limity, podział i scalanie
npm run test:e2e       # Playwright w Chromium, Firefoksie i WebKit, API zamockowane (tak jak w CI)
npm run test:live      # jeden test na wdrożonej stronie (wywołuje płatny model)
npm run eval           # zbiór treningowy przez prawdziwy interfejs, JSON do eval-output/
python eval/score.py   # porównanie z etykietami
```

Zbiór treningowy ([`eval/`](eval/README.md)) jest syntetyczny i zaprojektowany wyłącznie na podstawie briefu. Zawiera m.in. fakturę, ofertę w dwóch walutach, raport po angielsku, umowę najmu, notatkę bez dat i kwot, długi regulamin, pro formę ze wstrzykniętą instrukcją i fakturę, której wydrukowane sumy nie zgadzają się z pozycjami.

| pomiar (2026-10-08)                                                                                | wynik                                                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| zbiór treningowy przez interfejs, wdrożona wersja (z OCR skanu)                                    | 156 ze 156 sprawdzeń, 4–10 s na dokument                                            |
| długie teksty, 98–398 tys. znaków (23–93 strony)                                                   | 7,5–9 s, 9 z 9 wstawionych faktów                                                   |
| bardzo długie teksty, 0,8–1,2 mln znaków (185–279 stron), fragmenty i scalenie                     | 14–23 s, 9 z 9 wstawionych faktów                                                   |
| skany przez OCR: T08 (fakty jak w T01) i skany 4 i 8 stron                                         | 6–9 s, T08: 18 z 18 sprawdzeń                                                       |
| 20 trudnych skanów faktur (zdjęcia, uszkodzone skany) z mojego wcześniejszego benchmarku, lokalnie | 160 ze 160 sprawdzeń, 6–11 s                                                        |
| dokument testowy od firmy (12 stron), jedno uruchomienie                                           | 9/10 w ręcznej ocenie, 25 s; wszystkie kwoty, daty i osoby z wyniku są w dokumencie |

## Bezpieczeństwo

- Klucz API jest tylko w sekretach Workera. W repozytorium włączone są secret scanning i push protection, a historię gita sprawdziłem pod kątem kluczy.
- CORS dopuszcza tylko domenę demo. Nie jest to uwierzytelnienie, dlatego są limity: 10 zapytań na minutę na IP, 50 analiz dziennie dla całego demo, 2 MB treści żądania i 400 tys. znaków tekstu na zapytanie.
- Treść PDF jest dla modelu danymi, a nie instrukcjami: ograniczniki, reguła w prompcie i odpowiedź wymuszona schematem. Sprawdza to dokument T07 ze wstrzykniętą instrukcją.
- Wynik jest wyświetlany jako tekst (React, bez `dangerouslySetInnerHTML`), co sprawdza test XSS. Worker nie zapisuje treści dokumentów w logach.

## Znane ograniczenia

- Skan jest czytany z obrazów stron (OCR), najwyżej 8 pierwszych stron. Pojedyncze znaki mogą być odczytane błędnie, o czym aplikacja informuje przy wyniku.
- Tekst dokumentu trafia do zewnętrznego API (Google Gemini, plan płatny). Strona informuje o tym przy wyborze pliku.
- Przy limicie dostawcy albo dziennym limicie demo aplikacja pokazuje komunikat, a ponowienie zostawia użytkownikowi.
- Dokumenty dłuższe niż około 1,6 mln znaków tekstu są odrzucane. Powyżej 400 tys. znaków analiza to kilka wywołań modelu.
- Czas analizy rośnie z liczbą wyciągniętych faktów, bo zależy głównie od długości odpowiedzi modelu. Dokument testowy (dziesiątki kwot i terminów) zajął 25 s, a jeszcze gęstszy może przekroczyć budżet 27 s i skończyć się komunikatem o przekroczeniu czasu. Następny krok: równoległe wyciąganie grup pól (kwoty, daty, reszta), tak żeby czas zależał od najdłuższej grupy, a nie od sumy.
- Limit na IP nie zatrzyma kogoś, kto zmienia adresy. Ostatnią zaporą jest dzienny limit demo i przedpłata u dostawcy.

## Struktura

```
src/components   interfejs: wybór pliku, postęp, wyniki, historia
src/lib          schemat Zod, liczenie zdań, pdf.js, podział i scalanie, historia
src/api          klient Workera
worker/src       Cloudflare Worker: /analyze, /merge, prompt, wywołanie modelu, limity
e2e              testy Playwright (zamockowane API, wdrożona strona, ewaluacja)
eval             zbiór treningowy, etykiety, skrypt oceny, pomiar długich dokumentów
docs/adr         decyzje z dowodami
```
