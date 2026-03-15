import { Router } from 'express';
import { notificationService } from '../services/NotificationService';

const router = Router();

// Send Push Notification via FCM
router.post('/sendPushNotification', async (req: any, res, next) => {
    try {
        const { recipientId, title, body, data, category } = req.body;

        if (!recipientId || !title || !body) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await notificationService.sendNotification(recipientId, title, body, data, category || 'general');
        
        return res.json({ success: true });
    } catch (e) {
        return next(e);
    }
});

export default router;
