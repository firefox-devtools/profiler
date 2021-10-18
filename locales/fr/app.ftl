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

AppHeader--github-icon =
    .title = Accédez à notre dépôt Git (cela ouvrira une nouvelle fenêtre)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Impossible de récupérer le profil depuis { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Impossible de lire le fichier ou d’analyser le profil qu’il contient.
AppViewRouter--error-message-local =
    .message = Pas encore implémenté.
AppViewRouter--error-message-public =
    .message = Impossible de télécharger le profil.
AppViewRouter--error-message-from-url =
    .message = Impossible de télécharger le profil.
AppViewRouter--route-not-found--home =
    .specialMessage = L’URL que vous avez tenté d’atteindre n’a pas été trouvée

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-focus-function = Focus sur la fonction
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--expand-all = Tout développer
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Rechercher le nom de la fonction sur Searchfox
CallNodeContextMenu--copy-function-name = Copier le nom de la fonction
CallNodeContextMenu--copy-script-url = Copier l’URL du script
CallNodeContextMenu--copy-stack = Copier la pile

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Sélectionnez un nœud pour afficher des informations le concernant.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Saisissez les URL des profils que vous souhaitez comparer
CompareHome--form-label-profile1 = Profil 1 :
CompareHome--form-label-profile2 = Profil 2 :
CompareHome--submit-button =
    .value = Récupérer les profils

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


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
Home--instructions-title = Comment afficher et enregistrer des profils
Home--record-instructions-start-stop = Arrêter et démarrer le profilage
Home--record-instructions-capture-load = Capturer et charger un profil
Home--profiler-motto = Capturez un profil de performances. Analysez-le. Partagez-le. Rendez le Web plus rapide.
Home--additional-content-title = Charger des profils existants
Home--additional-content-content = Vous pouvez <strong>glisser-déposer</strong> un fichier de profil ici pour le charger, ou :
Home--compare-recordings-info = Vous pouvez également comparer des enregistrements. <a>Ouvrir l’interface de comparaison.</a>
Home--recent-uploaded-recordings-title = Enregistrements récemment envoyés

## IdleSearchField
## The component that is used for all the search inputs in the application.


## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Cliquez ici pour charger le profil { $smallProfileName }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--copy-description = Copier la description
MarkerContextMenu--copy-url = Copier l’URL

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


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

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.


## Strings refer to specific types of builds, and should be kept in English.


##


## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.


## Publish panel
## These strings are used in the publishing panel.


## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation


## ProfileRootMessage


## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.


## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.


## Tab Bar for the bottom half of the analysis UI.


## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.


## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms


## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

