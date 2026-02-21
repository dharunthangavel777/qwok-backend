import { Router } from 'express';
import { ledgerService, paymentOrchestrator, adminService } from '../services';

const router = Router();
// ledgerService is now imported from central provider (src/services/index.ts)

// Middleware to check admin secret
const adminAuth = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-admin-key'];
    if (apiKey !== process.env.ADMIN_API_KEY && apiKey !== 'secret_admin_123') { // Fallback for dev
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
};

router.use(adminAuth);

// Get Ledger Balance
router.get('/ledger/balance/:accountId', async (req, res, next) => {
    try {
        const { accountId } = req.params;
        const balance = await ledgerService.getBalance(accountId);
        res.json({ accountId, balance });
    } catch (e) {
        next(e);
    }
});

// Get All Ledger Transactions
router.get('/ledger/transactions', async (req, res, next) => {
    try {
        const transactions = await ledgerService.getAllTransactions();
        res.json(transactions);
    } catch (e) {
        next(e);
    }
});
// Resolve Dispute
router.post('/disputes/resolve', async (req, res, next) => {
    try {
        const { projectId, terminalAction, workerId } = req.body;
        if (!projectId || !terminalAction || !workerId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await paymentOrchestrator.resolveDispute(projectId, terminalAction, workerId);
        return res.json({ success: true, message: `Dispute resolved with ${terminalAction}` });
    } catch (e) {
        return next(e);
    }
});

// System Health
router.get('/health', async (req, res, next) => {
    try {
        const health = await adminService.getSystemHealth();
        res.json(health);
    } catch (e) {
        next(e);
    }
});

export default router;
