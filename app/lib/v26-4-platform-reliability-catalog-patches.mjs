function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.4: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.4: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, start, end, replacement, label) {
  const first = source.indexOf(start);
  if (first < 0) throw new Error(`V26.4: no se encontró inicio de ${label}.`);
  const next = source.indexOf(end, first + start.length);
  if (next < 0) throw new Error(`V26.4: no se encontró final de ${label}.`);
  return source.slice(0, first) + replacement + "\n" + source.slice(next);
}

const helpers = String.raw`
function v264CatalogSources() {
  if (!data.settings || typeof data.settings !== "object") data.settings = {};
  if (!Array.isArray(data.settings.externalCatalogs)) data.settings.externalCatalogs = [];
  return data.settings.externalCatalogs;
}

function v264Normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

function v264CatalogTerms(query) {
  return [...new Set(v264Normalize(query).split(/[^a-z0-9]+/).filter((term) => term.length >= 2))].slice(0, 12);
}

function v264PublicSource(source) {
  return {
    id: source.id,
    name: source.name,
    catalogUrl: source.catalogUrl,
    searchUrlTemplate: source.searchUrlTemplate || "",
    active: source.active !== false,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
  };
}

function v264UrlSyntax(value, { searchTemplate = false } = {}) {
  const raw = cleanText(value, 1600);
  if (!raw) throw new Error("Ingresá una URL de catálogo válida.");
  if (searchTemplate && !raw.includes("{query}")) throw new Error("La URL de búsqueda debe incluir {query} donde va el producto.");
  const check = searchTemplate ? raw.replaceAll("{query}", "producto") : raw;
  let url;
  try { url = new URL(check); } catch { throw new Error("La URL del catálogo no es válida."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("El catálogo debe usar http:// o https://.");
  if (url.username || url.password) throw new Error("No se permiten credenciales dentro de la URL del catálogo.");
  const host = url.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(host) || host.endsWith(".local")) throw new Error("La URL del catálogo debe ser pública.");
  return raw;
}

function v264PrivateIp(address) {
  const ip = String(address || "").toLowerCase();
  if (!ip) return true;
  if (ip.includes(":")) {
    if (ip === "::1" || ip === "::") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(ip)) return true;
    if (ip.startsWith("::ffff:")) return v264PrivateIp(ip.slice(7));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] >= 224) return true;
  return false;
}

async function v264AssertPublicCatalogUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(host) || host.endsWith(".local")) throw new Error("La URL del catálogo no puede apuntar a una red privada.");
  const literal = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (literal && v264PrivateIp(host.replace(/^\[|\]$/g, ""))) throw new Error("La URL del catálogo no puede apuntar a una red privada.");
  if (!literal) {
    const addresses = await dnsLookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => v264PrivateIp(entry.address))) throw new Error("El dominio del catálogo resuelve a una red privada o no válida.");
  }
  return url;
}

async function v264FetchCatalogPage(initialUrl) {
  let current = initialUrl;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    await v264AssertPublicCatalogUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CRM-Catalog-Reader/1.0)",
        accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("El catálogo redirigió sin indicar destino.");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error("El catálogo respondió HTTP " + response.status + ".");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 2 * 1024 * 1024) throw new Error("La página del catálogo supera el límite de lectura de 2 MB.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 2 * 1024 * 1024) throw new Error("La página del catálogo supera el límite de lectura de 2 MB.");
    return { url: current, contentType: response.headers.get("content-type") || "", text: buffer.toString("utf8") };
  }
  throw new Error("El catálogo realizó demasiadas redirecciones.");
}

function v264DecodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code) || 32));
}

function v264PlainText(html) {
  return cleanText(v264DecodeHtml(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")), 300000);
}

function v264Price(raw, currency = "") {
  const text = cleanText(raw, 120);
  if (!text) return { price: null, priceText: "", currency: cleanText(currency, 12) };
  const only = text.replace(/[^0-9.,]/g, "");
  if (!only) return { price: null, priceText: text, currency: cleanText(currency, 12) };
  let normalized = only;
  if (normalized.includes(".") && normalized.includes(",")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else normalized = normalized.replace(/,/g, "");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, "");
  else if (/^\d{1,3}(?:,\d{3})+$/.test(normalized)) normalized = normalized.replace(/,/g, "");
  else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
  const number = Number(normalized);
  return { price: Number.isFinite(number) ? number : null, priceText: text, currency: cleanText(currency, 12) };
}

function v264ProductScore(product, terms) {
  if (!terms.length) return 1;
  const name = v264Normalize(product.name);
  const sku = v264Normalize(product.sku);
  const description = v264Normalize(product.description);
  let score = 0;
  for (const term of terms) {
    if (sku && sku.includes(term)) score += 9;
    if (name.includes(term)) score += 6;
    if (description.includes(term)) score += 2;
  }
  if (terms.every((term) => (name + " " + sku + " " + description).includes(term))) score += 8;
  return score;
}

function v264JsonLdProducts(html, pageUrl, source) {
  const products = [];
  const scripts = String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { for (const entry of node) visit(entry); return; }
    if (typeof node !== "object") return;
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    if (types.some((type) => String(type || "").toLowerCase() === "product")) {
      const offers = Array.isArray(node.offers) ? node.offers[0] : (node.offers || {});
      const priceData = v264Price(offers.price ?? offers.lowPrice ?? "", offers.priceCurrency || "");
      let url = cleanText(node.url || offers.url || pageUrl, 1600);
      try { url = new URL(url || pageUrl, pageUrl).toString(); } catch { url = pageUrl; }
      products.push({
        name: cleanText(node.name || "Producto", 220),
        sku: cleanText(node.sku || node.mpn || node.productID || "", 120),
        description: cleanText(v264PlainText(node.description || ""), 900),
        price: priceData.price,
        priceText: priceData.priceText,
        currency: priceData.currency,
        url,
        sourceId: source.id,
        sourceName: source.name,
        availabilityConfirmed: false,
        external: true,
      });
    }
    for (const value of Object.values(node)) if (value && typeof value === "object") visit(value);
  };
  for (const match of scripts) {
    try { visit(JSON.parse(v264DecodeHtml(match[1]))); } catch {}
  }
  return products;
}

function v264AnchorProducts(html, pageUrl, source, terms) {
  const results = [];
  const raw = String(html || "");
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(raw)) && results.length < 40) {
    const name = cleanText(v264PlainText(match[2]), 220);
    if (name.length < 2) continue;
    const normalized = v264Normalize(name);
    if (terms.length && !terms.some((term) => normalized.includes(term))) continue;
    let url;
    try { url = new URL(match[1], pageUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(url)) continue;
    const nearby = v264PlainText(raw.slice(Math.max(0, match.index - 180), Math.min(raw.length, regex.lastIndex + 320)));
    const priceMatch = nearby.match(/(?:Gs\.?|PYG|₲|USD|US\$|\$)\s*[0-9][0-9.,]*/i);
    const priceData = v264Price(priceMatch?.[0] || "", /USD|US\$|\$/i.test(priceMatch?.[0] || "") ? "USD" : (/Gs|PYG|₲/i.test(priceMatch?.[0] || "") ? "PYG" : ""));
    results.push({ name, sku: "", description: cleanText(nearby, 500), price: priceData.price, priceText: priceData.priceText, currency: priceData.currency, url, sourceId: source.id, sourceName: source.name, availabilityConfirmed: false, external: true });
  }
  return results;
}

function v264PageFallback(html, pageUrl, source, query, terms) {
  const text = v264PlainText(html);
  const normalized = v264Normalize(text);
  if (!terms.length || !terms.some((term) => normalized.includes(term))) return [];
  let position = -1;
  for (const term of terms) { position = normalized.indexOf(term); if (position >= 0) break; }
  const start = Math.max(0, position - 180);
  const snippet = cleanText(text.slice(start, start + 700), 650);
  const priceMatch = snippet.match(/(?:Gs\.?|PYG|₲|USD|US\$|\$)\s*[0-9][0-9.,]*/i);
  const priceData = v264Price(priceMatch?.[0] || "", /USD|US\$|\$/i.test(priceMatch?.[0] || "") ? "USD" : (/Gs|PYG|₲/i.test(priceMatch?.[0] || "") ? "PYG" : ""));
  return [{ name: cleanText(query, 220) || "Resultado de catálogo", sku: "", description: snippet, price: priceData.price, priceText: priceData.priceText, currency: priceData.currency, url: pageUrl, sourceId: source.id, sourceName: source.name, availabilityConfirmed: false, external: true }];
}

function v264SearchUrl(source, query) {
  if (source.searchUrlTemplate) return source.searchUrlTemplate.replaceAll("{query}", encodeURIComponent(query));
  return source.catalogUrl;
}

async function v264SearchOneCatalog(source, query, terms) {
  const target = v264SearchUrl(source, query);
  const page = await v264FetchCatalogPage(target);
  let products = [];
  if (/json/i.test(page.contentType)) {
    try {
      const parsed = JSON.parse(page.text);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.products) ? parsed.products : (Array.isArray(parsed.items) ? parsed.items : []));
      products = list.slice(0, 80).map((item) => {
        const priceData = v264Price(item.price ?? item.precio ?? "", item.currency || item.moneda || "");
        let url = cleanText(item.url || item.link || page.url, 1600);
        try { url = new URL(url, page.url).toString(); } catch { url = page.url; }
        return { name: cleanText(item.name || item.nombre || item.title || "Producto", 220), sku: cleanText(item.sku || item.codigo || item.code || "", 120), description: cleanText(item.description || item.descripcion || "", 900), price: priceData.price, priceText: priceData.priceText, currency: priceData.currency, url, sourceId: source.id, sourceName: source.name, availabilityConfirmed: false, external: true };
      });
    } catch {}
  } else {
    products = v264JsonLdProducts(page.text, page.url, source);
    products.push(...v264AnchorProducts(page.text, page.url, source, terms));
    if (!products.length) products.push(...v264PageFallback(page.text, page.url, source, query, terms));
  }
  return products.map((product) => ({ ...product, score: v264ProductScore(product, terms) })).filter((product) => product.score > 0);
}

async function v264SearchExternalCatalog(query, { limit = 8 } = {}) {
  const cleanQuery = cleanText(query, 220);
  if (cleanQuery.length < 2) return { query: cleanQuery, results: [], errors: [] };
  const terms = v264CatalogTerms(cleanQuery);
  const sources = v264CatalogSources().filter((source) => source.active !== false).slice(0, 6);
  if (!sources.length) return { query: cleanQuery, results: [], errors: [] };
  const settled = await Promise.allSettled(sources.map((source) => v264SearchOneCatalog(source, cleanQuery, terms)));
  const results = [];
  const errors = [];
  settled.forEach((entry, index) => {
    const source = sources[index];
    if (entry.status === "fulfilled") results.push(...entry.value);
    else errors.push({ sourceId: source.id, sourceName: source.name, error: cleanText(entry.reason?.message || entry.reason || "No se pudo consultar.", 400) });
  });
  const unique = new Map();
  for (const result of results.sort((a, b) => Number(b.score || 0) - Number(a.score || 0))) {
    const key = v264Normalize((result.url || "") + "|" + (result.sku || "") + "|" + (result.name || ""));
    if (!key || unique.has(key)) continue;
    unique.set(key, result);
    if (unique.size >= Math.max(1, Math.min(20, Number(limit) || 8))) break;
  }
  return { query: cleanQuery, results: [...unique.values()], errors };
}

function v264SanitizeCatalogSource(input = {}, current = null) {
  const source = {
    ...(current || {}),
    name: Object.prototype.hasOwnProperty.call(input, "name") ? cleanText(input.name, 160) : cleanText(current?.name, 160),
    catalogUrl: Object.prototype.hasOwnProperty.call(input, "catalogUrl") ? v264UrlSyntax(input.catalogUrl) : current?.catalogUrl,
    searchUrlTemplate: Object.prototype.hasOwnProperty.call(input, "searchUrlTemplate") ? (cleanText(input.searchUrlTemplate, 1600) ? v264UrlSyntax(input.searchUrlTemplate, { searchTemplate: true }) : "") : (current?.searchUrlTemplate || ""),
    active: Object.prototype.hasOwnProperty.call(input, "active") ? input.active !== false : current?.active !== false,
  };
  if (!source.name) throw new Error("Ingresá un nombre para el catálogo.");
  if (!source.catalogUrl) throw new Error("Ingresá el enlace principal del catálogo.");
  source.updatedAt = timestamp();
  return source;
}

function v264CatalogPriceLabel(result) {
  if (result.priceText) return result.priceText;
  if (!Number.isFinite(Number(result.price))) return "sin precio publicado";
  const currency = result.currency || "PYG";
  try { return new Intl.NumberFormat("es-PY", { style: "currency", currency, maximumFractionDigits: currency === "PYG" ? 0 : 2 }).format(Number(result.price)); }
  catch { return String(result.price); }
}
`;

const catalogRoutes = String.raw`
app.get("/api/catalog-sources", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  response.setHeader("Cache-Control", "no-store");
  response.json({ sources: v264CatalogSources().map(v264PublicSource) });
});

app.post("/api/catalog-sources", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const source = v264SanitizeCatalogSource(request.body || {});
    source.id = makeId("catalog");
    source.createdAt = timestamp();
    v264CatalogSources().push(source);
    recordAuditEvent(request.currentUser || currentUser(request), "catalogo_externo_creado", { catalogId: source.id, name: source.name, catalogUrl: source.catalogUrl }, request.currentUser?.branchId || primaryBranchId());
    await store.save();
    response.status(201).json({ source: v264PublicSource(source), sources: v264CatalogSources().map(v264PublicSource) });
  } catch (error) { next(error); }
});

app.put("/api/catalog-sources/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const source = v264CatalogSources().find((entry) => entry.id === request.params.id);
    if (!source) return response.status(404).json({ error: "Catálogo no encontrado." });
    Object.assign(source, v264SanitizeCatalogSource(request.body || {}, source));
    recordAuditEvent(request.currentUser || currentUser(request), "catalogo_externo_actualizado", { catalogId: source.id, name: source.name }, request.currentUser?.branchId || primaryBranchId());
    await store.save();
    response.json({ source: v264PublicSource(source), sources: v264CatalogSources().map(v264PublicSource) });
  } catch (error) { next(error); }
});

app.delete("/api/catalog-sources/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const index = v264CatalogSources().findIndex((entry) => entry.id === request.params.id);
    if (index < 0) return response.status(404).json({ error: "Catálogo no encontrado." });
    const [source] = v264CatalogSources().splice(index, 1);
    recordAuditEvent(request.currentUser || currentUser(request), "catalogo_externo_eliminado", { catalogId: source.id, name: source.name }, request.currentUser?.branchId || primaryBranchId());
    await store.save();
    response.json({ ok: true, sources: v264CatalogSources().map(v264PublicSource) });
  } catch (error) { next(error); }
});

app.post("/api/catalog-search", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const query = cleanText(request.body?.query, 220);
    if (query.length < 2) return response.status(400).json({ error: "Escribí al menos dos caracteres para buscar." });
    const local = findProductByQuery(data, query).filter((product) => product.active !== false).slice(0, 8).map((product) => ({ id: product.id, name: product.name, sku: product.sku, description: product.description || "", price: product.price || null, available: Number(product.available || 0), reserved: Number(product.reserved || 0), source: "stock_interno", availabilityConfirmed: true }));
    if (local.length && request.body?.forceExternal !== true) return response.json({ query, local, external: [], errors: [], fallbackUsed: false });
    const external = await v264SearchExternalCatalog(query, { limit: 10 });
    response.setHeader("Cache-Control", "no-store");
    response.json({ query, local, external: external.results, errors: external.errors, fallbackUsed: local.length === 0, availabilityNote: "Los datos del catálogo sirven como referencia comercial. La disponibilidad se confirma únicamente con el stock interno o por un agente." });
  } catch (error) { next(error); }
});
`;

const stockToolRoute = String.raw`  if (toolCall.function?.name === "consultar_stock") {
    const matches = findProductByQuery(data, args.consulta).map((product) => ({
      id: product.id,
      codigo: product.sku,
      producto: product.name,
      disponible: product.available,
      precio: product.price || null,
      origen: "stock_interno",
      disponibilidadConfirmada: true,
    }));
    if (matches.length) return { ok: true, resultados: matches, origen: "stock_interno", disponibilidadConfirmada: true };
    const external = await v264SearchExternalCatalog(cleanText(args.consulta, 220), { limit: 5 });
    return {
      ok: true,
      resultados: [],
      origen: external.results.length ? "catalogo_externo" : "sin_resultados",
      referenciasCatalogo: external.results.map((item) => ({ producto: item.name, codigo: item.sku || null, descripcion: item.description || "", precio: item.price ?? null, precioPublicado: item.priceText || "", moneda: item.currency || "", url: item.url, fuente: item.sourceName, disponibilidadConfirmada: false })),
      erroresCatalogo: external.errors,
      disponibilidadConfirmada: false,
      instruccion: "Si usás una referencia de catálogo externo, podés informar precio, descripción y enlace publicados, pero NO afirmes disponibilidad. Indicá que un agente debe confirmar existencia antes de reservar o vender.",
    };
  }
`;

const copilotReplacement = String.raw`async function createCopilotSuggestion(deal) {
  const fallback = fallbackCopilotSuggestion(deal);
  const latestIncoming = [...(deal.messages || [])].reverse().find((message) => message.direction === "incoming");
  const text = cleanText(latestIncoming?.text || "", 4000);
  if (/(stock|disponib|ten[eé]s|tienen|hay\s|precio|cu[aá]nto|producto|modelo)/i.test(text) && !findProductByQuery(data, text).length) {
    try {
      const external = await v264SearchExternalCatalog(text, { limit: 4 });
      if (external.results.length) {
        const rows = external.results.map((item) => item.name + (item.sku ? " (" + item.sku + ")" : "") + " · " + v264CatalogPriceLabel(item) + " · " + item.sourceName).join("\n");
        return {
          reply: "Encontré referencias en el catálogo externo:\n" + rows + "\n\nEstos datos sirven para precio y descripción publicados. La disponibilidad todavía debe confirmarse en stock o con un agente antes de ofrecer o reservar.",
          reason: "El producto no estaba cargado en el stock interno y se consultaron los catálogos externos configurados para esta empresa.",
          documentIds: [],
          source: "catalog",
          catalogResults: external.results,
        };
      }
    } catch (error) {
      console.warn("[catalog copilot]", error?.message || error);
    }
  }
  return requestCopilotAi(deal, fallback);
}
`;

const healthReplacement = String.raw`app.get("/api/health", async (_request, response) => {
  try {
    await mkdir(authDirectory, { recursive: true });
    const probe = path.join(authDirectory, ".qr-write-test-" + randomUUID());
    await writeFile(probe, "ok", { mode: 0o600 });
    await unlink(probe).catch(() => {});
    response.json({ ok: true, mockMode, qrEngine: { ready: true, mode: data.settings.whatsappMode === "cloud" ? "cloud" : "qr", tenant: tenantSlug } });
  } catch (error) {
    response.status(503).json({ ok: false, mockMode, qrEngine: { ready: false, tenant: tenantSlug, error: cleanText(error?.message || error, 300) } });
  }
});`;

export function applyV264PlatformReliabilityCatalogPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'import { networkInterfaces } from "node:os";',
    'import { networkInterfaces } from "node:os";\nimport { lookup as dnsLookup } from "node:dns/promises";',
    "import DNS para catálogos seguros",
  );

  patched = replaceOnce(
    patched,
    "const app = express();",
    helpers + "\nconst app = express();",
    "helpers de catálogos externos",
  );

  patched = replaceBetween(
    patched,
    'app.get("/api/health",',
    'app.get("/api/auth/status",',
    healthReplacement,
    "health con preflight QR",
  );

  patched = replaceOnce(
    patched,
    'app.post("/api/products/import-csv",',
    catalogRoutes + '\napp.post("/api/products/import-csv",',
    "rutas de catálogo junto a stock",
  );

  patched = replaceBetween(
    patched,
    '  if (toolCall.function?.name === "consultar_stock") {',
    '  if (toolCall.function?.name === "reservar_stock") {',
    stockToolRoute,
    "fallback de catálogo para herramienta de stock",
  );

  patched = replaceBetween(
    patched,
    "async function createCopilotSuggestion(deal) {",
    "function hasExplicitConfirmation(message, evidence) {",
    copilotReplacement,
    "copiloto con catálogo externo",
  );

  return patched;
}
