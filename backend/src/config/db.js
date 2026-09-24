import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Configuración SSL: Habilitar si se conecta a un host remoto (como AWS RDS) o si se especifica DB_SSL
const isRemoteHost = process.env.DB_HOST && process.env.DB_HOST !== 'db' && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1';
const sslConfig = process.env.DB_SSL === 'true' || isRemoteHost ? { rejectUnauthorized: false } : false;

// Configuración del Pool de conexiones a PostgreSQL mediante variables de entorno
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'pizzeria_user',
  password: process.env.DB_PASSWORD || 'pizzeria_pass_1234',
  database: process.env.DB_NAME || 'pizzeria_db',
  ssl: sslConfig,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 4000,
});

// Evento al conectar un nuevo cliente al Pool
pool.on('connect', () => {
  console.log('📦 [DB] Nueva conexión establecida con PostgreSQL');
});

// Evento de error inesperado en el Pool
pool.on('error', (err) => {
  console.error('❌ [DB Error] Error inesperado en el cliente inactivo de PostgreSQL:', err.message);
});

/**
 * Función auxiliar para ejecutar consultas SQL con control y registro de tiempos
 * @param {string} text - Consulta SQL parametrizada
 * @param {Array} params - Parámetros de la consulta
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ [DB Query] Ejecutada en ${duration}ms | Filas: ${res.rowCount}`);
    }
    return res;
  } catch (error) {
    console.error('❌ [DB Error] Fallo al ejecutar consulta:', {
      text,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Auto-inicialización del esquema DDL/DML si la base de datos está vacía (ideal para AWS RDS)
 */
export const initSchemaIfNeeded = async () => {
  try {
    const checkTable = await query(`
      SELECT to_regclass('public.pizzas') AS table_exists;
    `);
    if (!checkTable.rows[0].table_exists) {
      console.log('🔄 [DB Auto-Init] Tablas no encontradas. Aprovisionando esquema inicial en la base de datos...');
      await query(`
        CREATE TABLE IF NOT EXISTS categorias (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            icono VARCHAR(10) DEFAULT '🍕'
        );
        CREATE TABLE IF NOT EXISTS pizzas (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            descripcion TEXT NOT NULL,
            precio NUMERIC(6, 2) NOT NULL CHECK (precio >= 0),
            imagen_url TEXT,
            categoria_id INT REFERENCES categorias(id) ON DELETE SET NULL,
            disponible BOOLEAN DEFAULT TRUE,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS ingredientes (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            alergeno BOOLEAN DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS pizza_ingredientes (
            pizza_id INT REFERENCES pizzas(id) ON DELETE CASCADE,
            ingrediente_id INT REFERENCES ingredientes(id) ON DELETE CASCADE,
            PRIMARY KEY (pizza_id, ingrediente_id)
        );
        CREATE TABLE IF NOT EXISTS mesas (
            id SERIAL PRIMARY KEY,
            numero INT NOT NULL UNIQUE,
            capacidad INT DEFAULT 4,
            estado VARCHAR(20) DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'cuenta_pedida', 'reservada'))
        );
        CREATE TABLE IF NOT EXISTS pedidos (
            id SERIAL PRIMARY KEY,
            tipo_pedido VARCHAR(20) DEFAULT 'mesa' CHECK (tipo_pedido IN ('mesa', 'domicilio', 'recoger')),
            mesa_numero INT,
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'en_reparto', 'listo', 'servido', 'entregado', 'cancelado')),
            total NUMERIC(8, 2) DEFAULT 0.00 CHECK (total >= 0),
            cliente_nombre VARCHAR(100) DEFAULT 'Cliente',
            cliente_telefono VARCHAR(30),
            cliente_direccion TEXT,
            metodo_pago VARCHAR(30) DEFAULT 'efectivo_entrega',
            observaciones TEXT
        );
        CREATE TABLE IF NOT EXISTS lineas_pedido (
            id SERIAL PRIMARY KEY,
            pedido_id INT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
            pizza_id INT NOT NULL REFERENCES pizzas(id),
            cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
            precio_unitario NUMERIC(6, 2) NOT NULL CHECK (precio_unitario >= 0),
            notas VARCHAR(255)
        );
        INSERT INTO categorias (nombre, icono) VALUES
        ('Clásicas', '🍕'), ('Especiales', '⭐'), ('Gourmet', '👑'), ('Bebidas y Postres', '🥤')
        ON CONFLICT (nombre) DO NOTHING;
        INSERT INTO pizzas (nombre, descripcion, precio, imagen_url, categoria_id, disponible) VALUES
        ('Margherita Clásica', 'La auténtica reina de Nápoles: salsa de tomate San Marzano, mozzarella Fior di Latte fresca, hojas de albahaca fresca y aceite de oliva virgen extra.', 9.50, 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=800&q=80', 1, TRUE),
        ('Diávolo Pepperoni', 'Para los amantes del toque picante: base de tomate, doble mozzarella fundida y generosas rodajas de pepperoni artesanal curado con orégano silvestre.', 12.00, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=800&q=80', 1, TRUE),
        ('Cuatro Quesos Cremosa', 'Una armonía de quesos seleccionados: mozzarella Fior di Latte, gorgonzola cremoso, queso de cabra suave y lascas de parmesano curado 24 meses.', 13.50, 'https://images.unsplash.com/photo-1573821663912-569905455b1c?auto=format&fit=crop&w=800&q=80', 1, TRUE),
        ('Barbacoa Texas Crunch', 'Salsa barbacoa ahumada artesanal, carne picada de vacuno seleccionada, bacon crujiente, cebolla caramelizada y mozzarella fundente.', 14.00, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80', 2, TRUE),
        ('Tartufo & Funghi Gourmet', 'Base blanca de crema de trufa negra, mezcla de champiñones portobello salteados, mozzarella, jamón ibérico de bellota y un toque de rúcula fresca.', 15.50, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80', 3, TRUE),
        ('Hawaiana Especial', 'Base de tomate, mozzarella fundente, jamón york de primera calidad y piña asada al horno con un toque de miel especiada.', 11.50, 'https://images.unsplash.com/photo-1595708684082-a173bb3a06c5?auto=format&fit=crop&w=800&q=80', 2, TRUE)
        ON CONFLICT DO NOTHING;
        INSERT INTO mesas (numero, capacidad, estado) VALUES
        (1, 2, 'libre'), (2, 4, 'ocupada'), (3, 4, 'libre'), (4, 6, 'libre'),
        (5, 2, 'libre'), (6, 8, 'libre'), (7, 4, 'libre'), (8, 4, 'libre')
        ON CONFLICT (numero) DO NOTHING;
      `);
      console.log('✅ [DB Auto-Init] Base de datos aprovisionada con tablas y datos semilla iniciales.');
    }
  } catch (err) {
    console.error('⚠️ [DB Auto-Init Warning]:', err.message);
  }
};

/**
 * Prueba la conectividad con la base de datos al arrancar el servidor
 */
export const testConnection = async () => {
  try {
    const res = await query('SELECT NOW() AS now, current_database() AS db_name');
    console.log(`✅ [DB Conectada] Base de datos "${res.rows[0].db_name}" lista a las ${res.rows[0].now}`);
    await initSchemaIfNeeded();
    return true;
  } catch (error) {
    console.error('⚠️ [DB Warning] No se pudo conectar a la base de datos inmediatamente. Reintentando en siguientes peticiones...', error.message);
    return false;
  }
};

export default pool;
