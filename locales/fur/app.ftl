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
-firefox-android-brand-name = Firefox par Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiladôr
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Aplicazion web pe analisi des prestazions di { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Va tal nestri dipuesit Git (il colegament al vignarà viert intun gnûf barcon)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-unpublished = Impussibil recuperâ il profîl di { -firefox-brand-name }.
AppViewRouter--error-from-file = Impussibil lei il file o analizâ il profîl che al à dentri.
AppViewRouter--error-local = No ancjemò implementât.
AppViewRouter--error-public = Impussibil discjariâ il profîl.
AppViewRouter--error-from-url = Impussibil discjariâ il profîl.
AppViewRouter--error-compare = Impussibil recuperâ i profîi.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Par vie di une <a>limitazion specifiche di Safari</a>, { -profiler-brand-name } nol rive
    a impuartâ in chest navigadôr i profîi de machine locâl. Par plasê vierç
    cheste pagjine in { -firefox-brand-name } o in Chrome.
    .title = Safari nol rive a impuartâ i profîi locâi
AppViewRouter--route-not-found--home =
    .specialMessage = L’URL che tu âs cirût di contatâ nol è stât ricognossût.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Mostre <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Unìs funzion
    .title =
        La union di une funzion le gjave dal profîl e e assegne il so timp ae
        funzion che le clame. Chest al sucêt dapardut là che la funzion e je stade clamade
        tal arbul.
CallNodeContextMenu--transform-merge-call-node = Unìs dome il grop
    .title =
        La union di un grop lu gjave dal profîl e e assegne il so timp al
        grop de funzion che lu clame. E gjave ancje la funzion di chê part specifiche dal arbul. Ducj i altris puescj là che la funzion e ven clamade
        a restaran tal profîl.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    La concentrazion su une funzion e gjavarà ducj i campions che no includin chê
    funzion. Al vignarà riorganizât ancje l'arbul des clamadis, in mût che la funzion
    e sedi l'unic grop lidrîs. Chest al permet di cumbinâ plui sîts di clamade di une funzion midiant il profîl intun unic grop di clamade.
CallNodeContextMenu--transform-focus-function = Concentrazion su funzion
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Concentrazion su funzion (invertide)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Concentrazion dome su sot-arbul
    .title =
        La concentrazion suntun sot-arbul e gjavara ducj i campions che no includin chê
        specifiche part dal arbul des clamadis. Al tire fûr un ram dal arbul des clamadis,
        dut câs lu fâs dome par chel singul grop di clamadis. Dutis lis altris clamadis
        de funzion a vegnin ignoradis.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Concentrazion su categorie <strong>{ $categoryName }</strong>
    .title =
        La concentrazion sui grops che a apartegnin ae stesse categorie dal grop selezionât,
        unint cussì ducj i grop che a apartegnin a une altre categorie.
CallNodeContextMenu--transform-collapse-function-subtree = Strenç funzion
    .title =
        La copression di une funzion e gjavarà dut ce che le clame e e assegnarà
        dut il so timp ae funzion. Chest al pues judâ a semplificâ un profîl che
        al clame codiç che nol covente analizâ.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Strenç <strong>{ $nameForResource }</strong>
    .title = La compression di une risorse e placarà dutis lis clamadis a chê risorse intun singul grop di clamade strenzût.
CallNodeContextMenu--transform-collapse-recursion = Strenç ricorsion
    .title =
        La compression de ricorsion e gjave lis clamadis che si ripetin in mût ricorsîf
        te stesse funzion, ancje cun funzions intermedis sul stack.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Strenç dome ricorsion direte
    .title =
        La compression de ricorsion direte e gjave lis clamadis che si ripetin in mût ricorsîf
        te stesse funzion cence funzions intermedis sul stack.
CallNodeContextMenu--transform-drop-function = Mole i campions cun cheste funzion
    .title =
        Il scart dai campions al gjave il lôr timp dal profîl. Chest al è util par
        eliminâ lis informazions temporâls che no son impuartantis pe analisi.
CallNodeContextMenu--expand-all = Slargje dut
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Cîr il non de funzion in Searchfox
CallNodeContextMenu--copy-function-name = Copie non de funzion
CallNodeContextMenu--copy-script-url = Copie URL dal script
CallNodeContextMenu--copy-stack = Copie stack

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Timp di esecuzion (ms)
    .title =
        Il timp di esecuzion “totâl” al inclût une sintesi di dut il timp là che e je stade
        osservade la presince di cheste funzion sul stack. Chest al inclût il timp là
        che la funzion e je stade in efiets in esecuzion e il timp spindût tai clamadôrs di
        cheste funzion.
CallTree--tracing-ms-self = Self (ms)
    .title =
        Il timp “self” al inclût dome il timp là che la funzion e stave
        te fin dal stack. Se cheste funzion e à clamât altris funzions,
        il timp “altri” di cheste funzion nol è includût. Il timp “self” al è util
        par capî là che il timp al è stât spindût intun program.
CallTree--samples-total = Totâl (campions)
    .title =
        Il cont “totâl” dai campions al inclût une sintesi di ducj i campions là che cheste
        funzion e je stade osservade stâ sul stack. Chest al inclûd il timp là che la
        funzion e jere in efiets in esecuzion e il timp pierdût tai clamadôrs di cheste
        funzion.
CallTree--samples-self = Self
    .title = Il cont dai campions “self” al inclût ducj i campions là che la funzion si cjatave ae fin dal stack. Se cheste funzion e à clamât altris funzions, il cont "altri" di chestis funzions nol è includût. Il cont “self” al è util par capî là che di fat il timp al ven doprât dentri di un program.
CallTree--bytes-total = Dimension totâl (bytes)
    .title = La “dimension totâl“ e inclût une sintesi di ducj i bytes assegnâts o gjavâts de assegnazion cuant che cheste funzion e je stade tignude di voli sul stack. Chest al inclût i bytes consumâts cuant che la funzion e jere di fat in esecuzion, ma ancje il timp passât tes funzions clamadis di cheste funzion.
CallTree--bytes-self = Self (bytes)
    .title = “Self“ al inclût i bytes assegnâts o gjavâts de assegnazion cuant che cheste funzion si cjatave ae fin dal stack. Se cheste funzione e à clamât altris funzions, il cont dai bytes "altri" di chestis funzions nol è includût. Il cont “self” al è util par capî cemût che la memorie e ven di fat assegnade e gjavade de assegnazion dentri di un program.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Cualchi clamade a { $calledFunction } e je stade incorporade dal compiladôr.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (incorporade)
    .title = Lis clamadis a { $calledFunction } a son stadis incorporadis in { $outerFunction } dal compiladôr.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selezione un grop par visualizâ informazions in merit.
CallTreeSidebar--call-node-details = Detais grop di clamade

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
    .label = Timp di esecuzion tignût segnât
CallTreeSidebar--traced-self-time =
    .label = Timp te funzion tignût segnât
CallTreeSidebar--running-time =
    .label = Timp di esecuzion
CallTreeSidebar--self-time =
    .label = Timp te funzion
CallTreeSidebar--running-samples =
    .label = Campions esecuzion
CallTreeSidebar--self-samples =
    .label = Campions te funzion
CallTreeSidebar--running-size =
    .label = Dimensions esecuzion
CallTreeSidebar--self-size =
    .label = Dimensions te funzion
CallTreeSidebar--categories = Categoriis
CallTreeSidebar--implementation = Implementazion
CallTreeSidebar--running-milliseconds = Esecuzion — Miliseconts
CallTreeSidebar--running-sample-count = Esecuzion — Numar campions
CallTreeSidebar--running-bytes = Esecuzion — Bytes
CallTreeSidebar--self-milliseconds = Te funzion —  Miliseconts
CallTreeSidebar--self-sample-count = Te funzion —  Numar campions
CallTreeSidebar--self-bytes = Te funzion —  Bytes

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Inserî i URLs dai profîi che tu vuelis confrontâ
CompareHome--instruction-content =
    Chest imprest al tirarà fûr i dâts dal segn e de dade di timp selezionâts par
    ogni profîl, e ju metarà te stesse viodude par rindi il confront plui sempliç.
CompareHome--form-label-profile1 = Profîl 1:
CompareHome--form-label-profile2 = Profîl 2:
CompareHome--submit-button =
    .value = Recupere profîi

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Chest profîl al è stât regjistrât cuntune version (compilazion) che no veve lis otimizazions dopradis te version di publicazion.
        Al è pussibil che lis osservazions des prestazions no vegnin aplicadis ai utents te version di publicazion.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Vierç la sbare laterâl
Details--close-sidebar-button =
    .title = Siere la sbare laterâl
Details--error-boundary-message =
    .message = Orpo, al è capitât un erôr no cognossût in chest panel.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Segnale chest probleme ai svilupadôrs, includint l’erôr
    complet come visualizât te Console web dai struments di svilup.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Segnale l’erôr su GitHub

## Footer Links

FooterLinks--legal = Notis legâls
FooterLinks--Privacy = Riservatece
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Cambie lenghe
FooterLinks--hide-button =
    .title = Plate colegaments da pît de pagjine
    .aria-label = Plate colegaments da pît de pagjine

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> segns

## Home page

Home--upload-from-file-input-button = Cjame un profîl di file
Home--upload-from-url-button = Cjame un profîl di un URL
Home--load-from-url-submit-button =
    .value = Cjame
Home--documentation-button = Documentazion
Home--menu-button = Ative il boton { -profiler-brand-name } tal menù
Home--menu-button-instructions =
    Ative il boton dal menù dal profiladôr par scomençâ a regjistrâ un
    profîl di prestazions in { -firefox-brand-name }, dopo analizilu e condividilu cun profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Tu puedis ancje profilâ { -firefox-android-brand-name }. Par vê plui
    informazions, consulte cheste documentazion:
    <a>Creâ un profîl di { -firefox-android-brand-name } dret sul dispositîf</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Cheste istance dal profiladôr no je rivade a conetisi al WebChannel e duncje no pues ativâ il Boton dal profiladôr tal menù.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Cheste istance dal profiladôr no je rivade a conetisi al WebChannel. Di solit al significhe che e je in esecuzion suntun host diviers di chel indicât te impostazion <code>devtools.performance.recording.ui-base-url</code>. Se tu vuelis caturâ gnûfs profîi cun cheste istance e dâur il control programatic dal boton dal menù dal profiladôr, vierç <code>about:config</code> e modifiche cheste impostazion.
Home--record-instructions = Par inviâ la profilazion, fâs clic sul boton par scomençâ la regjistrazion opûr dopre lis scurtis di tastiere. La icone e devente blu se e je ative la regjistrazion di un profîl. Frache <kbd>Cature</kbd> par cjariâ i dâts su profiler.firefox.com.
Home--instructions-content = La regjistrazion dai profîi e je pussibile dome cun <a>{ -firefox-brand-name }</a>. Al è pussibil visualizâ i profîi esistents cun cualsisei navigadôr moderni.
Home--record-instructions-start-stop = Interomp e invie la profiladure
Home--record-instructions-capture-load = Cature e cjame profîl
Home--profiler-motto = Cature un profîl des prestazions. Analizilu. Condividilu. Rint il Web plui svelt.
Home--additional-content-title = Cjame profîi esistents
Home--additional-content-content = Tu puedis <strong>strissinâ e molâ</strong> achì un profîl par cjariâlu, opûr:
Home--compare-recordings-info = Tu puedis ancje paragonâ diviersis regjistrazions. <a>Vierç la interface pal confront</a>.
Home--your-recent-uploaded-recordings-title = Lis tôs regjistrazions cjariadis in rêt di resint
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } al pues ancje impuartâ profîi di altris profiladôrs, come <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, il
    panel prestazions di Chrome, <androidstudio>Android Studio</androidstudio> o qualsisei file che al dopri il <dhat>formât dhat</dhat> o <traceevent>Trace Event di Google</traceevent>. <write>Scuvierç cemût creâ un strument di importazion</write>.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Inserìs i tiermins di cirî

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Mostre dome “self time’”
    .title = Mostre nome il timp doprât intun grop di clamade, ignorant i siei fîs.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Fâs clic achì par cjariâ il profîl { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Elimine
    .title = Nol è pussibil eliminâ chest profîl parcè che nus mancjin lis informazions di autorizazion.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Nol è stât cjariât ancjemò nissun profîl!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Viôt e gjestìs dutis lis tôs regjistrazions (altris { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gjestìs cheste regjistrazion
       *[other] Gjestìs chestis regjistrazions
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Scomence la selezion achì
MarkerContextMenu--end-selection-here = Finìs la selezion achì
MarkerContextMenu--copy-description = Copie descrizion
MarkerContextMenu--copy-call-stack = Copie stack de clamade
MarkerContextMenu--copy-url = Copie URL
MarkerContextMenu--copy-page-url = Copie URL de pagjine
MarkerContextMenu--copy-as-json = Copie come JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selezione il thread dal ricevidôr “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selezione il thread dal mitent “<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.


## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Inizi
MarkerTable--duration = Durade
MarkerTable--name = Non
MarkerTable--details = Detais

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informazions profîl
MenuButtons--index--full-view = Viodude complete
MenuButtons--index--cancel-upload = Anule cjariament in rêt
MenuButtons--index--share-upload =
    .label = Cjame in rêt il profîl locâl
MenuButtons--index--share-re-upload =
    .label = Torne cjame in rêt
MenuButtons--index--share-error-uploading =
    .label = Erôr tal cjariâ in rêt
MenuButtons--index--revert = Ripristine al profîl origjinâl
MenuButtons--index--docs = Documentazion
MenuButtons--permalink--button =
    .label = Colegament permanent

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Cjariât in rêt:
MenuButtons--index--profile-info-uploaded-actions = Elimine
MenuButtons--index--metaInfo-subtitle = Informazions profîl
MenuButtons--metaInfo--symbols = Simbui:
MenuButtons--metaInfo--profile-symbolicated = Il profîl al è simbolizât
MenuButtons--metaInfo--profile-not-symbolicated = Il profîl nol è simbolizât
MenuButtons--metaInfo--resymbolicate-profile = Torne simbolize il profîl
MenuButtons--metaInfo--symbolicate-profile = Simbolize il profîl
MenuButtons--metaInfo--attempting-resymbolicate = Tentatîf di tornâ a simbolizâ il profîl
MenuButtons--metaInfo--currently-symbolicating = In chest moment, daûr a simbolizâ il profîl
MenuButtons--metaInfo--cpu-model = Model CPU:
MenuButtons--metaInfo--cpu-cores = Cores de CPU:
MenuButtons--metaInfo--main-memory = Memorie principâl:
MenuButtons--index--show-moreInfo-button = Mostre di plui
MenuButtons--index--hide-moreInfo-button = Mostre di mancul
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } core fisic, { $logicalCPUs } core logjic
               *[other] { $physicalCPUs } core fisic, { $logicalCPUs } cores logjics
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } cores fisics, { $logicalCPUs } core logjic
               *[other] { $physicalCPUs } cores fisics, { $logicalCPUs } cores logjics
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } core fisic
       *[other] { $physicalCPUs } cores fisics
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } core logjic
       *[other] { $logicalCPUs } cores logjics
    }
MenuButtons--metaInfo--profiling-started = Regjistrazion scomençade:
MenuButtons--metaInfo--profiling-session = Lungjece regjistrazion:
MenuButtons--metaInfo--main-process-started = Procès principâl inviât:
MenuButtons--metaInfo--main-process-ended = Procès principâl completât:
MenuButtons--metaInfo--interval = Interval:
MenuButtons--metaInfo--buffer-capacity = Capacitât buffer:
MenuButtons--metaInfo--buffer-duration = Durade buffer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } secont
       *[other] { $configurationDuration } seconts
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Ilimitade
MenuButtons--metaInfo--application = Aplicazion
MenuButtons--metaInfo--name-and-version = Non e version:
MenuButtons--metaInfo--application-uptime = Timp di ativitât:
MenuButtons--metaInfo--update-channel = Canâl di inzornament:
MenuButtons--metaInfo--build-id = ID compilazion:
MenuButtons--metaInfo--build-type = Gjenar di compilazion:
MenuButtons--metaInfo--arguments = Argoments:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Plateforme
MenuButtons--metaInfo--device = Dispositîf:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = SO:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Metrichis visivis
MenuButtons--metaInfo--speed-index = Indiç di velocitât:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Indiç di velocitât percetive:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Indiç di velocitât dal contignût:
MenuButtons--metaInfo-renderRowOfList-label-features = Funzionalitâts:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtri threads:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Estensions:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Risorsis adizionâls (overhead) { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Medie
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
    .title = Timp par campionâ ducj i threads.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Netisie
    .title = Timp par scartâ i dâts scjadûts.
MenuButtons--metaOverheadStatistics-statkeys-counter = Contadôr
    .title = Timp par tirâ dongje ducj i contadôrs.
MenuButtons--metaOverheadStatistics-statkeys-interval = Dade
    .title = Dade di timp osservade tra doi campions.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Blocs
    .title = Timp par cuistâ il bloc prime dal campionament.
MenuButtons--metaOverheadStatistics-overhead-duration = Duradis dal overhead:
MenuButtons--metaOverheadStatistics-overhead-percentage = Percentuâl di overhead:
MenuButtons--metaOverheadStatistics-profiled-duration = Durade profilade:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Inclût threads platâts
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Inclût i dâts di altris schedis
MenuButtons--publish--renderCheckbox-label-hidden-time = Inclût dade di timp platât
MenuButtons--publish--renderCheckbox-label-include-screenshots = Inclût videadis
MenuButtons--publish--renderCheckbox-label-resource = Inclût URL e percors des risorsis
MenuButtons--publish--renderCheckbox-label-extension = Inclût informazions su lis estensions
MenuButtons--publish--renderCheckbox-label-preference = Inclût valôrs des impostazions
MenuButtons--publish--renderCheckbox-label-private-browsing = Inclût i dâts dai barcons di navigazion privade
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Chest profîl al conten dâts di navigazion privade
MenuButtons--publish--reupload-performance-profile = Torne cjame in rêt il profîl des prestazions
MenuButtons--publish--share-performance-profile = Condivît il profîl des prestazions
MenuButtons--publish--info-description = Cjame in rêt il to profîl e rindilu acessibil a ducj cul colegament.
MenuButtons--publish--info-description-default = Par impostazion predefinide, i tiei dâts personâi a vegnin gjavâts.
MenuButtons--publish--info-description-firefox-nightly2 = Chest profîl al rive di { -firefox-nightly-brand-name }, duncje par impostazion predefinide la plui part des informazions e ven includude.
MenuButtons--publish--include-additional-data = Inclût dâts in plui che a podaressin jessi identificabii
MenuButtons--publish--button-upload = Cjarie in rêt
MenuButtons--publish--upload-title = Daûr a cjariâ in rêt il profîl…
MenuButtons--publish--cancel-upload = Anule cjariament in rêt
MenuButtons--publish--message-something-went-wrong = Orpo, alc al è lât strucj dilunc il cjariament in rêt dal profîl.
MenuButtons--publish--message-try-again = Torne prove
MenuButtons--publish--download = Discjame
MenuButtons--publish--compressing = Daûr a comprimi…
MenuButtons--publish--error-while-compressing = Erôr dilunc la compression, prove a deselezionâ cualchi casele di control par ridusi lis dimensions dal profîl.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtre rêts:
    .title = Visualize dome lis richiestis di rêt che a corispuindin a un ciert non

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

PanelSearch--search-field-hint = Savevistu che tu puedis doprâ la virgule (,) par fâ ricercjis cun plui tiermins?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Elimine
    .title = Fâs clic achì par eliminâ il profîl { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Al è capitât un erôr dilunc la eliminazion di chest profîl. <a>Passe chi sore cul mouse par vê altris informazions.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Elimine “{ $profileName }”
ProfileDeletePanel--dialog-confirmation-question = Eliminâ pardabon i dâts cjariâts in rêt par chest profîl? I colegaments che prime a jerin condividûts no funzionaran plui.
ProfileDeletePanel--dialog-cancel-button =
    .value = Anule

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation


## ProfileRootMessage


## Root


## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.


## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--panel-search =
    .label = Filtre stacks:
    .title = Visualize dome i stacks che a contegnin une funzion là che il so non al corispuint a cheste sotstringhe

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbul des clamadis
TabBar--flame-graph-tab = Grafic a flame
TabBar--stack-chart-tab = Grafic a pile
TabBar--marker-chart-tab = Grafic a marcadôrs
TabBar--marker-table-tab = Tabele marcadôrs
TabBar--network-tab = Rêt
TabBar--js-tracer-tab = Tracer JS

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Mostre dome chest procès
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Mostre dome “{ $trackName } ”
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Plate “{ $trackName }”
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Nissun risultât cjatât par “<span>{ $searchFilter }</span>”
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Plate procès

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track


## TrackPower
## This is used to show the power used by the CPU and other chips in a computer,
## graphed over time.
## It's not always displayed in the UI, but an example can be found at
## https://share.firefox.dev/3a1fiT7.
## For the strings in this group, the carbon dioxide equivalent is computed from
## the used energy, using the carbon dioxide equivalent for electricity
## consumption. The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.


## TrackBandwidth
## This is used to show how much data was transfered over time.
## For the strings in this group, the carbon dioxide equivalent is estimated
## from the amount of data transfered.
## The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.


## TrackSearchField
## The component that is used for the search input in the track context menu.


## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms


## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.


## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.


## Toggle buttons in the top right corner of the bottom box


## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

