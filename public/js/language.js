
(() => {
  "use strict";

  const translations = {
    // Navigation
    "Care that feels closer": "अपनों की देखभाल, आसान तरीके से",
    "Find a Doctor": "डॉक्टर खोजें",
    "Find a doctor": "डॉक्टर खोजें",
    "My Appointments": "मेरी अपॉइंटमेंट",
    "My appointments": "मेरी अपॉइंटमेंट",
    "Doctor Portal": "डॉक्टर पोर्टल",
    "Log in": "लॉग इन करें",
    "Login": "लॉग इन करें",
    "Sign in": "लॉग इन करें",
    "Sign up": "रजिस्टर करें",
    "Register": "रजिस्टर करें",
    "Logout": "लॉग आउट करें",
    "Logout?": "लॉग आउट करना चाहते हैं?",
    "Home": "होम",
    "Dashboard": "डैशबोर्ड",
    "English": "अंग्रेज़ी",
    "Hindi": "हिंदी",

    // Home and doctors
    "OUR CARE TEAM": "हमारी डॉक्टर टीम",
    "MEET THE CARE TEAM": "हमारी डॉक्टर टीम से मिलें",
    "Meet your doctors.": "अपने डॉक्टरों से मिलें।",
    "Here for your wellbeing.": "आपकी सेहत के लिए हमेशा साथ।",
    "Choose the specialist who best fits your needs.": "अपनी ज़रूरत के अनुसार विशेषज्ञ डॉक्टर चुनें।",
    "View all doctors": "सभी डॉक्टर देखें",
    "Book a visit": "अपॉइंटमेंट बुक करें",
    "Sign in to book": "बुक करने के लिए लॉग इन करें",
    "years experience": "वर्षों का अनुभव",
    "years exp.": "वर्षों का अनुभव",
    "A calmer way to care": "देखभाल का आसान तरीका",
    "Healthcare that feels": "स्वास्थ्य सेवा जो आपके",
"closer.": "और करीब है।",
"Healthcare that feels": "स्वास्थ्य सेवा जो आपके",
"closer.": "और करीब है।",
"Healthcare that feels closer.": "स्वास्थ्य सेवाएँ अब आपके और करीब।",
"Book appointments, keep your family’s care organised, and get clear updates — all in one friendly place.": "अपनी अपॉइंटमेंट बुक करें, परिवार की देखभाल व्यवस्थित रखें और सभी अपडेट एक ही आसान जगह पर पाएँ।",
    "Healthcare that feels closer.": "स्वास्थ्य सेवाएँ अब आपके और करीब।",
    "Book an appointment": "अपॉइंटमेंट बुक करें",
    "Meet our doctors": "हमारे डॉक्टरों से मिलें",
    "Easy to use": "इस्तेमाल करना आसान",
    "Family-friendly": "परिवार के लिए उपयोगी",
    "Service health monitored": "सिस्टम की स्थिति पर नज़र",
    "Care, made simple": "देखभाल अब आसान",
    "One step at a time": "एक-एक कदम आगे",
    "You're all set": "आप तैयार हैं",
    "Choose a doctor and time": "डॉक्टर और समय चुनें",
    "Review or cancel bookings": "बुकिंग देखें या रद्द करें",
    "Queue & waiting list": "कतार और प्रतीक्षा सूची",
    "See your waiting position": "कतार में अपनी स्थिति देखें",
    "OUR DOCTORS": "हमारे डॉक्टर",
    "Doctor directory not set up yet": "डॉक्टरों की सूची अभी तैयार नहीं है",
    "Seed the sample doctor list from the admin dashboard after creating an admin account.": "एडमिन खाता बनाने के बाद एडमिन डैशबोर्ड से नमूना डॉक्टर सूची जोड़ें।",
    "No doctors found": "कोई डॉक्टर नहीं मिला",
    "Try another name or department.": "कोई दूसरा नाम या विभाग चुनकर देखें।",
    "Available specialists": "उपलब्ध विशेषज्ञ",
    "Select a doctor to see appointment times.": "अपॉइंटमेंट का समय देखने के लिए डॉक्टर चुनें।",

    // Appointments
    "YOUR VISITS": "आपकी अपॉइंटमेंट",
    "My appointments.": "मेरी अपॉइंटमेंट।",
    "Review upcoming visits and manage your bookings.": "आने वाली अपॉइंटमेंट देखें और अपनी बुकिंग व्यवस्थित करें।",
    "+ Book appointment": "+ अपॉइंटमेंट बुक करें",
    "Booking ID": "बुकिंग आईडी",
    "Doctor": "डॉक्टर",
    "Patient": "मरीज़",
    "Date & time": "तारीख और समय",
    "Date and time": "तारीख और समय",
    "Status": "स्थिति",
    "Action": "कार्रवाई",
    "Cancel": "रद्द करें",
    "Cancel this appointment?": "क्या आप यह अपॉइंटमेंट रद्द करना चाहते हैं?",
    "Your care journey starts here": "आपकी देखभाल की शुरुआत यहाँ से होती है",
    "No appointments have been booked yet.": "अभी तक कोई अपॉइंटमेंट बुक नहीं की गई है।",
    "Appointment booked successfully.": "अपॉइंटमेंट सफलतापूर्वक बुक हो गई है।",
    "Your appointment is booked successfully.": "आपकी अपॉइंटमेंट सफलतापूर्वक बुक हो गई है।",
    "Play voice message": "आवाज़ फिर से सुनें",
    "Voice is unavailable in this browser": "इस ब्राउज़र में आवाज़ उपलब्ध नहीं है",
    "Appointment booked successfully. A confirmation email has been sent.": "अपॉइंटमेंट सफलतापूर्वक बुक हो गई है। पुष्टिकरण ईमेल भेज दिया गया है।",
    "Appointment booked successfully. The confirmation email is queued until self-healing is turned on.": "अपॉइंटमेंट सफलतापूर्वक बुक हो गई है। पुष्टिकरण ईमेल self-healing चालू होने तक कतार में है।",
    "Appointment booked successfully, but the confirmation email could not be sent.": "अपॉइंटमेंट सफलतापूर्वक बुक हो गई है, लेकिन पुष्टिकरण ईमेल नहीं भेजा जा सका।",
    "Today's appointments": "आज की अपॉइंटमेंट",
    "Scheduled for today": "आज के लिए निर्धारित",
    "All appointments": "सभी अपॉइंटमेंट",
    "Latest 100 records": "नवीनतम 100 रिकॉर्ड",
    "Specialty": "विशेषज्ञता",
    "Your department": "आपका विभाग",
    "Appointment schedule": "अपॉइंटमेंट का शेड्यूल",
    "Your upcoming and previous appointments.": "आपकी आने वाली और पिछली अपॉइंटमेंट।",
    "Reason": "कारण",
    "No appointments are linked to your account yet.": "अभी आपके खाते से कोई अपॉइंटमेंट जुड़ी नहीं है।",

    // Booking form
    "YOUR HEALTH, OUR PRIORITY": "आपकी सेहत, हमारी प्राथमिकता",
    "Find your right": "अपने लिए सही",
    "doctor.": "डॉक्टर चुनें।",
    "Care you can trust": "भरोसेमंद देखभाल",
    "Simple and accessible booking": "आसान और सुलभ बुकिंग",
    "Search doctor or speciality...": "डॉक्टर या विशेषज्ञता खोजें...",
    "All departments": "सभी विभाग",
    "Cardiology": "हृदय रोग विभाग",
    "Neurology": "तंत्रिका रोग विभाग",
    "Dermatology": "त्वचा रोग विभाग",
    "Orthopedics": "हड्डी रोग विभाग",
    "Previous dates": "पिछली तारीखें",
    "Next dates": "अगली तारीखें",
    "Appointment hours": "अपॉइंटमेंट का समय",
    "Available times depend on each doctor's schedule.": "उपलब्ध समय डॉक्टर के शेड्यूल पर निर्भर करता है।",
    "Need help booking?": "बुकिंग में मदद चाहिए?",
    "We're here to help you.": "हम आपकी मदद के लिए यहाँ हैं।",
    "You can ask a family member to assist you with an appointment.": "आप अपॉइंटमेंट लेने के लिए परिवार के किसी सदस्य की मदद ले सकते हैं।",
    "Family booking help": "परिवार की मदद से बुकिंग",
    "Consultation fee": "परामर्श शुल्क",
    "Select doctor": "डॉक्टर चुनें",
    "Select one": "एक चुनें",
    "rating": "रेटिंग",
    "Available time slots": "उपलब्ध समय स्लॉट",
    "Demo availability": "डेमो उपलब्धता",
    "Select a time slot to continue.": "आगे बढ़ने के लिए समय स्लॉट चुनें।",
    "Appointment summary": "अपॉइंटमेंट का विवरण",
    "Date": "तारीख",
    "Time": "समय",
    "Doctor fee": "डॉक्टर का शुल्क",
    "Choose a date": "तारीख चुनें",
    "Choose a slot": "समय चुनें",
    "Continue to booking": "बुकिंग जारी रखें",
    "Accessible healthcare": "सुलभ स्वास्थ्य सेवा",
    "Review your appointment": "अपनी अपॉइंटमेंट देखें",
    "Patient full name": "मरीज़ का पूरा नाम",
    "Enter full name": "पूरा नाम लिखें",
    "Phone number": "फ़ोन नंबर",
    "Enter phone number": "फ़ोन नंबर लिखें",
    "Selected appointment": "चुनी गई अपॉइंटमेंट",
    "Preview booking details": "बुकिंग का विवरण देखें",
    "Never enter payment details on this demo page.": "इस डेमो पेज पर भुगतान की जानकारी न भरें।",

    // Authentication
    "Email": "ईमेल",
    "Email address": "ईमेल पता",
    "Password": "पासवर्ड",
    "Confirm password": "पासवर्ड की पुष्टि करें",
    "Full name": "पूरा नाम",
    "Enter your name": "अपना नाम लिखें",
    "Enter your email": "अपना ईमेल लिखें",
    "Enter your password": "अपना पासवर्ड लिखें",
    "Create account": "खाता बनाएँ",
    "Already have an account?": "क्या आपका पहले से खाता है?",
    "Don't have an account?": "क्या आपका खाता नहीं है?",
    "Forgot password?": "पासवर्ड भूल गए?",
    "Passwords do not match.": "दोनों पासवर्ड मेल नहीं खाते।",
    "Remember me": "मुझे याद रखें",
    "Welcome back": "वापसी पर स्वागत है",
    "Register your account": "अपना खाता रजिस्टर करें",

    // Dashboard and waiting list
    "Welcome": "स्वागत है",
    "Overview": "अवलोकन",
    "Total appointments": "कुल अपॉइंटमेंट",
    "Upcoming appointments": "आने वाली अपॉइंटमेंट",
    "Completed appointments": "पूरी हुई अपॉइंटमेंट",
    "Waiting list": "प्रतीक्षा सूची",
    "Queue position": "कतार में स्थान",
    "Waiting position": "प्रतीक्षा में स्थान",
    "Refresh": "रिफ्रेश करें",
    "Search": "खोजें",
    "Filter": "फ़िल्टर करें",
    "Save": "सेव करें",
    "Submit": "सबमिट करें",
    "Update": "अपडेट करें",
    "Edit": "बदलें",
    "Delete": "हटाएँ",
    "Back": "वापस",
    "Back to Dashboard": "डैशबोर्ड पर वापस जाएँ",
    "Manage Availability": "उपलब्धता व्यवस्थित करें",
    "Your current availability": "आपकी वर्तमान उपलब्धता",
    "Schedule:": "शेड्यूल:",
    "DOCTOR WORKSPACE": "डॉक्टर कार्यक्षेत्र",
    "DOCTOR PORTAL": "डॉक्टर पोर्टल",

    // Footer
    "Making hospital appointments simpler, safer and more accessible for everyone.": "अस्पताल की अपॉइंटमेंट सभी के लिए आसान, सुरक्षित और सुलभ बनाना।",
    "Explore": "और जानें",
    "Appointments": "अपॉइंटमेंट",
    "Doctor schedule": "डॉक्टर का शेड्यूल",
    "Patient Support": "मरीज़ सहायता",
    "Accessible appointment booking": "आसान अपॉइंटमेंट बुकिंग",
    "English and Hindi support": "अंग्रेज़ी और हिंदी सहायता",
    "Family-assisted booking": "परिवार की मदद से बुकिंग",
    "Important": "महत्वपूर्ण सूचना",
    "CareNest is an appointment management system, not an emergency service or a substitute for professional medical advice.": "CareNest अपॉइंटमेंट प्रबंधन प्रणाली है। यह आपातकालीन सेवा या डॉक्टर की पेशेवर सलाह का विकल्प नहीं है।",

    // Common messages
    "Loading...": "लोड हो रहा है...",
    "Please wait...": "कृपया प्रतीक्षा करें...",
    "Success": "सफलता",
    "Error": "त्रुटि",
    "Something went wrong.": "कुछ गलत हो गया।",
    "Try again": "फिर से प्रयास करें",
    "No results found": "कोई परिणाम नहीं मिला",
    "Required": "ज़रूरी",
    "Today": "आज",
    "TODAY": "आज",
    "Morning": "सुबह",
    "Afternoon": "दोपहर",
    "Evening": "शाम",
    "Confirm": "पुष्टि करें",
    "Close": "बंद करें",
    "Help": "मदद",
    "Listening...": "सुन रहे हैं...",
    "Try voice again": "आवाज़ से फिर प्रयास करें",
    "Use voice to fill details": "आवाज़ से विवरण भरें",
    "Switch to English": "अंग्रेज़ी में बदलें",
    "Switch to Hindi": "हिंदी में बदलें"
  };

  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();

  let currentLanguage =
    localStorage.getItem("carenest-language") === "hi" ? "hi" : "en";

  function translateText(value, language) {
    if (!value || !value.trim()) return value;

    const trimmed = value.trim();

    if (language === "en") {
      return originalText.has(value) ? originalText.get(value) : value;
    }

    if (translations[trimmed]) {
      return value.replace(trimmed, translations[trimmed]);
    }

    // Longest phrases first, so full sentences are matched before shorter phrases.
    let result = value;
    const keys = Object.keys(translations).sort((a, b) => b.length - a.length);

    for (const key of keys) {
      if (result.includes(key)) {
        result = result.split(key).join(translations[key]);
      }
    }

    return result;
  }

  function rememberTextNode(node) {
    if (!originalText.has(node)) {
      originalText.set(node, node.textContent);
    }
  }

  function translatePage(language) {
    if (!document.body) return;

    document.documentElement.lang = language;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;

      if (!parent) continue;

      if (
        parent.closest(
          "script, style, textarea, input, select, option, code, pre, [data-no-translate]"
        )
      ) {
        continue;
      }

      rememberTextNode(node);
      nodes.push(node);
    }

    nodes.forEach(node => {
      const original = originalText.get(node);

      if (language === "en") {
        node.textContent = original;
      } else {
        const trimmed = original.trim();
        let translated = translations[trimmed];

        if (!translated) {
          translated = original;
          const keys = Object.keys(translations).sort(
            (a, b) => b.length - a.length
          );

          for (const key of keys) {
            if (translated.includes(key)) {
              translated = translated.split(key).join(translations[key]);
            }
          }
        }

        node.textContent = translated;
      }
    });

    document.querySelectorAll(
      "input[placeholder], textarea[placeholder], [aria-label], [title]"
    ).forEach(element => {
      let saved = originalAttributes.get(element);

      if (!saved) {
        saved = {};
        ["placeholder", "aria-label", "title"].forEach(attribute => {
          saved[attribute] = element.getAttribute(attribute);
        });
        originalAttributes.set(element, saved);
      }

      ["placeholder", "aria-label", "title"].forEach(attribute => {
        const original = saved[attribute];
        if (original === null || original === undefined) return;

        const translated = translations[original.trim()];
        element.setAttribute(
          attribute,
          language === "hi" && translated ? translated : original
        );
      });
    });

    document.querySelectorAll("option").forEach(option => {
      if (!option.dataset.carenestOriginal) {
        option.dataset.carenestOriginal = option.textContent;
      }

      const original = option.dataset.carenestOriginal;
      option.textContent =
        language === "hi"
          ? (translations[original.trim()] || original)
          : original;
    });

    const button = document.getElementById("languageToggle");

    if (button) {
      button.textContent = language === "hi" ? "English" : "हिंदी";
      button.setAttribute(
        "aria-label",
        language === "hi" ? "Switch to English" : "Switch to Hindi"
      );
    }

    localStorage.setItem("carenest-language", language);
    currentLanguage = language;
  }

  function start() {
    const button = document.getElementById("languageToggle");

    if (button && !button.dataset.languageHandlerAdded) {
      button.dataset.languageHandlerAdded = "true";

      button.addEventListener("click", () => {
        translatePage(currentLanguage === "en" ? "hi" : "en");
      });
    }

    translatePage(currentLanguage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  // Other scripts can use this to translate their own generated messages.
  window.CareNestLanguage = {
    translatePage,
    translateText: (text) => {
      if (currentLanguage !== "hi") return text;

      const trimmed = String(text ?? "").trim();
      if (translations[trimmed]) return translations[trimmed];

      let result = String(text ?? "");
      const keys = Object.keys(translations).sort((a, b) => b.length - a.length);

      for (const key of keys) {
        result = result.split(key).join(translations[key]);
      }

      return result;
    },
    getLanguage: () => currentLanguage
  };
})();
