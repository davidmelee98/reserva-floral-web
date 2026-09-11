process.env.DATABASE_URL = 'postgres://fake:fake@localhost/fake';
process.env.PORT = '4500';
process.env.SESSION_SECRET = 'test-secret';

const CUPONES = {
  1: { id: 1, codigo: 'VERANO10', tipo: 'porcentaje', valor: 10, activo: true, monto_minimo: 0, usos_maximos: null, usos_actuales: 0, cliente_cuenta_id: null, fecha_expiracion: null },
  2: { id: 2, codigo: 'VENCIDO', tipo: 'monto_fijo', valor: 100, activo: true, monto_minimo: 0, usos_maximos: null, usos_actuales: 0, cliente_cuenta_id: null, fecha_expiracion: '2020-01-01' },
  3: { id: 3, codigo: 'MINIMO500', tipo: 'monto_fijo', valor: 50, activo: true, monto_minimo: 500, usos_maximos: null, usos_actuales: 0, cliente_cuenta_id: null, fecha_expiracion: null },
  4: { id: 4, codigo: 'AGOTADO', tipo: 'monto_fijo', valor: 50, activo: true, monto_minimo: 0, usos_maximos: 1, usos_actuales: 1, cliente_cuenta_id: null, fecha_expiracion: null },
};
const PRODUCTOS = { 1: { id: 1, nombre: 'Rosas', precio: 500, imagen_url: null } };
let ultimaOrdenInsertada = null;
let cuponesActualizados = [];
let clientesActualizados = [];

class FakePool {
  async query(texto, params) {
    const sql = texto.replace(/\s+/g, ' ').trim();
    if (/SELECT COUNT/i.test(sql)) return { rows: [{ n: 1 }], rowCount: 1 };
    if (/^BEGIN$|^COMMIT$|^ROLLBACK$/i.test(sql)) return {};
    if (/SELECT \* FROM cupones WHERE UPPER\(codigo\)=UPPER\(\$1\)( FOR UPDATE)?$/i.test(sql)) {
      const c = Object.values(CUPONES).find(x => x.codigo.toUpperCase() === params[0].toUpperCase());
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    if (/UPDATE cupones SET usos_actuales = usos_actuales \+ 1 WHERE id=\$1/i.test(sql)) {
      cuponesActualizados.push({ id: params[0], accion: 'incrementar_uso' });
      return { rowCount: 1 };
    }
    if (/SELECT id, nombre, precio, imagen_url\s+FROM arreglos_florales/i.test(sql)) {
      const ids = params[0];
      const rows = ids.map(id => PRODUCTOS[id]).filter(Boolean);
      return { rows, rowCount: rows.length };
    }
    if (/^INSERT INTO ordenes/i.test(sql)) {
      ultimaOrdenInsertada = { total: params[6], cupon_codigo: params[18], descuento: params[19] };
      return { rows: [{ id: 999, ...ultimaOrdenInsertada }], rowCount: 1 };
    }
    if (/SELECT total, envio FROM ordenes WHERE cliente_cuenta_id=\$1 AND estado='Entregado'( ORDER BY creado_en ASC)?$/i.test(sql)) {
      return { rows: [{ total: 3500, envio: 0, id: 1, creado_en: '2026-01-01' }], rowCount: 1 };
    }
    if (/SELECT puntos_canjeados FROM clientes_cuenta WHERE id=\$1( FOR UPDATE)?$/i.test(sql)) {
      return { rows: [{ puntos_canjeados: 0 }], rowCount: 1 };
    }
    if (/UPDATE clientes_cuenta SET puntos_canjeados/i.test(sql)) {
      clientesActualizados.push({ id: params[1], incremento: params[0] });
      return { rowCount: 1 };
    }
    if (/^INSERT INTO cupones/i.test(sql)) {
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
  async connect() { return { query: this.query.bind(this), release(){} }; }
  on() {}
}
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'pg') return { Pool: FakePool };
  if (request === 'mercadopago') return { MercadoPagoConfig: class {}, Preference: class {}, Payment: class {} };
  if (request === 'connect-pg-simple') return () => class { constructor(){} on(){} };
  return originalLoad.apply(this, arguments);
};

const http = require('http');
require('/home/claude/reserva_floral/server.js');
function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const datos = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: 'localhost', port: 4500, path, method, headers: { 'Content-Type': 'application/json', ...(datos ? { 'Content-Length': Buffer.byteLength(datos) } : {}) } }, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch(e){} resolve({ status: res.statusCode, body: json }); });
    });
    r.on('error', reject);
    if (datos) r.write(datos);
    r.end();
  });
}

(async () => {
  await esperar(800);

  console.log('--- Validar cupon de 10% (subtotal 1000) ---');
  let r = await req('POST', '/api/cupones/validar', { codigo: 'verano10', subtotal: 1000 });
  console.log(r.status, r.body);
  console.log('descuento correcto (100)?:', r.body.descuento === 100);

  console.log('--- Cupon vencido ---');
  r = await req('POST', '/api/cupones/validar', { codigo: 'VENCIDO', subtotal: 1000 });
  console.log(r.status, r.body);

  console.log('--- Cupon con compra minima no alcanzada ---');
  r = await req('POST', '/api/cupones/validar', { codigo: 'MINIMO500', subtotal: 300 });
  console.log(r.status, r.body);

  console.log('--- Cupon con compra minima SI alcanzada ---');
  r = await req('POST', '/api/cupones/validar', { codigo: 'MINIMO500', subtotal: 600 });
  console.log(r.status, r.body);

  console.log('--- Cupon agotado (usos_maximos alcanzado) ---');
  r = await req('POST', '/api/cupones/validar', { codigo: 'AGOTADO', subtotal: 1000 });
  console.log(r.status, r.body);

  console.log('--- Cupon inexistente ---');
  r = await req('POST', '/api/cupones/validar', { codigo: 'NOEXISTE', subtotal: 1000 });
  console.log(r.status, r.body);

  console.log('--- Crear pedido CON cupon (500 x1 = 500, cupon 10% = -50, envio 80) ---');
  r = await req('POST', '/api/ordenes', {
    cliente: 'Ana', telefono: '8331234567', direccion: 'Calle 1', fecha: '2026-09-20',
    carrito: [{ id: 1, cantidad: 1 }], conEnvio: true, emailContacto: 'ana@x.com', codigoCupon: 'VERANO10'
  });
  console.log(r.status, r.body);
  console.log('total correcto (500 - 50 + 80 = 530)?:', ultimaOrdenInsertada.total === 530);
  console.log('se guardo el codigo de cupon?:', ultimaOrdenInsertada.cupon_codigo === 'VERANO10');
  console.log('se guardo el descuento?:', ultimaOrdenInsertada.descuento === 50);
  console.log('se incremento el uso del cupon?:', cuponesActualizados.some(c => c.id === 1));

  console.log('--- Canjear puntos (requiere sesion de cliente -- debe fallar sin sesion) ---');
  r = await req('POST', '/api/cuenta/puntos/canjear', {});
  console.log(r.status, r.body);
  console.log('correctamente bloqueado sin sesion?:', r.status === 401 || r.status === 403);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
