/* BOXIBY — Suivi du colis : statut, carte avec le livreur en temps réel, position du client */
(() => {
'use strict';
const { $, esc, url, ar, initiales, api, toast, initTheme, makeMap, pin, route, watchPosition, upsert, geoMessage, ago, lancerUSSD } = BXC;
const T = BX.token;
initTheme($('#btn-theme'));
if (!T) { $('#box-status').innerHTML = '<p class="alert">Lien de suivi invalide.</p>'; return; }
const map = makeMap('map');
const layer = L.layerGroup().addTo(map);
const store = {};
let C = null, fitted = false, livFitted = false, routed = false;
const STEPS = [['en_attente', 'Demande reçue'], ['affectee', 'Livreur affecté'], ['en_cours', 'En cours'], ['livree', 'Livrée']];
const SERVICE = { colis: 'Livraison de colis', achat: 'Achat pour compte', deplacement: 'Déplacement' };
const tot = (c, base) => (+c.montant_articles || +c.montant_options) ? `<br><small>Articles ${ar(c.montant_articles)}${+c.montant_options ? ' · Options ' + ar(c.montant_options) : ''}</small><br>Total à payer : <b>${ar(base + +c.montant_articles + +c.montant_options)}</b>` : '';
const dt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '');

/* ========== SYSTÈME D'APPEL TÉLÉPHONIQUE ========== */
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
                <button class="appel-btn appel-mute" id="btn-mute" title="Muet">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
                <button class="appel-btn appel-decrocher" id="btn-decrocher" title="Décrocher">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </button>
                <button class="appel-btn appel-raccrocher" id="btn-raccrocher" title="Raccrocher">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
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
    if (!telephone) { toast('Numéro non disponible'); return; }
    const choixSim = confirm(`Appeler ${nom} ?\n\nOK = SIM 1 (par défaut)\nAnnuler = SIM 2`);
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
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

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
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        appelModal.querySelector('#appel-timer').textContent = `${mins}:${secs}`;
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
/* ========== FIN APPEL ========== */

async function maj() {
try { C = await api('client', 'suivi', { params: `&t=${T}` }); } catch (e) { $('#box-status').innerHTML = `<p class="alert">${esc(e.message)}</p>`; return; }
rendre(); majCarte();
}
function rendre() {
const c = C, annulee = c.statut === 'annulee';
const idx = STEPS.findIndex(s => s[0] === c.statut);
$('#box-status').innerHTML = `<div class="row wrap-m"><div class="grow"><h2 style="margin:0">${esc(c.reference)}</h2><div class="sub">${SERVICE[c.service]}${c.mode ? ' · ' + (c.mode === 'express' ? 'Express' : 'Planifiée') : ''} · ${dt(c.cree_le)}</div></div> ${annulee ? '<span class="badge warn">Annulée</span>' : ''}</div> ${annulee ? '<p class="muted">Cette demande a été annulée.</p>' :`<ol class="steps">${STEPS.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><i>${i < idx || c.statut === 'livree' ? '✔' : i + 1}</i><span>${s[1]}</span></li>`).join('')}</ol>`} <p class="status-msg">${message(c)}</p>`;
const act = [];
 if (c.prix_envoye) act.push(`<div class="price-box">Prix de la course confirmé : <b>${ar(c.prix_final)}</b>${tot(c, c.prix_final)}${c.heure_definie ? ` · Heure : <b>${esc(c.heure_definie.slice(0, 5))}</b>` : ''}${c.date_souhaitee ? ` · Date : <b>${esc(c.date_souhaitee)}</b>` : ''}</div>`);
 else if (!annulee && c.statut !== 'livree') act.push(`<div class="price-box">Prix de la course estimé : <b>${ar(c.prix_calcule)}</b> <small>(à confirmer par BOXIBY)</small>${tot(c, c.prix_calcule)}</div>`);
 if (c.devis_requis && c.prix_envoye && !+c.devis_accepte && ['en_attente', 'affectee'].includes(c.statut))
   act.push(`<button class="btn primary block" id="a-devis">Accepter le devis (${ar(c.prix_final)})</button>`);
 if (c.paiement === 'mobile_money') {
   if (+c.paye) act.push(`<p class="muted small-t" style="color:var(--ok,green)"><b>Déjà payé ✔ (Mobile Money)</b></p>`);
   else if (!annulee && c.statut !== 'livree') {
     act.push(`<div style="margin:8px 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:rgba(14,65,105,.04)">
       <b>Payer maintenant (Mobile Money)</b>
       <p class="muted small-t" style="margin:4px 0 8px">Le paiement part automatiquement de votre compte Mobile Money.</p>
       <div class="btns" style="flex-wrap:wrap;gap:8px">
         <button type="button" class="btn primary small" data-pay-ussd="mvola" data-token="${esc(c.token || T)}">MVola</button>
         <button type="button" class="btn primary small" data-pay-ussd="orange" data-token="${esc(c.token || T)}">Orange Money</button>
         <button type="button" class="btn primary small" data-pay-ussd="airtel" data-token="${esc(c.token || T)}">Airtel Money</button>
       </div></div>`);
   } else act.push(`<p class="muted small-t">Paiement Mobile Money : l'équipe BOXIBY vous contactera pour confirmer le paiement.</p>`);
 }
 if (c.annulable) act.push(`<button class="btn ghost" id="a-cancel">Annuler la demande</button>${+c.paye ? '<p class="muted small-t">Aucun remboursement après paiement en ligne.</p>' : ''}`);
 $('#box-action').hidden = !act.length; $('#box-action').innerHTML = act.join('');
 $('#a-devis')?.addEventListener('click', async () => { try { await api('client', 'accept_devis', { method: 'POST', data: { t: T } }); toast('Devis accepté.'); maj(); } catch (e) { toast(e.message); } });
 $('#a-cancel')?.addEventListener('click', async () => {
   if (!confirm(+c.paye ? "Annuler ? Aucun remboursement n'est effectué après un paiement en ligne." : 'Annuler cette demande ?')) return;
   try { await api('client', 'cancel', { method: 'POST', data: { t: T } }); maj(); } catch (e) { toast(e.message); }
 });
 $$('#box-action [data-pay-ussd]').forEach(b => b.addEventListener('click', async () => {
   b.disabled = true; const old = b.textContent; b.textContent = 'Ouverture…';
   try {
     const r = await api('client', 'pay', { method: 'POST', data: { t: T, operateur: b.dataset.payUssd } });
     lancerUSSD(r.ussd);
     toast(`Composez le code : ${r.ussd}`);
     b.textContent = 'Paiement déclaré ✔';
     setTimeout(() => { b.textContent = old; b.disabled = false; }, 4000);
   } catch (e) { toast(e.message); b.textContent = old; b.disabled = false; }
 }));
 const L1 = c.livreur;
 $('#box-livreur').hidden = !L1;
 if (L1) $('#box-livreur').innerHTML = `<div class="row">
   <div class="avatar xl">${L1.photo_profil ? `<img src="${esc(url(L1.photo_profil))}" alt="">` : `<span>${esc(initiales(L1.prenom, L1.nom))}</span>`}</div>
   <div class="grow"><div class="name">Votre livreur : ${esc(L1.prenom)} ${esc(L1.nom)}</div>
     <div class="sub">${L1.position ? (L1.position.live ? '<b class="ok-t">Position en direct</b> sur la carte' : `Dernière position connue ${ago(L1.position.age)} (pas en direct)`) : 'Position pas encore disponible'}</div></div>
   <button class="btn primary" onclick="appelerLivreur('${esc(L1.telephone)}','${esc(L1.prenom)} ${esc(L1.nom)}')">Appeler</button></div>`;
 const bc = $('#box-compte');
 bc.hidden = !c.compte_sans_mdp;
 if (c.compte_sans_mdp && !bc.dataset.ready) {
   bc.dataset.ready = '1';
   bc.innerHTML = `<h3 style="margin-top:0">Votre compte BOXIBY</h3><p class="muted small-t">Un compte a été créé à votre nom avec votre téléphone. Ajoutez un mot de passe pour retrouver vos commandes quand vous voulez.</p>
     <form id="f-pass" class="pt-row"><input type="password" name="mdp" minlength="6" required placeholder="Mot de passe (6 caractères minimum)" autocomplete="new-password"><button class="btn primary small">Créer mon mot de passe</button></form>`;
   $('#f-pass').addEventListener('submit', async (e) => {
     e.preventDefault();
     try { await api('client', 'set_password', { method: 'POST', data: { t: T, mot_de_passe: e.target.mdp.value } }); bc.hidden = true; toast('Mot de passe créé : vous êtes connecté.'); }
     catch (ex) { toast(ex.message); }
   });
 }
 renderRate();
 $('#box-detail').innerHTML = `<h3>Détails</h3><dl class="kv">
   <dt>Récupération</dt><dd>${esc(c.depart_adresse)}</dd><dt>Livraison</dt><dd>${esc(c.arrivee_adresse)}</dd>
   <dt>Distance</dt><dd>${c.distance_km} km</dd>${+c.achat_requis ? `<dt>Achat</dt><dd>${c.recupere ? 'Effectué' : 'À effectuer par le livreur'}${c.montant_achat != null ? ' — ' + ar(c.montant_achat) : ''}</dd>` : ''}${c.type_colis ? `<dt>Colis</dt><dd>${esc(c.type_colis)}</dd>` : ''}
   ${c.articles?.length ? `<dt>Articles</dt><dd>${c.articles.map(a => `<div class="item-line">${a.photo ? `<img class="mini" loading="lazy" src="${esc(url(a.photo))}" alt="">` : ''}<span>${a.quantite} × ${esc(a.nom)} — ${ar(a.quantite * a.prix_unitaire)}${+a.option_unitaire ? `<br><small>+ ${esc(a.option_nom || 'option')} × ${a.quantite} : ${ar(a.quantite * a.option_unitaire)}</small>` : ''}</span>${a.option_photo ? `<img class="mini" loading="lazy" src="${esc(url(a.option_photo))}" alt="${esc(a.option_nom || '')}">` : ''}</div>`).join('')}</dd>` : ''}
   ${c.ordonnance ? `<dt>Ordonnance</dt><dd><a href="${esc(url(c.ordonnance))}" target="_blank" rel="noopener">Voir le fichier joint</a></dd>` : ''}
   ${c.details ? `<dt>Informations</dt><dd style="white-space:pre-wrap">${esc(c.details)}</dd>` : ''}
   ${c.photo_livraison ? `<dt>Preuve de livraison</dt><dd><a href="${esc(url(c.photo_livraison))}" target="_blank" rel="noopener">Voir la photo</a></dd>` : ''}</dl>`;

 const btnLiv = $('#btn-call-livreur');
 const btnAdm = $('#btn-call-admin');
 if (btnLiv) {
   if (L1 && L1.telephone) {
     btnLiv.disabled = false;
     btnLiv.onclick = () => appelerLivreur(L1.telephone, `${L1.prenom} ${L1.nom}`);
   } else {
     btnLiv.disabled = true;
     btnLiv.onclick = () => toast('Aucun livreur affecté pour le moment.');
   }
 }
 if (btnAdm) {
   const adminTel = btnAdm.dataset.tel || '0340000000';
   btnAdm.onclick = () => appelerAdmin(adminTel, 'BOXIBY');
 }
}
function message(c) {
if (c.statut === 'annulee') return '';
if (c.statut === 'livree') return `Votre demande a été livrée${c.livree_le ? ' le ' + dt(c.livree_le) : ''}. Merci de votre confiance !`;
if (c.statut === 'en_cours') {
const nom = c.livreur ? esc(c.livreur.prenom) : 'Votre livreur';
if (+c.achat_requis && !c.recupere) return `${nom} effectue votre achat dans la zone indiquée. La livraison suivra dès que l'achat est fait.`;
if (+c.achat_requis) return `Achat effectué${c.montant_achat != null ? ' (' + ar(c.montant_achat) + ')' : ''} : ${nom} est en route pour vous livrer.`;
return c.livreur ? `${nom} est en route : suivez-le sur la carte.` : 'Votre course est en cours.';
}
if (c.statut === 'affectee') return 'Un livreur vous a été affecté et doit confirmer la mission.';
if (!c.prix_envoye) return "Votre demande est en cours de vérification par l'équipe BOXIBY.";
if (c.devis_requis && !+c.devis_accepte) return 'Un devis vous a été envoyé : acceptez-le pour que nous lancions la course.';
return 'Prix confirmé. Un livreur disponible va vous être affecté.';
}
function renderRate() {
const c = C, box = $('#box-rate');
if (c.statut !== 'livree') { box.hidden = true; return; }
const cibles  = [['livreur', c.a_livreur_note ? 'le livreur' : null], ['operateur', c.operateur ?  `l'opérateur (${esc(c.operateur)})`  : null]].filter(x => x[1]);
const todo = cibles.filter(x => !c.evalue.includes(x[0]));
box.hidden = !cibles.length;
if (!cibles.length) return;
box.innerHTML = '<h3>Votre satisfaction</h3>' + (todo.length ? todo.map(([k, lbl]) =>  `<div class="rate" data-cible="${k}"><p>Comment évaluez-vous ${lbl} ?</p><div class="smileys"><button data-note="1"><i>😞</i>Pas satisfait</button><button data-note="2"><i>😐</i>Peut améliorer</button><button data-note="3"><i>😊</i>Satisfait</button></div></div>`).join('')
: '<p class="muted">Merci pour votre évaluation !</p>');
box.querySelectorAll('.rate button').forEach(b => b.addEventListener('click', async () => {
try { await api('client', 'rate', { method: 'POST', data: { t: T, cible: b.closest('.rate').dataset.cible, note: +b.dataset.note } }); maj(); } catch (e) { toast(e.message); }
}));
}
function majCarte() {
const c = C, A = [c.depart_lat, c.depart_lng], B = [c.arrivee_lat, c.arrivee_lng];
upsert(store, 'A', A, () => pin('A', 'dest'), layer, 'Récupération : ' + esc(c.depart_adresse));
upsert(store, 'B', B, () => pin('B', 'dest'), layer, 'Livraison : ' + esc(c.arrivee_adresse));
if (!routed) { routed = true; route(A, B).then(line => { L.polyline(line || [A, B], { color: '#BC5719', weight: 4, opacity: .8, dashArray: line ? null : '8 8' }).addTo(layer); }); }
const bounds = L.latLngBounds([A, B]);
const liv = c.livreur?.position;
if (liv) {
const st = liv.live ? '' : 'stale';
upsert(store, 'L', [liv.lat, liv.lng], () => pin(initiales(c.livreur.prenom, c.livreur.nom), st, c.livreur.photo_profil), layer,
`<b>${esc(c.livreur.prenom)}</b> — votre livreur<br>${liv.live ? 'Position en direct' : 'Dernière position connue ' + ago(liv.age)}`, st).setZIndexOffset(800);
bounds.extend([liv.lat, liv.lng]);
} else if (store.L) { store.L.remove(); delete store.L; }
if (me) bounds.extend(me);
if (!fitted || (liv && !livFitted)) { map.fitBounds(bounds.pad(0.35)); fitted = true; if (liv) livFitted = true; }
$('#btn-fit').onclick = () => map.fitBounds(bounds.pad(0.35));
}
let me = null, stop = null, lastSent = 0;
const share = $('#share');
function startShare() {
    $('#geo-msg').textContent = '🔍 Localisation en cours…';
    $('#geo-msg').className = 'muted small-t';
    
    stop = watchPosition((p) => {
        me = [p.lat, p.lng];
        const acc = Math.round(p.acc);
        upsert(store, 'ME', me, () => pin('Moi', 'client'), layer, `Votre position (±${acc} m)`);
        $('#geo-msg').textContent = `📍 Position partagée en temps réel (±${acc} m)`;
        $('#geo-msg').className = 'muted small-t ok-t';
        
        if (Date.now() - lastSent > 3000 && C && ['en_attente', 'affectee', 'en_cours'].includes(C.statut)) {
            lastSent = Date.now(); 
            api('client', 'position', { method: 'POST', data: { t: T, lat: p.lat, lng: p.lng } }).catch(() => {});
        }
    }, (e) => {
        $('#geo-msg').textContent = geoMessage(e);
        $('#geo-msg').className = 'muted small-t';
        if (e.code === 1 || e.code === 0) { 
            share.checked = false; 
            stop?.(); 
            stop = null; 
            try { localStorage.setItem('bx-share', 'off'); } catch (_) {} 
        }
    });
}
share.addEventListener('change', () => {
try { localStorage.setItem('bx-share', share.checked ? 'on' : 'off'); } catch (_) {}
if (share.checked) startShare();
else {
stop?.(); stop = null; me = null;
if (store.ME) { store.ME.remove(); delete store.ME; }
api('client', 'position', { method: 'POST', data: { t: T, off: 1 } }).catch(() => {});
$('#geo-msg').textContent = 'Partage de position désactivé.';
}
});
share.checked = localStorage.getItem('bx-share') === 'on';
if (share.checked) startShare();
else $('#geo-msg').textContent = 'Le partage de votre position est désactivé. Cochez la case pour que le livreur vous retrouve plus facilement.';
maj();
setInterval(() => { if (!document.hidden) maj(); }, 3000);
})();