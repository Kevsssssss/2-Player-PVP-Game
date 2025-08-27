/*
 * 2-Player PVP Arcade (single-file)
 * - Player1: Mouse (follow cursor, left click to attack)
 * - Player2: WASD (move with WASD, F to attack)
 * Comments throughout explain how to replace icons and add SFX.
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const WIDTH = canvas.width, HEIGHT = canvas.height;

// UI elements
const menuOverlay = document.getElementById('menuOverlay');
const lobbyOverlay = document.getElementById('lobbyOverlay');
const countdownOverlay = document.getElementById('countdownOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const p1ReadyDot = document.getElementById('p1ReadyDot');
const p2ReadyDot = document.getElementById('p2ReadyDot');
const p1HeartsUI = document.getElementById('p1Hearts');
const p2HeartsUI = document.getElementById('p2Hearts');
const startBtn = document.getElementById('startBtn');
const countdownText = document.getElementById('countdownText');
const winnerText = document = document.getElementById('winnerText');
const restartBtn = document.getElementById('restartBtn');

// --- Game config ---
const PLAYER_RADIUS = 20;
const BASE_SPEED = 4.5;
const BOOTS_SPEED_MULT = 2;
const BOOTS_DURATION = 4000;
const ITEM_SPAWN_INTERVAL = 3000;
const MAX_HEARTS = 7;
const ATTACK_RANGE = 36;
const ATTACK_COOLDOWN = 600;
const INVULNERABILITY_DURATION = 500;
const BOMB_TIMER = 3000;
const BOMB_RADIUS = 75;

// --- Map data and obstacles ---
const obstacles = [
    // A few central blocks
    { x: 250, y: 250, width: 50, height: 100 },
    { x: 500, y: 250, width: 50, height: 100 },
    // Horizontal central block
    { x: 300, y: 300, width: 200, height: 25 },
    // Corners
    { x: 100, y: 100, width: 100, height: 25 },
    { x: 100, y: HEIGHT - 125, width: 100, height: 25 },
    { x: WIDTH - 200, y: 100, width: 100, height: 25 },
    { x: WIDTH - 200, y: HEIGHT - 125, width: 100, height: 25 },
];


// --- Game state ---
let running = false;
let lastTime = 0;
let items = [];
let bombs = [];
let itemTimer = 0;
let random = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// --- Player objects ---
function createPlayer(x, y, color) {
    return {
        x, y, vx: 0, vy: 0, color, radius: PLAYER_RADIUS,
        speed: BASE_SPEED, baseSpeed: BASE_SPEED,
        hearts: 5,
        hasSword: false, hasShield: false, bootsEnd: 0,
        attackCooldown: 0,
        alive: true,
        invulnerableUntil: 0,
    }
}

const p1 = createPlayer(WIDTH * 0.25, HEIGHT * 0.5, 'red');
const p2 = createPlayer(WIDTH * 0.75, HEIGHT * 0.5, 'blue');

// Input state
let mouse = { x: p1.x, y: p1.y, moved: false, down: false };
let keys = {};

// Setup hearts UI
function renderHeartsUI() {
    p1HeartsUI.querySelectorAll('.heart').forEach(h => h.remove());
    p2HeartsUI.querySelectorAll('.heart').forEach(h => h.remove());

    for (let i = 0; i < p1.hearts; i++) {
        const d = document.createElement('div');
        d.className = 'heart';
        d.textContent = '♥';
        d.style.color = 'crimson';
        p1HeartsUI.appendChild(d);
    }
    for (let i = 0; i < p2.hearts; i++) {
        const d = document.createElement('div');
        d.className = 'heart p2';
        d.textContent = '♥';
        d.style.color = 'dodgerblue';
        p2HeartsUI.appendChild(d);
    }
}

// --- Items ---
let nextItemId = 1;
function spawnItem() {
    const types = ['sword', 'shield', 'boots', 'heart', 'bomb'];
    const type = types[random(0, types.length - 1)];
    const size = 28;
    
    let x, y;
    let overlap;
    do {
        overlap = false;
        x = random(60, WIDTH - 60);
        y = random(80, HEIGHT - 40);
        
        for (const obs of obstacles) {
            const dx = x - Math.max(obs.x, Math.min(x, obs.x + obs.width));
            const dy = y - Math.max(obs.y, Math.min(y, obs.y + obs.height));
            if ((dx * dx + dy * dy) < (size / 2 + 10) * (size / 2 + 10)) {
                overlap = true;
                break;
            }
        }
    } while (overlap);
    
    items.push({ id: nextItemId++, type, x, y, size });
}

/**
 * Drops a player's held item onto the map.
 * @param {object} player The player object that is dropping the item.
 */
function dropItem(player) {
    if (player.hasSword) {
        items.push({ id: nextItemId++, type: 'sword', x: player.x, y: player.y, size: 28 });
        player.hasSword = false;
    } else if (player.hasShield) {
        items.push({ id: nextItemId++, type: 'shield', x: player.x, y: player.y, size: 28 });
        player.hasShield = false;
    }
}


// --- Attack & Damage Logic ---
function takeDamage(player, amount) {
    dropItem(player);

    player.hearts = Math.max(0, player.hearts - amount);
    player.invulnerableUntil = performance.now() + INVULNERABILITY_DURATION;
    renderHeartsUI();
    if (player.hearts <= 0) {
        player.alive = false;
        endGame(player === p1 ? 'Player 2 (Blue)' : 'Player 1 (Red)');
    }
}

// Effects arrays
let bloodEffects = [];
let blockEffects = [];
let explosionEffects = [];

function spawnBloodEffect(x, y) {
    bloodEffects.push({ x, y, life: 400, r: 6 + Math.random() * 12, t: performance.now() });
}

function spawnBlockEffect(x, y) {
    blockEffects.push({ x, y, life: 300, t: performance.now() });
}

function spawnExplosionEffect(x, y) {
    explosionEffects.push({ x, y, life: 300, r: BOMB_RADIUS, t: performance.now() });
}

// --- Game loop ---
function resetGame() {
    Object.assign(p1, createPlayer(WIDTH * 0.25, HEIGHT * 0.5, 'red'));
    Object.assign(p2, createPlayer(WIDTH * 0.75, HEIGHT * 0.5, 'blue'));
    items = [];
    bombs = [];
    bloodEffects = [];
    blockEffects = [];
    explosionEffects = [];
    itemTimer = 0;
    nextItemId = 1;
    renderHeartsUI();
}

function loop(ts) {
    if (!running) return;
    const dt = ts - (lastTime || ts);
    lastTime = ts;

    update(dt);
    draw();
    requestAnimationFrame(loop);
}

function checkCollision(player, obs) {
    const testX = Math.max(obs.x, Math.min(player.x, obs.x + obs.width));
    const testY = Math.max(obs.y, Math.min(player.y, obs.y + obs.height));
    const dx = testX - player.x;
    const dy = testY - player.y;
    
    return ((dx * dx + dy * dy) < player.radius * player.radius);
}

function update(dt) {
    const now = performance.now();
    itemTimer += dt;
    if (itemTimer >= ITEM_SPAWN_INTERVAL) {
        spawnItem();
        itemTimer = 0;
    }

    [p1, p2].forEach(p => {
        p.speed = (p.bootsEnd > now) ? p.baseSpeed * BOOTS_SPEED_MULT : p.baseSpeed;
    });

    const p1OldPos = { x: p1.x, y: p1.y };
    const p2OldPos = { x: p2.x, y: p2.y };

    if (p1.alive) {
        let dx = mouse.x - p1.x;
        let dy = mouse.y - p1.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
            const maxStep = p1.speed;
            p1.x += (dx / d) * Math.min(d, maxStep);
            p1.y += (dy / d) * Math.min(d, maxStep);
        }
    }

    if (p2.alive) {
        let ax = 0, ay = 0;
        if (keys['w']) ay -= 1;
        if (keys['s']) ay += 1;
        if (keys['a']) ax -= 1;
        if (keys['d']) ax += 1;
        if (ax || ay) {
            const mag = Math.hypot(ax, ay) || 1;
            p2.x += (ax / mag) * p2.speed;
            p2.y += (ay / mag) * p2.speed;
        }
    }
    
    [p1, p2].forEach(p => {
        p.x = Math.max(p.radius + 6, Math.min(WIDTH - p.radius - 6, p.x));
        p.y = Math.max(p.radius + 6, Math.min(HEIGHT - p.radius - 6, p.y));

        for (const obs of obstacles) {
            if (checkCollision(p, obs)) {
                if (p === p1) { p.x = p1OldPos.x; p.y = p1OldPos.y; }
                else { p.x = p2OldPos.x; p.y = p2OldPos.y; }
            }
        }
    });

    // --- NEW: Bomb Countdown and Detonation Logic ---
    bombs = bombs.filter(bomb => {
        bomb.timer -= dt;
        if (bomb.timer <= 0 && !bomb.detonated) {
            spawnExplosionEffect(bomb.x, bomb.y);

            [p1, p2].forEach(p => {
                if (p.alive && now > p.invulnerableUntil) {
                    const dist = Math.hypot(p.x - bomb.x, p.y - bomb.y);
                    if (dist < BOMB_RADIUS + p.radius) {
                        takeDamage(p, 1);
                    }
                }
            });

            items = items.filter(it => {
                const dist = Math.hypot(it.x - bomb.x, it.y - bomb.y);
                return dist > BOMB_RADIUS;
            });
            return false;
        }
        return true;
    });

    // --- Instant Sword-Collision Damage Logic ---
    const collisionDist = p1.radius + p2.radius;
    if (p1.alive && p2.alive && Math.hypot(p1.x - p2.x, p1.y - p2.y) <= collisionDist) {
        // Case 1: P1 has a sword and P2 is not invulnerable
        if (p1.hasSword && now > p2.invulnerableUntil) {
            if (p2.hasShield) {
                p2.hasShield = false;
                spawnBlockEffect(p2.x, p2.y);
                p1.hasSword = false;
            } else {
                takeDamage(p2, 3);
                p1.hasSword = false;
                spawnBloodEffect(p2.x, p2.y);
            }
        }
        // Case 2: P2 has a sword and P1 is not invulnerable
        if (p2.hasSword && now > p1.invulnerableUntil) {
            if (p1.hasShield) {
                p1.hasShield = false;
                spawnBlockEffect(p1.x, p1.y);
                p2.hasSword = false;
            } else {
                takeDamage(p1, 3);
                p2.hasSword = false;
                spawnBloodEffect(p1.x, p1.y);
            }
        }
    }


    // Item pickups
    for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (p1.alive && Math.hypot(it.x - p1.x, it.y - p1.y) <= p1.radius + it.size / 2) {
            applyItem(p1, it);
            items.splice(i, 1);
            continue;
        }
        if (p2.alive && Math.hypot(it.x - p2.x, it.y - p2.y) <= p2.radius + it.size / 2) {
            applyItem(p2, it);
            items.splice(i, 1);
            continue;
        }
    }

    // Update and prune effects
    bloodEffects = bloodEffects.filter(e => (now - e.t) < e.life);
    blockEffects = blockEffects.filter(e => (now - e.t) < e.life);
    explosionEffects = explosionEffects.filter(e => (now - e.t) < e.life);
}

function applyItem(player, item) {
    switch (item.type) {
        case 'sword': player.hasSword = true; break;
        case 'shield': player.hasShield = true; break;
        case 'boots': player.bootsEnd = performance.now() + BOOTS_DURATION; break;
        case 'heart':
            player.hearts = Math.min(MAX_HEARTS, player.hearts + 1);
            renderHeartsUI();
            break;
        case 'bomb':
            bombs.push({ x: player.x, y: player.y, timer: BOMB_TIMER, detonated: false });
            break;
    }
}

function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw grid
    ctx.save();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.globalAlpha = 0.08;
    for (let gx = 0; gx < WIDTH; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, HEIGHT); ctx.stroke(); }
    for (let gy = 0; gy < HEIGHT; gy += 30) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WIDTH, gy); ctx.stroke(); }
    ctx.restore();
    
    // Draw obstacles
    ctx.fillStyle = '#333';
    for (const obs of obstacles) {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    }
    
    // Draw bombs
    bombs.forEach(bomb => {
        ctx.save();
        const timeLeft = bomb.timer;
        ctx.globalAlpha = (timeLeft > 1000) ? 1 : Math.abs(Math.sin(performance.now() / 100));
        ctx.font = '28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', bomb.x, bomb.y + 3);
        ctx.restore();
    });

    // Draw items
    items.forEach(it => {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.rect(-it.size / 2, -it.size / 2, it.size, it.size);
        ctx.fill();
        
        ctx.font = '28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let emoji = '';
        if (it.type === 'sword') emoji = '⚔️';
        if (it.type === 'shield') emoji = '🛡️';
        if (it.type === 'boots') emoji = '👟';
        if (it.type === 'heart') emoji = '❤️';
        if (it.type === 'bomb') emoji = '💣';
        
        ctx.fillText(emoji, 0, 3);
        ctx.restore();
    });

    // Draw players and their invulnerability status
    if (p1.alive) drawPlayer(p1);
    if (p2.alive) drawPlayer(p2);

    // Draw effects
    const now = performance.now();
    bloodEffects.forEach(e => {
        const a = 1 - (now - e.t) / e.life;
        ctx.save(); ctx.globalAlpha = 0.6 * a; ctx.fillStyle = 'crimson';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 + (now - e.t) / e.life), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    blockEffects.forEach(e => {
        const a = 1 - (now - e.t) / e.life;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, 28 * (1 + (now - e.t) / e.life), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });
    explosionEffects.forEach(e => {
        const a = 1 - (now - e.t) / e.life;
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'orange';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (now - e.t) / e.life, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
}

function drawPlayer(p) {
    ctx.save();
    if (performance.now() < p.invulnerableUntil) {
        ctx.globalAlpha = (Math.sin(performance.now() / 60) * 0.4) + 0.6;
    }
    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '20px sans-serif';
    if (p.hasSword) {
        ctx.fillStyle = '#fff';
        ctx.fillText('⚔️', p.x, p.y - p.radius - 8);
    }
    if (p.hasShield) {
        ctx.fillStyle = '#fff';
        ctx.fillText('🛡️', p.x, p.y + p.radius + 8);
    }
    ctx.restore();
}

function endGame(winner) {
    running = false;
    gameOverOverlay.style.display = 'flex';
    winnerText.textContent = winner + ' Wins!';
}

// --- Input Handlers ---
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    if (!p2Ready && lobbyOverlay.style.display === 'flex' && ['w', 'a', 's', 'd'].includes(key)) {
        p2Ready = true; p2ReadyDot.classList.add('ready-true');
        checkBothReadyAndStartCountdown();
    }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// --- Game State Flow ---
function setPlayer1Ready() {
    if (!p1Ready && lobbyOverlay.style.display === 'flex') {
        p1Ready = true; p1ReadyDot.classList.add('ready-true');
        checkBothReadyAndStartCountdown();
    }
}
lobbyOverlay.addEventListener('mousemove', setPlayer1Ready);
lobbyOverlay.addEventListener('mousedown', setPlayer1Ready);

startBtn.addEventListener('click', () => {
    menuOverlay.style.display = 'none'; lobbyOverlay.style.display = 'flex';
    p1Ready = false; p2Ready = false;
    p1ReadyDot.classList.remove('ready-true'); p2ReadyDot.classList.remove('ready-true');
});
restartBtn.addEventListener('click', () => {
    gameOverOverlay.style.display = 'none'; lobbyOverlay.style.display = 'flex';
    p1Ready = false; p2Ready = false;
    p1ReadyDot.classList.remove('ready-true'); p2ReadyDot.classList.remove('ready-true');
});

function checkBothReadyAndStartCountdown() {
    if (p1Ready && p2Ready) {
        lobbyOverlay.style.display = 'none'; countdownOverlay.style.display = 'flex';
        let counter = 3;
        countdownText.textContent = counter;
        const tick = setInterval(() => {
            counter--;
            if (counter <= 0) {
                clearInterval(tick); countdownOverlay.style.display = 'none';
                startRound();
            }
            countdownText.textContent = counter <= 0 ? 'GO!' : counter;
        }, 1000);
    }
}

function startRound() {
    resetGame();
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

// Initial Setup
renderHeartsUI();
canvas.tabIndex = 0;
menuOverlay.style.display = 'flex';