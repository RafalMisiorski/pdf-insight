# ADR-0012: Planer dokumentu: tekst i skany w jednym wyniku, w 30 s

Status: przyjęte z limitem 4 części według reguły zapisanej przed pomiarem (reguła: 2026-10-09, 10:47, plan pomiaru zmieniony o 10:53; wynik: 11:27). Reguła i wynik trafiają do repozytorium w jednym commicie, więc kolejność potwierdza mój dziennik pracy, a nie historia git.

## Kontekst

PDF mieszany traci dziś treść stron bez tekstu (wynik tylko je wymienia), ze skanu analizujemy pierwsze 8 stron, a tekst ponad 1,6 mln znaków kończy się błędem, czyli bez podsumowania. Przeglądarka nie jest wąskim gardłem: odczyt tekstu 279 stron trwa 0,8 s, a obrazy 8 stron skanu 0,8 s (2026-10-09, Chromium, API odpowiadające od razu). Czas zajmują wywołania modelu, a ich liczbę ogranicza limit 10 zapytań na minutę z jednego adresu IP.

## Projekt

- Strony z tekstem idą jako fragmenty do 400 tys. znaków, a strony bez tekstu, na których jest obraz, jako paczki do 8 obrazów stron (OCR). Strona bez tekstu i bez obrazu jest pusta, więc jej nie wysyłam.
- Dokument dostaje najwyżej `MAX_PARTS` części (górna granica 6, a ze scaleniem 7 zapytań, w limicie 10 zapytań na minutę z jednego adresu); wartość ustala pomiar niżej. Części idą równolegle, potem kod scala fakty, a model pisze jedno podsumowanie, jak w ADR-0008.
- Gdy części byłoby więcej, wybieram je równomiernie z całego dokumentu, zawsze z pierwszą, a pominięte strony wymieniam przy wyniku. Część, która się nie uda, nie przerywa analizy: jej strony są wymienione jako nieprzeanalizowane. Poprawka z 2026-10-09, 13:50: gdy nieudane części obejmują co najmniej tyle stron co udane, aplikacja pokazuje błąd z ponowieniem, bo wynik z mniejszości stron (np. z jednej strony skanu, gdy nie udała się główna część tekstu) wyglądał jak analiza całego dokumentu.
- Dokument z jedną częścią wysyła dokładnie to samo zapytanie co dotąd.

## Pomiar (zaplanowany przed uruchomieniem)

Plan zmieniłem o 10:53, przed jakimkolwiek przebiegiem modelu. Pierwsza wersja sprawdzała cztery przykładowe dokumenty. Ta wyznacza granicę, do której aplikacja analizuje cały dokument w 30 s, i ją deklaruje.

Drabina dokumentów syntetycznych w `eval/hard/`, każdy poniżej 10 MB, z faktami wstawionymi na początku, w środku i na końcu (na stronach skanu w obrazie strony). Każdy szczebel dwa razy przez prawdziwy interfejs, z lokalną stroną i lokalnym Workerem, na tym samym modelu. Czas liczę od wybrania pliku do wyniku, a między przebiegami czekam minutę, żeby nie trafić w limit zapytań na minutę.

| części | tekst                         | skan                | mieszany                                  |
| ------ | ----------------------------- | ------------------- | ----------------------------------------- |
| 2      |                               | 16 stron (2 paczki) |                                           |
| 4      | 1,6 mln znaków (4 fragmenty)  | 32 strony           | 400 tys. znaków i 24 strony skanu (1 + 3) |
| 6      | 2,4 mln znaków (6 fragmentów) | 48 stron            | 400 tys. znaków i 40 stron skanu (1 + 5)  |

## Reguła decyzji (zapisana przed pomiarem)

1. Szczebel jest zaliczony, gdy oba przebiegi kończą się wynikiem bez błędu w czasie do 30 s od wybrania pliku, z co najmniej 80% wstawionych faktów i bez faktów spoza dokumentu.
2. Limit części na dokument (`MAX_PARTS`) to 6, gdy zaliczone są wszystkie szczeble z 4 i 6 częściami, 4, gdy zaliczone są wszystkie szczeble z 4 częściami, a 2, gdy zaliczony jest skan 16 stron. Na tej podstawie deklaruję w README i przy wyborze pliku, do ilu znaków tekstu i ilu stron skanu analizowany jest cały dokument. Większy dokument jest analizowany częściowo, z listą pominiętych stron, a nie ponad 30 s.
3. Planer trafia do aplikacji, gdy limit wynosi co najmniej 2, a testy potwierdzają, że dokument z jedną częścią (w tym T01–T09) wysyła to samo zapytanie co przed zmianą.

W przeciwnym razie oddaję wersję bez planera, a wynik zapisuję tutaj.

## Wynik (2026-10-09, 11:09–11:27, lokalna strona i lokalny Worker, `eval/results/2026-10-09-planer/`)

Najpierw, bez modelu (API zastąpione w przeglądarce), sprawdziłem zapytania: każdy dokument dzieli się dokładnie według drabiny i żadna strona nie wypada poza limit.

| części | dokument                                                       | przebieg 1 | przebieg 2                         | fakty         |
| ------ | -------------------------------------------------------------- | ---------- | ---------------------------------- | ------------- |
| 2      | skan, 16 stron, 2,2 MB                                         | 24,2 s     | 15,7 s                             | 9/9 i 9/9     |
| 4      | tekst, 1,55 mln znaków, 360 stron                              | 17,6 s     | 16,5 s                             | 9/9 i 9/9     |
| 4      | skan, 32 strony, 4,4 MB                                        | 24,1 s     | 23,7 s                             | 9/9 i 9/9     |
| 4      | mieszany: 380 tys. znaków i 24 strony skanu, 113 stron, 3,4 MB | 19,4 s     | nieważny (niżej), powtórka: 27,4 s | 18/18 i 18/18 |
| 6      | tekst, 2,32 mln znaków, 538 stron                              | 21,3 s     | 21,7 s                             | 9/9 i 9/9     |
| 6      | skan, 48 stron, 6,5 MB                                         | 24,7 s     | 28,5 s                             | 9/9 i 9/9     |
| 6      | mieszany: 380 tys. znaków i 40 stron skanu, 129 stron, 5,6 MB  | 23,3 s     | błąd po 30,7 s                     | 18/18         |

Błąd w ostatnim wierszu: części trwały tak długo, że na scalenie zostało mniej niż 5 s, więc aplikacja pokazała komunikat o przekroczeniu czasu z przyciskiem ponowienia. Żaden wynik nie zawiera faktu spoza dokumentu.

Odstępstwo od planu: przebieg 2 dokumentu mieszanego z 24 stronami skanu uznałem za nieważny. Skończył się po 13,5 s błędem „Za dużo zapytań”, bo mój skrypt pomiaru liczył przerwę między dokumentami tylko wewnątrz jednego procesu. Drugi przebieg ruszył więc bez przerwy po ostatnim dokumencie pierwszego (7 zapytań) i w jednym minutowym oknie limitu znalazło się 12 zapytań. Ten jeden przebieg powtórzyłem z przerwą i liczę go według tej samej reguły. Porażki dokumentu mieszanego z 40 stronami skanu nie powtarzałem, bo nie wynikała z pomiaru.

W czasie pomiaru procesor był w około 70% zajęty przez inne programy, więc odczyt i obrazy stron w przeglądarce trwały 3–7 s zamiast poniżej 1 s. Wyniki są raczej pesymistyczne.

Według reguły: wszystkie szczeble z 4 częściami są zaliczone, a mieszany z 6 częściami nie, więc `MAX_PARTS = 4`.

## Decyzja

Planer jest w aplikacji z limitem 4 części. Cały dokument do 10 MB jest analizowany w czasie do 30 s, gdy mieści się w 4 częściach:

- tekst do około 1,6 mln znaków (4 fragmenty po 400 tys.),
- skan do 32 stron (4 paczki po 8 stron),
- dokument mieszany do 4 części łącznie, na przykład do 400 tys. znaków tekstu i 24 stron skanu.

Najdłuższy zmierzony czas w tych granicach to 27,4 s, więc zapas jest mały. Większy dokument jest analizowany częściowo: aplikacja wybiera 4 części równomiernie z całego dokumentu, zawsze z pierwszą, a wynik wymienia pominięte strony. Cztery części i scalenie to 5 zapytań, w limicie 10 zapytań na minutę z jednego adresu. Tekst i skan z 6 częściami zmieściły się w czasie w obu przebiegach, ale reguła wymaga zaliczenia wszystkich szczebli, a dokument mieszany z 6 częściami raz przekroczył czas.

Incydent (2026-10-09, 13:44–14:06): na dokumencie firmy raz nie udała się część tekstowa, a aplikacja pokazała wynik z jednej strony skanu. Logi Workera pokazały 11–19 ms CPU na tej części (ścieżka równoległa z ADR-0011) przy limicie 10 ms planu darmowego. Worker jest teraz na planie płatnym (30 s CPU), a wynik częściowy powstaje tylko z większości stron (wyżej). Po zmianie dwa przebiegi tej części na produkcji przeszły.
