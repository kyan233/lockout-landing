/* Lockout — landing page behaviour.
 *
 * Deliberately small and dependency-free. Everything here degrades to a
 * perfectly readable page if it never runs: the reveal styles are the only
 * thing that hides content, and they are removed wholesale when motion is
 * unwanted or IntersectionObserver is missing.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- nav -- */

  var toggle = document.getElementById('navtoggle');
  var nav = document.getElementById('nav');

  if (toggle && nav) {
    var setMenu = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
      // Stop the page scrolling behind the sheet, but only while it is a sheet.
      document.body.style.overflow = open ? 'hidden' : '';
    };

    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Any in-page jump closes it, otherwise the target lands behind the menu.
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
    });

    // Resizing past the breakpoint leaves the menu open but invisible, which
    // traps body scroll on desktop. Reset when the sheet stops being a sheet.
    var wide = window.matchMedia('(min-width: 901px)');
    var onWide = function (event) { if (event.matches) setMenu(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* ------------------------------------------------------------ reveals -- */

  var revealed = document.querySelectorAll('[data-reveal]');

  if (!('IntersectionObserver' in window) || reduced.matches) {
    for (var i = 0; i < revealed.length; i++) revealed[i].classList.add('is-visible');
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });

    revealed.forEach(function (el) { observer.observe(el); });
  }

  /* Elements that animate something of their own once on screen: the route
     line draws itself, the step meter fills to its real percentage. */
  var once = document.querySelectorAll('.route, [data-meter]');

  if (!('IntersectionObserver' in window) || reduced.matches) {
    once.forEach(function (el) {
      el.classList.add('is-visible');
      if (el.hasAttribute('data-meter')) el.style.width = el.dataset.meter + '%';
    });
  } else {
    var onceObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-visible');
        if (el.hasAttribute('data-meter')) el.style.width = el.dataset.meter + '%';
        onceObserver.unobserve(el);
      });
    }, { threshold: 0.35 });

    once.forEach(function (el) { onceObserver.observe(el); });
  }

  /* ----------------------------------------------------------- magnetic -- */

  /* Primary calls to action lean very slightly toward the cursor. Pointer-fine
     devices only, and never when motion is unwanted. Writes CSS custom
     properties inside a rAF rather than touching layout. */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduced.matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var frame = null;

      var move = function (event) {
        if (frame) return;
        frame = requestAnimationFrame(function () {
          frame = null;
          var box = el.getBoundingClientRect();
          var dx = event.clientX - (box.left + box.width / 2);
          var dy = event.clientY - (box.top + box.height / 2);
          el.style.setProperty('--pull-x', (dx * 0.14).toFixed(2) + 'px');
          el.style.setProperty('--pull-y', (dy * 0.22).toFixed(2) + 'px');
        });
      };

      var reset = function () {
        if (frame) { cancelAnimationFrame(frame); frame = null; }
        el.style.setProperty('--pull-x', '0px');
        el.style.setProperty('--pull-y', '0px');
      };

      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', reset);
      el.addEventListener('blur', reset);
    });
  }

  /* --------------------------------------------------------------- form -- */

  var form = document.getElementById('waitlist');

  if (form) {
    var input = document.getElementById('email');
    var error = document.getElementById('email-error');
    var status = document.getElementById('form-status');
    var button = form.querySelector('button[type="submit"]');

    var showError = function (message) {
      error.textContent = message;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      status.hidden = true;
    };

    var clearError = function () {
      error.hidden = true;
      error.textContent = '';
      input.removeAttribute('aria-invalid');
    };

    input.addEventListener('input', function () {
      if (!error.hidden) clearError();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var value = input.value.trim();

      if (!value) {
        showError('Enter an email address so there is somewhere to send it.');
        input.focus();
        return;
      }
      // Deliberately loose. Strict address validation rejects real addresses,
      // and the only cost of a bad one here is an email that bounces.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        showError('That does not look like an email address — check for a typo.');
        input.focus();
        return;
      }

      clearError();

      var endpoint = form.dataset.endpoint;

      if (!endpoint) {
        /* No list is connected. Say so plainly rather than faking a success
           state — a fake confirmation is a promise the page cannot keep. */
        status.hidden = false;
        status.style.color = '';
        status.textContent =
          'Nothing was sent — this form is not connected to a mailing list yet. ' +
          'Email kyansukhram@gmail.com with this address and you will be added by hand.';
        button.disabled = false;
        return;
      }

      /* When an endpoint is configured, post to it. Kept here so wiring the
         form up later is one attribute in the HTML and no code change.
         Never put a private API key in this file — use an endpoint that
         accepts an unauthenticated POST, or a small server-side proxy. */
      button.disabled = true;
      button.textContent = 'Sending…';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        /* `_subject` labels the notification; `_captcha:false` lets an AJAX
           POST through without the interstitial. Harmless to any other
           endpoint that ignores fields it does not recognise. */
        body: JSON.stringify({
          email: value,
          _subject: 'New Lockout waitlist signup',
          _captcha: 'false'
        })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('Request failed: ' + response.status);
          status.hidden = false;
          status.textContent = 'You are on the list. Nothing else will arrive in the meantime.';
          form.reset();
        })
        .catch(function () {
          showError('That did not go through. Try again, or email kyansukhram@gmail.com.');
        })
        .then(function () {
          button.disabled = false;
          button.textContent = 'Start your contract';
        });
    });
  }
})();
