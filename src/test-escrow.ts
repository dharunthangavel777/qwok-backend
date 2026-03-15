import { EscrowService, EscrowState } from './services/escrow/EscrowService';
import { InMemoryEscrowRepository } from './services/escrow/EscrowService';

async function testEscrow() {
    console.log('--- Testing Escrow Multi-Sig Logic ---');
    const repo = new InMemoryEscrowRepository();
    const service = new EscrowService(repo);

    const projectId = 'proj-123';
    await service.createEscrow(projectId, 50000, 'owner-1', 'worker-1');
    await service.transitionState(projectId, EscrowState.LOCKED); // Simulate funded & locked

    console.log('1. Worker submits work...');
    await service.submitWork(projectId, 'sub-1');
    let project = await service.getProject(projectId);
    console.log('State after submission:', project?.state, '| Released:', project?.releasedAmount);

    console.log('2. Owner approves release...');
    await service.approveRelease(projectId);
    project = await service.getProject(projectId);
    console.log('State after approval:', project?.state, '| Released:', project?.releasedAmount);

    if (project?.state === EscrowState.RELEASED && project.releasedAmount === 50000) {
        console.log('✅ Multi-sig release successful');
    } else {
        console.error('❌ Multi-sig release failed');
    }
}

testEscrow();
