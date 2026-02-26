const app = {
    state: {
        treatments: JSON.parse(localStorage.getItem('zenmeds_treatments')) || [],
        currentTreatmentId: null,
        currentMedId: null,
        activeAlarm: null, // Guardamos la info de la toma que está sonando
        audioContext: null,
        audioOscillator: null,
        currentPhoto: null, // Guardamos temporalmente la foto cargada
        isEditingMed: false
    },

    init: () => {
        app.renderTreatments();
        app.startAlarmEngine();
        console.log('Mis Medicamentos Iniciado Core');
    },

    saveToStorage: () => {
        localStorage.setItem('zenmeds_treatments', JSON.stringify(app.state.treatments));
    },

    showScreen: (screenId) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(screenId).classList.remove('hidden');

        if (screenId === 'screen-home') app.renderTreatments();
    },

    // --- TRATAMIENTOS ---
    saveTreatment: () => {
        const name = document.getElementById('treatment-name').value.trim();
        const notes = document.getElementById('treatment-notes').value.trim();

        if (!name) return alert('Por favor, ponle un nombre al tratamiento.');

        if (app.state.currentTreatmentId && app.state.isEditingTreatment) {
            // Editar existente
            const t = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
            t.name = name;
            t.notes = notes;
            app.state.isEditingTreatment = false;
        } else {
            // Nuevo
            const newTreatment = {
                id: Date.now(),
                name: name,
                notes: notes,
                meds: []
            };
            app.state.treatments.push(newTreatment);
        }

        app.saveToStorage();
        app.showScreen('screen-home');
    },

    renderTreatments: () => {
        const list = document.getElementById('treatments-list');
        if (app.state.treatments.length === 0) {
            list.innerHTML = `
                <div class="card" style="text-align:center; color: var(--text-muted);">
                    <p>No tienes tratamientos activos.</p>
                    <p>¡Toca el botón de abajo para empezar!</p>
                </div>`;
            return;
        }

        list.innerHTML = app.state.treatments.map(t => `
            <div class="treatment-card animate-fade" onclick="app.viewTreatment(${t.id})">
                <div class="treatment-info">
                    <h3>${t.name}</h3>
                    <p class="subtitle" style="color: var(--text-muted)">${t.meds.length} medicamentos cargados</p>
                </div>
                <div class="icon" style="font-size: 1.5rem">➡️</div>
            </div>
        `).join('');
    },

    viewTreatment: (id) => {
        app.state.currentTreatmentId = id;
        const treatment = app.state.treatments.find(t => t.id === id);

        document.getElementById('detail-title').innerText = treatment.name;
        document.getElementById('detail-notes').innerText = treatment.notes || '';
        app.renderMeds();
        app.showScreen('screen-treatment-detail');
    },

    editTreatmentPrompt: () => {
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        app.state.isEditingTreatment = true;

        document.getElementById('treatment-name').value = treatment.name;
        document.getElementById('treatment-notes').value = treatment.notes || '';
        app.showScreen('screen-add-treatment');
    },

    deleteTreatmentPrompt: () => {
        if (confirm('¿Estás seguro de eliminar todo este tratamiento? Se borrarán todos sus medicamentos.')) {
            app.state.treatments = app.state.treatments.filter(t => t.id !== app.state.currentTreatmentId);
            app.saveToStorage();
            app.showScreen('screen-home');
        }
    },

    // --- MEDICAMENTOS ---
    showAddMedModal: () => {
        app.state.isEditingMed = false;
        app.state.currentPhoto = null;
        document.getElementById('med-photo-preview').innerHTML = '';
        document.getElementById('med-photo-preview').classList.add('hidden');

        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const nextNum = (treatment.meds.length + 1);

        document.getElementById('modal-med-title').innerText = "Cargar Medicamento";
        document.getElementById('med-number').value = `Medicamento #${nextNum}`;

        // Limpiar campos
        ['med-name', 'med-start-date', 'med-end-date', 'med-frequency', 'med-start-time', 'med-dose'].forEach(id => {
            document.getElementById(id).value = '';
        });

        document.getElementById('modal-add-med').classList.remove('hidden');
    },

    hideAddMedModal: () => {
        document.getElementById('modal-add-med').classList.add('hidden');
    },

    handlePhotoUpload: (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            app.state.currentPhoto = e.target.result;
            const preview = document.getElementById('med-photo-preview');
            preview.innerHTML = `<img src="${app.state.currentPhoto}" alt="Vista previa">`;
            preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    },

    saveMedication: () => {
        const name = document.getElementById('med-name').value.trim();
        const startDate = document.getElementById('med-start-date').value;
        const endDate = document.getElementById('med-end-date').value;
        const freq = parseInt(document.getElementById('med-frequency').value);
        const startTime = document.getElementById('med-start-time').value;
        const dose = document.getElementById('med-dose').value.trim();
        const sound = document.getElementById('med-sound').value;

        if (!name || !startDate || !endDate || isNaN(freq) || !startTime) {
            return alert('Completa todos los datos del medicamento.');
        }

        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);

        if (app.state.isEditingMed) {
            const med = treatment.meds.find(m => m.id === app.state.currentMedId);
            med.name = name;
            med.startDate = startDate;
            med.endDate = endDate;
            med.frequency = freq;
            med.startTime = startTime;
            med.dose = dose;
            med.sound = sound;
            if (app.state.currentPhoto) med.photo = app.state.currentPhoto;
            app.state.isEditingMed = false;
        } else {
            const newMed = {
                id: Date.now(),
                number: treatment.meds.length + 1,
                name: name,
                startDate,
                endDate,
                frequency: freq,
                startTime,
                dose: dose,
                sound: sound,
                photo: app.state.currentPhoto,
                dosesTaken: []
            };
            treatment.meds.push(newMed);
        }

        app.saveToStorage();
        app.hideAddMedModal();
        app.renderMeds();
    },

    renderMeds: () => {
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const list = document.getElementById('meds-list');

        if (!treatment || treatment.meds.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding: 2rem; color:var(--text-muted)">Aún no hay medicamentos aquí.</p>';
            return;
        }

        list.innerHTML = treatment.meds.map(m => {
            const start = new Date(`${m.startDate}T${m.startTime}`);
            const end = new Date(`${m.endDate}T23:59:59`);
            const total = Math.floor(((end - start) / (1000 * 60 * 60)) / m.frequency) + 1;

            return `
                <div class="card shadow-premium" style="border-left: 8px solid var(--secondary); display: flex; align-items: center; gap: 1rem; cursor: pointer;">
                    ${m.photo ? `<img src="${m.photo}" style="width: 60px; height: 60px; border-radius: 12px; object-fit: cover;" onclick="app.openControl(${m.id}); event.stopPropagation();">` : ''}
                    <div style="flex: 1" onclick="app.openControl(${m.id})">
                        <p style="font-weight:800; color:var(--primary); font-size:0.8rem; margin-bottom: 0.2rem;">Medicina #${m.number}</p>
                        <h3 style="font-size: 1.3rem">${m.name}</h3>
                        <p style="font-size: 0.9rem; color: var(--text-muted)">${m.dose} | Inicio: ${m.startTime}</p>
                    </div>
                    <div style="text-align: right">
                        <div style="background:var(--primary-light); padding: 0.3rem 0.6rem; border-radius:10px; color:var(--primary); font-weight:800; font-size: 0.8rem; margin-bottom: 0.5rem;">
                            ${m.dosesTaken.length} / ${total}
                        </div>
                        <div style="display: flex; gap: 0.3rem; justify-content: flex-end;">
                            <button class="btn-icon" style="background: #f1f5f9; color: var(--text-main); font-size: 0.9rem;" onclick="app.editMedicationPrompt(${m.id}); event.stopPropagation();">✏️</button>
                            <button class="btn-icon btn-icon-danger" style="background: #fee2e2; font-size: 0.9rem;" onclick="app.deleteMedicationPrompt(${m.id}); event.stopPropagation();">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    editMedicationPrompt: (medId) => {
        app.state.currentMedId = medId;
        app.state.isEditingMed = true;
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const med = treatment.meds.find(m => m.id === medId);

        document.getElementById('modal-med-title').innerText = "Editar Medicamento";
        document.getElementById('med-number').value = `Medicamento #${med.number}`;
        document.getElementById('med-name').value = med.name;
        document.getElementById('med-start-date').value = med.startDate;
        document.getElementById('med-end-date').value = med.endDate;
        document.getElementById('med-frequency').value = med.frequency;
        document.getElementById('med-start-time').value = med.startTime;
        document.getElementById('med-dose').value = med.dose;
        document.getElementById('med-sound').value = med.sound || 'pulse';

        if (med.photo) {
            app.state.currentPhoto = med.photo;
            const preview = document.getElementById('med-photo-preview');
            preview.innerHTML = `<img src="${med.photo}" alt="Vista previa">`;
            preview.classList.remove('hidden');
        } else {
            app.state.currentPhoto = null;
            document.getElementById('med-photo-preview').classList.add('hidden');
        }

        document.getElementById('modal-add-med').classList.remove('hidden');
    },

    deleteMedicationPrompt: (medId) => {
        const idToDelete = medId || app.state.currentMedId;
        if (confirm('¿Eliminar este medicamento?')) {
            const t = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
            t.meds = t.meds.filter(m => m.id !== idToDelete);
            app.saveToStorage();
            app.backToDetail();
        }
    },

    // --- CONTROL E INDICADORES ---
    openControl: (medId) => {
        app.state.currentMedId = medId;
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const med = treatment.meds.find(m => m.id === medId);

        document.getElementById('control-med-name').innerText = `Medicina #${med.number}: ${med.name}`;
        document.getElementById('control-med-info').innerText = `${med.dose} | Cada ${med.frequency}h | Inicia: ${med.startTime}`;

        const photoContainer = document.getElementById('control-med-photo-container');
        if (med.photo) {
            document.getElementById('control-med-photo').src = med.photo;
            photoContainer.classList.remove('hidden');
        } else {
            photoContainer.classList.add('hidden');
        }

        app.renderIndicators(med);
        app.showScreen('screen-med-control');
    },

    renderIndicators: (med) => {
        const grid = document.getElementById('indicators-grid');
        const start = new Date(`${med.startDate}T${med.startTime}`);
        const end = new Date(`${med.endDate}T23:59:59`);
        const total = Math.floor(((end - start) / (1000 * 60 * 60)) / med.frequency) + 1;

        let html = '';
        for (let i = 0; i < total; i++) {
            const doseTime = new Date(start.getTime() + (i * med.frequency * 60 * 60 * 1000));
            const isTaken = med.dosesTaken.includes(i);
            const statusClass = isTaken ? 'taken' : 'pending';

            html += `
                <div class="indicator ${statusClass}" onclick="app.toggleDose(${i})">
                    ${isTaken ? '✓' : `<b>${doseTime.getHours()}:${doseTime.getMinutes().toString().padStart(2, '0')}</b>`}
                </div>`;
        }
        grid.innerHTML = html;
    },

    toggleDose: (index) => {
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const med = treatment.meds.find(m => m.id === app.state.currentMedId);

        if (med.dosesTaken.includes(index)) {
            med.dosesTaken = med.dosesTaken.filter(i => i !== index);
        } else {
            med.dosesTaken.push(index);
        }

        app.saveToStorage();
        app.renderIndicators(med);
    },

    // --- MOTOR DE ALARMAS ---
    startAlarmEngine: () => {
        setInterval(() => {
            const now = new Date();
            // Solo chequeamos si no hay una alarma sonando ya
            if (app.state.activeAlarm) return;

            app.state.treatments.forEach(t => {
                t.meds.forEach(m => {
                    app.checkMedicationAlarm(t, m, now);
                });
            });
        }, 30000); // Chequear cada 30 segundos
    },

    checkMedicationAlarm: (treatment, med, now) => {
        const start = new Date(`${med.startDate}T${med.startTime}`);
        const end = new Date(`${med.endDate}T23:59:59`);

        if (now < start || now > end) return;

        const total = Math.floor(((end - start) / (1000 * 60 * 60)) / med.frequency) + 1;

        for (let i = 0; i < total; i++) {
            const doseTime = new Date(start.getTime() + (i * med.frequency * 60 * 60 * 1000));
            const diffMin = (now - doseTime) / (1000 * 60);

            // Si estamos en el rango de 2 minutos de la toma Y no ha sido tomada
            if (diffMin >= 0 && diffMin < 2 && !med.dosesTaken.includes(i)) {
                app.triggerAlarm(treatment, med, i);
                break;
            }
        }
    },

    triggerAlarm: (treatment, med, doseIndex) => {
        app.state.activeAlarm = { treatment, med, doseIndex };

        document.getElementById('alarm-num').innerText = `Medicina #${med.number}`;
        document.getElementById('alarm-med-name').innerText = med.name;
        document.getElementById('alarm-med-dose').innerText = `Dosis: ${med.dose}`;
        document.getElementById('alarm-treatment').innerText = `Tratamiento: ${treatment.name}`;

        const photoContainer = document.getElementById('alarm-photo-container');
        if (med.photo) {
            document.getElementById('alarm-med-photo').src = med.photo;
            photoContainer.classList.remove('hidden');
        } else {
            photoContainer.classList.add('hidden');
        }

        document.getElementById('alarm-overlay').classList.remove('hidden');
        app.playAlarmSound(med.sound);

        // Vibración si está disponible
        if ("vibrate" in navigator) navigator.vibrate([500, 200, 500]);
    },

    playAlarmSound: (type) => {
        if (!app.state.audioContext) app.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const ctx = app.state.audioContext;
        app.state.audioOscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        app.state.audioOscillator.connect(gain);
        gain.connect(ctx.destination);

        // Selección de Tono
        switch (type) {
            case 'bell':
                app.state.audioOscillator.type = 'triangle';
                app.state.audioOscillator.frequency.setValueAtTime(880, ctx.currentTime);
                break;
            case 'digital':
                app.state.audioOscillator.type = 'square';
                app.state.audioOscillator.frequency.setValueAtTime(440, ctx.currentTime);
                break;
            case 'zen':
                app.state.audioOscillator.type = 'sine';
                app.state.audioOscillator.frequency.setValueAtTime(220, ctx.currentTime);
                break;
            default: // pulse
                app.state.audioOscillator.type = 'sine';
                app.state.audioOscillator.frequency.setValueAtTime(440, ctx.currentTime);
        }

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);

        app.state.audioOscillator.start();

        // Efecto de pulso
        app.state.soundInterval = setInterval(() => {
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        }, 1000);
    },

    stopAlarmSilently: () => {
        if (app.state.audioOscillator) {
            try { app.state.audioOscillator.stop(); } catch (e) { }
            clearInterval(app.state.soundInterval);
        }
        document.getElementById('alarm-overlay').classList.add('hidden');

        // "Posponer" simplemente limpia la alarma activa por esta vuelta
        setTimeout(() => { app.state.activeAlarm = null; }, 5000);
    },

    confirmDoseFromAlarm: () => {
        const { med, doseIndex } = app.state.activeAlarm;

        if (!med.dosesTaken.includes(doseIndex)) {
            med.dosesTaken.push(doseIndex);
            app.saveToStorage();
        }

        app.stopAlarmSilently();
        app.state.activeAlarm = null;
        app.renderTreatments();
        console.log('Dosis confirmada desde alarma');
    },

    backToDetail: () => {
        app.renderMeds();
        app.showScreen('screen-treatment-detail');
    }
};

document.addEventListener('DOMContentLoaded', app.init);
