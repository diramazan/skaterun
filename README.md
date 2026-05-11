# 🛹 SkateRun

Ein Skateboard Browser-Game als Flask-Webapp — mit Login, 10 Levels, Highscores und Claude-KI-Analyse.

---

## 🚀 Lokale Installation (VS Code)

### 1. Repository klonen
```bash
git clone https://github.com/DEIN-NAME/skaterun.git
cd skaterun
```

### 2. Virtual Environment erstellen
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Dependencies installieren
```bash
pip install -r requirements.txt
```

### 4. Umgebungsvariablen setzen
```bash
# .env.example kopieren und anpassen
cp .env.example .env
```
Dann `.env` öffnen und ausfüllen:
```
SECRET_KEY=irgendein-langer-zufaelliger-string
ANTHROPIC_API_KEY=sk-ant-...   # optional, nur für Claude-Tipps
```

### 5. App starten
```bash
python app.py
```

Jetzt im Browser öffnen: **http://localhost:5000**

---

## 🎮 Spielen

| Taste | Aktion |
|-------|--------|
| `Leertaste` / `Pfeil hoch` | Springen |
| Klick / Touch | Springen |
| Doppeldrücken | Doppelsprung (Level 1–4) |

### Level-Übersicht

| Level | Name | Ziel-Score | Besonderheit |
|-------|------|------------|--------------|
| 1 | Tutorial | 300 | Einstieg, Doppelsprung |
| 2 | Warm-Up | 450 | |
| 3 | Straße | 600 | Lila Neon |
| 4 | Nacht | 750 | Blau-Nacht |
| 5 | Speed Zone | 900 | Kein Doppelsprung! |
| 6 | Chaos | 1100 | Mehr Hindernisse |
| 7 | Storm | 1300 | |
| 8 | Neon Hell | 1500 | |
| 9 | Overdrive | 1800 | |
| 10 | FINAL | 2200 | Maximale Challenge |

Levels müssen der Reihe nach abgeschlossen werden.

---

## 📁 Projektstruktur

```
skaterun/
├── app.py                 # Flask Backend & Routen
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
├── templates/
│   ├── base.html          # Layout mit Navbar
│   ├── login.html
│   ├── register.html
│   ├── home.html          # Level-Auswahl
│   ├── game.html          # Spielseite
│   ├── profile.html       # Statistiken
│   └── leaderboard.html   # Rangliste
└── static/
    ├── css/
    │   ├── main.css       # Globales Styling
    │   └── game.css       # Game-spezifisches CSS
    └── js/
        └── game.js        # Komplette Game Engine
```

---

## 🐙 GitHub Setup

```bash
git init
git add .
git commit -m "🛹 Initial commit — SkateRun"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/skaterun.git
git push -u origin main
```

> ⚠️ **Wichtig:** Niemals `.env` pushen! Sie steht in `.gitignore`.

---

## ✨ Geplante Features

- [ ] Level 11–20
- [ ] Power-ups (Magnet, Shield, Slow-Mo)
- [ ] Sound-Effekte
- [ ] Animierter Charakter-Skin wählen
- [ ] Multiplayer Rangliste (online)
- [ ] Mobile Touch-Controls

---

Gebaut mit ❤️ und 🛹
