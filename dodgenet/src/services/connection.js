// The real state of the connection, as seen by the requests the app makes.
//
//   online: true  + front: "cdn.example.com"   the last request reached the server through this front
//   online: true  + front: null                nothing has been requested yet
//   online: false                              every front failed (network down, or the server answers with 5xx)
//
// api.js reports it from requestWithFailover(); ConnectionStatus shows it.
// An answer like 401 or 413 still means "reachable": the server was there and refused on purpose.

let state = { online: true, front: null, origin: null };
const listeners = new Set();

function update(next) {
  if (next.online === state.online && next.front === state.front) return;
  state = next;                       // a new object, so React notices the change
  listeners.forEach((listener) => listener());
}

export function getConnection() {
  return state;
}

export function subscribeConnection(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportReachable(frontUrl) {
  let host = frontUrl;
  try {
    host = new URL(frontUrl).host;    // "cdn.example.com" or "localhost:5000"
  } catch {
    // not an absolute URL: show it as it is
  }
  update({ online: true, front: host, origin: frontUrl });
}

export function reportUnreachable() {
  update({ online: false, front: null, origin: null });
}
