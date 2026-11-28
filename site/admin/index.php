<?php
declare(strict_types=1);
require __DIR__ . '/../config.php';
$admin = admin_me();
if (!$admin) { header('Location: ../login.php'); exit; }
$theme = $admin['theme'] === 'sombre' ? 'dark' : 'light';
$photo = $admin['photo_profil'] ? '../' . htmlspecialchars($admin['photo_profil']) : '';
$ini = htmlspecialchars(mb_strtoupper(mb_substr($admin['prenom'], 0, 1) . mb_substr($admin['nom'], 0, 1)));
?>
<!DOCTYPE html>
<html lang="fr" data-theme="<?= $theme ?>">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf" content="<?= csrf_token() ?>"><meta name="robots" content="noindex">
<meta name="theme-color" content="#0E4169">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="BOXIBY">
<link rel="manifest" href="../manifest.json">
<link rel="icon" href="../assets/img/favicon.ico">
<link rel="apple-touch-icon" href="../assets/img/apple-touch-icon.png">
<link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" href="../assets/img/startup-iphone.png">
<link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" href="../assets/img/startup-iphone-2.png">
<title>BOXIBY — Gestion</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" style="display:none;">
<symbol id="i-edit" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></symbol>
<symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></symbol>
<symbol id="i-box" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></symbol>
<symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
</svg>

<header class="topbar">
<div class="logo-plate">
  <img
    id="site-logo"
    src="../assets/img/logo.png"
    data-logo-light="../assets/img/logo.png"
    data-logo-dark="../assets/img/logo-noir.png"
    alt="BOXIBY Madagascar"
  >
</div>
<h1 class="topbar-title">Gestion des courses</h1>
<div class="topbar-actions">
<button id="btn-theme" class="icon-btn" type="button" aria-label="Mode sombre">
<svg class="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
<svg class="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
</button>
<div class="menu-wrap">
<button id="btn-me" class="avatar me" type="button" aria-label="Mon compte"><?= $photo ? "<img src=\"$photo\" alt=\"\">" : "<span>$ini</span>" ?></button>
<div id="menu-me" class="dropdown" hidden>
<div class="dropdown-head"><?= htmlspecialchars($admin['prenom'] . ' ' . $admin['nom']) ?><small><?= htmlspecialchars($admin['telephone']) ?></small></div>
<button type="button" id="m-account">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"><use href="#i-user"></use></svg>
Mon compte
</button>
<button type="button" id="m-photo">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"><use href="#i-edit"></use></svg>
Changer ma photo
</button>
<button type="button" id="m-password">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"><use href="#i-lock"></use></svg>
Changer mon mot de passe
</button>
<a href="../logout.php">Déconnexion</a>
</div>
<input type="file" id="file-me" accept="image/jpeg,image/png,image/webp" hidden>
</div>
</div>
</header>

<main>
<section class="map-section">
<div id="map" aria-label="Carte d'Analamanga"></div>
<div class="map-stats">
<span><b id="st-liv">0</b> livreurs en direct</span>
<span><b id="st-att">0</b> en attente</span>
<span><b id="st-cours">0</b> en cours</span>
<span><b id="st-jour">0</b> livrées aujourd'hui</span>
</div>
</section>

<section class="panel">
<div class="panel-head">
<nav class="tabs" role="tablist">
<button class="tab active" data-tab="commandes">Demandes <em id="n-cmd">0</em></button>
<button class="tab" data-tab="livreurs">Livreurs <em id="n-liv">0</em></button>
<button class="tab" data-tab="clients">Clients <em id="n-cli">0</em></button>
<button class="tab" data-tab="partenaires">Partenaires</button>
<button class="tab" data-tab="paiements">Paiements</button>
<button class="tab" data-tab="stats">Statistiques</button>
</nav>
<button id="btn-add" class="btn primary" type="button">+ Ajouter un livreur</button>
</div>

<div id="tab-commandes" class="tab-body"><div class="chips" id="chips-cmd">
<button class="chip active" data-f="actives">À traiter / en cours</button><button class="chip" data-f="livree">Livrées</button>
<button class="chip" data-f="annulee">Annulées</button><button class="chip" data-f="tous">Toutes</button></div><div id="list-cmd"></div></div>

<div id="tab-livreurs" class="tab-body" hidden></div>

<div id="tab-clients" class="tab-body" hidden>
<div class="chips" id="chips">
<button class="chip active" data-f="tous">Tous</button><button class="chip" data-f="sans_commande">N'a pas commandé</button>
<button class="chip" data-f="a_commande">A commandé</button><button class="chip" data-f="deja_commande">A déjà commandé</button></div>
<div id="list-clients"></div>
</div>

<div id="tab-paiements" class="tab-body" hidden>
<div class="card">
<div class="row wrap-m">
<div class="grow"><h3 style="margin:0">Numéros de paiement Mobile Money</h3>
<p class="muted small-t" style="margin:2px 0 0">Visibles par tous les admins et par les clients. Seul le premier admin peut les modifier.</p></div>
<button id="btn-edit-pay" class="btn primary small" type="button" style="display:none">Modifier les numéros</button>
</div>
<dl class="kv" style="margin-top:10px">
<dt>MVola</dt><dd id="val-mvola">—</dd>
<dt>Orange Money</dt><dd id="val-orange">—</dd>
<dt>Airtel Money</dt><dd id="val-airtel">—</dd>
</dl>
<p class="muted small-t">Codes USSD de paiement automatique : MVola <code>#111*1*2*1*&lt;numéro&gt;*&lt;montant&gt;#</code> · Airtel <code>*436*2*1*1*&lt;numéro&gt;*&lt;montant&gt;#</code> · Orange <code>#144*1*1*&lt;numéro&gt;*&lt;montant&gt;#</code></p>
</div>
<h3>Liste des paiements Mobile Money</h3>
<div id="list-paiements"><p class="muted">Chargement…</p></div>
</div>

<div id="tab-partenaires" class="tab-body" hidden>
<div class="row wrap-m" style="margin-bottom:6px"><h3 class="grow" style="margin:0">Types de partenaires</h3><button id="btn-add-type" class="btn ghost small" type="button">+ Ajouter un type</button></div>
<p class="muted small-t">Les types ajoutés ici apparaissent automatiquement chez les clients dans « Achat pour compte ». La pharmacie est le type par défaut : jamais de catalogue ni de photos.</p>
<div id="list-types"></div>
<div class="row wrap-m" style="margin:20px 0 6px"><h3 class="grow" style="margin:0">Partenaires</h3><button id="btn-add-part" class="btn primary small" type="button">+ Ajouter un partenaire</button></div>
<div class="search-box">
<span class="search-icon">
<svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;"><use href="#i-search"></use></svg>
</span>
<input type="search" id="part-search" placeholder="Rechercher un partenaire (nom, adresse, type)…">
</div>
<div id="list-part"></div>
</div>

<div id="tab-stats" class="tab-body" hidden></div>
</section>
</main>

<!-- ========== TOUS LES DIALOGUES ========== -->

<dialog id="dlg-profile" class="dlg"><button class="dlg-x" data-close aria-label="Fermer">×</button><div id="profile-body"></div></dialog>

<!-- AJOUTER LIVREUR -->
<dialog id="dlg-add" class="dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-add" autocomplete="off">
<h2>Ajouter un livreur</h2>
<div class="photo-pick">
<div class="avatar xl" id="add-prev"><span>+</span></div>
<label class="btn ghost small">Photo de profil<input type="file" name="photo" id="add-photo" accept="image/jpeg,image/png,image/webp" hidden></label>
</div>
<div class="grid2"><label>Nom <input name="nom" required></label><label>Prénom <input name="prenom" required></label></div>
<div class="grid2"><label>Code spécifique (IM) <input name="code_im" required placeholder="IM-004"></label>
<label>Numéro de téléphone <input name="telephone" type="tel" required placeholder="034 00 000 00"></label></div>
<label>GPS de la moto <input name="gps_moto" placeholder="Identifiant du boîtier GPS (ex. GPS-A103)"></label>
<fieldset><legend>Suivi avec son téléphone</legend>
<label class="check"><input type="radio" name="tracage" value="oui" checked> Tracer aussi avec son téléphone</label>
<label class="check"><input type="radio" name="tracage" value="non"> Ne pas tracer avec son téléphone</label></fieldset>
<label>Code ID BOXIBY <input id="add-code" readonly></label>
<p id="add-err" class="alert" hidden></p>
<div class="dlg-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div>
</form>
</dialog>

<!-- ===== MODIFIER LIVREUR ===== -->
<dialog id="dlg-edit-liv" class="dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-edit-liv" autocomplete="off">
<h2>Modifier le livreur</h2>
<input type="hidden" name="id" id="edit-liv-id">
<div class="photo-pick">
<div class="avatar xl" id="edit-liv-prev"><span>+</span></div>
<label class="btn ghost small">Changer la photo<input type="file" name="photo" id="edit-liv-photo" accept="image/jpeg,image/png,image/webp" hidden></label>
<p class="muted small-t" style="margin:0">Laissez vide pour conserver la photo actuelle.</p>
</div>
<div class="grid2">
<label>Nom <input name="nom" id="edit-liv-nom" readonly></label>
<label>Prénom <input name="prenom" id="edit-liv-prenom" readonly></label>
</div>
<div class="grid2">
<label>Code IM <input id="edit-liv-im" readonly></label>
<label>ID BOXIBY <input id="edit-liv-code" readonly></label>
</div>
<label>Numéro de téléphone <input name="telephone" id="edit-liv-tel" type="tel" required placeholder="034 00 000 00"></label>
<label>GPS de la moto <input name="gps_moto" id="edit-liv-gps" placeholder="Identifiant du boîtier GPS (ex. GPS-A103)"></label>
<fieldset>
<legend>Suivi avec son téléphone</legend>
<label class="check"><input type="radio" name="tracage" id="edit-liv-trace-oui" value="oui"> Tracer aussi avec son téléphone</label>
<label class="check"><input type="radio" name="tracage" id="edit-liv-trace-non" value="non"> Ne pas tracer avec son téléphone</label>
</fieldset>
<p id="edit-liv-err" class="alert" hidden></p>
<div class="dlg-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div>
</form>
</dialog>

<!-- CODE SECRET -->
<dialog id="dlg-secret" class="dlg small-dlg">
<h2>Accès du livreur</h2>
<p class="muted">À transmettre au livreur. Le code secret ne sera plus affiché.</p>
<dl class="kv"><dt>Identifiant</dt><dd id="sec-code" class="big-code"></dd><dt>Code secret</dt><dd id="sec-pin" class="big-code"></dd></dl>
<div class="dlg-actions"><button type="button" class="btn primary" data-close>J'ai noté</button></div>
</dialog>

<!-- AFFECTER LIVREUR -->
<dialog id="dlg-assign" class="dlg small-dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<h2>Affecter un livreur</h2><p id="assign-ref" class="muted"></p>
<select id="assign-select"></select>
<div class="dlg-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button type="button" id="assign-ok" class="btn primary">Affecter</button></div>
</dialog>

<!-- TYPE -->
<dialog id="dlg-type" class="dlg small-dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-type"><h2>Type de partenaire</h2><input type="hidden" name="id">
<label>Nom du type <input name="nom" required placeholder="Ex. Boulangerie, Boucherie, Grande surface…"></label>
<label class="check"><input type="checkbox" name="catalogue" value="1" id="type-cat" checked> Ce type a besoin d'un catalogue (photos + prix)</label>
<label class="check" id="lbl-type-opt"><input type="checkbox" name="options" value="1"> Options facultatives avec photo et prix (barquette, sachet…)</label>
<div class="dlg-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>
</dialog>

<!-- PARTENAIRE -->
<dialog id="dlg-part" class="dlg wide">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-part"><h2 id="part-title">Partenaire</h2><input type="hidden" name="id">
<label>Type <select name="type_id" id="part-type"></select></label>
<div id="new-type-box" class="card" hidden>
<h3 style="margin-top:0">Nouveau type</h3>
<label>Nom du type <input name="new_type_nom" id="nt-nom" placeholder="Ex. Boulangerie, Boucherie, Grande surface…"></label>
<label class="check"><input type="checkbox" name="new_type_catalogue" value="1" id="nt-cat" checked> Ce type a besoin d'un catalogue (photos + prix)</label>
<label class="check" id="lbl-nt-opt"><input type="checkbox" name="new_type_options" value="1" id="nt-opt"> Options facultatives avec photo et prix</label>
</div>
<p id="part-info" class="muted small-t"></p>
<label>Nom <input name="nom" required></label>
<label>Adresse <input name="adresse" id="part-adr" required></label>
<div class="row" style="margin-bottom:10px"><button type="button" id="btn-locate-part" class="btn ghost small">Localiser l'adresse sur la carte</button><span id="part-geo" class="sub"></span></div>
<input type="hidden" name="latitude"><input type="hidden" name="longitude">
<label>Téléphone <input name="telephone" type="tel"></label>
<label id="lbl-part-photo" hidden>Photo du partenaire (facultatif) <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
<div id="part-photo-cur" class="file-prev" hidden></div>
<div id="part-opts" class="card" hidden>
<h3 style="margin-top:0">Options facultatives (photo + prix)</h3>
<p class="muted small-t">Ex. « Barquette » pour un restaurant, « Sachet » pour une grande surface.</p>
<div id="part-opts-rows"></div>
<button type="button" class="btn ghost small" id="btn-opt-row">+ Ajouter une option</button>
</div>
<div id="part-edit-hint" class="muted small-t" hidden>Pour modifier les photos, les prix et les options de ce partenaire, utilisez le bouton « Gérer » de sa fiche.</div>
<div class="dlg-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>
</dialog>

<!-- CATALOGUE -->
<dialog id="dlg-catalog" class="dlg wide">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<h2 id="cat-title">Catalogue</h2>
<p id="cat-sub" class="muted small-t"></p>
<div class="card" id="opt-section" hidden>
<h3 style="margin-top:0">Options facultatives (photo + prix)</h3>
<p class="muted small-t">Ex. restaurant : « Barquette » ; grande surface : « Sachet ».</p>
<div id="opt-list"></div>
<form id="form-opt" class="row-form" autocomplete="off">
<input name="nom" placeholder="Nom (ex. Barquette)" required>
<input name="prix" type="number" min="0" placeholder="Prix (Ar)" required>
<input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
<button class="btn primary small">Ajouter l'option</button>
</form>
</div>
<div class="card">
<h3 style="margin-top:0">Ajouter plusieurs photos d'un coup</h3>
<p class="muted small-t">Sélectionnez autant de photos que vous voulez.</p>
<input type="file" id="bulk-files" accept="image/jpeg,image/png,image/webp" multiple>
<div class="grid2" style="margin-top:10px">
<label>Prix par défaut (Ar) <input id="bulk-prix" type="number" min="0" value="0"></label>
<div id="bulk-opt-box" hidden><label class="check"><input type="checkbox" id="bulk-opt-chk"> Option applicable à ces articles</label>
<label id="bulk-opt-wrap" hidden>Option <select id="bulk-opt"></select></label></div>
</div>
<button id="bulk-go" class="btn primary small" type="button">Envoyer les photos</button>
<div class="progress" id="bulk-prog" hidden><i></i><span></span></div>
</div>
<div class="card">
<h3 style="margin-top:0">Ajouter un article (un par un)</h3>
<form id="form-art" autocomplete="off">
<div class="grid2"><label>Photo <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label><label>Nom <input name="nom" required></label></div>
<label>Description <input name="description" maxlength="500" placeholder="Ex. riz inclus, 50 cl, taille M…"></label>
<div class="grid2"><label>Prix (Ar) <input name="prix" type="number" min="0" required></label>
<div id="art-opt-box" hidden><label class="check"><input type="checkbox" id="art-opt-chk"> Option applicable</label>
<label id="art-opt-wrap" hidden>Option <select name="option_id" id="art-opt"></select></label></div></div>
<button class="btn primary small">Ajouter l'article</button>
</form>
</div>
<div class="row" style="margin:6px 0"><input id="cat-q" type="search" placeholder="Rechercher dans le catalogue…" style="margin:0"><span id="cat-total" class="sub" style="white-space:nowrap"></span></div>
<div id="cat-list"></div>
<button id="cat-more" class="btn ghost block" type="button" hidden>Charger plus</button>
</dialog>

<!-- ===== NUMÉROS DE PAIEMENT MOBILE MONEY (premier admin seulement) ===== -->
<dialog id="dlg-payments" class="dlg small-dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-payments" autocomplete="off">
<h2>Numéros de paiement</h2>
<p class="muted small-t">Numéros à 10 chiffres (ex. 0341234567). Les clients paient automatiquement depuis leur compte Mobile Money vers ces numéros.</p>
<label>MVola <input name="num_mvola" inputmode="numeric" maxlength="12" placeholder="034 00 000 00"></label>
<label>Orange Money <input name="num_orange" inputmode="numeric" maxlength="12" placeholder="032 00 000 00"></label>
<label>Airtel Money <input name="num_airtel" inputmode="numeric" maxlength="12" placeholder="033 00 000 00"></label>
<p id="pay-err" class="alert" hidden></p>
<div class="dlg-actions">
<button type="button" class="btn ghost" data-close>Annuler</button>
<button type="submit" class="btn primary">Enregistrer</button>
</div>
</form>
</dialog>

<!-- ===== MON COMPTE ADMIN ===== -->
<dialog id="dlg-account" class="dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-account" autocomplete="off">
<h2>Mon compte</h2>
<p class="muted small-t">Modifiez vos informations. Le numéro de téléphone sera visible par les clients qui pourront vous appeler directement.</p>
<div class="photo-pick">
<div class="avatar xl" id="acc-prev"><span><?= $ini ?></span></div>
<label class="btn ghost small">Changer la photo<input type="file" name="photo" id="acc-photo" accept="image/jpeg,image/png,image/webp" hidden></label>
</div>
<div class="grid2">
<label>Prénom <input name="prenom" id="acc-prenom" required></label>
<label>Nom <input name="nom" id="acc-nom" required></label>
</div>
<label>Téléphone <input name="telephone" id="acc-tel" type="tel" required placeholder="034 00 000 00"></label>
<label>E-mail (facultatif) <input name="email" id="acc-email" type="email"></label>
<p id="acc-err" class="alert" hidden></p>
<div class="dlg-actions">
<button type="button" class="btn ghost" data-close>Annuler</button>
<button type="submit" class="btn primary">Enregistrer</button>
</div>
</form>
</dialog>

<!-- ===== CHANGER MOT DE PASSE ===== -->
<dialog id="dlg-password" class="dlg small-dlg">
<button class="dlg-x" data-close aria-label="Fermer">×</button>
<form id="form-password" autocomplete="off">
<h2>Changer mon mot de passe</h2>
<label>Mot de passe actuel <input type="password" name="ancien" required autocomplete="current-password"></label>
<label>Nouveau mot de passe <input type="password" name="nouveau" minlength="6" required autocomplete="new-password"></label>
<label>Confirmer le nouveau <input type="password" name="confirmer" minlength="6" required autocomplete="new-password"></label>
<p id="pwd-err" class="alert" hidden></p>
<div class="dlg-actions">
<button type="button" class="btn ghost" data-close>Annuler</button>
<button type="submit" class="btn primary">Changer</button>
</div>
</form>
</dialog>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>window.BASE = '../'; window.BX = { me: <?= (int)$admin['id'] ?> };</script>
<script src="../assets/js/common.js"></script>
<script src="../assets/js/admin.js"></script>
</body>
</html>