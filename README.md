# Girovia

Mezzi pubblici, auto e piedi per Firenze e la Toscana, in un'unica app. Senza pubblicità, senza account, senza tracciamento.

## Cosa fa

- **Mezzi pubblici**: percorsi con bus Autolinee Toscane, treni Trenitalia e TFT, tramvia, con cambi e tratti a piedi. Orari ufficiali (open data GTFS).
- **Partenze da una fermata**: prossimi passaggi, binario, ritardo quando il dato in tempo reale esiste.
- **Corsa intera**: tutte le fermate di una linea con gli orari e il tragitto disegnato sulla mappa.
- **Auto e a piedi**: percorso, distanza, tempo e indicazioni svolta per svolta.
- **Fermate sulla mappa**: avvicinati con lo zoom e tocca una fermata per vederne gli orari.
- **Tocco sulla mappa**: scegli qualsiasi punto come partenza o arrivo.

## Da dove arrivano i dati

| Cosa | Fonte |
|---|---|
| Orari, linee, percorsi dei mezzi | [Transitous](https://transitous.org) (dati GTFS pubblicati dalla Regione Toscana, Trenitalia e altri) |
| Mappa | [OpenStreetMap](https://www.openstreetmap.org) |
| Percorsi in auto e a piedi | [OSRM di FOSSGIS](https://routing.openstreetmap.de) |

L'app non ha un server suo: il telefono chiede i dati direttamente a questi servizi gratuiti. Le ricerche recenti restano solo sul telefono.

## Limiti da sapere

- Per i bus di Autolinee Toscane oggi non esiste un feed pubblico in tempo reale: vedi gli **orari programmati**. Dove il dato live esiste, l'app lo mostra.
- I tempi **in auto non considerano il traffico**.
- Per la **navigazione vocale** in auto, il pulsante "Apri in un'app di navigazione" passa la destinazione a Organic Maps, OsmAnd o simili.
- Transitous è un servizio gratuito gestito da volontari: va bene per uso personale, non commerciale.

## Metterla sul telefono

L'app si pubblica da sola su **https://rex11107.github.io/girovia/** a ogni modifica del ramo `main`.

Apri l'indirizzo con Chrome (Android) o Safari (iPhone) e scegli **Aggiungi a schermata Home**. Da lì si apre come un'app normale, a schermo intero.

## Controlli automatici

A ogni modifica e a ogni pull request, GitHub Actions esegue:

| Controllo | Cosa verifica |
|---|---|
| ESLint | errori nel codice, variabili e funzioni inutilizzate |
| html-validate | HTML valido e accessibile |
| Playwright, dati di esempio | tutta l'interfaccia su un telefono simulato: ricerca, risultati, dettaglio, corsa intera, partenze, auto, piedi, errori, tema chiaro e scuro |
| Dati reali | chiamate vere a Transitous e OSRM su tratte di Firenze e provincia, e l'app completa usata come da una persona, con screenshot |

Il controllo con i dati reali gira anche ogni giorno feriale, per accorgersi subito se un servizio cambia. Il riepilogo è nella pagina del job su GitHub, gli screenshot negli artefatti.

In locale: `npm ci`, poi `npm run lint`, `npm test` e `npm run test:live`.

## Struttura

- `index.html`: interfaccia e stili
- `app.js`: logica (ricerca luoghi, percorsi, partenze, mappa)
- `config.js`: indirizzi dei servizi, centro della mappa, contatto del progetto
- `tests/`: test con dati di esempio e con dati reali
- `.github/workflows/`: controlli e pubblicazione
- `manifest.webmanifest`, icone: installazione sulla schermata Home

Licenza MIT.
