

// =======================================
// ELEMENT REFERENCES
// =======================================

const form = document.getElementById("sellerForm");

const sections = document.querySelectorAll(".form-step");
const stepButtons = document.querySelectorAll(".step");

const previousBtn = document.getElementById("previousBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");
const saveBtn = document.getElementById("saveBtn");

const progressBar = document.getElementById("progressBar");
const errorMessage = document.getElementById("errorMessage");

let currentStep = 0;

// Show mandatory fields based on the selected ID type and state.
const ownerIDType = document.getElementById("ownerIDType");
const ownerIDNumberField = document.getElementById("ownerIDNumberField");
const ownerIDNumber = document.getElementById("ownerIDNumber");
const ownerIDNumberLabel = document.getElementById("ownerIDNumberLabel");
const ownerState = document.getElementById("ownerState");
const ownerStateOtherField = document.getElementById("ownerStateOtherField");
const ownerStateOther = document.getElementById("ownerStateOther");

ownerIDType.addEventListener("change", function () {
    const selected = this.value;
    ownerIDNumberField.hidden = !selected;
    ownerIDNumber.disabled = !selected;
    ownerIDNumber.required = Boolean(selected);
    ownerIDNumber.value = "";
    const idLabels = {
        "Aadhaar Card": "Aadhaar Number",
        "Voter ID": "Voter ID Number",
        "Passport": "Passport Number",
        "Driving Licence": "Driving Licence Number"
    };
    const label = idLabels[selected] || "ID Number";
    ownerIDNumberLabel.innerHTML = label + ' <span class="required">*</span>';
    ownerIDNumber.placeholder = "Enter " + label.toLowerCase();
});

function updateOwnerStateOtherField() {
    const isOther = ownerState.value === "Other";
    ownerStateOtherField.hidden = !isOther;
    ownerStateOther.disabled = !isOther;
    ownerStateOther.required = isOther;
    if (isOther) {
        ownerStateOther.focus();
    } else {
        ownerStateOther.value = "";
    }
}

ownerState.addEventListener("change", updateOwnerStateOtherField);
updateOwnerStateOtherField();

form.addEventListener("reset", function () {
    setTimeout(() => {
        ownerIDType.dispatchEvent(new Event("change"));
        ownerState.dispatchEvent(new Event("change"));
    }, 0);
});

const totalSteps = sections.length;


// =======================================
// SHOW STEP
// =======================================

function showStep(index) {

    currentStep = index;

    sections.forEach((section, i) => {
        section.hidden = i !== index;
    });

    stepButtons.forEach((button, i) => {

        button.classList.toggle("active", i === index);

        button.classList.toggle(
            "completed",
            i < index
        );

        const number = button.querySelector(".step-number");

        number.textContent = i < index ? "✓" : i + 1;

    });

    progressBar.style.width =
        ((index + 1) / totalSteps * 100) + "%";

    previousBtn.disabled = index === 0;

    nextBtn.hidden = index === totalSteps - 1;

    submitBtn.hidden = index !== totalSteps - 1;

    errorMessage.style.display = "none";

    if (index === 3) {
        generateReview();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


// =======================================
// VALIDATE CURRENT STEP
// =======================================

function validateStep(index) {

    const section = sections[index];

    const requiredFields = section.querySelectorAll(
        "input[required], select[required], textarea[required]"
    );

    let valid = true;

    requiredFields.forEach(field => {

        if (!field.checkValidity()) {

            field.reportValidity();

            valid = false;

        }

    });


    // Validate document sizes and file types

    if (index === 2) {

        const fileInputs = section.querySelectorAll(
            'input[type="file"]'
        );

        fileInputs.forEach(input => {

            const file = input.files[0];

            if (file) {

                const allowedTypes = [
                    "application/pdf",
                    "image/jpeg",
                    "image/png"
                ];

                if (!allowedTypes.includes(file.type)) {

                    alert("Please upload only PDF, JPG or PNG files.");

                    valid = false;

                }

                if (file.size > 5 * 1024 * 1024) {

                    alert("Each document must be 5 MB or smaller.");

                    valid = false;

                }

            }

        });

    }

    if (!valid) {
        errorMessage.style.display = "block";
    }

    return valid;

}


// =======================================
// NEXT AND PREVIOUS
// =======================================

nextBtn.addEventListener("click", function() {

    if (!validateStep(currentStep)) return;

    if (currentStep < totalSteps - 1) {
        showStep(currentStep + 1);
    }

});

previousBtn.addEventListener("click", function() {

    if (currentStep > 0) {
        showStep(currentStep - 1);
    }

});


// =======================================
// CLICKABLE STEP NAVIGATION
// =======================================

stepButtons.forEach((button, index) => {

    button.addEventListener("click", function() {

        // Validate all preceding sections before navigating.

        for (let i = 0; i < index; i++) {

            if (!validateStep(i)) {
                showStep(i);
                return;
            }

        }

        showStep(index);

    });

});


// =======================================
// DOCUMENT UPLOAD DISPLAY
// =======================================

const documentInputs = [
    "fssai",
    "identity",
    "pan",
    "gst",
    "bank",
    "ownership"
];

documentInputs.forEach(id => {

    const input = document.getElementById(id);

    input.addEventListener("change", function() {

        const file = this.files[0];

        const display = document.getElementById(id + "Name");

        if (file) {

            display.textContent = "✓ " + file.name;

            display.style.color = "#079b51";

        } else {

            display.textContent = "No file selected";

        }

    });

});


// =======================================
// REVIEW HELPERS
// =======================================

function getValue(id) {

    const element = document.getElementById(id);

    return element.value.trim() || "Not provided";

}

function reviewItem(label, value) {

    return `
        <div class="review-item">
            <small>${label}</small>
            <strong>${escapeHTML(value)}</strong>
        </div>
    `;

}

function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, function(char) {

        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char];

    });

}


// =======================================
// GENERATE REVIEW DETAILS
// =======================================

function generateReview() {

    // OWNER DETAILS

    document.getElementById("ownerReview").innerHTML =

        reviewItem("Owner Name", getValue("ownerName")) +

        reviewItem("Email Address", getValue("ownerEmail")) +

        reviewItem("Mobile Number", getValue("ownerPhone")) +

        reviewItem("Date of Birth", getValue("ownerDOB")) +

        reviewItem("Gender", getValue("ownerGender")) +

        reviewItem("ID Type", getValue("ownerIDType")) +

        reviewItem("ID Number", getValue("ownerIDNumber")) +

        reviewItem("Residential Address", getValue("ownerAddress")) +

        reviewItem("City", getValue("ownerCity")) +

        reviewItem("State", getValue("ownerState") === "Other" ? getValue("ownerStateOther") : getValue("ownerState")) +

        reviewItem("PIN Code", getValue("ownerPin"));


    // RESTAURANT DETAILS

    document.getElementById("restaurantReview").innerHTML =

        reviewItem("Restaurant Name", getValue("restaurantName")) +

        reviewItem("Business Type", getValue("businessType")) +

        reviewItem("Cuisine Type", getValue("cuisine")) +

        reviewItem("Restaurant Phone", getValue("restaurantPhone")) +

        reviewItem("Restaurant Email", getValue("restaurantEmail")) +

        reviewItem("Year Established", getValue("establishment")) +

        reviewItem("Opening Time", getValue("openingTime")) +

        reviewItem("Closing Time", getValue("closingTime")) +

        reviewItem("Average Price for Two", getValue("price")) +

        reviewItem("Seating Capacity", getValue("capacity")) +

        reviewItem("Restaurant Address", getValue("restaurantAddress")) +

        reviewItem("City", getValue("restaurantCity")) +

        reviewItem("PIN Code", getValue("restaurantPin")) +

        reviewItem("Description", getValue("description"));


    // DOCUMENTS

    const documentNames = {
        fssai: "FSSAI License",
        identity: "Owner Identity Proof",
        pan: "PAN Card",
        gst: "GST Certificate",
        bank: "Bank Account Proof",
        ownership: "Restaurant Ownership Proof"
    };

    let documentHTML = "";

    documentInputs.forEach(id => {

        const file = document.getElementById(id).files[0];

        const fileName = file ? file.name : "Not uploaded";

        documentHTML += `
            <div class="document-review">
                <strong>${documentNames[id]}</strong>
                <span>${escapeHTML(fileName)}</span>
            </div>
        `;

    });

    document.getElementById("documentsReview").innerHTML =
        documentHTML;

}


// =======================================
// EDIT BUTTONS IN REVIEW
// =======================================

document.querySelectorAll(".edit-btn").forEach(button => {

    button.addEventListener("click", function() {

        const targetStep = Number(this.dataset.edit);

        showStep(targetStep);

    });

});


// =======================================
// SAVE DRAFT - BROWSER DEMO
// =======================================

saveBtn.addEventListener("click", function() {

    const data = {};

    form.querySelectorAll("input:not([type=file]):not([type=password]), select, textarea")
        .forEach(field => {

            if (field.type === "checkbox") {
                data[field.id] = field.checked;
            } else {
                data[field.id] = field.value;
            }

        });

    try {

        localStorage.setItem(
            "foodieSellerDraft",
            JSON.stringify(data)
        );

        alert(
            "Draft saved in this browser. Uploaded files are not saved."
        );

    } catch (error) {

        alert("Unable to save the draft in this browser.");

    }

});


// =======================================
// LOAD SAVED DRAFT
// =======================================

function loadDraft() {

    try {

        const saved = localStorage.getItem("foodieSellerDraft");

        if (!saved) return;

        const data = JSON.parse(saved);

        Object.keys(data).forEach(id => {

            const field = document.getElementById(id);

            if (!field) return;

            if (field.type === "checkbox") {
                field.checked = data[id];
            } else {
                field.value = data[id];
            }

        });

    } catch (error) {

        console.log("Draft could not be loaded.");

    }

}


// =======================================
// FINAL SUBMISSION
// =======================================

form.addEventListener("submit", async function(event) {

    event.preventDefault();

    // Check all required steps

    for (let i = 0; i < totalSteps - 1; i++) {

        if (!validateStep(i)) {
            showStep(i);
            return;
        }

    }

    if (document.getElementById("ownerPassword").value !== document.getElementById("ownerPassword2").value) {
        alert("The two passwords do not match.");
        showStep(0);
        return;
    }

    if (!document.getElementById("terms").checked) {

        alert("Please accept the terms and conditions.");

        return;

    }

    // Send everything (including the documents) to the Flask backend

    const FIELDS = {
        owner_name: "ownerName", owner_email: "ownerEmail", owner_phone: "ownerPhone",
        owner_dob: "ownerDOB", owner_gender: "ownerGender", owner_id_type: "ownerIDType",
        owner_id_number: "ownerIDNumber", owner_address: "ownerAddress", owner_city: "ownerCity",
        owner_state: "ownerState", owner_state_other: "ownerStateOther", owner_pin: "ownerPin",
        password: "ownerPassword", confirm_password: "ownerPassword2",
        restaurant_name: "restaurantName", business_type: "businessType", cuisine: "cuisine",
        restaurant_phone: "restaurantPhone", restaurant_email: "restaurantEmail",
        establishment: "establishment", opening_time: "openingTime", closing_time: "closingTime",
        price: "price", capacity: "capacity", restaurant_address: "restaurantAddress",
        restaurant_city: "restaurantCity", restaurant_pin: "restaurantPin", description: "description"
    };

    const fd = new FormData();

    Object.keys(FIELDS).forEach(key => {
        fd.append(key, document.getElementById(FIELDS[key]).value.trim());
    });

    documentInputs.forEach(id => {
        const file = document.getElementById(id).files[0];
        if (file) fd.append(id, file);
    });

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {

        const res = await fetch("/api/sellers/register", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || "Registration failed. Please try again.");

        document.getElementById("registrationID").textContent = data.registration_id;

        form.style.display = "none";

        document.getElementById("successPage").style.display = "block";

        localStorage.removeItem("foodieSellerDraft");

        window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (error) {

        alert(error.message);

    } finally {

        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Registration ✓";

    }

});


// =======================================
// NEW REGISTRATION
// =======================================

document.getElementById("newRegistration")
.addEventListener("click", function() {

    form.reset();

    documentInputs.forEach(id => {

        document.getElementById(id + "Name").textContent =
            "No file selected";

    });

    document.getElementById("successPage").style.display = "none";

    form.style.display = "block";

    showStep(0);

});


// =======================================
// INITIALIZE
// =======================================

loadDraft();
showStep(0);

