# Collect Them All

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
git clone https://github.com/Trooper15a/collect_them_all.git
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

## Access From Anywhere (Free with Tailscale)

Want to use Collect Them All outside your home WiFi — on cellular, at work, anywhere? Use [Tailscale](https://tailscale.com) (free for personal use). It creates a private encrypted network between your devices so only you can access your server.

### Step 1: Install Tailscale on Your Computer

- **Windows**: Download from [tailscale.com/download](https://tailscale.com/download) and install
- **Mac**: Download from the App Store or [tailscale.com/download](https://tailscale.com/download)

Sign in with Google, Microsoft, or GitHub.

### Step 2: Install Tailscale on Your Phone

- **iPhone**: Download [Tailscale](https://apps.apple.com/app/tailscale/id1470499037) from the App Store
- **Android**: Download [Tailscale](https://play.google.com/store/apps/details?id=com.tailscale.ipn) from Google Play

Sign in with the **same account** you used on your computer.

### Step 3: Enable HTTPS in Tailscale

The camera scanner requires HTTPS. Tailscale gives you a free valid certificate.

1. Go to the [Tailscale admin console](https://login.tailscale.com/admin/dns) in your browser
2. Scroll to **HTTPS Certificates** and enable it

### Step 4: Start the HTTPS Proxy

On your computer, open a terminal and run:

```bash
tailscale serve --bg http://localhost:3000
```

This creates a permanent HTTPS URL for your app (something like `https://your-computer.tail1234.ts.net`). The command will print your exact URL.

To check your URL anytime:

```bash
tailscale serve status
```

### Step 5: Open on Your Phone

On your phone's browser, open the `https://...ts.net` URL from the previous step. Bookmark it — the link is permanent.

The connection is end-to-end encrypted with WireGuard. The camera scanner works because you have a valid HTTPS certificate.

> **Tip**: On iPhone, tap Share → "Add to Home Screen" to make it feel like a native app.

### Alternative: Self-Hosting (Not Free)

You can also self-host on a VPS or cloud platform (~$4-6/month for Hetzner, DigitalOcean, Railway, etc.).

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
