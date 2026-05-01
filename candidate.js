let jds = [];
let selectedJd = null;
let resumeContext = '';
let messages = []; // Chat history: { role: 'user' | 'assistant', content: '' }
const agentCycle = ['hr', 'biz', 'growth'];
let currentAgentIndex = 0;
const MAX_TURNS = 6; // 设置最大提问轮次
let currentTurn = 0;

const els = {
  jdSelect: document.getElementById('jdSelect'),
  resumeInput: document.getElementById('resumeInput'),
  startBtn: document.getElementById('startBtn'),
  setupScreen: document.getElementById('setupScreen'),
  chatScreen: document.getElementById('chatScreen'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  endInterviewBtn: document.getElementById('endInterviewBtn'),
  reportScreen: document.getElementById('reportScreen'),
  arbitrationLog: document.getElementById('arbitrationLog'),
  finalScore: document.getElementById('finalScore'),
  finalRecommend: document.getElementById('finalRecommend'),
  actionSuggestions: document.getElementById('actionSuggestions'),
  currentJdTitle: document.getElementById('currentJdTitle'),
  progressText: document.getElementById('progressText'),
  loadingStatus: document.getElementById('loadingStatus'),
  scoreHr: document.getElementById('scoreHr'),
  barHr: document.getElementById('barHr'),
  scoreBiz: document.getElementById('scoreBiz'),
  barBiz: document.getElementById('barBiz'),
  scoreGrowth: document.getElementById('scoreGrowth'),
  barGrowth: document.getElementById('barGrowth')
};

async function init() {
  els.loadingStatus?.classList.remove('hidden');
  try {
    const res = await fetch('http://localhost:3005/api/jds');
    jds = await res.json();
    
    els.jdSelect.innerHTML = '<option value="">请选择你要面试的真实岗位</option>' + 
      jds.map((jd, idx) => `<option value="${idx}">【${jd['职位名称']}】 ${jd['公司名称']} - ${jd['薪资']}</option>`).join('');
    els.loadingStatus?.classList.add('hidden');
  } catch (err) {
    els.jdSelect.innerHTML = '<option value="">岗位加载失败，请确保本地 server.js 已启动</option>';
    if (els.loadingStatus) els.loadingStatus.textContent = '加载失败：请检查 Node 服务是否在端口 3005 运行。';
  }
}

els.startBtn.addEventListener('click', () => {
  const idx = els.jdSelect.value;
  if (idx === '') return alert('请先选择一个岗位');
  
  selectedJd = jds[idx];
  resumeContext = els.resumeInput.value.trim() || '无特定亮点';
  
  els.setupScreen.classList.add('hidden');
  els.chatScreen.classList.remove('hidden');
  els.currentJdTitle.textContent = `面试岗位: ${selectedJd['职位名称']}`;
  
  // Trigger first question
  triggerAgentTurn();
});

function appendMessage(role, text, agentName = '') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  
  let header = '';
  if (role === 'agent') {
    const colorMap = { 'HR 面试官': 'var(--warm)', '业务专家': 'var(--brand)', '成长导师': 'var(--pass)' };
    const color = colorMap[agentName] || '#333';
    header = `<div class="msg-name" style="color: ${color};">${agentName}</div>`;
  } else {
    header = `<div class="msg-name">候选人 (你)</div>`;
  }

  msgDiv.innerHTML = `
    ${header}
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;
  els.chatMessages.appendChild(msgDiv);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

async function getNextAgent() {
  if (messages.length === 0) return 'hr'; // First question is always HR

  try {
    const res = await fetch('http://localhost:3005/api/decide_agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: selectedJd,
        resume: resumeContext,
        messages: messages
      })
    });
    const data = await res.json();
    return data.next_agent || 'hr';
  } catch(e) {
    console.error('Failed to decide next agent', e);
    // fallback to cyclic if LLM fails
    const nextIdx = (currentAgentIndex + 1) % 3;
    return agentCycle[nextIdx];
  }
}

async function triggerAgentTurn() {
  const agentRoles = { 'hr': 'HR 面试官', 'biz': '业务专家', 'growth': '成长导师' };
  
  // Dynamically decide which agent should ask the next question
  els.progressText.textContent = `等待主持人决策... (${currentTurn}/${MAX_TURNS})`;
  const targetAgent = await getNextAgent();
  const agentName = agentRoles[targetAgent];
  
  currentAgentIndex = agentCycle.indexOf(targetAgent);
  currentTurn++;
  els.progressText.textContent = `进度: ${currentTurn}/${MAX_TURNS}`;
  
  appendMessage('agent', '正在思考提问...', agentName);
  els.sendBtn.disabled = true;
  els.chatInput.disabled = true;

  try {
    els.chatMessages.lastChild.remove();
    
    // Create an empty bubble for streaming
    appendMessage('agent', '', agentName);
    const lastBubble = els.chatMessages.lastElementChild.querySelector('.msg-bubble');
    
    // Using fetch to read the stream
    const res = await fetch('http://localhost:3005/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: selectedJd,
        resume: resumeContext,
        messages: messages,
        target_agent: targetAgent
      })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let currentRawJson = '';

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            try {
              const data = JSON.parse(dataStr);
              
              if (data.done) {
                // Update UI Likeability score
                if (data.score) {
                  const scoreId = targetAgent.charAt(0).toUpperCase() + targetAgent.slice(1);
                  const scoreEl = els['score' + scoreId];
                  const barEl = els['bar' + scoreId];
                  if (scoreEl && barEl) {
                    scoreEl.textContent = data.score;
                    barEl.style.width = data.score + '%';
                  }
                }
                
                // 清理大模型可能自我嵌套的前缀
                let cleanReply = (data.fullReply || "").replace(/^(?:\[?(?:HR 面试官|业务专家|成长导师|HR|Biz|Growth)\]?[:：]\s*)+/gi, '').trim();
                lastBubble.textContent = cleanReply;
                
                // 后端上下文带上角色名
                messages.push({ role: 'assistant', content: `[${agentName}]: ${cleanReply}` });
                
                // Render suggested options if any
                els.suggestedOptions.innerHTML = '';
                if (data.options && data.options.length > 0) {
                  data.options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'suggest-btn';
                    btn.textContent = opt;
                    btn.onclick = () => {
                      els.chatInput.value = opt;
                      els.sendBtn.click();
                    };
                    els.suggestedOptions.appendChild(btn);
                  });
                }
                
              } else if (data.chunk) {
                // To show streaming text smoothly, we just append raw chunk to currentRawJson 
                // and try to parse the "reply" part if possible. 
                // Since Ollama formats as {"score": XX, "reply": "..."} we can do a naive regex extract for live display
                currentRawJson += data.chunk;
                const replyMatch = currentRawJson.match(/"reply"\s*:\s*"([^"]*)/);
                if (replyMatch) {
                  // Replace literal \n with actual newlines
                  lastBubble.textContent = replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
                }
              }
            } catch (e) {
              console.error("Stream parse error", e);
            }
          }
        }
      }
    }
    
  } catch (err) {
    els.chatMessages.lastChild.remove();
    appendMessage('agent', '大模型接口请求失败，请确保本地 Ollama 正在运行。', agentName);
  } finally {
    els.sendBtn.disabled = false;
    els.chatInput.disabled = false;
    els.chatInput.focus();
  }
}

els.sendBtn.addEventListener('click', () => {
  const text = els.chatInput.value.trim();
  if (!text) return;
  
  // Clear suggested options once user replies
  els.suggestedOptions.innerHTML = '';
  
  appendMessage('user', text);
  messages.push({ role: 'user', content: text });
  els.chatInput.value = '';
  
  if (currentTurn >= MAX_TURNS) {
    els.endInterviewBtn.click();
  } else {
    triggerAgentTurn();
  }
});

els.chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') els.sendBtn.click();
});

els.endInterviewBtn.addEventListener('click', async () => {
  if (messages.length === 0) return alert('面试还没开始呢！');
  
  els.chatScreen.classList.add('hidden');
  els.reportScreen.classList.remove('hidden');
  els.reportScreen.scrollIntoView({ behavior: 'smooth' });

  els.arbitrationLog.textContent = '...评委正在激烈讨论中，请稍候...\n(正在调用 Ollama 生成多角色会诊剧本)';
  
  try {
    const res = await fetch('http://localhost:3005/api/arbitration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd: selectedJd,
        resume: resumeContext,
        messages: messages
      })
    });
    const data = await res.json();
    
    // Typewriter effect for the arbitration log
    typewriter(els.arbitrationLog, data.discussion, 20);
    
    els.finalScore.textContent = data.report.final_score || '-';
    
    const rec = data.report.final_recommend || 'review';
    els.finalRecommend.textContent = rec.toUpperCase();
    els.finalRecommend.style.color = rec === 'pass' ? 'var(--pass)' : (rec === 'reject' ? 'var(--reject)' : 'var(--review)');
    
    els.actionSuggestions.innerHTML = (data.report.action_suggestions || [])
      .map(s => `<li style="margin-bottom: 8px;">${escapeHtml(s)}</li>`)
      .join('');
      
  } catch (err) {
    els.arbitrationLog.textContent = '合议生成失败，请检查网络或本地 Ollama 服务。';
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function typewriter(element, text, speed) {
  element.textContent = '';
  let i = 0;
  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      element.scrollTop = element.scrollHeight;
      setTimeout(type, speed);
    }
  }
  type();
}

init();