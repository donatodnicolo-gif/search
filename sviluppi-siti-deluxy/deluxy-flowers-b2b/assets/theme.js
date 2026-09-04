/* Deluxy Flowers for Business — comportamenti del tema */
(function () {
  'use strict';

  /* Header: si nasconde scendendo, si compatta e sfuma dopo 40px */
  var header = document.querySelector('[data-header]');
  if (header) {
    var last = 0;
    var onScroll = function () {
      var y = window.scrollY || 0;
      header.classList.toggle('is-hidden', y > 80 && y > last);
      header.classList.toggle('is-scrolled', y > 40);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Menu mobile */
  var burger = document.querySelector('[data-menu-toggle]');
  var mobile = document.querySelector('[data-mobile-menu]');
  if (burger && mobile) {
    burger.addEventListener('click', function () {
      var open = !mobile.classList.contains('is-open');
      mobile.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* Comparsa progressiva degli elementi */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var d = parseFloat(e.target.getAttribute('data-delay') || '0');
          e.target.style.transitionDelay = d ? d + 's' : '';
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -80px 0px', threshold: 0.05 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* Pagina Servizi: l'immagine laterale segue il servizio sotto il mouse */
  document.querySelectorAll('[data-services-list]').forEach(function (root) {
    var items = root.querySelectorAll('[data-service-item]');
    var slides = root.querySelectorAll('[data-service-slide]');
    items.forEach(function (item, i) {
      item.addEventListener('mouseenter', function () {
        slides.forEach(function (s, j) { s.classList.toggle('is-active', i === j); });
      });
    });
  });

  /* Pagina Settori: schede a sinistra, pannello a destra */
  document.querySelectorAll('[data-sectors]').forEach(function (root) {
    var tabs = root.querySelectorAll('[data-sector-tab]');
    var panels = root.querySelectorAll('[data-sector-panel]');
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t, j) { t.classList.toggle('is-active', i === j); });
        panels.forEach(function (p, j) { p.classList.toggle('is-active', i === j); });
      });
    });
  });

  /* Portfolio: filtro per categoria, con le tessere alte ricalcolate come nell'originale */
  document.querySelectorAll('[data-portfolio]').forEach(function (root) {
    var filters = root.querySelectorAll('[data-filter]');
    var items = root.querySelectorAll('[data-work]');
    var apply = function (cat) {
      var visible = 0;
      items.forEach(function (it) {
        var show = cat === 'All' || it.getAttribute('data-category') === cat;
        it.classList.toggle('is-hidden', !show);
        if (show) {
          var k = visible % 5;
          it.classList.toggle('is-tall', k === 0 || k === 3);
          visible++;
        }
      });
    };
    filters.forEach(function (f) {
      f.addEventListener('click', function () {
        filters.forEach(function (x) { x.classList.toggle('is-active', x === f); });
        apply(f.getAttribute('data-filter'));
      });
    });
    apply('All');
  });

  /* Form richiesta progetto: quattro passi, invio con il modulo contatti di Shopify */
  document.querySelectorAll('[data-request-form]').forEach(function (root) {
    var steps = root.querySelectorAll('[data-step]');
    var total = steps.length;
    var current = 1;
    var label = root.querySelector('[data-step-label]');
    var bars = root.querySelectorAll('[data-step-bar]');
    var back = root.querySelector('[data-back]');
    var next = root.querySelector('[data-next]');
    var submit = root.querySelector('[data-submit]');
    var form = root.querySelector('form');

    var val = function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    };
    var valid = function () {
      if (current === 1) return val('contact[azienda]') && val('contact[referente]') && val('contact[email]');
      if (current === 2) return val('contact[settore]') && val('contact[citta]');
      if (current === 3) return !!val('contact[tipo_servizio]');
      return true;
    };
    var render = function () {
      steps.forEach(function (s, i) { s.classList.toggle('is-active', i + 1 === current); });
      if (label) label.textContent = 'Step ' + current + ' di ' + total;
      bars.forEach(function (b, i) { b.classList.toggle('is-done', i < current); });
      if (back) back.hidden = current === 1;
      if (next) { next.hidden = current === total; next.disabled = !valid(); }
      if (submit) submit.hidden = current !== total;
    };

    root.querySelectorAll('[data-choice-group]').forEach(function (group) {
      var input = form.querySelector('[name="' + group.getAttribute('data-choice-group') + '"]');
      var buttons = group.querySelectorAll('[data-choice]');
      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          buttons.forEach(function (x) { x.classList.toggle('is-selected', x === b); });
          if (input) input.value = b.getAttribute('data-choice');
          render();
        });
      });
    });

    form.addEventListener('input', render);
    if (back) back.addEventListener('click', function () { if (current > 1) { current--; render(); scrollTop(); } });
    if (next) next.addEventListener('click', function () { if (valid() && current < total) { current++; render(); scrollTop(); } });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && current < total) { e.preventDefault(); if (valid()) { current++; render(); scrollTop(); } }
    });
    if (submit) {
      form.addEventListener('submit', function () {
        submit.disabled = true;
        submit.querySelector('span').textContent = 'Invio in corso...';
      });
    }
    var scrollTop = function () {
      var top = root.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top: top, behavior: 'smooth' });
    };
    render();
  });
})();
