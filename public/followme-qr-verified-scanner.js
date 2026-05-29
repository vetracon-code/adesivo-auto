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

    setTimeout(fixPublicFrameNotBlank20260529, 1800);
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



  // FOLLOWME_PREMIUM_PUBLIC_ACTIONS_UX_20260529
  function injectPremiumPublicActionsUx(){
    if(document.getElementById("followmePremiumPublicActionsUx20260529")) return;

    var style = document.createElement("style");
    style.id = "followmePremiumPublicActionsUx20260529";
    style.textContent = `
      :root{
        --fm-premium-ink:#0f172a;
        --fm-premium-muted:#64748b;
        --fm-premium-line:rgba(15,23,42,.09);
        --fm-premium-green:#16a34a;
        --fm-premium-green-dark:#0f7a37;
        --fm-premium-blue:#0a84ff;
        --fm-premium-surface:rgba(255,255,255,.88);
      }

      body{
        -webkit-font-smoothing:antialiased !important;
        text-rendering:geometricPrecision !important;
      }

      /*
        Banner QR verificato:
        non flottante, non sovrapposto, premium e stabile.
      */
      #followmeQrVerifiedStaticBanner20260529{
        width:100% !important;
        max-width:430px !important;
        margin:16px auto 16px !important;
        padding:13px 15px !important;
        border-radius:22px !important;
        display:flex !important;
        align-items:center !important;
        gap:12px !important;
        text-align:left !important;
        background:
          linear-gradient(145deg, rgba(255,255,255,.96), rgba(248,250,252,.88)) !important;
        border:1px solid rgba(22,163,74,.18) !important;
        box-shadow:
          0 18px 44px rgba(15,23,42,.10),
          inset 0 1px 0 rgba(255,255,255,.92) !important;
        color:var(--fm-premium-ink) !important;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif !important;
        cursor:pointer !important;
        box-sizing:border-box !important;
      }

      #followmeQrVerifiedStaticBanner20260529 .fm-static-shield{
        width:42px !important;
        height:42px !important;
        border-radius:16px !important;
        display:grid !important;
        place-items:center !important;
        flex:0 0 auto !important;
        background:
          radial-gradient(circle at 30% 20%, rgba(255,255,255,.85), transparent 38%),
          linear-gradient(145deg, rgba(22,163,74,.20), rgba(22,163,74,.08)) !important;
        box-shadow:
          0 10px 22px rgba(22,163,74,.13),
          inset 0 0 0 1px rgba(22,163,74,.16) !important;
        font-size:21px !important;
      }

      #followmeQrVerifiedStaticBanner20260529 .fm-static-copy{
        display:grid !important;
        gap:3px !important;
        min-width:0 !important;
      }

      #followmeQrVerifiedStaticBanner20260529 strong{
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Arial,sans-serif !important;
        font-size:15px !important;
        font-weight:800 !important;
        letter-spacing:-.25px !important;
        color:var(--fm-premium-green-dark) !important;
        line-height:1.12 !important;
      }

      #followmeQrVerifiedStaticBanner20260529 small{
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif !important;
        font-size:12.5px !important;
        font-weight:520 !important;
        line-height:1.32 !important;
        color:#526174 !important;
      }

      #followmeQrVerifiedStaticDetail20260529{
        max-width:430px !important;
        border-radius:18px !important;
        background:rgba(255,255,255,.94) !important;
        border:1px solid rgba(15,23,42,.08) !important;
        box-shadow:0 14px 34px rgba(15,23,42,.10) !important;
      }

      /*
        Area pulsanti pubblici:
        più aria, gerarchia chiara, stile premium.
      */
      body .premium-actions,
      body .actions,
      body .cta-row{
        width:100% !important;
        max-width:430px !important;
        margin:0 auto 14px !important;
        padding:0 !important;
        display:flex !important;
        flex-direction:column !important;
        align-items:stretch !important;
        gap:10px !important;
        box-sizing:border-box !important;
      }

      body .premium-btn,
      body button.premium-btn,
      body a.premium-btn{
        min-height:52px !important;
        width:100% !important;
        border-radius:19px !important;
        padding:14px 17px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:8px !important;
        border:1px solid rgba(15,23,42,.08) !important;
        box-shadow:
          0 14px 34px rgba(15,23,42,.10),
          inset 0 1px 0 rgba(255,255,255,.75) !important;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif !important;
        font-size:15px !important;
        font-weight:720 !important;
        letter-spacing:-.22px !important;
        line-height:1.15 !important;
        text-decoration:none !important;
        transform:none !important;
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          background .16s ease,
          border-color .16s ease !important;
        box-sizing:border-box !important;
        -webkit-tap-highlight-color:transparent !important;
      }

      body .premium-btn:active,
      body button.premium-btn:active,
      body a.premium-btn:active{
        transform:scale(.985) !important;
        box-shadow:
          0 8px 20px rgba(15,23,42,.10),
          inset 0 1px 0 rgba(255,255,255,.65) !important;
      }

      /*
        Pulsante ascolto messaggio: primario emozionale, ma elegante.
      */
      body #voiceBtn,
      body button#voiceBtn.premium-btn{
        background:
          linear-gradient(145deg, #111827, #1f2937) !important;
        color:#ffffff !important;
        border-color:rgba(255,255,255,.10) !important;
        box-shadow:
          0 18px 42px rgba(15,23,42,.22),
          inset 0 1px 0 rgba(255,255,255,.14) !important;
      }

      /*
        Chiedi informazioni: verde premium, azione principale.
      */
      body #infoBtn,
      body #fallbackInfo,
      body button#infoBtn.premium-btn,
      body button#fallbackInfo.premium-btn{
        background:
          linear-gradient(145deg, #18b957, #0f8f43) !important;
        color:#ffffff !important;
        border-color:rgba(255,255,255,.10) !important;
        box-shadow:
          0 18px 42px rgba(22,163,74,.22),
          inset 0 1px 0 rgba(255,255,255,.20) !important;
      }

      /*
        Apri in nuova pagina:
        sempre sotto, secondario, più piccolo, non confuso con le azioni FollowMe.
      */
      body a.premium-btn[target="_blank"],
      body a.premium-btn[href^="http"]{
        margin-top:7px !important;
        min-height:42px !important;
        padding:11px 14px !important;
        border-radius:15px !important;
        background:rgba(255,255,255,.62) !important;
        color:#64748b !important;
        border:1px solid rgba(15,23,42,.08) !important;
        box-shadow:none !important;
        font-size:13px !important;
        font-weight:620 !important;
        letter-spacing:-.12px !important;
      }

      body a.premium-btn[target="_blank"]:before,
      body a.premium-btn[href^="http"]:before{
        content:"↗";
        font-size:13px;
        opacity:.72;
      }

      /*
        Se il browser dispone i pulsanti in righe strane, forziamo ordine pulito.
      */
      body #voiceBtn{ order:1 !important; }
      body #infoBtn,
      body #fallbackInfo{ order:2 !important; }
      body a.premium-btn[target="_blank"],
      body a.premium-btn[href^="http"]{ order:9 !important; }

      /*
        Desktop/tablet: resta elegante ma non gigantesco.
      */
      @media(min-width:760px){
        body .premium-actions,
        body .actions,
        body .cta-row{
          gap:11px !important;
        }

        body .premium-btn,
        body button.premium-btn,
        body a.premium-btn{
          max-width:430px !important;
          margin-left:auto !important;
          margin-right:auto !important;
        }
      }

      /*
        iPhone: più aria e touch target comodi.
      */
      @media(max-width:640px){
        #followmeQrVerifiedStaticBanner20260529{
          margin:12px auto 13px !important;
          padding:12px 13px !important;
          border-radius:20px !important;
        }

        #followmeQrVerifiedStaticBanner20260529 .fm-static-shield{
          width:39px !important;
          height:39px !important;
          border-radius:15px !important;
          font-size:20px !important;
        }

        #followmeQrVerifiedStaticBanner20260529 strong{
          font-size:14.5px !important;
        }

        #followmeQrVerifiedStaticBanner20260529 small{
          font-size:11.8px !important;
          line-height:1.28 !important;
        }

        body .premium-actions,
        body .actions,
        body .cta-row{
          padding-left:0 !important;
          padding-right:0 !important;
          gap:10px !important;
        }

        body .premium-btn,
        body button.premium-btn,
        body a.premium-btn{
          min-height:52px !important;
          border-radius:18px !important;
          font-size:14.5px !important;
        }

        body a.premium-btn[target="_blank"],
        body a.premium-btn[href^="http"]{
          min-height:40px !important;
          font-size:12.8px !important;
          border-radius:14px !important;
          margin-top:8px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }



  // FOLLOWME_QR_VERIFIED_OUTSIDE_BUTTONS_FINAL_20260529
  function injectQrVerifiedOutsideButtonsFinal(){
    if(document.getElementById("followmeQrVerifiedOutsideButtonsCss20260529")) return;

    var style = document.createElement("style");
    style.id = "followmeQrVerifiedOutsideButtonsCss20260529";
    style.textContent = `
      /*
        Disattivo definitivamente il badge flottante che si sovrapponeva ai pulsanti.
      */
      #followmeQrVerifiedBadge20260529,
      #followmeQrVerifiedDetail20260529{
        display:none !important;
        opacity:0 !important;
        visibility:hidden !important;
        pointer-events:none !important;
      }

      /*
        Banner reale sopra i pulsanti.
        Non è fixed, non è absolute, non può sovrapporsi.
      */
      #followmeQrVerifiedRealBanner20260529{
        position:relative !important;
        z-index:2 !important;
        width:calc(100% - 40px) !important;
        max-width:430px !important;
        margin:14px auto 14px !important;
        padding:13px 15px !important;
        box-sizing:border-box !important;
        border-radius:22px !important;
        display:flex !important;
        align-items:center !important;
        gap:12px !important;
        background:
          linear-gradient(145deg, rgba(255,255,255,.97), rgba(248,250,252,.90)) !important;
        border:1px solid rgba(22,163,74,.20) !important;
        box-shadow:
          0 14px 34px rgba(15,23,42,.09),
          inset 0 1px 0 rgba(255,255,255,.92) !important;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif !important;
        color:#0f172a !important;
        text-align:left !important;
      }

      #followmeQrVerifiedRealBanner20260529 .fm-real-shield{
        width:40px !important;
        height:40px !important;
        min-width:40px !important;
        border-radius:16px !important;
        display:grid !important;
        place-items:center !important;
        background:
          radial-gradient(circle at 35% 20%, rgba(255,255,255,.95), transparent 38%),
          linear-gradient(145deg, rgba(22,163,74,.20), rgba(22,163,74,.08)) !important;
        box-shadow:
          0 9px 20px rgba(22,163,74,.14),
          inset 0 0 0 1px rgba(22,163,74,.16) !important;
        font-size:20px !important;
      }

      #followmeQrVerifiedRealBanner20260529 .fm-real-copy{
        display:grid !important;
        gap:3px !important;
        min-width:0 !important;
      }

      #followmeQrVerifiedRealBanner20260529 strong{
        display:block !important;
        font-size:15px !important;
        line-height:1.08 !important;
        font-weight:800 !important;
        letter-spacing:-.22px !important;
        color:#0f7a37 !important;
      }

      #followmeQrVerifiedRealBanner20260529 small{
        display:block !important;
        font-size:12.3px !important;
        line-height:1.28 !important;
        font-weight:520 !important;
        color:#526174 !important;
      }

      /*
        L'area pulsanti deve partire DOPO il banner.
      */
      body .premium-actions,
      body .actions,
      body .cta-row{
        position:relative !important;
        z-index:1 !important;
        margin-top:0 !important;
        padding-top:0 !important;
      }

      @media(max-width:640px){
        #followmeQrVerifiedRealBanner20260529{
          width:calc(100% - 40px) !important;
          margin:12px auto 13px !important;
          padding:12px 13px !important;
          border-radius:20px !important;
        }

        #followmeQrVerifiedRealBanner20260529 .fm-real-shield{
          width:38px !important;
          height:38px !important;
          min-width:38px !important;
          border-radius:15px !important;
          font-size:19px !important;
        }

        #followmeQrVerifiedRealBanner20260529 strong{
          font-size:14.5px !important;
        }

        #followmeQrVerifiedRealBanner20260529 small{
          font-size:11.7px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function insertQrVerifiedOutsideButtonsFinal(){
    if(document.getElementById("followmeQrVerifiedRealBanner20260529")) return;

    var banner = document.createElement("div");
    banner.id = "followmeQrVerifiedRealBanner20260529";
    banner.innerHTML =
      '<span class="fm-real-shield">🛡️</span>' +
      '<span class="fm-real-copy">' +
        '<strong>QR verificato</strong>' +
        '<small>La destinazione è stata controllata prima della pubblicazione.</small>' +
      '</span>';

    /*
      Cerchiamo il vero contenitore dei pulsanti.
      L'obiettivo è inserirlo PRIMA del primo pulsante azione, non sopra in fixed.
    */
    var firstButton =
      document.getElementById("voiceBtn") ||
      document.getElementById("infoBtn") ||
      document.getElementById("fallbackInfo");

    if(firstButton){
      var container =
        firstButton.closest(".premium-actions") ||
        firstButton.closest(".actions") ||
        firstButton.closest(".cta-row") ||
        firstButton.parentElement;

      if(container && container.parentNode){
        container.parentNode.insertBefore(banner, container);
        return;
      }
    }

    /*
      Fallback: se i pulsanti sono spenti/non presenti,
      il banner deve comunque vedersi.
      Lo inseriamo prima del contenuto principale utile.
    */
    var fallback =
      document.querySelector(".premium-card") ||
      document.querySelector("main") ||
      document.body;

    if(fallback === document.body){
      document.body.insertBefore(banner, document.body.firstChild);
    }else{
      fallback.insertBefore(banner, fallback.firstChild);
    }
  }

  function forceQrVerifiedOutsideButtonsFinal(){
    injectQrVerifiedOutsideButtonsFinal();
    injectVariant2CompactOfficial20260529();

    /*
      Rimuovo fisicamente il vecchio badge flottante se già creato.
    */
    var oldBadge = document.getElementById("followmeQrVerifiedBadge20260529");
    if(oldBadge) oldBadge.remove();

    var oldDetail = document.getElementById("followmeQrVerifiedDetail20260529");
    if(oldDetail) oldDetail.remove();

    insertQrVerifiedOutsideButtonsFinal();
  }



  // FOLLOWME_QR_VERIFIED_CHAT_DIRECT_FLOW_20260529
  function followMeInfoData20260529(){
    try { return window.FOLLOWME_INFO_DATA || {}; }
    catch(e){ return {}; }
  }

  function isChatDirectFlow20260529(){
    var data = followMeInfoData20260529();
    return data &&
      data.chat_mode_enabled === true &&
      typeof data.chat_url === "string" &&
      data.chat_url.length > 0;
  }

  function prepareChatDirectFlow20260529(){
    if(!isChatDirectFlow20260529()) return;

    if(document.getElementById("followmeChatDirectFlowCss20260529")) return;

    var style = document.createElement("style");
    style.id = "followmeChatDirectFlowCss20260529";
    style.textContent = `
      body.followme-chat-direct-flow-20260529 .premium-actions,
      body.followme-chat-direct-flow-20260529 .actions,
      body.followme-chat-direct-flow-20260529 .cta-row,
      body.followme-chat-direct-flow-20260529 iframe,
      body.followme-chat-direct-flow-20260529 .preview,
      body.followme-chat-direct-flow-20260529 .premium-frame{
        display:none !important;
      }

      #followmeChatDirectNotice20260529{
        width:calc(100% - 40px);
        max-width:430px;
        margin:12px auto 18px;
        padding:16px 15px;
        border-radius:22px;
        background:rgba(255,255,255,.92);
        border:1px solid rgba(15,23,42,.08);
        box-shadow:0 14px 34px rgba(15,23,42,.09);
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif;
        text-align:center;
        color:#0f172a;
      }

      #followmeChatDirectNotice20260529 strong{
        display:block;
        font-size:16px;
        font-weight:850;
        letter-spacing:-.25px;
        margin-bottom:5px;
      }

      #followmeChatDirectNotice20260529 span{
        display:block;
        font-size:13px;
        font-weight:560;
        color:#64748b;
        line-height:1.35;
      }

      #followmeChatDirectNotice20260529 a{
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:46px;
        margin-top:14px;
        border-radius:17px;
        background:linear-gradient(145deg,#18b957,#0f8f43);
        color:#fff;
        text-decoration:none;
        font-size:14px;
        font-weight:780;
        box-shadow:0 15px 34px rgba(22,163,74,.20);
      }
    `;

    document.head.appendChild(style);
    document.body.classList.add("followme-chat-direct-flow-20260529");
  }

  function showChatDirectNotice20260529(){
    if(!isChatDirectFlow20260529()) return;

    var data = followMeInfoData20260529();
    var url = data.chat_url;

    if(document.getElementById("followmeChatDirectNotice20260529")) return;

    var banner =
      document.getElementById("followmeQrVerifiedRealBanner20260529") ||
      document.getElementById("followmeQrVerifiedStaticBanner20260529");

    var box = document.createElement("div");
    box.id = "followmeChatDirectNotice20260529";
    box.innerHTML =
      "<strong>Apro la chat sicura...</strong>" +
      "<span>Puoi scrivere direttamente al proprietario del QR.</span>" +
      '<a href="' + url.replace(/"/g, "&quot;") + '">Apri chat</a>';

    if(banner && banner.parentNode){
      banner.parentNode.insertBefore(box, banner.nextSibling);
    }else{
      document.body.insertBefore(box, document.body.firstChild);
    }

    setTimeout(function(){
      try { window.location.href = url; } catch(e) {}
    }, 1900);
  }



  // FOLLOWME_FIX_PUBLIC_FRAME_NOT_BLANK_20260529
  function fixPublicFrameNotBlank20260529(){
    if(document.getElementById("followmeFixPublicFrameNotBlankCss20260529")) return;

    var style = document.createElement("style");
    style.id = "followmeFixPublicFrameNotBlankCss20260529";
    style.textContent = `
      /*
        FIX URGENTE:
        La pagina pubblica URL/documento/immagine non deve mai diventare bianca.
        Il contenuto sotto i pulsanti deve restare visibile.
      */
      body:not(.followme-real-chat-mode-20260529) iframe,
      body:not(.followme-real-chat-mode-20260529) .preview,
      body:not(.followme-real-chat-mode-20260529) .premium-frame,
      body:not(.followme-real-chat-mode-20260529) .frame,
      body:not(.followme-real-chat-mode-20260529) .web-frame,
      body:not(.followme-real-chat-mode-20260529) .content-frame{
        display:block !important;
        visibility:visible !important;
        opacity:1 !important;
      }

      body:not(.followme-real-chat-mode-20260529) iframe{
        width:100% !important;
        min-height:58vh !important;
        background:#fff !important;
      }

      /*
        Disattivo gli effetti della precedente classe chat-direct
        quando non siamo in vera modalità chat.
      */
      body.followme-chat-direct-flow-20260529:not(.followme-real-chat-mode-20260529) .premium-actions,
      body.followme-chat-direct-flow-20260529:not(.followme-real-chat-mode-20260529) .actions,
      body.followme-chat-direct-flow-20260529:not(.followme-real-chat-mode-20260529) .cta-row,
      body.followme-chat-direct-flow-20260529:not(.followme-real-chat-mode-20260529) iframe,
      body.followme-chat-direct-flow-20260529:not(.followme-real-chat-mode-20260529) .preview,
      body.followme-chat-direct-flow-20260529:not(.followme-real-chat-mode-20260529) .premium-frame{
        display:block !important;
        visibility:visible !important;
        opacity:1 !important;
      }

      /*
        Se il contenuto esterno blocca iframe, almeno il fallback "Apri in nuova pagina"
        deve restare visibile in basso.
      */
      body a.premium-btn[target="_blank"],
      body a.premium-btn[href^="http"]{
        display:flex !important;
        visibility:visible !important;
        opacity:1 !important;
      }
    `;

    document.head.appendChild(style);

    /*
      Se la classe chat-direct è stata applicata per errore, la rimuoviamo
      quando FOLLOWME_INFO_DATA non dichiara davvero chat attiva.
    */
    try{
      var data = window.FOLLOWME_INFO_DATA || {};
      var realChat = data.chat_mode_enabled === true && typeof data.chat_url === "string" && data.chat_url.length > 0;

      if(realChat){
        document.body.classList.add("followme-real-chat-mode-20260529");
      }else{
        document.body.classList.remove("followme-chat-direct-flow-20260529");
        document.body.classList.remove("followme-real-chat-mode-20260529");
      }
    }catch(e){
      document.body.classList.remove("followme-chat-direct-flow-20260529");
      document.body.classList.remove("followme-real-chat-mode-20260529");
    }
  }



  // FOLLOWME_VARIANT2_COMPACT_OFFICIAL_20260529
  function injectVariant2CompactOfficial20260529(){
    if(document.getElementById("followmeVariant2CompactOfficialCss20260529")) return;

    var style = document.createElement("style");
    style.id = "followmeVariant2CompactOfficialCss20260529";
    style.textContent = `
      /*
        Variante 2 ufficiale:
        badge minimo, niente sottotesto, pulsanti compatti.
      */

      #followmeQrVerifiedBadge20260529,
      #followmeQrVerifiedDetail20260529,
      #followmeQrVerifiedStaticBanner20260529,
      #followmeQrVerifiedStaticDetail20260529{
        display:none !important;
        opacity:0 !important;
        visibility:hidden !important;
        pointer-events:none !important;
      }

      #followmeQrVerifiedRealBanner20260529{
        position:relative !important;
        z-index:2 !important;
        width:max-content !important;
        max-width:calc(100% - 40px) !important;
        margin:8px auto 9px !important;
        padding:6px 10px !important;
        border-radius:999px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:6px !important;
        background:rgba(18,137,67,.085) !important;
        color:#128943 !important;
        border:1px solid rgba(18,137,67,.13) !important;
        box-shadow:none !important;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif !important;
        font-size:12.5px !important;
        line-height:1 !important;
        font-weight:700 !important;
        letter-spacing:-.1px !important;
        text-align:center !important;
        box-sizing:border-box !important;
      }

      #followmeQrVerifiedRealBanner20260529 .fm-real-shield{
        width:auto !important;
        height:auto !important;
        min-width:0 !important;
        border-radius:0 !important;
        display:inline !important;
        background:transparent !important;
        box-shadow:none !important;
        font-size:13px !important;
        line-height:1 !important;
      }

      #followmeQrVerifiedRealBanner20260529 .fm-real-copy{
        display:inline !important;
      }

      #followmeQrVerifiedRealBanner20260529 strong{
        display:inline !important;
        font-size:12.5px !important;
        line-height:1 !important;
        font-weight:700 !important;
        letter-spacing:-.1px !important;
        color:#128943 !important;
      }

      /*
        Rimuovo completamente la frase sotto il badge.
      */
      #followmeQrVerifiedRealBanner20260529 small{
        display:none !important;
      }

      /*
        Area azioni compatta.
      */
      body .premium-actions,
      body .actions,
      body .cta-row{
        width:calc(100% - 20px) !important;
        max-width:410px !important;
        margin:0 auto 10px !important;
        padding:0 !important;
        display:grid !important;
        grid-template-columns:1fr !important;
        gap:7px !important;
        box-sizing:border-box !important;
        align-items:stretch !important;
      }

      /*
        Se entrambi i pulsanti sono presenti li affianchiamo.
        La classe viene applicata via JS sotto.
      */
      body .premium-actions.fm-two-actions-20260529,
      body .actions.fm-two-actions-20260529,
      body .cta-row.fm-two-actions-20260529{
        grid-template-columns:1fr 1fr !important;
      }

      body .premium-btn,
      body button.premium-btn,
      body a.premium-btn{
        min-height:38px !important;
        height:auto !important;
        width:100% !important;
        border-radius:13px !important;
        padding:8px 10px !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:6px !important;
        border:1px solid rgba(16,24,40,.08) !important;
        background:#fff !important;
        color:#101828 !important;
        box-shadow:0 4px 10px rgba(16,24,40,.035) !important;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif !important;
        font-size:12.8px !important;
        font-weight:630 !important;
        letter-spacing:-.1px !important;
        line-height:1.1 !important;
        text-decoration:none !important;
        white-space:nowrap !important;
        box-sizing:border-box !important;
        -webkit-tap-highlight-color:transparent !important;
      }

      body .premium-btn:active,
      body button.premium-btn:active,
      body a.premium-btn:active{
        transform:scale(.985) !important;
      }

      /*
        Ascolta messaggio: elegante scuro, non gigante.
      */
      body #voiceBtn,
      body button#voiceBtn.premium-btn{
        background:#141923 !important;
        color:#fff !important;
        border-color:#141923 !important;
        box-shadow:0 7px 16px rgba(16,24,40,.10) !important;
      }

      /*
        Chiedi informazioni: verde compatto.
      */
      body #infoBtn,
      body #fallbackInfo,
      body button#infoBtn.premium-btn,
      body button#fallbackInfo.premium-btn{
        background:#128943 !important;
        color:#fff !important;
        border-color:#128943 !important;
        box-shadow:0 7px 16px rgba(18,137,67,.11) !important;
      }

      /*
        Apri in nuova pagina: secondario, sotto, non protagonista.
      */
      body a.premium-btn[target="_blank"],
      body a.premium-btn[href^="http"]{
        margin:10px auto 0 !important;
        min-height:34px !important;
        max-width:410px !important;
        border-radius:12px !important;
        padding:8px 10px !important;
        background:#fff !important;
        color:#667085 !important;
        border:1px solid rgba(16,24,40,.08) !important;
        box-shadow:none !important;
        font-size:12px !important;
        font-weight:520 !important;
        letter-spacing:-.05px !important;
      }

      body a.premium-btn[target="_blank"]:before,
      body a.premium-btn[href^="http"]:before{
        content:"↗";
        font-size:12px;
        opacity:.72;
      }

      /*
        Il frame deve restare protagonista.
      */
      body iframe,
      body .preview,
      body .premium-frame,
      body .frame,
      body .web-frame,
      body .content-frame{
        margin-top:10px !important;
      }

      body iframe{
        min-height:62vh !important;
      }

      @media(max-width:370px){
        body .premium-actions.fm-two-actions-20260529,
        body .actions.fm-two-actions-20260529,
        body .cta-row.fm-two-actions-20260529{
          grid-template-columns:1fr !important;
        }

        body .premium-btn,
        body button.premium-btn,
        body a.premium-btn{
          font-size:12.2px !important;
          padding:8px 8px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function applyVariant2CompactActionLayout20260529(){
    var containers = Array.prototype.slice.call(document.querySelectorAll(".premium-actions,.actions,.cta-row"));

    containers.forEach(function(container){
      var voice = container.querySelector("#voiceBtn");
      var info = container.querySelector("#infoBtn,#fallbackInfo");

      var visibleButtons = Array.prototype.slice.call(container.querySelectorAll("button.premium-btn, a.premium-btn, .premium-btn"))
        .filter(function(el){
          if(!el) return false;
          var st = window.getComputedStyle(el);
          if(st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;

          /*
            Escludo il link Apri in nuova pagina dalla griglia principale.
          */
          if(el.tagName && el.tagName.toLowerCase() === "a") return false;

          return true;
        });

      if(visibleButtons.length >= 2 && voice && info){
        container.classList.add("fm-two-actions-20260529");
      }else{
        container.classList.remove("fm-two-actions-20260529");
      }
    });

    /*
      Garantisco che il banner sia solo badge compatto, anche se creato da vecchie funzioni.
    */
    var banner = document.getElementById("followmeQrVerifiedRealBanner20260529");
    if(banner){
      banner.innerHTML =
        '<span class="fm-real-shield">🛡️</span>' +
        '<span class="fm-real-copy">' +
          '<strong>QR verificato</strong>' +
        '</span>';
    }
  }

  function forceVariant2CompactOfficial20260529(){
    injectVariant2CompactOfficial20260529();
    applyVariant2CompactActionLayout20260529();
  }

  function boot(){
    injectStyle();
    injectPremiumPublicActionsUx();
    injectQrVerifiedOutsideButtonsFinal();
    prepareChatDirectFlow20260529();
    fixPublicFrameNotBlank20260529();
    makeOverlay();

    setTimeout(fixPublicFrameNotBlank20260529, 250);
    setTimeout(function(){ forceQrVerifiedOutsideButtonsFinal(); forceVariant2CompactOfficial20260529(); }, 400);
    setTimeout(fixPublicFrameNotBlank20260529, 900);
    setTimeout(function(){ forceQrVerifiedOutsideButtonsFinal(); forceVariant2CompactOfficial20260529(); }, 1200);
    setTimeout(function(){
      forceQrVerifiedOutsideButtonsFinal();
      forceVariant2CompactOfficial20260529();
      showChatDirectNotice20260529();
      forceVariant2CompactOfficial20260529();
    }, 2400);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  }else{
    boot();
  }
})();
