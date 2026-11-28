<?php
/** BOXIBY — API de l'application livreur (session livreur obligatoire). */
declare(strict_types=1);
require __DIR__ . '/../config.php';

$me = livreur_me();
if (!$me) json_out(['error' => 'Non connecté'], 401);
$action = $_GET['action'] ?? '';
$pdo = db();
$d = input();
if ($_SERVER['REQUEST_METHOD'] === 'POST') check_csrf();
$lid = (int)$me['id'];

function mission_row(array $c): array
{
    foreach (['depart_lat', 'depart_lng', 'arrivee_lat', 'arrivee_lng', 'client_lat', 'client_lng'] as $k) if ($c[$k] !== null) $c[$k] = (float)$c[$k];
    // La position du client n'est transmise que si elle est récente (< 10 min)
    if ($c['client_pos_age'] !== null && (int)$c['client_pos_age'] > 600) $c['client_lat'] = $c['client_lng'] = null;
    if ($c['statut'] === 'affectee' && $c['affecte_le']) $c['secondes_restantes'] = max(0, ACCEPT_DELAI_SEC - (time() - strtotime($c['affecte_le'])));
    return $c;
}

try {
    expire_missions();
    switch ($action) {

    case 'state': {
        $st = $pdo->prepare("SELECT id, reference, service, mode, categorie_achat, type_colis, details, client_nom, client_prenom, client_tel,
                    depart_adresse, depart_lat, depart_lng, arrivee_adresse, arrivee_lat, arrivee_lng, date_souhaitee, heure_definie,
                    prix_final, prix_calcule, paiement, paye, achat_requis, montant_achat, montant_articles, montant_options, ordonnance, categorie_achat, statut, affecte_le, acceptee_le, recupere_le, livree_le,
                    client_lat, client_lng, client_pos_at, TIMESTAMPDIFF(SECOND, client_pos_at, NOW()) AS client_pos_age
                    FROM commandes WHERE livreur_id=? AND statut IN ('affectee','en_cours') ORDER BY id");
        $st->execute([$lid]);
        $missions = array_map('mission_row', $st->fetchAll());
        $la = $pdo->prepare("SELECT nom, quantite, photo, option_nom, option_photo FROM commande_articles WHERE commande_id=? ORDER BY id");
        foreach ($missions as &$mi) { $la->execute([$mi['id']]); $mi['articles'] = $la->fetchAll(); }
        unset($mi);
        $h = $pdo->prepare("SELECT reference, service, statut, client_prenom, client_nom, depart_adresse, arrivee_adresse, livree_le, cree_le, paiement, paye
                            FROM commandes WHERE livreur_id=? AND statut IN ('livree','annulee') ORDER BY id DESC LIMIT 30");
        $h->execute([$lid]);
        $fresh = livreur_me();
        $fresh['nb_missions'] = count($missions);
        json_out([
            'me' => ['prenom' => $me['prenom'], 'nom' => $me['nom'], 'code' => $me['code_boxiby'], 'photo' => $me['photo_profil'],
                     'tracer_telephone' => (bool)$me['tracer_telephone']],
            'statut' => livreur_statut($fresh),
            'pause_restant' => ($fresh['pause_jusqua'] && strtotime($fresh['pause_jusqua']) > time()) ? strtotime($fresh['pause_jusqua']) - time() : 0,
            'position' => last_pos($lid),
            'missions' => $missions,
            'historique' => $h->fetchAll(),
        ]);
    }

    case 'position': {
        if (!$me['tracer_telephone']) json_out(['error' => 'Suivi par téléphone désactivé pour ce compte.'], 403);
        $lat = (float)($d['lat'] ?? 0); $lng = (float)($d['lng'] ?? 0);
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ($lat == 0 && $lng == 0)) json_out(['error' => 'Position invalide'], 422);
        $r = $pdo->prepare("SELECT 1 FROM positions_livreurs WHERE livreur_id=? AND enregistre_le > (NOW() - INTERVAL 2 SECOND) LIMIT 1");
        $r->execute([$lid]);
        if (!$r->fetchColumn()) {
            $pdo->prepare("INSERT INTO positions_livreurs (livreur_id, latitude, longitude, source) VALUES (?,?,?, 'telephone')")->execute([$lid, $lat, $lng]);
            if (random_int(1, 100) === 1) $pdo->exec("DELETE FROM positions_livreurs WHERE enregistre_le < (NOW() - INTERVAL 7 DAY)");
        }
        json_out(['ok' => true]);
    }

    case 'accept': {            // pas de bouton « refuser » : acceptation dans les 3 minutes
        $st = $pdo->prepare("UPDATE commandes SET statut='en_cours', acceptee_le=NOW()
                             WHERE id=? AND livreur_id=? AND statut='affectee' AND acceptee_le IS NULL
                               AND affecte_le >= (NOW() - INTERVAL " . ACCEPT_DELAI_SEC . " SECOND)");
        $st->execute([(int)($d['commande_id'] ?? 0), $lid]);
        if (!$st->rowCount()) json_out(['error' => 'Délai dépassé : la mission est retournée à BOXIBY.'], 409);
        $pdo->prepare("UPDATE livreurs SET pause_jusqua=NULL WHERE id=?")->execute([$lid]);
        json_out(['ok' => true]);
    }

    case 'recupere': {
        $montant = (isset($d['montant']) && $d['montant'] !== '' && $d['montant'] !== null) ? max(0, (int)$d['montant']) : null;
        $st = $pdo->prepare("UPDATE commandes SET recupere_le=NOW(), montant_achat=COALESCE(?, montant_achat)
                             WHERE id=? AND livreur_id=? AND statut='en_cours' AND recupere_le IS NULL");
        $st->execute([$montant, (int)($d['commande_id'] ?? 0), $lid]);
        json_out(['ok' => $st->rowCount() > 0]);
    }

    case 'terminer': {          // colis : photo + signature obligatoires
        $id = (int)($d['commande_id'] ?? 0);
        $st = $pdo->prepare("SELECT service, achat_requis, recupere_le FROM commandes WHERE id=? AND livreur_id=? AND statut='en_cours'");
        $st->execute([$id, $lid]);
        $row = $st->fetch();
        if (!$row) json_out(['error' => 'Mission introuvable.'], 404);
        $svc = $row['service'];
        if ($row['achat_requis'] && !$row['recupere_le']) json_out(['error' => "Faites d'abord l'achat, puis confirmez « Achat effectué » avant de livrer."], 409);
        $photo = isset($_FILES['photo']) ? save_upload($_FILES['photo']) : null;
        $sig = !empty($d['signature']) ? save_data_url((string)$d['signature']) : null;
        if ($svc === 'colis' && (!$photo || !$sig)) json_out(['error' => 'La photo du colis livré et la signature du destinataire sont obligatoires.'], 422);
        $pdo->prepare("UPDATE commandes SET statut='livree', livree_le=NOW(), photo_livraison=?, signature=?, recupere_le=COALESCE(recupere_le,NOW()) WHERE id=?")
            ->execute([$photo, $sig, $id]);
        json_out(['ok' => true]);
    }

    case 'pause': {
        if (!empty($d['on'])) {
            $n = $pdo->prepare("SELECT COUNT(*) FROM commandes WHERE livreur_id=? AND statut IN ('affectee','en_cours')");
            $n->execute([$lid]);
            if ((int)$n->fetchColumn() > 0) json_out(['error' => 'Terminez vos missions avant de passer en pause.'], 409);
            $pdo->prepare("UPDATE livreurs SET pause_jusqua = NOW() + INTERVAL " . PAUSE_SEC . " SECOND WHERE id=?")->execute([$lid]);
        } else {
            $pdo->prepare("UPDATE livreurs SET pause_jusqua=NULL WHERE id=?")->execute([$lid]);
        }
        json_out(['ok' => true]);
    }

    default: json_out(['error' => 'Action inconnue'], 404);
    }
} catch (RuntimeException $e) {
    json_out(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    json_out(['error' => 'Erreur serveur'], 500);
}
