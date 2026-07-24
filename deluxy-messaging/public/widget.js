// Deluxy Messaggi — widget di chat per i siti.
// Uso: <script src="https://TUA-APP/widget.js" defer></script>
// Crea un bottone flottante in basso a destra che apre la chat in un iframe.
(function () {
  var script = document.currentScript;
  if (!script) return;
  var origine = new URL(script.src).origin;

  var aperto = false;

  var bottone = document.createElement('button');
  bottone.setAttribute('aria-label', 'Apri la chat');
  bottone.style.cssText =
    'position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;' +
    'border-radius:50%;border:none;cursor:pointer;background:#111318;color:#b8963e;' +
    'box-shadow:0 4px 12px rgba(0,0,0,.18),0 24px 60px rgba(0,0,0,.12);' +
    'display:flex;align-items:center;justify-content:center;padding:0;';
  bottone.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.8-5.2a8 8 0 0 1-.8-3.5A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z"/></svg>';

  var iframe = document.createElement('iframe');
  iframe.src = origine + '/widget';
  iframe.title = 'Chat';
  iframe.style.cssText =
    'position:fixed;right:20px;bottom:88px;z-index:2147483000;width:370px;height:560px;' +
    'max-width:calc(100vw - 40px);max-height:calc(100vh - 110px);border:none;' +
    'border-radius:18px;box-shadow:0 4px 12px rgba(0,0,0,.18),0 24px 60px rgba(0,0,0,.22);' +
    'display:none;background:#f5f5f7;';

  var CHIUDI =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var APRI = bottone.innerHTML;

  bottone.addEventListener('click', function () {
    aperto = !aperto;
    iframe.style.display = aperto ? 'block' : 'none';
    bottone.innerHTML = aperto ? CHIUDI : APRI;
    bottone.setAttribute('aria-label', aperto ? 'Chiudi la chat' : 'Apri la chat');
  });

  function monta() {
    document.body.appendChild(iframe);
    document.body.appendChild(bottone);
  }
  if (document.body) monta();
  else document.addEventListener('DOMContentLoaded', monta);
})();
