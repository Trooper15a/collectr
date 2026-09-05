# Collectr

A free, open-source TCG portfolio tracker with an **AI-powered card scanner** that runs entirely on your device. No cloud fees, no subscriptions, no data collection.

**Supports:** Pokemon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Lorcana, Digimon, Dragon Ball Super, and more.

![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **AI Card Scanner** — Point your phone camera at any card, identified in under 1 second. Runs 100% on-device using machine learning (no internet needed for scanning)
- **Portfolio Tracking** — Multiple portfolios, cost basis tracking, gain/loss calculations, daily price history charts
- **Live Pricing** — Automatic daily price updates from TCGPlayer and CardMarket for every card and sealed product
- **Bulk Scanning** — Scan an entire stack of cards quickly, add them all to a portfolio at once
- **AI Grade Estimator** — Analyze card centering with your camera, estimate PSA/CGC/BGS grades, calculate grading ROI and fees
- **Box Open Tracker** — Track pulls from booster boxes, calculate set ROI in real-time
- **Multi-Currency** — USD, CAD, EUR, GBP, JPY, AUD with live ECB exchange rates
- **Import/Export** — CSV import and export for your entire collection
- **Card Transfer** — Move cards between portfolios
- **Japanese Card Support** — Full support for Japanese Pokemon cards with CardMarket pricing
- **PWA** — Install on your iPhone/Android home screen like a native app

---

## Quick Start (Beginner-Friendly)

> **No coding experience?** No problem. Follow these steps exactly and you'll have it running in 10 minutes.

### Step 0: Install Required Software

You need two free programs. Download and install both — just click "Next" through the installers.

| Program | Download Link | What It Does |
|---------|--------------|--------------|
| **Node.js** | [nodejs.org](https://nodejs.org) — click the big green **"LTS"** button | Runs the app |
| **Git** | [git-scm.com/downloads](https://git-scm.com/downloads) | Downloads the code |

After installing both, **restart your computer**.

### Step 1: Download Collectr

Open your terminal:
- **Windows**: Press `Win` key, type `cmd`, press Enter
- **Mac**: Press `Cmd + Space`, type `Terminal`, press Enter

Copy and paste this command, then press Enter:

```bash
git clone https://github.com/Trooper15a/collectr.git
```

### Step 2: Install Dependencies

```bash
cd collectr/web
```

```bash
npm install
```

Wait 1-2 minutes until it finishes (you'll see your cursor come back).

### Step 3: Set Up PokéWallet API Key (Free — Optional)

> Skip this step if you only want Magic/Yu-Gi-Oh. This is only needed for Pokemon card images and CardMarket EUR prices.

1. Go to [pokewallet.io](https://pokewallet.io) and create a free account
2. Copy your API key from your account settings
3. In the `web` folder, create a new file called `.env.local`
   - **Windows**: Open Notepad, paste the line below, then File → Save As → navigate to the `web` folder → type `.env.local` as the filename → change "Save as type" to "All Files" → Save
   - **Mac**: Open TextEdit, paste the line below, Format → Make Plain Text, then save as `.env.local` in the `web` folder
4. Put this in the file (replace `YOUR_KEY_HERE` with your actual key):

```
POKEWALLET_API_KEY=YOUR_KEY_HERE
```

### Step 4: Start the App

```bash
npm run dev
```

Open your browser and go to: **http://localhost:3000**

That's it! The app is running.

### Step 5: Import Card Prices (First Time)

1. Go to [http://localhost:3000/settings](http://localhost:3000/settings)
2. Scroll to **"TCGPlayer price database"**
3. Select which card games you want (Pokemon, Magic, Yu-Gi-Oh, etc.)
4. Click **"Import prices now"**
5. Wait 2-5 minutes — this downloads prices for ~60,000+ cards

Prices refresh automatically every night after this.

---

## Scanning Cards With Your Phone

Your phone's camera requires HTTPS (a secure connection). Here's how to set it up:

### Step 1: Start in HTTPS Mode

Stop the server if it's running (press `Ctrl + C` in your terminal), then:

```bash
npm run dev:https
```

The first time, it may ask for admin/password to install a local certificate — say yes.

### Step 2: Find Your Computer's IP Address

- **Windows**: Open cmd, type `ipconfig`, look for **"IPv4 Address"** (looks like `192.168.1.xxx`)
- **Mac**: System Preferences → Network → look for your IP address

### Step 3: Open on Your Phone

1. Make sure your phone is on the **same WiFi** as your computer
2. Open your phone's browser (Chrome or Safari)
3. Go to: `https://YOUR_COMPUTER_IP:3000` (example: `https://192.168.1.42:3000`)
4. You'll see a security warning — this is normal:
   - **iPhone Safari**: Tap "Show Details" → "visit this website" → "Visit Website"
   - **Android Chrome**: Tap "Advanced" → "Proceed to site"
5. Allow camera access when prompted
6. **iPhone tip**: Tap the share button → "Add to Home Screen" to make it feel like a real app

---

## Updating Card Database

When new sets release, update your scanner to recognize new cards:

### Option A: In-App Button (Easiest)

Go to Settings → scroll to **Scanner** → click **"Check for new cards"**

Uses TCGdex (free, no rate limits). Takes about 1 minute.

### Option B: Command Line

```bash
cd ml
.venv\Scripts\python.exe update_index.py
```

> First time? You'll need to set up the Python environment — see the [ML Pipeline](#ml-pipeline) section below.

---

## Self-Hosting (Access From Anywhere)

Want to access your collection from anywhere — not just your home WiFi? You can host Collectr on a server that's always online.

### Option 1: VPS Server (~$4-6/month)

A VPS is a small computer in the cloud that runs 24/7. This is the cheapest and most reliable option.

**Recommended providers:**

| Provider | Price | Link |
|----------|-------|------|
| Hetzner | ~$4/month | [hetzner.com](https://hetzner.com) |
| DigitalOcean | $6/month | [digitalocean.com](https://digitalocean.com) |
| Linode | $5/month | [linode.com](https://linode.com) |
| Vultr | $6/month | [vultr.com](https://vultr.com) |

**How to set it up (step by step):**

1. **Create an account** on any provider above
2. **Create a server**: Pick the cheapest option (1 GB RAM, 1 CPU is enough). Choose **Ubuntu 22.04** as the operating system
3. **Connect to your server**: The provider will give you an IP address and password. Open your terminal and type:

```bash
ssh root@YOUR_SERVER_IP
```

4. **Install Node.js and Git**:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs git
```

5. **Download and build Collectr**:

```bash
git clone https://github.com/Trooper15a/collectr.git
cd collectr/web
npm install
```

6. **Add your PokéWallet key** (if you have one):

```bash
echo "POKEWALLET_API_KEY=YOUR_KEY_HERE" > .env.local
```

7. **Build for production** (faster than dev mode):

```bash
npm run build
```

8. **Start the server**:

```bash
npm run start
```

Your app is now running at `http://YOUR_SERVER_IP:3000`

#### Keep It Running Forever

By default, the app stops when you close your terminal. To keep it running 24/7:

```bash
sudo npm install -g pm2
```

```bash
pm2 start npm --name collectr -- run start
```

```bash
pm2 startup
```

```bash
pm2 save
```

Now it auto-starts on reboot. To check status: `pm2 status`. To view logs: `pm2 logs collectr`.

#### Add a Custom Domain + HTTPS (Recommended)

Without this, you'd access your app via `http://123.45.67.89:3000` — not great. With a domain, you get `https://cards.yourdomain.com`.

1. **Buy a domain** (~$10/year) from [Namecheap](https://namecheap.com) or [Cloudflare](https://cloudflare.com)

2. **Point the domain to your server**: In your domain provider's DNS settings, add an **A record**:
   - Name: `@` (or your subdomain like `cards`)
   - Value: your server's IP address

3. **Install Caddy** (automatic HTTPS web server):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo apt update && sudo apt install caddy
```

4. **Configure Caddy**: Open the config file:

```bash
sudo nano /etc/caddy/Caddyfile
```

Delete everything and type (replace with your actual domain):

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Press `Ctrl + X`, then `Y`, then `Enter` to save.

5. **Restart Caddy**:

```bash
sudo systemctl restart caddy
```

Your app is now live at **https://yourdomain.com** with automatic HTTPS! Camera scanning works on your phone without any certificate warnings.

### Option 2: Railway (~$5/month, Easiest Setup)

[Railway](https://railway.app) handles everything for you — no terminal needed.

1. Sign up at [railway.app](https://railway.app) with your GitHub account
2. Click **"New Project"** → **"Deploy from GitHub Repo"**
3. Select the collectr repo
4. In Settings, set the root directory to `web`
5. Add environment variable: `POKEWALLET_API_KEY` = your key
6. Railway gives you a free URL like `collectr-production.up.railway.app`

Railway auto-deploys when you push code changes. No terminal, no server management.

### Option 3: Vercel (Free Tier Available)

[Vercel](https://vercel.com) has a generous free tier but with some limits (cold starts, serverless function timeouts).

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **"Import Project"** → select the collectr repo
4. Set root directory to `web`
5. Add environment variable: `POKEWALLET_API_KEY`
6. Click **Deploy**

**Free tier note**: The scanner model (~20 MB) loads from browser cache after first use, so cold starts only affect the first visit.

### Option 4: Keep It on Your Computer (Free)

You can set it up to auto-start when your computer turns on:

```bash
cd web
npm run build
npm run autostart:install
```

This creates a startup shortcut. The server runs hidden in the background whenever you log in. Access it on your phone via your home WiFi at `https://YOUR_COMPUTER_IP:3000`.

To remove: `npm run autostart:remove`

---

## Data Sources

| Data | Source | API Key |
|------|--------|---------|
| TCGPlayer prices (all games, daily) | [tcgcsv.com](https://tcgcsv.com) | None (free, no limit) |
| CardMarket EUR prices (Pokemon) | [PokéWallet](https://pokewallet.io) | Free key (100/hr) |
| Pokemon scanner images | [TCGdex](https://tcgdex.net) | None (free, no limit) |
| Magic images | [Scryfall](https://scryfall.com) | None (free) |
| Yu-Gi-Oh! images | [YGOProDeck](https://ygoprodeck.com) | None (free) |
| Exchange rates | [Frankfurter](https://frankfurter.app) (ECB) | None (free) |

---

## ML Pipeline

> Only needed if you want to retrain the model or add new card games. The pre-trained model ships with the repo.

### Setup

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate                    # Windows
# source .venv/bin/activate               # Mac/Linux
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

### Scrape Card Images

```bash
python scrape/tcgdex.py                    # Pokemon EN + JP (~24k images, ~25 min)
python scrape/tcgcsv_images.py             # TCGPlayer Pokemon images (~55k, ~1 hour)
python scrape/scryfall.py                  # Magic (~100k images, fast)
python scrape/ygoprodeck.py                # Yu-Gi-Oh! (~13k images)
```

### Train the Model

```bash
python train.py --epochs 12 --batch-size 96   # ~2-4 hours on an 8 GB GPU
```

### Export for the Browser

```bash
python embed.py         # creates embeddings.bin + index.json
python export.py        # creates card_embedder.onnx
```

### Update Without Retraining

When new sets come out, just run:

```bash
python update_index.py
```

This checks for new cards on TCGdex, downloads images, computes embeddings with the existing model, and updates the index. Takes ~1 minute. No retraining needed.

---

## How the Scanner Works

The scanner uses a custom-trained **EfficientNet-B0** neural network:

1. **Training**: Learns to produce a unique 512-number "fingerprint" (embedding) for each card image
2. **On your phone**: The camera frame is processed by the model running in your browser (ONNX Runtime Web)
3. **Matching**: The fingerprint is compared against all ~170,000 known cards using cosine similarity
4. **Result**: Best match returned in <1 second, with top 5 alternatives shown

The model is ~18 MB and is cached in your browser after first load. Everything runs on-device — no images are ever sent to any server.

**Accuracy**: 99.06% recall@1 (correctly identifies the card on the first try 99% of the time).

---

## Project Structure

```
collectr/
├── web/                        # Next.js web application
│   ├── src/app/                # Pages and API routes
│   ├── src/components/         # React components
│   ├── src/db/                 # Database schema (Drizzle + SQLite)
│   ├── src/lib/                # Utilities, scanner, pricing
│   ├── public/model/           # Pre-trained ONNX model + embedding index
│   └── data/                   # SQLite database (auto-created)
├── ml/                         # Machine learning pipeline
│   ├── model.py                # EfficientNet-B0 architecture
│   ├── train.py                # Training script
│   ├── embed.py                # Compute embeddings
│   ├── export.py               # ONNX export
│   ├── update_index.py         # Auto-update for new sets
│   └── scrape/                 # Data scrapers
├── LICENSE                     # MIT
└── README.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React, Tailwind CSS, TypeScript |
| Backend | Next.js API routes, Drizzle ORM, SQLite |
| ML | PyTorch, EfficientNet-B0, ONNX Runtime Web |
| Pricing | TCGPlayer (tcgcsv.com), CardMarket, PokéWallet |
| Scanner | On-device inference, cosine similarity search |

## Contributing

Pull requests welcome! Ideas for contribution:

- Add more TCG support (Flesh and Blood, Weiss Schwarz, Star Wars Unlimited)
- Improve grade estimator with surface/edge detection
- Price alerts and notifications
- Marketplace/trading features between users
- Native mobile app (React Native)

## License

[MIT](LICENSE) — use it however you want.
