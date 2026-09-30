import { createGameServer } from './app';

const game = createGameServer();
const port = Number(process.env.PORT ?? 3001);
game.server.listen(port, '0.0.0.0', () => console.log(`Slipstream race server listening on ${port}`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (closing) return; closing = true;
  void game.close().then(() => process.exit(0));
});
