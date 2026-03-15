import { Router } from 'express';
import { ledgerService, adminService, policyEngine, fraudIntelligence, kycService, marketplaceAnalytics, growthEngine, revenueOptimization, supportTicketService, globalMessagingService, releaseManagementService, auditService, paymentOrchestrator, abTestingService, developerService, socService } from '../services';

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

// Governance & Policies
router.get('/policies', async (req, res, next) => {
    try {
        const policies = await policyEngine.getPolicies();
        res.json(policies);
    } catch (e) {
        next(e);
    }
});

router.post('/policies', async (req, res, next) => {
    try {
        const id = await policyEngine.createPolicy(req.body);
        res.json({ id, message: 'Policy created' });
    } catch (e) {
        next(e);
    }
});

// Fraud & Risk
router.get('/fraud/high-risk', async (req, res, next) => {
    try {
        const users = await fraudIntelligence.getHighRiskUsers();
        res.json(users);
    } catch (e) {
        next(e);
    }
});

// KYC Verifications
router.get('/kyc/pending', async (req, res, next) => {
    try {
        const verifications = await kycService.getPendingVerifications();
        res.json(verifications);
    } catch (e) {
        next(e);
    }
});

router.post('/kyc/review', async (req, res, next) => {
    try {
        const { userId, status, notes } = req.body;
        const reviewerId = 'admin_system'; // Placeholder
        await kycService.reviewKYC(userId, status, reviewerId, notes);
        res.json({ success: true, message: `KYC submission ${status}` });
    } catch (e) {
        next(e);
    }
});

// --- Phase 2: Marketplace Intelligence ---

// Analytics
router.get('/marketplace/stats', async (req, res, next) => {
    try {
        const stats = await marketplaceAnalytics.getGlobalStats();
        res.json(stats);
    } catch (e) {
        next(e);
    }
});

router.get('/marketplace/geo', async (req, res, next) => {
    try {
        const geo = await marketplaceAnalytics.getGeographicalData();
        res.json(geo);
    } catch (e) {
        next(e);
    }
});

// Growth Engine
router.get('/growth/promotions', async (req, res, next) => {
    try {
        const promotions = await growthEngine.getActivePromotions();
        res.json(promotions);
    } catch (e) {
        next(e);
    }
});

router.post('/growth/promote', async (req, res, next) => {
    try {
        const { jobId, durationDays } = req.body;
        await growthEngine.promoteJob(jobId, durationDays);
        res.json({ success: true, message: 'Entity promoted successfully' });
    } catch (e) {
        next(e);
    }
});

router.get('/growth/stats', async (req, res, next) => {
    try {
        const stats = await growthEngine.getCampaignStats();
        res.json(stats);
    } catch (e) {
        next(e);
    }
});

// Revenue Optimization
router.get('/revenue/metrics', async (req, res, next) => {
    try {
        const metrics = await revenueOptimization.getRevenueMetrics();
        res.json(metrics);
    } catch (e) {
        next(e);
    }
});

router.get('/revenue/forecast', async (req, res, next) => {
    try {
        const forecast = await revenueOptimization.getRevenueForecast();
        res.json(forecast);
    } catch (e) {
        next(e);
    }
});

// --- Phase 3: Operational Control ---

// Support Tickets
router.get('/support/tickets', async (req, res, next) => {
    try {
        const tickets = await supportTicketService.getTickets(req.query.status as string);
        res.json(tickets);
    } catch (e) {
        next(e);
    }
});

router.post('/support/tickets/:id/assign', async (req, res, next) => {
    try {
        await supportTicketService.assignTicket(req.params.id, req.body.adminId);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

router.post('/support/tickets/:id/status', async (req, res, next) => {
    try {
        await supportTicketService.updateStatus(req.params.id, req.body.status);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

router.post('/support/tickets/:id/message', async (req, res, next) => {
    try {
        await supportTicketService.addComment(req.params.id, 'admin_system', req.body.text);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

// Messaging
router.post('/messaging/broadcast', async (req, res, next) => {
    try {
        const { title, body, target } = req.body;
        const result = await globalMessagingService.broadcastMessage(title, body, target);
        res.json({ success: true, result });
    } catch (e) {
        next(e);
    }
});

router.get('/messaging/history', async (req, res, next) => {
    try {
        const history = await globalMessagingService.getBroadcastLogs();
        res.json(history);
    } catch (e) {
        next(e);
    }
});

// Ops / Release
router.get('/ops/release-config', async (req, res, next) => {
    try {
        const config = await releaseManagementService.getReleaseConfig();
        res.json(config);
    } catch (e) {
        next(e);
    }
});

router.post('/ops/release-config/feature-flag', async (req, res, next) => {
    try {
        const { flag, enabled } = req.body;
        await releaseManagementService.updateFeatureFlag(flag, enabled);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

router.post('/ops/release-config/min-version', async (req, res, next) => {
    try {
        await releaseManagementService.setMinVersion(req.body.version);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

// --- Phase 4: Financial Governance ---

router.get('/finance/ledger/detailed', async (req, res, next) => {
    try {
        const { accountId, limit } = req.query;
        const transactions = await ledgerService.getDetailedTransactions({
            accountId: accountId as string,
            limit: limit ? parseInt(limit as string, 10) : 50
        });
        res.json(transactions);
    } catch (e) {
        next(e);
    }
});

router.post('/finance/audit/run', async (req, res, next) => {
    try {
        const result = await auditService.runFullAudit();
        res.json(result);
    } catch (e) {
        next(e);
    }
});

// Phase 5: Advanced AI & Ecosystem

// A/B Testing
router.get('/ops/ab-testing', async (req, res, next) => {
    try {
        const experiments = await abTestingService.listExperiments();
        res.json(experiments);
    } catch (e) {
        next(e);
    }
});

router.post('/ops/ab-testing', async (req, res, next) => {
    try {
        const id = await abTestingService.createExperiment(req.body);
        res.json({ id });
    } catch (e) {
        next(e);
    }
});

router.patch('/ops/ab-testing/:id', async (req, res, next) => {
    try {
        await abTestingService.updateExperiment(req.params.id, req.body);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

// Developer API Console
router.get('/ops/developer/keys', async (req, res, next) => {
    try {
        const keys = await developerService.listKeys();
        res.json(keys);
    } catch (e) {
        next(e);
    }
});

router.post('/ops/developer/keys', async (req, res, next) => {
    try {
        const { ownerId, name, permissions } = req.body;
        const key = await developerService.generateKey(ownerId, name, permissions);
        res.json(key);
    } catch (e) {
        next(e);
    }
});

router.delete('/ops/developer/keys/:id', async (req, res, next) => {
    try {
        await developerService.revokeKey(req.params.id);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

// SOC (Security Operations Center)
router.get('/compliance/soc/events', async (req, res, next) => {
    try {
        const events = await socService.getRecentEvents();
        res.json(events);
    } catch (e) {
        next(e);
    }
});

router.get('/compliance/soc/summary', async (req, res, next) => {
    try {
        const summary = await socService.getThreatSummary();
        res.json(summary);
    } catch (e) {
        next(e);
    }
});

router.patch('/compliance/soc/events/:id/resolve', async (req, res, next) => {
    try {
        await socService.resolveEvent(req.params.id);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

export default router;
