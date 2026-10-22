const fs = require('fs');
const path = require('path');

// 由 admin.html 一鍵生成。日常請按後台「一鍵完成」；此檔由 backup 的寫檔程式呼叫，不必手動雙擊。
const csvPath = path.join(__dirname, 'poponew_backup.csv');

if (!fs.existsSync(csvPath)) {
    console.error('❌ 找不到 poponew_backup.csv！請先從 admin.html 下載備份檔並放在同一資料夾。');
    process.exit(1);
}

const text = fs.readFileSync(csvPath, 'utf8');

function sanitizeCsvGhostQuote(value) {
            if (value === '"' || value === '""') return '';
            return value == null ? '' : String(value);
        }

function parseCSVRow(str) {
            let result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < str.length; i++) {
                let char = str[i];
                if (char === '"' && inQuotes && str[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else if (char !== '\r') {
                    current += char;
                }
            }
            result.push(current);
            return result.map(s => s.trim());
        }

function repairLegacyProductCsvLine(line) {
            if (!line.startsWith('product,')) return line;
            return line.replace(/,"""",/g, ',"",').replace(/,""",/g, ',"",');
        }

function newMarkDays() {
            return 30;
        }

function parseYmd(value) {
            var m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? (m[1] + '-' + m[2] + '-' + m[3]) : '';
        }

function taiwanTodayYmd() {
            return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        }

function addDaysYmd(ymd, days) {
            var s = parseYmd(ymd);
            if (!s) return '';
            var p = s.split('-');
            var dt = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
            dt.setUTCDate(dt.getUTCDate() + (parseInt(days, 10) || 0));
            var y = dt.getUTCFullYear();
            var mo = String(dt.getUTCMonth() + 1);
            var d = String(dt.getUTCDate());
            if (mo.length < 2) mo = '0' + mo;
            if (d.length < 2) d = '0' + d;
            return y + '-' + mo + '-' + d;
        }

function groupListedAt(g) {
            return parseYmd(g && g.listedAt);
        }

function groupNewUntilYmd(g) {
            var start = groupListedAt(g);
            return start ? addDaysYmd(start, newMarkDays()) : '';
        }

function groupHasNewMark(g) {
            var until = groupNewUntilYmd(g);
            return !!(until && taiwanTodayYmd() <= until);
        }

function groupHadLegacyNewMark(g) {
            if (g && g.isNew) return true;
            var tags = String(g && g.tag || '').split(/[,，]/).map(function(t) { return t.trim(); });
            return tags.indexOf('新品') !== -1;
        }

function migrateGroupListedAt(groups, today) {
            today = parseYmd(today) || taiwanTodayYmd();
            var changed = false;
            (groups || []).forEach(function(g) {
                if (!g) return;
                var tags = String(g.tag || '').split(/[,，]/).map(function(t) { return t.trim(); }).filter(Boolean);
                var nextTag = tags.filter(function(t) { return t !== '新品'; }).join(', ');
                if (nextTag !== String(g.tag || '').trim()) {
                    g.tag = nextTag;
                    changed = true;
                }
                if (groupListedAt(g)) {
                    if (g.isNew) {
                        g.isNew = false;
                        changed = true;
                    }
                    return;
                }
                if (groupHadLegacyNewMark(g) || (g && g.isNew)) {
                    g.listedAt = today;
                    g.isNew = false;
                    changed = true;
                }
            });
            return changed;
        }

function parseGroupRecord(parts) {
            var listedAt = parseYmd(parts[14]);
            if (parts.length < 11) {
                return {
                    id: parts[1], name: parts[2], url: parts[3],
                    price: parts[4] || '100 起', img: parts[5] || 'images/default.jpg',
                    desc: parts[6] || '', isPinned: parts[7] === 'true', tag: parts[8] || '',
                    isNew: parts[12] === 'true', isHidden: parts[13] === 'true',
                    listedAt: listedAt
                };
            }
            return {
                id: parts[1], name: parts[2], url: parts[3],
                price: parts[6] || '100 起', img: parts[8] || 'images/default.jpg',
                desc: parts[9] || '', isPinned: parts[10] === 'true', tag: parts[11] || '',
                isNew: parts[12] === 'true', isHidden: parts[13] === 'true',
                listedAt: listedAt
            };
        }

// 解析 CSV 資料（與 admin.html 相同）
const rawLines = text.split('\n');
const lines = [];
let currentLine = '';
let insideQuotes = false;

for (let i = 0; i < rawLines.length; i++) {
    let chunk = repairLegacyProductCsvLine(rawLines[i].replace(/\r$/, ''));
    currentLine += (currentLine === '' ? '' : '\n') + chunk;
    let quotesCount = (chunk.match(/"/g) || []).length;
    if (quotesCount % 2 !== 0) insideQuotes = !insideQuotes;
    if (!insideQuotes) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
    }
}

let groups = [];
let products = [];
let keepNote = '';
function parseDiscountFold(value) {
            var n = parseFloat(value);
            if (!isFinite(n) || n <= 0 || n > 10) return 10;
            return Math.round(n * 10) / 10;
        }

let shopSettings = { shippingFee: 80, freeShipping: 1500, minOrder: 500, codLimit: 2000, bulkOrder: 5000, discountFold: 10, discountStart: '', discountEnd: '', homeLead: '', ordersPaused: false, ordersPausedNote: '手工甜點趕製中，先暫停新訂單，免得讓大家等太久。已經下單的不用擔心，會照常做、照常寄。恢復時會在官方 LINE 跟大家說。' };

for (let i = 1; i < lines.length; i++) {
    let parts = parseCSVRow(lines[i]);
    let type = parts[0];
    if (type === 'settings') {
        shopSettings = Object.assign({}, shopSettings, { shippingFee: parseInt(parts[5], 10) || 80, freeShipping: parseInt(parts[6], 10) || 1500, minOrder: parseInt(parts[7], 10) || 500, codLimit: parseInt(parts[8], 10) || 2000, bulkOrder: parseInt(parts[9], 10) || 5000, homeLead: parts[4] || '' });
    } else if (type === 'discount') {
        shopSettings.discountFold = parseDiscountFold(parts[4]);
        shopSettings.discountStart = parseYmd(parts[5]);
        shopSettings.discountEnd = parseYmd(parts[6]);
    } else if (type === 'pause') {
        shopSettings.ordersPaused = parts[4] === 'true' || parts[4] === '1';
        shopSettings.ordersPausedNote = parts[7] || parts[5] || shopSettings.ordersPausedNote;
    } else if (type === 'keep') {
        keepNote = parts[9] || '';
    } else if (type === 'group') {
        groups.push(parseGroupRecord(parts));
    } else if (type === 'product') {
        products.push({ id: parseInt(parts[1]), group: parts[2], url: parts[3], name: parts[4], weight: sanitizeCsvGhostQuote(parts[5]), price: parseInt(parts[6]) || 0, note: sanitizeCsvGhostQuote(parts[7]), soldOut: parts[12] === 'true' });
    }
}
migrateGroupListedAt(groups);

function escapeAttr(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

function formatDescHtml(str) {
            if (!str) return "";
            return String(str)
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;")
                .replace(/<br\s*\/?>\s*(?:\r\n|\r|\n)/gi, "<br>")
                .replace(/\r\n|\r|\n/g, "<br>");
        }

function shopBrand() {
            return 'Poponew手做甜點';
        }

function siteOrigin() {
            return 'https://poponew.github.io';
        }

function siteAbsUrl(file) {
            var origin = String(siteOrigin() || '').replace(/\/$/, '');
            var name = String(file || '').replace(/^\/+/, '');
            if (!name || name === 'index.html') name = '';
            var path = name ? '/' + name : '/';
            return origin ? (origin + path) : path;
        }

function isoDate(d) {
            d = d || new Date();
            var m = d.getMonth() + 1;
            var day = d.getDate();
            return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
        }

function xmlText(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

function buildRobotsTxt() {
            var origin = String(siteOrigin() || '').replace(/\/$/, '');
            var sitemap = origin ? (origin + '/sitemap.xml') : '/sitemap.xml';
            return [
                'User-agent: *',
                'Allow: /',
                '',
                'Sitemap: ' + sitemap,
                ''
            ].join('\n');
        }

function sitemapUrlEntry(file, lastmod, priority) {
            return [
                '  <url>',
                '    <loc>' + xmlText(siteAbsUrl(file)) + '</loc>',
                '    <lastmod>' + lastmod + '</lastmod>',
                '    <priority>' + priority + '</priority>',
                '  </url>'
            ].join('\n');
        }

function buildSitemapXml(groupsList) {
            groupsList = groupsList || (typeof groups !== 'undefined' ? groups : []);
            var lastmod = isoDate();
            var seen = {};
            var urls = [];
            urls.push(sitemapUrlEntry('index.html', lastmod, '1.0'));
            seen['index.html'] = true;
            groupsList.forEach(function(g) {
                if (groupIsHidden(g)) return;
                var u = String(g && g.url || '').trim();
                if (!u || seen[u]) return;
                seen[u] = true;
                urls.push(sitemapUrlEntry(u, lastmod, '0.8'));
            });
            ['faq.html', 'keep.html'].forEach(function(u) {
                if (seen[u]) return;
                seen[u] = true;
                urls.push(sitemapUrlEntry(u, lastmod, '0.6'));
            });
            return '<?xml version="1.0" encoding="UTF-8"?>\n' +
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                urls.join('\n') + '\n' +
                '</urlset>\n';
        }

function plainMetaText(str) {
            return String(str || '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

function clipMetaText(str, max) {
            var s = plainMetaText(str);
            max = max || 90;
            if (s.length <= max) return s;
            return s.slice(0, max).replace(/[，,。.\s]+$/g, '') + '…';
        }

function seoMetaLines(title, description, image) {
            var t = escapeAttr(title);
            var d = escapeAttr(description);
            var imgRaw = image || 'images/scone.jpg';
            if (!/^https?:\/\//i.test(imgRaw)) imgRaw = siteAbsUrl(imgRaw);
            var img = escapeAttr(imgRaw);
            var brand = escapeAttr(shopBrand());
            return [
                '    <meta name="description" content="' + d + '">',
                '    <meta property="og:site_name" content="' + brand + '">',
                '    <meta property="og:locale" content="zh_TW">',
                '    <meta property="og:type" content="website">',
                '    <meta property="og:title" content="' + t + '">',
                '    <meta property="og:description" content="' + d + '">',
                '    <meta property="og:image" content="' + img + '">'
            ];
        }

function gaMeasurementId() {
            return 'G-MMGS0E58FW';
        }

function gaTagLines() {
            var id = gaMeasurementId();
            return [
                '    <!-- Google tag (gtag.js) -->',
                '    <script async src="https://www.googletagmanager.com/gtag/js?id=' + id + '"><\/script>',
                '    <script>',
                '        window.dataLayer = window.dataLayer || [];',
                '        function gtag(){dataLayer.push(arguments);}',
                "        gtag('js', new Date());",
                "        gtag('config', '" + id + "');",
                '    <\/script>'
            ];
        }

function formatGroupPriceHtml(groupName, productsList) {
            const items = (productsList || []).filter(function(p) { return p.group === groupName; });
            const prices = items.map(function(p) { return parseInt(p.price, 10) || 0; }).filter(function(n) { return n > 0; });
            const minPrice = prices.length ? Math.min.apply(null, prices) : 0;
            var fromAttr = items.length > 1 ? ' data-shop-price-from="1"' : '';
            return '<span data-shop-price="' + minPrice + '"' + fromAttr + '><span class="shop-nt">NT$</span> ' + minPrice + (items.length > 1 ? ' <span class="text-xs font-medium">起</span>' : '') + '</span>';
        }

function isProductOutOfStock(p) {
            if (!p) return false;
            if (p.soldOut) return true;
            var note = String(p.note || '');
            return note.indexOf('缺貨') !== -1 || note.indexOf('售完') !== -1;
        }

function groupIsHidden(g) {
            return !!(g && g.isHidden);
        }

function groupStockKind(groupName, productsList) {
            var items = (productsList || []).filter(function(p) { return p.group === groupName; });
            if (!items.length) return '';
            var sold = 0;
            items.forEach(function(p) { if (isProductOutOfStock(p)) sold++; });
            if (sold <= 0) return '';
            if (sold >= items.length) return 'sold';
            return 'partial';
        }

function groupStockNoteHtml(stockKind) {
            if (stockKind === 'sold') return '<span class="card-stock-note">（缺貨）</span>';
            if (stockKind === 'partial') return '<span class="card-stock-note">（部分缺貨）</span>';
            return '';
        }

function productAllergenNoteHtml() {
            return '<p class="allergen-note">⚠️ 含蛋、牛奶；產線另有麩質穀物及堅果。對上述成分過敏者不適合食用。<a href="faq.html">常見問題</a></p>';
        }

function soldOutBadgeHtml(forJs) {
            var icon = forJs
                ? "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' aria-hidden='true'><circle cx='12' cy='12' r='8.5' stroke='currentColor' stroke-width='2'/><path d='M7 7l10 10' stroke='currentColor' stroke-width='2' stroke-linecap='round'/></svg>"
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/><path d="M7 7l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            if (forJs) {
                return "<span class='text-sm font-bold text-stone-400 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200 shadow-inner' style='display:inline-flex;align-items:center;gap:0.3rem'>" + icon + "已售完</span>";
            }
            return '<span class="text-sm font-bold text-stone-400 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200 shadow-inner" style="display:inline-flex;align-items:center;gap:0.3rem">' + icon + '已售完</span>';
        }

function getShopSettings() {
            return {
                shippingFee: parseInt(shopSettings.shippingFee, 10) || 80,
                freeShipping: parseInt(shopSettings.freeShipping, 10) || 1500,
                minOrder: parseInt(shopSettings.minOrder, 10) || 500,
                codLimit: parseInt(shopSettings.codLimit, 10) || 2000,
                bulkOrder: parseInt(shopSettings.bulkOrder, 10) || 5000,
                discountFold: parseDiscountFold(shopSettings.discountFold),
                discountStart: parseYmd(shopSettings.discountStart),
                discountEnd: parseYmd(shopSettings.discountEnd),
                ordersPaused: !!shopSettings.ordersPaused,
                ordersPausedNote: String(shopSettings.ordersPausedNote || '').trim() || '手工甜點趕製中，先暫停新訂單，免得讓大家等太久。已經下單的不用擔心，會照常做、照常寄。恢復時會在官方 LINE 跟大家說。'
            };
        }

function lineLogoSvg() {
            return '<svg class="line-logo" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#06C755"/><path fill="#fff" d="M12.03 5.55c-3.68 0-6.66 2.38-6.66 5.32 0 2.62 2.32 4.82 5.46 5.23.21.04.47.13.54.3.06.15.04.38.02.53l-.09.53c-.03.18-.13.65.58.35 1.16-.49 3.14-1.84 4.3-3.15C17.4 13.02 18 11.66 18 10.87c0-2.94-2.98-5.32-5.97-5.32z"/></svg>';
        }

function shopContactLineHtml() {
            return '<p class="text-stone-500 text-[11px] md:text-xs leading-relaxed">' +
                '<button type="button" class="line-open-btn" data-line-open>' + lineLogoSvg() + '<span>官方LINE</span></button>' +
                '</p>';
        }

function shopFooterPolicyHtml() {
            return '<p class="mt-2 text-[11px] md:text-xs leading-relaxed">' +
                '<a href="keep.html#shipping" class="font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2">宅配配送與簽收須知</a>' +
                '<span class="text-stone-300"> ｜ </span>' +
                '<a href="keep.html#terms" class="font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2">訂購與退換貨條款</a>' +
                '<span class="text-stone-300"> ｜ </span>' +
                '<a href="faq.html" class="font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2">常見問題</a>' +
                '<span class="text-stone-300"> ｜ </span>' +
                '<a href="ask.html" class="font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2">聯絡我們</a>' +
                '</p>';
        }

function lineModalScriptTag() {
            return '    <script src="js/line-modal.js"><\/script>';
        }

function shopDiscountHelpersJs() {
            return [
                '(function () {',
                '    function shopTaiwanToday() {',
                '        return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });',
                '    }',
                '    function shopDiscountFold() {',
                '        var n = parseFloat((window.shopSettings || {}).discountFold);',
                '        return (isFinite(n) && n > 0 && n < 10) ? n : 10;',
                '    }',
                '    window.shopDiscountActive = function () {',
                '        if (shopDiscountFold() >= 10) return false;',
                '        var s = window.shopSettings || {};',
                '        var t = shopTaiwanToday();',
                '        if (s.discountStart && t < s.discountStart) return false;',
                '        if (s.discountEnd && t > s.discountEnd) return false;',
                '        return true;',
                '    };',
                '    window.shopSalePrice = function (original) {',
                '        var n = parseInt(original, 10) || 0;',
                '        if (!window.shopDiscountActive()) return n;',
                '        return Math.round(n * shopDiscountFold() / 10);',
                '    };',
                '    var SHOP_PAUSE_NOTE = "手工甜點趕製中，先暫停新訂單，免得讓大家等太久。已經下單的不用擔心，會照常做、照常寄。恢復時會在官方 LINE 跟大家說。";',
                '    window.shopOrdersPaused = function () {',
                '        return !!(window.shopSettings || {}).ordersPaused;',
                '    };',
                '    window.shopOrdersPausedNote = function () {',
                '        var n = String((window.shopSettings || {}).ordersPausedNote || "").trim();',
                '        return n || SHOP_PAUSE_NOTE;',
                '    };',
                '    function shopPageName() {',
                '        var path = String(location.pathname || "").split("/").pop() || "";',
                '        return path.toLowerCase() || "index.html";',
                '    }',
                '    function shopPauseModalPage() {',
                '        var p = shopPageName();',
                '        if (p === "" || p === "index.html") return true;',
                '        var skip = { "cart.html": 1, "faq.html": 1, "ask.html": 1, "keep.html": 1, "paid.html": 1, "order-search.html": 1 };',
                '        if (skip[p]) return false;',
                '        if (p.indexOf("google") === 0) return false;',
                '        return /\\.html$/i.test(p);',
                '    }',
                '    function shopShowPauseModal(force) {',
                '        if (!window.shopOrdersPaused() || !shopPauseModalPage()) return;',
                '        if (!force) {',
                '            try {',
                '                if (sessionStorage.getItem("poponew_pause_modal_seen")) return;',
                '                sessionStorage.setItem("poponew_pause_modal_seen", "1");',
                '            } catch (err) {}',
                '        }',
                '        if (document.getElementById("shop-pause-modal")) return;',
                '        var wrap = document.createElement("div");',
                '        wrap.id = "shop-pause-modal";',
                '        wrap.setAttribute("role", "dialog");',
                '        wrap.setAttribute("aria-modal", "true");',
                '        wrap.style.cssText = "position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:1.25rem;overflow:hidden;";',
                '        var card = document.createElement("div");',
                '        card.style.cssText = "position:relative;width:min(92vw,22rem);background:rgba(255,255,255,.42);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.55);border-radius:1.25rem;padding:1.4rem 1.2rem 1.25rem;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.18),0 0 0 100vmax rgba(28,25,23,.4)";',
                '        var title = document.createElement("p");',
                '        title.style.cssText = "margin:0 0 .75rem;font-size:1.05rem;font-weight:700;color:#44403c";',
                '        title.textContent = "(›´ω`‹ )暫停接單";',
                '        var note = document.createElement("p");',
                '        note.style.cssText = "margin:0 0 1rem;font-size:.9rem;line-height:1.7;color:#57534e;text-align:left;white-space:pre-wrap";',
                '        note.textContent = window.shopOrdersPausedNote();',
                '        var lineWrap = document.createElement("p");',
                '        lineWrap.style.cssText = "margin:0 0 1rem";',
                '        var lineBtn = document.createElement("button");',
                '        lineBtn.type = "button";',
                '        lineBtn.className = "line-open-btn";',
                '        lineBtn.setAttribute("data-line-open", "");',
                '        lineBtn.innerHTML = \'<svg class="line-logo" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#06C755"/><path fill="#fff" d="M12.03 5.55c-3.68 0-6.66 2.38-6.66 5.32 0 2.62 2.32 4.82 5.46 5.23.21.04.47.13.54.3.06.15.04.38.02.53l-.09.53c-.03.18-.13.65.58.35 1.16-.49 3.14-1.84 4.3-3.15C17.4 13.02 18 11.66 18 10.87c0-2.94-2.98-5.32-5.97-5.32z"/></svg><span>官方LINE</span>\';',
                '        lineWrap.appendChild(lineBtn);',
                '        var ok = document.createElement("button");',
                '        ok.type = "button";',
                '        ok.setAttribute("data-shop-pause-close", "1");',
                '        ok.style.cssText = "display:block;width:100%;min-height:2.6rem;border:0;border-radius:.8rem;background:#b45309;color:#fff;font-weight:700;cursor:pointer";',
                '        ok.textContent = "我知道了";',
                '        card.appendChild(title);',
                '        card.appendChild(note);',
                '        card.appendChild(lineWrap);',
                '        card.appendChild(ok);',
                '        wrap.appendChild(card);',
                '        document.body.appendChild(wrap);',
                '        document.body.style.overflow = "hidden";',
                '        function closePause() {',
                '            wrap.remove();',
                '            document.body.style.overflow = "";',
                '        }',
                '        wrap.addEventListener("click", function (e) {',
                '            if (e.target && e.target.closest && e.target.closest("[data-line-open]")) {',
                '                closePause();',
                '                return;',
                '            }',
                '            if (e.target === wrap || (e.target && e.target.getAttribute("data-shop-pause-close"))) closePause();',
                '        });',
                '    }',
                '    function shopPauseCss() {',
                '        if (document.getElementById("shop-pause-style")) return;',
                '        var st = document.createElement("style");',
                '        st.id = "shop-pause-style";',
                '        st.textContent = ".shop-checkout-paused{background:#d6d3d1!important;color:#fff!important;cursor:not-allowed!important;box-shadow:none!important;}";',
                '        document.head.appendChild(st);',
                '    }',
                '    window.shopLockCheckoutButtons = function () {',
                '        if (!window.shopOrdersPaused()) return;',
                '        shopPauseCss();',
                '        document.querySelectorAll("button").forEach(function (btn) {',
                '            var oc = btn.getAttribute("onclick") || "";',
                '            if (oc.indexOf("saveToCartAndGo") !== -1 || String(btn.textContent || "").indexOf("前往結帳") !== -1) {',
                '                btn.classList.add("shop-checkout-paused");',
                '                btn.setAttribute("aria-disabled", "true");',
                '            }',
                '        });',
                '        var submit = document.getElementById("submit-btn");',
                '        if (!submit) return;',
                '        submit.disabled = true;',
                '        submit.classList.add("shop-checkout-paused", "bg-stone-300", "cursor-not-allowed");',
                '        var tip = document.getElementById("orders-paused-tip");',
                '        if (!tip) {',
                '            tip = document.createElement("p");',
                '            tip.id = "orders-paused-tip";',
                '            tip.className = "text-sm leading-relaxed mt-4 mb-0 px-3 py-2 rounded-xl";',
                '            tip.style.cssText = "background:#fef3c7;border:1px solid #fde68a;color:#78350f;";',
                '            submit.parentNode.insertBefore(tip, submit);',
                '        }',
                '        tip.hidden = false;',
                '        tip.textContent = window.shopOrdersPausedNote();',
                '    };',
                '    function wrapCheckoutPause() {',
                '        var go = window.saveToCartAndGo;',
                '        if (typeof go === "function" && !go._shopPauseWrapped) {',
                '            window.saveToCartAndGo = function () {',
                '                if (window.shopOrdersPaused()) {',
                '                    shopShowPauseModal(true);',
                '                    return;',
                '                }',
                '                return go.apply(this, arguments);',
                '            };',
                '            window.saveToCartAndGo._shopPauseWrapped = true;',
                '        }',
                '        var send = window.submitOrder;',
                '        if (typeof send === "function" && !send._shopPauseWrapped) {',
                '            window.submitOrder = function (event) {',
                '                if (window.shopOrdersPaused()) {',
                '                    if (event && event.preventDefault) event.preventDefault();',
                '                    alert(window.shopOrdersPausedNote());',
                '                    return;',
                '                }',
                '                return send.apply(this, arguments);',
                '            };',
                '            window.submitOrder._shopPauseWrapped = true;',
                '        }',
                '    };',
                '    window.shopWebpPath = function (src) {',
                '        return String(src || "").replace(/\\.jpe?g(\\?.*)?$/i, ".webp$1");',
                '    };',
                '    window.shopPictureHtml = function (src, attrs) {',
                '        var jpg = String(src || "");',
                '        return \'<picture><source srcset="\' + window.shopWebpPath(jpg) + \'" type="image/webp"><img src="\' + jpg + \'"\' + (attrs ? (" " + attrs) : "") + "></picture>";',
                '    };',
                '    window.shopSetPictureSrc = function (img, src) {',
                '        if (!img) return;',
                '        img._shopWebpFail = false;',
                '        img.src = src;',
                '        var pic = img.parentNode;',
                '        if (pic && pic.tagName === "PICTURE") {',
                '            var source = pic.querySelector(\'source[type="image/webp"]\');',
                '            if (source) source.srcset = window.shopWebpPath(src);',
                '        }',
                '    };',
                '    function shopFallbackJpg(img) {',
                '        if (!img || img._shopWebpFail) return;',
                '        var jpg = img.getAttribute("src") || "";',
                '        if (/\\.webp(\\?|$)/i.test(jpg)) jpg = jpg.replace(/\\.webp(\\?.*)?$/i, ".jpg$1");',
                '        if (!/\\.jpe?g(\\?|$)/i.test(jpg)) return;',
                '        var pic = img.parentNode;',
                '        if (pic && pic.tagName === "PICTURE") {',
                '            var sources = pic.querySelectorAll("source");',
                '            for (var i = 0; i < sources.length; i++) sources[i].remove();',
                '        }',
                '        img._shopWebpFail = true;',
                '        img.src = "";',
                '        img.src = jpg;',
                '    }',
                '    document.addEventListener("error", function (e) {',
                '        var t = e.target;',
                '        if (t && t.tagName === "IMG") shopFallbackJpg(t);',
                '    }, true);',
                '    function shopNtMark(s) {',
                '        return String(s).replace(/NT\\$/g, \'<span class="shop-nt">NT$</span>\');',
                '    }',
                '    window.shopPriceHtml = function (original, opt) {',
                '        opt = opt || {};',
                '        var o = parseInt(original, 10) || 0;',
                '        var n = window.shopSalePrice(o);',
                '        var from = opt.from ? \' <span class="text-xs font-medium">起</span>\' : (opt.suffix || "");',
                '        if (n === o) return shopNtMark("NT$ ") + o + from;',
                '        return \'<s class="shop-old-price text-sm font-normal" style="text-decoration:line-through;color:#a8a29e;font-weight:400;font-size:0.875rem">\' + shopNtMark("NT$ ") + o + "</s> <span class=\\"shop-sale-price\\">" + shopNtMark("NT$ ") + n + "</span>" + from;',
                '    };',
                '    function bindIndexCardPrices() {',
                '        if (!window.shopSearch || !window.shopSearch.length) return;',
                '        var mins = {};',
                '        var counts = {};',
                '        window.shopSearch.forEach(function (p) {',
                '            var key = String(p.group || "");',
                '            if (!key) return;',
                '            counts[key] = (counts[key] || 0) + 1;',
                '            var price = parseInt(p.price, 10) || 0;',
                '            if (mins[key] == null || price < mins[key]) mins[key] = price;',
                '        });',
                '        document.querySelectorAll("a.product-card").forEach(function (card) {',
                '            var h2 = card.querySelector("h2");',
                '            if (!h2) return;',
                '            var name = String(h2.textContent || "").replace(/^【新品】/, "").trim();',
                '            if (mins[name] == null) return;',
                '            var box = card.querySelector(".text-amber-700");',
                '            if (!box) return;',
                '            box.setAttribute("data-shop-price", String(mins[name]));',
                '            if (counts[name] > 1) box.setAttribute("data-shop-price-from", "1");',
                '        });',
                '    }',
                '    function bindProductRowPrices() {',
                '        (window.products || []).forEach(function (p) {',
                '            var left = document.getElementById("product-info-left-" + p.id);',
                '            if (!left) return;',
                '            var priceEl = left.querySelector("p.text-amber-700") || left.querySelector("p:last-of-type");',
                '            if (!priceEl) return;',
                '            priceEl.setAttribute("data-shop-price", String(parseInt(p.price, 10) || 0));',
                '        });',
                '    }',
                '    function shopDiscountLeadPrefix() {',
                '        if (!window.shopDiscountActive()) return "";',
                '        var fold = String(shopDiscountFold()).replace(/\\.0$/, "");',
                '        var s = window.shopSettings || {};',
                '        var when = (s.discountStart || s.discountEnd) ? ("（" + (s.discountStart || "即日起") + "～" + (s.discountEnd || "另行公告") + "）") : "";',
                '        return "全店 " + fold + " 折優惠中" + when + "！";',
                '    }',
                '    function applyHomeLeadDiscount() {',
                '        var lead = document.getElementById("shop-home-lead") || document.querySelector(".max-w-5xl p.text-center");',
                '        if (!lead) return;',
                '        if (!lead.getAttribute("data-shop-lead")) {',
                '            var raw = String(lead.textContent || "").replace(/^📢\\s*/, "").replace(/^全店\\s+[\\d.]+\\s+折優惠中(?:（[^）]*）)?！/, "").trim();',
                '            lead.setAttribute("data-shop-lead", raw);',
                '        }',
                '        var prefix = shopDiscountLeadPrefix();',
                '        var base = lead.getAttribute("data-shop-lead") || "";',
                '        if (prefix) {',
                '            lead.innerHTML = "📢 <span class=\\"shop-sale-lead\\" style=\\"background:#fef3c7;color:#78350f;font-weight:600;padding:0.12em 0.45em;border-radius:0.4rem\\">" + prefix + "</span>" + base;',
                '        } else {',
                '            lead.textContent = "📢 " + base;',
                '        }',
                '        var old = document.getElementById("shop-sale-banner");',
                '        if (old) {',
                '            old.hidden = true;',
                '            old.textContent = "";',
                '        }',
                '    }',
                '    function wrapLegacyCartTotals() {',
                '        function wrap(name) {',
                '            var fn = window[name];',
                '            if (typeof fn !== "function" || fn._shopWrapped) return;',
                '            if (Function.prototype.toString.call(fn).indexOf("shopSalePrice") !== -1) return;',
                '            window[name] = function () {',
                '                var lookup = window.allProductsLookup;',
                '                if (lookup && window.shopDiscountActive()) {',
                '                    var sale = {};',
                '                    for (var k in lookup) {',
                '                        if (Object.prototype.hasOwnProperty.call(lookup, k)) sale[k] = window.shopSalePrice(lookup[k]);',
                '                    }',
                '                    window.allProductsLookup = sale;',
                '                    try { return fn.apply(this, arguments); }',
                '                    finally { window.allProductsLookup = lookup; }',
                '                }',
                '                return fn.apply(this, arguments);',
                '            };',
                '            window[name]._shopWrapped = true;',
                '        }',
                '        wrap("calculatePageTotal");',
                '        wrap("saveToCartAndGo");',
                '        if (typeof window.calculatePageTotal === "function") window.calculatePageTotal();',
                '    }',
                '    function watchLightboxPrice() {',
                '        var el = document.getElementById("lb-price");',
                '        if (!el || el._shopWatch) return;',
                '        el._shopWatch = true;',
                '        var applying = false;',
                '        function apply() {',
                '            if (applying || !window.shopDiscountActive()) return;',
                '            if (el.querySelector(".shop-sale-price")) return;',
                '            var m = String(el.textContent || "").match(/NT\\$\\s*(\\d+)/);',
                '            if (!m) return;',
                '            applying = true;',
                '            el.innerHTML = window.shopPriceHtml(m[1]);',
                '            applying = false;',
                '        }',
                '        apply();',
                '        if (window.MutationObserver) new MutationObserver(apply).observe(el, { childList: true, characterData: true, subtree: true });',
                '    }',
                '    window.shopApplyPrices = function () {',
                '        bindIndexCardPrices();',
                '        bindProductRowPrices();',
                '        applyHomeLeadDiscount();',
                '        wrapLegacyCartTotals();',
                '        wrapCheckoutPause();',
                '        watchLightboxPrice();',
                '        document.querySelectorAll("[data-shop-price]").forEach(function (el) {',
                '            el.innerHTML = window.shopPriceHtml(el.getAttribute("data-shop-price"), { from: el.getAttribute("data-shop-price-from") });',
                '        });',
                '        shopEnsureNt();',
                '        window.shopLockCheckoutButtons();',
                '    };',
                '    function shopNtCss() {',
                '        if (document.getElementById("shop-nt-style")) return;',
                '        var st = document.createElement("style");',
                '        st.id = "shop-nt-style";',
                '        st.textContent = ".shop-nt{font-size:calc(1em - 4px);font-weight:inherit;}.keep-body .shop-nt{font-size:calc(1em - 4px)!important;}";',
                '        document.head.appendChild(st);',
                '    }',
                '    var ntBusy = false;',
                '    var ntTimer = 0;',
                '    function shopWrapNt(root) {',
                '        if (!root) return;',
                '        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {',
                '            acceptNode: function (node) {',
                '                var p = node.parentNode;',
                '                if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;',
                '                var tag = p.tagName;',
                '                if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;',
                '                if (p.classList && p.classList.contains("shop-nt")) return NodeFilter.FILTER_REJECT;',
                '                if (p.closest && p.closest(".shop-nt")) return NodeFilter.FILTER_REJECT;',
                '                if (node.nodeValue && node.nodeValue.indexOf("NT$") !== -1) return NodeFilter.FILTER_ACCEPT;',
                '                return NodeFilter.FILTER_SKIP;',
                '            }',
                '        });',
                '        var nodes = [];',
                '        while (walker.nextNode()) nodes.push(walker.currentNode);',
                '        nodes.forEach(function (node) {',
                '            var p = node.parentNode;',
                '            if (!p) return;',
                '            var text = node.nodeValue;',
                '            if (String(text).trim() === "NT$" && p.childNodes.length === 1) {',
                '                p.classList.add("shop-nt");',
                '                p.classList.remove("text-xs");',
                '                return;',
                '            }',
                '            var tmp = document.createElement("span");',
                '            tmp.innerHTML = shopNtMark(text);',
                '            var frag = document.createDocumentFragment();',
                '            while (tmp.firstChild) frag.appendChild(tmp.firstChild);',
                '            p.replaceChild(frag, node);',
                '        });',
                '    }',
                '    function shopEnsureNt() {',
                '        if (ntBusy || !document.body) return;',
                '        ntBusy = true;',
                '        try {',
                '            shopNtCss();',
                '            shopWrapNt(document.body);',
                '        } finally {',
                '            ntBusy = false;',
                '        }',
                '    }',
                '    function shopScheduleNt() {',
                '        clearTimeout(ntTimer);',
                '        ntTimer = setTimeout(shopEnsureNt, 40);',
                '    }',
                '    function shopWatchNt() {',
                '        if (!document.body || document.body._shopNtWatch || !window.MutationObserver) return;',
                '        document.body._shopNtWatch = true;',
                '        new MutationObserver(function () {',
                '            if (!ntBusy) shopScheduleNt();',
                '        }).observe(document.body, { childList: true, characterData: true, subtree: true });',
                '    }',
                '    function shopBoot() {',
                '        window.shopApplyPrices();',
                '        shopWatchNt();',
                '        shopEnsureNt();',
                '        shopShowPauseModal();',
                '    }',
                '    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", shopBoot);',
                '    else shopBoot();',
                '})();'
            ].join('\n');
        }

function buildShopSettingsJs() {
            return 'window.shopSettings = ' + JSON.stringify(getShopSettings(), null, 4) + ';\n' + shopDiscountHelpersJs() + '\n';
        }

// 首頁樣板（與 admin.html 的 buildIndexHtml 同步）
function buildIndexHtml(groupsList, productsList) {
            groupsList = groupsList || globalGroups;
            productsList = productsList || globalProducts;
            var shopGroups = (groupsList || []).filter(function(g) { return !groupIsHidden(g); });
            var hiddenNames = {};
            (groupsList || []).forEach(function(g) {
                if (groupIsHidden(g) && g && g.name) hiddenNames[g.name] = true;
            });
            var homeLead = String(shopSettings.homeLead || '').trim() || '全店滿 NT$ 1,500 元即享免運費宅配！';
    let tagSet = new Set();
    shopGroups.forEach(g => {
        if (g.tag) {
            let tags = g.tag.split(/[,，]/).map(t => t.trim()).filter(t => t !== "");
            tags.forEach(t => tagSet.add(t));
        }
    });
    let allTags = Array.from(tagSet);

    var indexTitle = shopBrand() + '｜手工司康、巴斯克、美式軟餅乾、生乳捲、比利時鬆餅、布朗尼';
    var indexDesc = shopBrand() + '提供手工司康、巴斯克乳酪蛋糕與餅乾。全店滿 NT$ 1,500 免運。';
    var indexImg = (shopGroups[0] && shopGroups[0].img) || 'images/scone.jpg';
    var indexHtml = [];
    indexHtml.push('<!DOCTYPE html>');
    indexHtml.push('<html lang="zh-TW">');
    indexHtml.push('<head>');
    indexHtml.push('    <meta charset="UTF-8">');
    indexHtml.push('    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
    gaTagLines().forEach(function(line) { indexHtml.push(line); });
    indexHtml.push('    <title>' + escapeAttr(indexTitle) + '<\/title>');
    seoMetaLines(indexTitle, indexDesc, indexImg).forEach(function(line) { indexHtml.push(line); });
    indexHtml.push('    <link rel="stylesheet" href="css/tailwind.css">');
    indexHtml.push('    <script src="js/shop-settings.js"><\/script>');
    // 💡 在此處加入 @font-face 與標題字型指定
    indexHtml.push('    <style>');
    indexHtml.push('        @font-face {');
    indexHtml.push('            font-family: "poponew";');
    indexHtml.push('            src: url("fonts/poponew.woff2") format("woff2");');
    indexHtml.push('            font-weight: bold;');
    indexHtml.push('            font-style: normal;');
    indexHtml.push('            font-display: swap;');
    indexHtml.push('        }');
    indexHtml.push('        /* 讓首頁 h2 大標題套用此字型 */');
    indexHtml.push('        h2 {');
    indexHtml.push('            font-family: "poponew", sans-serif !important;');
        indexHtml.push('            color: #44403c;');
    indexHtml.push('        }');
    indexHtml.push('        .brand-mark { font-family: "poponew", sans-serif; }');
    indexHtml.push('        .home-nav-brand { white-space: nowrap; overflow: hidden; min-width: 0; flex: 1 1 auto; font-size: clamp(0.95rem, 4.4vw, 1.25rem); }');
    indexHtml.push('        .shop-search-open-btn { width: 2.375rem; height: 2.375rem; border-radius: 0.75rem; border: 1px solid #e7d4b8; background: linear-gradient(180deg, #fffdf8 0%, #f8efe3 100%); color: #92400e; box-shadow: 0 1px 2px rgba(120,53,15,0.08), inset 0 1px 0 rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease; }');
    indexHtml.push('        .shop-search-open-btn:hover { background: linear-gradient(180deg, #fff7ed 0%, #fde8c8 100%); box-shadow: 0 3px 10px rgba(180,83,9,0.16), inset 0 1px 0 rgba(255,255,255,0.95); color: #78350f; }');
    indexHtml.push('        .shop-search-open-btn:active { transform: scale(0.96); }');
    indexHtml.push('        .shop-search-open-btn svg { width: 1.05rem; height: 1.05rem; stroke: currentColor; fill: none; }');
    indexHtml.push('        .shop-search-layer { display: none; position: fixed; inset: 0; z-index: 70; }');
    indexHtml.push('        .shop-search-layer.is-open { display: block; }');
    indexHtml.push('        .shop-search-backdrop { position: absolute; inset: 0; background: rgba(28, 25, 23, 0.45); }');
    indexHtml.push('        .shop-search-panel { position: relative; z-index: 1; margin: 0.75rem auto 0; width: calc(100% - 1.5rem); max-width: 32rem; max-height: min(80vh, 36rem); overflow: hidden; background: #fff; border-radius: 1rem; box-shadow: 0 16px 40px rgba(0,0,0,0.18); display: flex; flex-direction: column; }');
    indexHtml.push('        .shop-search-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; border-bottom: 1px solid #e7e5e4; }');
    indexHtml.push('        .shop-search-bar input { flex: 1; min-width: 0; border: 1px solid #d6d3d1; border-radius: 0.75rem; padding: 0.55rem 0.75rem; font-size: 1rem; }');
    indexHtml.push('        .shop-search-bar input:focus { outline: none; border-color: #b45309; }');
    indexHtml.push('        .shop-search-close { flex-shrink: 0; font-size: 0.8rem; font-weight: 600; color: #78716c; padding: 0.4rem 0.55rem; }');
    indexHtml.push('        .shop-search-results { overflow: auto; padding: 0.35rem 0.5rem 0.6rem; }');
    indexHtml.push('        .shop-search-hint { color: #78716c; font-size: 0.85rem; padding: 0.85rem 0.6rem; }');
    indexHtml.push('        .shop-search-item { display: block; padding: 0.7rem 0.65rem; border-radius: 0.75rem; text-decoration: none; }');
    indexHtml.push('        .shop-search-item:hover, .shop-search-item:focus { background: #fffbeb; }');
    indexHtml.push('        .shop-search-name { display: block; color: #292524; font-weight: 700; font-size: 0.9rem; }');
    indexHtml.push('        .shop-search-meta { display: block; margin-top: 0.15rem; color: #78716c; font-size: 0.75rem; }');
    indexHtml.push('        .shop-search-sold { color: #a8a29e; }');
    indexHtml.push('        body.shop-search-open { overflow: hidden; }');
    indexHtml.push('        .card-new-mark { font-family: ui-sans-serif, system-ui, sans-serif !important; color: #b45309; font-weight: 700; font-size: 0.75rem; line-height: 1; flex-shrink: 0; margin-right: 0.2em; white-space: nowrap; }');
    indexHtml.push('        .card-stock-note { margin-left: 0.4rem; font-size: 0.75rem; font-weight: 600; color: #78716c; }');
    indexHtml.push('    </style>');
    indexHtml.push('<\/head>');
    indexHtml.push('<body class="bg-stone-50 text-stone-800 font-sans min-h-screen pb-12">');
    indexHtml.push('    <nav class="border-b sticky top-0 bg-white/90 backdrop-blur-md z-40">');
    indexHtml.push('        <div class="max-w-5xl mx-auto px-4 py-3">');
    indexHtml.push('            <div class="flex justify-between items-center gap-3">');
    indexHtml.push('                <h1 id="home-nav-brand" class="brand-mark home-nav-brand font-bold text-amber-800 leading-tight">Poponew手做甜點<\/h1>');
    indexHtml.push('                <div class="flex items-center gap-2 shrink-0">');
    indexHtml.push('                    <a href="cart.html" class="shrink-0 bg-amber-700 hover:bg-amber-800 text-white font-medium py-1.5 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-sm text-sm">🛒 購物車 (<span id="cart-count">0<\/span>)<\/a>');
    indexHtml.push('                    <button type="button" id="shop-search-open" class="shop-search-open-btn" title="搜尋商品" aria-label="搜尋商品"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke-width="2"/><path d="M16.2 16.2L21 21" stroke-width="2" stroke-linecap="round"/><\/svg><\/button>');
    indexHtml.push('                <\/div>');
    indexHtml.push('            <\/div>');
    indexHtml.push('        <\/div>');
    indexHtml.push('    <\/nav>');
    indexHtml.push('    <div id="shop-search-layer" class="shop-search-layer" hidden>');
    indexHtml.push('        <div class="shop-search-backdrop" id="shop-search-backdrop"><\/div>');
    indexHtml.push('        <div class="shop-search-panel" role="dialog" aria-label="搜尋商品">');
    indexHtml.push('            <div class="shop-search-bar">');
    indexHtml.push('                <input id="shop-search-input" type="search" placeholder="搜尋商品或口味" autocomplete="off" enterkeyhint="search">');
    indexHtml.push('                <button type="button" id="shop-search-close" class="shop-search-close">關閉<\/button>');
    indexHtml.push('            <\/div>');
    indexHtml.push('            <div id="shop-search-results" class="shop-search-results"><\/div>');
    indexHtml.push('        <\/div>');
    indexHtml.push('    <\/div>');
    indexHtml.push('    <div class="fixed right-3 top-1/3 -translate-y-1/2 z-30 flex flex-col items-center bg-white/50 backdrop-blur-sm rounded-2xl p-1 border border-stone-200/70 shadow-md">');
    indexHtml.push('        <button type="button" onclick="changeFontSize(-1)" title="縮小字型" class="w-9 h-8 flex items-center justify-center text-xs font-bold text-stone-600 hover:bg-stone-100 hover:text-amber-800 rounded-lg transition active:scale-95">A-</button>');
    indexHtml.push('        <button type="button" onclick="resetFontSize()" title="重設字型" class="w-9 h-8 flex items-center justify-center text-[10px] font-medium text-stone-400 hover:text-amber-800 transition">預設</button>');
    indexHtml.push('        <button type="button" onclick="changeFontSize(1)" title="放大字型" class="w-9 h-8 flex items-center justify-center text-sm font-bold text-stone-700 hover:bg-stone-100 hover:text-amber-800 rounded-lg transition active:scale-95">A+</button>');
    indexHtml.push('    <\/div>');
    indexHtml.push('    <div class="max-w-5xl mx-auto px-4 mb-8">');
    indexHtml.push('        <p id="shop-home-lead" class="text-stone-600 text-sm leading-snug text-center mt-5 mb-5">📢 ' + escapeAttr(homeLead) + '<\/p>');
    indexHtml.push('        <div class="flex flex-wrap items-center justify-center gap-1.5 mb-6" id="category-tags">');
    indexHtml.push('          <button type="button" onclick="filterCategory(\'all\', this)" class="tag-btn px-3 py-1 rounded-full text-sm font-semibold bg-amber-700 text-white shadow-sm transition">全部商品<\/button>');
    allTags.forEach(function(t) {
        indexHtml.push('          <button type="button" onclick=\'filterCategory(' + JSON.stringify(t) + ', this)\' class="tag-btn px-3 py-1 rounded-full text-sm font-semibold bg-white text-stone-600 border border-stone-200 hover:bg-amber-50 hover:text-amber-800 transition">' + escapeAttr(t) + '<\/button>');
    });
    indexHtml.push('          <a href="order-search.html" class="tag-btn px-3 py-1 rounded-full text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition">📋 訂單查詢<\/a>');
    indexHtml.push('          <a href="faq.html" class="tag-btn px-3 py-1 rounded-full text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition">常見問題<\/a>');
    indexHtml.push('        <\/div>');

    indexHtml.push('        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" id="product-list">');
    shopGroups.forEach(function(g) {
        let cleanTag = (g.tag || '').trim();
        let isPinned = g.isPinned || false;
        var isNew = groupHasNewMark(g);
        var stockKind = groupStockKind(g.name, productsList);
        var newMarkHtml = isNew ? '<span class="card-new-mark">【新品】</span>' : '';
            indexHtml.push('            <a href="' + g.url + '" data-tag="' + cleanTag + '" data-pinned="' + isPinned + '" data-new="' + (isNew ? 'true' : 'false') + '" class="product-card bg-white rounded-2xl shadow-md overflow-hidden border border-stone-100 flex flex-col justify-between hover:shadow-lg hover:-translate-y-0.5 transition duration-200 block group">');
            indexHtml.push('                <!-- 1. 圖片容器：加大高度，展現豐富質感 -->');
            indexHtml.push('                <div class="h-56 bg-stone-400 overflow-hidden">');
            var cardWebp = String(g.img || "").replace(/\.jpe?g$/i, ".webp");
            indexHtml.push('                    <picture>');
            indexHtml.push('                        <source srcset="' + cardWebp + '" type="image/webp">');
            indexHtml.push('                        <img loading="lazy" decoding="async" src="' + g.img + '" alt="' + g.name + '" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">');
            indexHtml.push('                    </picture>');
            indexHtml.push('                <\/div>');
            indexHtml.push('                ');
            indexHtml.push('                <!-- 2. 文字與售價區塊：貼合底部與售價 -->');
            indexHtml.push('                <div class="p-4 flex-grow flex flex-col justify-between">');
            indexHtml.push('                    <div class="mt-auto">');
            indexHtml.push('                        <h2 class="text-lg font-bold text-stone-700 mb-1 group-hover:text-stone-800 transition flex items-start leading-tight">' + newMarkHtml + g.name + '<\/h2>');
            indexHtml.push('                        <p class="font-zoom text-stone-500 text-xs leading-relaxed mb-0 line-clamp-2">' + formatDescHtml(g.desc) + '<\/p>');
            indexHtml.push('                    <\/div>');
            indexHtml.push('                    <div class="pt-2 border-t border-stone-100 flex justify-between items-center mt-3">');
            indexHtml.push('                        <span class="text-sm text-stone-400">售價 <span class="text-base font-bold text-amber-700">' + formatGroupPriceHtml(g.name, productsList) + '<\/span>' + groupStockNoteHtml(stockKind) + '<\/span>');
            indexHtml.push('                    <\/div>');
            indexHtml.push('                <\/div>');
            indexHtml.push('            <\/a>');
    });
    indexHtml.push('        <\/div>');
    indexHtml.push('    <\/div>');

    indexHtml.push('    <footer class="max-w-2xl mx-auto px-4 pb-12">');
    indexHtml.push('        <div class="bg-white shadow-md rounded-2xl p-5 flex items-center gap-4 border border-stone-100 mt-8">');
    indexHtml.push('            <div class="text-left">');
    indexHtml.push('                <h4 class="font-bold text-amber-700 text-sm md:text-base mb-1">Poponew手做甜點<\/h4>');
    indexHtml.push('                ' + shopContactLineHtml());
    indexHtml.push('                ' + shopFooterPolicyHtml());
    indexHtml.push('            <\/div>');
    indexHtml.push('        <\/div>');
    indexHtml.push('        <p class="text-center text-stone-400 text-[10px] md:text-[11px] py-6">Copyright &copy; 2026 Poponew. All rights reserved.<\/p>');
    indexHtml.push('    <\/footer>');

    var searchItems = (productsList || []).map(function(p) {
        var note = String(p.note || "");
        return {
            name: String(p.name || ""),
            group: String(p.group || ""),
            url: String(p.url || ""),
            price: parseInt(p.price, 10) || 0,
            soldOut: !!(p.soldOut) || note.indexOf("缺貨") !== -1 || note.indexOf("售完") !== -1
        };
    }).filter(function(p) { return p.name && p.url && !hiddenNames[p.group]; });
    indexHtml.push('    <script>window.shopSearch = ' + JSON.stringify(searchItems) + ';<\/script>');

    indexHtml.push('    <script>');
    indexHtml.push('        function applyHomeImagePriority() {');
    indexHtml.push('            var cards = document.querySelectorAll("#product-list .product-card");');
    indexHtml.push('            var n = 0;');
    indexHtml.push('            cards.forEach(function(card) {');
    indexHtml.push('                var img = card.querySelector("img");');
    indexHtml.push('                if (!img) return;');
    indexHtml.push('                var shown = card.style.display !== "none";');
    indexHtml.push('                if (shown && n < 3) {');
    indexHtml.push('                    img.loading = "eager";');
    indexHtml.push('                    img.decoding = "async";');
    indexHtml.push('                    if (n === 0) img.setAttribute("fetchpriority", "high");');
    indexHtml.push('                    else img.removeAttribute("fetchpriority");');
    indexHtml.push('                    n += 1;');
    indexHtml.push('                } else {');
    indexHtml.push('                    img.loading = "lazy";');
    indexHtml.push('                    img.decoding = "async";');
    indexHtml.push('                    img.removeAttribute("fetchpriority");');
    indexHtml.push('                }');
    indexHtml.push('            });');
    indexHtml.push('        }');
    indexHtml.push('        // 1. 洗牌演算法 (Fisher-Yates)');
    indexHtml.push('        function shuffleArray(array) {');
    indexHtml.push('            for (var i = array.length - 1; i > 0; i--) {');
    indexHtml.push('                var j = Math.floor(Math.random() * (i + 1));');
    indexHtml.push('                var temp = array[i];');
    indexHtml.push('                array[i] = array[j];');
    indexHtml.push('                array[j] = temp;');
    indexHtml.push('            }');
    indexHtml.push('            return array;');
    indexHtml.push('        }');
    indexHtml.push('');
    indexHtml.push('        // 2. 頁面載入時：新品自動置頂 30 天 → 手動置頂 → 其餘隨機');
    indexHtml.push('        document.addEventListener("DOMContentLoaded", function() {');
    indexHtml.push('            var container = document.getElementById("product-list");');
    indexHtml.push('            if (!container) return;');
    indexHtml.push('            var newCards = Array.from(container.querySelectorAll(".product-card[data-new=\'true\']"));');
    indexHtml.push('            var pinnedCards = Array.from(container.querySelectorAll(".product-card[data-pinned=\'true\']:not([data-new=\'true\'])"));');
    indexHtml.push('            var normalCards = Array.from(container.querySelectorAll(".product-card:not([data-pinned=\'true\']):not([data-new=\'true\'])"));');
    indexHtml.push('            shuffleArray(newCards).concat(pinnedCards).concat(shuffleArray(normalCards)).forEach(function(card) {');
    indexHtml.push('                container.appendChild(card);');
    indexHtml.push('            });');
    indexHtml.push('            applyHomeImagePriority();');
    indexHtml.push('        });');
    indexHtml.push('');
    indexHtml.push('        function updateCartCount() {');
    indexHtml.push('            let cart = JSON.parse(localStorage.getItem("poponew_cart")) || {};');
    indexHtml.push('            const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);');
    indexHtml.push('            document.getElementById("cart-count").innerText = count;');
    indexHtml.push('        }');
    indexHtml.push('        updateCartCount();');
    indexHtml.push('        window.addEventListener("pageshow", updateCartCount);');
    indexHtml.push('        document.addEventListener("visibilitychange", function() {');
    indexHtml.push('            if (document.visibilityState === "visible") updateCartCount();');
    indexHtml.push('        });');

    indexHtml.push('        function filterCategory(selectedTag, btn) {');
    indexHtml.push('            const cards = document.querySelectorAll(".product-card");');
    indexHtml.push('            const buttons = document.querySelectorAll("#category-tags button");');
    indexHtml.push('            buttons.forEach(b => {');
    indexHtml.push('                b.classList.remove("bg-amber-700", "text-white");');
    indexHtml.push('                b.classList.add("bg-white", "text-stone-600");');
    indexHtml.push('            });');
    indexHtml.push('            if (btn) {');
    indexHtml.push('                btn.classList.remove("bg-white", "text-stone-600");');
    indexHtml.push('                btn.classList.add("bg-amber-700", "text-white");');
    indexHtml.push('            }');
    indexHtml.push('            cards.forEach(card => {');
    indexHtml.push('                const cardTags = card.dataset.tag ? card.dataset.tag.split(/[,，]/).map(t => t.trim()) : [];');
    indexHtml.push('                if (selectedTag === "all" || cardTags.includes(selectedTag)) {');
    indexHtml.push('                    card.style.display = "flex";');
    indexHtml.push('                } else {');
    indexHtml.push('                    card.style.display = "none";');
    indexHtml.push('                }');
    indexHtml.push('            });');
    indexHtml.push('            applyHomeImagePriority();');
    indexHtml.push('        }');
    indexHtml.push('        (function() {');
    indexHtml.push('            var layer = document.getElementById("shop-search-layer");');
    indexHtml.push('            var input = document.getElementById("shop-search-input");');
    indexHtml.push('            var box = document.getElementById("shop-search-results");');
    indexHtml.push('            var openBtn = document.getElementById("shop-search-open");');
    indexHtml.push('            var items = window.shopSearch || [];');
    indexHtml.push('            function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }');
    indexHtml.push('            function openSearch() { if (!layer) return; layer.hidden = false; layer.classList.add("is-open"); document.body.classList.add("shop-search-open"); if (input) { input.value = ""; renderSearch(""); setTimeout(function() { input.focus(); }, 40); } }');
    indexHtml.push('            function closeSearch() { if (!layer) return; layer.hidden = true; layer.classList.remove("is-open"); document.body.classList.remove("shop-search-open"); }');
    indexHtml.push('            function renderSearch(q) {');
    indexHtml.push('                q = String(q || "").trim().toLowerCase();');
    indexHtml.push('                if (!box) return;');
    indexHtml.push('                if (!q) { box.innerHTML = "<p class=\'shop-search-hint\'>輸入商品或口味，例如「伯爵柑橘」</p>"; return; }');
    indexHtml.push('                var hits = items.filter(function(p) { return (p.name + " " + p.group).toLowerCase().indexOf(q) !== -1; }).slice(0, 12);');
    indexHtml.push('                if (!hits.length) { box.innerHTML = "<p class=\'shop-search-hint\'>找不到「" + esc(q) + "」</p>"; return; }');
    indexHtml.push('                box.innerHTML = hits.map(function(p) {');
    indexHtml.push('                    var extra = p.soldOut ? "<span class=\'shop-search-sold\'>已售完</span>" : (window.shopPriceHtml ? window.shopPriceHtml(p.price) : ("NT$ " + p.price));');
    indexHtml.push('                    var meta = (p.group && p.group !== p.name) ? (esc(p.group) + " · " + extra) : extra;');
    indexHtml.push('                    return "<a class=\'shop-search-item\' href=\'" + esc(p.url) + "\'><span class=\'shop-search-name\'>" + esc(p.name) + "</span><span class=\'shop-search-meta\'>" + meta + "</span></a>";');
    indexHtml.push('                }).join("");');
    indexHtml.push('            }');
    indexHtml.push('            if (openBtn) openBtn.addEventListener("click", openSearch);');
    indexHtml.push('            var closeBtn = document.getElementById("shop-search-close");');
    indexHtml.push('            var backdrop = document.getElementById("shop-search-backdrop");');
    indexHtml.push('            if (closeBtn) closeBtn.addEventListener("click", closeSearch);');
    indexHtml.push('            if (backdrop) backdrop.addEventListener("click", closeSearch);');
    indexHtml.push('            if (input) input.addEventListener("input", function() { renderSearch(input.value); });');
    indexHtml.push('            document.addEventListener("keydown", function(e) { if (e.key === "Escape" && layer && !layer.hidden) closeSearch(); });');
    indexHtml.push('        })();');
    indexHtml.push('    <\/script>');

    indexHtml.push('    <script>');
    indexHtml.push('        (function() {');
    indexHtml.push('            var lb = document.createElement("div");');
    indexHtml.push('            lb.className = "fixed inset-0 bg-black/80 z-[100] flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-300 backdrop-blur-sm";');
    indexHtml.push('            lb.innerHTML = "<img id=\'lb-img\' class=\'max-w-[90vw] max-h-[85vh] rounded-2xl shadow-2xl transform scale-95 transition-all duration-300\'>";');
    indexHtml.push('            lb.onclick = function() { lb.classList.add("opacity-0", "pointer-events-none"); lb.querySelector("img").classList.add("scale-95"); };');
    indexHtml.push('            document.body.appendChild(lb);');
    indexHtml.push('            window.openFlavorLightbox = function(src) {');
    indexHtml.push('                var img = document.getElementById("lb-img"); if (window.shopSetPictureSrc) window.shopSetPictureSrc(img, src); else img.src = src;');
    indexHtml.push('                lb.classList.remove("opacity-0", "pointer-events-none");');
    indexHtml.push('                setTimeout(function() { img.classList.remove("scale-95"); }, 10);');
    indexHtml.push('            };');
    indexHtml.push('        })();');
    indexHtml.push('    <\/script>');

    // 回到頂端按鈕
    indexHtml.push('    <!-- 回到頂端按鈕 -->');
    indexHtml.push('    <button id="back-to-top" onclick="window.scrollTo({top: 0, behavior: \'smooth\'})" class="fixed bottom-6 right-6 z-50 bg-amber-800/90 hover:bg-amber-800 text-white w-11 h-11 rounded-full shadow-lg border border-amber-600/30 flex items-center justify-center opacity-0 pointer-events-none transition-all duration-300 hover:scale-110 active:scale-95">');
    indexHtml.push('        <span class="text-lg font-bold">▲</span>');
    indexHtml.push('    </button>');

    indexHtml.push('    <script>');
    indexHtml.push('        // 監聽滾動事件，超過 300px 才浮現「回到頂端」按鈕');
    indexHtml.push('        window.addEventListener("scroll", function() {');
    indexHtml.push('            var btn = document.getElementById("back-to-top");');
    indexHtml.push('            if (btn) {');
    indexHtml.push('                if (window.scrollY > 300) {');
    indexHtml.push('                    btn.classList.remove("opacity-0", "pointer-events-none");');
    indexHtml.push('                    btn.classList.add("opacity-100");');
    indexHtml.push('                } else {');
    indexHtml.push('                    btn.classList.add("opacity-0", "pointer-events-none");');
    indexHtml.push('                    btn.classList.remove("opacity-100");');
    indexHtml.push('                }');
    indexHtml.push('            }');
    indexHtml.push('        });');
    indexHtml.push('    <\/script>');
    
        // 💡 在 indexHtml 的腳本區塊加入字級縮放函式
    indexHtml.push('    <script>');
    indexHtml.push('        let currentFontSize = parseInt(localStorage.getItem("poponew_font_size")) || 16;');
    indexHtml.push('        applyFontSize(currentFontSize);');
    indexHtml.push('        function changeFontSize(delta) {');
    indexHtml.push('            currentFontSize = Math.min(Math.max(currentFontSize + delta * 2, 14), 22);');
    indexHtml.push('            applyFontSize(currentFontSize);');
    indexHtml.push('        }');
    indexHtml.push('        function resetFontSize() {');
    indexHtml.push('            currentFontSize = 16;');
    indexHtml.push('            applyFontSize(currentFontSize);');
    indexHtml.push('        }');
    indexHtml.push('        function applyFontSize(size) {');
    indexHtml.push('            document.documentElement.style.fontSize = "16px";');
    indexHtml.push('            localStorage.setItem("poponew_font_size", size);');
    indexHtml.push('            var scale = (parseInt(size, 10) || 16) / 16;');
    indexHtml.push('            document.querySelectorAll(".font-zoom").forEach(function(el) { el.style.zoom = scale === 1 ? "" : String(scale); });');
    indexHtml.push('        }');
    indexHtml.push('        (function() {');
    indexHtml.push('            function fitHomeBrand() {');
    indexHtml.push('                var el = document.getElementById("home-nav-brand");');
    indexHtml.push('                if (!el) return;');
    indexHtml.push('                var max = 20, min = 12;');
    indexHtml.push('                el.style.fontSize = max + "px";');
    indexHtml.push('                if (el.scrollWidth <= el.clientWidth) return;');
    indexHtml.push('                var lo = min, hi = max, best = min;');
    indexHtml.push('                while (hi - lo > 0.2) {');
    indexHtml.push('                    var mid = (lo + hi) / 2;');
    indexHtml.push('                    el.style.fontSize = mid + "px";');
    indexHtml.push('                    if (el.scrollWidth <= el.clientWidth) { best = mid; lo = mid; }');
    indexHtml.push('                    else { hi = mid; }');
    indexHtml.push('                }');
    indexHtml.push('                el.style.fontSize = best + "px";');
    indexHtml.push('            }');
    indexHtml.push('            window.addEventListener("resize", fitHomeBrand);');
    indexHtml.push('            if (document.readyState === "complete") fitHomeBrand();');
    indexHtml.push('            else window.addEventListener("load", fitHomeBrand);');
    indexHtml.push('            fitHomeBrand();');
    indexHtml.push('        })();');
    indexHtml.push('    <\/script>');
    indexHtml.push(lineModalScriptTag());
    indexHtml.push('    <script src="js/cart-sync.js"><\/script>');
    indexHtml.push('<\/body>');
    indexHtml.push('<\/html>');

            return indexHtml.join('\n');
        }

// 商品頁樣板（與 admin.html 的 buildSinglePageText 同步）
function buildSinglePageText(groupName, url, img, desc, items, allPriceItems, tag, isNew) {
            // 安全 HTML 轉義：只處理引號，保留 < > 讓 <br/> 可以正常執行換行
            function escapeHtml(str) {
                if (!str) return "";
                return String(str)
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#39;");
            }

            function escapeText(str) {
                if (!str) return "";
                return String(str)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#39;");
            }

            function flavorRowHtml(p) {
                var rawName = escapeText(String(p.name || "").trim());
                var rawNote = String(p.note || "").replace(/"/g, "").replace(/&quot;/g, "").trim();
                var noteHtml = rawNote ? ' <span class="text-xs text-amber-600 font-semibold bg-amber-100/60 px-1.5 py-0.5 rounded-md ml-1">' + escapeText(rawNote) + '</span>' : '';
                var isOutOfStock = !!(p.soldOut) || (rawNote && (rawNote.indexOf("缺貨") !== -1 || rawNote.indexOf("售完") !== -1));
                var pid = parseInt(p.id, 10) || 0;
                var actionHtml = isOutOfStock
                    ? soldOutBadgeHtml()
                    : '<div class="flex items-center gap-3"><button type="button" onclick="updateQty(' + pid + ', -1)" class="w-8 h-8 rounded-lg border bg-white flex items-center justify-center font-bold shadow-sm hover:bg-stone-50 active:scale-95">-</button><input type="number" id="qty-' + pid + '" value="0" min="0" readonly class="w-6 text-center bg-transparent font-bold text-stone-800"><button type="button" onclick="updateQty(' + pid + ', 1)" class="w-8 h-8 rounded-lg border bg-white flex items-center justify-center font-bold shadow-sm hover:bg-stone-50 active:scale-95">+</button></div>';
                var cleanWeight = String(p.weight || "").replace(/"/g, "").replace(/&quot;/g, "").replace(/g/gi, "").trim();
                var weightHtml = cleanWeight ? '<p class="text-xs text-stone-400">約 ' + escapeText(cleanWeight) + 'g</p>' : '';
                var price = parseInt(p.price, 10) || 0;
                return '<div class="p-4 bg-stone-50 rounded-xl border border-stone-200 hover:border-amber-200 transition space-y-2" data-product-id="' + pid + '">' +
                    '<h3 class="font-medium text-stone-800 text-sm w-full mb-1">' + rawName + noteHtml + '</h3>' +
                    '<div class="flex justify-between items-center w-full">' +
                    '<div class="flex gap-3 items-center" id="product-info-left-' + pid + '">' +
                    '<div>' + weightHtml + '<p class="text-sm text-amber-700 font-semibold mt-0.5" data-shop-price="' + price + '">NT$ ' + price + '</p></div></div>' +
                    actionHtml + '</div></div>';
            }

            var cleanGroupName = escapeHtml(groupName);
            var cleanDesc = formatDescHtml(desc);

            var pageTitle = cleanGroupName + '線上訂購 - ' + shopBrand();
            var intro = clipMetaText(desc, 80);
            var pageDesc = intro
                ? (plainMetaText(groupName) + '。' + intro + '｜' + shopBrand())
                : (plainMetaText(groupName) + '線上訂購，手工現做｜' + shopBrand());
            if (pageDesc.length > 120) pageDesc = clipMetaText(pageDesc, 110);

            var h = [];
            h.push('<!DOCTYPE html>');
            h.push('<html lang="zh-TW">');
            h.push('<head>');
            h.push('    <meta charset="UTF-8">');
            h.push('    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
            gaTagLines().forEach(function(line) { h.push(line); });
            h.push('    <title>' + pageTitle + '<\/title>');
            seoMetaLines(pageTitle, pageDesc, img).forEach(function(line) { h.push(line); });
            h.push('    <link rel="stylesheet" href="css/tailwind.css">');
            h.push('    <script src="js/shop-settings.js"><\/script>');
            h.push('    <script>');
            h.push('        window.products = ' + JSON.stringify(items, null, 4) + ';');
            
            var lookup = {};
            (allPriceItems || items).forEach(function(p) { lookup[p.id] = p.price; });
            h.push('        window.allProductsLookup = ' + JSON.stringify(lookup) + ';');
            h.push('    <\/script>');
            
            h.push('    <style>');
            h.push('        @font-face { font-family: "poponew"; src: url("fonts/poponew.woff2") format("woff2"); font-weight: bold; font-style: normal; font-display: swap; }');
            h.push('        .brand-mark { font-family: "poponew", sans-serif; }');
            h.push('        .flavor-img-box { width: 50px; height: 50px; background-color: #f5f5f4; border-radius: 0.75rem; overflow: hidden; flex-shrink: 0; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); cursor: zoom-in; }');
            h.push('        .flavor-img-box img { width: 50px; height: 50px; object-fit: cover; }');
            h.push('        .flavor-lb-panel { position: relative; display: flex; flex-direction: column; align-items: center; max-width: 90vw; max-height: 92vh; cursor: default; }');
            h.push('        .flavor-lb-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; align-self: stretch; width: 100%; box-sizing: border-box; margin: 0 0 0.7rem; padding: 0 3.3rem; }');
            h.push('        .flavor-lb-title { margin: 0; min-width: 0; color: #fff; font-weight: 700; font-size: 0.95rem; letter-spacing: 0.02em; background: rgba(120,53,15,0.92); border: 1px solid rgba(245,158,11,0.35); padding: 0.4rem 1rem; border-radius: 999px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }');
            h.push('        .flavor-lb-close { flex-shrink: 0; width: 2.85rem; height: 2.85rem; padding: 0; border: none; border-radius: 0; color: rgba(255,255,255,0.3); background: transparent; box-shadow: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transform: translateX(-5px); }');
            h.push('        .flavor-lb-close:hover { color: rgba(255,255,255,0.85); background: transparent; }');
            h.push('        .flavor-lb-close:active { transform: translateX(-5px) scale(0.96); }');
            h.push('        .flavor-lb-close svg { width: 2.85rem; height: 2.85rem; display: block; filter: none; }');
            h.push('        .flavor-lb-stage { position: relative; display: flex; align-items: center; justify-content: center; gap: 0.45rem; width: auto; max-width: 94vw; }');
            h.push('        .flavor-lb-stage > img { max-width: calc(90vw - 7.2rem); }');
            h.push('        .flavor-lb-nav { flex-shrink: 0; position: static; transform: none; z-index: 2; width: 2.85rem; height: 2.85rem; padding: 0; border: none; border-radius: 0; color: rgba(255,255,255,0.5); background: transparent; box-shadow: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }');
            h.push('        .flavor-lb-nav:hover { color: rgba(255,255,255,0.85); background: transparent; }');
            h.push('        .flavor-lb-nav:active { transform: scale(0.96); }');
            h.push('        .flavor-lb-nav svg { width: 2.85rem; height: 2.85rem; display: block; filter: none; }');
            h.push('        .flavor-lb-nav[hidden] { display: none !important; }');
            h.push('        .flavor-lb-prev { left: auto; }');
            h.push('        .flavor-lb-next { right: auto; }');
            h.push('        .flavor-lb-hint { display: none; margin: 0.55rem 0 0; color: rgba(255,255,255,0.88); font-size: 0.8rem; letter-spacing: 0.04em; text-align: center; opacity: 0; transition: opacity 0.35s ease; pointer-events: none; }');
            h.push('        .flavor-lb-hint.is-on { opacity: 1; }');
            h.push('        @media (max-width: 768px), (hover: none) and (pointer: coarse) {');
            h.push('            .flavor-lb-nav { display: none !important; }');
            h.push('            .flavor-lb-hint { display: block; opacity: 1; }');
            h.push('            .flavor-lb-stage > img { max-width: 90vw; }');
            h.push('            .flavor-lb-bar { padding: 0; }');
            h.push('        }');
            h.push('        .flavor-lb-cart { position: relative; margin-top: 0.85rem; width: 100%; display: flex; justify-content: center; align-items: center; background: transparent; }');
            h.push('        .flavor-lb-qty-anchor { position: relative; }');
            h.push('        .flavor-lb-qtybox { display: flex; flex-direction: row; align-items: center; height: 2.5rem; background: rgba(255,255,255,0.8); border-radius: 0.75rem; padding: 0 0.5rem; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }');
            h.push('        .flavor-lb-price { position: absolute; right: 100%; top: 50%; transform: translateY(-50%); margin: 0 0.5rem 0 0; display: flex; align-items: center; height: 2.5rem; font-size: 0.875rem; font-weight: 700; color: #1c1917; background: rgba(255,255,255,0.8); border: none; border-radius: 0.75rem; padding: 0 0.75rem; line-height: 1; white-space: nowrap; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }');
            h.push('        .allergen-note { margin-top: 0.75rem; font-size: 0.75rem; line-height: 1.6; color: #78716c; }');
            h.push('        .allergen-note a { font-weight: 600; color: #b45309; text-decoration: underline; text-underline-offset: 2px; }');
            h.push('        .product-title-row { display: flex; align-items: flex-start; gap: 0.2em; min-width: 0; margin-bottom: 0.5rem; }');
            h.push('        .product-page-title { font-weight: 700; color: #44403c; line-height: 1.25; white-space: nowrap; overflow: hidden; min-width: 0; flex: 1; font-size: clamp(0.9rem, 5.4vw, 1.5rem); }');
            h.push('        .card-new-mark { font-family: ui-sans-serif, system-ui, sans-serif; color: #b45309; font-weight: 700; font-size: 0.75rem; line-height: 1; flex-shrink: 0; white-space: nowrap; }');
            h.push('        .product-nav-brand { white-space: nowrap; font-size: clamp(0.95rem, 4.4vw, 1.25rem); }');
            h.push('    <\/style>');
            
            h.push('<\/head>');
            h.push('<body class="bg-stone-50 text-stone-800 font-sans min-h-screen pb-24">');
            h.push('    <div class="max-w-2xl mx-auto bg-white shadow-md md:rounded-2xl my-0 md:my-8">');
            
            h.push('        <div class="relative p-4 flex justify-between items-center border-b sticky top-0 bg-white/90 backdrop-blur-md z-40 md:rounded-t-2xl">');
            h.push('            <a href="index.html" class="brand-mark product-nav-brand text-amber-800 font-bold leading-tight min-w-0">Poponew手做甜點<\/a>');
            h.push('            <div class="flex items-center gap-2">');
            h.push('                <a href="cart.html" class="bg-amber-700 hover:bg-amber-800 text-white font-medium py-1.5 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-sm text-sm">🛒 購物車 (<span id="cart-count">0<\/span>)<\/a><br/>');         
            h.push('            <\/div>');
            
            h.push('            <div class="absolute top-[calc(100%+10px)] right-4 flex items-center bg-white/95 backdrop-blur-md rounded-xl p-1 border border-stone-200 shadow-md z-30">');
            h.push('                <button type="button" onclick="changeFontSize(-1)" title="縮小字型" class="w-8 h-7 flex items-center justify-center text-xs font-bold text-stone-600 hover:bg-stone-100 hover:text-amber-800 rounded-lg transition active:scale-95">A-<\/button>');
            h.push('                <button type="button" onclick="resetFontSize()" title="重設字型" class="px-2 h-7 flex items-center justify-center text-xs font-medium text-stone-400 hover:text-amber-800 transition">預設<\/button>');
            h.push('                <button type="button" onclick="changeFontSize(1)" title="放大字型" class="w-8 h-7 flex items-center justify-center text-sm font-bold text-stone-700 hover:bg-stone-100 hover:text-amber-800 rounded-lg transition active:scale-95">A+<\/button>');
            h.push('            <\/div>');
            h.push('        <\/div>');
            
            h.push('        <div id="product-gallery" class="w-full min-w-full aspect-square flex items-center justify-center bg-stone-100 shrink-0 relative overflow-hidden">');
            h.push('            <picture>');
            h.push('                <source id="product-gallery-webp" type="image/webp" srcset="' + String(img || "").replace(/\.jpe?g$/i, ".webp") + '">');
            h.push('                <img id="product-gallery-img" src="' + img + '" alt="' + cleanGroupName + '" class="w-full h-full object-cover" draggable="false">');
            h.push('            </picture>');
            h.push('            <button type="button" id="product-gallery-prev" hidden class="hidden absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 text-stone-800 shadow-md border border-stone-200 flex items-center justify-center text-2xl leading-none hover:bg-white active:scale-95" aria-label="上一張">&#8249;<\/button>');
            h.push('            <button type="button" id="product-gallery-next" hidden class="hidden absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 text-stone-800 shadow-md border border-stone-200 flex items-center justify-center text-2xl leading-none hover:bg-white active:scale-95" aria-label="下一張">&#8250;<\/button>');
            h.push('        <\/div>');
            
            h.push('        <div class="p-6">');
            h.push('            <div class="mb-6">');
            h.push('                <div class="product-title-row">');
            if (isNew) h.push('                    <span class="card-new-mark">【新品】<\/span>');
            h.push('                    <h1 id="product-page-title" class="product-page-title">' + cleanGroupName + '<\/h1>');
            h.push('                <\/div>');
            var guideTags = String(tag || "").split(/[,，]/).map(function(t) { return t.trim(); });
            function hasGuideTag(name) { return guideTags.indexOf(name) !== -1; }
            var keepHref = "keep.html#cookie";
            var keepLabel = "本商品保存與享用方式";
            if (hasGuideTag("手作司康")) { keepHref = "keep.html#scone"; }
            else if (hasGuideTag("巴斯克乳酪蛋糕")) { keepHref = "keep.html#basque"; }
            else if (hasGuideTag("生乳捲")) { keepHref = "keep.html#roll"; }
            else if (hasGuideTag("人氣單品")) { keepHref = "keep.html#popular"; }
            function keepMarkPhrase(groupName) {
                var n = String(groupName || "");
                if (n.indexOf("巴斯克") !== -1) return "巴斯克乳酪蛋糕系列";
                if (n.indexOf("迷你小司康") !== -1 || n.indexOf("小歪歪") !== -1) return "一口司康";
                if (n.indexOf("奶酪") !== -1 && n.indexOf("司康") !== -1) return "奶酪司康";
                if (n.indexOf("司康") !== -1) return "手作司康系列";
                if (n.indexOf("生乳捲") !== -1 || n.indexOf("生乳卷") !== -1) return "生乳捲";
                if (n.indexOf("美式軟餅乾") !== -1) return "美式軟餅乾";
                if (n.indexOf("列日") !== -1 || n.indexOf("鬆餅") !== -1) return "比利時鬆餅";
                if (n.indexOf("布列塔尼") !== -1) return "布列塔尼";
                if (n.indexOf("恐龍") !== -1) return "恐龍寶貝蛋";
                if (n.indexOf("奶油") !== -1) return "奶油酥餅";
                if (n.indexOf("檸檬") !== -1 || n.indexOf("夾心") !== -1) return "奶酪夾心餅乾";
                if (n.indexOf("小煤炭") !== -1) return "小煤炭布朗尼餅乾";
                if (n.indexOf("費南雪") !== -1 || n.indexOf("瑪德蓮") !== -1) return "費南雪";
                if (n.indexOf("可可三明治") !== -1) return "可可三明治蛋糕";
                if (n.indexOf("布朗尼球") !== -1) return "布朗尼球球";
                if (n.indexOf("布朗尼") !== -1) return "布朗尼生巧克力";
                if (n.indexOf("棒棒糖") !== -1 || n.indexOf("Lotus") !== -1 || n.indexOf("蓮花") !== -1) return "棒棒糖蛋糕";
                if (n.indexOf("藍莓") !== -1) return "藍莓Oreo";
                if (n.indexOf("雙色") !== -1) return "雙色乳酪球";
                if (n.indexOf("海鹽") !== -1) return "海鹽生乳酪";
                if (n.indexOf("乳酪球") !== -1) return "Oreo乳酪球";
                if (n.indexOf("肉桂") !== -1 || n.indexOf("蘋果核桃") !== -1) return "肉桂焦糖蘋果核桃起司蛋糕";
                return n;
            }
            var keepMark = keepMarkPhrase(cleanGroupName);
            if (keepMark) {
                var hashAt = keepHref.indexOf("#");
                var hash = hashAt >= 0 ? keepHref.slice(hashAt) : "";
                if (hashAt >= 0) keepHref = keepHref.slice(0, hashAt);
                keepHref += "?mark=" + encodeURIComponent(keepMark) + hash;
            }
            h.push('                <div class="font-zoom">');
            h.push('                <p class="text-stone-500 text-sm leading-relaxed">' + cleanDesc + '<\/p>');
            h.push('                ' + productAllergenNoteHtml());
            h.push('                <p class="mt-3"><a href="' + keepHref + '" class="text-sm font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2">' + keepLabel + '<\/a></p>');
            h.push('                <\/div>');
            h.push('            <\/div>');
            h.push('            <div id="cookie-list" class="space-y-3 mb-8">');
            (items || []).forEach(function(p) {
                h.push('                ' + flavorRowHtml(p));
            });
            h.push('            <\/div>');
            
            h.push('            <div class="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex justify-between items-center flex-wrap gap-4 shadow-sm">');
            h.push('                <div class="flex flex-col">');
            h.push('                    <span class="text-xs font-semibold text-amber-700 block mb-0.5">目前訂單累計總額 (包含其他商品)<\/span>');
            h.push('                    <span class="text-3xl font-extrabold text-amber-700">NT$ <span id="entire-cart-total">0<\/span><\/span>');
            h.push('                    <p id="free-shipping-tip" class="text-xs font-medium text-stone-500 mt-1"><\/p>');
            h.push('                    <p id="bulk-order-tip" class="hidden text-xs font-medium text-red-600 mt-1"><\/p>');
            h.push('                    <p id="cod-limit-tip" class="hidden text-xs font-medium text-amber-800 mt-1"><\/p>');
            h.push('                <\/div>');
            h.push('                <button onclick="saveToCartAndGo()" class="h-12 px-6 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-xl transition shadow-md flex items-center justify-center gap-1 active:scale-95 text-xm h-auto md:h-12">前往結帳<\/button>');
            h.push('            <\/div>');
            h.push('        <\/div>');
            h.push('    <\/div>');

            h.push('    <div class="max-w-2xl mx-auto bg-white shadow-md md:rounded-2xl mt-3 md:-mt-3 p-5 md:p-6 flex items-center gap-4 md:gap-5 border border-stone-100">');

            h.push('        <div>');
            h.push('            <h4 class="font-bold text-amber-700 text-sm md:text-base mb-1">Poponew手做甜點<\/h4>');
            h.push('            ' + shopContactLineHtml());
            h.push('            ' + shopFooterPolicyHtml());
            h.push('        <\/div>');
            h.push('    <\/div>');
            h.push('    <p class="text-center text-stone-400 text-[10px] md:text-[11px] py-6">Copyright &copy; 2026 Poponew. All rights reserved.<\/p>');

            h.push('    <script>');
            h.push('        function shop() { var s = window.shopSettings || {}; return { shippingFee: parseInt(s.shippingFee,10)||80, freeShipping: parseInt(s.freeShipping,10)||1500, minOrder: parseInt(s.minOrder,10)||500, codLimit: parseInt(s.codLimit,10)||2000, bulkOrder: parseInt(s.bulkOrder,10)||5000 }; }');
            h.push('        var cart = JSON.parse(localStorage.getItem("poponew_cart")) || {};');
            h.push('        var container = document.getElementById("cookie-list");');
            h.push('        if (container && !container.querySelector("[data-product-id]")) {');
            h.push('        window.products.forEach(function(p) {');
            h.push('            var currentQty = cart[p.id] || 0;');
            h.push('            var itemDiv = document.createElement("div");');
            
            h.push('            var rawName = String(p.name || "").replace(/"/g, "").replace(/&quot;/g, "").trim();');
            h.push('            var rawNote = String(p.note || "").replace(/"/g, "").replace(/&quot;/g, "").trim();');
            h.push('            var noteHtml = rawNote ? " <span class=\'text-xs text-amber-600 font-semibold bg-amber-100/60 px-1.5 py-0.5 rounded-md ml-1\'>" + rawNote + "<\/span>" : "";');
            
            h.push('            var isOutOfStock = !!(p.soldOut) || (rawNote && (rawNote.indexOf("缺貨") !== -1 || rawNote.indexOf("售完") !== -1));');
            h.push('            var actionHtml = isOutOfStock ? "' + soldOutBadgeHtml(true).replace(/'/g, "\\'") + '" : "<div class=\'flex items-center gap-3\'><button type=\'button\' onclick=\'updateQty(" + p.id + ", -1)\' class=\'w-8 h-8 rounded-lg border bg-white flex items-center justify-center font-bold shadow-sm hover:bg-stone-50 active:scale-95\'>-<\/button><input type=\'number\' id=\'qty-" + p.id + "\' value=\'" + currentQty + "\' min=\'0\' readonly class=\'w-6 text-center bg-transparent font-bold text-stone-800\'><button type=\'button\' onclick=\'updateQty(" + p.id + ", 1)\' class=\'w-8 h-8 rounded-lg border bg-white flex items-center justify-center font-bold shadow-sm hover:bg-stone-50 active:scale-95\'>+<\/button><\/div>";');
            
            h.push('            itemDiv.className = "p-4 bg-stone-50 rounded-xl border border-stone-200 hover:border-amber-200 transition space-y-2";');
            h.push('            itemDiv.setAttribute("data-product-id", p.id);');
            
            h.push('            var cleanWeight = String(p.weight || "").replace(/"/g, "").replace(/&quot;/g, "").replace(/g/gi, "").trim();');
            h.push('            var weightHtml = cleanWeight ? "<p class=\'text-xs text-stone-400\'>約 " + cleanWeight + "g<\/p>" : "";');
            
            h.push('            itemDiv.innerHTML = "<h3 class=\'font-medium text-stone-800 text-sm w-full mb-1\'>" + rawName + noteHtml + "<\/h3><div class=\'flex justify-between items-center w-full\'><div class=\'flex gap-3 items-center\' id=\'product-info-left-" + p.id + "\'><div>" + weightHtml + "<p class=\'text-sm text-amber-700 font-semibold mt-0.5\' data-shop-price=\'" + p.price + "\'>NT$ " + p.price + "<\/p><\/div><\/div>" + actionHtml + "<\/div>";');           
            h.push('            container.appendChild(itemDiv);');
            h.push('        });');
            h.push('        }');

            h.push('        function updateQty(id, change) { var input = document.getElementById("qty-" + id); var currentQty = parseInt(input && input.value, 10) || 0; currentQty = Math.max(0, currentQty + change); if (currentQty > 20) { currentQty = 20; alert("單品數量上限為20"); } if (input) input.value = currentQty; if (currentQty === 0) { delete cart[id]; } else { cart[id] = currentQty; } localStorage.setItem("poponew_cart", JSON.stringify(cart)); calculatePageTotal(); updateCartCount(); if (window.syncFlavorLightboxQty) window.syncFlavorLightboxQty(); }');
            
            h.push('        function calculatePageTotal() { var cfg = shop(); var entireCartTotal = 0; for (var id in cart) { entireCartTotal += (window.shopSalePrice ? window.shopSalePrice(window.allProductsLookup[id] || 0) : (window.allProductsLookup[id] || 0)) * cart[id]; } document.getElementById("entire-cart-total").innerText = entireCartTotal; var tipElement = document.getElementById("free-shipping-tip"); if (entireCartTotal === 0) { tipElement.innerText = "⚠️ 本商店最低結帳金額為 NT$ " + cfg.minOrder + " 元唷！"; } else if (entireCartTotal >= cfg.freeShipping) { tipElement.innerHTML = "<span class=\'text-green-600 font-bold text-sm\'>🎉 全店已達免運費門檻！直接結帳超划算！<\/span>"; } else { tipElement.innerText = "還差" + (cfg.freeShipping - entireCartTotal) + " 元就免運啦！"; } var bulkTip = document.getElementById("bulk-order-tip"); if (bulkTip) { if (entireCartTotal > cfg.bulkOrder) { bulkTip.classList.remove("hidden"); bulkTip.innerText = "您的訂購數量較大，屬於大宗/企業訂單。為了保障您的權益與確認出貨檔期，請直接透過網站下方聯絡方式聯繫我們由專人為您服務！"; } else { bulkTip.classList.add("hidden"); bulkTip.innerText = ""; } } var codTip = document.getElementById("cod-limit-tip"); if (codTip) { if (entireCartTotal > cfg.codLimit) { codTip.classList.remove("hidden"); codTip.innerText = "單筆滿 NT$ " + cfg.codLimit.toLocaleString() + " 不提供貨到付款，結帳時請改用轉帳匯款。"; } else { codTip.classList.add("hidden"); codTip.innerText = ""; } } }'); 
            
            h.push('        function saveToCartAndGo() { var cfg = shop(); var entireCartTotal = 0; for (var id in cart) { entireCartTotal += (window.shopSalePrice ? window.shopSalePrice(window.allProductsLookup[id] || 0) : (window.allProductsLookup[id] || 0)) * cart[id]; } if (entireCartTotal === 0) { alert("您目前尚未選擇任何數量唷！"); return; } if (entireCartTotal < cfg.minOrder) { alert("抱歉！本商店最低結帳金額為 NT$ " + cfg.minOrder + " 元，目前綜合累計為 NT$ " + entireCartTotal + " 元，請再多選購一些甜點唷！"); return; } localStorage.setItem("poponew_cart", JSON.stringify(cart)); window.location.href = "cart.html"; }');
            
            h.push('        function updateCartCount() { var count = 0; for (var id in cart) { count += cart[id]; } document.getElementById("cart-count").innerText = count; }');
            h.push('        calculatePageTotal(); updateCartCount();');
            h.push('        window.addEventListener("pagehide", function() { localStorage.setItem("poponew_cart", JSON.stringify(cart)); });');
            h.push('        window.addEventListener("pageshow", function() { cart = JSON.parse(localStorage.getItem("poponew_cart")) || {}; if (window.products) { window.products.forEach(function(p) { var input = document.getElementById("qty-" + p.id); if (input) input.value = cart[p.id] || 0; }); } calculatePageTotal(); updateCartCount(); if (window.syncFlavorLightboxQty) window.syncFlavorLightboxQty(); });');
            
            h.push('        (function() {');
            h.push('            var imgEl = document.getElementById("product-gallery-img");');
            h.push('            var prevBtn = document.getElementById("product-gallery-prev");');
            h.push('            var nextBtn = document.getElementById("product-gallery-next");');
            h.push('            if (!imgEl || !prevBtn || !nextBtn) return;');
            h.push('            var first = imgEl.getAttribute("src") || "";');
            h.push('            var urls = first ? [first] : [];');
            h.push('            var index = 0;');
            h.push('            function show(i) { if (!urls.length) return; index = (i + urls.length) % urls.length; if (window.shopSetPictureSrc) window.shopSetPictureSrc(imgEl, urls[index]); else imgEl.src = urls[index]; }');
            h.push('            function reveal() { if (urls.length < 2) return; prevBtn.hidden = false; nextBtn.hidden = false; prevBtn.classList.remove("hidden"); nextBtn.classList.remove("hidden"); }');
            h.push('            prevBtn.addEventListener("click", function() { show(index - 1); });');
            h.push('            nextBtn.addEventListener("click", function() { show(index + 1); });');
            h.push('            function candidate(n) {');
            h.push('                var q = first.split("?")[0];');
            h.push('                var dot = q.lastIndexOf(".");');
            h.push('                var slash = q.lastIndexOf("/");');
            h.push('                if (dot <= slash) return q + "_" + n;');
            h.push('                return q.slice(0, dot) + "_" + n + q.slice(dot);');
            h.push('            }');
            h.push('            function probe(n) {');
            h.push('                if (n > 8) { reveal(); return; }');
            h.push('                var url = candidate(n);');
            h.push('                var tester = new Image();');
            h.push('                tester.onload = function() { urls.push(url); probe(n + 1); };');
            h.push('                tester.onerror = function() { reveal(); };');
            h.push('                tester.src = url;');
            h.push('            }');
            h.push('            if (first) probe(2);');
            h.push('        })();');
            h.push('        (function() {');
            h.push('            var gallery = [];');
            h.push('            var lbIndex = 0;');
            h.push('            function isMobileFlavorView() {');
            h.push('                return window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(pointer: coarse)").matches;');
            h.push('            }');
            h.push('            function flavorOrder(id) {');
            h.push('                for (var i = 0; i < window.products.length; i++) { if (Number(window.products[i].id) === Number(id)) return i; }');
            h.push('                return 9999;');
            h.push('            }');
            h.push('            function isFlavorOut(p) {');
            h.push('                var rawNote = String((p && p.note) || "").replace(/"/g, "").replace(/&quot;/g, "").trim();');
            h.push('                return !!(p && p.soldOut) || (rawNote && (rawNote.indexOf("缺貨") !== -1 || rawNote.indexOf("售完") !== -1));');
            h.push('            }');
            h.push('            function findProduct(id) {');
            h.push('                for (var i = 0; i < window.products.length; i++) { if (Number(window.products[i].id) === Number(id)) return window.products[i]; }');
            h.push('                return null;');
            h.push('            }');
            h.push('            window.products.forEach(function(p) {');
            h.push('                var imgUrl = "images/thumb/" + p.id + ".jpg";');
            h.push('                var imgTester = new Image();');
            h.push('                imgTester.onload = function() {');
            h.push('                    var targetLeftPart = document.getElementById("product-info-left-" + p.id);');
            h.push('                    if (targetLeftPart) {');
            h.push('                        var imgBox = document.createElement("div");');
            h.push('                        imgBox.className = "flavor-img-box";');
            h.push('                        var safeName = String(p.name || "").replace(/"/g, "").replace(/&quot;/g, "").replace(/\'/g, "\\\\\'").trim();');
            h.push('                        imgBox.innerHTML = window.shopPictureHtml ? window.shopPictureHtml(imgUrl, "alt=\'" + safeName + "\'") : ("<img src=\'" + imgUrl + "\' alt=\'" + safeName + "\'>");');
            h.push('                        imgBox.addEventListener("click", function(e) { e.preventDefault(); window.openFlavorLightbox(p.id); });');
            h.push('                        targetLeftPart.insertBefore(imgBox, targetLeftPart.firstChild);');
            h.push('                    }');
            h.push('                    var exists = false;');
            h.push('                    for (var i = 0; i < gallery.length; i++) { if (Number(gallery[i].id) === Number(p.id)) exists = true; }');
            h.push('                    if (!exists) gallery.push({ id: p.id, src: imgUrl, name: String(p.name || "").trim(), price: parseInt(p.price, 10) || 0 });');
            h.push('                    gallery.sort(function(a, b) { return flavorOrder(a.id) - flavorOrder(b.id); });');
            h.push('                };');
            h.push('                imgTester.src = imgUrl;');
            h.push('            });');
            h.push('            var lb = document.createElement("div");');
            h.push('            lb.id = "flavor-lightbox";');
            h.push('            lb.className = "fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 z-50 opacity-0 pointer-events-none transition-all duration-300";');
            h.push('            lb.innerHTML = "<div class=\'flavor-lb-panel\'><div class=\'flavor-lb-bar\'><p id=\'lb-title\' class=\'flavor-lb-title\'></p><button type=\'button\' id=\'lb-close\' class=\'flavor-lb-close\' aria-label=\'關閉預覽\'><svg viewBox=\'0 0 24 24\' fill=\'none\' aria-hidden=\'true\'><path d=\'M7 7l10 10M17 7L7 17\' stroke=\'currentColor\' stroke-width=\'2.2\' stroke-linecap=\'round\'/><\/svg><\/button><\/div><div class=\'flavor-lb-stage\'><button type=\'button\' id=\'lb-prev\' class=\'flavor-lb-nav flavor-lb-prev\' aria-label=\'上一個規格\'><svg viewBox=\'0 0 24 24\' fill=\'none\' aria-hidden=\'true\'><path d=\'M14.5 6.5L9 12l5.5 5.5\' stroke=\'currentColor\' stroke-width=\'2.2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/><\/svg><\/button><img id=\'lb-img\' class=\'max-w-full max-h-[62vh] rounded-2xl shadow-2xl border-4 border-white/10 transform scale-95 transition-all duration-300 object-contain\'><button type=\'button\' id=\'lb-next\' class=\'flavor-lb-nav flavor-lb-next\' aria-label=\'下一個規格\'><svg viewBox=\'0 0 24 24\' fill=\'none\' aria-hidden=\'true\'><path d=\'M9.5 6.5L15 12l-5.5 5.5\' stroke=\'currentColor\' stroke-width=\'2.2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/><\/svg><\/button><\/div><p id=\'lb-hint\' class=\'flavor-lb-hint\'>左右滑動可切換口味<\/p><div id=\'lb-cart\' class=\'flavor-lb-cart\'><div class=\'flavor-lb-qty-anchor\'><p id=\'lb-price\' class=\'flavor-lb-price\'></p><div class=\'flavor-lb-qtybox\'><div id=\'lb-qty-wrap\' class=\'flex items-center gap-2\'><button type=\'button\' id=\'lb-minus\' class=\'w-8 h-8 rounded-lg border bg-white flex items-center justify-center font-bold shadow-sm hover:bg-stone-50 active:scale-95\'>-<\/button><input type=\'number\' id=\'lb-qty\' value=\'0\' min=\'0\' readonly class=\'w-8 text-center bg-transparent font-bold text-stone-800\'><button type=\'button\' id=\'lb-plus\' class=\'w-8 h-8 rounded-lg border bg-white flex items-center justify-center font-bold shadow-sm hover:bg-stone-50 active:scale-95\'>+<\/button><\/div><p id=\'lb-soldout\' class=\'hidden text-sm font-bold text-stone-500\'>已售完<\/p><\/div><\/div><\/div><\/div>";');
            h.push('            var lbHist = false;');
            h.push('            function isLbOpen() { return !lb.classList.contains("pointer-events-none"); }');
            h.push('            function closeLb(fromPop) {');
            h.push('                if (!isLbOpen()) { lbHist = false; return; }');
            h.push('                lb.classList.add("opacity-0", "pointer-events-none");');
            h.push('                var img = document.getElementById("lb-img");');
            h.push('                if (img) img.classList.add("scale-95");');
            h.push('                if (!fromPop && lbHist) { lbHist = false; history.back(); }');
            h.push('                else lbHist = false;');
            h.push('            }');
            h.push('            lb.addEventListener("click", function(e) { if (e.target === lb) closeLb(); });');
            h.push('            document.body.appendChild(lb);');
            h.push('            document.getElementById("lb-close").addEventListener("click", function(e) { e.stopPropagation(); closeLb(); });');
            h.push('            function currentItem() { return gallery[lbIndex] || null; }');
            h.push('            function renderLbCart() {');
            h.push('                var item = currentItem();');
            h.push('                if (!item) return;');
            h.push('                document.getElementById("lb-price").innerHTML = window.shopPriceHtml ? window.shopPriceHtml(item.price) : ("NT$ " + item.price);');
            h.push('                var wrap = document.getElementById("lb-qty-wrap");');
            h.push('                var sold = document.getElementById("lb-soldout");');
            h.push('                var qtyEl = document.getElementById("lb-qty");');
            h.push('                var p = findProduct(item.id);');
            h.push('                if (isFlavorOut(p)) { wrap.classList.add("hidden"); sold.classList.remove("hidden"); }');
            h.push('                else { wrap.classList.remove("hidden"); sold.classList.add("hidden"); qtyEl.value = cart[item.id] || 0; }');
            h.push('            }');
            h.push('            function showLb(i) {');
            h.push('                if (!gallery.length) return;');
            h.push('                if (i < 0 || i >= gallery.length) return;');
            h.push('                lbIndex = i;');
            h.push('                var item = gallery[lbIndex];');
            h.push('                var img = document.getElementById("lb-img");');
            h.push('                var titleEl = document.getElementById("lb-title");');
            h.push('                if (window.shopSetPictureSrc) window.shopSetPictureSrc(img, item.src); else img.src = item.src;');
            h.push('                titleEl.innerText = item.name || "";');
            h.push('                titleEl.style.display = item.name ? "block" : "none";');
            h.push('                var desktopNav = gallery.length > 1 && !isMobileFlavorView();');
            h.push('                document.getElementById("lb-prev").hidden = !desktopNav || lbIndex === 0;');
            h.push('                document.getElementById("lb-next").hidden = !desktopNav || lbIndex === gallery.length - 1;');
            h.push('                renderLbCart();');
            h.push('            }');
            h.push('            function flashSwipeHint() {');
            h.push('                var hint = document.getElementById("lb-hint");');
            h.push('                if (!hint) return;');
            h.push('                hint.classList.remove("is-on");');
            h.push('                if (!isMobileFlavorView() || gallery.length < 2) return;');
            h.push('                hint.classList.add("is-on");');
            h.push('                clearTimeout(flashSwipeHint.t);');
            h.push('                flashSwipeHint.t = setTimeout(function() { hint.classList.remove("is-on"); }, 2600);');
            h.push('            }');
            h.push('            document.getElementById("lb-prev").addEventListener("click", function(e) { e.stopPropagation(); showLb(lbIndex - 1); });');
            h.push('            document.getElementById("lb-next").addEventListener("click", function(e) { e.stopPropagation(); showLb(lbIndex + 1); });');
            h.push('            (function() {');
            h.push('                var stage = lb.querySelector(".flavor-lb-stage");');
            h.push('                if (!stage) return;');
            h.push('                var touchX = 0, touchY = 0;');
            h.push('                stage.addEventListener("touchstart", function(e) {');
            h.push('                    var t = e.changedTouches && e.changedTouches[0];');
            h.push('                    if (!t) return;');
            h.push('                    touchX = t.clientX; touchY = t.clientY;');
            h.push('                }, { passive: true });');
            h.push('                stage.addEventListener("touchend", function(e) {');
            h.push('                    if (!isMobileFlavorView() || gallery.length < 2) return;');
            h.push('                    var t = e.changedTouches && e.changedTouches[0];');
            h.push('                    if (!t) return;');
            h.push('                    var dx = t.clientX - touchX, dy = t.clientY - touchY;');
            h.push('                    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;');
            h.push('                    if (dx < 0) showLb(lbIndex + 1); else showLb(lbIndex - 1);');
            h.push('                }, { passive: true });');
            h.push('            })();');
            h.push('            document.getElementById("lb-minus").addEventListener("click", function(e) { e.stopPropagation(); var item = currentItem(); if (item) updateQty(item.id, -1); });');
            h.push('            document.getElementById("lb-plus").addEventListener("click", function(e) { e.stopPropagation(); var item = currentItem(); if (item) updateQty(item.id, 1); });');
            h.push('            window.syncFlavorLightboxQty = function() { if (lb.classList.contains("pointer-events-none")) return; renderLbCart(); };');
            h.push('            window.openFlavorLightbox = function(id) {');
            h.push('                var idx = -1;');
            h.push('                for (var i = 0; i < gallery.length; i++) { if (Number(gallery[i].id) === Number(id)) idx = i; }');
            h.push('                if (idx < 0) return;');
            h.push('                var wasClosed = !isLbOpen();');
            h.push('                lb.classList.remove("opacity-0", "pointer-events-none");');
            h.push('                var img = document.getElementById("lb-img");');
            h.push('                img.classList.add("scale-95");');
            h.push('                showLb(idx);');
            h.push('                flashSwipeHint();');
            h.push('                setTimeout(function() { img.classList.remove("scale-95"); }, 10);');
            h.push('                if (wasClosed && !lbHist) {');
            h.push('                    try { history.pushState({ poponewLb: 1 }, ""); lbHist = true; } catch (err) {}');
            h.push('                }');
            h.push('            };');
            h.push('            window.addEventListener("popstate", function() {');
            h.push('                if (isLbOpen()) closeLb(true);');
            h.push('                else lbHist = false;');
            h.push('            });');
            h.push('            document.addEventListener("keydown", function(e) {');
            h.push('                if (lb.classList.contains("pointer-events-none")) return;');
            h.push('                if (e.key === "Escape") closeLb();');
            h.push('                if (e.key === "ArrowLeft") showLb(lbIndex - 1);');
            h.push('                if (e.key === "ArrowRight") showLb(lbIndex + 1);');
            h.push('            });');
            h.push('        })();');

            h.push('        let currentFontSize = parseInt(localStorage.getItem("poponew_font_size")) || 16;');
            h.push('        applyFontSize(currentFontSize);');
            h.push('        function changeFontSize(delta) {');
            h.push('            currentFontSize = Math.min(Math.max(currentFontSize + delta * 2, 14), 22);');
            h.push('            applyFontSize(currentFontSize);');
            h.push('        }');
            h.push('        function resetFontSize() {');
            h.push('            currentFontSize = 16;');
            h.push('            applyFontSize(currentFontSize);');
            h.push('        }');
            h.push('        function applyFontSize(size) {');
            h.push('            document.documentElement.style.fontSize = "16px";');
            h.push('            localStorage.setItem("poponew_font_size", size);');
            h.push('            var scale = (parseInt(size, 10) || 16) / 16;');
            h.push('            document.querySelectorAll(".font-zoom").forEach(function(el) { el.style.zoom = scale === 1 ? "" : String(scale); });');
            h.push('        }');
            h.push('        (function() {');
            h.push('            function fitProductTitle() {');
            h.push('                var el = document.getElementById("product-page-title");');
            h.push('                if (!el) return;');
            h.push('                var max = 24, min = 12;');
            h.push('                el.style.fontSize = max + "px";');
            h.push('                if (el.scrollWidth <= el.clientWidth) return;');
            h.push('                var lo = min, hi = max, best = min;');
            h.push('                while (hi - lo > 0.2) {');
            h.push('                    var mid = (lo + hi) / 2;');
            h.push('                    el.style.fontSize = mid + "px";');
            h.push('                    if (el.scrollWidth <= el.clientWidth) { best = mid; lo = mid; }');
            h.push('                    else { hi = mid; }');
            h.push('                }');
            h.push('                el.style.fontSize = best + "px";');
            h.push('            }');
            h.push('            window.addEventListener("resize", fitProductTitle);');
            h.push('            if (document.readyState === "complete") fitProductTitle();');
            h.push('            else window.addEventListener("load", fitProductTitle);');
            h.push('            fitProductTitle();');
            h.push('        })();');
            
            h.push('    <\/script>');
            h.push(lineModalScriptTag());
            h.push('    <script src="js/cart-sync.js"><\/script>');
            h.push('<\/body>');
            h.push('<\/html>');
            return h.join('\n');
        }

function formatKeepHtml(str) {
            if (!str) return "";
            var s = String(str);
            if (!/<[a-z!/]/i.test(s)) {
                return s
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#39;")
                    .replace(/\r\n|\r|\n/g, "<br>");
            }
            s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
            s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
            s = s.replace(/<\/?(iframe|object|embed|link|meta)\b[^>]*>/gi, "");
            s = s.replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, "");
            s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "");
            s = s.replace(/javascript\s*:/gi, "");
            s = s.replace(/([^>\s])(?:\r?\n)+/g, "$1<br>");
            return s;
        }

function buildKeepHtml(keepText) {
            function blockStart(html, phrase) {
                var at = html.indexOf(phrase);
                if (at < 0) return -1;
                var li = html.lastIndexOf("<li", at);
                var liClose = html.lastIndexOf("</li>", at);
                if (li > liClose) return li;
                return Math.max(html.lastIndexOf("<p", at), html.lastIndexOf("<h", at), html.lastIndexOf("<div", at));
            }
            function foldKeepCategories(html) {
                var folds = [
                    ["巴斯克乳酪蛋糕系列", "basque", "巴斯克乳酪蛋糕系列"],
                    ["手作司康系列", "scone", "手作司康系列"],
                    ["職人手工餅乾", "cookie", "職人手工餅乾 / 迷你一口系列"],
                    ["生乳捲系列", "roll", "生乳捲系列"],
                    ["人氣單品系列", "popular", "人氣單品系列"]
                ];
                var boundaries = ["巴斯克乳酪蛋糕系列", "手作司康系列", "職人手工餅乾", "生乳捲系列", "人氣單品系列", "夏季高溫注意", "宅配配送與簽收須知", "訂購與退換貨"].map(function(phrase) {
                    return blockStart(html, phrase);
                }).filter(function(n) { return n >= 0; }).sort(function(a, b) { return a - b; });
                var points = folds.map(function(item) {
                    return { id: item[1], title: item[2], start: blockStart(html, item[0]) };
                }).filter(function(p) { return p.start >= 0; }).sort(function(a, b) { return a.start - b.start; });
                if (!points.length) return html;
                var out = "";
                var cursor = 0;
                points.forEach(function(p) {
                    if (p.start < cursor) return;
                    out += html.slice(cursor, p.start);
                    var end = html.length;
                    for (var i = 0; i < boundaries.length; i++) {
                        if (boundaries[i] > p.start) { end = boundaries[i]; break; }
                    }
                    var inner = html.slice(p.start, end);
                    var closeAt = inner.indexOf("</p>");
                    var rest = closeAt >= 0 ? inner.slice(closeAt + 4) : inner;
                    rest = rest.replace(/^\s*(<\/li>\s*)+/i, "");
                    rest = rest.replace(/^\s*(<br\s*\/?>\s*)+/i, "");
                    out += '<details id="' + p.id + '" class="keep-fold"><summary>' + p.title + '</summary><div class="keep-fold-body">' + rest + '</div></details>';
                    cursor = end;
                });
                return out + html.slice(cursor);
            }
            function stampKeepAnchors(html) {
                var marks = [
                    ["全品項賞味指南", "guide"],
                    ["各大類商品保存與享用方式對照", "groups"],
                    ["宅配配送與簽收須知", "shipping"],
                    ["訂購與退換貨", "terms"]
                ];
                marks.forEach(function(pair) {
                    var phrase = pair[0], id = pair[1], from = 0, at = 0;
                    while ((at = html.indexOf(phrase, from)) >= 0) {
                        var start = Math.max(html.lastIndexOf("<p", at), html.lastIndexOf("<h", at));
                        var tagEnd = start >= 0 ? html.indexOf(">", start) : -1;
                        var open = start >= 0 ? html.slice(start, tagEnd) : "";
                        if (/^<h[1-6]/i.test(open) && tagEnd > start && tagEnd < at && !/\skeep-section\b/.test(open)) {
                            var idAttr = /\sid\s*=/.test(open) ? "" : ' id="' + id + '"';
                            html = html.slice(0, tagEnd) + idAttr + ' class="keep-section"' + html.slice(tagEnd);
                            break;
                        }
                        from = at + phrase.length;
                    }
                });
                return html;
            }
            var body = stampKeepAnchors(foldKeepCategories(formatKeepHtml(keepText)));
            var keepTitle = '保存及食用方式 - ' + shopBrand();
            var keepDesc = shopBrand() + '保存及食用方式與訂購退換貨說明。';
            var h = [];
            h.push('<!DOCTYPE html>');
            h.push('<html lang="zh-TW">');
            h.push('<head>');
            h.push('    <meta charset="UTF-8">');
            h.push('    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
            gaTagLines().forEach(function(line) { h.push(line); });
            h.push('    <title>' + keepTitle + '<\/title>');
            seoMetaLines(keepTitle, keepDesc, 'images/scone.jpg').forEach(function(line) { h.push(line); });
            h.push('    <link rel="stylesheet" href="css/tailwind.css">');
            h.push('    <style>');
            h.push('        @font-face { font-family: "poponew"; src: url("fonts/poponew.woff2") format("woff2"); font-weight: bold; font-style: normal; font-display: swap; }');
            h.push('        .brand-mark { font-family: "poponew", sans-serif; }');
            h.push('        .keep-body b, .keep-body strong { font-weight: 700; }');
            h.push('        .keep-body i, .keep-body em { font-style: italic; }');
            h.push('        .keep-body u { text-decoration: underline; }');
            h.push('        .keep-body h3 { font-size: 1.05rem; font-weight: 700; color: #44403c; margin: 0.85rem 0 0.3rem; }');
            h.push('        .keep-body ul { list-style: disc; padding-left: 1.25rem; margin: 0.35rem 0; }');
            h.push('        .keep-body ol { list-style: decimal; padding-left: 1.25rem; margin: 0.35rem 0; }');
            h.push('        .keep-body [id] { scroll-margin-top: 7rem; }');
            h.push('        .keep-fold { margin: 0.65rem 0; border: 1px solid #e7e5e4; border-radius: 0.85rem; background: #fafaf9; }');
            h.push('        .keep-fold summary { cursor: pointer; font-weight: 700; color: #44403c; padding: 0.75rem 0.95rem; list-style: none; }');
            h.push('        .keep-fold summary::-webkit-details-marker { display: none; }');
            h.push('        .keep-fold summary::before { content: "▸ "; color: #b45309; }');
            h.push('        .keep-fold[open] summary::before { content: "▾ "; }');
            h.push('        .keep-fold-body { padding: 0 0.95rem 0.85rem; }');
            h.push('        .keep-body ul:has(> .keep-fold) { list-style: none !important; padding-left: 0 !important; padding-inline-start: 0 !important; margin: 0; }');
            h.push('        .keep-body, .keep-body * { font-family: inherit !important; font-size: 0.875rem !important; line-height: 1.625 !important; color: #57534e !important; background-color: transparent !important; white-space: normal !important; }');
            h.push('        .keep-body h3, .keep-body h3 *, .keep-body h4, .keep-body h4 *, .keep-body h5, .keep-body h5 * { color: #44403c !important; font-weight: 700 !important; }');
            h.push('        .keep-body span[style*="font-weight:700"], .keep-body span[style*="font-weight: 700"] { color: #44403c !important; }');
            h.push('        .keep-fold summary, .keep-fold summary * { font-weight: 700 !important; font-size: 0.875rem !important; color: #44403c !important; font-style: normal !important; text-decoration: none !important; }');
            h.push('        .keep-body b, .keep-body strong { font-weight: 700 !important; font-size: 0.875rem !important; color: #44403c !important; font-style: normal !important; text-decoration: none !important; }');
            h.push('        .keep-body h3.keep-section, .keep-body h3.keep-section *, .keep-body h4.keep-section, .keep-body h4.keep-section *, .keep-body h5.keep-section, .keep-body h5.keep-section *, .keep-body h6.keep-section, .keep-body h6.keep-section * { font-size: 1.125rem !important; font-weight: 700 !important; color: #292524 !important; line-height: 1.45 !important; }');
            h.push('        .keep-body .keep-section { display: block; margin: 1.35rem 0 0.5rem; }');
            h.push('        .keep-body .keep-warn, .keep-body .keep-warn * { color: #44403c !important; font-size: 0.875rem !important; font-weight: 400 !important; line-height: 1.625 !important; }');
            h.push('        .keep-body .keep-warn { margin: 0.35rem 0 0.75rem; padding-left: 1.25rem; }');
            h.push('        .keep-body .keep-mark { background-color: #fef3c7 !important; border-radius: 0.65rem; box-shadow: none; }');
            h.push('        .keep-body li.keep-mark { padding: 0.2rem 0.45rem; }');
            h.push('    <\/style>');
            h.push('<\/head>');
            h.push('<body class="bg-stone-50 text-stone-800 font-sans min-h-screen pb-24">');
            h.push('    <div class="max-w-2xl mx-auto bg-white shadow-md md:rounded-2xl my-0 md:my-8">');
            h.push('        <div class="sticky top-0 bg-white/90 backdrop-blur-md z-40 border-b md:rounded-t-2xl">');
            h.push('            <div class="p-4 pb-2 flex justify-between items-center">');
            h.push('                <a href="index.html" class="brand-mark text-amber-800 text-xl font-bold leading-tight">Poponew手做甜點<\/a>');
            h.push('                <div class="flex items-center gap-2">');
            h.push('                    <a href="cart.html" class="bg-amber-700 hover:bg-amber-800 text-white font-medium py-1.5 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-sm text-sm">🛒 購物車 (<span id="cart-count">0<\/span>)<\/a>');
            h.push('                <\/div>');
            h.push('            <\/div>');
            h.push('            <div class="flex justify-end px-4 pb-3">');
            h.push('                <div class="flex items-center bg-white/95 backdrop-blur-md rounded-xl p-1 border border-stone-200 shadow-md">');
            h.push('                    <button type="button" onclick="changeFontSize(-1)" title="縮小字型" class="w-8 h-7 flex items-center justify-center text-xs font-bold text-stone-600 hover:bg-stone-100 hover:text-amber-800 rounded-lg transition active:scale-95">A-<\/button>');
            h.push('                    <button type="button" onclick="resetFontSize()" title="重設字型" class="px-2 h-7 flex items-center justify-center text-xs font-medium text-stone-400 hover:text-amber-800 transition">預設<\/button>');
            h.push('                    <button type="button" onclick="changeFontSize(1)" title="放大字型" class="w-8 h-7 flex items-center justify-center text-sm font-bold text-stone-700 hover:bg-stone-100 hover:text-amber-800 rounded-lg transition active:scale-95">A+<\/button>');
            h.push('                <\/div>');
            h.push('            <\/div>');
            h.push('        <\/div>');
            h.push('        <div class="p-6">');
            h.push('            <div class="keep-body font-zoom text-stone-600 text-sm leading-relaxed">' + body + '<\/div>');
            h.push('        <\/div>');
            h.push('    <\/div>');
            h.push('    <div class="max-w-2xl mx-auto bg-white shadow-md md:rounded-2xl mt-3 md:-mt-3 p-5 md:p-6 flex items-center gap-4 md:gap-5 border border-stone-100">');
            h.push('        <div>');
            h.push('            <h4 class="font-bold text-amber-700 text-sm md:text-base mb-1">Poponew手做甜點<\/h4>');
            h.push('            ' + shopContactLineHtml());
            h.push('            ' + shopFooterPolicyHtml());
            h.push('        <\/div>');
            h.push('    <\/div>');
            h.push('    <p class="text-center text-stone-400 text-[10px] md:text-[11px] py-6">Copyright &copy; 2026 Poponew. All rights reserved.<\/p>');
            h.push('    <script>');
            h.push('        function openKeepTarget() {');
            h.push('            var id = (location.hash || "").replace("#", "");');
            h.push('            if (!id) return;');
            h.push('            var el = document.getElementById(id);');
            h.push('            if (!el) return;');
            h.push('            var details = el.tagName === "DETAILS" ? el : (el.closest ? el.closest("details") : null);');
            h.push('            if (details) details.open = true;');
            h.push('            var bar = document.querySelector(".sticky");');
            h.push('            var tools = bar ? bar.querySelector(".absolute") : null;');
            h.push('            var gap = 16;');
            h.push('            if (bar) gap += bar.getBoundingClientRect().height;');
            h.push('            if (tools) gap = Math.max(gap, tools.getBoundingClientRect().bottom + 8);');
            h.push('            window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - gap);');
            h.push('            markKeepItem();');
            h.push('        }');
            h.push('        function markKeepItem() {');
            h.push('            var mark = "";');
            h.push('            try { mark = new URLSearchParams(location.search).get("mark") || ""; } catch (err) { mark = ""; }');
            h.push('            if (!mark) return;');
            h.push('            var root = document.querySelector(".keep-body");');
            h.push('            if (!root) return;');
            h.push('            var old = root.querySelectorAll(".keep-mark");');
            h.push('            for (var i = 0; i < old.length; i++) old[i].classList.remove("keep-mark");');
            h.push('            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);');
            h.push('            var node;');
            h.push('            while ((node = walker.nextNode())) {');
            h.push('                if (node.textContent.indexOf(mark) === -1) continue;');
            h.push('                var el = node.parentElement;');
            h.push('                if (!el) return;');
            h.push('                var inBody = el.closest && el.closest(".keep-fold-body");');
            h.push('                var block = inBody ? (el.closest("li") || el.closest("p") || inBody) : (el.closest(".keep-fold") || el.closest("li") || el);');
            h.push('                block.classList.add("keep-mark");');
            h.push('                var bar = document.querySelector(".sticky");');
            h.push('                var gap = 16 + (bar ? bar.getBoundingClientRect().height : 0);');
            h.push('                window.scrollTo(0, block.getBoundingClientRect().top + window.pageYOffset - gap);');
            h.push('                return;');
            h.push('            }');
            h.push('        }');
            h.push('        openKeepTarget();');
            h.push('        window.addEventListener("load", openKeepTarget);');
            h.push('        window.addEventListener("hashchange", openKeepTarget);');
            h.push('        let currentFontSize = parseInt(localStorage.getItem("poponew_font_size")) || 16;');
            h.push('        applyFontSize(currentFontSize);');
            h.push('        function changeFontSize(delta) {');
            h.push('            currentFontSize = Math.min(Math.max(currentFontSize + delta * 2, 14), 22);');
            h.push('            applyFontSize(currentFontSize);');
            h.push('        }');
            h.push('        function resetFontSize() {');
            h.push('            currentFontSize = 16;');
            h.push('            applyFontSize(currentFontSize);');
            h.push('        }');
            h.push('        function applyFontSize(size) {');
            h.push('            document.documentElement.style.fontSize = "16px";');
            h.push('            localStorage.setItem("poponew_font_size", size);');
            h.push('            var scale = (parseInt(size, 10) || 16) / 16;');
            h.push('            document.querySelectorAll(".font-zoom").forEach(function(el) { el.style.zoom = scale === 1 ? "" : String(scale); });');
            h.push('        }');
            h.push('    <\/script>');
            h.push('    <script src="js/shop-settings.js"><\/script>');
            h.push(lineModalScriptTag());
            h.push('    <script src="js/cart-sync.js"><\/script>');
            h.push('<\/body>');
            h.push('<\/html>');
            return h.join('\n');
        }

function buildProductsLookupBlock(productsList, groupsList) {
            var activeNames = {};
            (groupsList || []).forEach(function(g) {
                if (g && g.name) activeNames[g.name] = true;
            });
            var hasGroups = (groupsList || []).length > 0;
            var items = (productsList || []).filter(function(p) {
                if (!p || p.id == null || p.id === '') return false;
                if (hasGroups && !activeNames[p.group]) return false;
                return true;
            });
            items.sort(function(a, b) {
                return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
            });
            var lines = items.map(function(p) {
                var weight = String(p.weight || '').replace(/"/g, '').trim();
                return '            ' + JSON.stringify(String(p.id)) + ': { name: ' + JSON.stringify(String(p.name || '')) + ', weight: ' + JSON.stringify(weight) + ', price: ' + (parseInt(p.price, 10) || 0) + ' },';
            });
            return '        const productsLookup = {\n' + lines.join('\n') + '\n        };';
        }

function updateCartHtmlLookup(cartPath, productsList, groupsList) {
            if (!fs.existsSync(cartPath)) {
                console.error('❌ 找不到 cart.html，略過結帳對照表');
                return false;
            }
            var html = fs.readFileSync(cartPath, 'utf8');
            var block = buildProductsLookupBlock(productsList, groupsList);
            var re = /[ \t]*const productsLookup\s*=\s*\{[\s\S]*?\n[ \t]*\};/;
            if (!re.test(html)) {
                console.error('❌ cart.html 找不到 productsLookup，略過結帳對照表');
                return false;
            }
            fs.writeFileSync(cartPath, html.replace(re, block), 'utf8');
            console.log('✅ 已更新：cart.html（結帳對照表）');
            return true;
        }

const outDir = path.basename(__dirname).toLowerCase() === 'backup' ? path.join(__dirname, '..') : __dirname;
const jsDir = path.join(outDir, 'js');
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
fs.writeFileSync(path.join(jsDir, 'shop-settings.js'), buildShopSettingsJs(), 'utf8');
console.log('✅ 已更新：js/shop-settings.js');
fs.writeFileSync(path.join(outDir, 'index.html'), buildIndexHtml(groups, products), 'utf8');
console.log('✅ 已更新：index.html');
fs.writeFileSync(path.join(outDir, 'keep.html'), buildKeepHtml(keepNote), 'utf8');
console.log('✅ 已更新：keep.html');
fs.writeFileSync(path.join(outDir, 'robots.txt'), buildRobotsTxt(), 'utf8');
console.log('✅ 已更新：robots.txt');
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), buildSitemapXml(groups), 'utf8');
console.log('✅ 已更新：sitemap.xml');
updateCartHtmlLookup(path.join(outDir, 'cart.html'), products, groups);

let updatedCount = 0;
groups.forEach(g => {
    if (!g.url) return;
    const subItems = products.filter(p => p.group === g.name);
    const htmlContent = buildSinglePageText(g.name, g.url, g.img, g.desc, subItems, products, g.tag, groupHasNewMark(g));
    fs.writeFileSync(path.join(outDir, g.url), htmlContent, 'utf8');
    console.log('✅ 已更新：' + g.url);
    updatedCount++;
});

console.log('\n🎉 完成！已更新首頁、商店規則、結帳對照表，以及 ' + updatedCount + ' 個商品頁！');
