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
  "audit", "compliance", "risk", "fraud", "procurement", "purchase-to-pay",
  "quote-to-cash", "close", "closing", "forecast", "budget", "fpa", "fp&a",
  "cfo", "erp", "共享", "财务", "会计", "发票", "关账", "预算", "资金", "税务"
];
const AI_TERMS = [" ai ", "artificial intelligence", "agent", "copilot", "automation", "llm", "智能体", "人工智能", "自动化"];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
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

function includesAny(text, terms) {
  const haystack = ` ${text.toLowerCase()} `;
  return terms.some((term) => haystack.includes(term));
}

function classify(text) {
  const value = text.toLowerCase();
  if (/(security|governance|compliance|audit|fraud|risk|内控|合规|风险)/.test(value)) return ["风险合规", "风险合规 · AI 治理"];
  if (/(shared service|invoice|payable|purchase-to-pay|procurement|共享|应付|采购)/.test(value)) return ["财务共享", "财务共享 · P2P"];
  if (/(forecast|budget|planning|variance|fpa|fp&a|预算|预测|经营分析)/.test(value)) return ["业财分析", "FP&A · 预算预测"];
  if (/(tool|platform|launch|release|copilot|agent|产品|发布|工具)/.test(value)) return ["AI工具", "财务数字化 · 工具应用"];
  return ["流程升级", "R2R · 财务运营"];
}

function scoreItem(text, tier) {
  const financeHits = FINANCE_TERMS.filter((term) => text.toLowerCase().includes(term)).length;
  const aiHits = AI_TERMS.filter((term) => ` ${text.toLowerCase()} `.includes(term)).length;
  const base = tier === 1 ? 58 : 50;
  return Math.min(96, base + Math.min(24, financeHits * 4) + Math.min(14, aiHits * 4));
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
  const score = scoreItem(text, source.tier);
  const date = new Date(raw.publishedAt || Date.now());
  const summary = raw.description.length > 220 ? `${raw.description.slice(0, 216)}…` : raw.description;
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
    keywords: [...new Set(FINANCE_TERMS.filter((term) => text.toLowerCase().includes(term)).slice(0, 5))],
    readTime: Math.max(2, Math.min(8, Math.round(text.length / 700)))
  };
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { "user-agent": "FinPulseAI/1.0 (+GitHub Actions; finance intelligence aggregator)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const xml = await response.text();
  return parseFeed(xml)
    .filter((item) => {
      const published = new Date(item.publishedAt || 0);
      return Number.isNaN(published.valueOf()) || published.valueOf() >= Date.now() - 14 * 24 * 60 * 60 * 1000;
    })
    .filter((item) => includesAny(`${item.title} ${item.description}`, FINANCE_TERMS))
    .filter((item) => includesAny(`${item.title} ${item.description}`, AI_TERMS))
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

let enriched = fresh.slice(0, 20);
try {
  enriched = await enrichWithCompatibleLLM(fresh.slice(0, 20));
} catch (error) {
  console.warn(`LLM enrichment skipped: ${error.message}`);
}
const finalizedFresh = [...enriched, ...fresh.slice(20)].map((item) => ({
  ...item,
  selected: item.score >= 70 && /[\u4e00-\u9fff]/.test(item.title),
}));

const merged = new Map(current.items.map((item) => [item.url, item]));
for (const item of finalizedFresh) merged.set(item.url, item);
const items = [...merged.values()]
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.score - a.score)
  .map((item) => ({ ...item, selected: Boolean(item.selected && /[\u4e00-\u9fff]/.test(item.title)) }))
  .slice(0, 120);

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
current.meta.todaySignals = fresh.length;
current.meta.actionable = items.filter((item) => item.selected).length;
current.meta.issue = issue;
current.items = items;

await writeFile(dataPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
console.log(`FinPulse refresh complete: ${fresh.length} matched, ${items.length} total.`);
if (errors.length) console.warn(`Unavailable feeds (${errors.length}):\n- ${errors.join("\n- ")}`);
