const ROLE_NAMES = {
  hr: "HR 评委",
  biz: "业务评委",
  growth: "成长评委",
};

const state = {
  raw: null,
  filtered: [],
};

const els = {
  cvFilter: document.getElementById("cvFilter"),
  recFilter: document.getElementById("recFilter"),
  searchInput: document.getElementById("searchInput"),
  minScore: document.getElementById("minScore"),
  minScoreValue: document.getElementById("minScoreValue"),
  fileInput: document.getElementById("fileInput"),
  resetBtn: document.getElementById("resetBtn"),
  pairsCount: document.getElementById("pairsCount"),
  avgScore: document.getElementById("avgScore"),
  passRate: document.getElementById("passRate"),
  spreadAvg: document.getElementById("spreadAvg"),
  distBars: document.getElementById("distBars"),
  resultsGrid: document.getElementById("resultsGrid"),
  resultHint: document.getElementById("resultHint"),
  drawer: document.getElementById("detailDrawer"),
  closeDrawer: document.getElementById("closeDrawer"),
  drawerContent: document.getElementById("drawerContent"),
  roleTemplate: document.getElementById("roleTemplate"),
};

init();

async function init() {
  bindEvents();
  try {
    if (window.__OLLAMA_RESULT__ && Array.isArray(window.__OLLAMA_RESULT__.details)) {
      loadData(window.__OLLAMA_RESULT__);
      return;
    }
    const resp = await fetch("./data/ollama_multi_judge_result.json");
    const data = await resp.json();
    loadData(data);
  } catch (err) {
    renderError(`默认数据加载失败：${err.message}`);
  }
}

function bindEvents() {
  els.cvFilter.addEventListener("change", applyFilters);
  els.recFilter.addEventListener("change", applyFilters);
  els.searchInput.addEventListener("input", applyFilters);
  els.minScore.addEventListener("input", () => {
    els.minScoreValue.textContent = els.minScore.value;
    applyFilters();
  });
  els.fileInput.addEventListener("change", onFileInput);
  els.resetBtn.addEventListener("click", resetFilters);
  els.closeDrawer.addEventListener("click", closeDrawer);
  els.drawer.addEventListener("click", (e) => {
    if (e.target === els.drawer) closeDrawer();
  });
}

function onFileInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      loadData(json);
      resetFilters();
    } catch (err) {
      alert(`JSON 读取失败：${err.message}`);
    }
  };
  reader.readAsText(file, "utf-8");
}

function loadData(data) {
  if (!data || !Array.isArray(data.details)) {
    throw new Error("数据结构非法，需要包含 details 数组");
  }
  state.raw = data;
  populateCvFilter();
  applyFilters();
}

function populateCvFilter() {
  const names = Array.from(new Set(state.raw.details.map((d) => d.cv_name))).sort();
  els.cvFilter.innerHTML = `<option value="all">全部候选人</option>${names
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;
}

function resetFilters() {
  els.cvFilter.value = "all";
  els.recFilter.value = "all";
  els.searchInput.value = "";
  els.minScore.value = "0";
  els.minScoreValue.textContent = "0";
  applyFilters();
}

function applyFilters() {
  if (!state.raw) return;
  const cv = els.cvFilter.value;
  const rec = els.recFilter.value;
  const kw = els.searchInput.value.trim().toLowerCase();
  const minScore = Number(els.minScore.value);

  state.filtered = state.raw.details.filter((d) => {
    const final = d.arbitration || {};
    const score = Number(final.final_score ?? 0);
    const candidateOk = cv === "all" || d.cv_name === cv;
    const recOk = rec === "all" || final.final_recommend === rec;
    const searchField = `${d.jd_title || ""} ${d.jd_category || ""}`.toLowerCase();
    const kwOk = !kw || searchField.includes(kw);
    const scoreOk = score >= minScore;
    return candidateOk && recOk && kwOk && scoreOk;
  });

  renderSummary(state.filtered, state.raw.details.length);
  renderDistribution(state.filtered);
  renderCards(state.filtered);
}

function renderSummary(list, totalCount) {
  const scores = list.map((d) => Number(d.arbitration?.final_score ?? 0));
  const passCount = list.filter((d) => d.arbitration?.final_recommend === "pass").length;
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const spreadValues = list.map((d) => calcSpread(d.roles));
  const avgSpread = spreadValues.length ? spreadValues.reduce((a, b) => a + b, 0) / spreadValues.length : 0;

  els.pairsCount.textContent = list.length;
  els.avgScore.textContent = avgScore.toFixed(1);
  els.passRate.textContent = `${list.length ? ((passCount / list.length) * 100).toFixed(0) : 0}%`;
  els.spreadAvg.textContent = avgSpread.toFixed(1);
  els.resultHint.textContent = `当前展示 ${list.length} / ${totalCount} 条配对`;
}

function renderDistribution(list) {
  const counts = {
    pass: 0,
    review: 0,
    reject: 0,
  };
  list.forEach((d) => {
    const k = d.arbitration?.final_recommend;
    if (counts[k] !== undefined) counts[k] += 1;
  });
  const max = Math.max(1, ...Object.values(counts));
  els.distBars.innerHTML = Object.entries(counts)
    .map(([k, v]) => {
      const width = (v / max) * 100;
      return `
        <div class="dist-item">
          <strong>${k}</strong>
          <div class="dist-track"><span class="dist-fill ${k}" style="width:${width}%"></span></div>
          <span>${v}</span>
        </div>
      `;
    })
    .join("");
}

function renderCards(list) {
  if (!list.length) {
    els.resultsGrid.innerHTML = `<div class="empty">当前筛选条件下没有结果，试试放宽筛选。</div>`;
    return;
  }

  els.resultsGrid.innerHTML = list
    .map((d, idx) => {
      const final = d.arbitration || {};
      const score = clamp(Number(final.final_score ?? 0), 0, 100);
      const rec = final.final_recommend || "review";
      const hr = d.roles?.hr?.score ?? "-";
      const biz = d.roles?.biz?.score ?? "-";
      const growth = d.roles?.growth?.score ?? "-";
      return `
        <article class="result-card" data-id="${d.pair_id}" style="animation-delay:${idx * 0.03}s">
          <div class="result-top">
            <div>
              <h3>${escapeHtml(d.cv_name || "未知候选人")}</h3>
              <p class="job-name">${escapeHtml(d.jd_title || "未知岗位")} · ${escapeHtml(
        d.jd_category || "-"
      )}</p>
            </div>
            <span class="tag ${rec}">${rec}</span>
          </div>
          <div class="score-ring ${rec}" style="--score:${score}">
            <strong>${score}</strong>
          </div>
          <div class="mini-roles">
            <span>HR ${hr}</span>
            <span>业务 ${biz}</span>
            <span>成长 ${growth}</span>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".result-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.id);
      const hit = list.find((d) => d.pair_id === id);
      if (hit) openDetail(hit);
    });
  });
}

function openDetail(item) {
  const final = item.arbitration || {};
  const rec = final.final_recommend || "review";
  const score = Number(final.final_score ?? 0);
  const roleKeys = ["hr", "biz", "growth"];

  const roleBlocks = roleKeys
    .map((key) => {
      const role = item.roles?.[key] || {};
      const node = els.roleTemplate.content.cloneNode(true);
      node.querySelector("h4").textContent = ROLE_NAMES[key];
      node.querySelector(".risk-pill").textContent = `risk: ${role.risk || "-"}`;
      node.querySelector(".bar-fill").style.width = `${clamp(Number(role.score ?? 0), 0, 100)}%`;
      node.querySelector(".role-score").textContent = `评分 ${role.score ?? "-"} · ${
        role.pass ? "建议通过" : "建议不通过"
      }`;
      const ul = node.querySelector(".role-reasons");
      (role.reasons || []).slice(0, 3).forEach((r) => {
        const li = document.createElement("li");
        li.textContent = formatEvidence(r);
        ul.appendChild(li);
      });
      return node.firstElementChild.outerHTML;
    })
    .join("");

  els.drawerContent.innerHTML = `
    <h3 class="detail-title">${escapeHtml(item.cv_name || "未知候选人")}</h3>
    <p class="detail-sub">目标岗位：${escapeHtml(item.jd_title || "-")} · ${escapeHtml(item.jd_category || "-")}</p>
    <div class="detail-score">
      <strong>${score}</strong>
      <span class="tag ${rec}">${rec}</span>
    </div>
    <div class="role-grid">${roleBlocks}</div>
    <section class="block">
      <h4>合议理由</h4>
      <ul class="plain-list">
        ${(final.final_reason || []).map((x) => `<li>${escapeHtml(formatEvidence(x))}</li>`).join("")}
      </ul>
    </section>
    <section class="block">
      <h4>行动建议</h4>
      <ul class="plain-list">
        ${(final.action_suggestions || [])
          .map((x) => `<li>${escapeHtml(formatEvidence(x))}</li>`)
          .join("")}
      </ul>
    </section>
  `;

  els.drawer.classList.add("open");
}

function closeDrawer() {
  els.drawer.classList.remove("open");
}

function calcSpread(roles = {}) {
  const scores = ["hr", "biz", "growth"]
    .map((k) => Number(roles?.[k]?.score))
    .filter((v) => Number.isFinite(v));
  if (!scores.length) return 0;
  return Math.max(...scores) - Math.min(...scores);
}

function formatEvidence(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (value.detail) return `${value.type ? `${value.type}：` : ""}${value.detail}`;
    return JSON.stringify(value, null, 0);
  }
  return String(value ?? "");
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderError(message) {
  els.resultsGrid.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}
