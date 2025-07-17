// Interactive Table Layout Editor
class TableLayoutEditor {
    constructor() {
        this.canvas = document.getElementById('tableCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvasContainer');
        
        // App state
        this.tables = [];
        this.zones = [];
        this.selectedItem = null;
        this.dragItem = null;
        this.dragOffset = { x: 0, y: 0 };
        this.isEditMode = true;
        this.currentTool = null;
        this.nextId = 1;
        this.resizeHandle = null;
        this.initialMousePos = null;
        
        // Canvas properties
        this.canvasRect = null;
        this.scale = 1;
        this.minScale = 0.5;
        this.maxScale = 2;
        this.offset = { x: 0, y: 0 };
        
        // Initialize
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupCanvas();
            this.setupEventListeners();
            this.render();
            this.updateStats();
        } catch (error) {
            console.error('Uygulama başlatılamadı:', error);
            this.showToast('Veriler yüklenirken hata oluştu', 'error');
        }
    }

    async loadData() {
        try {
            // Always load from JSON file first to get the default layout
            const response = await fetch('restaurant_layout.json');
            if (response.ok) {
                const jsonData = await response.json();
                
                // Check if we have localStorage data
                const savedData = localStorage.getItem('restaurantLayoutEditor');
                let useJsonData = true;
                
                if (savedData) {
                    const localData = JSON.parse(savedData);
                    // Only use localStorage if it has MORE items than JSON (user added items)
                    // Or if user has moved items significantly from default positions
                    if (localData.tables && localData.tables.length > jsonData.tables.length) {
                        useJsonData = false;
                        this.tables = localData.tables || [];
                        this.zones = localData.zones || [];
                    }
                }
                
                if (useJsonData) {
                    // Use JSON data (your preferred layout)
                    this.tables = jsonData.tables.map(table => ({
                        ...table,
                        color: table.color || this.getStatusColor(table.status),
                        type: 'table'
                    }));
                    this.zones = jsonData.zones.map(zone => ({
                        ...zone,
                        color: zone.color || '#e0e6ed',
                        type: 'zone'
                    }));
                    
                    // Save this as the new localStorage data
                    this.saveData();
                }
                
                this.nextId = Math.max(...this.tables.map(t => t.id), ...this.zones.map(z => z.id), 0) + 1;
            }
        } catch (error) {
            console.error('Veri yükleme hatası:', error);
        }
    }

    saveData() {
        try {
            const data = {
                tables: this.tables,
                zones: this.zones
            };
            localStorage.setItem('restaurantLayoutEditor', JSON.stringify(data));
        } catch (error) {
            console.error('Veri kaydetme hatası:', error);
        }
    }

    setupCanvas() {
        // Set canvas size to be larger than viewport for scrolling
        this.canvas.width = 3000;
        this.canvas.height = 2000;
        
        // Update canvas display size
        this.updateCanvasDisplay();
        
        window.addEventListener('resize', () => this.updateCanvasDisplay());
    }

    updateCanvasDisplay() {
        // Update canvas style to reflect zoom
        this.canvas.style.width = (this.canvas.width * this.scale) + 'px';
        this.canvas.style.height = (this.canvas.height * this.scale) + 'px';
        
        this.canvasRect = this.canvas.getBoundingClientRect();
        this.canvasWidth = this.canvas.width;
        this.canvasHeight = this.canvas.height;
        
        this.render();
    }

    setupEventListeners() {
        // Mode toggle
        document.getElementById('editMode').addEventListener('click', () => this.setMode(true));
        document.getElementById('viewMode').addEventListener('click', () => this.setMode(false));

        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleToolClick(e));
        });

        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));

        // Color presets
        document.querySelectorAll('.color-preset').forEach(preset => {
            preset.addEventListener('click', (e) => {
                document.getElementById('itemColor').value = e.target.dataset.color;
            });
        });

        // Context menu
        document.addEventListener('click', (e) => this.hideContextMenu());
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleContextMenuAction(e));
        });

        // Color modal
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => this.selectColor(e.target.dataset.color));
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    setMode(editMode) {
        this.isEditMode = editMode;
        const toolbar = document.getElementById('toolbar');
        
        if (editMode) {
            document.getElementById('editMode').classList.add('active');
            document.getElementById('viewMode').classList.remove('active');
            toolbar.style.display = 'flex';
            this.canvas.style.cursor = 'crosshair';
        } else {
            document.getElementById('viewMode').classList.add('active');
            document.getElementById('editMode').classList.remove('active');
            toolbar.style.display = 'none';
            this.canvas.style.cursor = 'default';
        }
    }

    handleToolClick(e) {
        const btn = e.currentTarget;
        const action = btn.dataset.action;
        const shape = btn.dataset.shape;

        // Remove active from all tool buttons
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

        if (action === 'add-table') {
            this.currentTool = { type: 'add-table', shape };
            btn.classList.add('active');
            this.canvas.style.cursor = 'crosshair';
        } else if (action === 'add-zone') {
            this.currentTool = { type: 'add-zone' };
            btn.classList.add('active');
            this.canvas.style.cursor = 'crosshair';
        } else if (action === 'delete') {
            this.currentTool = { type: 'delete' };
            btn.classList.add('active');
            this.canvas.style.cursor = 'not-allowed';
        } else if (action === 'export-jpg') {
            this.exportAsJPG();
        } else if (action === 'save-json') {
            this.saveAsJSON();
        } else if (action === 'load') {
            this.importData();
        } else if (action === 'arrange') {
            this.autoArrangeTables();
        } else if (action === 'reset-layout') {
            this.resetToDefaultLayout();
        } else if (action === 'zoom-in') {
            this.zoomIn();
        } else if (action === 'zoom-out') {
            this.zoomOut();
        } else if (action === 'zoom-reset') {
            this.zoomReset();
        }
    }

    zoomIn() {
        this.scale = Math.min(this.scale * 1.2, this.maxScale);
        this.updateCanvasDisplay();
        this.updateZoomIndicator();
        this.showToast(`Yakınlaştırma: ${Math.round(this.scale * 100)}%`);
    }

    zoomOut() {
        this.scale = Math.max(this.scale / 1.2, this.minScale);
        this.updateCanvasDisplay();
        this.updateZoomIndicator();
        this.showToast(`Yakınlaştırma: ${Math.round(this.scale * 100)}%`);
    }

    zoomReset() {
        this.scale = 1;
        this.updateCanvasDisplay();
        this.updateZoomIndicator();
        this.showToast('Yakınlaştırma sıfırlandı');
    }

    updateZoomIndicator() {
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
        }
    }

    getMousePos(e) {
        this.canvasRect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - this.canvasRect.left) / this.scale,
            y: (e.clientY - this.canvasRect.top) / this.scale
        };
    }

    handleMouseDown(e) {
        if (!this.isEditMode) return;

        const pos = this.getMousePos(e);
        const item = this.getItemAt(pos.x, pos.y);

        if (this.currentTool) {
            this.handleToolAction(pos);
        } else if (item) {
            this.selectedItem = item;
            
            // Check if clicking on a resize handle for zones
            if (item.type === 'zone') {
                const resizeHandle = this.getZoneResizeHandle(item, pos.x, pos.y);
                if (resizeHandle) {
                    this.resizeHandle = resizeHandle;
                    this.initialMousePos = pos;
                    this.canvas.style.cursor = resizeHandle.cursor;
                    this.render();
                    return;
                }
            }
            
            this.dragItem = item;
            this.dragOffset = {
                x: pos.x - item.x,
                y: pos.y - item.y
            };
            this.canvas.style.cursor = 'grabbing';
        } else {
            this.selectedItem = null;
        }

        this.render();
    }

    handleMouseMove(e) {
        if (!this.isEditMode) return;

        const pos = this.getMousePos(e);

        if (this.resizeHandle && this.selectedItem) {
            // Handle zone resizing
            this.resizeZone(this.selectedItem, this.resizeHandle, pos);
            this.render();
        } else if (this.dragItem) {
            this.dragItem.x = pos.x - this.dragOffset.x;
            this.dragItem.y = pos.y - this.dragOffset.y;
            this.render();
        } else {
            // Update cursor based on what's under the mouse
            const item = this.getItemAt(pos.x, pos.y);
            if (item && !this.currentTool) {
                if (item.type === 'zone' && this.selectedItem === item) {
                    const resizeHandle = this.getZoneResizeHandle(item, pos.x, pos.y);
                    if (resizeHandle) {
                        this.canvas.style.cursor = resizeHandle.cursor;
                    } else {
                        this.canvas.style.cursor = 'grab';
                    }
                } else {
                    this.canvas.style.cursor = 'grab';
                }
            } else if (this.currentTool && this.currentTool.type === 'delete') {
                this.canvas.style.cursor = 'not-allowed';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        }
    }

    handleMouseUp(e) {
        if (this.dragItem) {
            this.dragItem = null;
            this.canvas.style.cursor = 'crosshair';
            this.saveData();
        } else if (this.resizeHandle) {
            this.resizeHandle = null;
            this.initialMousePos = null;
            this.canvas.style.cursor = 'crosshair';
            this.saveData();
        }
    }

    handleToolAction(pos) {
        if (this.currentTool.type === 'add-table') {
            this.addTable(pos.x, pos.y, this.currentTool.shape);
        } else if (this.currentTool.type === 'add-zone') {
            this.addZone(pos.x, pos.y);
        } else if (this.currentTool.type === 'delete') {
            const item = this.getItemAt(pos.x, pos.y);
            if (item) {
                this.deleteItem(item);
            }
        }
    }

    addTable(x, y, shape) {
        const table = {
            id: this.nextId++,
            name: `${this.getShapeText(shape)} ${this.tables.filter(t => t.shape === shape).length + 1}`,
            x: x,
            y: y,
            shape: shape,
            status: 'Empty',
            capacity: shape === 'round' ? 5 : shape === 'square' ? 2 : 4,
            color: '#4CAF50',
            type: 'table'
        };

        this.tables.push(table);
        this.selectedItem = table;
        
        // Deactivate tool after adding table
        this.currentTool = null;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        this.canvas.style.cursor = 'default';
        
        this.saveData();
        this.render();
        this.updateStats();
        this.showToast('Yeni masa eklendi');
    }

    addZone(x, y) {
        const zone = {
            id: this.nextId++,
            name: `Bölge ${this.zones.length + 1}`,
            x: x,
            y: y,
            width: 300,
            height: 200,
            color: '#e0e6ed',
            type: 'zone'
        };

        this.zones.push(zone);
        this.selectedItem = zone;
        
        // Deactivate tool after adding zone
        this.currentTool = null;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        this.canvas.style.cursor = 'default';
        
        this.saveData();
        this.render();
        this.updateStats();
        this.showToast('Yeni bölge eklendi');
    }

    deleteItem(item) {
        if (item.type === 'table') {
            this.tables = this.tables.filter(t => t.id !== item.id);
            this.showToast('Masa silindi');
        } else if (item.type === 'zone') {
            this.zones = this.zones.filter(z => z.id !== item.id);
            this.showToast('Bölge silindi');
        }

        this.selectedItem = null;
        this.saveData();
        this.render();
        this.updateStats();
    }

    getItemAt(x, y) {
        // Check tables first (they're on top)
        for (let table of this.tables) {
            if (this.isPointInTable(x, y, table)) {
                return table;
            }
        }

        // Then check zones
        for (let zone of this.zones) {
            if (this.isPointInZone(x, y, zone)) {
                return zone;
            }
        }

        return null;
    }

    isPointInTable(x, y, table) {
        const size = this.getTableSize(table.shape);
        const dx = x - table.x;
        const dy = y - table.y;

        if (table.shape === 'round') {
            return dx * dx + dy * dy <= (size / 2) * (size / 2);
        } else {
            return dx >= -size/2 && dx <= size/2 && dy >= -size/2 && dy <= size/2;
        }
    }

    isPointInZone(x, y, zone) {
        return x >= zone.x && x <= zone.x + zone.width &&
               y >= zone.y && y <= zone.y + zone.height;
    }

    handleContextMenu(e) {
        e.preventDefault();
        if (!this.isEditMode) return;

        const pos = this.getMousePos(e);
        const item = this.getItemAt(pos.x, pos.y);

        if (item) {
            this.selectedItem = item;
            this.showContextMenu(e.clientX, e.clientY);
            this.render();
        }
    }

    showContextMenu(x, y) {
        const menu = document.getElementById('contextMenu');
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
    }

    hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
    }

    handleContextMenuAction(e) {
        const action = e.currentTarget.dataset.action;
        
        if (!this.selectedItem) return;

        switch (action) {
            case 'edit':
                this.openPropertiesModal();
                break;
            case 'copy':
                this.copyItem();
                break;
            case 'delete':
                this.deleteItem(this.selectedItem);
                break;
            case 'color':
                this.openColorModal();
                break;
        }

        this.hideContextMenu();
    }

    handleDoubleClick(e) {
        if (!this.isEditMode) return;

        const pos = this.getMousePos(e);
        const item = this.getItemAt(pos.x, pos.y);

        if (item) {
            this.selectedItem = item;
            this.openPropertiesModal();
        }
    }

    handleWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * delta));
        
        if (newScale !== this.scale) {
            this.scale = newScale;
            this.updateCanvasDisplay();
            this.updateZoomIndicator();
        }
    }

    openPropertiesModal() {
        if (!this.selectedItem) return;

        const modal = document.getElementById('propertiesModal');
        const title = document.getElementById('modalTitle');
        
        if (this.selectedItem.type === 'table') {
            title.textContent = 'Masa Özellikleri';
            document.getElementById('statusGroup').style.display = 'block';
            document.getElementById('itemStatus').value = this.selectedItem.status;
        } else {
            title.textContent = 'Bölge Özellikleri';
            document.getElementById('statusGroup').style.display = 'none';
        }

        document.getElementById('itemName').value = this.selectedItem.name;
        document.getElementById('itemCapacity').value = this.selectedItem.capacity || 0;
        document.getElementById('itemColor').value = this.selectedItem.color;

        modal.style.display = 'block';
    }

    openColorModal() {
        document.getElementById('colorModal').style.display = 'block';
    }

    selectColor(color) {
        if (this.selectedItem) {
            this.selectedItem.color = color;
            this.saveData();
            this.render();
            this.showToast('Renk değiştirildi');
        }
        this.closeColorModal();
    }

    copyItem() {
        if (!this.selectedItem) return;

        const copy = {
            ...this.selectedItem,
            id: this.nextId++,
            name: this.selectedItem.name + ' (Kopya)',
            x: this.selectedItem.x + 50,
            y: this.selectedItem.y + 50
        };

        if (this.selectedItem.type === 'table') {
            this.tables.push(copy);
        } else {
            this.zones.push(copy);
        }

        this.selectedItem = copy;
        this.saveData();
        this.render();
        this.updateStats();
        this.showToast('Öğe kopyalandı');
    }

    handleKeyboard(e) {
        // Handle zoom shortcuts first (they work regardless of selection)
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '+':
                case '=':
                    e.preventDefault();
                    this.zoomIn();
                    return;
                case '-':
                    e.preventDefault();
                    this.zoomOut();
                    return;
                case '0':
                    e.preventDefault();
                    this.zoomReset();
                    return;
            }
        }
        
        if (!this.isEditMode) return;

        const step = e.shiftKey ? 10 : 1;

        // Handle selection-specific shortcuts
        if (this.selectedItem) {
            switch (e.key) {
                case 'Delete':
                case 'Backspace':
                    this.deleteItem(this.selectedItem);
                    break;
                case 'ArrowLeft':
                    this.selectedItem.x -= step;
                    e.preventDefault();
                    this.saveData();
                    this.render();
                    break;
                case 'ArrowRight':
                    this.selectedItem.x += step;
                    e.preventDefault();
                    this.saveData();
                    this.render();
                    break;
                case 'ArrowUp':
                    this.selectedItem.y -= step;
                    e.preventDefault();
                    this.saveData();
                    this.render();
                    break;
                case 'ArrowDown':
                    this.selectedItem.y += step;
                    e.preventDefault();
                    this.saveData();
                    this.render();
                    break;
                case 'c':
                    if (e.ctrlKey || e.metaKey) {
                        this.copyItem();
                    }
                    break;
            }
        }
        
        // Handle global shortcuts
        if (e.key === 'Escape') {
            this.selectedItem = null;
            this.currentTool = null;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            this.render();
        }
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Draw grid
        this.drawGrid();

        // Draw zones first (background)
        this.zones.forEach(zone => this.drawZone(zone));

        // Draw tables
        this.tables.forEach(table => this.drawTable(table));

        // Highlight selected item
        if (this.selectedItem) {
            this.highlightItem(this.selectedItem);
        }
    }

    drawGrid() {
        const gridSize = 20;
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 1;

        for (let x = 0; x < this.canvasWidth; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvasHeight);
            this.ctx.stroke();
        }

        for (let y = 0; y < this.canvasHeight; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvasWidth, y);
            this.ctx.stroke();
        }
    }

    drawZone(zone) {
        this.ctx.fillStyle = zone.color + '40'; // Semi-transparent
        this.ctx.strokeStyle = zone.color;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        this.ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        this.ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);

        // Zone label
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(zone.name, zone.x + zone.width / 2, zone.y + 25);

        this.ctx.setLineDash([]);

        // Draw resize handles if selected
        if (this.selectedItem === zone) {
            this.drawZoneResizeHandles(zone);
        }
    }

    drawZoneResizeHandles(zone) {
        const handleSize = 8;
        this.ctx.fillStyle = '#007bff';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([]);

        const handles = this.getZoneResizeHandles(zone);
        handles.forEach(handle => {
            this.ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
            this.ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
        });
    }

    getZoneResizeHandles(zone) {
        const handleSize = 8;
        return [
            // Top-left
            { x: zone.x - handleSize/2, y: zone.y - handleSize/2, type: 'nw', cursor: 'nw-resize' },
            // Top-right
            { x: zone.x + zone.width - handleSize/2, y: zone.y - handleSize/2, type: 'ne', cursor: 'ne-resize' },
            // Bottom-left
            { x: zone.x - handleSize/2, y: zone.y + zone.height - handleSize/2, type: 'sw', cursor: 'sw-resize' },
            // Bottom-right
            { x: zone.x + zone.width - handleSize/2, y: zone.y + zone.height - handleSize/2, type: 'se', cursor: 'se-resize' },
            // Top edge
            { x: zone.x + zone.width/2 - handleSize/2, y: zone.y - handleSize/2, type: 'n', cursor: 'n-resize' },
            // Bottom edge
            { x: zone.x + zone.width/2 - handleSize/2, y: zone.y + zone.height - handleSize/2, type: 's', cursor: 's-resize' },
            // Left edge
            { x: zone.x - handleSize/2, y: zone.y + zone.height/2 - handleSize/2, type: 'w', cursor: 'w-resize' },
            // Right edge
            { x: zone.x + zone.width - handleSize/2, y: zone.y + zone.height/2 - handleSize/2, type: 'e', cursor: 'e-resize' }
        ];
    }

    getZoneResizeHandle(zone, x, y) {
        if (this.selectedItem !== zone) return null;
        
        const handleSize = 8;
        const handles = this.getZoneResizeHandles(zone);
        
        for (let handle of handles) {
            if (x >= handle.x && x <= handle.x + handleSize &&
                y >= handle.y && y <= handle.y + handleSize) {
                return handle;
            }
        }
        return null;
    }

    resizeZone(zone, handle, currentPos) {
        const deltaX = currentPos.x - this.initialMousePos.x;
        const deltaY = currentPos.y - this.initialMousePos.y;
        const minSize = 100; // Minimum zone size

        // Store original values to restore if resize would make zone too small
        const originalX = zone.x;
        const originalY = zone.y;
        const originalWidth = zone.width;
        const originalHeight = zone.height;

        switch (handle.type) {
            case 'nw': // Top-left
                const newWidth1 = originalWidth - deltaX;
                const newHeight1 = originalHeight - deltaY;
                if (newWidth1 >= minSize && newHeight1 >= minSize) {
                    zone.x = originalX + deltaX;
                    zone.y = originalY + deltaY;
                    zone.width = newWidth1;
                    zone.height = newHeight1;
                }
                break;
            case 'ne': // Top-right
                const newWidth2 = originalWidth + deltaX;
                const newHeight2 = originalHeight - deltaY;
                if (newWidth2 >= minSize && newHeight2 >= minSize) {
                    zone.y = originalY + deltaY;
                    zone.width = newWidth2;
                    zone.height = newHeight2;
                }
                break;
            case 'sw': // Bottom-left
                const newWidth3 = originalWidth - deltaX;
                const newHeight3 = originalHeight + deltaY;
                if (newWidth3 >= minSize && newHeight3 >= minSize) {
                    zone.x = originalX + deltaX;
                    zone.width = newWidth3;
                    zone.height = newHeight3;
                }
                break;
            case 'se': // Bottom-right
                const newWidth4 = originalWidth + deltaX;
                const newHeight4 = originalHeight + deltaY;
                if (newWidth4 >= minSize && newHeight4 >= minSize) {
                    zone.width = newWidth4;
                    zone.height = newHeight4;
                }
                break;
            case 'n': // Top edge
                const newHeight5 = originalHeight - deltaY;
                if (newHeight5 >= minSize) {
                    zone.y = originalY + deltaY;
                    zone.height = newHeight5;
                }
                break;
            case 's': // Bottom edge
                const newHeight6 = originalHeight + deltaY;
                if (newHeight6 >= minSize) {
                    zone.height = newHeight6;
                }
                break;
            case 'w': // Left edge
                const newWidth7 = originalWidth - deltaX;
                if (newWidth7 >= minSize) {
                    zone.x = originalX + deltaX;
                    zone.width = newWidth7;
                }
                break;
            case 'e': // Right edge
                const newWidth8 = originalWidth + deltaX;
                if (newWidth8 >= minSize) {
                    zone.width = newWidth8;
                }
                break;
        }
    }

    drawTable(table) {
        const size = this.getTableSize(table.shape);

        // Table shape
        this.ctx.fillStyle = table.color;
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;

        if (table.shape === 'round') {
            this.ctx.beginPath();
            this.ctx.arc(table.x, table.y, size / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        } else {
            const x = table.x - size / 2;
            const y = table.y - size / 2;
            
            if (table.shape === 'square') {
                this.ctx.fillRect(x, y, size, size);
                this.ctx.strokeRect(x, y, size, size);
            } else { // rectangle
                this.ctx.fillRect(x, y, size * 1.4, size * 0.8);
                this.ctx.strokeRect(x, y, size * 1.4, size * 0.8);
            }
        }

        // Table text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(table.name, table.x, table.y - 5);
        
        this.ctx.font = '12px Arial';
        this.ctx.fillText(`${table.capacity} kişi`, table.x, table.y + 10);
        
        // Status indicator
        const statusColor = this.getStatusColor(table.status);
        this.ctx.fillStyle = statusColor;
        this.ctx.beginPath();
        this.ctx.arc(table.x + size / 3, table.y - size / 3, 8, 0, Math.PI * 2);
        this.ctx.fill();
    }

    highlightItem(item) {
        this.ctx.strokeStyle = '#ff4444';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);

        if (item.type === 'table') {
            const size = this.getTableSize(item.shape);
            
            if (item.shape === 'round') {
                this.ctx.beginPath();
                this.ctx.arc(item.x, item.y, size / 2 + 8, 0, Math.PI * 2);
                this.ctx.stroke();
            } else {
                const x = item.x - size / 2 - 8;
                const y = item.y - size / 2 - 8;
                const w = item.shape === 'rectangle' ? size * 1.4 + 16 : size + 16;
                const h = item.shape === 'rectangle' ? size * 0.8 + 16 : size + 16;
                this.ctx.strokeRect(x, y, w, h);
            }
        } else {
            this.ctx.strokeRect(item.x - 5, item.y - 5, item.width + 10, item.height + 10);
        }

        this.ctx.setLineDash([]);
    }

    getTableSize(shape) {
        return shape === 'round' ? 80 : shape === 'square' ? 70 : 75;
    }

    getStatusColor(status) {
        const colors = {
            'Empty': '#4CAF50',
            'Occupied': '#F44336',
            'Reserved': '#2196F3',
            'Cleaning': '#FF9800'
        };
        return colors[status] || '#4CAF50';
    }

    getShapeText(shape) {
        const shapes = {
            'round': 'Yuvarlak',
            'rectangle': 'Dikdörtgen',
            'square': 'Kare'
        };
        return shapes[shape] || shape;
    }

    updateStats() {
        document.getElementById('totalTables').textContent = this.tables.length;
        document.getElementById('totalCapacity').textContent = 
            this.tables.reduce((sum, table) => sum + (table.capacity || 0), 0);
        document.getElementById('totalZones').textContent = this.zones.length;
        
        // Update zoom indicator
        this.updateZoomIndicator();

        // Update selected item info
        const selectedInfoPanel = document.getElementById('selectedInfo');
        
        if (this.selectedItem) {
            selectedInfoPanel.style.display = 'block';
            
            document.getElementById('selectedName').textContent = this.selectedItem.name;
            document.getElementById('selectedType').textContent = 
                this.selectedItem.type === 'table' ? 'Masa' : 'Bölge';
            
            if (this.selectedItem.type === 'table') {
                document.getElementById('capacityRow').style.display = 'flex';
                document.getElementById('statusRow').style.display = 'flex';
                document.getElementById('selectedCapacity').textContent = 
                    this.selectedItem.capacity + ' kişi';
                document.getElementById('selectedStatus').textContent = 
                    this.getStatusText(this.selectedItem.status);
            } else {
                document.getElementById('capacityRow').style.display = 'none';
                document.getElementById('statusRow').style.display = 'none';
            }
        } else {
            selectedInfoPanel.style.display = 'none';
        }
    }

    getStatusText(status) {
        const statusMap = {
            'Empty': 'Boş',
            'Occupied': 'Dolu',
            'Reserved': 'Rezerve',
            'Cleaning': 'Temizlik'
        };
        return statusMap[status] || status;
    }

    exportAsJPG() {
        // Create a temporary canvas for export
        const exportCanvas = document.createElement('canvas');
        const exportCtx = exportCanvas.getContext('2d');
        
        // Set canvas size to fit all content with some padding
        const padding = 50;
        const bounds = this.getContentBounds();
        exportCanvas.width = bounds.width + padding * 2;
        exportCanvas.height = bounds.height + padding * 2;
        
        // Fill with white background
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        // Translate to center content with padding
        exportCtx.translate(padding - bounds.minX, padding - bounds.minY);
        
        // Draw zones first
        this.zones.forEach(zone => {
            this.drawZoneOnCanvas(exportCtx, zone, false); // Don't show resize handles
        });
        
        // Draw tables
        this.tables.forEach(table => {
            this.drawTableOnCanvas(exportCtx, table, false); // Don't show selection
        });
        
        // Convert to JPG and download
        exportCanvas.toBlob((blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `restaurant_layout_${new Date().toISOString().split('T')[0]}.jpg`;
            link.click();
            
            this.showToast('Layout JPG olarak dışa aktarıldı');
        }, 'image/jpeg', 0.95);
    }

    getContentBounds() {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        // Check tables bounds
        this.tables.forEach(table => {
            const size = this.getTableSize(table.shape);
            minX = Math.min(minX, table.x - size/2);
            minY = Math.min(minY, table.y - size/2);
            maxX = Math.max(maxX, table.x + size/2);
            maxY = Math.max(maxY, table.y + size/2);
        });
        
        // Check zones bounds
        this.zones.forEach(zone => {
            minX = Math.min(minX, zone.x);
            minY = Math.min(minY, zone.y);
            maxX = Math.max(maxX, zone.x + zone.width);
            maxY = Math.max(maxY, zone.y + zone.height);
        });
        
        // Default bounds if no content
        if (minX === Infinity) {
            minX = minY = 0;
            maxX = maxY = 800;
        }
        
        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    drawZoneOnCanvas(ctx, zone, showSelection = false) {
        ctx.fillStyle = zone.color + '40'; // Semi-transparent
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);

        // Zone label
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(zone.name, zone.x + zone.width / 2, zone.y + 25);

        ctx.setLineDash([]);
    }

    drawTableOnCanvas(ctx, table, showSelection = false) {
        const size = this.getTableSize(table.shape);

        // Table shape - ensure color is set
        const tableColor = table.color || this.getStatusColor(table.status) || '#4CAF50';
        ctx.fillStyle = tableColor;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;

        if (table.shape === 'round') {
            ctx.beginPath();
            ctx.arc(table.x, table.y, size / 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(table.x - size/2, table.y - size/2, size, size);
            ctx.strokeRect(table.x - size/2, table.y - size/2, size, size);
        }

                // Table text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add text shadow for better visibility
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        
        ctx.fillText(table.name, table.x, table.y - 8);
        ctx.fillText(`${table.capacity} kişi`, table.x, table.y + 8);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    saveAsJSON() {
        const data = {
            tables: this.tables,
            zones: this.zones
        };

        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `restaurant_layout_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        this.showToast('Layout JSON olarak kaydedildi');
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        this.tables = data.tables || [];
                        this.zones = data.zones || [];
                        this.selectedItem = null;
                        this.nextId = Math.max(...this.tables.map(t => t.id), ...this.zones.map(z => z.id), 0) + 1;
                        
                        this.saveData();
                        this.render();
                        this.updateStats();
                        this.showToast('Layout başarıyla yüklendi');
                    } catch (error) {
                        this.showToast('Dosya yüklenirken hata oluştu', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}-circle"></i> ${message}`;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    autoArrangeTables() {
        // Separate tables by shape
        const roundTables = this.tables.filter(t => t.shape === 'round');
        const rectangleTables = this.tables.filter(t => t.shape === 'rectangle');
        const squareTables = this.tables.filter(t => t.shape === 'square');
        
        const padding = 100;
        const startX = 150;
        let currentY = 150;
        
        // Arrange round tables in a section
        if (roundTables.length > 0) {
            const cols = 3;
            roundTables.forEach((table, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                table.x = startX + col * 120;
                table.y = currentY + row * 120;
            });
            currentY += Math.ceil(roundTables.length / 3) * 120 + padding;
        }
        
        // Arrange rectangle tables in a grid
        if (rectangleTables.length > 0) {
            const cols = 5;
            const startXRect = startX + 350;
            rectangleTables.forEach((table, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                table.x = startXRect + col * 110;
                table.y = 150 + row * 100;
            });
        }
        
        // Arrange square tables
        if (squareTables.length > 0) {
            const cols = 3;
            const startXSquare = this.canvasWidth - 300;
            squareTables.forEach((table, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                table.x = startXSquare + col * 90;
                table.y = 150 + row * 90;
            });
        }
        
        this.saveData();
        this.render();
        this.updateStats();
        this.showToast('Masalar otomatik düzenlendi');
    }

    createBetterDefaultLayout() {
        // Create three main zones like in the original image
        this.zones = [
            {
                id: this.nextId++,
                name: 'Lounge',
                x: 50,
                y: 120,
                width: 350,
                height: 450,
                color: '#e3f2fd',
                type: 'zone'
            },
            {
                id: this.nextId++,
                name: 'Main Dining',
                x: 450,
                y: 120,
                width: 650,
                height: 450,
                color: '#f3e5f5',
                type: 'zone'
            },
            {
                id: this.nextId++,
                name: 'Side Section',
                x: 1150,
                y: 120,
                width: 400,
                height: 450,
                color: '#e8f5e8',
                type: 'zone'
            }
        ];

        // Arrange tables according to your original layout
        const roundTables = this.tables.filter(t => t.shape === 'round');
        const rectangleTables = this.tables.filter(t => t.shape === 'rectangle');
        const squareTables = this.tables.filter(t => t.shape === 'square');

        // Lounge area - Round tables (left side)
        if (roundTables.length > 0) {
            roundTables.forEach((table, index) => {
                // Ensure color is set
                table.color = table.color || this.getStatusColor(table.status);
                
                if (index === 0) {
                    table.x = 150;
                    table.y = 250;
                } else if (index === 1) {
                    table.x = 300;
                    table.y = 200;
                } else if (index === 2) {
                    table.x = 300;
                    table.y = 350;
                } else {
                    // Additional round tables in lounge
                    const col = (index - 3) % 2;
                    const row = Math.floor((index - 3) / 2);
                    table.x = 120 + col * 150;
                    table.y = 450 + row * 120;
                }
            });
        }

        // Main Dining - Rectangle tables (center, organized in rows)
        if (rectangleTables.length > 0) {
            const mainStartX = 500;
            const mainStartY = 200;
            const cols = 4;
            
            rectangleTables.forEach((table, index) => {
                // Ensure color is set
                table.color = table.color || this.getStatusColor(table.status);
                
                const col = index % cols;
                const row = Math.floor(index / cols);
                table.x = mainStartX + col * 130;
                table.y = mainStartY + row * 120;
            });
        }

                // Side Section - Square tables (right side, bottom area)
        if (squareTables.length > 0) {
            const sideStartX = 1200;
            const sideStartY = 400;
            const cols = 4;
            
            squareTables.forEach((table, index) => {
                // Ensure color is set
                table.color = table.color || this.getStatusColor(table.status);
                
                const col = index % cols;
                const row = Math.floor(index / cols);
                table.x = sideStartX + col * 90;
                table.y = sideStartY + row * 90;
            });
        }
     }

    hasGoodLayout() {
        // Check if zones exist and are properly positioned
        if (this.zones.length < 3) return false;
        
        // Check if zones have proper names
        const hasLounge = this.zones.some(z => z.name.includes('Lounge'));
        const hasMain = this.zones.some(z => z.name.includes('Main'));
        const hasSide = this.zones.some(z => z.name.includes('Side'));
        
                 return hasLounge && hasMain && hasSide;
     }

    async resetToDefaultLayout() {
        // Clear localStorage and reload from JSON
        localStorage.removeItem('restaurantLayoutEditor');
        
        // Reset current data
        this.tables = [];
        this.zones = [];
        this.selectedItem = null;
        
        // Force reload from JSON file
        await this.loadData();
        this.render();
        this.updateStats();
        this.showToast('Layout default duruma sıfırlandı');
    }

    deselectItem() {
        this.selectedItem = null;
        this.render();
        this.updateStats();
    }

    deleteSelected() {
        if (this.selectedItem) {
            this.deleteItem(this.selectedItem);
        }
    }

    resizeCanvas() {
        // Alias for updateCanvasDisplay for compatibility
        this.updateCanvasDisplay();
    }
}

// Global functions for modals
window.closeModal = function() {
    document.getElementById('propertiesModal').style.display = 'none';
};

window.closeColorModal = function() {
    document.getElementById('colorModal').style.display = 'none';
};

window.saveItemProperties = function() {
    const editor = window.tableEditor;
    if (!editor.selectedItem) return;

    const name = document.getElementById('itemName').value;
    const capacity = parseInt(document.getElementById('itemCapacity').value);
    const color = document.getElementById('itemColor').value;
    const status = document.getElementById('itemStatus').value;

    editor.selectedItem.name = name || editor.selectedItem.name;
    if (capacity > 0) editor.selectedItem.capacity = capacity;
    editor.selectedItem.color = color;
    if (editor.selectedItem.type === 'table') {
        editor.selectedItem.status = status;
    }

    editor.saveData();
    editor.render();
    editor.updateStats();
    editor.showToast('Özellikler güncellendi');
    
    closeModal();
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.tableEditor = new TableLayoutEditor();
}); 