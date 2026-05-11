from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///skaterun.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ── Models ────────────────────────────────────────────────────────────────────

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    scores = db.relationship('Score', backref='user', lazy=True)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)


class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    level = db.Column(db.Integer, nullable=False)
    score = db.Column(db.Integer, nullable=False)
    completed = db.Column(db.Boolean, default=False)
    played_at = db.Column(db.DateTime, default=datetime.utcnow)


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('home'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            session['user_id'] = user.id
            session['username'] = user.username
            return redirect(url_for('home'))
        error = 'Ungültiger Benutzername oder Passwort.'
    return render_template('login.html', error=error)


@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        if len(username) < 3:
            error = 'Benutzername muss mindestens 3 Zeichen lang sein.'
        elif len(password) < 6:
            error = 'Passwort muss mindestens 6 Zeichen lang sein.'
        elif User.query.filter_by(username=username).first():
            error = 'Benutzername ist bereits vergeben.'
        else:
            user = User(username=username)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            session['user_id'] = user.id
            session['username'] = user.username
            return redirect(url_for('home'))
    return render_template('register.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ── Game routes ───────────────────────────────────────────────────────────────

@app.route('/home')
def home():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    user = User.query.get(session['user_id'])
    # Build level progress map
    levels = []
    for lvl in range(1, 11):
        best = Score.query.filter_by(user_id=user.id, level=lvl)\
                          .order_by(Score.score.desc()).first()
        completed = Score.query.filter_by(user_id=user.id, level=lvl, completed=True).first()
        levels.append({
            'number': lvl,
            'best_score': best.score if best else None,
            'completed': bool(completed),
            'unlocked': lvl == 1 or bool(
                Score.query.filter_by(user_id=user.id, level=lvl-1, completed=True).first()
            )
        })
    return render_template('home.html', user=user, levels=levels)


@app.route('/play/<int:level>')
def play(level):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    if level < 1 or level > 10:
        return redirect(url_for('home'))
    # Check unlock
    if level > 1:
        prev_done = Score.query.filter_by(
            user_id=session['user_id'], level=level-1, completed=True
        ).first()
        if not prev_done:
            return redirect(url_for('home'))
    return render_template('game.html', level=level, username=session['username'])


@app.route('/profile')
def profile():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    user = User.query.get(session['user_id'])
    scores = Score.query.filter_by(user_id=user.id).order_by(Score.played_at.desc()).limit(20).all()
    total_games = Score.query.filter_by(user_id=user.id).count()
    completed_levels = Score.query.filter_by(user_id=user.id, completed=True)\
                                  .with_entities(Score.level).distinct().count()
    total_score = db.session.query(db.func.sum(Score.score))\
                            .filter_by(user_id=user.id).scalar() or 0
    return render_template('profile.html', user=user, scores=scores,
                           total_games=total_games, completed_levels=completed_levels,
                           total_score=total_score)


@app.route('/leaderboard')
def leaderboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    # Top scores per user (sum of best per level)
    users = User.query.all()
    board = []
    for u in users:
        total = 0
        for lvl in range(1, 11):
            best = Score.query.filter_by(user_id=u.id, level=lvl)\
                              .order_by(Score.score.desc()).first()
            if best:
                total += best.score
        completed = Score.query.filter_by(user_id=u.id, completed=True)\
                               .with_entities(Score.level).distinct().count()
        board.append({'username': u.username, 'total': total, 'completed': completed})
    board.sort(key=lambda x: x['total'], reverse=True)
    return render_template('leaderboard.html', board=board)


# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/api/save_score', methods=['POST'])
def save_score():
    if 'user_id' not in session:
        return jsonify({'error': 'not logged in'}), 401
    data = request.get_json()
    score = Score(
        user_id=session['user_id'],
        level=data['level'],
        score=data['score'],
        completed=data.get('completed', False)
    )
    db.session.add(score)
    db.session.commit()
    # Return best score for this level
    best = Score.query.filter_by(user_id=session['user_id'], level=data['level'])\
                      .order_by(Score.score.desc()).first()
    return jsonify({'saved': True, 'best': best.score})


@app.route('/api/claude_tips', methods=['POST'])
def claude_tips():
    """Proxy to Anthropic API — keeps API key server-side."""
    if 'user_id' not in session:
        return jsonify({'error': 'not logged in'}), 401
    import requests as req
    data = request.get_json()
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return jsonify({'text': '⚠ Kein API-Key konfiguriert. Bitte ANTHROPIC_API_KEY setzen.'})
    resp = req.post('https://api.anthropic.com/v1/messages',
        headers={'Content-Type': 'application/json', 'x-api-key': api_key,
                 'anthropic-version': '2023-06-01'},
        json={'model': 'claude-sonnet-4-20250514', 'max_tokens': 800,
              'messages': [{'role': 'user', 'content': data.get('prompt', '')}]},
        timeout=30)
    result = resp.json()
    text = ''.join(b.get('text','') for b in result.get('content', []))
    return jsonify({'text': text})


# ── Init ──────────────────────────────────────────────────────────────────────

# ── PWA routes ───────────────────────────────────────────────────────────────

@app.route('/sw.js')
def service_worker():
    resp = app.send_static_file('sw.js')
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp

@app.route('/manifest.json')
def manifest():
    return app.send_static_file('manifest.json')


with app.app_context():
    db.create_all()

if __name__ == '__main__':
    import sys
    # Use HTTPS for PWA (required for Service Worker)
    # Run with: python3 app.py
    # Or for HTTP only: python3 app.py --http
    if '--http' in sys.argv:
        app.run(debug=True, host='0.0.0.0', port=5001)
    else:
        try:
            app.run(debug=True, host='0.0.0.0', port=5001, ssl_context='adhoc')
        except Exception:
            print("HTTPS fehlgeschlagen, starte mit HTTP...")
            app.run(debug=True, host='0.0.0.0', port=5001)
