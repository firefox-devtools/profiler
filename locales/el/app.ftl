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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Διαδικτυακή εφαρμογή για την ανάλυση των επιδόσεων του { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Μετάβαση στο αποθετήριο Git μας (ανοίγει σε νέο παράθυρο)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Δεν ήταν δυνατή η ανάκτηση του προφίλ από το { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Δεν ήταν δυνατή η ανάγνωση του αρχείου ή η ανάλυση του προφίλ σε αυτό.
AppViewRouter--error-message-local =
    .message = Δεν έχει υλοποιηθεί ακόμη.
AppViewRouter--error-message-public =
    .message = Δεν ήταν δυνατή η λήψη του προφίλ.
AppViewRouter--error-message-from-url =
    .message = Δεν ήταν δυνατή η λήψη του προφίλ.
AppViewRouter--route-not-found--home =
    .specialMessage = Δεν αναγνωρίστηκε το URL που προσπαθήσατε να μεταβείτε.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--expand-all = Ανάπτυξη όλων
CallNodeContextMenu--copy-script-url = Αντιγραφή URL σεναρίου
CallNodeContextMenu--copy-stack = Αντιγραφή στοίβας

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Εισαγάγετε τα URL των προφίλ που θέλετε να συγκρίνετε
CompareHome--instruction-content =
    Το εργαλείο θα εξαγάγει τα δεδομένα από το επιλεγμένο κομμάτι και εύρος για
    κάθε προφίλ και θα τα τοποθετήσει στην ίδια προβολή για ευκολότερη
    σύγκριση.
CompareHome--form-label-profile1 = Προφίλ 1:
CompareHome--form-label-profile2 = Προφίλ 2:
CompareHome--submit-button =
    .value = Ανάκτηση προφίλ

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Το προφίλ καταγράφηκε σε έκδοση χωρίς βελτιστοποιήσεις κανονικής κυκλοφορίας.
        Οι παρατηρήσεις επιδόσεων ενδέχεται να μην ισχύουν για τους χρήστες της κανονικής έκδοσης.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Άνοιγμα πλευρικής στήλης
Details--close-sidebar-button =
    .title = Κλείσιμο πλευρικής στήλης
Details--error-boundary-message =
    .message = Ωχ, προέκυψε άγνωστο σφάλμα σε αυτόν τον πίνακα.

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
FullTimeline--stack-height = Ύψος στοίβας
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> ορατά κομμάτια

## Home page

Home--upload-from-file-input-button = Φόρτωση προφίλ από αρχείο
Home--upload-from-url-button = Φόρτωση προφίλ από URL
Home--load-from-url-submit-button =
    .value = Φόρτωση
Home--documentation-button = Τεκμηρίωση
Home--menu-button = Ενεργοποίηση κουμπιού μενού του { -profiler-brand-name }
Home--addon-button = Εγκατάσταση προσθέτου
Home--instructions-title = Τρόπος προβολής και καταγραφής προφίλ
Home--instructions-content =
    Η καταγραφή των προφίλ επιδόσεων απαιτεί το <a>{ -firefox-brand-name }</a>.
    Ωστόσο, τα υπάρχοντα προφίλ μπορούν να προβληθούν σε όλα τα σύγχρονα προγράμματα περιήγησης.
Home--record-instructions-start-stop = Διακοπή και έναρξη δημιουργίας προφίλ
Home--record-instructions-capture-load = Καταγραφή και φόρτωση προφίλ
Home--profiler-motto = Καταγράψτε ένα προφίλ επιδόσεων. Αναλύστε το. Μοιραστείτε το. Κάντε ταχύτερο τον ιστό.
Home--additional-content-title = Φόρτωση υπαρχόντων προφίλ
Home--additional-content-content = Μπορείτε να <strong>σύρετε και να εναποθέσετε</strong> ένα αρχείο προφίλ εδώ για φόρτωση, ή:
Home--compare-recordings-info = Μπορείτε επίσης να συγκρίνετε καταγραφές. <a>Άνοιγμα περιβάλλοντος σύγκρισης.</a>
Home--recent-uploaded-recordings-title = Πρόσφατα μεταφορτωμένες καταγραφές

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Εισαγάγετε όρους φίλτρου

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Κάντε κλικ εδώ για φόρτωση του προφίλ { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Διαγραφή
    .title = Δεν είναι δυνατή η διαγραφή αυτού του προφίλ επειδή μας λείπουν πληροφορίες εξουσιοδότησης.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Δεν έχει μεταφορτωθεί ακόμη κανένα προφίλ!
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Προβολή και διαχείριση όλων των καταγραφών σας ({ $profilesRestCount } ακόμη)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Διαχείριση καταγραφής
       *[other] Διαχείριση καταγραφών
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Ορισμός επιλογής από τη διάρκεια δείκτη
MarkerContextMenu--start-selection-here = Έναρξη επιλογής εδώ
MarkerContextMenu--end-selection-here = Διακοπή επιλογής εδώ
MarkerContextMenu--start-selection-at-marker-start = Έναρξη επιλογής στην <strong>αρχή</strong> του δείκτη
MarkerContextMenu--start-selection-at-marker-end = Έναρξη επιλογής στο <strong>τέλος</strong> του δείκτη
MarkerContextMenu--end-selection-at-marker-start = Διακοπή επιλογής στην <strong>αρχή</strong> του δείκτη
MarkerContextMenu--end-selection-at-marker-end = Διακοπή επιλογής στο <strong>τέλος</strong> του δείκτη
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
MenuButtons--index--share-upload =
    .label = Μεταφόρτωση τοπικού προφίλ
MenuButtons--index--share-re-upload =
    .label = Νέα μεταφόρτωση
MenuButtons--index--share-error-uploading =
    .label = Σφάλμα μεταφόρτωσης
MenuButtons--index--revert = Επιστροφή στο αρχικό προφίλ
MenuButtons--index--docs = Έγγραφα
MenuButtons--permalink--button =
    .label = Μόνιμος σύνδεσμος

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-actions = Διαγραφή
MenuButtons--index--metaInfo-subtitle = Πληροφορίες προφίλ
MenuButtons--metaInfo--symbols = Σύμβολα:
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } φυσικός πυρήνας
       *[other] { $physicalCPUs } φυσικοί πυρήνες
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } λογικός πυρήνας
       *[other] { $logicalCPUs } λογικοί πυρήνες
    }
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
MenuButtons--metaInfo--recording-started = Έναρξη καταγραφής:
MenuButtons--metaInfo--interval = Διάστημα:
MenuButtons--metaInfo--profile-version = Έκδοση προφίλ:
MenuButtons--metaInfo--buffer-capacity = Χωρητικότητα buffer:
MenuButtons--metaInfo--buffer-duration = Διάρκεια buffer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } δευτερόλεπτο
       *[other] { $configurationDuration } δευτερόλεπτα
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Απεριόριστη
MenuButtons--metaInfo--application = Εφαρμογή
MenuButtons--metaInfo--name-and-version = Όνομα και έκδοση:
MenuButtons--metaInfo--update-channel = Κανάλι ενημερώσεων:
MenuButtons--metaInfo--build-id = ID δομής:
MenuButtons--metaInfo--build-type = Τύπος δομής:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Πλατφόρμα
MenuButtons--metaInfo--device = Συσκευή:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ΛΣ:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--speed-index = Δείκτης ταχύτητας:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Δείκτης "Perceptual Speed":
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Δείκτης "Contentful Speed":
MenuButtons--metaInfo-renderRowOfList-label-features = Λειτουργίες:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Επεκτάσεις:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.


## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-include-screenshots = Συμπερίληψη στιγμιότυπων οθόνης
MenuButtons--publish--renderCheckbox-label-resource = Συμπερίληψη URL και διαδρομών πόρων
MenuButtons--publish--renderCheckbox-label-extension = Συμπερίληψη πληροφοριών επέκτασης
MenuButtons--publish--renderCheckbox-label-preference = Συμπερίληψη τιμών προτιμήσεων
MenuButtons--publish--reupload-performance-profile = Νέα μεταφόρτωση προφίλ επιδόσεων
MenuButtons--publish--share-performance-profile = Κοινή χρήση προφίλ επιδόσεων
MenuButtons--publish--info-description-default = Από προεπιλογή, αφαιρούνται τα προσωπικά σας δεδομένα.
MenuButtons--publish--info-description-firefox-nightly = Αυτό το προφίλ είναι από το { -firefox-nightly-brand-name }, επομένως συμπεριλαμβάνονται όλες οι πληροφορίες από προεπιλογή.
MenuButtons--publish--button-upload = Μεταφόρτωση
MenuButtons--publish--upload-title = Μεταφόρτωση προφίλ…
MenuButtons--publish--cancel-upload = Ακύρωση μεταφόρτωσης
MenuButtons--publish--message-try-again = Δοκιμή ξανά
MenuButtons--publish--download = Λήψη
MenuButtons--publish--compressing = Συμπίεση…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Φιλτράρισμα δικτύων:
    .title = Προβολή μόνο των αιτημάτων δικτύου που ταιριάζουν με συγκεκριμένο όνομα

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Ξέρατε ότι μπορείτε να χρησιμοποιήσετε το κόμμα (,) για αναζήτηση με πολλαπλούς όρους;

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Διαγραφή
    .title = Κάντε κλικ εδώ για να διαγράψετε το προφίλ { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Πλήρες εύρος

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Εισαγωγή προφίλ απευθείας από το { -firefox-brand-name }…
ProfileLoaderAnimation--loading-message-from-file =
    .message = Ανάγνωση αρχείου και επεξεργασία προφίλ…
ProfileLoaderAnimation--loading-message-local =
    .message = Δεν έχει υλοποιηθεί ακόμη.
ProfileLoaderAnimation--loading-message-public =
    .message = Λήψη και επεξεργασία προφίλ…
ProfileLoaderAnimation--loading-message-from-url =
    .message = Λήψη και επεξεργασία προφίλ…
ProfileLoaderAnimation--loading-message-compare =
    .message = Ανάγνωση και επεξεργασία προφίλ…
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Η προβολή δεν βρέθηκε

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Πίσω στην αρχική

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Εγκατάσταση…
ServiceWorkerManager--pending-button = Εφαρμογή και επαναφόρτωση
ServiceWorkerManager--installed-button = Επαναφόρτωση εφαρμογής
ServiceWorkerManager--new-version-is-ready = Έγινε λήψη μιας νέας έκδοσης της εφαρμογής και είναι έτοιμη για χρήση.

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Όλες οι στοίβες
StackSettings--implementation-javascript = JavaScript
StackSettings--use-data-source-label = Πηγή δεδομένων:

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Δέντρο κλήσεων
TabBar--stack-chart-tab = Διάγραμμα στοιβών
TabBar--marker-chart-tab = Διάγραμμα δεικτών
TabBar--marker-table-tab = Πίνακας δεικτών
TabBar--network-tab = Δίκτυο

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Εμφάνιση μόνο του “{ $trackName }”
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

# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Σύμπτυξη: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Εστίαση: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Συγχώνευση: { $item }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Μεταφορτωμένες καταγραφές
