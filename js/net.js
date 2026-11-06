// Stato della rete. Nell'APK lo dice Android (Capacitor Network): nella WebView
// navigator.onLine resta spesso "online" anche in modalità aereo. Nel browser si usano
// gli eventi online/offline.

let online = navigator.onLine !== false;
const listeners = [];

export const isOffline = () => !online;
export function onNetChange(fn) { listeners.push(fn); }

function set(v) {
  if (v === online) return;
  online = v;
  for (const fn of listeners) { try { fn(online); } catch (e) { console.error(e); } }
}

export async function initNet() {
  const C = window.Capacitor;
  const N = C && C.isPluginAvailable && C.isPluginAvailable("Network") && C.Plugins && C.Plugins.Network;
  if (N) {
    try { const s = await N.getStatus(); set(!!s.connected); } catch (e) { /* resta il valore del browser */ }
    N.addListener("networkStatusChange", (s) => set(!!(s && s.connected)));
    return;
  }
  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));
}
