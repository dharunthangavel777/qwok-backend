import { Router } from 'express';
import { verifyAuth, AuthRequest } from '../middleware/auth';
import { resumeQueue } from '../queues';

const router = Router();

/**
 * POST /api/resume/parse
 * Body: { resumeText: string }
 * Auth: Bearer token (Firebase UID used as userId)
 */
router.post('/resume/parse', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const { resumeText } = req.body;
        const userId = req.uid!;

        if (!resumeText || typeof resumeText !== 'string') {
            res.status(400).json({ success: false, message: 'resumeText is required and must be a string.' });
            return;
        }

        if (resumeText.trim().length < 50) {
            res.status(400).json({ success: false, message: 'Resume text is too short to parse.' });
            return;
        }

        // Enqueue the job
        const job = await resumeQueue.add('parse', { userId, resumeText });

        res.json({
            success: true,
            jobId: job.id,
            status: 'processing',
            message: 'Resume submitted for parsing. Listen on socket event "resume:done" or poll /api/resume/job/:id',
        });
    } catch (error: any) {
        console.error('[ResumeRoutes] POST /resume/parse error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to enqueue resume parse job.' });
    }
});

/**
 * GET /api/resume/job/:id
 * Polling fallback — returns job state and result if complete.
 */
router.get('/resume/job/:id', verifyAuth, async (req: AuthRequest, res) => {
    try {
        const job = await resumeQueue.getJob(req.params.id);

        if (!job) {
            res.status(404).json({ success: false, message: 'Job not found.' });
            return;
        }

        const state = await job.getState();
        const result = job.returnvalue ?? null;
        const failReason = job.failedReason ?? null;

        res.json({
            success: true,
            jobId: job.id,
            state,           // 'waiting' | 'active' | 'completed' | 'failed'
            result,          // null if not complete
            failReason,      // null if not failed
        });
    } catch (error: any) {
        console.error('[ResumeRoutes] GET /resume/job/:id error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to fetch job status.' });
    }
});

export default router;
