/* 国考刷题本 - 核心逻辑
   数据全部保存在浏览器 localStorage 中（同一设备+同一地址访问时持续有效） */
(function () {
"use strict";

/* ================= 题库整理 ================= */
var PARTS = (window.QB_PARTS || []).slice();
var QMAP = {};          // uid -> {q,opts,a,e,partId,modId,partName,modName,tag}
var ALL_UIDS = [];      // 全部题目 uid（按题库顺序）

function buildIndex(extraParts) {
  var parts = PARTS.concat(extraParts || []);
  QMAP = {}; ALL_UIDS = [];
  parts.forEach(function (p) {
    (p.modules || []).forEach(function (m) {
      (m.questions || []).forEach(function (q, i) {
        var uid = p.id + "-" + m.id + "-" + i;
        QMAP[uid] = {
          q: q.q, opts: q.opts, a: q.a, e: q.e || "",
          partId: p.id, modId: m.id, partName: p.name, modName: m.name,
          tag: p.tag || ""
        };
        ALL_UIDS.push(uid);
      });
    });
  });
  return parts;
}

/* ================= 本地存储 ================= */
var LS_KEY = "gk_shuati_v1";
var S = load();

function load() {
  var def = { answers: {}, wrong: {}, stars: {}, progress: {}, custom: [], last: null };
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return def;
    var o = JSON.parse(raw);
    for (var k in def) if (o[k] === undefined) o[k] = def[k];
    return o;
  } catch (e) { return def; }
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
  catch (e) { toast("保存失败：浏览器存储不可用"); }
}

/* ================= 工具 ================= */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
var toastTimer = null;
function toast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 2200);
}
function letters(i) { return String.fromCharCode(65 + i); }

/* 模块统计 */
function modUids(partId, modId) {
  return ALL_UIDS.filter(function (u) {
    var q = QMAP[u];
    return q.partId === partId && q.modId === modId;
  });
}
function accOf(uids) {
  var done = 0, right = 0;
  uids.forEach(function (u) {
    var r = S.answers[u];
    if (r) { done++; if ((r.c || 0) > 0 && (r.w || 0) === 0) right++; }
  });
  return { done: done, total: uids.length, right: right };
}

/* ================= 首页渲染 ================= */
function renderHome() {
  var parts = buildIndex(loadCustom());

  // 顶部统计
  var totalAnswered = 0, totalRight = 0, wrongN = 0, starN = 0;
  for (var u in S.answers) { totalAnswered++; if ((S.answers[u].c || 0) > 0 && (S.answers[u].w || 0) === 0) totalRight++; }
  wrongN = Object.keys(S.wrong).filter(function (u) { return QMAP[u]; }).length;
  starN = Object.keys(S.stars).filter(function (u) { return QMAP[u]; }).length;
  var acc = totalAnswered ? Math.round(totalRight / totalAnswered * 100) : 0;
  $("hero-stats").innerHTML =
    '<span class="hs-item">已刷<b>' + totalAnswered + '</b>/' + ALL_UIDS.length + '</span>' +
    '<span class="hs-item">正确率<b>' + acc + '%</b></span>' +
    '<span class="hs-item">错题<b>' + wrongN + '</b></span>' +
    '<span class="hs-item">收藏<b>' + starN + '</b></span>';
  $("wrong-count").textContent = wrongN;
  $("star-count").textContent = starN;

  // 继续练习按钮
  $("btn-continue").style.display = S.last ? "" : "none";

  // 分类和模块卡片
  var html = "";
  parts.forEach(function (p) {
    var tagCls = p.tag === "金融知识" ? "tag-jr" : "tag-zy";
    html += '<div class="part-card"><div class="part-head"><h2>' + esc(p.name) + "</h2>" +
      '<span class="part-tag ' + tagCls + '">' + esc(p.tag || "") + "</span></div>" +
      (p.desc ? '<div class="part-desc">' + esc(p.desc) + "</div>" : "") +
      '<div class="mod-grid">';
    (p.modules || []).forEach(function (m) {
      var uids = modUids(p.id, m.id);
      var st = accOf(uids);
      var pct = st.total ? Math.round(st.done / st.total * 100) : 0;
      html += '<div class="mod-card" data-part="' + p.id + '" data-mod="' + m.id + '">' +
        '<div class="mod-name">' + esc(m.name) + "</div>" +
        '<div class="mod-info">共 ' + st.total + " 题 · 已刷 " + st.done +
        (st.done ? " · 对 " + st.right : "") + "</div>" +
        '<div class="mod-bar"><i style="width:' + pct + '%"></i></div></div>';
    });
    html += "</div></div>";
  });
  $("home-list").innerHTML = html;

  Array.prototype.forEach.call(document.querySelectorAll(".mod-card"), function (el) {
    el.addEventListener("click", function () {
      var uids = modUids(el.dataset.part, el.dataset.mod);
      startPractice(uids, QMAP[uids[0]].modName, { type: "module", key: el.dataset.part + "/" + el.dataset.mod });
    });
  });
}

function loadCustom() {
  var out = [];
  (S.custom || []).forEach(function (p) {
    if (p && p.id && p.modules) out.push(p);
  });
  return out;
}

/* ================= 练习流程 ================= */
var session = null;
// session = { list:[uid], idx, mode:{type,key}, answered:{uid:pick}, title }

function startPractice(list, title, mode, startIdx) {
  list = list.filter(function (u) { return QMAP[u]; });
  if (!list.length) { toast("该分类下暂无题目"); return; }
  session = { list: list, idx: Math.min(startIdx || 0, list.length - 1), mode: mode || {}, answered: {}, title: title };
  showPage("practice");
  renderQuestion();
}

function resumeLast() {
  if (!S.last) return;
  var l = S.last;
  if (l.mode.type === "module") {
    var pm = l.mode.key.split("/");
    startPractice(modUids(pm[0], pm[1]), l.title, l.mode, l.idx);
  } else if (l.mode.type === "seq-all") {
    startPractice(ALL_UIDS.slice(), "全部顺序刷", l.mode, l.idx);
  } else if (l.mode.type === "wrong") {
    startPractice(Object.keys(S.wrong), "错题本", l.mode, 0);
  } else if (l.mode.type === "star") {
    startPractice(Object.keys(S.stars), "我的收藏", l.mode, 0);
  } else {
    startPractice(shuffle(ALL_UIDS), "随机刷题", l.mode, 0);
  }
}

function curUid() { return session.list[session.idx]; }

function renderQuestion() {
  var uid = curUid();
  var q = QMAP[uid];
  $("practice-title").textContent = session.title;
  $("q-meta").innerHTML =
    '<span><span class="tag">' + esc(q.tag || q.partName) + "</span> " + esc(q.modName) + "</span>" +
    "<span>" + (session.idx + 1) + " / " + session.list.length + "</span>";
  $("progress-inner").style.width = ((session.idx + 1) / session.list.length * 100) + "%";
  $("q-text").textContent = q.q;

  var pick = session.answered[uid];           // 本次会话已作答
  var hist = S.answers[uid];                  // 历史记录（回看时显示）
  var redo = session.mode.type === "wrong";   // 错题本模式允许重做
  var answered = pick !== undefined || (!!hist && !redo);
  var chosen = pick !== undefined ? pick : (hist ? hist.lastPick : undefined);

  var html = "";
  q.opts.forEach(function (o, i) {
    var cls = "opt";
    if (answered) {
      cls += " locked";
      if (i === q.a) cls += " correct";
      else if (i === chosen) cls += " wrong";
      else cls += " dim";
    }
    html += '<button class="' + cls + '" data-i="' + i + '">' +
      '<span class="letter">' + letters(i) + "</span><span>" + esc(o) + "</span></button>";
  });
  $("q-opts").innerHTML = html;

  var ex = $("q-explain");
  if (answered && chosen !== undefined) {
    var ok = chosen === q.a;
    ex.className = "q-explain " + (ok ? "right" : "wrong");
    ex.innerHTML = "<b>" + (ok ? "✅ 回答正确" : "❌ 回答错误，正确答案：" + letters(q.a)) + "</b>" + esc(q.e);
    ex.classList.remove("hidden");
  } else {
    ex.classList.add("hidden");
  }

  Array.prototype.forEach.call($("q-opts").querySelectorAll(".opt"), function (el) {
    el.addEventListener("click", function () { onPick(parseInt(el.dataset.i, 10)); });
  });

  $("btn-prev").disabled = session.idx === 0;
  $("btn-next").disabled = session.idx >= session.list.length - 1;
  updateStarBtn();

  // 记忆进度（顺序类模式）
  if (session.mode.type === "module" || session.mode.type === "seq-all") {
    S.progress[session.mode.type === "module" ? session.mode.key : "__all"] = session.idx;
  }
  S.last = { title: session.title, idx: session.idx, mode: session.mode };
  save();
}

function onPick(i) {
  var uid = curUid();
  var q = QMAP[uid];
  if (session.answered[uid] !== undefined) return;   // 本题已答，锁定
  var hist = S.answers[uid];
  if (hist && session.mode.type !== "wrong") return; // 历史已答过：练习模式只显示记录，不重复计分

  session.answered[uid] = i;
  var ok = i === q.a;
  if (!S.answers[uid]) S.answers[uid] = { c: 0, w: 0 };
  if (ok) S.answers[uid].c++; else S.answers[uid].w++;
  S.answers[uid].lastPick = i;

  if (!ok) {
    S.wrong[uid] = { t: Date.now(), n: (S.wrong[uid] ? S.wrong[uid].n + 1 : 1) };
  } else if (session.mode.type === "wrong" && S.wrong[uid]) {
    // 错题本模式答对 → 移出错题本
    delete S.wrong[uid];
    toast("🎉 已答对，该题移出错题本");
  }
  save();
  renderQuestion();
}

function updateStarBtn() {
  var on = !!S.stars[curUid()];
  var b = $("btn-star-toggle");
  b.textContent = on ? "★ 已收藏" : "☆ 收藏";
  b.classList.toggle("on", on);
}

/* ================= 答题卡 ================= */
function renderSheet() {
  var html = "";
  session.list.forEach(function (u, i) {
    var cls = "cell";
    var pick = session.answered[u];
    if (pick === undefined && S.answers[u]) pick = S.answers[u].lastPick;
    if (pick !== undefined) cls += pick === QMAP[u].a ? " right" : " wrong";
    if (i === session.idx) cls += " cur";
    html += '<button class="' + cls + '" data-i="' + i + '">' + (i + 1) + "</button>";
  });
  $("sheet-grid").innerHTML = html;
  Array.prototype.forEach.call($("sheet-grid").querySelectorAll(".cell"), function (el) {
    el.addEventListener("click", function () {
      session.idx = parseInt(el.dataset.i, 10);
      $("sheet-mask").classList.add("hidden");
      renderQuestion();
    });
  });
}

/* ================= 统计页 ================= */
function renderStats() {
  var parts = buildIndex(loadCustom());
  var totalDone = 0, totalAll = ALL_UIDS.length;
  for (var u in S.answers) if (QMAP[u]) totalDone++;
  var rightN = 0, wrongCnt = 0;
  for (var u2 in S.answers) {
    if (!QMAP[u2]) continue;
    var r = S.answers[u2];
    if ((r.c || 0) > 0 && (r.w || 0) === 0) rightN++;
    if ((r.w || 0) > 0) wrongCnt++;
  }
  var acc = totalDone ? Math.round(rightN / totalDone * 100) : 0;

  var html = '<div class="stats-overall">' +
    '<div class="so-item"><div class="num">' + totalDone + "</div><div class=\"lab\">已刷题目 / " + totalAll + "</div></div>" +
    '<div class="so-item"><div class="num">' + acc + "%</div><div class=\"lab\">全对率</div></div>" +
    '<div class="so-item"><div class="num">' + Object.keys(S.wrong).filter(function (u) { return QMAP[u]; }).length + "</div><div class=\"lab\">当前错题</div></div>" +
    '<div class="so-item"><div class="num">' + Object.keys(S.stars).filter(function (u) { return QMAP[u]; }).length + "</div><div class=\"lab\">收藏</div></div>" +
    "</div>";

  html += '<table class="st"><tr><th>模块</th><th>题数</th><th>已刷</th><th>全对率</th></tr>';
  parts.forEach(function (p) {
    (p.modules || []).forEach(function (m) {
      var uids = modUids(p.id, m.id);
      var st = accOf(uids);
      var a = st.done ? Math.round(st.right / st.done * 100) : -1;
      var cls = a < 0 ? "" : a >= 80 ? "acc-good" : a >= 60 ? "acc-mid" : "acc-bad";
      html += "<tr><td>" + esc(m.name) + "</td><td>" + st.total + "</td><td>" + st.done +
        "</td><td class=\"" + cls + '">' + (a < 0 ? "—" : a + "%") + "</td></tr>";
    });
  });
  html += "</table>";
  $("stats-body").innerHTML = html;
}

/* ================= 导入导出 ================= */
function exportData() {
  var data = {
    _type: "gk-shuati-backup",
    _version: 1,
    exportedAt: new Date().toISOString(),
    customParts: S.custom,
    state: { answers: S.answers, wrong: S.wrong, stars: S.stars, progress: S.progress }
  };
  download(JSON.stringify(data, null, 2), "国考刷题本-备份-" + new Date().toISOString().slice(0, 10) + ".json");
  toast("已导出备份文件");
}
function download(text, name) {
  var blob = new Blob([text], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function doImport() {
  var txt = $("import-text").value.trim();
  if (!txt) { toast("请先粘贴 JSON 内容"); return; }
  var obj;
  try { obj = JSON.parse(txt); } catch (e) { toast("JSON 格式错误：" + e.message); return; }

  // 兼容两种格式：备份文件 或 纯题库数组/对象
  var parts = null, state = null;
  if (obj._type === "gk-shuati-backup") { parts = obj.customParts; state = obj.state; }
  else if (Array.isArray(obj)) parts = obj;
  else if (obj.modules) parts = [obj];
  else if (obj.parts) parts = obj.parts;

  if (parts && parts.length) {
    var existIds = {};
    (S.custom || []).forEach(function (p) { existIds[p.id] = 1; });
    parts.forEach(function (p) {
      if (!p || !p.id || !p.modules) return;
      if (existIds[p.id]) p.id = p.id + "-" + Date.now() % 10000;  // 避免冲突
      p.tag = p.tag || "自定义";
      p.name = p.name || "自定义题库";
      S.custom.push(p);
    });
  }
  if (state) {
    ["answers", "wrong", "stars", "progress"].forEach(function (k) {
      if (state[k]) for (var u in state[k]) S[k][u] = state[k][u];
    });
  }
  if (!parts && !state) { toast("未识别到有效数据"); return; }
  save();
  $("import-text").value = "";
  $("import-area").classList.add("hidden");
  renderHome();
  toast("✅ 导入成功");
}
function downloadTemplate() {
  var tpl = [{
    id: "mybank", name: "我的自定义题库", tag: "自定义", desc: "示例：可替换为自己的题目",
    modules: [{
      id: "mod1", name: "示例模块", questions: [
        { q: "示例题目：1+1=？", opts: ["1", "2", "3", "4"], a: 1, e: "a 为正确选项下标（从 0 开始），e 是解析。" }
      ]
    }]
  }];
  download(JSON.stringify(tpl, null, 2), "题库导入模板.json");
}

/* ================= 页面切换与事件绑定 ================= */
function showPage(name) {
  ["home", "practice", "stats"].forEach(function (p) {
    $("page-" + p).classList.toggle("hidden", p !== name);
  });
  window.scrollTo(0, 0);
}

function bind() {
  $("btn-back-home").addEventListener("click", function () { session = null; renderHome(); showPage("home"); });
  $("btn-back-home2").addEventListener("click", function () { renderHome(); showPage("home"); });

  $("btn-continue").addEventListener("click", resumeLast);
  $("btn-seq-all").addEventListener("click", function () {
    var idx = S.progress["__all"] || 0;
    startPractice(ALL_UIDS.slice(), "全部顺序刷", { type: "seq-all" }, idx);
  });
  $("btn-random").addEventListener("click", function () {
    startPractice(shuffle(ALL_UIDS), "随机刷题", { type: "random" }, 0);
  });
  $("btn-wrong").addEventListener("click", function () {
    var list = Object.keys(S.wrong).filter(function (u) { return QMAP[u]; });
    if (!list.length) { toast("太棒了，错题本是空的！"); return; }
    startPractice(list, "错题本", { type: "wrong" }, 0);
  });
  $("btn-star").addEventListener("click", function () {
    var list = Object.keys(S.stars).filter(function (u) { return QMAP[u]; });
    if (!list.length) { toast("还没有收藏题目，练习时点「☆ 收藏」即可"); return; }
    startPractice(list, "我的收藏", { type: "star" }, 0);
  });
  $("btn-stats").addEventListener("click", function () { renderStats(); showPage("stats"); });

  $("btn-prev").addEventListener("click", function () { if (session.idx > 0) { session.idx--; renderQuestion(); } });
  $("btn-next").addEventListener("click", function () {
    if (session.idx < session.list.length - 1) { session.idx++; renderQuestion(); }
    else { toast("已是最后一题 🎉"); renderHome(); showPage("home"); session = null; }
  });
  $("btn-star-toggle").addEventListener("click", function () {
    var uid = curUid();
    if (S.stars[uid]) { delete S.stars[uid]; toast("已取消收藏"); }
    else { S.stars[uid] = { t: Date.now() }; toast("⭐ 已加入收藏"); }
    save(); updateStarBtn();
  });

  $("btn-sheet").addEventListener("click", function () { renderSheet(); $("sheet-mask").classList.remove("hidden"); });
  $("btn-sheet-close").addEventListener("click", function () { $("sheet-mask").classList.add("hidden"); });
  $("sheet-mask").addEventListener("click", function (e) { if (e.target === this) this.classList.add("hidden"); });

  $("btn-export").addEventListener("click", exportData);
  $("btn-import-show").addEventListener("click", function () { $("import-area").classList.toggle("hidden"); });
  $("btn-import-do").addEventListener("click", doImport);
  $("btn-import-tpl").addEventListener("click", downloadTemplate);

  $("btn-clear-wrong").addEventListener("click", function () {
    if (!confirm("确定清空错题本吗？")) return;
    S.wrong = {}; save(); renderStats(); renderHome(); toast("错题本已清空");
  });
  $("btn-clear-all").addEventListener("click", function () {
    if (!confirm("确定清空全部学习记录吗？（答题记录、错题、收藏、进度、自定义题库都会删除，此操作不可恢复）")) return;
    S = { answers: {}, wrong: {}, stars: {}, progress: {}, custom: [], last: null };
    save(); renderStats(); renderHome(); toast("已全部清空");
  });

  // 键盘支持（外接键盘时可用）
  document.addEventListener("keydown", function (e) {
    if (!session || $("page-practice").classList.contains("hidden")) return;
    var k = e.key.toUpperCase();
    if (["A", "B", "C", "D"].indexOf(k) >= 0) onPick(k.charCodeAt(0) - 65);
    else if (e.key === "ArrowLeft") $("btn-prev").click();
    else if (e.key === "ArrowRight") $("btn-next").click();
  });
}

/* ================= 启动 ================= */
buildIndex(loadCustom());
bind();
renderHome();
})();
