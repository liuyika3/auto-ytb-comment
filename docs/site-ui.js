/**
 * 投递版本浮层、证书灯箱（RDN / CSCS）
 */
(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  document.querySelectorAll("[data-version-fab]").forEach(function (wrap) {
    var btn = qs(".version-fab__btn", wrap);
    var panel = qs(".version-fab__panel", wrap);
    if (!btn || !panel) return;

    function close() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      var open = panel.hidden;
      if (open) {
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
      } else {
        close();
      }
    });

    document.addEventListener("click", function () {
      close();
    });
    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  });

  var lb;
  function ensureLightbox() {
    if (lb) return lb;
    lb = document.createElement("div");
    lb.id = "site-lightbox";
    lb.className = "lightbox";
    lb.setAttribute("aria-modal", "true");
    lb.innerHTML =
      '<div class="lightbox__backdrop"></div>' +
      '<div class="lightbox__dialog" role="dialog" aria-labelledby="site-lightbox-title">' +
      '<button type="button" class="lightbox__close" aria-label="关闭">×</button>' +
      '<p class="lightbox__title" id="site-lightbox-title"></p>' +
      '<div class="lightbox__frame"><img src="" alt="" /></div>' +
      "</div>";
    document.body.appendChild(lb);

    function close() {
      lb.classList.remove("is-open");
      document.body.style.overflow = "";
    }

    lb.querySelector(".lightbox__backdrop").addEventListener("click", close);
    lb.querySelector(".lightbox__close").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && lb.classList.contains("is-open")) close();
    });
    lb._close = close;
    return lb;
  }

  document.querySelectorAll("[data-cert-zoom]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var src = el.getAttribute("data-cert-zoom");
      var title = el.getAttribute("data-cert-title") || "";
      if (!src) return;
      var box = ensureLightbox();
      box.querySelector(".lightbox__title").textContent = title;
      var img = box.querySelector("img");
      img.src = src;
      img.alt = title;
      box.classList.add("is-open");
      document.body.style.overflow = "hidden";
    });
  });
})();

/**
 * 从首页进入二级页前记录滚动位置；返回首页时恢复。二级页「返回首页」指向最近使用的首页变体。
 */
(function () {
  var HOMES = ["index.html", "index-ai.html", "index-clinical.html"];

  function fileOf(href) {
    if (!href) return "";
    var i = href.indexOf("#");
    if (i >= 0) href = href.slice(0, i);
    i = href.indexOf("?");
    if (i >= 0) href = href.slice(0, i);
    var parts = href.split("/");
    return (parts[parts.length - 1] || "").toLowerCase();
  }

  function basename() {
    var p = location.pathname || "";
    var parts = p.split("/");
    return (parts[parts.length - 1] || "index.html").toLowerCase();
  }

  var cur = basename();
  var isHome = HOMES.indexOf(cur) >= 0;

  if (isHome) {
    try {
      sessionStorage.setItem("liuLastHome", cur);
    } catch (e) {}

    document.addEventListener(
      "click",
      function (ev) {
        var a = ev.target.closest && ev.target.closest("a[href]");
        if (!a) return;
        var href = (a.getAttribute("href") || "").trim();
        if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0) return;
        if (/^https?:\/\//i.test(href)) return;
        var f = fileOf(href);
        if (!f || !/\.html?$/.test(f)) return;
        if (HOMES.indexOf(f) >= 0) return;
        try {
          sessionStorage.setItem(
            "liuScrollRestore",
            JSON.stringify({
              y: window.scrollY || 0,
              home: cur,
              t: Date.now(),
            })
          );
        } catch (e) {}
      },
      true
    );

    try {
      var raw = sessionStorage.getItem("liuScrollRestore");
      if (raw) {
        var o = JSON.parse(raw);
        sessionStorage.removeItem("liuScrollRestore");
        var age = Date.now() - (o && o.t ? o.t : 0);
        if (o && o.home === cur && age >= 0 && age < 3600000) {
          var y = +o.y || 0;
          window.addEventListener("load", function () {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                window.scrollTo(0, y);
              });
            });
          });
        }
      }
    } catch (e) {}
  }

  var lastHome = "index.html";
  try {
    lastHome = sessionStorage.getItem("liuLastHome") || "index.html";
  } catch (e) {}

  document.querySelectorAll(".js-home-back").forEach(function (a) {
    var href = a.getAttribute("href") || "";
    var hash = "";
    var i = href.indexOf("#");
    if (i >= 0) {
      hash = href.slice(i);
      href = href.slice(0, i);
    }
    a.setAttribute("href", lastHome + hash);
  });
})();

/**
 * 首页固定顶栏：滚动时高亮当前章节（scroll-spy），体现 Vibe Coding 级交互细节
 */
(function () {
  if (!document.body.classList.contains("has-site-chrome")) return;
  var nav = document.getElementById("site-home-nav");
  if (!nav) return;
  var navLinks = nav.querySelectorAll("a[data-spy]");
  var mail = document.querySelector(".site-chrome__contact");
  var ids = ["intro", "certs", "work3", "education", "contact"];
  var sections = [];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) sections.push({ id: ids[i], el: el });
  }
  if (!sections.length) return;

  function barHeight() {
    var bar = document.querySelector(".site-chrome__bar");
    return bar && bar.offsetHeight ? bar.offsetHeight + 20 : 72;
  }

  function currentId() {
    var probe = barHeight();
    var win = ids[0];
    for (var j = 0; j < sections.length; j++) {
      var top = sections[j].el.getBoundingClientRect().top;
      if (top <= probe) win = sections[j].id;
    }
    return win;
  }

  function paint(sectionId) {
    navLinks.forEach(function (a) {
      var sid = a.getAttribute("data-spy");
      a.classList.toggle("is-active", sid === sectionId);
    });
    if (mail) {
      mail.classList.toggle("is-active", sectionId === "contact");
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      paint(currentId());
    });
  }

  paint(currentId());
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
})();

/** 微信号线一键复制（Agent 交接） */
(function () {
  document.querySelectorAll("[data-copy-wx]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = (btn.getAttribute("data-copy-wx") || "").trim();
      if (!text) return;
      var label = btn.textContent;
      function flashOk() {
        btn.classList.add("is-done");
        btn.textContent = "已复制";
        setTimeout(function () {
          btn.textContent = label;
          btn.classList.remove("is-done");
        }, 2000);
      }
      function fallbackCopy() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(ta);
        ta.select();
        try {
          if (document.execCommand("copy")) flashOk();
        } catch (e) {}
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flashOk).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  });
})();
