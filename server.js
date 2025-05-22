const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2'); // Importa el driver de MySQL
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});



// Configuración de la conexión a MySQL
const pool = mysql.createPool({
  host: process.env.HOST || 'localhost',
  user: process.env.USER || 'root',
  password: process.env.PASSWORD || '',
  database: process.env.DATABASE || 'railway',
  port: process.env.PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware para manejar errores de conexión
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error al conectar a MySQL:', err.message);
  } else {
    console.log('Conectado a la base de datos MySQL.');
    connection.release();
  }
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  pool.execute('SELECT * FROM users WHERE user = ? AND password = ?', 
    [username, password], 
    (err, results) => {
      if (err) {
        console.error('Error en la consulta de login:', err);
        return res.status(500).json({ message: 'Error interno del servidor' });
      }
      
      if (results.length > 0) {
        // Devuelve el ID del usuario en la respuesta
        res.status(200).json({ 
          message: 'Login exitoso',
          userId: results[0].id // Esto es lo nuevo que necesitas
        });
      } else {
        res.status(401).json({ message: 'Credenciales incorrectas' });
      }
  });
});

app.post('/register', (req, res) => {
  const { username, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Las contraseñas no coinciden' });
  }

  pool.execute('SELECT * FROM users WHERE user = ?', [username], (err, results) => {
    if (err) {
      console.error('Error en la consulta de verificación de usuario:', err);
      return res.status(500).json({ message: 'Error interno del servidor' });
    }
    if (results.length > 0) {
      return res.status(409).json({ message: 'El nombre de usuario ya existe' });
    }

    pool.execute('INSERT INTO users (user, password) VALUES (?, ?)', [username, password], (err, results) => {
      if (err) {
        console.error('Error al registrar el usuario:', err);
        return res.status(500).json({ message: 'Error al registrar el usuario' });
      }
      res.status(201).json({ message: 'Registro exitoso', userId: results.insertId });
    });
  });
});
app.get('/', (req, res) => {
  res.send('Backend funcionando');
});

const storage = multer.memoryStorage();
const upload = multer({ storage });


app.post('/creacampana', upload.single('image'), (req, res) => {
  const { description, user_id } = req.body; // Ahora recibimos el user_id
  const imageBuffer = req.file.buffer;
  const imageMimeType = req.file.mimetype;

  if (!imageBuffer || !description || !user_id) {
    return res.status(400).json({ message: 'Faltan datos' });
  }

  pool.execute(
    'INSERT INTO campana (image_data, image_type, description, user_id) VALUES (?, ?, ?, ?)',
    [imageBuffer, imageMimeType, description, user_id],
    (err, results) => {
      if (err) {
        console.error('Error al insertar campaña:', err);
        return res.status(500).json({ message: 'Error al guardar campaña' });
      }
      res.status(201).json({ message: 'Campaña creada', id: results.insertId });
    }
  );
});


app.post('/posts', (req, res) => {
  const { user } = req.body;
  pool.execute(
    'SELECT ID FROM users WHERE user = ?',
    [user],
    (err, results) => {
      if (err) {
        console.error('Error al consultar el ID del usuario:', err);
        return res.status(500).json({ error: 'Error al consultar el ID del usuario' });
      }
      if (results.length > 0) {
        // Si se encuentra el usuario, respondemos con un 200 OK y el ID
        res.status(200).json({ userId: results[0].ID });
      } else {
        // Si no se encuentra el usuario, puedes responder con un 404 Not Found
        res.status(404).json({ error: 'Usuario no encontrado' });
      }
    }
  );
});
app.get('/usercampana', (req, res) => {
  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).json({ message: 'Se requiere user_id' });
  }

  pool.execute(
    'SELECT id, image_data, image_type, description, created_at FROM campana WHERE user_id = ?',
    [userId],
    (err, results) => {
      if (err) {
        console.error('Error al obtener campañas:', err);
        return res.status(500).json({ message: 'Error al obtener campañas' });
      }

      // Convertir el BLOB a base64 para que React pueda mostrarlo
      const campaigns = results.map(campaign => ({
        ...campaign,
        image_data: campaign.image_data.toString('base64')
      }));

      res.status(200).json(campaigns);
    }
  );
});

app.get('/getuserid', (req, res) => {
  const username = req.query.username;

  if (!username) {
    return res.status(400).json({ message: 'Se requiere username' });
  }

  pool.execute(
    'SELECT id FROM users WHERE user = ?',
    [username],
    (err, results) => {
      if (err) {
        console.error('Error al buscar userId:', err);
        return res.status(500).json({ error: 'Error al buscar userId' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
      res.status(200).json({ user_id: results[0].id });
    }
  );
});

app.get('/campaign/:id', (req, res) => {
  const { id } = req.params;

  pool.execute(
    'SELECT id, image_data, image_type, description, created_at, user_id FROM campana WHERE id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al obtener campaña:', err);
        return res.status(500).json({ message: 'Error al obtener campaña' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'Campaña no encontrada' });
      }

      const campaign = results[0];
      // Convertir imagen BLOB a base64
      campaign.image_data = campaign.image_data.toString('base64');

      res.status(200).json(campaign);
    }
  );
});



app.get('/referidos', (req, res) => {
  const { user_id, campaign_id } = req.query;
  if (!user_id || !campaign_id) return res.status(400).json({ message: 'Faltan datos' });

  pool.execute(
    'SELECT hits FROM qr_codes WHERE user_id = ? AND campaign_id = ?',
    [user_id, campaign_id],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Error interno' });

      if (results.length === 0) return res.json({ total: 0 });

      res.json({ total: results[0].hits });
    }
  );
});

app.post('/generate-referral', (req, res) => {
  const { userId, campaignId } = req.body;

  if (!userId || !campaignId) {
    return res.status(400).json({ message: 'Faltan datos' });
  }

  const uniqueCode = `${campaignId}_${userId}`;

  pool.execute(
    'INSERT IGNORE INTO referrals (campaign_id, user_id, code) VALUES (?, ?, ?)',
    [campaignId, userId, uniqueCode],
    (err, results) => {
      if (err) {
        console.error('Error al generar código de referido:', err);
        return res.status(500).json({ message: 'Error interno del servidor' });
      }

      const referralUrl = `http://localhost:3001/scan?ref=${uniqueCode}`;
      res.status(200).json({ url: referralUrl });
    }
  );
});
app.get('/scan', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token requerido');

  // Buscar el código y actualizar hits
  pool.execute(
  'UPDATE qr_codes SET hits = hits + 1, referrals = referrals + 1 WHERE qr_token = ?',
  [token],
  (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error interno');
      }

      if (results.affectedRows === 0) {
        return res.status(404).send('Token no válido');
      }

      // Redirigir a donde quieras (ej: página principal o de campaña)
      res.redirect('http://localhost:3000/dashboard');
    }
  );
});
app.get('/referrals/:user_id/:campaign_id', async (req, res) => {
  const { user_id, campaign_id } = req.params;

  try {
    const [rows] = await connection.promise().query(
      'SELECT referrals FROM qr_codes WHERE user_id = ? AND campaign_id = ?',
      [user_id, campaign_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'QR no encontrado' });
    }

    res.json({ referrals: rows[0].referrals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener referidos' });
  }
});



app.post('/generate-qr', async (req, res) => {
  const { user_id, campaign_id } = req.body;

  try {
    const [existing] = await pool.promise().query(
      'SELECT qr_token FROM qr_codes WHERE user_id = ? AND campaign_id = ?',
      [user_id, campaign_id]
    );

    if (existing.length > 0) {
      return res.json({ qr_token: existing[0].qr_token });
    }

    const qr_token = uuidv4();

    await pool.promise().query(
      'INSERT INTO qr_codes (user_id, campaign_id, qr_token) VALUES (?, ?, ?)',
      [user_id, campaign_id, qr_token]
    );

    res.json({ qr_token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error generando QR' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});