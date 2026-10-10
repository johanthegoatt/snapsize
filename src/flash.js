// Flash, the little camera who helps you get the photo right. Eyes follow
// your pointer (or whatever you tap on a phone), the face changes with the
// checks, a tap gives a tip for the step you're on, and five quick taps
// take a "photo" of you. Everything Flash says goes through a live region.
(function () {
  "use strict";
  var btn = document.getElementById("snap");
  var bubble = document.getElementById("snap-bubble");
  var dock = document.getElementById("snap-dock");
  var hide = document.getElementById("snap-hide");
  var flashout = document.getElementById("flashout");
  if (!btn) return;

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "sleepy", tipKey = "start";
  var flashing = false, flashTimer = null, bubbleTimer = null, tapTimes = [], tipIndex = {};

  var TIPS = {
    start: [
      "Hi, I'm Flash! Pick what the photo is for, then add a photo.",
      "Plain light wall, face a window, glasses off. That's most of it.",
      "Ask a friend to take it with the back camera. Selfies stretch your face.",
      "Leave space above your head. I do the cutting."
    ],
    curious: [
      "Drag the blue line to the very top of your head, hair too.",
      "The orange line goes at the bottom of your chin, not your neck.",
      "Look at the list next to the photo. Fix anything with a mark first.",
      "Turn on the guides: your chin should land in the orange band."
    ],
    worried: [
      "Something needs fixing. The red line in the list says what.",
      "If the photo runs out above your head, take it again from further back.",
      "Dark wall? Try a white door, or hang a plain sheet behind you."
    ],
    happy: [
      "Looking good! Tick the boxes on the right, then save.",
      "For printing, ask for a normal 4 x 6 print with no cropping.",
      "Cut along the grey lines. A ruler and a sharp blade make it neat.",
      "The photo file is ready for online forms that ask for an upload."
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms || 7000);
  }

  function flash(m, ms) {
    setMood(m);
    flashing = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; setMood(baseMood); }, ms || 1400);
  }

  function play(cls) {
    if (still.matches) return;
    btn.classList.remove("hop", "wiggle");
    void btn.offsetWidth;
    btn.classList.add(cls);
  }
  btn.addEventListener("animationend", function () { btn.classList.remove("hop", "wiggle"); });

  function mood(m) {
    baseMood = m === "curious" ? "happy" : m;
    tipKey = m;
    if (!flashing) setMood(baseMood);
  }

  function nextTip() {
    var list = TIPS[tipKey] || TIPS.start;
    var i = tipIndex[tipKey] || 0;
    tipIndex[tipKey] = (i + 1) % list.length;
    return list[i];
  }

  // A white flash over the page, like a camera going off.
  function snap() {
    btn.classList.add("flashing");
    setTimeout(function () { btn.classList.remove("flashing"); }, 400);
    if (still.matches || !flashout) return;
    flashout.classList.remove("go");
    void flashout.offsetWidth;
    flashout.classList.add("go");
  }

  btn.addEventListener("click", function () {
    if (dock.classList.contains("tucked")) {
      dock.classList.remove("tucked");
      remember(false);
      play("hop");
      say("I'm back! Tap me any time for a tip.");
      return;
    }
    var now = Date.now();
    tapTimes = tapTimes.filter(function (t) { return now - t < 1600; });
    tapTimes.push(now);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      snap();
      flash("wow", 1200);
      say("Say cheese! ...Actually, don't. Passport photos want a straight face.");
      return;
    }
    play("hop");
    if (baseMood === "sleepy") flash("happy", 1600);
    say(nextTip());
  });

  hide.addEventListener("click", function () {
    dock.classList.add("tucked");
    bubble.textContent = "";
    remember(true);
  });

  function remember(tucked) {
    try { localStorage.setItem("snapsize.flashTucked", tucked ? "1" : ""); } catch (e) {}
  }

  // Eyes follow the pointer, a few pixels at most.
  var pupils = btn.querySelectorAll(".s-pupil");
  var target = null, frame = 0;
  function look() {
    frame = 0;
    if (!target) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
    var dx = target.x - cx, dy = target.y - cy;
    var d = Math.hypot(dx, dy) || 1;
    var reach = Math.min(1, d / 220);
    var x = (dx / d) * 2.6 * reach, y = (dy / d) * 3 * reach;
    pupils.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; });
  }
  window.addEventListener("pointermove", function (e) {
    target = { x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });
  document.addEventListener("focusin", function (e) {
    var r = e.target.getBoundingClientRect && e.target.getBoundingClientRect();
    if (!r || e.target === btn) return;
    target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (!frame) frame = requestAnimationFrame(look);
  });

  (function blink() {
    setTimeout(function () {
      if (baseMood !== "sleepy" && !document.hidden) {
        btn.classList.add("blink");
        setTimeout(function () { btn.classList.remove("blink"); }, 140);
      }
      blink();
    }, 2600 + Math.random() * 3800);
  })();

  var lastMarkSay = 0;
  function react(what, d) {
    d = d || {};
    switch (what) {
      case "doc": play("hop"); say("Got it: " + d.name + ". I'll use their sizes."); break;
      case "photo":
        play("hop");
        flash("wow", 1000);
        say("Nice photo! Now move the two lines to the top of your head and your chin.");
        tipKey = "curious";
        if (baseMood === "sleepy") baseMood = "happy";
        break;
      case "oops": flash("worried", 1600); play("wiggle"); say("Hmm, I couldn't use that. The red note says why."); break;
      case "marked":
        if (Date.now() - lastMarkSay < 4000) break;
        lastMarkSay = Date.now();
        if (d.worst === "ok") { play("hop"); say("That fits the rules. Tick your boxes, then save."); }
        else if (d.worst === "warn") say("Close! Check the yellow note in the list.");
        else { flash("worried", 1400); say("One thing to fix first. Look for the red mark."); }
        break;
      case "allticked": play("hop"); flash("wow", 1000); say("All ticked. You're ready to save!"); break;
      case "saved":
        snap();
        flash("wow", 1200);
        if (d.what === "sheet") say("Saved! Print it as a normal 4 x 6, no cropping, and you get " + d.count + " photos.", 9000);
        else say("Saved! The file is " + d.kb + " KB, ready to upload.", 8000);
        break;
    }
  }

  function start() {
    try { if (localStorage.getItem("snapsize.flashTucked")) dock.classList.add("tucked"); } catch (e) {}
    setTimeout(function () {
      if (!bubble.textContent) say("Hi, I'm Flash! I'll help you make a passport photo. Tap me for tips.");
    }, 700);
  }

  window.Flash = {
    say: say,
    mood: mood,
    react: react,
    start: start
  };
})();
