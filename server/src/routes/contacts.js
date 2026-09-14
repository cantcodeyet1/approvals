import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseAdmin.js';

const router = Router();

// A saved address book so recipients can be autocompleted in the
// send-via-email dialog instead of retyped every time.
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('email_contacts').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });

  const { data, error } = await supabase
    .from('email_contacts')
    .insert({ id: randomUUID(), name: name.trim(), email: email.trim() })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('email_contacts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
