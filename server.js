const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
// Serve static files from the root directory so candidate.html and styles.css can be loaded
app.use(express.static(path.join(__dirname)));

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL_NAME = 'qwen2.5:7b'; // You can change this based on the available model

// Load JD database
const jdDataPath = path.join(__dirname, 'data', 'jd_database.json');
let jdDatabase = [];
if (fs.existsSync(jdDataPath)) {
  jdDatabase = JSON.parse(fs.readFileSync(jdDataPath, 'utf8'));
}

// API: Get random JDs for the candidate to choose from
app.get('/api/jds', (req, res) => {
  // Return 10 random JDs for the UI
  const shuffled = jdDatabase.sort(() => 0.5 - Math.random());
  res.json(shuffled.slice(0, 10));
});

// Helper to get system prompt for a specific agent
function getSystemPrompt(agentRole, jd, resume) {
  const baseContext = `
当前面试的岗位是：【${jd['职位名称']}】
薪资范围：${jd['薪资']}
学历要求：${jd['学历要求']}
年限要求：${jd['年限要求']}
职位描述：${jd['职位描述']}
候选人简历亮点：${resume || '无特定简历亮点'}

请你扮演面试官，遵循以下人设进行提问或追问。
【核心打分隐性维度】：候选人的回复中会附带“(注：候选人本次思考与回答耗时 X 秒)”。请将【回答耗时】作为你打分的重要参考！
- 技术或专业问题耗时过长(>15秒)：说明可能在现查资料，熟练度极差，需适当扣分并在 reason 中指出。
- 常规沟通耗时过长(>15秒)：说明不够自信或在掩饰编造。
- 秒回(<5秒)：说明反应极快、自信或早有准备，可适当加分。
`;

  if (agentRole === 'hr') {
    return baseContext + `
你是 HR 面试官。你说话干练、专业，略带高压。
你的主要考察点：
1. 学历与经验匹配度 (Match)
2. 求职动机与薪资期望 (Motivation)
3. 稳定性与职业规划 (Stability)

规则：
1. 每次只问一个核心问题，不要长篇大论。如果候选人回答含糊，请犀利追问。
2. ！！重要！！你需要以严格的 JSON 格式输出，包含：当前对该候选人的总体好感度打分(0-100分)、本次回答导致的分数变动(如 +5, -10, 0)、考察维度、扣分/加分原因、你的提问回复、以及 3 个供候选人选择的可能回答。
   这 3 个供选择的回答必须【极具迷惑性且都像正常人的回答】。绝对不要出现一眼看出是错的答案（比如“我不知道”、“我忘记了”、“我为了钱”）。
   这 3 个选项应该代表【三种不同的职场价值观或侧重点】，让用户难以抉择：
   - 选项1：侧重【稳定与忠诚】，表达愿意长期深耕，但可能显得缺乏进取心。
   - 选项2：侧重【个人价值与挑战】，表达渴望突破和高回报，但可能让HR觉得不够稳定。
   - 选项3：侧重【工作生活平衡(WLB)】，表达注重效率和团队氛围，但可能显得抗压能力不足。
   JSON格式示例（只输出纯文本内容）：
   {"score": 75, "score_change": -5, "dimension": "稳定性", "reason": "候选人表达了想短期尝试的意愿，稳定性较差", "reply": "请问您对未来的职业规划是怎样的？", "options": ["我希望在这个岗位上稳扎稳打，成为团队的业务骨干", "我期待在两三年内能带团队，承担更核心的架构工作", "我希望能在一个流程规范的团队里高效产出，保持长期健康的工作节奏"]} 
`;
  } else if (agentRole === 'biz') {
    return baseContext + `
你是 业务线负责人 (Biz)。你极其看重候选人的实际解决问题能力。
你的主要考察点：
1. 技术深度与广度 (Tech Depth)
2. 业务场景解决能力 (Problem Solving)
3. 真实项目经验 (Experience)

规则：
1. 每次只问一个具体的技术或业务场景问题，非常专业。直接指出回答中的漏洞。
2. ！！重要！！你需要以严格的 JSON 格式输出，包含：当前对该候选人的总体好感度打分(0-100分)、本次回答导致的分数变动(如 +5, -10, 0)、考察维度、扣分/加分原因、你的提问回复、以及 3 个供候选人选择的可能回答。
   这 3 个供选择的回答必须【极具迷惑性且都像正常人的回答】。绝对不要出现一眼看出是错的答案（比如“我不会”、“我没做过”）。
   这 3 个选项应该代表【三种不同的技术或业务解决思路】，让用户难以抉择：
   - 选项1：侧重【底层原理与技术深度】，回答偏向使用复杂/前沿的技术方案，但可能存在过度设计的风险。
   - 选项2：侧重【业务妥协与快速交付】，回答偏向使用成熟框架快速上线，但可能显得技术追求不足。
   - 选项3：侧重【团队协作与流程规范】，回答偏向通过制定规范和沟通来解决，但可能显得技术细节不够。
   JSON格式示例（只输出纯文本内容）：
   {"score": 75, "score_change": 5, "dimension": "技术深度", "reason": "候选人对底层原理有一定了解，但缺乏大型项目实战支撑", "reply": "那你在实际项目中是如何解决高并发问题的？", "options": ["我们重构了底层架构，引入了 Redis 集群和 Kafka 来做异步削峰", "考虑到业务进度，我们当时优先加了机器扩容，并做了简单的接口限流", "我拉通了运维和产品团队，梳理了非核心链路并做了降级预案"]} 
`;
  } else if (agentRole === 'growth') {
    return baseContext + `
你是 潜力与成长导师 (Growth)。你态度温和，鼓励式面试，看重未来潜力。
你的主要考察点：
1. 学习能力与自驱力 (Learning)
2. 抗压能力与复盘思维 (Resilience)
3. 团队协作意识 (Teamwork)

规则：
1. 用启发式的口吻提问，发掘候选人身上的闪光点。
2. ！！重要！！你需要以严格的 JSON 格式输出，包含：当前对该候选人的总体好感度打分(0-100分)、本次回答导致的分数变动(如 +5, -10, 0)、考察维度、扣分/加分原因、你的提问回复、以及 3 个供候选人选择的可能回答。
   这 3 个供选择的回答必须【极具迷惑性且都像正常人的回答】。绝对不要出现一眼看出是错的答案。
   这 3 个选项应该代表【三种不同的性格特质或应对方式】，让用户难以抉择：
   - 选项1：侧重【极度自律与死磕】，遇到困难会自己熬夜解决，显得有韧性但也可能容易内耗。
   - 选项2：侧重【善用资源与求助】，遇到困难会优先请教前辈或主管，显得沟通好但可能独立性不足。
   - 选项3：侧重【跳出框架思考】，遇到困难会质疑需求本身是否合理，显得有独立思考能力但可能不够听话。
   JSON格式示例（只输出纯文本内容）：
   {"score": 75, "score_change": 0, "dimension": "抗压能力", "reason": "候选人回答中规中矩，暂未看出明显的抗压特质", "reply": "当你遇到一个完全陌生的领域且时间紧迫时，你会怎么入手？", "options": ["我会利用下班时间疯狂查资料，哪怕通宵也要把基础补齐", "我会第一时间找组内有经验的同事请教，用最快的方式拿到解法", "我会先和需求方对齐，看看能不能先交付一个MVP版本，再迭代深挖"]} 
`;
  } else if (agentRole === 'arbitration') {
    return `
你们现在是面试结束后的评委闭门讨论会。
HR面试官、业务负责人(Biz)、成长导师(Growth) 正在讨论刚刚面试的候选人。
请根据刚才的面试记录，模拟这三位评委的激烈讨论过程（大约3-5个回合的对话）。
格式要求：必须以剧本的形式输出，例如：
HR: 我觉得他期望薪资太高了。
Biz: 但是他刚才对xxx的回答很专业，符合我们需求。
Growth: 我同意Biz，他很有潜力。
`;
  }
}

app.post('/api/decide_agent', async (req, res) => {
  const { jd, resume, messages } = req.body;
  
  const systemPrompt = `
当前面试的岗位是：【${jd['职位名称']}】
薪资范围：${jd['薪资']}
职位描述：${jd['职位描述']}

你是这场面试的主持人。面试官有三位：
1. "hr" (HR 面试官，关注学历、年限、求职动机、稳定性)
2. "biz" (业务线负责人，关注技术细节、项目经验解决问题能力)
3. "growth" (潜力与成长导师，关注学习能力、潜力和态度)

请根据以上的聊天记录上下文，判断下一轮由哪位面试官来提问最合适。
！！高阶指令！！如果你觉得候选人刚刚的回答非常有争议，或者同时触及了技术和人品的问题，你可以决定让【两个】面试官同时对他发起“连珠炮”式的压力追问！
请直接返回纯文本，如果是一个人问就返回："hr" 或 "biz" 或 "growth"。
如果是两个人连击插话，请返回逗号分隔的两个名字，例如："hr,biz" 或 "biz,growth" (注意：极少触发，只在需要施加高压时使用)。
不要输出其他任何内容。
`;

  const ollamaMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    { role: 'user', content: '请决定下一位(或两位)提问的面试官是谁？(只返回标识符)' }
  ];

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL_NAME,
      messages: ollamaMessages,
      stream: false
    });
    
    let nextAgentStr = response.data.message.content.trim().toLowerCase();
    
    // Parse possible multiple agents (e.g. "hr,biz" or "biz, growth")
    const agents = nextAgentStr.split(/[,，\s]+/).filter(a => ['hr', 'biz', 'growth'].includes(a));
    
    if (agents.length === 0) {
      res.json({ next_agents: ['hr'] }); // fallback
    } else {
      // Limit to max 2 agents to avoid too much chaos
      res.json({ next_agents: agents.slice(0, 2) });
    }
  } catch (error) {
    console.error('Ollama Decide Agent Error:', error.message);
    res.json({ next_agents: ['hr'] }); // fallback
  }
});

// API: Handle chat
app.post('/api/chat', async (req, res) => {
  const { jd, resume, messages, target_agent } = req.body;
  
  if (!jd || !target_agent) {
    return res.status(400).json({ error: 'Missing jd or target_agent' });
  }

  const systemPrompt = getSystemPrompt(target_agent, jd, resume);
  
  const ollamaMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role, // 'user' or 'assistant'
      content: m.content
    }))
  ];

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL_NAME,
      messages: ollamaMessages,
      format: 'json',
      stream: true // Enable streaming
    }, {
      responseType: 'stream'
    });
    
    // Set headers for SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullContent = '';

    response.data.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message && parsed.message.content) {
            fullContent += parsed.message.content;
            res.write(`data: ${JSON.stringify({ chunk: parsed.message.content })}\n\n`);
          }
        } catch (e) {
          // ignore incomplete json chunk
        }
      }
    });

    response.data.on('end', () => {
      // Stream is done, let's try to parse the full JSON to get score
      let finalScore = 60;
      let finalReply = fullContent;
      let options = [];
      let scoreChange = 0;
      let dimension = '';
      let reason = '';

      try {
        // Try to fix truncated JSON from LLM output if necessary
        const cleanContent = fullContent.trim().replace(/```json/g, '').replace(/```/g, '');
        const obj = JSON.parse(cleanContent);
        if (obj.score) finalScore = obj.score;
        if (obj.score_change !== undefined) scoreChange = obj.score_change;
        if (obj.dimension) dimension = obj.dimension;
        if (obj.reason) reason = obj.reason;
        if (obj.reply) finalReply = obj.reply;
        if (obj.options && Array.isArray(obj.options)) options = obj.options;
      } catch(e) {
        console.error('Failed to parse final JSON:', e.message, fullContent);
        // Fallback naive extraction if JSON.parse fails completely
        const optionsMatch = fullContent.match(/"options"\s*:\s*\[(.*?)\]/s);
        if (optionsMatch) {
          try {
            options = JSON.parse(`[${optionsMatch[1]}]`);
          } catch (err) {}
        }
      }
      res.write(`data: ${JSON.stringify({ 
        done: true, 
        score: finalScore, 
        score_change: scoreChange,
        dimension: dimension,
        reason: reason,
        fullReply: finalReply, 
        options: options 
      })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Ollama Error:', error.message);
    // Fallback if Ollama is not running
    res.status(500).json({ error: 'Failed to communicate with LLM backend. Please ensure Ollama is running with qwen2.5:7b.' });
  }
});

// API: Arbitration (Final Decision)
app.post('/api/arbitration', async (req, res) => {
  const { jd, resume, messages } = req.body;
  
  const systemPrompt = getSystemPrompt('arbitration', jd, resume);
  const ollamaMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    { role: 'user', content: '请开始你们的内部讨论。' }
  ];

  try {
    // 1. Get the discussion transcript
    const discussionRes = await axios.post(OLLAMA_URL, {
      model: MODEL_NAME,
      messages: ollamaMessages,
      stream: false
    });
    const discussion = discussionRes.data.message.content;

    // 2. Get the final structured report
    const reportPrompt = `
基于以上面试记录和讨论，请出具一份给候选人的最终结构化报告。
请直接返回JSON格式，不要输出其他多余文字：
{
  "final_score": 综合评分(0-100),
  "final_recommend": "pass" 或 "review" 或 "reject",
  "action_suggestions": [
    "建议1...",
    "建议2..."
  ]
}
`;
    const reportRes = await axios.post(OLLAMA_URL, {
      model: MODEL_NAME,
      messages: [
        ...ollamaMessages,
        { role: 'assistant', content: discussion },
        { role: 'user', content: reportPrompt }
      ],
      format: 'json',
      stream: false
    });

    let report = {};
    try {
      report = JSON.parse(reportRes.data.message.content);
    } catch(e) {
      console.log('Failed to parse report JSON, using fallback');
      report = { final_score: 80, final_recommend: 'review', action_suggestions: ['请继续努力'] };
    }

    res.json({
      discussion,
      report
    });

  } catch (error) {
    console.error('Ollama Arbitration Error:', error.message);
    res.status(500).json({ error: 'Failed to generate arbitration.' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
