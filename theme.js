// Applica subito il tema scelto (chiaro, scuro o automatico) per evitare il lampo di colori sbagliati.
(function () {
  try {
    var t = localStorage.getItem("girovia.theme");
    t = t && JSON.parse(t);
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (err) { void err; /* memoria non disponibile: tema automatico */ }
})();
