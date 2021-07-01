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

AppViewRouter--error-message-unpublished =
    .message = Kan het profiel niet ophalen van { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Kan het bestand niet lezen of het profiel erin ontleden.
AppViewRouter--error-message-local =
    .message = Nog niet geïmplementeerd.
AppViewRouter--error-message-public =
    .message = Kan het profiel niet downloaden.
AppViewRouter--error-message-from-url =
    .message = Kan het profiel niet downloaden.
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

## CallTree
## This is the component for Call Tree panel.


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


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


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

