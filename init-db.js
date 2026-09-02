require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const crearTabla = `
  CREATE TABLE IF NOT EXISTS arreglos_florales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    imagen_url TEXT,
    categoria VARCHAR(50),
    stock INTEGER DEFAULT 1,
    disponible BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

async function inicializarBaseDeDatos() {
  try {
    console.log('Conectando a Railway para crear la estructura...');
    await pool.query(crearTabla);
    console.log('¡Éxito! La tabla "arreglos_florales" está lista.');
    
    // Insertaremos un arreglo de prueba para confirmar
    const insertarPrueba = `
      INSERT INTO arreglos_florales (nombre, descripcion, precio, categoria)
      VALUES ('Ramo Buchón Clásico', 'Arreglo premium de 50 rosas rojas con follaje', 1250.00, 'Ramos')
    `;
    await pool.query(insertarPrueba);
    console.log('Arreglo de prueba añadido al inventario.');
    
  } catch (error) {
    console.error('Error al estructurar la base de datos:', error);
  } finally {
    pool.end(); // Cierra la conexión al terminar
  }
}

inicializarBaseDeDatos();