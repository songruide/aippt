# AI PPT 生成器

输入一句主题、粘贴一段长文本，或者上传 PDF / Word / Markdown / TXT 文档，先拿到一份**可修改的大纲**，
确认后再**并发**生成完整页面，在浏览器里直接编辑排版，最后导出**原生可编辑**的 PPTX 文件
（不是一张铺满全页的截图，文字、表格、图表、图片都是能继续改的对象）。

## 技术栈

| 分层 | 选型 |
| --- | --- |
| 前端框架 | Vue 3.5（`<script setup lang="ts">`）+ TypeScript + Vite 8 |
| 前端样式 | Tailwind CSS v4（全局样式，组件内不写 `<style>`） |
| 前端数据层 | vue-router 5、@tanstack/vue-query 5、pinia、ECharts 6、lucide-vue-next |
| 后端框架 | FastAPI + SQLAlchemy 2（async）+ Alembic + Pydantic v2 |
| AI 编排 | LangChain Core + LangGraph（`with_structured_output` 结构化输出 + 自纠环工作流） |
| 异步任务 | ARQ Worker + Redis（任务状态 + pub/sub），SSE 向前端推送进度 |
| 数据存储 | PostgreSQL 16；对象存储支持本地盘 / 腾讯云 COS 双驱动 |
| 文档处理 | python-pptx（导出）、python-docx / pdfplumber / markdown-it-py（解析）、FontTools（字形级溢出检测） |
| 鉴权 | PyJWT + pwdlib[argon2] |
| Java 参考实现 | Spring Boot 3.5.9 + Java 21 + MyBatis-Plus 3.5 + LangChain4j / LangGraph4j |
| 工具链 | uv（Python）、npm + vue-tsc + vitest + oxlint（前端） |

## 目录结构

```
.
├── backend/            FastAPI 后端（Python 3.12+，uv 管理）
│   ├── app/
│   │   ├── api/v1/          REST 路由 + SSE
│   │   ├── domain/          内容 / 布局 / 主题 / flex 排版求解等纯领域逻辑
│   │   ├── workflows/       LangGraph 工作流（大纲、单页生成、AI 局部修改）
│   │   ├── llm/             模型客户端与编辑工具（bind_tools）
│   │   ├── render/          PPTX 渲染与回读验证
│   │   ├── images/          配图管线（生图 / 图库降级 / 校验）
│   │   ├── ingest/          PDF / Word / Markdown / TXT 解析
│   │   ├── worker/          ARQ 任务与重试
│   │   └── services/        业务服务层
│   ├── tests/               pytest（42 个测试文件）
│   └── scripts/             字体下载、回归脚本
├── java_backend/       Spring Boot 3.5 / Java 21 参考实现（与 Python 后端对齐）
├── frontend-vue/       Vue 3 前端（Vite 8 + TS）
│   ├── README.md            前端说明：结构、技术栈、关键状态层、运行与验证
│   ├── CONVENTIONS.md       组件契约与写法规范
│   └── src/
│       ├── pages/           列表页 / 创作页 / 项目详情 / 登录注册
│       ├── features/        auth、projects、outline、deck（编辑器主体）
│       ├── render/          页面渲染（与 PPTX 导出同源）
│       ├── hooks/           SSE 事件流、拖拽排序
│       └── lib/             通用工具（SSE 解析、下载、错误）
├── shared/             前后端物理共享的 JSON 定义
│   ├── layouts/             8 种版式
│   ├── themes/              4 套主题（ivory / midnight / obsidian / scholar）
│   ├── flex-presets/        灵活排布预设
│   └── *-fixtures/          求解器 golden 用例
├── docker-compose.yml         本地基础设施（PostgreSQL + Redis）
├── docker-compose.prod.yml    生产编排（DB + Redis + API + Worker + Nginx）
├── nginx.conf                 生产反代配置
└── Makefile                   常用命令入口
```

## 核心能力

**1）多种输入生成大纲**

支持主题、长文本、文档三种入口。用户可控制页数、排版模式、文字量、语气和目标受众。
模型不会越过用户直接生成页面，而是先产出结构化大纲——标题、页面目标、要点都能改，
也能增删页面、调整顺序，再决定是否开始生成。

**2）异步并发生成**

一份 10 页 PPT 串行调用模型很容易让请求等上一分钟以上。项目把每一页拆成独立任务，
交给 ARQ Worker 并发执行，用 Redis 保存任务状态并传递事件，前端通过 SSE 实时接收进度。
生成过程中已完成的页面可以立即预览，失败页面能单独重试，也可以软取消剩余任务，不必整份重来。

**3）在线编辑**

生成后的内容回到结构化模型里编辑。编辑器左侧是页面缩略图，中间是 16:9 画布，
右侧提供 AI 修改、主题、版式和图片面板。文字可直接编辑；灵活排版页面支持拖动分隔线、
调整内容块尺寸、跨容器移动和更换排布；主题切换后 Web 预览与 PPTX 导出读取同一份主题数据。

**4）导出前质量门禁**

AI 输出的文字长度不可预测，直接导出容易溢出、缺页或整页被渲染成图片。
项目在导出前检查结构、文字占用、数字来源和页面边界，把问题分成 error 与 warning：
error 阻断导出，warning 提醒核对但允许继续。通过检查后用 python-pptx 逐块构造文本框、
表格、图表和图片，再**回读生成的文件**进行验证。

## 快速开始

### 前置条件

- Python >= 3.12、[uv](https://docs.astral.sh/uv/) >= 0.6
- Node.js >= 20
- Docker（跑 PostgreSQL + Redis）
- 一个 DeepSeek API Key（必需，用于生成大纲和页面）

可选：OpenAI 或阿里云百炼的 API Key（用于 AI 生图，不配则走占位图）、
Unsplash Access Key（生图失败时降级到图库检索）。

### 1. 克隆

```bash
git clone https://github.com/songruide/aippt.git
cd aippt
```

### 2. 配置环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，至少填写 LLM_API_KEY
```

> 第一次跑通只需要填 `LLM_API_KEY` 一个值，其余保持默认即可。

### 3. 启动基础设施 + 安装依赖 + 建表

```bash
make up        # 启动 PostgreSQL + Redis 容器
make install   # 后端 uv sync + 前端 npm install
make migrate   # Alembic 迁移，自动建表
```

> Windows 上没有 make，可对照 Makefile 执行完整命令，例如 `make up` = `docker compose up -d`。

### 4. 启动（三个终端）

```bash
make dev-api      # 终端一：API  http://127.0.0.1:39800
make dev-worker   # 终端二：Worker（不启动则生成一直停在 0%）
make dev-web      # 终端三：前端 http://localhost:39174
```

### 5. 下载度量字体（可选）

```bash
make fonts     # Noto Sans / Noto Sans SC，供文字溢出检测使用
```

不下载也能跑，溢出检测会走估算路径，导出前检查会多一条 warning。

### 6. 测试

```bash
make test         # 后端 pytest，不消耗 API 额度
make regression   # 固定语料回归集（需先 make fonts）
make lint         # Ruff 静态检查

cd frontend-vue && npm run test    # 前端 vitest
cd frontend-vue && npm run build   # vue-tsc 类型检查 + 生产构建
```

> `make test` 中走接口与数据库的用例需要 PostgreSQL / Redis 已启动（即先执行 `make up`）；
> 纯领域逻辑用例（渲染、排版求解、文档解析、质量检查等）不依赖数据库，可直接跑。

### 7. Java 参考实现（可选）

`java_backend/` 是与 Python 后端接口对齐的 Spring Boot 实现，共用同一套 PostgreSQL / Redis
与 `shared/` 下的布局主题定义。

前置：**JDK 21** 与 Maven（仓库未附带 Maven Wrapper，需自行安装）。

```bash
make dev-java-api      # Java API（会先执行 Alembic 迁移）
make dev-java-worker   # Java Worker
```

它与 Python 后端监听同一端口（`39800`），同一时间只启动其中一套即可。

## 部署

仓库提供了 `docker-compose.prod.yml` + `backend/Dockerfile` + `nginx.conf`，
可在任意装了 Docker 的服务器上一键拉起 PostgreSQL + Redis + API + Worker + Nginx 五个容器。

```bash
cp backend/.env.example backend/.env
# 生产必改：APP_ENV=production、LLM_API_KEY、JWT_SECRET（openssl rand -hex 32）

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm api uv run alembic upgrade head
```

安全组放开 39880 端口后，浏览器打开 `http://你的公网IP:39880` 即可。

## 接口类型同源

前端调用的 TypeScript 类型由后端 OpenAPI 直接生成，两端不会各写一份而分叉：

```bash
make gen-api   # 导出 backend 的 OpenAPI schema → frontend-vue/src/api/schema.d.ts
```

## 开发约定

- **内容 / 布局 / 主题三分离**：`shared/` 下的 JSON 前后端物理共享，Web 预览与 PPTX 导出同源渲染。
- **前端样式统一走全局 Tailwind**，组件内不写 `<style>` 块；组件契约与写法细则见
  [`frontend-vue/CONVENTIONS.md`](./frontend-vue/CONVENTIONS.md)。
- **后端行宽 100**（Ruff 配置），提交前跑 `make lint`。
- 端口约定：API `39800`、前端 dev `39174`、PostgreSQL `39432`、Redis `39379`、生产 Nginx `39880`。
