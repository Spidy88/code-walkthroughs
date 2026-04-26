import express from 'express';
import { authenticate } from './middleware/auth.ts';
import { registerOrderRoutes } from './routes/orders.ts';
import { registerSessionRoutes } from './routes/sessions.ts';
import { registerUserRoutes } from './routes/users.ts';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

// Public — no auth applied
registerSessionRoutes(app);

// Authenticated — auth middleware mounted before
app.use(authenticate);
registerUserRoutes(app);
registerOrderRoutes(app);

app.listen(port, () => {
  // biome-ignore lint/suspicious/noConsole: bootstrap log
  console.log(`express-tiny listening on :${port}`);
});
