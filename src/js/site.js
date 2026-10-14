/* ============================================================
   站点交互：导航 / 滚动揭示 / 数字滚动 / 表单
   零依赖
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 导航：滚动磨砂 ---------- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', (window.pageYOffset || 0) > 16);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 移动端菜单 ---------- */
  var toggle = document.querySelector('.nav__toggle');
  var menu = document.querySelector('.nav__menu');
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

  /* ---------- 滚动揭示 ---------- */
  var reveals = document.querySelectorAll('.reveal');
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
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el, i) {
        el.style.transitionDelay = (i % 4) * 70 + 'ms';
        io.observe(el);
      });
    }
  }

  /* ---------- 数字滚动 ---------- */
  var counters = document.querySelectorAll('[data-count]');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        cio.unobserve(entry.target);
        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-count'));
        var dec = (el.getAttribute('data-decimals') | 0);
        var dur = 1100;
        var start = performance.now();
        var step = function (now) {
          var p = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(dec);
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = target.toFixed(dec);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- 表单 ---------- */
  var form = document.querySelector('form[data-contact]');
  if (form) {
    var status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', function (e) {
      var endpoint = form.getAttribute('data-endpoint');
      if (!endpoint) {
        // 未配置后端时，降级为邮件客户端
        e.preventDefault();
        var get = function (n) { var f = form.elements[n]; return f ? encodeURIComponent(f.value || '') : ''; };
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
      // 已配置 endpoint：异步提交
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

  /* ---------- 当前年份 ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
