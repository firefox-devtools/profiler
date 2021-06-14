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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Web app for { -firefox-brand-name } performance analysis</subheader>
AppHeader--github-icon =
    .title = Go to our Git repository (this opens in a new window)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Couldn’t retrieve the profile from { -firefox-brand-name }.

AppViewRouter--error-message-from-file =
    .message = Couldn’t read the file or parse the profile in it.

AppViewRouter--error-message-local =
    .message = Not implemented yet.

AppViewRouter--error-message-public =
    .message = Could not download the profile.

AppViewRouter--error-message-from-url =
    .message = Could not download the profile.

AppViewRouter--route-not-found--home =
    .specialMessage = The URL you tried to reach was not recognized.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Merge function
    .title =
        Merging a function removes it from the profile, and assigns its time to the
        function that called it. This happens anywhere the function was called in
        the tree.
CallNodeContextMenu--transform-merge-call-node = Merge node only
    .title =
        Merging a node removes it from the profile, and assigns its time to the
        function’s node that called it. It only removes the function from that
        specific part of the tree. Any other places the function was called from
        will remain in the profile.

# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Focusing on a function will remove any sample that does not include that
    function. In addition, it re-roots the call tree so that the function
    is the only root of the tree. This can combine multiple function call sites
    across a profile into one call node.
CallNodeContextMenu--transform-focus-function = Focus on function
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focus on function (inverted)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Focus on subtree only
    .title =
        Focusing on a subtree will remove any sample that does not include that
        specific part of the call tree. It pulls out a branch of the call tree,
        however it only does it for that single call node. All other calls
        of the function are ignored.
CallNodeContextMenu--transform-collapse-function-subtree = Collapse function
    .title =
        Collapsing a function will remove everything it called, and assign
        all of the time to the function. This can help simplify a profile that
        calls into code that does not need to be analyzed.

# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource =
    Collapse <strong>{ $nameForResource }</strong>
    .title =
        Collapsing a resource will flatten out all the calls to that
        resource into a single collapsed call node.
CallNodeContextMenu--transform-collapse-direct-recursion = Collapse direct recursion
    .title =
        Collapsing direct recursion removes calls that repeatedly recurse into
        the same function.
CallNodeContextMenu--transform-drop-function = Drop samples with this function
    .title =
        Dropping samples removes their time from the profile. This is useful to
        eliminate timing information that is not relevant for the analysis.

CallNodeContextMenu--expand-all = Expand all

# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Look up the function name on Searchfox
CallNodeContextMenu--copy-function-name = Copy function name
CallNodeContextMenu--copy-script-url = Copy script URL
CallNodeContextMenu--copy-stack = Copy stack


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Select a node to display some information about it.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Enter the profile URLs that you’d like to compare
CompareHome--instruction-content =
    The tool will extract the data from the selected track and range for
    each profile, and put them both on the same view to make them easy to
    compare.

CompareHome--form-label-profile1 = Profile 1:
CompareHome--form-label-profile2 = Profile 2:
CompareHome--submit-button =
    .value = Retrieve profiles

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        This profile was recorded in a build without release optimizations.
        Performance observations might not apply to the release population.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Open the sidebar
Details--close-sidebar-button =
    .title = Close the sidebar
Details--error-boundary-message =
    .message = Uh oh, some unknown error happened in this panel.

## Footer Links

FooterLinks--legal = Legal
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Graph type:
FullTimeline--categories-with-cpu = Categories with CPU
FullTimeline--categories = Categories
FullTimeline--stack-height = Stack height

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible =
    <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tracks visible

## Home page

Home--upload-from-file-input-button = Load a profile from file
Home--upload-from-url-button = Load a profile from a URL
Home--load-from-url-submit-button =
    .value = Load

Home--documentation-button = Documentation
Home--menu-button = Enable { -profiler-brand-name } Menu Button
Home--menu-button-instructions =
    Enable the profiler menu button to start recording a performance
    profile in { -firefox-brand-name }, then analyze it and share it with profiler.firefox.com.

Home--addon-button = Install add-on
Home--addon-button-instructions =
    Install the Gecko Profiler Add-on to start recording a performance
    profile in { -firefox-brand-name }, then analyze it and share it with profiler.firefox.com.

Home--record-instructions =
    To start profiling, click on the profiling button, or use the
    keyboard shortcuts. The icon is blue when a profile is recording.
    Hit <kbd>Capture</kbd> to load the data into profiler.firefox.com.

Home--instructions-title = How to view and record profiles
Home--instructions-content =
    Recording performance profiles requires <a>{ -firefox-brand-name }</a>.
    However, existing profiles can be viewed in any modern browser.

Home--record-instructions-start-stop = Stop and start profiling
Home--record-instructions-capture-load = Capture and load profile
Home--profiler-motto = Capture a performance profile. Analyze it. Share it. Make the web faster.
Home--additional-content-title = Load existing profiles
Home--additional-content-content = You can <strong>drag and drop</strong> a profile file here to load it, or:
Home--compare-recordings-info = You can also compare recordings. <a>Open the comparing interface.</a>
Home--recent-uploaded-recordings-title = Recent uploaded recordings

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Enter filter terms

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Show only self time
    .title = Show only the time spent in a call node, ignoring its children.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Click here to load profile { $smallProfileName }

ListOfPublishedProfiles--published-profiles-delete-button-disabled = Delete
    .title = This profile cannot be deleted because we lack the authorization information.

ListOfPublishedProfiles--uploaded-profile-information-list-empty = No profile has been uploaded yet!

# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = See and manage all your recordings ({ $profilesRestCount } more)

# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Manage this recording
       *[other] Manage these recordings
    }


## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Set selection from marker’s duration
MarkerContextMenu--start-selection-here = Start selection here
MarkerContextMenu--end-selection-here = End selection here
MarkerContextMenu--start-selection-at-marker-start =
    Start selection at marker’s <strong>start</strong>
MarkerContextMenu--start-selection-at-marker-end =
    Start selection at marker’s <strong>end</strong>
MarkerContextMenu--end-selection-at-marker-start =
    End selection at marker’s <strong>start</strong>
MarkerContextMenu--end-selection-at-marker-end =
    End selection at marker’s <strong>end</strong>
MarkerContextMenu--copy-description = Copy description
MarkerContextMenu--copy-call-stack = Copy call stack
MarkerContextMenu--copy-url = Copy URL
MarkerContextMenu--copy-full-payload = Copy full payload

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filter Markers:
    .title = Only display markers that match a certain name


## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profile Info

MenuButtons--index--full-view = Full View
MenuButtons--index--cancel-upload = Cancel Upload
MenuButtons--index--share-upload =
    .label = Upload Local Profile

MenuButtons--index--share-re-upload =
    .label = Re-upload

MenuButtons--index--share-error-uploading =
    .label = Error uploading

MenuButtons--index--revert = Revert to Original Profile
MenuButtons--index--docs = Docs

MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Uploaded:
MenuButtons--index--profile-info-uploaded-actions = Delete
MenuButtons--index--metaInfo-subtitle = Profile Information
MenuButtons--metaInfo--symbols = Symbols:
MenuButtons--metaInfo--profile-symbolicated = Profile is symbolicated
MenuButtons--metaInfo--profile-not-symbolicated = Profile is not symbolicated
MenuButtons--metaInfo--resymbolicate-profile = Re-symbolicate profile
MenuButtons--metaInfo--symbolicate-profile = Symbolicate profile
MenuButtons--metaInfo--attempting-resymbolicate = Attempting to re-symbolicate profile
MenuButtons--metaInfo--currently-symbolicating = Currently symbolicating profile
MenuButtons--metaInfo--cpu = CPU:

# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } physical core
       *[other] { $physicalCPUs } physical cores
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } logical core
       *[other] { $logicalCPUs } logical cores
    }

# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } physical core
       *[other] { $physicalCPUs } physical cores
    }

# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } logical core
       *[other] { $logicalCPUs } logical cores
    }

MenuButtons--metaInfo--recording-started = Recording started:
MenuButtons--metaInfo--interval = Interval:
MenuButtons--metaInfo--profile-version = Profile Version:
MenuButtons--metaInfo--buffer-capacity = Buffer Capacity:
MenuButtons--metaInfo--buffer-duration = Buffer Duration:

# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } second
       *[other] { $configurationDuration } seconds
    }

# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Unlimited
MenuButtons--metaInfo--application = Application
MenuButtons--metaInfo--name-and-version = Name and version:
MenuButtons--metaInfo--update-channel = Update Channel:
MenuButtons--metaInfo--build-id = Build ID:
MenuButtons--metaInfo--build-type = Build Type:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Platform
MenuButtons--metaInfo--device = Device:

# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:

# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Visual Metrics
MenuButtons--metaInfo--speed-index = Speed Index:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual Speed Index:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful Speed Index:

MenuButtons--metaInfo-renderRowOfList-label-features = Features:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Threads Filter:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensions:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = { -profiler-brand-short-name } Overhead
MenuButtons--metaOverheadStatistics-mean = Mean
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
    .title = Time to sample all threads.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Cleaning
    .title = Time to discard expired data.
MenuButtons--metaOverheadStatistics-statkeys-counter = Counter
    .title = Time to gather all counters.
MenuButtons--metaOverheadStatistics-statkeys-interval = Interval
    .title = Observed interval between two samples.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Lockings
    .title = Time to acquire the lock before sampling.
MenuButtons--metaOverheadStatistics-overhead-duration = Overhead Durations:
MenuButtons--metaOverheadStatistics-overhead-percentage = Overhead Percentage:
MenuButtons--metaOverheadStatistics-profiled-duration = Profiled Duration:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Include hidden threads
MenuButtons--publish--renderCheckbox-label-hidden-time = Include hidden time range
MenuButtons--publish--renderCheckbox-label-include-screenshots = Include screenshots
MenuButtons--publish--renderCheckbox-label-resource = Include resource URLs and paths
MenuButtons--publish--renderCheckbox-label-extension = Include extension information
MenuButtons--publish--renderCheckbox-label-preference = Include preference values
MenuButtons--publish--reupload-performance-profile = Re-upload Performance Profile
MenuButtons--publish--share-performance-profile = Share Performance Profile
MenuButtons--publish--info-description = Upload your profile and make it accessible to anyone with the link.
MenuButtons--publish--info-description-default = By default, your personal data is removed.
MenuButtons--publish--info-description-firefox-nightly = This profile is from { -firefox-nightly-brand-name }, so by default all information is included.
MenuButtons--publish--include-additional-data = Include additional data that may be identifiable
MenuButtons--publish--button-upload = Upload
MenuButtons--publish--upload-title = Uploading profile…
MenuButtons--publish--cancel-upload = Cancel Upload
MenuButtons--publish--message-something-went-wrong = Uh oh, something went wrong when uploading the profile.
MenuButtons--publish--message-try-again = Try again
MenuButtons--publish--download = Download
MenuButtons--publish--compressing = Compressing…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filter Networks:
    .title = Only display network requests that match a certain name

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint =
    Did you know you can use the comma (,) to search using several terms?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Delete
    .title = Click here to delete the profile { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Full Range

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Importing the profile directly from { -firefox-brand-name }…

ProfileLoaderAnimation--loading-message-from-file =
    .message = Reading the file and processing the profile…

ProfileLoaderAnimation--loading-message-local =
    .message = Not implemented yet.

ProfileLoaderAnimation--loading-message-public =
    .message = Downloading and processing the profile…

ProfileLoaderAnimation--loading-message-from-url =
    .message = Downloading and processing the profile…

ProfileLoaderAnimation--loading-message-compare =
    .message = Reading and processing profiles…

ProfileLoaderAnimation--loading-message-view-not-found =
    .message = View not found

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Back to home

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installing…
ServiceWorkerManager--pending-button = Apply and reload
ServiceWorkerManager--installed-button = Reload the application
ServiceWorkerManager--updated-while-not-ready =
    A new version of the application was applied before this page
    was fully loaded. You might see malfunctions.
ServiceWorkerManager--new-version-is-ready =
    A new version of the application has been downloaded and is ready to use.
ServiceWorkerManager--hide-notice-button =
    .title = Hide the reload notice
    .aria-label = Hide the reload notice

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = All stacks
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Native

StackSettings--use-data-source-label = Data source:
StackSettings--call-tree-strategy-timing = Timings
    .title = Summarize using sampled stacks of executed code over time
StackSettings--call-tree-strategy-js-allocations = JavaScript Allocations
    .title = Summarize using bytes of JavaScript allocated (no de-allocations)
StackSettings--call-tree-strategy-native-retained-allocations = Retained Memory
    .title = Summarize using bytes of memory that were allocated, and never freed in the current preview selection
StackSettings--call-tree-native-allocations = Allocated Memory
    .title = Summarize using bytes of memory allocated
StackSettings--call-tree-strategy-native-deallocations-memory = Deallocated Memory
    .title = Summarize using bytes of memory deallocated, by the site where the memory was allocated
StackSettings--call-tree-strategy-native-deallocations-sites = Deallocation Sites
    .title = Summarize using bytes of memory deallocated, by the site where the memory was deallocated

StackSettings--invert-call-stack = Invert call stack
    .title = Sort by the time spent in a call node, ignoring its children.
StackSettings--show-user-timing = Show user timing

StackSettings--panel-search =
    .label = Filter stacks:
    .title = Only display stacks which contain a function whose name matches this substring

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Call Tree
TabBar--flame-graph-tab = Flame Graph
TabBar--stack-chart-tab = Stack Chart
TabBar--marker-chart-tab = Marker Chart
TabBar--marker-table-tab = Marker Table
TabBar--network-tab = Network
TabBar--js-tracer-tab = JS Tracer

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Only show this process group

# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Only show “{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = Hide other Screenshots tracks

# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Hide “{ $trackName }”
TrackContextMenu--show-all-tracks = Show all tracks

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Uploaded Recordings
