/**
 * Simple token-based auth middleware.
 * Checks for the API_AUTH_TOKEN in the Authorization header.
 */

export function authMiddleware(req, res, next) {
  // Skip auth for webhooks (Twilio calls these)
  if (req.path.startsWith('/webhook/')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = process.env.API_AUTH_TOKEN;

  if (!token) {
    // If no token configured, allow all requests (dev mode)
    return next();
  }

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (providedToken !== token) {
    return res.status(403).json({ error: 'Invalid authentication token' });
  }

  next();
}