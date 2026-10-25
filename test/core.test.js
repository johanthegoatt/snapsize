const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");

const marks = (cx, top, chin) => ({ crown: { x: cx, y: top }, chin: { x: cx, y: chin } });

test("every size has a head range inside the photo", () => {
  for (const s of Object.values(C.SPECS)) {
    assert.ok(s.head[0] < s.head[1]);
    assert.ok(s.head[1] < s.h);
    assert.ok(Math.abs(s.digital.w / s.digital.h - s.w / s.h) < 0.01, s.id + " digital keeps the shape");
  }
});

test("UK digital file meets the 600 x 750 minimum", () => {
  const d = C.SPECS.uk.digital;
  assert.ok(d.w >= 600 && d.h >= 750);
});

test("crop makes the head the middle of the allowed range", () => {
  for (const s of Object.values(C.SPECS)) {
    const c = C.cropFor(s, marks(1000, 400, 1000), { w: 2000, h: 3000 });
    const headOnPhoto = 600 / c.pxPerMm;
    assert.ok(headOnPhoto >= s.head[0] && headOnPhoto <= s.head[1], s.id);
    assert.ok(Math.abs(c.w / c.h - s.w / s.h) < 1e-9);
    assert.ok(Math.abs(c.x + c.w / 2 - 1000) < 1e-9, "centred on the face");
  }
});

test("US crop puts the eyes inside the 1 1/8 to 1 3/8 in band", () => {
  const c = C.cropFor(C.SPECS.us, marks(500, 200, 500), { w: 1000, h: 1200 });
  assert.ok(c.eyeFromBottomMm >= 28.575 && c.eyeFromBottomMm <= 34.925, String(c.eyeFromBottomMm));
});

test("crop reports missing photo above the head", () => {
  const c = C.cropFor(C.SPECS.uk, marks(500, 10, 400), { w: 1000, h: 1400 });
  assert.ok(c.outside.top > 0);
  assert.ok(c.missing.top > 0.04);
  const list = C.checks(C.SPECS.uk, marks(500, 10, 400), c);
  const room = list.find((x) => x.id === "room");
  assert.equal(room.level, "bad");
  assert.match(room.text, /above your head/);
});

test("chin above crown is refused", () => {
  assert.throws(() => C.cropFor(C.SPECS.us, marks(0, 500, 400), { w: 1000, h: 1000 }));
});

test("small face in the frame warns about blur", () => {
  // 100 px head on a 32.5 mm target is ~3 px/mm, far under 300 dpi.
  const m = marks(1000, 500, 600);
  const c = C.cropFor(C.SPECS.uk, m, { w: 2000, h: 2000 });
  assert.equal(C.checks(C.SPECS.uk, m, c).find((x) => x.id === "detail").level, "bad");
  const big = marks(1000, 500, 1000);
  const c2 = C.cropFor(C.SPECS.uk, big, { w: 2000, h: 3000 });
  assert.equal(C.checks(C.SPECS.uk, big, c2).find((x) => x.id === "detail").level, "ok");
});

test("tilted head is flagged", () => {
  const m = { crown: { x: 400, y: 200 }, chin: { x: 520, y: 700 } };
  const c = C.cropFor(C.SPECS.us, m, { w: 1000, h: 1200 });
  assert.equal(C.checks(C.SPECS.us, m, c).find((x) => x.id === "tilt").level, "warn");
});

test("Japan and New Zealand are 35 x 45 mm with a 32 to 36 mm head band", () => {
  for (const id of ["jp", "nz"]) {
    const s = C.SPECS[id];
    assert.equal(s.w, 35, id);
    assert.equal(s.h, 45, id);
    assert.deepEqual(s.head, [32, 36], id);
  }
});

test("Japan crop lands the head inside its 32 to 36 mm band", () => {
  const s = C.SPECS.jp;
  // Same 600 px head on a 2000 x 3000 photo as the shared crop test uses.
  const c = C.cropFor(s, marks(1000, 400, 1000), { w: 2000, h: 3000 });
  const headOnPhoto = 600 / c.pxPerMm;
  assert.ok(headOnPhoto >= s.head[0] && headOnPhoto <= s.head[1], String(headOnPhoto));
});

test("a 35 x 45 size like New Zealand tiles six-up on a 4x6", () => {
  assert.equal(C.sheet(C.SPECS.nz, C.PAPERS["4x6"]).count, 6);
});

test("background check", () => {
  const flat = (v, n = 200) => Array(n).fill(v);
  const noisy = (v, amp) => Array.from({ length: 400 }, (_, i) => v + (i % 2 ? amp : -amp));
  const S = C.SPECS.us;
  assert.equal(C.background(S, [flat(235), flat(232)]).level, "ok");
  assert.equal(C.background(S, [flat(90), flat(95)]).level, "bad");
  assert.equal(C.background(S, [flat(240), flat(190)]).level, "warn");
  assert.match(C.background(S, [flat(240), flat(190)]).text, /darker than the other/);
  assert.match(C.background(S, [noisy(210, 40), noisy(210, 40)]).text, /busy/);
  assert.match(C.background(S, [flat(170), flat(172)]).text, /dim/);
});

test("print sheet: two US photos on a 4x6, six 35x45 photos", () => {
  const us = C.sheet(C.SPECS.us, C.PAPERS["4x6"]);
  assert.equal(us.count, 2);
  const uk = C.sheet(C.SPECS.uk, C.PAPERS["4x6"]);
  assert.equal(uk.count, 6);
  const ca = C.sheet(C.SPECS.ca, C.PAPERS["4x6"]);
  assert.equal(ca.count, 2);
  for (const sh of [us, uk, ca]) {
    for (const s of sh.slots) {
      assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= sh.w + 1e-9 && s.y + s.h <= sh.h + 1e-9);
    }
    for (let i = 0; i < sh.slots.length; i++) for (let j = i + 1; j < sh.slots.length; j++) {
      const a = sh.slots[i], b = sh.slots[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, "photos never overlap");
    }
  }
});

test("A4 and Letter fit many more photos than a 4x6 print", () => {
  assert.equal(C.sheet(C.SPECS.us, C.PAPERS.a4).count, 15);
  assert.equal(C.sheet(C.SPECS.uk, C.PAPERS.a4).count, 30);
  assert.equal(C.sheet(C.SPECS.us, C.PAPERS.letter).count, 15);
  // Every photo still sits inside the page with no overlap.
  const sh = C.sheet(C.SPECS.uk, C.PAPERS.a4);
  for (const s of sh.slots) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= sh.w + 1e-9 && s.y + s.h <= sh.h + 1e-9);
  }
});

test("fitQuality finds the highest quality under the limit", async () => {
  const encode = (q) => Math.round(400000 * q * q); // bytes grow with quality
  const r = await C.fitQuality(encode, 240 * 1024);
  assert.ok(r.fits);
  assert.ok(r.bytes <= 240 * 1024);
  assert.ok(encode(r.q + 0.02) > 240 * 1024 || r.q >= 0.94, "close to the limit");
  const easy = await C.fitQuality(() => 1000, 240 * 1024);
  assert.equal(easy.q, 0.95);
  const never = await C.fitQuality(() => 1e9, 1000);
  assert.equal(never.fits, false);
});

test("mmToPx at 300 dpi", () => {
  assert.equal(C.mmToPx(50.8), 600);
  assert.equal(C.mmToPx(152.4), 1800);
});

test("Australia and India sizes are present with the right dimensions", () => {
  assert.equal(C.SPECS.au.w, 35);
  assert.equal(C.SPECS.au.h, 45);
  assert.deepEqual(C.SPECS.au.head, [32, 36]);
  // India is the 2 x 2 inch (51 mm) square.
  assert.ok(Math.abs(C.SPECS.in.w - 50.8) < 0.01);
  assert.ok(Math.abs(C.SPECS.in.h - 50.8) < 0.01);
  assert.deepEqual(C.SPECS.in.head, [25, 35]);
});

test("a crop for the new sizes lands the head inside the band", () => {
  for (const id of ["au", "in"]) {
    const s = C.SPECS[id];
    const c = C.cropFor(s, marks(500, 400, 1000), { w: 2000, h: 3000 });
    assert.ok(c.headMm >= s.head[0] && c.headMm <= s.head[1], id + " head " + c.headMm);
  }
});

test("China visa is the 33 x 48 mm size with a 28 to 33 mm head", () => {
  const s = C.SPECS.cn;
  assert.equal(s.w, 33);
  assert.equal(s.h, 48);
  assert.deepEqual(s.head, [28, 33]);
  // It is a taller, narrower photo than the 35 x 45 crowd, so its own shape.
  assert.ok(s.w / s.h < C.SPECS.uk.w / C.SPECS.uk.h);
  const c = C.cropFor(s, marks(1000, 400, 1000), { w: 2000, h: 3000 });
  assert.ok(Math.abs(c.w / c.h - 33 / 48) < 1e-9);
});

test("Philippines passport is the 35 x 45 mm white-background size", () => {
  const s = C.SPECS.ph;
  assert.equal(s.w, 35);
  assert.equal(s.h, 45);
  assert.deepEqual(s.head, [32, 36]);
  assert.match(s.bg, /white/);
});
