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

AppViewRouter--error-message-public =
    .message = Δεν ήταν δυνατή η λήψη του προφίλ.
AppViewRouter--error-message-from-url =
    .message = Δεν ήταν δυνατή η λήψη του προφίλ.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.


## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Προφίλ 1:
CompareHome--form-label-profile2 = Προφίλ 2:
CompareHome--submit-button =
    .value = Ανάκτηση προφίλ

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.


## Footer Links

FooterLinks--legal = Νομικά
FooterLinks--Privacy = Απόρρητο
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Τύπος γραφήματος:
FullTimeline--categories-with-cpu = Κατηγορίες με CPU
FullTimeline--categories = Κατηγορίες

## Home page

Home--load-from-url-submit-button =
    .value = Φόρτωση
Home--documentation-button = Τεκμηρίωση
Home--addon-button = Εγκατάσταση προσθέτου
Home--additional-content-title = Φόρτωση υπαρχόντων προφίλ

## IdleSearchField
## The component that is used for all the search inputs in the application.


## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

ListOfPublishedProfiles--uploaded-profile-information-list-empty = Δεν έχει μεταφορτωθεί ακόμη κανένα προφίλ!

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Έναρξη επιλογής εδώ
MarkerContextMenu--end-selection-here = Διακοπή επιλογής εδώ
MarkerContextMenu--copy-description = Αντιγραφή περιγραφής
MarkerContextMenu--copy-url = Αντιγραφή URL

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Έναρξη
MarkerTable--duration = Διάρκεια
MarkerTable--type = Τύπος
MarkerTable--description = Περιγραφή

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Πληροφορίες προφίλ
MenuButtons--index--full-view = Πλήρης προβολή
MenuButtons--index--cancel-upload = Ακύρωση μεταφόρτωσης
MenuButtons--index--docs = Έγγραφα

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-actions = Διαγραφή
MenuButtons--index--metaInfo-subtitle = Πληροφορίες προφίλ
MenuButtons--metaInfo--symbols = Σύμβολα:
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } φυσικός πυρήνας
       *[other] { $physicalCPUs } φυσικοί πυρήνες
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } λογικός πυρήνας
       *[other] { $logicalCPUs } λογικοί πυρήνες
    }
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } δευτερόλεπτο
       *[other] { $configurationDuration } δευτερόλεπτα
    }
MenuButtons--metaInfo--application = Εφαρμογή
MenuButtons--metaInfo--name-and-version = Όνομα και έκδοση:
MenuButtons--metaInfo--update-channel = Κανάλι ενημερώσεων:
MenuButtons--metaInfo--build-id = ID δομής:
MenuButtons--metaInfo--build-type = Τύπος δομής:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Έλεγχος σφαλμάτων

##

MenuButtons--metaInfo--platform = Πλατφόρμα
MenuButtons--metaInfo--device = Συσκευή:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ΛΣ:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Επεκτάσεις:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.


## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--button-upload = Μεταφόρτωση
MenuButtons--publish--upload-title = Μεταφόρτωση προφίλ…
MenuButtons--publish--cancel-upload = Ακύρωση μεταφόρτωσης
MenuButtons--publish--message-try-again = Δοκιμή ξανά
MenuButtons--publish--download = Λήψη
MenuButtons--publish--compressing = Συμπίεση…

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Πλήρες εύρος

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Η προβολή δεν βρέθηκε

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Πίσω στην αρχική

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Εγκατάσταση…
ServiceWorkerManager--installed-button = Επαναφόρτωση εφαρμογής

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-javascript = JavaScript

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Δέντρο κλήσεων
TabBar--network-tab = Δίκτυο

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Απόκρυψη του “{ $trackName }”

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

