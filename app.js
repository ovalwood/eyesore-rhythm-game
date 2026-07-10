// -----------------------------------------------------------------------------
// Setup and game-wide configuration
// -----------------------------------------------------------------------------
// chart.js runs before this file and exposes its song data on `window`.
const C = window.EYESORE_CHART,
  canvas = document.querySelector("#game"),
  ctx = canvas.getContext("2d"),
  audio = document.querySelector("#song");
const $ = (s) => document.querySelector(s),
  buttons = [...document.querySelectorAll("#controls button")],
  screens = {
    title: $("#title-screen"),
    pause: $("#pause-screen"),
    controls: $("#controls-screen"),
    results: $("#results-screen"),
  };
const LANES = 4,
  // Notes become visible this many seconds before their scheduled hit time.
  APPROACH = 1.48,
  // The receptors sit 82% of the way down the canvas.
  HIT = 0.82,
  // Maximum timing error, in seconds, for each judgment.
  WIN = { perfect: 0.06, good: 0.115, bad: 0.175 };

// Mutable values for the current playthrough. `state` prevents input from being
// judged while the player is on a menu, paused, or watching a countdown.
let state = "title",
  chart = [],
  score = 0,
  combo = 0,
  maxCombo = 0,
  weighted = 0,
  judgedCount = 0,
  j = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 },
  raf,
  lastSection = "";

// -----------------------------------------------------------------------------
// Screen, canvas, and HUD helpers
// -----------------------------------------------------------------------------
function showOnly(n) {
  Object.entries(screens).forEach(([k, e]) =>
    e.classList.toggle("hidden", k !== n),
  );
}
function hideScreens() {
  Object.values(screens).forEach((e) => e.classList.add("hidden"));
}
function resize() {
  // Match the canvas's internal pixel size to its CSS size. Scaling by the
  // device pixel ratio keeps arrows sharp on high-density phone screens.
  let r = canvas.getBoundingClientRect(),
    d = devicePixelRatio || 1;
  canvas.width = Math.round(r.width * d);
  canvas.height = Math.round(r.height * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
function reset() {
  // Clone the source notes because `done` and `missed` are runtime-only flags.
  // This leaves the original chart untouched for the next playthrough.
  chart = C.notes.map((n) => ({ ...n, done: false, missed: false }));
  score = combo = maxCombo = weighted = judgedCount = 0;
  j = { PERFECT: 0, GOOD: 0, BAD: 0, MISS: 0 };
  audio.currentTime = 0;
  updateHud();
  lastSection = "";
}
function accuracy() {
  // Accuracy is weighted: GOOD and BAD receive partial credit, MISS gets none.
  return judgedCount ? (100 * weighted) / judgedCount : 100;
}
function updateHud() {
  $("#score").textContent = score.toLocaleString();
  $("#combo").textContent = combo;
  $("#accuracy").textContent = accuracy().toFixed(1) + "%";
}
function feedback(name, offset) {
  let box = $("#timing-flash");
  box.className = name.toLowerCase();
  $("#timing-word").textContent = name;
  $("#timing-offset").textContent =
    offset == null
      ? ""
      : Math.round(Math.abs(offset) * 1000) +
        " ms " +
        (offset > 0 ? "EARLY" : "LATE");
  // Reading offsetWidth restarts the CSS animation even for repeated judgments.
  void box.offsetWidth;
  box.classList.add("show");
}
function burst() {
  if (combo > 0 && combo % 10 === 0) {
    let e = $("#combo-burst");
    e.textContent = combo + " COMBO";
    void e.offsetWidth;
    e.classList.add("show");
  }
}

// -----------------------------------------------------------------------------
// Input judgment and scoring
// -----------------------------------------------------------------------------
function judge(name, offset = null) {
  j[name]++;
  judgedCount++;
  let pts = { PERFECT: 1000, GOOD: 650, BAD: 250, MISS: 0 }[name],
    w = { PERFECT: 1, GOOD: 0.72, BAD: 0.35, MISS: 0 }[name];
  weighted += w;
  if (name === "MISS") {
    combo = 0;
  } else {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    score += pts + combo * 4;
  }
  feedback(name, offset);
  burst();
  updateHud();
}
function hit(lane) {
  if (state !== "playing") return;
  flash(lane);

  // Find the unjudged note in this lane that is closest to the song's current
  // playback time. A press outside the BAD window counts as an empty MISS.
  let now = audio.currentTime,
    c = chart
      .filter((n) => n.lane === lane && !n.done && !n.missed)
      .sort((a, b) => Math.abs(a.time - now) - Math.abs(b.time - now))[0];
  if (!c || Math.abs(c.time - now) > WIN.bad) return judge("MISS");
  let o = c.time - now,
    d = Math.abs(o);
  c.done = true;
  if (d <= WIN.perfect) judge("PERFECT", o);
  else if (d <= WIN.good) judge("GOOD", o);
  else judge("BAD", o);
}
function flash(l) {
  buttons[l].classList.add("active");
  setTimeout(() => buttons[l].classList.remove("active"), 75);
}
function section(now) {
  let s = C.sections.find((x) => now >= x.start && now < x.end);
  if (s && s.name !== lastSection) {
    lastSection = s.name;
    let e = $("#section-label");
    e.textContent = s.name;
    void e.offsetWidth;
    e.classList.add("show");
  }
}

// -----------------------------------------------------------------------------
// Main render loop
// -----------------------------------------------------------------------------
function draw() {
  let w = canvas.clientWidth,
    h = canvas.clientHeight,
    lw = w / LANES,
    hy = h * HIT,
    now = audio.currentTime;
  ctx.clearRect(0, 0, w, h);

  // Paint the playfield and alternating lane backgrounds.
  let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#090910");
  g.addColorStop(1, "#1c1822");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let l = 0; l < 4; l++) {
    ctx.fillStyle = l % 2 ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.055)";
    ctx.fillRect(l * lw, 0, lw, h);
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.beginPath();
    ctx.moveTo(l * lw, 0);
    ctx.lineTo(l * lw, h);
    ctx.stroke();
  }
  // Draw the horizontal hit line and the four stationary receptors.
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#fff";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, hy, w, 4);
  ctx.shadowBlur = 0;
  drawReceptors(ctx, w, hy, lw);
  // Convert each upcoming note's time into a vertical position. A note starts
  // at y=0 and reaches the receptor line exactly when `until` reaches zero.
  for (const n of chart) {
    if (n.done || n.missed) continue;
    let until = n.time - now;
    if (until > APPROACH || until < -WIN.bad) continue;
    let y = (1 - until / APPROACH) * hy,
      x = n.lane * lw + lw / 2;
    ctx.fillStyle = "#f8f7fb";
    ctx.strokeStyle = "#111118";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(255,255,255,.75)";
    drawArrow(ctx, x, y, lw * 0.29, n.lane, true);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (state === "playing") {
    // Notes that pass the largest timing window without input become misses.
    for (const n of chart)
      if (!n.done && !n.missed && now - n.time > WIN.bad) {
        n.missed = true;
        judge("MISS");
      }
    section(now);
    $("#progress-fill").style.width =
      Math.min(100, (now / C.duration) * 100) + "%";
  }
  // The loop always runs so menus still show the playfield behind their overlay.
  raf = requestAnimationFrame(draw);
}

function drawReceptors(c, w, hy, lw) {
  for (let l = 0; l < 4; l++) {
    let x = l * lw + lw / 2;
    c.save();
    c.globalAlpha = 0.9;
    c.fillStyle = "rgba(12,12,18,.82)";
    c.strokeStyle = "#fff";
    c.lineWidth = 3;
    c.shadowBlur = 10;
    c.shadowColor = "rgba(255,255,255,.5)";
    drawArrow(c, x, hy, lw * 0.31, l, false);
    c.fill();
    c.stroke();
    c.restore();
  }
}
function drawArrow(c, x, y, size, lane) {
  c.save();
  c.translate(x, y);
  // Build one upward arrow path, then rotate it for left/up/down/right lanes.
  let rot = [-Math.PI / 2, 0, Math.PI, Math.PI / 2][lane];
  c.rotate(rot);
  c.beginPath();
  c.moveTo(0, -size);
  c.lineTo(size * 0.95, 0);
  c.lineTo(size * 0.42, 0);
  c.lineTo(size * 0.42, size * 0.82);
  c.lineTo(-size * 0.42, size * 0.82);
  c.lineTo(-size * 0.42, 0);
  c.lineTo(-size * 0.95, 0);
  c.closePath();
  c.restore();
}

// Kept as a general canvas helper for future note/effect shapes.
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// -----------------------------------------------------------------------------
// Game flow: countdown, pause, menus, and results
// -----------------------------------------------------------------------------
function countText(t) {
  let e = $("#countdown");
  e.textContent = t;
  void e.offsetWidth;
  e.classList.add("show");
}
async function countdown(restart) {
  state = "countdown";
  hideScreens();
  audio.pause();
  if (restart) reset();
  for (const x of ["3", "2", "1", "GO"]) {
    countText(x);
    await new Promise((r) => setTimeout(r, 470));
  }
  // Browsers can reject audio playback if it was not triggered by user input.
  try {
    await audio.play();
    state = "playing";
  } catch (e) {
    state = "title";
    showOnly("title");
  }
}
function pause() {
  if (state !== "playing") return;
  audio.pause();
  state = "paused";
  showOnly("pause");
}
async function resume() {
  if (state !== "paused") return;
  hideScreens();
  state = "countdown";
  for (const x of ["3", "2", "1"]) {
    countText(x);
    await new Promise((r) => setTimeout(r, 420));
  }
  await audio.play();
  state = "playing";
}
function quit() {
  audio.pause();
  audio.currentTime = 0;
  state = "title";
  showOnly("title");
}
function finish() {
  state = "results";
  let a = accuracy(),
    grade = a >= 95 ? "S" : a >= 88 ? "A" : a >= 78 ? "B" : a >= 65 ? "C" : "D";
  $("#result-grade").textContent = grade;
  $("#result-score").textContent = score.toLocaleString();
  $("#result-accuracy").textContent =
    a.toFixed(2) + "% accuracy · max combo " + maxCombo;
  $("#result-stats").innerHTML = Object.entries(j)
    .map(([k, v]) => `<span>${k}<br><b>${v}</b></span>`)
    .join("");
  showOnly("results");
}

// -----------------------------------------------------------------------------
// Touch, mouse, keyboard, and browser event wiring
// -----------------------------------------------------------------------------
$("#start-button").onclick = () => countdown(true);
$("#pause-button").onclick = () =>
  state === "playing" ? pause() : state === "paused" ? resume() : 0;
$("#resume-button").onclick = resume;
$("#restart-button").onclick = () => countdown(true);
$("#menu-button").onclick = quit;
$("#controls-button").onclick = () => showOnly("controls");
$("#controls-back-button").onclick = () => showOnly("title");
$("#play-again-button").onclick = () => countdown(true);
$("#results-menu-button").onclick = quit;
buttons.forEach(
  (b) =>
    (b.onpointerdown = (e) => {
      e.preventDefault();
      hit(+b.dataset.lane);
    }),
);
let keys = { ArrowLeft: 0, ArrowUp: 1, ArrowDown: 2, ArrowRight: 3 };
addEventListener("keydown", (e) => {
  if (keys[e.code] != null) {
    e.preventDefault();
    if (!e.repeat) hit(keys[e.code]);
    return;
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    e.preventDefault();
    state === "playing"
      ? pause()
      : state === "paused"
        ? resume()
        : state === "controls"
          ? showOnly("title")
          : 0;
  } else if (e.code === "KeyR" && (state === "playing" || state === "paused")) {
    e.preventDefault();
    countdown(true);
  } else if (
    (e.code === "Enter" || e.code === "Space") &&
    !e.repeat &&
    (state === "title" || state === "results")
  ) {
    e.preventDefault();
    countdown(true);
  }
});
audio.onended = finish;
// Avoid letting the song continue invisibly when a phone locks or changes tabs.
document.addEventListener(
  "visibilitychange",
  () => document.hidden && state === "playing" && pause(),
);
addEventListener("resize", resize);

// Initial boot: prepare a fresh run, show the title, and start rendering.
resize();
reset();
showOnly("title");
draw();
