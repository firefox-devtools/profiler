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

CallNodeContextMenu--transform-merge-function = Fusionar función
    .title = Fusionar una función la remueve del perfil, y asigna su tiempo a la función que la llamó. Esto sucede en todas partes donde la función fue llamada dentro del árbol.
CallNodeContextMenu--transform-merge-call-node = Fusionar solo el nodo
    .title = Fusionar un nodo lo remueve del perfil, y asigna su tiempo al nodo de la función que le llamó. Solo remueve la función de esa parte específica del árbol. Cualquier otro lugar donde la función haya sido llamada permanecerá en el perfil.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Enfocarse en una función eliminará cualquier muestra que no incluya aquella
    función. Además, reinicia el árbol de llamadas para que la función
    sea la única raíz del árbol. Esto puede combinar múltiples sitios de llamadas de funciones
    dentro de un perfil en un único nodo de llamada.
CallNodeContextMenu--transform-focus-function = Enfocarse en la función
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Enfocarse en la función (invertido)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Enfocarse solo en el subárbol
    .title = Enfocarse en el subárbol removerá cualquier muestra que no incluya esa parte específica del árbol de llamados. Retira una rama del árbol de llamados, no obstante solo lo hace para un único nodo de llamada. Todo el resto de las llamadas de la función son ignoradas.
CallNodeContextMenu--transform-collapse-function-subtree = Contraer función.
    .title = Contraer una función removerá todo lo que llamó, y asignará todo el tiempo a la función. Esto puede ayudar a simplificar un perfil que llama a código que no necesita ser analizado.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Contraer <strong>{ $nameForResource }</strong>
    .title = Contraer un recurso aplanará todas las llamadas a ese recurso a un solo nodo de llamada contraído.
CallNodeContextMenu--transform-collapse-direct-recursion = Contraer recursión directa
    .title = Contraer una recursión directa remueve las llamadas con recursión repetida pasándolas a una misma función.
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

CallTreeSidebar--select-a-node = Selecciona un nodo para mostrar información sobre él.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Introduce las URLs del perfil que te gustaría comparar
CompareHome--instruction-content = La herramienta extraerá los datos de la pista seleccionada y el rango para cada perfil, y los colocará ambos en la misma vista para hacerlos más fáciles de comparar.
CompareHome--form-label-profile1 = Perfil 1:
CompareHome--form-label-profile2 = Perfil 2:
CompareHome--submit-button =
    .value = Recuperar perfiles

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Este perfil se registró en una compilación sin optimización de lanzamiento.
        Es posible que las observaciones sobre el desempeño no se apliquen a la población de lanzamiento.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Abrir la barra lateral
Details--close-sidebar-button =
    .title = Cerrar la barra lateral
Details--error-boundary-message =
    .message = Chuta, ocurrió un error desconocido en este panel.

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

IdleSearchField--search-input =
    .placeholder = Ingrese términos de filtro

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Haz clic aquí para cargar el perfil { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Borrar
    .title = Este perfil no puede ser eliminado porque no tenemos la información de autorización.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = ¡Aún no se ha subido ningún perfil!
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gestionar este registro
       *[other] Gestionar estos registros
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Iniciar la selección aquí
MarkerContextMenu--end-selection-here = Finalizar la selección aquí
MarkerContextMenu--start-selection-at-marker-start = Iniciar la selección en el <strong>inicio</strong> del marcador
MarkerContextMenu--start-selection-at-marker-end = Iniciar la selección en el <strong>término</strong> del marcador
MarkerContextMenu--end-selection-at-marker-start = Terminar la selección en el <strong>inicio</strong> del marcador
MarkerContextMenu--end-selection-at-marker-end = Terminar la selección en el <strong>término</strong> del marcador
MarkerContextMenu--copy-description = Copiar descripción
MarkerContextMenu--copy-call-stack = Copiar pila de llamadas
MarkerContextMenu--copy-url = Copiar URL
MarkerContextMenu--copy-full-payload = Copiar payload completo

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Marcadores de filtros:
    .title = Solo mostrar marcadores que coincidan con cierto nombre

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selecciona un marcador para mostrar información sobre él.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Inicio
MarkerTable--duration = Duración
MarkerTable--type = Tipo
MarkerTable--description = Descripción

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Información del perfil
MenuButtons--index--full-view = Vista completa
MenuButtons--index--cancel-upload = Cancelar subida
MenuButtons--index--share-upload =
    .label = Subir perfil local
MenuButtons--index--share-re-upload =
    .label = Volver a subir
MenuButtons--index--share-error-uploading =
    .label = Error al subir
MenuButtons--index--revert = Revertir al perfil original
MenuButtons--index--docs = Docs
MenuButtons--permalink--button =
    .label = Enlace permanente

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Subido:
MenuButtons--index--profile-info-uploaded-actions = Borrar
MenuButtons--index--metaInfo-subtitle = Información del perfil
MenuButtons--metaInfo--symbols = Símbolos:
MenuButtons--metaInfo--profile-symbolicated = El perfil está simbolizado
MenuButtons--metaInfo--profile-not-symbolicated = El perfil no está simbolizado
MenuButtons--metaInfo--resymbolicate-profile = Volver a simbolizar el perfil
MenuButtons--metaInfo--symbolicate-profile = Simbolizar perfil
MenuButtons--metaInfo--attempting-resymbolicate = Intentando volver a simbolizar el perfil
MenuButtons--metaInfo--currently-symbolicating = Perfil actualmente simbolizado
MenuButtons--metaInfo--cpu = CPU:
MenuButtons--metaInfo--recording-started = Inicio del registro:
MenuButtons--metaInfo--interval = Intervalo:
MenuButtons--metaInfo--profile-version = Versión del perfil:
MenuButtons--metaInfo--buffer-capacity = Capacidad del búfer:
MenuButtons--metaInfo--buffer-duration = Duración del búfer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } segundo
       *[other] { $configurationDuration } segundos
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Ilimitado
MenuButtons--metaInfo--application = Aplicación
MenuButtons--metaInfo--name-and-version = Nombre y versión:
MenuButtons--metaInfo--update-channel = Canal de actualización:
MenuButtons--metaInfo--build-id = ID de compilación:
MenuButtons--metaInfo--build-type = Tipo de compilación:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Plataforma
MenuButtons--metaInfo--device = Dispositivo:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = SO:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Métricas visuales
MenuButtons--metaInfo--speed-index = Índice de velocidad:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Índice de velocidad de percepción:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Índice de velocidad de contenido:
MenuButtons--metaInfo-renderRowOfList-label-features = Funcionalidades
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtro de hilos:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensiones:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-mean = Mediana
MenuButtons--metaOverheadStatistics-max = Máximo
MenuButtons--metaOverheadStatistics-min = Mínimo

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--message-try-again = Volver a intentarlo
MenuButtons--publish--download = Descargar
MenuButtons--publish--compressing = Comprimiendo…

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Borrar
    .title = Clic aquí para borrar el perfil { $smallProfileName }

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

