/**
 * Static page served by the dbSwitch lambda. All state is fetched from the
 * same URL via POST, so this is a constant: the secret stays in the address
 * bar and never has to be templated into the markup.
 */
export const dbSwitchPage = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>test db</title>
<style>
  :root {
    --bg: #f4f4f5; --card: #fff; --fg: #18181b; --muted: #71717a;
    --line: #e4e4e7; --ok: #15803d; --off: #a1a1aa; --busy: #b45309;
    --err: #b91c1c;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #09090b; --card: #18181b; --fg: #fafafa; --muted: #a1a1aa;
      --line: #27272a; --ok: #4ade80; --off: #71717a; --busy: #fbbf24;
      --err: #f87171;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", "PingFang TC", "Microsoft JhengHei", sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 16px;
  }
  main {
    width: 100%; max-width: 420px; background: var(--card);
    border: 1px solid var(--line); border-radius: 14px; padding: 24px;
  }
  h1 { margin: 0 0 2px; font-size: 18px; }
  .id {
    margin: 0 0 20px; color: var(--muted); font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
  }
  .state { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: var(--off); flex: none; }
  .dot.ok { background: var(--ok); }
  .dot.busy { background: var(--busy); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .25; } }
  .label { font-size: 22px; font-weight: 600; }
  .raw {
    margin: 0 0 20px; color: var(--muted); font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .actions { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  button {
    appearance: none; min-height: 50px; border-radius: 10px; font-size: 16px;
    font-weight: 600; cursor: pointer; border: 1px solid var(--line);
    background: var(--card); color: var(--fg); font-family: inherit;
  }
  button.primary { background: var(--fg); color: var(--card); border-color: var(--fg); }
  button:disabled { opacity: .35; cursor: default; }
  .foot { margin: 18px 0 0; color: var(--muted); font-size: 13px; }
  .foot b { color: var(--fg); font-weight: 600; }
  .err { margin: 14px 0 0; color: var(--err); font-size: 13px; min-height: 1px; }
</style>
</head>
<body>
<main>
  <h1>test db</h1>
  <p class="id" id="id">&nbsp;</p>
  <div class="state"><span class="dot" id="dot"></span><span class="label" id="label">載入中</span></div>
  <p class="raw" id="raw">&nbsp;</p>
  <div class="actions">
    <button id="start" class="primary" disabled>開機</button>
    <button id="stop" disabled>關機</button>
  </div>
  <p class="foot" id="foot">&nbsp;</p>
  <p class="err" id="err"></p>
</main>
<script>
(function () {
  var el = function (i) { return document.getElementById(i); };
  var timer = null;
  var busy = false;

  function post(action) {
    return fetch(location.pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: action })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);

      return r.json();
    });
  }

  function taipei(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var t = new Date(d.getTime() + 8 * 3600 * 1000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };

    return p(t.getUTCMonth() + 1) + '/' + p(t.getUTCDate()) + ' ' +
      p(t.getUTCHours()) + ':' + p(t.getUTCMinutes());
  }

  function render(s) {
    var transitional = s.status !== 'available' && s.status !== 'stopped';
    el('id').textContent = s.identifier || '';
    el('raw').textContent = s.status;
    el('label').textContent = s.status === 'available' ? '運轉中'
      : s.status === 'stopped' ? '已停止'
      : s.status === 'starting' ? '啟動中'
      : s.status === 'stopping' ? '停止中'
      : '處理中';
    el('dot').className = 'dot' + (s.status === 'available' ? ' ok'
      : transitional ? ' busy' : '');
    el('start').disabled = busy || !s.canStart;
    el('stop').disabled = busy || !s.canStop;
    el('foot').innerHTML = s.status === 'stopped'
      ? '啟動要等幾分鐘'
      : '下一次排程關機：<b>' + taipei(s.nextStop) + '</b>';

    clearTimeout(timer);
    timer = setTimeout(poll, transitional ? 5000 : 20000);
  }

  function fail(e) {
    el('err').textContent = String(e && e.message ? e.message : e);
    clearTimeout(timer);
    timer = setTimeout(poll, 10000);
  }

  function poll() {
    post('status').then(function (s) { el('err').textContent = ''; render(s); }, fail);
  }

  function act(action, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    busy = true;
    el('start').disabled = true;
    el('stop').disabled = true;
    el('err').textContent = '';
    post(action).then(function (s) { busy = false; render(s); }, function (e) {
      busy = false;
      fail(e);
    });
  }

  el('start').onclick = function () { act('start', null); };
  el('stop').onclick = function () { act('stop', '確定要關機？'); };
  poll();
})();
</script>
</body>
</html>`;
