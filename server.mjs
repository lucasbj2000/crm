import { spawn } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { access, appendFile, cp, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
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
const maximumMediaBytes = 64 * 1024 * 1024;
const whatsappLogger = pino({ level: "silent" });

const store = new JsonStore(databasePath);
await store.load();
const data = store.data;
const configuredInitialAdminPassword = String(process.env.INITIAL_ADMIN_PASSWORD || "").trim();
const generatedInitialAdminPassword = configuredInitialAdminPassword ? "" : randomBytes(18).toString("base64url");
const initialAdminPassword = configuredInitialAdminPassword || generatedInitialAdminPassword;
const initialAdminPasswordSalt = randomBytes(16).toString("hex");
const initialAdminPasswordHash = `${initialAdminPasswordSalt}:${scryptSync(initialAdminPassword, initialAdminPasswordSalt, 64).toString("hex")}`;

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
let publicFormMigrationChanged=false;
for(const form of data.surveys){
  if(!String(form?.id||"").startsWith("form"))continue;
  if(!form.publicToken){form.publicToken=randomBytes(24).toString("base64url");publicFormMigrationChanged=true;}
  if(typeof form.publicEnabled!=="boolean"){form.publicEnabled=true;publicFormMigrationChanged=true;}
  if(!form.identityFields||typeof form.identityFields!=="object"){form.identityFields={name:true,phone:true,email:false,phoneRequired:false};publicFormMigrationChanged=true;}
}
if(publicFormMigrationChanged)await store.save();
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
if 