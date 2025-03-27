process.env.TZ = 'Asia/Kolkata'; // Top of file
const mysql = require("mysql2");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// MySQL Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Aa1manav",
  database: "dbms_project"
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
    return;
  }
  console.log("✅ Connected to MySQL database");
});


// ====================== AUTHENTICATION ENDPOINTS ======================

// Common Login Handler
const handleLogin = async (req, res, tableName, idField, nameField) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ 
      success: false,
      message: "Email and password are required" 
    });
  }

  const sql = `SELECT * FROM ${tableName} WHERE email = ?`;
  
  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("⚠️ Database Error:", err);
      return res.status(500).json({ 
        success: false,
        message: "Database error",
        error: err.message 
      });
    }

    if (results.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const user = results[0];
    
    try {
      const isMatch = await bcrypt.compare(password, user.password);
      
      if (isMatch) {
        res.status(200).json({
          success: true,
          message: "Login successful",
          user: {
            id: user[idField],
            name: user[nameField],
            email: user.email
          }
        });
      } else {
        res.status(401).json({ 
          success: false,
          message: "Invalid email or password" 
        });
      }
    } catch (error) {
      console.error("⚠️ Bcrypt Error:", error);
      res.status(500).json({ 
        success: false,
        message: "Authentication error",
        error: error.message 
      });
    }
  });
};

// Signup Endpoint
app.post("/signup", async (req, res) => {
  const { role, name, email, phone, password } = req.body;

  // Validation
  if (!role || !name || !email || !phone || !password) {
    return res.status(400).json({ 
      success: false,
      message: "All fields are required" 
    });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ 
      success: false,
      message: "Phone must be exactly 10 digits" 
    });
  }

  const tableName = role === "owner" ? "owners" : "users";
  const nameField = role === "owner" ? "owner_name" : "name";
  const idField = role === "owner" ? "ownerID" : "userID";

  try {
    // Check if email already exists
    const checkSql = `SELECT * FROM ${tableName} WHERE email = ?`;
    db.query(checkSql, [email], async (err, results) => {
      if (err) {
        console.error("⚠️ Database Error:", err);
        return res.status(500).json({ 
          success: false,
          message: "Database error",
          error: err.message 
        });
      }

      if (results.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: "Email already exists" 
        });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const insertSql = `INSERT INTO ${tableName} (${nameField}, email, phone, password) VALUES (?, ?, ?, ?)`;
      
      db.query(insertSql, [name, email, phone, hashedPassword], (err, result) => {
        if (err) {
          console.error("⚠️ Database Error:", err);
          return res.status(500).json({ 
            success: false,
            message: "Database error",
            error: err.message 
          });
        }

        res.status(201).json({
          success: true,
          message: "Signup successful",
          id: result.insertId
        });
      });
    });
  } catch (error) {
    console.error("⚠️ Server Error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error",
      error: error.message 
    });
  }
});

// User Login
app.post("/login/user", async (req, res) => {
  await handleLogin(req, res, "users", "userID", "name");
});

// Owner Login
app.post("/login/owner", async (req, res) => {
  await handleLogin(req, res, "owners", "ownerID", "owner_name");
});

// ====================== CAR & BOOKING ENDPOINTS ======================

// Get available cars by location
app.get("/cars/available", async (req, res) => {
  const { location } = req.query;
  
  if (!location) {
    return res.status(400).json({ 
      success: false,
      message: "Location parameter is required" 
    });
  }

  try {
    const [cars] = await db.promise().query(
      `SELECT c.*, o.owner_name 
       FROM cars c
       JOIN owners o ON c.ownerID = o.ownerID
       WHERE c.city = ?`,
      [location]
    );

    res.status(200).json({
      success: true,
      cars,
      count: cars.length
    });

  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch available cars",
      error: error.message 
    });
  }
});

// Get car details by ID
app.get("/cars/:carId", async (req, res) => {
  try {
    const [car] = await db.promise().query(
      `SELECT c.*, o.owner_name, o.email as owner_email, o.phone as owner_phone
       FROM cars c
       JOIN owners o ON c.ownerID = o.ownerID
       WHERE c.cars_id = ?`,
      [req.params.carId]
    );

    if (car.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Car not found"
      });
    }

    res.status(200).json({
      success: true,
      car: car[0]
    });

  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch car details",
      error: error.message
    });
  }
});

// Get cities for search dropdown
app.get("/get-cities", (req, res) => {
  const sql = "SELECT DISTINCT city FROM cars";
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("⚠️ Database Error:", err);
      return res.status(500).json({ 
        success: false,
        message: "Database error",
        error: err.message 
      });
    }

    const cities = results.map(row => row.city);
    res.status(200).json({ 
      success: true,
      cities 
    });
  });
});

// Add new car (for owners)
app.post("/cars", async (req, res) => {
  const { car_name, model, price_per_day, city, ownerID } = req.body;

  // Validation
  if (!car_name || !model || !price_per_day || !city || !ownerID) {
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }

  try {
    // Verify owner exists
    const [owner] = await db.promise().query(
      "SELECT ownerID FROM owners WHERE ownerID = ?", 
      [ownerID]
    );

    if (!owner.length) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    // Insert new car
    const [result] = await db.promise().query(
      `INSERT INTO cars 
       (car_name, model, price_per_day, city, ownerID) 
       VALUES (?, ?, ?, ?, ?)`,
      [car_name, model, price_per_day, city, ownerID]
    );

    res.status(201).json({
      success: true,
      message: "Car added successfully",
      car_id: result.insertId
    });

  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add car",
      error: error.message
    });
  }
});

// Get cars by owner (for owner dashboard)
app.get("/cars", async (req, res) => {
  const { ownerID } = req.query;

  if (!ownerID || isNaN(ownerID)) {
    return res.status(400).json({
      success: false,
      message: "Valid owner ID is required"
    });
  }

  try {
    const [cars] = await db.promise().query(
      `SELECT cars_id, car_name, model, price_per_day, city 
       FROM cars WHERE ownerID = ?`,
      [ownerID]
    );

    res.status(200).json({
      success: true,
      cars,
      count: cars.length
    });

  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch cars",
      error: error.message
    });
  }
});

// Delete car (for owners)
app.delete("/cars/:cars_id", async (req, res) => {
  const { cars_id } = req.params;
  const { ownerID } = req.body;

  if (!ownerID || isNaN(cars_id)) {
    return res.status(400).json({
      success: false,
      message: "Valid owner ID and car ID are required"
    });
  }

  try {
    // Verify ownership
    const [car] = await db.promise().query(
      "SELECT ownerID FROM cars WHERE cars_id = ?",
      [cars_id]
    );

    if (!car.length) {
      return res.status(404).json({
        success: false,
        message: "Car not found"
      });
    }

    if (car[0].ownerID != ownerID) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this car"
      });
    }

    // Delete the car
    await db.promise().query(
      "DELETE FROM cars WHERE cars_id = ?",
      [cars_id]
    );

    res.status(200).json({
      success: true,
      message: "Car deleted successfully"
    });

  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete car",
      error: error.message
    });
  }
});

// ====================== BOOKING MANAGEMENT ENDPOINTS ======================

// Create trip confirmation request
app.post('/trip-confirmations', async (req, res) => {
  const { userId, carId, startDate, endDate } = req.body;

  // Validate input
  if (!userId || !carId || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "All booking details are required"
    });
  }

  try {
    // Check if car exists
    const [car] = await db.promise().query(
      "SELECT * FROM cars WHERE cars_id = ?",
      [carId]
    );

    if (car.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Car not found"
      });
    }

    // Check if user exists
    const [user] = await db.promise().query(
      "SELECT userID FROM users WHERE userID = ?",
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check for date conflicts
    const [conflicts] = await db.promise().query(
      `SELECT * FROM trip_confirmations 
       WHERE car_id = ? AND status = 'Confirmed'
       AND ((start_date <= ? AND end_date >= ?) 
       OR (start_date <= ? AND end_date >= ?))`,
      [carId, endDate, startDate, startDate, endDate]
    );

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Car is already booked for selected dates"
      });
    }

    // Create trip confirmation request
    const [result] = await db.promise().query(
      `INSERT INTO trip_confirmations 
       (userID, car_id, start_date, end_date, status) 
       VALUES (?, ?, ?, ?, 'Pending')`,
      [userId, carId, startDate, endDate]
    );

    res.status(201).json({
      success: true,
      message: "Booking request sent to owner",
      confirmationId: result.insertId
    });

  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create booking request",
      error: error.message
    });
  }
});

// Configure timezone globally
app.put('/trip-confirmations/:userId/:carId/:startDate', async (req, res) => {
    try {
        console.group('⏺️ Backend Request Received');
        console.log('🔹 Raw Parameters:', req.params);
        console.log('🔹 Request Body:', req.body);
        
        // Date Handling
        const decodedDate = decodeURIComponent(req.params.startDate);
        console.log('🔹 Decoded Date String:', decodedDate);
        
        const dateObj = new Date(decodedDate);
        console.log('🔹 Date Object:', dateObj);
        console.log('🔹 Local Time String:', dateObj.toString());
        console.log('🔹 ISO String:', dateObj.toISOString());
        
        // Database Query
        console.log('🚀 Executing DB Query...');
        // const [result] = await db.query(
        //     `UPDATE trip_confirmations 
        //      SET status = ? 
        //      WHERE userID = ? AND car_id = ? AND start_date = ?`,
        //     [req.body.status, req.params.userId, req.params.carId, dateObj]
        // );
        const [result] = await db.promise().query( // ← Add .promise()
      `UPDATE trip_confirmations 
       SET status = ? 
       WHERE userID = ? AND car_id = ? AND start_date = ?`,
      [req.body.status, req.params.userId, req.params.carId, new Date(decodeURIComponent(req.params.startDate))]
    );
        
        console.log('✅ DB Update Result:', {
            affectedRows: result.affectedRows,
            changedRows: result.changedRows
        });
        
        console.groupEnd();
        
        if (result.affectedRows === 1) {
            return res.json({ 
                success: true,
                debug: {
                    receivedParams: req.params,
                    receivedBody: req.body,
                    processedDate: dateObj.toISOString()
                }
            });
        }
        
        return res.status(404).json({ 
            success: false,
            message: "No matching booking found",
            debug: req.params
        });
        
    } catch (error) {
        console.error('❌ Backend Error:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message,
            stack: error.stack 
        });
    }
});
  // Get booking requests for owner (unchanged but included for completeness)
  app.get('/owner-requests', async (req, res) => {
    const { ownerId } = req.query;
  
    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: "Owner ID is required"
      });
    }
  
    try {
      const [requests] = await db.promise().query(
        `SELECT 
           tc.userID, 
           tc.car_id, 
           tc.start_date, 
           tc.end_date, 
           tc.status,
           DATEDIFF(tc.end_date, tc.start_date) + 1 as days,
           c.car_name, 
           c.model, 
           c.price_per_day,
           u.name as user_name,
           u.phone as user_phone
         FROM trip_confirmations tc
         JOIN cars c ON tc.car_id = c.cars_id
         JOIN users u ON tc.userID = u.userID
         WHERE c.ownerID = ?
         ORDER BY tc.start_date DESC`,
        [ownerId]
      );
  
      // Format dates for frontend
      const formattedRequests = requests.map(req => ({
        ...req,
        start_date: new Date(req.start_date).toISOString(),
        end_date: new Date(req.end_date).toISOString()
      }));
  
      res.status(200).json({
        success: true,
        requests: formattedRequests
      });
  
    } catch (error) {
      console.error("Database Error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch booking requests",
        error: error.message
      });
    }
  });

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});