// /js/reactions-widget.js — Egleze reaction UI (tap-to-select)
// Renders into any element with data-reactions-for="<storyId>".
// Wires to window.egleze.reactions (data layer). Load AFTER auth.js + reactions.js.
//
// Interaction (LOCKED — Option 2, tap-to-select for data accuracy):
//  - Open the hand -> panel with 5 reactions.
//  - Each reaction has 5 tappable level segments (1..5).
//  - Tap a segment        -> sets that exact intensity (saved immediately).
//  - Tap the reaction LABEL (not a segment) -> sets level 3 (locked tap=3 default).
//  - Tap the currently-selected segment again -> clears that reaction.
//  - Ring fills to chosen level for visual feedback. Single red. Stores 1..5 only.
//  - Logged-out -> reactions.js opens the existing sign-in modal.

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
  var TAP_LEVEL = 3;            // tapping the row label (not a segment) => 3 (locked)
  var CIRC = 2 * Math.PI * 15;

  var css = ''
   + '.egr-wrap{position:relative;display:inline-flex;align-items:center}'
   + '.egr-trigger{display:inline-flex;align-items:center;background:none;border:none;cursor:pointer;padding:0;color:#888780;line-height:1;font:inherit}'
   + '.egr-trigger:hover{color:#bb1919}.egr-trigger.has{color:#bb1919}'
   + '.egr-ct{font-family:"Roboto Condensed",sans-serif;font-size:10px;color:#888;margin-left:4px;letter-spacing:.5px}'
   + '.egr-pop{position:absolute;right:0;width:280px;background:#fff;border:.5px solid #e0e0da;border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:8px;z-index:9000;display:none;max-height:min(74vh,440px);overflow-y:auto;-webkit-overflow-scrolling:touch}'
   + '.egr-pop.open{display:block}'
   + '.egr-pop.up{bottom:140%}.egr-pop.down{top:140%}'
   + '.egr-pop.up::after{content:"";position:absolute;bottom:-6px;right:16px;width:11px;height:11px;background:#fff;border-right:.5px solid #e0e0da;border-bottom:.5px solid #e0e0da;transform:rotate(45deg)}'
   + '.egr-pop.down::after{content:"";position:absolute;top:-6px;right:16px;width:11px;height:11px;background:#fff;border-left:.5px solid #e0e0da;border-top:.5px solid #e0e0da;transform:rotate(45deg)}'
   + '.egr-h{font-family:"Roboto Condensed",sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#888;padding:4px 8px 6px}'
   + '.egr-hs{font-size:10px;color:#888;padding:0 8px 8px;border-bottom:.5px solid #f1efe8;margin-bottom:6px}'
   + '.egr-row{padding:8px;border-radius:3px;transition:background .12s}'
   + '.egr-row:hover{background:#faf8f3}.egr-row.set{background:#fbeeee}'
   + '.egr-top{display:flex;align-items:center;gap:11px}'
   + '.egr-ring{position:relative;width:34px;height:34px;flex-shrink:0}'
   + '.egr-ring svg{transform:rotate(-90deg);display:block}'
   + '.egr-ring .bg{stroke:#eceae2}'
   + '.egr-ring .fg{stroke:#bb1919;stroke-linecap:round;transition:stroke-dashoffset .18s ease}'
   + '.egr-ring .ctr{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Roboto Condensed",sans-serif;font-size:12px;font-weight:700;color:#888}'
   + '.egr-row.set .egr-ring .ctr{color:#bb1919}'
   + '.egr-info{flex:1;min-width:0;cursor:pointer}'
   + '.egr-lab{font-size:13px;color:#111;font-weight:500;display:flex;align-items:center;gap:8px}'
   + '.egr-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}'
   + '.egr-meta{font-family:"Roboto Condensed",sans-serif;font-size:10px;color:#888;letter-spacing:.5px;margin-top:2px}'
   + '.egr-cnt{font-family:"Roboto Condensed",sans-serif;font-size:10px;color:#888;letter-spacing:.5px;flex-shrink:0}'
   + '.egr-seg{display:flex;gap:4px;margin:9px 0 1px;padding-left:45px}'
   + '.egr-seg button{flex:1;height:18px;border:.5px solid #e0e0da;background:#f4f2ec;border-radius:3px;cursor:pointer;font-family:"Roboto Condensed",sans-serif;font-size:10px;font-weight:700;color:#aaa;padding:0;transition:background .12s,color .12s,border-color .12s}'
   + '.egr-seg button:hover{border-color:#bb1919;color:#bb1919}'
   + '.egr-seg button.on{background:#bb1919;border-color:#bb1919;color:#fff}'
   + '.egr-foot{font-size:10px;color:#888;padding:9px 8px 4px;border-top:.5px solid #f1efe8;margin-top:6px;line-height:1.45}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var HAND = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V4a1.4 1.4 0 0 1 2.8 0v4.5"/><path d="M10.8 8.8V2.6a1.4 1.4 0 0 1 2.8 0v6"/><path d="M13.6 3.4a1.4 1.4 0 0 1 2.8 0v9.8c0 3.8-2.3 6.6-5.8 6.6-2.6 0-4.3-1.3-5.5-3.6l-2-3.6a1.35 1.35 0 0 1 2.3-1.4l1.8 2.8"/><path d="M9.5 22h3"/></svg>';
  var HAND_S = HAND.replace('width="15" height="15"', 'width="11" height="11"');

  function build(host) {
    var storyId = host.getAttribute('data-reactions-for');
    if (!storyId || host._egrBuilt) return;
    host._egrBuilt = true;

    var wrap = document.createElement('span'); wrap.className = 'egr-wrap';
    var trig = document.createElement('button');
    trig.className = 'egr-trigger'; trig.type = 'button';
    trig.setAttribute('aria-label', 'React to this story');
    trig.innerHTML = HAND + '<span class="egr-ct" data-egr-ct></span>';
    var pop = document.createElement('div'); pop.className = 'egr-pop';
    pop.innerHTML = '<div class="egr-h">How did this land?</div>'
      + '<div class="egr-hs">Tap a reaction for moderate, or pick an exact strength 1\u20135.</div>'
      + '<div data-egr-list></div>'
      + '<div class="egr-foot">Private. Everyone sees totals \u2014 no one, including us, sees it was you.</div>';
    wrap.appendChild(trig); wrap.appendChild(pop); host.appendChild(wrap);

    var listEl = pop.querySelector('[data-egr-list]');
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
        + '<div class="egr-ring"><svg width="34" height="34" viewBox="0 0 34 34">'
        + '<circle class="bg" cx="17" cy="17" r="15" fill="none" stroke-width="3"/>'
        + '<circle class="fg" cx="17" cy="17" r="15" fill="none" stroke-width="3" '
        + 'stroke-dasharray="' + CIRC + '" stroke-dashoffset="' + CIRC + '"/></svg>'
        + '<div class="ctr">' + HAND_S + '</div></div>'
        + '<div class="egr-info" data-egr-label><div class="egr-lab"><span class="egr-dot" style="background:' + r.c + '"></span>' + r.l + '</div>'
        + '<div class="egr-meta" data-egr-meta>Tap = moderate \u00b7 or pick 1\u20135</div></div>'
        + '<div class="egr-cnt" data-egr-cnt>\u00b7</div>'
        + '</div>'
        + '<div class="egr-seg">' + segs + '</div>';
      listEl.appendChild(row);

      var fg = row.querySelector('.fg'),
          ctr = row.querySelector('.ctr'),
          meta = row.querySelector('[data-egr-meta]'),
          segBtns = row.querySelectorAll('[data-egr-lvl]');

      function paint(level) {
        fg.setAttribute('stroke-dashoffset', CIRC * (1 - level / 5));
        if (level > 0) { ctr.textContent = level; }
        else { ctr.innerHTML = HAND_S; }
        meta.textContent = level > 0 ? (level + ' \u00b7 ' + LV[level]) : 'Tap = moderate \u00b7 or pick 1\u20135';
        row.classList.toggle('set', level > 0);
        segBtns.forEach(function (b) {
          b.classList.toggle('on', parseInt(b.getAttribute('data-egr-lvl'), 10) === level);
        });
      }

      function current() {
        var mine = window.egleze.reactions.getMine(storyId) || {};
        return mine[r.k] || 0;
      }

      segBtns.forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var lvl = parseInt(b.getAttribute('data-egr-lvl'), 10);
          if (current() === lvl) {
            paint(0);
            window.egleze.reactions.setForStory(storyId, r.k, 0);
          } else {
            paint(lvl);
            window.egleze.reactions.setForStory(storyId, r.k, lvl);
          }
        });
      });

      row.querySelector('[data-egr-label]').addEventListener('click', function (e) {
        e.stopPropagation();
        if (current() === TAP_LEVEL) {
          paint(0);
          window.egleze.reactions.setForStory(storyId, r.k, 0);
        } else {
          paint(TAP_LEVEL);
          window.egleze.reactions.setForStory(storyId, r.k, TAP_LEVEL);
        }
      });
    });

    trig.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !pop.classList.contains('open');
      document.querySelectorAll('.egr-pop.open').forEach(function (p) {
        p.classList.remove('open'); p.classList.remove('up'); p.classList.remove('down');
      });
      if (willOpen) {
        var rect = trig.getBoundingClientRect();
        var spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 320 && rect.top > spaceBelow) pop.classList.add('up');
        else pop.classList.add('down');
        pop.classList.add('open');
        window.egleze.reactions.refreshTotals(storyId);
        if (window.egleze.reactions._loadMine) window.egleze.reactions._loadMine(storyId);
      }
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () {
      pop.classList.remove('open'); pop.classList.remove('up'); pop.classList.remove('down');
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
          ctr.innerHTML = HAND_S;
          meta.textContent = 'Tap = moderate \u00b7 or pick 1\u20135';
          row.classList.remove('set');
        }
        segBtns.forEach(function (b) {
          b.classList.toggle('on', parseInt(b.getAttribute('data-egr-lvl'), 10) === lvl);
        });
      });
      ctEl.textContent = sum > 0 ? sum : '';
      trig.classList.toggle('has', Object.keys(mine).length > 0);
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
