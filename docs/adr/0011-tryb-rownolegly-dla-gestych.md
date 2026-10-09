# ADR-0011: Tryb równoległy tylko dla dokumentów gęstych

Status: przyjęte przez regułę zapisaną przed pomiarem (reguła: 2026-10-09, 09:46; wynik: 09:59). Reguła i wynik trafiają do repozytorium w jednym commicie, więc kolejność potwierdza mój dziennik pracy, a nie historia git.

## Kontekst

ADR-0010 pokazał, że trzy równoległe grupy pól skracają czas tylko wtedy, gdy odpowiedź rozkłada się na kwoty i daty mniej więcej po równo: harmonogram D02 −46%, zestawienie faktur D03 −38%, cennik D01 (prawie same kwoty) +8%, a lekkie T01–T09 około 1 s. Dla produktu ryzykiem są najdłuższe przebiegi: jedno wywołanie na D03 trwało do 28,8 s. Pomysł: Worker przed wysłaniem liczy w tekście różne kwoty i różne daty i tylko wtedy, gdy obu jest dużo, wysyła tekst w trzech równoległych grupach. Pozostałe dokumenty idą jednym wywołaniem, tak jak dziś.

## Bramka (ustalona przed pomiarem)

- `worker/src/density.ts`: tryb równoległy, gdy tekst zawiera co najmniej 15 różnych kwot i co najmniej 15 różnych dat (`MIN_EACH = 15`). Próg wynika z ADR-0010: T01–T09 mają po kilka kwot i dat i trwają 5–9 s, a cennik D01 ma tylko 4 daty.
- Liczenie kończy się, gdy próg zostanie osiągnięty. Bez tego tekst 400 tys. znaków pełen kwot i dat zajmował 5 ms, czyli połowę limitu planu darmowego (10 ms CPU na zapytanie).
- Decyzję podejmuje Worker, a nie przeglądarka, więc klient nie może wymusić trzech wywołań. Trzy wywołania dostają tylko dokumenty gęste.

## Pomiar (zaplanowany przed uruchomieniem)

- Nowe dokumenty w gatunkach innych niż w ADR-0010, wygenerowane przed pomiarem (`eval/dense/make_dense.py`, zestaw E), z gęstością od progu w górę:
  - E01 wyciąg z rachunku firmowego: około 32 kwot i 32 dat,
  - E02 harmonogram spłaty pożyczki z ratami malejącymi: około 18 i 18,
  - E03 aneks z harmonogramem dostaw: około 40 i 40,
  - E04 rozliczenie kamieni milowych projektu: około 25 i 25,
  - E05 katalog części zamiennych: około 45 kwot i 2 daty (bramka ma go zostawić przy jednym wywołaniu).
- Ramię A: jedno wywołanie, wymuszone lokalnie (`mode: 'single'`). Ramię H: decyduje bramka, tak jak na produkcji.
- E01–E04 po 4 przebiegi na ramię, kolejność ramion naprzemiennie. Lokalny Worker, ten sam model i ten sam tekst w obu ramionach.
- Sprawdzenie bramki bez modelu, przed przebiegami: teksty T01–T09, D01–D03, E01–E05 i fragmenty długich dokumentów z `eval/longdoc/`. Błąd w liczeniu poprawiam przed pomiarem i zapisuję tutaj.
- Dokumentu firmy nie używam, tak jak w ADR-0010.

## Reguła decyzji (zapisana przed pomiarem)

Bramka trafia na produkcję tylko wtedy, gdy spełnia wszystkie warunki:

1. Kieruje E01–E04 do trybu równoległego, a T01–T09, D01 i E05 zostawia przy jednym wywołaniu.
2. Na E01–E04 mediana czasu H jest co najmniej o 30% niższa niż A, a najdłuższy przebieg H trwa nie więcej niż 20 s.
3. Wszystkie przebiegi H kończą się wynikiem bez błędu.
4. Jakość nie spada: średnie trafienie znanych kwot i dat w H nie jest mniejsze niż w A pomniejszone o 2 pozycje, a wszystkie fakty H są w tekście PDF.

W przeciwnym razie produkcja zostaje przy jednym wywołaniu, a wynik zapisuję tutaj.

## Wynik (2026-10-09, lokalny Worker, `eval/results/2026-10-09-tryb-dla-gestych/`)

Sprawdzenie bramki bez modelu (`gate.json`): E01–E04, a także D02 i D03, trafiły do trybu równoległego. T01–T09, D01, E05 i wszystkie fragmenty długich dokumentów z `eval/longdoc/` zostały przy jednym wywołaniu, więc pomiary z ADR-0008 nadal ich dotyczą. Liczenia nie trzeba było poprawiać.

|                        | A: jedno wywołanie                             | H: bramka                                     |
| ---------------------- | ---------------------------------------------- | --------------------------------------------- |
| mediana czasu, E01–E04 | 21,7 s                                         | 10,7 s (−50,9%)                               |
| mediana dla dokumentu  | E01 25,5 s, E02 15,1 s, E03 25,9 s, E04 20,4 s | E01 14,4 s, E02 8,1 s, E03 13,2 s, E04 10,4 s |
| najdłuższy przebieg    | 27,6 s                                         | 15,6 s                                        |
| wyniki bez błędu       | 15/16 (E03: przekroczenie czasu po 29,1 s)     | 16/16                                         |
| znane kwoty i daty     | wszystkie, w każdym udanym przebiegu           | wszystkie, w każdym przebiegu                 |
| fakty spoza tekstu PDF | 0                                              | 0                                             |

Wszystkie cztery warunki są spełnione.

Zmiany między zapisaniem reguły a wynikiem:

- Generator E02 drukował też kolumny kapitału i odsetek, czyli około 39 kwot zamiast zaplanowanych 18. Poprawiłem go przed pomiarem, żeby dokument zgadzał się z planem.
- Po pomiarze poprawiłem błąd w ocenie: ujemne saldo końcowe E01 było w prawdzie zapisane ze znakiem, a ocena porównywała je z wartością bezwzględną z odpowiedzi. Odpowiedzi obu ramion oceniłem ponownie z zapisanych plików (`run_hybrid.py --rescore`). Przed poprawką obu ramionom brakowało tej samej kwoty, więc decyzja się nie zmieniła.

Na produkcji, po wdrożeniu (`produkcja/`): aneks E03 w 15,0 s, a zestawienie faktur D03 w 17,4 i 16,9 s, ze wszystkimi kwotami i bez faktów spoza tekstu. Pierwsze zapytanie o D03 skończyło się jednak przekroczeniem czasu po 27,2 s, z komunikatem i przyciskiem ponowienia. Przyczyny nie znam: mogła to być wolna odpowiedź jednej z trzech grup albo ponowienie po walidacji. Tryb równoległy trwa tyle, ile najdłuższe z trzech wywołań, więc jedno wolne wywołanie wydłuża całość.

## Decyzja

Bramka jest na produkcji od 2026-10-09 (Worker w wersji a4d0ecda). Dokument z co najmniej 15 różnymi kwotami i 15 różnymi datami idzie trzema równoległymi grupami pól, a każdy inny jednym wywołaniem, jak wcześniej. Taki dokument kosztuje trzy wywołania modelu zamiast jednego. Dzienne limity liczą zapytania, więc się nie zmieniają. Wynik dokumentu testowego firmy (9/10, 25 s) pochodzi z wersji z jednym wywołaniem. Czy ten dokument przechodzi przez bramkę, nie sprawdzałem, bo zbioru testowego nie uruchamiam ponownie.
