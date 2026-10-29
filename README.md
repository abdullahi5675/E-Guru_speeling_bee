# Jigawa State Spelling Bee Championship Web System

> **Sponsored by:** Jigawa State Ministry of Education  
> **Organized by:** J-YEDA (Youth Educational Empowerment Association)  
> **Engineered & Built by:** KowaguruTech

An enterprise-grade, real-time web adjudication and tournament management system for the official Jigawa State Spelling Bee Championship.

---

## 🌟 Championship Portals & Screens

1. **👨‍⚖️ Judges & Pronouncer Cockpit (`/judge`):**  
   Target word display, phonetic guide, definitions, example sentences, audio pronunciation, 60s/30s countdown timer, real-time letter validation, single-click decision lock, and manual stage transitions.
2. **🖥️ Stage & Projector Screen (`/projector`):**  
   High-contrast stage view for auditorium projectors featuring active contestant information, countdown circle, letter-by-letter live spelling board, and stage standings.
3. **🧑‍🎓 Speller Downstage Monitor (`/speller`):**  
   Clean stage screen facing the speller displaying current stage rule, question picker grid, countdown clock, and live spelling letters.
4. **📊 Ministerial Leaderboard (`/leaderboard`):**  
   Official tournament rankings with real-time score feeds, school trophy tallies, and ministerial sign-off section with formal A4 print layout (`window.print()`).
5. **⚡ Dedicated Tiebreaker Cockpit (`/tiebreaker`):**  
   Sudden-death runoff resolution arena with automatic cutoff calculation, stage question pool, and quota-based advancement.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express.js
- **Real-Time Sync:** Socket.IO (with server-time clock offset compensation)
- **Database:** PostgreSQL (with SSL cloud support and automatic schema migration)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (responsive, ultra-low latency, zero client build step required)

---

## 🚀 Cloud Deployment Guide

### Option 1: Render.com (Recommended for Live Socket.IO Events)

Because this championship system uses **real-time WebSockets (Socket.IO)** to sync timer countdowns, live letter typing, and decisions across laptops simultaneously with sub-second latency, hosting on a persistent platform like **[Render](https://render.com)** or **[Railway](https://railway.app)** is strongly recommended.

1. Create a free account at [Render.com](https://render.com).
2. Create a free **PostgreSQL Database** on Render:
   - Note the **Internal Database URL** or **External Database URL**.
3. Create a **Web Service**:
   - Connect this GitHub repository (`abdullahi5675/E-Guru_speeling_bee`).
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment Variables:**
     - `DATABASE_URL`: *(Paste your Render/Neon/Supabase PostgreSQL connection string)*
     - `PORT`: `3000`
4. Click **Deploy**. The system will automatically build tables, seed championship words, and provide a live `.onrender.com` URL.

---

### Option 2: Vercel Deployment

`vercel.json` is included in this repository.

1. Connect your repository to [Vercel](https://vercel.com).
2. Set up a cloud PostgreSQL database (e.g. [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com)).
3. In your Vercel Project Settings, add the Environment Variable:
   - `DATABASE_URL`: `postgres://user:password@host:port/dbname?sslmode=require`
4. Deploy.

> **Note on Vercel:** Vercel functions are serverless. For live tournaments requiring persistent WebSocket connections across multiple arena laptops, **Render** or **Railway** is recommended over serverless hosting.

---

## 💻 Local Setup & Auditorium Offline Wi-Fi

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abdullahi5675/E-Guru_speeling_bee.git
   cd E-Guru_speeling_bee
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in your database credentials:
   ```bash
   cp .env.example .env
   ```

4. **Initialize Database & Seed Data (Optional):**
   ```bash
   node import_500_words.js
   node seed_official_students.js
   ```

5. **Start Server:**
   ```bash
   node server.js
   ```
   Access the dashboard at `http://localhost:3000`.
