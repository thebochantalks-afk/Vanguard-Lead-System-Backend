import { Router } from 'express';
import supabase from '../db/db.js';

const router = Router();

/**
 * POST /auth/login
 * Simple password-based login.
 * Admin: email=admin@vanguard.com, password=ADMIN_PASSWORD env var
 * Client: email from clients table, password from clients table
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@vanguard.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Check if admin
    if (email === adminEmail && password === adminPassword) {
      return res.json({
        success: true,
        role: 'admin',
        user: { name: 'Agency Owner', email: adminEmail },
        token: Buffer.from(`admin:${adminPassword}`).toString('base64'),
      });
    }

    // Check if client
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, business_name, industry, email, password, plan, amount, subscription_status, payment_status')
      .eq('email', email)
      .single();

    if (error || !client) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (client.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({
      success: true,
      role: 'client',
      user: {
        id: client.id,
        name: client.name,
        business_name: client.business_name,
        industry: client.industry,
      },
      token: Buffer.from(`client:${client.id}:${password}`).toString('base64'),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;