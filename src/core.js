// Snapsize core: photo sizes, where to crop, checks and the print sheet.
// No DOM in here, so it runs in Node for the tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SnapCore = factory();
})(this, function () {
  "use strict";

  var MM_PER_IN = 25.4;
  var PRINT_DPI = 300;
  var PRINT_PX_PER_MM = PRINT_DPI / MM_PER_IN; // 11.81

  // Sizes in millimetres. head = crown (top of head) to chin.
  //   US: travel.state.gov composition template, 2 x 2 in, head 1 to 1 3/8 in.
  //   UK: gov.uk/photos-for-passports, 35 x 45 mm, head 29 to 34 mm, digital at least 600 x 750.
  //   EU / Schengen: ICAO 9303 / ISO 19794-5 as used by EU states, head 32 to 36 mm.
  //   Canada: canada.ca photo specs, 50 x 70 mm, head 31 to 36 mm.
  //   Japan: MOFA / embassy spec, 35 x 45 mm, crown to jaw 34 +/- 2 mm (32 to 36).
  //   New Zealand: passports.govt.nz, 35 x 45 mm, head 32 to 36 mm (ICAO).
  //   China: visaforchina.cn visa notice, 33 x 48 mm, head height 28 to 33 mm.
  //   Philippines: DFA consular spec, 35 x 45 mm (4.5 x 3.5 cm), head 32 to 36 mm.
  //   Singapore: ICA spec, 35 x 45 mm, head (chin to crown) 25 to 35 mm, white bg.
  //   South Korea: 35 x 45 mm, head 25 to 35 mm, white bg (confirm with the consulate).
  var SPECS = {
    us: {
      id: "us", name: "US passport or visa", short: "2 x 2 in",
      w: 50.8, h: 50.8, head: [25.4, 34.925],
      bg: "plain white or off-white",
      digital: { w: 600, h: 600, maxBytes: 240 * 1024 }
    },
    uk: {
      id: "uk", name: "UK passport", short: "35 x 45 mm",
      w: 35, h: 45, head: [29, 34],
      bg: "plain cream or light grey",
      digital: { w: 700, h: 900 }
    },
    eu: {
      id: "eu", name: "EU passport or Schengen visa", short: "35 x 45 mm",
      w: 35, h: 45, head: [32, 36],
      bg: "plain light grey or white",
      digital: { w: 700, h: 900 }
    },
    ca: {
      id: "ca", name: "Canada passport", short: "50 x 70 mm",
      w: 50, h: 70, head: [31, 36],
      bg: "plain white or light colour",
      digital: { w: 1000, h: 1400 }
    },
    au: {
      id: "au", name: "Australia passport", short: "35 x 45 mm",
      w: 35, h: 45, head: [32, 36],
      bg: "plain white or light grey",
      digital: { w: 700, h: 900 }
    },
    in: {
      id: "in", name: "India passport or visa", short: "2 x 2 in",
      w: 50.8, h: 50.8, head: [25, 35],
      bg: "plain white or off-white",
      digital: { w: 600, h: 600, maxBytes: 100 * 1024 }
    },
    jp: {
      id: "jp", name: "Japan passport", short: "35 x 45 mm",
      w: 35, h: 45, head: [32, 36],
      bg: "plain light, no pattern",
      digital: { w: 700, h: 900 }
    },
    nz: {
      id: "nz", name: "New Zealand passport", short: "35 x 45 mm",
      w: 35, h: 45, head: [32, 36],
      bg: "plain light grey or white",
      digital: { w: 700, h: 900 }
    },
    cn: {
      id: "cn", name: "China visa", short: "33 x 48 mm",
      w: 33, h: 48, head: [28, 33],
      bg: "plain white",
      digital: { w: 390, h: 567 }
    },
    ph: {
      id: "ph", name: "Philippines passport", short: "35 x 45 mm",
      w: 35, h: 45, head: [32, 36],
      bg: "plain white",
      digital: { w: 700, h: 900 }
    },
    sg: {
      id: "sg", name: "Singapore passport or visa", short: "35 x 45 mm",
      w: 35, h: 45, head: [25, 35],
      bg: "plain white",
      digital: { w: 400, h: 514 }
    },
    kr: {
      id: "kr", name: "South Korea passport", short: "35 x 45 mm",
      w: 35, h: 45, head: [25, 35],
      bg: "plain white",
      digital: { w: 413, h: 531 }
    }
  };

  // How much of the space not taken by the head sits above it. 0.3 puts the
  // eyes 29.6 mm up a US photo, inside the template's 28.6 to 34.9 mm band.
  var TOP_SHARE = 0.3;

  function headTarget(spec) {
    return (spec.head[0] + spec.head[1]) / 2;
  }

  // Where to cut the photo so the head is the right size and centred.
  // marks: { crown: {x, y}, chin: {x, y} } in source pixels.
  // img: { w, h } source size. Returns the crop box in source pixels plus
  // what the head measures on the finished photo.
  function cropFor(spec, marks, img) {
    var headPx = marks.chin.y - marks.crown.y;
    if (!(headPx > 0)) throw new Error("the chin must be below the top of the head");
    var headMm = headTarget(spec);
    var pxPerMm = headPx / headMm;
    var w = spec.w * pxPerMm, h = spec.h * pxPerMm;
    var cx = (marks.crown.x + marks.chin.x) / 2;
    var x = cx - w / 2;
    var y = marks.crown.y - (spec.h - headMm) * TOP_SHARE * pxPerMm;
    var out = {
      top: Math.max(0, -y),
      left: Math.max(0, -x),
      right: Math.max(0, x + w - img.w),
      bottom: Math.max(0, y + h - img.h)
    };
    return {
      x: x, y: y, w: w, h: h,
      pxPerMm: pxPerMm,
      headMm: headMm,
      eyeFromBottomMm: spec.h - ((spec.h - headMm) * TOP_SHARE + headMm / 2),
      outside: out,
      // Share of the crop that has no photo under it, per side.
      missing: { top: out.top / h, left: out.left / w, right: out.right / w, bottom: out.bottom / h }
    };
  }

  // Plain-words checks on the marks and the crop. Each has a level:
  // "ok", "warn" (will probably still work) or "bad" (fix before printing).
  function checks(spec, marks, crop) {
    var list = [];
    var headPx = marks.chin.y - marks.crown.y;
    var tilt = Math.abs(marks.crown.x - marks.chin.x) / headPx;
    list.push(tilt > 0.18
      ? { id: "tilt", level: "warn", text: "Your head looks tilted. Keep it straight and look at the camera." }
      : { id: "tilt", level: "ok", text: "Head is straight." });

    var m = crop.missing;
    var worst = Math.max(m.top, m.left, m.right, m.bottom);
    if (worst > 0.04) {
      var side = m.top === worst ? "above your head" : m.bottom === worst ? "below your chin" : "at the sides";
      list.push({ id: "room", level: "bad", text: "The photo runs out " + side + ". Take it again from a bit further back." });
    } else if (worst > 0) {
      list.push({ id: "room", level: "warn", text: "A thin strip at the edge is filled in. Fine for most forms, but a wider photo is better." });
    } else {
      list.push({ id: "room", level: "ok", text: "There's room all around your head." });
    }

    var sharp = crop.pxPerMm / PRINT_PX_PER_MM;
    if (sharp < 0.6) list.push({ id: "detail", level: "bad", text: "Your face is too small in this photo, so the print will be blurry. Move closer or use the back camera." });
    else if (sharp < 0.9) list.push({ id: "detail", level: "warn", text: "Slightly low detail. It should print fine, but a closer photo is sharper." });
    else list.push({ id: "detail", level: "ok", text: "Sharp enough to print." });
    return list;
  }

  // Background check from two patches beside the head, as 0-255 brightness
  // values. Dark or patchy backgrounds are a common reason photos get turned down.
  function background(spec, patches) {
    var all = [], means = [];
    patches.forEach(function (p) {
      var s = 0;
      for (var i = 0; i < p.length; i++) { s += p[i]; all.push(p[i]); }
      means.push(p.length ? s / p.length : 0);
    });
    if (!all.length) return { level: "ok", mean: 0, spread: 0, text: "" };
    var mean = all.reduce(function (a, b) { return a + b; }, 0) / all.length;
    var v = 0;
    for (var j = 0; j < all.length; j++) v += (all[j] - mean) * (all[j] - mean);
    var spread = Math.sqrt(v / all.length);
    var sideGap = means.length > 1 ? Math.abs(means[0] - means[1]) : 0;
    var r = { mean: mean, spread: spread, sideGap: sideGap };
    if (mean < 150) { r.level = "bad"; r.text = "The wall behind you looks dark. It should be " + spec.bg + "."; }
    else if (sideGap > 28) { r.level = "warn"; r.text = "One side is darker than the other. Face a window or move away from the wall to lose the shadow."; }
    else if (spread > 22) { r.level = "warn"; r.text = "The background looks busy or patchy. Stand in front of a plain wall."; }
    else if (mean < 185) { r.level = "warn"; r.text = "The background is a bit dim. More light on the wall helps."; }
    else { r.level = "ok"; r.text = "Background looks plain and light."; }
    return r;
  }

  // Lay as many photos as fit on a print, with a gap to cut along.
  // paper and photo sizes in mm. Tries the paper both ways round.
  function sheet(spec, paper, opts) {
    opts = opts || {};
    var gap = opts.gap == null ? 3 : opts.gap;
    var margin = opts.margin == null ? 3 : opts.margin;
    function fit(W, H) {
      var cols = Math.floor((W - 2 * margin + gap) / (spec.w + gap));
      var rows = Math.floor((H - 2 * margin + gap) / (spec.h + gap));
      return { W: W, H: H, cols: Math.max(0, cols), rows: Math.max(0, rows) };
    }
    var a = fit(paper.w, paper.h), b = fit(paper.h, paper.w);
    var best = b.cols * b.rows > a.cols * a.rows ? b : a;
    var usedW = best.cols * spec.w + (best.cols - 1) * gap;
    var usedH = best.rows * spec.h + (best.rows - 1) * gap;
    var x0 = (best.W - usedW) / 2, y0 = (best.H - usedH) / 2;
    var slots = [];
    for (var r = 0; r < best.rows; r++) {
      for (var c = 0; c < best.cols; c++) {
        slots.push({ x: x0 + c * (spec.w + gap), y: y0 + r * (spec.h + gap), w: spec.w, h: spec.h });
      }
    }
    return { w: best.W, h: best.H, count: slots.length, slots: slots };
  }

  // Photo-counter prints (4x6 / 10x15) and ordinary printer paper (A4, US
  // Letter), so a sheet can be run off at home and the photos cut out. A4 is
  // ISO 216 (210 x 297 mm); US Letter is 8.5 x 11 in (215.9 x 279.4 mm).
  var PAPERS = {
    "4x6": { id: "4x6", name: "4 x 6 in photo print", w: 152.4, h: 101.6 },
    "a6": { id: "a6", name: "10 x 15 cm photo print", w: 150, h: 100 },
    "a4": { id: "a4", name: "A4 paper", w: 210, h: 297 },
    "letter": { id: "letter", name: "US Letter paper", w: 215.9, h: 279.4 }
  };

  // Find the best JPEG quality that stays under a byte limit. encode(q)
  // returns a byte count (or a promise of one). Binary search, 6 steps.
  function fitQuality(encode, maxBytes, lo, hi) {
    lo = lo == null ? 0.5 : lo;
    hi = hi == null ? 0.95 : hi;
    var best = null;
    function step(i, a, b) {
      if (i >= 6) return Promise.resolve(best || { q: a, bytes: null, fits: false });
      var q = (a + b) / 2;
      return Promise.resolve(encode(q)).then(function (bytes) {
        if (bytes <= maxBytes) { best = { q: q, bytes: bytes, fits: true }; return step(i + 1, q, b); }
        return step(i + 1, a, q);
      });
    }
    return Promise.resolve(encode(hi)).then(function (bytes) {
      if (bytes <= maxBytes) return { q: hi, bytes: bytes, fits: true };
      return step(0, lo, hi);
    });
  }

  function mmToPx(mm, dpi) { return Math.round(mm / MM_PER_IN * (dpi || PRINT_DPI)); }

  // Resolution readout: given the pixels in the cropped photo and the spec's
  // print size, the exact dots-per-inch it would print at, and whether the
  // photo is big enough for the country's online form. 300 dpi is the common
  // floor for a sharp print; 600 dpi is the ICAO Doc 9303 quality bar some
  // systems want. The digital minimum is the country's own online-submission
  // pixel size (e.g. US 600x600, Singapore 400x514); a photo smaller than that
  // has to be enlarged to upload, which softens it.
  function resolution(spec, cw, ch) {
    cw = Math.round(cw || 0); ch = Math.round(ch || 0);
    if (!spec || !(cw > 0) || !(ch > 0)) return null;
    var dpi = Math.round(Math.min(cw / (spec.w / MM_PER_IN), ch / (spec.h / MM_PER_IN)));
    var dig = spec.digital || null;
    var meetsDigital = dig ? (cw >= dig.w && ch >= dig.h) : null;
    return {
      cw: cw, ch: ch,
      dpi: dpi,
      meets300: dpi >= 300,
      meets600: dpi >= 600,
      min300: { w: mmToPx(spec.w, 300), h: mmToPx(spec.h, 300) },
      min600: { w: mmToPx(spec.w, 600), h: mmToPx(spec.h, 600) },
      digital: dig,
      meetsDigital: meetsDigital,
      level: dpi < 300 ? "bad" : dpi < 600 ? "warn" : "ok"
    };
  }

  return {
    SPECS: SPECS, PAPERS: PAPERS, PRINT_DPI: PRINT_DPI, PRINT_PX_PER_MM: PRINT_PX_PER_MM,
    headTarget: headTarget, cropFor: cropFor, checks: checks, background: background,
    sheet: sheet, fitQuality: fitQuality, mmToPx: mmToPx, resolution: resolution
  };
});
