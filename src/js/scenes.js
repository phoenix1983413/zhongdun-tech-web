/* ============================================================
   Three.js 场景集
   - 首页 Hero：低空防御穹顶
   - DX：三维电子沙盘
   - RX：多智能体协同网络
   - EX：知识图谱星云
   工程约束（沿用参考站经验）：
     · Three.js 动态 import()，仅用到时才下载
     · DPR 上限 2；滚出视口 / 页面隐藏 → 渲染循环停车
     · prefers-reduced-motion → 只渲染一帧静态画面
     · Three.js 加载失败 → 自动降级 Canvas 2D，页面绝不空白
   ============================================================ */

const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const C = {
  blue: 0x0066cc,
  brand: 0x1e64c8,
  cyan: 0x50aaff,
  light: 0x8cafd7,
  pale: 0xdcebfc,
};

let threePromise = null;
function loadThree() {
  if (!threePromise) threePromise = import('three').catch(() => null);
  return threePromise;
}

/* ---------- 鼠标视差 ---------- */
function makeParallax(stage) {
  let tx = 0, ty = 0, px = 0, py = 0;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  return {
    step() { px += (tx - px) * 0.06; py += (ty - py) * 0.06; return { x: px, y: py }; },
  };
}

/* ---------- 渲染循环：尺寸自适应 + 视口停车 ---------- */
function startScene(o) {
  const { THREE, stage, scene, camera, renderer, update } = o;

  function resize() {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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
  let raf = null;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!onScreen || pageHidden) return;
    update(clock.getElapsedTime());
    renderer.render(scene, camera);
  }
  update(0);
  renderer.render(scene, camera);
  if (!REDUCE) frame();
}

/* ---------- Canvas 2D 降级 ---------- */
function fallback2d(canvas, variant) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stage = canvas.parentElement || canvas;
  let W = 0, H = 0, dpr = 1, raf = null, t = 0;
  const nodes = [];

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth || 1;
    H = stage.clientHeight || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes.length = 0;
    const n = W < 600 ? 22 : 38;
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
    const cx = W / 2, cy = H * 0.62, R = Math.min(W, H) * 0.42;

    ctx.strokeStyle = 'rgba(30,100,200,.20)';
    ctx.lineWidth = 1;
    const rings = variant === 'graph' ? 6 : 5;
    for (let k = 1; k <= rings; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * (0.28 + k * 0.14), R * (0.15 + k * 0.075), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI;
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
      ctx.fillStyle = 'rgba(0,102,204,.85)';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    });
    if (!REDUCE) raf = requestAnimationFrame(draw);
  }

  build();
  window.addEventListener('resize', build);
  draw();
}

/* ---------- 统一挂载 ---------- */
async function mount(canvas, variant, build) {
  if (!canvas) return;
  const stage = canvas.parentElement || canvas;
  const THREE = await loadThree();
  if (!THREE) { fallback2d(canvas, variant); return; }
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const ctx = { THREE, scene, camera, renderer, canvas, stage, parallax: makeParallax(stage) };
    const update = build(ctx);
    startScene({ THREE, stage, scene, camera, renderer, update });
  } catch (e) {
    fallback2d(canvas, variant);
  }
}

/* ============================================================
   1) 首页 Hero —— 低空防御穹顶
   ============================================================ */
export function heroDome(canvas) {
  return mount(canvas, 'dome', ({ THREE, scene, camera, stage, parallax }) => {
    camera.position.set(0, 2.6, 7.4);
    camera.lookAt(0, 1.15, 0);

    const root = new THREE.Group();
    scene.add(root);

    function dome(r, seg, opacity, color, scaleY) {
      const g = new THREE.SphereGeometry(r, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity, depthWrite: false });
      const mesh = new THREE.Mesh(g, m);
      if (scaleY) mesh.scale.y = scaleY;
      return mesh;
    }
    const domeA = dome(3.15, 30, 0.15, C.brand);
    const domeB = dome(2.15, 20, 0.22, C.cyan, 0.92);
    root.add(domeA, domeB);

    const grid = new THREE.GridHelper(13, 26, C.light, C.pale);
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    root.add(grid);

    const rings = [];
    [1.1, 1.9, 2.7].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.016, 96),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? C.cyan : C.brand, transparent: true, opacity: 0.28,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      root.add(ring);
      rings.push(ring);
    });

    const N = 16;
    const drones = [];
    const linePos = new Float32Array(N * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.22 })
    );
    root.add(lines);

    const droneGeo = new THREE.SphereGeometry(0.045, 8, 8);
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(droneGeo, new THREE.MeshBasicMaterial({ color: C.blue }));
      m.userData = {
        a: Math.random() * Math.PI * 2,
        rad: 1.5 + Math.random() * 1.6,
        h: 0.5 + Math.random() * 2.1,
        sp: (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1),
      };
      root.add(m);
      drones.push(m);
    }

    const scan = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.008, 6, 90),
      new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.5, depthWrite: false })
    );
    scan.rotation.x = Math.PI / 2;
    root.add(scan);

    return (t) => {
      const p = parallax.step();
      root.rotation.y = t * 0.09 + p.x * 0.28;
      root.rotation.x = -p.y * 0.16;
      domeB.rotation.y = -t * 0.22;
      domeA.rotation.y = t * 0.06;

      const pos = lineGeo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const d = drones[i], u = d.userData;
        u.a += 0.006 * u.sp;
        const x = Math.cos(u.a) * u.rad;
        const z = Math.sin(u.a) * u.rad;
        const y = u.h + Math.sin(t * 0.9 + i) * 0.08;
        d.position.set(x, y, z);
        d.scale.setScalar(0.85 + Math.sin(t * 2.4 + i) * 0.15);
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x; pos[i * 6 + 4] = 0; pos[i * 6 + 5] = z;
      }
      lineGeo.attributes.position.needsUpdate = true;

      const k = Math.sin(t * 0.5) * 0.5 + 0.5;
      scan.position.y = 0.1 + k * 2.6;
      scan.material.opacity = 0.5 * (1 - Math.abs(k - 0.5) * 1.2);
      rings.forEach((r, i) => {
        r.material.opacity = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.1 - i * 1.2));
      });
    };
  });
}

/* ============================================================
   2) DX —— 三维电子沙盘
   ============================================================ */
export function productSandbox(canvas) {
  return mount(canvas, 'dome', ({ THREE, scene, camera, stage, parallax }) => {
    camera.position.set(0, 3.7, 6.4);
    camera.lookAt(0, 0.5, 0);

    const root = new THREE.Group();
    scene.add(root);

    // 线框地形
    const geo = new THREE.PlaneGeometry(9, 9, 46, 46);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.sqrt(x * x + z * z);
      let y = Math.sin(x * 0.9) * 0.16 + Math.cos(z * 1.1) * 0.14 + Math.sin((x + z) * 0.6) * 0.1;
      y *= Math.max(0, 1 - d / 5.4);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: C.brand, wireframe: true, transparent: true, opacity: 0.30, depthWrite: false,
    }));
    root.add(terrain);

    // 三区三防同心环
    const rings = [];
    [[1.2, C.cyan, 0.30], [2.0, C.brand, 0.24], [2.8, C.light, 0.18]].forEach(([r, color, op]) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.02, 96),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      root.add(ring);
      rings.push(ring);
    });

    // 航线
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = i / 8 * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 2.6, 1.15 + Math.sin(a * 3) * 0.24, Math.sin(a) * 2.6));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const routeGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(180));
    root.add(new THREE.Line(routeGeo, new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.55 })));

    // 飞行器标记 + 垂线
    const craft = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: C.cyan })
    );
    root.add(craft);
    const dropPos = new Float32Array(6);
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    root.add(new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.3 })));

    // 扫描立面
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.4),
      new THREE.MeshBasicMaterial({
        color: C.cyan, transparent: true, opacity: 0.09, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    scan.rotation.y = Math.PI / 2;
    scan.position.y = 1.2;
    root.add(scan);

    return (t) => {
      const m = parallax.step();
      root.rotation.y = t * 0.075 + m.x * 0.3;
      root.rotation.x = -m.y * 0.12;

      const u = (t * 0.11) % 1;
      const p = curve.getPointAt(u);
      craft.position.copy(p);
      craft.rotation.y = t * 1.6;
      craft.rotation.x = t * 0.9;

      dropPos[0] = p.x; dropPos[1] = p.y; dropPos[2] = p.z;
      dropPos[3] = p.x; dropPos[4] = 0; dropPos[5] = p.z;
      dropGeo.attributes.position.needsUpdate = true;

      const s = Math.sin(t * 0.42);
      scan.position.x = s * 4.4;
      scan.material.opacity = 0.11 * (1 - Math.abs(s) * 0.6);

      rings.forEach((r, i) => {
        r.material.opacity = 0.12 + 0.20 * (0.5 + 0.5 * Math.sin(t * 0.9 - i * 1.3));
      });
    };
  });
}

/* ============================================================
   3) RX —— 多智能体协同网络
   ============================================================ */
export function productAgents(canvas) {
  return mount(canvas, 'network', ({ THREE, scene, camera, stage, parallax }) => {
    camera.position.set(0, 1.6, 7.0);
    camera.lookAt(0, 0, 0);

    const root = new THREE.Group();
    scene.add(root);

    const groups = [
      { color: C.cyan, size: 0.078, n: 8 },   // 空中
      { color: C.blue, size: 0.098, n: 8 },   // 地面
      { color: C.pale, size: 0.062, n: 6 },   // 穿戴
    ];
    const nodes = [];
    const nodeGeoCache = {};

    groups.forEach((g, gi) => {
      const key = g.size.toFixed(3);
      if (!nodeGeoCache[key]) nodeGeoCache[key] = new THREE.SphereGeometry(g.size, 10, 10);
      for (let i = 0; i < g.n; i++) {
        const r = 1.0 + Math.random() * 2.0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const base = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi) * 0.62 + (gi === 0 ? 0.5 : gi === 1 ? -0.25 : 0),
          r * Math.sin(phi) * Math.sin(theta)
        );
        const mesh = new THREE.Mesh(nodeGeoCache[key], new THREE.MeshBasicMaterial({ color: g.color }));
        mesh.position.copy(base);
        root.add(mesh);
        nodes.push({ mesh, base, phase: Math.random() * Math.PI * 2, sp: 0.14 + Math.random() * 0.2 });
      }
    });

    // 动态连线
    const MAXL = 130;
    const linkPos = new Float32Array(MAXL * 6);
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
    const links = new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({ color: C.brand, transparent: true, opacity: 0.26 })
    );
    root.add(links);

    // 脉冲信号
    const pulses = [];
    const pulseGeo = new THREE.SphereGeometry(0.035, 8, 8);
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: C.cyan }));
      root.add(mesh);
      pulses.push({ mesh, a: 0, b: 1, t: Math.random(), sp: 0.5 + Math.random() * 0.7 });
    }
    function repick(pu) {
      pu.a = Math.floor(Math.random() * nodes.length);
      pu.b = Math.floor(Math.random() * nodes.length);
      if (pu.b === pu.a) pu.b = (pu.a + 1) % nodes.length;
    }

    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

    return (t) => {
      const pa = parallax.step();
      root.rotation.y = t * 0.085 + pa.x * 0.35;
      root.rotation.x = -pa.y * 0.18;

      // 节点缓慢漂移
      nodes.forEach((n) => {
        n.mesh.position.set(
          n.base.x + Math.sin(t * n.sp + n.phase) * 0.09,
          n.base.y + Math.cos(t * n.sp * 1.2 + n.phase) * 0.08,
          n.base.z + Math.cos(t * n.sp + n.phase * 1.4) * 0.09
        );
      });

      // 邻接连线
      let c = 0;
      const TH = 1.42;
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

      // 脉冲
      pulses.forEach((pu) => {
        pu.t += 0.006 * pu.sp;
        if (pu.t >= 1) { pu.t = 0; repick(pu); }
        tmpA.copy(nodes[pu.a].mesh.position);
        tmpB.copy(nodes[pu.b].mesh.position);
        pu.mesh.position.lerpVectors(tmpA, tmpB, pu.t);
        pu.mesh.scale.setScalar(0.7 + Math.sin(pu.t * Math.PI) * 0.9);
      });
    };
  });
}

/* ============================================================
   4) EX —— 知识图谱星云
   ============================================================ */
export function productGraph(canvas) {
  return mount(canvas, 'graph', ({ THREE, scene, camera, stage, parallax }) => {
    camera.position.set(0, 1.1, 7.6);
    camera.lookAt(0, 0, 0);

    const root = new THREE.Group();
    scene.add(root);

    // 粒子星云
    const P = 420;
    const ppos = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      const r = 1.6 + Math.random() * 3.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      ppos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      ppos[i * 3 + 1] = r * Math.cos(phi) * 0.65;
      ppos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const stars = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: C.light, size: 0.032, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    root.add(stars);

    // 中枢节点
    const hub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 2),
      new THREE.MeshBasicMaterial({ color: C.blue, wireframe: true, transparent: true, opacity: 0.8 })
    );
    const hubCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 16),
      new THREE.MeshBasicMaterial({ color: C.cyan })
    );
    root.add(hub, hubCore);

    // 六个维度簇
    const clusters = [];
    const edgePts = [];
    const CLUSTER_N = 6;
    for (let c = 0; c < CLUSTER_N; c++) {
      const y = 1.05 - (c / (CLUSTER_N - 1)) * 2.1;
      const theta = c * 1.9;
      const rad = 2.15;
      const center = new THREE.Vector3(Math.cos(theta) * rad, y, Math.sin(theta) * rad);
      const color = [C.cyan, C.blue, C.brand, C.light][c % 4];

      const cMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 12, 12),
        new THREE.MeshBasicMaterial({ color })
      );
      cMesh.position.copy(center);
      root.add(cMesh);

      edgePts.push(0, 0, 0, center.x, center.y, center.z);

      // 叶子节点
      for (let k = 0; k < 4; k++) {
        const lr = 0.5 + Math.random() * 0.55;
        const lt = Math.random() * Math.PI * 2;
        const lp = Math.acos(2 * Math.random() - 1);
        const leaf = new THREE.Vector3(
          center.x + lr * Math.sin(lp) * Math.cos(lt),
          center.y + lr * Math.cos(lp) * 0.8,
          center.z + lr * Math.sin(lp) * Math.sin(lt)
        );
        const lm = new THREE.Mesh(
          new THREE.SphereGeometry(0.038, 8, 8),
          new THREE.MeshBasicMaterial({ color: C.pale })
        );
        lm.position.copy(leaf);
        root.add(lm);
        edgePts.push(center.x, center.y, center.z, leaf.x, leaf.y, leaf.z);
      }
      clusters.push({ center, cMesh });
    }

    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePts), 3));
    root.add(new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({
      color: C.brand, transparent: true, opacity: 0.30,
    })));

    return (t) => {
      const pa = parallax.step();
      root.rotation.y = t * 0.1 + pa.x * 0.32;
      root.rotation.x = -pa.y * 0.16;

      stars.rotation.y = -t * 0.02;
      hub.rotation.y = t * 0.5;
      hub.rotation.x = t * 0.28;
      hub.scale.setScalar(1 + Math.sin(t * 1.6) * 0.06);
      hubCore.scale.setScalar(1 + Math.sin(t * 2.2) * 0.12);

      clusters.forEach((cl, i) => {
        const k = 1 + Math.sin(t * 1.2 + i) * 0.09;
        cl.cMesh.scale.setScalar(k);
      });
    };
  });
}
