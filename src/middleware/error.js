import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';

export const notFound = (req, res) => res.status(404).json({ error: 'Not found.' });

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);
  if (err instanceof ZodError) {
    const i = err.issues[0];
    const path = i.path.join('.');
    return res.status(400).json({ error: path ? `${path}: ${i.message}` : i.message, details: err.issues.map((x) => ({ path: x.path.join('.'), message: x.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
  if (err.name === 'CastError' || err.name === 'ValidationError') return res.status(400).json({ error: 'Invalid data supplied.' });
  if (err.code === 11000) return res.status(409).json({ error: 'A record with that value already exists.' });
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}