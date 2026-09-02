require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.static('public'));
const port = process.env.PORT || 3000;

// Configuración de la bóveda PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ruta de prueba para verificar la conexión
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      mensaje: '¡Conexión exitosa a la base de datos de Reserva Floral!',
      hora_servidor: result.rows[0].now
    });
  } catch (error) {
    console.error('Error conectando a la base de datos:', error);
    res.status(500).json({ error: 'Falla en la conexión' });
  }
});

// Ruta para ver el catálogo de arreglos florales
app.get('/api/catalogo', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM arreglos_florales');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el catálogo' });
  }
});

app.listen(port, () => {
  console.log(`Servidor de Reserva Floral corriendo en el puerto ${port}`);
});
