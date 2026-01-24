# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox voor Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> – <subheader>Web-app voor prestatieanalyse van { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Naar onze Git-repository (deze wordt in een nieuw venster geopend)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Kan het profiel niet importeren.
AppViewRouter--error-unpublished = Kan het profiel niet ophalen van { -firefox-brand-name }.
AppViewRouter--error-from-file = Kan het bestand niet lezen of het profiel erin ontleden.
AppViewRouter--error-local = Nog niet geïmplementeerd.
AppViewRouter--error-public = Kan het profiel niet downloaden.
AppViewRouter--error-from-url = Kan het profiel niet downloaden.
AppViewRouter--error-compare = Kan de profielen niet ophalen.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Vanwege een <a>specifieke beperking in Safari</a> kan { -profiler-brand-name } geen
    profielen van de lokale computer in deze browser importeren. Open in plaats daarvan
    deze pagina in { -firefox-brand-name } of Chrome.
    .title = Safari kan geen lokale profielen importeren
AppViewRouter--route-not-found--home =
    .specialMessage = De URL die u probeerde te bereiken, werd niet herkend.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (inline geplaatst)
    .title = { $function } is door de compiler inline in de aanroepomgeving geplaatst

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = <strong>{ $fileName }</strong> tonen
CallNodeContextMenu--transform-merge-function = Functie samenvoegen
    .title =
        Als u een functie samenvoegt, wordt deze uit het profiel verwijderd en wordt de tijd toegewezen aan
        de functie die deze heeft aangeroepen. Dit gebeurt overal waar de functie
        in de boom was aangeroepen.
CallNodeContextMenu--transform-merge-call-node = Alleen node samenvoegen
    .title =
        Als u een node samenvoegt, wordt deze uit het profiel verwijderd en de tijd toegewezen aan de
        functienode die deze heeft aangeroepen. Het verwijdert de functie alleen van dat
        specifieke deel van de boom. Overige plaatsen vanwaaruit de functie was aangeroepen
        blijven in het profiel.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Als u focust op een functie, wordt elk voorbeeld dat die functie niet bevat
    verwijderd. Daarbij wordt de aanroepboom opnieuw geroot, zodat de functie
    de enige root van de boom is. Dit kan meerdere functie-aanroepsites in een profiel
    combineren in één aanroepnode.
CallNodeContextMenu--transform-focus-function = Focussen op functie
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focussen op functie (omgekeerd)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Alleen focussen op substructuur
    .title =
        Als u op een substructuur focust, wordt elk voorbeeld dat dat specifieke deel
        van de aanroepboom niet bevat verwijderd. Het selecteert een tak van de aanroepboom,
        echter dit gebeurt alleen voor die enkele aanroepnode. Alle andere aanroepen
        van de functie worden genegeerd.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Focussen op categorie <strong>{ $categoryName }</strong>
    .title =
        Focussen op de nodes in dezelfde categorie als de geselecteerde node,
        waardoor alle nodes die in een andere categorie horen worden samengevoegd.
CallNodeContextMenu--transform-collapse-function-subtree = Functie samenvouwen
    .title =
        Als u een functie samenvouwt, wordt alles dat deze heeft aangeroepen verwijderd en alle
        tijd aan de functie toegewezen. Dit kan helpen een profiel dat code aanroept die niet
        hoeft te worden geanalyseerd te vereenvoudigen.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = <strong>{ $nameForResource }</strong> samenvouwen
    .title =
        Als u een bron samenvouwt, worden alle aanroepen van die bron
        afgevlakt tot een enkele samengevouwen aanroepnode.
CallNodeContextMenu--transform-collapse-recursion = Recursie samenvouwen
    .title =
        Het samenvouwen van recursie verwijdert aanroepen die bij herhaling recurseren naar
        dezelfde functie, zelfs met tussentijdse functies op de stack.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Alleen directe recursie samenvouwen
    .title =
        Het samenvouwen van directe recursie verwijdert aanroepen die bij herhaling recurseren naar
        dezelfde functie zonder tussentijdse functies op de stack.
CallNodeContextMenu--transform-drop-function = Monsters met deze functie weglaten
    .title =
        Als u monsters weglaat, wordt hun tijd uit het profiel verwijderd. Dit is nuttig om
        tijdsinformatie die niet relevant voor de analyse is te elimineren.
CallNodeContextMenu--expand-all = Alles uitbreiden
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = De functienaam op Searchfox opzoeken
CallNodeContextMenu--copy-function-name = Functienaam kopiëren
CallNodeContextMenu--copy-script-url = Script-URL kopiëren
CallNodeContextMenu--copy-stack = Stack kopiëren
CallNodeContextMenu--show-the-function-in-devtools = Functie tonen in DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Looptijd (ms)
    .title =
        De ‘totale’ looptijd bevat een samenvatting van alle tijd waarin deze
        functie zich op de stack bevond. Dit omvat de tijd waarin de
        functie daadwerkelijk werd uitgevoerd en de tijd die werd gespendeerd
        aan aanroepen vanuit deze functie.
CallTree--tracing-ms-self = Zelf (ms)
    .title =
        De ‘zelf’-tijd omvat alleen de tijd waarin de functie zich aan het
        eind van de stack bevond. Als deze functie andere functies heeft aangeroepen,
        is de tijd van de ‘andere’ functie niet meegenomen. De ‘zelf’-tijd is nuttig
        voor het begrip van welke tijd daadwerkelijk in het programma is besteed.
CallTree--samples-total = Totaal (monsters)
    .title =
        Het ‘totale’ monsteraantal omvat een samenvatting van elk monster waarin deze
        functie zich in de stack bevond. Dit omvat de tijd waarin de functie
        daadwerkelijk werd uitgevoerd en de gespendeerde tijd in de aanroepen
        vanuit deze functie.
CallTree--samples-self = Zelf
    .title =
        Het aantal ‘zelf’-monsters omvat alleen de monsters waarin de functie zich
        aan het einde van de stack bevond. Als deze functie andere functies heeft aangeroepen,
        zijn de aantallen ‘andere’ functies niet meegeteld. Het aantal keren ‘zelf’ is nuttig
        voor het begrip van waar tijd daadwerkelijk in een programma is besteed.
CallTree--bytes-total = Totale grootte (bytes)
    .title =
        De ‘totale grootte’ omvat een samenvatting van alle bytes die gealloceerd of
        gedealloceerd zijn, terwijl deze functie zich in de stack bevond. Dit bevat
        zowel de bytes waarbij de functie daadwerkelijk werd uitgevoerd als de
        bytes van de aanroepen vanuit deze functie.
CallTree--bytes-self = Zelf (bytes)
    .title =
        De ‘zelf’-bytes omvatten alle bytes die gealloceerd of gedealloceerd zijn, terwijl
        deze functie zich aan het einde van de stack bevond. Als deze functie andere
        functies heeft aangeroepen, dan zijn de bytes van ‘andere’ functie niet opgenomen.
        De ‘zelf’-bytes zijn nuttig om te begrijpen waar geheugenruimte daadwerkelijk
        in het programma was gealloceerd of gedealloceerd.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Sommige aanroepen naar { $calledFunction } zijn inline door de compiler geplaatst.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (inline geplaatst)
    .title = Aanroepen naar { $calledFunction } zijn inline in { $outerFunction } geplaatst door de compiler.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selecteer een node om informatie erover te tonen.
CallTreeSidebar--call-node-details = Details aanroepnode

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
    .label = Gevolgde looptijd
CallTreeSidebar--traced-self-time =
    .label = Gevolgde eigen tijd
CallTreeSidebar--running-time =
    .label = Looptijd
CallTreeSidebar--self-time =
    .label = Eigen tijd
CallTreeSidebar--running-samples =
    .label = Lopende samples
CallTreeSidebar--self-samples =
    .label = Eigen samples
CallTreeSidebar--running-size =
    .label = Omvang lopend
CallTreeSidebar--self-size =
    .label = Eigen omvang
CallTreeSidebar--categories = Categorieën
CallTreeSidebar--implementation = Implementatie
CallTreeSidebar--running-milliseconds = Lopend in milliseconden
CallTreeSidebar--running-sample-count = Aantal samples lopend
CallTreeSidebar--running-bytes = Lopend in bytes
CallTreeSidebar--self-milliseconds = Eigen in milliseconden
CallTreeSidebar--self-sample-count = Aantal samples eigen
CallTreeSidebar--self-bytes = Eigen in bytes

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Voer de profiel-URL’s die u wilt vergelijken in
CompareHome--instruction-content =
    Het hulpmiddel extraheert de gegevens uit de geselecteerde track en het bereik voor
    elk profiel en plaatst ze samen in dezelfde weergave, om ze gemakkelijk te
    vergelijken te maken.
CompareHome--form-label-profile1 = Profiel 1:
CompareHome--form-label-profile2 = Profiel 2:
CompareHome--submit-button =
    .value = Profielen ophalen

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Dit profiel is opgenomen in een build zonder uitgave-optimalisaties.
        Prestatiewaarnemingen zijn mogelijk niet van toepassing op de uitgavepopulatie.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = De zijbalk openen
Details--close-sidebar-button =
    .title = De zijbalk sluiten
Details--error-boundary-message =
    .message = Oh-oh, er is een onbekende fout in dit paneel opgetreden.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Dit probleem aan de ontwikkelaars melden, inclusief de volledige
    foutmelding zoals getoond in de webconsole van de Ontwikkelaarshulpmiddelen.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = De fout op GitHub melden

## Footer Links

FooterLinks--legal = Juridisch
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Taal wijzigen
FooterLinks--hide-button =
    .title = Voettekstkoppelingen verbergen
    .aria-label = Voettekstkoppelingen verbergen

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tracks

## Home page

Home--upload-from-file-input-button = Een profiel uit een bestand laden
Home--upload-from-url-button = Een profiel van een URL laden
Home--load-from-url-submit-button =
    .value = Laden
Home--documentation-button = Documentatie
Home--menu-button = Menuknop { -profiler-brand-name } inschakelen
Home--menu-button-instructions =
    Schakel de menuknop Profiler in om te beginnen met het opnemen van een
    prestatieprofiel in { -firefox-brand-name }, analyseer dit en deel het met profiler.firefox.com.
Home--profile-firefox-android-instructions =
    U kunt ook { -firefox-android-brand-name } profileren. Voor meer
    informatie kunt u deze documentatie raadplegen:
    <a>{ -firefox-android-brand-name } rechtstreeks op apparaat profileren</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Deze profiler-instantie kan geen verbinding maken met het WebChannel, dus de Profiler-menuknop kan niet worden ingeschakeld.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Deze profiler-instantie kan geen verbinding maken met het WebChannell. Dit betekent meestal dat deze
    wordt uitgevoerd op een andere host dan opgegeven in de voorkeur
    <code>devtools.performance.recording.ui-base-url</code>. Als u nieuwe profielen wilt vastleggen
    met deze instantie, en er programmatische controle over de profiler-menuknop aan wilt geven,
    dan kunt u naar <code>about:config</code> gaan en de voorkeur wijzigen.
Home--record-instructions =
    Klik om te starten met het maken van een profiel op de profielknop of gebruik de
    sneltoetsen. Het pictogram is blauw als er een profiel wordt opgenomen.
    Klik op <kbd>Vastleggen</kbd> om de gegevens in profiler.firefox.com te laden.
Home--instructions-content =
    Het opnemen van prestatieprofielen vereist <a>{ -firefox-brand-name }</a>.
    Bestaande profielen kunnen echter bekeken worden in elke moderne browser.
Home--record-instructions-start-stop = Profileren stoppen en starten
Home--record-instructions-capture-load = Profiel vastleggen en laden
Home--profiler-motto = Leg een prestatieprofiel vast. Analyseer het. Deel het. Maak het internet sneller.
Home--additional-content-title = Bestaande profielen laden
Home--additional-content-content = U kunt een profielbestand hierheen <strong>verslepen</strong> om het te laden, of:
Home--compare-recordings-info = U kunt ook opnamen vergelijken. <a>De vergelijkingsinterface openen.</a>
Home--your-recent-uploaded-recordings-title = Uw onlangs geüploade opnamen
Home--dark-mode-title = Donkere modus
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    De { -profiler-brand-name } kan ook profielen van andere profilers importeren, zoals
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, het
    Chrome-prestatiepaneel, <androidstudio>Android Studio</androidstudio> of
    elk bestand dat de <dhat>dhat-indeling</dhat> of de <traceevent>Trace Event-indeling
    van Google</traceevent> gebruikt. <write>Ontdek hoe u uw eigen
    importroutine schrijft</write>.
Home--install-chrome-extension = De Chrome-extensie installeren
Home--chrome-extension-instructions =
    Gebruik de <a>{ -profiler-brand-name }-extensie voor Chrome</a>
    om prestatieprofielen in Chrome vast te leggen en ze in de
    { -profiler-brand-name } te analyseren. Installeer de extensie vanuit de Chrome Web Store.
Home--chrome-extension-recording-instructions =
    Gebruik na installatie het werkbalkpictogram van de
    extensie of de snelkoppelingen om het profileren te starten en te stoppen. U kunt ook
    profielen exporteren en deze hier laden voor gedetailleerde analyse.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Voer filtertermen in

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Alleen zelftijd tonen
    .title = Alleen de tijd in een aanroepnode tonen en onderliggende aanroepen negeren.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Klik hier om profiel { $smallProfileName } te laden
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Verwijderen
    .title = Dit profiel kan niet worden verwijderd, omdat we geen autorisatiegegevens hebben.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Er is nog geen profiel geüpload!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Al uw opnamen bekijken en beheren (nog { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Deze opname beheren
       *[other] Deze opnamen beheren
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Selectie instellen vanuit duur markering
MarkerContextMenu--start-selection-here = Selectie hier starten
MarkerContextMenu--end-selection-here = Selectie hier beëindigen
MarkerContextMenu--start-selection-at-marker-start = Selectie starten bij <strong>start</strong> markering
MarkerContextMenu--start-selection-at-marker-end = Selectie starten bij <strong>einde</strong> markering
MarkerContextMenu--end-selection-at-marker-start = Selectie beëindigen bij <strong>start</strong> markering
MarkerContextMenu--end-selection-at-marker-end = Selectie beëindigen bij <strong>einde</strong> markering
MarkerContextMenu--copy-description = Beschrijving kopiëren
MarkerContextMenu--copy-call-stack = Aanroepstack kopiëren
MarkerContextMenu--copy-url = URL kopiëren
MarkerContextMenu--copy-page-url = Pagina-URL kopiëren
MarkerContextMenu--copy-as-json = Kopiëren als JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selecteer de ontvangerthread ‘<strong>{ $threadName }</strong>’
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selecteer de afzenderthread ‘<strong>{ $threadName }</strong>’

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Samples buiten markeringen overeenkomend met ‘<strong>{ $filter }</strong>’ buiten beschouwing laten

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Markeringstabel als platte tekst kopiëren
MarkerCopyTableContextMenu--copy-table-as-markdown = Markeringstabel als Markdown kopiëren

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Markeringen filteren:
    .title = Alleen markeringen tonen die overeenkomen met een bepaalde naam
MarkerSettings--marker-filters =
    .title = Markeringsfilters
MarkerSettings--copy-table =
    .title = Tabel als tekst kopiëren
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Het aantal rijen overschrijdt de limiet: { $rows } > { $maxRows }. Alleen de eerste { $maxRows } rijen worden gekopieerd.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selecteer een markering om informatie erover te tonen.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Start
MarkerTable--duration = Duur
MarkerTable--name = Naam
MarkerTable--details = Details

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Alleen markeringen tonen die overeenkomen met: ‘{ $filter }’
    .aria-label = Alleen markeringen tonen die overeenkomen met: ‘{ $filter }’

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profielinfo
MenuButtons--index--full-view = Volledig beeld
MenuButtons--index--cancel-upload = Uploaden annuleren
MenuButtons--index--share-upload =
    .label = Lokaal profiel uploaden
MenuButtons--index--share-re-upload =
    .label = Opnieuw uploaden
MenuButtons--index--share-error-uploading =
    .label = Fout bij uploaden
MenuButtons--index--revert = Terug naar origineel profiel
MenuButtons--index--docs = Documentatie
MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Geüpload:
MenuButtons--index--profile-info-uploaded-actions = Verwijderen
MenuButtons--index--metaInfo-subtitle = Profielinformatie
MenuButtons--metaInfo--symbols = Symbolen:
MenuButtons--metaInfo--profile-symbolicated = Profiel is gesymboliseerd
MenuButtons--metaInfo--profile-not-symbolicated = Profiel is niet gesymboliseerd
MenuButtons--metaInfo--resymbolicate-profile = Profiel opnieuw symboliseren
MenuButtons--metaInfo--symbolicate-profile = Profiel symboliseren
MenuButtons--metaInfo--attempting-resymbolicate = Poging tot hersymboliseren profiel
MenuButtons--metaInfo--currently-symbolicating = Profiel wordt gesymboliseerd
MenuButtons--metaInfo--cpu-model = CPU-model:
MenuButtons--metaInfo--cpu-cores = CPU-kernen:
MenuButtons--metaInfo--main-memory = Hoofdgeheugen:
MenuButtons--index--show-moreInfo-button = Meer tonen
MenuButtons--index--hide-moreInfo-button = Minder tonen
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fysieke kern,{ $logicalCPUs } logische kern
               *[other] { $physicalCPUs } fysieke kern,{ $logicalCPUs } logische kernen
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fysieke kernen,{ $logicalCPUs } logische kern
               *[other] { $physicalCPUs } fysieke kernen,{ $logicalCPUs } logische kernen
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } fysieke kern
       *[other] { $physicalCPUs } fysieke kernen
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } logische kern
       *[other] { $logicalCPUs } logische kernen
    }
MenuButtons--metaInfo--profiling-started = Opname gestart:
MenuButtons--metaInfo--profiling-session = Opnameduur:
MenuButtons--metaInfo--main-process-started = Hoofdproces gestart:
MenuButtons--metaInfo--main-process-ended = Hoofdproces beëindigd:
MenuButtons--metaInfo--file-name = Bestandsnaam:
MenuButtons--metaInfo--file-size = Bestandsgrootte:
MenuButtons--metaInfo--interval = Interval:
MenuButtons--metaInfo--buffer-capacity = Buffercapaciteit:
MenuButtons--metaInfo--buffer-duration = Bufferduur:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } seconde
       *[other] { $configurationDuration } seconden
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Onbeperkt
MenuButtons--metaInfo--application = Toepassing
MenuButtons--metaInfo--name-and-version = Naam en versie:
MenuButtons--metaInfo--application-uptime = Uptime:
MenuButtons--metaInfo--update-channel = Updatekanaal:
MenuButtons--metaInfo--build-id = Build-ID:
MenuButtons--metaInfo--build-type = Buildtype:
MenuButtons--metaInfo--arguments = Argumenten:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debuggen
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Platform
MenuButtons--metaInfo--device = Apparaat:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Besturingssysteem:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Visuele statistieken
MenuButtons--metaInfo--speed-index = Snelheidsindex:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual-snelheidsindex:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful-snelheidsindex:
MenuButtons--metaInfo-renderRowOfList-label-features = Functies:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Threadsfilter:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensies:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = { -profiler-brand-short-name }-overhead
MenuButtons--metaOverheadStatistics-mean = Gemiddeld
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
    .title = Tijd om alle threads te bemonsteren.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Opschonen
    .title = Tijd om verlopen gegevens te wissen.
MenuButtons--metaOverheadStatistics-statkeys-counter = Teller
    .title = Tijd om alle tellers te verzamelen.
MenuButtons--metaOverheadStatistics-statkeys-interval = Interval
    .title = Waargenomen interval tussen twee monsters.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Vergrendelingen
    .title = Tijd om de vergrendeling te verkrijgen voordat wordt bemonsterd.
MenuButtons--metaOverheadStatistics-overhead-duration = Overheadduur:
MenuButtons--metaOverheadStatistics-overhead-percentage = Overheadpercentage:
MenuButtons--metaOverheadStatistics-profiled-duration = Geprofileerde duur:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Verborgen threads opnemen
MenuButtons--publish--renderCheckbox-label-include-other-tabs = De gegevens van andere tabbladen opnemen
MenuButtons--publish--renderCheckbox-label-hidden-time = Verborgen tijdsbereik opnemen
MenuButtons--publish--renderCheckbox-label-include-screenshots = Schermafdrukken opnemen
MenuButtons--publish--renderCheckbox-label-resource = Hulpbron-URL’s en -paden opnemen
MenuButtons--publish--renderCheckbox-label-extension = Extensie-informatie opnemen
MenuButtons--publish--renderCheckbox-label-preference = Voorkeurswaarden opnemen
MenuButtons--publish--renderCheckbox-label-private-browsing = De gegevens van privénavigatievensters opnemen
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Dit profiel bevat privénavigatiegegevens
MenuButtons--publish--reupload-performance-profile = Prestatieprofiel opnieuw uploaden
MenuButtons--publish--share-performance-profile = Prestatieprofiel delen
MenuButtons--publish--info-description = Upload uw profiel en maak het met de koppeling toegankelijk voor iedereen.
MenuButtons--publish--info-description-default = Standaard worden uw persoonlijke gegevens verwijderd.
MenuButtons--publish--info-description-firefox-nightly2 = Dit profiel is van { -firefox-nightly-brand-name }, dus standaard worden de meeste gegevens opgenomen.
MenuButtons--publish--include-additional-data = Aanvullende gegevens die identificeerbaar kunnen zijn toevoegen
MenuButtons--publish--button-upload = Uploaden
MenuButtons--publish--upload-title = Profiel uploaden…
MenuButtons--publish--cancel-upload = Uploaden annuleren
MenuButtons--publish--message-something-went-wrong = O jee, er is iets misgegaan bij het uploaden van het profiel.
MenuButtons--publish--message-try-again = Opnieuw proberen
MenuButtons--publish--download = Downloaden
MenuButtons--publish--compressing = Comprimeren…
MenuButtons--publish--error-while-compressing = Fout bij comprimeren. Probeer enkele selectievakjes uit te schakelen om de profielgrootte te verkleinen.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Netwerken filteren:
    .title = Alleen netwerkverzoeken tonen die overeenkomen met een bepaalde naam

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

PanelSearch--search-field-hint = Wist u dat u een komma (,) kunt gebruiken om met meerdere termen te zoeken?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = De profielnaam bewerken
ProfileName--edit-profile-name-input =
    .title = De profielnaam bewerken
    .aria-label = Profielnaam

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Verwijderen
    .title = Klik hier om het profiel { $smallProfileName } te verwijderen

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Er is een fout opgetreden bij het verwijderen van dit profiel. <a>Wijs met uw muis aan voor meer info.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = { $profileName } verwijderen
ProfileDeletePanel--dialog-confirmation-question =
    Weet u zeker dat u de geüploade gegevens voor dit profiel wilt verwijderen? Eerder
    gedeelde koppelingen zullen niet meer werken.
ProfileDeletePanel--dialog-cancel-button =
    .value = Annuleren
ProfileDeletePanel--dialog-delete-button =
    .value = Verwijderen
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Verwijderen…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = De geüploade gegevens zijn succesvol verwijderd.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Volledig bereik ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Profiel importeren en verwerken…
ProfileLoaderAnimation--loading-unpublished = Profiel rechtstreeks vanuit { -firefox-brand-name } importeren…
ProfileLoaderAnimation--loading-from-file = Het bestand lezen en het profiel verwerken…
ProfileLoaderAnimation--loading-local = Nog niet geïmplementeerd.
ProfileLoaderAnimation--loading-public = Het profiel downloaden en verwerken…
ProfileLoaderAnimation--loading-from-url = Het profiel downloaden en verwerken…
ProfileLoaderAnimation--loading-compare = Profielen lezen en verwerken…
ProfileLoaderAnimation--loading-view-not-found = Weergave niet gevonden

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Terug naar startpagina

## Root

Root--error-boundary-message =
    .message = Oh-oh, er is een onbekende fout op profiler.firefox.com opgetreden.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Toepassen…
ServiceWorkerManager--pending-button = Toepassen en opnieuw laden
ServiceWorkerManager--installed-button = De toepassing opnieuw laden
ServiceWorkerManager--updated-while-not-ready =
    Er is een nieuwe versie van de toepassing toegepast voordat deze pagina
    volledig was geladen. U kunt verstoringen zien.
ServiceWorkerManager--new-version-is-ready = Een nieuwe versie van de toepassing is gedownload en klaar voor gebruik.
ServiceWorkerManager--hide-notice-button =
    .title = Melding opnieuw laden verbergen
    .aria-label = Melding opnieuw laden verbergen

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Alle frames
    .title = De stackframes niet filteren
StackSettings--implementation-script = Script
    .title = Alleen de stackframes gerelateerd aan scriptuitvoering tonen
StackSettings--implementation-native2 = Ingebouwd
    .title = Alleen de stackframes voor ingebouwde code tonen
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Stacks filteren:
StackSettings--use-data-source-label = Gegevensbron:
StackSettings--call-tree-strategy-timing = Timings
    .title = Samenvatting over de tijd met gebruikmaking van bemonsterde stacks van uitgevoerde code
StackSettings--call-tree-strategy-js-allocations = JavaScript-allocaties
    .title = Samenvatting met gebruikmaking van gealloceerde bytes JavaScript (geen de-allocaties)
StackSettings--call-tree-strategy-native-retained-allocations = Behouden geheugen
    .title = Samenvatting met gebruikmaking van bytes geheugen die zijn gealloceerd en nooit vrijgemaakt in de huidige voorbeeldselectie
StackSettings--call-tree-native-allocations = Gealloceerd geheugen
    .title = Samenvatting met gebruikmaking van gealloceerde bytes geheugen
StackSettings--call-tree-strategy-native-deallocations-memory = Gede-alloceerd geheugen
    .title = Samenvatting met gebruikmaking van bytes gede-alloceerd geheugen, per website waaraan het geheugen was gealloceerd
StackSettings--call-tree-strategy-native-deallocations-sites = Deallocatie van websites
    .title = Samenvatting aan de hand van de gedealloceerde bytes geheugenruimte, per website waarvan de geheugenruimte was gedealloceerd.
StackSettings--invert-call-stack = Aanroepstack omkeren
    .title = Sorteren op de tijd die in een aanroepnode wordt besteed, waarbij onderliggende nodes worden genegeerd
StackSettings--show-user-timing = Gebruikerstiming tonen
StackSettings--use-stack-chart-same-widths = Voor elke stack dezelfde breedte gebruiken
StackSettings--panel-search =
    .label = Stacks filteren:
    .title = Alleen stacks tonen die een functie bevatten waarvan de naam overeenkomt met deze substring

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Aanroepstructuur
TabBar--flame-graph-tab = Vlamgrafiek
TabBar--stack-chart-tab = Stackdiagram
TabBar--marker-chart-tab = Markeringsdiagram
TabBar--marker-table-tab = Markeringstabel
TabBar--network-tab = Netwerk
TabBar--js-tracer-tab = JS-tracer

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Alle tabbladen en vensters

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Alleen dit proces tonen
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Alleen ‘{ $trackName }’ tonen
TrackContextMenu--hide-other-screenshots-tracks = Andere schermafdruktracks verbergen
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = ‘{ $trackName }’ verbergen
TrackContextMenu--show-all-tracks = Alle tracks tonen
TrackContextMenu--show-local-tracks-in-process = Alle tracks in dit proces tonen
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Alle tracks van het type ‘{ $type }’ verbergen
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Alle overeenkomende tracks tonen
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Alle overeenkomende tracks verbergen
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Geen resultaten gevonden voor ‘<span>{ $searchFilter }</span>’
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Track verbergen
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Proces verbergen

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = relatief geheugen op dit moment
TrackMemoryGraph--memory-range-in-graph = geheugenbereik in grafiek
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = toewijzingen en verwijderde toewijzingen sinds de vorige steekproef

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
    .label = Vermogen
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Vermogen
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Vermogen
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Gemiddeld vermogen in de huidige selectie
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Gemiddeld vermogen in de huidige selectie
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Gemiddeld vermogen in de huidige selectie
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energie gebruikt in het zichtbare gebied
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energie gebruikt in het zichtbare bereik
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energie gebruikt in het zichtbare bereik
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energie gebruikt in het zichtbare bereik
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energie gebruikt in de huidige selectie
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energie gebruikt in de huidige selectie
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energie gebruikt in de huidige selectie
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energie gebruikt in de huidige selectie

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
TrackBandwidthGraph--speed = { $value } per seconde
    .label = Overzetsnelheid voor deze opname
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = lees/schrijf-uitvoeringen sinds de laatste opname
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Overgezette gegevens tot nu toe
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Overgezette gegevens in het zichtbare bereik
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Overgezette gegevens in de huidige selectie

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Voer filtertermen in
    .title = Alleen tracks tonen die overeenkomen met een bepaalde tekst

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
TransformNavigator--complete = Volledige ‘{ $item }’
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Samenvouwen: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Node focussen: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Focussen: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Focuscategorie: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Node samenvoegen: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Samenvoegen: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Droppen: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Recursie samenvouwen: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Alleen directe recursie samenvouwen: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Subtree samenvouwen: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Samples buiten markeringen overeenkomend met ‘{ $item }’ buiten beschouwing laten

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Wachten op { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Wachten op { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Broncode niet beschikbaar
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Zie <a>issue #3741</a> voor ondersteunde scenario’s en geplande verbeteringen.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Samenstellingscode niet beschikbaar
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Zie <a>issue #4520</a> voor ondersteunde scenario’s en geplande verbeteringen.
SourceView--close-button =
    .title = Bronweergave sluiten

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Er is geen bekende cross-origin-toegankelijke URL voor dit bestand.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Er is een netwerkfout opgetreden bij het ophalen van de URL { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Kan de symboliserings-API van de browser niet opvragen: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = De symboliserings-API van de browser heeft een fout teruggestuurd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = De symboliserings-API van de lokale symboolserver heeft een fout teruggestuurd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = De symboliserings-API van de browser heeft een misvormd antwoord teruggestuurd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = De symboliserings-API van de lokale symboolserver heeft een misvormd antwoord teruggestuurd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Het bestand { $pathInArchive } is niet gevonden in het archief van { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Het archief op { $url } kan niet worden ontleed: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = De browser kon het bronbestand voor { $url } met sourceUuid { $sourceUuid } niet verkrijgen: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = De samenstellingsweergave tonen
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = De samenstellingsweergave verbergen
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Vorige
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Volgende
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = { $current } van { $total }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Geüploade opnamen
