import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseAdmin.js';
import { researchInvoicePrice } from '../lib/priceResearch.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Reads the uploaded invoice PDF, identifies the item(s) being purchased,
// searches the real web for comparable prices, and returns a structured
// comparison — no manual product description required. Optionally persists
// the result against an invoice for later reference.
router.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { location, invoiceId } = req.body;
  if (!file) return res.status(400).json({ error: 'Missing invoice file' });

  let result;
  try {
    result = await researchInvoicePrice(file.buffer, location || 'Johannesburg');
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  if (invoiceId) {
    const { error } = await supabase.from('price_checks').insert({
      id: randomUUID(),
      invoice_id: invoiceId,
      product: result.product,
      location: result.location,
      results: result.results,
      ai_insight: result.aiInsight,
      is_mock: false,
    });
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json(result);
});

export default router;
