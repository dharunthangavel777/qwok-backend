import { PostgreSqlLedgerRepository } from './ledger/PostgreSqlLedgerRepository';
import { LedgerService } from './ledger/LedgerService';
import { PostgreSqlEscrowRepository } from './escrow/PostgreSqlEscrowRepository';
import { EscrowService } from './escrow/EscrowService';
import { PaymentOrchestrator } from './payment/PaymentOrchestrator';
import { PayoutService } from './payout/PayoutService';
import { AdminService } from './admin/AdminService';
import { notificationService } from './NotificationService';
import { userService } from './UserService';
import { projectService } from './ProjectService';
import { ratingService } from './RatingService';
import { contractService } from './ContractService';
import { policyEngine } from './governance/PolicyEngineService';
import { fraudIntelligence } from './fraud/FraudIntelligenceService';
import { kycService } from './compliance/KYCService';
import { marketplaceAnalytics } from './marketplace/MarketplaceAnalyticsService';
import { growthEngine } from './growth/GrowthEngineService';
import { revenueOptimization } from './finance/RevenueOptimizationService';
import { supportTicketService } from './support/SupportTicketService';
import { globalMessagingService } from './messaging/GlobalMessagingService';
import { releaseManagementService } from './ops/ReleaseManagementService';
import { AuditService } from './finance/AuditService';
import { ABTestingService } from './ops/ABTestingService';
import { DeveloperService } from './ops/DeveloperService';
import { SOCService } from './compliance/SOCService';
// admin import removed to avoid circular dependency

// Initialize Repositories (Persistent PostgreSQL)
export const ledgerRepo = new PostgreSqlLedgerRepository();
export const escrowRepo = new PostgreSqlEscrowRepository();

// Initialize Services
export const ledgerService = new LedgerService(ledgerRepo);
export const escrowService = new EscrowService(escrowRepo);
export const paymentOrchestrator = new PaymentOrchestrator(ledgerService, escrowService);
export const payoutService = new PayoutService(ledgerService);
export const adminService = new AdminService(ledgerService);
export const auditService = new AuditService(ledgerService);
export const abTestingService = new ABTestingService();
export const developerService = new DeveloperService();
export const socService = new SOCService();

export { 
    notificationService, 
    userService, 
    projectService, 
    ratingService, 
    contractService,
    policyEngine,
    fraudIntelligence,
    kycService,
    marketplaceAnalytics,
    growthEngine,
    revenueOptimization,
    supportTicketService,
    globalMessagingService,
    releaseManagementService,
};
