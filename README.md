# Girovia

Mezzi pubblici, auto e piedi per Firenze e la Toscana, in un'unica app. Senza pubblicità, senza account, senza tracciamento.

## Cosa fa

- **Mezzi pubblici**: percorsi con bus Autolinee Toscane, treni Trenitalia e TFT, tramvia, con cambi e tratti a piedi. Orari ufficiali (open data GTFS).
- **Navigazione in auto e a piedi**: segue il GPS, mostra la prossima indicazione in grande, la legge a voce in italiano (disattivabile), ricalcola se esci dal percorso e tiene lo schermo acceso.
- **Segui il viaggio con i mezzi**: ti guida a piedi alla fermata, mostra le fermate che mancano e avvisa a voce e con vibrazione quando scendere. Nell'app Android programma anche una notifica 2 minuti prima dell'arrivo, che suona anche a telefono in tasca.
- **Partenze da una fermata**: prossimi passaggi divisi per giorno, binario, ritardo quando il dato in tempo reale esiste.
- **Corsa intera**: tutte le fermate di una linea con gli orari e il tragitto sulla mappa.
- **Recenti, Viaggi salvati, Preferiti** (con Casa e Lavoro): tutto salvato solo sul telefono.
- **Fermate sulla mappa**: avvicinati con lo zoom e tocca una fermata per vederne gli orari.

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
- La navigazione funziona con l'app aperta. Gli avvisi di discesa a schermo spento si basano sull'orario previsto, non sul GPS.
- Transitous è un servizio gratuito gestito da volontari: va bene per uso personale, non commerciale.

## Metterla sul telefono

L'app si pubblica da sola su **https://rex11107.github.io/girovia/** a ogni modifica del ramo `main`.

Apri l'indirizzo con Chrome (Android) o Safari (iPhone) e scegli **Aggiungi a schermata Home**. Da lì si apre come un'app normale, a schermo intero.

## App Android (APK)

Scarica l'ultima versione dal telefono:
**https://github.com/Rex11107/girovia/releases/latest/download/girovia.apk**

Aprila e consenti l'installazione da questa fonte quando Android lo chiede. Gli aggiornamenti si installano sopra la versione precedente: l'APK è sempre firmato con la stessa chiave, salvata cifrata in `android-src/release.p12.enc` e sbloccata in GitHub Actions dal segreto `APK_KEY_PASS`.

L'APK contiene l'app (funziona anche se GitHub Pages è giù), usa gli stessi servizi del sito e gestisce il tasto Indietro del telefono. Viene ricompilato a ogni modifica dell'app.

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
- `capacitor.config.json`, `android-src/`: app Android (icone, avvio, permessi, chiave cifrata)

Licenza MIT.
