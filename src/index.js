import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { authMiddleware } from './middleware/auth.js';
import { initScheduler } from './services/scheduler.js';

import webhooksRouter from './routes/webhooks.js';
import clientsRouter from './routes/clients.js';
import leadsRouter from './routes/leads.js';
import dashboardRouter from './routes/dashboard.js';

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// ============================================================================
// Middleware
// ============================================================================

// CORS - allow all origins in development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth middleware (skipped for webhook routes)
app.use(authMiddleware);

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// ============================================================================
// Routes
// ============================================================================

app.use('/webhook', webhooksRouter);
app.use('/clients', clientsRouter);
app.use('/leads', leadsRouter);
app.use('/dashboard', dashboardRouter);

// ============================================================================
// 404 Handler
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ============================================================================
// Global Error Handler
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err.message || err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Vanguard Growth Backend Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  // Initialize the follow-up scheduler
  initScheduler();
});

export default app;