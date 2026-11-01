/* moneycanbuy.fun landing: live numbers read straight from Ethereum in the browser (no server).
   The dares, rewards and payouts come from the TaskVault contract over public RPC nodes; USD prices from the same
   Uniswap pools the app reads (v3 IMD/USDC, v3 WETH/USDC, v4 $YOLO/IMD). The project's own promo dares are left out. */
(function (root) {
  "use strict";

  var CFG = {
    rpcs: ["https://ethereum-rpc.publicnode.com", "https://gateway.tenderly.co/public/mainnet", "https://eth.drpc.org"],
    logRpcs: ["https://gateway.tenderly.co/public/mainnet", "https://eth.drpc.org", "https://ethereum-rpc.publicnode.com"],
    /* titles, categories and covers of the dares up to a block, copied from their TaskCreated events (they never change);
       only the blocks after it are read from the chain */
    metaFile: "meta.json",
    vault: "0x88c3B0B64e6869C424DAF25ad8eD635180832493",
    /* HiddenList: the site's hide list (the app hides the same dares) */
    hiddenList: "0xf88c5e714802563CE4A380F95Fef5b5204972Fe6",
    fromBlock: 26241860,
    promo: ["0x89da1e0a60cb182039c871ee3413d8ac24438c6a"],
    /* "strict": the project's own dares are left out everywhere. "all": they count in the live line and the payouts,
       and the cards take the own dares that are not shill or on-chain tasks (categories 6, 7). */
    mode: (typeof document !== "undefined" && document.documentElement.getAttribute("data-mode")) || "strict",
    tokens: {
      "0x0000000000000000000000000000000000000000": { sym: "ETH", dec: 18, px: "eth" },
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { sym: "ETH", dec: 18, px: "eth" },
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { sym: "USDC", dec: 6, px: "usd" },
      "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7": { sym: "IMD", dec: 18, px: "imd" },
      "0x49e55a87aa4bb0d2fd58fdcf1a31c9612de015dc": { sym: "YOLO", dec: 18, px: "yolo" }
    },
    imdUsdc: "0x894d4e6d3d2abc64fc0de0e4e2ea63a93bc9c520",
    ethUsdc: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
    yoloPoolId: "0x4cc70b0ebec0b7678e201b2bbe2e1bc2d8b9845c9750fdf01b91e6c9b8fa9b33",
    ipfs: "https://gateway.pinata.cloud/ipfs/",
    tg: "https://t.me/moneycanbuy_fun_bot/app",
    web: "https://moneycanbuyfun.sites.imd.fun"
  };
  var SIG = {
    taskCount: "0xb6cb58a5", getTask: "0x1d65e77e", submissionCount: "0x6ec02be9", getSubmission: "0x3e8686cc",
    paramsOf: "0x2fcd90d2", status: "0xf37a526b", slot0: "0x3850c7bd", getSlot0: "0xc815641c",
    taskCreated: "0xa4a90b65c3163014768d970a729d5232be1a52a05a33b55cbcdf8f404cd4a3d4"
  };
  var Q192 = BigInt(1) << BigInt(192);
  var E18 = BigInt("1000000000000000000");

  /* ---------- JSON-RPC ---------- */
  var seq = 1;
  function post(url, body, ms) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || 12000) : 0;
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, referrerPolicy: "no-referrer", credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }
  function req(method, params) { return { jsonrpc: "2.0", id: seq++, method: method, params: params }; }
  /* the first node that answers wins; each call is tried on the next node on error */
  function rpc(method, params, urls) {
    urls = urls || CFG.rpcs;
    var i = 0;
    function next(err) {
      if (i >= urls.length) return Promise.reject(err || new Error("no rpc"));
      var u = urls[i++];
      return post(u, req(method, params)).then(function (j) {
        if (j.error) throw new Error(j.error.message || "rpc error");
        return j.result;
      }).catch(next);
    }
    return next();
  }
  /* every eth_call of a step in one Multicall3.aggregate3 call (one request per node, up to 200 calls); a node that
     fails or rate-limits passes the call to the next one, and the whole round is tried once more after a pause */
  var MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11";
  function enc3(list) {
    var head = [], tail = [], off = list.length * 32;
    list.forEach(function (c) {
      var d = hex(c.data), len = d.length / 2, padded = d + "0".repeat((64 - (d.length % 64)) % 64);
      var item = pad(BigInt("0x" + hex(c.to))) + pad(1) + pad(96) + pad(len) + padded;
      head.push(pad(off)); tail.push(item); off += item.length / 2;
    });
    return "0x82ad56cb" + pad(32) + pad(list.length) + head.join("") + tail.join("");
  }
  function dec3(h) {
    var d = hex(h), base = Number(BigInt("0x" + d.substr(0, 64))) * 2, n = Number(BigInt("0x" + d.substr(base, 64))), out = [];
    var arr = base + 64;
    for (var i = 0; i < n; i++) {
      var at = arr + Number(BigInt("0x" + d.substr(arr + i * 64, 64))) * 2;
      var ok = BigInt("0x" + d.substr(at, 64)) === BigInt(1);
      var bo = at + Number(BigInt("0x" + d.substr(at + 64, 64))) * 2, len = Number(BigInt("0x" + d.substr(bo, 64)));
      out.push(ok ? "0x" + d.substr(bo + 64, len * 2) : null);
    }
    return out;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function calls(list) {
    var parts = [];
    for (var s = 0; s < list.length; s += 200) parts.push(list.slice(s, s + 200));
    return Promise.all(parts.map(function (part) {
      var data = enc3(part);
      var once = function () { return rpc("eth_call", [{ to: MULTICALL, data: data }, "latest"]); };
      return once().catch(function () { return wait(1500).then(once); }).then(function (r) {
        var out = dec3(r);
        if (out.length !== part.length || out.some(function (x) { return !x; })) throw new Error("multicall item failed");
        return out;
      });
    })).then(function (rs) { return [].concat.apply([], rs); });
  }
  function getLogs(filter) {
    var urls = CFG.logRpcs, i = 0;
    // whole range in one call; then 10,000-block chunks on any node
    function whole(err) {
      if (i >= urls.length) { if (!whole.again) { whole.again = 1; i = 0; return wait(1500).then(whole); } return chunked(); }
      var u = urls[i++];
      return post(u, req("eth_getLogs", [filter]), 20000).then(function (j) {
        if (j.error || !Array.isArray(j.result)) throw new Error("logs");
        return j.result;
      }).catch(whole);
    }
    function chunked() {
      return rpc("eth_blockNumber", []).then(function (head) {
        var to = parseInt(head, 16), from = parseInt(filter.fromBlock, 16), spans = [];
        for (var a = from; a <= to; a += 10000) spans.push([a, Math.min(a + 9999, to)]);
        return Promise.all(spans.map(function (sp) {
          var f = { address: filter.address, topics: filter.topics, fromBlock: "0x" + sp[0].toString(16), toBlock: "0x" + sp[1].toString(16) };
          return rpc("eth_getLogs", [f], urls);
        })).then(function (parts) { return [].concat.apply([], parts); });
      });
    }
    return whole();
  }

  /* ---------- ABI decoding ---------- */
  function hex(h) { return h.replace(/^0x/, ""); }
  function word(h, i) { return BigInt("0x" + (hex(h).substr(i * 64, 64) || "0")); }
  function addr(h, i) { return "0x" + hex(h).substr(i * 64 + 24, 40).toLowerCase(); }
  function str(h, byteOff) {
    var d = hex(h), at = byteOff * 2, len = Number(BigInt("0x" + d.substr(at, 64)));
    var raw = d.substr(at + 64, len * 2), bytes = new Uint8Array(len);
    for (var k = 0; k < len; k++) bytes[k] = parseInt(raw.substr(k * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  }
  function pad(n) { return BigInt(n).toString(16).padStart(64, "0"); }

  function decodeTask(id, h) {
    return {
      id: id, author: addr(h, 0), deadline: Number(word(h, 1)), paramsVersion: Number(word(h, 2)), status: Number(word(h, 3)),
      currency: addr(h, 4), createdAt: Number(word(h, 12)), pot: word(h, 13)
    };
  }
  function decodeSub(id, h) {
    // a tuple with strings: word 0 is its offset, the fields follow
    var w = function (i) { return word(h, i + 1); };
    return {
      id: id, taskId: Number(w(0)), doer: addr(h, 2), phase: Number(w(2)), outcome: Number(w(3)),
      windowEnd: Number(w(10)), voteEnd: Number(w(11)), decidedAt: Number(w(12)), callFrom: Number(w(13)), reward: w(15)
    };
  }
  function decodeCreated(log) {
    var d = log.data;
    return {
      id: Number(BigInt(log.topics[1])),
      title: str(d, Number(word(d, 3))),
      category: Number(word(d, 5)),
      cover: str(d, Number(word(d, 7)))
    };
  }

  /* ---------- prices, the same way as the app ---------- */
  function priceFromSqrt(sqrt, baseIsToken0, baseDec, quoteDec) {
    if (sqrt <= BigInt(0)) return BigInt(0);
    var sq = sqrt * sqrt, up = BigInt(10) ** BigInt(18 + baseDec), down = BigInt(10) ** BigInt(quoteDec);
    return baseIsToken0 ? (sq * up) / (Q192 * down) : (Q192 * up) / (sq * down);
  }
  function lower(a, b) { return a.toLowerCase() < b.toLowerCase(); }
  function prices(r) {
    var imd = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7", usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", yolo = "0x49e55a87aa4bb0d2fd58fdcf1a31c9612de015dc";
    var imdUsd = priceFromSqrt(word(r[0], 0), lower(imd, usdc), 18, 6);
    var ethUsd = priceFromSqrt(word(r[1], 0), lower(weth, usdc), 18, 6);
    var yoloImd = priceFromSqrt(word(r[2], 0), lower(yolo, imd), 18, 18);
    return { usd: E18, eth: ethUsd, imd: imdUsd, yolo: (yoloImd * imdUsd) / E18 };
  }
  function usdOf(px, currency, amount) {
    var t = CFG.tokens[currency];
    if (!t || !px[t.px]) return 0;
    return Number((amount * px[t.px]) / (BigInt(10) ** BigInt(t.dec))) / 1e18;
  }

  /* ---------- formatting ---------- */
  function fmtToken(currency, amount) {
    var t = CFG.tokens[currency] || { sym: "?", dec: 18 };
    var v = Number(amount) / Math.pow(10, t.dec);
    var s = v >= 100 ? Math.round(v).toLocaleString("en-US") : v >= 1 ? String(+v.toFixed(2)) : String(+v.toPrecision(2));
    return s + " " + t.sym;
  }
  function fmtUsd(v) {
    if (v >= 1000) return "$" + Math.round(v).toLocaleString("en-US");
    if (v >= 10) return "$" + Math.round(v);
    if (v >= 1) return "$" + v.toFixed(2).replace(/\.00$/, "");
    return v > 0 ? "<$1" : "";
  }
  function span(sec) {
    var m = Math.floor(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return d >= 1 ? d + "d" : h >= 1 ? h + "h" : Math.max(m, 1) + "m";
  }
  function coverUrl(c) {
    c = (c || "").trim();
    if (/^ipfs:\/\//i.test(c)) return CFG.ipfs + c.replace(/^ipfs:\/\/(ipfs\/)?/i, "");
    if (/^ar:\/\//i.test(c)) return "https://arweave.net/" + c.slice(5);
    if (/^https:\/\//i.test(c)) return c;
    return "";
  }

  /* ---------- the read ---------- */
  function load() {
    var now = Math.floor(Date.now() / 1000);
    var vault = CFG.vault;
    return calls([
      { to: vault, data: SIG.taskCount },
      { to: vault, data: SIG.submissionCount },
      { to: CFG.imdUsdc, data: SIG.slot0 },
      { to: CFG.ethUsdc, data: SIG.slot0 },
      { to: CFG.stateView, data: SIG.getSlot0 + hex(CFG.yoloPoolId) }
    ]).then(function (head) {
      var nTasks = Number(word(head[0], 0)), nSubs = Number(word(head[1], 0));
      var px = prices(head.slice(2));
      var list = [], k;
      for (k = 1; k <= nTasks; k++) list.push({ to: vault, data: SIG.getTask + pad(k) });
      for (k = 1; k <= nSubs; k++) list.push({ to: vault, data: SIG.getSubmission + pad(k) });
      // HiddenList.status(vault, kind 1 = task, id): state 1 hidden, 2 kept, 3 hidden by a vote; 3+ hide votes = under review
      for (k = 1; k <= nTasks; k++) list.push({ to: CFG.hiddenList, data: SIG.status + pad(BigInt(vault)) + pad(1) + pad(k) });
      return calls(list).then(function (res) {
        var tasks = {}, subs = [];
        for (k = 1; k <= nTasks; k++) tasks[k] = decodeTask(k, res[k - 1]);
        for (k = 1; k <= nSubs; k++) subs.push(decodeSub(k, res[nTasks + k - 1]));
        for (k = 1; k <= nTasks; k++) {
          var hs = res[nTasks + nSubs + k - 1], state = Number(word(hs, 0)), hideNfts = Number(word(hs, 1));
          tasks[k].hidden = state === 1 || state === 3 || (state !== 2 && hideNfts >= 3);
        }
        var versions = {};
        Object.keys(tasks).forEach(function (id) { versions[tasks[id].paramsVersion] = 1; });
        var vs = Object.keys(versions);
        return calls(vs.map(function (v) { return { to: vault, data: SIG.paramsOf + pad(v) }; })).then(function (pr) {
          var fee = {};
          vs.forEach(function (v, i) { fee[v] = word(pr[i], 24); }); // ParamsV feeBps (field 23, after the tuple offset)
          return { now: now, px: px, tasks: tasks, subs: subs, fee: fee };
        });
      });
    }).then(function (st) {
      st.meta = {};
      return loadMeta(st.meta).then(function () { return summarize(st); });
    });
  }

  function readEvents(meta, fromBlock) {
    return getLogs({ address: CFG.vault, fromBlock: "0x" + fromBlock.toString(16), toBlock: "latest", topics: [SIG.taskCreated] })
      .then(function (logs) { logs.forEach(function (l) { try { var m = decodeCreated(l); meta[m.id] = m; } catch (e) { /* skip */ } }); });
  }
  function loadMeta(meta) {
    var fetched = typeof document !== "undefined" && CFG.metaFile
      ? fetch(CFG.metaFile, { credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error("meta"); return r.json(); })
      : Promise.reject(new Error("no meta file"));
    return fetched.then(function (f) {
      if ((f.vault || "").toLowerCase() !== CFG.vault.toLowerCase()) throw new Error("meta of another vault");
      Object.keys(f.items).forEach(function (id) { meta[id] = f.items[id]; meta[id].id = Number(id); });
      return readEvents(meta, f.block + 1);
    }, function () { return readEvents(meta, CFG.fromBlock); })
      .catch(function () { /* titles of newer dares stay empty: cards show the id */ });
  }

  function isPromo(t) { return CFG.promo.indexOf(t.author) >= 0; }

  function summarize(st) {
    var tasks = st.tasks, now = st.now;
    var live = Object.keys(tasks).map(function (k) { return tasks[k]; })
      .filter(function (t) { return t.status === 1 && t.deadline > now && !t.hidden && (CFG.mode === "all" || !isPromo(t)); });
    live.forEach(function (t) {
      var m = st.meta[t.id] || {};
      t.title = m.title || ""; t.cover = coverUrl(m.cover); t.usd = usdOf(st.px, t.currency, t.pot);
    });
    var waiting = live.reduce(function (a, t) { return a + t.usd; }, 0);
    var picks = live.filter(function (t) { return !isPromo(t) || (st.meta[t.id] && [6, 7].indexOf(st.meta[t.id].category) < 0); }).slice().sort(function (a, b) { return (b.cover ? 1 : 0) - (a.cover ? 1 : 0) || b.usd - a.usd; }).slice(0, 6);
    var payouts = st.subs.filter(function (s) { return s.phase === 8 && s.outcome === 1 && !tasks[s.taskId].hidden; })
      .map(function (s) {
        var t = tasks[s.taskId];
        var feeBps = st.fee[t.paramsVersion] || BigInt(0);
        var net = s.reward - (s.reward * feeBps) / BigInt(10000);
        var at = Math.max(s.windowEnd, s.voteEnd, s.decidedAt, s.callFrom);
        var m = st.meta[s.taskId] || {};
        return { taskId: s.taskId, promo: isPromo(t), currency: t.currency, net: net, at: at, title: m.title || "" };
      })
      .sort(function (a, b) { return b.at - a.at; });
    var real = payouts.filter(function (p) { return CFG.mode === "all" || !p.promo; });
    return { now: now, live: live, waiting: waiting, picks: picks, payouts: real, promoPayouts: payouts.length - real.length };
  }

  /* ---------- render ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function render(s) {
    var line = document.getElementById("liveline");
    if (line) {
      var parts = [s.live.length + (s.live.length === 1 ? " dare live" : " dares live")];
      if (s.waiting >= 1) parts.push(fmtUsd(s.waiting) + " waiting");
      if (s.payouts.length) parts.push("last payout " + span(s.now - s.payouts[0].at) + " ago");
      var txt = line.querySelector(".txt");
      txt.textContent = "";
      parts.forEach(function (t, i) {
        var sp = el("span", "", t);
        if (i) { txt.appendChild(document.createTextNode(" ")); sp.insertBefore(el("i", "sep", "· "), sp.firstChild); }
        txt.appendChild(sp);
      });
      line.classList.add("ok");
    }
    var all = document.querySelectorAll("[data-live-count]");
    Array.prototype.forEach.call(all, function (a) { a.textContent = "See all " + s.live.length + " →"; });

    var grid = document.getElementById("live-grid");
    if (grid) {
      grid.textContent = "";
      s.picks.forEach(function (t) {
        var card = el("article", "dcard");
        var pic = el("a", "dcover");
        pic.href = CFG.web + "/#/task/" + t.id; pic.target = "_blank"; pic.rel = "noopener noreferrer";
        pic.setAttribute("aria-label", (t.title || "Dare #" + t.id) + " in the app");
        var img = el("img");
        img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
        img.src = t.cover || "assets/img/toad-640.png";
        img.onerror = function () { img.onerror = null; img.src = "assets/img/toad-640.png"; };
        pic.appendChild(img);
        var price = el("b", "dprice", fmtUsd(t.usd) || fmtToken(t.currency, t.pot));
        pic.appendChild(price);
        card.appendChild(pic);
        var body = el("div", "dbody");
        body.appendChild(el("h3", "dtitle", t.title || "Dare #" + t.id));
        var meta = el("p", "dmeta");
        meta.appendChild(el("span", "", fmtToken(t.currency, t.pot)));
        meta.appendChild(el("span", "", span(t.deadline - s.now) + " left"));
        body.appendChild(meta);
        var go = el("a", "btn go dgo", "Do it");
        go.href = CFG.tg + "?startapp=d_" + t.id + "_v1"; go.target = "_blank"; go.rel = "noopener noreferrer";
        body.appendChild(go);
        card.appendChild(body);
        grid.appendChild(card);
      });
      grid.classList.toggle("empty", s.picks.length === 0);
      // fewer than a full row: "Your dare here" fills the rest of it
      var own = document.getElementById("post-own");
      if (own) {
        var n = s.picks.length;
        own.setAttribute("data-r3", String(3 - (n % 3)));
        own.setAttribute("data-r2", String(2 - (n % 2)));
        grid.appendChild(own);
      }
    }

    var pay = document.getElementById("payouts");
    if (pay) {
      pay.textContent = "";
      s.payouts.slice(0, 6).forEach(function (p) {
        var li = el("li");
        var a = el("a");
        a.href = CFG.web + "/#/task/" + p.taskId; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.appendChild(el("span", "pid", "#" + p.taskId));
        a.appendChild(el("span", "pt", p.title || "Dare #" + p.taskId));
        a.appendChild(el("b", "pa", fmtToken(p.currency, p.net) + " paid"));
        a.appendChild(el("time", "pw", span(s.now - p.at) + " ago"));
        li.appendChild(a);
        pay.appendChild(li);
      });
      pay.classList.toggle("empty", s.payouts.length === 0);
    }
    document.documentElement.classList.add("live-ok");
  }
  function fail() {
    var line = document.getElementById("liveline");
    if (line) { line.querySelector(".txt").textContent = "Live on Ethereum"; line.classList.add("ok"); }
    document.documentElement.classList.add("live-fail");
  }

  root.MCB_LIVE = { load: load, summarize: summarize, CFG: CFG, getLogs: getLogs, decodeCreated: decodeCreated, SIG: SIG };
  if (typeof document !== "undefined") {
    // a page can read a same-origin snapshot of the summary instead
    var snap = document.documentElement.getAttribute("data-snapshot");
    var fromSnap = function () {
      return fetch(snap).then(function (r) { return r.json(); }).then(function (s) {
        s.picks.forEach(function (t) { t.pot = BigInt(t.pot); });
        s.payouts.forEach(function (p) { p.net = BigInt(p.net); });
        return s;
      });
    };
    var start = function () { (snap ? fromSnap() : load()).then(render).catch(fail); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }
})(typeof window !== "undefined" ? window : globalThis);
