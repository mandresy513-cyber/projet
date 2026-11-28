/* BOXIBY — Gestion : carte en direct, demandes, livreurs, clients, partenaires, statistiques */
(() => {
'use strict';
const { $, $$, esc, url, ar, initiales, api, toast, beep, initTheme, makeMap, pin, route, upsert, prune, ago } = BXC;
const ico = (id) => `<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;"><use href="#i-${id}"></use></svg>`;
const map = makeMap('map');
const layerLiv = L.layerGroup().addTo(map), layerCli = L.layerGroup().addTo(map), layerCourse = L.layerGroup().addTo(map);
const mLiv = {}, mCli = {};
let DATA = { livreurs: [], commandes: [], clients: [], partenaires: [], stats: {} };
let fCmd = 'actives', fCli = 'tous', known = null;
let searchPart = '';
const sigs = {};
const SERVICE = { colis: 'Colis', achat: 'Achat pour compte', deplacement: 'Déplacement' };
const STATUT = { en_attente: ['En attente', 'warn'], affectee: ['Affectée', 'blue'], en_cours: ['En cours', 'blue'], livree: ['Livrée', 'ok'], annulee: ['Annulée', ''] };
const STAT_CLI = { sans_commande: ["N'a pas commandé", ''], a_commande: ['A commandé', 'warn'], deja_commande: ['A déjà commandé', 'ok'] };
const STAT_LIV = { disponible: ['Disponible', 'ok'], en_mission: ['En mission', 'warn'], en_pause: ['En pause', ''] };
const badge = ([t, c]) => `<span class="badge ${c}">${t}</span>`;
const tel = (t) => `<a href="tel:${esc(t)}">${esc(t)}</a>`;
const dt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '');
const full = (o, p = 'prenom', n = 'nom') => `${esc(o[p])} ${esc(o[n])}`;
const avatar = (u, cls = '') => {
    const inner = u.photo_profil ? `<img src="${esc(url(u.photo_profil))}" alt="">` : `<span>${esc(initiales(u.prenom, u.nom))}</span>`;
    return u.uid ? `<div class="avatar click ${cls}" data-profile="${u.uid}" title="Voir le profil">${inner}</div>` : `<div class="avatar ${cls}">${inner}</div>`;
};

async function charger(first = false) {
    try { DATA = await api('admin', 'dashboard'); } catch (e) { if (first) toast(e.message); return; }
    notifierNouvelles();
    stats(); majCarte();
    render('cmd', DATA.commandes.map(stripC).concat(fCmd), '#list-cmd', rendreCommandes);
    render('liv', DATA.livreurs.map(l => ({ ...l, position: null, colis: l.colis.map(stripC) })), '#tab-livreurs', rendreLivreurs);
    render('cli', DATA.clients.map(c => ({ ...c, lat: 0, lng: 0 })).concat(fCli), '#list-clients', rendreClients);
    render('typ', DATA.types, '#list-types', rendreTypes);
    render('par', DATA.partenaires.concat(searchPart), '#list-part', rendrePartenaires);
    render('sta', DATA.stats, '#tab-stats', rendreStats);
}
const stripC = (c) => ({ ...c, client_lat: 0, client_lng: 0, client_pos_at: 0, client_pos_age: 0 });
function render(key, data, sel, fn) {
    const s = JSON.stringify(data);
    const box = $(sel);
    if (sigs[key] === s) return;
    if (box.contains(document.activeElement) && document.activeElement.matches('input,select,textarea')) return;
    sigs[key] = s; fn(box);
}
function notifierNouvelles() {
    const ids = new Set(DATA.commandes.filter(c => c.statut === 'en_attente').map(c => c.id));
    if (known) {
        const neuves = [...ids].filter(i => !known.has(i));
        if (neuves.length) { beep(); toast(`${neuves.length} nouvelle(s) demande(s) reçue(s)`); }
    }
    known = ids;
}
function stats() {
    const c = DATA.commandes;
    $('#st-liv').textContent = DATA.livreurs.filter(l => l.position?.live).length;
    $('#st-att').textContent = c.filter(x => x.statut === 'en_attente').length;
    $('#st-cours').textContent = c.filter(x => ['affectee', 'en_cours'].includes(x.statut)).length;
    $('#st-jour').textContent = DATA.stats.livrees_jour ?? 0;
    $('#n-cmd').textContent = c.filter(x => ['en_attente', 'affectee', 'en_cours'].includes(x.statut)).length;
    $('#n-liv').textContent = DATA.livreurs.length;
    $('#n-cli').textContent = DATA.clients.length;
}
function majCarte() {
    const keepL = new Set();
    DATA.livreurs.forEach(l => {
        if (!l.position) return;
        keepL.add(String(l.id));
        const st = l.position.live ? '' : 'stale';
        upsert(mLiv, l.id, [l.position.lat, l.position.lng], () => pin(initiales(l.prenom, l.nom), st, l.photo_profil), layerLiv,
            `<b>${full(l)}</b><br>${tel(l.telephone)}<br>${esc(l.code_boxiby)} · ${STAT_LIV[l.statut][0]}<br>${l.position.live ? '<b class="ok-t">Position en direct</b>' : 'Dernière position connue ' + ago(l.position.age) + ' (pas en direct)'}`, st).setZIndexOffset(500);
    });
    prune(mLiv, keepL);
    const keepC = new Set();
    DATA.commandes.filter(c => c.client_lat != null && ['en_attente', 'affectee', 'en_cours'].includes(c.statut)).forEach(c => {
        keepC.add(String(c.id));
        const st = c.client_pos_age != null && c.client_pos_age > 120 ? 'stale' : '';
        upsert(mCli, c.id, [c.client_lat, c.client_lng], () => pin('C', ('client ' + st).trim()), layerCli,
            `<b>${full(c, 'client_prenom', 'client_nom')}</b><br>${tel(c.client_tel)}<br>${esc(c.reference)}<br>${st ? 'Dernière position connue ' + ago(c.client_pos_age) : 'Position en direct'}`, st);
    });
    prune(mCli, keepC);
}
function aller(lat, lng, msg) {
    if (lat == null || lng == null) return toast(msg || 'Position non disponible.');
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyTo([lat, lng], 16, { duration: 1 });
}
const voirLivreur = (id) => { const l = DATA.livreurs.find(x => x.id == id); if (!l?.position) return toast('Position du livreur non disponible.'); aller(l.position.lat, l.position.lng); mLiv[id]?.openPopup(); if (!l.position.live) toast(`Dernière position connue ${ago(l.position.age)} : le livreur n'est pas en direct.`); };
const voirClient = (cmdId) => { const c = DATA.commandes.find(x => x.id == cmdId); aller(c?.client_lat, c?.client_lng, "Le client n'a pas partagé sa position."); mCli[cmdId]?.openPopup(); };
async function trajetCommande(id) {
    const c = DATA.commandes.find(x => x.id == id); if (!c) return;
    layerCourse.clearLayers();
    const a = [c.depart_lat, c.depart_lng], b = [c.arrivee_lat, c.arrivee_lng];
    L.marker(a, { icon: pin('A', 'dest') }).bindPopup('Récupération : ' + esc(c.depart_adresse)).addTo(layerCourse);
    L.marker(b, { icon: pin('B', 'dest') }).bindPopup('Livraison : ' + esc(c.arrivee_adresse)).addTo(layerCourse);
    const line = await route(a, b);
    L.polyline(line || [a, b], { color: '#BC5719', weight: 5, dashArray: line ? null : '8 8' }).addTo(layerCourse);
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyToBounds(L.latLngBounds([a, b]).pad(0.4), { duration: 1 });
}
async function voirCourse(id) {
    const l = DATA.livreurs.find(x => x.id == id); if (!l) return;
    layerCourse.clearLayers();
    let pts = [];
    try { pts = (await api('admin', 'course', { params: `&livreur_id=${id}` })).trace.map(p => [+p.lat, +p.lng]); } catch (e) { return toast(e.message); }
    if (pts.length > 1) L.polyline(pts, { color: '#BC5719', weight: 5 }).addTo(layerCourse);
    const bounds = L.latLngBounds(pts);
    if (l.position) bounds.extend([l.position.lat, l.position.lng]);
    l.colis.forEach(c => {
        const to = c.recupere_le ? [c.arrivee_lat, c.arrivee_lng] : [c.depart_lat, c.depart_lng];
        L.marker(to, { icon: pin(c.recupere_le ? 'B' : 'A', 'dest') }).bindPopup(esc(c.reference)).addTo(layerCourse);
        if (l.position) L.polyline([[l.position.lat, l.position.lng], to], { color: '#0E4169', weight: 3, dashArray: '6 8' }).addTo(layerCourse);
        bounds.extend(to);
    });
    if (!bounds.isValid()) return toast('Aucune course à afficher.');
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyToBounds(bounds.pad(0.3), { duration: 1 });
}
function rendreCommandes(box) {
    const liste = DATA.commandes.filter(c => fCmd === 'tous' || (fCmd === 'actives' ? ['en_attente', 'affectee', 'en_cours'].includes(c.statut) : c.statut === fCmd));
    if (!liste.length) { box.innerHTML = `<div class="empty-big">Aucune demande dans cette catégorie.</div>`; return; }
    box.innerHTML = liste.map(c => {
        const ouvert = ['en_attente', 'affectee'].includes(c.statut);
        const needsH = c.service !== 'colis' || c.mode === 'planifiee';
        const prix = c.prix_final ?? c.prix_calcule;
        return `<article class="card" data-cmd="${c.id}">
<div class="row wrap-m">
<div class="avatar"><span>${esc(initiales(c.client_prenom, c.client_nom))}</span></div>
<div class="grow">
<div class="name">${full(c, 'client_prenom', 'client_nom')} ${badge(STATUT[c.statut])} <span class="badge">${SERVICE[c.service]}${c.mode ? ' · ' + (c.mode === 'express' ? 'Express' : 'Planifiée') : ''}</span>${+c.achat_requis ? ' <span class="badge warn">Achat puis livraison</span>' : ''}</div>
<div class="sub">${tel(c.client_tel)} · ${esc(c.reference)} · ${dt(c.cree_le)}</div>
</div>
<div class="btns">
<button class="btn map" data-client-pos="${c.id}" ${c.client_lat != null ? '' : 'disabled'}>Sa position</button>
<button class="btn map" data-trajet="${c.id}">Trajet</button>
${c.livreur_id ? `<button class="btn map" data-liv-pos="${c.livreur_id}">Livreur : ${esc(c.livreur_prenom)}</button>` : ''}
</div>
</div>
<div class="detail">
<div><b>A</b> ${esc(c.depart_adresse)} → <b>B</b> ${esc(c.arrivee_adresse)}</div>
${+c.achat_requis ? `<div class="sub">Le livreur achète d'abord dans la zone A, puis livre en B — ${c.recupere_le ? '<b class="ok-t">achat effectué</b>' + (c.montant_achat != null ? ' (' + ar(c.montant_achat) + ')' : '') : 'achat pas encore fait'}</div>` : ''}
<div class="sub">${c.distance_km} km · calculé ${ar(c.prix_calcule)}${+c.montant_articles || +c.montant_options ? ' · total client ' + ar((c.prix_final ?? c.prix_calcule) + +c.montant_articles + +c.montant_options) : ''}${c.date_souhaitee ? ' · pour le ' + esc(c.date_souhaitee) : ''}${c.heure_definie ? ' à ' + esc(c.heure_definie.slice(0, 5)) : ''} · ${c.paiement === 'mobile_money' ? 'Mobile Money' : 'À la livraison'}
${+c.paye ? '<span class="badge ok" style="margin-left:4px;">Déjà payé ✔</span>' : (+c.paiements_attente ? '<span class="badge warn" style="margin-left:4px;">Paiement déclaré — en vérification</span>' : `<button class="link" data-paye="${c.id}" style="margin-left:4px;">Marquer payé</button>`)} ${c.paiement === 'mobile_money' ? '<span class="badge" style="margin-left:4px;">Mobile Money</span>' : ''} ${c.operateur_prenom ? ' · opérateur ' + esc(c.operateur_prenom) : ''}</div>
${c.partenaire_nom ? `<div class="sub">Partenaire : ${esc(c.partenaire_nom)}${c.type_nom ? ' (' + esc(c.type_nom) + ')' : ''}</div>` : (c.type_nom ? `<div class="sub">Catégorie : ${esc(c.type_nom)}</div>` : '')}
${c.type_colis ? `<div class="sub">Colis : ${esc(c.type_colis)}</div>` : ''}
${c.details ? `<div class="note">${esc(c.details)}</div>` : ''}
${c.articles?.length ? `<div class="note"><b>Articles commandés</b>${c.articles.map(a => `<div class="item-line">${a.photo ? `<img class="mini" loading="lazy" src="${esc(url(a.photo))}" alt="">` : ''}<span>${a.quantite} × ${esc(a.nom)} — ${ar(a.quantite * a.prix_unitaire)}${+a.option_unitaire ? `<br><small>+ ${esc(a.option_nom || 'option')} × ${a.quantite} : ${ar(a.quantite * a.option_unitaire)}</small>` : ''}</span>${a.option_photo ? `<img class="mini" loading="lazy" src="${esc(url(a.option_photo))}" alt="${esc(a.option_nom || '')}">` : ''}</div>`).join('')}<b>Articles ${ar(c.montant_articles)} · Options ${ar(c.montant_options)}</b></div>` : ''}
${c.ordonnance ? `<div class="sub">Ordonnance / pièce jointe : <a href="${esc(url(c.ordonnance))}" target="_blank" rel="noopener">ouvrir</a>${/.pdf$/i.test(c.ordonnance) ? '' : `<br><a href="${esc(url(c.ordonnance))}" target="_blank" rel="noopener"><img class="rx-img" loading="lazy" src="${esc(url(c.ordonnance))}" alt="Ordonnance"></a>`}</div>` : ''}
${c.photo_livraison || c.signature ? `<div class="sub">Preuve de livraison : ${c.photo_livraison ? `<a href="${esc(url(c.photo_livraison))}" target="_blank" rel="noopener">photo</a>` : ''} ${c.signature ? `· <a href="${esc(url(c.signature))}" target="_blank" rel="noopener">signature</a>` : ''}</div>` : ''}
</div>
${ouvert ? `<div class="workflow">
<div class="wf-row">
<label>Prix (Ar) <input type="number" min="0" step="100" data-prix value="${prix}"></label>
${needsH ? `<label>Heure<input type="time" data-heure value="${c.heure_definie ? c.heure_definie.slice(0, 5) : ''}"></label>` : ''}
<button class="btn ghost small" data-send-prix="${c.id}">${+c.prix_envoye ? 'Renvoyer' : 'Valider et envoyer'} au client</button>
</div>
<div class="sub">${+c.prix_envoye ? `Prix envoyé : <b>${ar(c.prix_final)}</b>` : "Prix pas encore envoyé au client."}
${+c.devis_requis ? (+c.devis_accepte ? ' · <b class="ok-t">Devis accepté ✔</b>' : ' · en attente de la validation du devis par le client') : ''}
${c.statut === 'affectee' ? `· <b>en attente d'acceptation par ${esc(c.livreur_prenom)}</b> (3 min)` : ''}</div>
<div class="btns">
<button class="btn primary small" data-assign="${c.id}" data-ref="${esc(c.reference)}">${c.statut === 'affectee' ? 'Changer de livreur' : 'Affecter un livreur'}</button>
<button class="btn ghost small" data-cancel="${c.id}">Annuler la demande</button>
</div>
</div>` : (c.statut === 'en_cours' ? `<div class="workflow"><div class="sub">Livreur : <b>${esc(c.livreur_prenom)} ${esc(c.livreur_nom)}</b> — course en cours.</div>
<div class="btns"><button class="btn ghost small" data-cancel="${c.id}">Annuler la course</button></div></div>` : '')}
</article>`;
    }).join('');
}

/* ===== LIVREURS : avec bouton Modifier ===== */
function rendreLivreurs(box) {
    if (!DATA.livreurs.length) { box.innerHTML = `<div class="empty-big">Aucun livreur pour le moment.<br>Cliquez sur « + Ajouter un livreur ».</div>`; return; }
    box.innerHTML = DATA.livreurs.map(l => `<article class="card">
<div class="row wrap-m">
${avatar(l)}
<div class="grow">
<div class="name">${full(l)} ${badge(STAT_LIV[l.statut])}</div>
<div class="sub">Appeler : ${tel(l.telephone)} · ${esc(l.code_boxiby)} · ${esc(l.code_im)}${l.gps_moto ? ' · GPS : ' + esc(l.gps_moto) : ''}${l.tracer_telephone ? '' : ' · suivi GPS moto'}</div>
</div>
<div class="btns">
<button class="btn map" data-liv-pos="${l.id}">Sa position</button>
<button class="btn map" data-liv-course="${l.id}">Sa course</button>
</div>
</div>
<div class="colis">
${l.colis.length ? `<h4>Colis à livrer (${l.colis.length})</h4>` + l.colis.map(c => `<div class="row wrap-m">
<div class="avatar"><span>${esc(initiales(c.client_prenom, c.client_nom))}</span></div>
<div class="grow"><div class="name">${full(c, 'client_prenom', 'client_nom')} ${badge(STATUT[c.statut])}${+c.paye ? ' <span class="badge ok">Déjà payé ✔</span>' : ''}</div>
<div class="sub">${tel(c.client_tel)} · ${esc(c.reference)} · ${c.paiement === 'mobile_money' ? 'Mobile Money' : 'À la livraison'}</div></div>
<button class="btn map" data-client-pos="${c.id}">Sa position</button>
</div>`).join('') : `<p class="empty">Ce livreur n'a pas de colis à livrer.</p>`}
</div>
<div class="btns" style="margin-top:10px">
<button class="btn ghost small" data-edit-liv="${l.id}">${ico('edit')} <span class="btn-text">Modifier</span></button>
<button class="btn ghost small" data-reset-pin="${l.id}">Nouveau code secret</button>
<button class="btn ghost small" data-remove-liv="${l.id}">Retirer</button>
</div>
</article>`).join('');
}

function rendreClients(box) {
    const liste = DATA.clients.filter(c => fCli === 'tous' || c.statut_client === fCli);
    if (!liste.length) { box.innerHTML = `<div class="empty-big">Aucun client dans cette catégorie.</div>`; return; }
    box.innerHTML = liste.map(c => `<article class="card"><div class="row wrap-m">
${avatar(c)}
<div class="grow"><div class="name">${full(c)} ${badge(STAT_CLI[c.statut_client])} ${+c.a_mot_de_passe ? '' : badge(['Sans mot de passe', ''])}</div>
<div class="sub">${tel(c.telephone)} · ${c.total_commandes} commande(s)</div></div>
<button class="btn map" data-pt="${c.lat ?? ''}|${c.lng ?? ''}" ${c.lat != null ? '' : 'disabled'}>Sa position</button>
</div></article>`).join('');
}

function rendreTypes(box) {
    box.innerHTML = DATA.types.map(t => `<article class="card type-card"><div class="row wrap-m">
<div class="grow"><div class="name">${esc(t.nom)} ${+t.systeme ? badge(['Par défaut', 'blue']) : ''} ${+t.catalogue ? badge(['Catalogue photos', 'ok']) : badge(['Sans catalogue', ''])} ${+t.options ? badge(['Options photo + prix', 'warn']) : ''} ${+t.actif ? '' : badge(['Masqué aux clients', 'warn'])}</div>
<div class="sub">${+t.systeme ? "Le client remplit un formulaire (médicaments souhaités) et joint son ordonnance en scan ou en photo. Aucun catalogue, aucune photo." : (+t.catalogue ? 'Les clients voient les photos, descriptions et prix du catalogue.' : 'Le client décrit ce qu\'il veut acheter.')} · ${t.nb_partenaires} partenaire(s)</div>
</div>
${+t.systeme ? '' : `<div class="btns icon-btns">
<button class="btn ghost small icon-btn" type="button" data-type-edit="${t.id}" title="Modifier">${ico('edit')} <span class="btn-text">Modifier</span></button>
<button class="btn ghost small icon-btn" type="button" data-type-toggle="${t.id}" title="${+t.actif ? 'Masquer' : 'Afficher'}">${ico(+t.actif ? 'eye' : 'eye-off')} <span class="btn-text">${+t.actif ? 'Masquer' : 'Afficher'}</span></button>
<button class="btn ghost small icon-btn" type="button" data-type-del="${t.id}" title="Supprimer">${ico('trash')} <span class="btn-text">Supprimer</span></button>
</div>`}
</div></article>`).join('');
}

const openParts = new Set(); let APER = {};
function apercuHtml(p) {
    const items = APER[p.id];
    if (!items) return '<p class="sub">Chargement du catalogue…</p>';
    if (!items.length) return '<p class="sub">Catalogue vide : cliquez sur « Gérer », puis « Ajouter / gérer le catalogue ».</p>';
    return `<h4>Catalogue (${p.nb_articles})</h4><div class="pc-grid">${items.map(a => `<div class="pc-item ${+a.actif ? '' : 'off'}">
<div class="pc-img">${a.photo ? `<img loading="lazy" src="${esc(url(a.photo))}" alt="">` : '<span>Pas de photo</span>'}</div>
<div class="pc-body"><b>${esc(a.nom)}</b><span class="art-price">${ar(a.prix)}</span>
${a.option_nom ? `<small class="pc-opt">${a.option_photo ? `<img src="${esc(url(a.option_photo))}" alt="">` : ''}+ ${esc(a.option_nom)} ${ar(a.option_prix)}</small>` : ''}${+a.actif ? '' : '<small>masqué aux clients</small>'}</div>
</div>`).join('')}</div>${+p.nb_articles > items.length ? `<button class="btn ghost small" type="button" data-part-cat="${p.id}">Voir tout le catalogue (${p.nb_articles})</button>` : ''}`;
}
function chargerApercus() {
    api('admin', 'partner_previews').then(r => {
        APER = r;
        $$('.part-catalog').forEach(el => { const p = DATA.partenaires.find(x => x.id == el.dataset.pc); if (p) el.innerHTML = apercuHtml(p); });
    }).catch(() => {});
}
function rendrePartenaires(box) {
    const q = searchPart.toLowerCase();
    const filtered = DATA.partenaires.filter(p =>
        p.nom.toLowerCase().includes(q) ||
        p.adresse.toLowerCase().includes(q) ||
        p.type_nom.toLowerCase().includes(q)
    );
    if (!filtered.length) { box.innerHTML = `<div class="empty-big">Aucun partenaire ne correspond à "${esc(searchPart)}".</div>`; return; }
    box.innerHTML = filtered.map(p => {
        const cat = !!+p.catalogue, ouvert = openParts.has(p.id);
        return `<article class="card part" data-pid="${p.id}">
<div class="part-head">
<div class="avatar lg">${cat && p.photo ? `<img src="${esc(url(p.photo))}" alt="" loading="lazy">` : `<span>${esc(initiales(p.nom, p.nom.split(' ')[1] || ''))}</span>`}</div>
<div class="part-info">
<div class="name">${esc(p.nom)} <span class="badge">${esc(p.type_nom)}</span> ${+p.actif ? '' : badge(['Désactivé', 'warn'])}</div>
<div class="sub">${esc(p.adresse)}${p.telephone ? ' · ' + esc(p.telephone) : ''}${p.latitude != null ? '' : ' · position non localisée'}</div>
<div class="sub">${cat ? `${p.nb_articles} article(s)${+p.t_options ? ' · ' + p.nb_options + ' option(s)' : ''}` : 'Sans catalogue : formulaire + ordonnance'}</div>
</div>
<div class="part-action-btn">
<button class="btn primary small part-toggle" type="button" data-part-manage="${p.id}" aria-expanded="${ouvert}">
${ouvert ? ico('x') : ico('settings')} <span class="btn-text">${ouvert ? 'Fermer' : 'Gérer'}</span>
</button>
</div>
</div>
<div class="part-manage" ${ouvert ? '' : 'hidden'}>
<div class="btns icon-btns">
<button class="btn ghost small icon-btn" type="button" data-part-edit="${p.id}">${ico('edit')} <span class="btn-text">Modifier</span></button>
${cat ? `<button class="btn primary small icon-btn" type="button" data-part-cat="${p.id}">${ico('box')} <span class="btn-text">${+p.nb_articles ? 'Gérer le catalogue' : 'Ajouter au catalogue'}</span></button>` : ''}
<button class="btn ghost small icon-btn" type="button" data-part-toggle="${p.id}">${ico(+p.actif ? 'eye' : 'eye-off')} <span class="btn-text">${+p.actif ? 'Désactiver' : 'Activer'}</span></button>
<button class="btn ghost small icon-btn" type="button" data-part-del="${p.id}">${ico('trash')} <span class="btn-text">Retirer</span></button>
</div>
</div>
${cat ? `<div class="part-catalog" data-pc="${p.id}">${apercuHtml(p)}</div>` : `<p class="sub part-nocat">Pas de catalogue : le client remplit un formulaire et joint la photo de son ordonnance.</p>`}
</article>`;
    }).join('');
    chargerApercus();
}

function rendreStats(box) {
    const s = DATA.stats, max = Math.max(1, ...(s.par_jour || []).map(x => +x.n));
    const smiley = (x) => `😞 ${x.s1} · 😐 ${x.s2} · 😊 ${x.s3}`;
    const bloc = (cible, titre) => {
        const rows = (s.satisfaction || []).filter(x => x.cible === cible);
        return `<h3>${titre}</h3>` + (rows.length ? rows.map(x => `<div class="card row"><div class="grow"><div class="name">${esc(x.prenom)} ${esc(x.nom)}</div><div class="sub">${x.n} avis · ${smiley(x)}</div></div><span class="badge ok">${x.moy}/3</span></div>`).join('') : `<p class="empty">Pas encore d'évaluation.</p>`);
    };
    box.innerHTML = `<div class="card"><h3>Courses livrées par jour (7 derniers jours)</h3>
<div class="bars">${(s.par_jour || []).map(x => `<div class="bar"><i style="height:${Math.round(+x.n / max * 100)}%"></i><b>${x.n}</b><span>${x.jour.slice(8)}/${x.jour.slice(5, 7)}</span></div>`).join('') || '<p class="empty">Aucune course livrée.</p>'}</div>
<p class="sub">Demandes reçues aujourd'hui : <b>${s.aujourdhui ?? 0}</b> · livrées aujourd'hui : <b>${s.livrees_jour ?? 0}</b></p></div>
${bloc('livreur', 'Satisfaction — livreurs')}${bloc('operateur', 'Satisfaction — opérateurs')}`;
}

async function ouvrirProfil(id) {
    const dlg = $('#dlg-profile'), body = $('#profile-body');
    body.innerHTML = '<p class="muted">Chargement…</p>'; dlg.showModal();
    try {
        const u = await api('admin', 'user', { params: `&id=${id}` });
        const av = u.photo_profil ? `<img src="${esc(url(u.photo_profil))}" alt="">` : `<span>${esc(initiales(u.prenom, u.nom))}</span>`;
        let extra = '';
        if (u.livreur) extra = `<dt>Code IM</dt><dd>${esc(u.livreur.code_im)}</dd><dt>ID BOXIBY</dt><dd>${esc(u.livreur.code_boxiby)}</dd><dt>GPS de la moto</dt><dd>${esc(u.livreur.gps_moto || '—')}</dd><dt>Suivi téléphone</dt><dd>${+u.livreur.tracer_telephone ? 'Activé' : 'Désactivé'}</dd><dt>Statut</dt><dd>${STAT_LIV[u.livreur.statut][0]}</dd><dt>Courses livrées</dt><dd>${u.livreur.livrees}</dd>`;
        if (u.client) extra = `<dt>Commandes</dt><dd>${u.client.total_commandes} (${u.client.commandes_en_cours} en cours, ${u.client.commandes_livrees} livrées)</dd><dt>Statut</dt><dd>${STAT_CLI[u.client.statut_client][0]}</dd><dt>Compte</dt><dd>${+u.client.a_mot_de_passe ? 'Avec mot de passe' : 'Sans mot de passe (créé par une commande)'}</dd>`;
        body.innerHTML = `<div class="profile-top"><div class="avatar xl">${av}</div><h2>${esc(u.prenom)} ${esc(u.nom)}</h2><span class="badge blue">${{ admin: 'Équipe BOXIBY', livreur: 'Livreur', client: 'Client' }[u.role]}</span></div>
<dl class="kv"><dt>Téléphone</dt><dd>${tel(u.telephone)}</dd>${u.email ? `<dt>E-mail</dt><dd>${esc(u.email)}</dd>` : ''}${extra}<dt>Inscrit le</dt><dd>${esc((u.cree_le || '').slice(0, 10))}</dd></dl>`;
    } catch (e) { body.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
}

const post = (action, data) => api('admin', action, { method: 'POST', data });
const refresh = () => { Object.keys(sigs).forEach(k => delete sigs[k]); return charger(); };
let assignId = null;

document.getElementById('part-search')?.addEventListener('input', (e) => {
    searchPart = e.target.value.trim();
    delete sigs['par'];
    rendrePartenaires($('#list-part'));
});

/* ===== CLICK HANDLER GLOBAL avec [data-edit-liv] ===== */
document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-profile],[data-liv-pos],[data-liv-course],[data-pt],[data-client-pos],[data-trajet],[data-send-prix],[data-assign],[data-cancel],[data-paye],[data-reset-pin],[data-remove-liv],[data-edit-liv],[data-part-edit],[data-part-toggle],[data-part-del],[data-part-cat],[data-part-manage],[data-type-edit],[data-type-toggle],[data-type-del],[data-close]');
    if (!t) return;
    const ds = t.dataset;
    try {
        if (ds.profile) ouvrirProfil(ds.profile);
        else if (ds.livPos) voirLivreur(ds.livPos);
        else if (ds.livCourse) voirCourse(ds.livCourse);
        else if (ds.clientPos) voirClient(ds.clientPos);
        else if (ds.trajet) trajetCommande(ds.trajet);
        else if (ds.pt !== undefined) { const [a, b] = ds.pt.split('|'); aller(a === '' ? null : +a, b === '' ? null : +b); }
        else if (ds.sendPrix) {
            const card = t.closest('.card');
            await post('set_prix', { commande_id: +ds.sendPrix, prix: +card.querySelector('[data-prix]').value, heure: card.querySelector('[data-heure]')?.value || '' });
            toast('Prix et créneau envoyés au client.'); refresh();
        }
        else if (ds.assign) {
            assignId = ds.assign; $('#assign-ref').textContent = 'Demande ' + ds.ref;
            const dispo = DATA.livreurs.filter(l => l.statut !== 'en_pause');
            $('#assign-select').innerHTML = dispo.length ? dispo.map(l => `<option value="${l.id}">${esc(l.prenom)} ${esc(l.nom)} — ${STAT_LIV[l.statut][0]}</option>`).join('') : '<option value="">Aucun livreur disponible</option>';
            $('#dlg-assign').showModal();
        }
        else if (ds.cancel) { if (confirm('Annuler cette demande ?')) { await post('cancel', { commande_id: +ds.cancel }); refresh(); } }
        else if (ds.paye) { await post('toggle_paye', { commande_id: +ds.paye }); refresh(); }
        else if (ds.resetPin) {
            if (!confirm('Générer un nouveau code secret pour ce livreur ?')) return;
            const r = await post('reset_pin', { livreur_id: +ds.resetPin });
            const l = DATA.livreurs.find(x => x.id == ds.resetPin);
            secret(l.code_boxiby, r.pin);
        }
        else if (ds.removeLiv) { if (confirm('Retirer ce livreur ? Il ne pourra plus se connecter.')) { await post('remove_livreur', { livreur_id: +ds.removeLiv }); refresh(); } }
        else if (ds.editLiv) { ouvrirEditLivreur(ds.editLiv); }
        else if (ds.partManage) {
            const id = +ds.partManage;
            const ouvert = !openParts.has(id);
            if (ouvert) openParts.add(id); else openParts.delete(id);
            const card = t.closest('.part');
            if (card) {
                card.querySelector('.part-manage').hidden = !ouvert;
                t.innerHTML = ouvert ? ico('x') + ' <span class="btn-text">Fermer</span>' : ico('settings') + ' <span class="btn-text">Gérer</span>';
                t.setAttribute('aria-expanded', ouvert);
            }
        }
        else if (ds.partEdit) ouvrirPartenaire(DATA.partenaires.find(x => x.id == ds.partEdit));
        else if (ds.partCat) openCatalog(+ds.partCat);
        else if (ds.typeEdit) ouvrirType(DATA.types.find(x => x.id == ds.typeEdit));
        else if (ds.typeToggle) { await post('type_toggle', { id: +ds.typeToggle }); refresh(); }
        else if (ds.typeDel) { if (confirm('Supprimer ce type ?')) { await post('type_delete', { id: +ds.typeDel }); refresh(); } }
        else if (ds.partToggle) { await post('partner_toggle', { id: +ds.partToggle }); refresh(); }
        else if (ds.partDel) { if (confirm('Retirer ce partenaire ?')) { await post('partner_delete', { id: +ds.partDel }); refresh(); } }
        else if (t.hasAttribute('data-close')) t.closest('dialog').close();
    } catch (err) { toast(err.message); }
});

$$('dialog').forEach(d => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
$('#assign-ok').addEventListener('click', async () => {
    const v = $('#assign-select').value; if (!v) return;
    try { await post('assign', { commande_id: +assignId, livreur_id: +v }); $('#dlg-assign').close(); toast('Mission envoyée au livreur.'); refresh(); }
    catch (e) { toast(e.message); }
});
$$('.tab').forEach(b => b.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === b));
    ['commandes', 'livreurs', 'clients', 'partenaires', 'paiements', 'stats'].forEach(n => ($('#tab-' + n).hidden = n !== b.dataset.tab));
    if (b.dataset.tab === 'paiements') chargerPaiements();
}));
$('#chips-cmd').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; $$('#chips-cmd .chip').forEach(x => x.classList.toggle('active', x === c)); fCmd = c.dataset.f; refresh(); });
$('#chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; $$('#chips .chip').forEach(x => x.classList.toggle('active', x === c)); fCli = c.dataset.f; refresh(); });
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

syncLogoTheme();
$('#btn-theme')?.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('bx-theme', dark ? 'dark' : 'light'); } catch (_) {}
    syncLogoTheme();
});
// ==========================================
// GESTION DES NUMÉROS DE PAIEMENT (MVola / Orange Money / Airtel Money)
// Tous les admins voient les numéros ; seul le PREMIER admin peut les modifier.
// ==========================================
let PAYMENTS = { mvola: '', orange: '', airtel: '', can_edit: false };

async function loadPayments() {
    if (!$('#val-mvola') && !$('#btn-edit-pay')) return;
    try {
        const p = await api('admin', 'get_payments');
        PAYMENTS = p || PAYMENTS;
        if ($('#val-mvola')) $('#val-mvola').textContent = PAYMENTS.mvola || 'Non défini';
        if ($('#val-orange')) $('#val-orange').textContent = PAYMENTS.orange || 'Non défini';
        if ($('#val-airtel')) $('#val-airtel').textContent = PAYMENTS.airtel || 'Non défini';
        if (PAYMENTS.can_edit && $('#btn-edit-pay')) $('#btn-edit-pay').style.display = 'inline-block';
    } catch (_) {}
}
loadPayments(); // <-- On lance le chargement

/* ----- Liste des paiements Mobile Money (avec remarque « Déjà payé ») ----- */
const OP_NOM = { mvola: 'MVola', orange: 'Orange Money', airtel: 'Airtel Money' };
async function chargerPaiements() {
    const box = $('#list-paiements');
    if (!box) return;
    try {
        const r = await api('admin', 'paiements');
        const list = r.paiements || [];
        if (!list.length) { box.innerHTML = '<p class="empty-big">Aucun paiement Mobile Money pour le moment.</p>'; return; }
        box.innerHTML = list.map(p => {
            const total = (+p.montant) || ((+(p.prix_final ?? p.prix_calcule) || 0) + (+p.montant_articles || 0) + (+p.montant_options || 0));
            return `<article class="card"><div class="row wrap-m">
<div class="grow">
<div class="name">${full(p, 'client_prenom', 'client_nom')} ${+p.paye ? '<span class="badge ok">Déjà payé ✔</span>' : '<span class="badge warn">En vérification</span>'} ${badge(STATUT[p.cmd_statut] || ['', ''])}</div>
<div class="sub">${esc(p.reference)} · ${tel(p.client_tel)} · ${OP_NOM[p.operateur] || esc(p.operateur)} vers ${esc(p.numero)} · ${ar(total)}</div>
<div class="sub">Déclaré le ${dt(p.cree_le)}${p.confirme_le ? ' · confirmé le ' + dt(p.confirme_le) : ''}${p.ussd ? ' · code ' + esc(p.ussd) : ''}</div>
</div>
${+p.paye ? '' : `<button class="btn primary small" data-pay-confirm="${p.id}">Confirmer le paiement</button>`}
</div></article>`;
        }).join('');
    } catch (e) { box.innerHTML = `<p class="alert">${esc(e.message)}</p>`; }
}
document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pay-confirm]');
    if (!b) return;
    try { await post('paiement_confirm', { paiement_id: +b.dataset.payConfirm }); toast('Paiement confirmé : la commande est marquée « Déjà payé ».'); chargerPaiements(); refresh(); }
    catch (err) { toast(err.message); }
});

$('#btn-edit-pay')?.addEventListener('click', () => {
    const f = $('#form-payments');
    const dlg = $('#dlg-payments');
    if (!f || !dlg) return;
    if (f.elements.num_mvola) f.elements.num_mvola.value = PAYMENTS.mvola || '';
    if (f.elements.num_orange) f.elements.num_orange.value = PAYMENTS.orange || '';
    if (f.elements.num_airtel) f.elements.num_airtel.value = PAYMENTS.airtel || '';
    dlg.showModal();
});

$('#form-payments')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        await api('admin', 'save_payments', { method: 'POST', data });
        toast('Numéros de paiement mis à jour.');
        $('#dlg-payments')?.close();
        if (typeof loadPayments === 'function') loadPayments();
    } catch (ex) { toast(ex.message); }
});
// ==========================================
/* ----- Thème ----- */


/* ===== MENU MON COMPTE ===== */
const menu = $('#menu-me');
$('#btn-me').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
document.addEventListener('click', () => (menu.hidden = true));

// Changer photo rapide
$('#m-photo').addEventListener('click', () => $('#file-me').click());
$('#file-me').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('photo', f);
    try { const r = await api('admin', 'photo', { method: 'POST', data: fd }); $('#btn-me').innerHTML = `<img src="${esc(url(r.photo))}?t=${Date.now()}" alt="">`; toast('Photo mise à jour.'); }
    catch (err) { toast(err.message); }
});

/* ===== NOUVEAU : Mon compte admin ===== */
$('#m-account').addEventListener('click', async () => {
    menu.hidden = true;
    try {
        const me = await api('admin', 'me');
        $('#acc-prenom').value = me.prenom || '';
        $('#acc-nom').value = me.nom || '';
        $('#acc-tel').value = me.telephone || '';
        $('#acc-email').value = me.email || '';
        const prev = $('#acc-prev');
        if (me.photo_profil) prev.innerHTML = `<img src="${esc(url(me.photo_profil))}" alt="">`;
        else prev.innerHTML = `<span>${esc(initiales(me.prenom, me.nom))}</span>`;
        $('#acc-err').hidden = true;
        $('#dlg-account').showModal();
    } catch (err) { toast(err.message); }
});

$('#acc-photo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('photo', f);
    try {
        const r = await api('admin', 'photo', { method: 'POST', data: fd });
        $('#acc-prev').innerHTML = `<img src="${esc(url(r.photo))}?t=${Date.now()}" alt="">`;
        $('#btn-me').innerHTML = `<img src="${esc(url(r.photo))}?t=${Date.now()}" alt="">`;
        toast('Photo mise à jour.');
    } catch (err) { toast(err.message); }
});

$('#form-account').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#acc-err'); err.hidden = true;
    const tel = $('#acc-tel').value.replace(/[\s.-]/g, '');
    if (!/^(0(3[2-9]|4[0-9]))\d{7}$/.test(tel)) {
        err.textContent = 'Numéro de téléphone invalide (ex. 034 00 000 00).';
        err.hidden = false; return;
    }
    try {
        const r = await api('admin', 'update_account', {
            method: 'POST',
            data: {
                prenom: $('#acc-prenom').value.trim(),
                nom: $('#acc-nom').value.trim(),
                telephone: tel,
                email: $('#acc-email').value.trim()
            }
        });
        const head = $('.dropdown-head');
        if (head) head.innerHTML = `${esc(r.prenom)} ${esc(r.nom)}<small>${esc(r.telephone)}</small>`;
        const ini = (r.prenom.charAt(0) + r.nom.charAt(0)).toUpperCase();
        if (!$('#btn-me img')) $('#btn-me').innerHTML = `<span>${ini}</span>`;
        $('#dlg-account').close();
        toast('Compte mis à jour. Les clients peuvent maintenant vous appeler au ' + r.telephone + '.');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

/* ===== NOUVEAU : Changer mot de passe ===== */
$('#m-password').addEventListener('click', () => {
    menu.hidden = true;
    $('#form-password').reset();
    $('#pwd-err').hidden = true;
    $('#dlg-password').showModal();
});

$('#form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pwd-err'); err.hidden = true;
    const f = e.target;
    if (f.nouveau.value !== f.confirmer.value) {
        err.textContent = 'Les deux mots de passe ne correspondent pas.';
        err.hidden = false; return;
    }
    if (f.nouveau.value.length < 6) {
        err.textContent = 'Le mot de passe doit contenir au moins 6 caractères.';
        err.hidden = false; return;
    }
    try {
        await api('admin', 'change_password', {
            method: 'POST',
            data: { ancien: f.ancien.value, nouveau: f.nouveau.value }
        });
        $('#dlg-password').close();
        toast('Mot de passe changé avec succès.');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

/* ===== NOUVEAU : Modifier un livreur ===== */
function ouvrirEditLivreur(id) {
    const l = DATA.livreurs.find(x => x.id == id);
    if (!l) return;
    const f = $('#form-edit-liv');
    f.reset();
    $('#edit-liv-id').value = l.id;
    $('#edit-liv-nom').value = l.nom;
    $('#edit-liv-prenom').value = l.prenom;
    $('#edit-liv-im').value = l.code_im;
    $('#edit-liv-code').value = l.code_boxiby;
    $('#edit-liv-tel').value = l.telephone;
    $('#edit-liv-gps').value = l.gps_moto || '';
    if (l.tracer_telephone) $('#edit-liv-trace-oui').checked = true;
    else $('#edit-liv-trace-non').checked = true;
    const prev = $('#edit-liv-prev');
    if (l.photo_profil) prev.innerHTML = `<img src="${esc(url(l.photo_profil))}" alt="">`;
    else prev.innerHTML = `<span>${esc(initiales(l.prenom, l.nom))}</span>`;
    $('#edit-liv-err').hidden = true;
    $('#dlg-edit-liv').showModal();
}

$('#edit-liv-photo')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) $('#edit-liv-prev').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
});

$('#form-edit-liv')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#edit-liv-err');
    err.hidden = true;
    const fd = new FormData(e.target);
    const photoFile = $('#edit-liv-photo').files[0];
    if (photoFile) fd.set('photo', photoFile);
    else fd.delete('photo');
    try {
        await api('admin', 'edit_livreur', { method: 'POST', data: fd });
        $('#dlg-edit-liv').close();
        toast('Livreur mis à jour.');
        refresh();
    } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
    }
});

function secret(code, pinCode) { $('#sec-code').textContent = code; $('#sec-pin').textContent = pinCode; $('#dlg-secret').showModal(); }
const formAdd = $('#form-add');
$('#btn-add').addEventListener('click', async () => {
    formAdd.reset(); $('#add-err').hidden = true; $('#add-prev').innerHTML = '<span>+</span>';
    try { $('#add-code').value = (await api('admin', 'next_code')).code_boxiby; } catch (_) {}
    $('#dlg-add').showModal();
});
$('#add-photo').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) $('#add-prev').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`; });
formAdd.addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('#add-err'); err.hidden = true;
    try {
        const r = await api('admin', 'add_livreur', { method: 'POST', data: new FormData(formAdd) });
        $('#dlg-add').close(); secret(r.code_boxiby, r.pin); refresh();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

function ouvrirType(t) {
    const f = $('#form-type'); f.reset(); const E = f.elements;
    E.id.value = t?.id || ''; E.nom.value = t?.nom || ''; E.catalogue.checked = t ? !!+t.catalogue : true; E.options.checked = t ? !!+t.options : false;
    majTypeForm(); $('#dlg-type').showModal();
}
function majTypeForm() { const on = $('#type-cat').checked; $('#lbl-type-opt').hidden = !on; if (!on) $('#form-type').elements.options.checked = false; }
$('#type-cat').addEventListener('change', majTypeForm);
$('#btn-add-type').addEventListener('click', () => ouvrirType(null));
$('#form-type').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('type_save', Object.fromEntries(new FormData(e.target))); $('#dlg-type').close(); toast('Type enregistré : visible automatiquement par les clients.'); refresh(); } catch (ex) { toast(ex.message); }
});

const FP = $('#form-part'), EP = FP.elements;
const optRowHtml = () => `<div class="opt-new-row"><input data-o="nom" placeholder="Nom (ex. Barquette, Sachet)"><input data-o="prix" type="number" min="0" placeholder="Prix (Ar)"><input data-o="photo" type="file" accept="image/jpeg,image/png,image/webp"><button type="button" class="link" data-opt-rm>retirer</button></div>`;
$('#btn-opt-row').addEventListener('click', () => $('#part-opts-rows').insertAdjacentHTML('beforeend', optRowHtml()));
$('#part-opts-rows').addEventListener('click', (e) => { if (e.target.closest('[data-opt-rm]')) e.target.closest('.opt-new-row').remove(); });
function majPartForm() {
    const v = EP.type_id.value, isNew = v === 'new', creation = !EP.id.value;
    const nt = { catalogue: $('#nt-cat').checked ? 1 : 0, options: ($('#nt-cat').checked && $('#nt-opt').checked) ? 1 : 0 };
    const t = isNew ? nt : DATA.types.find(x => x.id == v);
    $('#new-type-box').hidden = !isNew;
    $('#lbl-nt-opt').hidden = !$('#nt-cat').checked;
    $('#nt-nom').required = isNew;
    $('#lbl-part-photo').hidden = !(t && +t.catalogue);
    const showOpts = !!(t && +t.options) && creation;
    $('#part-opts').hidden = !showOpts;
    if (showOpts && !$('#part-opts-rows').children.length) $('#part-opts-rows').insertAdjacentHTML('beforeend', optRowHtml());
    $('#part-edit-hint').hidden = creation || !(t && +t.catalogue);
    $('#part-info').textContent = !t ? '' : !+t.catalogue
        ? "Ce type n'a pas de catalogue ni de photos : le client remplit un formulaire (ce qu'il veut acheter) et joint la photo de son ordonnance (obligatoire pour une pharmacie)."
        : (+t.options ? "Catalogue avec photos et prix. Les options facultatives (barquette, sachet…) avec photo et prix se règlent ci-dessous." : "Catalogue avec photos et prix : ajoutez les articles dans « Catalogue » après l'enregistrement.");
}
function ouvrirPartenaire(p) {
    FP.reset(); $('#part-opts-rows').innerHTML = '';
    EP.type_id.innerHTML = DATA.types.filter(t => +t.actif || (p && t.id == p.type_id)).map(t => `<option value="${t.id}">${esc(t.nom)}${+t.catalogue ? '' : ' (sans catalogue)'}</option>`).join('') + '<option value="new">+ Nouveau type…</option>';
    EP.id.value = p?.id || ''; $('#part-title').textContent = p ? 'Modifier le partenaire' : 'Ajouter un partenaire';
    if (p) { EP.type_id.value = p.type_id; EP.nom.value = p.nom; EP.adresse.value = p.adresse; EP.telephone.value = p.telephone || ''; EP.latitude.value = p.latitude ?? ''; EP.longitude.value = p.longitude ?? ''; }
    $('#part-geo').textContent = p && p.latitude != null ? 'Position enregistrée ✔' : '';
    const cur = $('#part-photo-cur'); cur.hidden = !(p && p.photo); cur.innerHTML = p && p.photo ? `<img src="${esc(url(p.photo))}" alt=""><span class="more">Photo actuelle</span>` : '';
    majPartForm(); $('#dlg-part').showModal();
}
EP.type_id.addEventListener('change', majPartForm);
$('#nt-cat').addEventListener('change', majPartForm); $('#nt-opt').addEventListener('change', majPartForm);
EP.adresse.addEventListener('input', () => { EP.latitude.value = ''; EP.longitude.value = ''; $('#part-geo').textContent = ''; });
async function localiser(silencieux) {
    const q = EP.adresse.value.trim(); if (!q) return false;
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=mg&limit=1&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (!j[0]) { if (!silencieux) $('#part-geo').textContent = 'Adresse introuvable : essayez avec le quartier et la ville.'; return false; }
        EP.latitude.value = (+j[0].lat).toFixed(7); EP.longitude.value = (+j[0].lon).toFixed(7);
        $('#part-geo').textContent = 'Position trouvée ✔'; return true;
    } catch (_) { if (!silencieux) $('#part-geo').textContent = 'Recherche indisponible.'; return false; }
}
$('#btn-locate-part').addEventListener('click', () => localiser(false));
$('#btn-add-part').addEventListener('click', () => ouvrirPartenaire(null));
FP.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!EP.latitude.value) await localiser(true);
    const creation = !EP.id.value;
    const rows = (creation && !$('#part-opts').hidden) ? [...$$('#part-opts-rows .opt-new-row')].map(r => ({
        nom: r.querySelector('[data-o=nom]').value.trim(), prix: r.querySelector('[data-o=prix]').value || 0, photo: r.querySelector('[data-o=photo]').files[0]
    })).filter(r => r.nom) : [];
    try {
        const r = await api('admin', 'partner_save', { method: 'POST', data: new FormData(FP) });
        let optFail = 0;
        for (const o of rows) {
            const f = new FormData(); f.append('partenaire_id', r.id); f.append('nom', o.nom); f.append('prix', o.prix);
            if (o.photo) f.append('photo', await compress(o.photo, 600));
            try { await api('admin', 'option_save', { method: 'POST', data: f }); } catch (_) { optFail++; }
        }
        $('#dlg-part').close(); await refresh();
        if (creation && +r.catalogue) { toast(optFail ? `Partenaire enregistré (${optFail} option(s) non enregistrée(s)).` : 'Partenaire enregistré : ajoutez maintenant ses photos et ses prix.'); openCatalog(r.id); }
        else toast('Partenaire enregistré.');
    } catch (ex) { toast(ex.message); }
});

let CAT = { pid: 0, page: 1, q: '', hasOpt: false, options: [] };
const nameFromFile = (n) => { const s = n.replace(/.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); return (s.charAt(0).toUpperCase() + s.slice(1)) || 'Article'; };
async function compress(file, max = 1000, q = 0.82) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
        const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
        return blob ? new File([blob], file.name.replace(/.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch (_) { return file; }
}
const optChoices = (selected) => '<option value="">—</option>' + CAT.options.filter(o => +o.actif).map(o => `<option value="${o.id}" ${o.id == selected ? 'selected' : ''}>${esc(o.nom)} (${ar(o.prix)})</option>`).join('');
const artRow = (a) => `<div class="art-row" data-aid="${a.id}">
<div class="art-thumb">${a.photo ? `<img loading="lazy" src="${esc(url(a.photo))}" alt="">` : '<span>Pas de photo</span>'}</div>
<div class="art-edit">
<input data-f="nom" value="${esc(a.nom)}" placeholder="Nom"><input data-f="description" value="${esc(a.description || '')}" placeholder="Description">
<div class="art-line">
<label>Prix (Ar) <input data-f="prix" type="number" min="0" value="${a.prix}"></label>
${CAT.hasOpt ? `<label class="check"><input data-f="opt-chk" type="checkbox" ${a.option_id ? 'checked' : ''}> Option</label>
<label data-optw ${a.option_id ? '' : 'hidden'}><select data-f="option_id">${optChoices(a.option_id)}</select></label>` : ''}
<label class="check"><input data-f="actif" type="checkbox" ${+a.actif ? 'checked' : ''}> Visible</label>
<button class="btn ghost small" type="button" data-art-del>Supprimer</button><span class="saved"></span>
</div></div></div>`;
const optRow = (o) => `<div class="opt-row" data-oid="${o.id}">
<div class="art-thumb sm">${o.photo ? `<img loading="lazy" src="${esc(url(o.photo))}" alt="">` : '<span>Photo</span>'}</div>
<input data-of="nom" value="${esc(o.nom)}" placeholder="Nom"><input data-of="prix" type="number" min="0" value="${o.prix}" placeholder="Prix (Ar)">
<label class="check"><input data-of="actif" type="checkbox" ${+o.actif ? 'checked' : ''}> Visible</label>
<label class="btn ghost small filebtn">Changer la photo<input data-of="photo" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
<button class="btn ghost small" type="button" data-opt-del>Supprimer</button><span class="saved"></span>
</div>`;
function majOptionUI() {
    const has = CAT.hasOpt;
    $('#opt-section').hidden = !has;
    $('#bulk-opt-box').hidden = !has; $('#art-opt-box').hidden = !has;
    $('#opt-list').innerHTML = CAT.options.length ? CAT.options.map(optRow).join('') : '<p class="empty">Aucune option pour le moment : ajoutez-en une ci-dessous (ex. Barquette, Sachet) avec son prix et sa photo.</p>';
    $('#bulk-opt').innerHTML = optChoices(''); $('#art-opt').innerHTML = optChoices('');
    if (!CAT.options.length) { $('#bulk-opt-chk').checked = false; $('#art-opt-chk').checked = false; $('#bulk-opt-wrap').hidden = true; $('#art-opt-wrap').hidden = true; }
}
async function openCatalog(pid) {
    const p = DATA.partenaires.find(x => x.id == pid); if (!p) return;
    CAT = { pid, page: 1, q: '', hasOpt: !!+p.t_options, options: [] };
    $('#cat-title').textContent = 'Catalogue — ' + p.nom; $('#cat-q').value = '';
    $('#form-art').reset(); $('#form-opt').reset(); $('#bulk-files').value = ''; $('#bulk-prog').hidden = true;
    $('#bulk-opt-chk').checked = false; $('#bulk-opt-wrap').hidden = true; $('#art-opt-chk').checked = false; $('#art-opt-wrap').hidden = true;
    $('#cat-sub').textContent = +p.t_options
        ? "Ajoutez les photos et les prix des articles. Les options facultatives (barquette, sachet…) avec photo et prix s'ajoutent automatiquement au total du client pour les articles concernés."
        : 'Les clients voient ces photos, descriptions et prix quand ils choisissent ce partenaire dans « Achat pour compte ».';
    $('#dlg-catalog').showModal(); loadCatalog(true);
}
async function loadCatalog(reset) {
    if (reset) { CAT.page = 1; $('#cat-list').innerHTML = '<p class="muted">Chargement…</p>'; }
    try {
        const r = await api('admin', 'articles', { params: `&partenaire_id=${CAT.pid}&q=${encodeURIComponent(CAT.q)}&page=${CAT.page}` });
        CAT.hasOpt = r.type_options; CAT.options = r.options; if (reset) majOptionUI();
        if (reset) $('#cat-list').innerHTML = r.items.length ? '' : '<p class="empty">Aucun article : ajoutez des photos ci-dessus.</p>';
        $('#cat-list').insertAdjacentHTML('beforeend', r.items.map(artRow).join(''));
        $('#cat-more').hidden = !r.has_more; $('#cat-total').textContent = `${r.total} article(s)`;
    } catch (e) { toast(e.message); }
}
$('#cat-more').addEventListener('click', () => { CAT.page++; loadCatalog(false); });
let qt; $('#cat-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { CAT.q = e.target.value.trim(); loadCatalog(true); }, 300); });
const tickOption = (chk, wrap, sel) => chk.addEventListener('change', () => { wrap.hidden = !chk.checked; if (chk.checked && !sel.value && CAT.options.length) sel.value = CAT.options.find(o => +o.actif)?.id || ''; });
tickOption($('#bulk-opt-chk'), $('#bulk-opt-wrap'), $('#bulk-opt'));
tickOption($('#art-opt-chk'), $('#art-opt-wrap'), $('#art-opt'));
$('#form-opt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target); fd.append('partenaire_id', CAT.pid);
    if (fd.get('photo') && fd.get('photo').size) fd.set('photo', await compress(fd.get('photo'), 600)); else fd.delete('photo');
    try { await api('admin', 'option_save', { method: 'POST', data: fd }); e.target.reset(); toast('Option ajoutée.'); loadCatalog(true); refresh(); } catch (ex) { toast(ex.message); }
});
$('#opt-list').addEventListener('change', async (e) => {
    const row = e.target.closest('.opt-row'); if (!row) return;
    const g = (f) => row.querySelector(`[data-of=${f}]`);
    const fd = new FormData(); fd.append('id', row.dataset.oid); fd.append('partenaire_id', CAT.pid); fd.append('nom', g('nom').value); fd.append('prix', g('prix').value || 0); fd.append('actif', g('actif').checked ? 1 : 0);
    const f = g('photo').files[0]; if (f) fd.append('photo', await compress(f, 600));
    const mark = row.querySelector('.saved');
    try { await api('admin', 'option_save', { method: 'POST', data: fd }); mark.textContent = '✔ enregistré'; setTimeout(() => (mark.textContent = ''), 1500); if (f || e.target.dataset.of === 'actif' || e.target.dataset.of === 'nom' || e.target.dataset.of === 'prix') loadCatalog(true); }
    catch (ex) { mark.textContent = ex.message; }
});
$('#opt-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-opt-del]'); if (!b) return;
    if (!confirm("Supprimer cette option ? Les articles qui l'utilisent n'auront plus d'option.")) return;
    try { await post('option_delete', { id: +b.closest('.opt-row').dataset.oid }); loadCatalog(true); refresh(); } catch (ex) { toast(ex.message); }
});
$('#bulk-go').addEventListener('click', async () => {
    const files = [...$('#bulk-files').files];
    if (!files.length) return toast('Sélectionnez d\'abord des photos.');
    const prix = $('#bulk-prix').value || 0, opt = (!$('#bulk-opt-box').hidden && $('#bulk-opt-chk').checked) ? $('#bulk-opt').value : '';
    const prog = $('#bulk-prog'), bar = prog.querySelector('i'), txt = prog.querySelector('span');
    prog.hidden = false; $('#bulk-go').disabled = true;
    let i = 0, ok = 0, fail = 0, lastErr = '';
    const worker = async () => {
        while (i < files.length) {
            const f = files[i++];
            try {
                const fd = new FormData(); fd.append('partenaire_id', CAT.pid); fd.append('photo', await compress(f));
                fd.append('nom', nameFromFile(f.name)); fd.append('prix', prix); if (opt) fd.append('option_id', opt);
                await api('admin', 'article_add', { method: 'POST', data: fd }); ok++;
            } catch (e) { fail++; lastErr = e.message; }
            bar.style.width = Math.round((ok + fail) / files.length * 100) + '%';
            txt.textContent = `${ok + fail} / ${files.length}${fail ? ` — ${fail} échec(s)` : ''}`;
        }
    };
    await Promise.all([worker(), worker(), worker()]);
    $('#bulk-go').disabled = false; $('#bulk-files').value = ''; previewFiles($('#bulk-files'));
    toast(`${ok} photo(s) ajoutée(s)${fail ? ` · ${fail} échec(s) : ${lastErr}` : ''}`);
    loadCatalog(true); refresh();
});
$('#form-art').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target); fd.append('partenaire_id', CAT.pid);
    if (!$('#art-opt-chk').checked) fd.delete('option_id');
    if (fd.get('photo') && fd.get('photo').size) fd.set('photo', await compress(fd.get('photo'))); else fd.delete('photo');
    try {
        await api('admin', 'article_add', { method: 'POST', data: fd });
        e.target.reset(); $('#art-opt-wrap').hidden = true; toast('Article ajouté.'); loadCatalog(true); refresh();
    } catch (ex) { toast(ex.message); }
});
$('#cat-list').addEventListener('change', async (e) => {
    const row = e.target.closest('.art-row'); if (!row) return;
    const g = (f) => row.querySelector(`[data-f=${f}]`);
    if (e.target.dataset.f === 'opt-chk') {
        row.querySelector('[data-optw]').hidden = !e.target.checked;
        const sel = g('option_id'); if (e.target.checked && !sel.value) sel.value = CAT.options.find(o => +o.actif)?.id || '';
    }
    const useOpt = g('opt-chk')?.checked;
    const data = { id: +row.dataset.aid, nom: g('nom').value, description: g('description').value, prix: +g('prix').value || 0,
        option_id: useOpt ? (g('option_id').value || '') : '', actif: g('actif').checked ? 1 : 0 };
    const mark = row.querySelector('.saved');
    try { await post('article_update', data); mark.textContent = '✔ enregistré'; setTimeout(() => (mark.textContent = ''), 1500); }
    catch (ex) { mark.textContent = ex.message; }
});
$('#cat-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-art-del]'); if (!b) return;
    const row = b.closest('.art-row');
    if (!confirm('Supprimer cet article ?')) return;
    try { await post('article_delete', { id: +row.dataset.aid }); row.remove(); refresh(); } catch (ex) { toast(ex.message); }
});
function previewFiles(input) {
    if (input.dataset.of === 'photo') {
        const f = input.files[0], th = input.closest('.opt-row')?.querySelector('.art-thumb');
        if (f && th) th.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
        return;
    }
    let box = input.nextElementSibling?.classList.contains('file-prev') ? input.nextElementSibling : null;
    if (!box) { box = document.createElement('div'); box.className = 'file-prev'; input.insertAdjacentElement('afterend', box); }
    const files = [...(input.files || [])].filter(f => f.type.startsWith('image/'));
    box.innerHTML = ''; box.hidden = !files.length;
    files.slice(0, 12).forEach(f => { const im = new Image(); im.src = URL.createObjectURL(f); im.alt = ''; box.append(im); });
    if (files.length > 12) box.insertAdjacentHTML('beforeend', `<span class="more">+ ${files.length - 12} autres photos</span>`);
    else if (files.length > 1) box.insertAdjacentHTML('beforeend', `<span class="more">${files.length} photos</span>`);
}
document.addEventListener('change', (e) => { const i = e.target; if (i.matches?.('input[type=file]') && i.closest('dialog')) previewFiles(i); });
document.addEventListener('reset', (e) => e.target.querySelectorAll?.('.file-prev').forEach(x => { if (x.id !== 'part-photo-cur') x.remove(); }), true);
$('#dlg-catalog').addEventListener('close', () => refresh());

charger(true);
setInterval(() => { if (!document.hidden) charger(); }, 4000);
})();