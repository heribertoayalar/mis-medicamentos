const app = {
    state: {
        treatments: [], // Cargaremos desde Firebase
        currentTreatmentId: null,
        currentMedId: null,
        activeAlarm: null,
        audioContext: null,
        audioOscillator: null,
        currentPhoto: null,
        isEditingMed: false,
        isEditingTreatment: false,
        wakeLock: null,
        heartbeatInterval: null,
        silentPlayer: null,
        isAudioUnlocked: false,
        db: null // Referencia a Firebase
    },

    init: () => {
        try {
            app.initFirebase();
            app.startAlarmEngine();
            app.requestWakeLock();
            app.setupSilentHeartbeat();

            if ("Notification" in window) {
                Notification.requestPermission();
            }
            console.log('Mis Medicamentos v3.2 - Cloud Sync Ready');
        } catch (e) {
            console.error('Error durante init:', e);
            alert('Error al iniciar la app: ' + e.message);
        }
    },

    setupSilentHeartbeat: () => {
        const pill = document.getElementById('alarm-status-pill');
        const text = document.getElementById('alarm-status-text');

        const updatePill = (active) => {
            if (pill && text) {
                if (active) {
                    pill.classList.replace('bg-red-100', 'bg-green-100');
                    pill.classList.replace('text-red-700', 'text-green-700');
                    text.innerText = "Activo";
                    app.state.isAudioUnlocked = true;
                } else {
                    pill.classList.replace('bg-green-100', 'bg-red-100');
                    pill.classList.replace('text-green-700', 'text-red-700');
                    text.innerText = "Inactivo";
                }
            }
        };

        const startHeartbeat = () => {
            if (app.state.isAudioUnlocked) return;

            if (!app.state.audioContext) {
                app.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            app.state.audioContext.resume();

            const ctx = app.state.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();

            updatePill(true);
            document.removeEventListener('click', startHeartbeat);
            document.removeEventListener('touchstart', startHeartbeat);
        };

        document.addEventListener('click', startHeartbeat);
        document.addEventListener('touchstart', startHeartbeat);
    },

    requestWakeLock: async () => {
        if ('wakeLock' in navigator) {
            try {
                app.state.wakeLock = await navigator.wakeLock.request('screen');
                document.addEventListener('visibilitychange', async () => {
                    if (app.state.wakeLock !== null && document.visibilityState === 'visible') {
                        app.state.wakeLock = await navigator.wakeLock.request('screen');
                    }
                });
            } catch (err) { }
        }
    },

    initFirebase: () => {
        if (typeof firebase === 'undefined') {
            return alert('Error: Los scripts de Firebase no se cargaron. Revisa tu internet.');
        }

        const firebaseConfig = {
            apiKey: "AIzaSyA_eekbCWWvnQl0-_FrPWHUV_8S7SrRIJs",
            authDomain: "mis-medicamentos-77281.firebaseapp.com",
            projectId: "mis-medicamentos-77281",
            storageBucket: "mis-medicamentos-77281.firebasestorage.app",
            messagingSenderId: "866453193922",
            appId: "1:866453193922:web:30198a87431421ec99e75b",
            databaseURL: "https://mis-medicamentos-77281-default-rtdb.firebaseio.com"
        };

        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            app.state.db = firebase.database();

            // Verificar conexión
            app.state.db.ref(".info/connected").on("value", (snap) => {
                const statusDot = document.getElementById('sync-status-dot');
                if (statusDot) {
                    if (snap.val() === true) {
                        statusDot.classList.replace('bg-slate-300', 'bg-green-500');
                        statusDot.classList.replace('bg-red-500', 'bg-green-500');
                        console.log('Firebase: Conectado');
                    } else {
                        statusDot.classList.replace('bg-green-500', 'bg-red-500');
                        console.warn('Firebase: Desconectado');
                    }
                }
            });

            const familyId = localStorage.getItem('zenmeds_family_id') || "familia_default";
            app.state.db.ref('families/' + familyId).on('value', (snapshot) => {
                const data = snapshot.val();
                if (data && data.treatments) {
                    app.state.treatments = data.treatments;
                    console.log('Sincronización: Datos recibidos');
                } else if (data === null) {
                    // Si Firebase está vacío, intentar migrar local
                    const localData = JSON.parse(localStorage.getItem('zenmeds_treatments'));
                    if (localData && localData.length > 0) {
                        console.log('Migración: Subiendo datos a la nube por primera vez');
                        app.state.treatments = localData;
                        app.saveToStorage();
                    }
                }
                app.renderHome();
            }, (error) => {
                console.error("Error Firebase:", error);
                alert("Error de Firebase (Posiblemente Reglas): " + error.message);
            });
        } catch (e) {
            console.error('Error Firebase:', e);
        }
    },

    saveToStorage: () => {
        if (!app.state.db) return console.warn('Base de datos no inicializada');
        const familyId = localStorage.getItem('zenmeds_family_id') || "familia_default";

        // Guardado local de respaldo inmediato
        localStorage.setItem('zenmeds_treatments', JSON.stringify(app.state.treatments));

        app.state.db.ref('families/' + familyId).set({
            treatments: app.state.treatments,
            lastUpdate: Date.now()
        }).then(() => {
            console.log('Éxito: Datos en la nube');
            app.renderDashboard();
        }).catch(err => {
            console.error('Fallo al guardar nube:', err);
            alert('¡ALERTA! No se pudo guardar en la nube. Tus datos se guardaron solo en este móvil por ahora. Error: ' + err.message);
        });
    },

    showScreen: (screenId) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(screenId).classList.remove('hidden');

        if (screenId === 'screen-home') app.renderHome();
    },

    renderHome: () => {
        app.renderDashboard();
        app.renderTreatments();
    },

    // --- DASHBOARD ---
    getNextDoses: () => {
        const nextDoses = [];
        const now = new Date();
        const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        app.state.treatments.forEach(t => {
            if (t.meds) {
                t.meds.forEach(m => {
                    const start = new Date(`${m.startDate}T${m.startTime}`);
                    const end = new Date(`${m.endDate}T23:59:59`);
                    const freq = parseInt(m.frequency) || 4;
                    const total = Math.floor(((end - start) / (1000 * 60 * 60)) / freq) + 1;

                    for (let i = 0; i < total; i++) {
                        const doseTime = new Date(start.getTime() + (i * freq * 60 * 60 * 1000));
                        if (doseTime > now && doseTime < limit && !(m.dosesTaken || []).includes(i)) {
                            nextDoses.push({
                                treatmentId: t.id,
                                medId: m.id,
                                medName: m.name,
                                dose: m.dose,
                                time: doseTime,
                                index: i,
                                photo: m.photo
                            });
                        }
                    }
                });
            }
        });

        return nextDoses.sort((a, b) => a.time - b.time).slice(0, 4);
    },

    renderDashboard: () => {
        const container = document.getElementById('next-doses-container');
        if (!container) return;
        const next = app.getNextDoses();

        if (next.length === 0) {
            container.innerHTML = `<p class="col-span-2 text-center text-slate-400 py-8 italic bg-white dark:bg-slate-800 rounded-xl ios-shadow border border-primary/5">No hay tomas pendientes pronto.</p>`;
            return;
        }

        container.innerHTML = next.map(d => {
            const timeStr = d.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <button onclick="app.quickConfirm(${d.treatmentId}, ${d.medId}, ${d.index})" 
                    class="flex flex-col items-center justify-center gap-3 rounded-2xl bg-brick-red/5 border-2 border-brick-red p-6 transition-all active:scale-95 text-center">
                    <span class="material-symbols-outlined text-brick-red text-4xl">schedule</span>
                    <div>
                        <p class="text-2xl font-bold text-brick-red">${timeStr}</p>
                        <p class="text-xs font-bold text-slate-800 truncate w-full">${d.medName}</p>
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-brick-red/70 mt-1">Pendiente</p>
                    </div>
                </button>
            `;
        }).join('');
    },

    quickConfirm: (tId, mId, index) => {
        if (confirm('¿Confirmar que ya tomaste este medicamento?')) {
            const t = app.state.treatments.find(x => x.id === tId);
            const m = t?.meds?.find(x => x.id === mId);
            if (m) {
                if (!m.dosesTaken) m.dosesTaken = [];
                if (!m.dosesTaken.includes(index)) {
                    m.dosesTaken.push(index);
                    app.saveToStorage();
                    app.renderHome();
                }
            }
        }
    },

    // --- TRATAMIENTOS ---
    saveTreatment: () => {
        try {
            const nameEl = document.getElementById('treatment-name');
            const notesEl = document.getElementById('treatment-notes');
            if (!nameEl) return;

            const name = nameEl.value.trim();
            const notes = notesEl.value.trim();

            if (!name) return alert('Por favor, ponle un nombre al tratamiento.');

            if (app.state.currentTreatmentId && app.state.isEditingTreatment) {
                const t = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
                if (t) {
                    t.name = name;
                    t.notes = notes;
                }
                app.state.isEditingTreatment = false;
            } else {
                const newTreatment = { id: Date.now(), name, notes, meds: [] };
                app.state.treatments.push(newTreatment);
            }

            app.saveToStorage();
            app.showScreen('screen-home');
            nameEl.value = '';
            notesEl.value = '';
        } catch (e) {
            alert('Error al guardar tratamiento: ' + e.message);
        }
    },

    renderTreatments: () => {
        const list = document.getElementById('treatments-list');
        if (app.state.treatments.length === 0) {
            list.innerHTML = `<div class="p-8 text-center bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-primary/20"><p class="text-slate-400">Aún no has creado tratamientos.</p></div>`;
            return;
        }

        list.innerHTML = app.state.treatments.map(t => {
            const medCount = t.meds ? t.meds.length : 0;
            return `
                <div class="bg-white dark:bg-slate-800 rounded-xl ios-shadow overflow-hidden border border-primary/5 transition-transform active:scale-[0.98]" onclick="app.viewTreatment(${t.id})">
                    <div class="p-6">
                        <div class="flex justify-between items-start mb-3">
                            <h2 class="text-2xl font-bold text-slate-900 dark:text-white leading-tight">${t.name}</h2>
                            <span class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Activo</span>
                        </div>
                        <div class="space-y-3">
                            <div class="flex items-center gap-2 text-primary font-medium">
                                <span class="material-symbols-outlined text-xl">pill</span>
                                <p class="text-lg">${medCount} Medicamentos</p>
                            </div>
                            <div class="bg-primary/5 p-4 rounded-lg border-l-4 border-primary">
                                <p class="text-slate-700 dark:text-slate-300 text-sm italic truncate">${t.notes || 'Sin notas'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
        document.getElementById('screen-add-treatment-title').innerText = "Editar Tratamiento";
        document.getElementById('treatment-name').value = treatment.name;
        document.getElementById('treatment-notes').value = treatment.notes || '';
        app.showScreen('screen-add-treatment');
    },

    deleteTreatmentPrompt: () => {
        if (confirm('¿Eliminar tratamiento y todas sus medicinas?')) {
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
        const nextNum = (treatment.meds?.length || 0) + 1;
        document.getElementById('modal-med-title').innerText = "Cargar Medicamento";
        document.getElementById('med-number').value = `Medicamento #${nextNum}`;

        ['med-name', 'med-start-date', 'med-end-date', 'med-frequency', 'med-start-time', 'med-dose'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('modal-add-med').classList.remove('hidden');
    },

    hideAddMedModal: () => document.getElementById('modal-add-med').classList.add('hidden'),

    handlePhotoUpload: (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                app.state.currentPhoto = canvas.toDataURL('image/jpeg', 0.7);
                const preview = document.getElementById('med-photo-preview');
                preview.innerHTML = `<img src="${app.state.currentPhoto}" class="w-full h-full object-cover rounded-xl" alt="Vista previa">`;
                preview.classList.remove('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    saveMedication: () => {
        try {
            const name = document.getElementById('med-name').value.trim();
            const startDate = document.getElementById('med-start-date').value;
            const endDate = document.getElementById('med-end-date').value;
            const freq = parseInt(document.getElementById('med-frequency').value);
            const startTime = document.getElementById('med-start-time').value;
            const dose = document.getElementById('med-dose').value.trim();
            const sound = document.getElementById('med-sound').value;

            if (!name || !startDate || !endDate || isNaN(freq) || !startTime || !dose) return alert('Completa todos los campos.');

            const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
            if (!treatment.meds) treatment.meds = [];

            if (app.state.isEditingMed) {
                const med = treatment.meds.find(m => m.id === app.state.currentMedId);
                if (med) {
                    Object.assign(med, { name, startDate, endDate, frequency: freq, startTime, dose, sound });
                    if (app.state.currentPhoto) med.photo = app.state.currentPhoto;
                }
                app.state.isEditingMed = false;
            } else {
                treatment.meds.push({
                    id: Date.now(), number: treatment.meds.length + 1,
                    name, startDate, endDate, frequency: freq, startTime, dose, sound,
                    photo: app.state.currentPhoto, dosesTaken: []
                });
            }

            app.saveToStorage();
            app.hideAddMedModal();
            app.renderMeds();
        } catch (e) { alert('Error al guardar: ' + e.message); }
    },

    renderMeds: () => {
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const list = document.getElementById('meds-list');
        if (!treatment || !treatment.meds || treatment.meds.length === 0) {
            list.innerHTML = '<p class="text-center text-slate-400 py-8">Aún no hay medicamentos aquí.</p>';
            return;
        }

        list.innerHTML = treatment.meds.map(m => {
            const start = new Date(`${m.startDate}T${m.startTime}`);
            const end = new Date(`${m.endDate}T23:59:59`);
            const freq = parseInt(m.frequency) || 4;
            const total = Math.floor(((end - start) / (1000 * 60 * 60)) / freq) + 1;
            const takenCount = (m.dosesTaken || []).length;

            return `
                <div class="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm" onclick="app.openControl(${m.id})">
                    <div class="size-14 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden">
                        ${m.photo ? `<img src="${m.photo}" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-3xl">pill</span>'}
                    </div>
                    <div class="flex-1">
                        <p class="text-lg font-bold text-slate-900 dark:text-slate-100">${m.name}</p>
                        <p class="text-base text-slate-500 dark:text-slate-400 font-medium">${m.dose} • ${takenCount}/${total}</p>
                    </div>
                    <div class="flex flex-col gap-2">
                         <button class="text-primary" onclick="app.editMedicationPrompt(${m.id}); event.stopPropagation();"><span class="material-symbols-outlined">edit</span></button>
                         <button class="text-red-400" onclick="app.deleteMedicationPrompt(${m.id}); event.stopPropagation();"><span class="material-symbols-outlined">delete</span></button>
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
            preview.innerHTML = `<img src="${med.photo}" class="w-full h-full object-cover rounded-xl" alt="Vista previa">`;
            preview.classList.remove('hidden');
        } else {
            app.state.currentPhoto = null;
            document.getElementById('med-photo-preview').classList.add('hidden');
        }
        document.getElementById('modal-add-med').classList.remove('hidden');
    },

    deleteMedicationPrompt: (medId) => {
        const id = medId || app.state.currentMedId;
        if (confirm('¿Eliminar medicamento?')) {
            const t = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
            t.meds = t.meds.filter(m => m.id !== id);
            app.saveToStorage();
            app.renderMeds();
            if (document.getElementById('screen-med-control').classList.contains('hidden') === false) app.backToDetail();
        }
    },

    // --- CONTROL E INDICADORES ---
    openControl: (medId) => {
        app.state.currentMedId = medId;
        const treatment = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const med = treatment.meds.find(m => m.id === medId);

        document.getElementById('control-med-name').innerText = med.name;
        document.getElementById('control-med-info').innerText = `${med.dose} • Cada ${med.frequency}h`;
        const container = document.getElementById('control-med-photo-container');
        if (med.photo) {
            document.getElementById('control-med-photo').src = med.photo;
            container.classList.remove('hidden');
        } else container.classList.add('hidden');

        app.renderIndicators(med);
        app.showScreen('screen-med-control');
    },

    renderIndicators: (med) => {
        const grid = document.getElementById('indicators-grid');
        const start = new Date(`${med.startDate}T${med.startTime}`);
        const end = new Date(`${med.endDate}T23:59:59`);
        const total = Math.floor(((end - start) / (1000 * 60 * 60)) / med.frequency) + 1;

        grid.innerHTML = Array.from({ length: total }).map((_, i) => {
            const doseTime = new Date(start.getTime() + (i * med.frequency * 60 * 60 * 1000));
            const isTaken = (med.dosesTaken || []).includes(i);
            const timeStr = doseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = doseTime.toLocaleDateString([], { day: '2-digit', month: 'short' });

            return `
                <button onclick="app.toggleDose(${i})" 
                    class="flex flex-col items-center justify-center gap-2 rounded-2xl p-6 transition-all ${isTaken ? 'bg-sage-green/10 border-2 border-sage-green opacity-80' : 'bg-brick-red/10 border-2 border-brick-red active:scale-95'}">
                    <span class="material-symbols-outlined ${isTaken ? 'text-sage-green' : 'text-brick-red'} text-3xl">
                        ${isTaken ? 'check_circle' : 'schedule'}
                    </span>
                    <div class="text-center">
                        <p class="text-xl font-bold ${isTaken ? 'text-sage-green' : 'text-brick-red'}">${timeStr}</p>
                        <p class="text-[10px] font-bold uppercase tracking-wider opacity-60">${dateStr}</p>
                        <p class="text-[10px] font-bold uppercase tracking-widest mt-1 ${isTaken ? 'text-sage-green' : 'text-brick-red'}">
                            ${isTaken ? 'Tomado' : 'Pendiente'}
                        </p>
                    </div>
                </button>
            `;
        }).join('');
    },

    toggleDose: (index) => {
        const t = app.state.treatments.find(t => t.id === app.state.currentTreatmentId);
        const m = t?.meds?.find(m => m.id === app.state.currentMedId);
        if (m) {
            if (!m.dosesTaken) m.dosesTaken = [];
            if (m.dosesTaken.includes(index)) m.dosesTaken = m.dosesTaken.filter(i => i !== index);
            else m.dosesTaken.push(index);
            app.saveToStorage();
            app.renderIndicators(m);
        }
    },

    // --- ALARMAS ---
    startAlarmEngine: () => {
        setInterval(() => {
            if (app.state.activeAlarm) return;
            const now = new Date();
            app.state.treatments.forEach(t => t.meds.forEach(m => app.checkMedicationAlarm(t, m, now)));
        }, 30000);
    },

    checkMedicationAlarm: (t, m, now) => {
        if (!m.startDate || !m.startTime || !m.endDate || !m.frequency) return;
        const start = new Date(`${m.startDate}T${m.startTime}`);
        const end = new Date(`${m.endDate}T23:59:59`);
        if (now < start || now > end) return;
        const total = Math.floor(((end - start) / (1000 * 60 * 60)) / m.frequency) + 1;
        for (let i = 0; i < total; i++) {
            const doseTime = new Date(start.getTime() + (i * m.frequency * 60 * 60 * 1000));
            const diffMin = (now - doseTime) / (1000 * 60);
            if (diffMin >= 0 && diffMin < 5 && !(m.dosesTaken || []).includes(i)) {
                app.triggerAlarm(t, m, i);
                break;
            }
        }
    },

    triggerAlarm: (treatment, med, doseIndex) => {
        app.state.activeAlarm = { treatment, med, doseIndex };
        document.getElementById('alarm-num').innerText = `Medicina #${med.number}`;
        document.getElementById('alarm-med-name').innerText = med.name;
        document.getElementById('alarm-med-dose').innerText = med.dose;
        document.getElementById('alarm-treatment').innerText = treatment.name;
        if (med.photo) { document.getElementById('alarm-med-photo').src = med.photo; document.getElementById('alarm-photo-container').classList.remove('hidden'); }
        else document.getElementById('alarm-photo-container').classList.add('hidden');
        document.getElementById('alarm-overlay').classList.remove('hidden');
        app.playAlarmSound(med.sound);
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`¡Alarma! ${med.name}`, { body: med.dose, icon: 'https://cdn-icons-png.flaticon.com/512/3022/3022513.png' });
        }
    },

    playAlarmSound: (type) => {
        try {
            if (!app.state.audioContext) app.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = app.state.audioContext;
            if (ctx.state === 'suspended') ctx.resume();
            app.state.audioOscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            app.state.audioOscillator.connect(gain);
            gain.connect(ctx.destination);
            switch (type) {
                case 'bell': app.state.audioOscillator.frequency.value = 880; break;
                case 'digital': app.state.audioOscillator.type = 'square'; app.state.audioOscillator.frequency.value = 440; break;
                case 'zen': app.state.audioOscillator.frequency.value = 220; break;
                default: app.state.audioOscillator.frequency.value = 440;
            }
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
            app.state.audioOscillator.start();
            app.state.soundInterval = setInterval(() => {
                gain.gain.setValueAtTime(0.5, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            }, 1000);
        } catch (e) { }
    },

    stopAlarmSilently: () => {
        if (app.state.audioOscillator) { try { app.state.audioOscillator.stop(); } catch (e) { } clearInterval(app.state.soundInterval); }
        document.getElementById('alarm-overlay').classList.add('hidden');
        setTimeout(() => app.state.activeAlarm = null, 5000);
    },

    confirmDoseFromAlarm: () => {
        if (!app.state.activeAlarm) return;
        const { med, doseIndex } = app.state.activeAlarm;
        if (!med.dosesTaken) med.dosesTaken = [];
        if (!med.dosesTaken.includes(doseIndex)) {
            med.dosesTaken.push(doseIndex);
            app.saveToStorage();
        }
        app.stopAlarmSilently();
        app.renderHome();
    },

    backToDetail: () => { app.renderMeds(); app.showScreen('screen-treatment-detail'); }
};

document.addEventListener('DOMContentLoaded', app.init);
