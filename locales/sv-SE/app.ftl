# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox för Android
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

AppViewRouter--error-from-post-message = Det gick inte att importera profilen.
AppViewRouter--error-unpublished = Det gick inte att hämta profilen från { -firefox-brand-name }.
AppViewRouter--error-from-file = Det gick inte att läsa filen eller analysera profilen i den.
AppViewRouter--error-local = Inte implementerat ännu.
AppViewRouter--error-public = Det gick inte att ladda ner profilen.
AppViewRouter--error-from-url = Det gick inte att ladda ner profilen.
AppViewRouter--error-compare = Det gick inte att hämta profilerna.
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

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (infogad)
    .title = { $function } infogades i sin anropare av kompilatorn.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Visa <strong>{ $fileName }</strong>
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
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Att fokusera på en funktion tar bort alla exempel som inte inkluderar
    den funktionen. Dessutom rotar den om anropsträdet så att funktionen
    är trädets enda rot. Detta kan kombinera flera funktionsanropsplatser
    över en profil till en anropsnod.
CallNodeContextMenu--transform-focus-function = Fokusera på funktion
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Fokus på funktion (inverterad)
    .title = { CallNodeContextMenu--transform-focus-function-title }

## The translation for "self" in these strings should match the translation used
## in CallTree--samples-self and CallTree--bytes-self. Alternatively it can be
## translated as "self values" or "self time" (though "self time" is less desirable
## because this menu item is also shown in "bytes" mode).

CallNodeContextMenu--transform-focus-self-title =
    Att fokusera på sig själv liknar att fokusera på en funktion, men behåller bara samplingar
    som bidrar till funktionens självtid. Prover i anropade fält tas bort och anropsträdet
    rotas om till den fokuserade funktionen.
CallNodeContextMenu--transform-focus-self = Fokusera endast på dig självtid
    .title = { CallNodeContextMenu--transform-focus-self-title }

##

CallNodeContextMenu--transform-focus-subtree = Fokusera endast på underträd
    .title =
        Genom att fokusera på ett underträd kommer alla prov tas bort som inte
        innehåller den specifika delen av anropsträdet. Den tar ut en gren av
        anropsträdet, men det gör det endast för den anropsnoden. Alla andra
        anrop från funktionen ignoreras.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Fokus på kategori <strong>{ $categoryName }</strong>
    .title =
        Fokusera på noderna som tillhör samma kategori som den valda noden och
        därmed slå samman alla noder som tillhör en annan kategori.
CallNodeContextMenu--transform-collapse-function-subtree = Komprimera funktion
    .title =
        Att komprimera en funktion kommer att ta bort allt den anropade och all tid
        tilldelas funktionen. Detta kan hjälpa till att förenkla en profil som anropar kod
        som inte behöver analyseras.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Komprimera <strong> { $nameForResource } </strong>
    .title =
        Att komprimera en resurs kommer att plana ut alla anrop till den
        resursen till en enda komprimerad anropsnod.
CallNodeContextMenu--transform-collapse-recursion = Komprimera rekursion
    .title =
        Komprimering av rekursion tar bort anrop som upprepade gånger återkommer
        till samma funktion, även med mellanliggande funktioner i stacken.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Komprimera endast direkt rekursion
    .title =
        Att komprimera direkt rekursion tar bort anrop som upprepade gånger återkommer
        till samma funktion utan några mellanliggande funktioner i stacken.
CallNodeContextMenu--transform-drop-function = Ta bort prover med denna funktion
    .title = Genom att ta bort proverna kommer de tillhörande körtiderna att tas bort från profilen. Detta är användbart för att eliminera tidsinformation som inte är relevant för analysen.
CallNodeContextMenu--expand-all = Expandera alla
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Leta upp funktionsnamnet på Searchfox
CallNodeContextMenu--copy-function-name = Kopiera funktionsnamn
CallNodeContextMenu--copy-script-url = Kopiera skript-URL
CallNodeContextMenu--copy-stack = Kopiera stack
CallNodeContextMenu--show-the-function-in-devtools = Visa funktionen i DevTools

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
CallTree--samples-self = Själv
    .title =
        Antalet "själv"-prov inkluderar bara de prov där funktionen var i slutet
        av stacken. Om den här funktionen anropas till andra funktioner, ingår
        inte antalet "andra" funktioner. "Själv"-räkningen är användbar för att
        förstå var tiden faktiskt spenderades i ett program.
CallTree--bytes-total = Total storlek (byte)
    .title =
        Den "totala storleken" inkluderar en sammanfattning av alla byte
        som tilldelats eller avallokerats medan denna funktion observerades
        vara i stacken. Detta inkluderar både byten där funktionen faktiskt
        kördes och byten för anropen från denna funktion.
CallTree--bytes-self = Själv (bytes)
    .title =
        "Själv"-byten inkluderar de byte som allokerats eller avallokerats medan
        denna funktion var i slutet av stacken. Om den här funktionen anropas till andra funktioner, så ingår inte de "andra" funktionernas bytes.
        "Själv"-byten är användbara för att förstå var minnet faktiskt fanns.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Vissa anrop till { $calledFunction } infogades av kompilatorn.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (infogad)
    .title = Anrop till { $calledFunction } infogades i { $outerFunction } av kompilatorn.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Välj en nod för att visa information om den.
CallTreeSidebar--call-node-details = Detaljer anropsnod

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
    .label = Spårad körtid
CallTreeSidebar--traced-self-time =
    .label = Spårad självtid
CallTreeSidebar--running-time =
    .label = Körtid
CallTreeSidebar--self-time =
    .label = Självtid
CallTreeSidebar--running-samples =
    .label = Körande prover
CallTreeSidebar--self-samples =
    .label = Självprover
CallTreeSidebar--running-size =
    .label = Körstorlek
CallTreeSidebar--self-size =
    .label = Självstorlek
CallTreeSidebar--categories = Kategorier
CallTreeSidebar--implementation = Implementation
CallTreeSidebar--running-milliseconds = Körande millisekunder
CallTreeSidebar--running-sample-count = Körande antal prover
CallTreeSidebar--running-bytes = Körande bytes
CallTreeSidebar--self-milliseconds = Själv millisekunder
CallTreeSidebar--self-sample-count = Antal självprov
CallTreeSidebar--self-bytes = Självbytes

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

DebugWarning--warning-message =
    .message =
        Den här profilen spelades in i ett bygge utan releaseoptimeringar.
        Prestandaobservationer kanske inte gäller för releasepopulationen.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Öppna sidofältet
Details--close-sidebar-button =
    .title = Stäng sidofältet
Details--error-boundary-message =
    .message = Oj, några okända fel inträffade i den här panelen.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Rapportera problemet till utvecklarna, inklusive hela
    felet som visas i webbkonsolen för utvecklarverktygen.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Rapportera felet på GitHub

## Footer Links

FooterLinks--legal = Juridisk information
FooterLinks--Privacy = Sekretesspolicy
FooterLinks--Cookies = Kakor
FooterLinks--languageSwitcher--select =
    .title = Ändra språk
FooterLinks--hide-button =
    .title = Dölj sidfotslänkar
    .aria-label = Dölj sidfotslänkar

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

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
Home--profile-firefox-android-instructions =
    Du kan också profilera { -firefox-android-brand-name }. För mer
    information, se denna dokumentation:
    <a>Profilering av { -firefox-android-brand-name } direkt på enheten</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Den här profileringsinstansen kunde inte ansluta till WebChannel, så den kan inte aktivera menyknappen för profilering.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Den här profileringsinstansen kunde inte ansluta till WebChannel. Detta betyder
    vanligtvis att den körs på en annan värd än den som anges i inställningen
    <code>devtools.performance.recording.ui-base-url</code>. Om du vill fånga nya
    profiler med den här instansen och ge den programmatisk kontroll av
    profileringsmenyknappen, kan du gå till <code>about:config</code> och ändra inställningen.
Home--record-instructions =
    För att starta profilering, klicka på profileringsknappen eller använd
    kortkommandona. Ikonen är blå när en profil spelas in. Tryck på
    <kbd>Fånga</kbd> för att ladda data till profiler.firefox.com.
Home--instructions-content =
    För att spela in prestandaprofiler krävs <a>{ -firefox-brand-name }</a>.
    Befintliga profiler kan dock visas i vilken modern webbläsare som helst.
Home--record-instructions-start-stop = Stoppa och börja profilera
Home--record-instructions-capture-load = Spela in och ladda profil
Home--profiler-motto = Spela in en prestandaprofil. Analysera den. Dela den. Gör webben snabbare.
Home--additional-content-title = Ladda befintliga profiler
Home--additional-content-content = Du kan <strong>dra och släppa</strong> en profilfil här för att ladda den, eller:
Home--compare-recordings-info = Du kan också jämföra inspelningar.<a>Öppna gränssnitt för att jämföra.</a>
Home--your-recent-uploaded-recordings-title = Dina senaste uppladdade inspelningar
Home--dark-mode-title = Mörkt läge
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } kan också importera profiler från andra profilerare, t.ex
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>,
    Chrome prestandapanel, <androidstudio>Android Studio</androidstudio> eller
    vilken fil som helst som använder <dhat>dhat-formatet</dhat> eller <traceevent>Googles spårningshändelse
    Format</traceevent>. <write>Lär dig hur du skriver din
    egen importör</write>.
Home--install-chrome-extension = Installera tillägget för Chrome
Home--chrome-extension-instructions =
    Använd tillägget <a>{ -profiler-brand-name } för Chrome</a>
    för att fånga prestandaprofiler i Chrome och analysera dem i
    { -profiler-brand-name }. Installera tillägget från Chrome Web Store.
Home--chrome-extension-recording-instructions =
    När det är installerat använder du tilläggets verktygsfältsikon
    eller genvägarna för att starta och stoppa profilering.
    Du kan också exportera profiler och ladda dem här för detaljerad analys.

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
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
MarkerContextMenu--copy-page-url = Kopiera sidans URL
MarkerContextMenu--copy-as-json = Kopiera som JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Välj mottagartråden "<strong>{ $threadName }</strong>"
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Välj avsändartråden "<strong>{ $threadName }</strong>"

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Kasta prover utanför markörer som matchar "<strong>{ $filter }</strong>"

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Kopiera markörtabell som vanlig text
MarkerCopyTableContextMenu--copy-table-as-markdown = Kopiera markörtabell som Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtermarkörer:
    .title = Visa endast markörer som matchar ett visst namn
MarkerSettings--marker-filters =
    .title = Markörfilter
MarkerSettings--copy-table =
    .title = Kopiera tabell som text
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Antalet rader överskrider gränsen: { $rows } > { $maxRows }. Endast de första { $maxRows } raderna kommer att kopieras.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Välj en markör för att visa information om den.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Börja
MarkerTable--duration = Längd
MarkerTable--name = Namn
MarkerTable--details = Detaljer

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Visa endast markörer som matchar: "{ $filter }"
    .aria-label = Visa endast markörer som matchar: "{ $filter }"

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
MenuButtons--metaInfo--cpu-model = CPU-modell:
MenuButtons--metaInfo--cpu-cores = CPU-kärnor:
MenuButtons--metaInfo--main-memory = Huvudminne:
MenuButtons--index--show-moreInfo-button = Visa mer
MenuButtons--index--hide-moreInfo-button = Visa mindre
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fysisk kärna, { $logicalCPUs } logisk kärna
               *[other] { $physicalCPUs } fysisk kärna, { $logicalCPUs } logiska kärnor
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fysiska kärnor, { $logicalCPUs } logisk kärna
               *[other] { $physicalCPUs } fysiska kärnor, { $logicalCPUs } logiska kärnor
            }
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
MenuButtons--metaInfo--profiling-started = Inspelningen startade:
MenuButtons--metaInfo--profiling-session = Inspelningslängd:
MenuButtons--metaInfo--main-process-started = Huvudprocessen startade:
MenuButtons--metaInfo--main-process-ended = Huvudprocessen avslutad:
MenuButtons--metaInfo--file-name = Filnamn:
MenuButtons--metaInfo--file-size = Filstorlek:
MenuButtons--metaInfo--interval = Intervall:
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
MenuButtons--metaInfo--arguments = Argument:

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
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Inkludera data från andra flikar
MenuButtons--publish--renderCheckbox-label-hidden-time = Inkludera dolt tidsintervall
MenuButtons--publish--renderCheckbox-label-include-screenshots = Inkludera skärmdumpar
MenuButtons--publish--renderCheckbox-label-resource = Inkludera resursURLs och sökvägar
MenuButtons--publish--renderCheckbox-label-extension = Inkludera tilläggsinformation
MenuButtons--publish--renderCheckbox-label-preference = Inkludera preferensvärden
MenuButtons--publish--renderCheckbox-label-private-browsing = Inkludera data från privata surffönster
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Den här profilen innehåller privata webbläsardata
MenuButtons--publish--reupload-performance-profile = Ladda upp prestandaprofilen igen
MenuButtons--publish--share-performance-profile = Dela prestandaprofil
MenuButtons--publish--info-description = Ladda upp din profil och gör den tillgänglig för alla med länken.
MenuButtons--publish--info-description-default = Som standard tas dina personuppgifter bort.
MenuButtons--publish--info-description-firefox-nightly2 = Den här profilen är från { -firefox-nightly-brand-name }, så den mesta information ingår som standard.
MenuButtons--publish--include-additional-data = Inkludera ytterligare data som kan identifieras
MenuButtons--publish--button-upload = Ladda upp
MenuButtons--publish--upload-title = Laddar upp profil…
MenuButtons--publish--cancel-upload = Avbryt uppladdning
MenuButtons--publish--message-something-went-wrong = Hoppsan, något gick fel när du laddade upp profilen.
MenuButtons--publish--message-try-again = Försök igen
MenuButtons--publish--download = Hämta
MenuButtons--publish--compressing = Komprimerar…
MenuButtons--publish--error-while-compressing = Fel vid komprimering, försök avmarkera några kryssrutor för att minska profilstorleken.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrera nätverk:
    .title = Visa endast nätverksförfrågningar som matchar ett visst namn

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

PanelSearch--search-field-hint = Visste du att du kan använda komma (,) för att söka med flera termer?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Redigera profilnamn
ProfileName--edit-profile-name-input =
    .title = Redigera profilnamn
    .aria-label = Profilnamn

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Ta bort
    .title = Klicka här för att ta bort profil { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Ett fel inträffade när den här profilen skulle tas bort. <a>Håll muspekaren över för att veta mer.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Ta bort { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Är du säker på att du vill ta bort uppladdad data för den här profilen? Länkar
    som tidigare delats kommer inte längre att fungera.
ProfileDeletePanel--dialog-cancel-button =
    .value = Avbryt
ProfileDeletePanel--dialog-delete-button =
    .value = Ta bort
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Tar bort…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Den uppladdade datan har raderats.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Fullt intervall ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Importerar och bearbetar profilen…
ProfileLoaderAnimation--loading-unpublished = Importerar profilen direkt från { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Läser fil och bearbetar profil…
ProfileLoaderAnimation--loading-local = Inte implementerat ännu.
ProfileLoaderAnimation--loading-public = Laddar ner och bearbetar profil…
ProfileLoaderAnimation--loading-from-url = Laddar ner och bearbetar profil…
ProfileLoaderAnimation--loading-compare = Läser och bearbetar profil…
ProfileLoaderAnimation--loading-view-not-found = Vy hittades inte

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Tillbaka till hem

## Root

Root--error-boundary-message =
    .message = Åh, något okänt fel inträffade i profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Tillämpar…
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

StackSettings--implementation-all-frames = Alla ramar
    .title = Filtrera inte stackramar
StackSettings--implementation-script = Skript
    .title = Visa endast stackramar relaterade till skriptkörning
StackSettings--implementation-native2 = Intern
    .title = Visa bara stackramar för intern kod
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Filtrera stackar:
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
StackSettings--use-stack-chart-same-widths = Använd samma bredd för varje stack
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

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Alla flikar och fönster

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Visa endast denna process
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
TrackContextMenu--show-local-tracks-in-process = Visa alla spår i denna process
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Dölja alla spår av typen "{ $type }"
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Visa alla matchande spår
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Dölj alla matchande spår
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Inga resultat hittades för “<span>{ $searchFilter }</span>”
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Dölj spår
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Dölj process

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = relativa minnet vid denna tidpunkt
TrackMemoryGraph--memory-range-in-graph = minnesintervall i grafen
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = allokeringar och deallokeringar sedan föregående prov

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
    .label = Effekt
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Effekt
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Effekt
# This is used in the tooltip when the instant power value uses the microwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-microwatt = { $value } μW
    .label = Effekt
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Genomsnittlig effekt i det aktuella valet
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Genomsnittlig effekt i det aktuella valet
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Genomsnittlig effekt i det aktuella valet
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energi som används i det synliga området
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energi som används i det synliga området
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energi som används i det synliga området
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energi som används i det synliga området
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energi som används i det aktuella urvalet
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energi som används i det aktuella urvalet
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energi som används i det aktuella urvalet
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energi som används i det aktuella urvalet

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
TrackBandwidthGraph--speed = { $value } per sekund
    .label = Överföringshastighet för detta prov
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = Läs/skrivoperationer sedan föregående prov
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Data överförd till denna tid
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Data som överförs i det synliga intervallet
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Data som överförs i det aktuella valet

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
TransformNavigator--collapse-resource = Komprimera: { $item }
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
# "Focus self" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-on-function-self
# Also see the translation note above CallNodeContextMenu--transform-focus-self.
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-self = Fokusera på självtid: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Fokuskategori: { $item }
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
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Komprimera rekursion: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Komprimera endast direkt rekursion: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Komprimera underträd: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Kasta prover utanför markörer som matchar: "{ $item }"

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Väntar på { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Väntar på { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Källkoden är inte tillgänglig
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Se <a>problem #3741</a> för scenarier som stöds och planerade förbättringar.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Assembly-koden inte tillgänglig
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Se <a>problem #4520</a> för scenarier som stöds och planerade förbättringar.
SourceView--close-button =
    .title = Stäng källvyn

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Det finns ingen tillgänglig webbadress för den här filen.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Det uppstod ett nätverksfel när webbadressen { $url } skulle hämtas: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Kunde inte fråga webbläsarens symboliserings-API: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = Webbläsarens symboliserings-API returnerade ett fel: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = Den lokala symbolserverns symboliserings-API returnerade ett fel: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = Webbläsarens symboliserings-API returnerade ett felaktigt svar: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = Den lokala symbolserverns symboliserings-API returnerade ett felaktigt svar: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Filen { $pathInArchive } hittades inte i arkivet från { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Arkivet på { $url } kunde inte analyseras: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = Webbläsaren kunde inte hämta källfilen för { $url } med sourceUuid { $sourceUuid }: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Visa assembly-vyn
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Dölj assembly-vyn
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Föregående
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Nästa
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = { $current } av { $total }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Uppladdade inspelningar
