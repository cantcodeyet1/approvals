import { Router } from 'express';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseAdmin.js';

const router = Router();

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('projects').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const id = randomUUID();
  const { error } = await supabase.from('projects').insert({ id, name: name.trim() });

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That project already exists' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ id, name: name.trim() });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
