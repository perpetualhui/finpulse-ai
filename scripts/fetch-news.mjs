import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
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
  "共享", "财务", "金融", "银行", "保险", "支付", "会计", "发票", "关账", "预算", "资金", "税务",
  "业绩", "财报", "季度业绩", "年度报告", "投资者", "收入", "利润", "现金流", "费用", "营收", "回购",
  "A股", "港股", "中概股", "美股", "证券", "券商", "基金", "ETF", "债券", "融资", "上市", "分红",
  "人民币", "汇率", "利率", "资本市场", "私募", "资管", "理财", "信贷", "贷款", "并购"
];
const AI_TERMS = [" ai ", "ai-", "ai-powered", "ai-driven", "artificial intelligence", "agent", "agents", "agentic", "copilot", "automation", "llm", "智能体", "人工智能", "自动化"];
const CHINESE_COMPANY_SOURCES = new Set(["腾讯公司新闻", "阿里巴巴投资者关系"]);
const CHINESE_MEDIA_SOURCES = new Set(["财新财经", "第一财经", "21世纪经济报道", "证券时报", "中国证券报", "澎湃财经", "新浪财经", "财联社"]);
const USER_AGENT = "FinPulseAI/1.2 (+weekly finance intelligence aggregator)";
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
  const allowedHosts = new Set([base.hostname, ...(source.allowedHosts ?? [])]);
  const seen = new Set();
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const href = htmlAttribute(match[1], "href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
    let url;
    try { url = new URL(href, base); } catch { continue; }
    if (!allowedHosts.has(url.hostname)) continue;
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
  const listedDate = link.listingTitle.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  const urlDate = link.url.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  const listingPublishedAt = listedDate
    ? `${listedDate[1]}-${listedDate[2].padStart(2, "0")}-${listedDate[3].padStart(2, "0")}`
    : urlDate
      ? `${urlDate[1]}-${urlDate[2].padStart(2, "0")}-${urlDate[3].padStart(2, "0")}`
      : "";
  if (/\.pdf(?:$|\?)/i.test(link.url)) {
    return { title: cleanText(link.listingTitle), url: link.url, description: "", publishedAt: listingPublishedAt };
  }
  const response = await fetch(link.url, {
    headers: { "user-agent": source.browserUserAgent ? BROWSER_USER_AGENT : USER_AGENT, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const html = await response.text();
  const documentTitle = tag(html, ["title"]).replace(/\s*[|–—-]\s*[^|–—-]{2,50}$/, "").trim();
  const articleTitle = htmlMeta(html, ["og:title", "twitter:title"]) || documentTitle;
  const title = source.financeOnly ? link.listingTitle : articleTitle || link.listingTitle;
  const description = [source.financeOnly ? articleTitle : "", htmlMeta(html, ["description", "og:description", "twitter:description"])]
    .filter(Boolean)
    .join(" ");
  const jsonDate = html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)?.[1] ?? "";
  const timeDate = html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] ?? "";
  const publishedAt = htmlMeta(html, ["article:published_time", "date", "datepublished"]) || jsonDate || timeDate;
  return { title: cleanText(title), url: link.url, description: cleanText(description), publishedAt: publishedAt || listingPublishedAt || (source.financeOnly ? new Date().toISOString() : "") };
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
  const combinedHits = matchingTerms(text, FINANCE_TERMS).length;
  if (source.financeOnly) return combinedHits >= 1;
  if (!includesAny(text, AI_TERMS)) return false;
  if (source.focus === "finance") return combinedHits >= 1;
  return includesAny(raw.title, FINANCE_TERMS) || combinedHits >= 2;
}

function classify(text) {
  const value = text.toLowerCase();
  if (/(业绩|财报|年度报告|季度报告|营收|收入|利润|现金流|回购|分红|投资者|earnings|revenue|profit|cash flow|buyback|dividend)/.test(value)) return ["公司财务", "公司财务 · 业绩与资本动作"];
  if (/(a股|港股|中概股|美股|证券|券商|基金|etf|债券|资本市场|股市|上市|market|equity|bond|securities|investment)/.test(value)) return ["资本市场", "资本市场 · 投融资"];
  if (/(央行|财政|利率|汇率|人民币|货币政策|监管|宏观|central bank|federal reserve|interest rate|exchange rate|regulatory)/.test(value)) return ["宏观政策", "宏观 · 政策与监管"];
  if (/(银行|保险|支付|信贷|贷款|理财|资管|私募|金融|bank|banking|insurance|payment|fintech|wealth|aml|kyc)/.test(value)) return ["银行金融", "金融机构 · 产品与风险"];
  if (/(security|governance|compliance|audit|fraud|risk|内控|合规|审计|风险)/.test(value)) return ["风险合规", "风险合规 · 治理审计"];
  if (/(shared service|invoice|payable|purchase-to-pay|procurement|forecast|budget|planning|variance|fpa|fp&a|共享|应付|采购|发票|预算|预测|经营分析|会计|财务)/.test(value)) return ["财务运营", "财务运营 · 流程与分析"];
  if (/(tool|platform|launch|release|copilot|agent|产品|发布|工具|智能体|人工智能|automation)/.test(value)) return ["AI技术", "AI 技术 · 财务应用"];
  return ["财经动态", "财经动态 · 综合观察"];
}

function scoreItem(raw, source) {
  const text = `${raw.title} ${raw.description}`;
  const financeHits = matchingTerms(text, FINANCE_TERMS).length;
  const aiHits = matchingTerms(text, AI_TERMS).length;
  const titleFinance = includesAny(raw.title, FINANCE_TERMS);
  const titleAi = includesAny(raw.title, AI_TERMS);
  const base = source.tier === 1 ? 54 : 48;
  const focusBoost = source.focus === "finance" ? 8 : 0;
  return Math.min(96, base + focusBoost + (source.sourceBoost ?? 0) + Math.min(20, financeHits * 4) + Math.min(12, aiHits * 3) + (titleFinance ? 8 : 0) + (titleAi ? 5 : 0));
}

function defaultInsight(category) {
  const insights = {
    "公司财务": "重点核对收入与利润质量、现金流变化、资本动作及管理层对后续经营的判断。",
    "资本市场": "关注资金流向、估值与融资条件的变化，并判断其对企业资本成本和资产配置的影响。",
    "宏观政策": "将政策、利率和汇率变化映射到融资成本、现金管理、预算假设与风险敞口。",
    "银行金融": "关注产品、资产质量、资本约束与监管变化，识别对企业融资和金融业务的传导。",
    "风险合规": "核对监管口径、风险边界、内部控制和审计要求是否出现实质变化。",
    "财务运营": "判断变化能否改善预算、核算、资金或共享流程，同时保留必要的复核与控制。",
    "AI技术": "先确认它能连接哪些财务数据、能执行哪些动作，以及关键结果是否支持人工复核。",
    "财经动态": "结合企业基本面、资金环境与政策背景判断影响，避免只按单一市场波动行动。"
  };
  return insights[category] ?? insights["财经动态"];
}

function normalizeTitle(value) {
  const title = cleanText(value);
  const repeatedHalf = title.length % 2 === 0 && title.slice(0, title.length / 2) === title.slice(title.length / 2)
    ? title.slice(0, title.length / 2)
    : title;
  const pipeLead = repeatedHalf.split(/\s+[|｜]\s+/)[0];
  return (pipeLead.length >= 12 ? pipeLead : repeatedHalf).slice(0, 140).trim();
}

function buildSummary(raw) {
  const title = normalizeTitle(raw.title);
  const description = cleanText(raw.description);
  const withoutRepeatedTitle = description
    .replaceAll(cleanText(raw.title), " ")
    .replaceAll(title, " ")
    .replace(/\s+/g, " ")
    .trim();
  const summary = withoutRepeatedTitle || title;
  return summary.length > 240 ? `${summary.slice(0, 236)}…` : summary;
}

function deriveAudienceFields(text, source) {
  const language = source.financeOnly || /[\u3400-\u9fff]/.test(text) ? "zh" : "en";
  const sourceType = CHINESE_COMPANY_SOURCES.has(source.name)
    ? "company"
    : CHINESE_MEDIA_SOURCES.has(source.name)
      ? "chinese-media"
      : "international";
  const hasCompanyFinanceAction = /(业绩|财报|年度报告|季度报告|营收|收入|利润|现金流|回购|分红|并购|融资|投资者)/.test(text);
  const hasForeignMarker = /(美股|美国|英国|欧洲|日本|韩国|印度|美元|欧元|华尔街|meta|blackrock|贝莱德|高盛|英伟达|微软|亚马逊|openai|anthropic|cuspai)/i.test(text);
  const isCompanyFinance = sourceType === "company" || (language === "zh" && hasCompanyFinanceAction && !hasForeignMarker);
  return { language, sourceType, isCompanyFinance };
}

function toRecord(raw, source) {
  const text = `${raw.title} ${raw.description}`;
  const [category, processName] = classify(text);
  const score = scoreItem(raw, source);
  const date = new Date(raw.publishedAt || Date.now());
  const summary = buildSummary(raw);
  const audience = deriveAudienceFields(text, source);
  return {
    id: createHash("sha1").update(raw.url).digest("hex").slice(0, 18),
    title: normalizeTitle(raw.title),
    summary: summary || "该信源发布了新的财务动态，建议打开原文核验具体信息、影响范围与后续变化。",
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
    ...audience,
    pipelineVersion: 3,
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
      candidates = articleResults.flatMap((result, index) => result.status === "fulfilled"
        ? [result.value]
        : [{
            title: links[index].listingTitle,
            url: links[index].url,
            description: "",
            publishedAt: links[index].url.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/)?.slice(1, 4).map((part, partIndex) => partIndex === 0 ? part : part.padStart(2, "0")).join("-") ?? new Date().toISOString(),
          }]);
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
    const validatedKeywords = item.pipelineVersion >= 2 ? ` ${(item.keywords ?? []).join(" ")}` : "";
    const raw = { title: item.title, description: `${item.summary}${validatedKeywords}` };
    const displayRaw = { title: item.title, description: item.summary };
    const score = scoreItem(raw, source);
    const [category, processName] = classify(`${raw.title} ${raw.description}`);
    return {
      ...item,
      title: normalizeTitle(item.title),
      summary: buildSummary(displayRaw),
      insight: defaultInsight(category),
      category,
      process: processName,
      ...deriveAudienceFields(`${raw.title} ${raw.description}`, source),
      pipelineVersion: 3,
      score,
      selected: score >= 70,
      _relevant: isFinanceAiRelevant(raw, source),
    };
  })
  .filter((item) => item._relevant)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.score - a.score)
  .map(({ _relevant, ...item }) => item)
  .slice(0, 160);

function rebuildTrends(allItems) {
  const recent = allItems.filter((item) => new Date(`${item.publishedAt}T00:00:00Z`).valueOf() >= Date.now() - 30 * 24 * 60 * 60 * 1000);
  const definitions = [
    { label: "公司财务", note: "业绩、现金流与资本动作", pattern: /公司财务|业绩|财报|营收|利润|现金流|回购|分红/i },
    { label: "资本市场", note: "股债与融资环境变化", pattern: /资本市场|a股|港股|中概股|美股|证券|基金|债券|融资/i },
    { label: "银行金融", note: "机构、产品与资产质量", pattern: /银行金融|银行|保险|支付|信贷|资管|理财/i },
    { label: "宏观政策", note: "利率、汇率与监管传导", pattern: /宏观政策|央行|利率|汇率|人民币|监管/i },
    { label: "AI 与技术", note: "英文原始信源作为补充", pattern: /agent|agentic|智能体|人工智能|automation|copilot/i },
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
  return `本轮从 ${healthyCount} 个正常信源中匹配 ${matchedCount} 条财务与金融关键信号，重点集中在${focus.join("、")}。当前最值得继续追踪的是《${lead.title}》。`;
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

function validateSnapshot(snapshot) {
  const health = snapshot.meta.sourceOk / snapshot.meta.sourceCount;
  if (!/^\d{8}$/.test(snapshot.meta.issue) || health < 0.8 || snapshot.items.length < 10) {
    throw new Error(`Quality gate failed: issue=${snapshot.meta.issue}, health=${health.toFixed(2)}, items=${snapshot.items.length}`);
  }
  if (snapshot.items.some((item) => !item.source || !/^https?:\/\//.test(item.url))) {
    throw new Error("Quality gate failed: one or more items are missing source attribution or original URL");
  }
}

async function syncHostedSnapshot(snapshot) {
  const syncUrl = process.env.NEWS_SYNC_URL;
  const token = process.env.NEWS_INGEST_TOKEN;
  if (!syncUrl || !token) return false;
  const response = await fetch(new URL("/api/news", syncUrl), {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(snapshot),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Hosted snapshot sync failed: ${response.status} ${await response.text()}`);
  return true;
}

validateSnapshot(current);
await writeFile(dataPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
const synced = await syncHostedSnapshot(current);
console.log(`FinPulse refresh complete: ${fresh.length} matched, ${items.length} total.`);
console.log(`Source results: ${sourceStats.map((source) => `${source.name}=${source.matched}`).join(", ")}`);
console.log(synced ? "Hosted snapshot synced." : "Hosted snapshot sync skipped: runtime credentials are not configured.");
if (errors.length) console.warn(`Unavailable feeds (${errors.length}):\n- ${errors.join("\n- ")}`);
