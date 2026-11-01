/* the side tabs, links that open Details, the $YOLO address copy button */
(function () {
  "use strict";
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));
  function pick(t, focus) {
    tabs.forEach(function (b) {
      var on = b === t;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      var pane = document.getElementById(b.getAttribute("aria-controls"));
      if (pane) pane.hidden = !on;
    });
    if (focus) t.focus();
  }
  tabs.forEach(function (b, i) {
    b.addEventListener("click", function () { pick(b); });
    b.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      pick(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length], true);
    });
  });

  var deep = document.getElementById("details");
  Array.prototype.forEach.call(document.querySelectorAll("[data-open-details]"), function (a) {
    a.addEventListener("click", function (e) {
      if (!deep) return;
      e.preventDefault();
      deep.open = true;
      var id = (a.getAttribute("href") || "").replace(/^#/, "");
      var target = id && document.getElementById(id) || deep;
      requestAnimationFrame(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-copy");
      var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, done); else done();
    });
  });
})();
