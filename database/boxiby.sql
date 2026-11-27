-- BOXIBY MADAGASCAR — Base de données (MySQL / MariaDB)
CREATE DATABASE IF NOT EXISTS boxiby CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE boxiby;

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role          ENUM('admin','livreur','client') NOT NULL,
  nom           VARCHAR(80)  NOT NULL,
  prenom        VARCHAR(80)  NOT NULL,
  telephone     VARCHAR(20)  NOT NULL UNIQUE,
  email         VARCHAR(120) NULL UNIQUE,
  mot_de_passe  VARCHAR(255) NULL,   -- NULL = compte créé par une commande, sans mot de passe
  photo_profil  VARCHAR(255) NULL,
  theme         ENUM('clair','sombre') NOT NULL DEFAULT 'clair',
  actif         TINYINT(1) NOT NULL DEFAULT 1,
  cree_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (role)
) ENGINE=InnoDB;

-- Livreurs : créés UNIQUEMENT par un admin. Connexion = code_boxiby + PIN.
CREATE TABLE IF NOT EXISTS livreurs (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id   INT UNSIGNED NOT NULL UNIQUE,
  code_im          VARCHAR(30) NOT NULL UNIQUE,
  code_boxiby      VARCHAR(20) NOT NULL UNIQUE,
  gps_moto         VARCHAR(60) NULL UNIQUE,
  tracer_telephone TINYINT(1) NOT NULL DEFAULT 1,
  pause_jusqua     DATETIME NULL,
  cree_par         INT UNSIGNED NULL,
  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Types de partenaires (ajoutés par l'admin, affichés automatiquement aux clients).
-- Pharmacie = type par défaut, verrouillé : JAMAIS de catalogue ni de photos (formulaire + ordonnance).
CREATE TABLE IF NOT EXISTS types_partenaires (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(40) NOT NULL UNIQUE,
  nom       VARCHAR(80) NOT NULL,
  catalogue TINYINT(1) NOT NULL DEFAULT 1,   -- 1 = catalogue d'articles avec photos et prix
  options   TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = options facultatives avec photo + prix (barquette, sachet…)
  systeme   TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = type par défaut non supprimable
  actif     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

INSERT IGNORE INTO types_partenaires (code, nom, catalogue, options, systeme) VALUES
  ('pharmacie', 'Pharmacie', 0, 0, 1),
  ('restaurant', 'Restaurant', 1, 1, 0),   -- option typique : barquette
  ('magasin', 'Magasin / grande surface', 1, 1, 0);   -- option typique : sachet

CREATE TABLE IF NOT EXISTS partenaires (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type_id        INT UNSIGNED NOT NULL,
  nom            VARCHAR(120) NOT NULL,
  adresse        VARCHAR(255) NOT NULL,
  telephone      VARCHAR(20) NULL,
  latitude       DECIMAL(10,7) NULL,
  longitude      DECIMAL(10,7) NULL,
  photo          VARCHAR(255) NULL,
  actif          TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (type_id) REFERENCES types_partenaires(id)
) ENGINE=InnoDB;

-- Options facultatives d'un partenaire, avec photo et prix (ex. restaurant : Barquette ; grande surface : Sachet)
CREATE TABLE IF NOT EXISTS options_partenaire (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partenaire_id INT UNSIGNED NOT NULL,
  nom           VARCHAR(80) NOT NULL,
  prix          INT NOT NULL DEFAULT 0,
  photo         VARCHAR(255) NULL,
  actif         TINYINT(1) NOT NULL DEFAULT 1,
  INDEX (partenaire_id),
  FOREIGN KEY (partenaire_id) REFERENCES partenaires(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Catalogue : articles / plats avec photo (pas pour les pharmacies)
CREATE TABLE IF NOT EXISTS articles (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partenaire_id  INT UNSIGNED NOT NULL,
  nom            VARCHAR(150) NOT NULL,
  description    VARCHAR(500) NULL,
  prix           INT NOT NULL DEFAULT 0,
  photo          VARCHAR(255) NULL,
  option_id      INT UNSIGNED NULL,              -- option ajoutée automatiquement au total (barquette, sachet…)
  actif          TINYINT(1) NOT NULL DEFAULT 1,
  cree_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (partenaire_id, actif),
  FOREIGN KEY (partenaire_id) REFERENCES partenaires(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES options_partenaire(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commandes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference        VARCHAR(20) NOT NULL UNIQUE,
  token            CHAR(32) NOT NULL UNIQUE,
  service          ENUM('colis','achat','deplacement') NOT NULL,
  mode             ENUM('express','planifiee') NULL,
  categorie_achat  VARCHAR(40) NULL,   -- code du type de partenaire, ou 'autre'
  partenaire_id    INT UNSIGNED NULL,
  type_colis       VARCHAR(120) NULL,
  details          TEXT NULL,
  ordonnance       VARCHAR(255) NULL,
  client_nom       VARCHAR(80) NOT NULL,
  client_prenom    VARCHAR(80) NOT NULL,
  client_tel       VARCHAR(20) NOT NULL,
  client_email     VARCHAR(120) NULL,
  depart_adresse   VARCHAR(255) NOT NULL,
  depart_lat       DECIMAL(10,7) NOT NULL,
  depart_lng       DECIMAL(10,7) NOT NULL,
  arrivee_adresse  VARCHAR(255) NOT NULL,
  arrivee_lat      DECIMAL(10,7) NOT NULL,
  arrivee_lng      DECIMAL(10,7) NOT NULL,
  distance_km      INT NOT NULL DEFAULT 0,
  prix_calcule     INT NOT NULL DEFAULT 0,
  prix_final       INT NULL,
  prix_envoye      TINYINT(1) NOT NULL DEFAULT 0,
  devis_requis     TINYINT(1) NOT NULL DEFAULT 0,
  devis_accepte    TINYINT(1) NOT NULL DEFAULT 0,
  achat_requis     TINYINT(1) NOT NULL DEFAULT 0,  -- le livreur achète d'abord, puis livre
  montant_achat    INT NULL,
  montant_articles   INT NOT NULL DEFAULT 0,   -- total des articles du catalogue
  montant_options    INT NOT NULL DEFAULT 0,   -- total des options (barquettes, sachets…) ajoutées automatiquement
  date_souhaitee   DATE NULL,
  heure_definie    TIME NULL,
  paiement         ENUM('mobile_money','livraison') NOT NULL DEFAULT 'livraison',
  paye             TINYINT(1) NOT NULL DEFAULT 0,
  statut           ENUM('en_attente','affectee','en_cours','livree','annulee') NOT NULL DEFAULT 'en_attente',
  livreur_id       INT UNSIGNED NULL,
  operateur_id     INT UNSIGNED NULL,
  affecte_le       DATETIME NULL,
  acceptee_le      DATETIME NULL,
  recupere_le      DATETIME NULL,
  livree_le        DATETIME NULL,
  photo_livraison  VARCHAR(255) NULL,
  signature        VARCHAR(255) NULL,
  client_lat       DECIMAL(10,7) NULL,
  client_lng       DECIMAL(10,7) NULL,
  client_pos_at    DATETIME NULL,
  cree_le          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (statut), INDEX (client_tel), INDEX (livreur_id),
  FOREIGN KEY (livreur_id) REFERENCES livreurs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Lignes d'une commande passée depuis un catalogue (prix figés au moment de la commande)
CREATE TABLE IF NOT EXISTS commande_articles (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id        INT UNSIGNED NOT NULL,
  article_id         INT UNSIGNED NULL,
  nom                VARCHAR(150) NOT NULL,
  quantite           INT NOT NULL,
  prix_unitaire      INT NOT NULL,
  photo              VARCHAR(255) NULL,
  option_nom         VARCHAR(80) NULL,
  option_photo       VARCHAR(255) NULL,
  option_unitaire    INT NOT NULL DEFAULT 0,
  FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS positions_livreurs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  livreur_id    INT UNSIGNED NOT NULL,
  latitude      DECIMAL(10,7) NOT NULL,
  longitude     DECIMAL(10,7) NOT NULL,
  source        ENUM('telephone','moto') NOT NULL DEFAULT 'telephone',
  enregistre_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (livreur_id, id),
  FOREIGN KEY (livreur_id) REFERENCES livreurs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Paramètres globaux de BOXIBY : les numéros de paiement Mobile Money (MVOLA, ORANGE MONEY, AIRTEL MONEY).
-- Tous les admins les voient ; seul le PREMIER admin (plus petit id admin) peut les modifier.
CREATE TABLE IF NOT EXISTS parametres (
  cle   VARCHAR(50) PRIMARY KEY,
  valeur VARCHAR(255) NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO parametres (cle, valeur) VALUES
  ('mvola', ''),
  ('orange', ''),
  ('airtel', '');

-- Liste des paiements Mobile Money déclarés par les clients (code USSD lancé depuis leur compte).
CREATE TABLE IF NOT EXISTS paiements (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id  INT UNSIGNED NOT NULL,
  operateur    ENUM('mvola','orange','airtel') NOT NULL,
  numero       VARCHAR(20) NOT NULL,
  montant      INT NOT NULL,
  ussd         VARCHAR(120) NULL,
  statut       ENUM('en_attente','confirme') NOT NULL DEFAULT 'en_attente',
  cree_le      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirme_le  DATETIME NULL,
  INDEX (commande_id),
  FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Satisfaction : 1 = Pas satisfait, 2 = Peut améliorer, 3 = Satisfait
CREATE TABLE IF NOT EXISTS evaluations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commande_id   INT UNSIGNED NOT NULL,
  cible         ENUM('livreur','operateur') NOT NULL,
  cible_user_id INT UNSIGNED NOT NULL,
  note          TINYINT NOT NULL,
  cree_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (commande_id, cible),
  FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Clients avec compte, classés selon leurs commandes (rapprochées par téléphone)
CREATE OR REPLACE VIEW v_clients_statut AS
SELECT u.id AS uid, u.nom, u.prenom, u.telephone, u.photo_profil, (u.mot_de_passe IS NOT NULL) AS a_mot_de_passe,
       COUNT(c.id) AS total_commandes,
       COALESCE(SUM(c.statut IN ('en_attente','affectee','en_cours')),0) AS commandes_en_cours,
       COALESCE(SUM(c.statut = 'livree'),0) AS commandes_livrees,
       CASE WHEN COUNT(c.id) = 0 THEN 'sans_commande'
            WHEN SUM(c.statut IN ('en_attente','affectee','en_cours')) > 0 THEN 'a_commande'
            ELSE 'deja_commande' END AS statut_client
FROM utilisateurs u
LEFT JOIN commandes c ON c.client_tel = u.telephone
WHERE u.role = 'client'
GROUP BY u.id;
