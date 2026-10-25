/* ongeki_collect_console.js
 * PCブラウザのDevToolsコンソールに貼り付けて実行する版。
 * ongeki-score.net のユーザーページ（どのタブでも可）で実行すること。
 * 実行すると /rating と /technical を取得し、完了したら
 * JSONファイルを自動でダウンロードする（クリック等の操作は不要）。
 */
(async function () {
  'use strict';

  function txt(el) {
    return el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function num(s) {
    if (s == null) return null;
    var v = String(s).replace(/[^0-9.\-]/g, '');
    if (v === '' || v === '-' || v === '.') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  function musicRef(a) {
    if (!a) return { musicId: null, diff: null };
    var m = /\/music\/(\d+)\/(\w+)/.exec(a.getAttribute('href') || '');
    return m ? { musicId: Number(m[1]), diff: m[2] } : { musicId: null, diff: null };
  }
  function headingFor(doc, table) {
    var list = Array.prototype.slice.call(doc.querySelectorAll('h3, table'));
    var idx = list.indexOf(table);
    for (var j = idx - 1; j >= 0; j--) {
      if (list[j].tagName === 'H3') return txt(list[j]);
    }
    return '';
  }

  function parseRating(doc) {
    var tables = doc.querySelectorAll('table');
    var out = { 統計: [], 新曲枠: [], ベスト枠: [], プラチナスコア枠: [] };
    if (!tables.length) return out;

    var st = tables[0].rows;
    for (var i = 1; i < st.length; i++) {
      var c = st[i].cells;
      if (c.length < 7) continue;
      out.統計.push({
        枠: txt(c[0]), 平均値: num(txt(c[1])), 対象曲数: num(txt(c[2])),
        Max: num(txt(c[3])), Min: num(txt(c[4])),
        合計レート値: num(txt(c[5])), レート寄与値: num(txt(c[6]))
      });
    }

    for (var t = 1; t < tables.length; t++) {
      var table = tables[t];
      var key = headingFor(doc, table);
      if (!out[key]) continue;
      var plat = key === 'プラチナスコア枠';
      var rows = table.rows;
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].cells;
        if (cells.length < 7) continue;
        var a = cells[1].querySelector ? cells[1].querySelector('a') : null;
        if (!a) continue;
        var ref = musicRef(a);
        var rec = {
          順位: num(txt(cells[0])),
          曲名: txt(a),
          musicId: ref.musicId,
          diff: ref.diff,
          Dif: txt(cells[2]),
          定数: num(txt(cells[3])),
          定数推定: !!cells[3].querySelector('.estimated-rating'),
          レート値: num(txt(cells[6])),
          レート推定: !!cells[6].querySelector('.estimated-rating')
        };
        if (plat) {
          rec.プラチナスコア = num(txt(cells[4]));
          rec['☆'] = num(txt(cells[5]));
        } else {
          rec.スコア = num(txt(cells[4]));
          rec.ランプ = txt(cells[5]);
        }
        out[key].push(rec);
      }
    }
    return out;
  }

  function parseTechnical(doc) {
    var tables = doc.querySelectorAll('table');
    var target = null, best = 0;
    for (var i = 0; i < tables.length; i++) {
      if (tables[i].rows.length > best) { best = tables[i].rows.length; target = tables[i]; }
    }
    if (!target) return [];
    var out = [], rows = target.rows;
    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      var tdTitle = tr.querySelector('td.sort_title');
      if (!tdTitle) continue;
      var a = tdTitle.querySelector('a');
      var ref = musicRef(a);
      var sk = function (cls) {
        var td = tr.querySelector('td.' + cls);
        if (!td) return null;
        var k = td.querySelector('span.sort-key');
        return num(txt(k || td));
      };
      var rw = function (cls) {
        var td = tr.querySelector('td.' + cls);
        return td ? txt(td) : null;
      };
      var rateTd = tr.querySelector('td.sort_rate');
      out.push({
        曲名: a ? txt(a) : txt(tdTitle),
        musicId: ref.musicId,
        diff: ref.diff,
        難易度: rw('sort_raw_difficulty'),
        定数: num(txt(tr.querySelector('td.sort_lv'))),
        スコア: sk('sort_ts'),
        次ランクまで: sk('sort_nts'),
        ランク: rw('sort_raw_technical_rank'),
        ランプ: rw('sort_raw_lamp'),
        バトルランク: rw('sort_raw_battle_rank'),
        レート値: rateTd ? num(txt(rateTd)) : null,
        更新日: rw('sort_update')
      });
    }
    return out;
  }

  function parseProfile(doc) {
    var p = {}, tables = doc.querySelectorAll('table');
    if (!tables.length) return p;
    var rows = tables[0].rows;
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].cells;
      if (c.length >= 2) p[txt(c[0])] = txt(c[1]);
    }
    return p;
  }

  function get(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url); return res.text(); })
      .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  var m = location.pathname.match(/\/user\/(\d+)/);
  if (!m) {
    console.error('ongeki-score.net のユーザーページ（/user/数字/...）で実行してください。現在地: ' + location.href);
    return;
  }
  var base = '/user/' + m[1];

  var result = {
    取得元: 'ongeki-score.net',
    userId: Number(m[1]),
    取得日時: new Date().toISOString(),
    プロフィール: {},
    統計: [], 新曲枠: [], ベスト枠: [], プラチナスコア枠: [],
    全譜面: [],
    errors: []
  };

  console.log('[ongeki-collect] 取得を開始します: ' + base);

  try {
    var ratingDoc = (location.pathname === base + '/rating') ? document : await get(base + '/rating');
    var r = parseRating(ratingDoc);
    result.統計 = r.統計;
    result.新曲枠 = r.新曲枠;
    result.ベスト枠 = r.ベスト枠;
    result.プラチナスコア枠 = r.プラチナスコア枠;
    console.log('[ongeki-collect] /rating 取得完了: 新曲枠' + r.新曲枠.length + ' / ベスト枠' + r.ベスト枠.length + ' / プラチナ枠' + r.プラチナスコア枠.length);
  } catch (e) {
    result.errors.push('rating: ' + e);
    console.error('[ongeki-collect] /rating 取得失敗:', e);
  }

  try {
    var techDoc = (location.pathname === base + '/technical') ? document : await get(base + '/technical');
    result.全譜面 = parseTechnical(techDoc);
    result.プロフィール = parseProfile(techDoc);
    console.log('[ongeki-collect] /technical 取得完了: 全譜面' + result.全譜面.length + '件');
  } catch (e) {
    result.errors.push('technical: ' + e);
    console.error('[ongeki-collect] /technical 取得失敗:', e);
  }

  // ファイル名: 202608161314_ongeki_log.json 形式（過去に使っていた命名に合わせる）
  var d = new Date();
  var filename = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + pad(d.getHours()) + pad(d.getMinutes()) + '_ongeki_log.json';

  var json = JSON.stringify(result, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

  console.log('[ongeki-collect] ダウンロードしました: ' + filename);
  window.__ongekiData = result; // コンソールから中身を直接見たい場合用
  console.log('[ongeki-collect] window.__ongekiData にも格納しました。');
})();
