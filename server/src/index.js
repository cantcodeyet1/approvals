import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import invoicesRouter from './routes/invoices.js';
import signersRouter from './routes/signers.js';
import priceCheckRouter from './routes/priceCheck.js';
import projectsRouter from './routes/projects.js';

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/invoices', invoicesRouter);
app.use('/api/signers', signersRouter);
app.use('/api/price-check', priceCheckRouter);
app.use('/api/projects', projectsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

app.listen(port, () => {
  console.log(`Approvals server listening on http://localhost:${port}`);
});
