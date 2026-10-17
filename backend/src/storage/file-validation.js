import path from 'node:path';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const allowedFiles = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png']
};

export function inspectFile(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const declaredAllowed = allowedFiles[file.mimetype]?.includes(extension);
  if (!declaredAllowed || file.size > MAX_FILE_SIZE) return false;
  const header = file.buffer.subarray(0, 8);
  const signatureMatches = file.mimetype === 'application/pdf'
    ? header.toString('ascii', 0, 5) === '%PDF-'
    : file.mimetype === 'image/jpeg'
      ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
      : header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;
  return signatureMatches;
}

export function fileError(message, code = 'INVALID_FILE') {
  return Object.assign(new Error(message), { statusCode: 400, code });
}
