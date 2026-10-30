/**
 * SSE Event Payload Formatters [Phase 4 — ARCH-4]
 *
 * Every SSE event flowing through SSEManager uses one of these builders.
 * Keeps payloads typed, versioned, and consistent across workers, controllers,
 * and the push service.
 *
 * Consumer channel events:
 *   deal:new           — new deal posted nearby
 *   deal:price_drop    — Dutch Auction price decreased
 *   deal:urgency_update— RUS recalculated
 *   deal:claimed       — deal fully claimed (no slots left)
 *   deal:released      — a slot was released (cancel / timeout)
 *   deal:expired       — deal TTL reached
 *   deal:ngo_handoff   — deal handed to NGO
 *   deal:items_updated — vendor edited item list
 *   deal:cancelled     — vendor cancelled the deal
 *   claim:confirmed    — consumer's own claim confirmed
 *   claim:expired      — consumer's claim timed out
 *   pickup:confirmed   — vendor scanned QR, pickup done
 *
 * Vendor channel events:
 *   claim:new          — a consumer claimed a slot
 *   claim:cancelled    — a consumer voluntarily cancelled
 *   claim:released     — a slot freed (timeout or cancel)
 */

// ─── Consumer Events ──────────────────────────────────────────────────────────

function dealNew({ dealId, dealTitle, vendorName, currentPrice, urgencyLabel, itemsRemaining, expiresAt, distanceMeters }) {
  return {
    event: 'deal:new',
    data: {
      deal_id: dealId,
      deal_title: dealTitle,
      vendor_name: vendorName,
      current_price: currentPrice,
      urgency_label: urgencyLabel,
      items_remaining: itemsRemaining,
      expires_at: expiresAt,
      distance_meters: distanceMeters ?? null,
    },
  };
}

function dealPriceDrop({ dealId, dealTitle, oldPrice, newPrice, minRescuePrice, urgencyLabel, expiresAt }) {
  return {
    event: 'deal:price_drop',
    data: {
      deal_id: dealId,
      deal_title: dealTitle,
      old_price: oldPrice,
      new_price: newPrice,
      min_rescue_price: minRescuePrice,
      urgency_label: urgencyLabel,
      expires_at: expiresAt,
    },
  };
}

function dealUrgencyUpdate({ dealId, urgencyScore, urgencyLabel, minutesRemaining, itemsRemaining }) {
  return {
    event: 'deal:urgency_update',
    data: {
      deal_id: dealId,
      urgency_score: urgencyScore,
      urgency_label: urgencyLabel,
      minutes_remaining: minutesRemaining,
      items_remaining: itemsRemaining,
    },
  };
}

function dealClaimed({ dealId }) {
  return {
    event: 'deal:claimed',
    data: { deal_id: dealId, message: 'All slots claimed' },
  };
}

function dealReleased({ dealId, slotsRemaining }) {
  return {
    event: 'deal:released',
    data: { deal_id: dealId, slots_remaining: slotsRemaining },
  };
}

function dealExpired({ dealId }) {
  return {
    event: 'deal:expired',
    data: { deal_id: dealId },
  };
}

function dealNgoHandoff({ dealId, dealTitle }) {
  return {
    event: 'deal:ngo_handoff',
    data: { deal_id: dealId, deal_title: dealTitle, message: 'Unclaimed deal forwarded to NGO partner' },
  };
}

function dealItemsUpdated({ dealId, items }) {
  return {
    event: 'deal:items_updated',
    data: { deal_id: dealId, items, warning: 'Item list was updated by the vendor after you claimed' },
  };
}

function dealCancelled({ dealId }) {
  return {
    event: 'deal:cancelled',
    data: { deal_id: dealId, message: 'This deal was cancelled by the vendor' },
  };
}

function claimConfirmed({ claimId, dealId, qrToken, qrExpiresAt, pricePaid }) {
  return {
    event: 'claim:confirmed',
    data: {
      claim_id: claimId,
      deal_id: dealId,
      qr_token: qrToken,
      qr_expires_at: qrExpiresAt,
      price_paid: pricePaid,
    },
  };
}

function claimExpired({ claimId, dealId, reason }) {
  return {
    event: 'claim:expired',
    data: { claim_id: claimId, deal_id: dealId, reason: reason ?? 'QR code expired' },
  };
}

function pickupConfirmed({ claimId, dealId }) {
  return {
    event: 'pickup:confirmed',
    data: { claim_id: claimId, deal_id: dealId, message: 'Pickup confirmed! Thank you for rescuing food.' },
  };
}

// ─── Vendor Events ────────────────────────────────────────────────────────────

function claimNew({ dealId, claimedQuantity, totalQuantity, slotsRemaining, dealStatus }) {
  return {
    event: 'claim:new',
    data: {
      deal_id: dealId,
      claimed_quantity: claimedQuantity,
      total_quantity: totalQuantity,
      slots_remaining: slotsRemaining,
      deal_status: dealStatus,
    },
  };
}

function claimCancelled({ dealId, claimedQuantity, totalQuantity, dealStatus }) {
  return {
    event: 'claim:cancelled',
    data: {
      deal_id: dealId,
      claimed_quantity: claimedQuantity,
      total_quantity: totalQuantity,
      deal_status: dealStatus,
    },
  };
}

function claimReleased({ dealId }) {
  return {
    event: 'claim:released',
    data: { deal_id: dealId },
  };
}

// ─── Helper: write a formatted event directly to an SSE response ──────────────

/**
 * Writes a named SSE event + JSON data to a raw Express response.
 * @param {import('express').Response} res
 * @param {string} eventName
 * @param {object} payload
 */
function writeEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

module.exports = {
  // Consumer
  dealNew,
  dealPriceDrop,
  dealUrgencyUpdate,
  dealClaimed,
  dealReleased,
  dealExpired,
  dealNgoHandoff,
  dealItemsUpdated,
  dealCancelled,
  claimConfirmed,
  claimExpired,
  pickupConfirmed,
  // Vendor
  claimNew,
  claimCancelled,
  claimReleased,
  // Utility
  writeEvent,
};
