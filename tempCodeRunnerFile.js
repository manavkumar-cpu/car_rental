app.get("/get-cities", (req, res) => {
    const sql = "SELECT DISTINCT city FROM cars";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("⚠️ Database Query Error:", err);
            return res.status(500).json({ message: "Database error" });
        }

        const cities = results.map(row => row.city);
        res.status(200).json({ cities });
    });
});