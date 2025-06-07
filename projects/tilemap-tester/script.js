// =============================================================================
// TILEMAP EDITOR
// =============================================================================

class TilemapEditor {
    constructor() {
        // State variables
        this.selectedTile = null;
        this.tilemapData = null;
        this.tileSize = 64;
        this.gridWidth = 10;
        this.gridHeight = 10;
        this.selectedTileRotation = 0;
        this.previewElement = null;
        this.gridData = {};
        this.leftZoom = 1;
        this.rightZoom = 1;

        // DOM elements
        this.elements = {
            dropZone: document.getElementById('dropZone'),
            tilemapContainer: document.getElementById('tilemapContainer'),
            tilemapImage: document.getElementById('tilemapImage'),
            tileSelection: document.getElementById('tileSelection'),
            grid: document.getElementById('grid'),
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
        this.createGrid();
    }

    // =============================================================================
    // EVENT LISTENERS SETUP
    // =============================================================================

    setupEventListeners() {
        this.setupDragAndDrop();
        this.setupTilemapSelection();
        this.setupGridControls();
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
    // GRID MANAGEMENT
    // =============================================================================

    createGrid() {
        const { grid } = this.elements;
        grid.innerHTML = '';

        for (let row = 0; row < this.gridHeight; row++) {
            const gridRow = this.createGridRow(row);
            grid.appendChild(gridRow);
        }
    }

    createGridRow(row) {
        const gridRow = document.createElement('div');
        gridRow.className = 'grid-row';

        for (let col = 0; col < this.gridWidth; col++) {
            const cell = this.createGridCell(row, col);
            gridRow.appendChild(cell);
        }

        return gridRow;
    }

    createGridCell(row, col) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.style.width = this.tileSize + 'px';
        cell.style.height = this.tileSize + 'px';
        cell.dataset.row = row;
        cell.dataset.col = col;

        this.attachCellEventListeners(cell);
        this.restoreCellData(cell, row, col);

        return cell;
    }

    attachCellEventListeners(cell) {
        cell.addEventListener('click', (e) => this.placeTile(cell, e));
        cell.addEventListener('contextmenu', (e) => this.rotateTile(cell, e));
        cell.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse button
                e.preventDefault();
                this.deleteTile(cell);
            }
        });
        cell.addEventListener('mouseenter', () => this.showTilePreview(cell));
        cell.addEventListener('mouseleave', () => this.hideTilePreview());
    }

    restoreCellData(cell, row, col) {
        const cellKey = `${row}-${col}`;
        if (this.gridData[cellKey]) {
            this.restoreTile(cell, this.gridData[cellKey]);
        }
    }

    updateGrid() {
        this.saveGridData();
        this.updateGridSettings();
        this.createGrid();
    }

    updateGridSettings() {
        const { tileSizeInput, gridWidthInput, gridHeightInput } = this.elements;

        this.tileSize = parseInt(tileSizeInput.value);
        this.gridWidth = parseInt(gridWidthInput.value);
        this.gridHeight = parseInt(gridHeightInput.value);
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
            y: coords.tileY * this.tileSize,
            image: this.tilemapData
        };
        this.selectedTileRotation = 0;
    }

    rotateTileSelection(e) {
        e.preventDefault();
        if (this.selectedTile) {
            this.selectedTileRotation = (this.selectedTileRotation + 90) % 360;
        }
    }

    placeTile(cell, e) {
        if (!this.selectedTile || !this.tilemapData) return;

        this.renderTileToCell(cell, this.selectedTile, this.selectedTileRotation)
            .then(tileDataUrl => {
                this.updateCellAppearance(cell, tileDataUrl);
                this.storeTileData(cell, tileDataUrl);
            });
    }

    rotateTile(cell, e) {
        e.preventDefault();
        if (!cell.tileData) return;

        cell.tileData.rotation = (cell.tileData.rotation + 90) % 360;

        this.renderTileToCell(cell, cell.tileData.originalTile, cell.tileData.rotation)
            .then(tileDataUrl => {
                this.updateCellAppearance(cell, tileDataUrl);
                cell.tileData.dataUrl = tileDataUrl;
                this.updateGridData(cell);
            });
    }

    deleteTile(cell) {
        cell.style.backgroundImage = '';
        cell.style.backgroundColor = '#333';
        delete cell.tileData;

        const cellKey = `${cell.dataset.row}-${cell.dataset.col}`;
        delete this.gridData[cellKey];
    }

    // =============================================================================
    // CANVAS OPERATIONS
    // =============================================================================

    async renderTileToCell(cell, tile, rotation) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = this.tileSize;
            canvas.height = this.tileSize;

            const img = new Image();
            img.onload = () => {
                this.drawRotatedTile(ctx, img, tile, rotation);
                resolve(canvas.toDataURL());
            };
            img.src = tile.image;
        });
    }

    drawRotatedTile(ctx, img, tile, rotation) {
        ctx.clearRect(0, 0, this.tileSize, this.tileSize);
        ctx.save();
        ctx.translate(this.tileSize / 2, this.tileSize / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-this.tileSize / 2, -this.tileSize / 2);
        ctx.drawImage(img, tile.x, tile.y, this.tileSize, this.tileSize, 0, 0, this.tileSize, this.tileSize);
        ctx.restore();
    }

    // =============================================================================
    // PREVIEW FUNCTIONALITY
    // =============================================================================

    showTilePreview(cell) {
        if (!this.selectedTile || !this.tilemapData || cell.tileData || this.previewElement) return;

        this.previewElement = document.createElement('div');
        this.previewElement.className = 'tile-preview';

        this.renderTileToCell(cell, this.selectedTile, this.selectedTileRotation)
            .then(previewDataUrl => {
                if (this.previewElement) {
                    this.previewElement.style.backgroundImage = `url(${previewDataUrl})`;
                    cell.appendChild(this.previewElement);
                }
            });
    }

    hideTilePreview() {
        if (this.previewElement) {
            this.previewElement.remove();
            this.previewElement = null;
        }
    }

    // =============================================================================
    // DATA MANAGEMENT
    // =============================================================================

    updateCellAppearance(cell, tileDataUrl) {
        cell.style.backgroundImage = `url(${tileDataUrl})`;
        cell.style.backgroundSize = 'cover';
    }

    storeTileData(cell, tileDataUrl) {
        cell.tileData = {
            originalTile: { ...this.selectedTile },
            rotation: this.selectedTileRotation,
            dataUrl: tileDataUrl
        };
        this.updateGridData(cell);
    }

    updateGridData(cell) {
        const cellKey = `${cell.dataset.row}-${cell.dataset.col}`;
        this.gridData[cellKey] = cell.tileData;
    }

    saveGridData() {
        const cells = document.querySelectorAll('.grid-cell');
        cells.forEach(cell => {
            if (cell.tileData) {
                this.updateGridData(cell);
            }
        });
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
        dropZone.style.display = 'none';
        tilemapContainer.style.display = 'block';
        this.updateAllTilesWithNewSpritesheet(imageSrc);
    }

    updateAllTilesWithNewSpritesheet(newSpritesheetData) {
        this.tilemapData = newSpritesheetData;
        const cells = document.querySelectorAll('.grid-cell');

        cells.forEach(cell => {
            if (cell.tileData) {
                this.updateCellWithNewSpritesheet(cell, newSpritesheetData);
            }
        });
    }

    updateCellWithNewSpritesheet(cell, newSpritesheetData) {
        const updatedTile = { ...cell.tileData.originalTile, image: newSpritesheetData };

        this.renderTileToCell(cell, updatedTile, cell.tileData.rotation)
            .then(tileDataUrl => {
                this.updateCellAppearance(cell, tileDataUrl);
                cell.tileData.dataUrl = tileDataUrl;
                cell.tileData.originalTile.image = newSpritesheetData;
            });
    }

    saveGrid() {
        this.saveGridData();
        const saveData = this.prepareSaveData();
        this.downloadJSON(saveData, 'tilemap-grid.json');
    }

    prepareSaveData() {
        const simplifiedGridData = {};

        Object.entries(this.gridData).forEach(([key, data]) => {
            if (data) {
                simplifiedGridData[key] = {
                    x: data.originalTile.x,
                    y: data.originalTile.y,
                    rotation: data.rotation
                };
            }
        });

        return {
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            tileSize: this.tileSize,
            tilemapData: this.tilemapData,
            gridData: simplifiedGridData
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
        this.createGrid();
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

    restoreTile(cell, tileData) {
        if (!tileData || !this.tilemapData) return;

        const tile = {
            x: tileData.x,
            y: tileData.y,
            image: this.tilemapData
        };

        this.renderTileToCell(cell, tile, tileData.rotation)
            .then(tileDataUrl => {
                this.updateCellAppearance(cell, tileDataUrl);
                cell.tileData = {
                    originalTile: tile,
                    rotation: tileData.rotation,
                    dataUrl: tileDataUrl
                };
            });
    }

    // =============================================================================
    // UI CONTROLS
    // =============================================================================

    toggleGrid() {
        const showGrid = this.elements.showGridCheckbox.checked;
        const cells = document.querySelectorAll('.grid-cell');

        cells.forEach(cell => {
            cell.classList.toggle('no-grid', !showGrid);
        });
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