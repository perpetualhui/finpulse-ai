# 财智雷达 · FinPulse AI

面向企业财务负责人与财务数字化团队的 AI 情报聚合器。每天从配置的官方信源抓取内容，完成财务相关性筛选、去重、流程映射、评分和摘要，并自动发布到 GitHub Pages。

## 已实现

- 今日精选、全量动态、AI 工具、流程升级、财务共享、风险合规六类视图
- 搜索、分类筛选、相关性评分、原文跳转和本地收藏
- P2P、O2C、R2R、FP&A、资金与 GRC 流程标签
- 工具落地雷达、趋势温度、每日财务 AI 简报
- RSS/Atom 自动抓取、关键词过滤、去重和规则评分
- 可选的 OpenAI-compatible LLM 中文摘要与财务解读
- 每天 07:30（Asia/Shanghai）自动更新数据
- GitHub Pages 自动构建和部署

## 本地运行

```bash
npm install
npm run dev
```

静态站构建：

```bash
npm run build:pages
```

手动刷新数据：

```bash
npm run refresh
```

## 配置信源

编辑 `config/sources.json`。每个信源包含名称、RSS/Atom 地址、信源等级和语言。抓取失败不会清空旧数据，现有内容会继续保留。

## 可选 AI 摘要

在 GitHub 仓库的 Actions secrets 中配置：

- `LLM_API_URL`：OpenAI-compatible Chat Completions 地址
- `LLM_API_KEY`：接口密钥
- `LLM_MODEL`：模型名称

未配置时仍可正常更新，系统会使用规则生成摘要与财务解读。

## GitHub Pages

将仓库的 Pages Source 设置为 **GitHub Actions**。每次推送或每日数据更新后，`deploy-pages.yml` 会把静态站发布到 Pages。

新闻版权归原作者与原网站所有；本站保留出处和原文链接，只做聚合摘要与研究参考。
