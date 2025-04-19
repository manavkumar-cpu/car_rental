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