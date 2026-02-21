import { Router } from 'express';
import { userService } from '../services';
import { verifyAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/initializeUser', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await userService.initializeUser(req.uid!);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/requestWithdrawal', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const { amount } = req.body;
        const result = await userService.requestWithdrawal(req.uid!, amount);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.get('/checkEligibility', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await userService.checkEligibility(req.uid!);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
