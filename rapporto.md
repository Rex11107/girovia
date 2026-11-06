# Girovia su Android (emulatore): prova offline

Eseguito: 2026-11-06T13:03:26.467Z

Android API 34 · WebView com.google.android.webview, 113.0.5672.136

## 1. Online
- ✅ L'app si apre — Dove vuoi andare?
- ✅ Gira come app Android con il componente Rete
- ✅ La mappa si carica — 4 riquadri
- ✅ Partenze dalla stazione SMN — 36 partenze
- ✅ Percorso con i mezzi verso Pontassieve — 5 soluzioni
- ✅ Viaggio salvato
- ✅ Dettaglio e corsa intera — 12 fermate
- ✅ Tile della mappa conservate sul telefono — 46 riquadri

## 2. Modalità aereo con l'app aperta
- ✅ Compare l'avviso "Sei offline" — Sei offline · mappa, viaggi e fermate già visti restano disponibili

## 3. App riaperta senza rete
- ✅ L'app si apre offline — Dove vuoi andare?
- ✅ Avviso offline all'avvio
- ✅ La mappa mostra le zone già viste — 8 riquadri dalla memoria
- ✅ Viaggio salvato → risultati salvati — 5 soluzioni · "Risultati salvati alle 14:04Sei offline: si aggiornano quando torna la"
- ✅ Corsa intera salvata — 12 fermate
- ✅ Partenze salvate della stazione SMN — 32 partenze non ancora passate
- ✅ Ricerca nuova offline: messaggio chiaro, nessun blocco — Sei offline: puoi riaprire i viaggi e le fermate già consultati, il resto torna con la ret

## 4. Di nuovo online
- ✅ L'avviso offline sparisce
- ❌ La ricerca torna a funzionare — page.waitForFunction: Timeout 60000ms exceeded.

**Esito: 1 verifiche fallite**
