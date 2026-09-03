require('dotenv').config();

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Las páginas de producto usan el mismo cascarón de la tienda; el frontend carga el ID desde la URL.
app.get('/producto/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    "ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS carrito JSONB NOT NULL DEFAULT '[]'::jsonb"
  ];

  for (const query of alterQueries) {
    await pool.query(query);
  }

  console.log('Base de datos lista.');
}

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

// API: Obtener catálogo disponible.
// El panel de administración pasa ?todos=1 para ver también los productos
// marcados como no disponibles (agotados) -- la tienda nunca manda ese parámetro,
// así que su comportamiento no cambia.
app.get('/api/catalogo', async (req, res) => {
  const verTodos = req.query.todos === '1' || req.query.todos === 'true';
  try {
    const result = await pool.query(`
      SELECT *
      FROM arreglos_florales
      ${verTodos ? '' : 'WHERE COALESCE(disponible, true) = true'}
      ORDER BY id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/catalogo:', error);
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

// API: Crear producto.
app.post('/api/catalogo', async (req, res) => {
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

// API: Editar producto.
app.put('/api/catalogo/:id', async (req, res) => {
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

// API: Eliminar producto.
app.delete('/api/catalogo/:id', async (req, res) => {
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

// API: Crear pedido.
// El total se calcula en el servidor usando los precios de PostgreSQL.
app.post('/api/ordenes', async (req, res) => {
  const { cliente, telefono, direccion, fecha, dedicatoria, carrito } = req.body;

  if (!cliente?.trim() || !telefono?.trim() || !direccion?.trim() || !fecha || !Array.isArray(carrito) || carrito.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios del pedido.' });
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
      return {
        id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio),
        imagen: producto.imagen_url || null,
        variante: typeof item.variante === 'string' ? item.variante.trim() || null : null
      };
    });

    const total = carritoConfirmado.reduce((sum, item) => sum + item.precio, 0);

    const result = await client.query(`
      INSERT INTO ordenes
        (cliente_nombre, cliente_telefono, direccion_entrega, fecha_entrega, dedicatoria, carrito, total)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [cliente.trim(), telefono.trim(), direccion.trim(), fecha,
        dedicatoria?.trim() || null, JSON.stringify(carritoConfirmado), total]);

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

// --- Panel de administración: pedidos ---
// No hay sistema de autenticación todavía (ver nota en README/entrega); estas
// rutas quedan abiertas igual que las de /api/catalogo que ya existían.
const ESTADOS_ORDEN_VALIDOS = ['Pendiente', 'Confirmado', 'En preparación', 'En camino', 'Entregado', 'Cancelado'];

app.get('/api/admin/ordenes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ordenes ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/admin/ordenes:', error);
    res.status(500).json({ error: 'Error del servidor al cargar los pedidos.' });
  }
});

app.patch('/api/admin/ordenes/:id/estado', async (req, res) => {
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
