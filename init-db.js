require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
  CREATE TABLE IF NOT EXISTS arreglos_florales (
    id SERIAL PRIMARY KEY,
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

  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS imagenes TEXT;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS especificaciones TEXT;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS opcion_foto BOOLEAN DEFAULT false;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS tamanos TEXT;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS cobertura TEXT;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS subcategoria VARCHAR(100);
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS subsubcategoria VARCHAR(100);
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS variante_personalizada TEXT;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 1;
  ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT true;
  ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS dedicatoria TEXT;
  ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS carrito JSONB NOT NULL DEFAULT '[]'::jsonb;
`;

const zonasIniciales = [
  ['Tampico', 'Tampico', 1],
  ['Madero', 'Cd. Madero', 2],
  ['Altamira', 'Altamira', 3],
  ['Monterrey', 'Monterrey', 4],
  ['CDMX', 'CDMX', 5]
];

(async () => {
  try {
    console.log('Conectando a PostgreSQL...');
    await pool.query(sql);
    for (const [nombre, etiqueta, orden] of zonasIniciales) {
      await pool.query('INSERT INTO zonas_cobertura (nombre, etiqueta, orden) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING', [nombre, etiqueta, orden]);
    }
    console.log('Base de datos lista. No se insertaron productos de prueba.');
    console.log('Nota: la cuenta del panel de administración se crea desde /admin.html la primera vez que lo abras.');
  } catch (error) {
    console.error('Error al estructurar la base de datos:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
