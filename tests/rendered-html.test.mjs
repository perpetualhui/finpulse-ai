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
  assert.match(html, /今天，财务被 AI 改写了什么？/);
  assert.match(html, /财务 AI 工具雷达/);
  assert.match(html, /采集流水线/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("news data keeps attribution and finance workflow fields", async () => {
  const data = JSON.parse(await readFile(new URL("../public/data/news.json", import.meta.url), "utf8"));
  assert.ok(data.items.length >= 10);
  assert.ok(data.tools.length >= 5);
  assert.ok(data.items.every((item) => item.source && item.url.startsWith("http")));
  assert.ok(data.items.every((item) => item.process && Number.isInteger(item.score)));
  assert.ok(data.trends.every((trend) => trend.heat >= 0 && trend.heat <= 100));
});
