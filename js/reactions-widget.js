// /js/reactions-widget.js — Egleze reaction UI (Option A: labeled React + inline expansion)
// Renders into any element with data-reactions-for="<storyId>".
// Wires to window.egleze.reactions (data layer, already proven). Load AFTER auth.js + reactions.js.
//
// LOCKED design (Option A — chosen after the popup approach hit unfixable mobile positioning bugs):
//  - A "React" button in the card foot (hand icon + the word "REACT" + optional count).
//  - Tap it -> panel expands INLINE in the card (no popup, no position:fixed, no clipping).
//  - Panel shows 5 LABELED reactions. Each row has its own circle (quick = 3) + 1..5 picker.
//  - Tap circle = quick toggle (empty -> 3 -> empty). Tap a number = exact set. Tap active = clear.
//  - Untouched reactions = no DB row (silence stays silence).
//  - Logged-out tap goes through reactions.js -> existing sign-in modal.
//  - Same on mobile and desktop. No breakpoint behaviour, no positioning logic.

(function () {
  if (!window.egleze || !window.egleze.reactions) {
    console.error('[egleze reactions-widget] reactions.js must load first');
    return;
  }

  var R = [
    { k: 'inspires',  l: 'Inspires me',           c: '#1d9e75' },
    { k: 'concerns',  l: 'Concerns me',           c: '#bb1919' },
    { k: 'curious',   l: 'Made me curious',       c: '#ba7517' },
    { k: 'changed',   l: 'Changed how I think',   c: '#534ab7' },
    { k: 'validates', l: 'Validates what I knew', c: '#378add' }
  ];
  var LV = ['', 'Slightly', 'Somewhat', 'Moderately', 'Strongly', 'Intensely'];
  var FAST_LEVEL = 3;
  var CIRC = 2 * Math.PI * 12;

  var css = ''
   // The trigger sits inline in the card foot beside bookmark/share. No popup.
   + '.egr-trig{display:inline-flex;align-items:center;gap:5px;color:#888780;background:none;border:none;cursor:pointer;padding:0;margin:0;font:inherit;line-height:1;vertical-align:middle;-webkit-appearance:none;appearance:none}'
   + '.egr-trig:hover{color:#bb1919}.egr-trig.has{color:#bb1919}'
   + '.egr-trig .lbl{font-family:"Roboto Condensed",sans-serif;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700}'
   + '.egr-trig .ct{font-family:"Roboto Condensed",sans-serif;font-size:10px;color:#888;font-weight:600}'
   + '.egr-trig.has .ct{color:#bb1919}'
   // The inline panel — expands INSIDE the card. No fixed, no absolute, no popup.
   + '.egr-panel{max-height:0;overflow:hidden;opacity:0;transition:max-height .28s ease,opacity .22s ease,padding .28s ease;border-top:.5px solid #f1efe8;margin-top:10px;padding:0}'
   + '.egr-panel.open{max-height:620px;opacity:1;padding:8px 0 2px}'
   + '.egr-panel-h{font-family:"Roboto Condensed",sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#888;padding:0 2px 4px}'
   + '.egr-panel-hs{font-size:10px;color:#888;padding:0 2px 8px;margin-bottom:4px;border-bottom:.5px solid #f1efe8}'
   + '.egr-row{padding:7px 4px;border-radius:3px;transition:background .12s}'
   + '.egr-row:hover{background:#faf8f3}.egr-row.set{background:#fbeeee}'
   + '.egr-top{display:flex;align-items:center;gap:10px}'
   + '.egr-ring{position:relative;width:30px;height:30px;flex-shrink:0;cursor:pointer}'
   + '.egr-ring svg{transform:rotate(-90deg);display:block}'
   + '.egr-ring .bg{stroke:#eceae2}'
   + '.egr-ring .fg{stroke:#bb1919;stroke-linecap:round;transition:stroke-dashoffset .2s ease}'
   + '.egr-ring .ctr{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Roboto Condensed",sans-serif;font-size:11px;font-weight:700;color:#bbb}'
   + '.egr-row.set .egr-ring .ctr{color:#bb1919}'
   + '.egr-info{flex:1;min-width:0}'
   + '.egr-lab{font-size:13px;color:#111;font-weight:500;display:flex;align-items:center;gap:7px}'
   + '.egr-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}'
   + '.egr-meta{font-family:"Roboto Condensed",sans-serif;font-size:10px;color:#888;letter-spacing:.5px;margin-top:1px}'
   + '.egr-cnt{font-family:"Roboto Condensed",sans-serif;font-size:10px;color:#888;letter-spacing:.5px;flex-shrink:0}'
   + '.egr-segs{display:flex;gap:4px;margin-top:7px;padding-left:40px}'
   + '.egr-segs button{flex:1;height:28px;border:.5px solid #e0e0da;background:#f4f2ec;border-radius:3px;cursor:pointer;font-family:"Roboto Condensed",sans-serif;font-size:11px;font-weight:700;color:#aaa;padding:0;transition:all .12s}'
   + '.egr-segs button:hover{border-color:#bb1919;color:#bb1919}'
   + '.egr-segs button.on{background:#bb1919;border-color:#bb1919;color:#fff}'
   // bigger tap targets on mobile (touch ergonomics)
   + '@media (max-width:760px){.egr-segs button{height:34px;font-size:13px}.egr-ring{width:36px;height:36px}.egr-lab{font-size:14px}}'
   + '.egr-foot{font-size:10px;color:#888;padding:9px 2px 2px;border-top:.5px solid #f1efe8;margin-top:6px;line-height:1.45}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var HAND = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V4a1.4 1.4 0 0 1 2.8 0v4.5"/><path d="M10.8 8.8V2.6a1.4 1.4 0 0 1 2.8 0v6"/><path d="M13.6 3.4a1.4 1.4 0 0 1 2.8 0v9.8c0 3.8-2.3 6.6-5.8 6.6-2.6 0-4.3-1.3-5.5-3.6l-2-3.6a1.35 1.35 0 0 1 2.3-1.4l1.8 2.8"/><path d="M9.5 22h3"/></svg>';

  // The widget needs the panel to be INSIDE the card so it expands the card,
  // NOT trapped in the card foot's row. We render:
  //   <trigger> in the host element (the card foot)
  //   <panel>   appended to the card's body (so the card grows when it opens)
  // The host's data-reactions-for tells us the story id; we walk up to find
  // the card body (.rc-body) and append the panel there.
  function findCardBody(host) {
    var n = host;
    for (var i = 0; i < 6 && n; i++) {
      if (n.classList && n.classList.contains('rc-body')) return n;
      n = n.parentNode;
    }
    // fallback: append next to the host so at least it works
    return host.parentNode;
  }

  function build(host) {
    var storyId = host.getAttribute('data-reactions-for');
    if (!storyId || host._egrBuilt) return;
    host._egrBuilt = true;

    // The trigger button replaces the host's content.
    var trig = document.createElement('button');
    trig.className = 'egr-trig'; trig.type = 'button';
    trig.setAttribute('aria-label', 'React to this story');
    trig.innerHTML = HAND + '<span class="lbl">React</span><span class="ct" data-egr-ct></span>';
    host.innerHTML = '';
    host.appendChild(trig);

    // The panel goes INSIDE the card body so it expands the card cleanly.
    var cardBody = findCardBody(host);
    var panel = document.createElement('div');
    panel.className = 'egr-panel';
    panel.setAttribute('data-egr-panel-for', storyId);
    panel.innerHTML = '<div class="egr-panel-h">How did this land?</div>'
      + '<div class="egr-panel-hs">Tap a circle for a quick moderate, or pick an exact strength 1\u20135.</div>'
      + '<div data-egr-list></div>'
      + '<div class="egr-foot">Private. Everyone sees totals \u2014 no one, including us, sees it was you.</div>';
    cardBody.appendChild(panel);

    var listEl = panel.querySelector('[data-egr-list]');
    var ctEl = trig.querySelector('[data-egr-ct]');

    R.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'egr-row';
      row.setAttribute('data-egr-k', r.k);
      var segs = '';
      for (var i = 1; i <= 5; i++) {
        segs += '<button type="button" data-egr-lvl="' + i + '" aria-label="' + LV[i] + '">' + i + '</button>';
      }
      row.innerHTML =
        '<div class="egr-top">'
        + '<div class="egr-ring" data-egr-circle role="button" tabindex="0" aria-label="Quick moderate reaction">'
        + '<svg width="30" height="30" viewBox="0 0 30 30">'
        + '<circle class="bg" cx="15" cy="15" r="12" fill="none" stroke-width="2.5"/>'
        + '<circle class="fg" cx="15" cy="15" r="12" fill="none" stroke-width="2.5" '
        + 'stroke-dasharray="' + CIRC + '" stroke-dashoffset="' + CIRC + '"/></svg>'
        + '<div class="ctr"></div></div>'
        + '<div class="egr-info"><div class="egr-lab"><span class="egr-dot" style="background:' + r.c + '"></span>' + r.l + '</div>'
        + '<div class="egr-meta" data-egr-meta>Circle = quick \u00b7 numbers = exact</div></div>'
        + '<div class="egr-cnt" data-egr-cnt>\u00b7</div>'
        + '</div>'
        + '<div class="egr-segs">' + segs + '</div>';
      listEl.appendChild(row);

      var fg = row.querySelector('.fg'),
          ctr = row.querySelector('.ctr'),
          meta = row.querySelector('[data-egr-meta]'),
          circle = row.querySelector('[data-egr-circle]'),
          segBtns = row.querySelectorAll('[data-egr-lvl]');

      function paint(level) {
        fg.setAttribute('stroke-dashoffset', CIRC * (1 - level / 5));
        ctr.textContent = level > 0 ? level : '';
        meta.textContent = level > 0
          ? (level + ' \u00b7 ' + LV[level])
          : 'Circle = quick \u00b7 numbers = exact';
        row.classList.toggle('set', level > 0);
        segBtns.forEach(function (b) {
          b.classList.toggle('on', parseInt(b.getAttribute('data-egr-lvl'), 10) === level);
        });
      }
      function current() {
        var mine = window.egleze.reactions.getMine(storyId) || {};
        return mine[r.k] || 0;
      }
      function setLevel(lvl) {
        paint(lvl);
        window.egleze.reactions.setForStory(storyId, r.k, lvl);
      }

      circle.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        setLevel(current() > 0 ? 0 : FAST_LEVEL);
      });
      circle.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation();
          setLevel(current() > 0 ? 0 : FAST_LEVEL);
        }
      });
      segBtns.forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var lvl = parseInt(b.getAttribute('data-egr-lvl'), 10);
          setLevel(current() === lvl ? 0 : lvl);
        });
      });
    });

    // Trigger toggles the inline panel. Same simple model on every device.
    trig.addEventListener('click', function (e) {
      e.stopPropagation();
      // close any other open panels first
      document.querySelectorAll('.egr-panel.open').forEach(function (p) {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        window.egleze.reactions.refreshTotals(storyId);
        if (window.egleze.reactions._loadMine) window.egleze.reactions._loadMine(storyId);
      }
    });
    // Clicks inside the panel never close it.
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    // Click anywhere else on the page closes the panel.
    document.addEventListener('click', function () {
      panel.classList.remove('open');
    });

    function render() {
      var totals = window.egleze.reactions.getTotals(storyId) || [];
      var mine = window.egleze.reactions.getMine(storyId) || {};
      var sum = 0, byKey = {};
      totals.forEach(function (t) { byKey[t.reaction] = t; });
      R.forEach(function (r) {
        var row = listEl.querySelector('[data-egr-k="' + r.k + '"]');
        if (!row) return;
        var cnt = row.querySelector('[data-egr-cnt]');
        var t = byKey[r.k];
        cnt.textContent = t ? t.display : '\u00b7';
        if (t && typeof t.total === 'number') sum += t.total;
        var lvl = mine[r.k] || 0;
        var fg = row.querySelector('.fg'),
            ctr = row.querySelector('.ctr'),
            meta = row.querySelector('[data-egr-meta]'),
            segBtns = row.querySelectorAll('[data-egr-lvl]');
        fg.setAttribute('stroke-dashoffset', CIRC * (1 - lvl / 5));
        if (lvl > 0) {
          ctr.textContent = lvl;
          meta.textContent = lvl + ' \u00b7 ' + LV[lvl];
          row.classList.add('set');
        } else {
          ctr.textContent = '';
          meta.textContent = 'Circle = quick \u00b7 numbers = exact';
          row.classList.remove('set');
        }
        segBtns.forEach(function (b) {
          b.classList.toggle('on', parseInt(b.getAttribute('data-egr-lvl'), 10) === lvl);
        });
      });
      // trigger label shows count of MY reactions (not the public sum) so the
      // user sees their own engagement reflected on the trigger.
      var myCount = Object.keys(mine).length;
      ctEl.textContent = myCount > 0 ? ('\u00b7 ' + myCount) : '';
      trig.classList.toggle('has', myCount > 0);
    }
    window.egleze.reactions.onChange(function (changed) {
      if (String(changed) === String(storyId)) render();
    });
    window.egleze.reactions.refreshTotals(storyId);
  }

  function scan() {
    document.querySelectorAll('[data-reactions-for]').forEach(build);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', scan);
  else scan();
  window.egleze.reactions._rescan = scan;
})();
