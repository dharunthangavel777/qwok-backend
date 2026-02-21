import { InMemoryLedgerRepository } from './ledger/LedgerRepository';
import { LedgerService } from './ledger/LedgerService';
import { InMemoryEscrowRepository } from './escrow/EscrowService';
import { EscrowService } from './escrow/EscrowService';
import { PaymentOrchestrator } from './payment/PaymentOrchestrator';
import { PayoutService } from './payout/PayoutService';
import { AdminService } from './admin/AdminService';
import { notificationService } from './NotificationService';
import { userService } from './UserService';
import { projectService } from './ProjectService';
import { ratingService } from './RatingService';
import { contractService } from './ContractService';

// Initialize Repositories (Singletons for In-Memory Mock)
export const ledgerRepo = new InMemoryLedgerRepository();
export const escrowRepo = new InMemoryEscrowRepository();

// Initialize Services
export const ledgerService = new LedgerService(ledgerRepo);
export const escrowService = new EscrowService(escrowRepo);
export const paymentOrchestrator = new PaymentOrchestrator(ledgerService, escrowService);
export const payoutService = new PayoutService(ledgerService);
export const adminService = new AdminService(ledgerService);

export { notificationService, userService, projectService, ratingService, contractService };
