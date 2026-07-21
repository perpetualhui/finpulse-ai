"use client";

import { useEffect, useMemo, useState } from "react";
import fallbackNewsData from "@/public/data/news.json";

type NewsData = typeof fallbackNewsData;
type NewsItem = NewsData["items"][number];
const LIVE_NEWS_URL = "https://raw.githubusercontent.com/perpetualhui/finpulse-ai/main/public/data/news.json";

const NAV_ITEMS = [
  { id: "精选", mark: "01", label: "周报精选" },
  { id: "中国公司", mark: "02", label: "中国公司" },
  { id: "公司财务", mark: "03", label: "财报与业绩" },
  { id: "资本市场", mark: "04", label: "资本市场" },
  { id: "金融动态", mark: "05", label: "金融动态" },
  { id: "AI技术", mark: "06", label: "AI 与技术" },
] as const;

const FILTERS = ["全部", "财联社", "财新财经", "公司财务", "资本市场", "银行金融", "英文补充"];

const SECTION_COPY: Record<string, { title: string; eyebrow: string; subtitle: string }> = {
  精选: {
    eyebrow: "WEEKLY SIGNAL / 周报信号",
    title: "这周，财务有哪些关键变化？",
    subtitle: "中国公司优先，英文信源补充，只保留值得财务负责人继续追踪的变化。",
  },
  全部: {
    eyebrow: "FULL STREAM / 全量情报",
    title: "财务 AI 动态流",
    subtitle: "按相关度、发布时间与财务流程统一整理的全量信号。",
  },
  中国公司: {
    eyebrow: "CHINA COMPANY / 中国公司",
    title: "中国公司的财务关键信号",
    subtitle: "聚焦业绩、现金流、融资、回购、分红和并购等可验证的经营变化。",
  },
  公司财务: {
    eyebrow: "EARNINGS WATCH / 财报业绩",
    title: "从财报看经营质量",
    subtitle: "把收入、利润、现金流与资本动作放在同一条经营脉络中观察。",
  },
  资本市场: {
    eyebrow: "CAPITAL MARKET / 资本市场",
    title: "资金正在重新定价什么？",
    subtitle: "跟踪股债、基金、融资与资本成本变化，筛掉只有波动、缺少信息增量的消息。",
  },
  金融动态: {
    eyebrow: "FINANCIAL SYSTEM / 金融动态",
    title: "银行、保险与政策的传导链",
    subtitle: "关注金融机构、利率汇率、监管政策对企业融资和现金管理的影响。",
  },
  AI技术: {
    eyebrow: "GLOBAL TECH / AI 与技术",
    title: "英文原始信源中的财务技术变化",
    subtitle: "英文作为补充，重点保留能进入财务流程、金融产品或风险控制的技术进展。",
  },
};

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
      <span>{score}</span>
    </div>
  );
}

export default function Home() {
  const [newsData, setNewsData] = useState<NewsData>(fallbackNewsData);
  const [activeView, setActiveView] = useState("精选");
  const [activeFilter, setActiveFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("finpulse-saved");
    const savedTheme = window.localStorage.getItem("finpulse-theme");
    if (saved) setSavedIds(new Set(JSON.parse(saved)));
    if (savedTheme === "dark") {
      setTheme("dark");
      document.documentElement.dataset.theme = "dark";
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadLatestNews = async () => {
      try {
        const response = await fetch(`${LIVE_NEWS_URL}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const latest = await response.json() as NewsData;
        if (active) setNewsData(latest);
      } catch {
        // Keep the bundled snapshot visible during a temporary network failure.
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadLatestNews();
    };

    void loadLatestNews();
    const timer = window.setInterval(loadLatestNews, 15_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return newsData.items.filter((item) => {
      const viewMatch =
        activeView === "精选"
          ? item.selected
          : activeView === "中国公司"
            ? item.language === "zh" && item.isCompanyFinance
            : activeView === "金融动态"
              ? item.category === "银行金融" || item.category === "宏观政策"
              : activeView === "AI技术"
                ? item.category === "AI技术" || item.kind === "tool" || item.language === "en"
                : item.category === activeView;
      const filterMatch =
        activeFilter === "全部" ||
        item.source === activeFilter ||
        item.category === activeFilter ||
        (activeFilter === "英文补充" && item.language === "en");
      const queryMatch =
        !normalizedQuery ||
        [item.title, item.summary, item.source, item.process, ...item.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return viewMatch && filterMatch && queryMatch;
    });
  }, [activeFilter, activeView, query]);

  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, 12);
  const sectionCopy = SECTION_COPY[activeView] ?? SECTION_COPY.精选;
  const leadItem = newsData.items.find((item) => item.selected) ?? newsData.items[0];
  const companyHighlights = newsData.items.filter((item) => item.language === "zh" && item.isCompanyFinance).slice(0, 5);
  const englishHighlights = newsData.items.filter((item) => item.language === "en").slice(0, 5);
  const sourceCounts = useMemo(() => newsData.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
    return counts;
  }, {}), []);
  const chineseCount = newsData.items.filter((item) => item.language === "zh").length;
  const companyCount = newsData.items.filter((item) => item.language === "zh" && item.isCompanyFinance).length;
  const topChineseSources = ["财联社", "财新财经", "第一财经", "21世纪经济报道", "证券时报", "中国证券报"]
    .map((source) => ({ source, count: sourceCounts[source] ?? 0 }));
  const topicCounts = Object.entries(newsData.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  function toggleSaved(id: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem("finpulse-saved", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("finpulse-theme", next);
  }

  function switchView(view: string) {
    setActiveView(view);
    setActiveFilter("全部");
    setShowAll(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="site-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => switchView("精选")} aria-label="返回周报精选">
          <span className="brand-symbol"><i></i><i></i><i></i></span>
          <span className="brand-copy"><b>财智雷达</b><small>FINPULSE AI</small></span>
        </button>

        <div className="side-kicker">财经与财务情报站</div>
        <nav className="side-nav" aria-label="主要导航">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "side-link active" : "side-link"}
              onClick={() => switchView(item.id)}
            >
              <span>{item.mark}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="side-divider" />
        <button className="daily-link" onClick={() => document.getElementById("daily-brief")?.scrollIntoView({ behavior: "smooth" })}>
          <span>WEEKLY</span>
          <b>每周财务情报简报</b>
          <small>每周一 07:30 自动更新</small>
        </button>

        <div className="side-footer">
          <div><span className="live-dot" />采集服务正常</div>
          <button onClick={toggleTheme} aria-label="切换明暗主题">{theme === "light" ? "深色" : "浅色"}</button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">财智雷达 <span>FINPULSE AI</span></div>
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具、流程、厂商或关键词" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="top-actions">
            <span className="update-time"><i />实时数据 · {newsData.meta.lastUpdated}</span>
            <button onClick={() => setQuery("")} className="clear-button">清空检索</button>
          </div>
        </header>

        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">{sectionCopy.eyebrow}</p>
              <h1>{sectionCopy.title}</h1>
              <p className="hero-subtitle">{sectionCopy.subtitle}</p>
            </div>
            <div className="hero-stats" aria-label="本周采集概览">
              <div><strong>{newsData.meta.sourceOk}/{newsData.meta.sourceCount}</strong><span>正常 / 全部信源</span></div>
              <div><strong>{chineseCount}</strong><span>中文财经信号</span></div>
              <div><strong>{companyCount}</strong><span>中国公司财务</span></div>
              <div><strong>{newsData.meta.actionable}</strong><span>高相关精选</span></div>
            </div>
          </section>

          {activeView === "精选" && (
            <section className="coverage-strip" aria-label="本周内容结构">
              <div><span>中文优先</span><strong>{chineseCount}</strong><small>条中文财经与公司信号</small></div>
              <div><span>重点媒体</span><strong>{(sourceCounts["财联社"] ?? 0) + (sourceCounts["财新财经"] ?? 0)}</strong><small>条来自财联社与财新</small></div>
              <div><span>英文补充</span><strong>{englishHighlights.length ? newsData.items.filter((item) => item.language === "en").length : 0}</strong><small>条国际原始信源</small></div>
              <div><span>公司观察</span><strong>{companyCount}</strong><small>条业绩与资本动作</small></div>
            </section>
          )}

          <section className="signal-grid" id="daily-brief">
            <article className="lead-signal">
              <div className="lead-topline"><span className="hot-label">本周头条</span><span>{formatDate(leadItem.publishedAt)} · {leadItem.source}</span></div>
              <h2>{leadItem.title}</h2>
              <p>{leadItem.summary}</p>
              <div className="lead-footer">
                <a href={leadItem.url} target="_blank" rel="noreferrer">阅读原文 <span>↗</span></a>
                <div><small>影响流程</small><b>{leadItem.process}</b></div>
              </div>
              <div className="signal-plot" aria-hidden="true">
                <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </div>
            </article>

            <article className="brief-card">
              <div className="brief-heading"><span>AI 编排</span><small>NO. {newsData.meta.issue}</small></div>
              <h3>本周财务情报简报</h3>
              <p>{newsData.meta.dailyBrief}</p>
              <div className="brief-themes">
                {newsData.trends.slice(0, 3).map((trend, index) => (
                  <div key={trend.label}><span>0{index + 1}</span><p><b>{trend.label}</b><small>{trend.note}</small></p></div>
                ))}
              </div>
            </article>
          </section>

          <section className="content-grid">
            <div className="feed-column">
              <div className="filter-row">
                <div className="filters" role="tablist" aria-label="内容筛选">
                  {FILTERS.map((filter) => (
                    <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => { setActiveFilter(filter); setShowAll(false); }}>
                      {filter}
                    </button>
                  ))}
                </div>
                <span className="result-count">{filteredItems.length} 条结果</span>
              </div>

              <div className="feed-list">
                {visibleItems.map((item, index) => (
                  <article className="feed-item" key={item.id}>
                    <div className="feed-rank">{String(index + 1).padStart(2, "0")}</div>
                    <div className="feed-body">
                      <div className="item-meta">
                        <span className={`category-tag category-${item.category}`}>{item.category}</span>
                        <span>{formatDate(item.publishedAt)}</span>
                        <span>{item.source}</span>
                        {item.kind === "tool" && <span className="tool-flag">可用工具</span>}
                      </div>
                      <a href={item.url} target="_blank" rel="noreferrer" className="item-title">{item.title}</a>
                      <p className="item-summary">{item.summary}</p>
                      <div className="why-it-matters"><span>财务视角</span>{item.insight}</div>
                      <div className="item-footer"><span>{item.process}</span><span>{item.readTime} 分钟</span></div>
                    </div>
                    <div className="feed-actions">
                      <ScoreRing score={item.score} />
                      <button className={savedIds.has(item.id) ? "save-button saved" : "save-button"} onClick={() => toggleSaved(item.id)} aria-label={savedIds.has(item.id) ? "取消收藏" : "收藏"}>
                        {savedIds.has(item.id) ? "已收藏" : "收藏"}
                      </button>
                    </div>
                  </article>
                ))}
                {visibleItems.length === 0 && <div className="empty-state"><b>没有匹配的情报</b><span>换一个分类或搜索词试试。</span></div>}
              </div>
              {!showAll && filteredItems.length > 12 && <button className="load-more" onClick={() => setShowAll(true)}>展开全部 {filteredItems.length} 条情报</button>}
            </div>

            <aside className="right-rail">
              <section className="rail-card trend-card">
                <div className="rail-heading"><span>趋势温度</span><small>近 7 日</small></div>
                {newsData.trends.map((trend, index) => (
                  <div className="trend-row" key={trend.label}>
                    <span>{index + 1}</span>
                    <div><b>{trend.label}</b><i><em style={{ width: `${trend.heat}%` }} /></i></div>
                    <strong>{trend.heat}</strong>
                  </div>
                ))}
              </section>

              <section className="rail-card process-card">
                <div className="rail-heading"><span>主题分布</span><small>本周 {newsData.items.length} 条</small></div>
                <div className="topic-bars">
                  {topicCounts.map(([topic, count]) => (
                    <button key={topic} onClick={() => { setActiveFilter(topic); setShowAll(false); }}>
                      <span><b>{topic}</b><strong>{count}</strong></span>
                      <i><em style={{ width: `${Math.max(8, Math.round(count / newsData.items.length * 100))}%` }} /></i>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rail-card source-card">
                <div className="rail-heading"><span>重点中文信源</span><small><i className="live-dot" /> 本周收录</small></div>
                <div className="source-ranking">
                  {topChineseSources.map(({ source, count }, index) => (
                    <button key={source} onClick={() => { setActiveFilter(source); setShowAll(false); }}>
                      <span>{String(index + 1).padStart(2, "0")}</span><b>{source}</b><strong>{count}</strong>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </section>

          {activeView === "精选" && (
            <section className="regional-highlights">
              <div className="highlight-column">
                <div className="section-heading compact"><div><p className="eyebrow">CHINA COMPANY / 中国公司</p><h2>公司财务与资本动作</h2></div><button onClick={() => switchView("中国公司")}>查看全部 →</button></div>
                <div className="compact-list">
                  {companyHighlights.map((item) => (
                    <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                      <span>{formatDate(item.publishedAt)}</span><div><b>{item.title}</b><small>{item.source} · {item.category}</small></div><i>↗</i>
                    </a>
                  ))}
                </div>
              </div>
              <div className="highlight-column english-column">
                <div className="section-heading compact"><div><p className="eyebrow">ENGLISH SUPPLEMENT / 英文补充</p><h2>国际原始信源</h2></div><button onClick={() => switchView("AI技术")}>查看全部 →</button></div>
                <div className="compact-list">
                  {englishHighlights.map((item) => (
                    <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                      <span>{formatDate(item.publishedAt)}</span><div><b>{item.title}</b><small>{item.source} · {item.category}</small></div><i>↗</i>
                    </a>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="tool-radar-section">
            <div className="section-heading">
              <div><p className="eyebrow">DEPLOYMENT BOARD / 落地观察</p><h2>财务 AI 工具雷达</h2></div>
              <button onClick={() => switchView("AI技术")}>查看工具专题 →</button>
            </div>
            <div className="tool-table">
              <div className="tool-table-head"><span>工具 / 厂商</span><span>适用场景</span><span>阶段</span><span>落地判断</span></div>
              {newsData.tools.map((tool) => (
                <a href={tool.url} target="_blank" rel="noreferrer" className="tool-row" key={tool.name}>
                  <span><b>{tool.name}</b><small>{tool.vendor}</small></span>
                  <span>{tool.useCase}</span>
                  <span><i className={`stage stage-${tool.stageCode}`} />{tool.stage}</span>
                  <span>{tool.verdict}<b>↗</b></span>
                </a>
              ))}
            </div>
          </section>
        </main>

        <footer>
          <div className="footer-brand"><b>财智雷达</b><span>让财务人先看见变化，再决定是否行动。</span></div>
          <div><span>数据仅用于信息参考，请以原始信源为准</span><span>更新于 {newsData.meta.lastUpdated}</span></div>
        </footer>
      </div>

      <nav className="mobile-tabs" aria-label="移动端导航">
        {NAV_ITEMS.slice(0, 4).map((item) => (
          <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => switchView(item.id)}><span>{item.mark}</span>{item.label.replace("今日", "")}</button>
        ))}
      </nav>
    </div>
  );
}
