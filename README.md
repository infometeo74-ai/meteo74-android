# Météo74 pour Android

Version 0.7.1 · 26 novembre 2026 · `fr.meteo74.android`

## Installation et mises à jour

[Télécharger Météo74 0.7.1 pour Android](https://raw.githubusercontent.com/infometeo74-ai/meteo74-android/telechargements/Meteo74-0.7.1.apk)

Pour une première installation sur Android 7 ou plus récent, ouvre le lien depuis le téléphone, puis ouvre le fichier APK téléchargé et confirme l’installation. Si tu utilises Météo74 0.3.3 ou une version antérieure, installe cet APK par-dessus l’application pour conserver tes favoris.

À partir de Météo74 0.3.4, ouvre **Paramètres → Rechercher une mise à jour**, puis **Télécharger**. La première fois, Android peut te demander l’autorisation d’installer la mise à jour. Le téléchargement fonctionne en Wi-Fi ou sur données mobiles et peut reprendre après une interruption. L’application vérifie le fichier et la signature de Météo74 avant d’ouvrir l’installateur Android.

## Accueil et favoris

Les villes, la position suivie et les stations de ski apparaissent dans une liste de grandes tuiles qui défile verticalement. Une commune ouvre ses prévisions horaires et à dix jours. Une station ouvre sa fiche neige. Depuis **Ajouter une station**, choisir une fiche puis **Ajouter à l’accueil**. L’étoile de la fiche et le bouton **Gérer** permettent de retirer une station. Les tuiles de stations peuvent aussi constituer tout l’accueil.

**Ma position** figure également dans le sélecteur. Elle occupe une seule tuile. La localisation démarre sur demande, suit les déplacements pendant l’utilisation et reprend au retour dans l’application. Les communes précédemment enregistrées restent disponibles après la mise à jour. La source Open-Meteo est indiquée une fois pour la liste.

Les pictogrammes des villes et des stations tiennent compte de la nébulosité. Un code d’averses peut ainsi s’afficher sous un ciel couvert. Une couverture inconnue produit un pictogramme de précipitations neutre. Les prévisions quotidiennes des villes utilisent la couverture moyenne des heures de jour.

## Cartes météo

Dans **Carte**, choisir la température, la pluie sur une heure, le vent moyen, les rafales, l’humidité, la pression ou la hauteur de neige au sol. Les couleurs couvrent la Haute-Savoie. Toucher un endroit affiche la valeur locale estimée. Le modèle Météo-France fourni par Open-Meteo est échantillonné en 132 points, puis interpolé sur le relief embarqué. Des gradients locaux corrigent l’effet de l’altitude sur la température. Les écarts entre les mesures et le modèle ajustent automatiquement la surface à proximité des stations, avec une influence qui diminue selon la distance, l’écart d’altitude et le décalage horaire.

Les observations récentes des stations de Météo-France diffusées par LiveStation, des réseaux FFVL, Sensor.Community, METAR et des thermomètres à 2 m de Phénoclim alimentent le calcul. Le radar et les pluviomètres de MétéoSuisse donnent le cumul sur une heure, complété par la grille si nécessaire. Les pluviomètres de Haute-Savoie ajustent ce cumul lorsque dix mesures consécutives de six minutes sont disponibles. La carte indique son heure de validité, ses sources et le nombre de stations utilisées. Les services récupèrent une seule grille partagée pour les variables du département et la conservent sur trois heures. [Modèle Météo-France via Open-Meteo](https://open-meteo.com/en/docs/meteofrance-api) · [Phénoclim](https://spot.creamontblanc.org/programmes/phenoclim)

**Neige au sol** associe les hauteurs des bulletins des domaines et des stations météo au modèle MétéoSuisse ICON-CH1 à environ 1 km, avec ICON-D2 en secours. Les 132 points de la grille sont complétés par 54 points dans les vallées. Les modèles sont interrogés à l’altitude native de leurs mailles. L’interpolation évalue la présence de neige entre terrains d’altitude comparable avant d’estimer son épaisseur. Chaque mesure de terrain confirme, réduit ou augmente localement l’épaisseur sur son étage d’altitude. Un sol nu laisse apparaître le fond de carte. L’échelle est graduée de 0 à 300 cm et le chiffre au toucher conserve les épaisseurs supérieures à trois mètres. [Modèle MétéoSuisse](https://open-meteo.com/en/docs/meteoswiss-api)

Le relevé de Balme apparaît dans les bulletins de Chamonix et de Vallorcine. Météo74 le compte une seule fois. Les points de la vallée correspondent aux altitudes de l’Index, de la Tête de Balme, de Bochard et du Prarion. [Bulletin des domaines de Chamonix](https://bulletinv3.lumiplan.pro/bulletin.php?lang=fr&station=chamonix) · [Plan de Brévent–Flégère](https://static.seetheworld.com/item_files/original/Plan_Hiver_BVT-FLG.pdf)

[Carte des températures](artwork/carte-observations.png) · [Carte de la neige au sol](artwork/carte-neige-au-sol.png)

### Stations WeatherLink

Le service de la carte accepte les observations de l’API officielle WeatherLink v2. Pour raccorder des stations, utiliser un compte dédié à Météo74 et y faire partager les stations destinées à la carte. Dans le compte WeatherLink, **Generate v2 Key** fournit les deux valeurs à enregistrer dans les secrets du service Météo74, `WEATHERLINK_API_KEY` et `WEATHERLINK_API_SECRET`. Le compte peut limiter la sélection avec `WEATHERLINK_STATION_IDS`, une liste facultative d’identifiants numériques séparés par des virgules. [Compte WeatherLink](https://www.weatherlink.com/account) · [Droits de partage Davis](https://weatherlink.github.io/v2-api/data-permissions)

Le service sélectionne les stations publiques actives situées en Haute-Savoie. Il utilise l’heure du capteur, le vent moyen et les rafales sur dix minutes, et le cumul glissant sur une heure lorsque l’appareil le fournit. Les températures extérieures, l’humidité et la pression dont la référence est précisée sont envoyées en unités métriques. Le partage Basic donne accès aux conditions courantes par pas de quinze minutes. Les observations reçues contribuent aux couleurs de la carte.

## Neige et stations

L’onglet **Neige** réunit 40 stations et accès de ski alpin et 22 sites de ski de fond en Haute-Savoie. Les six secteurs géographiques se déplient et la recherche accepte aussi le nom d’un domaine ou d’un secteur. Cet onglet fonctionne dès le premier lancement, même quand aucune commune n’a encore été choisie.

Les 40 fiches alpines distinguent 49 secteurs de prévision. Chaque secteur a un point de départ et un sommet de pistes nommé, avec ses propres coordonnées et son altitude. Le catalogue conserve la référence de chaque sommet. Le signe ≈ distingue les hauteurs déterminées à partir des tracés de pistes de la DDT et du relief IGN. Les sites nordiques utilisent un point météo identifié. Les deux pratiques disposent de cinq jours de prévisions.

En haut de la liste, la carte de neige utilise les mêmes données que l’onglet Carte. Les flocons ouvrent les fiches des stations. Les stations proches partagent un bouton à cette échelle et se séparent en zoomant. La pratique et la recherche filtrent à la fois les flocons et la liste. Chaque ligne indique la température au départ, les hauteurs publiées avec les altitudes correspondantes et les ouvertures communiquées. La liste charge en une seule requête les résumés des bulletins enregistrés.

La fonction **meteo74-neige** interroge les sources configurées pour chaque fiche. Elle extrait les relevés de neige, les pistes et remontées ouvertes, les kilomètres nordiques et, selon la source, le détail nommé des ouvertures. Les pages tierces sont traitées sur le serveur. Le téléphone reçoit des données structurées et les présente dans Météo74. Une préouverture annoncée garde ses propres dates. Les états affichés en direct par un opérateur portent une date de consultation. Les autres ouvertures et hauteurs relevées nécessitent un bulletin récent. À défaut, la hauteur de neige modélisée au point météo est signalée comme une estimation.

## Webcams

L’onglet **Webcams** réunit 22 caméras du lac d’Annecy, des Aravis et Bornes, du Chablais, du Grand Massif et du massif du Mont-Blanc. Le sélecteur filtre les vues par secteur. Une pression sur une photo l’agrandit dans l’application. La date accompagne l’image lorsqu’elle est publiée par le diffuseur. Le lien de la fiche ouvre la webcam officielle. Les images sont chargées à mesure du défilement. [Lac d’Annecy Tourisme](https://www.lac-annecy.com/webcams/) · [Grand Massif](https://www.grand-massif.com/webcams/) · [Le Grand-Bornand](https://www.legrandbornand.com/webcams/)

[Neige et stations](artwork/neige-stations.png) · [Galerie des webcams](artwork/webcams.png)

## Radar

Ouvrir **Radar** pour lancer la relecture des deux dernières heures disponibles. Régler la vitesse à 0,5×, 1×, 2× ou 4×, mettre en pause ou choisir une image avec le curseur. La première image disponible s’affiche pendant le chargement. La lecture démarre automatiquement dès que la réserve d’images suffit pour la vitesse choisie. Un petit déplacement conserve les images déjà préparées. Après un grand déplacement ou un zoom, la carte prépare la nouvelle zone. La vitesse, l’option Neige et l’opacité sont mémorisées. L’onglet s’arrête lorsqu’on le quitte.

Sur **Suisse & Alpes**, l’application lit les observations PRECIP de MétéoSuisse, espacées de cinq minutes sur une grille de 1 km. Deux observations se fondent en continu. Une troisième couche prépare la prochaine image. Le moteur de rendu estime les déplacements à la préparation des observations, puis le lecteur programme la transition suivante à l’avance. Le calcul du déplacement tient compte des mouvements inférieurs à une cellule de la grille de suivi. L’ouverture de la carte démarre la préparation des images en arrière-plan. Une coupure entre deux observations trop éloignées est conservée. L’horloge distingue la mesure de la relecture interpolée. Un appui sur la carte arrête la lecture et donne l’intensité en mm/h de l’observation la plus proche. La valeur vient de la cellule mesurée et les hachures repèrent les mesures absentes.

Activer **Neige** pour distinguer en violet les précipitations probablement neigeuses sur le radar suisse. La limite pluie-neige horaire du modèle ICON-CH1 est interpolée à l’heure de chaque observation et comparée à l’altitude du terrain. Les couleurs représentent une intensité en équivalent eau. Si le modèle ou le terrain est indisponible, l’intensité reste visible et l’interface signale l’incertitude sur le type.

Le mode **France** utilise les réflectivités maximales du composite OPERA produit par Météo-France pour EUMETNET, avec les radars français et ceux des pays voisins. La grille de 1 km est recadrée sur la France métropolitaine, Corse comprise. Les observations espacées de cinq minutes utilisent le même lecteur que le radar alpin. La carte s’ouvre sur la France continentale à un zoom ajusté à l’écran. Le bouton de recentrage retrouve ce cadrage. La réflectivité est convertie en intensité estimée avec la relation de Marshall–Palmer. L’option Neige compare la limite pluie-neige du modèle ICON-EU à l’altitude du terrain. Le service public de Météo74 prépare la grille depuis les GeoTIFF officiels et la transmet comprimée au téléphone.

Le contour de la Haute-Savoie suit le tracé IGN. L’extérieur du département est légèrement assombri sous la couche de précipitations. Les noms des communes proviennent du fond OpenStreetMap.

Sur **Europe**, les observations de RainViewer sont espacées de dix minutes. Météo74 décode la réflectivité des tuiles originales à leur résolution native avant de convertir les valeurs en mm/h et de les interpoler. L’option Neige reprend le type identifié par le fournisseur. Si une couleur de phase est inconnue, l’intensité provient de la tuile sans distinction de phase. Un appui sur la carte affiche l’estimation à l’heure de l’observation choisie.

Les trois cartes utilisent la même échelle à neuf seuils en mm/h, avec le même violet pour la neige probable. L’estimation en France et en Europe est un équivalent en eau déduit de la réflectivité radar. Deux sources peuvent observer des intensités différentes au même endroit. Le relief Mapzen se trouve sous les précipitations et le curseur règle leur opacité.

## Météo locale

Les 113 pictogrammes illustrés de Météo74 sont embarqués dans l’application et consultables dans **Paramètres → Collection de pictogrammes**.

## Sources

- [MétéoSuisse, produit PRECIP (RZC)](https://opendatadocs.meteoswiss.ch/d-radar-data/d1-precipitation-radar-products). Source des données et de l’échantillon de test HDF5 fourni sous [CC BY 4.0](https://opendatadocs.meteoswiss.ch/general/terms-of-use). Projection et palette adaptées par Météo74.
- [Open-Meteo](https://open-meteo.com/en/docs) pour les températures modélisées et les prévisions. La [recherche géographique](https://open-meteo.com/en/docs/geocoding-api) utilise des données GeoNames.
- [Open-Meteo / ICON-CH1 de MétéoSuisse](https://open-meteo.com/en/docs/meteoswiss-api) pour la limite pluie-neige. [Terrain Tiles de Mapzen](https://registry.opendata.aws/terrain-tiles/) pour l’altimétrie, consultée le 25 novembre 2026. Les [attributions par source](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) détaillent notamment les contributions SRTM, USGS et GMTED.
- [EUMETNET OPERA](https://www.eumetnet.eu/observations/weather-radar-network/) et Météo-France pour le composite de réflectivité DBZH, recadré, quantifié et colorisé sous [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Les [points de distribution](https://eumetnet.github.io/openradardata-documentation/2-ORD-API-discovering-and-accessing-data/) publient les observations.
- [Contours administratifs IGN / Etalab](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2025/geojson/departements-100m.geojson), édition 2025 à 100 m, pour la limite de la Haute-Savoie, sous [Licence Ouverte](https://www.etalab.gouv.fr/licence-ouverte-open-licence/). Le nom de la commune actuelle provient de l’[API Découpage administratif](https://geo.api.gouv.fr/decoupage-administratif/communes) ou de [Photon](https://photon.komoot.io/) et OpenStreetMap.
- [Relation réflectivité–intensité de Marshall–Palmer](https://www.weather.gov/tae/research-zrpaper) pour la conversion de la réflectivité en mm/h. [ICON-EU / Open-Meteo](https://open-meteo.com/en/docs/dwd-api) pour la limite pluie-neige en France.
- [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html) et sa [table d’encodage RGBA](https://www.rainviewer.com/api/color-schemes.html) pour le radar Europe et [OpenStreetMap](https://www.openstreetmap.org/copyright) pour la cartographie.
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
