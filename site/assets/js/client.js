/* BOXIBY — Site client en 5 étapes */
(() => {
'use strict';
const { $, $$, esc, url, ar, api, toast, initTheme, makeMap, pin, getPosition, geoMessage, lancerUSSD } = BXC;
initTheme($('#btn-theme'));
$('#btn-me')?.addEventListener('click', (e) => { e.stopPropagation(); const m = $('#menu-me'); m.hidden = !m.hidden; });
document.addEventListener('click', () => { const m = $('#menu-me'); if (m) m.hidden = true; });
const form = $('#f-order');
const F = form.elements;
let svc = 'colis', target = 'depart', step = 1;
const mk = {};

function go(n) {
    step = Math.min(5, Math.max(1, n));
    $$('#f-order [data-step]').forEach(s => { const on = +s.dataset.step === step; s.hidden = !on; });
    $$('#steps-bar li').forEach(li => {
        const k = +li.dataset.dot;
        li.classList.toggle('now', k === step);
        li.classList.toggle('done', k < step);
    });
    if (step === 5) buildRecap();
    if (step === 3) setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showErr(sel, msg) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) { if (msg) toast(msg); return; }
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg; el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function validStep(n) {
    if (n === 1) {
        if (svc === 'achat') {
            const autre = $('#cat').value === 'autre', t = curType();
            if (!$('#cat').value) { toast("Choisissez une catégorie d'achat."); return false; }
            if (autre && !$('#fournisseur').value.trim()) { toast('Indiquez le nom du fournisseur.'); $('#fournisseur').focus(); return false; }
            if (t && t.code === 'pharmacie' && !$('#details').value.trim()) { toast('Indiquez les médicaments à livrer (obligatoire).'); $('#details').focus(); return false; }
            const catalogActif = !$('#catalog').hidden;
            if (catalogActif && !cart.size && !$('#details').value.trim() && $('#rx').hidden) { toast('Choisissez au moins un article ou ajoutez une remarque.'); return false; }
        }
        return true;
    }
    if (n === 2) {
        const needDate = svc === 'achat' || (svc === 'colis' && F.mode.value === 'planifiee');
        if (needDate) {
            if (!$('#date').value) { showErr('#err2', 'Choisissez la date souhaitée.'); return false; }
            if ($('#date').value < $('#date').min) { showErr('#err2', 'La date ne peut pas être dans le') ; return false; }
        }
        showErr('#err2', null); return true;
    }
    if (n === 3) {
        if (!F.depart_lat.value || !F.arrivee_lat.value) { showErr('#err3', "Placez les points A et B : recherchez l'adresse, utilisez « Ma position » ou cliquez sur la carte."); return false; }
        if (!$('#adr-depart').value.trim() || !$('#adr-arrivee').value.trim()) { showErr('#err3', 'Renseignez les deux adresses (A et B).'); return false; }
        showErr('#err3', null); return true;
    }
    if (n === 4) {
        if (!$('#prenom').value.trim()) { showErr('#err4', 'Indiquez votre prénom.'); return false; }
        if (!$('#nom').value.trim()) { showErr('#err4', 'Indiquez votre nom.'); return false; }
        const tel = $('#tel').value.replace(/[\s.-]/g, '');
        if (!/^(0(3[2-9]|4[0-9]))\d{7}$/.test(tel)) { showErr('#err4', 'Numéro invalide : ex. 034 00 000 00.'); return false; }
        if ($('#email').value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#email').value)) { showErr('#err4', 'E-mail invalide.'); return false; }
        showErr('#err4', null); return true;
    }
    return true;
}
form.addEventListener('click', (e) => {
    const nx = e.target.closest('[data-next]'), pv = e.target.closest('[data-prev]');
    if (nx && validStep(step)) go(+nx.dataset.next);
    else if (pv) go(+pv.dataset.prev);
});
function buildRecap() {
    const pay = form.querySelector('input[name=paiement]:checked')?.value === 'mobile_money' ? 'Mobile Money' : 'À la livraison';
    const svcName = { colis: 'Livraison de colis', achat: 'Achat pour compte', deplacement: 'Déplacement' }[svc];
    const R = [
        ['Service', esc(svcName)],
        ...(svc === 'colis' ? [
            ['Mode', esc(F.mode.value === 'planifiee' ? 'Planifiée' : 'Express')],
            ...(F.mode.value === 'planifiee' && $('#chk-achat').checked ? [['Achat requis', 'Oui']] : []),
            ...(F.type_colis.value ? [['Colis', esc(F.type_colis.value)]] : [])
        ] : []),
        ...(svc === 'achat' ? [
            ['Catégorie', esc($('#cat').selectedOptions[0]?.textContent || '')],
            ...(!$('#lbl-part').hidden ? [['Partenaire', esc($('#part').selectedOptions[0]?.textContent || '')]] : []),
            ...(!$('#lbl-four').hidden ? [['Fournisseur', esc($('#fournisseur').value)]] : []),
            ...(cart.size ? [['Panier', [...cart.values()].map(i => `${i.q} × ${esc(i.nom)}`).join(', ')]] : [])
        ] : []),
        ...((svc === 'achat' || (svc === 'colis' && F.mode.value === 'planifiee')) && $('#date').value ? [['Date souhaitée', esc($('#date').value)]] : []),
        ...(F.details.value.trim() ? [['Détails', esc(F.details.value.trim())]] : []),
        ['Départ (A)', esc($('#adr-depart').value)],
        ['Arrivée (B)', esc($('#adr-arrivee').value)],
        ['Client', esc($('#prenom').value + ' ' + $('#nom').value + ' — ' + $('#tel').value)],
        ['Paiement', esc(pay)]
    ];
    $('#recap').innerHTML = '<b>Récapitulatif</b>' +
        R.map(([k, v]) => `<div class="row"><span class="muted">${k}</span><span class="grow" style="text-align:right"><b>${v}</b></span></div>`).join('') +
        ($('#price-box').hidden ? '' : `<div class="price-box">${$('#price-box').innerHTML}</div>`);
}

/* ---------- Carte de sélection des lieux ---------- */
const map = makeMap('pick-map', { contour: true });
map.on('click', (e) => setPoint(target, e.latlng.lat, e.latlng.lng, true));
$('#pick-map').classList.add('picking');
function setPoint(which, lat, lng, reverse = false) {
    F[which + '_lat'].value = lat.toFixed(7); F[which + '_lng'].value = lng.toFixed(7);
    if (mk[which]) mk[which].setLatLng([lat, lng]);
    else mk[which] = L.marker([lat, lng], { icon: pin(which === 'depart' ? 'A' : 'B', 'dest') }).addTo(map);
    const pts = [mk.depart, mk.arrivee].filter(Boolean).map(m => m.getLatLng());
    pts.length > 1 ? map.fitBounds(L.latLngBounds(pts).pad(0.4)) : map.setView([lat, lng], Math.max(map.getZoom(), 15));
    const input = $('#adr-' + which);
    if (reverse && !input.value.trim()) {
        input.value = `Position choisie (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`).then(r => r.json())
            .then(j => { if (j.display_name && input.value.startsWith('Position choisie')) input.value = j.display_name.split(',').slice(0, 3).join(','); }).catch(() => {});
    }
    estimer();
}

/* ========== RECHERCHE AVEC SUGGESTIONS AUTOMATIQUES ========== */
const sugTimers = {};

function construireLibelle(item) {
    const a = item.address || {};
    const parties = [];
    const nom = a.neighbourhood || a.suburb || a.quarter || a.road || a.village || a.town || a.city;
    if (nom) parties.push(nom);
    const ville = a.city || a.town || a.municipality || a.village;
    if (ville && ville !== nom) parties.push(ville);
    return parties.length ? parties.join(', ') : (item.display_name || '').split(',').slice(0, 2).join(', ');
}

async function chercherSuggestions(which) {
    const input = $('#adr-' + which);
    const sugBox = $('#sug-' + which);
    const q = input.value.trim();
    
    if (q.length < 2) {
        sugBox.hidden = true;
        sugBox.innerHTML = '';
        return;
    }
    
    sugBox.hidden = false;
    sugBox.innerHTML = '<div class="sug-loading">🔍 Recherche…</div>';
    
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=mg&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        
        if (!j.length) {
            sugBox.innerHTML = '<div class="sug-empty">Aucun résultat. Essayez un autre nom ou cliquez sur la carte.</div>';
            return;
        }
        
        // Si un seul résultat → placement automatique direct
        if (j.length === 1) {
            const item = j[0];
            const label = construireLibelle(item);
            input.value = label;
            setPoint(which, +item.lat, +item.lon, false);
            sugBox.hidden = true;
            sugBox.innerHTML = '';
            toast(`📍 ${label}`);
            return;
        }
        
        // Plusieurs résultats → afficher la liste
        sugBox.innerHTML = j.map((item, i) => {
            const label = construireLibelle(item);
            const full = item.display_name || '';
            return `<div class="sug-item" data-lat="${item.lat}" data-lng="${item.lon}" data-label="${esc(full)}" data-short="${esc(label)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div class="sug-text">
                    <div class="sug-main">${esc(label)}</div>
                    ${label !== full ? `<div class="sug-sub">${esc(full.split(',').slice(0, 3).join(', '))}</div>` : ''}
                </div>
            </div>`;
        }).join('');
        
    } catch (e) {
        sugBox.innerHTML = '<div class="sug-empty">Recherche indisponible. Cliquez sur la carte.</div>';
    }
}

function selectionnerSuggestion(which, sugItem) {
    const lat = +sugItem.dataset.lat;
    const lng = +sugItem.dataset.lng;
    const label = sugItem.dataset.short || sugItem.dataset.label;
    
    const input = $('#adr-' + which);
    input.value = label;
    
    const sugBox = $('#sug-' + which);
    sugBox.hidden = true;
    sugBox.innerHTML = '';
    
    setPoint(which, lat, lng, false);
}

['depart', 'arrivee'].forEach(w => {
    const input = $('#adr-' + w);
    const sugBox = $('#sug-' + w);
    
    input.addEventListener('focus', () => {
        target = w;
        if (input.value.trim().length >= 2) chercherSuggestions(w);
    });
    
    input.addEventListener('input', () => {
        clearTimeout(sugTimers[w]);
        sugTimers[w] = setTimeout(() => chercherSuggestions(w), 350);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const first = sugBox.querySelector('.sug-item');
            if (first) {
                selectionnerSuggestion(w, first);
            } else if (input.value.trim()) {
                // Fallback : recherche directe
                sugBox.hidden = false;
                sugBox.innerHTML = '<div class="sug-loading">🔍 Recherche…</div>';
                fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=mg&limit=1&q=${encodeURIComponent(input.value.trim())}`)
                    .then(r => r.json())
                    .then(j => {
                        if (j[0]) {
                            input.value = construireLibelle(j[0]);
                            setPoint(w, +j[0].lat, +j[0].lon, false);
                        } else {
                            sugBox.innerHTML = '<div class="sug-empty">Adresse introuvable. Cliquez sur la carte.</div>';
                        }
                    })
                    .catch(() => { sugBox.innerHTML = '<div class="sug-empty">Recherche indisponible.</div>'; });
            }
        }
        if (e.key === 'Escape') {
            sugBox.hidden = true;
        }
    });
    
    sugBox.addEventListener('click', (e) => {
        const item = e.target.closest('.sug-item');
        if (item) selectionnerSuggestion(w, item);
    });
    
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !sugBox.contains(e.target)) {
            sugBox.hidden = true;
        }
    });
});
/* ========== FIN RECHERCHE AVEC SUGGESTIONS ========== */

form.addEventListener('click', (e) => {
    const g = e.target.closest('[data-geo]'), p = e.target.closest('[data-pick]');
    if (p) { target = p.dataset.pick; toast(`Cliquez sur la carte pour placer le point ${target === 'depart' ? 'A' : 'B'}.`); $('#pick-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (g) {
        g.disabled = true; g.classList.add('busy');
        getPosition().then(pos => setPoint(g.dataset.geo, pos.coords.latitude, pos.coords.longitude, true))
            .catch(err => toast(geoMessage(err) + ' Vous pouvez aussi cliquer sur la carte.'))
            .finally(() => { g.disabled = false; g.classList.remove('busy'); });
    }
});

/* ---------- Types / partenaires ---------- */
let TYPES = [], PARTS = [];
const ARTS = new Map(), cart = new Map();
let catPage = 1, catQ = '', rxRequired = false;
const curType = () => TYPES.find(t => t.code === $('#cat').value) || null;
const curPart = () => PARTS.find(p => p.id == $('#part').value) || null;
api('client', 'partners').then(r => {
    TYPES = r.types; PARTS = r.partenaires;
    $('#cat').innerHTML = TYPES.map(t => `<option value="${esc(t.code)}">${esc(t.nom)}</option>`).join('') + '<option value="autre">Autre fournisseur</option>';
    if (svc === 'achat') majCategorie();
}).catch(() => {});
function majCategorie() {
    const a = svc === 'achat', autre = $('#cat').value === 'autre', t = curType();
    const parts = t ? PARTS.filter(p => p.type === t.code) : [];
    $('#part').innerHTML = parts.map(p => `<option value="${p.id}">${esc(p.nom)} — ${esc(p.adresse)}</option>`).join('');
    $('#lbl-part').hidden = !a || autre || !parts.length;
    $('#no-part').hidden = !a || autre || parts.length > 0;
    $('#lbl-four').hidden = !(a && autre);
    majPartenaire();
}
function majPartenaire() {
    const a = svc === 'achat', autre = $('#cat').value === 'autre', t = curType(), p = (a && !autre) ? curPart() : null;
    const catalog = !!(a && t && +t.catalogue && p);
    const vide = catalog && +p.nb_articles === 0;
    cart.clear(); ARTS.clear(); renderCart();
    $('#catalog').hidden = !catalog;
    if (p && p.lat != null) { setPoint('depart', p.lat, p.lng); $('#adr-depart').value = `${p.nom} — ${p.adresse}`; }
    if (catalog) { catQ = ''; $('#cat-q').value = ''; loadCatalog(true); }
    const rx = a && (!catalog || vide), pharma = t && t.code === 'pharmacie';
    $('#rx').hidden = !rx;
    rxRequired = !!(rx && pharma);
    $('#rx').classList.toggle('required', rxRequired);
    $('#rx-title').textContent = pharma ? 'Photo de votre ordonnance (obligatoire)' : 'Photo ou document utile (facultatif)';
    $('#rx-help').textContent = pharma
        ? "Prenez en photo (ou scannez) votre ordonnance : le livreur la présentera à la pharmacie pour vous remettre vos médicaments. Il n'y a pas de catalogue de médicaments : complétez aussi le formulaire ci-dessous avec les médicaments à livrer."
        : "Vous pouvez joindre une photo de l'article recherché ou un document utile.";
    $('#t-details').textContent = !a ? $('#t-details').textContent
        : catalog && !vide ? 'Remarques pour le livreur (facultatif)'
        : pharma ? 'Médicaments à livrer : noms, dosages, quantités (obligatoire)'
        : 'Articles recherchés, quantités, informations utiles';
    $('#note-devis').hidden = !(a && (!catalog || vide));
    if (!rx) clearRx();
    estimer();
}
const carte = (a) => `<div class="art" data-id="${a.id}">
    <div class="art-img">${a.photo ? `<img loading="lazy" src="${esc(url(a.photo))}" alt="${esc(a.nom)}">` : '<span>Pas de photo</span>'}</div>
    <div class="art-body"><b>${esc(a.nom)}</b>${a.description ? `<p class="sub">${esc(a.description)}</p>` : ''}
    <div class="art-price">${ar(a.prix)}</div>
    ${a.option_id ? `<div class="art-opt">${a.option_photo ? `<img loading="lazy" src="${esc(url(a.option_photo))}" alt="">` : ''}<span>+ ${esc(a.option_nom)} ${ar(a.option_prix)} <small>ajouté automatiquement</small></span></div>` : ''}
    <div class="qty"><button type="button" data-q="-1" aria-label="Moins">−</button><span data-qv>${cart.get(a.id)?.q || 0}</span><button type="button" data-q="1" aria-label="Plus">+</button></div></div></div>`;
async function loadCatalog(reset) {
    const p = curPart(); if (!p) return;
    if (reset) { catPage = 1; $('#cat-grid').innerHTML = ''; }
    try {
        const r = await api('client', 'catalog', { params: `&partenaire_id=${p.id}&q=${encodeURIComponent(catQ)}&page=${catPage}` });
        r.items.forEach(a => ARTS.set(a.id, a));
        $('#cat-grid').insertAdjacentHTML('beforeend', r.items.map(carte).join(''));
        $('#cat-more').hidden = !r.has_more;
        $('#cat-empty').hidden = !(reset && !r.items.length && !catQ);
    } catch (e) { toast(e.message); }
}
$('#cat-more').addEventListener('click', () => { catPage++; loadCatalog(false); });
let qt; $('#cat-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { catQ = e.target.value.trim(); loadCatalog(true); }, 300); });
$('#cat-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    const el = b.closest('.art'), a = ARTS.get(+el.dataset.id); if (!a) return;
    const q = Math.max(0, Math.min(99, (cart.get(a.id)?.q || 0) + +b.dataset.q));
    q ? cart.set(a.id, { id: a.id, nom: a.nom, prix: a.prix, photo: a.photo, on: a.option_nom, op: a.option_prix || 0, ophoto: a.option_photo, q }) : cart.delete(a.id);
    el.querySelector('[data-qv]').textContent = q; renderCart(); showPrice();
});
function cartTotals() {
    let arts = 0, opts = 0; const byOpt = new Map();
    cart.forEach(i => {
        arts += i.q * i.prix; opts += i.q * i.op;
        if (i.op) { const o = byOpt.get(i.on) || { q: 0, total: 0, photo: i.ophoto }; o.q += i.q; o.total += i.q * i.op; byOpt.set(i.on, o); }
    });
    return { arts, opts, byOpt };
}
function renderCart() {
    const box = $('#cart'), items = [...cart.values()];
    box.hidden = !items.length; if (!items.length) { box.innerHTML = ''; return; }
    const { arts, opts, byOpt } = cartTotals();
    const th = (p) => p ? `<img class="mini" loading="lazy" src="${esc(url(p))}" alt="">` : '';
    box.innerHTML = `<h3 style="margin-top:0">Votre panier</h3>`
        + items.map(i => `<div class="row">${th(i.photo)}<span class="grow">${i.q} × ${esc(i.nom)}</span><b>${ar(i.q * i.prix)}</b></div>`).join('')
        + `<div class="row" style="border-top:1px dashed var(--line);margin-top:6px;padding-top:6px"><span class="grow">Articles</span><b>${ar(arts)}</b></div>`
        + [...byOpt].map(([nom, o]) => `<div class="row">${th(o.photo)}<span class="grow">${esc(nom)} × ${o.q} <small class="muted">(ajouté automatiquement)</small></span><b>${ar(o.total)}</b></div>`).join('');
}
const rxFile = $('#rx-file'), rxPrev = $('#rx-prev');
const rxModal = $('#rx-cam-modal'), rxVideo = $('#rx-video'), rxCanvas = $('#rx-canvas'), rxCamErr = $('#rx-cam-err');
let rxStream = null, facing = 'environment';
function showRx() {
    const f = rxFile.files[0];
    if (!f) { rxPrev.hidden = true; rxPrev.innerHTML = ''; return; }
    rxPrev.hidden = false;
    const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name);
    rxPrev.innerHTML = (isImg ? `<img src="${URL.createObjectURL(f)}" alt="Aperçu">` : '') + `<p class="sub">${esc(f.name)} <button type="button" class="link" id="rx-del">retirer</button></p>`;
    $('#rx-del').addEventListener('click', clearRx);
}
function clearRx() { rxFile.value = ''; showRx(); }
function stopCam() { try { rxStream?.getTracks().forEach(t => t.stop()); } catch (_) {} rxStream = null; rxVideo.srcObject = null; }
async function startCam() {
    showErr(rxCamErr, null); stopCam();
    if (!navigator.mediaDevices?.getUserMedia) { showErr(rxCamErr, 'Caméra non supportée par ce navigateur : utilisez « Joindre un fichier ».'); return; }
    try { rxStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false }); }
    catch (_) {
        try { rxStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        catch (e) { showErr(rxCamErr, 'Caméra bloquée : autorisez l’accès puis réessayez, ou utilisez « Joindre un fichier ».'); return; }
    }
    rxVideo.srcObject = rxStream;
    try { await rxVideo.play(); } catch (_) {}
}
function fileFromCanvas() {
    return new Promise((res) => {
        const w = rxVideo.videoWidth || 1280, h = rxVideo.videoHeight || 720;
        rxCanvas.width = w; rxCanvas.height = h;
        rxCanvas.getContext('2d').drawImage(rxVideo, 0, 0, w, h);
        rxCanvas.toBlob(b => res(b ? new File([b], 'ordonnance-' + Date.now() + '.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92);
    });
}
$('#rx-file-btn').addEventListener('click', () => rxFile.click());
$('#rx-cam-btn').addEventListener('click', () => { rxModal.hidden = false; startCam(); });
$('#rx-close').addEventListener('click', () => { rxModal.hidden = true; stopCam(); });
$('#rx-switch').addEventListener('click', async () => { facing = facing === 'environment' ? 'user' : 'environment'; await startCam(); });
$('#rx-shot').addEventListener('click', async () => {
    if (!rxStream) { await startCam(); if (!rxStream) return; }
    const f = await fileFromCanvas();
    if (!f) { showErr(rxCamErr, 'Capture impossible, réessayez.'); return; }
    try { const dt = new DataTransfer(); dt.items.add(f); rxFile.files = dt.files; } catch (_) { showErr(rxCamErr, 'Impossible de joindre la photo sur ce navigateur.'); return; }
    showRx(); rxModal.hidden = true; stopCam(); toast('Photo capturée ✓');
});
rxFile.addEventListener('change', showRx);

let tmr, course = null;
function estimer() {
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
        const ok = ['depart', 'arrivee'].every(w => F[w + '_lat'].value);
        if (!ok) { course = null; showPrice(); return; }
        try {
            course = await api('client', 'price', { method: 'POST', data: {
                service: svc, mode: F.mode.value, depart_lat: F.depart_lat.value, depart_lng: F.depart_lng.value, arrivee_lat: F.arrivee_lat.value, arrivee_lng: F.arrivee_lng.value
            }});
        } catch (_) { course = null; }
        showPrice();
    }, 400);
}
function showPrice() {
    const box = $('#price-box');
    if (!course) { box.hidden = true; return; }
    const { arts, opts } = svc === 'achat' ? cartTotals() : { arts: 0, opts: 0 };
    box.innerHTML = `Distance facturée : <b>${course.km} km</b> · Course : <b>${ar(course.prix)}</b>`
        + (arts ? `<br>Articles : <b>${ar(arts)}</b>${opts ? ` · Options (barquette, sachet…) : <b>${ar(opts)}</b>` : ''}<br>Total estimé : <b>${ar(course.prix + arts + opts)}</b>` : '')
        + (svc === 'achat' && !arts && $('#catalog').hidden ? '<br><small>+ articles : un devis vous sera envoyé.</small>' : '')
        + '<br><small>Le prix définitif est confirmé par BOXIBY avant le départ.</small>';
    box.hidden = false;
}
function majService() {
    F.service.value = svc;
    $$('[data-for]').forEach(el => (el.hidden = el.dataset.for !== svc));
    const planif = svc === 'colis' && F.mode.value === 'planifiee';
    const needDate = svc === 'achat' || planif;
    const buy = planif && $('#chk-achat').checked;
    $('#lbl-achat').hidden = svc !== 'colis' || F.mode.value !== 'planifiee';
    if (svc !== 'colis') $('#chk-achat').checked = false;
    $('#blk-mode').style.display = svc === 'colis' ? '' : 'none';
    $('#row-date').hidden = !needDate;
    $('#msg-express').hidden = needDate;
    const t = { colis: 'Informations utiles (facultatif)', deplacement: 'Informations utiles (nombre de personnes, bagages…)' };
    if (svc !== 'achat') {
        $('#t-details').textContent = buy ? 'Que doit acheter le livreur ? (articles, quantités, budget)' : t[svc];
        $('#note-devis').hidden = true;
    }
    $('#adr-depart').placeholder = (buy || svc === 'achat') ? "Zone / lieu d'achat (où le livreur doit acheter)" : (svc === 'deplacement' ? 'Point de départ' : 'Lieu de récupération / point de départ');
    $('#note-buy').hidden = !(buy || svc === 'achat');
    estimer();
}
$('#chk-achat').addEventListener('change', majService);
$('#cat').addEventListener('change', majCategorie);
$('#part').addEventListener('change', majPartenaire);
$('#seg-svc').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#seg-svc button').forEach(x => x.classList.toggle('active', x === b)); svc = b.dataset.svc;
    majService(); if (svc === 'achat') majCategorie();
});
$('#seg-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#seg-mode button').forEach(x => x.classList.toggle('active', x === b)); F.mode.value = b.dataset.mode; majService();
});
$('#date').min = new Date().toISOString().slice(0, 10);
majService(); go(1);

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const n of [1, 2, 3, 4]) { if (!validStep(n)) { go(n); return; } }
    const err = $('#err'); err.hidden = true;
    const catalogActif = svc === 'achat' && !$('#catalog').hidden;
    const refus = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if (svc === 'achat' && rxRequired) {
        if (!F.details.value.trim()) return refus('Remplissez le formulaire : indiquez les médicaments à livrer (obligatoire).');
        if (!rxFile.files.length) return refus("Prenez en photo (ou scannez) votre ordonnance : elle est obligatoire pour une pharmacie.");
    }
    if (catalogActif && !cart.size && !F.details.value.trim() && $('#rx').hidden) {
        err.textContent = 'Choisissez au moins un article du catalogue.'; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    const btn = $('#btn-send'); btn.disabled = true; btn.textContent = 'Envoi…';
    try {
        const fd = new FormData(form);
        if (svc !== 'colis') fd.delete('mode');
        if (svc !== 'colis' || F.mode.value !== 'planifiee') fd.delete('achat_requis');
        if (svc !== 'achat') { fd.delete('categorie_achat'); fd.delete('partenaire_id'); fd.delete('ordonnance'); }
        else if (catalogActif) fd.set('articles', JSON.stringify([...cart.values()].map(i => ({ id: i.id, q: i.q }))));
        const r = await api('client', 'create', { method: 'POST', data: fd });
        const list = JSON.parse(localStorage.getItem('bx-orders') || '[]');
        list.unshift({ t: r.token, ref: r.reference }); localStorage.setItem('bx-orders', JSON.stringify(list.slice(0, 10)));
        $('#success-box').hidden = false;
        $('#success-box').innerHTML = `<b>Commande envoyée !</b><br>Référence : <span class="big-code">${esc(r.reference)}</span><br><br><div class="btns"><a class="btn primary" href="suivi.php?t=${esc(r.token)}">Suivre ma commande</a></div>`
            + (F.paiement.value === 'mobile_money' ? panneauPaiement(r.token) : '');
        $('#nav-send').hidden = true;
        $('#success-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
        renderLocal();
    } catch (ex) {
        err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.disabled = false; btn.textContent = 'Envoyer ma commande';
    }
});

$('#f-find').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api('client', 'find', { method: 'POST', data: Object.fromEntries(new FormData(e.target)) }); location.href = 'suivi.php?t=' + r.token; }
    catch (ex) { toast(ex.message); }
});
const STAT = { en_attente: 'En attente', affectee: 'Affectée', en_cours: 'En cours', livree: 'Livrée', annulee: 'Annulée' };
const ligne = (r, s, t) => `<a class="card row link-row" href="suivi.php?t=${esc(t)}"><div class="grow"><div class="name">${esc(r)}</div><div class="sub">${esc(s)}</div></div><span class="badge blue">Suivre</span></a>`;
function renderLocal() {
    try {
        const local = JSON.parse(localStorage.getItem('bx-orders') || '[]');
        if (local.length) $('#list-local').innerHTML = '<h3>Sur cet appareil</h3>' + local.map(o => ligne(o.ref, '', o.t)).join('');
    } catch (_) {}
}
renderLocal();
if ($('#list-mine')) api('client', 'mine').then(l => {
    $('#list-mine').innerHTML = l.length ? l.map(o => ligne(o.reference, `${STAT[o.statut]} · ${ar(o.prix_final ?? o.prix_calcule)}`, o.token)).join('') : '<p class="muted">Aucune commande pour le moment.</p>';
}).catch(() => {});

// === PAIEMENT MOBILE MONEY AUTOMATIQUE (USSD depuis le compte du client) ===
const OPERATEURS = {
    mvola: 'MVola',
    orange: 'Orange Money',
    airtel: 'Airtel Money'
};
async function payerPar(op, token, btn) {
    if (!btn) return;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Ouverture…';
    try {
        const r = await api('client', 'pay', { method: 'POST', data: { t: token, operateur: op } });
        lancerUSSD(r.ussd);
        toast(`Composez le code ${OPERATEURS[op]} : ${r.ussd}`);
        btn.textContent = 'Paiement déclaré ✔';
        setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 4000);
    } catch (ex) {
        toast(ex.message);
        btn.textContent = old;
        btn.disabled = false;
    }
}
function panneauPaiement(token) {
    return `<div class="box-paiement-ussd" style="margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:10px;background:rgba(14,65,105,.04)">
        <b>Payer maintenant (Mobile Money)</b>
        <p class="muted small-t" style="margin:4px 0 8px">Le paiement part automatiquement de votre compte. Si le prix n'est pas encore confirmé par BOXIBY, réessayez plus tard depuis la page de suivi.</p>
        <div class="btns" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn primary small" data-pay-ussd="mvola" data-token="${esc(token)}">MVola</button>
            <button type="button" class="btn primary small" data-pay-ussd="orange" data-token="${esc(token)}">Orange Money</button>
            <button type="button" class="btn primary small" data-pay-ussd="airtel" data-token="${esc(token)}">Airtel Money</button>
        </div>
    </div>`;
}
document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay-ussd]');
    if (b) payerPar(b.dataset.payUssd, b.dataset.token, b);
});

// === AFFICHAGE DES NUMÉROS MOBILE MONEY ===
$$('input[name="paiement"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const box = $('#box-mobile-money');
        if (!box) return;
        if (e.target.value === 'mobile_money') {
            box.hidden = false;
            // Appel à l'API pour récupérer les numéros configurés par l'admin
            api('client', 'payments_info').then(r => {
                if (r.mvola) $('#info-mvola').innerHTML = `MVola : <b>${r.mvola}</b>`;
                if (r.orange) $('#info-orange').innerHTML = `Orange : <b>${r.orange}</b>`;
                if (r.airtel) $('#info-airtel').innerHTML = `Airtel : <b>${r.airtel}</b>`;
            }).catch(() => {});
        } else {
            box.hidden = true;
        }
    });
});
})();