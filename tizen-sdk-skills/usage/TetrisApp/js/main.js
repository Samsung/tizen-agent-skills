const GRID_WIDTH = 10;
const GRID_HEIGHT = 20;
const BLOCK_SIZE = 20;

const SHAPES = [
    [[0, 0, 1, 0], [0, 1, 0, 0], [0, 2, 0, 0], [0, 3, 0, 0]], // I
    [[0, 0, 1, 1], [0, 1, 0, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // O
    [[0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]], // S
    [[0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]], // Z
    [[0, 0, 0, 1], [0, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // L
    [[0, 1, 0, 0], [0, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // J
    [[0, 0, 1, 0], [0, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]]  // T
];

const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'];

let canvas, ctx;
let grid = [];
let currentPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let gameRunning = false;
let gamePaused = false;
let dropInterval = 1000;
let dropTimer = null;

function initGame() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    grid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null));
    score = 0;
    lines = 0;
    level = 1;
    updateUI();

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('resetBtn').addEventListener('click', resetGame);

    document.addEventListener('keydown', handleKeyPress);

    document.addEventListener('tizenhwkey', function(e) {
        if (e.keyName === "back") {
            try {
                tizen.application.getCurrentApplication().exit();
            } catch (ignore) {}
        }
    });

    draw();
}

function startGame() {
    if (!gameRunning) {
        gameRunning = true;
        gamePaused = false;
        document.getElementById('startBtn').textContent = 'Stop';
        document.getElementById('pauseBtn').disabled = false;

        if (!currentPiece) {
            spawnPiece();
        }

        dropTimer = setInterval(() => {
            if (!gamePaused && gameRunning) {
                movePieceDown();
            }
        }, dropInterval);
    } else {
        gameRunning = false;
        gamePaused = false;
        document.getElementById('startBtn').textContent = 'Start';
        document.getElementById('pauseBtn').textContent = 'Pause';
        document.getElementById('pauseBtn').disabled = true;
        clearInterval(dropTimer);
    }
}

function togglePause() {
    if (gameRunning) {
        gamePaused = !gamePaused;
        document.getElementById('pauseBtn').textContent = gamePaused ? 'Resume' : 'Pause';
    }
}

function resetGame() {
    gameRunning = false;
    gamePaused = false;
    clearInterval(dropTimer);
    grid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null));
    currentPiece = null;
    score = 0;
    lines = 0;
    level = 1;
    document.getElementById('startBtn').textContent = 'Start';
    document.getElementById('pauseBtn').textContent = 'Pause';
    document.getElementById('pauseBtn').disabled = true;
    updateUI();
    draw();
}

function spawnPiece() {
    const shapeIndex = Math.floor(Math.random() * SHAPES.length);
    currentPiece = {
        shape: SHAPES[shapeIndex],
        x: 3,
        y: 0,
        color: COLORS[shapeIndex]
    };

    if (collides(currentPiece, 0, 0)) {
        gameOver();
    }
}

function collides(piece, dx, dy) {
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            if (piece.shape[row][col] === 1) {
                const newX = piece.x + col + dx;
                const newY = piece.y + row + dy;

                if (newX < 0 || newX >= GRID_WIDTH || newY >= GRID_HEIGHT) {
                    return true;
                }

                if (newY >= 0 && grid[newY][newX] !== null) {
                    return true;
                }
            }
        }
    }
    return false;
}

function handleKeyPress(e) {
    if (!gameRunning || !currentPiece) return;

    switch(e.key) {
        case 'ArrowLeft':
            if (!collides(currentPiece, -1, 0)) {
                currentPiece.x--;
            }
            e.preventDefault();
            break;
        case 'ArrowRight':
            if (!collides(currentPiece, 1, 0)) {
                currentPiece.x++;
            }
            e.preventDefault();
            break;
        case 'ArrowDown':
            movePieceDown();
            e.preventDefault();
            break;
        case 'ArrowUp':
            rotatePiece();
            e.preventDefault();
            break;
    }
    draw();
}

function movePieceDown() {
    if (!collides(currentPiece, 0, 1)) {
        currentPiece.y++;
    } else {
        placePiece();
        clearLines();
        spawnPiece();
    }
    draw();
}

function rotatePiece() {
    const originalShape = currentPiece.shape;
    const rotated = rotateShape(currentPiece.shape);
    currentPiece.shape = rotated;

    if (collides(currentPiece, 0, 0)) {
        currentPiece.shape = originalShape;
    }
}

function rotateShape(shape) {
    const rotated = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            rotated[col][3 - row] = shape[row][col];
        }
    }
    return rotated;
}

function placePiece() {
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            if (currentPiece.shape[row][col] === 1) {
                const gridX = currentPiece.x + col;
                const gridY = currentPiece.y + row;
                if (gridY >= 0 && gridY < GRID_HEIGHT && gridX >= 0 && gridX < GRID_WIDTH) {
                    grid[gridY][gridX] = currentPiece.color;
                }
            }
        }
    }
}

function clearLines() {
    let completedLines = 0;

    for (let row = GRID_HEIGHT - 1; row >= 0; row--) {
        if (grid[row].every(cell => cell !== null)) {
            grid.splice(row, 1);
            grid.unshift(Array(GRID_WIDTH).fill(null));
            completedLines++;
            row++;
        }
    }

    if (completedLines > 0) {
        lines += completedLines;
        score += completedLines * completedLines * 100;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 1000 - (level - 1) * 50);
        updateUI();
    }
}

function updateUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;
    document.getElementById('lines').textContent = lines;
}

function gameOver() {
    gameRunning = false;
    clearInterval(dropTimer);
    alert('Game Over! Score: ' + score);
    resetGame();
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_HEIGHT; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * BLOCK_SIZE);
        ctx.lineTo(GRID_WIDTH * BLOCK_SIZE, i * BLOCK_SIZE);
        ctx.stroke();
    }
    for (let i = 0; i <= GRID_WIDTH; i++) {
        ctx.beginPath();
        ctx.moveTo(i * BLOCK_SIZE, 0);
        ctx.lineTo(i * BLOCK_SIZE, GRID_HEIGHT * BLOCK_SIZE);
        ctx.stroke();
    }

    // Draw placed pieces
    for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
            if (grid[row][col] !== null) {
                ctx.fillStyle = grid[row][col];
                ctx.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.strokeRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }
        }
    }

    // Draw current piece
    if (currentPiece) {
        ctx.fillStyle = currentPiece.color;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                if (currentPiece.shape[row][col] === 1) {
                    const x = (currentPiece.x + col) * BLOCK_SIZE;
                    const y = (currentPiece.y + row) * BLOCK_SIZE;
                    ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }
    }
}

window.onload = initGame;