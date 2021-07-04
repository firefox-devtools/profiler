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
    .title = Ir a nuestro repositorio Git (se abrirá en una nueva ventana)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = No se pudo recuperar el perfil de { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = No se pudo leer el archivo ni analizar el perfil que contiene.
AppViewRouter--error-message-local =
    .message = Aún no se ha implementado.
AppViewRouter--error-message-public =
    .message = No se pudo descargar el perfil.
AppViewRouter--error-message-from-url =
    .message = No se pudo descargar el perfil.
AppViewRouter--route-not-found--home =
    .specialMessage = La URL a la que intentaste acceder no fue reconocida.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--expand-all = Expandir todo
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Busca el nombre de la función en Searchfox
CallNodeContextMenu--copy-function-name = Copiar nombre de la función
CallNodeContextMenu--copy-script-url = Copiar URL del script
CallNodeContextMenu--copy-stack = Copiar pila

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Perfil 1:
CompareHome--form-label-profile2 = Perfil 2:
CompareHome--submit-button =
    .value = Recuperar perfiles

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Abrir la barra lateral
Details--close-sidebar-button =
    .title = Cerrar la barra lateral

## Footer Links

FooterLinks--legal = Legal
FooterLinks--Privacy = Privacidad
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Tipo de gráfico:
FullTimeline--categories-with-cpu = Categorías con CPU
FullTimeline--categories = Categorías
FullTimeline--stack-height = Altura de pila

## Home page

Home--upload-from-file-input-button = Cargar un perfil desde un archivo
Home--upload-from-url-button = Cargar un perfil desde una URL
Home--load-from-url-submit-button =
    .value = Cargar
Home--documentation-button = Documentación
Home--menu-button = Activar botón de menú de { -profiler-brand-name }
Home--addon-button = Instalar complemento
Home--instructions-title = Cómo ver y registrar perfiles
Home--record-instructions-start-stop = Detener e iniciar perfilado
Home--record-instructions-capture-load = Capturar y cargar perfil
Home--profiler-motto = Captura un perfil de rendimiento. Analízalo. Compártelo. Haz que la web sea más rápida.
Home--additional-content-title = Cargar perfiles existentes
Home--additional-content-content = Puedes <strong>arrastrar y soltar</strong> un archivo de perfil aquí para cargarlo, o:
Home--compare-recordings-info = También puedes comparar los registros. <a>Abre la interfaz de comparación.</a>
Home--recent-uploaded-recordings-title = Registros subidos recientemente

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


## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.


## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.


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

