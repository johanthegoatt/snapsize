// Snapsize page: pick a document, load a photo, drag the head marks, see
// the cut photo with checks, save a form file and a print sheet.
(function () {
  "use strict";
  var C = window.SnapCore;
  var Flash = window.Flash || { say: function () {}, mood: function () {}, react: function () {}, start: function () {} };
  var $ = function (id) { return document.getElementById(id); };

  var KEY = "snapsize.doc";
  var state = {
    spec: C.SPECS.us,
    work: null,      // canvas holding the photo (downscaled if huge)
    marks: null,     // { crown: {x,y}, chin: {x,y} } in work pixels
    fill: "#f2f0ec", // colour for any strip the photo doesn't cover
    url: null
  };
  var MAX_SIDE = 3200;

  // ---- 1. document ----
  var docs = $("docs");
  try { var saved = localStorage.getItem(KEY); if (saved && C.SPECS[saved]) state.spec = C.SPECS[saved]; } catch (e) {}
  Object.keys(C.SPECS).forEach(function (id) {
    var s = C.SPECS[id];
    var lab = document.createElement("label");
    lab.className = "doc";
    lab.innerHTML = '<input type="radio" name="doc">' +
      '<span class="doc-shape" aria-hidden="true"></span>' +
      '<span class="doc-name"></span><span class="doc-size"></span>';
    var input = lab.querySelector("input");
    input.value = id;
    input.checked = s === state.spec;
    lab.querySelector(".doc-name").textContent = s.name;
    lab.querySelector(".doc-size").textContent = s.short + ", head " + fmtMm(s.head[0]) + " to " + fmtMm(s.head[1]);
    var shape = lab.querySelector(".doc-shape");
    shape.style.width = (s.w * 0.62) + "px";
    shape.style.height = (s.h * 0.62) + "px";
    input.addEventListener("change", function () {
      state.spec = s;
      try { localStorage.setItem(KEY, id); } catch (e) {}
      Flash.react("doc", { name: s.name });
      update();
    });
    docs.appendChild(lab);
  });

  function fmtMm(mm) {
    return (Math.round(mm * 10) / 10).toString().replace(/\.0$/, "") + " mm";
  }

  // ---- 2. photo ----
  var file = $("file"), drop = $("drop");
  file.addEventListener("change", function () { if (file.files[0]) load(file.files[0]); });
  ["dragenter", "dragover"].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    drop.addEventListener(t, function () { drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) load(f);
  });

  function showErr(msg) {
    var el = $("photo-err");
    el.textContent = msg;
    el.hidden = !msg;
  }

  function load(f) {
    showErr("");
    if (!/^image\//.test(f.type)) {
      showErr("That file isn't a photo. Try a JPG, PNG or HEIC from your camera.");
      Flash.react("oops");
      return;
    }
    var url = URL.createObjectURL(f);
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      state.work = c;
      state.fill = edgeColour(c);
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = url;
      var shown = $("src-img");
      shown.src = url;
      state.marks = guessMarks(c);
      ["step-mark", "step-check", "step-save"].forEach(function (id) { $(id).hidden = false; });
      shown.onload = function () {
        placeMarks();
        update();
        $("step-mark").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      };
      Flash.react("photo");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showErr("This browser can't open that photo. If it's HEIC from an iPhone, share it as JPG or take a screenshot of it.");
      Flash.react("oops");
    };
    img.src = url;
  }

  // Average colour of the top corners: what the wall looks like.
  function edgeColour(c) {
    var ctx = c.getContext("2d");
    var pw = Math.max(4, Math.round(c.width * 0.08)), ph = Math.max(4, Math.round(c.height * 0.06));
    var r = 0, g = 0, b = 0, n = 0;
    [0, c.width - pw].forEach(function (x) {
      var d = ctx.getImageData(x, 0, pw, ph).data;
      for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    });
    return "rgb(" + Math.round(r / n) + "," + Math.round(g / n) + "," + Math.round(b / n) + ")";
  }

  // A starting guess: most phone portraits have the head in the upper middle.
  function guessMarks(c) {
    return {
      crown: { x: c.width / 2, y: c.height * 0.16 },
      chin: { x: c.width / 2, y: c.height * 0.48 }
    };
  }

  // ---- 3. marks ----
  var stage = $("stage"), mTop = $("m-top"), mChin = $("m-chin"), frame = $("frame");

  function scale() {
    return $("src-img").clientWidth / state.work.width;
  }

  function placeMarks() {
    if (!state.work) return;
    var s = scale();
    [[mTop, state.marks.crown], [mChin, state.marks.chin]].forEach(function (pair) {
      pair[0].style.top = (pair[1].y * s) + "px";
      pair[0].querySelector(".pill").style.left = (pair[1].x * s) + "px";
      pair[0].setAttribute("aria-valuenow", Math.round(pair[1].y / state.work.height * 100));
    });
  }

  function drag(el, key) {
    var active = false;
    el.addEventListener("pointerdown", function (e) {
      active = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      move(e);
      e.preventDefault();
    });
    el.addEventListener("pointermove", function (e) { if (active) move(e); });
    function end() {
      if (!active) return;
      active = false;
      el.classList.remove("dragging");
      Flash.react("marked", summary());
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    function move(e) {
      var r = $("src-img").getBoundingClientRect();
      var s = scale();
      var x = Math.min(Math.max(e.clientX - r.left, 0), r.width) / s;
      var y = Math.min(Math.max(e.clientY - r.top, 0), r.height) / s;
      setMark(key, x, y);
    }
    el.addEventListener("keydown", function (e) {
      var step = (e.shiftKey ? 10 : 1) / scale();
      var p = state.marks[key], dx = 0, dy = 0;
      if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else return;
      e.preventDefault();
      setMark(key, p.x + dx, p.y + dy);
    });
  }

  function setMark(key, x, y) {
    var w = state.work.width, h = state.work.height, gap = h * 0.04;
    x = Math.min(Math.max(x, 0), w);
    y = Math.min(Math.max(y, 0), h);
    // Keep the chin below the top of the head.
    if (key === "crown") y = Math.min(y, state.marks.chin.y - gap);
    else y = Math.max(y, state.marks.crown.y + gap);
    state.marks[key] = { x: x, y: y };
    // Moving one sideways moves both, so the face stays centred.
    var other = key === "crown" ? "chin" : "crown";
    state.marks[other].x = x;
    placeMarks();
    update();
  }

  drag(mTop, "crown");
  drag(mChin, "chin");
  window.addEventListener("resize", function () { placeMarks(); update(); });

  // ---- 4. render + checks ----
  function draw(ctx, crop, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = state.fill;
    ctx.fillRect(x, y, w, h);
    var k = w / crop.w;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.work, x - crop.x * k, y - crop.y * k, state.work.width * k, state.work.height * k);
    ctx.restore();
  }

  function currentCrop() {
    return C.cropFor(state.spec, state.marks, { w: state.work.width, h: state.work.height });
  }

  function summary() {
    var crop = currentCrop();
    var list = C.checks(state.spec, state.marks, crop);
    list.push(bgCheck(crop));

    // Exact print resolution and whether the photo meets the online form's
    // minimum pixel size, as numbers on top of the plainer "detail" check.
    var res = C.resolution(state.spec, crop.w, crop.h);
    if (res) {
      var txt = res.level === "bad"
        ? "This prints at about " + res.dpi + " dpi, below the 300 dpi a sharp print needs. Use a closer or higher-resolution photo."
        : res.level === "warn"
          ? "Prints at about " + res.dpi + " dpi, fine for a 300 dpi print. For the 600 dpi quality bar some systems ask for, you'd need about " + res.min600.w + "x" + res.min600.h + " px."
          : "Prints at about " + res.dpi + " dpi, clearing the 600 dpi quality bar.";
      var level = res.level;
      if (res.digital && res.meetsDigital === false) {
        txt += " It's under " + res.digital.w + "x" + res.digital.h + " px, this country's online-form minimum, so uploading would enlarge and soften it.";
        if (level === "ok") level = "warn";
      }
      list.push({ id: "resolution", level: level, text: txt });
    }
    var worst = list.some(function (c) { return c.level === "bad"; }) ? "bad" :
      list.some(function (c) { return c.level === "warn"; }) ? "warn" : "ok";
    return { list: list, worst: worst, crop: crop };
  }

  // Look at two strips beside the head on a small render.
  function bgCheck(crop) {
    var c = document.createElement("canvas");
    c.width = 140;
    c.height = Math.round(140 * state.spec.h / state.spec.w);
    var ctx = c.getContext("2d", { willReadFrequently: true });
    draw(ctx, crop, 0, 0, c.width, c.height);
    var pw = Math.round(c.width * 0.1), y0 = Math.round(c.height * 0.04), ph = Math.round(c.height * 0.24);
    var patches = [Math.round(c.width * 0.02), Math.round(c.width * 0.88)].map(function (x) {
      var d = ctx.getImageData(x, y0, pw, ph).data, out = [];
      for (var i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      return out;
    });
    var r = C.background(state.spec, patches);
    r.id = "bg";
    return r;
  }

  var lastWorst = null;
  function update() {
    if (!state.work || !state.marks) return;
    var spec = state.spec;
    var sum = summary(), crop = sum.crop;

    // Crop box on the stage.
    var s = scale();
    frame.style.left = crop.x * s + "px";
    frame.style.top = crop.y * s + "px";
    frame.style.width = crop.w * s + "px";
    frame.style.height = crop.h * s + "px";

    // Preview.
    var cv = $("preview");
    cv.width = 420;
    cv.height = Math.round(420 * spec.h / spec.w);
    var ctx = cv.getContext("2d");
    draw(ctx, crop, 0, 0, cv.width, cv.height);
    if ($("guides").checked) guides(ctx, cv, crop);
    $("size-note").textContent = spec.short + ", head " + fmtMm(crop.headMm);

    // Checks.
    var ul = $("checks");
    ul.textContent = "";
    sum.list.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "chk " + c.level;
      var icon = document.createElement("span");
      icon.className = "chk-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "×";
      var label = document.createElement("span");
      label.className = "sr";
      label.textContent = c.level === "ok" ? "Good: " : c.level === "warn" ? "Heads up: " : "Fix this: ";
      li.appendChild(icon);
      li.appendChild(label);
      li.appendChild(document.createTextNode(c.text));
      ul.appendChild(li);
    });

    // Save notes.
    var d = spec.digital;
    $("digital-note").textContent = d.w + " x " + d.h + " pixels JPEG" + (d.maxBytes ? ", under " + Math.round(d.maxBytes / 1024) + " KB, as the US online renewal asks." : ".");
    var paper = currentPaper();
    var sh = C.sheet(spec, paper);
    $("sheet-note").textContent = sh.count + " photos on one " + paper.name + ", with lines to cut along.";
    sheetPreview(crop, sh);

    if (sum.worst !== lastWorst) {
      Flash.mood(sum.worst === "ok" ? "happy" : sum.worst === "warn" ? "curious" : "worried");
      lastWorst = sum.worst;
    }
  }

  // Dashed lines where the top of the head and the chin should sit.
  function guides(ctx, cv, crop) {
    var spec = state.spec, k = cv.height / spec.h;
    var top = (spec.h - crop.headMm) * 0.3 * k;
    var lo = top + spec.head[0] * k, hi = top + spec.head[1] * k;
    ctx.save();
    ctx.fillStyle = "rgba(239,111,76,0.16)";
    ctx.fillRect(0, lo, cv.width, hi - lo);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(43,108,176,0.9)";
    line(ctx, 0, top, cv.width, top);
    ctx.strokeStyle = "rgba(239,111,76,0.95)";
    line(ctx, 0, lo, cv.width, lo);
    line(ctx, 0, hi, cv.width, hi);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    line(ctx, cv.width / 2, 0, cv.width / 2, cv.height);
    ctx.restore();
  }
  function line(ctx, a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  $("guides").addEventListener("change", update);

  function renderSheet(canvas, crop, sh, dpi) {
    var px = function (mm) { return mm / 25.4 * dpi; };
    canvas.width = Math.round(px(sh.w));
    canvas.height = Math.round(px(sh.h));
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    sh.slots.forEach(function (s) {
      draw(ctx, crop, px(s.x), px(s.y), px(s.w), px(s.h));
    });
    // Cut lines run edge to edge through the gaps.
    ctx.strokeStyle = "#b9b4ac";
    ctx.lineWidth = Math.max(1, dpi / 300);
    var xs = {}, ys = {};
    sh.slots.forEach(function (s) { xs[s.x] = xs[s.x + s.w] = 1; ys[s.y] = ys[s.y + s.h] = 1; });
    Object.keys(xs).forEach(function (x) { line(ctx, px(+x), 0, px(+x), canvas.height); });
    Object.keys(ys).forEach(function (y) { line(ctx, 0, px(+y), canvas.width, px(+y)); });
    // Redraw photos over the lines so the lines only show in the gaps.
    sh.slots.forEach(function (s) { draw(ctx, crop, px(s.x), px(s.y), px(s.w), px(s.h)); });
    ctx.fillStyle = "#8a847b";
    ctx.font = Math.round(px(2.2)) + "px system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(state.spec.name + ", " + state.spec.short + ". Print as 4 x 6 with no cropping.", px(3), canvas.height - px(0.8));
  }

  function sheetPreview(crop, sh) {
    renderSheet($("sheet-preview"), crop, sh, 100);
  }

  // ---- 5. save ----
  function toBlob(canvas, q) {
    return new Promise(function (res) { canvas.toBlob(res, "image/jpeg", q); });
  }

  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function slug() { return state.spec.id + "-" + state.spec.short.replace(/\s+/g, ""); }

  $("dl-digital").addEventListener("click", function () {
    if (!state.work) return;
    var crop = currentCrop(), d = state.spec.digital;
    var c = document.createElement("canvas");
    c.width = d.w;
    c.height = d.h;
    draw(c.getContext("2d"), crop, 0, 0, d.w, d.h);
    var last = null;
    var job = d.maxBytes
      ? C.fitQuality(function (q) { return toBlob(c, q).then(function (b) { last = b; return b.size; }); }, d.maxBytes)
          .then(function (r) { return toBlob(c, r.q); })
      : toBlob(c, 0.92);
    job.then(function (blob) {
      save(blob, "photo-" + slug() + ".jpg");
      Flash.react("saved", { kb: Math.round(blob.size / 1024), what: "file" });
    });
  });

  // Which paper the sheet is laid out for: a photo-counter print or ordinary
  // A4 / Letter you run off at home. Defaults to the 4 x 6 print.
  function currentPaper() {
    var sel = $("paper");
    return (sel && C.PAPERS[sel.value]) || C.PAPERS["4x6"];
  }
  var paperSel = $("paper");
  if (paperSel) paperSel.addEventListener("change", function () { if (state.work) update(); });

  $("dl-sheet").addEventListener("click", function () {
    if (!state.work) return;
    var paper = currentPaper(), crop = currentCrop(), sh = C.sheet(state.spec, paper);
    var c = document.createElement("canvas");
    renderSheet(c, crop, sh, C.PRINT_DPI);
    toBlob(c, 0.95).then(function (blob) {
      save(blob, "print-" + paper.id + "-" + slug() + ".jpg");
      Flash.react("saved", { what: "sheet", count: sh.count });
    });
  });

  // Self-check boxes: Flash cheers when all are ticked.
  var boxes = Array.prototype.slice.call(document.querySelectorAll(".selfcheck"));
  boxes.forEach(function (b) {
    b.addEventListener("change", function () {
      if (boxes.every(function (x) { return x.checked; })) Flash.react("allticked");
    });
  });

  window.__snapsize = { state: state, update: update, setMark: setMark, summary: function () { return summary(); } };
  Flash.start();
})();
