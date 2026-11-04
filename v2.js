/* links that open Details, the $YOLO address copy button */
(function () {
  "use strict";
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
