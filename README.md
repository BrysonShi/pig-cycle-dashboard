# 生猪行业供需联动数据看板

> 养殖链 × 冻品链 = 周期拐点判断

**在线访问**：https://brysonshi.github.io/pig-cycle-dashboard/

---

## 📋 项目结构

```
pig-cycle-dashboard/
├── index.html                     # 单页应用入口
├── assets/
│   ├── css/style.css              # 样式（暖色调猪周期主题）
│   └── js/
│       ├── dashboard.js          # 主逻辑
│       └── interpretations.js     # 指标解读层数据
├── data/
│   └── latest.json               # 实时数据（CodeAct 脚本更新）
├── .github/
│   └── workflows/
│       └── daily-update.yml      # 每日 GitHub Actions 自动更新
└── README.md
```

---

## 🚀 快速部署（GitHub Pages）

### 方式一：直接推送（推荐）

```bash
# 克隆仓库
git clone https://github.com/BrysonShi/pig-cycle-dashboard.git
cd pig-cycle-dashboard

# 如果是全新空仓库，先添加远程（否则跳过）
# git remote add origin https://github.com/BrysonShi/pig-cycle-dashboard.git

# 推送所有文件
git add .
git commit -m "feat: initial pig cycle dashboard"
git branch -M main
git push -u origin main
```

### 方式二：GitHub Web 上传

1. 打开 https://github.com/BrysonShi/pig-cycle-dashboard
2. 点击 **Add file → Upload files**
3. 拖入所有文件
4. Commit changes

### 启用 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，文件夹 `/ (root)`
4. 点击 **Save**
5. 等待 1-2 分钟，访问 `https://brysonshi.github.io/pig-cycle-dashboard/`

---

## 🔄 数据更新流程

### 当前阶段（开发/测试）

`data/latest.json` 为 **MOCK 数据**，仅供前端调试使用。

```
data/latest.json（MOCK）
    ↓ 手动替换 / CI脚本接入
data/latest.json（真实数据）
```

### 接入 CodeAct 抓取脚本（主 session 会操作）

当 CodeAct 数据抓取脚本完成后，流程如下：

```
CodeAct 抓取脚本
    ↓ 每日生成
data/tracking/report_YYYY-MM-DD.json
    ↓ GitHub Actions（daily-update.yml）
    ↓ 或 main session 合并脚本
data/latest.json
    ↓ GitHub Pages 自动更新
前端自动读取新数据
```

详细接入步骤：
1. 将 CodeAct 脚本输出路径对准 `data/tracking/report_*.json`
2. 在 `.github/workflows/daily-update.yml` 中添加调用
3. 合并逻辑：将 `data/tracking/report_latest.json` → `data/latest.json`
4. 测试：手动触发 Actions 确认数据流正确

### 数据格式

`data/latest.json` 必须包含以下字段（详见 `data/latest.json` 示例）：

```json
{
  "update_date": "2026-06-10",
  "update_time": "09:00 CST",
  "data_source": "mock 或 real",
  "breeding_chain": { "indicators": [...] },
  "frozen_chain": { "indicators": [...] },
  "linkage_matrix": { "breeding_direction": "rising", "frozen_direction": "falling" },
  "cycle_position": { "phase": "topping" },
  "alert_level": { "level": "yellow" },
  "action_suggestions": [...]
}
```

---

## 🔔 企微 Webhook 配置

企微机器人推送由 **GitHub Actions 后端调用**，不在前端暴露 URL。

### 配置步骤

1. 在企微群中添加自定义机器人：
   - 群设置 → 智能群助手 → 添加机器人
   - 名称自定义（如"猪周期预警"）
   - 复制 Webhook URL（格式：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=XXXXXX`）

2. 将 Webhook URL 添加到 GitHub Secrets：
   - 仓库 **Settings → Secrets and variables → Actions**
   - New repository secret
   - Name: `WEWORK_WEBHOOK`
   - Value: 粘贴完整 Webhook URL

3. 在 `assets/js/dashboard.js` 中已预留接口：
   ```javascript
   const WEBHOOK_URL = window.WEWORK_WEBHOOK || '';
   ```
   实际推送由 `daily-update.yml` 中的 Actions 脚本完成。

---

## ⏰ GitHub Actions 自动化

`.github/workflows/daily-update.yml` 配置说明：

| 字段 | 说明 |
|------|------|
| 触发时间 | 每日 UTC 01:00（北京时间 09:00）|
| 主要任务 | 调用 CodeAct 抓取脚本，生成 `data/latest.json` |
| Webhook | 红色预警触发时调用企微机器人 |
| 环境变量 | `WEWORK_WEBHOOK` 从 Secrets 读取 |

### 手动触发

在 GitHub 仓库页面：**Actions → Daily Pig Cycle Update → Run workflow**

---

## 📖 各模块说明

| 模块 | 内容 | 数据来源 |
|------|------|----------|
| 预警条 | 红/黄/绿三级预警 + 文案 | `alert_level.level` |
| 养殖链 | 4个指标 + 12周期迷你图 + 📖解读 | `breeding_chain.indicators` |
| 冻品链 | 4个指标 + 迷你图 + 📖解读 | `frozen_chain.indicators` |
| 联动矩阵 | 养殖×冻品 9宫格，点击格子查解读 | `linkage_matrix` |
| 周期位置 | 4阶段标注 + 详细信号数/历史周期 | `cycle_position` |
| 操作建议 | 3条建议 + 深度分析折叠区 | `action_suggestions` |
| 知识库 | 术语解释 + 4维判断框架 | `interpretations.js`（内置）|

---

## 🎨 设计说明

- **配色**：暖色调（生猪橙 #C65D21 / 猪血红 #8B1A1A / 米白背景）
- **响应式**：桌面4列 → 平板2列 → 手机2列，横向滑动友好
- **解读层**：每个指标卡右上角 `?` 按钮弹出详细解读
- **零构建**：纯 CDN 引入，无需 npm / webpack / vite

---

## 🔧 本地调试

```bash
# 方式1：直接浏览器打开
open index.html

# 方式2：本地 HTTP 服务器（避免跨域）
python3 -m http.server 8080
# 访问 http://localhost:8080
```

---

*本项目由 Coze Agent 构建 | 数据截至 2026-06-10（Mock）*
