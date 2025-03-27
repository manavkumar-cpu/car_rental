document.addEventListener("DOMContentLoaded", async () => {
    const pickupSelect = document.getElementById("pickupLocation");
    const fromDateInput = document.getElementById("from-date");
    const toDateInput = document.getElementById("to-date");

    if (!pickupSelect) {
        console.error("❌ Error: Pickup select dropdown not found!");
        return;
    }

    // ✅ Load saved dates from localStorage
    fromDateInput.value = localStorage.getItem("fromDate") || "";
    toDateInput.value = localStorage.getItem("toDate") || "";

    // ✅ Save dates in localStorage when changed
    fromDateInput.addEventListener("change", () => {
        localStorage.setItem("fromDate", fromDateInput.value);
    });

    toDateInput.addEventListener("change", () => {
        localStorage.setItem("toDate", toDateInput.value);
    });

    try {
        // ✅ Fetch cities and populate dropdown
        const response = await fetch("http://localhost:3000/get-cities");
        const data = await response.json();

        if (!data.cities || !Array.isArray(data.cities)) {
            console.error("❌ Error: Invalid data format received!", data);
            return;
        }

        populateCityDropdown(pickupSelect, data.cities);
    } catch (error) {
        console.error("❌ Error fetching cities:", error);
    }
});

// ✅ Function to populate the dropdown
function populateCityDropdown(selectElement, cities) {
    console.log("✅ Populating dropdown with cities:", cities);

    cities.forEach(city => {
        const option = document.createElement("option");
        option.value = city;
        option.textContent = city;
        selectElement.appendChild(option);
    });
}

// ✅ Make function global if needed elsewhere
window.populateCityDropdown = populateCityDropdown;
