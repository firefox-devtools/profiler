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

AppViewRouter--error-message-unpublished =
    .message = Det gick inte att hämta profilen från { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Det gick inte att läsa filen eller analysera profilen i den.
AppViewRouter--error-message-local =
    .message = Inte implementerat än.
AppViewRouter--error-message-public =
    .message = Det gick inte att ladda ner profilen.
AppViewRouter--error-message-from-url =
    .message = Det gick inte att ladda ner profilen.
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
CallNodeContextMenu--expand-all = Expandera alla
CallNodeContextMenu--copy-function-name = Kopiera funktionsnamn
CallNodeContextMenu--copy-script-url = Kopiera skript-URL
CallNodeContextMenu--copy-stack = Kopiera stack

## CallTree
## This is the component for Call Tree panel.


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
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> synliga spår

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
Home--addon-button = Installera tillägg
Home--addon-button-instructions =
    Installera tillägget Gecko Profiler för att börja spela in en prestandaprofil
    i { -firefox-brand-name }, analysera den sedan och dela den med profiler.firefox.com.
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

MarkerContextMenu--copy-description = Kopiera beskrivning
MarkerContextMenu--copy-call-stack = Kopiera anropsstack
MarkerContextMenu--copy-url = Kopiera URL
MarkerContextMenu--copy-full-payload = Kopiera full nyttolast

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


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

MenuButtons--metaOverheadStatistics-mean = Medel
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-extension = Inkludera tilläggsinformation
MenuButtons--publish--renderCheckbox-label-preference = Inkludera preferensvärden
MenuButtons--publish--reupload-performance-profile = Ladda upp prestandaprofilen igen
MenuButtons--publish--share-performance-profile = Dela prestandaprofil
MenuButtons--publish--info-description = Ladda upp din profil och gör den tillgänglig för alla med länken.
MenuButtons--publish--info-description-default = Som standard tas dina personuppgifter bort.
MenuButtons--publish--button-upload = Ladda upp
MenuButtons--publish--upload-title = Laddar upp profil...
MenuButtons--publish--cancel-upload = Avbryt uppladdning
MenuButtons--publish--message-try-again = Försök igen
MenuButtons--publish--download = Hämta
MenuButtons--publish--compressing = Komprimerar...

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Ta bort
    .title = Klicka här för att ta bort profil { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Importerar profilen direkt från { -firefox-brand-name }...
ProfileLoaderAnimation--loading-message-from-file =
    .message = Läser fil och bearbetar profil...
ProfileLoaderAnimation--loading-message-local =
    .message = Inte implementerat än.
ProfileLoaderAnimation--loading-message-public =
    .message = Laddar ner och bearbetar profil...
ProfileLoaderAnimation--loading-message-from-url =
    .message = Laddar ner och bearbetar profil...
ProfileLoaderAnimation--loading-message-compare =
    .message = Läser och bearbetar profil...
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Vy hittades inte

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Tillbaka till hem

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installerar…
ServiceWorkerManager--pending-button = Applicera och ladda om
ServiceWorkerManager--installed-button = Ladda om applikationen
ServiceWorkerManager--new-version-is-ready = En ny version av applikationen har laddats ner och är redo att användas.

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Alla stackar
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Ursprunglig
StackSettings--use-data-source-label = Datakälla:

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Anropsträd
TabBar--network-tab = Nätverk

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Visa endast denna processgrupp
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Visa endast "{ $trackName }"
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Dölj "{ $trackName }"
TrackContextMenu--show-all-tracks = Visa alla spår

## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms

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

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Uppladdade inspelningar
