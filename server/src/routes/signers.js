import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabaseAdmin.js';
import { uploadFile, signedUrl } from '../lib/storage.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();
const BUCKET = 'signatures';

// Turns a scanned/photographed signature (usually on a white background) into a
// transparent-background PNG: near-white pixels become fully transparent, with a
// soft falloff near the threshold to avoid a hard jagged edge, then trims the
// resulting transparent border so the signature sits close-cropped.
async function makeSignatureTransparent(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const WHITE_THRESHOLD = 235;
  const FALLOFF = 35;

  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    } else if (brightness > WHITE_THRESHOLD - FALLOFF) {
      const fade = (WHITE_THRESHOLD - brightness) / FALLOFF;
      data[i + 3] = Math.round(data[i + 3] * fade);
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .trim()
    .toBuffer();
}

async function withSignatureUrl(signer) {
  const url = await signedUrl(BUCKET, signer.signature_path);
  return { ...signer, signature_url: url };
}

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('signers').select('*').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(await Promise.all(data.map(withSignatureUrl)));
});

router.post('/', upload.single('signature'), async (req, res) => {
  const { fullName, signatureWidth } = req.body;
  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'fullName is required' });
  if (!req.file) return res.status(400).json({ error: 'A signature is required' });

  let transparentPng;
  try {
    transparentPng = await makeSignatureTransparent(req.file.buffer);
  } catch (err) {
    return res.status(422).json({ error: `Could not process signature image (${err.message})` });
  }

  const id = randomUUID();
  const signaturePath = `${id}-${Date.now()}.png`;
  try {
    await uploadFile(BUCKET, signaturePath, transparentPng, 'image/png');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const width = signatureWidth ? Math.min(Math.max(Number(signatureWidth), 40), 220) : 90;

  const { data, error } = await supabase
    .from('signers')
    .insert({ id, full_name: fullName.trim(), signature_path: signaturePath, signature_width: width })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(await withSignatureUrl(data));
});

router.put('/:id', upload.single('signature'), async (req, res) => {
  const { fullName, signatureWidth } = req.body;
  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'fullName is required' });

  let signaturePath;
  if (req.file) {
    let transparentPng;
    try {
      transparentPng = await makeSignatureTransparent(req.file.buffer);
    } catch (err) {
      return res.status(422).json({ error: `Could not process signature image (${err.message})` });
    }
    signaturePath = `${req.params.id}-${Date.now()}.png`;
    try {
      await uploadFile(BUCKET, signaturePath, transparentPng, 'image/png');
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const width = signatureWidth ? Math.min(Math.max(Number(signatureWidth), 40), 220) : undefined;

  const { data, error } = await supabase
    .from('signers')
    .update({
      full_name: fullName.trim(),
      ...(signaturePath ? { signature_path: signaturePath } : {}),
      ...(width !== undefined ? { signature_width: width } : {}),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(await withSignatureUrl(data));
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('signers').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
