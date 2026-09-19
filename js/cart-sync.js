(function () {
    function loadCart() {
        try {
            return JSON.parse(localStorage.getItem("poponew_cart")) || {};
        } catch (e) {
            return {};
        }
    }

    function persistCart() {
        if (window.cart && typeof window.cart === "object") {
            try {
                localStorage.setItem("poponew_cart", JSON.stringify(window.cart));
            } catch (e) {}
        }
    }

    function syncFromStorage() {
        var stored = loadCart();
        if (typeof window.cart === "object" && window.cart) {
            window.cart = stored;
        }
        if (window.products && window.products.forEach) {
            window.products.forEach(function (p) {
                var input = document.getElementById("qty-" + p.id);
                if (input) input.value = stored[p.id] || stored[String(p.id)] || 0;
            });
        }
        if (typeof calculatePageTotal === "function") calculatePageTotal();
        if (typeof updateCartCount === "function") {
            updateCartCount();
        } else {
            var el = document.getElementById("cart-count");
            if (el) {
                var count = 0;
                for (var id in stored) count += Number(stored[id]) || 0;
                el.innerText = count;
            }
        }
        if (typeof window.poponewRefreshCart === "function") window.poponewRefreshCart(stored);
    }

    window.addEventListener("pagehide", persistCart);
    window.addEventListener("pageshow", syncFromStorage);
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") persistCart();
        if (document.visibilityState === "visible") syncFromStorage();
    });
})();
