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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> – <subheader>Web-app voor prestatieanalyse van { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Naar onze Git-repository (deze wordt in een nieuw venster geopend)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-unpublished = Kan het profiel niet ophalen van { -firefox-brand-name }.
AppViewRouter--error-from-file = Kan het bestand niet lezen of het profiel erin ontleden.
AppViewRouter--error-local = Nog niet geïmplementeerd.
AppViewRouter--error-public = Kan het profiel niet downloaden.
AppViewRouter--error-from-url = Kan het profiel niet downloaden.
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

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

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
CallNodeContextMenu--transform-collapse-direct-recursion = Directe recursie samenvouwen
    .title =
        Als u directe recursie samenvouwt, worden alle aanroepen die herhaaldelijk naar
        dezelfde functie terugvallen verwijderd.
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

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Looptijd (ms)
    .title =
        De ‘totale’ looptijd bevat een samenvatting van alle tijd waarin deze
        functie zich on de stack bevond. Dit omvat de tijd waarin de
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
    .title = Sommige aanroepen naar { $callFunction } zijn inline door de compiler geplaatst.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (inline geplaatst)
    .title = Aanroepen naar { $calledFunction } zijn inline in { $outerFunction } geplaatst door de compiler.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selecteer een node om informatie erover te tonen.

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

## Footer Links

FooterLinks--legal = Juridisch
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Grafiektype:
FullTimeline--categories-with-cpu = Categorieën met CPU
FullTimeline--categories = Categorieën
FullTimeline--stack-height = Stackhoogte
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
    Klik op SHIFT om de gegevens in profiler.firefox.com te laden.
Home--instructions-title = Profielen bekijken en opnemen
Home--instructions-content =
    Het opnemen van prestatieprofielen vereist <a>{ -firefox-brand-name }</a>.
    Bestaande profielen kunnen echter bekeken worden in elke moderne browser.
Home--record-instructions-start-stop = Profileren stoppen en starten
Home--record-instructions-capture-load = Profiel vastleggen en laden
Home--profiler-motto = Leg een prestatieprofiel vast. Analyseer het. Deel het. Maak het internet sneller.
Home--additional-content-title = Bestaande profielen laden
Home--additional-content-content = U kunt een profielbestand hierheen <strong>verslepen</strong> om het te laden, of:
Home--compare-recordings-info = U kunt ook opnamen vergelijken. <a>De vergelijkingsinterface openen.</a>
Home--recent-uploaded-recordings-title = Onlangs geüploade opnamen

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
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
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
MarkerContextMenu--copy-full-payload = Volledige payload kopiëren

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Markeringen filteren:
    .title = Alleen markeringen tonen die overeenkomen met een bepaalde naam

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selecteer een markering om informatie erover te tonen.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Start
MarkerTable--duration = Duur
MarkerTable--type = Type
MarkerTable--description = Beschrijving

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
MenuButtons--index--docs = Documenten
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
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } fysieke kern
       *[other] { $physicalCPUs } fysieke kernen
    },{ $logicalCPUs ->
        [one] { $logicalCPUs } logische kern
       *[other] { $logicalCPUs } logische kernen
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
MenuButtons--metaInfo--recording-started = Opname gestart:
MenuButtons--metaInfo--interval = Interval:
MenuButtons--metaInfo--profile-version = Profielversie:
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
MenuButtons--metaInfo--update-channel = Updatekanaal:
MenuButtons--metaInfo--build-id = Build-ID:
MenuButtons--metaInfo--build-type = Buildtype:

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
MenuButtons--publish--renderCheckbox-label-hidden-time = Verborgen tijdsbereik opnemen
MenuButtons--publish--renderCheckbox-label-include-screenshots = Schermafdrukken opnemen
MenuButtons--publish--renderCheckbox-label-resource = Hulpbron-URL’s en -paden opnemen
MenuButtons--publish--renderCheckbox-label-extension = Extensie-informatie opnemen
MenuButtons--publish--renderCheckbox-label-preference = Voorkeurswaarden opnemen
MenuButtons--publish--reupload-performance-profile = Prestatieprofiel opnieuw uploaden
MenuButtons--publish--share-performance-profile = Prestatieprofiel delen
MenuButtons--publish--info-description = Upload uw profiel en maak het met de koppeling toegankelijk voor iedereen.
MenuButtons--publish--info-description-default = Standaard worden uw persoonlijke gegevens verwijderd.
MenuButtons--publish--info-description-firefox-nightly = Dit profiel is van { -firefox-nightly-brand-name }, dus standaard worden alle gegevens opgenomen.
MenuButtons--publish--include-additional-data = Aanvullende gegevens die identificeerbaar kunnen zijn toevoegen
MenuButtons--publish--button-upload = Uploaden
MenuButtons--publish--upload-title = Profiel uploaden…
MenuButtons--publish--cancel-upload = Uploaden annuleren
MenuButtons--publish--message-something-went-wrong = O jee, er is iets misgegaan bij het uploaden van het profiel.
MenuButtons--publish--message-try-again = Opnieuw proberen
MenuButtons--publish--download = Downloaden
MenuButtons--publish--compressing = Comprimeren…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Netwerken filteren:
    .title = Alleen netwerkverzoeken tonen die overeenkomen met een bepaalde naam

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Wist u dat u een komma (,) kunt gebruiken om met meerdere termen te zoeken?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Verwijderen
    .title = Klik hier om het profiel { $smallProfileName } te verwijderen

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Volledig bereik

## Profile Loader Animation

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

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installeren…
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

StackSettings--implementation-all-stacks = Alle stacks
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Ingebouwd
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

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Alleen deze procesgroep tonen
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
# This is used in the tracks context menu as a button to show all the tracks
# below it.
TrackContextMenu--show-all-tracks-below = Alle tracks hieronder tonen
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Geen resultaten gevonden voor ‘<span>{ $searchFilter }</span>’

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
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = Recursie samenvouwen: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Subtree samenvouwen: { $item }

## Source code view in a box at the bottom of the UI.

# Displayed while the source view is waiting for the network request which
# delivers the source code.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Wachten op { $host }…
# Displayed whenever the source view was not able to get the source code for
# a file.
SourceView--source-not-available-title = Bron niet beschikbaar
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Zie <a>issue #3741</a> voor ondersteunde scenario’s en geplande verbeteringen.
# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Er is geen bekende cross-origin-toegankelijke URL voor dit bestand.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Er is een netwerkfout opgetreden bij het ophalen van de URL { $url }: { $networkErrorMessage }
SourceView--close-button =
    .title = Bronweergave sluiten

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Geüploade opnamen
