# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox pro Android
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

AppViewRouter--error-from-post-message = Impossibile importar le profilo.
AppViewRouter--error-unpublished = Impossibile recuperar le profilo de { -firefox-brand-name }.
AppViewRouter--error-from-file = Impossibile leger le file o tractar le profilo in illo.
AppViewRouter--error-local = Non ancora implementate.
AppViewRouter--error-public = Impossibile discargar le profilo.
AppViewRouter--error-from-url = Impossibile discargar le profilo.
AppViewRouter--error-compare = Impossibile recuperar le profilos.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    A causa de un <a>specific limitation in Safari</a>, { -profiler-brand-name } non pote
    importar profilos ab le local apparato in iste browser. Per favor aperi 
    in vice iste pagina in { -firefox-brand-name } o Chrome.
    .title = Safari non pote importar  profilos local
AppViewRouter--route-not-found--home =
    .specialMessage = Le URL que tu tentava attinger non ha essite recognoscite.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Mostrar <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Miscer function
    .title =
        Miscer un function remove lo del profilo, e assigna su tempore al
        function que lo ha appellate. Isto eveni ubique le function ha essite appellate
        in le arbore.
CallNodeContextMenu--transform-merge-call-node = Miscer solo un nodo
    .title =
        Miscer un nodo remove lo ex le profilo, e assigna su tempore al
        nodo del function que lo ha appellate. Illo solo remove le function ex ille
        specific parte del arbore. Si le function ha essite appellate ex alterubi
        illo remanera in le profilo.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Concentrar se sur un function removera ulle specimen que non include ille
    function. In ultra, illo re-radica le arbore del appello assi que le function
    es le sol radice del arbore. Isto pote combina plure sitos de appello de function
    inter un profilo, in un nodo de appello.
CallNodeContextMenu--transform-focus-function = Foco sur function.
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Foco sur function (invertite).
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Foco solo sur sub-arbore.
    .title =
        Concentrar se sur un sub-arbore removera ulle specimen que non include ille
        specific parte del arbore de appello. Illo extrahe un ramo del arbore de appello,
         totevia solo lo face pro iste singule nodo de appello. Tote le altere appellos
        del function es ignorate.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Examinar categoria <strong>{ $categoryName }</strong>
    .title =
        Concentrar se sur le nodos que pertine al mesme categoria que le nodo seligite,
        assi miscer tote le nodos que pertine a un altere categoria.
CallNodeContextMenu--transform-collapse-function-subtree = Collaber function
    .title =
        Collaber un function removera toto lo appellate, e assignara
         tote le tempore al function. Isto pote adjutar a simplificar un profilo que
        appella in codice que non besonia de esser analysate.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Collaber <strong>{ $nameForResource }</strong>
    .title = Collaber un ressource applattara tote le appellos a ille ressource in un singule nodo de appello collabite.
CallNodeContextMenu--transform-collapse-recursion = Collaber recursion
    .title = Collaber recursion remove appellos que repetitemente recurre in le mesme function, mesmo con functiones intermedie sur le pila.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Collaber solo le recursion directe
    .title =
        Collaber le recursion directe remove appellos que repetitemente recurre in
        le mesme function sin functiones intermedie sur le pila.
CallNodeContextMenu--transform-drop-function = Lassar cader specimens con iste function
    .title =
        Lassar cader specimens remove lor tempore ab le profilo. Isto es utile pro
        eliminar informationes temporal que non es pertinente al analyse.
CallNodeContextMenu--expand-all = Expander toto
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Recercar le nomine de function sur Searchfox
CallNodeContextMenu--copy-function-name = Copiar nomine de function
CallNodeContextMenu--copy-script-url = Copia URL de script
CallNodeContextMenu--copy-stack = Copiar pila
CallNodeContextMenu--show-the-function-in-devtools = Monstrar le function in DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Tempore de execution (ms)
    .title =
        Le tempore de execution “total” include un summario de tote le
        tempore que iste function ha essite presente in le pila. Isto
        include le tempore que le function esseva realmente in execution
        e le tempore passate in le appellatores de iste function.
CallTree--tracing-ms-self = Proprie (ms)
    .title =
        Le tempore"proprie" solo include le tempore que le function era
        le extremo del pila. Si iste function es appellate in altere functiones,
        alora le tempore del “altere” functiones non es includite. Le tempore “proprie” es utile
        pro comprender le tempore realmente passate in un programma.
CallTree--samples-total = Total (specimens)
    .title =
        Le conto de specimen “total” include un summario de cata specimen ubi iste
        function ha essite presente in le pila. Isto include le tempore que le
        function era realmente exequite e le tempore passate in le visitatores ab
        iste function.
CallTree--samples-self = Proprie
    .title =
        Le conto de specimen “proprie” solo include le specimens ubi le function era
        le extremo del pila. Si iste function era appellate in altere functiones,
        alora le contos del functiones “altere” non es includite. Le conto "proprie" es utile
        pro comprender ubi le tempore era realmente passate in un programma.
CallTree--bytes-total = Dimension total (bytes)
    .title =
        Le “dimension total” include un summario de tote le bytes allocate o 
        de-allocate ben que iste function ha essite presente in le pila. Isto include
        ambe le bytes ubi le function era realmente exequite e le
        bytes del visitatores ab iste function.
CallTree--bytes-self = Proprie (bytes)
    .title =
        Le bytes “proprie” include le bytes allocate o de-allocate durante que iste
        function era le extremo del pila. Si iste function era appellate in
        altere functiones, alora le bytes del functiones “altere” non es includite.
        Le bytes “proprie” es utile pro comprender ubi le memoria ha essite realmente
        allocate o de-allocate in le programma.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Alcun appellos a { $calledFunction } era incorporate per le compilator.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (incorporate)
    .title = Le appellos a { $calledFunction } era incorporate in { $outerFunction } per le compilator.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Eliger un nodo pro monstrar informationes re illo.
CallTreeSidebar--call-node-details = Detalios de nodo de appello

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
    .label = Tempore de execution traciate
CallTreeSidebar--traced-self-time =
    .label = Tempore proprie traciate
CallTreeSidebar--running-time =
    .label = Tempore de execution
CallTreeSidebar--self-time =
    .label = Tempore proprie
CallTreeSidebar--running-samples =
    .label = Specimens de execution
CallTreeSidebar--self-samples =
    .label = Specimens proprie
CallTreeSidebar--running-size =
    .label = Dimension de execution
CallTreeSidebar--self-size =
    .label = Dimension proprie
CallTreeSidebar--categories = Categorias
CallTreeSidebar--implementation = Implementation
CallTreeSidebar--running-milliseconds = Millisecundas de execution
CallTreeSidebar--running-sample-count = Numero de specimen de execution
CallTreeSidebar--running-bytes = Bytes de execution
CallTreeSidebar--self-milliseconds = Millisecundas proprie
CallTreeSidebar--self-sample-count = Numero de specimen proprie
CallTreeSidebar--self-bytes = Bytes proprie

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Insere le URLs de profilo que tu amarea comparar
CompareHome--instruction-content =
    Le utensile extrahera le datos del tracia e gamma seligite pro
    cata profilo e los ponera ambe sur le mesme vista pro render los facile a
    comparar.
CompareHome--form-label-profile1 = Profilo 1:
CompareHome--form-label-profile2 = Profilo 2:
CompareHome--submit-button =
    .value = Cargar profilos

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Iste profilo ha essite registrate in un compilation sin optimisationes de version.
        Le observation del prestationes pote non pertiner al population del version.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Aperir le barra lateral
Details--close-sidebar-button =
    .title = Clauder le barra lateral
Details--error-boundary-message =
    .message = Oh oh, alcun error incognite eveniva in iste pannello.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Reporta iste problema al disveloppatores, includite le error complete
    como monstrate in le consola web del utensiles del disveloppator.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Reportar le error sur GitHub

## Footer Links

FooterLinks--legal = Legal
FooterLinks--Privacy = Confidentialitate
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Cambiar lingua
FooterLinks--hide-button =
    .title = Celar ligamines de pede de pagina
    .aria-label = Celar ligamines de pede de pagina

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tracias

## Home page

Home--upload-from-file-input-button = Cargar un profilo de un file
Home--upload-from-url-button = Cargar un profilo de un URL
Home--load-from-url-submit-button =
    .value = Cargar
Home--documentation-button = Documentation
Home--menu-button = Activar le button { -profiler-brand-name } del menu
Home--menu-button-instructions =
    Activa le button de menu profilator pro initiar registrar un profilo de
    prestation in { -firefox-brand-name }, pois analysa lo e comparti lo con profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Tu pote equalmente profilar { -firefox-android-brand-name }.
    Pro saper plus, consulta iste documentation:
    <a>Profilage de { -firefox-android-brand-name } directemente sur le apparato</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Iste instantia del profilator non pute connecter se a WebChannel, perque non pote activar le button de menu del profilator.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Iste instantia de profilator non ha potite connecter se al WebChannel. Isto usualmente significa que illo se executa sur un hospite differente de illo que es specificate in le preferentia <code>devtools.performance.recording.ui-base-url</code>. Si tu vole capturar nove profilos con iste instantia, e dar a illo le controlo programmatic del button de menu profilator, tu pote ir a <code>about:config</code> e cambiar le preferentia.
Home--record-instructions =
    Pro initiar profilar, clicca sur le button profila o usa le
    vias breve de claviero. Le icone es blau quando un profilo es in registration.
    Pulsa <kbd>Capturar</kbd> pro cargar le datos in profiler.firefox.com.
Home--instructions-content =
    Registrar profilos de prestation require <a>{ -firefox-brand-name }</a>.
    Totevia, le profilos existente pote esser vidite in ulle moderne navigator.
Home--record-instructions-start-stop = Cessar e initiar profilar
Home--record-instructions-capture-load = Capturar e cargar un profilo
Home--profiler-motto = Capturar un profilo de prestation. Analysar lo. Compartir lo. Render le web plus veloce.
Home--additional-content-title = Cargar profilos existente
Home--additional-content-content = Tu pote <strong>traher e deponer</strong> hic un file profilo pro cargar lo, o:
Home--compare-recordings-info = Tu pote alsi comparar registrationes. <a>Aperir le interfacie de comparation.</a>
Home--your-recent-uploaded-recordings-title = Tu registrationes incargate recentemente
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } pote alsi importar profilos de altere profilatores, tal como
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>,
    Chrome performance panel, <androidstudio>Android Studio</androidstudio>, o
    ulle file que usa le <dhat>formato dhat</dhat> o <traceevent>le formato Trace Event
    de Google</traceevent>. <write>Apprende a scriber tu 
    proprie importator</write>.
Home--install-chrome-extension = Installar le extension de Chrome
Home--chrome-extension-instructions = Usa le <a>extension  de { -profiler-brand-name } pro Chrome</a> pro capturar profilos  de prestation in Chrome e analysar los in le { -profiler-brand-name }.
Home--chrome-extension-recording-instructions = Installar le extension ab le Boteca web de Chrome. Un vice installate, usar le icone  barra del instrumentos del extensiones o le vias breve pro cessar de profilar. Tu alsi pote exportar profilos e cargar los ci pro analyse detaliate.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Insere terminos del filtro

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Monstrar solo le tempore proprie
    .title = Monstra solo le tempore passate in un nodo de appello, ignorante su filios.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Clicca hic pro cargar le profilo { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Deler
    .title = Iste profilo non pote esser delite perque nos care de informationes de autorisation.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Nulle profilo ha essite incargate ancora!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Vide e gere tote tu ({ $profilesRestCount } restante registrationes)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gere iste registration
       *[other] Gere iste registrationes
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Predefini le selection del duration del marcator
MarkerContextMenu--start-selection-here = Initia le selection hic
MarkerContextMenu--end-selection-here = Fini le selection hic
MarkerContextMenu--start-selection-at-marker-start = Initia le selection al <strong>initio</strong> del marcator
MarkerContextMenu--start-selection-at-marker-end = Initia le selection al <strong>fin</strong> del marcator
MarkerContextMenu--end-selection-at-marker-start = Fini le selection al <strong>initio</strong> del marcator
MarkerContextMenu--end-selection-at-marker-end = Fini le selection al <strong>fin</strong> del marcator
MarkerContextMenu--copy-description = Copiar le description
MarkerContextMenu--copy-call-stack = Copiar pila de appellos
MarkerContextMenu--copy-url = Copiar URL
MarkerContextMenu--copy-page-url = Copiar URL de pagina
MarkerContextMenu--copy-as-json = Copiar como JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selige le argumento destinatario “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selige le argumento mittente “<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Depone specimens foras del marcatores concordante “<strong>{ $filter }</strong>”

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Marcatores de filtro:
    .title = Solo monstra marcatores que concorda con un certe nomine
MarkerSettings--marker-filters =
    .title = Filtros de marcatores

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Elige un marcator pro monstrar informationes re illo.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Initiar
MarkerTable--duration = Duration
MarkerTable--name = Nomine
MarkerTable--details = Detalios

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informationes de profilo
MenuButtons--index--full-view = Vista complete
MenuButtons--index--cancel-upload = Cancellar le incargamento
MenuButtons--index--share-upload =
    .label = Incargar profilo local
MenuButtons--index--share-re-upload =
    .label = Reincargar
MenuButtons--index--share-error-uploading =
    .label = Error durante le incargamento
MenuButtons--index--revert = Reverter al profilo original
MenuButtons--index--docs = Documentos
MenuButtons--permalink--button =
    .label = Ligamine permanente

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Incargate:
MenuButtons--index--profile-info-uploaded-actions = Deler
MenuButtons--index--metaInfo-subtitle = Informationes de profilo
MenuButtons--metaInfo--symbols = Symbolos:
MenuButtons--metaInfo--profile-symbolicated = Profilo symbolisate
MenuButtons--metaInfo--profile-not-symbolicated = Profilo non symbolisate
MenuButtons--metaInfo--resymbolicate-profile = Re-symbolisar le profilo
MenuButtons--metaInfo--symbolicate-profile = { $logicalCPUs } nucleo logic
MenuButtons--metaInfo--attempting-resymbolicate = { $logicalCPUs } nucleos logic
MenuButtons--metaInfo--currently-symbolicating = Actualmente symbolisante le profilo
MenuButtons--metaInfo--cpu-model = Modello de CPU:
MenuButtons--metaInfo--cpu-cores = Cordes del CPU:
MenuButtons--metaInfo--main-memory = Memoria principal:
MenuButtons--index--show-moreInfo-button = Monstrar plus
MenuButtons--index--hide-moreInfo-button = Monstrar minus
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } nucleo physic, { $logicalCPUs } nucleo logic
               *[other] { $physicalCPUs } nucleo physic, { $logicalCPUs } nucleos logic
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } nucleos physic, { $logicalCPUs } nucleo logic
               *[other] { $physicalCPUs } nucleos physic, { $logicalCPUs } nucleos logic
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } nucleo physic
       *[other] { $physicalCPUs } nucleos physic
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } nucleo logic
       *[other] { $logicalCPUs } nucleos logic
    }
MenuButtons--metaInfo--profiling-started = Registration comenciate:
MenuButtons--metaInfo--profiling-session = Durata de registration
MenuButtons--metaInfo--main-process-started = Processo principal initiate:
MenuButtons--metaInfo--main-process-ended = Processo principal finite:
MenuButtons--metaInfo--interval = Intervallo:
MenuButtons--metaInfo--buffer-capacity = Capacitate de buffer:
MenuButtons--metaInfo--buffer-duration = Capacitate de buffer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } secunda
       *[other] { $configurationDuration } secundas
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Sin limite
MenuButtons--metaInfo--application = Application
MenuButtons--metaInfo--name-and-version = Nomine e version:
MenuButtons--metaInfo--application-uptime = Tempore de activitate:
MenuButtons--metaInfo--update-channel = Canal de actualisation:
MenuButtons--metaInfo--build-id = ID de version:
MenuButtons--metaInfo--build-type = Typo de compilation:
MenuButtons--metaInfo--arguments = Argumentos:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Depurar
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Systema operative
MenuButtons--metaInfo--device = Apparato:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = S. O.:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Indicatores visualmente
MenuButtons--metaInfo--speed-index = Indice de velocitate:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Indice de velocitate perceptive:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Indice de velocitate complete:
MenuButtons--metaInfo-renderRowOfList-label-features = Functionalitates:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtro de argumentos:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensiones:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Additivos de { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Media
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Additivos
    .title = Tempore pro examinar tote le argumentos.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Mundification
    .title = Tempore pro remover datos expirate.
MenuButtons--metaOverheadStatistics-statkeys-counter = Contator
    .title = Tempore pro colliger tote le contatores.
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervallo
    .title = Intervallo observate inter duo specimens.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Blocadas
    .title = Tempore pro acquirer le blocada ante le examination.
MenuButtons--metaOverheadStatistics-overhead-duration = Durationes de additivos:
MenuButtons--metaOverheadStatistics-overhead-percentage = Percentage de additivos:
MenuButtons--metaOverheadStatistics-profiled-duration = Duration profilate:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Includer argumentos celate
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Include le datos de altere schedas
MenuButtons--publish--renderCheckbox-label-hidden-time = Includer gamma de tempore celate
MenuButtons--publish--renderCheckbox-label-include-screenshots = Includer instantaneos
MenuButtons--publish--renderCheckbox-label-resource = Includer URLs e routes de accesso del ressource
MenuButtons--publish--renderCheckbox-label-extension = Includer informationes de extension
MenuButtons--publish--renderCheckbox-label-preference = Includer valores de preferentia
MenuButtons--publish--renderCheckbox-label-private-browsing = Includer le datos ab le fenestra de navigation private
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Iste profilo contine datos de navigation private
MenuButtons--publish--reupload-performance-profile = Reincargar profilo de rendimento
MenuButtons--publish--share-performance-profile = Compartir profilo de prestation
MenuButtons--publish--info-description = Incarga tu profilo e rende lo accessibile a totes con le ligamine.
MenuButtons--publish--info-description-default = De ordinario, tu datos personal es removite.
MenuButtons--publish--info-description-firefox-nightly2 = Iste profilo es de { -firefox-nightly-brand-name }, assi de ordinario plure informationes es includite.
MenuButtons--publish--include-additional-data = Includer altere datos que pote esser identificabile
MenuButtons--publish--button-upload = Incargar
MenuButtons--publish--upload-title = Incargamento del profilo…
MenuButtons--publish--cancel-upload = Cancellar incargamento
MenuButtons--publish--message-something-went-wrong = Guai, un error se ha producite durante le incargamento del profilo.
MenuButtons--publish--message-try-again = Retentar
MenuButtons--publish--download = Discargar
MenuButtons--publish--compressing = Comprimente…
MenuButtons--publish--error-while-compressing = Error comprimente, tenta dismarcar ulle quadratos de selection pro reducer le dimension del profilo.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrar retes:
    .title = Solo monstra requestas de rete que concorda con un certe nomine

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

PanelSearch--search-field-hint = Sape tu que tu pote usar le comma (,) pro cercar per plure terminos?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Rediger le nomine del profilo
ProfileName--edit-profile-name-input =
    .title = Rediger le nomine del profilo
    .aria-label = Nomine del profilo

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Deler
    .title = Clicca hic pro deler le profilo { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Un error eveniva durante le deletion de iste profilo. <a>Passa supra le mus pro saper plus.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Deler { $profileName }
ProfileDeletePanel--dialog-confirmation-question = Es tu secur de voler deler le datos incargate pro iste profilo? Le ligamines compartite anteriormente non functionara plus.
ProfileDeletePanel--dialog-cancel-button =
    .value = Cancellar
ProfileDeletePanel--dialog-delete-button =
    .value = Deler
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Deletion…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Le datos incargate ha essite delite con successo.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Intervallo complete ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Importation e elaboration de profilo…
ProfileLoaderAnimation--loading-unpublished = Importation del profilo directemente de { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Lectura del file e elaboration del profilo…
ProfileLoaderAnimation--loading-local = Non ancora implementate.
ProfileLoaderAnimation--loading-public = Discargamento e elaboration del profilo…
ProfileLoaderAnimation--loading-from-url = Discargamento e elaboration del profilo…
ProfileLoaderAnimation--loading-compare = Lectura e elaboration del profilos…
ProfileLoaderAnimation--loading-view-not-found = Vista non trovate

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Receder a casa

## Root

Root--error-boundary-message =
    .message = Oh oh, alcun error incognite eveniva in profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Applicante…
ServiceWorkerManager--pending-button = Applicar e recargar
ServiceWorkerManager--installed-button = Recargar le application
ServiceWorkerManager--updated-while-not-ready =
    Un nove version del application ha essite applicate ante que iste pagina
    ha essite plenmente cargate. Tu pote vider mal-functionamentos.
ServiceWorkerManager--new-version-is-ready = Un nove version del application ha essite discargate e es preste a usar.
ServiceWorkerManager--hide-notice-button =
    .title = Celar le aviso de recargamento
    .aria-label = Celar le aviso de recargamento

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Tote le structuras
    .title = Non filtrar le structuras de pila
StackSettings--implementation-javascript2 = JavaScript
    .title = Monstrar solo le structuras de pila correlate a execution JavaScript
StackSettings--implementation-native2 = Native
    .title = Monstrar solo le structuras de pila pro codice native
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Filtrar pilas:
StackSettings--use-data-source-label = Fonte datos:
StackSettings--call-tree-strategy-timing = Temporisationes
    .title = Summarisa per le pilas examinate de codice exequite sur le tempore
StackSettings--call-tree-strategy-js-allocations = Allocationes de JavaScript
    .title = Summarisa per le bytes de JavaScript allocate (nulle de-allocationes)
StackSettings--call-tree-strategy-native-retained-allocations = Memoria retenite
    .title = Summarisa per le bytes de memoria que ha essite allocate, e jammais liberate in le actual selection de vista preliminar
StackSettings--call-tree-native-allocations = Memoria allocate
    .title = Summarisa per le bytes de memoria allocate
StackSettings--call-tree-strategy-native-deallocations-memory = Memoria de-allocate
    .title = Summarisa per le bytes de memoria de-allocate, per le sito ubi le memoria ha essite allocate
StackSettings--call-tree-strategy-native-deallocations-sites = Sitos de de-allocation
    .title = Summarisa per le bytes de memoria de-allocate, per le sito ubi le memoria ha essite de-allocate
StackSettings--invert-call-stack = Inverter le pila de appello
    .title = Ordina per le tempore passate in un nodo de appello, ignorante su filios.
StackSettings--show-user-timing = Monstrar temporisation de usator
StackSettings--use-stack-chart-same-widths = Usar le mesme largessa pro cata pila
StackSettings--panel-search =
    .label = Filtrar pilas:
    .title = Solo monstra pilas que contine un function cuje nomine concorda con iste sub-catena

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbore de appellos
TabBar--flame-graph-tab = Graphico a flammas
TabBar--stack-chart-tab = Diagramma a pilas
TabBar--marker-chart-tab = Diagramma a marcatores
TabBar--marker-table-tab = Tabula marcatores
TabBar--network-tab = Rete
TabBar--js-tracer-tab = Traciator JS

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Tote schedas e fenestras

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Solo monstrar iste processo
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Solo monstrar “{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = Celar altere tracias de instantaneos
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Celar “{ $trackName }”
TrackContextMenu--show-all-tracks = Monstrar tote le tracias
TrackContextMenu--show-local-tracks-in-process = Monstrar tote le tracias in iste processo
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Celar tote la tracias de typo “{ $type }”
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Monstrar tote le tracias concordante
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Celar tote le tracias concordante
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Nulle resultatos trovate pro “<span>{ $searchFilter }</span>”
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Celar tracia
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Celar processo

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = relative memoria al momento
TrackMemoryGraph--memory-range-in-graph = intervallo de memoria in graphico
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = allocationes e de-allocationes desde le previe exemplo

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
    .label = Potentia
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Potentia
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Potentia
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Potentia medie in le selection actual
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Potentia medie in le selection actual
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Potentia medie in le selection actual
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energia usate in le campo visibile
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energia usate in le campo visibile
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energia usate in le campo visibile
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energia usate in le campo visibile
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energia usate in le selection currente
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energia usate in le selection actual
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energia usate in le selection actual
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energia usate in le selection actual

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
TrackBandwidthGraph--speed = { $value } per secunda
    .label = Velocitate de transferentia pro iste specimen
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = operationes de lectura/scriptura depost le specimen previe
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Datos transferite usque ora
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Datos transferite in le campo visibile
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Datos transferite in le selection actual

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Insere terminos del filtro
    .title = Solo monstra tracias que concorda un certe texto

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
TransformNavigator--collapse-resource = Collaber: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Foco sur nodo: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Foco sur: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Categoria Foco: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Miscer nodo: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Miscer: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Lassar cader: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Collaber recursion: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Collaber solo le recursion directe: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Collaber sub-arbore: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Depone specimens foras del marcatores concordante: “{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Attendente { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Attendente { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Codification fonte non disponibile
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Vide <a>issue #3741</a> pro scenarios supportate e meliorationes planate.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Codice assembly non disponibile
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Vide <a>issue #4520</a> pro scenarios supportate e meliorationes planate.
SourceView--close-button =
    .title = Clauder le vista fonte

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Pro iste file il non ha un note URL cross-origin accessibile.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Il habeva un error de rete recuperante le URL { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Impossibile consultar le API de symbolisation del navigator: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = Le API de symbolisation del navigator rendeva un error: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = Le API de symbolisation del servitor de symbolos local retornava un error: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = Le API de symbolisation del navigator rendeva un responsa malformate: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = Le API de symbolisation del servitor de symbolos local retornava un responsa malformate: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Le file { $pathInArchive } non era trovate in le archivo ab { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Le archivo a { $url } non pote esser tractate: { $parsingErrorMessage }

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Monstrar le vista assembly
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Celar le vista assembly

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Registrationes incargate
