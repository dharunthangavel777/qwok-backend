import * as admin from 'firebase-admin';
import { notificationService } from './NotificationService';

export class ProjectService {
    private get db() { return admin.firestore(); }

    async approveBid(userId: string, data: any) {
        const { postId, workerId, workerName, title, description, mode, bidAmount } = data;
        if (!postId || !workerId || !title) throw new Error("Missing required fields");

        const collection = mode === 'freelancer' ? 'project_posts' : 'job_posts';

        const result = await this.db.runTransaction(async (transaction) => {
            const postRef = this.db.collection(collection).doc(postId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Post not found");
            if (postDoc.data()?.ownerId !== userId) throw new Error("Only the owner can approve bids");
            if (postDoc.data()?.status === 'filled') throw new Error("Post already filled");

            transaction.update(postRef, {
                [`applicants.${workerId}.status`]: 'approved',
                'status': 'filled'
            });

            const workerAppRef = this.db.collection("users").doc(workerId).collection("applications").doc(postId);
            transaction.update(workerAppRef, { 'status': 'approved' });

            const projectRef = this.db.collection("projects").doc();
            transaction.set(projectRef, {
                id: projectRef.id,
                postId, ownerId: userId, workerId, workerName: workerName || 'Worker',
                title, description, mode: mode || 'job',
                budget: bidAmount || 0,
                escrowBalance: 0, status: 'ongoing', progress: 0.0,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return projectRef.id;
        });

        await notificationService.sendNotification(
            workerId,
            "Application Accepted! 🎉",
            `Your application for '${title}' has been accepted. View the project to start setup.`,
            { postId: postId, projectId: result },
            "bid_approved"
        );

        return { success: true, projectId: result };
    }

    async applyForJob(userId: string, data: any) {
        const { jobId, applicationData, mode } = data;
        if (!jobId || !applicationData) throw new Error("Missing required fields");

        const collection = mode === 'freelancer' ? 'project_posts' : 'job_posts';

        await this.db.runTransaction(async (transaction) => {
            const userRef = this.db.collection("users").doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            if ((userDoc.data()?.profileCompletion || 0) < 95) {
                throw new Error("Profile must be at least 95% complete to apply.");
            }

            const postRef = this.db.collection(collection).doc(jobId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Job not found");
            const postData = postDoc.data()!;
            if (postData.status !== 'approved') throw new Error("This job is no longer accepting applications.");

            const openings = postData.openings || 1;
            const maxApps = postData.maxApplications || openings;
            const currentApps = postData.applicationsCount || 0;

            if (currentApps >= maxApps) throw new Error("Application limit reached for this job.");

            transaction.update(postRef, {
                [`applicants.${userId}`]: {
                    ...applicationData,
                    mode,
                    status: 'pending',
                    appliedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                'applicationsCount': admin.firestore.FieldValue.increment(1),
                'status': (currentApps + 1 >= maxApps) ? 'filled' : 'approved'
            });

            const userAppRef = userRef.collection("applications").doc(jobId);
            transaction.set(userAppRef, {
                status: 'pending',
                appliedAt: admin.firestore.FieldValue.serverTimestamp(),
                mode: mode
            });
        });

        await notificationService.sendNotification(
            applicationData.ownerId || '',
            'New Application 📄',
            'Someone has applied for your job post.',
            { jobId },
            'job_application'
        );

        return { success: true };
    }

    async submitBid(userId: string, data: any) {
        const { projectId, bidData } = data;
        if (!projectId || !bidData) throw new Error("Missing required fields");

        await this.db.runTransaction(async (transaction) => {
            const userRef = this.db.collection("users").doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            if ((userDoc.data()?.profileCompletion || 0) < 95) {
                throw new Error("Profile must be at least 95% complete to place a bid.");
            }

            const postRef = this.db.collection('project_posts').doc(projectId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Project not found");
            const postData = postDoc.data()!;
            if (postData.status !== 'approved' && postData.status !== 'open') {
                throw new Error("This project is no longer accepting proposals.");
            }

            const currentApps = postData.applicationsCount || 0;
            const maxApps = postData.maxApplications || 1000;

            if (currentApps >= maxApps) throw new Error("Application limit reached for this project.");

            transaction.update(postRef, {
                [`applicants.${userId}`]: {
                    ...bidData,
                    mode: 'freelancer',
                    status: 'pending',
                    appliedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                'applicationsCount': admin.firestore.FieldValue.increment(1),
                'status': (currentApps + 1 >= maxApps) ? 'filled' : postData.status
            });

            const userAppRef = userRef.collection("applications").doc(projectId);
            transaction.set(userAppRef, {
                status: 'pending',
                appliedAt: admin.firestore.FieldValue.serverTimestamp(),
                mode: 'freelancer',
                bidAmount: bidData.bidAmount,
                suggestedMilestones: bidData.suggestedMilestones
            });
        });

        await notificationService.sendNotification(
            bidData.ownerId || '',
            'New Proposal 📝',
            'A new proposal has been submitted for your project.',
            { projectId },
            'project_bid'
        );

        return { success: true };
    }

    async completeProject(userId: string, projectId: string) {
        if (!projectId) throw new Error("Missing projectId");

        const result = await this.db.runTransaction(async (transaction) => {
            const projectRef = this.db.collection("projects").doc(projectId);
            const projectDoc = await transaction.get(projectRef);

            if (!projectDoc.exists) throw new Error("Project not found");
            const projectData = projectDoc.data()!;

            if (projectData.ownerId !== userId) throw new Error("Only the owner can complete the project");
            if (projectData.status === 'completed') throw new Error("Project already completed");

            transaction.update(projectRef, {
                status: 'completed',
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const workerId = projectData.workerId;
            const workerRef = this.db.collection("users").doc(workerId);

            transaction.update(workerRef, {
                completedProjects: admin.firestore.FieldValue.increment(1),
                [`portfolio.${projectId}`]: {
                    id: projectId,
                    title: projectData.title,
                    description: projectData.description,
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    isVerified: true,
                    type: 'project'
                }
            });

            return workerId;
        });

        await notificationService.sendNotification(
            result,
            "Project Completed! 🏆",
            `The owner has marked the project as completed. A verified entry has been added to your portfolio!`,
            { projectId },
            "project_completed"
        );

        return { success: true, message: "Project completed and portfolio updated" };
    }

    async updateApplicationStatus(userId: string, data: any) {
        const { jobId, targetUserId, status, mode } = data;
        if (!jobId || !targetUserId || !status) throw new Error("Missing required fields");

        const collection = mode === 'freelancer' ? 'project_posts' : 'job_posts';

        await this.db.runTransaction(async (transaction) => {
            const postRef = this.db.collection(collection).doc(jobId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Post not found");
            if (postDoc.data()?.ownerId !== userId) throw new Error("Only the owner can update status");

            transaction.update(postRef, {
                [`applicants.${targetUserId}.status`]: status
            });

            const workerAppRef = this.db.collection("users").doc(targetUserId).collection("applications").doc(jobId);
            transaction.update(workerAppRef, { 'status': status });
        });

        await notificationService.sendNotification(
            targetUserId,
            'Application Update',
            `Your application status has been updated to ${status}.`,
            { jobId: jobId },
            'application_status'
        );

        return { success: true };
    }

    async submitMilestone(userId: string, data: any) {
        const { projectId, milestoneId, note, links } = data;
        if (!projectId || !milestoneId) throw new Error("Missing required fields");

        const milestoneRef = this.db.collection("projects").doc(projectId).collection("milestones").doc(milestoneId);

        await this.db.runTransaction(async (transaction) => {
            const milestoneDoc = await transaction.get(milestoneRef);
            if (!milestoneDoc.exists) throw new Error("Milestone not found");

            const projectRef = this.db.collection("projects").doc(projectId);
            const projectDoc = await transaction.get(projectRef);
            if (!projectDoc.exists) throw new Error("Project not found");
            if (projectDoc.data()?.workerId !== userId) throw new Error("Only the assigned worker can submit milestones");

            transaction.update(milestoneRef, {
                status: 'submitted',
                submissionNote: note || '',
                attachments: links || [],
                submittedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        const projectDoc = await this.db.collection("projects").doc(projectId).get();
        const ownerId = projectDoc.data()?.ownerId;

        await notificationService.sendNotification(
            ownerId,
            'Milestone Submitted',
            'A milestone has been submitted for your review.',
            { projectId, milestoneId },
            'milestone_submitted'
        );

        return { success: true };
    }

    async rejectMilestone(userId: string, data: any) {
        const { projectId, milestoneId, reason } = data;
        if (!projectId || !milestoneId) throw new Error("Missing required fields");

        const milestoneRef = this.db.collection("projects").doc(projectId).collection("milestones").doc(milestoneId);

        await this.db.runTransaction(async (transaction) => {
            const milestoneDoc = await transaction.get(milestoneRef);
            if (!milestoneDoc.exists) throw new Error("Milestone not found");

            const projectRef = this.db.collection("projects").doc(projectId);
            const projectDoc = await transaction.get(projectRef);
            if (!projectDoc.exists) throw new Error("Project not found");
            if (projectDoc.data()?.ownerId !== userId) throw new Error("Only the owner can reject milestones");

            transaction.update(milestoneRef, {
                status: 'revisionRequested',
                revisionNote: reason || 'Refactor required'
            });
        });

        const projectDoc = await this.db.collection("projects").doc(projectId).get();
        const workerId = projectDoc.data()?.workerId;

        await notificationService.sendNotification(
            workerId,
            'Milestone Rejected',
            `A milestone requires revisions. Reason: ${reason}`,
            { projectId, milestoneId },
            'milestone_rejected'
        );

        return { success: true };
    }

    async agreeToMilestone(userId: string, data: any) {
        const { projectId, milestoneId, agreed } = data;
        if (!projectId || !milestoneId) throw new Error("Missing required fields");

        const milestoneRef = this.db.collection("projects").doc(projectId).collection("milestones").doc(milestoneId);

        await this.db.runTransaction(async (transaction) => {
            const projectRef = this.db.collection("projects").doc(projectId);
            const projectDoc = await transaction.get(projectRef);
            if (!projectDoc.exists) throw new Error("Project not found");
            if (projectDoc.data()?.workerId !== userId) throw new Error("Only the worker can agree to milestones");

            transaction.update(milestoneRef, {
                workerAgreed: agreed,
                workerAgreedAt: agreed ? admin.firestore.FieldValue.serverTimestamp() : null
            });
        });

        return { success: true };
    }
}

export const projectService = new ProjectService();
