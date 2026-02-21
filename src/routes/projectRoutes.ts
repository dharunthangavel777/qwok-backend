import { Router } from 'express';
import { projectService } from '../services';
import { verifyAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/approveBid', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.approveBid(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/applyForJob', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.applyForJob(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/submitBid', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.submitBid(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/completeProject', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const { projectId } = req.body;
        const result = await projectService.completeProject(req.uid!, projectId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/updateApplicationStatus', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.updateApplicationStatus(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/submitMilestone', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.submitMilestone(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/rejectMilestone', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.rejectMilestone(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/agreeToMilestone', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const result = await projectService.agreeToMilestone(req.uid!, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

export default router;
