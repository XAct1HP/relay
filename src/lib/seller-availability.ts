export interface SellerAvailabilityProfile {
  role?: string | null;
  customerMessagingEnabled?: boolean | null;
  vacationModeEnabled?: boolean | null;
}

export function isSellerLikeRole(role?: string | null) {
  return role === "seller" || role === "admin";
}

export function isSellerOnVacation(profile?: SellerAvailabilityProfile | null) {
  return isSellerLikeRole(profile?.role) && !!profile?.vacationModeEnabled;
}

export function canBuyFromSeller(profile?: SellerAvailabilityProfile | null) {
  return !isSellerOnVacation(profile);
}

export function getBuyerMessagingUnavailableReason(
  profile?: SellerAvailabilityProfile | null
) {
  if (!isSellerLikeRole(profile?.role)) {
    return null;
  }

  if (profile?.vacationModeEnabled) {
    return "Seller is temporarily unavailable while vacation mode is on.";
  }

  if (profile?.customerMessagingEnabled === false) {
    return "This seller is not accepting new customer messages right now.";
  }

  return null;
}

export function canBuyerMessageSeller(profile?: SellerAvailabilityProfile | null) {
  return getBuyerMessagingUnavailableReason(profile) === null;
}

export function getVacationModeNotice() {
  return "Seller is temporarily unavailable. Buying and new messages are paused while vacation mode is on.";
}
