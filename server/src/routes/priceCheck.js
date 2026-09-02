import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseAdmin.js';
import { generateMockPriceCheck } from '../mock/priceSourcing.js';

const router = Router();

// Generates a MOCK market-price comparison for a product (see mock/priceSourcing.js).
// Optionally persists it against an invoice for later reference.
router.post('/', async (req, res) => {
  const { product, location, invoiceId } = req.body;
  if (!product || !product.trim()) return res.status(400).json({ error: 'product is required' });

  const result = generateMockPriceCheck(product, location || 'Johannesburg');

  if (invoiceId) {
    const { error } = await supabase.from('price_checks').insert({
      id: randomUUID(),
      invoice_id: invoiceId,
      product: result.product,
      location: result.location,
      results: result.results,
      ai_insight: result.aiInsight,
      is_mock: true,
    });
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json(result);
});

export default router;
