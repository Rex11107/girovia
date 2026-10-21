// Stato condiviso dell'app, impostazioni (config.js) e memoria sul telefono.

export const CFG = window.GIROVIA_CONFIG || {};

export const state = {
  from: null, to: null, mode: "TRANSIT",
  me: null, activeField: null,
  lastPlan: null, nextCursor: null,
  stack: [] // pila delle viste del pannello
};

export function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem("girovia." + key) || "null"); localStorage.setItem("girovia." + key, JSON.stringify(val)); } catch (e) { return null; } }

export const NAV = { active: false, voice: store("voice") !== false };
