# BOXIBY MADAGASCAR — Application mobile (Android Studio) + Site PHP

Ce dossier contient :

- `site/` — le site BOXIBY (PHP/MySQL) mis à jour avec le paiement Mobile Money par USSD.
- `android/` — l'application mobile Android (projet Android Studio, Kotlin), prête à ouvrir.
- `database/boxiby.sql` — copie du script de base de données (déjà présent aussi dans `site/database/`).

---

## 1. Installer le site (serveur web)

1. Copiez le contenu de `site/` sur votre hébergement (ou dans `htdocs` avec XAMPP).
2. Créez la base de données : importez `database/boxiby.sql` dans phpMyAdmin, ou ouvrez `install.php` une seule fois puis supprimez-le.
3. Modifiez `config.php` (DB_HOST, DB_NAME, DB_USER, DB_PASS).

## 2. Nouveautés de cette version

### a) Paiement Mobile Money AUTOMATIQUE par code USSD (côté client)
Quand un client choisit « Mobile Money », il voit les numéros de BOXIBY puis, après l'envoi de la commande
(aussi sur la page de suivi), trois boutons : **MVola**, **Orange Money**, **Airtel Money**.
Un clic enregistre le paiement et compose automatiquement le code USSD **depuis le compte du client** :

| Opérateur | Code USSD envoyé |
|---|---|
| MVola | `#111*1*2*1*<numéro BOXIBY 10 chiffres>*<montant>#` |
| Airtel Money | `*436*2*1*1*<numéro BOXIBY 10 chiffres>*<montant>#` |
| Orange Money | `#144*1*1*<numéro BOXIBY 10 chiffres>*<montant>#` |

Dans l'application Android, le code est composé directement (autorisation d'appel demandée une fois).
Dans un simple navigateur, le téléphone ouvre le composeur avec le code pré-rempli.

### b) Espace admin
- Menu hamburger (avatar en haut à droite) : **Changer ma photo** et **Déconnexion**.
- Nouvel onglet **Paiements** :
  - les **3 numéros de paiement** (MVola, Orange Money, Airtel Money) : visibles par **tous les admins**,
    modifiables par le **premier admin seulement** (bouton « Modifier les numéros ») ;
  - la **liste des paiements** déclarés par les clients, avec bouton « Confirmer le paiement » ;
- Remarque **« Déjà payé ✔ »** affichée :
  - dans la liste des commandes de l'admin,
  - dans la liste des courses du livreur (missions et historique).

### c) Base de données (2 nouvelles tables — créées automatiquement par le SQL)
- `parametres` : stocke les numéros mvola / orange / airtel.
- `paiements` : liste des paiements (commande, opérateur, numéro, montant, code USSD, statut).

Si vous mettez à jour un site déjà installé, exécutez seulement ces deux blocs `CREATE TABLE`
depuis `database/boxiby.sql`.

## 3. Application Android (Android Studio)

1. Ouvrez Android Studio → **Open** → sélectionnez le dossier `android/`.
2. Attendez la synchronisation Gradle (internet requis au premier lancement).
3. **Changez l'adresse du site** : `app/src/main/res/values/strings.xml` → `site_url`
   (mettez par ex. `https://votre-domaine.mg/`).
4. Run ▶ sur un téléphone ou un émulateur.

Au lancement : **écran de chargement avec le logo BOXIBY** (comme Facebook), puis le site s'ouvre
dans l'application (WebView). L'application gère :
- la localisation (carte) ;
- l'envoi de photos/ordonnances (appareil photo et galerie) ;
- les appels téléphoniques ;
- la **composition automatique des codes USSD** MVola / Orange Money / Airtel Money.

Caractéristiques : Kotlin, minSdk 24 (Android 7.0), targetSdk 34, AGP 8.5.2, Gradle 8.7.

## 4. Application sur iPhone (gratuite — PWA)

Il n'y a pas d'application App Store (Apple exige un Mac + 99 $/an), mais le site
s'installe comme une application sur les iPhones, **gratuitement** :

1. Ouvrir l'adresse du site dans **Safari** (obligatoirement Safari).
2. Toucher le bouton **Partager** (le carré avec une flèche vers le haut).
3. Choisir **« Sur l'écran d'accueil »** puis **Ajouter**.

Résultat : une **icône BOXIBY** apparaît sur l'iPhone — plein écran, sans barre
d'adresse, avec un **écran de démarrage montrant le logo** (comme l'application Android).
Le paiement Mobile Money fonctionne aussi : Safari ouvre le **composeur avec le
code USSD pré-rempli**, il ne reste qu'à appuyer sur l'appel.

Fichiers de la PWA : `manifest.json`, `sw.js`, et les icônes dans `assets/img/`
(`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `startup-iphone*.png`).
Astuce : les clients Android peuvent aussi installer le site de cette façon
s'ils n'utilisent pas l'application Android Studio.

## 5. Arborescence

```
boxiby/
├── site/                  ← site PHP/MySQL complet
│   ├── config.php, install.php, login.php, logout.php, index.php, suivi.php
│   ├── api/               ← admin.php, client.php, livreur.php, gps.php
│   ├── admin/             ← espace d'administration
│   ├── livreur/           ← espace livreur
│   ├── assets/            ← css, js, images
│   ├── database/boxiby.sql
│   ├── manifest.json, sw.js   ← installation iPhone / écran d'accueil (PWA)
│   └── uploads/           ← photos (droits en écriture requis)
└── android/               ← projet Android Studio (application mobile)
```
