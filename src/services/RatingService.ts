import * as admin from 'firebase-admin';
import { notificationService } from './NotificationService';

export class RatingService {
    private get db() { return admin.firestore(); }

    async submitRating(senderId: string, data: any) {
        const { targetUserId, projectId, rating, review } = data;

        if (!targetUserId || !rating) throw new Error("Target user and rating required");

        await this.db.runTransaction(async (transaction) => {
            const targetRef = this.db.collection("users").doc(targetUserId);
            const targetDoc = await transaction.get(targetRef);

            if (!targetDoc.exists) throw new Error("Target user not found");

            const ratingRef = this.db.collection("ratings").doc();
            transaction.set(ratingRef, {
                id: ratingRef.id,
                projectId: projectId || null,
                senderId,
                targetUserId,
                rating: parseFloat(rating),
                review: review || "",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const userData = targetDoc.data()!;
            const currentTotalRating = userData.totalRatingPoints || 0;
            const currentRatingCount = userData.ratingCount || 0;
            const newTotalRatingPoints = currentTotalRating + parseFloat(rating);
            const newRatingCount = currentRatingCount + 1;
            const newAverageRating = newTotalRatingPoints / newRatingCount;

            transaction.update(targetRef, {
                totalRatingPoints: newTotalRatingPoints,
                ratingCount: newRatingCount,
                averageRating: newAverageRating
            });
        });

        await notificationService.sendNotification(
            targetUserId,
            "You’ve got a new rating! ⭐",
            `Congratulations! Someone has shared their feedback on your recent work. Check it out now.`,
            {},
            "new_rating"
        );

        return { success: true, message: "Rating submitted and aggregated" };
    }
}

export const ratingService = new RatingService();
