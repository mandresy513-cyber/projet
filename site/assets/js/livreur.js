/* BOXIBY — Application livreur : sa position en direct, ses missions, son trajet */
(() => {
  'use strict';
  const { $, $$, esc, url, ar, api, toast, beep, initTheme, makeMap, pin, route, watchPosition, upsert, prune, geoMessage, ago } = BXC;
  initTheme($('#btn-theme'));

  const map = makeMap('map');
  const layer = L.layerGroup().addTo(map), layerRoute = L.layerGroup().addTo(map);
  const store = {};
  let S = null, here = null, selected = null, routeKey = '', lastRouteAt = 0, fittedOnce = false, lastSent = 0, watching = false;
  const deadlines = {}, announced = new Set();
  const post = (a, data) => api('livreur', a, { method: 'POST', data });
  const SERVICE = { colis: 'Colis', achat: 'Achat pour compte', deplacement: 'Déplacement' };
  const STAT = { disponible: ['Disponible', 'ok'], en_mission: ['En mission', 'warn'], en_pause: ['En pause', ''] };
  const encaisserTxt = (m, achat) => {
    const base = m.prix_final ?? m.prix_calcule, art = +m.montant_articles || 0, bq = +m.montant_options || 0;
    if (art || bq) return `À encaisser : <b>${ar(base + art + bq)}</b> (course ${ar(base)} + articles ${ar(art)}${bq ? ' + options ' + ar(bq) : ''})`;
    return `À encaisser : <b>${ar(base)}</b>${achat ? " + montant de l'achat" + (m.montant_achat != null ? ' (' + ar(m.montant_achat) + ')' : '') : ''}`;
  };
  const tel = (t) => `<a href="tel:${esc(t)}">${esc(t)}</a>`;
  const dt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '');

  async function maj() {
    try { S = await api('livreur', 'state'); } catch (e) { return; }
    rendreStatut(); rendrePending(); rendreMissions(); rendreHisto(); majCarte();
    if (!watching) demarrerGPS();
  }

  /* ========== APPEL TÉLÉPHONIQUE ========== */
let appelEnCours = null, appelModal = null;
function creerModalAppel() {
    if (appelModal) return appelModal;
    appelModal = document.createElement('div');
    appelModal.className = 'modal-appel';
    appelModal.innerHTML = `
        <div class="modal-appel-content">
            <div class="appel-info">
                <div class="appel-avatar" id="appel-avatar"></div>
                <div class="appel-nom" id="appel-nom"></div>
                <div class="appel-statut" id="appel-statut">Appel en cours…</div>
                <div class="appel-timer" id="appel-timer">00:00</div>
            </div>
            <div class="appel-actions">
                <button class="appel-btn appel-mute" id="btn-mute"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg></button>
                <button class="appel-btn appel-decrocher" id="btn-decrocher"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
                <button class="appel-btn appel-raccrocher" id="btn-raccrocher"><svg viewBox="0 0 24 24"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg></button>
            </div>
        </div>`;
    document.body.appendChild(appelModal);
    appelModal.querySelector('#btn-raccrocher').addEventListener('click', terminerAppel);
    appelModal.querySelector('#btn-decrocher').addEventListener('click', () => {
        appelModal.querySelector('#appel-statut').textContent = 'Connecté';
        appelModal.querySelector('#btn-decrocher').style.display = 'none';
        demarrerTimer();
    });
    return appelModal;
}
function lancerAppel(telephone, nom, role) {
    if (!telephone) return toast('Numéro non disponible');
    const choixSim = confirm(`Appeler ${nom} ?\nOK = SIM 1 · Annuler = SIM 2`);
    creerModalAppel();
    const avatar = appelModal.querySelector('#appel-avatar');
    avatar.textContent = nom.charAt(0).toUpperCase();
    avatar.className = `appel-avatar appel-avatar-${role}`;
    appelModal.querySelector('#appel-nom').textContent = nom;
    appelModal.querySelector('#appel-statut').textContent = 'Appel en cours…';
    appelModal.querySelector('#appel-timer').textContent = '00:00';
    appelModal.querySelector('#btn-decrocher').style.display = '';
    appelModal.classList.add('active');
    appelEnCours = { telephone, nom, role, startTime: Date.now(), timerInterval: null };
    const link = document.createElement('a');
    link.href = `tel:${telephone.replace(/\s+/g, '')}`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => {
        if (appelEnCours) {
            appelModal.querySelector('#appel-statut').textContent = 'Connecté';
            appelModal.querySelector('#btn-decrocher').style.display = 'none';
            demarrerTimer();
        }
    }, 3000);
}
function demarrerTimer() {
    if (!appelEnCours) return;
    appelEnCours.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - appelEnCours.startTime) / 1000);
        appelModal.querySelector('#appel-timer').textContent =
            `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;
    }, 1000);
}
function terminerAppel() {
    if (!appelEnCours) return;
    if (appelEnCours.timerInterval) clearInterval(appelEnCours.timerInterval);
    appelModal.classList.remove('active');
    appelEnCours = null;
    toast('Appel terminé');
}
function appelerLivreur(telephone, nom) { lancerAppel(telephone, nom || 'Livreur', 'livreur'); }
function appelerAdmin(telephone, nom) { lancerAppel(telephone, nom || 'BOXIBY', 'admin'); }
window.appelerLivreur = appelerLivreur;
window.appelerAdmin = appelerAdmin;

  /* ---------- Ma position : envoyée en continu à BOXIBY ---------- */
function demarrerGPS() {
    watching = true;
    if (!S.me.tracer_telephone) {
        $('#banner-gps').hidden = false;
        $('#banner-gps').textContent = "Le suivi par téléphone est désactivé pour votre compte : votre position provient du GPS de votre moto.";
        $('#gps-state').textContent = 'Position : GPS moto';
        return;
    }
    
    $('#gps-state').textContent = '🔍 Recherche de position…';
    $('#banner-gps').hidden = true;
    
    watchPosition((p) => {
        here = [p.lat, p.lng];
        const acc = Math.round(p.acc);
        $('#gps-state').textContent = `📍 Position active (±${acc} m)`;
        $('#banner-gps').hidden = true;
        upsert(store, 'ME', here, () => pin('Moi', ''), layer, 'Ma position').setZIndexOffset(900);
        if (!fittedOnce) { map.setView(here, 15); fittedOnce = true; }
        if (Date.now() - lastSent > 3000) { 
            lastSent = Date.now(); 
            post('position', { lat: p.lat, lng: p.lng }).catch(() => {}); 
        }
        tracer();
    }, (e) => {
        $('#banner-gps').hidden = false;
        $('#banner-gps').textContent = geoMessage(e);
        $('#gps-state').textContent = (e.code === 1 || e.code === 0) ? '🔒 Localisation refusée' : '📡 Recherche du signal GPS…';
    });
}

  /* ---------- Statut / pause ---------- */
  function rendreStatut() {
    const [t, c] = STAT[S.statut];
    $('#statut-pill').textContent = t; $('#statut-pill').className = 'badge ' + c;
    $('#statut-sub').textContent = S.statut === 'en_pause' ? `Retour automatique à « Disponible » dans ${Math.ceil(S.pause_restant / 60)} min.` : (S.statut === 'en_mission' ? 'Vous avez des missions attribuées.' : "Aucune mission attribuée.");
    $('#btn-pause').hidden = S.statut === 'en_pause'; $('#btn-pause').disabled = S.statut === 'en_mission';
    $('#btn-dispo').hidden = S.statut !== 'en_pause';
  }
  $('#btn-pause').addEventListener('click', async () => { try { await post('pause', { on: 1 }); maj(); } catch (e) { toast(e.message); } });
  $('#btn-dispo').addEventListener('click', async () => { try { await post('pause', { on: 0 }); maj(); } catch (e) { toast(e.message); } });

  /* ---------- Nouvelle mission : acceptation obligatoire en 3 min (pas de refus) ---------- */
  function rendrePending() {
    const list = S.missions.filter(m => m.statut === 'affectee');
    list.forEach(m => {
      deadlines[m.id] = Date.now() + m.secondes_restantes * 1000;
      if (!announced.has(m.id)) {
        announced.add(m.id); beep(); toast('Nouvelle mission : acceptez-la dans les 3 minutes.');
        try { if (Notification.permission === 'granted') new Notification('BOXIBY — Nouvelle mission', { body: `${m.depart_adresse} → ${m.arrivee_adresse}` }); } catch (_) {}
      }
    });
    $('#box-pending').innerHTML = list.map(m => `
      <article class="card pending">
        <div class="name">Nouvelle mission — ${SERVICE[m.service]}${m.mode ? ' ' + (m.mode === 'express' ? 'Express' : 'Planifiée') : ''}</div>
        <div class="sub">Client : <b>${esc(m.client_prenom)} ${esc(m.client_nom)}</b> · ${tel(m.client_tel)}</div>
        <div class="detail"><div><b>A</b> ${esc(m.depart_adresse)}</div><div><b>B</b> ${esc(m.arrivee_adresse)}</div>
          ${m.date_souhaitee || m.heure_definie ? `<div class="sub">Créneau : ${esc(m.date_souhaitee || '')} ${esc((m.heure_definie || '').slice(0, 5))}</div>` : ''}</div>
        <button class="btn primary block" data-accept="${m.id}">Accepter la mission <span class="count" data-count="${m.id}"></span></button>
      </article>`).join('');
  }
  setInterval(() => {
    $$('[data-count]').forEach(el => {
      const s = Math.max(0, Math.round((deadlines[el.dataset.count] - Date.now()) / 1000));
      el.textContent = `(${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
      if (s === 0) maj();
    });
  }, 1000);
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (_) {}

 function rendreMissions() {
    const list = S.missions.filter(m => m.statut === 'en_cours');
    if (!selected || !list.find(m => m.id == selected)) selected = list[0]?.id ?? null;
    $('#box-missions').innerHTML = list.length ? list.map(m => {
        const achat = +m.achat_requis === 1, fait = !!m.recupere_le;
        const phase = achat ? (fait ? 'Achat fait · à livrer' : 'Achat à faire') : (fait ? 'À livrer' : 'À récupérer');
        const encaisser = m.paiement === 'livraison' && !+m.paye;
        return `<article class="card ${m.id == selected ? 'sel' : ''}">
            <div class="row wrap-m"><div class="grow">
                <div class="name">${esc(m.client_prenom)} ${esc(m.client_nom)} <span class="badge blue">${SERVICE[m.service]}</span> <span class="badge ${fait ? 'ok' : 'warn'}">${phase}</span></div>
                <div class="sub">${esc(m.reference)}</div></div>
                <button class="btn map" data-select="${m.id}">Itinéraire</button></div>
            <div class="detail">
                <div><b>A</b> ${achat ? "Zone d'achat : " : ''}${esc(m.depart_adresse)}</div>
                <div><b>B</b> ${achat ? 'Livraison : ' : ''}${esc(m.arrivee_adresse)}</div>
                ${m.type_colis ? `<div class="sub">Colis : ${esc(m.type_colis)}</div>` : ''}
                ${m.articles?.length ? `<div class="note"><b>Articles :</b><br>${m.articles.map(a => `<div class="item-line">${a.photo ? `<img class="mini" loading="lazy" src="${esc(url(a.photo))}" alt="">` : ''}<span>${a.quantite} × ${esc(a.nom)}</span></div>`).join('')}</div>` : ''}
                ${m.details ? `<div class="note">${esc(m.details)}</div>` : ''}
                <div class="sub">${+m.paye ? '<span class="badge ok">Déjà payé ✔ (Mobile Money)</span> — aucun encaissement' : (encaisser ? encaisserTxt(m, achat) : 'Course déjà réglée')}</div>
            </div>
            <div class="btns">
                <button class="btn ghost small appel-btn-livreur" onclick="appelerLivreur('${esc(m.client_tel)}','${esc(m.client_prenom)} ${esc(m.client_nom)}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span class="btn-text">Client</span>
                </button>
                <button class="btn ghost small appel-btn-admin" onclick="appelerAdmin('0340000000','BOXIBY')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span class="btn-text">BOXIBY</span>
                </button>
                ${fait ? '' : `<button class="btn ghost small" data-recupere="${m.id}" data-achat="${achat ? 1 : 0}">${achat ? 'Achat effectué' : (m.service === 'deplacement' ? 'Client pris en charge' : 'Colis récupéré')}</button>`}
                <button class="btn primary small" data-end="${m.id}" data-service="${m.service}" data-ref="${esc(m.reference)}" ${achat && !fait ? 'disabled' : ''}>${achat ? 'Livrer' : 'Terminer'}</button>
            </div>
        </article>`;
    }).join('') : `<p class="empty-big">Aucune mission en cours.</p>`;
}

  function rendreHisto() {
    const box = $('#box-histo');
    if (!box) return;
    const list = S.historique || [];
    box.innerHTML = list.length ? list.map(h => `
      <article class="card">
        <div class="row wrap-m"><div class="grow">
          <div class="name">${esc(h.client_prenom)} ${esc(h.client_nom)} <span class="badge ${h.statut === 'livree' ? 'ok' : ''}">${h.statut === 'livree' ? 'Livrée' : 'Annulée'}</span>${+h.paye ? ' <span class="badge ok">Déjà payé ✔</span>' : ''}</div>
          <div class="sub">${esc(h.reference)} · ${SERVICE[h.service] || ''} · ${dt(h.livree_le || h.cree_le)}</div>
          <div class="sub">${esc(h.depart_adresse)} → ${esc(h.arrivee_adresse)}</div>
        </div></div>
      </article>`).join('') : `<p class="empty">Aucune course terminée pour le moment.</p>`;
  }

  /* ---------- Carte : mes missions, clients en direct, trajet ---------- */
  function majCarte() {
    const keep = new Set(['ME']);
    if (!S.me.tracer_telephone && S.position) {
      const st = S.position.live ? '' : 'stale'; keep.add('GPS');
      upsert(store, 'GPS', [S.position.lat, S.position.lng], () => pin('Moi', st), layer, st ? `Ma moto — dernière position ${ago(S.position.age)}` : 'Ma moto (en direct)', st).setZIndexOffset(900);
      $('#gps-state').textContent = st ? `GPS moto : dernière position ${ago(S.position.age)}` : 'GPS moto : en direct';
    }
    S.missions.filter(m => m.statut === 'en_cours').forEach(m => {
      if (!m.recupere_le) { keep.add('A' + m.id); upsert(store, 'A' + m.id, [m.depart_lat, m.depart_lng], () => pin('A', 'dest'), layer, 'Récupération : ' + esc(m.depart_adresse)); }
      keep.add('B' + m.id); upsert(store, 'B' + m.id, [m.arrivee_lat, m.arrivee_lng], () => pin('B', 'dest'), layer, 'Livraison : ' + esc(m.arrivee_adresse));
      if (m.client_lat != null) { keep.add('C' + m.id); upsert(store, 'C' + m.id, [m.client_lat, m.client_lng], () => pin('C', 'client'), layer, `Client : ${esc(m.client_prenom)}`); }
    });
    prune(store, keep);
    tracer();
  }

  /** Trace l'itinéraire routier de ma position vers le prochain point de la mission sélectionnée. */
  async function tracer(force = false) {
    const m = S?.missions.find(x => x.id == selected && x.statut === 'en_cours');
    const from = here || (S?.position ? [S.position.lat, S.position.lng] : null);
    if (!m || !from) { layerRoute.clearLayers(); routeKey = ''; return; }
    const to = m.recupere_le ? [m.arrivee_lat, m.arrivee_lng] : [m.depart_lat, m.depart_lng];
    const key = `${m.id}:${m.recupere_le ? 'B' : 'A'}`;
    if (!force && key === routeKey && Date.now() - lastRouteAt < 20000) return;
    routeKey = key; lastRouteAt = Date.now();
    const line = await route(from, to);
    layerRoute.clearLayers();
    L.polyline(line || [from, to], { color: '#BC5719', weight: 6, opacity: .9, dashArray: line ? null : '8 8' }).addTo(layerRoute);
    if (force) map.fitBounds(L.latLngBounds([from, to]).pad(0.3));
  }

  /* ---------- Actions ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-accept],[data-select],[data-recupere],[data-end],[data-close]'); if (!t) return;
    const ds = t.dataset;
    try {
      if (ds.accept) { await post('accept', { commande_id: +ds.accept }); toast('Mission acceptée.'); selected = +ds.accept; await maj(); tracer(true); }
      else if (ds.select) { selected = +ds.select; rendreMissions(); $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' }); tracer(true); }
      else if (ds.recupere) {
        let montant = null;
        if (ds.achat === '1') {
          const v = prompt("Achat effectué. Montant dépensé pour l'achat (Ar) ? Laissez vide si vous ne le connaissez pas.");
          if (v === null) return;
          if (v.trim() !== '') montant = parseInt(v.replace(/\D/g, ''), 10);
        }
        await post('recupere', { commande_id: +ds.recupere, montant }); await maj(); tracer(true);
      }
      else if (ds.end) ouvrirFin(ds.end, ds.service, ds.ref);
      else if (t.hasAttribute('data-close')) t.closest('dialog').close();
    } catch (err) { toast(err.message); maj(); }
  });

  /* ---------- Fin de livraison : photo + signature ---------- */
  const cv = $('#sig'), ctx = cv.getContext('2d');
  let drawing = false, drawn = false, endId = null;
  const pos = (ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', (e) => { drawing = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#0E4169'; ctx.lineTo(x, y); ctx.stroke(); drawn = true; });
  ['pointerup', 'pointercancel'].forEach(n => cv.addEventListener(n, () => (drawing = false)));
  const clearSig = () => { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; };
  $('#sig-clear').addEventListener('click', clearSig);

  function ouvrirFin(id, service, ref) {
    endId = id; clearSig(); $('#form-end').reset(); $('#end-err').hidden = true;
    $('#end-ref').textContent = ref;
    const colis = service === 'colis';
    $('#lbl-photo').hidden = !colis; $('#wrap-sig').hidden = !colis;
    $('#dlg-end h2').textContent = colis ? 'Confirmer la livraison' : 'Terminer la mission';
    $('#dlg-end').showModal();
  }
  $('#form-end').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('#end-err'); err.hidden = true;
    const fd = new FormData(); fd.append('commande_id', endId);
    const f = $('#end-photo').files[0]; if (f) fd.append('photo', f);
    if (drawn) fd.append('signature', cv.toDataURL('image/png'));
    try { await api('livreur', 'terminer', { method: 'POST', data: fd }); $('#dlg-end').close(); toast('Livraison confirmée ✔'); maj(); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  maj();
  setInterval(() => { if (!document.hidden) maj(); }, 3000);
})();

