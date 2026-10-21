// Impostazioni di Girovia. Modifica solo questo file.
window.GIROVIA_CONFIG = {
  // Centro iniziale della mappa (Firenze, piazza del Duomo) e zoom
  center: [43.7731, 11.2560],
  zoom: 12,

  // Orari, linee e percorsi con i mezzi pubblici (open data GTFS)
  transitous: "https://api.transitous.org",

  // Percorsi in auto e a piedi (OpenStreetMap, server FOSSGIS)
  routingCar: "https://routing.openstreetmap.de/routed-car",
  routingFoot: "https://routing.openstreetmap.de/routed-foot",

  // Mappa: fornitori di tile in ordine di preferenza. Se il primo smette di rispondere
  // (molte tile in errore), l'app passa da sola al successivo.
  // La policy di tile.openstreetmap.org chiede un uso moderato: per un uso intenso metti
  // al primo posto un fornitore con chiave propria (per esempio MapTiler o Stadia Maps).
  tileProviders: [
    { name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' },
    { name: "OpenStreetMap France", url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · OSM France' },
    { name: "CARTO Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", subdomains: "abcd", maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' }
  ],

  // Tempo massimo di attesa per orari e percorsi (millisecondi)
  timeoutMs: 15000,

  // Il regolamento di Transitous chiede un contatto per chi usa il servizio.
  // Scrivi qui un tuo indirizzo email o il link al tuo profilo GitHub.
  contact: "https://github.com/Rex11107/girovia"
};
