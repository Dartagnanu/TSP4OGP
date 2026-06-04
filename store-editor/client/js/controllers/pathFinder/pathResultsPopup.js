const POSITION_STORAGE_KEY = 'pathResultsPanelPosition';

function formatCoord(point) {
    if (!point) return '—';
    return `[${point[0]}, ${point[1]}]`;
}

function getTopBarMinTop() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
        '--topbar-height'
    );
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 48;
}

export class PathResultsPopup {
    constructor(onClose) {
        this.popup = document.getElementById('pathResultsPopup');
        this.dragHandle = document.getElementById('pathResultsDragHandle');
        this.upcsEl = document.getElementById('pathResultsUpcs');
        this.stepsEl = document.getElementById('pathResultsSteps');
        this.titleEl = document.getElementById('pathResultsTitle');
        this.closeBtn = document.getElementById('closePathResults');
        this.onClose = onClose;

        this._drag = null;

        this.closeBtn.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.popup.style.display !== 'none') this.close();
        });

        this._initDrag();
    }

    close() {
        this.popup.style.display = 'none';
        if (this.onClose) this.onClose();
    }

    _open() {
        const shelfPopup = document.getElementById('shelfEditPopup');
        if (shelfPopup) shelfPopup.style.display = 'none';

        this.popup.style.display = 'flex';
        this._applyPosition();
    }

    _applyPosition() {
        const saved = this._loadPosition();
        if (saved && this._isPositionValid(saved)) {
            this.popup.classList.remove('path-results-panel--docked');
            this.popup.style.transform = 'none';
            this.popup.style.right = 'auto';
            this.popup.style.left = `${saved.left}px`;
            this.popup.style.top = `${saved.top}px`;
            return;
        }
        this._resetToDocked();
    }

    _resetToDocked() {
        this.popup.classList.add('path-results-panel--docked');
        this.popup.style.transform = 'none';
        this.popup.style.left = '';
        this.popup.style.top = '';
        this.popup.style.right = '';
    }

    _loadPosition() {
        try {
            const raw = sessionStorage.getItem(POSITION_STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    _savePosition(left, top) {
        try {
            sessionStorage.setItem(
                POSITION_STORAGE_KEY,
                JSON.stringify({ left, top })
            );
        } catch {
            /* ignore */
        }
    }

    _isPositionValid({ left, top }) {
        if (!Number.isFinite(left) || !Number.isFinite(top)) return false;
        const w = this.popup.offsetWidth || 380;
        const h = this.popup.offsetHeight || 200;
        const minTop = getTopBarMinTop();
        return (
            left >= -w + 80 &&
            top >= minTop &&
            left <= window.innerWidth - 80 &&
            top <= window.innerHeight - 80
        );
    }

    _clampPosition(left, top) {
        const rect = this.popup.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const minTop = getTopBarMinTop();
        const maxLeft = window.innerWidth - w;
        const maxTop = window.innerHeight - h;
        return {
            left: Math.max(0, Math.min(left, maxLeft)),
            top: Math.max(minTop, Math.min(top, maxTop)),
        };
    }

    _initDrag() {
        const onPointerDown = (clientX, clientY, target) => {
            if (target.closest('#closePathResults')) return;
            const rect = this.popup.getBoundingClientRect();
            this.popup.classList.remove('path-results-panel--docked');
            this.popup.style.transform = 'none';
            this.popup.style.right = 'auto';
            this.popup.style.left = `${rect.left}px`;
            this.popup.style.top = `${rect.top}px`;

            this._drag = {
                offsetX: clientX - rect.left,
                offsetY: clientY - rect.top,
            };
        };

        const onPointerMove = (clientX, clientY) => {
            if (!this._drag) return;
            const { left, top } = this._clampPosition(
                clientX - this._drag.offsetX,
                clientY - this._drag.offsetY
            );
            this.popup.style.left = `${left}px`;
            this.popup.style.top = `${top}px`;
        };

        const onPointerUp = () => {
            if (!this._drag) return;
            this._drag = null;
            const left = parseFloat(this.popup.style.left);
            const top = parseFloat(this.popup.style.top);
            if (Number.isFinite(left) && Number.isFinite(top)) {
                this._savePosition(left, top);
            }
        };

        this.dragHandle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            onPointerDown(e.clientX, e.clientY, e.target);
        });

        document.addEventListener('mousemove', (e) => {
            onPointerMove(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', onPointerUp);

        this.dragHandle.addEventListener(
            'touchstart',
            (e) => {
                if (e.touches.length !== 1) return;
                const t = e.touches[0];
                onPointerDown(t.clientX, t.clientY, e.target);
            },
            { passive: true }
        );

        document.addEventListener(
            'touchmove',
            (e) => {
                if (!this._drag || e.touches.length !== 1) return;
                const t = e.touches[0];
                onPointerMove(t.clientX, t.clientY);
            },
            { passive: true }
        );

        document.addEventListener('touchend', onPointerUp);
        document.addEventListener('touchcancel', onPointerUp);
    }

    showError(message) {
        this.titleEl.textContent = 'Pathfinding failed';
        this.upcsEl.textContent = '';
        this.stepsEl.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'path-step-error';
        li.textContent = message;
        this.stepsEl.appendChild(li);
        this._open();
    }

    showSuccess(pickwalk, result, startPoint, endPoint) {
        this.titleEl.textContent = 'Pick path';
        const requested = pickwalk.itemList.map((i) => i.upc).join(', ');
        this.upcsEl.textContent = `UPCs: ${requested}`;

        this.stepsEl.innerHTML = '';
        this._appendStep(
            'path-step-start',
            'Start',
            this._startLabel(pickwalk, startPoint)
        );

        let stepIndex = 0;
        for (const entry of result) {
            if (entry.type === 'return') continue;
            stepIndex += 1;
            if (entry.unreachable) {
                this._appendStep(
                    'path-step-unreachable',
                    `Pick ${stepIndex} (unreachable)`,
                    `${entry.upc} — ${entry.item_name || 'Unknown'} — no shelf location`
                );
                continue;
            }
            const dist =
                entry.distance_from_previous != null
                    ? ` (+${entry.distance_from_previous} steps)`
                    : '';
            this._appendStep(
                'path-step-pick',
                `Pick ${stepIndex}`,
                `${entry.upc} — ${entry.item_name || 'Unknown'} — shelf ${entry.shelf || '?'} @ ${formatCoord(entry.location)}${dist}`
            );
        }

        const returnEntry = result.find((e) => e.type === 'return');
        const endCoord = returnEntry?.location ?? endPoint ?? startPoint;
        const endDist = returnEntry?.distance_from_previous;
        const endSuffix =
            endDist != null ? ` (+${endDist} steps from last pick)` : '';
        this._appendStep(
            'path-step-end',
            'End',
            `${formatCoord(endCoord)}${endSuffix}`
        );

        this._open();
    }

    _startLabel(pickwalk, startPoint) {
        const id = pickwalk.starting_point?.id;
        const coord = formatCoord(startPoint);
        return id ? `${id} @ ${coord}` : coord;
    }

    _appendStep(className, title, detail) {
        const li = document.createElement('li');
        li.className = className;
        const strong = document.createElement('strong');
        strong.textContent = `${title}: `;
        li.appendChild(strong);
        li.appendChild(document.createTextNode(detail));
        this.stepsEl.appendChild(li);
    }
}
