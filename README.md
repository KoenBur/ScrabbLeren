# ScrabbLeren

Een Nederlandstalige, volledig statische PWA om Scrabblewoorden te oefenen. Er is geen backend en je voortgang blijft in de IndexedDB van je browser.

## Oefenen en gegevens

- Zoeken controleert exacte woorden, patronen (`?` = één tegel, `*` = willekeurige reeks) en rekken met blanco's (`?`).
- Oefeningen omvatten 2- en 3-letterwoorden, voor- en achterhaken, 7-/8-tegelalfagrammen en de dure letters Q, X, Y, Z, C en IJ.
- Alfagrammen worden gerangschikt naar combinatorische waarschijnlijkheid met de Nederlandse tegelverdeling; de instelling beperkt de oefening tot de waarschijnlijkste N rekken.
- Antwoorden werken met `Enter`; `spatie` gaat naar de volgende oefening wanneer geen invoerveld actief is.
- Kaarten en dagstatistieken worden lokaal bijgehouden met spaced repetition. Exporteer of importeer ze als JSON via **Voortgang meenemen**. Een eigen woordenlijst is bewust geen onderdeel van de voortgangsbackup.
- De service worker cachet de site en woordenlijst voor offline gebruik. Laad de website eerst eenmaal online en gebruik de gepubliceerde HTTPS-site of een lokale HTTP-server (niet `file://`).

## Bron en licentie

De woorden en woordvormen zijn afgeleid van de Nederlandse lijst van Stichting OpenTaal en de OpenTaal-Hunspell-woordenlijst. Beide zijn beschikbaar onder de Revised BSD License (3-clause) en/of CC BY 3.0. De volledige voorwaarden staan in [`licenses/OPENTAAL-LICENSE.txt`](./licenses/OPENTAAL-LICENSE.txt) en [`licenses/OPENTAAL-HUNSPELL-LICENSE.txt`](./licenses/OPENTAAL-HUNSPELL-LICENSE.txt); herkomst en afleidingsinformatie staan in [`licenses/README.txt`](./licenses/README.txt). OpenTaal bepaalt niet of een woord door een specifiek woordspel wordt geaccepteerd.
