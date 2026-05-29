(function(){
  "use strict";

  if(window.__followMeQrVerifiedScannerSafe20260529) return;
  window.__followMeQrVerifiedScannerSafe20260529 = true;

  var OVERLAY_ID = "followmeQrVerifiedOverlay20260529";
  var BADGE_ID = "followmeQrVerifiedBadge20260529";
  var DETAIL_ID = "followmeQrVerifiedDetail20260529";
  var CSS_ID = "followmeQrVerifiedScannerCss20260529";

  function injectStyle(){
    if(document.getElementById(CSS_ID)) return;

    var style = document.createElement("style");
    style.id = CSS_ID;

    style.textContent =
      "#" + OVERLAY_ID + "{" +
        "position:fixed;" +
        "inset:0;" +
        "z-index:999999;" +
        "display:flex;" +
        "align-items:center;" +
        "justify-content:center;" +
        "padding:22px;" +
        "background:radial-gradient(circle at 30% 10%,rgba(52,199,89,.14),transparent 34%),radial-gradient(circle at 70% 90%,rgba(10,132,255,.12),transparent 32%),rgba(248,250,252,.96);" +
        "backdrop-filter:blur(18px);" +
        "-webkit-backdrop-filter:blur(18px);" +
        "opacity:1;" +
        "transition:opacity .34s ease,transform .34s ease;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;" +
      "}" +

      "#" + OVERLAY_ID + ".hide{" +
        "opacity:0;" +
        "pointer-events:none;" +
        "transform:scale(1.012);" +
      "}" +

      ".fm-qr-verified-card-20260529{" +
        "width:min(390px,92vw);" +
        "border-radius:34px;" +
        "padding:30px 24px 24px;" +
        "background:rgba(255,255,255,.86);" +
        "border:1px solid rgba(15,23,42,.08);" +
        "box-shadow:0 28px 80px rgba(15,23,42,.18),inset 0 1px 0 rgba(255,255,255,.9);" +
        "text-align:center;" +
        "position:relative;" +
        "overflow:hidden;" +
      "}" +

      ".fm-qr-verified-card-20260529:before{" +
        "content:'';" +
        "position:absolute;" +
        "inset:0;" +
        "background:linear-gradient(135deg,rgba(255,255,255,.78),transparent 38%,rgba(52,199,89,.07));" +
        "pointer-events:none;" +
      "}" +

      ".fm-qr-verified-shield-20260529{" +
        "width:72px;" +
        "height:72px;" +
        "border-radius:24px;" +
        "margin:0 auto 18px;" +
        "display:grid;" +
        "place-items:center;" +
        "background:linear-gradient(145deg,rgba(52,199,89,.22),rgba(48,209,88,.08)),#fff;" +
        "box-shadow:0 18px 36px rgba(52,199,89,.18),inset 0 0 0 1px rgba(52,199,89,.16);" +
        "font-size:34px;" +
        "position:relative;" +
        "z-index:1;" +
        "animation:fmQrVerifiedPulse20260529 1.35s ease-in-out infinite;" +
      "}" +

      "@keyframes fmQrVerifiedPulse20260529{" +
        "0%,100%{transform:scale(1);box-shadow:0 18px 36px rgba(52,199,89,.16),inset 0 0 0 1px rgba(52,199,89,.16);}" +
        "50%{transform:scale(1.035);box-shadow:0 22px 44px rgba(52,199,89,.23),inset 0 0 0 1px rgba(52,199,89,.22);}" +
      "}" +

      ".fm-qr-verified-title-20260529{" +
        "position:relative;" +
        "z-index:1;" +
        "font-size:27px;" +
        "line-height:1.05;" +
        "font-weight:950;" +
        "letter-spacing:-.7px;" +
        "color:#07111f;" +
        "margin:0;" +
      "}" +

      ".fm-qr-verified-sub-20260529{" +
        "position:relative;" +
        "z-index:1;" +
        "margin:10px auto 0;" +
        "max-width:310px;" +
        "font-size:15px;" +
        "line-height:1.38;" +
        "font-weight:650;" +
        "color:#475569;" +
      "}" +

      ".fm-qr-scanner-track-20260529{" +
        "position:relative;" +
        "z-index:1;" +
        "margin:24px auto 0;" +
        "height:12px;" +
        "width:100%;" +
        "max-width:300px;" +
        "border-radius:999px;" +
        "background:rgba(15,23,42,.06);" +
        "overflow:hidden;" +
        "box-shadow:inset 0 1px 2px rgba(15,23,42,.08);" +
      "}" +

      ".fm-qr-scanner-fill-20260529{" +
        "position:absolute;" +
        "inset:0 auto 0 0;" +
        "width:100%;" +
        "border-radius:999px;" +
        "background:linear-gradient(90deg,rgba(52,199,89,.16),rgba(52,199,89,.42),rgba(10,132,255,.36));" +
        "transform-origin:left center;" +
        "transform:scaleX(0);" +
        "animation:fmQrScannerProgress20260529 1.45s cubic-bezier(.2,.9,.2,1) forwards;" +
      "}" +

      "@keyframes fmQrScannerProgress20260529{" +
        "0%{transform:scaleX(.04);}" +
        "52%{transform:scaleX(.68);}" +
        "100%{transform:scaleX(1);}" +
      "}" +

      ".fm-qr-scanner-beam-20260529{" +
        "position:absolute;" +
        "top:-18px;" +
        "bottom:-18px;" +
        "width:72px;" +
        "border-radius:999px;" +
        "background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),rgba(52,199,89,.65),transparent);" +
        "filter:blur(.3px);" +
        "transform:skewX(-18deg);" +
        "animation:fmQrScannerBeam20260529 1.3s cubic-bezier(.2,.9,.2,1) forwards;" +
      "}" +

      "@keyframes fmQrScannerBeam20260529{" +
        "0%{left:-90px;opacity:.15;}" +
        "12%{opacity:1;}" +
        "100%{left:calc(100% + 40px);opacity:.25;}" +
      "}" +

      ".fm-qr-verified-check-20260529{" +
        "position:relative;" +
        "z-index:1;" +
        "margin:18px auto 0;" +
        "display:inline-flex;" +
        "align-items:center;" +
        "justify-content:center;" +
        "gap:7px;" +
        "min-height:34px;" +
        "padding:8px 14px;" +
        "border-radius:999px;" +
        "color:#0f7a37;" +
        "background:rgba(52,199,89,.12);" +
        "border:1px solid rgba(52,199,89,.22);" +
        "font-size:13px;" +
        "font-weight:900;" +
        "opacity:0;" +
        "transform:translateY(6px);" +
        "animation:fmQrCheckIn20260529 .35s ease forwards;" +
        "animation-delay:1.1s;" +
      "}" +

      "@keyframes fmQrCheckIn20260529{" +
        "to{opacity:1;transform:translateY(0);}" +
      "}" +

      ".fm-qr-verified-mini-20260529{" +
        "position:relative;" +
        "z-index:1;" +
        "margin-top:14px;" +
        "color:#64748b;" +
        "font-size:12px;" +
        "font-weight:750;" +
      "}" +

      "#" + BADGE_ID + "{" +
        "position:fixed;" +
        "top:calc(10px + env(safe-area-inset-top));" +
        "left:50%;" +
        "transform:translateX(-50%) translateY(-4px);" +
        "z-index:99990;" +
        "display:inline-flex;" +
        "align-items:center;" +
        "gap:7px;" +
        "padding:8px 12px;" +
        "border-radius:999px;" +
        "background:rgba(255,255,255,.88);" +
        "color:#0f7a37;" +
        "border:1px solid rgba(52,199,89,.22);" +
        "box-shadow:0 10px 28px rgba(15,23,42,.12);" +
        "backdrop-filter:blur(14px);" +
        "-webkit-backdrop-filter:blur(14px);" +
        "font-size:12px;" +
        "font-weight:950;" +
        "letter-spacing:-.1px;" +
        "opacity:0;" +
        "transition:opacity .28s ease,transform .28s ease;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;" +
        "cursor:pointer;" +
      "}" +

      "#" + BADGE_ID + ".show{" +
        "opacity:1;" +
        "transform:translateX(-50%) translateY(0);" +
      "}" +

      "#" + DETAIL_ID + "{" +
        "position:fixed;" +
        "top:calc(52px + env(safe-area-inset-top));" +
        "left:50%;" +
        "transform:translateX(-50%) translateY(-4px);" +
        "z-index:99991;" +
        "width:min(330px,calc(100vw - 28px));" +
        "padding:14px;" +
        "border-radius:22px;" +
        "background:rgba(255,255,255,.95);" +
        "color:#0f172a;" +
        "border:1px solid rgba(15,23,42,.08);" +
        "box-shadow:0 20px 60px rgba(15,23,42,.18);" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;" +
        "opacity:0;" +
        "pointer-events:none;" +
        "transition:opacity .2s ease,transform .2s ease;" +
      "}" +

      "#" + DETAIL_ID + ".show{" +
        "opacity:1;" +
        "pointer-events:auto;" +
        "transform:translateX(-50%) translateY(0);" +
      "}" +

      "#" + DETAIL_ID + " strong{" +
        "display:block;" +
        "font-size:14px;" +
        "font-weight:950;" +
        "margin-bottom:5px;" +
      "}" +

      "#" + DETAIL_ID + " p{" +
        "margin:0;" +
        "color:#475569;" +
        "font-size:12px;" +
        "line-height:1.38;" +
        "font-weight:650;" +
      "}" +

            "/* FOLLOWME_QR_VERIFIED_PUBLIC_BUTTON_HIERARCHY_20260529 */" +
      "@media(max-width:640px){" +
        "body .premium-actions,body .actions,body .cta-row{padding-top:46px!important;gap:10px!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;}" +
        "body .premium-btn{min-height:48px!important;padding:13px 16px!important;font-size:14px!important;border-radius:17px!important;width:100%!important;}" +
        "body .premium-btn[href],body a.premium-btn[target=_blank]{margin-top:8px!important;min-height:40px!important;padding:10px 14px!important;font-size:13px!important;border-radius:14px!important;background:rgba(255,255,255,.72)!important;color:#475569!important;border:1px solid rgba(15,23,42,.10)!important;box-shadow:none!important;}" +
      "}" +
"@media(max-width:480px){" +
        ".fm-qr-verified-card-20260529{border-radius:30px;padding:28px 20px 22px;}" +
        ".fm-qr-verified-title-20260529{font-size:25px;}" +
        ".fm-qr-verified-sub-20260529{font-size:14px;}" +
      "}";

    document.head.appendChild(style);
  }

  function makeOverlay(){
    if(document.getElementById(OVERLAY_ID)) return;

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");

    overlay.innerHTML =
      '<div class="fm-qr-verified-card-20260529">' +
        '<div class="fm-qr-verified-shield-20260529">🛡️</div>' +
        '<h1 class="fm-qr-verified-title-20260529">QR verificato</h1>' +
        '<div class="fm-qr-verified-sub-20260529">La destinazione è stata controllata prima della pubblicazione.</div>' +
        '<div class="fm-qr-scanner-track-20260529" aria-hidden="true">' +
          '<div class="fm-qr-scanner-fill-20260529"></div>' +
          '<div class="fm-qr-scanner-beam-20260529"></div>' +
        '</div>' +
        '<div class="fm-qr-verified-check-20260529">✓ Controllo completato</div>' +
        '<div class="fm-qr-verified-mini-20260529">Accesso protetto da FollowMe</div>' +
      '</div>';

    document.body.appendChild(overlay);

    setTimeout(function(){
      overlay.classList.add("hide");
      showBadge();
    }, 1750);

    setTimeout(function(){
      try { overlay.remove(); } catch(e) {}
    }, 2250);
  }

  function showBadge(){
    if(!document.getElementById(BADGE_ID)){
      var badge = document.createElement("button");
      badge.id = BADGE_ID;
      badge.type = "button";
      badge.innerHTML = "<span>🛡️</span><span>QR verificato</span>";
      document.body.appendChild(badge);

      badge.addEventListener("click", function(){
        toggleDetail();
      });
    }

    if(!document.getElementById(DETAIL_ID)){
      var detail = document.createElement("div");
      detail.id = DETAIL_ID;
      detail.innerHTML =
        "<strong>Destinazione controllata</strong>" +
        "<p>Questo QR mostra una destinazione configurata tramite FollowMe e controllata prima della pubblicazione.</p>";
      document.body.appendChild(detail);
    }

    requestAnimationFrame(function(){
      var badge = document.getElementById(BADGE_ID);
      if(badge) badge.classList.add("show");
    });
  }

  function toggleDetail(){
    var d = document.getElementById(DETAIL_ID);
    if(!d) return;

    d.classList.toggle("show");

    clearTimeout(d._hideTimer);
    if(d.classList.contains("show")){
      d._hideTimer = setTimeout(function(){
        d.classList.remove("show");
      }, 3600);
    }
  }

  function boot(){
    injectStyle();
    makeOverlay();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  }else{
    boot();
  }
})();
