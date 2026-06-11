export type SellerTier = "tier_1" | "tier_2" | "tier_3";

export type CheckCheckStatus =
  | "not_required"
  | "required"
  | "submitted"
  | "approved"
  | "rejected"
  | "admin_review";

export type ReserveEntryStatus = "pending" | "held" | "released" | "consumed";

export type ReserveEntryType =
  | "hold"
  | "release"
  | "consume"
  | "adjustment"
  | "minimum_balance_seed";

export type RelayTagStatus =
  | "unassigned"
  | "assigned_to_seller"
  | "bound_to_order"
  | "submitted_by_seller"
  | "shipped"
  | "buyer_scanned"
  | "completed"
  | "disputed"
  | "voided";

export type RelayTagPhotoVerificationStatus =
  | "pending"
  | "verified"
  | "mismatch"
  | "admin_review";

export type ChainOfCustodyVerificationStatus =
  | "pending"
  | "submitted"
  | "verified"
  | "mismatch"
  | "admin_review";

export type DisputeCategory =
  | "authenticity"
  | "condition_not_as_listed"
  | "wrong_item"
  | "tampered_tag"
  | "missing_contents"
  | "shipping_damage";

export type DisputeStatus = "open" | "seller_responded" | "under_review" | "resolved" | "closed";

export type AuditActorRole = "system" | "admin" | "seller" | "buyer";

export interface SellerTrustSnapshot {
  sellerTier: SellerTier;
  trustScore: number;
  recommendedSellerTier?: SellerTier;
  recommendedTrustScore?: number;
  completedOrderCount: number;
  lifetimeGmvCents: number;
  trailing30dOrderCount: number;
  trailing30dDisputeCount: number;
  trailing90dOrderCount: number;
  trailing90dDisputeCount: number;
  trailing180dOrderCount: number;
  trailing180dDisputeCount: number;
  buyerCompletionCompletedCount: number;
  buyerCompletionEligibleOrderCount: number;
  buyerCompletionRateBps: number;
  authenticityViolationCount: number;
  tierManuallyOverridden: boolean;
  tierLocked?: boolean;
  isFoundingSeller?: boolean;
  tier3ApprovedAt?: string | Date | null;
  createdAt: string | Date;
  sellerApprovedAt?: string | Date | null;
  firstCompletedOrderAt?: string | Date | null;
  lastAuthenticityViolationAt?: string | Date | null;
}

export interface SellerReserveAccount {
  id: string;
  seller_id: string;
  balance_cents: number;
  minimum_balance_cents: number;
  reserve_percentage_bps: number;
  hold_duration_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface SellerReserveEntry {
  id: string;
  seller_id: string;
  order_id: string | null;
  entry_type: ReserveEntryType;
  amount_cents: number;
  reserve_percentage_bps: number;
  hold_duration_days: number | null;
  release_eligible_at: string | null;
  released_at: string | null;
  consumed_at: string | null;
  status: ReserveEntryStatus;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RelayTag {
  id: string;
  tag_serial_number: string;
  barcode_value: string | null;
  assigned_seller_id: string | null;
  assigned_order_id: string | null;
  status: RelayTagStatus;
  assigned_to_seller_at: string | null;
  bound_to_order_at: string | null;
  submitted_by_seller_at: string | null;
  shipped_at: string | null;
  buyer_scanned_at: string | null;
  completed_at: string | null;
  disputed_at: string | null;
  voided_at: string | null;
  photo_verification_status: RelayTagPhotoVerificationStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RelayTagScanEvent {
  id: string;
  relay_tag_id: string;
  order_id: string | null;
  seller_id: string | null;
  actor_user_id: string | null;
  actor_role: AuditActorRole;
  scan_type: string;
  scanned_value: string;
  scanned_barcode_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OrderChainOfCustody {
  order_id: string;
  relay_tag_id: string | null;
  seller_scanned_tag_value: string | null;
  buyer_scanned_tag_value: string | null;
  seller_tag_photo_url: string | null;
  seller_pair_photo_url: string | null;
  seller_box_photo_url: string | null;
  seller_sealed_package_photo_url: string | null;
  buyer_tag_photo_url: string | null;
  buyer_pair_photo_url: string | null;
  verification_status: ChainOfCustodyVerificationStatus;
  mismatch_reason: string | null;
  admin_review_required: boolean;
  seller_submitted_at: string | null;
  buyer_submitted_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderDisputeRecord {
  id: string;
  order_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  opened_by_user_id: string | null;
  category: DisputeCategory;
  status: DisputeStatus;
  buyer_description: string | null;
  seller_description: string | null;
  evidence_urls: string[];
  buyer_evidence_urls: string[];
  seller_evidence_urls: string[];
  buyer_scanned_tag_value: string | null;
  seller_funds_frozen: boolean;
  admin_resolution: string | null;
  financial_outcome: string | null;
  seller_penalty_outcome: string | null;
  resolved_by_admin_id: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RelayAuditEvent {
  id: string;
  actor_user_id: string | null;
  actor_role: AuditActorRole;
  event_type: string;
  order_id: string | null;
  seller_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SellerTierHistoryEntry {
  id: string;
  seller_id: string;
  previous_tier: SellerTier | null;
  new_tier: SellerTier;
  recommended_tier: SellerTier | null;
  trust_score: number | null;
  change_source:
    | "automated_evaluation"
    | "manual_override"
    | "manual_unlock"
    | "admin_approval"
    | "authenticity_violation"
    | "tag_tampering_violation"
    | "dispute_rate_demotion";
  actor_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SellerTrustEvaluation {
  id: string;
  seller_id: string;
  trust_score: number;
  recommended_tier: SellerTier;
  applied_tier: SellerTier;
  was_tier_changed: boolean;
  manual_override_applied: boolean;
  admin_approval_required: boolean;
  breakdown: Record<string, unknown>;
  reasons: unknown[];
  hard_thresholds: Record<string, unknown>;
  metadata: Record<string, unknown>;
  evaluated_by_user_id: string | null;
  created_at: string;
}

export interface SellerViolation {
  id: string;
  seller_id: string;
  order_id: string | null;
  violation_type: "authenticity" | "tag_tampering" | "dispute_rate" | "manual_demotion" | "other";
  severity: "low" | "medium" | "high" | "critical";
  penalty_outcome: string | null;
  notes: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
