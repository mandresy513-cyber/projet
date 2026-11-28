<?php
/** BOXIBY — API de l'espace d'administration (session requise). */
declare(strict_types=1);
require __DIR__ . '/../config.php';

$admin = admin_me();
if (!$admin) json_out(['error' => 'Non connecté'], 401);
$action = $_GET['action'] ?? '';
$pdo = db();
$d = input();
if ($_SERVER['REQUEST_METHOD'] === 'POST') check_csrf();
session_write_close();   // libère la session : les envois de photos en file ne se bloquent plus entre eux

function num_cols(array $c): array
{
    foreach (['depart_lat', 'depart_lng', 'arrivee_lat', 'arrivee_lng', 'client_lat', 'client_lng'] as $k) if (($c[$k] ?? null) !== null) $c[$k] = (float)$c[$k];
    unset($c['token']);
    return $c;
}
function new_pin(): string { return (string)random_int(100000, 999999); }

/** Partenaire dont le type a un catalogue. Une pharmacie n'en a JAMAIS (ni photos). */
function partner_catalog(PDO $pdo, int $pid): array
{
    $st = $pdo->prepare("SELECT p.*, t.catalogue, t.options AS t_options FROM partenaires p JOIN types_partenaires t ON t.id=p.type_id WHERE p.id=?");
    $st->execute([$pid]);
    $p = $st->fetch();
    if (!$p) json_out(['error' => 'Partenaire introuvable.'], 404);
    if (!(int)$p['catalogue']) json_out(['error' => "Ce type de partenaire (ex. pharmacie) n'a pas de catalogue ni de photos : le client remplit un formulaire et joint son ordonnance."], 403);
    return $p;
}
function drop_photo(?string $path): void
{
    if (!$path || !str_starts_with($path, 'uploads/') || str_contains($path, '..')) return;
    // La photo reste sur le serveur tant qu'un article, une option ou une commande (historique) l'utilise encore
    $st = db()->prepare("SELECT (SELECT COUNT(*) FROM commande_articles WHERE photo=? OR option_photo=?)
                              + (SELECT COUNT(*) FROM articles WHERE photo=?) + (SELECT COUNT(*) FROM options_partenaire WHERE photo=?)
                              + (SELECT COUNT(*) FROM partenaires WHERE photo=?)");
    $st->execute([$path, $path, $path, $path, $path]);
    if ((int)$st->fetchColumn() === 0) @unlink(__DIR__ . '/../' . $path);
}

function create_type(PDO $pdo, string $nom, int $cat, int $opt): int
{
    $base = slugify($nom); if ($base === 'autre') $base = 'autre-type';
    $code = $base;
    for ($i = 2; ; $i++) {
        $e = $pdo->prepare("SELECT 1 FROM types_partenaires WHERE code=?"); $e->execute([$code]);
        if (!$e->fetchColumn()) break;
        $code = substr($base, 0, 35) . '-' . $i;
    }
    $pdo->prepare("INSERT INTO types_partenaires (code,nom,catalogue,options) VALUES (?,?,?,?)")->execute([$code, $nom, $cat, ($cat && $opt) ? 1 : 0]);
    return (int)$pdo->lastInsertId();
}

try {
    expire_missions();
    switch ($action) {

    case 'dashboard': {
        $livreurs = $pdo->query(
            "SELECT l.id, l.code_im, l.code_boxiby, l.gps_moto, l.tracer_telephone, l.pause_jusqua,
                    u.id AS uid, u.nom, u.prenom, u.telephone, u.photo_profil,
                    (SELECT COUNT(*) FROM commandes c WHERE c.livreur_id=l.id AND c.statut IN ('affectee','en_cours')) AS nb_missions
             FROM livreurs l JOIN utilisateurs u ON u.id=l.utilisateur_id WHERE u.actif=1 ORDER BY u.nom, u.prenom")->fetchAll();

        $commandes = $pdo->query(
            "SELECT c.*, TIMESTAMPDIFF(SECOND, c.client_pos_at, NOW()) AS client_pos_age, lu.prenom AS livreur_prenom, lu.nom AS livreur_nom, ou.prenom AS operateur_prenom, p.nom AS partenaire_nom, tp.nom AS type_nom
             FROM commandes c
             LEFT JOIN livreurs l ON l.id=c.livreur_id LEFT JOIN utilisateurs lu ON lu.id=l.utilisateur_id
             LEFT JOIN utilisateurs ou ON ou.id=c.operateur_id LEFT JOIN partenaires p ON p.id=c.partenaire_id
             LEFT JOIN types_partenaires tp ON tp.code=c.categorie_achat,
             (SELECT COUNT(*) FROM paiements pp WHERE pp.commande_id=c.id AND pp.statut='en_attente') AS paiements_attente
             ORDER BY c.id DESC LIMIT 300")->fetchAll();
        $commandes = array_map('num_cols', $commandes);
        $byCmd = [];
        if ($commandes) {
            $r = $pdo->query("SELECT commande_id, nom, quantite, prix_unitaire, photo, option_nom, option_photo, option_unitaire FROM commande_articles WHERE commande_id IN ("
                . implode(',', array_map('intval', array_column($commandes, 'id'))) . ") ORDER BY id")->fetchAll();
            foreach ($r as $x) $byCmd[$x['commande_id']][] = $x;
        }
        foreach ($commandes as &$cm) $cm['articles'] = $byCmd[$cm['id']] ?? [];
        unset($cm);

        foreach ($livreurs as &$l) {
            $l['statut'] = livreur_statut($l);
            $l['tracer_telephone'] = (bool)$l['tracer_telephone'];
            $l['position'] = last_pos((int)$l['id']);
            $l['colis'] = array_values(array_filter($commandes, fn($c) => (int)$c['livreur_id'] === (int)$l['id'] && in_array($c['statut'], ['affectee', 'en_cours'], true)));
        }
        unset($l);

        $clients = $pdo->query(
            "SELECT v.*, (SELECT c.client_lat FROM commandes c WHERE c.client_tel=v.telephone AND c.client_lat IS NOT NULL ORDER BY c.client_pos_at DESC LIMIT 1) AS lat,
                          (SELECT c.client_lng FROM commandes c WHERE c.client_tel=v.telephone AND c.client_lat IS NOT NULL ORDER BY c.client_pos_at DESC LIMIT 1) AS lng
             FROM v_clients_statut v ORDER BY v.nom, v.prenom")->fetchAll();

        $stats = [
            'aujourdhui' => $pdo->query("SELECT COUNT(*) FROM commandes WHERE DATE(cree_le)=CURDATE()")->fetchColumn(),
            'livrees_jour' => $pdo->query("SELECT COUNT(*) FROM commandes WHERE statut='livree' AND DATE(livree_le)=CURDATE()")->fetchColumn(),
            'par_jour' => $pdo->query("SELECT DATE(livree_le) AS jour, COUNT(*) AS n FROM commandes WHERE statut='livree' AND livree_le >= (CURDATE() - INTERVAL 6 DAY) GROUP BY jour ORDER BY jour")->fetchAll(),
            'satisfaction' => $pdo->query("SELECT e.cible, u.prenom, u.nom, COUNT(*) AS n, ROUND(AVG(e.note),2) AS moy,
                                SUM(e.note=3) AS s3, SUM(e.note=2) AS s2, SUM(e.note=1) AS s1
                                FROM evaluations e JOIN utilisateurs u ON u.id=e.cible_user_id GROUP BY e.cible, e.cible_user_id ORDER BY e.cible, moy DESC")->fetchAll(),
        ];
        $types = $pdo->query("SELECT t.*, (SELECT COUNT(*) FROM partenaires p WHERE p.type_id=t.id) AS nb_partenaires FROM types_partenaires t ORDER BY t.systeme DESC, t.nom")->fetchAll();
        $partenaires = $pdo->query("SELECT p.*, t.nom AS type_nom, t.code AS type_code, t.catalogue, t.options AS t_options,
                (SELECT COUNT(*) FROM articles a WHERE a.partenaire_id=p.id) AS nb_articles,
                (SELECT COUNT(*) FROM options_partenaire o WHERE o.partenaire_id=p.id) AS nb_options
            FROM partenaires p JOIN types_partenaires t ON t.id=p.type_id ORDER BY p.nom")->fetchAll();
        json_out(compact('livreurs', 'commandes', 'clients', 'stats', 'partenaires', 'types'));
    }

    case 'course': {
        $st = $pdo->prepare("SELECT latitude AS lat, longitude AS lng, enregistre_le FROM positions_livreurs
                             WHERE livreur_id=? AND enregistre_le >= (NOW() - INTERVAL 24 HOUR) ORDER BY id DESC LIMIT 300");
        $st->execute([(int)($_GET['livreur_id'] ?? 0)]);
        json_out(['trace' => array_reverse($st->fetchAll())]);
    }

    case 'user': {
        $st = $pdo->prepare("SELECT id, role, nom, prenom, telephone, email, photo_profil, cree_le FROM utilisateurs WHERE id=?");
        $st->execute([(int)($_GET['id'] ?? 0)]);
        $u = $st->fetch();
        if (!$u) json_out(['error' => 'Utilisateur introuvable'], 404);
        if ($u['role'] === 'livreur') {
            $s = $pdo->prepare("SELECT l.id, l.code_im, l.code_boxiby, l.gps_moto, l.tracer_telephone, l.pause_jusqua,
                       (SELECT COUNT(*) FROM commandes c WHERE c.livreur_id=l.id AND c.statut IN ('affectee','en_cours')) AS nb_missions,
                       (SELECT COUNT(*) FROM commandes c WHERE c.livreur_id=l.id AND c.statut='livree') AS livrees
                       FROM livreurs l WHERE l.utilisateur_id=?");
            $s->execute([$u['id']]);
            $l = $s->fetch();
            if ($l) { $l['statut'] = livreur_statut($l); $u['livreur'] = $l; }
        } elseif ($u['role'] === 'client') {
            $s = $pdo->prepare("SELECT total_commandes, commandes_en_cours, commandes_livrees, statut_client, a_mot_de_passe FROM v_clients_statut WHERE uid=?");
            $s->execute([$u['id']]);
            $u['client'] = $s->fetch() ?: null;
        }
        json_out($u);
    }

    case 'next_code': json_out(['code_boxiby' => next_code_boxiby()]);

    /* ----- Le SEUL moyen de créer un livreur ----- */
    case 'add_livreur': {
        $nom = trim($d['nom'] ?? ''); $prenom = trim($d['prenom'] ?? '');
        $im = strtoupper(trim($d['code_im'] ?? '')); $tel = norm_tel($d['telephone'] ?? '');
        $gps = trim($d['gps_moto'] ?? ''); $tracer = ($d['tracage'] ?? 'oui') === 'oui' ? 1 : 0;
        if ($nom === '' || $prenom === '' || $im === '' || !tel_ok($tel)) json_out(['error' => 'Nom, prénom, code IM et un téléphone valide sont obligatoires.'], 422);
        $photo = isset($_FILES['photo']) ? save_upload($_FILES['photo']) : null;
        $pin = new_pin();
        $pdo->beginTransaction();
        try {
            $pdo->prepare("INSERT INTO utilisateurs (role,nom,prenom,telephone,mot_de_passe,photo_profil) VALUES ('livreur',?,?,?,?,?)")
                ->execute([$nom, $prenom, $tel, password_hash($pin, PASSWORD_DEFAULT), $photo]);
            $uid = (int)$pdo->lastInsertId();
            $code = next_code_boxiby();
            $pdo->prepare("INSERT INTO livreurs (utilisateur_id,code_im,code_boxiby,gps_moto,tracer_telephone,cree_par) VALUES (?,?,?,?,?,?)")
                ->execute([$uid, $im, $code, $gps ?: null, $tracer, $admin['id']]);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23000') json_out(['error' => 'Ce téléphone, ce code IM ou ce GPS existe déjà.'], 409);
            throw $e;
        }
        json_out(['ok' => true, 'code_boxiby' => $code, 'pin' => $pin]);
    }

    case 'reset_pin': {
        $pin = new_pin();
        $st = $pdo->prepare("UPDATE utilisateurs u JOIN livreurs l ON l.utilisateur_id=u.id SET u.mot_de_passe=? WHERE l.id=?");
        $st->execute([password_hash($pin, PASSWORD_DEFAULT), (int)($d['livreur_id'] ?? 0)]);
        json_out(['ok' => true, 'pin' => $pin]);
    }

    case 'remove_livreur': {
        $id = (int)($d['livreur_id'] ?? 0);
        $n = $pdo->prepare("SELECT COUNT(*) FROM commandes WHERE livreur_id=? AND statut IN ('affectee','en_cours')");
        $n->execute([$id]);
        if ($n->fetchColumn()) json_out(['error' => 'Ce livreur a des missions en cours.'], 409);
        $pdo->prepare("UPDATE utilisateurs u JOIN livreurs l ON l.utilisateur_id=u.id SET u.actif=0 WHERE l.id=?")->execute([$id]);
        json_out(['ok' => true]);
    }

    /* ----- Traitement des demandes ----- */
    case 'set_prix': {
        $id = (int)($d['commande_id'] ?? 0);
        $prix = (int)($d['prix'] ?? -1);
        $heure = trim($d['heure'] ?? '');
        $st = $pdo->prepare("SELECT service, mode, prix_final, devis_requis FROM commandes WHERE id=? AND statut IN ('en_attente','affectee')");
        $st->execute([$id]);
        $c = $st->fetch();
        if (!$c) json_out(['error' => 'Demande introuvable ou déjà en cours.'], 404);
        if ($prix < 0) json_out(['error' => 'Prix invalide.'], 422);
        $needsHour = $c['service'] !== 'colis' || $c['mode'] === 'planifiee';
        if ($needsHour && !preg_match('/^\d{2}:\d{2}$/', $heure)) json_out(['error' => "Définissez l'heure avant d'envoyer le prix."], 422);
        $pdo->prepare("UPDATE commandes SET prix_final=?, heure_definie=?, prix_envoye=1, operateur_id=COALESCE(operateur_id,?),
                       devis_accepte = IF(devis_requis=1 AND COALESCE(prix_final,-1)<>?, 0, devis_accepte) WHERE id=?")
            ->execute([$prix, $heure ?: null, $admin['id'], $prix, $id]);
        json_out(['ok' => true]);
    }

    case 'assign': {
        $id = (int)($d['commande_id'] ?? 0); $lid = (int)($d['livreur_id'] ?? 0);
        $st = $pdo->prepare("SELECT prix_envoye, devis_requis, devis_accepte FROM commandes WHERE id=? AND statut IN ('en_attente','affectee') AND acceptee_le IS NULL");
        $st->execute([$id]);
        $c = $st->fetch();
        if (!$c) json_out(['error' => 'Demande introuvable ou déjà prise en charge.'], 404);
        if (!$c['prix_envoye']) json_out(['error' => "Validez et envoyez d'abord le prix au client."], 422);
        if ($c['devis_requis'] && !$c['devis_accepte']) json_out(['error' => "Le client doit d'abord accepter le devis."], 422);
        $l = $pdo->prepare("SELECT l.pause_jusqua FROM livreurs l JOIN utilisateurs u ON u.id=l.utilisateur_id WHERE l.id=? AND u.actif=1");
        $l->execute([$lid]);
        $liv = $l->fetch();
        if (!$liv) json_out(['error' => 'Livreur introuvable.'], 404);
        if ($liv['pause_jusqua'] && strtotime($liv['pause_jusqua']) > time()) json_out(['error' => 'Ce livreur est en pause.'], 409);
        $pdo->prepare("UPDATE commandes SET livreur_id=?, statut='affectee', affecte_le=NOW(), acceptee_le=NULL, operateur_id=COALESCE(operateur_id,?) WHERE id=?")
            ->execute([$lid, $admin['id'], $id]);
        json_out(['ok' => true]);
    }

    case 'cancel': {
        $st = $pdo->prepare("UPDATE commandes SET statut='annulee' WHERE id=? AND statut IN ('en_attente','affectee','en_cours')");
        $st->execute([(int)($d['commande_id'] ?? 0)]);
        json_out(['ok' => $st->rowCount() > 0]);
    }

    case 'toggle_paye':
        $pdo->prepare("UPDATE commandes SET paye = 1 - paye WHERE id=?")->execute([(int)($d['commande_id'] ?? 0)]);
        json_out(['ok' => true]);

    /* ----- Types de partenaires (ajoutés par l'admin → affichés automatiquement aux clients) ----- */
    case 'type_save': {
        $nom = trim($d['nom'] ?? '');
        if ($nom === '') json_out(['error' => 'Donnez un nom au type.'], 422);
        $cat = !empty($d['catalogue']) ? 1 : 0;
        $opt = ($cat && !empty($d['options'])) ? 1 : 0;
        if (!empty($d['id'])) {
            $st = $pdo->prepare("SELECT * FROM types_partenaires WHERE id=?"); $st->execute([(int)$d['id']]); $t = $st->fetch();
            if (!$t) json_out(['error' => 'Type introuvable.'], 404);
            if ($t['systeme']) json_out(['error' => 'Type par défaut (pharmacie) : non modifiable.'], 403);
            if ($t['catalogue'] && !$cat) {
                $n = $pdo->prepare("SELECT COUNT(*) FROM articles a JOIN partenaires p ON p.id=a.partenaire_id WHERE p.type_id=?"); $n->execute([$t['id']]);
                if ($n->fetchColumn()) json_out(['error' => "Ce type a déjà des articles : supprimez-les avant de retirer le catalogue."], 409);
            }
            $pdo->prepare("UPDATE types_partenaires SET nom=?, catalogue=?, options=? WHERE id=?")->execute([$nom, $cat, $opt, $t['id']]);
            $id = (int)$t['id'];
        } else {
            $id = create_type($pdo, $nom, $cat, $opt);
        }
        json_out(['ok' => true, 'id' => $id]);
    }
    case 'type_toggle': {
        $pdo->prepare("UPDATE types_partenaires SET actif = 1 - actif WHERE id=? AND systeme=0")->execute([(int)($d['id'] ?? 0)]);
        json_out(['ok' => true]);
    }
    case 'type_delete': {
        $id = (int)($d['id'] ?? 0);
        $st = $pdo->prepare("SELECT systeme FROM types_partenaires WHERE id=?"); $st->execute([$id]);
        $sys = $st->fetchColumn();
        if ($sys === false) json_out(['error' => 'Type introuvable.'], 404);
        if ($sys) json_out(['error' => 'Le type par défaut (pharmacie) ne peut pas être supprimé.'], 403);
        $n = $pdo->prepare("SELECT COUNT(*) FROM partenaires WHERE type_id=?"); $n->execute([$id]);
        if ($n->fetchColumn()) json_out(['error' => 'Des partenaires utilisent ce type : retirez-les ou masquez le type.'], 409);
        $pdo->prepare("DELETE FROM types_partenaires WHERE id=?")->execute([$id]);
        json_out(['ok' => true]);
    }

    /* ----- Partenaires : le type peut être créé directement ici (type_id = "new") ----- */
    case 'partner_save': {
        $nom = trim($d['nom'] ?? ''); $adr = trim($d['adresse'] ?? '');
        if ($nom === '' || $adr === '') json_out(['error' => 'Nom, type et adresse obligatoires.'], 422);
        $tid = $d['type_id'] ?? '';
        if ($tid === 'new') {
            $tn = trim($d['new_type_nom'] ?? '');
            if ($tn === '') json_out(['error' => 'Donnez un nom au nouveau type.'], 422);
            $tid = create_type($pdo, $tn, !empty($d['new_type_catalogue']) ? 1 : 0, !empty($d['new_type_options']) ? 1 : 0);
        }
        $st = $pdo->prepare("SELECT * FROM types_partenaires WHERE id=?"); $st->execute([(int)$tid]); $type = $st->fetch();
        if (!$type) json_out(['error' => 'Choisissez un type.'], 422);
        $tel = trim($d['telephone'] ?? '') ?: null;
        $lat = ($d['latitude'] ?? '') !== '' ? (float)$d['latitude'] : null; $lng = ($d['longitude'] ?? '') !== '' ? (float)$d['longitude'] : null;
        if ($lat !== null && ($lat < -26 || $lat > -11 || $lng === null || $lng < 42 || $lng > 51)) { $lat = $lng = null; }
        $photo = ((int)$type['catalogue'] && isset($_FILES['photo'])) ? save_upload($_FILES['photo']) : null;
        if (!empty($d['id'])) {
            $id = (int)$d['id'];
            if (!(int)$type['catalogue']) {
                $n = $pdo->prepare("SELECT COUNT(*) FROM articles WHERE partenaire_id=?"); $n->execute([$id]);
                if ($n->fetchColumn()) json_out(['error' => "Ce partenaire a un catalogue : supprimez ses articles avant de le passer dans un type sans catalogue."], 409);
            }
            $old = $pdo->prepare("SELECT photo FROM partenaires WHERE id=?"); $old->execute([$id]); $oldPhoto = $old->fetchColumn();
            $pdo->prepare("UPDATE partenaires SET type_id=?, nom=?, adresse=?, telephone=?, latitude=?, longitude=?, photo=COALESCE(?, photo) WHERE id=?")
                ->execute([$type['id'], $nom, $adr, $tel, $lat, $lng, $photo, $id]);
            if (!(int)$type['catalogue']) $pdo->prepare("UPDATE partenaires SET photo=NULL WHERE id=?")->execute([$id]);
            if (($photo || !(int)$type['catalogue']) && $oldPhoto) drop_photo($oldPhoto);
        } else {
            $pdo->prepare("INSERT INTO partenaires (type_id,nom,adresse,telephone,latitude,longitude,photo) VALUES (?,?,?,?,?,?,?)")
                ->execute([$type['id'], $nom, $adr, $tel, $lat, $lng, $photo]);
            $id = (int)$pdo->lastInsertId();
        }
        json_out(['ok' => true, 'id' => $id, 'type_id' => (int)$type['id'], 'catalogue' => (int)$type['catalogue'], 'options' => (int)$type['options']]);
    }
    case 'partner_toggle':
        $pdo->prepare("UPDATE partenaires SET actif = 1 - actif WHERE id=?")->execute([(int)($d['id'] ?? 0)]);
        json_out(['ok' => true]);
    case 'partner_delete': {
        $id = (int)($d['id'] ?? 0);
        $ph = $pdo->prepare("SELECT photo FROM articles WHERE partenaire_id=? UNION SELECT photo FROM options_partenaire WHERE partenaire_id=? UNION SELECT photo FROM partenaires WHERE id=?");
        $ph->execute([$id, $id, $id]);
        $photos = array_column($ph->fetchAll(), 'photo');
        $pdo->prepare("DELETE FROM partenaires WHERE id=?")->execute([$id]);
        foreach ($photos as $p) drop_photo($p);
        json_out(['ok' => true]);
    }

    case 'partner_previews': {   // les 12 derniers articles de chaque partenaire à catalogue, affichés en bas de sa carte
        $ids = $pdo->query("SELECT p.id FROM partenaires p JOIN types_partenaires t ON t.id=p.type_id WHERE t.catalogue=1")->fetchAll(PDO::FETCH_COLUMN);
        $st = $pdo->prepare("SELECT a.id, a.nom, a.prix, a.photo, a.actif, o.nom AS option_nom, o.prix AS option_prix, o.photo AS option_photo
                             FROM articles a LEFT JOIN options_partenaire o ON o.id=a.option_id
                             WHERE a.partenaire_id=? ORDER BY a.id DESC LIMIT 12");
        $out = [];
        foreach ($ids as $pid) { $st->execute([$pid]); $out[(string)$pid] = $st->fetchAll(); }
        json_out((object)$out);
    }

    /* ----- Options facultatives d'un partenaire : nom + prix + photo (barquette, sachet…) ----- */
    case 'option_save': {
        $p = partner_catalog($pdo, (int)($d['partenaire_id'] ?? 0));
        if (!(int)$p['t_options']) json_out(['error' => "Ce type n'utilise pas d'options facultatives : activez « Options facultatives » sur le type."], 403);
        $nom = trim($d['nom'] ?? '');
        if ($nom === '') json_out(['error' => "Donnez un nom à l'option (ex. Barquette, Sachet)."], 422);
        $prix = max(0, (int)($d['prix'] ?? 0));
        $photo = isset($_FILES['photo']) ? save_upload($_FILES['photo']) : null;
        if (!empty($d['id'])) {
            $id = (int)$d['id'];
            $st = $pdo->prepare("SELECT photo FROM options_partenaire WHERE id=? AND partenaire_id=?"); $st->execute([$id, $p['id']]); $old = $st->fetch();
            if (!$old) json_out(['error' => 'Option introuvable.'], 404);
            $actif = array_key_exists('actif', $d) ? ((!empty($d['actif']) && $d['actif'] !== '0') ? 1 : 0) : 1;
            $pdo->prepare("UPDATE options_partenaire SET nom=?, prix=?, photo=COALESCE(?, photo), actif=? WHERE id=?")->execute([mb_substr($nom, 0, 80), $prix, $photo, $actif, $id]);
            if ($photo && $old['photo']) drop_photo($old['photo']);
        } else {
            $pdo->prepare("INSERT INTO options_partenaire (partenaire_id,nom,prix,photo) VALUES (?,?,?,?)")->execute([$p['id'], mb_substr($nom, 0, 80), $prix, $photo]);
            $id = (int)$pdo->lastInsertId();
        }
        json_out(['ok' => true, 'id' => $id]);
    }
    case 'option_delete': {
        $st = $pdo->prepare("SELECT photo FROM options_partenaire WHERE id=?"); $st->execute([(int)($d['id'] ?? 0)]);
        $ph = $st->fetchColumn();
        $pdo->prepare("DELETE FROM options_partenaire WHERE id=?")->execute([(int)($d['id'] ?? 0)]);
        drop_photo($ph ?: null);
        json_out(['ok' => true]);
    }

    /* ----- Catalogue d'un partenaire (jamais pour une pharmacie) ----- */
    case 'articles': {
        $p = partner_catalog($pdo, (int)($_GET['partenaire_id'] ?? 0));
        $q = trim((string)($_GET['q'] ?? '')); $page = max(1, (int)($_GET['page'] ?? 1)); $limit = 30;
        $args = [$p['id']]; $w = '';
        if ($q !== '') { $w = ' AND nom LIKE ?'; $args[] = '%' . $q . '%'; }
        $st = $pdo->prepare("SELECT id, nom, description, prix, photo, option_id, actif FROM articles WHERE partenaire_id=?$w ORDER BY id DESC LIMIT " . ($limit + 1) . " OFFSET " . (($page - 1) * $limit));
        $st->execute($args);
        $items = $st->fetchAll(); $more = count($items) > $limit; $items = array_slice($items, 0, $limit);
        $tot = $pdo->prepare("SELECT COUNT(*) FROM articles WHERE partenaire_id=?"); $tot->execute([$p['id']]);
        $op = $pdo->prepare("SELECT id, nom, prix, photo, actif FROM options_partenaire WHERE partenaire_id=? ORDER BY id"); $op->execute([$p['id']]);
        json_out(['items' => $items, 'has_more' => $more, 'total' => (int)$tot->fetchColumn(),
                  'type_options' => (bool)$p['t_options'], 'options' => $op->fetchAll()]);
    }
    case 'article_add': {       // 1 photo par requête : l'envoi de centaines/milliers de photos se fait en file côté navigateur
        $p = partner_catalog($pdo, (int)($d['partenaire_id'] ?? 0));
        $nom = trim($d['nom'] ?? '');
        if ($nom === '') json_out(['error' => "Donnez un nom à l'article."], 422);
        $photo = isset($_FILES['photo']) ? save_upload($_FILES['photo']) : null;
        $optId = null;
        if ((int)$p['t_options'] && !empty($d['option_id'])) {
            $o = $pdo->prepare("SELECT id FROM options_partenaire WHERE id=? AND partenaire_id=?"); $o->execute([(int)$d['option_id'], $p['id']]);
            $optId = $o->fetchColumn() ?: null;
        }
        $pdo->prepare("INSERT INTO articles (partenaire_id,nom,description,prix,photo,option_id) VALUES (?,?,?,?,?,?)")
            ->execute([$p['id'], mb_substr($nom, 0, 150), mb_substr(trim($d['description'] ?? ''), 0, 500) ?: null, max(0, (int)($d['prix'] ?? 0)), $photo, $optId]);
        json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }
    case 'article_update': {
        $st = $pdo->prepare("SELECT a.id, a.partenaire_id, t.options AS t_options FROM articles a JOIN partenaires p ON p.id=a.partenaire_id JOIN types_partenaires t ON t.id=p.type_id WHERE a.id=?");
        $st->execute([(int)($d['id'] ?? 0)]);
        $a = $st->fetch();
        if (!$a) json_out(['error' => 'Article introuvable.'], 404);
        $nom = trim($d['nom'] ?? '');
        if ($nom === '') json_out(['error' => "Le nom de l'article est obligatoire."], 422);
        $optId = null;
        if ((int)$a['t_options'] && !empty($d['option_id'])) {
            $o = $pdo->prepare("SELECT id FROM options_partenaire WHERE id=? AND partenaire_id=?"); $o->execute([(int)$d['option_id'], $a['partenaire_id']]);
            $optId = $o->fetchColumn() ?: null;
        }
        $pdo->prepare("UPDATE articles SET nom=?, description=?, prix=?, option_id=?, actif=? WHERE id=?")
            ->execute([mb_substr($nom, 0, 150), mb_substr(trim($d['description'] ?? ''), 0, 500) ?: null, max(0, (int)($d['prix'] ?? 0)), $optId, !empty($d['actif']) ? 1 : 0, $a['id']]);
        json_out(['ok' => true]);
    }
    case 'article_delete': {
        $st = $pdo->prepare("SELECT photo FROM articles WHERE id=?"); $st->execute([(int)($d['id'] ?? 0)]);
        $ph = $st->fetchColumn();
        $pdo->prepare("DELETE FROM articles WHERE id=?")->execute([(int)($d['id'] ?? 0)]);
        drop_photo($ph ?: null);
        json_out(['ok' => true]);
    }

    case 'theme':
        $pdo->prepare("UPDATE utilisateurs SET theme=? WHERE id=?")->execute([($d['theme'] ?? '') === 'sombre' ? 'sombre' : 'clair', $admin['id']]);
        json_out(['ok' => true]);

    case 'photo': {
        $p = isset($_FILES['photo']) ? save_upload($_FILES['photo']) : null;
        if (!$p) json_out(['error' => 'Aucune photo reçue.'], 422);
        $pdo->prepare("UPDATE utilisateurs SET photo_profil=? WHERE id=?")->execute([$p, $admin['id']]);
        json_out(['ok' => true, 'photo' => $p]);
    }

    case 'me': {
    json_out([
        'id' => $admin['id'],
        'prenom' => $admin['prenom'],
        'nom' => $admin['nom'],
        'telephone' => $admin['telephone'],
        'email' => $admin['email'] ?? '',
        'photo_profil' => $admin['photo_profil'] ?? null
    ]);
}
case 'update_account': {
    $prenom = trim($d['prenom'] ?? '');
    $nom = trim($d['nom'] ?? '');
    $tel = norm_tel($d['telephone'] ?? '');
    $email = trim($d['email'] ?? '');
    
    if ($prenom === '' || $nom === '') json_out(['error' => 'Prénom et nom obligatoires.'], 422);
    if (!tel_ok($tel)) json_out(['error' => 'Numéro de téléphone invalide.'], 422);
    if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['error' => 'E-mail invalide.'], 422);
    
    // Vérifier si le téléphone est déjà utilisé par un autre utilisateur
    $st = $pdo->prepare("SELECT id FROM utilisateurs WHERE telephone=? AND id!=?");
    $st->execute([$tel, $admin['id']]);
    if ($st->fetchColumn()) json_out(['error' => 'Ce numéro de téléphone est déjà utilisé.'], 409);
    
    $pdo->prepare("UPDATE utilisateurs SET prenom=?, nom=?, telephone=?, email=? WHERE id=?")
        ->execute([$prenom, $nom, $tel, $email ?: null, $admin['id']]);
    
    json_out([
        'ok' => true,
        'prenom' => $prenom,
        'nom' => $nom,
        'telephone' => $tel
    ]);
}
case 'change_password': {
    $ancien = $d['ancien'] ?? '';
    $nouveau = $d['nouveau'] ?? '';
    
    if (strlen($nouveau) < 6) json_out(['error' => 'Le nouveau mot de passe doit contenir au moins 6 caractères.'], 422);
    
    // Vérifier l'ancien mot de passe
    $st = $pdo->prepare("SELECT mot_de_passe FROM utilisateurs WHERE id=?");
    $st->execute([$admin['id']]);
    $hash = $st->fetchColumn();
    
    if (!password_verify($ancien, $hash)) json_out(['error' => 'Mot de passe actuel incorrect.'], 401);
    
    $pdo->prepare("UPDATE utilisateurs SET mot_de_passe=? WHERE id=?")
        ->execute([password_hash($nouveau, PASSWORD_DEFAULT), $admin['id']]);
    
    json_out(['ok' => true]);
}
case 'get_payments': {
    $cfg = payments_config();
    json_out(['mvola' => $cfg['mvola'], 'orange' => $cfg['orange'], 'airtel' => $cfg['airtel'],
              'can_edit' => (int)$admin['id'] === premier_admin_id(),
              'ussd' => ['mvola' => '#111*1*2*1*<numéro>*<montant>#',
                         'airtel' => '*436*2*1*1*<numéro>*<montant>#',
                         'orange' => '#144*1*1*<numéro>*<montant>#']]);
}
case 'save_payments': {
    if ((int)$admin['id'] !== premier_admin_id()) json_out(['error' => 'Seul le premier admin peut modifier les numéros de paiement.'], 403);
    foreach (['mvola', 'orange', 'airtel'] as $op) {
        $n = norm_tel((string)($d['num_' . $op] ?? ''));
        if ($n !== '' && !preg_match('/^0\d{9}$/', $n)) json_out(['error' => 'Numéro ' . strtoupper($op) . ' invalide : 10 chiffres (ex. 0341234567).'], 422);
        set_param($op, $n);
    }
    json_out(['ok' => true]);
}

/* ----- Liste des paiements Mobile Money déclarés par les clients ----- */
case 'paiements': {
    $rows = $pdo->query("SELECT p.*, c.reference, c.client_nom, c.client_prenom, c.client_tel,
                                c.prix_final, c.prix_calcule, c.montant_articles, c.montant_options,
                                c.statut AS cmd_statut, c.paye
                         FROM paiements p JOIN commandes c ON c.id=p.commande_id
                         ORDER BY p.id DESC LIMIT 200")->fetchAll();
    json_out(['paiements' => $rows]);
}
case 'paiement_confirm': {
    $id = (int)($d['paiement_id'] ?? 0);
    $st = $pdo->prepare("SELECT commande_id FROM paiements WHERE id=?");
    $st->execute([$id]);
    $cid = $st->fetchColumn();
    if (!$cid) json_out(['error' => 'Paiement introuvable.'], 404);
    $pdo->prepare("UPDATE paiements SET statut='confirme', confirme_le=NOW() WHERE id=?")->execute([$id]);
    $pdo->prepare("UPDATE commandes SET paye=1 WHERE id=?")->execute([(int)$cid]);
    json_out(['ok' => true]);
}

case 'edit_livreur': {
    $id = (int)($d['id'] ?? 0);
    if (!$id) json_out(['error' => 'Livreur introuvable.'], 404);
    
    $st = $pdo->prepare("SELECT u.id AS uid, u.telephone, u.photo_profil, l.gps_moto, l.tracer_telephone
                         FROM livreurs l JOIN utilisateurs u ON u.id=l.utilisateur_id
                         WHERE l.id=? AND u.actif=1");
    $st->execute([$id]);
    $cur = $st->fetch();
    if (!$cur) json_out(['error' => 'Livreur introuvable ou désactivé.'], 404);
    
    $tel = norm_tel($d['telephone'] ?? '');
    if (!tel_ok($tel)) json_out(['error' => 'Numéro de téléphone invalide.'], 422);
    
    if ($tel !== $cur['telephone']) {
        $chk = $pdo->prepare("SELECT id FROM utilisateurs WHERE telephone=? AND id!=?");
        $chk->execute([$tel, $cur['uid']]);
        if ($chk->fetchColumn()) json_out(['error' => 'Ce numéro de téléphone est déjà utilisé par un autre compte.'], 409);
    }
    
    $gps = trim($d['gps_moto'] ?? '');
    $tracer = ($d['tracage'] ?? 'oui') === 'oui' ? 1 : 0;
    
    $newPhoto = null;
    $oldPhoto = $cur['photo_profil'];
    if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK && $_FILES['photo']['size'] > 0) {
        $newPhoto = save_upload($_FILES['photo']);
    }
    
    $pdo->beginTransaction();
    try {
        if ($newPhoto) {
            $pdo->prepare("UPDATE utilisateurs SET telephone=?, photo_profil=? WHERE id=?")
                ->execute([$tel, $newPhoto, $cur['uid']]);
        } else {
            $pdo->prepare("UPDATE utilisateurs SET telephone=? WHERE id=?")
                ->execute([$tel, $cur['uid']]);
        }
        
        $pdo->prepare("UPDATE livreurs SET gps_moto=?, tracer_telephone=? WHERE id=?")
            ->execute([$gps ?: null, $tracer, $id]);
        
        $pdo->commit();
        
        if ($newPhoto && $oldPhoto) drop_photo($oldPhoto);
        
        json_out(['ok' => true]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($newPhoto) {
            $path = __DIR__ . '/../' . $newPhoto;
            if (str_starts_with($newPhoto, 'uploads/') && !str_contains($newPhoto, '..') && file_exists($path)) {
                @unlink($path);
            }
        }
        if ($e->getCode() === '23000') json_out(['error' => 'Ce téléphone ou ce GPS existe déjà.'], 409);
        throw $e;
    }
}

    default: json_out(['error' => 'Action inconnue'], 404);
    }
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    json_out(['error' => 'Erreur serveur'], 500);
}
