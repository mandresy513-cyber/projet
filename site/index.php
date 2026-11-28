<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
$me = client_me();
$ini = $me ? htmlspecialchars(mb_strtoupper(mb_substr($me['prenom'], 0, 1) . mb_substr($me['nom'], 0, 1))) : '';
?>
<!DOCTYPE html>
<html lang="fr" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf" content="<?= csrf_token() ?>">
<title>BOXIBY Madagascar — Livraison, achat pour compte, déplacement</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="assets/css/style.css">
<script>try{if(localStorage.getItem('bx-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}</script>
</head>
<body>
<header class="topbar">
<div class="logo-plate">
  <img
    id="site-logo"
    src="assets/img/logo.png"
    data-logo-light="assets/img/logo.png"
    data-logo-dark="assets/img/logo-noir.png"
    alt="BOXIBY Madagascar"
  >
</div>
<h1 class="topbar-title">Livraison · Achat pour compte · Déplacement</h1>
<div class="topbar-actions">
<button id="btn-theme" class="icon-btn" type="button" aria-label="Mode sombre">
<svg class="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
<svg class="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
</button>
<?php if ($me): ?>
<div class="menu-wrap">
<button id="btn-me" class="avatar me" type="button" aria-label="Mon compte"><?= $me['photo_profil'] ? '<img src="' . htmlspecialchars($me['photo_profil']) . '" alt="">' : "<span>$ini</span>" ?></button>
<div id="menu-me" class="dropdown" hidden>
<div class="dropdown-head"><?= htmlspecialchars($me['prenom'] . ' ' . $me['nom']) ?><small><?= htmlspecialchars($me['telephone']) ?></small></div>
<a href="logout.php">Déconnexion</a>
</div>
</div>
<?php else: ?>
<a class="btn ghost small light" href="login.php">Se connecter</a>
<?php endif; ?>
</div>
</header>
<main class="container">
<?php if ($me): ?><section class="card" id="box-mine"><h2>Mes commandes</h2><div id="list-mine"><p class="muted">Chargement…</p></div></section><?php endif; ?>
<form id="f-order" class="card" novalidate>
<h2>Nouvelle commande</h2>
<ol class="steps" id="steps-bar">
<li class="now" data-dot="1"><i>1</i>Service</li>
<li data-dot="2"><i>2</i>Date</li>
<li data-dot="3"><i>3</i>Positions</li>
<li data-dot="4"><i>4</i>Coordonnées</li>
<li data-dot="5"><i>5</i>Envoi</li>
</ol>
<input type="hidden" name="service" value="colis">
<input type="hidden" name="mode" value="express">

<!-- ÉTAPE 1 : service + détails -->
<section data-step="1">
<h3>1. Que souhaitez-vous ?</h3>
<div class="seg" id="seg-svc">
<button type="button" class="active" data-svc="colis">Livraison de colis</button>
<button type="button" data-svc="achat">Achat pour compte</button>
<button type="button" data-svc="deplacement">Déplacement</button>
</div>
<div data-for="colis">
<label>Type de colis <input name="type_colis" id="type-colis" placeholder="Ex. documents, vêtements, colis fragile…"></label>
</div>
<div data-for="achat" hidden>
<label>Catégorie d'achat <select name="categorie_achat" id="cat"></select></label>
<label id="lbl-part">Partenaire <select name="partenaire_id" id="part"></select></label>
<p id="no-part" class="alert" hidden>Aucun partenaire n'est disponible pour cette catégorie pour le moment. Choisissez « Autre fournisseur ».</p>
<label id="lbl-four" hidden>Nom ou adresse du fournisseur <input name="fournisseur" id="fournisseur"></label>
<div id="catalog" hidden>
<input type="search" id="cat-q" placeholder="Rechercher un article ou un plat…">
<div id="cat-grid" class="art-grid"></div>
<button type="button" id="cat-more" class="btn ghost block" hidden>Voir plus</button>
<p id="cat-empty" class="muted" hidden>Ce partenaire n'a pas encore de catalogue : décrivez ce que vous voulez ci-dessous, un devis vous sera envoyé.</p>
</div>
<div id="cart" class="cart" hidden></div>
<div id="rx" hidden>
<p id="rx-title" class="name"></p>
<p id="rx-help" class="muted small-t"></p>
<div class="btns">
<button type="button" class="btn ghost small" id="rx-file-btn" title="Joindre un fichier" aria-label="Joindre un fichier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="12" x2="12" y2="21"/></svg><span class="btn-text">Joindre un fichier</span></button>
<button type="button" class="btn ghost small" id="rx-cam-btn" title="Prendre une photo" aria-label="Prendre une photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="btn-text">Prendre une photo</span></button>
</div>
<input type="file" id="rx-file" name="ordonnance" accept="image/*,application/pdf" hidden>
<div id="rx-prev" class="rx-prev" hidden></div>
<div id="rx-cam-modal" class="rx-modal" hidden>
<div class="rx-modal-box">
<h4 style="margin:0">Prendre l'ordonnance en photo</h4>
<p class="muted small-t" style="margin:4px 0 8px">Autorisez la caméra, cadrez l'ordonnance puis capturez. Fonctionne sur PC (webcam) et téléphone (caméra avant/arrière).</p>
<video id="rx-video" playsinline autoplay muted></video>
<canvas id="rx-canvas" hidden></canvas>
<p id="rx-cam-err" class="alert" hidden></p>
<div class="btns">
<button type="button" class="btn primary" id="rx-shot" title="Capturer" aria-label="Capturer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="btn-text">Capturer</span></button>
<button type="button" class="btn ghost" id="rx-switch" title="Changer de caméra" aria-label="Changer de caméra"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg><span class="btn-text">Changer caméra</span></button>
<button type="button" class="btn ghost" id="rx-close" title="Fermer" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span class="btn-text">Fermer</span></button>
</div>
</div>
</div>
</div>
</div>
<div data-for="deplacement" hidden>
<p class="muted small-t">Indiquez le nombre de personnes et bagages dans les informations utiles ci-dessous.</p>
</div>
<label id="lbl-details"><span id="t-details">Informations utiles (facultatif)</span><textarea name="details" id="details" rows="3"></textarea></label>
<p id="note-devis" class="muted small-t" hidden>Sans catalogue (pharmacie, autre fournisseur…), BOXIBY vous envoie un devis (articles + frais) que vous validez avant l'achat.</p>
<p id="note-buy" class="muted small-t" hidden>Le livreur effectue d'abord l'achat dans la zone indiquée (point A), puis vous livre à l'adresse B. La livraison n'a lieu qu'une fois l'achat fait ; le montant de l'achat est à régler à la livraison.</p>
<div class="wizard-nav">
<span></span>
<button type="button" class="btn primary" data-next="2" title="Suivant" aria-label="Suivant"><span class="btn-text">Suivant</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
</div>
</section>

<!-- ÉTAPE 2 : date + mode -->
<section data-step="2" hidden>
<h3>2. Date et mode de livraison</h3>
<div id="blk-mode">
<div class="seg small" id="seg-mode">
<button type="button" class="active" data-mode="express">Express</button>
<button type="button" data-mode="planifiee">Planifiée</button>
</div>
<label class="check" id="lbl-achat" hidden><input type="checkbox" name="achat_requis" value="1" id="chk-achat"> Le livreur doit d'abord acheter un article dans une zone, puis me le livrer</label>
</div>
<div id="row-date" hidden><label>Date souhaitée <input type="date" name="date_souhaitee" id="date"></label>
<p class="muted small-t">L'heure est définie par BOXIBY et vous est communiquée avec le prix.</p></div>
<p id="msg-express" class="alert">Livraison <b>express</b> : départ immédiat, aucune date à choisir.</p>
<p id="err2" class="alert" hidden></p>
<div class="wizard-nav">
<button type="button" class="btn ghost" data-prev="1" title="Précédent" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><span class="btn-text">Précédent</span></button>
<button type="button" class="btn primary" data-next="3" title="Suivant" aria-label="Suivant"><span class="btn-text">Suivant</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
</div>
</section>

<!-- ÉTAPE 3 : positions (NOUVELLE STRUCTURE AVEC SUGGESTIONS) -->
<section data-step="3" hidden>
<h3>3. Vos positions</h3>
<p class="muted small-t">Commencez à taper : des suggestions apparaîtront. Cliquez sur celle que vous voulez, ou utilisez « Ma position », ou cliquez sur la carte.</p>

<div class="pt-row-wrap">
    <span class="pt-badge">A</span>
    <div class="adr-box">
        <input name="depart_adresse" id="adr-depart" placeholder="Ex. Galana, Tanjombato, Analakely…" autocomplete="off">
        <div class="suggestions" id="sug-depart" hidden></div>
    </div>
    <button type="button" class="btn ghost small" data-geo="depart" title="Ma position" aria-label="Ma position"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg><span class="btn-text">Ma position</span></button>
    <button type="button" class="btn ghost small" data-pick="depart" title="Choisir sur la carte" aria-label="Choisir sur la carte"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span class="btn-text">Carte</span></button>
</div>

<div class="pt-row-wrap">
    <span class="pt-badge b">B</span>
    <div class="adr-box">
        <input name="arrivee_adresse" id="adr-arrivee" placeholder="Ex. Analakely, 67Ha, Andoharanofotsy…" autocomplete="off">
        <div class="suggestions" id="sug-arrivee" hidden></div>
    </div>
    <button type="button" class="btn ghost small" data-geo="arrivee" title="Ma position" aria-label="Ma position"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg><span class="btn-text">Ma position</span></button>
    <button type="button" class="btn ghost small" data-pick="arrivee" title="Choisir sur la carte" aria-label="Choisir sur la carte"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span class="btn-text">Carte</span></button>
</div>

<div id="pick-map"></div>
<input type="hidden" name="depart_lat"><input type="hidden" name="depart_lng">
<input type="hidden" name="arrivee_lat"><input type="hidden" name="arrivee_lng">
<div id="price-box" class="price-box" hidden></div>
<p id="err3" class="alert" hidden></p>
<div class="wizard-nav">
<button type="button" class="btn ghost" data-prev="2" title="Précédent" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><span class="btn-text">Précédent</span></button>
<button type="button" class="btn primary" data-next="4" title="Suivant" aria-label="Suivant"><span class="btn-text">Suivant</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
</div>
</section>

<!-- ÉTAPE 4 : coordonnées + paiement -->
<section data-step="4" hidden>
<h3>4. Coordonnées et paiement</h3>
<div class="grid2"><label>Prénom <input name="prenom" id="prenom" required value="<?= $me ? htmlspecialchars($me['prenom']) : '' ?>"></label>
<label>Nom <input name="nom" id="nom" required value="<?= $me ? htmlspecialchars($me['nom']) : '' ?>"></label></div>
<div class="grid2"><label>Téléphone <input name="telephone" id="tel" type="tel" required placeholder="034 00 000 00" value="<?= $me ? htmlspecialchars($me['telephone']) : '' ?>"></label>
<label>E-mail (facultatif) <input name="email" id="email" type="email" value="<?= $me ? htmlspecialchars((string)$me['email']) : '' ?>"></label></div>
<p class="muted small-t">Aucun compte à créer : téléphone, nom et prénom suffisent. Un compte à votre nom est créé automatiquement ; vous pourrez y ajouter un mot de passe plus tard.</p>

<fieldset><legend>Paiement</legend>
<label class="check"><input type="radio" name="paiement" value="livraison" checked> À la livraison</label>
<label class="check"><input type="radio" name="paiement" value="mobile_money"> Mobile Money</label>
<!-- NUMÉROS DE PAIEMENT (Caché par défaut) -->
<div id="box-mobile-money" hidden style="margin-top: 10px; padding: 12px; background: rgba(14,65,105,.05); border-radius: 8px; border: 1px dashed var(--line);">
  <p class="muted small-t" style="margin-bottom: 6px;">Payez automatiquement depuis votre compte Mobile Money (dès que BOXIBY confirme le prix) :</p>
  <div id="info-mvola" style="margin-bottom: 2px;"></div>
  <div id="info-orange" style="margin-bottom: 2px;"></div>
  <div id="info-airtel" style="margin-bottom: 2px;"></div>
  <p class="muted small-t" style="margin-top: 6px;">Après l'envoi de la commande, un bouton de paiement MVola / Orange Money / Airtel Money apparaîtra ici et sur la page de suivi : il lance le code USSD directement depuis votre compte.</p>
</div>
</fieldset>
<p class="muted small-t">Annulation possible tant que la course est « en attente » ou « affectée ». Aucun remboursement n'est effectué en cas d'annulation après paiement en ligne.</p>
<p id="err4" class="alert" hidden></p>
<div class="wizard-nav">
<button type="button" class="btn ghost" data-prev="3" title="Précédent" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><span class="btn-text">Précédent</span></button>
<button type="button" class="btn primary" data-next="5" title="Suivant" aria-label="Suivant"><span class="btn-text">Suivant</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
</div>
</section>

<!-- ÉTAPE 5 : récap + envoi + suivi -->
<section data-step="5" hidden>
<h3>5. Vérifier et envoyer</h3>
<div id="recap" class="recap"></div>
<p id="err" class="alert" hidden></p>
<div id="success-box" class="recap ok" hidden></div>
<div class="wizard-nav" id="nav-send">
<button type="button" class="btn ghost" data-prev="4" title="Précédent" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><span class="btn-text">Précédent</span></button>
<button class="btn primary block" type="submit" id="btn-send" title="Envoyer ma commande" aria-label="Envoyer ma commande"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span class="btn-text">Envoyer ma commande</span></button>
</div>
</section>
</form>

<section class="card">
<h2>Suivre ma commande</h2>
<form id="f-find" class="grid2">
<label>Téléphone <input name="telephone" type="tel" required></label>
<label>Référence <input name="reference" required placeholder="CMD-…"></label>
<button class="btn ghost" type="submit" title="Suivre" aria-label="Suivre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span class="btn-text">Suivre</span></button>
</form>
<div id="list-local"></div>
</section>
</main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="assets/js/common.js"></script>
<script src="assets/js/client.js"></script>
</body>
</html>