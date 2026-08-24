import { spawn } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { access, appendFile, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import express from "express";
import QRCode from "qrcode";
import pino from "pino";

import {
  OPEN_STAGES,
  STAGES,
  addActivity,
  adjustStock,
  automationActions,
  cleanText,
  closeLost,
  createDeal,
  closeWon,
  findClient,
  findClientIdentity,
  findDeal,
  findOpenDeal,
  findProductByQuery,
  makeId,
  normalizeData,
  publicData,
  recordCall,
  recordBotOutgoing,
  recordHumanOutgoing,
  recordIncoming,
  releaseDealReservations,
  removeReservedItem,
  reserveProduct,
  timestamp,
  updateClient,
  upsertProduct,
} from "./lib/domain.mjs";
import { buildReports } from "./lib/reports.mjs";
import { JsonStore } from "./lib/store.mjs";
import { createStoredZip, listFilesRecursive, parseStoredZip } from "./lib/backup-zip.mjs";
import { automationConditionsMatch, interpolate as automationInterpolate, localParseInstruction, normalizeStage as automationNormalizeStage, replyBranch as automationReplyBranch, ruleMatchesEvent, sanitizeActions as sanitizeAutomationActions, sanitizeRule as sanitizeAutomationRule, summarizeRule as summarizeAutomationRule } from "./lib/super-automation.mjs";
import { installV22Platform } from "./lib/v22-platform.mjs";

const currentFile = fileURLToPath(import.meta.url);
const appDirectory = path.dirname(currentFile);
const publicDirectory = path.join(appDirectory, "public");
const dataDirectory = process.env.WHATSBOT_DATA_DIR
  ? path.resolve(process.env.WHATSBOT_DATA_DIR)
  : path.join(appDirectory, "data");
const authDirectory = path.join(dataDirectory, "whatsapp-session");
const branchAuthRoot = path.join(dataDirectory, "whatsapp-branches");
const lineAuthRoot = path.join(dataDirectory, "whatsapp-lines");
const mediaDirectory = path.join(dataDirectory, "media");
const assistantDocumentsDirectory = path.join(dataDirectory, "assistant-documents");
const newsMediaDirectory = path.join(dataDirectory, "news-media");
const databasePath = path.join(dataDirectory, "whatsbot-crm.json");
const port = Number.parseInt(process.env.PORT || "3030", 10);
const host = process.env.WHATSBOT_HOST || "0.0.0.0";
const mockMode = process.env.WHATSAPP_MOCK === "1";
const tenantSlug = cleanTenantSlug(process.env.CRM_TENANT_SLUG || "main");
const publicBaseUrl = String(process.env.CRM_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
function cleanTenantSlug(value){ return String(value||"main").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0,80) || "main"; }
const maximumMediaBytes = 64 * 1024 * 1024;
const whatsappLogger = pino({ level: "silent" });

const store = new JsonStore(databasePath);
await store.load();
const data = store.data;
const initialAdminPasswordHash = "7bf3f828f2da9830f7817c4e5e719c1a:61464159a9ece0d5397ea31ddb7b401d12c0d38d22bc17c7691648db0eb2411a96ac6fab8a4fc7e08bc8017fdad2b18feebf07d98ad557343879be90e34557e7";

if (!Array.isArray(data.users)) data.users = [];
if (!Array.isArray(data.clientLoads)) data.clientLoads = [];
if (!Array.isArray(data.auditEvents)) data.auditEvents = [];
if (!Array.isArray(data.assistantDocuments)) data.assistantDocuments = [];
if (!Array.isArray(data.botInstructions)) data.botInstructions = [];
if (!Array.isArray(data.customFieldDefinitions)) data.customFieldDefinitions = [];
if (!Array.isArray(data.campaigns)) data.campaigns = [];
if (!Array.isArray(data.surveys)) data.surveys = [];
if (!Array.isArray(data.surveySessions)) data.surveySessions = [];
if (!Array.isArray(data.communicationEvents)) data.communicationEvents = [];
if (!Array.isArray(data.attendanceEvents)) data.attendanceEvents = [];
if (!Array.isArray(data.news)) data.news = [];
if (!Array.isArray(data.newsReads)) data.newsReads = [];
if (!Array.isArray(data.tasks)) data.tasks = [];
if (!Array.isArray(data.objectives)) data.objectives = [];
if (!Array.isArray(data.approvals)) data.approvals = [];
if (!Array.isArray(data.aiInsightHistory)) data.aiInsightHistory = [];
if (!Array.isArray(data.customerMemories)) data.customerMemories = [];
if (!Array.isArray(data.opportunities)) data.opportunities = [];
if (!Array.isArray(data.orders)) data.orders = [];
if (!Array.isArray(data.visits)) data.visits = [];
if (!Array.isArray(data.trainingItems)) data.trainingItems = [];
if (!Array.isArray(data.automationDrafts)) data.automationDrafts = [];
if (!Array.isArray(data.automationRules)) data.automationRules = [];
if (!Array.isArray(data.automationWaits)) data.automationWaits = [];
if (!Array.isArray(data.automationExecutions)) data.automationExecutions = [];
if (!Array.isArray(data.automationDelayedActions)) data.automationDelayedActions = [];
if (!Array.isArray(data.securityAlerts)) data.securityAlerts = [];
if (!Array.isArray(data.aiUsage)) data.aiUsage = [];
if (!Array.isArray(data.whatsappLines)) data.whatsappLines = [];
if (!Array.isArray(data.automationSubflows)) data.automationSubflows = [];
if (!Array.isArray(data.automationMemory)) data.automationMemory = [];
if (!Array.isArray(data.crmFlows)) data.crmFlows = [];
if (!Array.isArray(data.customModules)) data.customModules = [];
if (!Array.isArray(data.customModuleRecords)) data.customModuleRecords = [];
if (!Array.isArray(data.dashboardDefinitions)) data.dashboardDefinitions = [];
if (!Array.isArray(data.roleProfiles)) data.roleProfiles = [];
if (!Array.isArray(data.aiPolicies)) data.aiPolicies = [];
if (!Array.isArray(data.configurationVersions)) data.configurationVersions = [];
if (!Array.isArray(data.superAdminFindings)) data.superAdminFindings = [];
if (!Array.isArray(data.superAdminPending)) data.superAdminPending = [];
if (!Array.isArray(data.clientAgents)) data.clientAgents = [];
if (!Array.isArray(data.clientDataSuggestions)) data.clientDataSuggestions = [];
if (!Array.isArray(data.aiPromises)) data.aiPromises = [];
if (!Array.isArray(data.aiQualityReviews)) data.aiQualityReviews = [];
if (!Array.isArray(data.aiAnomalies)) data.aiAnomalies = [];
if (!Array.isArray(data.aiPredictions)) data.aiPredictions = [];
if (!Array.isArray(data.aiGoals)) data.aiGoals = [];
if (!Array.isArray(data.aiExperiments)) data.aiExperiments = [];
if (!Array.isArray(data.aiLearningCorrections)) data.aiLearningCorrections = [];
if (!Array.isArray(data.automationReputation)) data.automationReputation = [];
if (!Array.isArray(data.automationTemplates)) data.automationTemplates = [];
if (!Array.isArray(data.executiveBriefs)) data.executiveBriefs = [];
if (!Array.isArray(data.v21Orchestrations)) data.v21Orchestrations = [];
if (!Array.isArray(data.identityLinks)) data.identityLinks = [];
if (!Array.isArray(data.intelligenceRuns)) data.intelligenceRuns = [];
if (!data.settings.clientIdentity || typeof data.settings.clientIdentity !== 'object') data.settings.clientIdentity = {};
data.settings.clientIdentity = { branchPromptEnabled:true, promptOnlyAfterPurchases:true, includeCurrentBranchInSelector:false, autoTransferOnChoice:true, preserveContactContext:true, ...data.settings.clientIdentity };
if (!data.settings.v21Intelligence || typeof data.settings.v21Intelligence !== 'object') data.settings.v21Intelligence = {};
data.settings.v21Intelligence = { enabled:true, proactiveScan:true, scanIntervalMinutes:15, observerMode:true, learningEnabled:true, autoPromiseDetection:true, qualityReviewEnabled:true, predictionEnabled:true, maxAutoClientChanges:50, maxAutoRulesPerDay:5, forbidDestructiveActions:true, minimumConfidenceForAuto:90, ...data.settings.v21Intelligence };

const MODULE_DEFAULTS = {
  crm: true, whatsapp: true, branches: true, attendance: true, stock: true,
  replies: true, documents: true, campaigns: true, surveys: true, forms: true, news: true, reports: true,
  data: true, settings: true, aiCenter: true, productivity: true, tasks: true,
  approvals: true, objectives: true, alerts: true, customFields: true,
  botAutomation: true, customer360: true, audit: true, globalSearch: true,
  quality: true, knowledge: true, forecasting: true, goals: true,
  advancedSuite: true, commandCenter: true, opportunities: true, orders: true, visits: true, academy: true, security: true, automationLab: true, wallboard: true, portal: true, relationships: true, documentIntelligence: true, aiGovernance: true, adminGuide: true, superAdmin: true, intelligenceCenter: true, autonomousGoals: true, digitalTwin: true, experimentation: true, automationMarketplace: true,
};
const AI_FEATURE_DEFAULTS = {
  copilotReply: true, nextBestAction: true, customerSummary: true,
  dataExtraction: true, askCrm: true, rewrite: true, translation: true,
  sentiment: true, urgency: true, missingData: true, objectionCoach: true,
  crossSell: true, closeProbability: true, commitments: true,
  qualityScoring: true, riskDetection: true, knowledgeAssistant: true,
  documentGenerator: true, salesCoach: true, autoTags: true,
  conversationSummary: true, managementBrief: true, duplicateDetection: true,
  smartAssignment: true, churnRisk: true, forecasting: true,
  specializedAgents: true, shadowAgent: true, naturalActions: true, automationGenerator: true, automationSimulator: true, semanticSearch: true, customerMemory: true, contradictionCheck: true, audioTranscription: true, advancedSentiment: true, riskRadar: true, opportunityMining: true, nextBestOffer: true, reactivation: true, academyCoach: true, predictiveAlerts: true, relationshipMap: true, documentIntelligence: true, visionCapture: true, anomalyDetection: true, auditAssistant: true, costControl: true, modelRouting: true, usageOptimizer: true, personalizedUi: true, autonomyLevels: true, morningBrief: true, endOfDayBrief: true, semanticDuplicates: true, quoteAssistant: true, deliveryAssistant: true, visitAssistant: true, adminDesigner: true, automationDebugger: true, supervisorAi: true, clientAgent: true, promiseDetection: true, aiEvaluator: true, digitalTwin: true, goalAutopilot: true, experimentation: true, automationReputation: true, organizationMemory: true, callIntelligence: true, identityResolution: true,
};
const EXPERIENCE_DEFAULTS = {
  motionLevel: "full", density: "comfortable", pageTransitions: true, messageMotion: true,
  cardMotion: true, counterMotion: true, chartMotion: true, aiMotion: true, weatherMotion: true,
  attentionMotion: true, buttonMotion: true, toastMotion: true, progressBar: true,
  liveActivity: true, successBurst: true, skeletons: true, ambientBackground: true,
  hoverLift: true, autoPerformance: true, pauseWhenHidden: true, dialogMotion: true,
  sidebarMotion: true, stockMotion: true, newsMotion: true, presenceMotion: true,
};
if (!data.settings.modules || typeof data.settings.modules !== "object") data.settings.modules = {};
data.settings.modules = { ...MODULE_DEFAULTS, ...data.settings.modules, settings: true };
if (!data.settings.aiFeatures || typeof data.settings.aiFeatures !== "object") data.settings.aiFeatures = {};
data.settings.aiFeatures = { ...AI_FEATURE_DEFAULTS, ...data.settings.aiFeatures };
if (!data.settings.aiSuite || typeof data.settings.aiSuite !== "object") data.settings.aiSuite = {};
data.settings.aiSuite = {
  enabled: data.settings.aiSuite.enabled !== false,
  proactive: data.settings.aiSuite.proactive !== false,
  confidenceThreshold: Math.min(100, Math.max(40, Number(data.settings.aiSuite.confidenceThreshold) || 70)),
  maxContextMessages: Math.min(50, Math.max(6, Number(data.settings.aiSuite.maxContextMessages) || 20)),
  allowAutoFieldUpdates: data.settings.aiSuite.allowAutoFieldUpdates !== false,
  allowAutoTags: data.settings.aiSuite.allowAutoTags === true,
  requireHumanApprovalForExternalActions: data.settings.aiSuite.requireHumanApprovalForExternalActions !== false,
};
if (!data.settings.experience || typeof data.settings.experience !== "object") data.settings.experience = {};
data.settings.experience = {
  ...EXPERIENCE_DEFAULTS,
  ...data.settings.experience,
  motionLevel: ["off", "soft", "full"].includes(data.settings.experience.motionLevel) ? data.settings.experience.motionLevel : "full",
  density: ["comfortable", "compact"].includes(data.settings.experience.density) ? data.settings.experience.density : "comfortable",
};
for (const key of Object.keys(EXPERIENCE_DEFAULTS)) {
  if (["motionLevel", "density"].includes(key)) continue;
  data.settings.experience[key] = data.settings.experience[key] !== false;
}

if (!data.settings.adminGuide || typeof data.settings.adminGuide !== "object") data.settings.adminGuide = {};
data.settings.adminGuide = { enabled: data.settings.adminGuide.enabled !== false, contextualTips: data.settings.adminGuide.contextualTips !== false, showExamples: data.settings.adminGuide.showExamples !== false, showBestPractices: data.settings.adminGuide.showBestPractices !== false };
if (!data.settings.aiGovernance || typeof data.settings.aiGovernance !== "object") data.settings.aiGovernance = {};
data.settings.aiGovernance = { autonomyDefault: Math.min(5,Math.max(0,Number(data.settings.aiGovernance.autonomyDefault)||3)), maxExternalAutonomy: Math.min(5,Math.max(0,Number(data.settings.aiGovernance.maxExternalAutonomy)||3)), requireApprovalAboveAmount: Math.max(0,Number(data.settings.aiGovernance.requireApprovalAboveAmount)||0), monthlyBudgetUsd: Math.max(0,Number(data.settings.aiGovernance.monthlyBudgetUsd)||0), modelRouting: data.settings.aiGovernance.modelRouting !== false, logAllAiActions: data.settings.aiGovernance.logAllAiActions !== false };
if (!data.settings.superAutomation || typeof data.settings.superAutomation !== "object") data.settings.superAutomation = {};
data.settings.superAutomation = { enabled: data.settings.superAutomation.enabled !== false, executeDirectly: data.settings.superAutomation.executeDirectly !== false, silentByDefault: data.settings.superAutomation.silentByDefault !== false, maxChainDepth: Math.min(20,Math.max(3,Number(data.settings.superAutomation.maxChainDepth)||10)), defaultReplyTimeoutMinutes: Math.min(525600,Math.max(1,Number(data.settings.superAutomation.defaultReplyTimeoutMinutes)||60)), logExecutions: data.settings.superAutomation.logExecutions !== false };
if (!data.settings.superAdmin || typeof data.settings.superAdmin !== "object") data.settings.superAdmin = {};
if (!data.settings.superAdmin.powerPolicy || typeof data.settings.superAdmin.powerPolicy !== "object") data.settings.superAdmin.powerPolicy = {};
data.settings.superAdmin = {
  supervisorEnabled: data.settings.superAdmin.supervisorEnabled !== false,
  autoRepairLowRisk: data.settings.superAdmin.autoRepairLowRisk === true,
  versioningEnabled: data.settings.superAdmin.versioningEnabled !== false,
  supervisorIntervalMinutes: Math.min(1440,Math.max(5,Number(data.settings.superAdmin.supervisorIntervalMinutes)||15)),
  powerPolicy: {
    low: ["automatic","confirm","special_confirm","blocked"].includes(data.settings.superAdmin.powerPolicy.low) ? data.settings.superAdmin.powerPolicy.low : "automatic",
    medium: ["automatic","confirm","special_confirm","blocked"].includes(data.settings.superAdmin.powerPolicy.medium) ? data.settings.superAdmin.powerPolicy.medium : "confirm",
    high: ["automatic","confirm","special_confirm","blocked"].includes(data.settings.superAdmin.powerPolicy.high) ? data.settings.superAdmin.powerPolicy.high : "special_confirm",
    destructive: ["automatic","confirm","special_confirm","blocked"].includes(data.settings.superAdmin.powerPolicy.destructive) ? data.settings.superAdmin.powerPolicy.destructive : "special_confirm",
  },
};
if (!data.settings.stageLabels || typeof data.settings.stageLabels !== "object") data.settings.stageLabels = {};
data.settings.stageLabels = { new: cleanText(data.settings.stageLabels.new||"Nuevos",120), contacted: cleanText(data.settings.stageLabels.contacted||"Contactados",120), waiting: cleanText(data.settings.stageLabels.waiting||"En espera",120), won: cleanText(data.settings.stageLabels.won||"Ganados",120), lost: cleanText(data.settings.stageLabels.lost||"Perdidos",120), transferred: cleanText(data.settings.stageLabels.transferred||"Transferidos",120) };

if (!data.settings.botProfiles || typeof data.settings.botProfiles !== "object") data.settings.botProfiles = {};
data.settings.botProfiles = {
  newClientInstructions: cleanText(data.settings.botProfiles.newClientInstructions || "Atendé al cliente nuevo, identificá su necesidad y solicitá los datos necesarios. Si informa nombre y apellido, documento, RUC u otro dato configurado, actualizalo con las herramientas.", 6000),
  knownClientInstructions: cleanText(data.settings.botProfiles.knownClientInstructions || "El cliente ya es conocido. Saludalo por su nombre y avisale que su responsable continuará la gestión. Resolvé consultas simples con información confiable.", 6000),
  ownerAwayInstructions: cleanText(data.settings.botProfiles.ownerAwayInstructions || "El responsable habitual está ausente. Informale al cliente que el equipo de la sucursal recibió su mensaje y que un encargado dará continuidad.", 6000),
};
if (!data.settings.campaignSafety || typeof data.settings.campaignSafety !== "object") data.settings.campaignSafety = {};
data.settings.campaignSafety = {
  qrEnabled: data.settings.campaignSafety.qrEnabled !== false,
  requireOptIn: data.settings.campaignSafety.requireOptIn !== false,
  qrDailyLimitPerBranch: Math.min(100, Math.max(1, Number(data.settings.campaignSafety.qrDailyLimitPerBranch) || 25)),
  qrIntervalSeconds: Math.min(600, Math.max(30, Number(data.settings.campaignSafety.qrIntervalSeconds) || 90)),
  qrClientCooldownDays: Math.min(90, Math.max(0, Number(data.settings.campaignSafety.qrClientCooldownDays) || 7)),
  qrStartHour: Math.min(23, Math.max(0, Number(data.settings.campaignSafety.qrStartHour) || 8)),
  qrEndHour: Math.min(24, Math.max(1, Number(data.settings.campaignSafety.qrEndHour) || 19)),
  apiIntervalSeconds: Math.min(60, Math.max(1, Number(data.settings.campaignSafety.apiIntervalSeconds) || 3)),
  stopOnProviderError: data.settings.campaignSafety.stopOnProviderError !== false,
};
if (!data.settings.communicationOrchestrator || typeof data.settings.communicationOrchestrator !== "object") data.settings.communicationOrchestrator = {};
data.settings.communicationOrchestrator = {
  surveyIsolation: data.settings.communicationOrchestrator.surveyIsolation !== false,
  campaignIsolation: data.settings.communicationOrchestrator.campaignIsolation !== false,
  surveyRepliesTriggerCrm: data.settings.communicationOrchestrator.surveyRepliesTriggerCrm === true,
  campaignRepliesTriggerCrm: data.settings.communicationOrchestrator.campaignRepliesTriggerCrm === true,
  surveyCancelWords: [...new Set([...(Array.isArray(data.settings.communicationOrchestrator.surveyCancelWords)?data.settings.communicationOrchestrator.surveyCancelWords:[]),"salir","cancelar formulario","finalizar formulario","cancelar encuesta","finalizar encuesta"].map((value)=>cleanText(value,80).toLowerCase()).filter(Boolean))].slice(0,20),
};
if (!data.settings.copilot || typeof data.settings.copilot !== "object") {
  data.settings.copilot = { enabled: true, autoSuggest: true, includeStock: true, includeBranches: true, includeDocuments: true };
}
if (!data.settings.smartCapture || typeof data.settings.smartCapture !== "object") data.settings.smartCapture = {};
data.settings.smartCapture = {
  enabled: data.settings.smartCapture.enabled !== false,
  suggestionsEnabled: data.settings.smartCapture.suggestionsEnabled !== false,
  autoApplySafe: data.settings.smartCapture.autoApplySafe !== false,
  aiExtraction: data.settings.smartCapture.aiExtraction !== false,
  confidenceThreshold: Math.min(100, Math.max(60, Number(data.settings.smartCapture.confidenceThreshold) || 82)),
  autoApplyConfidence: Math.min(100, Math.max(85, Number(data.settings.smartCapture.autoApplyConfidence) || 96)),
  autoApplyFields: Array.isArray(data.settings.smartCapture.autoApplyFields) ? data.settings.smartCapture.autoApplyFields.map((v)=>cleanText(v,80)).filter(Boolean).slice(0,30) : ["city","email","age","country","neighborhood"],
  protectedFields: Array.isArray(data.settings.smartCapture.protectedFields) ? data.settings.smartCapture.protectedFields.map((v)=>cleanText(v,80)).filter(Boolean).slice(0,30) : ["name","document","ruc","address","birthDate","company","jobTitle"],
};
if (!data.settings.sharedDrive || typeof data.settings.sharedDrive !== "object") data.settings.sharedDrive = {};
// V13: PBX eliminado. Las llamadas se gestionan únicamente por WhatsApp.
data.settings.telephony = { enabled: false };
if (!data.settings.whatsappCalls || typeof data.settings.whatsappCalls !== "object") data.settings.whatsappCalls = { autoAssignUnowned: true, ownerFirst: true };
if (!data.settings.operational || typeof data.settings.operational !== "object") data.settings.operational = {};
if (!data.settings.operational.incident || typeof data.settings.operational.incident !== "object") data.settings.operational.incident = {};
data.settings.operational = {
  timezoneDefault: cleanText(data.settings.operational.timezoneDefault || "America/Asuncion", 80) || "America/Asuncion",
  weatherEnabled: data.settings.operational.weatherEnabled !== false,
  weatherRefreshMinutes: Math.min(120, Math.max(5, Number(data.settings.operational.weatherRefreshMinutes) || 15)),
  weatherProvider: "open-meteo",
  supportMessage: cleanText(data.settings.operational.supportMessage || "Ante cualquier inconveniente, avisá a tu jefatura o al administrador del sistema.", 1000),
  incident: {
    enabled: data.settings.operational.incident.enabled === true,
    severity: ["info", "warning", "critical"].includes(data.settings.operational.incident.severity) ? data.settings.operational.incident.severity : "warning",
    title: cleanText(data.settings.operational.incident.title || "Aviso operativo", 160),
    message: cleanText(data.settings.operational.incident.message, 2000),
    updatedAt: data.settings.operational.incident.updatedAt || null,
    updatedByName: cleanText(data.settings.operational.incident.updatedByName, 120),
  },
};
if (!data.users.length) {
  data.users.push({
    id: makeId("user"),
    username: "admin",
    name: "Administrador",
    role: "admin",
    passwordHash: initialAdminPasswordHash,
    active: true,
    clientDailyLimit: 50,
    permissions: { ownReports: true, branchReports: true, teamReports: true, globalReports: true, auditReports: true },
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  await store.save();
}
for (const user of data.users) {
  if (!user.permissions || typeof user.permissions !== "object") user.permissions = {};
  user.permissions.ownReports = true;
  user.permissions.campaignView = user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions.campaignView === true;
  user.permissions.campaignManage = user.role === "admin" || user.permissions.campaignManage === true || (["manager", "supervisor"].includes(user.role) && user.permissions.campaignManage !== false);
  user.permissions.customFieldsManage = user.role === "admin" || user.permissions.customFieldsManage === true;
  user.permissions.attendanceManage = user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions.attendanceManage === true;
  user.permissions.newsPublish = user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions.newsPublish === true;
  if (!user.attendance || typeof user.attendance !== "object") user.attendance = {};
  user.attendance.status = ["active", "paused", "away", "offline"].includes(user.attendance.status) ? user.attendance.status : (user.role === "agent" ? "offline" : "active");
  user.attendance.reason = cleanText(user.attendance.reason, 240);
  user.attendance.until = user.attendance.until || null;
  user.attendance.updatedAt = user.attendance.updatedAt || timestamp();
  if (user.role === "admin") {
    user.permissions.branchReports = true;
    user.permissions.teamReports = true;
    user.permissions.globalReports = true;
    user.permissions.auditReports = true;
  } else if (["manager", "supervisor"].includes(user.role)) {
    user.permissions.branchReports = user.permissions.branchReports !== false;
    user.permissions.teamReports = user.permissions.teamReports !== false;
    user.permissions.globalReports = user.permissions.globalReports === true;
    user.permissions.auditReports = user.permissions.auditReports === true;
  } else {
    user.permissions.branchReports = user.permissions.branchReports === true;
    user.permissions.teamReports = user.permissions.teamReports === true;
    user.permissions.globalReports = false;
    user.permissions.auditReports = false;
  }
}
if (!data.settings.sharedDrive.installationId) data.settings.sharedDrive.installationId = `install_${randomUUID()}`;
data.settings.sharedDrive.enabled = data.settings.sharedDrive.enabled === true;
data.settings.sharedDrive.folderPath = cleanText(data.settings.sharedDrive.folderPath, 500);
data.settings.sharedDrive.syncIntervalSeconds = Math.min(300, Math.max(5, Number(data.settings.sharedDrive.syncIntervalSeconds) || 15));
if (!data.settings.telephony || typeof data.settings.telephony !== "object") data.settings.telephony = {};
data.settings.telephony = {
  enabled: data.settings.telephony.enabled === true,
  mode: "webrtc",
  sipHost: cleanText(data.settings.telephony.sipHost || "190.128.234.106", 180),
  sipPort: Math.min(65535, Math.max(1, Number(data.settings.telephony.sipPort) || 7560)),
  sipDomain: cleanText(data.settings.telephony.sipDomain || data.settings.telephony.sipHost || "190.128.234.106", 180),
  extension: cleanText(data.settings.telephony.extension || "801", 80),
  authorizationUser: cleanText(data.settings.telephony.authorizationUser || data.settings.telephony.extension || "801", 80),
  password: String(data.settings.telephony.password || ""),
  websocketUrl: cleanText(data.settings.telephony.websocketUrl || "ws://190.128.234.106:7560", 300),
  displayName: cleanText(data.settings.telephony.displayName || "WhatsBot CRM", 120),
  maxConcurrentCalls: Math.min(50, Math.max(1, Number(data.settings.telephony.maxConcurrentCalls) || 5)),
  fallbackSeconds: Math.min(120, Math.max(5, Number(data.settings.telephony.fallbackSeconds) || 20)),
  autoAssignUnowned: data.settings.telephony.autoAssignUnowned !== false,
  externalSoftphoneFallback: false,
};

let branchDataChanged = false;
if (!Array.isArray(data.branches)) data.branches = [];
if (!Array.isArray(data.transfers)) data.transfers = [];
if (!data.branches.length) {
  data.branches.push({
    id: "branch_principal",
    code: "CASA-CENTRAL",
    name: "Sucursal Principal",
    city: "",
    address: "",
    phone: "",
    active: true,
    isLocal: true,
    introMessage: "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}",
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  branchDataChanged = true;
}
function primaryBranch() {
  return data.branches.find((branch) => branch.isLocal === true)
    || data.branches.find((branch) => branch.id === "branch_principal")
    || data.branches.find((branch) => branch.active !== false)
    || data.branches[0]
    || null;
}
function primaryBranchId() { return primaryBranch()?.id || null; }
function getBranch(branchId) { return data.branches.find((branch) => branch.id === branchId) || null; }
let localBranchFound = false;
for (const branch of data.branches) {
  branch.code = cleanText(branch.code, 40) || cleanText(branch.name, 40).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "SUCURSAL";
  branch.name = cleanText(branch.name, 120) || "Sucursal";
  branch.city = cleanText(branch.city, 120);
  branch.address = cleanText(branch.address, 240);
  branch.phone = cleanText(branch.phone, 40);
  branch.timezone = cleanText(branch.timezone || data.settings.operational?.timezoneDefault || "America/Asuncion", 80) || "America/Asuncion";
  branch.weatherLocation = cleanText(branch.weatherLocation || branch.city || branch.address, 240);
  branch.weatherLatitude = Number.isFinite(Number(branch.weatherLatitude)) ? Number(branch.weatherLatitude) : null;
  branch.weatherLongitude = Number.isFinite(Number(branch.weatherLongitude)) ? Number(branch.weatherLongitude) : null;
  branch.active = branch.active !== false;
  branch.hosted = true;
  if (branch.isLocal === true && !localBranchFound) localBranchFound = true;
  else branch.isLocal = false;
  branch.introMessage = cleanText(branch.introMessage, 1200) || "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}";
}
if (!localBranchFound && data.branches[0]) {
  data.branches[0].isLocal = true;
  branchDataChanged = true;
}

// V20.1: múltiples líneas de WhatsApp por sucursal. Se crea una línea principal compatible
// con las sesiones históricas de V20 para que la actualización no obligue a volver a vincular.
for (const branch of data.branches) {
  let line = data.whatsappLines.find((entry) => entry.legacyBranchSession === true && entry.branchId === branch.id);
  if (!line) {
    line = {
      id: `line_default_${String(branch.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      name: "Línea principal",
      branchId: branch.id,
      provider: branch.id === primaryBranchId() && data.settings.whatsappMode === "cloud" ? "cloud" : "qr",
      phone: cleanText(branch.phone, 40),
      active: true,
      isDefault: true,
      legacyBranchSession: true,
      accessMode: "branch",
      allowedUserIds: [],
      supervisorsCanUse: true,
      managersCanUse: true,
      botEnabled: true,
      notes: "Línea principal migrada desde la configuración de sucursal.",
      cloud: {},
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    data.whatsappLines.push(line);
    branchDataChanged = true;
  }
}
for (const line of data.whatsappLines) {
  const branch = getBranch(line.branchId);
  if (!branch) { line.active = false; continue; }
  line.name = cleanText(line.name, 120) || "Línea WhatsApp";
  line.provider = line.provider === "cloud" ? "cloud" : "qr";
  line.phone = cleanText(line.phone || (line.legacyBranchSession ? branch.phone : ""), 40);
  line.active = line.active !== false;
  line.isDefault = line.isDefault === true;
  line.accessMode = line.accessMode === "selected" ? "selected" : "branch";
  line.allowedUserIds = Array.isArray(line.allowedUserIds) ? [...new Set(line.allowedUserIds.map((id) => cleanText(id, 120)).filter(Boolean))] : [];
  line.supervisorsCanUse = line.supervisorsCanUse !== false;
  line.managersCanUse = line.managersCanUse !== false;
  line.botEnabled = line.botEnabled !== false;
  line.notes = cleanText(line.notes, 1000);
  line.cloud = line.cloud && typeof line.cloud === "object" ? line.cloud : {};
  if (line.legacyBranchSession && branch.id === primaryBranchId() && data.settings.whatsappMode === "cloud") line.provider = "cloud";
}
for (const branch of data.branches) {
  const activeLines=(data.whatsappLines||[]).filter((line)=>line.branchId===branch.id&&line.active!==false);
  if(activeLines.length&&!activeLines.some((line)=>line.isDefault===true)){const fallback=activeLines.find((line)=>line.legacyBranchSession)||activeLines[0];fallback.isDefault=true;branchDataChanged=true;}
  const defaults=activeLines.filter((line)=>line.isDefault===true); if(defaults.length>1){const keep=defaults.find((line)=>!line.legacyBranchSession)||defaults[0];for(const line of defaults)line.isDefault=line.id===keep.id;branchDataChanged=true;}
}
for (const user of data.users) {
  if (user.role !== "admin" && (!user.branchId || !getBranch(user.branchId))) {
    user.branchId = primaryBranchId();
    branchDataChanged = true;
  }
}
for (const deal of data.deals || []) {
  if (!deal.branchId || !getBranch(deal.branchId)) {
    deal.branchId = primaryBranchId();
    branchDataChanged = true;
  }
  // Compatibilidad con negociaciones creadas antes de V22.3.
  // Si ya hubo intervención humana y el bot estaba apagado, se conserva el handoff humano.
  if (typeof deal.botHumanHandoff !== "boolean") {
    deal.botHumanHandoff = Boolean(deal.lastAgentAt && deal.botActive === false);
    branchDataChanged = true;
  }
  const desiredMode = deal.botHumanHandoff ? "copilot" : (deal.botActive ? "auto" : "paused");
  if (!deal.botMode || !["auto", "copilot", "paused"].includes(deal.botMode) || deal.botMode !== desiredMode) {
    deal.botMode = desiredMode;
    branchDataChanged = true;
  }
  if (deal.botHumanHandoff && !deal.botPauseReason) { deal.botPauseReason = "human_takeover"; branchDataChanged = true; }
  if (!Object.prototype.hasOwnProperty.call(deal, "botHandoffAt")) { deal.botHandoffAt = deal.botHumanHandoff ? (deal.lastAgentAt || deal.updatedAt || null) : null; branchDataChanged = true; }
  if (!Object.prototype.hasOwnProperty.call(deal, "botHandoffByUserId")) { deal.botHandoffByUserId = null; branchDataChanged = true; }
  if (!Object.prototype.hasOwnProperty.call(deal, "botHandoffByName")) { deal.botHandoffByName = deal.botHumanHandoff ? (deal.ownerName || "Asesor") : ""; branchDataChanged = true; }
}
if (branchDataChanged) await store.save();

let connectionStatus = "disconnected";
let qrDataUrl = null;
let connectedAccount = null;
let lastError = null;
let whatsappSocket = null;
let reconnectTimer = null;
let manualLogout = false;
let startingPromise = null;
let automationRunning = false;
let downloadMediaMessage = null;
const branchConnections = new Map();
const lineConnections = new Map();
function extraBranchRuntime(branchId) {
  let runtime = branchConnections.get(branchId);
  if (!runtime) {
    runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false };
    branchConnections.set(branchId, runtime);
  }
  return runtime;
}
function extraLineRuntime(lineId) {
  let runtime = lineConnections.get(lineId);
  if (!runtime) {
    runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, lastConnectedAt: null };
    lineConnections.set(lineId, runtime);
  }
  return runtime;
}
function whatsappLineById(lineId) { return (data.whatsappLines || []).find((line) => line.id === lineId) || null; }
function defaultWhatsappLine(branchId) {
  return (data.whatsappLines || []).find((line) => line.branchId === branchId && line.active !== false && line.isDefault === true)
    || (data.whatsappLines || []).find((line) => line.branchId === branchId && line.active !== false)
    || null;
}
function dealWhatsappLine(deal) { return whatsappLineById(deal?.lineId) || defaultWhatsappLine(deal?.branchId || primaryBranchId()); }
function canUserUseWhatsappLine(user, line) {
  if (!user || !line || line.active === false) return false;
  if (user.role === "admin") return true;
  if (user.role === "manager") return line.managersCanUse !== false;
  if (user.role === "supervisor") return line.supervisorsCanUse !== false && user.branchId === line.branchId;
  if (user.branchId !== line.branchId) return false;
  if (line.accessMode !== "selected") return true;
  return (line.allowedUserIds || []).includes(user.id);
}
function canUserMonitorWhatsappLine(user, line) {
  if (!user || !line) return false;
  if (["admin", "manager"].includes(user.role)) return true;
  if (user.role === "supervisor") return user.branchId === line.branchId;
  return canUserUseWhatsappLine(user, line);
}
function lineCloudConfig(line) {
  if (!line) return {};
  if (line.legacyBranchSession && line.branchId === primaryBranchId()) return data.settings.whatsappApi || {};
  return line.cloud || {};
}
function lineCloudConfigured(line) { const config=lineCloudConfig(line); return Boolean(config.phoneNumberId && config.accessToken); }
function publicWhatsappLine(line, user=null) {
  const branch=getBranch(line.branchId); const state=whatsappLineConnectionState(line.id);
  return {
    id:line.id,name:line.name,branchId:line.branchId,branchName:branch?.name||"Sucursal",provider:line.provider,phone:line.phone||state.account||"",active:line.active!==false,isDefault:line.isDefault===true,legacyBranchSession:line.legacyBranchSession===true,accessMode:line.accessMode||"branch",allowedUserIds:[...(line.allowedUserIds||[])],supervisorsCanUse:line.supervisorsCanUse!==false,managersCanUse:line.managersCanUse!==false,botEnabled:line.botEnabled!==false,notes:line.notes||"",connection:state,canUse:user?canUserUseWhatsappLine(user,line):false,canMonitor:user?canUserMonitorWhatsappLine(user,line):false,hasCloudToken:Boolean(lineCloudConfig(line)?.accessToken),cloud:{phoneNumberId:cleanText(lineCloudConfig(line)?.phoneNumberId,80),businessAccountId:cleanText(lineCloudConfig(line)?.businessAccountId,80),apiVersion:cleanText(lineCloudConfig(line)?.apiVersion||"v23.0",20),verifyTokenConfigured:Boolean(lineCloudConfig(line)?.verifyToken)}
  };
}
const firstConnectionHistoryMs = 30 * 24 * 60 * 60 * 1000;
let syncCutoffAt = Date.parse(data.sync?.lastActiveAt) || Date.now() - firstConnectionHistoryMs;
let historySyncing = false;
const seenMessages = new Set((data.processedMessageIds || []).slice(-1200));
const sessions = new Map();
const sharedDriveRuntime = {
  status: data.settings.sharedDrive?.enabled ? "pending" : "disabled",
  lastSyncAt: null,
  lastReadAt: null,
  lastError: null,
  branches: 0,
  clients: 0,
  deals: 0,
  dirty: true,
  syncing: false,
  lastSnapshotHash: "",
};
let sharedDriveTimer = null;
let sharedSnapshotCache = { at: 0, snapshots: [] };

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, digest] = String(stored).split(":");
    const expected = Buffer.from(digest, "hex");
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

if (!data.settings.passwordHash) {
  data.settings.passwordHash = initialAdminPasswordHash;
  await store.save();
}

function rememberSeen(id) {
  if (!id) return;
  seenMessages.add(id);
  if (seenMessages.size > 1200) {
    const oldest = seenMessages.values().next().value;
    if (oldest) seenMessages.delete(oldest);
  }
}

function addLog(text, tone = "neutral") {
  addActivity(data, text, tone);
  void store.save();
}

function formatAccount(id) {
  if (!id) return null;
  const number = String(id).split(":")[0].split("@")[0];
  return number ? `+${number}` : "Cuenta vinculada";
}

function cloudApiConfigured() {
  const config = data.settings.whatsappApi || {};
  return Boolean(config.phoneNumberId && config.accessToken);
}

function connectionState() {
  const cloud = data.settings.whatsappMode === "cloud";
  return {
    status: cloud ? (cloudApiConfigured() ? "connected" : "disconnected") : connectionStatus,
    qr: cloud ? null : qrDataUrl,
    account: cloud ? (data.settings.whatsappApi?.phoneNumberId || null) : connectedAccount,
    error: lastError,
    provider: cloud ? "cloud" : "qr",
    mockMode,
    syncing: cloud ? false : historySyncing,
    lastHistorySyncAt: data.sync?.lastHistorySyncAt || null,
    lastImportAt: data.sync?.lastImportAt || null,
    lastImportCount: Number(data.sync?.lastImportCount || 0),
    totalImported: Number(data.sync?.totalImported || 0),
  };
}

function branchConnectionState(branchId) {
  if (!branchId || branchId === primaryBranchId()) return { branchId: primaryBranchId(), ...connectionState() };
  const branch = getBranch(branchId);
  const runtime = extraBranchRuntime(branchId);
  return {
    branchId,
    status: runtime.status || "disconnected",
    qr: runtime.qr || null,
    account: runtime.account || branch?.phone || null,
    error: runtime.error || null,
    provider: "qr",
    mockMode,
    syncing: Boolean(runtime.syncing),
  };
}
function whatsappLineConnectionState(lineId) {
  const line=whatsappLineById(lineId);
  if(!line) return {lineId,status:"disconnected",qr:null,account:null,error:"Línea no encontrada.",provider:"qr",mockMode,syncing:false};
  if(line.legacyBranchSession){
    const legacy=branchConnectionState(line.branchId);
    return {...legacy,lineId,provider:line.provider||legacy.provider,account:legacy.account||line.phone||null};
  }
  if(line.provider==="cloud") return {lineId,branchId:line.branchId,status:lineCloudConfigured(line)?"connected":"disconnected",qr:null,account:lineCloudConfig(line)?.phoneNumberId||line.phone||null,error:lineCloudConfigured(line)?null:"Faltan credenciales de Cloud API.",provider:"cloud",mockMode,syncing:false};
  const runtime=extraLineRuntime(line.id);
  return {lineId,branchId:line.branchId,status:runtime.status||"disconnected",qr:runtime.qr||null,account:runtime.account||line.phone||null,error:runtime.error||null,provider:"qr",mockMode,syncing:Boolean(runtime.syncing),lastConnectedAt:runtime.lastConnectedAt||null};
}

function publicBranches() {
  return (data.branches || []).map((branch) => ({
    ...branch,
    isPrimary: branch.id === primaryBranchId(),
    hosted: true,
    connection: branchConnectionState(branch.id),
    userCount: data.users.filter((user) => user.active !== false && user.branchId === branch.id).length,
    openDealCount: data.deals.filter((deal) => deal.branchId === branch.id && OPEN_STAGES.has(deal.stage)).length,
    whatsappLineCount: (data.whatsappLines||[]).filter((line)=>line.branchId===branch.id&&line.active!==false).length,
  }));
}

function publicUsers() {
  const now = Date.now();
  const today = paraguayDateKey(now);
  return data.users.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    branchId: user.branchId || null,
    branchName: getBranch(user.branchId)?.name || "Administración general",
    active: user.active !== false,
    clientDailyLimit: Number(user.clientDailyLimit || 0),
    permissions: {
      ownReports: true,
      branchReports: user.role === "admin" || user.permissions?.branchReports === true,
      teamReports: user.role === "admin" || user.permissions?.teamReports === true,
      globalReports: user.role === "admin" || user.permissions?.globalReports === true,
      auditReports: user.role === "admin" || user.permissions?.auditReports === true,
      campaignView: user.role === "admin" || user.role === "manager" || user.permissions?.campaignView === true,
      campaignManage: user.role === "admin" || user.permissions?.campaignManage === true,
      customFieldsManage: user.role === "admin" || user.permissions?.customFieldsManage === true,
      attendanceManage: user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.attendanceManage === true,
      newsPublish: user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.newsPublish === true,
    },
    attendance: { ...(user.attendance || { status: "offline" }) },
    clientLoadsToday: data.clientLoads.filter((entry) => entry.userId === user.id && entry.date === today).length,
    online: [...sessions.values()].some((session) => session.userId === user.id && session.expiresAt > now && now - (session.lastSeenAt || 0) < 20000),
  }));
}

function canSeeAll(user) {
  return Boolean(user && ["admin", "manager"].includes(user.role));
}

function canViewGlobalReports(user) {
  return Boolean(user && (user.role === "admin" || user.permissions?.globalReports === true));
}
function canViewBranchReports(user) {
  return Boolean(user && (user.role === "admin" || user.permissions?.branchReports === true || user.role === "manager" || user.role === "supervisor"));
}
function canViewTeamReports(user) {
  return Boolean(user && (user.role === "admin" || user.permissions?.teamReports === true || user.role === "manager" || user.role === "supervisor"));
}
function canViewAuditReports(user) {
  return Boolean(user && (user.role === "admin" || user.permissions?.auditReports === true));
}
function reportPermissions(user) {
  return {
    own: Boolean(user),
    branch: canViewBranchReports(user),
    team: canViewTeamReports(user),
    global: canViewGlobalReports(user),
    audit: canViewAuditReports(user),
    campaign: Boolean(user && (user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.campaignView === true)),
  };
}


function attendanceStatus(user) {
  if (!user) return "offline";
  const status = user.attendance?.status || (user.role === "agent" ? "offline" : "active");
  return ["active", "paused", "away", "offline"].includes(status) ? status : "offline";
}

function isAgentAvailable(user, branchId = null) {
  return Boolean(user && user.active !== false && user.role === "agent" && attendanceStatus(user) === "active" && (!branchId || user.branchId === branchId));
}

function isOwnerAway(deal) {
  if (!deal?.ownerUserId) return false;
  const owner = data.users.find((entry) => entry.id === deal.ownerUserId);
  return Boolean(owner && ["away", "offline"].includes(attendanceStatus(owner)));
}

function availableAgents(branchId) {
  return data.users.filter((entry) => isAgentAvailable(entry, branchId)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function branchManagers(branchId) {
  return data.users.filter((entry) => entry.active !== false && ["supervisor", "manager", "admin"].includes(entry.role) && (entry.role === "admin" || !entry.branchId || entry.branchId === branchId));
}

function fieldDefinition(idOrKey, entity = null) {
  const needle = cleanText(idOrKey, 120);
  return (data.customFieldDefinitions || []).find((field) => field.active !== false && (!entity || field.entity === entity) && (field.id === needle || field.key === needle)) || null;
}

function customFieldContext(entity, values = {}) {
  return (data.customFieldDefinitions || []).filter((field) => field.active !== false && field.entity === entity && field.botReadable !== false)
    .map((field) => `${field.label} (${field.key}): ${values?.[field.key] ?? "sin dato"}. Contexto: ${field.context || "Sin contexto adicional"}${field.botWritable ? " [el bot puede actualizarlo]" : ""}`)
    .join("\n");
}

function sanitizeCustomValue(field, value) {
  if (!field) return cleanText(value, 2000);
  if (field.type === "number") return Number(value) || 0;
  if (field.type === "boolean") return value === true || ["si", "sí", "true", "1"].includes(String(value).toLowerCase());
  if (field.type === "date") {
    const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  if (field.type === "select") {
    const text = cleanText(value, 120); return field.options?.includes(text) ? text : "";
  }
  return cleanText(value, 2000);
}

function setCustomField(entityType, entity, field, value) {
  if (!entity || !field || field.entity !== entityType) throw new Error("Campo personalizado inválido.");
  entity.customFields = entity.customFields && typeof entity.customFields === "object" ? entity.customFields : {};
  const clean = sanitizeCustomValue(field, value);
  if (field.required && (clean === "" || clean === null || clean === undefined)) throw new Error(`El campo ${field.label} no puede quedar vacío.`);
  entity.customFields[field.key] = clean;
  entity.updatedAt = timestamp();
  return clean;
}


const SMART_CAPTURE_FIELDS = {
  name: { label: "Nombre / Razón social", kind: "text" },
  document: { label: "Documento / CI", kind: "text" },
  ruc: { label: "RUC", kind: "text" },
  email: { label: "Correo", kind: "email" },
  company: { label: "Empresa", kind: "text" },
  city: { label: "Ciudad", kind: "text" },
  address: { label: "Dirección", kind: "text" },
  age: { label: "Edad", kind: "number" },
  birthDate: { label: "Fecha de nacimiento", kind: "date" },
  jobTitle: { label: "Cargo / profesión", kind: "text" },
  country: { label: "País", kind: "text" },
  neighborhood: { label: "Barrio / zona", kind: "text" },
};
function smartCaptureSettings(){return data.settings.smartCapture||{};}
function smartFieldLabel(field){return SMART_CAPTURE_FIELDS[field]?.label || fieldDefinition(field,"contact")?.label || cleanText(field,120);}
function normalizeSmartDate(value){
  const text=cleanText(value,40).trim(); if(!text)return "";
  let m=text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if(m){const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);const dt=new Date(Date.UTC(y,mo-1,d));if(dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d)return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){const dt=new Date(`${text}T00:00:00Z`);if(!Number.isNaN(dt.getTime()))return text;}
  return "";
}
function normalizeSmartValue(field,value){
  if(field==="age"){const n=Math.trunc(Number(value));return n>=1&&n<=120?n:0;}
  if(field==="birthDate")return normalizeSmartDate(value);
  if(field==="email")return cleanText(value,160).trim().toLowerCase();
  if(field==="document")return cleanText(value,80).trim();
  if(field==="ruc")return cleanText(value,80).trim().toUpperCase();
  const limits={name:120,company:160,city:120,address:240,jobTitle:120,country:120,neighborhood:120};
  return cleanText(value,limits[field]||240).replace(/\s+/g," ").replace(/[.,;:]+$/g,"").trim();
}
function currentSmartValue(client,field){if(!client)return null;if(field in SMART_CAPTURE_FIELDS)return client[field]??null;const def=fieldDefinition(field,"contact");return def?(client.customFields||{})[def.key]??null:null;}
function smartValueEqual(a,b){if(a===null||a===undefined||a==="")return b===null||b===undefined||b==="";return String(a).trim().toLocaleLowerCase("es")===String(b??"").trim().toLocaleLowerCase("es");}
function applySmartSuggestion(suggestion,user=null,{automatic=false}={}){
  if(!suggestion||suggestion.status!=="pending")return suggestion; const client=findClient(data,suggestion.clientId); if(!client)throw new Error("Cliente no encontrado.");
  if(suggestion.entityType==="custom"){const def=fieldDefinition(suggestion.field,"contact");if(!def||def.botWritable!==true)throw new Error("El campo personalizado ya no permite escritura inteligente.");setCustomField("contact",client,def,suggestion.value);}else{
    const allowed=new Set(Object.keys(SMART_CAPTURE_FIELDS));if(!allowed.has(suggestion.field))throw new Error("Campo no permitido.");updateClient(data,client.id,{[suggestion.field]:suggestion.value});
  }
  suggestion.status="applied";suggestion.autoApplied=automatic===true;suggestion.appliedAt=timestamp();suggestion.updatedAt=suggestion.appliedAt;suggestion.appliedByUserId=user?.id||null;suggestion.appliedByName=user?.name||(automatic?"Enriquecimiento inteligente":"");
  addActivity(data,`${automatic?"La IA completó":"Se completó"} ${suggestion.fieldLabel} de ${client.name||client.phone}: ${String(suggestion.value)}.`,"success");
  recordAuditEvent(user,automatic?"dato_cliente_autocompletado":"dato_cliente_aprobado",{dealId:suggestion.dealId,clientId:client.id,suggestionId:suggestion.id,field:suggestion.field,value:suggestion.value,confidence:suggestion.confidence,source:suggestion.source,evidence:suggestion.evidence},(findDeal(data,suggestion.dealId)||{}).branchId||primaryBranchId(),automatic?"ai":"human");
  return suggestion;
}
function smartCaptureCandidate({deal,field,value,evidence,confidence=90,source="local",custom=false}={}){
  const cfg=smartCaptureSettings(); if(cfg.enabled===false||cfg.suggestionsEnabled===false||!deal?.clientId)return null;
  const client=findClient(data,deal.clientId); if(!client)return null;
  const def=custom?fieldDefinition(field,"contact"):null; if(custom&&(!def||def.botWritable!==true))return null;
  const fieldKey=custom?def.key:field; const clean=custom?sanitizeCustomValue(def,value):normalizeSmartValue(fieldKey,value); if(clean===""||clean===null||clean===undefined||clean===0)return null;
  if(Number(confidence)<Number(cfg.confidenceThreshold||82))return null; const current=currentSmartValue(client,fieldKey); if(smartValueEqual(current,clean))return null;
  const duplicate=(data.clientDataSuggestions||[]).find((entry)=>entry.dealId===deal.id&&entry.field===fieldKey&&smartValueEqual(entry.value,clean)&&["pending","applied"].includes(entry.status)); if(duplicate)return duplicate;
  for(const entry of data.clientDataSuggestions||[]){if(entry.dealId===deal.id&&entry.field===fieldKey&&entry.status==="pending"&&!smartValueEqual(entry.value,clean)){entry.status="superseded";entry.updatedAt=timestamp();}}
  const hasCurrent=fieldKey==="age"?Number(current)>0:!(current===null||current===undefined||String(current).trim()==="");
  const suggestion={id:makeId("datasuggestion"),dealId:deal.id,clientId:client.id,entityType:custom?"custom":"client",contactPersonId:null,field:fieldKey,fieldLabel:custom?def.label:smartFieldLabel(fieldKey),value:clean,evidence:cleanText(evidence,600),confidence:Math.max(0,Math.min(100,Number(confidence)||0)),source,status:"pending",conflict:hasCurrent,autoApplied:false,previousValue:current??null,createdAt:timestamp(),updatedAt:timestamp(),appliedAt:null,appliedByUserId:null,appliedByName:""};
  data.clientDataSuggestions.push(suggestion); if(data.clientDataSuggestions.length>3000)data.clientDataSuggestions.splice(0,data.clientDataSuggestions.length-3000);
  const autoFields=new Set(Array.isArray(cfg.autoApplyFields)?cfg.autoApplyFields:[]),protectedFields=new Set(Array.isArray(cfg.protectedFields)?cfg.protectedFields:[]);
  const canAuto=cfg.autoApplySafe!==false&&!suggestion.conflict&&Number(suggestion.confidence)>=Number(cfg.autoApplyConfidence||96)&&((custom&&def?.botWritable===true)||autoFields.has(fieldKey))&&!protectedFields.has(fieldKey);
  if(canAuto)applySmartSuggestion(suggestion,null,{automatic:true}); return suggestion;
}
function localSmartCaptureSuggestions(deal,text){
  const raw=cleanText(text,6000); if(!raw||smartCaptureSettings().enabled===false)return []; const out=[]; const add=(field,value,evidence,confidence=96)=>{const x=smartCaptureCandidate({deal,field,value,evidence,confidence,source:"local"});if(x)out.push(x);}; let m;
  m=raw.match(/\b(?:mi\s+)?(?:correo|email|e-mail)\s*(?:es|:|=)?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i)||raw.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i); if(m)add("email",m[1],m[0],99);
  m=raw.match(/\b(?:mi\s+)?(?:ci|c[ií]|c[eé]dula|documento)\s*(?:n(?:ro|º|°)?\.?|es|:|=)?\s*([0-9][0-9.\-\s]{4,18})\b/i); if(m)add("document",m[1],m[0],99);
  m=raw.match(/\b(?:mi\s+)?ruc\s*(?:n(?:ro|º|°)?\.?|es|:|=)?\s*([0-9][0-9.\-\s]{4,18}(?:-[0-9A-Z])?)\b/i); if(m)add("ruc",m[1],m[0],99);
  m=raw.match(/\b(?:tengo|mi\s+edad\s+es|edad\s*[:=])\s*(\d{1,3})\s*(?:a[nñ]os?)?\b/i); if(m)add("age",m[1],m[0],99);
  m=raw.match(/\b(?:mi\s+fecha\s+de\s+nacimiento\s+(?:es|:)?|nac[ií]\s+el)\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}-\d{2}-\d{2})\b/i); if(m)add("birthDate",m[1],m[0],99);
  m=raw.match(/\b(?:mi\s+ciudad\s+(?:es|:)|vivo\s+en|resido\s+en)\s+([\p{L}][\p{L}\s.'-]{1,80}?)(?=\s+(?:y\s+(?:tengo|mi|trabajo|soy)|pero|mi\s+(?:ci|ruc|correo|direcci[oó]n))\b|[,;.!?]|$)/iu); if(m)add("city",m[1],m[0],98);
  m=raw.match(/\b(?:mi\s+barrio\s+(?:es|:)|barrio\s*[:=])\s+([\p{L}0-9][\p{L}0-9\s.'-]{1,80}?)(?=[,;.!?]|$)/iu); if(m)add("neighborhood",m[1],m[0],98);
  m=raw.match(/\b(?:mi\s+pa[ií]s\s+(?:es|:)|pa[ií]s\s*[:=])\s+([\p{L}][\p{L}\s.'-]{1,80}?)(?=[,;.!?]|$)/iu); if(m)add("country",m[1],m[0],98);
  m=raw.match(/\b(?:mi\s+direcci[oó]n\s+(?:es|:)|direcci[oó]n\s*[:=])\s+(.{4,180}?)(?=\s+(?:y\s+mi\s+(?:ci|ruc|correo)|pero)\b|[;.!?]|$)/i); if(m)add("address",m[1],m[0],97);
  m=raw.match(/\b(?:trabajo\s+en|mi\s+empresa\s+(?:es|:)|empresa\s*[:=])\s+([\p{L}0-9][\p{L}0-9&.' -]{1,100}?)(?=[,;.!?]|\s+y\s+mi\s+(?:cargo|correo)|$)/iu); if(m)add("company",m[1],m[0],93);
  m=raw.match(/\b(?:mi\s+cargo\s+(?:es|:)|cargo\s*[:=])\s+([\p{L}][\p{L}\s/'-]{1,80}?)(?=[,;.!?]|$)/iu); if(m)add("jobTitle",m[1],m[0],96);
  m=raw.match(/\b(?:mi\s+nombre\s+(?:es|:)|me\s+llamo)\s+([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){1,4})(?=[,;.!?]|$)/iu); if(m)add("name",m[1],m[0],96);
  for(const def of (data.customFieldDefinitions||[]).filter((f)=>f.active!==false&&f.entity==="contact"&&f.botWritable===true)){
    const terms=[def.label,def.key].map(v=>cleanText(v,120)).filter(Boolean); let match=null;
    for(const term of terms){const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const re=new RegExp(`(?:^|\\b)${escaped}\\s*(?:es|:|=)\\s*([^,;.!?\\n]{1,160})`,`iu`);match=raw.match(re);if(match)break;}
    if(match)smartCaptureCandidate({deal,field:def.key,value:match[1],evidence:match[0],confidence:96,source:"custom",custom:true});
  }
  return out;
}
function smartCaptureLikelyHasData(text){const raw=cleanText(text,3000).toLocaleLowerCase("es");if(!raw)return false;const terms=["mi ciudad","vivo en","resido en","tengo "," años","mi edad","ci ","cédula","cedula","documento","ruc","correo","email","dirección","direccion","fecha de nacimiento","nací","naci","mi empresa","trabajo en","mi cargo","mi barrio","mi país","mi pais","mi nombre","me llamo"];if(terms.some(t=>raw.includes(t)))return true;return (data.customFieldDefinitions||[]).some(f=>f.active!==false&&f.entity==="contact"&&f.botWritable===true&&[f.label,f.key].map(v=>String(v||"").trim().toLocaleLowerCase("es")).filter(Boolean).some(v=>raw.includes(v)));}
async function aiSmartCaptureSuggestions(deal,text){
  const cfg=smartCaptureSettings(); if(cfg.enabled===false||cfg.aiExtraction===false||!data.settings.apiKey||!aiFeatureEnabled("dataExtraction")||!smartCaptureLikelyHasData(text))return []; const client=findClient(data,deal.clientId);if(!client)return [];
  const custom=(data.customFieldDefinitions||[]).filter(f=>f.active!==false&&f.entity==="contact"&&f.botWritable===true).map(f=>({key:f.key,label:f.label,type:f.type,options:f.options||[],context:f.context||""}));
  const input={message:cleanText(text,6000),current:{name:client.name,document:client.document,ruc:client.ruc,email:client.email,company:client.company,city:client.city,address:client.address,age:client.age||null,birthDate:client.birthDate||"",jobTitle:client.jobTitle||"",country:client.country||"",neighborhood:client.neighborhood||"",customFields:client.customFields||{}},allowedFields:Object.entries(SMART_CAPTURE_FIELDS).map(([key,v])=>({key,label:v.label})),customFields:custom};
  try{const out=await requestOpenAiText({instructions:"Extraé únicamente datos que el cliente afirma explícitamente sobre sí mismo o su ficha. No infieras ni adivines. Si hay ambigüedad, no extraigas. Devolvé SOLO JSON válido: {suggestions:[{field,value,evidence,confidence,custom}]}. evidence debe ser un fragmento literal del mensaje. confidence 0-100. Para campos personalizados usá exactamente la key recibida y custom=true.",input,maxOutputTokens:850,json:true});const arr=Array.isArray(out.json?.suggestions)?out.json.suggestions:[],created=[];for(const item of arr.slice(0,12)){const evidence=cleanText(item?.evidence,600);if(!evidence||!cleanText(text,6000).toLocaleLowerCase("es").includes(evidence.toLocaleLowerCase("es")))continue;const x=smartCaptureCandidate({deal,field:cleanText(item?.field,120),value:item?.value,evidence,confidence:Number(item?.confidence)||85,source:"ai",custom:item?.custom===true});if(x)created.push(x);}return created;}catch(error){addLog(`Captura inteligente: ${cleanText(error.message,220)}`,"warning");return [];}
}
function captureIncomingClientData(deal,text,{allowAi=true}={}){if(!deal||!text||smartCaptureSettings().enabled===false)return;localSmartCaptureSuggestions(deal,text);if(allowAi&&smartCaptureLikelyHasData(text))void aiSmartCaptureSuggestions(deal,text).then(async(created)=>{if(created.length)await store.save();}).catch(()=>{});}
function publicSmartSuggestions(dealId){return (data.clientDataSuggestions||[]).filter(x=>x.dealId===dealId&&["pending","applied"].includes(x.status)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,30).map(x=>({...x}));}

function activeBotInstructionsText() {
  const rules = (data.botInstructions || []).filter((rule) => rule.active !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!rules.length) return "Sin instrucciones adicionales.";
  return rules.map((rule, index) => `${index + 1}. ${rule.name}: ${rule.instruction}`).join("\n");
}

function botTreatmentFor(deal) {
  const client = findClient(data, deal?.clientId);
  const historicalDeals = client ? (data.deals || []).filter((entry) => entry.clientId === client.id && entry.id !== deal.id) : [];
  const known = Boolean(deal?.ownerUserId || historicalDeals.length);
  const away = isOwnerAway(deal);
  return { known, away, instructions: away ? data.settings.botProfiles.ownerAwayInstructions : known ? data.settings.botProfiles.knownClientInstructions : data.settings.botProfiles.newClientInstructions };
}

function canManageCampaigns(user) { return Boolean(user && (user.role === "admin" || user.permissions?.campaignManage === true || ["manager", "supervisor"].includes(user.role))); }
function canViewCampaigns(user) { return Boolean(user && (user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.campaignView === true)); }
function canManageSurveys(user) { return Boolean(user && ["admin", "manager", "supervisor"].includes(user.role)); }
function canViewSurveys(user) { return Boolean(user && ["admin", "manager", "supervisor"].includes(user.role)); }
function canManageCustomFields(user) { return Boolean(user && (user.role === "admin" || user.permissions?.customFieldsManage === true)); }
function canManageAttendance(user) { return Boolean(user && (user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.attendanceManage === true)); }
function canPublishNews(user) { return Boolean(user && (user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.newsPublish === true)); }

function userCanAccessBranch(user, branchId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!user.branchId) return user.role === "manager";
  if (user.role === "supervisor") return user.branchId === branchId;
  return user.branchId === branchId;
}


function roleDisplayName(role) {
  return role === "admin" ? "Administrador" : role === "manager" ? "Gerente" : role === "supervisor" ? "Jefe" : "Agente";
}

function presenceForUser(user) {
  if (!user) return { scope: "self", users: [], counts: { active: 0, paused: 0, away: 0, offline: 0 } };
  let users = data.users.filter((entry) => entry.active !== false && entry.role === "agent");
  let scope = "all";
  if (user.role === "supervisor") { users = users.filter((entry) => entry.branchId === user.branchId); scope = "branch"; }
  else if (user.role === "agent") { users = users.filter((entry) => entry.id === user.id); scope = "self"; }
  else if (!["admin", "manager"].includes(user.role)) { users = users.filter((entry) => entry.branchId === user.branchId); scope = "branch"; }
  const now = Date.now();
  const rows = users.map((entry) => ({
    id: entry.id, name: entry.name, role: entry.role, roleName: roleDisplayName(entry.role), branchId: entry.branchId || null,
    branchName: getBranch(entry.branchId)?.name || "Sin sucursal", status: attendanceStatus(entry), reason: cleanText(entry.attendance?.reason, 240),
    until: entry.attendance?.until || null, updatedAt: entry.attendance?.updatedAt || null,
    online: [...sessions.values()].some((session) => session.userId === entry.id && session.expiresAt > now && now - (session.lastSeenAt || 0) < 20000),
  })).sort((a,b)=>String(a.branchName).localeCompare(String(b.branchName)) || String(a.name).localeCompare(String(b.name)));
  const counts = { active: 0, paused: 0, away: 0, offline: 0 };
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return { scope, users: rows, counts };
}

function newsVisibleTo(entry, user) {
  if (!entry || entry.active === false || !user) return false;
  if (user.role === "admin") return true;
  const audience = entry.audience || { mode: "all" };
  if (audience.mode === "all") return true;
  if (audience.mode === "branch") return Boolean(user.branchId && (audience.branchIds || []).includes(user.branchId));
  if (audience.mode === "users") return (audience.userIds || []).includes(user.id);
  if (audience.mode === "roles") return (audience.roles || []).includes(user.role);
  return false;
}

function publicNewsFor(user) {
  const reads = new Set((data.newsReads || []).filter((r)=>r.userId===user?.id).map((r)=>r.newsId));
  return (data.news || []).filter((entry)=>newsVisibleTo(entry,user)).sort((a,b)=>Number(b.pinned===true)-Number(a.pinned===true) || Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0)).slice(0,250).map((entry)=>({
    id: entry.id, title: entry.title, body: entry.body, priority: entry.priority || "normal", pinned: entry.pinned === true,
    audience: entry.audience || { mode:"all" }, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    createdByUserId: entry.createdByUserId || null, createdByName: entry.createdByName || "", createdByRole: entry.createdByRole || "",
    read: reads.has(entry.id),
    attachments: (entry.attachments || []).map((file)=>({ id:file.id, fileName:file.fileName, mimeType:file.mimeType, size:file.size, kind:file.kind, url:`/api/news/${encodeURIComponent(entry.id)}/attachments/${encodeURIComponent(file.id)}` })),
  }));
}

const weatherCache = new Map();
function weatherCodeLabel(code) {
  const c=Number(code); if(c===0)return {label:"Despejado",icon:"☀"}; if([1,2].includes(c))return {label:"Parcialmente nublado",icon:"⛅"}; if(c===3)return {label:"Nublado",icon:"☁"}; if([45,48].includes(c))return {label:"Neblina",icon:"🌫"}; if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c))return {label:"Lluvia",icon:"🌧"}; if([71,73,75,77,85,86].includes(c))return {label:"Nieve",icon:"❄"}; if([95,96,99].includes(c))return {label:"Tormenta",icon:"⛈"}; return {label:"Tiempo variable",icon:"🌤"};
}
async function resolveBranchCoordinates(branch) {
  if (Number.isFinite(Number(branch?.weatherLatitude)) && Number.isFinite(Number(branch?.weatherLongitude))) return { latitude:Number(branch.weatherLatitude), longitude:Number(branch.weatherLongitude), name:branch.weatherLocation || branch.city || branch.name };
  const query = cleanText(branch?.weatherLocation || [branch?.address,branch?.city].filter(Boolean).join(", ") || branch?.city,240);
  if (!query) return null;
  const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=es&format=json`;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),5000);
  try { const res=await fetch(url,{signal:controller.signal}); if(!res.ok)return null; const body=await res.json(); const hit=body?.results?.[0]; return hit ? {latitude:Number(hit.latitude),longitude:Number(hit.longitude),name:[hit.name,hit.admin1].filter(Boolean).join(", ")} : null; } finally { clearTimeout(timer); }
}
async function branchWeather(branch) {
  if (!branch || data.settings.operational?.weatherEnabled === false) return { enabled:false };
  const ttl=Math.max(5,Number(data.settings.operational?.weatherRefreshMinutes||15))*60000; const cached=weatherCache.get(branch.id);
  if(cached && Date.now()-cached.at<ttl)return cached.value;
  try {
    const coords=await resolveBranchCoordinates(branch); if(!coords) throw new Error("Ubicación no configurada");
    const timezone=encodeURIComponent(branch.timezone || data.settings.operational?.timezoneDefault || "America/Asuncion");
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(coords.latitude)}&longitude=${encodeURIComponent(coords.longitude)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=${timezone}&forecast_days=1`;
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),6000);
    let body; try { const res=await fetch(url,{signal:controller.signal}); if(!res.ok)throw new Error(`Clima HTTP ${res.status}`); body=await res.json(); } finally { clearTimeout(timer); }
    const descriptor=weatherCodeLabel(body?.current?.weather_code); const value={enabled:true,ok:true,location:coords.name||branch.city||branch.name,temperature:Number(body?.current?.temperature_2m),apparent:Number(body?.current?.apparent_temperature),wind:Number(body?.current?.wind_speed_10m),weatherCode:Number(body?.current?.weather_code),label:descriptor.label,icon:descriptor.icon,updatedAt:timestamp()}; weatherCache.set(branch.id,{at:Date.now(),value}); return value;
  } catch(error) { const value={enabled:true,ok:false,location:branch.weatherLocation||branch.city||branch.name,error:cleanText(error.message,180),updatedAt:timestamp()}; weatherCache.set(branch.id,{at:Date.now(),value}); return value; }
}


function moduleEnabled(key) { return data.settings.modules?.[key] !== false; }
function aiFeatureEnabled(key) { return data.settings.aiSuite?.enabled !== false && data.settings.aiFeatures?.[key] !== false; }

const ADMIN_GUIDE_CATALOG = [
["crm","Operación","Negociaciones y conversaciones","Pipeline central; el primer agente disponible que responde queda como responsable."],
["whatsapp","Canales","WhatsApp por sucursal","Cada sucursal conserva su propia sesión y los mensajes salen por su línea."],
["attendance","Operación","Marcación y cobertura","Disponible recibe nuevos clientes; Pausa/Ausente/Offline no reciben nuevos."],
["customer360","Clientes","Ficha 360°","Historial, compras, responsables, sucursales, datos y contexto del cliente."],
["campaigns","Marketing","Campañas","Segmentación, consentimiento, adjuntos y métricas de efectividad."],
["forms","Experiencia","Formularios","Formularios aislados del pipeline, envíos programados, lógica condicional y reportes de resultados."],
["reports","Gestión","Reportes","Dashboards según rol: agente, jefe, gerencia o administración."],
["aiCenter","IA","Copiloto IA 360°","Resumen, sentimiento, riesgo, calidad, datos faltantes y siguiente acción."],
["commandCenter","IA","Centro de Comando IA","Preguntas globales en lenguaje natural sobre la operación visible."],
["shadowAgent","IA","Shadow Agent","Prioridades personales, cartera, tareas vencidas y clientes esperando."],
["naturalActions","IA","Acciones en lenguaje natural","La IA prepara acciones; el humano confirma según nivel de autonomía."],
["automationGenerator","Automatización","Generador de automatizaciones","Convierte instrucciones naturales en borradores de reglas."],
["automationSimulator","Automatización","Simulador de automatizaciones","Estima impacto histórico sin ejecutar cambios."],
["semanticSearch","IA","Búsqueda semántica","Busca por significado aunque no recuerdes el dato exacto."],
["customerMemory","Clientes","Memoria IA","Hechos confirmados, inferencias y datos pendientes, diferenciados por certeza."],
["knowledgeAssistant","IA","Conocimiento empresarial","Consulta documentos, políticas, catálogos y procedimientos autorizados."],
["contradictionCheck","IA","Detector de contradicciones","Advierte precios, stock, garantías o promesas inconsistentes."],
["audioTranscription","IA","Audios IA","Transcripción, resumen y extracción de datos cuando hay servicio IA compatible."],
["advancedSentiment","IA","Sentimiento avanzado","Frustración, urgencia, interés, confusión, confianza y riesgo."],
["riskRadar","Gestión","Radar de riesgo","Prioriza clientes y negociaciones con señales de pérdida o abandono."],
["opportunities","Comercial","Radar de oportunidades","Reposición, reactivación y oportunidades detectadas por comportamiento."],
["nextBestOffer","Comercial","Next Best Offer","Recomienda producto o servicio relevante según historial y contexto."],
["reactivation","Comercial","Reactivación inteligente","Detecta clientes que rompieron su frecuencia habitual de compra."],
["quality","Gestión","Calidad IA","Score de conversación y coaching privado para el agente."],
["academy","Gestión","Academia IA","Microcapacitaciones basadas en calidad, desempeño y procedimientos."],
["predictiveAlerts","Gestión","Alertas predictivas","Intenta anticipar incumplimientos de SLA y sobrecarga."],
["smartAssignment","Operación","Asignación inteligente","Distribuye según sucursal, disponibilidad, carga y reglas."],
["relationships","Clientes","Mapa de relaciones B2B","Empresa, contactos, decisores, responsables y sucursales relacionadas."],
["semanticDuplicates","Clientes","Duplicados inteligentes","Sugiere fichas posiblemente duplicadas para revisión y fusión controlada."],
["documentIntelligence","IA","Document Intelligence","Extrae información de documentos y prepara borradores con confirmación."],
["visionCapture","IA","Captura visual IA","Extrae campos desde imágenes/documentos cuando hay modelo visual configurado."],
["orders","Operación","Pedidos","Venta ganada → pedido → preparación → despacho → entrega."],
["visits","Comercial","Visitas comerciales","Agenda, responsable, resultado y próximo paso para trabajo de campo."],
["portal","Clientes","Portal del cliente","Marco para exponer estados/documentos autorizados con acceso seguro."],
["security","Control","Seguridad y anomalías","Detecta actividad inusual y facilita investigación con auditoría."],
["auditAssistant","Control","Auditor IA","Organiza eventos de auditoría para reconstruir qué ocurrió."],
["costControl","Administración","Control de costos IA","Tokens, llamadas, presupuesto y consumo por función."],
["modelRouting","Administración","Enrutamiento de modelos","Usa modelo económico o avanzado según complejidad, si está habilitado."],
["personalizedUi","Experiencia","Interfaz por rol","Prioriza herramientas según agente, jefatura, gerencia o administración."],
["wallboard","Gestión","Wallboard gerencial","Vista grande para TV con espera, presencia, oportunidades y alertas."],
["autonomyLevels","Administración","Autonomía IA 0–5","0 apagada; 1 observa; 2 recomienda; 3 prepara; 4 automatiza autorizado; 5 autónomo controlado."],
["adminGuide","Administración","Modo Guía Administrador","Ayuda exclusiva del administrador; se puede activar o desactivar completamente."]
].map(([key,group,title,summary])=>({key,group,title,summary,steps:["Revisá que el módulo esté activado en Configuración.","Usá la función con datos reales visibles para tu rol.","Verificá permisos y contexto antes de ejecutar acciones.","Para acciones externas o sensibles, mantené revisión humana."],example:`Ejemplo práctico: ${summary}`}));

function advancedOverview(user) {
  const visible=(d)=>user.role==="admin"||user.role==="manager"||!user.branchId||d.branchId===user.branchId;
  const open=(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)&&visible(d));
  const waiting=open.filter(d=>d.stage===STAGES.WAITING);
  const won=(data.deals||[]).filter(d=>d.stage===STAGES.WON&&visible(d));
  const alerts=automaticOperationalAlerts(user);
  const opp=(data.opportunities||[]).filter(o=>o.status!=="closed"&&visible(o));
  const orders=(data.orders||[]).filter(visible);
  const visits=(data.visits||[]).filter(visible);
  const sales=won.reduce((sum,d)=>sum+(d.items||[]).reduce((s,i)=>s+Number(i.unitPrice||i.price||0)*Number(i.quantity||0),0),0);
  return {open:open.length,waiting:waiting.length,won:won.length,totalSales:sales,criticalAlerts:alerts.filter(a=>a.severity==="critical").length,opportunities:opp.length,orders:orders.filter(o=>!["delivered","cancelled"].includes(o.status)).length,visits:visits.filter(v=>v.status!=="completed").length,available:presenceForUser(user).counts?.active||0};
}
function recordAiUsage(user,feature,{model="local",inputTokens=0,outputTokens=0,costUsd=0}={}){const e={id:makeId("aiusage"),at:timestamp(),userId:user?.id||null,userName:user?.name||"Sistema",branchId:user?.branchId||null,feature:cleanText(feature,100),model:cleanText(model,100),inputTokens:Number(inputTokens)||0,outputTokens:Number(outputTokens)||0,costUsd:Number(costUsd)||0};data.aiUsage.unshift(e);data.aiUsage.splice(5000);return e;}
function visibleTasksFor(user) {
  if (!user || !moduleEnabled("tasks")) return [];
  return (data.tasks || []).filter((task) => {
    if (user.role === "admin" || user.role === "manager") return true;
    if (user.role === "supervisor") return !task.branchId || task.branchId === user.branchId;
    return task.assignedUserId === user.id || task.createdByUserId === user.id;
  }).slice(0, 1000);
}
function visibleObjectivesFor(user) {
  if (!user || !moduleEnabled("objectives")) return [];
  return (data.objectives || []).filter((obj) => {
    if (user.role === "admin" || user.role === "manager") return true;
    if (user.role === "supervisor") return obj.branchId === user.branchId || obj.userId === user.id;
    return obj.userId === user.id;
  }).slice(0, 500);
}
function visibleApprovalsFor(user) {
  if (!user || !moduleEnabled("approvals")) return [];
  return (data.approvals || []).filter((entry) => {
    if (user.role === "admin" || user.role === "manager") return true;
    if (user.role === "supervisor") return entry.branchId === user.branchId || entry.requestedByUserId === user.id;
    return entry.requestedByUserId === user.id;
  }).slice(0, 500);
}
function automaticOperationalAlerts(user) {
  if (!user || !moduleEnabled("alerts")) return [];
  const now = Date.now(); const alerts=[];
  const deals = (data.deals || []).filter((d)=>OPEN_STAGES.has(d.stage) && (user.role === "admin" || user.role === "manager" || !user.branchId || d.branchId === user.branchId));
  for (const deal of deals) {
    const last = new Date(deal.updatedAt || deal.lastClientAt || 0).getTime();
    const waitMin = Math.max(0, Math.round((now-last)/60000));
    if (deal.stage === STAGES.WAITING && waitMin >= 30) alerts.push({id:`wait_${deal.id}`,type:"waiting",severity:waitMin>=120?"critical":"warning",title:"Cliente esperando respuesta",detail:`${deal.name || deal.phone} lleva ${waitMin} min sin gestión.`,dealId:deal.id,branchId:deal.branchId});
    else if (waitMin >= 240) alerts.push({id:`stale_${deal.id}`,type:"inactivity",severity:"warning",title:"Negociación sin movimiento",detail:`${deal.name || deal.phone} lleva ${Math.round(waitMin/60)} h sin actividad.`,dealId:deal.id,branchId:deal.branchId});
    if (!deal.ownerUserId && deal.stage !== STAGES.NEW) alerts.push({id:`owner_${deal.id}`,type:"assignment",severity:"info",title:"Negociación sin responsable",detail:`${deal.name || deal.phone} necesita responsable.`,dealId:deal.id,branchId:deal.branchId});
  }
  for (const product of (data.products || []).filter(p=>p.active!==false && Number(p.available||0)<=Number(p.minStock||0))) alerts.push({id:`stock_${product.id}`,type:"stock",severity:Number(product.available||0)<=0?"critical":"warning",title:"Stock bajo",detail:`${product.name}: ${Number(product.available||0)} disponibles.`,productId:product.id});
  for (const task of visibleTasksFor(user).filter(t=>t.status!=="done" && t.dueAt && new Date(t.dueAt).getTime()<now)) alerts.push({id:`task_${task.id}`,type:"task",severity:"critical",title:"Tarea vencida",detail:task.title,taskId:task.id,branchId:task.branchId});
  return alerts.slice(0,100);
}
function clientDealContext(deal) {
  const client=findClient(data,deal?.clientId)||{};
  const history=(data.deals||[]).filter(d=>d.clientId===client.id).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  const wins=history.filter(d=>d.stage===STAGES.WON);
  const recent=(deal?.messages||[]).slice(-Math.max(6,Number(data.settings.aiSuite?.maxContextMessages||20)));
  return {client,history,wins,recent};
}
function applyAiFeatureMask(insight) {
  const out={...insight};
  if(!aiFeatureEnabled("customerSummary")&&!aiFeatureEnabled("conversationSummary")) out.summary="Función desactivada por administración.";
  if(!aiFeatureEnabled("sentiment")) out.sentiment="desactivado";
  if(!aiFeatureEnabled("urgency")) out.urgency="desactivado";
  if(!aiFeatureEnabled("missingData")) out.missingData=[];
  if(!aiFeatureEnabled("nextBestAction")) out.nextActions=[];
  if(!aiFeatureEnabled("closeProbability")) out.closeProbability=0;
  if(!aiFeatureEnabled("riskDetection")) out.risks=[];
  if(!aiFeatureEnabled("crossSell")) out.opportunities=[];
  if(!aiFeatureEnabled("qualityScoring")) out.quality={score:0,notes:[]};
  return out;
}
function fallbackAgentIntelligence(deal) {
  const {client,history,wins,recent}=clientDealContext(deal);
  const incoming=recent.filter(m=>m.direction==="incoming").map(m=>m.text||"").filter(Boolean);
  const all=incoming.join(" ").toLowerCase();
  const negative=["molesto","mal servicio","reclamo","problema","no sirve","demora excesiva","cancelar"].some(w=>all.includes(w));
  const positive=["gracias","perfecto","confirmo","quiero","comprar","me interesa"].some(w=>all.includes(w));
  const urgency=["urgente","hoy","ahora","ya","inmediato"].some(w=>all.includes(w));
  const missing=[];
  const apparentName=/\b(?:soy|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+){1,3})/iu.test(incoming.at(-1)||"");
  const apparentTax=/\b(?:ruc|ci|cédula|cedula|documento)\s*[:#-]?\s*[0-9.\-]{5,15}/i.test(incoming.at(-1)||"");
  if((!client.name || /^Cliente\s/i.test(client.name||""))&&!apparentName) missing.push("Nombre y apellido");
  if(!client.document && !client.ruc && !apparentTax) missing.push("CI o RUC");
  if(!client.city && !client.address) missing.push("Ciudad / dirección");
  const lastIncoming=incoming.at(-1)||deal?.lastMessage||"Sin mensaje reciente";
  const summary=`${client.name||deal?.name||deal?.phone}. ${wins.length?`${wins.length} venta${wins.length===1?"":"s"} ganada${wins.length===1?"":"s"}.`:"Sin ventas ganadas registradas."} Último pedido/consulta: ${cleanText(lastIncoming,260)}`;
  let probability=deal?.stage===STAGES.WON?100:deal?.stage===STAGES.LOST?0:20;
  if(history.length>1) probability+=10; if(wins.length) probability+=20; if(positive) probability+=20; if(all.includes("precio")||all.includes("cotiz"))probability+=10; if(negative)probability-=15; probability=Math.max(5,Math.min(95,probability));
  const nextActions=[];
  if(missing.length) nextActions.push(`Completar ${missing[0]}`);
  if(all.includes("precio")||all.includes("cotiz")) nextActions.push("Preparar cotización y confirmar disponibilidad");
  if(all.includes("stock")||all.includes("disponib")) nextActions.push("Verificar stock antes de prometer entrega");
  if(negative) nextActions.push("Priorizar contención y confirmar resolución concreta");
  if(!nextActions.length) nextActions.push(deal?.stage===STAGES.WAITING?"Dar seguimiento al cliente":"Confirmar necesidad y siguiente paso");
  const opportunities=[];
  if(wins.length) opportunities.push("Usar el historial de compras para una recomendación relevante, sin forzar venta cruzada.");
  if(all.includes("cantidad")||/\b\d+\b/.test(all)) opportunities.push("Validar cantidad, fecha de entrega y condiciones antes de cerrar.");
  return {summary,sentiment:negative?"negativo":positive?"positivo":"neutral",urgency:urgency?"alta":"normal",missingData:missing,nextActions:nextActions.slice(0,4),closeProbability:probability,risks:negative?["Riesgo de insatisfacción / pérdida si no se responde con prioridad."]:[],opportunities:opportunities.slice(0,3),quality:{score:Math.max(55,Math.min(98,80+(wins.length?5:0)-(negative?12:0))),notes:["Revisar claridad, promesas y próximo paso antes de enviar."]},generatedAt:timestamp(),source:"local"};
}
const aiRuntime = { lastOkAt:null, lastError:null, lastLatencyMs:null, lastModel:null, lastEndpoint:null };
function responseApiText(body){
  if(typeof body?.output_text==="string"&&body.output_text.trim())return body.output_text.trim();
  const parts=[]; for(const item of body?.output||[])for(const content of item?.content||[]){const text=content?.text||content?.value;if(typeof text==="string"&&text.trim())parts.push(text.trim());}
  return parts.join("\n").trim();
}
function cleanAiJsonText(value){let text=String(value||"").trim();text=text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();return text;}
async function requestOpenAiText({instructions,input,maxOutputTokens=900,json=false}={}){
  if(!data.settings.apiKey) throw new Error("Falta configurar la API Key de IA en Configuración.");
  const model=cleanText(data.settings.model||"gpt-4.1-mini",120)||"gpt-4.1-mini"; const started=Date.now(); let firstError=null;
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${data.settings.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,instructions:cleanText(instructions,12000),input:typeof input==="string"?input:JSON.stringify(input),max_output_tokens:maxOutputTokens})});
    const raw=await r.text(); let body={}; try{body=raw?JSON.parse(raw):{};}catch{body={};}
    if(!r.ok)throw new Error(`Responses API ${r.status}: ${cleanText(body?.error?.message||raw,500)}`);
    const text=responseApiText(body); if(!text)throw new Error("Responses API no devolvió texto.");
    aiRuntime.lastOkAt=timestamp();aiRuntime.lastError=null;aiRuntime.lastLatencyMs=Date.now()-started;aiRuntime.lastModel=model;aiRuntime.lastEndpoint="responses";
    return {text,json:json?JSON.parse(cleanAiJsonText(text)):null,usage:{inputTokens:body?.usage?.input_tokens||0,outputTokens:body?.usage?.output_tokens||0},model,endpoint:"responses"};
  }catch(error){firstError=error;}
  try{
    const messages=[{role:"system",content:cleanText(instructions,12000)},{role:"user",content:typeof input==="string"?input:JSON.stringify(input)}];
    const payload={model,messages,temperature:0.2,max_tokens:maxOutputTokens}; if(json)payload.response_format={type:"json_object"};
    const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${data.settings.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const raw=await r.text(); let body={}; try{body=raw?JSON.parse(raw):{};}catch{body={};}
    if(!r.ok)throw new Error(`Chat Completions ${r.status}: ${cleanText(body?.error?.message||raw,500)}`);
    const text=cleanText(body?.choices?.[0]?.message?.content||"",12000); if(!text)throw new Error("La API no devolvió contenido.");
    aiRuntime.lastOkAt=timestamp();aiRuntime.lastError=null;aiRuntime.lastLatencyMs=Date.now()-started;aiRuntime.lastModel=model;aiRuntime.lastEndpoint="chat-completions-fallback";
    return {text,json:json?JSON.parse(cleanAiJsonText(text)):null,usage:{inputTokens:body?.usage?.prompt_tokens||0,outputTokens:body?.usage?.completion_tokens||0},model,endpoint:"chat-completions-fallback"};
  }catch(error){
    aiRuntime.lastError=cleanText(`${firstError?.message||""}${firstError?" | ":""}${error?.message||error}`,900);aiRuntime.lastLatencyMs=Date.now()-started;aiRuntime.lastModel=model;aiRuntime.lastEndpoint="error";throw new Error(`No se pudo conectar con la IA: ${aiRuntime.lastError}`);
  }
}
function aiSuiteStatus(){return {enabled:data.settings.aiSuite?.enabled!==false&&moduleEnabled("aiCenter"),apiKeyConfigured:Boolean(data.settings.apiKey),mode:data.settings.apiKey?"api":"local",model:data.settings.model||"gpt-4.1-mini",runtime:{...aiRuntime},advancedSuiteEnabled:moduleEnabled("advancedSuite"),commandCenterEnabled:moduleEnabled("commandCenter"),message:data.settings.apiKey?(aiRuntime.lastError?"La IA tiene una configuración, pero la última llamada falló. Usá Probar conexión.":"API Key configurada. Probá la conexión para confirmar el acceso."):"No hay API Key configurada. La Suite usa funciones locales, pero las respuestas generativas avanzadas requieren una API Key."};}

async function structuredAgentIntelligence(deal) {
  const fallback=fallbackAgentIntelligence(deal);
  if(!data.settings.apiKey) return fallback;
  const {client,history,recent}=clientDealContext(deal);
  const prompt={cliente:{name:client.name,phone:client.phone,document:client.document,ruc:client.ruc,company:client.company,city:client.city,tags:client.tags,customFields:client.customFields},negociacion:{stage:deal.stage,owner:deal.ownerName,branch:getBranch(deal.branchId)?.name,line:dealWhatsappLine(deal)?.name,customFields:deal.customFields,items:deal.items},historial:history.slice(0,8).map(d=>({stage:d.stage,updatedAt:d.updatedAt,owner:d.ownerName,items:d.items})),mensajes:recent.map(m=>({direction:m.direction,text:m.text}))};
  try{
    const out=await requestOpenAiText({instructions:"Sos un copiloto CRM para agentes humanos. Analizá solo la evidencia disponible. Devolvé SOLO JSON válido con claves summary, sentiment, urgency, missingData(array), nextActions(array), closeProbability(0-100), risks(array), opportunities(array), quality:{score:0-100,notes:array}. No inventes datos ni promesas.",input:prompt,maxOutputTokens:1000,json:true});
    const parsed=out.json||{};
    return {...fallback,...parsed,missingData:Array.isArray(parsed.missingData)?parsed.missingData:fallback.missingData,nextActions:Array.isArray(parsed.nextActions)?parsed.nextActions:fallback.nextActions,risks:Array.isArray(parsed.risks)?parsed.risks:fallback.risks,opportunities:Array.isArray(parsed.opportunities)?parsed.opportunities:fallback.opportunities,quality:parsed.quality&&typeof parsed.quality==="object"?parsed.quality:fallback.quality,generatedAt:timestamp(),source:"ai",endpoint:out.endpoint};
  }catch(error){addLog(`Suite IA: ${cleanText(error.message,260)}`,"warning");return {...fallback,aiError:cleanText(error.message,500)};}
}
function safeAiFeaturesFor(user){
  const features={...data.settings.aiFeatures};
  if(!user) return {};
  return features;
}

function stateResponse(request = null) {
  const user = request ? currentUser(request) : null;
  const payload = publicData(data);
  if (user?.role !== "admin" && payload.settings?.sharedDrive) payload.settings.sharedDrive = { ...payload.settings.sharedDrive, folderPath: "" };
  if (user) {
    if (user.role !== "admin" && user.branchId) {
      payload.deals = payload.deals.filter((deal) => deal.branchId === user.branchId);
    }
    if (user.role === "agent") {
      const available = isAgentAvailable(user, user.branchId || primaryBranchId());
      payload.deals = payload.deals.filter((deal) => {
        const line=dealWhatsappLine(deal);
        if(line && !canUserUseWhatsappLine(user,line)) return false;
        return deal.ownerUserId === user.id || (available && !deal.ownerUserId) || Boolean(v214ActiveCommunicationGrant(deal, user));
      });
    }
    const visibleClientIds = new Set(payload.deals.map((deal) => deal.clientId).filter(Boolean));
    payload.clients = (payload.clients || []).filter((client) => visibleClientIds.has(client.id));
    if (user.role !== "admin" && user.branchId) {
      payload.transfers = (payload.transfers || []).filter((entry) => entry.sourceBranchId === user.branchId || entry.targetBranchId === user.branchId);
    }
    const campaignVisible = canViewCampaigns(user);
    payload.campaigns = campaignVisible ? (payload.campaigns || []).filter((campaign) => user.role === "admin" || !user.branchId || campaign.branchId === user.branchId) : [];
    if (!campaignVisible) payload.botInstructions = user.role === "agent" ? [] : (payload.botInstructions || []);
    payload.attendanceEvents = (payload.attendanceEvents || []).filter((entry) => user.role === "admin" || !user.branchId || entry.branchId === user.branchId).slice(0, 200);
    if (user.role === "agent") {
      payload.calls = (payload.calls || []).filter((call) => {
        const sameBranch = !user.branchId || !call.branchId || call.branchId === user.branchId;
        return sameBranch && (!call.ownerUserId || call.ownerUserId === user.id || call.answeredByUserId === user.id);
      });
    } else if (["manager", "supervisor"].includes(user.role) && user.branchId) {
      payload.calls = (payload.calls || []).filter((call) => !call.branchId || call.branchId === user.branchId);
    }
  }
  const users = publicUsers().filter((entry) => !user || user.role === "admin" || canViewGlobalReports(user) || !user.branchId || entry.branchId === user.branchId || entry.id === user.id);
  // V15: todas las sucursales viven en el mismo servidor central y comparten una sola base.
  // Cada sucursal conserva su propia sesión de WhatsApp y sus usuarios quedan ligados a esa sucursal.
  const branches = publicBranches().filter((branch) => branch.active !== false || branch.id === primaryBranchId());
  return {
    revision: store.revision,
    connection: connectionState(),
    branchConnections: publicBranches().map((branch) => branch.connection),
    ...payload,
    branches,
    whatsappLines: user ? (data.whatsappLines||[]).filter((line)=>canUserMonitorWhatsappLine(user,line)).map((line)=>publicWhatsappLine(line,user)) : [],
    users,
    presence: user ? presenceForUser(user) : { scope: "self", users: [], counts: { active: 0, paused: 0, away: 0, offline: 0 } },
    news: user ? publicNewsFor(user) : [],
    newsUnreadCount: user ? publicNewsFor(user).filter((entry) => !entry.read).length : 0,
    sharedDrive: sharedDrivePublicStatus(user),
    modules: { ...(data.settings.modules || {}) },
    aiFeatures: safeAiFeaturesFor(user),
    tasks: visibleTasksFor(user),
    objectives: visibleObjectivesFor(user),
    approvals: visibleApprovalsFor(user),
    communicationRequests: visibleCommunicationRequests(user),
    operationalAlerts: automaticOperationalAlerts(user),
    advanced: user ? { overview: advancedOverview(user), opportunities:(data.opportunities||[]).filter(o=>user.role==="admin"||user.role==="manager"||!user.branchId||o.branchId===user.branchId).slice(0,200), orders:(data.orders||[]).filter(o=>user.role==="admin"||user.role==="manager"||!user.branchId||o.branchId===user.branchId).slice(0,200), visits:(data.visits||[]).filter(v=>user.role==="admin"||user.role==="manager"||!user.branchId||v.branchId===user.branchId).slice(0,200), training:(data.trainingItems||[]).filter(t=>t.active!==false).slice(0,100), securityAlerts:(data.securityAlerts||[]).filter(a=>user.role==="admin"||user.role==="manager"||user.role==="supervisor").slice(0,100) } : undefined,
    superAutomation: user?.role === "admin" ? { settings:{...data.settings.superAutomation}, stageLabels:{...data.settings.stageLabels}, rules:(data.automationRules||[]).slice(0,500), waits:(data.automationWaits||[]).filter((entry)=>entry.status==="waiting").slice(0,200), executions:(data.automationExecutions||[]).slice(0,200), runtime:{lastError:superAutomationRuntime.lastError||null,lastRunAt:superAutomationRuntime.lastRunAt||null} } : undefined,
    adminGuide: user?.role === "admin" ? { ...data.settings.adminGuide } : { enabled:false },
    aiGovernance: user?.role === "admin" ? { ...data.settings.aiGovernance } : { autonomyDefault:data.settings.aiGovernance?.autonomyDefault||3,maxExternalAutonomy:data.settings.aiGovernance?.maxExternalAutonomy||3 },
    currentUser: user ? { id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId || null, branchName: getBranch(user.branchId)?.name || "Administración general", clientDailyLimit: Number(user.clientDailyLimit || 0), attendance: { ...(user.attendance || { status: "offline" }) }, permissions: { ...reportPermissions(user), campaignView: user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.campaignView === true, campaignManage: user.role === "admin" || user.permissions?.campaignManage === true, customFieldsManage: user.role === "admin" || user.permissions?.customFieldsManage === true, attendanceManage: user.role === "admin" || ["manager", "supervisor"].includes(user.role) || user.permissions?.attendanceManage === true, newsPublish: canPublishNews(user) } } : undefined,
  };
}

function unwrapMessage(message) {
  let current = message;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }
  return current || {};
}

function extractText(message) {
  const content = unwrapMessage(message);
  return cleanText(
    content.conversation ||
      content.extendedTextMessage?.text ||
      content.imageMessage?.caption ||
      content.videoMessage?.caption ||
      content.documentMessage?.caption ||
      content.buttonsResponseMessage?.selectedDisplayText ||
      content.listResponseMessage?.title ||
      "",
    6000,
  );
}

function messageTime(messageTimestamp) {
  if (!messageTimestamp) return Date.now();
  const seconds = Number(messageTimestamp);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
}

function safeFileName(value, fallback = "archivo") {
  const cleaned = String(value || fallback)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function extensionForMime(mimeType, kind = "document") {
  const mime = String(mimeType || "").split(";")[0].toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/webm": ".webm",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
  };
  return map[mime] || { image: ".jpg", video: ".mp4", audio: ".ogg", document: ".bin" }[kind] || ".bin";
}

function mediaInfo(message) {
  const content = unwrapMessage(message);
  const candidates = [
    ["image", content.imageMessage],
    ["video", content.videoMessage || content.ptvMessage],
    ["audio", content.audioMessage],
    ["document", content.documentMessage],
    ["image", content.stickerMessage],
  ];
  const [kind, media] = candidates.find(([, value]) => value) || [];
  if (!kind || !media) return null;
  const mimeType = cleanText(media.mimetype, 160) || {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/ogg",
    document: "application/octet-stream",
  }[kind];
  const caption = cleanText(media.caption, 4000);
  const defaultName = `${kind}-${Date.now()}${extensionForMime(mimeType, kind)}`;
  return {
    kind,
    mimeType,
    caption,
    fileName: safeFileName(media.fileName, defaultName),
    declaredSize: Math.max(0, Number(media.fileLength) || 0),
    duration: Math.max(0, Number(media.seconds) || 0),
    ptt: Boolean(media.ptt),
  };
}

function messageLabel(info) {
  if (!info) return "";
  const labels = {
    image: "Imagen",
    video: "Video",
    audio: info.ptt ? "Mensaje de voz" : "Audio",
    document: `Documento: ${info.fileName}`,
  };
  return info.caption || `[${labels[info.kind] || "Archivo"}]`;
}

function isKnownMessage(messageId) {
  return Boolean(
    messageId &&
      (seenMessages.has(messageId) || (data.processedMessageIds || []).includes(messageId)),
  );
}

function shouldImportMessage(item, source) {
  if (source === "notify") return true;
  const occurredAt = messageTime(item.messageTimestamp);
  const oldestAllowed = syncCutoffAt - 2 * 60 * 1000;
  return occurredAt >= oldestAllowed && occurredAt <= Date.now() + 5 * 60 * 1000;
}

function isDirectChat(jid) {
  return Boolean(
    jid &&
      jid !== "status@broadcast" &&
      !jid.endsWith("@g.us") &&
      !jid.endsWith("@broadcast") &&
      !jid.endsWith("@newsletter"),
  );
}

async function saveAttachmentBuffer(buffer, info, attachmentId = makeId("attachment")) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("El archivo está vacío.");
  if (buffer.length > maximumMediaBytes) {
    throw new Error("El archivo supera el límite de 64 MB.");
  }
  await mkdir(mediaDirectory, { recursive: true });
  const suppliedExtension = path.extname(info.fileName || "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 12);
  const storedName = `${attachmentId}${suppliedExtension || extensionForMime(info.mimeType, info.kind)}`;
  await writeFile(path.join(mediaDirectory, storedName), buffer, { mode: 0o600 });
  return {
    id: attachmentId,
    kind: info.kind,
    fileName: safeFileName(info.fileName),
    mimeType: cleanText(info.mimeType, 160) || "application/octet-stream",
    size: buffer.length,
    duration: Math.max(0, Number(info.duration) || 0),
    storedName,
    available: true,
  };
}

async function downloadIncomingAttachment(item, info) {
  const attachmentId = makeId("attachment");
  const unavailable = {
    id: attachmentId,
    kind: info.kind,
    fileName: safeFileName(info.fileName),
    mimeType: info.mimeType,
    size: info.declaredSize,
    duration: info.duration,
    storedName: null,
    available: false,
  };
  if (info.declaredSize > maximumMediaBytes || !downloadMediaMessage) return unavailable;
  try {
    const buffer = await downloadMediaMessage(item, "buffer", {}, {
      logger: whatsappLogger,
      reuploadRequest: (message) => whatsappSocket?.updateMediaMessage(message),
    });
    return await saveAttachmentBuffer(buffer, info, attachmentId);
  } catch (error) {
    console.error("[media download]", error?.message || error);
    return unavailable;
  }
}

function findAttachment(attachmentId) {
  for (const deal of data.deals) {
    for (const message of deal.messages || []) {
      if (message.attachment?.id === attachmentId) return message.attachment;
    }
  }
  return null;
}

function stockContext() {
  const active = data.products.filter((product) => product.active !== false);
  if (!active.length) return "No hay productos cargados en el stock.";
  const productFields = (data.customFieldDefinitions || []).filter((field) => field.active !== false && field.entity === "product" && field.botReadable !== false);
  return active
    .slice(0, 120)
    .map((product) => {
      const custom = productFields.map((field) => {
        const value = product.customFields?.[field.key];
        return `${field.label} (${field.key}): ${value === undefined || value === "" ? "sin dato" : value}; contexto: ${field.context || "sin contexto"}${field.botWritable ? " [editable por bot]" : ""}`;
      }).join(" | ");
      return `${product.sku} | ${product.name} | disponible: ${product.available}` +
        (product.price ? ` | precio: ${product.price}` : "") +
        (custom ? ` | ${custom}` : "");
    })
    .join("\n");
}


const assistantDocumentMaxBytes = 24 * 1024 * 1024;

function assistantDocumentById(id) {
  return (data.assistantDocuments || []).find((document) => document.id === id) || null;
}

function assistantDocumentFile(document) {
  if (!document?.storedName) return null;
  return path.join(assistantDocumentsDirectory, path.basename(document.storedName));
}

function decodeXmlText(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function encodeXmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseZipEntries(buffer) {
  // DOCX usa ZIP normal con archivos comprimidos por DEFLATE. Se lee el directorio central,
  // evitando depender de paquetes externos para que la versión portable siga funcionando offline.
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("El documento DOCX no tiene un ZIP válido.");
  const entriesCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entriesCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("El DOCX contiene un directorio inválido.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("El DOCX contiene una entrada inválida.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let entryData;
    if (method === 0) entryData = Buffer.from(compressed);
    else if (method === 8) entryData = inflateRawSync(compressed);
    else throw new Error(`El DOCX usa un método de compresión no soportado (${method}).`);
    if (uncompressedSize && entryData.length !== uncompressedSize) {
      throw new Error(`El archivo interno ${name} está incompleto.`);
    }
    entries.push({ name, data: entryData });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractDocxText(buffer) {
  try {
    const entries = parseZipEntries(buffer);
    const xml = entries.find((entry) => entry.name === "word/document.xml")?.data?.toString("utf8") || "";
    const paragraphs = xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n");
    return cleanText(
      [...paragraphs.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXmlText(match[1]))
        .join("")
        .replace(/\n{3,}/g, "\n\n"),
      16000,
    );
  } catch {
    return "";
  }
}

function replaceTokensInWordXml(xml, replacements) {
  const regex = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g;
  const nodes = [];
  let match;
  while ((match = regex.exec(xml))) {
    nodes.push({
      fullStart: match.index,
      fullEnd: regex.lastIndex,
      attrs: match[1] || "",
      text: decodeXmlText(match[2] || ""),
    });
  }
  if (!nodes.length) return xml;

  const applyToken = (token, replacement) => {
    let combined = nodes.map((node) => node.text).join("");
    let from = combined.lastIndexOf(token);
    while (from >= 0) {
      const to = from + token.length;
      let cursor = 0;
      let firstIndex = -1;
      let lastIndex = -1;
      let firstOffset = 0;
      let lastOffset = 0;
      for (let index = 0; index < nodes.length; index += 1) {
        const next = cursor + nodes[index].text.length;
        if (firstIndex < 0 && from >= cursor && from <= next) {
          firstIndex = index;
          firstOffset = from - cursor;
        }
        if (to >= cursor && to <= next) {
          lastIndex = index;
          lastOffset = to - cursor;
          break;
        }
        cursor = next;
      }
      if (firstIndex >= 0 && lastIndex >= firstIndex) {
        if (firstIndex === lastIndex) {
          const original = nodes[firstIndex].text;
          nodes[firstIndex].text = original.slice(0, firstOffset) + replacement + original.slice(lastOffset);
        } else {
          const prefix = nodes[firstIndex].text.slice(0, firstOffset);
          const suffix = nodes[lastIndex].text.slice(lastOffset);
          nodes[firstIndex].text = prefix + replacement;
          for (let i = firstIndex + 1; i < lastIndex; i += 1) nodes[i].text = "";
          nodes[lastIndex].text = suffix;
        }
      }
      combined = nodes.map((node) => node.text).join("");
      from = combined.lastIndexOf(token, Math.max(0, from - 1));
    }
  };

  for (const [key, value] of Object.entries(replacements)) {
    const replacement = String(value ?? "");
    applyToken(`{{${key}}}`, replacement);
    applyToken(`{${key}}`, replacement);
  }

  let output = "";
  let cursor = 0;
  for (const node of nodes) {
    output += xml.slice(cursor, node.fullStart);
    output += `<w:t${node.attrs}>${encodeXmlText(node.text)}</w:t>`;
    cursor = node.fullEnd;
  }
  output += xml.slice(cursor);
  return output;
}

function templateValuesForDeal(deal, requestDetails = "") {
  const client = findClient(data, deal.clientId) || {};
  const branch = getBranch(deal.branchId || primaryBranchId()) || {};
  const user = data.users.find((entry) => entry.id === deal.ownerUserId) || {};
  const activeItems = (deal.items || []).filter((item) => ["reserved", "sold"].includes(item.status));
  const latestIncoming = [...(deal.messages || [])].reverse().find((message) => message.direction === "incoming")?.text || "";
  const pedido = activeItems.length
    ? activeItems.map((item) => `${item.name} x${Number(item.quantity || 0)}`).join(", ")
    : cleanText(requestDetails, 5000) || cleanText(latestIncoming, 5000) || "Sin productos cargados";
  return {
    cliente: client.name || deal.name || "",
    telefono: client.phone || deal.phone || "",
    documento: client.document || "",
    empresa: client.company || "",
    email: client.email || "",
    ciudad: client.city || "",
    direccion: client.address || "",
    responsable: deal.ownerName || user.name || "",
    sucursal: branch.name || "",
    ubicacion_sucursal: [branch.address, branch.city].filter(Boolean).join(", "),
    fecha: new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", dateStyle: "long" }).format(new Date()),
    pedido,
    solicitud: cleanText(requestDetails, 5000) || cleanText(latestIncoming, 5000),
    interes: cleanText(deal.transferInterest || "", 1000) || pedido,
    negociacion_id: deal.id,
  };
}

function replaceTextTemplate(text, values) {
  let output = String(text || "");
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, String(value ?? "")).replaceAll(`{${key}}`, String(value ?? ""));
  }
  return output;
}

async function prepareAssistantDocumentBuffer(document, deal, requestDetails = "") {
  const sourcePath = assistantDocumentFile(document);
  if (!sourcePath || !existsSync(sourcePath)) throw new Error("El archivo original ya no está disponible.");
  const input = await readFile(sourcePath);
  const values = templateValuesForDeal(deal, requestDetails);
  const extension = path.extname(document.fileName || "").toLowerCase();

  if (extension === ".docx" || /wordprocessingml/i.test(document.mimeType || "")) {
    const entries = parseZipEntries(input).map((entry) => {
      if (/^word\/(document|header\d*|footer\d*)\.xml$/i.test(entry.name)) {
        return { ...entry, data: Buffer.from(replaceTokensInWordXml(entry.data.toString("utf8"), values), "utf8") };
      }
      return entry;
    });
    return { buffer: createStoredZip(entries), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: ".docx" };
  }

  if ([".txt", ".md", ".html", ".htm", ".csv", ".json"].includes(extension) || /^text\//i.test(document.mimeType || "")) {
    const output = replaceTextTemplate(input.toString("utf8"), values);
    return { buffer: Buffer.from(output, "utf8"), mimeType: document.mimeType || "text/plain", extension: extension || ".txt" };
  }

  // Para PDF, imágenes y otros formatos se conserva el original: pueden ser recomendados y enviados,
  // pero no se simula una edición que el formato no permite de forma segura.
  return { buffer: input, mimeType: document.mimeType || "application/octet-stream", extension: extension || ".bin", unmodified: true };
}

function documentSearchScore(document, text) {
  const haystack = `${document.title || ""} ${(document.tags || []).join(" ")} ${document.context || ""} ${document.extractedText || ""}`.toLocaleLowerCase("es");
  const words = cleanText(text, 3000).toLocaleLowerCase("es").split(/[^a-záéíóúüñ0-9]+/i).filter((word) => word.length >= 4);
  let score = 0;
  for (const word of new Set(words)) if (haystack.includes(word)) score += word.length >= 7 ? 3 : 1;
  return score;
}

function candidateAssistantDocuments(text) {
  return (data.assistantDocuments || [])
    .filter((document) => document.active !== false)
    .map((document) => ({ document, score: documentSearchScore(document, text) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(b.document.updatedAt).localeCompare(String(a.document.updatedAt)))
    .slice(0, 4)
    .map((entry) => entry.document);
}

function branchDirectoryReply() {
  const branches = (data.branches || []).filter((branch) => branch.active !== false);
  if (!branches.length) return "";
  return [
    "Claro. Estas son nuestras sucursales:",
    ...branches.map((branch) => `• ${branch.name}: ${[branch.address, branch.city].filter(Boolean).join(", ") || "ubicación a confirmar"}${branch.phone ? ` · WhatsApp ${branch.phone}` : ""}`),
    "¿Cuál te queda más cómoda?",
  ].join("\n");
}

function fallbackCopilotSuggestion(deal) {
  const latestIncoming = [...(deal.messages || [])].reverse().find((message) => message.direction === "incoming");
  const text = cleanText(latestIncoming?.text || "", 4000);
  const lower = text.toLocaleLowerCase("es");
  const documents = candidateAssistantDocuments(text);
  let reply = "";
  let reason = "Sugerencia basada en la conversación y los datos disponibles en el CRM.";

  if (/(ubicaci|direcci|d[oó]nde|sucursal|local|mapa)/i.test(lower)) {
    reply = branchDirectoryReply();
    reason = "El cliente parece estar consultando por ubicación o sucursales.";
  } else if (/(stock|disponib|ten[eé]s|tienen|hay\s|precio|cu[aá]nto)/i.test(lower)) {
    const matches = findProductByQuery(data, text).slice(0, 4);
    if (matches.length) {
      reply = matches.map((product) => `${product.name}: ${Number(product.available || 0)} disponible${Number(product.available || 0) === 1 ? "" : "s"}${product.price ? ` · ${new Intl.NumberFormat("es-PY", { style: "currency", currency: "PYG", maximumFractionDigits: 0 }).format(Number(product.price))}` : ""}`).join("\n");
      reply = `Te confirmo el stock actual:\n${reply}\n\nSi querés, te ayudo a reservarlo.`;
      reason = "Encontré productos relacionados con la consulta y usé el stock real del sistema.";
    } else {
      reply = `¡Claro${deal.name ? `, ${deal.name}` : ""}! Decime qué producto o código querés consultar y te confirmo la disponibilidad actual.`;
      reason = "La consulta parece ser de stock, pero falta identificar el producto.";
    }
  } else {
    const quick = (data.quickReplies || []).filter((item) => item.active !== false)
      .map((item) => ({ item, score: documentSearchScore({ title: item.title, tags: [item.shortcut, item.category], context: item.body, extractedText: "" }, text) }))
      .sort((a, b) => b.score - a.score)[0];
    if (quick?.score > 0) {
      reply = String(quick.item.body || "")
        .replaceAll("{cliente}", deal.name || "cliente")
        .replaceAll("{telefono}", deal.phone || "")
        .replaceAll("{agente}", deal.ownerName || "asesor");
      reason = `Usé la respuesta rápida “${quick.item.title}” como base.`;
    } else {
      reply = `Gracias por escribirnos${deal.name ? `, ${deal.name}` : ""}. Entendí tu consulta y te ayudo con gusto. ¿Podés confirmarme un poco más de detalle para darte una respuesta precisa?`;
    }
  }

  return { reply: cleanText(reply, 4000), reason, documentIds: documents.map((document) => document.id), source: "crm" };
}

async function requestCopilotAi(deal, fallback) {
  if (!data.settings.apiKey) return fallback;
  const client = findClient(data, deal.clientId) || {};
  const branch = getBranch(deal.branchId || primaryBranchId()) || {};
  const latestIncoming = [...(deal.messages || [])].reverse().find((message) => message.direction === "incoming")?.text || "";
  const candidates = candidateAssistantDocuments(latestIncoming);
  const documentContext = candidates.length
    ? candidates.map((document) => `ID=${document.id} | ${document.title} | etiquetas=${(document.tags || []).join(", ")} | uso=${cleanText(document.context, 900)}`).join("\n")
    : "Sin documentos relacionados.";
  const recent = (deal.messages || []).slice(-10).map((message) => `${message.direction === "incoming" ? "CLIENTE" : "AGENTE"}: ${cleanText(message.text, 1200)}`).join("\n");
  const branchContext = (data.branches || []).filter((item) => item.active !== false).map((item) => `${item.name}: ${[item.address, item.city].filter(Boolean).join(", ")}; WhatsApp ${item.phone || "sin número"}`).join("\n");
  const stock = (data.products || []).filter((product) => product.active !== false).slice(0, 100).map((product) => `${product.sku} | ${product.name} | disponible=${product.available} | precio=${product.price || ""}`).join("\n");

  const prompt = [
    "Sos un COPILOTO para un agente humano de atención. NO sos el bot automático y NUNCA enviás nada por tu cuenta.",
    "Proponé una respuesta lista para que el agente la revise. No digas que sos IA.",
    "Usá únicamente datos provistos. No inventes ubicaciones, stock, precios, pedidos ni documentos.",
    "Si hay un documento útil, recomendá hasta 2 IDs de la lista. No inventes IDs.",
    "Respondé SOLO JSON válido con: reply (string), reason (string breve), documentIds (array de strings).",
    `CLIENTE: ${client.name || deal.name || deal.phone}; teléfono=${client.phone || deal.phone}; empresa=${client.company || ""}; ciudad=${client.city || ""}.`,
    `SUCURSAL ACTUAL: ${branch.name || ""}.`,
    `SUCURSALES:\n${branchContext || "Sin datos"}`,
    `STOCK:\n${stock || "Sin productos"}`,
    `DOCUMENTOS DISPONIBLES:\n${documentContext}`,
    `CONVERSACIÓN RECIENTE:\n${recent}`,
    `ÚLTIMO MENSAJE DEL CLIENTE:\n${latestIncoming}`,
  ].join("\n\n");

  try {
    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: data.settings.model,
        messages: [{ role: "system", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 700,
        temperature: 0.35,
      }),
    });
    if (!result.ok) throw new Error(`IA ${result.status}`);
    const json = await result.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    const allowedIds = new Set((data.assistantDocuments || []).filter((document) => document.active !== false).map((document) => document.id));
    const reply = cleanText(parsed.reply, 4000);
    if (!reply) return fallback;
    return {
      reply,
      reason: cleanText(parsed.reason, 500) || "Sugerencia creada con el contexto del CRM.",
      documentIds: Array.isArray(parsed.documentIds) ? parsed.documentIds.filter((id) => allowedIds.has(id)).slice(0, 2) : [],
      source: "ai",
    };
  } catch (error) {
    console.error("[copilot]", error?.message || error);
    return fallback;
  }
}

async function createCopilotSuggestion(deal) {
  const fallback = fallbackCopilotSuggestion(deal);
  return requestCopilotAi(deal, fallback);
}

function hasExplicitConfirmation(message, evidence) {
  const text = cleanText(message, 6000).toLocaleLowerCase("es");
  const proof = cleanText(evidence, 300).toLocaleLowerCase("es");
  if (!proof || !text.includes(proof)) return false;
  return /\b(si|sí|confirmo|confirmado|quiero|dale|de acuerdo|ok|okay|reservá|reserva|llevo|dame|agregá|agrega)\b/i.test(
    proof,
  );
}

async function executeAiTool(toolCall, deal, clientMessage) {
  let args = {};
  try {
    args = JSON.parse(toolCall.function?.arguments || "{}");
  } catch {
    return { ok: false, error: "Argumentos inválidos." };
  }

  if (toolCall.function?.name === "consultar_stock") {
    const matches = findProductByQuery(data, args.consulta).map((product) => ({
      id: product.id,
      codigo: product.sku,
      producto: product.name,
      disponible: product.available,
      precio: product.price || null,
    }));
    return { ok: true, resultados: matches };
  }

  if (toolCall.function?.name === "reservar_stock") {
    if (!data.settings.botCanReserve) {
      return { ok: false, error: "La reserva automática está desactivada." };
    }
    if (args.confirmado !== true || !hasExplicitConfirmation(clientMessage, args.evidencia)) {
      return {
        ok: false,
        error: "No existe una confirmación explícita verificable en el mensaje del cliente.",
      };
    }
    const query = cleanText(args.producto, 160);
    const matches = findProductByQuery(data, query);
    const exact = matches.find(
      (product) =>
        product.sku.toLowerCase() === query.toLowerCase() ||
        product.name.toLowerCase() === query.toLowerCase(),
    );
    const product = exact || (matches.length === 1 ? matches[0] : null);
    if (!product) {
      return { ok: false, error: "No se encontró un único producto para reservar." };
    }
    try {
      const result = reserveProduct(
        data,
        deal.id,
        product.id,
        args.cantidad,
        "bot",
      );
      addActivity(
        data,
        `El bot reservó ${Math.max(1, Math.trunc(Number(args.cantidad) || 1))} × ${product.name}.`,
        "success",
      );
      await store.save();
      return {
        ok: true,
        producto: result.product.name,
        cantidad: Math.max(1, Math.trunc(Number(args.cantidad) || 1)),
        disponible_restante: result.product.available,
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }


  if (toolCall.function?.name === "actualizar_contacto") {
    if (!aiFeatureEnabled("dataExtraction") || data.settings.aiSuite?.allowAutoFieldUpdates === false) return { ok: false, error: "Captura automática de datos desactivada por administración." };
    const client = findClient(data, deal.clientId);
    if (!client) return { ok: false, error: "Cliente no encontrado." };
    const field = cleanText(args.campo, 80);
    const allowed = new Set(["name", "document", "ruc", "email", "company", "city", "address"]);
    if (!allowed.has(field)) return { ok: false, error: "Campo de contacto no permitido." };
    const value = cleanText(args.valor, field === "address" ? 240 : 160);
    const evidence = cleanText(args.evidencia, 500);
    const normalizedMessage = cleanText(clientMessage, 6000).toLocaleLowerCase("es");
    const normalizedEvidence = evidence.toLocaleLowerCase("es");
    if (!value || !evidence || !normalizedMessage.includes(normalizedEvidence)) return { ok: false, error: "El dato no está respaldado por el mensaje del cliente." };
    const contactPerson = client.entityType === "company" && deal.contactPersonId
      ? (client.contactPersons || []).find((entry) => entry.id === deal.contactPersonId)
      : null;
    if (contactPerson && ["name", "email"].includes(field)) {
      contactPerson[field] = value;
      contactPerson.updatedAt = nowIso();
      if (field === "name") deal.contactPersonName = value;
      addActivity(data, `El bot actualizó ${field} de la persona de contacto ${contactPerson.name || deal.contactPersonName || "del cliente"}.`, "success");
      recordAuditEvent(null, "bot_actualizo_persona_contacto", { dealId: deal.id, clientId: client.id, contactPersonId: contactPerson.id, field, value }, deal.branchId, "bot");
      await store.save();
      return { ok: true, entidad: "persona_contacto", campo: field, valor: value };
    }
    updateClient(data, client.id, { [field]: value });
    addActivity(data, `El bot actualizó ${field} de ${client.name || deal.name}.`, "success");
    recordAuditEvent(null, "bot_actualizo_contacto", { dealId: deal.id, clientId: client.id, field, value }, deal.branchId, "bot");
    await store.save();
    return { ok: true, entidad: "cliente_maestro", campo: field, valor: value };
  }

  if (toolCall.function?.name === "actualizar_campo_personalizado") {
    if (!aiFeatureEnabled("dataExtraction") || data.settings.aiSuite?.allowAutoFieldUpdates === false) return { ok: false, error: "Captura automática de datos desactivada por administración." };
    const entityType = ["contact", "deal", "product"].includes(args.entidad) ? args.entidad : "contact";
    const field = fieldDefinition(args.campo, entityType);
    if (!field || field.botWritable !== true) return { ok: false, error: "El campo no está habilitado para escritura automática del bot." };
    const evidence = cleanText(args.evidencia, 500);
    if (!evidence || !cleanText(clientMessage, 6000).toLocaleLowerCase("es").includes(evidence.toLocaleLowerCase("es"))) return { ok: false, error: "El valor no está respaldado por el mensaje del cliente." };
    let entity = entityType === "contact" ? findClient(data, deal.clientId) : entityType === "deal" ? deal : null;
    if (entityType === "product") {
      const matches = findProductByQuery(data, cleanText(args.producto, 160));
      entity = matches.length === 1 ? matches[0] : matches.find((item) => item.sku.toLowerCase() === cleanText(args.producto, 160).toLowerCase());
    }
    if (!entity) return { ok: false, error: "No se pudo identificar la entidad a actualizar." };
    const value = setCustomField(entityType, entity, field, args.valor);
    recordAuditEvent(null, "bot_actualizo_campo_personalizado", { dealId: deal.id, entityType, field: field.key, value }, deal.branchId, "bot");
    await store.save();
    return { ok: true, entidad: entityType, campo: field.key, valor: value };
  }

  return { ok: false, error: "Herramienta no reconocida." };
}

async function requestAi(messages, tools) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: data.settings.model,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 600,
      temperature: 0.4,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Servicio de IA: ${response.status} ${body.slice(0, 180)}`);
  }
  return response.json();
}

async function createAiReply(deal, userMessage) {
  if (!data.settings.apiKey) return null;
  const globalProfile = centralClientProfileByPhone(deal.phone);
  const globalClientContext = globalProfile?.found ? [
    `Cliente identificado: ${globalProfile.name || deal.name || deal.phone}.`,
    globalProfile.lastSale ? `Última venta: ${globalProfile.lastSale.branchName || "Sucursal"}, responsable ${globalProfile.lastSale.ownerName || "sin responsable"}, ${globalProfile.lastSale.items?.map((item) => `${item.name} x${item.quantity}`).join(", ") || "sin detalle"}.` : "Sin ventas previas sincronizadas.",
    globalProfile.lastContact ? `Último contacto: ${globalProfile.lastContact.branchName || "Sucursal"}, responsable ${globalProfile.lastContact.ownerName || "sin responsable"}.` : "",
  ].filter(Boolean).join("\n") : `Cliente actual: ${deal.name || deal.phone}.`;
  const treatment = botTreatmentFor(deal);
  const client = findClient(data, deal.clientId) || {};
  const currentIdentityContext = client.entityType === "company"
    ? [
        `Cliente Maestro (empresa): ${client.name || client.company || deal.name || "Empresa sin nombre"}.`,
        `Persona que escribe ahora: ${deal.contactPersonName || "contacto no identificado"}${deal.contactRole ? ` (${deal.contactRole})` : ""}.`,
        `Número de esta conversación: ${deal.phone || "sin número"}.`,
        "No reemplaces el nombre o la razón social de la empresa por el nombre de un empleado. Si el empleado identificado aporta su nombre o correo, actualizá su Persona de Contacto.",
      ].join("\n")
    : `Cliente Maestro (persona): ${client.name || deal.name || deal.phone || "Cliente"}. Número de esta conversación: ${deal.phone || client.phone || "sin número"}.`;
  const customContext = [
    customFieldContext("contact", client.customFields || {}),
    customFieldContext("deal", deal.customFields || {}),
  ].filter(Boolean).join("\n");
  const tools = [
    {
      type: "function",
      function: {
        name: "consultar_stock",
        description: "Consulta productos disponibles antes de informar disponibilidad.",
        parameters: {
          type: "object",
          properties: {
            consulta: { type: "string", description: "Código o nombre del producto." },
          },
          required: ["consulta"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reservar_stock",
        description:
          "Reserva stock solo cuando el cliente confirmó explícitamente el producto y la cantidad en su último mensaje.",
        parameters: {
          type: "object",
          properties: {
            producto: { type: "string" },
            cantidad: { type: "integer", minimum: 1 },
            confirmado: { type: "boolean" },
            evidencia: {
              type: "string",
              description: "Fragmento textual exacto del mensaje que demuestra la confirmación.",
            },
          },
          required: ["producto", "cantidad", "confirmado", "evidencia"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "actualizar_contacto",
        description: "Actualiza un dato del contacto SOLO cuando el cliente lo indicó explícitamente en su mensaje.",
        parameters: {
          type: "object",
          properties: {
            campo: { type: "string", enum: ["name", "document", "ruc", "email", "company", "city", "address"] },
            valor: { type: "string" },
            evidencia: { type: "string", description: "Fragmento exacto del mensaje del cliente que contiene el dato." },
          },
          required: ["campo", "valor", "evidencia"], additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "actualizar_campo_personalizado",
        description: "Carga automáticamente un campo personalizado habilitado para el bot cuando el cliente aporta el dato explícitamente.",
        parameters: {
          type: "object",
          properties: {
            entidad: { type: "string", enum: ["contact", "deal", "product"] },
            campo: { type: "string", description: "Clave o ID del campo personalizado." },
            valor: {},
            producto: { type: "string", description: "Solo si entidad=product: nombre o SKU para identificar un único producto." },
            evidencia: { type: "string", description: "Fragmento exacto del mensaje que respalda el dato." },
          },
          required: ["entidad", "campo", "valor", "evidencia"], additionalProperties: false,
        },
      },
    },
  ];
  const recent = (deal.messages || [])
    .slice(-12, -1)
    .map((message) => ({
      role: message.direction === "incoming" ? "user" : "assistant",
      content: message.text,
    }));
  const messages = [
    {
      role: "system",
      content:
        `${data.settings.instructions}\n\n` +
        `TRATO PARA ESTE CLIENTE:\n${treatment.instructions}\n\n` +
        `INSTRUCCIONES AUTOMÁTICAS CONFIGURADAS:\n${activeBotInstructionsText()}\n\n` +
        `CAMPOS PERSONALIZADOS Y CONTEXTO:\n${customContext || "Sin campos personalizados."}\n\n` +
        "REGLAS DEL SISTEMA:\n" +
        "- Cuando el cliente diga explícitamente su nombre y apellido, documento, RUC, correo, empresa, ciudad o dirección, usá actualizar_contacto antes de responder.\n" +
        "- Si aporta un dato correspondiente a un campo personalizado marcado como editable por el bot, usá actualizar_campo_personalizado.\n" +
        "- Nunca deduzcas ni inventes datos para completar campos. La evidencia debe estar en el último mensaje.\n" +
        "- Nunca inventes stock, precios ni reservas.\n" +
        "- Consultá el stock con la herramienta cuando el cliente pregunte por un producto.\n" +
        "- Solo reservá si el último mensaje contiene confirmación explícita del producto y la cantidad.\n" +
        "- Si falta información, preguntá antes de reservar.\n" +
        "- Respondé solamente con el mensaje final destinado al cliente.\n\n" +
        `IDENTIDAD ACTUAL:\n${currentIdentityContext}\n\n` +
        `CONTEXTO GLOBAL DEL CLIENTE:\n${globalClientContext}\n\n` +
        `STOCK ACTUAL DE ESTA SUCURSAL:\n${stockContext()}`,
    },
    ...recent,
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < 3; round += 1) {
    const result = await requestAi(messages, tools);
    const message = result.choices?.[0]?.message;
    if (!message) throw new Error("La IA no devolvió una respuesta.");
    if (!message.tool_calls?.length) {
      const reply = cleanText(message.content, 4000);
      if (!reply) throw new Error("La IA no devolvió texto.");
      return reply;
    }
    messages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: message.tool_calls,
    });
    for (const call of message.tool_calls) {
      const output = await executeAiTool(call, deal, userMessage);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }
  throw new Error("La IA realizó demasiadas consultas sin responder.");
}

function dealBranchId(deal) { return deal?.branchId || primaryBranchId(); }
function dealLineId(deal) { return dealWhatsappLine(deal)?.id || null; }
function lineSocket(lineId) {
  const line=whatsappLineById(lineId);
  if(!line) return null;
  if(line.legacyBranchSession) return branchSocket(line.branchId);
  return line.provider==="qr" ? extraLineRuntime(line.id).socket : null;
}
function lineStatus(lineId) { return whatsappLineConnectionState(lineId).status; }
function lineConfiguredPhone(lineId) { const line=whatsappLineById(lineId); const state=whatsappLineConnectionState(lineId); return normalizePhone(line?.phone||state.account||""); }

function branchSocket(branchId) {
  if (!branchId || branchId === primaryBranchId()) return whatsappSocket;
  return extraBranchRuntime(branchId).socket;
}

function branchStatus(branchId) {
  if (!branchId || branchId === primaryBranchId()) return data.settings.whatsappMode === "cloud" ? (cloudApiConfigured() ? "connected" : "disconnected") : connectionStatus;
  return extraBranchRuntime(branchId).status;
}

function branchConfiguredPhone(branchId) {
  const branch = getBranch(branchId);
  const runtime = branchId === primaryBranchId() ? { account: connectedAccount } : extraBranchRuntime(branchId);
  return normalizePhone(branch?.phone || runtime.account || "");
}

function branchByPhone(value) {
  const phone = normalizePhone(value);
  if (!phone) return null;
  const branch=(data.branches || []).find((entry) => branchConfiguredPhone(entry.id) === phone);
  if(branch) return branch;
  const line=(data.whatsappLines||[]).find((entry)=>entry.active!==false && normalizePhone(entry.phone||whatsappLineConnectionState(entry.id).account||"")===phone);
  return line ? getBranch(line.branchId) : null;
}

function phoneFromAnyJid(jid) {
  return normalizePhone(String(jid || "").split("@")[0].split(":")[0]);
}

function branchFromMessageKey(item, packet = null) {
  const key = item?.key || {};
  const candidates = [
    key.remoteJidAlt,
    key.participantAlt,
    key.remoteJid,
    key.participant,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const branch = branchByPhone(phoneFromAnyJid(candidate));
    if (branch) return branch;
  }
  const packetPhone = normalizePhone(packet?.sourcePhone || "");
  if (packetPhone) {
    const branch = branchByPhone(packetPhone);
    if (branch) return branch;
  }
  const packetCode = cleanText(packet?.sourceCode, 40).toUpperCase();
  if (packetCode) {
    return (data.branches || []).find((branch) => cleanText(branch.code, 40).toUpperCase() === packetCode) || null;
  }
  return null;
}

function isInternalBranchJid(jid) {
  return Boolean(branchByPhone(phoneFromAnyJid(jid)));
}

function branchLocation(branch) {
  return [cleanText(branch?.address, 240), cleanText(branch?.city, 120)].filter(Boolean).join(", ") || "nuestra sucursal";
}

function transferContextText(transfer = {}) {
  const interest = cleanText(transfer.interest, 300);
  const reason = cleanText(transfer.reason, 600);
  if (interest && reason) return `Nos informaron que tu interés es ${interest} y que el motivo de contacto es ${reason}. ¿Seguís interesado en ${interest}?`;
  if (interest) return `Nos informaron que estás interesado en ${interest}. ¿Seguís interesado en ese producto?`;
  if (reason) return `Nos derivaron tu consulta por ${reason}. ¿Seguís necesitando ayuda con ese motivo?`;
  return "Nos derivaron tu consulta desde otra sucursal. ¿Seguís necesitando asistencia?";
}

function renderBranchIntro(branch, sourceBranch, client, transfer = {}) {
  const template = cleanText(branch?.introMessage, 1200) || "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}";
  const interest = cleanText(transfer.interest, 300);
  const reason = cleanText(transfer.reason, 600);
  return template
    .replaceAll("{cliente}", cleanText(client?.name, 120) || "")
    .replaceAll("{sucursal}", cleanText(branch?.name, 120) || "la sucursal")
    .replaceAll("{ubicacion}", branchLocation(branch))
    .replaceAll("{origen}", cleanText(sourceBranch?.name || transfer.sourceName, 120) || "otra sucursal")
    .replaceAll("{interes}", interest)
    .replaceAll("{motivo}", reason)
    .replaceAll("{contexto}", transferContextText(transfer))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function encodeTransferPacket(packet) {
  return Buffer.from(JSON.stringify(packet), "utf8").toString("base64url");
}

function decodeTransferPacket(text) {
  const match = String(text || "").match(/\[WBX2:([A-Za-z0-9_-]+)\]/);
  if (!match) return null;
  try {
    const packet = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    return packet && ["branch-transfer-v2", "branch-transfer-v3"].includes(packet.type) ? packet : null;
  } catch {
    return null;
  }
}

function decodeTransferAck(text) {
  const match = String(text || "").match(/\[WBX2ACK:([A-Za-z0-9_-]{6,160})\]/);
  return match ? match[1] : null;
}

function readableTransferMessage(packet) {
  const lines = [
    "📨 DERIVACIÓN DE CLIENTE ENTRE SUCURSALES",
    `CLIENTE: ${cleanText(packet.clientName, 120) || "Sin nombre"}`,
    `TELEFONO: ${normalizePhone(packet.clientPhone)}`,
    `ORIGEN: ${cleanText(packet.sourceName, 120)}`,
    `DESTINO: ${cleanText(packet.targetName, 120)}`,
  ];
  if (packet.interest) lines.push(`INTERES: ${cleanText(packet.interest, 300).replace(/\s+/g, " ")}`);
  if (packet.reason) lines.push(`MOTIVO: ${cleanText(packet.reason, 600).replace(/\s+/g, " ")}`);
  if (packet.note) lines.push(`NOTA: ${cleanText(packet.note, 600).replace(/\s+/g, " ")}`);
  lines.push(`DERIVADO POR: ${cleanText(packet.requestedBy, 120)}`);
  lines.push("", "Mensaje interno de sucursal. No responder manualmente a este número; el CRM debe contactar al cliente indicado arriba.");
  lines.push(`[WBX2:${encodeTransferPacket(packet)}]`);
  return lines.join("\n");
}

function cloudApiBase() {
  const version = cleanText(data.settings.whatsappApi?.apiVersion || "v23.0", 20).replace(/[^v0-9.]/gi, "") || "v23.0";
  return `https://graph.facebook.com/${version}`;
}

async function cloudFetch(endpoint, options = {}) {
  const token = data.settings.whatsappApi?.accessToken;
  if (!token) throw new Error("Configurá el token de acceso de WhatsApp API.");
  const response = await fetch(`${cloudApiBase()}/${String(endpoint).replace(/^\//, "")}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp API: ${response.status} ${detail.slice(0, 260)}`);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.arrayBuffer();
}

async function sendCloudPayload(payload) {
  const phoneNumberId = data.settings.whatsappApi?.phoneNumberId;
  if (!phoneNumberId) throw new Error("Configurá el ID del número de WhatsApp API.");
  return cloudFetch(`${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
}
async function lineCloudFetch(line, endpoint, options = {}) {
  const config=lineCloudConfig(line); const token=config?.accessToken;
  if(!token) throw new Error(`Configurá el token de acceso de ${line?.name||"la línea"}.`);
  const version=cleanText(config?.apiVersion||"v23.0",20).replace(/[^v0-9.]/gi,"")||"v23.0";
  const response=await fetch(`https://graph.facebook.com/${version}/${String(endpoint).replace(/^\//,"")}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});
  if(!response.ok){const detail=await response.text();throw new Error(`WhatsApp API (${line?.name||"línea"}): ${response.status} ${detail.slice(0,260)}`);}
  const type=response.headers.get("content-type")||"";return type.includes("application/json")?response.json():response.arrayBuffer();
}
async function sendLineCloudPayload(line,payload){const phoneNumberId=lineCloudConfig(line)?.phoneNumberId;if(!phoneNumberId)throw new Error(`Configurá el ID del número de ${line?.name||"la línea"}.`);return lineCloudFetch(line,`${phoneNumberId}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",...payload})});}

async function sendProviderText(deal, text) {
  if (mockMode) return makeId("mockmessage");
  const line=dealWhatsappLine(deal);
  if(!line) throw new Error("La negociación no tiene una línea de WhatsApp disponible.");
  if(line.provider==="cloud"){
    if(!lineCloudConfigured(line)) throw new Error(`Cloud API de ${line.name} no está configurada.`);
    const result=await sendLineCloudPayload(line,{to:normalizePhone(deal.phone),type:"text",text:{body:text,preview_url:false}});
    return result.messages?.[0]?.id||makeId("cloudmessage");
  }
  const socket=lineSocket(line.id);
  if(!socket||lineStatus(line.id)!=="connected") throw new Error(`WhatsApp ${line.name} · ${getBranch(line.branchId)?.name||"Sucursal"} no está conectado.`);
  const sent=await socket.sendMessage(deal.jid,{text});
  return sent?.key?.id||makeId("qrmessage");
}


// V20.2 · Super IA de Automatizaciones Administrativas
const superAutomationRuntime = { queue: Promise.resolve(), activeFingerprints: new Map(), lastError: null, lastRunAt: null };


// V20.3 · Centro de Administración IA
const superAdminRuntime = { lastScanAt: null, lastScanError: null, taskOverdueSeen: new Map(), slaSeen: new Map() };

function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

function configurationSnapshot() {
  return {
    settings: {
      modules: cloneJson(data.settings.modules || {}), aiFeatures: cloneJson(data.settings.aiFeatures || {}),
      superAutomation: cloneJson(data.settings.superAutomation || {}), superAdmin: cloneJson(data.settings.superAdmin || {}),
      stageLabels: cloneJson(data.settings.stageLabels || {}), botProfiles: cloneJson(data.settings.botProfiles || {}),
      aiGovernance: cloneJson(data.settings.aiGovernance || {}),
    },
    automationRules: cloneJson(data.automationRules || []), automationSubflows: cloneJson(data.automationSubflows || []),
    customFieldDefinitions: cloneJson(data.customFieldDefinitions || []), quickReplies: cloneJson(data.quickReplies || []),
    whatsappLines: cloneJson(data.whatsappLines || []), crmFlows: cloneJson(data.crmFlows || []), customModules: cloneJson(data.customModules || []),
    dashboardDefinitions: cloneJson(data.dashboardDefinitions || []), roleProfiles: cloneJson(data.roleProfiles || []), aiPolicies: cloneJson(data.aiPolicies || []),
  };
}

function createConfigurationVersion(actor, reason='Cambio administrativo', meta={}) {
  if (data.settings.superAdmin?.versioningEnabled === false) return null;
  const version = { id: makeId('cfgver'), reason: cleanText(reason,240), meta: sanitizeAuditValue(meta), createdAt: timestamp(), createdByUserId: actor?.id || null, createdByName: actor?.name || 'Super IA', snapshot: configurationSnapshot() };
  data.configurationVersions.unshift(version);
  if (data.configurationVersions.length > 80) data.configurationVersions.splice(80);
  return version;
}

function restoreConfigurationVersion(version, actor) {
  if (!version?.snapshot) throw new Error('Versión no restaurable.');
  const snap = cloneJson(version.snapshot);
  createConfigurationVersion(actor, `Antes de restaurar ${version.id}`, { rollbackTarget: version.id });
  data.settings.modules = { ...data.settings.modules, ...(snap.settings?.modules || {}) };
  data.settings.aiFeatures = { ...data.settings.aiFeatures, ...(snap.settings?.aiFeatures || {}) };
  data.settings.superAutomation = { ...data.settings.superAutomation, ...(snap.settings?.superAutomation || {}) };
  data.settings.superAdmin = { ...data.settings.superAdmin, ...(snap.settings?.superAdmin || {}) };
  data.settings.stageLabels = { ...data.settings.stageLabels, ...(snap.settings?.stageLabels || {}) };
  data.settings.botProfiles = { ...data.settings.botProfiles, ...(snap.settings?.botProfiles || {}) };
  data.settings.aiGovernance = { ...data.settings.aiGovernance, ...(snap.settings?.aiGovernance || {}) };
  data.automationRules = snap.automationRules || [];
  data.automationSubflows = snap.automationSubflows || [];
  data.customFieldDefinitions = snap.customFieldDefinitions || [];
  data.quickReplies = snap.quickReplies || [];
  data.whatsappLines = snap.whatsappLines || [];
  data.crmFlows = snap.crmFlows || [];
  data.customModules = snap.customModules || [];
  data.dashboardDefinitions = snap.dashboardDefinitions || [];
  data.roleProfiles = snap.roleProfiles || [];
  data.aiPolicies = snap.aiPolicies || [];
  for (const wait of data.automationWaits || []) if (wait.status === 'waiting' && !data.automationRules.some((rule)=>rule.id===wait.ruleId)) wait.status = 'cancelled';
  recordAuditEvent(actor,'super_ia_rollback',{versionId:version.id,reason:version.reason},actor?.branchId||primaryBranchId(),'user');
}

const SUPER_ADMIN_ACTION_RISK = {
  create_task:'low', add_tag:'low', remove_tag:'low', create_custom_field:'low', add_quick_reply:'low', create_dashboard:'low', create_subflow:'low', set_memory:'low', clear_memory:'low', create_news:'low',
  set_stage:'medium', assign_user:'medium', set_contact_field:'medium', set_deal_field:'medium', set_custom_field:'medium', toggle_bot:'medium', create_approval:'medium', create_order:'medium', set_order_status:'medium', create_visit:'medium', create_objective:'medium', create_deal:'medium', add_bot_instruction:'medium', set_ai_policy:'medium', create_crm_flow:'medium', add_flow_stage:'medium', create_custom_module:'medium', call_subflow:'medium', cancel_pending_actions:'medium', set_module:'medium', set_ai_feature:'medium', rename_stage:'medium',
  reserve_stock:'high', release_reservations:'high', adjust_stock:'high', configure_whatsapp_line:'high', create_role_profile:'high', set_power_policy:'high', set_attendance:'high',
  close_won:'high', close_lost:'destructive', send_whatsapp:'high'
};
const RISK_ORDER = { low:1, medium:2, high:3, destructive:4 };

function flattenAutomationActions(actions=[], out=[]) {
  for (const action of Array.isArray(actions)?actions:[]) {
    if (!action?.type) continue;
    out.push(action);
    if (action.type === 'wait_for_reply') for (const branch of action.branches || []) flattenAutomationActions(branch.actions,out);
    if (action.type === 'wait_for_reply') { flattenAutomationActions(action.defaultActions,out); flattenAutomationActions(action.timeoutActions,out); }
    if (action.type === 'delay') flattenAutomationActions(action.actions,out);
    if (action.type === 'branch_condition') { flattenAutomationActions(action.thenActions,out); flattenAutomationActions(action.elseActions,out); }
  }
  return out;
}

function superAdminRiskForParsed(parsed={}) {
  if (parsed.operation === 'delete_rule') return { level:'destructive', reasons:['Elimina una automatización existente.'] };
  let level = parsed.operation === 'update_rule' ? 'medium' : 'low';
  const actions = flattenAutomationActions(parsed.operation === 'execute_admin_actions' ? parsed.actions : parsed.rule?.actions);
  const reasons=[];
  for (const action of actions) {
    const risk=SUPER_ADMIN_ACTION_RISK[action.type]||'medium';
    if (RISK_ORDER[risk] > RISK_ORDER[level]) level=risk;
    if (RISK_ORDER[risk] >= RISK_ORDER.high) reasons.push(`${action.type}: ${risk}`);
  }
  if (parsed.operation === 'toggle_rule' && parsed.enabled === false) level='medium';
  return { level, reasons:[...new Set(reasons)].slice(0,12) };
}

function automationRuleConflictSummary(candidate, ignoreId=null) {
  if (!candidate) return [];
  const conflicts=[];
  const cTrigger=candidate.trigger||{};
  const cActions=flattenAutomationActions(candidate.actions||[]);
  const cStages=cActions.filter(a=>['set_stage','close_won','close_lost'].includes(a.type)).map(a=>a.type==='set_stage'?a.stage:a.type);
  const cAssign=cActions.filter(a=>a.type==='assign_user').map(a=>a.userId||a.userName||a.strategy||'specific');
  for (const rule of data.automationRules || []) {
    if (rule.id===ignoreId || rule.enabled===false) continue;
    const t=rule.trigger||{};
    if (t.type!==cTrigger.type) continue;
    const sameScope = (!t.branchId || !cTrigger.branchId || t.branchId===cTrigger.branchId) && (!t.lineId || !cTrigger.lineId || t.lineId===cTrigger.lineId);
    if (!sameScope) continue;
    const actions=flattenAutomationActions(rule.actions||[]);
    const stages=actions.filter(a=>['set_stage','close_won','close_lost'].includes(a.type)).map(a=>a.type==='set_stage'?a.stage:a.type);
    const assigns=actions.filter(a=>a.type==='assign_user').map(a=>a.userId||a.userName||a.strategy||'specific');
    const stageConflict=cStages.length&&stages.length&&cStages.some(x=>!stages.includes(x));
    const assignConflict=cAssign.length&&assigns.length&&cAssign.some(x=>!assigns.includes(x));
    if (stageConflict||assignConflict) conflicts.push({ ruleId:rule.id, ruleName:rule.name, type:stageConflict&&assignConflict?'stage_and_assignment':stageConflict?'stage':'assignment', detail:stageConflict?'Dos reglas del mismo evento pueden mover la negociación a destinos distintos.':'Dos reglas del mismo evento pueden asignar responsables distintos.' });
  }
  return conflicts.slice(0,20);
}

function automationMemoryKey(context, scope='rule_client') {
  if (scope==='deal') return `deal:${context.deal?.id||'global'}`;
  if (scope==='client') return `client:${context.client?.id||context.phone||'global'}`;
  return `rule:${context.rule?.id||'global'}:client:${context.client?.id||context.phone||'global'}`;
}

function automationMemoryObject(context) {
  const keys=[automationMemoryKey(context,'rule_client'),automationMemoryKey(context,'client'),automationMemoryKey(context,'deal')];
  const result={};
  for (const entry of data.automationMemory || []) if (keys.includes(entry.scopeKey)) result[entry.key]=entry.value;
  return result;
}

function automationCalculatedValues(deal, client) {
  const won=(data.deals||[]).filter((d)=>d.clientId&&client?.id&&d.clientId===client.id&&d.stage===STAGES.WON);
  const historicalAmount=won.reduce((sum,d)=>sum+(d.items||[]).reduce((s,i)=>s+Number(i.price||i.unitPrice||0)*Number(i.quantity||0),0),0);
  const latest=won.map(d=>d.closedAt||d.updatedAt||d.createdAt).filter(Boolean).sort().at(-1)||client?.lastPurchaseAt||'';
  const daysWithoutBuying=latest?Math.max(0,Math.floor((Date.now()-Date.parse(latest))/86400000)):0;
  const waitingStart=deal?.waitingSince||deal?.updatedAt||deal?.createdAt;
  const waitingMinutes=waitingStart?Math.max(0,Math.floor((Date.now()-Date.parse(waitingStart))/60000)):0;
  const base={new:20,contacted:45,waiting:35,won:100,lost:0,transferred:30}[deal?.stage]??25;
  const closeProbability=Math.max(0,Math.min(100,base+Math.min(20,(deal?.messages||[]).length*2)));
  return { lastPurchase:latest, historicalAmount, daysWithoutBuying, waitingMinutes, closeProbability };
}

function setAutomationMemory(action, context) {
  const scopeKey=automationMemoryKey(context,action.scope||'rule_client');
  const key=cleanText(action.key,100); if(!key)throw new Error('La memoria requiere una clave.');
  const value=automationInterpolate(String(action.value??''),context);
  let entry=(data.automationMemory||[]).find(x=>x.scopeKey===scopeKey&&x.key===key);
  if(!entry){entry={id:makeId('automem'),scopeKey,key,value,createdAt:timestamp(),updatedAt:timestamp()};data.automationMemory.unshift(entry);}else{entry.value=value;entry.updatedAt=timestamp();}
  if(data.automationMemory.length>5000)data.automationMemory.splice(5000);
  context.memory=context.memory||{};context.memory[key]=value;return {scopeKey,key,value};
}
function clearAutomationMemory(action,context){const scopeKey=automationMemoryKey(context,action.scope||'rule_client'),key=cleanText(action.key,100);const before=data.automationMemory.length;data.automationMemory=data.automationMemory.filter(x=>!(x.scopeKey===scopeKey&&(!key||x.key===key)));if(key&&context.memory)delete context.memory[key];return {removed:before-data.automationMemory.length};}

function cancelPendingAutomationActions(action,context){let waits=0,delays=0;const scope=action.scope||'deal';const match=(x)=>scope==='rule'?x.ruleId===context.rule?.id:scope==='client'?x.clientId===context.client?.id:x.dealId===context.deal?.id;if(action.includeWaits!==false)for(const x of data.automationWaits||[])if(x.status==='waiting'&&match(x)){x.status='cancelled';x.cancelledAt=timestamp();waits++;}if(action.includeDelays!==false)for(const x of data.automationDelayedActions||[])if(x.status==='pending'&&match(x)){x.status='cancelled';x.cancelledAt=timestamp();delays++;}return {waits,delays};}

function findByNameOrId(list,id,name){if(id){const x=(list||[]).find(e=>e.id===id);if(x)return x;}const needle=cleanText(name,180).toLocaleLowerCase('es');return needle?(list||[]).find(e=>cleanText(e.name,180).toLocaleLowerCase('es')===needle||cleanText(e.name,180).toLocaleLowerCase('es').includes(needle)):null;}

function automationAdminConfigurationV203(action, context) {
  if(action.type==='create_crm_flow'){const flow={id:makeId('flow'),name:action.name,module:action.module||'CRM',description:action.description||'',branchId:context.branch?.id||primaryBranchId(),stages:(action.stages||[]).map((name,i)=>({id:makeId('flowstage'),name,order:i,active:true})),active:true,createdAt:timestamp(),updatedAt:timestamp(),origin:'super-ia'};data.crmFlows.unshift(flow);return flow;}
  if(action.type==='add_flow_stage'){const flow=findByNameOrId(data.crmFlows,action.flowId,action.flowName);if(!flow)throw new Error('No encontré el flujo indicado.');const stage={id:makeId('flowstage'),name:action.stageName||'Nueva etapa',condition:action.condition||'',active:true};const index=flow.stages.findIndex(x=>cleanText(x.name,120).toLocaleLowerCase('es')===cleanText(action.afterStage,120).toLocaleLowerCase('es'));flow.stages.splice(index>=0?index+1:flow.stages.length,0,stage);flow.stages.forEach((x,i)=>x.order=i);flow.updatedAt=timestamp();return stage;}
  if(action.type==='create_custom_module'){const module={id:makeId('cmod'),name:action.name,entityName:action.entityName||action.name,description:action.description||'',statuses:action.statuses||['Nuevo','En proceso','Cerrado'],fields:action.fields||[],active:true,createdAt:timestamp(),updatedAt:timestamp(),origin:'super-ia'};data.customModules.unshift(module);return module;}
  if(action.type==='create_dashboard'){const dashboard={id:makeId('dash'),name:action.name,description:action.description||'',kpis:action.kpis||[],filters:action.filters||[],periodDays:action.periodDays||90,active:true,createdAt:timestamp(),updatedAt:timestamp(),origin:'super-ia'};data.dashboardDefinitions.unshift(dashboard);return dashboard;}
  if(action.type==='create_role_profile'){const profile={id:makeId('roleprof'),name:action.name,baseRole:action.baseRole||'agent',description:action.description||'',permissions:sanitizeAuditValue(action.permissions||{}),active:true,createdAt:timestamp(),updatedAt:timestamp(),origin:'super-ia'};data.roleProfiles.unshift(profile);return profile;}
  if(action.type==='set_ai_policy'){const scope=cleanText(action.scope,160)||'global';let policy=data.aiPolicies.find(x=>x.scope===scope);if(!policy){policy={id:makeId('aipolicy'),scope,createdAt:timestamp()};data.aiPolicies.unshift(policy);}policy.instructions=action.instructions||'';policy.never=action.never||[];policy.always=action.always||[];policy.updatedAt=timestamp();return policy;}
  if(action.type==='create_subflow'){const sf={id:makeId('subflow'),name:action.name,description:action.description||'',actions:sanitizeAutomationActions(action.actions||[]),active:true,createdAt:timestamp(),updatedAt:timestamp(),origin:'super-ia'};data.automationSubflows.unshift(sf);return sf;}
  if(action.type==='set_power_policy'){data.settings.superAdmin.powerPolicy[action.risk]=action.mode;return {risk:action.risk,mode:action.mode};}
  throw new Error(`Acción V20.3 no soportada: ${action.type}`);
}

async function callAutomationSubflow(action,context,execution,depth,lastSend){const sf=findByNameOrId(data.automationSubflows,action.subflowId,action.subflowName);if(!sf||sf.active===false)throw new Error('Subflujo no encontrado o inactivo.');const nested=await executeAutomationActions(sf.actions||[],context,execution,{depth:depth+1,lastSend});return {subflowId:sf.id,name:sf.name,lastSend:nested?.lastSend||null};}

function superAdminScan() {
  const findings=[]; const now=Date.now();
  for(const rule of data.automationRules||[]){
    if(rule.lastError)findings.push({severity:'high',type:'rule_error',title:`Regla con error: ${rule.name}`,detail:rule.lastError,ruleId:rule.id,suggestion:'Revisar la acción fallida con el Debugger IA.'});
    const age=now-Date.parse(rule.createdAt||0);if(rule.enabled!==false&&Number(rule.executionCount||0)===0&&age>30*86400000)findings.push({severity:'medium',type:'unused_rule',title:`Regla sin uso: ${rule.name}`,detail:'No registra ejecuciones en más de 30 días.',ruleId:rule.id,suggestion:'Validar si todavía es necesaria o desactivarla.'});
    for(const c of automationRuleConflictSummary(rule,rule.id))findings.push({severity:'high',type:'rule_conflict',title:`Conflicto potencial: ${rule.name}`,detail:`Puede entrar en conflicto con ${c.ruleName}. ${c.detail}`,ruleId:rule.id,relatedRuleId:c.ruleId,suggestion:'Definir prioridad, alcance o condiciones más específicas.'});
  }
  const seen=new Set();for(const rule of data.automationRules||[]){const fp=JSON.stringify({trigger:rule.trigger,conditions:rule.conditions,actions:rule.actions});if(seen.has(fp))findings.push({severity:'medium',type:'duplicate_rule',title:`Automatización duplicada: ${rule.name}`,detail:'Existe otra regla con estructura prácticamente idéntica.',ruleId:rule.id,suggestion:'Unificar reglas para reducir mantenimiento.'});else seen.add(fp);}
  for(const p of data.products||[])if(Number(p.available??p.stock??0)<=Number(p.minStock||0))findings.push({severity:Number(p.available??p.stock??0)<=0?'high':'medium',type:'low_stock',title:`Stock crítico: ${p.name}`,detail:`Disponible: ${Number(p.available??p.stock??0)} · mínimo: ${Number(p.minStock||0)}.`,productId:p.id,suggestion:'Revisar reposición o reglas de reserva.'});
  const open=(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage));for(const d of open){const age=now-Date.parse(d.updatedAt||d.createdAt||0);if(age>7*86400000)findings.push({severity:age>14*86400000?'high':'medium',type:'abandoned_deal',title:`Cliente sin gestión: ${d.name||d.phone}`,detail:`La negociación lleva ${Math.floor(age/86400000)} días sin actualización.`,dealId:d.id,suggestion:'Crear seguimiento o reasignar responsable.'});}
  const counts=new Map();for(const d of open)if(d.ownerUserId)counts.set(d.ownerUserId,(counts.get(d.ownerUserId)||0)+1);const vals=[...counts.values()];const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;for(const [uid,count] of counts){if(count>=20&&count>avg*1.7){const u=data.users.find(x=>x.id===uid);findings.push({severity:'medium',type:'overload',title:`Agente sobrecargado: ${u?.name||uid}`,detail:`Tiene ${count} negociaciones abiertas; promedio del equipo ${avg.toFixed(1)}.`,userId:uid,suggestion:'Redistribuir clientes o revisar asignación automática.'});}}
  for(const u of data.users||[])if(u.role!=='admin'&&u.permissions?.globalReports===true&&u.permissions?.customFieldsManage===true)findings.push({severity:'medium',type:'permission_risk',title:`Permisos amplios: ${u.name}`,detail:'Puede ver reportes globales y administrar campos personalizados.',userId:u.id,suggestion:'Validar si ambos permisos son necesarios.'});
  data.superAdminFindings=findings.slice(0,400).map((f,i)=>({id:`finding_${i}_${Date.now()}`,...f,createdAt:timestamp()}));superAdminRuntime.lastScanAt=timestamp();return data.superAdminFindings;
}

function superAdminDebugger({executionId=null,ruleId=null}={}){
  const execution=executionId?(data.automationExecutions||[]).find(x=>x.id===executionId):null;const rule=ruleId?(data.automationRules||[]).find(x=>x.id===ruleId):execution?(data.automationRules||[]).find(x=>x.id===execution.ruleId):null;
  if(!execution&&!rule)throw new Error('No encontré la regla o ejecución indicada.');
  const failed=(execution?.actionResults||[]).find(x=>x.ok===false);const conflicts=rule?automationRuleConflictSummary(rule,rule.id):[];
  const cause=failed?`La ejecución se detuvo en ${failed.type}: ${failed.error}`:execution?.status==='failed'?(execution.error||'La ejecución terminó con error.'):(rule?.lastError||'No se detecta un error activo en la última información disponible.');
  return {rule:rule?{id:rule.id,name:rule.name,enabled:rule.enabled,trigger:rule.trigger,conditions:rule.conditions,conditionMode:rule.conditionMode,actions:rule.actions,lastError:rule.lastError}:null,execution:execution||null,cause,failedAction:failed||null,conflicts,explanation:{what:failed?`Falló la acción ${failed.type}.`:'La estructura de la regla fue reconstruida.',why:cause,trigger:rule?.trigger||execution?.triggerType||null,conditions:rule?.conditions||[],dataUsed:execution?.eventSnapshot||{},changed:(execution?.actionResults||[]).filter(x=>x.ok).map(x=>({type:x.type,result:x.result}))}};
}

function superAutomationEnabled() {
  return data.settings.superAutomation?.enabled !== false && moduleEnabled("automationLab");
}

function superAutomationActor(rule) {
  const stored = data.users.find((user) => user.id === rule?.createdByUserId && user.active !== false && user.role === "admin");
  if (stored) return stored;
  return { id: rule?.createdByUserId || null, name: rule?.createdByName || "Super IA", username: "super-ia", role: "admin", branchId: null };
}

function automationLineByReference({ lineId = null, lineName = null, branchId = null, deal = null } = {}) {
  if (lineId) {
    const byId = whatsappLineById(lineId);
    if (byId?.active !== false) return byId;
  }
  if (lineName) {
    const needle = cleanText(lineName, 180).toLocaleLowerCase("es");
    const byName = (data.whatsappLines || []).find((line) => line.active !== false && cleanText(line.name, 180).toLocaleLowerCase("es").includes(needle));
    if (byName) return byName;
  }
  if (deal) {
    const fromDeal = dealWhatsappLine(deal);
    if (fromDeal?.active !== false) return fromDeal;
  }
  return defaultWhatsappLine(branchId || deal?.branchId || primaryBranchId());
}

function automationClientForDeal(deal) {
  return deal?.clientId ? findClient(data, deal.clientId) : null;
}

function automationBranchForDeal(deal, fallbackBranchId = null) {
  return getBranch(deal?.branchId || fallbackBranchId || primaryBranchId()) || primaryBranch();
}

function automationContext({ deal = null, client = null, line = null, branch = null, text = "", message = null, phone = "", rule = null, runId = null, event = null } = {}) {
  const resolvedClient = client || automationClientForDeal(deal) || null;
  const resolvedBranch = branch || automationBranchForDeal(deal, line?.branchId);
  const resolvedLine = line || automationLineByReference({ deal, branchId: resolvedBranch?.id });
  const context = { deal, client: resolvedClient, branch: resolvedBranch, line: resolvedLine, text: cleanText(text, 6000), message: message || { text: cleanText(text, 6000) }, phone: normalizePhone(phone || resolvedClient?.phone || deal?.phone || ""), rule, runId, event };
  context.calculated = automationCalculatedValues(deal,resolvedClient);
  context.memory = automationMemoryObject(context);
  return context;
}

function automationExecutionEntry(rule, event, status = "running") {
  const deal = event?.deal || null;
  const entry = {
    id: makeId("autorun"), ruleId: rule?.id || null, ruleName: rule?.name || "Automatización", status,
    triggerType: event?.type || "manual", dealId: deal?.id || null, clientId: deal?.clientId || null,
    phone: normalizePhone(event?.phone || deal?.phone || ""), branchId: deal?.branchId || event?.branch?.id || null,
    lineId: deal?.lineId || event?.line?.id || null, startedAt: timestamp(), finishedAt: null,
    eventSnapshot: sanitizeAuditValue({ type:event?.type||"manual", text:cleanText(event?.text,1000), fromStage:event?.fromStage||null, toStage:event?.toStage||null, dealId:deal?.id||null, clientId:deal?.clientId||event?.client?.id||null, branchId:deal?.branchId||event?.branch?.id||null, lineId:deal?.lineId||event?.line?.id||null }),
    actionResults: [], error: null,
  };
  data.automationExecutions.unshift(entry);
  if (data.automationExecutions.length > 1500) data.automationExecutions.splice(1500);
  return entry;
}

function automationRuleAlreadyRanForClient(rule, clientId) {
  if (!rule?.oncePerClient || !clientId) return false;
  return (data.automationExecutions || []).some((entry) => entry.ruleId === rule.id && entry.clientId === clientId && entry.status === "completed");
}

function automationCooldownActive(rule, clientId = null) {
  const cooldownMs = Math.max(0, Number(rule?.cooldownMinutes) || 0) * 60_000;
  if (!cooldownMs) return false;
  const recent = (data.automationExecutions || []).find((entry) => entry.ruleId === rule.id && (!clientId || entry.clientId === clientId) && entry.status === "completed");
  return Boolean(recent && Date.now() - Date.parse(recent.finishedAt || recent.startedAt || 0) < cooldownMs);
}

function automationResolveUser(action, context) {
  const branchId = context.deal?.branchId || context.branch?.id || primaryBranchId();
  if (action.userId) {
    const byId = data.users.find((user) => user.id === action.userId && user.active !== false);
    if (byId) return byId;
  }
  if (action.userName) {
    const needle = cleanText(action.userName, 160).toLocaleLowerCase("es");
    const byName = data.users.find((user) => user.active !== false && [user.name, user.username].some((value) => cleanText(value, 160).toLocaleLowerCase("es").includes(needle)) && (!user.branchId || user.branchId === branchId));
    if (byName) return byName;
  }
  if (action.strategy === "first_available") return availableAgents(branchId).find((user) => !context.line || canUserUseWhatsappLine(user, context.line)) || null;
  if (action.strategy === "supervisor") return data.users.find((user) => user.active !== false && user.role === "supervisor" && (!user.branchId || user.branchId === branchId)) || null;
  if (action.strategy === "manager") return data.users.find((user) => user.active !== false && user.role === "manager" && (!user.branchId || user.branchId === branchId)) || data.users.find((user) => user.active !== false && user.role === "manager") || null;
  return null;
}

async function sendAutomationWhatsApp(action, context) {
  const text = automationInterpolate(action.text, context).trim();
  if (!text) throw new Error("La automatización intentó enviar un mensaje vacío.");
  let deal = action.target === "current_client" ? context.deal : null;
  let phone = normalizePhone(action.target === "fixed_number" ? action.phone : context.phone || deal?.phone || "");
  if (!phone && deal) phone = normalizePhone(deal.phone);
  if (!phone) throw new Error("No se pudo determinar el número destino.");
  const branchId = deal?.branchId || context.branch?.id || primaryBranchId();
  const line = automationLineByReference({ lineId: action.lineId, lineName: action.lineName, branchId, deal });
  if (!line) throw new Error("No se encontró una línea de WhatsApp habilitada para la automatización.");
  let messageId;
  if (deal) {
    if (!deal.lineId) deal.lineId = line.id;
    messageId = await sendProviderText(deal, text);
    rememberSeen(messageId);
    recordBotOutgoing(data, { deal, text, messageId, origin: "super-automation" });
  } else if (mockMode) {
    messageId = makeId("mockautomation");
  } else if (line.provider === "cloud") {
    if (!lineCloudConfigured(line)) throw new Error(`Cloud API de ${line.name} no está configurada.`);
    const result = await sendLineCloudPayload(line, { to: phone, type: "text", text: { body: text, preview_url: false } });
    messageId = result.messages?.[0]?.id || makeId("cloudautomation");
    rememberSeen(messageId);
  } else {
    const socket = lineSocket(line.id);
    if (!socket || lineStatus(line.id) !== "connected") throw new Error(`WhatsApp ${line.name} no está conectado.`);
    const sent = await socket.sendMessage(`${phone}@s.whatsapp.net`, { text });
    messageId = sent?.key?.id || makeId("qrautomation");
    rememberSeen(messageId);
  }
  const actor = superAutomationActor(context.rule);
  recordAuditEvent(actor, "super_ia_envio_whatsapp", { ruleId: context.rule?.id, ruleName: context.rule?.name, phone: `+${phone}`, lineId: line.id, lineName: line.name, silent: action.silent !== false, dealId: deal?.id || null }, line.branchId, "automation");
  if (action.silent === false) addActivity(data, `Super IA envió un mensaje automático por ${line.name}.`, "neutral");
  return { messageId, phone, lineId: line.id, line, deal, text };
}

function scheduleAutomationWait(action, context, sendResult = null) {
  const phone = normalizePhone(sendResult?.phone || context.phone || context.deal?.phone || "");
  const lineId = sendResult?.lineId || context.line?.id || context.deal?.lineId || null;
  if (!phone) throw new Error("No se puede esperar un retorno sin número de teléfono.");
  const wait = {
    id: makeId("autowait"), ruleId: context.rule?.id || null, ruleName: context.rule?.name || "Automatización",
    runId: context.runId || null, phone, lineId, dealId: context.deal?.id || null, clientId: context.client?.id || null,
    status: "waiting", branches: action.branches || [], defaultActions: action.defaultActions || [], timeoutActions: action.timeoutActions || [],
    createdAt: timestamp(), expiresAt: timestamp(Date.now() + Math.max(1, Number(action.timeoutMinutes) || data.settings.superAutomation.defaultReplyTimeoutMinutes || 60) * 60_000),
    repliedAt: null, replyText: "",
  };
  data.automationWaits.unshift(wait);
  if (data.automationWaits.length > 1000) data.automationWaits.splice(1000);
  return wait;
}

function scheduleDelayedAutomation(action, context) {
  const entry = {
    id: makeId("autodelay"), ruleId: context.rule?.id || null, runId: context.runId || null,
    dealId: context.deal?.id || null, clientId: context.client?.id || null, lineId: context.line?.id || null,
    phone: context.phone || normalizePhone(context.deal?.phone || ""), actions: action.actions || [],
    executeAt: timestamp(Date.now() + Math.max(1, Number(action.minutes) || 1) * 60_000), status: "pending", createdAt: timestamp(),
  };
  data.automationDelayedActions.unshift(entry);
  if (data.automationDelayedActions.length > 1000) data.automationDelayedActions.splice(1000);
  return entry;
}

function automationStageChange(deal, stage, rule) {
  if (!deal) throw new Error("La acción de etapa requiere una negociación.");
  const next = automationNormalizeStage(stage);
  const allowed = new Set([STAGES.NEW, STAGES.CONTACTED, STAGES.WAITING, STAGES.WON, STAGES.LOST, STAGES.TRANSFERRED]);
  if (!allowed.has(next)) throw new Error(`Etapa no válida: ${stage}`);
  const previous = deal.stage;
  if (next === STAGES.WON) closeWon(data, deal.id);
  else if (next === STAGES.LOST) {
    const reason = (data.settings.lossReasons || []).find((item) => cleanText(item.name, 160).toLocaleLowerCase("es").includes("sin retorno")) || data.settings.lossReasons?.[0];
    if (!reason) throw new Error("No hay motivo de pérdida configurado.");
    closeLost(data, deal.id, reason.id);
  } else {
    deal.stage = next;
    deal.updatedAt = timestamp();
    if (next === STAGES.WAITING) deal.waitingSince = timestamp();
    if (next !== STAGES.WAITING) deal.waitingSince = null;
  }
  recordAuditEvent(superAutomationActor(rule), "super_ia_cambio_etapa", { ruleId: rule?.id, dealId: deal.id, from: previous, to: next }, deal.branchId, "automation");
  if ([STAGES.WON,STAGES.LOST].includes(next)) cancelPendingAutomationActions({scope:"deal",includeWaits:true,includeDelays:true},{deal,client:automationClientForDeal(deal),rule});
  if (previous !== next) queueSuperAutomationEvent({ type: "stage_changed", deal, client: automationClientForDeal(deal), line: dealWhatsappLine(deal), branch: getBranch(deal.branchId), fromStage: previous, toStage: next, text: "" }, { depth: 1 });
  return { from: previous, to: next };
}

function automationAssign(action, context) {
  const deal = context.deal;
  if (!deal) throw new Error("La asignación requiere una negociación.");
  const target = automationResolveUser(action, context);
  if (!target) throw new Error("No se encontró un usuario compatible para asignar.");
  const previous = deal.ownerUserId || null;
  deal.ownerUserId = target.id; deal.ownerName = target.name; deal.updatedAt = timestamp();
  const client = automationClientForDeal(deal);
  if (client) {
    client.ownerUserId = target.id; client.ownerName = target.name; client.updatedAt = timestamp();
    if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
    if (deal.branchId) client.branchOwners[deal.branchId] = { userId: target.id, userName: target.name, updatedAt: timestamp() };
  }
  recordAuditEvent(superAutomationActor(context.rule), "super_ia_asignacion", { ruleId: context.rule?.id, dealId: deal.id, previousUserId: previous, userId: target.id, userName: target.name }, deal.branchId, "automation");
  queueSuperAutomationEvent({ type: "assignment_changed", deal, client, line: context.line, branch: context.branch, previousUserId: previous, userId: target.id, text: "" }, { depth: 1 });
  return target;
}

function automationSetField(action, context) {
  const client = context.client || automationClientForDeal(context.deal);
  if (action.type === "set_contact_field") {
    if (!client) throw new Error("No se encontró el contacto.");
    const allowed = new Set(["name","document","ruc","email","company","city","address","notes","marketingOptIn"]);
    if (!allowed.has(action.field)) throw new Error(`Campo de contacto no permitido: ${action.field}`);
    updateClient(data, client.id, { [action.field]: action.value });
    return { entity: "contact", field: action.field, value: action.value };
  }
  const deal = context.deal;
  if (!deal) throw new Error("No se encontró la negociación.");
  const allowed = new Set(["name","source","coverageReason","notes"]);
  if (!allowed.has(action.field)) throw new Error(`Campo de negociación no permitido: ${action.field}`);
  deal[action.field] = cleanText(action.value, 3000); deal.updatedAt = timestamp();
  return { entity: "deal", field: action.field, value: deal[action.field] };
}

function automationSetCustomField(action, context) {
  const field = fieldDefinition(action.key, action.entity);
  if (!field) throw new Error(`Campo personalizado no encontrado: ${action.key}`);
  let entity = action.entity === "contact" ? context.client : action.entity === "deal" ? context.deal : null;
  if (action.entity === "product") {
    const matches = findProductByQuery(data, action.productQuery || "");
    entity = matches.length === 1 ? matches[0] : null;
  }
  if (!entity) throw new Error("No se pudo resolver la entidad del campo personalizado.");
  return { entity: action.entity, field: field.key, value: setCustomField(action.entity, entity, field, action.value) };
}

function automationTag(action, context) {
  const client = context.client || automationClientForDeal(context.deal);
  if (!client) throw new Error("No se encontró el contacto para modificar etiquetas.");
  client.tags = Array.isArray(client.tags) ? client.tags : [];
  const tag = cleanText(action.tag, 120);
  if (!tag) throw new Error("Etiqueta vacía.");
  if (action.type === "add_tag" && !client.tags.some((item) => item.toLocaleLowerCase("es") === tag.toLocaleLowerCase("es"))) client.tags.push(tag);
  if (action.type === "remove_tag") client.tags = client.tags.filter((item) => item.toLocaleLowerCase("es") !== tag.toLocaleLowerCase("es"));
  client.updatedAt = timestamp();
  return { tag, tags: client.tags };
}

function automationCreateTask(action, context) {
  const branchId = context.deal?.branchId || context.branch?.id || primaryBranchId();
  let assigned = null;
  if (action.assignTo === "owner" && context.deal?.ownerUserId) assigned = data.users.find((user) => user.id === context.deal.ownerUserId && user.active !== false);
  if (!assigned && action.assignTo === "supervisor") assigned = automationResolveUser({ strategy: "supervisor" }, context);
  if (!assigned && action.assignTo === "manager") assigned = automationResolveUser({ strategy: "manager" }, context);
  if (!assigned && action.assignTo === "specific") assigned = automationResolveUser({ userId: action.userId, strategy: "specific" }, context);
  if (!assigned) assigned = automationResolveUser({ strategy: "first_available" }, context) || superAutomationActor(context.rule);
  const task = { id: makeId("task"), title: automationInterpolate(action.title, context) || `Seguimiento ${context.deal?.name || context.client?.name || "cliente"}`, description: automationInterpolate(action.description, context), branchId, assignedUserId: assigned.id || null, assignedUserName: assigned.name || "Administración", dealId: context.deal?.id || null, clientId: context.client?.id || null, priority: action.priority || "normal", status: "pending", dueAt: action.dueMinutes ? timestamp(Date.now() + Number(action.dueMinutes) * 60_000) : null, createdByUserId: context.rule?.createdByUserId || null, createdByName: context.rule?.createdByName || "Super IA", createdAt: timestamp(), updatedAt: timestamp(), origin: "super-automation" };
  data.tasks.unshift(task);
  return task;
}

function automationCreateNews(action, context) {
  const branchId = context.deal?.branchId || context.branch?.id || primaryBranchId();
  const entry = { id: makeId("news"), title: automationInterpolate(action.title, context), body: automationInterpolate(action.body, context), priority: action.priority || "normal", pinned: action.priority === "urgent", audienceMode: action.audience === "all" ? "all" : "branch", branchIds: action.audience === "all" ? [] : [branchId], userIds: [], roles: [], attachments: [], createdByUserId: context.rule?.createdByUserId || null, createdByName: context.rule?.createdByName || "Super IA", createdAt: timestamp(), updatedAt: timestamp(), active: true, origin: "super-automation" };
  data.news.unshift(entry); data.news.splice(2000); return entry;
}

function automationResolveBranch(action = {}, context = {}) {
  if (action.branchId) {
    const found = getBranch(action.branchId);
    if (found?.active !== false) return found;
  }
  if (action.branchName) {
    const needle = cleanText(action.branchName, 160).toLocaleLowerCase("es");
    const found = (data.branches || []).find((branch) => branch.active !== false && cleanText(branch.name, 160).toLocaleLowerCase("es").includes(needle));
    if (found) return found;
  }
  return context.branch || getBranch(context.deal?.branchId) || primaryBranch();
}

function automationAdjustStock(action, context) {
  const products = findProductByQuery(data, action.productQuery);
  const product = products.length === 1 ? products[0] : products.find((item) => cleanText(item.sku,180).toLocaleLowerCase("es") === cleanText(action.productQuery,180).toLocaleLowerCase("es"));
  if (!product) throw new Error(`Producto no identificado: ${action.productQuery}`);
  if (!Number(action.quantity)) throw new Error("El ajuste de stock debe ser distinto de cero.");
  const updated = adjustStock(data, product.id, Number(action.quantity), automationInterpolate(action.note, context) || "Ajuste por Super IA");
  queueSuperAutomationEvent({ type:"stock_changed", product:updated, branch:context.branch || primaryBranch(), text:action.note || "", quantity:Number(action.quantity)||0 }, { depth:1 });
  recordAuditEvent(superAutomationActor(context.rule), "super_ia_ajuste_stock", { ruleId: context.rule?.id, productId: updated.id, product: updated.name, quantity: Number(action.quantity) }, context.branch?.id || primaryBranchId(), "automation");
  return { productId:updated.id, product:updated.name, quantity:Number(action.quantity), available:updated.available };
}

function automationCreateApproval(action, context) {
  const actor = superAutomationActor(context.rule);
  const branchId = context.deal?.branchId || context.branch?.id || actor?.branchId || primaryBranchId();
  const entry = { id:makeId("approval"), type:action.approvalType || "general", title:automationInterpolate(action.title, context), detail:automationInterpolate(action.detail, context), amount:Number(action.amount)||0, dealId:context.deal?.id||null, branchId, requestedByUserId:actor?.id||null, requestedByName:actor?.name||"Super IA", status:"pending", createdAt:timestamp(), updatedAt:timestamp(), origin:"super-automation" };
  data.approvals.unshift(entry); return entry;
}

function automationCreateOrder(action, context) {
  const deal = context.deal;
  const branchId = deal?.branchId || context.branch?.id || primaryBranchId();
  const entry = { id:makeId("order"), number:`PED-${String((data.orders||[]).length+1).padStart(5,"0")}`, dealId:deal?.id||null, clientId:deal?.clientId||context.client?.id||null, clientName:deal?.name||context.client?.name||"Cliente", branchId, ownerUserId:deal?.ownerUserId||null, ownerName:deal?.ownerName||"", items:Array.isArray(deal?.items)?deal.items.map((item)=>({...item})):[], status:action.status||"preparing", notes:automationInterpolate(action.notes,context), createdAt:timestamp(), updatedAt:timestamp(), origin:"super-automation" };
  data.orders.unshift(entry); return entry;
}

function automationSetOrderStatus(action, context) {
  let order = action.orderId ? (data.orders||[]).find((item)=>item.id===action.orderId || item.number===action.orderId) : null;
  if (!order && context.deal?.id) order = (data.orders||[]).find((item)=>item.dealId===context.deal.id);
  if (!order) throw new Error("No se encontró un pedido para actualizar.");
  const previous=order.status; order.status=action.status; order.updatedAt=timestamp();
  const deal=order.dealId?findDeal(data,order.dealId):context.deal||null;
  queueSuperAutomationEvent({type:"order_status_changed",order,deal,client:deal?automationClientForDeal(deal):context.client,line:deal?dealWhatsappLine(deal):context.line,branch:getBranch(order.branchId)||context.branch||primaryBranch(),text:`${previous} -> ${order.status}`},{depth:1});
  return { orderId:order.id, number:order.number, from:previous, to:order.status };
}

function automationCreateVisit(action, context) {
  const assignee = automationResolveUser({ userId:action.userId, userName:action.userName, strategy:action.assignTo||"specific" }, context) || (context.deal?.ownerUserId ? data.users.find((u)=>u.id===context.deal.ownerUserId) : null) || superAutomationActor(context.rule);
  const branchId = context.deal?.branchId || context.branch?.id || assignee?.branchId || primaryBranchId();
  const entry = { id:makeId("visit"), title:automationInterpolate(action.title,context)||"Visita comercial", clientName:context.client?.name||context.deal?.name||"Cliente", clientId:context.client?.id||context.deal?.clientId||null, dealId:context.deal?.id||null, branchId, assignedUserId:assignee?.id||null, assignedUserName:assignee?.name||"Administración", scheduledAt:timestamp(Date.now()+Math.max(0,Number(action.scheduledMinutes)||0)*60_000), status:"scheduled", notes:automationInterpolate(action.notes,context), createdAt:timestamp(), updatedAt:timestamp(), origin:"super-automation" };
  data.visits.unshift(entry); return entry;
}

function automationSetAttendance(action, context) {
  const target=automationResolveUser({userId:action.userId,userName:action.userName,strategy:"specific"},context);
  if(!target) throw new Error("No se encontró el usuario para modificar su marcación.");
  const previous=target.attendance?.status||"offline";
  const until=action.untilMinutes?timestamp(Date.now()+Number(action.untilMinutes)*60_000):null;
  target.attendance={status:action.status,reason:automationInterpolate(action.reason,context),until,updatedAt:timestamp()};
  data.attendanceEvents.unshift({id:makeId("attendance"),userId:target.id,userName:target.name,branchId:target.branchId||null,status:action.status,reason:target.attendance.reason,until,at:timestamp(),changedByName:"Super IA",origin:"super-automation"});
  data.attendanceEvents.splice(3000);
  queueSuperAutomationEvent({type:"attendance_changed",branch:getBranch(target.branchId),user:target,status:action.status,text:target.attendance.reason},{depth:1});
  return {userId:target.id,userName:target.name,from:previous,to:action.status,until};
}

function automationCreateObjective(action, context) {
  const target=action.userId||action.userName?automationResolveUser({userId:action.userId,userName:action.userName,strategy:"specific"},context):null;
  const branch=automationResolveBranch(action,context);
  const entry={id:makeId("objective"),name:automationInterpolate(action.name,context),metric:action.metric,target:Number(action.target)||0,period:action.period||new Date().toISOString().slice(0,7),branchId:target?.branchId||branch?.id||primaryBranchId(),userId:target?.id||null,createdByUserId:context.rule?.createdByUserId||null,createdAt:timestamp(),active:true,origin:"super-automation"};
  data.objectives.unshift(entry); return entry;
}

function automationCreateDeal(action, context) {
  const phone=normalizePhone(automationInterpolate(action.phone,context)||context.phone||"");
  if(!phone) throw new Error("La nueva negociación necesita un número de teléfono.");
  const branch=automationResolveBranch(action,context);
  const line=automationLineByReference({lineId:action.lineId,lineName:action.lineName,branchId:branch?.id});
  if(!branch||!line) throw new Error("No se pudo resolver la sucursal/línea para crear la negociación.");
  if(line.branchId!==branch.id) throw new Error("La línea seleccionada no pertenece a la sucursal indicada.");
  const jid=`${phone}@s.whatsapp.net`;
  let deal=findOpenDeal(data,jid,branch.id,line.id);
  if(!deal) deal=createDeal(data,{jid,name:automationInterpolate(action.name,context)||`Cliente +${phone}`,branchId:branch.id,lineId:line.id,source:action.source||"super-automation"});
  deal.lineId=line.id; deal.updatedAt=timestamp();
  return {dealId:deal.id,clientId:deal.clientId,phone,branchId:branch.id,lineId:line.id};
}

function automationConfigureWhatsappLine(action, context) {
  const line=automationLineByReference({lineId:action.lineId,lineName:action.lineName,branchId:context.branch?.id||context.deal?.branchId});
  if(!line) throw new Error("No se encontró la línea de WhatsApp a configurar.");
  if(action.accessMode) line.accessMode=action.accessMode;
  line.active=action.active!==false;
  if(Array.isArray(action.allowedUserIds)||Array.isArray(action.allowedUserNames)){
    const ids=new Set((action.allowedUserIds||[]).filter((id)=>data.users.some((u)=>u.id===id&&u.active!==false&&(!u.branchId||u.branchId===line.branchId))));
    for(const name of action.allowedUserNames||[]){const needle=cleanText(name,160).toLocaleLowerCase("es");const u=data.users.find((user)=>user.active!==false&&(!user.branchId||user.branchId===line.branchId)&&[user.name,user.username].some((v)=>cleanText(v,160).toLocaleLowerCase("es").includes(needle)));if(u)ids.add(u.id);}
    line.allowedUserIds=[...ids];
  }
  if(typeof action.supervisorsCanUse==="boolean")line.supervisorsCanUse=action.supervisorsCanUse;
  if(typeof action.managersCanUse==="boolean")line.managersCanUse=action.managersCanUse;
  if(typeof action.botEnabled==="boolean")line.botEnabled=action.botEnabled;
  if(typeof action.isDefault==="boolean"&&action.isDefault){for(const other of data.whatsappLines||[])if(other.branchId===line.branchId)other.isDefault=false;line.isDefault=true;}
  line.updatedAt=timestamp();
  recordAuditEvent(superAutomationActor(context.rule),"super_ia_linea_whatsapp_configurada",{ruleId:context.rule?.id,lineId:line.id,name:line.name,active:line.active,accessMode:line.accessMode,allowedUsers:(line.allowedUserIds||[]).length},line.branchId,"automation");
  return {lineId:line.id,name:line.name,active:line.active,accessMode:line.accessMode,allowedUserIds:line.allowedUserIds||[]};
}

function automationAdminConfiguration(action, context) {
  if (action.type === "set_module") {
    if (!Object.prototype.hasOwnProperty.call(MODULE_DEFAULTS, action.key) || action.key === "settings") throw new Error(`Módulo no configurable: ${action.key}`);
    data.settings.modules[action.key] = action.enabled !== false; return { key: action.key, enabled: data.settings.modules[action.key] };
  }
  if (action.type === "set_ai_feature") {
    if (!Object.prototype.hasOwnProperty.call(AI_FEATURE_DEFAULTS, action.key)) throw new Error(`Función IA no reconocida: ${action.key}`);
    data.settings.aiFeatures[action.key] = action.enabled !== false; return { key: action.key, enabled: data.settings.aiFeatures[action.key] };
  }
  if (action.type === "rename_stage") {
    const stage = automationNormalizeStage(action.stage);
    if (!Object.prototype.hasOwnProperty.call(data.settings.stageLabels || {}, stage)) throw new Error(`Etapa no reconocida: ${action.stage}`);
    data.settings.stageLabels[stage] = cleanText(action.label, 120) || data.settings.stageLabels[stage]; return { stage, label: data.settings.stageLabels[stage] };
  }
  if (action.type === "add_bot_instruction") {
    const item = { id: makeId("botrule"), name: action.name || "Regla Super IA", instruction: action.instruction, active: true, order: data.botInstructions.length, createdAt: timestamp(), updatedAt: timestamp(), origin: "super-automation" };
    data.botInstructions.push(item); return item;
  }
  if (action.type === "create_custom_field") {
    if (!action.key) throw new Error("El campo personalizado necesita una clave.");
    if (data.customFieldDefinitions.some((field) => field.entity === action.entity && field.key === action.key)) throw new Error(`Ya existe el campo ${action.key}.`);
    const item = { id: makeId("field"), entity: action.entity, key: action.key, label: action.label, type: action.fieldType, context: action.context, options: action.options || [], botReadable: action.botReadable !== false, botWritable: action.botWritable === true, required: false, active: true, createdAt: timestamp(), updatedAt: timestamp(), origin: "super-automation" };
    data.customFieldDefinitions.push(item); return item;
  }
  if (action.type === "add_quick_reply") {
    const item = { id: makeId("reply"), title: action.title, shortcut: action.shortcut, category: action.category || "General", body: action.body, active: true, order: data.quickReplies.length, createdAt: timestamp(), updatedAt: timestamp(), origin: "super-automation" };
    data.quickReplies.push(item); return item;
  }
  throw new Error(`Acción administrativa no soportada: ${action.type}`);
}

async function executeAutomationActions(actions, context, execution, options = {}) {
  let lastSend = options.lastSend || null;
  const maxDepth = Number(data.settings.superAutomation?.maxChainDepth || 8);
  const depth = Number(options.depth || 0);
  if (depth > maxDepth) throw new Error("La automatización alcanzó el límite de profundidad y fue detenida para evitar un bucle.");
  for (const action of sanitizeAutomationActions(actions)) {
    let result = null;
    try {
      if (action.type === "send_whatsapp") { lastSend = await sendAutomationWhatsApp(action, context); result = { phone: lastSend.phone, lineId: lastSend.lineId, messageId: lastSend.messageId }; }
      else if (action.type === "wait_for_reply") result = scheduleAutomationWait(action, { ...context, phone: lastSend?.phone || context.phone, line: lastSend?.line || context.line }, lastSend);
      else if (action.type === "delay") result = scheduleDelayedAutomation(action, context);
      else if (action.type === "branch_condition") {
        const matched = automationConditionsMatch(action.conditions || [], context, action.mode || "all");
        const nested = matched ? (action.thenActions || []) : (action.elseActions || []);
        const nestedResult = await executeAutomationActions(nested, context, execution, { depth: depth + 1, lastSend });
        if (nestedResult?.lastSend) lastSend = nestedResult.lastSend;
        result = { matched, branch: matched ? "then" : "else", actions: nested.length };
      }
      else if (action.type === "set_stage") result = automationStageChange(context.deal, action.stage, context.rule);
      else if (action.type === "assign_user") result = automationAssign(action, context);
      else if (["set_contact_field","set_deal_field"].includes(action.type)) result = automationSetField(action, context);
      else if (action.type === "set_custom_field") result = automationSetCustomField(action, context);
      else if (["add_tag","remove_tag"].includes(action.type)) result = automationTag(action, context);
      else if (action.type === "create_task") result = automationCreateTask(action, context);
      else if (action.type === "toggle_bot") { if (!context.deal) throw new Error("La acción BOT requiere una negociación."); context.deal.botActive = action.enabled !== false; context.deal.updatedAt = timestamp(); result = { enabled: context.deal.botActive }; }
      else if (action.type === "reserve_stock") { if (!context.deal) throw new Error("La reserva requiere una negociación."); const products = findProductByQuery(data, action.productQuery); const product = products.length === 1 ? products[0] : products.find((item) => item.sku.toLocaleLowerCase("es") === cleanText(action.productQuery,180).toLocaleLowerCase("es")); if (!product) throw new Error(`Producto no identificado: ${action.productQuery}`); result = reserveProduct(data, context.deal.id, product.id, action.quantity, "super-automation"); }
      else if (action.type === "adjust_stock") result = automationAdjustStock(action, context);
      else if (action.type === "create_approval") result = automationCreateApproval(action, context);
      else if (action.type === "create_order") result = automationCreateOrder(action, context);
      else if (action.type === "set_order_status") result = automationSetOrderStatus(action, context);
      else if (action.type === "create_visit") result = automationCreateVisit(action, context);
      else if (action.type === "set_attendance") result = automationSetAttendance(action, context);
      else if (action.type === "create_objective") result = automationCreateObjective(action, context);
      else if (action.type === "create_deal") result = automationCreateDeal(action, context);
      else if (action.type === "configure_whatsapp_line") result = automationConfigureWhatsappLine(action, context);
      else if (action.type === "release_reservations") { if (!context.deal) throw new Error("La liberación requiere negociación."); releaseDealReservations(data, context.deal); result = { released: true }; }
      else if (action.type === "close_won") result = automationStageChange(context.deal, STAGES.WON, context.rule);
      else if (action.type === "close_lost") { const reason = (data.settings.lossReasons || []).find((item) => cleanText(item.name,160).toLocaleLowerCase("es").includes(cleanText(action.reason,160).toLocaleLowerCase("es"))) || data.settings.lossReasons?.[0]; if (!context.deal || !reason) throw new Error("No se pudo cerrar como perdido."); const from=context.deal.stage; closeLost(data, context.deal.id, reason.id); result={from,to:STAGES.LOST,reason:reason.name}; queueSuperAutomationEvent({type:"stage_changed",deal:context.deal,client:context.client,line:context.line,branch:context.branch,fromStage:from,toStage:STAGES.LOST,text:""},{depth:depth+1}); }
      else if (action.type === "set_memory") result = setAutomationMemory(action,context);
      else if (action.type === "clear_memory") result = clearAutomationMemory(action,context);
      else if (action.type === "cancel_pending_actions") result = cancelPendingAutomationActions(action,context);
      else if (action.type === "call_subflow") { const nested=await callAutomationSubflow(action,context,execution,depth,lastSend); if(nested?.lastSend)lastSend=nested.lastSend; result={subflowId:nested.subflowId,name:nested.name}; }
      else if (action.type === "create_news") result = automationCreateNews(action, context);
      else if (["set_module","set_ai_feature","rename_stage","add_bot_instruction","create_custom_field","add_quick_reply"].includes(action.type)) result = automationAdminConfiguration(action, context);
      else if (["create_crm_flow","add_flow_stage","create_custom_module","create_dashboard","create_role_profile","set_ai_policy","create_subflow","set_power_policy"].includes(action.type)) result = automationAdminConfigurationV203(action,context);
      else throw new Error(`Acción no implementada: ${action.type}`);
      execution?.actionResults?.push({ type: action.type, ok: true, at: timestamp(), result: sanitizeAuditValue(result) });
    } catch (error) {
      execution?.actionResults?.push({ type: action.type, ok: false, at: timestamp(), error: cleanText(error?.message || error, 800) });
      throw error;
    }
  }
  return { lastSend };
}

async function executeSuperAutomationRule(rule, event, options = {}) {
  if (!superAutomationEnabled() || !rule?.enabled) return null;
  const deal = event?.deal || null, client = event?.client || automationClientForDeal(deal);
  if (Number(rule.maxExecutions || 0) > 0 && Number(rule.executionCount || 0) >= Number(rule.maxExecutions)) return null;
  if (automationRuleAlreadyRanForClient(rule, client?.id)) return null;
  if (automationCooldownActive(rule, client?.id)) return null;
  const fingerprint = `${rule.id}:${event?.type}:${deal?.id || event?.phone || "global"}:${cleanText(event?.text,160)}`;
  const previous = superAutomationRuntime.activeFingerprints.get(fingerprint);
  if (previous && Date.now() - previous < 30_000) return null;
  superAutomationRuntime.activeFingerprints.set(fingerprint, Date.now());
  const execution = automationExecutionEntry(rule, event);
  const context = automationContext({ deal, client, line: event?.line, branch: event?.branch, text: event?.text, message: event?.message, phone: event?.phone, rule, runId: execution.id, event });
  try {
    await executeAutomationActions(rule.actions, context, execution, { depth: Number(options.depth || 0) });
    execution.status = "completed"; execution.finishedAt = timestamp();
    rule.executionCount = Number(rule.executionCount || 0) + 1; rule.lastExecutedAt = execution.finishedAt; rule.lastError = null; rule.updatedAt = timestamp();
    recordAuditEvent(superAutomationActor(rule), "super_ia_regla_ejecutada", { ruleId: rule.id, ruleName: rule.name, runId: execution.id, triggerType: event?.type, dealId: deal?.id || null }, deal?.branchId || event?.branch?.id || primaryBranchId(), "automation");
  } catch (error) {
    execution.status = "failed"; execution.error = cleanText(error?.message || error, 1000); execution.finishedAt = timestamp();
    rule.lastError = execution.error; rule.updatedAt = timestamp(); superAutomationRuntime.lastError = execution.error;
    recordAuditEvent(superAutomationActor(rule), "super_ia_regla_error", { ruleId: rule.id, ruleName: rule.name, runId: execution.id, error: execution.error }, deal?.branchId || event?.branch?.id || primaryBranchId(), "automation");
  }
  superAutomationRuntime.lastRunAt = timestamp();
  await store.save();
  return execution;
}

async function dispatchSuperAutomationEvent(event, options = {}) {
  if (!superAutomationEnabled()) return;
  const rules = (data.automationRules || []).filter((rule) => rule.enabled !== false && ruleMatchesEvent(rule, event, { branchName: (id) => getBranch(id)?.name || "", lineName: (id) => whatsappLineById(id)?.name || "" }));
  for (const rule of rules) await executeSuperAutomationRule(rule, event, options);
}

function queueSuperAutomationEvent(event, options = {}) {
  superAutomationRuntime.queue = superAutomationRuntime.queue.then(() => dispatchSuperAutomationEvent(event, options)).catch((error) => { superAutomationRuntime.lastError = cleanText(error?.message || error, 1000); console.error("[super automation]", error?.message || error); });
  return superAutomationRuntime.queue;
}

function queueIncomingSuperAutomation({ deal, text = "", line = null, created = false, message = null } = {}) {
  if (!deal) return superAutomationRuntime.queue;
  const client = automationClientForDeal(deal), branch = getBranch(deal.branchId), phone = normalizePhone(deal.phone || "");
  superAutomationRuntime.queue = superAutomationRuntime.queue.then(async()=>{
    await consumeSuperAutomationWait({ phone, lineId: line?.id || deal.lineId || null, deal, text, message });
    if (created) await dispatchSuperAutomationEvent({ type: "deal_created", deal, client, line, branch, phone, text, message }, { depth: 0 });
    await dispatchSuperAutomationEvent({ type: "incoming_message", deal, client, line, branch, phone, text, message }, { depth: 0 });
  }).catch((error)=>{ superAutomationRuntime.lastError = cleanText(error?.message || error,1000); console.error("[super automation incoming]",error?.message||error); });
  return superAutomationRuntime.queue;
}

async function consumeSuperAutomationWait({ phone = "", lineId = null, deal = null, text = "", message = null } = {}) {
  if (!superAutomationEnabled()) return false;
  const normalized = normalizePhone(phone || deal?.phone || "");
  if (!normalized) return false;
  const wait = (data.automationWaits || []).find((entry) => entry.status === "waiting" && normalizePhone(entry.phone) === normalized && (!entry.lineId || !lineId || entry.lineId === lineId));
  if (!wait) return false;
  const rule = (data.automationRules || []).find((entry) => entry.id === wait.ruleId) || { id: wait.ruleId, name: wait.ruleName, createdByName: "Super IA" };
  const branch = automationReplyBranch(wait, text);
  const actions = branch?.actions?.length ? branch.actions : wait.defaultActions || [];
  wait.status = "replied"; wait.repliedAt = timestamp(); wait.replyText = cleanText(text, 6000); wait.matchedBranch = branch?.label || null;
  // Si la automatización consultó a un tercero (por ejemplo un jefe o aprobador),
  // el retorno continúa actuando sobre la negociación que originó la regla, no sobre el chat del aprobador.
  const originDeal = wait.dealId ? findDeal(data, wait.dealId) : null;
  const continuationDeal = originDeal || deal;
  const originClient = wait.clientId ? findClient(data, wait.clientId) : null;
  const execution = automationExecutionEntry(rule, { type: "reply_continuation", deal: continuationDeal, phone: normalized, text });
  const context = automationContext({ deal: continuationDeal, client: originClient || automationClientForDeal(continuationDeal), line: automationLineByReference({ lineId: wait.lineId || lineId, deal: continuationDeal }), branch: automationBranchForDeal(continuationDeal), text, message, phone: normalized, rule, runId: execution.id, event: { type: "reply_continuation", replyDealId: deal?.id || null, responderPhone: normalized, matchedBranch: branch?.label || null } });
  try { await executeAutomationActions(actions, context, execution, { depth: 1 }); execution.status = "completed"; execution.finishedAt = timestamp(); }
  catch (error) { execution.status = "failed"; execution.error = cleanText(error?.message || error, 1000); execution.finishedAt = timestamp(); }
  await store.save();
  return true;
}

async function processSuperAutomationTimers() {
  if (!superAutomationEnabled()) return;
  const now = Date.now();
  for (const wait of data.automationWaits || []) {
    if (wait.status !== "waiting" || Date.parse(wait.expiresAt || 0) > now) continue;
    wait.status = "timeout"; wait.timedOutAt = timestamp();
    const rule = (data.automationRules || []).find((entry) => entry.id === wait.ruleId) || { id: wait.ruleId, name: wait.ruleName, createdByName: "Super IA" };
    const deal = wait.dealId ? findDeal(data, wait.dealId) : null;
    const execution = automationExecutionEntry(rule, { type: "reply_timeout", deal, phone: wait.phone, text: "" });
    const context = automationContext({ deal, client: deal ? automationClientForDeal(deal) : null, line: automationLineByReference({ lineId: wait.lineId, deal }), branch: automationBranchForDeal(deal), phone: wait.phone, rule, runId: execution.id, event: { type: "reply_timeout" } });
    try { await executeAutomationActions(wait.timeoutActions || [], context, execution, { depth: 1 }); execution.status = "completed"; execution.finishedAt = timestamp(); }
    catch (error) { execution.status = "failed"; execution.error = cleanText(error?.message || error, 1000); execution.finishedAt = timestamp(); }
  }
  for (const delayed of data.automationDelayedActions || []) {
    if (delayed.status !== "pending" || Date.parse(delayed.executeAt || 0) > now) continue;
    delayed.status = "running";
    const rule = (data.automationRules || []).find((entry) => entry.id === delayed.ruleId) || { id: delayed.ruleId, name: "Automatización diferida", createdByName: "Super IA" };
    const deal = delayed.dealId ? findDeal(data, delayed.dealId) : null;
    const execution = automationExecutionEntry(rule, { type: "delayed", deal, phone: delayed.phone, text: "" });
    const context = automationContext({ deal, client: deal ? automationClientForDeal(deal) : null, line: automationLineByReference({ lineId: delayed.lineId, deal }), branch: automationBranchForDeal(deal), phone: delayed.phone, rule, runId: execution.id, event: { type: "delayed" } });
    try { await executeAutomationActions(delayed.actions || [], context, execution, { depth: 1 }); delayed.status = "completed"; delayed.completedAt = timestamp(); execution.status = "completed"; execution.finishedAt = timestamp(); }
    catch (error) { delayed.status = "failed"; delayed.error = cleanText(error?.message || error, 1000); execution.status = "failed"; execution.error = delayed.error; execution.finishedAt = timestamp(); }
  }
  for (const task of data.tasks || []) {
    if (["done","cancelled"].includes(task.status) || !task.dueAt || Date.parse(task.dueAt) > now) continue;
    const seenKey=`${task.id}:${task.dueAt}`; const last=superAdminRuntime.taskOverdueSeen.get(seenKey)||0;
    if (now-last < 6*60*60_000) continue; superAdminRuntime.taskOverdueSeen.set(seenKey,now);
    const deal=task.dealId?findDeal(data,task.dealId):null;
    await dispatchSuperAutomationEvent({type:"task_overdue",task,deal,client:deal?automationClientForDeal(deal):(task.clientId?findClient(data,task.clientId):null),line:deal?dealWhatsappLine(deal):null,branch:getBranch(task.branchId)||primaryBranch(),phone:deal?.phone||"",text:task.title||""},{depth:0});
  }
  for (const rule of data.automationRules || []) {
    if (rule.enabled === false || rule.trigger?.type !== "sla_warning") continue;
    const threshold=Math.max(1,Number(rule.trigger?.slaMinutes)||60);
    for(const deal of data.deals||[]){if(!OPEN_STAGES.has(deal.stage))continue;const base=deal.waitingSince||deal.updatedAt||deal.createdAt;if(!base)continue;const elapsed=(now-Date.parse(base))/60000;if(elapsed < threshold*0.8)continue;const key=`${rule.id}:${deal.id}:${threshold}`;const last=superAdminRuntime.slaSeen.get(key)||0;if(now-last<Math.max(30,threshold/2)*60_000)continue;superAdminRuntime.slaSeen.set(key,now);await executeSuperAutomationRule(rule,{type:"sla_warning",deal,client:automationClientForDeal(deal),line:dealWhatsappLine(deal),branch:getBranch(deal.branchId),phone:deal.phone||"",text:`SLA ${Math.round(elapsed)}/${threshold} min`},{depth:0});}
  }
  if (data.settings.superAdmin?.supervisorEnabled !== false) {
    const interval=Math.max(5,Number(data.settings.superAdmin?.supervisorIntervalMinutes)||15)*60_000;
    if(!superAdminRuntime.lastScanAt || now-Date.parse(superAdminRuntime.lastScanAt)>=interval){try{superAdminScan();superAdminRuntime.lastScanError=null;}catch(error){superAdminRuntime.lastScanError=cleanText(error?.message||error,500);}}
  }
  for (const rule of data.automationRules || []) {
    if (rule.enabled === false || rule.trigger?.type !== "scheduled") continue;
    let due = false;
    const every = Math.max(0, Number(rule.trigger.everyMinutes) || 0);
    if (every) due = !rule.lastExecutedAt || now - Date.parse(rule.lastExecutedAt) >= every * 60_000;
    const schedule = cleanText(rule.trigger.schedule, 20);
    const m = schedule.match(/^(\d{1,2}):(\d{2})$/);
    if (!due && m) {
      const today = new Date(); const target = new Date(today); target.setHours(Number(m[1]), Number(m[2]), 0, 0);
      due = now >= target.getTime() && (!rule.lastExecutedAt || Date.parse(rule.lastExecutedAt) < target.getTime());
    }
    if (due) await executeSuperAutomationRule(rule, { type: "scheduled", deal: null, client: null, line: null, branch: primaryBranch(), phone: "", text: "" }, { depth: 0 });
  }
  if ((data.automationWaits || []).some((entry) => ["timeout","replied"].includes(entry.status)) || (data.automationDelayedActions || []).some((entry) => ["completed","failed"].includes(entry.status))) await store.save();
}

function superAutomationCatalog() {
  return {
    triggers: [
      { key: "incoming_message", label: "Cliente envía un mensaje" }, { key: "deal_created", label: "Nueva negociación" },
      { key: "outgoing_message", label: "Agente envía un mensaje" }, { key: "stage_changed", label: "Cambio de etapa" },
      { key: "assignment_changed", label: "Cambio de responsable" }, { key: "stock_changed", label: "Cambio de stock" },
      { key: "attendance_changed", label: "Cambio de marcación" }, { key: "task_overdue", label: "Tarea vencida" }, { key: "order_status_changed", label: "Cambio de pedido" }, { key: "whatsapp_disconnected", label: "Línea WhatsApp desconectada" }, { key: "sla_warning", label: "SLA próximo a vencer" }, { key: "document_generated", label: "Documento generado" }, { key: "campaign_replied", label: "Respuesta de campaña" }, { key: "client_created", label: "Cliente creado" }, { key: "scheduled", label: "Horario / recurrencia" }, { key: "manual", label: "Ejecución manual" },
    ],
    actions: [
      "send_whatsapp","wait_for_reply","delay","branch_condition","set_stage","assign_user","set_contact_field","set_deal_field","set_custom_field","add_tag","remove_tag","create_task","toggle_bot","reserve_stock","adjust_stock","release_reservations","close_won","close_lost","create_approval","create_order","set_order_status","create_visit","set_attendance","create_objective","create_deal","configure_whatsapp_line","create_news","set_module","set_ai_feature","rename_stage","add_bot_instruction","create_custom_field","add_quick_reply","set_memory","clear_memory","call_subflow","cancel_pending_actions","create_crm_flow","add_flow_stage","create_custom_module","create_dashboard","create_role_profile","set_ai_policy","create_subflow","set_power_policy"
    ],
    stages: { ...data.settings.stageLabels },
    branches: publicBranches().filter((branch) => branch.active !== false).map((branch) => ({ id: branch.id, name: branch.name, code: branch.code })),
    lines: (data.whatsappLines || []).filter((line) => line.active !== false).map((line) => ({ id: line.id, name: line.name, branchId: line.branchId, provider: line.provider })),
    users: data.users.filter((user) => user.active !== false).map((user) => ({ id: user.id, name: user.name, username: user.username, role: user.role, branchId: user.branchId })),
    modules: Object.keys(MODULE_DEFAULTS), aiFeatures: Object.keys(AI_FEATURE_DEFAULTS),
    conditionFields: ["message.text","client.name","client.phone","client.ruc","client.document","client.company","client.city","client.tags","deal.stage","deal.ownerName","deal.total","product.name","product.sku","product.available","product.minStock","user.role","user.name","attendance.status","branch.name","line.name","client.custom.<key>","deal.custom.<key>","product.custom.<key>","memory.<key>","client.lastPurchase","client.historicalAmount","client.daysWithoutBuying","deal.waitingMinutes","deal.closeProbability","task.title","task.priority","task.status","task.dueAt","order.status","order.number"],
    conditionOperators: ["equals","not_equals","contains","not_contains","gt","gte","lt","lte","in","exists"],
    customFields: (data.customFieldDefinitions || []).filter((field) => field.active !== false).map((field) => ({ entity: field.entity, key: field.key, label: field.label, type: field.type })), subflows:(data.automationSubflows||[]).filter(x=>x.active!==false).map(x=>({id:x.id,name:x.name})), flows:(data.crmFlows||[]).filter(x=>x.active!==false).map(x=>({id:x.id,name:x.name,stages:(x.stages||[]).map(s=>s.name)})), customModules:(data.customModules||[]).filter(x=>x.active!==false).map(x=>({id:x.id,name:x.name})), roleProfiles:(data.roleProfiles||[]).filter(x=>x.active!==false).map(x=>({id:x.id,name:x.name,baseRole:x.baseRole})), powerPolicy:{...(data.settings.superAdmin?.powerPolicy||{})},
  };
}

async function parseSuperAutomationInstruction(instruction, actor) {
  const text = cleanText(instruction, 6000);
  if (!text) throw new Error("Escribí una instrucción para la Super IA.");
  const catalogs = superAutomationCatalog();
  if (!data.settings.apiKey || !aiFeatureEnabled("automationGenerator")) {
    const localReason = !data.settings.apiKey ? "Sin API Key" : "Generador IA desactivado";
    const lower=text.toLocaleLowerCase("es");
    const quoted=[...text.matchAll(/[“"]([^”"]{1,240})[”"]/g)].map((match)=>match[1]);
    const ruleName=quoted[0] || cleanText((text.match(/regla\s+(.+?)(?:\.|$)/i)||[])[1],180);
    if (/\b(desactiv|paus)/i.test(lower) && /\bregla\b/i.test(lower) && ruleName) return {operation:"toggle_rule",targetRule:ruleName,enabled:false,source:"local"};
    if (/\bactiv/i.test(lower) && /\bregla\b/i.test(lower) && ruleName) return {operation:"toggle_rule",targetRule:ruleName,enabled:true,source:"local"};
    if (/\b(elimin|borr)/i.test(lower) && /\bregla\b/i.test(lower) && ruleName) return {operation:"delete_rule",targetRule:ruleName,source:"local"};
    const stageRename=text.match(/(?:renombr|cambi(?:a|á|ar).{0,30}(?:nombre|etapa)|nombre visible de la etapa)\s+(new|nuevo|contacted|contactado|waiting|espera|won|ganado|lost|perdido|transferred|transferido)\s+(?:a|como|por)\s+(.+)$/i);
    if(stageRename) return {operation:"execute_admin_actions",actions:[{type:"rename_stage",stage:automationNormalizeStage(stageRename[1]),label:cleanText(stageRename[2],120).replace(/[.]+$/,'')}],source:"local"};
    const moduleAliases={campanas:"campaigns",campañas:"campaigns",noticias:"news",reportes:"reports",stock:"stock",documentos:"documents",whatsapp:"whatsapp",tareas:"tasks",alertas:"alerts",calidad:"quality",forecast:"forecasting",academia:"academy",seguridad:"security",pedidos:"orders",visitas:"visits"};
    const mod=text.match(/\b(activ|desactiv)\w*\s+(?:el\s+)?m[oó]dulo\s+([\p{L}0-9_-]+)/iu);
    if(mod){const key=moduleAliases[mod[2].toLocaleLowerCase("es")]||mod[2];return {operation:"execute_admin_actions",actions:[{type:"set_module",key,enabled:mod[1].toLocaleLowerCase("es").startsWith("activ")}],source:"local"};}
    const splitItems=(value)=>cleanText(value,2000).split(/,|;|\by\b/iu).map(x=>cleanText(x,120).replace(/^(etapa|estado|campo|kpi)\s+/iu,'')).filter(Boolean).slice(0,30);
    const flowMatch=text.match(/(?:crea(?:me)?|crear|gener[aá]).{0,30}flujo(?:\s+para)?\s+(.+?)\s+con\s+(?:las?\s+)?etapas?\s+(.+)$/iu);
    if(flowMatch)return {operation:"execute_admin_actions",actions:[{type:"create_crm_flow",name:cleanText(flowMatch[1],180),module:"CRM",stages:splitItems(flowMatch[2])}],source:"local"};
    const addStage=text.match(/(?:agreg[aá]|añad[ií]|crear).{0,30}etapa\s+(.+?)\s+(?:despu[eé]s de|luego de)\s+(.+?)\s+(?:en|al)\s+(?:el\s+)?flujo\s+(.+)$/iu);
    if(addStage)return {operation:"execute_admin_actions",actions:[{type:"add_flow_stage",stageName:cleanText(addStage[1],120),afterStage:cleanText(addStage[2],120),flowName:cleanText(addStage[3],180)}],source:"local"};
    const customModule=text.match(/(?:crea(?:me)?|crear|gener[aá]).{0,30}m[oó]dulo(?:\s+para(?:\s+gestionar)?)?\s+(.+?)(?:\s+con\s+(?:los\s+)?campos?\s+(.+))?$/iu);
    if(customModule&&!/m[oó]dulo\s+(?:de\s+)?(?:campañas|noticias|reportes|stock|documentos|whatsapp|tareas|alertas|calidad|academia|seguridad|pedidos|visitas)/iu.test(text)){const fields=customModule[2]?splitItems(customModule[2]).map((label)=>({key:cleanText(label,80).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''),label,type:'text'})):[];return {operation:"execute_admin_actions",actions:[{type:"create_custom_module",name:cleanText(customModule[1],180),entityName:cleanText(customModule[1],120),fields}],source:"local"};}
    const dashboard=text.match(/(?:crea(?:me)?|crear|gener[aá]).{0,30}(?:dashboard|tablero|reporte)\s+(.+?)(?:\s+(?:con|que\s+muestre)\s+(.+))?$/iu);
    if(dashboard)return {operation:"execute_admin_actions",actions:[{type:"create_dashboard",name:cleanText(dashboard[1],180),kpis:dashboard[2]?splitItems(dashboard[2]):[],periodDays:(Number((text.match(/(\d+)\s*d[ií]as/iu)||[])[1])||90)}],source:"local"};
    const role=text.match(/(?:crea(?:me)?|crear).{0,30}rol\s+(.+)$/iu);
    if(role){const name=cleanText(role[1].split(/\s+que\s+/iu)[0],180),lowerName=name.toLocaleLowerCase('es'),baseRole=/supervisor|jefe/.test(lowerName)?'supervisor':/gerente|manager/.test(lowerName)?'manager':'agent';return {operation:"execute_admin_actions",actions:[{type:"create_role_profile",name,baseRole,description:text,permissions:{exportClients:!/no\s+pueda\s+exportar|sin\s+exportar/iu.test(text),globalReports:/reportes?\s+global/iu.test(text)}}],source:"local"};}
    const subflow=text.match(/(?:crea(?:me)?|crear).{0,30}subflujo(?:\s+llamado)?\s+([A-ZÁÉÍÓÚÑ0-9_. -]{3,120})/iu);
    if(subflow)return {operation:"execute_admin_actions",actions:[{type:"create_subflow",name:cleanText(subflow[1],180),description:text,actions:[]}],source:"local"};
    const aiPolicy=text.match(/(?:para|en)\s+(.+?)\s+(?:quiero|necesito).{0,40}(?:respuestas?|ia|bot)\s+(.+)$/iu);
    if(aiPolicy)return {operation:"execute_admin_actions",actions:[{type:"set_ai_policy",scope:cleanText(aiPolicy[1],160),instructions:text}],source:"local"};
    const fieldMatch=text.match(/(?:agreg[aá]|crea(?:me)?|crear).{0,30}campo(?:\s+personalizado)?(?:\s+de\s+(contacto|negociaci[oó]n|producto))?\s+(?:llamado\s+)?(.+?)(?:,|\s+clave\s+)([a-zA-Z0-9_]+)(?:,|\s+tipo\s+)(texto|text|n[uú]mero|number|fecha|date|booleano|boolean|selecci[oó]n|select)/iu);
    if(fieldMatch){const entity=/negoci/i.test(fieldMatch[1]||'')?'deal':/producto/i.test(fieldMatch[1]||'')?'product':'contact';const types={texto:'text',text:'text','número':'number',numero:'number',number:'number',fecha:'date',date:'date',booleano:'boolean',boolean:'boolean','selección':'select',seleccion:'select',select:'select'};return {operation:"execute_admin_actions",actions:[{type:"create_custom_field",entity,key:fieldMatch[3],label:cleanText(fieldMatch[2],120),fieldType:types[fieldMatch[4].toLocaleLowerCase('es')]||'text',botReadable:true,botWritable:true}],source:"local"};}
    return { operation: "create_rule", rule: localParseInstruction(text, catalogs), source: "local", warning: `${localReason}: se utilizó el intérprete local. Para reglas complejas con múltiples condiciones y bifurcaciones, activá/configurá la IA generativa.` };
  }
  const schemaHint = {
    operation: "create_rule | update_rule | toggle_rule | delete_rule | execute_admin_actions",
    targetRule: "nombre o id cuando corresponda",
    enabled: true,
    rule: {
      name: "nombre claro", instruction: text, enabled: true,
      trigger: { type: "incoming_message|deal_created|outgoing_message|stage_changed|assignment_changed|stock_changed|attendance_changed|task_overdue|order_status_changed|whatsapp_disconnected|sla_warning|document_generated|campaign_replied|client_created|scheduled|manual", text: { contains: [], anyContains: [], equals: "", regex: "", notContains: [] }, phone: "", clientName: "", clientTag: "", branchId: null, branchName: null, lineId: null, lineName: null, stage: "", fromStage: "", toStage: "", schedule: "HH:MM", everyMinutes: 0, slaMinutes: 0 },
      conditionMode: "all|any",
      conditions: [{ field: "client.ruc|deal.stage|message.text|client.custom.clave|...", op: "equals|contains|gt|exists|...", value: "valor" }],
      actions: [
        { type: "send_whatsapp", target: "current_client|fixed_number", phone: "", lineId: null, lineName: null, text: "", silent: true },
        { type: "wait_for_reply", timeoutMinutes: 60, branches: [{ label: "Sí", match: { anyContains: ["si","sí"] }, actions: [] }], defaultActions: [], timeoutActions: [] },
        { type: "branch_condition", mode: "all", conditions: [{field:"deal.total",op:"gte",value:"1000000"}], thenActions: [], elseActions: [] }
      ],
      cooldownMinutes: 0, oncePerClient: false, maxExecutions: 0
    },
    actions: []
  };
  const instructions = `Sos la Super IA Administradora de un CRM y tenés que convertir instrucciones del administrador en JSON ejecutable. NO simules y NO pidas confirmación. Solo usá capacidades presentes en catalog.actions. Si pide crear una automatización, operation=create_rule. Si pide cambiar una regla existente, update_rule. Si pide activar/desactivar/eliminar una regla, toggle_rule/delete_rule. Si pide un cambio directo de configuración, operation=execute_admin_actions. Para condiciones de datos usá rule.conditions; para una decisión dentro del flujo usá branch_condition con thenActions/elseActions. Para mensajes externos usá send_whatsapp. Si luego debe esperar una respuesta y actuar según el retorno, inmediatamente después del send_whatsapp agregá wait_for_reply con branches/defaultActions/timeoutActions. Si dice 'sin notificar', silent=true y NO agregues create_news ni create_task salvo que lo pida explícitamente. Podés crear tareas, aprobaciones, pedidos, visitas, objetivos, ajustar stock, cambiar marcación, crear negociaciones, configurar acceso de líneas WhatsApp y cambiar campos/etapas/responsables. También podés crear flujos CRM, agregar etapas a flujos, crear módulos personalizados, dashboards, perfiles de rol, políticas IA y subflujos reutilizables. Para memoria usá set_memory/clear_memory y para reutilizar protocolos call_subflow. Para cancelar seguimientos pendientes usá cancel_pending_actions. Variables disponibles incluyen {{ultimaCompra}}, {{montoHistorico}}, {{diasSinComprar}}, {{tiempoEsperando}}, {{probabilidadCierre}} y {{memory.clave}}. Nunca inventes IDs: preferí nombres (lineName, branchName, userName) si no existe un ID exacto en el catálogo. No expongas ni modifiques credenciales, API keys, contraseñas, archivos del servidor ni ejecutes código arbitrario. No generes envíos masivos desde esta herramienta; para campañas usá el módulo Campañas. Etapas internas válidas: new, contacted, waiting, won, lost, transferred. Devolvé SOLO JSON válido. Estructura de referencia: ${JSON.stringify(schemaHint)}.`;
  const result = await requestOpenAiText({ instructions, input: { instruction: text, catalog: catalogs }, maxOutputTokens: 1800, json: true });
  const parsed = result.json || {};
  const operation = ["create_rule","update_rule","toggle_rule","delete_rule","execute_admin_actions"].includes(parsed.operation) ? parsed.operation : "create_rule";
  return { ...parsed, operation, source: "ai", endpoint: result.endpoint, usage: result.usage };
}

async function applyParsedSuperAutomationInstruction(parsed, instruction, actor) {
  if (parsed.usage) recordAiUsage(actor, "superAutomation", { model: data.settings.model, inputTokens: parsed.usage.inputTokens, outputTokens: parsed.usage.outputTokens });
  const version=createConfigurationVersion(actor,`Antes de Super IA: ${cleanText(instruction,120)}`,{operation:parsed.operation});
  if (parsed.operation === "create_rule") {
    const rule = sanitizeAutomationRule({ ...(parsed.rule || {}), instruction, enabled: true }, actor);
    if (!rule.actions.length) throw new Error("La IA no produjo ninguna acción ejecutable.");
    const conflicts=automationRuleConflictSummary(rule);
    data.automationRules.unshift(rule);
    recordAuditEvent(actor, "super_ia_regla_creada", { ruleId: rule.id, name: rule.name, summary: summarizeAutomationRule(rule), conflicts:conflicts.length }, actor.branchId || primaryBranchId(), "user");
    await store.save();
    return { operation: "create_rule", rule, summary: summarizeAutomationRule(rule), source: parsed.source, warning: parsed.warning || null, conflicts, versionId:version?.id||null };
  }
  const targetNeedle = cleanText(parsed.targetRule, 180).toLocaleLowerCase("es");
  const target = (data.automationRules || []).find((rule) => rule.id === parsed.targetRule || cleanText(rule.name,180).toLocaleLowerCase("es") === targetNeedle || cleanText(rule.name,180).toLocaleLowerCase("es").includes(targetNeedle));
  if (["update_rule","toggle_rule","delete_rule"].includes(parsed.operation) && !target) throw new Error(`No encontré la regla indicada: ${parsed.targetRule || "sin nombre"}.`);
  if (parsed.operation === "update_rule") {
    const updated = sanitizeAutomationRule({ ...target, ...(parsed.rule || {}), id: target.id, instruction: instruction || target.instruction, createdAt: target.createdAt, createdByUserId: target.createdByUserId, createdByName: target.createdByName, executionCount: target.executionCount, lastExecutedAt: target.lastExecutedAt, version: Number(target.version || 1) + 1 }, actor);
    const conflicts=automationRuleConflictSummary(updated,target.id);
    Object.assign(target, updated); recordAuditEvent(actor, "super_ia_regla_modificada", { ruleId: target.id, name: target.name, version: target.version, conflicts:conflicts.length }, actor.branchId || primaryBranchId()); await store.save(); return { operation: "update_rule", rule: target, summary: summarizeAutomationRule(target), source: parsed.source, conflicts, versionId:version?.id||null };
  }
  if (parsed.operation === "toggle_rule") {
    target.enabled = parsed.enabled !== false; target.updatedAt = timestamp(); recordAuditEvent(actor, "super_ia_regla_estado", { ruleId: target.id, enabled: target.enabled }, actor.branchId || primaryBranchId()); await store.save(); return { operation: "toggle_rule", rule: target, source: parsed.source, versionId:version?.id||null };
  }
  if (parsed.operation === "delete_rule") {
    data.automationRules = data.automationRules.filter((rule) => rule.id !== target.id); for (const wait of data.automationWaits || []) if (wait.ruleId === target.id && wait.status === "waiting") wait.status = "cancelled"; for(const delayed of data.automationDelayedActions||[])if(delayed.ruleId===target.id&&delayed.status==='pending')delayed.status='cancelled'; recordAuditEvent(actor, "super_ia_regla_eliminada", { ruleId: target.id, name: target.name }, actor.branchId || primaryBranchId()); await store.save(); return { operation: "delete_rule", deletedId: target.id, source: parsed.source, versionId:version?.id||null };
  }
  if (parsed.operation === "execute_admin_actions") {
    const rule = { id: makeId("admincommand"), name: "Comando administrativo", createdByUserId: actor.id, createdByName: actor.name };
    const execution = automationExecutionEntry(rule, { type: "manual", branch: primaryBranch(), text: instruction });
    const context = automationContext({ rule, runId: execution.id, branch: primaryBranch(), text: instruction, event: { type: "manual" } });
    await executeAutomationActions(parsed.actions || [], context, execution, { depth: 0 }); execution.status = "completed"; execution.finishedAt = timestamp(); recordAuditEvent(actor, "super_ia_comando_admin", { instruction: cleanText(instruction,1000), actions: (parsed.actions||[]).map((a)=>a.type) }, actor.branchId || primaryBranchId()); await store.save(); return { operation: "execute_admin_actions", execution, source: parsed.source, versionId:version?.id||null };
  }
  throw new Error("La instrucción no pudo convertirse en una operación soportada.");
}

async function applySuperAutomationInstruction(instruction, actor) {
  const parsed = await parseSuperAutomationInstruction(instruction, actor);
  return applyParsedSuperAutomationInstruction(parsed,instruction,actor);
}

async function prepareSuperAdminInstruction(instruction,actor){
  const text=cleanText(instruction,6000);if(!text)throw new Error('Escribí una instrucción para la Super IA.');
  const parsed=await parseSuperAutomationInstruction(text,actor);const risk=superAdminRiskForParsed(parsed);const policy=data.settings.superAdmin?.powerPolicy?.[risk.level]||'confirm';
  let candidate=null,conflicts=[];if(['create_rule','update_rule'].includes(parsed.operation)){candidate=sanitizeAutomationRule({...(parsed.rule||{}),instruction:text,enabled:true},actor);const ignore=parsed.operation==='update_rule'?(data.automationRules||[]).find(r=>r.id===parsed.targetRule||cleanText(r.name,180).toLocaleLowerCase('es').includes(cleanText(parsed.targetRule,180).toLocaleLowerCase('es')))?.id:null;conflicts=automationRuleConflictSummary(candidate,ignore);}
  if(policy==='blocked')throw new Error(`La política de poder bloquea acciones de riesgo ${risk.level}.`);
  if(policy==='automatic'){const result=await applyParsedSuperAutomationInstruction(parsed,text,actor);return {...result,risk,policy,conflicts:result.conflicts||conflicts,needsConfirmation:false};}
  const pending={id:makeId('superpending'),instruction:text,parsed:cloneJson(parsed),risk,policy,conflicts,createdAt:timestamp(),expiresAt:timestamp(Date.now()+30*60_000),createdByUserId:actor.id,createdByName:actor.name};data.superAdminPending.unshift(pending);data.superAdminPending.splice(100);await store.save();
  return {operation:'preview',needsConfirmation:true,pendingId:pending.id,risk,policy,conflicts,preview:{operation:parsed.operation,targetRule:parsed.targetRule||null,rule:parsed.rule?{name:parsed.rule.name,trigger:parsed.rule.trigger,conditions:parsed.rule.conditions,actions:parsed.rule.actions}:null,actions:parsed.actions||[]},summary:`La instrucción fue interpretada. Riesgo ${risk.level}; requiere ${policy==='special_confirm'?'confirmación especial':'confirmación'}.`,source:parsed.source};
}

async function confirmSuperAdminInstruction(pendingId,actor,special=false){
  const pending=(data.superAdminPending||[]).find(x=>x.id===pendingId&&x.createdByUserId===actor.id);if(!pending)throw new Error('La confirmación ya no está disponible.');if(Date.parse(pending.expiresAt||0)<Date.now())throw new Error('La confirmación venció; volvé a enviar la instrucción.');if(pending.policy==='special_confirm'&&special!==true)throw new Error('Esta acción requiere confirmación especial del Administrador.');
  data.superAdminPending=data.superAdminPending.filter(x=>x.id!==pending.id);const result=await applyParsedSuperAutomationInstruction(pending.parsed,pending.instruction,actor);return {...result,risk:pending.risk,policy:pending.policy,conflicts:result.conflicts||pending.conflicts,needsConfirmation:false};
}

async function sendRawBranchText(sourceBranchId, targetPhone, text) {
  if (mockMode) return makeId("mockbranchmessage");
  const phone = normalizePhone(targetPhone);
  if (!phone) throw new Error("La sucursal destino no tiene un número de WhatsApp válido configurado.");
  if (sourceBranchId === primaryBranchId() && data.settings.whatsappMode === "cloud") {
    const result = await sendCloudPayload({ to: phone, type: "text", text: { body: text, preview_url: false } });
    return result.messages?.[0]?.id || makeId("cloudbranchmessage");
  }
  const socket = branchSocket(sourceBranchId);
  if (!socket || branchStatus(sourceBranchId) !== "connected") throw new Error(`WhatsApp de ${getBranch(sourceBranchId)?.name || "la sucursal origen"} no está conectado.`);
  const sent = await socket.sendMessage(`${phone}@s.whatsapp.net`, { text });
  return sent?.key?.id || makeId("branchmessage");
}

function chooseIncomingTransferOwner(client = null, branchId = null) {
  const localId = branchId || primaryBranchId();
  const existingOwnerId = client?.branchOwners?.[localId]?.userId || client?.ownerUserId || null;
  if (existingOwnerId) {
    const existing = data.users.find((entry) => entry.id === existingOwnerId && entry.active !== false && entry.role === "agent" && (!entry.branchId || entry.branchId === localId));
    if (existing) return existing;
  }
  const agents = data.users
    .filter((entry) => entry.active !== false && entry.role === "agent" && (!entry.branchId || entry.branchId === localId))
    .sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username), "es"));
  if (!agents.length) {
    return data.users.find((entry) => entry.active !== false && entry.role === "manager" && (!entry.branchId || entry.branchId === localId)) || null;
  }
  const index = Math.max(0, Number(data.settings.transferRoundRobinIndex || 0));
  const owner = agents[index % agents.length];
  data.settings.transferRoundRobinIndex = (index + 1) % agents.length;
  return owner;
}

function transferSystemMessage(packet, sourceBranch, owner) {
  const pieces = [`Transferencia recibida desde ${sourceBranch?.name || packet.sourceName || "otra sucursal"}.`];
  if (packet.interest) pieces.push(`Interés / producto: ${cleanText(packet.interest, 300)}.`);
  if (packet.reason) pieces.push(`Motivo / consulta: ${cleanText(packet.reason, 600)}.`);
  if (packet.note) pieces.push(`Nota interna: ${cleanText(packet.note, 600)}.`);
  if (owner) pieces.push(`Asignado automáticamente a ${owner.name}.`);
  return pieces.join("\n");
}

async function processIncomingBranchTransfer(packet, sourceJid, messageId, occurredAt = Date.now(), trustedSourceBranch = null) {
  if (packet?.id && (data.transfers || []).some((entry) => entry.id === packet.id && entry.direction === "incoming")) return true;
  const sourcePhone = normalizePhone(packet?.sourcePhone || phoneFromAnyJid(sourceJid));
  const sourceBranch = trustedSourceBranch || branchByPhone(sourcePhone) || (data.branches || []).find((branch) => cleanText(branch.code, 40).toUpperCase() === cleanText(packet?.sourceCode, 40).toUpperCase());
  const localBranch = primaryBranch();
  if (!sourceBranch || sourceBranch.id === localBranch?.id) {
    addActivity(data, `Se ignoró una transferencia interna desde un número no registrado como sucursal: +${sourcePhone || "desconocido"}.`, "warning");
    return false;
  }
  if (packet.targetCode && cleanText(packet.targetCode, 40).toUpperCase() !== cleanText(localBranch?.code, 40).toUpperCase()) {
    addActivity(data, `La transferencia indica destino ${packet.targetName || packet.targetCode}, pero llegó al WhatsApp de ${localBranch?.name || "esta sucursal"}. Se procesó porque el número remitente está registrado como sucursal confiable.`, "warning");
  }
  if (packet.type !== "branch-transfer-v3") {
    addActivity(data, `Transferencia ${packet.id || ""} ignorada por seguridad: fue enviada por una versión anterior que no verifica el número real del cliente. Actualizá ambas sucursales a V10 o superior.`, "warning");
    return false;
  }
  const clientPhone = normalizePhone(packet.clientPhone);
  const packetJidPhone = normalizePhoneJid(packet.clientJid || "");
  const packetJidDigits = packetJidPhone ? normalizePhone(jidUser(packetJidPhone)) : "";
  if (!isPlausibleTransferPhone(clientPhone) || (packetJidDigits && packetJidDigits !== clientPhone)) {
    addActivity(data, `Transferencia ${packet.id || ""} ignorada: el número real del cliente no pudo validarse de forma segura.`, "warning");
    return false;
  }
  const jid = `${clientPhone}@s.whatsapp.net`;
  const deal = createDeal(data, { jid, name: cleanText(packet.clientName, 120) || `Cliente +${clientPhone}`, branchId: localBranch.id, source: "branch-transfer", now: occurredAt });
  const client = findClient(data, deal.clientId);
  if (client && packet.clientName) {
    client.name = cleanText(packet.clientName, 120);
    client.updatedAt = timestamp(occurredAt);
    deal.name = client.name;
  }

  const owner = chooseIncomingTransferOwner(client, localBranch.id);
  if (owner) {
    deal.ownerUserId = owner.id;
    deal.ownerName = owner.name;
    if (client) {
      client.ownerUserId = owner.id;
      client.ownerName = owner.name;
      client.branchOwners = client.branchOwners && typeof client.branchOwners === "object" ? client.branchOwners : {};
      client.branchOwners[localBranch.id] = { userId: owner.id, userName: owner.name, updatedAt: timestamp(occurredAt) };
      client.updatedAt = timestamp(occurredAt);
    }
  }

  deal.source = "branch-transfer";
  deal.transferredFromBranchId = sourceBranch.id;
  deal.transferInterest = cleanText(packet.interest, 300);
  deal.transferReason = cleanText(packet.reason, 600);
  deal.transferNote = cleanText(packet.note, 600);
  deal.transferHistory = Array.isArray(deal.transferHistory) ? deal.transferHistory : [];
  deal.transferHistory.push({
    id: packet.id || makeId("transfer"),
    direction: "incoming",
    sourceBranchId: sourceBranch.id,
    sourceBranchName: sourceBranch.name,
    targetBranchId: localBranch.id,
    sourceDealId: cleanText(packet.sourceDealId, 160),
    at: timestamp(occurredAt),
    byName: cleanText(packet.requestedBy, 120),
  });
  deal.messages = Array.isArray(deal.messages) ? deal.messages : [];
  deal.messages.push({
    id: `transfer_${packet.id || messageId || makeId("incoming")}`,
    direction: "system",
    origin: "transfer",
    text: transferSystemMessage(packet, sourceBranch, owner),
    at: timestamp(occurredAt),
    attachment: null,
    historical: false,
    agentUserId: owner?.id || null,
    agentName: owner?.name || "",
  });
  deal.lastMessage = packet.interest || packet.reason || `Transferencia desde ${sourceBranch.name}`;
  deal.updatedAt = timestamp(occurredAt);
  deal.botActive = false;

  const intro = renderBranchIntro(localBranch, sourceBranch, client || deal, packet);
  try {
    const introMessageId = await sendProviderText(deal, intro);
    rememberSeen(introMessageId);
    recordHumanOutgoing(data, {
      jid: deal.jid,
      name: deal.name,
      text: intro,
      messageId: introMessageId,
      userId: owner?.id || null,
      userName: owner?.name || localBranch.name,
      branchId: localBranch.id,
      now: occurredAt,
    });
    deal.stage = STAGES.CONTACTED;
    deal.botActive = false;
    const incomingTransfer = {
      id: packet.id || makeId("transfer"),
      sourceBranchId: sourceBranch.id,
      targetBranchId: localBranch.id,
      sourceDealId: cleanText(packet.sourceDealId, 160),
      targetDealId: deal.id,
      clientId: deal.clientId,
      clientPhone: deal.phone,
      clientName: deal.name,
      interest: cleanText(packet.interest, 300),
      reason: cleanText(packet.reason, 600),
      requestedByName: cleanText(packet.requestedBy, 120),
      assignedUserId: owner?.id || null,
      assignedUserName: owner?.name || "",
      internalMessageId: messageId || null,
      introMessageId,
      direction: "incoming",
      status: "received",
      createdAt: timestamp(occurredAt),
    };
    data.transfers.unshift(incomingTransfer);
    if (data.transfers.length > 2000) data.transfers.splice(2000);
    addActivity(data, `${sourceBranch.name} transfirió a ${deal.name}. ${owner ? `${owner.name} quedó como responsable y ` : ""}${localBranch.name} se presentó automáticamente al cliente.`, "success");
    recordAuditEvent(null, "transferencia_recibida", {
      dealId: deal.id,
      clientId: deal.clientId,
      clientPhone: deal.phone,
      clientName: deal.name,
      sourceBranch: sourceBranch.name,
      sourceBranchCode: sourceBranch.code || "",
      interest: cleanText(packet.interest, 300),
      reason: cleanText(packet.reason, 600),
      ownerUserId: owner?.id || null,
      ownerName: owner?.name || "",
    }, localBranch.id, "system");

    const ack = [
      `✅ TRANSFERENCIA RECIBIDA`,
      `Cliente: ${deal.name}`,
      `Sucursal: ${localBranch.name}`,
      `Responsable: ${owner?.name || "Sin asignar"}`,
      `[WBX2ACK:${packet.id}]`,
    ].join("\n");
    await sendRawBranchText(localBranch.id, sourceBranch.phone || sourcePhone, ack).catch((error) => {
      addActivity(data, `No se pudo confirmar la transferencia a ${sourceBranch.name}: ${error.message}`, "warning");
    });
  } catch (error) {
    deal.stage = STAGES.NEW;
    deal.botActive = false;
    addActivity(data, `Se creó la transferencia de ${deal.name}, pero no se pudo enviar la bienvenida: ${error.message}`, "warning");
    recordAuditEvent(null, "transferencia_recibida_sin_bienvenida", {
      dealId: deal.id,
      clientId: deal.clientId,
      clientPhone: deal.phone,
      clientName: deal.name,
      sourceBranch: sourceBranch.name,
      error: cleanText(error?.message || error, 500),
    }, localBranch.id, "system");
  }
  return true;
}

function processIncomingTransferAck(transferId, sourceJid, trustedSourceBranch = null) {
  const sourcePhone = phoneFromAnyJid(sourceJid);
  const sourceBranch = trustedSourceBranch || branchByPhone(sourcePhone);
  const entry = (data.transfers || []).find((transfer) => transfer.id === transferId && transfer.direction !== "incoming");
  if (!entry) return false;
  entry.status = "received";
  entry.acknowledgedAt = timestamp();
  if (sourceBranch) entry.acknowledgedByBranchId = sourceBranch.id;
  addActivity(data, `${sourceBranch?.name || "La sucursal destino"} confirmó la recepción de ${entry.clientName || "la transferencia"}.`, "success");
  return true;
}

async function uploadCloudMedia(buffer, info) {
  const phoneNumberId = data.settings.whatsappApi?.phoneNumberId;
  if (!phoneNumberId) throw new Error("Configurá el ID del número de WhatsApp API.");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", info.mimeType);
  form.append("file", new Blob([buffer], { type: info.mimeType }), info.fileName);
  const result = await cloudFetch(`${phoneNumberId}/media`, { method: "POST", body: form });
  if (!result.id) throw new Error("WhatsApp API no devolvió el identificador del archivo.");
  return result.id;
}

async function uploadLineCloudMedia(line, buffer, info) {
  const phoneNumberId=lineCloudConfig(line)?.phoneNumberId;
  if(!phoneNumberId) throw new Error(`Configurá el ID del número de ${line?.name||"la línea"}.`);
  const form=new FormData(); form.append("messaging_product","whatsapp"); form.append("type",info.mimeType); form.append("file",new Blob([buffer],{type:info.mimeType}),info.fileName);
  const result=await lineCloudFetch(line,`${phoneNumberId}/media`,{method:"POST",body:form});
  if(!result.id) throw new Error("WhatsApp API no devolvió el identificador del archivo.");
  return result.id;
}

async function sendProviderMedia(deal, buffer, info) {
  if (mockMode) return makeId("mockmedia");
  const line=dealWhatsappLine(deal);
  if(!line) throw new Error("La negociación no tiene una línea de WhatsApp disponible.");
  if(line.provider==="cloud"){
    if(!lineCloudConfigured(line)) throw new Error(`Cloud API de ${line.name} no está configurada.`);
    const cloudAudioTypes=new Set(["audio/aac","audio/amr","audio/mpeg","audio/mp4","audio/ogg"]);
    const type=info.kind==="audio"&&!cloudAudioTypes.has(info.mimeType)?"document":info.kind==="document"?"document":info.kind;
    const uploadInfo=type==="document"&&info.kind==="audio"?{...info,kind:"document",mimeType:"application/octet-stream"}:info;
    const mediaId=await uploadLineCloudMedia(line,buffer,uploadInfo);
    const object={id:mediaId}; if(info.caption&&["image","video","document"].includes(type))object.caption=info.caption; if(type==="document")object.filename=info.fileName;
    const result=await sendLineCloudPayload(line,{to:normalizePhone(deal.phone),type,[type]:object});
    return result.messages?.[0]?.id||makeId("cloudmedia");
  }
  const socket=lineSocket(line.id);
  if(!socket||lineStatus(line.id)!=="connected") throw new Error(`WhatsApp ${line.name} · ${getBranch(line.branchId)?.name||"Sucursal"} no está conectado.`);
  let content;
  if(info.kind==="image")content={image:buffer,caption:info.caption,mimetype:info.mimeType};
  else if(info.kind==="video")content={video:buffer,caption:info.caption,mimetype:info.mimeType};
  else if(info.kind==="audio")content={audio:buffer,mimetype:info.mimeType,ptt:info.ptt&&info.mimeType.includes("ogg")};
  else content={document:buffer,mimetype:info.mimeType,fileName:info.fileName,caption:info.caption};
  const sent=await socket.sendMessage(deal.jid,content); return sent?.key?.id||makeId("qrmedia");
}

async function downloadCloudAttachment(media) {
  if (!media?.id) return null;
  try {
    const metadata = await cloudFetch(media.id);
    if (!metadata.url) return null;
    const response = await fetch(metadata.url, { headers: { Authorization: `Bearer ${data.settings.whatsappApi.accessToken}` } });
    if (!response.ok) throw new Error(`No se pudo descargar el archivo (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = cleanText(media.mime_type || response.headers.get("content-type"), 160) || "application/octet-stream";
    const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "document";
    const info = {
      kind,
      mimeType,
      fileName: safeFileName(media.filename || `${kind}-${Date.now()}${extensionForMime(mimeType, kind)}`),
      caption: cleanText(media.caption, 1000),
      duration: 0,
      ptt: Boolean(media.voice),
    };
    return saveAttachmentBuffer(buffer, info);
  } catch (error) {
    console.error("[cloud media]", error?.message || error);
    return null;
  }
}



function v212IdentityForPhone(phone = "") {
  return findClientIdentity(data, { phone: normalizePhone(phone) });
}

function v212DealSoldValue(deal) {
  return (deal?.items || []).filter((item) => item.status === "sold").reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
}

function refreshClientBranchRelationships(client) {
  if (!client) return [];
  const previous = new Map((client.branchRelationships || []).filter((entry) => entry?.branchId).map((entry) => [entry.branchId, { ...entry }]));
  const map = new Map();
  for (const [branchId, entry] of previous) map.set(branchId, { ...entry, purchaseCount: 0, totalPurchased: 0, lastPurchaseAt: null, lastInteractionAt: null });
  const related = (data.deals || []).filter((deal) => deal.clientId === client.id && deal.branchId);
  for (const deal of related) {
    const existing = map.get(deal.branchId) || { branchId: deal.branchId, active: true, manual: false, preferred: false, customerSince: deal.createdAt || timestamp(), createdAt: deal.createdAt || timestamp() };
    const updated = { ...existing };
    if (!updated.customerSince || Date.parse(deal.createdAt || 0) < Date.parse(updated.customerSince || 0)) updated.customerSince = deal.createdAt || updated.customerSince || timestamp();
    if (!updated.lastInteractionAt || Date.parse(deal.updatedAt || deal.createdAt || 0) > Date.parse(updated.lastInteractionAt || 0)) updated.lastInteractionAt = deal.updatedAt || deal.createdAt || updated.lastInteractionAt;
    if (deal.stage === STAGES.WON) {
      updated.purchaseCount = Number(updated.purchaseCount || 0) + 1;
      updated.totalPurchased = Number(updated.totalPurchased || 0) + v212DealSoldValue(deal);
      if (!updated.lastPurchaseAt || Date.parse(deal.outcomeAt || deal.updatedAt || 0) > Date.parse(updated.lastPurchaseAt || 0)) updated.lastPurchaseAt = deal.outcomeAt || deal.updatedAt || deal.createdAt;
    }
    const branchOwner = client.branchOwners?.[deal.branchId];
    if (branchOwner) { updated.ownerUserId = branchOwner.userId || null; updated.ownerName = branchOwner.userName || ""; }
    updated.updatedAt = timestamp();
    map.set(deal.branchId, updated);
  }
  client.branchRelationships = [...map.values()].filter((entry) => getBranch(entry.branchId)).sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    return Date.parse(b.lastPurchaseAt || b.lastInteractionAt || 0) - Date.parse(a.lastPurchaseAt || a.lastInteractionAt || 0);
  });
  return client.branchRelationships;
}

function v212BranchChoices(client, currentBranchId = null) {
  const relationships = refreshClientBranchRelationships(client);
  const requirePurchases = data.settings.clientIdentity?.promptOnlyAfterPurchases !== false;
  const ids = relationships.filter((entry) => entry.active !== false && (entry.manual === true || !requirePurchases || Number(entry.purchaseCount || 0) > 0)).map((entry) => entry.branchId);
  if (ids.length >= 2 && data.settings.clientIdentity?.includeCurrentBranchInSelector === true && currentBranchId && getBranch(currentBranchId)?.active !== false && !ids.includes(currentBranchId)) ids.push(currentBranchId);
  return [...new Set(ids)].map((id) => getBranch(id)).filter((branch) => branch?.active !== false);
}

function prepareMultiBranchSelection(deal, created = false) {
  if (!deal || !created || data.settings.clientIdentity?.branchPromptEnabled === false) return false;
  const client = findClient(data, deal.clientId);
  if (!client || client.branchChoiceMode === "never") return false;
  const choices = v212BranchChoices(client, deal.branchId);
  if (choices.length < 2) return false;
  if (client.branchChoiceMode === "prefer_last" && client.preferredBranchId && choices.some((branch) => branch.id === client.preferredBranchId)) {
    deal.selectedBranchId = client.preferredBranchId;
    return false;
  }
  deal.branchSelection = {
    required: true,
    status: "pending",
    originalBranchId: deal.branchId || primaryBranchId(),
    eligibleBranchIds: choices.map((branch) => branch.id),
    askedAt: null,
    selectedBranchId: null,
    selectedAt: null,
  };
  deal.ownerUserId = null;
  deal.ownerName = "";
  deal.coverageRequired = false;
  deal.coverageReason = "Esperando que el cliente elija con qué sucursal desea continuar.";
  deal.updatedAt = timestamp();
  return true;
}

function v212BranchChoicePrompt(deal, prefix = "") {
  const ids = deal?.branchSelection?.eligibleBranchIds || [];
  const branches = ids.map((id) => getBranch(id)).filter(Boolean);
  const client = findClient(data, deal?.clientId);
  const intro = prefix || `Veo que ${client?.entityType === "company" ? "la empresa" : "ya"} tiene historial con más de una sucursal.`;
  return `${intro}\n\n¿Con cuál sucursal querés continuar esta compra o consulta?\n${branches.map((branch, index) => `${index + 1}. ${branch.name}${branch.city ? ` · ${branch.city}` : ""}`).join("\n")}\n\nRespondé con el número o el nombre de la sucursal.`;
}

function v212MatchBranchChoice(deal, text = "") {
  const ids = deal?.branchSelection?.eligibleBranchIds || [];
  const branches = ids.map((id) => getBranch(id)).filter(Boolean);
  const raw = cleanText(text, 300).trim();
  const index = Number.parseInt(raw.replace(/\D/g, ""), 10);
  if (Number.isFinite(index) && index >= 1 && index <= branches.length && /^\s*\d+\s*[.)-]?\s*$/.test(raw)) return branches[index - 1];
  const normalized = raw.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const direct = branches.find((branch) => {
    const name = String(branch.name || "").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const code = String(branch.code || "").toLocaleLowerCase("es");
    return (name && (normalized === name || normalized.includes(name))) || (code && normalized === code);
  });
  return direct || null;
}

async function v212RouteSelectedBranch(sourceDeal, targetBranch) {
  const sourceBranch = getBranch(sourceDeal.branchId || primaryBranchId());
  const client = findClient(data, sourceDeal.clientId);
  if (!sourceBranch || !targetBranch || !client) return sourceDeal;
  refreshClientBranchRelationships(client);
  client.preferredBranchId = targetBranch.id;
  for (const relation of client.branchRelationships || []) relation.preferred = relation.branchId === targetBranch.id;
  client.updatedAt = timestamp();

  if (targetBranch.id === sourceBranch.id) {
    const ownerId = client.branchOwners?.[targetBranch.id]?.userId;
    const priorOwner = ownerId ? data.users.find((entry) => entry.id === ownerId && entry.active !== false && (!entry.branchId || entry.branchId === targetBranch.id)) : null;
    const owner = priorOwner || chooseIncomingTransferOwner(client, targetBranch.id);
    if (owner) applyOwnerToClientAndDeal(client, sourceDeal, owner, targetBranch.id);
    sourceDeal.branchSelection.status = "selected";
    sourceDeal.branchSelection.selectedBranchId = targetBranch.id;
    sourceDeal.branchSelection.selectedAt = timestamp();
    sourceDeal.selectedBranchId = targetBranch.id;
    sourceDeal.stage = STAGES.WAITING;
    sourceDeal.waitingSince = sourceDeal.lastClientAt || timestamp();
    sourceDeal.coverageReason = "";
    sourceDeal.updatedAt = timestamp();
    await sendBotMessage(sourceDeal, `Perfecto. Continuamos con ${targetBranch.name}${owner ? ` y tu consulta queda asignada a ${owner.name}` : ""}.`, "branch-selector");
    return sourceDeal;
  }

  await sendBotMessage(sourceDeal, `Perfecto. Voy a derivar tu consulta a ${targetBranch.name}. El historial de ${client.name || "tu cuenta"} se mantiene unificado.`, "branch-selector");
  const targetLine = defaultWhatsappLine(targetBranch.id);
  let targetDeal = findOpenDeal(data, sourceDeal.jid, targetBranch.id, targetLine?.id || null);
  if (!targetDeal) targetDeal = createDeal(data, { jid: sourceDeal.jid, name: client.name || sourceDeal.name, branchId: targetBranch.id, lineId: targetLine?.id || null, source: "customer-branch-choice" });
  targetDeal.clientId = client.id;
  targetDeal.contactPersonId = sourceDeal.contactPersonId || targetDeal.contactPersonId || null;
  targetDeal.contactPersonName = sourceDeal.contactPersonName || targetDeal.contactPersonName || "";
  targetDeal.contactRole = sourceDeal.contactRole || targetDeal.contactRole || "";
  targetDeal.identityType = sourceDeal.identityType || targetDeal.identityType || "client";
  targetDeal.branchSelection = { required: true, status: "selected", originalBranchId: sourceBranch.id, eligibleBranchIds: sourceDeal.branchSelection?.eligibleBranchIds || [], selectedBranchId: targetBranch.id, selectedAt: timestamp(), askedAt: sourceDeal.branchSelection?.askedAt || timestamp() };
  targetDeal.selectedBranchId = targetBranch.id;
  targetDeal.botActive = false;
  targetDeal.stage = STAGES.NEW;
  targetDeal.lastMessage = `Cliente eligió ${targetBranch.name} · ${sourceDeal.lastMessage || "Nueva consulta"}`;
  targetDeal.updatedAt = timestamp();
  targetDeal.messages = Array.isArray(targetDeal.messages) ? targetDeal.messages : [];
  targetDeal.messages.push({ id: makeId("message"), direction: "system", origin: "branch-selector", text: `${client.entityType === "company" ? "Empresa" : "Cliente"}: ${client.name}. ${sourceDeal.contactPersonName ? `Contacto: ${sourceDeal.contactPersonName}${sourceDeal.contactRole ? ` (${sourceDeal.contactRole})` : ""}. ` : ""}El cliente eligió continuar con ${targetBranch.name}. Consulta original: ${sourceDeal.lastMessage || "Sin detalle"}`, at: timestamp(), attachment: null, historical: false, agentUserId: null, agentName: "" });
  const targetOwnerId = client.branchOwners?.[targetBranch.id]?.userId;
  const targetPriorOwner = targetOwnerId ? data.users.find((entry) => entry.id === targetOwnerId && entry.active !== false && (!entry.branchId || entry.branchId === targetBranch.id)) : null;
  const targetOwner = targetPriorOwner || chooseIncomingTransferOwner(client, targetBranch.id);
  if (targetOwner) applyOwnerToClientAndDeal(client, targetDeal, targetOwner, targetBranch.id);

  sourceDeal.stage = STAGES.TRANSFERRED;
  sourceDeal.transferredToBranchId = targetBranch.id;
  sourceDeal.transferredAt = timestamp();
  sourceDeal.transferredByUserId = null;
  sourceDeal.transferredByName = "Selector inteligente de sucursal";
  sourceDeal.botActive = false;
  sourceDeal.waitingSince = null;
  sourceDeal.outcomeAt = timestamp();
  sourceDeal.branchSelection.status = "selected";
  sourceDeal.branchSelection.selectedBranchId = targetBranch.id;
  sourceDeal.branchSelection.selectedAt = timestamp();
  sourceDeal.updatedAt = timestamp();

  data.transfers.unshift({ id: makeId("transfer"), sourceBranchId: sourceBranch.id, targetBranchId: targetBranch.id, sourceDealId: sourceDeal.id, targetDealId: targetDeal.id, clientId: client.id, clientPhone: sourceDeal.phone, clientName: client.name, contactPersonId: sourceDeal.contactPersonId || null, contactPersonName: sourceDeal.contactPersonName || "", interest: sourceDeal.lastMessage || "", reason: "Sucursal elegida por el cliente", note: "Derivación automática por relación multi-sucursal.", requestedByUserId: null, requestedByName: "Selector inteligente", direction: "internal", status: "received", createdAt: timestamp() });
  if (data.transfers.length > 2000) data.transfers.splice(2000);
  addActivity(data, `${client.name} eligió ${targetBranch.name}; la consulta fue derivada automáticamente.`, "success");

  if (data.settings.clientIdentity?.autoTransferOnChoice !== false && targetLine && whatsappLineConnectionState(targetLine.id)?.status === "connected") {
    try {
      const intro = `Hola${sourceDeal.contactPersonName ? ` ${sourceDeal.contactPersonName}` : ""}. Soy del equipo de ${targetBranch.name}. Recibimos tu consulta y continuamos desde acá.`;
      const messageId = await sendProviderText(targetDeal, intro);
      recordHumanOutgoing(data, { jid: targetDeal.jid, name: targetDeal.name, text: intro, messageId, userId: targetOwner?.id || null, userName: targetOwner?.name || targetBranch.name, branchId: targetBranch.id, lineId: targetLine.id });
      targetDeal.stage = STAGES.CONTACTED;
      targetDeal.updatedAt = timestamp();
    } catch (error) {
      targetDeal.coverageRequired = true;
      targetDeal.coverageReason = `El cliente eligió ${targetBranch.name}, pero no se pudo enviar la presentación automática desde su línea. Un agente debe continuar manualmente.`;
      addActivity(data, `${targetBranch.name}: cliente derivado, pero la presentación automática no pudo enviarse.`, "warning");
    }
  }
  await store.save();
  return targetDeal;
}

async function maybeHandleBranchSelection(deal, text) {
  const selection = deal?.branchSelection;
  if (!selection || selection.status !== "pending") return false;
  if (!selection.askedAt) {
    selection.askedAt = timestamp();
    deal.updatedAt = timestamp();
    await sendBotMessage(deal, v212BranchChoicePrompt(deal), "branch-selector");
    return true;
  }
  const targetBranch = v212MatchBranchChoice(deal, text);
  if (!targetBranch) {
    await sendBotMessage(deal, v212BranchChoicePrompt(deal, "No pude identificar la sucursal elegida."), "branch-selector");
    return true;
  }
  await v212RouteSelectedBranch(deal, targetBranch);
  return true;
}

function applyIncomingRouting(deal, created = false) {
  if (!deal) return;
  const branchId = deal.branchId || primaryBranchId();
  if (deal.branchSelection?.status === "pending") {
    deal.stage = STAGES.NEW;
    deal.ownerUserId = null;
    deal.ownerName = "";
    if (deal.botHumanHandoff === true) {
      deal.botActive = false;
      deal.botMode = "copilot";
    } else {
      deal.botActive = true;
      deal.botMode = "auto";
    }
    deal.waitingSince = deal.lastClientAt || timestamp();
    deal.coverageRequired = false;
    deal.coverageReason = "Esperando que el cliente elija con qué sucursal desea continuar.";
    return;
  }
  if (deal.ownerUserId) {
    deal.stage = STAGES.WAITING;
    deal.waitingSince = deal.lastClientAt || timestamp();
    // Nunca reactivar automáticamente el bot después de una intervención humana.
    // El chat permanece en modo Copiloto hasta una reactivación manual explícita.
    if (deal.botHumanHandoff === true) {
      deal.botActive = false;
      deal.botMode = "copilot";
      deal.botPauseReason = "human_takeover";
    } else if (deal.botPauseReason === "manual") {
      deal.botActive = false;
      deal.botMode = "paused";
    } else {
      deal.botActive = true;
      deal.botMode = "auto";
      deal.botPauseReason = "";
    }
    if (isOwnerAway(deal)) {
      const owner = data.users.find((entry) => entry.id === deal.ownerUserId);
      deal.coverageRequired = true;
      deal.coverageReason = `${owner?.name || "El responsable"} está ${attendanceStatus(owner) === "away" ? "de permiso/ausente" : "fuera de línea"}. El jefe puede cubrir temporalmente sin cambiar el responsable.`;
      addActivity(data, `${deal.name} escribió mientras ${deal.ownerName || "su responsable"} está ausente. Se activó cobertura de jefatura.`, "warning");
    } else {
      deal.coverageRequired = false;
      deal.coverageReason = "";
    }
  } else if (created) {
    deal.stage = STAGES.NEW;
    deal.botActive = true;
    deal.botHumanHandoff = false;
    deal.botMode = "auto";
    deal.botPauseReason = "";
    deal.coverageRequired = false;
    deal.coverageReason = availableAgents(branchId).length ? "" : "No hay agentes marcados como Disponibles; jefatura puede intervenir.";
  }
}

function markCampaignReply(phone, at = timestamp()) {
  if (typeof at === "number") at = timestamp(at);
  const normalized = normalizePhone(phone);
  const messageAt = Date.parse(at || 0);
  let latest = null;
  for (const campaign of data.campaigns || []) {
    for (const recipient of campaign.recipients || []) {
      if (recipient.status !== "sent" || recipient.repliedAt || normalizePhone(recipient.phone) !== normalized) continue;
      const sentAt = Date.parse(recipient.sentAt || 0);
      if (!sentAt || messageAt < sentAt || messageAt - sentAt > 14 * 24 * 60 * 60 * 1000) continue;
      if (!latest || sentAt > latest.sentAt) latest = { recipient, sentAt };
    }
  }
  if (latest) latest.recipient.repliedAt = at;
}

function applyMarketingOptOut(deal, text) {
  const client = deal?.clientId ? findClient(data, deal.clientId) : null;
  if (!client || client.marketingOptIn !== true) return false;
  const normalized = cleanText(text, 1000).trim().toLocaleLowerCase("es");
  const exact = new Set(["stop", "baja", "cancelar", "no promociones", "no publicidad"]);
  const phrase = /(no quiero recibir (?:más )?(?:mensajes|promociones|publicidad)|no me (?:env[ií]en|manden|escriban) (?:más )?(?:promociones|publicidad|mensajes comerciales)|dame de baja|darme de baja|cancelar (?:la )?suscripci[oó]n)/i.test(normalized);
  if (!exact.has(normalized) && !phrase) return false;
  client.marketingOptIn = false; client.marketingOptInAt = null; client.updatedAt = timestamp();
  addActivity(data, `${client.name || client.phone} solicitó dejar de recibir campañas.`, "warning");
  recordAuditEvent(null, "cliente_baja_campanas", { clientId: client.id, clientPhone: client.phone, dealId: deal?.id }, deal?.branchId || primaryBranchId(), "system");
  for (const campaign of data.campaigns || []) for (const recipient of campaign.recipients || []) if (recipient.clientId === client.id && ["pending","queued"].includes(recipient.status)) { recipient.status = "skipped"; recipient.error = "Cliente solicitó baja de comunicaciones comerciales."; }
  return true;
}

async function downloadLineCloudAttachment(line, media) {
  if(!media?.id) return null;
  try{
    const metadata=await lineCloudFetch(line,media.id); if(!metadata.url)return null;
    const response=await fetch(metadata.url,{headers:{Authorization:`Bearer ${lineCloudConfig(line)?.accessToken||""}`}}); if(!response.ok)throw new Error(`No se pudo descargar el archivo (${response.status}).`);
    const buffer=Buffer.from(await response.arrayBuffer()); const mimeType=cleanText(media.mime_type||response.headers.get("content-type"),160)||"application/octet-stream";
    const kind=mimeType.startsWith("image/")?"image":mimeType.startsWith("video/")?"video":mimeType.startsWith("audio/")?"audio":"document";
    return saveAttachmentBuffer(buffer,{kind,mimeType,fileName:safeFileName(media.filename||`${kind}-${Date.now()}${extensionForMime(mimeType,kind)}`),caption:cleanText(media.caption,1000),duration:0,ptt:Boolean(media.voice)});
  }catch(error){console.error("[cloud line media]",error?.message||error);return null;}
}

async function processCloudWebhook(body) {
  const messages=[];
  for(const entry of body?.entry||[]){
    for(const change of entry?.changes||[]){
      const value=change?.value||{}; const phoneNumberId=cleanText(value.metadata?.phone_number_id,100);
      let line=(data.whatsappLines||[]).find((candidate)=>candidate.provider==="cloud"&&cleanText(lineCloudConfig(candidate)?.phoneNumberId,100)===phoneNumberId) || defaultWhatsappLine(primaryBranchId());
      if(line?.provider!=="cloud") line=(data.whatsappLines||[]).find((candidate)=>candidate.provider==="cloud"&&candidate.active!==false)||line;
      const names=new Map((value.contacts||[]).map((contact)=>[contact.wa_id,contact.profile?.name||""]));
      for(const item of value.messages||[])messages.push({item,name:names.get(item.from)||"",line});
    }
  }
  for(const {item,name,line} of messages){
    if(!item?.id||seenMessages.has(item.id)||!line)continue; rememberSeen(item.id);
    const phone=normalizePhone(item.from),jid=`${phone}@s.whatsapp.net`; const rawMedia=item.image||item.video||item.audio||item.document||null;
    const text=cleanText(item.text?.body||item.button?.text||item.interactive?.button_reply?.title||rawMedia?.caption||"",6000);
    const ackId=decodeTransferAck(text),packet=decodeTransferPacket(text); const sourceBranch=branchByPhone(phone)||(packet?.sourcePhone?branchByPhone(packet.sourcePhone):null)||(packet?.sourceCode?(data.branches||[]).find((branch)=>cleanText(branch.code,40).toUpperCase()===cleanText(packet.sourceCode,40).toUpperCase()):null);
    if(sourceBranch||packet||ackId){if(ackId&&sourceBranch)processIncomingTransferAck(ackId,jid,sourceBranch);else if(packet&&sourceBranch)await processIncomingBranchTransfer(packet,jid,item.id,Number(item.timestamp||0)*1000||Date.now(),sourceBranch);else if(sourceBranch)addActivity(data,`Mensaje interno recibido desde ${sourceBranch.name}; no se generó una negociación.`,"neutral");else addActivity(data,"Paquete interno ignorado porque el número de origen no está registrado como sucursal.","warning");continue;}
    const attachment=rawMedia?await downloadLineCloudAttachment(line,rawMedia):null; const localClient=findClientIdentity(data,{phone})?.client||null; const sharedProfile=(!localClient||!localClient.name||localClient.name===localClient.phone)?centralClientProfileByPhone(phone):null; const resolvedName=cleanText(localClient?.name,120)||cleanText(sharedProfile?.name,120)||name;
    const isolated=await tryConsumeIsolatedCommunication({phone,text:text||messageLabel(attachment)||"Archivo recibido",lineId:line.id,branchId:line.branchId,messageId:item.id});
    if(isolated.consumed){await store.save();continue;}
    const {deal,created}=recordIncoming(data,{jid,name:resolvedName,branchId:line.branchId,lineId:line.id,text:text||messageLabel(attachment)||"Archivo recibido",messageId:item.id,attachment,now:Number(item.timestamp||0)*1000||Date.now()}); refreshDealCommercialStatus(deal,true);
    if(text) captureIncomingClientData(deal,text,{allowAi:true});
    prepareMultiBranchSelection(deal,created);
    if(deal.ownerUserId){const owner=data.users.find((u)=>u.id===deal.ownerUserId&&u.active!==false);if(owner&&!canUserUseWhatsappLine(owner,line)){deal.ownerUserId=null;deal.ownerName="";}}
    applyIncomingRouting(deal,created); applyMarketingOptOut(deal,text); markCampaignReply(phone,deal.lastClientAt||timestamp()); addActivity(data,created?`Nueva negociación creada para ${deal.name} por ${line.name}.`:`${deal.name} espera una respuesta en ${line.name}.`,created?"success":"warning"); recordAuditEvent(null,"mensaje_cliente_recibido",{dealId:deal.id,clientPhone:deal.phone,clientName:deal.name,created,lineId:line.id,lineName:line.name},deal.branchId,"system"); queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&text)void maybeReplyWithBot(deal,text);
  }
  if(messages.length)await store.save();
}

async function sendBotMessage(deal, text, origin = "bot") {
  // Capa de seguridad V22.3: un bot automático o seguimiento jamás puede escribir
  // luego de que un agente tomó la conversación. Campañas/Formularios mantienen su
  // aislamiento y no pasan por esta función.
  if (deal?.botHumanHandoff === true && ["bot", "followup", "branch-selector"].includes(origin)) {
    const error = new Error("La conversación está en modo Copiloto por intervención humana. El bot automático no puede enviar mensajes.");
    error.code = "BOT_HUMAN_HANDOFF";
    throw error;
  }
  if (mockMode) {
    const id = makeId("mockbot");
    recordBotOutgoing(data, { deal, text, messageId: id, origin });
    await store.save();
    return id;
  }
  const id = await sendProviderText(deal, text);
  rememberSeen(id);
  recordBotOutgoing(data, { deal, text, messageId: id, origin });
  recordAuditEvent(null, origin === "followup" ? "seguimiento_bot_enviado" : "mensaje_bot_enviado", { dealId: deal.id, clientPhone: deal.phone, clientName: deal.name }, deal.branchId, "system");
  await store.save();
  return id;
}

async function maybeReplyWithBot(deal, text) {
  if (!data.settings.botEnabled || !deal.botActive || deal.botHumanHandoff === true) return;
  if (await maybeHandleBranchSelection(deal, text)) return;
  if (!data.settings.apiKey) {
    addLog(`Mensaje de ${deal.name}: falta configurar la clave de IA.`, "warning");
    return;
  }
  const line=dealWhatsappLine(deal);
  const presenceSocket=(!mockMode && line?.provider==="qr") ? lineSocket(line.id) : null;
  try {
    addLog(`El bot está preparando una respuesta para ${deal.name}.`);
    await presenceSocket?.sendPresenceUpdate("composing", deal.jid);
    const reply = await createAiReply(deal, text);
    if (reply) await sendBotMessage(deal, reply, "bot");
    await presenceSocket?.sendPresenceUpdate("paused", deal.jid);
    addLog(`Respuesta automática enviada a ${deal.name}.`, "success");
  } catch (error) {
    await presenceSocket?.sendPresenceUpdate("paused", deal.jid).catch(() => {});
    addLog(`No se pudo responder automáticamente a ${deal.name}.`, "warning");
    console.error("[bot]", error?.message || error);
  }
}

async function handleIncomingMessages(event, { history = false, branchId = null, lineId = null } = {}) {
  branchId = branchId || primaryBranchId();
  const incomingLine = whatsappLineById(lineId) || defaultWhatsappLine(branchId);
  lineId = incomingLine?.id || lineId || null;
  const source = history ? "history" : event.type;
  if (!["notify", "append", "history"].includes(source)) return;
  const botQueue = new Map();
  let imported = 0;
  const messages = (event.messages || [])
    .slice()
    .sort((a, b) => messageTime(a.messageTimestamp) - messageTime(b.messageTimestamp));
  for (const item of messages) {
    const rawJid = item.key?.remoteJid || "";
    const jid = await canonicalClientJidFromMessage(item, branchId);
    const alternateJids = [item.key?.remoteJid, item.key?.remoteJidAlt, item.key?.participant, item.key?.participantAlt].filter(Boolean);
    if (jid && jid !== rawJid && isPhoneNumberJid(jid)) repairStoredIdentity(alternateJids, jid);
    const messageId = item.key?.id || "";
    // Comunicación interna entre instalaciones independientes. Primero se interpreta el mensaje,
    // incluso si WhatsApp entrega un JID tipo LID. Así nunca se genera una negociación con el
    // número de otra sucursal: la negociación se crea para el CLIENTE indicado dentro del paquete.
    const internalText = extractText(item.message);
    const ackId = decodeTransferAck(internalText);
    const packet = decodeTransferPacket(internalText);
    const sourceBranch = branchFromMessageKey(item, packet);
    const isBranchChannel = Boolean(sourceBranch || isInternalBranchJid(rawJid) || isInternalBranchJid(jid) || packet || ackId);
    if (isBranchChannel) {
      if (isKnownMessage(messageId)) continue;
      rememberSeen(messageId);
      // Los mensajes que esta misma instalación envía a otra sucursal jamás deben generar casos locales.
      if (item.key?.fromMe) continue;
      if (ackId && sourceBranch) {
        processIncomingTransferAck(ackId, jid, sourceBranch);
        await store.save();
      } else if (packet && sourceBranch) {
        await processIncomingBranchTransfer(packet, jid, messageId, messageTime(item.messageTimestamp), sourceBranch);
        await store.save();
      } else if (sourceBranch) {
        addActivity(data, `Mensaje interno recibido desde ${sourceBranch.name}; no se generó una negociación porque no contenía datos de transferencia.`, "neutral");
        await store.save();
      } else if (packet || ackId) {
        addActivity(data, "Se recibió un paquete de transferencia desde un número que no está registrado como sucursal. Fue ignorado por seguridad.", "warning");
        await store.save();
      }
      continue;
    }
    if (
      !isDirectChat(jid) ||
      !shouldImportMessage(item, source) ||
      isKnownMessage(messageId)
    ) {
      continue;
    }
    rememberSeen(messageId);
    const info = mediaInfo(item.message);
    const text = extractText(item.message) || messageLabel(info);
    if (!text && !info) continue;
    const attachment = info ? await downloadIncomingAttachment(item, info) : null;
    const occurredAt = messageTime(item.messageTimestamp);
    const historical = source !== "notify" || Date.now() - occurredAt >= 3 * 60 * 1000;

    if (item.key?.fromMe) {
      if (data.botMessageIds.includes(messageId)) continue;
      const deal = recordHumanOutgoing(data, {
        jid,
        name: item.pushName,
        text,
        messageId,
        attachment,
        branchId,
        lineId,
        now: occurredAt,
      });
      addActivity(
        data,
        `${deal.name} pasó a Contactado y el bot salió de la conversación y quedó activo solo el Copiloto.`,
        "success",
      );
      if (!historical) recordAuditEvent(null, "mensaje_agente_desde_whatsapp", { dealId: deal.id, clientPhone: deal.phone, clientName: deal.name }, deal.branchId, "system");
      if (historical) imported += 1;
      continue;
    }

    const phone = isPhoneNumberJid(jid) ? normalizePhone(jidUser(jid)) : "";
    const localClient = phone ? (findClientIdentity(data, { phone })?.client || null) : null;
    const sharedProfile = phone && (!localClient || !localClient.name || localClient.name === localClient.phone) ? centralClientProfileByPhone(phone) : null;
    const resolvedName = cleanText(localClient?.name, 120) || cleanText(sharedProfile?.name, 120) || item.pushName;
    if (!historical) {
      const isolated = await tryConsumeIsolatedCommunication({ phone, text, lineId, branchId, messageId });
      if (isolated.consumed) { await store.save(); continue; }
    }
    const { deal, created } = recordIncoming(data, {
      jid,
      name: resolvedName,
      text,
      messageId,
      attachment,
      historical,
      branchId,
      lineId,
      now: occurredAt,
    });
    refreshDealCommercialStatus(deal,true);
    if (!historical && text) captureIncomingClientData(deal,text,{allowAi:true});
    prepareMultiBranchSelection(deal, created);
    if (deal.ownerUserId && incomingLine) {
      const inheritedOwner=data.users.find((entry)=>entry.id===deal.ownerUserId&&entry.active!==false);
      if(inheritedOwner&&!canUserUseWhatsappLine(inheritedOwner,incomingLine)){ deal.ownerUserId=null; deal.ownerName=""; }
    }
    if (!historical) {
      applyIncomingRouting(deal, created);
      applyMarketingOptOut(deal, text);
      markCampaignReply(phone, deal.lastClientAt || timestamp(occurredAt));
    }
    addActivity(
      data,
      created
        ? `Nueva negociación creada para ${deal.name}.`
        : `${deal.name} espera una respuesta.`,
      created ? "success" : "warning",
    );
    if (!historical) { recordAuditEvent(null, "mensaje_cliente_recibido", { dealId: deal.id, clientPhone: deal.phone, clientName: deal.name, created, lineId, lineName: incomingLine?.name || "" }, deal.branchId, "system"); queueIncomingSuperAutomation({ deal, text, line: incomingLine, created, message: { text, id: messageId } }); }
    if (historical) imported += 1;
    if(!incomingLine || incomingLine.botEnabled!==false) botQueue.set(deal.id, { deal, text, occurredAt });
  }
  if (imported > 0) {
    data.sync.lastImportAt = timestamp();
    data.sync.lastImportCount = imported;
    data.sync.totalImported = Number(data.sync.totalImported || 0) + imported;
    addActivity(
      data,
      `${imported} mensaje${imported === 1 ? " pendiente recuperado" : "s pendientes recuperados"}.`,
      "success",
    );
  }
  if (history) data.sync.lastHistorySyncAt = timestamp();
  if (messages.length) await store.save();
  for (const { deal, text, occurredAt } of botQueue.values()) {
    if (deal.lastDirection !== "incoming") continue;
    const recentBacklog = Date.now() - occurredAt <= 24 * 60 * 60 * 1000;
    if (source === "notify" || (source === "append" && recentBacklog)) {
      void maybeReplyWithBot(deal, text);
    }
  }
}

async function resolveWhatsAppCallContact(input, branchId) {
  const candidatePn = normalizePhone(input?.callerPn || "");
  let phone = /^\d{10,15}$/.test(candidatePn) ? candidatePn : "";
  let jid = "";
  const rawJids = [input?.chatId, input?.from].filter(Boolean);
  if (!phone) {
    for (const raw of rawJids) {
      const pnJid = normalizePhoneJid(raw);
      if (pnJid) { phone = normalizePhone(jidUser(pnJid)); jid = pnJid; break; }
    }
  }
  if (!phone) {
    for (const raw of rawJids) {
      if (!isLidJid(raw)) continue;
      const mapped = await pnJidForLid(raw, branchId);
      if (mapped) { phone = normalizePhone(jidUser(mapped)); jid = mapped; break; }
    }
  }
  if (phone && !jid) jid = `${phone}@s.whatsapp.net`;
  if (!jid) jid = String(input?.chatId || input?.from || "");
  let client = phone ? findLocalClientByPhone(phone) : null;
  let deal = phone ? findLocalOpenDealByPhone(phone, branchId) : (jid ? findOpenDeal(data, jid, branchId) : null);
  let sharedProfile = null;
  if (!client && phone && sharedDriveConfig().enabled === true) {
    sharedProfile = centralClientProfileByPhone(phone);
  }
  if (!deal && input?.status === "offer" && phone) {
    const name = cleanText(sharedProfile?.name, 120) || client?.name || `Cliente +${phone}`;
    deal = createDeal(data, { jid, name, branchId, source: "whatsapp-call" });
    deal.botActive = false;
    deal.lastMessage = "Llamada entrante por WhatsApp";
    deal.updatedAt = timestamp();
    client = findClient(data, deal.clientId) || client;
  }
  if (!client && deal?.clientId) client = findClient(data, deal.clientId);
  if (client && sharedProfile?.found && (!client.name || client.name === client.phone)) {
    client.name = cleanText(sharedProfile.name, 120) || client.name;
    client.updatedAt = timestamp();
    if (deal) deal.name = client.name || deal.name;
  }
  let owner = deal?.ownerUserId ? data.users.find((entry) => entry.id === deal.ownerUserId && entry.active !== false) : null;
  if (!owner && client) {
    const prior = client.branchOwners?.[branchId]?.userId || client.ownerUserId;
    owner = prior ? data.users.find((entry) => entry.id === prior && entry.active !== false && (!entry.branchId || entry.branchId === branchId)) : null;
  }
  if (!owner && data.settings.whatsappCalls?.autoAssignUnowned !== false && deal) {
    owner = chooseIncomingTransferOwner(client, branchId);
    if (owner) applyOwnerToClientAndDeal(client, deal, owner, branchId);
  }
  return { phone, jid, client, deal, owner };
}

async function handleCalls(calls, branchId = null) {
  branchId = branchId || primaryBranchId();
  let changed = false;
  for (const input of calls || []) {
    if (input.isGroup) continue;
    const resolved = await resolveWhatsAppCallContact(input, branchId);
    const rawJid = resolved.jid || input.chatId || input.from || "";
    if (!rawJid) continue;
    const call = recordCall(data, { ...input, jid: rawJid, phone: resolved.phone || undefined, name: resolved.client?.name || resolved.deal?.name || undefined, clientId: resolved.client?.id || undefined, dealId: resolved.deal?.id || undefined, ownerUserId: resolved.owner?.id || undefined, ownerName: resolved.owner?.name || undefined, direction: "incoming", provider: "whatsapp", branchId }, input.date || Date.now());
    changed = true;
    if (input.status === "offer") {
      addActivity(data, `${call.isVideo ? "Videollamada" : "Llamada"} de WhatsApp de ${call.name || call.phone}${call.ownerName ? ` · responsable: ${call.ownerName}` : ""}.`, "warning");
      recordAuditEvent(null, "llamada_whatsapp_entrante", { callId: call.id, dealId: call.dealId, clientId: call.clientId, clientPhone: call.phone, clientName: call.name, ownerUserId: call.ownerUserId, ownerName: call.ownerName }, call.branchId, "system");
    } else if (input.status === "timeout") {
      addActivity(data, `Llamada perdida de WhatsApp de ${call.name || call.phone}${call.ownerName ? ` · responsable: ${call.ownerName}` : ""}.`, "warning");
      recordAuditEvent(null, "llamada_whatsapp_perdida", { callId: call.id, dealId: call.dealId, clientPhone: call.phone, ownerUserId: call.ownerUserId }, call.branchId, "system");
    } else if (["accept", "terminate", "reject"].includes(input.status)) {
      recordAuditEvent(null, `llamada_whatsapp_${input.status}`, { callId: call.id, dealId: call.dealId, clientPhone: call.phone, ownerUserId: call.ownerUserId }, call.branchId, "system");
    }
  }
  if (changed) await store.save();
}

async function startMockConnection() {
  connectionStatus = "starting";
  lastError = null;
  qrDataUrl = await QRCode.toDataURL(`whatsbot-crm-mock-${Date.now()}`, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#10261eff", light: "#ffffffff" },
  });
  connectionStatus = "qr";
  addLog("Código QR de prueba generado.", "success");
}

async function startConnection() {
  if (mockMode) return startMockConnection();
  if (["starting", "qr", "connected"].includes(connectionStatus)) return;
  if (startingPromise) return startingPromise;

  startingPromise = (async () => {
    connectionStatus = "starting";
    qrDataUrl = null;
    lastError = null;
    manualLogout = false;
    syncCutoffAt = Date.parse(data.sync?.lastActiveAt) || Date.now() - firstConnectionHistoryMs;
    historySyncing = false;
    clearTimeout(reconnectTimer);
    addLog("Solicitando vinculación a WhatsApp…");

    try {
      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default;
      const {
        Browsers,
        DisconnectReason,
        downloadMediaMessage: baileysDownloadMediaMessage,
        fetchLatestBaileysVersion,
        useMultiFileAuthState,
      } = baileys;
      downloadMediaMessage = baileysDownloadMediaMessage;
      await mkdir(authDirectory, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
      const { version } = await fetchLatestBaileysVersion();

      whatsappSocket = makeWASocket({
        auth: state,
        version,
        browser: Browsers.windows("WhatsBot CRM"),
        logger: whatsappLogger,
        markOnlineOnConnect: false,
        syncFullHistory: true,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
      });

      whatsappSocket.ev.on("creds.update", saveCreds);
      whatsappSocket.ev.on("messages.upsert", (event) => {
        void handleIncomingMessages(event, { branchId: primaryBranchId() });
      });
      whatsappSocket.ev.on("messaging-history.set", (event) => {
        historySyncing = true;
        void handleIncomingMessages({ ...event, type: "history" }, { history: true, branchId: primaryBranchId() })
          .finally(() => { historySyncing = false; });
      });
      whatsappSocket.ev.on("call", (calls) => {
        void handleCalls(calls, primaryBranchId());
      });
      whatsappSocket.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
          qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 360,
            color: { dark: "#10261eff", light: "#ffffffff" },
          });
          connectionStatus = "qr";
          lastError = null;
          addLog("Código QR listo para escanear.", "success");
        }
        if (connection === "open") {
          connectionStatus = "connected";
          historySyncing = true;
          qrDataUrl = null;
          connectedAccount = formatAccount(whatsappSocket?.user?.id);
          const linkedPrimary = primaryBranch();
          if (linkedPrimary && normalizePhone(connectedAccount) && normalizePhone(linkedPrimary.phone) !== normalizePhone(connectedAccount)) { linkedPrimary.phone = connectedAccount; linkedPrimary.updatedAt = timestamp(); }
          lastError = null;
          addLog("WhatsApp conectado; recuperando mensajes pendientes.", "success");
          setTimeout(() => { historySyncing = false; }, 12_000).unref();
        }
        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode ||
            lastDisconnect?.error?.data?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          whatsappSocket = null;
          qrDataUrl = null;
          connectedAccount = null;
          historySyncing = false;
          data.sync.lastActiveAt = timestamp();
          void store.save();
          queueSuperAutomationEvent({type:"whatsapp_disconnected",line:defaultWhatsappLine(primaryBranchId()),branch:primaryBranch(),text:loggedOut?"Cuenta desvinculada":"Conexión interrumpida"},{depth:0});
          if (manualLogout || loggedOut) {
            connectionStatus = "disconnected";
            addLog("La cuenta fue desvinculada.");
            return;
          }
          connectionStatus = "starting";
          addLog("La conexión se interrumpió; reintentando…", "warning");
          reconnectTimer = setTimeout(() => {
            connectionStatus = "disconnected";
            void startConnection();
          }, 2500);
        }
      });
    } catch (error) {
      connectionStatus = "error";
      qrDataUrl = null;
      whatsappSocket = null;
      lastError = "No se pudo iniciar la vinculación. Volvé a intentarlo.";
      addLog(lastError, "warning");
      console.error("[whatsapp]", error?.message || error);
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
}

async function disconnect() {
  manualLogout = true;
  clearTimeout(reconnectTimer);
  try {
    if (whatsappSocket) await whatsappSocket.logout();
  } catch {
    // Remove the local credentials even when WhatsApp is unavailable.
  }
  whatsappSocket = null;
  await rm(authDirectory, { recursive: true, force: true });
  connectionStatus = "disconnected";
  qrDataUrl = null;
  connectedAccount = null;
  lastError = null;
  historySyncing = false;
  data.sync.lastActiveAt = timestamp();
  addLog("Sesión de WhatsApp eliminada.");
}

async function startExtraBranchConnection(branchId) {
  const branch = getBranch(branchId);
  if (!branch || branch.active === false) throw new Error("Sucursal no encontrada o inactiva.");
  if (branchId === primaryBranchId()) return startConnection();
  const runtime = extraBranchRuntime(branchId);
  if (mockMode) {
    runtime.status = "qr";
    runtime.error = null;
    runtime.qr = await QRCode.toDataURL(`whatsbot-branch-${branchId}-${Date.now()}`, { errorCorrectionLevel: "M", margin: 1, width: 360 });
    return;
  }
  if (["starting", "qr", "connected"].includes(runtime.status)) return;
  if (runtime.startingPromise) return runtime.startingPromise;
  runtime.startingPromise = (async () => {
    runtime.status = "starting"; runtime.qr = null; runtime.error = null; runtime.manualLogout = false; runtime.syncing = false;
    clearTimeout(runtime.reconnectTimer);
    try {
      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default;
      const { Browsers, DisconnectReason, downloadMediaMessage: baileysDownloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;
      downloadMediaMessage = baileysDownloadMediaMessage;
      const authPath = path.join(branchAuthRoot, branchId);
      await mkdir(authPath, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      const { version } = await fetchLatestBaileysVersion();
      runtime.socket = makeWASocket({ auth: state, version, browser: Browsers.windows(`WhatsBot CRM - ${branch.name}`), logger: whatsappLogger, markOnlineOnConnect: false, syncFullHistory: true, generateHighQualityLinkPreview: false, getMessage: async () => undefined });
      runtime.socket.ev.on("creds.update", saveCreds);
      runtime.socket.ev.on("messages.upsert", (event) => { void handleIncomingMessages(event, { branchId }); });
      runtime.socket.ev.on("messaging-history.set", (event) => { runtime.syncing = true; void handleIncomingMessages({ ...event, type: "history" }, { history: true, branchId }).finally(() => { runtime.syncing = false; }); });
      runtime.socket.ev.on("call", (calls) => { void handleCalls(calls, branchId); });
      runtime.socket.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
          runtime.qr = await QRCode.toDataURL(qr, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#10261eff", light: "#ffffffff" } });
          runtime.status = "qr"; runtime.error = null;
          addLog(`QR listo para ${branch.name}.`, "success");
        }
        if (connection === "open") {
          runtime.status = "connected"; runtime.qr = null; runtime.account = formatAccount(runtime.socket?.user?.id); runtime.error = null; runtime.syncing = true;
          if (normalizePhone(runtime.account) && normalizePhone(branch.phone) !== normalizePhone(runtime.account)) { branch.phone = runtime.account; branch.updatedAt = timestamp(); await store.save(); }
          addLog(`${branch.name}: WhatsApp conectado.`, "success");
          setTimeout(() => { runtime.syncing = false; }, 12000).unref();
        }
        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || lastDisconnect?.error?.data?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          runtime.socket = null; runtime.qr = null; runtime.account = null; runtime.syncing = false;
          if (runtime.manualLogout || loggedOut) { runtime.status = "disconnected"; addLog(`${branch.name}: cuenta desvinculada.`); return; }
          runtime.status = "starting"; runtime.error = "Conexión interrumpida; reintentando.";
          runtime.reconnectTimer = setTimeout(() => { runtime.status = "disconnected"; void startExtraBranchConnection(branchId); }, 2500);
        }
      });
    } catch (error) {
      runtime.status = "error"; runtime.qr = null; runtime.socket = null; runtime.error = cleanText(error?.message || "No se pudo conectar WhatsApp.", 240);
      addLog(`${branch.name}: no se pudo iniciar WhatsApp.`, "warning");
      console.error(`[whatsapp ${branch.name}]`, error?.message || error);
    } finally { runtime.startingPromise = null; }
  })();
  return runtime.startingPromise;
}

async function startBranchConnection(branchId) {
  return branchId === primaryBranchId() ? startConnection() : startExtraBranchConnection(branchId);
}

async function disconnectBranchConnection(branchId) {
  if (branchId === primaryBranchId()) return disconnect();
  const runtime = extraBranchRuntime(branchId);
  runtime.manualLogout = true; clearTimeout(runtime.reconnectTimer);
  try { if (runtime.socket) await runtime.socket.logout(); } catch {}
  runtime.socket = null; runtime.status = "disconnected"; runtime.qr = null; runtime.account = null; runtime.error = null; runtime.syncing = false;
  await rm(path.join(branchAuthRoot, branchId), { recursive: true, force: true });
  addLog(`${getBranch(branchId)?.name || "Sucursal"}: sesión de WhatsApp eliminada.`);
}

async function startWhatsappLineConnection(lineId) {
  const line=whatsappLineById(lineId); if(!line||line.active===false)throw new Error("Línea no encontrada o inactiva.");
  if(line.legacyBranchSession) return startBranchConnection(line.branchId);
  if(line.provider==="cloud"){if(!lineCloudConfigured(line))throw new Error("Completá las credenciales de Cloud API para esta línea.");return;}
  const runtime=extraLineRuntime(line.id); const branch=getBranch(line.branchId);
  if(mockMode){runtime.status="qr";runtime.error=null;runtime.qr=await QRCode.toDataURL(`whatsbot-line-${line.id}-${Date.now()}`,{errorCorrectionLevel:"M",margin:1,width:360});return;}
  if(["starting","qr","connected"].includes(runtime.status))return; if(runtime.startingPromise)return runtime.startingPromise;
  runtime.startingPromise=(async()=>{runtime.status="starting";runtime.qr=null;runtime.error=null;runtime.manualLogout=false;runtime.syncing=false;clearTimeout(runtime.reconnectTimer);
    try{
      const baileys=await import("@whiskeysockets/baileys"); const makeWASocket=baileys.default; const {Browsers,DisconnectReason,downloadMediaMessage:baileysDownloadMediaMessage,fetchLatestBaileysVersion,useMultiFileAuthState}=baileys; downloadMediaMessage=baileysDownloadMediaMessage;
      const authPath=path.join(lineAuthRoot,line.id);await mkdir(authPath,{recursive:true});const {state,saveCreds}=await useMultiFileAuthState(authPath);const {version}=await fetchLatestBaileysVersion();
      runtime.socket=makeWASocket({auth:state,version,browser:Browsers.windows(`WhatsBot CRM - ${line.name}`),logger:whatsappLogger,markOnlineOnConnect:false,syncFullHistory:true,generateHighQualityLinkPreview:false,getMessage:async()=>undefined});
      runtime.socket.ev.on("creds.update",saveCreds);
      runtime.socket.ev.on("messages.upsert",(event)=>{void handleIncomingMessages(event,{branchId:line.branchId,lineId:line.id});});
      runtime.socket.ev.on("messaging-history.set",(event)=>{runtime.syncing=true;void handleIncomingMessages({...event,type:"history"},{history:true,branchId:line.branchId,lineId:line.id}).finally(()=>{runtime.syncing=false;});});
      runtime.socket.ev.on("call",(calls)=>{void handleCalls(calls,line.branchId,line.id);});
      runtime.socket.ev.on("connection.update",async(update)=>{const {connection,qr,lastDisconnect}=update;
        if(qr){runtime.qr=await QRCode.toDataURL(qr,{errorCorrectionLevel:"M",margin:1,width:360,color:{dark:"#10261eff",light:"#ffffffff"}});runtime.status="qr";runtime.error=null;addLog(`QR listo para ${line.name} · ${branch?.name||"Sucursal"}.`,"success");}
        if(connection==="open"){runtime.status="connected";runtime.qr=null;runtime.account=formatAccount(runtime.socket?.user?.id);runtime.error=null;runtime.syncing=true;runtime.lastConnectedAt=timestamp();if(normalizePhone(runtime.account)){line.phone=runtime.account;line.updatedAt=timestamp();await store.save();}addLog(`${line.name} · ${branch?.name||"Sucursal"}: WhatsApp conectado.`,"success");setTimeout(()=>{runtime.syncing=false;},12000).unref();}
        if(connection==="close"){const statusCode=lastDisconnect?.error?.output?.statusCode||lastDisconnect?.error?.statusCode||lastDisconnect?.error?.data?.statusCode;const loggedOut=statusCode===DisconnectReason.loggedOut;runtime.socket=null;runtime.qr=null;runtime.account=null;runtime.syncing=false;queueSuperAutomationEvent({type:"whatsapp_disconnected",line,branch:getBranch(line.branchId)||primaryBranch(),text:loggedOut?"Cuenta desvinculada":"Conexión interrumpida"},{depth:0});if(runtime.manualLogout||loggedOut){runtime.status="disconnected";addLog(`${line.name}: cuenta desvinculada.`);return;}runtime.status="starting";runtime.error="Conexión interrumpida; reintentando.";runtime.reconnectTimer=setTimeout(()=>{runtime.status="disconnected";void startWhatsappLineConnection(line.id);},2500);}
      });
    }catch(error){runtime.status="error";runtime.qr=null;runtime.socket=null;runtime.error=cleanText(error?.message||"No se pudo conectar WhatsApp.",240);addLog(`${line.name}: no se pudo iniciar WhatsApp.`,"warning");console.error(`[whatsapp line ${line.name}]`,error?.message||error);}finally{runtime.startingPromise=null;}
  })(); return runtime.startingPromise;
}

async function disconnectWhatsappLineConnection(lineId) {
  const line=whatsappLineById(lineId); if(!line)throw new Error("Línea no encontrada.");
  if(line.legacyBranchSession)return disconnectBranchConnection(line.branchId);
  if(line.provider==="cloud")throw new Error("La línea Cloud API se desconecta quitando o cambiando sus credenciales.");
  const runtime=extraLineRuntime(line.id);runtime.manualLogout=true;clearTimeout(runtime.reconnectTimer);try{if(runtime.socket)await runtime.socket.logout();}catch{}runtime.socket=null;runtime.status="disconnected";runtime.qr=null;runtime.account=null;runtime.error=null;runtime.syncing=false;await rm(path.join(lineAuthRoot,line.id),{recursive:true,force:true});addLog(`${line.name}: sesión de WhatsApp eliminada.`);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function currentSession(request) {
  const token = cookieValue(request, "whatsbot_session");
  const session = sessions.get(token);
  if (!token || !session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  const user = data.users.find((entry) => entry.id === session.userId && entry.active !== false);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  session.lastSeenAt = Date.now();
  return { token, session, user };
}

function currentUser(request) {
  return currentSession(request)?.user || null;
}

function isAuthenticated(request) {
  return Boolean(currentSession(request));
}

function requireAdmin(request, response, next) {
  const user = currentUser(request);
  if (!user || user.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede realizar esta acción." });
  request.currentUser = user;
  return next();
}

function requireManagerOrAdmin(request, response, next) {
  const user = currentUser(request);
  if (!user || !["admin", "manager", "supervisor"].includes(user.role)) return response.status(403).json({ error: "Esta acción requiere permisos de jefatura, gerencia o administración." });
  request.currentUser = user;
  return next();
}

function paraguayDateKey(value = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = `595${digits.slice(1)}`;
  if (!digits.startsWith("595") && digits.length <= 10) digits = `595${digits}`;
  return digits;
}



function telephonyConfig() {
  return data.settings.telephony || {};
}

function publicTelephonyConfig({ includePassword = false } = {}) {
  const config = telephonyConfig();
  return {
    enabled: config.enabled === true,
    mode: "webrtc",
    sipHost: cleanText(config.sipHost, 180),
    sipPort: Number(config.sipPort || 7560),
    sipDomain: cleanText(config.sipDomain || config.sipHost, 180),
    extension: cleanText(config.extension, 80),
    authorizationUser: cleanText(config.authorizationUser || config.extension, 80),
    websocketUrl: cleanText(config.websocketUrl, 300),
    displayName: cleanText(config.displayName || "WhatsBot CRM", 120),
    maxConcurrentCalls: Math.min(50, Math.max(1, Number(config.maxConcurrentCalls) || 5)),
    fallbackSeconds: Math.min(120, Math.max(5, Number(config.fallbackSeconds) || 20)),
    autoAssignUnowned: config.autoAssignUnowned !== false,
    externalSoftphoneFallback: false,
    hasPassword: Boolean(config.password),
    ...(includePassword ? { password: String(config.password || "") } : {}),
  };
}

function userIsOnline(userId) {
  if (!userId) return false;
  const now = Date.now();
  return [...sessions.values()].some((session) => session.userId === userId && session.expiresAt > now && now - (session.lastSeenAt || 0) < 25000);
}

function findLocalClientByPhone(phone) {
  const target = normalizePhone(phone);
  return target ? (findClientIdentity(data, { phone: target })?.client || null) : null;
}

function findLocalOpenDealByPhone(phone, branchId = primaryBranchId()) {
  const target = normalizePhone(phone);
  if (!target) return null;
  return (data.deals || [])
    .filter((deal) => OPEN_STAGES.has(deal.stage) && (!branchId || deal.branchId === branchId) && normalizePhone(deal.phone) === target)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null;
}

function applyOwnerToClientAndDeal(client, deal, owner, branchId) {
  if (!owner || !deal) return;
  deal.ownerUserId = owner.id;
  deal.ownerName = owner.name;
  deal.updatedAt = timestamp();
  if (client) {
    client.ownerUserId = owner.id;
    client.ownerName = owner.name;
    client.branchOwners = client.branchOwners && typeof client.branchOwners === "object" ? client.branchOwners : {};
    client.branchOwners[branchId] = { userId: owner.id, userName: owner.name, updatedAt: timestamp() };
    client.updatedAt = timestamp();
  }
}

async function resolvePbxContact(phone, { createIfMissing = true, preferredOwner = null } = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 10 || normalized.length > 15) throw new Error("Número telefónico inválido.");
  const branchId = primaryBranchId();
  let client = findLocalClientByPhone(normalized);
  let sharedProfile = null;
  if (!client && sharedDriveConfig().enabled === true) {
    sharedProfile = centralClientProfileByPhone(normalized);
  }
  let deal = findLocalOpenDealByPhone(normalized, branchId);
  if (!deal && createIfMissing) {
    const name = cleanText(sharedProfile?.name, 120) || client?.name || `Cliente +${normalized}`;
    deal = createDeal(data, { jid: `${normalized}@s.whatsapp.net`, name, branchId, source: "pbx" });
    deal.botActive = false;
    deal.lastMessage = "Contacto por llamada PBX";
    deal.updatedAt = timestamp();
    client = findClient(data, deal.clientId) || client;
    if (client && sharedProfile?.found) {
      if (sharedProfile.name) client.name = cleanText(sharedProfile.name, 120);
      if (sharedProfile.document && !client.document) client.document = cleanText(sharedProfile.document, 80);
      if (sharedProfile.email && !client.email) client.email = cleanText(sharedProfile.email, 160);
      if (sharedProfile.company && !client.company) client.company = cleanText(sharedProfile.company, 160);
      if (sharedProfile.city && !client.city) client.city = cleanText(sharedProfile.city, 120);
      client.updatedAt = timestamp();
      deal.name = client.name || deal.name;
    }
  }
  if (!client && deal?.clientId) client = findClient(data, deal.clientId);
  let owner = deal?.ownerUserId ? data.users.find((entry) => entry.id === deal.ownerUserId && entry.active !== false) : null;
  if (!owner && client) {
    const prior = client.branchOwners?.[branchId]?.userId || client.ownerUserId;
    owner = prior ? data.users.find((entry) => entry.id === prior && entry.active !== false && (!entry.branchId || entry.branchId === branchId)) : null;
  }
  if (!owner && telephonyConfig().autoAssignUnowned !== false && deal) {
    const preferred = preferredOwner && preferredOwner.active !== false && (!preferredOwner.branchId || preferredOwner.branchId === branchId) ? preferredOwner : null;
    owner = preferred || chooseIncomingTransferOwner(client, branchId);
    if (owner) applyOwnerToClientAndDeal(client, deal, owner, branchId);
  }
  return { phone: normalized, client, deal, owner, branchId, sharedProfile };
}

function pbxCallPublic(call, user) {
  if (!call) return null;
  const ownerOnline = userIsOnline(call.ownerUserId);
  const sameBranch = !user?.branchId || !call.branchId || user.branchId === call.branchId || user.role === "admin";
  const isOwner = Boolean(user && call.ownerUserId === user.id);
  const unowned = !call.ownerUserId;
  const canTakeUnowned = Boolean(user && sameBranch && ["agent", "manager", "admin"].includes(user.role));
  return {
    ...call,
    ownerOnline,
    isOwner,
    canAnswerNow: sameBranch && (isOwner || (unowned && canTakeUnowned)),
    fallbackSeconds: Number(telephonyConfig().fallbackSeconds || 20),
  };
}

function sharedDriveConfig() {
  return data.settings.sharedDrive || {};
}

function sharedDriveRoot() {
  const raw = cleanText(sharedDriveConfig().folderPath, 500);
  return raw ? path.resolve(raw) : "";
}

function sharedBranchCode(value = "") {
  return cleanText(value, 60).toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "SUCURSAL";
}

function localSharedBranch() {
  const branch = primaryBranch();
  return branch ? { ...branch, code: sharedBranchCode(branch.code || branch.name) } : null;
}

function sharedDrivePublicStatus(user = null) {
  const config = sharedDriveConfig();
  return {
    enabled: config.enabled === true,
    configured: Boolean(config.folderPath),
    folderPath: user?.role === "admin" ? cleanText(config.folderPath, 500) : "",
    syncIntervalSeconds: Number(config.syncIntervalSeconds || 15),
    status: sharedDriveRuntime.status,
    lastSyncAt: sharedDriveRuntime.lastSyncAt,
    lastReadAt: sharedDriveRuntime.lastReadAt,
    lastError: sharedDriveRuntime.lastError,
    branches: sharedDriveRuntime.branches,
    clients: sharedDriveRuntime.clients,
    deals: sharedDriveRuntime.deals,
    canViewGlobalReports: canViewGlobalReports(user),
  };
}

function sharedSnapshotClient(client) {
  return {
    id: client.id,
    phone: normalizePhone(client.phone),
    name: cleanText(client.name, 120),
    document: cleanText(client.document, 80),
    email: cleanText(client.email, 160),
    company: cleanText(client.company, 160),
    city: cleanText(client.city, 120),
    address: cleanText(client.address, 240),
    notes: cleanText(client.notes, 3000),
    tags: Array.isArray(client.tags) ? client.tags.slice(0, 20) : [],
    ownerUserId: client.ownerUserId || null,
    ownerName: cleanText(client.ownerName, 120),
    createdAt: client.createdAt || null,
    updatedAt: client.updatedAt || null,
  };
}

function sharedSnapshotDeal(deal) {
  return {
    id: deal.id,
    clientId: deal.clientId || null,
    phone: normalizePhone(deal.phone),
    name: cleanText(deal.name, 120),
    ownerUserId: deal.ownerUserId || null,
    ownerName: cleanText(deal.ownerName, 120),
    source: cleanText(deal.source, 60),
    stage: deal.stage,
    createdAt: deal.createdAt || null,
    updatedAt: deal.updatedAt || null,
    lastClientAt: deal.lastClientAt || null,
    lastAgentAt: deal.lastAgentAt || null,
    waitingSince: deal.waitingSince || null,
    lastMessage: cleanText(deal.lastMessage, 500),
    lastDirection: deal.lastDirection || null,
    outcomeAt: deal.outcomeAt || null,
    lossReasonName: cleanText(deal.lossReasonName, 160),
    transferredAt: deal.transferredAt || null,
    transferredByName: cleanText(deal.transferredByName, 120),
    items: (deal.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: cleanText(item.sku, 80),
      name: cleanText(item.name, 160),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      status: item.status,
      source: cleanText(item.source, 60),
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    })),
    messages: (deal.messages || []).map((message) => ({
      id: message.id,
      direction: message.direction,
      origin: message.origin,
      text: cleanText(message.text, 1500),
      at: message.at || null,
      historical: Boolean(message.historical),
      agentUserId: message.agentUserId || null,
      agentName: cleanText(message.agentName, 120),
      attachment: message.attachment ? { kind: message.attachment.kind, fileName: cleanText(message.attachment.fileName, 180), mimeType: cleanText(message.attachment.mimeType, 160) } : null,
    })),
  };
}

function buildLocalSharedSnapshot() {
  const branch = localSharedBranch();
  if (!branch) throw new Error("Configurá la sucursal local antes de sincronizar.");
  const branchId = branch.id;
  const deals = (data.deals || []).filter((deal) => (deal.branchId || primaryBranchId()) === branchId);
  const clientIds = new Set(deals.map((deal) => deal.clientId).filter(Boolean));
  const users = (data.users || []).filter((user) => user.active !== false && (user.branchId === branchId || (user.role === "admin" && !user.branchId))).map((user) => ({
    id: user.id,
    username: cleanText(user.username, 80),
    name: cleanText(user.name, 120),
    role: user.role,
    active: user.active !== false,
    permissions: { globalReports: user.role === "admin" || user.permissions?.globalReports === true },
  }));
  return {
    schema: 1,
    product: "WhatsBot CRM",
    version: 11,
    installationId: sharedDriveConfig().installationId,
    generatedAt: timestamp(),
    branch: {
      id: branch.id,
      code: branch.code,
      name: cleanText(branch.name, 120),
      city: cleanText(branch.city, 120),
      address: cleanText(branch.address, 240),
      phone: normalizePhone(branch.phone),
    },
    users,
    clients: (data.clients || []).filter((client) => clientIds.has(client.id)).map(sharedSnapshotClient),
    deals: deals.map(sharedSnapshotDeal),
    products: (data.products || []).map((product) => ({
      id: product.id,
      sku: cleanText(product.sku, 80),
      name: cleanText(product.name, 160),
      description: cleanText(product.description, 500),
      available: Number(product.available || 0),
      reserved: Number(product.reserved || 0),
      minStock: Number(product.minStock || 0),
      price: Number(product.price || 0),
      active: product.active !== false,
      updatedAt: product.updatedAt || null,
    })),
    stockMovements: (data.stockMovements || []).slice(0, 1500).map((movement) => ({ ...movement })),
    calls: (data.calls || []).filter((call) => (call.branchId || branchId) === branchId).slice(0, 1000).map((call) => ({ ...call })),
    transfers: (data.transfers || []).filter((entry) => entry.sourceBranchId === branchId || entry.targetBranchId === branchId).slice(0, 1000).map((entry) => ({ ...entry })),
    auditEvents: (data.auditEvents || []).slice(0, 2000).map((entry) => ({ ...entry })),
  };
}

async function writeJsonAtomic(filePath, object) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, JSON.stringify(object, null, 2), "utf8");
  await rename(temp, filePath);
}

async function ensureSharedDriveRoot(root = sharedDriveRoot()) {
  if (!root) throw new Error("Indicá la carpeta compartida de Google Drive.");
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "snapshots"), { recursive: true });
  await mkdir(path.join(root, "audit"), { recursive: true });
  const hubPath = path.join(root, "WHATSBot-CRM-HUB.json");
  try {
    await access(hubPath);
  } catch {
    await writeJsonAtomic(hubPath, { product: "WhatsBot CRM", schema: 1, createdAt: timestamp(), description: "Carpeta compartida de sincronización multi-sucursal. No contiene contraseñas ni tokens." });
  }
  return root;
}

async function readSharedSnapshots({ force = false } = {}) {
  const config = sharedDriveConfig();
  if (config.enabled !== true || !config.folderPath) return [];
  if (!force && Date.now() - sharedSnapshotCache.at < 2500) return sharedSnapshotCache.snapshots;
  const root = await ensureSharedDriveRoot();
  const dir = path.join(root, "snapshots");
  const names = await readdir(dir).catch(() => []);
  const snapshots = [];
  for (const name of names.filter((entry) => entry.toLowerCase().endsWith(".json"))) {
    try {
      const parsed = JSON.parse(await readFile(path.join(dir, name), "utf8"));
      if (!parsed?.branch?.code || !Array.isArray(parsed.deals) || !Array.isArray(parsed.clients)) continue;
      snapshots.push(parsed);
    } catch {}
  }
  sharedSnapshotCache = { at: Date.now(), snapshots };
  sharedDriveRuntime.lastReadAt = timestamp();
  const phones = new Set();
  let dealCount = 0;
  for (const snapshot of snapshots) {
    for (const client of snapshot.clients || []) { const phone = normalizePhone(client.phone); if (phone) phones.add(phone); }
    dealCount += (snapshot.deals || []).length;
  }
  sharedDriveRuntime.branches = snapshots.length;
  sharedDriveRuntime.clients = phones.size;
  sharedDriveRuntime.deals = dealCount;
  return snapshots;
}

async function syncSharedDrive({ force = false } = {}) {
  const config = sharedDriveConfig();
  if (config.enabled !== true) { sharedDriveRuntime.status = "disabled"; return false; }
  if (sharedDriveRuntime.syncing) return false;
  sharedDriveRuntime.syncing = true;
  try {
    const root = await ensureSharedDriveRoot();
    const snapshot = buildLocalSharedSnapshot();
    const branchCode = sharedBranchCode(snapshot.branch.code);
    const snapshotPath = path.join(root, "snapshots", `${branchCode}.json`);
    try {
      const existing = JSON.parse(await readFile(snapshotPath, "utf8"));
      const otherInstall = existing?.installationId && existing.installationId !== snapshot.installationId;
      const recent = Date.now() - Date.parse(existing?.generatedAt || 0) < 10 * 60 * 1000;
      if (otherInstall && recent) throw new Error(`La sucursal ${branchCode} ya está siendo publicada por otra instalación. Usá un código de sucursal único.`);
    } catch (error) {
      if (error?.code !== "ENOENT" && String(error?.message || "").includes("otra instalación")) throw error;
    }
    const hash = createHash("sha256").update(JSON.stringify({ ...snapshot, generatedAt: null })).digest("hex");
    if (force || sharedDriveRuntime.dirty || hash !== sharedDriveRuntime.lastSnapshotHash) {
      await writeJsonAtomic(snapshotPath, snapshot);
      sharedDriveRuntime.lastSnapshotHash = hash;
      sharedDriveRuntime.dirty = false;
    }
    sharedSnapshotCache.at = 0;
    await readSharedSnapshots({ force: true });
    sharedDriveRuntime.status = "connected";
    sharedDriveRuntime.lastSyncAt = timestamp();
    sharedDriveRuntime.lastError = null;
    return true;
  } catch (error) {
    sharedDriveRuntime.status = "error";
    sharedDriveRuntime.lastError = cleanText(error?.message || error, 500);
    return false;
  } finally {
    sharedDriveRuntime.syncing = false;
  }
}

function restartSharedDriveTimer() {
  if (sharedDriveTimer) clearInterval(sharedDriveTimer);
  sharedDriveTimer = null;
  if (sharedDriveConfig().enabled !== true) { sharedDriveRuntime.status = "disabled"; return; }
  const seconds = Math.min(300, Math.max(5, Number(sharedDriveConfig().syncIntervalSeconds) || 15));
  sharedDriveRuntime.status = "pending";
  void syncSharedDrive({ force: true });
  sharedDriveTimer = setInterval(() => { void syncSharedDrive(); }, seconds * 1000);
  sharedDriveTimer.unref?.();
}

function latestTime(...values) {
  return Math.max(0, ...values.map((value) => Date.parse(value || 0) || 0));
}

function sharedClientNameQuality(name, phone = "") {
  const value = cleanText(name, 120).trim();
  if (!value) return 0;
  const digits = normalizePhone(value);
  const normalizedPhone = normalizePhone(phone);
  if (digits && normalizedPhone && digits === normalizedPhone) return 0;
  if (/^cliente(?:\s+de\s+prueba)?(?:\s*[+#]?\d+)?$/i.test(value)) return 0;
  if (/^cliente\s*[+#]?\d+/i.test(value)) return 1;
  if (/^sin nombre$/i.test(value)) return 0;
  return value.split(/\s+/).length >= 2 ? 4 : 3;
}

async function sharedClientProfileByPhone(value) {
  const phone = normalizePhone(value);
  if (!phone || sharedDriveConfig().enabled !== true) return { found: false, phone, negotiations: [], branches: [] };
  let snapshots = [];
  try { snapshots = await readSharedSnapshots(); } catch { return { found: false, phone, negotiations: [], branches: [] }; }
  const clients = [];
  const negotiations = [];
  for (const snapshot of snapshots) {
    const branch = snapshot.branch || {};
    for (const client of snapshot.clients || []) {
      if (normalizePhone(client.phone) !== phone) continue;
      clients.push({ ...client, branchCode: branch.code, branchName: branch.name, branchCity: branch.city, branchAddress: branch.address });
    }
    for (const deal of snapshot.deals || []) {
      if (normalizePhone(deal.phone) !== phone) continue;
      negotiations.push({ ...deal, branchCode: branch.code, branchName: branch.name, branchCity: branch.city, branchAddress: branch.address });
    }
  }
  const bestClient = clients.sort((a, b) => {
    const quality = sharedClientNameQuality(b.name, phone) - sharedClientNameQuality(a.name, phone);
    return quality || (latestTime(b.updatedAt, b.createdAt) - latestTime(a.updatedAt, a.createdAt));
  })[0] || null;
  negotiations.sort((a, b) => latestTime(b.updatedAt, b.outcomeAt, b.createdAt) - latestTime(a.updatedAt, a.outcomeAt, a.createdAt));
  const won = negotiations.filter((deal) => deal.stage === "won").sort((a, b) => latestTime(b.outcomeAt, b.updatedAt) - latestTime(a.outcomeAt, a.updatedAt));
  const lastSale = won[0] || null;
  const lastDeal = negotiations[0] || null;
  const bestDealName = negotiations.slice().sort((a, b) => sharedClientNameQuality(b.name, phone) - sharedClientNameQuality(a.name, phone) || latestTime(b.updatedAt, b.createdAt) - latestTime(a.updatedAt, a.createdAt))[0]?.name || "";
  const firstNonEmpty = (field) => clients.slice().sort((a, b) => latestTime(b.updatedAt, b.createdAt) - latestTime(a.updatedAt, a.createdAt)).find((client) => cleanText(client?.[field], 500))?.[field] || "";
  const uniqueTags = [...new Set(clients.flatMap((client) => Array.isArray(client.tags) ? client.tags : []).map((tag) => cleanText(tag, 80)).filter(Boolean))].slice(0, 30);
  const uniqueBranches = [...new Map(negotiations.map((deal) => [deal.branchCode, { code: deal.branchCode, name: deal.branchName, city: deal.branchCity }])).values()];
  return {
    found: Boolean(bestClient || negotiations.length),
    phone,
    name: sharedClientNameQuality(bestClient?.name, phone) ? bestClient.name : bestDealName,
    document: firstNonEmpty("document"),
    email: firstNonEmpty("email"),
    company: firstNonEmpty("company"),
    city: firstNonEmpty("city"),
    tags: uniqueTags,
    branches: uniqueBranches,
    negotiations,
    lastContact: lastDeal ? { branchCode: lastDeal.branchCode, branchName: lastDeal.branchName, ownerName: lastDeal.ownerName || "", stage: lastDeal.stage, at: lastDeal.updatedAt || lastDeal.createdAt } : null,
    lastSale: lastSale ? { branchCode: lastSale.branchCode, branchName: lastSale.branchName, ownerName: lastSale.ownerName || "", at: lastSale.outcomeAt || lastSale.updatedAt, items: lastSale.items || [], value: (lastSale.items || []).filter((item) => item.status === "sold").reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0) } : null,
  };
}

function centralClientProfileByPhone(value) {
  const phone = normalizePhone(value);
  if (!phone) return { found: false, phone, negotiations: [], branches: [] };
  const client = (data.clients || []).find((entry) => normalizePhone(entry.phone) === phone) || null;
  const negotiations = (data.deals || []).filter((deal) => normalizePhone(deal.phone) === phone).map((deal) => {
    const branch = getBranch(deal.branchId) || {};
    return { ...deal, branchCode: branch.code || "", branchName: branch.name || "Sucursal", branchCity: branch.city || "", branchAddress: branch.address || "" };
  }).sort((a, b) => latestTime(b.updatedAt, b.outcomeAt, b.createdAt) - latestTime(a.updatedAt, a.outcomeAt, a.createdAt));
  const won = negotiations.filter((deal) => deal.stage === "won").sort((a, b) => latestTime(b.outcomeAt, b.updatedAt) - latestTime(a.outcomeAt, a.updatedAt));
  const lastSale = won[0] || null;
  const lastDeal = negotiations[0] || null;
  const uniqueBranches = [...new Map(negotiations.map((deal) => [deal.branchCode || deal.branchId, { code: deal.branchCode, name: deal.branchName, city: deal.branchCity }])).values()];
  return {
    found: Boolean(client || negotiations.length),
    phone,
    name: client?.name || lastDeal?.name || "",
    document: client?.document || "",
    email: client?.email || "",
    company: client?.company || "",
    city: client?.city || "",
    tags: Array.isArray(client?.tags) ? client.tags : [],
    branches: uniqueBranches,
    negotiations,
    lastContact: lastDeal ? { branchCode: lastDeal.branchCode, branchName: lastDeal.branchName, ownerName: lastDeal.ownerName || "", stage: lastDeal.stage, at: lastDeal.updatedAt || lastDeal.createdAt } : null,
    lastSale: lastSale ? { branchCode: lastSale.branchCode, branchName: lastSale.branchName, ownerName: lastSale.ownerName || "", at: lastSale.outcomeAt || lastSale.updatedAt, items: lastSale.items || [], value: (lastSale.items || []).filter((item) => item.status === "sold").reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0) } : null,
  };
}

function mergedSharedData(snapshots, { branchCode = "" } = {}) {
  const selected = branchCode ? snapshots.filter((snapshot) => sharedBranchCode(snapshot.branch?.code) === sharedBranchCode(branchCode)) : snapshots;
  const clientsByPhone = new Map();
  const deals = [];
  const calls = [];
  const products = [];
  const users = [];
  const branches = [];
  for (const snapshot of selected) {
    const branch = snapshot.branch || {};
    const code = sharedBranchCode(branch.code || branch.name);
    branches.push({ ...branch, id: code, code });
    for (const user of snapshot.users || []) users.push({ ...user, id: `${code}:${user.id}`, localId: user.id, branchId: code, branchCode: code, branchName: branch.name });
    for (const client of snapshot.clients || []) {
      const phone = normalizePhone(client.phone);
      if (!phone) continue;
      const existing = clientsByPhone.get(phone);
      if (!existing || latestTime(client.updatedAt, client.createdAt) > latestTime(existing.updatedAt, existing.createdAt)) clientsByPhone.set(phone, { ...client, id: `client:${phone}`, phone: `+${phone}` });
    }
    for (const deal of snapshot.deals || []) {
      const phone = normalizePhone(deal.phone);
      const ownerUserId = deal.ownerUserId ? `${code}:${deal.ownerUserId}` : null;
      deals.push({ ...deal, id: `${code}:${deal.id}`, clientId: phone ? `client:${phone}` : `${code}:${deal.clientId || deal.id}`, branchId: code, branchCode: code, branchName: branch.name, ownerUserId, messages: (deal.messages || []).map((message) => ({ ...message, agentUserId: message.agentUserId ? `${code}:${message.agentUserId}` : null })) });
    }
    for (const call of snapshot.calls || []) calls.push({ ...call, id: `${code}:${call.id}`, branchId: code });
    for (const product of snapshot.products || []) products.push({ ...product, id: `${code}:${product.id}`, branchId: code, branchCode: code, branchName: branch.name });
  }
  return { deals, clients: [...clientsByPhone.values()], calls, products, users, branches };
}

async function sharedDriveOverview(user = null) {
  const snapshots = await readSharedSnapshots({ force: true });
  const uniquePhones = new Set();
  const branches = snapshots.map((snapshot) => {
    const deals = snapshot.deals || [];
    const won = deals.filter((deal) => deal.stage === "won");
    for (const client of snapshot.clients || []) { const phone = normalizePhone(client.phone); if (phone) uniquePhones.add(phone); }
    return {
      code: snapshot.branch?.code || "",
      name: snapshot.branch?.name || "Sucursal",
      city: snapshot.branch?.city || "",
      generatedAt: snapshot.generatedAt || null,
      clients: (snapshot.clients || []).length,
      deals: deals.length,
      open: deals.filter((deal) => OPEN_STAGES.has(deal.stage)).length,
      won: won.length,
      salesValue: won.reduce((sum, deal) => sum + (deal.items || []).filter((item) => item.status === "sold").reduce((sub, item) => sub + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0), 0),
      lowStock: (snapshot.products || []).filter((product) => product.active !== false && Number(product.available || 0) <= Number(product.minStock || 0)).length,
      products: (snapshot.products || []).map((product) => ({ sku: product.sku, name: product.name, available: product.available, reserved: product.reserved, minStock: product.minStock, price: product.price })),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const recentMovements = snapshots.flatMap((snapshot) => (snapshot.auditEvents || []).map((event) => ({ ...event, branchCode: event.branchCode || snapshot.branch?.code, branchName: event.branchName || snapshot.branch?.name }))).sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, canViewGlobalReports(user) ? 150 : 25);
  return { generatedAt: timestamp(), branches, uniqueClients: uniquePhones.size, recentMovements, canViewGlobalReports: canViewGlobalReports(user) };
}

async function readSharedAuditEvents({ days = 30, branchCode = "", ownerUserId = "", limit = 1000 } = {}) {
  if (sharedDriveConfig().enabled !== true) return [];
  const root = await ensureSharedDriveRoot();
  const auditRoot = path.join(root, "audit");
  const cutoff = Number(days) > 0 ? Date.now() - Number(days) * 24 * 60 * 60 * 1000 : 0;
  const requestedBranch = branchCode ? sharedBranchCode(branchCode) : "";
  let requestedUserBranch = "";
  let requestedLocalUser = cleanText(ownerUserId, 180);
  if (requestedLocalUser.includes(":")) {
    const [code, ...rest] = requestedLocalUser.split(":");
    requestedUserBranch = sharedBranchCode(code);
    requestedLocalUser = rest.join(":");
  }
  const events = [];
  let branchDirs = [];
  try { branchDirs = await readdir(auditRoot, { withFileTypes: true }); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  for (const branchEntry of branchDirs.filter((entry) => entry.isDirectory())) {
    const code = sharedBranchCode(branchEntry.name);
    if (requestedBranch && code !== requestedBranch) continue;
    if (requestedUserBranch && code !== requestedUserBranch) continue;
    const branchPath = path.join(auditRoot, branchEntry.name);
    let months = [];
    try { months = await readdir(branchPath, { withFileTypes: true }); } catch { continue; }
    months = months.filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name)).sort((a, b) => b.name.localeCompare(a.name));
    for (const monthEntry of months) {
      const monthPath = path.join(branchPath, monthEntry.name);
      let daysFiles = [];
      try { daysFiles = await readdir(monthPath, { withFileTypes: true }); } catch { continue; }
      daysFiles = daysFiles.filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(entry.name)).sort((a, b) => b.name.localeCompare(a.name));
      for (const dayEntry of daysFiles) {
        const dayDate = Date.parse(dayEntry.name.slice(0, 10) + "T23:59:59.999Z");
        if (cutoff && dayDate < cutoff - 24 * 60 * 60 * 1000) continue;
        let content = "";
        try { content = await readFile(path.join(monthPath, dayEntry.name), "utf8"); } catch { continue; }
        for (const line of content.split(/\r?\n/)) {
          if (!line.trim()) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          const eventAt = Date.parse(event.at || 0) || 0;
          if (cutoff && eventAt < cutoff) continue;
          if (requestedLocalUser && event.userId !== requestedLocalUser) continue;
          events.push({ ...event, branchCode: event.branchCode || code });
        }
      }
    }
  }
  events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return events.slice(0, Math.min(5000, Math.max(1, Number(limit) || 1000)));
}

async function sharedDriveReport({ days = 30, branchCode = "", ownerUserId = "" } = {}) {
  const snapshots = await readSharedSnapshots({ force: true });
  const merged = mergedSharedData(snapshots, { branchCode });
  const report = buildReports(merged, { days, ownerUserId: ownerUserId || null });
  const branchSummaries = [];
  for (const snapshot of branchCode ? snapshots.filter((item) => sharedBranchCode(item.branch?.code) === sharedBranchCode(branchCode)) : snapshots) {
    const code = sharedBranchCode(snapshot.branch?.code);
    const scoped = mergedSharedData([snapshot]);
    const summary = buildReports(scoped, { days }).summary;
    branchSummaries.push({ code, name: snapshot.branch?.name || code, city: snapshot.branch?.city || "", generatedAt: snapshot.generatedAt || null, ...summary });
  }
  const auditEvents = await readSharedAuditEvents({ days, branchCode, ownerUserId, limit: 1000 });
  return { ...report, global: true, branchCode: branchCode || null, branchSummaries, users: merged.users, branches: merged.branches, auditEvents };
}

function sanitizeAuditValue(value, depth = 0) {
  if (depth > 3) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeAuditValue(item, depth + 1)).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (/password|token|apikey|secret|credential/i.test(key)) continue;
      const sanitized = sanitizeAuditValue(item, depth + 1);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
  }
  if (typeof value === "string") return cleanText(value, 500);
  if (["number", "boolean"].includes(typeof value) || value === null) return value;
  return undefined;
}

function recordAuditEvent(user, action, details = {}, branchId = null, actorType = "user") {
  const branch = getBranch(branchId || user?.branchId || primaryBranchId()) || primaryBranch();
  const event = {
    id: `audit_${randomUUID()}`,
    at: timestamp(),
    action: cleanText(action, 100),
    actorType,
    userId: user?.id || null,
    userName: cleanText(user?.name || (actorType === "system" ? "Sistema" : ""), 120),
    username: cleanText(user?.username, 80),
    role: user?.role || actorType,
    branchId: branch?.id || null,
    branchCode: branch?.code || "",
    branchName: branch?.name || "",
    details: sanitizeAuditValue(details) || {},
  };
  data.auditEvents.unshift(event);
  if (data.auditEvents.length > 5000) data.auditEvents.splice(5000);
  sharedDriveRuntime.dirty = true;
  if (sharedDriveConfig().enabled === true) void appendSharedAudit(event);
  return event;
}

async function appendSharedAudit(event) {
  try {
    const root = await ensureSharedDriveRoot();
    const code = sharedBranchCode(event.branchCode || localSharedBranch()?.code);
    const day = String(event.at || timestamp()).slice(0, 10);
    const month = day.slice(0, 7);
    const dir = path.join(root, "audit", code, month);
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, `${day}.ndjson`), `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    sharedDriveRuntime.lastError = cleanText(error?.message || error, 500);
  }
}

function auditDescriptionForRequest(request) {
  const urlPath = String(request.originalUrl || request.url || "").split("?")[0];
  const method = request.method;
  const patterns = [
    [/\/api\/deals\/[^/]+\/message$/, "mensaje_enviado"],
    [/\/api\/deals\/[^/]+\/media$/, "archivo_enviado"],
    [/\/api\/deals\/[^/]+\/assign$/, "responsable_asignado"],
    [/\/api\/deals\/[^/]+\/bot$/, "bot_modificado"],
    [/\/api\/deals\/[^/]+\/won$/, "negociacion_ganada"],
    [/\/api\/deals\/[^/]+\/lost$/, "negociacion_perdida"],
    [/\/api\/deals\/[^/]+\/reserve$/, "producto_reservado"],
    [/\/api\/deals\/[^/]+\/items\/[^/]+$/, "reserva_devuelta"],
    [/\/api\/deals\/[^/]+\/transfer$/, "conversacion_transferida"],
    [/\/api\/clients(?:\/[^/]+)?$/, method === "POST" ? "cliente_creado" : "cliente_actualizado"],
    [/\/api\/products(?:\/[^/]+(?:\/adjust)?)?$/, "stock_modificado"],
    [/\/api\/users(?:\/[^/]+)?$/, "usuario_modificado"],
    [/\/api\/branches(?:\/[^/]+(?:\/connect|\/disconnect)?)?$/, "sucursal_modificada"],
    [/\/api\/quick-replies(?:\/[^/]+)?$/, "respuesta_rapida_modificada"],
    [/\/api\/data\/import\/[^/]+$/, "datos_importados"],
    [/\/api\/settings$/, "configuracion_modificada"],
    [/\/api\/branding(?:\/logo)?$/, "identidad_modificada"],
    [/\/api\/connect$/, "whatsapp_conectado"],
    [/\/api\/disconnect$/, "whatsapp_desconectado"],
    [/\/api\/shared-drive\/settings$/, "drive_configurado"],
    [/\/api\/shared-drive\/sync$/, "drive_sincronizado"],
  ];
  const action = patterns.find(([pattern]) => pattern.test(urlPath))?.[1] || `api_${method.toLowerCase()}`;
  const dealId = urlPath.match(/\/api\/deals\/([^/]+)/)?.[1] || null;
  const deal = dealId ? findDeal(data, dealId) : null;
  const safeBody = Buffer.isBuffer(request.body) || request.body instanceof Uint8Array ? {} : (request.body || {});
  return { action, branchId: deal?.branchId || safeBody?.branchId || null, details: { method, path: urlPath, dealId, clientId: deal?.clientId || request.params?.id || null, clientPhone: deal?.phone || null, body: sanitizeAuditValue(safeBody) } };
}

function jidServer(jid) {
  return String(jid || "").split("@")[1]?.toLowerCase() || "";
}

function jidUser(jid) {
  return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isLidJid(jid) {
  return ["lid", "hosted.lid"].includes(jidServer(jid));
}

function isPhoneNumberJid(jid) {
  return ["s.whatsapp.net", "hosted"].includes(jidServer(jid));
}

function normalizePhoneJid(jid) {
  if (!isPhoneNumberJid(jid)) return "";
  const phone = normalizePhone(jidUser(jid));
  return phone ? `${phone}@s.whatsapp.net` : "";
}

function isPlausibleTransferPhone(value) {
  const phone = normalizePhone(value);
  return /^\d{10,15}$/.test(phone);
}

async function pnJidForLid(jid, branchId = null) {
  if (!isLidJid(jid)) return "";
  const socket = branchSocket(branchId || primaryBranchId());
  const mapping = socket?.signalRepository?.lidMapping;
  if (!mapping?.getPNForLID) return "";
  try {
    const pn = await mapping.getPNForLID(jid);
    return normalizePhoneJid(pn);
  } catch {
    return "";
  }
}

async function canonicalClientJidFromMessage(item, branchId = null) {
  const key = item?.key || {};
  const candidates = [key.remoteJidAlt, key.participantAlt, key.remoteJid, key.participant].filter(Boolean);
  for (const candidate of candidates) {
    const pn = normalizePhoneJid(candidate);
    if (pn) return pn;
  }
  for (const candidate of candidates) {
    if (!isLidJid(candidate)) continue;
    const mapped = await pnJidForLid(candidate, branchId);
    if (mapped) return mapped;
  }
  return String(key.remoteJid || "");
}

function repairStoredIdentity(rawJids, canonicalJid) {
  if (!canonicalJid || !isPhoneNumberJid(canonicalJid)) return;
  const phone = normalizePhone(jidUser(canonicalJid));
  const rawSet = new Set((rawJids || []).filter(Boolean));
  if (!phone || !rawSet.size) return;
  for (const deal of data.deals || []) {
    if (!rawSet.has(deal.jid)) continue;
    deal.jid = canonicalJid;
    deal.phone = `+${phone}`;
  }
  for (const client of data.clients || []) {
    if (!rawSet.has(client.jid)) continue;
    client.jid = canonicalJid;
    client.phone = `+${phone}`;
  }
}

async function verifiedClientPhoneForTransfer(deal, client, branchId, manualPhone = "") {
  const manual = normalizePhone(manualPhone);
  if (manual && isPlausibleTransferPhone(manual)) return { phone: manual, source: "manual" };

  for (const jid of [client?.jid, deal?.jid]) {
    const pnJid = normalizePhoneJid(jid);
    if (pnJid) return { phone: normalizePhone(jidUser(pnJid)), source: "jid" };
  }

  for (const jid of [client?.jid, deal?.jid]) {
    if (!isLidJid(jid)) continue;
    const pnJid = await pnJidForLid(jid, branchId);
    if (pnJid) {
      const phone = normalizePhone(jidUser(pnJid));
      repairStoredIdentity([client?.jid, deal?.jid], pnJid);
      return { phone, source: "lid-mapping" };
    }
  }

  // Solo confiamos en el teléfono guardado cuando el JID asociado NO es LID.
  // Esto evita volver a convertir un identificador LID numérico en un teléfono falso.
  const storedCandidates = [
    { value: client?.phone, jid: client?.jid },
    { value: deal?.phone, jid: deal?.jid },
  ];
  for (const candidate of storedCandidates) {
    if (isLidJid(candidate.jid)) continue;
    const phone = normalizePhone(candidate.value);
    if (isPlausibleTransferPhone(phone)) return { phone, source: "stored" };
  }
  return { phone: "", source: "unresolved" };
}


function v214NormalizeComparable(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function v214DiceSimilarity(left = "", right = "") {
  const a = v214NormalizeComparable(left).replace(/\s+/g, "");
  const b = v214NormalizeComparable(right).replace(/\s+/g, "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 0.8 : 0;
  const pairs = new Map();
  for (let i = 0; i < a.length - 1; i += 1) { const p = a.slice(i, i + 2); pairs.set(p, (pairs.get(p) || 0) + 1); }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) { const p = b.slice(i, i + 2), n = pairs.get(p) || 0; if (n > 0) { overlap += 1; pairs.set(p, n - 1); } }
  return (2 * overlap) / ((a.length - 1) + (b.length - 1));
}

function v214ClientIdentityRows(client) {
  const rows = [];
  for (const phone of client?.phones || []) if (phone.active !== false && normalizePhone(phone.phone)) rows.push({ phone: normalizePhone(phone.phone), phoneDisplay: phone.phone || `+${normalizePhone(phone.phone)}`, label: phone.label || "Teléfono", contactPerson: null, identityType: "client" });
  for (const person of client?.contactPersons || []) {
    if (person.active === false) continue;
    for (const phone of person.phones || []) if (phone.active !== false && normalizePhone(phone.phone)) rows.push({ phone: normalizePhone(phone.phone), phoneDisplay: phone.phone || `+${normalizePhone(phone.phone)}`, label: phone.label || "WhatsApp", contactPerson: person, identityType: "contact_person" });
  }
  const legacy = normalizePhone(client?.phone);
  if (legacy && !rows.some((row) => row.phone === legacy)) rows.push({ phone: legacy, phoneDisplay: client.phone || `+${legacy}`, label: "Principal", contactPerson: null, identityType: "client" });
  return rows;
}

function v214LatestDealForClient(clientId, branchId = null, phone = "", { openOnly = false } = {}) {
  const digits = normalizePhone(phone);
  return (data.deals || []).filter((deal) => deal.clientId === clientId && (!branchId || deal.branchId === branchId) && (!digits || normalizePhone(deal.phone) === digits) && (!openOnly || OPEN_STAGES.has(deal.stage))).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null;
}

function v214OwnerForClient(client, branchId, phone = "") {
  const openDeal = v214LatestDealForClient(client.id, branchId, phone, { openOnly: true });
  if (openDeal?.ownerUserId) return { userId: openDeal.ownerUserId, userName: openDeal.ownerName || "", deal: openDeal };
  const branchOwner = branchId ? client.branchOwners?.[branchId] : null;
  if (branchOwner?.userId) return { userId: branchOwner.userId, userName: branchOwner.userName || "", deal: openDeal };
  const recent = v214LatestDealForClient(client.id, branchId, phone);
  if (recent?.ownerUserId) return { userId: recent.ownerUserId, userName: recent.ownerName || "", deal: openDeal || recent };
  return { userId: null, userName: "", deal: openDeal || recent };
}

function v214ExpireCommunicationRequests() {
  const now = Date.now();
  for (const request of data.communicationRequests || []) {
    if (request.status === "pending" && request.expiresAt && Date.parse(request.expiresAt) <= now) { request.status = "expired"; request.updatedAt = timestamp(); }
    if (request.status === "approved" && request.mode === "temporary" && request.grantedUntil && Date.parse(request.grantedUntil) <= now) { request.status = "expired"; request.updatedAt = timestamp(); }
  }
}

function v214ActiveCommunicationGrant(deal, user) {
  if (!deal || !user) return null;
  v214ExpireCommunicationRequests();
  const now = Date.now();
  return (data.communicationRequests || []).find((request) => request.status === "approved" && request.mode === "temporary" && request.requestedByUserId === user.id && request.branchId === deal.branchId && request.clientId === deal.clientId && (!request.dealId || request.dealId === deal.id) && (!request.grantedUntil || Date.parse(request.grantedUntil) > now)) || null;
}

function visibleCommunicationRequests(user) {
  if (!user) return [];
  v214ExpireCommunicationRequests();
  return (data.communicationRequests || []).filter((request) => {
    if (user.role === "admin") return true;
    if (request.requestedByUserId === user.id || request.currentOwnerUserId === user.id) return true;
    if (["manager", "supervisor"].includes(user.role) && (!user.branchId || request.branchId === user.branchId)) return true;
    return false;
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 300);
}

function v214CanDecideCommunicationRequest(request, user) {
  if (!request || !user) return false;
  if (user.role === "admin") return true;
  if (request.currentOwnerUserId === user.id) return true;
  return ["manager", "supervisor"].includes(user.role) && (!user.branchId || request.branchId === user.branchId);
}

function v214CreateOrFindCommunicationDeal(client, phone, branchId, owner = null) {
  const digits = normalizePhone(phone);
  let deal = v214LatestDealForClient(client.id, branchId, digits, { openOnly: true });
  if (!deal) {
    const identity = v214ClientIdentityRows(client).find((row) => row.phone === digits);
    const line = defaultWhatsappLine(branchId);
    deal = createDeal(data, { jid: `${digits}@s.whatsapp.net`, name: client.name || identity?.contactPerson?.name || `Cliente ${digits}`, branchId, lineId: line?.id || null, source: "manual-request" });
    deal.clientId = client.id;
    deal.contactPersonId = identity?.contactPerson?.id || null;
    deal.contactPersonName = identity?.contactPerson?.name || "";
    deal.contactRole = identity?.contactPerson?.role || "";
    deal.identityType = identity?.contactPerson ? "contact_person" : (client.entityType === "company" ? "company" : "client");
    if (owner?.userId) { deal.ownerUserId = owner.userId; deal.ownerName = owner.userName || ""; }
  }
  return deal;
}

function v214SimilarityCandidates({ name = "", phone = "", branchId = null, user = null } = {}) {
  const nameNeedle = v214NormalizeComparable(name);
  const phoneNeedle = normalizePhone(phone);
  const results = [];
  for (const client of data.clients || []) {
    const identities = v214ClientIdentityRows(client);
    let best = null;
    for (const identity of identities.length ? identities : [{ phone: normalizePhone(client.phone), phoneDisplay: client.phone, label: "Principal", contactPerson: null, identityType: "client" }]) {
      let score = 0, matchType = "", reason = "";
      if (phoneNeedle && identity.phone) {
        if (phoneNeedle === identity.phone) { score = 100; matchType = "exact_phone"; reason = "El número coincide exactamente."; }
        else if (phoneNeedle.length >= 7 && identity.phone.endsWith(phoneNeedle.slice(-7))) { score = 94; matchType = "similar_phone"; reason = "Coinciden los últimos dígitos del teléfono."; }
        else if (phoneNeedle.length >= 5 && (identity.phone.includes(phoneNeedle) || phoneNeedle.includes(identity.phone))) { score = Math.max(score, 82); matchType = "similar_phone"; reason = "El teléfono es muy parecido."; }
      }
      if (nameNeedle) {
        const fields = [client.name, client.company, identity.contactPerson?.name].filter(Boolean);
        for (const field of fields) {
          const normalized = v214NormalizeComparable(field);
          const dice = v214DiceSimilarity(nameNeedle, normalized);
          let candidate = Math.round(dice * 90);
          if (normalized === nameNeedle) candidate = 97;
          else if (nameNeedle.length >= 3 && (normalized.includes(nameNeedle) || nameNeedle.includes(normalized))) candidate = Math.max(candidate, 88);
          if (candidate > score && candidate >= 48) { score = candidate; matchType = normalized === nameNeedle ? "exact_name" : "similar_name"; reason = identity.contactPerson?.name === field ? "El nombre coincide con una persona de contacto." : "Encontramos un nombre muy parecido."; }
        }
      }
      if (score && (!best || score > best.score)) best = { identity, score, matchType, reason };
    }
    if (!best || best.score < 48) continue;
    const owner = v214OwnerForClient(client, branchId, best.identity.phone);
    const ownerUser = owner.userId ? data.users.find((entry) => entry.id === owner.userId) : null;
    refreshClientBranchRelationships(client);
    const branches = (client.branchRelationships || []).filter((rel) => rel.active !== false).map((rel) => ({ id: rel.branchId, name: getBranch(rel.branchId)?.name || "Sucursal", preferred: rel.preferred === true, purchases: Number(rel.purchaseCount || 0) })).slice(0, 12);
    results.push({
      clientId: client.id,
      name: client.name || client.company || best.identity.contactPerson?.name || best.identity.phoneDisplay,
      entityType: client.entityType || "person",
      company: client.company || "",
      phone: best.identity.phoneDisplay || (best.identity.phone ? `+${best.identity.phone}` : ""),
      phoneDigits: best.identity.phone || "",
      phoneLabel: best.identity.label || "",
      contactPersonId: best.identity.contactPerson?.id || null,
      contactPersonName: best.identity.contactPerson?.name || "",
      contactRole: best.identity.contactPerson?.role || "",
      score: best.score,
      matchType: best.matchType,
      reason: best.reason,
      exactPhone: best.matchType === "exact_phone",
      branchId,
      branches,
      ownerUserId: owner.userId || null,
      ownerName: owner.userName || "",
      ownerStatus: ownerUser?.attendance?.status || (owner.userId ? "offline" : "unassigned"),
      dealId: owner.deal?.id || null,
      ownClient: Boolean(owner.userId && owner.userId === user?.id),
      requiresCommunicationRequest: best.matchType === "exact_phone" && Boolean(owner.userId && owner.userId !== user?.id),
      canTakeDirectly: best.matchType === "exact_phone" && !owner.userId,
    });
  }
  return results.sort((a, b) => b.score - a.score || Number(b.exactPhone) - Number(a.exactPhone)).slice(0, 12);
}

function ensureDealOwnership(deal, user, { claim = false, allowTemporaryCommunication = false } = {}) {
  if (!deal || !user) throw new Error("Negociación no encontrada.");
  if (!userCanAccessBranch(user, deal.branchId || primaryBranchId())) throw new Error("Esta conversación pertenece a otra sucursal.");
  const line=dealWhatsappLine(deal);
  if(line && !canUserUseWhatsappLine(user,line)) throw new Error(`No estás autorizado a utilizar la línea ${line.name}.`);
  if (!deal.ownerUserId && claim) {
    if (user.role === "agent" && !isAgentAvailable(user, deal.branchId || primaryBranchId())) throw new Error("Marcá tu estado como Disponible antes de tomar clientes nuevos.");
    deal.ownerUserId = user.id;
    deal.ownerName = user.name;
    deal.updatedAt = timestamp();
    const client = findClient(data, deal.clientId);
    if (client) {
      client.ownerUserId = user.id; client.ownerName = user.name; client.updatedAt = timestamp();
      if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
      if (deal.branchId) client.branchOwners[deal.branchId] = { userId: user.id, userName: user.name, updatedAt: timestamp() };
    }
    for (const related of data.deals.filter((entry) => entry.clientId && entry.clientId === deal.clientId && entry.branchId === deal.branchId && (!deal.lineId || entry.lineId === deal.lineId) && !entry.ownerUserId)) { related.ownerUserId = user.id; related.ownerName = user.name; }
    addActivity(data, `${user.name} tomó la conversación de ${deal.name}.`, "success");
  }
  if (deal.ownerUserId && deal.ownerUserId !== user.id && user.role !== "admin") {
    const communicationGrant = allowTemporaryCommunication ? v214ActiveCommunicationGrant(deal, user) : null;
    const supervisorCoverage = ["manager", "supervisor"].includes(user.role) && isOwnerAway(deal) && userCanAccessBranch(user, deal.branchId || primaryBranchId());
    if (!supervisorCoverage && !communicationGrant) throw new Error(`Esta conversación pertenece a ${deal.ownerName || "otro asesor"}.${allowTemporaryCommunication ? " Solicitá autorización de comunicación antes de contactar al cliente." : ""}`);
    deal.coverageRequired = true;
    deal.coverageReason = communicationGrant ? `Comunicación temporal autorizada para ${user.name} hasta ${new Date(communicationGrant.grantedUntil).toLocaleString("es-PY")}. El responsable principal se mantiene.` : `Cobertura temporal por ${user.name}; el responsable original se mantiene.`;
  }
  return deal;
}

function isAllowedOrigin(origin, request = null) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const originHost = url.host.toLowerCase();

    const requestHost = String(
      request?.headers?.host || ""
    ).split(",")[0].trim().toLowerCase();

    const forwardedHost = String(
      request?.headers?.["x-forwarded-host"] || ""
    ).split(",")[0].trim().toLowerCase();

    if (
      originHost &&
      [requestHost, forwardedHost].filter(Boolean).includes(originHost)
    ) {
      return true;
    }

    return ["127.0.0.1", "localhost", "terminal.local"].includes(
      url.hostname
    );
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function validateAutomationSettings(input) {
  const result = {};
  if (input.followup && typeof input.followup === "object") {
    result.followup = {
      enabled: input.followup.enabled !== false,
      value: Math.max(1, Number(input.followup.value) || 1),
      unit: ["minutes", "hours", "days"].includes(input.followup.unit)
        ? input.followup.unit
        : "minutes",
      message: cleanText(input.followup.message, 1000),
    };
    if (!result.followup.message) throw new Error("Ingresá el mensaje de seguimiento.");
  }
  if (input.autoClose && typeof input.autoClose === "object") {
    result.autoClose = {
      enabled: input.autoClose.enabled !== false,
      value: Math.max(1, Number(input.autoClose.value) || 1),
      unit: ["minutes", "hours", "days"].includes(input.autoClose.unit)
        ? input.autoClose.unit
        : "hours",
    };
  }
  if (input.heatMinutes && typeof input.heatMinutes === "object") {
    const values = [
      Number(input.heatMinutes.warm),
      Number(input.heatMinutes.hot),
      Number(input.heatMinutes.red),
      Number(input.heatMinutes.critical),
    ].map((value) => Math.max(1, value || 1));
    if (!(values[0] < values[1] && values[1] < values[2] && values[2] < values[3])) {
      throw new Error("Los tiempos de color deben aumentar de menor a mayor.");
    }
    result.heatMinutes = {
      warm: values[0],
      hot: values[1],
      red: values[2],
      critical: values[3],
    };
  }
  return result;
}

function decodeHeader(value, fallback = "") {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return String(value || fallback);
  }
}

function outgoingMediaInfo(request) {
  const mimeType = cleanText(request.headers["content-type"], 160).split(";")[0].toLowerCase() || "application/octet-stream";
  const requestedKind = cleanText(request.headers["x-media-kind"], 20).toLowerCase();
  const safeImages = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  let kind = "document";
  if (safeImages.has(mimeType)) kind = "image";
  else if (mimeType.startsWith("video/")) kind = "video";
  else if (mimeType.startsWith("audio/")) kind = "audio";
  if (["image", "video", "audio", "document"].includes(requestedKind) && requestedKind === kind) {
    kind = requestedKind;
  }
  const fallback = `${kind}-${Date.now()}${extensionForMime(mimeType, kind)}`;
  return {
    kind,
    mimeType,
    fileName: safeFileName(decodeHeader(request.headers["x-file-name"], fallback), fallback),
    caption: cleanText(decodeHeader(request.headers["x-caption"]), 1000),
    duration: Math.max(0, Number(request.headers["x-duration"]) || 0),
    ptt: request.headers["x-voice-note"] === "1",
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === "," || char === ";") { row.push(cell.trim()); cell = ""; }
    else if (char === "\n") { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function headerKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvText(headers, rows) {
  return `\uFEFF${headers.map(csvEscape).join(",")}\r\n${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}

const dataFormats = {
  stock: {
    file: "stock",
    headers: ["codigo", "nombre", "descripcion", "stock", "stock_minimo", "precio", "activo"],
    example: [["SKU001", "Producto de ejemplo", "Descripción", "25", "5", "150000", "SI"]],
  },
  contacts: {
    file: "contactos",
    headers: ["id", "nombre", "telefono", "documento", "ruc", "correo", "empresa", "ciudad", "direccion", "etiquetas", "notas", "consentimiento_marketing", "sucursal_codigo", "responsable_usuario"],
    example: [["", "Cliente Ejemplo", "595981123456", "1234567", "80012345-6", "cliente@empresa.com", "Empresa SA", "Asunción", "", "VIP,Mayorista", "", "SI", "CASA-CENTRAL", ""]],
  },
  users: {
    file: "usuarios",
    headers: ["usuario", "nombre", "rol", "sucursal_codigo", "limite_clientes_dia", "informes_globales", "activo", "password"],
    example: [["vendedor1", "Vendedor Uno", "agente", "", "30", "NO", "SI", "Cambiar123*"]],
  },
  branches: {
    file: "sucursales",
    headers: ["codigo", "nombre", "ciudad", "direccion", "whatsapp", "mensaje_presentacion", "activo"],
    example: [["SUC-02", "Sucursal Lambaré", "Lambaré", "Av. Ejemplo 123", "595982123456", "", "SI"]],
  },
  replies: {
    file: "respuestas-rapidas",
    headers: ["titulo", "atajo", "categoria", "respuesta", "activo"],
    example: [["Sucursales", "/sucursales", "Información", "Tenemos sucursales en...", "SI"]],
  },
};

function csvBoolean(value, fallback = true) {
  const normalized = cleanText(value, 20).toLowerCase();
  if (!normalized) return fallback;
  return !["no", "false", "0", "inactivo", "n"].includes(normalized);
}

function brandingResponse() {
  const brand = data.settings.branding || {};
  return {
    systemName: cleanText(brand.systemName, 80) || "WhatsBot CRM",
    shortName: cleanText(brand.shortName, 40) || "WhatsBot",
    subtitle: cleanText(brand.subtitle, 40) || "CRM LOCAL",
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor || "") ? brand.primaryColor : "#171717",
    accentColor: /^#[0-9a-fA-F]{6}$/.test(brand.accentColor || "") ? brand.accentColor : "#FF7A00",
    backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brand.backgroundColor || "") ? brand.backgroundColor : "#F3F3F3",
    sidebarColor: /^#[0-9a-fA-F]{6}$/.test(brand.sidebarColor || "") ? brand.sidebarColor : (/^#[0-9a-fA-F]{6}$/.test(brand.primaryColor || "") ? brand.primaryColor : "#101010"),
    surfaceColor: /^#[0-9a-fA-F]{6}$/.test(brand.surfaceColor || "") ? brand.surfaceColor : "#FFFFFF",
    textColor: /^#[0-9a-fA-F]{6}$/.test(brand.textColor || "") ? brand.textColor : "#1B1B1B",
    fontStyle: ["modern","system","rounded","classic"].includes(brand.fontStyle) ? brand.fontStyle : "modern",
    radius: ["10","14","18","24"].includes(String(brand.radius)) ? String(brand.radius) : "14",
    logoFit: ["contain","cover"].includes(brand.logoFit) ? brand.logoFit : "contain",
    defaultTheme: ["light","dark","system"].includes(brand.defaultTheme) ? brand.defaultTheme : "light",
    loginKicker: cleanText(brand.loginKicker, 50) || "CONTROL LOCAL · 24/7",
    loginMessage: cleanText(brand.loginMessage, 220) || "Ingresá con tu usuario para administrar las conversaciones, el bot y el stock.",
    loginStyle: ["ambient","split","minimal"].includes(brand.loginStyle) ? brand.loginStyle : "minimal",
    showSubtitle: brand.showSubtitle !== false,
    logoUrl: brand.logoFileName ? "/api/branding/logo" : "",
  };
}

async function backupEntries() {
  await store.save();
  const files = await listFilesRecursive(dataDirectory);
  const entries = [];
  for (const file of files) entries.push({ name: file.relative, data: await readFile(file.absolute) });
  entries.push({
    name: "BACKUP-INFO.json",
    data: Buffer.from(JSON.stringify({ product: "WhatsBot CRM", version: "23.0", createdAt: timestamp(), includes: ["base de datos", "archivos multimedia", "sesiones WhatsApp QR por sucursal", "sucursales y transferencias", "configuración", "usuarios", "credenciales cifradas/configuradas", "historial de llamadas WhatsApp", "documentos del Copiloto", "plantillas personalizables", "campos personalizados", "instrucciones del bot", "campañas y métricas", "formularios y respuestas", "estados comerciales inteligentes", "orquestador central de comunicaciones", "marcación y cobertura"] }, null, 2)),
  });
  return entries;
}

function visibleContactsFor(user) {
  if (!user) return [];
  if (user.role === "admin") return data.clients || [];
  const branchId = user.branchId || primaryBranchId();
  const visibleIds = new Set((data.deals || []).filter((deal) => deal.branchId === branchId && (user.role !== "agent" || !deal.ownerUserId || deal.ownerUserId === user.id)).map((deal) => deal.clientId).filter(Boolean));
  return (data.clients || []).filter((client) => visibleIds.has(client.id));
}

function reportDataFor(user) {
  if (!user || user.role === "admin") return data;
  const branchId = user.branchId || primaryBranchId();
  const deals = (data.deals || []).filter((deal) => deal.branchId === branchId && (user.role !== "agent" || !deal.ownerUserId || deal.ownerUserId === user.id));
  const clientIds = new Set(deals.map((deal) => deal.clientId).filter(Boolean));
  const calls = (data.calls || []).filter((call) => (call.branchId || primaryBranchId()) === branchId);
  return { ...data, deals, clients: (data.clients || []).filter((client) => clientIds.has(client.id)), calls };
}



const campaignRunners = new Map();

function campaignRecipientMetrics(campaign) {
  const recipients = campaign?.recipients || [];
  const sent = recipients.filter((entry) => entry.status === "sent").length;
  const failed = recipients.filter((entry) => entry.status === "failed").length;
  const pending = recipients.filter((entry) => ["pending", "queued"].includes(entry.status)).length;
  const replied = recipients.filter((entry) => entry.repliedAt).length;
  const converted = recipients.filter((entry) => entry.convertedAt).length;
  return {
    total: recipients.length, sent, failed, pending, replied, converted,
    responseRate: sent ? Number(((replied / sent) * 100).toFixed(1)) : 0,
    conversionRate: sent ? Number(((converted / sent) * 100).toFixed(1)) : 0,
  };
}

function publicCampaign(campaign, includeRecipients = false) {
  const line=whatsappLineById(campaign?.lineId)||defaultWhatsappLine(campaign?.branchId);
  const result = { ...campaign, lineId:line?.id||campaign?.lineId||null, lineName:line?.name||"", metrics: campaignRecipientMetrics(campaign) };
  if (!includeRecipients) delete result.recipients;
  return result;
}

function purchaseStatsForClient(clientId, branchId = null) {
  const won = (data.deals || []).filter((deal) => deal.clientId === clientId && deal.stage === STAGES.WON && (!branchId || deal.branchId === branchId));
  won.sort((a, b) => String(b.outcomeAt || b.updatedAt).localeCompare(String(a.outcomeAt || a.updatedAt)));
  const value = won.reduce((sum, deal) => sum + (deal.items || []).filter((item) => item.status === "sold").reduce((subtotal, item) => subtotal + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0), 0);
  return { count: won.length, value, lastAt: won[0]?.outcomeAt || won[0]?.updatedAt || null };
}

function clientMatchesCampaignFilters(client, filters = {}, branchId) {
  const deals = (data.deals || []).filter((deal) => deal.clientId === client.id && (!branchId || deal.branchId === branchId));
  if (!deals.length) return false;
  if (filters.marketingOptIn !== false && data.settings.campaignSafety.requireOptIn !== false && client.marketingOptIn !== true) return false;
  if (filters.city && !String(client.city || "").toLowerCase().includes(String(filters.city).toLowerCase())) return false;
  if (filters.company && !String(client.company || "").toLowerCase().includes(String(filters.company).toLowerCase())) return false;
  if (filters.tag && !(client.tags || []).some((tag) => String(tag).toLowerCase().includes(String(filters.tag).toLowerCase()))) return false;
  if (filters.document && !String(client.document || "").toLowerCase().includes(String(filters.document).toLowerCase())) return false;
  if (filters.ruc && !String(client.ruc || "").toLowerCase().includes(String(filters.ruc).toLowerCase())) return false;
  if (filters.stage && filters.stage !== "all" && !deals.some((deal) => deal.stage === filters.stage)) return false;
  if (filters.ownerUserId && filters.ownerUserId !== "all" && !deals.some((deal) => deal.ownerUserId === filters.ownerUserId)) return false;
  const purchases = purchaseStatsForClient(client.id, branchId);
  if (Number(filters.minPurchases || 0) > purchases.count) return false;
  if (Number(filters.minPurchaseValue || 0) > purchases.value) return false;
  if (Number(filters.lastPurchaseWithinDays || 0) > 0) {
    if (!purchases.lastAt) return false;
    if (Date.now() - Date.parse(purchases.lastAt) > Number(filters.lastPurchaseWithinDays) * 86400000) return false;
  }
  if (Number(filters.purchaseInactivityDays || 0) > 0) {
    if (!purchases.lastAt) return false;
    if (Date.now() - Date.parse(purchases.lastAt) < Number(filters.purchaseInactivityDays) * 86400000) return false;
  }
  if (Number(filters.lastContactWithinDays || 0) > 0) {
    const latestContact = deals.map((deal) => Date.parse(deal.updatedAt || deal.createdAt || 0)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
    if (!latestContact || Date.now() - latestContact > Number(filters.lastContactWithinDays) * 86400000) return false;
  }
  if (filters.customFieldKey) {
    const value = String(client.customFields?.[filters.customFieldKey] ?? "").toLowerCase();
    if (!value.includes(String(filters.customFieldValue || "").toLowerCase())) return false;
  }
  if (filters.dealCustomFieldKey) {
    const expected = String(filters.dealCustomFieldValue || "").toLowerCase();
    if (!deals.some((deal) => String(deal.customFields?.[filters.dealCustomFieldKey] ?? "").toLowerCase().includes(expected))) return false;
  }
  return true;
}

function clientHadRecentCampaign(clientId, branchId, days) {
  const normalizedDays = Math.max(0, Number(days) || 0);
  if (!normalizedDays) return false;
  const cutoff = Date.now() - normalizedDays * 86400000;
  return (data.campaigns || []).some((campaign) => campaign.branchId === branchId && (campaign.recipients || []).some((recipient) => recipient.clientId === clientId && recipient.sentAt && Date.parse(recipient.sentAt) >= cutoff));
}

function campaignRecipientsFor(filters = {}, branchId) {
  return (data.clients || []).filter((client) => {
    const phone = normalizePhone(client.phone);
    const cooldown = Number(data.settings.campaignSafety.qrClientCooldownDays || 0);
    return /^\d{10,15}$/.test(phone) && !clientHadRecentCampaign(client.id, branchId, cooldown) && clientMatchesCampaignFilters(client, filters, branchId);
  }).map((client) => {
    const deals = (data.deals || []).filter((deal) => deal.clientId === client.id && deal.branchId === branchId).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const purchases = purchaseStatsForClient(client.id, branchId);
    return {
      id: makeId("campaignrecipient"), clientId: client.id, phone: normalizePhone(client.phone), name: client.name || client.phone,
      ownerUserId: deals[0]?.ownerUserId || client.branchOwners?.[branchId]?.userId || null,
      ownerName: deals[0]?.ownerName || client.branchOwners?.[branchId]?.userName || "",
      purchases: purchases.count, purchaseValue: purchases.value, lastPurchaseAt: purchases.lastAt,
      status: "pending", sentAt: null, repliedAt: null, convertedAt: null, messageId: null, dealId: null, error: "",
    };
  });
}


// V21.6 · Estados comerciales medibles + identificación inteligente
const COMMERCIAL_STATUS_CATALOG = Object.freeze([
  { id:"new_inquiry", label:"Consulta nueva", group:"Inicio" },
  { id:"needs_discovery", label:"Relevando necesidad", group:"Calificación" },
  { id:"requirements_confirmed", label:"Necesidad confirmada", group:"Calificación" },
  { id:"quote_preparing", label:"Preparando presupuesto", group:"Presupuesto" },
  { id:"awaiting_quote_approval", label:"Presupuesto enviado · esperando aprobación", group:"Presupuesto" },
  { id:"quote_approved", label:"Presupuesto aprobado", group:"Presupuesto" },
  { id:"negotiating", label:"En negociación / condiciones", group:"Negociación" },
  { id:"awaiting_client_response", label:"Esperando respuesta del cliente", group:"Seguimiento" },
  { id:"payment_pending", label:"Pago pendiente", group:"Pago" },
  { id:"payment_confirmed", label:"Pago confirmado", group:"Pago" },
  { id:"fulfillment", label:"Preparando pedido / servicio", group:"Entrega" },
  { id:"delivery_scheduled", label:"Entrega / prestación programada", group:"Entrega" },
  { id:"delivered", label:"Entregado / servicio realizado", group:"Entrega" },
  { id:"post_sale", label:"Postventa / seguimiento", group:"Postventa" },
  { id:"on_hold", label:"En pausa", group:"Seguimiento" },
  { id:"won", label:"Cierre ganado", group:"Cierre" },
  { id:"lost", label:"Cierre perdido", group:"Cierre" },
]);
function commercialStatusById(id){ return COMMERCIAL_STATUS_CATALOG.find((entry)=>entry.id===id)||COMMERCIAL_STATUS_CATALOG[0]; }
function normalizedCommercialText(value){ return String(value||"").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function inferDealCommercialStatus(deal){
  if(!deal) return {id:"new_inquiry",confidence:60,reason:"Sin negociación."};
  if(deal.stage===STAGES.WON) return {id:"won",confidence:100,reason:"Negociación marcada como ganada."};
  if(deal.stage===STAGES.LOST) return {id:"lost",confidence:100,reason:"Negociación marcada como perdida."};
  const messages=(deal.messages||[]).slice(-24); const all=normalizedCommercialText(messages.map(m=>m.text||"").join(" \n "));
  const last=messages[messages.length-1]||{}; const lastText=normalizedCommercialText(last.text||"");
  const has=(...terms)=>terms.some(t=>all.includes(t)); const lastHas=(...terms)=>terms.some(t=>lastText.includes(t));
  if(has("entregado","entrega realizada","servicio realizado","trabajo realizado","recibido conforme")) return {id:"delivered",confidence:92,reason:"La conversación menciona entrega o servicio realizado."};
  if(has("fecha de entrega","entrega programada","coordinamos la entrega","agendamos la entrega","visita programada","turno confirmado")) return {id:"delivery_scheduled",confidence:90,reason:"Se detectó coordinación de entrega o prestación."};
  if(has("preparando su pedido","preparando el pedido","en preparacion","en proceso de entrega","despacho")) return {id:"fulfillment",confidence:86,reason:"Se detectó preparación o despacho."};
  if(has("pago confirmado","pago acreditado","transferencia recibida","comprobante recibido","ya recibimos el pago")) return {id:"payment_confirmed",confidence:94,reason:"Se detectó confirmación de pago."};
  if(has("pendiente de pago","aguardamos el pago","datos para transferencia","forma de pago","link de pago","factura para abonar")) return {id:"payment_pending",confidence:88,reason:"Se detectó una acción pendiente de pago."};
  if(has("presupuesto aprobado","cotizacion aprobada","cotización aprobada","acepto el presupuesto","aprobamos el presupuesto","confirmo el presupuesto")) return {id:"quote_approved",confidence:94,reason:"El cliente o agente menciona aprobación del presupuesto."};
  const quoteTerms=["presupuesto","cotizacion","cotización","propuesta comercial","oferta comercial"];
  const sentQuote=messages.slice().reverse().find(m=>m.direction==="outgoing" && quoteTerms.some(t=>normalizedCommercialText(m.text||"").includes(t)) && ["envio","envío","adjunto","comparto","presupuesto","cotizacion","cotización"].some(t=>normalizedCommercialText(m.text||"").includes(t)));
  if(sentQuote) return {id:"awaiting_quote_approval",confidence:91,reason:"Se detectó un presupuesto/cotización enviado al cliente."};
  if(has("estamos preparando el presupuesto","prepararemos el presupuesto","armar el presupuesto","cotizando","preparando cotizacion","preparando cotización")) return {id:"quote_preparing",confidence:87,reason:"Se detectó preparación de presupuesto."};
  if(has("descuento","precio final","mejor precio","condiciones comerciales","contraoferta","negociar")) return {id:"negotiating",confidence:82,reason:"Se detectó negociación de precio o condiciones."};
  if(deal.lastDirection==="outgoing" && deal.stage===STAGES.CONTACTED) return {id:"awaiting_client_response",confidence:78,reason:"El último mensaje fue del agente y se espera retorno del cliente."};
  if(has("medida","cantidad","modelo","necesita","necesidad","requerimiento","uso","para cuando","fecha necesita","presupuesto disponible")) return {id:"needs_discovery",confidence:72,reason:"La conversación está relevando la necesidad."};
  if((deal.messages||[]).length>=4) return {id:"requirements_confirmed",confidence:68,reason:"Existe conversación suficiente para considerar la necesidad en proceso de definición."};
  return {id:"new_inquiry",confidence:70,reason:"Consulta en etapa inicial."};
}
function refreshDealCommercialStatus(deal, force=false){
  if(!deal) return deal;
  if(deal.commercialStatusManual===true && !force && ![STAGES.WON,STAGES.LOST].includes(deal.stage)) return deal;
  if(deal.commercialStatusSource==="ai_api" && !force && ![STAGES.WON,STAGES.LOST].includes(deal.stage)) return deal;
  const inferred=inferDealCommercialStatus(deal); const status=commercialStatusById(inferred.id);
  if(deal.commercialStatusId!==status.id || deal.commercialStatusSource!=="ai_local"){
    deal.commercialStatusId=status.id; deal.commercialStatusLabel=status.label; deal.commercialStatusSource="ai_local"; deal.commercialStatusConfidence=inferred.confidence; deal.commercialStatusReason=inferred.reason; deal.commercialStatusUpdatedAt=timestamp();
  } else { deal.commercialStatusConfidence=inferred.confidence; deal.commercialStatusReason=inferred.reason; }
  if([STAGES.WON,STAGES.LOST].includes(deal.stage)) deal.commercialStatusManual=false;
  return deal;
}
async function aiInferDealCommercialStatus(deal){
  const fallback=inferDealCommercialStatus(deal);
  if(!deal || !data.settings.apiKey) return {...fallback,source:"local"};
  const allowed=COMMERCIAL_STATUS_CATALOG.map((entry)=>({id:entry.id,label:entry.label,group:entry.group}));
  const context={
    etapaOperativa:deal.stage,
    estadoActual:deal.commercialStatusId||null,
    items:(deal.items||[]).slice(0,30).map((item)=>({name:item.name,quantity:item.quantity,price:item.price||item.unitPrice||0})),
    mensajes:(deal.messages||[]).slice(-30).map((message)=>({direction:message.direction,text:cleanText(message.text,1800),at:message.at||message.createdAt||null})),
    estadosPermitidos:allowed,
  };
  try{
    const out=await requestOpenAiText({
      instructions:"Clasificá el momento comercial actual de una negociación CRM usando SOLO la evidencia dada. Elegí exactamente un statusId de estadosPermitidos. Priorizá el evento más reciente y no inventes hechos. Si se envió presupuesto/cotización y todavía no hay aprobación, usá awaiting_quote_approval. Devolvé SOLO JSON válido con statusId, confidence (0-100) y reason breve.",
      input:context,maxOutputTokens:300,json:true,
    });
    const parsed=out.json||{};
    const status=COMMERCIAL_STATUS_CATALOG.find((entry)=>entry.id===parsed.statusId);
    if(!status) return {...fallback,source:"local"};
    return {id:status.id,confidence:Math.max(0,Math.min(100,Number(parsed.confidence)||85)),reason:cleanText(parsed.reason,400)||"Estado identificado por IA.",source:"ai"};
  }catch(error){
    addLog(`Estado comercial IA: ${cleanText(error.message,260)}`,"warning");
    return {...fallback,source:"local",aiError:cleanText(error.message,400)};
  }
}
function applyCommercialStatusInference(deal,inferred,source="ai"){
  const status=commercialStatusById(inferred?.id);
  deal.commercialStatusId=status.id;deal.commercialStatusLabel=status.label;deal.commercialStatusSource=source;deal.commercialStatusManual=false;deal.commercialStatusConfidence=Math.max(0,Math.min(100,Number(inferred?.confidence)||0));deal.commercialStatusReason=cleanText(inferred?.reason,400)||"Estado identificado automáticamente.";deal.commercialStatusUpdatedAt=timestamp();
  return deal;
}
function commercialStatusDistribution(deals=[]){
  const counts=new Map(COMMERCIAL_STATUS_CATALOG.map(s=>[s.id,0]));
  for(const deal of deals){refreshDealCommercialStatus(deal);counts.set(deal.commercialStatusId,(counts.get(deal.commercialStatusId)||0)+1);}
  return COMMERCIAL_STATUS_CATALOG.map(s=>({...s,count:counts.get(s.id)||0})).filter(s=>s.count>0);
}

// V21.6 · Formularios (compatibilidad interna V21.5) + orquestador central de comunicaciones aisladas
function recordCommunicationEvent(input = {}) {
  const event = {
    id: makeId("commevent"), type: cleanText(input.type, 80) || "communication", purpose: cleanText(input.purpose, 80) || "general",
    direction: ["in","out"].includes(input.direction) ? input.direction : "out", phone: normalizePhone(input.phone || ""),
    clientId: input.clientId || null, branchId: input.branchId || null, lineId: input.lineId || null,
    entityType: cleanText(input.entityType, 80) || null, entityId: input.entityId || null, sessionId: input.sessionId || null,
    text: cleanText(input.text, 4000), isolated: input.isolated !== false, createdAt: timestamp(), metadata: input.metadata && typeof input.metadata === "object" ? sanitizeAuditValue(input.metadata) : {},
  };
  data.communicationEvents.unshift(event);
  if (data.communicationEvents.length > 5000) data.communicationEvents.length = 5000;
  return event;
}

function sanitizeSurveyOption(option = {}, index = 0) {
  const label = cleanText(option.label ?? option.value, 240);
  return { id: cleanText(option.id, 120) || `o${index + 1}`, label, value: cleanText(option.value ?? label, 240) || label, nextQuestionId: cleanText(option.nextQuestionId, 120) || "" };
}

function sanitizeSurveyQuestion(question = {}, index = 0) {
  const type = ["text","longtext","options","yesno","rating","number","email","date"].includes(question.type) ? question.type : "text";
  let options = Array.isArray(question.options) ? question.options.map(sanitizeSurveyOption).filter((entry)=>entry.label) : [];
  if (type === "yesno" && !options.length) options = [
    { id:"yes", label:"Sí", value:"si", nextQuestionId:"" }, { id:"no", label:"No", value:"no", nextQuestionId:"" }
  ];
  return { id: cleanText(question.id, 120) || `q${index + 1}`, text: cleanText(question.text, 1200), type, required: question.required !== false, options: options.slice(0,30), defaultNextQuestionId: cleanText(question.defaultNextQuestionId,120) || "" };
}

function sanitizeSurveyDefinition(input = {}, existing = null) {
  const sourceQuestions = Array.isArray(input.questions) ? input.questions : (existing?.questions || []);
  const questions = sourceQuestions.map(sanitizeSurveyQuestion).filter((question)=>question.text).slice(0,60);
  if (!questions.length) throw new Error("Agregá al menos una pregunta al formulario.");
  const ids = new Set();
  questions.forEach((question,index)=>{ let id=question.id||`q${index+1}`; if(ids.has(id)) id=`q${index+1}`; question.id=id; ids.add(id); });
  for (const question of questions) {
    if (question.defaultNextQuestionId && question.defaultNextQuestionId !== "end" && !ids.has(question.defaultNextQuestionId)) question.defaultNextQuestionId = "";
    for (const option of question.options) if (option.nextQuestionId && option.nextQuestionId !== "end" && !ids.has(option.nextQuestionId)) option.nextQuestionId = "";
  }
  const triggerInput = input.trigger && typeof input.trigger === "object" ? input.trigger : (existing?.trigger || {});
  const triggerType = ["manual","after_won","segment","scheduled","after_status"].includes(triggerInput.type) ? triggerInput.type : "manual";
  const branchId = cleanText(input.branchId ?? existing?.branchId,120) || primaryBranchId();
  const lineId = cleanText(input.lineId ?? existing?.lineId,160) || defaultWhatsappLine(branchId)?.id || null;
  return {
    ...(existing || {}), name: cleanText(input.name ?? existing?.name,160), description: cleanText(input.description ?? existing?.description,1000),
    branchId, lineId,
    deliveryMode: ["web_link","whatsapp_chat"].includes(input.deliveryMode) ? input.deliveryMode : (existing?.deliveryMode || "web_link"),
    introMessage: cleanText(input.introMessage ?? existing?.introMessage,2000) || "Necesitamos algunos datos para continuar. El formulario es breve y tus respuestas quedarán registradas en el CRM.",
    closingMessage: cleanText(input.closingMessage ?? existing?.closingMessage,2000) || "¡Muchas gracias! Tus respuestas quedaron registradas correctamente.",
    trigger: {
      type: triggerType,
      delayMinutes: Math.max(0,Math.min(525600,Number(triggerInput.delayMinutes)||0)),
      scheduledAt: cleanText(triggerInput.scheduledAt,80)||null,
      commercialStatusId: COMMERCIAL_STATUS_CATALOG.some((entry)=>entry.id===triggerInput.commercialStatusId)?triggerInput.commercialStatusId:null,
      scheduledExecutedAt: triggerType === "scheduled" && cleanText(triggerInput.scheduledAt,80) && cleanText(triggerInput.scheduledAt,80) === cleanText(existing?.trigger?.scheduledAt,80)
        ? (existing?.trigger?.scheduledExecutedAt || null)
        : null,
    },
    filters: input.filters && typeof input.filters === "object" ? sanitizeAuditValue(input.filters) : (existing?.filters || {}),
    active: input.active !== undefined ? input.active !== false : existing?.active !== false,
    questions, updatedAt: timestamp(),
  };
}

function clientMatchesSurveyFilters(client, filters = {}, branchId) {
  if (!client) return false;
  const deals=(data.deals||[]).filter((deal)=>deal.clientId===client.id && (!branchId||deal.branchId===branchId));
  const belongsToBranch = !branchId || deals.length > 0 || (client.branchRelationships||[]).some((entry)=>entry.branchId===branchId&&entry.active!==false) || Boolean(client.branchOwners?.[branchId]);
  if (!belongsToBranch) return false;
  if (filters.city && !String(client.city||"").toLowerCase().includes(String(filters.city).toLowerCase())) return false;
  if (filters.company && !String(client.company||"").toLowerCase().includes(String(filters.company).toLowerCase())) return false;
  if (filters.tag && !(client.tags||[]).some((tag)=>String(tag).toLowerCase().includes(String(filters.tag).toLowerCase()))) return false;
  if (filters.stage && filters.stage !== "all" && !deals.some((deal)=>deal.stage===filters.stage)) return false;
  const purchases=purchaseStatsForClient(client.id,branchId);
  if (Number(filters.minPurchases||0)>purchases.count) return false;
  if (Number(filters.minPurchaseValue||0)>purchases.value) return false;
  if (filters.marketingOptIn === true && client.marketingOptIn !== true) return false;
  return /^\d{10,15}$/.test(normalizePhone(client.phone));
}

function surveyRecipientsFor(filters = {}, branchId) {
  return (data.clients||[]).filter((client)=>clientMatchesSurveyFilters(client,filters,branchId));
}

function surveyMetrics(survey) {
  const sessions=(data.surveySessions||[]).filter((entry)=>entry.surveyId===survey.id);
  const completed=sessions.filter((entry)=>entry.status==="completed");
  const active=sessions.filter((entry)=>["queued","awaiting"].includes(entry.status));
  return { total:sessions.length, completed:completed.length, active:active.length, cancelled:sessions.filter((entry)=>entry.status==="cancelled").length, completionRate:sessions.length?Number(((completed.length/sessions.length)*100).toFixed(1)):0 };
}

function publicSurvey(survey, includeQuestions = true) {
  const line=whatsappLineById(survey?.lineId)||defaultWhatsappLine(survey?.branchId);
  const result={...survey,lineId:line?.id||survey?.lineId||null,lineName:line?.name||"",metrics:surveyMetrics(survey)};
  if(!includeQuestions) delete result.questions;
  return result;
}

function surveyQuestionById(survey,id){ return (survey?.questions||[]).find((question)=>question.id===id)||null; }
function surveyQuestionIndex(survey,id){ return (survey?.questions||[]).findIndex((question)=>question.id===id); }
function surveyNextSequential(survey,id){ const index=surveyQuestionIndex(survey,id); return index>=0 ? survey.questions[index+1]?.id || "end" : "end"; }
function surveyPrompt(question){
  let text=question?.text||"";
  if(question?.type==="options") text += "\n"+(question.options||[]).map((option,index)=>`${index+1}. ${option.label}`).join("\n");
  else if(question?.type==="yesno") text += "\nRespondé Sí o No.";
  else if(question?.type==="rating") text += "\nRespondé con un número del 1 al 10.";
  else if(question?.type==="number") text += "\nRespondé con un número.";
  else if(question?.type==="email") text += "\nRespondé con tu correo electrónico.";
  else if(question?.type==="date") text += "\nRespondé con una fecha.";
  return cleanText(text,4000);
}
function normalizeAnswerText(value){ return String(value||"").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function parseSurveyAnswer(question,text){
  const raw=cleanText(text,2000).trim(); if(!raw) return {ok:false,error:"Necesito una respuesta para continuar."};
  if(["text","longtext"].includes(question.type)) return {ok:true,value:raw,label:raw,nextQuestionId:question.defaultNextQuestionId||""};
  if(question.type==="number") { const normalizedNumber=raw.includes(",") ? raw.replace(/\./g,"").replace(",",".") : raw; const n=Number(normalizedNumber); if(!Number.isFinite(n)) return {ok:false,error:"Respondé con un número válido."}; return {ok:true,value:n,label:String(n),nextQuestionId:question.defaultNextQuestionId||""}; }
  if(question.type==="email") { if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return {ok:false,error:"Ingresá un correo electrónico válido."}; return {ok:true,value:raw,label:raw,nextQuestionId:question.defaultNextQuestionId||""}; }
  if(question.type==="date") {
    let parsed=Date.parse(raw);
    const localDate=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(localDate){
      const day=Number(localDate[1]), month=Number(localDate[2]), year=Number(localDate[3]);
      const candidate=new Date(Date.UTC(year,month-1,day));
      parsed=(candidate.getUTCFullYear()===year&&candidate.getUTCMonth()===month-1&&candidate.getUTCDate()===day)?candidate.getTime():NaN;
    }
    if(!Number.isFinite(parsed)) return {ok:false,error:"Ingresá una fecha válida, por ejemplo 25/08/2026."};
    return {ok:true,value:raw,label:raw,nextQuestionId:question.defaultNextQuestionId||""};
  }
  if(question.type==="rating") { const n=Number(raw.replace(",",".")); if(!Number.isFinite(n)||n<1||n>10) return {ok:false,error:"Respondé con un número del 1 al 10."}; return {ok:true,value:n,label:String(n),nextQuestionId:question.defaultNextQuestionId||""}; }
  const normalized=normalizeAnswerText(raw);
  let option=null;
  const number=Number.parseInt(normalized,10);
  if(Number.isFinite(number)&&number>=1&&number<=(question.options||[]).length) option=question.options[number-1];
  if(!option) option=(question.options||[]).find((entry)=>[normalizeAnswerText(entry.label),normalizeAnswerText(entry.value)].includes(normalized));
  if(question.type==="yesno"&&!option){ const yes=["si","s","yes","ok","claro"], no=["no","n"]; option=(question.options||[]).find((entry)=> yes.includes(normalized)?normalizeAnswerText(entry.value)==="si":no.includes(normalized)?normalizeAnswerText(entry.value)==="no":false); }
  if(!option) return {ok:false,error:question.type==="yesno"?"Respondé Sí o No.":"Elegí una de las opciones indicadas."};
  return {ok:true,value:option.value,label:option.label,nextQuestionId:option.nextQuestionId||question.defaultNextQuestionId||""};
}

async function sendIsolatedText({phone,branchId,lineId,text,purpose,entityType,entityId,sessionId,clientId}) {
  const normalized=normalizePhone(phone); if(!/^\d{10,15}$/.test(normalized)) throw new Error("Número de cliente inválido.");
  const line=whatsappLineById(lineId)||defaultWhatsappLine(branchId); if(!line||line.active===false) throw new Error("No hay una línea de WhatsApp disponible.");
  const transport={ jid:`${normalized}@s.whatsapp.net`, phone:normalized, branchId:branchId||line.branchId, lineId:line.id };
  const messageId=await sendProviderText(transport,cleanText(text,4000)); rememberSeen(messageId);
  recordCommunicationEvent({type:`${purpose}_message`,purpose,direction:"out",phone:normalized,clientId,branchId:transport.branchId,lineId:line.id,entityType,entityId,sessionId,text,isolated:true,metadata:{messageId}});
  return messageId;
}

function createSurveySession(survey,client,source={}) {
  const first=survey.questions?.[0]; if(!first) throw new Error("El formulario no tiene preguntas.");
  const existing=(data.surveySessions||[]).find((entry)=>entry.surveyId===survey.id&&entry.clientId===client.id&&source.sourceDealId&&entry.sourceDealId===source.sourceDealId);
  if(existing) return existing;
  const session={ id:makeId("surveysession"), publicToken:randomBytes(24).toString("hex"), publicBaseUrl:cleanText(source.publicBaseUrl,1000)||null, surveyId:survey.id, surveyName:survey.name, clientId:client.id, clientName:client.name||client.phone, phone:normalizePhone(client.phone), branchId:survey.branchId, lineId:survey.lineId, status:"queued", currentQuestionId:first.id, answers:[], sourceType:source.sourceType||"manual", sourceDealId:source.sourceDealId||null, createdAt:timestamp(), startedAt:null, completedAt:null, cancelledAt:null, updatedAt:timestamp(), lastMessageId:null };
  data.surveySessions.unshift(session); if(data.surveySessions.length>10000)data.surveySessions.length=10000; return session;
}

function activeSurveySession(phone,lineId=null){ const normalized=normalizePhone(phone); return (data.surveySessions||[]).filter((entry)=>entry.status==="awaiting"&&normalizePhone(entry.phone)===normalized&&(!lineId||!entry.lineId||entry.lineId===lineId)).sort((a,b)=>String(b.updatedAt||b.startedAt).localeCompare(String(a.updatedAt||a.startedAt)))[0]||null; }

function publicFormPath(session){ return `/t/${tenantSlug}/form/${session.publicToken}`; }
function publicFormUrl(session){ const base=String(session?.publicBaseUrl||publicBaseUrl||"").replace(/\/$/,""); return `${base}${publicFormPath(session)}`; }
async function startSurveySession(session) {
  const survey=(data.surveys||[]).find((entry)=>entry.id===session.surveyId); if(!survey||survey.active===false){session.status="cancelled";session.cancelledAt=timestamp();return false;}
  if(activeSurveySession(session.phone,session.lineId)) return false;
  const question=surveyQuestionById(survey,session.currentQuestionId)||survey.questions?.[0]; if(!question)return false;
  if((survey.deliveryMode||"web_link")==="web_link"){
    const link=publicFormUrl(session); const intro=survey.introMessage?`${survey.introMessage}

Completá el formulario aquí: ${link}`:`Completá el formulario aquí: ${link}`;
    session.lastMessageId=await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:intro,purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId});
    session.status="awaiting"; session.startedAt=session.startedAt||timestamp(); session.updatedAt=timestamp(); return true;
  }
  if(survey.introMessage) await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:survey.introMessage,purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId});
  session.lastMessageId=await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:surveyPrompt(question),purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId});
  session.status="awaiting"; session.startedAt=session.startedAt||timestamp(); session.updatedAt=timestamp(); return true;
}

async function completeSurveySession(session,survey){ session.status="completed";session.completedAt=timestamp();session.updatedAt=timestamp(); if(survey.closingMessage)session.lastMessageId=await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:survey.closingMessage,purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId}); }

async function tryConsumeSurveyResponse({phone,text,lineId=null,branchId=null,messageId=null}) {
  const session=activeSurveySession(phone,lineId); if(!session)return false;
  const survey=(data.surveys||[]).find((entry)=>entry.id===session.surveyId); if(!survey){session.status="cancelled";session.cancelledAt=timestamp();return true;}
  const normalized=normalizeAnswerText(text);
  if((data.settings.communicationOrchestrator?.surveyCancelWords||[]).some((word)=>normalizeAnswerText(word)===normalized)){ session.status="cancelled";session.cancelledAt=timestamp();session.updatedAt=timestamp();recordCommunicationEvent({type:"survey_cancelled",purpose:"survey",direction:"in",phone,clientId:session.clientId,branchId:branchId||session.branchId,lineId:lineId||session.lineId,entityType:"survey",entityId:survey.id,sessionId:session.id,text,isolated:true});await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:"Formulario finalizado. Gracias por tu tiempo.",purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId});return true; }
  const question=surveyQuestionById(survey,session.currentQuestionId); if(!question){await completeSurveySession(session,survey);return true;}
  const parsed=parseSurveyAnswer(question,text);
  recordCommunicationEvent({type:"survey_reply",purpose:"survey",direction:"in",phone,clientId:session.clientId,branchId:branchId||session.branchId,lineId:lineId||session.lineId,entityType:"survey",entityId:survey.id,sessionId:session.id,text,isolated:true,metadata:{messageId,questionId:question.id,valid:parsed.ok}});
  if(!parsed.ok){ session.lastMessageId=await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:parsed.error,purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId});session.updatedAt=timestamp();return true; }
  session.answers.push({questionId:question.id,questionText:question.text,type:question.type,value:parsed.value,label:parsed.label,answeredAt:timestamp()});
  const nextId=parsed.nextQuestionId||surveyNextSequential(survey,question.id); session.updatedAt=timestamp();
  if(!nextId||nextId==="end"){await completeSurveySession(session,survey);return true;}
  const next=surveyQuestionById(survey,nextId); if(!next){await completeSurveySession(session,survey);return true;}
  session.currentQuestionId=next.id; session.lastMessageId=await sendIsolatedText({phone:session.phone,branchId:session.branchId,lineId:session.lineId,text:surveyPrompt(next),purpose:"survey",entityType:"survey",entityId:survey.id,sessionId:session.id,clientId:session.clientId}); return true;
}

function latestCampaignTarget(phone){ const normalized=normalizePhone(phone);let latest=null;for(const campaign of data.campaigns||[])for(const recipient of campaign.recipients||[]){if(recipient.status!=="sent"||recipient.repliedAt||normalizePhone(recipient.phone)!==normalized)continue;const sentAt=Date.parse(recipient.sentAt||0);if(!sentAt||Date.now()-sentAt>14*86400000)continue;if(!latest||sentAt>latest.sentAt)latest={campaign,recipient,sentAt};}return latest; }
function campaignOptOutText(text){const n=normalizeAnswerText(text);return ["stop","baja","cancelar","no promociones","no publicidad"].includes(n)||/(no quiero recibir|dame de baja|darme de baja|no me envien|no me manden)/i.test(n);}
async function tryConsumeCampaignResponse({phone,text,lineId=null,branchId=null,messageId=null}) {
  if(data.settings.communicationOrchestrator?.campaignIsolation===false)return false;
  const target=latestCampaignTarget(phone); if(!target)return false;
  const {campaign,recipient}=target; recipient.repliedAt=recipient.repliedAt||timestamp();recipient.replyText=cleanText(text,2000);recipient.replyMessageId=messageId||null;
  const client=findClient(data,recipient.clientId); if(client&&campaignOptOutText(text)){client.marketingOptIn=false;client.marketingOptInAt=null;client.updatedAt=timestamp();}
  recordCommunicationEvent({type:"campaign_reply",purpose:"campaign",direction:"in",phone,clientId:recipient.clientId,branchId:branchId||campaign.branchId,lineId:lineId||campaign.lineId,entityType:"campaign",entityId:campaign.id,text,isolated:true,metadata:{messageId,recipientId:recipient.id}});return true;
}

async function tryConsumeIsolatedCommunication(input={}) {
  if(data.settings.communicationOrchestrator?.surveyIsolation!==false){ const handled=await tryConsumeSurveyResponse(input); if(handled)return {consumed:data.settings.communicationOrchestrator?.surveyRepliesTriggerCrm!==true,type:"survey"}; }
  const campaignHandled=await tryConsumeCampaignResponse(input); if(campaignHandled)return {consumed:data.settings.communicationOrchestrator?.campaignRepliesTriggerCrm!==true,type:"campaign"};
  return {consumed:false,type:null};
}

let surveyAutomationRunning=false;
async function runSurveyAutomation(){
  if(surveyAutomationRunning)return; surveyAutomationRunning=true;
  try{
    const now=Date.now();
    for(const survey of data.surveys||[]){
      if(survey.active===false)continue;
      const type=survey.trigger?.type||"manual"; const delayMs=Math.max(0,Number(survey.trigger?.delayMinutes)||0)*60000;
      if(type==="after_won"){
        for(const deal of (data.deals||[]).filter((entry)=>entry.stage===STAGES.WON&&entry.branchId===survey.branchId)){
          const at=Date.parse(deal.outcomeAt||deal.updatedAt||deal.createdAt||0); if(!at||now-at<delayMs)continue;
          const client=findClient(data,deal.clientId); if(!client||!clientMatchesSurveyFilters(client,survey.filters||{},survey.branchId))continue;
          if((data.surveySessions||[]).some((entry)=>entry.surveyId===survey.id&&entry.sourceDealId===deal.id))continue;
          createSurveySession(survey,client,{sourceType:"after_won",sourceDealId:deal.id});
        }
      } else if(type==="after_status" && survey.trigger?.commercialStatusId){
        for(const deal of (data.deals||[]).filter((entry)=>entry.branchId===survey.branchId)){
          refreshDealCommercialStatus(deal); if(deal.commercialStatusId!==survey.trigger.commercialStatusId)continue;
          const at=Date.parse(deal.commercialStatusUpdatedAt||deal.updatedAt||deal.createdAt||0); if(!at||now-at<delayMs)continue;
          const client=findClient(data,deal.clientId); if(!client||!clientMatchesSurveyFilters(client,survey.filters||{},survey.branchId))continue;
          if((data.surveySessions||[]).some((entry)=>entry.surveyId===survey.id&&entry.sourceDealId===deal.id))continue;
          createSurveySession(survey,client,{sourceType:"after_status",sourceDealId:deal.id});
        }
      } else if(type==="scheduled" && survey.trigger?.scheduledAt && Date.parse(survey.trigger.scheduledAt)<=now && !survey.trigger.scheduledExecutedAt){
        const clients=surveyRecipientsFor(survey.filters||{},survey.branchId);
        for(const client of clients){ if((data.surveySessions||[]).some((entry)=>entry.surveyId===survey.id&&entry.clientId===client.id))continue; createSurveySession(survey,client,{sourceType:"scheduled"}); }
        survey.trigger.scheduledExecutedAt=timestamp(); survey.updatedAt=timestamp();
      }
    }
    const queued=(data.surveySessions||[]).filter((entry)=>entry.status==="queued").slice(0,3); for(const session of queued)await startSurveySession(session); if(queued.length)await store.save();
  }catch(error){console.error("[forms]",error?.message||error);}finally{surveyAutomationRunning=false;}
}

function renderCampaignText(template, client, campaign, recipient) {
  const branch = getBranch(campaign.branchId) || {};
  let text = String(template || "");
  const vars = {
    cliente: client?.name || recipient?.name || "cliente",
    telefono: client?.phone || recipient?.phone || "",
    documento: client?.document || "",
    ruc: client?.ruc || "",
    empresa: client?.company || "",
    ciudad: client?.city || "",
    sucursal: branch.name || "",
    responsable: recipient?.ownerName || "",
  };
  for (const [key, value] of Object.entries(vars)) text = text.replaceAll(`{${key}}`, String(value || "")).replaceAll(`{{${key}}}`, String(value || ""));
  for (const field of data.customFieldDefinitions || []) if (field.entity === "contact") text = text.replaceAll(`{{${field.key}}}`, String(client?.customFields?.[field.key] ?? ""));
  return cleanText(text, 4000);
}

function campaignAttachmentInfo(document, caption = "") {
  if (!document) return null;
  const mimeType = document.mimeType || "application/octet-stream";
  const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "document";
  return { kind, mimeType, fileName: document.fileName || document.title || "archivo", caption: cleanText(caption, 1000), ptt: false };
}

function qrMessagesSentToday(branchId, lineId = null) {
  const today = paraguayDateKey();
  return (data.campaigns || []).filter((campaign) => campaign.branchId === branchId && (!lineId || (campaign.lineId||defaultWhatsappLine(campaign.branchId)?.id)===lineId)).flatMap((campaign) => campaign.recipients || []).filter((recipient) => recipient.status === "sent" && recipient.sentAt && paraguayDateKey(Date.parse(recipient.sentAt)) === today).length;
}

async function sendCampaignRecipient(campaign, recipient) {
  const client=findClient(data,recipient.clientId);if(!client)throw new Error("Cliente no encontrado.");
  if(data.settings.campaignSafety.requireOptIn!==false&&client.marketingOptIn!==true)throw new Error("El cliente no tiene consentimiento comercial registrado.");
  const phone=normalizePhone(recipient.phone),jid=`${phone}@s.whatsapp.net`;const line=whatsappLineById(campaign.lineId)||defaultWhatsappLine(campaign.branchId);if(!line||line.active===false)throw new Error("La línea de WhatsApp de la campaña no está disponible.");
  const transport={jid,phone,branchId:campaign.branchId,lineId:line.id};const text=renderCampaignText(campaign.message,client,campaign,recipient);const document=campaign.documentId?assistantDocumentById(campaign.documentId):null;let messageId;
  if(document){const filePath=assistantDocumentFile(document);if(!filePath||!existsSync(filePath))throw new Error("El archivo adjunto de la campaña ya no está disponible.");const buffer=await readFile(filePath);const info=campaignAttachmentInfo(document,text);messageId=await sendProviderMedia(transport,buffer,info);}else messageId=await sendProviderText(transport,text);
  rememberSeen(messageId);recipient.status="sent";recipient.sentAt=timestamp();recipient.messageId=messageId;recipient.dealId=null;recipient.error="";campaign.sentCount=Number(campaign.sentCount||0)+1;
  recordCommunicationEvent({type:"campaign_message",purpose:"campaign",direction:"out",phone,clientId:client.id,branchId:campaign.branchId,lineId:line.id,entityType:"campaign",entityId:campaign.id,text,isolated:true,metadata:{messageId,recipientId:recipient.id}});
  recordAuditEvent(null,"campana_mensaje_enviado",{campaignId:campaign.id,campaignName:campaign.name,clientId:client.id,clientName:client.name,clientPhone:client.phone,isolatedFromCrm:true},campaign.branchId,"campaign");
}

function paraguayHour(value = Date.now()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Asuncion", hour: "2-digit", hourCycle: "h23" }).format(new Date(value)));
}

async function runCampaign(campaignId) {
  if (campaignRunners.has(campaignId)) return;
  const campaign = (data.campaigns || []).find((entry) => entry.id === campaignId);
  if (!campaign) return;
  campaignRunners.set(campaignId, true);
  try {
    campaign.status = "running"; campaign.startedAt = campaign.startedAt || timestamp(); campaign.updatedAt = timestamp(); await store.save();
    while (campaign.status === "running") {
      const recipient = (campaign.recipients || []).find((entry) => ["pending", "queued"].includes(entry.status));
      if (!recipient) { campaign.status = "completed"; campaign.completedAt = timestamp(); break; }
      const line=whatsappLineById(campaign.lineId)||defaultWhatsappLine(campaign.branchId);
      if(!line){campaign.status="paused";campaign.pauseReason="La campaña no tiene una línea de WhatsApp válida.";break;}
      const lineConnection=whatsappLineConnectionState(line.id);
      if(lineConnection.status!=="connected"){campaign.status="paused";campaign.pauseReason=`WhatsApp ${line.name} no está conectado.`;break;}
      const qrMode = line.provider !== "cloud";
      if (qrMode) {
        const hour = paraguayHour();
        const startHour = Number(data.settings.campaignSafety.qrStartHour ?? 8);
        const endHour = Number(data.settings.campaignSafety.qrEndHour ?? 19);
        if (hour < startHour || hour >= endHour) { campaign.status = "paused"; campaign.pauseReason = `Fuera del horario configurado para campañas QR (${startHour}:00–${endHour}:00).`; break; }
        if (data.settings.campaignSafety.qrEnabled === false) { campaign.status = "paused"; campaign.pauseReason = "Las campañas por QR están desactivadas."; break; }
        if (qrMessagesSentToday(campaign.branchId, line.id) >= Number(data.settings.campaignSafety.qrDailyLimitPerBranch || 25)) { campaign.status = "paused"; campaign.pauseReason = "Se alcanzó el límite diario conservador configurado para WhatsApp QR."; break; }
      }
      try { await sendCampaignRecipient(campaign, recipient); }
      catch (error) {
        recipient.status = "failed"; recipient.error = cleanText(error?.message || error, 500); recipient.failedAt = timestamp(); campaign.failedCount = Number(campaign.failedCount || 0) + 1;
        if (data.settings.campaignSafety.stopOnProviderError !== false && /conect|429|bloque|restric|forbidden|unauthor/i.test(recipient.error)) { campaign.status = "paused"; campaign.pauseReason = recipient.error; }
      }
      campaign.updatedAt = timestamp(); await store.save();
      if (campaign.status !== "running") break;
      const waitSeconds = mockMode ? 0.05 : (qrMode ? Number(data.settings.campaignSafety.qrIntervalSeconds || 90) : Number(data.settings.campaignSafety.apiIntervalSeconds || 3));
      await new Promise((resolve) => setTimeout(resolve, Math.max(50, waitSeconds * 1000)));
    }
    campaign.updatedAt = timestamp(); await store.save();
  } finally { campaignRunners.delete(campaignId); }
}

function markCampaignConversion(clientId, dealId) {
  const now = timestamp();
  let latest = null;
  for (const campaign of data.campaigns || []) {
    for (const recipient of campaign.recipients || []) {
      if (recipient.clientId !== clientId || !recipient.sentAt || recipient.convertedAt) continue;
      const sentAt = Date.parse(recipient.sentAt);
      if (!sentAt || Date.now() - sentAt > 30 * 24 * 60 * 60 * 1000) continue;
      if (!latest || sentAt > latest.sentAt) latest = { recipient, sentAt };
    }
  }
  if (latest) { latest.recipient.convertedAt = now; latest.recipient.convertedDealId = dealId; }
}

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self' ws: wss:; object-src 'none'",
  );
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(origin, request)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, request)) return response.sendStatus(403);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return response.sendStatus(204);
  }
  if (origin && !isAllowedOrigin(origin, request)) return response.sendStatus(403);
  return next();
});
const jsonParser = express.json({ limit: "128kb" });
app.use((request, response, next) => {
  if (
    request.method === "POST" &&
    (/^\/api\/deals\/[^/]+\/media$/.test(request.path) || request.path === "/api/assistant/documents")
  ) {
    return next();
  }
  return jsonParser(request, response, next);
});

app.use(express.static(publicDirectory, { extensions: ["html"] }));
const MODULE_API_RULES = [
  [/^\/api\/surveys(?:\/|$)/, "forms"], [/^\/api\/forms(?:\/|$)/, "forms"], [/^\/api\/campaign/, "campaigns"], [/^\/api\/whatsapp-lines(?:\/|$)/, "whatsapp"], [/^\/api\/news(?:\/|$)/, "news"],
  [/^\/api\/products(?:\/|$)/, "stock"], [/^\/api\/branches(?:\/|$)/, "branches"],
  [/^\/api\/reports(?:\/|$)/, "reports"], [/^\/api\/quick-replies(?:\/|$)/, "replies"],
  [/^\/api\/assistant\/documents(?:\/|$)/, "documents"], [/^\/api\/tasks(?:\/|$)/, "tasks"],
  [/^\/api\/objectives(?:\/|$)/, "objectives"], [/^\/api\/approvals(?:\/|$)/, "approvals"],
];
app.use((request,response,next)=>{
  if(!request.path.startsWith("/api/") || request.path.startsWith("/api/platform/") || request.path==="/api/state" || request.path.startsWith("/api/auth/") || request.path==="/api/health") return next();
  if(!currentUser(request)) return next();
  const rule=MODULE_API_RULES.find(([pattern])=>pattern.test(request.path));
  if(rule && !moduleEnabled(rule[1])) return response.status(403).json({error:`El módulo ${rule[1]} está desactivado por administración.`});
  return next();
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, mockMode });
});

app.get("/api/auth/status", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const user = currentUser(request);
  response.json({ authenticated: Boolean(user), user: user ? { id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId || null, branchName: getBranch(user.branchId)?.name || "Administración general", permissions: { ...reportPermissions(user) } } : null });
});

app.post("/api/auth/login", (request, response) => {
  const username = cleanText(request.body?.username, 80).toLowerCase();
  const password = String(request.body?.password || "");
  const user = data.users.find((entry) => entry.username.toLowerCase() === username && entry.active !== false);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return response.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 12 * 60 * 60 * 1000, lastSeenAt: Date.now() });
  response.setHeader(
    "Set-Cookie",
    `whatsbot_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
  );
  recordAuditEvent(user, "inicio_sesion", { username: user.username }, user.branchId || primaryBranchId());
  void store.save();
  return response.json({ authenticated: true, user: { id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId || null, branchName: getBranch(user.branchId)?.name || "Administración general", permissions: { ...reportPermissions(user) } } });
});

app.post("/api/auth/logout", (request, response) => {
  const user = currentUser(request);
  if (user?.role === "agent") {
    user.attendance = { ...(user.attendance || {}), status: "offline", reason: "Sesión cerrada", until: null, updatedAt: timestamp() };
    data.attendanceEvents.unshift({ id: makeId("attendance"), userId: user.id, userName: user.name, branchId: user.branchId || null, status: "offline", reason: "Sesión cerrada", at: timestamp() });
    data.attendanceEvents.splice(20000);
    void store.save();
  }
  sessions.delete(cookieValue(request, "whatsbot_session"));
  response.setHeader(
    "Set-Cookie",
    "whatsbot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  response.json({ authenticated: false });
});

app.get("/api/whatsapp/webhook", (request, response) => {
  const mode = request.query["hub.mode"];
  const token = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];
  const validTokens=[data.settings.whatsappApi?.verifyToken,...(data.whatsappLines||[]).filter(line=>line.active!==false&&line.provider==="cloud").map(line=>lineCloudConfig(line)?.verifyToken)].filter(Boolean);
  if (mode === "subscribe" && token && validTokens.includes(token)) return response.status(200).send(String(challenge || ""));
  return response.sendStatus(403);
});

app.post("/api/whatsapp/webhook", (request, response) => {
  response.sendStatus(200);
  void processCloudWebhook(request.body).catch((error) => console.error("[cloud webhook]", error?.message || error));
});

app.get("/api/mobile/access", async (_request, response) => {
  const urls = lanAddresses();
  const entries = await Promise.all(urls.map(async (url) => ({
    url,
    qr: await QRCode.toDataURL(url, { margin: 1, width: 280 }),
  })));
  response.json({ entries, port, note: "Conectá el teléfono a la misma red Wi-Fi." });
});

app.get("/api/branding/public", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(brandingResponse());
});

app.get("/api/branding/logo", (_request, response) => {
  const fileName = path.basename(data.settings.branding?.logoFileName || "");
  if (!fileName) return response.sendStatus(404);
  const ext = path.extname(fileName).toLowerCase();
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext] || "application/octet-stream";
  response.setHeader("Content-Type", mime);
  response.setHeader("Cache-Control", "no-store");
  return response.sendFile(path.join(dataDirectory, "branding", fileName));
});

function publicFormSession(token){ return (data.surveySessions||[]).find((entry)=>entry.publicToken===token)||null; }
function publicFormPayload(session){
  const survey=(data.surveys||[]).find((entry)=>entry.id===session?.surveyId); if(!session||!survey)return null;
  const q=surveyQuestionById(survey,session.currentQuestionId)||survey.questions?.[0]||null;
  return { company:{name:data.settings.branding?.systemName||"CRM",primaryColor:data.settings.branding?.primaryColor||"#171717",accentColor:data.settings.branding?.accentColor||"#ff7a00"}, form:{name:survey.name,description:survey.description||"",closingMessage:survey.closingMessage||"Gracias por completar el formulario."}, session:{status:session.status,answered:(session.answers||[]).length,total:(survey.questions||[]).length}, question:session.status==="completed"?null:(q?{id:q.id,text:q.text,type:q.type,required:q.required!==false,options:(q.options||[]).map(o=>({label:o.label,value:o.value}))}:null) };
}
const publicFormHtml=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Formulario</title><style>:root{--a:#ff7a00;--p:#171717}*{box-sizing:border-box}body{margin:0;background:#f3f3f4;font-family:Inter,system-ui,Segoe UI,sans-serif;color:#1b1b1d;min-height:100vh;display:grid;place-items:center;padding:20px}.card{width:min(620px,100%);background:#fff;border:1px solid #e2e2e5;border-radius:22px;padding:28px;box-shadow:0 22px 60px #00000012}.brand{display:flex;align-items:center;gap:10px;margin-bottom:24px}.mark{width:36px;height:36px;border-radius:11px;background:var(--a);display:grid;place-items:center;font-weight:900}.brand b{font-size:13px}.bar{height:6px;background:#eee;border-radius:99px;overflow:hidden;margin:20px 0}.bar i{display:block;height:100%;background:var(--a);width:var(--progress,0%)}h1{font-size:23px;margin:0 0 7px}p{color:#777;font-size:13px;line-height:1.5}.q{font-size:18px;font-weight:750;margin:18px 0 14px}.input,textarea,select{width:100%;border:1px solid #d7d7dc;border-radius:13px;padding:13px;font:inherit;outline:0;background:#fff}.input:focus,textarea:focus,select:focus{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 14%,transparent)}textarea{min-height:120px;resize:vertical}.options{display:grid;gap:8px}.opt{display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:1px solid #ddd;border-radius:12px;background:#fff;text-align:left;cursor:pointer}.opt:hover,.opt.selected{border-color:var(--a);background:color-mix(in srgb,var(--a) 7%,#fff)}.btn{margin-top:18px;width:100%;height:47px;border:0;border-radius:13px;background:var(--p);color:#fff;font-weight:800;cursor:pointer}.err{color:#b42318;font-size:12px;min-height:18px;margin-top:9px}.done{text-align:center;padding:25px 5px}.done .mark{margin:0 auto 15px}</style></head><body><main class="card" id="app">Cargando…</main><script>const root=document.documentElement,app=document.getElementById('app');const path=location.pathname;const m=path.match(/^\/t\/([^/]+)\/form\/([^/]+)/)||path.match(/^\/form\/([^/]+)/);const tenant=m&&m.length===3?m[1]:null,token=m?(m.length===3?m[2]:m[1]):'';const api=tenant?'/t/'+tenant+'/api/public/forms/'+token:'/api/public/forms/'+token;let payload,selected='';function field(q){selected='';if(['options','yesno'].includes(q.type))return '<div class="options">'+q.options.map(o=>'<button type="button" class="opt" data-v="'+String(o.value).replace(/"/g,'&quot;')+'">'+o.label+'</button>').join('')+'</div>';if(q.type==='longtext')return '<textarea id="answer"></textarea>';if(q.type==='rating')return '<input class="input" id="answer" type="number" min="1" max="10" placeholder="1 a 10">';if(q.type==='number')return '<input class="input" id="answer" type="number">';if(q.type==='email')return '<input class="input" id="answer" type="email">';if(q.type==='date')return '<input class="input" id="answer" type="date">';return '<input class="input" id="answer">'}function render(){const x=payload;root.style.setProperty('--a',x.company.accentColor);root.style.setProperty('--p',x.company.primaryColor);if(x.session.status==='completed'){app.innerHTML='<div class="done"><div class="mark">✓</div><h1>Formulario completado</h1><p>'+x.form.closingMessage+'</p></div>';return}const pct=Math.round((x.session.answered/Math.max(1,x.session.total))*100);app.innerHTML='<div class="brand"><span class="mark">CRM</span><div><b>'+x.company.name+'</b></div></div><h1>'+x.form.name+'</h1><p>'+x.form.description+'</p><div class="bar" style="--progress:'+pct+'%"><i></i></div><div class="q">'+x.question.text+'</div>'+field(x.question)+'<button class="btn" id="next">Continuar</button><div class="err" id="err"></div>';document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{document.querySelectorAll('.opt').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selected=b.dataset.v});document.getElementById('next').onclick=submit}async function load(){const r=await fetch(api);payload=await r.json();if(!r.ok){app.innerHTML='<h1>No disponible</h1><p>'+(payload.error||'El formulario no existe o expiró.')+'</p>';return}render()}async function submit(){const q=payload.question;const val=['options','yesno'].includes(q.type)?selected:(document.getElementById('answer')?.value||'');const r=await fetch(api+'/answer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:val})});const x=await r.json();if(!r.ok){document.getElementById('err').textContent=x.error||'Revisá la respuesta.';return}payload=x;render()}load()</script></body></html>`;
app.get("/form/:token", (_request,response)=>{ response.type("html").send(publicFormHtml); });
app.get("/api/public/forms/:token", (request,response)=>{ const session=publicFormSession(request.params.token); if(!session)return response.status(404).json({error:"Formulario no encontrado o vencido."}); const result=publicFormPayload(session); if(!result)return response.status(404).json({error:"Formulario no encontrado."}); response.setHeader("Cache-Control","no-store"); response.json(result); });
app.post("/api/public/forms/:token/answer", async(request,response,next)=>{try{ const session=publicFormSession(request.params.token); if(!session) return response.status(404).json({error:"Formulario no encontrado o vencido."}); const survey=(data.surveys||[]).find((entry)=>entry.id===session.surveyId); if(!survey||survey.active===false)return response.status(410).json({error:"Este formulario ya no está disponible."}); if(session.status==="completed")return response.json(publicFormPayload(session)); if(session.status==="cancelled")return response.status(410).json({error:"Este formulario fue cancelado."}); const q=surveyQuestionById(survey,session.currentQuestionId)||survey.questions?.[0]; if(!q)throw new Error("El formulario no tiene una pregunta activa."); const parsed=parseSurveyAnswer(q,request.body?.value); if(!parsed.ok)return response.status(400).json({error:parsed.error}); if(!(session.answers||[]).some(a=>a.questionId===q.id))session.answers.push({questionId:q.id,questionText:q.text,type:q.type,value:parsed.value,label:parsed.label,answeredAt:timestamp(),channel:"web"}); session.startedAt=session.startedAt||timestamp();session.status="awaiting";const next=parsed.nextQuestionId||surveyNextSequential(survey,q.id); if(!next||next==="end"||!surveyQuestionById(survey,next)){session.status="completed";session.completedAt=timestamp();session.currentQuestionId=null;}else session.currentQuestionId=next;session.updatedAt=timestamp();recordCommunicationEvent({type:"form_web_reply",purpose:"survey",direction:"in",phone:session.phone,clientId:session.clientId,branchId:session.branchId,lineId:session.lineId,entityType:"survey",entityId:survey.id,sessionId:session.id,text:String(parsed.label||parsed.value),isolated:true,metadata:{questionId:q.id,channel:"web"}});await store.save();response.json(publicFormPayload(session)); }catch(error){next(error)} });

app.use("/api", (request, response, next) => {
  // V22: la API pública usa sus propios tokens Bearer y no depende de la cookie de sesión.
  if (String(request.path || "").startsWith("/public/v1/") || String(request.path || "").startsWith("/public/forms/")) return next();
  if (!isAuthenticated(request)) return response.status(401).json({ error: "Iniciá sesión." });
  return next();
});

app.use("/api", (request, response, next) => {
  if (!["POST", "PUT", "DELETE"].includes(request.method)) return next();
  const user = currentUser(request);
  response.once("finish", () => {
    if (response.statusCode < 200 || response.statusCode >= 300) return;
    const audit = auditDescriptionForRequest(request);
    recordAuditEvent(user, audit.action, audit.details, audit.branchId);
    sharedDriveRuntime.dirty = true;
    void store.save();
  });
  return next();
});



// V16 · Marcación, instrucciones del bot, campos personalizados y campañas.
app.post("/api/attendance/me", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const status = cleanText(request.body?.status, 30);
    if (!["active", "paused", "away", "offline"].includes(status)) throw new Error("Estado de marcación inválido.");
    if (user.role !== "agent" && status === "offline") throw new Error("Este estado está reservado para agentes.");
    const reason = cleanText(request.body?.reason, 240);
    const untilRaw = request.body?.until ? new Date(request.body.until) : null;
    const until = untilRaw && !Number.isNaN(untilRaw.getTime()) ? untilRaw.toISOString() : null;
    user.attendance = { status, reason, until, updatedAt: timestamp() };
    data.attendanceEvents.unshift({ id: makeId("attendance"), userId: user.id, userName: user.name, branchId: user.branchId || null, status, reason, until, at: timestamp() });
    data.attendanceEvents.splice(20000);
    if (status === "active") {
      for (const deal of data.deals || []) if (deal.ownerUserId === user.id && OPEN_STAGES.has(deal.stage)) { deal.coverageRequired = false; deal.coverageReason = ""; }
    }
    addActivity(data, `${user.name} marcó estado ${status === "active" ? "Disponible" : status === "paused" ? "Pausa" : status === "away" ? "Permiso/Ausente" : "Fuera de línea"}.`, status === "active" ? "success" : "neutral");
    queueSuperAutomationEvent({ type:"attendance_changed", branch:getBranch(user.branchId), user, status, text:reason });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/attendance/:userId", async (request, response, next) => {
  try {
    const actor = currentUser(request);
    if (!canManageAttendance(actor)) return response.status(403).json({ error: "No tenés permiso para gestionar marcación." });
    const target = data.users.find((entry) => entry.id === request.params.userId && entry.active !== false);
    if (!target) throw new Error("Usuario no encontrado.");
    if (actor.role === "supervisor" && actor.branchId && target.branchId !== actor.branchId) throw new Error("El usuario pertenece a otra sucursal.");
    const status = cleanText(request.body?.status, 30);
    if (!["active", "paused", "away", "offline"].includes(status)) throw new Error("Estado inválido.");
    const reason = cleanText(request.body?.reason, 240);
    const untilRaw = request.body?.until ? new Date(request.body.until) : null;
    const until = untilRaw && !Number.isNaN(untilRaw.getTime()) ? untilRaw.toISOString() : null;
    target.attendance = { status, reason, until, updatedAt: timestamp() };
    data.attendanceEvents.unshift({ id: makeId("attendance"), userId: target.id, userName: target.name, branchId: target.branchId || null, status, reason, until, at: timestamp(), changedByUserId: actor.id, changedByName: actor.name });
    data.attendanceEvents.splice(20000);
    if (status === "active") for (const deal of data.deals || []) if (deal.ownerUserId === target.id && OPEN_STAGES.has(deal.stage)) { deal.coverageRequired = false; deal.coverageReason = ""; }
    queueSuperAutomationEvent({ type:"attendance_changed", branch:getBranch(target.branchId), user:target, status, text:reason });
    await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/bot/instructions", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const name = cleanText(request.body?.name, 160) || "Instrucción";
    const instruction = cleanText(request.body?.instruction, 6000);
    if (instruction.length < 5) throw new Error("Escribí una instrucción más completa.");
    data.botInstructions.push({ id: makeId("botrule"), name, instruction, active: request.body?.active !== false, order: Number(request.body?.order || data.botInstructions.length), createdAt: timestamp(), updatedAt: timestamp() });
    await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/bot/instructions/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const rule = data.botInstructions.find((entry) => entry.id === request.params.id); if (!rule) throw new Error("Instrucción no encontrada.");
    if (request.body?.name !== undefined) rule.name = cleanText(request.body.name, 160) || rule.name;
    if (request.body?.instruction !== undefined) rule.instruction = cleanText(request.body.instruction, 6000) || rule.instruction;
    if (request.body?.active !== undefined) rule.active = request.body.active !== false;
    if (request.body?.order !== undefined) rule.order = Number(request.body.order || 0);
    rule.updatedAt = timestamp(); await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.delete("/api/bot/instructions/:id", requireManagerOrAdmin, async (request, response, next) => {
  try { data.botInstructions = data.botInstructions.filter((entry) => entry.id !== request.params.id); await store.save(); response.json(stateResponse(request)); } catch (error) { next(error); }
});

app.post("/api/bot/profiles", requireManagerOrAdmin, async (request, response, next) => {
  try {
    for (const key of ["newClientInstructions", "knownClientInstructions", "ownerAwayInstructions"]) if (request.body?.[key] !== undefined) data.settings.botProfiles[key] = cleanText(request.body[key], 6000);
    await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/custom-fields", async (request, response, next) => {
  try {
    const user = currentUser(request); if (!canManageCustomFields(user)) return response.status(403).json({ error: "No tenés permiso para crear campos personalizados." });
    const entity = ["contact", "deal", "product"].includes(request.body?.entity) ? request.body.entity : "contact";
    const label = cleanText(request.body?.label, 120); if (!label) throw new Error("Ingresá el nombre del campo.");
    const key = (cleanText(request.body?.key, 80) || label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")).slice(0, 80);
    if (!key) throw new Error("No se pudo generar la clave del campo.");
    if (data.customFieldDefinitions.some((field) => field.entity === entity && field.key === key)) throw new Error("Ya existe un campo con esa clave en esta entidad.");
    const type = ["text", "number", "date", "boolean", "select"].includes(request.body?.type) ? request.body.type : "text";
    const options = Array.isArray(request.body?.options) ? request.body.options.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 50) : cleanText(request.body?.options, 2000).split(",").map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 50);
    data.customFieldDefinitions.push({ id: makeId("field"), entity, key, label, type, context: cleanText(request.body?.context, 3000), options, botReadable: request.body?.botReadable !== false, botWritable: request.body?.botWritable === true, required: request.body?.required === true, active: true, createdAt: timestamp(), updatedAt: timestamp() });
    await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/custom-fields/:id", async (request, response, next) => {
  try {
    const user = currentUser(request); if (!canManageCustomFields(user)) return response.status(403).json({ error: "No tenés permiso para modificar campos personalizados." });
    const field = data.customFieldDefinitions.find((entry) => entry.id === request.params.id); if (!field) throw new Error("Campo no encontrado.");
    if (request.body?.label !== undefined) field.label = cleanText(request.body.label, 120) || field.label;
    if (request.body?.context !== undefined) field.context = cleanText(request.body.context, 3000);
    if (request.body?.botReadable !== undefined) field.botReadable = request.body.botReadable !== false;
    if (request.body?.botWritable !== undefined) field.botWritable = request.body.botWritable === true;
    if (request.body?.required !== undefined) field.required = request.body.required === true;
    if (request.body?.active !== undefined) field.active = request.body.active !== false;
    if (request.body?.options !== undefined) field.options = Array.isArray(request.body.options) ? request.body.options.map((item) => cleanText(item, 120)).filter(Boolean).slice(0,50) : cleanText(request.body.options,2000).split(",").map((item)=>cleanText(item,120)).filter(Boolean).slice(0,50);
    field.updatedAt = timestamp(); await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.delete("/api/custom-fields/:id", async (request, response, next) => {
  try { const user = currentUser(request); if (!canManageCustomFields(user)) return response.status(403).json({ error: "No tenés permiso." }); const field = data.customFieldDefinitions.find((entry)=>entry.id===request.params.id); if (!field) throw new Error("Campo no encontrado."); field.active=false; field.updatedAt=timestamp(); await store.save(); response.json(stateResponse(request)); } catch(error){ next(error); }
});

app.put("/api/custom-values/:entity/:id", async (request, response, next) => {
  try {
    const user = currentUser(request); const entityType = request.params.entity;
    const entity = entityType === "contact" ? findClient(data, request.params.id) : entityType === "deal" ? findDeal(data, request.params.id) : entityType === "product" ? data.products.find((item)=>item.id===request.params.id) : null;
    if (!entity) throw new Error("Registro no encontrado.");
    if (entityType === "deal") ensureDealOwnership(entity, user, { claim: false });
    if (entityType === "contact") {
      const visible = (data.deals||[]).some((deal)=>deal.clientId===entity.id && userCanAccessBranch(user,deal.branchId||primaryBranchId()) && (user.role!=="agent" || !deal.ownerUserId || deal.ownerUserId===user.id));
      if (!visible && user.role!=="admin") throw new Error("No tenés acceso a este cliente.");
    }
    if (entityType === "product" && !["admin","manager"].includes(user.role)) throw new Error("No tenés permiso para editar stock.");
    for (const [key,value] of Object.entries(request.body?.values || {})) { const field = fieldDefinition(key, entityType); if (field) setCustomField(entityType, entity, field, value); }
    await store.save(); response.json(stateResponse(request));
  } catch (error) { next(error); }
});



function formReportPayload(survey){
  const sessions=(data.surveySessions||[]).filter((entry)=>entry.surveyId===survey.id); const completed=sessions.filter((entry)=>entry.status==="completed");
  const questions=(survey.questions||[]).map((q)=>{ const answers=sessions.flatMap((s)=>(s.answers||[]).filter(a=>a.questionId===q.id).map(a=>({...a,sessionId:s.id,clientId:s.clientId,clientName:s.clientName,completedAt:s.completedAt}))); const base={id:q.id,text:q.text,type:q.type,totalAnswers:answers.length};
    if(["options","yesno"].includes(q.type)){const counts={};for(const a of answers)counts[a.label||String(a.value)]=(counts[a.label||String(a.value)]||0)+1;return {...base,distribution:Object.entries(counts).map(([label,count])=>({label,count,percentage:answers.length?Number((count/answers.length*100).toFixed(1)):0}))};}
    if(["rating","number"].includes(q.type)){const values=answers.map(a=>Number(a.value)).filter(Number.isFinite);return {...base,average:values.length?Number((values.reduce((s,n)=>s+n,0)/values.length).toFixed(2)):null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};}
    return {...base,samples:answers.slice(-30).reverse().map(a=>({clientName:a.clientName,value:a.label||a.value,at:a.completedAt}))};
  });
  const ratings=questions.filter(q=>q.type==="rating"&&Number.isFinite(q.average)); const overallRating=ratings.length?Number((ratings.reduce((s,q)=>s+q.average,0)/ratings.length).toFixed(2)):null;
  return {form:{...publicSurvey(survey,true),type:"form"},summary:{sent:sessions.length,completed:completed.length,active:sessions.filter(s=>["queued","awaiting"].includes(s.status)).length,cancelled:sessions.filter(s=>s.status==="cancelled").length,completionRate:sessions.length?Number((completed.length/sessions.length*100).toFixed(1)):0,overallRating},questions,sessions:sessions.slice(0,1000)};
}
app.get("/api/forms", requireManagerOrAdmin, (request,response)=>{ if(!canViewSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para ver formularios."}); const forms=(data.surveys||[]).filter((form)=>request.currentUser.role==="admin"||userCanAccessBranch(request.currentUser,form.branchId)).map((form)=>publicSurvey(form,true)); const sessions=(data.surveySessions||[]).filter((entry)=>request.currentUser.role==="admin"||userCanAccessBranch(request.currentUser,entry.branchId)).slice(0,500); response.setHeader("Cache-Control","no-store"); response.json({forms,sessions,orchestrator:{...data.settings.communicationOrchestrator},commercialStatuses:COMMERCIAL_STATUS_CATALOG}); });
app.post("/api/forms/preview", requireManagerOrAdmin, (request,response,next)=>{try{if(!canManageSurveys(request.currentUser))throw new Error("No tenés permisos para gestionar formularios.");const branchId=cleanText(request.body?.branchId,120)||request.currentUser.branchId||primaryBranchId();if(!userCanAccessBranch(request.currentUser,branchId))return response.status(403).json({error:"No podés usar esa sucursal."});const recipients=surveyRecipientsFor(request.body?.filters||{},branchId);response.json({count:recipients.length,sample:recipients.slice(0,20).map((client)=>({id:client.id,name:client.name,phone:client.phone,company:client.company,city:client.city}))});}catch(error){next(error);}});
app.post("/api/forms", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para crear formularios."});const form=sanitizeSurveyDefinition(request.body||{});if(!form.name)throw new Error("Ingresá un nombre para el formulario.");if(!userCanAccessBranch(request.currentUser,form.branchId))return response.status(403).json({error:"No podés usar esa sucursal."});form.id=makeId("form");form.createdAt=timestamp();form.createdByUserId=request.currentUser.id;form.createdByName=request.currentUser.name;data.surveys.unshift(form);recordAuditEvent(request.currentUser,"formulario_creado",{formId:form.id,name:form.name},form.branchId);await store.save();response.json({form:publicSurvey(form,true),revision:store.revision});}catch(error){next(error);}});
app.put("/api/forms/:id", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para editar formularios."});const current=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!current)throw new Error("Formulario no encontrado.");if(!userCanAccessBranch(request.currentUser,current.branchId))return response.status(403).json({error:"No podés editar ese formulario."});Object.assign(current,sanitizeSurveyDefinition(request.body||{},current));recordAuditEvent(request.currentUser,"formulario_actualizado",{formId:current.id,name:current.name},current.branchId);await store.save();response.json({form:publicSurvey(current,true),revision:store.revision});}catch(error){next(error);}});
app.get("/api/forms/:id/report", requireManagerOrAdmin, (request,response,next)=>{try{const form=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!form)throw new Error("Formulario no encontrado.");if(!userCanAccessBranch(request.currentUser,form.branchId))return response.status(403).json({error:"No podés ver este reporte."});response.json(formReportPayload(form));}catch(error){next(error);}});
app.post("/api/forms/:id/dispatch", requireManagerOrAdmin, async(request,response,next)=>{try{
  if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para enviar formularios."});
  const form=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!form)throw new Error("Formulario no encontrado.");
  if(!userCanAccessBranch(request.currentUser,form.branchId))return response.status(403).json({error:"No podés enviar ese formulario."});
  let clients=surveyRecipientsFor(form.filters||{},form.branchId);const ids=Array.isArray(request.body?.clientIds)?new Set(request.body.clientIds):null;if(ids&&ids.size)clients=clients.filter((client)=>ids.has(client.id));
  const created=[];for(const client of clients){if((data.surveySessions||[]).some((entry)=>entry.surveyId===form.id&&entry.clientId===client.id&&["queued","awaiting"].includes(entry.status)))continue;created.push(createSurveySession(form,client,{sourceType:"manual",publicBaseUrl:cleanText(request.body?.baseUrl,1000)}));}
  const errors=[];let started=0;for(const session of created.slice(0,25)){try{if(await startSurveySession(session))started+=1;}catch(error){errors.push({clientId:session.clientId,clientName:session.clientName,error:cleanText(error?.message||"No se pudo enviar",300)});}}
  recordAuditEvent(request.currentUser,"formulario_despachado",{formId:form.id,queued:created.length,started,errors:errors.length},form.branchId);await store.save();
  response.json({queued:created.length,started,errors,publicLinks:created.slice(0,100).map(session=>({clientId:session.clientId,clientName:session.clientName,path:publicFormPath(session),url:publicFormUrl(session)})),form:publicSurvey(form,true)});
}catch(error){next(error);}});
app.post("/api/forms/:id/toggle", requireManagerOrAdmin, async(request,response,next)=>{try{const form=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!form)throw new Error("Formulario no encontrado.");if(!userCanAccessBranch(request.currentUser,form.branchId))return response.status(403).json({error:"No podés modificar ese formulario."});form.active=request.body?.active!==false;form.updatedAt=timestamp();await store.save();response.json({form:publicSurvey(form,true)});}catch(error){next(error);}});
app.delete("/api/forms/:id", requireManagerOrAdmin, async(request,response,next)=>{try{const form=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!form)throw new Error("Formulario no encontrado.");if(!userCanAccessBranch(request.currentUser,form.branchId))return response.status(403).json({error:"No podés eliminar ese formulario."});data.surveys=data.surveys.filter((entry)=>entry.id!==form.id);for(const session of data.surveySessions||[])if(session.surveyId===form.id&&["queued","awaiting"].includes(session.status)){session.status="cancelled";session.cancelledAt=timestamp();}recordAuditEvent(request.currentUser,"formulario_eliminado",{formId:form.id,name:form.name},form.branchId);await store.save();response.json({ok:true});}catch(error){next(error);}});

app.get("/api/surveys", requireManagerOrAdmin, (request,response)=>{ if(!canViewSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para ver encuestas."});const surveys=(data.surveys||[]).filter((survey)=>request.currentUser.role==="admin"||userCanAccessBranch(request.currentUser,survey.branchId)).map((survey)=>publicSurvey(survey,true));const sessions=(data.surveySessions||[]).filter((entry)=>request.currentUser.role==="admin"||userCanAccessBranch(request.currentUser,entry.branchId)).slice(0,250);response.setHeader("Cache-Control","no-store");response.json({surveys,sessions,orchestrator:{...data.settings.communicationOrchestrator}}); });
app.post("/api/surveys/preview", requireManagerOrAdmin, (request,response,next)=>{try{if(!canManageSurveys(request.currentUser))throw new Error("No tenés permisos para gestionar encuestas.");const branchId=cleanText(request.body?.branchId,120)||request.currentUser.branchId||primaryBranchId();if(!userCanAccessBranch(request.currentUser,branchId))return response.status(403).json({error:"No podés usar esa sucursal."});const recipients=surveyRecipientsFor(request.body?.filters||{},branchId);response.json({count:recipients.length,sample:recipients.slice(0,20).map((client)=>({id:client.id,name:client.name,phone:client.phone,company:client.company,city:client.city}))});}catch(error){next(error);}});
app.post("/api/surveys", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para crear encuestas."});const survey=sanitizeSurveyDefinition(request.body||{});if(!survey.name)throw new Error("Ingresá un nombre para la encuesta.");if(!userCanAccessBranch(request.currentUser,survey.branchId))return response.status(403).json({error:"No podés usar esa sucursal."});survey.id=makeId("survey");survey.createdAt=timestamp();survey.createdByUserId=request.currentUser.id;survey.createdByName=request.currentUser.name;data.surveys.unshift(survey);recordAuditEvent(request.currentUser,"encuesta_creada",{surveyId:survey.id,name:survey.name},survey.branchId);await store.save();response.json({survey:publicSurvey(survey,true),state:stateResponse(request)});}catch(error){next(error);}});
app.put("/api/surveys/:id", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para editar encuestas."});const current=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!current)throw new Error("Encuesta no encontrada.");if(!userCanAccessBranch(request.currentUser,current.branchId))return response.status(403).json({error:"No podés editar esa encuesta."});const updated=sanitizeSurveyDefinition(request.body||{},current);Object.assign(current,updated);recordAuditEvent(request.currentUser,"encuesta_actualizada",{surveyId:current.id,name:current.name},current.branchId);await store.save();response.json({survey:publicSurvey(current,true),state:stateResponse(request)});}catch(error){next(error);}});
app.post("/api/surveys/:id/dispatch", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para enviar encuestas."});const survey=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!survey)throw new Error("Encuesta no encontrada.");if(!userCanAccessBranch(request.currentUser,survey.branchId))return response.status(403).json({error:"No podés enviar esa encuesta."});let clients=surveyRecipientsFor(survey.filters||{},survey.branchId);const ids=Array.isArray(request.body?.clientIds)?new Set(request.body.clientIds):null;if(ids&&ids.size)clients=clients.filter((client)=>ids.has(client.id));let queued=0;for(const client of clients){if((data.surveySessions||[]).some((entry)=>entry.surveyId===survey.id&&entry.clientId===client.id&&["queued","awaiting"].includes(entry.status)))continue;createSurveySession(survey,client,{sourceType:"manual"});queued+=1;}for(const session of (data.surveySessions||[]).filter((entry)=>entry.surveyId===survey.id&&entry.status==="queued").slice(0,3))await startSurveySession(session);recordAuditEvent(request.currentUser,"encuesta_despachada",{surveyId:survey.id,queued},survey.branchId);await store.save();response.json({queued,survey:publicSurvey(survey,true)});}catch(error){next(error);}});
app.post("/api/surveys/:id/toggle", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para gestionar encuestas."});const survey=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!survey)throw new Error("Encuesta no encontrada.");if(!userCanAccessBranch(request.currentUser,survey.branchId))return response.status(403).json({error:"No podés modificar esa encuesta."});survey.active=request.body?.active!==false;survey.updatedAt=timestamp();await store.save();response.json({survey:publicSurvey(survey,true)});}catch(error){next(error);}});
app.delete("/api/surveys/:id", requireManagerOrAdmin, async(request,response,next)=>{try{if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para eliminar encuestas."});const survey=(data.surveys||[]).find((entry)=>entry.id===request.params.id);if(!survey)throw new Error("Encuesta no encontrada.");if(!userCanAccessBranch(request.currentUser,survey.branchId))return response.status(403).json({error:"No podés eliminar esa encuesta."});data.surveys=data.surveys.filter((entry)=>entry.id!==survey.id);for(const session of data.surveySessions||[])if(session.surveyId===survey.id&&["queued","awaiting"].includes(session.status)){session.status="cancelled";session.cancelledAt=timestamp();}recordAuditEvent(request.currentUser,"encuesta_eliminada",{surveyId:survey.id,name:survey.name},survey.branchId);await store.save();response.json({ok:true});}catch(error){next(error);}});
app.post("/api/communication-orchestrator", requireAdmin, async(request,response,next)=>{try{const input=request.body||{};if(input.surveyIsolation!==undefined)data.settings.communicationOrchestrator.surveyIsolation=input.surveyIsolation!==false;if(input.campaignIsolation!==undefined)data.settings.communicationOrchestrator.campaignIsolation=input.campaignIsolation!==false;if(input.surveyRepliesTriggerCrm!==undefined)data.settings.communicationOrchestrator.surveyRepliesTriggerCrm=input.surveyRepliesTriggerCrm===true;if(input.campaignRepliesTriggerCrm!==undefined)data.settings.communicationOrchestrator.campaignRepliesTriggerCrm=input.campaignRepliesTriggerCrm===true;await store.save();response.json({orchestrator:{...data.settings.communicationOrchestrator}});}catch(error){next(error);}});

app.get("/api/campaigns", (request, response) => {
  const user = currentUser(request); if (!canViewCampaigns(user)) return response.status(403).json({ error: "No tenés permiso para ver campañas." });
  const campaigns = (data.campaigns || []).filter((campaign) => user.role === "admin" || !user.branchId || campaign.branchId === user.branchId).map((campaign) => publicCampaign(campaign, true));
  response.setHeader("Cache-Control", "no-store"); response.json({ campaigns, safety: data.settings.campaignSafety, documents: (data.assistantDocuments||[]).filter((doc)=>doc.active!==false).map((doc)=>({id:doc.id,title:doc.title,fileName:doc.fileName,mimeType:doc.mimeType})) });
});

app.post("/api/campaigns/preview", async (request, response, next) => {
  try {
    const user=currentUser(request); if(!canViewCampaigns(user)) return response.status(403).json({error:"No tenés permiso para campañas."});
    const branchId = user.role === "admin" ? cleanText(request.body?.branchId,120) : user.branchId;
    if(!branchId || !getBranch(branchId)) throw new Error("Seleccioná una sucursal.");
    const lineId=cleanText(request.body?.lineId,160)||defaultWhatsappLine(branchId)?.id; const line=whatsappLineById(lineId);
    if(!line||line.branchId!==branchId||line.active===false) throw new Error("Seleccioná una línea de WhatsApp válida.");
    if(!canUserMonitorWhatsappLine(user,line)) return response.status(403).json({error:"No tenés acceso a esa línea."});
    const recipients=campaignRecipientsFor(request.body?.filters||{},branchId);
    response.json({ count: recipients.length, lineId:line.id, lineName:line.name, sample: recipients.slice(0,20), optedInRequired:data.settings.campaignSafety.requireOptIn!==false });
  } catch(error){ next(error); }
});

app.post("/api/campaigns", async (request, response, next) => {
  try {
    const user=currentUser(request); if(!canManageCampaigns(user)) return response.status(403).json({error:"No tenés permiso para crear campañas."});
    const branchId = user.role === "admin" ? cleanText(request.body?.branchId,120) : user.branchId;
    if(!branchId || !getBranch(branchId)) throw new Error("Seleccioná una sucursal válida.");
    const lineId=cleanText(request.body?.lineId,160)||defaultWhatsappLine(branchId)?.id; const line=whatsappLineById(lineId);
    if(!line||line.branchId!==branchId||line.active===false) throw new Error("Seleccioná una línea de WhatsApp válida.");
    if(!canUserUseWhatsappLine(user,line)&&user.role!=="admin") return response.status(403).json({error:"No tenés permiso para enviar desde esa línea."});
    const name=cleanText(request.body?.name,160); const message=cleanText(request.body?.message,4000); if(!name||!message) throw new Error("Ingresá nombre y mensaje de campaña.");
    const filters=request.body?.filters&&typeof request.body.filters==="object"?request.body.filters:{};
    const recipients=campaignRecipientsFor(filters,branchId); if(!recipients.length) throw new Error("El filtro no encontró clientes con consentimiento válido.");
    const documentId=cleanText(request.body?.documentId,160)||null; if(documentId&&!assistantDocumentById(documentId)) throw new Error("El documento adjunto no existe.");
    const campaign={id:makeId("campaign"),name,branchId,lineId:line.id,message,documentId,filters,recipients,status:"draft",createdAt:timestamp(),updatedAt:timestamp(),createdByUserId:user.id,createdByName:user.name,sentCount:0,failedCount:0,pauseReason:""};
    data.campaigns.unshift(campaign); await store.save(); response.json({ campaign:publicCampaign(campaign,true), state:stateResponse(request) });
  } catch(error){ next(error); }
});

app.post("/api/campaigns/:id/start", async (request,response,next)=>{ try{ const user=currentUser(request); if(!canManageCampaigns(user)) return response.status(403).json({error:"No tenés permiso."}); const campaign=data.campaigns.find((entry)=>entry.id===request.params.id); if(!campaign) throw new Error("Campaña no encontrada."); if(user.role!=="admin"&&user.branchId!==campaign.branchId) throw new Error("Campaña de otra sucursal."); const line=whatsappLineById(campaign.lineId)||defaultWhatsappLine(campaign.branchId); if(!line||(!canUserUseWhatsappLine(user,line)&&user.role!=="admin")) throw new Error("No tenés permiso para usar la línea de esta campaña."); if(!["draft","paused"].includes(campaign.status)) throw new Error("La campaña no puede iniciarse en su estado actual."); campaign.status="running"; campaign.pauseReason=""; await store.save(); void runCampaign(campaign.id); response.json({campaign:publicCampaign(campaign,true)}); }catch(error){next(error);} });
app.post("/api/campaigns/:id/pause", async (request,response,next)=>{ try{ const user=currentUser(request); if(!canManageCampaigns(user)) return response.status(403).json({error:"No tenés permiso."}); const campaign=data.campaigns.find((entry)=>entry.id===request.params.id); if(!campaign) throw new Error("Campaña no encontrada."); campaign.status="paused"; campaign.pauseReason=cleanText(request.body?.reason,240)||"Pausada por el usuario."; campaign.updatedAt=timestamp(); await store.save(); response.json({campaign:publicCampaign(campaign,true)}); }catch(error){next(error);} });
app.delete("/api/campaigns/:id", async (request,response,next)=>{ try{ const user=currentUser(request); if(!canManageCampaigns(user)) return response.status(403).json({error:"No tenés permiso."}); const campaign=data.campaigns.find((entry)=>entry.id===request.params.id); if(!campaign) throw new Error("Campaña no encontrada."); if(campaign.status==="running") throw new Error("Pausá la campaña antes de eliminarla."); data.campaigns=data.campaigns.filter((entry)=>entry.id!==campaign.id); await store.save(); response.json({ok:true}); }catch(error){next(error);} });

app.post("/api/campaign-safety", requireAdmin, async (request,response,next)=>{ try{ const input=request.body||{}; if(input.qrEnabled!==undefined)data.settings.campaignSafety.qrEnabled=input.qrEnabled!==false; if(input.requireOptIn!==undefined)data.settings.campaignSafety.requireOptIn=input.requireOptIn!==false; if(input.qrDailyLimitPerBranch!==undefined)data.settings.campaignSafety.qrDailyLimitPerBranch=Math.min(100,Math.max(1,Number(input.qrDailyLimitPerBranch)||25)); if(input.qrIntervalSeconds!==undefined)data.settings.campaignSafety.qrIntervalSeconds=Math.min(600,Math.max(30,Number(input.qrIntervalSeconds)||90)); if(input.qrClientCooldownDays!==undefined)data.settings.campaignSafety.qrClientCooldownDays=Math.min(90,Math.max(0,Number(input.qrClientCooldownDays)||0)); if(input.qrStartHour!==undefined)data.settings.campaignSafety.qrStartHour=Math.min(23,Math.max(0,Number(input.qrStartHour)||0)); if(input.qrEndHour!==undefined)data.settings.campaignSafety.qrEndHour=Math.min(24,Math.max(1,Number(input.qrEndHour)||19)); if(input.apiIntervalSeconds!==undefined)data.settings.campaignSafety.apiIntervalSeconds=Math.min(60,Math.max(1,Number(input.apiIntervalSeconds)||3)); if(input.stopOnProviderError!==undefined)data.settings.campaignSafety.stopOnProviderError=input.stopOnProviderError!==false; await store.save(); response.json(stateResponse(request)); }catch(error){next(error);} });

app.get("/api/assistant/documents/:id/file", async (request, response, next) => {
  try {
    const document = assistantDocumentById(request.params.id);
    if (!document || document.active === false) return response.status(404).json({ error: "Documento no encontrado." });
    const filePath = assistantDocumentFile(document);
    if (!filePath || !existsSync(filePath)) return response.status(404).json({ error: "El archivo ya no está disponible." });
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName || document.title || "documento")}`);
    response.send(await readFile(filePath));
  } catch (error) { next(error); }
});

app.post(
  "/api/assistant/documents",
  express.raw({ type: () => true, limit: assistantDocumentMaxBytes }),
  requireManagerOrAdmin,
  async (request, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body) || !request.body.length) throw new Error("Seleccioná un documento.");
      const rawName = request.headers["x-file-name"] ? decodeURIComponent(String(request.headers["x-file-name"])) : "documento";
      const fileName = safeFileName(rawName, "documento");
      const extension = path.extname(fileName).toLowerCase();
      const mimeType = cleanText(request.headers["content-type"], 160) || "application/octet-stream";
      const supported = [".docx", ".pdf", ".txt", ".md", ".html", ".htm", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"];
      if (!supported.includes(extension)) throw new Error("Formato no soportado. Usá DOCX, PDF, TXT, MD, HTML, CSV, JSON o una imagen.");
      await mkdir(assistantDocumentsDirectory, { recursive: true });
      const id = makeId("document");
      const storedName = `${id}${extension || ".bin"}`;
      await writeFile(path.join(assistantDocumentsDirectory, storedName), request.body, { mode: 0o600 });
      let extractedText = "";
      if (extension === ".docx") extractedText = extractDocxText(request.body);
      else if ([".txt", ".md", ".html", ".htm", ".csv", ".json"].includes(extension)) extractedText = cleanText(request.body.toString("utf8"), 16000);
      const user = currentUser(request);
      const document = {
        id,
        title: cleanText(request.query.title, 160) || path.basename(fileName, extension),
        fileName,
        storedName,
        mimeType,
        size: request.body.length,
        context: cleanText(request.query.context, 6000),
        tags: cleanText(request.query.tags, 1000).split(",").map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 30),
        editableTemplate: request.query.editable === "1" && [".docx", ".txt", ".md", ".html", ".htm", ".csv", ".json"].includes(extension),
        active: true,
        extractedText,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        createdByUserId: user?.id || null,
        createdByName: user?.name || "",
      };
      data.assistantDocuments.unshift(document);
      addActivity(data, `${user?.name || "Usuario"} cargó el documento “${document.title}” para el Copiloto.`, "success");
      await store.save();
      response.json(stateResponse(request));
    } catch (error) { next(error); }
  },
);

app.put("/api/assistant/documents/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const document = assistantDocumentById(request.params.id);
    if (!document) throw new Error("Documento no encontrado.");
    if (request.body?.title !== undefined) document.title = cleanText(request.body.title, 160) || document.title;
    if (request.body?.context !== undefined) document.context = cleanText(request.body.context, 6000);
    if (request.body?.tags !== undefined) {
      document.tags = Array.isArray(request.body.tags)
        ? request.body.tags.map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 30)
        : cleanText(request.body.tags, 1000).split(",").map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 30);
    }
    if (request.body?.editableTemplate !== undefined) {
      const extension = path.extname(document.fileName || "").toLowerCase();
      document.editableTemplate = request.body.editableTemplate === true && [".docx", ".txt", ".md", ".html", ".htm", ".csv", ".json"].includes(extension);
    }
    if (request.body?.active !== undefined) document.active = request.body.active !== false;
    document.updatedAt = timestamp();
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.delete("/api/assistant/documents/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const index = (data.assistantDocuments || []).findIndex((document) => document.id === request.params.id);
    if (index < 0) throw new Error("Documento no encontrado.");
    const [document] = data.assistantDocuments.splice(index, 1);
    const filePath = assistantDocumentFile(document);
    if (filePath) await unlink(filePath).catch(() => {});
    addActivity(data, `${currentUser(request)?.name || "Usuario"} eliminó el documento “${document.title}”.`);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});


app.get("/api/deals/:id/data-suggestions", async (request,response,next)=>{
  try{const user=currentUser(request),deal=findDeal(data,request.params.id);if(!deal)throw new Error("Negociación no encontrada.");ensureDealOwnership(deal,user,{claim:false});response.setHeader("Cache-Control","no-store");response.json({dealId:deal.id,settings:{enabled:smartCaptureSettings().enabled!==false,autoApplySafe:smartCaptureSettings().autoApplySafe!==false,aiExtraction:smartCaptureSettings().aiExtraction!==false},suggestions:publicSmartSuggestions(deal.id)});}catch(error){next(error);}
});
app.post("/api/deals/:id/data-suggestions/analyze", async (request,response,next)=>{
  try{const user=currentUser(request),deal=findDeal(data,request.params.id);if(!deal)throw new Error("Negociación no encontrada.");ensureDealOwnership(deal,user,{claim:false});const latest=[...(deal.messages||[])].reverse().find(m=>m.direction==="incoming"&&m.text);if(!latest)throw new Error("No hay un mensaje reciente del cliente para analizar.");localSmartCaptureSuggestions(deal,latest.text);if(request.body?.withAi!==false)await aiSmartCaptureSuggestions(deal,latest.text);await store.save();response.json({dealId:deal.id,suggestions:publicSmartSuggestions(deal.id)});}catch(error){next(error);}
});
app.post("/api/deals/:id/data-suggestions/:suggestionId/apply", async (request,response,next)=>{
  try{const user=currentUser(request),deal=findDeal(data,request.params.id);if(!deal)throw new Error("Negociación no encontrada.");ensureDealOwnership(deal,user,{claim:false});const suggestion=(data.clientDataSuggestions||[]).find(x=>x.id===request.params.suggestionId&&x.dealId===deal.id);if(!suggestion)throw new Error("Recomendación no encontrada.");if(suggestion.status!=="pending")throw new Error("Esta recomendación ya fue procesada.");applySmartSuggestion(suggestion,user,{automatic:false});await store.save();response.json({state:stateResponse(request),suggestions:publicSmartSuggestions(deal.id),applied:suggestion});}catch(error){next(error);}
});
app.post("/api/deals/:id/data-suggestions/:suggestionId/dismiss", async (request,response,next)=>{
  try{const user=currentUser(request),deal=findDeal(data,request.params.id);if(!deal)throw new Error("Negociación no encontrada.");ensureDealOwnership(deal,user,{claim:false});const suggestion=(data.clientDataSuggestions||[]).find(x=>x.id===request.params.suggestionId&&x.dealId===deal.id);if(!suggestion)throw new Error("Recomendación no encontrada.");if(suggestion.status==="pending"){suggestion.status="dismissed";suggestion.updatedAt=timestamp();recordAuditEvent(user,"dato_cliente_recomendacion_descartada",{dealId:deal.id,suggestionId:suggestion.id,field:suggestion.field,value:suggestion.value},deal.branchId,"human");await store.save();}response.json({suggestions:publicSmartSuggestions(deal.id)});}catch(error){next(error);}
});

app.post("/api/deals/:id/copilot-suggestion", async (request, response, next) => {
  try {
    if (data.settings.copilot?.enabled === false || !aiFeatureEnabled("copilotReply")) throw new Error("El Copiloto está desactivado por administración.");
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: false });
    const suggestion = await createCopilotSuggestion(deal);
    const documents = suggestion.documentIds
      .map((id) => assistantDocumentById(id))
      .filter((document) => document && document.active !== false)
      .map((document) => ({
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        context: document.context,
        tags: document.tags || [],
        editableTemplate: document.editableTemplate === true,
        mimeType: document.mimeType,
      }));
    response.setHeader("Cache-Control", "no-store");
    response.json({ ...suggestion, documents });
  } catch (error) { next(error); }
});

app.post("/api/deals/:id/assistant-documents/:documentId/send", async (request, response, next) => {
  let attachment = null;
  try {
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });
    const document = assistantDocumentById(request.params.documentId);
    if (!document || document.active === false) throw new Error("Documento no encontrado.");
    const requestDetails = cleanText(request.body?.requestDetails, 5000);
    const prepared = await prepareAssistantDocumentBuffer(document, deal, requestDetails);
    const base = path.basename(document.fileName || document.title || "documento", path.extname(document.fileName || ""));
    const fileName = safeFileName(`${base} - ${deal.name || deal.phone}${prepared.extension}`, `documento${prepared.extension}`);
    const info = {
      kind: "document",
      fileName,
      mimeType: prepared.mimeType,
      caption: cleanText(request.body?.caption, 1000) || `Te comparto ${document.title || "el documento solicitado"}.`,
      voiceNote: false,
      duration: 0,
    };
    attachment = await saveAttachmentBuffer(prepared.buffer, info);
    const messageId = await sendProviderMedia(deal, prepared.buffer, info);
    rememberSeen(messageId);
    recordHumanOutgoing(data, {
      jid: deal.jid,
      name: deal.name,
      text: info.caption,
      messageId,
      attachment,
      userId: user.id,
      userName: user.name,
      branchId: deal.branchId,
    });
    addActivity(data, `${user.name} preparó y envió “${document.title}” a ${deal.name}.`, "success");
    await store.save();
    response.json({ state: stateResponse(request), unmodified: prepared.unmodified === true });
  } catch (error) {
    if (attachment?.storedName) await unlink(path.join(mediaDirectory, path.basename(attachment.storedName))).catch(() => {});
    next(error);
  }
});



// V18 · Plataforma modular + Centro IA
app.get("/api/platform/config", requireAdmin, (request,response)=>response.json({modules:{...data.settings.modules},aiFeatures:{...data.settings.aiFeatures},aiSuite:{...data.settings.aiSuite},experience:{...data.settings.experience}}));
app.post("/api/platform/config", requireAdmin, async (request,response,next)=>{try{
  const input=request.body||{};
  if(input.modules&&typeof input.modules==="object") for(const key of Object.keys(MODULE_DEFAULTS)) if(key!=="settings"&&input.modules[key]!==undefined)data.settings.modules[key]=input.modules[key]!==false;
  data.settings.modules.settings=true;
  if(input.aiFeatures&&typeof input.aiFeatures==="object") for(const key of Object.keys(AI_FEATURE_DEFAULTS)) if(input.aiFeatures[key]!==undefined)data.settings.aiFeatures[key]=input.aiFeatures[key]!==false;
  if(input.aiSuite&&typeof input.aiSuite==="object") data.settings.aiSuite={...data.settings.aiSuite,enabled:input.aiSuite.enabled!==false,proactive:input.aiSuite.proactive!==false,confidenceThreshold:Math.min(100,Math.max(40,Number(input.aiSuite.confidenceThreshold)||70)),maxContextMessages:Math.min(50,Math.max(6,Number(input.aiSuite.maxContextMessages)||20)),allowAutoFieldUpdates:input.aiSuite.allowAutoFieldUpdates!==false,allowAutoTags:input.aiSuite.allowAutoTags===true,requireHumanApprovalForExternalActions:input.aiSuite.requireHumanApprovalForExternalActions!==false};
  if(input.experience&&typeof input.experience==="object") {
    const next={...data.settings.experience};
    if(["off","soft","full"].includes(input.experience.motionLevel)) next.motionLevel=input.experience.motionLevel;
    if(["comfortable","compact"].includes(input.experience.density)) next.density=input.experience.density;
    for(const key of Object.keys(EXPERIENCE_DEFAULTS)) if(!["motionLevel","density"].includes(key)&&input.experience[key]!==undefined) next[key]=input.experience[key]!==false;
    data.settings.experience=next;
  }
  recordAuditEvent(request.currentUser,"configuracion_modular_ia",{modules:data.settings.modules,aiFeatures:data.settings.aiFeatures,experience:data.settings.experience},request.currentUser.branchId||primaryBranchId()); await store.save(); response.json(stateResponse(request));
}catch(error){next(error);}});

app.get("/api/ai/status",(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});response.setHeader("Cache-Control","no-store");response.json(aiSuiteStatus());});
app.post("/api/ai/test",requireAdmin,async(request,response,next)=>{try{if(!data.settings.apiKey)return response.status(400).json({ok:false,...aiSuiteStatus(),error:"Falta configurar la API Key de IA."});const result=await requestOpenAiText({instructions:"Prueba de conexión del CRM. Respondé únicamente OK.",input:"OK",maxOutputTokens:20});recordAiUsage(request.currentUser,"connectionTest",{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();response.json({ok:true,text:cleanText(result.text,60),endpoint:result.endpoint,...aiSuiteStatus()});}catch(error){response.status(502).json({ok:false,error:cleanText(error.message,900),...aiSuiteStatus()});}});
app.post("/api/ai/specialist",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!aiFeatureEnabled("specializedAgents"))return response.status(403).json({error:"Agentes IA especializados desactivados."});const specialist=["commercial","sac","supervisor","stock","quality","campaigns","management"].includes(request.body?.specialist)?request.body.specialist:"commercial";const question=cleanText(request.body?.question,3000);if(!question)throw new Error("Escribí qué necesitás analizar.");const ov=advancedOverview(user),alerts=automaticOperationalAlerts(user).slice(0,20);const visibleDeals=(data.deals||[]).filter(d=>userCanAccessBranch(user,d.branchId)&& (user.role!=="agent"||!d.ownerUserId||d.ownerUserId===user.id)).slice(0,100);const context={specialist,question,overview:ov,alerts,deals:visibleDeals.map(d=>({name:d.name,stage:d.stage,owner:d.ownerName,branch:getBranch(d.branchId)?.name,line:dealWhatsappLine(d)?.name,lastMessage:d.lastMessage,updatedAt:d.updatedAt})),stock:(data.products||[]).filter(p=>p.active!==false).slice(0,100).map(p=>({sku:p.sku,name:p.name,available:p.available,minStock:p.minStock,price:p.price}))};const local=`Especialista ${specialist}: ${ov.open} negociaciones abiertas, ${ov.waiting} esperando y ${ov.criticalAlerts} alertas críticas. ${alerts[0]?`Prioridad: ${alerts[0].title} — ${alerts[0].detail}`:"No hay alerta crítica inmediata."}`;if(!data.settings.apiKey)return response.json({answer:local,source:"local",specialist});try{const result=await requestOpenAiText({instructions:`Actuá como especialista ${specialist} dentro de un CRM. Respondé en español, con acciones concretas y solo a partir de la evidencia entregada. No inventes datos, precios ni políticas.`,input:context,maxOutputTokens:1000});recordAiUsage(user,`specialist:${specialist}`,{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();response.json({answer:cleanText(result.text,8000),source:"ai",specialist,endpoint:result.endpoint});}catch(error){response.json({answer:local,source:"local",specialist,warning:cleanText(error.message,600)});}}catch(error){next(error);}});
app.post("/api/ai/natural-action-preview",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!aiFeatureEnabled("naturalActions"))return response.status(403).json({error:"Acciones naturales desactivadas."});const instruction=cleanText(request.body?.instruction,3000);if(!instruction)throw new Error("Describí la acción.");const lower=instruction.toLowerCase();let action="review",title="Revisar instrucción",risk="low";if(/tarea|recordatorio|seguimiento/.test(lower)){action="create_task";title="Crear tarea / seguimiento";}else if(/reserv/.test(lower)){action="reserve_stock";title="Preparar reserva de stock";risk="medium";}else if(/transfer|deriv/.test(lower)){action="transfer_deal";title="Preparar transferencia";risk="medium";}else if(/envi|mensaje|whatsapp/.test(lower)){action="send_message";title="Preparar comunicación externa";risk="high";}else if(/cotiz|presupuesto/.test(lower)){action="prepare_quote";title="Preparar cotización";risk="medium";}const preview={action,title,risk,instruction,requiresConfirmation:true,executed:false,autonomy:data.settings.aiGovernance?.autonomyDefault??3};response.json({preview,note:"Vista previa segura: no se ejecutó ninguna acción."});}catch(error){next(error);}});
app.post("/api/ai/deals/:id/analyze", async (request,response,next)=>{try{
  const user=currentUser(request); if(!user)return response.status(401).json({error:"Sesión requerida."}); if(!moduleEnabled("aiCenter")||data.settings.aiSuite?.enabled===false)return response.status(403).json({error:"Centro IA desactivado por administración."});
  const deal=findDeal(data,request.params.id); if(!deal||!userCanAccessBranch(user,deal.branchId))return response.status(404).json({error:"Negociación no encontrada."}); const insight=applyAiFeatureMask(await structuredAgentIntelligence(deal)); data.aiInsightHistory.unshift({id:makeId("insight"),dealId:deal.id,userId:user.id,at:timestamp(),summary:cleanText(insight.summary,500),source:insight.source}); data.aiInsightHistory.splice(5000); await store.save(); response.json(insight);
}catch(error){next(error);}});
app.post("/api/ai/ask", async (request,response,next)=>{try{
  const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!aiFeatureEnabled("askCrm"))return response.status(403).json({error:"Preguntarle al CRM está desactivado."});
  const question=cleanText(request.body?.question,2000);if(!question)throw new Error("Escribí una pregunta."); const deal=request.body?.dealId?findDeal(data,request.body.dealId):null;if(deal&&!userCanAccessBranch(user,deal.branchId))return response.status(403).json({error:"Sin acceso a esa negociación."});
  const q=question.toLowerCase(); let fallback="Puedo ayudarte con clientes, stock, responsables, historial, negociaciones, tareas y procedimientos cargados en el CRM.";
  if(deal){const ctx=clientDealContext(deal);if(q.includes("responsable"))fallback=deal.ownerName?`El responsable actual es ${deal.ownerName}.`:"La negociación todavía no tiene responsable.";else if(q.includes("última")&&q.includes("venta")){const win=ctx.wins.sort((a,b)=>new Date(b.closedAt||b.updatedAt)-new Date(a.closedAt||a.updatedAt))[0];fallback=win?`La última venta registrada fue ${formatDealForAi(win)}.`:"No encontré ventas ganadas previas para este cliente.";}else if(q.includes("resumen"))fallback=fallbackAgentIntelligence(deal).summary;}
  if(q.includes("stock")){const terms=q.split(/\s+/).filter(w=>w.length>3);const matches=(data.products||[]).filter(p=>p.active!==false&&terms.some(t=>`${p.name} ${p.sku}`.toLowerCase().includes(t))).slice(0,6);if(matches.length)fallback=matches.map(p=>`${p.name} (${p.sku}): ${p.available} disponible(s)`).join("\n");}
  if(!data.settings.apiKey)return response.json({answer:fallback,source:"local",status:aiSuiteStatus()});
  const context=deal?{deal:{name:deal.name,phone:deal.phone,stage:deal.stage,owner:deal.ownerName,branch:getBranch(deal.branchId)?.name,line:dealWhatsappLine(deal)?.name},client:findClient(data,deal.clientId),messages:(deal.messages||[]).slice(-15).map(m=>({direction:m.direction,text:m.text})),stock:(data.products||[]).filter(p=>p.active!==false).slice(0,80).map(p=>({sku:p.sku,name:p.name,available:p.available,price:p.price})),documents:(data.assistantDocuments||[]).filter(d=>d.active!==false).map(d=>({title:d.title,context:d.context,tags:d.tags}))}:{stock:(data.products||[]).filter(p=>p.active!==false).slice(0,100).map(p=>({sku:p.sku,name:p.name,available:p.available})),branches:(data.branches||[]).filter(b=>b.active!==false).map(b=>({name:b.name,city:b.city,address:b.address}))};
  try{const result=await requestOpenAiText({instructions:"Respondé como asistente interno de CRM al agente. Usá exclusivamente el CONTEXTO y la pregunta. Si no está el dato, decilo. No inventes.",input:{question,context},maxOutputTokens:800});recordAiUsage(user,"askCrm",{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();response.json({answer:cleanText(result.text,5000),source:"ai",endpoint:result.endpoint});}catch(error){response.json({answer:fallback,source:"local",warning:cleanText(error.message,600),status:aiSuiteStatus()});}
}catch(error){next(error);}});
function formatDealForAi(deal){const branch=getBranch(deal.branchId)?.name||"Sucursal";const items=(deal.items||[]).map(i=>`${i.name} x${i.quantity}`).join(", ");return `${branch}${deal.ownerName?`, con ${deal.ownerName}`:""}${items?`, ${items}`:""}`;}
app.post("/api/ai/management-brief", async (request,response,next)=>{try{
  const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!["admin","manager","supervisor"].includes(user.role))return response.status(403).json({error:"Disponible para jefatura, gerencia y administración."});if(!aiFeatureEnabled("managementBrief"))return response.status(403).json({error:"Brief gerencial IA desactivado."});
  const branchDeals=(data.deals||[]).filter(d=>user.role!=="supervisor"||!user.branchId||d.branchId===user.branchId);const open=branchDeals.filter(d=>OPEN_STAGES.has(d.stage));const won=branchDeals.filter(d=>d.stage===STAGES.WON);const waiting=open.filter(d=>d.stage===STAGES.WAITING);const alerts=automaticOperationalAlerts(user);const overdue=visibleTasksFor(user).filter(t=>t.status!=="done"&&t.dueAt&&new Date(t.dueAt)<new Date());const available=presenceForUser(user).counts?.active||0;const sales=won.reduce((sum,d)=>sum+(d.items||[]).reduce((s,i)=>s+Number(i.price||i.unitPrice||0)*Number(i.quantity||0),0),0);
  const metrics={open:open.length,waiting:waiting.length,won:won.length,sales,available,criticalAlerts:alerts.filter(a=>a.severity==="critical").length,overdueTasks:overdue.length};const local=`Operación: ${open.length} negociaciones abiertas, ${waiting.length} esperando respuesta, ${won.length} ganadas históricas visibles y ${sales.toLocaleString("es-PY")} Gs. vendidos en registros ganados. Equipo: ${available} agentes disponibles. Prioridades: ${metrics.criticalAlerts} alertas críticas, ${overdue.length} tareas vencidas. ${alerts[0]?`Atención inmediata: ${alerts[0].title} — ${alerts[0].detail}`:"No se detectan alertas críticas inmediatas."}`;
  if(!data.settings.apiKey)return response.json({brief:local,source:"local",metrics});
  const context={metrics:{...metrics,alerts:alerts.slice(0,15),overdueTasks:overdue.slice(0,10)},branches:publicBranches().map(b=>({name:b.name,open:b.openDealCount,userCount:b.userCount,connection:b.connection?.status,lines:b.whatsappLineCount})),presence:presenceForUser(user)};
  try{const result=await requestOpenAiText({instructions:"Generá un brief ejecutivo CRM en español, máximo 8 puntos breves. Priorizá riesgos, tiempos de respuesta, cobertura, ventas y próximos pasos. No inventes causas ni cifras.",input:context,maxOutputTokens:900});recordAiUsage(user,"managementBrief",{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();response.json({brief:cleanText(result.text,6000),source:"ai",metrics,endpoint:result.endpoint});}catch(error){response.json({brief:local,source:"local",metrics,warning:cleanText(error.message,600)});}
}catch(error){next(error);}});

app.post("/api/ai/rewrite", async (request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!aiFeatureEnabled("rewrite"))return response.status(403).json({error:"Mejora de texto desactivada."});const text=cleanText(request.body?.text,6000);const tone=cleanText(request.body?.tone||"profesional",80);if(!text)throw new Error("No hay texto para mejorar.");if(!data.settings.apiKey)return response.json({text,source:"local",warning:"Falta API Key para reescritura generativa."});try{const result=await requestOpenAiText({instructions:`Reescribí el mensaje para WhatsApp con tono ${tone}. Conservá datos, precios y promesas exactamente; no inventes. Devolvé solo el mensaje.`,input:text,maxOutputTokens:800});recordAiUsage(user,"rewrite",{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();response.json({text:cleanText(result.text,6000),source:"ai",endpoint:result.endpoint});}catch(error){response.json({text,source:"local",warning:cleanText(error.message,600)});}}catch(error){next(error);}});

app.get("/api/tasks",(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});response.json({tasks:visibleTasksFor(user)});});
app.post("/api/tasks",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("tasks"))return response.status(403).json({error:"Módulo de tareas desactivado."});const assignedUserId=cleanText(request.body?.assignedUserId,120)||user.id;const assigned=data.users.find(u=>u.id===assignedUserId&&u.active!==false);if(!assigned)throw new Error("Responsable de tarea inválido.");const branchId=cleanText(request.body?.branchId,120)||assigned.branchId||user.branchId||primaryBranchId();if(!userCanAccessBranch(user,branchId))return response.status(403).json({error:"Sin acceso a la sucursal."});const task={id:makeId("task"),title:cleanText(request.body?.title,240),description:cleanText(request.body?.description,3000),branchId,assignedUserId:assigned.id,assignedUserName:assigned.name,dealId:cleanText(request.body?.dealId,120)||null,clientId:cleanText(request.body?.clientId,120)||null,priority:["low","normal","high","urgent"].includes(request.body?.priority)?request.body.priority:"normal",status:"pending",dueAt:request.body?.dueAt||null,createdByUserId:user.id,createdByName:user.name,createdAt:timestamp(),updatedAt:timestamp()};if(!task.title)throw new Error("Indicá un título.");data.tasks.unshift(task);recordAuditEvent(user,"tarea_creada",{taskId:task.id,title:task.title},branchId);await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.put("/api/tasks/:id",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const task=(data.tasks||[]).find(t=>t.id===request.params.id);if(!task)throw new Error("Tarea no encontrada.");if(user.role==="agent"&&task.assignedUserId!==user.id&&task.createdByUserId!==user.id)return response.status(403).json({error:"Sin permiso."});if(request.body?.status&&["pending","doing","done","cancelled"].includes(request.body.status))task.status=request.body.status;if(request.body?.title!==undefined)task.title=cleanText(request.body.title,240);if(request.body?.description!==undefined)task.description=cleanText(request.body.description,3000);if(request.body?.dueAt!==undefined)task.dueAt=request.body.dueAt||null;task.updatedAt=timestamp();if(task.status==="done"&&!task.completedAt)task.completedAt=timestamp();await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.delete("/api/tasks/:id",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const idx=(data.tasks||[]).findIndex(t=>t.id===request.params.id);if(idx<0)throw new Error("Tarea no encontrada.");const task=data.tasks[idx];if(!["admin","manager","supervisor"].includes(user.role)&&task.createdByUserId!==user.id)return response.status(403).json({error:"Sin permiso."});data.tasks.splice(idx,1);await store.save();response.json(stateResponse(request));}catch(error){next(error);}});

app.post("/api/objectives",requireManagerOrAdmin,async(request,response,next)=>{try{const user=request.currentUser;const objectiveUserId=cleanText(request.body?.userId,120)||null;const objectiveUser=objectiveUserId?data.users.find(u=>u.id===objectiveUserId&&u.active!==false):null;const branchId=cleanText(request.body?.branchId,120)||objectiveUser?.branchId||user.branchId||primaryBranchId();if(!userCanAccessBranch(user,branchId))return response.status(403).json({error:"Sin acceso."});const target=Math.max(0,Number(request.body?.target)||0);const entry={id:makeId("objective"),name:cleanText(request.body?.name,180),metric:["sales","wins","conversion","response","nps","contacts"].includes(request.body?.metric)?request.body.metric:"sales",target,period:cleanText(request.body?.period||new Date().toISOString().slice(0,7),20),branchId,userId:objectiveUserId,createdByUserId:user.id,createdAt:timestamp(),active:true};if(!entry.name)throw new Error("Indicá un nombre de objetivo.");data.objectives.unshift(entry);await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.delete("/api/objectives/:id",requireManagerOrAdmin,async(request,response,next)=>{try{data.objectives=(data.objectives||[]).filter(o=>o.id!==request.params.id);await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.post("/api/approvals",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const branchId=user.branchId||cleanText(request.body?.branchId,120)||primaryBranchId();const entry={id:makeId("approval"),type:cleanText(request.body?.type||"general",80),title:cleanText(request.body?.title,240),detail:cleanText(request.body?.detail,4000),amount:Number(request.body?.amount)||0,dealId:cleanText(request.body?.dealId,120)||null,branchId,requestedByUserId:user.id,requestedByName:user.name,status:"pending",createdAt:timestamp(),updatedAt:timestamp()};if(!entry.title)throw new Error("Indicá qué necesitás aprobar.");data.approvals.unshift(entry);await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.post("/api/approvals/:id/decision",requireManagerOrAdmin,async(request,response,next)=>{try{const user=request.currentUser;const entry=(data.approvals||[]).find(a=>a.id===request.params.id);if(!entry)throw new Error("Solicitud no encontrada.");if(!userCanAccessBranch(user,entry.branchId))return response.status(403).json({error:"Sin acceso."});entry.status=request.body?.decision==="approved"?"approved":"rejected";entry.decisionNote=cleanText(request.body?.note,2000);entry.decidedByUserId=user.id;entry.decidedByName=user.name;entry.decidedAt=timestamp();entry.updatedAt=timestamp();await store.save();response.json(stateResponse(request));}catch(error){next(error);}});


app.get("/api/deal-statuses", (request,response)=>{ const user=currentUser(request); if(!user)return response.status(401).json({error:"Sesión requerida."}); response.json({statuses:COMMERCIAL_STATUS_CATALOG}); });
app.post("/api/deals/:id/commercial-status", async(request,response,next)=>{try{
  const user=currentUser(request); if(!user)return response.status(401).json({error:"Sesión requerida."}); const deal=findDeal(data,request.params.id); if(!deal)throw new Error("Negociación no encontrada.");
  ensureDealOwnership(deal,user,{claim:false,allowTemporaryCommunication:true});
  if(request.body?.mode==="auto"){ const inferred=await aiInferDealCommercialStatus(deal); applyCommercialStatusInference(deal,inferred,inferred.source==="ai"?"ai_api":"ai_local"); }
  else { const status=commercialStatusById(cleanText(request.body?.statusId,100)); if(!status||status.id!==request.body?.statusId)throw new Error("Estado comercial inválido."); deal.commercialStatusId=status.id;deal.commercialStatusLabel=status.label;deal.commercialStatusSource="manual";deal.commercialStatusManual=true;deal.commercialStatusConfidence=100;deal.commercialStatusReason=cleanText(request.body?.reason,400)||`Estado definido manualmente por ${user.name}.`;deal.commercialStatusUpdatedAt=timestamp(); }
  recordAuditEvent(user,"estado_comercial_actualizado",{dealId:deal.id,statusId:deal.commercialStatusId,source:deal.commercialStatusSource},deal.branchId); await store.save(); response.json(stateResponse(request));
}catch(error){next(error);}});

app.get("/api/live", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  response.setHeader("Cache-Control", "no-store");
  const branchConnections = (data.branches || [])
    .filter((branch) => branch.active !== false || branch.id === primaryBranchId())
    .map((branch) => branchConnectionState(branch.id));
  const whatsappLines = (data.whatsappLines || [])
    .filter((line) => canUserMonitorWhatsappLine(user, line))
    .map((line) => ({ id: line.id, connection: whatsappLineConnectionState(line.id) }));
  response.json({
    revision: store.revision,
    connection: connectionState(),
    branchConnections,
    whatsappLines,
    serverTime: timestamp(),
  });
});

app.get("/api/state", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(stateResponse(request));
});

app.get("/api/reports", (request, response) => {
  const days = Number(request.query.days);
  const user = currentUser(request);
  const permissions = reportPermissions(user);
  let branchId = cleanText(request.query.branchId, 120);
  let ownerUserId = cleanText(request.query.userId, 120);
  if (branchId === "all") branchId = "";
  if (ownerUserId === "all") ownerUserId = "";

  if (user?.role === "agent") {
    branchId = user.branchId || primaryBranchId();
    ownerUserId = user.id;
  } else if (!permissions.global) {
    branchId = user?.branchId || primaryBranchId();
  } else if (branchId && !getBranch(branchId)) {
    branchId = "";
  }

  if (ownerUserId) {
    const target = data.users.find((entry) => entry.id === ownerUserId && entry.active !== false);
    const allowedTarget = target && (permissions.global || !branchId || target.branchId === branchId) && (permissions.team || target.id === user?.id);
    if (!allowedTarget) ownerUserId = user?.role === "agent" ? user.id : "";
  }

  const report = buildReports(data, { days, ownerUserId: ownerUserId || null, branchId: branchId || null });
  const statusDeals=(data.deals||[]).filter((deal)=>(!branchId||deal.branchId===branchId)&&(!ownerUserId||deal.ownerUserId===ownerUserId));
  report.commercialStatusDistribution=commercialStatusDistribution(statusDeals);
  if (!permissions.team) report.agentPerformance = report.agentPerformance.filter((entry) => entry.id === user?.id);
  if (!permissions.global) report.branchSummaries = report.branchSummaries.filter((entry) => entry.id === (user?.branchId || branchId));
  if (!permissions.audit) report.auditEvents = [];

  response.setHeader("Cache-Control", "no-store");
  response.json({
    ...report,
    scopeUserId: ownerUserId || null,
    scopeBranchId: branchId || null,
    permissions,
    branches: permissions.global ? publicBranches().filter((entry) => entry.active !== false).map(({ id, code, name, city }) => ({ id, code, name, city })) : [],
  });
});


// V13: endpoints PBX/SIP eliminados.

app.get("/api/shared-drive/status", async (request, response) => {
  const user = currentUser(request);
  let overview = { branches: [], uniqueClients: 0, recentMovements: [], canViewGlobalReports: canViewGlobalReports(user) };
  if (sharedDriveConfig().enabled === true && sharedDriveConfig().folderPath) {
    try { overview = await sharedDriveOverview(user); } catch (error) { sharedDriveRuntime.lastError = cleanText(error?.message || error, 500); }
  }
  response.setHeader("Cache-Control", "no-store");
  response.json({ ...sharedDrivePublicStatus(user), overview });
});

app.post("/api/shared-drive/settings", requireAdmin, async (request, response, next) => {
  try {
    const input = request.body || {};
    const enabled = input.enabled === true;
    const folderPath = cleanText(input.folderPath, 500);
    if (enabled && !folderPath) throw new Error("Indicá la carpeta compartida de Google Drive.");
    data.settings.sharedDrive = {
      ...sharedDriveConfig(),
      enabled,
      folderPath,
      syncIntervalSeconds: Math.min(300, Math.max(5, Number(input.syncIntervalSeconds) || 15)),
      installationId: sharedDriveConfig().installationId || `install_${randomUUID()}`,
    };
    if (enabled) await ensureSharedDriveRoot();
    sharedDriveRuntime.dirty = true;
    await store.save();
    restartSharedDriveTimer();
    if (enabled) await syncSharedDrive({ force: true });
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/shared-drive/sync", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user || !["admin", "manager"].includes(user.role)) return response.status(403).json({ error: "Esta acción requiere permisos de gerente o administrador." });
    if (sharedDriveConfig().enabled !== true) throw new Error("Activá primero la sincronización con Drive.");
    await syncSharedDrive({ force: true });
    response.json(await sharedDriveOverview(user));
  } catch (error) { next(error); }
});

app.get("/api/shared-drive/client/:phone", async (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    response.json(await sharedClientProfileByPhone(request.params.phone));
  } catch (error) { next(error); }
});

app.get("/api/shared-drive/reports", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!canViewGlobalReports(user)) return response.status(403).json({ error: "Tu usuario no tiene permiso para consultar informes consolidados." });
    if (sharedDriveConfig().enabled !== true) throw new Error("La sincronización con Drive no está activa.");
    const days = Number(request.query.days || 30);
    const branchCode = cleanText(request.query.branchCode, 60);
    const ownerUserId = cleanText(request.query.userId, 180);
    response.setHeader("Cache-Control", "no-store");
    response.json(await sharedDriveReport({ days, branchCode: branchCode === "all" ? "" : branchCode, ownerUserId: ownerUserId === "all" ? "" : ownerUserId }));
  } catch (error) { next(error); }
});

app.get("/api/media/:id", (request, response, next) => {
  const attachment = findAttachment(request.params.id);
  if (!attachment?.available || !attachment.storedName) {
    return response.status(404).json({ error: "El archivo ya no está disponible en este equipo." });
  }
  const filePath = path.join(mediaDirectory, path.basename(attachment.storedName));
  const disposition = attachment.kind === "document" ? "attachment" : "inline";
  response.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  response.setHeader(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(safeFileName(attachment.fileName))}`,
  );
  return response.sendFile(filePath, (error) => {
    if (error && !response.headersSent) next(error);
  });
});

app.get("/api/data/template/:type.csv", (request, response, next) => {
  try {
    const type = cleanText(request.params.type, 40);
    const format = dataFormats[type];
    if (!format) throw new Error("Formato no encontrado.");
    const user = currentUser(request);
    if (["users", "branches"].includes(type) && user?.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede descargar esta plantilla." });
    if (["stock", "replies"].includes(type) && !canSeeAll(user)) return response.status(403).json({ error: "Esta plantilla requiere permisos de gerente o administrador." });
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="PLANTILLA-${format.file.toUpperCase()}.csv"`);
    response.send(csvText(format.headers, format.example));
  } catch (error) { next(error); }
});

app.get("/api/data/export/:type.csv", (request, response, next) => {
  try {
    const type = cleanText(request.params.type, 40);
    const format = dataFormats[type];
    if (!format) throw new Error("Exportación no encontrada.");
    const user = currentUser(request);
    let rows = [];
    if (type === "stock") {
      if (!canSeeAll(user)) return response.status(403).json({ error: "Esta exportación requiere permisos de gerente o administrador." });
      rows = (data.products || []).map((item) => [item.sku, item.name, item.description || "", item.available || 0, item.minStock || 0, item.price || 0, item.active === false ? "NO" : "SI"]);
    } else if (type === "contacts") {
      rows = visibleContactsFor(user).map((client) => {
        const visibleDeal = (data.deals || []).find((deal) => deal.clientId === client.id && (user?.role === "admin" || deal.branchId === user?.branchId));
        const branchId = visibleDeal?.branchId || user?.branchId || primaryBranchId();
        const branchOwner = client.branchOwners?.[branchId];
        return [client.id, client.name || "", client.phone || "", client.document || "", client.ruc || "", client.email || "", client.company || "", client.city || "", client.address || "", (client.tags || []).join(","), client.notes || "", client.marketingOptIn === true ? "SI" : "NO", getBranch(branchId)?.code || "", data.users.find((entry) => entry.id === (branchOwner?.userId || client.ownerUserId))?.username || ""];
      });
    } else if (type === "users") {
      if (user?.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede exportar usuarios." });
      rows = (data.users || []).map((entry) => [entry.username, entry.name, entry.role === "agent" ? "agente" : entry.role === "supervisor" ? "jefe" : entry.role === "manager" ? "gerente" : "admin", getBranch(entry.branchId)?.code || "", entry.clientDailyLimit || 0, entry.role === "admin" || entry.permissions?.globalReports === true ? "SI" : "NO", entry.active === false ? "NO" : "SI", ""]);
    } else if (type === "branches") {
      if (user?.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede exportar sucursales." });
      rows = (data.branches || []).map((entry) => [entry.code || "", entry.name || "", entry.city || "", entry.address || "", entry.phone || "", entry.introMessage || "", entry.active === false ? "NO" : "SI"]);
    } else if (type === "replies") {
      if (!canSeeAll(user)) return response.status(403).json({ error: "Esta exportación requiere permisos de gerente o administrador." });
      rows = (data.quickReplies || []).map((entry) => [entry.title, entry.shortcut, entry.category || "General", entry.body, entry.active === false ? "NO" : "SI"]);
    }
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="EXPORT-${format.file.toUpperCase()}-${paraguayDateKey()}.csv"`);
    response.send(csvText(format.headers, rows));
  } catch (error) { next(error); }
});

app.post("/api/data/import/:type", express.text({ type: () => true, limit: "10mb" }), async (request, response, next) => {
  try {
    const type = cleanText(request.params.type, 40);
    const format = dataFormats[type];
    if (!format) throw new Error("Importación no encontrada.");
    const actor = currentUser(request);
    if (["users", "branches"].includes(type) && actor.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede importar este formato." });
    if (["stock", "replies"].includes(type) && !canSeeAll(actor)) return response.status(403).json({ error: "Esta importación requiere permisos de gerente o administrador." });
    const rows = parseCsv(request.body);
    if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos una fila.");
    const headers = rows[0].map(headerKey);
    const col = (...names) => headers.findIndex((value) => names.includes(value));
    let created = 0; let updated = 0; let skipped = 0; const errors = [];

    if (type === "stock") {
      const ix = { sku: col("codigo", "codigoproducto", "sku"), name: col("nombre", "producto"), description: col("descripcion", "detalle"), available: col("stock", "disponible", "cantidad"), minStock: col("stockminimo", "minimo", "minstock"), price: col("precio", "price"), active: col("activo", "active") };
      if (ix.sku < 0 || ix.name < 0) throw new Error("La plantilla necesita Código y Nombre.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const sku = cleanText(row[ix.sku], 80); const name = cleanText(row[ix.name], 160);
          if (!sku || !name) { skipped += 1; continue; }
          const existing = data.products.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
          upsertProduct(data, { id: existing?.id, sku, name, description: ix.description >= 0 ? row[ix.description] : existing?.description, available: ix.available >= 0 ? Number(String(row[ix.available]).replace(",", ".")) : existing?.available || 0, minStock: ix.minStock >= 0 ? Number(String(row[ix.minStock]).replace(",", ".")) : existing?.minStock || 0, price: ix.price >= 0 ? Number(String(row[ix.price]).replace(/\./g, "").replace(",", ".")) : existing?.price || 0, active: ix.active >= 0 ? csvBoolean(row[ix.active], existing?.active !== false) : existing?.active !== false });
          existing ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "contacts") {
      const ix = { id: col("id"), name: col("nombre", "name"), phone: col("telefono", "phone", "whatsapp"), document: col("documento", "ci"), ruc: col("ruc"), email: col("correo", "email"), company: col("empresa", "company"), city: col("ciudad", "city"), address: col("direccion", "address"), tags: col("etiquetas", "tags"), notes: col("notas", "notes"), branch: col("sucursalcodigo", "sucursal", "branch"), owner: col("responsableusuario", "responsable", "owner"), marketingOptIn: col("consentimientomarketing", "marketingoptin", "aceptacampanas", "aceptapromociones") };
      if (ix.name < 0 || ix.phone < 0) throw new Error("La plantilla necesita Nombre y Teléfono.");
      const today = paraguayDateKey();
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const phone = normalizePhone(row[ix.phone]); const name = cleanText(row[ix.name], 120);
          if (!phone || phone.length < 10 || phone.length > 15 || !name) { skipped += 1; continue; }
          const jid = `${phone}@s.whatsapp.net`;
          const requestedBranchCode = ix.branch >= 0 ? cleanText(row[ix.branch], 80).toUpperCase() : "";
          const requestedBranch = requestedBranchCode ? (data.branches || []).find((entry) => cleanText(entry.code, 80).toUpperCase() === requestedBranchCode && entry.active !== false) : null;
          if (requestedBranchCode && !requestedBranch) throw new Error(`No existe una sucursal activa con código ${requestedBranchCode}.`);
          const branchId = actor.role === "admin" ? (requestedBranch?.id || primaryBranchId()) : (actor.branchId || primaryBranchId());
          if (actor.role !== "admin" && requestedBranch && requestedBranch.id !== branchId) throw new Error("No podés importar clientes en otra sucursal.");
          if (!userCanAccessBranch(actor, branchId)) throw new Error("No tenés acceso a esta sucursal.");
          let client = ix.id >= 0 && row[ix.id] ? findClient(data, cleanText(row[ix.id], 120)) : data.clients.find((entry) => entry.jid === jid || normalizePhone(entry.phone) === phone);
          const wasExisting = Boolean(client);
          const branchOwner = client?.branchOwners?.[branchId];
          if (client && actor.role === "agent" && branchOwner?.userId && branchOwner.userId !== actor.id) throw new Error("Ese cliente pertenece a otro agente en esta sucursal.");
          if (!client && actor.role === "agent") {
            const used = data.clientLoads.filter((entry) => entry.userId === actor.id && entry.date === today).length;
            const limit = Math.max(1, Number(actor.clientDailyLimit) || 1);
            if (used >= limit) throw new Error(`Límite diario de ${limit} clientes alcanzado.`);
          }
          let deal = findOpenDeal(data, jid, branchId);
          if (!deal) deal = createDeal(data, { jid, name, branchId, source: "csv" });
          client = findClient(data, deal.clientId) || client;
          if (!client) throw new Error("No se pudo crear la ficha del cliente.");
          let owner = null;
          if (actor.role === "admin" && ix.owner >= 0 && cleanText(row[ix.owner], 80)) owner = data.users.find((entry) => entry.username.toLowerCase() === cleanText(row[ix.owner], 80).toLowerCase() && entry.active !== false && (!entry.branchId || entry.branchId === branchId)) || null;
          if (!owner && actor.role === "agent") owner = actor;
          if (!owner && client.branchOwners?.[branchId]?.userId) owner = data.users.find((entry) => entry.id === client.branchOwners[branchId].userId) || null;
          if (owner) {
            client.ownerUserId = owner.id; client.ownerName = owner.name; deal.ownerUserId = owner.id; deal.ownerName = owner.name;
            if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
            client.branchOwners[branchId] = { userId: owner.id, userName: owner.name, updatedAt: timestamp() };
          }
          updateClient(data, client.id, { name, document: ix.document >= 0 ? row[ix.document] : client.document, ruc: ix.ruc >= 0 ? row[ix.ruc] : client.ruc, email: ix.email >= 0 ? row[ix.email] : client.email, company: ix.company >= 0 ? row[ix.company] : client.company, city: ix.city >= 0 ? row[ix.city] : client.city, address: ix.address >= 0 ? row[ix.address] : client.address, notes: ix.notes >= 0 ? row[ix.notes] : client.notes, tags: ix.tags >= 0 ? String(row[ix.tags] || "").split(/[,|]/).map((v) => v.trim()).filter(Boolean) : client.tags, marketingOptIn: ix.marketingOptIn >= 0 ? csvBoolean(row[ix.marketingOptIn], client.marketingOptIn === true) : client.marketingOptIn });
          if (ix.marketingOptIn >= 0) client.marketingOptInAt = client.marketingOptIn === true ? (client.marketingOptInAt || timestamp()) : null;
          deal.source = "csv"; deal.createdByUserId = actor.id;
          if (!wasExisting && actor.role === "agent") data.clientLoads.push({ id: makeId("clientload"), userId: actor.id, dealId: deal.id, date: today, at: timestamp() });
          wasExisting ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "users") {
      const ix = { username: col("usuario", "username"), name: col("nombre", "name"), role: col("rol", "role"), branch: col("sucursalcodigo", "sucursal", "branch"), limit: col("limiteclientesdia", "limite", "clientdailylimit"), globalReports: col("informesglobales", "reportesglobales", "globalreports"), active: col("activo", "active"), password: col("password", "contrasena", "clave") };
      if (ix.username < 0 || ix.name < 0) throw new Error("La plantilla necesita Usuario y Nombre.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const username = cleanText(row[ix.username], 80).toLowerCase(); const name = cleanText(row[ix.name], 120);
          if (!username || !name || !/^[a-z0-9._-]{3,80}$/.test(username)) { skipped += 1; continue; }
          let user = data.users.find((entry) => entry.username.toLowerCase() === username); const existed = Boolean(user);
          const rawRole = ix.role >= 0 ? cleanText(row[ix.role], 30).toLowerCase() : "agent";
          const role = ["admin", "administrador"].includes(rawRole) ? "admin" : ["manager", "gerente"].includes(rawRole) ? "manager" : ["supervisor", "jefe", "jefatura"].includes(rawRole) ? "supervisor" : "agent";
          const password = ix.password >= 0 ? String(row[ix.password] || "") : "";
          const branchCode = ix.branch >= 0 ? cleanText(row[ix.branch], 80).toUpperCase() : "";
          const requestedBranch = branchCode ? (data.branches || []).find((entry) => cleanText(entry.code, 80).toUpperCase() === branchCode && entry.active !== false) : null;
          if (branchCode && !requestedBranch) throw new Error(`No existe una sucursal activa con código ${branchCode}.`);
          const branchId = role === "admin" && !branchCode ? null : (requestedBranch?.id || primaryBranchId());
          if (!user) {
            if (password.length < 8) throw new Error("Para crear un usuario, la contraseña debe tener al menos 8 caracteres.");
            user = { id: makeId("user"), username, name, role, branchId, passwordHash: hashPassword(password), active: ix.active >= 0 ? csvBoolean(row[ix.active]) : true, clientDailyLimit: Math.max(1, Number(ix.limit >= 0 ? row[ix.limit] : 30) || 30), permissions: { globalReports: role === "admin" || (ix.globalReports >= 0 && csvBoolean(row[ix.globalReports], false)) }, createdAt: timestamp(), updatedAt: timestamp() };
            data.users.push(user);
          } else {
            user.name = name; user.role = role; user.branchId = branchId; user.active = ix.active >= 0 ? csvBoolean(row[ix.active], user.active !== false) : user.active !== false; user.clientDailyLimit = Math.max(1, Number(ix.limit >= 0 ? row[ix.limit] : user.clientDailyLimit) || 30); user.permissions = { ...(user.permissions || {}), globalReports: role === "admin" || (ix.globalReports >= 0 ? csvBoolean(row[ix.globalReports], false) : user.permissions?.globalReports === true) }; if (password) { if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres."); user.passwordHash = hashPassword(password); } user.updatedAt = timestamp();
          }
          existed ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "branches") {
      const ix = { code: col("codigo", "code"), name: col("nombre", "name"), city: col("ciudad", "city"), address: col("direccion", "address"), phone: col("whatsapp", "telefono", "phone"), intro: col("mensajepresentacion", "mensaje", "intromessage"), active: col("activo", "active") };
      if (ix.code < 0 || ix.name < 0) throw new Error("La plantilla necesita Código y Nombre.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i];
          const code = cleanText(row[ix.code], 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
          const name = cleanText(row[ix.name], 120);
          if (!code || !name) { skipped += 1; continue; }
          const phone = ix.phone >= 0 ? cleanText(row[ix.phone], 40) : "";
          if (phone && (normalizePhone(phone).length < 10 || normalizePhone(phone).length > 15)) throw new Error("Número de WhatsApp inválido.");
          let branch = (data.branches || []).find((entry) => entry.code.toLowerCase() === code.toLowerCase());
          const existed = Boolean(branch);
          if (!branch) {
            branch = { id: makeId("branch"), code, name, isLocal: false, createdAt: timestamp() };
            data.branches.push(branch);
          }
          if (phone && data.branches.some((entry) => entry.id !== branch.id && normalizePhone(entry.phone) === normalizePhone(phone))) throw new Error("Ese WhatsApp ya pertenece a otra sucursal.");
          Object.assign(branch, {
            code, name,
            city: ix.city >= 0 ? cleanText(row[ix.city], 120) : branch.city || "",
            address: ix.address >= 0 ? cleanText(row[ix.address], 240) : branch.address || "",
            phone: ix.phone >= 0 ? phone : branch.phone || "",
            introMessage: ix.intro >= 0 ? cleanText(row[ix.intro], 1200) || branch.introMessage || "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}" : branch.introMessage || "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}",
            active: ix.active >= 0 ? csvBoolean(row[ix.active], branch.active !== false) : branch.active !== false,
            updatedAt: timestamp(),
          });
          existed ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "replies") {
      const ix = { title: col("titulo", "title"), shortcut: col("atajo", "shortcut"), category: col("categoria", "category"), body: col("respuesta", "body", "mensaje"), active: col("activo", "active") };
      if (ix.title < 0 || ix.body < 0) throw new Error("La plantilla necesita Título y Respuesta.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const title = cleanText(row[ix.title], 120); const body = cleanText(row[ix.body], 3000); if (!title || !body) { skipped += 1; continue; }
          const shortcut = ix.shortcut >= 0 ? cleanText(row[ix.shortcut], 40) : "";
          let reply = data.quickReplies.find((entry) => shortcut && entry.shortcut.toLowerCase() === shortcut.toLowerCase()) || data.quickReplies.find((entry) => entry.title.toLowerCase() === title.toLowerCase()); const existed = Boolean(reply);
          if (!reply) { reply = { id: makeId("reply"), createdAt: timestamp(), order: data.quickReplies.length }; data.quickReplies.push(reply); }
          Object.assign(reply, { title, shortcut, category: ix.category >= 0 ? cleanText(row[ix.category], 80) || "General" : reply.category || "General", body, active: ix.active >= 0 ? csvBoolean(row[ix.active], reply.active !== false) : reply.active !== false, updatedAt: timestamp() });
          existed ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (data.clientLoads.length > 10000) data.clientLoads.splice(0, data.clientLoads.length - 10000);
    addActivity(data, `${actor.name} importó ${format.file}: ${created} nuevos, ${updated} actualizados.`, "success");
    await store.save();
    response.json({ ...stateResponse(request), importResult: { type, created, updated, skipped, errors: errors.slice(0, 50) } });
  } catch (error) { next(error); }
});

app.get("/api/backup/export", requireAdmin, async (_request, response, next) => {
  try {
    const zip = createStoredZip(await backupEntries());
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="WhatsBot-CRM-Backup-${paraguayDateKey()}.zip"`);
    response.setHeader("Content-Length", String(zip.length));
    response.send(zip);
  } catch (error) { next(error); }
});

app.post("/api/backup/import", express.raw({ type: () => true, limit: "512mb" }), requireAdmin, async (request, response, next) => {
  const tempDirectory = `${dataDirectory}.restore-${Date.now()}`;
  try {
    if (!Buffer.isBuffer(request.body) || request.body.length < 22) throw new Error("Seleccioná un respaldo ZIP válido.");
    const entries = parseStoredZip(request.body);
    const dbEntry = entries.find((entry) => entry.name === "whatsbot-crm.json");
    if (!dbEntry) throw new Error("El respaldo no contiene la base de datos de WhatsBot CRM.");
    const restored = normalizeData(JSON.parse(dbEntry.data.toString("utf8")));
    if (!Array.isArray(restored.branches)) restored.branches = [];
    if (!Array.isArray(restored.transfers)) restored.transfers = [];
    if (!restored.branches.length) {
      restored.branches.push({ id: "branch_principal", code: "CASA-CENTRAL", name: "Sucursal Principal", city: "", address: "", phone: "", active: true, isLocal: true, introMessage: "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}", createdAt: timestamp(), updatedAt: timestamp() });
    }
    const restoredLocal = restored.branches.find((branch) => branch.isLocal === true) || restored.branches[0];
    for (const branch of restored.branches) branch.isLocal = branch.id === restoredLocal.id;
    const restoredPrimaryId = restoredLocal.id;
    for (const user of restored.users || []) if (user.role !== "admin") user.branchId = restoredPrimaryId;
    for (const deal of restored.deals || []) {
      if (deal.branchId && deal.branchId !== restoredPrimaryId) deal.legacyBranchId = deal.branchId;
      deal.branchId = restoredPrimaryId;
    }
    for (const client of restored.clients || []) {
      if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
      for (const deal of (restored.deals || []).filter((entry) => entry.clientId === client.id && entry.ownerUserId)) {
        if (!client.branchOwners[deal.branchId]) client.branchOwners[deal.branchId] = { userId: deal.ownerUserId, userName: deal.ownerName || "", updatedAt: deal.updatedAt || timestamp() };
      }
    }
    await rm(tempDirectory, { recursive: true, force: true });
    await mkdir(tempDirectory, { recursive: true });
    for (const entry of entries) {
      if (entry.name === "BACKUP-INFO.json") continue;
      const destination = path.join(tempDirectory, ...entry.name.split("/"));
      const relative = path.relative(tempDirectory, destination);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("El respaldo contiene rutas no permitidas.");
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, entry.data, { mode: 0o600 });
    }
    for (const branch of [...(data.branches || [])]) {
      if (branch.id !== primaryBranchId()) await disconnectBranchConnection(branch.id).catch(() => {});
    }
    if (whatsappSocket || connectionStatus !== "disconnected") await disconnect();
    await rm(dataDirectory, { recursive: true, force: true });
    await rename(tempDirectory, dataDirectory);
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, restored);
    store.data = data;
    await store.save();
    connectionStatus = "disconnected"; qrDataUrl = null; connectedAccount = null; lastError = null; manualLogout = false;
    addActivity(data, "Respaldo completo importado correctamente.", "success");
    await store.save();
    response.json({ imported: true, message: "Respaldo restaurado. Volvé a iniciar sesión para cargar la información restaurada." });
    sessions.clear();
    if (!mockMode && data.settings.whatsappMode !== "cloud" && existsSync(path.join(authDirectory, "creds.json"))) setTimeout(() => void startConnection(), 500);
    if (!mockMode) {
      // Las sucursales externas usan instalaciones independientes; no se vinculan desde esta PC.
    }
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    next(error);
  }
});


app.get("/api/operations/header", async (request, response, next) => {
  try {
    const user=currentUser(request); if(!user)return response.status(401).json({error:"Sesión requerida."});
    const branch=getBranch(user.branchId) || primaryBranch();
    const weather=await branchWeather(branch);
    response.json({ serverNow:timestamp(), timezone:branch?.timezone || data.settings.operational?.timezoneDefault || "America/Asuncion", branchId:branch?.id||null, branchName:branch?.name||"Sucursal", weather, incident:{...(data.settings.operational?.incident||{})}, supportMessage:data.settings.operational?.supportMessage||"" });
  } catch(error){ next(error); }
});

app.post("/api/operations/settings", requireAdmin, async (request,response,next)=>{
  try {
    const input=request.body||{}; const op=data.settings.operational || (data.settings.operational={});
    if(input.weatherEnabled!==undefined)op.weatherEnabled=input.weatherEnabled!==false;
    if(input.weatherRefreshMinutes!==undefined)op.weatherRefreshMinutes=Math.min(120,Math.max(5,Number(input.weatherRefreshMinutes)||15));
    if(input.timezoneDefault!==undefined)op.timezoneDefault=cleanText(input.timezoneDefault,80)||"America/Asuncion";
    if(input.supportMessage!==undefined)op.supportMessage=cleanText(input.supportMessage,1000);
    if(input.incident && typeof input.incident==="object") { op.incident={ enabled:input.incident.enabled===true, severity:["info","warning","critical"].includes(input.incident.severity)?input.incident.severity:"warning", title:cleanText(input.incident.title||"Aviso operativo",160), message:cleanText(input.incident.message,2000), updatedAt:timestamp(), updatedByName:currentUser(request)?.name||"Administrador" }; }
    if(input.branchId){ const branch=getBranch(cleanText(input.branchId,120)); if(!branch)throw new Error("Sucursal no encontrada."); if(input.timezone!==undefined)branch.timezone=cleanText(input.timezone,80)||op.timezoneDefault||"America/Asuncion"; if(input.weatherLocation!==undefined)branch.weatherLocation=cleanText(input.weatherLocation,240); if(input.weatherLatitude!==undefined)branch.weatherLatitude=input.weatherLatitude===""||input.weatherLatitude===null?null:Number(input.weatherLatitude); if(input.weatherLongitude!==undefined)branch.weatherLongitude=input.weatherLongitude===""||input.weatherLongitude===null?null:Number(input.weatherLongitude); branch.updatedAt=timestamp(); weatherCache.delete(branch.id); }
    await store.save(); response.json(stateResponse(request));
  } catch(error){ next(error); }
});

app.get("/api/news", async (request,response)=>{ const user=currentUser(request); if(!user)return response.status(401).json({error:"Sesión requerida."}); const news=publicNewsFor(user); response.json({news,unread:news.filter((n)=>!n.read).length,canPublish:canPublishNews(user)}); });
app.post("/api/news", async (request,response,next)=>{
  try { const user=currentUser(request); if(!canPublishNews(user))return response.status(403).json({error:"No tenés permiso para publicar noticias."}); const title=cleanText(request.body?.title,180), body=cleanText(request.body?.body,8000); if(!title||!body)throw new Error("Ingresá título y contenido."); let mode=["all","branch","users","roles"].includes(request.body?.audienceMode)?request.body.audienceMode:"all"; let branchIds=Array.isArray(request.body?.branchIds)?request.body.branchIds.filter(id=>getBranch(id)):[]; let userIds=Array.isArray(request.body?.userIds)?request.body.userIds.filter(id=>data.users.some(u=>u.id===id&&u.active!==false)):[]; let roles=Array.isArray(request.body?.roles)?request.body.roles.filter(r=>["agent","supervisor","manager","admin"].includes(r)):[];
    if(user.role==="supervisor"){ if(mode==="all"){mode="branch";branchIds=[user.branchId];} if(mode==="branch")branchIds=[user.branchId]; if(mode==="users")userIds=userIds.filter(id=>data.users.some(u=>u.id===id&&u.branchId===user.branchId)); }
    if(mode==="branch"&&!branchIds.length)branchIds=[user.branchId||primaryBranchId()].filter(Boolean); if(mode==="users"&&!userIds.length)throw new Error("Seleccioná al menos un usuario.");
    const entry={id:makeId("news"),title,body,priority:["normal","important","urgent"].includes(request.body?.priority)?request.body.priority:"normal",pinned:request.body?.pinned===true,audience:{mode,branchIds,userIds,roles},attachments:[],active:true,createdAt:timestamp(),updatedAt:timestamp(),createdByUserId:user.id,createdByName:user.name,createdByRole:user.role}; data.news.unshift(entry); data.news.splice(1000); addActivity(data,`${user.name} publicó la noticia “${title}”.`,"success"); await store.save(); response.json({news:entry,state:stateResponse(request)});
  }catch(error){next(error);} });
app.post("/api/news/:id/attachments", express.raw({type:()=>true,limit:maximumMediaBytes}), async (request,response,next)=>{
  try { const user=currentUser(request); if(!canPublishNews(user))return response.status(403).json({error:"No tenés permiso para adjuntar archivos."}); const entry=(data.news||[]).find(n=>n.id===request.params.id); if(!entry)throw new Error("Noticia no encontrada."); if(user.role==="supervisor"&&entry.createdByUserId!==user.id)throw new Error("Solo podés editar noticias creadas por vos."); if(!Buffer.isBuffer(request.body)||!request.body.length)throw new Error("Seleccioná un archivo."); if((entry.attachments||[]).length>=8)throw new Error("Máximo 8 archivos por noticia."); const raw=request.headers["x-file-name"]?decodeURIComponent(String(request.headers["x-file-name"])):"archivo"; const fileName=safeFileName(raw,"archivo"); const mime=cleanText(request.headers["content-type"]||"application/octet-stream",160); const allowed=/^(image\/|video\/|audio\/|application\/pdf$|application\/vnd\.|application\/msword$|text\/)/i.test(mime); if(!allowed)throw new Error("Formato no permitido para noticias."); await mkdir(newsMediaDirectory,{recursive:true}); const id=makeId("newsfile"); const ext=path.extname(fileName).toLowerCase().slice(0,12); const storedName=`${id}${ext}`; await writeFile(path.join(newsMediaDirectory,storedName),request.body,{mode:0o600}); const kind=mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":"document"; const file={id,fileName,storedName,mimeType:mime,size:request.body.length,kind,createdAt:timestamp()}; entry.attachments=entry.attachments||[];entry.attachments.push(file);entry.updatedAt=timestamp();await store.save();response.json({attachment:{...file,url:`/api/news/${encodeURIComponent(entry.id)}/attachments/${encodeURIComponent(id)}`},state:stateResponse(request)});
  }catch(error){next(error);} });
app.get("/api/news/:newsId/attachments/:fileId", async (request,response,next)=>{ try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const entry=(data.news||[]).find(n=>n.id===request.params.newsId);if(!entry||!newsVisibleTo(entry,user))return response.status(404).end();const file=(entry.attachments||[]).find(f=>f.id===request.params.fileId);if(!file)return response.status(404).end();const fp=path.join(newsMediaDirectory,path.basename(file.storedName));if(!existsSync(fp))return response.status(404).end();response.setHeader("Content-Type",file.mimeType||"application/octet-stream");response.setHeader("Cache-Control","private, max-age=300");response.setHeader("Content-Disposition",`${["image","video","audio"].includes(file.kind)?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName||"archivo")}`);return response.sendFile(fp);}catch(error){next(error);} });
app.post("/api/news/:id/read",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const entry=(data.news||[]).find(n=>n.id===request.params.id);if(!entry||!newsVisibleTo(entry,user))throw new Error("Noticia no encontrada.");if(!(data.newsReads||[]).some(r=>r.newsId===entry.id&&r.userId===user.id)){data.newsReads.unshift({id:makeId("newsread"),newsId:entry.id,userId:user.id,at:timestamp()});data.newsReads.splice(20000);await store.save();}response.json({ok:true,unread:publicNewsFor(user).filter(n=>!n.read).length});}catch(error){next(error);} });
app.delete("/api/news/:id",async(request,response,next)=>{try{const user=currentUser(request);if(!canPublishNews(user))return response.status(403).json({error:"Sin permiso."});const idx=(data.news||[]).findIndex(n=>n.id===request.params.id);if(idx<0)throw new Error("Noticia no encontrada.");const entry=data.news[idx];if(user.role==="supervisor"&&entry.createdByUserId!==user.id)throw new Error("Solo podés eliminar noticias creadas por vos.");data.news.splice(idx,1);for(const file of entry.attachments||[])await unlink(path.join(newsMediaDirectory,path.basename(file.storedName))).catch(()=>{});data.newsReads=(data.newsReads||[]).filter(r=>r.newsId!==entry.id);await store.save();response.json(stateResponse(request));}catch(error){next(error);} });

app.post("/api/branding", requireAdmin, async (request, response, next) => {
  try {
    const input = request.body || {};
    const brand = data.settings.branding || (data.settings.branding = {});
    if (typeof input.systemName === "string") brand.systemName = cleanText(input.systemName, 80) || "WhatsBot CRM";
    if (typeof input.shortName === "string") brand.shortName = cleanText(input.shortName, 40) || brand.systemName || "WhatsBot";
    if (typeof input.subtitle === "string") brand.subtitle = cleanText(input.subtitle, 40) || "CRM LOCAL";
    for (const field of ["primaryColor", "accentColor", "backgroundColor", "sidebarColor", "surfaceColor", "textColor"]) {
      if (typeof input[field] === "string") {
        if (!/^#[0-9a-fA-F]{6}$/.test(input[field])) throw new Error("Los colores deben estar en formato hexadecimal, por ejemplo #143C2F.");
        brand[field] = input[field].toUpperCase();
      }
    }
    if (typeof input.fontStyle === "string" && ["modern","system","rounded","classic"].includes(input.fontStyle)) brand.fontStyle = input.fontStyle;
    if (input.radius !== undefined && ["10","14","18","24"].includes(String(input.radius))) brand.radius = String(input.radius);
    if (typeof input.logoFit === "string" && ["contain","cover"].includes(input.logoFit)) brand.logoFit = input.logoFit;
    if (typeof input.defaultTheme === "string" && ["light","dark","system"].includes(input.defaultTheme)) brand.defaultTheme = input.defaultTheme;
    if (typeof input.loginKicker === "string") brand.loginKicker = cleanText(input.loginKicker, 50) || "CONTROL LOCAL · 24/7";
    if (typeof input.loginMessage === "string") brand.loginMessage = cleanText(input.loginMessage, 220) || "Ingresá con tu usuario para administrar las conversaciones, el bot y el stock.";
    if (typeof input.loginStyle === "string" && ["ambient","split","minimal"].includes(input.loginStyle)) brand.loginStyle = input.loginStyle;
    if (typeof input.showSubtitle === "boolean") brand.showSubtitle = input.showSubtitle;
    addActivity(data, "Identidad visual del sistema actualizada.", "success");
    await store.save();
    response.json({ ...stateResponse(request), branding: brandingResponse() });
  } catch (error) { next(error); }
});

app.post("/api/branding/logo", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }), requireAdmin, async (request, response, next) => {
  try {
    if (!Buffer.isBuffer(request.body) || !request.body.length) throw new Error("Seleccioná una imagen PNG, JPG o WEBP de hasta 2 MB.");
    const mime = String(request.headers["content-type"] || "").split(";")[0].toLowerCase();
    const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[mime];
    if (!ext) throw new Error("Formato de logo no permitido. Usá PNG, JPG o WEBP.");
    const brandingDirectory = path.join(dataDirectory, "branding");
    await mkdir(brandingDirectory, { recursive: true });
    for (const oldExt of [".png", ".jpg", ".jpeg", ".webp"]) await unlink(path.join(brandingDirectory, `logo${oldExt}`)).catch(() => {});
    const fileName = `logo${ext}`;
    await writeFile(path.join(brandingDirectory, fileName), request.body, { mode: 0o600 });
    data.settings.branding.logoFileName = fileName;
    addActivity(data, "Logo del sistema actualizado.", "success");
    await store.save();
    response.json({ ...stateResponse(request), branding: brandingResponse() });
  } catch (error) { next(error); }
});

app.delete("/api/branding/logo", requireAdmin, async (request, response, next) => {
  try {
    const fileName = path.basename(data.settings.branding?.logoFileName || "");
    if (fileName) await unlink(path.join(dataDirectory, "branding", fileName)).catch(() => {});
    data.settings.branding.logoFileName = "";
    await store.save();
    response.json({ ...stateResponse(request), branding: brandingResponse() });
  } catch (error) { next(error); }
});

app.post("/api/settings", requireAdmin, async (request, response, next) => {
  try {
    const input = request.body || {};
    if (typeof input.instructions === "string") {
      const instructions = cleanText(input.instructions, 12000);
      if (instructions.length < 10) throw new Error("Las instrucciones son demasiado cortas.");
      data.settings.instructions = instructions;
    }
    if (typeof input.model === "string") {
      const model = cleanText(input.model, 100);
      if (!model) throw new Error("Ingresá un modelo válido.");
      data.settings.model = model;
    }
    if (typeof input.apiKey === "string" && input.apiKey.trim()) {
      data.settings.apiKey = input.apiKey.trim();
    }
    if (input.clearApiKey === true) data.settings.apiKey = "";
    if (typeof input.botEnabled === "boolean") data.settings.botEnabled = input.botEnabled;
    if (typeof input.botCanReserve === "boolean") data.settings.botCanReserve = input.botCanReserve;
    if (typeof input.whatsappMode === "string") {
      const mode = input.whatsappMode === "cloud" ? "cloud" : "qr";
      data.settings.whatsappMode = mode;
      if (mode === "cloud" && whatsappSocket) await disconnect();
    }
    if (input.whatsappApi && typeof input.whatsappApi === "object") {
      const config = input.whatsappApi;
      if (typeof config.phoneNumberId === "string") data.settings.whatsappApi.phoneNumberId = cleanText(config.phoneNumberId, 80);
      if (typeof config.businessAccountId === "string") data.settings.whatsappApi.businessAccountId = cleanText(config.businessAccountId, 80);
      if (typeof config.apiVersion === "string") data.settings.whatsappApi.apiVersion = cleanText(config.apiVersion, 20) || "v23.0";
      if (typeof config.accessToken === "string" && config.accessToken.trim()) data.settings.whatsappApi.accessToken = config.accessToken.trim();
      if (typeof config.verifyToken === "string" && config.verifyToken.trim()) data.settings.whatsappApi.verifyToken = config.verifyToken.trim();
      if (config.clearAccessToken === true) data.settings.whatsappApi.accessToken = "";
      if (config.clearVerifyToken === true) data.settings.whatsappApi.verifyToken = "";
    }
    if (input.smartCapture && typeof input.smartCapture === "object") {
      const cfg=input.smartCapture;
      if (typeof cfg.enabled === "boolean") data.settings.smartCapture.enabled=cfg.enabled;
      if (typeof cfg.suggestionsEnabled === "boolean") data.settings.smartCapture.suggestionsEnabled=cfg.suggestionsEnabled;
      if (typeof cfg.autoApplySafe === "boolean") data.settings.smartCapture.autoApplySafe=cfg.autoApplySafe;
      if (typeof cfg.aiExtraction === "boolean") data.settings.smartCapture.aiExtraction=cfg.aiExtraction;
      if (cfg.confidenceThreshold !== undefined) data.settings.smartCapture.confidenceThreshold=Math.min(100,Math.max(60,Number(cfg.confidenceThreshold)||82));
      if (cfg.autoApplyConfidence !== undefined) data.settings.smartCapture.autoApplyConfidence=Math.min(100,Math.max(85,Number(cfg.autoApplyConfidence)||96));
      if (Array.isArray(cfg.autoApplyFields)) data.settings.smartCapture.autoApplyFields=cfg.autoApplyFields.map(v=>cleanText(v,80)).filter(v=>Object.prototype.hasOwnProperty.call(SMART_CAPTURE_FIELDS,v)||fieldDefinition(v,"contact")).slice(0,30);
    }
    Object.assign(data.settings, validateAutomationSettings(input));
    addActivity(data, "Configuración guardada.", "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/password", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const current = String(request.body?.current || "");
    const password = String(request.body?.password || "");
    if (!user || !verifyPassword(current, user.passwordHash)) {
      return response.status(400).json({ error: "La contraseña actual no coincide." });
    }
    if (password.length < 8 || password.length > 128) throw new Error("La nueva contraseña debe tener entre 8 y 128 caracteres.");
    user.passwordHash = hashPassword(password);
    user.updatedAt = timestamp();
    for (const [token, session] of sessions.entries()) if (session.userId === user.id) sessions.delete(token);
    await store.save();
    response.setHeader("Set-Cookie", "whatsbot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    response.json({ ok: true, reauth: true });
  } catch (error) { next(error); }
});

app.post("/api/users", requireAdmin, async (request, response, next) => {
  try {
    const username = cleanText(request.body?.username, 80).toLowerCase();
    const name = cleanText(request.body?.name, 120);
    const password = String(request.body?.password || "");
    if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error("El usuario debe tener al menos 3 caracteres y usar letras, números, punto, guion o guion bajo.");
    if (!name) throw new Error("Ingresá el nombre del usuario.");
    if (password.length < 8 || password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
    if (data.users.some((entry) => entry.username.toLowerCase() === username)) throw new Error("Ese usuario ya existe.");
    const role = ["admin", "manager", "supervisor"].includes(request.body?.role) ? request.body.role : "agent";
    const requestedBranchId = cleanText(request.body?.branchId, 120) || (role === "admin" ? null : primaryBranchId());
    if (requestedBranchId && (!getBranch(requestedBranchId) || getBranch(requestedBranchId).active === false)) throw new Error("Seleccioná una sucursal activa.");
    const user = { id: makeId("user"), username, name, role, branchId: requestedBranchId, passwordHash: hashPassword(password), active: true, clientDailyLimit: Math.max(1, Math.min(500, Number(request.body?.clientDailyLimit) || 30)), permissions: {
      ownReports: true,
      branchReports: role === "admin" || ["manager", "supervisor"].includes(role) || request.body?.branchReports === true,
      teamReports: role === "admin" || ["manager", "supervisor"].includes(role) || request.body?.teamReports === true,
      globalReports: role === "admin" || request.body?.globalReports === true,
      auditReports: role === "admin" || request.body?.auditReports === true,
      campaignView: role === "admin" || ["manager", "supervisor"].includes(role) || request.body?.campaignView === true,
      campaignManage: role === "admin" || ["manager", "supervisor"].includes(role) || request.body?.campaignManage === true,
      customFieldsManage: role === "admin" || request.body?.customFieldsManage === true,
      attendanceManage: role === "admin" || ["manager", "supervisor"].includes(role) || request.body?.attendanceManage === true,
      newsPublish: role === "admin" || ["manager", "supervisor"].includes(role) || request.body?.newsPublish === true,
    }, attendance: { status: role === "agent" ? "offline" : "active", reason: "", until: null, updatedAt: timestamp() }, createdAt: timestamp(), updatedAt: timestamp() };
    data.users.push(user);
    addActivity(data, `Usuario ${user.name} creado.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/users/:id", requireAdmin, async (request, response, next) => {
  try {
    const user = data.users.find((entry) => entry.id === request.params.id);
    if (!user) throw new Error("Usuario no encontrado.");
    if (typeof request.body?.name === "string") user.name = cleanText(request.body.name, 120) || user.name;
    if (typeof request.body?.role === "string") user.role = ["admin", "manager", "supervisor"].includes(request.body.role) ? request.body.role : "agent";
    if (request.body?.branchId !== undefined) {
      const branchId = cleanText(request.body.branchId, 120) || null;
      if (branchId && (!getBranch(branchId) || getBranch(branchId).active === false)) throw new Error("Seleccioná una sucursal activa.");
      user.branchId = branchId;
    }
    if (typeof request.body?.active === "boolean") user.active = request.body.active;
    if (request.body?.clientDailyLimit !== undefined) user.clientDailyLimit = Math.max(1, Math.min(500, Number(request.body.clientDailyLimit) || 1));
    if (!user.permissions || typeof user.permissions !== "object") user.permissions = {};
    user.permissions.ownReports = true;
    if (user.role === "admin") {
      Object.assign(user.permissions, { branchReports: true, teamReports: true, globalReports: true, auditReports: true, campaignView: true, campaignManage: true, customFieldsManage: true, attendanceManage: true, newsPublish: true });
    } else {
      if (request.body?.branchReports !== undefined) user.permissions.branchReports = request.body.branchReports === true;
      if (request.body?.teamReports !== undefined) user.permissions.teamReports = request.body.teamReports === true;
      if (request.body?.globalReports !== undefined) user.permissions.globalReports = request.body.globalReports === true;
      if (request.body?.auditReports !== undefined) user.permissions.auditReports = request.body.auditReports === true;
      if (request.body?.campaignView !== undefined) user.permissions.campaignView = request.body.campaignView === true;
      if (request.body?.campaignManage !== undefined) user.permissions.campaignManage = request.body.campaignManage === true;
      if (request.body?.customFieldsManage !== undefined) user.permissions.customFieldsManage = request.body.customFieldsManage === true;
      if (request.body?.attendanceManage !== undefined) user.permissions.attendanceManage = request.body.attendanceManage === true;
      if (request.body?.newsPublish !== undefined) user.permissions.newsPublish = request.body.newsPublish === true;
      if (["manager", "supervisor"].includes(user.role)) {
        if (request.body?.branchReports === undefined) user.permissions.branchReports = true;
        if (request.body?.teamReports === undefined) user.permissions.teamReports = true;
        if (request.body?.campaignView === undefined) user.permissions.campaignView = true;
        if (request.body?.campaignManage === undefined) user.permissions.campaignManage = true;
        if (request.body?.attendanceManage === undefined) user.permissions.attendanceManage = true;
        if (request.body?.newsPublish === undefined) user.permissions.newsPublish = true;
      }
      if (user.role === "agent") { user.permissions.globalReports = false; user.permissions.auditReports = false; user.permissions.attendanceManage = false; user.permissions.newsPublish = false; }
    }
    if (typeof request.body?.password === "string" && request.body.password) {
      if (request.body.password.length < 8 || request.body.password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
      user.passwordHash = hashPassword(request.body.password);
      for (const [token, session] of sessions.entries()) if (session.userId === user.id) sessions.delete(token);
    }
    user.updatedAt = timestamp();
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});


app.get("/api/clients/similar", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const name = cleanText(request.query?.name, 160);
    const phone = cleanText(request.query?.phone, 60);
    if (v214NormalizeComparable(name).length < 2 && normalizePhone(phone).length < 3) return response.json({ candidates: [] });
    let branchId = cleanText(request.query?.branchId, 120) || user.branchId || primaryBranchId();
    if (user.role !== "admin" && user.branchId) branchId = user.branchId;
    if (!getBranch(branchId)) branchId = primaryBranchId();
    response.json({ candidates: v214SimilarityCandidates({ name, phone, branchId, user }), protocol: { exactPhone: "Un número exacto nunca se duplica. Si pertenece a otro responsable, se solicita autorización antes de contactar.", temporaryMinutes: 60 } });
  } catch (error) { next(error); }
});

app.get("/api/communication-requests", async (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  response.json({ requests: visibleCommunicationRequests(user) });
});

app.post("/api/communication-requests", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const client = findClient(data, cleanText(request.body?.clientId, 160));
    if (!client) throw new Error("Cliente no encontrado.");
    const digits = normalizePhone(request.body?.phone);
    const identity = findClientIdentity(data, { phone: digits });
    if (!digits || identity?.client?.id !== client.id) throw new Error("El número indicado no pertenece a ese Cliente Maestro.");
    let branchId = cleanText(request.body?.branchId, 120) || user.branchId || primaryBranchId();
    if (user.role !== "admin" && user.branchId) branchId = user.branchId;
    const branch = getBranch(branchId);
    if (!branch || branch.active === false || !userCanAccessBranch(user, branchId)) throw new Error("No tenés acceso a la sucursal seleccionada.");
    const mode = request.body?.mode === "transfer" ? "transfer" : "temporary";
    const durationMinutes = Math.max(15, Math.min(240, Number(request.body?.durationMinutes) || 60));
    const reason = cleanText(request.body?.reason, 600);
    if (!reason) throw new Error("Indicá brevemente por qué necesitás comunicarte con este cliente.");
    const owner = v214OwnerForClient(client, branchId, digits);
    let deal = owner.deal && OPEN_STAGES.has(owner.deal.stage) ? owner.deal : null;
    if (owner.userId === user.id) {
      if (!deal) deal = v214CreateOrFindCommunicationDeal(client, digits, branchId, owner);
      return response.json({ status: "already_owned", dealId: deal.id, state: stateResponse(request), message: "El cliente ya está asignado a tu usuario." });
    }
    const existing = (data.communicationRequests || []).find((entry) => entry.status === "pending" && entry.clientId === client.id && entry.phoneDigits === digits && entry.branchId === branchId && entry.requestedByUserId === user.id);
    if (existing) return response.json({ status: "pending", request: existing, state: stateResponse(request), message: "Ya tenés una solicitud pendiente para este cliente." });
    const row = {
      id: makeId("commreq"), clientId: client.id, clientName: client.name || client.company || `+${digits}`,
      phone: identity?.phoneRecord?.phone || `+${digits}`, phoneDigits: digits,
      contactPersonId: identity?.contactPerson?.id || null, contactPersonName: identity?.contactPerson?.name || "", contactRole: identity?.contactPerson?.role || "",
      branchId, branchName: branch.name, dealId: deal?.id || null,
      requestedByUserId: user.id, requestedByName: user.name,
      currentOwnerUserId: owner.userId || null, currentOwnerName: owner.userName || "",
      mode, durationMinutes, reason, status: owner.userId ? "pending" : "approved",
      autoApproved: !owner.userId, createdAt: timestamp(), updatedAt: timestamp(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      approvedAt: null, approvedByUserId: null, approvedByName: "", rejectedAt: null, rejectedByUserId: null, rejectedByName: "", grantedUntil: null,
    };
    data.communicationRequests = Array.isArray(data.communicationRequests) ? data.communicationRequests : [];
    if (!owner.userId) {
      deal = v214CreateOrFindCommunicationDeal(client, digits, branchId, { userId: user.id, userName: user.name });
      deal.ownerUserId = user.id; deal.ownerName = user.name; deal.updatedAt = timestamp();
      client.branchOwners = client.branchOwners && typeof client.branchOwners === "object" ? client.branchOwners : {};
      client.branchOwners[branchId] = { userId: user.id, userName: user.name, updatedAt: timestamp() };
      client.ownerUserId = user.id; client.ownerName = user.name; client.updatedAt = timestamp();
      row.dealId = deal.id; row.approvedAt = timestamp(); row.approvedByUserId = "system"; row.approvedByName = "Protocolo automático · cliente sin responsable";
      row.grantedUntil = mode === "temporary" ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null;
      addActivity(data, `${user.name} tomó a ${row.clientName} mediante el protocolo de coincidencia exacta.`, "success");
    } else {
      addActivity(data, `${user.name} solicitó autorización para comunicarse con ${row.clientName}.`, "warning");
    }
    data.communicationRequests.unshift(row); data.communicationRequests.splice(1000);
    recordAuditEvent(user, "solicitud_comunicacion_cliente", { requestId: row.id, clientId: client.id, phone: row.phone, branchId, currentOwnerUserId: row.currentOwnerUserId, mode, status: row.status }, branchId);
    await store.save();
    response.json({ status: row.status, request: row, dealId: row.dealId, state: stateResponse(request), message: row.status === "approved" ? "Cliente sin responsable: la toma quedó registrada y habilitada." : `Solicitud enviada a ${row.currentOwnerName || "jefatura"}.` });
  } catch (error) { next(error); }
});

app.post("/api/communication-requests/:id/decision", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    v214ExpireCommunicationRequests();
    const row = (data.communicationRequests || []).find((entry) => entry.id === request.params.id);
    if (!row) throw new Error("Solicitud de comunicación no encontrada.");
    if (row.status !== "pending") throw new Error("Esta solicitud ya fue resuelta o venció.");
    if (!v214CanDecideCommunicationRequest(row, user)) return response.status(403).json({ error: "No tenés permiso para resolver esta solicitud." });
    const decision = request.body?.decision === "reject" ? "reject" : "approve";
    const client = findClient(data, row.clientId);
    if (!client) throw new Error("El cliente ya no está disponible.");
    if (decision === "reject") {
      row.status = "rejected"; row.rejectedAt = timestamp(); row.rejectedByUserId = user.id; row.rejectedByName = user.name; row.updatedAt = timestamp();
      recordAuditEvent(user, "solicitud_comunicacion_rechazada", { requestId: row.id, clientId: row.clientId, requestedByUserId: row.requestedByUserId }, row.branchId);
      addActivity(data, `${user.name} rechazó una solicitud de comunicación sobre ${row.clientName}.`, "neutral");
      await store.save(); return response.json({ request: row, state: stateResponse(request) });
    }
    const requester = data.users.find((entry) => entry.id === row.requestedByUserId && entry.active !== false);
    if (!requester) throw new Error("El agente solicitante ya no está activo.");
    const currentOwner = row.currentOwnerUserId ? data.users.find((entry) => entry.id === row.currentOwnerUserId) : null;
    let deal = row.dealId ? findDeal(data, row.dealId) : null;
    if (!deal || !OPEN_STAGES.has(deal.stage)) deal = v214CreateOrFindCommunicationDeal(client, row.phoneDigits, row.branchId, currentOwner ? { userId: currentOwner.id, userName: currentOwner.name } : null);
    row.dealId = deal.id; row.status = "approved"; row.approvedAt = timestamp(); row.approvedByUserId = user.id; row.approvedByName = user.name; row.updatedAt = timestamp();
    if (row.mode === "transfer") {
      deal.ownerUserId = requester.id; deal.ownerName = requester.name; deal.updatedAt = timestamp();
      client.branchOwners = client.branchOwners && typeof client.branchOwners === "object" ? client.branchOwners : {};
      client.branchOwners[row.branchId] = { userId: requester.id, userName: requester.name, updatedAt: timestamp() };
      client.ownerUserId = requester.id; client.ownerName = requester.name; client.updatedAt = timestamp();
      for (const related of data.deals || []) if (related.clientId === client.id && related.branchId === row.branchId && OPEN_STAGES.has(related.stage)) { related.ownerUserId = requester.id; related.ownerName = requester.name; }
      row.grantedUntil = null;
    } else {
      row.grantedUntil = new Date(Date.now() + Math.max(15, Math.min(240, Number(row.durationMinutes) || 60)) * 60 * 1000).toISOString();
    }
    recordAuditEvent(user, "solicitud_comunicacion_aprobada", { requestId: row.id, clientId: row.clientId, dealId: deal.id, requestedByUserId: requester.id, mode: row.mode, grantedUntil: row.grantedUntil }, row.branchId);
    addActivity(data, `${user.name} autorizó a ${requester.name} a comunicarse con ${row.clientName}${row.mode === "temporary" ? " temporalmente" : " mediante transferencia"}.`, "success");
    await store.save(); response.json({ request: row, dealId: deal.id, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.post("/api/communication-requests/:id/cancel", async (request, response, next) => {
  try {
    const user = currentUser(request); if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const row = (data.communicationRequests || []).find((entry) => entry.id === request.params.id); if (!row) throw new Error("Solicitud no encontrada.");
    if (row.requestedByUserId !== user.id && user.role !== "admin") return response.status(403).json({ error: "No podés cancelar esta solicitud." });
    if (row.status !== "pending") throw new Error("Solo se pueden cancelar solicitudes pendientes.");
    row.status = "cancelled"; row.updatedAt = timestamp(); row.cancelledAt = timestamp(); row.cancelledByName = user.name;
    await store.save(); response.json({ request: row, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.post("/api/clients", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const phone = normalizePhone(request.body?.phone);
    const name = cleanText(request.body?.name, 120);
    if (!phone || phone.length < 10 || phone.length > 15) throw new Error("Ingresá un número de WhatsApp válido con código de país.");
    const today = paraguayDateKey();
    const used = data.clientLoads.filter((entry) => entry.userId === user.id && entry.date === today).length;
    const limit = Math.max(1, Number(user.clientDailyLimit) || 1);
    if (used >= limit) throw new Error(`Alcanzaste el límite diario de ${limit} clientes.`);
    const jid = `${phone}@s.whatsapp.net`;
    const requestedBranchId = cleanText(request.body?.branchId, 120);
    const branchId = user.role === "admin" ? (requestedBranchId || primaryBranchId()) : (user.branchId || primaryBranchId());
    if (!getBranch(branchId) || getBranch(branchId).active === false) throw new Error("La sucursal seleccionada no está disponible.");
    if (!userCanAccessBranch(user, branchId)) throw new Error("No tenés acceso a esta sucursal.");
    const exactIdentity = findClientIdentity(data, { phone });
    if (exactIdentity?.client) {
      const owner = v214OwnerForClient(exactIdentity.client, branchId, phone);
      if (owner.userId === user.id) {
        let existingDeal = owner.deal && OPEN_STAGES.has(owner.deal.stage) ? owner.deal : v214CreateOrFindCommunicationDeal(exactIdentity.client, phone, branchId, owner);
        return response.json({ ...stateResponse(request), duplicateProtocol: { status: "already_owned", clientId: exactIdentity.client.id, dealId: existingDeal.id, message: "Este número ya existe y está asignado a tu usuario." } });
      }
      const conflict = new Error(owner.userId ? `El número ya pertenece a ${owner.userName || "otro asesor"}. Usá Solicitar comunicación para respetar el protocolo de contacto.` : "El número ya existe en el CRM. Usá el protocolo de comunicación para tomarlo sin crear un duplicado.");
      conflict.status = 409; throw conflict;
    }
    let deal = findOpenDeal(data, jid, branchId);
    if (!deal) deal = createDeal(data, { jid, name: name || `Cliente ${phone}`, branchId, source: "manual" });
    if (!deal.ownerUserId) { deal.ownerUserId = user.id; deal.ownerName = user.name; }
    else ensureDealOwnership(deal, user);
    const client = findClient(data, deal.clientId);
    if (client) {
      client.ownerUserId = deal.ownerUserId; client.ownerName = deal.ownerName; if (name) client.name = name; client.updatedAt = timestamp();
      if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
      if (deal.branchId) client.branchOwners[deal.branchId] = { userId: deal.ownerUserId, userName: deal.ownerName, updatedAt: timestamp() };
    }
    deal.source = "manual";
    deal.createdByUserId = user.id;
    data.clientLoads.push({ id: makeId("clientload"), userId: user.id, dealId: deal.id, date: today, at: timestamp() });
    if (data.clientLoads.length > 10000) data.clientLoads.splice(0, data.clientLoads.length - 10000);
    addActivity(data, `${user.name} cargó al cliente ${deal.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/deals/:id/assign", async (request, response, next) => {
  try {
    const actor = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal) throw new Error("Negociación no encontrada.");
    const targetId = cleanText(request.body?.userId, 120) || actor.id;
    if (targetId !== actor.id && actor.role !== "admin" && actor.role !== "manager") throw new Error("No tenés permiso para reasignar clientes.");
    const target = data.users.find((entry) => entry.id === targetId && entry.active !== false);
    if (!target) throw new Error("Usuario no encontrado.");
    if (!userCanAccessBranch(actor, deal.branchId || primaryBranchId())) throw new Error("La negociación pertenece a otra sucursal.");
    if (target.branchId && target.branchId !== deal.branchId) throw new Error("Para enviar a otra sucursal usá Transferir conversación.");
    if (deal.ownerUserId && deal.ownerUserId !== actor.id && actor.role !== "admin") throw new Error(`Esta conversación pertenece a ${deal.ownerName || "otro asesor"}.`);
    deal.ownerUserId = target.id;
    deal.ownerName = target.name;
    deal.updatedAt = timestamp();
    const client = findClient(data, deal.clientId);
    if (client) {
      client.ownerUserId = target.id; client.ownerName = target.name; client.updatedAt = timestamp();
      if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
      if (deal.branchId) client.branchOwners[deal.branchId] = { userId: target.id, userName: target.name, updatedAt: timestamp() };
    }
    for (const related of data.deals.filter((entry) => entry.clientId && entry.clientId === deal.clientId && entry.branchId === deal.branchId)) { related.ownerUserId = target.id; related.ownerName = target.name; }
    addActivity(data, `${deal.name} fue asignado a ${target.name}.`, "success");
    queueSuperAutomationEvent({ type:"assignment_changed", deal, client, line:dealWhatsappLine(deal), branch:getBranch(deal.branchId), previousUserId:null, userId:target.id, text:"" });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.get("/api/clients/:id/profile", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado.");
    let negotiations = data.deals.filter((deal) => deal.clientId === client.id);
    if (user.role !== "admin") negotiations = negotiations.filter((deal) => deal.branchId === (user.branchId || primaryBranchId()));
    if (user.role === "agent") negotiations = negotiations.filter((deal) => !deal.ownerUserId || deal.ownerUserId === user.id);
    if (!negotiations.length) throw new Error("No tenés acceso a este cliente.");
    negotiations.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    refreshClientBranchRelationships(client);
    const branchId = user.role === "admin" ? negotiations[0]?.branchId : (user.branchId || primaryBranchId());
    const branchOwner = client.branchOwners?.[branchId];
    const visibleClient = { ...client, ownerUserId: branchOwner?.userId || client.ownerUserId, ownerName: branchOwner?.userName || client.ownerName };
    const globalHistory = centralClientProfileByPhone(visibleClient.phone);
    const identitySummary = { entityType: visibleClient.entityType || "person", directPhones: (visibleClient.phones || []).filter((entry) => entry.active !== false).length, contactPersons: (visibleClient.contactPersons || []).filter((entry) => entry.active !== false).length, contactPhones: (visibleClient.contactPersons || []).reduce((sum, person) => sum + (person.active === false ? 0 : (person.phones || []).filter((entry) => entry.active !== false).length), 0), branches: (visibleClient.branchRelationships || []).filter((entry) => entry.active !== false).length };
    response.json({ client: visibleClient, negotiations, owner: data.users.find((entry) => entry.id === visibleClient.ownerUserId) || null, globalHistory, identitySummary });
  } catch (error) { next(error); }
});

app.put("/api/clients/:id", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado.");
    const branchId = user.role === "admin" ? null : (user.branchId || primaryBranchId());
    if (branchId) {
      const accessible = data.deals.some((deal) => deal.clientId === client.id && deal.branchId === branchId && (user.role !== "agent" || !deal.ownerUserId || deal.ownerUserId === user.id));
      if (!accessible) throw new Error("No tenés acceso a este cliente.");
    }
    updateClient(data, client.id, request.body || {});
    refreshClientBranchRelationships(client);
    addActivity(data, `${user.name} actualizó la ficha de ${client.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});


function v212ClientAccess(user, client) {
  if (!user || !client) return false;
  if (user.role === "admin") return true;
  return (data.deals || []).some((deal) => deal.clientId === client.id && deal.branchId === (user.branchId || primaryBranchId()) && (user.role !== "agent" || !deal.ownerUserId || deal.ownerUserId === user.id));
}

function v212PhoneConflict(phone, clientId, allowedPhoneId = null) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const identity = findClientIdentity(data, { phone: digits });
  if (!identity) return null;
  if (identity.client.id !== clientId) return identity;
  if (allowedPhoneId && identity.phoneRecord?.id === allowedPhoneId) return null;
  return identity;
}

function v212SyncPrimaryPhone(client) {
  const active = (client.phones || []).filter((entry) => entry.active !== false && normalizePhone(entry.phone));
  if (active.length && !active.some((entry) => entry.primary)) active[0].primary = true;
  const primary = active.find((entry) => entry.primary) || active[0] || null;
  for (const entry of active) entry.primary = entry.id === primary?.id;
  if (primary) { client.phone = primary.phone; client.jid = primary.jid || `${normalizePhone(primary.phone)}@s.whatsapp.net`; }
}

app.post("/api/clients/:id/phones", async (request, response, next) => {
  try {
    const user = currentUser(request); const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado."); if (!v212ClientAccess(user, client)) return response.status(403).json({ error: "No tenés acceso a este cliente." });
    const digits = normalizePhone(request.body?.phone); if (digits.length < 10 || digits.length > 15) throw new Error("Ingresá un número válido con código de país.");
    const conflict = v212PhoneConflict(digits, client.id); if (conflict) throw new Error(`Ese número ya está asociado a ${conflict.contactPerson?.name || conflict.client.name || "otro cliente"}.`);
    client.phones = Array.isArray(client.phones) ? client.phones : [];
    const row = { id: makeId("phone"), label: cleanText(request.body?.label, 80) || "Teléfono", phone: `+${digits}`, jid: `${digits}@s.whatsapp.net`, primary: request.body?.primary === true || client.phones.length === 0, whatsapp: request.body?.whatsapp !== false, active: true, verified: request.body?.verified === true, createdAt: timestamp(), updatedAt: timestamp() };
    if (row.primary) for (const entry of client.phones) entry.primary = false; client.phones.push(row); v212SyncPrimaryPhone(client); client.updatedAt = timestamp();
    recordAuditEvent(user, "cliente_numero_agregado", { clientId: client.id, phone: row.phone, label: row.label }, user.branchId || primaryBranchId()); await store.save(); response.json({ client, state: stateResponse(request) });
  } catch (error) { next(error); }
});


app.put("/api/clients/:id/phones/:phoneId", async (request, response, next) => {
  try {
    const user = currentUser(request); const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado."); if (!v212ClientAccess(user, client)) return response.status(403).json({ error: "No tenés acceso a este cliente." });
    const row = (client.phones || []).find((entry) => entry.id === request.params.phoneId); if (!row) throw new Error("Número no encontrado.");
    if (typeof request.body?.label === "string") row.label = cleanText(request.body.label, 80) || row.label;
    if (typeof request.body?.whatsapp === "boolean") row.whatsapp = request.body.whatsapp;
    if (request.body?.primary === true) { for (const entry of client.phones || []) entry.primary = entry.id === row.id; }
    row.updatedAt = timestamp(); v212SyncPrimaryPhone(client); client.updatedAt = timestamp(); await store.save(); response.json({ client, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.delete("/api/clients/:id/phones/:phoneId", async (request, response, next) => {
  try {
    const user = currentUser(request); const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado."); if (!v212ClientAccess(user, client)) return response.status(403).json({ error: "No tenés acceso a este cliente." });
    const row = (client.phones || []).find((entry) => entry.id === request.params.phoneId); if (!row) throw new Error("Número no encontrado.");
    const inUse = (data.deals || []).some((deal) => deal.clientId === client.id && normalizePhone(deal.phone) === normalizePhone(row.phone));
    if (inUse) { row.active = false; row.primary = false; row.updatedAt = timestamp(); } else client.phones = (client.phones || []).filter((entry) => entry.id !== row.id);
    v212SyncPrimaryPhone(client); client.updatedAt = timestamp(); await store.save(); response.json({ client, state: stateResponse(request), archived: inUse });
  } catch (error) { next(error); }
});

app.post("/api/clients/:id/contacts", async (request, response, next) => {
  try {
    const user = currentUser(request); const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado."); if (!v212ClientAccess(user, client)) return response.status(403).json({ error: "No tenés acceso a este cliente." });
    const name = cleanText(request.body?.name, 140); if (!name) throw new Error("Ingresá el nombre de la persona de contacto.");
    const rawPhones = Array.isArray(request.body?.phones) ? request.body.phones : String(request.body?.phone || "").split(/[;,\n]+/).map((value) => value.trim()).filter(Boolean);
    const phones = []; for (const [index, raw] of rawPhones.entries()) { const digits = normalizePhone(typeof raw === "object" ? raw.phone : raw); if (digits.length < 10 || digits.length > 15) throw new Error(`El teléfono ${index + 1} no es válido.`); const conflict = v212PhoneConflict(digits, client.id); if (conflict) throw new Error(`El número +${digits} ya está asociado a ${conflict.contactPerson?.name || conflict.client.name || "otro registro"}.`); phones.push({ id: makeId("phone"), label: cleanText(typeof raw === "object" ? raw.label : "WhatsApp", 80) || "WhatsApp", phone: `+${digits}`, jid: `${digits}@s.whatsapp.net`, primary: index === 0, whatsapp: true, active: true, verified: false, createdAt: timestamp(), updatedAt: timestamp() }); }
    const person = { id: makeId("contactperson"), name, role: cleanText(request.body?.role, 120), email: cleanText(request.body?.email, 160), notes: cleanText(request.body?.notes, 1200), active: true, phones, createdAt: timestamp(), updatedAt: timestamp() };
    client.contactPersons = Array.isArray(client.contactPersons) ? client.contactPersons : []; client.contactPersons.push(person); if (client.entityType !== "company" && client.contactPersons.length) client.entityType = "company"; client.updatedAt = timestamp();
    recordAuditEvent(user, "cliente_contacto_agregado", { clientId: client.id, contactPersonId: person.id, name: person.name, phones: phones.map((entry) => entry.phone) }, user.branchId || primaryBranchId()); await store.save(); response.json({ client, contact: person, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.put("/api/clients/:id/contacts/:contactId", async (request, response, next) => {
  try {
    const user = currentUser(request); const client = findClient(data, request.params.id); if (!client) throw new Error("Cliente no encontrado."); if (!v212ClientAccess(user, client)) return response.status(403).json({ error: "No tenés acceso a este cliente." });
    const person = (client.contactPersons || []).find((entry) => entry.id === request.params.contactId); if (!person) throw new Error("Persona de contacto no encontrada.");
    for (const [field, max] of [["name",140],["role",120],["email",160],["notes",1200]]) if (typeof request.body?.[field] === "string") person[field] = cleanText(request.body[field], max);
    if (typeof request.body?.active === "boolean") person.active = request.body.active;
    if (Array.isArray(request.body?.phones)) {
      const nextPhones=[]; for (const [index, raw] of request.body.phones.entries()) { const digits=normalizePhone(raw.phone||raw); if(digits.length<10||digits.length>15)throw new Error(`El teléfono ${index+1} no es válido.`); const existing=(person.phones||[]).find(p=>normalizePhone(p.phone)===digits); const conflict=v212PhoneConflict(digits,client.id,existing?.id||null); if(conflict)throw new Error(`El número +${digits} ya está asociado a ${conflict.contactPerson?.name||conflict.client.name||"otro registro"}.`); nextPhones.push({id:existing?.id||makeId("phone"),label:cleanText(raw.label||existing?.label||"WhatsApp",80)||"WhatsApp",phone:`+${digits}`,jid:`${digits}@s.whatsapp.net`,primary:raw.primary===true||index===0,whatsapp:raw.whatsapp!==false,active:raw.active!==false,verified:raw.verified===true||existing?.verified===true,createdAt:existing?.createdAt||timestamp(),updatedAt:timestamp()}); } person.phones=nextPhones;
    }
    person.updatedAt=timestamp(); client.updatedAt=timestamp(); await store.save(); response.json({client,contact:person,state:stateResponse(request)});
  } catch(error){next(error);}
});

app.delete("/api/clients/:id/contacts/:contactId", async (request, response, next) => {
  try { const user=currentUser(request),client=findClient(data,request.params.id); if(!client)throw new Error("Cliente no encontrado."); if(!v212ClientAccess(user,client))return response.status(403).json({error:"No tenés acceso a este cliente."}); const person=(client.contactPersons||[]).find(entry=>entry.id===request.params.contactId); if(!person)throw new Error("Persona de contacto no encontrada."); const inUse=(data.deals||[]).some(deal=>deal.clientId===client.id&&deal.contactPersonId===person.id); if(inUse){person.active=false;person.updatedAt=timestamp();}else client.contactPersons=(client.contactPersons||[]).filter(entry=>entry.id!==person.id);client.updatedAt=timestamp();await store.save();response.json({client,state:stateResponse(request),archived:inUse}); }catch(error){next(error);}
});

app.post("/api/clients/:id/branches", async (request,response,next)=>{
  try{const user=currentUser(request),client=findClient(data,request.params.id);if(!client)throw new Error("Cliente no encontrado.");if(!v212ClientAccess(user,client)&&user.role!=="admin")return response.status(403).json({error:"No tenés acceso a este cliente."});const branch=getBranch(cleanText(request.body?.branchId,120));if(!branch||branch.active===false)throw new Error("Seleccioná una sucursal activa.");refreshClientBranchRelationships(client);let relation=(client.branchRelationships||[]).find(entry=>entry.branchId===branch.id);if(!relation){relation={branchId:branch.id,active:true,manual:true,preferred:false,customerSince:timestamp(),lastInteractionAt:null,lastPurchaseAt:null,purchaseCount:0,totalPurchased:0,ownerUserId:null,ownerName:"",notes:"",createdAt:timestamp(),updatedAt:timestamp()};client.branchRelationships.push(relation);}relation.active=true;relation.manual=true;relation.notes=cleanText(request.body?.notes,600)||relation.notes||"";relation.updatedAt=timestamp();if(request.body?.preferred===true){client.preferredBranchId=branch.id;for(const entry of client.branchRelationships)entry.preferred=entry.branchId===branch.id;}client.updatedAt=timestamp();await store.save();response.json({client,state:stateResponse(request)});}catch(error){next(error);}
});

app.delete("/api/clients/:id/branches/:branchId",async(request,response,next)=>{
  try{const user=currentUser(request),client=findClient(data,request.params.id);if(!client)throw new Error("Cliente no encontrado.");if(user.role!=="admin"&&!v212ClientAccess(user,client))return response.status(403).json({error:"No tenés acceso a este cliente."});refreshClientBranchRelationships(client);const relation=(client.branchRelationships||[]).find(entry=>entry.branchId===request.params.branchId);if(!relation)throw new Error("Relación con sucursal no encontrada.");if(Number(relation.purchaseCount||0)>0){relation.active=false;relation.manual=false;relation.preferred=false;relation.updatedAt=timestamp();}else client.branchRelationships=(client.branchRelationships||[]).filter(entry=>entry.branchId!==relation.branchId);if(client.preferredBranchId===relation.branchId)client.preferredBranchId=null;client.updatedAt=timestamp();await store.save();response.json({client,state:stateResponse(request),archived:Number(relation.purchaseCount||0)>0});}catch(error){next(error);}
});


app.post("/api/deals/:id/link-master-client", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal) throw new Error("Conversación no encontrada.");
    ensureDealOwnership(deal, user, { claim: false });
    const sourceClient = findClient(data, deal.clientId);
    const targetClient = findClient(data, cleanText(request.body?.clientId, 160));
    if (!targetClient) throw new Error("Seleccioná un Cliente Maestro válido.");
    if (targetClient.id === sourceClient?.id) throw new Error("La conversación ya pertenece a ese Cliente Maestro.");
    if (user.role !== "admin" && !v212ClientAccess(user, targetClient)) return response.status(403).json({ error: "No tenés acceso al Cliente Maestro seleccionado." });

    const phoneDigits = normalizePhone(deal.phone);
    if (phoneDigits.length < 10) throw new Error("La conversación no tiene un número válido para vincular.");
    const existingTargetIdentity = (() => {
      for (const row of targetClient.phones || []) if (row.active !== false && normalizePhone(row.phone) === phoneDigits) return { type: "client", phoneRecord: row, contactPerson: null };
      for (const person of targetClient.contactPersons || []) for (const row of person.phones || []) if (person.active !== false && row.active !== false && normalizePhone(row.phone) === phoneDigits) return { type: "contact", phoneRecord: row, contactPerson: person };
      return null;
    })();

    const asCompanyNumber = request.body?.asCompanyNumber === true || targetClient.entityType !== "company";
    let contactPerson = null;
    if (existingTargetIdentity?.contactPerson) contactPerson = existingTargetIdentity.contactPerson;
    if (!asCompanyNumber && targetClient.entityType === "company") {
      const requestedContactId = cleanText(request.body?.contactPersonId, 160);
      contactPerson = requestedContactId ? (targetClient.contactPersons || []).find((entry) => entry.id === requestedContactId && entry.active !== false) : contactPerson;
      if (!contactPerson) {
        const contactName = cleanText(request.body?.contactName, 140);
        if (!contactName) throw new Error("Ingresá el nombre del empleado/contacto o marcá que es un número general de la empresa.");
        contactPerson = {
          id: makeId("contactperson"),
          name: contactName,
          role: cleanText(request.body?.contactRole, 120),
          email: cleanText(request.body?.contactEmail, 160),
          notes: "Vinculado desde una conversación existente.",
          active: true,
          phones: [],
          createdAt: timestamp(),
          updatedAt: timestamp(),
        };
        targetClient.contactPersons = Array.isArray(targetClient.contactPersons) ? targetClient.contactPersons : [];
        targetClient.contactPersons.push(contactPerson);
      } else {
        if (cleanText(request.body?.contactName, 140)) contactPerson.name = cleanText(request.body.contactName, 140);
        if (typeof request.body?.contactRole === "string") contactPerson.role = cleanText(request.body.contactRole, 120);
        if (typeof request.body?.contactEmail === "string") contactPerson.email = cleanText(request.body.contactEmail, 160);
        contactPerson.updatedAt = timestamp();
      }
    }

    // Desvincula el número del registro temporal/anterior antes de incorporarlo al Cliente Maestro.
    if (sourceClient) {
      sourceClient.phones = (sourceClient.phones || []).filter((entry) => normalizePhone(entry.phone) !== phoneDigits);
      for (const person of sourceClient.contactPersons || []) person.phones = (person.phones || []).filter((entry) => normalizePhone(entry.phone) !== phoneDigits);
      v212SyncPrimaryPhone(sourceClient);
      sourceClient.updatedAt = timestamp();
    }

    const phoneRecord = existingTargetIdentity?.phoneRecord || {
      id: makeId("phone"), label: cleanText(request.body?.phoneLabel, 80) || (contactPerson ? "WhatsApp" : "Teléfono"), phone: `+${phoneDigits}`,
      jid: `${phoneDigits}@s.whatsapp.net`, primary: false, whatsapp: true, active: true, verified: false, createdAt: timestamp(), updatedAt: timestamp(),
    };
    if (!existingTargetIdentity) {
      if (contactPerson) {
        contactPerson.phones = Array.isArray(contactPerson.phones) ? contactPerson.phones : [];
        if (!contactPerson.phones.some((entry) => entry.active !== false && normalizePhone(entry.phone) === phoneDigits)) {
          phoneRecord.primary = !contactPerson.phones.some((entry) => entry.active !== false && entry.primary);
          contactPerson.phones.push(phoneRecord);
        }
      } else {
        targetClient.phones = Array.isArray(targetClient.phones) ? targetClient.phones : [];
        if (!targetClient.phones.some((entry) => entry.active !== false && normalizePhone(entry.phone) === phoneDigits)) {
          phoneRecord.primary = targetClient.phones.length === 0;
          targetClient.phones.push(phoneRecord);
        }
        v212SyncPrimaryPhone(targetClient);
      }
    }

    const movedDeals = (data.deals || []).filter((entry) => entry.clientId === sourceClient?.id && normalizePhone(entry.phone) === phoneDigits);
    if (!movedDeals.length) movedDeals.push(deal);
    for (const entry of movedDeals) {
      entry.clientId = targetClient.id;
      entry.name = targetClient.name || entry.name;
      entry.contactPersonId = contactPerson?.id || null;
      entry.contactPersonName = contactPerson?.name || "";
      entry.contactRole = contactPerson?.role || "";
      entry.identityType = contactPerson ? "company_contact" : (targetClient.entityType === "company" ? "company" : "person");
      entry.updatedAt = timestamp();
    }
    for (const transfer of data.transfers || []) if (transfer.clientId === sourceClient?.id && normalizePhone(transfer.phone || deal.phone) === phoneDigits) transfer.clientId = targetClient.id;

    targetClient.updatedAt = timestamp();
    refreshClientBranchRelationships(targetClient);
    if (sourceClient) {
      refreshClientBranchRelationships(sourceClient);
      const hasRemainingDeals = (data.deals || []).some((entry) => entry.clientId === sourceClient.id);
      const hasRemainingIdentity = (sourceClient.phones || []).some((entry) => entry.active !== false) || (sourceClient.contactPersons || []).some((person) => person.active !== false && (person.phones || []).some((entry) => entry.active !== false));
      if (!hasRemainingDeals && !hasRemainingIdentity) data.clients = (data.clients || []).filter((entry) => entry.id !== sourceClient.id);
    }

    addActivity(data, `${user.name} vinculó ${deal.phone} a ${targetClient.name || "un Cliente Maestro"}${contactPerson ? ` como contacto de ${contactPerson.name}` : ""}.`, "success");
    recordAuditEvent(user, "conversacion_vinculada_cliente_maestro", { dealId: deal.id, previousClientId: sourceClient?.id || null, clientId: targetClient.id, phone: `+${phoneDigits}`, contactPersonId: contactPerson?.id || null, movedDealIds: movedDeals.map((entry) => entry.id) }, deal.branchId || user.branchId || primaryBranchId());
    await store.save();
    response.json({ ok: true, client: targetClient, contactPerson, movedDeals: movedDeals.length, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.post("/api/quick-replies", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const title = cleanText(request.body?.title, 120);
    const body = cleanText(request.body?.body, 3000);
    if (!title || !body) throw new Error("Ingresá el título y el texto de la respuesta.");
    const shortcutRaw = cleanText(request.body?.shortcut, 40).replace(/\s+/g, "");
    const shortcut = shortcutRaw ? (shortcutRaw.startsWith("/") ? shortcutRaw : `/${shortcutRaw}`) : "";
    const reply = { id: makeId("reply"), title, shortcut, category: cleanText(request.body?.category, 80) || "General", body, active: request.body?.active !== false, order: data.quickReplies.length, createdAt: timestamp(), updatedAt: timestamp() };
    data.quickReplies.push(reply);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/quick-replies/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const reply = data.quickReplies.find((entry) => entry.id === request.params.id);
    if (!reply) throw new Error("Respuesta rápida no encontrada.");
    if (typeof request.body?.title === "string") reply.title = cleanText(request.body.title, 120) || reply.title;
    if (typeof request.body?.body === "string") reply.body = cleanText(request.body.body, 3000) || reply.body;
    if (typeof request.body?.category === "string") reply.category = cleanText(request.body.category, 80) || "General";
    if (typeof request.body?.shortcut === "string") { const value = cleanText(request.body.shortcut, 40).replace(/\s+/g, ""); reply.shortcut = value ? (value.startsWith("/") ? value : `/${value}`) : ""; }
    if (typeof request.body?.active === "boolean") reply.active = request.body.active;
    reply.updatedAt = timestamp();
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.delete("/api/quick-replies/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const index = data.quickReplies.findIndex((entry) => entry.id === request.params.id);
    if (index < 0) throw new Error("Respuesta rápida no encontrada.");
    data.quickReplies.splice(index, 1);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

function parseAdminCommand(command) {
  const raw = cleanText(command, 3000);
  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  const lower = raw.toLowerCase();
  if (lower.startsWith("crear usuario") && parts.length >= 6) return { action: "create_user", username: parts[1], name: parts[2], role: parts[3], password: parts[4], limit: parts[5] };
  let match = raw.match(/^reasignar\s+cliente\s+([^\s|]+)\s+(?:a|->)\s+([a-z0-9._-]+)$/i);
  if (match) return { action: "assign_client", clientId: match[1], username: match[2] };
  match = raw.match(/^liberar\s+cliente\s+([^\s|]+)$/i);
  if (match) return { action: "release_client", clientId: match[1] };
  match = raw.match(/^(activar|desactivar)\s+usuario\s+([a-z0-9._-]+)$/i);
  if (match) return { action: "toggle_user", active: match[1].toLowerCase() === "activar", username: match[2] };
  if (lower.startsWith("editar cliente") && parts.length >= 3) {
    const values = {};
    for (const piece of parts.slice(2)) { const [key, ...rest] = piece.split("="); if (key && rest.length) values[headerKey(key)] = rest.join("=").trim(); }
    return { action: "edit_client", clientId: parts[1], values };
  }
  match = raw.match(/^buscar\s+cliente\s+(.+)$/i);
  if (match) return { action: "find_client", query: match[1].trim() };
  match = raw.match(/^ajustar\s+stock\s+([^\s|]+)\s+(-?\d+)\s*(.*)$/i);
  if (match) return { action: "adjust_stock", sku: match[1], quantity: Number(match[2]), note: match[3].trim() || "Ajuste desde asistente admin" };
  return { action: "unknown" };
}

app.post("/api/admin-assistant", requireAdmin, async (request, response, next) => {
  try {
    const actor = request.currentUser;
    const command = cleanText(request.body?.command, 3000);
    if (!command) throw new Error("Escribí una instrucción.");
    const parsed = parseAdminCommand(command);
    let result;
    if (parsed.action === "create_user") {
      const username = cleanText(parsed.username, 80).toLowerCase();
      const name = cleanText(parsed.name, 120);
      const password = String(parsed.password || "");
      const roleMap = { administrador: "admin", admin: "admin", gerente: "manager", manager: "manager", agente: "agent", agent: "agent" };
      const role = roleMap[String(parsed.role || "").toLowerCase()] || "agent";
      if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error("Usuario inválido.");
      if (!name || password.length < 8) throw new Error("Faltan nombre o una contraseña de al menos 8 caracteres.");
      if (data.users.some((entry) => entry.username.toLowerCase() === username)) throw new Error("Ese usuario ya existe.");
      const user = { id: makeId("user"), username, name, role, passwordHash: hashPassword(password), active: true, clientDailyLimit: Math.max(1, Math.min(500, Number(parsed.limit) || 30)), createdAt: timestamp(), updatedAt: timestamp() };
      data.users.push(user);
      result = `Usuario ${user.username} creado como ${role}.`;
    } else if (parsed.action === "assign_client") {
      const client = findClient(data, parsed.clientId);
      const target = data.users.find((entry) => entry.username.toLowerCase() === parsed.username.toLowerCase() && entry.active !== false);
      if (!client || !target) throw new Error("Cliente o usuario no encontrado.");
      client.ownerUserId = target.id; client.ownerName = target.name; client.updatedAt = timestamp();
      for (const deal of data.deals.filter((entry) => entry.clientId === client.id)) { deal.ownerUserId = target.id; deal.ownerName = target.name; deal.updatedAt = timestamp(); }
      result = `${client.name} fue asignado a ${target.name}.`;
    } else if (parsed.action === "release_client") {
      const client = findClient(data, parsed.clientId); if (!client) throw new Error("Cliente no encontrado.");
      client.ownerUserId = null; client.ownerName = ""; client.updatedAt = timestamp();
      for (const deal of data.deals.filter((entry) => entry.clientId === client.id && OPEN_STAGES.has(entry.stage))) { deal.ownerUserId = null; deal.ownerName = ""; deal.updatedAt = timestamp(); }
      result = `${client.name} quedó sin responsable.`;
    } else if (parsed.action === "toggle_user") {
      const user = data.users.find((entry) => entry.username.toLowerCase() === parsed.username.toLowerCase()); if (!user) throw new Error("Usuario no encontrado.");
      if (user.id === actor.id && !parsed.active) throw new Error("No podés desactivar tu propio usuario desde esta consola.");
      user.active = parsed.active; user.updatedAt = timestamp();
      result = `Usuario ${user.username} ${parsed.active ? "activado" : "desactivado"}.`;
    } else if (parsed.action === "edit_client") {
      const client = findClient(data, parsed.clientId); if (!client) throw new Error("Cliente no encontrado.");
      const aliases = { nombre: "name", name: "name", documento: "document", ruc: "document", email: "email", correo: "email", empresa: "company", company: "company", ciudad: "city", direccion: "address", address: "address", notas: "notes", nota: "notes" };
      const input = {};
      for (const [key, value] of Object.entries(parsed.values || {})) if (aliases[key]) input[aliases[key]] = value;
      updateClient(data, client.id, input);
      result = `Ficha de ${client.name} actualizada.`;
    } else if (parsed.action === "find_client") {
      const q = parsed.query.toLowerCase();
      const matches = data.clients.filter((client) => [client.id, client.name, client.phone, client.document, client.company].some((value) => String(value || "").toLowerCase().includes(q))).slice(0, 10);
      return response.json({ ok: true, message: matches.length ? `${matches.length} cliente(s) encontrado(s).` : "Sin coincidencias.", matches, state: stateResponse(request) });
    } else if (parsed.action === "adjust_stock") {
      const product = data.products.find((entry) => entry.sku.toLowerCase() === String(parsed.sku).toLowerCase()); if (!product) throw new Error("Producto no encontrado.");
      adjustStock(data, product.id, parsed.quantity, parsed.note); result = `Stock de ${product.name} ajustado en ${parsed.quantity}.`;
    } else {
      throw new Error("No entendí la instrucción. Usá uno de los ejemplos disponibles en la consola.");
    }
    addActivity(data, `Admin: ${result}`, "success");
    await store.save();
    response.json({ ok: true, message: result, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.post("/api/branches", requireAdmin, async (request, response, next) => {
  try {
    const name = cleanText(request.body?.name, 120);
    const code = cleanText(request.body?.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
    const phone = cleanText(request.body?.phone, 40);
    if (!name) throw new Error("Ingresá el nombre de la sucursal.");
    if (code && data.branches.some((branch) => branch.code.toLowerCase() === code.toLowerCase())) throw new Error("Ese código de sucursal ya existe.");
    if (phone && (normalizePhone(phone).length < 10 || normalizePhone(phone).length > 15)) throw new Error("Ingresá un número de WhatsApp válido.");
    if (phone && data.branches.some((branch) => normalizePhone(branch.phone) === normalizePhone(phone))) throw new Error("Ese número ya está asignado a otra sucursal.");
    const branch = {
      id: makeId("branch"),
      code: code || `SUC-${data.branches.length + 1}`,
      name,
      city: cleanText(request.body?.city, 120),
      address: cleanText(request.body?.address, 240),
      phone,
      timezone: cleanText(request.body?.timezone || data.settings.operational?.timezoneDefault || "America/Asuncion", 80) || "America/Asuncion",
      weatherLocation: cleanText(request.body?.weatherLocation || request.body?.city || request.body?.address, 240),
      weatherLatitude: request.body?.weatherLatitude === "" || request.body?.weatherLatitude == null ? null : Number(request.body.weatherLatitude),
      weatherLongitude: request.body?.weatherLongitude === "" || request.body?.weatherLongitude == null ? null : Number(request.body.weatherLongitude),
      active: request.body?.active !== false,
      isLocal: false,
      hosted: true,
      introMessage: cleanText(request.body?.introMessage, 1200) || "Hola {cliente}, te damos la bienvenida a {sucursal}. Estamos ubicados en {ubicacion}. {contexto}",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };
    data.branches.push(branch);
    data.whatsappLines.push({id:`line_default_${branch.id}`,name:"Línea principal",branchId:branch.id,provider:"qr",phone:branch.phone||"",active:true,isDefault:true,legacyBranchSession:true,accessMode:"branch",allowedUserIds:[],supervisorsCanUse:true,managersCanUse:true,botEnabled:true,notes:"Línea principal creada junto con la sucursal.",cloud:{phoneNumberId:"",businessAccountId:"",apiVersion:"v23.0",accessToken:"",verifyToken:""},createdAt:timestamp(),updatedAt:timestamp()});
    addActivity(data, `Sucursal ${branch.name} creada con su línea principal de WhatsApp.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/branches/:id", requireAdmin, async (request, response, next) => {
  try {
    const branch = getBranch(request.params.id);
    if (!branch) throw new Error("Sucursal no encontrada.");
    if (typeof request.body?.name === "string") branch.name = cleanText(request.body.name, 120) || branch.name;
    if (typeof request.body?.code === "string") {
      const nextCode = cleanText(request.body.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "-") || branch.code;
      if (data.branches.some((entry) => entry.id !== branch.id && entry.code.toLowerCase() === nextCode.toLowerCase())) throw new Error("Ese código de sucursal ya existe.");
      branch.code = nextCode;
    }
    if (typeof request.body?.city === "string") branch.city = cleanText(request.body.city, 120);
    if (typeof request.body?.address === "string") branch.address = cleanText(request.body.address, 240);
    if (typeof request.body?.timezone === "string") branch.timezone = cleanText(request.body.timezone, 80) || data.settings.operational?.timezoneDefault || "America/Asuncion";
    if (typeof request.body?.weatherLocation === "string") branch.weatherLocation = cleanText(request.body.weatherLocation, 240);
    if (request.body?.weatherLatitude !== undefined) branch.weatherLatitude = request.body.weatherLatitude === "" || request.body.weatherLatitude === null ? null : Number(request.body.weatherLatitude);
    if (request.body?.weatherLongitude !== undefined) branch.weatherLongitude = request.body.weatherLongitude === "" || request.body.weatherLongitude === null ? null : Number(request.body.weatherLongitude);
    weatherCache.delete(branch.id);
    if (typeof request.body?.phone === "string") {
      const phone = cleanText(request.body.phone, 40);
      if (phone && (normalizePhone(phone).length < 10 || normalizePhone(phone).length > 15)) throw new Error("Ingresá un número de WhatsApp válido.");
      if (phone && data.branches.some((entry) => entry.id !== branch.id && normalizePhone(entry.phone) === normalizePhone(phone))) throw new Error("Ese número ya está asignado a otra sucursal.");
      branch.phone = phone;
    }
    if (typeof request.body?.introMessage === "string") branch.introMessage = cleanText(request.body.introMessage, 1200) || branch.introMessage;
    if (typeof request.body?.active === "boolean") {
      if (branch.id === primaryBranchId() && request.body.active === false) throw new Error("La sucursal principal no puede desactivarse.");
      branch.active = request.body.active;
    }
    branch.updatedAt = timestamp();
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/branches/:id/connect", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const user = request.currentUser || currentUser(request);
    const branch = getBranch(request.params.id);
    if (!branch || branch.active === false) throw new Error("Sucursal no encontrada o inactiva.");
    if (user.role !== "admin" && !userCanAccessBranch(user, branch.id)) throw new Error("No tenés acceso a esa sucursal.");
    if (branch.id === primaryBranchId() && data.settings.whatsappMode === "cloud") {
      if (!cloudApiConfigured()) throw new Error("Completá la configuración de WhatsApp API de la sucursal principal.");
      return response.json({ ok:true, revision:store.revision, branchConnection:branchConnectionState(branch.id) });
    }
    void startBranchConnection(branch.id);
    response.status(202).json({ ok:true, revision:store.revision, branchConnection:branchConnectionState(branch.id) });
  } catch (error) { next(error); }
});

app.post("/api/branches/:id/disconnect", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const user = request.currentUser || currentUser(request);
    const branch = getBranch(request.params.id);
    if (!branch) throw new Error("Sucursal no encontrada.");
    if (user.role !== "admin" && !userCanAccessBranch(user, branch.id)) throw new Error("No tenés acceso a esa sucursal.");
    if (branch.id === primaryBranchId() && data.settings.whatsappMode === "cloud") throw new Error("Para la API oficial, quitá o cambiá las credenciales desde WhatsApp y bot.");
    await disconnectBranchConnection(branch.id);
    await store.save();
    response.json({ ok:true, revision:store.revision, branchConnection:branchConnectionState(branch.id) });
  } catch (error) { next(error); }
});

app.get("/api/whatsapp-lines", (request, response) => {
  const user=currentUser(request); if(!user)return response.status(401).json({error:"Sesión requerida."});
  response.setHeader("Cache-Control","no-store");
  response.json({lines:(data.whatsappLines||[]).filter((line)=>canUserMonitorWhatsappLine(user,line)).map((line)=>publicWhatsappLine(line,user))});
});

app.post("/api/whatsapp-lines", requireAdmin, async (request,response,next)=>{try{
  const input=request.body||{}; const branch=getBranch(cleanText(input.branchId,120)); if(!branch||branch.active===false)throw new Error("Seleccioná una sucursal activa.");
  const name=cleanText(input.name,120); if(!name)throw new Error("Ingresá un nombre para la línea."); const provider=input.provider==="cloud"?"cloud":"qr"; const phone=cleanText(input.phone,40);
  if(phone&&(normalizePhone(phone).length<10||normalizePhone(phone).length>15))throw new Error("Ingresá un número válido.");
  if(phone&&(data.whatsappLines||[]).some((line)=>normalizePhone(line.phone)===normalizePhone(phone)))throw new Error("Ese número ya está registrado en otra línea.");
  const allowed=(Array.isArray(input.allowedUserIds)?input.allowedUserIds:[]).filter((id)=>data.users.some((u)=>u.id===id&&u.active!==false&&(u.branchId===branch.id||u.role==="manager")));
  const line={id:makeId("line"),name,branchId:branch.id,provider,phone,active:input.active!==false,isDefault:input.isDefault===true,legacyBranchSession:false,accessMode:input.accessMode==="selected"?"selected":"branch",allowedUserIds:[...new Set(allowed)],supervisorsCanUse:input.supervisorsCanUse!==false,managersCanUse:input.managersCanUse!==false,botEnabled:input.botEnabled!==false,notes:cleanText(input.notes,1000),cloud:{phoneNumberId:cleanText(input.cloud?.phoneNumberId,80),businessAccountId:cleanText(input.cloud?.businessAccountId,80),apiVersion:cleanText(input.cloud?.apiVersion||"v23.0",20)||"v23.0",accessToken:typeof input.cloud?.accessToken==="string"?input.cloud.accessToken.trim():"",verifyToken:typeof input.cloud?.verifyToken==="string"?input.cloud.verifyToken.trim():""},createdAt:timestamp(),updatedAt:timestamp()};
  if(line.isDefault)for(const other of data.whatsappLines)if(other.branchId===branch.id)other.isDefault=false; data.whatsappLines.push(line); recordAuditEvent(request.currentUser,"linea_whatsapp_creada",{lineId:line.id,name:line.name,branchId:branch.id,provider:line.provider},branch.id); await store.save(); response.json(stateResponse(request));
}catch(error){next(error);}});

app.put("/api/whatsapp-lines/:id", requireAdmin, async (request,response,next)=>{try{
  const line=whatsappLineById(request.params.id); if(!line)throw new Error("Línea no encontrada."); const input=request.body||{};
  if(typeof input.name==="string")line.name=cleanText(input.name,120)||line.name;
  if(!line.legacyBranchSession&&typeof input.provider==="string")line.provider=input.provider==="cloud"?"cloud":"qr";
  if(typeof input.phone==="string"){const phone=cleanText(input.phone,40);if(phone&&(normalizePhone(phone).length<10||normalizePhone(phone).length>15))throw new Error("Número inválido.");if(phone&&(data.whatsappLines||[]).some((other)=>other.id!==line.id&&normalizePhone(other.phone)===normalizePhone(phone)))throw new Error("Ese número ya está registrado en otra línea.");line.phone=phone;}
  if(typeof input.active==="boolean")line.active=input.active;
  if(typeof input.accessMode==="string")line.accessMode=input.accessMode==="selected"?"selected":"branch";
  if(Array.isArray(input.allowedUserIds))line.allowedUserIds=[...new Set(input.allowedUserIds.filter((id)=>data.users.some((u)=>u.id===id&&u.active!==false&&(u.branchId===line.branchId||u.role==="manager"))))];
  if(typeof input.supervisorsCanUse==="boolean")line.supervisorsCanUse=input.supervisorsCanUse;
  if(typeof input.managersCanUse==="boolean")line.managersCanUse=input.managersCanUse;
  if(typeof input.botEnabled==="boolean")line.botEnabled=input.botEnabled;
  if(typeof input.notes==="string")line.notes=cleanText(input.notes,1000);
  if(input.isDefault===true){for(const other of data.whatsappLines)if(other.branchId===line.branchId)other.isDefault=false;line.isDefault=true;}
  if(input.cloud&&typeof input.cloud==="object"){line.cloud=line.cloud||{};for(const key of ["phoneNumberId","businessAccountId","apiVersion"]){if(typeof input.cloud[key]==="string")line.cloud[key]=cleanText(input.cloud[key],80);}if(typeof input.cloud.accessToken==="string"&&input.cloud.accessToken.trim())line.cloud.accessToken=input.cloud.accessToken.trim();if(typeof input.cloud.verifyToken==="string"&&input.cloud.verifyToken.trim())line.cloud.verifyToken=input.cloud.verifyToken.trim();if(input.cloud.clearAccessToken===true)line.cloud.accessToken="";if(input.cloud.clearVerifyToken===true)line.cloud.verifyToken="";}
  line.updatedAt=timestamp();recordAuditEvent(request.currentUser,"linea_whatsapp_actualizada",{lineId:line.id,name:line.name,provider:line.provider,active:line.active,accessMode:line.accessMode,allowedUsers:line.allowedUserIds.length},line.branchId);await store.save();response.json(stateResponse(request));
}catch(error){next(error);}});

app.post("/api/whatsapp-lines/:id/connect", requireManagerOrAdmin, async (request,response,next)=>{try{const user=request.currentUser||currentUser(request),line=whatsappLineById(request.params.id);if(!line||line.active===false)throw new Error("Línea no encontrada o inactiva.");if(user.role!=="admin"&&!canUserUseWhatsappLine(user,line))throw new Error("No tenés permiso para conectar esta línea.");void startWhatsappLineConnection(line.id);response.status(202).json({ok:true,revision:store.revision,line:{id:line.id,connection:whatsappLineConnectionState(line.id)}});}catch(error){next(error);}});
app.post("/api/whatsapp-lines/:id/disconnect", requireManagerOrAdmin, async (request,response,next)=>{try{const user=request.currentUser||currentUser(request),line=whatsappLineById(request.params.id);if(!line)throw new Error("Línea no encontrada.");if(user.role!=="admin"&&!canUserUseWhatsappLine(user,line))throw new Error("No tenés permiso para desconectar esta línea.");await disconnectWhatsappLineConnection(line.id);await store.save();response.json({ok:true,revision:store.revision,line:{id:line.id,connection:whatsappLineConnectionState(line.id)}});}catch(error){next(error);}});
app.delete("/api/whatsapp-lines/:id", requireAdmin, async (request,response,next)=>{try{const line=whatsappLineById(request.params.id);if(!line)throw new Error("Línea no encontrada.");if(line.legacyBranchSession)throw new Error("La línea principal migrada no se elimina; podés desactivarla desde su configuración.");if((data.deals||[]).some((deal)=>deal.lineId===line.id)){line.active=false;line.updatedAt=timestamp();}else{await disconnectWhatsappLineConnection(line.id).catch(()=>{});data.whatsappLines=data.whatsappLines.filter((entry)=>entry.id!==line.id);}recordAuditEvent(request.currentUser,"linea_whatsapp_eliminada",{lineId:line.id,name:line.name},line.branchId);await store.save();response.json(stateResponse(request));}catch(error){next(error);}});

app.post("/api/deals/:id/transfer", async (request, response, next) => {
  try {
    const actor = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada o ya cerrada.");
    ensureDealOwnership(deal, actor, { claim: true });
    const sourceBranch = getBranch(deal.branchId || primaryBranchId());
    if (!sourceBranch) throw new Error("La negociación no tiene una sucursal válida.");
    const targetUserId = cleanText(request.body?.userId, 120);
    const targetBranchId = cleanText(request.body?.branchId, 120);

    if (targetUserId) {
      const targetUser = data.users.find((entry) => entry.id === targetUserId && entry.active !== false);
      if (!targetUser) throw new Error("Compañero no encontrado.");
      if (targetUser.branchId !== sourceBranch.id) throw new Error("Ese usuario pertenece a otra sucursal. Seleccioná transferencia a sucursal.");
      deal.ownerUserId = targetUser.id; deal.ownerName = targetUser.name; deal.updatedAt = timestamp();
      const client = findClient(data, deal.clientId);
      if (client) {
        if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};
        client.branchOwners[sourceBranch.id] = { userId: targetUser.id, userName: targetUser.name, updatedAt: timestamp() };
        client.ownerUserId = targetUser.id; client.ownerName = targetUser.name; client.updatedAt = timestamp();
      }
      addActivity(data, `${actor.name} transfirió a ${deal.name} a ${targetUser.name} dentro de ${sourceBranch.name}.`, "success");
      await store.save();
      return response.json(stateResponse(request));
    }

    const targetBranch = getBranch(targetBranchId);
    if (!targetBranch || targetBranch.active === false) throw new Error("Seleccioná una sucursal destino válida.");
    if (targetBranch.id === sourceBranch.id) throw new Error("Para la misma sucursal seleccioná un compañero.");

    const client = findClient(data, deal.clientId);
    const verifiedIdentity = await verifiedClientPhoneForTransfer(deal, client, sourceBranch.id, request.body?.clientPhone);
    if (!verifiedIdentity.phone) throw new Error("No se pudo verificar el número real del cliente antes de la derivación.");

    const transferId = makeId("transfer");
    const interest = cleanText(request.body?.interest, 300);
    const reason = cleanText(request.body?.reason, 600);
    const note = cleanText(request.body?.note, 600);
    const jid = `${verifiedIdentity.phone}@s.whatsapp.net`;

    // V15: la derivación ya no viaja por un mensaje interno entre sucursales.
    // Ambas sucursales comparten la misma base, por lo que se crea inmediatamente la negociación destino.
    const targetLine=defaultWhatsappLine(targetBranch.id);
    let targetDeal = findOpenDeal(data, jid, targetBranch.id, targetLine?.id||null);
    if (!targetDeal) targetDeal = createDeal(data, { jid, name: client?.name || deal.name, branchId: targetBranch.id, lineId:targetLine?.id||null, source: "central-transfer" });
    else if(targetLine&&!targetDeal.lineId) targetDeal.lineId=targetLine.id;
    targetDeal.source = "central-transfer";
    targetDeal.botActive = false;
    targetDeal.lastMessage = `Derivado desde ${sourceBranch.name}${interest ? ` · ${interest}` : reason ? ` · ${reason}` : ""}`;
    targetDeal.updatedAt = timestamp();
    const targetClient = findClient(data, targetDeal.clientId) || client;
    const targetOwner = chooseIncomingTransferOwner(targetClient, targetBranch.id);
    if (targetOwner) applyOwnerToClientAndDeal(targetClient, targetDeal, targetOwner, targetBranch.id);
    targetDeal.messages = Array.isArray(targetDeal.messages) ? targetDeal.messages : [];
    targetDeal.messages.push({ id: makeId("message"), direction: "incoming", origin: "transfer", text: transferSystemMessage({ interest, reason, note, sourceName: sourceBranch.name }, sourceBranch, targetOwner), at: timestamp() });

    releaseDealReservations(data, deal, `Transferencia a ${targetBranch.name}`);
    deal.stage = STAGES.TRANSFERRED;
    deal.transferredToBranchId = targetBranch.id;
    deal.transferredAt = timestamp();
    deal.transferredByUserId = actor.id;
    deal.transferredByName = actor.name;
    deal.botActive = false;
    deal.waitingSince = null;
    deal.outcomeAt = timestamp();
    deal.updatedAt = timestamp();
    deal.lastMessage = `Derivado a ${targetBranch.name}${interest ? ` · ${interest}` : reason ? ` · ${reason}` : ""}`;
    deal.transferHistory = Array.isArray(deal.transferHistory) ? deal.transferHistory : [];
    deal.transferHistory.push({ id: transferId, direction: "outgoing", sourceBranchId: sourceBranch.id, targetBranchId: targetBranch.id, targetDealId: targetDeal.id, at: timestamp(), byUserId: actor.id, byName: actor.name, interest, reason, note });

    data.transfers.unshift({ id: transferId, sourceBranchId: sourceBranch.id, targetBranchId: targetBranch.id, sourceDealId: deal.id, targetDealId: targetDeal.id, clientId: targetDeal.clientId || deal.clientId, clientPhone: `+${verifiedIdentity.phone}`, clientName: targetDeal.name, interest, reason, note, requestedByUserId: actor.id, requestedByName: actor.name, direction: "internal", status: "received", createdAt: timestamp() });
    if (data.transfers.length > 2000) data.transfers.splice(2000);

    // Si el WhatsApp destino está conectado, se presenta automáticamente desde la línea correcta de esa sucursal.
    if (branchStatus(targetBranch.id) === "connected") {
      try {
        const intro = renderBranchIntro(targetBranch, sourceBranch, targetClient || client || { name: targetDeal.name }, { interest, reason, note, sourceName: sourceBranch.name });
        const messageId = await sendProviderText(targetDeal, intro);
        recordHumanOutgoing(data, { jid: targetDeal.jid, text: intro, messageId, userId: targetOwner?.id || actor.id, userName: targetOwner?.name || actor.name, branchId: targetBranch.id, lineId:targetDeal.lineId||targetLine?.id||null });
        targetDeal.stage = STAGES.CONTACTED;
        targetDeal.lastMessage = intro;
        targetDeal.updatedAt = timestamp();
      } catch (error) {
        addActivity(data, `${targetBranch.name}: la negociación fue derivada, pero no se pudo enviar la presentación automática.`, "warning");
      }
    }

    recordAuditEvent(actor, "conversacion_transferida", { dealId: deal.id, targetDealId: targetDeal.id, clientPhone: verifiedIdentity.phone, clientName: deal.name, sourceBranch: sourceBranch.name, targetBranch: targetBranch.name, ownerName: targetOwner?.name || "" }, sourceBranch.id);
    addActivity(data, `${actor.name} derivó a ${deal.name} de ${sourceBranch.name} a ${targetBranch.name}${targetOwner ? ` · responsable: ${targetOwner.name}` : ""}.`, "success");
    await store.save();
    return response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/connect", async (request, response, next) => {
  try {
    if (data.settings.whatsappMode === "cloud") {
      if (!cloudApiConfigured()) throw new Error("Completá el ID del número y el token de WhatsApp API.");
      addActivity(data, "WhatsApp API configurada como conexión activa.", "success");
      await store.save();
      return response.json({ ok:true, revision:store.revision, connection:connectionState() });
    }
    void startConnection();
    return response.status(202).json({ ok:true, revision:store.revision, connection:connectionState() });
  } catch (error) { return next(error); }
});

app.post("/api/disconnect", async (request, response) => {
  if (data.settings.whatsappMode !== "cloud") await disconnect();
  response.json({ ok:true, revision:store.revision, connection:connectionState() });
});

app.post("/api/deals/:id/bot", async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    const user = currentUser(request);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user);
    deal.botActive = request.body?.active === true;
    if (deal.botActive) {
      // La única forma de devolver el bot automático luego del handoff es esta acción explícita.
      deal.botHumanHandoff = false;
      deal.botMode = "auto";
      deal.botPauseReason = "";
      deal.botHandoffAt = null;
      deal.botHandoffByUserId = null;
      deal.botHandoffByName = "";
    } else {
      deal.botMode = deal.botHumanHandoff ? "copilot" : "paused";
      if (!deal.botHumanHandoff) deal.botPauseReason = "manual";
    }
    deal.updatedAt = timestamp();
    addActivity(
      data,
      deal.botActive ? `Bot reactivado manualmente para ${deal.name}.` : deal.botHumanHandoff ? `${deal.name} permanece en modo Copiloto; el bot no responderá automáticamente.` : `Bot pausado manualmente para ${deal.name}.`,
      deal.botActive ? "success" : "neutral",
    );
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/message", async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    const user = currentUser(request);
    const text = cleanText(request.body?.text, 4000);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);
    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });
    if (!text) throw new Error("Escribí un mensaje.");
    const messageId = await sendProviderText(deal, text);
    rememberSeen(messageId);
    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name, branchId: deal.branchId, lineId: dealLineId(deal) });
    refreshDealCommercialStatus(deal,true);
    addActivity(data, temporaryGrant && deal.ownerUserId !== user.id ? `${user.name} respondió a ${deal.name} con autorización temporal; ${deal.ownerName || "el responsable original"} mantiene la titularidad.` : `${user.name} respondió a ${deal.name}; quedó como responsable principal.`, "success");
    queueSuperAutomationEvent({ type:"outgoing_message", deal, client:automationClientForDeal(deal), line:dealWhatsappLine(deal), branch:getBranch(deal.branchId), phone:deal.phone, text, message:{text,id:messageId} });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/deals/:id/media",
  express.raw({ type: () => true, limit: maximumMediaBytes }),
  async (request, response, next) => {
    let attachment = null;
    try {
      const deal = findDeal(data, request.params.id);
      const user = currentUser(request);
      if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
      ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });
      if (!Buffer.isBuffer(request.body) || !request.body.length) throw new Error("Seleccioná un archivo.");
      const info = outgoingMediaInfo(request);
      attachment = await saveAttachmentBuffer(request.body, info);
      const text = info.caption || messageLabel(info);
      const messageId = await sendProviderMedia(deal, request.body, info);
      rememberSeen(messageId);
      recordHumanOutgoing(data, {
        jid: deal.jid,
        name: deal.name,
        text,
        messageId,
        attachment,
        userId: user.id,
        userName: user.name,
        branchId: deal.branchId,
        lineId: dealLineId(deal),
      });
      addActivity(data, `${info.fileName} enviado a ${deal.name}; la conversación quedó en modo Copiloto.`, "success");
      await store.save();
      response.json(stateResponse(request));
    } catch (error) {
      if (attachment?.storedName) {
        await unlink(path.join(mediaDirectory, path.basename(attachment.storedName))).catch(() => {});
      }
      next(error);
    }
  },
);


app.post("/api/deals/:id/won", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const existing = findDeal(data, request.params.id);
    if (!existing || !OPEN_STAGES.has(existing.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(existing, user, { claim: true });
    const fromStage = existing.stage;
    const deal = closeWon(data, request.params.id);
    refreshDealCommercialStatus(deal,true);
    markCampaignConversion(deal.clientId, deal.id);
    addActivity(data, `${user.name} marcó a ${deal.name} como negociación ganada.`, "success");
    queueSuperAutomationEvent({ type:"stage_changed", deal, client:automationClientForDeal(deal), line:dealWhatsappLine(deal), branch:getBranch(deal.branchId), fromStage, toStage:STAGES.WON, text:"" });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/lost", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const existing = findDeal(data, request.params.id);
    if (!existing || !OPEN_STAGES.has(existing.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(existing, user, { claim: true });
    const fromStage = existing.stage;
    const deal = closeLost(data, request.params.id, request.body?.reasonId);
    refreshDealCommercialStatus(deal,true);
    addActivity(data, `${user.name} cerró a ${deal.name} como perdido (${deal.lossReasonName}).`, "warning");
    queueSuperAutomationEvent({ type:"stage_changed", deal, client:automationClientForDeal(deal), line:dealWhatsappLine(deal), branch:getBranch(deal.branchId), fromStage, toStage:STAGES.LOST, text:"" });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/reserve", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true });
    reserveProduct(
      data,
      request.params.id,
      request.body?.productId,
      request.body?.quantity,
      "manual",
    );
    addActivity(data, `${user.name} reservó un producto para ${deal.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/deals/:id/items/:itemId", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true });
    removeReservedItem(data, request.params.id, request.params.itemId);
    addActivity(data, `${user.name} devolvió una reserva de ${deal.name} al stock.`);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/import-csv", express.text({ type: () => true, limit: "5mb" }), requireManagerOrAdmin, async (request, response, next) => {
  try {
    const rows = parseCsv(request.body);
    if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos un producto.");
    const headers = rows[0].map(headerKey);
    const find = (...aliases) => headers.findIndex((value) => aliases.includes(value));
    const indexes = {
      sku: find("codigo", "codigoproducto", "sku", "code"),
      name: find("nombre", "producto", "name"),
      description: find("descripcion", "detalle", "description"),
      available: find("disponible", "stock", "cantidad", "available"),
      minStock: find("minimo", "stockminimo", "minstock"),
      price: find("precio", "price"),
      active: find("activo", "active"),
    };
    if (indexes.sku < 0 || indexes.name < 0) throw new Error("El CSV necesita las columnas Código/SKU y Nombre.");
    let created = 0; let updated = 0; const errors = [];
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      const sku = cleanText(row[indexes.sku], 80);
      const name = cleanText(row[indexes.name], 160);
      if (!sku || !name) { errors.push(`Fila ${index + 1}: falta código o nombre.`); continue; }
      try {
        const existing = data.products.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
        const number = (position) => position >= 0 ? Number(String(row[position] || "0").replace(/\./g, "").replace(",", ".")) || 0 : 0;
        upsertProduct(data, {
          id: existing?.id,
          sku,
          name,
          description: indexes.description >= 0 ? row[indexes.description] : existing?.description || "",
          available: indexes.available >= 0 ? number(indexes.available) : existing?.available || 0,
          minStock: indexes.minStock >= 0 ? number(indexes.minStock) : existing?.minStock || 0,
          price: indexes.price >= 0 ? number(indexes.price) : existing?.price || 0,
          active: indexes.active < 0 ? true : !["0", "no", "false", "inactivo"].includes(String(row[indexes.active] || "").toLowerCase()),
        });
        existing ? updated += 1 : created += 1;
      } catch (error) { errors.push(`Fila ${index + 1}: ${error.message}`); }
    }
    addActivity(data, `CSV de stock importado: ${created} nuevos y ${updated} actualizados.`, "success");
    await store.save();
    response.json({ ...stateResponse(request), importResult: { created, updated, errors: errors.slice(0, 20) } });
  } catch (error) { next(error); }
});

app.post("/api/products", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = upsertProduct(data, request.body || {});
    addActivity(data, `Producto ${product.name} guardado.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.put("/api/products/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = upsertProduct(data, { ...(request.body || {}), id: request.params.id });
    addActivity(data, `Producto ${product.name} actualizado.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/:id/adjust", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = adjustStock(
      data,
      request.params.id,
      request.body?.quantity,
      request.body?.note,
    );
    addActivity(data, `Stock de ${product.name} ajustado.`, "success");
    queueSuperAutomationEvent({ type:"stock_changed", product, branch:primaryBranch(), text:cleanText(request.body?.note,240), quantity:Number(request.body?.quantity)||0 });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = data.products.find((item) => item.id === request.params.id);
    if (!product) throw new Error("Producto no encontrado.");
    product.active = false;
    product.updatedAt = timestamp();
    addActivity(data, `Producto ${product.name} archivado.`);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/loss-reasons", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const name = cleanText(request.body?.name, 120);
    if (!name) throw new Error("Ingresá el motivo.");
    if (data.settings.lossReasons.some((reason) => reason.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Ese motivo ya existe.");
    }
    data.settings.lossReasons.push({
      id: makeId("reason"),
      name,
      order: data.settings.lossReasons.length,
    });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.put("/api/loss-reasons/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const reason = data.settings.lossReasons.find((item) => item.id === request.params.id);
    const name = cleanText(request.body?.name, 120);
    if (!reason) throw new Error("Motivo no encontrado.");
    if (!name) throw new Error("Ingresá el motivo.");
    reason.name = name;
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/loss-reasons/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    if (data.settings.lossReasons.length <= 1) {
      throw new Error("Debe quedar al menos un motivo de cierre.");
    }
    const index = data.settings.lossReasons.findIndex((item) => item.id === request.params.id);
    if (index < 0) throw new Error("Motivo no encontrado.");
    data.settings.lossReasons.splice(index, 1);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});


// V20 · Plataforma Total IA
app.get("/api/admin-guide/catalog",requireAdmin,(request,response)=>response.json({settings:{...data.settings.adminGuide},catalog:ADMIN_GUIDE_CATALOG,modules:{...data.settings.modules},aiFeatures:{...data.settings.aiFeatures}}));
app.post("/api/admin-guide/settings",requireAdmin,async(request,response,next)=>{try{const i=request.body||{};data.settings.adminGuide={...data.settings.adminGuide,enabled:i.enabled!==false,contextualTips:i.contextualTips!==false,showExamples:i.showExamples!==false,showBestPractices:i.showBestPractices!==false};recordAuditEvent(request.currentUser,"guia_admin_configurada",data.settings.adminGuide,request.currentUser.branchId||primaryBranchId());await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/ai-governance/settings",requireAdmin,async(request,response,next)=>{try{const i=request.body||{};data.settings.aiGovernance={...data.settings.aiGovernance,autonomyDefault:Math.min(5,Math.max(0,Number(i.autonomyDefault??3))),maxExternalAutonomy:Math.min(5,Math.max(0,Number(i.maxExternalAutonomy??3))),requireApprovalAboveAmount:Math.max(0,Number(i.requireApprovalAboveAmount)||0),monthlyBudgetUsd:Math.max(0,Number(i.monthlyBudgetUsd)||0),modelRouting:i.modelRouting!==false,logAllAiActions:i.logAllAiActions!==false};recordAuditEvent(request.currentUser,"gobernanza_ia_configurada",data.settings.aiGovernance,request.currentUser.branchId||primaryBranchId());await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.get("/api/advanced/overview",(request,response)=>{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("advancedSuite"))return response.status(403).json({error:"Suite avanzada desactivada."});response.json({overview:advancedOverview(u)});});
app.get("/api/ai/shadow-brief",(request,response)=>{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!aiFeatureEnabled("shadowAgent"))return response.status(403).json({error:"Shadow Agent desactivado."});const mine=(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)&&(u.role!=="agent"||d.ownerUserId===u.id)&&(u.role==="admin"||u.role==="manager"||!u.branchId||d.branchId===u.branchId));const waiting=mine.filter(d=>d.stage===STAGES.WAITING);const overdue=visibleTasksFor(u).filter(t=>t.status!=="done"&&t.dueAt&&Date.parse(t.dueAt)<Date.now());response.json({brief:`Tenés ${mine.length} negociaciones abiertas, ${waiting.length} clientes esperando y ${overdue.length} tareas vencidas. ${waiting[0]?`Prioridad sugerida: ${waiting[0].name||waiting[0].phone}.`:"Tu cartera visible no tiene clientes esperando."}`});});
app.post("/api/ai/command-center",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("commandCenter"))return response.status(403).json({error:"Centro de Comando desactivado."});const q=cleanText(request.body?.question,3000);if(!q)throw new Error("Escribí una pregunta.");const ov=advancedOverview(u),alerts=automaticOperationalAlerts(u).slice(0,15);const context={question:q,overview:ov,alerts,branches:publicBranches().map(b=>({name:b.name,open:b.openDealCount,userCount:b.userCount,connection:b.connection?.status,lines:b.whatsappLineCount})),whatsappLines:(data.whatsappLines||[]).filter(line=>canUserMonitorWhatsappLine(u,line)).map(line=>({name:line.name,branch:getBranch(line.branchId)?.name,status:whatsappLineConnectionState(line.id).status,provider:line.provider}))};const local=`Operación visible: ${ov.open} abiertas, ${ov.waiting} esperando, ${ov.available} agentes disponibles, ${ov.opportunities} oportunidades y ${ov.criticalAlerts} alertas críticas. ${alerts[0]?`Primera prioridad: ${alerts[0].title} — ${alerts[0].detail}`:"No hay alertas críticas inmediatas."}`;if(!data.settings.apiKey){recordAiUsage(u,"commandCenter");return response.json({answer:local,source:"local",status:aiSuiteStatus()});}try{const result=await requestOpenAiText({instructions:"Sos el Centro de Comando de un CRM. Respondé en español usando exclusivamente los datos suministrados. Priorizá riesgos, oportunidades, próximos pasos y decisiones. No inventes cifras.",input:context,maxOutputTokens:1000});recordAiUsage(u,"commandCenter",{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();response.json({answer:cleanText(result.text,8000),source:"ai",endpoint:result.endpoint});}catch(error){recordAiUsage(u,"commandCenter");await store.save();response.json({answer:local,source:"local",warning:cleanText(error.message,600),status:aiSuiteStatus()});}}catch(e){next(e);}});
app.post("/api/ai/semantic-search",(request,response)=>{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!aiFeatureEnabled("semanticSearch"))return response.status(403).json({error:"Búsqueda semántica desactivada."});const q=cleanText(request.body?.query,1000).toLowerCase(),terms=q.split(/\s+/).filter(x=>x.length>2),score=t=>terms.reduce((n,w)=>n+(String(t||"").toLowerCase().includes(w)?1:0),0),results=[];for(const c of data.clients||[]){const sc=score([c.name,c.phone,c.ruc,c.company,c.city,c.notes,(c.tags||[]).join(" ")].join(" "));if(sc)results.push({type:"client",id:c.id,title:c.name||c.phone,detail:[c.phone,c.company,c.ruc].filter(Boolean).join(" · "),score:sc});}for(const d of data.deals||[]){if(u.role!=="admin"&&u.role!=="manager"&&u.branchId&&d.branchId!==u.branchId)continue;const sc=score([d.name,d.phone,d.lastMessage,(d.messages||[]).slice(-20).map(m=>m.text).join(" "),(d.items||[]).map(i=>i.name).join(" ")].join(" "));if(sc)results.push({type:"deal",id:d.id,title:d.name||d.phone,detail:`${d.stage} · ${d.ownerName||"Sin responsable"}`,score:sc});}response.json({results:results.sort((a,b)=>b.score-a.score).slice(0,50)});});
function v20OpportunityCandidates(u){const list=[],now=Date.now();for(const c of data.clients||[]){const h=(data.deals||[]).filter(d=>d.clientId===c.id&&d.stage===STAGES.WON&&(u.role==="admin"||u.role==="manager"||!u.branchId||d.branchId===u.branchId)).sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));if(!h.length)continue;const last=h[0],days=Math.floor((now-Date.parse(last.updatedAt||last.createdAt||0))/86400000);if(days<30)continue;list.push({clientId:c.id,clientName:c.name||c.phone,branchId:last.branchId,type:days>=60?"reactivation":"replenishment",reason:`Última compra hace ${days} días`,score:Math.min(95,50+Math.min(45,days)),ownerUserId:c.branchOwners?.[last.branchId]?.userId||c.ownerUserId||null,ownerName:c.branchOwners?.[last.branchId]?.userName||c.ownerName||""});}return list.sort((a,b)=>b.score-a.score).slice(0,100);}
app.post("/api/advanced/opportunities/generate",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("opportunities"))return response.status(403).json({error:"Radar desactivado."});for(const c of v20OpportunityCandidates(u)){if(data.opportunities.some(o=>o.status!=="closed"&&o.clientId===c.clientId&&o.type===c.type))continue;data.opportunities.unshift({id:makeId("opp"),...c,status:"new",createdAt:timestamp(),updatedAt:timestamp()});}await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/opportunities/:id/status",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});const o=data.opportunities.find(x=>x.id===request.params.id);if(!o)throw new Error("Oportunidad no encontrada.");o.status=["new","working","converted","closed"].includes(request.body?.status)?request.body.status:o.status;o.updatedAt=timestamp();await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/orders",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("orders"))return response.status(403).json({error:"Pedidos desactivados."});const deal=request.body?.dealId?findDeal(data,request.body.dealId):null,branchId=deal?.branchId||u.branchId||primaryBranchId();if(!userCanAccessBranch(u,branchId))return response.status(403).json({error:"Sin acceso."});const o={id:makeId("order"),number:`PED-${String(data.orders.length+1).padStart(5,"0")}`,dealId:deal?.id||null,clientId:deal?.clientId||null,clientName:deal?.name||cleanText(request.body?.clientName,160)||"Cliente",branchId,ownerUserId:deal?.ownerUserId||u.id,ownerName:deal?.ownerName||u.name,items:deal?.items||[],status:"preparing",notes:cleanText(request.body?.notes,3000),createdAt:timestamp(),updatedAt:timestamp()};data.orders.unshift(o);await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/orders/:id/status",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});const o=data.orders.find(x=>x.id===request.params.id);if(!o)throw new Error("Pedido no encontrado.");if(!userCanAccessBranch(u,o.branchId))return response.status(403).json({error:"Sin acceso."});const previous=o.status;o.status=["preparing","ready","dispatched","delivered","incident","cancelled"].includes(request.body?.status)?request.body.status:o.status;o.updatedAt=timestamp();const deal=o.dealId?findDeal(data,o.dealId):null;if(previous!==o.status)queueSuperAutomationEvent({type:"order_status_changed",order:o,deal,client:deal?automationClientForDeal(deal):(o.clientId?findClient(data,o.clientId):null),line:deal?dealWhatsappLine(deal):null,branch:getBranch(o.branchId)||primaryBranch(),phone:deal?.phone||"",text:`${previous} -> ${o.status}`},{depth:0});await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/visits",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("visits"))return response.status(403).json({error:"Visitas desactivadas."});const v={id:makeId("visit"),title:cleanText(request.body?.title,200)||"Visita comercial",clientName:cleanText(request.body?.clientName,160)||"Cliente",branchId:u.branchId||primaryBranchId(),assignedUserId:u.id,assignedUserName:u.name,scheduledAt:request.body?.scheduledAt||timestamp(),status:"scheduled",notes:cleanText(request.body?.notes,3000),createdAt:timestamp(),updatedAt:timestamp()};data.visits.unshift(v);await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/visits/:id/complete",async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});const v=data.visits.find(x=>x.id===request.params.id);if(!v)throw new Error("Visita no encontrada.");v.status="completed";v.result=cleanText(request.body?.result,3000);v.completedAt=timestamp();v.updatedAt=timestamp();await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/academy",requireManagerOrAdmin,async(request,response,next)=>{try{const u=request.currentUser;if(!moduleEnabled("academy"))return response.status(403).json({error:"Academia desactivada."});const t={id:makeId("training"),title:cleanText(request.body?.title,200),body:cleanText(request.body?.body,8000),category:cleanText(request.body?.category||"General",100),active:true,createdByName:u.name,createdAt:timestamp()};if(!t.title)throw new Error("Indicá un título.");data.trainingItems.unshift(t);await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/security/scan",requireManagerOrAdmin,async(request,response,next)=>{try{const u=request.currentUser;if(!moduleEnabled("security"))return response.status(403).json({error:"Seguridad desactivada."});const recent=(data.auditEvents||[]).filter(e=>Date.now()-Date.parse(e.at||e.createdAt||0)<86400000),counts=new Map();for(const e of recent){const k=e.userId||e.userName||"system";counts.set(k,(counts.get(k)||0)+1);}for(const [k,n] of counts){if(n>250&&!data.securityAlerts.some(a=>a.status==="open"&&a.userKey===k))data.securityAlerts.unshift({id:makeId("sec"),severity:"warning",title:"Actividad inusualmente alta",detail:`${n} movimientos en las últimas 24 h.`,userKey:k,branchId:u.branchId||null,status:"open",createdAt:timestamp()});}await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.post("/api/advanced/security/:id/resolve",requireManagerOrAdmin,async(request,response,next)=>{try{const a=data.securityAlerts.find(x=>x.id===request.params.id);if(!a)throw new Error("Alerta no encontrada.");a.status="resolved";a.resolvedAt=timestamp();a.resolvedByName=request.currentUser.name;await store.save();response.json(stateResponse(request));}catch(e){next(e);}});
app.get("/api/admin/super-automation", requireAdmin, (request,response)=>{response.setHeader("Cache-Control","no-store");response.json({settings:{...data.settings.superAutomation},stageLabels:{...data.settings.stageLabels},rules:(data.automationRules||[]).slice(0,500),waits:(data.automationWaits||[]).filter((entry)=>entry.status==="waiting").slice(0,300),executions:(data.automationExecutions||[]).slice(0,300),catalog:superAutomationCatalog(),runtime:{lastError:superAutomationRuntime.lastError,lastRunAt:superAutomationRuntime.lastRunAt}});});
app.post("/api/admin/super-automation/instruction", requireAdmin, async(request,response,next)=>{try{if(data.settings.superAutomation?.enabled===false)throw new Error("La Super IA de automatizaciones está desactivada.");const result=await prepareSuperAdminInstruction(request.body?.instruction,request.currentUser);response.json({...result,state:result.needsConfirmation?undefined:stateResponse(request)});}catch(error){next(error);}});
app.post("/api/admin/super-automation/instruction/confirm", requireAdmin, async(request,response,next)=>{try{const result=await confirmSuperAdminInstruction(cleanText(request.body?.pendingId,180),request.currentUser,request.body?.special===true);response.json({...result,state:stateResponse(request)});}catch(error){next(error);}});
app.post("/api/admin/super-automation/settings", requireAdmin, async(request,response,next)=>{try{const input=request.body||{};createConfigurationVersion(request.currentUser,"Antes de cambiar configuración Super IA");data.settings.superAutomation={...data.settings.superAutomation,enabled:input.enabled!==false,executeDirectly:input.executeDirectly!==false,silentByDefault:input.silentByDefault!==false,maxChainDepth:Math.min(20,Math.max(3,Number(input.maxChainDepth)||10)),defaultReplyTimeoutMinutes:Math.min(525600,Math.max(1,Number(input.defaultReplyTimeoutMinutes)||60)),logExecutions:input.logExecutions!==false};recordAuditEvent(request.currentUser,"super_ia_configurada",data.settings.superAutomation,request.currentUser.branchId||primaryBranchId());await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.put("/api/admin/super-automation/rules/:id", requireAdmin, async(request,response,next)=>{try{const rule=(data.automationRules||[]).find((entry)=>entry.id===request.params.id);if(!rule)throw new Error("Regla no encontrada.");createConfigurationVersion(request.currentUser,`Antes de editar regla ${rule.name}`,{ruleId:rule.id});const merged={...rule};if(request.body?.enabled!==undefined)merged.enabled=request.body.enabled!==false;if(request.body?.name!==undefined)merged.name=cleanText(request.body.name,180)||rule.name;if(request.body?.actions)merged.actions=request.body.actions;if(request.body?.trigger)merged.trigger=request.body.trigger;if(request.body?.conditions)merged.conditions=request.body.conditions;if(request.body?.conditionMode)merged.conditionMode=request.body.conditionMode;if(request.body?.cooldownMinutes!==undefined)merged.cooldownMinutes=request.body.cooldownMinutes;if(request.body?.oncePerClient!==undefined)merged.oncePerClient=request.body.oncePerClient;if(request.body?.maxExecutions!==undefined)merged.maxExecutions=request.body.maxExecutions;const updated=sanitizeAutomationRule({...merged,id:rule.id,createdAt:rule.createdAt,createdByUserId:rule.createdByUserId,createdByName:rule.createdByName,executionCount:rule.executionCount,lastExecutedAt:rule.lastExecutedAt,lastError:rule.lastError,version:Number(rule.version||1)+1},request.currentUser);Object.assign(rule,updated);recordAuditEvent(request.currentUser,"super_ia_regla_editada_manual",{ruleId:rule.id,enabled:rule.enabled,version:rule.version},request.currentUser.branchId||primaryBranchId());await store.save();response.json({rule,state:stateResponse(request)});}catch(error){next(error);}});
app.delete("/api/admin/super-automation/rules/:id", requireAdmin, async(request,response,next)=>{try{const rule=(data.automationRules||[]).find((entry)=>entry.id===request.params.id);if(!rule)throw new Error("Regla no encontrada.");createConfigurationVersion(request.currentUser,`Antes de eliminar regla ${rule.name}`,{ruleId:rule.id});data.automationRules=data.automationRules.filter((entry)=>entry.id!==rule.id);for(const wait of data.automationWaits||[])if(wait.ruleId===rule.id&&wait.status==="waiting")wait.status="cancelled";recordAuditEvent(request.currentUser,"super_ia_regla_eliminada",{ruleId:rule.id,name:rule.name},request.currentUser.branchId||primaryBranchId());await store.save();response.json(stateResponse(request));}catch(error){next(error);}});
app.post("/api/admin/super-automation/rules/:id/run", requireAdmin, async(request,response,next)=>{try{const rule=(data.automationRules||[]).find((entry)=>entry.id===request.params.id);if(!rule)throw new Error("Regla no encontrada.");const dealId=cleanText(request.body?.dealId,160);const deal=dealId?findDeal(data,dealId):null;const event={type:rule.trigger?.type==="manual"?"manual":rule.trigger?.type||"manual",deal,client:deal?automationClientForDeal(deal):null,line:deal?dealWhatsappLine(deal):null,branch:deal?getBranch(deal.branchId):primaryBranch(),phone:normalizePhone(request.body?.phone||deal?.phone||""),text:cleanText(request.body?.text,6000)};const execution=await executeSuperAutomationRule(rule,event,{depth:0});response.json({execution,state:stateResponse(request)});}catch(error){next(error);}});
app.get("/api/admin/super-admin", requireAdmin, (request,response)=>{
  response.setHeader("Cache-Control","no-store");
  response.json({settings:cloneJson(data.settings.superAdmin||{}),versions:(data.configurationVersions||[]).slice(0,50).map(({snapshot,...v})=>v),findings:(data.superAdminFindings||[]).slice(0,300),runtime:{lastScanAt:superAdminRuntime.lastScanAt,lastScanError:superAdminRuntime.lastScanError},subflows:(data.automationSubflows||[]).slice(0,200),flows:(data.crmFlows||[]).slice(0,200),customModules:(data.customModules||[]).slice(0,200),dashboards:(data.dashboardDefinitions||[]).slice(0,200),roleProfiles:(data.roleProfiles||[]).slice(0,200),aiPolicies:(data.aiPolicies||[]).slice(0,200),pending:(data.superAdminPending||[]).filter(x=>Date.parse(x.expiresAt||0)>Date.now()).map(x=>({id:x.id,instruction:x.instruction,risk:x.risk,policy:x.policy,createdAt:x.createdAt,expiresAt:x.expiresAt,conflicts:x.conflicts}))});
});
app.post("/api/admin/super-admin/settings", requireAdmin, async(request,response,next)=>{try{const input=request.body||{};createConfigurationVersion(request.currentUser,"Antes de cambiar poderes Super IA");const modes=['automatic','confirm','special_confirm','blocked'];for(const risk of ['low','medium','high','destructive'])if(modes.includes(input.powerPolicy?.[risk]))data.settings.superAdmin.powerPolicy[risk]=input.powerPolicy[risk];if(input.supervisorEnabled!==undefined)data.settings.superAdmin.supervisorEnabled=input.supervisorEnabled!==false;if(input.autoRepairLowRisk!==undefined)data.settings.superAdmin.autoRepairLowRisk=input.autoRepairLowRisk===true;if(input.versioningEnabled!==undefined)data.settings.superAdmin.versioningEnabled=input.versioningEnabled!==false;if(input.supervisorIntervalMinutes!==undefined)data.settings.superAdmin.supervisorIntervalMinutes=Math.min(1440,Math.max(5,Number(input.supervisorIntervalMinutes)||15));recordAuditEvent(request.currentUser,'super_ia_poderes_configurados',data.settings.superAdmin,request.currentUser.branchId||primaryBranchId());await store.save();response.json({settings:data.settings.superAdmin,state:stateResponse(request)});}catch(error){next(error);}});
app.post("/api/admin/super-admin/rollback/:id", requireAdmin, async(request,response,next)=>{try{const version=(data.configurationVersions||[]).find(x=>x.id===request.params.id);if(!version)throw new Error('Versión no encontrada.');restoreConfigurationVersion(version,request.currentUser);await store.save();response.json({restored:true,versionId:version.id,state:stateResponse(request)});}catch(error){next(error);}});
app.post("/api/admin/super-admin/debug", requireAdmin, async(request,response,next)=>{try{response.json(superAdminDebugger({executionId:cleanText(request.body?.executionId,180)||null,ruleId:cleanText(request.body?.ruleId,180)||null}));}catch(error){next(error);}});
app.post("/api/admin/super-admin/supervisor/scan", requireAdmin, async(request,response,next)=>{try{const findings=superAdminScan();recordAuditEvent(request.currentUser,'super_ia_supervisor_scan',{findings:findings.length},request.currentUser.branchId||primaryBranchId());await store.save();response.json({findings,runtime:{lastScanAt:superAdminRuntime.lastScanAt}});}catch(error){superAdminRuntime.lastScanError=cleanText(error?.message||error,500);next(error);}});
app.post("/api/admin/super-admin/repair/:ruleId", requireAdmin, async(request,response,next)=>{try{const rule=(data.automationRules||[]).find(x=>x.id===request.params.ruleId);if(!rule)throw new Error('Regla no encontrada.');createConfigurationVersion(request.currentUser,`Antes de reparar regla ${rule.name}`,{ruleId:rule.id});let changes=[];const visit=(actions)=>{for(const action of actions||[]){if(action.type==='assign_user'&&action.strategy==='specific'&&action.userId&&!data.users.some(u=>u.id===action.userId&&u.active!==false)){const byName=action.userName?data.users.find(u=>u.active!==false&&cleanText(u.name,160).toLocaleLowerCase('es').includes(cleanText(action.userName,160).toLocaleLowerCase('es'))):null;if(byName){action.userId=byName.id;changes.push('Responsable actualizado por nombre.');}else{action.userId=null;action.strategy='first_available';changes.push('Asignación cambiada a primer agente disponible.');}}if(action.type==='configure_whatsapp_line'&&action.lineId&&!whatsappLineById(action.lineId)){const byName=action.lineName?automationLineByReference({lineName:action.lineName}):null;if(byName){action.lineId=byName.id;changes.push('Referencia de línea WhatsApp actualizada.');}}if(action.type==='call_subflow'&&!findByNameOrId(data.automationSubflows,action.subflowId,action.subflowName)){rule.enabled=false;changes.push('Regla desactivada porque el subflujo ya no existe.');}if(action.type==='wait_for_reply'){for(const b of action.branches||[])visit(b.actions);visit(action.defaultActions);visit(action.timeoutActions);}if(action.type==='delay')visit(action.actions);if(action.type==='branch_condition'){visit(action.thenActions);visit(action.elseActions);}}};visit(rule.actions);rule.lastError=null;rule.updatedAt=timestamp();rule.version=Number(rule.version||1)+1;if(!changes.length)changes.push('No se detectaron referencias reparables; se limpió el error para una nueva prueba.');recordAuditEvent(request.currentUser,'super_ia_reparacion',{ruleId:rule.id,changes},request.currentUser.branchId||primaryBranchId());await store.save();response.json({rule,changes,state:stateResponse(request)});}catch(error){next(error);}});
app.get("/api/admin/super-admin/custom-modules/:id/records", requireAdmin, (request,response)=>{const module=(data.customModules||[]).find(x=>x.id===request.params.id);if(!module)return response.status(404).json({error:'Módulo no encontrado.'});response.json({module,records:(data.customModuleRecords||[]).filter(x=>x.moduleId===module.id).slice(0,1000)});});
app.post("/api/admin/super-admin/custom-modules/:id/records", requireAdmin, async(request,response,next)=>{try{const module=(data.customModules||[]).find(x=>x.id===request.params.id);if(!module)throw new Error('Módulo no encontrado.');const record={id:makeId('cmodrec'),moduleId:module.id,status:cleanText(request.body?.status,120)||module.statuses?.[0]||'Nuevo',responsibleUserId:cleanText(request.body?.responsibleUserId,160)||null,fields:sanitizeAuditValue(request.body?.fields||{}),attachments:[],createdAt:timestamp(),updatedAt:timestamp(),createdByUserId:request.currentUser.id};data.customModuleRecords.unshift(record);await store.save();response.json({record});}catch(error){next(error);}});
app.put("/api/admin/super-admin/custom-modules/:moduleId/records/:id", requireAdmin, async(request,response,next)=>{try{const record=(data.customModuleRecords||[]).find(x=>x.id===request.params.id&&x.moduleId===request.params.moduleId);if(!record)throw new Error('Registro no encontrado.');if(request.body?.status!==undefined)record.status=cleanText(request.body.status,120);if(request.body?.responsibleUserId!==undefined)record.responsibleUserId=cleanText(request.body.responsibleUserId,160)||null;if(request.body?.fields&&typeof request.body.fields==='object')record.fields={...(record.fields||{}),...sanitizeAuditValue(request.body.fields)};record.updatedAt=timestamp();await store.save();response.json({record});}catch(error){next(error);}});

app.post("/api/advanced/automation/simulate",requireAdmin,async(request,response,next)=>{try{const u=currentUser(request);if(!u)return response.status(401).json({error:"Sesión requerida."});if(!moduleEnabled("automationLab"))return response.status(403).json({error:"Laboratorio desactivado."});const instruction=cleanText(request.body?.instruction,4000);if(!instruction)throw new Error("Describí una automatización.");const lower=instruction.toLowerCase();let affected=lower.includes("stock")?(data.products||[]).length:(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)).length;if(lower.includes("tarea"))affected=Math.max(affected,(data.tasks||[]).length);const draft={id:makeId("autodraft"),instruction,status:"draft",estimatedAffected:affected,createdByName:u.name,createdAt:timestamp()};data.automationDrafts.unshift(draft);data.automationDrafts.splice(200);await store.save();response.json({draft,simulation:{affected,summary:`Simulación conservadora: la regla podría revisar aproximadamente ${affected} registros. No se ejecutó ningún cambio.`}});}catch(e){next(e);}});
app.get("/api/ai/usage",requireAdmin,(request,response)=>{const es=data.aiUsage||[],total=es.reduce((a,e)=>({inputTokens:a.inputTokens+Number(e.inputTokens||0),outputTokens:a.outputTokens+Number(e.outputTokens||0),costUsd:a.costUsd+Number(e.costUsd||0)}),{inputTokens:0,outputTokens:0,costUsd:0});response.json({total,entries:es.slice(0,200)});});

// V21 · CRM Autónomo / Inteligencia Operativa
const V21_TEMPLATE_LIBRARY = [
  {key:'vip_recovery',name:'Recuperación VIP',category:'Comercial',description:'Detecta clientes VIP sin compra reciente y prepara seguimiento.',instruction:'Todos los lunes detectá clientes VIP con más de 45 días sin comprar, creá una tarea para su responsable y cancelala si el cliente vuelve a comprar.'},
  {key:'sla_guardian',name:'Guardián de SLA',category:'SAC',description:'Advierte y escala conversaciones próximas a vencer SLA.',instruction:'Cuando un cliente espere más de 20 minutos avisá al responsable; a los 30 minutos avisá al supervisor y prepará reasignación.'},
  {key:'stock_guardian',name:'Guardián de Stock',category:'Stock',description:'Alerta y limita reservas según umbrales.',instruction:'Cuando un producto baje de 20 unidades avisá al encargado; si baja de 10 marcá riesgo crítico y bloqueá nuevas reservas hasta revisión.'},
  {key:'promise_guardian',name:'Guardián de Promesas',category:'Calidad',description:'Convierte promesas detectadas en compromisos verificables.',instruction:'Cuando un agente prometa enviar, llamar o confirmar algo, creá un seguimiento con vencimiento y cerralo si la acción se registra.'},
  {key:'line_contingency',name:'Contingencia WhatsApp',category:'Canales',description:'Protocolo de continuidad ante una línea caída.',instruction:'Si una línea WhatsApp queda desconectada más de 10 minutos avisá al administrador y prepará desvío de nuevos clientes a la línea secundaria.'},
  {key:'abandoned_client',name:'Cliente Abandonado IA',category:'Comercial',description:'Prioriza clientes con valor y riesgo, no solo tiempo.',instruction:'Detectá clientes sin seguimiento considerando valor histórico, intención, sentimiento y tiempo de espera; creá prioridad para el responsable.'}
];

function v21Clamp(value,min=0,max=100){return Math.max(min,Math.min(max,Number(value)||0));}
function v21Digits(value){return String(value||'').replace(/\D/g,'');}
function v21AgeDays(value){const t=Date.parse(value||0);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/86400000):9999;}
function v21Text(value,max=500){return cleanText(value,max);}
function v21ClientDeals(clientId){return (data.deals||[]).filter(d=>d.clientId===clientId).sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||0)-Date.parse(a.updatedAt||a.createdAt||0));}
function v21DealValue(deal){if(Number.isFinite(Number(deal?.amount)))return Math.max(0,Number(deal.amount));return (deal?.items||[]).reduce((sum,item)=>sum+(Math.max(0,Number(item.quantity)||0)*Math.max(0,Number(item.price)||0)),0);}
function v21MessagesForClient(clientId){return v21ClientDeals(clientId).flatMap(d=>(d.messages||[]).map(m=>({...m,dealId:d.id,dealStage:d.stage}))).sort((a,b)=>Date.parse(a.at||0)-Date.parse(b.at||0));}
function v21LatestDeal(clientId){return v21ClientDeals(clientId)[0]||null;}
function v21VisibleClient(user,client){if(!user||!client)return false;if(user.role==='admin'||user.role==='manager')return true;return v21ClientDeals(client.id).some(d=>userCanAccessBranch(user,d.branchId)&&(d.ownerUserId===user.id||!d.ownerUserId));}
function v21Sentiment(messages){const txt=messages.slice(-16).filter(m=>m.direction==='incoming').map(m=>String(m.text||'').toLowerCase()).join(' ');const negative=['molesto','enojado','reclamo','pésimo','pesimo','mal','urgente','cancelar','demora','tarde','problema','nunca'];const positive=['gracias','perfecto','excelente','confirmo','quiero','comprar','bien'];const neg=negative.reduce((n,w)=>n+(txt.includes(w)?1:0),0),pos=positive.reduce((n,w)=>n+(txt.includes(w)?1:0),0);return {label:neg>pos?'negativo':pos>neg?'positivo':'neutral',negativeHits:neg,positiveHits:pos};}
function v21ResponseStats(messages){let total=0,count=0,waitingSince=null,lastIncoming=null;for(const m of messages){const at=Date.parse(m.at||0);if(!Number.isFinite(at))continue;if(m.direction==='incoming'){lastIncoming=at;if(waitingSince===null)waitingSince=at;}else if(m.direction==='outgoing'&&waitingSince!==null){total+=Math.max(0,at-waitingSince);count+=1;waitingSince=null;}}return {averageMinutes:count?Math.round((total/count)/60000):null,waitingMinutes:waitingSince!==null?Math.round((Date.now()-waitingSince)/60000):0,lastIncomingAt:lastIncoming?new Date(lastIncoming).toISOString():null};}
function v21PurchasedSkus(clientId){const out=new Set();for(const d of v21ClientDeals(clientId))if(d.stage===STAGES.WON)for(const i of d.items||[])if(i.productId||i.sku)out.add(String(i.productId||i.sku));return out;}
function v21AgentForClient(client){
  const deals=v21ClientDeals(client.id),messages=v21MessagesForClient(client.id),latest=deals[0]||null,wins=deals.filter(d=>d.stage===STAGES.WON),lost=deals.filter(d=>d.stage===STAGES.LOST),sent=v21Sentiment(messages),resp=v21ResponseStats(messages);
  const lifetimeValue=wins.reduce((sum,d)=>sum+v21DealValue(d),0),lastPurchase=wins[0]?.updatedAt||wins[0]?.createdAt||null,daysSincePurchase=lastPurchase?Math.round(v21AgeDays(lastPurchase)):null,lastTouch=latest?.updatedAt||client.updatedAt||client.createdAt,lastTouchDays=Math.round(v21AgeDays(lastTouch));
  let close=latest?.stage===STAGES.WON?100:latest?.stage===STAGES.LOST?0:25;close+=Math.min(25,wins.length*6);if(sent.label==='positivo')close+=15;if(sent.label==='negativo')close-=18;if(resp.waitingMinutes>30)close-=8;if((latest?.items||[]).length)close+=10;close=v21Clamp(close,3,98);
  let churn=15;if(daysSincePurchase!==null)churn+=Math.min(55,Math.max(0,(daysSincePurchase-30)*0.9));if(sent.label==='negativo')churn+=20;if(lost.length>wins.length)churn+=10;if(lastTouchDays>30)churn+=15;churn=v21Clamp(churn,1,99);
  const confidence=v21Clamp(45+Math.min(20,messages.length*2)+Math.min(20,deals.length*5)+Math.min(15,wins.length*4),45,98);
  const missing=[];if(!client.ruc&&!client.document)missing.push('CI/RUC');if(!client.city&&!client.address)missing.push('Ciudad/Dirección');if(!client.email)missing.push('Email');
  let action='Confirmar necesidad y próximo paso';let reason='No hay una señal dominante que requiera otra acción.';
  if(resp.waitingMinutes>=30){action='Responder y recuperar la conversación';reason=`El cliente lleva aproximadamente ${resp.waitingMinutes} minutos esperando.`;}else if(sent.label==='negativo'){action='Priorizar contención y resolución';reason='Se detectaron señales de frustración o reclamo.';}else if(churn>=65){action='Realizar seguimiento de recuperación';reason='El patrón histórico indica riesgo alto de abandono.';}else if(close>=70){action='Avanzar al cierre con confirmación concreta';reason='La probabilidad de cierre estimada es alta.';}else if(missing.length){action=`Completar ${missing[0]}`;reason='La ficha tiene datos importantes incompletos.';}
  const purchased=v21PurchasedSkus(client.id);const alternatives=(data.products||[]).filter(p=>p.active!==false&&Number(p.available||0)>0&&!purchased.has(String(p.id||p.sku))).sort((a,b)=>Number(b.available||0)-Number(a.available||0)).slice(0,3);
  const offer=alternatives[0]?{productId:alternatives[0].id,name:alternatives[0].name,reason:wins.length?'Producto disponible que todavía no figura en compras ganadas del cliente.':'Producto disponible para explorar necesidad; validar relevancia antes de ofrecer.'}:null;
  const owner=latest?.ownerName||client.ownerName||'Sin responsable';
  const briefing=`${client.name||client.phone||'Cliente'} · ${wins.length} venta(s) ganada(s) · valor histórico registrado ${Math.round(lifetimeValue).toLocaleString('es-PY')} Gs. · sentimiento ${sent.label} · riesgo de abandono ${Math.round(churn)}% · responsable ${owner}.`;
  const negotiationAdvice=sent.label==='negativo'?'Resolver primero el motivo de insatisfacción antes de negociar precio.':close>=70?'Buscar confirmación de cantidad, entrega y condición final; no ofrecer descuentos no autorizados.':'Validar necesidad, presupuesto y fecha antes de modificar condiciones.';
  return {clientId:client.id,clientName:client.name||client.phone,briefing,summary:`${deals.length} gestión(es), ${wins.length} ganada(s), ${lost.length} perdida(s). Último contacto hace ${lastTouchDays} día(s).`,sentiment:sent.label,lifetimeValue,lastPurchase,daysSincePurchase,response:resp,closeProbability:Math.round(close),churnRisk:Math.round(churn),confidence:Math.round(confidence),nextBestAction:{action,reason},nextBestOffer:offer,missingData:missing,negotiationAdvice,generatedAt:timestamp()};
}
function v21UpsertClientAgent(client){const agent=v21AgentForClient(client);const idx=(data.clientAgents||[]).findIndex(x=>x.clientId===client.id);const row={id:idx>=0?data.clientAgents[idx].id:makeId('clientagent'),...agent};if(idx>=0)data.clientAgents[idx]=row;else data.clientAgents.unshift(row);return row;}
function v21PromiseDue(text,at){const base=Number.isFinite(Date.parse(at||0))?new Date(at):new Date();const lower=String(text||'').toLowerCase();const d=new Date(base);if(/mañana/.test(lower))d.setDate(d.getDate()+1);else if(/en\s+24\s*h/.test(lower))d.setHours(d.getHours()+24);else if(/en\s+48\s*h/.test(lower))d.setHours(d.getHours()+48);else if(/hoy|esta tarde|esta mañana/.test(lower))d.setHours(19,0,0,0);else d.setHours(d.getHours()+24);return d.toISOString();}
function v21DetectPromises(){const seen=new Set((data.aiPromises||[]).map(p=>p.messageId).filter(Boolean));const detected=[];const rx=/(te|le)\s+(env[ií]o|mando|llamo|confirmo|aviso)|voy\s+a\s+(enviar|mandar|llamar|confirmar)|mañana\s+(te|le)|antes\s+de\s+.+\s+(te|le)/i;for(const deal of data.deals||[])for(const m of deal.messages||[]){if(m.direction!=='outgoing'||!m.text||seen.has(m.id)||!rx.test(m.text))continue;const p={id:makeId('promise'),messageId:m.id||null,dealId:deal.id,clientId:deal.clientId||null,clientName:deal.name||deal.phone,ownerUserId:m.userId||deal.ownerUserId||null,ownerName:m.userName||deal.ownerName||'',text:v21Text(m.text,600),dueAt:v21PromiseDue(m.text,m.at),status:'pending',detectedAt:timestamp(),source:'conversation'};data.aiPromises.unshift(p);detected.push(p);seen.add(m.id);}data.aiPromises.splice(1000);return detected;}
function v21QualityForDeal(deal){const msgs=(deal.messages||[]).slice(-80),incoming=msgs.filter(m=>m.direction==='incoming'),outgoing=msgs.filter(m=>m.direction==='outgoing'),resp=v21ResponseStats(msgs),sent=v21Sentiment(msgs);let score=82;const notes=[];if(resp.averageMinutes!==null&&resp.averageMinutes>15){score-=Math.min(25,Math.round(resp.averageMinutes/3));notes.push(`Tiempo medio de respuesta alto: ${resp.averageMinutes} min.`);}if(incoming.length&&!outgoing.length){score-=30;notes.push('Hay mensajes entrantes sin respuesta humana registrada.');}if(sent.label==='negativo'){score-=10;notes.push('La conversación contiene señales de insatisfacción; revisar resolución y empatía.');}const long=outgoing.filter(m=>String(m.text||'').length>1200).length;if(long){score-=Math.min(8,long*2);notes.push('Hay respuestas extensas; revisar claridad y síntesis.');}const promise=(data.aiPromises||[]).filter(p=>p.dealId===deal.id&&p.status==='pending').length;if(promise){notes.push(`${promise} promesa(s) pendiente(s) detectada(s).`);score-=Math.min(12,promise*4);}score=v21Clamp(score,20,100);return {dealId:deal.id,clientId:deal.clientId||null,clientName:deal.name||deal.phone,ownerUserId:deal.ownerUserId||null,ownerName:deal.ownerName||'',score:Math.round(score),responseMinutes:resp.averageMinutes,sentiment:sent.label,notes:notes.length?notes:['Sin hallazgos críticos en las señales disponibles.'],reviewedAt:timestamp()};}
function v21RefreshQuality(){const rows=[];for(const deal of (data.deals||[]).slice(0,1000)){if(!(deal.messages||[]).length)continue;const q=v21QualityForDeal(deal),idx=(data.aiQualityReviews||[]).findIndex(x=>x.dealId===deal.id);const row={id:idx>=0?data.aiQualityReviews[idx].id:makeId('quality'),...q};if(idx>=0)data.aiQualityReviews[idx]=row;else data.aiQualityReviews.unshift(row);rows.push(row);}data.aiQualityReviews.splice(1500);return rows;}
function v21AutomationReputation(){const rows=[];for(const rule of data.automationRules||[]){const execs=(data.automationExecutions||[]).filter(e=>e.ruleId===rule.id),errors=execs.filter(e=>e.status==='error'||e.error).length,success=Math.max(0,execs.length-errors),score=execs.length?Math.round(100*(success/execs.length)):70;rows.push({id:rule.id,name:rule.name,enabled:rule.enabled!==false,executions:execs.length,success,errors,score,lastExecutedAt:rule.lastExecutedAt||execs[0]?.finishedAt||execs[0]?.createdAt||null,lastError:rule.lastError||execs.find(e=>e.error)?.error||null});}data.automationReputation=rows;return rows;}
function v21DuplicateClusters(){const clients=data.clients||[],clusters=[],used=new Set();const normName=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');for(let i=0;i<clients.length;i++){if(used.has(clients[i].id))continue;const a=clients[i],members=[a],pa=v21Digits(a.phone),ra=v21Digits(a.ruc||a.document),na=normName(a.name);for(let j=i+1;j<clients.length;j++){const b=clients[j],pb=v21Digits(b.phone),rb=v21Digits(b.ruc||b.document),nb=normName(b.name);const samePhone=pa&&pb&&(pa===pb||pa.slice(-9)===pb.slice(-9));const sameDoc=ra&&rb&&ra===rb;const sameName=na.length>5&&nb.length>5&&(na===nb||(na.includes(nb)||nb.includes(na)));if(samePhone||sameDoc||(sameName&&(a.company&&b.company&&normName(a.company)===normName(b.company))))members.push(b);}if(members.length>1){for(const m of members)used.add(m.id);clusters.push({id:`dup_${members.map(m=>m.id).join('_')}`,confidence:sameDuplicateConfidence(members),members:members.map(m=>({id:m.id,name:m.name,phone:m.phone,ruc:m.ruc,company:m.company}))});}}return clusters.slice(0,100);}
function sameDuplicateConfidence(members){let score=70;const phones=new Set(members.map(m=>v21Digits(m.phone)).filter(Boolean)),docs=new Set(members.map(m=>v21Digits(m.ruc||m.document)).filter(Boolean));if(phones.size===1&&phones.size)score+=20;if(docs.size===1&&docs.size)score+=10;return v21Clamp(score,70,99);}
function v21AnomalyScan(){const findings=[];for(const p of data.products||[])if(p.active!==false&&Number(p.available||0)<Number(p.minStock||0))findings.push({type:'stock',severity:Number(p.available||0)<=0?'high':'medium',title:`Stock crítico: ${p.name}`,detail:`Disponible ${Number(p.available||0)} · mínimo ${Number(p.minStock||0)}`,entityId:p.id});for(const d of data.deals||[]){if(OPEN_STAGES.has(d.stage)&&v21AgeDays(d.updatedAt||d.createdAt)>7)findings.push({type:'abandoned',severity:'medium',title:`Gestión olvidada: ${d.name||d.phone}`,detail:`Sin movimiento hace ${Math.round(v21AgeDays(d.updatedAt||d.createdAt))} días.`,entityId:d.id,clientId:d.clientId});const resp=v21ResponseStats(d.messages||[]);if(resp.waitingMinutes>120)findings.push({type:'sla',severity:'high',title:`Cliente esperando: ${d.name||d.phone}`,detail:`Aproximadamente ${resp.waitingMinutes} minutos sin respuesta.`,entityId:d.id,clientId:d.clientId});}for(const line of data.whatsappLines||[]){const status=whatsappLineConnectionState(line.id)?.status;if(line.active!==false&&status&&status!=='connected')findings.push({type:'channel',severity:'high',title:`Línea WhatsApp ${line.name} no conectada`,detail:`Estado actual: ${status}.`,entityId:line.id});}const recent=(data.auditEvents||[]).filter(e=>v21AgeDays(e.at||e.createdAt)<1),counts=new Map();for(const e of recent){const k=e.userId||e.userName||'system';counts.set(k,(counts.get(k)||0)+1);}for(const [k,n] of counts)if(n>250)findings.push({type:'security',severity:'high',title:'Actividad inusualmente alta',detail:`${n} acciones auditadas en 24 horas para ${k}.`,entityId:k});data.aiAnomalies=findings.map((f,i)=>({id:`anom_${Date.now()}_${i}`,...f,status:'open',detectedAt:timestamp()})).slice(0,1000);return data.aiAnomalies;}
function v21Predictions(){const rows=[];for(const client of data.clients||[]){const a=v21UpsertClientAgent(client);rows.push({id:`pred_${client.id}`,clientId:client.id,clientName:a.clientName,churnRisk:a.churnRisk,closeProbability:a.closeProbability,confidence:a.confidence,nextBestAction:a.nextBestAction,nextBestOffer:a.nextBestOffer,generatedAt:a.generatedAt});}data.aiPredictions=rows.slice(0,2000);return rows;}
function v21Health(){const rules=v21AutomationReputation(),activeRules=rules.filter(r=>r.enabled),avgRule=activeRules.length?Math.round(activeRules.reduce((s,r)=>s+r.score,0)/activeRules.length):100;const quality=(data.aiQualityReviews||[]),avgQuality=quality.length?Math.round(quality.reduce((s,q)=>s+Number(q.score||0),0)/quality.length):100;const anomalies=(data.aiAnomalies||[]).filter(a=>a.status!=='resolved'),critical=anomalies.filter(a=>a.severity==='high').length;const channelTotal=(data.whatsappLines||[]).filter(l=>l.active!==false).length,channelOk=(data.whatsappLines||[]).filter(l=>l.active!==false&&whatsappLineConnectionState(l.id)?.status==='connected').length,channelScore=channelTotal?Math.round(100*channelOk/channelTotal):100;const promises=(data.aiPromises||[]).filter(p=>p.status==='pending'),overdue=promises.filter(p=>Date.parse(p.dueAt||0)<Date.now()).length;let overall=Math.round(avgRule*.25+avgQuality*.25+channelScore*.2+Math.max(0,100-critical*12-overdue*4)*.3);return {overall:v21Clamp(overall,0,100),automation:avgRule,quality:avgQuality,channels:channelScore,dataQuality:v21Clamp(100-v21DuplicateClusters().length*5,40,100),criticalAnomalies:critical,overduePromises:overdue};}
function v21AiEvaluator(){const corrections=(data.aiLearningCorrections||[]),rollbacks=(data.auditEvents||[]).filter(e=>String(e.type||e.event||'').includes('rollback')).length,execs=data.automationExecutions||[],errors=execs.filter(e=>e.status==='error'||e.error).length;const acceptance=corrections.length?Math.max(0,100-Math.min(60,corrections.length*3)):100;const reliability=execs.length?Math.round(100*(execs.length-errors)/execs.length):100;return {score:Math.round(acceptance*.35+reliability*.5+Math.max(50,100-rollbacks*5)*.15),humanCorrections:corrections.length,automationReliability:reliability,rollbacks,explanation:'Indicador interno basado en correcciones humanas, ejecuciones de automatizaciones y rollbacks; no representa una certificación externa.'};}
function v21ObserverSuggestions(){const recent=(data.auditEvents||[]).filter(e=>v21AgeDays(e.at||e.createdAt)<14),counts=new Map();for(const e of recent){const type=String(e.type||e.event||'').trim();if(type)counts.set(type,(counts.get(type)||0)+1);}return [...counts.entries()].filter(([,n])=>n>=5).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([type,count])=>({type,count,suggestion:`La acción “${type}” ocurrió ${count} veces en 14 días. Revisá si conviene convertirla en un subflujo o automatización controlada.`}));}
function v21ExecutiveBriefLocal(){const health=v21Health(),pred=(data.aiPredictions||[]),highRisk=pred.filter(p=>p.churnRisk>=70).length,highClose=pred.filter(p=>p.closeProbability>=70).length,open=(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)).length,waiting=(data.deals||[]).filter(d=>v21ResponseStats(d.messages||[]).waitingMinutes>15).length,opps=(data.opportunities||[]).filter(o=>o.status==='new'||o.status==='working').length,anoms=(data.aiAnomalies||[]).filter(a=>a.status!=='resolved');return {generatedAt:timestamp(),health,summary:`Salud del CRM ${health.overall}%. ${open} gestiones abiertas, ${waiting} clientes con espera relevante, ${highRisk} clientes con riesgo alto de abandono y ${opps} oportunidades activas.`,risks:anoms.filter(a=>a.severity==='high').slice(0,5).map(a=>`${a.title}: ${a.detail}`),opportunities:[`${highClose} clientes/negociaciones con probabilidad de cierre estimada >= 70%.`,`${opps} oportunidades registradas para gestión.`],decisions:['Revisar primero anomalías críticas y promesas vencidas.','Priorizar clientes con alto valor/alto riesgo antes de campañas masivas.','Aplicar cambios estructurales mediante simulación, aprobación y rollback.']};}
function v21RunScan({actor=null,persistRun=true}={}){const promises=v21DetectPromises(),quality=v21RefreshQuality(),predictions=v21Predictions(),anomalies=v21AnomalyScan(),reputation=v21AutomationReputation(),health=v21Health(),observer=v21ObserverSuggestions(),run={id:makeId('intelrun'),at:timestamp(),promisesDetected:promises.length,qualityReviewed:quality.length,predictions:predictions.length,anomalies:anomalies.length,health:health.overall,actorName:actor?.name||'Supervisor V21'};if(persistRun){data.intelligenceRuns.unshift(run);data.intelligenceRuns.splice(300);}return {run,health,promises:(data.aiPromises||[]).slice(0,100),quality:(data.aiQualityReviews||[]).slice(0,100),predictions:(data.aiPredictions||[]).sort((a,b)=>b.churnRisk-a.churnRisk).slice(0,100),anomalies:(data.aiAnomalies||[]).slice(0,100),reputation,duplicates:v21DuplicateClusters(),observer,aiEvaluator:v21AiEvaluator()};}
function v21Simulator(question){const q=String(question||'').toLowerCase(),open=(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)).length,waiting=(data.deals||[]).filter(d=>v21ResponseStats(d.messages||[]).waitingMinutes>0).length,agents=(data.users||[]).filter(u=>u.active!==false&&u.role==='agent').length,available=(data.users||[]).filter(u=>u.active!==false&&u.role==='agent'&&isAgentAvailable(u,u.branchId||primaryBranchId())).length;let impact='Bajo',affected=open,summary='Se estimó el impacto sobre la operación actual sin ejecutar cambios.',details=[];if(/duplic|doble|200%|x2/.test(q)){affected=open*2;impact=available?((open*2)/Math.max(1,available)>10?'Alto':'Medio'):'Alto';details.push(`Con el doble de volumen, la carga teórica pasaría de ${open} a ${open*2} gestiones sobre ${Math.max(1,available)} agentes disponibles.`);}if(/falta|ausen|no viene|sin agente/.test(q)){const n=Number(q.match(/\b(\d+)\b/)?.[1]||1),left=Math.max(0,available-n);impact=left===0?'Crítico':(open/Math.max(1,left)>10?'Alto':'Medio');details.push(`Si faltan ${n} agente(s), quedarían aproximadamente ${left} disponibles para ${open} gestiones abiertas.`);}if(/whatsapp|línea|linea/.test(q)&&/(cae|desconect|corta|falla)/.test(q)){const lines=(data.whatsappLines||[]).filter(l=>l.active!==false).length;impact=lines<=1?'Crítico':'Alto';details.push(lines<=1?'No hay una segunda línea activa registrada para contingencia.':`Hay ${lines} líneas activas registradas; conviene definir prioridad y ruta de desvío.`);}if(/sla/.test(q)){const mins=Number(q.match(/(\d+)\s*(?:min|minutos)/)?.[1]||20),wouldBreach=(data.deals||[]).filter(d=>v21ResponseStats(d.messages||[]).waitingMinutes>=mins).length;affected=wouldBreach;impact=wouldBreach>10?'Alto':wouldBreach?'Medio':'Bajo';details.push(`${wouldBreach} gestiones actuales superarían un SLA de ${mins} minutos según la espera registrada.`);}if(!details.length)details.push(`${waiting} gestiones presentan espera y ${agents} agentes activos están configurados.`);return {question:v21Text(question,2000),impact,affected,summary,details,simulatedAt:timestamp(),executed:false};}
function v21GoalPlan(goal){const text=String(goal.goal||goal.name||'').toLowerCase(),health=v21Health(),plan=[];if(/respuesta|sla|minut/.test(text)){plan.push('Medir espera por línea, sucursal y responsable.','Activar advertencia antes del SLA y escalamiento posterior.','Redistribuir carga cuando un agente esté ausente o sobrecargado.');}else if(/recuper|comprar|cliente/.test(text)){plan.push('Segmentar por días sin compra, valor histórico y riesgo.','Priorizar contactos de alto valor con responsable asignado.','Medir reactivación y cancelar seguimientos cuando haya nueva compra.');}else if(/venta|conversion|cierre/.test(text)){plan.push('Priorizar oportunidades con alta intención y datos completos.','Detectar negociaciones estancadas y objeciones repetidas.','Comparar resultado antes/después sin aplicar descuentos automáticos.');}else plan.push('Definir métrica observable y línea base.','Simular cambios de bajo riesgo.','Aplicar cambios solo con aprobación según política y medir impacto.');return {goalId:goal.id,healthBaseline:health.overall,plan,guardrails:['No borrar información automáticamente.','No modificar permisos/stock sin el nivel de confirmación correspondiente.','Respetar límite de autonomía y confianza configurado.'],generatedAt:timestamp()};}
function v21Overview(user){const health=v21Health();return {version:'21.9',health,counts:{clients:(data.clients||[]).length,openDeals:(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)).length,promises:(data.aiPromises||[]).filter(p=>p.status==='pending').length,predictions:(data.aiPredictions||[]).length,anomalies:(data.aiAnomalies||[]).filter(a=>a.status!=='resolved').length,goals:(data.aiGoals||[]).filter(g=>g.status!=='closed').length,experiments:(data.aiExperiments||[]).filter(e=>e.status!=='closed').length},predictions:(data.aiPredictions||[]).sort((a,b)=>b.churnRisk-a.churnRisk).slice(0,30),promises:(data.aiPromises||[]).filter(p=>p.status==='pending').sort((a,b)=>Date.parse(a.dueAt||0)-Date.parse(b.dueAt||0)).slice(0,30),quality:(data.aiQualityReviews||[]).sort((a,b)=>a.score-b.score).slice(0,30),anomalies:(data.aiAnomalies||[]).filter(a=>a.status!=='resolved').slice(0,50),goals:(data.aiGoals||[]).slice(0,30),experiments:(data.aiExperiments||[]).slice(0,30),reputation:v21AutomationReputation().slice(0,50),duplicates:v21DuplicateClusters().slice(0,30),observer:v21ObserverSuggestions(),aiEvaluator:v21AiEvaluator(),templates:V21_TEMPLATE_LIBRARY,settings:{...data.settings.v21Intelligence},lastRun:(data.intelligenceRuns||[])[0]||null,userRole:user?.role||null};}

app.get('/api/v21/overview',(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});response.setHeader('Cache-Control','no-store');response.json(v21Overview(user));});
app.post('/api/v21/scan',requireManagerOrAdmin,async(request,response,next)=>{try{const result=v21RunScan({actor:request.currentUser});recordAuditEvent(request.currentUser,'v21_intelligence_scan',{health:result.health.overall,anomalies:result.anomalies.length},request.currentUser.branchId||primaryBranchId());await store.save();response.json(result);}catch(error){next(error);}});
app.get('/api/v21/client/:id/agent',async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});const client=findClient(data,request.params.id);if(!client)throw new Error('Cliente no encontrado.');if(!v21VisibleClient(user,client))return response.status(403).json({error:'No tenés acceso a este cliente.'});const agent=v21UpsertClientAgent(client);await store.save();response.json({agent,promises:(data.aiPromises||[]).filter(p=>p.clientId===client.id&&p.status==='pending'),quality:(data.aiQualityReviews||[]).filter(q=>q.clientId===client.id).slice(0,10)});}catch(error){next(error);}});
app.post('/api/v21/contradiction-check',async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});const deal=request.body?.dealId?findDeal(data,request.body.dealId):null,text=v21Text(request.body?.text,6000);if(!text)throw new Error('Escribí el mensaje a verificar.');const warnings=[],lower=text.toLowerCase();for(const p of data.products||[]){if(p.active===false||!p.name)continue;if(lower.includes(String(p.name).toLowerCase())&&Number(p.available||0)<=0)warnings.push({severity:'high',type:'stock',message:`El mensaje menciona ${p.name}, pero el stock disponible registrado es 0.`});}if(/garant[ií]a\s+(de\s+)?\d+/.test(lower)&&!(data.aiPolicies||[]).some(p=>/garant/i.test(`${p.name||''} ${p.instructions||''}`)))warnings.push({severity:'medium',type:'policy',message:'Se detectó una promesa de garantía, pero no hay una política de garantía identificable en las políticas IA.'});if(/descuento\s+\d+|\d+\s*%\s+de\s+descuento/.test(lower)&&!(data.aiPolicies||[]).some(p=>/descuento/i.test(`${p.name||''} ${p.instructions||''}`)))warnings.push({severity:'medium',type:'discount',message:'Se menciona un descuento sin una política de descuento identificable. Requiere validación humana.'});if(/mañana|hoy|viernes|lunes|entreg/.test(lower)&&deal?.items?.some(i=>Number(i.quantity||0)>Number((data.products||[]).find(p=>p.id===i.productId)?.available||999999)))warnings.push({severity:'high',type:'delivery',message:'La promesa de entrega puede contradecir el stock reservado/disponible registrado.'});response.json({ok:warnings.length===0,warnings,checkedAt:timestamp()});}catch(error){next(error);}});
app.post('/api/v21/simulate',async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});const question=v21Text(request.body?.question,3000);if(!question)throw new Error('Describí el escenario a simular.');response.json(v21Simulator(question));}catch(error){next(error);}});
app.post('/api/v21/goals',requireManagerOrAdmin,async(request,response,next)=>{try{const input=request.body||{},goalText=v21Text(input.goal||input.name,3000);if(!goalText)throw new Error('Describí el objetivo.');const goal={id:makeId('aigoal'),name:v21Text(input.name||goalText,180),goal:goalText,metric:v21Text(input.metric||'custom',80),target:Number(input.target)||null,status:'active',autonomy:v21Clamp(input.autonomy??data.settings.aiGovernance?.autonomyDefault??3,0,5),createdByUserId:request.currentUser.id,createdByName:request.currentUser.name,createdAt:timestamp(),updatedAt:timestamp(),lastPlan:null,lastResult:null};goal.lastPlan=v21GoalPlan(goal);data.aiGoals.unshift(goal);recordAuditEvent(request.currentUser,'v21_goal_created',{goalId:goal.id,goal:goal.goal,autonomy:goal.autonomy},request.currentUser.branchId||primaryBranchId());await store.save();response.json({goal});}catch(error){next(error);}});
app.post('/api/v21/goals/:id/run',requireManagerOrAdmin,async(request,response,next)=>{try{const goal=(data.aiGoals||[]).find(g=>g.id===request.params.id);if(!goal)throw new Error('Objetivo no encontrado.');goal.lastPlan=v21GoalPlan(goal);goal.lastResult={at:timestamp(),health:v21Health(),recommendations:goal.lastPlan.plan,executedChanges:0,note:'V21 prepara y mide el plan; los cambios estructurales siguen sujetos a poderes por riesgo y aprobación.'};goal.updatedAt=timestamp();await store.save();response.json({goal});}catch(error){next(error);}});
app.post('/api/v21/goals/:id/close',requireManagerOrAdmin,async(request,response,next)=>{try{const goal=(data.aiGoals||[]).find(g=>g.id===request.params.id);if(!goal)throw new Error('Objetivo no encontrado.');goal.status='closed';goal.closedAt=timestamp();goal.updatedAt=timestamp();await store.save();response.json({goal});}catch(error){next(error);}});
app.post('/api/v21/executive-brief',requireManagerOrAdmin,async(request,response,next)=>{try{let brief=v21ExecutiveBriefLocal();if(data.settings.apiKey){try{const out=await requestOpenAiText({instructions:'Sos un analista ejecutivo de CRM. Convertí los datos suministrados en un briefing breve en español con: situación, riesgos, oportunidades y 3 decisiones recomendadas. No inventes cifras.',input:brief,maxOutputTokens:900});brief={...brief,aiText:v21Text(out.text,7000),source:'ai'};}catch(error){brief.warning=v21Text(error.message,500);brief.source='local';}}else brief.source='local';const row={id:makeId('execbrief'),...brief,createdByName:request.currentUser.name};data.executiveBriefs.unshift(row);data.executiveBriefs.splice(100);await store.save();response.json({brief:row});}catch(error){next(error);}});
app.post('/api/v21/experiments',requireAdmin,async(request,response,next)=>{try{const input=request.body||{},name=v21Text(input.name,180),variantA=v21Text(input.variantA,6000),variantB=v21Text(input.variantB,6000);if(!name||!variantA||!variantB)throw new Error('Indicá nombre y las dos variantes.');const exp={id:makeId('aiexp'),name,type:v21Text(input.type||'prompt_ab',80),variantA,variantB,status:'draft',rolloutPercent:v21Clamp(input.rolloutPercent||10,1,100),metrics:{a:{uses:0,success:0},b:{uses:0,success:0}},createdAt:timestamp(),createdByName:request.currentUser.name};data.aiExperiments.unshift(exp);await store.save();response.json({experiment:exp});}catch(error){next(error);}});
app.post('/api/v21/experiments/:id/status',requireAdmin,async(request,response,next)=>{try{const exp=(data.aiExperiments||[]).find(e=>e.id===request.params.id);if(!exp)throw new Error('Experimento no encontrado.');exp.status=['draft','running','paused','closed'].includes(request.body?.status)?request.body.status:exp.status;exp.updatedAt=timestamp();await store.save();response.json({experiment:exp});}catch(error){next(error);}});
app.post('/api/v21/learning-corrections',async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});const correction=v21Text(request.body?.correction,3000),context=v21Text(request.body?.context,3000);if(!correction)throw new Error('Indicá la corrección.');const row={id:makeId('aicorrection'),userId:user.id,userName:user.name,clientId:v21Text(request.body?.clientId,180)||null,dealId:v21Text(request.body?.dealId,180)||null,context,correction,createdAt:timestamp(),appliedAsLearning:data.settings.v21Intelligence?.learningEnabled!==false};data.aiLearningCorrections.unshift(row);data.aiLearningCorrections.splice(1000);await store.save();response.json({correction:row,evaluator:v21AiEvaluator()});}catch(error){next(error);}});
app.get('/api/v21/automation-marketplace',async(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});response.json({templates:V21_TEMPLATE_LIBRARY,reputation:v21AutomationReputation()});});
app.post('/api/v21/automation-marketplace/:key/install',requireAdmin,async(request,response,next)=>{try{const tpl=V21_TEMPLATE_LIBRARY.find(t=>t.key===request.params.key);if(!tpl)throw new Error('Plantilla no encontrada.');const draft={id:makeId('autodraft'),instruction:tpl.instruction,status:'draft',templateKey:tpl.key,templateName:tpl.name,estimatedAffected:(data.deals||[]).filter(d=>OPEN_STAGES.has(d.stage)).length,createdByName:request.currentUser.name,createdAt:timestamp()};data.automationDrafts.unshift(draft);data.automationDrafts.splice(300);recordAuditEvent(request.currentUser,'v21_template_installed',{templateKey:tpl.key,draftId:draft.id},request.currentUser.branchId||primaryBranchId());await store.save();response.json({draft,note:'Se instaló como borrador seguro. Revisalo/simulalo antes de convertirlo en automatización activa.'});}catch(error){next(error);}});
app.get('/api/v21/duplicates',requireManagerOrAdmin,(request,response)=>response.json({clusters:v21DuplicateClusters()}));
app.post('/api/v21/duplicates/merge',requireAdmin,async(request,response,next)=>{try{const ids=Array.isArray(request.body?.clientIds)?request.body.clientIds.filter(Boolean):[],primaryId=v21Text(request.body?.primaryClientId,180);if(ids.length<2||!ids.includes(primaryId))throw new Error('Seleccioná al menos dos clientes e indicá cuál conservar.');const primary=findClient(data,primaryId);if(!primary)throw new Error('Cliente principal no encontrado.');createConfigurationVersion(request.currentUser,`Antes de fusionar duplicados de ${primary.name||primary.phone}`,{clientIds:ids});for(const id of ids){if(id===primaryId)continue;const other=findClient(data,id);if(!other)continue;for(const field of ['name','document','ruc','email','company','city','address','notes'])if(!primary[field]&&other[field])primary[field]=other[field];primary.tags=[...new Set([...(primary.tags||[]),...(other.tags||[])])].slice(0,20);primary.customFields={...(other.customFields||{}),...(primary.customFields||{})};const knownPhones=new Set((primary.phones||[]).map(p=>normalizePhone(p.phone)));for(const phone of other.phones||[]){const key=normalizePhone(phone.phone);if(key&&!knownPhones.has(key)){primary.phones.push({...phone,id:makeId('phone')});knownPhones.add(key);}}const contactKeys=new Set((primary.contactPersons||[]).map(p=>`${cleanText(p.name,140).toLowerCase()}|${(p.phones||[]).map(x=>normalizePhone(x.phone)).sort().join(',')}`));for(const person of other.contactPersons||[]){const key=`${cleanText(person.name,140).toLowerCase()}|${(person.phones||[]).map(x=>normalizePhone(x.phone)).sort().join(',')}`;if(!contactKeys.has(key)){primary.contactPersons.push({...person,id:makeId('contactperson'),phones:(person.phones||[]).map(x=>({...x,id:makeId('phone')}))});contactKeys.add(key);}}for(const relation of other.branchRelationships||[]){if(!(primary.branchRelationships||[]).some(r=>r.branchId===relation.branchId))primary.branchRelationships.push({...relation});}for(const d of data.deals||[])if(d.clientId===id)d.clientId=primaryId;data.clients=data.clients.filter(c=>c.id!==id);}primary.updatedAt=timestamp();recordAuditEvent(request.currentUser,'v21_clients_merged',{primaryClientId:primaryId,mergedIds:ids.filter(id=>id!==primaryId)},request.currentUser.branchId||primaryBranchId());await store.save();response.json({primary,state:stateResponse(request)});}catch(error){next(error);}});
app.post('/api/v21/promises/:id/status',async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});const p=(data.aiPromises||[]).find(x=>x.id===request.params.id);if(!p)throw new Error('Promesa no encontrada.');if(user.role==='agent'&&p.ownerUserId&&p.ownerUserId!==user.id)return response.status(403).json({error:'No tenés acceso a esta promesa.'});p.status=['pending','completed','cancelled'].includes(request.body?.status)?request.body.status:p.status;p.updatedAt=timestamp();p.updatedByName=user.name;await store.save();response.json({promise:p});}catch(error){next(error);}});
app.post('/api/v21/orchestrations',requireAdmin,async(request,response,next)=>{try{const input=request.body||{},name=v21Text(input.name,180),goal=v21Text(input.goal,3000);if(!name||!goal)throw new Error('Indicá nombre y objetivo de la orquestación.');const row={id:makeId('orchestration'),name,goal,channels:Array.isArray(input.channels)?input.channels.map(x=>v21Text(x,40)).filter(Boolean):['whatsapp','task'],steps:Array.isArray(input.steps)?input.steps.map(x=>v21Text(x,600)).filter(Boolean).slice(0,20):[],status:'draft',createdAt:timestamp(),createdByName:request.currentUser.name};data.v21Orchestrations.unshift(row);await store.save();response.json({orchestration:row,note:'Los canales no conectados se mantienen como pasos de tarea/plan y no se ejecutan externamente.'});}catch(error){next(error);}});
app.post('/api/v21/app-designer/preview',requireAdmin,async(request,response,next)=>{try{const instruction=v21Text(request.body?.instruction,3000);if(!instruction)throw new Error('Describí la app o pantalla interna.');const words=instruction.split(/\s+/).filter(Boolean);const name=v21Text(request.body?.name||words.slice(0,6).join(' '),120)||'Módulo interno';const preview={name,description:instruction,fields:[{key:'title',label:'Título',type:'text',required:true},{key:'detail',label:'Detalle',type:'text',required:false},{key:'priority',label:'Prioridad',type:'select',options:['Baja','Normal','Alta'],required:false}],statuses:['Nuevo','En proceso','Finalizado'],risk:'medium',executed:false};response.json({preview,note:'Vista previa con componentes autorizados. Para publicarla, pedíselo a la Super IA Administradora o creá el módulo desde el Centro V20.3.'});}catch(error){next(error);}});
app.post('/api/v21/calls/:id/analyze',async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:'Sesión requerida.'});const call=(data.calls||[]).find(c=>c.id===request.params.id);if(!call)throw new Error('Llamada no encontrada.');const transcript=v21Text(call.transcript||call.text||call.summary,12000);if(!transcript)return response.json({callId:call.id,available:false,note:'La llamada está registrada, pero no hay transcripción/audio procesable. El análisis en tiempo real requiere que el proveedor entregue audio o transcripción al CRM.'});const fakeDeal={id:call.dealId||null,clientId:call.clientId||null,name:call.clientName||call.phone,messages:[{direction:'incoming',text:transcript,at:call.startedAt||call.createdAt||timestamp()}]};const sent=v21Sentiment(fakeDeal.messages);response.json({callId:call.id,available:true,summary:v21Text(transcript,500),sentiment:sent.label,quality:{score:sent.label==='negativo'?70:85,notes:['Análisis realizado sobre la transcripción disponible.']},nextAction:sent.label==='negativo'?'Crear seguimiento de resolución':'Registrar resultado y próximo paso'});}catch(error){next(error);}});
app.post('/api/v21/settings',requireAdmin,async(request,response,next)=>{try{const input=request.body||{},s=data.settings.v21Intelligence||{};if(input.enabled!==undefined)s.enabled=input.enabled!==false;if(input.proactiveScan!==undefined)s.proactiveScan=input.proactiveScan!==false;if(input.observerMode!==undefined)s.observerMode=input.observerMode!==false;if(input.learningEnabled!==undefined)s.learningEnabled=input.learningEnabled!==false;if(input.autoPromiseDetection!==undefined)s.autoPromiseDetection=input.autoPromiseDetection!==false;if(input.qualityReviewEnabled!==undefined)s.qualityReviewEnabled=input.qualityReviewEnabled!==false;if(input.predictionEnabled!==undefined)s.predictionEnabled=input.predictionEnabled!==false;if(input.scanIntervalMinutes!==undefined)s.scanIntervalMinutes=Math.min(1440,Math.max(5,Number(input.scanIntervalMinutes)||15));if(input.maxAutoClientChanges!==undefined)s.maxAutoClientChanges=Math.min(5000,Math.max(0,Number(input.maxAutoClientChanges)||0));if(input.maxAutoRulesPerDay!==undefined)s.maxAutoRulesPerDay=Math.min(100,Math.max(0,Number(input.maxAutoRulesPerDay)||0));if(input.minimumConfidenceForAuto!==undefined)s.minimumConfidenceForAuto=v21Clamp(input.minimumConfidenceForAuto,50,100);if(input.forbidDestructiveActions!==undefined)s.forbidDestructiveActions=input.forbidDestructiveActions!==false;data.settings.v21Intelligence=s;recordAuditEvent(request.currentUser,'v21_settings_changed',s,request.currentUser.branchId||primaryBranchId());await store.save();response.json({settings:s});}catch(error){next(error);}});

if (mockMode) {
  app.post("/api/mock/connected", (request, response) => {
    const requestedLineId=cleanText(request.body?.lineId,160)||null;
    const line=requestedLineId?whatsappLineById(requestedLineId):null;
    const branchId = line?.branchId || cleanText(request.body?.branchId, 120) || primaryBranchId();
    const branch = getBranch(branchId);
    if (!branch) return response.status(404).json({ error: "Sucursal no encontrada." });
    const targetLine=line||defaultWhatsappLine(branchId);
    const account = `+${normalizePhone(request.body?.phone || targetLine?.phone || branch.phone || (branchId === primaryBranchId() ? "595981000000" : "595982000000"))}`;
    if(targetLine && !targetLine.legacyBranchSession){
      const runtime=extraLineRuntime(targetLine.id); runtime.status="connected"; runtime.qr=null; runtime.account=account; runtime.error=null; runtime.lastConnectedAt=timestamp(); targetLine.phone=account; targetLine.updatedAt=timestamp();
    } else if (branchId === primaryBranchId()) { connectionStatus = "connected"; qrDataUrl = null; connectedAccount = account; }
    else { const runtime = extraBranchRuntime(branchId); runtime.status = "connected"; runtime.qr = null; runtime.account = account; runtime.error = null; }
    if(targetLine?.legacyBranchSession) targetLine.phone=account;
    branch.phone = branch.phone || account; branch.updatedAt = timestamp();
    void store.save();
    response.json(stateResponse(request));
  });
  app.post("/api/mock/incoming", async (request, response, next) => {
    try {
      const jid = `${String(request.body?.phone || "595981000000").replace(/\D/g, "")}@s.whatsapp.net`;
      const requestedLine=whatsappLineById(cleanText(request.body?.lineId,160));
      const branchId = requestedLine?.branchId || cleanText(request.body?.branchId, 120) || primaryBranchId();
      const line=requestedLine||defaultWhatsappLine(branchId);
      const incomingText = request.body?.text || "Hola, quiero información";
      const ackId = decodeTransferAck(incomingText);
      const packet = decodeTransferPacket(incomingText);
      const sourceBranch = branchByPhone(phoneFromAnyJid(jid)) || (packet?.sourcePhone ? branchByPhone(packet.sourcePhone) : null) || (packet?.sourceCode ? (data.branches || []).find((branch) => cleanText(branch.code, 40).toUpperCase() === cleanText(packet.sourceCode, 40).toUpperCase()) : null);
      if (sourceBranch || packet || ackId) {
        if (ackId && sourceBranch) processIncomingTransferAck(ackId, jid, sourceBranch);
        else if (packet && sourceBranch) await processIncomingBranchTransfer(packet, jid, makeId("mockbranchincoming"), Date.now(), sourceBranch);
        else if (sourceBranch) addActivity(data, `Mensaje interno recibido desde ${sourceBranch.name}; no se generó una negociación.`, "neutral");
        else addActivity(data, "Paquete interno de prueba ignorado porque el origen no está registrado como sucursal.", "warning");
        await store.save();
        return response.json(stateResponse(request));
      }
      const mockPhone = normalizePhone(request.body?.phone || "595981000000");
      const localClient = findClientIdentity(data, { phone: mockPhone })?.client || null;
      const sharedProfile = !request.body?.name && (!localClient || !localClient.name || normalizePhone(localClient.name) === mockPhone) && sharedDriveConfig().enabled === true
        ? await sharedClientProfileByPhone(mockPhone).catch(() => null)
        : null;
      const isolated = await tryConsumeIsolatedCommunication({ phone: mockPhone, text: incomingText, lineId: line?.id || null, branchId, messageId: makeId("mockisolated") });
      if (isolated.consumed) { await store.save(); return response.json(stateResponse(request)); }
      const result = recordIncoming(data, {
        jid,
        name: request.body?.name || localClient?.name || sharedProfile?.name || "Cliente de prueba",
        text: incomingText,
        messageId: makeId("mockincoming"),
        branchId,
        lineId: line?.id || null,
      });
      if (incomingText) captureIncomingClientData(result.deal,incomingText,{allowAi:true});
      prepareMultiBranchSelection(result.deal, result.created === true);
      if(result.deal.ownerUserId&&line){const owner=data.users.find((u)=>u.id===result.deal.ownerUserId&&u.active!==false);if(owner&&!canUserUseWhatsappLine(owner,line)){result.deal.ownerUserId=null;result.deal.ownerName="";}}
      applyIncomingRouting(result.deal, result.created === true);
      applyMarketingOptOut(result.deal, incomingText);
      markCampaignReply(mockPhone, timestamp());
      addActivity(data, `Mensaje de prueba recibido de ${result.deal.name}${line?` por ${line.name}`:""}.`, "success");
      queueIncomingSuperAutomation({ deal: result.deal, text: incomingText, line, created: result.created === true, message: { text: incomingText, id: "mock" } });
      await store.save();
      if (data.settings.botEnabled && line?.botEnabled !== false && result.deal.botActive && incomingText) await maybeReplyWithBot(result.deal, incomingText);
      response.json(stateResponse(request));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/mock/outgoing", async (request, response, next) => {
    try {
      const deal = findDeal(data, request.body?.dealId);
      if (!deal) throw new Error("Negociación no encontrada.");
      recordHumanOutgoing(data, {
        jid: deal.jid,
        name: deal.name,
        text: request.body?.text || "Hola, ¿cómo podemos ayudarte?",
        messageId: makeId("mockoutgoing"),
      });
      await store.save();
      response.json(stateResponse(request));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/mock/history", async (request, response, next) => {
    try {
      const entries = Array.isArray(request.body?.messages) ? request.body.messages : [];
      await handleIncomingMessages({
        type: "append",
        messages: entries.map((entry, index) => ({
          key: {
            remoteJid: `${String(entry.phone || "595981000000").replace(/\D/g, "")}@s.whatsapp.net`,
            fromMe: Boolean(entry.fromMe),
            id: entry.id || makeId(`mockhistory${index}`),
          },
          pushName: entry.name || "Cliente pendiente",
          messageTimestamp: Math.floor(Number(entry.at || Date.now()) / 1000),
          message: { conversation: entry.text || "Mensaje recibido mientras el equipo estaba apagado" },
        })),
      });
      response.json(stateResponse(request));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/mock/call", async (request, response, next) => {
    try {
      const jid = `${String(request.body?.phone || "595981000000").replace(/\D/g, "")}@s.whatsapp.net`;
      await handleCalls([{
        id: request.body?.id || makeId("mockincomingcall"),
        chatId: jid,
        from: jid,
        status: request.body?.status || "offer",
        isVideo: Boolean(request.body?.isVideo),
        date: new Date(),
      }]);
      response.json(stateResponse(request));
    } catch (error) {
      next(error);
    }
  });
}


// V22.3 · Handoff humano + Copiloto seguro. Centraliza eventos sin acoplar Campañas, Formularios, Negociaciones y demás módulos.
const v22Runtime = installV22Platform({
  app, data, store, currentUser, recordAuditEvent, sendBotMessage, surveyRecipientsFor, createSurveySession, startSurveySession,
  primaryBranchId, getBranch, OPEN_STAGES, findClient, findDeal, stateResponse, verifyPassword, hashPassword, makeId, timestamp, userCanAccessBranch
});

app.use((error, _request, response, _next) => {
  const status = Number(error?.status) || 400;
  response.status(status).json({ error: cleanText(error?.message || "No se pudo completar la acción.", 300) });
});

async function runAutomations() {
  if (automationRunning) return;
  automationRunning = true;
  try {
    await processSuperAutomationTimers();
    for (const action of automationActions(data)) {
      const deal = findDeal(data, action.dealId);
      if (!deal || deal.stage !== STAGES.CONTACTED) continue;
      if (action.type === "followup") {
        if (deal.botHumanHandoff === true || deal.botActive === false) continue;
        if (!mockMode && branchStatus(dealBranchId(deal)) !== "connected") continue;
        try {
          await sendBotMessage(deal, data.settings.followup.message, "followup");
          deal.followupSentAt = timestamp();
          addActivity(data, `Seguimiento automático enviado a ${deal.name}.`);
          await store.save();
        } catch (error) {
          console.error("[automation followup]", error?.message || error);
        }
      }
      if (action.type === "close") {
        const reason =
          data.settings.lossReasons.find(
            (item) => item.name.toLowerCase() === "sin retorno del cliente",
          ) || data.settings.lossReasons[0];
        if (!reason) continue;
        closeLost(data, deal.id, reason.id);
        addActivity(data, `${deal.name} se cerró automáticamente por falta de retorno.`, "warning");
        recordAuditEvent(null, "negociacion_cerrada_automaticamente", { dealId: deal.id, clientPhone: deal.phone, clientName: deal.name, reason: reason.name }, deal.branchId, "system");
        await store.save();
      }
    }
  } finally {
    automationRunning = false;
  }
}

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(`http://${entry.address}:${port}`);
    }
  }
  return [...new Set(addresses)];
}

const server = createServer(app);
server.listen(port, host, () => {
  const browserHost = process.env.WHATSBOT_BROWSER_HOST || (host.startsWith("127.") ? host : "127.0.0.1");
  const localUrl = `http://${browserHost}:${port}`;
  console.log("");
  console.log("  WhatsBot CRM está listo");
  console.log(`  En este equipo: ${localUrl}`);
  if (["0.0.0.0", "::"].includes(host)) {
    const networkUrls = lanAddresses();
    if (networkUrls.length) {
      console.log("  Para otros usuarios de la misma red:");
      for (const networkUrl of networkUrls) console.log(`  - ${networkUrl}`);
    }
  }
  console.log("  Para mantener el bot activo, dejá esta ventana abierta.");
  console.log("");
  openBrowser(localUrl);
  if (!mockMode) {
    if (existsSync(path.join(authDirectory, "creds.json"))) void startConnection();
    for (const branch of data.branches || []) {
      if (branch.id === primaryBranchId() || branch.active === false) continue;
      const branchCreds = path.join(branchAuthRoot, branch.id, "creds.json");
      if (existsSync(branchCreds)) void startExtraBranchConnection(branch.id);
    }
    for (const line of data.whatsappLines || []) {
      if (line.active === false || line.legacyBranchSession || line.provider !== "qr") continue;
      const lineCreds = path.join(lineAuthRoot, line.id, "creds.json");
      if (existsSync(lineCreds)) void startWhatsappLineConnection(line.id);
    }
  }
  // V15: un único servidor atiende a todas las sucursales de la red local.
  restartSharedDriveTimer();
});

const surveyTimer = setInterval(() => void runSurveyAutomation(), 30_000);
surveyTimer.unref?.();
void runSurveyAutomation();
const automationTimer = setInterval(() => void runAutomations(), 10_000);
automationTimer.unref();
const sessionTimer = setInterval(() => {
  for (const [token, session] of sessions) {
    if (!session || session.expiresAt < Date.now()) sessions.delete(token);
  }
}, 60_000);
sessionTimer.unref();

const heartbeatTimer = setInterval(() => {
  const anyConnected = connectionStatus === "connected" || [...branchConnections.values()].some((runtime) => runtime.status === "connected") || [...lineConnections.values()].some((runtime)=>runtime.status === "connected");
  if (!anyConnected) return;
  data.sync.lastActiveAt = timestamp();
  void store.save();
}, 300_000);
heartbeatTimer.unref();

const v21IntelligenceTimer = setInterval(() => {
  const cfg=data.settings.v21Intelligence||{};
  if(cfg.enabled===false||cfg.proactiveScan===false)return;
  const last=Date.parse((data.intelligenceRuns||[])[0]?.at||0);
  const interval=Math.max(5,Number(cfg.scanIntervalMinutes)||15)*60000;
  if(Number.isFinite(last)&&Date.now()-last<interval)return;
  try{v21RunScan({actor:null,persistRun:true});void store.save();}catch(error){console.error('[v21 intelligence]',error?.message||error);}
},60_000);
v21IntelligenceTimer.unref();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  for (const runtime of branchConnections.values()) clearTimeout(runtime.reconnectTimer);
  for (const runtime of lineConnections.values()) clearTimeout(runtime.reconnectTimer);
  clearInterval(surveyTimer);
  clearInterval(automationTimer);
  clearInterval(sessionTimer);
  clearInterval(heartbeatTimer);
  clearInterval(v21IntelligenceTimer);
  v22Runtime?.stop?.();
  if (sharedDriveTimer) clearInterval(sharedDriveTimer);
  if (connectionStatus === "connected") data.sync.lastActiveAt = timestamp();
  await store.save().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1800).unref();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
