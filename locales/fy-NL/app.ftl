# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox foar Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> – <subheader>Web-app foar prestaasjeanalyse fan { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Nei ús Git-repository (dizze wurdt yn in nij finster iepene)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Koe it profyl net ymportearje.
AppViewRouter--error-unpublished = Kin it profyl net ophelje fan { -firefox-brand-name }.
AppViewRouter--error-from-file = Kin it bestân net lêze of it profyl deryn ûntlede.
AppViewRouter--error-local = Noch net ymplemintearre.
AppViewRouter--error-public = Kin it profyl net downloade.
AppViewRouter--error-from-url = Kin it profyl net downloade.
AppViewRouter--error-compare = Kin de profilen net ophelje.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Fanwegen in <a>spesifike beheining yn Safari</a> kin { -profiler-brand-name } gjin
    profilen fan de lokale kompjûter yn dizze browser ymportearje. Iepenje yn stee dêrfan
    dizze side yn { -firefox-brand-name } of Chrome.
    .title = Safari kan geen lokale profielen importeren
AppViewRouter--route-not-found--home =
    .specialMessage = De URL dy’t jo probearre te berikken, waard net werkend.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = <strong>{ $fileName }</strong> toane
CallNodeContextMenu--transform-merge-function = Funksje gearfoegje
    .title =
        As jo in funksje gearfoegje, wurdt dizze út it profyl fuortsmiten en wurdt de tiid tawezen oan
        de funksje dy’t dizze oanroppen hat. Dit bart oeral wêr’t de funksje
        yn de beam oanroppen waard.
CallNodeContextMenu--transform-merge-call-node = Allinnich node gearfoegje
    .title =
        As jo in node gearfoegje, wurdt dizze út it profyl fuortsmiten en de tiid tawezen oan de
        funksjenode dy’t dizze oanroppen hat. It smyt de funksje allinnich fan dat
        spesifike part fan de beam fuort. Oare plakken fan wêr út de funksje oanroppen waard
        bliuwe yn it profyl.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    As jo fokusje op in funksje, wurdt elk foarbyld dat dy funksje net befettet
    fuortsmite. Dêrby wurdt de oanropbeam opnij root, sadat de funksje
    de iennige root fan de beam is. Dit kin meardere funksje-oanropsites yn in profyl
    kombinearje yn ien oanropnode.
CallNodeContextMenu--transform-focus-function = Fokus op funksje
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Fokus op funksje (omkeard)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Allinnich fokus op substruktuer
    .title =
        As jo op in substruktuer fokust, wurdt elk foarbyld dat dat spesifike part
        fan de oanropbeam net befettet fuortsmiten. It selektearret in tûke fan de oanropbeam,
        echter dit bart allinnich foar dy inkelde oanropnode. Alle oare oanroppen
        fan de funksje wurde negearre.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Fokussen op kategory <strong>{ $categoryName }</strong>
    .title =
        Fokussen op de nodes yn deselde kategory as de selektearre node,
        wêrtroch alle nodes dy’t yn in oare kategory hearre gearfoege wurde.
CallNodeContextMenu--transform-collapse-function-subtree = Funksje ynklappe
    .title =
        As jo in funksje ynklappe, wurdt alles dat dizze oanroppen hat fuortsmiten en alle
        tiid oan de funksje tawezen. Dit kin helpe in profyl dat koade oanropt dy’t net
        analysearre hoege te wurden te ferienfâldigjen.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = <strong>{ $nameForResource }</strong> ynklappe
    .title =
        As jo in boarne ynklappe, wurde alle oanroppen fan dy boarne
        ôfflakke ta ien inkelde ynklappe oanropnode.
CallNodeContextMenu--transform-collapse-recursion = Rekursy ynklappe
    .title =
        Rekursy ynklappen smyt oanroppe fuort dy’t geregeld weromkomme yn
        deselde funksje, sels mei yndirekte funksjes op de stack.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Rekursy direkt ynklappe
    .title =
        Rekursy direkt ynklappen smyt oanroppen fuort dy’t geregeld weromkomme yn
        deselde funksje, sels sûnder yndirekte funksjes op de stack.
CallNodeContextMenu--transform-drop-function = Meunsters mei dizze funksje weilitte
    .title =
        As jo meunsters weilitte, wurdt harren tiid út it profyl fuortsmiten. Dit is nuttich om
        tiidsynformaasje dy’t net relevant foar de analyze is te eliminearjen.
CallNodeContextMenu--expand-all = Alles útklappe
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = De funksjenamme op Searchfox opsykje
CallNodeContextMenu--copy-function-name = Funksjenamme kopiearje
CallNodeContextMenu--copy-script-url = Script-URL kopiearje
CallNodeContextMenu--copy-stack = Stack kopiearje
CallNodeContextMenu--show-the-function-in-devtools = Funksje toane yn DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Rintiid (ms)
    .title =
        De ‘totale’ rintiid befettet in gearfetting fan alle tiid wêryn dizze
        funksje harren op de stack wie. Dit omfettet de tiid wêryn de
        funksje wurklik útfierd waard en de tiid dy’t spandearre waard
        oan oanroppen fan dizze funksje út.
CallTree--tracing-ms-self = Sels (ms)
    .title =
        De ‘sels’-tiid omfettet allinnich de tiid wêryn de funksje harren oan it
        ein fan de stack wie. As dizze funksje oare funksjes oanroppen hat,
        is de tiid fan de ‘oare’ funksje net meinommen. De ‘sels’-tiid is nuttich
        foar it begryp fan hokker tiid wurklik yn it programma bestege is.
CallTree--samples-total = Totaal (meunsters)
    .title =
        It ‘totale’ meunsteroantal omfettet in gearfetting fan elk meunster wêryn dizze
        funksje harre yn de stack wie. Dit omfettet de tiid wêryn de funksje
        wurklik útfierd waard en de spandearre tiid yn de oanroppen
        fan dizze funksje út.
CallTree--samples-self = Sels
    .title =
        It oantal ‘sels’-meunsters omfettet allinnich de meunsters wêryn de funksje harren
        oan it ein fan de stack wie. As dizze funksje oare funksjes oanroppen hat,
        binne de oantallen ‘oare’ funksjes net meiteld. It oantal kearen ‘sels’ is nuttich
        foar it begryp fan wêr tiid wurklik yn in programma bestege is.
CallTree--bytes-total = Totale grutte (bytes)
    .title =
        De ‘totale grutte’ omfettet in gearfetting fan alle bytes dy’t allokearre of
        de-allokearre binne, wylst dizze funksje harren yn de stack wie. Dit befettet
        sawol de bytes wêrby de funksje wurklik útfierd waard as de
        bytes fan de oanroppen fan dizze funksje út.
CallTree--bytes-self = Sels (bytes)
    .title =
        De ‘sels’-bytes omfetsje alle bytes dy’t allokearre of de-allokearre binne, wylst
        dizze funksje oan it ein fan de stack wie. As dizze funksje oare
        funksjes oanroppen hat, dan binne de bytes fan ‘oare’ funksje net opnommen.
        De ‘sels’-bytes binne nuttich om te begripen wêr’t ûnthâldromte wurklik
        yn it programma allokearre of de-allokearre wie.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Guon oproppen nei { $calledFunction } binne inline troch de compiler pleatst.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (inline pleatst)
    .title = Oanroppen nei { $calledFunction } binne inline yn { $outerFunction } pleatst troch de compiler.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selektearje in node om ynformaasje oer te toanen.
CallTreeSidebar--call-node-details = Details oanropnode

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
    .label = Folge rintiid
CallTreeSidebar--traced-self-time =
    .label = Folge eigen tiid
CallTreeSidebar--running-time =
    .label = Rintiid
CallTreeSidebar--self-time =
    .label = Eigen tiid
CallTreeSidebar--running-samples =
    .label = Rinnende samples
CallTreeSidebar--self-samples =
    .label = Eigen samples
CallTreeSidebar--running-size =
    .label = Omfang rinnend
CallTreeSidebar--self-size =
    .label = Eigen omfang
CallTreeSidebar--categories = Kategoryen
CallTreeSidebar--implementation = Ymplemintaasje
CallTreeSidebar--running-milliseconds = Rinnend yn millisekonden
CallTreeSidebar--running-sample-count = Tal samples rinnend
CallTreeSidebar--running-bytes = Rinnend yn bytes
CallTreeSidebar--self-milliseconds = Eigen yn milisekonden
CallTreeSidebar--self-sample-count = Tal samples eigen
CallTreeSidebar--self-bytes = Eigen yn bytes

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Fier de profyl-URL’s dy’t jo fergelykje wolle yn
CompareHome--instruction-content =
    It helpmiddel ekstrahearret de gegevens út de selektearre track en it berik foar
    elk profyl en pleatst se tegearre yn deselde werjefte, om se maklik te
    fergelykjen te meitsjen.
CompareHome--form-label-profile1 = Profyl 1:
CompareHome--form-label-profile2 = Profyl 2:
CompareHome--submit-button =
    .value = Profilen ophelje

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Dit profyl is opnommen yn in build sûnder útjefte-optimalisaasjes.
        Prestaasjeobservaasjes binne mooglik net fan tapassing op de útjeftepopulaasje.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = De sidebalke iepenje
Details--close-sidebar-button =
    .title = De sidebalke slute
Details--error-boundary-message =
    .message = Uh oh, der is in ûnbekende flater yn dit paniel bard.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Dit probleem oan de ûntwikkelers melde, ynklusyf de folsleine
    flatermelding lykas toand yn de webconsole fan de Untwikkelershelpmiddelen.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = De flater op GitHub melde

## Footer Links

FooterLinks--legal = Juridysk
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Taal wizigje
FooterLinks--hide-button =
    .title = Fuottekstkeppelingen ferstopje
    .aria-label = Fuottekstkeppelingen ferstopje

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

Home--upload-from-file-input-button = In profyl út in bestân lade
Home--upload-from-url-button = In profyl fan in URL lade
Home--load-from-url-submit-button =
    .value = Lade
Home--documentation-button = Dokumintaasje
Home--menu-button = Menuknop { -profiler-brand-name } ynskeakelje
Home--menu-button-instructions =
    Skeakelje de menuknop Profiler yn om te begjinnen mei it opnimmen fan in
    prestaasjeprofyl yn { -firefox-brand-name }, analysearje dit en diel it mei profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Jo kinne { -firefox-android-brand-name } ek profilearje. Foar mear
    ynformaasje, lês dizze dokumintaasje:
    <a>{ -firefox-android-brand-name } daliks op apparaat profilearje</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Dizze profiler-ynstânsje kin gjin ferbining meitsje mei it WebChannel, dus de Profiler-menuknop kin net ynskeakele wurde.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Dizze profiler-ynstânsje kin gjin ferbining meitsje mei it WebChannell. Dit betsjut meastentiids dat dizze
    útfierd wurdt op in oare host as opjûn yn de foarkar
    <code>devtools.performance.recording.ui-base-url</code>. As jo nije profilen fêstlizze wolle
    mei dizze ynstânsje, en der programmatyske kontrôle oer de profiler-menuknop oan jaan wolle,
    dan kinne jo nei <code>about:config</code> gean en de foarkar wizigje.
Home--record-instructions =
    Klik om te starten mei it meitsjen fan in profyl op de profylknop of brûk de
    fluchtoetsen. It piktogram is blau as der in profyl opnommen wurdt.
    Klik op <kbd>Fêstlizze</kbd> om de gegevens yn profiler.firefox.com te laden.
Home--instructions-content =
    It opnimmen fan prestaasjeprofilen fereasket <a>{ -firefox-brand-name }</a>.
    Besteande profilen kinne echter besjoen wurde yn elke moderne browser.
Home--record-instructions-start-stop = Profilearjen stopje en starte
Home--record-instructions-capture-load = Profyl fêstlizze en lade
Home--profiler-motto = Lis in prestaasjeprofyl fêst. Analysearje it. Diel it. Meitsje it ynternet flugger.
Home--additional-content-title = Besteande profilen lade
Home--additional-content-content = Jo kinne in profylbestân hjirhinne <strong>fersleepje</strong> om it te laden, of:
Home--compare-recordings-info = Jo kinne ek opnamen fergelykje. <a>De fergelikingsinterface iepenje.</a>
Home--your-recent-uploaded-recordings-title = Jo resint opladen opnamen
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    De { -profiler-brand-name } kin ek profilen fan oare profilers ymportearje, lykas
    <perf>Linux-perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, it
    Chrome-prestaasjespaniel, <androidstudio>Android Studio</androidstudio>, of
    elk bestân mei it <dhat>dhat-formaat</dhat> of de <traceevent>Trace Event-yndieling
    fan Google</traceevent> brûkt. <write>Lês hoe’t jo jo
    eigen ymportearder skriuwe</write>.
Home--install-chrome-extension = De Chrome-útwreiding ynstallearje
Home--chrome-extension-instructions =
    Brûk de <a>{ -profiler-brand-name }-útwreiding foar Chrome</a>
    om prestaasjeprofilen yn Chrome fêst te lizzen en se yn de
    { -profiler-brand-name } te analysearjen. Ynstallearje de útwreiding fan de Chrome Web Store út.
Home--chrome-extension-recording-instructions =
    Brûk nei ynstallaasje it arkbalkepiktogram fan de
    útwreiding of de fluchkeppelingen om it profilearjen te starten en te stopjen. Jo kinne ek
    profilen eksportearje en dizze hjir lade foar detaillearre analyze.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Fier filtertermen yn

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Allinnich selstiid toane
    .title = Allinnich de tiid yn in oanropnode toane en ûnderlizzende oanroppen negearje.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Klik hjir om profyl { $smallProfileName } te laden
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Fuortsmite
    .title = Dit profyl kin net fuortsmiten wurde, omdat wy gjin autorisaasjegegevens hawwen.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Der is noch gjin profyl opladen!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Al jo opnamen besjen en beheare (noch { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Dizze opname beheare
       *[other] Dizze opnamen beheare
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Seleksje ynstelle fan doer markearring út
MarkerContextMenu--start-selection-here = Seleksje hjir starte
MarkerContextMenu--end-selection-here = Seleksje hjir stopje
MarkerContextMenu--start-selection-at-marker-start = Seleksje starte by <strong>start</strong> markearring
MarkerContextMenu--start-selection-at-marker-end = Seleksje starte by <strong>ein</strong> markearring
MarkerContextMenu--end-selection-at-marker-start = Seleksje stopje by <strong>start</strong> markearring
MarkerContextMenu--end-selection-at-marker-end = Seleksje stopje by <strong>ein</strong> markearring
MarkerContextMenu--copy-description = Beskriuwing kopiearje
MarkerContextMenu--copy-call-stack = Oanropstack kopiearje
MarkerContextMenu--copy-url = URL kopiearje
MarkerContextMenu--copy-page-url = Side-URL kopiearje
MarkerContextMenu--copy-as-json = Kopiearje as JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selektearje de ûntfangerthread ‘<strong>{ $threadName }</strong>’
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selektearje de ôfstjoerderthread ‘<strong>{ $threadName }</strong>’

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Samples bûten markearringen oerienkommend mei ‘<strong>{ $filter }</strong>’ bûten beskôging litte

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Markearringen filterje:
    .title = Allinnich markearringen toane dy’t oerienkommen mei in bepaalde namme
MarkerSettings--marker-filters =
    .title = Markearringsfilters

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selektearje in markearringen om ynformaasje oer te toanen.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Start
MarkerTable--duration = Doer
MarkerTable--name = Namme
MarkerTable--details = Details

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profylynfo
MenuButtons--index--full-view = Folslein byld
MenuButtons--index--cancel-upload = Opladen annulearje
MenuButtons--index--share-upload =
    .label = Lokaal profyl oplade
MenuButtons--index--share-re-upload =
    .label = Opnij oplade
MenuButtons--index--share-error-uploading =
    .label = Flater by it opladen
MenuButtons--index--revert = Tebek nei orizjineel profyl
MenuButtons--index--docs = Dokuminten
MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Opladen:
MenuButtons--index--profile-info-uploaded-actions = Fuortsmite
MenuButtons--index--metaInfo-subtitle = Profylynformaasje
MenuButtons--metaInfo--symbols = Symboalen:
MenuButtons--metaInfo--profile-symbolicated = Profyl is symbolisearre
MenuButtons--metaInfo--profile-not-symbolicated = Profyl is net symbolisearre
MenuButtons--metaInfo--resymbolicate-profile = Profyl opnij symbolisearje
MenuButtons--metaInfo--symbolicate-profile = Profyl symbolisearje
MenuButtons--metaInfo--attempting-resymbolicate = Besykjen ta opnij symbolisearjen profyl
MenuButtons--metaInfo--currently-symbolicating = Profyl wurdt symbolisearre
MenuButtons--metaInfo--cpu-model = CPU-model:
MenuButtons--metaInfo--cpu-cores = CPU-kearnen:
MenuButtons--metaInfo--main-memory = Haadûnthâld:
MenuButtons--index--show-moreInfo-button = Mear toane
MenuButtons--index--hide-moreInfo-button = Minder toane
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fysike kearn,{ $logicalCPUs } logyske kearn
               *[other] { $physicalCPUs } fysike kearn,{ $logicalCPUs } logyske kearnen
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fysike kearnen,{ $logicalCPUs } logyske kearn
               *[other] { $physicalCPUs } fysike kearnen,{ $logicalCPUs } logyske kearnen
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } fysike kearn
       *[other] { $physicalCPUs } fysike kearnen
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } logyske kearn
       *[other] { $logicalCPUs } logyske kearnen
    }
MenuButtons--metaInfo--profiling-started = Opname start:
MenuButtons--metaInfo--profiling-session = Opnamedoer:
MenuButtons--metaInfo--main-process-started = Haadproses start:
MenuButtons--metaInfo--main-process-ended = Haadproses stoppe:
MenuButtons--metaInfo--interval = Ynterfal:
MenuButtons--metaInfo--buffer-capacity = Bufferkapasiteit:
MenuButtons--metaInfo--buffer-duration = Bufferdoer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } sekonde
       *[other] { $configurationDuration } sekonden
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Unbeheind
MenuButtons--metaInfo--application = Tapassing
MenuButtons--metaInfo--name-and-version = Namme en ferzje:
MenuButtons--metaInfo--application-uptime = Uptime:
MenuButtons--metaInfo--update-channel = Fernijkanaal:
MenuButtons--metaInfo--build-id = Build-ID:
MenuButtons--metaInfo--build-type = Buildtype:
MenuButtons--metaInfo--arguments = Arguminten:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debugge
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Platfoarm
MenuButtons--metaInfo--device = Apparaat:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Bestjoeringssysteem:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Fisuele statistiken
MenuButtons--metaInfo--speed-index = Snelheidsyndeks:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual-snelheidsyndeks:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful-snelheidsyndeks:
MenuButtons--metaInfo-renderRowOfList-label-features = Funksjes:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Threadsfilter:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Utwreidingen:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = { -profiler-brand-short-name }-overhead
MenuButtons--metaOverheadStatistics-mean = Gemiddeld
MenuButtons--metaOverheadStatistics-max = Maks
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
    .title = Tiid om alle threads te bemeunsterjen.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Opskjinje
    .title = Tiid om ferrûne gegevens te wiskjen.
MenuButtons--metaOverheadStatistics-statkeys-counter = Teller
    .title = Tiid om alle tellers te sammeljen.
MenuButtons--metaOverheadStatistics-statkeys-interval = Ynterfal
    .title = Waarnommen ynterfal tusken twa meunsters.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Beskoattelingen
    .title = Tiid om de beskoatteling te krijen eardat bemeunstere wurdt.
MenuButtons--metaOverheadStatistics-overhead-duration = Overheaddoer:
MenuButtons--metaOverheadStatistics-overhead-percentage = Overheadpersintaazje:
MenuButtons--metaOverheadStatistics-profiled-duration = Profilearre doer:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Ferburgen threads opnimme
MenuButtons--publish--renderCheckbox-label-include-other-tabs = De gegevens fan oare ljepblêden opnimme
MenuButtons--publish--renderCheckbox-label-hidden-time = Ferburgen tiidrek opnimme
MenuButtons--publish--renderCheckbox-label-include-screenshots = Skermôfdrukken opnimme
MenuButtons--publish--renderCheckbox-label-resource = Helpboarne-URL’s en -paden opnimme
MenuButtons--publish--renderCheckbox-label-extension = Utwreidingsynformaasje opnimme
MenuButtons--publish--renderCheckbox-label-preference = Foarkarswearden opnimme
MenuButtons--publish--renderCheckbox-label-private-browsing = De gegevens fan priveenavigaasjefinsters opnimme
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Dit profyl befettet priveenavigaasjegegevens
MenuButtons--publish--reupload-performance-profile = Prestaasjeprofyl opnij oplade
MenuButtons--publish--share-performance-profile = Prestaasjeprofyl diele
MenuButtons--publish--info-description = Laad jo profyl op en meitsje it mei de keppeling tagonklik foar elkenien.
MenuButtons--publish--info-description-default = Standert wurde jo persoanlike gegevens fuortsmiten.
MenuButtons--publish--info-description-firefox-nightly2 = Dit profyl is fan { -firefox-nightly-brand-name }, dus standert wurde de measte gegevens opnommen.
MenuButtons--publish--include-additional-data = Oanfoljende gegevens dy’t identifisearber wêze kinne tafoegje
MenuButtons--publish--button-upload = Oplade
MenuButtons--publish--upload-title = Profyl oplade…
MenuButtons--publish--cancel-upload = Opladen annulearje
MenuButtons--publish--message-something-went-wrong = Och heden, der is wat misgien by it opladen fan it profyl.
MenuButtons--publish--message-try-again = Opnij probearje
MenuButtons--publish--download = Downloade
MenuButtons--publish--compressing = Komprimearje…
MenuButtons--publish--error-while-compressing = Flater by it komprimearjen. Probearje guon seleksjefakjes út te skeakeljen om de profylgrutte te ferlytsjen.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Netwurken filterje:
    .title = Allinnich netwurkfersiken toane dy’t oerienkomme mei in bepaalde namme

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

PanelSearch--search-field-hint = Wisten jo dat jo de komma (,) brûke kinne om mei ferskate termen te sykjen?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = De profylnamme bewurkje
ProfileName--edit-profile-name-input =
    .title = De profylnamme bewurkje
    .aria-label = Profylnamme

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Fuortsmite
    .title = Klik hjir om it profyl { $smallProfileName } fuort te smiten

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Der is in flater bard by it fuortsmiten fan dit profyl. <a>Wiis mei jo mûs oan foar mear ynfo.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = { $profileName } fuortsmite
ProfileDeletePanel--dialog-confirmation-question =
    Binne jo wis dat jo de opladen gegevens foar dit profyl fuortsmite wolle? Earder
    dielde keppelingen sille net mear wurkje.
ProfileDeletePanel--dialog-cancel-button =
    .value = Annulearje
ProfileDeletePanel--dialog-delete-button =
    .value = Fuortsmite
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Fuortsmite…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = De opladen gegevens binne mei sukses fuortsmiten.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Folslein berik ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Profyl ymportearje en ferwurkje…
ProfileLoaderAnimation--loading-unpublished = Profyl streekrjocht fan { -firefox-brand-name } út ymportearje…
ProfileLoaderAnimation--loading-from-file = It bestân lêze en it profyl ferwurkje…
ProfileLoaderAnimation--loading-local = Noch net ymplemintearre.
ProfileLoaderAnimation--loading-public = It profyl downloade en ferwurkje…
ProfileLoaderAnimation--loading-from-url = It profyl downloade en ferwurkje…
ProfileLoaderAnimation--loading-compare = Profilen lêze en ferwurkje…
ProfileLoaderAnimation--loading-view-not-found = Werjefte net fûn

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Tebek nei startside

## Root

Root--error-boundary-message =
    .message = Oh-oh, der is in ûnbekende flater op profiler.firefox.com bard.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Tapasse…
ServiceWorkerManager--pending-button = Tapasse en opnij lade
ServiceWorkerManager--installed-button = De tapassing opnij lade
ServiceWorkerManager--updated-while-not-ready =
    Der is in nije ferzje fan de tapassing tapast eardat dizze side
    folslein laden wie. Jo kinne fersteuringen sjen.
ServiceWorkerManager--new-version-is-ready = In nije ferzje fan de tapassing is download en is klear foar gebrûk.
ServiceWorkerManager--hide-notice-button =
    .title = Melding opnij lade ferstopje
    .aria-label = Melding opnij lade ferstopje

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Alle frames
    .title = De stackframes net filterje
StackSettings--implementation-script = Script
    .title = Allinnich de stackframes relatearre oan scriptútfiering toane
StackSettings--implementation-native2 = Ynboud
    .title = Allinnich de stackframes foar ynboude koade toane
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Stacks filterje:
StackSettings--use-data-source-label = Gegevensboarne:
StackSettings--call-tree-strategy-timing = Timings
    .title = Gearfetting oer de tiid mei gebrûk fan bemeunstere stacks fan útfierde koade
StackSettings--call-tree-strategy-js-allocations = JavaScript-allokaasjes
    .title = Gearfetting mei gebrûk fan allokearre bytes JavaScript (gjin de-allokaasjes)
StackSettings--call-tree-strategy-native-retained-allocations = Behâlden ûnthâld
    .title = Gearfetting mei gebrûk fan bytes ûnthâld dy’t allokearre en nea frijmakke binne yn de aktuele foarbyldseleksje
StackSettings--call-tree-native-allocations = Allokearre ûnthâld
    .title = Gearfetting mei gebrûk fan allokearre bytes ûnthâld
StackSettings--call-tree-strategy-native-deallocations-memory = De-allokearre ûnthâld
    .title = Gearfetting mei gebrûk fan bytes de-allokearte ûnthâld, per website wêroan it ûnthâld allokearre wie
StackSettings--call-tree-strategy-native-deallocations-sites = De-allokaasje fan websites
    .title = Gearfetting oan de hân fan de de-allokearre bytes ûnthâldromte, per website wêrfan de ûnthâldromte de-allokearre wie.
StackSettings--invert-call-stack = Oanropstack omkeare
    .title = Sortearje op de tiid dy’t yn in oanropnode bestege wurdt, wêrby ûnderlizzende nodes negearre wurde
StackSettings--show-user-timing = Brûkerstiming toane
StackSettings--use-stack-chart-same-widths = Foar elke stack deselde breedte brûke
StackSettings--panel-search =
    .label = Stacks filterje:
    .title = Allinnich stacks toane dy’t in funksje befetsje wêrfan de namme oerienkomt mei dizze substring

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Oanropstruktuer
TabBar--flame-graph-tab = Flamgrafyk
TabBar--stack-chart-tab = Stackdiagram
TabBar--marker-chart-tab = Markearingsdiagram
TabBar--marker-table-tab = Markearingstabel
TabBar--network-tab = Netwurk
TabBar--js-tracer-tab = JS-tracer

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Alle ljepblêden en finsters

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Allinnich dit proses toane
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Allinnich ‘{ $trackName }’ toane
TrackContextMenu--hide-other-screenshots-tracks = Oare skermôfdruktracks ferstopje
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = ‘{ $trackName }’ ferstopje
TrackContextMenu--show-all-tracks = Alle tracks toane
TrackContextMenu--show-local-tracks-in-process = Alle tracks yn dit proses toane
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Alle tracks fan it type ‘{ $type }’ ferstopje
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Alle oerienkommende tracks toane
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Alle oerienkommende tracks ferstopje
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Gjin resultaten fûn foar ‘<span>{ $searchFilter }</span>’
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Track ferstopje
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Proses ferstopje

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = relatyf ûnthâld op dit stuit
TrackMemoryGraph--memory-range-in-graph = ûnthâldberik yn grafyk
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = tawizingen en fuortsmiten tawizingen sûnt de foarige stekproef

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
    .label = Fermogen
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Fermogen
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Fermogen
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Gemiddeld fermogen yn de aktuele seleksje
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Gemiddeld fermogen yn de aktuele seleksje
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Gemiddeld fermogen yn de aktuele seleksje
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Enerzjy brûkt yn it sichtbere gebied
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Enerzjy brûkt yn it sichtbere berik
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Enerzjy brûkt yn it sichtbere berik
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Enerzjy brûkt yn it sichtbere berik
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Enerzjy brûkt yn de aktuele seleksje
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Enerzjy brûkt yn de aktuele seleksje
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Enerzjy brûkt yn de aktuele seleksje
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Enerzjy brûkt yn de aktuele seleksje

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
TrackBandwidthGraph--speed = { $value } per sekonde
    .label = Oersetsnelheid foar dizze opname
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = lês/skriuw-útfieringen sûnt de lêste opname
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Oersette gegevens oant no ta
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Oersette gegevens yn it sichtbere berik
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Oersette gegevens yn de aktuele seleksje

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Fier filtertermen yn
    .title = Allinnich tracks toane dy’t oerienkomme mei in bepaalde tekst

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
TransformNavigator--complete = Folsleine ‘{ $item }’
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Ynklappe: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Node fokusje: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Fokusje: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Fokuskategory: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Node gearfoegje: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Gearfoegje: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Droppe: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Rekursy ynklappe: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Allinnich direkte rekursy ynklappe: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Subtree ynklappe: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Samples bûten markearringen oerienkommend mei ‘{ $item }’ bûten beskôging litte

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Wachtsje op { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Wachtsje op { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Boarnekoade net beskikber
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Sjoch <a>issue #3741</a> foar stipjende senario's en plande ferbetteringen.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Gearstallingskoade net beskikber
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Sjoch <a>issue #4520</a> foar stipjende senario's en plande ferbetteringen.
SourceView--close-button =
    .title = Boarnewerjefte slute

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Der is gjin bekende cross-origin-tagonklike URL foar dit bestân.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Der is in netwurkflater bard by it opheljen fan de URL { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Kin de symbolisearrings-API fan de browser net opfreegje: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = De symbolisearrings-API fan de browser hat in flater weromstjoerd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = De symbolisearrings-API fan de lokale symboalserver hat in flater weromstjoerd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = De symbolisearrings-API fan de browser hat in skansearre antwurd weromstjoerd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = De symbolisearrings-API fan de lokale symboalserver hat in skansearre antwurd weromstjoerd: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = It bestân { $pathInArchive } is net fûn yn it argyf fan { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = It argyf op { $url } koe net ferwurke wurde: { $parsingErrorMessage }

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = De gearstallingswerjefte toane
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = De gearstallingswerjefte ferstopje

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Opladen opnamen
