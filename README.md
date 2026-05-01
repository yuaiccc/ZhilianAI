# 智联招聘 AI创新大赛 · 多Agent会诊面试平台

本项目是为“首届全国AI创新大赛”开发的一款创新求职辅助产品。产品以“求职者(C端)”为核心视角，致力于打破传统的“简历投递无回复、面试反馈全黑盒”的求职困境。

## 🌟 核心亮点与创新模式

1. **真实JD题库驱动**：利用大赛提供的《AI大赛脱敏数据》，求职者可直接挑选真实的岗位进行投递，体验100%还原的招聘要求。
2. **多Agent会诊面试**：摒弃单调的固定流程，由AI动态决策主持人。HR、业务专家(Biz)、成长导师(Growth) 三方Agent交替对求职者进行“高压+专业+鼓励”的沉浸式拷问。
3. **打破面试黑盒 (核心创新)**：面试结束后，首创性地向求职者展示三个评委的“内部讨论合议剧本”，让求职者清晰知道“我是因为什么原因被刷掉/录取的”。
4. **实时好感度进度条**：面试过程不仅流式输出文字，还伴有各方Agent对候选人当前“好感度”的实时跳动反馈。
5. **智能选项回复**：彻底解放双手，大模型会自动预测候选人可能回答的3个方向并生成“快捷回复按钮”，点击即可秒回。

## 🛠 技术架构

- **前端**：原生 HTML/CSS/JS 打造的深色科技风界面 (Glassmorphism)，轻量、流畅。
- **中间层**：Node.js + Express。负责与本地大模型交互，处理流式输出(SSE)、解析 Agent 状态与好感度。
- **大模型**：本地运行的 Ollama (默认采用 `qwen2.5:7b` 模型)。

## 🚀 快速启动

### 前置要求
1. 安装 [Node.js](https://nodejs.org/)。
2. 安装 [Ollama](https://ollama.ai/) 并确保它在后台运行。
3. 拉取大模型：在终端运行 `ollama run qwen2.5:7b`。

### 运行步骤
1. 克隆本项目到本地：
   ```bash
   git clone https://github.com/YOUR_USERNAME/ZhilianAI.git
   cd ZhilianAI
   ```
2. 安装中间层依赖：
   ```bash
   npm install
   ```
3. 启动服务：
   ```bash
   node server.js
   ```
4. 打开浏览器，访问：
   [http://localhost:3005/candidate.html](http://localhost:3005/candidate.html)

## 📁 目录结构说明

- `candidate.html` & `candidate.js` & `styles.css`: C端核心群聊会诊前端代码。
- `server.js`: Node.js 调度层，负责 Prompt 工程与 Ollama 通信。
- `data/jd_database.json`: 从大赛脱敏 Excel 数据中提取的真实岗位库。
- `parse_xlsx.py`: 数据清洗脚本。

## 📄 协议

本项目基于 MIT License 开源，欢迎提交 Issue 和 Pull Request 共同完善。