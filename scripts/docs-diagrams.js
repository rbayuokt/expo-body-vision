#!/usr/bin/env node
// Builds the generated README diagrams (joint map, rep cycle from a real fixture) as SVG, then
// renders every docs/*.svg to a 2x PNG with headless Chrome. Colours follow the example app.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const C = {
  bg: '#0B0D0C',
  panel: '#111512',
  card: '#1A1F1C',
  hairline: 'rgba(255,255,255,0.10)',
  text: '#F4F7F2',
  muted: '#8C968F',
  faint: '#4A524D',
  lime: '#C6FF3D',
  cyan: '#3DD6FF',
  coral: '#FF6B4A',
  violet: '#8B5CFF',
  amber: '#FFC23D',
};
const FONT = "Inter, 'SF Pro Display', Helvetica, Arial, sans-serif";

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
  <rect width="${width}" height="${height}" fill="${C.bg}"/>
${body}
</svg>
`;
}

function header(label, title, subtitle) {
  return `  <text x="30" y="46" fill="${C.lime}" font-size="13" font-weight="700" letter-spacing="3">${label}</text>
  <text x="30" y="80" fill="${C.text}" font-size="26" font-weight="800" letter-spacing="-0.5">${title}</text>
  ${subtitle ? `<text x="30" y="106" fill="${C.muted}" font-size="15">${subtitle}</text>` : ''}`;
}

// Joint map. The figure faces the viewer, so the person's left is on the viewer's right.
function jointMap() {
  const W = 1500;
  const H = 900;
  const cx = 880;
  const P = {
    nose: [cx, 214], leftEyeInner: [cx + 12, 200], leftEye: [cx + 22, 198], leftEyeOuter: [cx + 32, 200],
    rightEyeInner: [cx - 12, 200], rightEye: [cx - 22, 198], rightEyeOuter: [cx - 32, 200],
    leftEar: [cx + 46, 212], rightEar: [cx - 46, 212], mouthLeft: [cx + 12, 236], mouthRight: [cx - 12, 236],
    leftShoulder: [cx + 88, 300], rightShoulder: [cx - 88, 300],
    leftElbow: [cx + 150, 400], rightElbow: [cx - 150, 400],
    leftWrist: [cx + 196, 492], rightWrist: [cx - 196, 492],
    leftPinky: [cx + 222, 520], rightPinky: [cx - 222, 520],
    leftIndex: [cx + 208, 530], rightIndex: [cx - 208, 530],
    leftThumb: [cx + 186, 522], rightThumb: [cx - 186, 522],
    leftHip: [cx + 56, 530], rightHip: [cx - 56, 530],
    leftKnee: [cx + 66, 672], rightKnee: [cx - 66, 672],
    leftAnkle: [cx + 74, 806], rightAnkle: [cx - 74, 806],
    leftHeel: [cx + 64, 830], rightHeel: [cx - 64, 830],
    leftFootIndex: [cx + 110, 836], rightFootIndex: [cx - 110, 836],
  };
  const order = Object.keys(P);
  const index = Object.fromEntries(
    [
      'nose', 'leftEyeInner', 'leftEye', 'leftEyeOuter', 'rightEyeInner', 'rightEye', 'rightEyeOuter',
      'leftEar', 'rightEar', 'mouthLeft', 'mouthRight', 'leftShoulder', 'rightShoulder', 'leftElbow',
      'rightElbow', 'leftWrist', 'rightWrist', 'leftPinky', 'rightPinky', 'leftIndex', 'rightIndex',
      'leftThumb', 'rightThumb', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle',
      'rightAnkle', 'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex',
    ].map((n, i) => [n, i])
  );
  const bones = [
    ['leftShoulder', 'rightShoulder'], ['leftHip', 'rightHip'], ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
    ['leftWrist', 'leftIndex'], ['rightWrist', 'rightIndex'], ['leftAnkle', 'leftFootIndex'], ['rightAnkle', 'rightFootIndex'],
    ['leftAnkle', 'leftHeel'], ['rightAnkle', 'rightHeel'],
  ];
  const side = (n) => (n.startsWith('left') || n === 'mouthLeft' ? C.lime : n.startsWith('right') || n === 'mouthRight' ? C.cyan : C.text);
  const main = ['leftShoulder', 'leftElbow', 'leftWrist', 'leftHip', 'leftKnee', 'leftAnkle', 'rightShoulder', 'rightElbow', 'rightWrist', 'rightHip', 'rightKnee', 'rightAnkle', 'nose'];

  let body = header('JOINTS', '33 joints, named from the person&#8217;s own side', 'The person faces you, so their left side is on your right.');
  body += `\n  <circle cx="${cx}" cy="212" r="58" fill="none" stroke="${C.hairline}" stroke-width="2"/>`;
  for (const [a, b] of bones) {
    body += `\n  <line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="rgba(244,247,242,0.55)" stroke-width="4" stroke-linecap="round"/>`;
  }
  for (const n of order) {
    const r = main.includes(n) ? 7 : 4;
    body += `\n  <circle cx="${P[n][0]}" cy="${P[n][1]}" r="${r}" fill="${side(n)}"/>`;
  }
  // Labels for the large joints, with leader lines out to the sides.
  const labelled = [
    ['nose', 170], ['leftShoulder', 300], ['leftElbow', 400], ['leftWrist', 480], ['leftHip', 560], ['leftKnee', 672], ['leftAnkle', 790],
    ['rightShoulder', 300], ['rightElbow', 400], ['rightWrist', 480], ['rightHip', 560], ['rightKnee', 672], ['rightAnkle', 790],
  ];
  for (const [n, y] of labelled) {
    const [x0, y0] = P[n];
    const right = n.startsWith('left') || n === 'nose';
    const lx = n === 'nose' ? cx + 180 : right ? cx + 330 : cx - 330;
    const anchor = right ? 'start' : 'end';
    const tx = right ? lx + 12 : lx - 12;
    body += `\n  <path d="M${x0} ${y0} L${lx} ${y}" stroke="${C.faint}" stroke-width="1.2" fill="none"/>`;
    body += `\n  <text x="${tx}" y="${y + 5}" text-anchor="${anchor}" fill="${side(n)}" font-size="17" font-weight="700">${n}</text>`;
    body += `\n  <text x="${right ? tx : tx}" y="${y + 24}" text-anchor="${anchor}" fill="${C.muted}" font-size="12">${index[n]}</text>`;
  }
  // Small joints grouped into two cards.
  const card = (x, y, title, lines) => {
    let out = `\n  <rect x="${x}" y="${y}" width="300" height="${56 + lines.length * 22}" rx="16" fill="${C.card}" stroke="${C.hairline}"/>`;
    out += `\n  <text x="${x + 20}" y="${y + 32}" fill="${C.text}" font-size="15" font-weight="700">${title}</text>`;
    lines.forEach((l, i) => {
      out += `\n  <text x="${x + 20}" y="${y + 58 + i * 22}" fill="${C.muted}" font-size="13">${l}</text>`;
    });
    return out;
  };
  body += card(30, 150, 'Face', ['left/rightEyeInner  1, 4', 'left/rightEye  2, 5', 'left/rightEyeOuter  3, 6', 'left/rightEar  7, 8', 'mouthLeft, mouthRight  9, 10']);
  body += card(30, 380, 'Hands', ['left/rightPinky  17, 18', 'left/rightIndex  19, 20', 'left/rightThumb  21, 22']);
  body += card(30, 560, 'Feet', ['left/rightHeel  29, 30', 'left/rightFootIndex  31, 32']);
  body += `\n  <circle cx="${W - 300}" cy="${H - 40}" r="7" fill="${C.lime}"/><text x="${W - 284}" y="${H - 35}" fill="${C.muted}" font-size="14">person&#8217;s left</text>`;
  body += `\n  <circle cx="${W - 160}" cy="${H - 40}" r="7" fill="${C.cyan}"/><text x="${W - 144}" y="${H - 35}" fill="${C.muted}" font-size="14">person&#8217;s right</text>`;
  return svg(W, H, body);
}

// Rep cycle, drawn from fixtures/pushup-partial-noisy.csv and its verified event trace.
function repCycle() {
  const csv = fs.readFileSync(path.join(ROOT, 'fixtures/pushup-partial-noisy.csv'), 'utf8').split('\n');
  const golden = fs.readFileSync(path.join(ROOT, 'fixtures/golden/pushup-partial-noisy.txt'), 'utf8').trim().split('\n');
  let aspect = 1;
  const samples = [];
  for (const line of csv) {
    if (line.startsWith('# aspect: ')) aspect = Number(line.slice(10));
    if (!line || line.startsWith('#')) continue;
    const v = line.split(',').map(Number);
    if (v[1] !== 1) continue;
    const j = (i) => [v[2 + i * 3] * aspect, v[3 + i * 3]];
    const [s, e, w] = [j(11), j(13), j(15)];
    const a = Math.atan2(s[1] - e[1], s[0] - e[0]) - Math.atan2(w[1] - e[1], w[0] - e[0]);
    let deg = Math.abs((a * 180) / Math.PI);
    if (deg > 180) deg = 360 - deg;
    samples.push([v[0], deg]);
  }
  const events = golden.map((l) => l.split(' ')).map(([t, type, , extra]) => ({ t: Number(t), type, extra }));

  const W = 1400;
  const H = 700;
  const x0 = 120;
  const x1 = 1360;
  const y0 = 160;
  const y1 = 480;
  const tMax = Math.ceil(samples[samples.length - 1][0] / 500) * 500;
  const X = (t) => x0 + ((x1 - x0) * t) / tMax;
  const Y = (deg) => y1 - ((y1 - y0) * (deg - 60)) / 120;

  let body = header('REPS', 'Why a rep counts, or doesn&#8217;t', 'Elbow angle from the test recording of two push-ups and a half rep, with the events the engine produced.');
  body += `\n  <rect x="${x0 - 20}" y="${y0 - 20}" width="${x1 - x0 + 40}" height="${y1 - y0 + 140}" rx="22" fill="${C.panel}" stroke="${C.hairline}"/>`;

  // Phase bands along the bottom.
  const phaseColor = { top: C.lime, descending: C.cyan, bottom: C.violet, ascending: C.amber, ready: C.faint };
  const phases = events.filter((e) => e.type === 'exercisePhase');
  phases.forEach((p, i) => {
    const end = i + 1 < phases.length ? phases[i + 1].t : tMax;
    body += `\n  <rect x="${X(Math.max(p.t, 0))}" y="${y1 + 30}" width="${Math.max(2, X(end) - X(Math.max(p.t, 0)) - 2)}" height="16" rx="4" fill="${phaseColor[p.extra]}" fill-opacity="0.8"/>`;
  });

  // Thresholds.
  const line = (deg, colour, dash, label) =>
    `\n  <line x1="${x0}" x2="${x1}" y1="${Y(deg)}" y2="${Y(deg)}" stroke="${colour}" stroke-width="1.5" ${dash ? 'stroke-dasharray="6 6"' : ''}/>` +
    `\n  <text x="${x0 - 12}" y="${Y(deg) + 4}" text-anchor="end" fill="${colour}" font-size="12">${label}</text>`;
  body += line(150, C.lime, false, 'top 150°');
  body += line(140, C.faint, true, '140°');
  body += line(110, C.faint, true, '110°');
  body += line(100, C.violet, false, 'bottom 100°');

  // The angle itself.
  const d = samples.map(([t, deg], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(deg).toFixed(1)}`).join(' ');
  body += `\n  <path d="${d}" fill="none" stroke="${C.text}" stroke-width="2.5" stroke-linejoin="round"/>`;

  // Rep and rejection markers.
  for (const e of events) {
    if (e.type !== 'repCompleted' && e.type !== 'repRejected') continue;
    const counted = e.type === 'repCompleted';
    const colour = counted ? C.lime : C.coral;
    const label = counted ? `Rep ${e.extra}` : 'Not counted, incomplete';
    const w = counted ? 76 : 200;
    body += `\n  <line x1="${X(e.t)}" x2="${X(e.t)}" y1="${y0 - 6}" y2="${y1}" stroke="${colour}" stroke-width="1.5" stroke-dasharray="3 5"/>`;
    body += `\n  <rect x="${X(e.t) - w / 2}" y="${y0 - 38}" width="${w}" height="28" rx="14" fill="${colour}"/>`;
    body += `\n  <text x="${X(e.t)}" y="${y0 - 19}" text-anchor="middle" fill="${C.bg}" font-size="13" font-weight="800">${label}</text>`;
  }

  // Time axis.
  for (let t = 0; t <= tMax; t += 1000) {
    body += `\n  <text x="${X(t)}" y="${y1 + 72}" text-anchor="middle" fill="${C.muted}" font-size="12">${t / 1000} s</text>`;
  }
  const legend = [['top', C.lime], ['going down', C.cyan], ['bottom', C.violet], ['coming up', C.amber]];
  legend.forEach(([name, colour], i) => {
    const x = x0 + i * 150;
    body += `\n  <rect x="${x}" y="${H - 62}" width="16" height="16" rx="4" fill="${colour}"/><text x="${x + 24}" y="${H - 49}" fill="${C.muted}" font-size="14">${name}</text>`;
  });
  body += `\n  <text x="${x1}" y="${H - 49}" text-anchor="end" fill="${C.muted}" font-size="14">A rep is also rejected when it&#8217;s too fast, too slow, breaks form or loses tracking</text>`;
  return svg(W, H, body);
}

// Time per pose in `auto` mode, the same readings as the README tables.
const BENCHMARK = [
  { phone: 'iPhone 11 Pro', rows: [['MediaPipe Lite, iOS default', 26, C.lime], ['Apple Vision, example backend', 25, C.cyan]] },
  {
    phone: 'OPPO CPH2217, low-end Android',
    rows: [
      ['ML Kit, Android default', 60, C.lime],
      ['MediaPipe Lite', 103, C.cyan],
      ['MediaPipe Full', 132, C.cyan],
      ['MediaPipe Heavy, file', 489, C.coral],
    ],
  },
];

function benchmarkChart() {
  const W = 1400;
  const rowH = 46;
  const rows = BENCHMARK.reduce((n, g) => n + g.rows.length, 0);
  const H = 300 + rows * rowH + BENCHMARK.length * 56;
  const x0 = 360;
  const x1 = 1300;
  const max = 500;
  const X = (ms) => x0 + ((x1 - x0) * ms) / max;

  let body = header('PERFORMANCE', 'Time per pose on real phones', 'Release builds in auto mode, lower is better. The overlay held 60 fps in every run, however slow the model was.');
  let y = 150;
  const top = y;
  for (const group of BENCHMARK) {
    body += `\n  <text x="30" y="${y + 20}" fill="${C.text}" font-size="15" font-weight="800">${group.phone}</text>`;
    y += 40;
    for (const [label, ms, colour] of group.rows) {
      body += `\n  <text x="${x0 - 16}" y="${y + 21}" text-anchor="end" fill="${C.muted}" font-size="14">${label}</text>`;
      body += `\n  <rect x="${x0}" y="${y + 4}" width="${Math.max(4, X(ms) - x0)}" height="26" rx="8" fill="${colour}" fill-opacity="0.9"/>`;
      body += `\n  <text x="${X(ms) + 10}" y="${y + 23}" fill="${C.text}" font-size="15" font-weight="800">${ms} ms</text>`;
      y += rowH;
    }
    y += 16;
  }
  const bottom = y;
  // One camera frame at 30 fps.
  body += `\n  <line x1="${X(33)}" x2="${X(33)}" y1="${top - 4}" y2="${bottom}" stroke="${C.text}" stroke-opacity="0.5" stroke-dasharray="4 5"/>`;
  body += `\n  <text x="${X(33) + 8}" y="${top + 8}" fill="${C.muted}" font-size="12">one camera frame at 30 fps</text>`;
  for (let ms = 0; ms <= max; ms += 100) {
    body += `\n  <text x="${X(ms)}" y="${bottom + 24}" text-anchor="middle" fill="${C.faint}" font-size="12">${ms} ms</text>`;
  }
  // Conditions callout, so nobody reads these as cool, unplugged numbers.
  const boxY = H - 92;
  body += `\n  <rect x="30" y="${boxY}" width="${W - 60}" height="68" rx="16" fill="${C.amber}" fill-opacity="0.12" stroke="${C.amber}" stroke-width="1.5"/>`;
  body += `\n  <circle cx="66" cy="${boxY + 34}" r="15" fill="${C.amber}"/>`;
  body += `\n  <text x="66" y="${boxY + 40}" text-anchor="middle" fill="${C.bg}" font-size="18" font-weight="900">!</text>`;
  body += `\n  <text x="96" y="${boxY + 29}" fill="${C.amber}" font-size="12" font-weight="800" letter-spacing="2">HEADS UP</text>`;
  body += `\n  <text x="96" y="${boxY + 51}" fill="${C.text}" font-size="16" font-weight="600">Both phones were charging and warm during these runs, so cool phones should do better. Accuracy between models hasn&#8217;t been compared yet.</text>`;
  return svg(W, H, body);
}

fs.writeFileSync(path.join(DOCS, 'joint-map.svg'), jointMap());
fs.writeFileSync(path.join(DOCS, 'benchmarks.svg'), benchmarkChart());
fs.writeFileSync(path.join(DOCS, 'rep-cycle.svg'), repCycle());

if (!fs.existsSync(CHROME)) {
  console.log('SVGs written. Set CHROME to a Chrome binary to render the PNGs.');
  process.exit(0);
}
for (const file of fs.readdirSync(DOCS).filter((f) => f.endsWith('.svg'))) {
  const src = path.join(DOCS, file);
  const [, w, h] = fs.readFileSync(src, 'utf8').match(/width="(\d+)" height="(\d+)"/);
  const out = src.replace(/\.svg$/, '.png');
  spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${src}`], { stdio: 'ignore' });
  console.log(`rendered ${path.relative(ROOT, out)}`);
}
