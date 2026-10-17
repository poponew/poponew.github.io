window.shopSettings = {
    "shippingFee": 80,
    "freeShipping": 1500,
    "minOrder": 500,
    "codLimit": 2000,
    "bulkOrder": 5000,
    "discountFold": 9,
    "discountStart": "",
    "discountEnd": ""
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
    window.shopPriceHtml = function (original, opt) {
        opt = opt || {};
        var o = parseInt(original, 10) || 0;
        var n = window.shopSalePrice(o);
        var from = opt.from ? ' <span class="text-xs font-medium">起</span>' : (opt.suffix || "");
        if (n === o) return "NT$ " + o + from;
        return '<s class="shop-old-price text-sm font-normal" style="text-decoration:line-through;color:#a8a29e;font-weight:400;font-size:0.875rem">NT$ ' + o + "</s> <span class=\"shop-sale-price\">NT$ " + n + "</span>" + from;
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
        watchLightboxPrice();
        document.querySelectorAll("[data-shop-price]").forEach(function (el) {
            el.innerHTML = window.shopPriceHtml(el.getAttribute("data-shop-price"), { from: el.getAttribute("data-shop-price-from") });
        });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", window.shopApplyPrices);
    else window.shopApplyPrices();
})();
