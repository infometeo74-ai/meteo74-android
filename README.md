# Météo74 pour Android

Version 0.4.0 · 25 novembre 2026 · `fr.meteo74.android`

## Installation et mises à jour

[Télécharger Météo74 0.4.0 pour Android](https://raw.githubusercontent.com/infometeo74-ai/meteo74-android/telechargements/Meteo74-0.4.0.apk)

Pour une première installation sur Android 7 ou plus récent, ouvre le lien depuis le téléphone, puis ouvre le fichier APK téléchargé et confirme l’installation. Si tu utilises Météo74 0.3.3 ou une version antérieure, installe cet APK par-dessus l’application pour conserver tes favoris.

À partir de Météo74 0.3.4, ouvre **Paramètres → Rechercher une mise à jour**, puis **Télécharger**. La première fois, Android peut te demander l’autorisation d’installer la mise à jour. Le téléchargement fonctionne en Wi-Fi ou sur données mobiles et peut reprendre après une interruption. L’application vérifie le fichier et la signature de Météo74 avant d’ouvrir l’installateur Android.

## Accueil et favoris

Une grande tuile par lieu présente la température, le pictogramme, le ressenti, le vent, l’humidité et les extrêmes du jour. La liste défile verticalement. Toucher une tuile ouvre le détail, les prochaines heures et les prévisions à dix jours. Au premier lancement, et après la suppression du dernier favori, l’accueil propose **Ma position** et **Ajouter une ville**. L’onglet **Favoris** permet de gérer la liste.

**Ma position** figure également dans le sélecteur. Elle occupe une seule tuile. La localisation démarre sur demande, suit les déplacements pendant l’utilisation et reprend au retour dans l’application. Les communes précédemment enregistrées restent disponibles après la mise à jour. La source Open-Meteo est indiquée une fois pour la liste.

## Radar

Ouvrir **Radar** pour lancer la relecture des deux dernières heures disponibles. Régler la vitesse à 0,5×, 1×, 2× ou 4×, mettre en pause ou choisir une image avec le curseur. La première image disponible s’affiche pendant le chargement. La lecture démarre automatiquement dès que la réserve d’images suffit pour la vitesse choisie. Un petit déplacement conserve les images déjà préparées. Après un grand déplacement ou un zoom, la carte prépare la nouvelle zone. La vitesse, l’option Neige et l’opacité sont mémorisées. L’onglet s’arrête lorsqu’on le quitte.

Sur **Suisse & Alpes**, l’application lit les observations PRECIP de MétéoSuisse, espacées de cinq minutes sur une grille de 1 km. Deux observations se fondent en continu. Une troisième couche prépare la prochaine image. Le moteur de rendu estime les déplacements à la préparation des observations, puis le lecteur programme la transition suivante à l’avance. Le calcul du déplacement tient compte des mouvements inférieurs à une cellule de la grille de suivi. L’ouverture de la carte démarre la préparation des images en arrière-plan. Une coupure entre deux observations trop éloignées est conservée. L’horloge distingue la mesure de la relecture interpolée. Un appui sur la carte arrête la lecture et donne l’intensité en mm/h de l’observation la plus proche. La valeur vient de la cellule mesurée et les hachures repèrent les mesures absentes.

Activer **Neige** pour distinguer en violet les précipitations probablement neigeuses sur le radar suisse. La limite pluie-neige horaire du modèle ICON-CH1 est interpolée à l’heure de chaque observation et comparée à l’altitude du terrain. Les couleurs représentent une intensité en équivalent eau. Si le modèle ou le terrain est indisponible, l’intensité reste visible et l’interface signale l’incertitude sur le type.

Le mode **France** utilise les réflectivités maximales du composite OPERA produit par Météo-France pour EUMETNET, avec les radars français et ceux des pays voisins. La grille de 1 km est recadrée sur la France métropolitaine, Corse comprise. Les observations espacées de cinq minutes utilisent le même lecteur que le radar alpin. La légende et la mesure au toucher sont en dBZ. Le produit français ne fournit pas le type pluie/neige. Le service public de Météo74 prépare la grille depuis les GeoTIFF officiels et la transmet comprimée au téléphone.

Le contour de la Haute-Savoie suit le tracé IGN. L’extérieur du département est légèrement assombri sous la couche de précipitations. Les noms des communes proviennent du fond OpenStreetMap.

Sur **Europe**, l’option Neige active les couleurs de phase de RainViewer, avec la légende de ce fournisseur. Les images de dix minutes sont animées en continu. Les tuiles RainViewer de 512 pixels sont assemblées, puis redimensionnées en une seule passe. Les trois modes placent le relief Mapzen sous les précipitations. Sur la carte suisse, la légende donne les neuf plages de couleur en mm/h. Le curseur de visibilité règle la transparence. La précision des observations reste celle de chaque source. Les reliefs, les fonds de carte et le radar nécessitent une connexion.

## Météo locale

L’accueil, les prévisions horaires et les dix prochains jours utilisent les pictogrammes embarqués de Météo74. Les 58 fichiers de la collection sont consultables dans **Paramètres → Collection de pictogrammes**. Les pictogrammes embarqués sont des images transparentes de 512 × 512 pixels. Le brouillard utilise une nappe diffuse contrastée. Les petites adaptations couvrent les conditions qui manquent dans le dossier original. Le logo de l’accueil est centré entre les bords de l’écran, avec les actions de synchronisation et de paramètres à droite. Les prévisions horaires disposent de variantes de jour et de nuit. Dans la liste des dix jours, la date et le pictogramme suffisent pour lire la prévision. Toucher un jour ouvre son détail. L’accueil présente température, ressenti, vent, rafales, humidité et pression. Les prévisions couvrent les 24 prochaines heures et les dix prochains jours. La recherche de communes privilégie la Haute-Savoie. Le GPS s’active à la demande. Les favoris et les dernières prévisions consultées sont conservés sur le téléphone. Les nouvelles mesures et le radar nécessitent une connexion.

## Sources

- [MétéoSuisse, produit PRECIP (RZC)](https://opendatadocs.meteoswiss.ch/d-radar-data/d1-precipitation-radar-products). Source des données et de l’échantillon de test HDF5 fourni sous [CC BY 4.0](https://opendatadocs.meteoswiss.ch/general/terms-of-use). Projection et palette adaptées par Météo74.
- [Open-Meteo](https://open-meteo.com/en/docs) pour les températures modélisées et les prévisions. La [recherche géographique](https://open-meteo.com/en/docs/geocoding-api) utilise des données GeoNames.
- [Open-Meteo / ICON-CH1 de MétéoSuisse](https://open-meteo.com/en/docs/meteoswiss-api) pour la limite pluie-neige. [Terrain Tiles de Mapzen](https://registry.opendata.aws/terrain-tiles/) pour l’altimétrie, consultée le 25 novembre 2026. Les [attributions par source](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) détaillent notamment les contributions SRTM, USGS et GMTED.
- [EUMETNET OPERA](https://www.eumetnet.eu/observations/weather-radar-network/) et Météo-France pour le composite de réflectivité DBZH, recadré, quantifié et colorisé sous [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Les [points de distribution](https://eumetnet.github.io/openradardata-documentation/2-ORD-API-discovering-and-accessing-data/) publient les observations.
- [Contours administratifs IGN / Etalab](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2025/geojson/departements-100m.geojson), édition 2025 à 100 m, pour la limite de la Haute-Savoie, sous [Licence Ouverte](https://www.etalab.gouv.fr/licence-ouverte-open-licence/). Le nom de la commune actuelle provient de l’[API Découpage administratif](https://geo.api.gouv.fr/decoupage-administratif/communes) ou de [Photon](https://photon.komoot.io/) et OpenStreetMap.
- [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html) pour le radar Europe et [OpenStreetMap](https://www.openstreetmap.org/copyright) pour la cartographie.
- [Leaflet](https://leafletjs.com/), [Proj4js](https://github.com/proj4js/proj4js) et [jsfive](https://github.com/usnistgov/jsfive) sont embarqués avec leurs licences dans `app/src/main/assets/web/vendor/`.

Les sources graphiques se trouvent dans `artwork/originaux` et `artwork/masters`. Pour régénérer la collection, exécuter `node artwork/prepare-icons.cjs` avec Node.js et sharp. Les images finales sont déjà intégrées à l’application.

## Compiler le projet

Le projet utilise un JDK 17, Android SDK Platform 35, Build Tools 35.0.0 et Gradle 8.11.1. Définir `JAVA_HOME` et `ANDROID_HOME` pour sa machine. Pour signer, restaurer en local le dossier `.signing` depuis la sauvegarde privée Météo74. Git ignore ce dossier. La sauvegarde de la clé reste à la disposition du propriétaire. L’APK signé est le fichier destiné à la distribution.

```sh
node --test tests/*.test.cjs
./build.sh
```

L’APK produit est `app/build/outputs/apk/release/app-release.apk`. La WebView charge son interface embarquée depuis l’origine AndroidX WebViewAssetLoader. Le conteneur natif réserve l’espace des barres système, de la découpe d’écran et du clavier.

## Distribuer une nouvelle version dans l’appli

Conserver `applicationId` et la clé existante. Augmenter `versionCode`, actualiser `versionName` dans `app/build.gradle` et reporter ces valeurs dans `UpdateConfig.java`. Actualiser la version affichée dans l’interface.

Le projet Supabase de Météo74 est `bepcgggpdtxwaifiyrah` (Paris). Son espace privé `meteo74-releases` contient les APK signés. La fonction `meteo74-updates` diffuse le manifeste et le fichier qu’il désigne. L’application utilise la clé anonyme de ce projet. Les identifiants administrateur restent sur le serveur.

1. Exécuter `python3 release/prepare.py --notes "Description de la version"`. Le manifeste généré dans `supabase/functions/meteo74-updates/latest.json` donne le nom du fichier, sa taille et son empreinte SHA-256.
2. Charger l’APK signé sous ce nom dans [le stockage privé de Météo74](https://supabase.com/dashboard/project/bepcgggpdtxwaifiyrah/storage/buckets/meteo74-releases), avec le type `application/vnd.android.package-archive`. Chaque numéro de version correspond à un fichier distinct.
3. Vérifier que l’APK chargé correspond à l’empreinte du manifeste, puis déployer la fonction depuis la racine du dépôt avec la cible explicite ci-dessous.

```sh
supabase functions deploy meteo74-updates --project-ref bepcgggpdtxwaifiyrah
```

Le téléphone peut reprendre un téléchargement interrompu grâce aux requêtes HTTP Range. Pour contrôler la publication, comparer le manifeste servi et le SHA-256 de l’APK téléchargé avec les valeurs locales.
