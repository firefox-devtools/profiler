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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>App web para el anáisis de rendimiento de { -firefox-brand-name }</subheader>
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
CallNodeContextMenu--transform-drop-function = Descartar muestras con esta función
    .title = Descartar muestras elimina su tiempo del perfilador. Esto es útil para eliminar información de tiempos que no es relevante para el análisis.
CallNodeContextMenu--expand-all = Expandir todo
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Busca el nombre de la función en Searchfox
CallNodeContextMenu--copy-function-name = Copiar nombre de la función
CallNodeContextMenu--copy-script-url = Copiar URL del script
CallNodeContextMenu--copy-stack = Copiar pila

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Tiempo de ejecución (ms)
    .title = El tiempo de ejecución "total" incluye un resumen de todo el tiempo en que esta función fue observada en la pila. Esto incluye el tiempo en que la función estaba realmente ejecutándose, y el tiempo ocupado por la fuente de la llamada a esta función.
CallTree--tracing-ms-self = Propio (ms)
    .title = El tiempo "propio" solo incluye el tiempo en que la función estuvo como finalización de la pila. Si esta función llamó a otras funciones, entonces el tiempo de "otras" funciones no es incluido. El tiempo "propio" es útil para entender dónde se está ocupando en realidad el tiempo dentro de un programa.
CallTree--samples-total = Total (muestras)
    .title = El conteo de muestras "total" incluye un resumen de cada muestra en que esta función fue observada en la pila. Esto incluye el tiempo en que la función estaba realmente ejecutándose, y el tiempo ocupado por la fuente de la llamada a esta función.
CallTree--samples-self = Propio
    .title = El conteo de muestras "propio" solo incluye muestras donde la función estuvo como finalización de la pila. Si esta función llamó a otras funciones, entonces los contadores de "Otras" funciones no son incluidos. El contador "propio" es útil para entender dónde se está ocupando en realidad el tiempo dentro de un programa.
CallTree--bytes-total = Tamaño total (bytes)
    .title = El "tamaño total" incluye un resumen de los bytes asignados o desasignados mientras esta función fue observada en la pila. Esto incluye tanto los bytes en que la función estaba realmente ejecutándose, como los bytes de la fuente de la llamada a esta función.
CallTree--bytes-self = Propio (bytes)
    .title = Los bytes "propios" incluyen los bytes asignados o desasignados donde la función estuvo como finalización de la pila. Si esta función es llamada en otras funciones, entonces los bytes de las "otras" funciones no son incluidos. Los bytes "propios" son útiles para entender dónde fue realmente asignada o desasignada la memoria dentro del programa.

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
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> pistas visibles

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
MenuButtons--metaOverheadStatistics-statkeys-overhead = Adicionales
    .title = Tiempo para muestrear todos los hilos.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Limpieza
    .title = Tiempo para descartar datos expirados.
MenuButtons--metaOverheadStatistics-statkeys-counter = Conteo
    .title = Tiempo para reunir todos los contadores.
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervalo
    .title = Intervalo observado entre dos muestras.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Bloqueos
    .title = Tiempo para conseguir un bloqueo antes de muestrear.
MenuButtons--metaOverheadStatistics-overhead-duration = Duraciones adicionales:
MenuButtons--metaOverheadStatistics-overhead-percentage = Porcentaje adicional:
MenuButtons--metaOverheadStatistics-profiled-duration = Duración del perfilado:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Incluir hilos ocultos
MenuButtons--publish--renderCheckbox-label-hidden-time = Incluir rango de tiempo oculto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Incluir capturas de pantalla
MenuButtons--publish--renderCheckbox-label-resource = Incluir URL y rutas de recursos
MenuButtons--publish--renderCheckbox-label-extension = Incluir información de extensión
MenuButtons--publish--renderCheckbox-label-preference = Incluir valores de preferencias
MenuButtons--publish--reupload-performance-profile = Volver a subir perfil de rendimiento
MenuButtons--publish--share-performance-profile = Compartir perfil de rendimiento
MenuButtons--publish--info-description = Sube tu perfil y hazlo accesible a cualquiera que tenga el enlace.
MenuButtons--publish--info-description-default = Por defecto, se eliminan tus datos personales.
MenuButtons--publish--info-description-firefox-nightly = Este perfil es de { -firefox-nightly-brand-name }, por lo que de forma predeterminada se incluye toda la información.
MenuButtons--publish--include-additional-data = Incluir datos adicionales que pueden ser identificables
MenuButtons--publish--button-upload = Subir
MenuButtons--publish--upload-title = Subiendo perfil…
MenuButtons--publish--cancel-upload = Cancelar subida
MenuButtons--publish--message-something-went-wrong = Chuta, algo salió mal al subir el perfil.
MenuButtons--publish--message-try-again = Volver a intentarlo
MenuButtons--publish--download = Descargar
MenuButtons--publish--compressing = Comprimiendo…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrar redes:
    .title = Mostrar solamente solicitudes de red que coincidan con cierto nombre

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = ¿Sabías que puedes usar la coma (,) para buscar usando varios términos?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Borrar
    .title = Clic aquí para borrar el perfil { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Rango completo

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Importando el perfil directamente desde { -firefox-brand-name }…
ProfileLoaderAnimation--loading-message-from-file =
    .message = Leyendo el archivo y procesando el perfil…
ProfileLoaderAnimation--loading-message-local =
    .message = Aún no se ha implementado.
ProfileLoaderAnimation--loading-message-public =
    .message = Bajando y procesando el perfil…
ProfileLoaderAnimation--loading-message-from-url =
    .message = Bajando y procesando el perfil…
ProfileLoaderAnimation--loading-message-compare =
    .message = Leyendo y procesando perfiles…
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Vista no encontrada

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Volver al inicio

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Instalando…
ServiceWorkerManager--pending-button = Aplicar y recargar
ServiceWorkerManager--installed-button = Recargar la aplicación
ServiceWorkerManager--updated-while-not-ready = Una nueva versión de la aplicación se aplicó antes de que esta página terminara de cargar. Puede que se produzcan fallos.
ServiceWorkerManager--new-version-is-ready = Una nueva versión de la aplicación ha sido descargada y está lista para usarse.
ServiceWorkerManager--hide-notice-button =
    .title = Ocultar el aviso de volver a cargar
    .aria-label = Ocultar el aviso de volver a cargar

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Todas las pilas
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Nativo
StackSettings--use-data-source-label = Fuente de datos:
StackSettings--call-tree-strategy-timing = Tiempos
    .title = Resume usando pilas muestreadas de código ejecutado en el tiempo
StackSettings--call-tree-strategy-js-allocations = Asignaciones JavaScript
    .title = Resume usando bytes de JavaSCript asignado (no desasignaciones)
StackSettings--call-tree-strategy-native-retained-allocations = Memoria retenida
    .title = Resume usando bytes de memoria que fueron asignados, y nunca liberados en la selección de vista previa actual
StackSettings--call-tree-native-allocations = Memoria asignada
    .title = Resume usando bytes de memoria asignada
StackSettings--call-tree-strategy-native-deallocations-memory = Memoria desasignada
    .title = Resume usando bytes de memoria desasignada, por el sitio en que la memoria fue asignada.
StackSettings--call-tree-strategy-native-deallocations-sites = Sitios de desasignación
    .title = Resume usando bytes de memoria desasignada, por el sitio donde la memoria fue desasignada
StackSettings--invert-call-stack = Invertir llamada de pila
    .title = Ordenar por el tiempo ocupado en un nodo de llamada, ignorando sus hijos.
StackSettings--show-user-timing = Mostrar usando tiempos

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Árbol de llamadas
TabBar--network-tab = Red
TabBar--js-tracer-tab = Trazador JS

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Mostrar solo este grupo de procesos
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Mostrar solo “{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = Ocultar otras pistas de capturas de pantalla
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Ocultar “{ $trackName }”
TrackContextMenu--show-all-tracks = Mostrar todas las pistas

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
TransformNavigator--complete = Completar “{ $item }”
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Contraer: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Enfocar nodo: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Enfocar: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Fusionar nodo: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Fusionar: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Descartar: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = Contraer recursión: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Colapsar subárbol: { $item }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Registros subidos
