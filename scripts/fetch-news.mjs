import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourcesPath = path.join(root, "config", "sources.json");
const dataPath = path.join(root, "public", "data", "news.json");
const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const current = JSON.parse(await readFile(dataPath, "utf8"));

const FINANCE_TERMS = [
  "finance", "financial", "accounting", "account payable", "accounts payable",
  "account receivable", "accounts receivable", "invoice", "treasury", "tax",
  "audit", "financial compliance", "regulatory compliance", "financial risk", "risk management",
  "fraud", "procurement", "purchase-to-pay", "quote-to-cash", "financial close",
  "month-end close", "record-to-report", "closing", "forecast", "budget", "fpa", "fp&a",
  "cfo", "erp", "bank", "banking", "payment", "fintech", "insurance", "wealth",
  "investment", "federal reserve", "central bank", "interest rate", "aml", "kyc", "working capital", "spend management", "financial controller", "controllership",
  "共享", "财务", "金融", "银行", "保险", "支付", "会计", "发票", "关账", "预算", "资金", "税务"
];
const AI_TERMS = [" ai ", "ai-", "ai-powered", "ai-driven", "artificial intelligence", "agent", "agents", "agentic", "copilot", "automation", "llm", "智能体", "人工智能", "自动化"];
const USER_AGENT = "FinPulseAI/1.1 (+daily finance AI intelligence aggregator)";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanText(value = "") {
  return decodeXml(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return cleanText(match[1]);
  }
  return "";
}

function itemLink(block) {
  const direct = tag(block, ["link", "guid"]);
  if (/^https?:\/\//.test(direct)) return direct;
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return atom ? decodeXml(atom[1]) : direct;
}

function parseFeed(xml) {
  const rssItems = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const atomItems = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  return [...rssItems, ...atomItems].map((block) => ({
    title: tag(block, ["title"]),
    url: itemLink(block),
    description: tag(block, ["description", "content:encoded", "content", "summary"]),
    publishedAt: tag(block, ["pubDate", "published", "updated", "dc:date"]),
  })).filter((item) => item.title && item.url);
}

function htmlAttribute(tagText, name) {
  const match = tagText.match(new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"));
  return decodeXml(match?.[1] ?? match?.[2] ?? "");
}

function htmlMeta(html, names) {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  for (const meta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (htmlAttribute(meta, "property") || htmlAttribute(meta, "name")).toLowerCase();
    if (accepted.has(key)) return cleanText(htmlAttribute(meta, "content"));
  }
  return "";
}

function parseHtmlLinks(html, source) {
  const base = new URL(source.url);
  const seen = new Set();
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const href = htmlAttribute(match[1], "href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
    let url;
    try { url = new URL(href, base); } catch { continue; }
    if (url.hostname !== base.hostname) continue;
    if (!(source.includePaths ?? []).some((part) => url.pathname.includes(part))) continue;
    url.hash = "";
    const canonical = url.toString();
    if (canonical === source.url || seen.has(canonical)) continue;
    const title = cleanText(match[2]);
    if (title.length < 10 || title.length > 220) continue;
    seen.add(canonical);
    links.push({ url: canonical, listingTitle: title });
    if (links.length >= (source.maxPages ?? 12)) break;
  }
  return links;
}

function parseEmbeddedArticles(html, source) {
  const scan = html.replace(/\\\"/g, '"').replace(/\\n/g, " ");
  const pattern = /"publishedOn":"([^"]+)","slug":\{[^{}]*"current":"([^"]+)"[^{}]*\},"subjects":\[[\s\S]*?\],"summary":"([^"]*)","title":"([^"]*)"/g;
  const items = [];
  const seen = new Set();
  let match;
  while ((match = pattern.exec(scan))) {
    const slug = match[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    items.push({
      title: cleanText(match[4].replace(/\\u0026/g, "&")),
      url: new URL(`/news/${slug}`, source.url).toString(),
      description: cleanText(match[3].replace(/\\u0026/g, "&")),
      publishedAt: match[1],
    });
  }
  return items;
}

async function fetchHtmlArticle(link, source) {
  const response = await fetch(link.url, {
    headers: { "user-agent": source.browserUserAgent ? BROWSER_USER_AGENT : USER_AGENT, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const html = await response.text();
  const documentTitle = tag(html, ["title"]).replace(/\s*[|–—-]\s*[^|–—-]{2,50}$/, "").trim();
  const title = htmlMeta(html, ["og:title", "twitter:title"]) || documentTitle || link.listingTitle;
  const description = htmlMeta(html, ["description", "og:description", "twitter:description"]);
  const jsonDate = html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)?.[1] ?? "";
  const timeDate = html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] ?? "";
  const publishedAt = htmlMeta(html, ["article:published_time", "date", "datepublished"]) || jsonDate || timeDate;
  return { title: cleanText(title), url: link.url, description: cleanText(description), publishedAt };
}

function termMatches(text, term) {
  const normalized = text.toLowerCase();
  if (/[^\x00-\x7F]/.test(term)) return normalized.includes(term.toLowerCase());
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalized);
}

function includesAny(text, terms) {
  return terms.some((term) => termMatches(text, term));
}

function matchingTerms(text, terms) {
  return terms.filter((term) => termMatches(text, term));
}

function isFinanceAiRelevant(raw, source) {
  const text = `${raw.title} ${raw.description}`;
  if (!includesAny(text, AI_TERMS)) return false;
  const combinedHits = matchingTerms(text, FINANCE_TERMS).length;
  if (source.focus === "finance") return combinedHits >= 1;
  return includesAny(raw.title, FINANCE_TERMS) || combinedHits >= 2;
}

function classify(text) {
  const value = text.toLowerCase();
  if (/(security|governance|compliance|audit|fraud|risk|内控|合规|风险)/.test(value)) return ["风险合规", "风险合规 · AI 治理"];
  if (/(shared service|invoice|payable|purchase-to-pay|procurement|共享|应付|采购)/.test(value)) return ["财务共享", "财务共享 · P2P"];
  if (/(forecast|budget|planning|variance|fpa|fp&a|预算|预测|经营分析)/.test(value)) return ["业财分析", "FP&A · 预算预测"];
  if (/(tool|platform|launch|release|copilot|agent|产品|发布|工具)/.test(value)) return ["AI工具", "财务数字化 · 工具应用"];
  return ["流程升级", "R2R · 财务运营"];
}

function scoreItem(raw, source) {
  const text = `${raw.title} ${raw.description}`;
  const financeHits = matchingTerms(text, FINANCE_TERMS).length;
  const aiHits = matchingTerms(text, AI_TERMS).length;
  const titleFinance = includesAny(raw.title, FINANCE_TERMS);
  const titleAi = includesAny(raw.title, AI_TERMS);
  const base = source.tier === 1 ? 54 : 48;
  const focusBoost = source.focus === "finance" ? 8 : 0;
  return Math.min(96, base + focusBoost + Math.min(20, financeHits * 4) + Math.min(12, aiHits * 3) + (titleFinance ? 8 : 0) + (titleAi ? 5 : 0));
}

function defaultInsight(category) {
  const insights = {
    "AI工具": "先确认它能连接哪些财务数据、能执行哪些动作，以及关键结果是否支持人工复核。",
    "财务共享": "共享中心可重点评估例外率、处理周期、人工接管与跨系统编排成本。",
    "业财分析": "落地前应先统一指标定义、版本口径、责任中心和数据权限。",
    "风险合规": "需要同步检查独立身份、最小权限、审批阈值、可撤销动作与审计日志。",
    "流程升级": "判断价值时应从端到端周期、例外处理和控制有效性出发，而不只是单点效率。"
  };
  return insights[category] ?? insights["流程升级"];
}

function toRecord(raw, source) {
  const text = `${raw.title} ${raw.description}`;
  const [category, processName] = classify(text);
  const score = scoreItem(raw, source);
  const date = new Date(raw.publishedAt || Date.now());
  const summary = raw.description.length > 320 ? `${raw.description.slice(0, 316)}…` : raw.description;
  return {
    id: createHash("sha1").update(raw.url).digest("hex").slice(0, 18),
    title: raw.title,
    summary: summary || "该信源发布了新的财务 AI 动态，建议打开原文核验具体能力、适用范围与上线状态。",
    insight: defaultInsight(category),
    source: source.name,
    url: raw.url,
    publishedAt: Number.isNaN(date.valueOf()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10),
    category,
    process: processName,
    score,
    selected: score >= 70,
    kind: /(tool|platform|launch|release|agent|copilot|产品|工具)/i.test(text) ? "tool" : "news",
    keywords: [...new Set(matchingTerms(text, FINANCE_TERMS).slice(0, 5))],
    readTime: Math.max(2, Math.min(8, Math.round(text.length / 700))),
    pipelineVersion: 2,
  };
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { "user-agent": source.browserUserAgent ? BROWSER_USER_AGENT : USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const body = await response.text();
  let candidates;
  if (source.type === "html") {
    if (source.embeddedJson) {
      candidates = parseEmbeddedArticles(body, source);
    } else {
      const links = parseHtmlLinks(body, source);
      const articleResults = await Promise.allSettled(links.map((link) => fetchHtmlArticle(link, source)));
      candidates = articleResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    }
  } else {
    candidates = parseFeed(body);
  }
  const lookbackDays = source.lookbackDays ?? 14;
  return candidates
    .filter((item) => {
      const published = new Date(item.publishedAt || 0);
      return Number.isNaN(published.valueOf()) || published.valueOf() >= Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    })
    .filter((item) => isFinanceAiRelevant(item, source))
    .map((item) => toRecord(item, source));
}

async function enrichWithCompatibleLLM(items) {
  const endpoint = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!endpoint || !apiKey || items.length === 0) return items;
  const prompt = [
    "你是企业财务数字化研究员。请为输入中的每条资讯输出简洁中文标题、120字内摘要、80字内财务视角。",
    "不得编造，保留 id。只返回 JSON 数组，字段为 id/title/summary/insight。",
    JSON.stringify(items.map(({ id, title, summary, source, url }) => ({ id, title, summary, source, url })))
  ].join("\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return items;
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  const byId = new Map(parsed.map((item) => [item.id, item]));
  return items.map((item) => ({ ...item, ...(byId.get(item.id) ?? {}) }));
}

const results = await Promise.allSettled(sources.map(fetchSource));
const fresh = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
const errors = results
  .map((result, index) => result.status === "rejected" ? `${sources[index].name}: ${result.reason?.message ?? result.reason}` : null)
  .filter(Boolean);
const sourceStats = results.map((result, index) => ({
  name: sources[index].name,
  type: sources[index].type === "html" ? "website" : "feed",
  status: result.status === "fulfilled" ? "ok" : "error",
  matched: result.status === "fulfilled" ? result.value.length : 0,
}));

let enriched = fresh.slice(0, 20);
try {
  enriched = await enrichWithCompatibleLLM(fresh.slice(0, 20));
} catch (error) {
  console.warn(`LLM enrichment skipped: ${error.message}`);
}
const finalizedFresh = [...enriched, ...fresh.slice(20)].map((item) => ({
  ...item,
  selected: item.score >= 70,
}));

const merged = new Map(current.items.map((item) => [item.url, item]));
for (const item of finalizedFresh) merged.set(item.url, item);
const sourceByName = new Map(sources.map((source) => [source.name, source]));
const items = [...merged.values()]
  .map((item) => {
    const source = sourceByName.get(item.source) ?? { tier: 1 };
    const validatedKeywords = item.pipelineVersion === 2 ? ` ${(item.keywords ?? []).join(" ")}` : "";
    const raw = { title: item.title, description: `${item.summary}${validatedKeywords}` };
    const score = scoreItem(raw, source);
    return { ...item, score, selected: score >= 70, _relevant: isFinanceAiRelevant(raw, source) };
  })
  .filter((item) => item._relevant)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.score - a.score)
  .map(({ _relevant, ...item }) => item)
  .slice(0, 160);

function rebuildTrends(allItems) {
  const recent = allItems.filter((item) => new Date(`${item.publishedAt}T00:00:00Z`).valueOf() >= Date.now() - 30 * 24 * 60 * 60 * 1000);
  const definitions = [
    { label: "财务智能体", note: "从助手走向流程执行", pattern: /agent|agentic|智能体/i },
    { label: "P2P 自动化", note: "例外处理成为主战场", pattern: /payable|invoice|procurement|purchase-to-pay|p2p|应付|发票|采购/i },
    { label: "智能 FP&A", note: "解释偏差比预测更重要", pattern: /forecast|budget|planning|variance|fp&a|fpa|预测|预算/i },
    { label: "AI 治理", note: "权限与审计要求上升", pattern: /governance|security|compliance|audit|fraud|risk|治理|合规|审计|风险/i },
    { label: "金融 AI", note: "银行、支付与风控加速落地", pattern: /bank|banking|payment|fintech|insurance|wealth|aml|kyc|银行|支付|金融|保险/i },
  ];
  const counts = definitions.map((definition) => recent.filter((item) => definition.pattern.test(`${item.title} ${item.summary} ${item.process}`)).length);
  const max = Math.max(1, ...counts);
  return definitions.map((definition, index) => ({
    label: definition.label,
    note: definition.note,
    heat: Math.round(38 + (counts[index] / max) * 57),
  }));
}

function buildDailyBrief(allItems, matchedCount, healthyCount) {
  const recent = allItems
    .filter((item) => new Date(`${item.publishedAt}T00:00:00Z`).valueOf() >= Date.now() - 14 * 24 * 60 * 60 * 1000)
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt));
  const categoryCounts = new Map();
  for (const item of recent) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  const focus = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category]) => category);
  const lead = recent[0];
  if (!lead) return `本轮已有 ${healthyCount} 个信源正常完成采集，暂未发现新的高相关财务 AI 信号。`;
  return `本轮从 ${healthyCount} 个正常信源中匹配 ${matchedCount} 条财务与金融 AI 信号，重点集中在${focus.join("、")}。当前最值得继续追踪的是《${lead.title}》。`;
}

const now = new Date();
const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const issue = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now).replaceAll("-", "");

current.meta.lastUpdated = `${formatter.format(now).replaceAll("/", "-")} CST`;
current.meta.sourceCount = sources.length;
current.meta.sourceOk = results.filter((result) => result.status === "fulfilled").length;
current.meta.websiteSourceCount = sources.filter((source) => source.type === "html").length;
current.meta.sourceStats = sourceStats;
current.meta.todaySignals = fresh.length;
current.meta.actionable = items.filter((item) => item.selected).length;
current.meta.issue = issue;
current.meta.dailyBrief = buildDailyBrief(items, fresh.length, current.meta.sourceOk);
current.trends = rebuildTrends(items);
current.items = items;

await writeFile(dataPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
console.log(`FinPulse refresh complete: ${fresh.length} matched, ${items.length} total.`);
console.log(`Source results: ${sourceStats.map((source) => `${source.name}=${source.matched}`).join(", ")}`);
if (errors.length) console.warn(`Unavailable feeds (${errors.length}):\n- ${errors.join("\n- ")}`);
