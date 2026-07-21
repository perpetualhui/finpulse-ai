import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finance AI intelligence product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>财智雷达 · 财务 AI 情报聚合器<\/title>/);
  assert.match(html, /这周，财务有哪些关键变化？/);
  assert.match(html, /中国公司/);
  assert.match(html, /英文补充/);
  assert.match(html, /重点中文信源/);
  assert.match(html, /主题分布/);
  assert.match(html, /实时数据/);
  assert.match(html, /财务 AI 工具雷达/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("news data keeps attribution and finance workflow fields", async () => {
  const data = JSON.parse(await readFile(new URL("../public/data/news.json", import.meta.url), "utf8"));
  assert.ok(data.items.length >= 10);
  assert.ok(data.tools.length >= 5);
  assert.ok(data.meta.sourceCount >= 10);
  assert.ok(data.meta.sourceOk / data.meta.sourceCount >= 0.8);
  assert.ok(data.meta.websiteSourceCount >= 1);
  assert.ok(data.meta.sourceStats.some((source) => source.type === "website" && source.status === "ok"));
  assert.match(data.meta.issue, /^\d{8}$/);
  assert.match(data.meta.dailyBrief, /财务与金融(?: AI)?关键信号|财务与金融 AI 信号/);
  assert.ok(data.items.every((item) => item.source && item.url.startsWith("http")));
  assert.ok(data.items.every((item) => item.title && item.summary && item.insight));
  assert.ok(data.items.every((item) => item.category && item.process && Number.isInteger(item.score)));
  assert.ok(data.items.every((item) => ["zh", "en"].includes(item.language)));
  assert.ok(data.items.every((item) => ["company", "chinese-media", "international"].includes(item.sourceType)));
  assert.ok(data.items.some((item) => item.language === "zh" && item.isCompanyFinance));
  assert.ok(data.items.some((item) => item.language === "en"));
  assert.ok(data.trends.every((trend) => trend.heat >= 0 && trend.heat <= 100));
});

test("source configuration covers feeds and direct websites", async () => {
  const sources = JSON.parse(await readFile(new URL("../config/sources.json", import.meta.url), "utf8"));
  assert.ok(sources.length >= 12);
  assert.ok(sources.some((source) => source.type === "html"));
  assert.ok(sources.some((source) => source.focus === "finance"));
  assert.ok(sources.every((source) => source.name && source.url.startsWith("https://")));
});

test("hosting uses runtime persistence for live news snapshots", async () => {
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.equal(hosting.d1, "DB");
  const route = await readFile(new URL("../worker/news-api.ts", import.meta.url), "utf8");
  assert.match(route, /news_snapshots/);
  assert.match(route, /cache-control": "no-store"/);
});
