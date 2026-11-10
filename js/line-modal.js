(function () {
    var LINE_QR = "images/line-qr.png";

    var style = document.createElement("style");
    style.textContent =
        ".line-open-btn{display:inline-flex;align-items:center;flex-wrap:nowrap;white-space:nowrap;gap:5px;margin:0;padding:0;border:0;background:none;font:inherit;font-weight:700;font-size:calc(1em + 4px);color:#06C755;cursor:pointer;vertical-align:middle;}" +
        ".line-open-btn:hover{color:#05b34c;}" +
        ".line-open-btn .line-logo{display:block;flex-shrink:0;width:22px;height:22px;}" +
        ".line-open-btn-inline{font-size:inherit;font-weight:inherit;gap:4px;}" +
        ".line-open-btn-inline .line-logo{width:1.15em;height:1.15em;}" +
        ".uber-eats-link{position:relative;display:inline-flex;align-items:center;flex-wrap:nowrap;white-space:nowrap;gap:0;margin:0;padding:0;font:inherit;font-weight:700;color:#292524;text-decoration:none;vertical-align:middle;}" +
        ".uber-eats-link:hover{color:#06C167;}" +
        ".uber-eats-link .uber-eats-logo{display:block;flex-shrink:0;width:76px;height:22px;}" +
        ".foodpanda-link{position:relative;display:inline-flex;align-items:center;flex-wrap:nowrap;white-space:nowrap;gap:0;margin:0;padding:0;font:inherit;font-weight:700;color:#D70F64;text-decoration:none;vertical-align:middle;}" +
        ".foodpanda-link:hover{color:#b00c50;}" +
        ".foodpanda-link .foodpanda-logo{display:block;flex-shrink:0;width:114px;height:22px;object-fit:contain;}" +
        ".delivery-pair{display:inline-flex;align-items:center;vertical-align:middle;white-space:nowrap;}" +
        ".delivery-area-note{position:absolute;left:calc(100% - 28px);bottom:calc(100% + 12px);display:inline-flex;align-items:center;padding:3px 9px 4px;border:1.5px solid #a8a29e;border-radius:12px;background:#fff;color:#44403c;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:700;line-height:1.3;white-space:nowrap;box-shadow:0 6px 12px rgba(68,64,60,.16);z-index:2;pointer-events:none;}" +
        ".delivery-area-note::before{content:\"\";position:absolute;left:6px;top:100%;border-width:6px 6px 0;border-style:solid;border-color:#a8a29e transparent transparent;}" +
        ".delivery-area-note::after{content:\"\";position:absolute;left:7px;top:calc(100% - 1px);border-width:5px 5px 0;border-style:solid;border-color:#fff transparent transparent;}" +
        ".scooter{display:inline-block;margin-right:2px;animation:scooter-bob .42s linear infinite;}" +
        "@keyframes scooter-bob{0%,22%,44%,66%,100%{transform:translateY(0)}11%{transform:translateY(-1.5px)}33%{transform:translateY(-1.5px)}55%{transform:translateY(-1px)}}" +
        "@media (prefers-reduced-motion:reduce){.scooter{animation:none;}}" +
        ".line-modal[hidden]{display:none !important;}" +
        ".line-modal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:1.25rem;}" +
        ".line-modal-backdrop{position:absolute;inset:0;background:rgba(28,25,23,.55);}" +
        ".line-modal-card{position:relative;width:min(92vw,20.5rem);background:#fff;border-radius:1.25rem;padding:1.35rem 1.2rem 1.25rem;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.18);}" +
        ".line-modal-close{position:absolute;top:.45rem;right:.55rem;width:2rem;height:2rem;border:0;background:none;font-size:1.4rem;line-height:1;color:#78716c;cursor:pointer;}" +
        ".line-modal-title{margin:0 0 .35rem;font-size:1.05rem;font-weight:700;color:#44403c;}" +
        ".line-modal-id{margin:0 0 .85rem;font-size:.85rem;color:#78716c;}" +
        ".line-modal-qr{width:12.5rem;height:12.5rem;margin:0 auto .85rem;border:1px solid #e7e5e4;border-radius:.75rem;background:#fff;object-fit:contain;}" +
        ".line-modal-hint{margin:0 0 1rem;font-size:.8rem;line-height:1.55;color:#78716c;}" +
        ".line-modal-open{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;min-height:2.6rem;padding:.55rem 1rem;border-radius:.8rem;background:#06C755;color:#fff;font-weight:700;font-size:.9rem;text-decoration:none;}" +
        ".line-modal-open:hover{background:#05b34c;}";
    document.head.appendChild(style);

    function currentLine() {
        var fallbackUrl = "https://line.me/R/ti/p/@534euhut";
        var fallbackId = "@534euhut";
        var links = window.shopSettings && window.shopSettings.footerLinks;
        var row = null;
        if (links && links.length) {
            for (var i = 0; i < links.length; i++) {
                if (links[i] && links[i].id === "line" && links[i].url) row = links[i];
            }
        }
        var url = row ? String(row.url) : fallbackUrl;
        var id = fallbackId;
        var matched = url.match(/@([A-Za-z0-9._-]+)/);
        if (matched) id = "@" + matched[1];
        return { url: url, id: id };
    }

    function ensureModal() {
        if (document.getElementById("line-modal")) return;
        var wrap = document.createElement("div");
        wrap.id = "line-modal";
        wrap.className = "line-modal";
        wrap.hidden = true;
        wrap.setAttribute("role", "dialog");
        wrap.setAttribute("aria-modal", "true");
        wrap.setAttribute("aria-labelledby", "line-modal-title");
        var line = currentLine();
        var qrSrc = line.id === "@534euhut" ? LINE_QR : ("https://qr-official.line.me/sid/L/" + line.id.replace(/^@/, "") + ".png");
        var qrFallback = "https://qr-official.line.me/sid/L/" + line.id.replace(/^@/, "") + ".png";
        wrap.innerHTML =
            '<div class="line-modal-backdrop" data-line-close="1"></div>' +
            '<div class="line-modal-card">' +
            '<button type="button" class="line-modal-close" data-line-close="1" aria-label="關閉">×</button>' +
            '<h3 id="line-modal-title" class="line-modal-title">加入官方LINE</h3>' +
            '<p class="line-modal-id">' + line.id + '</p>' +
            '<img class="line-modal-qr" src="' + qrSrc + '" alt="官方 LINE 加入好友條碼" width="200" height="200">' +
            '<p class="line-modal-hint">請用 LINE 掃描條碼加入好友。<br>手機可改按下方按鈕直接開啟。</p>' +
            '<a class="line-modal-open" href="' + line.url + '" target="_blank" rel="noopener">用 LINE 開啟</a>' +
            "</div>";
        document.body.appendChild(wrap);
        var img = wrap.querySelector(".line-modal-qr");
        img.addEventListener("error", function () {
            if (img.getAttribute("src") !== qrFallback) img.src = qrFallback;
        });
        wrap.addEventListener("click", function (e) {
            if (e.target && e.target.getAttribute("data-line-close")) closeModal();
        });
    }

    function openModal() {
        ensureModal();
        var modal = document.getElementById("line-modal");
        modal.hidden = false;
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        var modal = document.getElementById("line-modal");
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = "";
    }

    document.addEventListener("click", function (e) {
        var bare = e.target.closest ? e.target.closest(".foodpanda-link, .uber-eats-link") : null;
        if (bare && !bare.getAttribute("href")) e.preventDefault();
        var btn = e.target.closest ? e.target.closest("[data-line-open]") : null;
        if (!btn) return;
        e.preventDefault();
        openModal();
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeModal();
    });

    function syncDeliveryNote() {
        var links = window.shopSettings && window.shopSettings.footerLinks;
        if (!links || !links.length) return;
        var uberOn = false;
        var pandaOn = false;
        var seen = false;
        for (var i = 0; i < links.length; i++) {
            var row = links[i];
            if (!row) continue;
            if (row.id === "uber") { seen = true; uberOn = row.enabled !== false; }
            if (row.id === "foodpanda") { seen = true; pandaOn = row.enabled !== false; }
        }
        if (!seen || uberOn || pandaOn) return;
        var notes = document.querySelectorAll(".delivery-area-note");
        for (var n = 0; n < notes.length; n++) {
            if (notes[n].parentNode) notes[n].parentNode.removeChild(notes[n]);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncDeliveryNote);
    else syncDeliveryNote();
})();
