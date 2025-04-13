const [requests] = await pool.query(
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