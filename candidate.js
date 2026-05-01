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
  barGrowth: document.getElementById('barGrowth'),
  suggestedOptions: document.getElementById('suggestedOptions'),
  pressureBarContainer: document.getElementById('pressureBarContainer'),
  pressureBar: document.getElementById('pressureBar'),
  headerJdDesc: document.getElementById('headerJdDesc'),
  headerResumeDesc: document.getElementById('headerResumeDesc')
};

let pressureTimer = null;
let pressureSecondsLeft = 30;
let questionStartTime = null;

function startPressureTimer(isPressure) {
  clearInterval(pressureTimer);
  
  if (!isPressure) {
    els.pressureBarContainer.classList.add('hidden');
    return;
  }
  
  pressureSecondsLeft = 30;
  els.pressureBarContainer.classList.remove('hidden');
  els.pressureBar.style.transition = 'none';
  els.pressureBar.style.width = '100%';
  
  // Force reflow
  void els.pressureBar.offsetWidth;
  
  els.pressureBar.style.transition = 'width 1s linear';
  
  pressureTimer = setInterval(() => {
    pressureSecondsLeft--;
    const pct = (pressureSecondsLeft / 30) * 100;
    els.pressureBar.style.width = `${pct}%`;
    
    if (pressureSecondsLeft <= 0) {
      clearInterval(pressureTimer);
      // Time is up! Force a bad response or auto submit
      els.chatInput.value = "（由于思考时间过长，候选人支支吾吾没有回答出来）";
      els.sendBtn.click();
    }
  }, 1000);
}

function stopPressureTimer() {
  clearInterval(pressureTimer);
  els.pressureBarContainer.classList.add('hidden');
}

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
  els.headerJdDesc.textContent = `${selectedJd['薪资']} | ${selectedJd['学历要求']} | ${selectedJd['年限要求']} - ${selectedJd['职位描述'].replace(/\n/g, ' ')}`;
  els.headerResumeDesc.textContent = resumeContext;
  
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
  if (messages.length === 0) return ['hr']; // First question is always HR only

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
    return data.next_agents || ['hr'];
  } catch(e) {
    console.error('Failed to decide next agent', e);
    // fallback to cyclic if LLM fails
    const nextIdx = (currentAgentIndex + 1) % 3;
    return [agentCycle[nextIdx]];
  }
}

async function triggerAgentTurn() {
  const agentRoles = { 'hr': 'HR 面试官', 'biz': '业务专家', 'growth': '成长导师' };
  
  els.progressText.textContent = `等待主持人决策... (${currentTurn}/${MAX_TURNS})`;
  const targetAgents = await getNextAgent();
  
  for (let i = 0; i < targetAgents.length; i++) {
    const targetAgent = targetAgents[i];
    const agentName = agentRoles[targetAgent];
    
    currentAgentIndex = agentCycle.indexOf(targetAgent);
    currentTurn++;
    els.progressText.textContent = `进度: ${currentTurn}/${MAX_TURNS}`;
    
    els.sendBtn.disabled = true;
    els.chatInput.disabled = true;
    els.suggestedOptions.innerHTML = '';
    
    // Stop pressure timer while agent is typing
    stopPressureTimer();

    try {
      let initialGreeting = '';
      if (messages.length === 0 && targetAgent === 'hr') {
        initialGreeting = '你好！我是今天的HR面试官，感谢你来参加本次面试。\n我已经看过了你的简历。';
        appendMessage('agent', initialGreeting, agentName);
      } else {
        appendMessage('agent', '正在思考提问...', agentName);
      }
      
      const lastBubble = els.chatMessages.lastElementChild.querySelector('.msg-bubble');
      
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
      let buffer = ''; 

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); 

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              try {
                const data = JSON.parse(dataStr);
                
                if (data.done) {
                  if (data.score) {
                    const scoreId = targetAgent.charAt(0).toUpperCase() + targetAgent.slice(1);
                    const scoreEl = els['score' + scoreId];
                    const barEl = els['bar' + scoreId];
                    if (scoreEl && barEl) {
                      scoreEl.textContent = data.score;
                      barEl.style.width = data.score + '%';
                    }
                  }
                  
                  let cleanReply = (data.fullReply || "").replace(/^(?:\[?(?:HR 面试官|业务专家|成长导师|HR|Biz|Growth)\]?[:：]\s*)+/gi, '').trim();
                  lastBubble.textContent = cleanReply;
                  
                  // Hide algorithm rationale badge from UI, keep it as black box until report
                  // if (data.score_change !== undefined && data.dimension) {
                  //   ...
                  // }

                  messages.push({ role: 'assistant', content: `[${agentName}]: ${cleanReply}` });
                  
                  // Only show options if it's the LAST agent speaking in this turn
                  if (i === targetAgents.length - 1 && data.options && data.options.length > 0) {
                    data.options.forEach(opt => {
                      const cleanOpt = opt.replace(/^(?:选项[A-C1-3](?:的内容)?[:：\s]*|[A-C1-3]\.[:：\s]*)/i, '').trim();
                      const btn = document.createElement('button');
                      btn.className = 'suggest-btn';
                      btn.textContent = cleanOpt;
                      btn.onclick = () => {
                        els.chatInput.value = cleanOpt;
                        els.sendBtn.click();
                      };
                      els.suggestedOptions.appendChild(btn);
                    });
                  }
                  
                } else if (data.chunk) {
                  currentRawJson += data.chunk;
                  const replyMatch = currentRawJson.match(/"reply"\s*:\s*"([^"]*)/);
                  if (replyMatch) {
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
    }
  }

  els.sendBtn.disabled = false;
  els.chatInput.disabled = false;
  els.chatInput.focus();
  
  // Start pressure timer ONLY if there are multiple agents (pressure interview interruption)
  const isPressure = targetAgents.length > 1;
  startPressureTimer(isPressure);
  
  // Record the time when the user starts thinking
  questionStartTime = Date.now();
}

els.sendBtn.addEventListener('click', () => {
  const text = els.chatInput.value.trim();
  if (!text) return;
  
  let timeTaken = 0;
  if (questionStartTime) {
    timeTaken = Math.round((Date.now() - questionStartTime) / 1000);
  }
  
  // Clear suggested options once user replies
  els.suggestedOptions.innerHTML = '';
  
  appendMessage('user', text);
  // Pass the response time to backend as a hidden dimension
  messages.push({ role: 'user', content: text + `\n(注：候选人本次思考与回答耗时 ${timeTaken} 秒)` });
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