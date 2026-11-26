# Météo74 0.7.2

26 novembre 2026. L’APK signé de l’application `fr.meteo74.android` porte le numéro 16 et utilise le même certificat que la 0.7.1. Taille de 6 092 292 octets, SHA-256 `be5eb8057b7597660417d8fe0278ff49a2535c8e74ba5acd77359abab421562e`. L’alignement ZIP et les fichiers embarqués ont été contrôlés. Les 53 tests passent. Android Lint signale cinq avertissements et zéro erreur.

Les essais ont été réalisés dans Chromium en émulation mobile à partir des fichiers extraits de l’APK. Les 118 vignettes de webcams ont été chargées et décodées. Les 48 localités sont réparties en sept secteurs. La recherche a été essayée avec et sans accents, avec un filtre de secteur actif et avec une recherche sans résultat. Sept vues ont été ouvertes en grand, dont celles du Salève, de Sciez et de La Roche-sur-Foron.

Sur les trois radars, les relevés successifs sont restés alignés avec le fond de carte et les heures affichées correspondent aux observations. Aucune image vide n’a été relevée pendant les séquences. La boucle, la pause, le déplacement du curseur, le zoom, la lecture d’intensité et les changements rapides de source ont été vérifiés.

Les 113 PNG individuels de la collection approuvée ont été importés en conservant leur cadrage complet. Le canal alpha des WebP correspond pour chaque pixel aux originaux redimensionnés en 384 × 384. La deuxième image reprend le dernier soleil voilé de cirrus.

# Météo74 0.7.0

26 novembre 2026. Le paquet Android `fr.meteo74.android` porte le numéro 14. Les 4 718 672 octets de l’APK signé donnent le SHA-256 `7082e9fc08a77153681e1952623709beff858e2cf160d0019c4b92bf062e7f3d`. Le certificat correspond à celui de la 0.6.1. Les 93 fichiers de l’interface correspondent aux sources. Les contrôles d’alignement ZIP et les 53 tests passent. Android Lint signale zéro erreur et cinq avertissements.

En émulation mobile, la tuile de Reignier-Ésery a affiché « Couvert, pluie intermittente » pour une couverture nuageuse de 100 %. La relecture du cas d’averses avec un code 80, 100 % de nuages et des précipitations a produit « Couvert, averses » et le pictogramme de pluie.

Le service a renvoyé le modèle MétéoSuisse ICON-CH1 avec les 54 points de vallée. Le 26 novembre au matin, la lecture par appui sur la carte donnait 0 cm à Bonneville, Cluses, Magland et Sallanches. La surface conservait 3 cm près du relevé de Chamonix, et le relevé des Grandes Platières indiquait 250 cm à 2 500 m. Les tests de régression couvrent un épisode de neige en vallée, une mesure nulle et le voisinage d’un sommet enneigé.

Les 62 fiches figurent dans le répertoire partagé. La liste de Flaine a affiché les deux hauteurs avec leurs altitudes. Les flocons ont ouvert les fiches de Flaine et du site nordique des Glières. Les essais de navigation ont couvert le retour de fiche, le filtre de pratique, la recherche, les largeurs de 320, 393 et 600 pixels et l’absence de requêtes d’archives depuis les écrans de carte.

Les adresses d’images publiques des 22 webcams ont été vérifiées auprès des diffuseurs. La galerie extraite de l’APK a chargé l’image datée d’Annecy et celle du secteur du Mont-Blanc, le filtre géographique et le dialogue d’agrandissement. Les dates indiquées correspondent aux dernières images publiées par les opérateurs.

Le manifeste de l’application propose la 0.7.0. Les téléchargements depuis les paramètres et depuis le dépôt public correspondent octet pour octet à l’APK signé. La reprise de téléchargement renvoie 206 et un intervalle hors fichier 416. Le service de distribution accepte uniquement les lectures.

# Météo74 0.6.1

26 novembre 2026. Le paquet Android `fr.meteo74.android` porte le numéro 13. Son APK signé contient 4 713 325 octets. SHA-256 `726ffecbff86b863f7e2c208ca5d94eb623547ecd8f0b987ce7fbf5b24c37072`. Son certificat correspond à celui de la 0.6.0. L’alignement ZIP et les 92 fichiers de l’interface embarquée ont été vérifiés. Les 51 tests passent. Android Lint signale cinq avertissements et zéro erreur.

Le 26 novembre à 8 h 30, heure de Paris, le service en production renvoyait 65 stations météo distinctes. À 8 h 47, la carte de neige utilisait 25 lieux de mesure dont onze provenaient des bulletins déjà enregistrés pour les fiches de ski. Le point de Balme, commun à Chamonix et Vallorcine, figurait une seule fois. À Flaine, la fiche et la carte ont fourni 23 cm au Forum à 1 600 m et 250 cm aux Grandes Platières à 2 500 m. Les tests vérifient le filtrage par altitude, le dédoublonnage des points, les données expirées et le traitement d’une hauteur nulle. La carte lit les hauteurs archivées en base. La synchronisation des bulletins est planifiée toutes les heures.

Les sept couches de la grille de modèle ont renvoyé 132 valeurs chacune. L’interface extraite de l’APK a rendu les sept surfaces en couleurs sur 20 162 cellules à l’intérieur du département, avec un extérieur transparent. Lors de cet essai, 62 stations ajustaient la température et 20 pluviomètres la pluie sur une heure. Les essais dans Chromium en émulation mobile ont couvert les largeurs de 320, 393 et 600 pixels, la lecture par appui, les archives du 3 avril, la vue horaire et le changement de couche hors connexion après chargement.

Le manifeste diffusé par les paramètres annonce la version 0.6.1. Les téléchargements depuis l’application et depuis le dépôt public correspondent octet pour octet à l’APK signé. Les réponses HTTP 206 pour une reprise et 416 pour un intervalle hors fichier ont été vérifiées. Le service public de distribution accepte uniquement la lecture.

# Météo74 0.6.0

26 novembre 2026. Le paquet Android `fr.meteo74.android` porte le numéro 12. L’APK signé contient 4 711 533 octets. SHA-256 `6718a6521b559995888282450e9cf4135603318b8dd4593cb0306fc58dc4572b`. Son certificat correspond à celui de la 0.5.1. Les 92 fichiers de l’interface embarquée correspondent aux sources. L’alignement ZIP est validé.

Les 40 tests passent. Les nouveaux contrôles couvrent le contour et le relief du département, les stations frontalières, les mesures périmées, les unités de vent et de pression, les valeurs nulles, la qualité des relevés et le décodage du cumul CombiPrecip sur 60 minutes. Android Lint rapporte zéro erreur et cinq avertissements.

La fonction de production a renvoyé 22 stations récentes des réseaux FFVL, Sensor.Community et METAR, et 36 stations pour le dernier relevé horaire de Météo-France. Ce dernier comportait 35 mesures de température et 31 cumuls de précipitations. Le nombre de stations récentes varie avec l’heure et la disponibilité des réseaux. La trame CombiPrecip contrôlée couvrait les 20 162 cellules intérieures du relief embarqué.

Dans Chromium mobile, l’interface extraite de l’APK a chargé les deux modes et le cumul réel de MétéoSuisse. Les vérifications ont porté sur les couleurs, leur découpage à la limite du département, les unités, les fiches de station, la recherche d’Ésery dans le répertoire Infoclimat, le retour depuis les autres onglets, les données en cache hors connexion et l’affichage aux largeurs de 320, 393 et 600 pixels. La vérification mobile a été réalisée en émulation.

Les téléchargements complets depuis le dépôt et le service proposé dans les paramètres correspondent octet pour octet à l’APK signé. Le manifeste annonce 0.6.0. La reprise renvoie HTTP 206 et l’intervalle hors fichier HTTP 416. Le service de distribution de l’application accepte uniquement la lecture.

# Météo74 0.5.1

25 novembre 2026. Le paquet Android `fr.meteo74.android` porte le numéro 11. Les 4 637 550 octets de l’APK ont pour SHA-256 `b07b4e18eecdf9bc0db8f8603f69935ed6d2e52a14d09f6e673493e0e9feb33a`. La signature Android correspond à celle de la 0.5.0. Les 86 fichiers de l’interface correspondent aux sources et l’alignement ZIP est validé.

Les 34 tests passent. Les vérifications neige couvrent les 49 secteurs alpins, les altitudes et coordonnées des prévisions, les bulletins expirés, les préouvertures et le calcul des totaux quand le statut d’une piste manque.

Dans Chromium mobile, l’interface extraite de l’APK a affiché les prévisions au sommet de Bochard et les relevés du service en production. Une station alpine et un site nordique ont été ajoutés à l’accueil. Les essais ont couvert la persistance au rechargement, le retour depuis une tuile, le retrait hors connexion et le retrait du dernier favori. L’accueil a été contrôlé aux largeurs de 320, 393 et 600 pixels.

Le manifeste servi dans les paramètres propose la version 0.5.1. Les deux téléchargements complets, depuis l’application et depuis le dépôt public, correspondent à l’APK signé. Un intervalle de 1 024 octets renvoie HTTP 206 et un intervalle au-delà du fichier renvoie HTTP 416. Le service de distribution accepte uniquement les lectures.

# Météo74 0.5.0

25 novembre 2026. Le paquet Android `fr.meteo74.android` porte le numéro 10. Le fichier signé contient 4 635 158 octets. SHA-256 `bfe23083cdba173bbc592a08a7df8933bde4b0994d2ab299531f2d0861141064`. Le certificat correspond à celui de la version 0.4.1. Les 86 fichiers de l’interface embarquée correspondent aux sources. Le contrôle d’alignement ZIP passe.

Les 30 tests passent. Ils couvrent le catalogue alpin et nordique, la recherche par secteur et sans accents, la correspondance entre altitude et coordonnées, l’expiration d’un bulletin et la distinction entre une donnée absente et une mesure nulle. Android Lint rapporte zéro erreur et cinq avertissements.

Les essais dans Chromium mobile ont porté sur l’accès sans ville enregistrée, les favoris existants, l’ajout et le retrait du dernier lieu, les recherches, le retour depuis une fiche et les données en cache. Les deux points de prévision d’Argentière, les chiffres du bulletin de Passy et la date de l’ancien bulletin des Glières ont été contrôlés avec les services en ligne. La mise en page a été vérifiée sur des largeurs de 320, 393 et 600 pixels.

Le manifeste diffusé par la mise à jour intégrée annonce la version 0.5.0. Les téléchargements depuis le service Météo74 et le lien public GitHub ont renvoyé l’empreinte du fichier signé. Les réponses HTTP 206 pour une reprise et 416 pour un intervalle hors fichier ont été vérifiées.

# Météo74 0.4.1

25 novembre 2026. Le paquet Android signé `fr.meteo74.android` porte le numéro 9 et le même certificat que la version 0.4.0. L’APK mesure 4 620 669 octets. SHA-256 `4f694cea6ca7c3ecc34f5fa6a29a7b8480c9b07fa0c7703c2c7814de1363180d`. Les 82 fichiers de l’interface embarquée correspondent aux sources et l’alignement ZIP est validé.

Les 26 tests passent. Les tests de palette comparent la pluie et la neige aux neuf seuils suisses. Ils vérifient cinq intensités de 10 à 50 dBZ, le traitement des pixels transparents et le calcul des valeurs entre deux cellules. Android Lint signale zéro erreur et cinq avertissements.

Dans Chromium au format mobile, les trois zones ont chargé des observations réelles avec la même légende. La lecture de l’intensité au toucher a fonctionné sur les radars français et européen. Les essais couvrent les deux modes avec et sans distinction de la neige. En portrait sur un écran de 393 pixels, la France continentale occupe 96 % de la largeur de la carte. Le cadrage et le recentrage ont aussi été contrôlés en 320 × 680, 600 × 950 et 835 × 393. L’essai visuel a été réalisé sur navigateur mobile simulé.

Le service de mise à jour propose la version 0.4.1. Les téléchargements depuis le service utilisé par l’application et le lien public GitHub ont renvoyé exactement le même APK que le fichier signé. La reprise sur un intervalle de 1 024 octets a renvoyé HTTP 206, un intervalle hors fichier 416 et la voie temporaire de publication est fermée.

# Météo74 0.4.0

25 novembre 2026

Le paquet Android `fr.meteo74.android` porte le numéro 8. L’APK signé mesure 4 617 785 octets. SHA-256 `adfa8e1f08ba4d9f1d9fb3072df1571c99422f14f6e8377f4b94c47410e7c842`. Le certificat correspond à la version 0.3.4, l’alignement ZIP est correct et les 80 fichiers web embarqués correspondent aux sources.

Les 22 tests automatisés sont passés. Android Lint relève zéro erreur et cinq avertissements. Sur Chromium en format mobile, les essais couvrent l’accueil vide, les anciens favoris, l’ajout et la suppression, le défilement, les prévisions horaires et à dix jours, le refus de localisation et le suivi simulé entre Reignier-Ésery et Annecy avec mise en pause et reprise. À 320, 393 et 600 pixels de largeur, les tuiles de ville ont respectivement les mêmes dimensions que la carte de la version 0.3.4 (292 × 329, 353 × 338 et 544 × 401 pixels CSS).

Une vérification avec les données en ligne a chargé la météo d’Annecy, les catalogues des trois radars, animé des observations françaises et lu la réflectivité au toucher. Le contour et le masque s’affichent indépendamment des précipitations. La prise en main et la localisation sur un téléphone physique restent à confirmer.

Le manifeste de mise à jour de Météo74 a renvoyé la version 0.4.0. Les téléchargements complets depuis Supabase et GitHub correspondent à l’empreinte ci-dessus. Un téléchargement partiel a renvoyé HTTP 206 avec les octets demandés, un intervalle hors fichier a renvoyé 416. L’accès de publication temporaire est fermé.

# Météo74 0.3.4

25 novembre 2026

La version Android 7 (`versionName` 0.3.4) utilise le paquet `fr.meteo74.android`. Le certificat SHA-256 est identique à celui de la 0.3.3. L’APK signé mesure 4 607 165 octets. Son empreinte SHA-256 est `3176b9d22f5e9d944b015da0fb857a651fcd32192d6a2f9bb3ed2d18c3b41438`.

Les 20 tests des prévisions et du radar passent. Android Lint a terminé avec cinq avertissements et aucune erreur. Les 77 fichiers de l’interface présents dans l’APK correspondent aux sources. Le contrôle de signature Android et le contrôle d’alignement ZIP ont réussi.

Le service de mise à jour du projet `bepcgggpdtxwaifiyrah` renvoie le manifeste 0.3.4 et l’APK attendu. Le téléchargement complet correspond à l’empreinte ci-dessus. La reprise partielle a renvoyé HTTP 206 avec les octets demandés. Le service renvoie HTTP 416 pour un intervalle au-delà du fichier, 404 pour un autre nom et 405 pour une tentative d’écriture.

Le 25 novembre 2026, après le retrait du relais de migration, l’adresse embarquée dans la 0.3.3 a renvoyé HTTP 410 pour le manifeste et pour l’APK. Le service indépendant embarqué dans la 0.3.4 a renvoyé HTTP 200 pour les deux fichiers. L’empreinte de l’APK téléchargé correspond au manifeste. Les installations antérieures passent en 0.3.4 en ouvrant l’APK du dépôt Météo74.

## Vérifications de la version 0.3.3

25 novembre 2026

### Affichage mobile

Le logo est centré sur des écrans de 320, 360, 412 et 768 pixels CSS. Sa largeur mesurée est respectivement de 125, 140, 161 et 168 pixels. Les deux boutons disposent chacun de 44 pixels de largeur. Le fond du bandeau est transparent et son bord horizontal a été retiré.

Le contrôle de la collection ouvre les paramètres dans l’interface embarquée, affiche les 58 entrées et décode leurs images à 512 × 512 pixels. Les fichiers originaux comportent 49 dessins différents, signature comprise. Les dix prévisions journalières ont été vérifiées en format mobile, avec une description visible en ouvrant la journée. Les 58 PNG du fichier téléchargeable portent les noms d’origine et possèdent un canal alpha.

### Radar

La prochaine transition sur une paire d’observations contiguës peut démarrer sur le compositeur, à l’heure prévue, même si le fil principal reprend plus tard. Les estimations de mouvement sont calculées au moment de préparer les images. Une troisième surface accueille la prochaine observation. Un intervalle trop grand entre deux mesures garde sa coupure.

Les essais de l’interface dans Chromium mobile simulé ont utilisé des observations MétéoSuisse et des tuiles européennes. Ils ont couvert la lecture automatique, les réglages de vitesse, la pause, la recherche par heure, le zoom, l’inspection, la neige, le changement de source et le retour depuis les prévisions. Les animations de 14 transitions ont été enregistrées au moins 50 ms avant la bascule. En simulation à 4× avec un CPU ralenti, des délais réseau irréguliers et une observation indisponible, la première boucle s’est déroulée sans nouvel arrêt de chargement. Le ressenti sur un téléphone physique reste à confirmer.

### Paquet Android

Les 20 tests passent et Android Lint signale zéro erreur et cinq avertissements. L’identifiant est `fr.meteo74.android`, la version de paquet est 6 et le certificat de signature correspond à celui de la 0.3.2 téléchargée depuis le service de mise à jour. L’alignement ZIP a été contrôlé et les 77 fichiers web présents dans l’APK correspondent octet pour octet aux sources.

Taille : 4607165 octets.

SHA-256 : `93696add781c561a69b707c32fcf15ca152dde9551c26713dbf6c2dbec2c4a34`
