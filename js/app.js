/**
 * ClickOfertas - Lógica principal de tienda pública
 */
const STORE = {
    config: {},
    crashSale: null,
    ciudades: [],
    productos: [],
    recentActivity: [],
    serverOffsetMs: 0,
    activeCategory: 'Todos',

    // Estado local del jugador (no monetario)
    points: parseInt(localStorage.getItem('co_points') || '0', 10),
    unlockedVipIds: JSON.parse(localStorage.getItem('co_vip_unlocked') || '[]'),
    myTickets: JSON.parse(localStorage.getItem('co_raffle_tickets') || '[]'),
    keysFoundIds: JSON.parse(sessionStorage.getItem('co_keys_found') || '[]'),
    keyProductIds: [],

    // Modal producto & checkout
    selectedProduct: null,
    selectedQty: 1,
    checkoutContext: null, // { tipo, item_id, nombre, unitPrice, qty, maxQty }
    selectedPayment: '',

    // Timers
    crashTickTimer: null,
    campaignTimer: null,
    crashHoldTimer: null,
    socialTimer: null,
    panicTimer: null,
    pollTimer: null,
    scratchInitialized: false
};

// --- UTILIDADES ---
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getServerNow() {
    return Date.now() + STORE.serverOffsetMs;
}

function formatBs(val) {
    const num = Number(val || 0);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function normalizeWa(num) {
    return String(num || '').replace(/\D/g, '');
}

// --- PUNTOS ---
function updatePointsUI() {
    localStorage.setItem('co_points', String(STORE.points));
    const navEl = document.getElementById('user-points');
    const modalEl = document.getElementById('modal-points-balance');
    if (navEl) navEl.textContent = STORE.points;
    if (modalEl) modalEl.textContent = STORE.points;
}

function addPoints(pts) {
    STORE.points += Number(pts || 0);
    updatePointsUI();
    const navEl = document.getElementById('user-points');
    if (navEl) {
        navEl.classList.add('text-green-600', 'scale-125', 'transition-transform');
        setTimeout(() => navEl.classList.remove('text-green-600', 'scale-125'), 350);
    }
}

function spendPoints(pts) {
    const cost = Number(pts || 0);
    if (STORE.points < cost) return false;
    STORE.points -= cost;
    updatePointsUI();
    return true;
}

// --- CARGA INICIAL Y SINCRONIZACIÓN ---
async function initApp() {
    updatePointsUI();

    if (window.ClickAPI.isDemoMode()) {
        document.getElementById('demo-banner').classList.remove('hidden');
    }

    await refreshState(true);
    startCampaignCountdown();
    startSocialProofEngine();
    startPanicButtonEngine();

    // Sincronización silenciosa para Crash Sale en vivo y stock
    STORE.pollTimer = setInterval(() => refreshState(false), window.CLICKOFERTAS_CONFIG.POLL_INTERVAL_MS || 12000);

    // En modo demo, escuchar cambios instantáneos hechos en admin.html en otra pestaña
    window.addEventListener('storage', (e) => {
        if (e.key === 'clickofertas_demo_db_v1') refreshState(false);
    });
}

async function refreshState(isInitial) {
    try {
        const data = await window.ClickAPI.getPublicState();
        STORE.config = data.config || {};
        STORE.crashSale = data.crashSale || null;
        STORE.ciudades = data.ciudades || [];
        STORE.productos = data.productos || [];
        STORE.recentActivity = data.recentActivity || [];
        if (data.serverNow) {
            STORE.serverOffsetMs = data.serverNow - Date.now();
        }

        applyConfigUI();
        renderCrashSaleSection();
        assignKeysIfNeeded();
        renderCategoryFilters();
        renderCatalog();
        populateCitiesSelect();

        if (isInitial || !STORE.scratchInitialized) {
            initScratchCard();
        }
    } catch (err) {
        console.error('Error sincronizando tienda:', err);
        if (isInitial) {
            showCustomModal('Error de Conexión', 'No pudimos cargar el catálogo desde Google Sheets. Verifica la URL en js/config.js o intenta recargar.', 'error');
        }
    }
}

// --- APLICAR CONFIGURACIÓN E INTERRUPTORES ON/OFF ---
function applyConfigUI() {
    const c = STORE.config;

    // Canales y WhatsApp
    const waNum = normalizeWa(c.whatsapp_numero || '59170000000');
    const waSupportLink = `https://wa.me/${waNum}?text=${encodeURIComponent('Hola ClickOfertas, tengo una consulta sobre sus ofertas.')}`;
    document.getElementById('floating-wa').href = waSupportLink;
    document.getElementById('footer-wa').href = waSupportLink;
    document.getElementById('footer-tiktok').href = c.tiktok_url || '#';
    document.getElementById('footer-ig').href = c.instagram_url || '#';

    // Interruptor Evento Cacería
    const eventCard = document.getElementById('event-card');
    eventCard.classList.toggle('hidden', !c.mod_evento_caceria);
    document.getElementById('event-title').textContent = c.evento_titulo || 'La Cacería Multiplataforma 🕵️‍♂️';
    document.getElementById('event-desc').textContent = c.evento_desc || '';
    document.getElementById('event-cost-lbl').textContent = c.evento_costo_pts ?? 50;

    // Interruptor Raspa y Gana
    document.getElementById('scratch-card').classList.toggle('hidden', !c.mod_raspa_gana);
    document.getElementById('scratch-pts-lbl').textContent = c.raspa_puntos ?? 250;

    // Interruptor Caja Misteriosa
    const mysteryCard = document.getElementById('mystery-card');
    const arenaLeft = document.getElementById('arena-left-col');
    mysteryCard.classList.toggle('hidden', !c.mod_caja_misteriosa);
    if (arenaLeft) {
        arenaLeft.classList.toggle('lg:col-span-2', Boolean(c.mod_caja_misteriosa));
        arenaLeft.classList.toggle('lg:col-span-3', !c.mod_caja_misteriosa);
    }
    document.getElementById('blind-title').textContent = c.caja_titulo || 'Caja Misteriosa';
    document.getElementById('blind-desc').textContent = c.caja_desc || '';
    document.getElementById('blind-price').textContent = formatBs(c.caja_precio || 499);
    document.getElementById('blind-stock').textContent = c.caja_stock ?? 0;
    document.getElementById('blind-reveal').textContent = c.caja_revelacion || 'Viernes 20:00 (Live)';
    const blindBtn = document.getElementById('btn-buy-blind');
    if (Number(c.caja_stock || 0) <= 0) {
        blindBtn.disabled = true;
        blindBtn.textContent = 'Agotada por ahora';
        blindBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        blindBtn.disabled = false;
        blindBtn.textContent = 'Comprar a Ciegas';
        blindBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // Interruptor Llaves
    const keysPill = document.getElementById('nav-keys-pill');
    if (c.mod_llaves) {
        keysPill.classList.remove('hidden');
        keysPill.classList.add('flex');
    } else {
        keysPill.classList.add('hidden');
        keysPill.classList.remove('flex');
    }
    document.getElementById('key-counter').textContent = STORE.keysFoundIds.length;

    // Sorteo & Campaña
    document.getElementById('campaign-title').textContent = c.campana_titulo || 'Ofertas Flash del Día';
    document.getElementById('raffle-card-title').textContent = c.sorteo_premio_titulo || 'Sorteo Live del Viernes';
    document.getElementById('raffle-cost-card').textContent = c.sorteo_costo_pts ?? 200;
    document.getElementById('raffle-modal-title').textContent = c.sorteo_premio_titulo || 'Canjear Ticket de Sorteo Live';
    document.getElementById('raffle-modal-cost').textContent = c.sorteo_costo_pts ?? 200;

    // QR Checkout
    document.getElementById('checkout-qr-img').src = c.qr_imagen_url || 'https://placehold.co/240x240/1e2b58/ffffff?text=QR+NO+CONFIGURADO';
    document.getElementById('checkout-qr-holder').textContent = c.qr_titular || '';
}

// --- CRASH SALE EN VIVO (SINCRONIZADA POR TIMESTAMP) ---
function computeLiveCrashPrice() {
    const cs = STORE.crashSale;
    if (!cs || !cs.activo || !cs.iniciado_en) return Number(cs?.precio_inicio || 0);
    const startMs = new Date(cs.iniciado_en).getTime();
    const elapsedSec = Math.max(0, (getServerNow() - startMs) / 1000);
    const startP = Number(cs.precio_inicio);
    const minP = Number(cs.precio_minimo);
    const dur = Math.max(10, Number(cs.duracion_seg || 180));
    const rate = (startP - minP) / dur;
    return Math.max(minP, Number((startP - elapsedSec * rate).toFixed(2)));
}

function renderCrashSaleSection() {
    const sec = document.getElementById('crash-section');
    const navLive = document.getElementById('nav-live-pill');
    const cs = STORE.crashSale;

    const isLive = Boolean(cs && cs.activo && Number(cs.stock) > 0 && cs.iniciado_en);

    if (!isLive) {
        sec.classList.add('hidden');
        navLive.classList.add('hidden');
        navLive.classList.remove('inline-flex');
        clearInterval(STORE.crashTickTimer);
        STORE.crashTickTimer = null;
        return;
    }

    sec.classList.remove('hidden');
    navLive.classList.remove('hidden');
    navLive.classList.add('inline-flex');

    document.getElementById('crash-title').textContent = cs.titulo || 'Subasta Flash Live';
    document.getElementById('crash-desc').textContent = cs.descripcion || 'Precio cayendo en vivo.';
    document.getElementById('crash-img').src = cs.imagen_url || 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80';
    document.getElementById('crash-stock').textContent = cs.stock;
    document.getElementById('crash-start-lbl').textContent = formatBs(cs.precio_inicio);
    document.getElementById('crash-min-lbl').textContent = formatBs(cs.precio_minimo);

    const updateTick = () => {
        const currentPrice = computeLiveCrashPrice();
        document.getElementById('crash-price').textContent = currentPrice.toFixed(2);
        const range = Math.max(1, Number(cs.precio_inicio) - Number(cs.precio_minimo));
        const pct = Math.max(0, Math.min(100, ((currentPrice - Number(cs.precio_minimo)) / range) * 100));
        document.getElementById('crash-progress').style.width = `${pct}%`;
    };

    updateTick();
    if (!STORE.crashTickTimer) {
        STORE.crashTickTimer = setInterval(updateTick, 400);
    }
}

function buyCrashItem() {
    const cs = STORE.crashSale;
    if (!cs || !cs.activo || Number(cs.stock) <= 0) {
        showCustomModal('Subasta finalizada', 'Esta Crash Sale ya no está activa.', 'error');
        return;
    }
    const frozenPrice = computeLiveCrashPrice();
    openCheckout({
        tipo: 'CRASH',
        item_id: cs.id || 'CRASH-LIVE',
        nombre: `[CRASH LIVE] ${cs.titulo}`,
        unitPrice: frozenPrice,
        qty: 1,
        maxQty: 1
    });
}

// --- CAJA MISTERIOSA ---
function buyMysteryBox() {
    const c = STORE.config;
    if (Number(c.caja_stock || 0) <= 0) {
        showCustomModal('Agotada', 'La Caja Misteriosa se agotó por ahora.', 'error');
        return;
    }
    openCheckout({
        tipo: 'CAJA',
        item_id: c.caja_id || 'CAJA-ORO',
        nombre: c.caja_titulo || 'Caja Misteriosa',
        unitPrice: Number(c.caja_precio || 499),
        qty: 1,
        maxQty: Math.min(3, Number(c.caja_stock || 1))
    });
}

// --- CATÁLOGO FLASH REAL + CATEGORÍAS + VIP ---
function assignKeysIfNeeded() {
    if (!STORE.config.mod_llaves || STORE.keyProductIds.length > 0) return;
    const candidates = STORE.productos.filter(p => !p.es_vip && Number(p.stock) > 0).map(p => p.id);
    if (candidates.length === 0) return;
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    STORE.keyProductIds = shuffled.slice(0, Math.min(3, shuffled.length));
}

function renderCategoryFilters() {
    const container = document.getElementById('category-filters');
    const cats = Array.from(new Set(STORE.productos.filter(p => !p.es_vip).map(p => p.categoria || 'General')));
    const hasVip = STORE.productos.some(p => p.es_vip);

    const pills = ['Todos', ...cats];
    if (hasVip) pills.push('VIP');

    container.innerHTML = pills.map(cat => {
        const active = STORE.activeCategory === cat;
        const isVip = cat === 'VIP';
        let classes = 'px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold whitespace-nowrap transition border ';
        if (isVip) {
            classes += active
                ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100';
        } else {
            classes += active
                ? 'bg-click-dark text-white border-click-dark shadow-md'
                : 'bg-white text-gray-600 border-gray-200 hover:border-click-blue hover:text-click-blue';
        }
        const label = isVip ? '🔒 Ofertas VIP' : escapeHtml(cat);
        return `<button onclick="setCategory('${escapeHtml(cat)}')" class="${classes}">${label}</button>`;
    }).join('');
}

function setCategory(cat) {
    STORE.activeCategory = cat;
    renderCategoryFilters();
    renderCatalog();
}

function renderCatalog() {
    const grid = document.getElementById('offers-grid');
    let list = STORE.productos;

    if (STORE.activeCategory === 'VIP') {
        list = list.filter(p => p.es_vip);
    } else if (STORE.activeCategory !== 'Todos') {
        list = list.filter(p => !p.es_vip && (p.categoria || 'General') === STORE.activeCategory);
    } else {
        // En "Todos", mostrar primero normales con stock, luego VIP, luego agotados
        list = [...list].sort((a, b) => {
            const aOut = Number(a.stock) <= 0 ? 1 : 0;
            const bOut = Number(b.stock) <= 0 ? 1 : 0;
            if (aOut !== bOut) return aOut - bOut;
            return Number(a.es_vip) - Number(b.es_vip);
        });
    }

    if (list.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-white rounded-3xl p-10 text-center border border-gray-100 shadow-sm">
                <p class="text-3xl mb-2">📦</p>
                <p class="font-black text-click-dark text-lg">No hay ofertas en esta categoría ahora</p>
                <p class="text-xs text-gray-500 mt-1">Explora otras categorías o vuelve pronto.</p>
            </div>`;
        return;
    }

    grid.innerHTML = list.map(prod => {
        const stock = Number(prod.stock || 0);
        const isOut = stock <= 0;
        const isVipLocked = prod.es_vip && !STORE.unlockedVipIds.includes(prod.id);
        const discountPct = prod.precio_antes > prod.precio_oferta
            ? Math.round(((prod.precio_antes - prod.precio_oferta) / prod.precio_antes) * 100)
            : 0;

        // Llave dorada oculta
        let keyHtml = '';
        if (STORE.config.mod_llaves && STORE.keyProductIds.includes(prod.id) && !STORE.keysFoundIds.includes(prod.id)) {
            keyHtml = `
                <button type="button" onclick="event.stopPropagation(); collectKey('${escapeHtml(prod.id)}', this)"
                        class="key-hidden top-14 right-4 text-2xl bg-yellow-100/90 rounded-full w-10 h-10 flex items-center justify-center border border-yellow-300"
                        title="¡Encontraste una llave dorada! Haz clic para recogerla">
                    🔑
                </button>`;
        }

        const badge = isOut
            ? `<span class="bg-gray-700 text-white text-[0.65rem] font-black px-2.5 py-1 rounded-full uppercase">Agotado</span>`
            : prod.es_vip
                ? `<span class="bg-amber-500 text-white text-[0.65rem] font-black px-2.5 py-1 rounded-full uppercase">🔒 VIP</span>`
                : discountPct > 0
                    ? `<span class="bg-red-500 text-white text-[0.65rem] font-black px-2.5 py-1 rounded-full">-${discountPct}%</span>`
                    : `<span class="bg-click-blue text-white text-[0.65rem] font-black px-2.5 py-1 rounded-full uppercase">Flash</span>`;

        if (isVipLocked) {
            return `
                <div class="bg-gradient-to-b from-amber-50/70 to-white rounded-3xl shadow-md p-4 sm:p-5 flex flex-col relative border-2 border-amber-200/80">
                    <div class="absolute top-3 left-3 z-10">${badge}</div>
                    <div class="relative overflow-hidden rounded-2xl mb-4 bg-gray-100 h-44">
                        <img src="${escapeHtml(prod.imagen_url)}" alt="Oferta VIP" class="w-full h-full object-cover vip-blurred">
                        <div class="absolute inset-0 bg-click-dark/45 flex flex-col items-center justify-center text-white p-3 text-center">
                            <span class="text-3xl mb-1">🔒</span>
                            <span class="text-xs font-black uppercase tracking-wider">Oferta VIP Oculta</span>
                        </div>
                    </div>
                    <h4 class="font-black text-click-dark text-base leading-tight mb-1">${escapeHtml(prod.nombre)}</h4>
                    <p class="text-xs text-gray-500 mb-4">Desbloquea el precio secreto de liquidación con tus puntos.</p>
                    <button onclick="unlockVipProduct('${escapeHtml(prod.id)}')" class="mt-auto w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-3 rounded-xl text-xs transition shadow">
                        🔓 Desbloquear (-${prod.puntos_desbloqueo || 100} Pts)
                    </button>
                </div>`;
        }

        return `
            <div onclick="${isOut ? '' : `openProductModal('${escapeHtml(prod.id)}')`}"
                 class="bg-white rounded-3xl shadow-md p-4 sm:p-5 flex flex-col relative group border border-gray-100 ${isOut ? 'opacity-65' : 'hover:border-click-blue hover:shadow-xl cursor-pointer hover:-translate-y-1'} transition-all duration-300">
                <div class="absolute top-3 left-3 z-10 flex items-center gap-1.5">
                    ${badge}
                    ${!isOut && stock <= 5 ? `<span class="bg-orange-100 text-click-orange text-[0.65rem] font-black px-2 py-0.5 rounded-full">¡Quedan ${stock}!</span>` : ''}
                </div>
                ${keyHtml}
                <div class="relative overflow-hidden rounded-2xl mb-3.5 bg-gray-50 h-44">
                    <img src="${escapeHtml(prod.imagen_url)}" alt="${escapeHtml(prod.nombre)}" loading="lazy" class="w-full h-full object-cover ${isOut ? 'grayscale' : 'group-hover:scale-105'} transition-transform duration-500">
                </div>
                <span class="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">${escapeHtml(prod.categoria || 'Oferta')}</span>
                <h4 class="font-black text-gray-800 text-base leading-snug mb-2 group-hover:text-click-blue transition line-clamp-2">${escapeHtml(prod.nombre)}</h4>
                <div class="mt-auto pt-3 flex justify-between items-end border-t border-gray-100">
                    <div>
                        ${prod.precio_antes > prod.precio_oferta ? `<span class="text-xs text-gray-400 line-through font-bold block">Bs. ${formatBs(prod.precio_antes)}</span>` : ''}
                        <div class="text-2xl font-black text-click-dark leading-none">Bs. ${formatBs(prod.precio_oferta)}</div>
                    </div>
                    <button type="button" ${isOut ? 'disabled' : ''} class="${isOut ? 'bg-gray-200 text-gray-500' : 'bg-click-dark text-white group-hover:bg-click-orange'} px-3.5 py-2.5 rounded-xl font-black text-xs transition shadow-sm">
                        ${isOut ? 'Agotado' : 'Comprar'}
                    </button>
                </div>
            </div>`;
    }).join('');
}

function unlockVipProduct(prodId) {
    const prod = STORE.productos.find(p => p.id === prodId);
    if (!prod) return;
    const cost = Number(prod.puntos_desbloqueo || 100);
    if (!spendPoints(cost)) {
        showCustomModal('Te faltan puntos ⚡', `Necesitas ${cost} puntos para desbloquear esta Oferta VIP. Juega al Raspa y Gana o encuentra las llaves doradas.`, 'error');
        return;
    }
    STORE.unlockedVipIds.push(prodId);
    localStorage.setItem('co_vip_unlocked', JSON.stringify(STORE.unlockedVipIds));
    renderCatalog();
    showCustomModal('¡Oferta VIP Desbloqueada! 🔓', `Ya puedes ver el precio secreto y comprar "${prod.nombre}".`, 'success');
}

// --- DETALLE DE PRODUCTO ---
function openProductModal(prodId) {
    const prod = STORE.productos.find(p => p.id === prodId);
    if (!prod || Number(prod.stock) <= 0) return;

    STORE.selectedProduct = prod;
    STORE.selectedQty = 1;

    document.getElementById('pm-img').src = prod.imagen_url;
    document.getElementById('pm-badge').textContent = prod.es_vip ? 'Oferta VIP Desbloqueada' : (prod.categoria || 'Oferta Flash');
    document.getElementById('pm-title').textContent = prod.nombre;
    document.getElementById('pm-desc').textContent = prod.descripcion || '';
    document.getElementById('pm-old').textContent = prod.precio_antes > prod.precio_oferta ? `Antes: Bs. ${formatBs(prod.precio_antes)}` : '';
    document.getElementById('pm-new').textContent = `Bs. ${formatBs(prod.precio_oferta)}`;
    document.getElementById('pm-stock').textContent = prod.stock;
    document.getElementById('pm-qty').textContent = '1';

    document.getElementById('pm-buy-btn').onclick = () => {
        closeModal('product-modal');
        openCheckout({
            tipo: 'CATALOGO',
            item_id: prod.id,
            nombre: prod.nombre,
            unitPrice: Number(prod.precio_oferta),
            qty: STORE.selectedQty,
            maxQty: Number(prod.stock)
        });
    };

    openModal('product-modal');
}

function adjustProductQty(delta) {
    if (!STORE.selectedProduct) return;
    const max = Math.max(1, Number(STORE.selectedProduct.stock || 1));
    STORE.selectedQty = Math.min(max, Math.max(1, STORE.selectedQty + delta));
    document.getElementById('pm-qty').textContent = String(STORE.selectedQty);
}

// --- CHECKOUT EXPRESS + LOGÍSTICA BOLIVIA ---
function populateCitiesSelect() {
    const sel = document.getElementById('co-ciudad');
    const prev = sel.value || localStorage.getItem('co_last_ciudad') || '';
    sel.innerHTML = STORE.ciudades.map(c => {
        const tag = c.permite_contraentrega ? 'QR o Contraentrega' : 'Solo QR';
        return `<option value="${escapeHtml(c.ciudad)}">${escapeHtml(c.ciudad)} (Envío Bs. ${formatBs(c.costo_envio)} • ${tag})</option>`;
    }).join('');
    if (prev && STORE.ciudades.some(c => c.ciudad === prev)) {
        sel.value = prev;
    }
}

function openCheckout(ctx) {
    STORE.checkoutContext = ctx;
    STORE.selectedPayment = '';

    // Restaurar últimos datos del cliente para compra ultra-rápida
    document.getElementById('co-nombre').value = localStorage.getItem('co_last_nombre') || '';
    document.getElementById('co-whatsapp').value = localStorage.getItem('co_last_wa') || '';
    document.getElementById('co-direccion').value = localStorage.getItem('co_last_dir') || '';
    populateCitiesSelect();

    document.getElementById('checkout-step-form').classList.remove('hidden');
    document.getElementById('checkout-step-success').classList.add('hidden');
    document.getElementById('checkout-item-name').textContent = ctx.nombre;
    document.getElementById('checkout-item-meta').textContent = `${ctx.qty} unidad(es) × Bs. ${formatBs(ctx.unitPrice)}`;

    // Temporizador de 2 minutos si es Crash Sale
    const crashTimerEl = document.getElementById('checkout-crash-timer');
    clearInterval(STORE.crashHoldTimer);
    if (ctx.tipo === 'CRASH') {
        let secs = 120;
        crashTimerEl.classList.remove('hidden');
        const tick = () => {
            const m = String(Math.floor(secs / 60)).padStart(2, '0');
            const s = String(secs % 60).padStart(2, '0');
            document.getElementById('crash-hold-countdown').textContent = `${m}:${s}`;
            if (secs <= 0) {
                clearInterval(STORE.crashHoldTimer);
                closeCheckout();
                showCustomModal('Tiempo agotado', 'Pasaron 2 minutos sin confirmar tu Crash Sale. El precio volvió a estar en vivo.', 'error');
            }
            secs--;
        };
        tick();
        STORE.crashHoldTimer = setInterval(tick, 1000);
    } else {
        crashTimerEl.classList.add('hidden');
    }

    onCityChange();
    openModal('checkout-modal');
}

function closeCheckout() {
    clearInterval(STORE.crashHoldTimer);
    closeModal('checkout-modal');
}

function onCityChange() {
    const cityName = document.getElementById('co-ciudad').value;
    const city = STORE.ciudades.find(c => c.ciudad === cityName) || STORE.ciudades[0];
    if (!city || !STORE.checkoutContext) return;

    const subtotal = Number(STORE.checkoutContext.unitPrice) * Number(STORE.checkoutContext.qty);
    const envio = Number(city.costo_envio || 0);
    const total = subtotal + envio;

    document.getElementById('checkout-subtotal').textContent = `Bs. ${formatBs(subtotal)}`;
    document.getElementById('checkout-shipping-label').textContent = `${city.ciudad} • ${city.tiempo_entrega || ''}`;
    document.getElementById('checkout-shipping-cost').textContent = envio === 0 ? 'Gratis' : `Bs. ${formatBs(envio)}`;
    document.getElementById('checkout-total').textContent = `Bs. ${formatBs(total)}`;

    const cashBtn = document.getElementById('btn-pay-cash');
    const cashHint = document.getElementById('cash-city-hint');

    if (city.permite_contraentrega) {
        cashBtn.disabled = false;
        cashBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        cashHint.textContent = 'Disponible en tu ciudad';
        if (!STORE.selectedPayment) selectPayment('Pago QR');
    } else {
        cashBtn.disabled = true;
        cashBtn.classList.add('opacity-40', 'cursor-not-allowed');
        cashHint.textContent = 'Solo QR en esta ciudad';
        selectPayment('Pago QR');
    }
}

function selectPayment(method) {
    STORE.selectedPayment = method;
    const qrBtn = document.getElementById('btn-pay-qr');
    const cashBtn = document.getElementById('btn-pay-cash');
    const formQr = document.getElementById('form-qr');
    const formCash = document.getElementById('form-cash');

    qrBtn.classList.remove('border-click-blue', 'bg-blue-50');
    cashBtn.classList.remove('border-green-500', 'bg-green-50');
    formQr.classList.add('hidden');
    formQr.classList.remove('flex');
    formCash.classList.add('hidden');

    if (method === 'Pago QR') {
        qrBtn.classList.add('border-click-blue', 'bg-blue-50');
        formQr.classList.remove('hidden');
        formQr.classList.add('flex');
    } else {
        cashBtn.classList.add('border-green-500', 'bg-green-50');
        formCash.classList.remove('hidden');
    }
}

async function submitCheckout(e) {
    e.preventDefault();
    if (!STORE.checkoutContext) return;
    if (!STORE.selectedPayment) {
        showCustomModal('Método de pago', 'Selecciona Pago QR o Contraentrega.', 'error');
        return;
    }

    const nombre = document.getElementById('co-nombre').value.trim();
    const waDigits = document.getElementById('co-whatsapp').value.replace(/\D/g, '');
    const ciudad = document.getElementById('co-ciudad').value;
    const direccion = document.getElementById('co-direccion').value.trim();

    if (!/^[67]\d{7}$/.test(waDigits)) {
        showCustomModal('WhatsApp inválido', 'Ingresa un número celular válido de Bolivia (8 dígitos comenzando con 6 o 7).', 'error');
        return;
    }

    // Guardar datos para futuras compras
    localStorage.setItem('co_last_nombre', nombre);
    localStorage.setItem('co_last_wa', waDigits);
    localStorage.setItem('co_last_ciudad', ciudad);
    localStorage.setItem('co_last_dir', direccion);

    const submitBtn = document.getElementById('btn-submit-order');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Reservando stock...</span>';

    try {
        const res = await window.ClickAPI.createOrder({
            tipo: STORE.checkoutContext.tipo,
            item_id: STORE.checkoutContext.item_id,
            cantidad: STORE.checkoutContext.qty,
            precio_capturado: STORE.checkoutContext.unitPrice,
            cliente_nombre: nombre,
            whatsapp: `591${waDigits}`,
            ciudad,
            direccion,
            metodo_pago: STORE.selectedPayment
        });

        clearInterval(STORE.crashHoldTimer);
        addPoints(150);

        const order = res.order;
        const waStore = normalizeWa(STORE.config.whatsapp_numero || '59170000000');
        const qrExtra = order.metodo_pago === 'Pago QR'
            ? '\n📎 *Adjunto mi comprobante de Pago QR aquí.*'
            : '\n💵 *Coordinar entrega contraentrega.*';

        const waMsg = `¡Hola ClickOfertas! Acabo de realizar mi pedido:\n`
            + `🆔 *Orden:* ${order.id_pedido}\n`
            + `📦 *Producto:* ${order.producto_nombre} (x${order.cantidad})\n`
            + `💰 *Total (con envío):* Bs. ${formatBs(order.total_bs)}\n`
            + `💳 *Pago:* ${order.metodo_pago}\n`
            + `👤 *Nombre:* ${order.cliente_nombre}\n`
            + `📍 *Ciudad:* ${order.ciudad} - ${order.direccion}`
            + qrExtra;

        const waUrl = `https://wa.me/${waStore}?text=${encodeURIComponent(waMsg)}`;

        document.getElementById('success-order-id').textContent = order.id_pedido;
        document.getElementById('success-order-summary').innerHTML = `
            <div><b>Producto:</b> ${escapeHtml(order.producto_nombre)} (x${order.cantidad})</div>
            <div><b>Total con envío:</b> Bs. ${formatBs(order.total_bs)}</div>
            <div><b>Método:</b> ${escapeHtml(order.metodo_pago)}</div>
            <div><b>Destino:</b> ${escapeHtml(order.ciudad)} — ${escapeHtml(order.direccion)}</div>
        `;
        document.getElementById('success-next-step').innerHTML = order.metodo_pago === 'Pago QR'
            ? 'Pulsa el botón verde para abrir WhatsApp y <b>enviar la captura de tu Pago QR</b>. ¡Ganaste <b>+150 Pts</b>!'
            : 'Pulsa el botón verde para confirmar tu dirección de entrega por WhatsApp. ¡Ganaste <b>+150 Pts</b>!';
        document.getElementById('btn-open-whatsapp').href = waUrl;

        document.getElementById('checkout-step-form').classList.add('hidden');
        document.getElementById('checkout-step-success').classList.remove('hidden');

        // Refrescar stock inmediatamente
        refreshState(false);
    } catch (err) {
        showCustomModal('No se pudo completar', err.message || 'Ocurrió un error al registrar el pedido.', 'error');
        refreshState(false);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// --- RASPA Y GANA DIARIO (Canvas Responsive + Auto-reveal) ---
function initScratchCard() {
    const canvas = document.getElementById('scratch-canvas');
    const container = document.getElementById('scratch-container');
    const claimBtn = document.getElementById('btn-claim-scratch');
    if (!canvas || !container || !STORE.config.mod_raspa_gana) return;

    const alreadyClaimedToday = localStorage.getItem('co_scratch_date') === todayKey();
    if (alreadyClaimedToday) {
        canvas.style.display = 'none';
        claimBtn.textContent = '✓ Reclamado hoy';
        claimBtn.disabled = true;
        claimBtn.classList.add('opacity-60', 'cursor-not-allowed');
        STORE.scratchInitialized = true;
        return;
    }

    const ctx = canvas.getContext('2d');
    const drawCover = () => {
        const w = container.offsetWidth || 280;
        const h = container.offsetHeight || 190;
        canvas.width = w;
        canvas.height = h;
        ctx.globalCompositeOperation = 'source-over';
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#cbd5e1');
        grad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#334155';
        ctx.font = '900 20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎟️ RASPA AQUÍ', w / 2, h / 2 - 8);
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillText('Desliza para revelar tu bono', w / 2, h / 2 + 16);
    };

    drawCover();
    let isDrawing = false;
    let strokes = 0;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const pt = e.touches ? e.touches[0] : e;
        return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
    };

    const scratch = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const { x, y } = getPos(e);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fill();
        strokes++;
        if (strokes > 28) {
            canvas.style.transition = 'opacity 0.4s';
            canvas.style.opacity = '0';
            setTimeout(() => { canvas.style.display = 'none'; }, 400);
        }
    };

    canvas.onmousedown = () => { isDrawing = true; };
    canvas.onmousemove = scratch;
    window.addEventListener('mouseup', () => { isDrawing = false; });

    canvas.ontouchstart = (e) => { isDrawing = true; scratch(e); };
    canvas.ontouchmove = scratch;
    window.addEventListener('touchend', () => { isDrawing = false; });

    STORE.scratchInitialized = true;
}

function claimScratchPrize() {
    if (localStorage.getItem('co_scratch_date') === todayKey()) return;
    const pts = Number(STORE.config.raspa_puntos || 250);
    addPoints(pts);
    localStorage.setItem('co_scratch_date', todayKey());

    const btn = document.getElementById('btn-claim-scratch');
    btn.textContent = '✓ Reclamado hoy';
    btn.disabled = true;
    btn.classList.add('opacity-60', 'cursor-not-allowed');

    const canvas = document.getElementById('scratch-canvas');
    canvas.style.display = 'none';
    showCustomModal('¡Bono Diario Reclamado! 🎁', `Sumaste +${pts} puntos. Úsalos para abrir ofertas VIP 🔒 o canjear tickets del sorteo en vivo.`, 'success');
}

// --- LLAVES, PISTA Y BOTÓN DE PÁNICO ---
function collectKey(prodId, el) {
    if (STORE.keysFoundIds.includes(prodId)) return;
    STORE.keysFoundIds.push(prodId);
    sessionStorage.setItem('co_keys_found', JSON.stringify(STORE.keysFoundIds));
    document.getElementById('key-counter').textContent = STORE.keysFoundIds.length;

    el.style.transform = 'scale(1.8) translateY(-16px)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);

    const totalNeeded = Math.max(1, STORE.keyProductIds.length || 3);
    if (STORE.keysFoundIds.length < totalNeeded) {
        showCustomModal('¡Llave Encontrada! 🔑', `Llevas ${STORE.keysFoundIds.length} de ${totalNeeded} llaves doradas. ¡Sigue explorando el catálogo!`, 'success');
    } else {
        const reward = Number(STORE.config.llaves_premio_pts || 600);
        addPoints(reward);
        showCustomModal('¡BÓVEDA DESBLOQUEADA! 🏆', `Encontraste todas las llaves y ganaste +${reward} puntos para ofertas VIP y tickets de sorteo.`, 'success');
    }
}

function buyHint() {
    const cost = Number(STORE.config.evento_costo_pts || 50);
    if (!spendPoints(cost)) {
        showCustomModal('Faltan Puntos ⚡', `Necesitas ${cost} puntos para revelar la pista. Juega al Raspa y Gana o encuentra las llaves.`, 'error');
        return;
    }
    showCustomModal('Pista Secreta 🕵️‍♂️', escapeHtml(STORE.config.evento_pista || 'Revisa nuestras redes hoy.'), 'success');
}

function startPanicButtonEngine() {
    STORE.panicTimer = setInterval(() => {
        if (!STORE.config.mod_boton_panico) return;
        const btn = document.getElementById('panic-button');
        if (btn.style.display === 'flex') return;
        if (Math.random() < 0.14) {
            const x = Math.max(16, Math.floor(Math.random() * (window.innerWidth - 100)));
            const y = Math.max(90, Math.floor(Math.random() * (window.innerHeight - 160)));
            btn.style.left = `${x}px`;
            btn.style.top = `${y}px`;
            btn.style.display = 'flex';
            setTimeout(() => { btn.style.display = 'none'; }, 3500);
        }
    }, 16000);
}

function triggerPanicSecret() {
    document.getElementById('panic-button').style.display = 'none';
    const reward = Number(STORE.config.panico_premio_pts || 300);
    addPoints(reward);
    showCustomModal('¡Reflejos de Cazador! 🚨', `Atrapaste el botón relámpago y sumaste +${reward} puntos.`, 'success');
}

// --- PUNTOS Y CANJE DE SORTEO LIVE ---
function openPointsModal() {
    updatePointsUI();
    document.getElementById('rf-nombre').value = localStorage.getItem('co_last_nombre') || '';
    document.getElementById('rf-whatsapp').value = localStorage.getItem('co_last_wa') || '';
    renderMyTickets();
    openModal('points-modal');
}

function renderMyTickets() {
    const box = document.getElementById('my-tickets-box');
    const list = document.getElementById('my-tickets-list');
    if (STORE.myTickets.length === 0) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    list.innerHTML = STORE.myTickets.map(t =>
        `<span class="bg-white border border-green-300 text-green-800 font-mono font-bold px-2 py-0.5 rounded-md">${escapeHtml(t)}</span>`
    ).join('');
}

async function submitRaffleRedemption(e) {
    e.preventDefault();
    const cost = Number(STORE.config.sorteo_costo_pts || 200);
    if (STORE.points < cost) {
        showCustomModal('Puntos insuficientes ⚡', `Necesitas ${cost} puntos para canjear un ticket de sorteo. ¡Raspa tu bono diario o busca las llaves!`, 'error');
        return;
    }

    const nombre = document.getElementById('rf-nombre').value.trim();
    const waDigits = document.getElementById('rf-whatsapp').value.replace(/\D/g, '');
    if (!/^[67]\d{7}$/.test(waDigits)) {
        showCustomModal('WhatsApp inválido', 'Ingresa 8 dígitos válidos de Bolivia (6 o 7 al inicio).', 'error');
        return;
    }

    const btn = document.getElementById('btn-redeem-raffle');
    btn.disabled = true;
    btn.textContent = 'Registrando ticket...';

    try {
        const res = await window.ClickAPI.redeemRaffle({
            cliente_nombre: nombre,
            whatsapp: `591${waDigits}`,
            tickets_qty: 1
        });
        spendPoints(cost);
        const ticketId = res.tickets && res.tickets[0] ? res.tickets[0].ticket_id : 'TKT-OK';
        STORE.myTickets.unshift(ticketId);
        localStorage.setItem('co_raffle_tickets', JSON.stringify(STORE.myTickets));
        localStorage.setItem('co_last_nombre', nombre);
        localStorage.setItem('co_last_wa', waDigits);
        renderMyTickets();
        showCustomModal('¡Ticket Registrado! 🎟️', `Tu código oficial es <b>${escapeHtml(ticketId)}</b>. ¡Mucha suerte en el Live!`, 'success');
    } catch (err) {
        showCustomModal('Error', err.message || 'No se pudo registrar el ticket.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🎟️ Canjear 1 Ticket Oficial';
    }
}

// --- RELOJ REAL DE CAMPAÑA ---
function startCampaignCountdown() {
    clearInterval(STORE.campaignTimer);
    const tick = () => {
        const el = document.getElementById('global-timer');
        if (!el) return;
        const endIso = STORE.config.campana_fin_iso;
        if (!endIso) {
            el.textContent = 'ACTIVO';
            return;
        }
        const diff = Math.max(0, Math.floor((new Date(endIso).getTime() - getServerNow()) / 1000));
        if (diff <= 0) {
            el.textContent = 'HOY';
            return;
        }
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;
    };
    tick();
    STORE.campaignTimer = setInterval(tick, 1000);
}

// --- PRUEBA SOCIAL HÍBRIDA ---
const FALLBACK_SOCIAL = [
    { nombre: 'Carlos', ciudad: 'Santa Cruz' },
    { nombre: 'María', ciudad: 'La Paz' },
    { nombre: 'Diego', ciudad: 'Cochabamba' },
    { nombre: 'Valeria', ciudad: 'Tarija' },
    { nombre: 'Fernando', ciudad: 'Sucre' }
];

function startSocialProofEngine() {
    STORE.socialTimer = setInterval(() => {
        if (document.hidden) return;

        // 1. Priorizar pedidos reales anonimizados desde Google Sheets
        if (STORE.recentActivity && STORE.recentActivity.length > 0) {
            const act = STORE.recentActivity[Math.floor(Math.random() * STORE.recentActivity.length)];
            showToast(`<b>${escapeHtml(act.nombre)}</b> en ${escapeHtml(act.ciudad)} pidió <i>${escapeHtml(act.producto)}</i>`);
            return;
        }

        // 2. Respaldo configurable mientras el negocio arranca
        if (STORE.config.mod_prueba_social_respaldo && STORE.productos.length > 0) {
            const person = FALLBACK_SOCIAL[Math.floor(Math.random() * FALLBACK_SOCIAL.length)];
            const avail = STORE.productos.filter(p => !p.es_vip && Number(p.stock) > 0);
            if (avail.length === 0) return;
            const prod = avail[Math.floor(Math.random() * avail.length)];
            showToast(`<b>${person.nombre}</b> en ${person.ciudad} está viendo <i>${escapeHtml(prod.nombre)}</i>`);
        }
    }, 15000);
}

function showToast(htmlMsg) {
    const container = document.getElementById('toast-container');
    if (container.children.length >= 2) container.firstElementChild.remove();
    const toast = document.createElement('div');
    toast.className = 'glass-panel px-3.5 py-3 rounded-2xl shadow-lg border-l-4 border-click-blue animate-slide-in-up text-xs font-medium text-gray-800 flex items-center gap-2.5';
    toast.innerHTML = `<span class="bg-blue-50 text-click-blue rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-black">✓</span><span>${htmlMsg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- MODALES GENÉRICOS ---
function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('hidden');
    m.classList.add('flex');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function openRulesModal() {
    openModal('rules-modal');
}

function showCustomModal(title, msgHtml, type = 'info') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-msg').innerHTML = msgHtml;
    const icon = document.getElementById('modal-icon');
    if (type === 'success') {
        icon.className = 'mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-green-100 text-green-600 text-3xl';
        icon.textContent = '✓';
    } else if (type === 'error') {
        icon.className = 'mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-red-100 text-red-600 text-3xl';
        icon.textContent = '!';
    } else {
        icon.className = 'mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-blue-100 text-click-blue text-3xl';
        icon.textContent = 'i';
    }
    openModal('custom-modal');
}

window.addEventListener('DOMContentLoaded', initApp);
