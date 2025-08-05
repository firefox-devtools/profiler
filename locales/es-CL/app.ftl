# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox para Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>App web para el análisis de rendimiento de { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Ir a nuestro repositorio Git (se abrirá en una nueva ventana)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = No se pudo importar el perfil.
AppViewRouter--error-unpublished = No se pudo recuperar el perfil de { -firefox-brand-name }.
AppViewRouter--error-from-file = No se pudo leer el archivo ni analizar el perfil que contiene.
AppViewRouter--error-local = Aún no se ha implementado.
AppViewRouter--error-public = No se pudo descargar el perfil.
AppViewRouter--error-from-url = No se pudo descargar el perfil.
AppViewRouter--error-compare = No se pudieron recuperar los perfiles.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = Debido a una <a>limitación específica en Safari</a>, { -profiler-brand-name } no puede importar perfiles de la máquina local en este navegador. Por favor, abre esta página en { -firefox-brand-name } o Chrome en su lugar.
    .title = Safari no puede importar perfiles locales
AppViewRouter--route-not-found--home =
    .specialMessage = La URL a la que intentaste acceder no fue reconocida.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Mostrar <strong>{ $fileName }</strong>
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
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Centrarse en la categoría <strong>{ $categoryName }</strong>
    .title =
        Enfocándose en los nodos que pertenecen a la misma categoría que el nodo seleccionado,
        por ende fusionando todos los nodos que pertenecen a otra categorñia,
CallNodeContextMenu--transform-collapse-function-subtree = Contraer función.
    .title = Contraer una función removerá todo lo que llamó, y asignará todo el tiempo a la función. Esto puede ayudar a simplificar un perfil que llama a código que no necesita ser analizado.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Contraer <strong>{ $nameForResource }</strong>
    .title = Contraer un recurso aplanará todas las llamadas a ese recurso a un solo nodo de llamada contraído.
CallNodeContextMenu--transform-collapse-recursion = Contraer recursividad
    .title = Contraer la recursividad elimina las llamadas que repetidamente recuren a una misma función, incluso con funciones intermedias en la pila.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Contraer solo recursividad directa
    .title = Contraer la recursividad directa elimina las llamadas que repetidamente recuren a una misma función, sin funciones intermedias en la pila.
CallNodeContextMenu--transform-drop-function = Descartar muestras con esta función
    .title = Descartar muestras elimina su tiempo del perfilador. Esto es útil para eliminar información de tiempos que no es relevante para el análisis.
CallNodeContextMenu--expand-all = Expandir todo
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Busca el nombre de la función en Searchfox
CallNodeContextMenu--copy-function-name = Copiar nombre de la función
CallNodeContextMenu--copy-script-url = Copiar URL del script
CallNodeContextMenu--copy-stack = Copiar pila
CallNodeContextMenu--show-the-function-in-devtools = Mostrar la función en DevTools

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

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Algunas llamadas a { $calledFunction } fueron incorporadas por el compilador.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (incorporada)
    .title = Las llamadas a { $calledFunction } fueron incorporadas a { $outerFunction } por el compilador.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selecciona un nodo para mostrar información sobre él.
CallTreeSidebar--call-node-details = Detalles del nodo de llamada

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
    .label = Tiempo de ejecución trazado
CallTreeSidebar--traced-self-time =
    .label = Tiempo propio trazado
CallTreeSidebar--running-time =
    .label = Tiempo en ejecución
CallTreeSidebar--self-time =
    .label = Tiempo propio
CallTreeSidebar--running-samples =
    .label = Bytes durante ejecución
CallTreeSidebar--self-samples =
    .label = Muestras propias
CallTreeSidebar--running-size =
    .label = Tamaño durante ejecución
CallTreeSidebar--self-size =
    .label = Tamaño propio
CallTreeSidebar--categories = Categorías
CallTreeSidebar--implementation = Implementación
CallTreeSidebar--running-milliseconds = Milisegundos en ejecución
CallTreeSidebar--running-sample-count = Conteo de muestras durante ejecución
CallTreeSidebar--running-bytes = Bytes durante ejecución
CallTreeSidebar--self-milliseconds = Milisegundos propios
CallTreeSidebar--self-sample-count = Conteo de muestras propio
CallTreeSidebar--self-bytes = Bytes propios

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

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = Por favor, reporta este problema a los desarrolladores, incluyendo el error completo tal como se muestra en la consola web de las herramientas de desarrollador.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Reportar el error en GitHub

## Footer Links

FooterLinks--legal = Legal
FooterLinks--Privacy = Privacidad
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Cambiar idioma
FooterLinks--hide-button =
    .title = Ocultar enlaces de pie de página
    .aria-label = Ocultar enlaces de pie de página

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> pistas

## Home page

Home--upload-from-file-input-button = Cargar un perfil desde un archivo
Home--upload-from-url-button = Cargar un perfil desde una URL
Home--load-from-url-submit-button =
    .value = Cargar
Home--documentation-button = Documentación
Home--menu-button = Activar botón de menú de { -profiler-brand-name }
Home--menu-button-instructions = Habilita el botón de menú del perfilador para comenzar a registrar un perfil de rendimiento en { -firefox-brand-name }, luego analízalo y compártelo con profiler.firefox.com.
Home--profile-firefox-android-instructions =
    También puede perfilar { -firefox-android-brand-name }. Para más
    información, consulta esta documentación:
    <a>Perfilando { -firefox-android-brand-name } directamente en el dispositivo</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Esta instancia del perfilador no pudo conectarse a WebChannel, por lo que no puede activar el botón de menú del perfilador.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Esta instancia del perfilador no pudo conectarse a WebChannel. Esto usualmente significa que está ejecutándose en un servidor diferente del especificado en la preferencia <code>devtools.performance.recording.ui-base-url</code>. Si quieres capturar nuevos perfiles con esta instancia, y otorgarle control programático del botón del menú del perfilador, puedes ir a <code>about:config</code> y cambiar la preferencia.
Home--record-instructions = Para empezar a perfilar, haz clic en el botón de perfilado o utiliza los atajos del teclado. El icono se torna azul cuando se está grabando un perfil. Pulsa <kbd>Capturar</kbd> para cargar los datos en profiler.firefox.com.
Home--instructions-content =
    Registrar perfiles de rendimiento requiere de <a>{ -firefox-brand-name }</a>.
    Sin embargo, los perfiles existentes pueden ser vistos en cualquier navegador moderno.
Home--record-instructions-start-stop = Detener e iniciar perfilado
Home--record-instructions-capture-load = Capturar y cargar perfil
Home--profiler-motto = Captura un perfil de rendimiento. Analízalo. Compártelo. Haz que la web sea más rápida.
Home--additional-content-title = Cargar perfiles existentes
Home--additional-content-content = Puedes <strong>arrastrar y soltar</strong> un archivo de perfil aquí para cargarlo, o:
Home--compare-recordings-info = También puedes comparar los registros. <a>Abre la interfaz de comparación.</a>
Home--your-recent-uploaded-recordings-title = Tus registros subidos recientemente
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } también puede importar perfiles de otros generadores de perfiles, tales como
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, el
    panel de rendimiento de Chrome, <androidstudio>Android Studio</androidstudio>, o
    cualquier archivo usando el <dhat>formato dhat</dhat> o el <traceevent>formato Trace Event de Google</traceevent>. <write>Aprende a escribir tu
    propio importador</write>.
Home--install-chrome-extension = Instalar la extensión de Chrome
Home--chrome-extension-instructions =
    Utiliza la <a>extensión de { -profiler-brand-name } para Chrome</a>
    para capturar perfiles de rendimiento en Chrome y analizarlos en
    { -profiler-brand-name }. Instala la extensión desde la Chrome Web Store.
Home--chrome-extension-recording-instructions = Una vez instalada, utiliza el icono de la barra de herramientas de la extensión o los accesos directos para iniciar y detener la creación de perfiles. También puedes exportar perfiles y cargarlos aquí para realizar un análisis detallado.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Ingresa los términos de filtro

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Mostrar solo tiempo propio
    .title = Mostrar solo el tiempo ocupado en un nodo de llamada, ignorando sus hijos.

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Revisa y gestiona todos tus registros ({ $profilesRestCount } más)
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

MarkerContextMenu--set-selection-from-duration = Establecer selección a partir de la duración del marcador
MarkerContextMenu--start-selection-here = Iniciar la selección aquí
MarkerContextMenu--end-selection-here = Finalizar la selección aquí
MarkerContextMenu--start-selection-at-marker-start = Iniciar la selección en el <strong>inicio</strong> del marcador
MarkerContextMenu--start-selection-at-marker-end = Iniciar la selección en el <strong>término</strong> del marcador
MarkerContextMenu--end-selection-at-marker-start = Terminar la selección en el <strong>inicio</strong> del marcador
MarkerContextMenu--end-selection-at-marker-end = Terminar la selección en el <strong>término</strong> del marcador
MarkerContextMenu--copy-description = Copiar descripción
MarkerContextMenu--copy-call-stack = Copiar pila de llamadas
MarkerContextMenu--copy-url = Copiar URL
MarkerContextMenu--copy-page-url = Copiar URL de la página
MarkerContextMenu--copy-as-json = Copiar como JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selecciona el hilo receptor "<strong>{ $threadName }</strong>"
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selecciona el hilo remitente "<strong>{ $threadName }</strong>"

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Sacar muestras que queden fuera de los marcadores que coincidan con: “<strong>{ $filter }</strong>”

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Marcadores de filtros:
    .title = Solo mostrar marcadores que coincidan con cierto nombre
MarkerSettings--marker-filters =
    .title = Filtros de marcador

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selecciona un marcador para mostrar información sobre él.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Inicio
MarkerTable--duration = Duración
MarkerTable--name = Nombre
MarkerTable--details = Detalles

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
MenuButtons--metaInfo--cpu-model = Modelo de CPU:
MenuButtons--metaInfo--cpu-cores = Núcleos de CPU:
MenuButtons--metaInfo--main-memory = Memoria principal:
MenuButtons--index--show-moreInfo-button = Mostrar más
MenuButtons--index--hide-moreInfo-button = Mostrar menos
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } núcleo físico,{ $logicalCPUs } núcleo lógico
               *[other] { $physicalCPUs } núcleo físico,{ $logicalCPUs } núcleos lógicos
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } núcleos físicos,{ $logicalCPUs } núcleo lógico
               *[other] { $physicalCPUs } núcleos físicos,{ $logicalCPUs } núcleos lógicos
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } núcleo físico
       *[other] { $physicalCPUs } núcleos físicos
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } núcleo lógico
       *[other] { $logicalCPUs } núcleos lógicos
    }
MenuButtons--metaInfo--profiling-started = Inicio del registro:
MenuButtons--metaInfo--profiling-session = Duración del registro:
MenuButtons--metaInfo--main-process-started = Proceso principal iniciado:
MenuButtons--metaInfo--main-process-ended = Proceso principal terminado:
MenuButtons--metaInfo--interval = Intervalo:
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
MenuButtons--metaInfo--application-uptime = Tiempo de actividad:
MenuButtons--metaInfo--update-channel = Canal de actualización:
MenuButtons--metaInfo--build-id = ID de compilación:
MenuButtons--metaInfo--build-type = Tipo de compilación:
MenuButtons--metaInfo--arguments = Argumentos:

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

MenuButtons--metaOverheadStatistics-subtitle = Adicionales de { -profiler-brand-short-name }
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
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Incluir los datos de otras pestañas
MenuButtons--publish--renderCheckbox-label-hidden-time = Incluir rango de tiempo oculto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Incluir capturas de pantalla
MenuButtons--publish--renderCheckbox-label-resource = Incluir URL y rutas de recursos
MenuButtons--publish--renderCheckbox-label-extension = Incluir información de extensión
MenuButtons--publish--renderCheckbox-label-preference = Incluir valores de preferencias
MenuButtons--publish--renderCheckbox-label-private-browsing = Incluir los datos de las ventanas de navegación privadas
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Este perfil contiene datos privados de navegación.
MenuButtons--publish--reupload-performance-profile = Volver a subir perfil de rendimiento
MenuButtons--publish--share-performance-profile = Compartir perfil de rendimiento
MenuButtons--publish--info-description = Sube tu perfil y hazlo accesible a cualquiera que tenga el enlace.
MenuButtons--publish--info-description-default = Por defecto, se eliminan tus datos personales.
MenuButtons--publish--info-description-firefox-nightly2 = Este perfil es de { -firefox-nightly-brand-name }, por lo que de forma predeterminada se incluye casi toda la información.
MenuButtons--publish--include-additional-data = Incluir datos adicionales que pueden ser identificables
MenuButtons--publish--button-upload = Subir
MenuButtons--publish--upload-title = Subiendo perfil…
MenuButtons--publish--cancel-upload = Cancelar subida
MenuButtons--publish--message-something-went-wrong = Chuta, algo salió mal al subir el perfil.
MenuButtons--publish--message-try-again = Volver a intentarlo
MenuButtons--publish--download = Descargar
MenuButtons--publish--compressing = Comprimiendo…
MenuButtons--publish--error-while-compressing = Error al comprimir, intenta desmarcar algunas casillas de verificación para reducir el tamaño del perfil.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrar redes:
    .title = Mostrar solamente solicitudes de red que coincidan con cierto nombre

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

PanelSearch--search-field-hint = ¿Sabías que puedes usar la coma (,) para buscar usando varios términos?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Editar el nombre del perfil
ProfileName--edit-profile-name-input =
    .title = Editar el nombre del perfil
    .aria-label = Nombre del perfil

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Borrar
    .title = Clic aquí para borrar el perfil { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Ocurrió un error al eliminar este perfil. <a>Pasa el cursor sobre el enlace para saber más.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Eliminar { $profileName }
ProfileDeletePanel--dialog-confirmation-question = ¿De verdad deseas eliminar los datos cargados para este perfil? Los enlaces que fueron compartidos previamente dejarán de funcionar.
ProfileDeletePanel--dialog-cancel-button =
    .value = Cancelar
ProfileDeletePanel--dialog-delete-button =
    .value = Eliminar
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Eliminando…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Los datos cargados fueron eliminaron con éxito.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Rango completo ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Importando y procesando el perfil…
ProfileLoaderAnimation--loading-unpublished = Importando el perfil directamente desde { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Leyendo el archivo y procesando el perfil…
ProfileLoaderAnimation--loading-local = Aún no se ha implementado.
ProfileLoaderAnimation--loading-public = Bajando y procesando el perfil…
ProfileLoaderAnimation--loading-from-url = Bajando y procesando el perfil…
ProfileLoaderAnimation--loading-compare = Leyendo y procesando perfiles…
ProfileLoaderAnimation--loading-view-not-found = Vista no encontrada

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Volver al inicio

## Root

Root--error-boundary-message =
    .message = Chuta, ocurrió un error desconocido en profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Aplicando…
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

StackSettings--implementation-all-frames = Todos los cuadros
    .title = No filtrar las pilas de cuadros
StackSettings--implementation-native2 = Nativo
    .title = Mostrar solo las pilas de cuadros para el código nativo
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Filtrar pilas:
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
StackSettings--use-stack-chart-same-widths = Utilizar el mismo ancho para cada pila
StackSettings--panel-search =
    .label = Filtrar pilas:
    .title = Solo muestra las pilas que contienen una función cuyo nombre coincida con esta subcadena

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Árbol de llamadas
TabBar--flame-graph-tab = Gráfico de flamas
TabBar--stack-chart-tab = Gráfico de barras apiladas
TabBar--marker-chart-tab = Gráfico de marcas
TabBar--marker-table-tab = Tabla de marcas
TabBar--network-tab = Red
TabBar--js-tracer-tab = Trazador JS

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Todas las pestañas y ventanas

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Mostrar solo este proceso
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
TrackContextMenu--show-local-tracks-in-process = Mostrar todas las pistas en este proceso
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Ocultar todas las pistas del tipo “{ $type }”
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Mostrar todas las pistas coincidentes
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Ocultar todas las pistas coincidentes
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = No se encontraron resultados para "<span>{ $searchFilter }</span>"
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Ocultar pista
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Ocultar proceso

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = memoria relativa en este momento
TrackMemoryGraph--memory-range-in-graph = rango de memoria en un gráfico
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = Asignaciones y desasignaciones desde la muestra anterior

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
TrackPower--tooltip-power-kilowatt = { $value } kW
    .label = Potencia
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Potencia
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Potencia
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Consumo promedio en la selección actual
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Consumo promedio en la selección actual
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Consumo promedio en la selección actual
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energía usada en el rango visible
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energía usada en el rango visible
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energía usada en el rango visible
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energía usada en el rango visible
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energía usada en la selección actual
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energía usada en la selección actual
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energía usada en la selección actual
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energía usada en la selección actual

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
TrackBandwidthGraph--speed = { $value } por segundo
    .label = Velocidad de transferencia para esta muestra
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = operaciones de lectura/escritura desde la muestra anterior
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Datos transferidos a la fecha
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Datos transferidos en el rango visible
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Datos transferidos en la selección actual

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Ingresa los términos de filtro
    .title = Mostrar solo las pistas que coinciden con cierto texto

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
TransformNavigator--focus-subtree = Nodo enfocado: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Enfocar: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Categoría enfocada: { $item }
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
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Contraer recursividad: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Contraer solo recursividad directa: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Colapsar subárbol: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Sacar muestras que queden fuera de los marcadores que coincidan con: “{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Esperando a { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Esperando por { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Código fuente no disponible
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Consulta el <a>problema #3741</a> para conocer los escenarios compatibles y las mejoras planificadas.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Código de ensamblaje no disponible
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Consulta el <a>problema #4520</a> para conocer los escenarios compatibles y las mejoras planificadas.
SourceView--close-button =
    .title = Cerrar la vista de fuente

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = No se conoce una URL accesible por origen cruzado para este archivo.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Hubo un error de red al obtener la URL { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = No se pudo consultar la API de simbolización del navegador: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = La API de simbolización del navegador devolvió un error: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = La API de simbolización del servidor de símbolos local devolvió un error: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = La API de simbolización del navegador devolvió una respuesta mal formulada: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = La API de simbolización del servidor local devolvió una respuesta mal formulada: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = El documento { $pathInArchive } no se encontró en el archivo de { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = El archivo de { $url } no pudo ser analizado: { $parsingErrorMessage }

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Mostrar la vista de ensamblaje
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Ocultar la vista de ensamblaje

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Registros subidos
