# Contribuire a Girovia

Grazie per l'interesse! Girovia è una web app senza bundler: HTML, CSS e moduli JavaScript, più un guscio Android (Capacitor) per l'APK.

## Avvio in locale

```bash
npm ci
npm run serve          # http://127.0.0.1:4173
```

Apri l'indirizzo con il telefono simulato del browser (strumenti per sviluppatori). Per lavorare senza il service worker usa `http://127.0.0.1:4173/index.html?nosw`.

## Struttura

| Percorso | Cosa contiene |
|---|---|
| `index.html`, `styles.css` | interfaccia e stili |
| `js/main.js` | avvio: collega i moduli, aggiornamento automatico, rete, tasto Indietro, link condivisi |
| `js/util.js` | funzioni pure (nessun accesso a pagina o rete): formattazione, nomi, geometria, testi, avvisi, link |
| `js/state.js` | stato condiviso, `config.js`, memoria sul telefono |
| `js/api.js` | Transitous e OSRM, tempo massimo e annullamento delle richieste |
| `js/map.js` | mappa, fornitori di tile, fermate e sharing, disegno dei percorsi |
| `js/places.js` | ricerca dei luoghi, preferiti, viaggi salvati, mezzo e orario |
| `js/views.js` | schermate del pannello |
| `js/nav.js` | navigazione e avvisi di discesa |
| `config.js` | indirizzi dei servizi e impostazioni modificabili |
| `sw.js` | funzionamento offline della versione web |
| `android-src/` | icone, scorciatoie, permessi e chiave cifrata dell'APK |
| `tests/` | test unitari (`unit/`), di interfaccia con dati di esempio (`*.mock.spec.js`), offline, con dati reali (`live*`) |

## Prima di aprire una pull request

```bash
npm run lint      # ESLint + validazione HTML
npm test          # test unitari + interfaccia + offline + accessibilità (axe)
```

- Ogni testo mostrato passa da `esc()`; niente `innerHTML` con dati non sistemati.
- Niente script inline: la Content-Security-Policy li blocca.
- Una nuova chiamata a un servizio esterno va aggiunta a `connect-src` in `index.html` e alla pagina `privacy.html`.
- Le funzioni nuove senza accesso alla pagina vanno in `js/util.js`, con un test in `tests/unit/`.
- Interfaccia in italiano semplice; controlla tema chiaro e scuro e la larghezza di un telefono (360 px).

## Rispetto dei servizi gratuiti

Transitous e i server FOSSGIS sono gestiti da volontari ([regole di Transitous](https://transitous.org/api/)):
- niente richieste automatiche in massa o raccolta di dati dall'API;
- il codice resta pubblico e non commerciale;
- l'attribuzione delle fonti sulla mappa resta visibile.

## Rilasci

1. Aggiorna `version` in `package.json` (es. `0.2.1`).
2. Aggiungi la sezione `## [0.2.1] - AAAA-MM-GG` in cima a `CHANGELOG.md`.
3. Al push su `main` GitHub Actions compila l'APK, controlla l'impronta della firma, crea la release `v0.2.1` con le note del changelog e tiene solo le ultime 10 release.

Senza cambio di versione l'APK viene compilato per verifica ma non pubblicato.
