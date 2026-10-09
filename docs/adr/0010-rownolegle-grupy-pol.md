# ADR-0010: Równoległe wyciąganie grup pól (eksperyment)

Status: odrzucone przez regułę zapisaną przed pomiarem (reguła: 2026-10-09, 09:06; wynik: 09:16); zawężoną wersję, tylko dla dokumentów gęstych, przyjął [ADR-0011](0011-tryb-rownolegly-dla-gestych.md). Reguła i wynik trafiają do repozytorium w jednym commicie, więc kolejność (reguła przed pomiarem) potwierdza mój dziennik pracy, a nie historia git.

## Kontekst

Czas analizy zależy głównie od długości odpowiedzi modelu (ADR-0008). Dokument gęsty w kwoty i daty daje długą odpowiedź: dokument testowy zajął 25 s przy budżecie 27 s (ADR-0004). Pomysł: ten sam tekst w trzech równoległych wywołaniach, z których każde zwraca jedną grupę pól. Grupa A to dokument, podsumowanie, punkty, podmioty i słowa kluczowe, grupa B kwoty, a grupa C daty. Kod składa grupy w jeden wynik, a czas zależy od najdłuższej grupy, a nie od całości.

## Pomiar (zaplanowany przed uruchomieniem)

- Ramię A: obecne jedno wywołanie. Ramię B: trzy równoległe grupy z tym samym promptem systemowym i tą samą walidacją (reguła 3–5 zdań w grupie A).
- Dokumenty gęste: trzy syntetyczne (cennik usług, harmonogram płatności, zestawienie faktur) z pełną listą kwot i dat w `eval/dense/`. Dokumentu firmy nie używam: wybór architektury na jego podstawie byłby strojeniem pod zbiór testowy.
- Straż jakości: T01–T07 i T09 z etykietami.
- Gęste dokumenty po 3 przebiegi na ramię, T01–T09 po 1 przebiegu na ramię, kolejność ramion naprzemiennie. Lokalny Worker i ten sam model; oba ramiona dostają ten sam tekst.
- Mierzymy czas zapytania, odsetek wyników bez błędu, trafienie znanych kwot i dat (dokumenty gęste), sprawdzenia według etykiet (T01–T09) oraz to, czy każdy fakt jest w tekście (`eval/grounding.py`).

## Reguła decyzji (zapisana przed pomiarem)

Ramię B zostaje przyjęte dla ścieżki tekstowej tylko wtedy, gdy spełnia wszystkie warunki:

1. Mediana czasu na dokumentach gęstych spada co najmniej o 30%, a najdłuższy przebieg B trwa nie więcej niż 20 s.
2. Wszystkie przebiegi B kończą się wynikiem bez błędu.
3. Jakość nie spada: na T01–T09 B przechodzi tyle samo sprawdzeń według etykiet co A, wszystkie fakty B są w tekście, a na dokumentach gęstych średnie trafienie znanych kwot i dat w B jest nie mniejsze niż w A pomniejszone o 2 pozycje.
4. Mediana czasu B na T01–T09 nie jest gorsza od A o więcej niż 2 s.

W przeciwnym razie zostaje jedno wywołanie, a wynik pomiaru zapisuję tutaj.

## Wynik (2026-10-09, lokalny Worker, `eval/results/2026-10-09-rownolegle/`)

|                                                  | A: jedno wywołanie | B: trzy grupy równolegle |
| ------------------------------------------------ | ------------------ | ------------------------ |
| mediana czasu, dokumenty gęste (9 przebiegów)    | 18,5 s             | 13,2 s (−28,6%)          |
| najdłuższy przebieg, dokumenty gęste             | 28,8 s (D03)       | 20,0 s (D03)             |
| wyniki bez błędu                                 | 17/17              | 17/17                    |
| trafione znane kwoty i daty, średnio na przebieg | 53,3               | 53,3                     |
| T01–T09: sprawdzenia według etykiet              | 137                | 137                      |
| fakty spoza tekstu PDF                           | 0                  | 0                        |
| mediana czasu, T01–T09                           | 8,1 s              | 7,1 s                    |

Warunki 2, 3 i 4 są spełnione. Warunek 1 nie: mediana spadła o 28,6%, a reguła wymagała 30%. Według reguły zostaje jedno wywołanie. Reguły nie zmieniam po zobaczeniu wyniku.

Obserwacje do następnej decyzji, poza regułą:

- Pomiar nie rozstrzyga, czy zysk przekracza 30%. Przedział niepewności (bootstrap po 9 parach, orientacyjnie) to od −42% do +8%, a średnia spadła o 30,1% przy medianie −28,6%. Wynik leży na progu, więc zmiana progu albo statystyki po fakcie byłaby decyzją podjętą na szumie.
- Czas B to najdłuższe z trzech wywołań, więc zysk zależy od tego, jaką część odpowiedzi (liczoną w znakach JSON) zajmuje największa grupa. Harmonogram D02: największa grupa to 38% odpowiedzi, czas −46%. Zestawienie faktur D03: 46–52%, czas −38%. Cennik D01: kwoty to 71% odpowiedzi, czas +8%, czyli bez zysku.
- Na lekkich T01–T09 mediana B była o 1 s niższa, ale najdłuższy przebieg dłuższy (T02: 12,6 s wobec 6,9 s).
- Dla produktu ryzykiem jest ogon, a nie mediana: jedno wywołanie na D03 trwało od 25,6 do 28,8 s licząc od strony klienta, czyli na granicy budżetu 27 s. Reguła pytała o medianę, więc tego nie rozstrzygała.

Następny krok: nowy pomiar na nowych dokumentach, z regułą zapisaną przed nim. Tryb równoległy byłby włączany tylko wtedy, gdy kod przed wysłaniem policzy w tekście dużo kwot i dużo dat, a warunek dotyczyłby najdłuższych przebiegów, a nie mediany. Ta decyzja zostaje bez zmian.

## Decyzja

Ścieżka tekstowa zostaje przy jednym wywołaniu, tym samym, na którym uruchomiłem dokument firmy. Kod trybu równoległego zostaje jako udokumentowany eksperyment (`analyzeParallel`), ale produkcja go ignoruje: działa tylko lokalnie, z `ALLOW_EXPERIMENTS=1`, więc nikt nie może nim potroić wywołań modelu za jedno policzone zapytanie.

Aktualizacja (2026-10-09): ADR-0011 włącza tryb równoległy na produkcji tylko dla dokumentów z wieloma kwotami i wieloma datami.
