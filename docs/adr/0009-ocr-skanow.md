# ADR-0009: OCR skanów przez obrazy stron

Status: projekt i reguła decyzji zapisane przed implementacją i pomiarem (2026-10-08)

## Kontekst

Brief (COULD F-10): skany bez warstwy tekstowej. Worker na planie darmowym ma 10 ms CPU na żądanie, a rozkodowanie kilku MB base64 z JSON-a może tyle zająć. Gemini 3 liczy obraz strony jako 560 tokenów przy rozdzielczości `medium`, na której według dokumentacji jakość OCR dokumentów przestaje rosnąć. Całe żądanie z obrazami inline może mieć do 20 MB. Wynik ma być w mniej niż 30 s.

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

(uzupełniane po pomiarze)
