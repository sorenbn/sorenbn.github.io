// =============================================================================
// TILEMAP EDITOR - OPTIMIZED WITH SINGLE CANVAS
// =============================================================================

class TilemapEditor {
    constructor() {
        // State variables
        this.selectedTile = null;
        this.tilemapData = null;
        this.tilemapImage = new Image();
        this.tileSize = 64;
        this.gridWidth = 10;
        this.gridHeight = 10;
        this.selectedTileRotation = 0;
        this.gridData = {};
        this.leftZoom = 1;
        this.rightZoom = 1;
        this.isMouseDown = false;
        this.lastPaintedCell = null;

        // Canvas elements
        this.canvas = null;
        this.ctx = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;

        // DOM elements
        this.elements = {
            dropZone: document.getElementById('dropZone'),
            tilemapContainer: document.getElementById('tilemapContainer'),
            tilemapImage: document.getElementById('tilemapImage'),
            tileSelection: document.getElementById('tileSelection'),
            gridContainer: document.getElementById('grid'),
            tileSizeInput: document.getElementById('tileSize'),
            gridWidthInput: document.getElementById('gridWidth'),
            gridHeightInput: document.getElementById('gridHeight'),
            showGridCheckbox: document.getElementById('showGrid'),
            loadFileInput: document.getElementById('loadFile')
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createCanvas();
        this.setupTilemapImage();
    }

    // =============================================================================
    // CANVAS SETUP
    // =============================================================================

    createCanvas() {
        const { gridContainer } = this.elements;

        // Clear existing content
        gridContainer.innerHTML = '';

        // Create main canvas
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.className = 'tilemap-canvas';

        // Create overlay canvas for grid lines and previews
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.overlayCanvas.className = 'tilemap-overlay';

        // Set up canvas container
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'canvas-container';
        canvasContainer.style.position = 'relative';
        canvasContainer.style.display = 'inline-block';

        this.updateCanvasSize();

        // Add canvases to container
        canvasContainer.appendChild(this.canvas);
        canvasContainer.appendChild(this.overlayCanvas);
        gridContainer.appendChild(canvasContainer);

        this.setupCanvasEventListeners();
        this.drawGrid();
    }

    updateCanvasSize() {
        const width = this.gridWidth * this.tileSize;
        const height = this.gridHeight * this.tileSize;

        // Update main canvas
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        // Update overlay canvas
        this.overlayCanvas.width = width;
        this.overlayCanvas.height = height;
        this.overlayCanvas.style.width = width + 'px';
        this.overlayCanvas.style.height = height + 'px';
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none';

        // Set canvas background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(0, 0, width, height);
    }

    setupTilemapImage() {
        this.tilemapImage.onload = () => {
            this.redrawCanvas();
        };
    }

    // =============================================================================
    // EVENT LISTENERS SETUP
    // =============================================================================

    setupEventListeners() {
        this.setupDragAndDrop();
        this.setupTilemapSelection();
        this.setupGridControls();
    }

    setupCanvasEventListeners() {
        // Mouse events for tile placement
        this.overlayCanvas.style.pointerEvents = 'auto';

        this.overlayCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.overlayCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.overlayCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.overlayCanvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
        this.overlayCanvas.addEventListener('contextmenu', (e) => this.handleRightClick(e));

        // Keyboard events for rotating preview
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    setupDragAndDrop() {
        const { dropZone, tilemapContainer } = this.elements;

        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const highlight = () => dropZone.classList.add('dragover');
        const unhighlight = () => dropZone.classList.remove('dragover');

        [dropZone, tilemapContainer].forEach(element => {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                element.addEventListener(eventName, preventDefaults, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                element.addEventListener(eventName, highlight, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                element.addEventListener(eventName, unhighlight, false);
            });

            element.addEventListener('drop', (e) => this.handleDrop(e), false);
        });
    }

    setupTilemapSelection() {
        const { tilemapImage } = this.elements;

        tilemapImage.addEventListener('click', (e) => this.selectTile(e));
        tilemapImage.addEventListener('contextmenu', (e) => this.rotateTileSelection(e));
    }

    setupGridControls() {
        // Global functions are attached to window for HTML onclick handlers
        window.updateGrid = () => this.updateGrid();
        window.toggleGrid = () => this.toggleGrid();
        window.saveGrid = () => this.saveGrid();
        window.loadGrid = () => this.loadGrid();
        window.handleLoadFile = (event) => this.handleLoadFile(event);
    }

    // =============================================================================
    // MOUSE HANDLING
    // =============================================================================

    handleMouseDown(e) {
        this.isMouseDown = true;
        this.lastPaintedCell = null;

        if (e.button === 0) { // Left click
            this.handleCanvasClick(e);
        } else if (e.button === 1) { // Middle click
            e.preventDefault();
            this.handleMiddleClick(e);
        }
    }

    handleMouseMove(e) {
        if (this.isMouseDown && e.buttons === 1) { // Left button held down
            this.handleCanvasClick(e);
        } else {
            this.showTilePreview(e);
        }
    }

    handleMouseUp(e) {
        this.isMouseDown = false;
        this.lastPaintedCell = null;
    }

    handleMouseLeave(e) {
        this.isMouseDown = false;
        this.lastPaintedCell = null;
        this.hideTilePreview();
    }

    handleRightClick(e) {
        e.preventDefault();
        const { row, col } = this.getGridPosition(e);

        // If there's a tile at this position, rotate it
        const cellKey = `${row}-${col}`;
        if (this.gridData[cellKey]) {
            this.rotateTileAtPosition(row, col);
        } else if (this.selectedTile) {
            // If no tile exists, rotate the preview
            this.selectedTileRotation = (this.selectedTileRotation + 90) % 360;
            this.showTilePreview(e); // Update preview with new rotation
        }
    }

    handleKeyDown(e) {
        // Rotate preview with R key or Space
        if ((e.key === 'r' || e.key === 'R' || e.key === ' ') && this.selectedTile) {
            e.preventDefault();
            this.selectedTileRotation = (this.selectedTileRotation + 90) % 360;

            // If mouse is over the canvas, update preview
            const canvasRect = this.overlayCanvas.getBoundingClientRect();
            const mouseX = e.clientX || 0;
            const mouseY = e.clientY || 0;

            // Create synthetic mouse event to update preview if mouse is over canvas
            if (mouseX >= canvasRect.left && mouseX <= canvasRect.right &&
                mouseY >= canvasRect.top && mouseY <= canvasRect.bottom) {
                const syntheticEvent = {
                    clientX: mouseX - canvasRect.left + canvasRect.left,
                    clientY: mouseY - canvasRect.top + canvasRect.top
                };
                this.showTilePreview(syntheticEvent);
            }
        }
    }

    handleCanvasClick(e) {
        const { row, col } = this.getGridPosition(e);
        const cellKey = `${row}-${col}`;

        // Avoid painting the same cell multiple times in one drag
        if (this.lastPaintedCell === cellKey) return;
        this.lastPaintedCell = cellKey;

        this.placeTileAtPosition(row, col);
    }

    handleMiddleClick(e) {
        const { row, col } = this.getGridPosition(e);
        this.deleteTileAtPosition(row, col);
    }

    getGridPosition(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const col = Math.floor(x / this.tileSize);
        const row = Math.floor(y / this.tileSize);

        return { row, col };
    }

    // =============================================================================
    // TILE OPERATIONS
    // =============================================================================

    selectTile(e) {
        const { tilemapImage, tileSelection } = this.elements;
        const rect = tilemapImage.getBoundingClientRect();

        const coords = this.calculateTileCoordinates(e, rect, tilemapImage);
        this.updateTileSelection(coords, tileSelection);
        this.setSelectedTile(coords);
    }

    calculateTileCoordinates(e, rect, image) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scaleX = image.naturalWidth / rect.width;
        const scaleY = image.naturalHeight / rect.height;

        const actualX = x * scaleX;
        const actualY = y * scaleY;

        const tileX = Math.floor(actualX / this.tileSize);
        const tileY = Math.floor(actualY / this.tileSize);

        return {
            tileX,
            tileY,
            displayedTileWidth: this.tileSize / scaleX,
            displayedTileHeight: this.tileSize / scaleY
        };
    }

    updateTileSelection(coords, selection) {
        const { tileX, tileY, displayedTileWidth, displayedTileHeight } = coords;

        selection.style.display = 'block';
        selection.style.left = (tileX * displayedTileWidth) + 'px';
        selection.style.top = (tileY * displayedTileHeight) + 'px';
        selection.style.width = displayedTileWidth + 'px';
        selection.style.height = displayedTileHeight + 'px';
    }

    setSelectedTile(coords) {
        this.selectedTile = {
            x: coords.tileX * this.tileSize,
            y: coords.tileY * this.tileSize
        };
        this.selectedTileRotation = 0;
    }

    rotateTileSelection(e) {
        e.preventDefault();
        if (this.selectedTile) {
            this.selectedTileRotation = (this.selectedTileRotation + 90) % 360;

            // Update preview if mouse is currently over the grid
            const canvasRect = this.overlayCanvas.getBoundingClientRect();
            const mouseX = e.clientX;
            const mouseY = e.clientY;

            // Check if mouse is over the canvas area
            if (mouseX >= canvasRect.left && mouseX <= canvasRect.right &&
                mouseY >= canvasRect.top && mouseY <= canvasRect.bottom) {
                const syntheticEvent = {
                    clientX: mouseX,
                    clientY: mouseY
                };
                this.showTilePreview(syntheticEvent);
            }
        }
    }

    placeTileAtPosition(row, col) {
        if (!this.selectedTile || !this.tilemapData || row < 0 || col < 0 ||
            row >= this.gridHeight || col >= this.gridWidth) return;

        const cellKey = `${row}-${col}`;

        // Store tile data
        this.gridData[cellKey] = {
            x: this.selectedTile.x,
            y: this.selectedTile.y,
            rotation: this.selectedTileRotation
        };

        // Draw tile to canvas
        this.drawTileToCanvas(col, row, this.selectedTile.x, this.selectedTile.y, this.selectedTileRotation);
    }

    rotateTileAtPosition(row, col) {
        if (row < 0 || col < 0 || row >= this.gridHeight || col >= this.gridWidth) return;

        const cellKey = `${row}-${col}`;
        const tileData = this.gridData[cellKey];

        if (!tileData) return;

        // Update rotation
        tileData.rotation = (tileData.rotation + 90) % 360;

        // Redraw tile
        this.drawTileToCanvas(col, row, tileData.x, tileData.y, tileData.rotation);
    }

    deleteTileAtPosition(row, col) {
        if (row < 0 || col < 0 || row >= this.gridHeight || col >= this.gridWidth) return;

        const cellKey = `${row}-${col}`;
        delete this.gridData[cellKey];

        // Clear tile area
        this.clearTileArea(col, row);
    }

    // =============================================================================
    // CANVAS DRAWING
    // =============================================================================

    drawTileToCanvas(gridX, gridY, tileX, tileY, rotation) {
        if (!this.tilemapImage.complete) return;

        const x = gridX * this.tileSize;
        const y = gridY * this.tileSize;

        // Clear the area first
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, this.tileSize, this.tileSize);

        // Draw rotated tile
        this.ctx.save();
        this.ctx.translate(x + this.tileSize / 2, y + this.tileSize / 2);
        this.ctx.rotate((rotation * Math.PI) / 180);
        this.ctx.drawImage(
            this.tilemapImage,
            tileX, tileY, this.tileSize, this.tileSize,
            -this.tileSize / 2, -this.tileSize / 2, this.tileSize, this.tileSize
        );
        this.ctx.restore();
    }

    clearTileArea(gridX, gridY) {
        const x = gridX * this.tileSize;
        const y = gridY * this.tileSize;

        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, this.tileSize, this.tileSize);
    }

    redrawCanvas() {
        // Clear canvas
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Redraw all tiles
        Object.entries(this.gridData).forEach(([cellKey, tileData]) => {
            const [row, col] = cellKey.split('-').map(Number);
            this.drawTileToCanvas(col, row, tileData.x, tileData.y, tileData.rotation);
        });
    }

    drawGrid() {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        if (!this.elements.showGridCheckbox.checked) return;

        this.overlayCtx.strokeStyle = '#666';
        this.overlayCtx.lineWidth = 1;
        this.overlayCtx.beginPath();

        // Vertical lines
        for (let i = 0; i <= this.gridWidth; i++) {
            const x = i * this.tileSize + 0.5;
            this.overlayCtx.moveTo(x, 0);
            this.overlayCtx.lineTo(x, this.canvas.height);
        }

        // Horizontal lines
        for (let i = 0; i <= this.gridHeight; i++) {
            const y = i * this.tileSize + 0.5;
            this.overlayCtx.moveTo(0, y);
            this.overlayCtx.lineTo(this.canvas.width, y);
        }

        this.overlayCtx.stroke();
    }

    // =============================================================================
    // PREVIEW FUNCTIONALITY
    // =============================================================================

    showTilePreview(e) {
        if (!this.selectedTile || !this.tilemapImage.complete || this.isMouseDown) return;

        const { row, col } = this.getGridPosition(e);

        // Check if position is valid
        if (row < 0 || col < 0 || row >= this.gridHeight || col >= this.gridWidth) return;

        // Clear previous preview
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.drawGrid();

        // Draw preview (always show, even over existing tiles)
        const x = col * this.tileSize;
        const y = row * this.tileSize;

        this.overlayCtx.save();
        this.overlayCtx.globalAlpha = 0.5;
        this.overlayCtx.translate(x + this.tileSize / 2, y + this.tileSize / 2);
        this.overlayCtx.rotate((this.selectedTileRotation * Math.PI) / 180);
        this.overlayCtx.drawImage(
            this.tilemapImage,
            this.selectedTile.x, this.selectedTile.y, this.tileSize, this.tileSize,
            -this.tileSize / 2, -this.tileSize / 2, this.tileSize, this.tileSize
        );
        this.overlayCtx.restore();
    }

    hideTilePreview() {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.drawGrid();
    }

    // =============================================================================
    // GRID MANAGEMENT
    // =============================================================================

    updateGrid() {
        this.updateGridSettings();
        this.createCanvas();
        this.redrawCanvas();
    }

    updateGridSettings() {
        const { tileSizeInput, gridWidthInput, gridHeightInput } = this.elements;

        this.tileSize = parseInt(tileSizeInput.value);
        this.gridWidth = parseInt(gridWidthInput.value);
        this.gridHeight = parseInt(gridHeightInput.value);
    }

    toggleGrid() {
        this.drawGrid();
    }

    // =============================================================================
    // FILE OPERATIONS
    // =============================================================================

    handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            this.loadImageFile(files[0]);
        }
    }

    loadImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.setTilemapImage(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    setTilemapImage(imageSrc) {
        const { tilemapImage, dropZone, tilemapContainer } = this.elements;

        tilemapImage.src = imageSrc;
        this.tilemapData = imageSrc;
        this.tilemapImage.src = imageSrc;

        dropZone.style.display = 'none';
        tilemapContainer.style.display = 'block';

        // Redraw canvas when new image loads
        this.tilemapImage.onload = () => {
            this.redrawCanvas();
        };
    }

    saveGrid() {
        const saveData = this.prepareSaveData();
        this.downloadJSON(saveData, 'tilemap-grid.json');
    }

    prepareSaveData() {
        return {
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            tileSize: this.tileSize,
            tilemapData: this.tilemapData,
            gridData: this.gridData
        };
    }

    downloadJSON(data, filename) {
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');

        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
    }

    loadGrid() {
        this.elements.loadFileInput.click();
    }

    handleLoadFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadData = JSON.parse(e.target.result);
                this.restoreFromSaveData(loadData);
            } catch (error) {
                alert('Error loading file: Invalid JSON format');
            }
        };
        reader.readAsText(file);
    }

    restoreFromSaveData(loadData) {
        // Restore settings
        this.gridWidth = loadData.gridWidth || 10;
        this.gridHeight = loadData.gridHeight || 10;
        this.tileSize = loadData.tileSize || 64;
        this.tilemapData = loadData.tilemapData;
        this.gridData = loadData.gridData || {};

        this.updateUI();
        this.restoreTilemap();
        this.createCanvas();

        // Load tilemap image and redraw
        if (this.tilemapData) {
            this.tilemapImage.src = this.tilemapData;
            this.tilemapImage.onload = () => {
                this.redrawCanvas();
            };
        }
    }

    updateUI() {
        const { gridWidthInput, gridHeightInput, tileSizeInput } = this.elements;

        gridWidthInput.value = this.gridWidth;
        gridHeightInput.value = this.gridHeight;
        tileSizeInput.value = this.tileSize;
    }

    restoreTilemap() {
        const { tilemapImage, dropZone, tilemapContainer } = this.elements;

        if (this.tilemapData) {
            tilemapImage.src = this.tilemapData;
            dropZone.style.display = 'none';
            tilemapContainer.style.display = 'block';
        } else {
            dropZone.style.display = 'flex';
            tilemapContainer.style.display = 'none';
        }
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize the tilemap editor when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TilemapEditor();
});

// Fallback initialization if script loads after DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new TilemapEditor();
    });
} else {
    new TilemapEditor();
}