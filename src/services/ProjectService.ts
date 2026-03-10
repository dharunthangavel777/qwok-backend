import * as admin from 'firebase-admin';
import { notificationService } from './NotificationService';
import { contractService } from './ContractService';

export class ProjectService {
    private get db() { return admin.firestore(); }

    async approveBid(userId: string, data: any) {
        const { postId, workerId, workerName, title, description, mode, bidAmount } = data;
        if (!postId || !workerId || !title) throw new Error("Missing required fields");

        const collection = this._getCollection(mode);

        const result = await this.db.runTransaction(async (transaction) => {
            const postRef = this.db.collection(collection).doc(postId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Post not found");
            if (postDoc.data()?.ownerId !== userId) throw new Error("Only the owner can approve bids");
            if (postDoc.data()?.status === 'filled') throw new Error("Post already filled");

            const postData = postDoc.data() || {};
            transaction.update(postRef, {
                [`applicants.${workerId}.status`]: 'approved',
                'status': 'filled'
            });

            const workerAppRef = this.db.collection("users").doc(workerId).collection("applications").doc(postId);
            transaction.update(workerAppRef, { 'status': 'approved' });

            const projectRef = this.db.collection("projects").doc();
            const contractId = this.db.collection("contracts").doc().id;

            transaction.set(projectRef, {
                ...postData,
                id: projectRef.id,
                jobId: postId,
                workerId: workerId,
                ownerId: postData.ownerId,
                status: 'setup',
                budget: parseFloat(bidAmount || 0),
                requiredDeposit: parseFloat(bidAmount || 0),
                depositPaid: false,
                contractId: contractId,
                milestoneIds: [],
                escrowBalance: 0,
                progress: 0.0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                applicants: admin.firestore.FieldValue.delete(),
                applicationsCount: admin.firestore.FieldValue.delete(),
                maxApplications: admin.firestore.FieldValue.delete(),
            });

            // Automatically create initial contract
            transaction.set(this.db.collection("contracts").doc(contractId), {
                id: contractId,
                projectId: projectRef.id,
                agreedBudget: parseFloat(bidAmount || 0),
                platformFee: parseFloat(bidAmount || 0) * 0.10, // Default 10%
                commissionRate: 0.10,
                paymentType: 'Fixed',
                startDate: admin.firestore.FieldValue.serverTimestamp(),
                ownerAccepted: true, // Owner accepted by approving the bid
                workerAccepted: false,
                status: 'pending_worker_signature',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { projectId: projectRef.id, contractId };
        });

        await notificationService.sendNotification(
            workerId,
            "Application Accepted! 🎉",
            `Your application for '${title}' has been accepted. View the project to start setup.`,
            { postId: postId, projectId: result.projectId, contractId: result.contractId },
            "bid_approved"
        );

        return { success: true, ...result };
    }

    async processDeposit(projectId: string, amount: number) {
        const projectRef = this.db.collection("projects").doc(projectId);
        await projectRef.update({
            depositPaid: true,
            escrowBalance: admin.firestore.FieldValue.increment(amount)
        });

        // Also update the original post if needed, or just the project record
        return { success: true, depositPaid: true };
    }

    private _getCollection(mode: string) {
        return mode === 'freelancer' ? 'project_posts' : 'job_posts';
    }

    async applyForJob(userId: string, data: any) {
        const { jobId, applicationData, mode } = data;
        if (!jobId || !applicationData) throw new Error("Missing required fields");

        const collection = this._getCollection(mode);

        await this.db.runTransaction(async (transaction) => {
            const userRef = this.db.collection("users").doc(userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            const postRef = this.db.collection(collection).doc(jobId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Job not found");
            const postData = postDoc.data()!;

            // Validate status
            if (postData.status !== 'approved' && postData.status !== 'open') {
                throw new Error("This post is no longer accepting applications.");
            }

            // Budget Validation for Projects
            if (mode === 'freelancer' && applicationData.bidAmount) {
                const bid = Number(applicationData.bidAmount);
                const min = postData.budgetMin || 0;
                const max = postData.budgetMax || Infinity;

                if (bid < min || bid > max) {
                    throw new Error(`Bid amount ₹${bid} is outside the allowed range (₹${min} - ₹${max})`);
                }
            }

            // Deadline Validation
            if (postData.deadlineDate) {
                const deadline = new Date(postData.deadlineDate);
                // Set deadline to end of day if it's just a date
                deadline.setHours(23, 59, 59, 999);
                if (deadline < new Date()) {
                    throw new Error("The application deadline for this post has passed.");
                }
            }

            const currentApps = postData.applicationsCount || 0;
            const maxApps = postData.maxApplications || 1;

            if (currentApps >= maxApps) throw new Error("Application limit reached.");

            transaction.update(postRef, {
                [`applicants.${userId}`]: {
                    ...applicationData,
                    applicantName: applicationData.workerName || applicationData.applicantName || "Anonymous",
                    applicantRole: applicationData.applicantRole || "Professional",
                    mode,
                    status: 'Pending',
                    appliedAt: admin.firestore.FieldValue.serverTimestamp()
                },
                'applicationsCount': admin.firestore.FieldValue.increment(1),
                'status': (currentApps + 1 >= maxApps) ? 'filled' : postData.status
            });

            const userAppRef = userRef.collection("applications").doc(jobId);
            transaction.set(userAppRef, {
                status: 'Pending',
                appliedAt: admin.firestore.FieldValue.serverTimestamp(),
                mode: mode,
                ...applicationData // Include bid details if present
            });
        });

        await notificationService.sendNotification(
            applicationData.ownerId || '',
            'New Application 📄',
            'Someone has applied for your post.',
            { jobId },
            'job_application'
        );

        return { success: true };
    }

    async submitBid(userId: string, data: any) {
        // Reuse applyForJob but with specific bid data mapping
        const { projectId, bidData } = data;
        return this.applyForJob(userId, {
            jobId: projectId,
            applicationData: bidData,
            mode: 'freelancer'
        });
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
        const { jobId, targetUserId, status, mode, rejectionDescription, shortlistGreeting } = data;
        if (!jobId || !targetUserId || !status) throw new Error("Missing required fields");

        const collection = this._getCollection(mode);

        await this.db.runTransaction(async (transaction) => {
            const postRef = this.db.collection(collection).doc(jobId);
            const postDoc = await transaction.get(postRef);

            if (!postDoc.exists) throw new Error("Post not found");
            if (postDoc.data()?.ownerId !== userId) throw new Error("Only the owner can update status");

            const updateData: any = {
                [`applicants.${targetUserId}.status`]: status
            };

            const workerAppUpdate: any = { status };

            if (rejectionDescription) {
                updateData[`applicants.${targetUserId}.rejectionDescription`] = rejectionDescription;
                workerAppUpdate.rejectionDescription = rejectionDescription;
            }

            if (shortlistGreeting) {
                updateData[`applicants.${targetUserId}.shortlistGreeting`] = shortlistGreeting;
                workerAppUpdate.shortlistGreeting = shortlistGreeting;
            }

            transaction.update(postRef, updateData);

            const workerAppRef = this.db.collection("users").doc(targetUserId).collection("applications").doc(jobId);
            transaction.update(workerAppRef, workerAppUpdate);
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
