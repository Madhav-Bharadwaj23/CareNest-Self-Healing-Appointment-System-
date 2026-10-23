
document.addEventListener("DOMContentLoaded", () => {
  const doctorDataElement = document.getElementById("doctorData");
  if (!doctorDataElement) return;

  const doctors = JSON.parse(doctorDataElement.textContent);
  const doctorCards = [...document.querySelectorAll(".doctor-card")];

  const $ = (id) => document.getElementById(id);

  // Read the selected website language.
  function getLanguage() {
    return localStorage.getItem("carenest-language") === "hi"
      ? "hi"
      : "en";
  }

  // Return the correct language for dynamic messages.
  function t(english, hindi) {
    return getLanguage() === "hi" ? hindi : english;
  }

  let selectedDoctor = doctors[0] || null;

  let selectedDate = new Date();
  selectedDate.setHours(0, 0, 0, 0);

  let weekOffset = 0;
  let selectedTime = "";

  const timeSlots = [
    "09:00 AM", "09:30 AM",
    "10:00 AM", "10:30 AM",
    "11:00 AM", "11:30 AM",
    "02:00 PM", "02:30 PM",
    "03:00 PM", "03:30 PM",
    "04:00 PM", "04:30 PM"
  ];

  // Demo-only unavailable time slots.
  const unavailableSlots = {
    d1: ["10:30 AM", "02:30 PM"],
    d2: ["09:30 AM", "11:30 AM"],
    d3: ["10:00 AM", "03:00 PM"],
    d4: ["09:00 AM", "04:00 PM"]
  };

  function formatDate(date, options = {
    day: "numeric",
    month: "short",
    year: "numeric"
  }) {
    const locale = getLanguage() === "hi" ? "hi-IN" : "en-IN";
    return date.toLocaleDateString(locale, options);
  }

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function sameDay(a, b) {
    return dateKey(a) === dateKey(b);
  }

  // Render calendar in the selected language.
  function renderCalendar() {
    const container = $("calendarDays");
    if (!container || !$("calendarMonth")) return;

    container.innerHTML = "";

    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + weekOffset * 4);

    const locale = getLanguage() === "hi" ? "hi-IN" : "en-IN";

    $("calendarMonth").textContent = base.toLocaleDateString(locale, {
      month: "long",
      year: "numeric"
    });

    for (let i = 0; i < 8; i++) {
      const date = new Date(base);
      date.setDate(base.getDate() + i);

      const button = document.createElement("button");
      button.type = "button";

      const isSelected = sameDay(date, selectedDate);
      const isToday = sameDay(date, new Date());

      button.className =
        "calendar-day min-h-[70px] rounded-xl border px-1 py-2 text-center transition " +
        (isSelected
          ? "active border-teal-700 bg-teal-700 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50");

      const weekday = date.toLocaleDateString(locale, {
        weekday: "short"
      });

      const weekdayLabel = document.createElement("span");
      weekdayLabel.className =
        "block text-[10px] font-bold uppercase tracking-wide " +
        (isSelected ? "text-teal-100" : "text-slate-400");
      weekdayLabel.textContent = weekday;

      const dayNumber = document.createElement("span");
      dayNumber.className = "mt-1 block text-lg font-extrabold";
      dayNumber.textContent = date.toLocaleDateString(locale, {
        day: "numeric"
      });

      const todayLabel = document.createElement("span");
      todayLabel.className = "mt-0.5 block text-[9px] font-semibold";
      todayLabel.textContent = isToday
        ? t("TODAY", "आज")
        : "";

      button.append(weekdayLabel, dayNumber, todayLabel);

      button.setAttribute(
        "aria-label",
        formatDate(date, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      );

      button.setAttribute("aria-pressed", String(isSelected));

      button.addEventListener("click", () => {
        selectedDate = new Date(date);
        selectedTime = "";

        renderCalendar();
        renderSlots();
        updateSummary();
      });

      container.appendChild(button);
    }
  }

  // Select a doctor without changing doctor information from the database.
  function selectDoctor(doctorId) {
    const doctor = doctors.find(
      item => String(item.id) === String(doctorId)
    );

    if (!doctor) return;

    selectedDoctor = doctor;
    selectedTime = "";

    doctorCards.forEach(card => {
      const active =
        String(card.dataset.doctorId) === String(doctorId);

      card.classList.toggle("selected", active);
      card.setAttribute("aria-pressed", String(active));
    });

    if ($("selectedDoctorName")) {
      $("selectedDoctorName").textContent = doctor.name;
    }

    if ($("selectedDoctorSpecialty")) {
      $("selectedDoctorSpecialty").textContent = doctor.specialty;
    }

    if ($("selectedDoctorImage")) {
      $("selectedDoctorImage").src = doctor.image;
      $("selectedDoctorImage").alt = doctor.name;
    }

    if ($("selectedDoctorRating")) {
      $("selectedDoctorRating").textContent = doctor.rating;
    }

    renderSlots();
    updateSummary();
  }

  // Render available demo time slots.
  function renderSlots() {
    const container = $("timeSlots");
    if (!container || !$("slotHint")) return;

    container.innerHTML = "";

    if (!selectedDoctor) {
      $("slotHint").textContent = t(
        "Select a doctor first.",
        "पहले डॉक्टर चुनें।"
      );
      return;
    }

    const unavailable = unavailableSlots[selectedDoctor.id] || [];
    let availableCount = 0;

    timeSlots.forEach(time => {
      const button = document.createElement("button");
      button.type = "button";

      const unavailableForDemo = unavailable.includes(time);

      button.disabled = unavailableForDemo;

      button.className =
        "slot-button rounded-xl border px-2 py-3 text-xs font-bold " +
        (unavailableForDemo
          ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through"
          : selectedTime === time
            ? "active border-teal-700 bg-teal-700 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-800");

      button.textContent = time;
      button.setAttribute("aria-pressed", String(selectedTime === time));

      if (!unavailableForDemo) {
        availableCount++;

        button.addEventListener("click", () => {
          selectedTime = time;
          renderSlots();
          updateSummary();
        });
      }

      container.appendChild(button);
    });

    $("slotHint").textContent = selectedTime
      ? `${t("Selected:", "चुना गया समय:")} ${selectedTime}`
      : t(
          `${availableCount} demo slots shown. Availability is not live.`,
          `${availableCount} डेमो समय स्लॉट दिखाए गए हैं। यह वास्तविक समय की उपलब्धता नहीं है।`
        );
  }

  // Update the appointment summary.
  function updateSummary() {
    if ($("summaryDate")) {
      $("summaryDate").textContent = formatDate(selectedDate);
    }

    if ($("summaryTime")) {
      $("summaryTime").textContent = selectedTime || t(
        "Choose a slot",
        "समय चुनें"
      );
    }

    if ($("summaryFee")) {
      $("summaryFee").textContent = selectedDoctor
        ? `₹${selectedDoctor.fee}`
        : "—";
    }

    if ($("continueBooking")) {
      $("continueBooking").disabled = !selectedDoctor || !selectedTime;
    }
  }

  // Search and filter doctors.
  function filterDoctors() {
    const query = $("doctorSearch").value.trim().toLowerCase();
    const department = $("departmentFilter").value;

    let visibleCount = 0;

    doctorCards.forEach(card => {
      const name = (card.dataset.name || "").toLowerCase();
      const specialty = (card.dataset.specialty || "").toLowerCase();
      const cardDepartment = card.dataset.department || "";

      const matchesText =
        !query || name.includes(query) || specialty.includes(query);

      const matchesDepartment =
        !department || cardDepartment === department;

      const visible = matchesText && matchesDepartment;

      card.classList.toggle("hidden", !visible);

      if (visible) visibleCount++;
    });

    if ($("doctorCount")) {
      $("doctorCount").textContent = getLanguage() === "hi"
        ? `${visibleCount} डॉक्टर`
        : `${visibleCount} ${visibleCount === 1 ? "doctor" : "doctors"}`;
    }

    if ($("noDoctors")) {
      $("noDoctors").classList.toggle("hidden", visibleCount !== 0);
    }
  }

  // Doctor card interactions.
  doctorCards.forEach(card => {
    card.addEventListener("click", () => {
      selectDoctor(card.dataset.doctorId);
    });

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectDoctor(card.dataset.doctorId);
      }
    });
  });

  // Calendar navigation.
  if ($("prevWeek")) {
    $("prevWeek").addEventListener("click", () => {
      if (weekOffset > 0) {
        weekOffset--;
        renderCalendar();
      }
    });
  }

  if ($("nextWeek")) {
    $("nextWeek").addEventListener("click", () => {
      weekOffset++;
      renderCalendar();
    });
  }

  // Search controls.
  if ($("doctorSearch")) {
    $("doctorSearch").addEventListener("input", filterDoctors);
  }

  if ($("departmentFilter")) {
    $("departmentFilter").addEventListener("change", filterDoctors);
  }

  if ($("searchButton")) {
    $("searchButton").addEventListener("click", filterDoctors);
  }

  // Mobile menu.
  if ($("mobileMenuButton") && $("mobileMenu")) {
    $("mobileMenuButton").addEventListener("click", () => {
      $("mobileMenu").classList.toggle("hidden");
    });
  }

  // Family-assisted booking information.
  if ($("familyHelpButton")) {
    $("familyHelpButton").addEventListener("click", () => {
      alert(t(
        "Family-assisted booking will be available after patient accounts, family permissions and authentication are connected.",
        "परिवार की सहायता से बुकिंग की सुविधा मरीज के खाते, परिवार की अनुमति और लॉगिन व्यवस्था जुड़ने के बाद उपलब्ध होगी।"
      ));
    });
  }

  // Continue to the booking review.
  if ($("continueBooking")) {
    $("continueBooking").addEventListener("click", () => {
      if (!selectedDoctor || !selectedTime) return;

      $("reviewDetails").textContent =
        `${selectedDoctor.name} · ${selectedDoctor.specialty} · ` +
        `${formatDate(selectedDate)} · ${selectedTime} · ₹${selectedDoctor.fee}`;

      $("bookingDetails").classList.remove("hidden");

      $("bookingDetails").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      $("demoMessage").classList.add("hidden");
    });
  }

  // Cancel the booking preview.
  if ($("cancelReview")) {
    $("cancelReview").addEventListener("click", () => {
      $("bookingDetails").classList.add("hidden");
      $("demoBookingForm").reset();
    });
  }

  // Demo form only: this does not save or confirm an appointment.
  if ($("demoBookingForm")) {
    $("demoBookingForm").addEventListener("submit", event => {
      event.preventDefault();

      if (!event.currentTarget.reportValidity()) return;

      const message = $("demoMessage");

      message.textContent = t(
        "Demo preview only: your details have not been saved, and your appointment is NOT confirmed. The next step is connecting the form to the Express booking API and MongoDB.",
        "यह केवल डेमो प्रीव्यू है: आपकी जानकारी सेव नहीं हुई है और अपॉइंटमेंट की पुष्टि नहीं हुई है। अगला चरण इस फ़ॉर्म को Express बुकिंग API और MongoDB से जोड़ना है।"
      );

      message.classList.remove("hidden");
    });
  }

  // Initial render.
  renderCalendar();

  if (selectedDoctor) {
    selectDoctor(selectedDoctor.id);
  } else {
    renderSlots();
    updateSummary();
  }

  filterDoctors();

  // Refresh dynamic booking content when the language toggle changes.
  // language.js should update localStorage before changing the toggle text.
  const languageButton = $("languageToggle");

  if (languageButton) {
    let previousLanguage = getLanguage();

    const languageObserver = new MutationObserver(() => {
      const currentLanguage = getLanguage();

      if (currentLanguage === previousLanguage) return;

      previousLanguage = currentLanguage;

      renderCalendar();
      renderSlots();
      updateSummary();
      filterDoctors();
    });

    languageObserver.observe(languageButton, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
});
