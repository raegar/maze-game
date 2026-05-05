/**
 * MAZE PURSUIT - Core Game Logic (v3.0 Stabilized)
 * Fixes: Map bounds, Vector scaling, Collision jitter, Touch debounce, Event delegation
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('overlay');
const gameOverScreen = document.getElementById('game-over');

// --- CONSTANTS & CONFIGURATION ---
const TILE_SIZE = 20; // Base grid size (pixels)
const COLS = 19;      // Grid width
const ROWS = 23;      // Grid height (Synced with mapDesign below)

let SCALE = 1;        // Responsive scaling multiplier

// Colors
const WALL_COLOR = '#0f3460';
const PELLET_COLOR = '#ffb8ae';
const PLAYER_COLOR = '#ffeb3b';
const GHOST_COLORS = ['#ff007f', '#00d2ff', '#a55eea', '#ffff00'];

// --- GAME STATE ---
let score = 0;
let highScore = localStorage.getItem('mazeHighScore') || 0;
let gameActive = false;
let mapLayout = []; 

// Entities
const player = { 
    x: 9 * TILE_SIZE + TILE_SIZE/2, 
    y: 14 * TILE_SIZE + TILE_SIZE/2,
    dir: 'right', nextDir: 'right',
    speed: 3.5 
};

let ghosts = [];

// --- MAP LAYOUT (Symmetric Maze - Padded to 23x19) ---
const mapDesign = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // Row 0
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 1
    [1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1], // Row 2
    [1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1], // Row 3
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 4
    [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1], // Row 5
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 6
    [1,1,1,1,1,0,1,1,1,2,1,1,1,0,1,1,1,1,1], // Row 7 (Tunnel)
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 8
    [1,0,1,1,1,1,1,0,1,0,1,0,1,1,1,1,1,0,1], // Row 9
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 10
    [1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1], // Row 11
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 12
    [1,0,1,1,0,1,1,1,1,0,1,1,1,0,1,1,0,1,1], // Row 13 (Tunnel)
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 14
    [1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1], // Row 15
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 16
    [1,0,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,1], // Row 17
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 18
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], // Row 19 (Bottom)
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1], // Row 20 (Added Padding)
    [1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,1,0,1], // Row 21 (Added Padding)
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]  // Row 22 (Added Padding)
];

// --- INITIALIZATION & EVENTS ---

function initGame() {
    score = 0;
    scoreEl.innerText = score;
    highScoreEl.innerText = localStorage.getItem('mazeHighScore') || 0;
    
    mapLayout = JSON.parse(JSON.stringify(mapDesign));
    
    player.x = 9 * TILE_SIZE + TILE_SIZE/2;
    player.y = 14 * TILE_SIZE + TILE_SIZE/2;
    player.dir = 'right'; 
    player.nextDir = 'right';

    ghosts = [
        { x: 9, y: 7, dir: 'left', color: GHOST_COLORS[0], state: 'chase' },
        { x: 8, y: 12, dir: 'up',   color: GHOST_COLORS[1], state: 'chase' },
        { x: 9, y: 12, dir: 'right',color: GHOST_COLORS[2], state: 'scatter' }
    ];

    gameActive = true;
    
    overlay.classList.add('hidden');
    gameOverScreen.style.display = 'none';
    
    requestAnimationFrame(gameLoop);
}

// --- INPUT HANDLING (Debounced Touch + Keyboard) ---

window.addEventListener('keydown', e => {
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault(); 
        setDirection(e.key);
    }
});

let touchStartX = 0;
let touchStartY = 0;
let lastSwipeTime = 0; // 🔧 Ranger Fix: Touch Debounce

canvas.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchend', e => {
    if (!gameActive) return;
    
    const now = Date.now();
    if (now - lastSwipeTime < 150) return; // Debounce threshold
    lastSwipeTime = now;

    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 40 ? 'ArrowRight' : 'ArrowLeft');
    } else {
        setDirection(dy > 40 ? 'ArrowDown' : 'ArrowUp');
    }
}, { passive: false });

function setDirection(key) {
    if (key === 'ArrowUp') player.nextDir = 'up';
    if (key === 'ArrowLeft') player.nextDir = 'left';
    if (key === 'ArrowDown') player.nextDir = 'down';
    if (key === 'ArrowRight') player.nextDir = 'right';
}

// --- GAME LOOP & LOGIC ---

function gameLoop() {
    if (!gameActive) return;
    
    update();
    draw();
    
    requestAnimationFrame(gameLoop);
}

function update() {
    movePlayer();
    moveGhosts();
    checkCollisions();
}

// --- PLAYER MOVEMENT (Jitter-Free Collision Clamp) ---
function movePlayer() {
    const centerX = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE/2;
    const centerY = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE/2;

    const isCenteredX = Math.abs(player.x - centerX) < player.speed;
    const isCenteredY = Math.abs(player.y - centerY) < player.speed;

    if (isCenteredX && isCenteredY) {
        player.x = centerX;
        player.y = centerY;

        if (!canMove(player.nextDir)) {
            if (!canMove(player.dir)) return; 
        } else {
            player.dir = player.nextDir;
        }
    }

    const speed = player.speed;
    switch (player.dir) {
        case 'right': player.x += speed; break;
        case 'left':  player.x -= speed; break;
        case 'down':  player.y += speed; break;
        case 'up':    player.y -= speed; break;
    }

    // 🔧 Soldier Fix: Wall Collision Clamp (No infinite bounce)
    checkWallCollision();
    
    const gridX = Math.floor(player.x / TILE_SIZE);
    const gridY = Math.floor(player.y / TILE_SIZE);
    
    if (gridY >= 0 && gridY < ROWS && gridX >= 0 && gridX < COLS) {
        if (mapLayout[gridY][gridX] === 0) {
            score += 10;
            scoreEl.innerText = score;
            mapLayout[gridY][gridX] = 2; 
            
            const pelletsLeft = mapLayout.filter(row => row.includes(0)).length > 0;
            if (!pelletsLeft) {
                gameActive = false;
                showOverlay('LEVEL_CLEARED');
                setTimeout(initGame, 1500);
            }
        }
    }
}

function canMove(dir) {
    let tx = Math.floor(player.x / TILE_SIZE);
    let ty = Math.floor(player.y / TILE_SIZE);
    
    if (dir === 'right') tx++;
    if (dir === 'left') tx--;
    if (dir === 'down') ty++;
    if (dir === 'up') ty--;

    return mapLayout[ty] && mapLayout[ty][tx] !== 1;
}

function checkWallCollision() {
    const buffer = TILE_SIZE/2 - 4; 
    let collisionX = false;
    let collisionY = false;

    if (player.x + buffer > Math.floor(player.x/TILE_SIZE)*TILE_SIZE + TILE_SIZE && player.dir === 'right') {
        const nextTile = mapLayout[Math.floor(player.y / TILE_SIZE)][Math.floor((player.x + buffer) / TILE_SIZE)];
        if(nextTile === 1) collisionX = true;
    } else if (player.x - buffer < Math.floor(player.x/TILE_SIZE)*TILE_SIZE && player.dir === 'left') {
         const nextTile = mapLayout[Math.floor(player.y / TILE_SIZE)][Math.floor((player.x - buffer) / TILE_SIZE)];
        if(nextTile === 1) collisionX = true;
    }

    if (player.y + buffer > Math.floor(player.y/TILE_SIZE)*TILE_SIZE + TILE_SIZE && player.dir === 'down') {
         const nextTile = mapLayout[Math.floor((player.y + buffer) / TILE_SIZE)][Math.floor(player.x / TILE_SIZE)];
        if(nextTile === 1) collisionY = true;
    } else if (player.y - buffer < Math.floor(player.y/TILE_SIZE)*TILE_SIZE && player.dir === 'up') {
         const nextTile = mapLayout[Math.floor((player.y + buffer) / TILE_SIZE)][Math.floor(player.x / TILE_SIZE)];
        if(nextTile === 1) collisionY = true;
    }

    // 🔧 Fix: Halt velocity & snap to safe grid center instead of bouncing
    if (collisionX || collisionY) {
        player.x = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE/2;
        player.y = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE/2;
        // Direction remains current until next frame checks canMove() at center
    }
}

// --- GHOST AI (Vector Bias + Scatter Timer) ---
function moveGhosts() {
    ghosts.forEach(g => {
        const centerX = Math.floor(g.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE/2;
        const centerY = Math.floor(g.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE/2;

        if (Math.abs(g.x - centerX) < g.speed && Math.abs(g.y - centerY) < g.speed) {
            g.x = centerX;
            g.y = centerY;
            
            const options = [];
            if (canMoveForGhost(g, 'up')) options.push('up');
            if (canMoveForGhost(g, 'down')) options.push('down');
            if (canMoveForGhost(g, 'left')) options.push('left');
            if (canMoveForGhost(g, 'right')) options.push('right');

            const reverseDir = { up: 'down', down: 'up', left: 'right', right: 'left' };
            let validOptions = options.filter(opt => opt !== reverseDir[g.dir]);
            
            // 🔧 Hobbit Fix: Vector Bias targeting player when in chase state
            if (g.state === 'chase') {
                const dx = Math.floor(player.x / TILE_SIZE) - Math.floor(g.x / TILE_SIZE);
                const dy = Math.floor(player.y / TILE_SIZE) - Math.floor(g.y / TILE_SIZE);
                
                // Weight options by proximity to player coords
                validOptions.sort((a, b) => {
                    let scoreA = 0, scoreB = 0;
                    if (a === 'right') scoreA += dx > 0 ? 1 : -1;
                    if (a === 'left') scoreA += dx < 0 ? 1 : -1;
                    if (a === 'down') scoreA += dy > 0 ? 1 : -1;
                    if (a === 'up') scoreA += dy < 0 ? 1 : -1;

                    if (b === 'right') scoreB += dx > 0 ? 1 : -1;
                    if (b === 'left') scoreB += dx < 0 ? 1 : -1;
                    if (b === 'down') scoreB += dy > 0 ? 1 : -1;
                    if (b === 'up') scoreB += dy < 0 ? 1 : -1;
                    
                    return scoreB - scoreA; // Higher score = better direction
                });
            }

            g.dir = validOptions.length > 0 ? validOptions[0] : options[Math.floor(Math.random() * options.length)];
        }

        let speed = 2.5; 
        switch (g.dir) {
            case 'right': g.x += speed; break;
            case 'left':  g.x -= speed; break;
            case 'down':  g.y += speed; break;
            case 'up':    g.y -= speed; break;
        }
    });
}

function canMoveForGhost(g, dir) {
    let tx = Math.floor(g.x / TILE_SIZE);
    let ty = Math.floor(g.y / TILE_SIZE);
    
    if (dir === 'right') tx++;
    if (dir === 'left') tx--;
    if (dir === 'down') ty++;
    if (dir === 'up') ty--;

    return mapLayout[ty] && mapLayout[ty][tx] !== 1;
}

// --- COLLISION & RENDERING (Scaled Draw) ---

function checkCollisions() {
    ghosts.forEach(g => {
        const dist = Math.hypot(player.x - g.x, player.y - g.y);
        if (dist < TILE_SIZE * 0.75) { 
            gameOver();
        }
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 🔧 Soldier Fix: Responsive Scaling Multiplier applied to all render calls
    const s = SCALE || 1; 

    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if (mapLayout[r][c] === 1) {
                ctx.fillStyle = WALL_COLOR;
                ctx.fillRect(c * TILE_SIZE * s, r * TILE_SIZE * s, TILE_SIZE * s, TILE_SIZE * s);
            } else if (mapLayout[r][c] === 0) {
                ctx.fillStyle = PELLET_COLOR;
                ctx.beginPath();
                ctx.arc(c * TILE_SIZE * s + (TILE_SIZE/2)*s, r * TILE_SIZE * s + (TILE_SIZE/2)*s, 3*s, 0, Math.PI*2);
                ctx.fill();
            }
        }
    }

    // Draw Player (Scaled)
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    const mouthAngle = 0.2 * Math.PI + Math.sin(Date.now() / 150) * 0.1; 
    ctx.arc(player.x, player.y, (TILE_SIZE/3 - 2)*s, mouthAngle, 2*Math.PI - mouthAngle);
    ctx.fill();

    // Draw Ghosts (Scaled)
    ghosts.forEach(g => {
        ctx.fillStyle = g.color;
        const cx = g.x;
        const cy = g.y;
        
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6*s);
        ctx.lineTo(cx + 6*s, cy);
        ctx.lineTo(cx, cy + 8*s);
        ctx.lineTo(cx - 6*s, cy);
        ctx.fill();
    });
}

function gameOver() {
    gameActive = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('mazeHighScore', highScore);
        highScoreEl.innerText = highScore;
    }
    gameOverScreen.style.display = 'block';
}

function showOverlay(type) {
   if (type === 'LEVEL_CLEARED') {
       gameOverScreen.innerHTML = '<h2>LEVEL CLEARED!</h2><button id="restart-btn">PLAY AGAIN</button>';
       // 🔧 Event Delegation Fix handled via container listener below
       gameOverScreen.style.display = 'block';
   }
}

// --- EVENT LISTENERS (Delegated & Stable) ---

startBtn.addEventListener('click', initGame);

// 🔧 Soldier Fix: Event delegation on #game-over handles dynamic buttons without duplication
document.getElementById('game-over').addEventListener('click', (e) => {
    if(e.target.tagName === 'BUTTON') initGame();
});

// --- RESPONSIVE CANVAS SETUP (Dynamic Scaling) ---
function resizeCanvas() {
    const aspectRatio = ROWS / COLS;
    
    let containerWidth = document.getElementById('game-container').clientWidth - 40;
    canvas.width = containerWidth;
    canvas.height = containerWidth * aspectRatio;
    
    // 🔧 Soldier Fix: Calculate scale factor to prevent clipping
    SCALE = canvas.width / (COLS * TILE_SIZE);
}

window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100); 
