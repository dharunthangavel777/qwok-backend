import dotenv from 'dotenv';
dotenv.config();

console.log('[Startup] Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    HAS_FIREBASE: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    HAS_GEMINI: !!process.env.GEMINI_API_KEY,
    REDIS_HOST: process.env.REDIS_HOST,
    HAS_REDIS_URL: !!(process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL),
});

import express from 'express';
import cors from 'cors';
import http from 'http';
import * as admin from 'firebase-admin';
import paymentRoutes from './routes/paymentRoutes';
import adminRoutes from './routes/adminRoutes';
import userRoutes from './routes/userRoutes';
import projectRoutes from './routes/projectRoutes';
import ratingRoutes from './routes/ratingRoutes';
import contractRoutes from './routes/contractRoutes';
import resumeRoutes from './routes/resumeRoutes';
import { initSocketIO } from './config/socket';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : undefined;
    admin.initializeApp({
        credential: serviceAccount
            ? admin.credential.cert(serviceAccount)
            : admin.credential.applicationDefault()
    });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Middleware to parse JSON
app.use(express.json());

// Middleware to capture raw body for webhook signature verification
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// Routes
app.use('/v3', paymentRoutes);
app.use('/admin', adminRoutes);

// Migrated Routes from legacy Node.js backend
app.use('/api', userRoutes);
app.use('/api', projectRoutes);
app.use('/api', ratingRoutes);
app.use('/api', contractRoutes);

// AI Feature Routes
app.use('/api', resumeRoutes);

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-orchestrator' }));

// Error Handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);
initSocketIO(httpServer);

// Start Server
httpServer.listen(PORT, () => {
    console.log(`Payment Orchestrator running on port ${PORT}`);
    console.log(`Socket.IO initialized for real-time resume updates`);

    // Start BullMQ Workers
    import('./workers/webhookWorker');
    import('./workers/projectionWorker');
    import('./workers/resumeWorker');
});
