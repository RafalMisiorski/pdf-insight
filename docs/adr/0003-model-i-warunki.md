# ADR-0003: Gemini 3.8 Flash na planie płatnym

Status: przyjęta (2026-10-08)

## Kontekst

Aplikacja jest publiczna, a jej użytkownicy są w EOG. Warunki Gemini API (wersja z 23.03.2026): „You may use only Paid Services when making API Clients available to users in the European Economic Area”. Na planie płatnym prompty i odpowiedzi nie służą do ulepszania produktów Google.

## Decyzja

`gemini-3.8-flash` (status „New Stable” na liście modeli, 2026-10-08) na planie płatnym z przedpłatą. Odpowiedź wymuszona schematem (`responseJsonSchema` z tego samego schematu Zod co walidacja), `temperature` 0,2, `thinkingLevel: low`.

## Rozważone i odrzucone

- Darmowy plan Gemini: zabroniony dla aplikacji udostępnianej w EOG.
- Groq na darmowym planie: 12 tys. tokenów na minutę, więc długie dokumenty by nie przeszły.
- Większe modele: dłuższy czas odpowiedzi przy budżecie 30 s.

## Dowód

Zbiór treningowy na produkcji: 120/120 sprawdzeń według etykiet i 97/97 wyciągniętych faktów obecnych w PDF-ie, 4–10 s na dokument (ADR-0005).

## Kiedy wrócić do decyzji

Przy wycofaniu modelu albo przekroczeniu budżetu czasu.
