# ADR-0009: OCR skanów przez obrazy stron

Status: przyjęta (2026-10-08); reguła decyzji zapisana przed implementacją i pomiarem; limit 8 stron zastąpił planer z ADR-0012 (paczki po 8 stron, najwyżej 4 części)

## Kontekst

Brief (COULD): OCR skanów bez warstwy tekstowej. Worker na planie darmowym ma 10 ms CPU na żądanie, a rozkodowanie kilku MB base64 z JSON-a może tyle zająć. Gemini 3 liczy obraz strony jako 560 tokenów przy rozdzielczości `medium`, na której według dokumentacji jakość OCR dokumentów przestaje rosnąć. Całe żądanie z obrazami inline może mieć do 20 MB. Wynik ma być w mniej niż 30 s.

## Projekt

- Gdy PDF nie ma warstwy tekstowej, przeglądarka renderuje strony 1..N do JPEG (dłuższy bok 1600 px, jakość 0,7) i wysyła je do `/analyze-scan`.
- Worker sprawdza liczbę i rozmiar obrazów, wysyła je do modelu z tymi samymi regułami co ścieżka tekstowa i jedną dodatkową: wartości przepisujemy tak, jak są wydrukowane, bez przeliczania. Walidacja, ponowienie i budżet 27 s są te same. Prompt ścieżki tekstowej się nie zmienia (test hasha).
- Skan dłuższy niż N stron: analiza pierwszych N stron, komunikat w interfejsie i pole `meta.pagesAnalyzed` w JSON-ie.

## Pomiar (zaplanowany przed uruchomieniem)

- Skany syntetyczne: T08 (1 strona, fakty z T01) oraz pierwsze 4 i 8 stron regulaminu T06 wyrenderowane do obrazów.
- Każdy skan dwa razy przez prawdziwy interfejs na produkcji. Mierzymy czas od wgrania do wyniku, to, czy Worker odpowiada bez błędu (bez przekroczenia limitu CPU), i wynik T08 według etykiety T01.

## Reguła decyzji (zapisana przed pomiarem)

- N = największa liczba stron z {1, 4, 8}, przy której oba przebiegi trwają co najwyżej 30 s i kończą się wynikiem bez błędu.
- OCR zostaje włączony tylko wtedy, gdy T08 przejdzie co najmniej 16 z 18 sprawdzeń etykiety T01 (OCR może pomylić pojedynczy znak). W przeciwnym razie skany dostają dotychczasowy komunikat, a wynik zapisujemy tutaj.

## Wynik

| skan                | stron | przebieg 1 | przebieg 2 | wynik                                           |
| ------------------- | ----- | ---------- | ---------- | ----------------------------------------------- |
| T08 (faktura T01)   | 1     | 8,4 s      | 7,5 s      | 18/18 i 18/18 sprawdzeń etykiety T01            |
| S04 (regulamin T06) | 4     | 8,5 s      | 5,9 s      | bez błędu; opłata 49 zł z § 17 odczytana        |
| S08 (regulamin T06) | 8     | 8,0 s      | 8,5 s      | bez błędu; 49 zł i kara 500 zł z § 44 odczytane |

Pomiar: 2026-10-08, produkcja, przez interfejs. Według reguły N = 8 (największa liczba stron z {1, 4, 8}, przy której oba przebiegi zmieściły się w 30 s bez błędu), a T08 przekroczył próg 16/18, więc OCR zostaje włączony z limitem 8 stron. Czas prawie nie zależy od liczby stron. Rozdzielczość obrazu dla modelu jest domyślna: przykład z dokumentacji dotyczył innego formatu API niż `generateContent`, więc nie ustawiałem pola, którego nie mogłem potwierdzić.

Dodatkowo (poza regułą, lokalnie): 20 faktur z moich wcześniejszych trudnych skanów (zdjęcia, skany o złej jakości, uszkodzone), 15 z nich z pułapkami w wydrukowanych wartościach. Wynik: 160 ze 160 sprawdzeń (typ, numer, trzy daty, trzy sumy), 6,4–11,1 s na dokument. Skrypt oceny przeszedł kontrolę negatywną: dwa celowo zepsute fakty dały dokładnie 158/160.

## Pochodzenie reguły i CPU

Reguła jest w commicie 6fd11a2 (22:44), wcześniejszym niż pomiar na produkcji; wyniki są w `eval/results/2026-10-08-ocr/`. ADR-0001 odrzuca przesyłanie całego pliku przez Worker z powodu limitu 10 ms CPU; tu przez Worker idą obrazy stron, do 8 po najwyżej 700 tys. znaków base64 (6 MB łącznie). Czasu CPU nie mierzyłem bezpośrednio: dowodem jest brak błędów przekroczenia limitu przy skanie 8 stron (około 2 MB) w obu przebiegach.
