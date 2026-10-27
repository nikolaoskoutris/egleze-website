(function () {
  'use strict';

  var GA_ID = 'G-18MJKYD86Y';
  var PULSE_ENDPOINT = '/api/pulse';
  var VERCEL_SCRIPT = window.EGLEZE_VERCEL_ANALYTICS_SCRIPT || '/_vercel/insights/script.js';
  var SOURCE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|podcasts\.apple\.com|soundcloud\.com|vimeo\.com)$/i;

  window.egleze = window.egleze || {};

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function consentState() {
    try {
      var saved = localStorage.getItem('egleze_cookie');
      return saved === 'accepted' || saved === 'rejected' ? saved : 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  function sessionId() {
    if (consentState() !== 'accepted') return null;
    try {
      var id = sessionStorage.getItem('egleze_analytics_session');
      if (!id) {
        id = uuid();
        sessionStorage.setItem('egleze_analytics_session', id);
      }
      return id;
    } catch (_) {
      return null;
    }
  }

  function context() {
    var supplied = window.EGLEZE_ANALYTICS_CONTEXT || {};
    var path = window.location.pathname || '/';
    var kind = supplied.content_kind;
    var id = Number(supplied.content_id) || null;
    if (!kind) {
      if (/^\/story\//.test(path)) kind = 'story';
      else if (/^\/episodes\//.test(path)) kind = 'episode';
      else if (/^\/shows\//.test(path) || path === '/show.html' || path === '/shows.html') kind = 'show';
      else if (/^\/topic\//.test(path)) kind = 'topic';
      else kind = 'page';
    }
    if (!id && kind === 'story') {
      var match = path.match(/^\/story\/(\d+)/);
      if (match) id = Number(match[1]);
    }
    return { content_kind: kind, content_id: id };
  }

  function referrerHost() {
    if (!document.referrer) return null;
    try { return new URL(document.referrer).hostname; } catch (_) { return null; }
  }

  function campaign() {
    var params = new URLSearchParams(window.location.search || '');
    var result = {};
    ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (key) {
      var value = params.get('utm_' + key);
      if (value) result['utm_' + key] = value.slice(0, key === 'campaign' ? 160 : 120);
    });
    return result;
  }

  function providerFor(url) {
    var host = String(url.hostname || '').replace(/^www\./, '').toLowerCase();
    if (/youtu/.test(host)) return 'youtube';
    if (/spotify/.test(host)) return 'spotify';
    if (/apple/.test(host)) return 'apple_podcasts';
    if (/soundcloud/.test(host)) return 'soundcloud';
    if (/vimeo/.test(host)) return 'vimeo';
    return 'external';
  }

  function send(eventName, properties) {
    var ctx = context();
    var payload = Object.assign({
      event_id: uuid(),
      event_name: eventName,
      path: window.location.pathname || '/',
      content_kind: ctx.content_kind,
      content_id: ctx.content_id,
      referrer_host: referrerHost(),
      consent_state: consentState(),
      session_id: sessionId(),
      properties: properties || {}
    }, campaign());

    try {
      fetch(PULSE_ENDPOINT, {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (_) {}

    if (eventName !== 'page_view' && typeof window.va === 'function') {
      try {
        var data = Object.assign({ content_kind: ctx.content_kind }, properties || {});
        window.va('event', { name: eventName, data: data });
      } catch (_) {}
    }
  }

  function installVercelAnalytics() {
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.va('beforeSend', function (event) {
      try {
        var current = new URL(event.url);
        var clean = new URL(current.origin + current.pathname);
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
          var value = current.searchParams.get(key);
          if (value) clean.searchParams.set(key, value);
        });
        return Object.assign({}, event, { url: clean.toString() });
      } catch (_) {
        return event;
      }
    });
    if (!document.querySelector('script[data-egleze-va]')) {
      var script = document.createElement('script');
      script.defer = true;
      script.src = VERCEL_SCRIPT;
      script.setAttribute('data-egleze-va', '1');
      document.head.appendChild(script);
    }
  }

  function ensureGoogleAnalytics() {
    if (consentState() !== 'accepted' || window.__eglezeGALoaded) return;
    window.__eglezeGALoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(script);
  }

  function setConsent(choice) {
    var state = choice === 'accepted' ? 'accepted' : 'rejected';
    try { localStorage.setItem('egleze_cookie', state); } catch (_) {}
    if (state === 'accepted') {
      ensureGoogleAnalytics();
    } else {
      try { sessionStorage.removeItem('egleze_analytics_session'); } catch (_) {}
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
    }
    var banner = document.getElementById('egleze-consent');
    if (banner) banner.remove();
  }

  function installConsentBanner() {
    if (consentState() !== 'unknown' || document.getElementById('egleze-consent')) return;
    var banner = document.createElement('div');
    banner.id = 'egleze-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Analytics preferences');
    banner.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#111;color:#fff;border-top:3px solid #bb1919;padding:14px 22px;display:flex;flex-wrap:wrap;align-items:center;gap:18px;font:12px/1.5 "DM Sans",Arial,sans-serif';
    banner.innerHTML = '<p style="flex:1;margin:0;color:rgba(255,255,255,.78)">Egleze always uses cookie-free aggregate measurement to count page loads. Optional Google Analytics runs only if you accept. <a href="/legal.html#cookie" style="color:#ef5a5a">Cookie policy</a> · <a href="/legal.html#privacy" style="color:#ef5a5a">Privacy policy</a></p>' +
      '<div style="display:flex;gap:9px;flex-shrink:0">' +
      '<button type="button" data-eg-consent="rejected" style="background:transparent;color:#ddd;border:1px solid #555;padding:8px 13px;cursor:pointer">Reject optional</button>' +
      '<button type="button" data-eg-consent="accepted" style="background:#bb1919;color:#fff;border:0;padding:8px 13px;font-weight:700;cursor:pointer">Accept analytics</button></div>';
    banner.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('[data-eg-consent]');
      if (button) setConsent(button.getAttribute('data-eg-consent'));
    });
    document.body.appendChild(banner);
  }

  function installInteractionTracking() {
    var lastSearchEvent = 0;
    function trackSearchControl(control) {
      if (!control || String(control.value || '').trim().length < 2) return;
      var now = Date.now();
      if (now - lastSearchEvent < 1000) return;
      lastSearchEvent = now;
      send('search_submitted');
    }

    document.addEventListener('click', function (event) {
      var target = event.target.closest && event.target.closest('a,button');
      if (!target) return;
      if (target.matches('.video-play') || target.closest('.source-video') || target.hasAttribute('data-embed')) {
        send('video_started');
        if (target.tagName !== 'A') return;
      }
      if (target.tagName === 'A' && target.href) {
        try {
          var url = new URL(target.href, window.location.href);
          if (url.origin !== window.location.origin && SOURCE_HOSTS.test(url.hostname)) {
            send('source_open', { provider: providerFor(url) });
          }
        } catch (_) {}
      }
    }, true);

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (form && form.querySelector && form.querySelector('input[type="search"], [data-egleze-search]')) {
        send('search_submitted');
      }
    }, true);
    document.addEventListener('keydown', function (event) {
      var control = event.target;
      if (event.key === 'Enter' && control && control.matches && control.matches('#main-search-input, #search-input, input[type="search"], [data-egleze-search]')) {
        trackSearchControl(control);
      }
    }, true);
    document.addEventListener('change', function (event) {
      var control = event.target;
      if (control && control.matches && control.matches('#main-search-input, #search-input, input[type="search"], [data-egleze-search]')) {
        trackSearchControl(control);
      }
    }, true);
  }

  function installEngagementTracking() {
    window.setTimeout(function () {
      if (document.visibilityState === 'visible') send('engaged_30s');
    }, 30000);

    var sent = {};
    function onScroll() {
      var root = document.documentElement;
      var available = Math.max(1, root.scrollHeight - window.innerHeight);
      var percent = Math.round(Math.min(1, Math.max(0, window.scrollY / available)) * 100);
      [50, 90].forEach(function (threshold) {
        if (percent >= threshold && !sent[threshold]) {
          sent[threshold] = true;
          send('scroll_depth', { percent: String(threshold) });
        }
      });
      if (sent[50] && sent[90]) window.removeEventListener('scroll', onScroll);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function installStoreFooter() {
    var footer = document.querySelector('footer');
    if (!footer) return;

    var block = footer.querySelector('.eg-install');
    if (!block) {
      block = document.createElement('section');
      block.className = 'eg-install';
      footer.insertBefore(block, footer.firstChild);
    }

    block.setAttribute('aria-label', 'Download the Egleze app');
    block.style.cssText = 'box-sizing:border-box;width:100%;max-width:1284px;margin:0 auto;padding:26px 28px;border-bottom:1px solid #2a2018;background:#0e0a07;color:#fff;text-align:left;text-transform:none;letter-spacing:normal;font-style:normal';
    block.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:220px">' +
          '<div style="font-family:Roboto Condensed,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#fff;text-transform:uppercase;margin-bottom:7px;font-weight:700">Egleze on your phone</div>' +
          '<div style="font-family:DM Sans,Arial,sans-serif;font-size:13px;line-height:1.55;color:#bcb09a;max-width:520px">Download the Egleze app for iPhone, iPad, or Android.</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<a data-eg-app-store="apple" href="https://apps.apple.com/ie/app/egleze/id6783092510" target="_blank" rel="noopener" aria-label="Download Egleze on the App Store" style="box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;height:50px;min-width:168px;background:#050505;color:#fff;border:1px solid #4b4b4b;border-radius:8px;padding:6px 13px;text-decoration:none">' +
            '<svg width="28" height="32" viewBox="0 0 24 24" aria-hidden="true" style="display:block;flex-shrink:0"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.26-.07 2.14.69 2.88.69.95 0 2.54-.86 4.16-.73.68.03 2.59.27 3.82 2.07-3.31 1.99-2.64 6.35.51 7.62-.63 1.65-1.44 3.28-2.37 4.32zM12.03 7.25C11.88 4.8 13.86 2.78 16.15 2.58c.32 2.83-2.57 4.94-4.12 4.67z"/></svg>' +
            '<span style="display:flex;flex-direction:column;line-height:1.05"><span style="font-family:DM Sans,Arial,sans-serif;font-size:9px;letter-spacing:.2px;color:#e7e7e7">Download on the</span><strong style="font-family:DM Sans,Arial,sans-serif;font-size:18px;font-weight:500;letter-spacing:-.25px">App Store</strong></span>' +
          '</a>' +
          '<a data-eg-app-store="google" href="https://play.google.com/store/apps/details?id=com.egleze.app" target="_blank" rel="noopener" aria-label="Get Egleze on Google Play" style="box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;height:50px;min-width:176px;background:#050505;color:#fff;border:1px solid #4b4b4b;border-radius:8px;padding:6px 13px;text-decoration:none">' +
            '<svg width="27" height="30" viewBox="0 0 27 30" aria-hidden="true" style="display:block;flex-shrink:0"><path d="M1.7 1.6c-.44.5-.7 1.27-.7 2.27v22.27c0 1 .26 1.77.7 2.27l.09.09 12.47-12.47v-.3L1.79 1.51z" fill="#00d7fe"/><path d="M18.41 20.2l-4.15-4.16v-.3l4.16-4.16.09.05 4.93 2.8c1.41.8 1.41 2.12 0 2.92l-4.93 2.8z" fill="#ffce00"/><path d="M18.51 20.15l-4.25-4.26L1.7 28.45c.7.74 1.86.83 3.17.09l13.64-7.74z" fill="#ff3a44"/><path d="M18.51 11.63L4.87 3.89C3.56 3.15 2.4 3.24 1.7 3.98l12.56 12.06z" fill="#00f076"/></svg>' +
            '<span style="display:flex;flex-direction:column;line-height:1.05"><span style="font-family:Roboto Condensed,Arial,sans-serif;font-size:8px;letter-spacing:1.2px;text-transform:uppercase;color:#e7e7e7">Get it on</span><strong style="font-family:DM Sans,Arial,sans-serif;font-size:18px;font-weight:500;letter-spacing:-.25px">Google Play</strong></span>' +
          '</a>' +
        '</div>' +
      '</div>';

    block.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('[data-eg-app-store]');
      if (link) send('app_store_open', { store: link.getAttribute('data-eg-app-store') });
    });
  }

  function ready() {
    installStoreFooter();
    installConsentBanner();
    ensureGoogleAnalytics();
    installInteractionTracking();
    installEngagementTracking();
    if (document.visibilityState !== 'prerender') {
      send('page_view');
    } else {
      document.addEventListener('visibilitychange', function visibleOnce() {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', visibleOnce);
          send('page_view');
        }
      });
    }
  }

  window.egleze.analytics = {
    track: send,
    consent: consentState,
    setConsent: setConsent
  };
  window.eglezeLoadAnalytics = ensureGoogleAnalytics;
  window.eglezeSetAnalyticsConsent = setConsent;

  installVercelAnalytics();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
