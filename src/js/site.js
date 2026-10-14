/* ============================================================
   站点交互 v2 · 零依赖
   - 滚动进度条 / 导航磨砂与滑动指示器 / 移动端菜单
   - 深空视口装饰层注入 + 实时读数
   - 卡片光标聚光 + 3D 倾斜 / 按钮涟漪 / 光标氛围光
   - 分组交错入场 / 数字滚动 / Hero 视差 / 表单
   ============================================================ */
(function () {
  'use strict';

  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ============================================================
     1. 滚动进度条
     ============================================================ */
  var progress = document.createElement('div');
  progress.className = 'progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  var scrollY = 0;
  var onScrollBar = function () {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var r = h > 0 ? Math.min(scrollY / h, 1) : 0;
    progress.style.transform = 'scaleX(' + r.toFixed(4) + ')';
  };

  /* ============================================================
     2. 导航：滚动磨砂 + 滑动指示器
     ============================================================ */
  var nav = $('.nav');
  var menu = $('.nav__menu');
  var ind = null;

  if (nav && menu) {
    ind = document.createElement('span');
    ind.className = 'nav__ind';
    ind.setAttribute('aria-hidden', 'true');
    menu.appendChild(ind);

    var moveInd = function (el) {
      if (!el || !el.offsetWidth) { ind.classList.remove('is-on'); return; }
      ind.style.width = el.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + el.offsetLeft + 'px)';
      ind.classList.add('is-on');
    };
    var syncInd = function () {
      var cur = $('.nav__menu a[aria-current="page"]');
      if (cur) moveInd(cur); else ind.classList.remove('is-on');
    };
    requestAnimationFrame(syncInd);
    window.addEventListener('resize', function () { requestAnimationFrame(syncInd); });

    var onScrollNav = function () {
      scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      nav.classList.toggle('is-scrolled', scrollY > 16);
      onScrollBar();
    };
    window.addEventListener('scroll', onScrollNav, { passive: true });
    onScrollNav();
  } else {
    window.addEventListener('scroll', function () {
      scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      onScrollBar();
    }, { passive: true });
    onScrollBar();
  }

  /* ============================================================
     3. 移动端菜单
     ============================================================ */
  var toggle = $('.nav__toggle');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && !toggle.contains(e.target)) {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ============================================================
     4. 深空视口：注入装饰层 + 实时读数
     ============================================================ */
  $$('.stage').forEach(function (stage) {
    if (stage.dataset.decorated) return;
    stage.dataset.decorated = '1';

    ['stage__bg', 'stage__grid', 'stage__floor', 'stage__lines', 'stage__scan', 'stage__vignette'].forEach(function (c) {
      var d = document.createElement('div');
      d.className = c;
      d.setAttribute('aria-hidden', 'true');
      stage.appendChild(d);
    });

    var hud = $('.stage__hud', stage);
    if (hud) {
      var tr = document.createElement('span');
      tr.className = 'stage__corner tr';
      var bl = document.createElement('span');
      bl.className = 'stage__corner bl';
      hud.appendChild(tr);
      hud.appendChild(bl);
    }

    var ticksT = document.createElement('div');
    ticksT.className = 'stage__ticks stage__ticks--top';
    var ticksB = document.createElement('div');
    ticksB.className = 'stage__ticks stage__ticks--bottom';
    var cross = document.createElement('div');
    cross.className = 'stage__cross';
    var rtl = document.createElement('div');
    rtl.className = 'stage__readout stage__readout--tl';
    rtl.innerHTML = '<span class="stage__pulse"></span><span>SYS</span><b>ONLINE</b>';
    var rtr = document.createElement('div');
    rtr.className = 'stage__readout stage__readout--tr';
    rtr.innerHTML = '<span>LAT</span><b data-lat>24.0</b><span>ms</span>';

    [ticksT, ticksB, cross, rtl, rtr].forEach(function (n) {
      n.setAttribute('aria-hidden', 'true');
      stage.appendChild(n);
    });

    // 实时读数（仅在视口内跳动，避免无谓开销）
    var lat = $('[data-lat]', rtr);
    if (lat && !RM) {
      var base = 18 + Math.random() * 10;
      var timer = null;
      var tick = function () {
        base += (Math.random() - 0.5) * 3.6;
        base = Math.max(12, Math.min(38, base));
        lat.textContent = base.toFixed(1);
      };
      var start = function () { if (!timer) timer = setInterval(tick, 900); };
      var stop = function () { if (timer) { clearInterval(timer); timer = null; } };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) start(); else stop();
        }, { threshold: 0 }).observe(stage);
      } else { start(); }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
      });
    }
  });

  /* ============================================================
     5. 深色区块：注入发光地平线
     ============================================================ */
  $$('.cta').forEach(function (el) {
    if (el.querySelector('.cta__horizon')) return;
    var h = document.createElement('span');
    h.className = 'cta__horizon';
    h.setAttribute('aria-hidden', 'true');
    el.appendChild(h);
  });

  /* ============================================================
     6. 卡片：光标聚光 + 3D 倾斜
     ============================================================ */
  if (FINE && !RM) {
    var TILT_MAX = { card: 4.5, pcard: 5, fitem: 4, flow__item: 3.5 };

    $$('.card, .pcard, .fitem, .flow__item').forEach(function (el) {
      if (el.querySelector('.card__glow, .pcard__glow, .fitem__glow')) return;
      var glow = document.createElement('div');
      glow.className = el.classList.contains('pcard') ? 'pcard__glow'
        : el.classList.contains('fitem') ? 'fitem__glow' : 'card__glow';
      glow.setAttribute('aria-hidden', 'true');
      el.insertBefore(glow, el.firstChild);
    });

    $$('.card, .pcard, .fitem, .flow__item').forEach(function (el) {
      var max = 4;
      if (el.classList.contains('card')) max = TILT_MAX.card;
      else if (el.classList.contains('pcard')) max = TILT_MAX.pcard;
      else if (el.classList.contains('fitem')) max = TILT_MAX.fitem;
      else max = TILT_MAX.flow__item;

      var raf = null, tx = 0, ty = 0;

      var apply = function () {
        raf = null;
        el.style.setProperty('--mx', tx + 'px');
        el.style.setProperty('--my', ty + 'px');
        var r = el.getBoundingClientRect();
        var rx = ((ty / r.height) - 0.5) * -2 * max;
        var ry = ((tx / r.width) - 0.5) * 2 * max;
        el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      };

      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        tx = e.clientX - r.left;
        ty = e.clientY - r.top;
        el.classList.add('tilting');
        if (!raf) raf = requestAnimationFrame(apply);
      });

      el.addEventListener('pointerleave', function () {
        el.classList.remove('tilting');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  } else {
    // 触屏 / 减少动效：只保留静态聚光容器，避免首次 hover 闪烁
    $$('.card, .pcard, .fitem').forEach(function (el) {
      if (el.querySelector('.card__glow, .pcard__glow, .fitem__glow')) return;
      var glow = document.createElement('div');
      glow.className = el.classList.contains('pcard') ? 'pcard__glow'
        : el.classList.contains('fitem') ? 'fitem__glow' : 'card__glow';
      glow.setAttribute('aria-hidden', 'true');
      el.insertBefore(glow, el.firstChild);
    });
  }

  /* ============================================================
     7. 按钮：点击涟漪
     ============================================================ */
  if (FINE && !RM) {
    document.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest ? e.target.closest('.btn') : null;
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 1.1;
      var sp = document.createElement('span');
      sp.className = 'ripple';
      sp.style.width = sp.style.height = size + 'px';
      sp.style.left = (e.clientX - r.left - size / 2) + 'px';
      sp.style.top = (e.clientY - r.top - size / 2) + 'px';
      btn.appendChild(sp);
      setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 660);
    });
  }

  /* ============================================================
     8. 光标氛围光（只在深色区域显现）
     ============================================================ */
  if (FINE && !RM) {
    var cglow = document.createElement('div');
    cglow.className = 'cursor-glow';
    cglow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cglow);

    var gx = 0, gy = 0, cx = 0, cy = 0, gRaf = null, gOn = false;
    var DARK = '.section--dark, .panel, .cta, .stage, .footer';

    var gLoop = function () {
      cx += (gx - cx) * 0.12;
      cy += (gy - cy) * 0.12;
      cglow.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      if (gOn || Math.abs(gx - cx) > 0.5 || Math.abs(gy - cy) > 0.5) {
        gRaf = requestAnimationFrame(gLoop);
      } else {
        gRaf = null;
      }
    };

    window.addEventListener('pointermove', function (e) {
      gx = e.clientX; gy = e.clientY;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var overDark = !!(el && el.closest && el.closest(DARK));
      if (overDark !== gOn) {
        gOn = overDark;
        cglow.classList.toggle('is-on', gOn);
      }
      if (!gRaf) gRaf = requestAnimationFrame(gLoop);
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      gOn = false;
      cglow.classList.remove('is-on');
    });
  }

  /* ============================================================
     9. 滚动揭示（分组交错）
     ============================================================ */
  var reveals = $$('.reveal');
  if (reveals.length) {
    if (!('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

      // 按父容器分组，组内交错
      var groups = new Map();
      reveals.forEach(function (el) {
        var p = el.parentNode;
        if (!groups.has(p)) groups.set(p, 0);
        var i = groups.get(p);
        groups.set(p, i + 1);
        el.style.transitionDelay = Math.min(i, 5) * 85 + 'ms';
      });
      reveals.forEach(function (el) { io.observe(el); });
    }
  }

  /* ============================================================
     10. 数字滚动
     ============================================================ */
  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !RM) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        cio.unobserve(entry.target);
        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-count'));
        var dec = (el.getAttribute('data-decimals') | 0);
        var dur = 1300;
        var start = performance.now();
        var step = function (now) {
          var p = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 4);
          el.textContent = (target * eased).toFixed(dec);
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = target.toFixed(dec);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ============================================================
     11. Hero 视差（随页面滚动轻微上浮，制造纵深）
     ============================================================ */
  if (FINE && !RM) {
    var heroStage = $('.hero .stage, .phero .stage');
    var heroCopy = $('.hero__grid > div:first-child, .phero__grid > div:first-child');
    if (heroStage) {
      var pRaf = null;
      var pApply = function () {
        pRaf = null;
        var y = window.pageYOffset || 0;
        if (y > window.innerHeight * 1.1) return;
        if (heroStage) heroStage.style.transform = 'translate3d(0,' + (y * 0.045).toFixed(1) + 'px,0)';
        if (heroCopy) {
          heroCopy.style.transform = 'translate3d(0,' + (y * 0.022).toFixed(1) + 'px,0)';
          heroCopy.style.opacity = Math.max(0, 1 - y / (window.innerHeight * 0.85)).toFixed(3);
        }
      };
      window.addEventListener('scroll', function () {
        if (!pRaf) pRaf = requestAnimationFrame(pApply);
      }, { passive: true });
    }
  }

  /* ============================================================
     12. 表单
     ============================================================ */
  var form = $('form[data-contact]');
  if (form) {
    var status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', function (e) {
      var endpoint = form.getAttribute('data-endpoint');
      var get = function (n) { var f = form.elements[n]; return f ? encodeURIComponent(f.value || '') : ''; };
      if (!endpoint) {
        e.preventDefault();
        var subject = encodeURIComponent('官网留言：' + (form.elements['company'] ? form.elements['company'].value : ''));
        var body = '姓名：' + decodeURIComponent(get('name')) +
          '\n公司：' + decodeURIComponent(get('company')) +
          '\n电话：' + decodeURIComponent(get('phone')) +
          '\n邮箱：' + decodeURIComponent(get('email')) +
          '\n\n需求：\n' + decodeURIComponent(get('message'));
        window.location.href = 'mailto:' + (form.getAttribute('data-mailto') || '') +
          '?subject=' + subject + '&body=' + encodeURIComponent(body);
        if (status) status.textContent = '已唤起邮件客户端，请在其中确认发送。';
        return;
      }
      e.preventDefault();
      if (status) status.textContent = '提交中…';
      fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      }).then(function (r) {
        if (status) status.textContent = r.ok ? '提交成功，我们会尽快与您联系。' : '提交失败，请稍后重试或直接邮件联系。';
        if (r.ok) form.reset();
      }).catch(function () {
        if (status) status.textContent = '网络异常，请直接邮件联系。';
      });
    });
  }

  /* ============================================================
     13. 当前年份
     ============================================================ */
  $$('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
