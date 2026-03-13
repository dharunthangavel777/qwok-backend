export enum EscrowState {
    CREATED = 'CREATED',
    PAYMENT_PENDING = 'PAYMENT_PENDING',
    FUNDED = 'FUNDED',
    LOCKED = 'LOCKED',
    PARTIALLY_RELEASED = 'PARTIALLY_RELEASED',
    RELEASED = 'RELEASED',
    REFUNDED = 'REFUNDED',
    DISPUTED = 'DISPUTED'
}

export interface EscrowProject {
    projectId: string;
    state: EscrowState;
    totalAmount: number;
    releasedAmount: number;
    updatedAt: Date;
    ownerId: string;
    workerId: string;
}

export interface IEscrowRepository {
    getProject(projectId: string): Promise<EscrowProject | null>;
    saveProject(project: EscrowProject): Promise<void>;
    updateState(projectId: string, newState: EscrowState): Promise<void>;
}

export class InMemoryEscrowRepository implements IEscrowRepository {
    private projects = new Map<string, EscrowProject>();

    async getProject(projectId: string): Promise<EscrowProject | null> {
        return this.projects.get(projectId) || null;
    }
    async saveProject(project: EscrowProject): Promise<void> {
        this.projects.set(project.projectId, project);
    }
    async updateState(projectId: string, newState: EscrowState): Promise<void> {
        const project = this.projects.get(projectId);
        if (project) {
            project.state = newState;
            project.updatedAt = new Date();
            this.projects.set(projectId, project);
        }
    }
}

export class EscrowService {
    constructor(private repo: IEscrowRepository) { }

    async getProject(projectId: string) {
        return this.repo.getProject(projectId);
    }

    async createEscrow(projectId: string, totalAmount: number, ownerId: string, workerId: string) {
        const existing = await this.repo.getProject(projectId);
        if (existing) {
            throw new Error('Escrow already exists for this project');
        }

        const project: EscrowProject = {
            projectId,
            state: EscrowState.CREATED,
            totalAmount,
            releasedAmount: 0,
            updatedAt: new Date(),
            ownerId,
            workerId
        };
        await this.repo.saveProject(project);
        return project;
    }

    async transitionState(projectId: string, newState: EscrowState) {
        const project = await this.repo.getProject(projectId);
        if (!project) throw new Error('Project Escrow not found');

        const currentState = project.state;
        if (currentState === EscrowState.RELEASED || currentState === EscrowState.REFUNDED) {
            throw new Error(`Cannot transition from terminal state ${currentState}`);
        }

        await this.repo.updateState(projectId, newState);
    }

    async recordRelease(projectId: string, amount: number) {
        const project = await this.repo.getProject(projectId);
        if (!project) throw new Error('Project not found');

        if (project.state !== EscrowState.LOCKED && project.state !== EscrowState.PARTIALLY_RELEASED) {
            throw new Error('Escrow must be LOCKED to release funds');
        }

        if (project.releasedAmount + amount > project.totalAmount) {
            throw new Error('Balance Check Failed');
        }

        project.releasedAmount += amount;
        project.state = project.releasedAmount >= project.totalAmount ? EscrowState.RELEASED : EscrowState.PARTIALLY_RELEASED;
        await this.repo.saveProject(project);
    }

    async raiseDispute(projectId: string) {
        const project = await this.repo.getProject(projectId);
        if (!project) throw new Error('Project not found');
        project.state = EscrowState.DISPUTED;
        await this.repo.saveProject(project);
    }

    async resolveDispute(projectId: string, terminalState: EscrowState.RELEASED | EscrowState.REFUNDED) {
        const project = await this.repo.getProject(projectId);
        if (!project) throw new Error('Project not found');
        project.state = terminalState;
        project.updatedAt = new Date();
        await this.repo.saveProject(project);
    }
}
