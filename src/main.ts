import './style.css';
import { Game } from './core/Game';

declare global {
  interface Window {
    __SLIPSTREAM__?: { diagnostics: () => ReturnType<Game['diagnostics']> };
  }
}
const root = document.querySelector<HTMLElement>('#app')!;
try {
  const game = new Game(root);
  // Read-only instrumentation is omitted from production builds.
  if (import.meta.env.DEV) window.__SLIPSTREAM__ = { diagnostics: () => game.diagnostics() };
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (error) {
  console.error(error);
  root.innerHTML = `<div class="error"><p>SLIPSTREAM / FIRST DRIVE</p><h1>A small pit stop.</h1><p>The circuit could not start. This game needs a browser with WebGL 2 and hardware acceleration enabled. Try a current Chrome, Edge, Firefox, or Safari, then reload.</p><button class="primary" onclick="location.reload()">TRY AGAIN ↗</button></div>`;
}
