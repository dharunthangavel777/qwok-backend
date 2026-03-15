import { IEscrowRepository, EscrowProject, EscrowState } from './EscrowService';
import pool from '../../config/database';

export class PostgreSqlEscrowRepository implements IEscrowRepository {
    async getProject(projectId: string): Promise<EscrowProject | null> {
        const sql = 'SELECT * FROM escrows WHERE project_id = $1';
        const res = await pool.query(sql, [projectId]);
        if (res.rows.length === 0) return null;

        const row = res.rows[0];
        return {
            projectId: row.project_id,
            ownerId: row.owner_id,
            workerId: row.worker_id,
            totalAmount: parseInt(row.total_amount, 10),
            releasedAmount: parseInt(row.released_amount, 10),
            state: row.state as EscrowState,
            submissionId: row.submission_id,
            ownerApproved: row.owner_approved,
            workerSubmitted: row.worker_submitted,
            updatedAt: row.updated_at
        };
    }

    async saveProject(project: EscrowProject): Promise<void> {
        const sql = `
            INSERT INTO escrows (project_id, owner_id, worker_id, total_amount, released_amount, state, submission_id, owner_approved, worker_submitted, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (project_id) DO UPDATE SET
                state = EXCLUDED.state,
                released_amount = EXCLUDED.released_amount,
                submission_id = EXCLUDED.submission_id,
                owner_approved = EXCLUDED.owner_approved,
                worker_submitted = EXCLUDED.worker_submitted,
                updated_at = EXCLUDED.updated_at
        `;
        await pool.query(sql, [
            project.projectId,
            project.ownerId,
            project.workerId,
            project.totalAmount, // In Paise
            project.releasedAmount,
            project.state,
            project.submissionId,
            project.ownerApproved || false,
            project.workerSubmitted || false,
            project.updatedAt
        ]);
    }

    async updateState(projectId: string, newState: EscrowState): Promise<void> {
        const sql = 'UPDATE escrows SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE project_id = $2';
        await pool.query(sql, [newState, projectId]);
    }
}
