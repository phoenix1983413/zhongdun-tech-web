/* ============================================================
   Three.js 场景集 v2 ·「深空指挥舱」
   - 首页 Hero：交互地球（Interactive Earth，真实贴图 + 拖拽/滚轮轨道控制）
   - DX：三维电子沙盘（Tactical Sandbox）
   - RX：多智能体协同网络（Swarm Mesh）
   - EX：知识图谱星云（Knowledge Nebula）

   渲染质量：
     · ACES Filmic 色调映射 + sRGB 输出（真实的高光滚降，不再是死板纯色）
     · 程序化 equirect 天空纹理 → scene.background + IBL 环境光（金属/玻璃材质有真实反射）
     · Hemisphere + Point + Directional 三光源体系
     · 自发光材质 + 加性辉光精灵 + UnrealBloom 泛光
     · 指数雾，营造纵深与空气感
   工程约束：
     · Three.js / addons 全部动态 import()，只有用到才下载
     · DPR 上限 2（Bloom 合成器上限 1.5）；滚出视口 / 页面隐藏 → 停车
     · prefers-reduced-motion → 只渲染一帧静态画面
     · 任一环节失败 → 自动降级 Canvas 2D，页面绝不空白
   ============================================================ */

const REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* 统一色板（与 CSS 令牌一致） */
const C = {
  blue: 0x0066cc,
  brand: 0x1e64c8,
  sky: 0x2f86e0,
  cyan: 0x50aaff,
  bright: 0x7cc6ff,
  light: 0x8cafd7,
  pale: 0xdcebfc,
};

let threePromise = null;
function loadThree() {
  if (!threePromise) threePromise = import('three').catch(() => null);
  return threePromise;
}

let bloomPromise = null;
function loadBloom() {
  if (!bloomPromise) {
    bloomPromise = Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]).catch(() => null);
  }
  return bloomPromise;
}

/* ============================================================
   程序化纹理
   ============================================================ */

/* 辉光精灵：径向渐变圆点（加性混合用） */
let glowTex = null;
function makeGlowTexture(THREE, renderer) {
  if (glowTex) return glowTex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.16, 'rgba(226,242,255,.92)');
  grd.addColorStop(0.36, 'rgba(140,200,255,.45)');
  grd.addColorStop(0.62, 'rgba(60,140,230,.14)');
  grd.addColorStop(1, 'rgba(20,60,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glowTex = t;
  return t;
}

/* equirect 天空：深空底色 + 星点 + 两个品牌光斑 */
const skyCache = {};
function makeSkyTexture(THREE, variant) {
  if (skyCache[variant]) return skyCache[variant];
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const tint = {
    dome: ['#0a1c3a', '#071228', '#030711'],
    dome2: ['#0a1c3a', '#071228', '#030711'],
    sandbox: ['#0a2036', '#061426', '#030910'],
    network: ['#0d1838', '#070f26', '#03060f'],
    graph: ['#111a3c', '#0a1028', '#04060f'],
  }[variant] || ['#0a1c3a', '#071228', '#030711'];

  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, tint[0]);
  grd.addColorStop(0.52, tint[1]);
  grd.addColorStop(1, tint[2]);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // 星点
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.15 + 0.25;
    const a = Math.random() * 0.55 + 0.12;
    g.fillStyle = 'rgba(210,232,255,' + a.toFixed(3) + ')';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // 品牌光斑（主 + 副）
  const blob = (cx, cy, rad, rgb, alpha) => {
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
    rg.addColorStop(0.42, 'rgba(' + rgb + ',' + (alpha * 0.32).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  };
  blob(W * 0.28, H * 0.30, 300, '90,175,255', 0.60);
  blob(W * 0.74, H * 0.52, 260, '30,100,200', 0.55);
  blob(W * 0.52, H * 0.10, 220, '140,200,255', 0.34);

  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  skyCache[variant] = t;
  return t;
}

/* 由天空纹理生成 IBL 环境贴图（金属/玻璃有真实反射） */
let envTexture = null;
function makeEnv(THREE, renderer, skyTex) {
  try {
    if (!envTexture) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const rt = pmrem.fromEquirectangular(skyTex);
      pmrem.dispose();
      envTexture = rt.texture;
    }
    return envTexture;
  } catch (e) {
    return null;
  }
}

/* 地面网格纹理（径向渐隐的网格） */
function makeGridTexture(THREE, size, div, strong) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const step = S / div;
  g.strokeStyle = strong ? 'rgba(110,180,255,.62)' : 'rgba(90,155,230,.34)';
  g.lineWidth = strong ? 2 : 1;
  for (let i = 0; i <= div; i++) {
    const p = Math.round(i * step) + 0.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* 发光竖条（光柱）纹理 */
function makeBeamTexture(THREE) {
  const W = 8, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(160,215,255,.95)');
  grd.addColorStop(0.35, 'rgba(110,185,255,.42)');
  grd.addColorStop(1, 'rgba(60,130,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ============================================================
   工具
   ============================================================ */

/* 鼠标视差（阻尼跟随） */
function makeParallax(stage) {
  let tx = 0, ty = 0, px = 0, py = 0;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  return {
    step() {
      px += (tx - px) * 0.055;
      py += (ty - py) * 0.055;
      return { x: px, y: py };
    },
  };
}

/* 加性辉光精灵 */
function halo(THREE, tex, color, size, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  }));
  sp.scale.setScalar(size);
  return sp;
}

/* ============================================================
   渲染循环：尺寸自适应 + 视口停车 + Bloom 合成
   ============================================================ */
function startScene(o) {
  const { THREE, stage, scene, camera, renderer, update, composer } = o;

  function resize() {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }
  resize();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  let onScreen = true;
  let pageHidden = document.hidden;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }, { threshold: 0 }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => { pageHidden = document.hidden; });

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!onScreen || pageHidden) return;
    const t = clock.getElapsedTime();
    update(t);
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  update(0);
  if (composer) composer.render();
  else renderer.render(scene, camera);
  if (!REDUCE) frame();
}

/* ============================================================
   Canvas 2D 降级（保留并升级：加发光，与新视觉一致）
   ============================================================ */
function fallback2d(canvas, variant) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stage = canvas.parentElement || canvas;
  let W = 0, H = 0, raf = null, t = 0;
  const nodes = [];

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth || 1;
    H = stage.clientHeight || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes.length = 0;
    const n = W < 600 ? 20 : 34;
    for (let i = 0; i < n; i++) {
      nodes.push({
        a: Math.random() * Math.PI * 2,
        r: 0.25 + Math.random() * 0.75,
        h: Math.random() * 0.55 + 0.12,
        s: (Math.random() * 0.35 + 0.12) * (Math.random() < 0.5 ? -1 : 1),
      });
    }
  }

  function draw() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.64, R = Math.min(W, H) * 0.42;

    // 地平线辉光
    const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    hg.addColorStop(0, 'rgba(80,170,255,.20)');
    hg.addColorStop(1, 'rgba(80,170,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, cy - R * 1.4, W, R * 2.8);

    ctx.strokeStyle = 'rgba(110,180,255,.26)';
    ctx.lineWidth = 1;
    const rings = variant === 'graph' ? 6 : 5;
    for (let k = 1; k <= rings; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * (0.28 + k * 0.14), R * (0.15 + k * 0.075), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(Math.PI + a) * R, cy + Math.sin(Math.PI + a) * R * 0.55);
      ctx.stroke();
    }
    nodes.forEach((d) => {
      d.a += 0.004 * d.s;
      const x = cx + Math.cos(d.a) * R * d.r * 1.9;
      const y = cy - Math.sin(d.a) * R * d.r * 0.9 - d.h * R * 0.3;
      ctx.strokeStyle = 'rgba(80,170,255,.22)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, cy); ctx.stroke();
      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(124,198,255,.95)';
      ctx.fillStyle = '#bfe2ff';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
    if (!REDUCE) raf = requestAnimationFrame(draw);
  }

  build();
  window.addEventListener('resize', build);
  draw();
  return () => { if (raf) cancelAnimationFrame(raf); };
}

/* ============================================================
   统一挂载：渲染器 / 光照 / 环境 / 天空 / 雾 / 泛光
   ============================================================ */
async function mount(canvas, variant, build) {
  if (!canvas) return;
  const stage = canvas.parentElement || canvas;
  const THREE = await loadThree();
  if (!THREE) { console.warn('[scene] three 加载失败，降级 Canvas2D'); fallback2d(canvas, variant); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('[scene] renderer 创建失败，降级 Canvas2D:', e);
    fallback2d(canvas, variant);
    return;
  }

  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const scene = new THREE.Scene();

    // 天空 + IBL 环境
    const skyTex = makeSkyTexture(THREE, variant);
    scene.background = skyTex;
    scene.environment = makeEnv(THREE, renderer, skyTex);

    // 指数雾：纵深与空气感
    scene.fog = new THREE.FogExp2(0x061024, 0.036);

    // 三光源体系
    const hemi = new THREE.HemisphereLight(0x9ccdff, 0x0a1428, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xbfe0ff, 1.15);
    key.position.set(4.2, 7.4, 5.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x2f86e0, 0.85);
    rim.position.set(-5.4, -1.6, -4.4);
    scene.add(rim);
    const ptA = new THREE.PointLight(0x50aaff, 26, 22, 2.0);
    ptA.position.set(-3.2, 4.2, 2.6);
    scene.add(ptA);
    const ptB = new THREE.PointLight(0x1e64c8, 22, 20, 2.0);
    ptB.position.set(3.6, -1.4, -3.0);
    scene.add(ptB);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);

    const ctx = {
      THREE, renderer, scene, camera, canvas, stage,
      parallax: makeParallax(stage),
      glow: makeGlowTexture(THREE, renderer),
      beam: makeBeamTexture(THREE),
      lights: { hemi, key, rim, ptA, ptB },
    };

    const update = build(ctx);

    // 泛光后处理（失败则直接渲染）
    let composer = null;
    const wantBloom = !REDUCE && window.innerWidth >= 900 && (navigator.hardwareConcurrency || 8) > 3;
    if (wantBloom) {
      const mods = await loadBloom();
      if (mods) {
        try {
          const [EC, RP, UB, OP] = mods;
          const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
          const c = new EC.EffectComposer(renderer);
          c.setPixelRatio(Math.min(dpr, 1.5));
          c.setSize(w, h);
          c.addPass(new RP.RenderPass(scene, camera));
          const tune = variant === 'earth' ? [0.5, 0.92]
                     : variant === 'graph' ? [0.62, 0.58]
                     : [0.55, 0.58];
          const bloom = new UB.UnrealBloomPass(
            new THREE.Vector2(w, h),
            tune[0],   // strength
            0.72,      // radius
            tune[1]    // threshold
          );
          c.addPass(bloom);
          c.addPass(new OP.OutputPass());
          composer = c;
        } catch (e) {
          composer = null;
        }
      }
    }

    startScene({ THREE, stage, scene, camera, renderer, update, composer });
  } catch (e) {
    console.warn('[scene] 场景构建失败，降级 Canvas2D:', e);
    try { renderer.dispose(); } catch (_) {}
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    canvas.replaceWith(cv);
    fallback2d(cv, variant);
  }
}

/* ============================================================
   1) 首页 Hero —— 交互地球（Interactive Earth）
   - 真实地表贴图（NASA 影像：昼图/法线/高光/夜光/云层，随 BASE_URL 加载）
   - Phong 材质 + 方向光昼夜明暗 + 夜面城市灯光（emissiveMap）
   - Fresnel 大气辉光（BackSide + Additive）+ 3D 星空 + 倾斜轨道卫星
   - 拖拽 = 轨道旋转（阻尼） / 滚轮 = 距离缩放（钳制）
   - 闲置 2.4s 后恢复缓慢自转；贴图加载失败降级为纯色球体
   ============================================================ */
export function heroEarth(canvas) {
  return mount(canvas, 'earth', ({ THREE, renderer, scene, camera, stage, glow, lights }) => {
    camera.position.set(0, 0.9, 8.1);
    camera.lookAt(0, 0, 0);

    /* 夜半球要暗下去，城市灯光才成立 —— 收缩环境系光源 */
    lights.hemi.intensity = 0.22;
    lights.rim.intensity = 0.1;
    lights.ptA.intensity = 5;
    lights.ptB.intensity = 0;

    /* ---------- 贴图异步加载（失败自动降级纯色球） ---------- */
    const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const loadT = (p) => new Promise((res) => loader.load(
      BASE + 'textures/' + p, (t) => res(t), undefined, () => res(null)
    ));
    const maxAniso = renderer.capabilities
      ? Math.min(4, renderer.capabilities.getMaxAnisotropy())
      : 1;

    /* ---------- 地球本体 ---------- */
    const R = 2.3;
    const globe = new THREE.Group();
    scene.add(globe);

    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x9db8d8,                      // 贴图就位前的过渡色
      specular: new THREE.Color(0x2a3a52),  // 海面高光（配合 specularMap）
      shininess: 16,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 72), earthMat);
    globe.add(earth);

    /* 云层（贴图到位后再淡入） */
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 48, 48), cloudMat);
    globe.add(clouds);

    /* 大气辉光：BackSide fresnel */
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.1, 48, 48),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(0x3f9dff) } },
        vertexShader: [
          'varying vec3 vN; varying vec3 vP;',
          'void main(){',
          '  vN = normalize(normalMatrix * normal);',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  vP = mv.xyz;',
          '  gl_Position = projectionMatrix * mv;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor; varying vec3 vN; varying vec3 vP;',
          'void main(){',
          '  float f = pow(clamp(1.0 + dot(normalize(vP), vN), 0.0, 1.0), 4.2);',
          '  gl_FragColor = vec4(uColor, 1.0) * f * 0.24;',
          '}',
        ].join('\n'),
      })
    );
    globe.add(atmo);

    /* ---------- 倾斜轨道 + 巡航卫星（呼应「空天地一体」） ---------- */
    const orbit = new THREE.Group();
    orbit.rotation.set(0.52, 0, 0.34);
    scene.add(orbit);
    orbit.add(new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.55, 0.005, 5, 128),
      new THREE.MeshBasicMaterial({
        color: 0x50aaff, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    ));
    const sat = new THREE.Group();
    sat.add(new THREE.Mesh(
      new THREE.OctahedronGeometry(0.05, 0),
      new THREE.MeshStandardMaterial({
        color: 0xeaf4ff, emissive: 0x7cc6ff, emissiveIntensity: 2.6,
        metalness: 0.7, roughness: 0.25,
      })
    ));
    sat.add(halo(THREE, glow, 0x50aaff, 0.4, 0.9));
    orbit.add(sat);

    /* ---------- 3D 星空（fog 关闭，避免被雾吃掉） ---------- */
    const SN = 1400;
    const spos = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const r = 24 + Math.random() * 24;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      spos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      spos[i * 3 + 1] = r * Math.cos(ph);
      spos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const stars = new THREE.Points(sgeo, new THREE.PointsMaterial({
      map: glow, color: 0xcfe4ff, size: 0.55, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true, fog: false,
    }));
    scene.add(stars);

    /* ---------- 拖拽 / 滚轮 轨道控制（阻尼 + 闲置自转） ---------- */
    const LATMAX = 1.15, DMIN = 4.6, DMAX = 10.5;
    const ctrl = {
      lon: 1.1, lat: 0.28, dist: 8.1,
      tLon: 1.1, tLat: 0.28, tDist: 8.1,
      drag: false, px: 0, py: 0, last: -1e5,
    };
    stage.style.touchAction = 'pan-y';   // 移动端保留纵向滚屏
    stage.style.cursor = 'grab';

    stage.addEventListener('pointerdown', (e) => {
      ctrl.drag = true; ctrl.px = e.clientX; ctrl.py = e.clientY;
      ctrl.last = performance.now();
      stage.style.cursor = 'grabbing';
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    });
    stage.addEventListener('pointermove', (e) => {
      if (!ctrl.drag) return;
      const dx = e.clientX - ctrl.px, dy = e.clientY - ctrl.py;
      ctrl.px = e.clientX; ctrl.py = e.clientY;
      ctrl.tLon -= dx * 0.0045;
      ctrl.tLat = Math.max(-LATMAX, Math.min(LATMAX, ctrl.tLat + dy * 0.0035));
      ctrl.last = performance.now();
    });
    const endDrag = () => { ctrl.drag = false; stage.style.cursor = 'grab'; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      ctrl.tDist = Math.max(DMIN, Math.min(DMAX, ctrl.tDist + d * 0.0035));
      ctrl.last = performance.now();
    }, { passive: false });

    /* ---------- 贴图就位 ---------- */
    Promise.all([
      loadT('earth_atmos_2048.jpg'),   // 昼面色彩
      loadT('earth_normal_2048.jpg'),  // 地形法线
      loadT('earth_specular_2048.jpg'),// 海陆高光分离
      loadT('earth_lights_2048.png'),  // 夜面城市灯光
      loadT('earth_clouds_1024.png'),  // 云层
    ]).then(([map, nrm, spc, lit, cld]) => {
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = maxAniso; earthMat.map = map; earthMat.color.set(0xffffff); }
      if (nrm) { nrm.anisotropy = maxAniso; earthMat.normalMap = nrm; earthMat.normalScale.set(0.85, 0.85); }
      if (spc) { spc.anisotropy = maxAniso; earthMat.specularMap = spc; }
      if (lit) { lit.colorSpace = THREE.SRGBColorSpace; earthMat.emissiveMap = lit; earthMat.emissive = new THREE.Color(0xffd9a0); earthMat.emissiveIntensity = 1.15; }
      if (cld) { cld.colorSpace = THREE.SRGBColorSpace; cld.anisotropy = maxAniso; cloudMat.map = cld; cloudMat.opacity = 0.5; }
      earthMat.needsUpdate = true; cloudMat.needsUpdate = true;
    });

    /* ---------- 逐帧 ---------- */
    const sph = new THREE.Spherical();
    return (t) => {
      /* 闲置 2.4s 后恢复缓慢自转 */
      if (!ctrl.drag && performance.now() - ctrl.last > 2400) ctrl.tLon += 0.0009;

      ctrl.lon += (ctrl.tLon - ctrl.lon) * 0.075;
      ctrl.lat += (ctrl.tLat - ctrl.lat) * 0.075;
      ctrl.dist += (ctrl.tDist - ctrl.dist) * 0.09;

      sph.set(ctrl.dist, Math.PI / 2 - ctrl.lat, ctrl.lon);
      camera.position.setFromSpherical(sph);
      camera.lookAt(0, 0, 0);

      earth.rotation.y = t * 0.02;          // 地球自转（极缓）
      clouds.rotation.y = t * 0.028 + 0.4;  // 云层稍快
      sat.position.set(Math.cos(t * 0.24) * R * 1.55, 0, Math.sin(t * 0.24) * R * 1.55);
      sat.rotation.y = t * 1.2;
      stars.rotation.y = t * 0.0045;
    };
  });
}


/* ============================================================
   2) DX —— 三维电子沙盘
   ============================================================ */
export function productSandbox(canvas) {
  return mount(canvas, 'sandbox', ({ THREE, scene, camera, glow, parallax }) => {
    camera.position.set(0, 3.9, 6.6);
    camera.lookAt(0, 0.55, 0);

    const root = new THREE.Group();
    scene.add(root);

    // ---------- 线框地形（起伏 + 实体底座） ----------
    const geo = new THREE.PlaneGeometry(9, 9, 52, 52);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.sqrt(x * x + z * z);
      let y = Math.sin(x * 0.9) * 0.17 + Math.cos(z * 1.1) * 0.15 + Math.sin((x + z) * 0.6) * 0.1;
      y *= Math.max(0, 1 - d / 5.5);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();

    const terrainSolid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x0b1c34, emissive: 0x0a1c38, emissiveIntensity: 0.5,
      metalness: 0.85, roughness: 0.42,
    }));
    root.add(terrainSolid);
    const terrainWire = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: C.brand, emissive: C.cyan, emissiveIntensity: 1.1,
      wireframe: true, transparent: true, opacity: 0.42,
      metalness: 0.3, roughness: 0.5, depthWrite: false,
    }));
    terrainWire.position.y = 0.004;
    root.add(terrainWire);

    // ---------- 三区（同心环）+ 防区围栏 ----------
    const rings = [];
    [[1.2, C.bright, 0.62], [2.0, C.cyan, 0.5], [2.8, C.brand, 0.36]].forEach(([r, color, op], i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.022, 128),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: op, side: THREE.DoubleSide,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      root.add(ring);
      rings.push(ring);

      // 竖向光栅围栏
      const fence = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.34, 96, 1, true),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.1 + i * 0.015, side: THREE.DoubleSide,
          depthWrite: false, blending: THREE.AdditiveBlending,
          map: makeGridTexture(THREE, 1, 48, false),
        })
      );
      fence.position.y = 0.17;
      root.add(fence);
    });

    // ---------- 航线（管状发光） ----------
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = i / 10 * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(a) * 2.62,
        1.2 + Math.sin(a * 3) * 0.28,
        Math.sin(a) * 2.62
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const route = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 260, 0.008, 6, true),
      new THREE.MeshStandardMaterial({
        color: C.bright, emissive: C.bright, emissiveIntensity: 2.6,
        metalness: 0.2, roughness: 0.4, transparent: true, opacity: 0.95,
      })
    );
    root.add(route);

    // ---------- 飞行器 ----------
    const craft = new THREE.Group();
    const craftBody = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({
        color: 0xf0f8ff, emissive: C.bright, emissiveIntensity: 2.8,
        metalness: 0.85, roughness: 0.2,
      })
    );
    craft.add(craftBody, halo(THREE, glow, C.bright, 0.72, 0.95));
    root.add(craft);

    // 垂线
    const dropPos = new Float32Array(6);
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    root.add(new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({
      color: C.bright, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    // 航迹拖尾粒子
    const TRAIL = 40;
    const trailPos = new Float32Array(TRAIL * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
      map: glow, color: C.bright, size: 0.2, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    root.add(trail);

    // ---------- 扫描立面 ----------
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.6),
      new THREE.MeshBasicMaterial({
        color: C.bright, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
        map: makeGridTexture(THREE, 1, 30, false),
      })
    );
    scan.rotation.y = Math.PI / 2;
    scan.position.y = 1.3;
    root.add(scan);

    // ---------- 目标灯塔（光柱） ----------
    const beacons = [];
    [[2.6, 0.6], [-2.4, 2.1], [-1.1, -2.7]].forEach(([x, z]) => {
      const g = new THREE.Group();
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 1.5, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: C.bright, transparent: true, opacity: 0.34,
          depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        })
      );
      pillar.position.y = 0.75;
      const hd = halo(THREE, glow, C.cyan, 0.42, 0.85);
      hd.position.y = 1.5;
      g.add(pillar, hd);
      g.position.set(x, 0, z);
      root.add(g);
      beacons.push({ g, hd, phase: Math.random() * 6.28 });
    });

    const trailHistory = [];

    return (t) => {
      const m = parallax.step();
      root.rotation.y = t * 0.07 + m.x * 0.32;
      root.rotation.x = -m.y * 0.12;

      const u = (t * 0.085) % 1;
      const p = curve.getPointAt(u);
      craft.position.copy(p);
      craft.rotation.y = t * 1.5;
      craft.rotation.x = t * 0.85;

      dropPos[0] = p.x; dropPos[1] = p.y; dropPos[2] = p.z;
      dropPos[3] = p.x; dropPos[4] = 0; dropPos[5] = p.z;
      dropGeo.attributes.position.needsUpdate = true;

      // 拖尾
      trailHistory.unshift(p.x, p.y, p.z);
      if (trailHistory.length > TRAIL * 3) trailHistory.length = TRAIL * 3;
      for (let i = 0; i < TRAIL; i++) {
        const k = i * 3;
        trailPos[k] = trailHistory[k] || p.x;
        trailPos[k + 1] = trailHistory[k + 1] || p.y;
        trailPos[k + 2] = trailHistory[k + 2] || p.z;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trail.material.opacity = 0.5;

      const s = Math.sin(t * 0.42);
      scan.position.x = s * 4.5;
      scan.material.opacity = 0.16 * (1 - Math.abs(s) * 0.55);

      rings.forEach((r, i) => {
        r.material.opacity = 0.2 + 0.36 * (0.5 + 0.5 * Math.sin(t * 0.9 - i * 1.3));
      });
      terrainWire.material.opacity = 0.36 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.6));
      beacons.forEach((b, i) => {
        const k = 0.6 + 0.4 * Math.sin(t * 1.6 + b.phase);
        b.hd.material.opacity = 0.5 + 0.45 * k;
        b.hd.scale.setScalar(0.36 + 0.16 * k);
      });
    };
  });
}

/* ============================================================
   3) RX —— 多智能体协同网络
   ============================================================ */
export function productAgents(canvas) {
  return mount(canvas, 'network', ({ THREE, scene, camera, glow, parallax }) => {
    camera.position.set(0, 1.5, 7.2);
    camera.lookAt(0, 0, 0);

    const root = new THREE.Group();
    scene.add(root);

    // ---------- 极坐标地面网格 ----------
    const polar = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 96),
      new THREE.MeshBasicMaterial({
        map: makeGridTexture(THREE, 1, 28, false),
        transparent: true, opacity: 0.2, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    polar.rotation.x = -Math.PI / 2;
    polar.position.y = -1.55;
    root.add(polar);

    // ---------- 节点群 ----------
    const groups = [
      { color: C.bright, size: 0.082, n: 8, y: 0.55 },   // 空中
      { color: C.brand, size: 0.104, n: 8, y: -0.25 },   // 地面
      { color: C.pale, size: 0.064, n: 6, y: 0 },        // 穿戴
    ];
    const nodes = [];
    const meshCache = {};

    groups.forEach((g, gi) => {
      const key = g.size.toFixed(3);
      if (!meshCache[key]) {
        meshCache[key] = {
          geo: new THREE.DodecahedronGeometry(g.size, 0),
          mat: new THREE.MeshStandardMaterial({
            color: g.color, emissive: g.color, emissiveIntensity: 1.7,
            metalness: 0.8, roughness: 0.24,
          }),
        };
      }
      for (let i = 0; i < g.n; i++) {
        const r = 1.0 + Math.random() * 2.0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const base = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi) * 0.6 + g.y,
          r * Math.sin(phi) * Math.sin(theta)
        );
        const mesh = new THREE.Mesh(meshCache[key].geo, meshCache[key].mat);
        mesh.position.copy(base);
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        const hd = halo(THREE, glow, g.color, g.size * 7.5, 0.6);
        mesh.add(hd);
        root.add(mesh);
        nodes.push({
          mesh, hd, base,
          phase: Math.random() * Math.PI * 2,
          sp: 0.14 + Math.random() * 0.2,
          rs: (Math.random() - 0.5) * 0.6,
        });
      }
    });

    // ---------- 邻接连线 ----------
    const MAXL = 150;
    const linkPos = new Float32Array(MAXL * 6);
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
    const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(links);

    // ---------- 中枢 ----------
    const hubGroup = new THREE.Group();
    root.add(hubGroup);
    const hub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 1),
      new THREE.MeshStandardMaterial({
        color: C.pale, emissive: C.cyan, emissiveIntensity: 2.2,
        wireframe: true, transparent: true, opacity: 0.85, metalness: 0.5, roughness: 0.4,
      })
    );
    const hubCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: C.bright, emissiveIntensity: 3.4, metalness: 0.9, roughness: 0.15,
      })
    );
    hubGroup.add(hub, hubCore, halo(THREE, glow, C.cyan, 1.5, 0.9));
    const hubRings = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.44 + i * 0.12, 0.006, 5, 76),
        new THREE.MeshStandardMaterial({
          color: C.cyan, emissive: C.cyan, emissiveIntensity: 2.4,
          metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.85,
        })
      );
      r.rotation.set(Math.PI / 2 + i * 0.6, i * 0.8, 0);
      hubGroup.add(r);
      hubRings.push(r);
    }

    // ---------- 脉冲信号 ----------
    const pulses = [];
    for (let i = 0; i < 9; i++) {
      const grp = new THREE.Group();
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: C.bright, emissiveIntensity: 3.2, metalness: 0.4, roughness: 0.3,
        })
      );
      grp.add(dot, halo(THREE, glow, C.cyan, 0.5, 0.9));
      root.add(grp);
      pulses.push({ grp, dot, a: 0, b: 1, t: Math.random(), sp: 0.42 + Math.random() * 0.7 });
    }
    function repick(pu) {
      pu.a = Math.floor(Math.random() * nodes.length);
      pu.b = Math.floor(Math.random() * nodes.length);
      if (pu.b === pu.a) pu.b = (pu.a + 1) % nodes.length;
    }

    // ---------- 星尘 ----------
    const P = 200;
    const ppos = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      const r = 3.2 + Math.random() * 3.6;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      ppos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      ppos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
      ppos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const dust = new THREE.Points(pgeo, new THREE.PointsMaterial({
      map: glow, color: C.light, size: 0.13, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    root.add(dust);

    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

    return (t) => {
      const pa = parallax.step();
      root.rotation.y = t * 0.08 + pa.x * 0.36;
      root.rotation.x = -pa.y * 0.17;

      // 节点漂移 + 自转
      nodes.forEach((n) => {
        n.mesh.position.set(
          n.base.x + Math.sin(t * n.sp + n.phase) * 0.09,
          n.base.y + Math.cos(t * n.sp * 1.2 + n.phase) * 0.08,
          n.base.z + Math.cos(t * n.sp + n.phase * 1.4) * 0.09
        );
        n.mesh.rotation.x += 0.004 * n.rs;
        n.mesh.rotation.y += 0.006 * n.rs;
        n.hd.material.opacity = 0.42 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2 + n.phase));
      });

      // 邻接连线
      let c = 0;
      const TH = 1.46;
      for (let i = 0; i < nodes.length && c < MAXL; i++) {
        for (let j = i + 1; j < nodes.length && c < MAXL; j++) {
          tmpA.copy(nodes[i].mesh.position);
          tmpB.copy(nodes[j].mesh.position);
          if (tmpA.distanceTo(tmpB) < TH) {
            linkPos[c * 6] = tmpA.x; linkPos[c * 6 + 1] = tmpA.y; linkPos[c * 6 + 2] = tmpA.z;
            linkPos[c * 6 + 3] = tmpB.x; linkPos[c * 6 + 4] = tmpB.y; linkPos[c * 6 + 5] = tmpB.z;
            c++;
          }
        }
      }
      linkGeo.setDrawRange(0, c * 2);
      linkGeo.attributes.position.needsUpdate = true;
      links.material.opacity = 0.26 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3));

      // 中枢
      hub.rotation.y = t * 0.42;
      hub.rotation.x = t * 0.24;
      hub.scale.setScalar(1 + Math.sin(t * 1.5) * 0.06);
      hubCore.scale.setScalar(1 + Math.sin(t * 2.4) * 0.14);
      hubRings.forEach((r, i) => {
        r.rotation.z = t * (0.6 + i * 0.5) * (i % 2 ? -1 : 1);
      });

      // 脉冲
      pulses.forEach((pu) => {
        pu.t += 0.006 * pu.sp;
        if (pu.t >= 1) { pu.t = 0; repick(pu); }
        tmpA.copy(nodes[pu.a].mesh.position);
        tmpB.copy(nodes[pu.b].mesh.position);
        pu.grp.position.lerpVectors(tmpA, tmpB, pu.t);
        const k = Math.sin(pu.t * Math.PI);
        pu.grp.scale.setScalar(0.65 + k * 1.0);
        pu.dot.material.emissiveIntensity = 2 + k * 2.4;
      });

      dust.rotation.y = -t * 0.026;
    };
  });
}

/* ============================================================
   4) EX —— 知识图谱星云
   ============================================================ */
export function productGraph(canvas) {
  return mount(canvas, 'graph', ({ THREE, scene, camera, glow, parallax }) => {
    camera.position.set(0, 1.05, 7.8);
    camera.lookAt(0, 0, 0);

    const root = new THREE.Group();
    scene.add(root);

    // ---------- 星云粒子（顶点着色） ----------
    const P = 460;
    const ppos = new Float32Array(P * 3);
    const pcol = new Float32Array(P * 3);
    const cA = new THREE.Color(C.cyan), cB = new THREE.Color(C.brand), cC = new THREE.Color(C.pale);
    for (let i = 0; i < P; i++) {
      const r = 1.5 + Math.random() * 3.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      ppos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      ppos[i * 3 + 1] = r * Math.cos(phi) * 0.66;
      ppos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const col = Math.random() < 0.34 ? cA : (Math.random() < 0.5 ? cB : cC);
      pcol[i * 3] = col.r; pcol[i * 3 + 1] = col.g; pcol[i * 3 + 2] = col.b;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    const stars = new THREE.Points(pgeo, new THREE.PointsMaterial({
      map: glow, size: 0.15, vertexColors: true, transparent: true, opacity: 0.62,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    root.add(stars);

    // ---------- 中枢 ----------
    const hubGroup = new THREE.Group();
    root.add(hubGroup);
    const hub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 2),
      new THREE.MeshStandardMaterial({
        color: C.pale, emissive: C.cyan, emissiveIntensity: 2.1,
        wireframe: true, transparent: true, opacity: 0.8, metalness: 0.6, roughness: 0.34,
      })
    );
    const hubCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.13, 2),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: C.bright, emissiveIntensity: 3.6, metalness: 1, roughness: 0.14,
      })
    );
    hubGroup.add(hub, hubCore, halo(THREE, glow, C.cyan, 1.7, 0.9));
    const hubRings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 + i * 0.14, 0.0058, 5, 80),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? C.bright : C.cyan, emissive: i === 0 ? C.bright : C.cyan,
          emissiveIntensity: 2.4, metalness: 0.3, roughness: 0.4,
          transparent: true, opacity: 0.8,
        })
      );
      r.rotation.set(Math.PI / 2 + i * 0.55, i * 0.9, i * 0.3);
      hubGroup.add(r);
      hubRings.push(r);
    }

    // ---------- 六维簇 ----------
    const clusters = [];
    const edgePts = [];
    const CLUSTER_N = 6;
    const clusterColors = [C.cyan, C.bright, C.brand, C.light, C.cyan, C.brand];

    for (let c = 0; c < CLUSTER_N; c++) {
      const y = 1.1 - (c / (CLUSTER_N - 1)) * 2.2;
      const theta = c * 1.9;
      const rad = 2.2;
      const center = new THREE.Vector3(Math.cos(theta) * rad, y, Math.sin(theta) * rad);
      const color = clusterColors[c];

      const grp = new THREE.Group();
      grp.position.copy(center);
      const cMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.095, 1),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: color, emissiveIntensity: 2.4,
          metalness: 0.85, roughness: 0.2,
        })
      );
      grp.add(cMesh, halo(THREE, glow, color, 0.62, 0.8));
      root.add(grp);

      // 主边
      edgePts.push(0, 0, 0, center.x, center.y, center.z);

      // 叶子节点
      const leaves = [];
      for (let k = 0; k < 4; k++) {
        const lr = 0.5 + Math.random() * 0.55;
        const lt = Math.random() * Math.PI * 2;
        const lp = Math.acos(2 * Math.random() - 1);
        const leaf = new THREE.Vector3(
          center.x + lr * Math.sin(lp) * Math.cos(lt),
          center.y + lr * Math.cos(lp) * 0.82,
          center.z + lr * Math.sin(lp) * Math.sin(lt)
        );
        const lm = new THREE.Mesh(
          new THREE.SphereGeometry(0.036, 10, 10),
          new THREE.MeshStandardMaterial({
            color: C.pale, emissive: C.pale, emissiveIntensity: 1.6, metalness: 0.7, roughness: 0.3,
          })
        );
        lm.position.copy(leaf);
        root.add(lm);
        leaves.push(lm);
        edgePts.push(center.x, center.y, center.z, leaf.x, leaf.y, leaf.z);
      }
      clusters.push({ center, cMesh, grp, leaves, phase: Math.random() * 6.28 });
    }

    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePts), 3));
    root.add(new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({
      color: C.cyan, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    // ---------- 关系流动（沿主边运动的能量点） ----------
    const flows = [];
    for (let i = 0; i < CLUSTER_N; i++) {
      const grp = new THREE.Group();
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: C.bright, emissiveIntensity: 3.2, metalness: 0.5, roughness: 0.3,
        })
      );
      grp.add(dot, halo(THREE, glow, C.cyan, 0.42, 0.9));
      root.add(grp);
      flows.push({ grp, dot, t: Math.random(), sp: 0.35 + Math.random() * 0.4, target: i });
    }

    return (t) => {
      const pa = parallax.step();
      root.rotation.y = t * 0.095 + pa.x * 0.32;
      root.rotation.x = -pa.y * 0.15;

      stars.rotation.y = -t * 0.022;
      stars.material.opacity = 0.5 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.6));

      hub.rotation.y = t * 0.46;
      hub.rotation.x = t * 0.26;
      hub.scale.setScalar(1 + Math.sin(t * 1.55) * 0.055);
      hubCore.rotation.y = -t * 0.7;
      hubCore.rotation.z = t * 0.4;
      hubCore.scale.setScalar(1 + Math.sin(t * 2.3) * 0.13);
      hubRings.forEach((r, i) => {
        r.rotation.z = t * (0.55 + i * 0.34) * (i % 2 ? -1 : 1);
        r.material.emissiveIntensity = 1.8 + 1.2 * (0.5 + 0.5 * Math.sin(t * 1.7 - i));
      });

      clusters.forEach((cl, i) => {
        const k = 1 + Math.sin(t * 1.2 + cl.phase) * 0.1;
        cl.cMesh.scale.setScalar(k);
        cl.cMesh.rotation.y = t * 0.5;
        cl.cMesh.rotation.x = t * 0.3;
      });

      // 能量流动
      flows.forEach((f) => {
        f.t += 0.006 * f.sp;
        if (f.t >= 1) { f.t = 0; f.target = Math.floor(Math.random() * CLUSTER_N); }
        const c = clusters[f.target].center;
        const k = f.t;
        f.grp.position.set(c.x * k, c.y * k, c.z * k);
        const s = Math.sin(k * Math.PI);
        f.grp.scale.setScalar(0.6 + s * 0.9);
        f.dot.material.emissiveIntensity = 2 + s * 2.6;
      });
    };
  });
}
