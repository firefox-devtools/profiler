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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> – <subheader>Web-App zur Leistungsanalyse von { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Besuchen Sie unser Git-Repository (öffnet sich in einem neuen Fenster)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Das Profil von { -firefox-brand-name } konnte nicht abgerufen werden.
AppViewRouter--error-message-from-file =
    .message = Die Datei konnte nicht gelesen oder das darin enthaltene Profil nicht verarbeitet werden.
AppViewRouter--error-message-local =
    .message = Noch nicht implementiert.
AppViewRouter--error-message-public =
    .message = Das Profil konnte nicht heruntergeladen werden.
AppViewRouter--error-message-from-url =
    .message = Das Profil konnte nicht heruntergeladen werden.
AppViewRouter--route-not-found--home =
    .specialMessage = Die URL, die Sie erreichen wollten, wurde nicht erkannt.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Funktion zusammenführen
    .title =
        Wenn Sie eine Funktion zusammenführen, wird sie aus dem Profil entfernt und ihre Laufzeit wird der
        Funktion hinzugefügt, von der sie aufgerufen wurde. Dies geschieht überall da, wo die Funktion
        im Baum aufgerufen wurde.
CallNodeContextMenu--transform-merge-call-node = Nur Knoten zusammenführen
    .title =
        Wenn Sie einen Knoten zusammenführen, wird sie aus dem Profil entfernt und ihre Laufzeit wird dem Knoten der
        Funktion hinzugefügt, von der sie aufgerufen wurde. Die Funktion wird nur aus diesem Teil
        des Baums entfernt. Alle anderen Orten, von denen aus die Funktion aufgerufen wurde,
        verbleiben im Profil.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Der Fokus auf eine Funktion entfernt jede Teilmenge, die diese Funktion nicht enthält.
    Außerdem wird eine neue Wurzel für den Aufrufbau festgelegt, sodass die Funktion
    die einzige Wurzel des Baumes ist. dies kann mehrere Aufruforte einer Funktion
    in einem Profil zu einem Aufrufknoten vereinen.
CallNodeContextMenu--transform-focus-function = Auf Funktion fokussieren
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Auf Funktion fokussieren (invertiert)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Nur auf Unterbaum konzentrieren
    .title =
        Der Fokus auf einen Unterbaum entfernt jede Teilmenge, die diesen
        Teil des Aufrufbaums nicht enthält. Es wird ein Ast aus dem Aufrufbaum gezogen, jedoch nur für diesen einen Aufrufknoten. Alle
        anderen Aufrufe der Funktion werden ignoriert.
CallNodeContextMenu--transform-collapse-function-subtree = Funktion einklappen
    .title =
        Wenn eine Funktion eingeklappt wird, werden alle Aufrufe durch diese Funktion entfernt
        und die Zeit wird komplett der Funktion zugewiesen. Dies kann helfen, ein Profil zu vereinfachen,
        das Code aufruft, der nicht analysiert werden muss.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = <strong>{ $nameForResource }</strong> einklappen
    .title =
        Wenn eine Ressource eingeklappt wird, werden alle Aufrufe dieser 
        Ressource in einen einzigen eingeklappten Aufrufknoten umgewandelt.
CallNodeContextMenu--transform-collapse-direct-recursion = Direkte Rekursion einklappen
    .title =
        Einklappen der direkten Rekursion entfernt Aufrufe, die wiederholt
        in dieselbe Funktion rekurrieren.
CallNodeContextMenu--transform-drop-function = Teilmengen mit dieser Funktion verwerfen
    .title =
        Wenn Teilmengen verworfen werden, wird ihre Zeit aus dem Profil entfernt. Dies ist hilfreich,
        wenn Laufzeitinformationen entfernt werden sollen, die für die Analyse nicht relevant sind.
CallNodeContextMenu--expand-all = Alle ausklappen
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Name der Funktion auf Searchfox nachschlagen
CallNodeContextMenu--copy-function-name = Funktionsname kopieren
CallNodeContextMenu--copy-script-url = Skript-URL kopieren
CallNodeContextMenu--copy-stack = Stapel kopieren

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Laufzeit (ms)
    .title =
        Zur „gesamten“ Laufzeit gehört eine Zusammenfassung der Zeit, in der
        diese Funktion im Stack auffindbar war. Dazu gehört auch die Zeit,
        in der die Funktion ausgeführt wurde und die Zeit, die die Aufrufer
        dieser Funktion gebraucht haben.
CallTree--tracing-ms-self = Eigene (ms)
    .title =
        Die „eigene“ Zeit ist nur die Zeit, in der die Funktion das Ende
        des Stacks war. Wenn diese Funktion andere Funktionen aufgerufen hat, wird die Zeit der „anderen“ Funktionen nicht mitgezählt. Die
        „eigene“ Zeit ist hilfreich, um zu verstehen, wie viel Zeit wirklich in einem Programm verbraucht wurde.
CallTree--samples-total = Gesamt (Teilmengen)
    .title =
        Zur „gesamten“ Laufzeit der Teilmengen gehört eine Zusammenfassung aller Teilmengen, in der
        diese Funktion im Stack auffindbar war. Dazu gehört auch die Zeit,
        in der die Funktion ausgeführt wurde und die Zeit, die die Aufrufer
        dieser Funktion gebraucht haben.
CallTree--samples-self = Eigene
    .title =
        Die „eigene“ Zeit sind nur die Teilmengen, in denen die Funktion das Ende
        des Stacks war. Wenn diese Funktion andere Funktionen aufgerufen hat, wird die Zeit der „anderen“ Funktionen nicht mitgezählt. Die
        „eigene“ Zeit ist hilfreich, um zu verstehen, wie viel Zeit wirklich in einem Programm verbraucht wurde.
CallTree--bytes-total = Gesamtgröße (Bytes)
    .title =
        Zur „Gesamtgröße“ gehört eine Zusammenfassung alles Bytes, die alloziert oder freigegeben wurden, während diese Funktion sich im Stack befand. Dazu
        gehören die Bytes von der Ausführung der Funktion und die
        Bytes der Funktionen, die sie aufgerufen haben.
CallTree--bytes-self = Eigene (Bytes)
    .title =
        Zu den „eigenen“ Bytes gehören die Bytes, die alloziert oder freigegeben wurden, während diese Funktion sich am Ende des Stacks befand. Wenn diese Funktion
        andere Funktionen aufgerufen hat, werden die Bytes diese „anderen“ Funktionen nicht mitgezählt.
        Die „eigenen“ Bytes sind hilfreich, um zu verstehen, wo Speicherplatz im Programm alloziert oder freigegeben wurde.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Wählen Sie einen Knoten aus, um Informationen darüber anzuzeigen.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Geben Sie die Profil-URLs ein, die Sie vergleichen möchten
CompareHome--instruction-content =
    Das Werkzeug extrahiert die Daten aus dem ausgewählten Track und Bereich für
    jedes Profil und stellt beide gleichartig dar, um den Vergleich zu vereinfachen.
CompareHome--form-label-profile1 = Profil 1:
CompareHome--form-label-profile2 = Profil 2:
CompareHome--submit-button =
    .value = Profile abrufen

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Dieses Profil wurde in einem Build ohne Release-Optimierungen aufgezeichnet.
        Leistungsmessungen gelten möglicherweise nicht für die Release-Population.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Sidebar öffnen
Details--close-sidebar-button =
    .title = Sidebar schließen
Details--error-boundary-message =
    .message = Oh, oh, in diesem Panel ist ein unbekannter Fehler aufgetreten.

## Footer Links

FooterLinks--legal = Rechtliches
FooterLinks--Privacy = Datenschutz
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Graphentyp:
FullTimeline--categories-with-cpu = Kategorien mit CPU
FullTimeline--categories = Kategorien
FullTimeline--stack-height = Höhe des Stacks
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> Tracks sichtbar

## Home page

Home--upload-from-file-input-button = Profil aus Datei laden
Home--upload-from-url-button = Profil von URL laden
Home--load-from-url-submit-button =
    .value = Laden
Home--documentation-button = Dokumentation
Home--menu-button = { -profiler-brand-name }-Menüschaltfläche aktivieren
Home--menu-button-instructions =
    Aktivieren Sie die Profiler-Menüschaltfläche, um Leistung in einem Profil von { -firefox-brand-name }
    aufzuzeichnen, dann analysieren Sie sie und teilen Sie das Ergebnis auf profiler.firefox.com.
Home--addon-button = Add-on installieren
Home--addon-button-instructions =
    Installieren Sie das Gecko-Profiler-Add-on, um Leistung in einem Profil von { -firefox-brand-name }
    aufzuzeichnen, dann analysieren Sie sie und teilen Sie das Ergebnis auf profiler.firefox.com.
Home--record-instructions =
    Um die Profilerstellung zu starten, klicken Sie auf die Schaltfläche Profilerstellung oder verwenden Sie die
    Tastatürkürzel. Das Symbol ist blau, wenn ein Profil aufzeichnet.
    Drücken Sie <kbd>Aufzeichnen</kbd>, um die Daten in profiler.firefox.com zu laden.
Home--instructions-title = So können Sie Profile anzeigen und aufzeichnen
Home--instructions-content =
    Das Aufzeichnen von Leistungsprofilen benötigt <a>{ -firefox-brand-name }</a>.
    Vorhandene Profile können jedoch in jedem modernen Browser angezeigt werden.
Home--record-instructions-start-stop = Profilerstellung stoppen und starten
Home--record-instructions-capture-load = Profil aufzeichnen und laden
Home--profiler-motto = Zeichnen Sie ein Leistungsprofil auf. Analysieren Sie es. Teilen Sie es. Machen Sie das Web schneller.
Home--additional-content-title = Bestehende Profile laden
Home--additional-content-content = Sie können eine Profildatei per <strong>Ziehen und Ablegen</strong> hierher bewegen, um sie zu laden, oder:
Home--compare-recordings-info = Sie können auch Aufnahmen vergleichen. <a>Öffnen Sie die Vergleichsschnittstelle.</a>
Home--recent-uploaded-recordings-title = Kürzlich hochgeladene Aufzeichnungen

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Filterbegriffe eingeben

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Nur eigene Zeit anzeigen
    .title = Zeigt nur die Zeit in einem Aufrufknoten an, ohne seine Unterpunkte

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Klicken Sie hier, um das Profil „{ $smallProfileName }“ zu laden
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Löschen
    .title = Dieses Profil kann nicht gelöscht werden, weil die Berechtigung fehlt.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Es wurde noch kein Profil hochgeladen!
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Sehen und verwalten Sie alle Ihre Aufzeichnungen ({ $profilesRestCount } weitere)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Dieses Aufzeichnung verwalten
       *[other] Dieses Aufzeichnungen verwalten
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Auswahl aus Markierdauer festlegen
MarkerContextMenu--start-selection-here = Auswahl hier beginnen
MarkerContextMenu--end-selection-here = Auswahl hier beenden
MarkerContextMenu--start-selection-at-marker-start = Auswahl am <strong>Beginn</strong> der Markierung beginnen
MarkerContextMenu--start-selection-at-marker-end = Auswahl am <strong>Ende</strong> der Markierung beginnen
MarkerContextMenu--end-selection-at-marker-start = Auswahl am <strong>Beginn</strong> der Markierung beenden
MarkerContextMenu--end-selection-at-marker-end = Auswahl am <strong>Ende</strong> der Markierung beenden
MarkerContextMenu--copy-description = Beschreibung kopieren
MarkerContextMenu--copy-call-stack = Aufrufstack kopieren
MarkerContextMenu--copy-url = URL kopieren
MarkerContextMenu--copy-full-payload = Vollständige Nutzlast kopieren

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtermarkierungen:
    .title = Nur Markierungen anzeigen, die zu einem bestimmten Namen passen

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Wählen Sie eine Markierung aus, um Informationen darüber anzuzeigen.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Beginn
MarkerTable--duration = Dauer
MarkerTable--type = Typ
MarkerTable--description = Beschreibung

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profilinformationen
MenuButtons--index--full-view = Vollständige Ansicht
MenuButtons--index--cancel-upload = Hochladen abbrechen
MenuButtons--index--share-upload =
    .label = Lokales Profil hochladen
MenuButtons--index--share-re-upload =
    .label = Erneut hochladen
MenuButtons--index--share-error-uploading =
    .label = Fehler beim Hochladen
MenuButtons--index--revert = Auf Originalprofil zurücksetzen
MenuButtons--index--docs = Dokumentation
MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Hochgeladen:
MenuButtons--index--profile-info-uploaded-actions = Löschen
MenuButtons--index--metaInfo-subtitle = Profilinformationen
MenuButtons--metaInfo--symbols = Symbole:
MenuButtons--metaInfo--profile-symbolicated = Profil ist symbolisiert
MenuButtons--metaInfo--profile-not-symbolicated = Profil ist nicht symbolisiert
MenuButtons--metaInfo--resymbolicate-profile = Profil erneut symbolisieren
MenuButtons--metaInfo--symbolicate-profile = Profil symbolisieren
MenuButtons--metaInfo--attempting-resymbolicate = Versuch, das Profil erneut zu symbolisieren
MenuButtons--metaInfo--currently-symbolicating = Profil wird aktuell symbolisiert
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } physischer Kern
       *[other] { $physicalCPUs } physische Kerne
    },{ $logicalCPUs ->
        [one] { $logicalCPUs } logischer Kern
       *[other] { $logicalCPUs } logische Kerne
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } physischer Kern
       *[other] { $physicalCPUs } physische Kerne
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } logischer Kern
       *[other] { $logicalCPUs } logische Kerne
    }
MenuButtons--metaInfo--recording-started = Aufzeichnungsbeginn:
MenuButtons--metaInfo--interval = Intervall:
MenuButtons--metaInfo--profile-version = Profilversion:
MenuButtons--metaInfo--buffer-capacity = Pufferkapazität:
MenuButtons--metaInfo--buffer-duration = Pufferdauer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } Sekunde
       *[other] { $configurationDuration } Sekunden
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Unbegrenzt
MenuButtons--metaInfo--application = Anwendung
MenuButtons--metaInfo--name-and-version = Name und Version:
MenuButtons--metaInfo--update-channel = Update-Kanal:
MenuButtons--metaInfo--build-id = Build-ID:
MenuButtons--metaInfo--build-type = Build-Typ:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debuggen
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Betriebssystem
MenuButtons--metaInfo--device = Gerät:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Betriebssystem:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Visuelle Messwerte
MenuButtons--metaInfo--speed-index = Geschwindigkeitsindex:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual-Geschwindigkeitsindex:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Consentful-Geschwindigkeitsindex:
MenuButtons--metaInfo-renderRowOfList-label-features = Funktionen:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Threads-Filter:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Erweiterungen:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Eigenverbrauch (Overhead) von { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Mittelwert
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Eigenverbrauch
    .title = Zeit, um alle Threads zu erfassen
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Aufräumen
    .title = Zeit, um abgelaufene Daten zu verwerfen.
MenuButtons--metaOverheadStatistics-statkeys-counter = Zähler
    .title = Zeit, um alle Zähler zu sammeln
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervall
    .title = Abstand zwischen zwei Teilmengen.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Sperrungen
    .title = Zeit, um vor dem Erfassen die Ressource zu sperren
MenuButtons--metaOverheadStatistics-overhead-duration = Dauer des Eigenverbrauchs:
MenuButtons--metaOverheadStatistics-overhead-percentage = Prozentualer Anteil des Eigenverbrauchs:
MenuButtons--metaOverheadStatistics-profiled-duration = Dauer der Messung:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Einschließlich verborgener Threads
MenuButtons--publish--renderCheckbox-label-hidden-time = Dauer eingeschlossener verborgener Threads
MenuButtons--publish--renderCheckbox-label-include-screenshots = Bildschirmfotos einschließen
MenuButtons--publish--renderCheckbox-label-resource = URLs und Pfade von Ressourcen einschließen
MenuButtons--publish--renderCheckbox-label-extension = Erweiterungsinformationen einschließen
MenuButtons--publish--renderCheckbox-label-preference = Einstellungswerte einschließen
MenuButtons--publish--reupload-performance-profile = Leistungsprofil erneut hochladen
MenuButtons--publish--share-performance-profile = Leistungsprofil teilen
MenuButtons--publish--info-description = Laden Sie Ihr Profil hoch und machen Sie es mit dem Link für jeden zugänglich.
MenuButtons--publish--info-description-default = Standardmäßig werden Ihre persönlichen Daten entfernt.
MenuButtons--publish--info-description-firefox-nightly = Dieses Profil stammt von { -firefox-nightly-brand-name }, daher sind standardmäßig alle Daten enthalten.
MenuButtons--publish--include-additional-data = Zusätzliche Daten einschließen, die möglicherweise identifizierbar sind
MenuButtons--publish--button-upload = Hochladen
MenuButtons--publish--upload-title = Profil wird hochgeladen…
MenuButtons--publish--cancel-upload = Hochladen abbrechen
MenuButtons--publish--message-something-went-wrong = Oh, oh, beim Hochladen des Profils ist etwas schiefgegangen.
MenuButtons--publish--message-try-again = Erneut versuchen
MenuButtons--publish--download = Herunterladen
MenuButtons--publish--compressing = Komprimieren…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Netzwerke filtern:
    .title = Nur Netzwerkanfragen anzeigen, die zu einem bestimmten Namen passen

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Wussten Sie, dass Sie das Komma (,) verwenden können, um mit mehreren Begriffen zu suchen?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Löschen
    .title = Klicken Sie hier, um das Profil „{ $smallProfileName }“ zu löschen

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Vollständiger Bereich

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Das Profil wird direkt von { -firefox-brand-name } importiert...
ProfileLoaderAnimation--loading-message-from-file =
    .message = Datei lesen und Profil verarbeiten…
ProfileLoaderAnimation--loading-message-local =
    .message = Noch nicht implementiert.
ProfileLoaderAnimation--loading-message-public =
    .message = Profil herunterladen und verarbeiten…
ProfileLoaderAnimation--loading-message-from-url =
    .message = Profil herunterladen und bearbeiten…
ProfileLoaderAnimation--loading-message-compare =
    .message = Profile lesen und verarbeiten...
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Ansicht nicht gefunden

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Zurück zur Startseite

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installieren…
ServiceWorkerManager--pending-button = Anwenden und neu laden
ServiceWorkerManager--installed-button = Anwendung neu laden
ServiceWorkerManager--updated-while-not-ready =
    Eine neue Version dieser Anwendung wurde installiert, bevor
    die Seite vollständig geladen war. Es kann zu Fehlfunktionen kommen.
ServiceWorkerManager--new-version-is-ready = Eine neue Version der Anwendung wurde heruntergeladen und ist einsatzbereit.
ServiceWorkerManager--hide-notice-button =
    .title = Hinweis zum erneuten Laden ausblenden
    .aria-label = Hinweis zum erneuten Laden ausblenden

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Alle Stacks
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Nativ
StackSettings--use-data-source-label = Datenquelle:
StackSettings--call-tree-strategy-timing = Zeiten
    .title = Zusammenfassung erstellen mit einzelnen Stacks von im Zeitverlauf ausgeführtem Code
StackSettings--call-tree-strategy-js-allocations = JavaScript-Allokationen
    .title = Zusammenfassung erstellen mit von JavaScript-allozierten Bytes (keine Freigaben)
StackSettings--call-tree-strategy-native-retained-allocations = Zurückbehaltener Speicher
    .title = Zusammenfassung erstellen mit Speicherbytes, die alloziert wurden und in der aktuell gewählten Vorschau nie freigegeben wurden
StackSettings--call-tree-native-allocations = Allozierter Speicher
    .title = Zusammenfassung erstellen mit allozierten Speicherbytes
StackSettings--call-tree-strategy-native-deallocations-memory = Freigegebener Speicher
    .title = Zusammenfassung erstellen mit freigegebenen Speicherbytes, von der Website, auf der der Speicher alloziert wurde

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

