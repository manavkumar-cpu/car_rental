process.env.TZ = 'Asia/Kolkata'; 
const mysql = require("mysql2/promise");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// MySQL Connection Pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Aa1manav",
  database: "dbms_project",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log("✅ Connected to MySQL database");
    connection.release();
  })
  .catch(err => {
    console.error("❌ MySQL Connection Failed:", err);
  });

app.get('/test', async (req, res) => {
  try {
    const [results] = await pool.query('SELECT NOW() AS current_time');
    res.json({ 
      message: "Server is working!",
      time: results[0].current_time 
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
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

  try {
    const [results] = await pool.query(
      `SELECT * FROM ${tableName} WHERE email = ?`,
      [email]
    );

    if (results.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const user = results[0];
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
    console.error("⚠️ Database Error:", error);
    res.status(500).json({ 
      success: false,
      message: "Authentication error",
      error: error.message 
    });
  }
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
    const [results] = await pool.query(
      `SELECT * FROM ${tableName} WHERE email = ?`,
      [email]
    );

    if (results.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: "Email already exists" 
      });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const [result] = await pool.query(
      `INSERT INTO ${tableName} (${nameField}, email, phone, password) VALUES (?, ?, ?, ?)`,
      [name, email, phone, hashedPassword]
    );

    res.status(201).json({
      success: true,
      message: "Signup successful",
      id: result.insertId
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
    const [cars] = await pool.query(
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
    const [car] = await pool.query(
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
app.get("/get-cities", async (req, res) => {
  try {
    const [results] = await pool.query("SELECT DISTINCT city FROM cars");
    const cities = results.map(row => row.city);
    
    res.status(200).json({ 
      success: true,
      cities 
    });
  } catch (err) {
    console.error("⚠️ Database Error:", err);
    res.status(500).json({ 
      success: false,
      message: "Database error",
      error: err.message 
    });
  }
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
    const [owner] = await pool.query(
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
    const [result] = await pool.query(
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
    const [cars] = await pool.query(
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
    const [car] = await pool.query(
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
    await pool.query(
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
    const [car] = await pool.query(
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
    const [user] = await pool.query(
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
    const [conflicts] = await pool.query(
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
    const [result] = await pool.query(
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

// Update trip confirmation status
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
    const [result] = await pool.query(
      `UPDATE trip_confirmations 
       SET status = ? 
       WHERE userID = ? AND car_id = ? AND start_date = ?`,
      [req.body.status, req.params.userId, req.params.carId, dateObj]
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

// Get user bookings
app.get('/user-bookings', async (req, res) => {
  try {
    console.log("🔍 /user-bookings endpoint called");
    
    const userId = req.query.user_id;
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const carId = req.query.car_id;
    
    console.log("📝 Request parameters:", {
      userId,
      startDate,
      endDate,
      carId
    });
    
    // Validate required parameters
    if (!userId) {
      console.error("❌ Missing required parameter: user_id");
      return res.status(400).json({ 
        success: false, 
        message: "User ID is required" 
      });
    }
    
    let query = `
      SELECT 
        tc.userID,
        tc.car_id,
        c.cars_id,
        c.car_name,
        c.model,
        c.price_per_day,
        tc.status,
        DATE_FORMAT(tc.start_date, '%Y-%m-%d %H:%i:%s') AS start_date,
        DATE_FORMAT(tc.end_date, '%Y-%m-%d %H:%i:%s') AS end_date
      FROM trip_confirmations tc
      INNER JOIN cars c ON tc.car_id = c.cars_id
      WHERE tc.userID = ?
    `;
    
    const queryParams = [userId];
    
    // Add car_id filtering if provided
    if (carId) {
      console.log("🚗 Adding car_id filter:", carId);
      query += ` AND tc.car_id = ?`;
      queryParams.push(carId);
    }
    
    // Add date filtering if both start and end dates are provided
    if (startDate && endDate) {
      console.log("📅 Adding date filters:", { startDate, endDate });
      
      // Format dates to ensure consistent comparison
      const formattedStartDate = new Date(startDate).toISOString().slice(0, 10); // Get just the date part
      const formattedEndDate = new Date(endDate).toISOString().slice(0, 10); // Get just the date part
      
      console.log("📅 Formatted dates (date only):", {
        original: { startDate, endDate },
        formatted: { formattedStartDate, formattedEndDate }
      });
      
      // Use DATE() function to compare only the date part
      query += ` AND DATE(tc.start_date) = ? AND DATE(tc.end_date) = ?`;
      queryParams.push(formattedStartDate, formattedEndDate);
    }
    
    query += ` ORDER BY tc.start_date DESC`;
    
    console.log("🔍 Executing query:", query);
    console.log("📝 Query parameters:", queryParams);
    
    const [bookings] = await pool.query(query, queryParams);
    console.log("✅ Query result count:", bookings.length);
    
    // Log each booking's dates for debugging
    bookings.forEach((booking, index) => {
      console.log(`📊 Booking ${index + 1}:`, {
        car_id: booking.car_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        status: booking.status
      });
    });

    res.json({ 
      success: true,
      bookings: bookings
    });
  } catch (error) {
    console.error("❌ Error in /user-bookings:", {
      message: error.message,
      stack: error.stack,
      query: error.sql,
      parameters: error.parameters
    });
    
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch bookings",
      error: error.message
    });
  }
});

// Get booking requests for owner
app.get('/owner-requests', async (req, res) => {
  const { ownerId } = req.query;
  
  if (!ownerId) {
    return res.status(400).json({
      success: false,
      message: "Owner ID is required"
    });
  }

  try {
    const [requests] = await pool.query(
      `SELECT 
        tc.userID, 
        tc.car_id, 
        tc.start_date, 
        tc.end_date, 
        tc.status,
        tc.created_at,
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
      ORDER BY tc.created_at DESC`,
      [ownerId]
    );

    // Format dates for frontend
    const formattedRequests = requests.map(req => ({
      ...req,
      start_date: new Date(req.start_date).toISOString(),
      end_date: new Date(req.end_date).toISOString(),
      created_at: new Date(req.created_at).toISOString()
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
/**
 * @route GET /cars-due-today
 * @description Get all cars with bookings ending today that haven't been marked as returned
 * @param {string} ownerId - Owner ID from query params
 */
app.get('/cars-due-today', async (req, res) => {
  const { ownerId } = req.query;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  console.log("Query params:", { ownerId, today });

  if (!ownerId) {
      return res.status(400).json({
          success: false,
          message: "Owner ID is required"
      });
  }

  try {
      const [bookings] = await pool.query(`
          SELECT 
              t.trip_id,
              t.userID,
              t.car_id,
              DATE_FORMAT(t.start_date, '%Y-%m-%d %H:%i:%s') AS start_date,
              DATE_FORMAT(t.end_date, '%Y-%m-%d %H:%i:%s') AS end_date,
              c.car_name,
              c.model,
              c.price_per_day,
              u.name AS user_name,
              u.phone AS user_phone
          FROM trips t
          JOIN cars c ON t.car_id = c.cars_id
          JOIN users u ON t.userID = u.userID
          JOIN trip_returns tr ON t.trip_id = tr.trip_id
          WHERE 
              c.ownerID = ? 
              AND DATE(t.end_date) = ?
              AND tr.actual_return_date IS NULL
      `, [ownerId, today]);

      console.log("Database results:", bookings);

      res.status(200).json({
          success: true,
          bookings,
          currentDate: today
      });
  } catch (error) {
      console.error("Database Error:", error);
      res.status(500).json({
          success: false,
          message: "Failed to fetch due cars",
          error: error.message
      });
  }
});

/**
 * @route POST /mark-as-returned
 * @description Mark a car as returned by updating actual_return_date
 * @param {number} trip_id - Trip ID from request body
 * @param {number} ownerId - Owner ID for validation
 */
app.post('/mark-as-returned', async (req, res) => {
  const { trip_id, ownerId } = req.body;

  // Input validation
  if (!trip_id || !ownerId) {
    return res.status(400).json({
      success: false,
      message: "Trip ID and Owner ID are required"
    });
  }

  try {
    // 1. Verify ownership
    const [ownershipCheck] = await pool.query(`
      SELECT 1 FROM trips t
      JOIN cars c ON t.car_id = c.cars_id
      WHERE t.trip_id = ? AND c.ownerID = ?
    `, [trip_id, ownerId]);

    if (ownershipCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized - You don't own this car"
      });
    }

    // 2. Get end_date for the trip
    const [tripData] = await pool.query(`
      SELECT end_date FROM trips WHERE trip_id = ?
    `, [trip_id]);

    // 3. Update return status
    const [result] = await pool.query(`
      UPDATE trip_returns 
      SET actual_return_date = ?
      WHERE trip_id = ?
    `, [tripData[0].end_date, trip_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Trip not found or already returned"
      });
    }

    // // 4. (Optional) Update car availability if needed
    // await pool.query(`
    //   UPDATE cars c
    //   JOIN trips t ON c.cars_id = t.car_id
    //   SET c.available = 1
    //   WHERE t.trip_id = ?
    // `, [trip_id]);

    res.status(200).json({
      success: true,
      message: "Car successfully marked as returned",
      returned_at: tripData[0].end_date
    });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update return status",
      error: error.message
    });
  }
});
// Add this to your server.js file
// Add this to your server.js
app.post('/mark-returned', async (req, res) => {
  const { tripId, penalty, actualReturnDate } = req.body;
  console.log("🔹 Request received:", { tripId, penalty, actualReturnDate });

  try {
    console.log("🔹 Starting transaction...");
    await pool.query('START TRANSACTION');

    console.log("🔹 Updating trip_returns...");
    const [returnResult] = await pool.query(
      `INSERT INTO trip_returns (trip_id, actual_return_date)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE actual_return_date = VALUES(actual_return_date)`,
      [tripId, actualReturnDate]
    );
    console.log("✅ trip_returns updated:", returnResult);

    console.log("🔹 Updating late_fees...");
    const [penaltyResult] = await pool.query(
      `INSERT INTO late_fees (trip_id, penalty)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE penalty = VALUES(penalty)`,
      [tripId, penalty]
    );
    console.log("✅ late_fees updated:", penaltyResult);

    console.log("🔹 Committing transaction...");
    await pool.query('COMMIT');
    console.log("✅ Transaction committed successfully");

    res.json({ success: true, message: "Return recorded successfully" });
  } catch (error) {
    console.error("❌ Database error during transaction:", error);
    await pool.query('ROLLBACK');
    res.status(500).json({
      success: false,
      message: "Database operation failed",
      error: error.message
    });
  }
});

// Update your existing owner-late-returns endpoint to include trip_id
app.get("/owner-late-returns", async (req, res) => {
  const { ownerId } = req.query;
  
  if (!ownerId) {
      return res.status(400).json({
          success: false,
          message: "Owner ID is required"
      });
  }

  try {
      const [returns] = await pool.query(
          `SELECT 
          t.trip_id,
          tc.userID, 
          tc.car_id, 
          tc.end_date,
          c.car_name, 
          c.model,
          c.price_per_day,
          u.name as user_name,
          u.phone as user_phone
      FROM trips t
      JOIN trip_confirmations tc ON t.userID = tc.userID AND t.car_id = tc.car_id AND t.start_date = tc.start_date
      JOIN cars c ON tc.car_id = c.cars_id
      JOIN users u ON tc.userID = u.userID
      LEFT JOIN trip_returns tr ON t.trip_id = tr.trip_id
      WHERE c.ownerID = ? 
      AND tc.status = 'Confirmed'
      AND DATE(tc.end_date) < CURDATE() -- Compare only the date part
      AND tr.actual_return_date IS NULL
      ORDER BY tc.end_date DESC`,
          [ownerId]
      );

      res.status(200).json({
          success: true,
          returns
      });
  } catch (error) {
      console.error("Database Error:", error);
      res.status(500).json({
          success: false,
          message: "Failed to fetch late returns",
          error: error.message
      });
  }
});
// User Bookings Endpoint
// GET User Bookings with Trip Details
app.get('/user-bookings-v2', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
      return res.status(400).json({
          success: false,
          message: 'User ID is required'
      });
  }

  try {
      const [bookings] = await pool.execute(`
          SELECT 
              t.trip_id,
              t.userID,
              t.car_id,
              DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(t.end_date, '%Y-%m-%d') AS end_date,
              DATE_FORMAT(tr.actual_return_date, '%Y-%m-%d') AS actual_return_date,
              c.car_name,
              c.model,
              c.price_per_day,
              COALESCE(lf.penalty, 0.00) AS penalty,
              CASE 
                  WHEN tr.actual_return_date IS NULL THEN 'Confirmed'
                  WHEN tr.actual_return_date > t.end_date THEN 'Late Return'
                  ELSE 'Completed'
              END AS status
          FROM trips t
          JOIN cars c ON t.car_id = c.cars_id
          LEFT JOIN trip_returns tr ON t.trip_id = tr.trip_id
          LEFT JOIN late_fees lf ON t.trip_id = lf.trip_id
          WHERE t.userID = ?
          ORDER BY t.trip_id DESC
      `, [userId]);

      res.json({
          success: true,
          bookings: bookings.map(booking => ({
              ...booking,
              // Convert string dates to Date objects for frontend
              start_date: new Date(booking.start_date),
              end_date: new Date(booking.end_date),
              actual_return_date: booking.actual_return_date 
                  ? new Date(booking.actual_return_date) 
                  : null
          }))
      });

  } catch (error) {
      console.error('Database error:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to fetch bookings',
          error: error.message
      });
  }
});

app.use((req, res) => {
  res.status(404).send("Endpoint not found");
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});