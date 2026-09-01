export * from "./domain.mjs";

import {
  findOpenDeal,
  recordIncoming as baseRecordIncoming,
  recordHumanOutgoing as baseRecordHumanOutgoing,
  recordBotOutgoing as baseRecordBotOutgoing,
} from "./domain.mjs";

function existingDeal(data, input = {}) {
  if (input?.deal && typeof input.deal === "object") return input.deal;
  if (!input?.jid) return null;
  return findOpenDeal(data, input.jid, input.branchId || null, input.lineId || null);
}

function restoreTrimmedMessages(before, deal) {
  if (!Array.isArray(before) || !deal || !Array.isArray(deal.messages) || !before.length) return;
  const ids = new Set(deal.messages.map((message) => message?.id).filter(Boolean));
  const missing = before.filter((message) => message?.id && !ids.has(message.id));
  if (missing.length) deal.messages = [...missing, ...deal.messages];
}

function preservingCall(fn, data, input = {}, resultDeal = null) {
  const dealBefore = existingDeal(data, input);
  const before = Array.isArray(dealBefore?.messages) ? dealBefore.messages.slice() : null;
  const result = fn(data, input);
  const dealAfter = resultDeal?.(result) || result?.deal || input?.deal || dealBefore || null;
  restoreTrimmedMessages(before, dealAfter);
  return result;
}

export function recordIncoming(data, input = {}) {
  return preservingCall(baseRecordIncoming, data, input, (result) => result?.deal || null);
}

export function recordHumanOutgoing(data, input = {}) {
  return preservingCall(baseRecordHumanOutgoing, data, input, (result) => result || null);
}

export function recordBotOutgoing(data, input = {}) {
  return preservingCall(baseRecordBotOutgoing, data, input, () => input?.deal || null);
}
