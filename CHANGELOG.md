# Novità

Le versioni seguono [Semantic Versioning](https://semver.org/lang/it/). Ogni sezione diventa la nota della release su GitHub.

## [0.2.0] - 2026-10-21

### Nuovo
- **Bici**: percorsi in bici con il server bici di OpenStreetMap (FOSSGIS) e navigazione con annunci a voce.
- **Bici e monopattini in sharing**: nei percorsi con i mezzi e sulla mappa, dove il servizio pubblica i dati. Si attiva da solo; l'opzione è nella scheda Info.
- **Condividi** un percorso con un link: chi lo apre vede lo stesso viaggio.
- **Biglietti**: link per acquistare dal dettaglio del viaggio (AT, Trenitalia o il sito dell'azienda).
- **Scorciatoie Casa e Lavoro**: tieni premuta l'icona dell'app.
- **Tema** chiaro, scuro o automatico, nella scheda Info.
- **Fermate qui**: elenco delle fermate visibili sulla mappa.
- Corsa intera: fermate già passate segnate con icona e parola, prossima fermata evidenziata.
- **Funziona offline** (versione web): l'app si apre senza rete e mostra le zone di mappa già viste; avvisa quando la rete va e viene.
- **Avvisi di servizio** (scioperi, deviazioni, lavori) nei risultati, nel dettaglio e alla fermata, quando l'azienda li pubblica.
- Partenze aggiornate da sole ogni 30 secondi; nel viaggio seguito ritardi e notifica di discesa aggiornati ogni minuto.
- Pagina **Privacy** con cosa resta sul telefono e cosa ricevono i servizi esterni.

### Migliorato
- Leaflet e caratteri inclusi nell'app: nessuna richiesta a CDN o a Google Fonts.
- Richieste con un tempo massimo di 15 secondi; una nuova ricerca annulla la precedente.
- Mappa di riserva automatica se OpenStreetMap non risponde.
- Fermate sulla mappa raggiungibili con tastiera e lettore di schermo.
- Content-Security-Policy.
- Codice diviso in moduli; stili in un file a parte.

### Controlli
- Test unitari delle funzioni pure, audit di accessibilità axe su tutte le schermate, test offline e di rete.
- La firma dell'APK viene confrontata con l'impronta attesa.
- Release solo quando cambia la versione; restano le ultime 10.

## [0.1.7] - 2026-10-21
- Funzionamento offline, avvisi di rete, dipendenze locali, privacy, tempo reale e avvisi di servizio (prima versione).

## [0.1.6] - 2026-10-21
- X per chiudere la nuvoletta sulla mappa.

## [0.1.5] - 2026-10-21
- Navigazione in auto e a piedi con voce; "Segui il viaggio" con avvisi di discesa.
- Pannello a schede: Recenti, Viaggi, Preferiti, Info.
- Tolta la barra del titolo nell'APK.

## [0.1.4] - 2026-10-21
- Prima APK firmata.
