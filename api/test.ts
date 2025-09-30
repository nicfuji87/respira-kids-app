import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'API Routes funcionando!',
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  });
}
