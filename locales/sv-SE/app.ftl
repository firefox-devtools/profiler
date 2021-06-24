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


## AppViewRouter
## This is used for displaying errors when loading the application.

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

CallNodeContextMenu--expand-all = Expandera alla
CallNodeContextMenu--copy-function-name = Kopiera funktionsnamn
CallNodeContextMenu--copy-script-url = Kopiera skript-URL
CallNodeContextMenu--copy-stack = Kopiera stack

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

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

MenuButtons--metaInfo--build-type-debug = Felsök

##

MenuButtons--metaInfo--device = Enhet:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo-renderRowOfList-label-features = Funktioner:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Tillägg:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--message-try-again = Försök igen
MenuButtons--publish--download = Hämta
MenuButtons--publish--compressing = Komprimerar...

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation


## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.


## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-javascript = JavaScript

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

