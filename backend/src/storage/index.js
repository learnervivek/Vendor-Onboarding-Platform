import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

const root = path.resolve(env.localStoragePath);

function configureCloudinary() {
  cloudinary.config({ cloud_name: env.cloudinaryCloudName, api_key: env.cloudinaryApiKey, api_secret: env.cloudinaryApiSecret, secure: true });
}

export async function putPrivate(file, ownerId, documentId) {
  const key = `vendors/${ownerId}/${documentId}-${crypto.randomUUID()}`;
  if (env.storageProvider === 'cloudinary') {
    if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) throw new Error('Cloudinary storage is not configured.');
    configureCloudinary();
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ public_id: key, resource_type: 'auto', type: 'authenticated' }, (error, value) => error ? reject(error) : resolve(value));
      stream.end(file.buffer);
    });
    return { provider: 'cloudinary', key: result.public_id };
  }
  const filePath = path.join(root, `${key}.bin`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, file.buffer, { flag: 'wx' });
  return { provider: 'local', key };
}

export async function removePrivate(provider, key) {
  if (provider === 'cloudinary') {
    configureCloudinary();
    await cloudinary.uploader.destroy(key, { resource_type: 'auto', type: 'authenticated', invalidate: true });
    return;
  }
  await fs.rm(path.join(root, `${key}.bin`), { force: true });
}

export async function readPrivate(provider, key) {
  if (provider === 'cloudinary') {
    configureCloudinary();
    return { redirect: cloudinary.url(key, { type: 'authenticated', sign_url: true, secure: true, expires_at: Math.floor(Date.now() / 1000) + 300 }) };
  }
  return { buffer: await fs.readFile(path.join(root, `${key}.bin`)) };
}
