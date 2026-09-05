require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------------
// Sesiones (guardadas en PostgreSQL para que sobrevivan reinicios del server).
// ---------------------------------------------------------------------------
const pgSession = require('connect-pg-simple')(session);
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  No hay SESSION_SECRET en las variables de entorno. Se generó uno temporal: ' +
    'las sesiones activas se cerrarán cada vez que el servidor reinicie. Agrega SESSION_SECRET a tu .env para evitarlo.');
}
app.use(session({
  store: new pgSession({ pool, tableName: 'sesiones_admin', createTableIfMissing: true }),
  secret: sessionSecret,
  name: 'rf_admin_sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    httpOnly: true,
    sameSite: 'lax'
    // 'secure' se deja apagado por compatibilidad -- actívalo (true) en cuanto
    // confirmes que el sitio corre siempre bajo HTTPS.
  }
}));

// ---------------------------------------------------------------------------
// Subida de imágenes (se guardan en /public/uploads y se sirven como estáticas)
// ---------------------------------------------------------------------------
const CARPETA_SUBIDAS = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(CARPETA_SUBIDAS, { recursive: true });

const storageSubidas = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_SUBIDAS),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, nombre);
  }
});
const TIPOS_IMAGEN_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const subirImagen = multer({
  storage: storageSubidas,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
  fileFilter: (req, file, cb) => {
    if (!TIPOS_IMAGEN_VALIDOS.has(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP, GIF o AVIF.'));
    }
    cb(null, true);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Las páginas de producto usan el mismo cascarón de la tienda; el frontend carga el ID desde la URL.
app.get('/producto/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Esquema de base de datos
// ---------------------------------------------------------------------------
const columnasProducto = `
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  especificaciones TEXT,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  imagen_url TEXT,
  imagenes TEXT,
  categoria VARCHAR(100),
  subcategoria VARCHAR(100),
  subsubcategoria VARCHAR(100),
  variante_personalizada TEXT,
  opcion_foto BOOLEAN DEFAULT false,
  tamanos TEXT,
  cobertura TEXT,
  stock INTEGER DEFAULT 1 CHECK (stock >= 0),
  disponible BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
`;

async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS arreglos_florales (
      id SERIAL PRIMARY KEY,
      ${columnasProducto}
    );

    CREATE TABLE IF NOT EXISTS ordenes (
      id SERIAL PRIMARY KEY,
      cliente_nombre VARCHAR(150) NOT NULL,
      cliente_telefono VARCHAR(20) NOT NULL,
      direccion_entrega TEXT NOT NULL,
      fecha_entrega DATE NOT NULL,
      dedicatoria TEXT,
      carrito JSONB NOT NULL DEFAULT '[]'::jsonb,
      total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
      estado VARCHAR(50) DEFAULT 'Pendiente',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usuarios_admin (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol VARCHAR(30) NOT NULL DEFAULT 'editor',
      activo BOOLEAN DEFAULT true,
      ultimo_acceso TIMESTAMP,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS zonas_cobertura (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE NOT NULL,
      etiqueta VARCHAR(100) NOT NULL,
      activa BOOLEAN DEFAULT true,
      orden INTEGER DEFAULT 0,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave VARCHAR(100) PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS clientes_cuenta (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      genero VARCHAR(20),
      email VARCHAR(150) UNIQUE NOT NULL,
      telefono VARCHAR(20),
      password_hash TEXT NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS direcciones_cliente (
      id SERIAL PRIMARY KEY,
      cliente_cuenta_id INTEGER NOT NULL REFERENCES clientes_cuenta(id) ON DELETE CASCADE,
      nombre_destinatario VARCHAR(150) NOT NULL,
      telefono_destinatario VARCHAR(20),
      calle VARCHAR(200),
      numero VARCHAR(20),
      colonia VARCHAR(150),
      cp VARCHAR(10),
      ciudad VARCHAR(100),
      estado VARCHAR(100),
      tipo_domicilio VARCHAR(50),
      notas_entrega TEXT,
      lat DECIMAL(10,7),
      lng DECIMAL(10,7),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recordatorios_cliente (
      id SERIAL PRIMARY KEY,
      cliente_cuenta_id INTEGER NOT NULL REFERENCES clientes_cuenta(id) ON DELETE CASCADE,
      titulo VARCHAR(150) NOT NULL,
      fecha DATE NOT NULL,
      repetir_anual BOOLEAN DEFAULT true,
      notas TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Compatibilidad con instalaciones anteriores de la base de datos.
  const alterQueries = [
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS imagenes TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS especificaciones TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS opcion_foto BOOLEAN DEFAULT false',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS tamanos TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS cobertura TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS subcategoria VARCHAR(100)',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS subsubcategoria VARCHAR(100)',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS variante_personalizada TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 1',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT true',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS dedicatoria TEXT',
    "ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS carrito JSONB NOT NULL DEFAULT '[]'::jsonb",
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS destinatario_telefono VARCHAR(20)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS tipo_domicilio VARCHAR(50)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS notas_entrega TEXT',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS horario_entrega VARCHAR(50)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS firma VARCHAR(150)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS es_anonimo BOOLEAN DEFAULT false',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS envio DECIMAL(10,2) DEFAULT 0',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cliente_cuenta_id INTEGER REFERENCES clientes_cuenta(id) ON DELETE SET NULL',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS email_contacto VARCHAR(150)'
  ];

  for (const query of alterQueries) {
    await pool.query(query);
  }

  // Semilla de zonas de cobertura: mismas ciudades que ya se usaban a mano en
  // el panel, para que los productos existentes (cuyo campo "cobertura" ya
  // trae estos valores) no se queden huérfanos.
  const zonasExistentes = await pool.query('SELECT COUNT(*)::int AS n FROM zonas_cobertura');
  if (zonasExistentes.rows[0].n === 0) {
    const zonasIniciales = [
      ['Tampico', 'Tampico', 1],
      ['Madero', 'Cd. Madero', 2],
      ['Altamira', 'Altamira', 3],
      ['Monterrey', 'Monterrey', 4],
      ['CDMX', 'CDMX', 5]
    ];
    for (const [nombre, etiqueta, orden] of zonasIniciales) {
      await pool.query('INSERT INTO zonas_cobertura (nombre, etiqueta, orden) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING', [nombre, etiqueta, orden]);
    }
  }

  console.log('Base de datos lista.');
}

// ---------------------------------------------------------------------------
// Auth: middlewares y utilidades
// ---------------------------------------------------------------------------
const intentosLogin = new Map(); // email -> { fallos, bloqueadoHasta }
const LIMITE_INTENTOS = 6;
const BLOQUEO_MS = 15 * 60 * 1000;

function registrarIntentoFallido(email) {
  const clave = email.toLowerCase();
  const registro = intentosLogin.get(clave) || { fallos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= LIMITE_INTENTOS) {
    registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  }
  intentosLogin.set(clave, registro);
}
function limpiarIntentos(email) {
  intentosLogin.delete(email.toLowerCase());
}
function estaBloqueado(email) {
  const registro = intentosLogin.get(email.toLowerCase());
  if (!registro) return false;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta > Date.now()) return true;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta <= Date.now()) {
    intentosLogin.delete(email.toLowerCase());
    return false;
  }
  return false;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.usuarioId) return next();
  res.status(401).json({ error: 'Debes iniciar sesión.' });
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.usuarioId && req.session.rol === 'admin') return next();
  res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
}

function usuarioPublico(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    activo: row.activo,
    ultimo_acceso: row.ultimo_acceso,
    creado_en: row.creado_en
  };
}

// --- Estado de sesión / primer arranque ---
app.get('/api/admin/auth/estado', async (req, res) => {
  try {
    const conteo = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios_admin');
    const requiereConfiguracionInicial = conteo.rows[0].n === 0;
    if (req.session && req.session.usuarioId) {
      return res.json({
        autenticado: true,
        requiereConfiguracionInicial: false,
        usuario: { id: req.session.usuarioId, nombre: req.session.nombre, email: req.session.email, rol: req.session.rol }
      });
    }
    res.json({ autenticado: false, requiereConfiguracionInicial });
  } catch (error) {
    console.error('GET /api/admin/auth/estado:', error);
    res.status(500).json({ error: 'No se pudo verificar la sesión.' });
  }
});

// --- Crear la primera cuenta de administrador (solo si no existe ninguna) ---
app.post('/api/admin/auth/configurar-inicial', async (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  try {
    const conteo = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios_admin');
    if (conteo.rows[0].n > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta de administrador. Inicia sesión normalmente.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO usuarios_admin (nombre, email, password_hash, rol, activo, ultimo_acceso)
       VALUES ($1,$2,$3,'admin',true,CURRENT_TIMESTAMP) RETURNING *`,
      [nombre.trim(), email.trim().toLowerCase(), hash]
    );
    const usuario = resultado.rows[0];
    req.session.usuarioId = usuario.id;
    req.session.nombre = usuario.nombre;
    req.session.email = usuario.email;
    req.session.rol = usuario.rol;
    res.status(201).json({ usuario: usuarioPublico(usuario) });
  } catch (error) {
    console.error('POST /api/admin/auth/configurar-inicial:', error);
    res.status(500).json({ error: 'No se pudo crear la cuenta de administrador.' });
  }
});

// --- Login / logout ---
app.post('/api/admin/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
  }
  if (estaBloqueado(email)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM usuarios_admin WHERE lower(email) = lower($1)', [email.trim()]);
    const usuario = resultado.rows[0];
    if (!usuario || !usuario.activo) {
      registrarIntentoFallido(email);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      registrarIntentoFallido(email);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    limpiarIntentos(email);
    await pool.query('UPDATE usuarios_admin SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1', [usuario.id]);
    req.session.regenerate((err) => {
      if (err) {
        console.error('Error regenerando sesión:', err);
        return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
      }
      req.session.usuarioId = usuario.id;
      req.session.nombre = usuario.nombre;
      req.session.email = usuario.email;
      req.session.rol = usuario.rol;
      res.json({ usuario: usuarioPublico(usuario) });
    });
  } catch (error) {
    console.error('POST /api/admin/auth/login:', error);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
});

app.post('/api/admin/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('rf_admin_sid');
    res.json({ exito: true });
  });
});

app.patch('/api/admin/perfil/password', requireAuth, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  if (!passwordActual || !passwordNueva || passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM usuarios_admin WHERE id = $1', [req.session.usuarioId]);
    const usuario = resultado.rows[0];
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const coincide = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!coincide) return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
    const hash = await bcrypt.hash(passwordNueva, 12);
    await pool.query('UPDATE usuarios_admin SET password_hash = $1 WHERE id = $2', [hash, usuario.id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('PATCH /api/admin/perfil/password:', error);
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
});

// ---------------------------------------------------------------------------
// Cuentas de cliente (tienda) -- independientes de las cuentas del panel.
// ---------------------------------------------------------------------------
const intentosLoginCliente = new Map();
function clienteEstaBloqueado(email) {
  const registro = intentosLoginCliente.get(email.toLowerCase());
  if (!registro) return false;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta > Date.now()) return true;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta <= Date.now()) { intentosLoginCliente.delete(email.toLowerCase()); return false; }
  return false;
}
function registrarIntentoFallidoCliente(email) {
  const clave = email.toLowerCase();
  const registro = intentosLoginCliente.get(clave) || { fallos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= LIMITE_INTENTOS) registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  intentosLoginCliente.set(clave, registro);
}

function requireClienteAuth(req, res, next) {
  if (req.session && req.session.clienteId) return next();
  res.status(401).json({ error: 'Debes iniciar sesión.' });
}

function clientePublico(row) {
  return { id: row.id, nombre: row.nombre, apellido: row.apellido, genero: row.genero, email: row.email, telefono: row.telefono, creado_en: row.creado_en };
}

app.get('/api/cuenta/sesion', (req, res) => {
  if (req.session && req.session.clienteId) {
    return res.json({ autenticado: true, cliente: { id: req.session.clienteId, nombre: req.session.clienteNombre, apellido: req.session.clienteApellido, email: req.session.clienteEmail } });
  }
  res.json({ autenticado: false });
});

app.post('/api/cuenta/registro', async (req, res) => {
  const { nombre, apellido, genero, email, telefono, password } = req.body || {};
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, apellido, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO clientes_cuenta (nombre, apellido, genero, email, telefono, password_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre.trim(), apellido.trim(), genero || null, email.trim().toLowerCase(), telefono?.trim() || null, hash]
    );
    const cliente = resultado.rows[0];
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
      req.session.clienteId = cliente.id;
      req.session.clienteNombre = cliente.nombre;
      req.session.clienteApellido = cliente.apellido;
      req.session.clienteEmail = cliente.email;
      res.status(201).json({ cliente: clientePublico(cliente) });
    });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    console.error('POST /api/cuenta/registro:', error);
    res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/cuenta/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
  if (clienteEstaBloqueado(email)) return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' });
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE lower(email) = lower($1)', [email.trim()]);
    const cliente = resultado.rows[0];
    if (!cliente) { registrarIntentoFallidoCliente(email); return res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); }
    const coincide = await bcrypt.compare(password, cliente.password_hash);
    if (!coincide) { registrarIntentoFallidoCliente(email); return res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); }
    intentosLoginCliente.delete(email.toLowerCase());
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
      req.session.clienteId = cliente.id;
      req.session.clienteNombre = cliente.nombre;
      req.session.clienteApellido = cliente.apellido;
      req.session.clienteEmail = cliente.email;
      res.json({ cliente: clientePublico(cliente) });
    });
  } catch (error) {
    console.error('POST /api/cuenta/login:', error);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
});

app.post('/api/cuenta/logout', (req, res) => {
  delete req.session.clienteId;
  delete req.session.clienteNombre;
  delete req.session.clienteApellido;
  res.json({ exito: true });
});

app.get('/api/cuenta/perfil', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    res.json(clientePublico(resultado.rows[0]));
  } catch (error) {
    console.error('GET /api/cuenta/perfil:', error);
    res.status(500).json({ error: 'No se pudo cargar tu perfil.' });
  }
});

app.patch('/api/cuenta/perfil', requireClienteAuth, async (req, res) => {
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.nombre === 'string' && req.body.nombre.trim()) { campos.push(`nombre=$${i++}`); valores.push(req.body.nombre.trim()); }
  if (typeof req.body.apellido === 'string' && req.body.apellido.trim()) { campos.push(`apellido=$${i++}`); valores.push(req.body.apellido.trim()); }
  if (typeof req.body.genero === 'string') { campos.push(`genero=$${i++}`); valores.push(req.body.genero || null); }
  if (typeof req.body.telefono === 'string') { campos.push(`telefono=$${i++}`); valores.push(req.body.telefono.trim() || null); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(req.session.clienteId);
  try {
    const resultado = await pool.query(`UPDATE clientes_cuenta SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    req.session.clienteNombre = resultado.rows[0].nombre;
    req.session.clienteApellido = resultado.rows[0].apellido;
    res.json(clientePublico(resultado.rows[0]));
  } catch (error) {
    console.error('PATCH /api/cuenta/perfil:', error);
    res.status(500).json({ error: 'No se pudo actualizar tu perfil.' });
  }
});

app.patch('/api/cuenta/password', requireClienteAuth, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  if (!passwordActual || !passwordNueva || passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    const cliente = resultado.rows[0];
    if (!cliente) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    const coincide = await bcrypt.compare(passwordActual, cliente.password_hash);
    if (!coincide) return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
    const hash = await bcrypt.hash(passwordNueva, 12);
    await pool.query('UPDATE clientes_cuenta SET password_hash=$1 WHERE id=$2', [hash, cliente.id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('PATCH /api/cuenta/password:', error);
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
});

app.delete('/api/cuenta', requireClienteAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    delete req.session.clienteId;
    delete req.session.clienteNombre;
    delete req.session.clienteApellido;
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta:', error);
    res.status(500).json({ error: 'No se pudo eliminar la cuenta.' });
  }
});

app.get('/api/cuenta/pedidos', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM ordenes WHERE cliente_cuenta_id=$1 ORDER BY id DESC', [req.session.clienteId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/pedidos:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus pedidos.' });
  }
});

// ---------------------------------------------------------------------------
// Direcciones de envío guardadas (libreta de direcciones del cliente)
// ---------------------------------------------------------------------------
app.get('/api/cuenta/direcciones', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM direcciones_cliente WHERE cliente_cuenta_id=$1 ORDER BY id DESC', [req.session.clienteId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/direcciones:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus direcciones.' });
  }
});

function normalizarDireccionBody(body) {
  return {
    nombre_destinatario: String(body.nombreDestinatario || '').trim(),
    telefono_destinatario: String(body.telefonoDestinatario || '').trim() || null,
    calle: String(body.calle || '').trim() || null,
    numero: String(body.numero || '').trim() || null,
    colonia: String(body.colonia || '').trim() || null,
    cp: String(body.cp || '').trim() || null,
    ciudad: String(body.ciudad || '').trim() || null,
    estado: String(body.estado || '').trim() || null,
    tipo_domicilio: String(body.tipoDomicilio || '').trim() || null,
    notas_entrega: String(body.notasEntrega || '').trim() || null,
    lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
    lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null
  };
}

app.post('/api/cuenta/direcciones', requireClienteAuth, async (req, res) => {
  const d = normalizarDireccionBody(req.body);
  if (!d.nombre_destinatario || !d.calle) return res.status(400).json({ error: 'Nombre del destinatario y calle son obligatorios.' });
  try {
    const resultado = await pool.query(`
      INSERT INTO direcciones_cliente
        (cliente_cuenta_id, nombre_destinatario, telefono_destinatario, calle, numero, colonia, cp, ciudad, estado, tipo_domicilio, notas_entrega, lat, lng)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [req.session.clienteId, d.nombre_destinatario, d.telefono_destinatario, d.calle, d.numero, d.colonia, d.cp, d.ciudad, d.estado, d.tipo_domicilio, d.notas_entrega, d.lat, d.lng]);
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('POST /api/cuenta/direcciones:', error);
    res.status(500).json({ error: 'No se pudo guardar la dirección.' });
  }
});

app.put('/api/cuenta/direcciones/:id', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const d = normalizarDireccionBody(req.body);
  if (!d.nombre_destinatario || !d.calle) return res.status(400).json({ error: 'Nombre del destinatario y calle son obligatorios.' });
  try {
    const resultado = await pool.query(`
      UPDATE direcciones_cliente SET
        nombre_destinatario=$1, telefono_destinatario=$2, calle=$3, numero=$4, colonia=$5, cp=$6,
        ciudad=$7, estado=$8, tipo_domicilio=$9, notas_entrega=$10, lat=$11, lng=$12
      WHERE id=$13 AND cliente_cuenta_id=$14 RETURNING *
    `, [d.nombre_destinatario, d.telefono_destinatario, d.calle, d.numero, d.colonia, d.cp, d.ciudad, d.estado, d.tipo_domicilio, d.notas_entrega, d.lat, d.lng, id, req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Dirección no encontrada.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PUT /api/cuenta/direcciones/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar la dirección.' });
  }
});

app.delete('/api/cuenta/direcciones/:id', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM direcciones_cliente WHERE id=$1 AND cliente_cuenta_id=$2', [id, req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Dirección no encontrada.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta/direcciones/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar la dirección.' });
  }
});

// ---------------------------------------------------------------------------
// Recordatorios de fechas especiales
// Nota: esto guarda y muestra las fechas, pero todavía no envía avisos por
// correo/SMS (no hay un servicio de envíos configurado) -- eso quedaría como
// siguiente paso una vez que se dé de alta un proveedor de correo.
// ---------------------------------------------------------------------------
app.get('/api/cuenta/recordatorios', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM recordatorios_cliente WHERE cliente_cuenta_id=$1 ORDER BY fecha ASC', [req.session.clienteId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/recordatorios:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus recordatorios.' });
  }
});

app.post('/api/cuenta/recordatorios', requireClienteAuth, async (req, res) => {
  const { titulo, fecha, repetirAnual, notas } = req.body || {};
  if (!titulo?.trim() || !fecha) return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
  try {
    const resultado = await pool.query(
      `INSERT INTO recordatorios_cliente (cliente_cuenta_id, titulo, fecha, repetir_anual, notas) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.session.clienteId, titulo.trim(), fecha, repetirAnual !== false, notas?.trim() || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('POST /api/cuenta/recordatorios:', error);
    res.status(500).json({ error: 'No se pudo guardar el recordatorio.' });
  }
});

app.delete('/api/cuenta/recordatorios/:id', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM recordatorios_cliente WHERE id=$1 AND cliente_cuenta_id=$2', [id, req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Recordatorio no encontrado.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta/recordatorios/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar el recordatorio.' });
  }
});

// ---------------------------------------------------------------------------
// Programa de puntos -- se calcula en vivo a partir de pedidos ENTREGADOS
// (1 punto por cada $1 MXN gastado en productos, sin contar el envío). No hay
// una tabla de puntos que se pueda desincronizar: siempre refleja tus pedidos reales.
// ---------------------------------------------------------------------------
const META_PUNTOS = 3000;
app.get('/api/cuenta/puntos', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, creado_en, total, envio FROM ordenes WHERE cliente_cuenta_id=$1 AND estado='Entregado' ORDER BY creado_en ASC`,
      [req.session.clienteId]
    );
    const historial = resultado.rows.map(o => ({
      orden_id: o.id,
      fecha: o.creado_en,
      puntos: Math.max(0, Math.round(Number(o.total) - Number(o.envio || 0)))
    }));
    const totalPuntos = historial.reduce((s, h) => s + h.puntos, 0);
    res.json({ puntos: totalPuntos % META_PUNTOS, puntosTotales: totalPuntos, meta: META_PUNTOS, cuponesDisponibles: Math.floor(totalPuntos / META_PUNTOS), historial });
  } catch (error) {
    console.error('GET /api/cuenta/puntos:', error);
    res.status(500).json({ error: 'No se pudo cargar tu programa de puntos.' });
  }
});


app.get('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM usuarios_admin ORDER BY id ASC');
    res.json(resultado.rows.map(usuarioPublico));
  } catch (error) {
    console.error('GET /api/admin/usuarios:', error);
    res.status(500).json({ error: 'Error al cargar el equipo.' });
  }
});

app.post('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'editor';
  try {
    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO usuarios_admin (nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nombre.trim(), email.trim().toLowerCase(), hash, rolFinal]
    );
    res.status(201).json(usuarioPublico(resultado.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('POST /api/admin/usuarios:', error);
    res.status(500).json({ error: 'No se pudo crear el usuario.' });
  }
});

app.patch('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });

  const campos = [];
  const valores = [];
  let i = 1;

  if (typeof req.body.nombre === 'string' && req.body.nombre.trim()) { campos.push(`nombre=$${i++}`); valores.push(req.body.nombre.trim()); }
  if (req.body.rol === 'admin' || req.body.rol === 'editor') { campos.push(`rol=$${i++}`); valores.push(req.body.rol); }
  if (typeof req.body.activo === 'boolean') {
    if (id === req.session.usuarioId && req.body.activo === false) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    campos.push(`activo=$${i++}`); valores.push(req.body.activo);
  }
  if (typeof req.body.password === 'string' && req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    const hash = await bcrypt.hash(req.body.password, 12);
    campos.push(`password_hash=$${i++}`); valores.push(hash);
  }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });

  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE usuarios_admin SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(usuarioPublico(resultado.rows[0]));
  } catch (error) {
    console.error('PATCH /api/admin/usuarios/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  }
});

app.delete('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  if (id === req.session.usuarioId) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  try {
    const admins = await pool.query(`SELECT COUNT(*)::int AS n FROM usuarios_admin WHERE rol='admin' AND activo=true`);
    const objetivo = await pool.query('SELECT * FROM usuarios_admin WHERE id=$1', [id]);
    if (objetivo.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (objetivo.rows[0].rol === 'admin' && objetivo.rows[0].activo && admins.rows[0].n <= 1) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
    }
    await pool.query('DELETE FROM usuarios_admin WHERE id=$1', [id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/usuarios/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
  }
});

function productoValido(body) {
  const precio = Number(body.precio);
  return Boolean(body.nombre?.trim()) && Number.isFinite(precio) && precio >= 0;
}

function normalizarProducto(body) {
  const stockNum = Number(body.stock);
  return {
    nombre: String(body.nombre || '').trim(),
    descripcion: String(body.descripcion || '').trim() || null,
    especificaciones: String(body.especificaciones || '').trim() || null,
    precio: Number(body.precio),
    imagen_url: String(body.imagen_url || '').trim() || null,
    imagenes: String(body.imagenes || '').trim() || null,
    categoria: String(body.categoria || '').trim() || null,
    subcategoria: String(body.subcategoria || '').trim() || null,
    subsubcategoria: String(body.subsubcategoria || '').trim() || null,
    variante_personalizada: String(body.variante_personalizada || '').trim() || null,
    opcion_foto: Boolean(body.opcion_foto),
    tamanos: String(body.tamanos || '').trim() || null,
    cobertura: String(body.cobertura || '').trim() || null,
    stock: Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : 1,
    disponible: body.disponible === undefined ? true : Boolean(body.disponible)
  };
}

// Salud del servidor / conexión.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    console.error('Health check:', error.message);
    res.status(503).json({ ok: false });
  }
});

// API: Obtener catálogo disponible (pública, la usa la tienda).
app.get('/api/catalogo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM arreglos_florales
      WHERE COALESCE(disponible, true) = true
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/catalogo:', error);
    res.status(500).json({ error: 'Error del servidor al cargar el catálogo.' });
  }
});

// API: catálogo completo para el panel (incluye ocultos/agotados). Requiere sesión.
app.get('/api/admin/catalogo', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM arreglos_florales ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/admin/catalogo:', error);
    res.status(500).json({ error: 'Error del servidor al cargar el catálogo.' });
  }
});

// API: Obtener un producto por ID.
app.get('/api/catalogo/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }
  try {
    const result = await pool.query('SELECT * FROM arreglos_florales WHERE id = $1 AND COALESCE(disponible, true) = true', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('GET /api/catalogo/:id:', error);
    res.status(500).json({ error: 'Error del servidor al cargar el producto.' });
  }
});

// API: Crear producto. Requiere sesión.
app.post('/api/catalogo', requireAuth, async (req, res) => {
  if (!productoValido(req.body)) {
    return res.status(400).json({ error: 'Nombre y precio válido son obligatorios.' });
  }

  const p = normalizarProducto(req.body);
  try {
    const result = await pool.query(`
      INSERT INTO arreglos_florales
        (nombre, descripcion, especificaciones, precio, imagen_url, imagenes, categoria, subcategoria, subsubcategoria,
         variante_personalizada, opcion_foto, tamanos, cobertura, stock, disponible)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [p.nombre, p.descripcion, p.especificaciones, p.precio, p.imagen_url, p.imagenes, p.categoria,
        p.subcategoria, p.subsubcategoria, p.variante_personalizada, p.opcion_foto, p.tamanos, p.cobertura,
        p.stock, p.disponible]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/catalogo:', error);
    res.status(500).json({ error: 'Error al insertar el producto.' });
  }
});

// API: Editar producto. Requiere sesión.
app.put('/api/catalogo/:id', requireAuth, async (req, res) => {
  if (!productoValido(req.body)) {
    return res.status(400).json({ error: 'Nombre y precio válido son obligatorios.' });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }

  const p = normalizarProducto(req.body);
  try {
    const result = await pool.query(`
      UPDATE arreglos_florales
      SET nombre=$1, descripcion=$2, especificaciones=$3, precio=$4, imagen_url=$5, imagenes=$6,
          categoria=$7, subcategoria=$8, subsubcategoria=$9, variante_personalizada=$10,
          opcion_foto=$11, tamanos=$12, cobertura=$13, stock=$14, disponible=$15
      WHERE id=$16
      RETURNING *
    `, [p.nombre, p.descripcion, p.especificaciones, p.precio, p.imagen_url, p.imagenes, p.categoria,
        p.subcategoria, p.subsubcategoria, p.variante_personalizada, p.opcion_foto, p.tamanos,
        p.cobertura, p.stock, p.disponible, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('PUT /api/catalogo/:id:', error);
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
});

// API: Eliminar producto. Requiere sesión.
app.delete('/api/catalogo/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }

  try {
    const result = await pool.query('DELETE FROM arreglos_florales WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/catalogo/:id:', error);
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

// API: Subir imagen (para el formulario del panel). Requiere sesión.
app.post('/api/admin/subir-imagen', requireAuth, (req, res) => {
  subirImagen.single('imagen')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'No se pudo subir la imagen.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

// API: Crear pedido.
// El total se calcula en el servidor usando los precios de PostgreSQL.
const ENVIO_FIJO = 80;

app.post('/api/ordenes', async (req, res) => {
  const {
    cliente, telefono, direccion, fecha, dedicatoria, carrito,
    destinatarioTelefono, tipoDomicilio, notasEntrega, horarioEntrega,
    lat, lng, firma, esAnonimo, conEnvio, emailContacto
  } = req.body;

  if (!cliente?.trim() || !telefono?.trim() || !direccion?.trim() || !fecha || !Array.isArray(carrito) || carrito.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios del pedido.' });
  }
  if (!emailContacto?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContacto.trim())) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }

  const idsCarrito = carrito.map(item => Number(item.id));
  if (idsCarrito.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'El carrito contiene productos inválidos.' });
  }
  const ids = [...new Set(idsCarrito)];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productos = await client.query(`
      SELECT id, nombre, precio, imagen_url
      FROM arreglos_florales
      WHERE id = ANY($1::int[]) AND COALESCE(disponible, true) = true
    `, [ids]);

    if (productos.rowCount !== ids.length) {
      throw Object.assign(new Error('Uno o más productos ya no están disponibles.'), { statusCode: 409 });
    }

    const porId = new Map(productos.rows.map(p => [p.id, p]));
    const carritoConfirmado = carrito.map(item => {
      const producto = porId.get(Number(item.id));
      const cantidad = Math.max(1, Math.floor(Number(item.cantidad)) || 1);
      return {
        id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio),
        cantidad,
        imagen: producto.imagen_url || null,
        variante: typeof item.variante === 'string' ? item.variante.trim() || null : null
      };
    });

    const subtotal = carritoConfirmado.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const envio = conEnvio ? ENVIO_FIJO : 0;
    const total = subtotal + envio;

    const latNum = Number(lat);
    const lngNum = Number(lng);

    const result = await client.query(`
      INSERT INTO ordenes
        (cliente_nombre, cliente_telefono, direccion_entrega, fecha_entrega, dedicatoria, carrito, total,
         destinatario_telefono, tipo_domicilio, notas_entrega, horario_entrega, lat, lng, firma, es_anonimo, envio, cliente_cuenta_id, email_contacto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      cliente.trim(), telefono.trim(), direccion.trim(), fecha,
      dedicatoria?.trim() || null, JSON.stringify(carritoConfirmado), total,
      destinatarioTelefono?.trim() || null,
      tipoDomicilio?.trim() || null,
      notasEntrega?.trim() || null,
      horarioEntrega?.trim() || null,
      Number.isFinite(latNum) ? latNum : null,
      Number.isFinite(lngNum) ? lngNum : null,
      firma?.trim() || null,
      Boolean(esAnonimo),
      envio,
      // El ID de cuenta se toma de la sesión del servidor, nunca de lo que
      // mande el cliente -- así nadie puede adjudicarse pedidos ajenos.
      req.session && req.session.clienteId ? req.session.clienteId : null,
      emailContacto.trim().toLowerCase()
    ]);

    await client.query('COMMIT');
    res.status(201).json({ exito: true, orden: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/ordenes:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Error al crear el pedido.' });
  } finally {
    client.release();
  }
});

app.get('/categoria/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'categoria.html'));
});

// ---------------------------------------------------------------------------
// Panel de administración: pedidos
// ---------------------------------------------------------------------------
const ESTADOS_ORDEN_VALIDOS = ['Pendiente', 'Confirmado', 'En preparación', 'En camino', 'Entregado', 'Cancelado'];

app.get('/api/admin/ordenes', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ordenes ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/admin/ordenes:', error);
    res.status(500).json({ error: 'Error del servidor al cargar los pedidos.' });
  }
});

app.patch('/api/admin/ordenes/:id/estado', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de pedido inválido.' });
  }
  const { estado } = req.body;
  if (!ESTADOS_ORDEN_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado de pedido inválido.' });
  }
  try {
    const result = await pool.query('UPDATE ordenes SET estado=$1 WHERE id=$2 RETURNING *', [estado, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/ordenes/:id/estado:', error);
    res.status(500).json({ error: 'Error al actualizar el pedido.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: dashboard
// ---------------------------------------------------------------------------
app.get('/api/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const [productos, ordenesRecientes, stockBajo] = await Promise.all([
      pool.query('SELECT id, disponible, stock, categoria FROM arreglos_florales'),
      pool.query('SELECT * FROM ordenes ORDER BY id DESC LIMIT 400'),
      pool.query(`SELECT id, nombre, stock FROM arreglos_florales WHERE COALESCE(disponible,true)=true AND COALESCE(stock,1) <= 2 ORDER BY stock ASC LIMIT 10`)
    ]);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 6);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const ordenesActivas = ordenesRecientes.rows.filter(o => o.estado !== 'Cancelado');
    const sumaEnRango = (desde) => ordenesActivas
      .filter(o => new Date(o.creado_en) >= desde)
      .reduce((s, o) => s + Number(o.total || 0), 0);
    const contarEnRango = (desde) => ordenesActivas.filter(o => new Date(o.creado_en) >= desde).length;

    const conteoProductos = {};
    for (const orden of ordenesActivas) {
      const items = Array.isArray(orden.carrito) ? orden.carrito : [];
      for (const item of items) {
        const clave = item.nombre || 'Producto';
        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        conteoProductos[clave] = (conteoProductos[clave] || 0) + cantidad;
      }
    }
    const productosPopulares = Object.entries(conteoProductos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));

    res.json({
      productos: {
        total: productos.rows.length,
        disponibles: productos.rows.filter(p => p.disponible !== false).length,
        agotados: productos.rows.filter(p => p.disponible === false).length,
        categorias: new Set(productos.rows.map(p => p.categoria).filter(Boolean)).size
      },
      pedidos: {
        hoy: contarEnRango(hoy),
        semana: contarEnRango(inicioSemana),
        pendientes: ordenesRecientes.rows.filter(o => o.estado === 'Pendiente').length,
        totalHistorico: ordenesRecientes.rows.length
      },
      ingresos: {
        hoy: sumaEnRango(hoy),
        semana: sumaEnRango(inicioSemana),
        mes: sumaEnRango(inicioMes)
      },
      productosPopulares,
      stockBajo: stockBajo.rows,
      ultimosPedidos: ordenesRecientes.rows.slice(0, 6)
    });
  } catch (error) {
    console.error('GET /api/admin/dashboard:', error);
    res.status(500).json({ error: 'No se pudo cargar el dashboard.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: finanzas
// ---------------------------------------------------------------------------
app.get('/api/admin/finanzas', requireAuth, async (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 30, 7), 180);
  try {
    const serieDiaria = await pool.query(`
      SELECT DATE(creado_en) AS fecha, COALESCE(SUM(total),0) AS total, COUNT(*)::int AS pedidos
      FROM ordenes
      WHERE estado != 'Cancelado' AND creado_en >= NOW() - INTERVAL '${dias} days'
      GROUP BY DATE(creado_en)
      ORDER BY fecha ASC
    `);

    const todas = await pool.query(`SELECT * FROM ordenes WHERE creado_en >= NOW() - INTERVAL '${dias} days'`);
    const activas = todas.rows.filter(o => o.estado !== 'Cancelado');
    const canceladas = todas.rows.length - activas.length;

    const ingresoPorProducto = {};
    for (const orden of activas) {
      const items = Array.isArray(orden.carrito) ? orden.carrito : [];
      for (const item of items) {
        const clave = item.nombre || 'Producto';
        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        if (!ingresoPorProducto[clave]) ingresoPorProducto[clave] = { nombre: clave, unidades: 0, ingresos: 0 };
        ingresoPorProducto[clave].unidades += cantidad;
        ingresoPorProducto[clave].ingresos += Number(item.precio || 0) * cantidad;
      }
    }
    const topProductos = Object.values(ingresoPorProducto).sort((a, b) => b.ingresos - a.ingresos).slice(0, 8);

    const ingresosTotales = activas.reduce((s, o) => s + Number(o.total || 0), 0);
    const ticketPromedio = activas.length ? ingresosTotales / activas.length : 0;

    const porEstado = {};
    for (const o of todas.rows) porEstado[o.estado || 'Pendiente'] = (porEstado[o.estado || 'Pendiente'] || 0) + 1;

    res.json({
      rango_dias: dias,
      resumen: {
        ingresosTotales,
        pedidosTotales: todas.rows.length,
        pedidosCancelados: canceladas,
        ticketPromedio
      },
      serieDiaria: serieDiaria.rows,
      topProductos,
      porEstado
    });
  } catch (error) {
    console.error('GET /api/admin/finanzas:', error);
    res.status(500).json({ error: 'No se pudo cargar la información financiera.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: clientes (derivados de los pedidos)
// ---------------------------------------------------------------------------
app.get('/api/admin/clientes', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        cliente_telefono AS telefono,
        (array_agg(cliente_nombre ORDER BY creado_en DESC))[1] AS nombre,
        (array_agg(direccion_entrega ORDER BY creado_en DESC))[1] AS ultima_direccion,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(total) FILTER (WHERE estado != 'Cancelado'), 0) AS total_gastado,
        MAX(creado_en) AS ultimo_pedido,
        MIN(creado_en) AS primer_pedido
      FROM ordenes
      GROUP BY cliente_telefono
      ORDER BY total_gastado DESC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/clientes:', error);
    res.status(500).json({ error: 'No se pudo cargar la lista de clientes.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: zonas de cobertura (envíos)
// ---------------------------------------------------------------------------
app.get('/api/zonas', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT nombre, etiqueta FROM zonas_cobertura WHERE activa=true ORDER BY orden ASC, etiqueta ASC');
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/zonas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las zonas.' });
  }
});

app.get('/api/admin/zonas', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM zonas_cobertura ORDER BY orden ASC, etiqueta ASC');
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/zonas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las zonas.' });
  }
});

app.post('/api/admin/zonas', requireAuth, async (req, res) => {
  const { nombre, etiqueta, orden } = req.body || {};
  if (!nombre?.trim() || !etiqueta?.trim()) {
    return res.status(400).json({ error: 'El nombre y la etiqueta son obligatorios.' });
  }
  try {
    const resultado = await pool.query(
      'INSERT INTO zonas_cobertura (nombre, etiqueta, orden) VALUES ($1,$2,$3) RETURNING *',
      [nombre.trim(), etiqueta.trim(), Number.isFinite(Number(orden)) ? Number(orden) : 0]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una zona con ese nombre.' });
    console.error('POST /api/admin/zonas:', error);
    res.status(500).json({ error: 'No se pudo crear la zona.' });
  }
});

app.patch('/api/admin/zonas/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.etiqueta === 'string' && req.body.etiqueta.trim()) { campos.push(`etiqueta=$${i++}`); valores.push(req.body.etiqueta.trim()); }
  if (typeof req.body.activa === 'boolean') { campos.push(`activa=$${i++}`); valores.push(req.body.activa); }
  if (Number.isFinite(Number(req.body.orden))) { campos.push(`orden=$${i++}`); valores.push(Number(req.body.orden)); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE zonas_cobertura SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Zona no encontrada.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/zonas/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar la zona.' });
  }
});

app.delete('/api/admin/zonas/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM zonas_cobertura WHERE id=$1', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Zona no encontrada.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/zonas/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar la zona.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: configuración general de la tienda
// ---------------------------------------------------------------------------
app.get('/api/admin/configuracion', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT clave, valor FROM configuracion');
    const config = {};
    for (const fila of resultado.rows) config[fila.clave] = fila.valor;
    res.json(config);
  } catch (error) {
    console.error('GET /api/admin/configuracion:', error);
    res.status(500).json({ error: 'No se pudo cargar la configuración.' });
  }
});

app.put('/api/admin/configuracion', requireAuth, requireAdmin, async (req, res) => {
  const entradas = Object.entries(req.body || {}).filter(([clave]) => typeof clave === 'string' && clave.trim());
  if (entradas.length === 0) return res.status(400).json({ error: 'No hay valores para guardar.' });
  try {
    for (const [clave, valor] of entradas) {
      await pool.query(
        `INSERT INTO configuracion (clave, valor) VALUES ($1,$2)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
        [clave.trim(), valor === null || valor === undefined ? null : String(valor)]
      );
    }
    const resultado = await pool.query('SELECT clave, valor FROM configuracion');
    const config = {};
    for (const fila of resultado.rows) config[fila.clave] = fila.valor;
    res.json(config);
  } catch (error) {
    console.error('PUT /api/admin/configuracion:', error);
    res.status(500).json({ error: 'No se pudo guardar la configuración.' });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function iniciar() {
  try {
    await inicializarDB();
    app.listen(port, () => console.log(`Reserva Floral ejecutándose en puerto ${port}`));
  } catch (error) {
    console.error('No se pudo inicializar la aplicación:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

iniciar();
