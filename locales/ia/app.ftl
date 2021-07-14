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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>App web pro { -firefox-brand-name } analyse de prestation</subheader>
AppHeader--github-icon =
    .title = Va a nostre repositorio Git (isto se aperi in un nove fenestra)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Impossibile recuperar le profilo de { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Impossibile leger le file o tractar le profilo in illo.
AppViewRouter--error-message-local =
    .message = Non ancora implementate.
AppViewRouter--error-message-public =
    .message = Impossibile discargar le profilo.
AppViewRouter--error-message-from-url =
    .message = Impossibile discargar le profilo.
AppViewRouter--route-not-found--home =
    .specialMessage = Le URL que tu tentava attinger non ha essite recognoscite.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--expand-all = Expander toto

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Profilo 1:
CompareHome--form-label-profile2 = Profilo 2:

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Aperir le barra lateral
Details--close-sidebar-button =
    .title = Clauder le barra lateral

## Footer Links

FooterLinks--legal = Legal
FooterLinks--Privacy = Confidentialitate
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--categories-with-cpu = Categorias con CPU
FullTimeline--categories = Categorias

## Home page

Home--load-from-url-submit-button =
    .value = Cargar
Home--documentation-button = Documentation
Home--addon-button = Installar additivo

## IdleSearchField
## The component that is used for all the search inputs in the application.


## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.


## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--copy-description = Copiar le description
MarkerContextMenu--copy-call-stack = Copiar pila de appellos
MarkerContextMenu--copy-url = Copiar URL

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Initiar
MarkerTable--duration = Duration
MarkerTable--type = Typo
MarkerTable--description = Description

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informationes de profilo
MenuButtons--index--full-view = Vista complete
MenuButtons--index--cancel-upload = Cancellar le cargamento
MenuButtons--index--share-upload =
    .label = Cargar profilo local
MenuButtons--index--share-re-upload =
    .label = Recargar
MenuButtons--index--share-error-uploading =
    .label = Error al cargar
MenuButtons--index--docs = Documentos
MenuButtons--permalink--button =
    .label = Ligamine permanente

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Cargate:
MenuButtons--index--profile-info-uploaded-actions = Deler
MenuButtons--index--metaInfo-subtitle = Informationes de profilo
MenuButtons--metaInfo--symbols = Symbolos:
MenuButtons--metaInfo--cpu = CPU:
MenuButtons--metaInfo--interval = Intervallo:
MenuButtons--metaInfo--profile-version = Version de profilo:
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Sin limite
MenuButtons--metaInfo--application = Application

## Strings refer to specific types of builds, and should be kept in English.


##

MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensiones:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-mean = Media
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--button-upload = Cargar
MenuButtons--publish--download = Discargar

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation

ProfileLoaderAnimation--loading-message-local =
    .message = Non ancora implementate.

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Receder a casa

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installation…

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Native

## Tab Bar for the bottom half of the analysis UI.

TabBar--network-tab = Rete

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

