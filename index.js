
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const doctors = [
  {
    id: "d1",
    name: "Dr. Ananya Sharma",
    specialty: "Cardiologist",
    department: "Cardiology",
    experience: 12,
    fee: 800,
    rating: "4.9",
    reviews: 128,
    image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=500&q=85",
    color: "rose"
  },
  {
    id: "d2",
    name: "Dr. Rahul Mehta",
    specialty: "Neurologist",
    department: "Neurology",
    experience: 9,
    fee: 650,
    rating: "4.8",
    reviews: 96,
    image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=500&q=85",
    color: "blue"
  },
  {
    id: "d3",
    name: "Dr. Priya Kapoor",
    specialty: "Dermatologist",
    department: "Dermatology",
    experience: 8,
    fee: 500,
    rating: "4.9",
    reviews: 154,
    image: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=500&q=85",
    color: "purple"
  },
  {
    id: "d4",
    name: "Dr. Arjun Singh",
    specialty: "Orthopedic Surgeon",
    department: "Orthopedics",
    experience: 15,
    fee: 900,
    rating: "4.7",
    reviews: 112,
    image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=500&q=85",
    color: "amber"
  }
];

app.get("/", (req, res) => {
  res.redirect("/booking");
});

app.get("/booking", (req, res) => {
  res.render("booking", {
    title: "Book an Appointment | CareNest",
    doctors
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "CareNest",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`CareNest running at http://localhost:${PORT}`);
});
