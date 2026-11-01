"use strict";
/* 奥羽一生録 試作 v0.1 エンジン（旧仮称: 戦国人生シミュレーション）
   純粋な判定ロジック（Engine）と、ブラウザ画面の制御を分けてある。
   Node から Engine だけ読み込んで検証できる。 */

const RANK_WEIGHTS = { "大名級": 10, "家老級": 20, "国衆": 30 };

const Engine = {
  pickPerson(people, lastId, rng = Math.random) {
    const weighted = [];
    for (const p of people) {
      const w = RANK_WEIGHTS[p.rank] || 15;
      for (let i = 0; i < w; i++) weighted.push(p);
    }
    if (!weighted.length) return null;
    let picked = weighted[Math.floor(rng() * weighted.length)];
    // 直前と同じ人物なら1回だけ引き直す
    if (lastId && picked.id === lastId && people.length > 1) {
      picked = weighted[Math.floor(rng() * weighted.length)];
    }
    return picked;
  },

  eventsForPerson(person, events) {
    const list = events.filter((e) => {
      if (e.who === person.id) {
        return e.year >= person.born && e.year <= person.died;
      }
      if (e.who === "common") {
        const houses = e.houses || [];
        // 共通イベントは没年より前の年だけ（没年同年の災害などは月の前後が曖昧なため対象外）
        return houses.includes(person.house) && e.year > person.born && e.year < person.died;
      }
      return false;
    });
    return list.sort((a, b) => a.year - b.year || (a.month || 0) - (b.month || 0) || String(a.id).localeCompare(String(b.id)));
  },

  applyChoice(state, choice) {
    const effect = choice.effect || {};
    state.reputation += effect["評判"] || 0;
    state.lifeMod += effect["寿命"] || 0;
    if (choice.flag) state.flags.add(choice.flag);
    return state;
  },

  effectiveDeath(person, lifeMod) {
    return person.died + (lifeMod || 0);
  },

  evaluateShukugan(person, flags, deathYear) {
    const has = (f) => flags.has(f);
    switch (person.id) {
      case "date-masamune":
        if (deathYear >= 1601 && has("odawara-joined")) {
          return { grade: "宿願成就", reason: "秀吉に従って家を残し、仙台を開くところまで生きた。" };
        }
        if (deathYear >= 1601) {
          return { grade: "あと一歩", reason: "仙台の時代まで生きたが、小田原での判断が宿願の形を曇らせた。" };
        }
        return { grade: "無念", reason: "仙台を開く前に一生が終わった。" };
      case "date-shigezane":
        if (has("returned-to-date")) {
          return { grade: "宿願成就", reason: "一度は離れたが、最後は伊達へ戻った。" };
        }
        if (has("shuppon-not-enemy")) {
          return { grade: "あと一歩", reason: "敵には付かなかった。だが、戻るところまでは至らなかった。" };
        }
        if (has("shuppon-served-other")) {
          return { grade: "無念", reason: "他家に仕え、伊達へ戻る道は閉ざされた。" };
        }
        return { grade: "あと一歩", reason: "出奔の出来事を迎える前に一生が終わったか、別の道を生きた。" };
      case "tendo-yorizumi":
        if (has("tendo-survived") && has("tendo-house-kept")) {
          return { grade: "宿願成就", reason: "城は失ったが、天童の家名は残り、次へつながった。" };
        }
        if (has("tendo-survived")) {
          return { grade: "あと一歩", reason: "生き延びはしたが、家を残す形までは作れなかった。" };
        }
        return { grade: "無念", reason: "天童城とともに、家も絶えてしまった。" };
      case "mogami-yoshiaki":
        if (has("hasedo-held")) {
          return { grade: "宿願成就", reason: "長谷堂を守り抜き、最上は五十七万石の大名家になった。" };
        }
        if (deathYear >= 1614) {
          return { grade: "あと一歩", reason: "最上を大きくはしたが、五十七万石の形までは届かなかった。" };
        }
        return { grade: "無念", reason: "最上を守り切る前に一生が終わった。" };
      case "naoe-kanetsugu":
        if (has("yonezawa-all-retainers")) {
          return { grade: "宿願成就", reason: "減封の後も人を減らさず、上杉の家を米沢へつないだ。" };
        }
        if (has("hasedo-attacked") || has("naoejo-sent")) {
          return { grade: "あと一歩", reason: "上杉のために戦いはしたが、米沢で家を残す形までは作れなかった。" };
        }
        return { grade: "無念", reason: "上杉の家を残すところまで至らなかった。" };
      default:
        return { grade: "あと一歩", reason: "" };
    }
  },

  buildRetsuden(person, history, end) {
    const lines = [];
    lines.push(`${person.name}（${person.yomi}）列伝`);
    lines.push(`${person.born}年、${person.kuni}の${person.house}に生まれる。`);
    lines.push(person.intro);
    for (const h of history) {
      lines.push(`${h.year}年「${h.title}」――${h.choiceText}。${h.result}`);
    }
    lines.push(
      `${end.deathYear}年、${end.deathYear - person.born}歳で没した。史実では${person.died}年まで生きた（${person.died - person.born}歳）ので、今回は${end.diff >= 0 ? "史実より" + end.diff + "年長く" : "史実より" + Math.abs(end.diff) + "年短く"}生きた。`
    );
    lines.push(`宿願「${person.shukugan}」――${end.shukugan.grade}。${end.shukugan.reason}`);
    lines.push(`評判は${end.reputation}で一生を終えた。`);
    return lines.join("\n");
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Engine;
}

/* ===== ブラウザ画面の制御 ===== */
if (typeof document !== "undefined" && document.getElementById("app")) {
  const COLLECTION_KEY = "sengoku-life-sim-collection-v1";
  const LAST_KEY = "sengoku-life-sim-last-person";

  let DATA = null;
  let person = null;
  let queue = [];
  let state = null;
  let timer = null;
  let speed = 1;
  let paused = false;

  const $ = (id) => document.getElementById(id);
  const screens = ["screen-title", "screen-birth", "screen-life", "screen-end"];
  function show(id) {
    screens.forEach((s) => $(s).classList.toggle("hidden", s !== id));
    window.scrollTo(0, 0);
  }

  function loadCollection() {
    try { return JSON.parse(localStorage.getItem(COLLECTION_KEY)) || { persons: {}, battles: {} }; }
    catch { return { persons: {}, battles: {} }; }
  }
  function saveCollection(c) { localStorage.setItem(COLLECTION_KEY, JSON.stringify(c)); }

  function renderCollection() {
    const c = loadCollection();
    const panel = $("collection-panel");
    const names = Object.keys(c.persons);
    if (!names.length) {
      panel.innerHTML = "<p>まだ記録はありません。まず一度、生まれてみてください。</p>";
      return;
    }
    const personLines = names.map((id) => {
      const p = DATA.people.find((x) => x.id === id);
      return `${p ? p.name : id}：${c.persons[id]}回`;
    });
    const battleLines = Object.keys(c.battles).map((b) => `${b}：${c.battles[b]}回`);
    panel.innerHTML =
      "<strong>生まれた人物</strong><br>" + personLines.join("<br>") +
      (battleLines.length ? "<br><strong>参加した合戦</strong><br>" + battleLines.join("<br>") : "");
  }

  function rollBirth() {
    const lastId = localStorage.getItem(LAST_KEY);
    person = Engine.pickPerson(DATA.people, lastId);
    localStorage.setItem(LAST_KEY, person.id);
    const c = loadCollection();
    c.persons[person.id] = (c.persons[person.id] || 0) + 1;
    saveCollection(c);

    const stats = Object.entries(person.stats).map(([k, v]) =>
      `<div class="stat-row"><span class="label">${k}</span><span class="stat-bar"><i style="width:${v}%"></i></span><span class="val">${v}</span></div>`
    ).join("");
    $("birth-card").innerHTML = `
      <h2>${person.name}</h2>
      <div class="yomi">${person.yomi} ／ ${person.alias || ""}</div>
      <p>${person.house} ／ ${person.kuni} ／ ${person.born}年生まれ ／ ${person.rank}</p>
      ${stats}
      <div class="shukugan"><span class="cap">宿願</span><br>${person.shukugan}<br><small>${person.shukugan_note || ""}</small></div>
      <p style="line-height:1.85">${person.intro}</p>`;
    show("screen-birth");
  }

  function startLife() {
    queue = Engine.eventsForPerson(person, DATA.events).slice();
    state = { year: person.born, reputation: 0, lifeMod: 0, flags: new Set(), history: [] };
    paused = false; speed = 1;
    $("life-name").textContent = person.name;
    $("life-historical-death").textContent = person.died + "年";
    $("life-log").innerHTML = `<p><span class="year">${person.born}年</span> ${person.kuni}に生まれる。0歳。</p>`;
    $("event-box").classList.add("hidden");
    updateMeta();
    show("screen-life");
    startTimer();
  }

  function updateMeta() {
    $("life-meta").textContent = `${state.year}年 ／ ${state.year - person.born}歳 ／ ${person.house}`;
    $("life-reputation").textContent = state.reputation;
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(tick, Math.round(700 / speed));
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }

  function logLine(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    $("life-log").appendChild(div);
  }

  function tick() {
    if (paused) return;
    state.year += 1;
    updateMeta();
    const death = Engine.effectiveDeath(person, state.lifeMod);
    const next = queue[0];
    if (next && state.year >= next.year) {
      queue.shift();
      showEvent(next);
      return;
    }
    if (state.year >= death) { finishLife(); return; }
    if ((state.year - person.born) % 10 === 0) {
      logLine(`<p class="dim"><span class="year">${state.year}年</span> ${state.year - person.born}歳。年が過ぎていく。</p>`);
    }
  }

  function showEvent(event) {
    paused = true;
    const box = $("event-box");
    box.innerHTML = `<h3>${event.year}年 ${event.title}（${event.year - person.born}歳）</h3><p>${event.body || ""}</p>`;
    event.choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = choice.text;
      btn.addEventListener("click", () => choose(event, choice));
      box.appendChild(btn);
    });
    box.classList.remove("hidden");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function choose(event, choice) {
    Engine.applyChoice(state, choice);
    state.history.push({ year: event.year, title: event.title, choiceText: choice.text, result: choice.result });
    if (event.battle) {
      const c = loadCollection();
      c.battles[event.battle] = (c.battles[event.battle] || 0) + 1;
      saveCollection(c);
    }
    logLine(`<p><span class="year">${event.year}年</span> <strong>${event.title}</strong>――${choice.result}</p>`);
    updateMeta();
    $("event-box").classList.add("hidden");
    const death = Engine.effectiveDeath(person, state.lifeMod);
    if (state.year >= death) { finishLife(); return; }
    // 同じ年に次の出来事がある場合は、年を進めずに続けて出す（例: 1600年の直江状と長谷堂）
    const next = queue[0];
    if (next && next.year === state.year) {
      queue.shift();
      showEvent(next);
      return;
    }
    paused = false;
  }

  function finishLife() {
    stopTimer();
    const deathYear = Engine.effectiveDeath(person, state.lifeMod);
    const shukugan = Engine.evaluateShukugan(person, state.flags, deathYear);
    const end = {
      deathYear,
      diff: deathYear - person.died,
      shukugan,
      reputation: state.reputation,
    };
    const retsuden = Engine.buildRetsuden(person, state.history, end);
    $("end-summary").innerHTML = `
      <h2>${person.name}<span class="badge">${shukugan.grade}</span></h2>
      <p>${deathYear}年没 ／ ${deathYear - person.born}歳（史実は${person.died}年・${person.died - person.born}歳）</p>
      <p>宿願「${person.shukugan}」<br>${shukugan.reason}</p>
      <p>評判 ${state.reputation} ／ 経験した出来事 ${state.history.length}件</p>`;
    $("retsuden").textContent = retsuden;
    $("btn-copy").dataset.text = retsuden;
    show("screen-end");
  }

  async function init() {
    const res = await fetch("data.json");
    DATA = await res.json();
    $("btn-born").addEventListener("click", rollBirth);
    $("btn-reroll").addEventListener("click", rollBirth);
    $("btn-start-life").addEventListener("click", startLife);
    $("btn-again").addEventListener("click", rollBirth);
    $("btn-to-title").addEventListener("click", () => show("screen-title"));
    $("btn-collection").addEventListener("click", () => {
      renderCollection();
      $("collection-panel").classList.toggle("hidden");
    });
    $("btn-pause").addEventListener("click", () => {
      paused = !paused;
      $("btn-pause").textContent = paused ? "進める" : "止める";
    });
    $("btn-speed").addEventListener("click", () => {
      speed = speed === 1 ? 3 : 1;
      $("btn-speed").textContent = speed === 1 ? "速くする ×3" : "普通に戻す";
      startTimer();
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
