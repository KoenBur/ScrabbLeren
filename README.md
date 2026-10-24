# ScrabbLeren

Een Nederlandstalige, volledig statische PWA om Scrabblewoorden te oefenen. Er is geen backend en je voortgang blijft in de IndexedDB van je browser.

## Lokaal bouwen en draaien

Vereist Python 3.10 of nieuwer en pip.

```powershell
python -m pip install -r requirements-build.txt
python scripts/build.py
python -m http.server 8000 --directory dist
```

Open daarna <http://localhost:8000>. De generator haalt bij iedere build de actuele woordenlijst van [OpenTaal/opentaal-wordlist](https://github.com/OpenTaal/opentaal-wordlist) en de Hunspell-bestanden `nl.dic` en `nl.aff` van [OpenTaal/opentaal-hunspell](https://github.com/OpenTaal/opentaal-hunspell) op. Met Spylls worden de Hunspell-verbuigings- en vervoegingsregels uitgebreid tot woordvormen. De build logt de aantallen na downloaden/woordvormgeneratie en na ieder filter. Hij schrijft `data/words.txt`, `data/alphagrams.json` en beide upstream-licentiebestanden. De site wordt samengesteld in `dist/`.

De generator filtert achtereenvolgens op letters (ASCII plus de IJ-ligatuur), kleine letters (geen eigennamen), IJ-conversie en ten slotte lengte van 2 t/m 9 tegels. Cijfers, leestekens, spaties en accenten vallen af. `ij` wordt vóór de lengtetoets intern opgeslagen als de enkele tegel `Ĳ`, die de interface als `IJ` toont. Zo past bijvoorbeeld `WIJNHANDEL` (10 letters) binnen 9 tegels. Deze expliciet gevraagde regressieterm wordt opgenomen, ook al ontbreekt hij in de huidige upstream-bestanden. Alle lengte-, patroon-, haak- en alfagramfuncties tellen `Ĳ` als één tegel.

## Publiceren op GitHub Pages

De workflow in `.github/workflows/pages.yml` installeert Spylls, bouwt en test de woordenlijst en publiceert `dist/` na iedere push naar `main` en op verzoek via **Actions → Build and publish to GitHub Pages → Run workflow**. Zet in de repository-instellingen bij **Pages** de bron op **GitHub Actions**. Geen Node.js-buildstap of backend vereist.

## Eigen woordenlijst laden

Open **Voortgang → Laad eigen .txt-lijst** en kies een lokaal tekstbestand met één woord per regel. Hoofdletters worden geaccepteerd en naar hoofdletters genormaliseerd; alleen regels met letters `A-Z` en een lengte van 2 t/m 9 tegels worden bewaard. `IJ` telt als één tegel. Andere tekens, waaronder accenten, spaties en koppeltekens, worden niet opgenomen.

De eigen lijst wordt uitsluitend in IndexedDB op dit apparaat bewaard. Het bestand wordt niet geüpload, verstuurd of in de repository geplaatst. Met **Gebruik OpenTaal** keer je terug naar de standaardlijst.

## Oefenen en gegevens

- Zoeken controleert exacte woorden, patronen (`?` = één tegel, `*` = willekeurige reeks) en rekken met blanco's (`?`).
- Oefeningen omvatten 2- en 3-letterwoorden, voor- en achterhaken, 7-/8-tegelalfagrammen en de dure letters Q, X, Y, Z, C en IJ.
- Alfagrammen worden gerangschikt naar combinatorische waarschijnlijkheid met de Nederlandse tegelverdeling; de instelling beperkt de oefening tot de waarschijnlijkste N rekken.
- Antwoorden werken met `Enter`; `spatie` gaat naar de volgende oefening wanneer geen invoerveld actief is.
- Kaarten en dagstatistieken worden lokaal bijgehouden met spaced repetition. Exporteer of importeer ze als JSON via **Voortgang meenemen**. Een eigen woordenlijst is bewust geen onderdeel van de voortgangsbackup.
- De service worker cachet de site en woordenlijst voor offline gebruik. Laad de website eerst eenmaal online en gebruik de gepubliceerde HTTPS-site of een lokale HTTP-server (niet `file://`).

## Bron en licentie

De woorden en woordvormen zijn afgeleid van de Nederlandse lijst van Stichting OpenTaal en de OpenTaal-Hunspell-woordenlijst. Beide zijn beschikbaar onder de Revised BSD License (3-clause) en/of CC BY 3.0. De volledige voorwaarden staan in [`licenses/OPENTAAL-LICENSE.txt`](./licenses/OPENTAAL-LICENSE.txt) en [`licenses/OPENTAAL-HUNSPELL-LICENSE.txt`](./licenses/OPENTAAL-HUNSPELL-LICENSE.txt); herkomst en afleidingsinformatie staan in [`licenses/README.txt`](./licenses/README.txt). OpenTaal bepaalt niet of een woord door een specifiek woordspel wordt geaccepteerd.
