import { supabase } from './supabaseAdmin.js';

export async function uploadFile(bucket, path, buffer, contentType = 'application/octet-stream') {
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

export async function downloadFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage download failed (${bucket}/${path}): ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function signedUrl(bucket, path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}

// Supabase Storage has no real directories — this removes every object under a prefix.
export async function deleteFolder(bucket, prefix) {
  const { data: files, error } = await supabase.storage.from(bucket).list(prefix);
  if (error || !files || files.length === 0) return;
  const paths = files.map((f) => `${prefix}/${f.name}`);
  await supabase.storage.from(bucket).remove(paths);
}
