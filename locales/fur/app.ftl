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
Home--record-instructions-start-stop = Interomp e invie la profiladure
Home--record-instructions-capture-load = Cature e cjame profîl
Home--additional-content-title = Cjame profîi esistents

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


## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
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


## Timestamp formatting primitive


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.


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


## Tab Bar for the bottom half of the analysis UI.


## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.


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

