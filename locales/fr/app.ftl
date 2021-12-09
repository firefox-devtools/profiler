# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


# Naming convention for l10n IDs: "ComponentName--string-summary".
# This allows us to minimize the risk of conflicting IDs throughout the app.
# Please sort alphabetically by (component name), and
# keep strings in order of appearance.


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Application web pour l’analyse des performances de { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Accéder à notre dépôt Git (cela ouvrira une nouvelle fenêtre)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-unpublished = Impossible de récupérer le profil depuis { -firefox-brand-name }.
AppViewRouter--error-from-file = Impossible de lire le fichier ou d’analyser le profil qu’il contient.
AppViewRouter--error-local = Pas encore implémenté.
AppViewRouter--error-public = Impossible de télécharger le profil.
AppViewRouter--error-from-url = Impossible de télécharger le profil.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = En raison d’une <a>limitation spécifique à Safari</a>, { -profiler-brand-name } ne peut pas importer de profils depuis la machine locale dans ce navigateur. Veuillez ouvrir cette page dans { -firefox-brand-name } ou Chrome à la place.
    .title = Safari ne peut pas importer de profils locaux
AppViewRouter--route-not-found--home =
    .specialMessage = L’URL que vous avez tenté d’atteindre n’a pas été trouvée

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Fusionner la fonction
    .title = La fusion d’une fonction la supprime du profil et attribue son temps d’exécution à la fonction qui l’a appelée. Cela se produit partout où la fonction a été appelée dans l’arborescence.
CallNodeContextMenu--transform-merge-call-node = Fusionner le nœud uniquement
    .title = La fusion d’un nœud le supprime du profil et attribue son temps d’exécution au nœud de la fonction qui l’a appelé. Il supprime uniquement la fonction de cette partie spécifique de l’arborescence. Tous les autres endroits à partir desquels la fonction a été appelée resteront dans le profil.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title = Mettre le focus sur une fonction supprimera tout échantillon qui ne l’inclut pas. De plus, il ré-enracine l’arbre d’appels afin que cette fonction soit l’unique racine de l’arbre. Il peut être nécessaire de combiner plusieurs sites d’appel de fonction d’un profil dans un nœud d’appel.
CallNodeContextMenu--transform-focus-function = Focus sur la fonction
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focus sur la fonction (inversé)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Focus sur le sous-arbre uniquement
    .title = Mettre le focus sur un sous-arbre supprime tout échantillon qui n’inclut pas cette partie spécifique de l’arbre d’appels. Il extrait une branche de l’arborescence des appels, mais il ne le fait que pour ce seul nœud d’appel. Tous les autres appels de la fonction sont ignorés.
CallNodeContextMenu--transform-collapse-function-subtree = Réduire la fonction
    .title = Réduire une fonction supprimera tout ce qu’elle appelait et attribuera tout le temps d’exécution à la fonction. Cela peut aider à simplifier un profil qui appelle du code qui n’a pas besoin d’être analysé.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Réduire <strong>{ $nameForResource }</strong>
    .title = Réduire une ressource aplatit tous les appels à cette ressource en un seul nœud d’appel réduit.
CallNodeContextMenu--transform-collapse-direct-recursion = Réduire la récursivité directe
    .title = La réduction de la récursivité directe supprime les appels qui reviennent à plusieurs reprises dans la même fonction.
CallNodeContextMenu--transform-drop-function = Supprimer les échantillons avec cette fonction
    .title = La suppression des échantillons enlève leur temps du profil. Ceci est utile pour éliminer des informations temporelles non pertinentes pour l’analyse.
CallNodeContextMenu--expand-all = Tout développer
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Rechercher le nom de la fonction sur Searchfox
CallNodeContextMenu--copy-function-name = Copier le nom de la fonction
CallNodeContextMenu--copy-script-url = Copier l’URL du script
CallNodeContextMenu--copy-stack = Copier la pile

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Temps d’exécution (ms)
    .title = Le temps d’exécution « total » comprend un résumé de tout le temps où cette fonction a été observée sur la pile. Cela inclut le temps pendant lequel la fonction était réellement en cours d’exécution et le temps passé dans le code appelant cette fonction.
CallTree--tracing-ms-self = Individuel (ms)
    .title = Le temps « individuel » n’inclut que le temps où la fonction était en haut de la pile. Si cette fonction a fait appel à d’autres fonctions, alors le temps des « autres » fonctions n’est pas inclus. Le temps « individuel » est utile pour comprendre où le temps a été réellement passé dans un programme.
CallTree--samples-total = Total (échantillons)
    .title = Le nombre d’échantillons « total » comprend un résumé de chaque échantillon où cette fonction a été observée sur la pile. Cela inclut le temps où la fonction était réellement en cours d’exécution et le temps passé dans le code appelant cette fonction.
CallTree--samples-self = Individuel
    .title = Le nombre d’échantillons « individuels » comprend uniquement les échantillons pour lesquels la fonction était en haut de la pile. Si cette fonction a fait appel à d’autres fonctions, alors le nombre d’« autres » fonctions n’est pas inclus. Le nombre « individuel » est utile pour comprendre où le temps a été réellement passé dans un programme.
CallTree--bytes-total = Taille totale (octets)
    .title = La « taille totale » comprend un résumé de tous les octets alloués ou désalloués lorsque cette fonction était observée sur la pile. Cela inclut à la fois les octets où la fonction s’exécutait réellement et les octets du code appelant cette fonction.
CallTree--bytes-self = Individuel (octets)
    .title = Les octets « individuels » comprennent les octets alloués ou désalloués lorsque cette fonction était en haut de la pile. Si cette fonction a fait appel à d’autres fonctions, alors les octets des « autres » fonctions ne sont pas inclus. Les octets « individuels » sont utiles pour comprendre où la mémoire a été réellement allouée ou désallouée dans le programme.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Certains appels à { $callFunction } ont été regroupés par le compilateur.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (regroupés)
    .title = Les appels à { $calledFunction } ont été regroupés dans { $outerFunction } par le compilateur.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Sélectionnez un nœud pour afficher des informations le concernant.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Saisissez les URL des profils que vous souhaitez comparer
CompareHome--instruction-content = L’outil extraira les données de la piste et de la plage sélectionnées pour chaque profil et les placera dans la même vue pour faciliter la comparaison.
CompareHome--form-label-profile1 = Profil 1 :
CompareHome--form-label-profile2 = Profil 2 :
CompareHome--submit-button =
    .value = Récupérer les profils

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Ce profil a été enregistré dans une version compilée sans les optimisations pour la version finale.
        Les observations de performance peuvent ne pas être comparables à celles de la version finale.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Ouvrir le panneau latéral
Details--close-sidebar-button =
    .title = Fermer le panneau latéral
Details--error-boundary-message =
    .message = Oups, une erreur inconnue s’est produite dans ce panneau.

## Footer Links

FooterLinks--legal = Mentions légales
FooterLinks--Privacy = Confidentialité
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Type de graphique :
FullTimeline--categories-with-cpu = Catégories avec CPU
FullTimeline--categories = Catégories
FullTimeline--stack-height = Hauteur de la pile
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> pistes visibles

## Home page

Home--upload-from-file-input-button = Charger un profil à partir d’un fichier
Home--upload-from-url-button = Charger un profil à partir d’une URL
Home--load-from-url-submit-button =
    .value = Charger
Home--documentation-button = Documentation
Home--menu-button = Activer le bouton de menu { -profiler-brand-name }
Home--menu-button-instructions = Activez le bouton de menu du profileur pour commencer à enregistrer un profil des performances dans { -firefox-brand-name }, puis analysez-le et partagez-le avec profiler.firefox.com.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Cette instance de profileur n’a pas pu se connecter à WebChannel, elle ne peut donc pas activer le bouton de menu du profileur.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Cette instance du profileur n’a pas pu se connecter à WebChannel. Généralement, cela signifie qu’il s’exécute sur un hôte différent de celui spécifié dans la préférence <code>devtools.performance.recording.ui-base-url</code>. Si vous souhaitez capturer de nouveaux profils avec cette instance, et lui donner par programmation le contrôle du bouton de menu du profileur, vous pouvez ouvrir <code>about:config</code> et modifier la préférence.
Home--record-instructions = Pour démarrer le profilage, cliquez sur le bouton de profilage ou utilisez le raccourci clavier. L’icône est bleue lorsqu’un profil est en cours d’enregistrement. Appuyez sur <kbd>Capturer</kbd> pour charger les données dans profiler.firefox.com.
Home--instructions-title = Comment afficher et enregistrer des profils
Home--instructions-content =
    L’enregistrement de profils de performances nécessite <a>{ -firefox-brand-name }</a>.
    Cependant, les profils existants peuvent être consultés dans n’importe quel navigateur moderne.
Home--record-instructions-start-stop = Arrêter et démarrer le profilage
Home--record-instructions-capture-load = Capturer et charger un profil
Home--profiler-motto = Capturez un profil de performances. Analysez-le. Partagez-le. Rendez le Web plus rapide.
Home--additional-content-title = Charger des profils existants
Home--additional-content-content = Vous pouvez <strong>glisser-déposer</strong> un fichier de profil ici pour le charger, ou :
Home--compare-recordings-info = Vous pouvez également comparer des enregistrements. <a>Ouvrir l’interface de comparaison.</a>
Home--recent-uploaded-recordings-title = Enregistrements récemment envoyés

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Saisissez le filtre

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Afficher uniquement le temps individuel
    .title = Affiche uniquement le temps passé dans un nœud d’appel, en ignorant ses enfants.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Cliquez ici pour charger le profil { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Supprimer
    .title = Ce profil ne peut pas être supprimé, car les informations d’autorisation sont manquantes.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Aucun profil n’a encore été envoyé.
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Voir et gérer tous vos enregistrements ({ $profilesRestCount } de plus)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gérer cet enregistrement
       *[other] Gérer ces enregistrements
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Définir la sélection à partir de la durée du marqueur
MarkerContextMenu--start-selection-here = Commencer la sélection ici
MarkerContextMenu--end-selection-here = Terminer la sélection ici
MarkerContextMenu--start-selection-at-marker-start = Commencer la sélection au <strong>début</strong> du marqueur
MarkerContextMenu--start-selection-at-marker-end = Commencer la sélection à la <strong>fin</strong> du marqueur
MarkerContextMenu--end-selection-at-marker-start = Terminer la sélection au <strong>début</strong> du marqueur
MarkerContextMenu--end-selection-at-marker-end = Terminer la sélection à la <strong>fin</strong> du marqueur
MarkerContextMenu--copy-description = Copier la description
MarkerContextMenu--copy-call-stack = Copier la pile d’appels
MarkerContextMenu--copy-url = Copier l’URL
MarkerContextMenu--copy-full-payload = Copier la charge utile complète

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtre de marqueur :
    .title = Afficher uniquement les marqueurs qui correspondent à un certain nom

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Sélectionnez un marqueur pour afficher des informations le concernant.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Début
MarkerTable--duration = Durée
MarkerTable--type = Type
MarkerTable--description = Description

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informations du profil
MenuButtons--index--full-view = Vue complète
MenuButtons--index--cancel-upload = Annuler l’envoi
MenuButtons--index--share-upload =
    .label = Envoyer le profil local
MenuButtons--index--share-re-upload =
    .label = Envoyer à nouveau
MenuButtons--index--share-error-uploading =
    .label = Erreur lors de l’envoi
MenuButtons--index--revert = Revenir au profil d’origine
MenuButtons--index--docs = Documentation
MenuButtons--permalink--button =
    .label = Lien permanent

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Envoyé :
MenuButtons--index--profile-info-uploaded-actions = Supprimer
MenuButtons--index--metaInfo-subtitle = Informations sur le profil
MenuButtons--metaInfo--symbols = Symboles :
MenuButtons--metaInfo--profile-symbolicated = Le profil est symbolisé
MenuButtons--metaInfo--profile-not-symbolicated = Le profil n’est pas symbolisé
MenuButtons--metaInfo--resymbolicate-profile = Re-symboliser le profil
MenuButtons--metaInfo--symbolicate-profile = Profil symbolique
MenuButtons--metaInfo--attempting-resymbolicate = Tenter de re-symboliser le profil
MenuButtons--metaInfo--currently-symbolicating = Re-symbolisation du profil en cours
MenuButtons--metaInfo--cpu = Processeur :
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } cœur physique
       *[other] { $physicalCPUs } cœurs physiques
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } cœur logique
       *[other] { $logicalCPUs } cœurs logiques
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } cœur physique
       *[other] { $physicalCPUs } cœurs physiques
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } cœur logique
       *[other] { $logicalCPUs } cœurs logiques
    }
MenuButtons--metaInfo--recording-started = Enregistrement commencé :
MenuButtons--metaInfo--interval = Intervalle :
MenuButtons--metaInfo--profile-version = Version du profil :
MenuButtons--metaInfo--buffer-capacity = Capacité de la mémoire tampon :
MenuButtons--metaInfo--buffer-duration = Durée de la mémoire tampon :
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } seconde
       *[other] { $configurationDuration } secondes
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Illimitée
MenuButtons--metaInfo--application = Applications
MenuButtons--metaInfo--name-and-version = Nom et version :
MenuButtons--metaInfo--update-channel = Canal de mise à jour :
MenuButtons--metaInfo--build-id = Identifiant de compilation :
MenuButtons--metaInfo--build-type = Type de compilation :

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Plateforme
MenuButtons--metaInfo--device = Appareil :
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Système d’exploitation :
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI :
MenuButtons--metaInfo--visual-metrics = Métriques visuelles
MenuButtons--metaInfo--speed-index = Indice de vitesse :
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Indice de vitesse perceptuel :
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Indice de vitesse du contenu complet :
MenuButtons--metaInfo-renderRowOfList-label-features = Fonctionnalités :
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtrer les threads :
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensions :

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Surcharge de { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Moyenne
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Surcharge
    .title = Temps utilisé pour échantillonner tous les threads.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Nettoyage
    .title = Temps de suppression des données expirées.
MenuButtons--metaOverheadStatistics-statkeys-counter = Compteurs
    .title = Temps nécessaire au rassemblement de tous les compteurs.
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervalle
    .title = Intervalle observé entre deux échantillons.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Verrouillages
    .title = Temps d’acquisition du verrou avant l’échantillonnage.
MenuButtons--metaOverheadStatistics-overhead-duration = Durées de la surcharge :
MenuButtons--metaOverheadStatistics-overhead-percentage = Taux de surcharge :
MenuButtons--metaOverheadStatistics-profiled-duration = Durée profilée :

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Inclure les threads cachés
MenuButtons--publish--renderCheckbox-label-hidden-time = Inclure la plage de temps masquée
MenuButtons--publish--renderCheckbox-label-include-screenshots = Inclure des captures d’écran
MenuButtons--publish--renderCheckbox-label-resource = Inclure les URL et les chemins des ressources
MenuButtons--publish--renderCheckbox-label-extension = Inclure les informations des extensions
MenuButtons--publish--renderCheckbox-label-preference = Inclure les valeurs des paramètres
MenuButtons--publish--reupload-performance-profile = Envoyer à nouveau le profil de performances
MenuButtons--publish--share-performance-profile = Partager le profil de performance
MenuButtons--publish--info-description = Envoyez votre profil et rendez-le accessible à toute personne disposant du lien.
MenuButtons--publish--info-description-default = Par défaut, vos données personnelles sont supprimées.
MenuButtons--publish--info-description-firefox-nightly = Ce profil provient de { -firefox-nightly-brand-name }, donc par défaut toutes les informations sont incluses.
MenuButtons--publish--include-additional-data = Inclure des données supplémentaires qui peuvent être identifiables
MenuButtons--publish--button-upload = Envoyer
MenuButtons--publish--upload-title = Envoi du profil…
MenuButtons--publish--cancel-upload = Annuler l’envoi
MenuButtons--publish--message-something-went-wrong = Oups, une erreur s’est produite lors de l’envoi du profil.
MenuButtons--publish--message-try-again = Réessayer
MenuButtons--publish--download = Télécharger
MenuButtons--publish--compressing = Compression…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrer les réseaux :
    .title = Afficher uniquement les requêtes réseau qui correspondent à un certain nom

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Saviez-vous que vous pouvez utiliser la virgule (,) pour effectuer une recherche à l’aide de plusieurs termes ?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Supprimer
    .title = Cliquer ici pour supprimer le profil { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Intervalle complet

## Profile Loader Animation

ProfileLoaderAnimation--loading-unpublished = Importation du profil directement depuis { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Lecture du fichier et traitement du profil…
ProfileLoaderAnimation--loading-local = Pas encore implémenté.
ProfileLoaderAnimation--loading-public = Téléchargement et traitement du profil…
ProfileLoaderAnimation--loading-from-url = Téléchargement et traitement du profil…
ProfileLoaderAnimation--loading-compare = Lecture et traitement des profils…
ProfileLoaderAnimation--loading-view-not-found = Vue introuvable

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Retourner à la page d’accueil

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installation en cours…
ServiceWorkerManager--pending-button = Appliquer et recharger
ServiceWorkerManager--installed-button = Recharger l’application
ServiceWorkerManager--updated-while-not-ready = Une nouvelle version de l’application a été appliquée avant que cette page ne soit complètement chargée. Vous pourriez constater des dysfonctionnements.
ServiceWorkerManager--new-version-is-ready = Une nouvelle version de l’application a été téléchargée et est prête à être utilisée.
ServiceWorkerManager--hide-notice-button =
    .title = Masquer l’avis de rechargement
    .aria-label = Masquer l’avis de rechargement

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Toutes les piles
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Native
StackSettings--use-data-source-label = Source des données :
StackSettings--invert-call-stack = Inverser la pile d’appels
    .title = Trier par le temps passé dans un nœud d’appel, en ignorant ses enfants.
StackSettings--show-user-timing = Afficher le temps utilisateur
StackSettings--panel-search =
    .label = Filtrer les piles :
    .title = Afficher uniquement les piles qui contiennent une fonction dont le nom correspond à cette sous-chaîne

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbre d’appels
TabBar--flame-graph-tab = Graphique en flammes
TabBar--stack-chart-tab = Graphique en piles
TabBar--marker-chart-tab = Graphique des marqueurs
TabBar--marker-table-tab = Tableau des marqueurs
TabBar--network-tab = Réseau
TabBar--js-tracer-tab = Traceur JS

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Afficher uniquement ce groupe de processus
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Afficher uniquement « { $trackName } »
TrackContextMenu--hide-other-screenshots-tracks = Masquer les autres pistes de captures d’écran
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Masquer « { $trackName } »
TrackContextMenu--show-all-tracks = Afficher toutes les pistes
# This is used in the tracks context menu as a button to show all the tracks
# below it.
TrackContextMenu--show-all-tracks-below = Afficher toutes les pistes ci-dessous
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Aucun résultat pour « <span>{ $searchFilter }</span> »

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Saisissez les termes du filtre
    .title = Afficher uniquement les pistes correspondant à certains termes

## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms

# Root item in the transform navigator.
# "Complete" is an adjective here, not a verb.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the current thread. E.g.: Web Content.
TransformNavigator--complete = « { $item } » complet
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Réduire : { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Focus sur le nœud : { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Focus : { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Fusion de nœuds : { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Fusion : { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Abandon : { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = Réduction de la récursivité : { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Réduction de la sous-arborescence : { $item }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Enregistrements envoyés
