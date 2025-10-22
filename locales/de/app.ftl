# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox für Android
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

AppViewRouter--error-from-post-message = Das Profil konnte nicht importiert werden.
AppViewRouter--error-unpublished = Das Profil von { -firefox-brand-name } konnte nicht abgerufen werden.
AppViewRouter--error-from-file = Die Datei konnte nicht gelesen oder das darin enthaltene Profil nicht verarbeitet werden.
AppViewRouter--error-local = Noch nicht implementiert.
AppViewRouter--error-public = Das Profil konnte nicht heruntergeladen werden.
AppViewRouter--error-from-url = Das Profil konnte nicht heruntergeladen werden.
AppViewRouter--error-compare = Die Profile konnten nicht abgerufen werden.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = Aufgrund einer <a>spezifischen Einschränkung in Safari</a> kann { -profiler-brand-name } Profile vom lokalen Computer nicht in diesem Browser importieren. Bitte öffnen Sie diese Seite stattdessen in { -firefox-brand-name } oder Chrome.
    .title = Safari kann lokale Profile nicht importieren
AppViewRouter--route-not-found--home =
    .specialMessage = Die URL, die Sie erreichen wollten, wurde nicht erkannt.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (inlined)
    .title = { $function } wurde durch den Compiler zur Inline-Funktion ihres Aufrufers.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = <strong>{ $fileName }</strong> anzeigen
CallNodeContextMenu--transform-merge-function = Funktion zusammenführen
    .title =
        Wenn Sie eine Funktion zusammenführen, wird sie aus dem Profil entfernt und ihre Laufzeit wird der
        Funktion hinzugefügt, von der sie aufgerufen wurde. Dies geschieht überall da, wo die Funktion
        im Baum aufgerufen wurde.
CallNodeContextMenu--transform-merge-call-node = Nur Knoten zusammenführen
    .title =
        Wenn Sie einen Knoten zusammenführen, wird sie aus dem Profil entfernt und ihre Laufzeit wird dem Knoten der
        Funktion hinzugefügt, von der sie aufgerufen wurde. Die Funktion wird nur aus diesem Teil
        des Baums entfernt. Alle anderen Orte, von denen aus die Funktion aufgerufen wurde,
        verbleiben im Profil.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Der Fokus auf eine Funktion entfernt jede Teilmenge, die diese Funktion nicht enthält.
    Außerdem wird eine neue Wurzel für den Aufrufbaum festgelegt, sodass die Funktion
    die einzige Wurzel des Baumes ist. Dies kann mehrere Aufruforte einer Funktion
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
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Fokus auf Kategorie <strong>{ $categoryName }</strong>
    .title =
        Fokus auf die Knoten, die zur selben Kategorie wie der ausgewählte Knoten haben,
        wodurch alle Knoten, die zu anderen Kategorien gehören, zusammengeführt werden.
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
CallNodeContextMenu--transform-collapse-recursion = Rekursion einklappen
    .title = Wenn die Rekursion eingeklappt wird, werden Aufrufe entfernt, die direkt in dieselbe Funktion rekurrieren, auch wenn im Stapel noch Funktionen dazwischen liegen.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Nur direkte Rekursion einklappen
    .title = Wenn die direkte Rekursion eingeklappt wird, werden Aufrufe entfernt, die wiederholt in dieselbe Funktion rekurrieren, ohne dass im Stapel noch Funktionen dazwischen liegen.
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
CallNodeContextMenu--show-the-function-in-devtools = Funktion in den Entwicklerwerkzeugen anzeigen

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

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Einige Aufrufe von { $calledFunction } wurden vom Compiler inline eingefügt.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (inlined)
    .title = Aufrufe von { $calledFunction } wurden in { $outerFunction } vom Compiler inline eingefügt.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Wählen Sie einen Knoten aus, um Informationen darüber anzuzeigen.
CallTreeSidebar--call-node-details = Details zum Aufrufknoten

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
    .label = Nachverfolgte Laufzeit
CallTreeSidebar--traced-self-time =
    .label = Nachverfolgte Eigenzeit
CallTreeSidebar--running-time =
    .label = Laufzeit
CallTreeSidebar--self-time =
    .label = Eigenzeit
CallTreeSidebar--running-samples =
    .label = Laufende Stichproben
CallTreeSidebar--self-samples =
    .label = Eigenstichproben
CallTreeSidebar--running-size =
    .label = Laufgröße
CallTreeSidebar--self-size =
    .label = Eigengröße
CallTreeSidebar--categories = Kategorien
CallTreeSidebar--implementation = Implementierung
CallTreeSidebar--running-milliseconds = Laufende Millisekunden
CallTreeSidebar--running-sample-count = Anzahl laufende Stichproben
CallTreeSidebar--running-bytes = Laufende Bytes
CallTreeSidebar--self-milliseconds = Eigene Millisekunden
CallTreeSidebar--self-sample-count = Anzahl Eigenstichproben
CallTreeSidebar--self-bytes = Eigene Bytes

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

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Bitte melden Sie dieses Problem den Entwicklern, einschließlich der vollständigen
    Fehlermeldung, wie sie in der Webkonsole der Entwicklerwerkzeuge angezeigt wird.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Melden Sie den Fehler auf GitHub

## Footer Links

FooterLinks--legal = Rechtliches
FooterLinks--Privacy = Datenschutz
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Sprache ändern
FooterLinks--hide-button =
    .title = Fußzeilen-Links ausblenden
    .aria-label = Fußzeilen-Links ausblenden

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> Tracks

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
Home--profile-firefox-android-instructions = Sie können auch Leistungsprofile für { -firefox-android-brand-name } erstellen. Weitere Informationen finden Sie in der Dokumentation <a>Profiling { -firefox-android-brand-name } directly on device</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Diese Profiler-Instanz konnte sich nicht mit dem WebChannel verbinden, sodass die Menüschaltfläche des Profilers nicht aktiviert werden kann.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Diese Profiler-Instanz konnte keine Verbindung zum WebChannel herstellen. Dies bedeutet normalerweise, dass sie auf einem anderen Host als dem ausgeführt wird, der in der Einstellung <code>devtools.performance.recording.ui-base-url</code> angegeben ist. Wenn Sie neue Profile mit dieser Instanz erfassen und ihm programmatische Kontrolle über die Profiler-Menüschaltfläche geben möchten, öffnen Sie <code>about:config</code> und ändern Sie die Einstellung.
Home--record-instructions =
    Um die Profilerstellung zu starten, klicken Sie auf die Schaltfläche Profilerstellung oder verwenden Sie die
    Tastatürkürzel. Das Symbol ist blau, wenn ein Profil aufzeichnet.
    Drücken Sie <kbd>Aufzeichnen</kbd>, um die Daten in profiler.firefox.com zu laden.
Home--instructions-content =
    Das Aufzeichnen von Leistungsprofilen benötigt <a>{ -firefox-brand-name }</a>.
    Vorhandene Profile können jedoch in jedem modernen Browser angezeigt werden.
Home--record-instructions-start-stop = Profilerstellung stoppen und starten
Home--record-instructions-capture-load = Profil aufzeichnen und laden
Home--profiler-motto = Zeichnen Sie ein Leistungsprofil auf. Analysieren Sie es. Teilen Sie es. Machen Sie das Web schneller.
Home--additional-content-title = Bestehende Profile laden
Home--additional-content-content = Sie können eine Profildatei per <strong>Ziehen und Ablegen</strong> hierher bewegen, um sie zu laden, oder:
Home--compare-recordings-info = Sie können auch Aufnahmen vergleichen. <a>Öffnen Sie die Vergleichsschnittstelle.</a>
Home--your-recent-uploaded-recordings-title = Ihre kürzlich hochgeladenen Aufzeichnungen
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    Der { -profiler-brand-name } kann auch Leistungsprofile von anderen Profilern importieren, wie z.&thinsp;B.
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, die
    Chrome Performance Panel, <androidstudio>Android Studio</androidstudio> oder
    eine Datei im <dhat>dhat-Format</dhat> oder <traceevent>Googles Trace-Event-Format</traceevent>. <write>Erfahren Sie, wie Sie Ihren eigenen Importeur schreiben</write>.
Home--install-chrome-extension = Installieren Sie die Chrome-Erweiterung
Home--chrome-extension-instructions =
    Verwenden Sie die <a>{ -profiler-brand-name }-Erweiterung für Chrome</a>,
    um Leistungsprofile in Chrome zu erfassen und im { -profiler-brand-name }
    zu analysieren. Installieren Sie die Erweiterung aus dem Chrome Web Store.
Home--chrome-extension-recording-instructions =
    Verwenden Sie nach der Installation das Symbolleisten-Symbol der Erweiterung
    oder die Tastenkombinationen zum Starten und Stoppen der Profilerstellung. Sie können auch
    Profile exportieren und hier zur detaillierten Analyse laden.

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
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
MarkerContextMenu--copy-page-url = URL der Seite kopieren
MarkerContextMenu--copy-as-json = Als JSON kopieren
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Empfänger-Thread „<strong>{ $threadName }</strong>“ auswählen
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Absender-Thread „<strong>{ $threadName }</strong>“ auswählen

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Stichproben außerhalb der Markierungen verwerfen, die mit „<strong>{ $filter }</strong>“ übereinstimmen

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Markierungen filtern:
    .title = Nur Markierungen anzeigen, die zu einem bestimmten Namen passen
MarkerSettings--marker-filters =
    .title = Filter für Markierungen

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Wählen Sie eine Markierung aus, um Informationen darüber anzuzeigen.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Beginn
MarkerTable--duration = Dauer
MarkerTable--name = Name
MarkerTable--details = Details

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Nur passende Markierungen anzeigen: „{ $filter }“
    .aria-label = Nur passende Markierungen anzeigen: „{ $filter }“

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
MenuButtons--metaInfo--cpu-model = Prozessormodell
MenuButtons--metaInfo--cpu-cores = Prozessorkerne:
MenuButtons--metaInfo--main-memory = Hauptspeicher:
MenuButtons--index--show-moreInfo-button = Mehr anzeigen
MenuButtons--index--hide-moreInfo-button = Weniger anzeigen
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } physischer Kern,{ $logicalCPUs } logischer Kern
               *[other] { $physicalCPUs } physischer Kern,{ $logicalCPUs } logische Kerne
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } physische Kerne,{ $logicalCPUs } logischer Kern
               *[other] { $physicalCPUs } physische Kerne,{ $logicalCPUs } logische Kerne
            }
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
MenuButtons--metaInfo--profiling-started = Aufzeichnungsbeginn:
MenuButtons--metaInfo--profiling-session = Aufzeichnungslänge:
MenuButtons--metaInfo--main-process-started = Hauptprozess gestartet:
MenuButtons--metaInfo--main-process-ended = Hauptprozess beendet:
MenuButtons--metaInfo--interval = Intervall:
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
MenuButtons--metaInfo--application-uptime = Uptime:
MenuButtons--metaInfo--update-channel = Update-Kanal:
MenuButtons--metaInfo--build-id = Build-ID:
MenuButtons--metaInfo--build-type = Build-Typ:
MenuButtons--metaInfo--arguments = Argumente:

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
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Daten aus anderen Tabs einschließen
MenuButtons--publish--renderCheckbox-label-hidden-time = Dauer eingeschlossener verborgener Threads
MenuButtons--publish--renderCheckbox-label-include-screenshots = Bildschirmfotos einschließen
MenuButtons--publish--renderCheckbox-label-resource = URLs und Pfade von Ressourcen einschließen
MenuButtons--publish--renderCheckbox-label-extension = Erweiterungsinformationen einschließen
MenuButtons--publish--renderCheckbox-label-preference = Einstellungswerte einschließen
MenuButtons--publish--renderCheckbox-label-private-browsing = Daten aus privaten Fenstern einschließen
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Dieses Profil enthält Daten aus dem privaten Modus
MenuButtons--publish--reupload-performance-profile = Leistungsprofil erneut hochladen
MenuButtons--publish--share-performance-profile = Leistungsprofil teilen
MenuButtons--publish--info-description = Laden Sie Ihr Profil hoch und machen Sie es mit dem Link für jeden zugänglich.
MenuButtons--publish--info-description-default = Standardmäßig werden Ihre persönlichen Daten entfernt.
MenuButtons--publish--info-description-firefox-nightly2 = Dieses Profil stammt von { -firefox-nightly-brand-name }, daher sind standardmäßig die meisten Daten enthalten.
MenuButtons--publish--include-additional-data = Zusätzliche Daten einschließen, die möglicherweise identifizierbar sind
MenuButtons--publish--button-upload = Hochladen
MenuButtons--publish--upload-title = Profil wird hochgeladen…
MenuButtons--publish--cancel-upload = Hochladen abbrechen
MenuButtons--publish--message-something-went-wrong = Oh, oh, beim Hochladen des Profils ist etwas schiefgegangen.
MenuButtons--publish--message-try-again = Erneut versuchen
MenuButtons--publish--download = Herunterladen
MenuButtons--publish--compressing = Komprimieren…
MenuButtons--publish--error-while-compressing = Fehler beim Komprimieren, versuchen Sie, einige Kontrollkästchen zu deaktivieren, um die Profilgröße zu reduzieren.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Netzwerke filtern:
    .title = Nur Netzwerkanfragen anzeigen, die zu einem bestimmten Namen passen

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

PanelSearch--search-field-hint = Wussten Sie, dass Sie das Komma (,) verwenden können, um mit mehreren Begriffen zu suchen?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Profilnamen bearbeiten
ProfileName--edit-profile-name-input =
    .title = Profilnamen bearbeiten
    .aria-label = Profilname

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Löschen
    .title = Klicken Sie hier, um das Profil „{ $smallProfileName }“ zu löschen

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Beim Löschen dieses Profils ist ein Fehler aufgetreten. <a>Berühren Sie den Link mit dem Mauszeiger, um mehr zu erfahren.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = { $profileName } löschen
ProfileDeletePanel--dialog-confirmation-question =
    Sollen die hochgeladenen Daten dieses Profils wirklich gelöscht werden? Links
    die zuvor geteilt wurden, werden nicht mehr funktionieren.
ProfileDeletePanel--dialog-cancel-button =
    .value = Abbrechen
ProfileDeletePanel--dialog-delete-button =
    .value = Löschen
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Wird gelöscht…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Die hochgeladenen Daten wurden erfolgreich gelöscht.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Vollständiger Zeitraum ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Das Profil wird importiert und verarbeitet…
ProfileLoaderAnimation--loading-unpublished = Das Profil wird direkt von { -firefox-brand-name } importiert…
ProfileLoaderAnimation--loading-from-file = Datei lesen und Profil verarbeiten…
ProfileLoaderAnimation--loading-local = Noch nicht implementiert.
ProfileLoaderAnimation--loading-public = Profil herunterladen und bearbeiten…
ProfileLoaderAnimation--loading-from-url = Profil herunterladen und bearbeiten…
ProfileLoaderAnimation--loading-compare = Profile lesen und verarbeiten…
ProfileLoaderAnimation--loading-view-not-found = Ansicht nicht gefunden

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Zurück zur Startseite

## Root

Root--error-boundary-message =
    .message = Auf profiler.firefox.com ist ein unbekannter Fehler aufgetreten.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Wird angewendet…
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

StackSettings--implementation-all-frames = Alle Frames
    .title = Die Stack-Frames nicht filtern
StackSettings--implementation-script = Skript
    .title = Nur Stack-Frames anzeigen, die mit Skriptausführung zusammenhängen.
StackSettings--implementation-native2 = Native
    .title = Nur die Stack-Frames für nativen Quelltext anzeigen
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Stacks filtern:
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
StackSettings--call-tree-strategy-native-deallocations-sites = Freigegebene Websites
    .title = Zusammenfassung erstellen mit freigegebenen Speicherbytes, von der Website, auf der der Speicher alloziert wurde
StackSettings--invert-call-stack = Aufrufstack umkehren
    .title = Sortieren nach in einem Aufrufknoten, die Unterpunkte werden ignoriert.
StackSettings--show-user-timing = Nutzer-Zeitrechnung anzeigen
StackSettings--use-stack-chart-same-widths = Für jeden Stapel die gleiche Breite verwenden
StackSettings--panel-search =
    .label = Stacks filtern:
    .title = Nur Stacks anzeigen, die eine Funktion enthalten, deren Namen zu diesem Unterstring passen

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Aufrufbaum
TabBar--flame-graph-tab = Flammendiagramm
TabBar--stack-chart-tab = Stack-Diagramm
TabBar--marker-chart-tab = Markierungsdiagramm
TabBar--marker-table-tab = Markierungstabelle
TabBar--network-tab = Netzwerk
TabBar--js-tracer-tab = JS-Aufzeichnung

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Alle Tabs und Fenster

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Nur diesen Prozess anzeigen
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Nur „{ $trackName }“ anzeigen
TrackContextMenu--hide-other-screenshots-tracks = Andere Screenshots-Tracks ausblenden
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = „{ $trackName }“ verbergen
TrackContextMenu--show-all-tracks = Alle Tracks anzeigen
TrackContextMenu--show-local-tracks-in-process = Alle Tracks in diesem Prozess anzeigen
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Alle Spuren vom Typ „{ $type }“ ausblenden
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Alle passenden Tracks anzeigen
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Alle passenden Tracks ausblenden
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Kein Ergebnis für „<span>{ $searchFilter }</span>“ gefunden
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Track ausblenden
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Prozess ausblenden

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = Relativer Speicherverbrauch zu diesem Zeitpunkt
TrackMemoryGraph--memory-range-in-graph = Speicherbereich im Diagramm
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = Allokationen und Aufhebungen von Allokationen seit der vorherigen Stichprobe

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
    .label = Leistung
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Leistung
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Leistung
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Durchschnittliche Leistung in der aktuellen Auswahl
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Durchschnittliche Leistung in der aktuellen Auswahl
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Durchschnittliche Leistung in der aktuellen Auswahl
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Im sichtbaren Bereich verbrauchte Energie
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Im sichtbaren Bereich verwendete Energie
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Im sichtbaren Bereich verwendete Energie
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Im sichtbaren Bereich verwendete Energie
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = In aktueller Auswahl verbrauchte Energie
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = In der aktuellen Auswahl verwendete Energie
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = In der aktuellen Auswahl verwendete Energie
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = In der aktuellen Auswahl verwendete Energie

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
TrackBandwidthGraph--speed = { $value } pro Sekunde
    .label = Übertragungsgeschwindigkeit für diese Teilmenge
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = Lese-/Schreiboperationen seit der vorherigen Teilmenge
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Bislang übertragene Daten
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Im sichtbaren Bereich übertragene Daten
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = In der aktuellen Auswahl übertragene Daten

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Filterbegriffe eingeben
    .title = Nur Tracks anzeigen, die zu einem bestimmten Text passen

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
TransformNavigator--complete = Vollständiges „{ $item }“
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Einklappen: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Knoten fokussieren: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Fokussieren: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Kategorie fokussieren: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Knoten zusammenführen: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Zusammenführen: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Verwerfen: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Rekursion einklappen: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Nur direkte Rekursion einklappen: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Unterbaum einklappen: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Stichproben außerhalb der Markierungen verwerfen, die mit „{ $item }“ übereinstimmen

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Warten auf { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Warten auf { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Quelltext nicht verfügbar
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = <a>Bericht #3741</a> beschreibt unterstützte Szenarien und geplante Verbesserungen.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Assembly-Code nicht verfügbar
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = <a>Bericht #4520</a> beschreibt unterstützte Szenarien und geplante Verbesserungen.
SourceView--close-button =
    .title = Quelltextansicht schließen

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Für diese Datei ist keine quellübergreifend (cross-origin) zugängliche URL bekannt.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Beim Abrufen der URL { $url } ist ein Netzwerkfehler aufgetreten: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Die Symbolication-API des Browsers konnte nicht abgefragt werden: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = Die Symbolication-API des Browsers hat einen Fehler zurückgegeben: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = Die Symbolication-API des lokalen Symbolservers ergab einen Fehler: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = Die Symbolication-API des Browsers hat eine nicht wohlgeformte Antwort zurückgegeben: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = Die Symbolication-API des lokalen Symbolservers hat eine nicht wohlgeformte Antwort zurückgegeben: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Die Datei { $pathInArchive } wurde im Archiv von { $url } nicht gefunden.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Das Archiv unter { $url } konnte nicht geparst werden: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = Der Browser konnte die Quelltextdatei für { $url } mit der sourceUuid { $sourceUuid } nicht abrufen: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Assembly-Ansicht anzeigen
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Assembly-Ansicht ausblenden

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Hochgeladene Aufzeichnungen
