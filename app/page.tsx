"use client";

import { useEffect, useMemo, useState } from "react";
import newsData from "@/public/data/news.json";

type NewsItem = (typeof newsData.items)[number];

const NAV_ITEMS = [
  { id: "精选", mark: "01", label: "今日精选" },
  { id: "全部", mark: "02", label: "全部动态" },
  { id: "AI工具", mark: "03", label: "AI 工具库" },
  { id: "流程升级", mark: "04", label: "流程升级" },
  { id: "财务共享", mark: "05", label: "财务共享" },
  { id: "风险合规", mark: "06", label: "风险与合规" },
] as const;

const FILTERS = ["全部", "AI工具", "流程升级", "财务共享", "风险合规", "业财分析"];

const SECTION_COPY: Record<string, { title: string; eyebrow: string; subtitle: string }> = {
  精选: {
    eyebrow: "MORNING SIGNAL / 早间信号",
    title: "今天，财务被 AI 改写了什么？",
    subtitle: "从产品发布到落地流程，只保留值得财务负责人继续追踪的变化。",
  },
  全部: {
    eyebrow: "FULL STREAM / 全量情报",
    title: "财务 AI 动态流",
    subtitle: "按相关度、发布时间与财务流程统一整理的全量信号。",
  },
  AI工具: {
    eyebrow: "TOOL RADAR / 工具雷达",
    title: "能真正进入财务流程的 AI 工具",
    subtitle: "不看概念热度，重点看适用岗位、落地阶段和系统集成方式。",
  },
  流程升级: {
    eyebrow: "PROCESS SHIFT / 流程升级",
    title: "从单点提效到流程重构",
    subtitle: "追踪 P2P、O2C、R2R、FP&A、税务与资金管理的新处理方式。",
  },
  财务共享: {
    eyebrow: "SHARED SERVICE / 财务共享",
    title: "共享中心的新自动化边界",
    subtitle: "聚焦例外处理、智能审核、知识协同和跨系统编排。",
  },
  风险合规: {
    eyebrow: "CONTROL LAYER / 风险合规",
    title: "让每一步自动化都可解释、可审计",
    subtitle: "跟踪权限、数据安全、模型治理、内控与监管动态。",
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

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return newsData.items.filter((item) => {
      const viewMatch =
        activeView === "精选"
          ? item.selected
          : activeView === "全部"
            ? true
            : activeView === "AI工具"
              ? item.kind === "tool"
              : item.category === activeView || item.process.includes(activeView);
      const filterMatch =
        activeFilter === "全部" ||
        item.category === activeFilter ||
        item.process.includes(activeFilter) ||
        (activeFilter === "AI工具" && item.kind === "tool");
      const queryMatch =
        !normalizedQuery ||
        [item.title, item.summary, item.source, item.process, ...item.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return viewMatch && filterMatch && queryMatch;
    });
  }, [activeFilter, activeView, query]);

  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, 7);
  const sectionCopy = SECTION_COPY[activeView] ?? SECTION_COPY.精选;
  const leadItem = newsData.items.find((item) => item.selected && /[\u4e00-\u9fff]/.test(item.title)) ?? newsData.items[0];

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
        <button className="brand" onClick={() => switchView("精选")} aria-label="返回今日精选">
          <span className="brand-symbol"><i></i><i></i><i></i></span>
          <span className="brand-copy"><b>财智雷达</b><small>FINPULSE AI</small></span>
        </button>

        <div className="side-kicker">财务 AI 情报站</div>
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
          <span>DAILY</span>
          <b>每日财务 AI 简报</b>
          <small>每天 07:30 自动更新</small>
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
            <span className="update-time"><i />刚刚更新</span>
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
            <div className="hero-stats" aria-label="今日采集概览">
              <div><strong>{newsData.meta.sourceCount}</strong><span>持续跟踪信源</span></div>
              <div><strong>{newsData.meta.todaySignals}</strong><span>本轮匹配信号</span></div>
              <div><strong>{newsData.meta.actionable}</strong><span>高相关精选</span></div>
            </div>
          </section>

          <section className="signal-grid" id="daily-brief">
            <article className="lead-signal">
              <div className="lead-topline"><span className="hot-label">今日头条</span><span>{formatDate(leadItem.publishedAt)} · {leadItem.source}</span></div>
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
              <h3>今日财务 AI 简报</h3>
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
              {!showAll && filteredItems.length > 7 && <button className="load-more" onClick={() => setShowAll(true)}>展开全部 {filteredItems.length} 条情报</button>}
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
                <div className="rail-heading"><span>流程覆盖</span><small>本周</small></div>
                <div className="process-wheel">
                  <div><b>R2R</b><span>核算到报告</span></div>
                  <div><b>P2P</b><span>采购到付款</span></div>
                  <div><b>O2C</b><span>订单到收款</span></div>
                  <div><b>FP&A</b><span>计划与分析</span></div>
                  <div><b>TR</b><span>资金管理</span></div>
                  <div><b>GRC</b><span>风险与合规</span></div>
                </div>
              </section>

              <section className="rail-card source-card">
                <div className="rail-heading"><span>采集流水线</span><small><i className="live-dot" /> 运行中</small></div>
                <ol>
                  <li><span>01</span><p><b>定时抓取</b><small>RSS / 官方博客 / 研究机构</small></p></li>
                  <li><span>02</span><p><b>去重与相关性评分</b><small>财务关键词 + 流程映射</small></p></li>
                  <li><span>03</span><p><b>摘要与财务解读</b><small>保留原文链接与出处</small></p></li>
                  <li><span>04</span><p><b>GitHub 自动发布</b><small>每日 07:30 更新数据</small></p></li>
                </ol>
              </section>
            </aside>
          </section>

          <section className="tool-radar-section">
            <div className="section-heading">
              <div><p className="eyebrow">DEPLOYMENT BOARD / 落地观察</p><h2>财务 AI 工具雷达</h2></div>
              <button onClick={() => switchView("AI工具")}>查看工具专题 →</button>
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
