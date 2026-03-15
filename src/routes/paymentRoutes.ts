import { Router } from 'express';
import { handleCashfreeWebhook } from '../controllers/webhookController';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { verifyCashfreeSignature } from '../middleware/cashfree';
import { ledgerService, escrowService, paymentOrchestrator, payoutService } from '../services';

const router = Router();

// Services are now imported from central provider (src/services/index.ts)

// Webhook Route (Public, verified by signature)
router.post(
    '/webhook/cashfree',
    verifyCashfreeSignature,
    handleCashfreeWebhook
);

// Payment Routes (Protected + Idempotent)
router.post(
    '/payment/orders',
    idempotencyMiddleware,
    async (req, res, next) => {
        try {
            const { projectId, amount, userId } = req.body;
            const result = await paymentOrchestrator.createPaymentOrder(projectId, amount, userId);
            res.json(result);
        } catch (e) {
            next(e);
        }
    }
);

router.post(
    '/escrow/release',
    idempotencyMiddleware,
    async (req, res, next) => {
        try {
            const { projectId, amount, workerId } = req.body;
            await paymentOrchestrator.releaseFunds(projectId, amount, workerId);
            res.json({ status: 'RELEASED', projectId });
        } catch (e) {
            next(e);
        }
    }
);

router.post(
    '/payouts/withdraw',
    idempotencyMiddleware,
    async (req, res, next) => {
        try {
            const { userId, amount, beneficiaryId, paymentMethod, details } = req.body;
            const result = await payoutService.initiateWithdrawal(userId, amount, beneficiaryId, paymentMethod, details);
            res.json(result);
        } catch (e) {
            next(e);
        }
    }
);



router.post(
    '/payouts/beneficiaries',
    idempotencyMiddleware,
    async (req, res, next) => {
        try {
            const { userId, ...details } = req.body;
            const result = await payoutService.addBeneficiary(userId, details);
            res.json(result);
        } catch (e) {
            next(e);
        }
    }
);

export default router;
