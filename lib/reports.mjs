const DAY = 24 * 60 * 60 * 1000;

function toTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function itemValue(item) {
  return Number(item?.quantity || 0) * Number(item?.unitPrice || 0);
}

function firstResponseMinutes(deal) {
  const messages = (deal.messages || []).slice().sort((a, b) => toTime(a.at) - toTime(b.at));
  const firstIncoming = messages.find((message) => message.direction === "incoming");
  if (!firstIncoming) return null;
  const incomingAt = toTime(firstIncoming.at);
  const response = messages.find((message) => message.origin === "human" && toTime(message.at) >= incomingAt);
  if (!response) return null;
  return Math.max(0, (toTime(response.at) - incomingAt) / 60000);
}

function closeHours(deal) {
  const start = toTime(deal.createdAt);
  const end = toTime(deal.outcomeAt);
  return start && end && end >= start ? (end - start) / 3600000 : null;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function lastDealActivity(deal) {
  const messageAt = Math.max(0, ...(deal.messages || []).map((message) => toTime(message.at)));
  return Math.max(messageAt, toTime(deal.updatedAt), toTime(deal.createdAt));
}

function salesValueForDeal(deal) {
  return (deal.items || []).filter((item) => item.status === "sold").reduce((sum, item) => sum + itemValue(item), 0);
}

function pipelineValueForDeal(deal) {
  return (deal.items || []).filter((item) => item.status === "reserved").reduce((sum, item) => sum + itemValue(item), 0);
}

function normalizeDays(days) {
  return [0, 7, 30, 90, 365].includes(Number(days)) ? Number(days) : 30;
}

function scopedUsers(data, branchId, ownerUserId) {
  return (data.users || []).filter((user) => user.active !== false)
    .filter((user) => !branchId || user.branchId === branchId || user.role === "admin")
    .filter((user) => !ownerUserId || user.id === ownerUserId);
}

export function buildReports(data, { days = 30, ownerUserId = null, branchId = null, now = Date.now() } = {}) {
  const normalizedDays = normalizeDays(days);
  const start = normalizedDays ? now - normalizedDays * DAY : 0;
  const inPeriod = (value) => {
    const time = toTime(value);
    return time > 0 && time >= start && time <= now + DAY;
  };

  const branchDeals = (data.deals || []).filter((deal) => !branchId || deal.branchId === branchId);
  const scopedDeals = branchDeals.filter((deal) => !ownerUserId || deal.ownerUserId === ownerUserId);
  const periodDeals = scopedDeals.filter((deal) => inPeriod(deal.createdAt));
  const outcomes = scopedDeals.filter((deal) => ["won", "lost"].includes(deal.stage) && inPeriod(deal.outcomeAt));
  const won = outcomes.filter((deal) => deal.stage === "won");
  const lost = outcomes.filter((deal) => deal.stage === "lost");
  const openDeals = scopedDeals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage));
  const waiting = openDeals.filter((deal) => deal.stage === "waiting");
  const newOpen = openDeals.filter((deal) => deal.stage === "new");
  const pipelineValue = openDeals.reduce((sum, deal) => sum + pipelineValueForDeal(deal), 0);
  const salesValue = won.reduce((sum, deal) => sum + salesValueForDeal(deal), 0);
  const responses = periodDeals.map(firstResponseMinutes).filter((value) => value !== null);
  const closes = outcomes.map(closeHours).filter((value) => value !== null);

  const responseBuckets = [
    { label: "Menos de 5 min", value: responses.filter((value) => value < 5).length },
    { label: "5 a 15 min", value: responses.filter((value) => value >= 5 && value < 15).length },
    { label: "15 a 30 min", value: responses.filter((value) => value >= 15 && value < 30).length },
    { label: "30 a 60 min", value: responses.filter((value) => value >= 30 && value < 60).length },
    { label: "Más de 60 min", value: responses.filter((value) => value >= 60).length },
  ];

  const messages = scopedDeals.flatMap((deal) => (deal.messages || []).filter((message) => inPeriod(message.at)));
  const attachments = messages.map((message) => message.attachment).filter(Boolean);
  const mediaKinds = ["image", "video", "audio", "document"].map((kind) => ({
    label: { image: "Imágenes", video: "Videos", audio: "Audios", document: "Documentos" }[kind],
    value: attachments.filter((attachment) => attachment.kind === kind).length,
  }));

  const lossMap = new Map();
  for (const deal of lost) {
    const name = deal.lossReasonName || "Sin motivo";
    lossMap.set(name, (lossMap.get(name) || 0) + 1);
  }
  const lossReasons = [...lossMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const productMap = new Map();
  for (const deal of won) {
    for (const item of deal.items || []) {
      if (item.status !== "sold") continue;
      const key = item.productId || item.sku || item.name;
      const current = productMap.get(key) || { label: item.name || item.sku || "Producto", units: 0, value: 0 };
      current.units += Number(item.quantity || 0);
      current.value += itemValue(item);
      productMap.set(key, current);
    }
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.value - a.value).slice(0, 10).map((item) => ({ ...item, value: round(item.value, 0) }));

  const chartDays = normalizedDays === 7 ? 7 : 30;
  const daily = [];
  for (let offset = chartDays - 1; offset >= 0; offset -= 1) {
    const time = now - offset * DAY;
    const key = dayKey(time);
    daily.push({
      key,
      label: new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short" }).format(new Date(time)),
      contacts: scopedDeals.filter((deal) => dayKey(toTime(deal.createdAt)) === key).length,
      incoming: scopedDeals.flatMap((deal) => deal.messages || []).filter((message) => message.direction === "incoming" && dayKey(toTime(message.at)) === key).length,
      won: scopedDeals.filter((deal) => deal.stage === "won" && dayKey(toTime(deal.outcomeAt)) === key).length,
      lost: scopedDeals.filter((deal) => deal.stage === "lost" && dayKey(toTime(deal.outcomeAt)) === key).length,
    });
  }

  const waitingRisk = waiting.map((deal) => ({
    id: deal.id,
    name: deal.name,
    phone: deal.phone,
    ownerName: deal.ownerName || "Sin responsable",
    branchId: deal.branchId,
    minutes: Math.max(0, (now - toTime(deal.waitingSince || deal.updatedAt)) / 60000),
  })).sort((a, b) => b.minutes - a.minutes).slice(0, 12).map((entry) => ({ ...entry, minutes: round(entry.minutes, 0) }));

  const inactivityRisk = openDeals.map((deal) => ({
    id: deal.id,
    name: deal.name,
    phone: deal.phone,
    ownerName: deal.ownerName || "Sin responsable",
    stage: deal.stage,
    branchId: deal.branchId,
    hours: Math.max(0, (now - lastDealActivity(deal)) / 3600000),
  })).filter((entry) => entry.hours >= 2).sort((a, b) => b.hours - a.hours).slice(0, 12).map((entry) => ({ ...entry, hours: round(entry.hours, 1) }));

  const agingBuckets = [
    { label: "Menos de 2 h", value: openDeals.filter((deal) => now - toTime(deal.createdAt) < 2 * 3600000).length },
    { label: "2 a 8 h", value: openDeals.filter((deal) => now - toTime(deal.createdAt) >= 2 * 3600000 && now - toTime(deal.createdAt) < 8 * 3600000).length },
    { label: "8 a 24 h", value: openDeals.filter((deal) => now - toTime(deal.createdAt) >= 8 * 3600000 && now - toTime(deal.createdAt) < DAY).length },
    { label: "1 a 3 días", value: openDeals.filter((deal) => now - toTime(deal.createdAt) >= DAY && now - toTime(deal.createdAt) < 3 * DAY).length },
    { label: "Más de 3 días", value: openDeals.filter((deal) => now - toTime(deal.createdAt) >= 3 * DAY).length },
  ];

  const hourlyDemand = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, value: 0 }));
  const weekdayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const weekdayDemand = weekdayLabels.map((label, day) => ({ day, label, value: 0 }));
  for (const message of messages.filter((entry) => entry.direction === "incoming")) {
    const time = toTime(message.at);
    if (!time) continue;
    const date = new Date(time);
    hourlyDemand[date.getHours()].value += 1;
    weekdayDemand[date.getDay()].value += 1;
  }

  const clientDealCounts = new Map();
  for (const deal of periodDeals) {
    const key = deal.clientId || deal.jid || deal.phone || deal.id;
    clientDealCounts.set(key, (clientDealCounts.get(key) || 0) + 1);
  }
  const repeatCustomers = [...clientDealCounts.values()].filter((count) => count > 1).length;

  const clientSales = new Map();
  for (const deal of won) {
    const key = deal.clientId || deal.jid || deal.phone || deal.id;
    const current = clientSales.get(key) || { id: key, name: deal.name || deal.phone || "Cliente", phone: deal.phone || "", purchases: 0, value: 0 };
    current.purchases += 1;
    current.value += salesValueForDeal(deal);
    clientSales.set(key, current);
  }
  const topClients = [...clientSales.values()].sort((a, b) => b.value - a.value).slice(0, 8).map((entry) => ({ ...entry, value: round(entry.value, 0) }));

  const users = scopedUsers(data, branchId, ownerUserId).filter((user) => user.role !== "admin" || ownerUserId === user.id);
  const agentPerformance = users.map((user) => {
    const deals = branchDeals.filter((deal) => deal.ownerUserId === user.id);
    const period = deals.filter((deal) => inPeriod(deal.createdAt));
    const userOutcomes = deals.filter((deal) => ["won", "lost"].includes(deal.stage) && inPeriod(deal.outcomeAt));
    const userWon = userOutcomes.filter((deal) => deal.stage === "won");
    const userResponses = period.map(firstResponseMinutes).filter((value) => value !== null);
    const humanMessages = period.flatMap((deal) => deal.messages || []).filter((message) => message.origin === "human" && inPeriod(message.at)).length;
    return {
      id: user.id,
      name: user.name || user.username,
      role: user.role,
      branchId: user.branchId || null,
      assigned: period.length,
      open: deals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage)).length,
      waiting: deals.filter((deal) => deal.stage === "waiting").length,
      won: userWon.length,
      lost: userOutcomes.filter((deal) => deal.stage === "lost").length,
      conversionRate: userOutcomes.length ? round((userWon.length / userOutcomes.length) * 100) : 0,
      averageFirstResponseMinutes: round(average(userResponses)),
      salesValue: round(userWon.reduce((sum, deal) => sum + salesValueForDeal(deal), 0), 0),
      humanMessages,
      attendanceStatus: user.attendance?.status || (user.role === "agent" ? "offline" : "active"),
      attendanceReason: user.attendance?.reason || "",
    };
  }).sort((a, b) => b.salesValue - a.salesValue || b.won - a.won || a.averageFirstResponseMinutes - b.averageFirstResponseMinutes);

  const activeBranches = (data.branches || []).filter((branch) => branch.active !== false);
  const branchSummaries = activeBranches.map((branch) => {
    const deals = (data.deals || []).filter((deal) => deal.branchId === branch.id);
    const period = deals.filter((deal) => inPeriod(deal.createdAt));
    const branchOutcomes = deals.filter((deal) => ["won", "lost"].includes(deal.stage) && inPeriod(deal.outcomeAt));
    const branchWon = branchOutcomes.filter((deal) => deal.stage === "won");
    const branchResponses = period.map(firstResponseMinutes).filter((value) => value !== null);
    return {
      id: branch.id,
      code: branch.code,
      name: branch.name,
      city: branch.city,
      newClients: new Set(period.map((deal) => deal.clientId || deal.jid || deal.phone || deal.id)).size,
      open: deals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage)).length,
      waiting: deals.filter((deal) => deal.stage === "waiting").length,
      won: branchWon.length,
      lost: branchOutcomes.filter((deal) => deal.stage === "lost").length,
      conversionRate: branchOutcomes.length ? round((branchWon.length / branchOutcomes.length) * 100) : 0,
      averageFirstResponseMinutes: round(average(branchResponses)),
      salesValue: round(branchWon.reduce((sum, deal) => sum + salesValueForDeal(deal), 0), 0),
    };
  }).sort((a, b) => b.salesValue - a.salesValue || b.won - a.won);

  const scopedJids = new Set(scopedDeals.map((deal) => deal.jid).filter(Boolean));
  const calls = (data.calls || []).filter((call) => (!branchId || call.branchId === branchId) && (!ownerUserId || call.ownerUserId === ownerUserId || scopedJids.has(call.jid)) && inPeriod(call.startedAt || call.updatedAt));
  const incomingCalls = calls.filter((call) => call.direction === "incoming");

  const transferEntries = (data.transfers || []).filter((transfer) => inPeriod(transfer.createdAt || transfer.at || transfer.updatedAt)).filter((transfer) => !branchId || transfer.sourceBranchId === branchId || transfer.targetBranchId === branchId);

  const auditEvents = (data.auditEvents || []).filter((event) => inPeriod(event.at)).filter((event) => !branchId || event.branchId === branchId).filter((event) => !ownerUserId || event.userId === ownerUserId).slice(0, 1000);

  const lowStock = (data.products || []).filter((product) => product.active !== false && Number(product.available || 0) <= Number(product.minStock || 0)).sort((a, b) => Number(a.available || 0) - Number(b.available || 0)).slice(0, 10).map((product) => ({ id: product.id, name: product.name, sku: product.sku, available: Number(product.available || 0), minStock: Number(product.minStock || 0) }));

  const scopedCampaigns = (data.campaigns || []).filter((campaign) => (!branchId || campaign.branchId === branchId) && inPeriod(campaign.createdAt || campaign.startedAt || campaign.updatedAt));
  const campaignRows = scopedCampaigns.map((campaign) => {
    let recipients = campaign.recipients || [];
    if (ownerUserId) recipients = recipients.filter((recipient) => recipient.ownerUserId === ownerUserId);
    const sent = recipients.filter((entry) => entry.status === "sent").length;
    const replied = recipients.filter((entry) => entry.repliedAt).length;
    const converted = recipients.filter((entry) => entry.convertedAt).length;
    const failed = recipients.filter((entry) => entry.status === "failed").length;
    return { id: campaign.id, name: campaign.name, branchId: campaign.branchId, status: campaign.status, createdAt: campaign.createdAt, sent, replied, converted, failed, responseRate: sent ? round((replied / sent) * 100) : 0, conversionRate: sent ? round((converted / sent) * 100) : 0 };
  }).sort((a,b)=>toTime(b.createdAt)-toTime(a.createdAt));
  const campaignTotals = campaignRows.reduce((acc,row)=>{ acc.sent+=row.sent; acc.replied+=row.replied; acc.converted+=row.converted; acc.failed+=row.failed; return acc; }, { sent:0,replied:0,converted:0,failed:0 });
  campaignTotals.responseRate = campaignTotals.sent ? round((campaignTotals.replied / campaignTotals.sent) * 100) : 0;
  campaignTotals.conversionRate = campaignTotals.sent ? round((campaignTotals.converted / campaignTotals.sent) * 100) : 0;

  const attendanceUsers = scopedUsers(data, branchId, ownerUserId).filter((user)=>user.role !== "admin");
  const attendance = {
    active: attendanceUsers.filter((user)=>user.attendance?.status === "active").length,
    paused: attendanceUsers.filter((user)=>user.attendance?.status === "paused").length,
    away: attendanceUsers.filter((user)=>user.attendance?.status === "away").length,
    offline: attendanceUsers.filter((user)=>!["active","paused","away"].includes(user.attendance?.status)).length,
    coverageRequired: openDeals.filter((deal)=>deal.coverageRequired === true).length,
    availableAgents: attendanceUsers.filter((user)=>user.role === "agent" && user.attendance?.status === "active").length,
  };

  const uniquePeriodClients = new Set(periodDeals.map((deal) => deal.clientId || deal.jid || deal.phone || deal.id)).size;
  const sla15 = responses.length ? round((responses.filter((value) => value <= 15).length / responses.length) * 100) : 0;

  return {
    generatedAt: new Date(now).toISOString(),
    periodDays: normalizedDays,
    ownerUserId: ownerUserId || null,
    branchId: branchId || null,
    summary: {
      newClients: uniquePeriodClients,
      open: openDeals.length,
      waiting: waiting.length,
      unassigned: openDeals.filter((deal) => !deal.ownerUserId).length,
      untouched: newOpen.filter((deal) => !(deal.messages || []).some((message) => message.origin === "human")).length,
      won: won.length,
      lost: lost.length,
      conversionRate: outcomes.length ? round((won.length / outcomes.length) * 100) : 0,
      pipelineValue: round(pipelineValue, 0),
      salesValue: round(salesValue, 0),
      averageFirstResponseMinutes: round(average(responses)),
      sla15Rate: sla15,
      averageCloseHours: round(average(closes), 1),
      repeatCustomers,
      returningRate: uniquePeriodClients ? round((repeatCustomers / uniquePeriodClients) * 100) : 0,
      transfers: transferEntries.length,
      campaignSent: campaignTotals.sent,
      campaignResponses: campaignTotals.replied,
      campaignResponseRate: campaignTotals.responseRate,
      campaignConversions: campaignTotals.converted,
      coverageRequired: attendance.coverageRequired,
      availableAgents: attendance.availableAgents,
    },
    funnel: ["new", "contacted", "waiting", "won", "lost"].map((stage) => ({ stage, value: periodDeals.filter((deal) => deal.stage === stage).length })),
    responseBuckets,
    lossReasons,
    topProducts,
    topClients,
    daily,
    waitingRisk,
    inactivityRisk,
    agingBuckets,
    hourlyDemand,
    weekdayDemand,
    agentPerformance,
    branchSummaries,
    lowStock,
    campaignPerformance: { totals: campaignTotals, campaigns: campaignRows.slice(0, 20) },
    attendance,
    auditEvents,
    transfers: { total: transferEntries.length },
    communications: {
      total: messages.length,
      incoming: messages.filter((message) => message.direction === "incoming").length,
      human: messages.filter((message) => message.origin === "human").length,
      bot: messages.filter((message) => ["bot", "followup"].includes(message.origin)).length,
      attachments: attachments.length,
      mediaKinds,
    },
    calls: {
      totalEvents: calls.length,
      incoming: incomingCalls.length,
      missed: calls.filter((call) => call.status === "timeout").length,
      video: incomingCalls.filter((call) => call.isVideo).length,
      voice: incomingCalls.filter((call) => !call.isVideo).length,
      recent: calls.slice(0, 12),
    },
  };
}
