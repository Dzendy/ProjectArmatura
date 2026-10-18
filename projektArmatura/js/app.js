let currentLang = 'cs';
let components = [];
let pipes = [];
let selectedId = null;     
let selectedPipeId = null; 

let dragInfo = null;       
let pipeHandleDrag = null; 
let paletteDrag = null;    

const SNAP_THRESHOLD = 22;

function switchLanguage(lang) {
    currentLang = lang;
    
    // Aktualizovat statické texty v DOM
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) {
            el.textContent = TRANSLATIONS[currentLang][key];
        }
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) {
            el.placeholder = TRANSLATIONS[currentLang][key];
        }
    });

    updatePropertiesPanel();
    render();
}

function startPaletteDrag(e, type) {
    e.preventDefault();
    paletteDrag = { type: type };
    
    const ghost = document.getElementById('drag-ghost');
    ghost.style.display = 'block';
    const schemaName = currentLang === 'en' ? SCHEMAS[type].name_en : SCHEMAS[type].name_cs;
    ghost.innerHTML = `<span style="font-size:12px; font-weight:bold; color:#00adb5;">${schemaName}</span>`;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';

    window.addEventListener('mousemove', handlePaletteMouseMove);
    window.addEventListener('mouseup', handlePaletteMouseUp);
}

function handlePaletteMouseMove(e) {
    if (!paletteDrag) return;
    const ghost = document.getElementById('drag-ghost');
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
}

function handlePaletteMouseUp(e) {
    if (!paletteDrag) return;
    
    const ghost = document.getElementById('drag-ghost');
    ghost.style.display = 'none';

    const rect = document.getElementById('canvas').getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        addComponent(paletteDrag.type, x, y);
    }

    paletteDrag = null;
    window.removeEventListener('mousemove', handlePaletteMouseMove);
    window.removeEventListener('mouseup', handlePaletteMouseUp);
}

function addComponentFromPalette(type) {
    const rect = document.getElementById('canvas').getBoundingClientRect();
    const x = Math.round(rect.width / 2 + (Math.random() * 60 - 30));
    const y = Math.round(rect.height / 2 + (Math.random() * 60 - 30));
    addComponent(type, x, y);
}

function addComponent(type, x, y) {
    const schema = SCHEMAS[type];
    let ports = JSON.parse(JSON.stringify(schema.ports));

    if (type === 'manifold') {
        ports = generateManifoldPorts(schema.pairs);
    }

    const defaultName = currentLang === 'en' ? schema.name_en : schema.name_cs;
    const defaultText = currentLang === 'en' ? (schema.text_en || schema.text) : schema.text;

    const newComp = {
        id: 'comp_' + Date.now() + '_' + Math.floor(Math.random()*1000),
        type: type,
        label: defaultName,
        text: defaultText || '',
        volume: schema.volume || null,
        waterVolume: schema.waterVolume !== undefined ? schema.waterVolume : 0,
        power: schema.power || null,
        pairs: schema.pairs || null,
        radikType: schema.radikType || '22',
        radikHeight: schema.radikHeight || 600,
        radikLength: schema.radikLength || 1000,
        hasSafetyLoop: schema.hasSafetyLoop !== undefined ? schema.hasSafetyLoop : null,
        x: x,
        y: y,
        rotation: 0,
        ports: ports
    };

    components.push(newComp);
    selectComponent(newComp.id);
    render();
}

function addPipeFromPreset(presetKey) {
    const preset = PIPE_PRESETS[presetKey];
    if (!preset) return;

    const rect = document.getElementById('canvas').getBoundingClientRect();
    const cx = Math.round(rect.width / 2);
    const cy = Math.round(rect.height / 2);

    const newPipe = {
        id: 'pipe_' + Date.now() + '_' + Math.floor(Math.random()*1000),
        label: currentLang === 'en' ? preset.label_en : preset.label_cs,
        material: preset.material,
        diameter: preset.diameter,
        length: preset.length,
        color: preset.color,
        x1: cx - 60,
        y1: cy,
        x2: cx + 60,
        y2: cy,
        startConn: null,
        endConn: null
    };

    pipes.push(newPipe);
    selectPipe(newPipe.id);
    render();
}

function startPipeHandleDrag(e, pipeId, handleIndex) {
    e.stopPropagation();
    selectPipe(pipeId);

    const pipe = pipes.find(p => p.id === pipeId);
    if (!pipe) return;

    pipeHandleDrag = {
        pipeId: pipeId,
        handleIndex: handleIndex,
        startX: e.clientX,
        startY: e.clientY,
        origX: handleIndex === 1 ? pipe.x1 : pipe.x2,
        origY: handleIndex === 1 ? pipe.y1 : pipe.y2
    };

    window.addEventListener('mousemove', handlePipeHandleMouseMove);
    window.addEventListener('mouseup', handlePipeHandleMouseUp);
}

function handlePipeHandleMouseMove(e) {
    if (!pipeHandleDrag) return;

    const pipe = pipes.find(p => p.id === pipeHandleDrag.pipeId);
    if (!pipe) return;

    const rect = document.getElementById('canvas').getBoundingClientRect();
    let targetX = Math.round(e.clientX - rect.left);
    let targetY = Math.round(e.clientY - rect.top);

    let snappedPort = findNearestPort(targetX, targetY);
    if (snappedPort) {
        targetX = snappedPort.x;
        targetY = snappedPort.y;
        
        if (pipeHandleDrag.handleIndex === 1) {
            pipe.startConn = { compId: snappedPort.compId, portId: snappedPort.portId };
        } else {
            pipe.endConn = { compId: snappedPort.compId, portId: snappedPort.portId };
        }

        if (snappedPort.diameter) {
            pipe.diameter = snappedPort.diameter;
        }
    } else {
        if (pipeHandleDrag.handleIndex === 1) pipe.startConn = null;
        else pipe.endConn = null;
    }

    if (pipeHandleDrag.handleIndex === 1) {
        pipe.x1 = targetX;
        pipe.y1 = targetY;
    } else {
        pipe.x2 = targetX;
        pipe.y2 = targetY;
    }

    render();
}

function handlePipeHandleMouseUp() {
    pipeHandleDrag = null;
    window.removeEventListener('mousemove', handlePipeHandleMouseMove);
    window.removeEventListener('mouseup', handlePipeHandleMouseUp);
    updatePropertiesPanel();
}

function findNearestPort(x, y) {
    let nearest = null;
    let minDist = SNAP_THRESHOLD;

    components.forEach(comp => {
        comp.ports.forEach(port => {
            const pos = getGlobalPortPos(comp, port);
            const dist = Math.hypot(pos.x - x, pos.y - y);
            if (dist < minDist) {
                minDist = dist;
                nearest = pos;
            }
        });
    });

    return nearest;
}

function getGlobalPortPos(comp, port) {
    const rad = (comp.rotation * Math.PI) / 180;
    const rx = port.dx * Math.cos(rad) - port.dy * Math.sin(rad);
    const ry = port.dx * Math.sin(rad) + port.dy * Math.cos(rad);
    return {
        x: comp.x + rx,
        y: comp.y + ry,
        diameter: port.diameter,
        portId: port.id,
        compId: comp.id
    };
}

function updateConnectedPipes(comp) {
    pipes.forEach(pipe => {
        if (pipe.startConn && pipe.startConn.compId === comp.id) {
            const port = comp.ports.find(p => p.id === pipe.startConn.portId);
            if (port) {
                const pos = getGlobalPortPos(comp, port);
                pipe.x1 = pos.x;
                pipe.y1 = pos.y;
            }
        }
        if (pipe.endConn && pipe.endConn.compId === comp.id) {
            const port = comp.ports.find(p => p.id === pipe.endConn.portId);
            if (port) {
                const pos = getGlobalPortPos(comp, port);
                pipe.x2 = pos.x;
                pipe.y2 = pos.y;
            }
        }
    });
}

function startComponentDrag(e, id) {
    e.stopPropagation();
    selectComponent(id);
    const comp = components.find(c => c.id === id);
    
    dragInfo = {
        compId: id,
        startX: e.clientX,
        startY: e.clientY,
        origX: comp.x,
        origY: comp.y
    };

    window.addEventListener('mousemove', handleComponentMouseMove);
    window.addEventListener('mouseup', handleComponentMouseUp);
}

function handleComponentMouseMove(e) {
    if (!dragInfo) return;

    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;

    const comp = components.find(c => c.id === dragInfo.compId);
    let targetX = dragInfo.origX + dx;
    let targetY = dragInfo.origY + dy;

    let snapDelta = calculateSnap(comp, targetX, targetY);
    comp.x = targetX + snapDelta.x;
    comp.y = targetY + snapDelta.y;

    updateConnectedPipes(comp);
    render();
}

function handleComponentMouseUp() {
    dragInfo = null;
    window.removeEventListener('mousemove', handleComponentMouseMove);
    window.removeEventListener('mouseup', handleComponentMouseUp);
}

function calculateSnap(movingComp, posX, posY) {
    const tempComp = { ...movingComp, x: posX, y: posY };
    let minDistance = Infinity;
    let snapCorrection = { x: 0, y: 0 };

    const movingPorts = tempComp.ports.map(p => getGlobalPortPos(tempComp, p));

    components.forEach(otherComp => {
        if (otherComp.id === movingComp.id) return;

        otherComp.ports.forEach(otherPort => {
            const otherPos = getGlobalPortPos(otherComp, otherPort);

            movingPorts.forEach(movingPos => {
                const dist = Math.hypot(otherPos.x - movingPos.x, otherPos.y - movingPos.y);
                if (dist < SNAP_THRESHOLD && dist < minDistance) {
                    minDistance = dist;
                    snapCorrection = {
                        x: otherPos.x - movingPos.x,
                        y: otherPos.y - movingPos.y
                    };
                }
            });
        });
    });

    return snapCorrection;
}

function selectComponent(id) {
    selectedId = id;
    selectedPipeId = null;
    updatePropertiesPanel();
    render();
}

function selectPipe(id) {
    selectedPipeId = id;
    selectedId = null;
    updatePropertiesPanel();
    render();
}

function rotateSelectedComponent() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        comp.rotation = (comp.rotation + 90) % 360;
        updateConnectedPipes(comp);
        render();
    }
}

function deleteSelectedComponent() {
    if (!selectedId) return;
    pipes.forEach(p => {
        if (p.startConn && p.startConn.compId === selectedId) p.startConn = null;
        if (p.endConn && p.endConn.compId === selectedId) p.endConn = null;
    });
    components = components.filter(c => c.id !== selectedId);
    selectedId = null;
    updatePropertiesPanel();
    render();
}

function deleteSelectedPipe() {
    if (!selectedPipeId) return;
    pipes = pipes.filter(p => p.id !== selectedPipeId);
    selectedPipeId = null;
    updatePropertiesPanel();
    render();
}

function updatePropertiesPanel() {
    const propComp = document.getElementById('prop-component');
    const propPipe = document.getElementById('prop-pipe');
    const propEmpty = document.getElementById('prop-empty');

    propComp.style.display = 'none';
    propPipe.style.display = 'none';
    propEmpty.style.display = 'none';

    if (selectedId) {
        const comp = components.find(c => c.id === selectedId);
        if (!comp) return;

        propComp.style.display = 'block';
        document.getElementById('prop-type').value = currentLang === 'en' ? SCHEMAS[comp.type].name_en : SCHEMAS[comp.type].name_cs;
        document.getElementById('prop-label').value = comp.label;

        // Poznamka
        const gNote = document.getElementById('group-note-text');
        const gLabel = document.getElementById('group-label');
        const gWater = document.getElementById('group-water-vol');
        const portsContainer = document.getElementById('ports-container');

        if (comp.type === 'note-block') {
            gNote.style.display = 'flex';
            gLabel.style.display = 'none';
            gWater.style.display = 'none';
            portsContainer.style.display = 'none';
            document.getElementById('prop-note-text').value = comp.text || '';
        } else {
            gNote.style.display = 'none';
            gLabel.style.display = 'flex';
            gWater.style.display = 'flex';
            portsContainer.style.display = 'block';
        }

        // Korado Radik
        const gRadik = document.getElementById('group-korado-radik');
        if (comp.type === 'korado-radik') {
            gRadik.style.display = 'flex';
            document.getElementById('prop-radik-type').value = comp.radikType || '22';
            document.getElementById('prop-radik-height').value = comp.radikHeight || 600;
            document.getElementById('prop-radik-length').value = comp.radikLength || 1000;
        } else gRadik.style.display = 'none';

        // Krb
        const gFire = document.getElementById('group-fireplace-safety');
        if (comp.type === 'fireplace-boiler') {
            gFire.style.display = 'flex';
            document.getElementById('prop-fireplace-safety-val').value = comp.hasSafetyLoop ? 'yes' : 'no';
        } else gFire.style.display = 'none';

        // Rozdělovač
        const gMan = document.getElementById('group-manifold-pairs');
        if (comp.type === 'manifold') {
            gMan.style.display = 'flex';
            document.getElementById('prop-manifold-pairs-val').value = comp.pairs || 3;
        } else gMan.style.display = 'none';

        // Objem vody
        document.getElementById('prop-water-vol').value = comp.waterVolume !== undefined ? comp.waterVolume : 0;

        // Výkon
        const gPow = document.getElementById('group-power');
        if (comp.power !== null) {
            gPow.style.display = 'flex';
            document.getElementById('prop-power').value = comp.power;
        } else gPow.style.display = 'none';

        // Tlačítko přidání portu
        const btnAdd = document.getElementById('btn-add-port');
        btnAdd.style.display = (comp.type === 'buffer-tank' || comp.type === 'dhw-tank') ? 'block' : 'none';

        const portsList = document.getElementById('ports-list');
        portsList.innerHTML = '';

        comp.ports.forEach((port) => {
            const side = port.dx < 0 ? 'left' : (port.dx > 0 ? 'right' : (port.dy < 0 ? 'top' : 'bottom'));
            const div = document.createElement('div');
            div.className = 'port-config';
            div.innerHTML = `
                <div class="port-title">
                    <span>${currentLang === 'en' ? 'Port' : 'Vývod'}: ${port.id}</span>
                    ${comp.ports.length > 2 ? `<button style="background:#e63946; padding:2px 6px; font-size:10px; margin:0;" onclick="deletePortFromTank('${port.id}')">✕</button>` : ''}
                </div>
                <div class="prop-group">
                    <label>${currentLang === 'en' ? 'Port Label' : 'Název vývodu'}</label>
                    <input type="text" value="${port.id}" onchange="updatePortLabel('${port.id}', this.value)">
                </div>
                <div class="prop-row">
                    <div class="prop-group" style="flex:1;">
                        <label>${currentLang === 'en' ? 'Side' : 'Strana'}</label>
                        <select onchange="updatePortSide('${port.id}', this.value)">
                            <option value="left" ${side === 'left' ? 'selected' : ''}>${currentLang === 'en' ? 'Left' : 'Vlevo'}</option>
                            <option value="right" ${side === 'right' ? 'selected' : ''}>${currentLang === 'en' ? 'Right' : 'Vpravo'}</option>
                            <option value="top" ${side === 'top' ? 'selected' : ''}>${currentLang === 'en' ? 'Top' : 'Nahoře'}</option>
                            <option value="bottom" ${side === 'bottom' ? 'selected' : ''}>${currentLang === 'en' ? 'Bottom' : 'Dole'}</option>
                        </select>
                    </div>
                    <div class="prop-group" style="flex:1;">
                        <label>${currentLang === 'en' ? 'Pos [px]' : 'Pozice [px]'}</label>
                        <input type="number" value="${side==='top'||side==='bottom' ? port.dx : port.dy}" step="5" onchange="updatePortPos('${port.id}', this.value)">
                    </div>
                </div>
                <div class="prop-group">
                    <label>${currentLang === 'en' ? 'Diameter' : 'Průměr vývodu'}</label>
                    <select onchange="updatePortDiameter('${port.id}', this.value)">
                        ${['16×2.0', '18×2.0', '20×2.0', '25×3.5', '26×3.0', '32×3.0', '40×3.5', '50×4.0', '15×1.0', '18×1.0', '22×1.0', '28×1.5', '35×1.5', '1/2"', '3/4"', '1"', '5/4"', '6/4"', 'DN 40', 'DN 50', 'DN 75', 'DN 110'].map(d => 
                            `<option value="${d}" ${port.diameter === d ? 'selected' : ''}>${d}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
            portsList.appendChild(div);
        });
    } else if (selectedPipeId) {
        const pipe = pipes.find(p => p.id === selectedPipeId);
        if (!pipe) return;

        propPipe.style.display = 'block';
        document.getElementById('pipe-label').value = pipe.label || '';
        document.getElementById('pipe-material').value = pipe.material;
        document.getElementById('pipe-diameter').value = pipe.diameter;
        document.getElementById('pipe-length').value = pipe.length;
        document.getElementById('pipe-color').value = pipe.color;
    } else {
        propEmpty.style.display = 'block';
    }
}

function updateNoteText() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp && comp.type === 'note-block') {
        comp.text = document.getElementById('prop-note-text').value;
        render();
    }
}

function updateKoradoRadik() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp && comp.type === 'korado-radik') {
        comp.radikType = document.getElementById('prop-radik-type').value;
        comp.radikHeight = parseInt(document.getElementById('prop-radik-height').value) || 600;
        comp.radikLength = parseInt(document.getElementById('prop-radik-length').value) || 1000;
        
        comp.waterVolume = calcKoradoRadikWaterVolume(comp.radikType, comp.radikHeight, comp.radikLength);
        document.getElementById('prop-water-vol').value = comp.waterVolume;
        render();
    }
}

function addPortToSelectedTank() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        const countLeft = comp.ports.filter(p => p.dx < 0).length;
        const countRight = comp.ports.filter(p => p.dx > 0).length;
        const side = countLeft <= countRight ? -35 : 35;
        const countOnSide = comp.ports.filter(p => p.dx === side).length;
        const dy = -40 + (countOnSide * 20);

        const newPortId = 'P' + (comp.ports.length + 1);
        comp.ports.push({ id: newPortId, dx: side, dy: Math.min(dy, 45), diameter: '6/4"' });
        updatePropertiesPanel();
        render();
    }
}

function updatePortSide(portId, newSide) {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        const port = comp.ports.find(p => p.id === portId);
        if (port) {
            if (newSide === 'left') { port.dx = -35; if(port.dy===-60||port.dy===60) port.dy = 0; }
            else if (newSide === 'right') { port.dx = 35; if(port.dy===-60||port.dy===60) port.dy = 0; }
            else if (newSide === 'top') { port.dx = 0; port.dy = -60; }
            else if (newSide === 'bottom') { port.dx = 0; port.dy = 60; }
            updateConnectedPipes(comp);
            render();
        }
    }
}

function updatePortPos(portId, newPosVal) {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        const port = comp.ports.find(p => p.id === portId);
        if (port) {
            const val = parseInt(newPosVal) || 0;
            if (port.dx === 0) port.dx = val;
            else port.dy = val;
            updateConnectedPipes(comp);
            render();
        }
    }
}

function toggleFireplaceSafetyLoop() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp && comp.type === 'fireplace-boiler') {
        const val = document.getElementById('prop-fireplace-safety-val').value;
        comp.hasSafetyLoop = (val === 'yes');
        if (comp.hasSafetyLoop) {
            comp.ports = [
                { id: 'topná', dx: 35, dy: -15, diameter: '1"' },
                { id: 'vratná', dx: 35, dy: 15, diameter: '1"' },
                { id: 'smyčka_in', dx: -35, dy: -15, diameter: '1/2"' },
                { id: 'smyčka_out', dx: -35, dy: 15, diameter: '1/2"' }
            ];
        } else {
            comp.ports = [
                { id: 'topná', dx: 35, dy: -15, diameter: '1"' },
                { id: 'vratná', dx: 35, dy: 15, diameter: '1"' }
            ];
        }
        updatePropertiesPanel();
        render();
    }
}

function updateManifoldPairs() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp && comp.type === 'manifold') {
        const val = parseInt(document.getElementById('prop-manifold-pairs-val').value) || 3;
        comp.pairs = Math.max(1, Math.min(10, val));
        comp.ports = generateManifoldPorts(comp.pairs);
        updateConnectedPipes(comp);
        updatePropertiesPanel();
        render();
    }
}

function deletePortFromTank(portId) {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        comp.ports = comp.ports.filter(p => p.id !== portId);
        updatePropertiesPanel();
        render();
    }
}

function updatePortLabel(oldId, newLabel) {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        const port = comp.ports.find(p => p.id === oldId);
        if (port) port.id = newLabel;
        render();
    }
}

function updateSelectedComponent() {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        comp.label = document.getElementById('prop-label').value;
        comp.waterVolume = parseFloat(document.getElementById('prop-water-vol').value) || 0;
        if (comp.volume !== null) comp.volume = comp.waterVolume;
        if (comp.power !== null) comp.power = parseFloat(document.getElementById('prop-power').value) || comp.power;
        render();
    }
}

function updatePortDiameter(portId, value) {
    if (!selectedId) return;
    const comp = components.find(c => c.id === selectedId);
    if (comp) {
        const port = comp.ports.find(p => p.id === portId);
        if (port) port.diameter = value;
        render();
    }
}

function updateSelectedPipe() {
    if (!selectedPipeId) return;
    const pipe = pipes.find(p => p.id === selectedPipeId);
    if (pipe) {
        pipe.label = document.getElementById('pipe-label').value;
        pipe.material = document.getElementById('pipe-material').value;
        pipe.diameter = document.getElementById('pipe-diameter').value;
        pipe.length = parseFloat(document.getElementById('pipe-length').value) || 1.0;
        pipe.color = document.getElementById('pipe-color').value;
        render();
    }
}

function setPipeColor(colorHex) {
    if (!selectedPipeId) return;
    document.getElementById('pipe-color').value = colorHex;
    updateSelectedPipe();
}

function render() {
    const pipesLayer = document.getElementById('pipes-layer');
    const compLayer = document.getElementById('components-layer');

    pipesLayer.innerHTML = '';
    compLayer.innerHTML = '';

    // RENDEROVÁNÍ POTRUBÍ
    pipes.forEach(pipe => {
        const isSelected = pipe.id === selectedPipeId;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', pipe.x1);
        line.setAttribute('y1', pipe.y1);
        line.setAttribute('x2', pipe.x2);
        line.setAttribute('y2', pipe.y2);
        line.setAttribute('stroke', pipe.color);
        line.setAttribute('stroke-width', isSelected ? '7' : '5');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('style', 'cursor: pointer;');
        line.onclick = (e) => { e.stopPropagation(); selectPipe(pipe.id); };
        g.appendChild(line);

        const mx = (pipe.x1 + pipe.x2) / 2;
        const my = (pipe.y1 + pipe.y2) / 2;
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mx);
        text.setAttribute('y', my - 8);
        text.setAttribute('fill', pipe.color);
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'pointer-events: none;');
        text.textContent = `${pipe.label ? pipe.label + ' - ' : ''}${pipe.material} ${pipe.diameter} (${pipe.length}m)`;
        g.appendChild(text);

        if (isSelected) {
            [ { x: pipe.x1, y: pipe.y1, idx: 1 }, { x: pipe.x2, y: pipe.y2, idx: 2 } ].forEach(h => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', h.x);
                circle.setAttribute('cy', h.y);
                circle.setAttribute('r', '7');
                circle.setAttribute('fill', '#00adb5');
                circle.setAttribute('stroke', '#fff');
                circle.setAttribute('stroke-width', '2');
                circle.setAttribute('style', 'cursor: grab;');
                circle.onmousedown = (e) => startPipeHandleDrag(e, pipe.id, h.idx);
                g.appendChild(circle);
            });
        }

        pipesLayer.appendChild(g);
    });

    // RENDEROVÁNÍ KOMPONENT
    components.forEach(comp => {
        const isSelected = comp.id === selectedId;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`);
        g.setAttribute('style', 'cursor: move;');
        g.onmousedown = (e) => startComponentDrag(e, comp.id);

        let graphic = '';

        if (comp.type === 'note-block') {
            const lines = (comp.text || (currentLang === 'en' ? 'Note' : 'Poznámka')).split('\n');
            let maxLineLen = 0;
            lines.forEach(l => { if (l.length > maxLineLen) maxLineLen = l.length; });
            
            const boxW = Math.max(90, maxLineLen * 7 + 24);
            const boxH = Math.max(40, lines.length * 16 + 18);
            const halfW = boxW / 2;
            const halfH = boxH / 2;

            let textTspans = '';
            lines.forEach((lineText, idx) => {
                textTspans += `<tspan x="0" dy="${idx === 0 ? 0 : 16}">${lineText}</tspan>`;
            });

            graphic = `
                <rect x="${-halfW}" y="${-halfH}" width="${boxW}" height="${boxH}" fill="#2d2b1e" stroke="#f39c12" stroke-width="2" rx="5" stroke-dasharray="3"/>
                <text x="0" y="${-halfH + 16}" fill="#f39c12" font-size="11" font-weight="500" text-anchor="middle">${textTspans}</text>
            `;

            if (isSelected) {
                const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                box.setAttribute('x', -halfW - 6); box.setAttribute('y', -halfH - 6);
                box.setAttribute('width', boxW + 12); box.setAttribute('height', boxH + 12);
                box.setAttribute('fill', 'none'); box.setAttribute('stroke', '#00adb5');
                box.setAttribute('stroke-dasharray', '4'); box.setAttribute('rx', '6');
                g.appendChild(box);
            }

            g.innerHTML = graphic;
            compLayer.appendChild(g);
            return;
        }

        if (comp.type === 'buffer-tank') {
            graphic = `
                <rect x="-35" y="-60" width="70" height="120" rx="15" fill="#21212b" stroke="#00adb5" stroke-width="3"/>
                <text x="0" y="-15" fill="#00adb5" font-size="10" font-weight="bold" text-anchor="middle">${comp.label}</text>
                <text x="0" y="5" fill="#aaa" font-size="11" font-weight="bold" text-anchor="middle">${comp.waterVolume || 500} L</text>
            `;
        } else if (comp.type === 'dhw-tank') {
            graphic = `
                <rect x="-35" y="-55" width="70" height="110" rx="12" fill="#21212b" stroke="#f39c12" stroke-width="3"/>
                <path d="M-15,-20 C-15,-30 15,-30 15,-20 C15,-10 -15,-10 -15,0 C-15,10 15,10 15,20" stroke="#f39c12" stroke-width="2" fill="none"/>
                <text x="0" y="-32" fill="#f39c12" font-size="10" font-weight="bold" text-anchor="middle">${comp.label}</text>
                <text x="0" y="38" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle">${comp.waterVolume || 200} L</text>
            `;
        } else if (comp.type === 'waterworks-classic') {
            graphic = `
                <rect x="-30" y="-20" width="60" height="40" fill="#21212b" stroke="#00adb5" stroke-width="3" rx="4"/>
                <ellipse cx="0" cy="-20" rx="16" ry="10" fill="#21212b" stroke="#e63946" stroke-width="2"/>
                <text x="0" y="5" fill="#fff" font-size="8" font-weight="bold" text-anchor="middle">${currentLang === 'en' ? 'PUMP' : 'VODÁRNA'}</text>
            `;
        } else if (comp.type === 'waterworks-inverter') {
            graphic = `
                <rect x="-25" y="-30" width="50" height="60" fill="#21212b" stroke="#00adb5" stroke-width="3" rx="4"/>
                <path d="M-12,-8 L0,8 L12,-8" stroke="#00adb5" stroke-width="2" fill="none"/>
                <text x="0" y="20" fill="#fff" font-size="8" font-weight="bold" text-anchor="middle">INVERTER</text>
            `;
        } else if (comp.type === 'submersible-pump') {
            graphic = `
                <rect x="-15" y="-35" width="30" height="70" fill="#21212b" stroke="#00adb5" stroke-width="3" rx="4"/>
                <line x1="-15" y1="-10" x2="15" y2="-10" stroke="#00adb5" stroke-width="2"/>
                <text x="0" y="10" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">WELL</text>
            `;
        } else if (comp.type === 'dhw-recirc-pump') {
            graphic = `<path d="M-30,0 L30,0" stroke="#fff" stroke-width="4" fill="none"/><circle cx="0" cy="0" r="15" fill="#1e1e24" stroke="#f39c12" stroke-width="2"/><polygon points="-6,-9 -6,9 9,0" fill="#f39c12"/>`;
        } else if (comp.type === 'pressure-gauge') {
            graphic = `<line x1="0" y1="20" x2="0" y2="0" stroke="#fff" stroke-width="3"/><circle cx="0" cy="-10" r="15" fill="#21212b" stroke="#00adb5" stroke-width="2"/><line x1="0" y1="-10" x2="7" y2="-17" stroke="#e63946" stroke-width="2"/><text x="0" y="2" fill="#aaa" font-size="8" text-anchor="middle">BAR</text>`;
        } else if (comp.type === 'thermometer-immersion') {
            graphic = `<line x1="0" y1="20" x2="0" y2="0" stroke="#fff" stroke-width="3"/><circle cx="0" cy="-10" r="15" fill="#21212b" stroke="#e63946" stroke-width="2"/><text x="0" y="-5" fill="#e63946" font-size="11" font-weight="bold" text-anchor="middle">°C</text>`;
        } else if (comp.type === 'thermometer-surface') {
            graphic = `<rect x="-15" y="-15" width="30" height="30" fill="#21212b" stroke="#e63946" stroke-width="2" rx="4"/><text x="0" y="5" fill="#e63946" font-size="11" font-weight="bold" text-anchor="middle">°C</text>`;
        } else if (comp.type === 'pressure-reducer') {
            graphic = `<path d="M-30,0 L30,0" stroke="#fff" stroke-width="4"/><polygon points="-14,-10 -14,10 0,0" fill="#00adb5"/><polygon points="14,-10 14,10 0,0" fill="#00adb5"/><rect x="-8" y="-20" width="16" height="12" fill="#21212b" stroke="#00adb5" stroke-width="2"/>`;
        } else if (comp.type === 'thermostatic-switch-valve') {
            graphic = `<path d="M-30,0 L30,0 M0,0 L0,30" stroke="#fff" stroke-width="4"/><circle cx="0" cy="-14" r="9" fill="#f39c12" stroke="#fff" stroke-width="1.5"/><text x="0" y="-11" fill="#1e1e24" font-size="9" font-weight="bold" text-anchor="middle">T</text>`;
        } else if (comp.type === 'korado-radik') {
            graphic = `
                <rect x="-35" y="-22" width="70" height="44" fill="#21212b" stroke="#e63946" stroke-width="3" rx="3"/>
                <line x1="-20" y1="-22" x2="-20" y2="22" stroke="#e63946"/>
                <line x1="0" y1="-22" x2="0" y2="22" stroke="#e63946"/>
                <line x1="20" y1="-22" x2="20" y2="22" stroke="#e63946"/>
                <text x="0" y="-5" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">Radik T${comp.radikType}</text>
                <text x="0" y="10" fill="#aaa" font-size="8" text-anchor="middle">${comp.radikHeight}×${comp.radikLength} (${comp.waterVolume}L)</text>
            `;
        } else if (comp.type === 'korado-koralux') {
            graphic = `
                <rect x="-20" y="-30" width="40" height="60" fill="none" stroke="#f39c12" stroke-width="3"/>
                <line x1="-20" y1="-18" x2="20" y2="-18" stroke="#f39c12"/>
                <line x1="-20" y1="-6" x2="20" y2="-6" stroke="#f39c12"/>
                <line x1="-20" y1="6" x2="20" y2="6" stroke="#f39c12"/>
                <line x1="-20" y1="18" x2="20" y2="18" stroke="#f39c12"/>
                <text x="0" y="38" fill="#fff" font-size="8" font-weight="bold" text-anchor="middle">Koralux (${comp.waterVolume}L)</text>
            `;
        } else if (comp.type === 'fireplace-boiler') {
            graphic = `
                <rect x="-40" y="-35" width="80" height="70" fill="#21212b" stroke="#e63946" stroke-width="3" rx="4"/>
                <path d="M0,12 C-12,0 -6,-18 0,-24 C6,-18 12,0 0,12 Z" fill="#e63946"/>
                <text x="0" y="24" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">${comp.power || 8} kW</text>
            `;
        } else if (comp.type === 'heat-pump') {
            graphic = `
                <rect x="-40" y="-35" width="80" height="70" fill="#21212b" stroke="#00adb5" stroke-width="3" rx="4"/>
                <circle cx="0" cy="-6" r="16" fill="none" stroke="#00adb5" stroke-width="2"/>
                <path d="M-10,-6 L10,-6 M0,-16 L0,4" stroke="#00adb5" stroke-width="2"/>
                <text x="0" y="24" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">${comp.power || 6} kW</text>
            `;
        } else if (comp.type === 'manifold') {
            const pairs = comp.pairs || 3;
            const width = Math.max(90, pairs * 26 + 30);
            const halfW = width / 2;
            graphic = `
                <rect x="${-halfW}" y="-16" width="${width}" height="12" fill="#e63946" rx="3"/>
                <rect x="${-halfW}" y="4" width="${width}" height="12" fill="#457b9d" rx="3"/>
                <text x="0" y="-22" fill="#aaa" font-size="9" text-anchor="middle">${currentLang === 'en' ? 'Manifold' : 'Rozdělovač'} (${pairs})</text>
            `;
        } else if (comp.type === 'pump') {
            graphic = `<path d="M-30,0 L30,0" stroke="#fff" stroke-width="4" fill="none"/><circle cx="0" cy="0" r="15" fill="#1e1e24" stroke="#fff" stroke-width="2"/><polygon points="-6,-9 -6,9 9,0" fill="#fff"/>`;
        } else {
            graphic = `
                <rect x="-25" y="-20" width="50" height="40" fill="#21212b" stroke="#00adb5" stroke-width="2" rx="4"/>
                <text x="0" y="5" fill="#fff" font-size="8" font-weight="bold" text-anchor="middle">${comp.label.substr(0, 10)}</text>
            `;
        }

        if (isSelected) {
            const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            box.setAttribute('x', '-48'); box.setAttribute('y', '-68');
            box.setAttribute('width', '96'); box.setAttribute('height', '136');
            box.setAttribute('fill', 'none');
            box.setAttribute('stroke', '#00adb5');
            box.setAttribute('stroke-dasharray', '4');
            box.setAttribute('rx', '6');
            g.appendChild(box);
        }

        const text = `<text x="0" y="-52" fill="#aaa" font-size="11" text-anchor="middle" transform="rotate(${-comp.rotation})">${comp.label}</text>`;
        g.innerHTML = graphic + text;

        comp.ports.forEach(port => {
            const portG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', port.dx);
            circle.setAttribute('cy', port.dy);
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', '#00adb5');
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '1.5');

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', port.dx + (port.dx > 0 ? 10 : (port.dx < 0 ? -10 : 0)));
            label.setAttribute('y', port.dy + (port.dy > 0 ? 16 : (port.dy < 0 ? -12 : -8)));
            label.setAttribute('fill', '#00adb5');
            label.setAttribute('font-size', '10');
            label.setAttribute('font-weight', 'bold');
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('transform', `rotate(${-comp.rotation}, ${port.dx}, ${port.dy})`);
            label.textContent = `${port.id} (${port.diameter})`;

            portG.appendChild(circle);
            portG.appendChild(label);
            g.appendChild(portG);
        });

        compLayer.appendChild(g);
    });
}

function calculateTotalWaterVolume() {
    let tankVolume = 0;
    let sourceVolume = 0;
    let radiatorVolume = 0;
    let waterTreatmentVolume = 0;
    let pipeVolume = 0;
    let otherVolume = 0;

    components.forEach(c => {
        const vol = parseFloat(c.waterVolume) || 0;
        if (c.type === 'buffer-tank' || c.type === 'dhw-tank') tankVolume += vol;
        else if (['fireplace-boiler', 'heat-pump', 'solar-collector', 'electric-boiler', 'gas-boiler', 'pellet-boiler', 'waterworks-classic', 'waterworks-inverter', 'submersible-pump'].includes(c.type)) sourceVolume += vol;
        else if (['korado-radik', 'korado-koralux'].includes(c.type)) radiatorVolume += vol;
        else if (['water-filter', 'water-softener', 'reverse-osmosis', 'uv-lamp', 'carbon-filter'].includes(c.type)) waterTreatmentVolume += vol;
        else otherVolume += vol;
    });

    pipes.forEach(p => {
        const volPerM = PIPE_VOLUMES_PER_METER[p.diameter] || 0.201;
        const pLen = parseFloat(p.length) || 1.0;
        pipeVolume += volPerM * pLen;
    });

    const totalSystemVolume = tankVolume + sourceVolume + radiatorVolume + waterTreatmentVolume + pipeVolume + otherVolume;

    const modalTitle = document.getElementById('modal-title');
    const bomContent = document.getElementById('bom-content');

    modalTitle.textContent = currentLang === 'en' ? '💧 Water Volume Calculation' : '💧 Výpočet Objemu Vody v Systému';

    let html = `
        <div style="background:#21212b; padding:15px; border-radius:6px; border-left:4px solid #2a9d8f; margin-bottom:15px;">
            <h3 style="color:#2a9d8f; font-size:18px;">${currentLang === 'en' ? 'Total Water Volume' : 'Celkový Objem Vody'}: ${totalSystemVolume.toFixed(2)} ${currentLang === 'en' ? 'Liters' : 'Litrů'}</h3>
            <p style="color:#aaa; font-size:12px; margin-top:4px;">${currentLang === 'en' ? 'Calculated from placed components, filtration, tanks, radiators and pipe lines.' : 'Spočteno ze všech umístěných prvků, filtrace, nádrží, otopných těles a potrubních tras.'}</p>
        </div>

        <table class="bom-table">
            <thead>
                <tr><th>${currentLang === 'en' ? 'Component Category' : 'Kategorie Prvků'}</th><th>${currentLang === 'en' ? 'Water Volume [Liters]' : 'Objem vody [Litrů]'}</th></tr>
            </thead>
            <tbody>
                <tr><td>${currentLang === 'en' ? 'Buffer & DHW Tanks' : 'Akumulační a TUV nádrže'}</td><td><b>${tankVolume.toFixed(1)} L</b></td></tr>
                <tr><td>${currentLang === 'en' ? 'Water Treatment (Softener, RO, Filters)' : 'Úprava pitné vody (Změkčovač, RO, Filtry)'}</td><td><b>${waterTreatmentVolume.toFixed(1)} L</b></td></tr>
                <tr><td>${currentLang === 'en' ? 'Heat Sources & Waterworks' : 'Zdroje tepla & Vodárny'}</td><td><b>${sourceVolume.toFixed(1)} L</b></td></tr>
                <tr><td>${currentLang === 'en' ? 'Radiators (Radik & Koralux)' : 'Otopná tělesa Korado (Radik & Koralux)'}</td><td><b>${radiatorVolume.toFixed(1)} L</b></td></tr>
                <tr><td>${currentLang === 'en' ? 'Valves, Separators & Other' : 'Armatury, Anuloid, ZTI & Ostatní'}</td><td><b>${otherVolume.toFixed(1)} L</b></td></tr>
                <tr><td>${currentLang === 'en' ? 'Pipe Lines (Length & Ø)' : 'Rozvody potrubí (Dle metráže a Ø)'}</td><td><b>${pipeVolume.toFixed(2)} L</b></td></tr>
            </tbody>
        </table>

        <h4 style="margin-top:20px; color:#00adb5;">${currentLang === 'en' ? 'Pipe Details Breakdown' : 'Detailní rozpad potrubí'}</h4>
        <table class="bom-table">
            <thead>
                <tr><th>${currentLang === 'en' ? 'Pipe / Dimension' : 'Trubka / Dimenze'}</th><th>${currentLang === 'en' ? 'Length [m]' : 'Délka [m]'}</th><th>${currentLang === 'en' ? 'Volume [L]' : 'Objem vody [L]'}</th></tr>
            </thead>
            <tbody>
    `;

    if (pipes.length === 0) {
        html += `<tr><td colspan="3" style="color:#aaa;">${currentLang === 'en' ? 'No pipes on canvas.' : 'Žádné trubky ve výkresu.'}</td></tr>`;
    } else {
        pipes.forEach(p => {
            const vPerM = PIPE_VOLUMES_PER_METER[p.diameter] || 0.201;
            const pVol = vPerM * (p.length || 1);
            html += `<tr><td>${p.label || (currentLang === 'en' ? 'Pipe' : 'Trubka')} (${p.material} ${p.diameter})</td><td>${p.length} m</td><td><b>${pVol.toFixed(2)} L</b></td></tr>`;
        });
    }

    html += `</tbody></table>`;

    bomContent.innerHTML = html;
    document.getElementById('bom-modal').classList.add('active');
}

window.onkeydown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.key === 'r' || e.key === 'R') {
        rotateSelectedComponent();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) deleteSelectedComponent();
        else if (selectedPipeId) deleteSelectedPipe();
    }
};

function clearCanvas() {
    const msg = currentLang === 'en' ? 'Do you really want to clear the canvas?' : 'Opravdu chcete vyčistit celé plátno?';
    if (confirm(msg)) {
        components = [];
        pipes = [];
        selectedId = null;
        selectedPipeId = null;
        updatePropertiesPanel();
        render();
    }
}

function filterPalette() {
    const query = document.getElementById('search-input').value.toLowerCase();
    document.querySelectorAll('.palette-category').forEach(cat => {
        let hasVisible = false;
        cat.querySelectorAll('.palette-item, .pipe-preset-item').forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(query)) {
                item.style.display = 'flex';
                hasVisible = true;
            } else {
                item.style.display = 'none';
            }
        });
        cat.style.display = hasVisible ? 'block' : 'none';
    });
}

function showBOM() {
    const modalTitle = document.getElementById('modal-title');
    const bomContent = document.getElementById('bom-content');

    modalTitle.textContent = currentLang === 'en' ? 'Bill of Materials & Specifications' : 'Kusovník a Specifikace Potrubí';
    
    const compCounts = {};
    components.forEach(c => {
        if (c.type === 'note-block') return;
        const key = `${c.label} ${c.radikType ? '(Typ ' + c.radikType + ' ' + c.radikHeight + 'x' + c.radikLength + ')' : ''}`;
        compCounts[key] = (compCounts[key] || 0) + 1;
    });

    const pipeSummary = {};
    pipes.forEach(p => {
        const key = `${p.material} - ${p.diameter}`;
        pipeSummary[key] = (pipeSummary[key] || 0) + (p.length || 0);
    });

    let html = `<h4>${currentLang === 'en' ? '1. Heat Sources, Tanks, Radiators & Valves' : '1. Seznam Zdroje Tepla, Nádrží, Radiátorů a Armatur'}</h4>`;
    if (Object.keys(compCounts).length === 0) {
        html += `<p style="color:#aaa;">${currentLang === 'en' ? 'No components on canvas.' : 'Žádné prvky na plátně.'}</p>`;
    } else {
        html += `<table class="bom-table"><thead><tr><th>${currentLang === 'en' ? 'Item' : 'Položka'}</th><th>${currentLang === 'en' ? 'Quantity' : 'Počet [ks]'}</th></tr></thead><tbody>`;
        for (const [name, count] of Object.entries(compCounts)) {
            html += `<tr><td>${name}</td><td><b>${count} pcs</b></td></tr>`;
        }
        html += `</tbody></table>`;
    }

    html += `<h4 style="margin-top:20px;">${currentLang === 'en' ? '2. Pipe Specifications (Total Length)' : '2. Specifikace Potrubí (Celková metráž)'}</h4>`;
    if (Object.keys(pipeSummary).length === 0) {
        html += `<p style="color:#aaa;">${currentLang === 'en' ? 'No pipes on canvas.' : 'Žádné trubky na plátně.'}</p>`;
    } else {
        html += `<table class="bom-table"><thead><tr><th>${currentLang === 'en' ? 'Material & Dimension' : 'Materiál a Rozměr'}</th><th>${currentLang === 'en' ? 'Total Length' : 'Celková délka'}</th></tr></thead><tbody>`;
        for (const [mat, len] of Object.entries(pipeSummary)) {
            html += `<tr><td>${mat}</td><td><b>${len.toFixed(2)} m</b></td></tr>`;
        }
        html += `</tbody></table>`;
    }

    bomContent.innerHTML = html;
    document.getElementById('bom-modal').classList.add('active');
}

function closeBOM() {
    document.getElementById('bom-modal').classList.remove('active');
}

function exportSVG() {
    const svg = document.getElementById('canvas');
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'armature-scheme.svg';
    a.click();
}

function exportPNG() {
    const svg = document.getElementById('canvas');
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const rect = svg.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        ctx.fillStyle = '#141419';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'armature-scheme.png';
        a.click();
    };
    img.src = url;
}

document.getElementById('canvas').onclick = (e) => {
    if (e.target.tagName === 'svg' || e.target.tagName === 'rect') {
        selectedId = null;
        selectedPipeId = null;
        updatePropertiesPanel();
        render();
    }
};

render();