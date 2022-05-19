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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> – <subheader>Web-app foar prestaasjeanalyse fan { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Nei ús Git-repository (dizze wurdt yn in nij finster iepene)

## AppViewRouter
## This is used for displaying errors when loading the application.

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
CallNodeContextMenu--transform-collapse-direct-recursion = Direkte rekursy ynklappe
    .title =
        As jo direkte rekursy ynklappe, wurde alle oanroppen dy’t hieltyd wer nei
        deselde funksje tebekfalle fuortsmiten.
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

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Rintiid (ms)
    .title =
        De ‘totale’ rintiid befettet in gearfetting fan alle tiid wêryn dizze
        funksje harren op de stack wie. Dit omfettet de tiid wêryn de
        funksje wurklik útfierd waard en de tiid dy’t spandearre waard
        oan oanroppen fan dizze funksje út.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/


## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.


## Footer Links


## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.


## Home page


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


## Source code view in a box at the bottom of the UI.


## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

