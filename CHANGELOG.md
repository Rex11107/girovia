# Novità

Le versioni seguono [Semantic Versioning](https://semver.org/lang/it/). Ogni sezione diventa la nota della release su GitHub.

## [0.2.1] - 2026-11-06

### Corretto
- **Offline nell'APK**: prima non compariva l'avviso, la mappa restava vuota e le ricerche si fermavano. Ora lo stato della rete arriva da Android (in modalità aereo il browser interno credeva di essere ancora online) e la mappa conserva le zone già viste anche nell'APK.
- **Partenze delle grandi stazioni** (es. Santa Maria Novella): la stazione principale a volte non ha corse proprie; ora l'app mostra anche quelle delle fermate entro 250 m.

### Nuovo
- Senza rete restano disponibili **orari delle fermate, risultati, corse intere e percorsi già visti**, con l'ora in cui erano stati letti ("Orari salvati alle 08:30") e senza le corse già partite.
- Senza rete le ricerche rispondono subito, senza aspettare, e dicono cosa si può ancora aprire.
- Quando la rete torna, la mappa e le schermate si aggiornano da sole.

### Controlli
- Prova completa dell'APK su un emulatore Android a ogni modifica: online, modalità aereo, app riaperta offline, ritorno online, con screenshot del telefono.

### Aggiornamenti
- Capacitor 8.5.3, ESLint 10, Playwright 1.64 e azioni di GitHub più recenti.

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
- Partenze aggiornate da sole ogni 30 secondi; nel viaggio seguito ritardi e notifica di discesa aggiornati ogni minuto (oggi per i treni Trenitalia; i bus AT non pubblicano dati in tempo reale).
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
