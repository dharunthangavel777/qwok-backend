import { Router } from 'express';
import { contractService } from '../services';
import { verifyAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/createContract', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await contractService.createContract(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/acceptContract', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await contractService.acceptContract(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

export default router;
