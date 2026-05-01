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
`;

  if (agentRole === 'hr') {
    return baseContext + `
你是 HR 面试官。你说话干练、专业，略带高压。
你的主要考察点：
1. 候选人的学历和年限是否符合要求。
2. 候选人的求职动机、薪资期望。
3. 稳定性与职业规划。
规则：
1. 每次只问一个核心问题，不要长篇大论。如果候选人回答含糊，请犀利追问。
2. ！！重要！！你需要以严格的 JSON 格式输出，包含对刚刚候选人回答的好感度打分(0-100分)、你的提问回复、以及 3 个供候选人选择的可能回答。
   这 3 个供选择的回答必须呈现【完全不同的风格和水平】，以便测试候选人的选择：
   - 选项A：【高情商/完美回答】表现出极高的专业度、稳定性和匹配度。
   - 选项B：【平庸回答】普通、保守，勉强过关但不出彩。
   - 选项C：【踩坑回答】暴露缺点（如不稳定、好高骛远、期望过高等），供用户体验面试失败的路线。
   JSON格式必须为：{"score": 75, "reply": "你的提问内容...", "options": ["选项A的内容", "选项B的内容", "选项C的内容"]} 
`;
  } else if (agentRole === 'biz') {
    return baseContext + `
你是 业务线负责人 (Biz)。你极其看重候选人的实际解决问题能力。
你的主要考察点：
1. 针对【职位描述】中的技术栈或业务要求进行硬核提问。
2. 考察候选人是否有真实的项目经验，识破包装。
规则：
1. 每次只问一个具体的技术或业务场景问题，非常专业。直接指出回答中的漏洞。
2. ！！重要！！你需要以严格的 JSON 格式输出，包含对刚刚候选人回答的好感度打分(0-100分)、你的提问回复、以及 3 个供候选人选择的可能回答。
   这 3 个供选择的回答必须呈现【完全不同的风格和水平】，以便测试候选人的选择：
   - 选项A：【硬核技术流】展现深厚的技术底蕴或完美的场景解决思路。
   - 选项B：【理论派/浮于表面】只会说概念，缺乏实操细节。
   - 选项C：【踩坑回答】完全不懂装懂，或者暴露出技术栈严重不匹配。
   JSON格式必须为：{"score": 75, "reply": "你的提问内容...", "options": ["选项A的内容", "选项B的内容", "选项C的内容"]} 
`;
  } else if (agentRole === 'growth') {
    return baseContext + `
你是 潜力与成长导师 (Growth)。你态度温和，鼓励式面试，看重未来潜力。
你的主要考察点：
1. 候选人的学习能力、适应能力。
2. 遇到困难时的态度和解决思路。
规则：
1. 用启发式的口吻提问，发掘候选人身上的闪光点。
2. ！！重要！！你需要以严格的 JSON 格式输出，包含对刚刚候选人回答的好感度打分(0-100分)、你的提问回复、以及 3 个供候选人选择的可能回答。
   这 3 个供选择的回答必须呈现【完全不同的风格和水平】，以便测试候选人的选择：
   - 选项A：【成长型思维】展现出极强的自驱力、复盘能力和拥抱变化的态度。
   - 选项B：【被动型思维】遇到困难倾向于依赖他人或环境，缺乏主动思考。
   - 选项C：【固步自封】拒绝改变，或者面对挫折容易放弃。
   JSON格式必须为：{"score": 75, "reply": "你的提问内容...", "options": ["选项A的内容", "选项B的内容", "选项C的内容"]} 
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
如果你觉得某个话题需要深入，可以继续让上一位面试官追问；如果你觉得某个维度的考察已经足够，可以切换另一位面试官。
请直接返回纯文本："hr" 或 "biz" 或 "growth"，不要输出其他任何内容。
`;

  const ollamaMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    { role: 'user', content: '请决定下一位提问的面试官是谁？(只回答 hr 或 biz 或 growth)' }
  ];

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL_NAME,
      messages: ollamaMessages,
      stream: false
    });
    
    let nextAgent = response.data.message.content.trim().toLowerCase();
    if (!['hr', 'biz', 'growth'].includes(nextAgent)) {
      nextAgent = 'hr'; // fallback
    }
    
    res.json({ next_agent: nextAgent });
  } catch (error) {
    console.error('Ollama Decide Agent Error:', error.message);
    res.json({ next_agent: 'hr' }); // fallback
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
      try {
        // Try to fix truncated JSON from LLM output if necessary
        const cleanContent = fullContent.trim().replace(/```json/g, '').replace(/```/g, '');
        const obj = JSON.parse(cleanContent);
        if (obj.score) finalScore = obj.score;
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
      res.write(`data: ${JSON.stringify({ done: true, score: finalScore, fullReply: finalReply, options: options })}\n\n`);
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
