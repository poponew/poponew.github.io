window.shopSettings = {
    "shippingFee": 80,
    "freeShipping": 1500,
    "minOrder": 500,
    "codLimit": 2000,
    "bulkOrder": 5000,
    "discountFold": 10,
    "discountStart": "",
    "discountEnd": "",
    "ordersPaused": true,
    "ordersPausedNote": "臨時有事，先暫停接單。已下單不受影響。恢復下單時會在官方 LINE 推播，造成不便還請見諒~"
};
(function () {
    function shopTaiwanToday() {
        return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    }
    function shopDiscountFold() {
        var n = parseFloat((window.shopSettings || {}).discountFold);
        return (isFinite(n) && n > 0 && n < 10) ? n : 10;
    }
    window.shopDiscountActive = function () {
        if (shopDiscountFold() >= 10) return false;
        var s = window.shopSettings || {};
        var t = shopTaiwanToday();
        if (s.discountStart && t < s.discountStart) return false;
        if (s.discountEnd && t > s.discountEnd) return false;
        return true;
    };
    window.shopSalePrice = function (original) {
        var n = parseInt(original, 10) || 0;
        if (!window.shopDiscountActive()) return n;
        return Math.round(n * shopDiscountFold() / 10);
    };
    var SHOP_PAUSE_NOTE = "手工甜點趕製中，先暫停新訂單，免得讓大家等太久。已經下單的不用擔心，會照常做、照常寄。恢復時會在官方 LINE 跟大家說。";
    window.shopOrdersPaused = function () {
        return !!(window.shopSettings || {}).ordersPaused;
    };
    window.shopOrdersPausedNote = function () {
        var n = String((window.shopSettings || {}).ordersPausedNote || "").trim();
        return n || SHOP_PAUSE_NOTE;
    };
    function shopPageName() {
        var path = String(location.pathname || "").split("/").pop() || "";
        return path.toLowerCase() || "index.html";
    }
    function shopPauseModalPage() {
        var p = shopPageName();
        if (p === "" || p === "index.html") return true;
        var skip = { "cart.html": 1, "faq.html": 1, "ask.html": 1, "keep.html": 1, "paid.html": 1, "order-search.html": 1 };
        if (skip[p]) return false;
        if (p.indexOf("google") === 0) return false;
        return /\.html$/i.test(p);
    }
    function shopShowPauseModal(force) {
        if (!window.shopOrdersPaused() || !shopPauseModalPage()) return;
        if (!force) {
            try {
                if (sessionStorage.getItem("poponew_pause_modal_seen")) return;
                sessionStorage.setItem("poponew_pause_modal_seen", "1");
            } catch (err) {}
        }
        if (document.getElementById("shop-pause-modal")) return;
        var wrap = document.createElement("div");
        wrap.id = "shop-pause-modal";
        wrap.setAttribute("role", "dialog");
        wrap.setAttribute("aria-modal", "true");
        wrap.style.cssText = "position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:1.25rem;overflow:hidden;";
        var card = document.createElement("div");
        card.style.cssText = "position:relative;width:min(92vw,22rem);background:rgba(255,255,255,.42);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.55);border-radius:1.25rem;padding:1.4rem 1.2rem 1.25rem;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.22),0 18px 50px rgba(0,0,0,.28)";
        var title = document.createElement("p");
        title.style.cssText = "margin:0 0 .75rem;font-size:1.05rem;font-weight:700;color:#44403c";
        title.textContent = "(›´ω`‹ )暫停接單";
        var note = document.createElement("p");
        note.style.cssText = "margin:0 0 1rem;font-size:.9rem;line-height:1.7;color:#57534e;text-align:left;white-space:pre-wrap";
        note.textContent = window.shopOrdersPausedNote();
        var lineWrap = document.createElement("p");
        lineWrap.style.cssText = "margin:0 0 1rem";
        var lineBtn = document.createElement("button");
        lineBtn.type = "button";
        lineBtn.className = "line-open-btn";
        lineBtn.setAttribute("data-line-open", "");
        lineBtn.innerHTML = '<svg class="line-logo" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#06C755"/><path fill="#fff" d="M12.03 5.55c-3.68 0-6.66 2.38-6.66 5.32 0 2.62 2.32 4.82 5.46 5.23.21.04.47.13.54.3.06.15.04.38.02.53l-.09.53c-.03.18-.13.65.58.35 1.16-.49 3.14-1.84 4.3-3.15C17.4 13.02 18 11.66 18 10.87c0-2.94-2.98-5.32-5.97-5.32z"/></svg><span>官方LINE</span>';
        lineWrap.appendChild(lineBtn);
        var ok = document.createElement("button");
        ok.type = "button";
        ok.setAttribute("data-shop-pause-close", "1");
        ok.style.cssText = "display:block;width:100%;min-height:2.6rem;border:0;border-radius:.8rem;background:#b45309;color:#fff;font-weight:700;cursor:pointer";
        ok.textContent = "我知道了";
        card.appendChild(title);
        card.appendChild(note);
        card.appendChild(lineWrap);
        card.appendChild(ok);
        wrap.appendChild(card);
        document.body.appendChild(wrap);
        document.body.style.overflow = "hidden";
        function closePause() {
            wrap.remove();
            document.body.style.overflow = "";
        }
        wrap.addEventListener("click", function (e) {
            if (e.target && e.target.closest && e.target.closest("[data-line-open]")) {
                closePause();
                return;
            }
            if (e.target === wrap || (e.target && e.target.getAttribute("data-shop-pause-close"))) closePause();
        });
    }
    function shopPauseCss() {
        if (document.getElementById("shop-pause-style")) return;
        var st = document.createElement("style");
        st.id = "shop-pause-style";
        st.textContent = ".shop-checkout-paused{background:#d6d3d1!important;color:#fff!important;cursor:not-allowed!important;box-shadow:none!important;}";
        document.head.appendChild(st);
    }
    window.shopLockCheckoutButtons = function () {
        if (!window.shopOrdersPaused()) return;
        shopPauseCss();
        document.querySelectorAll("button").forEach(function (btn) {
            var oc = btn.getAttribute("onclick") || "";
            if (oc.indexOf("saveToCartAndGo") !== -1 || String(btn.textContent || "").indexOf("前往結帳") !== -1) {
                btn.classList.add("shop-checkout-paused");
                btn.setAttribute("aria-disabled", "true");
            }
        });
        var submit = document.getElementById("submit-btn");
        if (!submit) return;
        submit.disabled = true;
        submit.classList.add("shop-checkout-paused", "bg-stone-300", "cursor-not-allowed");
        var tip = document.getElementById("orders-paused-tip");
        if (!tip) {
            tip = document.createElement("p");
            tip.id = "orders-paused-tip";
            tip.className = "text-sm leading-relaxed mt-4 mb-0 px-3 py-2 rounded-xl";
            tip.style.cssText = "background:#fef3c7;border:1px solid #fde68a;color:#78350f;";
            submit.parentNode.insertBefore(tip, submit);
        }
        tip.hidden = false;
        tip.textContent = window.shopOrdersPausedNote();
    };
    function wrapCheckoutPause() {
        var go = window.saveToCartAndGo;
        if (typeof go === "function" && !go._shopPauseWrapped) {
            window.saveToCartAndGo = function () {
                if (window.shopOrdersPaused()) {
                    shopShowPauseModal(true);
                    return;
                }
                return go.apply(this, arguments);
            };
            window.saveToCartAndGo._shopPauseWrapped = true;
        }
        var send = window.submitOrder;
        if (typeof send === "function" && !send._shopPauseWrapped) {
            window.submitOrder = function (event) {
                if (window.shopOrdersPaused()) {
                    if (event && event.preventDefault) event.preventDefault();
                    alert(window.shopOrdersPausedNote());
                    return;
                }
                return send.apply(this, arguments);
            };
            window.submitOrder._shopPauseWrapped = true;
        }
    };
    window.shopWebpPath = function (src) {
        return String(src || "").replace(/\.jpe?g(\?.*)?$/i, ".webp$1");
    };
    window.shopPictureHtml = function (src, attrs) {
        var jpg = String(src || "");
        return '<picture><source srcset="' + window.shopWebpPath(jpg) + '" type="image/webp"><img src="' + jpg + '"' + (attrs ? (" " + attrs) : "") + "></picture>";
    };
    window.shopSetPictureSrc = function (img, src) {
        if (!img) return;
        img._shopWebpFail = false;
        img.src = src;
        var pic = img.parentNode;
        if (pic && pic.tagName === "PICTURE") {
            var source = pic.querySelector('source[type="image/webp"]');
            if (source) source.srcset = window.shopWebpPath(src);
        }
    };
    function shopFallbackJpg(img) {
        if (!img || img._shopWebpFail) return;
        var jpg = img.getAttribute("src") || "";
        if (/\.webp(\?|$)/i.test(jpg)) jpg = jpg.replace(/\.webp(\?.*)?$/i, ".jpg$1");
        if (!/\.jpe?g(\?|$)/i.test(jpg)) return;
        var pic = img.parentNode;
        if (pic && pic.tagName === "PICTURE") {
            var sources = pic.querySelectorAll("source");
            for (var i = 0; i < sources.length; i++) sources[i].remove();
        }
        img._shopWebpFail = true;
        img.src = "";
        img.src = jpg;
    }
    document.addEventListener("error", function (e) {
        var t = e.target;
        if (t && t.tagName === "IMG") shopFallbackJpg(t);
    }, true);
    function shopNtMark(s) {
        return String(s).replace(/NT\$/g, '<span class="shop-nt">NT$</span>');
    }
    window.shopPriceHtml = function (original, opt) {
        opt = opt || {};
        var o = parseInt(original, 10) || 0;
        var n = window.shopSalePrice(o);
        var from = opt.from ? ' <span class="text-xs font-medium">起</span>' : (opt.suffix || "");
        if (n === o) return shopNtMark("NT$ ") + o + from;
        return '<s class="shop-old-price text-sm font-normal" style="text-decoration:line-through;color:#a8a29e;font-weight:400;font-size:0.875rem">' + shopNtMark("NT$ ") + o + "</s> <span class=\"shop-sale-price\">" + shopNtMark("NT$ ") + n + "</span>" + from;
    };
    function bindIndexCardPrices() {
        if (!window.shopSearch || !window.shopSearch.length) return;
        var mins = {};
        var counts = {};
        window.shopSearch.forEach(function (p) {
            var key = String(p.group || "");
            if (!key) return;
            counts[key] = (counts[key] || 0) + 1;
            var price = parseInt(p.price, 10) || 0;
            if (mins[key] == null || price < mins[key]) mins[key] = price;
        });
        document.querySelectorAll("a.product-card").forEach(function (card) {
            var h2 = card.querySelector("h2");
            if (!h2) return;
            var name = String(h2.textContent || "").replace(/^【新品】/, "").trim();
            if (mins[name] == null) return;
            var box = card.querySelector(".text-amber-700");
            if (!box) return;
            box.setAttribute("data-shop-price", String(mins[name]));
            if (counts[name] > 1) box.setAttribute("data-shop-price-from", "1");
        });
    }
    function bindProductRowPrices() {
        (window.products || []).forEach(function (p) {
            var left = document.getElementById("product-info-left-" + p.id);
            if (!left) return;
            var priceEl = left.querySelector("p.text-amber-700") || left.querySelector("p:last-of-type");
            if (!priceEl) return;
            priceEl.setAttribute("data-shop-price", String(parseInt(p.price, 10) || 0));
        });
    }
    function shopDiscountLeadPrefix() {
        if (!window.shopDiscountActive()) return "";
        var fold = String(shopDiscountFold()).replace(/\.0$/, "");
        var s = window.shopSettings || {};
        var when = (s.discountStart || s.discountEnd) ? ("（" + (s.discountStart || "即日起") + "～" + (s.discountEnd || "另行公告") + "）") : "";
        return "全店 " + fold + " 折優惠中" + when + "！";
    }
    function applyHomeLeadDiscount() {
        var lead = document.getElementById("shop-home-lead") || document.querySelector(".max-w-5xl p.text-center");
        if (!lead) return;
        if (!lead.getAttribute("data-shop-lead")) {
            var raw = String(lead.textContent || "").replace(/^📢\s*/, "").replace(/^全店\s+[\d.]+\s+折優惠中(?:（[^）]*）)?！/, "").trim();
            lead.setAttribute("data-shop-lead", raw);
        }
        var prefix = shopDiscountLeadPrefix();
        var base = lead.getAttribute("data-shop-lead") || "";
        if (prefix) {
            lead.innerHTML = "📢 <span class=\"shop-sale-lead\" style=\"background:#fef3c7;color:#78350f;font-weight:600;padding:0.12em 0.45em;border-radius:0.4rem\">" + prefix + "</span>" + base;
        } else {
            lead.textContent = "📢 " + base;
        }
        var old = document.getElementById("shop-sale-banner");
        if (old) {
            old.hidden = true;
            old.textContent = "";
        }
    }
    function wrapLegacyCartTotals() {
        function wrap(name) {
            var fn = window[name];
            if (typeof fn !== "function" || fn._shopWrapped) return;
            if (Function.prototype.toString.call(fn).indexOf("shopSalePrice") !== -1) return;
            window[name] = function () {
                var lookup = window.allProductsLookup;
                if (lookup && window.shopDiscountActive()) {
                    var sale = {};
                    for (var k in lookup) {
                        if (Object.prototype.hasOwnProperty.call(lookup, k)) sale[k] = window.shopSalePrice(lookup[k]);
                    }
                    window.allProductsLookup = sale;
                    try { return fn.apply(this, arguments); }
                    finally { window.allProductsLookup = lookup; }
                }
                return fn.apply(this, arguments);
            };
            window[name]._shopWrapped = true;
        }
        wrap("calculatePageTotal");
        wrap("saveToCartAndGo");
        if (typeof window.calculatePageTotal === "function") window.calculatePageTotal();
    }
    function watchLightboxPrice() {
        var el = document.getElementById("lb-price");
        if (!el || el._shopWatch) return;
        el._shopWatch = true;
        var applying = false;
        function apply() {
            if (applying || !window.shopDiscountActive()) return;
            if (el.querySelector(".shop-sale-price")) return;
            var m = String(el.textContent || "").match(/NT\$\s*(\d+)/);
            if (!m) return;
            applying = true;
            el.innerHTML = window.shopPriceHtml(m[1]);
            applying = false;
        }
        apply();
        if (window.MutationObserver) new MutationObserver(apply).observe(el, { childList: true, characterData: true, subtree: true });
    }
    window.shopApplyPrices = function () {
        bindIndexCardPrices();
        bindProductRowPrices();
        applyHomeLeadDiscount();
        wrapLegacyCartTotals();
        wrapCheckoutPause();
        watchLightboxPrice();
        document.querySelectorAll("[data-shop-price]").forEach(function (el) {
            el.innerHTML = window.shopPriceHtml(el.getAttribute("data-shop-price"), { from: el.getAttribute("data-shop-price-from") });
        });
        shopEnsureNt();
        window.shopLockCheckoutButtons();
    };
    function shopNtCss() {
        if (document.getElementById("shop-nt-style")) return;
        var st = document.createElement("style");
        st.id = "shop-nt-style";
        st.textContent = ".shop-nt{font-size:calc(1em - 4px);font-weight:inherit;}.keep-body .shop-nt{font-size:calc(1em - 4px)!important;}";
        document.head.appendChild(st);
    }
    var ntBusy = false;
    var ntTimer = 0;
    function shopWrapNt(root) {
        if (!root) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var p = node.parentNode;
                if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
                var tag = p.tagName;
                if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
                if (p.classList && p.classList.contains("shop-nt")) return NodeFilter.FILTER_REJECT;
                if (p.closest && p.closest(".shop-nt")) return NodeFilter.FILTER_REJECT;
                if (node.nodeValue && node.nodeValue.indexOf("NT$") !== -1) return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_SKIP;
            }
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            var p = node.parentNode;
            if (!p) return;
            var text = node.nodeValue;
            if (String(text).trim() === "NT$" && p.childNodes.length === 1) {
                p.classList.add("shop-nt");
                p.classList.remove("text-xs");
                return;
            }
            var tmp = document.createElement("span");
            tmp.innerHTML = shopNtMark(text);
            var frag = document.createDocumentFragment();
            while (tmp.firstChild) frag.appendChild(tmp.firstChild);
            p.replaceChild(frag, node);
        });
    }
    function shopEnsureNt() {
        if (ntBusy || !document.body) return;
        ntBusy = true;
        try {
            shopNtCss();
            shopWrapNt(document.body);
        } finally {
            ntBusy = false;
        }
    }
    function shopScheduleNt() {
        clearTimeout(ntTimer);
        ntTimer = setTimeout(shopEnsureNt, 40);
    }
    function shopWatchNt() {
        if (!document.body || document.body._shopNtWatch || !window.MutationObserver) return;
        document.body._shopNtWatch = true;
        new MutationObserver(function () {
            if (!ntBusy) shopScheduleNt();
        }).observe(document.body, { childList: true, characterData: true, subtree: true });
    }
    function shopBoot() {
        window.shopApplyPrices();
        shopWatchNt();
        shopEnsureNt();
        shopShowPauseModal();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", shopBoot);
    else shopBoot();
})();
