/**
 * Configuración global de ClickOfertas
 * ------------------------------------------------------------
 * 1. Deja APPS_SCRIPT_URL vacío ('') para probar todo localmente en Modo Demo
 *    (usa localStorage compartido entre index.html y admin.html).
 * 2. Cuando despliegues apps-script/Code.gs en Google Sheets, pega aquí
 *    tu URL de Web App (termina en /exec).
 */
window.CLICKOFERTAS_CONFIG = {
    APPS_SCRIPT_URL: '',

    // PIN solo para el Modo Demo local (cuando APPS_SCRIPT_URL está vacío).
    // En producción, el PIN se valida EXCLUSIVAMENTE en Google Apps Script (PropertiesService).
    DEMO_ADMIN_PIN: '2026',

    // Intervalo de refresco silencioso en ms para sincronizar stock / Crash Sale en vivo
    POLL_INTERVAL_MS: 12000,

    // Datos iniciales para Modo Demo (se replican automáticamente en Sheets con setupDatabase())
    DEMO_SEED: {
        config: {
            nombre_tienda: 'ClickOfertas',
            whatsapp_numero: '59170000000',
            tiktok_url: 'https://www.tiktok.com/',
            instagram_url: 'https://www.instagram.com/',
            qr_imagen_url: 'https://placehold.co/320x320/1e2b58/ffffff?text=TU+QR+BANCARIO%0ABOLIVIA',
            qr_titular: 'ClickOfertas Bolivia S.R.L. - Banco Unión / QR Simple',
            campana_titulo: 'Ofertas Flash del Día',
            campana_fin_iso: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
            // Interruptores ON/OFF de mecánicas
            mod_caja_misteriosa: true,
            mod_raspa_gana: true,
            mod_evento_caceria: true,
            mod_llaves: true,
            mod_boton_panico: false,
            mod_prueba_social_respaldo: true,
            // Textos de Evento Cacería
            evento_titulo: 'La Cacería Multiplataforma 🕵️‍♂️',
            evento_desc: 'Busca el código secreto en nuestros videos de hoy y participa en el Live.',
            evento_pista: 'Revisa nuestro último TikTok, pausa en el segundo 0:14 y anota la palabra clave del fondo.',
            evento_costo_pts: 50,
            // Caja Misteriosa
            caja_id: 'CAJA-ORO-01',
            caja_titulo: 'Caja Misteriosa Nivel Oro',
            caja_desc: 'Contenido sellado y sorpresa. Garantizamos un valor comercial mínimo 2.5x superior al precio a ciegas.',
            caja_precio: 499,
            caja_stock: 10,
            caja_revelacion: 'Viernes 20:00 (TikTok & IG Live)',
            // Puntos & Sorteos
            raspa_puntos: 250,
            llaves_premio_pts: 600,
            panico_premio_pts: 300,
            sorteo_costo_pts: 200,
            sorteo_premio_titulo: 'Sorteo Live del Viernes: Smartwatch + Auriculares ANC'
        },
        crashSale: {
            activo: false, // Se enciende manualmente durante los Lives desde admin.html
            id: 'CRASH-LIVE-01',
            titulo: 'Smart TV 65" 4K QLED',
            descripcion: 'Precio cayendo en tiempo real durante el Live. ¡El primero en confirmar su pedido se lo lleva!',
            imagen_url: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80',
            precio_inicio: 4500,
            precio_minimo: 2900,
            duracion_seg: 180,
            stock: 1,
            iniciado_en: ''
        },
        ciudades: [
            { ciudad: 'Santa Cruz', costo_envio: 15, permite_contraentrega: true, tiempo_entrega: 'Mismo día / 24h' },
            { ciudad: 'La Paz', costo_envio: 25, permite_contraentrega: false, tiempo_entrega: '24 a 48h (Flota/Courier)' },
            { ciudad: 'Cochabamba', costo_envio: 25, permite_contraentrega: false, tiempo_entrega: '24 a 48h (Flota/Courier)' },
            { ciudad: 'El Alto', costo_envio: 28, permite_contraentrega: false, tiempo_entrega: '24 a 48h (Flota/Courier)' },
            { ciudad: 'Tarija', costo_envio: 30, permite_contraentrega: false, tiempo_entrega: '48h (Flota/Courier)' },
            { ciudad: 'Sucre', costo_envio: 30, permite_contraentrega: false, tiempo_entrega: '48h (Flota/Courier)' },
            { ciudad: 'Oruro', costo_envio: 30, permite_contraentrega: false, tiempo_entrega: '48h (Flota/Courier)' },
            { ciudad: 'Potosí', costo_envio: 35, permite_contraentrega: false, tiempo_entrega: '48 a 72h' },
            { ciudad: 'Beni / Pando', costo_envio: 40, permite_contraentrega: false, tiempo_entrega: '48 a 72h' }
        ],
        productos: [
            {
                id: 'PROD-001',
                nombre: 'Auriculares ANC Pro',
                categoria: 'Audio',
                descripcion: 'Cancelación activa de ruido, batería de 30 horas y micrófono HD. Ideales para viajes y oficina.',
                precio_antes: 450,
                precio_oferta: 199,
                stock: 5,
                imagen_url: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=600&q=80',
                es_vip: false,
                puntos_desbloqueo: 0,
                activo: true
            },
            {
                id: 'PROD-002',
                nombre: 'Freidora de Aire Smart 5L',
                categoria: 'Hogar',
                descripcion: 'Cocina sin aceite con panel táctil digital, 8 programas predefinidos y canasta antiadherente desmontable.',
                precio_antes: 820,
                precio_oferta: 499,
                stock: 12,
                imagen_url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
                es_vip: false,
                puntos_desbloqueo: 0,
                activo: true
            },
            {
                id: 'PROD-003',
                nombre: 'Robot Aspirador X1',
                categoria: 'Hogar',
                descripcion: 'Mapeo inteligente, aspira y trapea simultáneamente. Retorno automático a base de carga.',
                precio_antes: 1250,
                precio_oferta: 850,
                stock: 3,
                imagen_url: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=600&q=80',
                es_vip: false,
                puntos_desbloqueo: 0,
                activo: true
            },
            {
                id: 'PROD-004',
                nombre: 'Silla Gamer Ergonómica Pro',
                categoria: 'Setup',
                descripcion: 'Soporte lumbar ajustable, reclinable 180°, cojines de memory foam y base metálica reforzada.',
                precio_antes: 980,
                precio_oferta: 620,
                stock: 7,
                imagen_url: 'https://images.unsplash.com/photo-1598550476439-6847785fcea6?auto=format&fit=crop&w=600&q=80',
                es_vip: false,
                puntos_desbloqueo: 0,
                activo: true
            },
            {
                id: 'PROD-005',
                nombre: 'Reloj Inteligente Fit AMOLED',
                categoria: 'Tech',
                descripcion: 'Pantalla AMOLED brillante, llamadas Bluetooth, ritmo cardíaco, +20 modos deportivos y resistencia 5ATM.',
                precio_antes: 360,
                precio_oferta: 159,
                stock: 18,
                imagen_url: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=600&q=80',
                es_vip: false,
                puntos_desbloqueo: 0,
                activo: true
            },
            {
                id: 'PROD-006',
                nombre: 'Altavoz Bluetooth Bass 20W',
                categoria: 'Audio',
                descripcion: 'Graves potentes, batería de 12 horas, resistencia a salpicaduras IPX5 y modo estéreo TWS.',
                precio_antes: 260,
                precio_oferta: 125,
                stock: 14,
                imagen_url: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=600&q=80',
                es_vip: false,
                puntos_desbloqueo: 0,
                activo: true
            },
            {
                id: 'PROD-VIP-01',
                nombre: 'Monitor Curvo 27" 165Hz (Lote VIP)',
                categoria: 'Setup',
                descripcion: 'Oferta secreta solo para jugadores con puntos. 165Hz, 1ms y panel VA de alto contraste.',
                precio_antes: 1650,
                precio_oferta: 990,
                stock: 2,
                imagen_url: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
                es_vip: true,
                puntos_desbloqueo: 150,
                activo: true
            },
            {
                id: 'PROD-VIP-02',
                nombre: 'Cámara de Acción 4K Ultra + Kit (Lote VIP)',
                categoria: 'Tech',
                descripcion: 'Precio de liquidación exclusivo para usuarios activos. Incluye carcasa sumergible y soportes.',
                precio_antes: 750,
                precio_oferta: 349,
                stock: 4,
                imagen_url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
                es_vip: true,
                puntos_desbloqueo: 100,
                activo: true
            }
        ],
        pedidos: [],
        sorteos: []
    }
};
