/**
 * ClickOfertas - Lógica del Panel Admin (autenticado en Apps Script)
 */
const ADMIN = {
    pin: sessionStorage.getItem('co_admin_pin') || '',
    data: null,
    serverOffsetMs: 0,
    orderFilter: 'TODOS',
    monitorTimer: null
};

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showAdminToast(msg) {
    const el = document.getElementById('admin-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3200);
}

async function initAdmin() {
    if (window.ClickAPI.isDemoMode()) {
        document.getElementById('login-demo-hint').classList.remove('hidden');
        document.getElementById('admin-mode-badge').textContent = 'MODO DEMO';
    } else {
        document.getElementById('admin-mode-badge').textContent = 'GOOGLE SHEETS LIVE';
    }

    if (ADMIN.pin) {
        try {
            await loadDashboard();
            showDashboard();
        } catch {
            sessionStorage.removeItem('co_admin_pin');
            ADMIN.pin = '';
        }
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const pin = document.getElementById('admin-pin-input').value.trim();
    const btn = document.getElementById('btn-admin-login');
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
        await window.ClickAPI.adminLogin(pin);
        ADMIN.pin = pin;
        sessionStorage.setItem('co_admin_pin', pin);
        await loadDashboard();
        showDashboard();
    } catch (err) {
        errEl.textContent = err.message || 'PIN incorrecto.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Ingresar al Panel';
    }
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
}

function logoutAdmin() {
    sessionStorage.removeItem('co_admin_pin');
    ADMIN.pin = '';
    clearInterval(ADMIN.monitorTimer);
    location.reload();
}

function switchTab(tab) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.admin-tab').forEach(b => {
        b.classList.remove('bg-click-dark', 'text-white');
        b.classList.add('bg-gray-100', 'text-gray-600');
    });
    const active = document.getElementById(`tab-${tab}`);
    active.classList.remove('bg-gray-100', 'text-gray-600');
    active.classList.add('bg-click-dark', 'text-white');
}

async function loadDashboard() {
    const res = await window.ClickAPI.adminGetDashboard(ADMIN.pin);
    ADMIN.data = res;
    if (res.serverNow) ADMIN.serverOffsetMs = res.serverNow - Date.now();

    renderCrashForm();
    renderConfigForm();
    renderOrders();
    renderAdminProducts();
    renderTickets();
}

// --- TAB 1: CRASH SALE ---
function renderCrashForm() {
    const cs = ADMIN.data.crashSale || {};
    document.getElementById('cs-titulo').value = cs.titulo || '';
    document.getElementById('cs-desc').value = cs.descripcion || '';
    document.getElementById('cs-inicio').value = cs.precio_inicio || 4500;
    document.getElementById('cs-minimo').value = cs.precio_minimo || 2900;
    document.getElementById('cs-duracion').value = cs.duracion_seg || 180;
    document.getElementById('cs-stock').value = cs.stock ?? 1;
    document.getElementById('cs-img').value = cs.imagen_url || '';

    const pill = document.getElementById('crash-status-pill');
    const isLive = Boolean(cs.activo && Number(cs.stock) > 0 && cs.iniciado_en);
    clearInterval(ADMIN.monitorTimer);

    if (isLive) {
        pill.textContent = '🔴 EN VIVO';
        pill.className = 'text-xs font-black px-3 py-1 rounded-full bg-red-100 text-red-700 animate-pulse';
        document.getElementById('mon-title').textContent = cs.titulo;
        document.getElementById('mon-stock').textContent = cs.stock;

        const tick = () => {
            const nowMs = Date.now() + ADMIN.serverOffsetMs;
            const startMs = new Date(cs.iniciado_en).getTime();
            const elapsed = Math.max(0, (nowMs - startMs) / 1000);
            const rate = (Number(cs.precio_inicio) - Number(cs.precio_minimo)) / Math.max(10, Number(cs.duracion_seg || 180));
            const cur = Math.max(Number(cs.precio_minimo), Number(cs.precio_inicio) - elapsed * rate);
            document.getElementById('mon-price').textContent = `Bs. ${cur.toFixed(2)}`;
        };
        tick();
        ADMIN.monitorTimer = setInterval(tick, 500);
    } else {
        pill.textContent = 'OCULTA';
        pill.className = 'text-xs font-black px-3 py-1 rounded-full bg-gray-100 text-gray-600';
        document.getElementById('mon-title').textContent = 'Sin Crash Sale activa';
        document.getElementById('mon-price').textContent = '--';
        document.getElementById('mon-stock').textContent = cs.stock ?? 0;
    }
}

async function launchCrashSale(e) {
    e.preventDefault();
    const inicio = Number(document.getElementById('cs-inicio').value);
    const minimo = Number(document.getElementById('cs-minimo').value);
    if (minimo >= inicio) {
        showAdminToast('El precio piso debe ser menor al precio inicial.');
        return;
    }
    try {
        await window.ClickAPI.adminUpdateCrashSale(ADMIN.pin, {
            activo: true,
            reiniciar_reloj: true,
            titulo: document.getElementById('cs-titulo').value.trim(),
            descripcion: document.getElementById('cs-desc').value.trim(),
            precio_inicio: inicio,
            precio_minimo: minimo,
            duracion_seg: Number(document.getElementById('cs-duracion').value),
            stock: Number(document.getElementById('cs-stock').value),
            imagen_url: document.getElementById('cs-img').value.trim()
        });
        await loadDashboard();
        showAdminToast('🚀 Crash Sale lanzada EN VIVO.');
    } catch (err) {
        showAdminToast(`Error: ${err.message}`);
    }
}

async function stopCrashSale() {
    try {
        await window.ClickAPI.adminUpdateCrashSale(ADMIN.pin, { activo: false });
        await loadDashboard();
        showAdminToast('⏹️ Crash Sale detenida y oculta.');
    } catch (err) {
        showAdminToast(`Error: ${err.message}`);
    }
}

// --- TAB 2: PEDIDOS ---
function setOrderFilter(filter) {
    ADMIN.orderFilter = filter;
    document.querySelectorAll('.order-filter').forEach(btn => {
        const active = btn.dataset.filter === filter;
        btn.className = active
            ? 'order-filter px-3 py-1.5 rounded-lg text-xs font-black bg-click-dark text-white'
            : 'order-filter px-3 py-1.5 rounded-lg text-xs font-black bg-gray-100 text-gray-600';
    });
    renderOrders();
}

function renderOrders() {
    const pedidos = ADMIN.data.pedidos || [];
    const pendingCount = pedidos.filter(p => p.estado === 'PENDIENTE').length;
    document.getElementById('badge-pending-count').textContent = pendingCount;

    const list = ADMIN.orderFilter === 'TODOS'
        ? pedidos
        : pedidos.filter(p => p.estado === ADMIN.orderFilter);

    const container = document.getElementById('orders-list');
    if (list.length === 0) {
        container.innerHTML = `<div class="bg-white rounded-2xl p-8 text-center text-sm text-gray-500 border">No hay pedidos en esta vista.</div>`;
        return;
    }

    container.innerHTML = list.map(o => {
        const badgeClass = o.estado === 'CONFIRMADO'
            ? 'bg-green-100 text-green-800'
            : o.estado === 'CANCELADO'
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-800';
        const waNum = String(o.whatsapp || '').replace(/\D/g, '');
        const waReply = `https://wa.me/${waNum}?text=${encodeURIComponent(`Hola ${o.cliente_nombre}, te escribimos de ClickOfertas por tu pedido ${o.id_pedido} (${o.producto_nombre}).`)}`;
        const dateStr = o.fecha_iso ? new Date(o.fecha_iso).toLocaleString('es-BO') : '';

        return `
            <div class="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="space-y-1 text-xs sm:text-sm">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-mono font-black text-click-blue">${esc(o.id_pedido)}</span>
                        <span class="text-[0.65rem] font-black px-2.5 py-0.5 rounded-full ${badgeClass}">${esc(o.estado)}</span>
                        <span class="text-xs text-gray-400">${esc(dateStr)}</span>
                    </div>
                    <p class="font-black text-click-dark text-base">${esc(o.producto_nombre)} <span class="text-gray-500 font-bold">×${o.cantidad}</span> — <span class="text-click-orange">Bs. ${o.total_bs}</span></p>
                    <p class="text-gray-600">👤 <b>${esc(o.cliente_nombre)}</b> • 📱 +${esc(waNum)} • 💳 <b>${esc(o.metodo_pago)}</b></p>
                    <p class="text-gray-500">📍 ${esc(o.ciudad)} — ${esc(o.direccion)}</p>
                </div>
                <div class="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <a href="${waReply}" target="_blank" rel="noopener" class="bg-[#25D366] hover:bg-[#1ebe5a] text-white text-xs font-black px-3.5 py-2.5 rounded-xl">💬 WhatsApp</a>
                    ${o.estado !== 'CONFIRMADO' ? `<button onclick="changeOrderStatus('${esc(o.id_pedido)}','CONFIRMADO')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-3.5 py-2.5 rounded-xl">✓ Aprobar</button>` : ''}
                    ${o.estado !== 'CANCELADO' ? `<button onclick="changeOrderStatus('${esc(o.id_pedido)}','CANCELADO')" class="bg-red-100 hover:bg-red-200 text-red-700 text-xs font-black px-3.5 py-2.5 rounded-xl">✕ Cancelar (+Stock)</button>` : ''}
                </div>
            </div>`;
    }).join('');
}

async function changeOrderStatus(idPedido, nuevoEstado) {
    try {
        await window.ClickAPI.adminUpdateOrderStatus(ADMIN.pin, idPedido, nuevoEstado);
        await loadDashboard();
        showAdminToast(`Pedido ${idPedido} marcado como ${nuevoEstado}.`);
    } catch (err) {
        showAdminToast(`Error: ${err.message}`);
    }
}

// --- TAB 3: INTERRUPTORES Y CAMPAÑA ---
function toLocalDatetimeInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderConfigForm() {
    const c = ADMIN.data.config || {};
    document.getElementById('cfg-mod-caja').checked = Boolean(c.mod_caja_misteriosa);
    document.getElementById('cfg-mod-raspa').checked = Boolean(c.mod_raspa_gana);
    document.getElementById('cfg-mod-evento').checked = Boolean(c.mod_evento_caceria);
    document.getElementById('cfg-mod-llaves').checked = Boolean(c.mod_llaves);
    document.getElementById('cfg-mod-panico').checked = Boolean(c.mod_boton_panico);
    document.getElementById('cfg-mod-social').checked = Boolean(c.mod_prueba_social_respaldo);

    document.getElementById('cfg-campana-titulo').value = c.campana_titulo || '';
    document.getElementById('cfg-campana-fin').value = toLocalDatetimeInput(c.campana_fin_iso);
    document.getElementById('cfg-caja-precio').value = c.caja_precio ?? 499;
    document.getElementById('cfg-caja-stock').value = c.caja_stock ?? 0;
    document.getElementById('cfg-evento-pista').value = c.evento_pista || '';
    document.getElementById('cfg-sorteo-titulo').value = c.sorteo_premio_titulo || '';
}

function extendCampaignHours(hours) {
    const target = new Date(Date.now() + hours * 3600 * 1000);
    document.getElementById('cfg-campana-fin').value = toLocalDatetimeInput(target.toISOString());
}

async function saveConfigChanges(e) {
    e.preventDefault();
    const finLocal = document.getElementById('cfg-campana-fin').value;
    const finIso = finLocal ? new Date(finLocal).toISOString() : '';

    try {
        await window.ClickAPI.adminUpdateConfig(ADMIN.pin, {
            mod_caja_misteriosa: document.getElementById('cfg-mod-caja').checked,
            mod_raspa_gana: document.getElementById('cfg-mod-raspa').checked,
            mod_evento_caceria: document.getElementById('cfg-mod-evento').checked,
            mod_llaves: document.getElementById('cfg-mod-llaves').checked,
            mod_boton_panico: document.getElementById('cfg-mod-panico').checked,
            mod_prueba_social_respaldo: document.getElementById('cfg-mod-social').checked,
            campana_titulo: document.getElementById('cfg-campana-titulo').value.trim(),
            campana_fin_iso: finIso,
            caja_precio: Number(document.getElementById('cfg-caja-precio').value),
            caja_stock: Number(document.getElementById('cfg-caja-stock').value),
            evento_pista: document.getElementById('cfg-evento-pista').value.trim(),
            sorteo_premio_titulo: document.getElementById('cfg-sorteo-titulo').value.trim()
        });
        await loadDashboard();
        showAdminToast('💾 Configuración actualizada.');
    } catch (err) {
        showAdminToast(`Error: ${err.message}`);
    }
}

// --- TAB 4: CATÁLOGO RÁPIDO ---
function renderAdminProducts() {
    const prods = ADMIN.data.productos || [];
    const el = document.getElementById('admin-products-list');
    el.innerHTML = prods.map(p => `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border ${p.activo ? 'bg-slate-50 border-slate-200' : 'bg-gray-100 border-gray-200 opacity-65'}">
            <div class="flex items-center gap-3">
                <img src="${esc(p.imagen_url)}" alt="" class="w-12 h-12 rounded-xl object-cover bg-white">
                <div>
                    <p class="font-black text-sm text-click-dark">${p.es_vip ? '🔒 ' : ''}${esc(p.nombre)}</p>
                    <p class="text-xs text-gray-500">${esc(p.categoria)} • Bs. <b>${p.precio_oferta}</b> (antes ${p.precio_antes})</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <div class="flex items-center border rounded-lg bg-white">
                    <button onclick="updateProductStock('${esc(p.id)}', ${Math.max(0, Number(p.stock) - 1)})" class="px-2.5 py-1 text-xs font-black hover:bg-gray-100">−</button>
                    <span class="px-2.5 py-1 text-xs font-black">Stock: ${p.stock}</span>
                    <button onclick="updateProductStock('${esc(p.id)}', ${Number(p.stock) + 1})" class="px-2.5 py-1 text-xs font-black hover:bg-gray-100">+</button>
                </div>
                <button onclick="toggleProductActive('${esc(p.id)}', ${!p.activo})" class="text-xs font-black px-3 py-1.5 rounded-lg ${p.activo ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}">
                    ${p.activo ? 'Pausar' : 'Activar'}
                </button>
            </div>
        </div>
    `).join('');
}

async function addQuickProduct(e) {
    e.preventDefault();
    try {
        await window.ClickAPI.adminUpsertProduct(ADMIN.pin, {
            nombre: document.getElementById('np-nombre').value.trim(),
            categoria: document.getElementById('np-categoria').value.trim(),
            stock: Number(document.getElementById('np-stock').value),
            precio_antes: Number(document.getElementById('np-antes').value),
            precio_oferta: Number(document.getElementById('np-oferta').value),
            imagen_url: document.getElementById('np-img').value.trim(),
            descripcion: document.getElementById('np-desc').value.trim(),
            es_vip: document.getElementById('np-vip').checked,
            puntos_desbloqueo: Number(document.getElementById('np-vip-pts').value || 150),
            activo: true
        });
        e.target.reset();
        await loadDashboard();
        showAdminToast('✓ Producto publicado en el catálogo.');
    } catch (err) {
        showAdminToast(`Error: ${err.message}`);
    }
}

async function updateProductStock(id, newStock) {
    const prod = (ADMIN.data.productos || []).find(p => p.id === id);
    if (!prod) return;
    await window.ClickAPI.adminUpsertProduct(ADMIN.pin, { ...prod, stock: newStock });
    await loadDashboard();
    showAdminToast(`Stock de ${prod.nombre} → ${newStock}`);
}

async function toggleProductActive(id, active) {
    const prod = (ADMIN.data.productos || []).find(p => p.id === id);
    if (!prod) return;
    await window.ClickAPI.adminUpsertProduct(ADMIN.pin, { ...prod, activo: active });
    await loadDashboard();
    showAdminToast(active ? 'Producto activado.' : 'Producto pausado.');
}

// --- TAB 5: SORTEOS ---
function renderTickets() {
    const tickets = ADMIN.data.sorteos || [];
    document.getElementById('badge-tickets-count').textContent = tickets.length;
    const list = document.getElementById('admin-tickets-list');

    if (tickets.length === 0) {
        list.innerHTML = '<p class="text-xs text-gray-400">Aún no hay tickets canjeados.</p>';
        return;
    }

    list.innerHTML = tickets.map(t => `
        <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border">
            <div>
                <span class="font-mono font-black text-click-blue mr-2">${esc(t.ticket_id)}</span>
                <span class="font-bold text-click-dark">${esc(t.cliente_nombre)}</span>
                <span class="text-xs text-gray-500 ml-2">+${esc(t.whatsapp)}</span>
            </div>
            <span class="text-xs text-gray-400">${esc(t.campana)}</span>
        </div>
    `).join('');
}

function pickRandomWinner() {
    const tickets = (ADMIN.data.sorteos || []).filter(t => t.estado !== 'USADO');
    const box = document.getElementById('winner-banner');
    if (tickets.length === 0) {
        showAdminToast('No hay tickets registrados para sortear.');
        return;
    }
    const winner = tickets[Math.floor(Math.random() * tickets.length)];
    box.classList.remove('hidden');
    box.innerHTML = `
        <p class="text-xs font-black uppercase tracking-widest text-green-700">🎉 GANADOR DEL SORTEO LIVE 🎉</p>
        <p class="text-3xl font-black text-click-dark mt-1">${esc(winner.cliente_nombre)}</p>
        <p class="font-mono text-lg font-black text-click-blue mt-1">${esc(winner.ticket_id)}</p>
        <p class="text-sm text-gray-600 mt-1">WhatsApp: +${esc(winner.whatsapp)}</p>
    `;
}

window.addEventListener('DOMContentLoaded', initAdmin);
