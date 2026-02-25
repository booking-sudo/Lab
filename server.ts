import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("lab_booking.db");
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student'
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    student_name TEXT,
    phone TEXT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration INTEGER NOT NULL,
    system_number INTEGER NOT NULL,
    status TEXT DEFAULT 'confirmed',
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('total_systems', '10');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('lab_open_time', '09:00');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('lab_close_time', '18:00');
`);

// Add columns if they don't exist
try { db.exec("ALTER TABLE bookings ADD COLUMN student_name TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE bookings ADD COLUMN phone TEXT;"); } catch (e) {}

// Create default admin if not exists
const adminEmail = "admin@lab.com";
const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run(
    "Admin Sir",
    adminEmail,
    hashedPassword,
    "admin"
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const isAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    next();
  };

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)").run(name, email, hashedPassword);
      const token = jwt.sign({ id: result.lastInsertRowid, email, role: 'student', name }, JWT_SECRET);
      res.json({ token, user: { id: result.lastInsertRowid, name, email, role: 'student' } });
    } catch (err: any) {
      res.status(400).json({ error: "Email already exists" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  // Booking Routes
  app.get("/api/bookings/my", authenticate, (req: any, res) => {
    const bookings = db.prepare(`
      SELECT b.*, u.name as user_name 
      FROM bookings b 
      JOIN users u ON b.user_id = u.id 
      WHERE b.user_id = ? 
      ORDER BY b.date DESC, b.start_time DESC
    `).all(req.user.id);
    res.json(bookings);
  });

  app.get("/api/bookings/availability", authenticate, (req, res) => {
    const { date } = req.query;
    const bookings = db.prepare("SELECT * FROM bookings WHERE date = ? AND status = 'confirmed'").all(date);
    const settings = db.prepare("SELECT * FROM settings").all();
    const config: any = {};
    settings.forEach((s: any) => config[s.key] = s.value);
    
    res.json({ bookings, config });
  });

  app.post("/api/bookings", authenticate, (req: any, res) => {
    const { date, start_time, end_time, duration, student_name, phone, system_number } = req.body;
    
    // Check total systems
    const totalSystems = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_systems'").get().value);
    
    if (system_number && (system_number < 1 || system_number > totalSystems)) {
      return res.status(400).json({ error: `Invalid PC number. Please choose between 1 and ${totalSystems}` });
    }

    // Check for overlapping bookings at the same time
    const overlapping = db.prepare(`
      SELECT system_number FROM bookings 
      WHERE date = ? AND status = 'confirmed'
      AND ((start_time < ?) AND (end_time > ?))
    `).all(date, end_time, start_time);

    const occupiedSystems = overlapping.map((o: any) => o.system_number);

    let finalSystemNumber = system_number;

    if (finalSystemNumber) {
      if (occupiedSystems.includes(finalSystemNumber)) {
        return res.status(400).json({ error: `PC #${finalSystemNumber} is already booked for this time slot.` });
      }
    } else {
      if (overlapping.length >= totalSystems) {
        return res.status(400).json({ error: "No systems available for this time slot" });
      }
      // Find first available system number
      finalSystemNumber = 1;
      while (occupiedSystems.includes(finalSystemNumber)) {
        finalSystemNumber++;
      }
    }

    const result = db.prepare(`
      INSERT INTO bookings (user_id, student_name, phone, date, start_time, end_time, duration, system_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, student_name || req.user.name, phone, date, start_time, end_time, duration, finalSystemNumber);

    res.json({ id: result.lastInsertRowid, system_number: finalSystemNumber });
  });

  // Admin Routes
  app.get("/api/admin/bookings", authenticate, isAdmin, (req, res) => {
    const bookings = db.prepare(`
      SELECT b.*, u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.date DESC, b.start_time DESC
    `).all();
    res.json(bookings);
  });

  app.delete("/api/admin/bookings/:id", authenticate, isAdmin, (req, res) => {
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/admin/settings", authenticate, isAdmin, (req, res) => {
    const { total_systems, lab_open_time, lab_close_time } = req.body;
    db.prepare("UPDATE settings SET value = ? WHERE key = 'total_systems'").run(total_systems.toString());
    db.prepare("UPDATE settings SET value = ? WHERE key = 'lab_open_time'").run(lab_open_time);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'lab_close_time'").run(lab_close_time);
    res.json({ success: true });
  });

  app.get("/api/admin/settings", authenticate, isAdmin, (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const config: any = {};
    settings.forEach((s: any) => config[s.key] = s.value);
    res.json(config);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
