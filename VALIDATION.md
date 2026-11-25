# Météo74 0.3.4

25 novembre 2026

La version Android 7 (`versionName` 0.3.4) utilise le paquet `fr.meteo74.android`. Le certificat SHA-256 est identique à celui de la 0.3.3. L’APK signé mesure 4 607 165 octets. Son empreinte SHA-256 est `3176b9d22f5e9d944b015da0fb857a651fcd32192d6a2f9bb3ed2d18c3b41438`.

Les 20 tests des prévisions et du radar passent. Android Lint a terminé avec cinq avertissements et aucune erreur. Les 77 fichiers de l’interface présents dans l’APK correspondent aux sources. Le contrôle de signature Android et le contrôle d’alignement ZIP ont réussi.

Le service de mise à jour du projet `bepcgggpdtxwaifiyrah` renvoie le manifeste 0.3.4 et l’APK attendu. Le téléchargement complet correspond à l’empreinte ci-dessus. La reprise partielle a renvoyé HTTP 206 avec les octets demandés. Le service renvoie HTTP 416 pour un intervalle au-delà du fichier, 404 pour un autre nom et 405 pour une tentative d’écriture.

L’adresse embarquée dans la 0.3.3 propose également la 0.3.4. Le téléchargement complet, la reprise HTTP 206 et l’empreinte du binaire ont été vérifiés depuis cette ancienne adresse. La 0.3.4 utilise directement son propre projet pour toutes les recherches de mise à jour.

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
