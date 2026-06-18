import supabase from '../db/db.js';

/**
 * Token-based auth middleware.
 * Checks for the API_AUTH_TOKEN in the Authorization header or a session token.
 */
export async function authMiddleware(req, res, next) {
  // Skip auth for public paths
  const publicPaths = ['/webhook/', '/auth/', '/health'];
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const globalToken = process.env.API_AUTH_TOKEN;

  if (!authHeader) {
    // If no token configured in env and no header, allow in dev
    if (!globalToken) return next();
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  // 1. Check global secret (system access)
  if (globalToken && providedToken === globalToken) {
    return next();
  }

  // 2. Check dynamic session token (user access)
  try {
    const decoded = Buffer.from(providedToken, 'base64').toString();
    const parts = decoded.split(':');
    
    if (parts[0] === 'admin') {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      if (parts[1] === adminPassword) {
        req.user = { role: 'admin' };
        return next();
      }
    }
    
    if (parts[0] === 'client') {
      const [_, clientId, password] = parts;
      
      // Simple validation against DB
      const { data: client, error } = await supabase
        .from('clients')
        .select('id, email, role')
        .eq('id', clientId)
        .eq('password', password)
        .single();
      
      if (client && !error) {
        req.user = { ...client, role: 'client' };
        return next();
      }
    }
  } catch (e) {
    // Fall through to 403
  }

  // If we have no global token set and it's not a valid session, 
  // we might still want to allow in dev, but let's be strict if globalToken exists.
  if (!globalToken) return next();

  return res.status(403).json({ error: 'Invalid authentication token' });
}
