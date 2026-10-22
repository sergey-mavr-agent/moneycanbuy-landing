// moneycanbuy.fun landing: sound on by default, autoplay fallback, keeps playing while scrolling.
(function () {
  "use strict";
  var video = document.getElementById("promo");
  var sound = document.getElementById("sound");
  var label = sound.querySelector("span");

  function tryPlay() {
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay blocked: poster stays, a tap starts it */ });
  }

  function setSound(on, restart) {
    video.muted = !on;
    if (on && restart) { video.currentTime = 0; } // with sound, start from the typed opening
    sound.setAttribute("aria-pressed", String(on));
    label.textContent = on ? "Sound on" : "Sound";
    sound.classList.toggle("nudge", !on);
  }

  // Sound is on by default. Browsers refuse unmuted autoplay until the visitor interacts with the page,
  // so we try with sound, fall back to muted, and switch sound on at the first tap, click or key press.
  var userChoseMute = false;
  var gestures = ["pointerdown", "touchend", "keydown"];
  function unmuteOnGesture(e) {
    gestures.forEach(function (t) { window.removeEventListener(t, unmuteOnGesture, true); });
    if (userChoseMute || sound.contains(e.target)) return; // the sound button handles itself
    setSound(true, true);
    tryPlay();
  }
  setSound(true, false);
  var first = video.play();
  if (first && first.catch) {
    first.catch(function () {
      setSound(false, false);
      tryPlay();
      gestures.forEach(function (t) { window.addEventListener(t, unmuteOnGesture, true); });
    });
  }

  sound.addEventListener("click", function () {
    var turnOn = video.muted;
    userChoseMute = !turnOn;
    setSound(turnOn, true);
    tryPlay();
  });

  video.addEventListener("click", function () {
    if (video.paused) tryPlay(); else video.pause();
  });

  // keeps playing (and sounding) while the visitor scrolls the page
  tryPlay();
})();

// Dare calculator: bonds, fee and splits as in the deployed TaskVault / desks (see docs: Fees & money flows).
// Simplified path: one disputer, NFT vote decides, no swarm appeal, doer without a $YOLO stake.
(function () {
  "use strict";
  var stage = document.getElementById("calc-stage");
  if (!stage) return;

  var BPS = 10000;
  var P = {
    imdBase: 0.5, doerBondBps: 300, disputeBondBps: 100, // bond = 0.5 IMD + 3% / 1% of the author's reward, in the reward currency
    feeBps: 1000, nftBps: 500, winnerBondBps: 5000       // fee 10% on payout; 5% of it to correct NFT votes; loser's bond 50/50
  };
  var PRICE = { USDC: 1, ETH: 2400, IMD: 5.5, YOLO: 0.001 }; // example $ prices for the slider only
  var MIN = { USDC: 5, ETH: 0.002, IMD: 1, YOLO: 1000 };      // minimum reward per currency
  var ORDER = ["author", "doer", "contract", "disputer", "nft", "treasury"];

  function trim(x, d) { return String(Number(x.toFixed(d))); }
  function units(x, cur) {
    if (cur === "ETH") return trim(x, 5) + " ETH";
    if (cur === "YOLO") return Math.round(x).toLocaleString("en-US") + " YOLO";
    return trim(x, 2) + " " + cur;
  }
  function usdOf(x, cur) { return x * PRICE[cur]; }
  function withUsd(x, cur) { return cur === "USDC" ? units(x, cur) : units(x, cur) + " (~$" + trim(usdOf(x, cur), 2) + ")"; }
  function bond(imd, cur, x) { // two parts: IMD + reward currency; one sum when the reward itself is IMD
    if (cur === "IMD") return units(imd + x, "IMD");
    return units(imd, "IMD") + " + " + units(x, cur);
  }

  function calc(usd, cur, scenario) {
    var R = usd / PRICE[cur];
    var r = {
      cur: cur, R: R,
      doerImd: P.imdBase, doerCur: R * P.doerBondBps / BPS,
      dispImd: P.imdBase, dispCur: R * P.disputeBondBps / BPS,
      fee: R * P.feeBps / BPS
    };
    r.toDoer = R - r.fee;
    if (scenario === "none") {
      r.toTreasury = r.fee;
    } else if (scenario === "doerwin") {
      r.toNft = R * P.nftBps / BPS;
      r.toTreasury = r.fee - r.toNft;
      r.winImd = r.dispImd * P.winnerBondBps / BPS; r.winCur = r.dispCur * P.winnerBondBps / BPS; // half the disputer's bond to the doer
      r.nftImd = r.dispImd - r.winImd; r.nftCur = r.dispCur - r.winCur;                         // other half to the correct NFT votes
    } else { // fake: no payout, no fee
      r.winImd = r.doerImd * P.winnerBondBps / BPS; r.winCur = r.doerCur * P.winnerBondBps / BPS; // half the doer's bond to the disputer
      r.nftImd = r.doerImd - r.winImd; r.nftCur = r.doerCur - r.winCur;
    }
    return r;
  }

  function buildSteps(scenario) {
    var s = [
      { text: "Author locks the reward", from: "author", to: "contract", chip: "reward" },
      { text: "Doer submits proof + bond", from: "doer", to: "contract", chip: "doerBond" }
    ];
    if (scenario === "none") {
      s.push({ text: "24 h, nobody disputes", from: null, to: "contract", chip: null });
      s.push({ text: "Doer paid 90% of the reward", from: "contract", to: "doer", chip: "toDoer" });
      s.push({ text: "10% fee to the treasury", from: "contract", to: "treasury", chip: "toTreasury" });
      s.push({ text: "Doer's bond comes back", from: "contract", to: "doer", chip: "doerBond" });
    } else if (scenario === "doerwin") {
      s.push({ text: "Disputer bonds, challenges the proof", from: "disputer", to: "contract", chip: "dispBond" });
      s.push({ text: "NFT holders vote: doer right", from: null, to: "nft", chip: null });
      s.push({ text: "Doer paid 90% of the reward", from: "contract", to: "doer", chip: "toDoer" });
      s.push({ text: "5% to the NFT voters", from: "contract", to: "nft", chip: "toNft" });
      s.push({ text: "5% to the treasury", from: "contract", to: "treasury", chip: "toTreasury" });
      s.push({ text: "Doer: bond back + half the disputer's", from: "contract", to: "doer", chip: "winBond" });
      s.push({ text: "NFT voters: the other half", from: "contract", to: "nft", chip: "nftBond" });
    } else {
      s.push({ text: "Disputer bonds, challenges the proof", from: "disputer", to: "contract", chip: "dispBond" });
      s.push({ text: "NFT holders vote: fake", from: null, to: "nft", chip: null });
      s.push({ text: "Reward stays, the dare stays open", from: "contract", to: "contract", chip: "stay" });
      s.push({ text: "Disputer: bond back + half the doer's", from: "contract", to: "disputer", chip: "winBond" });
      s.push({ text: "NFT voters: the other half", from: "contract", to: "nft", chip: "nftBond" });
    }
    return s;
  }

  function chipText(key, r) {
    var c = r.cur;
    switch (key) {
      case "reward": return units(r.R, c);
      case "doerBond": return bond(r.doerImd, c, r.doerCur);
      case "dispBond": return bond(r.dispImd, c, r.dispCur);
      case "toDoer": return units(r.toDoer, c);
      case "toTreasury": return units(r.toTreasury, c);
      case "toNft": return units(r.toNft, c);
      case "winBond": return "+ " + bond(r.winImd, c, r.winCur);
      case "nftBond": return bond(r.nftImd, c, r.nftCur);
      case "stay": return "open";
      default: return "";
    }
  }

  // Receipts: Put in / Back in gray (own money), Profit / Loss in color (someone else's money).
  function putIn(t) { return { text: "Put in: " + t, cls: "" }; }
  function backLine(t) { return { text: "Back: " + t, cls: "" }; }
  function profit(t) { return { text: "Profit: " + t, cls: "pos" }; }
  function loss(t) { return { text: "Loss: − " + t, cls: "neg" }; }
  function note(l, t) { return { text: l + ": " + t, cls: "" }; }

  function buildReceipts(scenario, r) {
    var c = r.cur;
    var doerBond = bond(r.doerImd, c, r.doerCur), dispBond = bond(r.dispImd, c, r.dispCur);
    var out = [{ label: "Author", lines: [putIn(withUsd(r.R, c) + " reward"),
      scenario === "fake" ? note("Still locked", "the dare stays open") : note("Got", "the dare done")] }];
    if (scenario === "none") {
      out.push({ label: "Doer", lines: [putIn(doerBond + " bond"), backLine(doerBond), profit(withUsd(r.toDoer, c))] });
      out.push({ label: "Treasury", lines: [profit(withUsd(r.toTreasury, c) + " fee")] });
    } else if (scenario === "doerwin") {
      out.push({ label: "Doer", lines: [putIn(doerBond + " bond"), backLine(doerBond), profit(withUsd(r.toDoer, c) + " + " + bond(r.winImd, c, r.winCur))] });
      out.push({ label: "Disputer", lines: [putIn(dispBond + " bond"), loss(dispBond)] });
      out.push({ label: "NFT voters", lines: [profit(withUsd(r.toNft, c) + " + " + bond(r.nftImd, c, r.nftCur))] });
      out.push({ label: "Treasury", lines: [profit(withUsd(r.toTreasury, c) + " fee")] });
    } else {
      out.push({ label: "Doer", lines: [putIn(doerBond + " bond"), loss(doerBond)] });
      out.push({ label: "Disputer", lines: [putIn(dispBond + " bond"), backLine(dispBond), profit(bond(r.winImd, c, r.winCur))] });
      out.push({ label: "NFT voters", lines: [profit(bond(r.nftImd, c, r.nftCur))] });
    }
    return out;
  }

  // ---- DOM ----
  var amountInput = document.getElementById("calc-amount");
  var slider = document.getElementById("calc-slider");
  var currencySelect = document.getElementById("calc-currency");
  var quickBtns = Array.prototype.slice.call(document.querySelectorAll(".calc-quick button"));
  var unitsLine = document.getElementById("calc-units");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".calc-tab"));
  var playBtn = document.getElementById("calc-play");
  var chip = document.getElementById("calc-chip");
  var chipLabel = document.getElementById("calc-chip-label");
  var stepsList = document.getElementById("calc-steps");
  var dotsBox = document.getElementById("calc-dots");
  var currentLine = document.getElementById("calc-current");
  var receiptsBox = document.getElementById("calc-receipts");
  var personaEls = {};
  ORDER.forEach(function (role) { personaEls[role] = stage.querySelector('.calc-persona[data-role="' + role + '"]'); });

  var state = { usd: 100, currency: "USDC", scenario: "none", stepIndex: 0 };
  var playTimer = null;

  var row = document.getElementById("calc-row");
  var path = document.getElementById("calc-path");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pct(idx) { return (idx + 0.5) / ORDER.length; }
  function dockVar() { // --dock is a calc(); measure it through a probe width
    var probe = document.createElement("i");
    probe.style.cssText = "position:absolute;visibility:hidden;width:var(--dock)";
    row.appendChild(probe);
    var w = probe.getBoundingClientRect().width;
    row.removeChild(probe);
    return w;
  }

  // The coin parks on the track next to a station: dir -1 = its left side, +1 = its right side.
  function coinX(idx, dir) { return row.clientWidth * pct(idx) + dir * dockVar(); }
  function placeCoin(x) {
    chip.style.left = x + "px";
    var w = chipLabel.offsetWidth, W = row.clientWidth;
    var shift = Math.min(Math.max(x - w / 2, 0), W - w) - (x - w / 2); // keep the amount inside the row
    chipLabel.style.transform = "translateX(calc(-50% + " + shift + "px))";
  }
  function lightPath(fromIdx, toIdx) {
    if (fromIdx === toIdx) { path.classList.remove("show"); return; }
    var a = Math.min(fromIdx, toIdx), b = Math.max(fromIdx, toIdx), span = ORDER.length - 1;
    path.style.left = (a / span * 100) + "%";
    path.style.width = ((b - a) / span * 100) + "%";
    path.classList.add("show");
  }

  var holder = { idx: ORDER.indexOf("contract"), dir: -1 };
  function moveCoin(fromRole, toRole, label) {
    var fromIdx = ORDER.indexOf(fromRole), toIdx = ORDER.indexOf(toRole);
    var dir = toIdx > fromIdx ? -1 : toIdx < fromIdx ? 1 : holder.idx === toIdx ? holder.dir : -1;
    chipLabel.textContent = label;
    chip.classList.add("show");
    lightPath(fromIdx, toIdx);
    holder = { idx: toIdx, dir: dir };
    if (fromIdx === toIdx || reduceMotion) { placeCoin(coinX(toIdx, dir)); return; }
    chip.style.transition = "none"; chipLabel.style.transition = "none";
    placeCoin(coinX(fromIdx, -dir)); // start on the sender's side facing the receiver
    void chip.offsetWidth;
    chip.style.transition = ""; chipLabel.style.transition = "";
    placeCoin(coinX(toIdx, dir));
  }
  function parkCoin() { // step without a transfer: the coin waits by whoever holds the money
    chipLabel.textContent = "";
    chip.classList.add("show");
    path.classList.remove("show");
    placeCoin(coinX(holder.idx, holder.dir));
  }

  function render() {
    var r = calc(state.usd, state.currency, state.scenario);
    var steps = buildSteps(state.scenario);
    if (state.stepIndex >= steps.length) state.stepIndex = steps.length - 1;
    var cur = steps[state.stepIndex];

    unitsLine.textContent = "= " + units(r.R, r.cur) + " · min " + units(MIN[r.cur], r.cur);

    var usedRoles = {};
    steps.forEach(function (st) { if (st.from) usedRoles[st.from] = true; if (st.to) usedRoles[st.to] = true; });
    var activeRoles = {};
    if (cur.from) activeRoles[cur.from] = true;
    if (cur.to) activeRoles[cur.to] = true;
    ORDER.forEach(function (role) {
      var el = personaEls[role];
      var used = !!usedRoles[role], active = !!activeRoles[role];
      el.classList.toggle("excluded", !used);
      el.classList.toggle("dim", used && !active);
      el.classList.toggle("active", active);
    });
    if (cur.chip) moveCoin(cur.from, cur.to, chipText(cur.chip, r));
    else { // vote / wait steps: the money sits in the contract
      if (holder.idx !== ORDER.indexOf("contract")) holder = { idx: ORDER.indexOf("contract"), dir: -1 };
      parkCoin();
    }

    stepsList.innerHTML = "";
    steps.forEach(function (st, i) {
      var li = document.createElement("li");
      li.textContent = st.text;
      if (i === state.stepIndex) li.className = "current";
      li.addEventListener("click", function () { stopPlaying(); state.stepIndex = i; render(); });
      stepsList.appendChild(li);
    });

    currentLine.textContent = cur.text;
    dotsBox.innerHTML = "";
    steps.forEach(function (st, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "calc-dot" + (i === state.stepIndex ? " current" : i < state.stepIndex ? " done" : "");
      dot.textContent = String(i + 1);
      dot.setAttribute("aria-label", st.text);
      dot.addEventListener("click", function () { stopPlaying(); state.stepIndex = i; render(); });
      dotsBox.appendChild(dot);
    });

    receiptsBox.innerHTML = "";
    buildReceipts(state.scenario, r).forEach(function (rec) {
      var box = document.createElement("div");
      box.className = "calc-receipt";
      var span = document.createElement("span");
      span.textContent = rec.label;
      box.appendChild(span);
      rec.lines.forEach(function (line) {
        var b = document.createElement("b");
        b.className = line.cls;
        b.textContent = line.text;
        box.appendChild(b);
      });
      receiptsBox.appendChild(box);
    });

    quickBtns.forEach(function (b) { b.classList.toggle("active", +b.getAttribute("data-amt") === state.usd); });
  }

  function stopPlaying() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    playBtn.setAttribute("aria-pressed", "false");
  }

  function startPlaying() {
    stopPlaying();
    state.stepIndex = 0;
    render();
    if (reduceMotion) {
      state.stepIndex = buildSteps(state.scenario).length - 1;
      render();
      return;
    }
    playBtn.setAttribute("aria-pressed", "true");
    playTimer = setInterval(function () {
      if (state.stepIndex >= buildSteps(state.scenario).length - 1) { stopPlaying(); return; }
      state.stepIndex++;
      render();
    }, 1100);
  }

  function minUsd() { return Math.ceil(MIN[state.currency] * PRICE[state.currency]); }
  function setUsd(v) {
    v = Math.round(v);
    if (v < minUsd()) v = minUsd();
    if (v > 1000) v = 1000;
    state.usd = v;
    amountInput.value = v;
    slider.value = v;
    render();
  }

  amountInput.addEventListener("input", function () {
    var v = parseFloat(amountInput.value);
    if (isFinite(v)) setUsd(v);
  });
  slider.addEventListener("input", function () { setUsd(+slider.value); });
  quickBtns.forEach(function (b) { b.addEventListener("click", function () { setUsd(+b.getAttribute("data-amt")); }); });
  currencySelect.addEventListener("change", function () {
    state.currency = currencySelect.value;
    slider.min = amountInput.min = minUsd();
    setUsd(Math.max(state.usd, minUsd()));
  });
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      stopPlaying();
      tabs.forEach(function (b) { b.setAttribute("aria-selected", String(b === btn)); });
      state.scenario = btn.getAttribute("data-scenario");
      state.stepIndex = 0;
      render();
    });
  });
  playBtn.addEventListener("click", function () { if (playTimer) stopPlaying(); else startPlaying(); });

  render();
  window.addEventListener("resize", function () {
    chip.style.transition = "none"; chipLabel.style.transition = "none";
    placeCoin(coinX(holder.idx, holder.dir));
    void chip.offsetWidth;
    chip.style.transition = ""; chipLabel.style.transition = "";
  });

  if ("IntersectionObserver" in window) {
    var played = false;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !played) { played = true; startPlaying(); obs.disconnect(); }
      });
    }, { threshold: 0.5 });
    obs.observe(stage);
  }
})();
