# Rowing & Sports Management System — Complete Setup & Deployment Guide

This guide covers:
1. **Setting up and running on a new computer (Local Development)**
2. **Hosting the Database on Aiven.io (Managed Cloud Database)**
3. **Deploying the FastAPI Backend to Vercel (Serverless)**
4. **Deploying the Frontend to a Shared Node Server / Production**

---

## Architecture Overview

* **Frontend:** React 18 + TypeScript + Vite + TailwindCSS
* **Backend:** FastAPI (Python 3.11) + SQLAlchemy ORM + Pydantic v2
* **Database:** 
  * **Local:** Microsoft SQL Server (with SSMS) or MySQL
  * **Cloud Production:** Aiven.io (Managed MySQL with SSL)
* **Hosting:**
  * **Backend:** Vercel (Python Serverless Function)
  * **Frontend:** Shared Node.js server / static web host

---

## Part 1: Setting Up on a New Computer (Localhost)

### 1. Prerequisites to Install on the New Computer
* **Node.js:** [Download Node.js 18+ or 20+](https://nodejs.org/)
* **Python:** [Download Python 3.11+](https://www.python.org/downloads/)  
  *(⚠️ Check **"Add python.exe to PATH"** on the first installation screen)*
* **Git:** [Download Git for Windows](https://git-scm.com/download/win)
* **Database:**
  * **Microsoft SQL Server (Recommended for SSMS):**  
    1. Install [SQL Server 2022 Express](https://go.microsoft.com/fwlink/p/?linkid=2215158&clcid=0x409&culture=en-us&country=us) (Select "Basic" install).
    2. Install [SQL Server Management Studio (SSMS)](https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms).

---

### 2. Database Initialization (in SSMS)
1. Open **SSMS**.
2. Connect to server:
   * **Server Name:** `.` or `localhost` *(or `.\SQLEXPRESS`)*
   * **Authentication:** `Windows Authentication`
   * **Encryption:** Check **☑ Trust server certificate**
3. Open a **New Query** window and run:
   ```sql
   CREATE DATABASE sports_management;
   ```

---

### 3. Backend Setup

1. Open PowerShell and navigate to the project directory:
   ```powershell
   cd d:\Projects\Rowing-App\backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   py -m venv venv
   ```
3. Install all dependencies:
   ```powershell
   .\venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
4. Configure `backend/.env`:
   Create or edit `backend/.env` with the following content:
   ```env
   ENVIRONMENT=development
   SECRET_KEY=dev-secret-key-change-this-for-production-rowing-app-2026
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000

   # Local SQL Server Connection (Windows Authentication):
   DATABASE_URL=mssql+pyodbc://localhost/sports_management?driver=ODBC+Driver+17+for+SQL+Server&trusted_connection=yes&TrustServerCertificate=yes
   ```
   *(If your SQL Server uses an instance name like `SQLEXPRESS`, use `localhost\SQLEXPRESS` instead of `localhost`).*

5. Start the backend:
   ```powershell
   .\venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
   ```
   > **Note:** The backend automatically connects to SQL Server and creates all necessary tables (`users`, `clubs`, `schedules`, `equipment`, etc.) on first boot.

   * Swagger Documentation is live at: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 4. Frontend Setup

1. Open a second PowerShell window and navigate to `frontend`:
   ```powershell
   cd d:\Projects\Rowing-App\frontend
   ```
2. Install npm packages:
   ```powershell
   npm install
   ```
3. Ensure `frontend/.env` exists:
   ```env
   VITE_API_URL=/api/v1
   ```
4. Start the frontend:
   ```powershell
   npm run dev
   ```
5. Open your browser at **[http://localhost:3000](http://localhost:3000)**.

---

## Part 2: Hosting the Database on Aiven.io

[Aiven.io](https://aiven.io) provides fully managed, secure cloud database instances with free tiers/credits.

### 1. Create the Aiven Database Service
1. Sign up / Log in to [Aiven.io Console](https://console.aiven.io/).
2. Click **Create Service**.
3. Choose **MySQL** (or PostgreSQL).
4. Select your cloud provider (e.g. AWS or Google Cloud) and region closest to your users.
5. Choose the **Free** or **Startup** plan.
6. Name your service (e.g., `rowing-sports-db`) and click **Create Service**.

### 2. Obtain Connection Details
Once the service status turns green (**Running**):
1. In the **Overview** tab, copy the **Service URI**. It looks like:
   ```
   mysql://avnadmin:your-password@your-service-name.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
   ```
2. You can also download the **CA Certificate** (`ca.pem`) from the Overview tab if desired, but this backend's database handler has built-in SSL context negotiation for `aivencloud.com` domains automatically!

### 3. Test Connecting from your Local Machine
You can connect to your Aiven database using DBeaver, MySQL Workbench, or by updating `backend/.env` to point to Aiven:
```env
DATABASE_URL=mysql+pymysql://avnadmin:your-password@your-service-name.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
```

---

## Part 3: Deploying the Backend to Vercel

The backend includes [backend/vercel.json](backend/vercel.json) and [backend/api/index.py](backend/api/index.py) to run seamlessly on Vercel's Python Serverless runtime.

### 1. Push Code to GitHub / GitLab
Make sure your latest codebase is pushed to your remote repository:
```powershell
git add .
git commit -m "Configure MSSQL, Vercel, and Aiven support"
git push origin main
```

### 2. Deploy on Vercel
1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New... ➔ Project**.
2. Select your Git repository.
3. In the configuration screen:
   * **Framework Preset:** Other
   * **Root Directory:** Click Edit and select **`backend`**
4. Expand **Environment Variables** and add:

| Key | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `mysql+pymysql://avnadmin:pwd@host.aivencloud.com:port/defaultdb?ssl-mode=REQUIRED` | Your Aiven MySQL URI |
| `SECRET_KEY` | *(Generate a 32+ character random string)* | JWT signature key |
| `CORS_ORIGINS` | `https://your-frontend-domain.com,http://localhost:3000` | Allowed origins |
| `ENVIRONMENT` | `production` | Production mode |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Token expiration (7 days) |

5. Click **Deploy**.
6. When deployment finishes, Vercel will give you a production URL (e.g., `https://rowing-backend.vercel.app`).
7. Test the deployment by visiting `https://rowing-backend.vercel.app/docs`.

---

## Part 4: Deploying Frontend to a Shared Node Server

Since you don't have SSH access to your shared Node.js server (e.g. cPanel Node.js App or Plesk):

### Option A: Build Locally and Upload Static Files
1. In `frontend/.env`, set the backend URL pointing to your deployed Vercel backend:
   ```env
   VITE_API_URL=https://rowing-backend.vercel.app/api/v1
   ```
2. Build the production bundle:
   ```powershell
   cd frontend
   npm run build
   ```
   This generates an optimized production bundle in `frontend/dist/`.
3. In your shared hosting file manager (cPanel File Manager / FTP):
   * Upload all files from inside `frontend/dist/` into your `public_html` (or web root) folder.
   * If your server uses Apache, add an `.htaccess` file for React Router single-page app routing:
     ```apache
     <IfModule mod_rewrite.c>
       RewriteEngine On
       RewriteBase /
       RewriteRule ^index\.html$ - [L]
       RewriteCond %{REQUEST_FILENAME} !-f
       RewriteCond %{REQUEST_FILENAME} !-d
       RewriteRule . /index.html [L]
     </IfModule>
     ```

### Option B: Run as a Node.js App on Shared Hosting
If your shared hosting has "Setup Node.js App":
1. Upload the `frontend` folder or build output.
2. Serve the static build with a lightweight `server.js` file:
   ```javascript
   const express = require('express');
   const path = require('path');
   const app = express();
   const PORT = process.env.PORT || 3000;

   app.use(express.static(path.join(__dirname, 'dist')));

   app.get('*', (req, res) => {
     res.sendFile(path.join(__dirname, 'dist', 'index.html'));
   });

   app.listen(PORT, () => {
     console.log(`Server is running on port ${PORT}`);
   });
   ```
3. Set Application Startup File to `server.js` in your host's control panel.

---

## Summary Checklist for New Machines

- [ ] Clone repo: `git clone <repo_url>`
- [ ] In SSMS: `CREATE DATABASE sports_management;`
- [ ] Backend: `py -m venv venv`, `.\venv\Scripts\python.exe -m pip install -r requirements.txt`
- [ ] Run Backend: `.\venv\Scripts\uvicorn.exe app.main:app --reload --port 8000`
- [ ] Frontend: `npm install`, `npm run dev`
- [ ] Open [http://localhost:3000](http://localhost:3000)
