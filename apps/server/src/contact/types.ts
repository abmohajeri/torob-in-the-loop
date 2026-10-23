import type { CreateInquiriesRequest, CrowdReport, Inquiry, SellerReplyRequest } from '@titl/shared';
import type { ReportsProvider, VerificationProvider } from '../services/types.js';

/**
 * Contact & follow-up module: inquiries (AI calls / seller inbox), scheduler, crowd reports.
 * Implemented in apps/server/src/contact/*.
 */
export interface ContactModule {
  createInquiries(req: CreateInquiriesRequest): Inquiry[];
  listInquiries(sessionId: string): Inquiry[];
  getInquiry(id: string): Inquiry | null;
  retry(id: string): Inquiry | null;
  cancel(id: string): Inquiry | null;

  sellerInbox(shopId: string): Inquiry[];
  sellerReply(shopId: string, inquiryId: string, reply: SellerReplyRequest): Inquiry | null;

  addReport(input: { shopId: string; sessionId: string | null; type: CrowdReport['type']; note: string | null }): CrowdReport;

  verification: VerificationProvider;
  reports: ReportsProvider;

  /** (optional) Seller inbox header numbers (CT5). */
  sellerStats?(shopId: string): { askedToday: number; pending: number; staleOffers: number };
  /** (optional) Shops that have been asked about, most recent first (seller picker). */
  askedShopIds?(limit?: number): string[];
  /** (optional) Runtime DEMO_SCENARIOS toggle (/about switch). */
  setScenarios?(on: boolean, name?: string): { scenarios: boolean; scenarioName: string; timeScale: number; simulate: boolean };

  /** Start/stop the follow-up scheduler. */
  start(): void;
  stop(): void;
}
