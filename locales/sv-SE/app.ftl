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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Webbapp för prestationsanalys av { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Gå till vårt Git-repository (detta öppnas i ett nytt fönster)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-unpublished = Det gick inte att hämta profilen från { -firefox-brand-name }.
AppViewRouter--error-from-file = Det gick inte att läsa filen eller analysera profilen i den.
AppViewRouter--error-local = Inte implementerat ännu.
AppViewRouter--error-public = Det gick inte att ladda ner profilen.
AppViewRouter--error-from-url = Det gick inte att ladda ner profilen.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    På grund av en <a>specifik begränsning i Safari</a> kan inte
    { -profiler-brand-name } importera profiler från den lokala datorn i den här webbläsaren. Öppna
    den här sidan i { -firefox-brand-name } eller Chrome istället.
    .title = Safari kan inte importera lokala profiler
AppViewRouter--route-not-found--home =
    .specialMessage = Webbadressen du försökte nå kändes inte igen.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Sammanfogningsfunktion
    .title =
        Sammanfoga en funktion tar bort det från profilen och tilldelar sin tid till
        den funktion som anropade den. Detta händer var som helst funktionen
        anropades i trädet.
CallNodeContextMenu--transform-merge-call-node = Sammanfoga endast nod
    .title =
        Sammanfoga en nod tar bort den från profilen och tilldelar sin tid till
        funktionens nod som anropade den. Den tar bara bort funktionen från
        den specifika delen av trädet. Alla andra platser där funktionen
        anropades kommer att förbli i profilen.
CallNodeContextMenu--transform-focus-function = Fokusera på funktion
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Fokus på funktion (inverterad)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Fokusera endast på underträd
    .title =
        Genom att fokusera på ett underträd kommer alla prov tas bort som inte
        innehåller den specifika delen av anropsträdet. Den tar ut en gren av
        anropsträdet, men det gör det endast för den anropsnoden. Alla andra
        anrop från funktionen ignoreras.
CallNodeContextMenu--transform-collapse-function-subtree = Fäll ihop funktion
    .title =
        Att fälla ihop en funktion kommer ta bort allt som anropas, och tilldela
        all tid till funktionen. Detta kan förenkla en profilering som
        anropar kod som inte behöver analyseras.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Fäll ihop <strong> { $nameForResource } </strong>
    .title =
        Att fälla ihop en resurs plattar ut alla anrop till den
        resursen till en enda ihopfälld anropsnod.
CallNodeContextMenu--transform-collapse-direct-recursion = Dölj direkt rekursion
    .title = Dölj direkt rekursion tar bort anrop som upprepade gånger anropar samma funktion.
CallNodeContextMenu--transform-drop-function = Ta bort prover med denna funktion
    .title = Genom att ta bort proverna kommer de tillhörande körtiderna att tas bort från profilen. Detta är användbart för att eliminera tidsinformation som inte är relevant för analysen.
CallNodeContextMenu--expand-all = Expandera alla
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Leta upp funktionsnamnet på Searchfox
CallNodeContextMenu--copy-function-name = Kopiera funktionsnamn
CallNodeContextMenu--copy-script-url = Kopiera skript-URL
CallNodeContextMenu--copy-stack = Kopiera stack

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Körningstid (ms)
    .title =
        Den "totala" körtiden innehåller en sammanfattning av hela tiden där denna
        funktion observerades vara på stacken. Detta inkluderar den tid då funktionen
        faktiskt kördes och den tid som tillbringades i anropen från den här funktionen.
CallTree--tracing-ms-self = Själv (ms)
    .title =
        "Självtiden" inkluderar tiden då funktionen var i slutet av stacken.
        Om denna funktion har anropat andra funktioner, ingår inte den
        "övriga" tiden för dessa funktioner. "Självtiden" är användbar för
        att förstå var tiden verkligen spenderas inom ett program.
CallTree--samples-total = Totalt (prov)
    .title =
        Det "totala" urvalet inkluderar en sammanfattning av alla prover där
        denna funktion observerades på stacken. Detta inkluderar den tid
        som funktionen faktiskt kördes, men också den tid som spenderas
        i de funktioner som anropas av denna funktion.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Vissa anrop till { $calledFunction } infogades av kompilatorn.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Välj en nod för att visa information om den.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Ange URL:en till den profil som du vill jämföra
CompareHome--instruction-content =
    Verktyget extraherar data från det valda spåret och intervallet för
    varje profil och lägger dem båda i samma vy för att göra dem enkla
    att jämföra.
CompareHome--form-label-profile1 = Profil 1:
CompareHome--form-label-profile2 = Profil 2:
CompareHome--submit-button =
    .value = Hämta profiler

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Öppna sidofältet
Details--close-sidebar-button =
    .title = Stäng sidofältet
Details--error-boundary-message =
    .message = Oj, några okända fel inträffade i den här panelen.

## Footer Links

FooterLinks--legal = Juridisk information
FooterLinks--Privacy = Sekretesspolicy
FooterLinks--Cookies = Kakor

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Diagramtyp:
FullTimeline--categories-with-cpu = Kategorier med CPU
FullTimeline--categories = Kategorier
FullTimeline--stack-height = Stackens höjd
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> spår

## Home page

Home--upload-from-file-input-button = Ladda en profil från fil
Home--upload-from-url-button = Ladda en profil från en URL
Home--load-from-url-submit-button =
    .value = Ladda
Home--documentation-button = Dokumentation
Home--menu-button = Aktivera { -profiler-brand-name } menyknapp
Home--menu-button-instructions =
    Aktivera profil-menyknappen för att börja spela in en prestandaprofil
    i { -firefox-brand-name }, analysera den och dela den med profiler.firefox.com.
Home--record-instructions =
    För att starta profilering, klicka på profileringsknappen eller använd
    kortkommandona. Ikonen är blå när en profil spelas in. Tryck på
    <kbd>Fånga</kbd> för att ladda data till profiler.firefox.com.
Home--instructions-title = Hur man visar och spelar in profiler
Home--instructions-content =
    För att spela in prestandaprofiler krävs <a>{ -firefox-brand-name }</a>.
    Befintliga profiler kan dock visas i vilken modern webbläsare som helst.
Home--record-instructions-start-stop = Stoppa och börja profilera
Home--record-instructions-capture-load = Spela in och ladda profil
Home--profiler-motto = Spela in en prestandaprofil. Analysera den. Dela den. Gör webben snabbare.
Home--additional-content-title = Ladda befintliga profiler
Home--additional-content-content = Du kan <strong>dra och släppa</strong> en profilfil här för att ladda den, eller:
Home--compare-recordings-info = Du kan också jämföra inspelningar.<a>Öppna gränssnitt för att jämföra.</a>
Home--recent-uploaded-recordings-title = Senast uppladdade inspelningar

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Ange filtervillkor

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Visa endast självtid
    .title = Visa endast tiden som spenderats i en anropsnod, ignorera dess underordnade.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Klicka här för att ladda profil { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Ta bort
    .title = Den här profilen kan inte tas bort eftersom vi saknar behörighetsinformation.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Ingen profil har laddats upp än!
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Se och hantera alla dina inspelningar ({ $profilesRestCount } till)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Hantera denna inspelning
       *[other] Hantera dessa inspelningar
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Ange markering från markörens varaktighet
MarkerContextMenu--start-selection-here = Starta markering här
MarkerContextMenu--end-selection-here = Avsluta markering här
MarkerContextMenu--start-selection-at-marker-start = Starta markering vid markörens <strong>start</strong>
MarkerContextMenu--start-selection-at-marker-end = Starta markering vid markörens <strong>slut</strong>
MarkerContextMenu--end-selection-at-marker-start = Avsluta markering vid markörens <strong>start</strong>
MarkerContextMenu--end-selection-at-marker-end = Avsluta markering vid markörens <strong>slut</strong>
MarkerContextMenu--copy-description = Kopiera beskrivning
MarkerContextMenu--copy-call-stack = Kopiera anropsstack
MarkerContextMenu--copy-url = Kopiera URL
MarkerContextMenu--copy-full-payload = Kopiera full nyttolast

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtermarkörer:
    .title = Visa endast markörer som matchar ett visst namn

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Välj en markör för att visa information om den.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Börja
MarkerTable--duration = Längd
MarkerTable--type = Typ
MarkerTable--description = Beskrivning

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profilinfo
MenuButtons--index--full-view = Helbild
MenuButtons--index--cancel-upload = Avbryt uppladdning
MenuButtons--index--share-upload =
    .label = Ladda upp lokal profil
MenuButtons--index--share-re-upload =
    .label = Ladda upp igen
MenuButtons--index--share-error-uploading =
    .label = Fel vid uppladdning
MenuButtons--index--revert = Återgå till originalprofil
MenuButtons--index--docs = Dokument
MenuButtons--permalink--button =
    .label = Permalänk

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Uppladdad:
MenuButtons--index--profile-info-uploaded-actions = Ta bort
MenuButtons--index--metaInfo-subtitle = Profilinformation
MenuButtons--metaInfo--symbols = Symboler:
MenuButtons--metaInfo--profile-symbolicated = Profilen är symboliserad
MenuButtons--metaInfo--profile-not-symbolicated = Profilen är inte symboliserad
MenuButtons--metaInfo--resymbolicate-profile = Symbolisera profilen igen
MenuButtons--metaInfo--symbolicate-profile = Symbolisera profil
MenuButtons--metaInfo--attempting-resymbolicate = Försöker att symbolisera profilen på nytt
MenuButtons--metaInfo--currently-symbolicating = Profilen symboliseras för närvarande
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } fysisk kärna
       *[other] { $physicalCPUs } fysiska kärnor
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } logisk kärna
       *[other] { $logicalCPUs } logiska kärnor
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } fysisk kärna
       *[other] { $physicalCPUs } fysiska kärnor
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } logisk kärna
       *[other] { $logicalCPUs } logiska kärnor
    }
MenuButtons--metaInfo--recording-started = Inspelningen startade:
MenuButtons--metaInfo--interval = Intervall:
MenuButtons--metaInfo--profile-version = Profilversion:
MenuButtons--metaInfo--buffer-capacity = Buffertkapacitet:
MenuButtons--metaInfo--buffer-duration = Buffertlängd:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } sekund
       *[other] { $configurationDuration } sekunder
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Obegränsat
MenuButtons--metaInfo--application = Applikation
MenuButtons--metaInfo--name-and-version = Namn och version:
MenuButtons--metaInfo--update-channel = Uppdateringskanal:
MenuButtons--metaInfo--build-id = Bygg-ID:
MenuButtons--metaInfo--build-type = Byggtyp:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Felsök
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Plattform
MenuButtons--metaInfo--device = Enhet:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Visuella mätvärden
MenuButtons--metaInfo--speed-index = Hastighetsindex:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual hastighetsindex:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful hastighetsindex:
MenuButtons--metaInfo-renderRowOfList-label-features = Funktioner:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Trådfilter:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Tillägg:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Omkostnad { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Medel
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Omkostnad
    .title = Tid att prova alla trådar.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Rensning
    .title = Tid för att kassera utgångna data.
MenuButtons--metaOverheadStatistics-statkeys-counter = Räknare
    .title = Dags att samla in alla räknare.
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervall
    .title = Observerat intervall mellan två prover.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Låsningar
    .title = Tid för låsning innan provtagning.
MenuButtons--metaOverheadStatistics-overhead-duration = Omkostnad varaktighet:
MenuButtons--metaOverheadStatistics-overhead-percentage = Omkostnad procent:
MenuButtons--metaOverheadStatistics-profiled-duration = Profilerad varaktighet:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Inkludera dolda trådar
MenuButtons--publish--renderCheckbox-label-hidden-time = Inkludera dolt tidsintervall
MenuButtons--publish--renderCheckbox-label-include-screenshots = Inkludera skärmdumpar
MenuButtons--publish--renderCheckbox-label-resource = Inkludera resursURLs och sökvägar
MenuButtons--publish--renderCheckbox-label-extension = Inkludera tilläggsinformation
MenuButtons--publish--renderCheckbox-label-preference = Inkludera preferensvärden
MenuButtons--publish--reupload-performance-profile = Ladda upp prestandaprofilen igen
MenuButtons--publish--share-performance-profile = Dela prestandaprofil
MenuButtons--publish--info-description = Ladda upp din profil och gör den tillgänglig för alla med länken.
MenuButtons--publish--info-description-default = Som standard tas dina personuppgifter bort.
MenuButtons--publish--info-description-firefox-nightly = Den här profilen är från { -firefox-nightly-brand-name }, så all information ingår som standard.
MenuButtons--publish--include-additional-data = Inkludera ytterligare data som kan identifieras
MenuButtons--publish--button-upload = Ladda upp
MenuButtons--publish--upload-title = Laddar upp profil...
MenuButtons--publish--cancel-upload = Avbryt uppladdning
MenuButtons--publish--message-something-went-wrong = Hoppsan, något gick fel när du laddade upp profilen.
MenuButtons--publish--message-try-again = Försök igen
MenuButtons--publish--download = Hämta
MenuButtons--publish--compressing = Komprimerar...

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrera nätverk:
    .title = Visa endast nätverksförfrågningar som matchar ett visst namn

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Visste du att du kan använda komma (,) för att söka med flera termer?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Ta bort
    .title = Klicka här för att ta bort profil { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Hela intervallet

## Profile Loader Animation

ProfileLoaderAnimation--loading-unpublished = Importerar profilen direkt från { -firefox-brand-name }...
ProfileLoaderAnimation--loading-from-file = Läser fil och bearbetar profil...
ProfileLoaderAnimation--loading-local = Inte implementerat ännu.
ProfileLoaderAnimation--loading-public = Laddar ner och bearbetar profil...
ProfileLoaderAnimation--loading-from-url = Laddar ner och bearbetar profil...
ProfileLoaderAnimation--loading-compare = Läser och bearbetar profil...
ProfileLoaderAnimation--loading-view-not-found = Vy hittades inte

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Tillbaka till hem

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installerar…
ServiceWorkerManager--pending-button = Applicera och ladda om
ServiceWorkerManager--installed-button = Ladda om applikationen
ServiceWorkerManager--updated-while-not-ready =
    En ny version av applikationen tillämpades innan den här sidan
    var helt laddad. Du kan se fel.
ServiceWorkerManager--new-version-is-ready = En ny version av applikationen har laddats ner och är redo att användas.
ServiceWorkerManager--hide-notice-button =
    .title = Dölj omladdningsmeddelandet
    .aria-label = Dölj omladdningsmeddelandet

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Alla stackar
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Ursprunglig
StackSettings--use-data-source-label = Datakälla:
StackSettings--call-tree-strategy-timing = Tidpunkter
    .title = Sammanfatta med hjälp av samplade stackar av exekverad kod över tid
StackSettings--call-tree-strategy-js-allocations = JavaScript-allokeringar
    .title = Sammanfatta med hjälp av byte av JavaScript allokerat (inga avallokeringar)
StackSettings--call-tree-strategy-native-retained-allocations = Lagrat minne
    .title = Sammanfatta med hjälp av byte av minne som tilldelades och som aldrig frigjordes i det aktuella förhandsgranskningsvalet
StackSettings--call-tree-native-allocations = Tilldelat minne
    .title = Sammanfatta med byte av tilldelat minne
StackSettings--call-tree-strategy-native-deallocations-memory = Tilldelat minne
    .title = Sammanfatta med hjälp av byte av minne som delas ut på platsen där minnet tilldelades
StackSettings--call-tree-strategy-native-deallocations-sites = Tilldelningswebbplatser
    .title = Sammanfatta med hjälp av byte av minne som delas ut efter webbplatsen där minnet tilldelades
StackSettings--invert-call-stack = Invertera anropsstack
    .title = Sortera efter tiden i en anropsnod, utan att ignorera dess barn.
StackSettings--show-user-timing = Visa användartiming
StackSettings--panel-search =
    .label = Filtrera stackar:
    .title = Visa endast stackar som innehåller en funktion vars namn matchar denna delsträng

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Anropsträd
TabBar--flame-graph-tab = Flamgraf
TabBar--stack-chart-tab = Stapeldiagram
TabBar--marker-chart-tab = Markördiagram
TabBar--marker-table-tab = Markörtabell
TabBar--network-tab = Nätverk
TabBar--js-tracer-tab = JS Tracer

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Visa endast denna processgrupp
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Visa endast "{ $trackName }"
TrackContextMenu--hide-other-screenshots-tracks = Dölj andra Skärmdump-spår
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Dölj "{ $trackName }"
TrackContextMenu--show-all-tracks = Visa alla spår
# This is used in the tracks context menu as a button to show all the tracks
# below it.
TrackContextMenu--show-all-tracks-below = Visa alla spår nedan
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Inga resultat hittades för “<span>{ $searchFilter }</span>”

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Ange filtertermer
    .title = Visa endast spår som matchar en viss text

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
TransformNavigator--complete = Slutförd “{ $item }”
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Fäll ihop: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Fokusnod: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Fokus: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Sammanfoga nod: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Sammanfoga: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Släpp: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = Dölj rekursion: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Dölj underträd: { $item }

## Source code view in a box at the bottom of the UI.

# Displayed while the source view is waiting for the network request which
# delivers the source code.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Väntar på { $host }…
# Displayed whenever the source view was not able to get the source code for
# a file.
SourceView--source-not-available-title = Källa inte tillgänglig
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Se <a>problem #3741</a> för scenarier som stöds och planerade förbättringar.
# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Det finns ingen tillgänglig webbadress för den här filen.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Det uppstod ett nätverksfel när webbadressen { $url } skulle hämtas: { $networkErrorMessage }
SourceView--close-button =
    .title = Stäng källvyn

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Uppladdade inspelningar
