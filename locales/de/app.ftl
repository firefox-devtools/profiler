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

