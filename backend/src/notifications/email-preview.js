import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export async function deliverEmailPreview({ eventId, recipient, subject, message }) {
  const directory = path.resolve(env.emailPreviewPath);
  await fs.mkdir(directory, { recursive: true });
  const filename = `${Date.now()}-${eventId}.eml`;
  await fs.writeFile(path.join(directory, filename), `To: ${recipient}\nSubject: ${subject}\n\n${message}\n`, { flag: 'wx' });
  return filename;
}
