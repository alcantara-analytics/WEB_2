/* Lista 11 | FIEECS UNI — interacciones
   Sin dependencias. Todo el contenido dinámico se escribe con textContent
   (nunca innerHTML) para evitar XSS. */
(() => {
  'use strict';

  // ── Configuración ─────────────────────────────────────────────────────────
  const GA_ID = '';                       // PENDIENTE: 'G-XXXXXXXXXX'. Vacío = sin analítica ni aviso.
  const FORM_ENDPOINT_FALLBACK = '/api/contact';

  // ── Utilidades ────────────────────────────────────────────────────────────
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const root = document.documentElement;
  root.classList.add('js');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  };

  // ── Analítica (GA4) con consentimiento ────────────────────────────────────
  const track = (name, params = {}) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (el) track(el.dataset.track);
  });

  function loadGA() {
    if (!GA_ID || window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
  }

  (function consent() {
    if (!GA_ID) return;
    const box = $('#consent');
    const choice = store.get('l11-analytics');
    if (choice === 'granted') { loadGA(); return; }
    if (choice === 'denied' || !box) return;
    box.hidden = false;
    $('#consent-yes').addEventListener('click', () => { store.set('l11-analytics', 'granted'); box.hidden = true; loadGA(); });
    $('#consent-no').addEventListener('click', () => { store.set('l11-analytics', 'denied'); box.hidden = true; });
  })();

  // ── Navegación ────────────────────────────────────────────────────────────
  const nav = $('#nav');
  const toggle = $('#nav-toggle');
  const setMenu = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  $$('#menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setMenu(false); closeAllShareMenus(); }
  });
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) setMenu(false);
  });

  // Sección activa en el menú
  if ('IntersectionObserver' in window) {
    const links = new Map($$('#menu a').map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const link = links.get(en.target.id);
        if (!link) return;
        if (en.isIntersecting) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        } else if (link.getAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  // ── Scroll: progreso, nav sólido, parallax ────────────────────────────────
  const progress = $('#progress');
  const parallaxEls = $$('[data-speed]');
  let ticking = false;

  function update() {
    ticking = false;
    const y = window.scrollY;
    const max = root.scrollHeight - innerHeight;
    progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0).toFixed(4) + ')';
    nav.classList.toggle('is-solid', y > 40);
    if (reduce) return;
    parallaxEls.forEach((el) => {
      const sec = el.closest('section');
      if (!sec) return;
      const r = sec.getBoundingClientRect();
      if (r.bottom < -300 || r.top > innerHeight + 300) return;
      const center = r.top + r.height / 2 - innerHeight / 2;
      el.style.setProperty('--py', (center * parseFloat(el.dataset.speed)).toFixed(1) + 'px');
    });
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();

  // ── Revelado, contadores y CTA fijo ───────────────────────────────────────
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  const counters = $$('[data-count]');
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    if (!Number.isFinite(target)) return; // sin dato: se queda en 00
    if (reduce) { el.textContent = String(target); return; }
    const t0 = performance.now();
    const dur = 1400;
    const step = (t) => {
      const p = clamp((t - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { animateCount(en.target); co.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach((el) => co.observe(el));
  } else {
    counters.forEach(animateCount);
  }

  // CTA fijo en móvil: aparece al salir del hero y se oculta en el formulario
  const hero = $('#inicio');
  const join = $('#participa');
  const stickyCta = $('#sticky-cta');
  if ('IntersectionObserver' in window && hero && join) {
    let heroVisible = true;
    let joinVisible = false;
    const sync = () => {
      const show = !heroVisible && !joinVisible;
      document.body.classList.toggle('show-cta', show);
      if (stickyCta) {
        stickyCta.setAttribute('aria-hidden', String(!show));
        const a = $('a', stickyCta);
        if (a) a.tabIndex = show ? 0 : -1;
      }
    };
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; sync(); }, { threshold: 0.15 }).observe(hero);
    new IntersectionObserver(([e]) => { joinVisible = e.isIntersecting; sync(); }, { threshold: 0.2 }).observe(join);
  }

  // ── Cursor, ojo del colibrí, botones magnéticos y brillo de tarjetas ──────
  const pupil = $('#bird-pupil');
  const head = $('#bird-head');
  const eye = $('#bird-eye');
  const bird = $('#bird');

  let mx = innerWidth / 2, my = innerHeight / 2;   // posición real del mouse
  let rx = mx, ry = my;                            // posición suavizada (anillo)
  let px = 0, py = 0, tilt = 0;                    // pupila y cabeza suavizadas
  let tpx = 0, tpy = 0, ttilt = 0;                 // objetivos
  let pointerSeen = false;
  const dot = $('.cursor-dot');
  const ring = $('.cursor-ring');

  function aimEye() {
    if (!eye || !bird) return;
    const r = eye.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = mx - ex;
    const dy = my - ey;
    const dist = Math.hypot(dx, dy) || 1;
    const strength = clamp(dist / 180, 0, 1);
    const maxUnits = 6;                            // en unidades del viewBox del SVG (840 de ancho)
    tpx = (dx / dist) * maxUnits * strength;
    tpy = (dy / dist) * maxUnits * strength;
    ttilt = clamp(-dy / (innerHeight * 0.5), -1, 1) * 6; // grados: mouse arriba = pico arriba
  }

  const canTrack = finePointer && !reduce;
  if (canTrack) {
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY;
      if (!pointerSeen) { pointerSeen = true; rx = mx; ry = my; root.classList.add('has-cursor'); }
      const hot = e.target.closest && e.target.closest('a, button, summary, label, select, [role="button"]');
      if (ring) ring.classList.toggle('is-hover', Boolean(hot));
    }, { passive: true });
    document.addEventListener('mouseleave', () => root.classList.remove('has-cursor'));
    document.addEventListener('mouseenter', () => { if (pointerSeen) root.classList.add('has-cursor'); });

    const loop = () => {
      if (dot) dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if (ring) ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      if (pupil) {
        aimEye();
        px += (tpx - px) * 0.2; py += (tpy - py) * 0.2; tilt += (ttilt - tilt) * 0.12;
        pupil.style.transform = 'translate(' + px.toFixed(2) + 'px,' + py.toFixed(2) + 'px)';
        if (head) head.style.transform = 'rotate(' + tilt.toFixed(2) + 'deg)';
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // Botones magnéticos
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.28;
        el.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });

    // Brillo que sigue al mouse en tarjetas
    $$('.glow-card').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }

  // ── Compartir ─────────────────────────────────────────────────────────────
  const shareUrl = () => location.origin + location.pathname;
  const shareText = 'Conoce la Lista 11 de la FIEECS (UNI): propuestas, recursos y cómo participar.';
  const shareBoxes = $$('[data-share]');

  function closeAllShareMenus() {
    shareBoxes.forEach((b) => {
      const m = $('[data-share-menu]', b);
      const btn = $('[data-share-btn]', b);
      if (m) m.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  shareBoxes.forEach((box) => {
    const btn = $('[data-share-btn]', box);
    const menu = $('[data-share-menu]', box);
    const note = $('[data-share-note]', box);
    const say = (msg) => { note.textContent = msg; setTimeout(() => { note.textContent = ''; }, 2600); };

    const url = shareUrl();
    $('[data-share-wa]', box).href = 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + url);
    $('[data-share-x]', box).href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(url);
    $('[data-share-fb]', box).href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);

    btn.addEventListener('click', async () => {
      track('share_click');
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: document.title, text: shareText, url: shareUrl() }); } catch { /* cancelado */ }
        return;
      }
      const open = menu.hidden;
      closeAllShareMenus();
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });

    $('[data-share-copy]', box).addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl());
        say('Enlace copiado');
      } catch {
        say('No pudimos copiarlo. Cópialo desde la barra del navegador.');
      }
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-share]')) closeAllShareMenus();
  });

  // ── Formulario ────────────────────────────────────────────────────────────
  const form = $('#form-contacto');
  if (form) {
    const status = $('#form-status');
    const submitBtn = $('button[type="submit"]', form);
    const loadedAt = Date.now();
    const endpoint = form.dataset.endpoint || FORM_ENDPOINT_FALLBACK;

    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE = /^\+?[\d\s\-()]{7,20}$/;
    const rules = {
      name: (v) => (v.length >= 2 ? '' : 'Escribe tu nombre (mínimo 2 letras).'),
      contact: (v) => (EMAIL.test(v) || PHONE.test(v) ? '' : 'Escribe un correo válido o un número de WhatsApp.'),
      message: (v) => (v.length >= 10 ? '' : 'Cuéntanos un poco más (mínimo 10 caracteres).'),
    };

    const setStatus = (msg, kind) => {
      status.textContent = msg;
      status.classList.toggle('is-ok', kind === 'ok');
      status.classList.toggle('is-error', kind === 'error');
    };
    const showError = (field, msg) => {
      const input = form.elements[field];
      const out = $('#err-' + field);
      if (!input || !out) return;
      out.textContent = msg;
      out.hidden = !msg;
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };

    Object.keys(rules).forEach((f) => {
      form.elements[f].addEventListener('input', () => {
        if (form.elements[f].getAttribute('aria-invalid')) showError(f, rules[f](form.elements[f].value.trim()));
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus('', '');

      let firstBad = null;
      Object.keys(rules).forEach((f) => {
        const msg = rules[f](form.elements[f].value.trim());
        showError(f, msg);
        if (msg && !firstBad) firstBad = form.elements[f];
      });
      if (firstBad) { firstBad.focus(); return; }

      const payload = {
        name: form.elements.name.value.trim(),
        contact: form.elements.contact.value.trim(),
        topic: form.elements.topic.value,
        message: form.elements.message.value.trim(),
        website: form.elements.website.value,      // honeypot
        ts: loadedAt,                              // trampa de tiempo
      };

      submitBtn.disabled = true;
      setStatus('Enviando…', '');
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 429) throw new Error('rate');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error('fail');
        form.reset();
        setStatus('Listo, recibimos tu mensaje. Te respondemos por el medio que dejaste.', 'ok');
        track('form_submit');
      } catch (err) {
        setStatus(
          err.message === 'rate'
            ? 'Enviaste varios mensajes seguidos. Espera unos minutos y vuelve a intentarlo.'
            : 'No pudimos enviar tu mensaje. Revisa tu conexión y vuelve a intentarlo.',
          'error'
        );
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
})();
