# 📱 BOXIBY sur iPhone — LISEZ CECI

## ⚠️ Il n'y a PAS de dossier « iphone » — et c'est normal

| | Android 🤖 | iPhone 🍎 |
|---|---|---|
| Application installable | Oui : dossier **`android/`** (projet Android Studio) | ❌ **Impossible ici** : Apple exige un ordinateur **Mac** avec Xcode + un compte développeur à **99 $/an** |
| Solution pour les iPhones | — | ✅ Le **site web lui-même** sert d'application (technique « PWA ») |

**La version iPhone, c'est le dossier `site/`** : grâce aux fichiers `manifest.json`, `sw.js` et aux icônes ajoutées dans `site/assets/img/`, le site s'installe sur l'écran d'accueil d'un iPhone **comme une vraie application** (icône BOXIBY, plein écran, écran de démarrage avec le logo).

## ✅ Comment installer « l'application » sur un iPhone (gratuit, 1 minute)

1. Sur l'iPhone, ouvrir l'adresse du site dans **Safari** (obligatoirement Safari)
2. Toucher le bouton **Partager** (le carré avec une flèche vers le haut)
3. Choisir **« Sur l'écran d'accueil »** → **Ajouter**

→ Une **icône BOXIBY** apparaît sur l'iPhone : en la touchant, le site s'ouvre en
plein écran, sans barre d'adresse, avec l'écran de démarrage au logo —
exactement comme une application. Le paiement Mobile Money fonctionne aussi
(Safari ouvre le composeur avec le code USSD pré-rempli).

💡 La même installation fonctionne sur Android (Chrome → ⋮ → « Installer l'application »)
pour les clients qui n'utilisent pas l'application Android Studio.

## 📁 Les fichiers de la version iPhone (dans `site/`)

```
site/
├── manifest.json                        ← déclaration de l'application (nom, icône, plein écran)
├── sw.js                                ← permet l'installation sur l'écran d'accueil
└── assets/img/
    ├── icon-192.png                     ← icône application (petite)
    ├── icon-512.png                     ← icône application (grande)
    ├── apple-touch-icon.png             ← icône spéciale iPhone
    ├── startup-iphone.png               ← écran de démarrage iPhone récent
    ├── startup-iphone-2.png             ← écran de démarrage iPhone standard
    └── favicon.ico                      ← petite icône dans l'onglet du navigateur
```

Les 5 pages du site (client, connexion, suivi, admin, livreur) contiennent déjà
les balises d'installation : rien d'autre à faire que de mettre `site/` sur votre serveur.

## ❓ Et si vous voulez vraiment une application App Store plus tard ?

Il faudra : un Mac avec Xcode, un compte développeur Apple (99 $/an), et une
version native du site (ou un outil comme Capacitor/React Native). En attendant,
la solution PWA ci-dessus est gratuite et couvre tous les iPhones.
