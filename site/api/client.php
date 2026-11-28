<?php
/** BOXIBY — API publique du client (commande sans compte possible, suivi par jeton). */
declare(strict_types=1);
require __DIR__ . '/../config.php';

$action = $_GET['action'] ?? '';
$pdo = db();
$d = input();

const COLS_PUBLIC = "c.id, c.reference, c.service, c.mode, c.categorie_achat, c.type_colis, c.details,
    c.depart_adresse, c.depart_lat, c.depart_lng, c.arrivee_adresse, c.arrivee_lat, c.arrivee_lng,
    c.distance_km, c.prix_calcule, c.prix_final, c.prix_envoye, c.devis_requis, c.devis_accepte,
    c.date_souhaitee, c.heure_definie, c.paiement, c.paye, c.statut, c.livreur_id, c.operateur_id,
    c.photo_livraison, c.cree_le, c.livree_le, c.client_lat, c.client_lng,
    c.achat_requis, c.montant_achat, c.recupere_le, c.client_tel,
    c.montant_articles, c.montant_options, c.ordonnance";

function cmd_by_token(PDO $pdo, string $t): array
{
    $st = $pdo->prepare("SELECT " . COLS_PUBLIC . " FROM commandes c WHERE c.token = ?");
    $st->execute([$t]);
    $c = $st->fetch();
    if (!$c) json_out(['error' => 'Commande introuvable.'], 404);
    return $c;
}

try {
    switch ($action) {

    case 'partners': {          // types + partenaires actifs : affichés automatiquement aux clients (même sans compte)
        $types = $pdo->query("SELECT code, nom, catalogue, options FROM types_partenaires WHERE actif=1 ORDER BY systeme DESC, nom")->fetchAll();
        $parts = $pdo->query("SELECT p.id, p.nom, p.adresse, p.latitude AS lat, p.longitude AS lng, p.photo,
                    t.code AS type, t.catalogue, t.options,
                    (SELECT COUNT(*) FROM articles a WHERE a.partenaire_id=p.id AND a.actif=1) AS nb_articles
                FROM partenaires p JOIN types_partenaires t ON t.id=p.type_id
                WHERE p.actif=1 AND t.actif=1 ORDER BY p.nom")->fetchAll();
        foreach ($parts as &$p) { $p['lat'] = $p['lat'] !== null ? (float)$p['lat'] : null; $p['lng'] = $p['lng'] !== null ? (float)$p['lng'] : null; }
        json_out(['types' => $types, 'partenaires' => $parts]);
    }

    case 'catalog': {           // catalogue d'un partenaire (jamais pour une pharmacie), paginé, avec l'option de chaque article
        $pid = (int)($_GET['partenaire_id'] ?? 0);
        $q = trim((string)($_GET['q'] ?? ''));
        $page = max(1, (int)($_GET['page'] ?? 1)); $limit = 24;
        $st = $pdo->prepare("SELECT 1 FROM partenaires p JOIN types_partenaires t ON t.id=p.type_id
                             WHERE p.id=? AND p.actif=1 AND t.actif=1 AND t.catalogue=1");
        $st->execute([$pid]);
        if (!$st->fetchColumn()) json_out(['items' => [], 'has_more' => false]);
        $sql = "SELECT a.id, a.nom, a.description, a.prix, a.photo, a.option_id, o.nom AS option_nom, o.prix AS option_prix, o.photo AS option_photo
                FROM articles a LEFT JOIN options_partenaire o ON o.id=a.option_id AND o.actif=1
                WHERE a.partenaire_id=? AND a.actif=1" . ($q !== '' ? " AND a.nom LIKE ?" : "") . " ORDER BY a.nom LIMIT " . ($limit + 1) . " OFFSET " . (($page - 1) * $limit);
        $st = $pdo->prepare($sql);
        $st->execute($q !== '' ? [$pid, '%' . $q . '%'] : [$pid]);
        $items = $st->fetchAll();
        $more = count($items) > $limit; $items = array_slice($items, 0, $limit);
        foreach ($items as &$a) { $a['prix'] = (int)$a['prix']; $a['option_prix'] = $a['option_nom'] !== null ? (int)$a['option_prix'] : 0; if ($a['option_nom'] === null) $a['option_id'] = null; }
        json_out(['items' => $items, 'has_more' => $more]);
    }

    case 'price': {
        $service = $d['service'] ?? 'colis'; $mode = $d['mode'] ?? null;
        [$km, $prix] = calc_prix($service, $mode, route_km((float)$d['depart_lat'], (float)$d['depart_lng'], (float)$d['arrivee_lat'], (float)$d['arrivee_lng']));
        json_out(['km' => $km, 'prix' => $prix]);
    }

    case 'create': {
        $service = $d['service'] ?? '';
        if (!in_array($service, ['colis', 'achat', 'deplacement'], true)) json_out(['error' => 'Service invalide.'], 422);
        $mode = $service === 'colis' ? ($d['mode'] ?? '') : null;
        if ($service === 'colis' && !in_array($mode, ['express', 'planifiee'], true)) json_out(['error' => 'Choisissez Express ou Planifiée.'], 422);

        // Achat pour compte : type (géré par l'admin) + partenaire éventuel
        $cat = null; $type = null; $part = null; $catalog = false;
        if ($service === 'achat') {
            $cat = strtolower(trim((string)($d['categorie_achat'] ?? '')));
            if ($cat !== 'autre') {
                $st = $pdo->prepare("SELECT * FROM types_partenaires WHERE code=? AND actif=1");
                $st->execute([$cat]);
                $type = $st->fetch();
                if (!$type) json_out(['error' => "Choisissez la catégorie d'achat."], 422);
                $pid = (int)($d['partenaire_id'] ?? 0);
                if ($pid) {
                    $st = $pdo->prepare("SELECT * FROM partenaires WHERE id=? AND actif=1 AND type_id=?");
                    $st->execute([$pid, $type['id']]);
                    $part = $st->fetch();
                    if (!$part) json_out(['error' => 'Partenaire indisponible.'], 422);
                }
                $catalog = $part && (int)$type['catalogue'] === 1;     // une pharmacie n'a JAMAIS de catalogue
            }
        }

        $nom = trim($d['nom'] ?? ''); $prenom = trim($d['prenom'] ?? '');
        $tel = norm_tel($d['telephone'] ?? ''); $mail = trim($d['email'] ?? '');
        if ($nom === '' || $prenom === '' || !tel_ok($tel)) json_out(['error' => 'Téléphone, nom et prénom sont obligatoires.'], 422);
        if ($mail !== '' && !filter_var($mail, FILTER_VALIDATE_EMAIL)) json_out(['error' => 'Adresse e-mail invalide.'], 422);

        $pts = [];
        foreach (['depart', 'arrivee'] as $p) {
            if ($p === 'depart' && $part && $part['latitude'] !== null) {   // départ = position du partenaire
                $pts[$p] = [$part['nom'] . ' — ' . $part['adresse'], (float)$part['latitude'], (float)$part['longitude']];
                continue;
            }
            $lat = (float)($d[$p . '_lat'] ?? 0); $lng = (float)($d[$p . '_lng'] ?? 0);
            $adr = trim($d[$p . '_adresse'] ?? '');
            if ($lat < -26 || $lat > -11 || $lng < 42 || $lng > 51 || $adr === '') json_out(['error' => 'Indiquez le lieu de ' . ($p === 'depart' ? 'récupération' : 'livraison') . ' (adresse + position sur la carte).'], 422);
            $pts[$p] = [$adr, $lat, $lng];
        }
        $date = null;
        if ($mode === 'planifiee' || $service === 'achat') {
            $date = $d['date_souhaitee'] ?? '';
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { if ($mode === 'planifiee') json_out(['error' => 'Indiquez la date.'], 422); $date = null; }
            elseif ($date < date('Y-m-d')) json_out(['error' => 'La date ne peut pas être dans le passé.'], 422);
        }
        $paiement = ($d['paiement'] ?? '') === 'mobile_money' ? 'mobile_money' : 'livraison';
        $details = trim($d['details'] ?? '');

        // Articles du catalogue : prix et options viennent TOUJOURS de la base (jamais du navigateur)
        $lignes = []; $mArt = 0; $mOpt = 0;
        if ($catalog) {
            $items = json_decode((string)($d['articles'] ?? '[]'), true);
            $qty = [];
            foreach (is_array($items) ? $items : [] as $it) {
                $id = (int)($it['id'] ?? 0); $q = (int)($it['q'] ?? 0);
                if ($id > 0 && $q > 0) $qty[$id] = min(99, ($qty[$id] ?? 0) + $q);
            }
            if ($qty) {
                $in = implode(',', array_fill(0, count($qty), '?'));
                $st = $pdo->prepare("SELECT a.id, a.nom, a.prix, a.photo, o.nom AS o_nom, o.prix AS o_prix, o.photo AS o_photo
                                     FROM articles a LEFT JOIN options_partenaire o ON o.id=a.option_id AND o.actif=1
                                     WHERE a.partenaire_id=? AND a.actif=1 AND a.id IN ($in)");
                $st->execute(array_merge([(int)$part['id']], array_keys($qty)));
                foreach ($st->fetchAll() as $a) {
                    $q = $qty[$a['id']]; $op = $a['o_nom'] !== null ? (int)$a['o_prix'] : 0;
                    $lignes[] = ['id' => (int)$a['id'], 'nom' => $a['nom'], 'q' => $q, 'pu' => (int)$a['prix'], 'photo' => $a['photo'],
                                 'o_nom' => $a['o_nom'], 'o_photo' => $a['o_photo'], 'op' => $op];
                    $mArt += $q * (int)$a['prix']; $mOpt += $q * $op;
                }
                if (count($lignes) !== count($qty)) json_out(['error' => "Certains articles ne sont plus disponibles : rechargez le catalogue."], 422);
            }
            if (!$lignes && $details === '') json_out(['error' => 'Choisissez au moins un article du catalogue.'], 422);
        } elseif ($service === 'achat' && $details === '') {
            json_out(['error' => $cat === 'pharmacie' ? 'Remplissez le formulaire : indiquez les médicaments à livrer (obligatoire).' : 'Décrivez les articles recherchés.'], 422);
        }
        if ($cat === 'autre') $details = "Fournisseur : " . trim($d['fournisseur'] ?? '') . "\n" . $details;
        // Ordonnance (pharmacie) ou pièce jointe utile : photo scannée / prise avec le téléphone, ou PDF
        $ordo = ($service === 'achat' && !$lignes && isset($_FILES['ordonnance'])) ? save_upload($_FILES['ordonnance'], true) : null;
        if ($type && $type['code'] === 'pharmacie' && !$ordo) json_out(['error' => "La photo (ou le scan) de l'ordonnance est obligatoire pour une pharmacie."], 422);

        $achat = ($service === 'achat' || ($service === 'colis' && $mode === 'planifiee' && !empty($d['achat_requis']))) ? 1 : 0;
        if ($service === 'colis' && $achat && $details === '') json_out(['error' => 'Indiquez ce que le livreur doit acheter.'], 422);
        [$km, $prix] = calc_prix($service, $mode, route_km($pts['depart'][1], $pts['depart'][2], $pts['arrivee'][1], $pts['arrivee'][2]));
        $token = bin2hex(random_bytes(16));
        $devis = ($service === 'achat' && !$lignes) ? 1 : 0;      // sans catalogue : devis envoyé au client

        // Compte client créé automatiquement (téléphone + nom), SANS mot de passe
        $ex = $pdo->prepare("SELECT 1 FROM utilisateurs WHERE telephone = ?");
        $ex->execute([$tel]);
        if (!$ex->fetchColumn()) {
            $mailOk = $mail !== '' && !$pdo->query("SELECT 1 FROM utilisateurs WHERE email = " . $pdo->quote($mail))->fetchColumn();
            $pdo->prepare("INSERT INTO utilisateurs (role,nom,prenom,telephone,email,mot_de_passe) VALUES ('client',?,?,?,?,NULL)")
                ->execute([$nom, $prenom, $tel, $mailOk ? $mail : null]);
        }

        $row = ['token' => $token, 'service' => $service, 'mode' => $mode, 'categorie_achat' => $cat, 'partenaire_id' => $part['id'] ?? null,
                'type_colis' => trim($d['type_colis'] ?? '') ?: null, 'details' => $details ?: null, 'ordonnance' => $ordo,
                'client_nom' => $nom, 'client_prenom' => $prenom, 'client_tel' => $tel, 'client_email' => $mail ?: null,
                'depart_adresse' => $pts['depart'][0], 'depart_lat' => $pts['depart'][1], 'depart_lng' => $pts['depart'][2],
                'arrivee_adresse' => $pts['arrivee'][0], 'arrivee_lat' => $pts['arrivee'][1], 'arrivee_lng' => $pts['arrivee'][2],
                'distance_km' => $km, 'prix_calcule' => $prix, 'devis_requis' => $devis, 'achat_requis' => $achat,
                'montant_articles' => $mArt, 'montant_options' => $mOpt, 'date_souhaitee' => $date, 'paiement' => $paiement];
        for ($i = 0; $i < 5; $i++) {
            $ref = 'CMD-' . date('ymd') . '-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $vals = ['reference' => $ref] + $row;
            try {
                $pdo->prepare("INSERT INTO commandes (" . implode(',', array_keys($vals)) . ") VALUES (" . implode(',', array_fill(0, count($vals), '?')) . ")")
                    ->execute(array_values($vals));
                $cid = (int)$pdo->lastInsertId();
                $ins = $pdo->prepare("INSERT INTO commande_articles (commande_id,article_id,nom,quantite,prix_unitaire,photo,option_nom,option_photo,option_unitaire) VALUES (?,?,?,?,?,?,?,?,?)");
                foreach ($lignes as $l) $ins->execute([$cid, $l['id'], $l['nom'], $l['q'], $l['pu'], $l['photo'], $l['o_nom'], $l['o_photo'], $l['op']]);
                json_out(['ok' => true, 'reference' => $ref, 'token' => $token, 'km' => $km, 'prix' => $prix,
                          'articles' => $mArt, 'options' => $mOpt, 'total' => $prix + $mArt + $mOpt]);
            } catch (PDOException $e) { if ($e->getCode() !== '23000') throw $e; }
        }
        json_out(['error' => 'Réessayez.'], 500);
    }

    case 'suivi': {
        expire_missions();
        $c = cmd_by_token($pdo, (string)($_GET['t'] ?? ''));
        $out = $c;
        foreach (['depart_lat', 'depart_lng', 'arrivee_lat', 'arrivee_lng', 'client_lat', 'client_lng'] as $k) if ($out[$k] !== null) $out[$k] = (float)$out[$k];
        unset($out['id'], $out['operateur_id'], $out['livreur_id'], $out['client_tel']);
        $out['livreur'] = null;
        if ($c['livreur_id'] && $c['statut'] === 'en_cours') {
            $st = $pdo->prepare("SELECT u.prenom, u.nom, u.telephone, u.photo_profil FROM livreurs l JOIN utilisateurs u ON u.id=l.utilisateur_id WHERE l.id=?");
            $st->execute([$c['livreur_id']]);
            $out['livreur'] = $st->fetch() ?: null;
            if ($out['livreur']) $out['livreur']['position'] = last_pos((int)$c['livreur_id']);
        }
        $out['affectation'] = $c['statut'] === 'affectee';
        $out['evalue'] = array_column($pdo->query("SELECT cible FROM evaluations WHERE commande_id=" . (int)$c['id'])->fetchAll(), 'cible');
        $op = null;
        if ($c['operateur_id']) {
            $st = $pdo->prepare("SELECT prenom FROM utilisateurs WHERE id=?"); $st->execute([$c['operateur_id']]);
            $op = $st->fetchColumn() ?: null;
        }
        $out['operateur'] = $op;
        $out['a_livreur_note'] = (bool)$c['livreur_id'];
        $out['annulable'] = in_array($c['statut'], ['en_attente', 'affectee'], true);
        $out['recupere'] = (bool)$c['recupere_le'];
        $a = $pdo->prepare("SELECT nom, quantite, prix_unitaire, photo, option_nom, option_photo, option_unitaire FROM commande_articles WHERE commande_id=? ORDER BY id");
        $a->execute([$c['id']]);
        $out['articles'] = $a->fetchAll();
        $s = $pdo->prepare("SELECT 1 FROM utilisateurs WHERE telephone=? AND role='client' AND mot_de_passe IS NULL");
        $s->execute([$c['client_tel']]);
        $out['compte_sans_mdp'] = (bool)$s->fetchColumn();
        json_out($out);
    }

    case 'position': {          // position en temps réel du client
        if (!empty($d['off'])) {   // le client coupe le partage : on efface la position
            $pdo->prepare("UPDATE commandes SET client_lat=NULL, client_lng=NULL, client_pos_at=NULL WHERE token=?")->execute([(string)($d['t'] ?? '')]);
            json_out(['ok' => true]);
        }
        $lat = (float)($d['lat'] ?? 0); $lng = (float)($d['lng'] ?? 0);
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) json_out(['error' => 'Position invalide'], 422);
        $st = $pdo->prepare("UPDATE commandes SET client_lat=?, client_lng=?, client_pos_at=NOW()
                             WHERE token=? AND statut IN ('en_attente','affectee','en_cours')");
        $st->execute([$lat, $lng, (string)($d['t'] ?? '')]);
        json_out(['ok' => true]);
    }

    case 'accept_devis':
        $st = $pdo->prepare("UPDATE commandes SET devis_accepte=1 WHERE token=? AND prix_envoye=1 AND devis_requis=1 AND statut IN ('en_attente','affectee')");
        $st->execute([(string)($d['t'] ?? '')]);
        json_out(['ok' => $st->rowCount() > 0]);

    case 'cancel': {
        $st = $pdo->prepare("UPDATE commandes SET statut='annulee' WHERE token=? AND statut IN ('en_attente','affectee')");
        $st->execute([(string)($d['t'] ?? '')]);
        if (!$st->rowCount()) json_out(['error' => "Annulation impossible : la course est déjà en cours ou terminée."], 409);
        json_out(['ok' => true]);
    }

    case 'rate': {
        $c = cmd_by_token($pdo, (string)($d['t'] ?? ''));
        $cible = $d['cible'] ?? ''; $note = (int)($d['note'] ?? 0);
        if ($c['statut'] !== 'livree' || !in_array($cible, ['livreur', 'operateur'], true) || $note < 1 || $note > 3) json_out(['error' => 'Évaluation impossible.'], 422);
        $target = $cible === 'livreur'
            ? $pdo->query("SELECT utilisateur_id FROM livreurs WHERE id=" . (int)$c['livreur_id'])->fetchColumn()
            : $c['operateur_id'];
        if (!$target) json_out(['error' => 'Aucune personne à évaluer.'], 422);
        $pdo->prepare("INSERT IGNORE INTO evaluations (commande_id,cible,cible_user_id,note) VALUES (?,?,?,?)")->execute([$c['id'], $cible, $target, $note]);
        json_out(['ok' => true]);
    }

    case 'set_password': {      // le jeton de la commande prouve que c'est bien le client
        $c = cmd_by_token($pdo, (string)($d['t'] ?? ''));
        $mdp = (string)($d['mot_de_passe'] ?? '');
        if (strlen($mdp) < 6) json_out(['error' => 'Le mot de passe doit contenir au moins 6 caractères.'], 422);
        $st = $pdo->prepare("UPDATE utilisateurs SET mot_de_passe=? WHERE telephone=? AND role='client' AND mot_de_passe IS NULL");
        $st->execute([password_hash($mdp, PASSWORD_DEFAULT), $c['client_tel']]);
        if (!$st->rowCount()) json_out(['error' => 'Ce compte a déjà un mot de passe : connectez-vous.'], 409);
        $u = $pdo->prepare("SELECT id FROM utilisateurs WHERE telephone=? AND role='client'");
        $u->execute([$c['client_tel']]);
        session_regenerate_id(true);
        $_SESSION['client_id'] = (int)$u->fetchColumn();
        json_out(['ok' => true]);
    }

    case 'find': {              // retrouver une commande faite sans compte : téléphone + référence
        $st = $pdo->prepare("SELECT token FROM commandes WHERE client_tel=? AND reference=?");
        $st->execute([norm_tel($d['telephone'] ?? ''), strtoupper(trim($d['reference'] ?? ''))]);
        $t = $st->fetchColumn();
        if (!$t) json_out(['error' => 'Aucune commande ne correspond à ce téléphone et cette référence.'], 404);
        json_out(['token' => $t]);
    }

    case 'mine': {              // commandes du client connecté (rapprochées par téléphone)
        $me = client_me();
        if (!$me) json_out(['error' => 'Non connecté'], 401);
        $st = $pdo->prepare("SELECT reference, token, service, statut, prix_final, prix_calcule, cree_le FROM commandes WHERE client_tel=? ORDER BY id DESC LIMIT 50");
        $st->execute([$me['telephone']]);
        json_out($st->fetchAll());
    }

    case 'payments_info': {     // numéros Mobile Money configurés par BOXIBY (visibles par tous)
        json_out(payments_config());
    }

    case 'pay': {               // déclare le paiement Mobile Money et renvoie le code USSD à lancer
        $t = (string)($d['t'] ?? '');
        $op = strtolower(trim((string)($d['operateur'] ?? '')));
        if (!in_array($op, ['mvola', 'orange', 'airtel'], true)) json_out(['error' => 'Choisissez un opérateur : MVola, Orange Money ou Airtel Money.'], 422);
        $c = cmd_by_token($pdo, $t);
        if ($c['statut'] === 'annulee') json_out(['error' => 'Cette commande est annulée.'], 409);
        $total = (int)($c['prix_final'] ?? $c['prix_calcule']) + (int)$c['montant_articles'] + (int)$c['montant_options'];
        if ($total <= 0) json_out(['error' => "Le prix n'est pas encore fixé : attendez la confirmation de BOXIBY."], 409);
        $numero = payments_config()[$op] ?? '';
        if ($numero === '') json_out(['error' => "Le numéro " . strtoupper(str_replace('airtel', 'airtel money', $op)) . " n'est pas encore configuré par BOXIBY."], 409);
        $ussd = ussd_code($op, $numero, $total);
        if (!$ussd) json_out(['error' => 'Numéro de paiement invalide.'], 422);
        $ex = $pdo->prepare("SELECT id FROM paiements WHERE commande_id=? AND statut='en_attente' ORDER BY id DESC LIMIT 1");
        $ex->execute([(int)$c['id']]);
        if (!$ex->fetchColumn()) {
            $pdo->prepare("INSERT INTO paiements (commande_id, operateur, numero, montant, ussd) VALUES (?,?,?,?,?)")
                ->execute([(int)$c['id'], $op, $numero, $total, $ussd]);
        }
        json_out(['ok' => true, 'operateur' => $op, 'numero' => $numero, 'montant' => $total, 'ussd' => $ussd]);
    }

    default: json_out(['error' => 'Action inconnue'], 404);
    }
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    json_out(['error' => 'Erreur serveur'], 500);
}