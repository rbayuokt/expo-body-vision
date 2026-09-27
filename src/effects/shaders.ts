// SkSL sources for the built-in effects. Every shader returns premultiplied color.
//
// Hit looks share one contract, the same one `createImpactEffect` documents for custom shaders:
// center (view points), progress (0 to 1), radius, tint (rgb 0 to 1), seed (0 to 1), and the
// optional switches useLines, useFlash, useRing (0 or 1).

const HASH = `
float hash(float n) { return fract(sin(n * 127.1 + seed * 311.7) * 43758.5453); }
float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7)) + seed * 91.3) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1.0, 0.0)), u.x),
             mix(hash2(i + float2(0.0, 1.0)), hash2(i + float2(1.0, 1.0)), u.x), u.y);
}
float fbm(float2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
`;

const HIT_UNIFORMS = `
uniform float2 center;
uniform float progress;
uniform float radius;
uniform float3 tint;
uniform float seed;
uniform float useLines;
uniform float useFlash;
uniform float useRing;
`;

// Speed lines from the edges, a jagged starburst with an ink outline, a white core, a
// shockwave and a short flash.
export const ANIME = `${HIT_UNIFORMS}${HASH}
half4 main(float2 p) {
  float2 v = p - center;
  float d = length(v);
  float a01 = atan(v.y, v.x) / 6.2831853 + 0.5;
  float fade = 1.0 - progress;

  float k = a01 * 13.0;
  float i = floor(k);
  float tri = 1.0 - abs(fract(k) * 2.0 - 1.0);
  float pop = smoothstep(0.0, 0.14, progress);
  float starR = radius * (0.32 + 0.68 * tri * mix(0.4, 1.0, hash(i))) * pop * (1.0 + 0.3 * progress);
  float starFade = 1.0 - smoothstep(0.3, 0.65, progress);
  float fill = smoothstep(starR, starR - 3.0, d) * starFade;
  float ink = (smoothstep(starR + 6.0, starR + 3.0, d) - smoothstep(starR, starR - 3.0, d)) * starFade;
  float3 starColor = mix(float3(1.0), tint, smoothstep(starR * 0.25, starR, d));

  float lk = a01 * 72.0;
  float li = floor(lk);
  float lineOn = step(0.4, hash(li + 90.0));
  float lineW = 0.06 + 0.2 * hash(li + 50.0);
  float line = lineOn * smoothstep(lineW, 0.0, abs(fract(lk) - 0.5));
  float inner = radius * (1.3 + 1.8 * hash(li + 7.0)) * (0.85 + 0.6 * progress);
  float lines = useLines * line * smoothstep(inner, inner + 80.0, d) * (1.0 - smoothstep(0.0, 0.5, progress)) * 0.9;

  float ringR = radius * (0.4 + 1.6 * sqrt(progress));
  float ring = useRing * smoothstep(5.0 * fade + 1.5, 0.0, abs(d - ringR)) * fade * 0.8;
  float flash = useFlash * (1.0 - smoothstep(0.0, 0.1, progress)) * 0.18;

  float3 c = float3(1.0);
  float a = flash;
  c = mix(c, float3(1.0), lines); a = max(a, lines);
  c = mix(c, tint, ring); a = max(a, ring);
  c = mix(c, float3(0.04), ink); a = max(a, ink);
  c = mix(c, starColor, fill); a = max(a, fill);
  return half4(half3(c * a), half(a));
}
`;

// Jagged bolts crack out from the hit and flicker, with a hot white center and a flash.
// useLines adds a crackle of thin arcs around the hit.
export const LIGHTNING = `${HIT_UNIFORMS}${HASH}
float jag(float t, float i) {
  return sin(t * 0.09 + i * 3.1 + seed * 20.0) * 14.0
       + sin(t * 0.23 + i * 7.3) * 7.0
       + sin(t * 0.51 + i * 1.7 + progress * 40.0) * 4.0;
}

half4 main(float2 p) {
  float2 v = p - center;
  float d = length(v);
  float fade = 1.0 - progress;
  float reach = radius * 2.2 * smoothstep(0.0, 0.15, progress);
  float glow = 0.0;
  float core = 0.0;
  for (int k = 0; k < 7; k++) {
    float i = float(k);
    float ang = hash(i) * 6.2831853;
    float2 dir = float2(cos(ang), sin(ang));
    float2 perp = float2(-dir.y, dir.x);
    float t = dot(v, dir);
    float len = reach * mix(0.55, 1.0, hash(i + 3.0));
    if (t > 0.0 && t < len) {
      float off = dot(v, perp) - jag(t, i) * smoothstep(0.0, 40.0, t);
      float taper = 1.0 - t / (len + 1.0);
      float on = step(0.3, hash(i + floor(progress * 18.0) * 7.0));
      glow += on * exp(-abs(off) / (7.0 * taper + 1.0)) * taper;
      core += on * smoothstep(2.2 * taper + 0.6, 0.0, abs(off)) * taper;
    }
  }
  float a01 = atan(v.y, v.x) / 6.2831853 + 0.5;
  float arcs = useLines * step(0.75, hash(floor(a01 * 40.0) + floor(progress * 12.0) * 5.0))
             * smoothstep(3.0, 0.0, abs(d - radius * (0.9 + 0.4 * hash(floor(a01 * 40.0)))))
             * fade;
  float hot = exp(-d / (radius * 0.22)) * fade * fade;
  float ring = useRing * smoothstep(3.0, 0.0, abs(d - radius * (0.3 + 1.4 * progress))) * fade * 0.6;
  float flash = useFlash * (1.0 - smoothstep(0.0, 0.08, progress)) * 0.25;

  glow = clamp(glow * fade, 0.0, 1.0);
  core = clamp(core * fade, 0.0, 1.0);
  float3 c = tint * max(glow, max(ring, arcs)) + float3(1.0) * max(core, hot);
  float a = clamp(max(max(glow, core), max(hot, max(ring, arcs))) + flash, 0.0, 1.0);
  c = min(c + float3(flash), float3(1.0));
  return half4(half3(c), half(a));
}
`;

// A flame burst that billows up from the hit, white-yellow at the heart, with embers rising.
export const FIRE = `${HIT_UNIFORMS}${HASH}
half4 main(float2 p) {
  float2 q = (p - center) / radius;
  q.y = -q.y;
  float grow = smoothstep(0.0, 0.2, progress);
  float fade = 1.0 - smoothstep(0.35, 1.0, progress);
  float n = fbm(float2(q.x * 2.5, q.y * 2.5 - progress * 3.0));
  float shape = 1.0 - length(float2(q.x * 1.1, (q.y - 0.35 * progress) * 0.7)) / (1.1 * grow + 0.01);
  float flame = clamp(shape + n * 0.9 - 0.45, 0.0, 1.0) * fade;
  float3 col = mix(tint, float3(1.0, 0.82, 0.3), smoothstep(0.15, 0.55, flame));
  col = mix(col, float3(1.0), smoothstep(0.7, 1.0, flame));
  float a = smoothstep(0.0, 0.2, flame);

  float2 g = q * 6.0 + float2(0.0, -progress * 5.0);
  float2 cell = floor(g);
  float2 f = fract(g) - 0.5 - (float2(hash2(cell + 3.0), hash2(cell + 5.0)) - 0.5) * 0.6;
  float ember = step(0.88, hash2(cell)) * smoothstep(0.1, 0.0, length(f)) * (1.0 - progress)
              * step(length(q), 2.0) * step(-0.2, q.y);
  float ring = useRing * smoothstep(4.0, 0.0, abs(length(p - center) - radius * (0.3 + 1.3 * progress))) * (1.0 - progress) * 0.5;
  float flash = useFlash * (1.0 - smoothstep(0.0, 0.1, progress)) * 0.15;

  float3 c = col * a + float3(1.0, 0.75, 0.3) * ember + tint * ring + float3(flash);
  float alpha = clamp(max(max(a, ember), ring) + flash, 0.0, 1.0);
  return half4(half3(min(c, float3(1.0))), half(alpha));
}
`;

// A blocky 8-bit explosion: a ring of big pixels flying out, a flickering core and sparks.
export const PIXEL = `${HIT_UNIFORMS}${HASH}
half4 main(float2 p) {
  float block = max(6.0, radius * 0.09);
  float2 cell = floor(p / block);
  float2 v = (cell + 0.5) * block - center;
  float d = length(v);
  float fade = 1.0 - progress;
  float r = radius * (0.2 + 1.2 * progress);
  float band = step(abs(d - r), block * 1.6 * fade + block * 0.5);
  float keep = step(0.3, hash2(cell + floor(progress * 8.0)));
  float core = step(d, radius * 0.4 * (1.0 - progress * 1.4));
  float a01 = atan(v.y, v.x) / 6.2831853 + 0.5;
  float ray = step(0.8, hash(floor(a01 * 16.0))) * step(d, r * 1.25) * step(r * 0.5, d) * step(0.5, fract(d / (block * 2.0)));
  float flash = useFlash * step(progress, 0.06) * 0.3;
  float ring = useRing * band * keep;
  float3 c = float3(0.0);
  float a = 0.0;
  c = mix(c, tint, ring); a = max(a, ring);
  c = mix(c, float3(1.0, 0.9, 0.35), ray * fade); a = max(a, ray * fade);
  c = mix(c, float3(1.0), core); a = max(a, core);
  a = max(a * step(0.02, fade), flash);
  c = mix(c, float3(1.0), flash);
  return half4(half3(c * a), half(a));
}
`;

// Glass breaking where the hit landed: radial and ring cracks, then shards that fall away.
export const SHATTER = `${HIT_UNIFORMS}${HASH}
half4 main(float2 p) {
  float2 v = p - center;
  float d = length(v);
  float a01 = atan(v.y, v.x) / 6.2831853 + 0.5;
  float fade = 1.0 - smoothstep(0.5, 1.0, progress);
  float grow = smoothstep(0.0, 0.12, progress);

  float cracks = 0.0;
  for (int k = 0; k < 10; k++) {
    float i = float(k);
    float ang = (i + hash(i) * 0.6) / 10.0 * 6.2831853;
    float2 dir = float2(cos(ang), sin(ang));
    float t = dot(v, dir);
    float len = radius * mix(1.0, 1.7, hash(i + 4.0)) * grow;
    if (t > 0.0 && t < len) {
      float zig = (abs(fract(t / 22.0 + hash(i + 8.0)) * 2.0 - 1.0) - 0.5) * 5.0;
      float off = dot(v, float2(-dir.y, dir.x)) - zig * smoothstep(0.0, 20.0, t);
      cracks = max(cracks, smoothstep(2.2, 0.0, abs(off)) * (1.0 - t / (len + 1.0) * 0.5));
    }
  }
  float ringGap = step(0.35, hash(floor(a01 * 14.0) + 20.0));
  float rings = useRing * ringGap * grow
              * max(smoothstep(2.4, 0.0, abs(d - radius * 0.35 - sin(a01 * 60.0) * 3.0)),
                    smoothstep(2.4, 0.0, abs(d - radius * 0.8 - sin(a01 * 90.0 + 1.0) * 4.0)));

  float shard = 0.0;
  for (int s = 0; s < 8; s++) {
    float si = float(s);
    float mid = (si + 0.5) / 8.0 * 6.2831853 - 3.14159265;
    float2 dir = float2(cos(mid), sin(mid));
    float2 shift = dir * progress * radius * 0.5 + float2(0.0, progress * progress * radius * 1.4);
    float2 w = p - shift - center;
    float wa = atan(w.y, w.x) / 6.2831853 + 0.5;
    float wd = length(w);
    float inside = step(floor(wa * 8.0), si) * step(si, floor(wa * 8.0)) * step(radius * 0.35, wd) * step(wd, radius * 0.8);
    shard = max(shard, inside * step(0.3, progress) * (0.18 + 0.2 * hash(si)));
  }
  float flash = useFlash * (1.0 - smoothstep(0.0, 0.08, progress)) * 0.3;
  float lines = max(cracks, rings) * fade;
  float3 c = mix(tint, float3(1.0), 0.6);
  float a = clamp(max(lines, shard * (1.0 - progress)) + flash, 0.0, 1.0);
  return half4(half3(c * a), half(a));
}
`;

// Rep slam: a shockwave and burst rays from the middle of the view.
export const SLAM = `${HIT_UNIFORMS}${HASH}
half4 main(float2 p) {
  float2 v = p - center;
  float d = length(v);
  float fade = 1.0 - progress;
  float r = radius * (0.25 + 1.3 * sqrt(progress));
  float ring = smoothstep(10.0 * fade + 2.0, 0.0, abs(d - r)) * fade;
  float a01 = atan(v.y, v.x) / 6.2831853 + 0.5;
  float rays = step(0.55, hash(floor(a01 * 36.0))) * smoothstep(0.3, 0.0, abs(fract(a01 * 36.0) - 0.5))
             * step(radius * 0.4, d) * smoothstep(r * 1.2, r * 0.5, d) * fade;
  float flash = useFlash * (1.0 - smoothstep(0.0, 0.1, progress)) * 0.12;
  float a = clamp(max(ring, rays * 0.8) + flash, 0.0, 1.0);
  float3 c = mix(tint, float3(1.0), ring * 0.4 + flash);
  return half4(half3(c * a), half(a));
}
`;

// Level up: a golden ring sweeping around once and sparkles drifting up.
export const LEVEL_UP = `${HIT_UNIFORMS}${HASH}
half4 main(float2 p) {
  float2 v = p - center;
  float d = length(v);
  float a01 = atan(v.y, v.x) / 6.2831853 + 0.5;
  float fade = 1.0 - smoothstep(0.6, 1.0, progress);
  float sweep = smoothstep(0.0, 0.5, progress);
  float arc = step(fract(a01 - 0.25 + 1.0), sweep);
  float r = radius * (0.9 + 0.1 * progress);
  float ring = arc * smoothstep(5.0, 0.0, abs(d - r)) * fade;
  float glow = arc * exp(-abs(d - r) / 18.0) * fade * 0.6;

  float2 g = float2(v.x, v.y + progress * radius * 1.2) / (radius * 0.18);
  float2 cell = floor(g);
  float2 f = fract(g) - 0.5;
  float star = step(0.85, hash2(cell)) * smoothstep(0.18, 0.0, abs(f.x) * abs(f.y) * 8.0 + length(f) * 0.4)
             * step(length(v), radius * 1.6) * (1.0 - progress);
  float a = clamp(max(max(ring, glow), star), 0.0, 1.0);
  float3 c = mix(tint, float3(1.0), max(ring * 0.5, star));
  return half4(half3(c * a), half(a));
}
`;

// Flames licking in from every edge. intensity 0 to 1, time in seconds.
export const FEVER = `
uniform float2 size;
uniform float time;
uniform float intensity;
uniform float3 tint;
uniform float seed;
${HASH}
half4 main(float2 p) {
  float edge = min(min(p.x, size.x - p.x), min(p.y, size.y - p.y));
  float reach = mix(14.0, 64.0, intensity);
  float2 q = p / float2(38.0, 70.0);
  float n = fbm(q + float2(0.0, time * 2.2)) * 0.8 + fbm(q * 2.3 + float2(time * 0.5, time * 3.4)) * 0.5;
  float flame = clamp(1.0 - edge / (reach * (0.35 + n)), 0.0, 1.0) * intensity;
  float pulse = 0.85 + 0.15 * sin(time * (6.0 + 10.0 * intensity));
  float a = smoothstep(0.1, 0.8, flame) * pulse * 0.85;
  float3 c = mix(tint, float3(1.0, 0.85, 0.35), smoothstep(0.5, 0.95, flame));
  c = mix(c, float3(1.0), smoothstep(0.9, 1.0, flame));
  return half4(half3(c * a), half(a));
}
`;

// An energy aura rising from the bottom and sides: bright vertical streaks that flicker upward.
export const AURA = `
uniform float2 size;
uniform float time;
uniform float intensity;
uniform float3 tint;
uniform float seed;
${HASH}
half4 main(float2 p) {
  float fromBottom = size.y - p.y;
  float side = min(p.x, size.x - p.x);
  float column = floor(p.x / 9.0);
  float speed = 0.6 + hash(column) * 1.4;
  float streak = step(0.55, hash(column + 11.0));
  float flow = fract(p.y / size.y * 3.0 + time * speed + hash(column + 3.0));
  float s = streak * smoothstep(0.0, 0.25, flow) * smoothstep(1.0, 0.45, flow);
  float height = size.y * mix(0.08, 0.45, intensity) * (0.6 + 0.4 * fbm(float2(column * 0.3, time)));
  float fromEdges = min(fromBottom / height, side / (24.0 + 60.0 * intensity));
  float body = clamp(1.0 - fromEdges, 0.0, 1.0);
  body = body * body;
  float a = clamp((body * 0.45 + s * body) * intensity, 0.0, 1.0);
  float3 c = mix(tint, float3(1.0), s * body * 0.6);
  return half4(half3(c * a), half(a));
}
`;

// Confetti falling from above the view: tumbling paper strips in five colors.
export const CONFETTI = `
uniform float2 size;
uniform float progress;
uniform float seed;
uniform float3 c0;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;
uniform float3 c4;
float hash(float n) { return fract(sin(n * 127.1 + seed * 311.7) * 43758.5453); }

half4 main(float2 p) {
  float3 col = float3(0.0);
  float a = 0.0;
  for (int k = 0; k < 56; k++) {
    float i = float(k);
    float x0 = hash(i) * size.x;
    float y0 = -hash(i + 1.0) * size.y * 0.6 - 20.0;
    float fall = progress * size.y * (1.1 + hash(i + 2.0) * 0.8);
    float2 pos = float2(x0 + sin(progress * 9.0 + i) * 30.0, y0 + fall);
    float ang = progress * (6.0 + hash(i + 3.0) * 14.0) + i;
    float2 d = p - pos;
    float2 r = float2(d.x * cos(ang) - d.y * sin(ang), d.x * sin(ang) + d.y * cos(ang));
    float w = 5.0 + 3.0 * hash(i + 4.0);
    float h = w * (0.35 + 0.65 * abs(sin(progress * 12.0 + i)));
    float piece = step(abs(r.x), w) * step(abs(r.y), h);
    if (piece > 0.0) {
      float pick = hash(i + 5.0) * 5.0;
      col = pick < 1.0 ? c0 : pick < 2.0 ? c1 : pick < 3.0 ? c2 : pick < 4.0 ? c3 : c4;
      a = 1.0 - smoothstep(0.8, 1.0, progress);
    }
  }
  return half4(half3(col * a), half(a));
}
`;
