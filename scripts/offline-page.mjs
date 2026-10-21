/** Standalone HTML startup reporting; no network, eval or policy overrides. */
export function makeOfflinePage(css, script, version = 'v2.4.1') {
  const escapedScript = script.replace(/<\/script/gi, '<\\/script')
  const startup = `
(function () {
  var state = document.getElementById('startup-state');
  var detail = document.getElementById('startup-detail');
  var done = false;
  window.__pnrepStartup = {
    fail: function (message) {
      if (done) return;
      state.hidden = false;
      detail.textContent = '页面启动失败：' + String(message || '原因未记录');
      var app = document.getElementById('app');
      if (app) app.hidden = true;
    },
    complete: function () {
      var app = document.getElementById('app');
      if (!app || !app.hasChildNodes()) {
        this.fail('主界面未生成，请检查文件是否完整。');
        return;
      }
      done = true;
      state.hidden = true;
    }
  };
  window.addEventListener('error', function (event) {
    window.__pnrepStartup.fail(event.message);
  });
})();`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>物料与料号互译 · ${version}</title>
<style>body{margin:0;background:#f7f8f8}${css}</style>
</head>
<body>
<section id="startup-state" class="official-translator" role="status" aria-live="polite">
<h1>物料与料号互译 · 启动检查</h1>
<p id="startup-detail">页面正在启动。如果一直显示此提示，文件可能不完整，或浏览器没有执行脚本。</p>
<p>请通过公司允许的渠道取得完整原始 HTML 文件。复制邮件正文可能改变程序内容；不要关闭公司浏览器的安全保护。</p>
<p>可按 F12 打开 Console（控制台），拍下第一条红色错误帮助排查。</p>
<noscript>浏览器当前未执行 JavaScript。如受公司策略限制，请使用公司批准的运行方式。</noscript>
</section>
<main id="app"></main>
<script>${startup}</script>
<script>
try {
${escapedScript}
window.__pnrepStartup.complete();
} catch (error) {
window.__pnrepStartup.fail(error && error.message);
}
</script>
<!-- PNREP_${version.toUpperCase().replace(/\./g, '_')}_FILE_END -->
</body>
</html>`
}
