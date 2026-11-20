/**
 * Cliente API para ClickOfertas (Google Apps Script + Modo Demo local automático)
 */
(function () {
    const DEMO_DB_KEY = 'clickofertas_demo_db_v1';

    function getScriptUrl() {
        return (window.CLICKOFERTAS_CONFIG && window.CLICKOFERTAS_CONFIG.APPS_SCRIPT_URL || '').trim();
    }

    function isDemoMode() {
        return !getScriptUrl();
    }

    function loadDemoDb() {
        try {
            const raw = localStorage.getItem(DEMO_DB_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn('Error leyendo Demo DB, reiniciando seed.', e);
        }
        const fresh = JSON.parse(JSON.stringify(window.CLICKOFERTAS_CONFIG.DEMO_SEED));
        saveDemoDb(fresh);
        return fresh;
    }

    function saveDemoDb(db) {
        localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    }

    function formatOrderId() {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const rnd = Math.floor(1000 + Math.random() * 9000);
        return `CO-${yy}${mm}${dd}-${rnd}`;
    }

    function anonymizeName(fullName) {
        if (!fullName) return 'Un cliente';
        const first = String(fullName).trim().split(/\s+/)[0];
        return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }

    function buildRecentActivity(pedidos) {
        return (pedidos || [])
            .filter(p => p.estado !== 'CANCELADO')
            .slice(0, 10)
            .map(p => ({
                nombre: anonymizeName(p.cliente_nombre),
                ciudad: p.ciudad,
                producto: p.producto_nombre,
                fecha_iso: p.fecha_iso
            }));
    }

    function computeServerCrashPrice(crash, nowMs) {
        if (!crash || !crash.activo || !crash.iniciado_en) return Number(crash?.precio_inicio || 0);
        const startMs = new Date(crash.iniciado_en).getTime();
        const elapsedSec = Math.max(0, (nowMs - startMs) / 1000);
        const startP = Number(crash.precio_inicio);
        const minP = Number(crash.precio_minimo);
        const dur = Math.max(10, Number(crash.duracion_seg || 180));
        const rate = (startP - minP) / dur;
        return Math.max(minP, Number((startP - elapsedSec * rate).toFixed(2)));
    }

    async function callRemoteGet(action) {
        const url = `${getScriptUrl()}?action=${encodeURIComponent(action)}&t=${Date.now()}`;
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.ok === false) throw new Error(data.error || 'Error en servidor');
        return data;
    }

    async function callRemotePost(payload) {
        // text/plain evita CORS preflight OPTIONS que Google Apps Script no soporta
        const res = await fetch(getScriptUrl(), {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.ok === false) throw new Error(data.error || 'Error en servidor');
        return data;
    }

    // --- DEMO MODE HANDLERS ---
    function handleDemoAction(action, payload = {}) {
        const db = loadDemoDb();
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();

        if (action === 'getPublicState') {
            return {
                ok: true,
                demoMode: true,
                serverNow: nowMs,
                config: db.config,
                crashSale: db.crashSale,
                ciudades: db.ciudades,
                productos: db.productos.filter(p => p.activo),
                recentActivity: buildRecentActivity(db.pedidos)
            };
        }

        if (action === 'createOrder') {
            const { tipo, item_id, cantidad, precio_capturado, cliente_nombre, whatsapp, ciudad, direccion, metodo_pago } = payload;
            const qty = Math.max(1, parseInt(cantidad, 10) || 1);
            const cityObj = db.ciudades.find(c => c.ciudad === ciudad);
            if (!cityObj) throw new Error('Ciudad no válida.');

            if (metodo_pago === 'Contraentrega' && !cityObj.permite_contraentrega) {
                throw new Error(`Contraentrega no está disponible en ${ciudad}. Selecciona Pago QR.`);
            }

            let productName = '';
            let unitPrice = 0;

            if (tipo === 'CRASH') {
                if (!db.crashSale.activo || Number(db.crashSale.stock) <= 0) {
                    throw new Error('¡Te ganaron por segundos! Esta Crash Sale acaba de agotarse.');
                }
                const livePrice = computeServerCrashPrice(db.crashSale, nowMs);
                const minAllowed = Math.max(Number(db.crashSale.precio_minimo), livePrice - 50);
                unitPrice = Math.max(minAllowed, Math.min(Number(db.crashSale.precio_inicio), Number(precio_capturado || livePrice)));
                productName = `[CRASH SALE] ${db.crashSale.titulo}`;
                db.crashSale.stock = Math.max(0, Number(db.crashSale.stock) - 1);
                if (db.crashSale.stock === 0) db.crashSale.activo = false;
            } else if (tipo === 'CAJA') {
                if (!db.config.mod_caja_misteriosa || Number(db.config.caja_stock) < qty) {
                    throw new Error('La Caja Misteriosa se agotó temporalmente.');
                }
                productName = db.config.caja_titulo;
                unitPrice = Number(db.config.caja_precio);
                db.config.caja_stock = Number(db.config.caja_stock) - qty;
            } else {
                const prod = db.productos.find(p => p.id === item_id && p.activo);
                if (!prod) throw new Error('Producto no disponible.');
                if (Number(prod.stock) < qty) {
                    throw new Error(`Stock insuficiente. Solo quedan ${prod.stock} unidad(es).`);
                }
                productName = prod.nombre;
                unitPrice = Number(prod.precio_oferta);
                prod.stock = Number(prod.stock) - qty;
            }

            const subtotal = Number((unitPrice * qty).toFixed(2));
            const envio = Number(cityObj.costo_envio || 0);
            const total = Number((subtotal + envio).toFixed(2));
            const orderId = formatOrderId();

            const order = {
                id_pedido: orderId,
                fecha_iso: nowIso,
                tipo: tipo || 'CATALOGO',
                item_id: item_id || '',
                producto_nombre: productName,
                cantidad: qty,
                precio_unitario: unitPrice,
                costo_envio: envio,
                total_bs: total,
                metodo_pago,
                cliente_nombre: String(cliente_nombre || '').trim(),
                whatsapp: String(whatsapp || '').trim(),
                ciudad,
                direccion: String(direccion || '').trim(),
                estado: 'PENDIENTE'
            };

            db.pedidos.unshift(order);
            saveDemoDb(db);

            return { ok: true, order, serverNow: nowMs };
        }

        if (action === 'redeemRaffle') {
            const { cliente_nombre, whatsapp, tickets_qty } = payload;
            const qty = Math.max(1, parseInt(tickets_qty, 10) || 1);
            const created = [];
            for (let i = 0; i < qty; i++) {
                const code = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
                const entry = {
                    ticket_id: code,
                    fecha_iso: nowIso,
                    cliente_nombre: String(cliente_nombre || '').trim(),
                    whatsapp: String(whatsapp || '').trim(),
                    campana: db.config.sorteo_premio_titulo || 'Sorteo Live',
                    estado: 'VALIDO'
                };
                db.sorteos.unshift(entry);
                created.push(entry);
            }
            saveDemoDb(db);
            return { ok: true, tickets: created };
        }

        // --- ADMIN AUTH CHECK (Demo) ---
        if (action === 'adminLogin') {
            if (String(payload.pin || '') !== String(window.CLICKOFERTAS_CONFIG.DEMO_ADMIN_PIN)) {
                throw new Error('PIN incorrecto. (En Modo Demo el PIN es 2026)');
            }
            return { ok: true, demoMode: true };
        }

        if (action.startsWith('admin')) {
            if (String(payload.pin || '') !== String(window.CLICKOFERTAS_CONFIG.DEMO_ADMIN_PIN)) {
                throw new Error('Sesión de administrador inválida.');
            }
        }

        if (action === 'adminGetDashboard') {
            return {
                ok: true,
                demoMode: true,
                serverNow: nowMs,
                config: db.config,
                crashSale: db.crashSale,
                ciudades: db.ciudades,
                productos: db.productos,
                pedidos: db.pedidos,
                sorteos: db.sorteos
            };
        }

        if (action === 'adminUpdateCrashSale') {
            const c = payload.crashSale || {};
            db.crashSale = {
                ...db.crashSale,
                ...c,
                precio_inicio: Number(c.precio_inicio ?? db.crashSale.precio_inicio),
                precio_minimo: Number(c.precio_minimo ?? db.crashSale.precio_minimo),
                duracion_seg: Number(c.duracion_seg ?? db.crashSale.duracion_seg),
                stock: Number(c.stock ?? db.crashSale.stock),
                iniciado_en: c.activo ? (c.reiniciar_reloj ? nowIso : (db.crashSale.iniciado_en || nowIso)) : ''
            };
            saveDemoDb(db);
            return { ok: true, crashSale: db.crashSale, serverNow: nowMs };
        }

        if (action === 'adminUpdateConfig') {
            db.config = { ...db.config, ...(payload.config || {}) };
            saveDemoDb(db);
            return { ok: true, config: db.config };
        }

        if (action === 'adminUpdateOrderStatus') {
            const { id_pedido, nuevo_estado } = payload;
            const order = db.pedidos.find(p => p.id_pedido === id_pedido);
            if (!order) throw new Error('Pedido no encontrado.');
            const prev = order.estado;
            order.estado = nuevo_estado;

            // Devolver stock automáticamente si pasa a CANCELADO desde un estado activo
            if (nuevo_estado === 'CANCELADO' && prev !== 'CANCELADO') {
                if (order.tipo === 'CATALOGO') {
                    const prod = db.productos.find(p => p.id === order.item_id);
                    if (prod) prod.stock = Number(prod.stock) + Number(order.cantidad || 1);
                } else if (order.tipo === 'CAJA') {
                    db.config.caja_stock = Number(db.config.caja_stock) + Number(order.cantidad || 1);
                } else if (order.tipo === 'CRASH') {
                    db.crashSale.stock = Number(db.crashSale.stock) + Number(order.cantidad || 1);
                }
            }
            saveDemoDb(db);
            return { ok: true, order };
        }

        if (action === 'adminUpsertProduct') {
            const p = payload.producto || {};
            if (p.id) {
                const idx = db.productos.findIndex(x => x.id === p.id);
                if (idx >= 0) {
                    db.productos[idx] = { ...db.productos[idx], ...p };
                } else {
                    db.productos.unshift(p);
                }
            } else {
                const newProd = {
                    id: `PROD-${Math.floor(1000 + Math.random() * 9000)}`,
                    nombre: p.nombre,
                    categoria: p.categoria || 'Hogar',
                    descripcion: p.descripcion || 'Oferta flash por tiempo limitado.',
                    precio_antes: Number(p.precio_antes || 0),
                    precio_oferta: Number(p.precio_oferta || 0),
                    stock: Number(p.stock || 1),
                    imagen_url: p.imagen_url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
                    es_vip: Boolean(p.es_vip),
                    puntos_desbloqueo: Number(p.puntos_desbloqueo || 0),
                    activo: p.activo !== false
                };
                db.productos.unshift(newProd);
            }
            saveDemoDb(db);
            return { ok: true, productos: db.productos };
        }

        throw new Error(`Acción desconocida: ${action}`);
    }

    // --- PUBLIC API ---
    window.ClickAPI = {
        isDemoMode,

        async getPublicState() {
            if (isDemoMode()) return handleDemoAction('getPublicState');
            return callRemoteGet('getPublicState');
        },

        async createOrder(orderData) {
            if (isDemoMode()) return handleDemoAction('createOrder', orderData);
            return callRemotePost({ action: 'createOrder', ...orderData });
        },

        async redeemRaffle(raffleData) {
            if (isDemoMode()) return handleDemoAction('redeemRaffle', raffleData);
            return callRemotePost({ action: 'redeemRaffle', ...raffleData });
        },

        async adminLogin(pin) {
            if (isDemoMode()) return handleDemoAction('adminLogin', { pin });
            return callRemotePost({ action: 'adminLogin', pin });
        },

        async adminGetDashboard(pin) {
            if (isDemoMode()) return handleDemoAction('adminGetDashboard', { pin });
            return callRemotePost({ action: 'adminGetDashboard', pin });
        },

        async adminUpdateCrashSale(pin, crashSale) {
            if (isDemoMode()) return handleDemoAction('adminUpdateCrashSale', { pin, crashSale });
            return callRemotePost({ action: 'adminUpdateCrashSale', pin, crashSale });
        },

        async adminUpdateConfig(pin, config) {
            if (isDemoMode()) return handleDemoAction('adminUpdateConfig', { pin, config });
            return callRemotePost({ action: 'adminUpdateConfig', pin, config });
        },

        async adminUpdateOrderStatus(pin, id_pedido, nuevo_estado) {
            if (isDemoMode()) return handleDemoAction('adminUpdateOrderStatus', { pin, id_pedido, nuevo_estado });
            return callRemotePost({ action: 'adminUpdateOrderStatus', pin, id_pedido, nuevo_estado });
        },

        async adminUpsertProduct(pin, producto) {
            if (isDemoMode()) return handleDemoAction('adminUpsertProduct', { pin, producto });
            return callRemotePost({ action: 'adminUpsertProduct', pin, producto });
        },

        resetDemoDb() {
            localStorage.removeItem(DEMO_DB_KEY);
            return loadDemoDb();
        }
    };
})();
