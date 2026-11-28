/* BOXIBY — fonctions communes (cartes, API, utilitaires) */
(() => {
'use strict';
const base = window.BASE || '';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const url = (p) => (p ? base + p : '');
const csrf = () => $('meta[name=csrf]')?.content || '';
const ar = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + ' Ar');
const initiales = (p, n) => (((p || '?')[0] || '') + ((n || '')[0] || '')).toUpperCase();

async function api(file, action, { method = 'GET', data = null, params = '' } = {}) {
    const opt = { method, credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf() } };
    if (data instanceof FormData) opt.body = data;
    else if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    const r = await fetch(`${base}api/${file}.php?action=${action}${params}`, opt);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && file !== 'client') { location.href = base + (file === 'livreur' ? '../login.php' : 'login.php'); throw new Error('Non connecté'); }
    if (!r.ok) throw new Error(j.error || 'Erreur réseau');
    return j;
}

function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3800);
}

let actx;
function beep() {
    try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.25].forEach(d => {
            const o = actx.createOscillator(), g = actx.createGain();
            o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
            g.gain.setValueAtTime(0.2, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d + 0.2);
            o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.22);
        });
        navigator.vibrate?.([200, 100, 200]);
    } catch (_) {}
}

/* ----- Localisation : messages clairs + repli multi-niveaux ----- */
function geoMessage(e) {
    if (!window.isSecureContext) return "⚠️ La localisation exige HTTPS. Ouvrez le site en https:// (ou http://localhost).";
    if (!navigator.geolocation) return "⚠️ Ce navigateur ne gère pas la localisation.";
    switch (e && e.code) {
        case 1: return "🔒 Localisation refusée. Cliquez sur l'icône 🔒 dans la barre d'adresse → Autoriser la position.";
        case 2: return "📡 Position indisponible. Activez le GPS/Wi-Fi de l'appareil.";
        case 3: return "⏱️ Délai dépassé. Réessayez près d'une fenêtre ou en plein air.";
        default: return "⚠️ Impossible d'obtenir votre position.";
    }
}

/* ===== getPosition() CORRIGÉ : timeout long + fallback multi-niveaux ===== */
function getPosition() {
    return new Promise((resolve, reject) => {
        if (!window.isSecureContext || !navigator.geolocation) return reject({ code: 0 });
        
        // Niveau 1 : GPS haute précision (timeout 20s)
        navigator.geolocation.getCurrentPosition(
            resolve,
            (e1) => {
                // Niveau 2 : basse précision (timeout 25s, accepte cache 5min)
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    (e2) => {
                        // Niveau 3 : position très approximative (timeout 30s, cache 10min)
                        navigator.geolocation.getCurrentPosition(
                            resolve,
                            (e3) => {
                                // Niveau 4 : fallback IP via API externe
                                fetch('https://ipapi.co/json/')
                                    .then(r => r.json())
                                    .then(ip => {
                                        if (ip.latitude && ip.longitude) {
                                            resolve({
                                                coords: {
                                                    latitude: ip.latitude,
                                                    longitude: ip.longitude,
                                                    accuracy: 5000, // ~5km
                                                    approx: true
                                                },
                                                timestamp: Date.now()
                                            });
                                        } else {
                                            reject(e3);
                                        }
                                    })
                                    .catch(() => reject(e3));
                            },
                            { enableHighAccuracy: false, timeout: 30000, maximumAge: 600000 }
                        );
                    },
                    { enableHighAccuracy: false, timeout: 25000, maximumAge: 300000 }
                );
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    });
}

const ago = (s) => (s < 90 ? "à l'instant" : s < 3600 ? `il y a ${Math.round(s / 60)} min` : s < 86400 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`);

/* ----- Paiement Mobile Money : lance le code USSD depuis le compte du client.
   Dans l'application Android (BOXIBY), c'est le pont natif BoxibyAndroid.dialUSSD() qui compose le code.
   Dans un navigateur, repli sur tel: (le # est encodé %23). ----- */
function lancerUSSD(code) {
    if (window.BoxibyAndroid && typeof window.BoxibyAndroid.dialUSSD === 'function') {
        window.BoxibyAndroid.dialUSSD(code);
        return;
    }
    window.location.href = 'tel:' + encodeURIComponent(code);
}

/* Montant total d'une commande (course + articles + options). */
function totalCommande(c) {
    return (c ? ((+(c.prix_final ?? c.prix_calcule) || 0) + (+c.montant_articles || 0) + (+c.montant_options || 0)) : 0);
}

/* ----- Thème ----- */
function syncLogoTheme() {
    const logo = document.getElementById('site-logo');
    if (!logo) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    const nextSrc = isDark
        ? logo.getAttribute('data-logo-dark')
        : logo.getAttribute('data-logo-light');
    if (nextSrc && logo.getAttribute('src') !== nextSrc) {
        logo.setAttribute('src', nextSrc);
    }
}

/* ----- Thème ----- */
function initTheme(button, onChange) {
    syncLogoTheme();
    button?.addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme !== 'dark';
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        try { localStorage.setItem('bx-theme', dark ? 'dark' : 'light'); } catch (_) {}
        syncLogoTheme();
        onChange?.(dark);
    });
}

/* ----- Carte Analamanga : Plan (OSM) + Satellite (Esri) ----- */
const ANALAMANGA = L.latLngBounds([-19.40, 46.80], [-18.40, 48.20]);

function makeMap(id, { contour = true, bounded = true, locate = true } = {}) {
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, className: 'tiles-osm', attribution: '© contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Tiles © Esri — Source : Esri, Maxar, Earthstar Geographics'
    });
    const map = L.map(id, { layers: [osm], minZoom: 8, ...(bounded ? { maxBounds: ANALAMANGA.pad(1.2), maxBoundsViscosity: 0.6 } : {}) });
    map.fitBounds(ANALAMANGA);
    L.control.layers({ 'Carte Plan': osm, 'Carte Satellite': esri }, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    
    if (locate) {
        const Locate = L.Control.extend({
            options: { position: 'topleft' },
            onAdd() {
                const b = L.DomUtil.create('button', 'locate-btn');
                b.type = 'button'; b.title = 'Me localiser'; b.setAttribute('aria-label', 'Me localiser'); b.textContent = '◎';
                L.DomEvent.disableClickPropagation(b);
                b.onclick = async () => {
                    b.classList.add('busy');
                    b.textContent = '⏳';
                    try {
                        const p = await getPosition();
                        const ll = [p.coords.latitude, p.coords.longitude];
                        const isApprox = p.coords.approx === true;
                        
                        if (map._me) map._me.setLatLng(ll);
                        else map._me = L.circleMarker(ll, {
                            radius: isApprox ? 12 : 8,
                            color: isApprox ? '#BC5719' : '#fff',
                            weight: 3,
                            fillColor: isApprox ? '#BC5719' : '#2a7de1',
                            fillOpacity: 1
                        }).addTo(map);
                        
                        map.flyTo(ll, isApprox ? 12 : 16);
                        
                        if (isApprox) {
                            toast('📍 Position approximative (Wi-Fi/IP). Pour plus de précision, activez le GPS.');
                        } else {
                            toast(`📍 Position trouvée (±${Math.round(p.coords.accuracy)} m)`);
                        }
                    } catch (e) {
                        toast(geoMessage(e));
                    }
                    b.classList.remove('busy');
                    b.textContent = '◎';
                };
                return b;
            }
        });
        new Locate().addTo(map);
    }
    
    if (contour) {
        fetch('https://nominatim.openstreetmap.org/search?q=Analamanga&countrycodes=mg&format=jsonv2&polygon_geojson=1&limit=3')
            .then(r => r.json()).then(list => {
                const hit = list.find(x => x.geojson && /Polygon/.test(x.geojson.type));
                if (hit) L.geoJSON(hit.geojson, { style: { color: '#BC5719', weight: 2.5, dashArray: '8 6', fill: false }, interactive: false }).addTo(map);
            }).catch(() => {});
    }
    return map;
}

function pin(label, cls = '', photo = '') {
    return L.divIcon({
        className: '', iconSize: [38, 38], iconAnchor: [19, 19],
        html: `<div class="pin ${cls}">${photo ? `<img src="${esc(url(photo))}" alt="">` : esc(label)}</div>`
    });
}

/** Itinéraire routier (OSRM). Retourne [[lat,lng],…] ou null. */
async function route(a, b) {
    try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`);
        const j = await r.json();
        return j.routes?.[0]?.geometry.coordinates.map(([x, y]) => [y, x]) || null;
    } catch (_) { return null; }
}

/** ===== watchPosition() CORRIGÉ : getCurrentPosition initial + watch ===== */
function watchPosition(cb, onError) {
    if (!navigator.geolocation) { onError?.({ code: 0 }); return () => {}; }
    if (!window.isSecureContext) { onError?.({ code: 0 }); return () => {}; }
    
    // ÉTAPE 1 : obtenir une position initiale immédiatement
    navigator.geolocation.getCurrentPosition(
        (p) => {
            cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        },
        (e) => {
            // Si échec, on tente quand même le watchPosition
            console.warn('getCurrentPosition initial échoué, tentative watchPosition', e);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
    
    // ÉTAPE 2 : surveillance continue
    const id = navigator.geolocation.watchPosition(
        p => cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        e => onError?.(e),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
}

/** Déplace un marqueur existant ou le crée. */
function upsert(store, key, latlng, makeIcon, layer, popup, variant = '') {
    let m = store[key];
    if (m) { m.setLatLng(latlng); if (popup) m.setPopupContent(popup); if (m._variant !== variant) { m.setIcon(makeIcon()); m._variant = variant; } }
    else { m = store[key] = L.marker(latlng, { icon: makeIcon() }).addTo(layer); m._variant = variant; if (popup) m.bindPopup(popup); }
    return m;
}

function prune(store, keepKeys) {
    Object.keys(store).forEach(k => { if (!keepKeys.has(k)) { store[k].remove(); delete store[k]; } });
}

window.BXC = { $, $$, esc, url, ar, initiales, api, toast, beep, initTheme, makeMap, pin, route, watchPosition, upsert, prune, ANALAMANGA, geoMessage, getPosition, ago, lancerUSSD, totalCommande };

/* PWA : rend le site installable (icône sur l'écran d'accueil Android + iPhone). */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register((window.BASE || '') + 'sw.js').catch(() => {}));
}

/* Écran de démarrage (splash) : logo + chargement, comme à l'ouverture d'une application. */
const splash = $('#splash');
if (splash) {
    let ferme = false;
    const fermer = () => { if (ferme) return; ferme = true; splash.classList.add('off'); setTimeout(() => splash.remove(), 500); };
    window.addEventListener('load', () => setTimeout(fermer, 900));
    setTimeout(fermer, 3500);
}
})();