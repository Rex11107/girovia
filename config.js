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

  // Mappa
  tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

  // Il regolamento di Transitous chiede un contatto per chi usa il servizio.
  // Scrivi qui un tuo indirizzo email o il link al tuo profilo GitHub.
  contact: "https://github.com/Rex11107/girovia"
};
