import { Router } from 'express';
import { ratingService } from '../services';
import { verifyAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/submitRating', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await ratingService.submitRating(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

export default router;
