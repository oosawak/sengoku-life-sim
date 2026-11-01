"use strict";
/* 奥羽一生録: 月ごとの生涯進行と画面制御。 */

const GAME_CONFIG = {
  monthDurationMs: 240,
  frameDurationMs: 10,
  speeds: [1, 5, 10, 20],
  stats: ["武勇", "知略", "政治", "魅力", "家柄"],
  focuses: {
    "武芸稽古": { stat: "武勇", gain: 0.12, cost: 0.2 },
    "学問": { stat: "知略", gain: 0.12, cost: 0.1 },
    "政務": { stat: "政治", gain: 0.12, cost: 0.1 },
    "人付き合い": { stat: "魅力", gain: 0.12, cost: 0.2 },
    "家の仕事・商い": { stat: null, gain: 0, cost: 0 },
    "休養": { stat: null, gain: 0, cost: 0 },
  },
  // 内部段階は収入計算に使う。出世と人物別の役職名は第2弾。
  ranks: [
    { label: "家中の者", annualIncome: 2 },
    { label: "侍大将", annualIncome: 6 },
    { label: "城主・重臣", annualIncome: 18 },
    { label: "家中筆頭", annualIncome: 36 },
    { label: "大名", annualIncome: 60 },
  ],
  startRankLevel: { "国衆": 0, "家老級": 1, "大名級": 4 },
  startMoney: { "国衆": 4, "家老級": 8, "大名級": 20 },
  growthDiminishing: [{ at: 95, rate: 0.25 }, { at: 80, rate: 0.5 }],
  martialToTactics: { age50: 0.5, age65: 1 },
  aging: { age50: 0.5, age65: 1 },
  eventFrequencies: {
    few: { label: "少ない", monthlyChance: 0.01, annualChance: 0.25 },
    normal: { label: "ふつう", monthlyChance: 0.03, annualChance: 0.55 },
    many: { label: "多い", monthlyChance: 0.06, annualChance: 0.8 },
  },
};

const Engine = {
  ageAt(person, year, month) {
    return year - person.born - (month < (person.birth_month || 1) ? 1 : 0);
  },

  eventMonth(event) {
    return Number.isInteger(event.month) && event.month >= 1 && event.month <= 12 ? event.month : 1;
  },

  pickPerson(people, lastId, rng = Math.random) {
    const weighted = [];
    for (const p of people) {
      const w = RANK_WEIGHTS[p.rank] || 15;
      for (let i = 0; i < w; i++) weighted.push(p);
    }
    if (!weighted.length) return null;
    let picked = weighted[Math.floor(rng() * weighted.length)];
    if (lastId && picked.id === lastId && people.length > 1) {
      picked = weighted[Math.floor(rng() * weighted.length)];
    }
    return picked;
  },

  eventsForPerson(person, events) {
    const birthMonth = person.birth_month || 1;
    return events.filter((event) => {
      const month = this.eventMonth(event);
      if (event.year < person.born || event.year > person.died) return false;
      if (event.who === person.id) {
        return event.year > person.born || month >= birthMonth;
      }
      if (event.who === "common") {
        return (event.houses || []).includes(person.house) &&
          event.year > person.born && event.year < person.died;
      }
      return false;
    }).sort((a, b) => a.year - b.year || this.eventMonth(a) - this.eventMonth(b) ||
      String(a.id).localeCompare(String(b.id)));
  },

  startingRank(person) {
    return GAME_CONFIG.startRankLevel[person.rank] ?? 0;
  },

  createState(person) {
    const rankLevel = this.startingRank(person);
    return {
      year: person.born,
      startYear: person.born,
      month: person.birth_month || 1,
      age: 0,
      stats: Object.fromEntries(GAME_CONFIG.stats.map((key) => [key, Number(person.stats[key]) || 1])),
      initialStats: Object.fromEntries(GAME_CONFIG.stats.map((key) => [key, Number(person.stats[key]) || 1])),
      reputation: 0,
      lifeMod: 0,
      health: 100,
      money: GAME_CONFIG.startMoney[person.rank] ?? 4,
      rankLevel,
      focus: "学問",
      incomeRemainder: 0,
      flags: new Set(),
      history: [],
      dailyCooldowns: {},
      lastDailyCategory: null,
    };
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  applyChoice(state, choice) {
    const effect = choice.effect || {};
    for (const stat of GAME_CONFIG.stats) {
      if (typeof effect[stat] === "number") state.stats[stat] = this.clamp(state.stats[stat] + effect[stat], 1, 100);
    }
    state.reputation += Number(effect["評判"]) || 0;
    state.lifeMod += Number(effect["寿命"]) || 0;
    if (typeof effect["健康"] === "number") state.health = this.clamp(state.health + effect["健康"], 0, 100);
    if (typeof effect["所持金"] === "number") state.money = Math.max(0, Math.round((state.money + effect["所持金"]) * 10) / 10);
    if (choice.flag) state.flags.add(choice.flag);
    return state;
  },

  resolveChoice(state, choice) {
    if (!choice.check) return { ...choice, checkResult: null };
    const check = choice.check;
    const value = Number(state.stats[check.stat]) + (Number(check.modifier) || 0);
    const success = value >= check.difficulty;
    const outcome = success ? check.success : check.failure;
    return {
      ...choice,
      result: outcome.result,
      effect: outcome.effect || {},
      flag: outcome.flag,
      checkResult: { stat: check.stat, value, difficulty: check.difficulty, success },
    };
  },

  rollDailyEvent(events, state, frequency, rng = Math.random) {
    const rules = GAME_CONFIG.eventFrequencies[frequency] || GAME_CONFIG.eventFrequencies.normal;
    let triggered = rng() < rules.monthlyChance;
    if (state.month === 1 && !triggered) triggered = rng() < rules.annualChance;
    if (!triggered) return null;
    const elapsed = (state.year - state.startYear) * 12 + state.month;
    let candidates = events.filter((event) => {
      if (event.age_min != null && state.age < event.age_min) return false;
      if (event.age_max != null && state.age > event.age_max) return false;
      const last = state.dailyCooldowns[event.id];
      return last == null || elapsed - last >= (event.cooldown_months || 0);
    });
    const otherCategory = candidates.filter((event) => event.category !== state.lastDailyCategory);
    if (otherCategory.length) candidates = otherCategory;
    if (!candidates.length) return null;
    const event = candidates[Math.floor(rng() * candidates.length)];
    return { ...event, year: state.year, month: state.month, daily: true };
  },

  completeDailyEvent(state, event) {
    if (!event.daily) return;
    const elapsed = (state.year - state.startYear) * 12 + state.month;
    state.dailyCooldowns[event.id] = elapsed;
    state.lastDailyCategory = event.category;
  },

  monthlyIncome(state) {
    const rank = GAME_CONFIG.ranks[state.rankLevel] || GAME_CONFIG.ranks[0];
    // 0.1貫単位で余りを持ち越し、12か月の合計を年収と一致させる。
    state.incomeRemainder += Math.round(rank.annualIncome * 10);
    const tenths = Math.floor(state.incomeRemainder / 12);
    state.incomeRemainder %= 12;
    state.money = Math.round((state.money + tenths / 10) * 10) / 10;
    return tenths / 10;
  },

  applyFocus(state) {
    const focus = GAME_CONFIG.focuses[state.focus] || GAME_CONFIG.focuses["休養"];
    if (state.focus === "家の仕事・商い") {
      state.money = Math.round((state.money + 0.1) * 10) / 10;
      return { cash: 0.1 };
    }
    if (state.focus === "休養") {
      const before = state.health;
      state.health = this.clamp(state.health + 1, 0, 100);
      return { health: state.health - before };
    }
    if (state.money + 1e-9 < focus.cost) return { skipped: true, cost: focus.cost };
    state.money = Math.round((state.money - focus.cost) * 10) / 10;
    let gain = focus.gain;
    const current = state.stats[focus.stat];
    for (const rule of GAME_CONFIG.growthDiminishing) {
      if (current >= rule.at) { gain *= rule.rate; break; }
    }
    if (state.focus === "武芸稽古") {
      const age = state.age;
      const redirect = age >= 65 ? GAME_CONFIG.martialToTactics.age65 : age >= 50 ? GAME_CONFIG.martialToTactics.age50 : 0;
      const toTactics = Math.min(gain * redirect, Math.max(0, 100 - state.stats["知略"]));
      state.stats["知略"] += toTactics;
      state.stats["武勇"] = this.clamp(state.stats["武勇"] + gain - gain * redirect, 1, 100);
      return { stat: focus.stat, gain: gain - gain * redirect, redirected: toTactics, cost: focus.cost };
    }
    const actualGain = Math.min(gain, 100 - state.stats[focus.stat]);
    state.stats[focus.stat] += actualGain;
    return { stat: focus.stat, gain: actualGain, cost: focus.cost };
  },

  ageOneYear(state) {
    if (state.age < 50) return { loss: 0, transferred: 0 };
    const decline = state.age >= 65 ? GAME_CONFIG.aging.age65 : GAME_CONFIG.aging.age50;
    const actual = Math.min(decline, Math.max(0, state.stats["武勇"] - 1));
    const transferred = Math.min(actual, Math.max(0, 100 - state.stats["知略"]));
    state.stats["武勇"] -= actual;
    state.stats["知略"] += transferred;
    return { loss: actual, transferred };
  },

  processMonth(person, state) {
    if (state.month === 12) { state.month = 1; state.year += 1; }
    else state.month += 1;
    const income = this.monthlyIncome(state);
    state.age = this.ageAt(person, state.year, state.month);
    const focus = this.applyFocus(state);
    let aging = { loss: 0, transferred: 0 };
    const birthday = state.month === (person.birth_month || 1) && state.year > person.born;
    if (birthday) aging = this.ageOneYear(state);
    return { year: state.year, month: state.month, age: state.age, income, focus, birthday, aging };
  },

  effectiveDeath(person, lifeMod) {
    return person.died + (lifeMod || 0);
  },

  evaluateShukugan(person, flags, deathYear) {
    const has = (f) => flags.has(f);
    switch (person.id) {
      case "date-masamune":
        if (deathYear >= 1601 && has("odawara-joined")) return { grade: "宿願成就", reason: "秀吉に従って家を残し、仙台を開くところまで生きた。" };
        if (deathYear >= 1601) return { grade: "あと一歩", reason: "仙台の時代まで生きたが、小田原での判断が宿願の形を曇らせた。" };
        return { grade: "無念", reason: "仙台を開く前に一生が終わった。" };
      case "date-shigezane":
        if (has("returned-to-date")) return { grade: "宿願成就", reason: "一度は離れたが、最後は伊達へ戻った。" };
        if (has("shuppon-not-enemy")) return { grade: "あと一歩", reason: "敵には付かなかった。だが、戻るところまでは至らなかった。" };
        if (has("shuppon-served-other")) return { grade: "無念", reason: "他家に仕え、伊達へ戻る道は閉ざされた。" };
        return { grade: "あと一歩", reason: "出奔の出来事を迎える前に一生が終わったか、別の道を生きた。" };
      case "tendo-yorizumi":
        if (has("tendo-survived") && has("tendo-house-kept")) return { grade: "宿願成就", reason: "城は失ったが、天童の家名は残り、次へつながった。" };
        if (has("tendo-survived")) return { grade: "あと一歩", reason: "生き延びはしたが、家を残す形までは作れなかった。" };
        return { grade: "無念", reason: "天童城とともに、家も絶えてしまった。" };
      case "mogami-yoshiaki":
        if (has("hasedo-held")) return { grade: "宿願成就", reason: "長谷堂を守り抜き、最上は五十七万石の大名家になった。" };
        if (deathYear >= 1614) return { grade: "あと一歩", reason: "最上を大きくはしたが、五十七万石の形までは届かなかった。" };
        return { grade: "無念", reason: "最上を守り切る前に一生が終わった。" };
      case "naoe-kanetsugu":
        if (has("yonezawa-all-retainers")) return { grade: "宿願成就", reason: "減封の後も人を減らさず、上杉の家を米沢へつないだ。" };
        if (has("hasedo-attacked") || has("naoejo-sent")) return { grade: "あと一歩", reason: "上杉のために戦いはしたが、米沢で家を残す形までは作れなかった。" };
        return { grade: "無念", reason: "上杉の家を残すところまで至らなかった。" };
      default: return { grade: "あと一歩", reason: "" };
    }
  },

  buildRetsuden(person, history, end) {
    const lines = [`${person.name}（${person.yomi}）列伝`, `${person.born}年、${person.kuni}の${person.house}に生まれる。`, person.intro];
    for (const item of history) lines.push(`${item.year}年${item.month}月「${item.title}」――${item.choiceText}。${item.result}`);
    lines.push(`${end.deathYear}年、${end.deathYear - person.born}歳で没した。史実では${person.died}年まで生きた（${person.died - person.born}歳）ので、今回は${end.diff >= 0 ? `史実より${end.diff}年長く` : `史実より${Math.abs(end.diff)}年短く`}生きた。`);
    lines.push(`宿願「${person.shukugan}」――${end.shukugan.grade}。${end.shukugan.reason}`);
    lines.push(`評判は${end.reputation}で一生を終えた。`);
    lines.push("能力の変化: " + GAME_CONFIG.stats.map((key) => `${key} ${formatDelta(end.stats[key] - end.initialStats[key])}`).join(" ／ "));
    lines.push(`所持金 ${end.money.toFixed(1)}貫`);
    return lines.join("\n");
  },
};

const RANK_WEIGHTS = { "大名級": 10, "家老級": 20, "国衆": 30 };
function formatDelta(value) { return `${value >= 0 ? "+" : ""}${Number(value.toFixed(1))}`; }
function healthLabel(value) { return value >= 70 ? "健やか" : value >= 40 ? "不調" : "重篤"; }

if (typeof module !== "undefined" && module.exports) {
  Engine.GAME_CONFIG = GAME_CONFIG;
  module.exports = Engine;
}

/* ===== ブラウザ画面 ===== */
if (typeof document !== "undefined" && document.getElementById("app")) {
  const COLLECTION_KEY = "sengoku-life-sim-collection-v1";
  const LAST_KEY = "sengoku-life-sim-last-person";
  const SETTINGS_KEY = "ouu-game-settings-v1";
  let DATA = null;
  let person = null;
  let queue = [];
  let queueIndex = 0;
  let state = null;
  let timer = null;
  let speed = 1;
  let paused = false;
  let waitingForChoice = false;
  let accumulator = 0;
  let lastFrameAt = 0;
  let toastTimer = null;
  const $ = (id) => document.getElementById(id);
  const screens = ["screen-title", "screen-birth", "screen-life", "screen-end"];

  function show(id) {
    screens.forEach((screen) => $(screen).classList.toggle("hidden", screen !== id));
    window.scrollTo(0, 0);
  }
  function loadCollection() {
    try { return JSON.parse(localStorage.getItem(COLLECTION_KEY)) || { persons: {}, battles: {} }; }
    catch { return { persons: {}, battles: {} }; }
  }
  function saveCollection(collection) { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { eventFrequency: "normal" }; }
    catch { return { eventFrequency: "normal" }; }
  }
  function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  function renderCollection() {
    const collection = loadCollection();
    const panel = $("collection-panel");
    const names = Object.keys(collection.persons);
    if (!names.length) { panel.innerHTML = "<p>まだ記録はありません。まず一度、生まれてみてください。</p>"; return; }
    const people = names.map((id) => {
      const found = DATA.people.find((item) => item.id === id);
      return `${found ? found.name : id}：${collection.persons[id]}回`;
    });
    const battles = Object.keys(collection.battles).map((id) => `${id}：${collection.battles[id]}回`);
    panel.innerHTML = "<strong>生まれた人物</strong><br>" + people.join("<br>") +
      (battles.length ? "<br><strong>参加した合戦</strong><br>" + battles.join("<br>") : "");
  }

  function renderSettings() {
    const settings = loadSettings();
    $("setting-event-frequency").value = GAME_CONFIG.eventFrequencies[settings.eventFrequency] ? settings.eventFrequency : "normal";
  }

  function rollBirth() {
    person = Engine.pickPerson(DATA.people, localStorage.getItem(LAST_KEY));
    localStorage.setItem(LAST_KEY, person.id);
    const collection = loadCollection();
    collection.persons[person.id] = (collection.persons[person.id] || 0) + 1;
    saveCollection(collection);
    const stats = Object.entries(person.stats).map(([key, value]) =>
      `<div class="stat-row"><span class="label">${key}</span><span class="stat-bar"><i style="width:${value}%"></i></span><span class="val">${value}</span></div>`
    ).join("");
    const birthMonth = person.birth_month || 1;
    $("birth-card").innerHTML = `<h2>${person.name}</h2><div class="yomi">${person.yomi} ／ ${person.alias || ""}</div>
      <p>${person.house} ／ ${person.kuni} ／ ${person.born}年${birthMonth}月生まれ ／ ${person.rank}</p>${stats}
      <p class="birth-origin">誕生月: ${person.birth_month_note || "ゲーム用の仮設定"}</p>
      <div class="shukugan"><span class="cap">宿願</span><br>${person.shukugan}<br><small>${person.shukugan_note || ""}</small></div>
      <p class="birth-intro">${person.intro}</p>`;
    show("screen-birth");
  }

  function startLife() {
    queue = Engine.eventsForPerson(person, DATA.events);
    queueIndex = 0;
    state = Engine.createState(person);
    paused = false; waitingForChoice = false; speed = 1; accumulator = 0;
    document.body.classList.add("life-active");
    $("life-name").textContent = person.name;
    $("life-log").innerHTML = `<p><span class="year">${state.year}年${state.month}月</span> ${person.kuni}に生まれる。0歳。</p>`;
    $("event-box").classList.add("hidden");
    updateMeta(); updateHud(); updateControls();
    show("screen-life");
    startTimer();
  }

  function updateMeta() {
    const rank = GAME_CONFIG.ranks[state.rankLevel] || GAME_CONFIG.ranks[0];
    $("life-meta").textContent = `${state.year}年${state.month}月 ／ ${state.age}歳 ／ ${rank.label} ／ ${person.house}`;
    $("life-historical-death").textContent = `${person.died}年`;
  }

  function updateHud() {
    $("life-stats").innerHTML = GAME_CONFIG.stats.map((key) => {
      const value = state.stats[key];
      const shown = Math.round(value);
      return `<div class="hud-stat"><span>${key}</span><div class="stat-bar"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div><b>${shown}</b></div>`;
    }).join("");
    $("life-reputation").textContent = Math.round(state.reputation);
    $("life-money").textContent = state.money.toFixed(1);
    $("life-health").textContent = healthLabel(state.health);
    $("life-focus").value = state.focus;
  }

  function updateControls() {
    $("btn-pause").textContent = waitingForChoice ? "選択待ち" : paused ? "進める" : "止める";
    $("btn-pause").disabled = waitingForChoice;
    $("btn-speed").textContent = `×${speed}`;
  }

  function startTimer() {
    stopTimer();
    lastFrameAt = performance.now();
    timer = setInterval(frame, GAME_CONFIG.frameDurationMs);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function logLine(html) {
    const item = document.createElement("div");
    item.innerHTML = html;
    const log = $("life-log");
    log.append(item);
    log.scrollTop = log.scrollHeight;
  }
  function showChangeToast(text) {
    const toast = $("change-toast");
    toast.textContent = text;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }
  function monthlyLog(income, focusResult) {
    const date = `${state.year}年${state.month}月`;
    if (income > 0) logLine(`<p class="dim"><span class="year">${date}</span> 年収から${income.toFixed(1)}貫を受け取った。</p>`);
    if (focusResult.skipped) logLine(`<p class="dim"><span class="year">${date}</span> 所持金が足りず、${state.focus}を休んだ。</p>`);
    else if (focusResult.stat && focusResult.gain > 0) {
      const changed = focusResult.redirected > 0 ? `武勇 ${formatDelta(focusResult.gain)} ／ 知略 ${formatDelta(focusResult.redirected)}` : `${focusResult.stat} ${formatDelta(focusResult.gain)}`;
      logLine(`<p class="change-line"><span class="year">${date}</span> ${state.focus}で${changed}。費用 −${focusResult.cost.toFixed(1)}貫</p>`);
    } else if (focusResult.cash) logLine(`<p class="change-line"><span class="year">${date}</span> 家の仕事・商いで所持金 +${focusResult.cash.toFixed(1)}貫。</p>`);
    else if (focusResult.health) logLine(`<p class="change-line"><span class="year">${date}</span> 休養し、健康 +${focusResult.health}。</p>`);
    const changes = [];
    if (income > 0) changes.push(`所持金 +${income.toFixed(1)}貫`);
    if (focusResult.stat && focusResult.gain > 0) changes.push(`${focusResult.stat} +${formatDelta(focusResult.gain)}`);
    if (focusResult.redirected > 0) changes.push(`知略 +${formatDelta(focusResult.redirected)}`);
    if (focusResult.cost > 0) changes.push(`所持金 −${focusResult.cost.toFixed(1)}貫`);
    if (focusResult.cash) changes.push(`所持金 +${focusResult.cash.toFixed(1)}貫`);
    if (focusResult.health) changes.push(`健康 +${focusResult.health}`);
    if (focusResult.skipped) changes.push(`${state.focus}を休み（費用不足）`);
    if (changes.length) showChangeToast(changes.join("　／　"));
  }

  function frame() {
    const now = performance.now();
    if (!paused && state) {
      accumulator += (now - lastFrameAt) * speed;
      let guard = 0;
      while (accumulator >= GAME_CONFIG.monthDurationMs && !paused && guard < 24) {
        accumulator -= GAME_CONFIG.monthDurationMs;
        advanceMonth();
        guard += 1;
      }
    }
    lastFrameAt = now;
  }

  function advanceMonth() {
    const result = Engine.processMonth(person, state);
    monthlyLog(result.income, result.focus);
    if (result.birthday) {
      const agingText = result.aging.loss ? `武勇 ${formatDelta(-result.aging.loss)}、知略 ${formatDelta(result.aging.transferred)}へ経験を移した。` : "誕生日を迎えた。";
      logLine(`<p class="birthday"><span class="year">${state.year}年${state.month}月</span> ${person.name}は${state.age}歳になった。${agingText}</p>`);
      if (result.aging.loss) showChangeToast(`武勇 ${formatDelta(-result.aging.loss)}　／　知略 ${formatDelta(result.aging.transferred)}`);
    }
    updateMeta(); updateHud();
    const next = queue[queueIndex];
    if (next && next.year === state.year && Engine.eventMonth(next) === state.month) {
      queueIndex += 1;
      showEvent(next);
      return;
    }
    const settings = loadSettings();
    const daily = Engine.rollDailyEvent(DATA.daily_events || [], state, settings.eventFrequency);
    if (daily) { showEvent(daily); return; }
    if (state.year >= Engine.effectiveDeath(person, state.lifeMod) && state.month === 12) { finishLife(); return; }
  }

  function formatEffect(effect) {
    if (!effect) return "";
    const labels = { "武勇": "武勇", "知略": "知略", "政治": "政治", "魅力": "魅力", "家柄": "家柄", "評判": "評判", "寿命": "寿命", "健康": "健康", "所持金": "所持金" };
    return Object.entries(effect).filter(([key, value]) => labels[key] && typeof value === "number")
      .map(([key, value]) => `<span class="effect-chip">${labels[key]} ${formatDelta(value)}${key === "所持金" ? "貫" : key === "寿命" ? "年" : ""}</span>`).join("");
  }

  function showEvent(event) {
    paused = true; waitingForChoice = true; accumulator = 0; updateControls();
    const box = $("event-box");
    const month = event.month || Engine.eventMonth(event);
    const kind = event.daily ? `<span class="event-kind">日々の出来事 ／ ${event.category}</span>` : `<span class="event-kind historical">史実の出来事</span>`;
    box.innerHTML = `${kind}<h3>${event.year}年${month}月 ${event.title}（${state.age}歳）</h3><p>${event.body || ""}</p>`;
    for (const choice of event.choices || []) {
      const card = document.createElement("div");
      card.className = "choice-card";
      const title = document.createElement("strong"); title.textContent = choice.text;
      const preview = document.createElement("div"); preview.className = "effect-preview";
      const result = document.createElement("p"); result.className = "choice-result";
      if (choice.check) {
        const resolved = Engine.resolveChoice(state, choice);
        preview.innerHTML = `<span class="check-preview">${choice.check.stat} ${Math.round(resolved.checkResult.value)} ／ 難度 ${choice.check.difficulty} ・${resolved.checkResult.success ? "成功" : "失敗"}</span>${formatEffect(resolved.effect)}`;
        result.textContent = resolved.result;
      } else {
        preview.innerHTML = formatEffect(choice.effect);
        result.textContent = choice.result || "";
      }
      const button = document.createElement("button"); button.className = "primary"; button.textContent = "この道を選ぶ";
      button.addEventListener("click", () => choose(event, choice));
      card.append(title, preview, result, button); box.appendChild(card);
    }
    box.classList.remove("hidden");
    box.scrollTop = 0;
  }

  function choose(event, choice) {
    const resolved = Engine.resolveChoice(state, choice);
    Engine.applyChoice(state, resolved);
    Engine.completeDailyEvent(state, event);
    const month = event.month || Engine.eventMonth(event);
    state.history.push({ year: event.year, month, title: event.title, choiceText: choice.text, result: resolved.result || "" });
    if (event.battle) {
      const collection = loadCollection();
      collection.battles[event.battle] = (collection.battles[event.battle] || 0) + 1;
      saveCollection(collection);
    }
    const checkSummary = resolved.checkResult ? `（${resolved.checkResult.stat} ${Math.round(resolved.checkResult.value)}／難度${resolved.checkResult.difficulty}・${resolved.checkResult.success ? "成功" : "失敗"}）` : "";
    logLine(`<p><span class="year">${event.year}年${month}月</span> <strong>${event.title}</strong>――${choice.text}${checkSummary}。${resolved.result || ""} ${formatEffect(resolved.effect)}</p>`);
    const effectLabels = { "武勇": "武勇", "知略": "知略", "政治": "政治", "魅力": "魅力", "家柄": "家柄", "評判": "評判", "寿命": "寿命", "健康": "健康", "所持金": "所持金" };
    const effectText = Object.entries(resolved.effect || {}).filter(([key, value]) => effectLabels[key] && typeof value === "number")
      .map(([key, value]) => `${effectLabels[key]} ${formatDelta(value)}${key === "所持金" ? "貫" : key === "寿命" ? "年" : ""}`).join("　／　");
    if (effectText) showChangeToast(effectText);
    updateMeta(); updateHud();
    $("event-box").classList.add("hidden");
    if (state.year >= Engine.effectiveDeath(person, state.lifeMod) && state.month === 12) { finishLife(); return; }
    const next = queue[queueIndex];
    if (next && next.year === state.year && Engine.eventMonth(next) === state.month) {
      queueIndex += 1; showEvent(next); return;
    }
    waitingForChoice = false; paused = false; updateControls(); lastFrameAt = performance.now();
  }

  function finishLife() {
    stopTimer(); paused = true;
    document.body.classList.remove("life-active");
    const deathYear = Engine.effectiveDeath(person, state.lifeMod);
    const shukugan = Engine.evaluateShukugan(person, state.flags, deathYear);
    const end = { deathYear, diff: deathYear - person.died, shukugan, reputation: state.reputation,
      stats: state.stats, initialStats: state.initialStats, money: state.money };
    const retsuden = Engine.buildRetsuden(person, state.history, end);
    $("end-summary").innerHTML = `<h2>${person.name}<span class="badge">${shukugan.grade}</span></h2>
      <p>${deathYear}年没 ／ ${Engine.ageAt(person, deathYear, 12)}歳（史実は${person.died}年）</p>
      <p>宿願「${person.shukugan}」<br>${shukugan.reason}</p>
      <p>評判 ${Math.round(state.reputation)} ／ ${state.year}年${state.month}月時点の所持金 ${state.money.toFixed(1)}貫</p>
      <p>健康 ${healthLabel(state.health)} ／ 経験した出来事 ${state.history.length}件</p>
      <div class="end-stats">${GAME_CONFIG.stats.map((key) => `<span>${key}: ${Math.round(state.initialStats[key])} → ${Math.round(state.stats[key])} (${formatDelta(state.stats[key] - state.initialStats[key])})</span>`).join("")}</div>`;
    $("retsuden").textContent = retsuden;
    $("btn-copy").dataset.text = retsuden;
    show("screen-end");
  }

  async function init() {
    const response = await fetch("data.json");
    DATA = await response.json();
    $("btn-born").addEventListener("click", rollBirth);
    $("btn-reroll").addEventListener("click", rollBirth);
    $("btn-start-life").addEventListener("click", startLife);
    $("btn-again").addEventListener("click", rollBirth);
    $("btn-to-title").addEventListener("click", () => { stopTimer(); document.body.classList.remove("life-active"); show("screen-title"); });
    $("btn-collection").addEventListener("click", () => { renderCollection(); $("collection-panel").classList.toggle("hidden"); });
    $("btn-pause").addEventListener("click", () => {
      if (waitingForChoice) return;
      paused = !paused; accumulator = 0; lastFrameAt = performance.now(); updateControls();
    });
    $("btn-speed").addEventListener("click", () => {
      const index = GAME_CONFIG.speeds.indexOf(speed);
      speed = GAME_CONFIG.speeds[(index + 1) % GAME_CONFIG.speeds.length];
      accumulator = 0; updateControls();
    });
    $("life-focus").addEventListener("change", (event) => { state.focus = event.target.value; });
    renderSettings();
    $("setting-event-frequency").addEventListener("change", (event) => {
      const settings = loadSettings(); settings.eventFrequency = event.target.value; saveSettings(settings);
    });
    $("btn-copy").addEventListener("click", async () => {
      const text = $("btn-copy").dataset.text || "";
      try { await navigator.clipboard.writeText(text); $("btn-copy").textContent = "コピーしました"; }
      catch { $("btn-copy").textContent = "コピーできませんでした"; }
      setTimeout(() => { $("btn-copy").textContent = "列伝をコピーする"; }, 2000);
    });
  }
  init();
}
