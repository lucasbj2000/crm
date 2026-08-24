import { randomUUID } from "node:crypto";

export const STAGES = Object.freeze({
  NEW: "new",
  CONTACTED: "contacted",
  WAITING: "waiting",
  WON: "won",
  LOST: "lost",
  TRANSFERRED: "transferred",
});

export const OPEN_STAGES = new Set([
  STAGES.NEW,
  STAGES.CONTACTED,
  STAGES.WAITING,
]);

export const defaultLossReasons = [
  "Sin retorno del cliente",
  "Precio",
  "Sin stock",
  "No interesado",
  "Compró a otro",
  "Otro",
];

export const defaultQuickReplies = [
  { title: "Sucursales", shortcut: "/sucursales", category: "Información", body: "Claro. ¿En qué ciudad o zona te encontrás? Así te indico la sucursal más conveniente." },
  { title: "Consulta de stock", shortcut: "/stock", category: "Productos", body: "Claro. Indicame el nombre o código del producto y verifico el stock disponible." },
  { title: "Derivar a asesor", shortcut: "/asesor", category: "Atención", body: "Perfecto. Voy a continuar personalmente con tu consulta y te ayudo desde aquí." },
];

export function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function timestamp(value = Date.now()) {
  return new Date(value).toISOString();
}

export function minutes(value, unit = "minutes") {
  const amount = Math.max(0, Number(value) || 0);
  if (unit === "days") return amount * 24 * 60;
  if (unit === "hours") return amount * 60;
  return amount;
}

export function phoneFromJid(jid = "") {
  const text = String(jid || "");
  const server = text.split("@")[1]?.toLowerCase() || "";
  // Los JID @lid son identificadores internos de WhatsApp, NO números telefónicos.
  if (["lid", "hosted.lid"].includes(server)) return "Sin número";
  const raw = text.split("@")[0].split(":")[0].replace(/\D/g, "");
  return raw ? `+${raw}` : "Sin número";
}

export function cleanText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}


function identityPhoneDigits(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function normalizeClientPhoneRecord(record = {}, fallback = {}, now = Date.now()) {
  const phone = cleanText(record.phone || fallback.phone, 40);
  const digits = identityPhoneDigits(phone);
  const jid = cleanText(record.jid || fallback.jid || (digits ? `${digits}@s.whatsapp.net` : ""), 180);
  return {
    id: record.id || makeId("phone"),
    label: cleanText(record.label || fallback.label || "Principal", 80) || "Principal",
    phone,
    jid,
    primary: record.primary === true || fallback.primary === true,
    whatsapp: record.whatsapp !== false,
    active: record.active !== false,
    verified: record.verified === true,
    createdAt: record.createdAt || timestamp(now),
    updatedAt: record.updatedAt || timestamp(now),
  };
}

function normalizeClientContactPerson(person = {}, now = Date.now()) {
  const phones = Array.isArray(person.phones)
    ? person.phones.map((record, index) => normalizeClientPhoneRecord(record, { label: index === 0 ? "Principal" : `Teléfono ${index + 1}`, primary: index === 0 }, now)).filter((record) => identityPhoneDigits(record.phone))
    : [];
  if (phones.length && !phones.some((record) => record.primary)) phones[0].primary = true;
  return {
    id: person.id || makeId("contactperson"),
    name: cleanText(person.name, 140),
    role: cleanText(person.role, 120),
    email: cleanText(person.email, 160),
    notes: cleanText(person.notes, 1200),
    active: person.active !== false,
    phones,
    createdAt: person.createdAt || timestamp(now),
    updatedAt: person.updatedAt || timestamp(now),
  };
}

function normalizeClientBranchRelationship(relation = {}, now = Date.now()) {
  return {
    branchId: cleanText(relation.branchId, 120),
    active: relation.active !== false,
    manual: relation.manual === true,
    preferred: relation.preferred === true,
    customerSince: relation.customerSince || null,
    lastInteractionAt: relation.lastInteractionAt || null,
    lastPurchaseAt: relation.lastPurchaseAt || null,
    purchaseCount: Math.max(0, Number(relation.purchaseCount) || 0),
    totalPurchased: Math.max(0, Number(relation.totalPurchased) || 0),
    ownerUserId: relation.ownerUserId || null,
    ownerName: cleanText(relation.ownerName, 120),
    notes: cleanText(relation.notes, 600),
    createdAt: relation.createdAt || timestamp(now),
    updatedAt: relation.updatedAt || timestamp(now),
  };
}

export function createInitialData(now = Date.now()) {
  return {
    version: 24,
    settings: {
      instructions:
        "Sos el asistente de atención de mi empresa. Respondé en español, de forma clara, amable y breve. Consultá el stock antes de prometer disponibilidad. Solo reservá productos si el cliente confirmó claramente el producto y la cantidad. Cuando sea necesario, indicá que un asesor continuará la conversación.",
      apiKey: "",
      model: "gpt-4.1-mini",
      botEnabled: true,
      botCanReserve: true,
      followup: {
        enabled: true,
        value: 30,
        unit: "minutes",
        message:
          "Hola, ¿te gustaría continuar la conversación desde donde la dejamos? Quedamos atentos a tu respuesta.",
      },
      autoClose: {
        enabled: true,
        value: 24,
        unit: "hours",
      },
      heatMinutes: {
        warm: 15,
        hot: 30,
        red: 60,
        critical: 120,
      },
      lossReasons: defaultLossReasons.map((name, index) => ({
        id: makeId("reason"),
        name,
        order: index,
      })),
      passwordHash: "",
      whatsappMode: "qr",
      branding: {
        systemName: "WhatsBot CRM",
        shortName: "WhatsBot",
        subtitle: "CRM LOCAL",
        primaryColor: "#143c2f",
        accentColor: "#b9d977",
        backgroundColor: "#f4f2ea",
        sidebarColor: "#143c2f",
        surfaceColor: "#ffffff",
        textColor: "#1a2b24",
        fontStyle: "modern",
        radius: "18",
        logoFit: "contain",
        defaultTheme: "light",
        loginKicker: "CONTROL LOCAL · 24/7",
        loginMessage: "Ingresá con tu usuario para administrar las conversaciones, el bot y el stock.",
        loginStyle: "ambient",
        showSubtitle: true,
        logoFileName: "",
      },
      whatsappApi: {
        phoneNumberId: "",
        businessAccountId: "",
        accessToken: "",
        verifyToken: "",
        apiVersion: "v23.0",
      },
      sharedDrive: {
        enabled: false,
        folderPath: "",
        syncIntervalSeconds: 15,
        installationId: makeId("install"),
      },
      whatsappCalls: {
        autoAssignUnowned: true,
        ownerFirst: true,
      },
      copilot: {
        enabled: true,
        autoSuggest: true,
        includeStock: true,
        includeBranches: true,
        includeDocuments: true,
      },
      smartCapture: {
        enabled: true,
        suggestionsEnabled: true,
        autoApplySafe: true,
        aiExtraction: true,
        confidenceThreshold: 82,
        autoApplyConfidence: 96,
        autoApplyFields: ["city", "email", "age", "country", "neighborhood"],
        protectedFields: ["name", "document", "ruc", "address", "birthDate", "company", "jobTitle"],
      },
      adminGuide: { enabled: true, contextualTips: true, showExamples: true, showBestPractices: true },
      aiGovernance: { autonomyDefault: 3, maxExternalAutonomy: 3, requireApprovalAboveAmount: 0, monthlyBudgetUsd: 0, modelRouting: true, logAllAiActions: true },
      v21Intelligence: { enabled: true, proactiveScan: true, scanIntervalMinutes: 15, observerMode: true, learningEnabled: true, autoPromiseDetection: true, qualityReviewEnabled: true, predictionEnabled: true, maxAutoClientChanges: 50, maxAutoRulesPerDay: 5, forbidDestructiveActions: true, minimumConfidenceForAuto: 90 },
      superAutomation: { enabled: true, executeDirectly: true, silentByDefault: true, maxChainDepth: 8, defaultReplyTimeoutMinutes: 60, logExecutions: true },
      stageLabels: { new: "Nuevos", contacted: "Contactados", waiting: "En espera", won: "Ganados", lost: "Perdidos", transferred: "Transferidos" },
      botProfiles: {
        newClientInstructions: "Atendé al cliente nuevo, identificá su necesidad y solicitá los datos necesarios sin ser invasivo. Si informa nombre y apellido, documento, RUC u otro dato configurado, actualizalo usando las herramientas disponibles.",
        knownClientInstructions: "El cliente ya es conocido y tiene historial. Saludalo por su nombre, reconocé que ya fue atendido anteriormente y avisale que su responsable continuará la gestión. Resolvé consultas simples si tenés información confiable.",
        ownerAwayInstructions: "El responsable habitual está ausente. Informale al cliente que el equipo de la sucursal recibió su mensaje y que un encargado dará continuidad. No prometas horarios exactos si no están configurados.",
      },
      operational: {
        timezoneDefault: "America/Asuncion",
        weatherEnabled: true,
        weatherRefreshMinutes: 15,
        weatherProvider: "open-meteo",
        supportMessage: "Ante cualquier inconveniente, avisá a tu jefatura o al administrador del sistema.",
        incident: { enabled: false, severity: "warning", title: "Aviso operativo", message: "", updatedAt: null, updatedByName: "" },
      },
      campaignSafety: {
        qrEnabled: true,
        requireOptIn: true,
        qrDailyLimitPerBranch: 25,
        qrIntervalSeconds: 90,
        qrClientCooldownDays: 7,
        qrStartHour: 8,
        qrEndHour: 19,
        apiIntervalSeconds: 3,
        stopOnProviderError: true,
      },
      communicationOrchestrator: {
        surveyIsolation: true,
        campaignIsolation: true,
        surveyRepliesTriggerCrm: false,
        campaignRepliesTriggerCrm: false,
        surveyCancelWords: ["salir", "cancelar formulario", "finalizar formulario", "cancelar encuesta", "finalizar encuesta"],
      },
      telephony: {
        enabled: false,
        mode: "webrtc",
        sipHost: "190.128.234.106",
        sipPort: 7560,
        sipDomain: "190.128.234.106",
        extension: "801",
        authorizationUser: "801",
        password: "",
        websocketUrl: "ws://190.128.234.106:7560",
        displayName: "WhatsBot CRM",
        maxConcurrentCalls: 5,
        fallbackSeconds: 20,
        autoAssignUnowned: true,
        externalSoftphoneFallback: true,
      },
      createdAt: timestamp(now),
    },
    branches: [],
    transfers: [],
    users: [],
    clientLoads: [],
    clients: [],
    clientDataSuggestions: [],
    quickReplies: defaultQuickReplies.map((item, index) => ({ id: makeId("reply"), ...item, active: true, order: index, createdAt: timestamp(now), updatedAt: timestamp(now) })),
    assistantDocuments: [],
    botInstructions: [],
    customFieldDefinitions: [],
    campaigns: [],
    surveys: [],
    surveySessions: [],
    communicationEvents: [],
    attendanceEvents: [],
    news: [],
    newsReads: [],
    deals: [],
    products: [],
    stockMovements: [],
    activities: [],
    auditEvents: [],
    botMessageIds: [],
    processedMessageIds: [],
    calls: [],
    customerMemories: [],
    opportunities: [],
    orders: [],
    visits: [],
    trainingItems: [],
    automationDrafts: [],
    automationRules: [],
    automationWaits: [],
    automationExecutions: [],
    automationDelayedActions: [],
    securityAlerts: [],
    aiUsage: [],
    clientAgents: [],
    aiPromises: [],
    aiQualityReviews: [],
    aiAnomalies: [],
    aiPredictions: [],
    aiGoals: [],
    aiExperiments: [],
    aiLearningCorrections: [],
    automationReputation: [],
    automationTemplates: [],
    executiveBriefs: [],
    v21Orchestrations: [],
    identityLinks: [],
    intelligenceRuns: [],
    communicationRequests: [],
    sync: {
      // Null means this installation has never been connected. On the first
      // link we request a bounded recent history instead of assuming that
      // only messages from the last couple of minutes matter.
      lastActiveAt: null,
      lastHistorySyncAt: null,
      lastImportAt: null,
      lastImportCount: 0,
      totalImported: 0,
    },
  };
}

export function normalizeData(input, now = Date.now()) {
  const defaults = createInitialData(now);
  const data = input && typeof input === "object" ? input : {};
  const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  const hasSync = data.sync && typeof data.sync === "object";
  const deals = Array.isArray(data.deals)
    ? data.deals.map((deal) => ({
        clientId: null,
        branchId: null,
        ownerUserId: null,
        ownerName: "",
        source: "whatsapp",
        createdByUserId: null,
        transferredFromBranchId: null,
        transferredToBranchId: null,
        transferredAt: null,
        transferredByUserId: null,
        transferredByName: "",
        transferHistory: [],
        customFields: {},
        campaignSourceIds: [],
        commercialStatusId: "new_inquiry",
        commercialStatusLabel: "Consulta nueva",
        commercialStatusSource: "ai",
        commercialStatusConfidence: 70,
        commercialStatusManual: false,
        commercialStatusUpdatedAt: null,
        coverageRequired: false,
        coverageReason: "",
        ...deal,
        items: Array.isArray(deal.items) ? deal.items : [],
        messages: Array.isArray(deal.messages) ? deal.messages : [],
        transferHistory: Array.isArray(deal.transferHistory) ? deal.transferHistory : [],
        customFields: deal.customFields && typeof deal.customFields === "object" ? deal.customFields : {},
        campaignSourceIds: Array.isArray(deal.campaignSourceIds) ? deal.campaignSourceIds : [],
        commercialStatusId: cleanText(deal.commercialStatusId, 100) || "new_inquiry",
        commercialStatusLabel: cleanText(deal.commercialStatusLabel, 160) || "Consulta nueva",
        commercialStatusSource: cleanText(deal.commercialStatusSource, 30) || "ai",
        commercialStatusConfidence: Math.max(0, Math.min(100, Number(deal.commercialStatusConfidence) || 0)),
        commercialStatusManual: deal.commercialStatusManual === true,
        commercialStatusUpdatedAt: deal.commercialStatusUpdatedAt || null,
      }))
    : [];
  const messageIds = deals
    .flatMap((deal) => deal.messages || [])
    .map((message) => message.id)
    .filter(Boolean);
  const legacyLastActiveAt = deals
    .flatMap((deal) => (deal.messages || []).map((message) => message.at || deal.updatedAt))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  const processedMessageIds = Array.from(new Set([
    ...(Array.isArray(data.processedMessageIds) ? data.processedMessageIds : []),
    ...messageIds,
  ])).slice(-5000);
  const clients = Array.isArray(data.clients)
    ? data.clients.map((client) => ({
        id: client.id || makeId("client"),
        jid: cleanText(client.jid, 180),
        phone: cleanText(client.phone, 40),
        name: cleanText(client.name, 120),
        document: cleanText(client.document, 80),
        ruc: cleanText(client.ruc, 80),
        email: cleanText(client.email, 160),
        company: cleanText(client.company, 160),
        city: cleanText(client.city, 120),
        address: cleanText(client.address, 240),
        age: Math.max(0, Math.min(120, Number(client.age) || 0)),
        birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(client.birthDate || "")) ? String(client.birthDate) : "",
        jobTitle: cleanText(client.jobTitle, 120),
        country: cleanText(client.country, 120),
        neighborhood: cleanText(client.neighborhood, 120),
        notes: cleanText(client.notes, 3000),
        entityType: client.entityType === "company" ? "company" : "person",
        phones: Array.isArray(client.phones) ? client.phones.map((record, index) => normalizeClientPhoneRecord(record, { label: index === 0 ? "Principal" : `Teléfono ${index + 1}`, primary: index === 0 }, now)).filter((record) => identityPhoneDigits(record.phone)) : [],
        contactPersons: Array.isArray(client.contactPersons) ? client.contactPersons.map((person) => normalizeClientContactPerson(person, now)).filter((person) => person.name || person.phones.length) : [],
        branchRelationships: Array.isArray(client.branchRelationships) ? client.branchRelationships.map((relation) => normalizeClientBranchRelationship(relation, now)).filter((relation) => relation.branchId) : [],
        branchChoiceMode: ["ask_when_multiple", "prefer_last", "never"].includes(client.branchChoiceMode) ? client.branchChoiceMode : "ask_when_multiple",
        preferredBranchId: client.preferredBranchId || null,
        tags: Array.isArray(client.tags) ? client.tags.map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 20) : [],
        marketingOptIn: client.marketingOptIn === true,
        marketingOptInAt: client.marketingOptInAt || null,
        customFields: client.customFields && typeof client.customFields === "object" ? client.customFields : {},
        branchOwners: client.branchOwners && typeof client.branchOwners === "object" ? client.branchOwners : {},
        ownerUserId: client.ownerUserId || null,
        ownerName: cleanText(client.ownerName, 120),
        createdAt: client.createdAt || timestamp(now),
        updatedAt: client.updatedAt || timestamp(now),
      }))
    : [];
  // Limpia teléfonos históricos que en versiones anteriores fueron tomados desde un JID @lid.
  // Un LID puede ser un número largo, pero no corresponde al teléfono real del cliente.
  for (const client of clients) {
    const primaryDigits = identityPhoneDigits(client.phone);
    if (primaryDigits && !client.phones.some((record) => identityPhoneDigits(record.phone) === primaryDigits)) {
      client.phones.unshift(normalizeClientPhoneRecord({ phone: client.phone, jid: client.jid, label: "Principal", primary: true }, {}, now));
    }
    if (client.phones.length && !client.phones.some((record) => record.primary)) client.phones[0].primary = true;
    const primaryRecord = client.phones.find((record) => record.primary && record.active !== false) || client.phones.find((record) => record.active !== false);
    if (primaryRecord) {
      if (!client.phone || client.phone === "Sin número") client.phone = primaryRecord.phone;
      if (!client.jid) client.jid = primaryRecord.jid;
    }
    const server = String(client.jid || "").split("@")[1]?.toLowerCase() || "";
    if (["lid", "hosted.lid"].includes(server)) client.phone = "Sin número";
  }
  for (const deal of deals) {
    const server = String(deal.jid || "").split("@")[1]?.toLowerCase() || "";
    if (["lid", "hosted.lid"].includes(server)) deal.phone = "Sin número";
  }

  for (const deal of deals) {
    let client = clients.find((entry) => entry.id === deal.clientId || (deal.jid && entry.jid === deal.jid));
    if (!client) {
      client = {
        id: makeId("client"),
        jid: deal.jid || "",
        phone: deal.phone || phoneFromJid(deal.jid),
        name: deal.name || deal.phone || phoneFromJid(deal.jid),
        document: "",
        ruc: "",
        email: "",
        company: "",
        city: "",
        address: "",
        age: 0,
        birthDate: "",
        jobTitle: "",
        country: "",
        neighborhood: "",
        notes: "",
        entityType: "person",
        phones: identityPhoneDigits(deal.phone || phoneFromJid(deal.jid)) ? [normalizeClientPhoneRecord({ phone: deal.phone || phoneFromJid(deal.jid), jid: deal.jid, label: "Principal", primary: true }, {}, now)] : [],
        contactPersons: [],
        branchRelationships: [],
        branchChoiceMode: "ask_when_multiple",
        preferredBranchId: null,
        tags: [],
        marketingOptIn: false,
        marketingOptInAt: null,
        customFields: {},
        branchOwners: {},
        ownerUserId: deal.ownerUserId || null,
        ownerName: deal.ownerName || "",
        createdAt: deal.createdAt || timestamp(now),
        updatedAt: deal.updatedAt || deal.createdAt || timestamp(now),
      };
      clients.push(client);
    }
    deal.clientId = client.id;
    if (!deal.ownerUserId && client.ownerUserId) {
      deal.ownerUserId = client.ownerUserId;
      deal.ownerName = client.ownerName || "";
    }
    if (!client.ownerUserId && deal.ownerUserId) {
      client.ownerUserId = deal.ownerUserId;
      client.ownerName = deal.ownerName || "";
    }
    if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
    if (deal.branchId && deal.ownerUserId && !client.branchOwners[deal.branchId]) {
      client.branchOwners[deal.branchId] = { userId: deal.ownerUserId, userName: deal.ownerName || "", updatedAt: deal.updatedAt || timestamp(now) };
    }
  }
  const quickReplies = Array.isArray(data.quickReplies) && data.quickReplies.length
    ? data.quickReplies.map((reply, index) => ({
        id: reply.id || makeId("reply"),
        title: cleanText(reply.title, 120),
        shortcut: cleanText(reply.shortcut, 40),
        category: cleanText(reply.category, 80) || "General",
        body: cleanText(reply.body, 3000),
        active: reply.active !== false,
        order: Number.isFinite(Number(reply.order)) ? Number(reply.order) : index,
        createdAt: reply.createdAt || timestamp(now),
        updatedAt: reply.updatedAt || timestamp(now),
      }))
    : defaults.quickReplies;
  return {
    ...defaults,
    ...data,
    settings: {
      ...defaults.settings,
      ...settings,
      sharedDrive: {
        ...defaults.settings.sharedDrive,
        ...(settings.sharedDrive && typeof settings.sharedDrive === "object" ? settings.sharedDrive : {}),
      },
      whatsappCalls: {
        ...defaults.settings.whatsappCalls,
        ...(settings.whatsappCalls && typeof settings.whatsappCalls === "object" ? settings.whatsappCalls : {}),
      },
      copilot: {
        ...defaults.settings.copilot,
        ...(settings.copilot && typeof settings.copilot === "object" ? settings.copilot : {}),
      },
      smartCapture: {
        ...defaults.settings.smartCapture,
        ...(settings.smartCapture && typeof settings.smartCapture === "object" ? settings.smartCapture : {}),
      },
      adminGuide: { ...defaults.settings.adminGuide, ...(settings.adminGuide && typeof settings.adminGuide === "object" ? settings.adminGuide : {}) },
      aiGovernance: { ...defaults.settings.aiGovernance, ...(settings.aiGovernance && typeof settings.aiGovernance === "object" ? settings.aiGovernance : {}) },
      v21Intelligence: { ...defaults.settings.v21Intelligence, ...(settings.v21Intelligence && typeof settings.v21Intelligence === "object" ? settings.v21Intelligence : {}) },
      superAutomation: { ...defaults.settings.superAutomation, ...(settings.superAutomation && typeof settings.superAutomation === "object" ? settings.superAutomation : {}) },
      stageLabels: { ...defaults.settings.stageLabels, ...(settings.stageLabels && typeof settings.stageLabels === "object" ? settings.stageLabels : {}) },
      operational: {
        ...defaults.settings.operational,
        ...(settings.operational && typeof settings.operational === "object" ? settings.operational : {}),
        incident: {
          ...defaults.settings.operational.incident,
          ...(settings.operational?.incident && typeof settings.operational.incident === "object" ? settings.operational.incident : {}),
        },
      },
      communicationOrchestrator: { ...defaults.settings.communicationOrchestrator, ...(settings.communicationOrchestrator && typeof settings.communicationOrchestrator === "object" ? settings.communicationOrchestrator : {}) },
      telephony: { enabled: false },
      followup: { ...defaults.settings.followup, ...(settings.followup || {}) },
      autoClose: { ...defaults.settings.autoClose, ...(settings.autoClose || {}) },
      heatMinutes: { ...defaults.settings.heatMinutes, ...(settings.heatMinutes || {}) },
      branding: { ...defaults.settings.branding, ...(settings.branding || {}) },
      whatsappApi: { ...defaults.settings.whatsappApi, ...(settings.whatsappApi || {}) },
      lossReasons: Array.isArray(settings.lossReasons)
        ? settings.lossReasons
        : defaults.settings.lossReasons,
    },
    version: 24,
    branches: Array.isArray(data.branches) ? data.branches : [],
    transfers: Array.isArray(data.transfers) ? data.transfers : [],
    users: Array.isArray(data.users) ? data.users.map((user) => ({ branchId: null, permissions: { ownReports: true, branchReports: false, teamReports: false, globalReports: false, auditReports: false, ...(user.permissions || {}) }, ...user, permissions: { ownReports: true, branchReports: false, teamReports: false, globalReports: false, auditReports: false, ...(user.permissions || {}) } })) : [],
    clientLoads: Array.isArray(data.clientLoads) ? data.clientLoads : [],
    clients,
    clientDataSuggestions: Array.isArray(data.clientDataSuggestions) ? data.clientDataSuggestions.map((entry) => ({
      id: entry.id || makeId("datasuggestion"),
      dealId: cleanText(entry.dealId, 120),
      clientId: cleanText(entry.clientId, 120),
      entityType: ["client", "contact", "custom"].includes(entry.entityType) ? entry.entityType : "client",
      contactPersonId: cleanText(entry.contactPersonId, 120),
      field: cleanText(entry.field, 120),
      fieldLabel: cleanText(entry.fieldLabel, 160),
      value: entry.value,
      evidence: cleanText(entry.evidence, 600),
      confidence: Math.max(0, Math.min(100, Number(entry.confidence) || 0)),
      source: ["local", "ai", "custom"].includes(entry.source) ? entry.source : "local",
      status: ["pending", "applied", "dismissed", "superseded"].includes(entry.status) ? entry.status : "pending",
      conflict: entry.conflict === true,
      autoApplied: entry.autoApplied === true,
      previousValue: entry.previousValue ?? null,
      createdAt: entry.createdAt || timestamp(now),
      updatedAt: entry.updatedAt || entry.createdAt || timestamp(now),
      appliedAt: entry.appliedAt || null,
      appliedByUserId: entry.appliedByUserId || null,
      appliedByName: cleanText(entry.appliedByName, 120),
    })).slice(-3000) : [],
    quickReplies,
    botInstructions: Array.isArray(data.botInstructions) ? data.botInstructions.map((rule) => ({
      id: rule.id || makeId("botrule"),
      name: cleanText(rule.name, 160) || "Instrucción",
      instruction: cleanText(rule.instruction, 6000),
      active: rule.active !== false,
      order: Number(rule.order || 0),
      createdAt: rule.createdAt || timestamp(now),
      updatedAt: rule.updatedAt || timestamp(now),
    })) : [],
    customFieldDefinitions: Array.isArray(data.customFieldDefinitions) ? data.customFieldDefinitions.map((field) => ({
      id: field.id || makeId("field"),
      entity: ["contact", "deal", "product"].includes(field.entity) ? field.entity : "contact",
      key: cleanText(field.key, 80).replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
      label: cleanText(field.label, 120) || "Campo",
      type: ["text", "number", "date", "boolean", "select"].includes(field.type) ? field.type : "text",
      context: cleanText(field.context, 3000),
      options: Array.isArray(field.options) ? field.options.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 50) : [],
      botReadable: field.botReadable !== false,
      botWritable: field.botWritable === true,
      required: field.required === true,
      active: field.active !== false,
      createdAt: field.createdAt || timestamp(now),
      updatedAt: field.updatedAt || timestamp(now),
    })).filter((field) => field.key) : [],
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    surveys: Array.isArray(data.surveys) ? data.surveys : [],
    surveySessions: Array.isArray(data.surveySessions) ? data.surveySessions : [],
    communicationEvents: Array.isArray(data.communicationEvents) ? data.communicationEvents : [],
    attendanceEvents: Array.isArray(data.attendanceEvents) ? data.attendanceEvents : [],
    news: Array.isArray(data.news) ? data.news : [],
    newsReads: Array.isArray(data.newsReads) ? data.newsReads : [],
    assistantDocuments: Array.isArray(data.assistantDocuments)
      ? data.assistantDocuments.map((document) => ({
          id: document.id || makeId("document"),
          title: cleanText(document.title, 160),
          fileName: cleanText(document.fileName, 180),
          storedName: cleanText(document.storedName, 220),
          mimeType: cleanText(document.mimeType, 160),
          size: Math.max(0, Number(document.size) || 0),
          context: cleanText(document.context, 6000),
          tags: Array.isArray(document.tags) ? document.tags.map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 30) : [],
          editableTemplate: document.editableTemplate === true,
          active: document.active !== false,
          extractedText: cleanText(document.extractedText, 16000),
          createdAt: document.createdAt || timestamp(now),
          updatedAt: document.updatedAt || timestamp(now),
          createdByUserId: document.createdByUserId || null,
          createdByName: cleanText(document.createdByName, 120),
        }))
      : [],
    deals,
    products: Array.isArray(data.products) ? data.products.map((product) => ({ ...product, customFields: product.customFields && typeof product.customFields === "object" ? product.customFields : {} })) : [],
    stockMovements: Array.isArray(data.stockMovements) ? data.stockMovements : [],
    activities: Array.isArray(data.activities) ? data.activities : [],
    auditEvents: Array.isArray(data.auditEvents) ? data.auditEvents : [],
    botMessageIds: Array.isArray(data.botMessageIds) ? data.botMessageIds : [],
    processedMessageIds,
    calls: Array.isArray(data.calls) ? data.calls : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    objectives: Array.isArray(data.objectives) ? data.objectives : [],
    approvals: Array.isArray(data.approvals) ? data.approvals : [],
    aiInsightHistory: Array.isArray(data.aiInsightHistory) ? data.aiInsightHistory : [],
    customerMemories: Array.isArray(data.customerMemories) ? data.customerMemories : [],
    opportunities: Array.isArray(data.opportunities) ? data.opportunities : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    visits: Array.isArray(data.visits) ? data.visits : [],
    trainingItems: Array.isArray(data.trainingItems) ? data.trainingItems : [],
    automationDrafts: Array.isArray(data.automationDrafts) ? data.automationDrafts : [],
    automationRules: Array.isArray(data.automationRules) ? data.automationRules : [],
    automationWaits: Array.isArray(data.automationWaits) ? data.automationWaits : [],
    automationExecutions: Array.isArray(data.automationExecutions) ? data.automationExecutions : [],
    automationDelayedActions: Array.isArray(data.automationDelayedActions) ? data.automationDelayedActions : [],
    securityAlerts: Array.isArray(data.securityAlerts) ? data.securityAlerts : [],
    aiUsage: Array.isArray(data.aiUsage) ? data.aiUsage : [],
    clientAgents: Array.isArray(data.clientAgents) ? data.clientAgents : [],
    aiPromises: Array.isArray(data.aiPromises) ? data.aiPromises : [],
    aiQualityReviews: Array.isArray(data.aiQualityReviews) ? data.aiQualityReviews : [],
    aiAnomalies: Array.isArray(data.aiAnomalies) ? data.aiAnomalies : [],
    aiPredictions: Array.isArray(data.aiPredictions) ? data.aiPredictions : [],
    aiGoals: Array.isArray(data.aiGoals) ? data.aiGoals : [],
    aiExperiments: Array.isArray(data.aiExperiments) ? data.aiExperiments : [],
    aiLearningCorrections: Array.isArray(data.aiLearningCorrections) ? data.aiLearningCorrections : [],
    automationReputation: Array.isArray(data.automationReputation) ? data.automationReputation : [],
    automationTemplates: Array.isArray(data.automationTemplates) ? data.automationTemplates : [],
    executiveBriefs: Array.isArray(data.executiveBriefs) ? data.executiveBriefs : [],
    v21Orchestrations: Array.isArray(data.v21Orchestrations) ? data.v21Orchestrations : [],
    identityLinks: Array.isArray(data.identityLinks) ? data.identityLinks : [],
    intelligenceRuns: Array.isArray(data.intelligenceRuns) ? data.intelligenceRuns : [],
    communicationRequests: Array.isArray(data.communicationRequests) ? data.communicationRequests : [],
    sync: {
      ...defaults.sync,
      ...(hasSync ? {} : { lastActiveAt: legacyLastActiveAt }),
      ...(hasSync ? data.sync : {}),
    },
  };
}

export function addActivity(data, text, tone = "neutral", now = Date.now()) {
  data.activities.unshift({
    id: makeId("activity"),
    at: timestamp(now),
    text: cleanText(text, 300),
    tone,
  });
  data.activities.splice(80);
}

export function findClient(data, clientId) {
  return data.clients?.find((client) => client.id === clientId) || null;
}

export function findClientIdentity(data, { jid = "", phone = "" } = {}) {
  const targetJid = cleanText(jid, 180);
  const targetPhone = identityPhoneDigits(phone || phoneFromJid(targetJid));
  for (const client of data.clients || []) {
    if (targetJid && client.jid === targetJid) return { client, contactPerson: null, phoneRecord: (client.phones || []).find((record) => record.jid === targetJid) || null, type: "client" };
    for (const record of client.phones || []) {
      if (record.active === false) continue;
      if ((targetJid && record.jid === targetJid) || (targetPhone && identityPhoneDigits(record.phone) === targetPhone)) return { client, contactPerson: null, phoneRecord: record, type: "client" };
    }
    for (const person of client.contactPersons || []) {
      if (person.active === false) continue;
      for (const record of person.phones || []) {
        if (record.active === false) continue;
        if ((targetJid && record.jid === targetJid) || (targetPhone && identityPhoneDigits(record.phone) === targetPhone)) return { client, contactPerson: person, phoneRecord: record, type: "contact_person" };
      }
    }
    if (targetPhone && identityPhoneDigits(client.phone) === targetPhone) return { client, contactPerson: null, phoneRecord: null, type: "client" };
  }
  return null;
}

export function findClientByJid(data, jid) {
  return findClientIdentity(data, { jid })?.client || null;
}

export function ensureClient(data, { jid, name = "", branchId = null, ownerUserId = null, ownerName = "", now = Date.now() } = {}) {
  if (!Array.isArray(data.clients)) data.clients = [];
  let client = findClientIdentity(data, { jid })?.client || null;
  const at = timestamp(now);
  if (!client) {
    client = {
      id: makeId("client"),
      jid,
      phone: phoneFromJid(jid),
      name: cleanText(name, 120) || phoneFromJid(jid),
      document: "",
      ruc: "",
      email: "",
      company: "",
      city: "",
      address: "",
      age: 0,
      birthDate: "",
      jobTitle: "",
      country: "",
      neighborhood: "",
      notes: "",
      entityType: "person",
      phones: identityPhoneDigits(phoneFromJid(jid)) ? [normalizeClientPhoneRecord({ phone: phoneFromJid(jid), jid, label: "Principal", primary: true }, {}, now)] : [],
      contactPersons: [],
      branchRelationships: [],
      branchChoiceMode: "ask_when_multiple",
      preferredBranchId: null,
      tags: [],
      marketingOptIn: false,
      marketingOptInAt: null,
      customFields: {},
      branchOwners: {},
      ownerUserId: ownerUserId || null,
      ownerName: cleanText(ownerName, 120),
      createdAt: at,
      updatedAt: at,
    };
    data.clients.unshift(client);
  } else {
    if (name && (!client.name || client.name === client.phone)) client.name = cleanText(name, 120);
    if (!client.ownerUserId && ownerUserId) {
      client.ownerUserId = ownerUserId;
      client.ownerName = cleanText(ownerName, 120);
    }
    client.updatedAt = at;
  }
  if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
  if (branchId && ownerUserId) {
    client.branchOwners[branchId] = { userId: ownerUserId, userName: cleanText(ownerName, 120), updatedAt: at };
    client.ownerUserId = ownerUserId;
    client.ownerName = cleanText(ownerName, 120);
  }
  return client;
}

export function updateClient(data, clientId, input = {}, now = Date.now()) {
  const client = findClient(data, clientId);
  if (!client) throw new Error("Cliente no encontrado.");
  for (const field of ["name", "document", "ruc", "email", "company", "city", "address", "jobTitle", "country", "neighborhood", "notes"]) {
    if (typeof input[field] === "string") {
      const limits = { name: 120, document: 80, ruc: 80, email: 160, company: 160, city: 120, address: 240, jobTitle: 120, country: 120, neighborhood: 120, notes: 3000 };
      client[field] = cleanText(input[field], limits[field]);
    }
  }
  if (input.age !== undefined && input.age !== null && String(input.age).trim() !== "") client.age = Math.max(0, Math.min(120, Math.trunc(Number(input.age) || 0)));
  if (typeof input.birthDate === "string") { const value = cleanText(input.birthDate, 20); client.birthDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
  if (typeof input.entityType === "string") client.entityType = input.entityType === "company" ? "company" : "person";
  if (typeof input.branchChoiceMode === "string" && ["ask_when_multiple", "prefer_last", "never"].includes(input.branchChoiceMode)) client.branchChoiceMode = input.branchChoiceMode;
  if (Object.prototype.hasOwnProperty.call(input, "preferredBranchId")) client.preferredBranchId = cleanText(input.preferredBranchId, 120) || null;
  if (Array.isArray(input.phones)) client.phones = input.phones.map((record, index) => normalizeClientPhoneRecord(record, { label: index === 0 ? "Principal" : `Teléfono ${index + 1}`, primary: index === 0 }, now)).filter((record) => identityPhoneDigits(record.phone));
  if (Array.isArray(input.contactPersons)) client.contactPersons = input.contactPersons.map((person) => normalizeClientContactPerson(person, now)).filter((person) => person.name || person.phones.length);
  if (Array.isArray(input.branchRelationships)) client.branchRelationships = input.branchRelationships.map((relation) => normalizeClientBranchRelationship(relation, now)).filter((relation) => relation.branchId);
  if (Array.isArray(input.tags)) client.tags = input.tags.map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 20);
  if (typeof input.marketingOptIn === "boolean") {
    client.marketingOptIn = input.marketingOptIn;
    client.marketingOptInAt = input.marketingOptIn ? timestamp(now) : null;
  }
  if (input.customFields && typeof input.customFields === "object") client.customFields = { ...(client.customFields || {}), ...input.customFields };
  client.updatedAt = timestamp(now);
  for (const deal of data.deals || []) {
    if (deal.clientId !== client.id) continue;
    if (client.name) deal.name = client.name;
    deal.updatedAt = timestamp(now);
  }
  return client;
}

export function findOpenDeal(data, jid, branchId = null, lineId = null) {
  return data.deals
    .filter((deal) => deal.jid === jid && OPEN_STAGES.has(deal.stage) && (!branchId || deal.branchId === branchId) && (!lineId || deal.lineId === lineId))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
}

export function findDeal(data, dealId) {
  return data.deals.find((deal) => deal.id === dealId) || null;
}

export function createDeal(data, {
  jid,
  name = "",
  text = "",
  branchId = null,
  source = "whatsapp",
  lineId = null,
  now = Date.now(),
} = {}) {
  const at = timestamp(now);
  const identity = findClientIdentity(data, { jid });
  const existingClient = identity?.client || null;
  const previousOwner = data.deals
    .filter((entry) => (existingClient ? entry.clientId === existingClient.id : entry.jid === jid) && entry.ownerUserId && (!branchId || entry.branchId === branchId))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  const branchOwner = branchId && existingClient?.branchOwners?.[branchId] ? existingClient.branchOwners[branchId] : null;
  const client = ensureClient(data, {
    jid,
    name,
    branchId,
    ownerUserId: branchOwner?.userId || previousOwner?.ownerUserId || null,
    ownerName: branchOwner?.userName || previousOwner?.ownerName || "",
    now,
  });
  const selectedOwnerUserId = branchId ? (branchOwner?.userId || previousOwner?.ownerUserId || null) : (client.ownerUserId || previousOwner?.ownerUserId || null);
  const selectedOwnerName = branchId ? (branchOwner?.userName || previousOwner?.ownerName || "") : (client.ownerName || previousOwner?.ownerName || "");
  const deal = {
    id: makeId("deal"),
    clientId: client.id,
    branchId,
    lineId: lineId || null,
    jid,
    phone: phoneFromJid(jid) !== "Sin número" ? phoneFromJid(jid) : (identity?.phoneRecord?.phone || client.phone || "Sin número"),
    name: client.name || cleanText(name, 120) || phoneFromJid(jid),
    contactPersonId: identity?.contactPerson?.id || null,
    contactPersonName: identity?.contactPerson?.name || "",
    contactRole: identity?.contactPerson?.role || "",
    identityType: identity?.contactPerson ? "contact_person" : "client",
    ownerUserId: selectedOwnerUserId,
    ownerName: selectedOwnerName,
    source,
    createdByUserId: null,
    stage: STAGES.NEW,
    botActive: true,
    botHumanHandoff: false,
    botMode: "auto",
    botPauseReason: "",
    botHandoffAt: null,
    botHandoffByUserId: null,
    botHandoffByName: "",
    createdAt: at,
    updatedAt: at,
    lastClientAt: text ? at : null,
    lastAgentAt: null,
    waitingSince: null,
    lastMessage: cleanText(text, 500),
    lastDirection: text ? "incoming" : null,
    followupSentAt: null,
    outcomeAt: null,
    lossReasonId: null,
    lossReasonName: null,
    transferredFromBranchId: null,
    transferredToBranchId: null,
    transferredAt: null,
    transferredByUserId: null,
    transferredByName: "",
    transferHistory: [],
    customFields: {},
    campaignSourceIds: [],
    commercialStatusId: "new_inquiry",
    commercialStatusLabel: "Consulta nueva",
    commercialStatusSource: "ai",
    commercialStatusConfidence: 70,
    commercialStatusManual: false,
    commercialStatusUpdatedAt: at,
    coverageRequired: false,
    coverageReason: "",
    items: [],
    messages: [],
  };
  data.deals.unshift(deal);
  return deal;
}

function trackMessageId(data, messageId) {
  if (!messageId || data.processedMessageIds.includes(messageId)) return;
  data.processedMessageIds.push(messageId);
  if (data.processedMessageIds.length > 5000) {
    data.processedMessageIds.splice(0, data.processedMessageIds.length - 5000);
  }
}

function pushMessage(data, deal, {
  direction,
  text,
  origin,
  messageId,
  attachment = null,
  historical = false,
  agentUserId = null,
  agentName = "",
  now = Date.now(),
}) {
  const at = timestamp(now);
  deal.messages.push({
    id: messageId || makeId("message"),
    direction,
    origin,
    text: cleanText(text, 6000),
    at,
    attachment: attachment && typeof attachment === "object" ? attachment : null,
    historical: Boolean(historical),
    agentUserId: agentUserId || null,
    agentName: cleanText(agentName, 120),
  });
  trackMessageId(data, messageId);
  if (deal.messages.length > 300) deal.messages.splice(0, deal.messages.length - 300);
  deal.updatedAt = at;
  deal.lastMessage = cleanText(text, 500);
  deal.lastDirection = direction;
  return at;
}

export function recordIncoming(data, {
  jid,
  name = "",
  text,
  messageId,
  attachment = null,
  historical = false,
  branchId = null,
  lineId = null,
  now = Date.now(),
} = {}) {
  let deal = findOpenDeal(data, jid, branchId, lineId);
  let created = false;
  if (!deal) {
    deal = createDeal(data, { jid, name, text, branchId, lineId, now });
    created = true;
  } else if (name && (!deal.name || deal.name === deal.phone)) {
    deal.name = cleanText(name, 120);
  }
  const client = ensureClient(data, { jid, name: deal.name || name, branchId: deal.branchId || branchId, ownerUserId: deal.ownerUserId, ownerName: deal.ownerName, now });
  deal.clientId = client.id;
  const identity = findClientIdentity(data, { jid });
  if (identity?.contactPerson) {
    deal.contactPersonId = identity.contactPerson.id;
    deal.contactPersonName = identity.contactPerson.name;
    deal.contactRole = identity.contactPerson.role || "";
    deal.identityType = "contact_person";
  }
  const at = pushMessage(data, deal, {
    direction: "incoming",
    origin: "client",
    text,
    messageId,
    attachment,
    historical,
    now,
  });
  deal.lastClientAt = at;
  deal.followupSentAt = null;
  if (!created && deal.stage === STAGES.CONTACTED) {
    deal.stage = STAGES.WAITING;
    deal.waitingSince = at;
  } else if (deal.stage === STAGES.WAITING) {
    deal.waitingSince = deal.waitingSince || at;
  }
  return { deal, created };
}

export function recordHumanOutgoing(data, {
  jid,
  name = "",
  text,
  messageId,
  attachment = null,
  userId = null,
  userName = "",
  branchId = null,
  lineId = null,
  now = Date.now(),
} = {}) {
  let deal = findOpenDeal(data, jid, branchId, lineId);
  if (!deal) deal = createDeal(data, { jid, name, branchId, lineId, now });
  const at = pushMessage(data, deal, {
    direction: "outgoing",
    origin: "human",
    text,
    messageId,
    attachment,
    agentUserId: userId,
    agentName: userName,
    now,
  });
  if (!deal.ownerUserId && userId) {
    deal.ownerUserId = userId;
    deal.ownerName = cleanText(userName, 120) || "Asesor";
  }
  const client = ensureClient(data, { jid, name: deal.name || name, branchId: deal.branchId || branchId, ownerUserId: deal.ownerUserId, ownerName: deal.ownerName, now });
  deal.clientId = client.id;
  if (deal.ownerUserId) {
    client.ownerUserId = deal.ownerUserId; client.ownerName = deal.ownerName; client.updatedAt = timestamp(now);
    if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
    if (deal.branchId) client.branchOwners[deal.branchId] = { userId: deal.ownerUserId, userName: deal.ownerName, updatedAt: timestamp(now) };
  }
  deal.stage = STAGES.CONTACTED;
  // Handoff humano persistente: desde la primera intervención humana el bot automático
  // deja de participar hasta que un usuario lo reactive explícitamente.
  deal.botActive = false;
  deal.botHumanHandoff = true;
  deal.botMode = "copilot";
  deal.botPauseReason = "human_takeover";
  deal.botHandoffAt = at;
  deal.botHandoffByUserId = userId || deal.ownerUserId || null;
  deal.botHandoffByName = cleanText(userName, 120) || deal.ownerName || "Asesor";
  deal.lastAgentAt = at;
  deal.waitingSince = null;
  deal.followupSentAt = null;
  return deal;
}

export function recordBotOutgoing(data, {
  deal,
  text,
  messageId,
  origin = "bot",
  now = Date.now(),
} = {}) {
  const at = pushMessage(data, deal, {
    direction: "outgoing",
    origin,
    text,
    messageId,
    now,
  });
  if (messageId) {
    data.botMessageIds.push(messageId);
    if (data.botMessageIds.length > 800) data.botMessageIds.splice(0, data.botMessageIds.length - 800);
  }
  return at;
}

export function recordCall(data, input = {}, now = Date.now()) {
  const callId = cleanText(input.id, 160) || makeId("call");
  let call = data.calls.find((entry) => entry.id === callId);
  const jid = cleanText(input.jid || input.chatId || input.from, 180);
  const requestedBranchId = cleanText(input.branchId, 120) || null;
  const deal = jid ? findOpenDeal(data, jid, requestedBranchId) : null;
  const branchId = requestedBranchId || deal?.branchId || null;
  const occurredAt = input.date ? timestamp(input.date) : timestamp(now);
  const status = cleanText(input.status, 40) || "offer";
  const base = {
    jid,
    branchId,
    clientId: cleanText(input.clientId, 120) || deal?.clientId || null,
    dealId: cleanText(input.dealId, 120) || deal?.id || null,
    phone: cleanText(input.phone, 40) || deal?.phone || phoneFromJid(jid),
    name: cleanText(input.name, 160) || deal?.name || phoneFromJid(jid),
    ownerUserId: cleanText(input.ownerUserId, 120) || deal?.ownerUserId || null,
    ownerName: cleanText(input.ownerName, 160) || deal?.ownerName || "",
    answeredByUserId: cleanText(input.answeredByUserId, 120) || null,
    answeredByName: cleanText(input.answeredByName, 160) || "",
    provider: cleanText(input.provider, 40) || "whatsapp",
    direction: input.direction === "outgoing" ? "outgoing" : "incoming",
    status,
    isVideo: Boolean(input.isVideo),
    isGroup: Boolean(input.isGroup),
    updatedAt: occurredAt,
  };
  if (!call) {
    call = {
      id: callId,
      ...base,
      startedAt: occurredAt,
      endedAt: ["timeout", "terminate", "reject", "accept"].includes(status)
        ? occurredAt
        : null,
      link: cleanText(input.link, 500) || null,
    };
    data.calls.unshift(call);
  } else {
    const preserved = {
      answeredByUserId: input.answeredByUserId === undefined ? call.answeredByUserId : base.answeredByUserId,
      answeredByName: input.answeredByName === undefined ? call.answeredByName : base.answeredByName,
      ownerUserId: input.ownerUserId === undefined ? (call.ownerUserId || base.ownerUserId) : base.ownerUserId,
      ownerName: input.ownerName === undefined ? (call.ownerName || base.ownerName) : base.ownerName,
    };
    Object.assign(call, base, preserved);
    if (["timeout", "terminate", "reject", "accept", "failed"].includes(status)) {
      call.endedAt = occurredAt;
    }
    if (input.link) call.link = cleanText(input.link, 500);
  }
  data.calls.splice(500);
  return call;
}

export function waitingHeat(deal, settings, now = Date.now()) {
  if (deal.stage !== STAGES.WAITING || !deal.waitingSince) {
    return { level: "none", minutes: 0 };
  }
  const elapsed = Math.max(0, (now - Date.parse(deal.waitingSince)) / 60000);
  const heat = settings.heatMinutes || {};
  if (elapsed >= Number(heat.critical || 120)) return { level: "critical", minutes: elapsed };
  if (elapsed >= Number(heat.red || 60)) return { level: "red", minutes: elapsed };
  if (elapsed >= Number(heat.hot || 30)) return { level: "hot", minutes: elapsed };
  if (elapsed >= Number(heat.warm || 15)) return { level: "warm", minutes: elapsed };
  return { level: "fresh", minutes: elapsed };
}

export function upsertProduct(data, input, now = Date.now()) {
  const id = cleanText(input.id, 100);
  let product = id ? data.products.find((item) => item.id === id) : null;
  const name = cleanText(input.name, 160);
  const sku = cleanText(input.sku, 80);
  if (!name) throw new Error("Ingresá el nombre del producto.");
  if (!sku) throw new Error("Ingresá un código de producto.");
  if (data.products.some((item) => item.sku.toLowerCase() === sku.toLowerCase() && item.id !== id)) {
    throw new Error("Ya existe un producto con ese código.");
  }
  const available = Math.max(0, Math.trunc(Number(input.available) || 0));
  const base = {
    sku,
    name,
    description: cleanText(input.description, 500),
    available,
    reserved: 0,
    price: Math.max(0, Number(input.price) || 0),
    minStock: Math.max(0, Math.trunc(Number(input.minStock) || 0)),
    active: input.active !== false,
    customFields: input.customFields && typeof input.customFields === "object" ? input.customFields : (product?.customFields || {}),
    updatedAt: timestamp(now),
  };
  if (!product) {
    product = { id: makeId("product"), ...base, createdAt: timestamp(now) };
    data.products.push(product);
    addStockMovement(data, product, null, "initial", available, 0, available, "Stock inicial", now);
  } else {
    const previous = product.available;
    Object.assign(product, base, { reserved: product.reserved || 0 });
    if (previous !== available) {
      addStockMovement(
        data,
        product,
        null,
        "adjustment",
        available - previous,
        previous,
        available,
        "Ajuste manual",
        now,
      );
    }
  }
  return product;
}

function addStockMovement(data, product, dealId, type, quantity, before, after, note, now = Date.now()) {
  data.stockMovements.unshift({
    id: makeId("movement"),
    productId: product.id,
    productName: product.name,
    dealId,
    type,
    quantity,
    before,
    after,
    note: cleanText(note, 240),
    at: timestamp(now),
  });
  data.stockMovements.splice(1000);
}

export function adjustStock(data, productId, quantity, note = "Ajuste manual", now = Date.now()) {
  const product = data.products.find((item) => item.id === productId);
  if (!product) throw new Error("Producto no encontrado.");
  const delta = Math.trunc(Number(quantity) || 0);
  if (!delta) throw new Error("Ingresá una cantidad distinta de cero.");
  const before = product.available;
  const after = before + delta;
  if (after < 0) throw new Error("El stock disponible no puede quedar negativo.");
  product.available = after;
  product.updatedAt = timestamp(now);
  addStockMovement(data, product, null, "adjustment", delta, before, after, note, now);
  return product;
}

export function reserveProduct(data, dealId, productId, quantity, source = "manual", now = Date.now()) {
  const deal = findDeal(data, dealId);
  if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("La negociación no está abierta.");
  const product = data.products.find((item) => item.id === productId && item.active !== false);
  if (!product) throw new Error("Producto no encontrado.");
  const qty = Math.max(1, Math.trunc(Number(quantity) || 0));
  if (product.available < qty) throw new Error(`Stock insuficiente: quedan ${product.available}.`);
  const existing = deal.items.find((item) => item.productId === productId && item.status === "reserved");
  const before = product.available;
  product.available -= qty;
  product.reserved = (product.reserved || 0) + qty;
  product.updatedAt = timestamp(now);
  if (existing) {
    existing.quantity += qty;
    existing.updatedAt = timestamp(now);
  } else {
    deal.items.push({
      id: makeId("item"),
      productId,
      sku: product.sku,
      name: product.name,
      quantity: qty,
      unitPrice: product.price || 0,
      status: "reserved",
      source,
      createdAt: timestamp(now),
      updatedAt: timestamp(now),
    });
  }
  deal.updatedAt = timestamp(now);
  addStockMovement(data, product, deal.id, "reserve", -qty, before, product.available, `Reserva ${source}`, now);
  return { deal, product };
}

export function releaseDealReservations(data, deal, reason = "Reserva cancelada", now = Date.now()) {
  for (const item of deal.items || []) {
    if (item.status !== "reserved") continue;
    const product = data.products.find((entry) => entry.id === item.productId);
    if (product) {
      const before = product.available;
      product.available += item.quantity;
      product.reserved = Math.max(0, (product.reserved || 0) - item.quantity);
      product.updatedAt = timestamp(now);
      addStockMovement(data, product, deal.id, "release", item.quantity, before, product.available, reason, now);
    }
    item.status = "released";
    item.updatedAt = timestamp(now);
  }
}

export function removeReservedItem(data, dealId, itemId, now = Date.now()) {
  const deal = findDeal(data, dealId);
  if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("La negociación no está abierta.");
  const item = deal.items.find((entry) => entry.id === itemId);
  if (!item || item.status !== "reserved") throw new Error("Reserva no encontrada.");
  const product = data.products.find((entry) => entry.id === item.productId);
  if (product) {
    const before = product.available;
    product.available += item.quantity;
    product.reserved = Math.max(0, (product.reserved || 0) - item.quantity);
    product.updatedAt = timestamp(now);
    addStockMovement(data, product, deal.id, "release", item.quantity, before, product.available, "Reserva eliminada", now);
  }
  item.status = "released";
  item.updatedAt = timestamp(now);
  deal.updatedAt = timestamp(now);
  return deal;
}

export function closeWon(data, dealId, now = Date.now()) {
  const deal = findDeal(data, dealId);
  if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("La negociación no está abierta.");
  for (const item of deal.items || []) {
    if (item.status !== "reserved") continue;
    const product = data.products.find((entry) => entry.id === item.productId);
    if (product) {
      product.reserved = Math.max(0, (product.reserved || 0) - item.quantity);
      product.updatedAt = timestamp(now);
      addStockMovement(data, product, deal.id, "sale", -item.quantity, product.available, product.available, "Venta confirmada", now);
    }
    item.status = "sold";
    item.updatedAt = timestamp(now);
  }
  deal.stage = STAGES.WON;
  deal.outcomeAt = timestamp(now);
  deal.updatedAt = timestamp(now);
  deal.waitingSince = null;
  deal.botActive = false;
  return deal;
}

export function closeLost(data, dealId, reasonId, now = Date.now()) {
  const deal = findDeal(data, dealId);
  if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("La negociación no está abierta.");
  const reason = data.settings.lossReasons.find((entry) => entry.id === reasonId);
  if (!reason) throw new Error("Seleccioná un motivo de cierre.");
  releaseDealReservations(data, deal, `Cierre perdido: ${reason.name}`, now);
  deal.stage = STAGES.LOST;
  deal.outcomeAt = timestamp(now);
  deal.updatedAt = timestamp(now);
  deal.waitingSince = null;
  deal.botActive = false;
  deal.lossReasonId = reason.id;
  deal.lossReasonName = reason.name;
  return deal;
}

export function automationActions(data, now = Date.now()) {
  const actions = [];
  const settings = data.settings;
  const followupMs = minutes(settings.followup.value, settings.followup.unit) * 60000;
  const closeMs = minutes(settings.autoClose.value, settings.autoClose.unit) * 60000;
  for (const deal of data.deals) {
    if (deal.stage !== STAGES.CONTACTED || !deal.lastAgentAt) continue;
    const elapsed = now - Date.parse(deal.lastAgentAt);
    if (
      settings.autoClose.enabled &&
      closeMs > 0 &&
      elapsed >= closeMs
    ) {
      actions.push({ type: "close", dealId: deal.id });
      continue;
    }
    if (
      settings.followup.enabled &&
      followupMs > 0 &&
      elapsed >= followupMs &&
      !deal.followupSentAt
    ) {
      actions.push({ type: "followup", dealId: deal.id });
    }
  }
  return actions;
}

export function findProductByQuery(data, query) {
  const value = cleanText(query, 160).toLowerCase();
  if (!value) return [];
  return data.products
    .filter((product) => product.active !== false)
    .filter(
      (product) =>
        product.sku.toLowerCase().includes(value) ||
        product.name.toLowerCase().includes(value) ||
        product.description.toLowerCase().includes(value),
    )
    .slice(0, 8);
}

export function publicData(data, now = Date.now()) {
  return {
    settings: {
      ...data.settings,
      apiKey: undefined,
      passwordHash: undefined,
      whatsappApi: {
        ...data.settings.whatsappApi,
        accessToken: undefined,
        verifyToken: undefined,
        hasAccessToken: Boolean(data.settings.whatsappApi?.accessToken),
        hasVerifyToken: Boolean(data.settings.whatsappApi?.verifyToken),
      },
      telephony: undefined,
      whatsappCalls: { ...(data.settings.whatsappCalls || {}) },
      hasApiKey: Boolean(data.settings.apiKey),
    },
    branches: data.branches || [],
    transfers: (data.transfers || []).slice(0, 500),
    clients: data.clients || [],
    quickReplies: (data.quickReplies || []).slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    botInstructions: (data.botInstructions || []).slice(),
    customFieldDefinitions: (data.customFieldDefinitions || []).slice(),
    campaigns: (data.campaigns || []).slice(0, 250).map((campaign) => ({
      ...campaign,
      recipients: (campaign.recipients || []).slice(0, 5000),
    })),
    attendanceEvents: (data.attendanceEvents || []).slice(0, 500),
    news: [],
    newsReads: [],
    assistantDocuments: (data.assistantDocuments || []).filter((document) => document.active !== false).map((document) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      mimeType: document.mimeType,
      size: document.size,
      context: document.context,
      tags: document.tags || [],
      editableTemplate: document.editableTemplate === true,
      active: document.active !== false,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      createdByName: document.createdByName || "",
      downloadUrl: `/api/assistant/documents/${encodeURIComponent(document.id)}/file`,
    })),
    deals: data.deals.map((deal) => ({
      ...deal,
      messages: (deal.messages || []).map((message) => ({
        ...message,
        attachment: message.attachment
          ? {
              id: message.attachment.id,
              kind: message.attachment.kind,
              fileName: message.attachment.fileName,
              mimeType: message.attachment.mimeType,
              size: message.attachment.size,
              duration: message.attachment.duration,
              available: message.attachment.available !== false,
              url: message.attachment.available !== false
                ? `/api/media/${encodeURIComponent(message.attachment.id)}`
                : null,
            }
          : null,
      })),
      heat: waitingHeat(deal, data.settings, now),
    })),
    products: data.products,
    stockMovements: data.stockMovements.slice(0, 200),
    activities: data.activities.slice(0, 50),
    calls: data.calls.slice(0, 100),
    sync: data.sync,
  };
}
