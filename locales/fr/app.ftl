# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox pour Android
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

AppViewRouter--error-from-post-message = Impossible d’importer le profil.
AppViewRouter--error-unpublished = Impossible de récupérer le profil depuis { -firefox-brand-name }.
AppViewRouter--error-from-file = Impossible de lire le fichier ou d’analyser le profil qu’il contient.
AppViewRouter--error-local = Pas encore implémenté.
AppViewRouter--error-public = Impossible de télécharger le profil.
AppViewRouter--error-from-url = Impossible de télécharger le profil.
AppViewRouter--error-compare = Impossible de récupérer les profils.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = En raison d’une <a>limitation spécifique à Safari</a>, { -profiler-brand-name } ne peut pas importer de profils depuis la machine locale dans ce navigateur. Veuillez ouvrir cette page dans { -firefox-brand-name } ou Chrome à la place.
    .title = Safari ne peut pas importer de profils locaux
AppViewRouter--route-not-found--home =
    .specialMessage = L’URL que vous avez tenté d’atteindre n’a pas été trouvée

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (intégrée)
    .title = La fonction { $function } a été intégrée dans le code de son appelant par le compilateur.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Afficher <strong>{ $fileName }</strong>
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
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Focus sur la catégorie <strong>{ $categoryName }</strong>
    .title = Mettre le focus sur les nœuds qui appartiennent à la même catégorie que le nœud sélectionné, fusionnant ainsi tous les nœuds appartenant à une autre catégorie.
CallNodeContextMenu--transform-collapse-function-subtree = Réduire la fonction
    .title = Réduire une fonction supprimera tout ce qu’elle appelait et attribuera tout le temps d’exécution à la fonction. Cela peut aider à simplifier un profil qui appelle du code qui n’a pas besoin d’être analysé.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Réduire <strong>{ $nameForResource }</strong>
    .title = Réduire une ressource aplatit tous les appels à cette ressource en un seul nœud d’appel réduit.
CallNodeContextMenu--transform-collapse-recursion = Réduire la récursivité
    .title = La réduction de la récursivité supprime les appels qui reviennent de manière répétée dans la même fonction, même si des fonctions intermédiaires se trouvent dans la pile.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Réduire la récursivité directe uniquement
    .title = La réduction de la récursivité directe permet de supprimer les appels qui recourent de manière répétée à la même fonction sans qu’il y ait de fonctions intermédiaires dans la pile.
CallNodeContextMenu--transform-drop-function = Ignorer les échantillons avec cette fonction
    .title = Ignorer des échantillons enlève leur temps du profil. Ceci est utile pour éliminer des informations temporelles non pertinentes pour l’analyse.
CallNodeContextMenu--expand-all = Tout développer
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Rechercher le nom de la fonction sur Searchfox
CallNodeContextMenu--copy-function-name = Copier le nom de la fonction
CallNodeContextMenu--copy-script-url = Copier l’URL du script
CallNodeContextMenu--copy-stack = Copier la pile
CallNodeContextMenu--show-the-function-in-devtools = Afficher la fonction dans les outils de développement

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Temps d’exécution (ms)
    .title = Le temps d’exécution « total » comprend un résumé de tout le temps où cette fonction a été observée sur la pile. Cela inclut le temps pendant lequel la fonction était réellement en cours d’exécution et le temps passé dans le code appelant cette fonction.
CallTree--tracing-ms-self = Individuel (ms)
    .title = Le temps « individuel » n’inclut que le temps où la fonction était en haut de la pile. Si cette fonction a fait appel à d’autres fonctions, alors le temps des « autres » fonctions n’est pas inclus. Le temps « individuel » est utile pour comprendre où le temps a été réellement passé dans un programme.
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
    .title = Certains appels à { $calledFunction } ont été regroupés par le compilateur.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (regroupés)
    .title = Les appels à { $calledFunction } ont été regroupés dans { $outerFunction } par le compilateur.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Sélectionnez un nœud pour afficher des informations le concernant.
CallTreeSidebar--call-node-details = Détails du nœud d’appel

## CallTreeSidebar timing information
##
## Firefox Profiler stops the execution of the program every 1ms to record the
## stack. Only thing we know for sure is the stack at that point of time when
## the stack is taken. We try to estimate the time spent in each function and
## translate it to a duration. That's why we use the "traced" word here.
## There is actually no difference between "Traced running time" and "Running
## time" in the context of the profiler. We use "Traced" to emphasize that this
## is an estimation where we have more space in the UI.
##
## "Self time" is the time spent in the function itself, excluding the time spent
## in the functions it called. "Running time" is the time spent in the function
## itself, including the time spent in the functions it called.

CallTreeSidebar--traced-running-time =
    .label = Temps d’exécution tracé
CallTreeSidebar--traced-self-time =
    .label = Temps individuel tracé
CallTreeSidebar--running-time =
    .label = Temps d’exécution
CallTreeSidebar--self-time =
    .label = Temps individuel
CallTreeSidebar--running-samples =
    .label = Échantillons totaux
CallTreeSidebar--self-samples =
    .label = Échantillons individuels
CallTreeSidebar--running-size =
    .label = Taille totale
CallTreeSidebar--self-size =
    .label = Taille individuelle
CallTreeSidebar--categories = Catégories
CallTreeSidebar--implementation = Implémentation
CallTreeSidebar--running-milliseconds = Millisecondes totales
CallTreeSidebar--running-sample-count = Nombre d’échantillons total
CallTreeSidebar--running-bytes = Octets totaux
CallTreeSidebar--self-milliseconds = Millisecondes individuelles
CallTreeSidebar--self-sample-count = Nombre d’échantillons individuels
CallTreeSidebar--self-bytes = Octets individuels

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

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = Merci de signaler ce problème aux développeurs, en incluant la totalité de l’erreur affichée dans la console web des outils de développement.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Signaler l’erreur sur GitHub

## Footer Links

FooterLinks--legal = Mentions légales
FooterLinks--Privacy = Confidentialité
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Changer de langue
FooterLinks--hide-button =
    .title = Masquer les liens de pied de page
    .aria-label = Masquer les liens de pied de page

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> pistes

## Home page

Home--upload-from-file-input-button = Charger un profil à partir d’un fichier
Home--upload-from-url-button = Charger un profil à partir d’une URL
Home--load-from-url-submit-button =
    .value = Charger
Home--documentation-button = Documentation
Home--menu-button = Activer le bouton de menu { -profiler-brand-name }
Home--menu-button-instructions = Activez le bouton de menu du profileur pour commencer à enregistrer un profil des performances dans { -firefox-brand-name }, puis analysez-le et partagez-le avec profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Vous pouvez également profiler { -firefox-android-brand-name }.
    Pour plus d’informations, veuillez consulter cette documentation :
    <a>Profilage de { -firefox-android-brand-name } directement sur l’appareil</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Cette instance de profileur n’a pas pu se connecter à WebChannel, elle ne peut donc pas activer le bouton de menu du profileur.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Cette instance du profileur n’a pas pu se connecter à WebChannel. Généralement, cela signifie qu’il s’exécute sur un hôte différent de celui spécifié dans la préférence <code>devtools.performance.recording.ui-base-url</code>. Si vous souhaitez capturer de nouveaux profils avec cette instance, et lui donner par programmation le contrôle du bouton de menu du profileur, vous pouvez ouvrir <code>about:config</code> et modifier la préférence.
Home--record-instructions = Pour démarrer le profilage, cliquez sur le bouton de profilage ou utilisez le raccourci clavier. L’icône est bleue lorsqu’un profil est en cours d’enregistrement. Appuyez sur <kbd>Capturer</kbd> pour charger les données dans profiler.firefox.com.
Home--instructions-content =
    L’enregistrement de profils de performances nécessite <a>{ -firefox-brand-name }</a>.
    Cependant, les profils existants peuvent être consultés dans n’importe quel navigateur moderne.
Home--record-instructions-start-stop = Arrêter et démarrer le profilage
Home--record-instructions-capture-load = Capturer et charger un profil
Home--profiler-motto = Capturez un profil de performances. Analysez-le. Partagez-le. Rendez le Web plus rapide.
Home--additional-content-title = Charger des profils existants
Home--additional-content-content = Vous pouvez <strong>glisser-déposer</strong> un fichier de profil ici pour le charger, ou :
Home--compare-recordings-info = Vous pouvez également comparer des enregistrements. <a>Ouvrir l’interface de comparaison.</a>
Home--your-recent-uploaded-recordings-title = Vos enregistrements récemment envoyés
Home--dark-mode-title = Mode sombre
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    Le { -profiler-brand-name } peut également importer des profils d’autres profileurs, dont
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, le
    Panneau de performances Chrome, <androidstudio>Android Studio</androidstudio>, ou
    tout fichier utilisant les formats <dhat>dhat</dhat> ou <traceevent>Trace Event de Google</traceevent>. <write>Apprenez à écrire votre
    propre importateur</write>.
Home--install-chrome-extension = Installer l’extension Chrome
Home--chrome-extension-instructions =
    Utilisez l’extension <a>{ -profiler-brand-name } pour Chrome</a>
    pour capturer des profils de performance dans Chrome et les analyser dans le
    { -profiler-brand-name }. Installez l’extension depuis le Chrome Web Store.
Home--chrome-extension-recording-instructions = Une fois l’extension installée, utilisez l’icône de la barre d’outils ou les raccourcis pour démarrer et arrêter le profilage. Vous pouvez également exporter des profils et les charger ici pour une analyse détaillée.

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
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
MarkerContextMenu--copy-page-url = Copier l’URL de la page
MarkerContextMenu--copy-as-json = Copier au format JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Sélectionner le thread destinataire « <strong>{ $threadName }</strong> »
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Sélectionner le thread expéditeur « <strong>{ $threadName }</strong> »

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Abandonner les échantillons en dehors des marqueurs correspondant à « <strong>{ $filter }</strong> »

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Copier le tableau des marqueurs en texte brut
MarkerCopyTableContextMenu--copy-table-as-markdown = Copier le tableau des marqueurs en Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtre de marqueur :
    .title = Afficher uniquement les marqueurs qui correspondent à un certain nom
MarkerSettings--marker-filters =
    .title = Filtres de marqueurs
MarkerSettings--copy-table =
    .title = Copier le tableau sous forme de texte
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Le nombre de lignes dépasse la limite : { $rows } > { $maxRows }. Seules les { $maxRows } premières lignes seront copiées.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Sélectionnez un marqueur pour afficher des informations le concernant.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Début
MarkerTable--duration = Durée
MarkerTable--name = Nom
MarkerTable--details = Détails

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Afficher uniquement les marqueurs correspondant à « { $filter } »
    .aria-label = Afficher uniquement les marqueurs correspondant à « { $filter } »

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
MenuButtons--metaInfo--cpu-model = Modèle de processeur :
MenuButtons--metaInfo--cpu-cores = Cœurs de processeur :
MenuButtons--metaInfo--main-memory = Mémoire principale :
MenuButtons--index--show-moreInfo-button = Afficher plus
MenuButtons--index--hide-moreInfo-button = Afficher moins
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } cœur physique, { $logicalCPUs } cœur logique
               *[other] { $physicalCPUs } cœur physique, { $logicalCPUs } cœurs logiques
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } cœurs physiques, { $logicalCPUs } cœur logique
               *[other] { $physicalCPUs } cœurs physiques, { $logicalCPUs } cœurs logiques
            }
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
MenuButtons--metaInfo--profiling-started = Enregistrement commencé :
MenuButtons--metaInfo--profiling-session = Durée d’enregistrement :
MenuButtons--metaInfo--main-process-started = Processus principal démarré :
MenuButtons--metaInfo--main-process-ended = Processus principal terminé :
MenuButtons--metaInfo--file-name = Nom du fichier :
MenuButtons--metaInfo--file-size = Taille du fichier :
MenuButtons--metaInfo--interval = Intervalle :
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
MenuButtons--metaInfo--application = Application
MenuButtons--metaInfo--name-and-version = Nom et version :
MenuButtons--metaInfo--application-uptime = Disponibilité :
MenuButtons--metaInfo--update-channel = Canal de mise à jour :
MenuButtons--metaInfo--build-id = Identifiant de compilation :
MenuButtons--metaInfo--build-type = Type de compilation :
MenuButtons--metaInfo--arguments = Arguments :

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
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Inclure les données des autres onglets
MenuButtons--publish--renderCheckbox-label-hidden-time = Inclure la plage de temps masquée
MenuButtons--publish--renderCheckbox-label-include-screenshots = Inclure des captures d’écran
MenuButtons--publish--renderCheckbox-label-resource = Inclure les URL et les chemins des ressources
MenuButtons--publish--renderCheckbox-label-extension = Inclure les informations des extensions
MenuButtons--publish--renderCheckbox-label-preference = Inclure les valeurs des paramètres
MenuButtons--publish--renderCheckbox-label-private-browsing = Inclure les données des fenêtres de navigation privée
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Ce profil contient des données de navigation privée
MenuButtons--publish--reupload-performance-profile = Envoyer à nouveau le profil de performances
MenuButtons--publish--share-performance-profile = Partager le profil de performance
MenuButtons--publish--info-description = Envoyez votre profil et rendez-le accessible à toute personne disposant du lien.
MenuButtons--publish--info-description-default = Par défaut, vos données personnelles sont supprimées.
MenuButtons--publish--info-description-firefox-nightly2 = Ce profil provient de { -firefox-nightly-brand-name }, donc par défaut la plupart des informations sont incluses.
MenuButtons--publish--include-additional-data = Inclure des données supplémentaires qui peuvent être identifiables
MenuButtons--publish--button-upload = Envoyer
MenuButtons--publish--upload-title = Envoi du profil…
MenuButtons--publish--cancel-upload = Annuler l’envoi
MenuButtons--publish--message-something-went-wrong = Oups, une erreur s’est produite lors de l’envoi du profil.
MenuButtons--publish--message-try-again = Réessayer
MenuButtons--publish--download = Télécharger
MenuButtons--publish--compressing = Compression…
MenuButtons--publish--error-while-compressing = Erreur lors de la compression, essayez de décocher certaines cases pour réduire la taille du profil.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrer les réseaux :
    .title = Afficher uniquement les requêtes réseau qui correspondent à un certain nom

## Timestamp formatting primitive

# This displays a date in a shorter rendering, depending on the proximity of the
# date from the current date. You can look in src/utils/l10n-ftl-functions.js
# for more information.
# This is especially used in the list of published profiles panel.
# There shouldn't need to change this in translations, but having it makes the
# date pass through Fluent to be properly localized.
# The function SHORTDATE is specific to the profiler. It changes the rendering
# depending on the proximity of the date from the current date.
# Variables:
#   $date (Date) - The date to display in a shorter way
NumberFormat--short-date = { SHORTDATE($date) }

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Saviez-vous que vous pouvez utiliser la virgule (,) pour effectuer une recherche à l’aide de plusieurs termes ?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Modifier le nom du profil
ProfileName--edit-profile-name-input =
    .title = Modifier le nom du profil
    .aria-label = Nom du profil

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Supprimer
    .title = Cliquer ici pour supprimer le profil { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Une erreur s’est produite lors de la suppression de ce profil. <a>Passez la souris sur ce lien pour en savoir plus.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Supprimer { $profileName }
ProfileDeletePanel--dialog-confirmation-question = Voulez-vous vraiment supprimer les données envoyées pour ce profil ? Les liens précédemment partagés ne fonctionneront plus.
ProfileDeletePanel--dialog-cancel-button =
    .value = Annuler
ProfileDeletePanel--dialog-delete-button =
    .value = Supprimer
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Suppression…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Les données envoyées ont été supprimées.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Plage entière ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Importation et traitement du profil…
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

## Root

Root--error-boundary-message =
    .message = Oups, une erreur inconnue s’est produite sur profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Application en cours…
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

StackSettings--implementation-all-frames = Toutes les trames
    .title = Ne pas filtrer les trames de pile
StackSettings--implementation-script = Script
    .title = Afficher uniquement les cadres de pile liés à l’exécution du script
StackSettings--implementation-native2 = Natif
    .title = Afficher uniquement les trames de pile pour le code natif
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Filtrer les piles :
StackSettings--use-data-source-label = Source des données :
StackSettings--call-tree-strategy-timing = Délais
    .title = Résumer à l’aide de piles d’échantillons du code exécuté au fil du temps
StackSettings--call-tree-strategy-js-allocations = Allocations JavaScript
    .title = Résumer à l’aide des octets alloués à JavaScript (pas de désallocations)
StackSettings--call-tree-strategy-native-retained-allocations = Mémoire conservée
    .title = Résumer à l’aide d’octets de mémoire alloués et jamais libérés dans la sélection d’aperçu actuelle
StackSettings--call-tree-native-allocations = Mémoire allouée
    .title = Résumer par les octets de mémoire alloués
StackSettings--call-tree-strategy-native-deallocations-memory = Mémoire désallouée
    .title = Résumer en utilisant les octets de la mémoire désallouée par le site où la mémoire a été allouée
StackSettings--call-tree-strategy-native-deallocations-sites = Sites de désallocation
    .title = Résumer en utilisant les octets de la mémoire désallouée, par le site où la mémoire a été désallouée
StackSettings--invert-call-stack = Inverser la pile d’appels
    .title = Trier par le temps passé dans un nœud d’appel, en ignorant ses enfants.
StackSettings--show-user-timing = Afficher le temps utilisateur
StackSettings--use-stack-chart-same-widths = Utiliser la même largeur pour chaque pile
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

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Tous les onglets et fenêtres

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Afficher uniquement ce processus
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
TrackContextMenu--show-local-tracks-in-process = Afficher toutes les pistes de ce processus
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Masquer les pistes de type « { $type } »
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Afficher toutes les pistes correspondantes
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Masquer toutes les pistes correspondantes
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Aucun résultat pour « <span>{ $searchFilter }</span> »
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Masquer la piste
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Masquer le processus

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = mémoire relative à ce moment
TrackMemoryGraph--memory-range-in-graph = plage mémoire dans le graphique
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = allocations et désallocations depuis l’échantillon précédent

## TrackPower
## This is used to show the power used by the CPU and other chips in a computer,
## graphed over time.
## It's not always displayed in the UI, but an example can be found at
## https://share.firefox.dev/3a1fiT7.
## For the strings in this group, the carbon dioxide equivalent is computed from
## the used energy, using the carbon dioxide equivalent for electricity
## consumption. The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.

# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-kilowatt = { $value } kW
    .label = Puissance
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Puissance
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Puissance
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Puissance moyenne pour la sélection actuelle
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Puissance moyenne pour la sélection actuelle
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Puissance moyenne pour la sélection actuelle
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg eqCO₂)
    .label = Énergie consommée dans l’intervalle visible
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g eqCO₂)
    .label = Énergie consommée dans l’intervalle visible
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg eqCO₂)
    .label = Énergie consommée dans l’intervalle visible
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg eqCO₂)
    .label = Énergie consommée dans l’intervalle visible
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg eqCO₂)
    .label = Énergie consommée dans la sélection courante
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g eqCO₂)
    .label = Énergie consommée dans la sélection courante
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg eqCO₂)
    .label = Énergie consommée dans la sélection courante
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg eqCO₂)
    .label = Énergie consommée dans la sélection courante

## TrackBandwidth
## This is used to show how much data was transfered over time.
## For the strings in this group, the carbon dioxide equivalent is estimated
## from the amount of data transfered.
## The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.

# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the value for the data transfer speed.
#                     Will contain the unit (eg. B, KB, MB)
TrackBandwidthGraph--speed = { $value } par seconde
    .label = Vitesse de transfert pour cet échantillon
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = opérations de lecture/écriture depuis le précédent échantillon
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g eqCO₂)
    .label = Données transférées jusqu’à présent
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g eqCO₂)
    .label = Données transférées dans l’intervalle visible
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g eqCO₂)
    .label = Données transférées dans la sélection courante

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
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Focus sur la catégorie : { $item }
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
TransformNavigator--drop-function = Ignorer : { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Réduction de la récursivité : { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Réduction de la récursivité directe uniquement : { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Réduction de la sous-arborescence : { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Abandonner les échantillons en dehors des marqueurs correspondant à : « { $item } »

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = En attente de { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = En attente de { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Code source non disponible
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Consultez le <a>ticket n°3741</a> pour les scénarios pris en charge et les améliorations prévues.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Code assembleur non disponible
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Consultez le <a>ticket n°4520</a> pour les scénarios pris en charge et les améliorations prévues.
SourceView--close-button =
    .title = Fermer la vue du code source

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Aucune URL multiorigine accessible n’est connue pour ce fichier.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Une erreur réseau s’est produite lors de la récupération de l’URL { $url } : { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Impossible d’interroger l’API de symbolisation du navigateur : { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = L’API de symbolisation du navigateur a renvoyé une erreur : { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = L’API de symbolisation du serveur de symboles local a renvoyé une erreur : { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = L’API de symbolisation du navigateur a renvoyé une réponse malformée : { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = L’API de symbolisation du serveur de symboles local a renvoyé une réponse malformée : { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Le fichier { $pathInArchive } est introuvable dans l’archive provenant de { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = L’archive à l’adresse { $url } n’a pas pu être analysée : { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = Le navigateur n’a pas pu obtenir le fichier source pour { $url } avec l’identifiant sourceUuid { $sourceUuid } : { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Afficher la vue assembleur
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Masquer la vue assembleur
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Précédent
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Suivant
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = { $current } sur { $total }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Enregistrements envoyés
