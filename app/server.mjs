import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyV24ServerPatches } from "./lib/v24-server-patches.mjs";
import { applyV24CloudPatches } from "./lib/v24-cloud-patches.mjs";
import { applyV241ServerPatches } from "./lib/v24-1-server-patches.mjs";
import { applyV254ServerPatches } from "./lib/v25-4-server-patches.mjs";
import { applyV257FormPatches } from "./lib/v25-7-form-patches.mjs";
import { applyV256SecurityPatches } from "./lib/v25-6-security-patches.mjs";
import { applyV258ReportAiPatches } from "./lib/v25-8-report-ai-patches.mjs";
import { applyV259SupportPatches } from "./lib/v25-9-support-patches.mjs";
import { applyV2510SocialPatches } from "./lib/v25-10-social-patches.mjs";
import { applyV2511OmnichannelPatches } from "./lib/v25-11-omnichannel-patches.mjs";
import { applyV2512SocialPlatformPatches } from "./lib/v25-12-social-platform-patches.mjs";
import { applyV262WhatsappPatches } from "./lib/v26-2-whatsapp-patches.mjs";
import { applyV263QrRecoveryPatches } from "./lib/v26-3-qr-recovery-patches.mjs";
import { applyV264PlatformReliabilityCatalogPatches } from "./lib/v26-4-platform-reliability-catalog-patches.mjs";
import { applyV265MediaReliabilityPatches } from "./lib/v26-5-media-reliability-patches.mjs";
import { applyV266MediaRetryPatches } from "./lib/v26-6-media-retry-patches.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(appDir, "server-core.mjs");
const generatedPath = path.join(appDir, ".server-v24.generated.mjs");

function restoreGeneratedTemplates(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`No se pudo normalizar el bloque V24: ${startMarker}`);
  const block = source.slice(start, end).replaceAll("\\`", "`").replaceAll("\\${", "${");
  return source.slice(0, start) + block + source.slice(end);
}

const source = await readFile(corePath, "utf8");
let patched = applyV24ServerPatches(source);
patched = applyV24CloudPatches(patched);
patched = applyV241ServerPatches(patched);
patched = applyV254ServerPatches(patched);
patched = restoreGeneratedTemplates(patched, "async function v24TranscribeMediaAttachment", "async function maybeReplyWithBot");
patched = restoreGeneratedTemplates(patched, "function v24ActiveObserverGrant", "app.post(\"/api/deals/:id/transfer\"");
patched = applyV257FormPatches(patched);
patched = applyV256SecurityPatches(patched);
patched = applyV258ReportAiPatches(patched);
patched = applyV259SupportPatches(patched);
patched = applyV2510SocialPatches(patched);
patched = applyV2511OmnichannelPatches(patched);
patched = applyV2512SocialPlatformPatches(patched);
patched = applyV262WhatsappPatches(patched);
patched = applyV263QrRecoveryPatches(patched);
patched = applyV264PlatformReliabilityCatalogPatches(patched);
patched = applyV265MediaReliabilityPatches(patched);
patched = applyV266MediaRetryPatches(patched);
await writeFile(generatedPath, patched, "utf8");
await import(`${pathToFileURL(generatedPath).href}?v24=${Date.now()}`);
