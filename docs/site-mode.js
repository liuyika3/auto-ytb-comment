/**
 * 浏览模式：适配不同投递方向。持久化 localStorage；可用 ?mode=clinical 等覆盖一次并写入。
 * 取值：default | clinical | product | healthtech
 */
(function () {
  var STORAGE = "liuSiteMode";
  var MODES = ["default", "clinical", "product", "healthtech"];

  var SUBPAGE_HINT = {
    default: "当前为通用均衡叙事。",
    clinical: "当前侧重：临床营养、RDN、医院与照护语境。",
    product: "当前侧重：AI 产品、Agent、数据闭环与指标。",
    healthtech: "当前侧重：数字健康、北美语境与跨团队落地。",
  };

  var COPY = {
    default: {
      heroEyebrow: "AI 健康方向 · 产品经理",
      heroTitle: "将临床营养学逻辑，落地为可度量的 AI 产品能力",
      heroLede:
        "美国注册营养师 RDN，NSCA 认证体能训练专家 CSCS。在美国完成六年学业与北美临床、运动营养实践，现于 Fluxvita 负责北美 AI 减肥教练产品 Jovida 的 0–1 规划与人机协同的 Agent 交互。",
      panelLabel: "当前项目",
      panelQuote:
        "Jovida：围绕能量代谢、食物评分、外食与菜谱、Onboarding 等模块推进产品化；结合埋点与评测集，对关键体验进行验收与迭代。",
      panelMeta: "关键指标含次日留存、核心功能使用率、核心步骤转化率等，以实际报表为准。",
      strip: [
        { k: "美国经历", v: "六年", s: "学术训练、北美临床营养与运动营养实践及行业经历" },
        { k: "注册资质", v: "RDN · CSCS", s: "美国注册营养师；NSCA 认证体能训练专家" },
        { k: "近三年工作", v: "临床 + AI 产品", s: "密歇根临床营养与运动营养后转入 AI 健康产品，覆盖代谢与减肥教练方向" },
        { k: "从业方向", v: "AI 与运动健康", s: "Agent 与工作流、评测集、跨团队推进与数据闭环" },
      ],
      tagline:
        "我关注临床与训练逻辑能否被拆解为可验证的产品假设与数据指标，并在产品、算法、设计与运营之间对齐专业语境。",
      traits: ["RDN", "CSCS", "北美临床营养", "AI 产品 0–1", "中英双语汇报", "评测集与埋点"],
      introSub: "个人简介：照片与要点；可按浏览模式切换叙事侧重。",
    },
    clinical: {
      heroEyebrow: "临床营养 · 注册营养师语境",
      heroTitle: "以 RDN 与临床营养为基础，参与 AI 健康产品化",
      heroLede:
        "美国注册营养师 RDN，长期在北美医院与长期照护场景做营养评估与干预，熟悉 Epic 与 PointClickCare；同时为 NCAA 一级运动员做个体化营养并参与校园餐饮统筹。在此基础之上，我参与 AI 健康产品的需求定义、流程设计与验收口径对齐。",
      panelLabel: "临床相关经验",
      panelQuote:
        "在密歇根大学附属医院及校队体系内，承担个体化营养咨询、病房营养管理、团体教育与大型供餐场景下的营养统筹等工作，并参与跨学科沟通。",
      panelMeta: "代表性工作含运动员个体化营养、住院及长期照护患者营养管理、校园餐饮统筹等，详见履历与教育页。",
      strip: [
        { k: "注册资质", v: "RDN", s: "美国注册营养师 Registered Dietitian Nutritionist" },
        { k: "临床信息系统", v: "Epic 等", s: "营养记录、评估、方案与随访相关流程" },
        { k: "运动营养", v: "NCAA 等", s: "一级运动员个体化营养与团体教育" },
        { k: "与 AI 结合", v: "产品化", s: "将临床路径转化为可验证的产品与数据指标" },
      ],
      tagline:
        "临床工作的核心是安全、证据与可追溯；在参与 AI 产品时，我优先对齐医学与营养学共识，并明确模型能力与责任边界。",
      traits: ["RDN", "住院与长期照护", "Epic / PointClickCare", "运动营养", "患者教育", "跨学科沟通"],
      introSub: "面向医院、照护机构、康复与体重管理门诊等场景的叙事侧重。",
    },
    product: {
      heroEyebrow: "AI 产品 · 运动健康场景",
      heroTitle: "负责 AI 健康产品的规划、迭代与跨团队落地",
      heroLede:
        "现任 AI 健康方向产品经理，核心项目为 Fluxvita Jovida，北美 AI 减肥教练。工作范围覆盖 0–1 业务架构、Agent 与工作流设计、Skill 与 Prompt 落地、评测集构建，以及埋点与留存、转化等关键指标的跟踪与复盘。RDN 与 CSCS 背景支撑运动与健康场景下的专业表达与验收标准。",
      panelLabel: "指标与闭环",
      panelQuote:
        "围绕次日留存、核心功能使用率、核心步骤转化率等指标，配合埋点与实验设计推进迭代；通过评测集提升营养素识别与食物评分等环节的准确性。",
      panelMeta: "与算法、工程、设计、运营等协作推进需求—方案—评估—复盘闭环。",
      strip: [
        { k: "产品类型", v: "AI Native", s: "面向 C 端的智能教练与任务型体验" },
        { k: "工作方法", v: "Agent + Skill", s: "工作流编排、评测集、验收口径与版本管理" },
        { k: "数据与增长", v: "漏斗与埋点", s: "关键路径转化、留存与功能使用分析" },
        { k: "专业背景", v: "RDN · CSCS", s: "运动与健康场景下的专业判断与风险意识" },
      ],
      tagline:
        "我习惯先把能力边界、验收标准与数据口径写清楚，再推动版本迭代，降低团队反复对齐的成本。",
      traits: ["PRD 与原型", "Agent 与工作流", "评测集", "埋点与实验", "跨团队推进", "RDN / CSCS 语境"],
      introSub: "面向互联网与 AI 产品团队的叙事侧重。",
    },
    healthtech: {
      heroEyebrow: "数字健康 · 北美语境",
      heroTitle: "连接临床逻辑、运动健康与 AI 产品交付",
      heroLede:
        "在美国完成公共卫生与运动营养双硕士学位，本科毕业于多伦多大学运动科学专业；在北美做过临床营养、校队运动营养及数字健康产品相关工作。近三年聚焦临床营养与 AI 健康产品，熟悉北美用户场景、英文材料与合规表达，并承担中英双语汇报与路演。",
      panelLabel: "项目与语境",
      panelQuote:
        "当前参与北美市场 AI 减肥教练产品；关注用户路径、营养与训练专业表达、以及跨时区协作下的交付节奏。",
      panelMeta: "可与医疗、健身、食品与保险等数字健康生态对接相关讨论。",
      strip: [
        { k: "教育背景", v: "多伦多 · 密歇根", s: "运动科学学士；公共卫生与运动营养双硕士" },
        { k: "北美经历", v: "六年", s: "学术、临床与行业语境下的沟通与交付" },
        { k: "注册资质", v: "RDN · CSCS", s: "美国注册营养师；认证体能训练专家" },
        { k: "产品方向", v: "AI 健康", s: "个性化指导、数据闭环与专业内容对齐" },
      ],
      tagline:
        "在数字健康业务中，我重视专业内容可审计、用户承诺可兑现、跨团队语言一致三件事。",
      traits: ["中英双语", "北美项目经验", "RDN", "CSCS", "双硕士", "路演与培训"],
      introSub: "面向数字健康、出海或跨国团队的叙事侧重。",
    },
  };

  function getInitialMode() {
    try {
      var q = new URLSearchParams(window.location.search).get("mode");
      if (q && MODES.indexOf(q) !== -1) {
        localStorage.setItem(STORAGE, q);
        return q;
      }
    } catch (e) {}
    var s = localStorage.getItem(STORAGE);
    if (s && MODES.indexOf(s) !== -1) return s;
    return "default";
  }

  function setDataset(mode) {
    document.documentElement.setAttribute("data-site-mode", mode);
  }

  function fillStrip(strip) {
    var cells = document.querySelectorAll("[data-strip-cell]");
    if (!cells.length || !strip) return;
    for (var i = 0; i < cells.length && i < strip.length; i++) {
      var d = strip[i];
      var elK = cells[i].querySelector("[data-strip-k]");
      var elV = cells[i].querySelector("[data-strip-v]");
      var elS = cells[i].querySelector("[data-strip-s]");
      if (elK) elK.textContent = d.k;
      if (elV) elV.textContent = d.v;
      if (elS) elS.textContent = d.s;
    }
  }

  function fillTraits(traits) {
    var grid = document.querySelector("[data-trait-grid]");
    if (!grid || !traits || !traits.length) return;
    grid.innerHTML = "";
    for (var i = 0; i < traits.length; i++) {
      var span = document.createElement("span");
      span.className = "trait-chip";
      span.textContent = traits[i];
      grid.appendChild(span);
    }
  }

  function apply(mode) {
    if (MODES.indexOf(mode) === -1) mode = "default";
    setDataset(mode);
    localStorage.setItem(STORAGE, mode);

    var c = COPY[mode] || COPY.default;

    var sel = document.getElementById("site-mode-select");
    if (sel) sel.value = mode;

    var hint = document.getElementById("mode-desc");
    if (hint) hint.textContent = SUBPAGE_HINT[mode] || SUBPAGE_HINT.default;

    if (document.getElementById("hero-eyebrow")) {
      document.getElementById("hero-eyebrow").textContent = c.heroEyebrow;
      document.getElementById("hero-title").textContent = c.heroTitle;
      document.getElementById("hero-lede").textContent = c.heroLede;
      var pl = document.getElementById("panel-label");
      var pq = document.getElementById("panel-quote");
      var pm = document.getElementById("panel-meta");
      if (pl) pl.textContent = c.panelLabel;
      if (pq) pq.textContent = c.panelQuote;
      if (pm) pm.textContent = c.panelMeta;
      fillStrip(c.strip);
      var tg = document.getElementById("intro-tagline");
      if (tg) tg.textContent = c.tagline;
      fillTraits(c.traits);
      var isub = document.getElementById("intro-section-sub");
      if (isub) isub.textContent = c.introSub;
    }
  }

  function init() {
    var mode = getInitialMode();
    apply(mode);

    var sel = document.getElementById("site-mode-select");
    if (sel) {
      sel.addEventListener("change", function () {
        apply(sel.value);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
