(function () {
  var script = document.currentScript;
  var siteKey = script && script.getAttribute("data-site-key");
  if (!siteKey) {
    console.error("[supportai widget] missing data-site-key attribute on the script tag");
    return;
  }

  var origin = new URL(script.src).origin;
  var iframe = document.createElement("iframe");
  iframe.src = origin + "/widget?siteKey=" + encodeURIComponent(siteKey);
  iframe.title = "Support chat";
  iframe.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:380px;height:560px;" +
    "max-width:calc(100vw - 40px);max-height:calc(100vh - 40px);" +
    "border:none;border-radius:18px;background:#fff;" +
    "box-shadow:0 24px 60px -12px rgba(15,23,42,0.35),0 0 0 1px rgba(15,23,42,0.06);" +
    "z-index:2147483000;color-scheme:light;";

  // Position is set server-side from Organization.widgetConfig, communicated
  // back once the iframe loads (widget.js has no way to know it up front).
  // This listener only ever repositions the iframe in response to messages
  // whose event.origin matches this script's own origin (checked below) —
  // the sender (the iframe, Task 12) uses a wildcard target origin since the
  // message carries only a layout enum, never anything sensitive, but that
  // is the sender's tradeoff, not a relaxation of the check here.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === "supportai:position") {
      if (event.data.position === "bottom-left") {
        iframe.style.left = "20px";
        iframe.style.right = "auto";
      } else {
        iframe.style.right = "20px";
        iframe.style.left = "auto";
      }
    }
  });

  function mount() {
    document.body.appendChild(iframe);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();
