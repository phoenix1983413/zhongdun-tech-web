# 中盾数智 · 领御低空 产品官网

北京中盾数智科技有限公司产品线官网（领御 DX / RX / EX），静态站点，部署于 GitHub Pages。

- 线上地址：https://phoenix1983413.github.io/zhongdun-tech-web/
- 技术栈：Vite 5（MPA 多页）+ 原生 JS + Three.js
- 设计基线：参考站 `zhongdun-shuzhi` 的浅色设计系统 + 产品宣传册品牌色

---

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（默认 http://localhost:5173/zhongdun-tech-web/）
npm run build      # 构建到 dist/
npm run preview    # 预览构建产物
```

## 发布上线

构建后把 `dist/` 推到 `gh-pages` 分支：

```bash
./deploy.sh
```

脚本会：构建 → 复制产物到临时目录 → 强制推送到 `gh-pages`。

---

## 目录结构

```
.
├─ index.html                  首页
├─ about.html                  关于我们
├─ contact.html                联系我们
├─ products/
│  ├─ index.html               产品中心
│  ├─ dx.html                  领御 DX · 无人机全域智管平台
│  ├─ rx.html                  领御 RX · 具身智能合成作战平台
│  └─ ex.html                  领御 EX · 公共安全智能体
├─ src/
│  ├─ styles/
│  │  ├─ base.css              设计令牌 + 基础层（改主题色改这里）
│  │  └─ components.css        组件层（导航/Hero/卡片/规格表…）
│  └─ js/
│     ├─ site.js               导航、滚动揭示、数字滚动、表单
│     ├─ scenes.js             Three.js 四个场景 + Canvas 2D 降级
│     └─ entries/              各页面入口（引入样式 + 场景）
├─ public/
│  ├─ favicon.svg
│  └─ .nojekyll
├─ docs/官网设计方案.md          设计与内容规划文档
├─ preview/index.html          首页设计预览（独立单文件，含 CDN 版 Three.js）
├─ vite.config.js              多页入口 + base 配置
└─ deploy.sh                   一键发布
```

---

## 上线前必须替换的占位内容

| 位置 | 当前占位 | 说明 |
|---|---|---|
| 所有页面页脚 | `ICP 备案号：待填` | 替换为真实备案号 |
| 所有页面页脚 | `商务合作（待填）/ 电话（待填）/ 地址：北京（待填）` | 真实联系方式 |
| `contact.html` | 地址、电话、邮箱占位 | 真实联系信息 |
| `contact.html` 表单 | `data-mailto="contact@zhongdun.example"` | 真实接收邮箱；或填 `data-endpoint` 接入表单服务 |
| 品牌 Logo | 内置 SVG 盾形标记 | 如有官方 logo，替换 `public/favicon.svg` 与各页 `.brand svg` |

> 部署路径变更时，需同步修改 `vite.config.js` 的 `base`（当前为 `/zhongdun-tech-web/`）。

---

## Three.js 场景说明

| 页面 | 场景 | 实现 |
|---|---|---|
| 首页 | 低空防御穹顶 | 双层线框穹顶 + 无人机巡航 + 三区同心环 + 扫描环 |
| DX | 三维电子沙盘 | 线框地形 + 航线 + 飞行器 + 扫描立面 |
| RX | 多智能体协同网络 | 节点群 + 邻接连线 + 脉冲信号 |
| EX | 知识图谱星云 | 中枢 + 六维簇 + 粒子星云 |

工程约束：Three.js 以 `import()` 按需加载（独立 chunk）；DPR 上限 2；滚出视口/页面隐藏即停止渲染；`prefers-reduced-motion` 下只渲染一帧；**Three.js 加载失败自动降级 Canvas 2D**。

---

## 内容来源

产品与公司信息提取自《中盾数智产品宣传册（V1.1-浅色）》。补充性文案（如 RX 四层架构描述、EX 四大核心技术描述）为按上下文撰写的说明文字，建议由业务方校对。
